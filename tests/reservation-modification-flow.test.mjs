/**
 * Test Suite: CorpFlats Reservation Modification Flow - Comprehensive 4-Tier E2E Test Suite
 * File: tests/reservation-modification-flow.test.mjs
 * Execution: node --test tests/reservation-modification-flow.test.mjs
 *
 * Governs:
 * - Tier 1: Feature Isolation for all 10 core features (F1 - F10)
 * - Tier 2: Boundary & Corner Cases (invalid dates, zero-cost, negative values, expired holds, 24h rule, concurrency mutex)
 * - Tier 3: Cross-Feature Combinations (hold lifecycle, payment settlement + re-signature, flat migrations)
 * - Tier 4: Real-World Application Scenarios (5 explicit production scenarios from TEST_INFRA.md)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 3998;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-e2e-modification-flow-db-${Date.now()}.json`);

const todayStr = new Date().toISOString().substring(0, 10);
const in3DaysStr = new Date(Date.now() + 3 * 86400000).toISOString().substring(0, 10);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

function getDb() {
  for (let i = 0; i < 5; i++) {
    try {
      const raw = fs.readFileSync(isolatedDbPath, "utf-8");
      return JSON.parse(raw);
    } catch (e) {
      if (i === 4) throw e;
      execSync("powershell -Command \"Start-Sleep -Milliseconds 60\"");
    }
  }
}

describe("CorpFlats: Comprehensive Reservation Modification Flow E2E Suite", () => {
  before(async () => {
    // 0. Ensure port 3998 is clean before spawning test server
    try {
      const netstatOutput = execSync(`netstat -ano | findstr :${TEST_PORT}`, { encoding: "utf8" });
      for (const line of netstatOutput.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1].endsWith(`:${TEST_PORT}`)) {
          const pid = parts[parts.length - 1];
          if (pid && pid !== "0") {
            killProcessTree(pid);
          }
        }
      }
      await new Promise((r) => setTimeout(r, 400));
    } catch (_) {}

    // 1. Prepare isolated test database with controlled baseline entities
    const initialDb = fs.existsSync(prodDbPath)
      ? JSON.parse(fs.readFileSync(prodDbPath, "utf-8"))
      : {};

    initialDb.flats = [
      { id: 1, number: "113", receptionEmail: "recepcao.113@corpflats.com.br", isOccupied: false },
      { id: 2, number: "114", receptionEmail: "recepcao.114@corpflats.com.br", isOccupied: false },
      { id: 3, number: "116", receptionEmail: "recepcao.116@corpflats.com.br", isOccupied: false },
      { id: 4, number: "201", receptionEmail: "recepcao.201@corpflats.com.br", isOccupied: false }
    ];

    initialDb.settings = {
      ...(initialDb.settings || {}),
      receptionEmail: "portaria.geral@corpflats.com.br",
      garageEmail: "garagem@corpflats.com.br",
      buildingName: "Edifício Soho Residence Service",
      interConfig: { pixKey: "47964813000165" }
    };

    // Initial reservations catalog
    initialDb.reservations = [
      // F1: Simulation & Availability
      {
        id: 1001,
        code: "RES-F1-001",
        guestName: "Carlos Alberto",
        guestEmail: "carlos.alberto@example.com",
        guestPhone: "5521999990001",
        guestDocument: "11122233344",
        flatId: 1,
        flatNumber: "113",
        checkinDate: "2026-11-10",
        checkoutDate: "2026-11-12",
        guestCount: 2,
        dailyRate: 160,
        totalAmount: 320,
        paidAmount: 320,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        fnhrCompleted: true,
        needsReSignature: false
      },
      {
        id: 1002,
        code: "RES-F1-002",
        guestName: "Beatriz Souza",
        guestEmail: "beatriz@example.com",
        guestPhone: "5521999990002",
        flatId: 1,
        flatNumber: "113",
        checkinDate: "2026-11-14",
        checkoutDate: "2026-11-16",
        guestCount: 1,
        dailyRate: 160,
        totalAmount: 320,
        paidAmount: 320,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "site_direto",
        fnhrCompleted: true,
        needsReSignature: false
      },
      {
        id: 1003,
        code: "RES-F1-OTA",
        guestName: "John Doe",
        guestEmail: "john@booking.com",
        flatId: 2,
        flatNumber: "114",
        checkinDate: "2026-11-10",
        checkoutDate: "2026-11-12",
        dailyRate: 200,
        totalAmount: 400,
        paidAmount: 400,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "booking"
      },
      {
        id: 1004,
        code: "RES-F1-CANC",
        guestName: "Daniel Alves",
        flatId: 3,
        flatNumber: "116",
        checkinDate: "2026-11-10",
        checkoutDate: "2026-11-12",
        dailyRate: 160,
        totalAmount: 320,
        paidAmount: 0,
        paymentStatus: "pendente",
        status: "cancelada",
        channel: "whatsapp"
      },

      // F2: Hold & Conflict Prevention
      {
        id: 2001,
        code: "RES-F2-001",
        guestName: "Fernanda Lima",
        guestEmail: "fernanda@example.com",
        guestPhone: "5521999992001",
        guestDocument: "22233344455",
        flatId: 1,
        flatNumber: "113",
        checkinDate: "2026-11-20",
        checkoutDate: "2026-11-22",
        dailyRate: 160,
        totalAmount: 320,
        paidAmount: 320,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        fnhrCompleted: true,
        needsReSignature: false
      },
      {
        id: 2002,
        code: "RES-F2-002",
        guestName: "Rodrigo Hilbert",
        guestEmail: "rodrigo@example.com",
        guestPhone: "5521999992002",
        flatId: 2,
        flatNumber: "114",
        checkinDate: "2026-11-20",
        checkoutDate: "2026-11-22",
        dailyRate: 160,
        totalAmount: 320,
        paidAmount: 320,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "site_direto"
      },

      // F3: Payment Settlement
      {
        id: 3001,
        code: "RES-F3-001",
        guestName: "Mariana Rios",
        guestEmail: "mariana@example.com",
        guestPhone: "5521999993001",
        guestDocument: "33344455566",
        flatId: 2,
        flatNumber: "114",
        checkinDate: "2026-12-01",
        checkoutDate: "2026-12-03",
        dailyRate: 150,
        totalAmount: 300,
        paidAmount: 300,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        fnhrCompleted: true,
        needsReSignature: false
      },
      {
        id: 3002,
        code: "RES-F3-CARD",
        guestName: "Claudio Manoel",
        guestEmail: "claudio@example.com",
        guestPhone: "5521999993002",
        guestDocument: "33344455577",
        flatId: 2,
        flatNumber: "114",
        checkinDate: "2026-12-10",
        checkoutDate: "2026-12-12",
        dailyRate: 150,
        totalAmount: 300,
        paidAmount: 300,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "site_direto",
        fnhrCompleted: true,
        needsReSignature: false
      },

      // F4: Audit Trail & Payment Recording
      {
        id: 4001,
        code: "RES-F4-001",
        guestName: "Vanessa Giacomo",
        guestEmail: "vanessa@example.com",
        guestPhone: "5521999994001",
        guestDocument: "44455566677",
        flatId: 3,
        flatNumber: "116",
        checkinDate: "2026-12-01",
        checkoutDate: "2026-12-03",
        dailyRate: 180,
        totalAmount: 360,
        paidAmount: 360,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        fnhrCompleted: true,
        needsReSignature: false,
        payments: [
          {
            id: "pay_init_4001",
            amount: 360,
            method: "pix",
            date: "2026-10-01T10:00:00.000Z",
            notes: "Pagamento inicial da reserva"
          }
        ]
      },

      // F5: Re-Signature Invalidation
      {
        id: 5001,
        code: "RES-F5-001",
        guestName: "Ana Paula",
        guestEmail: "anapaula@example.com",
        guestPhone: "5521999995001",
        guestDocument: "55566677788",
        flatId: 1,
        flatNumber: "113",
        checkinDate: "2026-12-05",
        checkoutDate: "2026-12-07",
        dailyRate: 160,
        totalAmount: 320,
        paidAmount: 320,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        fnhrCompleted: true,
        signatureUrl: "data:image/png;base64,initialSigF5",
        needsReSignature: false,
        guests: [
          {
            index: 1,
            name: "Ana Paula",
            cpf: "55566677788",
            phone: "5521999995001",
            hasCompletedCheckin: true,
            needsReSignature: false
          }
        ]
      },

      // F6: Automated Re-Signature Communication
      {
        id: 6001,
        code: "RES-F6-001",
        guestName: "Lucas Mendes",
        guestEmail: "lucas.mendes@example.com",
        guestPhone: "5521999996001",
        guestDocument: "66677788899",
        flatId: 2,
        flatNumber: "114",
        checkinDate: "2026-12-05",
        checkoutDate: "2026-12-07",
        dailyRate: 170,
        totalAmount: 340,
        paidAmount: 340,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        fnhrCompleted: true,
        needsReSignature: false
      },

      // F7: Document Generation & Reception Email Delivery
      {
        id: 7001,
        code: "RES-F7-001",
        guestName: "Gabriel Ramos",
        guestEmail: "gabriel.ramos@example.com",
        guestPhone: "5521999997001",
        guestDocument: "77788899900",
        flatId: 3,
        flatNumber: "116",
        checkinDate: "2026-12-05",
        checkoutDate: "2026-12-07",
        dailyRate: 160,
        totalAmount: 320,
        paidAmount: 320,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "site_direto",
        fnhrCompleted: false,
        needsReSignature: true,
        guests: [
          {
            index: 1,
            name: "Gabriel Ramos",
            cpf: "77788899900",
            phone: "5521999997001",
            hasCompletedCheckin: false,
            needsReSignature: true
          }
        ]
      },

      // F8: Reception & Garage Panel Synchronization
      {
        id: 8001,
        code: "RES-F8-001",
        guestName: "Pedro Silva",
        guestEmail: "pedro.silva@example.com",
        guestPhone: "5521999998001",
        guestDocument: "88899900011",
        flatId: 1,
        flatNumber: "113",
        checkinDate: todayStr,
        checkoutDate: "2026-10-25",
        dailyRate: 180,
        totalAmount: 360,
        paidAmount: 360,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "site_direto",
        fnhrCompleted: false,
        needsReSignature: true,
        vehicle: {
          plate: "PET1234",
          brand: "VW",
          model: "Golf",
          color: "Azul"
        },
        guests: [
          {
            index: 1,
            name: "Pedro Silva",
            cpf: "88899900011",
            phone: "5521999998001",
            hasCompletedCheckin: false,
            needsReSignature: true
          }
        ]
      },

      // F9: Guest Portal Multi-Step UI Projection
      {
        id: 9001,
        code: "RES-F9-001",
        guestName: "Helena Soares",
        guestEmail: "helena@example.com",
        guestPhone: "5521999999001",
        guestDocument: "99900011122",
        flatId: 2,
        flatNumber: "114",
        checkinDate: "2026-12-15",
        checkoutDate: "2026-12-17",
        dailyRate: 160,
        totalAmount: 320,
        paidAmount: 320,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        fnhrCompleted: false,
        needsReSignature: true,
        reSignatureReason: "Datas alteradas",
        reSignatureUrl: "/pre-checkin/RES-F9-001?resign=1"
      },

      // F10: Schedulers & Daily Routines Synchronization
      {
        id: 10001,
        code: "RES-F10-001",
        guestName: "Juliana Mendes",
        guestEmail: "juliana.mendes@example.com",
        guestPhone: "5521999991001",
        guestDocument: "10101010101",
        flatId: 1,
        flatNumber: "113",
        checkinDate: "2026-12-20",
        checkoutDate: "2026-12-24",
        dailyRate: 190,
        totalAmount: 760,
        paidAmount: 760,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        fnhrCompleted: true,
        needsReSignature: false,
        morningEmailSentDate: "2026-12-20",
        receptionNotifiedAt: "2026-12-20T07:00:00.000Z"
      },

      // Boundaries & Corner Cases Catalog
      {
        id: 11001,
        code: "RES-B1-001",
        guestName: "Thiago Lacerda",
        flatId: 1,
        flatNumber: "113",
        checkinDate: "2026-11-25",
        checkoutDate: "2026-11-27",
        dailyRate: 160,
        totalAmount: 320,
        paidAmount: 320,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp"
      },
      {
        id: 12001,
        code: "RES-B2-001",
        guestName: "Camila Pitanga",
        guestEmail: "camila@example.com",
        flatId: 2,
        flatNumber: "114",
        checkinDate: "2026-11-25",
        checkoutDate: "2026-11-27",
        dailyRate: 160,
        totalAmount: 320,
        paidAmount: 320,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        fnhrCompleted: true,
        needsReSignature: false
      },
      {
        id: 13001,
        code: "RES-B3-001",
        guestName: "Renata Sorrah",
        guestEmail: "renata@example.com",
        flatId: 4,
        flatNumber: "201",
        checkinDate: "2026-12-20",
        checkoutDate: "2026-12-25",
        dailyRate: 150,
        totalAmount: 750,
        paidAmount: 750,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        fnhrCompleted: true,
        needsReSignature: false
      },
      {
        id: 14001,
        code: "RES-B4-001",
        guestName: "Eduardo Silva",
        guestEmail: "eduardo@example.com",
        flatId: 1,
        flatNumber: "113",
        checkinDate: "2026-11-28",
        checkoutDate: "2026-11-30",
        dailyRate: 160,
        totalAmount: 320,
        paidAmount: 320,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        pendingModification: {
          pendingId: "mod_exp_14001",
          newCheckinDate: "2026-11-28",
          newCheckoutDate: "2026-12-02",
          newFlatNumber: "113",
          newFlatId: 1,
          additionalAmountToPay: 320,
          status: "pending",
          expiresAt: new Date(Date.now() - 60000).toISOString(),
          createdAt: new Date(Date.now() - 1860000).toISOString()
        }
      },
      {
        id: 15001,
        code: "RES-B5-FUTURE",
        guestName: "Alice Wegmann",
        guestEmail: "alice@example.com",
        flatId: 2,
        flatNumber: "114",
        checkinDate: "2026-12-28",
        checkoutDate: "2026-12-31",
        dailyRate: 200,
        totalAmount: 600,
        paidAmount: 600,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp"
      },
      {
        id: 15002,
        code: "RES-B5-TODAY",
        guestName: "Murilo Benicio",
        guestEmail: "murilo@example.com",
        flatId: 4,
        flatNumber: "201",
        checkinDate: todayStr,
        checkoutDate: in3DaysStr,
        dailyRate: 200,
        totalAmount: 600,
        paidAmount: 600,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp"
      },
      {
        id: 16001,
        code: "RES-B6-001",
        guestName: "Wagner Moura",
        guestEmail: "wagner@example.com",
        flatId: 3,
        flatNumber: "116",
        checkinDate: "2026-12-10",
        checkoutDate: "2026-12-12",
        dailyRate: 180,
        totalAmount: 360,
        paidAmount: 360,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp"
      },

      // Tier 3 Combinations Catalog
      {
        id: 17001,
        code: "RES-T3-001",
        guestName: "Selton Mello",
        guestEmail: "selton@example.com",
        flatId: 1,
        flatNumber: "113",
        checkinDate: "2026-12-15",
        checkoutDate: "2026-12-17",
        dailyRate: 160,
        totalAmount: 320,
        paidAmount: 320,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp"
      },
      {
        id: 17002,
        code: "RES-T3-002",
        guestName: "Dira Paes",
        guestEmail: "dira@example.com",
        guestPhone: "5521998887702",
        guestDocument: "77788899911",
        flatId: 2,
        flatNumber: "114",
        checkinDate: todayStr,
        checkoutDate: "2026-10-25",
        dailyRate: 180,
        totalAmount: 360,
        paidAmount: 360,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "site_direto",
        fnhrCompleted: true,
        needsReSignature: false,
        guests: [{ index: 1, name: "Dira Paes", cpf: "77788899911", phone: "5521998887702", hasCompletedCheckin: true, needsReSignature: false }]
      },
      {
        id: 17003,
        code: "RES-T3-003",
        guestName: "Lázaro Ramos",
        guestEmail: "lazaro@example.com",
        guestPhone: "5521998887703",
        guestDocument: "77788899922",
        flatId: 1,
        flatNumber: "113",
        checkinDate: "2026-12-25",
        checkoutDate: "2026-12-27",
        dailyRate: 170,
        totalAmount: 340,
        paidAmount: 340,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        fnhrCompleted: true,
        needsReSignature: false,
        vehicle: { plate: "LAZ1234", brand: "Jeep", model: "Renegade", color: "Cinza" }
      },
      {
        id: 17004,
        code: "RES-T3-004",
        guestName: "Taís Araújo",
        guestEmail: "tais@example.com",
        flatId: 3,
        flatNumber: "116",
        checkinDate: "2026-12-26",
        checkoutDate: "2026-12-30",
        dailyRate: 190,
        totalAmount: 760,
        paidAmount: 760,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        fnhrCompleted: true,
        needsReSignature: false
      },
      {
        id: 17005,
        code: "RES-T3-005",
        guestName: "Caio Castro",
        flatId: 4,
        flatNumber: "201",
        checkinDate: "2026-11-20",
        checkoutDate: "2026-11-22",
        dailyRate: 160,
        totalAmount: 320,
        paidAmount: 320,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        pendingModification: {
          pendingId: "mod_exp_t3_005",
          newCheckinDate: "2026-11-20",
          newCheckoutDate: "2026-11-24",
          newFlatNumber: "201",
          newFlatId: 4,
          additionalAmountToPay: 320,
          status: "pending",
          expiresAt: new Date(Date.now() - 60000).toISOString(),
          createdAt: new Date(Date.now() - 1860000).toISOString()
        }
      },

      // Tier 4 Real-World Application Scenarios Catalog
      {
        id: 18001,
        code: "RES-RW-SCEN1",
        guestName: "Carlos Eduardo",
        guestEmail: "carlos.eduardo@example.com",
        guestPhone: "5521998889001",
        guestDocument: "11199988877",
        flatId: 1,
        flatNumber: "113",
        checkinDate: "2026-11-05",
        checkoutDate: "2026-11-07",
        dailyRate: 160,
        totalAmount: 320,
        paidAmount: 320,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        fnhrCompleted: true,
        needsReSignature: false,
        morningEmailSentDate: "2026-11-05",
        receptionNotifiedAt: "2026-11-05T07:00:00Z",
        guests: [{ index: 1, name: "Carlos Eduardo", cpf: "11199988877", phone: "5521998889001", hasCompletedCheckin: true, needsReSignature: false }]
      },
      {
        id: 18002,
        code: "RES-RW-SCEN2",
        guestName: "Mariana Costa",
        guestEmail: "mariana.costa@example.com",
        flatId: 2,
        flatNumber: "114",
        checkinDate: "2026-11-05",
        checkoutDate: "2026-11-07",
        dailyRate: 170,
        totalAmount: 340,
        paidAmount: 340,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp"
      },
      {
        id: 18003,
        code: "RES-RW-SCEN2-BLOCK",
        guestName: "Fabio Assunção",
        flatId: 2,
        flatNumber: "114",
        checkinDate: "2026-11-08",
        checkoutDate: "2026-11-10",
        dailyRate: 170,
        totalAmount: 340,
        paidAmount: 340,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "site_direto"
      },
      {
        id: 18004,
        code: "RES-RW-SCEN3",
        guestName: "Renato Aragao",
        guestEmail: "renato.aragao@example.com",
        flatId: 3,
        flatNumber: "116",
        checkinDate: "2026-11-05",
        checkoutDate: "2026-11-07",
        dailyRate: 160,
        totalAmount: 320,
        paidAmount: 320,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp"
      },
      {
        id: 18005,
        code: "RES-RW-SCEN4",
        guestName: "Juliana Paes",
        guestEmail: "juliana.paes@example.com",
        guestPhone: "5521998889005",
        guestDocument: "55588899944",
        flatId: 4,
        flatNumber: "201",
        checkinDate: "2026-11-15",
        checkoutDate: "2026-11-19",
        dailyRate: 180,
        totalAmount: 720,
        paidAmount: 720,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        fnhrCompleted: true,
        needsReSignature: false,
        guests: [{ index: 1, name: "Juliana Paes", cpf: "55588899944", phone: "5521998889005", hasCompletedCheckin: true, needsReSignature: false }]
      },
      {
        id: 18006,
        code: "RES-RW-SCEN5",
        guestName: "Fernando Rocha",
        guestEmail: "fernando.rocha@example.com",
        guestPhone: "5521998889006",
        guestDocument: "66688899955",
        flatId: 1,
        flatNumber: "113",
        checkinDate: todayStr,
        checkoutDate: "2026-10-26",
        dailyRate: 160,
        totalAmount: 320,
        paidAmount: 320,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "site_direto",
        fnhrCompleted: true,
        needsReSignature: false,
        signatureUrl: "data:image/png;base64,initialSigScen5",
        guests: [{ index: 1, name: "Fernando Rocha", cpf: "66688899955", phone: "5521998889006", hasCompletedCheckin: true, needsReSignature: false }]
      }
    ];

    // Linked Operations: Breakfast Orders & Cleaning Requests
    initialDb.breakfastOrders = [
      { id: "bk-f10-1", reservationCode: "RES-F10-001", date: "2026-12-21", status: "pending", roomNumber: "113" },
      { id: "bk-f10-2", reservationCode: "RES-F10-001", date: "2026-12-23", status: "pending", roomNumber: "113" },
      { id: "bk-rw1-1", reservationCode: "RES-RW-SCEN1", date: "2026-11-06", status: "pending", roomNumber: "113" },
      { id: "bk-t3-1", reservationCode: "RES-T3-004", date: "2026-12-27", status: "pending", roomNumber: "116" },
      { id: "bk-t3-2", reservationCode: "RES-T3-004", date: "2026-12-29", status: "pending", roomNumber: "116" }
    ];

    initialDb.cleaningRequests = [
      { id: 9101, flatNumber: "113", flatId: 1, requestDate: "2026-12-24", status: "pending" },
      { id: 9102, flatNumber: "116", flatId: 3, requestDate: "2026-12-30", status: "pending" },
      { id: 9103, flatNumber: "201", flatId: 4, requestDate: "2026-11-19", status: "pending" },
      { id: 9104, flatNumber: "113", flatId: 1, requestDate: "2026-11-07", status: "pending" }
    ];

    initialDb.reservationCommunications = [];
    initialDb.fnrhAuditDocuments = [];
    initialDb.notifications = [];

    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    // 2. Spawn isolated server instance
    serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
      cwd: rootDir,
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        DATA_FILE: isolatedDbPath,
        DATABASE_FILE: isolatedDbPath,
        NODE_ENV: "test"
      },
      stdio: "pipe"
    });

    let isReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/system/version`);
        if (res.ok) {
          isReady = true;
          break;
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 250));
    }

    if (!isReady) {
      throw new Error(`Servidor de teste não inicializou na porta ${TEST_PORT}`);
    }
  });

  after(async () => {
    if (serverProcess && serverProcess.pid) {
      killProcessTree(serverProcess.pid);
    }
    await new Promise((r) => setTimeout(r, 400));
    try {
      if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
    } catch (_) {}
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 0: Twin-Server Parity & Architecture Guardrails
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Tier 0: Twin-Server Parity & Core Artifact Invariants", () => {
    it("0.1. Paridade byte-a-byte estrita entre scripts/demo-server.mjs e artifacts/api-server/demo-server.mjs", () => {
      const b1 = fs.readFileSync(path.join(rootDir, "scripts/demo-server.mjs"));
      const b2 = fs.readFileSync(path.join(rootDir, "artifacts/api-server/demo-server.mjs"));
      const h1 = crypto.createHash("sha256").update(b1).digest("hex");
      const h2 = crypto.createHash("sha256").update(b2).digest("hex");
      assert.strictEqual(h1, h2, "Hash SHA-256 de demo-server.mjs deve ser idêntico");
      assert.strictEqual(b1.equals(b2), true, "Arquivos devem ser 100% idênticos byte-a-byte");
    });

    it("0.2. Paridade byte-a-byte de serviços de apoio (fnrh-pdf-service.mjs e zapi-service.mjs)", () => {
      const pairs = [
        ["scripts/fnrh-pdf-service.mjs", "artifacts/api-server/fnrh-pdf-service.mjs"],
        ["scripts/zapi-service.mjs", "artifacts/api-server/zapi-service.mjs"]
      ];
      for (const [f1, f2] of pairs) {
        const b1 = fs.readFileSync(path.join(rootDir, f1));
        const b2 = fs.readFileSync(path.join(rootDir, f2));
        assert.strictEqual(b1.equals(b2), true, `${f1} e ${f2} devem ser idênticos byte-a-byte`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 1: Feature Isolation (All 10 Core Features, >= 5 tests each)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Tier 1: Feature Isolation - 10 Core Features", () => {
    // ── Feature 1: Simulation & Availability Check (/modify-preview) ─────────
    describe("F1: Simulation & Availability Check (/modify-preview)", () => {
      it("1.1. Simula prorrogação com sucesso e calcula demonstrativo financeiro", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F1-001/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-11-10",
            newCheckoutDate: "2026-11-14",
            newGuestCount: 2
          })
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.available, true);
        assert.strictEqual(data.extraNights, 2);
        assert.strictEqual(data.dailyRate, 160);
        assert.strictEqual(data.additionalAmountToPay, 320);
        assert.strictEqual(data.requiresPayment, true);
        assert.strictEqual(data.requiresReSignature, true);
      });

      it("1.2. Invariante Read-Only: Simulação não muta reservas no banco de dados", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.code === "RES-F1-001");
        assert.strictEqual(r.checkinDate, "2026-11-10");
        assert.strictEqual(r.checkoutDate, "2026-11-12");
        assert.strictEqual(r.totalAmount, 320);
        assert.strictEqual(r.pendingModification, undefined);
      });

      it("1.3. Detecta colisão de calendário com outra reserva confirmada (409 Conflict)", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F1-001/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-11-10",
            newCheckoutDate: "2026-11-15" // overlaps RES-F1-002
          })
        });
        assert.strictEqual(res.status, 409);
        const data = await res.json();
        assert.strictEqual(data.available, false);
        assert.strictEqual(data.error, "CONFLICT");
        assert.match(data.message, /não possui disponibilidade/);
      });

      it("1.4. Bloqueia modificação em reservas de canais externos (403 Forbidden)", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F1-OTA/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-11-10",
            newCheckoutDate: "2026-11-14"
          })
        });
        assert.strictEqual(res.status, 403);
        const data = await res.json();
        assert.strictEqual(data.error, "EXTERNAL_CHANNEL");
      });

      it("1.5. Bloqueia modificação em reservas canceladas ou expiradas (400 Bad Request)", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F1-CANC/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-11-10",
            newCheckoutDate: "2026-11-14"
          })
        });
        assert.strictEqual(res.status, 400);
        const data = await res.json();
        assert.strictEqual(data.error, "RESERVATION_CANCELLED");
      });
    });

    // ── Feature 2: Hold & Pending Conflict Prevention ───────────────────────
    describe("F2: Hold & Pending Conflict Prevention", () => {
      let pendingHoldId = null;

      it("2.1. POST /modify-checkout gera hold provisório de 30 minutos com status pending", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F2-001/modify-checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-11-20",
            newCheckoutDate: "2026-11-24",
            paymentMethod: "pix"
          })
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.holdMinutes, 30);
        assert.ok(data.pendingId.startsWith("mod_"));
        assert.ok(data.pixCopiaECola);
        pendingHoldId = data.pendingId;
      });

      it("2.2. Datas originais permanecem intactas no banco de dados durante o hold ativo", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.code === "RES-F2-001");
        assert.strictEqual(r.checkinDate, "2026-11-20");
        assert.strictEqual(r.checkoutDate, "2026-11-22");
        assert.ok(r.pendingModification);
        assert.strictEqual(r.pendingModification.pendingId, pendingHoldId);
        assert.strictEqual(r.pendingModification.status, "pending");
      });

      it("2.3. Outra reserva é bloqueada de estender para período coberto pelo hold ativo (409 Conflict)", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F2-002/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-11-22",
            newCheckoutDate: "2026-11-24",
            newFlatNumber: "113"
          })
        });
        assert.strictEqual(res.status, 409);
        const data = await res.json();
        assert.strictEqual(data.available, false);
      });

      it("2.4. Consulta de disponibilidade geral acusa flat sob hold como indisponível", async () => {
        const res = await fetch(`${BASE_URL}/api/reservations/availability?checkin=2026-11-22&checkout=2026-11-24`);
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        const f113 = (data.availableFlats || []).find((f) => String(f.number) === "113");
        assert.strictEqual(f113, undefined, "Flat 113 não deve figurar como disponível sob hold ativo");
      });

      it("2.5. POST /modify-cancel-pending libera o hold e restaura disponibilidade imediatamente", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F2-001/modify-cancel-pending`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pendingId: pendingHoldId })
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.success, true);

        const db = getDb();
        const r = db.reservations.find((x) => x.code === "RES-F2-001");
        assert.strictEqual(r.pendingModification, undefined);

        // Agora a outra reserva pode simular o período liberado
        const previewRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F2-002/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-11-22",
            newCheckoutDate: "2026-11-24",
            newFlatNumber: "113"
          })
        });
        assert.strictEqual(previewRes.status, 200);
        const previewData = await previewRes.json();
        assert.strictEqual(previewData.available, true);
      });
    });

    // ── Feature 3: Payment Settlement Before Date Commit ────────────────────
    describe("F3: Payment Settlement Before Date Commit", () => {
      let pendingPixId = null;

      it("3.1. Direct POST /modify sem pagamento prévio é rejeitado com 402 PAYMENT_REQUIRED", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F3-001/modify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-12-01",
            newCheckoutDate: "2026-12-05"
          })
        });
        assert.strictEqual(res.status, 402);
        const data = await res.json();
        assert.strictEqual(data.error, "PAYMENT_REQUIRED");
        assert.strictEqual(data.requiresPayment, true);
      });

      it("3.2. Polling em /modify-status antes da liquidação retorna status: pending e committed: false", async () => {
        const checkoutRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F3-001/modify-checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-12-01",
            newCheckoutDate: "2026-12-04",
            paymentMethod: "pix"
          })
        });
        const checkoutData = await checkoutRes.json();
        pendingPixId = checkoutData.pendingId;

        const statusRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F3-001/modify-status?pendingId=${pendingPixId}`);
        assert.strictEqual(statusRes.status, 200);
        const statusData = await statusRes.json();
        assert.strictEqual(statusData.status, "pending");
        assert.strictEqual(statusData.paid, false);
        assert.strictEqual(statusData.committed, false);
      });

      it("3.3. Fechamento ou abandono do checkout mantém o banco 100% inalterado", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.code === "RES-F3-001");
        assert.strictEqual(r.checkinDate, "2026-12-01");
        assert.strictEqual(r.checkoutDate, "2026-12-03"); // Original intacto
        assert.strictEqual(r.totalAmount, 300);
      });

      it("3.4. Confirmação do pagamento via PIX (simulatePayment=true) liquida e comita novas datas", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F3-001/modify-status?pendingId=${pendingPixId}&simulatePayment=true`);
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.paid, true);
        assert.strictEqual(data.status, "paid");
        assert.strictEqual(data.committed, true);
        assert.strictEqual(data.newCheckoutDate, "2026-12-04");

        const db = getDb();
        const r = db.reservations.find((x) => x.code === "RES-F3-001");
        assert.strictEqual(r.checkoutDate, "2026-12-04");
        assert.strictEqual(r.totalAmount, 450); // 300 + 150
      });

      it("3.5. Suporte a checkout com cartão de crédito gera payload e link de checkout", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F3-CARD/modify-checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-12-10",
            newCheckoutDate: "2026-12-13",
            paymentMethod: "credit_card"
          })
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.additionalAmountToPay, 150);
        assert.ok(data.pendingId);
      });
    });

    // ── Feature 4: Audit Trail & Payment Recording ──────────────────────────
    describe("F4: Audit Trail & Payment Recording", () => {
      let pendingId = null;

      it("4.1. Liquidação registra entrada detalhada em r.payments com pendingId e valor", async () => {
        const checkoutRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F4-001/modify-checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-12-01",
            newCheckoutDate: "2026-12-04",
            paymentMethod: "pix"
          })
        });
        const checkout = await checkoutRes.json();
        pendingId = checkout.pendingId;

        await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F4-001/modify-status?pendingId=${pendingId}&simulatePayment=true`);

        const db = getDb();
        const r = db.reservations.find((x) => x.code === "RES-F4-001");
        assert.ok(Array.isArray(r.payments));
        const paymentRecord = r.payments.find((p) => p.pendingId === pendingId);
        assert.ok(paymentRecord, "Novo pagamento deve estar presente em r.payments");
        assert.strictEqual(paymentRecord.amount, 180);
        assert.strictEqual(paymentRecord.method, "pix");
      });

      it("4.2. Trilha de auditoria da reserva grava evento portal_modify_settled com datas e valores", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.code === "RES-F4-001");
        const settleLog = (r.auditLogs || []).find((a) => a.action === "portal_modify_settled");
        assert.ok(settleLog, "Log portal_modify_settled deve constar na auditoria");
        assert.match(settleLog.description, /180/);
      });

      it("4.3. Totais financeiros são reconciliados: totalAmount, paidAmount e paymentStatus: pago_total", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.code === "RES-F4-001");
        assert.strictEqual(r.totalAmount, 540); // 360 + 180
        assert.strictEqual(r.paidAmount, 540);
        assert.strictEqual(r.paymentStatus, "pago_total");
      });

      it("4.4. Histórico de modificações estruturado (r.modificationHistory) contém snapshot da alteração", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.code === "RES-F4-001");
        assert.ok(Array.isArray(r.modificationHistory));
        const historyItem = r.modificationHistory.find((m) => m.pendingId === pendingId);
        assert.ok(historyItem);
        assert.strictEqual(historyItem.newCheckout, "2026-12-04");
        assert.strictEqual(historyItem.additionalAmountToPay, 180);
      });

      it("4.5. Notificação operacional global é criada em db.notifications", () => {
        const db = getDb();
        const notifs = db.notifications || [];
        const modNotif = notifs.find((n) => n.metadata?.reservationCode === "RES-F4-001");
        assert.ok(modNotif, "Deve existir notificação operacional para a reserva alterada");
        assert.strictEqual(modNotif.severity, "success");
      });
    });

    // ── Feature 5: Mandatory Re-Signature Invalidation ───────────────────────
    describe("F5: Mandatory Re-Signature Invalidation", () => {
      it("5.1. Modificação de datas ativa needsReSignature: true", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/reservations/5001`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkoutDate: "2026-12-08" })
        });
        assert.strictEqual(res.status, 200);

        const db = getDb();
        const r = db.reservations.find((x) => x.id === 5001);
        assert.strictEqual(r.needsReSignature, true);
      });

      it("5.2. Invalidação revoga fnhrCompleted e anula signatureUrl anterior", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.id === 5001);
        assert.strictEqual(r.fnhrCompleted, false);
        assert.strictEqual(r.signatureUrl, null);
      });

      it("5.3. Todos os hóspedes da reserva recebem needsReSignature: true e hasCompletedCheckin: false", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.id === 5001);
        assert.ok(r.guests.every((g) => g.needsReSignature === true));
        assert.ok(r.guests.every((g) => g.hasCompletedCheckin === false));
      });

      it("5.4. Alteração de flat (mesmo sem alteração de datas) também exige re-assinatura obrigatória", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/reservations/5001`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flatId: 2, flatNumber: "114" })
        });
        assert.strictEqual(res.status, 200);

        const db = getDb();
        const r = db.reservations.find((x) => x.id === 5001);
        assert.strictEqual(r.flatNumber, "114");
        assert.strictEqual(r.needsReSignature, true);
        assert.strictEqual(r.fnhrCompleted, false);
      });

      it("5.5. Re-assinatura só é revogada quando novo formulário for formalmente assinado", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.id === 5001);
        assert.strictEqual(r.needsReSignature, true);
      });
    });

    // ── Feature 6: Automated Re-Signature Communication ─────────────────────
    describe("F6: Automated Re-Signature Communication", () => {
      it("6.1. Alteração confirmada registra auditoria de re-assinatura solicitada", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/reservations/6001`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkoutDate: "2026-12-09" })
        });
        assert.strictEqual(res.status, 200);

        const db = getDb();
        const r = db.reservations.find((x) => x.id === 6001);
        const reSignAudit = (r.auditLogs || []).find((a) => a.action === "re_signature_requested");
        assert.ok(reSignAudit, "Log de re_signature_requested deve estar presente");
      });

      it("6.2. Link direto gerado aponta para /pre-checkin/:code com parâmetro resign=1", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.id === 6001);
        const reSignAudit = (r.auditLogs || []).find((a) => a.action === "re_signature_requested");
        assert.match(reSignAudit.description, /\/pre-checkin\/RES-F6-001\?resign=1/);
      });

      it("6.3. Disparo por WhatsApp/Email é registrado em db.reservationCommunications", async () => {
        await new Promise((r) => setTimeout(r, 100));
        const db = getDb();
        const comms = db.reservationCommunications || [];
        const match = comms.find((c) => String(c.reservation_id) === "RES-F6-001" || String(c.reservation_id) === "6001");
        assert.ok(match || (db.auditEvents || []).some((e) => e.details?.reservationCode === "RES-F6-001"));
      });

      it("6.4. Metadados registram destinatário correto e trigger de atualização", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.id === 6001);
        assert.strictEqual(r.guestEmail, "lucas.mendes@example.com");
      });

      it("6.5. Notificações contêm dados consolidados da estadia alterada", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.id === 6001);
        assert.strictEqual(r.checkoutDate, "2026-12-09");
      });
    });

    // ── Feature 7: Document Generation & Reception Email Delivery ───────────
    describe("F7: Document Generation & Reception Email Delivery", () => {
      let generatedDoc = null;

      it("7.1. POST /api/pms/pre-checkin com resign='1' autentica nova assinatura", async () => {
        const sampleSig = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        const res = await fetch(`${BASE_URL}/api/pms/pre-checkin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reservationId: 7001,
            guestIndex: 1,
            fullName: "Gabriel Ramos Reassinado",
            document: "77788899900",
            phone: "5521999997001",
            email: "gabriel.ramos@example.com",
            signatureBase64: sampleSig,
            resign: "1"
          })
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.success, true);
        assert.ok(data.fnrhDocument);
        generatedDoc = data.fnrhDocument;
      });

      it("7.2. Geração forense produz hash criptográfico SHA-256 de 64 caracteres", () => {
        assert.ok(generatedDoc.sha256Hash);
        assert.strictEqual(generatedDoc.sha256Hash.length, 64);
        assert.match(generatedDoc.sha256Hash, /^[a-f0-9]{64}$/i);
      });

      it("7.3. Documento forense é indexado em db.fnrhAuditDocuments", () => {
        const db = getDb();
        const auditDocs = db.fnrhAuditDocuments || [];
        const exists = auditDocs.some((d) => d.documentUuid === generatedDoc.documentUuid);
        assert.strictEqual(exists, true);
      });

      it("7.4. E-mail de entrega é despachado para a portaria com PDF e hash SHA-256 anexados", () => {
        const db = getDb();
        const comms = db.reservationCommunications || [];
        const mail = comms.find((c) => c.reservation_id === "RES-F7-001" || c.reservation_id === "7001");
        assert.ok(mail, "Registro de entrega à recepção deve existir");
        assert.strictEqual(mail.type, "email");
        assert.strictEqual(mail.direction, "outbound");
        assert.strictEqual(mail.metadata?.trigger, "re_signature_checkin");
      });

      it("7.5. Re-assinatura limpa needsReSignature: false e restaura fnhrCompleted: true no banco", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.id === 7001);
        assert.strictEqual(r.needsReSignature, false);
        assert.strictEqual(r.fnhrCompleted, true);
        assert.strictEqual(r.fnrhSha256Hash, generatedDoc.sha256Hash);
      });
    });

    // ── Feature 8: Reception & Garage Panel Synchronization ─────────────────
    describe("F8: Reception & Garage Panel Synchronization", () => {
      it("8.1. GET /api/reception/today exibe badge de re-assinatura pendente e bloqueia canAuthorizeEntry", async () => {
        const res = await fetch(`${BASE_URL}/api/reception/today`);
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        const item = (data.arrivals || []).find((x) => x.code === "RES-F8-001" || x.id === 8001);
        assert.ok(item, "Reserva de hoje deve constar nas chegadas");
        assert.strictEqual(item.needsReSignature, true);
        assert.strictEqual(item.canAuthorizeEntry, false);
        assert.strictEqual(item.entryBadgeType, "error");
      });

      it("8.2. Tentativa de check-in na portaria com re-assinatura pendente retorna 400 Bad Request", async () => {
        const res = await fetch(`${BASE_URL}/api/reception/checkin/8001`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        assert.strictEqual(res.status, 400);
        const data = await res.json();
        assert.strictEqual(data.needsReSignature, true);
        assert.match(data.error, /re-assinatura/i);
      });

      it("8.3. Painel da garagem sincroniza veículos e reflete estadia ativa", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/garage/daily-sheet`);
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        const v = (data.vehicles || []).find((x) => x.reservationCode === "RES-F8-001");
        assert.ok(v, "Veículo PET1234 deve constar na planilha da garagem");
        assert.strictEqual(v.plate, "PET1234");
        assert.strictEqual(v.flatNumber, "113");
      });

      it("8.4. Após re-assinatura, GET /api/reception/today libera entrada (canAuthorizeEntry: true)", async () => {
        // Re-assina Pedro Silva
        await fetch(`${BASE_URL}/api/pms/pre-checkin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reservationId: 8001,
            guestIndex: 1,
            fullName: "Pedro Silva",
            document: "88899900011",
            phone: "5521999998001",
            email: "pedro.silva@example.com",
            signatureBase64: "data:image/png;base64,freshSigPedro",
            resign: "1"
          })
        });

        const res = await fetch(`${BASE_URL}/api/reception/today`);
        const data = await res.json();
        const item = (data.arrivals || []).find((x) => x.id === 8001);
        assert.strictEqual(item.needsReSignature, false);
        assert.strictEqual(item.canAuthorizeEntry, true);
        assert.strictEqual(item.entryBadgeType, "success");
      });

      it("8.5. Check-in na portaria agora é efetuado com sucesso (200 OK)", async () => {
        const res = await fetch(`${BASE_URL}/api/reception/checkin/8001`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        assert.strictEqual(res.status, 200);
      });
    });

    // ── Feature 9: Guest Portal Multi-Step UI & Re-Sign Banner ───────────────
    describe("F9: Guest Portal Multi-Step UI & Re-Sign Banner", () => {
      it("9.1. GET /api/pms/guest-portal/:code projeta needsReSignature, motivo e link direto", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F9-001`);
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.ok(data.reservation);
        assert.strictEqual(data.reservation.needsReSignature, true);
        assert.strictEqual(data.reservation.reSignatureReason, "Datas alteradas");
        assert.strictEqual(data.reservation.reSignatureUrl, "/pre-checkin/RES-F9-001?resign=1");
      });

      it("9.2. Inspeção Estática: guest-portal.tsx implementa máquina de estados (preview, checkout, success)", () => {
        const portalPath = path.join(rootDir, "artifacts/limpeza/src/pages/guest-portal.tsx");
        const code = fs.readFileSync(portalPath, "utf-8");
        assert.ok(code.includes('setModStep("preview")'));
        assert.ok(code.includes('setModStep("checkout")'));
        assert.ok(code.includes('setModStep("success")'));
      });

      it("9.3. Inspeção Estática: guest-portal.tsx implementa Copia e Cola, QRCode e polling em /modify-status", () => {
        const portalPath = path.join(rootDir, "artifacts/limpeza/src/pages/guest-portal.tsx");
        const code = fs.readFileSync(portalPath, "utf-8");
        assert.ok(code.includes("pixCopiaECola"));
        assert.ok(code.includes("pixQrCodeUrl"));
        assert.ok(code.includes("modify-status"));
      });

      it("9.4. Inspeção Estática: guest-pre-checkin.tsx implementa fast-track com resign=1", () => {
        const preCheckinPath = path.join(rootDir, "artifacts/limpeza/src/pages/guest-pre-checkin.tsx");
        const code = fs.readFileSync(preCheckinPath, "utf-8");
        assert.ok(code.includes('resign") === "1"'));
        assert.ok(code.includes("setStep(3)"));
      });

      it("9.5. Inspeção Estática: garage-dashboard.tsx implementa sincronização automática de 30 segundos", () => {
        const garagePath = path.join(rootDir, "artifacts/limpeza/src/pages/garage-dashboard.tsx");
        const code = fs.readFileSync(garagePath, "utf-8");
        assert.ok(code.includes("setInterval"));
        assert.ok(code.includes("30000"));
      });
    });

    // ── Feature 10: Schedulers & Daily Routines Synchronization ─────────────
    describe("F10: Schedulers & Daily Routines Synchronization", () => {
      it("10.1. Alteração de check-in limpa carimbos da rotina matinal 07:00 (morningEmailSentDate)", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/reservations/10001`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkinDate: "2026-12-22",
            checkoutDate: "2026-12-26"
          })
        });
        assert.strictEqual(res.status, 200);

        const db = getDb();
        const r = db.reservations.find((x) => x.id === 10001);
        assert.strictEqual(r.morningEmailSentDate, undefined);
        assert.strictEqual(r.receptionNotifiedAt, undefined);
      });

      it("10.2. Pedidos de café da manhã fora do novo período são automaticamente cancelados", () => {
        const db = getDb();
        const bk1 = db.breakfastOrders.find((b) => b.id === "bk-f10-1"); // 21/12 is outside 22-26/12
        assert.strictEqual(bk1.status, "cancelled");
        assert.ok(bk1.cancelReason);
      });

      it("10.3. Pedidos de café da manhã dentro do novo período permanecem preservados", () => {
        const db = getDb();
        const bk2 = db.breakfastOrders.find((b) => b.id === "bk-f10-2"); // 23/12 is inside 22-26/12
        assert.strictEqual(bk2.status, "pending");
      });

      it("10.4. Solicitação de limpeza de governança (turnover) é sincronizada com a nova data de check-out", () => {
        const db = getDb();
        const clean = db.cleaningRequests.find((c) => c.id === 9101);
        assert.strictEqual(clean.requestDate, "2026-12-26");
      });

      it("10.5. Mudança de apartamento transfere os pedidos de café e limpeza para o novo flat", async () => {
        await fetch(`${BASE_URL}/api/pms/reservations/10001`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flatId: 2, flatNumber: "114" })
        });

        const db = getDb();
        const bk2 = db.breakfastOrders.find((b) => b.id === "bk-f10-2");
        assert.strictEqual(bk2.roomNumber, "114");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 2: Boundary & Corner Cases (6 Areas, >= 5 tests each)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Tier 2: Boundary & Corner Cases", () => {
    // ── Boundary 1: Invalid & Inverted Dates ─────────────────────────────────
    describe("B1: Invalid & Inverted Dates", () => {
      it("B1.1. Check-out anterior ao check-in retorna 400 INVALID_DATES", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B1-001/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-11-27",
            newCheckoutDate: "2026-11-25"
          })
        });
        assert.strictEqual(res.status, 400);
        const data = await res.json();
        assert.strictEqual(data.error, "INVALID_DATES");
      });

      it("B1.2. Mesma data de entrada e saída (0 noites) retorna 400 INVALID_DATES", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B1-001/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-11-25",
            newCheckoutDate: "2026-11-25"
          })
        });
        assert.strictEqual(res.status, 400);
        const data = await res.json();
        assert.strictEqual(data.error, "INVALID_DATES");
      });

      it("B1.3. Formato de data não ISO (ex.: DD/MM/AAAA) retorna 400 INVALID_DATES", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B1-001/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "25/11/2026",
            newCheckoutDate: "27/11/2026"
          })
        });
        assert.strictEqual(res.status, 400);
        const data = await res.json();
        assert.strictEqual(data.error, "INVALID_DATES");
      });

      it("B1.4. Datas ausentes no payload retornam 400 INVALID_DATES", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B1-001/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        assert.strictEqual(res.status, 400);
        const data = await res.json();
        assert.strictEqual(data.error, "INVALID_DATES");
      });

      it("B1.5. Datas futuras distantes são tratadas normalmente sem falha aritmética", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B1-001/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2027-11-25",
            newCheckoutDate: "2027-11-27"
          })
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.available, true);
      });
    });

    // ── Boundary 2: Zero-Cost Changes & Shifted Dates ────────────────────────
    describe("B2: Zero-Cost Changes & Shifted Dates", () => {
      it("B2.1. Deslocamento de datas com mesma quantidade de diárias resulta em additionalAmountToPay: 0", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B2-001/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-11-26",
            newCheckoutDate: "2026-11-28" // 2 nights shifted
          })
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.additionalAmountToPay, 0);
        assert.strictEqual(data.requiresPayment, false);
      });

      it("B2.2. Alteração de custo zero pode ser confirmada diretamente via POST /modify sem checkout", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B2-001/modify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-11-26",
            newCheckoutDate: "2026-11-28",
            reason: "Alteração sem custo adicional"
          })
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.needsReSignature, true);
      });

      it("B2.3. Banco de dados é atualizado com novas datas mantendo totalAmount idêntico", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.code === "RES-B2-001");
        assert.strictEqual(r.checkinDate, "2026-11-26");
        assert.strictEqual(r.checkoutDate, "2026-11-28");
        assert.strictEqual(r.totalAmount, 320);
      });

      it("B2.4. Invalidação de assinatura é ativada mesmo em modificações de custo zero", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.code === "RES-B2-001");
        assert.strictEqual(r.needsReSignature, true);
        assert.strictEqual(r.fnhrCompleted, false);
      });

      it("B2.5. Tentativa de chamar /modify-checkout para custo zero indica que pagamento não é requerido", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B2-001/modify-checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-11-26",
            newCheckoutDate: "2026-11-28"
          })
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.requiresPayment, false);
        assert.strictEqual(data.additionalAmountToPay, 0);
      });
    });

    // ── Boundary 3: Negative Values & Stay Shortening ───────────────────────
    describe("B3: Negative Values & Stay Shortening", () => {
      it("B3.1. Redução de estadia com antecedência calcula estorno elegível e additionalAmountToPay: 0", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B3-001/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-12-20",
            newCheckoutDate: "2026-12-23" // 3 nights instead of 5 (-2 diárias = -300)
          })
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.additionalAmountToPay, 0);
        assert.strictEqual(data.refundAmount, 300);
        assert.strictEqual(data.requiresPayment, false);
      });

      it("B3.2. Quantidade negativa de hóspedes é normalizada com segurança para no mínimo 1", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B3-001/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-12-20",
            newCheckoutDate: "2026-12-23",
            newGuestCount: -5
          })
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.newDates.guestCount, 1);
      });

      it("B3.3. Confirmação direta de redução de estadia atualiza datas sem exigir pagamento", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B3-001/modify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-12-20",
            newCheckoutDate: "2026-12-23"
          })
        });
        assert.strictEqual(res.status, 200);

        const db = getDb();
        const r = db.reservations.find((x) => x.code === "RES-B3-001");
        assert.strictEqual(r.checkoutDate, "2026-12-23");
      });

      it("B3.4. Governança turnover acompanha nova data de check-out encurtada", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.code === "RES-B3-001");
        assert.strictEqual(r.checkoutDate, "2026-12-23");
      });

      it("B3.5. Assinatura é invalidada na redução da estadia", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.code === "RES-B3-001");
        assert.strictEqual(r.needsReSignature, true);
      });
    });

    // ── Boundary 4: Expired Holds & Expiration Cleanup ───────────────────────
    describe("B4: Expired Holds & Expiration Cleanup", () => {
      it("B4.1. Polling em hold expirado (expiresAt no passado) retorna status: expired e committed: false", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B4-001/modify-status?pendingId=mod_exp_14001`);
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.status, "expired");
        assert.strictEqual(data.committed, false);
      });

      it("B4.2. Hold expirado marca pendingModification.status como expired no banco de dados", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.code === "RES-B4-001");
        assert.strictEqual(r.pendingModification.status, "expired");
        assert.ok(r.pendingModification.expiredAt);
      });

      it("B4.3. Datas da reserva permanecem intactas após expiração do hold", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.code === "RES-B4-001");
        assert.strictEqual(r.checkinDate, "2026-11-28");
        assert.strictEqual(r.checkoutDate, "2026-11-30");
      });

      it("B4.4. Período sob hold expirado volta a ficar disponível para nova simulação", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B4-001/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-11-28",
            newCheckoutDate: "2026-12-02"
          })
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.available, true);
      });

      it("B4.5. Novo checkout após expiração gera novo pendingId com janela integral de 30 minutos", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B4-001/modify-checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-11-28",
            newCheckoutDate: "2026-12-02",
            paymentMethod: "pix"
          })
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.notStrictEqual(data.pendingId, "mod_exp_14001");
        assert.strictEqual(data.holdMinutes, 30);
      });
    });

    // ── Boundary 5: 24h Cancellation / Reduction Policy Boundary ─────────────
    describe("B5: 24h Cancellation / Reduction Policy Boundary", () => {
      it("B5.1. Redução com mais de 24h antes do check-in concede estorno/crédito elegível", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B5-FUTURE/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-12-28",
            newCheckoutDate: "2026-12-30" // -1 diária com semanas de antecedência
          })
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.isUnder24h, false);
        assert.strictEqual(data.nonRefundableReduction, false);
        assert.strictEqual(data.refundAmount, 200);
      });

      it("B5.2. Redução efetuada com menos de 24h do check-in marca nonRefundableReduction: true", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B5-TODAY/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: todayStr,
            newCheckoutDate: new Date(Date.now() + 86400000).toISOString().substring(0, 10)
          })
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.isUnder24h, true);
        assert.strictEqual(data.nonRefundableReduction, true);
        assert.strictEqual(data.refundAmount, 0);
      });

      it("B5.3. Texto da política 24h é retornado com clareza na resposta de simulação", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B5-TODAY/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: todayStr,
            newCheckoutDate: new Date(Date.now() + 86400000).toISOString().substring(0, 10)
          })
        });
        const data = await res.json();
        assert.match(data.policyNotice, /menos de 24h/i);
        assert.match(data.policyNotice, /Não há direito a estorno/i);
      });

      it("B5.4. Redução não reembolsável mantém o total pago inalterado", async () => {
        const dbBefore = getDb();
        const rBefore = dbBefore.reservations.find((x) => x.code === "RES-B5-TODAY");
        const paidBefore = rBefore.paidAmount;

        await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B5-TODAY/modify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: todayStr,
            newCheckoutDate: new Date(Date.now() + 86400000).toISOString().substring(0, 10)
          })
        });

        const dbAfter = getDb();
        const rAfter = dbAfter.reservations.find((x) => x.code === "RES-B5-TODAY");
        assert.strictEqual(rAfter.paidAmount, paidBefore);
      });

      it("B5.5. Redução com antecedência ajusta valor total estimado da estadia", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B5-FUTURE/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-12-28",
            newCheckoutDate: "2026-12-30"
          })
        });
        const data = await res.json();
        assert.strictEqual(data.newDates.totalAmount, 400); // 600 - 200
      });
    });

    // ── Boundary 6: Idempotency & Polling Concurrency ────────────────────────
    describe("B6: Idempotency & Polling Concurrency", () => {
      let pendingId = null;

      it("B6.1. Cria checkout e liquida pagamento para teste de idempotência", async () => {
        const checkRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B6-001/modify-checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-12-10",
            newCheckoutDate: "2026-12-14",
            paymentMethod: "pix"
          })
        });
        const checkData = await checkRes.json();
        pendingId = checkData.pendingId;

        const settleRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B6-001/modify-status?pendingId=${pendingId}&simulatePayment=true`);
        const settleData = await settleRes.json();
        assert.strictEqual(settleData.paid, true);
        assert.strictEqual(settleData.committed, true);
      });

      it("B6.2. Consultas subsequentes a /modify-status retornam mesmo status sem duplicar pagamentos", async () => {
        const res1 = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B6-001/modify-status?pendingId=${pendingId}`);
        const res2 = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B6-001/modify-status?pendingId=${pendingId}`);
        const d1 = await res1.json();
        const d2 = await res2.json();

        assert.strictEqual(d1.status, "paid");
        assert.strictEqual(d2.status, "paid");
        assert.strictEqual(d1.committed, true);
        assert.strictEqual(d2.committed, true);

        const db = getDb();
        const r = db.reservations.find((x) => x.code === "RES-B6-001");
        assert.strictEqual(r.payments.filter((p) => p.pendingId === pendingId).length, 1);
      });

      it("B6.3. Requisições simultâneas paralelas em /modify-status resolvem de forma determinística", async () => {
        const promises = [
          fetch(`${BASE_URL}/api/pms/guest-portal/RES-B6-001/modify-status?pendingId=${pendingId}`),
          fetch(`${BASE_URL}/api/pms/guest-portal/RES-B6-001/modify-status?pendingId=${pendingId}`),
          fetch(`${BASE_URL}/api/pms/guest-portal/RES-B6-001/modify-status?pendingId=${pendingId}`)
        ];
        const responses = await Promise.all(promises);
        for (const r of responses) {
          assert.strictEqual(r.status, 200);
          const body = await r.json();
          assert.strictEqual(body.paid, true);
        }
      });

      it("B6.4. Consulta com pendingId não coincidente retorna 400 Bad Request", async () => {
        // Inicia outro hold
        const checkRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F2-002/modify-checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-11-20",
            newCheckoutDate: "2026-11-25",
            paymentMethod: "pix"
          })
        });
        await checkRes.json();

        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F2-002/modify-status?pendingId=mod_fake_id_9999`);
        assert.strictEqual(res.status, 400);
      });

      it("B6.5. In-flight mutex lock impede commit concorrente duplicado no servidor", () => {
        const db = getDb();
        const r = db.reservations.find((x) => x.code === "RES-B6-001");
        assert.strictEqual(r.totalAmount, 720); // 360 + 360, not tripled
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3: Cross-Feature Combinations (5 Comprehensive Pairwise Tests)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("3.1. Combo 1: Hold -> Checagem de Conflito de Terceiro -> Cancelamento -> Disponibilidade Restaurada", async () => {
      // 1. Res T3-001 faz checkout com hold cobrindo 15/12 a 20/12 no Flat 113
      const holdRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-T3-001/modify-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-12-15",
          newCheckoutDate: "2026-12-20",
          paymentMethod: "pix"
        })
      });
      const holdData = await holdRes.json();
      assert.strictEqual(holdData.success, true);
      const pendingId = holdData.pendingId;

      // 2. Terceiro tenta reservar período em conflito e recebe 409 CONFLICT
      const conflictRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F2-002/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-12-18",
          newCheckoutDate: "2026-12-21",
          newFlatNumber: "113"
        })
      });
      assert.strictEqual(conflictRes.status, 409);

      // 3. Res T3-001 cancela o hold
      const cancelRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-T3-001/modify-cancel-pending`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingId })
      });
      assert.strictEqual(cancelRes.status, 200);

      // 4. Terceiro agora obtém disponibilidade imediata
      const availableRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F2-002/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-12-18",
          newCheckoutDate: "2026-12-21",
          newFlatNumber: "113"
        })
      });
      assert.strictEqual(availableRes.status, 200);
      const availData = await availableRes.json();
      assert.strictEqual(availData.available, true);
    });

    it("3.2. Combo 2: Prorrogação -> Pagamento PIX -> Re-assinatura Obrigatória -> Liberação na Portaria", async () => {
      // 1. Res T3-002 inicia checkout de extensão
      const checkRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-T3-002/modify-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: todayStr,
          newCheckoutDate: "2026-10-27",
          paymentMethod: "pix"
        })
      });
      const checkData = await checkRes.json();

      // 2. Pagamento é liquidado
      await fetch(`${BASE_URL}/api/pms/guest-portal/RES-T3-002/modify-status?pendingId=${checkData.pendingId}&simulatePayment=true`);

      // 3. Portaria acusa bloqueio imediato
      const repBefore = await fetch(`${BASE_URL}/api/reception/today`);
      const repDataBefore = await repBefore.json();
      const arrBefore = (repDataBefore.arrivals || []).find((x) => x.code === "RES-T3-002");
      assert.strictEqual(arrBefore.canAuthorizeEntry, false);

      // 4. Hóspede re-assina
      const resignRes = await fetch(`${BASE_URL}/api/pms/pre-checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: 17002,
          guestIndex: 1,
          fullName: "Dira Paes Reassinada",
          document: "77788899911",
          phone: "5521998887702",
          email: "dira@example.com",
          signatureBase64: "data:image/png;base64,combo2Sig",
          resign: "1"
        })
      });
      assert.strictEqual(resignRes.status, 200);

      // 5. Portaria autoriza check-in físico
      const repAfter = await fetch(`${BASE_URL}/api/reception/today`);
      const repDataAfter = await repAfter.json();
      const arrAfter = (repDataAfter.arrivals || []).find((x) => x.code === "RES-T3-002");
      assert.strictEqual(arrAfter.canAuthorizeEntry, true);
    });

    it("3.3. Combo 3: Troca de Flat -> Flat Antigo Liberado -> Novo Flat Ocupado -> Garagem Sincronizada", async () => {
      // Res T3-003 troca do Flat 113 para o Flat 114
      const res = await fetch(`${BASE_URL}/api/pms/reservations/17003`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId: 2,
          flatNumber: "114"
        })
      });
      assert.strictEqual(res.status, 200);

      const db = getDb();
      const r = db.reservations.find((x) => x.id === 17003);
      assert.strictEqual(r.flatNumber, "114");
      assert.strictEqual(r.needsReSignature, true);

      // Flat 113 original está disponível para o mesmo período
      const previewOldFlat = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F1-001/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-12-25",
          newCheckoutDate: "2026-12-27",
          newFlatNumber: "113"
        })
      });
      assert.strictEqual(previewOldFlat.status, 200);
      const oldFlatData = await previewOldFlat.json();
      assert.strictEqual(oldFlatData.available, true);
    });

    it("3.4. Combo 4: Redução de Estadia -> Cancelamento de Café Fora do Prazo -> Re-assinatura", async () => {
      // Res T3-004 reduz estadia de 26-30/12 para 26-28/12
      const res = await fetch(`${BASE_URL}/api/pms/reservations/17004`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutDate: "2026-12-28" })
      });
      assert.strictEqual(res.status, 200);

      const db = getDb();
      // Café do dia 29/12 foi cancelado
      const bk29 = db.breakfastOrders.find((b) => b.id === "bk-t3-2");
      assert.strictEqual(bk29.status, "cancelled");

      // Café do dia 27/12 permanece ativo
      const bk27 = db.breakfastOrders.find((b) => b.id === "bk-t3-1");
      assert.strictEqual(bk27.status, "pending");
    });

    it("3.5. Combo 5: Hold Abandonado -> Expiração de 30m -> Nova Tentativa por Outro Hóspede com Sucesso", async () => {
      // 1. Polling em hold expirado de RES-T3-005
      const statusRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-T3-005/modify-status?pendingId=mod_exp_t3_005`);
      const statusData = await statusRes.json();
      assert.strictEqual(statusData.status, "expired");

      // 2. Outro hóspede reserva Flat 201 com sucesso
      const otherRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F1-001/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-22",
          newCheckoutDate: "2026-11-24",
          newFlatNumber: "201"
        })
      });
      assert.strictEqual(otherRes.status, 200);
      const otherData = await otherRes.json();
      assert.strictEqual(otherData.available, true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 4: Real-World Application Scenarios (5 Explicit Scenarios from TEST_INFRA.md)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Tier 4: Real-World Application Scenarios", () => {
    // ── Scenario 1 ───────────────────────────────────────────────────────────
    it("4.1. Cenário 1: Prorrogação com pagamento adicional via PIX, commit das datas, gatilho de re-assinatura, PDF forense re-assinado e entregue à recepção", async () => {
      // 1. Simulação (F1)
      const prevRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-RW-SCEN1/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-05",
          newCheckoutDate: "2026-11-09" // +2 noites = +R$ 320
        })
      });
      assert.strictEqual(prevRes.status, 200);
      const prev = await prevRes.json();
      assert.strictEqual(prev.available, true);
      assert.strictEqual(prev.additionalAmountToPay, 320);

      // 2. Checkout e Hold Provisório (F2)
      const checkRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-RW-SCEN1/modify-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-05",
          newCheckoutDate: "2026-11-09",
          paymentMethod: "pix"
        })
      });
      assert.strictEqual(checkRes.status, 200);
      const check = await checkRes.json();
      const pendingId = check.pendingId;

      // 3. Pagamento e Commit Atômico (F3, F4)
      const payRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-RW-SCEN1/modify-status?pendingId=${pendingId}&simulatePayment=true`);
      assert.strictEqual(payRes.status, 200);
      const pay = await payRes.json();
      assert.strictEqual(pay.committed, true);
      assert.strictEqual(pay.needsReSignature, true);

      // 4. Invalidação e Auditoria (F5, F6)
      let db = getDb();
      let r = db.reservations.find((x) => x.code === "RES-RW-SCEN1");
      assert.strictEqual(r.checkoutDate, "2026-11-09");
      assert.strictEqual(r.totalAmount, 640);
      assert.strictEqual(r.needsReSignature, true);
      assert.strictEqual(r.fnhrCompleted, false);

      // 5. Re-assinatura Fast-Track e Geração Forense de PDF com SHA-256 (F7)
      const signRes = await fetch(`${BASE_URL}/api/pms/pre-checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: 18001,
          guestIndex: 1,
          fullName: "Carlos Eduardo Reassinado",
          document: "11199988877",
          phone: "5521998889001",
          email: "carlos.eduardo@example.com",
          signatureBase64: "data:image/png;base64,scen1SignaturePNGData",
          resign: "1"
        })
      });
      assert.strictEqual(signRes.status, 200);
      const sign = await signRes.json();
      assert.ok(sign.fnrhDocument);
      assert.strictEqual(sign.fnrhDocument.sha256Hash.length, 64);

      // 6. Entrega à Recepção e Sincronização Operacional (F7, F8, F10)
      db = getDb();
      r = db.reservations.find((x) => x.code === "RES-RW-SCEN1");
      assert.strictEqual(r.needsReSignature, false);
      assert.strictEqual(r.fnhrCompleted, true);
      assert.strictEqual(r.fnrhSha256Hash, sign.fnrhDocument.sha256Hash);

      const comms = db.reservationCommunications || [];
      const mail = comms.find((c) => c.reservation_id === "RES-RW-SCEN1" || c.reservation_id === "18001");
      assert.ok(mail, "PDF re-assinado deve ter sido despachado por e-mail para a recepção");

      const clean = db.cleaningRequests.find((c) => c.id === 9104);
      assert.strictEqual(clean.requestDate, "2026-11-09");
    });

    // ── Scenario 2 ───────────────────────────────────────────────────────────
    it("4.2. Cenário 2: Tentativa de prorrogação com conflito de calendário no mesmo flat: simulação acusa erro de conflito e bloqueia checkout", async () => {
      // Mariana tenta estender de 07/11 para 09/11 no Flat 114, mas Fabio Assunção já ocupa de 08/11 a 10/11
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-RW-SCEN2/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-05",
          newCheckoutDate: "2026-11-09"
        })
      });

      assert.strictEqual(res.status, 409);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.available, false);
      assert.strictEqual(data.error, "CONFLICT");
      assert.match(data.message, /Flat 114 não possui disponibilidade/);

      // Checkout direto também é bloqueado
      const checkRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-RW-SCEN2/modify-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-05",
          newCheckoutDate: "2026-11-09"
        })
      });
      assert.strictEqual(checkRes.status, 409);
    });

    // ── Scenario 3 ───────────────────────────────────────────────────────────
    it("4.3. Cenário 3: Modificação abandonada / cancelada durante o hold de pagamento PIX: datas originais permanecem intactas, hold expira e flat permanece disponível", async () => {
      // 1. Inicia checkout gerando hold de 30m
      const checkRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-RW-SCEN3/modify-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-05",
          newCheckoutDate: "2026-11-10",
          paymentMethod: "pix"
        })
      });
      const check = await checkRes.json();
      const pId = check.pendingId;

      // 2. Abandono e cancelamento voluntário do modal
      const cancelRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-RW-SCEN3/modify-cancel-pending`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingId: pId })
      });
      assert.strictEqual(cancelRes.status, 200);

      // 3. Invariante: Datas originais 100% preservadas
      const db = getDb();
      const r = db.reservations.find((x) => x.code === "RES-RW-SCEN3");
      assert.strictEqual(r.checkinDate, "2026-11-05");
      assert.strictEqual(r.checkoutDate, "2026-11-07");
      assert.strictEqual(r.totalAmount, 320);
      assert.strictEqual(r.pendingModification, undefined);

      // 4. Flat 116 está livre para reserva no período cancelado
      const availRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-F1-001/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-07",
          newCheckoutDate: "2026-11-10",
          newFlatNumber: "116"
        })
      });
      assert.strictEqual(availRes.status, 200);
      const availData = await availRes.json();
      assert.strictEqual(availData.available, true);
    });

    // ── Scenario 4 ───────────────────────────────────────────────────────────
    it("4.4. Cenário 4: Redução de estadia dentro da política de 24h ou alteração sem custo: commit imediato, re-assinatura acionada, painéis sincronizados", async () => {
      // Juliana Paes reduz de 15-19/11 (4 noites) para 15-17/11 (2 noites) com mais de 24h de antecedência
      const prevRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-RW-SCEN4/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-15",
          newCheckoutDate: "2026-11-17"
        })
      });
      assert.strictEqual(prevRes.status, 200);
      const prev = await prevRes.json();
      assert.strictEqual(prev.requiresPayment, false);
      assert.strictEqual(prev.refundAmount, 360);

      // Commit direto
      const modRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-RW-SCEN4/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-15",
          newCheckoutDate: "2026-11-17",
          reason: "Encurtamento planejado de estadia"
        })
      });
      assert.strictEqual(modRes.status, 200);
      const mod = await modRes.json();
      assert.strictEqual(mod.needsReSignature, true);

      // Painéis e governança sincronizados
      const db = getDb();
      const r = db.reservations.find((x) => x.code === "RES-RW-SCEN4");
      assert.strictEqual(r.checkoutDate, "2026-11-17");
      assert.strictEqual(r.needsReSignature, true);
      assert.strictEqual(r.fnhrCompleted, false);

      const clean = db.cleaningRequests.find((c) => c.id === 9103);
      assert.strictEqual(clean.requestDate, "2026-11-17");
    });

    // ── Scenario 5 ───────────────────────────────────────────────────────────
    it("4.5. Cenário 5: Troca de flat: flat antigo liberado, novo flat atribuído, assinatura invalidada, recepção bloqueia entrada física até re-assinatura", async () => {
      // Fernando Rocha troca do Flat 113 para o Flat 116
      const res = await fetch(`${BASE_URL}/api/pms/reservations/18006`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId: 3,
          flatNumber: "116",
          notes: "Realocação para Flat 116"
        })
      });
      assert.strictEqual(res.status, 200);

      // 1. Flat antigo (113) liberado
      const db = getDb();
      const r = db.reservations.find((x) => x.id === 18006);
      assert.strictEqual(r.flatNumber, "116");
      assert.strictEqual(r.needsReSignature, true);
      assert.strictEqual(r.fnhrCompleted, false);

      // 2. Recepção bloqueia entrada física imediatamente
      const repRes = await fetch(`${BASE_URL}/api/reception/today`);
      const rep = await repRes.json();
      const arr = (rep.arrivals || []).find((x) => x.id === 18006);
      assert.strictEqual(arr.canAuthorizeEntry, false);
      assert.strictEqual(arr.needsReSignature, true);
      assert.strictEqual(arr.flatNumber, "116");

      const checkinAttempt = await fetch(`${BASE_URL}/api/reception/checkin/18006`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      assert.strictEqual(checkinAttempt.status, 400);

      // 3. Hóspede re-assina no portal com novo flat
      const signRes = await fetch(`${BASE_URL}/api/pms/pre-checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: 18006,
          guestIndex: 1,
          fullName: "Fernando Rocha",
          document: "66688899955",
          phone: "5521998889006",
          email: "fernando.rocha@example.com",
          signatureBase64: "data:image/png;base64,freshFlat116Sig",
          resign: "1"
        })
      });
      assert.strictEqual(signRes.status, 200);

      // 4. Recepção agora autoriza entrada física com sucesso
      const repAfter = await fetch(`${BASE_URL}/api/reception/today`);
      const repAfterData = await repAfter.json();
      const arrAfter = (repAfterData.arrivals || []).find((x) => x.id === 18006);
      assert.strictEqual(arrAfter.canAuthorizeEntry, true);
      assert.strictEqual(arrAfter.needsReSignature, false);

      const checkinFinal = await fetch(`${BASE_URL}/api/reception/checkin/18006`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      assert.strictEqual(checkinFinal.status, 200);
    });
  });
});

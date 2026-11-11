/**
 * Targeted Verification Suite: Open Portaria/Recepção Terminal & Adaptive Reception Emails
 *
 * Scope strictly limited to the requested feature:
 * 1. Reception email badges, operational warning callouts, and adaptive Portaria deep-link buttons
 *    across 0/N (awaiting even with CPF pre-filled), K/N (partial, including out-of-order Guest 2),
 *    N/N (completed), and needsReSignature states + morning_checkin_07h deduplication safety.
 * 2. Unified Sofia Early Check-in deterministic backend rules (10:00 Site/Direto/WhatsApp,
 *    12:00 OTA/Agência/B2B, Admin manual authorization/paid override, room cleaning lock before 14:00).
 * 3. Unauthenticated public access to /api/reception/* and /api/public/checkout with strict allowlist
 *    sanitization (ZERO financial values and ZERO lock/Wi-Fi passwords leaked) and adminOverride
 *    privilege-escalation prevention.
 *
 * STRICT ISOLATION:
 * - Uses temporary DATA_FILE in os.tmpdir()
 * - Deletes DATABASE_URL, Z-API credentials, and mail credentials (zero external network dispatches)
 * - Verifies real data/database.json SHA-256 & mtime remain untouched.
 */

import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const TEST_PORT = 59884;
process.env.NODE_ENV = "test";
process.env.PORT = String(TEST_PORT);
delete process.env.DATABASE_URL;
delete process.env.ZAPI_INSTANCE_ID;
delete process.env.ZAPI_TOKEN;
delete process.env.ZAPI_CLIENT_TOKEN;
delete process.env.ZOHO_MAIL_PASSWORD;
delete process.env.SMTP_PASS;
delete process.env.RESEND_API_KEY;

const ROOT_DIR = process.cwd();
const REAL_DB_PATH = path.join(ROOT_DIR, "data", "database.json");
const realDbExisted = fs.existsSync(REAL_DB_PATH);
const initialRealDbHash = realDbExisted
  ? crypto.createHash("sha256").update(fs.readFileSync(REAL_DB_PATH)).digest("hex")
  : null;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "portaria-open-test-"));
const tmpDbPath = path.join(tmpDir, "test-db.json");
process.env.DATA_FILE = tmpDbPath;

// Compute current Brasília date/time matching server logic
const brFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});
const todayStr = brFormatter.format(new Date());
const tomorrowDate = new Date(Date.now() + 36 * 3600 * 1000);
const tomorrowStr = brFormatter.format(tomorrowDate);

const SENSITIVE_SENTINELS = [
  "489.97",
  "1959.88",
  "SECRET-PIX-KEY-999",
  "000201SECRETPIX",
  "000201EARLYPIX",
  "BOLETO-999888",
  "FATURADO-54321",
  "CONFIDENCIAL-NOTA-FINANCEIRA",
  "AUDIT-SECRET-LOG",
  "DOOR-PASS-849201",
  "LOCK-PASS-771122",
  "ACCESS-CODE-654321",
  "WIFI-SECRET-SOHO-99",
  "FLAT-DOOR-9999",
  "FLAT-WIFI-8888"
];

const FORBIDDEN_RECEPTION_KEYS = [
  "dailyRate",
  "dailyRates",
  "totalAmount",
  "paidAmount",
  "payments",
  "charges",
  "cleaningFee",
  "earlyCheckinFee",
  "pendingEarlyCheckin",
  "pixCopiaECola",
  "boletos",
  "invoice",
  "faturadoPackage",
  "confirmedFiscalData",
  "notes",
  "auditLogs",
  "doorPassword",
  "lockPassword",
  "accessCode",
  "wifiPassword"
];

const initialMockData = {
  users: [
    { id: 1, username: "admin", role: "admin", name: "Administrador" }
  ],
  settings: {
    buildingName: "Edifício Soho Residence Service",
    checkinTime: "14:00",
    checkoutTime: "12:00",
    adminWhatsApp: "5522999112233",
    checkinProvider: "proprio"
  },
  zapiConfig: {
    enabled: false,
    instanceId: "",
    token: "",
    clientToken: ""
  },
  flats: [
    {
      id: 101,
      number: "509",
      name: "Flat 509",
      buildingName: "Edifício Soho Residence Service",
      isOccupied: false,
      doorPassword: "FLAT-DOOR-9999",
      wifiPassword: "FLAT-WIFI-8888"
    },
    {
      id: 102,
      number: "602",
      name: "Flat 602",
      buildingName: "Edifício Soho Residence Service",
      isOccupied: false,
      doorPassword: "FLAT-DOOR-9999",
      wifiPassword: "FLAT-WIFI-8888"
    },
    {
      id: 103,
      number: "704",
      name: "Flat 704",
      buildingName: "Edifício Soho Residence Service",
      isOccupied: true,
      doorPassword: "FLAT-DOOR-9999",
      wifiPassword: "FLAT-WIFI-8888"
    }
  ],
  guests: [],
  cleaningRequests: [
    // Flat 509 clean today
    {
      id: 1,
      flatId: 101,
      flatNumber: "509",
      requestDate: todayStr,
      status: "clean",
      completedAt: new Date().toISOString()
    },
    // Flat 602 dirty today
    {
      id: 2,
      flatId: 102,
      flatNumber: "602",
      requestDate: todayStr,
      status: "dirty",
      completedAt: null
    }
  ],
  reservations: [
    // 1. Today arrival, 2 guests, Guest 2 signed first (out-of-order partial 1/2), Admin authorized early check-in
    {
      id: 9001,
      code: "RES-OPEN01",
      flatId: 101,
      flatNumber: "509",
      channel: "booking",
      status: "confirmada",
      paymentStatus: "paid",
      guestName: "João Titular",
      guestPhone: "22999001122",
      guestDocument: "123.456.789-00",
      guestCount: 2,
      checkinDate: todayStr,
      checkoutDate: tomorrowStr,
      earlyCheckinAuthorized: true,
      fnhrCompleted: true, // set when Guest 2 signed — must NOT trick Slot 1 into looking completed!
      receptionNotes: "Entregar controle da garagem",
      vehicle: { plate: "KXY1A23", brand: "Toyota", model: "Corolla", color: "Prata" },
      guests: [
        {
          index: 2,
          name: "Maria Acompanhante",
          cpf: "987.654.321-11",
          phone: "22999003344",
          hasCompletedCheckin: true,
          fnrhDocumentUuid: "uuid-guest-2-test",
          selfieUrl: "/api/media/blob/selfie2",
          docPhotoUrl: "/api/media/blob/doc2",
          entryAuthorized: false
        }
      ],
      // Sensitive fields that MUST be stripped on /api/reception/*
      dailyRate: 489.97,
      dailyRates: { [todayStr]: 489.97 },
      totalAmount: 1959.88,
      paidAmount: 1959.88,
      cleaningFee: 150,
      earlyCheckinFee: 120,
      payments: [{ id: "p1", amount: 1959.88, pixKey: "SECRET-PIX-KEY-999" }],
      charges: [{ id: "c1", amount: 55, description: "Extra" }],
      pendingEarlyCheckin: { status: "paid", amount: 120, pixCopiaECola: "000201EARLYPIX" },
      pixCopiaECola: "000201SECRETPIX",
      boletos: [{ nossoNumero: "BOLETO-999888" }],
      faturadoPackage: { code: "FATURADO-54321" },
      confirmedFiscalData: { cpfCnpj: "12345678000199" },
      notes: "CONFIDENCIAL-NOTA-FINANCEIRA",
      auditLogs: [{ id: "a1", description: "AUDIT-SECRET-LOG" }],
      doorPassword: "DOOR-PASS-849201",
      lockPassword: "LOCK-PASS-771122",
      accessCode: "ACCESS-CODE-654321",
      wifiPassword: "WIFI-SECRET-SOHO-99"
    },
    // 2. Today arrival, 0/1 digital check-in completed (even though CPF is pre-filled!)
    {
      id: 9002,
      code: "RES-ZERO02",
      flatId: 102,
      flatNumber: "602",
      channel: "site",
      status: "confirmada",
      paymentStatus: "paid",
      guestName: "Ana Sem Checkin",
      guestPhone: "22988776655",
      guestDocument: "111.222.333-44",
      guestCount: 1,
      checkinDate: todayStr,
      checkoutDate: tomorrowStr,
      fnhrCompleted: false,
      doorPassword: "DOOR-PASS-849201",
      totalAmount: 1959.88
    },
    // 3. Future arrival (for ?res=RES-FUT03 deep-link testing)
    {
      id: 9003,
      code: "RES-FUT03",
      flatId: 101,
      flatNumber: "509",
      channel: "airbnb",
      status: "confirmada",
      paymentStatus: "paid",
      guestName: "Pedro Futuro",
      guestPhone: "21997776655",
      guestCount: 2,
      checkinDate: tomorrowStr,
      checkoutDate: "2026-12-30",
      fnhrCompleted: true,
      guests: [
        { index: 1, name: "Pedro Futuro", hasCompletedCheckin: true, fnrhDocumentUuid: "uuid-fut-1" }
      ],
      doorPassword: "DOOR-PASS-849201",
      dailyRate: 489.97
    },
    // 4. In-house reservation for checkout / undo-checkout sanitization testing
    {
      id: 9004,
      code: "RES-INHOUSE04",
      flatId: 103,
      flatNumber: "704",
      channel: "agencia",
      isB2b: true,
      status: "in_house",
      paymentStatus: "paid",
      guestName: " Roberto Hospedado",
      guestPhone: "11988887777",
      guestCount: 1,
      checkinDate: todayStr,
      checkoutDate: todayStr,
      fnhrCompleted: true,
      guests: [
        { index: 1, name: "Roberto Hospedado", hasCompletedCheckin: true, entryAuthorized: true }
      ],
      boletos: [{ nossoNumero: "BOLETO-999888" }],
      faturadoPackage: { code: "FATURADO-54321" },
      doorPassword: "DOOR-PASS-849201",
      totalAmount: 1959.88
    },
    // 5. Unpaid pre_reserva — must NEVER appear on /api/reception/today or checkin-link-info
    {
      id: 9005,
      code: "RES-PRERES05",
      flatId: 102,
      flatNumber: "602",
      channel: "whatsapp",
      status: "pre_reserva",
      paymentStatus: "pending",
      guestName: "Lead Nao Pago",
      guestCount: 1,
      checkinDate: todayStr,
      checkoutDate: tomorrowStr
    }
  ],
  notifications: [],
  reservationCommunications: []
};

fs.writeFileSync(tmpDbPath, JSON.stringify(initialMockData, null, 2), "utf8");

const mailService = await import("../artifacts/api-server/mail-service.mjs");
const demoServer = await import("../artifacts/api-server/demo-server.mjs");

const {
  renderCheckinConfirmedEmail,
  renderReservationUpdateEmail,
  evaluateReceptionCheckinStage,
  isOtaOrB2bReservation,
  hasReceptionEmailInComms
} = mailService;

const {
  evaluateReceptionEarlyCheckin,
  buildSanitizedReceptionItem,
  httpServer,
  db
} = demoServer;

const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function assertNoSensitiveLeak(payload, label) {
  const raw = JSON.stringify(payload);
  for (const sentinel of SENSITIVE_SENTINELS) {
    assert.equal(
      raw.includes(sentinel),
      false,
      `[${label}] Vazamento detectado do valor sensível "${sentinel}"`
    );
  }
  const inspectObj = (obj, keyPath = "") => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => inspectObj(item, `${keyPath}[${i}]`));
      return;
    }
    for (const k of Object.keys(obj)) {
      assert.equal(
        FORBIDDEN_RECEPTION_KEYS.includes(k),
        false,
        `[${label}] Chave sensível proibida "${k}" encontrada em ${keyPath || "root"}`
      );
      inspectObj(obj[k], keyPath ? `${keyPath}.${k}` : k);
    }
  };
  inspectObj(payload);
}

after(async () => {
  await new Promise((resolve) => {
    if (httpServer && httpServer.listening) {
      httpServer.closeAllConnections?.();
      httpServer.close(() => resolve());
    } else {
      resolve();
    }
  });
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
  if (realDbExisted) {
    const finalRealDbHash = crypto.createHash("sha256").update(fs.readFileSync(REAL_DB_PATH)).digest("hex");
    assert.equal(finalRealDbHash, initialRealDbHash, "O banco real data/database.json NÃO pode ser modificado pelo teste!");
  }
  setTimeout(() => process.exit(process.exitCode || 0), 100);
});

describe("1. E-mails da Recepção: Badges, Alertas Operacionais e Botões Adaptativos", () => {
  it("Reserva recém-cadastrada (0/1) mesmo com CPF preenchido exibe badge vermelho 'Aguardando check-in', alerta de bloqueio e os 2 botões pré-check-in", () => {
    const reservation = {
      id: 1,
      code: "RES-TEST0",
      flatNumber: "509",
      channel: "site",
      guestName: "Carlos Silva",
      guestDocument: "123.456.789-00", // CPF pré-preenchido na reserva NÃO é check-in digital!
      guestPhone: "22999887766",
      guestCount: 1,
      checkinDate: todayStr,
      checkoutDate: tomorrowStr,
      fnhrCompleted: false
    };

    const rendered = renderCheckinConfirmedEmail({ reservation, flat: { number: "509" }, settings: db.settings });
    assert.equal(rendered.checkinStage, "awaiting");
    assert.equal(rendered.completedGuests, 0);
    assert.equal(rendered.expectedGuests, 1);
    assert.ok(rendered.subject.includes("Flat 509 - Carlos Silva"));
    assert.ok(rendered.html.includes("Aguardando check-in"), "Deve exibir o badge 'Aguardando check-in'");
    assert.equal(rendered.html.includes("Check-in Confirmado"), false, "NÃO deve exibir 'Check-in Confirmado'");
    assert.equal(rendered.html.includes("Hóspedes Autorizados"), false, "NÃO deve rotular hóspedes como autorizados quando aguardando check-in");
    assert.ok(rendered.html.includes("Hóspedes na Reserva — Aguardando Check-in Digital (1)"));
    assert.ok(rendered.html.includes("Segue o informativo cadastral"), "Deve conter texto base");
    assert.ok(rendered.html.includes("CHECK-IN AINDA NÃO LIBERADO"), "Deve frisar que o check-in ainda não está liberado");
    assert.ok(rendered.html.includes("ainda NÃO está liberado na portaria"), "Deve frisar no corpo que está aguardando check-in digital");
    assert.ok(rendered.html.includes("action=send-checkin-link"), "Deve conter botão 'Enviar link para check-in digital'");
    assert.ok(rendered.html.includes("action=verify-early-checkin"), "Deve conter botão 'Verificar permissão para Early Check-in'");
    assert.equal(rendered.html.includes("Abrir Terminal da Portaria"), false, "Antes da conclusão total, não deve trocar pelo botão pós-check-in");
  });

  it("Reserva com 1 de 2 hóspedes concluídos (inclusive quando o 2º assina primeiro) exibe 'Check-in Parcial (1/2)' em amarelo e mantém botão de enviar link", () => {
    const reservation = {
      id: 2,
      code: "RES-PARTIAL",
      flatNumber: "509",
      channel: "booking",
      guestName: "Titular Pendente",
      guestCount: 2,
      checkinDate: todayStr,
      checkoutDate: tomorrowStr,
      fnhrCompleted: true,
      guests: [
        { index: 2, name: "Segundo Concluido", hasCompletedCheckin: true, fnrhDocumentUuid: "u2" }
      ]
    };

    const stageInfo = evaluateReceptionCheckinStage(reservation);
    assert.equal(stageInfo.stage, "partial");
    assert.equal(stageInfo.completedGuests, 1);
    assert.equal(stageInfo.expectedGuests, 2);

    const rendered = renderCheckinConfirmedEmail({ reservation, flat: { number: "509" }, settings: db.settings });
    assert.equal(rendered.checkinStage, "partial");
    assert.ok(rendered.html.includes("Check-in Parcial (1/2)"));
    assert.equal(rendered.html.includes("Hóspedes Autorizados"), false, "NÃO deve rotular toda a lista como Hóspedes Autorizados em check-in parcial");
    assert.ok(rendered.html.includes("Hóspedes na Reserva — Check-in Parcial (1/2)"));
    assert.ok(rendered.html.includes("ATENÇÃO PORTARIA: CHECK-IN PARCIAL (1/2)"));
    assert.ok(rendered.html.includes("Hóspede 1: Titular Pendente"));
    assert.ok(rendered.html.includes("Hóspede 2: Segundo Concluido"));
    assert.ok(rendered.html.includes("guest=1"), "Quando o 2º assinou primeiro, o link direto do pendente deve apontar para o 1º Hóspede (guest=1)");
    assert.ok(rendered.html.includes("1º Hóspede"));
    assert.ok(rendered.html.includes("BLOQUEADO"));
    assert.ok(rendered.html.includes("action=send-checkin-link"));
    assert.ok(rendered.html.includes("action=verify-early-checkin"));
  });

  it("Reserva com todos os hóspedes concluídos (2/2) exibe 'Check-in Digital Concluído' em verde e troca botões para 'Verificar permissão para Early Check-in' + 'Abrir Terminal da Portaria'", () => {
    const reservation = {
      id: 3,
      code: "RES-DONE2",
      flatNumber: "509",
      channel: "whatsapp",
      guestName: "Titular Ok",
      guestCount: 2,
      checkinDate: todayStr,
      checkoutDate: tomorrowStr,
      fnhrCompleted: true,
      guests: [
        { index: 1, name: "Titular Ok", hasCompletedCheckin: true, fnrhDocumentUuid: "u1" },
        { index: 2, name: "Acompanhante Ok", hasCompletedCheckin: true, fnrhDocumentUuid: "u2" }
      ]
    };

    const rendered = renderCheckinConfirmedEmail({ reservation, flat: { number: "509" }, settings: db.settings });
    assert.equal(rendered.checkinStage, "completed");
    assert.ok(rendered.html.includes("Check-in Digital Concluído"));
    assert.ok(rendered.html.includes("Hóspedes com Check-in Digital Concluído (2)"));
    assert.equal(rendered.html.includes("Enviar link para check-in digital"), false, "Após todos concluírem, botão de enviar link não deve aparecer");
    assert.ok(rendered.html.includes("Verificar permissão para Early Check-in"));
    assert.ok(rendered.html.includes("Abrir Terminal da Portaria"));
    assert.ok(rendered.html.includes(`/portaria?res=RES-DONE2"`));

    // Se entrar em needsReSignature, volta imediatamente para awaiting
    const reSigRendered = renderCheckinConfirmedEmail({
      reservation: { ...reservation, needsReSignature: true },
      flat: { number: "509" },
      settings: db.settings
    });
    assert.equal(reSigRendered.checkinStage, "awaiting");
    assert.ok(reSigRendered.html.includes("Aguardando check-in"));
  });

  it("renderReservationUpdateEmail inclui botões adaptativos quando ativa e omite quando cancelada; hasReceptionEmailInComms não suprime FNRH pós e-mail das 07h sem PDF", () => {
    const resActive = { id: 4, code: "RES-UPD", flatNumber: "509", guestName: "Teste", guestCount: 1, checkinDate: todayStr, checkoutDate: tomorrowStr };
    const updHtml = renderReservationUpdateEmail({ reservation: resActive, flat: { number: "509" }, updateType: "updated", settings: db.settings });
    assert.ok(updHtml.html.includes("action=send-checkin-link"));
    assert.ok(updHtml.html.includes("action=verify-early-checkin"));

    const cancelHtml = renderReservationUpdateEmail({ reservation: resActive, flat: { number: "509" }, updateType: "cancelled", settings: db.settings });
    assert.equal(cancelHtml.html.includes("action=send-checkin-link"), false);

    // Deduplicação: e-mail matinal 07:00 enviado enquanto aguardava check-in (sem PDF) não bloqueia o envio quando o hóspede conclui a FNRH
    const mockDb = {
      settings: { receptionEmail: "soho@promenade.com.br" },
      flats: [{ id: 101, number: "509", receptionEmail: "soho@promenade.com.br" }],
      reservationCommunications: [
        {
          reservation_id: "RES-UPD",
          type: "email",
          direction: "outbound",
          status: "sent",
          recipient: "soho@promenade.com.br",
          subject: "[AGUARDANDO CHECK-IN DIGITAL] Reserva Hoje - Flat 509 - Teste",
          sent_at: `${todayStr}T10:00:00.000Z`,
          metadata: { trigger: "morning_checkin_07h", checkinStage: "awaiting", hasPdfAttached: false }
        }
      ]
    };
    const completedRes = { ...resActive, fnhrCompleted: true, fnrhDocumentUuid: "uuid-now-done" };
    assert.equal(
      hasReceptionEmailInComms(completedRes, mockDb, { requireFnrhIfCompleted: true }),
      false,
      "E-mail matinal sem FNRH não pode impedir o disparo do e-mail com Check-in Digital Concluído + PDF!"
    );
  });
});

describe("2. Regra Unificada da Sofia para Early Check-in", () => {
  it("Site/Direto/WhatsApp libera às 10:00; Booking/Airbnb/Agência/B2B libera às 12:00; antes disso exige autorização/pagamento Admin e quarto limpo", () => {
    assert.equal(isOtaOrB2bReservation({ channel: "site" }), false);
    assert.equal(isOtaOrB2bReservation({ channel: "whatsapp" }), false);
    assert.equal(isOtaOrB2bReservation({ channel: "booking" }), true);
    assert.equal(isOtaOrB2bReservation({ channel: "airbnb" }), true);
    assert.equal(isOtaOrB2bReservation({ channel: "agencia" }), true);
    assert.equal(isOtaOrB2bReservation({ channel: "direto", isB2b: true }), true);

    const baseCtx = {
      isRoomReady: true,
      cleaningStatus: "clean",
      cleaningLabel: "Limpo",
      settings: db.settings,
      allCheckinDone: true,
      someCheckinDone: true,
      completedCount: 1,
      totalCount: 1,
      isReSignatureNeeded: false
    };

    // Site @ 09:59 -> Bloqueado
    const site0959 = evaluateReceptionEarlyCheckin(
      { channel: "site", checkinDate: todayStr },
      { ...baseCtx, bNow: { date: todayStr, hour: 9, minute: 59 } }
    );
    assert.equal(site0959.freeEarlyTime, "10:00");
    assert.equal(site0959.isTimeAllowed, false);
    assert.equal(site0959.canAuthorizeEntry, false);

    // Site @ 10:00 -> Liberado
    const site1000 = evaluateReceptionEarlyCheckin(
      { channel: "site", checkinDate: todayStr },
      { ...baseCtx, bNow: { date: todayStr, hour: 10, minute: 0 } }
    );
    assert.equal(site1000.isTimeAllowed, true);
    assert.equal(site1000.canAuthorizeEntry, true);
    assert.equal(site1000.earlyCheckinStatus, "Liberado");

    // Booking @ 10:30 e 11:59 -> Bloqueado
    const booking1159 = evaluateReceptionEarlyCheckin(
      { channel: "booking", checkinDate: todayStr },
      { ...baseCtx, bNow: { date: todayStr, hour: 11, minute: 59 } }
    );
    assert.equal(booking1159.freeEarlyTime, "12:00");
    assert.equal(booking1159.isTimeAllowed, false);
    assert.equal(booking1159.canAuthorizeEntry, false);

    // Booking @ 12:00 -> Liberado
    const booking1200 = evaluateReceptionEarlyCheckin(
      { channel: "booking", checkinDate: todayStr },
      { ...baseCtx, bNow: { date: todayStr, hour: 12, minute: 0 } }
    );
    assert.equal(booking1200.isTimeAllowed, true);
    assert.equal(booking1200.canAuthorizeEntry, true);

    // Booking @ 08:30 com earlyCheckinAuthorized: true -> Liberado!
    const bookingAdminAuth = evaluateReceptionEarlyCheckin(
      { channel: "booking", checkinDate: todayStr, earlyCheckinAuthorized: true },
      { ...baseCtx, bNow: { date: todayStr, hour: 8, minute: 30 } }
    );
    assert.equal(bookingAdminAuth.isTimeAllowed, true);
    assert.equal(bookingAdminAuth.canAuthorizeEntry, true);

    // Site @ 08:30 com pendingEarlyCheckin pendente (NÃO pago) -> Continua Bloqueado!
    const siteUnpaidEarly = evaluateReceptionEarlyCheckin(
      { channel: "site", checkinDate: todayStr, pendingEarlyCheckin: { status: "pending", amount: 100 } },
      { ...baseCtx, bNow: { date: todayStr, hour: 8, minute: 30 } }
    );
    assert.equal(siteUnpaidEarly.isTimeAllowed, false);
    assert.equal(siteUnpaidEarly.canAuthorizeEntry, false);

    // Site @ 11:00 mas quarto SUJO -> Bloqueado aguardando limpeza
    const siteDirtyRoom = evaluateReceptionEarlyCheckin(
      { channel: "site", checkinDate: todayStr },
      { ...baseCtx, isRoomReady: false, cleaningStatus: "dirty", cleaningLabel: "Sujo", bNow: { date: todayStr, hour: 11, minute: 0 } }
    );
    assert.equal(siteDirtyRoom.isTimeAllowed, true);
    assert.equal(siteDirtyRoom.canAuthorizeEntry, false);
    assert.equal(siteDirtyRoom.earlyCheckinStatus, "Aguardando limpeza");
  });
});

describe("3. Endpoints Públicos /api/reception/* (Sem Login, Zero Vazamento Financeiro/Senhas, Travas Reais)", () => {
  it("GET /api/reception/today?res=RES-FUT03 responde 200 sem autenticação, remove 100% de dados financeiros/senhas, oculta pré-reserva e preserva slots multi-hóspede fora de ordem", async () => {
    const res = await fetch(`${BASE_URL}/api/reception/today?res=RES-FUT03`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assertNoSensitiveLeak(body, "GET /api/reception/today");

    // Pré-reserva não paga jamais aparece
    const allReturnedCodes = [
      ...body.arrivals.map(x => x.code),
      ...body.inHouse.map(x => x.code),
      ...body.completedToday.map(x => x.code)
    ];
    assert.equal(allReturnedCodes.includes("RES-PRERES05"), false);

    // Deep-link de reserva futura retornado em focusedReservation e higienizado
    assert.ok(body.focusedReservation);
    assert.equal(body.focusedReservation.code, "RES-FUT03");
    assert.equal(body.focusedReservation.earlyCheckinChecklist.isCheckinDateFuture, true);

    // Verificar RES-OPEN01: 2 vagas, onde Hóspede 2 preencheu primeiro e Hóspede 1 continua pendente
    const open01 = body.arrivals.find(x => x.code === "RES-OPEN01");
    assert.ok(open01, "RES-OPEN01 deve estar em arrivals");
    assert.equal(open01.vehicle?.plate, "KXY1A23");
    assert.equal(open01.receptionNotes, "Entregar controle da garagem");
    assert.equal(open01.guests.length, 2);
    assert.equal(open01.guests[0].index, 1);
    assert.equal(open01.guests[0].name, "João Titular");
    assert.equal(open01.guests[0].hasCompletedCheckin, false, "Slot 1 NÃO pode herdar conclusão do Slot 2!");
    assert.equal(open01.guests[1].index, 2);
    assert.equal(open01.guests[1].name, "Maria Acompanhante");
    assert.equal(open01.guests[1].hasCompletedCheckin, true);
    assert.ok(open01.guests[1].fnrhPdfUrl?.includes("/api/pms/fnrh/uuid-guest-2-test/view?token="));
  });

  it("GET /api/reception/reservations/:id/checkin-link-info gera QR Codes distintos por hóspede sem login e bloqueia pré-reserva", async () => {
    const res = await fetch(`${BASE_URL}/api/reception/reservations/RES-OPEN01/checkin-link-info`);
    assert.equal(res.status, 200);
    const info = await res.json();
    assertNoSensitiveLeak(info, "checkin-link-info");
    assert.equal(info.expectedGuests, 2);
    assert.equal(info.guests.length, 2);
    assert.equal(info.guests[0].hasCompletedCheckin, false);
    assert.equal(info.guests[1].hasCompletedCheckin, true);
    assert.ok(info.guests[0].checkinUrl.includes("guest=1"));
    assert.ok(info.guests[1].checkinUrl.includes("guest=2"));
    assert.ok(info.guests[0].qrCodeDataUrl?.startsWith("data:image/png;base64,"));
    assert.ok(info.guests[1].qrCodeDataUrl?.startsWith("data:image/png;base64,"));

    const blockedPre = await fetch(`${BASE_URL}/api/reception/reservations/RES-PRERES05/checkin-link-info`);
    assert.equal(blockedPre.status, 403);
  });

  it("POST /api/reception/reservations/:id/resend-checkin-link salva telefone ajustado no slot correto e devolve QR Code + fallback WhatsApp Web", async () => {
    const res = await fetch(`${BASE_URL}/api/reception/reservations/RES-FUT03/resend-checkin-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestIndex: 2,
        phone: "(22) 99711-2233",
        guestName: "Lucia Segunda"
      })
    });
    // Z-API está desabilitada no mock -> retorna HTTP 200 com success: false + waWebUrl + qrCodeDataUrl prontos para contingência, gravando os dados no slot 2!
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, false);
    assertNoSensitiveLeak(body, "resend-checkin-link");
    assert.ok(body.checkinUrl.includes("guest=2"));
    assert.ok(body.waWebUrl.includes("5522997112233"));
    assert.ok(body.qrCodeDataUrl?.startsWith("data:image/png;base64,"));

    const rInDb = db.reservations.find(x => x.code === "RES-FUT03");
    const slot2 = rInDb.guests.find(g => g.index === 2);
    assert.ok(slot2, "Slot 2 deve ter sido criado na reserva");
    assert.equal(slot2.name, "Lucia Segunda");
    assert.equal(slot2.phone, "(22) 99711-2233");
  });

  it("POST /api/reception/reservations/:id/request-early-checkin-analysis funciona sem login, propaga observação da portaria, gera notificação interna + link fallback e suprime duplicidade no cooldown de 45s", async () => {
    const notifCountBefore = (db.notifications || []).length;
    const res1 = await fetch(`${BASE_URL}/api/reception/reservations/RES-FUT03/request-early-checkin-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Hóspede na recepção com malas" })
    });
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assertNoSensitiveLeak(body1, "request-early-checkin-analysis");
    assert.equal(body1.success, true);
    assert.ok(body1.fallbackWaWebUrl?.includes("5522999112233"));
    assert.ok(
      decodeURIComponent(body1.fallbackWaWebUrl).includes("Hóspede na recepção com malas"),
      "A observação digitada na portaria deve constar na mensagem enviada à Administração!"
    );

    const notifCountAfter1 = (db.notifications || []).length;
    assert.equal(notifCountAfter1, notifCountBefore + 1);
    const createdNotif = db.notifications[0];
    assert.equal(createdNotif.metadata?.note, "Hóspede na recepção com malas");

    // Segunda tentativa imediata cai no cooldown de 45s sem duplicar alerta/notificação
    const res2 = await fetch(`${BASE_URL}/api/reception/reservations/RES-FUT03/request-early-checkin-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Spam imediato" })
    });
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.success, true);
    assert.equal(body2.alreadySentRecently, true);
    assert.equal((db.notifications || []).length, notifCountAfter1, "Cooldown de 45s não deve duplicar notificações!");
  });

  it("POST /api/reception/checkin/:id bloqueia adminOverride sem sessão Admin, bloqueia reserva sem check-in digital / data futura, e libera entrada parcial higienizada", async () => {
    // 1. Tentativa maliciosa sem autenticação enviando adminOverride: true em reserva 0/1 sem check-in digital
    const bypassAttempt = await fetch(`${BASE_URL}/api/reception/checkin/9002`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminOverride: true, force: true })
    });
    assert.equal(bypassAttempt.status, 400, "adminOverride sem cookie de Admin autenticado DEVE ser ignorado e bloqueado!");

    // 2. Tentativa de liberar reserva com data futura (RES-FUT03)
    const futureAttempt = await fetch(`${BASE_URL}/api/reception/checkin/9003`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partial: true, guestIndices: [1] })
    });
    assert.equal(futureAttempt.status, 400);
    const futureErr = await futureAttempt.json();
    assert.equal(futureErr.earlyCheckinBlocked, true);
    assertNoSensitiveLeak(futureErr, "checkin-future-blocked");

    // 3. RES-OPEN01 (hoje, Flat 509 limpo, earlyCheckinAuthorized=true, 1/2 concluído):
    // Sem partial=true pede confirmação parcial; com partial=true libera APENAS Hóspede 2 e retorna reserva 100% higienizada!
    const needPartialConfirm = await fetch(`${BASE_URL}/api/reception/checkin/9001`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(needPartialConfirm.status, 400);
    const partialPrompt = await needPartialConfirm.json();
    assert.equal(partialPrompt.requiresPartialConfirmation, true);

    const partialOk = await fetch(`${BASE_URL}/api/reception/checkin/9001`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partial: true, guestIndices: [2] })
    });
    assert.equal(partialOk.status, 200);
    const partialBody = await partialOk.json();
    assert.equal(partialBody.success, true);
    assert.equal(partialBody.isPartialCheckin, true);
    assertNoSensitiveLeak(partialBody, "POST /api/reception/checkin success");

    const g1After = partialBody.reservation.guests.find(g => g.index === 1);
    const g2After = partialBody.reservation.guests.find(g => g.index === 2);
    assert.equal(g1After.entryAuthorized, false, "Hóspede 1 pendente deve permanecer bloqueado!");
    assert.equal(g2After.entryAuthorized, true, "Hóspede 2 concluído deve ter entrada autorizada!");
  });

  it("POST /api/reception/checkout/:id, undo-checkout e /api/public/checkout funcionam sem login e não vazam boletos, faturas ou valores; rotas internas /api/pms/reservations/:id/* exigem login", async () => {
    // Tentativas sem autenticação nas rotas internas /api/pms/* devem retornar 401 sem vazar dados nem auto-autorizar Early Check-in
    const unauthEarly = await fetch(`${BASE_URL}/api/pms/reservations/9002/early-checkin`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ earlyCheckinAuthorized: true })
    });
    assert.equal(unauthEarly.status, 401, "PATCH /api/pms/reservations/:id/early-checkin sem login deve retornar 401!");
    assert.equal(Boolean(db.reservations.find(x => x.id === 9002)?.earlyCheckinAuthorized), false);

    const unauthNotes = await fetch(`${BASE_URL}/api/pms/reservations/9002/reception-notes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receptionNotes: "Adulterado" })
    });
    assert.equal(unauthNotes.status, 401);

    const unauthPmsCheckout = await fetch(`${BASE_URL}/api/pms/reservations/9004/checkout`, { method: "POST" });
    assert.equal(unauthPmsCheckout.status, 401, "POST /api/pms/reservations/:id/checkout sem login deve retornar 401!");

    const unauthPmsUndo = await fetch(`${BASE_URL}/api/pms/reservations/9004/undo-checkout`, { method: "POST" });
    assert.equal(unauthPmsUndo.status, 401, "POST /api/pms/reservations/:id/undo-checkout sem login deve retornar 401 sem vazar boletos/senhas!");

    // Tentativas de burlar Early Check-in via /api/pms/guest-portal/:code/claim-early-checkin
    const claimPreRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-PRERES05/claim-early-checkin`, { method: "POST" });
    assert.equal(claimPreRes.status, 403);

    const claimFuture = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-FUT03/claim-early-checkin`, { method: "POST" });
    assert.equal(claimFuture.status, 400, "Não pode liberar claim-early-checkin em data futura");

    const claimDirtyOrEarly = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ZERO02/claim-early-checkin`, { method: "POST" });
    assert.equal(claimDirtyOrEarly.status, 400, "Não pode liberar claim-early-checkin com flat sujo ou fora do horário da Sofia");
    assert.equal(Boolean(db.reservations.find(x => x.id === 9002)?.earlyCheckinAuthorized), false);

    const coRes = await fetch(`${BASE_URL}/api/reception/checkout/9004`, { method: "POST" });
    assert.equal(coRes.status, 200);
    const coBody = await coRes.json();
    assert.equal(coBody.success, true);
    assertNoSensitiveLeak(coBody, "POST /api/reception/checkout");

    const undoRes = await fetch(`${BASE_URL}/api/reception/undo-checkout/9004`, { method: "POST" });
    assert.equal(undoRes.status, 200);
    const undoBody = await undoRes.json();
    assert.equal(undoBody.success, true);
    assertNoSensitiveLeak(undoBody, "POST /api/reception/undo-checkout");

    const pubCoRes = await fetch(`${BASE_URL}/api/public/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flatNumber: "704" })
    });
    assert.equal(pubCoRes.status, 200);
    const pubCoBody = await pubCoRes.json();
    assert.equal(pubCoBody.success, true);
    assertNoSensitiveLeak(pubCoBody, "POST /api/public/checkout");
  });

  it("Rotas públicas SPA (/portaria, /tablet, /recepcao, /reception) respondem 200 sem login e paridade twin-server está 100% íntegra", async () => {
    for (const spaRoute of [
      "/portaria",
      "/portaria?res=RES-FUT03&action=send-checkin-link",
      "/portaria?res=RES-FUT03&action=verify-early-checkin",
      "/tablet",
      "/recepcao",
      "/reception"
    ]) {
      const r = await fetch(`${BASE_URL}${spaRoute}`, { redirect: "manual" });
      assert.equal(r.status, 200, `Rota pública ${spaRoute} deve responder HTTP 200 sem redirecionar para login`);
      const html = await r.text();
      assert.ok(html.includes("<div id=\"root\">"), `Rota ${spaRoute} deve servir o bundle SPA`);
    }

    const repoRoot = process.cwd();
    const shaDemoApi = crypto.createHash("sha256").update(fs.readFileSync(path.join(repoRoot, "artifacts", "api-server", "demo-server.mjs"))).digest("hex");
    const shaDemoScripts = crypto.createHash("sha256").update(fs.readFileSync(path.join(repoRoot, "scripts", "demo-server.mjs"))).digest("hex");
    assert.equal(shaDemoApi, shaDemoScripts, "Paridade SHA-256 obrigatória em demo-server.mjs");

    const shaMailApi = crypto.createHash("sha256").update(fs.readFileSync(path.join(repoRoot, "artifacts", "api-server", "mail-service.mjs"))).digest("hex");
    const shaMailScripts = crypto.createHash("sha256").update(fs.readFileSync(path.join(repoRoot, "scripts", "mail-service.mjs"))).digest("hex");
    assert.equal(shaMailApi, shaMailScripts, "Paridade SHA-256 obrigatória em mail-service.mjs");
  });
});

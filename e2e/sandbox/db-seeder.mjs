/**
 * e2e/sandbox/db-seeder.mjs
 * 
 * Safe deterministic database seeder for E2E Synthetic Testing.
 * Clones and sanitizes production data into an isolated test file (data/database.test.json).
 * NEVER modifies or writes to data/database.json.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_PROD_DB = path.resolve(process.cwd(), "data/database.json");
const DEFAULT_TEST_DB = path.resolve(process.cwd(), "data/database.test.json");

const REQUIRED_19_FLATS = [
  { id: 1, number: "113", colName: "113 solteiro", isOccupied: false },
  { id: 2, number: "114", colName: "114 Solteiro", isOccupied: false },
  { id: 3, number: "116", colName: "116", isOccupied: false },
  { id: 4, number: "211", colName: "211 de casal", isOccupied: false },
  { id: 5, number: "212", colName: "212 solteiro", isOccupied: false },
  { id: 6, number: "215", colName: "215 Solteiro", isOccupied: false },
  { id: 7, number: "313", colName: "313 solteiro", isOccupied: false },
  { id: 8, number: "408", colName: "408 casal", isOccupied: false },
  { id: 10, number: "509", colName: "509 casal", isOccupied: false },
  { id: 11, number: "511", colName: "511 casal", isOccupied: false },
  { id: 12, number: "512", colName: "512 casal", isOccupied: false },
  { id: 13, number: "605", colName: "605 solteiro", isOccupied: false },
  { id: 14, number: "712", colName: "712 Solteiro SPLIT", isOccupied: false },
  { id: 15, number: "715", colName: "715 Solteiro", isOccupied: false },
  { id: 16, number: "904", colName: "904 split", isOccupied: false },
  { id: 17, number: "905", colName: "905 split", isOccupied: false },
  { id: 18, number: "907", colName: "X 907 casal", isOccupied: false },
  { id: 19, number: "1004", colName: "1004 Solteiro X", isOccupied: false },
  { id: 21, number: "1304", colName: "1304 Solteiro(ferro unindo)", isOccupied: false }
];

/**
 * Seeds and sanitizes test database file.
 * @param {object} options
 * @param {string} [options.prodDbPath] - Path to source DB (read-only)
 * @param {string} [options.testDbPath] - Path to output test DB
 * @param {number} [options.zapiPort=5056] - Local Z-API mock port
 * @param {number} [options.smtpPort=5025] - Local SMTP mock port
 * @param {object} [options.overrides={}] - Custom DB keys to override
 * @returns {object} The seeded database object
 */
export function seedTestDatabase(options = {}) {
  const prodPath = options.prodDbPath ? path.resolve(options.prodDbPath) : DEFAULT_PROD_DB;
  const testPath = options.testDbPath ? path.resolve(options.testDbPath) : DEFAULT_TEST_DB;
  const zapiPort = options.zapiPort || 5056;
  const smtpPort = options.smtpPort || 5025;
  const overrides = options.overrides || {};

  if (path.resolve(testPath) === path.resolve(prodPath)) {
    throw new Error("[db-seeder] REFUSING TO SEED: testDbPath cannot be identical to production database.json!");
  }

  let baseData = {};
  if (fs.existsSync(prodPath)) {
    try {
      const raw = fs.readFileSync(prodPath, "utf-8");
      baseData = JSON.parse(raw);
    } catch (err) {
      console.warn("[db-seeder] Warning: could not parse source DB, starting from clean structure:", err.message);
      baseData = {};
    }
  }

  // Clone deeply
  const db = JSON.parse(JSON.stringify(baseData));

  // 1. Ensure required collections exist
  const collections = [
    "users", "flats", "reservations", "serviceOrders", "serviceWorkers",
    "cleaningRequests", "guests", "guestAccounts", "settings", "zapiConfig",
    "auditLogs", "notifications", "garageAuthorizations", "breakfastOrders",
    "periodicTasks", "observations", "surveys", "reviews", "invoices"
  ];
  for (const c of collections) {
    if (!db[c]) {
      db[c] = (c === "settings" || c === "zapiConfig") ? {} : [];
    }
  }

  // 2. Ensure test users exist (Admin, Cris, Grazi, Reception, Guest)
  const defaultUsers = [
    {
      id: 1,
      username: "admin",
      role: "admin",
      passwordHash: "33ed242a965ae4a1efaac79d3ed8e991:8267b1ebf53b595f0674a8eb071ac175b21de86523e91b13d14ecdd359a105f0"
    },
    {
      id: 2,
      username: "Cris",
      role: "camareira",
      name: "Cris",
      phone: "22988486446",
      whatsapp: "5522988486446",
      pixKey: "22988486446",
      active: true
    },
    {
      id: 3,
      username: "Grazi",
      role: "camareira",
      name: "Grazi",
      phone: "22999106204",
      whatsapp: "5522999106204",
      pixKey: "12977795766",
      active: true
    },
    {
      id: 4,
      username: "Soho@promenade.com.br",
      name: "Recepção Soho",
      role: "recepcao",
      active: true
    }
  ];

  for (const u of defaultUsers) {
    const idx = db.users.findIndex(existing => existing.id === u.id || existing.username === u.username);
    if (idx >= 0) {
      db.users[idx] = { ...db.users[idx], ...u };
    } else {
      db.users.push(u);
    }
  }

  // 3. Ensure all 19 active flats exist
  const existingFlatsMap = new Map((db.flats || []).map(f => [String(f.number), f]));
  db.flats = REQUIRED_19_FLATS.map(reqFlat => {
    const existing = existingFlatsMap.get(String(reqFlat.number));
    return existing ? { ...existing, ...reqFlat, id: reqFlat.id } : { ...reqFlat };
  });

  // 4. Configure Interceptors in Database Settings (Point to local mock ports)
  db.zapiConfig = {
    ...db.zapiConfig,
    baseUrl: `http://127.0.0.1:${zapiPort}`,
    instanceId: "SANDBOX_MOCK_INSTANCE",
    token: "SANDBOX_MOCK_TOKEN",
    clientToken: "SANDBOX_MOCK_CLIENT_TOKEN",
    enabled: true,
    testModeOnly: false
  };

  db.settings = db.settings || {};
  db.settings.emailSettings = {
    host: "127.0.0.1",
    port: Number(smtpPort),
    user: "sandbox@corpflats.local",
    pass: "sandbox",
    fromName: "CorpFlats Sandbox",
    fromEmail: "reservas@corpflats.local",
    secure: false,
    smtpHost: "127.0.0.1",
    smtpPort: Number(smtpPort),
    smtpUser: "sandbox@corpflats.local",
    smtpPass: "sandbox",
    smtpFrom: "reservas@corpflats.local",
    smtpSecure: false
  };

  // 5. Seed Deterministic Sample Reservations for Test Scenarios
  const now = new Date();
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  const tomorrowDate = new Date(now.getTime() + 86400000);
  const tomorrowIso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(tomorrowDate);

  const sampleReservations = [
    {
      id: 9001,
      code: "RES-TEST-CHECKIN-TODAY",
      guestName: "Roberto Carlos Silva",
      guestEmail: "roberto.carlos@teste.corpflats",
      guestPhone: "5522998877661",
      guestDocument: "12345678901",
      flatNumber: "211",
      checkinDate: todayIso,
      checkoutDate: tomorrowIso,
      nights: 1,
      totalAmount: 350.00,
      paidAmount: 350.00,
      paymentStatus: "pago_total",
      status: "confirmada",
      isPaid: true,
      channel: "Direto Site",
      accessCode: "9988#",
      estimatedArrivalTime: "14:30",
      guests: [
        {
          name: "Roberto Carlos Silva",
          cpf: "12345678901",
          email: "roberto.carlos@teste.corpflats",
          phone: "5522998877661",
          hasCompletedCheckin: true
        }
      ]
    },
    {
      id: 9002,
      code: "RES-TEST-RETURNING-GUEST",
      guestName: "Mariana Alcantara",
      guestEmail: "mariana.alcantara@teste.corpflats",
      guestPhone: "5522998877662",
      guestDocument: "98765432100",
      docPhotoUrl: "/storage/test-docs/mariana-cnh.jpg",
      selfieUrl: "/storage/test-docs/mariana-selfie.jpg",
      flatNumber: "113",
      checkinDate: todayIso,
      checkoutDate: tomorrowIso,
      nights: 1,
      totalAmount: 290.00,
      paidAmount: 290.00,
      paymentStatus: "pago_total",
      status: "confirmada",
      isPaid: true,
      channel: "Direto WhatsApp",
      fnhrCompleted: true,
      guests: [
        {
          name: "Mariana Alcantara",
          cpf: "98765432100",
          docPhotoUrl: "/storage/test-docs/mariana-cnh.jpg",
          selfieUrl: "/storage/test-docs/mariana-selfie.jpg"
        }
      ]
    },
    {
      id: 9003,
      code: "RES-TEST-VEHICLE-PERSIST",
      guestName: "Carlos Eduardo Mendes",
      guestEmail: "carlos.mendes@teste.corpflats",
      guestPhone: "5522998877663",
      guestDocument: "45678912300",
      flatNumber: "408",
      checkinDate: todayIso,
      checkoutDate: tomorrowIso,
      nights: 1,
      totalAmount: 320.00,
      paidAmount: 320.00,
      paymentStatus: "pago_total",
      status: "confirmada",
      isPaid: true,
      channel: "Direto Site",
      vehicle: {
        plate: "KRT9F82",
        brand: "Toyota",
        model: "Corolla Cross",
        color: "Prata Metálico"
      }
    },
    {
      id: 9004,
      code: "RES-TEST-PIX-PENDING",
      guestName: "Juliana Peixoto",
      guestEmail: "juliana.peixoto@teste.corpflats",
      guestPhone: "5522998877664",
      guestDocument: "78912345600",
      flatNumber: "511",
      checkinDate: todayIso,
      checkoutDate: tomorrowIso,
      nights: 1,
      totalAmount: 280.00,
      paidAmount: 0.00,
      paymentStatus: "aguardando_pix",
      paymentMethod: "pix",
      status: "pendente",
      isPaid: false,
      channel: "Direto Site",
      pixTxId: "PIX_SANDBOX_TX_001",
      pixCopiaECola: "00020101021226930014BR.GOV.BCB.PIX2571spi-qrcode.bancointer.com.br/spi/pj/v2/mock998877665544332211005204000053039865406280.005802BR5901*6013CAMPOS_DOS_GO61082802014062070503***6304MOCK"
    },
    {
      id: 9005,
      code: "RES-TEST-ZERO-AMNESIA",
      guestName: "Mariana Alcantara",
      guestEmail: "mariana.alcantara@teste.corpflats",
      guestPhone: "5522998877662",
      guestDocument: "98765432100",
      flatNumber: "114",
      checkinDate: todayIso,
      checkoutDate: tomorrowIso,
      nights: 1,
      totalAmount: 290.00,
      paidAmount: 290.00,
      paymentStatus: "pago_total",
      status: "confirmada",
      isPaid: true,
      channel: "Direto WhatsApp",
      travelReason: "Negócios / Trabalho",
      transportMethod: "Avião",
      originCity: "Rio de Janeiro",
      originState: "RJ",
      destinationCity: "Campos dos Goytacazes",
      destinationState: "RJ",
      fnhrCompleted: false,
      hasPreCheckin: false
    },
    {
      id: 9006,
      code: "RES-TEST-LOCK-14H",
      guestName: "Rodrigo Mendonca",
      guestEmail: "rodrigo.mendonca@teste.corpflats",
      guestPhone: "5522998877665",
      guestDocument: "32165498700",
      flatNumber: "212",
      checkinDate: todayIso,
      checkoutDate: tomorrowIso,
      nights: 1,
      totalAmount: 310.00,
      paidAmount: 310.00,
      paymentStatus: "pago_total",
      status: "confirmada",
      isPaid: true,
      channel: "Direto Site",
      accessCode: "4321#",
      fnhrCompleted: true,
      hasPreCheckin: true
    },
    {
      id: 9007,
      code: "RES-TEST-COMPANION-ISO",
      guestName: "Alice Silveira",
      guestEmail: "alice.silveira@teste.corpflats",
      guestPhone: "5522998877666",
      guestDocument: "11122233344",
      flatNumber: "215",
      checkinDate: todayIso,
      checkoutDate: tomorrowIso,
      nights: 1,
      totalAmount: 340.00,
      paidAmount: 340.00,
      paymentStatus: "pago_total",
      status: "confirmada",
      isPaid: true,
      guestCount: 2,
      channel: "Direto Site",
      guests: [
        {
          index: 1,
          name: "Alice Silveira",
          cpf: "11122233344",
          phone: "5522998877666",
          email: "alice.silveira@teste.corpflats",
          hasCompletedCheckin: true,
          checkinCompletedAt: todayIso
        },
        {
          index: 2,
          name: "Hóspede 2",
          cpf: "",
          phone: "",
          email: "",
          hasCompletedCheckin: false
        }
      ]
    },
    {
      id: 9008,
      code: "RES-TEST-MOBILE-SIGN",
      guestName: "Gabriel Siqueira",
      guestEmail: "gabriel.siqueira@teste.corpflats",
      guestPhone: "5522998877667",
      guestDocument: "22233344455",
      flatNumber: "305",
      checkinDate: todayIso,
      checkoutDate: tomorrowIso,
      nights: 1,
      totalAmount: 300.00,
      paidAmount: 300.00,
      paymentStatus: "pago_total",
      status: "confirmada",
      isPaid: true,
      channel: "Direto Site",
      fnhrCompleted: false,
      hasPreCheckin: false,
      travelReason: "Lazer / Férias",
      transportMethod: "Avião",
      originCity: "São Paulo",
      originState: "SP",
      destinationCity: "Campos dos Goytacazes",
      destinationState: "RJ",
      guests: [
        {
          index: 1,
          name: "Gabriel Siqueira",
          cpf: "22233344455",
          email: "gabriel.siqueira@teste.corpflats",
          phone: "5522998877667",
          hasCompletedCheckin: false
        }
      ]
    }
  ];

  // Merge sample reservations safely
  for (const sRes of sampleReservations) {
    const idx = db.reservations.findIndex(r => r.code === sRes.code);
    if (idx >= 0) {
      db.reservations[idx] = { ...db.reservations[idx], ...sRes };
    } else {
      db.reservations.push(sRes);
    }
  }

  // 5b. Seed Deterministic Returning Guests for Zero Amnesia Journey
  const sampleGuests = [
    {
      id: 501,
      guestCode: "HOSP-00501",
      fullName: "Mariana Alcantara",
      name: "Mariana Alcantara",
      documentNumber: "98765432100",
      document: "98765432100",
      phone: "5522998877662",
      email: "mariana.alcantara@teste.corpflats",
      birthDate: "1992-05-18",
      address: "Rua das Flores, 120",
      street: "Rua das Flores",
      streetNumber: "120",
      neighborhood: "Centro",
      city: "Campos dos Goytacazes",
      state: "RJ",
      cep: "28010-000",
      docPhotoUrl: "/storage/test-docs/mariana-cnh.jpg",
      photoUrl: "/storage/test-docs/mariana-selfie.jpg",
      travelReason: "Negócios / Trabalho",
      transportMethod: "Avião",
      originCity: "Rio de Janeiro",
      originState: "RJ",
      destinationCity: "Campos dos Goytacazes",
      destinationState: "RJ",
      fnhrCompleted: true
    }
  ];

  for (const sg of sampleGuests) {
    const idx = db.guests.findIndex(g => g.id === sg.id || g.documentNumber === sg.documentNumber);
    if (idx >= 0) {
      db.guests[idx] = { ...db.guests[idx], ...sg };
    } else {
      db.guests.push(sg);
    }
  }

  // 5c. Seed Guest Accounts for Multichannel Account Portal Journey
  const sampleGuestAccounts = [
    {
      id: 601,
      name: "Roberto Carlos Silva",
      email: "roberto.carlos@teste.corpflats",
      phone: "5522998877661",
      document: "12345678901",
      vehicle: {
        plate: "KRT9F82",
        brand: "Toyota",
        model: "Corolla",
        color: "Prata"
      }
    }
  ];

  for (const sga of sampleGuestAccounts) {
    const idx = db.guestAccounts.findIndex(ga => ga.id === sga.id || ga.email === sga.email);
    if (idx >= 0) {
      db.guestAccounts[idx] = { ...db.guestAccounts[idx], ...sga };
    } else {
      db.guestAccounts.push(sga);
    }
  }

  // 5d. Seed Cleaning Request for Flat 212 (Lock 14h Test)
  const sampleCleaningRequests = [
    {
      id: 9101,
      flatId: 5,
      flatNumber: "212",
      requestDate: todayIso,
      status: "cleaning_now",
      assignedTo: 2,
      startedAt: new Date().toISOString()
    }
  ];

  for (const scr of sampleCleaningRequests) {
    const idx = db.cleaningRequests.findIndex(cr => cr.id === scr.id || (String(cr.flatNumber) === String(scr.flatNumber) && cr.requestDate === scr.requestDate));
    if (idx >= 0) {
      db.cleaningRequests[idx] = { ...db.cleaningRequests[idx], ...scr };
    } else {
      db.cleaningRequests.push(scr);
    }
  }

  // 6. Seed Sample Service Order for Testing
  const sampleServiceOrder = {
    id: 101,
    title: "Pintura & Reparos Sandbox",
    token: "tok_sandbox_worker_12345",
    status: "active",
    cleanFlatMode: "priority",
    maxSimultaneousFlats: 2,
    maxFlatsPerDay: 4,
    requirePhotos: true,
    estimatedDurationHours: 3,
    instructionFormat: "text",
    createdAt: new Date().toISOString(),
    createdBy: "admin",
    flats: [
      {
        flatId: 1,
        flatNumber: "113",
        instructions: "Retocar pintura da sala e quarto",
        status: "pending",
        startedAt: null,
        finishedAt: null,
        workerName: null,
        workerCpf: null,
        photos: [],
        needsCleaning: null
      },
      {
        flatId: 2,
        flatNumber: "114",
        instructions: "Trocar lâmpadas e vedação do banheiro",
        status: "pending",
        startedAt: null,
        finishedAt: null,
        workerName: null,
        workerCpf: null,
        photos: [],
        needsCleaning: null
      }
    ]
  };

  const soIdx = db.serviceOrders.findIndex(so => so.token === sampleServiceOrder.token);
  if (soIdx >= 0) {
    db.serviceOrders[soIdx] = { ...db.serviceOrders[soIdx], ...sampleServiceOrder };
  } else {
    db.serviceOrders.push(sampleServiceOrder);
  }

  // Apply any custom overrides requested by caller
  for (const [key, val] of Object.entries(overrides)) {
    db[key] = val;
  }

  // Ensure target directory exists
  const targetDir = path.dirname(testPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Write isolated test DB
  fs.writeFileSync(testPath, JSON.stringify(db, null, 2), "utf-8");

  return db;
}

/**
 * Resets test database back to seeded baseline.
 */
export function resetTestDatabase(options = {}) {
  return seedTestDatabase(options);
}

/**
 * Removes test database file if it exists.
 */
export function cleanTestDatabase(options = {}) {
  const testPath = options.testDbPath ? path.resolve(options.testDbPath) : DEFAULT_TEST_DB;
  if (fs.existsSync(testPath)) {
    fs.unlinkSync(testPath);
  }
}

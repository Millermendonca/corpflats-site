/**
 * Targeted Test Suite: Pre-check-in Immediate Server Autosave & CRM Sync
 * File: tests/pre-checkin-autosave.test.mjs
 * Execution: node --test tests/pre-checkin-autosave.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 4098;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-precheckin-autosave-db-${Date.now()}.json`);

const TINY_PNG_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

function getDb() {
  return JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
}

describe("Targeted Test: Pre-Checkin Immediate Server Autosave & CRM Persistence", () => {
  const RES_TIT = "RES-AUTO-TIT";
  const RES_NEW = "RES-AUTO-NEW";
  const RES_PRE = "RES-AUTO-PRE";
  const RES_DONE = "RES-AUTO-DONE";

  before(async () => {
    try {
      const netstatOutput = execSync(`netstat -ano | findstr :${TEST_PORT}`, { encoding: "utf8" });
      for (const line of netstatOutput.split("\n")) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(Number(pid))) {
          killProcessTree(Number(pid));
        }
      }
    } catch (_) {}

    const initialDb = fs.existsSync(prodDbPath) ? JSON.parse(fs.readFileSync(prodDbPath, "utf-8")) : {};
    initialDb.reservations = (initialDb.reservations || []).filter(
      r => ![RES_TIT, RES_NEW, RES_PRE, RES_DONE].includes(r.code)
    );
    initialDb.guests = (initialDb.guests || []).filter(g => ![99501, 99502].includes(Number(g.id)));
    initialDb.guestAccounts = (initialDb.guestAccounts || []).filter(a => Number(a.id) !== 99601);
    initialDb.zapiConfig = {};

    initialDb.guests.push(
      {
        id: 99501,
        accountId: 99601,
        guestCode: "HOSP-99501",
        name: "Ana Clara Souza",
        fullName: "Ana Clara Souza",
        document: "111.444.777-35",
        documentNumber: "111.444.777-35",
        docType: "CPF",
        phone: "(22) 99911-2233",
        email: "ana.clara@teste.com"
      },
      {
        id: 99502,
        guestCode: "HOSP-99502",
        name: "Carlos Eduardo Lima",
        fullName: "Carlos Eduardo Lima",
        document: "529.982.247-25",
        documentNumber: "529.982.247-25",
        docType: "CPF",
        phone: "(21) 98888-7766",
        email: "carlos.lima@teste.com"
      }
    );

    initialDb.guestAccounts.push({
      id: 99601,
      guestId: 99501,
      guestCode: "HOSP-99501",
      name: "Ana Clara Souza",
      document: "11144477735",
      phone: "(22) 99911-2233",
      email: "ana.clara@teste.com"
    });

    initialDb.reservations.push(
      {
        id: 99701,
        code: RES_TIT,
        flatNumber: "101",
        status: "confirmada",
        guestCount: 2,
        adults: 2,
        guestId: 99501,
        guestCode: "HOSP-99501",
        guestName: "Ana Clara Souza",
        guestDocument: "111.444.777-35",
        guestPhone: "(22) 99911-2233",
        guestEmail: "ana.clara@teste.com",
        checkinDate: "2027-05-10",
        checkoutDate: "2027-05-15",
        fnhrCompleted: false,
        preCheckinCompleted: false
      },
      {
        id: 99702,
        code: RES_NEW,
        flatNumber: "102",
        status: "confirmada",
        guestCount: 2,
        adults: 2,
        guestId: null,
        guestName: "Hóspede",
        guestDocument: "",
        guestPhone: "",
        guestEmail: "",
        checkinDate: "2027-06-10",
        checkoutDate: "2027-06-15",
        fnhrCompleted: false,
        preCheckinCompleted: false
      },
      {
        id: 99703,
        code: RES_PRE,
        flatNumber: "103",
        channel: "Site Direto",
        status: "pre_reserva",
        guestCount: 1,
        guestName: "Pre Reserva Teste",
        checkinDate: "2027-07-01",
        checkoutDate: "2027-07-03"
      },
      {
        id: 99704,
        code: RES_DONE,
        flatNumber: "104",
        status: "confirmada",
        guestCount: 1,
        guestName: "Concluido Teste",
        checkinDate: "2027-07-10",
        checkoutDate: "2027-07-12",
        fnhrCompleted: true,
        guests: [
          {
            index: 1,
            name: "Concluido Teste",
            cpf: "111.444.777-35",
            hasCompletedCheckin: true,
            needsReSignature: false
          }
        ]
      }
    );

    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
      cwd: rootDir,
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        DATA_FILE: isolatedDbPath,
        DATABASE_FILE: isolatedDbPath,
        PMS_DATABASE_PATH: isolatedDbPath,
        NODE_ENV: "test"
      },
      stdio: "pipe"
    });

    let serverLogs = "";
    serverProcess.stdout?.on("data", d => { serverLogs += d.toString(); });
    serverProcess.stderr?.on("data", d => { serverLogs += d.toString(); });

    let isReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const resp = await fetch(`${BASE_URL}/api/system/version`);
        if (resp.ok) {
          isReady = true;
          break;
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 250));
    }
    if (!isReady) {
      throw new Error(`Isolated test server failed to start on port ${TEST_PORT}. Logs:\n${serverLogs}`);
    }
  });

  after(() => {
    if (serverProcess && serverProcess.pid) {
      killProcessTree(serverProcess.pid);
    }
    if (fs.existsSync(isolatedDbPath)) {
      try {
        fs.unlinkSync(isolatedDbPath);
      } catch (_) {}
    }
  });

  it("1. Titular autosave persists immediately to CRM (db.guests, guestAccounts) and reservation without completing check-in", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/pre-checkin/${RES_TIT}/autosave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestIndex: 1,
        clientSessionId: "sess-1",
        clientSeq: 2,
        step: 2,
        fullName: "Ana Clara Souza",
        document: "111.444.777-35",
        phone: "(22) 99911-2233",
        email: "ana.clara@teste.com",
        birthDate: "1993-04-12",
        birthDateInput: "12/04/1993",
        gender: "feminino",
        cep: "22041-001",
        street: "Av. Nossa Senhora de Copacabana",
        streetNumber: "540",
        complement: "Apto 802",
        neighborhood: "Copacabana",
        city: "Rio de Janeiro",
        state: "RJ",
        address: "Av. Nossa Senhora de Copacabana, 540 - Apto 802 - Copacabana",
        travelReason: "Negócios / Trabalho",
        transportMethod: "Carro próprio",
        estimatedArrivalTime: "16:00",
        originCity: "Rio de Janeiro",
        originState: "RJ",
        destinationCity: "Campos dos Goytacazes",
        destinationState: "RJ",
        vehiclePlate: "ABC1D23",
        vehicleBrand: "Honda",
        vehicleModel: "Civic",
        vehicleColor: "Preto",
        optInMarketing: true,
        acceptedHouseRules: true,
        acceptedContract: true,
        legalDeclarationAccepted: true,
        signatureDraftBase64: TINY_PNG_BASE64
      })
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.ok, true);
    assert.strictEqual(json.guestCode, "HOSP-99501");

    const db = getDb();
    const g = db.guests.find(x => Number(x.id) === 99501);
    const acc = db.guestAccounts.find(x => Number(x.id) === 99601);
    const r = db.reservations.find(x => x.code === RES_TIT);

    // Check-in MUST remain incomplete and signatureUrl untouched
    assert.strictEqual(Boolean(r.fnhrCompleted), false);
    assert.strictEqual(Boolean(r.preCheckinCompleted), false);
    assert.strictEqual(r.guests[0].hasCompletedCheckin, false);
    assert.strictEqual(r.guests[0].signatureUrl, null);
    assert.strictEqual(r.signatureUrl ?? null, null);

    // CRM record updated immediately
    assert.strictEqual(g.cep, "22041001");
    assert.strictEqual(g.street, "Av. Nossa Senhora de Copacabana");
    assert.strictEqual(g.streetNumber, "540");
    assert.strictEqual(g.complement, "Apto 802");
    assert.strictEqual(g.city, "Rio de Janeiro");
    assert.strictEqual(g.birthDate, "1993-04-12");
    assert.strictEqual(g.vehiclePlate, "ABC1D23");
    assert.strictEqual(g.vehicle.model, "Civic");
    assert.strictEqual(g.optInMarketing, true);

    // Linked account updated
    assert.strictEqual(acc.cep, "22041001");
    assert.strictEqual(acc.streetNumber, "540");
    assert.strictEqual(acc.vehicle.plate, "ABC1D23");

    // Reservation + slot + draft updated
    assert.strictEqual(r.guestCep, "22041-001");
    assert.strictEqual(r.vehicle.plate, "ABC1D23");
    assert.strictEqual(r.guests[0].preCheckinDraft.step, 2);
    assert.strictEqual(r.guests[0].preCheckinDraft.signatureBase64, TINY_PNG_BASE64);
    assert.strictEqual(r.guests[0].preCheckinDraft.legalDeclarationAccepted, true);
  });

  it("2. GET /api/pms/pre-checkin/:code restores saved draft & CRM fields after simulated page reload", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/pre-checkin/${RES_TIT}?guest=1`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.guest.street, "Av. Nossa Senhora de Copacabana");
    assert.strictEqual(data.reservation.vehicle.plate, "ABC1D23");
    assert.strictEqual(data.guests[0].preCheckinDraft.step, 2);
    assert.strictEqual(data.guests[0].preCheckinDraft.complement, "Apto 802");
    assert.strictEqual(data.guests[0].preCheckinDraft.signatureBase64, TINY_PNG_BASE64);
    assert.strictEqual(data.guests[0].signatureUrl, null);
  });

  it("3. Partial/invalid identity inputs stay in preCheckinDraft without corrupting valid CRM fields", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/pre-checkin/${RES_TIT}/autosave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestIndex: 1,
        clientSessionId: "sess-1",
        clientSeq: 3,
        document: "111.444",
        phone: "(22) 99",
        email: "ana.clara@",
        complement: ""
      })
    });
    assert.strictEqual(res.status, 200);

    const db = getDb();
    const g = db.guests.find(x => Number(x.id) === 99501);
    const r = db.reservations.find(x => x.code === RES_TIT);

    // CRM keeps valid values
    assert.strictEqual(g.document, "111.444.777-35");
    assert.strictEqual(g.phone, "(22) 99911-2233");
    assert.strictEqual(g.email, "ana.clara@teste.com");
    // Explicit empty complement cleared
    assert.strictEqual(g.complement, "");
    // Draft keeps mid-typing strings for reload
    assert.strictEqual(r.guests[0].preCheckinDraft.document, "111.444");
    assert.strictEqual(r.guests[0].preCheckinDraft.phone, "(22) 99");
    assert.strictEqual(r.guests[0].preCheckinDraft.email, "ana.clara@");
  });

  it("4. Stale out-of-order clientSeq for same clientSessionId is ignored without overwriting newer fields", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/pre-checkin/${RES_TIT}/autosave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestIndex: 1,
        clientSessionId: "sess-1",
        clientSeq: 1,
        city: "Cidade Antiga",
        streetNumber: "999"
      })
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.stale, true);

    const db = getDb();
    const g = db.guests.find(x => Number(x.id) === 99501);
    assert.strictEqual(g.city, "Rio de Janeiro");
    assert.strictEqual(g.streetNumber, "540");
  });

  it("5. Media upload (docPhotoBase64 / minorAuthDocBase64) persists and clearDocPhoto blocks resurrection on GET", async () => {
    const uploadRes = await fetch(`${BASE_URL}/api/pms/pre-checkin/${RES_TIT}/autosave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestIndex: 1,
        clientSessionId: "sess-1",
        clientSeq: 4,
        docPhotoBase64: TINY_PNG_BASE64,
        minorAuthDocBase64: TINY_PNG_BASE64,
        aiDocResult: {
          isOfficialDocument: true,
          isLegible: true,
          extractedName: "Ana Clara Souza",
          summary: "Documento validado"
        }
      })
    });
    assert.strictEqual(uploadRes.status, 200);
    const uploadJson = await uploadRes.json();
    assert.ok(uploadJson.docPhotoUrl, "docPhotoUrl should be returned");
    assert.ok(uploadJson.minorAuthDocUrl, "minorAuthDocUrl should be returned");

    // Now user clicks "Trocar Documento" (clearDocPhoto: true)
    const clearRes = await fetch(`${BASE_URL}/api/pms/pre-checkin/${RES_TIT}/autosave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestIndex: 1,
        clientSessionId: "sess-1",
        clientSeq: 5,
        clearDocPhoto: true
      })
    });
    assert.strictEqual(clearRes.status, 200);
    const clearJson = await clearRes.json();
    assert.strictEqual(clearJson.docPhotoUrl, null);

    // Subsequent GET must NOT resurrect old docPhotoUrl into guests[0].docPhotoUrl
    const getRes = await fetch(`${BASE_URL}/api/pms/pre-checkin/${RES_TIT}?guest=1`);
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.guests[0].docPhotoUrl, null);
    assert.strictEqual(getData.guests[0].preCheckinDraft.docPhotoCleared, true);
  });

  it("6. Companion (guestIndex 2) autosave creates isolated companion CRM record without touching titular", async () => {
    const compRes = await fetch(`${BASE_URL}/api/pms/pre-checkin/${RES_TIT}/autosave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestIndex: 2,
        clientSessionId: "sess-comp",
        clientSeq: 1,
        fullName: "Lucas Ferreira Dias",
        phone: "(31) 99777-1122",
        email: "lucas.dias@teste.com",
        city: "Belo Horizonte",
        state: "MG",
        transportMethod: "Carro próprio",
        vehiclePlate: "COMP222",
        vehicleBrand: "VW",
        vehicleModel: "Polo",
        vehicleColor: "Branco"
      })
    });
    assert.strictEqual(compRes.status, 200);
    const compJson = await compRes.json();
    assert.ok(compJson.guestId && Number(compJson.guestId) !== 99501, "Companion must have its own guestId");

    const db = getDb();
    const titular = db.guests.find(x => Number(x.id) === 99501);
    const companion = db.guests.find(x => Number(x.id) === Number(compJson.guestId));
    const r = db.reservations.find(x => x.code === RES_TIT);

    assert.strictEqual(titular.name, "Ana Clara Souza");
    assert.strictEqual(titular.vehiclePlate, "ABC1D23");
    assert.strictEqual(r.guestName, "Ana Clara Souza");
    assert.strictEqual(r.vehicle.plate, "ABC1D23");

    assert.ok(companion);
    assert.strictEqual(companion.fullName, "Lucas Ferreira Dias");
    assert.strictEqual(companion.city, "Belo Horizonte");
    assert.strictEqual(companion.vehiclePlate, "COMP222");
    assert.strictEqual(r.guests[1].guestId, companion.id);
    assert.strictEqual(r.guests[1].vehicle.plate, "COMP222");
  });

  it("7. Temporary autosave guest self-heals & deduplicates when matching valid CPF arrives later", async () => {
    // First autosave: name only (creates temp CRM guest)
    const firstRes = await fetch(`${BASE_URL}/api/pms/pre-checkin/${RES_NEW}/autosave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestIndex: 1,
        clientSessionId: "sess-new",
        clientSeq: 1,
        fullName: "Carlos Eduardo Lima",
        street: "Rua das Flores"
      })
    });
    assert.strictEqual(firstRes.status, 200);
    const firstJson = await firstRes.json();
    const tempGuestId = Number(firstJson.guestId);
    assert.ok(tempGuestId && tempGuestId !== 99502);

    // Second autosave: user types valid CPF matching existing guest 99502 ("Carlos Eduardo Lima")
    const secondRes = await fetch(`${BASE_URL}/api/pms/pre-checkin/${RES_NEW}/autosave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestIndex: 1,
        clientSessionId: "sess-new",
        clientSeq: 2,
        fullName: "Carlos Eduardo Lima",
        document: "529.982.247-25",
        streetNumber: "77"
      })
    });
    assert.strictEqual(secondRes.status, 200);
    const secondJson = await secondRes.json();
    assert.strictEqual(Number(secondJson.guestId), 99502, "Should merge into existing CRM guest 99502");

    const db = getDb();
    assert.strictEqual(db.guests.some(g => Number(g.id) === tempGuestId), false, "Temp duplicate guest must be removed");
    const mergedGuest = db.guests.find(g => Number(g.id) === 99502);
    assert.strictEqual(mergedGuest.street, "Rua das Flores");
    assert.strictEqual(mergedGuest.streetNumber, "77");
  });

  it("8. Guards reject pre_reserva (403) and skip already-completed guests", async () => {
    const preRes = await fetch(`${BASE_URL}/api/pms/pre-checkin/${RES_PRE}/autosave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestIndex: 1, fullName: "Tentativa Bloqueada" })
    });
    assert.strictEqual(preRes.status, 403);

    const doneRes = await fetch(`${BASE_URL}/api/pms/pre-checkin/${RES_DONE}/autosave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestIndex: 1, fullName: "Nome Alterado" })
    });
    assert.strictEqual(doneRes.status, 200);
    const doneJson = await doneRes.json();
    assert.strictEqual(doneJson.skipped, true);

    const db = getDb();
    const rDone = db.reservations.find(x => x.code === RES_DONE);
    assert.strictEqual(rDone.guests[0].name, "Concluido Teste");
  });

  it("9. Final POST /api/pms/pre-checkin cleans up preCheckinDraft and temporary autosave flag", async () => {
    // Request OTP for RES_NEW titular
    const otpReq = await fetch(`${BASE_URL}/api/pms/pre-checkin/${RES_NEW}/whatsapp-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestIndex: 1,
        phone: "21988887766",
        fullName: "Carlos Eduardo Lima",
        channel: "whatsapp"
      })
    });
    assert.strictEqual(otpReq.status, 200);
    const otpJson = await otpReq.json();

    const submitRes = await fetch(`${BASE_URL}/api/pms/pre-checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: RES_NEW,
        guestIndex: 1,
        whatsappOtp: otpJson.otpCode,
        fullName: "Carlos Eduardo Lima",
        phone: "(21) 98888-7766",
        email: "carlos.lima@teste.com",
        document: "529.982.247-25",
        birthDate: "1988-08-15",
        gender: "masculino",
        street: "Rua das Flores",
        streetNumber: "77",
        city: "Niterói",
        state: "RJ",
        cep: "24020-000",
        travelReason: "Lazer / Férias",
        transportMethod: "Aplicativo / Táxi",
        originCity: "Niterói",
        originState: "RJ",
        destinationCity: "Campos dos Goytacazes",
        destinationState: "RJ",
        legalTermsAccepted: true,
        docPhotoBase64: TINY_PNG_BASE64,
        selfieBase64: TINY_PNG_BASE64,
        signatureBase64: TINY_PNG_BASE64
      })
    });
    assert.strictEqual(submitRes.status, 200);

    const db = getDb();
    const r = db.reservations.find(x => x.code === RES_NEW);
    const g = db.guests.find(x => Number(x.id) === 99502);
    assert.strictEqual(r.guests[0].hasCompletedCheckin, true);
    assert.strictEqual(r.guests[0].preCheckinDraft, undefined);
    assert.strictEqual(g.createdFromPreCheckinAutosave, undefined);
  });
});

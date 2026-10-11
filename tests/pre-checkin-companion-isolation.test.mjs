/**
 * Targeted Test Suite: Pre-check-in Companion Phone & Vehicle Isolation
 * File: tests/pre-checkin-companion-isolation.test.mjs
 * Execution: node --test tests/pre-checkin-companion-isolation.test.mjs
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

const TEST_PORT = 4099;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-companion-isolation-db-${Date.now()}.json`);

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

describe("Targeted Test: Companion Pre-Checkin 2FA OTP & Travel/Vehicle Isolation", () => {
  const TEST_RES_CODE = "TEST-ISOLATION-001";
  const TITULAR_PHONE = "22998765432";
  const COMPANION_PHONE = "21987654321";

  before(async () => {
    // 1. Port cleanup if occupied
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

    // 2. Prepare isolated database
    const initialDb = fs.existsSync(prodDbPath) ? JSON.parse(fs.readFileSync(prodDbPath, "utf-8")) : {};
    initialDb.reservations = initialDb.reservations || [];
    initialDb.zapiConfig = {}; // Use simulated WhatsApp OTP in tests

    // Clean previous test entry if any
    initialDb.reservations = initialDb.reservations.filter(r => r.code !== TEST_RES_CODE);

    // Insert test reservation with 2 guests (1 titular with car, 1 companion pending)
    initialDb.reservations.push({
      id: "res-test-isolation-1",
      code: TEST_RES_CODE,
      flat: "101",
      status: "confirmed",
      guestName: "Miller Teste",
      guestPhone: TITULAR_PHONE,
      guestEmail: "miller.titular@teste.com",
      checkinDate: "2026-10-15",
      checkoutDate: "2026-10-20",
      fnhrCompleted: true,
      signatureUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      selfieUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      vehicle: {
        plate: "MILL001",
        brand: "Toyota",
        model: "Corolla",
        color: "Prata"
      },
      guests: [
        {
          index: 1,
          guestCode: "GST-TIT-01",
          name: "Miller Teste",
          phone: TITULAR_PHONE,
          email: "miller.titular@teste.com",
          hasCompletedCheckin: true
        },
        {
          index: 2,
          guestCode: "GST-COMP-02",
          name: "Thamiris Teste",
          phone: "",
          email: "",
          hasCompletedCheckin: false
        }
      ]
    });

    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    // 3. Spawn test server with isolated DB
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
    serverProcess.stdout?.on("data", (d) => { serverLogs += d.toString(); });
    serverProcess.stderr?.on("data", (d) => { serverLogs += d.toString(); });

    // 4. Wait for server readiness using /api/system/version
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
      throw new Error(`Isolated test server failed to start on port ${TEST_PORT}. Server logs:\n${serverLogs}`);
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

  it("1. Titular (guestIndex 1) can request OTP falling back to r.guestPhone if not in body", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/pre-checkin/${TEST_RES_CODE}/whatsapp-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestIndex: 1,
        channel: "whatsapp"
      })
    });

    assert.strictEqual(res.status, 200, "Titular OTP request should succeed");
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.maskedPhone, "Should return masked phone");
    assert.ok(json.maskedPhone.endsWith("5432"), `Masked phone should end with 5432, got: ${json.maskedPhone}`);
  });

  it("2. Companion (guestIndex 2) without phone MUST be rejected with HTTP 400 and NEVER leak titular phone", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/pre-checkin/${TEST_RES_CODE}/whatsapp-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestIndex: 2,
        phone: "", // No phone provided for companion
        channel: "whatsapp"
      })
    });

    assert.strictEqual(res.status, 400, "Companion OTP without phone must return 400 Bad Request");
    const json = await res.json();
    assert.strictEqual(json.success, undefined);
    assert.ok(json.error, "Error message must be present");
    assert.ok(
      json.error.includes("acompanhante"),
      `Error message should mention acompanhante, got: ${json.error}`
    );
  });

  let companionOtpCode = "";

  it("3. Companion (guestIndex 2) with own phone receives OTP strictly masked to their own phone", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/pre-checkin/${TEST_RES_CODE}/whatsapp-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestIndex: 2,
        phone: COMPANION_PHONE,
        channel: "whatsapp"
      })
    });

    assert.strictEqual(res.status, 200, "Companion OTP with phone should return 200 OK");
    const json = await res.json();
    assert.strictEqual(json.success, true);
    companionOtpCode = json.otpCode || "";
    assert.ok(json.maskedPhone, "Should return masked phone");
    assert.ok(
      json.maskedPhone.endsWith("4321"),
      `Masked phone should end with 4321 (companion), got: ${json.maskedPhone}`
    );
    assert.ok(
      !json.maskedPhone.endsWith("5432"),
      "Masked phone must strictly NOT end with titular digits (5432)"
    );
  });

  it("4. Companion pre-checkin saves travelReason, transportMethod and vehicle independently per guest", async () => {
    const compVehicle = {
      plate: "THAM999",
      brand: "Honda",
      model: "Fit",
      color: "Azul"
    };

    const submitRes = await fetch(`${BASE_URL}/api/pms/pre-checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: TEST_RES_CODE,
        guestIndex: 2,
        whatsappOtp: companionOtpCode,
        fullName: "Thamiris Teste",
        phone: COMPANION_PHONE,
        email: "thamiris@teste.com",
        document: "123.456.789-00",
        birthDate: "1992-05-20",
        gender: "feminino",
        travelReason: "Congresso / Feira",
        transportMethod: "Carro próprio",
        vehiclePlate: compVehicle.plate,
        vehicleBrand: compVehicle.brand,
        vehicleModel: compVehicle.model,
        vehicleColor: compVehicle.color,
        originCity: "Rio de Janeiro",
        originState: "RJ",
        destinationCity: "Campos dos Goytacazes",
        destinationState: "RJ",
        legalTermsAccepted: true,
        signatureBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        selfieBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
      })
    });

    if (submitRes.status !== 200) {
      const errJson = await submitRes.json().catch(() => ({}));
      console.error("Subtest 4 failed with status:", submitRes.status, errJson);
    }
    assert.strictEqual(submitRes.status, 200, "Pre-checkin submission should succeed");

    const updatedDb = getDb();
    const reservation = updatedDb.reservations.find(r => r.code === TEST_RES_CODE);
    assert.ok(reservation, "Reservation must exist");

    // Titular vehicle remains untouched
    assert.strictEqual(reservation.vehicle.plate, "MILL001", "Reservation/titular vehicle must remain MILL001");

    // Companion guest entry has their own independent data
    const compGuest = reservation.guests.find(g => g.index === 2);
    assert.ok(compGuest, "Companion guest must exist");
    assert.strictEqual(compGuest.travelReason, "Congresso / Feira", "Companion travel reason must be saved");
    assert.strictEqual(compGuest.transportMethod, "Carro próprio", "Companion transport method must be saved");
    assert.ok(compGuest.vehicle, "Companion vehicle object must be saved");
    assert.strictEqual(compGuest.vehicle.plate, "THAM999", "Companion vehicle plate must be THAM999");
    assert.strictEqual(compGuest.vehicle.brand, "Honda");
    assert.strictEqual(compGuest.vehicle.model, "Fit");
  });
});

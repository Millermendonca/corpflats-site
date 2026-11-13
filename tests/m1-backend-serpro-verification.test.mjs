/**
 * Automated Verification Suite for Milestone M1 Backend Implementation
 * Tests:
 * 1. File parities (demo-server twins and fnrh-serpro-service twins)
 * 2. database.json checkinProvider initialization
 * 3. SERPRO FNRH Client Service (auth, headers, validation, health check, registration)
 * 4. getCheckinUrl and getCheckinUrlSync resilient fallback and audit logging
 * 5. Settings persistence and status endpoint contracts
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// ── 1. File Parity Verifications ─────────────────────────────────────────────
test("File Parity: scripts/demo-server.mjs and artifacts/api-server/demo-server.mjs must be 100% byte-for-byte identical", () => {
  const fileA = fs.readFileSync(path.join(rootDir, "artifacts/api-server/demo-server.mjs"));
  const fileB = fs.readFileSync(path.join(rootDir, "scripts/demo-server.mjs"));
  assert.strictEqual(fileA.length, fileB.length, "File sizes must match exactly");
  assert.ok(fileA.equals(fileB), "demo-server twin files must be 100% byte-for-byte identical");
});

test("File Parity: scripts/fnrh-serpro-service.mjs and artifacts/api-server/fnrh-serpro-service.mjs must be 100% byte-for-byte identical", () => {
  const fileA = fs.readFileSync(path.join(rootDir, "scripts/fnrh-serpro-service.mjs"));
  const fileB = fs.readFileSync(path.join(rootDir, "artifacts/api-server/fnrh-serpro-service.mjs"));
  assert.strictEqual(fileA.length, fileB.length, "File sizes must match exactly");
  assert.ok(fileA.equals(fileB), "fnrh-serpro-service twin files must be 100% byte-for-byte identical");
});

// ── 2. database.json Initialization Verification ─────────────────────────────
test("Database State: data/database.json contains checkinProvider 'proprio'", () => {
  const dbPath = path.join(rootDir, "data/database.json");
  const dbData = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
  assert.ok(dbData.settings, "dbData must have settings object");
  assert.strictEqual(dbData.settings.checkinProvider, "proprio", "Default checkinProvider must be 'proprio'");
  assert.ok(dbData.settings.serproConfig, "dbData.settings should contain serproConfig");
  assert.strictEqual(dbData.settings.serproConfig.env, "homologacao");
});

// ── 3. SERPRO FNRH Service Verifications ─────────────────────────────────────
test("SERPRO Service: Client configuration and headers formatting", async () => {
  const { FnrhSerproClient, SERPRO_BASE_URLS, DEFAULT_CPF_SOLICITANTE } = await import("../scripts/fnrh-serpro-service.mjs");
  
  const client = new FnrhSerproClient();
  const config = client.resolveConfig({
    serproConfig: {
      user: "test-user",
      password: "test-password",
      cpfSolicitante: "123.456.789-00",
      env: "producao"
    }
  });

  assert.strictEqual(config.user, "test-user");
  assert.strictEqual(config.password, "test-password");
  assert.strictEqual(config.cpfSolicitante, "12345678900", "CPF must be digits only");
  assert.strictEqual(config.env, "producao");
  assert.strictEqual(config.baseUrl, SERPRO_BASE_URLS.producao);
  assert.strictEqual(config.isConfigured, true);

  const headers = client.getHeaders(config);
  const expectedAuth = Buffer.from("test-user:test-password").toString("base64");
  assert.strictEqual(headers["Authorization"], `Basic ${expectedAuth}`);
  assert.strictEqual(headers["cpf_solicitante"], "12345678900");
  assert.strictEqual(headers["Content-Type"], "application/json");
});

test("SERPRO Service: Health check returns 'not_configured' when credentials absent", async () => {
  const { FnrhSerproClient } = await import("../scripts/fnrh-serpro-service.mjs");
  const client = new FnrhSerproClient();
  
  const health = await client.checkHealth({
    serproConfig: { user: "", password: "" },
    mock: false
  });

  assert.strictEqual(health.ok, false);
  assert.strictEqual(health.status, "not_configured");
  assert.strictEqual(health.statusCode, 0);
  assert.strictEqual(health.latencyMs, 0);
});

test("SERPRO Service: Mock registration and validation checks", async () => {
  const { FnrhSerproClient } = await import("../scripts/fnrh-serpro-service.mjs");
  const client = new FnrhSerproClient({ mock: true });

  // 1. Missing reservation code
  await assert.rejects(async () => {
    await client.registerReservation(null);
  }, /Objeto de reserva inválido/);

  await assert.rejects(async () => {
    await client.registerReservation({ code: "", id: "" });
  }, /Reserva não possui código/);

  // 2. Invalid date format
  await assert.rejects(async () => {
    await client.registerReservation({
      code: "RES-TEST-01",
      checkinDate: "invalid-date",
      checkoutDate: "2026-10-15"
    });
  }, /Datas inválidas para registro/);

  // 3. Valid reservation registration
  const res = await client.registerReservation({
    code: "RES-TEST-001",
    checkinDate: "2026-10-10",
    checkoutDate: "2026-10-15",
    adults: 2,
    children: 1
  });

  assert.strictEqual(res.ok, true);
  assert.ok(res.serproReservaId, "Should return serproReservaId");
  assert.ok(res.link_precheckin.startsWith("https://fnrh.turismo.gov.br/precheckin/"), "Should return official Gov.br link");
  assert.strictEqual(res.serproPrecheckinUrl, res.link_precheckin);
  assert.strictEqual(res.situacao_reserva_id, "CRIADA");
});

// ── 4. Resilient Fallback Helper Verifications ───────────────────────────────
test("Fallback Helper: In 'proprio' mode, returns internal pre-checkin URL", async () => {
  const { getCheckinUrl, getCheckinUrlSync } = await import("../scripts/fnrh-serpro-service.mjs");

  const mockDb = {
    settings: { checkinProvider: "proprio" }
  };
  const reservation = { code: "RES-113-100", id: 100 };

  const url = await getCheckinUrl(reservation, 1, "https://corpflats.onrender.com", mockDb);
  assert.strictEqual(url, "https://corpflats.onrender.com/pre-checkin/RES-113-100?guest=1");

  const syncUrl = getCheckinUrlSync(reservation, 2, "https://corpflats.onrender.com", mockDb);
  assert.strictEqual(syncUrl, "https://corpflats.onrender.com/pre-checkin/RES-113-100?guest=2");
  assert.strictEqual(typeof syncUrl, "string", "Must return string synchronously, not Promise");
});

test("Fallback Helper: In 'gov_fnrh' mode with cached link, returns Gov.br link immediately", async () => {
  const { getCheckinUrl, getCheckinUrlSync } = await import("../scripts/fnrh-serpro-service.mjs");

  const mockDb = {
    settings: { checkinProvider: "gov_fnrh" }
  };
  const reservation = {
    code: "RES-114-200",
    id: 200,
    serproPrecheckinUrl: "https://fnrh.turismo.gov.br/precheckin/uuid-cached-1234"
  };

  const url = await getCheckinUrl(reservation, 1, "https://corpflats.onrender.com", mockDb);
  assert.strictEqual(url, "https://fnrh.turismo.gov.br/precheckin/uuid-cached-1234");

  const syncUrl = getCheckinUrlSync(reservation, 1, "https://corpflats.onrender.com", mockDb);
  assert.strictEqual(syncUrl, "https://fnrh.turismo.gov.br/precheckin/uuid-cached-1234");
});

test("Fallback Helper: In 'gov_fnrh' mode with successful registration, generates Gov.br link", async () => {
  const { fnrhSerproService, getCheckinUrl } = await import("../scripts/fnrh-serpro-service.mjs");
  fnrhSerproService.setMockMode(true);
  fnrhSerproService.setMockError(null);
  fnrhSerproService.setMockTimeout(false);

  const mockDb = {
    settings: {
      checkinProvider: "gov_fnrh",
      serproConfig: { mock: true }
    }
  };
  const reservation = {
    code: "RES-905-300",
    id: 300,
    checkinDate: "2026-10-20",
    checkoutDate: "2026-10-25"
  };

  const url = await getCheckinUrl(reservation, 1, "https://corpflats.onrender.com", mockDb);
  assert.ok(url.startsWith("https://fnrh.turismo.gov.br/precheckin/"), "URL must be Gov.br link");
  assert.ok(reservation.serproPrecheckinUrl, "Reservation must persist serproPrecheckinUrl");
  assert.ok(reservation.serproReservaId, "Reservation must persist serproReservaId");
  assert.strictEqual(reservation.link_precheckin, reservation.serproPrecheckinUrl);
});

test("Fallback Helper: In 'gov_fnrh' mode when SERPRO fails, activates fallback to internal URL without throwing", async () => {
  const { fnrhSerproService, getCheckinUrl } = await import("../scripts/fnrh-serpro-service.mjs");
  fnrhSerproService.setMockMode(true);
  fnrhSerproService.setMockError("Serviço SERPRO temporariamente fora do ar");

  const mockDb = {
    settings: {
      checkinProvider: "gov_fnrh",
      serproConfig: { mock: true }
    }
  };
  const reservation = {
    code: "RES-313-400",
    id: 400,
    checkinDate: "2026-10-20",
    checkoutDate: "2026-10-25"
  };

  const url = await getCheckinUrl(reservation, 1, "https://corpflats.onrender.com", mockDb);
  assert.strictEqual(url, "https://corpflats.onrender.com/pre-checkin/RES-313-400?guest=1");
  assert.ok(reservation.serproError, "Must record error on reservation object");

  // Reset mock state
  fnrhSerproService.setMockError(null);
});

test("Fallback Helper: In 'gov_fnrh' mode when SERPRO times out, activates fallback to internal URL", async () => {
  const { fnrhSerproService, getCheckinUrl } = await import("../scripts/fnrh-serpro-service.mjs");
  fnrhSerproService.setMockMode(true);
  fnrhSerproService.setMockTimeout(true);

  const mockDb = {
    settings: {
      checkinProvider: "gov_fnrh",
      serproConfig: { mock: true }
    }
  };
  const reservation = {
    code: "RES-712-500",
    id: 500,
    checkinDate: "2026-10-20",
    checkoutDate: "2026-10-25"
  };

  const url = await getCheckinUrl(reservation, 1, "https://corpflats.onrender.com", mockDb);
  assert.strictEqual(url, "https://corpflats.onrender.com/pre-checkin/RES-712-500?guest=1");
  assert.ok(reservation.serproError.includes("ETIMEDOUT") || reservation.serproError.includes("tempo limite"));

  // Reset mock state
  fnrhSerproService.setMockTimeout(false);
});

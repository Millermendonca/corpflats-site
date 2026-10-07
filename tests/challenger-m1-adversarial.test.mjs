/**
 * EMPIRICAL ADVERSARIAL CHALLENGE SUITE: Milestone M1 (FNRH/SERPRO Check-in Provider)
 * Challenger Agent: challenger_m1_1
 * 
 * Verifies:
 * 1. Provider toggling lifecycle: 'proprio' -> 'gov_fnrh' -> invalid ('xyz') -> 'proprio'
 * 2. SERPRO API error simulations: HTTP 500, network connection refused, 401 unauthorized
 * 3. Timeout condition (>5000ms): aborts within ~5s and triggers fallback without throwing
 * 4. Audit log entry 'FNRH_SERPRO_FALLBACK' appended
 * 5. Reception alert notification created in db.notifications and /api/notifications
 * 6. Multi-guest URL resolution (guestIndex = 2, defaults, string coercion)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 3989;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const MOCK_SERPRO_PORT = 3991;
const UNUSED_PORT = 54329;

const isolatedDbPath = path.join(rootDir, "data", `test-challenger-m1-db-${Date.now()}.json`);
const prodDbPath = path.join(rootDir, "data", "database.json");

let demoServerModule;
let fnrhServiceModule;
let mockHttpServer;

const adminToken = Buffer.from(JSON.stringify({ v: 2, id: 1 })).toString("base64");
const adminHeaders = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${adminToken}`
};

describe("Adversarial Stress Test: Milestone M1 Backend Implementation", () => {
  before(async () => {
    // 1. Prepare isolated database
    const initialDb = JSON.parse(fs.readFileSync(prodDbPath, "utf-8"));
    initialDb.settings = initialDb.settings || {};
    initialDb.settings.checkinProvider = "proprio";
    initialDb.settings.serproConfig = { env: "homologacao", mock: true };
    initialDb.auditLogs = [];
    initialDb.notifications = [];
    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    process.env.PORT = String(TEST_PORT);
    process.env.DATABASE_URL = "";
    process.env.DATABASE_FILE = isolatedDbPath;
    process.env.SERPRO_MOCK = "true";

    // 2. Import modules
    fnrhServiceModule = await import("../artifacts/api-server/fnrh-serpro-service.mjs");
    demoServerModule = await import("../artifacts/api-server/demo-server.mjs");

    // Wait for server to bind
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/settings`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 200));
    }
    assert.ok(ready, "Isolated demo-server did not become ready in time");
  });

  after(async () => {
    if (mockHttpServer) {
      try { mockHttpServer.close(); } catch (_) {}
    }
    if (fs.existsSync(isolatedDbPath)) {
      try { fs.unlinkSync(isolatedDbPath); } catch (_) {}
    }
    setTimeout(() => {
      process.exit(0);
    }, 100);
  });

  // ── 1. Provider Toggling Lifecycle ──────────────────────────────────────────
  describe("Suite 1: Provider Toggling Lifecycle & Boundary Validation", () => {
    it("1.1 Initial settings have checkinProvider === 'proprio'", async () => {
      const res = await fetch(`${BASE_URL}/api/settings`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.checkinProvider, "proprio");
    });

    it("1.2 Toggling 'proprio' -> 'gov_fnrh' succeeds (200) and persists immediately", async () => {
      const patchRes = await fetch(`${BASE_URL}/api/settings`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({ checkinProvider: "gov_fnrh" })
      });
      assert.strictEqual(patchRes.status, 200);
      const patchData = await patchRes.json();
      assert.strictEqual(patchData.checkinProvider, "gov_fnrh");

      // Verify immediate persistence on GET without restart
      const getRes = await fetch(`${BASE_URL}/api/settings`);
      const getData = await getRes.json();
      assert.strictEqual(getData.checkinProvider, "gov_fnrh");
    });

    it("1.3 Toggling to invalid 'xyz' is rejected with HTTP 400 and state remains 'gov_fnrh'", async () => {
      const patchRes = await fetch(`${BASE_URL}/api/settings`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({ checkinProvider: "xyz" })
      });
      assert.strictEqual(patchRes.status, 400);
      const errData = await patchRes.json();
      assert.ok(errData.error, "Should return an error message");
      assert.ok(errData.error.includes("checkinProvider inválido"));

      // Verify that provider was NOT corrupted
      const getRes = await fetch(`${BASE_URL}/api/settings`);
      const getData = await getRes.json();
      assert.strictEqual(getData.checkinProvider, "gov_fnrh", "Provider must remain 'gov_fnrh'");
    });

    it("1.4 Malformed and edge-case values for checkinProvider are all rejected with 400", async () => {
      const invalidValues = ["", null, 123, true, false, {}, [], "PROPRIO", "gov_fnrh ", " proprio"];
      for (const val of invalidValues) {
        const patchRes = await fetch(`${BASE_URL}/api/settings`, {
          method: "PATCH",
          headers: adminHeaders,
          body: JSON.stringify({ checkinProvider: val })
        });
        assert.strictEqual(patchRes.status, 400, `Expected 400 for checkinProvider = ${JSON.stringify(val)}`);
      }
    });

    it("1.5 Toggling back to 'proprio' succeeds (200) and persists", async () => {
      const patchRes = await fetch(`${BASE_URL}/api/settings`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({ checkinProvider: "proprio" })
      });
      assert.strictEqual(patchRes.status, 200);
      const patchData = await patchRes.json();
      assert.strictEqual(patchData.checkinProvider, "proprio");

      const getRes = await fetch(`${BASE_URL}/api/settings`);
      const getData = await getRes.json();
      assert.strictEqual(getData.checkinProvider, "proprio");
    });
  });

  // ── 2. SERPRO API Error Simulations ─────────────────────────────────────────
  describe("Suite 2: SERPRO API Error Simulations (HTTP 500, Network Error, 401)", () => {
    it("2.1 Simulated HTTP 500 triggers graceful fallback without throwing", async () => {
      // Switch provider to gov_fnrh
      await fetch(`${BASE_URL}/api/settings`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({ checkinProvider: "gov_fnrh" })
      });

      fnrhServiceModule.fnrhSerproService.setMockMode(true);
      fnrhServiceModule.fnrhSerproService.setMockError("SERPRO 500 Internal Server Failure");

      const testReservation = {
        code: "RES-ERR-500",
        id: 701,
        checkinDate: "2026-10-20",
        checkoutDate: "2026-10-25"
      };

      const url = await demoServerModule.getCheckinUrl(testReservation, 1, BASE_URL);
      assert.strictEqual(url, `${BASE_URL}/pre-checkin/RES-ERR-500?guest=1`, "Must fallback to internal URL");
      assert.ok(testReservation.serproError, "Must set serproError on reservation object");
      assert.ok(testReservation.serproError.includes("500"), "serproError must mention 500");

      fnrhServiceModule.fnrhSerproService.setMockError(null);
    });

    it("2.2 Simulated Network Error (ECONNREFUSED) triggers graceful fallback", async () => {
      const originalResolve = fnrhServiceModule.fnrhSerproService.resolveConfig.bind(fnrhServiceModule.fnrhSerproService);
      fnrhServiceModule.fnrhSerproService.resolveConfig = (override) => {
        const cfg = originalResolve(override);
        cfg.baseUrl = `http://127.0.0.1:${UNUSED_PORT}`;
        cfg.mock = false;
        cfg.isConfigured = true;
        cfg.user = "usr";
        cfg.password = "pwd";
        return cfg;
      };

      const testReservation = {
        code: "RES-ERR-CONNREF",
        id: 702,
        checkinDate: "2026-10-20",
        checkoutDate: "2026-10-25"
      };

      const url = await demoServerModule.getCheckinUrl(testReservation, 1, BASE_URL);
      assert.strictEqual(url, `${BASE_URL}/pre-checkin/RES-ERR-CONNREF?guest=1`, "Must fallback to internal URL on ECONNREFUSED");
      assert.ok(testReservation.serproError, "Must set serproError");

      fnrhServiceModule.fnrhSerproService.resolveConfig = originalResolve;
    });

    it("2.3 Simulated 401 Unauthorized triggers graceful fallback and checkHealth reflects auth_error", async () => {
      // Spin up local HTTP server returning 401
      mockHttpServer = http.createServer((req, res) => {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Credenciais de autenticação inválidas no SERPRO" }));
      });
      await new Promise(resolve => mockHttpServer.listen(MOCK_SERPRO_PORT, resolve));

      const originalResolve = fnrhServiceModule.fnrhSerproService.resolveConfig.bind(fnrhServiceModule.fnrhSerproService);
      fnrhServiceModule.fnrhSerproService.resolveConfig = (override) => {
        const cfg = originalResolve(override);
        cfg.baseUrl = `http://127.0.0.1:${MOCK_SERPRO_PORT}`;
        cfg.mock = false;
        cfg.isConfigured = true;
        cfg.user = "invalid_user";
        cfg.password = "invalid_password";
        return cfg;
      };

      // Check health endpoint
      const health = await fnrhServiceModule.fnrhSerproService.checkHealth();
      assert.strictEqual(health.ok, false);
      assert.strictEqual(health.status, "auth_error");
      assert.strictEqual(health.statusCode, 401);

      // Check getCheckinUrl
      const testReservation = {
        code: "RES-ERR-401",
        id: 703,
        checkinDate: "2026-10-20",
        checkoutDate: "2026-10-25"
      };

      const url = await demoServerModule.getCheckinUrl(testReservation, 1, BASE_URL);
      assert.strictEqual(url, `${BASE_URL}/pre-checkin/RES-ERR-401?guest=1`, "Must fallback to internal URL on 401");
      assert.ok(testReservation.serproError.includes("401"), "serproError must mention 401");

      mockHttpServer.close();
      mockHttpServer = null;
      fnrhServiceModule.fnrhSerproService.resolveConfig = originalResolve;
      fnrhServiceModule.fnrhSerproService.setMockMode(true);
    });
  });

  // ── 3. Strict 5000ms Timeout & Hanging Server Stress Test ───────────────────
  describe("Suite 3: Timeout Condition & Hanging Server Stress Test", () => {
    it("3.1 When SERPRO hangs for >5000ms (7000ms), getCheckinUrl aborts and falls back within ~5s", async () => {
      // Simulate remote server hanging for 7000ms
      const originalRegister = fnrhServiceModule.fnrhSerproService.registerReservation.bind(fnrhServiceModule.fnrhSerproService);
      fnrhServiceModule.fnrhSerproService.registerReservation = async () => {
        await new Promise(r => setTimeout(r, 7000));
        return { ok: true, link_precheckin: "https://should-never-be-reached" };
      };

      const testReservation = {
        code: "RES-HANG-TIMEOUT",
        id: 704,
        checkinDate: "2026-10-20",
        checkoutDate: "2026-10-25"
      };

      const startTime = Date.now();
      const url = await demoServerModule.getCheckinUrl(testReservation, 1, BASE_URL);
      const elapsedMs = Date.now() - startTime;

      // Assert timeout occurred around 5000ms (tolerance 4900ms - 5500ms), NOT 7000ms+
      assert.ok(elapsedMs >= 4900, `Execution took ${elapsedMs}ms, should be >= 4900ms`);
      assert.ok(elapsedMs < 6000, `Execution took ${elapsedMs}ms, should abort before 6000ms`);

      assert.strictEqual(url, `${BASE_URL}/pre-checkin/RES-HANG-TIMEOUT?guest=1`);
      assert.ok(testReservation.serproError, "Must set serproError");
      assert.ok(
        testReservation.serproError.includes("Timeout") || testReservation.serproError.includes("5000ms"),
        `serproError was: ${testReservation.serproError}`
      );

      // Restore method
      fnrhServiceModule.fnrhSerproService.registerReservation = originalRegister;
    });

    it("3.2 Mock timeout flag (setMockTimeout) triggers immediate ETIMEDOUT fallback", async () => {
      fnrhServiceModule.fnrhSerproService.setMockTimeout(true);

      const testReservation = {
        code: "RES-MOCK-TIMEOUT",
        id: 705,
        checkinDate: "2026-10-20",
        checkoutDate: "2026-10-25"
      };

      const url = await demoServerModule.getCheckinUrl(testReservation, 1, BASE_URL);
      assert.strictEqual(url, `${BASE_URL}/pre-checkin/RES-MOCK-TIMEOUT?guest=1`);
      assert.ok(testReservation.serproError.includes("ETIMEDOUT") || testReservation.serproError.includes("tempo limite"));

      fnrhServiceModule.fnrhSerproService.setMockTimeout(false);
    });
  });

  // ── 4. Audit Log Entry Verification ─────────────────────────────────────────
  describe("Suite 4: Audit Log (FNRH_SERPRO_FALLBACK) Verification", () => {
    it("4.1 FNRH_SERPRO_FALLBACK audit log is appended when fallback occurs", async () => {
      fnrhServiceModule.fnrhSerproService.setMockError("Falha de teste para audit log");

      const testReservation = {
        code: "RES-AUDIT-VERIF",
        id: 706,
        checkinDate: "2026-10-20",
        checkoutDate: "2026-10-25"
      };

      await demoServerModule.getCheckinUrl(testReservation, 2, BASE_URL);

      // Query audit logs via API
      const auditRes = await fetch(`${BASE_URL}/api/audit-logs`, { headers: adminHeaders });
      assert.strictEqual(auditRes.status, 200);
      const auditData = await auditRes.json();
      const logs = auditData.logs || auditData;

      const fallbackEntry = logs.find(
        entry => entry.action === "FNRH_SERPRO_FALLBACK" && entry.details?.reservationCode === "RES-AUDIT-VERIF"
      );

      assert.ok(fallbackEntry, "Must find FNRH_SERPRO_FALLBACK entry in audit logs");
      assert.strictEqual(fallbackEntry.category, "integration");
      assert.strictEqual(fallbackEntry.level, "warning");
      assert.strictEqual(fallbackEntry.details.guestIndex, 2);
      assert.ok(fallbackEntry.details.error.includes("Falha de teste para audit log"));

      fnrhServiceModule.fnrhSerproService.setMockError(null);
    });
  });

  // ── 5. Reception Alert Notification Verification ────────────────────────────
  describe("Suite 5: Reception Alert Notification Verification", () => {
    it("5.1 Reception alert notification is created in notifications central upon fallback", async () => {
      fnrhServiceModule.fnrhSerproService.setMockError("Falha de teste para notificacao recepcao");

      const testReservation = {
        code: "RES-NOTIF-VERIF",
        id: 707,
        checkinDate: "2026-10-20",
        checkoutDate: "2026-10-25"
      };

      await demoServerModule.getCheckinUrl(testReservation, 1, BASE_URL);

      // Query notifications via GET /api/notifications
      const notifRes = await fetch(`${BASE_URL}/api/notifications`);
      assert.strictEqual(notifRes.status, 200);
      const notifData = await notifRes.json();
      const notifications = notifData.notifications || notifData;

      const fallbackNotif = notifications.find(
        n => n.message && n.message.includes("RES-NOTIF-VERIF")
      );

      assert.ok(fallbackNotif, "Must find reception alert notification for RES-NOTIF-VERIF");
      assert.strictEqual(fallbackNotif.title, "⚠️ Contingência FNRH SERPRO");
      assert.strictEqual(fallbackNotif.severity, "warning");
      assert.strictEqual(fallbackNotif.category, "system_error");
      assert.strictEqual(fallbackNotif.targetUrl, "/reservas?code=RES-NOTIF-VERIF");

      fnrhServiceModule.fnrhSerproService.setMockError(null);
    });
  });

  // ── 6. Multi-Guest URL Resolution Verification ──────────────────────────────
  describe("Suite 6: Multi-Guest URL Resolution (guestIndex = 2)", () => {
    it("6.1 In 'proprio' mode, guestIndex = 2 resolves to ?guest=2", async () => {
      // Toggle to proprio
      await fetch(`${BASE_URL}/api/settings`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({ checkinProvider: "proprio" })
      });

      const resObj = { code: "RES-GUEST-2", id: 708 };
      const url = await demoServerModule.getCheckinUrl(resObj, 2, BASE_URL);
      assert.strictEqual(url, `${BASE_URL}/pre-checkin/RES-GUEST-2?guest=2`);

      const syncUrl = demoServerModule.getCheckinUrlSync(resObj, 2, BASE_URL);
      assert.strictEqual(syncUrl, `${BASE_URL}/pre-checkin/RES-GUEST-2?guest=2`);
    });

    it("6.2 In 'gov_fnrh' fallback mode, guestIndex = 2 resolves to ?guest=2", async () => {
      await fetch(`${BASE_URL}/api/settings`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({ checkinProvider: "gov_fnrh" })
      });

      fnrhServiceModule.fnrhSerproService.setMockError("Forced fallback for guest 2");

      const resObj = { code: "RES-FALLBACK-G2", id: 709, checkinDate: "2026-10-20", checkoutDate: "2026-10-25" };
      const url = await demoServerModule.getCheckinUrl(resObj, 2, BASE_URL);
      assert.strictEqual(url, `${BASE_URL}/pre-checkin/RES-FALLBACK-G2?guest=2`);

      fnrhServiceModule.fnrhSerproService.setMockError(null);
    });

    it("6.3 Guest index boundary values (string '2', undefined, 0, null) coerced correctly", async () => {
      const resObj = { code: "RES-COERCE", id: 710 };

      // String "2" -> guest=2
      assert.strictEqual(
        demoServerModule.getCheckinUrlSync(resObj, "2", BASE_URL),
        `${BASE_URL}/pre-checkin/RES-COERCE?guest=2`
      );

      // undefined -> guest=1
      assert.strictEqual(
        demoServerModule.getCheckinUrlSync(resObj, undefined, BASE_URL),
        `${BASE_URL}/pre-checkin/RES-COERCE?guest=1`
      );

      // null -> guest=1
      assert.strictEqual(
        demoServerModule.getCheckinUrlSync(resObj, null, BASE_URL),
        `${BASE_URL}/pre-checkin/RES-COERCE?guest=1`
      );

      // 0 -> guest=1
      assert.strictEqual(
        demoServerModule.getCheckinUrlSync(resObj, 0, BASE_URL),
        `${BASE_URL}/pre-checkin/RES-COERCE?guest=1`
      );
    });

    it("6.4 When official SERPRO link is available, returns Gov.br link directly", async () => {
      await fetch(`${BASE_URL}/api/settings`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({ checkinProvider: "gov_fnrh" })
      });

      const resObj = {
        code: "RES-OFFICIAL-GOV",
        id: 711,
        serproPrecheckinUrl: "https://fnrh.turismo.gov.br/precheckin/uuid-official-777"
      };

      const url = await demoServerModule.getCheckinUrl(resObj, 2, BASE_URL);
      assert.strictEqual(url, "https://fnrh.turismo.gov.br/precheckin/uuid-official-777");

      const syncUrl = demoServerModule.getCheckinUrlSync(resObj, 2, BASE_URL);
      assert.strictEqual(syncUrl, "https://fnrh.turismo.gov.br/precheckin/uuid-official-777");
    });
  });
});

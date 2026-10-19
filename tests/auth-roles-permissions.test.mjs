/**
 * Test Suite: Auth, Roles & RBAC Separation (Dev vs Admin)
 * File: tests/auth-roles-permissions.test.mjs
 * Execution: node --test tests/auth-roles-permissions.test.mjs
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
const isolatedDbPath = path.join(rootDir, `data/test-auth-roles-db-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

describe("Milestone 1 — Auth, Roles & RBAC Separation Suite", () => {
  // ── 1. File Parity Test ───────────────────────────────────────────────────
  it("File Parity: artifacts/api-server/demo-server.mjs and scripts/demo-server.mjs must have identical SHA-256", () => {
    const fileA = fs.readFileSync(path.join(rootDir, "artifacts/api-server/demo-server.mjs"));
    const fileB = fs.readFileSync(path.join(rootDir, "scripts/demo-server.mjs"));
    const hashA = crypto.createHash("sha256").update(fileA).digest("hex");
    const hashB = crypto.createHash("sha256").update(fileB).digest("hex");
    assert.strictEqual(hashA, hashB, "demo-server twin files must have matching SHA-256 hashes");
  });

  // ── 2. Integration Server Lifecycle & Migrations ──────────────────────────
  describe("HTTP Integration & RBAC Tests", () => {
    let devCookie = "";
    let gestorCookie = "";

    before(async () => {
      // 1. Prepare isolated test database simulating legacy state before migration:
      // admin with role: "admin", and gestor not existing yet.
      let initialDb = {};
      if (fs.existsSync(prodDbPath)) {
        initialDb = JSON.parse(fs.readFileSync(prodDbPath, "utf-8"));
      }
      
      // Ensure users array has legacy admin
      if (!Array.isArray(initialDb.users)) initialDb.users = [];
      const legacyAdmin = initialDb.users.find(u => u.username && u.username.toLowerCase() === "admin");
      if (legacyAdmin) {
        legacyAdmin.role = "admin"; // force legacy state to test migration
      }
      // Remove gestor if present to test automatic creation
      initialDb.users = initialDb.users.filter(u => u.username && u.username.toLowerCase() !== "gestor");

      fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

      // 2. Spawn server with isolated db
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

      // 3. Poll until server is ready
      let isReady = false;
      for (let i = 0; i < 50; i++) {
        try {
          const res = await fetch(`${BASE_URL}/api/system/version`);
          if (res.ok) {
            isReady = true;
            break;
          }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 200));
      }

      if (!isReady) {
        throw new Error(`Server failed to start on port ${TEST_PORT}`);
      }

      // 4. Login as admin (which should now return dev role after ensureSystemUsers)
      const resDev = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin123" })
      });
      assert.strictEqual(resDev.status, 200, "Admin login must succeed");
      const dataDev = await resDev.json();
      assert.strictEqual(dataDev.role, "dev", "User admin must have role 'dev'");
      const rawDevCookie = resDev.headers.get("set-cookie") || "";
      devCookie = rawDevCookie.split(";")[0];

      // 5. Login as gestor (which was automatically created with role admin and password admin123)
      const resGestor = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "gestor", password: "admin123" })
      });
      assert.strictEqual(resGestor.status, 200, "Gestor login must succeed");
      const dataGestor = await resGestor.json();
      assert.strictEqual(dataGestor.role, "admin", "User gestor must have role 'admin'");
      const rawGestorCookie = resGestor.headers.get("set-cookie") || "";
      gestorCookie = rawGestorCookie.split(";")[0];
    });

    after(() => {
      if (serverProcess && serverProcess.pid) {
        killProcessTree(serverProcess.pid);
        serverProcess = null;
      }
      try {
        if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
      } catch (_) {}
    });

    // ── 2.1. Verify Database Migration On Disk ─────────────────────────────
    it("ensureSystemUsers migrated database: admin is dev, gestor is created as admin", () => {
      const persistedDb = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
      const admin = persistedDb.users.find(u => u.username === "admin");
      const gestor = persistedDb.users.find(u => u.username === "gestor");

      assert.ok(admin, "admin must exist in persisted database");
      assert.strictEqual(admin.role, "dev", "admin role must be dev in persisted database");

      assert.ok(gestor, "gestor must exist in persisted database");
      assert.strictEqual(gestor.role, "admin", "gestor role must be admin in persisted database");
      assert.strictEqual(gestor.name, "Administração CorpFlats");
    });

    // ── 2.2. Verify /api/auth/me ───────────────────────────────────────────
    it("/api/auth/me returns 'dev' for admin and 'admin' for gestor", async () => {
      const meDev = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { Cookie: devCookie }
      });
      assert.strictEqual(meDev.status, 200);
      const devData = await meDev.json();
      assert.strictEqual(devData.username, "admin");
      assert.strictEqual(devData.role, "dev");

      const meGestor = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { Cookie: gestorCookie }
      });
      assert.strictEqual(meGestor.status, 200);
      const gestorData = await meGestor.json();
      assert.strictEqual(gestorData.username, "gestor");
      assert.strictEqual(gestorData.role, "admin");
    });

    // ── 2.3. Operational Endpoints Access ─────────────────────────────────
    it("Operational Endpoints: both dev and admin can access business routes", async () => {
      // 1. PMS Calendar
      const pmsDev = await fetch(`${BASE_URL}/api/pms/calendar?start=2026-10-01&end=2026-10-31`, {
        headers: { Cookie: devCookie }
      });
      assert.strictEqual(pmsDev.status, 200, "Dev must be able to view PMS calendar");

      const pmsGestor = await fetch(`${BASE_URL}/api/pms/calendar?start=2026-10-01&end=2026-10-31`, {
        headers: { Cookie: gestorCookie }
      });
      assert.strictEqual(pmsGestor.status, 200, "Admin must be able to view PMS calendar");

      // 2. Finance Overview
      const finDev = await fetch(`${BASE_URL}/api/finance/overview`, {
        headers: { Cookie: devCookie }
      });
      assert.strictEqual(finDev.status, 200, "Dev must be able to view finance overview");

      const finGestor = await fetch(`${BASE_URL}/api/finance/overview`, {
        headers: { Cookie: gestorCookie }
      });
      assert.strictEqual(finGestor.status, 200, "Admin must be able to view finance overview");

      // 3. User Management List
      const usersDev = await fetch(`${BASE_URL}/api/admin/users`, {
        headers: { Cookie: devCookie }
      });
      assert.strictEqual(usersDev.status, 200, "Dev must be able to list users");

      const usersGestor = await fetch(`${BASE_URL}/api/admin/users`, {
        headers: { Cookie: gestorCookie }
      });
      assert.strictEqual(usersGestor.status, 200, "Admin must be able to list users");

      // 4. NFSe Retry Queue
      const nfseDev = await fetch(`${BASE_URL}/api/nfse/retry-queue`, {
        headers: { Cookie: devCookie }
      });
      assert.strictEqual(nfseDev.status, 200, "Dev must be able to access NFSe retry queue");

      const nfseGestor = await fetch(`${BASE_URL}/api/nfse/retry-queue`, {
        headers: { Cookie: gestorCookie }
      });
      assert.strictEqual(nfseGestor.status, 200, "Admin must be able to access NFSe retry queue");
    });

    // ── 2.4. Technical Dev-Only Endpoints Protection ───────────────────────
    it("Technical Endpoints: dev gets 200, gestor (admin) gets 403 Forbidden", async () => {
      const technicalEndpoints = [
        "/api/admin/server-monitor/live",
        "/api/audit-logs",
        "/api/storage/config",
        "/api/settings/gemini",
        "/api/settings/email",
        "/api/whatsapp/config"
      ];

      for (const endpoint of technicalEndpoints) {
        // Dev access -> 200 OK
        const devRes = await fetch(`${BASE_URL}${endpoint}`, {
          headers: { Cookie: devCookie }
        });
        assert.strictEqual(
          devRes.status,
          200,
          `Dev should have access to technical endpoint ${endpoint} (got ${devRes.status})`
        );

        // Gestor (admin) access -> 403 Forbidden
        const gestorRes = await fetch(`${BASE_URL}${endpoint}`, {
          headers: { Cookie: gestorCookie }
        });
        assert.strictEqual(
          gestorRes.status,
          403,
          `Gestor (admin) must be barred with 403 from technical endpoint ${endpoint} (got ${gestorRes.status})`
        );
      }
    });

    // ── 2.5. User Management Security & Password Reset ─────────────────────
    it("User Management: password reset supports PATCH and POST; admin cannot alter dev accounts", async () => {
      // 1. Create a temporary staff user as admin
      const createRes = await fetch(`${BASE_URL}/api/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: gestorCookie },
        body: JSON.stringify({
          username: "camareira_temp",
          name: "Camareira Teste",
          role: "camareira",
          password: "temp123password"
        })
      });
      assert.strictEqual(createRes.status, 201, "Admin should be able to create a camareira");
      const createdUser = await createRes.json();
      const tempUserId = createdUser.id;

      // 2. Test reset password via PATCH
      const patchRes = await fetch(`${BASE_URL}/api/admin/users/${tempUserId}/reset-password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: gestorCookie },
        body: JSON.stringify({ newPassword: "newpassword123" })
      });
      assert.strictEqual(patchRes.status, 200, "Reset password via PATCH must succeed");

      // 3. Test reset password via POST
      const postRes = await fetch(`${BASE_URL}/api/admin/users/${tempUserId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: gestorCookie },
        body: JSON.stringify({ newPassword: "newerpassword456" })
      });
      assert.strictEqual(postRes.status, 200, "Reset password via POST must succeed");

      // 4. Gestor (admin) attempts to reset dev's password -> 403 Forbidden
      const devUserInDb = 1; // admin
      const forbiddenReset = await fetch(`${BASE_URL}/api/admin/users/${devUserInDb}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: gestorCookie },
        body: JSON.stringify({ newPassword: "hackedPassword123" })
      });
      assert.strictEqual(forbiddenReset.status, 403, "Admin must NOT be allowed to reset dev password");

      // 5. Gestor (admin) attempts to edit dev's account -> 403 Forbidden
      const forbiddenEdit = await fetch(`${BASE_URL}/api/admin/users/${devUserInDb}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: gestorCookie },
        body: JSON.stringify({ role: "camareira" })
      });
      assert.strictEqual(forbiddenEdit.status, 403, "Admin must NOT be allowed to edit dev account");

      // 6. Gestor (admin) attempts to delete dev's account -> 403 Forbidden
      const forbiddenDelete = await fetch(`${BASE_URL}/api/admin/users/${devUserInDb}`, {
        method: "DELETE",
        headers: { Cookie: gestorCookie }
      });
      assert.strictEqual(forbiddenDelete.status, 403, "Admin must NOT be allowed to delete dev account");

      // 7. Clean up temporary staff user
      const delTemp = await fetch(`${BASE_URL}/api/admin/users/${tempUserId}`, {
        method: "DELETE",
        headers: { Cookie: gestorCookie }
      });
      assert.strictEqual(delTemp.status, 200, "Admin should be able to delete temporary staff user");
    });
  });
});

/**
 * Teste Adversarial Pontual: Paridade de Comportamento e Resposta entre
 * POST /api/hr/punch e o alias POST /api/hr/timeclock
 * 
 * Validador: challenger_m5_2
 * Data: 2026-10-22
 */

import test, { describe, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import express from "express";

import {
  ensureHrCollections,
  createHrRouter,
  getDefaultHrSettings,
  getDefaultHrComplianceSettings
} from "../artifacts/api-server/hr/index.mjs";
import { getDefaultHrEmployees } from "../artifacts/api-server/hr/employees.mjs";

const TEMP_DB_FILE = path.join(os.tmpdir(), `temp-hr-alias-parity-db-${Date.now()}.json`);
const SOHO_COORDS = { latitude: -21.7584, longitude: -41.3262 };
const VALID_SAMPLE_SELFIE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

function createTestHarness(customSettings = {}) {
  const mockDb = {
    users: [
      { id: 1, username: "admin", name: "Administrador CorpFlats", role: "admin", passwordHash: crypto.createHash("sha256").update("admin123").digest("hex") },
      { id: 2, username: "Cris", name: "Cris", role: "camareira", contractType: "prestador", active: true },
      { id: 3, username: "Grazi", name: "Grazi", role: "camareira", contractType: "prestador", active: true }
    ],
    hrEmployees: getDefaultHrEmployees(),
    hrTimeRecords: [],
    hrSchedules: [],
    hrVacations: [],
    hrWhatsAppLogs: [],
    hrPayroll: [],
    hrContracts: [],
    hrAso: [],
    hrAsoRecords: [],
    hrComplianceAudits: [],
    hrDeviceWhitelist: [],
    hrSettings: getDefaultHrSettings(),
    hrComplianceSettings: getDefaultHrComplianceSettings()
  };

  ensureHrCollections(mockDb);

  if (customSettings.hrSettings) {
    mockDb.hrSettings = { ...mockDb.hrSettings, ...customSettings.hrSettings };
  }
  if (customSettings.hrComplianceSettings) {
    mockDb.hrComplianceSettings = { ...mockDb.hrComplianceSettings, ...customSettings.hrComplianceSettings };
  }

  const saveDatabase = () => {
    try {
      fs.writeFileSync(TEMP_DB_FILE, JSON.stringify(mockDb, null, 2), "utf8");
    } catch {}
  };

  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use("/api/hr", createHrRouter({ db: mockDb, saveDatabase }));

  return { mockDb, app };
}

async function withHttpServer(app, testFn) {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/hr`;
  try {
    await testFn(baseUrl);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function requestJson(url, options = {}) {
  const parsed = new URL(url);
  const reqOptions = {
    method: options.method || "GET",
    hostname: parsed.hostname,
    port: parsed.port,
    path: `${parsed.pathname}${parsed.search}`,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(reqOptions, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch {
          json = { raw: body };
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on("error", reject);

    if (options.body) {
      req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

after(() => {
  try {
    if (fs.existsSync(TEMP_DB_FILE)) {
      fs.unlinkSync(TEMP_DB_FILE);
    }
  } catch {}
});

test("Adversarial Check: Paridade entre POST /api/hr/punch e alias POST /api/hr/timeclock", async () => {
  const { mockDb, app } = createTestHarness();

  await withHttpServer(app, async (baseUrl) => {
    // 1. Cenário de Bloqueio de Prestadora (Cris e Grazi)
    for (const blockedId of [2, 3, "cris", "grazi"]) {
      const punchRes = await requestJson(`${baseUrl}/punch`, {
        method: "POST",
        body: { employeeId: blockedId }
      });

      const timeclockRes = await requestJson(`${baseUrl}/timeclock`, {
        method: "POST",
        body: { employeeId: blockedId }
      });

      assert.equal(timeclockRes.status, punchRes.status, `Status HTTP deve ser idêntico (${punchRes.status}) para id ${blockedId}`);
      assert.equal(timeclockRes.status, 403, "Deve retornar 403 Forbidden");
      assert.equal(timeclockRes.body.success, false);
      assert.equal(timeclockRes.body.code, punchRes.body.code);
      assert.equal(timeclockRes.body.code, "PRESTADORA_POINT_BLOCKED");
      assert.equal(timeclockRes.body.error, punchRes.body.error);
    }

    // 2. Cenário de Colaborador Inexistente
    {
      const punchRes = await requestJson(`${baseUrl}/punch`, {
        method: "POST",
        body: { employeeId: "emp_inexistente_999", punchType: "entrada" }
      });
      const timeclockRes = await requestJson(`${baseUrl}/timeclock`, {
        method: "POST",
        body: { employeeId: "emp_inexistente_999", punchType: "entrada" }
      });

      assert.equal(timeclockRes.status, punchRes.status);
      assert.equal(timeclockRes.body.success, false);
      assert.equal(timeclockRes.body.error, punchRes.body.error);
      assert.equal(timeclockRes.body.code, punchRes.body.code);
    }

    // 3. Cenário de Violação de Geofence (Fora do Hotel)
    {
      const farPayload = {
        employeeId: "emp_cozinha_01",
        punchType: "entrada",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: -21.7500, lng: -41.3200, accuracy: 5 },
        device: { deviceId: "term_test" }
      };

      const punchRes = await requestJson(`${baseUrl}/punch`, {
        method: "POST",
        body: farPayload
      });

      const timeclockRes = await requestJson(`${baseUrl}/timeclock`, {
        method: "POST",
        body: farPayload
      });

      assert.equal(timeclockRes.status, punchRes.status);
      assert.equal(timeclockRes.body.success, false);
      assert.equal(timeclockRes.body.ruleId, punchRes.body.ruleId);
      assert.equal(timeclockRes.body.ruleId, "geofence_violada");
      assert.equal(timeclockRes.body.actionRequired, punchRes.body.actionRequired);
      assert.equal(timeclockRes.body.code, punchRes.body.code);
    }

    // 4. Cenário de Whitelist de Aparelhos (Comparação direta entre /punch e /timeclock)
    {
      mockDb.hrSettings.deviceWhitelist = { enabled: true, enforceStrict: true };
      mockDb.hrDeviceWhitelist.push({ id: "dev_ok", deviceId: "tablet_soho_aprovado", active: true });

      const unauthPayload = {
        employeeId: "emp_cozinha_01",
        punchType: "entrada",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
        device: { deviceId: "smartphone_nao_cadastrado" }
      };

      const unauthPunch = await requestJson(`${baseUrl}/punch`, { method: "POST", body: unauthPayload });
      const unauthTimeclock = await requestJson(`${baseUrl}/timeclock`, { method: "POST", body: unauthPayload });

      assert.equal(unauthTimeclock.status, unauthPunch.status);
      assert.equal(unauthTimeclock.body.ruleId, unauthPunch.body.ruleId);
      assert.equal(unauthTimeclock.body.ruleId, "aparelho_nao_autorizado");
      assert.equal(unauthTimeclock.body.actionRequired, unauthPunch.body.actionRequired);
      assert.equal(unauthTimeclock.body.code, unauthPunch.body.code);
      assert.equal(unauthTimeclock.body.error, unauthPunch.body.error);

      // Desativa whitelist estrita para permitir as próximas batidas
      mockDb.hrSettings.deviceWhitelist = { enabled: false, enforceStrict: false };
    }

    // 5. Cenário de Sucesso na Batida (Entrada via /punch e Saída Almoço via /timeclock)
    {
      // Batida 1: Entrada via /punch
      const r1 = await requestJson(`${baseUrl}/punch`, {
        method: "POST",
        body: {
          employeeId: "emp_cozinha_01",
          punchType: "entrada",
          selfie: VALID_SAMPLE_SELFIE,
          geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
          device: { deviceId: "term_test" }
        }
      });
      assert.equal(r1.status, 201);
      assert.equal(r1.body.success, true);
      assert.equal(r1.body.record.punchType, "entrada");
      assert.equal(r1.body.record.withinGeofence, true);
      assert.ok(r1.body.record.nsr >= 1001);

      // Batida 2: Saída Almoço via /timeclock para o mesmo funcionário
      const r2 = await requestJson(`${baseUrl}/timeclock`, {
        method: "POST",
        body: {
          employeeId: "emp_cozinha_01",
          punchType: "almoco_saida",
          selfie: VALID_SAMPLE_SELFIE,
          geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
          device: { deviceId: "term_test" }
        }
      });
      assert.equal(r2.status, 201);
      assert.equal(r2.body.success, true);
      assert.equal(r2.body.record.punchType, "almoco_saida");
      assert.equal(r2.body.record.withinGeofence, true);
      assert.equal(r2.body.record.nsr, r1.body.record.nsr + 1, "NSR deve incrementar sequencialmente");

      // Batida 3: Entrada da Camareira via /timeclock diretamente
      const r3 = await requestJson(`${baseUrl}/timeclock`, {
        method: "POST",
        body: {
          employeeId: "emp_camareira_01",
          punchType: "entrada",
          selfie: VALID_SAMPLE_SELFIE,
          geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
          device: { deviceId: "term_test" }
        }
      });
      assert.equal(r3.status, 201);
      assert.equal(r3.body.success, true);
      assert.equal(r3.body.record.employeeId, "emp_camareira_01");
      assert.equal(r3.body.record.withinGeofence, true);
      assert.equal(r3.body.record.nsr, r2.body.record.nsr + 1);
    }
  });
});

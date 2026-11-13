/**
 * Suíte de Testes Pontual Dedicada: Ponto Eletrônico e Motor de Conformidade (Marco M2)
 * Arquivo: tests/hr-m2-timekeeping-compliance.test.mjs
 * 
 * Execução pontual estrita: node --test tests/hr-m2-timekeeping-compliance.test.mjs
 * Conforme diretrizes do AGENTS.md (proibido rodar suítes globais em lote).
 */

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import express from "express";
import { checkTwinParity } from "../scripts/check-twin-parity.mjs";

import {
  isPrestadora,
  isCltEmployee,
  getDefaultHrEmployees
} from "../artifacts/api-server/hr/employees.mjs";

import {
  ensureHrCollections,
  createHrRouter,
  getDefaultHrSettings,
  getDefaultHrComplianceSettings
} from "../artifacts/api-server/hr/index.mjs";

import {
  calculateDistanceHaversine,
  validateAndHashSelfie,
  registerPunch,
  checkDeviceWhitelist,
  getTimeRecords,
  getDailySheet
} from "../artifacts/api-server/hr/timekeeping.mjs";

import {
  validatePunchCompliance,
  getComplianceRules,
  updateComplianceRule,
  getComplianceAudits
} from "../artifacts/api-server/hr/compliance.mjs";

// ── Utilitários do Test Harness ──────────────────────────────────────────────

const SOHO_COORDS = { latitude: -21.7584, longitude: -41.3262 };
const VALID_SAMPLE_SELFIE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

function createTestHarness(customSettings = {}) {
  const mockDb = {
    users: [
      { id: 1, username: "admin", role: "admin", passwordHash: crypto.createHash("sha256").update("admin123").digest("hex") },
      { id: 2, username: "Cris", name: "Cris", role: "camareira", contractType: "prestador" },
      { id: 3, username: "Grazi", name: "Grazi", role: "camareira", contractType: "prestador" }
    ]
  };
  ensureHrCollections(mockDb);

  if (customSettings.hrSettings) {
    mockDb.hrSettings = { ...mockDb.hrSettings, ...customSettings.hrSettings };
  }
  if (customSettings.hrComplianceSettings) {
    mockDb.hrComplianceSettings = { ...mockDb.hrComplianceSettings, ...customSettings.hrComplianceSettings };
  }

  const savedOperations = [];
  const saveDatabase = (op) => { savedOperations.push(op); };

  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use("/api/hr", createHrRouter({ db: mockDb, saveDatabase }));

  return { mockDb, savedOperations, app };
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

// ── TESTE 1: Ciclo Completo de Batidas e Integridade do NSR ──────────────────

test("M2-1: Ciclo completo de batidas (Entrada -> Almoço Saída/Volta -> Saída), horas e NSR", async () => {
  const { mockDb, app } = createTestHarness();

  await withHttpServer(app, async (baseUrl) => {
    const employeeId = "emp_cozinha_01";
    const today = "2026-10-22";

    // 1. Batida: ENTRADA (06:00:00)
    const res1 = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        punchType: "entrada",
        timestamp: `${today}T06:00:00.000Z`,
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 10 },
        device: { deviceId: "terminal_soho_01", platform: "android" }
      })
    });
    assert.equal(res1.status, 201);
    const data1 = await res1.json();
    assert.equal(data1.success, true);
    assert.equal(data1.record.punchType, "entrada");
    assert.ok(data1.record.nsr >= 1001, "NSR inicial deve ser gerado e sequencial");
    const firstNsr = data1.record.nsr;

    // 2. Batida: ALMOÇO SAÍDA (10:30:00) - 4h30 trabalhadas (270 min)
    const res2 = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        punchType: "almoco_saida",
        timestamp: `${today}T10:30:00.000Z`,
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 10 },
        device: { deviceId: "terminal_soho_01", platform: "android" }
      })
    });
    assert.equal(res2.status, 201);
    const data2 = await res2.json();
    assert.equal(data2.record.nsr, firstNsr + 1, "NSR deve incrementar estritamente em +1");
    assert.equal(data2.record.workedMinutesFirstShift, 270);

    // 3. Batida: ALMOÇO RETORNO (11:30:00) - 60 min de intervalo (Art. 71 CLT)
    const res3 = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        punchType: "almoco_retorno",
        timestamp: `${today}T11:30:00.000Z`,
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 10 },
        device: { deviceId: "terminal_soho_01", platform: "android" }
      })
    });
    assert.equal(res3.status, 201);
    const data3 = await res3.json();
    assert.equal(data3.record.nsr, firstNsr + 2);
    assert.equal(data3.record.lunchIntervalMinutes, 60);

    // 4. Batida: SAÍDA (14:20:00) - 2h50 trabalhadas no 2º turno (170 min)
    const res4 = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        punchType: "saida",
        timestamp: `${today}T14:20:00.000Z`,
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 10 },
        device: { deviceId: "terminal_soho_01", platform: "android" }
      })
    });
    assert.equal(res4.status, 201);
    const data4 = await res4.json();
    assert.equal(data4.record.nsr, firstNsr + 3);

    // Verificação de Totalização da Jornada Diária
    assert.equal(data4.record.totalWorkedMinutesToday, 440, "Total diário deve ser 440 min (7h20)");
    assert.equal(data4.record.overtimeMinutesToday, 0, "Sem horas extras em jornada padrão 7h20");

    // Validação no Espelho Diário
    const resSheet = await fetch(`${baseUrl}/timekeeping/daily-sheet?date=${today}`);
    assert.equal(resSheet.status, 200);
    const dataSheet = await resSheet.json();
    assert.equal(dataSheet.success, true);
    const empDaily = dataSheet.dailySheets.find(s => s.employeeId === employeeId);
    assert.ok(empDaily);
    assert.equal(empDaily.punches.length, 4);
    assert.equal(empDaily.totalWorkedMinutes, 440);
  });
});

// ── TESTE 2: Validação de Geofencing Haversine ───────────────────────────────

test("M2-2: Geofencing Haversine (0m hotel, 100m raio OK, 500m violado)", async () => {
  // Teste Unitário da Função Matemática Haversine
  const distZero = calculateDistanceHaversine(SOHO_COORDS.latitude, SOHO_COORDS.longitude, SOHO_COORDS.latitude, SOHO_COORDS.longitude);
  assert.ok(distZero < 1, "Distância para as mesmas coordenadas deve ser ~0m");

  // Ponto a ~100m ao Norte (-21.7575, -41.3262)
  const dist100m = calculateDistanceHaversine(SOHO_COORDS.latitude, SOHO_COORDS.longitude, -21.7575, SOHO_COORDS.longitude);
  assert.ok(dist100m >= 95 && dist100m <= 105, `Distância esperada ~100m, obtida: ${dist100m}`);

  // Ponto a ~500m ao Norte (-21.7539, -41.3262)
  const dist500m = calculateDistanceHaversine(SOHO_COORDS.latitude, SOHO_COORDS.longitude, -21.7539, SOHO_COORDS.longitude);
  assert.ok(dist500m >= 490 && dist500m <= 515, `Distância esperada ~500m, obtida: ${dist500m}`);

  // Robustez contra NaN em Antípodas e Entradas Não-Finitas (M2 Iteração 2)
  const distAntipode1 = calculateDistanceHaversine(-88.40000000000009, 0, 88.40000000000009, 180);
  assert.equal(isNaN(distAntipode1), false, "Antípoda com imprecisão IEEE 754 não deve retornar NaN");
  assert.ok(distAntipode1 > 20000000, `Distância antípoda deve ser ~20.015km, obtida: ${distAntipode1}`);

  const distAntipode2 = calculateDistanceHaversine(-52.20000000000131, 0, 52.20000000000131, 180);
  assert.equal(isNaN(distAntipode2), false, "Antípoda 2 com imprecisão IEEE 754 não deve retornar NaN");
  assert.ok(distAntipode2 > 20000000, `Distância antípoda deve ser ~20.015km, obtida: ${distAntipode2}`);

  const distInfinity = calculateDistanceHaversine(Infinity, -41.3262, SOHO_COORDS.latitude, SOHO_COORDS.longitude);
  assert.equal(distInfinity, Infinity, "Entrada com latitude Infinity deve retornar Infinity");

  // Teste Integrado via HTTP
  const { app } = createTestHarness();
  await withHttpServer(app, async (baseUrl) => {
    // Caso 2.1: No hotel (distância ~0m) -> Aprovado
    const resOkHotel = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_camareira_01",
        punchType: "entrada",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
        device: { deviceId: "device_01" }
      })
    });
    assert.equal(resOkHotel.status, 201);
    const dataOkHotel = await resOkHotel.json();
    assert.equal(dataOkHotel.record.withinGeofence, true);
    assert.ok(dataOkHotel.record.distanceMeters <= 5);

    // Caso 2.2: A 100m do hotel (dentro do limite de 150m) -> Aprovado
    const resOk100m = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_camareira_01",
        punchType: "almoco_saida",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: -21.7575, lng: SOHO_COORDS.longitude, accuracy: 5 },
        device: { deviceId: "device_01" }
      })
    });
    assert.equal(resOk100m.status, 201);
    const dataOk100m = await resOk100m.json();
    assert.equal(dataOk100m.record.withinGeofence, true);
    assert.ok(dataOk100m.record.distanceMeters <= 150);

    // Caso 2.3: A 500m do hotel (fora do raio de 150m) -> Interceptado
    const resFail500m = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_camareira_01",
        punchType: "almoco_retorno",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: -21.7539, lng: SOHO_COORDS.longitude, accuracy: 5 },
        device: { deviceId: "device_01" }
      })
    });
    // Modo padrão: admin_override sem credencial -> status 422 ou 403
    assert.ok(resFail500m.status === 422 || resFail500m.status === 403);
    const dataFail500m = await resFail500m.json();
    assert.equal(dataFail500m.success, false);
    assert.equal(dataFail500m.actionRequired, "admin_override");
    assert.equal(dataFail500m.ruleId, "geofence_violada");
    assert.ok(dataFail500m.distanceMeters >= 490);
  });
});

// ── TESTE 3: Whitelist de Aparelhos ──────────────────────────────────────────

test("M2-3: Whitelist de Aparelhos (Desativada aceita qualquer um; Ativada bloqueia desconhecido)", async () => {
  // Cenário A: Whitelist desativada (default)
  const harnessA = createTestHarness({
    hrSettings: { deviceWhitelist: { enabled: false, enforceStrict: false } }
  });

  await withHttpServer(harnessA.app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_cozinha_01",
        punchType: "entrada",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
        device: { deviceId: "celular_pessoal_desconhecido_xyz" }
      })
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.record.deviceAuthorized, true);
  });

  // Cenário B: Whitelist ativada com terminal autorizado
  const harnessB = createTestHarness({
    hrSettings: { deviceWhitelist: { enabled: true, enforceStrict: true } }
  });
  // Cadastra terminal oficial na whitelist
  harnessB.mockDb.hrDeviceWhitelist.push({
    id: "dev_tablet_soho",
    deviceId: "tablet_oficial_soho",
    label: "Tablet da Recepção",
    active: true,
    authorizedBy: "admin",
    registeredAt: new Date().toISOString()
  });

  await withHttpServer(harnessB.app, async (baseUrl) => {
    // Subcase B1: Aparelho autorizado -> Sucesso
    const resAuth = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_cozinha_01",
        punchType: "entrada",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
        device: { deviceId: "tablet_oficial_soho" }
      })
    });
    assert.equal(resAuth.status, 201);
    const dataAuth = await resAuth.json();
    assert.equal(dataAuth.record.deviceAuthorized, true);

    // Subcase B2: Aparelho não cadastrado -> Rejeição
    const resUnauth = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_cozinha_01",
        punchType: "saida",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
        device: { deviceId: "celular_estranho_999" }
      })
    });
    assert.ok(resUnauth.status === 422 || resUnauth.status === 403 || resUnauth.status === 400);
    const dataUnauth = await resUnauth.json();
    assert.equal(dataUnauth.success, false);
    assert.equal(dataUnauth.ruleId, "aparelho_nao_autorizado");
  });
});

// ── TESTE 4: Selfie e Integridade SHA-256 ────────────────────────────────────

test("M2-4: Validação de Selfie e Integridade Criptográfica SHA-256", async () => {
  // Teste unitário da função de hashing
  const hashResult = validateAndHashSelfie(VALID_SAMPLE_SELFIE);
  assert.equal(hashResult.valid, true);
  assert.match(hashResult.hash, /^[a-f0-9]{64}$/, "Hash SHA-256 deve ter 64 caracteres hexadecimais");

  const { app } = createTestHarness();
  await withHttpServer(app, async (baseUrl) => {
    // 4.1 Selfie Válida -> Gravada com hash correto
    const resValid = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_camareira_01",
        punchType: "entrada",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
        device: { deviceId: "dev_01" }
      })
    });
    assert.equal(resValid.status, 201);
    const dataValid = await resValid.json();
    assert.equal(dataValid.record.selfieHash, hashResult.hash);

    // 4.2 Selfie Ausente ou Corrompida -> Interceptada
    const resCorrupt = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_camareira_01",
        punchType: "saida",
        selfie: "corrupted_non_base64_string",
        geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
        device: { deviceId: "dev_01" }
      })
    });
    assert.ok(resCorrupt.status === 422 || resCorrupt.status === 400);
    const dataCorrupt = await resCorrupt.json();
    assert.equal(dataCorrupt.success, false);
    assert.equal(dataCorrupt.ruleId, "selfie_ausente_ou_invalida");
  });
});

// ── TESTE 5: Motor de Conformidade em 3 Níveis ───────────────────────────────

test("M2-5: Motor de Conformidade em 3 Níveis (alert, admin_override, hard_block)", async () => {
  // Testaremos a regra geofence_violada em cada um dos 3 modos
  const OUT_OF_BOUNDS_COORDS = { lat: -21.7539, lng: SOHO_COORDS.longitude, accuracy: 5 }; // ~500m

  // 1. Modo ALERT
  const harnessAlert = createTestHarness();
  harnessAlert.mockDb.hrComplianceSettings.rules.geofence_violada.level = "alert";

  await withHttpServer(harnessAlert.app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_cozinha_01",
        punchType: "entrada",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: OUT_OF_BOUNDS_COORDS,
        device: { deviceId: "dev_01" }
      })
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.compliance.status, "warning");
    assert.ok(data.compliance.warnings.some(w => w.ruleId === "geofence_violada"));
    assert.equal(harnessAlert.mockDb.hrTimeRecords.length, 1, "Ponto deve ser gravado no modo alert");
  });

  // 2. Modo ADMIN_OVERRIDE
  const harnessOverride = createTestHarness();
  harnessOverride.mockDb.hrComplianceSettings.rules.geofence_violada.level = "admin_override";

  await withHttpServer(harnessOverride.app, async (baseUrl) => {
    // 2.1 Sem senha de override -> Bloqueio
    const resNoAuth = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_cozinha_01",
        punchType: "entrada",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: OUT_OF_BOUNDS_COORDS,
        device: { deviceId: "dev_01" }
      })
    });
    assert.ok(resNoAuth.status === 422 || resNoAuth.status === 403);
    const dataNoAuth = await resNoAuth.json();
    assert.equal(dataNoAuth.actionRequired, "admin_override");

    // 2.2 Com senha incorreta -> Bloqueio 403
    const resBadPass = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_cozinha_01",
        punchType: "entrada",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: OUT_OF_BOUNDS_COORDS,
        device: { deviceId: "dev_01" },
        adminOverride: { adminPassword: "senha_errada", justification: "Tentativa de liberação" }
      })
    });
    assert.equal(resBadPass.status, 403);

    // 2.3 Com senha correta ("admin123") e justificativa -> Liberado com Auditoria
    const resGoodPass = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_cozinha_01",
        punchType: "entrada",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: OUT_OF_BOUNDS_COORDS,
        device: { deviceId: "dev_01" },
        adminOverride: { adminPassword: "admin123", justification: "Autorizado pelo Gestor: oscilação no sinal de GPS" }
      })
    });
    assert.equal(resGoodPass.status, 201);
    const dataGoodPass = await resGoodPass.json();
    assert.equal(dataGoodPass.success, true);
    assert.equal(dataGoodPass.record.overridden, true);

    // Conferência da Trilha em hrComplianceAudits
    const audits = harnessOverride.mockDb.hrComplianceAudits;
    assert.equal(audits.length, 1);
    assert.equal(audits[0].ruleId, "geofence_violada");
    assert.equal(audits[0].justification, "Autorizado pelo Gestor: oscilação no sinal de GPS");
  });

  // 3. Modo HARD_BLOCK
  const harnessHard = createTestHarness();
  harnessHard.mockDb.hrComplianceSettings.rules.geofence_violada.level = "hard_block";

  await withHttpServer(harnessHard.app, async (baseUrl) => {
    // Mesmo fornecendo senha de admin e justificativa, deve ser sumariamente bloqueado
    const resHard = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_cozinha_01",
        punchType: "entrada",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: OUT_OF_BOUNDS_COORDS,
        device: { deviceId: "dev_01" },
        adminOverride: { adminPassword: "admin123", justification: "Tentando override em regra bloqueante" }
      })
    });
    assert.equal(resHard.status, 400);
    const dataHard = await resHard.json();
    assert.equal(dataHard.success, false);
    assert.equal(dataHard.actionRequired, "hard_block");
    assert.equal(harnessHard.mockDb.hrTimeRecords.length, 0, "Nenhum ponto pode ser registrado em hard_block");
  });
});

// ── TESTE 6: Regras Trabalhistas Específicas ─────────────────────────────────

test("M2-6: Regras Trabalhistas (Intrajornada < 1h, Interjornada < 11h, Horas Extras > 2h)", async () => {
  const { mockDb, app } = createTestHarness();

  await withHttpServer(app, async (baseUrl) => {
    const employeeId = "emp_cozinha_01";

    // 6.1 Intervalo Intrajornada < 1h após jornada > 6h (Art. 71 CLT)
    // Simula saída de almoço às 12:00 e tentativa de retorno às 12:30 (30 min)
    mockDb.hrTimeRecords.push(
      { id: "p1", employeeId, date: "2026-10-22", punchType: "entrada", time: "06:00:00", timestamp: "2026-10-22T06:00:00.000Z", nsr: 2001 },
      { id: "p2", employeeId, date: "2026-10-22", punchType: "almoco_saida", time: "12:00:00", timestamp: "2026-10-22T12:00:00.000Z", nsr: 2002 }
    );

    const resLunch = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        punchType: "almoco_retorno",
        timestamp: "2026-10-22T12:30:00.000Z", // Apenas 30 minutos!
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
        device: { deviceId: "dev_01" }
      })
    });
    assert.ok(resLunch.status === 422 || resLunch.status === 403);
    const dataLunch = await resLunch.json();
    assert.equal(dataLunch.ruleId, "intrajornada_minima");

    // 6.2 Intervalo Interjornada < 11h entre dois expedientes (Art. 66 CLT)
    // Saída no dia anterior às 22:00 e entrada hoje às 06:00 (apenas 8h de descanso)
    mockDb.hrTimeRecords.push(
      { id: "p_prev", employeeId: "emp_camareira_01", date: "2026-10-21", punchType: "saida", time: "22:00:00", timestamp: "2026-10-21T22:00:00.000Z", nsr: 2003 }
    );

    const resInter = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_camareira_01",
        punchType: "entrada",
        timestamp: "2026-10-22T06:00:00.000Z", // 8h após o término anterior
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
        device: { deviceId: "dev_01" }
      })
    });
    assert.ok(resInter.status === 422 || resInter.status === 403);
    const dataInter = await resInter.json();
    assert.equal(dataInter.ruleId, "interjornada_minima");

    // 6.3 Mais de 2 Horas Extras Diárias (Art. 59 CLT)
    // Jornada diária padrão: 7h20 (440 min). Trabalho de 11h30 (690 min) = 4h10 de HE (> 2h)
    mockDb.hrTimeRecords.push(
      { id: "p_he1", employeeId: "emp_camareira_01", date: "2026-10-22", punchType: "entrada", time: "06:00:00", timestamp: "2026-10-22T06:00:00.000Z", nsr: 2004 },
      { id: "p_he2", employeeId: "emp_camareira_01", date: "2026-10-22", punchType: "almoco_saida", time: "11:00:00", timestamp: "2026-10-22T11:00:00.000Z", nsr: 2005 },
      { id: "p_he3", employeeId: "emp_camareira_01", date: "2026-10-22", punchType: "almoco_retorno", time: "12:00:00", timestamp: "2026-10-22T12:00:00.000Z", nsr: 2006 }
    );

    const resOvertime = await fetch(`${baseUrl}/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_camareira_01",
        punchType: "saida",
        timestamp: "2026-10-22T18:30:00.000Z", // 11h30 trabalhadas!
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
        device: { deviceId: "dev_01" }
      })
    });
    assert.ok(resOvertime.status === 422 || resOvertime.status === 403 || resOvertime.status === 400);
    const dataOvertime = await resOvertime.json();
    assert.equal(dataOvertime.ruleId, "limite_horas_extras");
  });
});

// ── TESTE 7: Blindagem Estrita de Cris e Grazi ───────────────────────────────

test("M2-7: Blindagem Estrita de Cris e Grazi (Bloqueio 403 imediato de batida CLT)", async () => {
  const { mockDb, app } = createTestHarness();

  await withHttpServer(app, async (baseUrl) => {
    // 7.1 Tentativa de submeter ponto para Cris (id: 2, "2", "cris", "Cris")
    const targetsCris = [2, "2", "cris", "Cris"];
    for (const empId of targetsCris) {
      const res = await fetch(`${baseUrl}/punch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: empId,
          punchType: "entrada",
          selfie: VALID_SAMPLE_SELFIE,
          geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
          device: { deviceId: "dev_01" }
        })
      });
      assert.equal(res.status, 403, `Batida para Cris (${empId}) DEVE ser rejeitada com 403 Forbidden`);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.ok(data.error.includes("prestadora") || data.error.includes("não é funcionária CLT"));
    }

    // 7.2 Tentativa de submeter ponto para Grazi (id: 3, "3", "grazi", "Grazi")
    const targetsGrazi = [3, "3", "grazi", "Grazi"];
    for (const empId of targetsGrazi) {
      const res = await fetch(`${baseUrl}/punch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: empId,
          punchType: "entrada",
          selfie: VALID_SAMPLE_SELFIE,
          geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
          device: { deviceId: "dev_01" }
        })
      });
      assert.equal(res.status, 403, `Batida para Grazi (${empId}) DEVE ser rejeitada com 403 Forbidden`);
      const data = await res.json();
      assert.equal(data.success, false);
    }

    // 7.3 Chamada direta da função registerPunch deve lançar exceção de segurança
    assert.throws(
      () => registerPunch(mockDb, { employeeId: 2, punchType: "entrada" }, "test"),
      /CRITICAL_SECURITY_VIOLATION/
    );
    assert.throws(
      () => registerPunch(mockDb, { employeeId: 3, punchType: "entrada" }, "test"),
      /CRITICAL_SECURITY_VIOLATION/
    );

    // 7.4 Garantia de integridade absoluta de hrTimeRecords
    const contaminatedRecords = mockDb.hrTimeRecords.filter(r => isPrestadora(r) || isPrestadora({ id: r.employeeId }));
    assert.equal(contaminatedRecords.length, 0, "hrTimeRecords NUNCA pode conter registros associados a Cris ou Grazi");
  });
});

// ── TESTE 8: Paridade Twin-Server SHA-256 ─────────────────────────────────────

test("M2-8: Paridade Twin-Server (100% SHA-256 com timekeeping.mjs e compliance.mjs)", () => {
  const { allPass, results, total, passCount, importIssues } = checkTwinParity();

  assert.equal(allPass, true, "Todos os arquivos gêmeos de artifacts/ e scripts/ devem ter hashes idênticos");
  assert.ok(total >= 32, "Devem existir ao menos 32 arquivos auditados dinamicamente");
  assert.equal(passCount, total, "Contagem de arquivos com aprovação deve ser 100%");
  assert.equal(importIssues.length, 0, "Não deve haver erros de resolução estática de imports");

  // Auditoria pontual dos novos arquivos de M2
  const timekeepingTwin = results.find(r => r.file === "hr/timekeeping.mjs");
  assert.ok(timekeepingTwin, "hr/timekeeping.mjs deve constar no espelho gêmeo");
  assert.equal(timekeepingTwin.pass, true, "timekeeping.mjs deve ter paridade 100% SHA-256");

  const complianceTwin = results.find(r => r.file === "hr/compliance.mjs");
  assert.ok(complianceTwin, "hr/compliance.mjs deve constar no espelho gêmeo");
  assert.equal(complianceTwin.pass, true, "compliance.mjs deve ter paridade 100% SHA-256");
});

// ── TESTE 9: Endpoints REST de Conformidade Trabalhista (/compliance/*) ──────

test("M2-9: Endpoints REST de Conformidade Trabalhista (/compliance/rules, /validate, /audits)", async () => {
  const { mockDb, app } = createTestHarness();

  await withHttpServer(app, async (baseUrl) => {
    // 9.1 GET /api/hr/compliance/rules: assertar status 200 e exatamente 10 regras únicas
    const resRules = await fetch(`${baseUrl}/compliance/rules`);
    assert.equal(resRules.status, 200, "GET /compliance/rules deve retornar HTTP 200");
    const dataRules = await resRules.json();
    assert.equal(dataRules.success, true);
    assert.ok(Array.isArray(dataRules.rules), "rules deve ser um array");
    assert.equal(dataRules.total, 10, "Total de regras deve ser exatamente 10");
    assert.equal(dataRules.rules.length, 10, "Array de regras deve conter exatamente 10 itens");

    // Verificar unicidade de IDs (sem duplicatas por aliases)
    const ruleIds = dataRules.rules.map(r => r.id);
    const uniqueIds = new Set(ruleIds);
    assert.equal(uniqueIds.size, 10, "Devem existir 10 IDs de regras estritamente únicos");

    const expectedRules = [
      "intrajornada_minima",
      "interjornada_minima",
      "limite_horas_extras",
      "maximo_dias_consecutivos",
      "tolerancia_art58",
      "geofence_violada",
      "aparelho_nao_autorizado",
      "selfie_ausente_ou_invalida",
      "trabalho_em_dsr",
      "trabalho_em_ferias_ou_afastamento"
    ];
    for (const expectedId of expectedRules) {
      assert.ok(uniqueIds.has(expectedId), `Regra obrigatória '${expectedId}' deve constar no catálogo`);
    }

    // 9.2 PATCH /api/hr/compliance/rules/:ruleId: alteração de nível e persistência
    const targetRuleId = "geofence_violada";
    const resPatch = await fetch(`${baseUrl}/compliance/rules/${targetRuleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "hard_block",
        enabled: true,
        params: { radiusMeters: 200 }
      })
    });
    assert.equal(resPatch.status, 200, "PATCH /compliance/rules/:ruleId deve retornar HTTP 200");
    const dataPatch = await resPatch.json();
    assert.equal(dataPatch.success, true);
    assert.equal(dataPatch.rule.level, "hard_block");
    assert.equal(dataPatch.rule.params.radiusMeters, 200);

    // Confirmar persistência via GET
    const resRulesAfter = await fetch(`${baseUrl}/compliance/rules`);
    const dataRulesAfter = await resRulesAfter.json();
    const persistedRule = dataRulesAfter.rules.find(r => r.id === targetRuleId);
    assert.ok(persistedRule);
    assert.equal(persistedRule.level, "hard_block");
    assert.equal(persistedRule.params.radiusMeters, 200);

    // Validação de erro com nível inválido
    const resInvalidPatch = await fetch(`${baseUrl}/compliance/rules/${targetRuleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: "nivel_invalido" })
    });
    assert.equal(resInvalidPatch.status, 400, "Nível inválido deve retornar HTTP 400");

    // Restaurar regra para admin_override para os próximos testes
    await fetch(`${baseUrl}/compliance/rules/${targetRuleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: "admin_override", params: { radiusMeters: 150 } })
    });

    // 9.3 POST /api/hr/compliance/validate para Cris e Grazi: HTTP 403 Forbidden
    const prestadoras = [2, "2", "cris", "Cris", 3, "3", "grazi", "Grazi"];
    for (const empId of prestadoras) {
      const resPrestadora = await fetch(`${baseUrl}/compliance/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: empId,
          punchType: "entrada",
          date: "2026-10-22",
          selfie: VALID_SAMPLE_SELFIE,
          geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
          device: { deviceId: "terminal_01" }
        })
      });
      assert.equal(resPrestadora.status, 403, `Preflight para prestadora ${empId} deve retornar HTTP 403`);
      const dataPrestadora = await resPrestadora.json();
      assert.equal(dataPrestadora.success, false);
      assert.equal(dataPrestadora.allowed, false);
      assert.equal(dataPrestadora.actionRequired, "hard_block");
      assert.equal(dataPrestadora.ruleId, "prestadora_bloqueada");
    }

    // 9.4 POST /api/hr/compliance/validate para hard_block: HTTP 400
    // Cenário: Selfie corrompida/ausente dispara regra 'selfie_ausente_ou_invalida' (hard_block)
    const resHardBlock = await fetch(`${baseUrl}/compliance/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_cozinha_01",
        punchType: "entrada",
        date: "2026-10-22",
        selfie: "data:image/jpeg;base64,invalid_short",
        geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
        device: { deviceId: "terminal_01" }
      })
    });
    assert.equal(resHardBlock.status, 400, "Violação de hard_block em preflight deve retornar HTTP 400");
    const dataHardBlock = await resHardBlock.json();
    assert.equal(dataHardBlock.success, false);
    assert.equal(dataHardBlock.allowed, false);
    assert.equal(dataHardBlock.actionRequired, "hard_block");
    assert.equal(dataHardBlock.ruleId, "selfie_ausente_ou_invalida");

    // 9.5 POST /api/hr/compliance/validate para admin_override:
    // Forçar violação de geofence (fora do hotel ~10.000m) em modo admin_override
    const outOfBoundsCoords = { lat: 0, lng: 0 }; // Linha do Equador / Oceano

    // 9.5.1 Sem credencial de override: assertar HTTP 422
    const resNoAuth = await fetch(`${baseUrl}/compliance/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_cozinha_01",
        punchType: "entrada",
        date: "2026-10-22",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: outOfBoundsCoords.lat, lng: outOfBoundsCoords.lng, accuracy: 10 },
        device: { deviceId: "terminal_01" }
      })
    });
    assert.equal(resNoAuth.status, 422, "Violação de admin_override sem credencial deve retornar HTTP 422");
    const dataNoAuth = await resNoAuth.json();
    assert.equal(dataNoAuth.success, false);
    assert.equal(dataNoAuth.allowed, false);
    assert.equal(dataNoAuth.actionRequired, "admin_override");
    assert.equal(dataNoAuth.ruleId, "geofence_violada");

    // 9.5.2 Com senha errada: assertar HTTP 403
    const resBadPassword = await fetch(`${baseUrl}/compliance/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_cozinha_01",
        punchType: "entrada",
        date: "2026-10-22",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: outOfBoundsCoords.lat, lng: outOfBoundsCoords.lng, accuracy: 10 },
        device: { deviceId: "terminal_01" },
        adminOverride: {
          adminPassword: "senha_errada_invalida",
          justification: "Tentativa de liberação indevida"
        }
      })
    });
    assert.equal(resBadPassword.status, 403, "Tentativa de override com senha incorreta deve retornar HTTP 403");
    const dataBadPassword = await resBadPassword.json();
    assert.equal(dataBadPassword.success, false);
    assert.equal(dataBadPassword.allowed, false);
    assert.equal(dataBadPassword.badPassword, true);

    // 9.5.3 Com senha correta e justificativa: assertar HTTP 200
    const resSuccessOverride = await fetch(`${baseUrl}/compliance/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_cozinha_01",
        punchType: "entrada",
        date: "2026-10-22",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: outOfBoundsCoords.lat, lng: outOfBoundsCoords.lng, accuracy: 10 },
        device: { deviceId: "terminal_01" },
        adminOverride: {
          adminPassword: "admin123",
          justification: "Autorizado trabalho externo em evento corporativo"
        }
      })
    });
    assert.equal(resSuccessOverride.status, 200, "Override com senha correta e justificativa deve retornar HTTP 200");
    const dataSuccessOverride = await resSuccessOverride.json();
    assert.equal(dataSuccessOverride.success, true);
    assert.equal(dataSuccessOverride.allowed, true);
    assert.equal(dataSuccessOverride.overridden, true);
    assert.equal(dataSuccessOverride.authorizedBy, "admin");

    // 9.6 POST /api/hr/compliance/validate sem data explícita: assertar que NÃO ocorre crash RangeError
    const resNoDate = await fetch(`${baseUrl}/compliance/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp_cozinha_01",
        punchType: "entrada",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
        device: { deviceId: "terminal_01" }
      })
    });
    assert.notEqual(resNoDate.status, 500, "Requisição sem data não pode causar crash HTTP 500");
    assert.equal(resNoDate.status, 200, "Validação sem campo date explícito deve ser processada com HTTP 200");
    const dataNoDate = await resNoDate.json();
    assert.equal(dataNoDate.success, true);
    assert.equal(dataNoDate.allowed, true);

    // 9.7 GET /api/hr/compliance/audits: assertar listagem de auditoria
    const resAudits = await fetch(`${baseUrl}/compliance/audits`);
    assert.equal(resAudits.status, 200, "GET /compliance/audits deve retornar HTTP 200");
    const dataAudits = await resAudits.json();
    assert.equal(dataAudits.success, true);
    assert.ok(Array.isArray(dataAudits.audits), "audits deve ser um array");
    assert.ok(dataAudits.total >= 1, "Deve existir ao menos 1 registro de auditoria");

    const auditEntry = dataAudits.audits.find(
      a => a.employeeId === "emp_cozinha_01" && a.ruleId === "geofence_violada" && a.action === "overridden"
    );
    assert.ok(auditEntry, "Registro de auditoria do override aprovado deve existir na listagem");
    assert.equal(auditEntry.authorizedBy, "admin");
    assert.equal(auditEntry.justification, "Autorizado trabalho externo em evento corporativo");
    assert.equal(auditEntry.level, "admin_override");
  });
});

// ── TESTE 10: Robustez Matemática de Haversine em Antípodas e Não-Finitos ──────

test("M2-10: Robustez Matemática de Haversine em Antípodas e Valores Não-Finitos", () => {
  // 10.1 Coordenadas Antípodas com imprecisão de ponto flutuante IEEE 754
  // Antípoda exato (-88.4, 0 vs 88.4, 180) -> deve retornar número finito e NUNCA NaN
  const distAntipode1 = calculateDistanceHaversine(-88.4, 0, 88.4, 180);
  assert.ok(Number.isFinite(distAntipode1), `Distância deve ser número finito, obtido: ${distAntipode1}`);
  assert.ok(!Number.isNaN(distAntipode1), "Distância para antípoda NUNCA pode ser NaN");
  assert.ok(distAntipode1 > 19500000 && distAntipode1 <= 20037500, `Distância esperada ~20.000km, obtido: ${distAntipode1}`);

  // Casos de borda adicionais com ruído IEEE 754 onde a > 1.0 (ex: 1.0000000000000002)
  const distAntipode2 = calculateDistanceHaversine(-88.40000000000009, 0, 88.40000000000009, 180);
  assert.ok(Number.isFinite(distAntipode2), "Antípoda com ruído 1 deve ser finito");
  assert.ok(!Number.isNaN(distAntipode2), "Antípoda com ruído 1 NUNCA pode ser NaN");

  const distAntipode3 = calculateDistanceHaversine(-52.20000000000131, 0, 52.20000000000131, 180);
  assert.ok(Number.isFinite(distAntipode3), "Antípoda com ruído 2 deve ser finito");
  assert.ok(!Number.isNaN(distAntipode3), "Antípoda com ruído 2 NUNCA pode ser NaN");

  // Antípodas no equador (0, 0 vs 0, 180)
  const distEquatorAntipode = calculateDistanceHaversine(0, 0, 0, 180);
  assert.ok(Number.isFinite(distEquatorAntipode) && !Number.isNaN(distEquatorAntipode));
  assert.ok(distEquatorAntipode > 19900000 && distEquatorAntipode <= 20037500);

  // 10.2 Coordenadas Não-Finitas (Infinity / -Infinity / NaN)
  // Devem retornar Infinity com segurança e NUNCA NaN
  const distInfLat1 = calculateDistanceHaversine(Infinity, -41.3262, -21.7584, -41.3262);
  assert.equal(distInfLat1, Infinity, "Latitude Infinity deve retornar Infinity com segurança");

  const distNegInfLat = calculateDistanceHaversine(-Infinity, -41.3262, -21.7584, -41.3262);
  assert.equal(distNegInfLat, Infinity, "Latitude -Infinity deve retornar Infinity com segurança");

  const distInfLon = calculateDistanceHaversine(-21.7584, Infinity, -21.7584, -41.3262);
  assert.equal(distInfLon, Infinity, "Longitude Infinity deve retornar Infinity com segurança");

  const distNegInfLon = calculateDistanceHaversine(-21.7584, -Infinity, -21.7584, -41.3262);
  assert.equal(distNegInfLon, Infinity, "Longitude -Infinity deve retornar Infinity com segurança");

  const distNaN = calculateDistanceHaversine(NaN, -41.3262, -21.7584, -41.3262);
  assert.equal(distNaN, Infinity, "Coordenada NaN deve retornar Infinity com segurança");

  const distStringInvalid = calculateDistanceHaversine("not_a_number", -41.3262, -21.7584, -41.3262);
  assert.equal(distStringInvalid, Infinity, "String não-numérica deve retornar Infinity com segurança");
});

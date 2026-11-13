/**
 * Suíte de Testes Pontual Dedicada Consolidada: Gestão de Funcionários CLT,
 * Ponto com Selfie/GPS, Conformidade em 3 Níveis, WhatsApp, Escalas 6x1,
 * Folha de Pagamento, Contratos Canvas, ASO NR-7, Permissões e Paridade Twin-Server
 * 
 * Marco: M5 (Frontend React: Rotas, Permissões, Build e Suíte Pontual Final)
 * Arquivo: tests/hr-employee-management.test.mjs
 * 
 * Execução pontual estrita: node --test tests/hr-employee-management.test.mjs
 * Conforme diretrizes do AGENTS.md (proibido rodar suítes globais em lote).
 */

import test, { describe, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import express from "express";

// ── Verificador de Paridade Twin-Server ──────────────────────────────────────
import { checkTwinParity } from "../scripts/check-twin-parity.mjs";

// ── Módulos Backend de RH ───────────────────────────────────────────────────
import {
  isPrestadora,
  isCltEmployee,
  validateRecipientNotPrestador,
  getDefaultHrEmployees,
  createEmployee,
  getEmployees,
  getEmployeeById,
  updateEmployee
} from "../artifacts/api-server/hr/employees.mjs";

import {
  ensureHrCollections,
  createHrRouter,
  getDefaultHrSettings,
  getDefaultHrComplianceSettings
} from "../artifacts/api-server/hr/index.mjs";

import {
  HOTEL_COORDINATES,
  calculateDistanceHaversine,
  validateAndHashSelfie,
  registerPunch,
  checkDeviceWhitelist,
  getTimeRecords,
  getDailySheet,
  getMonthlyMirror,
  authorizeDevice,
  getDeviceWhitelist
} from "../artifacts/api-server/hr/timekeeping.mjs";

import {
  getComplianceRules,
  updateComplianceRule,
  validatePunchCompliance,
  getComplianceAudits
} from "../artifacts/api-server/hr/compliance.mjs";

import {
  generateRepPReceiptText,
  sendPunchReceipt,
  calculateMonthlyHourBalance,
  checkEmployeeReminders,
  processRemindersScan,
  getWhatsAppLogs
} from "../artifacts/api-server/hr/whatsapp-automation.mjs";

import {
  generateMonthlySchedule,
  getSchedules,
  updateSchedule,
  calculatePunchTolerance,
  calculateDayOvertimeAndNight,
  calculateNightShiftAndExtension,
  validateSundayRotation,
  validateVacationSchedule,
  scheduleVacation,
  getVacations
} from "../artifacts/api-server/hr/schedules.mjs";

import {
  EMPLOYER_INFO,
  INSS_BRACKETS_2026,
  calculateInssProgressive,
  calculateDsrReflex,
  calculateMonthlyPayroll,
  generatePayslip,
  registerPayrollPayment,
  closeMonthlyPayroll,
  getPayrollRecords
} from "../artifacts/api-server/hr/payroll.mjs";

import {
  CONTRACT_TEMPLATES,
  generateContractDocument,
  signContractWithCanvas,
  getContracts,
  registerAsoExam,
  checkAsoAlerts,
  getAsoRecords
} from "../artifacts/api-server/hr/contracts-aso.mjs";

// ── Utilitários e Constantes do Test Harness ─────────────────────────────────

const TEMP_DB_FILE = path.join(os.tmpdir(), `temp-hr-consolidated-db-${Date.now()}.json`);
const SOHO_COORDS = { latitude: -21.7584, longitude: -41.3262 };
const VALID_SAMPLE_SELFIE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
const SAMPLE_CANVAS_SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

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

  const savedOperations = [];
  const saveDatabase = (op) => {
    savedOperations.push(op);
    try {
      fs.writeFileSync(TEMP_DB_FILE, JSON.stringify(mockDb, null, 2), "utf8");
    } catch {
      // Ignora falhas transitórias em mocks
    }
  };

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
  } catch {
    // Teardown silencioso
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 12 TESTES PONTUAIS CONSOLIDADOS DO MARCO M5
// ════════════════════════════════════════════════════════════════════════════

test("M5-01: Cadastro de Colaboradores CLT, Carga 6x1 (44h) e Schemas Contratuais", async () => {
  const { mockDb, app } = createTestHarness();

  // 1. Verificação dos colaboradores padrão (Cozinheira Sebastiana e Camareira Luciana)
  const defaultList = mockDb.hrEmployees;
  assert.ok(defaultList.length >= 2, "Devem existir ao menos 2 colaboradores CLT pré-configurados");

  const cozinheira = defaultList.find(e => e.id === "emp_cozinha_01");
  assert.ok(cozinheira, "Cozinheira emp_cozinha_01 deve existir");
  assert.equal(cozinheira.contractType, "clt");
  assert.equal(cozinheira.workRegime, "6x1_44h");
  assert.equal(cozinheira.weeklyHours, 44);
  assert.equal(cozinheira.baseSalary, 1780.00);
  assert.equal(isCltEmployee(cozinheira), true);
  assert.equal(isPrestadora(cozinheira), false);

  const camareira = defaultList.find(e => e.id === "emp_camareira_01");
  assert.ok(camareira, "Camareira emp_camareira_01 deve existir");
  assert.equal(camareira.contractType, "clt");
  assert.equal(camareira.workRegime, "6x1_44h");
  assert.equal(camareira.weeklyHours, 44);
  assert.equal(camareira.baseSalary, 1650.00);
  assert.equal(isCltEmployee(camareira), true);

  // 2. Criação de novo colaborador via API REST POST /api/hr/employees
  await withHttpServer(app, async (baseUrl) => {
    const resCreate = await requestJson(`${baseUrl}/employees`, {
      method: "POST",
      body: {
        name: "Carlos Eduardo Auxiliar",
        cpf: "11122233344",
        role: "Auxiliar Geral de Hotelaria",
        roleCategory: "hotelaria",
        baseSalary: 1950.00,
        admissionDate: "2026-06-01",
        ctpsNumber: "9876543/001-RJ",
        pisPasep: "123.45678.90-1",
        pixKey: "22997788990",
        pin: "5432"
      }
    });

    assert.equal(resCreate.status, 201);
    assert.equal(resCreate.body.success, true);
    assert.equal(resCreate.body.employee.contractType, "clt");
    assert.equal(resCreate.body.employee.workRegime, "6x1_44h");
    assert.equal(resCreate.body.employee.weeklyHours, 44);

    // Consulta do colaborador cadastrado
    const resGet = await requestJson(`${baseUrl}/employees/${resCreate.body.employee.id}`);
    assert.equal(resGet.status, 200);
    assert.equal(resGet.body.employee.name, "Carlos Eduardo Auxiliar");
  });
});

test("M5-02: Isolamento Absoluto de Prestadoras Autônomas Cris e Grazi (HTTP 403 Forbidden em TODAS as Rotas)", async () => {
  const { mockDb, app } = createTestHarness();
  const prestadoraTargets = [2, 3, "2", "3", "cris", "grazi", "Cris", "Grazi"];

  // 1. Verificação das funções puras de segurança
  for (const target of prestadoraTargets) {
    const dummy = { id: target, username: String(target) };
    assert.equal(isPrestadora(dummy), true, `Alvo ${target} deve ser identificado como prestadora`);
    assert.equal(isCltEmployee(dummy), false, `Alvo ${target} NUNCA deve ser CLT`);
  }

  // 2. Varredura completa das 15 rotas e endpoints de RH
  await withHttpServer(app, async (baseUrl) => {
    for (const target of [2, 3, "cris", "grazi"]) {
      // Ponto
      const rPunch = await requestJson(`${baseUrl}/punch`, { method: "POST", body: { employeeId: target } });
      assert.equal(rPunch.status, 403, `Ponto para ${target} deve retornar 403`);

      // Preflight de Conformidade
      const rComp = await requestJson(`${baseUrl}/compliance/validate`, { method: "POST", body: { employeeId: target } });
      assert.equal(rComp.status, 403, `Compliance para ${target} deve retornar 403`);

      // WhatsApp Comprovante
      const rRec = await requestJson(`${baseUrl}/whatsapp/send-receipt`, { method: "POST", body: { employeeId: target } });
      assert.equal(rRec.status, 403, `WhatsApp Recibo para ${target} deve retornar 403`);

      // WhatsApp Saldo
      const rBal = await requestJson(`${baseUrl}/whatsapp/balance/${target}`);
      assert.equal(rBal.status, 403, `WhatsApp Saldo para ${target} deve retornar 403`);

      // Escalas
      const rSched = await requestJson(`${baseUrl}/schedules/generate-month`, { method: "POST", body: { employeeId: target, yearMonth: "2026-10" } });
      assert.equal(rSched.status, 403, `Escalas para ${target} deve retornar 403`);

      // Férias
      const rVacGet = await requestJson(`${baseUrl}/vacations/${target}`);
      assert.equal(rVacGet.status, 403, `Férias GET para ${target} deve retornar 403`);
      const rVacSched = await requestJson(`${baseUrl}/vacations/schedule`, { method: "POST", body: { employeeId: target } });
      assert.equal(rVacSched.status, 403, `Férias Schedule para ${target} deve retornar 403`);

      // Folha de Pagamento
      const rPayCalc = await requestJson(`${baseUrl}/payroll/calculate`, { method: "POST", body: { employeeId: target, yearMonth: "2026-10" } });
      assert.equal(rPayCalc.status, 403, `Folha Calculate para ${target} deve retornar 403`);
      const rPayClose = await requestJson(`${baseUrl}/payroll/close-month`, { method: "POST", body: { employeeId: target, yearMonth: "2026-10" } });
      assert.equal(rPayClose.status, 403, `Folha Close para ${target} deve retornar 403`);
      const rPayList = await requestJson(`${baseUrl}/payroll?employeeId=${target}`);
      assert.equal(rPayList.status, 403, `Folha List para ${target} deve retornar 403`);
      const rPayPix = await requestJson(`${baseUrl}/payroll/${target}/pay-pix`, { method: "POST", body: {} });
      assert.equal(rPayPix.status, 403, `Folha PIX para ${target} deve retornar 403`);

      // Contratos
      const rContrGen = await requestJson(`${baseUrl}/contracts/generate`, { method: "POST", body: { employeeId: target, templateId: "contrato_trabalho_clt" } });
      assert.equal(rContrGen.status, 403, `Contratos Generate para ${target} deve retornar 403`);
      const rContrSign = await requestJson(`${baseUrl}/contracts/${target}/sign`, { method: "POST", body: { signatureDataUrl: SAMPLE_CANVAS_SIGNATURE } });
      assert.equal(rContrSign.status, 403, `Contratos Sign para ${target} deve retornar 403`);
      const rContrEmp = await requestJson(`${baseUrl}/contracts/employee/${target}`);
      assert.equal(rContrEmp.status, 403, `Contratos Employee para ${target} deve retornar 403`);

      // ASO
      const rAsoList = await requestJson(`${baseUrl}/aso?employeeId=${target}`);
      assert.equal(rAsoList.status, 403, `ASO List para ${target} deve retornar 403`);
      const rAsoReg = await requestJson(`${baseUrl}/aso`, { method: "POST", body: { employeeId: target, examType: "admissional" } });
      assert.equal(rAsoReg.status, 403, `ASO Register para ${target} deve retornar 403`);
      const rAsoEmp = await requestJson(`${baseUrl}/aso/employee/${target}`);
      assert.equal(rAsoEmp.status, 403, `ASO Employee para ${target} deve retornar 403`);
    }
  });

  // Garantia de integridade do mockDb
  assert.equal(mockDb.hrTimeRecords.length, 0);
  assert.equal(mockDb.hrPayroll.length, 0);
  assert.equal(mockDb.hrContracts.length, 0);
  assert.equal(mockDb.hrAso.length, 0);
});

test("M5-03: Registro de Ponto com Selfie, Geofencing Haversine e Whitelist de Aparelhos", async () => {
  const { mockDb, app } = createTestHarness();

  await withHttpServer(app, async (baseUrl) => {
    // 1. Batida Válida no Hotel com Selfie
    const resPunch = await requestJson(`${baseUrl}/punch`, {
      method: "POST",
      body: {
        employeeId: "emp_cozinha_01",
        punchType: "entrada",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
        device: { deviceId: "terminal_01" }
      }
    });

    assert.equal(resPunch.status, 201);
    assert.equal(resPunch.body.success, true);
    assert.equal(resPunch.body.record.punchType, "entrada");
    assert.equal(resPunch.body.record.withinGeofence, true);
    assert.ok(resPunch.body.record.distanceMeters <= 10);
    assert.ok(resPunch.body.record.selfieHash.length === 64);
    assert.ok(resPunch.body.record.nsr >= 1001);

    // 2. Geofence Violada (~500m fora do hotel)
    const resFar = await requestJson(`${baseUrl}/punch`, {
      method: "POST",
      body: {
        employeeId: "emp_cozinha_01",
        punchType: "saida",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: -21.7539, lng: SOHO_COORDS.longitude, accuracy: 5 },
        device: { deviceId: "terminal_01" }
      }
    });
    assert.ok(resFar.status === 422 || resFar.status === 403);
    assert.equal(resFar.body.ruleId, "geofence_violada");

    // 3. Whitelist de Aparelhos Ativada
    mockDb.hrSettings.deviceWhitelist = { enabled: true, enforceStrict: true };
    mockDb.hrDeviceWhitelist.push({ id: "dev_auth", deviceId: "tablet_oficial_soho", active: true });

    // Aparelho autorizado
    const resAuth = await requestJson(`${baseUrl}/punch`, {
      method: "POST",
      body: {
        employeeId: "emp_cozinha_01",
        punchType: "saida",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
        device: { deviceId: "tablet_oficial_soho" }
      }
    });
    assert.equal(resAuth.status, 201);
    assert.equal(resAuth.body.record.deviceAuthorized, true);

    // Aparelho estranho bloqueado
    const resUnauth = await requestJson(`${baseUrl}/punch`, {
      method: "POST",
      body: {
        employeeId: "emp_cozinha_01",
        punchType: "saida",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: SOHO_COORDS.latitude, lng: SOHO_COORDS.longitude, accuracy: 5 },
        device: { deviceId: "celular_estranho_999" }
      }
    });
    assert.ok(resUnauth.status === 422 || resUnauth.status === 403 || resUnauth.status === 400);
    assert.equal(resUnauth.body.ruleId, "aparelho_nao_autorizado");
  });
});

test("M5-04: Catálogo de 10 Regras Trabalhistas e Motor de Conformidade em 3 Níveis", async () => {
  const { mockDb, app } = createTestHarness();

  await withHttpServer(app, async (baseUrl) => {
    // 1. Listagem das 10 regras únicas
    const resRules = await requestJson(`${baseUrl}/compliance/rules`);
    assert.equal(resRules.status, 200);
    assert.equal(resRules.body.total, 10);
    const uniqueIds = new Set(resRules.body.rules.map(r => r.id));
    assert.equal(uniqueIds.size, 10);

    // 2. Teste do nível ALERT
    mockDb.hrComplianceSettings.rules.geofence_violada.level = "alert";
    const resAlert = await requestJson(`${baseUrl}/punch`, {
      method: "POST",
      body: {
        employeeId: "emp_cozinha_01",
        punchType: "entrada",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: 0, lng: 0 },
        device: { deviceId: "dev_01" }
      }
    });
    assert.equal(resAlert.status, 201);
    assert.equal(resAlert.body.compliance.status, "warning");

    // 3. Teste do nível ADMIN_OVERRIDE
    mockDb.hrComplianceSettings.rules.geofence_violada.level = "admin_override";
    // Sem senha -> 422
    const resNoPass = await requestJson(`${baseUrl}/punch`, {
      method: "POST",
      body: {
        employeeId: "emp_cozinha_01",
        punchType: "saida",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: 0, lng: 0 },
        device: { deviceId: "dev_01" }
      }
    });
    assert.ok(resNoPass.status === 422 || resNoPass.status === 403);
    assert.equal(resNoPass.body.actionRequired, "admin_override");

    // Com senha de admin -> 201 com auditoria
    const resOverride = await requestJson(`${baseUrl}/punch`, {
      method: "POST",
      body: {
        employeeId: "emp_cozinha_01",
        punchType: "saida",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: 0, lng: 0 },
        device: { deviceId: "dev_01" },
        adminOverride: { adminPassword: "admin123", justification: "Autorizado pelo Gestor" }
      }
    });
    assert.equal(resOverride.status, 201);
    assert.equal(resOverride.body.record.overridden, true);
    assert.ok(mockDb.hrComplianceAudits.length >= 1);

    // 4. Teste do nível HARD_BLOCK
    mockDb.hrComplianceSettings.rules.geofence_violada.level = "hard_block";
    const resHard = await requestJson(`${baseUrl}/punch`, {
      method: "POST",
      body: {
        employeeId: "emp_cozinha_01",
        punchType: "saida",
        selfie: VALID_SAMPLE_SELFIE,
        geolocation: { lat: 0, lng: 0 },
        device: { deviceId: "dev_01" },
        adminOverride: { adminPassword: "admin123", justification: "Tentando override" }
      }
    });
    assert.equal(resHard.status, 400);
    assert.equal(resHard.body.actionRequired, "hard_block");
  });
});

test("M5-05: Automação WhatsApp — Comprovante REP-P com Saldo e Lembretes Silenciados em Folga", async () => {
  const { mockDb, app } = createTestHarness();
  const emp = mockDb.hrEmployees.find(e => e.id === "emp_cozinha_01");

  // 1. Geração de comprovante textual REP-P
  const samplePunch = {
    id: "punch_rep_01",
    employeeId: emp.id,
    date: "2026-10-22",
    time: "06:00:00",
    punchType: "entrada",
    punchTypeLabel: "1ª Entrada",
    nsr: 1042,
    selfieHash: crypto.createHash("sha256").update("sample").digest("hex")
  };
  const receipt = generateRepPReceiptText(emp, samplePunch, { formattedBalance: "+01:30" });
  assert.ok(receipt.includes("CorpFlats Soho Residence"));
  assert.ok(receipt.includes("1042"));
  assert.ok(receipt.includes("+01:30"));

  // 2. Lembretes e Silenciamento
  // Dia de DSR: zero lembretes
  mockDb.hrSchedules = [
    { employeeId: emp.id, date: "2026-10-25", shiftType: "dsr", isDsr: true, plannedWorkMinutes: 0 }
  ];
  const dsrCheck = checkEmployeeReminders(mockDb, emp.id, "2026-10-25T06:15:00.000Z");
  assert.equal(dsrCheck.remindersSent.length, 0);
  assert.equal(dsrCheck.skipped, true);

  // Período de férias: zero lembretes
  mockDb.hrSchedules = [
    { employeeId: emp.id, date: "2026-11-05", shiftType: "vacation", plannedWorkMinutes: 0 }
  ];
  const vacCheck = checkEmployeeReminders(mockDb, emp.id, "2026-11-05T06:15:00.000Z");
  assert.equal(vacCheck.remindersSent.length, 0);
  assert.equal(vacCheck.skipped, true);
});

test("M5-06: Escalas 6x1 (44h Semanais), Tolerância Art. 58 CLT, Horas Extras e Adicional Noturno Súmula 60 TST", () => {
  const { mockDb } = createTestHarness();

  // 1. Escala 6x1 (44h semanais)
  const sched = generateMonthlySchedule(mockDb, "emp_cozinha_01", "2026-10", { modality: "7h20" });
  assert.equal(sched.length, 31);
  const week = sched.filter(s => s.date >= "2026-10-05" && s.date <= "2026-10-11");
  const totalWeekMinutes = week.reduce((acc, s) => acc + s.plannedWorkMinutes, 0);
  assert.equal(totalWeekMinutes, 2640, "Total semanal deve ser exatamente 2640 min (44h)");

  // 2. Tolerância Art. 58 CLT
  const planned = { startTime: "06:00", endTime: "14:20", plannedWorkMinutes: 440 };
  const punchesOk = [
    { type: "entrada", time: "05:58:00" },
    { type: "saida", time: "14:22:00" }
  ];
  const tolOk = calculatePunchTolerance(planned, punchesOk);
  assert.equal(tolOk.withinTolerance, true);
  assert.equal(tolOk.creditedOvertimeMinutes, 0);

  const punchesExceeded = [
    { type: "entrada", time: "05:53:00" }, // 7 min antes (> 5 min)
    { type: "saida", time: "14:20:00" }
  ];
  const tolExc = calculatePunchTolerance(planned, punchesExceeded);
  assert.equal(tolExc.withinTolerance, false);
  assert.equal(tolExc.creditedOvertimeMinutes, 7, "Súmula 366 TST: computa-se na íntegra");

  // 3. Adicional Noturno e Súmula 60 TST
  const nightPunches = [
    { punchType: "entrada", time: "22:00:00", timestamp: "2026-10-22T22:00:00.000Z" },
    { punchType: "saida", time: "07:00:00", timestamp: "2026-10-23T07:00:00.000Z" }
  ];
  const nightRes = calculateNightShiftAndExtension(nightPunches);
  assert.equal(nightRes.clockNightMinutes, 420);
  assert.equal(nightRes.extensionMinutes, 120);
  assert.equal(nightRes.sumula60Applied, true);
  assert.ok(nightRes.totalFictitiousMinutes > 540, "Hora ficta de 52m30s amplia minutos pagos");
});

test("M5-07: Folha de Pagamento Mensal — INSS Progressivo 2026, Reflexos DSR Súmulas 172/60 TST, Holerite e Baixa PIX", async () => {
  const { mockDb, app } = createTestHarness();

  // 1. Tabela progressiva INSS 2026
  const inssR1 = calculateInssProgressive(1500.00);
  assert.equal(inssR1.inssValue, 112.50); // 7.5%
  const inssR2 = calculateInssProgressive(2400.00);
  assert.equal(inssR2.inssValue, 193.23); // 9% - 22.77
  const inssCeiling = calculateInssProgressive(12000.00);
  assert.equal(inssCeiling.inssValue, 951.64); // Teto

  // 2. Cálculo da folha
  const payroll = calculateMonthlyPayroll(mockDb, "emp_cozinha_01", "2026-05", {
    baseSalary: 2400.00,
    he50Minutes: 600, // 10h
    workingDays: 25,
    dsrAndHolidays: 6
  });

  assert.equal(payroll.proventos[0].amount, 2400.00);
  const rubricaHE = payroll.proventos.find(p => p.code === "101");
  assert.ok(rubricaHE);
  assert.equal(rubricaHE.amount, 163.64);

  const rubricaDsr = payroll.proventos.find(p => p.code === "110");
  assert.ok(rubricaDsr);
  assert.equal(rubricaDsr.amount, 39.27); // (163.64 / 25) * 6 = 39.27

  // 3. Emissão de holerite
  const payslip = generatePayslip(mockDb, payroll);
  assert.equal(payslip.employer.cnpj, "12.345.678/0001-90");
  assert.equal(payslip.legalBases.fgtsMes, 208.23); // 8% sobre base
  assert.ok(payslip.totals.salarioLiquidoExtenso.includes("reais"));

  // 4. Baixa PIX via HTTP
  mockDb.hrPayroll.push(payroll);
  await withHttpServer(app, async (baseUrl) => {
    const resPix = await requestJson(`${baseUrl}/payroll/${payroll.id}/pay-pix`, {
      method: "POST",
      body: {
        pixKey: "22998877665",
        transactionId: "E2EPIX20260531",
        receiptProof: "comprovante_pix_folha.pdf"
      }
    });
    assert.equal(resPix.status, 200);
    assert.equal(resPix.body.payroll.status, "pago");
    assert.equal(resPix.body.payroll.payment.transactionId, "E2EPIX20260531");
  });
});

test("M5-08: Contratos de Trabalho com Assinatura Canvas e Selo Criptográfico SHA-256", async () => {
  const { mockDb, app } = createTestHarness();
  const emp = mockDb.hrEmployees.find(e => e.id === "emp_cozinha_01");

  await withHttpServer(app, async (baseUrl) => {
    // 1. Templates
    const resTpl = await requestJson(`${baseUrl}/contracts/templates`);
    assert.equal(resTpl.status, 200);
    assert.equal(resTpl.body.templates.length, 4);

    // 2. Geração da minuta
    const resGen = await requestJson(`${baseUrl}/contracts/generate`, {
      method: "POST",
      body: { templateId: "contrato_trabalho_clt", employeeId: emp.id }
    });
    assert.equal(resGen.status, 201);
    const contractId = resGen.body.contract.id;
    assert.ok(resGen.body.contract.documentSha256.length === 64);

    // 3. Assinatura eletrônica
    const resSign = await requestJson(`${baseUrl}/contracts/${contractId}/sign`, {
      method: "POST",
      body: {
        signatureDataUrl: SAMPLE_CANVAS_SIGNATURE,
        ipAddress: "192.168.1.50",
        userAgent: "Tablet-Soho-Chrome"
      }
    });
    assert.equal(resSign.status, 200);
    assert.equal(resSign.body.contract.status, "signed");
    assert.ok(resSign.body.contract.finalSealSha256.length === 64);
    assert.equal(resSign.body.contract.signature.ipAddress, "192.168.1.50");
  });
});

test("M5-09: Gestão de Saúde Ocupacional / ASO per NR-7 e Alertas Preventivos", async () => {
  const { mockDb, app } = createTestHarness();

  await withHttpServer(app, async (baseUrl) => {
    // 1. Registro de 5 exames
    const examTypes = ["admissional", "periodico", "retorno_trabalho", "mudanca_risco", "demissional"];
    for (const type of examTypes) {
      const res = await requestJson(`${baseUrl}/aso`, {
        method: "POST",
        body: {
          employeeId: "emp_cozinha_01",
          examType: type,
          examDate: "2026-05-10",
          aptitudeStatus: "apto"
        }
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.aso.expirationDate, "2027-05-10");
    }

    // 2. Alertas preventivos
    const resAlerts = await requestJson(`${baseUrl}/aso/alerts?referenceDate=2027-05-01`);
    assert.equal(resAlerts.status, 200);
    assert.ok(resAlerts.body.expiring_30_days.length >= 1);
  });
});

test("M5-10: Catálogo Central de Permissões e Resolução de Rotas no Frontend (lib/permissions.ts)", async () => {
  const permissionsPath = path.resolve("artifacts/limpeza/src/lib/permissions.ts");
  assert.ok(fs.existsSync(permissionsPath), "permissions.ts deve existir");

  const ts = (await import("typescript")).default;
  const tsCode = fs.readFileSync(permissionsPath, "utf8");
  const transpiled = ts.transpileModule(tsCode, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText;

  const tempFile = path.join(os.tmpdir(), `temp-permissions-${Date.now()}.mjs`);
  fs.writeFileSync(tempFile, transpiled, "utf8");

  try {
    const permissionsModule = await import(`file://${tempFile.replace(/\\/g, "/")}`);
    const { PERMISSION_CATEGORIES, ROUTE_ALIASES, hasModuleAccess, canonicalizeRoute } = permissionsModule;

    // 1. Presença de /rh nas categorias
    const propCategory = PERMISSION_CATEGORIES.find(c => c.id === "propriedade" || c.id === "rh");
    assert.ok(propCategory, "Categoria com RH deve existir");
    const rhItem = propCategory.items.find(i => i.href === "/rh");
    assert.ok(rhItem, "Item /rh deve constar em PERMISSION_CATEGORIES");

    // 2. Mapeamento de Aliases
    assert.equal(canonicalizeRoute("/colaboradores"), "/rh");
    assert.equal(canonicalizeRoute("/funcionarios"), "/rh");
    assert.equal(canonicalizeRoute("/recursos-humanos"), "/rh");
    assert.equal(canonicalizeRoute("/bater-ponto"), "/ponto");
    assert.equal(canonicalizeRoute("/terminal-ponto"), "/ponto");

    // 3. Checagem de RBAC hasModuleAccess
    assert.equal(hasModuleAccess({ role: "admin" }, "/rh"), true, "Admin tem acesso a /rh");
    assert.equal(hasModuleAccess({ role: "dev" }, "/rh"), true, "Dev tem acesso a /rh");
    assert.equal(hasModuleAccess({ role: "camareira", id: 2, username: "Cris" }, "/rh"), false, "Cris não tem acesso a /rh");
    assert.equal(hasModuleAccess({ role: "camareira", id: 3, username: "Grazi" }, "/rh"), false, "Grazi não tem acesso a /rh");
    assert.equal(hasModuleAccess({ role: "recepcao" }, "/rh"), false, "Recepção padrão não tem acesso a /rh");
  } finally {
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Cleanup silencioso
    }
  }
});

test("M5-11: Registro de Rotas em App.tsx e Item de Menu Shell em layout.tsx", () => {
  const appPath = path.resolve("artifacts/limpeza/src/App.tsx");
  const layoutPath = path.resolve("artifacts/limpeza/src/components/layout.tsx");

  assert.ok(fs.existsSync(appPath), "App.tsx deve existir");
  assert.ok(fs.existsSync(layoutPath), "layout.tsx deve existir");

  const appContent = fs.readFileSync(appPath, "utf8");
  const layoutContent = fs.readFileSync(layoutPath, "utf8");

  // App.tsx deve registrar as rotas /rh e /ponto
  assert.ok(appContent.includes("/rh"), "App.tsx deve conter rota /rh");
  assert.ok(appContent.includes("/ponto"), "App.tsx deve conter rota /ponto");
  assert.ok(appContent.includes("hr-dashboard"), "App.tsx deve importar hr-dashboard");
  assert.ok(appContent.includes("ponto-mobile"), "App.tsx deve importar ponto-mobile");

  // layout.tsx deve conter link para /rh
  assert.ok(layoutContent.includes("/rh"), "layout.tsx deve conter link para /rh");
  assert.ok(
    layoutContent.includes("Gestão de RH") || layoutContent.includes("RH & Ponto"),
    "layout.tsx deve conter rótulo amigável para Gestão de RH"
  );
});

test("M5-12: Auditoria Dinâmica de Paridade Twin-Server SHA-256 (36/36 arquivos)", () => {
  const { allPass, results, total, passCount, importIssues } = checkTwinParity();

  assert.equal(allPass, true, "Todos os arquivos de runtime de artifacts/ e scripts/ devem ter paridade 100%");
  assert.ok(total >= 36, `Devem existir ao menos 36 arquivos auditados. Total: ${total}`);
  assert.equal(passCount, total, "Todos os arquivos devem passar com SHA-256 idêntico");
  assert.equal(importIssues.length, 0, "Zero problemas de importação estática");

  // Garantir paridade dos 9 arquivos de RH
  const hrFiles = [
    "hr/compliance.mjs",
    "hr/contracts-aso.mjs",
    "hr/employees.mjs",
    "hr/index.mjs",
    "hr/payroll.mjs",
    "hr/router.mjs",
    "hr/schedules.mjs",
    "hr/timekeeping.mjs",
    "hr/whatsapp-automation.mjs"
  ];

  for (const f of hrFiles) {
    const res = results.find(r => r.file === f);
    assert.ok(res, `Arquivo ${f} deve constar na auditoria`);
    assert.equal(res.pass, true, `Arquivo ${f} deve ter paridade 100%`);
  }
});

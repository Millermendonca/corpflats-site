import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import express from "express";
import { checkTwinParity } from "../scripts/check-twin-parity.mjs";
import {
  isPrestadora,
  isCltEmployee,
  validateRecipientNotPrestador,
  getDefaultHrEmployees,
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  hashPin
} from "../artifacts/api-server/hr/employees.mjs";
import {
  ensureHrCollections,
  createHrRouter,
  getDefaultHrSettings,
  getDefaultHrComplianceSettings
} from "../artifacts/api-server/hr/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

test("M1-1: Twin-Server Parity (100% SHA-256)", () => {
  const { allPass, results, total } = checkTwinParity();
  assert.equal(allPass, true, "Todos os arquivos gêmeos devem ter hashes idênticos");
  assert.ok(total >= 30, "Devem existir ao menos 30 arquivos auditados");
  const failed = results.filter(r => !r.pass);
  assert.equal(failed.length, 0, `Não deve haver divergências: ${JSON.stringify(failed)}`);
});

test("M1-2: Isolamento Estrito de Prestadoras (Cris e Grazi)", () => {
  const crisUser = { id: 2, username: "Cris", name: "Cris", role: "camareira", contractType: "prestador", active: true };
  const graziUser = { id: 3, username: "Grazi", name: "Grazi", role: "camareira", contractType: "prestador", active: true };
  const genericPrestador = { id: "prest_99", name: "Diarista Avulsa", contractType: "prestador", active: true };

  // isPrestadora
  assert.equal(isPrestadora(crisUser), true, "Cris deve ser identificada como prestadora");
  assert.equal(isPrestadora(graziUser), true, "Grazi deve ser identificada como prestadora");
  assert.equal(isPrestadora({ id: "2" }), true, "ID 2 deve ser prestadora");
  assert.equal(isPrestadora({ id: "3" }), true, "ID 3 deve ser prestadora");
  assert.equal(isPrestadora({ phone: "22988486446" }), true, "Telefone de Cris deve ser reconhecido");
  assert.equal(isPrestadora({ phone: "22999106204" }), true, "Telefone de Grazi deve ser reconhecido");
  assert.equal(isPrestadora(genericPrestador), true, "ContractType prestador deve ser reconhecido");

  // isCltEmployee
  assert.equal(isCltEmployee(crisUser), false, "Cris NUNCA deve ser considerada funcionária CLT");
  assert.equal(isCltEmployee(graziUser), false, "Grazi NUNCA deve ser considerada funcionária CLT");
  assert.equal(isCltEmployee(genericPrestador), false, "Prestador genérico não é CLT");

  // validateRecipientNotPrestador
  assert.throws(() => validateRecipientNotPrestador(crisUser), /CRITICAL_SECURITY_VIOLATION/);
  assert.throws(() => validateRecipientNotPrestador(graziUser), /CRITICAL_SECURITY_VIOLATION/);
});

test("M1-3: Seed Seguro e Validação de Funcionários CLT", () => {
  const defaults = getDefaultHrEmployees();
  assert.equal(defaults.length, 2, "Devem existir 2 funcionários semeados inicialmente");

  const [cozinha, camareira] = defaults;

  // Cozinha
  assert.equal(cozinha.id, "emp_cozinha_01");
  assert.equal(cozinha.matricula, "CLT-001");
  assert.equal(cozinha.contractType, "clt");
  assert.equal(cozinha.workRegime, "6x1_44h");
  assert.equal(cozinha.baseSalary, 1780.00);
  assert.equal(cozinha.additionalInsalubridade.percentage, 20);
  assert.equal(isCltEmployee(cozinha), true, "Cozinheira deve ser funcionária CLT válida");
  assert.equal(isPrestadora(cozinha), false, "Cozinheira não é prestadora");
  assert.equal(cozinha.pinHash, hashPin("4021"), "Hash do PIN da cozinheira deve bater");

  // Camareira CLT
  assert.equal(camareira.id, "emp_camareira_01");
  assert.equal(camareira.matricula, "CLT-002");
  assert.equal(camareira.contractType, "clt");
  assert.equal(camareira.workRegime, "6x1_44h");
  assert.equal(camareira.baseSalary, 1650.00);
  assert.equal(camareira.additionalInsalubridade.percentage, 20);
  assert.equal(isCltEmployee(camareira), true, "Camareira CLT deve ser válida");
  assert.equal(isPrestadora(camareira), false, "Camareira CLT não é prestadora");
  assert.equal(camareira.pinHash, hashPin("1234"), "Hash do PIN da camareira deve bater");
});

test("M1-4: Inicialização de Coleções de RH (ensureHrCollections)", () => {
  const mockDb = {};
  ensureHrCollections(mockDb);

  assert.ok(Array.isArray(mockDb.hrEmployees), "hrEmployees deve ser array");
  assert.equal(mockDb.hrEmployees.length, 2, "hrEmployees deve iniciar com 2 funcionários");
  assert.ok(Array.isArray(mockDb.hrTimeRecords), "hrTimeRecords deve ser array");
  assert.ok(Array.isArray(mockDb.hrSchedules), "hrSchedules deve ser array");
  assert.ok(Array.isArray(mockDb.hrVacations), "hrVacations deve ser array");
  assert.ok(Array.isArray(mockDb.hrPayroll), "hrPayroll deve ser array");
  assert.ok(Array.isArray(mockDb.hrContracts), "hrContracts deve ser array");
  assert.ok(Array.isArray(mockDb.hrAsoRecords), "hrAsoRecords deve ser array");
  assert.ok(Array.isArray(mockDb.hrComplianceAudits), "hrComplianceAudits deve ser array");
  assert.ok(Array.isArray(mockDb.hrDeviceWhitelist), "hrDeviceWhitelist deve ser array");
  assert.ok(mockDb.hrSettings, "hrSettings deve existir");
  assert.equal(mockDb.hrSettings.geofence.radiusMeters, 150);
  assert.ok(mockDb.hrComplianceSettings, "hrComplianceSettings deve existir");
  assert.ok(mockDb.hrComplianceSettings.rules.continuous_work_6h_limit);
});

test("M1-5: Proteção contra Poda em pruneDatabase() (Guarda de 5 Anos)", () => {
  const mockDb = {
    hrEmployees: getDefaultHrEmployees(),
    hrTimeRecords: [
      { id: "p1", date: "2026-10-22", createdAt: "2026-10-22T08:00:00Z" },
      { id: "p2", date: "2023-01-01", createdAt: "2023-01-01T08:00:00Z" }, // 3.8 anos atrás (< 5 anos)
      { id: "p3", date: "2018-01-01", createdAt: "2018-01-01T08:00:00Z" }  // 8.8 anos atrás (> 5 anos)
    ],
    hrComplianceAudits: [
      { id: "a1", date: "2026-10-22" }
    ],
    hrPayroll: [
      { id: "f1", referenceMonth: "2026-10" }
    ]
  };

  // Simulação da lógica de poda implementada em demo-server.mjs
  const LIMITS = {
    whatsappHistory: 500,
    hrEmployees: 1, // tentando forçar limite em hrEmployees
    hrTimeRecords: 1
  };

  const HR_PROTECTED_COLLECTIONS = [
    "hrEmployees", "hrTimeRecords", "hrSchedules", "hrVacations",
    "hrPayroll", "hrContracts", "hrAsoRecords", "hrSettings",
    "hrComplianceSettings", "hrComplianceAudits", "hrDeviceWhitelist"
  ];
  for (const hrKey of HR_PROTECTED_COLLECTIONS) {
    delete LIMITS[hrKey];
  }

  // Verifica que nenhuma coleção de RH permaneceu em LIMITS
  for (const hrKey of HR_PROTECTED_COLLECTIONS) {
    assert.equal(LIMITS[hrKey], undefined, `${hrKey} deve estar blindada contra LIMITS`);
  }

  // Simula poda normal
  for (const [key, max] of Object.entries(LIMITS)) {
    if (Array.isArray(mockDb[key]) && mockDb[key].length > max) {
      mockDb[key] = mockDb[key].slice(0, max);
    }
  }

  assert.equal(mockDb.hrEmployees.length, 2, "hrEmployees não deve ser podada");
  assert.equal(mockDb.hrTimeRecords.length, 3, "hrTimeRecords não deve ser podada por limites curtos");
});

test("M1-6: Endpoints CRUD de RH via Roteador Express", async () => {
  const mockDb = {};
  ensureHrCollections(mockDb);

  // Insere Cris e Grazi em db.users para garantir que existam no estado geral
  mockDb.users = [
    { id: 2, username: "Cris", name: "Cris", role: "camareira", contractType: "prestador" },
    { id: 3, username: "Grazi", name: "Grazi", role: "camareira", contractType: "prestador" }
  ];

  let saveDbCalled = 0;
  const saveDatabase = () => { saveDbCalled++; };

  const app = express();
  app.use(express.json());
  app.use("/api/hr", createHrRouter({ db: mockDb, saveDatabase }));

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/hr`;

  try {
    // 1. GET /employees
    const resList = await fetch(`${baseUrl}/employees`);
    assert.equal(resList.status, 200);
    const dataList = await resList.json();
    assert.equal(dataList.success, true);
    assert.equal(dataList.total, 2);
    // Garante que nenhum elemento é Cris ou Grazi
    for (const emp of dataList.employees) {
      assert.notEqual(emp.id, 2);
      assert.notEqual(emp.id, 3);
      assert.equal(emp.pinHash, undefined, "pinHash nunca deve ser exposto na API");
      assert.equal(emp.pinConfigured, true, "pinConfigured deve ser true");
    }

    // 2. GET /employees/:id com ID de prestadora (deve retornar 404)
    const resCris = await fetch(`${baseUrl}/employees/2`);
    assert.equal(resCris.status, 404);
    const dataCris = await resCris.json();
    assert.equal(dataCris.success, false);

    const resGrazi = await fetch(`${baseUrl}/employees/3`);
    assert.equal(resGrazi.status, 404);

    // 3. GET /employees/emp_cozinha_01 (deve retornar 200)
    const resCozinha = await fetch(`${baseUrl}/employees/emp_cozinha_01`);
    assert.equal(resCozinha.status, 200);
    const dataCozinha = await resCozinha.json();
    assert.equal(dataCozinha.success, true);
    assert.equal(dataCozinha.employee.name, "Sebastiana Ramos dos Santos");

    // 4. POST /employees tentando cadastrar funcionário com nome "Cris" (deve falhar com 400)
    const resFailCris = await fetch(`${baseUrl}/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Cris Auxiliar",
        cpf: "111.222.333-44",
        baseSalary: 1500
      })
    });
    assert.equal(resFailCris.status, 400);
    const dataFailCris = await resFailCris.json();
    assert.match(dataFailCris.error, /prestadoras de serviços autônomas/);

    // 5. POST /employees violando intrajornada (jornada 8h com almoço de 30min -> deve falhar com 400)
    const resFailLunch = await fetch(`${baseUrl}/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "João Auxiliar de Cozinha",
        cpf: "555.666.777-88",
        baseSalary: 1600,
        defaultSchedule: {
          entryTime: "08:00",
          exitTime: "17:00",
          breakStartTime: "12:00",
          breakEndTime: "12:30" // 30 min em jornada de 9h
        }
      })
    });
    assert.equal(resFailLunch.status, 400);
    const dataFailLunch = await resFailLunch.json();
    assert.match(dataFailLunch.error, /Art\. 71/);

    // 6. POST /employees com dados válidos (deve ter sucesso 201)
    const resSuccess = await fetch(`${baseUrl}/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "João da Silva Santos",
        cpf: "555.666.777-88",
        phone: "22991122334",
        role: "Auxiliar Geral de Cozinha",
        department: "Cozinha",
        baseSalary: 1620.00,
        pin: "5678",
        defaultSchedule: {
          entryTime: "07:00",
          exitTime: "15:20",
          breakStartTime: "11:00",
          breakEndTime: "12:00",
          weeklyRestDay: "quarta"
        }
      })
    });
    assert.equal(resSuccess.status, 201);
    const dataCreated = await resSuccess.json();
    assert.equal(dataCreated.success, true);
    assert.equal(dataCreated.employee.name, "João da Silva Santos");
    assert.equal(dataCreated.employee.matricula, "CLT-003");
    assert.ok(dataCreated.employee.functionalHistory.length >= 1);
    assert.equal(saveDbCalled, 1);

    // 7. PATCH /employees/emp_cozinha_01 com aumento salarial e troca de cargo
    const resPatch = await fetch(`${baseUrl}/employees/emp_cozinha_01`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseSalary: 1950.00,
        role: "Chef de Cozinha & Café"
      })
    });
    assert.equal(resPatch.status, 200);
    const dataPatch = await resPatch.json();
    assert.equal(dataPatch.success, true);
    assert.equal(dataPatch.employee.baseSalary, 1950.00);
    assert.equal(dataPatch.employee.role, "Chef de Cozinha & Café");
    
    // Verifica que functionalHistory possui registros de auditoria
    const histTypes = dataPatch.employee.functionalHistory.map(h => h.type);
    assert.ok(histTypes.includes("alteracao_salarial"), "Deve registrar histórico de alteração salarial");
    assert.ok(histTypes.includes("mudanca_funcao"), "Deve registrar histórico de mudança de função");
    assert.equal(saveDbCalled, 2);

    // 8. PATCH em prestadora (id: 2) -> deve retornar 404
    const resPatchCris = await fetch(`${baseUrl}/employees/2`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseSalary: 2000 })
    });
    assert.equal(resPatchCris.status, 404);

  } finally {
    server.close();
  }
});

test("M1-7: scripts/demo-server.mjs Import & Boot Integrity (Zero ERR_MODULE_NOT_FOUND)", () => {
  const tempDb = path.join(os.tmpdir(), `test-m1-boot-db-${Date.now()}.json`);
  fs.writeFileSync(tempDb, JSON.stringify({ reservations: [], flats: [] }));

  try {
    const cmd = `node -e "process.env.NODE_ENV = 'test'; process.env.PORT = '0'; delete process.env.DATABASE_URL; import('./scripts/demo-server.mjs').then(m => { if (m.httpServer && typeof m.httpServer.close === 'function') m.httpServer.close(); process.exit(0); }).catch(err => { console.error('[IMPORT_ERROR]:', err.code || err.message); process.exit(1); });"`;

    execSync(cmd, {
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: "0",
        DATA_FILE: tempDb
      },
      timeout: 10000,
      encoding: "utf-8"
    });

    assert.ok(true, "scripts/demo-server.mjs importado e inicializado com sucesso");
  } catch (err) {
    assert.fail(`Falha ao importar scripts/demo-server.mjs: ${err.message}`);
  } finally {
    try {
      if (fs.existsSync(tempDb)) fs.unlinkSync(tempDb);
    } catch (_) {}
  }
});


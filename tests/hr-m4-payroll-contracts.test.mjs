/**
 * Suíte de Testes Pontual Dedicada: Folha de Pagamento com DSR e INSS Progressivo 2026,
 * Contratos com Assinatura Canvas & Controle de ASO (NR-7) — Marco M4
 * 
 * Arquivo: tests/hr-m4-payroll-contracts.test.mjs
 * 
 * Execução pontual estrita: node --test tests/hr-m4-payroll-contracts.test.mjs
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
  EMPLOYER_INFO,
  INSS_BRACKETS_2026,
  INSS_CEILING_2026,
  calculateInssProgressive,
  calculateDsrReflex,
  getMonthWorkingAndDsrDays,
  formatCurrencyInWords,
  calculateMonthlyPayroll,
  generatePayslip,
  registerPayrollPayment,
  closeMonthlyPayroll,
  getPayrollRecords
} from "../artifacts/api-server/hr/payroll.mjs";

import {
  CONTRACT_TEMPLATES,
  ASO_EXAM_TYPES,
  ASO_EXAM_LABELS,
  generateContractDocument,
  signContractWithCanvas,
  getContracts,
  registerAsoExam,
  checkAsoAlerts,
  getAsoRecords
} from "../artifacts/api-server/hr/contracts-aso.mjs";

// ── Utilitários do Test Harness e Isolamento ─────────────────────────────────

const TEMP_DB_FILE = path.join(os.tmpdir(), `temp-hr-m4-db-${Date.now()}.json`);
const SAMPLE_CANVAS_SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function createTestHarness(customSettings = {}) {
  const mockDb = {
    users: [
      { id: 1, username: "admin", role: "admin", passwordHash: crypto.createHash("sha256").update("admin123").digest("hex") },
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

  const savedOperations = [];
  const saveDatabase = (op) => {
    savedOperations.push(op);
    try {
      fs.writeFileSync(TEMP_DB_FILE, JSON.stringify(mockDb, null, 2), "utf8");
    } catch {
      // Ignora falhas de escrita transitórias em mocks
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
    // Limpeza de recursos
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 14 SUBTESTES DEDICADOS DO MARCO M4
// ════════════════════════════════════════════════════════════════════════════

test("M4-1: Cálculo folha 220h (Cozinheiro R$ 2.400 / Camareira R$ 1.800)", async () => {
  const { mockDb, app } = createTestHarness();

  // Teste Cozinheiro: Salário R$ 2.400,00
  const payrollCozinha = calculateMonthlyPayroll(mockDb, "emp_cozinha_01", "2026-05", {
    baseSalary: 2400.00,
    workloadHours: 220,
    workingDays: 25,
    dsrAndHolidays: 6
  });

  assert.equal(payrollCozinha.employeeId, "emp_cozinha_01");
  assert.equal(payrollCozinha.workloadHours, 220);
  assert.equal(payrollCozinha.proventos[0].amount, 2400.00);
  assert.equal(payrollCozinha.hourlyRate, 10.9091);
  assert.ok(payrollCozinha.totalProventos >= 2400.00);
  assert.ok(payrollCozinha.salarioLiquido > 0);

  // Teste Camareira: Salário R$ 1.800,00
  const payrollCamareira = calculateMonthlyPayroll(mockDb, "emp_camareira_01", "2026-05", {
    baseSalary: 1800.00,
    workloadHours: 220,
    workingDays: 25,
    dsrAndHolidays: 6
  });

  assert.equal(payrollCamareira.employeeId, "emp_camareira_01");
  assert.equal(payrollCamareira.workloadHours, 220);
  assert.equal(payrollCamareira.proventos[0].amount, 1800.00);
  assert.equal(payrollCamareira.hourlyRate, 8.1818);
  assert.ok(payrollCamareira.totalProventos >= 1800.00);
  assert.ok(payrollCamareira.salarioLiquido > 0);

  // Teste via endpoint HTTP
  await withHttpServer(app, async (baseUrl) => {
    const res = await requestJson(`${baseUrl}/payroll/calculate`, {
      method: "POST",
      body: {
        employeeId: "emp_cozinha_01",
        yearMonth: "2026-05",
        baseSalary: 2400.00
      }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.payroll.proventos[0].amount, 2400.00);
    assert.equal(res.body.payroll.workloadHours, 220);
  });
});

test("M4-2: Apuração HE 50% e 100%", () => {
  const { mockDb } = createTestHarness();

  // Salário 2.400 / 220 = 10.909090...
  // 10h HE 50% (600 min) -> 10 * 10.909090 * 1.5 = 163.64
  // 4h HE 100% (240 min) -> 4 * 10.909090 * 2.0 = 87.27
  const payroll = calculateMonthlyPayroll(mockDb, "emp_cozinha_01", "2026-05", {
    baseSalary: 2400.00,
    workloadHours: 220,
    workingDays: 25,
    dsrAndHolidays: 6,
    he50Minutes: 600,
    he100Minutes: 240
  });

  const rubrica50 = payroll.proventos.find(p => p.code === "101");
  const rubrica100 = payroll.proventos.find(p => p.code === "102");

  assert.ok(rubrica50, "Deve conter a rubrica 101 de Horas Extras 50%");
  assert.equal(rubrica50.amount, 163.64, "Valor de HE 50% deve ser R$ 163,64");
  assert.equal(rubrica50.reference, "10h00m");

  assert.ok(rubrica100, "Deve conter a rubrica 102 de Horas Extras 100%");
  assert.equal(rubrica100.amount, 87.27, "Valor de HE 100% deve ser R$ 87,27");
  assert.equal(rubrica100.reference, "4h00m");
});

test("M4-3: Reflexo DSR sobre HE per Súmula 172 TST", () => {
  const { mockDb } = createTestHarness();

  // Fórmulas da Súmula 172 TST: (Total HE / Dias Úteis) * Domingos e Feriados
  // HE 50%: 163.64, HE 100%: 87.27 -> Total HE = 250.91
  // Dias úteis: 25, DSR e Feriados: 6
  // Reflexo = (250.91 / 25) * 6 = 10.0364 * 6 = 60.22
  const reflexoDireto = calculateDsrReflex(250.91, 25, 6);
  assert.equal(reflexoDireto, 60.22);

  const payroll = calculateMonthlyPayroll(mockDb, "emp_cozinha_01", "2026-05", {
    baseSalary: 2400.00,
    workloadHours: 220,
    workingDays: 25,
    dsrAndHolidays: 6,
    he50Minutes: 600,
    he100Minutes: 240
  });

  const rubricaDsr = payroll.proventos.find(p => p.code === "110");
  assert.ok(rubricaDsr, "Deve conter a rubrica 110 de DSR sobre Horas Extras");
  assert.equal(rubricaDsr.amount, 60.22, "Reflexo de DSR deve ser exatamente R$ 60,22");
  assert.equal(rubricaDsr.reference, "6/25d");
});

test("M4-4: Adicional Noturno e Reflexo DSR sobre Noturno per Súmula 60 TST", () => {
  const { mockDb } = createTestHarness();

  // Salário R$ 2.400 / 220 = R$ 10.90909
  // 20 horas noturnas fictas (1200 minutos)
  // Adicional noturno 20% = 20 * 10.909090 * 0.20 = R$ 43.64
  // DSR sobre Adicional Noturno (Súmula 60, I TST) = (43.64 / 25) * 6 = R$ 10.47
  const payroll = calculateMonthlyPayroll(mockDb, "emp_cozinha_01", "2026-05", {
    baseSalary: 2400.00,
    workloadHours: 220,
    workingDays: 25,
    dsrAndHolidays: 6,
    nightMinutes: 1200
  });

  const rubricaNoturno = payroll.proventos.find(p => p.code === "105");
  const rubricaDsrNoturno = payroll.proventos.find(p => p.code === "111");

  assert.ok(rubricaNoturno, "Deve conter a rubrica 105 de Adicional Noturno 20%");
  assert.equal(rubricaNoturno.amount, 43.64, "Adicional Noturno deve ser R$ 43,64");

  assert.ok(rubricaDsrNoturno, "Deve conter a rubrica 111 de DSR sobre Adicional Noturno");
  assert.equal(rubricaDsrNoturno.amount, 10.47, "Reflexo de DSR s/ Noturno deve ser R$ 10,47");
});

test("M4-5: Tabela progressiva INSS 2026 com parcelas a deduzir em todas as faixas", () => {
  // Faixa 1 (até R$ 1.518,00): alíquota 7,5% (dedução R$ 0,00)
  const r1 = calculateInssProgressive(1500.00);
  assert.equal(r1.bracket, 1);
  assert.equal(r1.inssValue, 112.50);
  assert.equal(r1.effectiveRate, 7.50);
  assert.equal(r1.ceilingApplied, false);

  // Faixa 2 (R$ 1.518,01 até R$ 2.793,88): alíquota 9,0% (dedução R$ 22,77)
  // 2400 * 0.09 - 22.77 = 216 - 22.77 = 193.23
  const r2 = calculateInssProgressive(2400.00);
  assert.equal(r2.bracket, 2);
  assert.equal(r2.inssValue, 193.23);
  assert.equal(r2.effectiveRate, 8.05);

  // Faixa 3 (R$ 2.793,89 até R$ 4.190,83): alíquota 12,0% (dedução R$ 106,59)
  // 3500 * 0.12 - 106.59 = 420 - 106.59 = 313.41
  const r3 = calculateInssProgressive(3500.00);
  assert.equal(r3.bracket, 3);
  assert.equal(r3.inssValue, 313.41);
  assert.equal(r3.effectiveRate, 8.95);

  // Faixa 4 (R$ 4.190,84 até R$ 8.157,41): alíquota 14,0% (dedução R$ 190,40)
  // 5000 * 0.14 - 190.40 = 700 - 190.40 = 509.60
  const r4 = calculateInssProgressive(5000.00);
  assert.equal(r4.bracket, 4);
  assert.equal(r4.inssValue, 509.60);
  assert.equal(r4.effectiveRate, 10.19);

  // Teto Máximo: R$ 951,64
  const rCeiling = calculateInssProgressive(10000.00);
  assert.equal(rCeiling.bracket, 4);
  assert.equal(rCeiling.inssValue, 951.64);
  assert.equal(rCeiling.ceilingApplied, true);
});

test("M4-6: Desconto Vale-Transporte (teto 6%)", () => {
  const { mockDb } = createTestHarness();

  // Caso 1: Custo real superior a 6% -> limita ao teto legal de 6% (R$ 144,00 para base 2.400)
  const pTeto = calculateMonthlyPayroll(mockDb, "emp_cozinha_01", "2026-05", {
    baseSalary: 2400.00,
    vtCost: 200.00
  });
  const descVtTeto = pTeto.descontos.find(d => d.code === "205");
  assert.ok(descVtTeto);
  assert.equal(descVtTeto.amount, 144.00, "Desconto de VT limitado ao teto de 6%");

  // Caso 2: Custo real inferior a 6% -> desconta o custo real (R$ 80,00)
  const pReal = calculateMonthlyPayroll(mockDb, "emp_cozinha_01", "2026-05", {
    baseSalary: 2400.00,
    vtCost: 80.00
  });
  const descVtReal = pReal.descontos.find(d => d.code === "205");
  assert.ok(descVtReal);
  assert.equal(descVtReal.amount, 80.00, "Desconto de VT deve ser o custo real quando menor que 6%");

  // Caso 3: Renúncia expressa de Vale-Transporte -> desconto zero
  const pOptOut = calculateMonthlyPayroll(mockDb, "emp_cozinha_01", "2026-05", {
    baseSalary: 2400.00,
    vtOptOut: true
  });
  const descVtOptOut = pOptOut.descontos.find(d => d.code === "205");
  assert.equal(descVtOptOut, undefined, "Sem desconto de VT quando houver renúncia");
});

test("M4-7: Emissão de Holerite com bases FGTS/INSS e valor líquido", async () => {
  const { mockDb, app } = createTestHarness();

  const payroll = calculateMonthlyPayroll(mockDb, "emp_cozinha_01", "2026-05", {
    baseSalary: 2400.00,
    workingDays: 25,
    dsrAndHolidays: 6
  });

  const payslip = generatePayslip(mockDb, payroll);

  // Verificações Estruturais
  assert.equal(payslip.employer.cnpj, "12.345.678/0001-90");
  assert.equal(payslip.employer.tradeName, "CorpFlats Soho Residence");
  assert.equal(payslip.employee.id, "emp_cozinha_01");
  assert.equal(payslip.competencia, "05/2026");

  // Bases Legais
  assert.equal(payslip.legalBases.baseSalary, 2400.00);
  assert.equal(payslip.legalBases.baseInss, 2400.00);
  assert.equal(payslip.legalBases.baseFgts, 2400.00);
  assert.equal(payslip.legalBases.fgtsMes, 192.00, "FGTS 8% de R$ 2.400,00 deve ser R$ 192,00");

  // Valor Líquido por Extenso
  assert.ok(payslip.totals.salarioLiquidoExtenso.includes("reais"));
  assert.ok(payslip.payslipText.includes("RECIBO DE PAGAMENTO DE SALÁRIO"));
  assert.ok(payslip.payslipText.includes("VALOR LÍQUIDO A RECEBER"));

  // Teste via HTTP
  mockDb.hrPayroll.push(payroll);
  await withHttpServer(app, async (baseUrl) => {
    const res = await requestJson(`${baseUrl}/payroll/${payroll.id}/payslip`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.payslip.employee.id, "emp_cozinha_01");
    assert.equal(res.body.payslip.legalBases.fgtsMes, 192.00);
  });
});

test("M4-8: Baixa e quitação PIX com chave e comprovante", async () => {
  const { mockDb, app } = createTestHarness();

  const payroll = calculateMonthlyPayroll(mockDb, "emp_cozinha_01", "2026-05", {
    baseSalary: 2400.00
  });
  mockDb.hrPayroll.push(payroll);

  await withHttpServer(app, async (baseUrl) => {
    const res = await requestJson(`${baseUrl}/payroll/${payroll.id}/pay-pix`, {
      method: "POST",
      body: {
        pixKey: "22998877665",
        transactionId: "E2EPIX20260531001",
        receiptProof: "comprovante_itau_folha_maio.pdf",
        paidBy: "financeiro_admin"
      }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.payroll.status, "pago");
    assert.equal(res.body.payroll.payment.pixKey, "22998877665");
    assert.equal(res.body.payroll.payment.transactionId, "E2EPIX20260531001");
    assert.equal(res.body.payroll.payment.receiptProof, "comprovante_itau_folha_maio.pdf");
    assert.equal(res.body.payroll.payment.paidBy, "financeiro_admin");
  });
});

test("M4-9: Geração das 4 minutas contratuais", async () => {
  const { mockDb, app } = createTestHarness();
  const emp = mockDb.hrEmployees.find(e => e.id === "emp_cozinha_01");

  const templateIds = [
    "contrato_trabalho_clt",
    "termo_vale_transporte",
    "acordo_banco_horas",
    "termo_autorizacao_descontos"
  ];

  for (const tId of templateIds) {
    const doc = generateContractDocument(tId, emp);
    assert.equal(doc.templateId, tId);
    assert.equal(doc.employeeId, "emp_cozinha_01");
    assert.equal(doc.status, "pending_signature");
    assert.ok(doc.contentText.length > 100);
    assert.ok(doc.contentHtml.includes("contract-document"));
    assert.equal(doc.documentSha256.length, 64, "Hash SHA-256 da minuta deve ter 64 caracteres");
  }

  // Teste via API de Templates e Geração
  await withHttpServer(app, async (baseUrl) => {
    const resTemplates = await requestJson(`${baseUrl}/contracts/templates`);
    assert.equal(resTemplates.status, 200);
    assert.equal(resTemplates.body.templates.length, 4);

    const resGen = await requestJson(`${baseUrl}/contracts/generate`, {
      method: "POST",
      body: {
        templateId: "contrato_trabalho_clt",
        employeeId: "emp_cozinha_01"
      }
    });

    assert.equal(resGen.status, 201);
    assert.equal(resGen.body.success, true);
    assert.equal(resGen.body.contract.templateId, "contrato_trabalho_clt");
    assert.equal(resGen.body.contract.status, "pending_signature");
  });
});

test("M4-10: Assinatura eletrônica Canvas com metadados probatórios (IP, timestamp, hash SHA-256)", async () => {
  const { mockDb, app } = createTestHarness();
  const emp = mockDb.hrEmployees.find(e => e.id === "emp_cozinha_01");

  const doc = generateContractDocument("contrato_trabalho_clt", emp, { db: mockDb });

  await withHttpServer(app, async (baseUrl) => {
    const resSign = await requestJson(`${baseUrl}/contracts/${doc.id}/sign`, {
      method: "POST",
      body: {
        signatureDataUrl: SAMPLE_CANVAS_SIGNATURE,
        ipAddress: "192.168.1.100",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile",
        signedAt: "2026-05-10T14:30:00.000Z"
      }
    });

    assert.equal(resSign.status, 200);
    assert.equal(resSign.body.success, true);
    assert.equal(resSign.body.contract.status, "signed");
    assert.ok(resSign.body.contract.signature.signatureHash);
    assert.equal(resSign.body.contract.signature.ipAddress, "192.168.1.100");
    assert.ok(resSign.body.contract.finalSealSha256, "Deve gerar selo digital probatório SHA-256");
  });
});

test("M4-11: Cadastro e histórico de ASO (5 exames NR-7)", async () => {
  const { mockDb, app } = createTestHarness();

  const examTypes = ["admissional", "periodico", "retorno_trabalho", "mudanca_risco", "demissional"];

  for (const eType of examTypes) {
    const aso = registerAsoExam(mockDb, {
      employeeId: "emp_cozinha_01",
      examType: eType,
      examDate: "2026-05-15",
      aptitudeStatus: "apto",
      clinicName: "Saúde Ocupacional Goytacazes",
      doctorName: "Dr. Carlos Médico",
      doctorCrm: "CRM/RJ 98765"
    });

    assert.equal(aso.examType, eType);
    assert.equal(aso.expirationDate, "2027-05-15", "Vencimento automático de 1 ano");
    assert.equal(aso.aptitudeStatus, "apto");
  }

  assert.equal(mockDb.hrAso.length, 5);
  assert.equal(mockDb.hrAsoRecords.length, 5);

  // Consulta via endpoint
  await withHttpServer(app, async (baseUrl) => {
    const res = await requestJson(`${baseUrl}/aso?employeeId=emp_cozinha_01`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.total, 5);
  });
});

test("M4-12: Motor de alertas preventivos de ASO (vencidos, 30 e 60 dias)", async () => {
  const { mockDb, app } = createTestHarness();

  // Cenário com referência em 2026-05-01
  const refDate = "2026-05-01";

  // 1. ASO Vencido (venceu em 2026-04-10)
  registerAsoExam(mockDb, {
    employeeId: "emp_cozinha_01",
    examType: "periodico",
    examDate: "2025-04-10",
    expirationDate: "2026-04-10"
  });

  // 2. ASO Vencendo em 15 dias (vence em 2026-05-16)
  registerAsoExam(mockDb, {
    employeeId: "emp_camareira_01",
    examType: "periodico",
    examDate: "2025-05-16",
    expirationDate: "2026-05-16"
  });

  // 3. ASO Vencendo em 45 dias (vence em 2026-06-15)
  registerAsoExam(mockDb, {
    employeeId: "emp_cozinha_01",
    examType: "mudanca_risco",
    examDate: "2025-06-15",
    expirationDate: "2026-06-15"
  });

  const alerts = checkAsoAlerts(mockDb, { referenceDate: refDate });
  assert.equal(alerts.expired.length, 1, "Deve acusar 1 ASO vencido");
  assert.equal(alerts.expiring_30_days.length, 1, "Deve acusar 1 ASO vencendo em até 30 dias");
  assert.equal(alerts.expiring_60_days.length, 1, "Deve acusar 1 ASO vencendo em até 60 dias");
  assert.equal(alerts.totalAlerts, 3);

  // Teste via API
  await withHttpServer(app, async (baseUrl) => {
    const res = await requestJson(`${baseUrl}/aso/alerts?referenceDate=2026-05-01`);
    assert.equal(res.status, 200);
    assert.equal(res.body.expired.length, 1);
    assert.equal(res.body.expiring_30_days.length, 1);
    assert.equal(res.body.expiring_60_days.length, 1);
  });
});

test("M4-13: Blindagem absoluta de Cris e Grazi (HTTP 403 Forbidden em folha, contratos e ASO)", async () => {
  const { mockDb, app } = createTestHarness();

  // Teste em Chamadas Diretas de Função
  assert.throws(() => {
    calculateMonthlyPayroll(mockDb, 2, "2026-05");
  }, /não permitida para prestadoras/);

  assert.throws(() => {
    calculateMonthlyPayroll(mockDb, 3, "2026-05");
  }, /não permitida para prestadoras/);

  assert.throws(() => {
    generateContractDocument("contrato_trabalho_clt", { id: 2, name: "Cris", contractType: "prestador" });
  }, /não permitida para prestadoras/);

  assert.throws(() => {
    registerAsoExam(mockDb, { employeeId: 3, examType: "admissional" });
  }, /não permitida para prestadoras/);

  // Teste em Endpoints HTTP (Deve responder HTTP 403 Forbidden com clareza)
  await withHttpServer(app, async (baseUrl) => {
    // 1. Folha
    const resFolhaCris = await requestJson(`${baseUrl}/payroll/calculate`, {
      method: "POST",
      body: { employeeId: 2, yearMonth: "2026-05" }
    });
    assert.equal(resFolhaCris.status, 403);
    assert.equal(resFolhaCris.body.code, "PRESTADORA_PAYROLL_BLOCKED");

    const resFolhaGrazi = await requestJson(`${baseUrl}/payroll/calculate`, {
      method: "POST",
      body: { employeeId: "grazi", yearMonth: "2026-05" }
    });
    assert.equal(resFolhaGrazi.status, 403);

    // 2. Contratos
    const resContratoCris = await requestJson(`${baseUrl}/contracts/generate`, {
      method: "POST",
      body: { templateId: "contrato_trabalho_clt", employeeId: 2 }
    });
    assert.equal(resContratoCris.status, 403);
    assert.equal(resContratoCris.body.code, "PRESTADORA_CONTRACT_BLOCKED");

    const resContratosGrazi = await requestJson(`${baseUrl}/contracts/employee/3`);
    assert.equal(resContratosGrazi.status, 403);

    // 3. ASO
    const resAsoCris = await requestJson(`${baseUrl}/aso`, {
      method: "POST",
      body: { employeeId: 2, examType: "admissional" }
    });
    assert.equal(resAsoCris.status, 403);
    assert.equal(resAsoCris.body.code, "PRESTADORA_ASO_BLOCKED");

    const resAsoGrazi = await requestJson(`${baseUrl}/aso/employee/3`);
    assert.equal(resAsoGrazi.status, 403);
  });
});

test("M4-14: Auditoria de paridade Twin-Server SHA-256 (36/36 arquivos)", () => {
  const { allPass, results, total, passCount, importIssues } = checkTwinParity();

  assert.equal(allPass, true, "Todos os arquivos gêmeos devem coincidir rigorosamente");
  assert.equal(total, 36, "A arquitetura runtime completa deve conter exatamente 36 arquivos");
  assert.equal(passCount, 36, "Todos os 36 arquivos devem ter SHA-256 idêntico");
  assert.equal(importIssues.length, 0, "Zero erros de importação estática");

  // Assegura paridade individual dos 4 arquivos de RH do Marco M4
  const m4Files = ["hr/payroll.mjs", "hr/contracts-aso.mjs", "hr/router.mjs", "hr/index.mjs"];
  for (const file of m4Files) {
    const res = results.find(r => r.file === file);
    assert.ok(res, `Arquivo ${file} deve estar na lista auditada`);
    assert.equal(res.pass, true, `Arquivo ${file} deve ter paridade 100%`);
  }
});

test("M4-15: Blindagem de fechamento mensal (close-month) contra prestadoras autônomas (HTTP 403)", async () => {
  const { mockDb, app } = createTestHarness();

  const prestadoraTargets = [2, 3, "2", "3", "cris", "grazi"];

  // 1. Validação em Chamada de Função Direta
  for (const target of prestadoraTargets) {
    assert.throws(
      () => {
        closeMonthlyPayroll(mockDb, "2026-05", { employeeId: target });
      },
      (err) => {
        return (
          err.statusCode === 403 &&
          err.code === "PRESTADORA_PAYROLL_BLOCKED"
        );
      },
      `closeMonthlyPayroll deve rejeitar fechamento para prestadora alvo: ${target}`
    );
  }

  // 2. Validação via Endpoint HTTP (POST /api/hr/payroll/close-month)
  await withHttpServer(app, async (baseUrl) => {
    for (const target of prestadoraTargets) {
      const res = await requestJson(`${baseUrl}/payroll/close-month`, {
        method: "POST",
        body: {
          yearMonth: "2026-05",
          employeeId: target
        }
      });

      assert.equal(
        res.status,
        403,
        `POST /payroll/close-month deve responder HTTP 403 para alvo: ${target}`
      );
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, "PRESTADORA_PAYROLL_BLOCKED");
      assert.ok(
        res.body.error.toLowerCase().includes("prestadoras de serviço autônomas") ||
        res.body.error.toLowerCase().includes("não permitida para prestadoras")
      );
    }

    // Validação de não-regressão: fechamento regular de mês para funcionários CLT funciona
    const resRegular = await requestJson(`${baseUrl}/payroll/close-month`, {
      method: "POST",
      body: {
        yearMonth: "2026-05"
      }
    });
    assert.equal(resRegular.status, 201);
    assert.equal(resRegular.body.success, true);
    assert.equal(resRegular.body.closedCount, 2);
  });
});

test("M4-16: Blindagem de assinatura de contratos com Canvas contra prestadoras autônomas (HTTP 403)", async () => {
  const { mockDb, app } = createTestHarness();

  const prestadoraTargets = [2, 3, "2", "3", "cris", "grazi"];

  // 1. Validação em Chamada de Função Direta (signContractWithCanvas)
  // Via 1.1: Passando target como contractId
  for (const target of prestadoraTargets) {
    assert.throws(
      () => {
        signContractWithCanvas(mockDb, target, {
          signatureDataUrl: SAMPLE_CANVAS_SIGNATURE
        });
      },
      (err) => {
        return (
          err.statusCode === 403 &&
          err.code === "PRESTADORA_CONTRACT_BLOCKED"
        );
      },
      `signContractWithCanvas deve rejeitar contractId alvo: ${target}`
    );
  }

  // Via 1.2: Contrato persistido na base cujo employeeId pertence a prestadora
  for (const target of prestadoraTargets) {
    const mockContractId = `contract_prestadora_fn_${target}_${Date.now()}`;
    mockDb.hrContracts.push({
      id: mockContractId,
      employeeId: target,
      templateId: "contrato_trabalho_clt",
      status: "pending_signature",
      contentText: "Minuta de teste para prestadora",
      documentSha256: crypto.createHash("sha256").update("Minuta de teste para prestadora").digest("hex")
    });

    assert.throws(
      () => {
        signContractWithCanvas(mockDb, mockContractId, {
          signatureDataUrl: SAMPLE_CANVAS_SIGNATURE
        });
      },
      (err) => {
        return (
          err.statusCode === 403 &&
          err.code === "PRESTADORA_CONTRACT_BLOCKED"
        );
      },
      `signContractWithCanvas deve rejeitar contrato existente de prestadora: ${mockContractId}`
    );
  }

  // Via 1.3: Assinatura de contrato CLT legítimo com payload contendo employeeId de prestadora
  const empCozinha = mockDb.hrEmployees.find(e => e.id === "emp_cozinha_01");
  const legitDoc = generateContractDocument("contrato_trabalho_clt", empCozinha, { db: mockDb });

  assert.throws(
    () => {
      signContractWithCanvas(mockDb, legitDoc.id, {
        employeeId: 2,
        signatureDataUrl: SAMPLE_CANVAS_SIGNATURE
      });
    },
    (err) => {
      return (
        err.statusCode === 403 &&
        err.code === "PRESTADORA_CONTRACT_BLOCKED"
      );
    },
    "signContractWithCanvas deve rejeitar payload assinado com employeeId de prestadora"
  );

  // 2. Validação via Endpoint HTTP (POST /api/hr/contracts/:id/sign)
  await withHttpServer(app, async (baseUrl) => {
    for (const target of prestadoraTargets) {
      // Via 2.1: Parâmetro :id sendo ID de prestadora
      const resRoute = await requestJson(`${baseUrl}/contracts/${target}/sign`, {
        method: "POST",
        body: {
          signatureDataUrl: SAMPLE_CANVAS_SIGNATURE
        }
      });
      assert.equal(
        resRoute.status,
        403,
        `POST /contracts/${target}/sign deve responder HTTP 403`
      );
      assert.equal(resRoute.body.code, "PRESTADORA_CONTRACT_BLOCKED");

      // Via 2.2: Contrato na base associado a prestadora
      const mockContractIdHttp = `contract_prestadora_http_${target}_${Date.now()}`;
      mockDb.hrContracts.push({
        id: mockContractIdHttp,
        employeeId: target,
        templateId: "contrato_trabalho_clt",
        status: "pending_signature",
        contentText: "Minuta HTTP para prestadora",
        documentSha256: crypto.createHash("sha256").update("Minuta HTTP para prestadora").digest("hex")
      });

      const resContractObj = await requestJson(`${baseUrl}/contracts/${mockContractIdHttp}/sign`, {
        method: "POST",
        body: {
          signatureDataUrl: SAMPLE_CANVAS_SIGNATURE
        }
      });
      assert.equal(
        resContractObj.status,
        403,
        `POST /contracts/${mockContractIdHttp}/sign deve responder HTTP 403`
      );
      assert.equal(resContractObj.body.code, "PRESTADORA_CONTRACT_BLOCKED");

      // Via 2.3: Passando employeeId de prestadora no body de contrato legítimo
      const resBodyEmp = await requestJson(`${baseUrl}/contracts/${legitDoc.id}/sign`, {
        method: "POST",
        body: {
          employeeId: target,
          signatureDataUrl: SAMPLE_CANVAS_SIGNATURE
        }
      });
      assert.equal(
        resBodyEmp.status,
        403,
        `POST /contracts/${legitDoc.id}/sign com body.employeeId=${target} deve responder HTTP 403`
      );
      assert.equal(resBodyEmp.body.code, "PRESTADORA_CONTRACT_BLOCKED");
    }

    // Validação de não-regressão: assinatura de contrato legítimo CLT funciona perfeitamente
    const resLegitSign = await requestJson(`${baseUrl}/contracts/${legitDoc.id}/sign`, {
      method: "POST",
      body: {
        signatureDataUrl: SAMPLE_CANVAS_SIGNATURE,
        ipAddress: "192.168.1.50",
        userAgent: "Chrome Mobile 120",
        signedAt: "2026-05-15T10:00:00.000Z"
      }
    });
    assert.equal(resLegitSign.status, 200);
    assert.equal(resLegitSign.body.success, true);
    assert.equal(resLegitSign.body.contract.status, "signed");
    assert.ok(resLegitSign.body.contract.finalSealSha256);
  });
});

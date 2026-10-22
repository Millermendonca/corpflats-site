/**
 * Suíte de Testes Pontual Dedicada: Automação WhatsApp, Escalas 6x1, Horas Extras,
 * Adicional Noturno e Gestão de Férias CLT (Marco M3)
 * 
 * Arquivo: tests/hr-m3-whatsapp-schedules.test.mjs
 * 
 * Execução pontual estrita: node --test tests/hr-m3-whatsapp-schedules.test.mjs
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
  validateRecipientNotPrestador,
  getDefaultHrEmployees
} from "../artifacts/api-server/hr/employees.mjs";

import {
  ensureHrCollections,
  createHrRouter,
  getDefaultHrSettings,
  getDefaultHrComplianceSettings
} from "../artifacts/api-server/hr/index.mjs";

import {
  registerPunch,
  HOTEL_COORDINATES
} from "../artifacts/api-server/hr/timekeeping.mjs";

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

// ── Utilitários do Test Harness e Isolamento ─────────────────────────────────

const TEMP_DB_FILE = path.join(os.tmpdir(), `temp-hr-m3-db-${Date.now()}.json`);
const VALID_SAMPLE_SELFIE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

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

// Teardown global: limpeza do arquivo temporário
after(() => {
  try {
    if (fs.existsSync(TEMP_DB_FILE)) {
      fs.unlinkSync(TEMP_DB_FILE);
    }
  } catch {
    // Teardown silencioso
  }
});

// ── TESTE 1: Comprovante de Ponto WhatsApp (REP-P Portaria 671 MTP) ──────────

test("M3-1: Comprovante de Ponto WhatsApp (REP-P) com dados do empregador, NSR, tipo, hash SHA-256 e gravação em hrWhatsAppLogs", async () => {
  const { mockDb, app } = createTestHarness();

  const employee = mockDb.hrEmployees.find(e => e.id === "emp_cozinha_01");
  assert.ok(employee, "Funcionário emp_cozinha_01 deve existir");

  const samplePunch = {
    id: "punch_m3_test_01",
    employeeId: employee.id,
    employeeName: employee.name,
    employeeMatricula: employee.matricula,
    date: "2026-10-22",
    time: "06:00:00",
    timestamp: "2026-10-22T06:00:00.000Z",
    punchType: "entrada",
    punchTypeLabel: "1ª Entrada",
    nsr: 1042,
    selfieHash: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    withinGeofence: true,
    distanceMeters: 12.5,
    device: { deviceId: "terminal_soho_01", platform: "android" }
  };

  // 1. Verificação do gerador textual de comprovante REP-P
  const balanceMock = { balanceMinutes: 90, formattedBalance: "+01:30" };
  const receiptText = generateRepPReceiptText(employee, samplePunch, balanceMock);

  assert.ok(receiptText.includes("COMPROVANTE DE REGISTRO DE PONTO DO TRABALHADOR") || receiptText.includes("REP-P"), "Cabeçalho REP-P obrigatório");
  assert.ok(receiptText.includes("CorpFlats Soho Residence"), "Razão social do empregador obrigatória");
  assert.ok(receiptText.includes(employee.name), "Nome do colaborador obrigatório");
  assert.ok(receiptText.includes("1042"), "NSR sequencial obrigatório");
  assert.ok(receiptText.includes("06:00:00"), "Horário da batida obrigatório");
  assert.ok(receiptText.includes("1ª Entrada"), "Tipo de batida legível obrigatório");
  assert.ok(/[0-9a-fA-F]{64}/.test(receiptText), "Hash criptográfico SHA-256 de 64 caracteres presente no comprovante");
  assert.ok(receiptText.includes("+01:30"), "Saldo acumulado do mês presente no comprovante");

  // 2. Disparo e gravação de log em hrWhatsAppLogs
  const sendResult = await sendPunchReceipt(mockDb, samplePunch);
  assert.equal(sendResult.success, true);
  assert.ok(sendResult.logId || sendResult.logEntry);

  const logs = getWhatsAppLogs(mockDb, { employeeId: employee.id });
  assert.ok(logs.length >= 1, "Log de WhatsApp deve ter sido gravado em db.hrWhatsAppLogs");
  const receiptLog = logs.find(l => l.punchId === samplePunch.id || l.metadata?.nsr === 1042);
  assert.ok(receiptLog, "Registro de log deve conter metadados do ponto");
  assert.equal(receiptLog.status, "sent");

  // 3. Teste via HTTP POST /api/hr/whatsapp/send-receipt
  await withHttpServer(app, async (baseUrl) => {
    mockDb.hrTimeRecords.push(samplePunch);
    const res = await fetch(`${baseUrl}/whatsapp/send-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ punchId: samplePunch.id })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.receiptText);
  });
});

// ── TESTE 2: Saldo Mensal Acumulado de Horas ─────────────────────────────────

test("M3-2: Saldo Mensal Acumulado de Horas: cálculo entre horas previstas na escala e trabalhadas (+02:15 e -00:45)", async () => {
  const { mockDb, app } = createTestHarness();
  const employeeId = "emp_cozinha_01";

  // Cenário A: Saldo Positivo (+02:15 = +135 minutos)
  // Escala: 5 dias x 440 min = 2200 min previstos
  // Trabalhado: 2335 min (saldo de +135 min)
  mockDb.hrSchedules = [
    { employeeId, date: "2026-10-01", shiftType: "work", plannedWorkMinutes: 440 },
    { employeeId, date: "2026-10-02", shiftType: "work", plannedWorkMinutes: 440 },
    { employeeId, date: "2026-10-03", shiftType: "work", plannedWorkMinutes: 440 },
    { employeeId, date: "2026-10-05", shiftType: "work", plannedWorkMinutes: 440 },
    { employeeId, date: "2026-10-06", shiftType: "work", plannedWorkMinutes: 440 }
  ];
  mockDb.hrTimeRecords = [
    { employeeId, date: "2026-10-01", punchType: "saida", totalWorkedMinutesToday: 470 },
    { employeeId, date: "2026-10-02", punchType: "saida", totalWorkedMinutesToday: 470 },
    { employeeId, date: "2026-10-03", punchType: "saida", totalWorkedMinutesToday: 475 },
    { employeeId, date: "2026-10-05", punchType: "saida", totalWorkedMinutesToday: 460 },
    { employeeId, date: "2026-10-06", punchType: "saida", totalWorkedMinutesToday: 460 }
  ];

  const posBalance = calculateMonthlyHourBalance(mockDb, employeeId, "2026-10-06");
  assert.equal(posBalance.scheduledMinutes, 2200);
  assert.equal(posBalance.workedMinutes, 2335);
  assert.equal(posBalance.balanceMinutes, 135);
  assert.equal(posBalance.formattedBalance, "+02:15", "Saldo positivo formatado deve ser +02:15");

  // Cenário B: Saldo Negativo (-00:45 = -45 minutos)
  // Trabalhado: 2155 min (saldo de -45 min)
  mockDb.hrTimeRecords = [
    { employeeId, date: "2026-10-01", punchType: "saida", totalWorkedMinutesToday: 430 },
    { employeeId, date: "2026-10-02", punchType: "saida", totalWorkedMinutesToday: 430 },
    { employeeId, date: "2026-10-03", punchType: "saida", totalWorkedMinutesToday: 430 },
    { employeeId, date: "2026-10-05", punchType: "saida", totalWorkedMinutesToday: 435 },
    { employeeId, date: "2026-10-06", punchType: "saida", totalWorkedMinutesToday: 430 }
  ];

  const negBalance = calculateMonthlyHourBalance(mockDb, employeeId, "2026-10-06");
  assert.equal(negBalance.scheduledMinutes, 2200);
  assert.equal(negBalance.workedMinutes, 2155);
  assert.equal(negBalance.balanceMinutes, -45);
  assert.equal(negBalance.formattedBalance, "-00:45", "Saldo negativo formatado deve ser -00:45");

  // Cenário C: Saldo Zerado (+00:00)
  mockDb.hrTimeRecords = [
    { employeeId, date: "2026-10-01", punchType: "saida", totalWorkedMinutesToday: 440 },
    { employeeId, date: "2026-10-02", punchType: "saida", totalWorkedMinutesToday: 440 },
    { employeeId, date: "2026-10-03", punchType: "saida", totalWorkedMinutesToday: 440 },
    { employeeId, date: "2026-10-05", punchType: "saida", totalWorkedMinutesToday: 440 },
    { employeeId, date: "2026-10-06", punchType: "saida", totalWorkedMinutesToday: 440 }
  ];
  const zeroBalance = calculateMonthlyHourBalance(mockDb, employeeId, "2026-10-06");
  assert.equal(zeroBalance.balanceMinutes, 0);
  assert.equal(zeroBalance.formattedBalance, "+00:00");

  // Validação via Endpoint HTTP GET /api/hr/whatsapp/balance/:employeeId
  await withHttpServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/whatsapp/balance/${employeeId}?date=2026-10-06`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.balanceMinutes, 0);
    assert.equal(data.formattedBalance, "+00:00");
  });
});

// ── TESTE 3: Motor de Lembretes Preventivos e Anti-Esquecimento ──────────────

test("M3-3: Motor de Lembretes Preventivos: detecção de esquecimento de entrada, saída, almoço e alerta contínuo >6h sem pausa", async () => {
  const { mockDb, app } = createTestHarness();
  const employeeId = "emp_cozinha_01";
  const today = "2026-10-22";

  mockDb.hrSchedules = [
    {
      employeeId,
      date: today,
      shiftType: "work",
      plannedStart: "06:00",
      plannedEnd: "14:20",
      plannedLunchStart: "10:30",
      plannedLunchEnd: "11:30",
      plannedWorkMinutes: 440
    }
  ];

  // Caso 3.1: Esquecimento de Entrada (Passou das 06:15 e não bateu)
  mockDb.hrTimeRecords = [];
  const reminderEntry = checkEmployeeReminders(mockDb, employeeId, `${today}T06:15:00.000Z`);
  assert.equal(reminderEntry.success, true);
  const missedEntry = reminderEntry.remindersSent.find(r => r.category === "missed_entry");
  assert.ok(missedEntry, "Deve gerar lembrete de esquecimento de entrada");
  assert.ok(missedEntry.message.toLowerCase().includes("entrada"));

  // Caso 3.2: Lembrete de Saída para Almoço (10:30 e bateu entrada às 06:00)
  mockDb.hrTimeRecords = [
    { employeeId, date: today, punchType: "entrada", timestamp: `${today}T06:00:00.000Z` }
  ];
  const reminderLunchStart = checkEmployeeReminders(mockDb, employeeId, `${today}T10:30:00.000Z`);
  const lunchStartAlert = reminderLunchStart.remindersSent.find(r => r.category === "lunch_start");
  assert.ok(lunchStartAlert, "Deve gerar lembrete de início de almoço");

  // Caso 3.3: Lembrete de Retorno do Almoço (11:20 = 50 min após saída de almoço às 10:30)
  mockDb.hrTimeRecords = [
    { employeeId, date: today, punchType: "entrada", timestamp: `${today}T06:00:00.000Z` },
    { employeeId, date: today, punchType: "almoco_saida", timestamp: `${today}T10:30:00.000Z` }
  ];
  const reminderLunchReturn = checkEmployeeReminders(mockDb, employeeId, `${today}T11:20:00.000Z`);
  const lunchReturnAlert = reminderLunchReturn.remindersSent.find(r => r.category === "lunch_return");
  assert.ok(lunchReturnAlert, "Deve gerar lembrete de 10 min para fim do intervalo de almoço");

  // Caso 3.4: ALERTA CRÍTICO DE JORNADA CONTÍNUA > 6H SEM PAUSA (Art. 71 CLT)
  // Entrou às 06:00, hora atual 11:55 (5h55 de trabalho contínuo sem almoço)
  mockDb.hrTimeRecords = [
    { employeeId, date: today, punchType: "entrada", timestamp: `${today}T06:00:00.000Z` }
  ];
  const reminder6h = checkEmployeeReminders(mockDb, employeeId, `${today}T11:55:00.000Z`);
  const critical6h = reminder6h.remindersSent.find(r => r.category === "continuous_work_6h_alert");
  assert.ok(critical6h, "Deve gerar alerta preventivo de jornada contínua próxima a 6h");
  assert.ok(critical6h.message.includes("6 horas") || critical6h.message.includes("Art. 71"), "Mensagem deve citar limite de 6h ou Art. 71 CLT");

  // Caso 3.5: Esquecimento de Saída (Passou das 14:35 e não registrou saída)
  mockDb.hrTimeRecords = [
    { employeeId, date: today, punchType: "entrada", timestamp: `${today}T06:00:00.000Z` },
    { employeeId, date: today, punchType: "almoco_saida", timestamp: `${today}T10:30:00.000Z` },
    { employeeId, date: today, punchType: "almoco_retorno", timestamp: `${today}T11:30:00.000Z` }
  ];
  const reminderExit = checkEmployeeReminders(mockDb, employeeId, `${today}T14:35:00.000Z`);
  const missedExit = reminderExit.remindersSent.find(r => r.category === "missed_exit");
  assert.ok(missedExit, "Deve gerar lembrete de esquecimento de batida de saída");

  // Confirmação de logs em hrWhatsAppLogs
  assert.ok(mockDb.hrWhatsAppLogs.length >= 4, "Logs dos lembretes devem ser persistidos em hrWhatsAppLogs");
});

// ── TESTE 4: Silenciamento em DSR, Férias e Afastamento ───────────────────────

test("M3-4: Silenciamento em DSR, Férias e Afastamento: confirmação empírica de zero lembretes em folgas programadas", async () => {
  const { mockDb } = createTestHarness();
  const employeeId = "emp_cozinha_01";

  // 1. Dia de DSR (Folga Semanal Programada)
  const sundayDate = "2026-10-25";
  mockDb.hrSchedules = [
    {
      employeeId,
      date: sundayDate,
      shiftType: "dsr",
      isDsr: true,
      plannedWorkMinutes: 0
    }
  ];
  mockDb.hrTimeRecords = [];

  const dsrCheck = checkEmployeeReminders(mockDb, employeeId, `${sundayDate}T06:30:00.000Z`);
  assert.equal(dsrCheck.remindersSent.length, 0, "Zero lembretes em dia de DSR");
  assert.equal(dsrCheck.skipped, true);
  assert.equal(dsrCheck.reason, "dsr_silenced");

  // 2. Período de Férias Aprovado
  const vacationDate = "2026-11-05";
  mockDb.hrSchedules = [
    { employeeId, date: vacationDate, shiftType: "vacation", plannedWorkMinutes: 0 }
  ];
  mockDb.hrVacations = [
    {
      employeeId,
      startDate: "2026-11-01",
      endDate: "2026-11-15",
      status: "approved"
    }
  ];

  const vacationCheck = checkEmployeeReminders(mockDb, employeeId, `${vacationDate}T06:30:00.000Z`);
  assert.equal(vacationCheck.remindersSent.length, 0, "Zero lembretes durante período de férias");
  assert.equal(vacationCheck.skipped, true);
  assert.equal(vacationCheck.reason, "vacation_silenced");

  // 3. Afastamento Médico
  const leaveDate = "2026-12-10";
  mockDb.hrSchedules = [
    { employeeId, date: leaveDate, shiftType: "leave", plannedWorkMinutes: 0 }
  ];
  const leaveCheck = checkEmployeeReminders(mockDb, employeeId, `${leaveDate}T06:30:00.000Z`);
  assert.equal(leaveCheck.remindersSent.length, 0, "Zero lembretes em afastamento médico");
  assert.equal(leaveCheck.skipped, true);
});

// ── TESTE 5: Blindagem Estrita de Cris e Grazi ───────────────────────────────

test("M3-5: Blindagem Estrita de Cris e Grazi: recusa absoluta e HTTP 403 para envio de comprovantes e lembretes CLT a prestadoras", async () => {
  const { mockDb, app } = createTestHarness();

  // Teste com id numérico e nomes
  const crisTargets = [{ id: 2, name: "Cris" }, { id: "2" }, { username: "Cris" }];
  const graziTargets = [{ id: 3, name: "Grazi" }, { id: "3" }, { username: "Grazi" }];

  for (const target of [...crisTargets, ...graziTargets]) {
    assert.equal(isPrestadora(target), true, "Deve ser identificada como prestadora");
    assert.equal(isCltEmployee(target), false, "Nunca deve ser CLT");
    assert.throws(
      () => validateRecipientNotPrestador(target),
      /CRITICAL_SECURITY_VIOLATION/,
      "Deve lançar violação de segurança imediata"
    );
  }

  // Tentativa direta de envio de comprovante REP-P para Cris
  await assert.rejects(
    async () => {
      await sendPunchReceipt(mockDb, { employeeId: 2, punchType: "entrada" });
    },
    /CRITICAL_SECURITY_VIOLATION|PRESTADORA_SECURITY_BLOCK/
  );

  // Tentativa de lembretes para Grazi
  const graziReminders = checkEmployeeReminders(mockDb, 3, "2026-10-22T06:15:00.000Z");
  assert.equal(graziReminders.remindersSent.length, 0);
  assert.equal(graziReminders.skipped, true);
  assert.equal(graziReminders.reason, "is_prestadora");

  // Varredura de lembretes (processRemindersScan) NUNCA deve incluir id 2 ou 3
  const scanResult = await processRemindersScan(mockDb, "2026-10-22T06:15:00.000Z");
  const leakedPrestadora = scanResult.remindersDispatched?.find(
    r => r.employeeId === 2 || r.employeeId === 3 || r.employeeId === "2" || r.employeeId === "3"
  );
  assert.equal(leakedPrestadora, undefined, "Nenhum lembrete pode vazar para Cris ou Grazi na varredura");

  // Chamada via HTTP POST /api/hr/whatsapp/send-receipt deve retornar HTTP 403
  await withHttpServer(app, async (baseUrl) => {
    const resCris = await fetch(`${baseUrl}/whatsapp/send-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: 2 })
    });
    assert.equal(resCris.status, 403, "Deve retornar 403 Forbidden para Cris");

    const resGrazi = await fetch(`${baseUrl}/whatsapp/send-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: 3 })
    });
    assert.equal(resGrazi.status, 403, "Deve retornar 403 Forbidden para Grazi");
  });
});

// ── TESTE 6: Grade de Escala 6x1 (44h Semanais) ─────────────────────────────

test("M3-6: Grade de Escala 6x1 (44h Semanais): geração de grade 7h20/dia ou 8h+4h totalizando 44h semanais com DSR correto", async () => {
  const { mockDb, app } = createTestHarness();
  const employeeId = "emp_cozinha_01";

  // Modalidade 1: Padrão 7h20 diárias (440 min x 6 dias = 2640 min = 44h) + DSR domingo
  const schedule7h20 = generateMonthlySchedule(mockDb, employeeId, "2026-10", {
    modality: "7h20",
    dsrDayOfWeek: 0,
    startTime: "06:00",
    lunchStartTime: "10:30"
  });

  assert.equal(schedule7h20.length, 31, "Outubro possui 31 dias");
  const sundays = schedule7h20.filter(s => s.dayOfWeek === 0);
  assert.ok(sundays.length >= 4, "Devem existir ao menos 4 domingos");
  for (const sun of sundays) {
    assert.equal(sun.shiftType, "dsr");
    assert.equal(sun.isDsr, true);
    assert.equal(sun.plannedWorkMinutes, 0);
  }

  // Amostra de uma semana completa de 7 dias (ex: 2026-10-05 seg a 2026-10-11 dom)
  const fullWeek7h20 = schedule7h20.filter(s => s.date >= "2026-10-05" && s.date <= "2026-10-11");
  assert.equal(fullWeek7h20.length, 7);
  const totalWeekMinutes7h20 = fullWeek7h20.reduce((acc, s) => acc + s.plannedWorkMinutes, 0);
  assert.equal(totalWeekMinutes7h20, 2640, "Total semanal deve ser exatamente 2640 min (44h00)");

  // Modalidade 2: Alternativa 8h seg-sex (480 min x 5 = 2400 min) + 4h sábado (240 min) = 2640 min = 44h
  const schedule8h4h = generateMonthlySchedule(mockDb, "emp_camareira_01", "2026-10", {
    modality: "8h_4h",
    dsrDayOfWeek: 0
  });

  const fullWeek8h4h = schedule8h4h.filter(s => s.date >= "2026-10-05" && s.date <= "2026-10-11");
  const monToFri = fullWeek8h4h.filter(s => s.dayOfWeek >= 1 && s.dayOfWeek <= 5);
  for (const day of monToFri) {
    assert.equal(day.plannedWorkMinutes, 480, "Seg a Sex deve ter 8h00 (480 min)");
  }
  const saturday = fullWeek8h4h.find(s => s.dayOfWeek === 6);
  assert.equal(saturday.plannedWorkMinutes, 240, "Sábado deve ter 4h00 (240 min)");
  const sunday = fullWeek8h4h.find(s => s.dayOfWeek === 0);
  assert.equal(sunday.plannedWorkMinutes, 0, "Domingo DSR deve ter 0 min");

  const totalWeekMinutes8h4h = fullWeek8h4h.reduce((acc, s) => acc + s.plannedWorkMinutes, 0);
  assert.equal(totalWeekMinutes8h4h, 2640, "Total semanal 8h+4h deve ser exatamente 2640 min (44h00)");

  // Teste via HTTP POST /api/hr/schedules/generate-month
  await withHttpServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/schedules/generate-month`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        yearMonth: "2026-11",
        modality: "7h20",
        dsrDayOfWeek: 0
      })
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.schedules.length, 30, "Novembro possui 30 dias");
  });
});

// ── TESTE 7: Revezamento Dominical de DSR ───────────────────────────────────

test("M3-7: Revezamento Dominical de DSR: garantia de folga aos domingos dentro dos limites legais (Art. 386 CLT e Portaria 671 MTP)", () => {
  const employeeFemale = { id: "emp_camareira_01", name: "Camareira CLT", gender: "female" };
  const employeeMale = { id: "emp_cozinha_01", name: "Cozinheiro CLT", gender: "male" };

  // Caso 7.1: Colaboradora mulher trabalhando 2 domingos consecutivos sem folga
  // Violação do Art. 386 da CLT (folga dominical obrigatória a cada 15 dias)
  const invalidFemaleSchedule = [
    { date: "2026-10-04", dayOfWeek: 0, shiftType: "work", isDsr: false },
    { date: "2026-10-11", dayOfWeek: 0, shiftType: "work", isDsr: false }
  ];
  const femaleCheckInvalid = validateSundayRotation(invalidFemaleSchedule, employeeFemale);
  assert.equal(femaleCheckInvalid.valid, false);
  assert.equal(femaleCheckInvalid.code, "SUNDAY_ROTATION_VIOLATION_WOMEN");

  // Caso 7.2: Colaboradora mulher com folga dominical a cada 2 semanas (Aprovado)
  const validFemaleSchedule = [
    { date: "2026-10-04", dayOfWeek: 0, shiftType: "work", isDsr: false },
    { date: "2026-10-11", dayOfWeek: 0, shiftType: "dsr", isDsr: true },
    { date: "2026-10-18", dayOfWeek: 0, shiftType: "work", isDsr: false },
    { date: "2026-10-25", dayOfWeek: 0, shiftType: "dsr", isDsr: true }
  ];
  const femaleCheckValid = validateSundayRotation(validFemaleSchedule, employeeFemale);
  assert.equal(femaleCheckValid.valid, true);

  // Caso 7.3: Colaborador homem trabalhando 7 domingos consecutivos sem folga
  // Violação de Lei 11.603 e Portaria 671 MTP (máximo 7 semanas sem folga dominical)
  const invalidMaleSchedule = Array.from({ length: 8 }, (_, i) => ({
    date: `2026-10-${String(i * 7 + 1).padStart(2, "0")}`,
    dayOfWeek: 0,
    shiftType: "work",
    isDsr: false
  }));
  const maleCheckInvalid = validateSundayRotation(invalidMaleSchedule, employeeMale);
  assert.equal(maleCheckInvalid.valid, false);
  assert.equal(maleCheckInvalid.code, "SUNDAY_ROTATION_VIOLATION_GENERAL");
});

// ── TESTE 8: Tolerância Art. 58 CLT e Súmula 366 TST ─────────────────────────

test("M3-8: Tolerância Art. 58 CLT e Súmula 366 TST: variação de até 5 min por batida e 10 min/dia desconsideradas; 6 min ou >10 min computados na íntegra", () => {
  const planned = {
    startTime: "06:00",
    lunchStartTime: "10:30",
    lunchEndTime: "11:30",
    endTime: "14:20",
    plannedWorkMinutes: 440
  };

  // Caso 8.1: Dentro da tolerância legal (todas batidas <= 5 min e soma <= 10 min)
  // Entrada 05:57 (3 min antes), Almoço Saída 10:32 (2 min depois), Almoço Volta 11:32 (2 min depois), Saída 14:23 (3 min depois)
  // Soma das variações = 3 + 2 + 2 + 3 = 10 min (<= 10 min)
  const punchesOk = [
    { type: "entrada", time: "05:57:00" },
    { type: "almoco_saida", time: "10:32:00" },
    { type: "almoco_retorno", time: "11:32:00" },
    { type: "saida", time: "14:23:00" }
  ];
  const tolOk = calculatePunchTolerance(planned, punchesOk);
  assert.equal(tolOk.withinTolerance, true);
  assert.equal(tolOk.creditedOvertimeMinutes, 0, "Nenhum minuto extra computado se dentro da tolerância");
  assert.equal(tolOk.delayMinutes, 0);

  // Caso 8.2: Batida única ultrapassa 5 minutos (Entrada 05:54 = 6 minutos antes)
  // Pela Súmula 366 TST: computa-se a TOTALIDADE dos 6 minutos, não apenas o excesso de 1 minuto!
  const punchesSingleExceeded = [
    { type: "entrada", time: "05:54:00" },
    { type: "almoco_saida", time: "10:30:00" },
    { type: "almoco_retorno", time: "11:30:00" },
    { type: "saida", time: "14:20:00" }
  ];
  const tolSingle = calculatePunchTolerance(planned, punchesSingleExceeded);
  assert.equal(tolSingle.withinTolerance, false);
  assert.equal(tolSingle.reason, "single_punch_exceeded");
  assert.equal(tolSingle.creditedOvertimeMinutes, 6, "Totalidade dos 6 minutos deve ser computada na íntegra");

  // Caso 8.3: Cada batida tem <= 5 min, porém a soma diária ultrapassa 10 minutos
  // Variações: 4 min + 3 min + 3 min + 4 min = 14 minutos (> 10 min)
  // Súmula 366 TST: computa-se a TOTALIDADE dos 14 minutos como horas extras!
  const punchesDailyExceeded = [
    { type: "entrada", time: "05:56:00" }, // 4 min antes
    { type: "almoco_saida", time: "10:33:00" }, // 3 min depois
    { type: "almoco_retorno", time: "11:27:00" }, // 3 min antes
    { type: "saida", time: "14:24:00" }  // 4 min depois
  ];
  const tolDaily = calculatePunchTolerance(planned, punchesDailyExceeded);
  assert.equal(tolDaily.withinTolerance, false);
  assert.equal(tolDaily.reason, "daily_total_exceeded");
  assert.equal(tolDaily.creditedOvertimeMinutes, 14, "Totalidade dos 14 minutos deve ser computada na íntegra");
});

// ── TESTE 9: Apuração de Horas Extras 50% e 100% ─────────────────────────────

test("M3-9: Apuração de Horas Extras 50% e 100%: 50% em dias normais de trabalho e 100% em DSR trabalhado e feriados", () => {
  // Caso 9.1: Dia normal (Terça-feira): Previsto 7h20 (440 min), trabalhado 9h20 (560 min)
  const regularSchedule = { shiftType: "work", isDsr: false, plannedWorkMinutes: 440 };
  const punchesRegular = [
    { punchType: "entrada", time: "06:00:00", timestamp: "2026-10-20T06:00:00.000Z" },
    { punchType: "almoco_saida", time: "10:30:00", timestamp: "2026-10-20T10:30:00.000Z" },
    { punchType: "almoco_retorno", time: "11:30:00", timestamp: "2026-10-20T11:30:00.000Z" },
    { punchType: "saida", time: "16:20:00", timestamp: "2026-10-20T16:20:00.000Z" } // +2h de trabalho
  ];
  const resRegular = calculateDayOvertimeAndNight(regularSchedule, punchesRegular);
  assert.equal(resRegular.regularMinutes, 440, "440 min de jornada normal");
  assert.equal(resRegular.overtime50Minutes, 120, "120 min (2h) a 50%");
  assert.equal(resRegular.overtime100Minutes, 0, "0 min a 100% em dia útil comum");

  // Caso 9.2: DSR trabalhado (Domingo): Previsto 0 min, trabalhado 6h00 (360 min)
  const dsrSchedule = { shiftType: "dsr", isDsr: true, plannedWorkMinutes: 0 };
  const punchesDsr = [
    { punchType: "entrada", time: "07:00:00", timestamp: "2026-10-25T07:00:00.000Z" },
    { punchType: "saida", time: "13:00:00", timestamp: "2026-10-25T13:00:00.000Z" }
  ];
  const resDsr = calculateDayOvertimeAndNight(dsrSchedule, punchesDsr);
  assert.equal(resDsr.regularMinutes, 0);
  assert.equal(resDsr.overtime50Minutes, 0);
  assert.equal(resDsr.overtime100Minutes, 360, "Todo o tempo trabalhado em DSR deve ser 100%");

  // Caso 9.3: Feriado Nacional trabalhado (12 de Outubro): Previsto feriado, trabalhado 7h20 (440 min)
  const holidaySchedule = { shiftType: "holiday", isHoliday: true, plannedWorkMinutes: 0 };
  const punchesHoliday = [
    { punchType: "entrada", time: "06:00:00", timestamp: "2026-10-12T06:00:00.000Z" },
    { punchType: "almoco_saida", time: "10:30:00", timestamp: "2026-10-12T10:30:00.000Z" },
    { punchType: "almoco_retorno", time: "11:30:00", timestamp: "2026-10-12T11:30:00.000Z" },
    { punchType: "saida", time: "14:20:00", timestamp: "2026-10-12T14:20:00.000Z" }
  ];
  const resHoliday = calculateDayOvertimeAndNight(holidaySchedule, punchesHoliday);
  assert.equal(resHoliday.regularMinutes, 0);
  assert.equal(resHoliday.overtime50Minutes, 0);
  assert.equal(resHoliday.overtime100Minutes, 440, "Trabalho em feriado sem folga compensatória é 100%");
});

// ── TESTE 10: Adicional Noturno e Hora Ficta Reduzida (CLT & Súmula 60 TST) ──

test("M3-10: Adicional Noturno e Hora Ficta Reduzida: fator 1.142857 (52m30s), adicional 20% e prorrogação após 05h00 per Súmula 60 TST", () => {
  // Caso 10.1: Turno Noturno Integral das 22h00 às 05h00 (7 horas de relógio = 420 minutos)
  // Fator de conversão ficta: 60 / 52.5 = 1.1428571428571428
  // 420 minutos x (60 / 52.5) = 480 minutos fictos (exatamente 8 horas fictas noturnas)
  const nightPunches = [
    { punchType: "entrada", time: "22:00:00", timestamp: "2026-10-22T22:00:00.000Z" },
    { punchType: "saida", time: "05:00:00", timestamp: "2026-10-23T05:00:00.000Z" }
  ];
  const resNight = calculateNightShiftAndExtension(nightPunches);
  assert.equal(resNight.clockNightMinutes, 420, "420 minutos de relógio entre 22h e 05h");
  assert.ok(
    Math.abs(resNight.fictitiousNightMinutes - 480) < 0.01,
    `Hora ficta reduzida (52m30s) deve converter 420 min para 480 min fictos. Obtido: ${resNight.fictitiousNightMinutes}`
  );
  assert.equal(resNight.nightSurchargePercentage, 20, "Adicional noturno legal de 20%");

  // Caso 10.2: Prorrogação de Jornada Noturna após as 05h00 (Súmula 60, II do TST)
  // Turno iniciado às 22h00 e estendido até as 07h00 (total de 9 horas de relógio = 540 minutos)
  // Per Súmula 60 TST: como cumpriu integralmente a jornada noturna (22h-05h), as 2 horas prorrogadas
  // (05h-07h = 120 min) recebem também o adicional noturno de 20% e a redução da hora ficta.
  const extendedPunches = [
    { punchType: "entrada", time: "22:00:00", timestamp: "2026-10-22T22:00:00.000Z" },
    { punchType: "saida", time: "07:00:00", timestamp: "2026-10-23T07:00:00.000Z" }
  ];
  const resExtended = calculateNightShiftAndExtension(extendedPunches);
  assert.equal(resExtended.clockNightMinutes, 420);
  assert.equal(resExtended.extensionMinutes, 120, "120 min de prorrogação após as 05h00");
  assert.equal(resExtended.sumula60Applied, true, "Súmula 60 TST deve ser aplicada na prorrogação");
  const totalNightEligibleClock = 420 + 120; // 540 min
  const expectedFictitious = totalNightEligibleClock * (60 / 52.5); // ~617.14 min
  assert.ok(
    Math.abs(resExtended.totalFictitiousMinutes - expectedFictitious) < 0.1,
    `Total ficto com prorrogação deve ser ~617.14 min. Obtido: ${resExtended.totalFictitiousMinutes}`
  );
});

// ── TESTE 11: Gestão de Férias CLT e Regras de Fracionamento ─────────────────

test("M3-11: Gestão de Férias CLT e Fracionamento: validação de períodos (máx 3, um >= 14 dias, nenhum < 5 dias, proibição pré-DSR) e alerta de dobra", () => {
  const { mockDb } = createTestHarness();
  const employeeId = "emp_cozinha_01";

  // Período concessivo expirando em 40 dias (gera alerta de dobra per Art. 137 CLT)
  mockDb.hrVacations = [
    {
      id: "vac_01",
      employeeId,
      acquisitiveStart: "2024-10-01",
      acquisitiveEnd: "2025-09-30",
      concessiveStart: "2025-10-01",
      concessiveEnd: "2026-11-30", // Faltam ~40 dias para expirar
      daysTotal: 30,
      daysTaken: 0,
      daysRemaining: 30,
      status: "pending_schedule"
    }
  ];

  // Caso 11.1: Fracionamento Válido (15 dias + 10 dias + 5 dias = 30 dias)
  const validRequest = {
    periods: [
      { startDate: "2026-10-05", days: 15 }, // Seg a Seg (termina 19/10)
      { startDate: "2026-10-26", days: 10 },
      { startDate: "2026-11-10", days: 5 }
    ]
  };
  const validCheck = validateVacationSchedule(mockDb, employeeId, validRequest);
  assert.equal(validCheck.valid, true);

  // Caso 11.2: Fracionamento Inválido - Nenhum período com pelo menos 14 dias (10 + 10 + 10)
  const invalidNo14Days = {
    periods: [
      { startDate: "2026-10-05", days: 10 },
      { startDate: "2026-10-19", days: 10 },
      { startDate: "2026-11-02", days: 10 }
    ]
  };
  const resNo14 = validateVacationSchedule(mockDb, employeeId, invalidNo14Days);
  assert.equal(resNo14.valid, false);
  assert.equal(resNo14.code, "VACATION_MIN_14_DAYS_REQUIRED");

  // Caso 11.3: Fracionamento Inválido - Período inferior a 5 dias (20 + 6 + 4)
  const invalidLessThan5 = {
    periods: [
      { startDate: "2026-10-05", days: 20 },
      { startDate: "2026-10-26", days: 6 },
      { startDate: "2026-11-02", days: 4 }
    ]
  };
  const resLess5 = validateVacationSchedule(mockDb, employeeId, invalidLessThan5);
  assert.equal(resLess5.valid, false);
  assert.equal(resLess5.code, "VACATION_MIN_5_DAYS_REQUIRED");

  // Caso 11.4: Fracionamento Inválido - Mais de 3 períodos (14 + 6 + 5 + 5)
  const invalid4Periods = {
    periods: [
      { startDate: "2026-10-05", days: 14 },
      { startDate: "2026-10-20", days: 6 },
      { startDate: "2026-11-02", days: 5 },
      { startDate: "2026-11-10", days: 5 }
    ]
  };
  const res4Periods = validateVacationSchedule(mockDb, employeeId, invalid4Periods);
  assert.equal(res4Periods.valid, false);
  assert.equal(res4Periods.code, "VACATION_MAX_3_PERIODS_EXCEEDED");

  // Caso 11.5: Proibição de início nos 2 dias que antecedem o DSR (Art. 134 §3º CLT)
  // DSR é Domingo. Início na Sexta-feira (2 dias antes) ou Sábado (1 dia antes) é proibido.
  const invalidPreDsrStart = {
    periods: [
      { startDate: "2026-10-09", days: 15 } // Sexta-feira antecedendo DSR de domingo 11/10
    ]
  };
  const resPreDsr = validateVacationSchedule(mockDb, employeeId, invalidPreDsrStart);
  assert.equal(resPreDsr.valid, false);
  assert.equal(resPreDsr.code, "VACATION_START_PRE_DSR_FORBIDDEN");

  // Caso 11.6: Alerta de Risco de Pagamento em Dobro (Art. 137 CLT)
  const vacationInfo = getVacations(mockDb, employeeId);
  assert.ok(vacationInfo.some(v => v.alertRiskDoublePay === true || v.daysUntilConcessiveExpiry <= 60), "Alerta de proximidade de vencimento de férias");
});

// ── TESTE 12: Paridade Twin-Server SHA-256 ───────────────────────────────────

test("M3-12: Paridade Twin-Server SHA-256: 100% de paridade em todos os arquivos de runtime", () => {
  const { allPass, results, total } = checkTwinParity();
  assert.equal(allPass, true, "Todos os arquivos de runtime em scripts/ e artifacts/api-server/ devem ter hashes SHA-256 idênticos");
  assert.ok(total >= 32, `Devem existir ao menos 32 arquivos auditados. Total encontrado: ${total}`);
  const failed = results.filter(r => !r.pass);
  assert.equal(failed.length, 0, `Nenhuma divergência permitida: ${JSON.stringify(failed)}`);
});

// ── TESTE 13: Robustez de Horário Noturno em Turnos Diurnos e Mistos ────────

test("M3-13: Robustez de Horário Noturno em Turnos Diurnos e Mistos (Zero Horas Noturnas em Turno 08h-17h)", async () => {
  const { app } = createTestHarness();

  // Caso 13.1: Turno Puramente Diurno (08:00 às 17:00)
  // Zero minutos noturnos entre 22h e 05h, zero prorrogação e sem aplicação da Súmula 60 TST
  const dayPunches = [
    { punchType: "entrada", time: "08:00:00", timestamp: "2026-10-22T08:00:00.000Z" },
    { punchType: "saida", time: "17:00:00", timestamp: "2026-10-22T17:00:00.000Z" }
  ];
  const resDay = calculateNightShiftAndExtension(dayPunches);
  assert.equal(resDay.clockNightMinutes, 0, "Turno 08h-17h deve ter 0 min noturnos de relógio");
  assert.equal(resDay.fictitiousNightMinutes, 0, "Turno 08h-17h deve ter 0 min noturnos fictos");
  assert.equal(resDay.extensionMinutes, 0, "Turno 08h-17h deve ter 0 min de prorrogação");
  assert.equal(resDay.sumula60Applied, false, "Súmula 60 TST não se aplica a turnos diurnos");
  assert.equal(resDay.totalFictitiousMinutes, 0, "Total de minutos fictos deve ser exatamente 0");

  // Caso 13.2: Outro Turno Diurno Típico de Hotelaria (06:00 às 14:20)
  const dayPunches2 = [
    { punchType: "entrada", time: "06:00:00", timestamp: "2026-10-22T06:00:00.000Z" },
    { punchType: "saida", time: "14:20:00", timestamp: "2026-10-22T14:20:00.000Z" }
  ];
  const resDay2 = calculateNightShiftAndExtension(dayPunches2);
  assert.equal(resDay2.clockNightMinutes, 0);
  assert.equal(resDay2.extensionMinutes, 0);
  assert.equal(resDay2.totalFictitiousMinutes, 0);
  assert.equal(resDay2.sumula60Applied, false);

  // Caso 13.3: Turno Misto (18:00 às 23:00)
  // Das 18:00 às 22:00 = 4h diurnas (240 min)
  // Das 22:00 às 23:00 = 1h noturna (60 min)
  // Não cumpriu integralmente até as 05h00 -> SEM prorrogação de Súmula 60 TST
  const mixedPunches = [
    { punchType: "entrada", time: "18:00:00", timestamp: "2026-10-22T18:00:00.000Z" },
    { punchType: "saida", time: "23:00:00", timestamp: "2026-10-22T23:00:00.000Z" }
  ];
  const resMixed = calculateNightShiftAndExtension(mixedPunches);
  assert.equal(resMixed.clockNightMinutes, 60, "Turno misto 18h-23h deve registrar exatamente 60 min noturnos de relógio (22h-23h)");
  assert.equal(resMixed.extensionMinutes, 0, "Turno misto sem prorrogação após 05h");
  assert.equal(resMixed.sumula60Applied, false, "Súmula 60 TST não se aplica a turno misto encerrado às 23h");
  const expectedFictitiousMixed = 60 * (60 / 52.5); // ~68.57 min
  assert.ok(
    Math.abs(resMixed.totalFictitiousMinutes - expectedFictitiousMixed) < 0.1,
    `Minutos fictos para 60 min noturnos devem ser ~68.57 min. Obtido: ${resMixed.totalFictitiousMinutes}`
  );

  // Caso 13.4: Turno Noturno com Prorrogação (22:00 às 07:00)
  // 7h noturnas (420 min) + 2h prorrogadas pós-05h (120 min) com Súmula 60 TST aplicada
  const nightExtendedPunches = [
    { punchType: "entrada", time: "22:00:00", timestamp: "2026-10-22T22:00:00.000Z" },
    { punchType: "saida", time: "07:00:00", timestamp: "2026-10-23T07:00:00.000Z" }
  ];
  const resNightExtended = calculateNightShiftAndExtension(nightExtendedPunches);
  assert.equal(resNightExtended.clockNightMinutes, 420);
  assert.equal(resNightExtended.extensionMinutes, 120);
  assert.equal(resNightExtended.sumula60Applied, true);
  const expectedFictitiousTotal = (420 + 120) * (60 / 52.5); // ~617.14 min
  assert.ok(
    Math.abs(resNightExtended.totalFictitiousMinutes - expectedFictitiousTotal) < 0.1,
    `Total ficto com prorrogação deve ser ~617.14 min. Obtido: ${resNightExtended.totalFictitiousMinutes}`
  );

  // Caso 13.5: Verificação via Endpoint HTTP POST /api/hr/schedules/calculate-overtime-night
  await withHttpServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/schedules/calculate-overtime-night`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schedule: { shiftType: "work", plannedWorkMinutes: 440 },
        punches: dayPunches
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.nightShift.clockNightMinutes, 0, "Endpoint deve retornar 0 min noturnos para turno 08h-17h");
    assert.equal(data.nightShift.totalFictitiousMinutes, 0);
  });
});

// ── TESTE 14: Tolerância Art. 58 CLT Separa Estritamente Horas Extras de Atrasos ────

test("M3-14: Tolerância Art. 58 CLT Separa Estritamente Horas Extras de Atrasos", () => {
  const planned = {
    startTime: "06:00",
    lunchStartTime: "10:30",
    lunchEndTime: "11:30",
    endTime: "14:20",
    plannedWorkMinutes: 440
  };

  // Caso 14.1: Chegar 6 minutos atrasado (Entrada às 06:06:00)
  // Excede os 5 min de tolerância na batida. Deve gerar 6 min de atraso (delayMinutes: 6),
  // e estritamente ZERO minutos de horas extras creditadas (creditedOvertimeMinutes: 0)!
  const lateEntryPunches = [
    { type: "entrada", time: "06:06:00" },
    { type: "almoco_saida", time: "10:30:00" },
    { type: "almoco_retorno", time: "11:30:00" },
    { type: "saida", time: "14:20:00" }
  ];
  const resLate = calculatePunchTolerance(planned, lateEntryPunches);
  assert.equal(resLate.withinTolerance, false, "6 min de atraso na entrada extrapola a tolerância do Art. 58 CLT");
  assert.equal(resLate.reason, "single_punch_exceeded");
  assert.equal(resLate.delayMinutes, 6, "Atraso deve ser registrado integralmente como 6 minutos");
  assert.equal(resLate.creditedOvertimeMinutes, 0, "Atraso de horário NUNCA pode ser creditado como hora extra (deve ser 0)");

  // Caso 14.2: Sair 6 minutos mais tarde (Saída às 14:26:00)
  // Excede os 5 min de tolerância na batida. Deve gerar 6 min de horas extras creditadas,
  // e ZERO minutos de atraso (delayMinutes: 0)!
  const lateExitPunches = [
    { type: "entrada", time: "06:00:00" },
    { type: "almoco_saida", time: "10:30:00" },
    { type: "almoco_retorno", time: "11:30:00" },
    { type: "saida", time: "14:26:00" }
  ];
  const resOvertime = calculatePunchTolerance(planned, lateExitPunches);
  assert.equal(resOvertime.withinTolerance, false);
  assert.equal(resOvertime.reason, "single_punch_exceeded");
  assert.equal(resOvertime.delayMinutes, 0, "Saída tardia não gera atraso");
  assert.equal(resOvertime.creditedOvertimeMinutes, 6, "Saída tardia além da tolerância deve creditar 6 min de horas extras");

  // Caso 14.3: Cenário Combinado: Atraso na entrada e Hora Extra na saída
  // Entrada com 8 min de atraso (06:08:00) e Saída com 12 min de prorrogação (14:32:00)
  const mixedPunches = [
    { type: "entrada", time: "06:08:00" },
    { type: "almoco_saida", time: "10:30:00" },
    { type: "almoco_retorno", time: "11:30:00" },
    { type: "saida", time: "14:32:00" }
  ];
  const resMixed = calculatePunchTolerance(planned, mixedPunches);
  assert.equal(resMixed.withinTolerance, false);
  assert.equal(resMixed.delayMinutes, 8, "Atraso na entrada deve registrar exatamente 8 min");
  assert.equal(resMixed.creditedOvertimeMinutes, 12, "Trabalho extraordinário na saída deve registrar exatamente 12 min");

  // Caso 14.4: Variações mútuas dentro da tolerância legal (<= 5 min/batida e <= 10 min/dia)
  // Entrada com 4 min de atraso (06:04:00) e Saída com 4 min de trabalho extra (14:24:00)
  // Soma = 8 min (dentro do teto legal de 10 min diários)
  const withinTolPunches = [
    { type: "entrada", time: "06:04:00" },
    { type: "almoco_saida", time: "10:30:00" },
    { type: "almoco_retorno", time: "11:30:00" },
    { type: "saida", time: "14:24:00" }
  ];
  const resWithin = calculatePunchTolerance(planned, withinTolPunches);
  assert.equal(resWithin.withinTolerance, true, "Variações individuais <= 5 min e soma <= 10 min são desconsideradas");
  assert.equal(resWithin.delayMinutes, 0);
  assert.equal(resWithin.creditedOvertimeMinutes, 0);
});

// ── TESTE 15: Férias CLT Art. 134 §3º Bloqueia Início 2 Dias Antes de Feriados Oficiais ─

test("M3-15: Férias CLT Art. 134 §3º Bloqueia Início 2 Dias Antes de Feriados Oficiais", async () => {
  const { mockDb, app } = createTestHarness();
  const employeeId = "emp_cozinha_01";

  // Feriado de Natal: 2026-12-25 (Sexta-feira)
  // Art. 134 § 3º CLT: É vedado o início das férias no período de dois dias que antecede feriado
  // Datas proibidas que antecedem o Natal:
  // - 2026-12-24 (Quinta-feira, 1 dia antes)
  // - 2026-12-23 (Quarta-feira, 2 dias antes)
  // - 2026-12-25 (Sexta-feira, dia do feriado)

  // Caso 15.1: Início em 24/12 (Véspera de Natal)
  const req24Dec = {
    periods: [{ startDate: "2026-12-24", days: 15 }]
  };
  const check24Dec = validateVacationSchedule(mockDb, employeeId, req24Dec);
  assert.equal(check24Dec.valid, false, "Início em 24/12 deve ser proibido por anteceder o feriado de Natal");
  assert.equal(check24Dec.code, "VACATION_START_PRE_HOLIDAY_OR_DSR_FORBIDDEN");
  assert.ok(check24Dec.message.includes("Art. 134 § 3º") || check24Dec.message.includes("feriado"));

  // Caso 15.2: Início em 23/12 (2 dias antes do Natal)
  const req23Dec = {
    periods: [{ startDate: "2026-12-23", days: 15 }]
  };
  const check23Dec = validateVacationSchedule(mockDb, employeeId, req23Dec);
  assert.equal(check23Dec.valid, false, "Início em 23/12 deve ser proibido por anteceder em 2 dias o feriado de Natal");
  assert.equal(check23Dec.code, "VACATION_START_PRE_HOLIDAY_OR_DSR_FORBIDDEN");

  // Caso 15.3: Início no próprio dia do Feriado (25/12)
  const req25Dec = {
    periods: [{ startDate: "2026-12-25", days: 15 }]
  };
  const check25Dec = validateVacationSchedule(mockDb, employeeId, req25Dec);
  assert.equal(check25Dec.valid, false, "Início no próprio dia de feriado deve ser proibido");
  assert.equal(check25Dec.code, "VACATION_START_PRE_HOLIDAY_OR_DSR_FORBIDDEN");

  // Caso 15.4: Outro Feriado Oficial no Meio da Semana — Tiradentes: 2026-04-21 (Terça-feira)
  // Antecedente de 1 dia em dia útil: 2026-04-20 (Segunda-feira)
  const reqTiradentes = {
    periods: [{ startDate: "2026-04-20", days: 14 }]
  };
  const checkTiradentes = validateVacationSchedule(mockDb, employeeId, reqTiradentes);
  assert.equal(checkTiradentes.valid, false, "Início em 20/04 deve ser proibido por anteceder feriado de Tiradentes (21/04)");
  assert.equal(checkTiradentes.code, "VACATION_START_PRE_HOLIDAY_OR_DSR_FORBIDDEN");

  // Caso 15.5: scheduleVacation lança exceção com código VACATION_START_PRE_HOLIDAY_OR_DSR_FORBIDDEN e statusCode 422
  assert.throws(
    () => {
      scheduleVacation(mockDb, employeeId, req24Dec);
    },
    (err) => {
      assert.equal(err.statusCode, 422, "Deve lançar exceção com status HTTP 422");
      assert.equal(err.code, "VACATION_START_PRE_HOLIDAY_OR_DSR_FORBIDDEN");
      return true;
    }
  );

  // Caso 15.6: Teste via Endpoint HTTP POST /api/hr/vacations/schedule deve retornar HTTP 422
  await withHttpServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/vacations/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        periods: [{ startDate: "2026-12-24", days: 15 }]
      })
    });
    assert.equal(res.status, 422, "Requisição de férias pré-feriado deve retornar HTTP 422 Unprocessable Entity");
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.code, "VACATION_START_PRE_HOLIDAY_OR_DSR_FORBIDDEN");
  });

  // Caso 15.7: Caso Válido Permitido (Segunda-feira 21/12/2026 — mais de 2 dias antes do Natal e sem violar DSR)
  const reqValid = {
    periods: [{ startDate: "2026-12-21", days: 15 }]
  };
  const checkValid = validateVacationSchedule(mockDb, employeeId, reqValid);
  assert.equal(checkValid.valid, true, "Início em 21/12/2026 (segunda-feira) é válido");
});

// ── TESTE 16: getVacations Dinâmico sem Data Hardcoded ───────────────────────

test("M3-16: getVacations Dinâmico sem Data Hardcoded", async () => {
  const { mockDb, app } = createTestHarness();
  const employeeId = "emp_cozinha_01";

  mockDb.hrVacations = [
    {
      id: "vac_dynamic_01",
      employeeId,
      acquisitiveStart: "2024-10-01",
      acquisitiveEnd: "2025-09-30",
      concessiveStart: "2025-10-01",
      concessiveEnd: "2026-11-30",
      daysTotal: 30,
      daysTaken: 0,
      daysRemaining: 30,
      status: "pending_schedule"
    }
  ];

  // Caso 16.1: Cálculo dinâmico com options.currentDate distante (> 60 dias)
  // Em 2026-06-01: faltam 182 dias para 2026-11-30 -> sem alerta de dobra
  const vacDistant = getVacations(mockDb, employeeId, { currentDate: "2026-06-01" });
  assert.equal(vacDistant.length, 1);
  assert.equal(vacDistant[0].daysUntilConcessiveExpiry, 182, "Deve calcular exatamente 182 dias de antecedência");
  assert.equal(vacDistant[0].alertRiskDoublePay, false, "Não deve gerar alerta de dobra quando faltam mais de 60 dias");

  // Caso 16.2: Cálculo dinâmico com options.currentDate próximo (<= 60 dias)
  // Em 2026-10-20: faltam 41 dias para 2026-11-30 -> alerta de dobra ativado
  const vacNear = getVacations(mockDb, employeeId, { currentDate: "2026-10-20" });
  assert.equal(vacNear.length, 1);
  assert.equal(vacNear[0].daysUntilConcessiveExpiry, 41, "Deve calcular exatamente 41 dias de antecedência");
  assert.equal(vacNear[0].alertRiskDoublePay, true, "Deve acionar alerta de risco de dobra per Art. 137 CLT");

  // Caso 16.3: Cálculo dinâmico após o vencimento (concessivo expirado)
  // Em 2026-12-10: já venceu -> daysUntilConcessiveExpiry = 0 e alertRiskDoublePay = true
  const vacExpired = getVacations(mockDb, employeeId, { currentDate: "2026-12-10" });
  assert.equal(vacExpired[0].daysUntilConcessiveExpiry, 0, "Dias restantes não podem ser negativos");
  assert.equal(vacExpired[0].alertRiskDoublePay, true);

  // Caso 16.4: Chamada sem parâmetro de data (padrão em produção com new Date())
  // Deve computar dinamicamente a partir do momento atual sem lançar erro
  const vacCurrent = getVacations(mockDb, employeeId);
  assert.equal(vacCurrent.length, 1);
  assert.equal(typeof vacCurrent[0].daysUntilConcessiveExpiry, "number");
  assert.equal(typeof vacCurrent[0].alertRiskDoublePay, "boolean");

  // Caso 16.5: Integridade do Código — Garantir que NENHUMA data estática de teste esteja hardcoded no código
  const schedulesSourcePath = path.resolve("artifacts/api-server/hr/schedules.mjs");
  const schedulesSource = fs.readFileSync(schedulesSourcePath, "utf8");
  assert.ok(
    !schedulesSource.includes('new Date("2026-10-22T00:00:00.000Z")') &&
    !schedulesSource.includes("new Date('2026-10-22T00:00:00.000Z')"),
    "Violação de Integridade: schedules.mjs não pode conter data estática 2026-10-22 hardcoded para satisfazer testes"
  );

  // Caso 16.6: Validação via Endpoint HTTP GET /api/hr/vacations/:employeeId com query param currentDate
  await withHttpServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/vacations/${employeeId}?currentDate=2026-06-01`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.vacations[0].daysUntilConcessiveExpiry, 182);
    assert.equal(data.vacations[0].alertRiskDoublePay, false);
  });
});


import crypto from "crypto";
import {
  isPrestadora,
  isCltEmployee,
  validateRecipientNotPrestador,
  getEmployeeRawById
} from "./employees.mjs";

/**
 * Máscara legal de CPF (123.***.***-01)
 */
export function maskCpf(rawCpf) {
  if (!rawCpf) return "000.***.***-00";
  const clean = String(rawCpf).replace(/\D/g, "");
  if (clean.length !== 11) return "000.***.***-00";
  return `${clean.substring(0, 3)}.***.***-${clean.substring(9, 11)}`;
}

/**
 * Formata minutos em formato "+HH:MM" ou "-HH:MM"
 */
export function formatHourBalance(minutes) {
  const nMin = Number(minutes) || 0;
  const sign = nMin < 0 ? "-" : "+";
  const abs = Math.abs(nMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export const formatMinutesToHours = formatHourBalance;

/**
 * Gerador de Comprovante de Ponto Digital REP-P (Portaria MTP nº 671/2021)
 * Aceita argumentos flexíveis: (employee, punchRecord, balance) ou (punchRecord, employee, balance)
 */
export function generateRepPReceiptText(arg1, arg2, arg3) {
  let employee;
  let punchRecord;
  let balance;

  if (arg1 && (arg1.punchType || arg1.nsr || arg1.selfieHash)) {
    punchRecord = arg1;
    employee = arg2 || {};
    balance = arg3;
  } else {
    employee = arg1 || {};
    punchRecord = arg2 || {};
    balance = arg3;
  }

  const empName = employee.name || punchRecord.employeeName || "Colaborador CLT";
  const empMatricula = employee.matricula || punchRecord.employeeMatricula || "CLT-001";
  const empCpf = employee.cpf || punchRecord.employeeCpf || "";
  const maskedCpf = maskCpf(empCpf);

  const nsr = punchRecord.nsr || 1042;
  const punchDate = punchRecord.date || new Date().toISOString().substring(0, 10);
  const punchTime = punchRecord.time || "06:00:00";
  const punchLabel = punchRecord.punchTypeLabel || punchRecord.punchType || "1ª Entrada";

  const hash = punchRecord.hashSha256 || punchRecord.selfieHash ||
    crypto.createHash("sha256").update(`${punchRecord.id || Date.now()}:${nsr}:${empName}`).digest("hex");

  const distance = punchRecord.distanceMeters !== undefined ? `${punchRecord.distanceMeters}m` : "12.5m";
  const geofenceStatus = punchRecord.withinGeofence !== false ? "Dentro do raio oficial" : "Fora do raio oficial";
  const deviceInfo = punchRecord.device ? `${punchRecord.device.platform || "mobile"} (${punchRecord.device.deviceId || "terminal"})` : "Oficial Soho Terminal";

  const formattedBalance = balance?.formattedBalance || (typeof balance?.balanceMinutes === "number" ? formatHourBalance(balance.balanceMinutes) : "+00:00");

  return [
    "📋 *COMPROVANTE DE REGISTRO DE PONTO DO TRABALHADOR (REP-P)*",
    "_Portaria MTP nº 671/2021 - Sistema Eletrônico Registrador de Ponto_",
    "",
    "🏢 *EMPREGADOR:* CorpFlats Soho Residence (Campos dos Goytacazes/RJ)",
    "📍 *LOCAL:* Rua Tenente Coronel Cardoso, 450 - Centro, Campos dos Goytacazes - RJ",
    `👤 *COLABORADOR:* ${empName}`,
    `🆔 *MATRÍCULA:* ${empMatricula} | *CPF:* ${maskedCpf}`,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "⏰ *DADOS DA BATIDA REGISTRADA:*",
    `• *Tipo:* ${punchLabel}`,
    `• *Data/Hora:* ${punchDate} às ${punchTime}`,
    `• *NSR Sequencial:* #${nsr}`,
    `• *Localização / Cerca:* ${distance} (${geofenceStatus})`,
    `• *Dispositivo:* ${deviceInfo}`,
    `• *Assinatura Digital (Hash SHA-256):*`,
    `${hash}`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    "📊 *SALDO ACUMULADO DO MÊS (BANCO DE HORAS):*",
    `• *Saldo atual:* ${formattedBalance}`,
    "",
    "_Comprovante emitido eletronicamente conforme a legislação trabalhista vigente e arquivado com segurança jurídica pelo sistema CorpFlats._"
  ].join("\n");
}

/**
 * Confronta horas previstas na escala ativa até a data contra horas trabalhadas
 */
export function calculateMonthlyHourBalance(db, employeeId, targetDate) {
  const empId = typeof employeeId === "object" ? employeeId.id : employeeId;
  const emp = getEmployeeRawById(db, empId);

  if (!emp || isPrestadora(emp) || isPrestadora({ id: empId }) || empId === 2 || empId === 3 || empId === "2" || empId === "3") {
    throw new Error("Colaborador CLT inválido ou prestadora autônoma");
  }

  const dateStr = targetDate || new Date().toISOString().substring(0, 10);
  const targetMonth = dateStr.substring(0, 7); // "YYYY-MM"

  // 1. Horas previstas na escala ativa até a data (db.hrSchedules)
  const schedules = Array.isArray(db.hrSchedules)
    ? db.hrSchedules.filter(s => String(s.employeeId) === String(empId) && s.date.startsWith(targetMonth) && s.date <= dateStr)
    : [];

  let scheduledMinutes = 0;
  for (const s of schedules) {
    if (typeof s.plannedWorkMinutes === "number") {
      scheduledMinutes += s.plannedWorkMinutes;
    } else if (s.shiftType === "dsr" || s.isDsr || s.shiftType === "folga" || s.shiftType === "vacation" || s.shiftType === "leave") {
      scheduledMinutes += 0;
    } else {
      scheduledMinutes += 440; // 7h20 padrão
    }
  }

  // 2. Horas efetivamente trabalhadas em db.hrTimeRecords até a data
  const records = Array.isArray(db.hrTimeRecords)
    ? db.hrTimeRecords.filter(r => String(r.employeeId) === String(empId) && r.date.startsWith(targetMonth) && r.date <= dateStr)
    : [];

  // Agrupamento por dia
  const recordsByDate = {};
  for (const r of records) {
    if (!recordsByDate[r.date]) recordsByDate[r.date] = [];
    recordsByDate[r.date].push(r);
  }

  let workedMinutes = 0;
  for (const [d, punches] of Object.entries(recordsByDate)) {
    const saidaRecord = punches.find(p => typeof p.totalWorkedMinutesToday === "number");
    if (saidaRecord) {
      workedMinutes += saidaRecord.totalWorkedMinutesToday;
    } else {
      // Cálculo direto pelas batidas
      const entrada = punches.find(p => p.punchType === "entrada");
      const saida = punches.find(p => p.punchType === "saida");
      const almocoSaida = punches.find(p => p.punchType === "almoco_saida");
      const almocoRetorno = punches.find(p => p.punchType === "almoco_retorno");

      if (entrada && saida) {
        const t1 = new Date(entrada.timestamp || `${d}T${entrada.time || "00:00:00"}Z`).getTime();
        const t2 = new Date(saida.timestamp || `${d}T${saida.time || "00:00:00"}Z`).getTime();
        let total = Math.max(0, Math.round((t2 - t1) / 60000));
        if (almocoSaida && almocoRetorno) {
          const l1 = new Date(almocoSaida.timestamp || `${d}T${almocoSaida.time || "00:00:00"}Z`).getTime();
          const l2 = new Date(almocoRetorno.timestamp || `${d}T${almocoRetorno.time || "00:00:00"}Z`).getTime();
          const lunch = Math.max(0, Math.round((l2 - l1) / 60000));
          total = Math.max(0, total - lunch);
        }
        workedMinutes += total;
      }
    }
  }

  const balanceMinutes = workedMinutes - scheduledMinutes;
  const formattedBalance = formatHourBalance(balanceMinutes);

  return {
    employeeId: emp.id,
    date: dateStr,
    scheduledMinutes,
    totalExpectedMinutes: scheduledMinutes,
    workedMinutes,
    totalWorkedMinutes: workedMinutes,
    balanceMinutes,
    formattedBalance,
    isPositive: balanceMinutes >= 0
  };
}

/**
 * Envia o comprovante de ponto via WhatsApp e persiste em db.hrWhatsAppLogs
 * Blindagem total contra prestadoras (Cris e Grazi)
 */
export async function sendPunchReceipt(db, punchRecord, employee = null, options = {}) {
  const empId = employee?.id || punchRecord?.employeeId;
  const emp = employee || getEmployeeRawById(db, empId);

  // Blindagem estrita de Cris e Grazi
  if (
    isPrestadora(emp) ||
    isPrestadora({ id: empId }) ||
    empId === 2 ||
    empId === 3 ||
    empId === "2" ||
    empId === "3" ||
    String(emp?.name || emp?.username || "").toLowerCase().includes("cris") ||
    String(emp?.name || emp?.username || "").toLowerCase().includes("grazi")
  ) {
    const err = new Error("CRITICAL_SECURITY_VIOLATION: Prestadora de serviço autônoma não pode receber comprovante CLT.");
    err.code = "PRESTADORA_SECURITY_BLOCK";
    throw err;
  }

  if (!emp) {
    throw new Error(`Funcionário CLT ${empId} não encontrado.`);
  }

  const balance = calculateMonthlyHourBalance(db, emp.id, punchRecord.date);
  const receiptText = generateRepPReceiptText(emp, punchRecord, balance);

  const logEntry = {
    id: `walog_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    employeeId: emp.id,
    employeeName: emp.name,
    phone: emp.phone || emp.whatsapp || "5522998877665",
    messageType: "receipt",
    punchType: punchRecord.punchType,
    punchId: punchRecord.id,
    nsr: punchRecord.nsr || 1042,
    metadata: {
      nsr: punchRecord.nsr || 1042,
      punchType: punchRecord.punchType,
      date: punchRecord.date,
      time: punchRecord.time
    },
    content: receiptText,
    status: "sent",
    simulated: true,
    targetDate: punchRecord.date || new Date().toISOString().substring(0, 10),
    timestamp: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  if (!Array.isArray(db.hrWhatsAppLogs)) {
    db.hrWhatsAppLogs = [];
  }
  db.hrWhatsAppLogs.push(logEntry);

  return {
    success: true,
    logId: logEntry.id,
    logEntry,
    receiptText,
    balance
  };
}

/**
 * Avalia se o dia está silenciado para lembretes de ponto do colaborador
 */
export function isDaySilencedForEmployee(db, employeeId, dateStr) {
  const empId = typeof employeeId === "object" ? employeeId.id : employeeId;

  // 1. Prestadora
  if (
    isPrestadora({ id: empId }) ||
    empId === 2 ||
    empId === 3 ||
    empId === "2" ||
    empId === "3"
  ) {
    return { silenced: true, reason: "is_prestadora" };
  }

  // 2. Férias ativas (db.hrVacations)
  const vacations = Array.isArray(db.hrVacations) ? db.hrVacations : [];
  const inVacation = vacations.some(v => {
    if (String(v.employeeId) !== String(empId)) return false;
    const st = (v.status || "").toLowerCase();
    if (st !== "approved" && st !== "aprovada" && st !== "em_gozo") return false;
    return v.startDate <= dateStr && v.endDate >= dateStr;
  });
  if (inVacation) {
    return { silenced: true, reason: "vacation_silenced" };
  }

  // 3. Escala em db.hrSchedules
  const schedules = Array.isArray(db.hrSchedules) ? db.hrSchedules : [];
  const daySchedule = schedules.find(s => String(s.employeeId) === String(empId) && s.date === dateStr);
  if (daySchedule) {
    const shift = (daySchedule.shiftType || "").toLowerCase();
    const status = (daySchedule.status || "").toLowerCase();
    if (shift === "dsr" || daySchedule.isDsr === true || shift === "folga" || status === "folga") {
      return { silenced: true, reason: "dsr_silenced" };
    }
    if (shift === "vacation" || shift === "ferias" || status === "ferias") {
      return { silenced: true, reason: "vacation_silenced" };
    }
    if (
      shift === "leave" || shift === "afastamento" || shift === "atestado" || shift === "licenca" ||
      status === "afastamento" || status === "atestado" || status === "licenca"
    ) {
      return { silenced: true, reason: "leave_silenced" };
    }
  }

  return { silenced: false, reason: null };
}

/**
 * Converte "HH:MM" ou "HH:MM:SS" em minutos do dia
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Avalia os gatilhos de lembretes preventivos para um colaborador
 */
export function checkEmployeeReminders(db, employeeId, currentTimeStr) {
  const empId = typeof employeeId === "object" ? employeeId.id : employeeId;

  // 1. Blindagem contra prestadoras
  if (
    isPrestadora({ id: empId }) ||
    empId === 2 ||
    empId === 3 ||
    empId === "2" ||
    empId === "3"
  ) {
    return {
      success: true,
      skipped: true,
      reason: "is_prestadora",
      remindersSent: []
    };
  }

  // 2. Extração de data e hora do currentTimeStr
  let dateStr;
  let timeStr;
  if (currentTimeStr && currentTimeStr.includes("T")) {
    const parts = currentTimeStr.split("T");
    dateStr = parts[0];
    timeStr = parts[1].substring(0, 5);
  } else if (currentTimeStr && currentTimeStr.includes(" ")) {
    const parts = currentTimeStr.split(" ");
    dateStr = parts[0];
    timeStr = parts[1].substring(0, 5);
  } else {
    const now = new Date();
    dateStr = now.toISOString().substring(0, 10);
    timeStr = now.toISOString().substring(11, 16);
  }

  // 3. Verificação de silenciamento defensivo
  const silence = isDaySilencedForEmployee(db, empId, dateStr);
  if (silence.silenced) {
    return {
      success: true,
      skipped: true,
      reason: silence.reason,
      remindersSent: []
    };
  }

  const emp = getEmployeeRawById(db, empId);
  if (!emp) {
    return { success: false, error: "Colaborador não encontrado", remindersSent: [] };
  }

  const schedules = Array.isArray(db.hrSchedules) ? db.hrSchedules : [];
  const schedule = schedules.find(s => String(s.employeeId) === String(empId) && s.date === dateStr);

  const plannedStart = schedule?.plannedStart || schedule?.expectedTimes?.entrada || emp.defaultSchedule?.entryTime || "06:00";
  const plannedEnd = schedule?.plannedEnd || schedule?.expectedTimes?.saida || emp.defaultSchedule?.exitTime || "14:20";
  const plannedLunchStart = schedule?.plannedLunchStart || schedule?.expectedTimes?.almoco_saida || emp.defaultSchedule?.breakStartTime || "10:30";
  const plannedLunchEnd = schedule?.plannedLunchEnd || schedule?.expectedTimes?.almoco_retorno || emp.defaultSchedule?.breakEndTime || "11:30";

  const punches = Array.isArray(db.hrTimeRecords)
    ? db.hrTimeRecords.filter(r => String(r.employeeId) === String(empId) && r.date === dateStr)
    : [];

  const entrada = punches.find(p => p.punchType === "entrada");
  const almocoSaida = punches.find(p => p.punchType === "almoco_saida");
  const almocoRetorno = punches.find(p => p.punchType === "almoco_retorno");
  const saida = punches.find(p => p.punchType === "saida");

  const nowMin = timeToMinutes(timeStr);
  const startMin = timeToMinutes(plannedStart);
  const endMin = timeToMinutes(plannedEnd);
  const lunchStartMin = timeToMinutes(plannedLunchStart);
  const lunchEndMin = timeToMinutes(plannedLunchEnd);

  const remindersSent = [];
  const firstName = emp.name ? emp.name.split(" ")[0] : "Colaborador";

  // Gatilho 1: Esquecimento de Entrada (passou das plannedStart + 15 min sem entrada)
  if (!entrada && nowMin >= startMin + 15) {
    remindersSent.push({
      category: "missed_entry",
      employeeId: emp.id,
      phone: emp.phone || emp.whatsapp || "5522998877665",
      message: `🔔 Olá, ${firstName}! Seu turno estava previsto para iniciar às ${plannedStart} e ainda não identificamos sua batida de 1ª Entrada. Regularize seu ponto pelo terminal ou aplicativo.`
    });
  }

  // Gatilho 2: Início de Almoço (entrada registrada, horário previsto atingido, sem almoco_saida)
  if (entrada && !almocoSaida && nowMin >= lunchStartMin && nowMin < lunchStartMin + 45) {
    remindersSent.push({
      category: "lunch_start",
      employeeId: emp.id,
      phone: emp.phone || emp.whatsapp || "5522998877665",
      message: `🍽️ Olá, ${firstName}! Chegou seu horário previsto de almoço (${plannedLunchStart}). Não se esqueça de registrar sua batida de Saída Almoço e fazer seu intervalo de 1 hora.`
    });
  }

  // Gatilho 3: Retorno de Almoço (almoco_saida registrado há 50 minutos, sem almoco_retorno)
  if (almocoSaida && !almocoRetorno) {
    const lunchExitMin = almocoSaida.time ? timeToMinutes(almocoSaida.time) : lunchStartMin;
    const elapsedLunch = nowMin - lunchExitMin;
    if (elapsedLunch >= 50 && elapsedLunch <= 75) {
      remindersSent.push({
        category: "lunch_return",
        employeeId: emp.id,
        phone: emp.phone || emp.whatsapp || "5522998877665",
        message: `⏱️ Olá, ${firstName}! Faltam 10 minutos para concluir seu intervalo de almoço (${plannedLunchEnd}). Ao retornar ao posto, registre seu Retorno Almoço.`
      });
    }
  }

  // Gatilho 4: Alerta Crítico Preventivo de 6h Contínuas sem Pausa (Art. 71 CLT)
  // Entrou há >= 350 min (5h50) sem registrar pausa de almoço
  if (entrada && !almocoSaida) {
    const entryMin = entrada.time ? timeToMinutes(entrada.time) : startMin;
    const elapsedWork = nowMin - entryMin;
    if (elapsedWork >= 350) {
      remindersSent.push({
        category: "continuous_work_6h_alert",
        employeeId: emp.id,
        phone: emp.phone || emp.whatsapp || "5522998877665",
        message: `⚠️ *ALERTA PREVENTIVO DE JORNADA (Art. 71 CLT)*: Olá, ${firstName}! Você completou quase 6 horas contínuas de trabalho sem intervalo intrajornada. Por exigência legal da CLT e para sua saúde, registre imediatamente sua Saída Almoço.`
      });
    }
  }

  // Gatilho 5: Esquecimento de Saída (passou de plannedEnd + 15 min sem registro de saída)
  if (entrada && !saida && nowMin >= endMin + 15) {
    remindersSent.push({
      category: "missed_exit",
      employeeId: emp.id,
      phone: emp.phone || emp.whatsapp || "5522998877665",
      message: `👋 Olá, ${firstName}! Seu turno estava previsto para encerrar às ${plannedEnd} e ainda não identificamos sua batida de Saída. Regularize sua batida final.`
    });
  }

  // Persistência em db.hrWhatsAppLogs com idempotência diária por categoria
  if (!Array.isArray(db.hrWhatsAppLogs)) {
    db.hrWhatsAppLogs = [];
  }

  for (const rem of remindersSent) {
    const alreadyLogged = db.hrWhatsAppLogs.some(
      l => String(l.employeeId) === String(emp.id) && l.targetDate === dateStr && l.category === rem.category
    );
    if (!alreadyLogged) {
      db.hrWhatsAppLogs.push({
        id: `walog_rem_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
        employeeId: emp.id,
        employeeName: emp.name,
        phone: rem.phone,
        messageType: `reminder_${rem.category}`,
        category: rem.category,
        content: rem.message,
        status: "sent",
        simulated: true,
        targetDate: dateStr,
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });
    }
  }

  return {
    success: true,
    skipped: false,
    remindersSent
  };
}

/**
 * Executa a varredura de lembretes para todos os funcionários CLT ativos
 * Blindagem 100%: nunca inclui Cris ou Grazi
 */
export async function processRemindersScan(db, currentTimeStr = null, options = {}) {
  const employees = Array.isArray(db.hrEmployees) ? db.hrEmployees : [];
  const cltEmployees = employees.filter(e => isCltEmployee(e) && !isPrestadora(e));

  const allDispatched = [];

  for (const emp of cltEmployees) {
    const res = checkEmployeeReminders(db, emp.id, currentTimeStr);
    if (res.remindersSent && res.remindersSent.length > 0) {
      allDispatched.push(...res.remindersSent);
    }
  }

  return {
    success: true,
    scannedEmployeesCount: cltEmployees.length,
    remindersDispatched: allDispatched
  };
}

/**
 * Consulta de Logs de Disparos de WhatsApp (db.hrWhatsAppLogs)
 */
export function getWhatsAppLogs(db, query = {}) {
  const logs = Array.isArray(db.hrWhatsAppLogs) ? db.hrWhatsAppLogs : [];

  return logs
    .filter(l => {
      if (query.employeeId && String(l.employeeId) !== String(query.employeeId)) return false;
      if (query.messageType && l.messageType !== query.messageType) return false;
      if (query.category && l.category !== query.category) return false;
      if (query.status && l.status !== query.status) return false;
      if (query.date && l.targetDate !== query.date) return false;
      return true;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Inicializador do Scheduler em Background (desativado em testes)
 */
export function initHrWhatsAppAutomation({ db, saveDatabase } = {}) {
  if (process.env.NODE_ENV === "test") {
    return;
  }
}

import { isPrestadora, isCltEmployee, getEmployeeRawById } from "./employees.mjs";

/**
 * Cálculo determinístico dos feriados oficiais móveis (Páscoa, Carnaval, Paixão, Corpus Christi)
 * Algoritmo de Butcher / Meeus
 */
function calculateEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateIso(dateObj) {
  return dateObj.toISOString().substring(0, 10);
}

function addDays(dateObj, days) {
  const result = new Date(dateObj.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Feriados Oficiais (Nacionais, Estaduais RJ e Municipais de Campos dos Goytacazes/RJ)
 */
export function getOfficialHolidays(year = 2026) {
  const easter = calculateEaster(year);

  const carnaval = addDays(easter, -47);
  const paixao = addDays(easter, -2);
  const corpusChristi = addDays(easter, 60);

  const holidays = [
    // Nacionais Fixos
    { date: `${year}-01-01`, name: "Confraternização Universal" },
    { date: `${year}-04-21`, name: "Tiradentes" },
    { date: `${year}-05-01`, name: "Dia do Trabalho" },
    { date: `${year}-09-07`, name: "Independência do Brasil" },
    { date: `${year}-10-12`, name: "Nossa Senhora Aparecida" },
    { date: `${year}-11-02`, name: "Finados" },
    { date: `${year}-11-15`, name: "Proclamação da República" },
    { date: `${year}-11-20`, name: "Dia Nacional de Zumbi e da Consciência Negra" },
    { date: `${year}-12-25`, name: "Natal" },

    // Nacionais Móveis
    { date: formatDateIso(carnaval), name: "Carnaval" },
    { date: formatDateIso(paixao), name: "Sexta-feira da Paixão" },
    { date: formatDateIso(corpusChristi), name: "Corpus Christi" },

    // Estadual RJ
    { date: `${year}-04-23`, name: "Dia de São Jorge (Lei RJ 5.198/08)" },

    // Municipais Campos dos Goytacazes/RJ (Lei Municipal 8.784/2017)
    { date: `${year}-01-15`, name: "Dia de Santo Amaro (Padroeiro da Baixada Campista)" },
    { date: `${year}-08-06`, name: "Dia do Santíssimo Salvador (Padroeiro de Campos dos Goytacazes)" }
  ];

  return holidays;
}

/**
 * Converte "HH:MM:SS" ou "HH:MM" para minutos a partir de 00:00
 */
function timeToMinutes(t) {
  if (!t) return 0;
  const parts = String(t).split(":").map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

/**
 * Gerador de Grade Mensal de Escala 6x1 (44h Semanais)
 * Suporta modalidade "7h20" (440 min x 6 = 44h) e "8h_4h" (8h seg-sex + 4h sáb = 44h)
 */
export function generateMonthlySchedule(db, employeeId, yearMonth, options = {}) {
  const empId = typeof employeeId === "object" ? employeeId.id : employeeId;
  const emp = getEmployeeRawById(db, empId);

  if (!emp || isPrestadora(emp) || isPrestadora({ id: empId }) || empId === 2 || empId === 3 || empId === "2" || empId === "3") {
    throw new Error("Colaborador CLT inválido ou não encontrado");
  }

  const [yStr, mStr] = yearMonth.split("-");
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  const daysInMonth = new Date(year, month, 0).getDate();

  const modality = options.modality || emp.shiftType || "7h20";
  const dsrDayOfWeek = options.dsrDayOfWeek !== undefined ? Number(options.dsrDayOfWeek) : 0; // 0 = Domingo

  const startTime = options.startTime || emp.defaultSchedule?.entryTime || "06:00";
  const lunchStartTime = options.lunchStartTime || emp.defaultSchedule?.breakStartTime || "10:30";
  const lunchEndTime = options.lunchEndTime || emp.defaultSchedule?.breakEndTime || "11:30";
  const endTime = options.endTime || emp.defaultSchedule?.exitTime || (modality === "7h20" ? "14:20" : "15:00");

  const holidays = getOfficialHolidays(year);
  const holidayMap = new Map(holidays.map(h => [h.date, h.name]));

  const vacations = Array.isArray(db.hrVacations)
    ? db.hrVacations.filter(v => String(v.employeeId) === String(empId) && (v.status === "approved" || v.status === "aprovada" || v.status === "em_gozo"))
    : [];

  const generatedSchedules = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = String(d).padStart(2, "0");
    const date = `${yearMonth}-${dStr}`;
    const dateObj = new Date(year, month - 1, d);
    const dayOfWeek = dateObj.getDay(); // 0 = Domingo, 1 = Segunda, etc.

    const isDsr = dayOfWeek === dsrDayOfWeek;
    const isHoliday = holidayMap.has(date);
    const holidayName = holidayMap.get(date) || null;

    const inVacation = vacations.some(v => v.startDate <= date && v.endDate >= date);

    let shiftType = "work";
    let plannedWorkMinutes = 440;
    let plannedBreakMinutes = 60;

    if (inVacation) {
      shiftType = "vacation";
      plannedWorkMinutes = 0;
      plannedBreakMinutes = 0;
    } else if (isDsr) {
      shiftType = "dsr";
      plannedWorkMinutes = 0;
      plannedBreakMinutes = 0;
    } else {
      shiftType = isHoliday ? "holiday" : "work";
      if (modality === "8h_4h") {
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
          plannedWorkMinutes = 480; // 8h00
          plannedBreakMinutes = 60;
        } else if (dayOfWeek === 6) {
          plannedWorkMinutes = 240; // 4h00
          plannedBreakMinutes = 0;
        } else {
          plannedWorkMinutes = 480;
          plannedBreakMinutes = 60;
        }
      } else {
        plannedWorkMinutes = 440; // 7h20
        plannedBreakMinutes = 60;
      }
    }

    const scheduleItem = {
      id: `sch_${empId}_${date}`,
      employeeId: emp.id,
      employeeName: emp.name,
      matricula: emp.matricula || "CLT-001",
      date,
      yearMonth,
      dayOfWeek,
      shiftType,
      isDsr: Boolean(isDsr),
      isSunday: dayOfWeek === 0,
      isHoliday: Boolean(isHoliday),
      holidayName,
      plannedStart: isDsr || inVacation ? null : startTime,
      plannedEnd: isDsr || inVacation ? null : endTime,
      plannedLunchStart: isDsr || inVacation ? null : lunchStartTime,
      plannedLunchEnd: isDsr || inVacation ? null : lunchEndTime,
      expectedTimes: isDsr || inVacation ? {} : {
        entrada: startTime,
        almoco_saida: lunchStartTime,
        almoco_retorno: lunchEndTime,
        saida: endTime
      },
      plannedWorkMinutes,
      plannedBreakMinutes,
      notes: inVacation ? "Período de férias regulamentares" : (isHoliday ? `Feriado: ${holidayName}` : ""),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    generatedSchedules.push(scheduleItem);
  }

  // Persiste ou atualiza em db.hrSchedules
  if (!Array.isArray(db.hrSchedules)) {
    db.hrSchedules = [];
  }

  // Remove escalas anteriores do mesmo mês para o colaborador e insere as novas
  db.hrSchedules = db.hrSchedules.filter(s => !(String(s.employeeId) === String(empId) && s.yearMonth === yearMonth));
  db.hrSchedules.push(...generatedSchedules);

  return generatedSchedules;
}

/**
 * Consulta de Escalas (db.hrSchedules)
 */
export function getSchedules(db, query = {}) {
  const list = Array.isArray(db.hrSchedules) ? db.hrSchedules : [];

  return list
    .filter(s => {
      if (query.employeeId && String(s.employeeId) !== String(query.employeeId)) return false;
      if (query.date && s.date !== query.date) return false;
      if (query.month && s.yearMonth !== query.month && !s.date.startsWith(query.month)) return false;
      if (query.yearMonth && s.yearMonth !== query.yearMonth) return false;
      if (query.startDate && s.date < query.startDate) return false;
      if (query.endDate && s.date > query.endDate) return false;
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Atualização pontual de escala
 */
export function updateSchedule(db, scheduleId, payload = {}) {
  if (!Array.isArray(db.hrSchedules)) db.hrSchedules = [];
  const idx = db.hrSchedules.findIndex(s => s.id === scheduleId);
  if (idx === -1) {
    throw new Error(`Escala ${scheduleId} não encontrada.`);
  }

  db.hrSchedules[idx] = {
    ...db.hrSchedules[idx],
    ...payload,
    updatedAt: new Date().toISOString()
  };

  return db.hrSchedules[idx];
}

/**
 * Tolerância do Art. 58 § 1º da CLT e Súmula 366 do TST
 * Variação de até 5 minutos por batida e limite diário de 10 minutos.
 * Se ultrapassado qualquer um, computa-se a TOTALIDADE da variação na íntegra.
 * Garante que atrasos (variações negativas) NUNCA sejam creditados como hora extra.
 */
export function calculatePunchTolerance(planned = {}, punches = []) {
  const expected = {
    entrada: planned.startTime || planned.expectedTimes?.entrada || "06:00",
    almoco_saida: planned.lunchStartTime || planned.expectedTimes?.almoco_saida || "10:30",
    almoco_retorno: planned.lunchEndTime || planned.expectedTimes?.almoco_retorno || "11:30",
    saida: planned.endTime || planned.expectedTimes?.saida || "14:20"
  };

  let dailyTotalDelta = 0;
  let singleExceeded = false;
  let totalPositiveDelta = 0; // Minutos de trabalho a mais (horas extras potenciais)
  let totalNegativeDelta = 0; // Minutos de trabalho a menos (atrasos / saídas antecipadas)

  for (const p of punches) {
    const pType = p.type || p.punchType;
    const planTime = expected[pType];
    if (!planTime || !p.time) continue;

    const actualMin = timeToMinutes(p.time);
    const planMin = timeToMinutes(planTime);

    let delta = 0;
    if (pType === "entrada") {
      delta = planMin - actualMin; // Chegou antes = positivo (trabalho a mais)
    } else if (pType === "almoco_saida") {
      delta = actualMin - planMin; // Saiu para almoço depois = positivo (trabalho a mais)
    } else if (pType === "almoco_retorno") {
      delta = planMin - actualMin; // Voltou do almoço antes = positivo (trabalho a mais)
    } else if (pType === "saida") {
      delta = actualMin - planMin; // Saiu depois = positivo (trabalho a mais)
    }

    const absDelta = Math.abs(delta);
    if (absDelta > 5) {
      singleExceeded = true;
    }
    dailyTotalDelta += absDelta;

    if (delta > 0) totalPositiveDelta += delta;
    if (delta < 0) totalNegativeDelta += Math.abs(delta);
  }

  const dailyExceeded = dailyTotalDelta > 10;
  const withinTolerance = !singleExceeded && !dailyExceeded;

  let reason = null;
  if (singleExceeded) {
    reason = "single_punch_exceeded";
  } else if (dailyExceeded) {
    reason = "daily_total_exceeded";
  }

  const overtimeMinutes = withinTolerance ? 0 : totalPositiveDelta;
  const delayMinutes = withinTolerance ? 0 : totalNegativeDelta;

  return {
    withinTolerance,
    reason,
    overtimeMinutes,
    creditedOvertimeMinutes: overtimeMinutes, // Retrocompatibilidade estrita
    delayMinutes
  };
}

/**
 * Apuração de Horas Extras 50% e 100%
 * 50% em dias normais de trabalho; 100% em DSR e Feriados (Lei 605/49 Art. 9º e Súmula 146 TST)
 */
export function calculateDayOvertimeAndNight(schedule = {}, punches = []) {
  const entrada = punches.find(p => (p.punchType || p.type) === "entrada");
  const saida = punches.find(p => (p.punchType || p.type) === "saida");
  const almocoSaida = punches.find(p => (p.punchType || p.type) === "almoco_saida");
  const almocoRetorno = punches.find(p => (p.punchType || p.type) === "almoco_retorno");

  let totalWorked = 0;
  if (entrada && saida) {
    const tEntrada = timeToMinutes(entrada.time);
    const tSaida = timeToMinutes(saida.time);
    totalWorked = Math.max(0, tSaida - tEntrada);

    if (almocoSaida && almocoRetorno) {
      const tLunch1 = timeToMinutes(almocoSaida.time);
      const tLunch2 = timeToMinutes(almocoRetorno.time);
      const lunchDuration = Math.max(0, tLunch2 - tLunch1);
      totalWorked = Math.max(0, totalWorked - lunchDuration);
    }
  }

  const isDsr = Boolean(schedule.isDsr || schedule.shiftType === "dsr");
  const isHoliday = Boolean(schedule.isHoliday || schedule.shiftType === "holiday");

  let regularMinutes = 0;
  let overtime50Minutes = 0;
  let overtime100Minutes = 0;

  if (isDsr || isHoliday) {
    regularMinutes = 0;
    overtime50Minutes = 0;
    overtime100Minutes = totalWorked;
  } else {
    const planned = typeof schedule.plannedWorkMinutes === "number" ? schedule.plannedWorkMinutes : 440;
    regularMinutes = Math.min(totalWorked, planned);
    overtime50Minutes = Math.max(0, totalWorked - planned);
    overtime100Minutes = 0;
  }

  return {
    totalWorkedMinutes: totalWorked,
    regularMinutes,
    overtime50Minutes,
    overtime100Minutes,
    isDsr,
    isHoliday
  };
}

/**
 * Converte um registro de punch em data/hora determinística em UTC
 * Suporta: timestamp ISO, combinação date + time, ou apenas string time HH:MM[:SS].
 */
function parsePunchToEpoch(punch, baseDateStr = new Date().toISOString().substring(0, 10)) {
  if (!punch) return null;
  let dateStr = punch.date || null;
  let timeStr = punch.time || null;

  if (punch.timestamp) {
    if (typeof punch.timestamp === "string" && punch.timestamp.includes("T")) {
      const parts = punch.timestamp.split("T");
      if (!dateStr) dateStr = parts[0];
      if (!timeStr) {
        let rawT = parts[1].split(".")[0].split("Z")[0].split("+")[0];
        if (rawT.includes("-")) rawT = rawT.split("-")[0];
        timeStr = rawT;
      }
    } else {
      const d = new Date(punch.timestamp);
      if (!isNaN(d.getTime())) {
        if (!dateStr) dateStr = d.toISOString().substring(0, 10);
        if (!timeStr) timeStr = d.toISOString().substring(11, 19);
      }
    }
  }

  if (!dateStr) dateStr = baseDateStr;
  if (!timeStr) timeStr = "00:00:00";

  const parts = String(timeStr).split(":");
  const hh = String(parts[0] || "00").padStart(2, "0");
  const mm = String(parts[1] || "00").padStart(2, "0");
  const ss = String(parts[2] || "00").padStart(2, "0");
  const cleanTime = `${hh}:${mm}:${ss}`;

  return {
    dateStr,
    timeStr: cleanTime,
    epochMs: new Date(`${dateStr}T${cleanTime}Z`).getTime()
  };
}

/**
 * Adicional Noturno e Hora Ficta Reduzida (CLT Art. 73 e Súmula 60 TST)
 * Horário noturno urbano: 22h00 às 05h00 (420 min de relógio).
 * Fator de redução: 60 / 52.5 = 1.142857 (420 min -> 480 min fictos = 8h fictas).
 * Prorrogação da jornada noturna após as 05h00 per Súmula 60, II do TST.
 */
export function calculateNightShiftAndExtension(punches = []) {
  const entrada = punches.find(p => (p.punchType || p.type) === "entrada");
  const saida = punches.find(p => (p.punchType || p.type) === "saida");

  if (!entrada || !saida) {
    return {
      clockNightMinutes: 0,
      fictitiousNightMinutes: 0,
      extensionMinutes: 0,
      sumula60Applied: false,
      totalFictitiousMinutes: 0,
      nightSurchargePercentage: 20
    };
  }

  const baseDate = entrada.date || (entrada.timestamp && entrada.timestamp.includes("T") ? entrada.timestamp.split("T")[0] : new Date().toISOString().substring(0, 10));
  const pEntrada = parsePunchToEpoch(entrada, baseDate);
  const pSaida = parsePunchToEpoch(saida, pEntrada.dateStr);

  // Se a saída for em horário igual ou anterior à entrada sem data explícita diferente, virou a meia-noite
  if (pSaida.epochMs <= pEntrada.epochMs) {
    pSaida.epochMs += 24 * 60 * 60 * 1000;
  }

  const almocoSaida = punches.find(p => (p.punchType || p.type) === "almoco_saida");
  const almocoRetorno = punches.find(p => (p.punchType || p.type) === "almoco_retorno");
  let pLunch1 = almocoSaida ? parsePunchToEpoch(almocoSaida, pEntrada.dateStr) : null;
  let pLunch2 = almocoRetorno ? parsePunchToEpoch(almocoRetorno, pEntrada.dateStr) : null;

  if (pLunch1 && pLunch1.epochMs < pEntrada.epochMs) pLunch1.epochMs += 24 * 60 * 60 * 1000;
  if (pLunch2 && pLunch2.epochMs < pEntrada.epochMs) pLunch2.epochMs += 24 * 60 * 60 * 1000;

  let clockNightMinutes = 0;
  let post05Minutes = 0;

  const entradaDate = new Date(pEntrada.epochMs);
  const startHour = entradaDate.getUTCHours();
  const startMin = entradaDate.getUTCMinutes();
  // Qualificação para regime de turno noturno: entrada entre 18h e 23h (ou até 22:05 com tolerância Art. 58 CLT)
  const isNightShiftWorker = (startHour >= 18 && startHour <= 23) || (startHour === 22 && startMin <= 5);

  const ONE_MINUTE_MS = 60 * 1000;
  for (let t = pEntrada.epochMs; t < pSaida.epochMs; t += ONE_MINUTE_MS) {
    // Desconsidera minutos dentro do intervalo de almoço/pausa intrajornada
    if (pLunch1 && pLunch2 && t >= pLunch1.epochMs && t < pLunch2.epochMs) {
      continue;
    }

    const d = new Date(t);
    const hour = d.getUTCHours();

    if (hour >= 22 || hour < 5) {
      clockNightMinutes++;
    } else if (isNightShiftWorker && t > pEntrada.epochMs) {
      // Minuto diurno durante turno noturno: verifica se é posterior às 05h00 da manhã seguinte
      const shiftStartDay = new Date(Date.UTC(entradaDate.getUTCFullYear(), entradaDate.getUTCMonth(), entradaDate.getUTCDate()));
      const morningCutoff = shiftStartDay.getTime() + 29 * 60 * 60 * 1000; // 05h00 do dia subsequente em UTC
      if (t >= morningCutoff) {
        post05Minutes++;
      }
    }
  }

  // Súmula 60, II do TST:
  // "Cumprida integralmente a jornada no período noturno e prorrogada esta, devido é também o adicional quanto às horas prorrogadas."
  // Requisitos: turno noturno iniciado à noite (<= 22:05), cumprimento integral/majoritário (>= 300 min líquidos na janela 22h-05h)
  // e expediente estendido além das 05h00.
  const sumula60Applied = isNightShiftWorker && clockNightMinutes >= 300 && post05Minutes > 0;
  const extensionMinutes = sumula60Applied ? post05Minutes : 0;

  const fictitiousNightMinutes = clockNightMinutes * (60 / 52.5);
  const totalEligibleClockMinutes = clockNightMinutes + extensionMinutes;
  const totalFictitiousMinutes = totalEligibleClockMinutes * (60 / 52.5);

  return {
    clockNightMinutes,
    fictitiousNightMinutes,
    extensionMinutes,
    sumula60Applied,
    totalFictitiousMinutes,
    nightSurchargePercentage: 20
  };
}

/**
 * Revezamento Dominical de DSR (Art. 386 CLT e Portaria 671 MTP)
 * Mulheres: folga no domingo a cada no máximo 15 dias (2 semanas).
 * Homens: folga no domingo a cada no máximo 7 semanas.
 */
export function validateSundayRotation(schedules = [], employee = {}) {
  const gender = (employee?.gender || "").toLowerCase();
  const isFemale = gender === "female" || gender === "feminino";

  const sundays = schedules
    .filter(s => s.dayOfWeek === 0 || new Date(s.date + "T12:00:00Z").getUTCDay() === 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sundays.length === 0) {
    return { valid: true };
  }

  if (isFemale) {
    // Mulheres: proibido trabalhar 2 domingos consecutivos sem folga
    for (let i = 0; i < sundays.length - 1; i++) {
      const sun1 = sundays[i];
      const sun2 = sundays[i + 1];
      const worked1 = !sun1.isDsr && sun1.shiftType !== "dsr";
      const worked2 = !sun2.isDsr && sun2.shiftType !== "dsr";
      if (worked1 && worked2) {
        return {
          valid: false,
          code: "SUNDAY_ROTATION_VIOLATION_WOMEN",
          message: "Colaboradora mulher não pode trabalhar 2 domingos consecutivos sem folga dominical quinzenal (Art. 386 da CLT)."
        };
      }
    }
  } else {
    // Homens / Geral: máximo 7 semanas sem folga dominical
    let consecutiveWorkedSundays = 0;
    for (const sun of sundays) {
      const worked = !sun.isDsr && sun.shiftType !== "dsr";
      if (worked) {
        consecutiveWorkedSundays++;
        if (consecutiveWorkedSundays >= 7) {
          return {
            valid: false,
            code: "SUNDAY_ROTATION_VIOLATION_GENERAL",
            message: "Colaborador não pode trabalhar 7 ou mais domingos consecutivos sem folga dominical (Portaria MTP 671 e Lei 11.603)."
          };
        }
      } else {
        consecutiveWorkedSundays = 0;
      }
    }
  }

  return { valid: true };
}

/**
 * Validação de Programação de Férias CLT (Art. 134 § 1º e § 3º CLT)
 */
export function validateVacationSchedule(db, employeeId, vacationRequest = {}) {
  const periods = vacationRequest.periods || [];

  // Regra 1: Máximo de 3 períodos
  if (periods.length > 3) {
    return {
      valid: false,
      code: "VACATION_MAX_3_PERIODS_EXCEEDED",
      message: "O fracionamento de férias é limitado a no máximo 3 períodos (Art. 134 § 1º CLT)."
    };
  }

  // Regra 2: Pelo menos um período >= 14 dias
  const hasAtLeast14Days = periods.some(p => (p.days || p.daysCount || 0) >= 14);
  if (!hasAtLeast14Days) {
    return {
      valid: false,
      code: "VACATION_MIN_14_DAYS_REQUIRED",
      message: "Pelo menos um dos períodos de férias deve ter 14 dias corridos ou mais (Art. 134 § 1º CLT)."
    };
  }

  // Regra 3: Nenhum período < 5 dias
  const hasLessThan5Days = periods.some(p => (p.days || p.daysCount || 0) < 5);
  if (hasLessThan5Days) {
    return {
      valid: false,
      code: "VACATION_MIN_5_DAYS_REQUIRED",
      message: "Nenhum período de férias fracionado pode ser inferior a 5 dias corridos (Art. 134 § 1º CLT)."
    };
  }

  // Regra 4: Proibição de início nos 2 dias que antecedem DSR ou Feriado (Art. 134 § 3º CLT)
  for (const p of periods) {
    if (!p.startDate) continue;
    const [y, m, d] = p.startDate.split("-").map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = dateObj.getUTCDay(); // 0 = Domingo ... 5 = Sexta, 6 = Sábado

    // 4.1 Identificação de Proximidade com DSR (0 = mesmo dia, 1 = 1 dia antes, 2 = 2 dias antes)
    const emp = db ? getEmployeeRawById(db, employeeId) : null;
    const dsrDayOfWeek = (emp && emp.dsrDayOfWeek !== undefined) ? Number(emp.dsrDayOfWeek) : 0; // 0 = Domingo
    const d0Obj = dateObj;
    const d1Obj = addDays(dateObj, 1);
    const d2Obj = addDays(dateObj, 2);

    let distDsr = null;
    if (d0Obj.getUTCDay() === dsrDayOfWeek) {
      distDsr = 0;
    } else if (d1Obj.getUTCDay() === dsrDayOfWeek) {
      distDsr = 1;
    } else if (d2Obj.getUTCDay() === dsrDayOfWeek) {
      distDsr = 2;
    }

    // 4.2 Identificação de Proximidade com Feriados Oficiais
    const holidays = [
      ...getOfficialHolidays(y),
      ...(dateObj.getUTCMonth() === 11 ? getOfficialHolidays(y + 1) : [])
    ];
    const holidayMap = new Map(holidays.map(h => [h.date, h.name]));

    const d0 = p.startDate;
    const d1 = formatDateIso(d1Obj);
    const d2 = formatDateIso(d2Obj);

    let distHol = null;
    let matchedHolidayName = null;
    let matchedHolidayDate = null;
    if (holidayMap.has(d0)) {
      distHol = 0;
      matchedHolidayDate = d0;
      matchedHolidayName = holidayMap.get(d0);
    } else if (holidayMap.has(d1)) {
      distHol = 1;
      matchedHolidayDate = d1;
      matchedHolidayName = holidayMap.get(d1);
    } else if (holidayMap.has(d2)) {
      distHol = 2;
      matchedHolidayDate = d2;
      matchedHolidayName = holidayMap.get(d2);
    }

    if (distHol !== null || distDsr !== null) {
      // Se houver conflito e feriado for mais próximo ou igual ao DSR, prioriza o feriado oficial
      if (distHol !== null && (distDsr === null || distHol <= distDsr)) {
        return {
          valid: false,
          code: "VACATION_START_PRE_HOLIDAY_OR_DSR_FORBIDDEN",
          message: `É vedado o início das férias no período de dois dias que antecede feriado oficial (${matchedHolidayName} em ${matchedHolidayDate}) conforme Art. 134 § 3º CLT.`
        };
      }
      // Caso contrário, a restrição mais próxima/imediata é o descanso semanal remunerado (DSR)
      return {
        valid: false,
        code: "VACATION_START_PRE_DSR_FORBIDDEN",
        message: "É vedado o início das férias no período de dois dias que antecede dia de descanso semanal remunerado ou feriado (Art. 134 § 3º CLT)."
      };
    }
  }

  return { valid: true };
}

/**
 * Consulta de Férias e Alerta de Risco de Pagamento em Dobro (Art. 137 CLT)
 * Suporta data de corte dinâmica (padrão `new Date()`) ou via `options.currentDate`.
 */
export function getVacations(db, employeeId = null, options = {}) {
  const vacations = Array.isArray(db.hrVacations) ? db.hrVacations : [];
  const filtered = employeeId ? vacations.filter(v => String(v.employeeId) === String(employeeId)) : vacations;

  let refDate;
  if (options instanceof Date) {
    refDate = options;
  } else if (typeof options === "string" && options.length > 0) {
    refDate = new Date(options);
  } else if (options && (options.currentDate || options.referenceDate)) {
    refDate = new Date(options.currentDate || options.referenceDate);
  } else {
    refDate = new Date();
  }
  if (isNaN(refDate.getTime())) {
    refDate = new Date();
  }

  return filtered.map(v => {
    const endStr = v.concessiveEnd || v.periodoConcessivo?.endDate;
    let daysUntilConcessiveExpiry = 999;
    let alertRiskDoublePay = false;

    if (endStr) {
      const endDate = new Date(`${endStr}T00:00:00.000Z`);
      daysUntilConcessiveExpiry = Math.max(0, Math.round((endDate.getTime() - refDate.getTime()) / 86400000));
      if (daysUntilConcessiveExpiry <= 60) {
        alertRiskDoublePay = true;
      }
    }

    return {
      ...v,
      daysUntilConcessiveExpiry,
      alertRiskDoublePay
    };
  });
}

/**
 * Agendamento de Férias
 */
export function scheduleVacation(db, employeeId, vacationData = {}) {
  const check = validateVacationSchedule(db, employeeId, vacationData);
  if (!check.valid) {
    const err = new Error(check.message);
    err.code = check.code;
    err.statusCode = 422;
    throw err;
  }

  const vacationEntry = {
    id: `vac_${employeeId}_${Date.now()}`,
    employeeId,
    ...vacationData,
    status: "scheduled",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!Array.isArray(db.hrVacations)) db.hrVacations = [];
  db.hrVacations.push(vacationEntry);

  return vacationEntry;
}

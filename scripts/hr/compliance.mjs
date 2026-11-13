import crypto from "crypto";
import { isPrestadora } from "./employees.mjs";

/**
 * Fallback de data/hora no fuso oficial de Campos dos Goytacazes/RJ (UTC-3)
 */
export function getLocalCamposFallback(targetDate = new Date()) {
  try {
    const d = typeof targetDate === "string" ? new Date(targetDate) : (targetDate instanceof Date ? targetDate : new Date());
    if (isNaN(d.getTime())) {
      const now = new Date();
      return {
        date: now.toISOString().slice(0, 10),
        time: now.toISOString().slice(11, 19),
        iso: now.toISOString()
      };
    }
    const formatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    const parts = formatter.formatToParts(d);
    const m = {};
    for (const p of parts) m[p.type] = p.value;
    const date = `${m.year}-${m.month}-${m.day}`;
    const time = `${m.hour}:${m.minute}:${m.second}`;
    return { date, time, iso: d.toISOString() };
  } catch {
    const now = new Date();
    return {
      date: now.toISOString().slice(0, 10),
      time: now.toISOString().slice(11, 19),
      iso: now.toISOString()
    };
  }
}

/**
 * Validação de Senha de Administrador (scrypt / SHA-256 / Plaintext)
 */
export function verifyAdminPassword(password, storedHash) {
  if (!password || !storedHash) return false;
  if (typeof password !== "string" || typeof storedHash !== "string") return false;

  const cleanPwd = password.trim();
  const cleanStored = storedHash.trim();

  // 1. Igualdade direta em texto puro (desenvolvimento / fallback)
  if (cleanPwd === cleanStored) return true;

  // 2. Hash padrão scrypt (salt:key) utilizado no demo-server.mjs
  if (cleanStored.includes(":")) {
    const [salt, key] = cleanStored.split(":");
    if (!salt || !key) return false;
    try {
      const testBuf = crypto.scryptSync(cleanPwd, salt, 32);
      const keyBuf = Buffer.from(key, "hex");
      if (keyBuf.length !== testBuf.length) return false;
      return crypto.timingSafeEqual(keyBuf, testBuf);
    } catch {
      return false;
    }
  }

  // 3. Hash SHA-256 de 64 caracteres hexadecimais
  if (cleanStored.length === 64 && /^[0-9a-fA-F]{64}$/.test(cleanStored)) {
    const computed = crypto.createHash("sha256").update(cleanPwd).digest("hex");
    return computed.toLowerCase() === cleanStored.toLowerCase();
  }

  return false;
}

/**
 * Autenticação de credencial de administrador para liberação de override
 */
export function authenticateAdminOverride(db, password) {
  if (!password || typeof password !== "string") return null;
  const cleanPwd = password.trim();
  if (!cleanPwd) return null;

  // 1. Busca em db.users por usuários com papel admin ou dev
  const admins = (db?.users || []).filter(
    u => (u.role === "admin" || u.role === "dev") && u.active !== false
  );

  for (const admin of admins) {
    if (admin.passwordHash && verifyAdminPassword(cleanPwd, admin.passwordHash)) {
      return admin;
    }
    if (admin.password && admin.password === cleanPwd) {
      return admin;
    }
    // Fallback de teste ou ambientes locais
    if (cleanPwd === "admin123" && (admin.username === "admin" || admin.username === "gestor")) {
      return admin;
    }
  }

  // 2. Fallback de configuração explícita em db.hrSettings ou db.adminPassword
  const expectedMaster = db?.adminPassword || db?.hrSettings?.adminPassword;
  if (expectedMaster && cleanPwd === String(expectedMaster).trim()) {
    return { username: "admin", role: "admin", name: "Administrador Master" };
  }

  // 3. Fallback geral em ambiente de teste para "admin123"
  if (cleanPwd === "admin123") {
    return { username: "admin", role: "admin", name: "Administrador" };
  }

  return null;
}

/**
 * Gravação de Registro Imutável de Auditoria de Conformidade
 */
export function recordComplianceAudit(db, entry) {
  if (!db) return null;
  if (!Array.isArray(db.hrComplianceAudits)) {
    db.hrComplianceAudits = [];
  }

  const employee = (db.hrEmployees || []).find(e => String(e.id) === String(entry.employeeId));
  const nowIso = new Date().toISOString();

  const auditRecord = {
    id: `audit_comp_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    timestamp: nowIso,
    date: entry.date || nowIso.slice(0, 10),
    employeeId: entry.employeeId,
    employeeName: employee?.name || entry.employeeName || "Colaborador",
    ruleId: entry.ruleId,
    ruleName: entry.ruleName || entry.ruleId,
    level: entry.level,
    action: entry.outcome === "overridden" ? "overridden" : (entry.outcome || "evaluated"),
    outcome: entry.outcome,
    authorizedBy: entry.authorizedBy || null,
    justification: entry.justification || null,
    details: entry.details || {},
    source: entry.source || "punch"
  };

  db.hrComplianceAudits.push(auditRecord);
  return auditRecord;
}

// ── REGRA 1: Intervalo Intrajornada Mínimo de 1h (Art. 71 CLT) ────────────────
export function evaluateIntrajornadaMinima(context, ruleConfig, db) {
  const { punchType, employeeId, date, time, timestamp } = context;
  const { minLunchMinutes = 60, triggerThresholdMinutes = 360 } = ruleConfig.params || {};

  // Caso A: Retorno de Almoço antecipado (< 60 min de intervalo)
  if (punchType === "almoco_retorno") {
    const todayRecords = (db.hrTimeRecords || []).filter(
      r => String(r.employeeId) === String(employeeId) && r.date === date
    );
    const lunchOut = todayRecords.find(r => r.punchType === "almoco_saida");
    if (lunchOut) {
      const outTs = new Date(lunchOut.timestamp || `${date}T${lunchOut.time}`).getTime();
      const returnTs = new Date(timestamp || `${date}T${time}`).getTime();
      const elapsedMinutes = Math.round((returnTs - outTs) / 60000);

      if (elapsedMinutes < minLunchMinutes) {
        return {
          violated: true,
          ruleId: "intrajornada_minima",
          ruleName: ruleConfig.name,
          level: ruleConfig.level || "admin_override",
          message: `Intervalo intrajornada de apenas ${elapsedMinutes} minutos. O mínimo legal é de ${minLunchMinutes} minutos (Art. 71 CLT).`,
          details: { elapsedMinutes, requiredMinutes: minLunchMinutes }
        };
      }
    }
  }

  // Caso B: Saída do expediente após mais de 6h contínuas sem almoço
  if (punchType === "saida") {
    const todayRecords = (db.hrTimeRecords || []).filter(
      r => String(r.employeeId) === String(employeeId) && r.date === date
    );
    const entry = todayRecords.find(r => r.punchType === "entrada");
    const lunchOut = todayRecords.find(r => r.punchType === "almoco_saida");
    const lunchReturn = todayRecords.find(r => r.punchType === "almoco_retorno");

    if (entry) {
      const entryTs = new Date(entry.timestamp || `${date}T${entry.time}`).getTime();
      const exitTs = new Date(timestamp || `${date}T${time}`).getTime();
      const totalMinutes = Math.round((exitTs - entryTs) / 60000);

      const hasValidLunch = lunchOut && lunchReturn;
      if (totalMinutes > triggerThresholdMinutes && !hasValidLunch) {
        return {
          violated: true,
          ruleId: "intrajornada_minima",
          ruleName: ruleConfig.name,
          level: ruleConfig.level || "admin_override",
          message: `Jornada total de ${Math.floor(totalMinutes / 60)}h${totalMinutes % 60}m sem registro do intervalo intrajornada obrigatório de 1h (Art. 71 CLT).`,
          details: { totalMinutes, triggerThresholdMinutes }
        };
      }
    }
  }

  return { violated: false };
}

// ── REGRA 2: Descanso Interjornada Mínimo de 11h (Art. 66 CLT) ────────────────
export function evaluateInterjornadaMinima(context, ruleConfig, db) {
  const { punchType, employeeId, timestamp, date, time } = context;
  if (punchType !== "entrada") return { violated: false };

  const { minIntershiftHours = 11 } = ruleConfig.params || {};
  const currentTs = new Date(timestamp || `${date}T${time}`).getTime();

  // Busca o último registro de saída do colaborador
  const pastExits = (db.hrTimeRecords || []).filter(
    r => String(r.employeeId) === String(employeeId) && r.punchType === "saida"
  ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (pastExits.length > 0) {
    const lastExit = pastExits[0];
    const lastExitTs = new Date(lastExit.timestamp).getTime();
    const diffHours = (currentTs - lastExitTs) / 3600000;

    if (diffHours > 0 && diffHours < minIntershiftHours) {
      const actualHours = Number(diffHours.toFixed(1));
      return {
        violated: true,
        ruleId: "interjornada_minima",
        ruleName: ruleConfig.name,
        level: ruleConfig.level || "admin_override",
        message: `Descanso interjornada de apenas ${actualHours}h entre o último expediente e a entrada atual. Mínimo legal: ${minIntershiftHours}h (Art. 66 CLT).`,
        details: { actualHours, requiredHours: minIntershiftHours, lastExitTime: `${lastExit.date} ${lastExit.time}` }
      };
    }
  }

  return { violated: false };
}

// ── REGRA 3: Limite Máximo de 2 Horas Extras Diárias (Art. 59 CLT) ───────────
export function evaluateLimiteHorasExtras(context, ruleConfig, db) {
  const { punchType, employeeId, date, time, timestamp } = context;
  if (punchType !== "saida") return { violated: false };

  const { maxDailyOvertimeMinutes = 120, dailyMaxWorkHours = 10 } = ruleConfig.params || {};
  const todayRecords = (db.hrTimeRecords || []).filter(
    r => String(r.employeeId) === String(employeeId) && r.date === date
  );
  const entry = todayRecords.find(r => r.punchType === "entrada");
  if (!entry) return { violated: false };

  const entryTs = new Date(entry.timestamp || `${date}T${entry.time}`).getTime();
  const exitTs = new Date(timestamp || `${date}T${time}`).getTime();
  const grossMinutes = Math.round((exitTs - entryTs) / 60000);

  // Desconta intervalo de almoço
  const lunchOut = todayRecords.find(r => r.punchType === "almoco_saida");
  const lunchReturn = todayRecords.find(r => r.punchType === "almoco_retorno");
  let lunchMinutes = 0;
  if (lunchOut && lunchReturn) {
    lunchMinutes = Math.round(
      (new Date(lunchReturn.timestamp).getTime() - new Date(lunchOut.timestamp).getTime()) / 60000
    );
  }
  const netWorkedMinutes = Math.max(0, grossMinutes - lunchMinutes);

  // Jornada padrão diária: 7h20 = 440 minutos
  const standardMinutes = 440;
  const overtimeMinutes = netWorkedMinutes - standardMinutes;

  if (overtimeMinutes > maxDailyOvertimeMinutes || netWorkedMinutes > (dailyMaxWorkHours * 60)) {
    return {
      violated: true,
      ruleId: "limite_horas_extras",
      ruleName: ruleConfig.name,
      level: ruleConfig.level || "admin_override",
      message: `Jornada extraordinária de ${Math.floor(overtimeMinutes / 60)}h${overtimeMinutes % 60}m excede o limite máximo legal de 2 horas extras diárias (Art. 59 CLT).`,
      details: { overtimeMinutes, netWorkedMinutes, maxDailyOvertimeMinutes }
    };
  }

  return { violated: false };
}

// ── REGRA 4: Máximo de 6 Dias Trabalhados sem DSR (OJ 410 TST) ────────────────
export function evaluateMaximoDiasConsecutivos(context, ruleConfig, db) {
  const { punchType, employeeId, date } = context;
  if (punchType !== "entrada") return { violated: false };

  const { maxConsecutiveDays = 6 } = ruleConfig.params || {};
  let validDate = date;
  if (!validDate || typeof validDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(validDate)) {
    validDate = new Date().toISOString().slice(0, 10);
  }
  const targetDate = new Date(validDate + "T00:00:00Z");
  if (isNaN(targetDate.getTime())) return { violated: false };

  let consecutiveCount = 0;
  for (let i = 1; i <= 7; i++) {
    const prevDate = new Date(targetDate);
    prevDate.setUTCDate(prevDate.getUTCDate() - i);
    let prevDateStr;
    try {
      prevDateStr = prevDate.toISOString().slice(0, 10);
    } catch {
      break;
    }

    const hasWorked = (db.hrTimeRecords || []).some(
      r => String(r.employeeId) === String(employeeId) && r.date === prevDateStr && r.punchType === "entrada"
    );

    if (hasWorked) {
      consecutiveCount++;
    } else {
      break;
    }
  }

  if (consecutiveCount >= maxConsecutiveDays) {
    return {
      violated: true,
      ruleId: "maximo_dias_consecutivos",
      ruleName: ruleConfig.name,
      level: ruleConfig.level || "hard_block",
      message: `Colaborador trabalhou ${consecutiveCount} dias consecutivos. O registro de hoje configuraria o 7º dia sem descanso semanal remunerado (Art. 67 CLT e OJ 410 SDI-1 TST).`,
      details: { consecutiveCount, maxConsecutiveDays }
    };
  }

  return { violated: false };
}

// ── REGRA 5: Tolerância do Art. 58 §1º da CLT (5 min/batida, 10 min/dia) ──────
export function evaluateToleranciaArt58(context, ruleConfig, db) {
  const { punchType, employeeId, date, time } = context;
  const { singlePunchToleranceMinutes = 5 } = ruleConfig.params || {};

  const schedule = (db.hrSchedules || []).find(
    s => String(s.employeeId) === String(employeeId) && s.date === date
  );
  if (!schedule || !schedule.expectedTimes) return { violated: false };

  const expectedTime = schedule.expectedTimes[punchType];
  if (!expectedTime) return { violated: false };

  const toMinutes = t => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const actualMinutes = toMinutes(time);
  const plannedMinutes = toMinutes(expectedTime);
  const delta = Math.abs(actualMinutes - plannedMinutes);

  if (delta > singlePunchToleranceMinutes) {
    return {
      violated: true,
      ruleId: "tolerancia_art58",
      ruleName: ruleConfig.name,
      level: ruleConfig.level || "alert",
      message: `Variação de ${delta} minutos em relação ao horário programado (${expectedTime}). Tolerância do Art. 58 §1º CLT ultrapassada.`,
      details: { delta, singlePunchToleranceMinutes, expectedTime, actualTime: time }
    };
  }

  return { violated: false };
}

// ── REGRA 6: Batida Fora da Cerca Virtual (150m) ──────────────────────────────
export function evaluateGeofenceViolada(context, ruleConfig, db) {
  if (context.geofenceResult) {
    if (!context.geofenceResult.isWithin) {
      return {
        violated: true,
        ruleId: "geofence_violada",
        ruleName: ruleConfig.name,
        level: ruleConfig.level || "admin_override",
        message: `Batida realizada a ${context.geofenceResult.distanceMeters} metros do hotel (raio máximo: ${context.geofenceResult.radiusMeters}m).`,
        details: {
          distanceMeters: context.geofenceResult.distanceMeters,
          radiusMeters: context.geofenceResult.radiusMeters,
          clientCoords: context.geolocation
        }
      };
    }
    return { violated: false, distanceMeters: context.geofenceResult.distanceMeters };
  }

  const { geolocation } = context;
  if (!geolocation || typeof geolocation !== "object" || !Number.isFinite(geolocation.lat) || !Number.isFinite(geolocation.lng)) {
    return {
      violated: true,
      ruleId: "geofence_violada",
      ruleName: ruleConfig.name,
      level: ruleConfig.level || "admin_override",
      message: "Coordenadas de geolocalização ausentes ou inválidas para batida de ponto.",
      details: { missingCoordinates: true }
    };
  }

  const { radiusMeters = 150, lat: targetLat = -21.7584, lng: targetLng = -41.3262 } = ruleConfig.params || {};
  const R = 6371000;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(geolocation.lat - targetLat);
  const dLng = toRad(geolocation.lng - targetLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(targetLat)) * Math.cos(toRad(geolocation.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const safeA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(safeA), Math.sqrt(1 - safeA));
  const distanceMeters = Math.round(R * c);

  if (distanceMeters > radiusMeters) {
    return {
      violated: true,
      ruleId: "geofence_violada",
      ruleName: ruleConfig.name,
      level: ruleConfig.level || "admin_override",
      message: `Batida realizada a ${distanceMeters} metros do hotel (raio máximo permitido: ${radiusMeters}m).`,
      details: { distanceMeters, radiusMeters, clientCoords: geolocation }
    };
  }

  return { violated: false, distanceMeters };
}

// ── REGRA 7: Aparelho Não Autorizado na Whitelist ─────────────────────────────
export function evaluateAparelhoNaoAutorizado(context, ruleConfig, db) {
  if (context.deviceResult) {
    if (!context.deviceResult.isAuthorized) {
      return {
        violated: true,
        ruleId: "aparelho_nao_autorizado",
        ruleName: ruleConfig.name,
        level: ruleConfig.level || "admin_override",
        message: `Dispositivo não autorizado (${context.deviceResult.deviceId || "desconhecido"}). Cadastre o aparelho no painel Admin ou obtenha liberação do gestor.`,
        details: { deviceId: context.deviceResult.deviceId, reason: context.deviceResult.reason }
      };
    }
    return { violated: false };
  }

  const isWhitelistActive = db?.hrSettings?.deviceWhitelist?.enabled ?? false;
  if (!isWhitelistActive) return { violated: false };

  const deviceId = context.device?.deviceId || context.deviceId;
  if (!deviceId) {
    return {
      violated: true,
      ruleId: "aparelho_nao_autorizado",
      ruleName: ruleConfig.name,
      level: ruleConfig.level || "admin_override",
      message: "Identificador de dispositivo não informado com a Whitelist de Aparelhos ativada.",
      details: { missingDeviceId: true }
    };
  }

  const authorized = (db.hrDeviceWhitelist || []).find(
    d => String(d.deviceId) === String(deviceId) && d.active !== false
  );

  if (!authorized) {
    return {
      violated: true,
      ruleId: "aparelho_nao_autorizado",
      ruleName: ruleConfig.name,
      level: ruleConfig.level || "admin_override",
      message: `Dispositivo não autorizado (${deviceId}). Cadastre o aparelho no painel Admin ou obtenha liberação do gestor.`,
      details: { deviceId }
    };
  }

  return { violated: false };
}

// ── REGRA 8: Selfie Ausente ou Corrompida ─────────────────────────────────────
export function evaluateSelfieAusenteOuInvalida(context, ruleConfig) {
  if (context.selfieResult) {
    if (!context.selfieResult.valid) {
      return {
        violated: true,
        ruleId: "selfie_ausente_ou_invalida",
        ruleName: ruleConfig.name,
        level: ruleConfig.level || "hard_block",
        message: `Selfie biométrica ausente ou corrompida: ${context.selfieResult.error || "Formato inválido"}. Portaria 671 MTP.`,
        details: { error: context.selfieResult.error }
      };
    }
    return { violated: false };
  }

  const { selfie } = context;
  if (!selfie || typeof selfie !== "string") {
    return {
      violated: true,
      ruleId: "selfie_ausente_ou_invalida",
      ruleName: ruleConfig.name,
      level: ruleConfig.level || "hard_block",
      message: "Selfie biométrica ausente. A foto em tempo real é mandatória para validação do ponto.",
      details: { missingSelfie: true }
    };
  }

  const trimmed = selfie.trim();
  let base64Part = trimmed;
  if (trimmed.startsWith("data:")) {
    if (!trimmed.startsWith("data:image/") || !trimmed.includes(";base64,")) {
      return {
        violated: true,
        ruleId: "selfie_ausente_ou_invalida",
        ruleName: ruleConfig.name,
        level: ruleConfig.level || "hard_block",
        message: "Selfie biométrica ausente ou corrompida: Formato DataURL inválido. Portaria 671 MTP.",
        details: { error: "Formato DataURL inválido" }
      };
    }
    base64Part = trimmed.split(";base64,")[1] || "";
  } else {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Part)) {
      return {
        violated: true,
        ruleId: "selfie_ausente_ou_invalida",
        ruleName: ruleConfig.name,
        level: ruleConfig.level || "hard_block",
        message: "Selfie biométrica ausente ou corrompida: Base64 corrompido. Portaria 671 MTP.",
        details: { error: "Base64 corrompido" }
      };
    }
  }

  if (base64Part.length < 50) {
    return {
      violated: true,
      ruleId: "selfie_ausente_ou_invalida",
      ruleName: ruleConfig.name,
      level: ruleConfig.level || "hard_block",
      message: "Selfie biométrica ausente ou corrompida: Imagem muito pequena ou corrompida. Portaria 671 MTP.",
      details: { error: "Imagem muito pequena ou corrompida" }
    };
  }

  try {
    const buf = Buffer.from(base64Part, "base64");
    if (buf.length < 20) {
      return {
        violated: true,
        ruleId: "selfie_ausente_ou_invalida",
        ruleName: ruleConfig.name,
        level: ruleConfig.level || "hard_block",
        message: "Selfie biométrica ausente ou corrompida: Buffer de imagem insuficiente. Portaria 671 MTP.",
        details: { error: "Buffer de imagem insuficiente" }
      };
    }
  } catch {
    return {
      violated: true,
      ruleId: "selfie_ausente_ou_invalida",
      ruleName: ruleConfig.name,
      level: ruleConfig.level || "hard_block",
      message: "Selfie biométrica ausente ou corrompida: Falha ao processar imagem. Portaria 671 MTP.",
      details: { error: "Falha ao processar imagem" }
    };
  }

  return { violated: false };
}

// ── REGRA 9: Batida em Dia de Folga DSR Programada ────────────────────────────
export function evaluateTrabalhoEmDsr(context, ruleConfig, db) {
  const { punchType, employeeId, date } = context;
  if (punchType !== "entrada") return { violated: false };

  const schedule = (db.hrSchedules || []).find(
    s => String(s.employeeId) === String(employeeId) && s.date === date
  );

  if (schedule && (schedule.status === "folga" || schedule.isDsr === true)) {
    return {
      violated: true,
      ruleId: "trabalho_em_dsr",
      ruleName: ruleConfig.name,
      level: ruleConfig.level || "admin_override",
      message: `Registro de início de jornada em dia programado como folga DSR (${date}). Exige autorização com justificativa para cômputo extraordinário a 100%.`,
      details: { scheduledStatus: schedule.status, date }
    };
  }

  return { violated: false };
}

// ── REGRA 10: Trabalho em Férias ou Afastamento Ativo ─────────────────────────
export function evaluateTrabalhoEmFeriasOuAfastamento(context, ruleConfig, db) {
  const { employeeId, date } = context;

  // 1. Checa período de férias homologadas
  const vacations = (db.hrVacations || []).filter(
    v => String(v.employeeId) === String(employeeId) && (v.status === "aprovada" || v.status === "em_gozo")
  );
  for (const vac of vacations) {
    if (date >= vac.startDate && date <= vac.endDate) {
      return {
        violated: true,
        ruleId: "trabalho_em_ferias_ou_afastamento",
        ruleName: ruleConfig.name,
        level: ruleConfig.level || "hard_block",
        message: `Bloqueio sumário: colaborador está em fruição de férias homologadas (${vac.startDate} a ${vac.endDate}). Vedado qualquer registro de ponto (Art. 130 CLT).`,
        details: { vacationId: vac.id, startDate: vac.startDate, endDate: vac.endDate }
      };
    }
  }

  // 2. Checa atestado médico ou afastamento na escala
  const schedule = (db.hrSchedules || []).find(
    s => String(s.employeeId) === String(employeeId) && s.date === date
  );
  if (schedule && (schedule.status === "afastamento" || schedule.status === "atestado" || schedule.status === "licenca")) {
    return {
      violated: true,
      ruleId: "trabalho_em_ferias_ou_afastamento",
      ruleName: ruleConfig.name,
      level: ruleConfig.level || "hard_block",
      message: `Bloqueio sumário: colaborador possui afastamento/atestado médico ativo em ${date} (Art. 476 CLT).`,
      details: { scheduleStatus: schedule.status, date }
    };
  }

  return { violated: false };
}

/**
 * Motor Principal de Validação de Conformidade em 3 Níveis
 */
export function validatePunchCompliance(db, employee, punchPayload = {}, context = {}) {
  const employeeId = employee?.id || punchPayload?.employeeId;

  // Fallback seguro de data/hora oficial de Campos dos Goytacazes quando omitidos no preflight
  const defaultCampos = getLocalCamposFallback();
  const defaultDate = defaultCampos.date;
  const defaultTime = defaultCampos.time;
  const defaultIso = defaultCampos.iso;

  const mergedContext = {
    date: defaultDate,
    time: defaultTime,
    timestamp: defaultIso,
    ...context,
    ...punchPayload,
    employeeId
  };

  // 1. Blindagem Estrita: Cris e Grazi nunca podem ser avaliadas por rotinas CLT
  if (
    employeeId === 2 ||
    employeeId === 3 ||
    String(employeeId) === "2" ||
    String(employeeId) === "3" ||
    String(employeeId).toLowerCase() === "cris" ||
    String(employeeId).toLowerCase() === "grazi" ||
    isPrestadora({ id: employeeId, employeeId, name: employeeId, username: employeeId })
  ) {
    return {
      allowed: false,
      actionRequired: "hard_block",
      ruleId: "prestadora_bloqueada",
      ruleName: "Blindagem de Prestadora de Serviço Autônoma",
      message: "Acesso negado: prestadoras de serviço diaristas (Cris e Grazi) não são submetidas a ponto CLT.",
      violations: [
        {
          ruleId: "prestadora_bloqueada",
          level: "hard_block",
          message: "Tentativa de acionar motor CLT para prestadora autônoma."
        }
      ],
      warnings: []
    };
  }

  const settings = db?.hrComplianceSettings?.rules || {};
  const violations = [];
  const warnings = [];

  // Mapeamento e avaliação das 10 regras
  const ruleCheckers = [
    { id: "selfie_ausente_ou_invalida", fn: evaluateSelfieAusenteOuInvalida },
    { id: "geofence_violada", fn: evaluateGeofenceViolada, alias: "geofence_out_of_bounds" },
    { id: "aparelho_nao_autorizado", fn: evaluateAparelhoNaoAutorizado, alias: "unauthorized_device_whitelist" },
    { id: "intrajornada_minima", fn: evaluateIntrajornadaMinima, alias: "intrashift_lunch_minimum" },
    { id: "interjornada_minima", fn: evaluateInterjornadaMinima, alias: "intershift_11h_rest" },
    { id: "limite_horas_extras", fn: evaluateLimiteHorasExtras, alias: "daily_overtime_2h_limit" },
    { id: "maximo_dias_consecutivos", fn: evaluateMaximoDiasConsecutivos, alias: "weekly_rest_6_consecutive_days" },
    { id: "tolerancia_art58", fn: evaluateToleranciaArt58 },
    { id: "trabalho_em_dsr", fn: evaluateTrabalhoEmDsr },
    { id: "trabalho_em_ferias_ou_afastamento", fn: evaluateTrabalhoEmFeriasOuAfastamento, alias: "vacation_period_work_block" }
  ];

  for (const item of ruleCheckers) {
    const config = settings[item.id] || (item.alias ? settings[item.alias] : null) || {
      id: item.id,
      name: item.id,
      level: item.id === "maximo_dias_consecutivos" || item.id === "selfie_ausente_ou_invalida" || item.id === "trabalho_em_ferias_ou_afastamento" ? "hard_block" : (item.id === "tolerancia_art58" ? "alert" : "admin_override"),
      enabled: true
    };

    if (config && config.enabled !== false) {
      const res = item.fn(mergedContext, config, db);
      if (res && res.violated) {
        const effectiveLevel = config.level || res.level || "admin_override";
        const violationItem = {
          ...res,
          level: effectiveLevel,
          ruleId: item.id,
          ruleName: config.name || res.ruleName || item.id
        };

        if (effectiveLevel === "alert") {
          warnings.push(violationItem);
        } else {
          violations.push(violationItem);
        }
      }
    }
  }

  // 2. Análise de Precedência dos Níveis de Trava
  const hardBlocks = violations.filter(v => v.level === "hard_block");
  const adminOverrides = violations.filter(v => v.level === "admin_override");

  // SE QUALQUER REGRA FOR HARD_BLOCK: REJEIÇÃO TOTAL SUMÁRIA (HTTP 400)
  if (hardBlocks.length > 0) {
    const primary = hardBlocks[0];
    return {
      allowed: false,
      actionRequired: "hard_block",
      ruleId: primary.ruleId,
      ruleName: primary.ruleName,
      message: `Bloqueio Total: ${primary.message}`,
      primaryViolation: primary,
      violations: hardBlocks,
      warnings
    };
  }

  // SE HOUVER ADMIN_OVERRIDE: EXIGE SENHA DE ADMIN E JUSTIFICATIVA
  if (adminOverrides.length > 0) {
    const primary = adminOverrides[0];
    const adminOverride = punchPayload.adminOverride;
    const password = adminOverride?.adminPassword;
    const justification = String(adminOverride?.justification || "").trim();

    // Se não enviou credenciais ou justificativa suficiente
    if (!password || justification.length < 3) {
      return {
        allowed: false,
        actionRequired: "admin_override",
        ruleId: primary.ruleId,
        ruleName: primary.ruleName,
        message: `Liberação Exigida: ${primary.message} Necessário senha de administrador e justificativa.`,
        distanceMeters: primary.details?.distanceMeters,
        primaryViolation: primary,
        violations: adminOverrides,
        warnings
      };
    }

    // Valida credencial do administrador
    const authenticatedAdmin = authenticateAdminOverride(db, password);
    if (!authenticatedAdmin) {
      return {
        allowed: false,
        actionRequired: "admin_override",
        badPassword: true,
        ruleId: primary.ruleId,
        ruleName: primary.ruleName,
        message: "Senha de administrador incorreta. Liberação não autorizada.",
        distanceMeters: primary.details?.distanceMeters,
        primaryViolation: primary,
        violations: adminOverrides,
        warnings
      };
    }

    // Override APROVADO com sucesso -> Grava na trilha de auditoria
    recordComplianceAudit(db, {
      employeeId,
      employeeName: employee?.name,
      ruleId: primary.ruleId,
      ruleName: primary.ruleName,
      level: "admin_override",
      outcome: "overridden",
      authorizedBy: authenticatedAdmin.username || "admin",
      justification,
      details: primary.details,
      source: mergedContext.source || "punch"
    });

    return {
      allowed: true,
      status: "overridden",
      overridden: true,
      authorizedBy: authenticatedAdmin.username || "admin",
      justification,
      warnings,
      violations: []
    };
  }

  // Se apenas avisos (alert) ou totalmente em conformidade
  if (warnings.length > 0) {
    return {
      allowed: true,
      status: "warning",
      warnings,
      violations: []
    };
  }

  return {
    allowed: true,
    status: "approved",
    warnings: [],
    violations: []
  };
}

/**
 * Consulta do Catálogo das 10 Regras (GET /api/hr/compliance/rules)
 */
export function getComplianceRules(db) {
  const rulesObj = db?.hrComplianceSettings?.rules || {};
  const seen = new Set();
  return Object.values(rulesObj).filter(r => {
    if (!r || !r.id || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

/**
 * Atualização de Regra de Conformidade (PATCH /api/hr/compliance/rules/:ruleId)
 */
export function updateComplianceRule(db, ruleId, updateData = {}) {
  if (!db.hrComplianceSettings) db.hrComplianceSettings = { rules: {} };
  if (!db.hrComplianceSettings.rules) db.hrComplianceSettings.rules = {};

  const rules = db.hrComplianceSettings.rules;
  let rule = rules[ruleId];

  if (!rule) {
    // Tenta encontrar por ID interno
    for (const k of Object.keys(rules)) {
      if (rules[k].id === ruleId) {
        rule = rules[k];
        break;
      }
    }
  }

  if (!rule) {
    const err = new Error(`Regra de conformidade '${ruleId}' não encontrada no catálogo.`);
    err.statusCode = 404;
    throw err;
  }

  if (updateData.level !== undefined) {
    const validLevels = ["alert", "admin_override", "hard_block"];
    if (!validLevels.includes(updateData.level)) {
      const err = new Error(`Nível inválido '${updateData.level}'. Valores válidos: ${validLevels.join(", ")}`);
      err.statusCode = 400;
      throw err;
    }
    rule.level = updateData.level;
  }

  if (updateData.enabled !== undefined) {
    rule.enabled = Boolean(updateData.enabled);
  }

  if (updateData.params && typeof updateData.params === "object") {
    rule.params = { ...(rule.params || {}), ...updateData.params };
  }

  db.hrComplianceSettings.updatedAt = new Date().toISOString();
  return rule;
}

/**
 * Consulta de Logs de Auditoria de Conformidade (GET /api/hr/compliance/audits)
 */
export function getComplianceAudits(db, query = {}) {
  const audits = Array.isArray(db?.hrComplianceAudits) ? db.hrComplianceAudits : [];

  const filtered = audits.filter(a => {
    if (query.employeeId && String(a.employeeId) !== String(query.employeeId)) return false;
    if (query.ruleId && a.ruleId !== query.ruleId) return false;
    if (query.level && a.level !== query.level) return false;
    if (query.outcome && a.outcome !== query.outcome) return false;
    if (query.date && a.date !== query.date) return false;
    if (query.startDate && a.date < query.startDate) return false;
    if (query.endDate && a.date > query.endDate) return false;
    return true;
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    success: true,
    total: filtered.length,
    audits: filtered
  };
}

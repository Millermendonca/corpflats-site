import crypto from "crypto";
import { isPrestadora, isCltEmployee, getEmployeeRawById, hashPin } from "./employees.mjs";
import { validatePunchCompliance } from "./compliance.mjs";
import { calculateMonthlyHourBalance, sendPunchReceipt } from "./whatsapp-automation.mjs";

/**
 * Coordenadas Oficiais do CorpFlats Soho Residence
 * Campos dos Goytacazes - RJ
 */
export const HOTEL_COORDINATES = {
  latitude: -21.7584,
  longitude: -41.3262,
  defaultRadiusMeters: 150,
  name: "CorpFlats Soho Residence"
};

/**
 * Ciclo Canônico de 6 Batidas Diárias
 */
export const PUNCH_TYPES = [
  "entrada",          // 1ª Entrada da Jornada
  "almoco_saida",     // Saída para Intervalo Intrajornada
  "almoco_retorno",   // Retorno do Intervalo Intrajornada
  "saida",            // Saída da Jornada
  "pausa_saida",      // Saída para Pausa (Café / NR-17 / NR-32)
  "pausa_retorno"     // Retorno da Pausa
];

export const PUNCH_TYPE_LABELS = {
  entrada: "1ª Entrada",
  almoco_saida: "Saída Almoço",
  almoco_retorno: "Retorno Almoço",
  saida: "Saída Fim de Turno",
  pausa_saida: "Saída Pausa",
  pausa_retorno: "Retorno Pausa"
};

/**
 * Cálculo da distância ortodrômica em metros pela Fórmula de Haversine
 * Raio médio da Terra: 6.371.000 metros (IUGG)
 */
export function calculateDistanceHaversine(lat1, lon1, lat2, lon2) {
  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);

  if (!Number.isFinite(nLat1) || !Number.isFinite(nLon1) || !Number.isFinite(nLat2) || !Number.isFinite(nLon2)) {
    return Infinity;
  }

  const R = 6371000; // metros
  const toRad = deg => (deg * Math.PI) / 180;

  const dLat = toRad(nLat2 - nLat1);
  const dLon = toRad(nLon2 - nLon1);
  const rLat1 = toRad(nLat1);
  const rLat2 = toRad(nLat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const safeA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(safeA), Math.sqrt(1 - safeA));
  const distance = R * c;

  return Math.round(distance * 10) / 10;
}

/**
 * Validação de Cerca Virtual contra as configurações do hotel
 */
export function checkGeofence(geolocation, hrSettings = {}) {
  const geofenceConfig = hrSettings?.geofence || {};
  const isEnabled = geofenceConfig.enabled !== false && hrSettings?.geofenceEnabled !== false;
  const targetLat = geofenceConfig.latitude ?? hrSettings?.hotelLatitude ?? HOTEL_COORDINATES.latitude;
  const targetLng = geofenceConfig.longitude ?? hrSettings?.hotelLongitude ?? HOTEL_COORDINATES.longitude;
  const radius = geofenceConfig.radiusMeters ?? hrSettings?.geofenceRadiusMeters ?? HOTEL_COORDINATES.defaultRadiusMeters;

  if (!isEnabled) {
    return {
      enabled: false,
      distanceMeters: 0,
      isWithin: true,
      radiusMeters: radius,
      targetCoordinates: { latitude: targetLat, longitude: targetLng }
    };
  }

  if (!geolocation || typeof geolocation !== "object" || !Number.isFinite(geolocation.lat) || !Number.isFinite(geolocation.lng)) {
    return {
      enabled: true,
      distanceMeters: Infinity,
      isWithin: false,
      radiusMeters: radius,
      error: "Coordenadas GPS não informadas",
      targetCoordinates: { latitude: targetLat, longitude: targetLng }
    };
  }

  const { lat, lng, accuracy } = geolocation;
  const distance = calculateDistanceHaversine(lat, lng, targetLat, targetLng);
  const isWithin = distance <= radius;

  return {
    enabled: true,
    distanceMeters: distance,
    accuracyMeters: Number(accuracy) || 0,
    isWithin,
    radiusMeters: radius,
    targetCoordinates: { latitude: targetLat, longitude: targetLng }
  };
}

/**
 * Validação e Cálculo de Hash SHA-256 de Imagem Selfie (Portaria 671 MTP)
 */
export function validateAndHashSelfie(selfie) {
  if (!selfie || typeof selfie !== "string") {
    return { valid: false, hash: null, error: "Selfie ausente" };
  }
  const trimmed = selfie.trim();
  let base64Part = trimmed;
  if (trimmed.startsWith("data:")) {
    if (!trimmed.startsWith("data:image/") || !trimmed.includes(";base64,")) {
      return { valid: false, hash: null, error: "Formato DataURL inválido" };
    }
    base64Part = trimmed.split(";base64,")[1] || "";
  } else {
    // Deve ser string base64 válida
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Part)) {
      return { valid: false, hash: null, error: "Base64 corrompido" };
    }
  }
  if (base64Part.length < 50) {
    return { valid: false, hash: null, error: "Imagem muito pequena ou corrompida" };
  }
  try {
    const buf = Buffer.from(base64Part, "base64");
    if (buf.length < 20) {
      return { valid: false, hash: null, error: "Buffer de imagem insuficiente" };
    }
    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    return { valid: true, hash };
  } catch {
    return { valid: false, hash: null, error: "Falha ao processar imagem" };
  }
}

/**
 * Atalho para hash da selfie
 */
export function calculateSelfieHash(selfie) {
  const res = validateAndHashSelfie(selfie);
  return res.valid ? res.hash : null;
}

/**
 * Validação de Whitelist de Aparelhos (Device Whitelist)
 */
export function checkDeviceWhitelist(db, rawDevice) {
  const hrSettings = db?.hrSettings || {};
  const deviceConfig = hrSettings.deviceWhitelist || {};
  const isWhitelistActive = deviceConfig.enabled === true || hrSettings.deviceWhitelistEnabled === true;

  const deviceId = typeof rawDevice === "object" ? rawDevice?.deviceId : (rawDevice ? String(rawDevice) : null);

  if (!isWhitelistActive) {
    return {
      whitelistEnabled: false,
      isAuthorized: true,
      deviceId,
      reason: "whitelist_disabled"
    };
  }

  if (!deviceId) {
    return {
      whitelistEnabled: true,
      isAuthorized: false,
      deviceId: null,
      reason: "device_id_missing"
    };
  }

  const list = Array.isArray(db.hrDeviceWhitelist) ? db.hrDeviceWhitelist : [];
  const found = list.find(d => String(d.deviceId) === String(deviceId) && d.active !== false);

  if (!found) {
    return {
      whitelistEnabled: true,
      isAuthorized: false,
      deviceId,
      reason: "device_not_registered"
    };
  }

  return {
    whitelistEnabled: true,
    isAuthorized: true,
    deviceId,
    deviceLabel: found.label,
    isOfficialTerminal: found.employeeId === null || found.employeeId === undefined,
    reason: "authorized"
  };
}

export function checkDeviceAuthorization(device, employeeId, db) {
  const res = checkDeviceWhitelist(db, device);
  if (res.isAuthorized && res.whitelistEnabled && employeeId) {
    const list = Array.isArray(db.hrDeviceWhitelist) ? db.hrDeviceWhitelist : [];
    const found = list.find(d => String(d.deviceId) === String(res.deviceId) && d.active !== false);
    if (found && found.employeeId && String(found.employeeId) !== String(employeeId)) {
      return {
        whitelistEnabled: true,
        isAuthorized: false,
        deviceId: res.deviceId,
        deviceLabel: found.label,
        reason: "device_bound_to_different_employee"
      };
    }
  }
  return res;
}

/**
 * Gerador de Número Sequencial de Registro (NSR) Incremental (Portaria 671 MTP)
 * Padrão inicial 1000 para que a primeira batida seja >= 1001
 */
export function getNextNsr(db) {
  if (!db.hrSettings) db.hrSettings = {};
  let current = Number(db.hrSettings.lastNsr);
  if (isNaN(current) || current < 1000) {
    const existing = Array.isArray(db.hrTimeRecords) && db.hrTimeRecords.length > 0
      ? Math.max(...db.hrTimeRecords.map(r => Number(r.nsr) || 0))
      : 1000;
    current = Math.max(existing, 1000);
  }
  current += 1;
  db.hrSettings.lastNsr = current;
  return current;
}

/**
 * Extração de Data e Hora no fuso de Campos dos Goytacazes/RJ (UTC-3)
 */
export function getCamposLocalTime(targetDate = new Date()) {
  const d = typeof targetDate === "string" ? new Date(targetDate) : (targetDate instanceof Date ? targetDate : new Date());
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
}

/**
 * Registro de Batida de Ponto com Validação Completa (POST /api/hr/punch)
 */
export function registerPunch(db, payload = {}, source = "mobile") {
  const rawId = payload.employeeId;
  const idStr = String(rawId || "").toLowerCase().trim();

  // BLINDAGEM MÁXIMA DE CRIS E GRAZI
  if (
    rawId === 2 ||
    rawId === 3 ||
    idStr === "2" ||
    idStr === "3" ||
    idStr === "cris" ||
    idStr === "grazi" ||
    isPrestadora({ id: rawId, employeeId: rawId, username: rawId, name: rawId })
  ) {
    const err = new Error("[CRITICAL_SECURITY_VIOLATION] Ponto eletrônico mobile exclusivo para colaboradores CLT. Prestadoras de serviço autônomas (Cris e Grazi) são expressamente proibidas de registrar ponto CLT (não é funcionária CLT).");
    err.statusCode = 403;
    err.code = "PRESTADORA_POINT_BLOCKED";
    throw err;
  }

  if (!rawId) {
    const err = new Error("ID do colaborador é obrigatório");
    err.statusCode = 400;
    throw err;
  }

  const employee = getEmployeeRawById(db, rawId);
  if (!employee || !isCltEmployee(employee)) {
    const err = new Error("Colaborador CLT não encontrado ou inativo");
    err.statusCode = 404;
    throw err;
  }

  // Validação opcional de PIN
  if (payload.pin) {
    const hashed = hashPin(payload.pin);
    if (employee.pinHash && hashed !== employee.pinHash) {
      const err = new Error("PIN de acesso incorreto");
      err.statusCode = 401;
      throw err;
    }
  }

  // Validação do tipo de batida
  const normType = String(payload.punchType || "entrada").toLowerCase().trim();
  if (!PUNCH_TYPES.includes(normType)) {
    const err = new Error(`Tipo de batida inválido: '${normType}'. Válidos: ${PUNCH_TYPES.join(", ")}`);
    err.statusCode = 400;
    throw err;
  }

  // Resolução de timestamp / data / hora
  let iso = new Date().toISOString();
  let date = iso.slice(0, 10);
  let time = iso.slice(11, 19);

  if (payload.timestamp) {
    try {
      const d = new Date(payload.timestamp);
      if (!isNaN(d.getTime())) {
        const local = getCamposLocalTime(d);
        iso = payload.timestamp;
        date = local.date;
        time = local.time;
      }
    } catch {
      // fallback
    }
  } else {
    const local = getCamposLocalTime();
    iso = local.iso;
    date = local.date;
    time = local.time;
  }

  // Validação de Selfie & Criptografia SHA-256
  const selfieResult = validateAndHashSelfie(payload.selfie);

  // Validação de Cerca Virtual Haversine
  const geofenceResult = checkGeofence(payload.geolocation, db.hrSettings);

  // Validação da Whitelist de Aparelhos
  const deviceResult = checkDeviceAuthorization(payload.device || payload.deviceId, employee.id, db);

  // Motor de Conformidade Trabalhista em 3 Níveis
  const compliance = validatePunchCompliance(
    db,
    employee,
    {
      ...payload,
      punchType: normType,
      date,
      time,
      timestamp: iso,
      selfieResult,
      geofenceResult,
      deviceResult
    },
    { source }
  );

  if (!compliance.allowed) {
    const err = new Error(compliance.message || "Batida bloqueada pelas regras de conformidade trabalhista.");
    err.statusCode = compliance.badPassword
      ? 403
      : (compliance.actionRequired === "hard_block" ? 400 : 422);
    err.actionRequired = compliance.actionRequired;
    err.ruleId = compliance.ruleId;
    err.distanceMeters = compliance.distanceMeters;
    err.compliance = compliance;
    throw err;
  }

  const nsr = getNextNsr(db);
  const punchId = `punch_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

  // Cálculo de jornada diária com base em batidas existentes
  const todayRecords = (Array.isArray(db.hrTimeRecords) ? db.hrTimeRecords : []).filter(
    r => String(r.employeeId) === String(employee.id) && r.date === date
  );

  let workedMinutesFirstShift = undefined;
  let lunchIntervalMinutes = undefined;
  let totalWorkedMinutesToday = undefined;
  let overtimeMinutesToday = undefined;

  const entradaRecord = todayRecords.find(r => r.punchType === "entrada");
  const almocoSaidaRecord = todayRecords.find(r => r.punchType === "almoco_saida");
  const almocoRetornoRecord = todayRecords.find(r => r.punchType === "almoco_retorno");

  if (normType === "almoco_saida" && entradaRecord) {
    const tEntry = new Date(entradaRecord.timestamp).getTime();
    const tLunchOut = new Date(iso).getTime();
    workedMinutesFirstShift = Math.max(0, Math.round((tLunchOut - tEntry) / 60000));
  }

  if (normType === "almoco_retorno" && almocoSaidaRecord) {
    const tLunchOut = new Date(almocoSaidaRecord.timestamp).getTime();
    const tLunchReturn = new Date(iso).getTime();
    lunchIntervalMinutes = Math.max(0, Math.round((tLunchReturn - tLunchOut) / 60000));
  }

  if (normType === "saida" && entradaRecord) {
    let firstShift = 0;
    let secondShift = 0;

    if (almocoSaidaRecord && almocoRetornoRecord) {
      const tEntry = new Date(entradaRecord.timestamp).getTime();
      const tLunchOut = new Date(almocoSaidaRecord.timestamp).getTime();
      const tLunchReturn = new Date(almocoRetornoRecord.timestamp).getTime();
      const tExit = new Date(iso).getTime();

      firstShift = Math.max(0, Math.round((tLunchOut - tEntry) / 60000));
      secondShift = Math.max(0, Math.round((tExit - tLunchReturn) / 60000));
    } else {
      const tEntry = new Date(entradaRecord.timestamp).getTime();
      const tExit = new Date(iso).getTime();
      firstShift = Math.max(0, Math.round((tExit - tEntry) / 60000));
    }

    totalWorkedMinutesToday = firstShift + secondShift;
    const standardDailyMinutes = 440; // 7h20 padrão 6x1
    overtimeMinutesToday = Math.max(0, totalWorkedMinutesToday - standardDailyMinutes);
  }

  // Atualiza lastUsedAt do dispositivo
  if (deviceResult.deviceId && Array.isArray(db.hrDeviceWhitelist)) {
    const devRecord = db.hrDeviceWhitelist.find(d => String(d.deviceId) === String(deviceResult.deviceId));
    if (devRecord) {
      devRecord.lastUsedAt = iso;
    }
  }

  const record = {
    id: punchId,
    employeeId: employee.id,
    employeeName: employee.name,
    employeeMatricula: employee.matricula,
    date,
    timestamp: iso,
    time,
    punchType: normType,
    punchTypeLabel: PUNCH_TYPE_LABELS[normType] || normType,
    nsr,
    selfieHash: selfieResult.hash || "hash_ausente",
    selfieUrl: payload.selfie && payload.selfie.length < 500000 ? payload.selfie : null,
    withinGeofence: geofenceResult.isWithin,
    distanceMeters: geofenceResult.distanceMeters,
    geolocation: {
      lat: payload.geolocation?.lat ?? null,
      lng: payload.geolocation?.lng ?? null,
      accuracyMeters: geofenceResult.accuracyMeters || 0,
      distanceToHotelMeters: geofenceResult.distanceMeters,
      isWithinGeofence: geofenceResult.isWithin
    },
    device: {
      deviceId: deviceResult.deviceId || "unknown",
      deviceLabel: deviceResult.deviceLabel || "Dispositivo Pessoal",
      isAuthorized: deviceResult.isAuthorized,
      platform: payload.device?.platform || "mobile",
      ip: payload.device?.ip || "127.0.0.1"
    },
    deviceAuthorized: deviceResult.isAuthorized,
    complianceStatus: compliance.status || (compliance.overridden ? "overridden" : (compliance.warnings?.length ? "warning" : "approved")),
    overridden: compliance.overridden === true,
    workedMinutesFirstShift,
    lunchIntervalMinutes,
    totalWorkedMinutesToday,
    overtimeMinutesToday,
    complianceViolations: compliance.violations || [],
    source: deviceResult.isOfficialTerminal ? "terminal" : (source || "mobile"),
    adjustments: [],
    createdAt: iso,
    updatedAt: iso
  };

  if (!Array.isArray(db.hrTimeRecords)) db.hrTimeRecords = [];
  db.hrTimeRecords.push(record);

  // Comprovante de Registro de Ponto do Trabalhador per Portaria 671 MTP
  const receipt = {
    employerName: "CorpFlats Soho Residence (Campos dos Goytacazes/RJ)",
    employerAddress: "Rua Tenente Coronel Cardoso, 450 - Centro",
    employeeName: employee.name,
    employeeMatricula: employee.matricula,
    employeeCpf: employee.cpf,
    date,
    time,
    punchType: record.punchTypeLabel,
    nsr,
    hashSha256: crypto.createHash("sha256").update(`${record.id}:${record.nsr}:${record.selfieHash}`).digest("hex"),
    deviceInfo: `${record.device.platform} (${record.device.deviceId})`,
    issuedAt: iso
  };

  let whatsappNotification = { sent: false, balanceMinutes: 0, formattedBalance: "+00:00" };
  try {
    const balance = calculateMonthlyHourBalance(db, employee.id, date);
    sendPunchReceipt(db, record, employee).catch(() => {});
    whatsappNotification = {
      sent: true,
      simulated: true,
      balanceMinutes: balance.balanceMinutes,
      formattedBalance: balance.formattedBalance
    };
  } catch {
    // Fail-safe
  }

  return {
    success: true,
    record,
    receipt,
    compliance,
    whatsappNotification
  };
}

/**
 * Alias recordPunch para registerPunch
 */
export const recordPunch = registerPunch;

/**
 * Consulta de Registros de Ponto Filtrados (GET /api/hr/timekeeping/records)
 */
export function getTimeRecords(db, query = {}) {
  const records = Array.isArray(db.hrTimeRecords) ? db.hrTimeRecords : [];

  if (query.employeeId && (isPrestadora({ id: query.employeeId }) || query.employeeId === "2" || query.employeeId === "3")) {
    return [];
  }

  return records
    .filter(r => {
      if (query.employeeId && String(r.employeeId) !== String(query.employeeId)) return false;
      if (query.date && r.date !== query.date) return false;
      if (query.startDate && r.date < query.startDate) return false;
      if (query.endDate && r.date > query.endDate) return false;
      if (query.punchType && r.punchType !== query.punchType) return false;
      return true;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Consolidação do Espelho Diário de Ponto da Equipe (GET /api/hr/timekeeping/daily-sheet)
 */
export function getDailySheet(db, targetDate) {
  const date = targetDate || getCamposLocalTime().date;
  const employees = Array.isArray(db.hrEmployees) ? db.hrEmployees.filter(isCltEmployee) : [];
  const records = Array.isArray(db.hrTimeRecords) ? db.hrTimeRecords.filter(r => r.date === date) : [];

  let activeWorking = 0;
  let onLunch = 0;
  let finished = 0;
  let notStarted = 0;

  const sheets = employees.map(emp => {
    const empPunches = records
      .filter(r => String(r.employeeId) === String(emp.id))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let status = "nao_iniciado";
    let workedMinutes = 0;
    let breakMinutes = 0;

    if (empPunches.length === 0) {
      status = "nao_iniciado";
      notStarted++;
    } else {
      const last = empPunches[empPunches.length - 1];
      if (last.punchType === "entrada" || last.punchType === "almoco_retorno" || last.punchType === "pausa_retorno") {
        status = "trabalhando";
        activeWorking++;
      } else if (last.punchType === "almoco_saida") {
        status = "em_almoco";
        onLunch++;
      } else if (last.punchType === "pausa_saida") {
        status = "em_pausa";
        activeWorking++;
      } else if (last.punchType === "saida") {
        status = "finalizado";
        finished++;
      }

      const entrada = empPunches.find(p => p.punchType === "entrada");
      const almocoSaida = empPunches.find(p => p.punchType === "almoco_saida");
      const almocoRetorno = empPunches.find(p => p.punchType === "almoco_retorno");
      const saida = empPunches.find(p => p.punchType === "saida");

      if (entrada && saida) {
        if (almocoSaida && almocoRetorno) {
          const m1 = Math.max(0, Math.round((new Date(almocoSaida.timestamp).getTime() - new Date(entrada.timestamp).getTime()) / 60000));
          const m2 = Math.max(0, Math.round((new Date(saida.timestamp).getTime() - new Date(almocoRetorno.timestamp).getTime()) / 60000));
          workedMinutes = m1 + m2;
        } else {
          workedMinutes = Math.max(0, Math.round((new Date(saida.timestamp).getTime() - new Date(entrada.timestamp).getTime()) / 60000));
        }
      } else if (entrada && !saida) {
        if (almocoSaida && !almocoRetorno) {
          workedMinutes = Math.max(0, Math.round((new Date(almocoSaida.timestamp).getTime() - new Date(entrada.timestamp).getTime()) / 60000));
        }
      }

      if (almocoSaida && almocoRetorno) {
        breakMinutes = Math.max(0, Math.round((new Date(almocoRetorno.timestamp).getTime() - new Date(almocoSaida.timestamp).getTime()) / 60000));
      }
    }

    const expectedMinutes = 440; // 7h20 padrão 6x1
    const balanceMinutes = workedMinutes - expectedMinutes;

    return {
      employeeId: emp.id,
      matricula: emp.matricula,
      name: emp.name,
      role: emp.role,
      department: emp.department,
      status,
      punches: empPunches.map(p => ({
        id: p.id,
        type: p.punchType,
        label: p.punchTypeLabel,
        time: p.time,
        nsr: p.nsr,
        distanceMeters: p.geolocation.distanceToHotelMeters,
        withinGeofence: p.geolocation.isWithinGeofence,
        deviceAuthorized: p.device.isAuthorized,
        complianceStatus: p.complianceStatus
      })),
      workedMinutes,
      totalWorkedMinutes: workedMinutes,
      breakMinutes,
      expectedMinutes,
      balanceMinutes
    };
  });

  return {
    success: true,
    date,
    totalEmployees: employees.length,
    summary: { activeWorking, onLunch, finished, notStarted },
    dailySheets: sheets,
    sheets
  };
}

/**
 * Espelho Mensal de Ponto per Colaborador (GET /api/hr/timekeeping/monthly-mirror/:employeeId)
 */
export function getMonthlyMirror(db, employeeId, targetMonth) {
  if (isPrestadora({ id: employeeId }) || String(employeeId) === "2" || String(employeeId) === "3" || String(employeeId).toLowerCase() === "cris" || String(employeeId).toLowerCase() === "grazi") {
    const err = new Error("[CRITICAL_SECURITY_VIOLATION] Consulta de espelho de ponto proibida para prestadoras autônomas.");
    err.statusCode = 403;
    throw err;
  }

  const employee = getEmployeeRawById(db, employeeId);
  if (!employee) {
    const err = new Error("Colaborador CLT não encontrado");
    err.statusCode = 404;
    throw err;
  }

  const currentCampos = getCamposLocalTime();
  const month = targetMonth || currentCampos.date.substring(0, 7); // YYYY-MM
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const mIndex = Number(monthStr) - 1;

  const daysInMonth = new Date(year, mIndex + 1, 0).getDate();
  const allRecords = Array.isArray(db.hrTimeRecords)
    ? db.hrTimeRecords.filter(r => String(r.employeeId) === String(employee.id) && r.date.startsWith(month))
    : [];

  const days = [];
  let totalWorkedMinutes = 0;
  let totalExpectedMinutes = 0;
  let totalOvertimeMinutes50 = 0;
  let totalOvertimeMinutes100 = 0;
  let totalNightMinutes = 0;
  let daysWorked = 0;
  let daysDsr = 0;

  const weekDayMap = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = String(d).padStart(2, "0");
    const dateStr = `${month}-${dayStr}`;
    const dateObj = new Date(year, mIndex, d, 12, 0, 0);
    const dayOfWeek = weekDayMap[dateObj.getDay()];

    const isDsr = (employee.defaultSchedule?.weeklyRestDay || "segunda").toLowerCase() === dayOfWeek;
    if (isDsr) daysDsr++;

    const dayPunches = allRecords
      .filter(r => r.date === dateStr)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let dayWorkedMin = 0;
    const entrada = dayPunches.find(p => p.punchType === "entrada");
    const almocoSaida = dayPunches.find(p => p.punchType === "almoco_saida");
    const almocoRetorno = dayPunches.find(p => p.punchType === "almoco_retorno");
    const saida = dayPunches.find(p => p.punchType === "saida");

    if (entrada && saida) {
      if (almocoSaida && almocoRetorno) {
        const m1 = Math.max(0, Math.round((new Date(almocoSaida.timestamp).getTime() - new Date(entrada.timestamp).getTime()) / 60000));
        const m2 = Math.max(0, Math.round((new Date(saida.timestamp).getTime() - new Date(almocoRetorno.timestamp).getTime()) / 60000));
        dayWorkedMin = m1 + m2;
      } else {
        dayWorkedMin = Math.max(0, Math.round((new Date(saida.timestamp).getTime() - new Date(entrada.timestamp).getTime()) / 60000));
      }
    }

    if (dayWorkedMin > 0) daysWorked++;

    const expectedMin = isDsr ? 0 : 440;
    let overtime50 = 0;
    let overtime100 = 0;

    if (isDsr && dayWorkedMin > 0) {
      overtime100 = dayWorkedMin; // Trabalho em DSR é 100%
    } else if (dayWorkedMin > (expectedMin + 10)) { // Tolerância Art. 58 §1º
      overtime50 = dayWorkedMin - expectedMin;
    }

    totalWorkedMinutes += dayWorkedMin;
    totalExpectedMinutes += expectedMin;
    totalOvertimeMinutes50 += overtime50;
    totalOvertimeMinutes100 += overtime100;

    days.push({
      date: dateStr,
      dayOfWeek,
      isDsr,
      punches: {
        entrada: entrada?.time || null,
        almoco_saida: almocoSaida?.time || null,
        almoco_retorno: almocoRetorno?.time || null,
        saida: saida?.time || null
      },
      workedMinutes: dayWorkedMin,
      expectedMinutes: expectedMin,
      overtimeMinutes50: overtime50,
      overtimeMinutes100: overtime100,
      dailyBalanceMinutes: dayWorkedMin - expectedMin
    });
  }

  const netBalanceMinutes = totalWorkedMinutes - totalExpectedMinutes;

  return {
    success: true,
    employee: {
      id: employee.id,
      matricula: employee.matricula,
      name: employee.name,
      cpf: employee.cpf,
      ctps: `${employee.ctpsNumber} / ${employee.ctpsSeries} - ${employee.ctpsUf}`,
      role: employee.role,
      admissionDate: employee.admissionDate,
      workRegime: employee.workRegime
    },
    company: {
      name: "CorpFlats Soho Residence",
      address: "Rua Tenente Coronel Cardoso, 450 - Campos dos Goytacazes/RJ"
    },
    period: {
      month,
      startDate: `${month}-01`,
      endDate: `${month}-${String(daysInMonth).padStart(2, "0")}`,
      totalDays: daysInMonth
    },
    days,
    totals: {
      daysWorked,
      daysDsr,
      totalWorkedMinutes,
      totalExpectedMinutes,
      totalOvertimeMinutes50,
      totalOvertimeMinutes100,
      totalNightMinutes,
      netBalanceMinutes
    }
  };
}

/**
 * Ajuste / Abono Manual de Batida pelo Gestor (POST /api/hr/timekeeping/records/:id/adjust)
 */
export function adjustTimeRecord(db, recordId, payload = {}, author = "admin") {
  const { newTime, newPunchType, reason, adminPassword } = payload;

  if (!newTime || !reason) {
    throw new Error("Novo horário ('newTime') e justificativa ('reason') são obrigatórios");
  }

  const records = Array.isArray(db.hrTimeRecords) ? db.hrTimeRecords : [];
  const record = records.find(r => String(r.id) === String(recordId));

  if (!record) {
    const err = new Error("Registro de ponto não encontrado");
    err.statusCode = 404;
    throw err;
  }

  if (isPrestadora({ id: record.employeeId })) {
    const err = new Error("[CRITICAL_SECURITY_VIOLATION] Bloqueio: tentativa de ajustar ponto para prestadora");
    err.statusCode = 403;
    throw err;
  }

  const nsrAdjustment = getNextNsr(db);
  const nowIso = new Date().toISOString();

  const adjustmentEntry = {
    adjustmentId: `adj_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`,
    adjustedAt: nowIso,
    adjustedBy: author || "admin",
    previousTime: record.time,
    newTime,
    previousPunchType: record.punchType,
    newPunchType: newPunchType || record.punchType,
    reason,
    nsrAdjustment,
    hashSha256: crypto.createHash("sha256").update(`${record.id}:${newTime}:${reason}:${nsrAdjustment}`).digest("hex")
  };

  if (!Array.isArray(record.adjustments)) record.adjustments = [];
  record.adjustments.push(adjustmentEntry);

  record.time = newTime;
  if (newPunchType) {
    record.punchType = newPunchType;
    record.punchTypeLabel = PUNCH_TYPE_LABELS[newPunchType] || newPunchType;
  }
  record.isAdjusted = true;
  record.updatedAt = nowIso;

  return record;
}

/**
 * Gestão de Whitelist de Aparelhos (GET, POST, PATCH, DELETE)
 */
export function getDeviceWhitelist(db) {
  const list = Array.isArray(db.hrDeviceWhitelist) ? db.hrDeviceWhitelist : [];
  const settings = db.hrSettings?.deviceWhitelist || {};
  return {
    enabled: settings.enabled === true || db.hrSettings?.deviceWhitelistEnabled === true,
    enforceStrict: Boolean(settings.enforceStrict),
    total: list.length,
    devices: list
  };
}

export const getWhitelistedDevices = getDeviceWhitelist;

export function authorizeDevice(db, payload = {}, author = "admin") {
  const { deviceId, label, employeeId, platform } = payload;
  if (!deviceId || !label) {
    throw new Error("'deviceId' e 'label' são obrigatórios para autorizar um dispositivo");
  }

  if (!Array.isArray(db.hrDeviceWhitelist)) db.hrDeviceWhitelist = [];

  const existing = db.hrDeviceWhitelist.find(d => String(d.deviceId) === String(deviceId));
  const nowIso = new Date().toISOString();

  if (existing) {
    existing.label = label;
    existing.employeeId = employeeId || null;
    existing.platform = platform || existing.platform || "mobile";
    existing.active = true;
    existing.authorizedBy = author;
    existing.updatedAt = nowIso;
    return existing;
  }

  const newDevice = {
    id: `dev_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`,
    deviceId: String(deviceId).trim(),
    label: String(label).trim(),
    employeeId: employeeId || null,
    platform: platform || "mobile",
    registeredAt: nowIso,
    authorizedBy: author,
    active: true,
    lastUsedAt: null
  };

  db.hrDeviceWhitelist.push(newDevice);
  return newDevice;
}

export function updateDeviceSettings(db, settings = {}) {
  if (!db.hrSettings) db.hrSettings = {};
  if (!db.hrSettings.deviceWhitelist) db.hrSettings.deviceWhitelist = {};

  if (settings.enabled !== undefined) {
    db.hrSettings.deviceWhitelist.enabled = Boolean(settings.enabled);
    db.hrSettings.deviceWhitelistEnabled = Boolean(settings.enabled);
  }
  if (settings.enforceStrict !== undefined) {
    db.hrSettings.deviceWhitelist.enforceStrict = Boolean(settings.enforceStrict);
  }
  db.hrSettings.updatedAt = new Date().toISOString();

  return db.hrSettings.deviceWhitelist;
}

export function deauthorizeDevice(db, deviceId) {
  if (!deviceId) throw new Error("deviceId é obrigatório");
  const list = Array.isArray(db.hrDeviceWhitelist) ? db.hrDeviceWhitelist : [];
  const found = list.find(d => String(d.deviceId) === String(deviceId));
  if (!found) {
    const err = new Error("Dispositivo não encontrado na Whitelist");
    err.statusCode = 404;
    throw err;
  }
  found.active = false;
  found.updatedAt = new Date().toISOString();
  return found;
}

export const removeDevice = deauthorizeDevice;

import {
  getDefaultHrEmployees,
  isPrestadora,
  isCltEmployee,
  validateRecipientNotPrestador,
  getEmployees,
  getEmployeeById,
  getEmployeeRawById,
  createEmployee,
  updateEmployee,
  sanitizeEmployee,
  hashPin
} from "./employees.mjs";

import {
  HOTEL_COORDINATES,
  PUNCH_TYPES,
  PUNCH_TYPE_LABELS,
  calculateDistanceHaversine,
  checkGeofence,
  validateAndHashSelfie,
  calculateSelfieHash,
  checkDeviceWhitelist,
  checkDeviceAuthorization,
  getNextNsr,
  getCamposLocalTime,
  registerPunch,
  recordPunch,
  getTimeRecords,
  getDailySheet,
  getMonthlyMirror,
  adjustTimeRecord,
  getDeviceWhitelist,
  getWhitelistedDevices,
  authorizeDevice,
  updateDeviceSettings,
  deauthorizeDevice,
  removeDevice
} from "./timekeeping.mjs";

import {
  verifyAdminPassword,
  authenticateAdminOverride,
  recordComplianceAudit,
  validatePunchCompliance,
  getComplianceRules,
  updateComplianceRule,
  getComplianceAudits
} from "./compliance.mjs";

import {
  maskCpf,
  formatHourBalance,
  formatMinutesToHours,
  generateRepPReceiptText,
  calculateMonthlyHourBalance,
  sendPunchReceipt,
  isDaySilencedForEmployee,
  checkEmployeeReminders,
  processRemindersScan,
  getWhatsAppLogs,
  initHrWhatsAppAutomation
} from "./whatsapp-automation.mjs";

import {
  getOfficialHolidays,
  generateMonthlySchedule,
  getSchedules,
  updateSchedule,
  calculatePunchTolerance,
  calculateDayOvertimeAndNight,
  calculateNightShiftAndExtension,
  validateSundayRotation,
  validateVacationSchedule,
  getVacations,
  scheduleVacation
} from "./schedules.mjs";

import { createHrRouter } from "./router.mjs";

import {
  EMPLOYER_INFO,
  INSS_BRACKETS_2026,
  INSS_CEILING_2026,
  INSS_MAX_BASE_2026,
  calculateInssProgressive,
  calculateDsrReflex,
  getMonthWorkingAndDsrDays,
  formatCurrencyInWords,
  calculateMonthlyPayroll,
  generatePayslip,
  registerPayrollPayment,
  closeMonthlyPayroll,
  getPayrollRecords
} from "./payroll.mjs";

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
} from "./contracts-aso.mjs";

/**
 * Configurações Padrão de Ponto e Cerca Virtual (Soho Residence)
 */
export function getDefaultHrSettings() {
  return {
    geofence: {
      enabled: true,
      latitude: -21.7584,
      longitude: -41.3262,
      radiusMeters: 150,
      locationName: "CorpFlats Soho Residence (Campos dos Goytacazes/RJ)"
    },
    deviceWhitelist: {
      enabled: false,
      enforceStrict: false
    },
    lastNsr: 1000,
    toleranceMinutes: 10,
    dailyMaxWorkHours: 10,
    dailyMaxOvertimeHours: 2,
    minimumIntershiftRestHours: 11,
    minimumIntrashiftLunchMinutes: 60,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Catálogo Padrão de 10 Regras de Conformidade Trabalhista e Sindical
 * 3 Níveis: alert | admin_override | hard_block
 */
export function getDefaultHrComplianceSettings() {
  const rules = {
    intrajornada_minima: {
      id: "intrajornada_minima",
      name: "Intervalo Intrajornada Mínimo de 1h (Art. 71 CLT)",
      level: "admin_override",
      enabled: true,
      legalBasis: "Art. 71 CLT",
      params: { minLunchMinutes: 60, triggerThresholdMinutes: 360 }
    },
    interjornada_minima: {
      id: "interjornada_minima",
      name: "Descanso Interjornada Mínimo de 11h (Art. 66 CLT)",
      level: "admin_override",
      enabled: true,
      legalBasis: "Art. 66 CLT e Súmula 110 TST",
      params: { minIntershiftHours: 11 }
    },
    limite_horas_extras: {
      id: "limite_horas_extras",
      name: "Limite Máximo de 2 Horas Extras Diárias (Art. 59 CLT)",
      level: "admin_override",
      enabled: true,
      legalBasis: "Art. 59 CLT",
      params: { maxDailyOvertimeMinutes: 120, dailyMaxWorkHours: 10 }
    },
    maximo_dias_consecutivos: {
      id: "maximo_dias_consecutivos",
      name: "Máximo de 6 Dias Consecutivos sem DSR (OJ 410 SDI-1 TST)",
      level: "hard_block",
      enabled: true,
      legalBasis: "Art. 67 CLT e OJ 410 TST",
      params: { maxConsecutiveDays: 6 }
    },
    tolerancia_art58: {
      id: "tolerancia_art58",
      name: "Tolerância Legal de 5/10 min (Art. 58 §1º CLT)",
      level: "alert",
      enabled: true,
      legalBasis: "Art. 58 §1º CLT e Súmula 366 TST",
      params: { singlePunchToleranceMinutes: 5, dailyTotalToleranceMinutes: 10 }
    },
    geofence_violada: {
      id: "geofence_violada",
      name: "Batida Fora da Cerca Virtual do Hotel (150m)",
      level: "admin_override",
      enabled: true,
      legalBasis: "Portaria MTP nº 671/2021",
      params: { radiusMeters: 150, lat: -21.7584, lng: -41.3262 }
    },
    aparelho_nao_autorizado: {
      id: "aparelho_nao_autorizado",
      name: "Aparelho Não Autorizado na Whitelist",
      level: "admin_override",
      enabled: true,
      legalBasis: "Portaria MTP nº 671/2021",
      params: { enforceWhitelist: true }
    },
    selfie_ausente_ou_invalida: {
      id: "selfie_ausente_ou_invalida",
      name: "Selfie Ausente ou Corrompida",
      level: "hard_block",
      enabled: true,
      legalBasis: "Portaria MTP nº 671/2021",
      params: { minBytes: 200 }
    },
    trabalho_em_dsr: {
      id: "trabalho_em_dsr",
      name: "Trabalho em Dia de Folga DSR Programada",
      level: "admin_override",
      enabled: true,
      legalBasis: "Art. 67 CLT e Lei 605/49",
      params: { checkSchedule: true }
    },
    trabalho_em_ferias_ou_afastamento: {
      id: "trabalho_em_ferias_ou_afastamento",
      name: "Trabalho durante Período de Férias ou Afastamento",
      level: "hard_block",
      enabled: true,
      legalBasis: "Art. 130 e Art. 476 CLT",
      params: { blockVacation: true, blockMedicalLeave: true }
    }
  };

  // Aliases em inglês para retrocompatibilidade
  rules.intrashift_lunch_minimum = rules.intrajornada_minima;
  rules.intershift_11h_rest = rules.interjornada_minima;
  rules.daily_overtime_2h_limit = rules.limite_horas_extras;
  rules.weekly_rest_6_consecutive_days = rules.maximo_dias_consecutivos;
  rules.geofence_out_of_bounds = rules.geofence_violada;
  rules.unauthorized_device_whitelist = rules.aparelho_nao_autorizado;
  rules.vacation_period_work_block = rules.trabalho_em_ferias_ou_afastamento;
  rules.continuous_work_6h_limit = rules.intrajornada_minima;

  return {
    rules,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Inicialização e Garantia das 11 Coleções de RH no Objeto de Banco de Dados (db)
 */
export function ensureHrCollections(db) {
  if (!db || typeof db !== "object") return;

  if (!Array.isArray(db.hrEmployees) || db.hrEmployees.length === 0) {
    db.hrEmployees = getDefaultHrEmployees();
  }

  if (!Array.isArray(db.hrTimeRecords)) db.hrTimeRecords = [];
  if (!Array.isArray(db.hrSchedules)) db.hrSchedules = [];
  if (!Array.isArray(db.hrVacations)) db.hrVacations = [];
  if (!Array.isArray(db.hrWhatsAppLogs)) db.hrWhatsAppLogs = [];
  if (!Array.isArray(db.hrPayroll)) db.hrPayroll = [];
  if (!Array.isArray(db.hrContracts)) db.hrContracts = [];
  if (!Array.isArray(db.hrAso)) db.hrAso = [];
  if (!Array.isArray(db.hrAsoRecords)) db.hrAsoRecords = [];
  if (db.hrAso.length === 0 && db.hrAsoRecords.length > 0) db.hrAso = db.hrAsoRecords;
  if (db.hrAsoRecords.length === 0 && db.hrAso.length > 0) db.hrAsoRecords = db.hrAso;
  if (!Array.isArray(db.hrComplianceAudits)) db.hrComplianceAudits = [];
  if (!Array.isArray(db.hrDeviceWhitelist)) db.hrDeviceWhitelist = [];

  const defaultSettings = getDefaultHrSettings();
  if (!db.hrSettings || typeof db.hrSettings !== "object") {
    db.hrSettings = defaultSettings;
  } else {
    if (!db.hrSettings.geofence) db.hrSettings.geofence = defaultSettings.geofence;
    if (!db.hrSettings.deviceWhitelist) db.hrSettings.deviceWhitelist = defaultSettings.deviceWhitelist;
    if (db.hrSettings.lastNsr === undefined) db.hrSettings.lastNsr = defaultSettings.lastNsr;
  }

  const defaultCompliance = getDefaultHrComplianceSettings();
  if (!db.hrComplianceSettings || typeof db.hrComplianceSettings !== "object") {
    db.hrComplianceSettings = defaultCompliance;
  } else {
    if (!db.hrComplianceSettings.rules || typeof db.hrComplianceSettings.rules !== "object") {
      db.hrComplianceSettings.rules = defaultCompliance.rules;
    } else {
      // Garante que todas as 10 regras padrão existam no objeto
      for (const [k, v] of Object.entries(defaultCompliance.rules)) {
        if (!db.hrComplianceSettings.rules[k]) {
          db.hrComplianceSettings.rules[k] = v;
        }
      }
    }
  }
}


export {
  createHrRouter,
  getDefaultHrEmployees,
  isPrestadora,
  isCltEmployee,
  validateRecipientNotPrestador,
  getEmployees,
  getEmployeeById,
  getEmployeeRawById,
  createEmployee,
  updateEmployee,
  sanitizeEmployee,
  hashPin,
  HOTEL_COORDINATES,
  PUNCH_TYPES,
  PUNCH_TYPE_LABELS,
  calculateDistanceHaversine,
  checkGeofence,
  validateAndHashSelfie,
  calculateSelfieHash,
  checkDeviceWhitelist,
  checkDeviceAuthorization,
  getNextNsr,
  getCamposLocalTime,
  registerPunch,
  recordPunch,
  getTimeRecords,
  getDailySheet,
  getMonthlyMirror,
  adjustTimeRecord,
  getDeviceWhitelist,
  getWhitelistedDevices,
  authorizeDevice,
  updateDeviceSettings,
  deauthorizeDevice,
  removeDevice,
  verifyAdminPassword,
  authenticateAdminOverride,
  recordComplianceAudit,
  validatePunchCompliance,
  getComplianceRules,
  updateComplianceRule,
  getComplianceAudits,
  // M3: Automação WhatsApp
  maskCpf,
  formatHourBalance,
  formatMinutesToHours,
  generateRepPReceiptText,
  calculateMonthlyHourBalance,
  sendPunchReceipt,
  isDaySilencedForEmployee,
  checkEmployeeReminders,
  processRemindersScan,
  getWhatsAppLogs,
  initHrWhatsAppAutomation,
  // M3: Escalas, Tolerância, HE, Noturno e Férias
  getOfficialHolidays,
  generateMonthlySchedule,
  getSchedules,
  updateSchedule,
  calculatePunchTolerance,
  calculateDayOvertimeAndNight,
  calculateNightShiftAndExtension,
  validateSundayRotation,
  validateVacationSchedule,
  getVacations,
  scheduleVacation,
  // M4: Folha de Pagamento, Contratos e ASO
  EMPLOYER_INFO,
  INSS_BRACKETS_2026,
  INSS_CEILING_2026,
  INSS_MAX_BASE_2026,
  calculateInssProgressive,
  calculateDsrReflex,
  getMonthWorkingAndDsrDays,
  formatCurrencyInWords,
  calculateMonthlyPayroll,
  generatePayslip,
  registerPayrollPayment,
  closeMonthlyPayroll,
  getPayrollRecords,
  CONTRACT_TEMPLATES,
  ASO_EXAM_TYPES,
  ASO_EXAM_LABELS,
  generateContractDocument,
  signContractWithCanvas,
  getContracts,
  registerAsoExam,
  checkAsoAlerts,
  getAsoRecords
};

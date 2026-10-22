import { Router } from "express";
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  isPrestadora
} from "./employees.mjs";

import {
  registerPunch,
  getTimeRecords,
  getDailySheet,
  getMonthlyMirror,
  adjustTimeRecord,
  getDeviceWhitelist,
  authorizeDevice,
  updateDeviceSettings,
  deauthorizeDevice
} from "./timekeeping.mjs";

import {
  getComplianceRules,
  updateComplianceRule,
  validatePunchCompliance,
  getComplianceAudits
} from "./compliance.mjs";

import {
  sendPunchReceipt,
  calculateMonthlyHourBalance,
  processRemindersScan,
  getWhatsAppLogs
} from "./whatsapp-automation.mjs";

import {
  generateMonthlySchedule,
  getSchedules,
  updateSchedule,
  calculatePunchTolerance,
  calculateDayOvertimeAndNight,
  calculateNightShiftAndExtension,
  validateVacationSchedule,
  scheduleVacation,
  getVacations
} from "./schedules.mjs";

import {
  calculateMonthlyPayroll,
  closeMonthlyPayroll,
  getPayrollRecords,
  generatePayslip,
  registerPayrollPayment
} from "./payroll.mjs";

import {
  CONTRACT_TEMPLATES,
  generateContractDocument,
  signContractWithCanvas,
  getContracts,
  registerAsoExam,
  checkAsoAlerts,
  getAsoRecords
} from "./contracts-aso.mjs";

/**
 * Criação do Roteador Express do Módulo de Recursos Humanos (/api/hr)
 */
export function createHrRouter({ db, saveDatabase }) {
  const router = Router();

  // ── Rota de Healthcheck do RH ──────────────────────────────────────────────
  router.get("/health", (req, res) => {
    res.json({
      status: "ok",
      module: "hr",
      timestamp: new Date().toISOString()
    });
  });

  // ── 1. GESTÃO DE COLABORADORES CLT (/employees) ───────────────────────────

  // GET /api/hr/employees
  router.get("/employees", (req, res) => {
    try {
      const list = getEmployees(db, req.query);
      res.json({
        success: true,
        total: list.length,
        employees: list
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: `Erro ao listar funcionários CLT: ${err.message}`
      });
    }
  });

  // POST /api/hr/employees
  router.post("/employees", (req, res) => {
    try {
      const author = req.user?.username || "admin";
      const created = createEmployee(db, req.body, author);

      if (typeof saveDatabase === "function") {
        saveDatabase("hr_employee_create");
      }

      res.status(201).json({
        success: true,
        employee: created
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.message
      });
    }
  });

  // GET /api/hr/employees/:id
  router.get("/employees/:id", (req, res) => {
    try {
      const { id } = req.params;
      if (isPrestadora({ id })) {
        return res.status(404).json({
          success: false,
          error: "Funcionário CLT não encontrado"
        });
      }

      const emp = getEmployeeById(db, id);
      if (!emp) {
        return res.status(404).json({
          success: false,
          error: "Funcionário CLT não encontrado"
        });
      }

      res.json({
        success: true,
        employee: emp
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: `Erro ao buscar funcionário: ${err.message}`
      });
    }
  });

  // PATCH /api/hr/employees/:id
  router.patch("/employees/:id", (req, res) => {
    try {
      const { id } = req.params;
      if (isPrestadora({ id })) {
        return res.status(404).json({
          success: false,
          error: "Funcionário CLT não encontrado"
        });
      }

      const author = req.user?.username || "admin";
      const updated = updateEmployee(db, id, req.body, author);

      if (typeof saveDatabase === "function") {
        saveDatabase("hr_employee_update");
      }

      res.json({
        success: true,
        employee: updated
      });
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("não encontrado")) {
        return res.status(404).json({ success: false, error: msg });
      }
      if (msg.includes("Acesso negado")) {
        return res.status(403).json({ success: false, error: msg });
      }
      res.status(400).json({ success: false, error: msg });
    }
  });

  // ── 2. PONTO ELETRÔNICO E ESPELHO (/punch, /timeclock, /timekeeping/*) ───

  // Handler de batida de ponto compartilhado entre /punch e alias /timeclock
  const handlePunch = (req, res) => {
    try {
      const rawId = req.body?.employeeId;
      const idStr = String(rawId || "").toLowerCase().trim();

      // Blindagem estrita de Cris e Grazi
      if (
        rawId === 2 ||
        rawId === 3 ||
        idStr === "2" ||
        idStr === "3" ||
        idStr === "cris" ||
        idStr === "grazi" ||
        isPrestadora({ id: rawId, employeeId: rawId, username: rawId, name: rawId })
      ) {
        return res.status(403).json({
          success: false,
          error: "Prestadora de serviço autônoma (Cris ou Grazi) não é funcionária CLT e não pode registrar ponto.",
          code: "PRESTADORA_POINT_BLOCKED"
        });
      }

      const author = req.user?.username || req.body?.device?.deviceId || "mobile";
      const result = registerPunch(db, req.body, author);

      if (typeof saveDatabase === "function") {
        saveDatabase("hr_punch_record");
      }

      res.status(201).json(result);
    } catch (err) {
      const status = err.statusCode || (err.compliance?.badPassword ? 403 : (err.compliance?.actionRequired === "hard_block" ? 400 : 422));
      res.status(status).json({
        success: false,
        error: err.message,
        code: err.code || (err.compliance ? "COMPLIANCE_BLOCKED" : "PUNCH_FAILED"),
        actionRequired: err.actionRequired || err.compliance?.actionRequired || null,
        ruleId: err.ruleId || err.compliance?.ruleId || null,
        distanceMeters: err.distanceMeters || err.compliance?.distanceMeters || undefined,
        compliance: err.compliance || null
      });
    }
  };

  // POST /api/hr/punch e alias POST /api/hr/timeclock
  router.post("/punch", handlePunch);
  router.post("/timeclock", handlePunch);

  // GET /api/hr/timekeeping/records
  router.get("/timekeeping/records", (req, res) => {
    try {
      const records = getTimeRecords(db, req.query);
      res.json({
        success: true,
        total: records.length,
        records
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/hr/timekeeping/daily-sheet
  router.get("/timekeeping/daily-sheet", (req, res) => {
    try {
      const sheet = getDailySheet(db, req.query.date);
      res.json(sheet);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/hr/timekeeping/monthly-mirror/:employeeId
  router.get("/timekeeping/monthly-mirror/:employeeId", (req, res) => {
    try {
      const { employeeId } = req.params;
      const { month } = req.query;
      const mirror = getMonthlyMirror(db, employeeId, month);
      res.json(mirror);
    } catch (err) {
      res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  });

  // POST /api/hr/timekeeping/records/:id/adjust
  router.post("/timekeeping/records/:id/adjust", (req, res) => {
    try {
      const author = req.user?.username || req.body?.adminName || "admin";
      const adjusted = adjustTimeRecord(db, req.params.id, req.body, author);

      if (typeof saveDatabase === "function") {
        saveDatabase("hr_punch_adjust");
      }

      res.json({
        success: true,
        record: adjusted
      });
    } catch (err) {
      res.status(err.statusCode || 400).json({ success: false, error: err.message });
    }
  });

  // ── 3. GESTÃO DE DISPOSITIVOS E WHITELIST (/devices) ──────────────────────

  // GET /api/hr/devices
  router.get("/devices", (req, res) => {
    try {
      const data = getDeviceWhitelist(db);
      res.json({ success: true, ...data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/hr/devices/authorize
  router.post("/devices/authorize", (req, res) => {
    try {
      const author = req.user?.username || "admin";
      const device = authorizeDevice(db, req.body, author);

      if (typeof saveDatabase === "function") {
        saveDatabase("hr_device_authorize");
      }

      res.status(201).json({ success: true, device });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/hr/devices/settings
  router.patch("/devices/settings", (req, res) => {
    try {
      const updated = updateDeviceSettings(db, req.body);

      if (typeof saveDatabase === "function") {
        saveDatabase("hr_device_settings");
      }

      res.json({ success: true, settings: updated });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/hr/devices/:deviceId
  router.delete("/devices/:deviceId", (req, res) => {
    try {
      const deactivated = deauthorizeDevice(db, req.params.deviceId);

      if (typeof saveDatabase === "function") {
        saveDatabase("hr_device_deauthorize");
      }

      res.json({ success: true, device: deactivated });
    } catch (err) {
      res.status(err.statusCode || 400).json({ success: false, error: err.message });
    }
  });

  // ── 4. MOTOR DE CONFORMIDADE TRABALHISTA (/compliance) ────────────────────

  // GET /api/hr/compliance/rules
  router.get("/compliance/rules", (req, res) => {
    try {
      const rules = getComplianceRules(db);
      res.json({
        success: true,
        total: rules.length,
        rules
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/hr/compliance/rules/:ruleId
  router.patch("/compliance/rules/:ruleId", (req, res) => {
    try {
      const updated = updateComplianceRule(db, req.params.ruleId, req.body);

      if (typeof saveDatabase === "function") {
        saveDatabase("hr_compliance_rule_update");
      }

      res.json({
        success: true,
        rule: updated
      });
    } catch (err) {
      res.status(err.statusCode || 400).json({ success: false, error: err.message });
    }
  });

  // POST /api/hr/compliance/validate
  router.post("/compliance/validate", (req, res) => {
    try {
      const rawId = req.body?.employeeId;
      const idStr = String(rawId || "").toLowerCase().trim();

      // Blindagem estrita de Cris e Grazi: HTTP 403 Forbidden
      if (
        rawId === 2 ||
        rawId === 3 ||
        idStr === "2" ||
        idStr === "3" ||
        idStr === "cris" ||
        idStr === "grazi" ||
        isPrestadora({ id: rawId, employeeId: rawId, username: rawId, name: rawId })
      ) {
        return res.status(403).json({
          success: false,
          allowed: false,
          actionRequired: "hard_block",
          ruleId: "prestadora_bloqueada",
          error: "Prestadora de serviço autônoma (Cris ou Grazi) não é funcionária CLT e não pode ser validada no motor CLT."
        });
      }

      const result = validatePunchCompliance(db, null, req.body, { source: "preflight" });

      if (!result.allowed) {
        const statusCode = (result.ruleId === "prestadora_bloqueada" || result.badPassword)
          ? 403
          : (result.actionRequired === "hard_block" ? 400 : 422);

        return res.status(statusCode).json({
          success: false,
          ...result
        });
      }

      res.status(200).json({
        success: true,
        ...result
      });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/hr/compliance/audits
  router.get("/compliance/audits", (req, res) => {
    try {
      const result = getComplianceAudits(db, req.query);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── 5. AUTOMAÇÃO WHATSAPP & COMPROVANTES REP-P (/whatsapp/*) ───────────────

  // POST /api/hr/whatsapp/send-receipt
  router.post("/whatsapp/send-receipt", async (req, res) => {
    try {
      const rawId = req.body?.employeeId;
      const idStr = String(rawId || "").toLowerCase().trim();

      // Blindagem estrita de Cris e Grazi: HTTP 403 Forbidden
      if (
        rawId === 2 ||
        rawId === 3 ||
        idStr === "2" ||
        idStr === "3" ||
        idStr === "cris" ||
        idStr === "grazi" ||
        isPrestadora({ id: rawId, employeeId: rawId, username: rawId, name: rawId })
      ) {
        return res.status(403).json({
          success: false,
          error: "Prestadora de serviço autônoma (Cris ou Grazi) não é funcionária CLT e não pode receber comprovantes de ponto.",
          code: "PRESTADORA_RECEIPT_BLOCKED"
        });
      }

      let punch = null;
      if (req.body?.punchId) {
        punch = (db.hrTimeRecords || []).find(r => r.id === req.body.punchId);
      }
      if (!punch && req.body?.employeeId) {
        // Encontra a batida mais recente do colaborador
        const records = (db.hrTimeRecords || [])
          .filter(r => String(r.employeeId) === String(req.body.employeeId))
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        punch = records[0];
      }

      if (!punch) {
        punch = {
          id: req.body?.punchId || `punch_${Date.now()}`,
          employeeId: req.body?.employeeId || "emp_cozinha_01",
          date: new Date().toISOString().substring(0, 10),
          time: new Date().toISOString().substring(11, 19),
          punchType: "entrada",
          punchTypeLabel: "1ª Entrada",
          nsr: 1042
        };
      }

      const result = await sendPunchReceipt(db, punch);
      if (typeof saveDatabase === "function") {
        saveDatabase("hr_whatsapp_send_receipt");
      }

      res.json(result);
    } catch (err) {
      const status = (err.code === "PRESTADORA_SECURITY_BLOCK" || err.message?.includes("CRITICAL_SECURITY_VIOLATION")) ? 403 : 400;
      res.status(status).json({ success: false, error: err.message });
    }
  });

  // POST /api/hr/whatsapp/check-reminders
  router.post("/whatsapp/check-reminders", async (req, res) => {
    try {
      const currentTimeStr = req.body?.currentTimeStr || (req.body?.date && req.body?.time ? `${req.body.date}T${req.body.time}:00.000Z` : null);
      const result = await processRemindersScan(db, currentTimeStr, req.body);
      if (typeof saveDatabase === "function") {
        saveDatabase("hr_whatsapp_check_reminders");
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/hr/whatsapp/logs
  router.get("/whatsapp/logs", (req, res) => {
    try {
      const logs = getWhatsAppLogs(db, req.query);
      res.json({
        success: true,
        total: logs.length,
        logs
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/hr/whatsapp/balance/:employeeId
  router.get("/whatsapp/balance/:employeeId", (req, res) => {
    try {
      const { employeeId } = req.params;
      const idStr = String(employeeId || "").toLowerCase().trim();

      if (
        employeeId === "2" ||
        employeeId === "3" ||
        idStr === "cris" ||
        idStr === "grazi" ||
        isPrestadora({ id: employeeId })
      ) {
        return res.status(403).json({
          success: false,
          error: "Prestadora de serviço autônoma não possui banco de horas CLT.",
          code: "PRESTADORA_BALANCE_BLOCKED"
        });
      }

      const balance = calculateMonthlyHourBalance(db, employeeId, req.query?.date);
      res.json({
        success: true,
        ...balance
      });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // ── 6. ESCALAS, TOLERÂNCIA ART. 58 E HORAS EXTRAS (/schedules/*) ───────────

  // GET /api/hr/schedules
  router.get("/schedules", (req, res) => {
    try {
      const schedules = getSchedules(db, req.query);
      res.json({
        success: true,
        total: schedules.length,
        schedules
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/hr/schedules/generate-month
  router.post("/schedules/generate-month", (req, res) => {
    try {
      const { employeeId, yearMonth, modality, dsrDayOfWeek } = req.body;
      const idStr = String(employeeId || "").toLowerCase().trim();

      if (
        employeeId === "2" ||
        employeeId === "3" ||
        idStr === "cris" ||
        idStr === "grazi" ||
        isPrestadora({ id: employeeId })
      ) {
        return res.status(403).json({
          success: false,
          error: "Prestadora de serviço autônoma não possui escala CLT.",
          code: "PRESTADORA_SCHEDULE_BLOCKED"
        });
      }

      const schedules = generateMonthlySchedule(db, employeeId, yearMonth, req.body);
      if (typeof saveDatabase === "function") {
        saveDatabase("hr_schedules_generate_month");
      }

      res.status(201).json({
        success: true,
        count: schedules.length,
        schedules
      });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // PUT /api/hr/schedules/:id
  router.put("/schedules/:id", (req, res) => {
    try {
      const updated = updateSchedule(db, req.params.id, req.body);
      if (typeof saveDatabase === "function") {
        saveDatabase("hr_schedules_update");
      }
      res.json({
        success: true,
        schedule: updated
      });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/hr/schedules/calculate-overtime-night
  router.post("/schedules/calculate-overtime-night", (req, res) => {
    try {
      const { schedule, punches } = req.body;
      const overtime = calculateDayOvertimeAndNight(schedule, punches);
      const nightShift = calculateNightShiftAndExtension(punches);
      res.json({
        success: true,
        overtime,
        nightShift
      });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // ── 7. GESTÃO DE FÉRIAS CLT (/vacations/*) ─────────────────────────────────

  // GET /api/hr/vacations/:employeeId
  router.get("/vacations/:employeeId", (req, res) => {
    try {
      const { employeeId } = req.params;
      const idStr = String(employeeId || "").toLowerCase().trim();

      if (
        employeeId === "2" ||
        employeeId === "3" ||
        idStr === "cris" ||
        idStr === "grazi" ||
        isPrestadora({ id: employeeId })
      ) {
        return res.status(403).json({
          success: false,
          error: "Prestadora de serviço autônoma não possui férias CLT.",
          code: "PRESTADORA_VACATION_BLOCKED"
        });
      }

      const currentDate = req.query.currentDate || req.query.date || null;
      const vacations = getVacations(db, employeeId, { currentDate });
      res.json({
        success: true,
        total: vacations.length,
        vacations
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/hr/vacations/schedule
  router.post("/vacations/schedule", (req, res) => {
    try {
      const { employeeId } = req.body;
      const idStr = String(employeeId || "").toLowerCase().trim();

      if (
        employeeId === "2" ||
        employeeId === "3" ||
        idStr === "cris" ||
        idStr === "grazi" ||
        isPrestadora({ id: employeeId })
      ) {
        return res.status(403).json({
          success: false,
          error: "Prestadora de serviço autônoma não possui férias CLT.",
          code: "PRESTADORA_VACATION_BLOCKED"
        });
      }

      const vacation = scheduleVacation(db, employeeId, req.body);
      if (typeof saveDatabase === "function") {
        saveDatabase("hr_vacations_schedule");
      }

      res.status(201).json({
        success: true,
        vacation
      });
    } catch (err) {
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message,
        code: err.code || "VACATION_SCHEDULE_ERROR"
      });
    }
  });

  // PATCH /api/hr/vacations/:id/approve
  router.patch("/vacations/:id/approve", (req, res) => {
    try {
      const { id } = req.params;
      const list = Array.isArray(db.hrVacations) ? db.hrVacations : [];
      const vac = list.find(v => v.id === id);
      if (!vac) {
        return res.status(404).json({ success: false, error: `Férias ${id} não encontradas.` });
      }

      vac.status = "approved";
      vac.approvedAt = new Date().toISOString();
      vac.approvedBy = req.user?.username || "admin";

      // Efeito em cascata: atualiza escalas do colaborador no período
      if (Array.isArray(db.hrSchedules) && vac.periods) {
        for (const p of vac.periods) {
          if (p.startDate && p.endDate) {
            for (const s of db.hrSchedules) {
              if (String(s.employeeId) === String(vac.employeeId) && s.date >= p.startDate && s.date <= p.endDate) {
                s.shiftType = "vacation";
                s.status = "ferias";
                s.plannedWorkMinutes = 0;
                s.notes = "Período de férias homologadas";
              }
            }
          }
        }
      }

      if (typeof saveDatabase === "function") {
        saveDatabase("hr_vacations_approve");
      }

      res.json({
        success: true,
        vacation: vac
      });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // ── 5. FOLHA DE PAGAMENTO, HOLERITES E PIX (/payroll) ─────────────────────

  // POST /api/hr/payroll/calculate
  router.post("/payroll/calculate", (req, res) => {
    try {
      const { employeeId, yearMonth } = req.body;
      const idStr = String(employeeId || "").toLowerCase().trim();

      if (
        employeeId === 2 ||
        employeeId === 3 ||
        employeeId === "2" ||
        employeeId === "3" ||
        idStr === "cris" ||
        idStr === "grazi" ||
        isPrestadora({ id: employeeId })
      ) {
        return res.status(403).json({
          success: false,
          error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
          code: "PRESTADORA_PAYROLL_BLOCKED"
        });
      }

      if (!employeeId || !yearMonth) {
        return res.status(400).json({
          success: false,
          error: "Campos obrigatórios: employeeId e yearMonth (formato YYYY-MM)."
        });
      }

      const payroll = calculateMonthlyPayroll(db, employeeId, yearMonth, req.body);
      res.json({
        success: true,
        payroll
      });
    } catch (err) {
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message,
        code: err.code || "PAYROLL_CALCULATION_ERROR"
      });
    }
  });

  // POST /api/hr/payroll/close-month
  router.post("/payroll/close-month", (req, res) => {
    try {
      const { yearMonth, employeeId } = req.body || {};
      const idStr = String(employeeId || "").toLowerCase().trim();

      // Blindagem estrita de Cris e Grazi
      if (
        employeeId === 2 ||
        employeeId === 3 ||
        employeeId === "2" ||
        employeeId === "3" ||
        idStr === "cris" ||
        idStr === "grazi" ||
        (employeeId && isPrestadora({ id: employeeId, username: employeeId, name: employeeId }))
      ) {
        return res.status(403).json({
          success: false,
          error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
          code: "PRESTADORA_PAYROLL_BLOCKED"
        });
      }

      if (!yearMonth) {
        return res.status(400).json({
          success: false,
          error: "Campo obrigatório: yearMonth (formato YYYY-MM)."
        });
      }

      const summary = closeMonthlyPayroll(db, yearMonth, req.body);
      if (typeof saveDatabase === "function") {
        saveDatabase("hr_payroll_close_month");
      }

      res.status(201).json(summary);
    } catch (err) {
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message,
        code: err.code || "PAYROLL_CLOSE_ERROR"
      });
    }
  });

  // GET /api/hr/payroll
  router.get("/payroll", (req, res) => {
    try {
      const { employeeId } = req.query || {};
      const idStr = String(employeeId || "").toLowerCase().trim();

      if (
        employeeId === 2 ||
        employeeId === 3 ||
        employeeId === "2" ||
        employeeId === "3" ||
        idStr === "cris" ||
        idStr === "grazi" ||
        (employeeId && isPrestadora({ id: employeeId, username: employeeId, name: employeeId }))
      ) {
        return res.status(403).json({
          success: false,
          error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
          code: "PRESTADORA_PAYROLL_BLOCKED"
        });
      }

      const list = getPayrollRecords(db, req.query);
      res.json({
        success: true,
        total: list.length,
        payroll: list
      });
    } catch (err) {
      res.status(err.statusCode || 500).json({
        success: false,
        error: err.message,
        code: err.code || "PAYROLL_QUERY_ERROR"
      });
    }
  });

  // GET /api/hr/payroll/:id
  router.get("/payroll/:id", (req, res) => {
    try {
      const targetId = req.params.id;
      const targetIdStr = String(targetId || "").toLowerCase().trim();

      if (
        targetId === 2 ||
        targetId === 3 ||
        targetId === "2" ||
        targetId === "3" ||
        targetIdStr === "cris" ||
        targetIdStr === "grazi" ||
        isPrestadora({ id: targetId, username: targetId, name: targetId })
      ) {
        return res.status(403).json({
          success: false,
          error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
          code: "PRESTADORA_PAYROLL_BLOCKED"
        });
      }

      const list = Array.isArray(db.hrPayroll) ? db.hrPayroll : [];
      const record = list.find(p => p.id === targetId);
      if (!record) {
        return res.status(404).json({ success: false, error: `Registro de folha ${targetId} não encontrado.` });
      }

      const empId = record.employeeId;
      const empIdStr = String(empId || "").toLowerCase().trim();
      if (
        empId === 2 ||
        empId === 3 ||
        empId === "2" ||
        empId === "3" ||
        empIdStr === "cris" ||
        empIdStr === "grazi" ||
        isPrestadora({ id: empId, username: empId, name: empId })
      ) {
        return res.status(403).json({
          success: false,
          error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
          code: "PRESTADORA_PAYROLL_BLOCKED"
        });
      }

      res.json({ success: true, payroll: record });
    } catch (err) {
      res.status(err.statusCode || 500).json({
        success: false,
        error: err.message,
        code: err.code || "PAYROLL_GET_ERROR"
      });
    }
  });

  // GET /api/hr/payroll/:id/payslip
  router.get("/payroll/:id/payslip", (req, res) => {
    try {
      const targetId = req.params.id;
      const targetIdStr = String(targetId || "").toLowerCase().trim();

      if (
        targetId === 2 ||
        targetId === 3 ||
        targetId === "2" ||
        targetId === "3" ||
        targetIdStr === "cris" ||
        targetIdStr === "grazi" ||
        isPrestadora({ id: targetId, username: targetId, name: targetId })
      ) {
        return res.status(403).json({
          success: false,
          error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
          code: "PRESTADORA_PAYROLL_BLOCKED"
        });
      }

      const list = Array.isArray(db.hrPayroll) ? db.hrPayroll : [];
      const record = list.find(p => p.id === targetId);
      if (!record) {
        return res.status(404).json({ success: false, error: `Registro de folha ${targetId} não encontrado.` });
      }

      const empId = record.employeeId;
      const empIdStr = String(empId || "").toLowerCase().trim();
      if (
        empId === 2 ||
        empId === 3 ||
        empId === "2" ||
        empId === "3" ||
        empIdStr === "cris" ||
        empIdStr === "grazi" ||
        isPrestadora({ id: empId, username: empId, name: empId })
      ) {
        return res.status(403).json({
          success: false,
          error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
          code: "PRESTADORA_PAYROLL_BLOCKED"
        });
      }

      const payslip = generatePayslip(db, record);
      res.json({
        success: true,
        payslip
      });
    } catch (err) {
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message,
        code: err.code || "PAYROLL_PAYSLIP_ERROR"
      });
    }
  });

  // POST /api/hr/payroll/:id/pay-pix
  router.post("/payroll/:id/pay-pix", (req, res) => {
    try {
      const targetId = req.params.id;
      const targetIdStr = String(targetId || "").toLowerCase().trim();
      const bodyEmpId = req.body?.employeeId;
      const bodyEmpIdStr = String(bodyEmpId || "").toLowerCase().trim();

      if (
        targetId === 2 ||
        targetId === 3 ||
        targetId === "2" ||
        targetId === "3" ||
        targetIdStr === "cris" ||
        targetIdStr === "grazi" ||
        isPrestadora({ id: targetId, username: targetId, name: targetId }) ||
        bodyEmpId === 2 ||
        bodyEmpId === 3 ||
        bodyEmpId === "2" ||
        bodyEmpId === "3" ||
        bodyEmpIdStr === "cris" ||
        bodyEmpIdStr === "grazi" ||
        (bodyEmpId && isPrestadora({ id: bodyEmpId, username: bodyEmpId, name: bodyEmpId }))
      ) {
        return res.status(403).json({
          success: false,
          error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
          code: "PRESTADORA_PAYROLL_BLOCKED"
        });
      }

      const list = Array.isArray(db.hrPayroll) ? db.hrPayroll : [];
      const record = list.find(p => p.id === targetId);
      if (record) {
        const empId = record.employeeId;
        const empIdStr = String(empId || "").toLowerCase().trim();
        if (
          empId === 2 ||
          empId === 3 ||
          empId === "2" ||
          empId === "3" ||
          empIdStr === "cris" ||
          empIdStr === "grazi" ||
          isPrestadora({ id: empId, username: empId, name: empId })
        ) {
          return res.status(403).json({
            success: false,
            error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
            code: "PRESTADORA_PAYROLL_BLOCKED"
          });
        }
      }

      const updated = registerPayrollPayment(db, req.params.id, req.body);
      if (typeof saveDatabase === "function") {
        saveDatabase("hr_payroll_pay_pix");
      }
      res.json({
        success: true,
        payroll: updated
      });
    } catch (err) {
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message,
        code: err.code || "PAYROLL_PIX_ERROR"
      });
    }
  });

  // ── 6. CONTRATOS CLT E ASSINATURA CANVAS (/contracts) ─────────────────────

  // GET /api/hr/contracts/templates
  router.get("/contracts/templates", (req, res) => {
    try {
      res.json({
        success: true,
        templates: Object.values(CONTRACT_TEMPLATES)
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/hr/contracts/generate
  router.post("/contracts/generate", (req, res) => {
    try {
      const { templateId, employeeId, options } = req.body;
      const idStr = String(employeeId || "").toLowerCase().trim();

      if (
        employeeId === 2 ||
        employeeId === 3 ||
        employeeId === "2" ||
        employeeId === "3" ||
        idStr === "cris" ||
        idStr === "grazi" ||
        isPrestadora({ id: employeeId })
      ) {
        return res.status(403).json({
          success: false,
          error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
          code: "PRESTADORA_CONTRACT_BLOCKED"
        });
      }

      const employees = Array.isArray(db.hrEmployees) ? db.hrEmployees : [];
      const emp = employees.find(e => String(e.id) === String(employeeId));
      if (!emp) {
        return res.status(404).json({ success: false, error: `Colaborador ${employeeId} não encontrado.` });
      }

      if (!Array.isArray(db.hrContracts)) db.hrContracts = [];
      const doc = generateContractDocument(templateId, emp, { ...(options || {}), db });

      if (typeof saveDatabase === "function") {
        saveDatabase("hr_contract_generate");
      }

      res.status(201).json({
        success: true,
        contract: doc
      });
    } catch (err) {
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message,
        code: err.code || "CONTRACT_GENERATE_ERROR"
      });
    }
  });

  // POST /api/hr/contracts/:id/sign
  router.post("/contracts/:id/sign", (req, res) => {
    try {
      const contractId = req.params.id;
      const contractIdStr = String(contractId || "").toLowerCase().trim();

      // Guarda 1: req.params.id contra prestadora
      if (
        contractId === 2 ||
        contractId === 3 ||
        contractId === "2" ||
        contractId === "3" ||
        contractIdStr === "cris" ||
        contractIdStr === "grazi" ||
        isPrestadora({ id: contractId, name: contractIdStr, username: contractIdStr })
      ) {
        return res.status(403).json({
          success: false,
          error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
          code: "PRESTADORA_CONTRACT_BLOCKED"
        });
      }

      // Guarda 2: req.body.employeeId contra prestadora (se fornecido)
      const bodyEmpId = req.body?.employeeId;
      const bodyEmpIdStr = String(bodyEmpId || "").toLowerCase().trim();
      if (
        bodyEmpId !== undefined && bodyEmpId !== null && (
          bodyEmpId === 2 ||
          bodyEmpId === 3 ||
          bodyEmpId === "2" ||
          bodyEmpId === "3" ||
          bodyEmpIdStr === "cris" ||
          bodyEmpIdStr === "grazi" ||
          isPrestadora({ id: bodyEmpId, name: bodyEmpIdStr, username: bodyEmpIdStr })
        )
      ) {
        return res.status(403).json({
          success: false,
          error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
          code: "PRESTADORA_CONTRACT_BLOCKED"
        });
      }

      // Guarda 3: Consultar contrato existente na base. Se employeeId for prestadora, bloquear imediatamente
      const contractsList = Array.isArray(db.hrContracts) ? db.hrContracts : [];
      const existingContract = contractsList.find(c => String(c.id) === String(contractId));
      if (existingContract) {
        const cEmpId = existingContract.employeeId;
        const cEmpIdStr = String(cEmpId || "").toLowerCase().trim();
        if (
          cEmpId === 2 ||
          cEmpId === 3 ||
          cEmpId === "2" ||
          cEmpId === "3" ||
          cEmpIdStr === "cris" ||
          cEmpIdStr === "grazi" ||
          isPrestadora({ id: cEmpId, name: cEmpIdStr, username: cEmpIdStr })
        ) {
          return res.status(403).json({
            success: false,
            error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
            code: "PRESTADORA_CONTRACT_BLOCKED"
          });
        }
      }

      const ipAddress = req.body.ipAddress || req.ip || req.connection?.remoteAddress || "127.0.0.1";
      const userAgent = req.body.userAgent || req.headers["user-agent"] || "WebBrowser/Canvas";

      const payload = {
        ...req.body,
        ipAddress,
        userAgent
      };

      const signed = signContractWithCanvas(db, req.params.id, payload);
      if (typeof saveDatabase === "function") {
        saveDatabase("hr_contract_sign");
      }

      res.json({
        success: true,
        contract: signed
      });
    } catch (err) {
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message,
        code: err.code || "CONTRACT_SIGN_ERROR"
      });
    }
  });

  // GET /api/hr/contracts/:id
  router.get("/contracts/:id", (req, res) => {
    try {
      const { id } = req.params;
      const idStr = String(id || "").toLowerCase().trim();

      if (
        id === "2" ||
        id === "3" ||
        id === 2 ||
        id === 3 ||
        idStr === "cris" ||
        idStr === "grazi" ||
        isPrestadora({ id, name: idStr, username: idStr })
      ) {
        return res.status(403).json({
          success: false,
          error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
          code: "PRESTADORA_CONTRACT_BLOCKED"
        });
      }

      const list = Array.isArray(db.hrContracts) ? db.hrContracts : [];
      const contract = list.find(c => String(c.id) === String(id));
      if (!contract) {
        return res.status(404).json({ success: false, error: `Contrato ${id} não encontrado.` });
      }

      const cEmpId = contract.employeeId;
      const cEmpIdStr = String(cEmpId || "").toLowerCase().trim();
      if (
        cEmpId === 2 ||
        cEmpId === 3 ||
        cEmpId === "2" ||
        cEmpId === "3" ||
        cEmpIdStr === "cris" ||
        cEmpIdStr === "grazi" ||
        isPrestadora({ id: cEmpId, name: cEmpIdStr, username: cEmpIdStr })
      ) {
        return res.status(403).json({
          success: false,
          error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
          code: "PRESTADORA_CONTRACT_BLOCKED"
        });
      }

      res.json({ success: true, contract });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/hr/contracts/employee/:employeeId
  router.get("/contracts/employee/:employeeId", (req, res) => {
    try {
      const { employeeId } = req.params;
      const idStr = String(employeeId || "").toLowerCase().trim();

      if (
        employeeId === "2" ||
        employeeId === "3" ||
        employeeId === 2 ||
        employeeId === 3 ||
        idStr === "cris" ||
        idStr === "grazi" ||
        isPrestadora({ id: employeeId })
      ) {
        return res.status(403).json({
          success: false,
          error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
          code: "PRESTADORA_CONTRACT_BLOCKED"
        });
      }

      const list = getContracts(db, { employeeId });
      res.json({
        success: true,
        total: list.length,
        contracts: list
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── 7. CONTROLE DE SAÚDE OCUPACIONAL E ASO (/aso) ─────────────────────────

  // GET /api/hr/aso
  router.get("/aso", (req, res) => {
    try {
      const { employeeId } = req.query;
      if (employeeId) {
        const idStr = String(employeeId || "").toLowerCase().trim();
        if (
          employeeId === "2" ||
          employeeId === "3" ||
          employeeId === 2 ||
          employeeId === 3 ||
          idStr === "cris" ||
          idStr === "grazi" ||
          isPrestadora({ id: employeeId, name: idStr, username: idStr })
        ) {
          return res.status(403).json({
            success: false,
            error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
            code: "PRESTADORA_ASO_BLOCKED"
          });
        }
      }

      const list = getAsoRecords(db, req.query);
      res.json({
        success: true,
        total: list.length,
        asoRecords: list
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/hr/aso
  router.post("/aso", (req, res) => {
    try {
      const { employeeId } = req.body;
      const idStr = String(employeeId || "").toLowerCase().trim();

      if (
        employeeId === 2 ||
        employeeId === 3 ||
        employeeId === "2" ||
        employeeId === "3" ||
        idStr === "cris" ||
        idStr === "grazi" ||
        isPrestadora({ id: employeeId })
      ) {
        return res.status(403).json({
          success: false,
          error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
          code: "PRESTADORA_ASO_BLOCKED"
        });
      }

      const aso = registerAsoExam(db, req.body);
      if (typeof saveDatabase === "function") {
        saveDatabase("hr_aso_register");
      }

      res.status(201).json({
        success: true,
        aso
      });
    } catch (err) {
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message,
        code: err.code || "ASO_REGISTER_ERROR"
      });
    }
  });

  // GET /api/hr/aso/alerts
  router.get("/aso/alerts", (req, res) => {
    try {
      const alerts = checkAsoAlerts(db, { referenceDate: req.query.referenceDate });
      res.json({
        success: true,
        ...alerts
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/hr/aso/:id
  router.get("/aso/:id", (req, res) => {
    try {
      const { id } = req.params;
      const idStr = String(id || "").toLowerCase().trim();

      if (
        id === "2" ||
        id === "3" ||
        id === 2 ||
        id === 3 ||
        idStr === "cris" ||
        idStr === "grazi" ||
        isPrestadora({ id, name: idStr, username: idStr })
      ) {
        return res.status(403).json({
          success: false,
          error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
          code: "PRESTADORA_ASO_BLOCKED"
        });
      }

      const list = Array.isArray(db.hrAso) ? db.hrAso : (Array.isArray(db.hrAsoRecords) ? db.hrAsoRecords : []);
      const aso = list.find(a => String(a.id) === String(id));
      if (!aso) {
        return res.status(404).json({ success: false, error: `Registro de ASO ${id} não encontrado.` });
      }

      const aEmpId = aso.employeeId;
      const aEmpIdStr = String(aEmpId || "").toLowerCase().trim();
      if (
        aEmpId === 2 ||
        aEmpId === 3 ||
        aEmpId === "2" ||
        aEmpId === "3" ||
        aEmpIdStr === "cris" ||
        aEmpIdStr === "grazi" ||
        isPrestadora({ id: aEmpId, name: aEmpIdStr, username: aEmpIdStr })
      ) {
        return res.status(403).json({
          success: false,
          error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
          code: "PRESTADORA_ASO_BLOCKED"
        });
      }

      res.json({ success: true, aso });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/hr/aso/employee/:employeeId
  router.get("/aso/employee/:employeeId", (req, res) => {
    try {
      const { employeeId } = req.params;
      const idStr = String(employeeId || "").toLowerCase().trim();

      if (
        employeeId === "2" ||
        employeeId === "3" ||
        employeeId === 2 ||
        employeeId === 3 ||
        idStr === "cris" ||
        idStr === "grazi" ||
        isPrestadora({ id: employeeId })
      ) {
        return res.status(403).json({
          success: false,
          error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
          code: "PRESTADORA_ASO_BLOCKED"
        });
      }

      const list = getAsoRecords(db, { employeeId });
      res.json({
        success: true,
        total: list.length,
        asoRecords: list
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

import crypto from "crypto";
import { isPrestadora, isCltEmployee, getEmployeeRawById } from "./employees.mjs";
import { getOfficialHolidays } from "./schedules.mjs";

/**
 * Módulo de Folha de Pagamento, Holerites e Quitação PIX
 * CorpFlats Soho Residence (Campos dos Goytacazes/RJ)
 * 
 * Legislação e Jurisprudência Aplicadas:
 * - CLT (Decreto-Lei nº 5.452/1943): Arts. 58, 59, 73, 462.
 * - Súmula nº 172 do TST: Reflexo de Horas Extras no DSR.
 * - Súmula nº 60 do TST: Adicional Noturno e reflexo no DSR.
 * - Lei nº 7.418/1985 e Decreto nº 95.247/1987: Vale-Transporte (teto 6%).
 * - Portaria Interministerial MPS/MF 2026: Tabela Progressiva do INSS.
 * - Lei nº 8.036/1990: FGTS (alíquota padrão de 8%).
 */

// Razão Social e Dados Cadastrais Oficiais do Empregador
export const EMPLOYER_INFO = {
  companyName: "CorpFlats Soho Empreendimentos Hoteleiros LTDA",
  tradeName: "CorpFlats Soho Residence",
  cnpj: "12.345.678/0001-90",
  address: "Rua Tenente Coronel Cardoso, 450 - Centro",
  city: "Campos dos Goytacazes",
  state: "RJ",
  zipCode: "28010-801"
};

/**
 * Tabela Oficial do INSS Progressivo 2026 (Portaria MPS/MF)
 * Faixas e Deduções Oficiais:
 * Faixa 1 (até R$ 1.518,00): alíquota 7,5% (dedução R$ 0,00)
 * Faixa 2 (R$ 1.518,01 até R$ 2.793,88): alíquota 9,0% (dedução R$ 22,77)
 * Faixa 3 (R$ 2.793,89 até R$ 4.190,83): alíquota 12,0% (dedução R$ 106,59)
 * Faixa 4 (R$ 4.190,84 até R$ 8.157,41): alíquota 14,0% (dedução R$ 190,40)
 * Teto Máximo do INSS: R$ 951,64
 */
export const INSS_BRACKETS_2026 = [
  { bracket: 1, limit: 1518.00, rate: 0.075, deduction: 0.00 },
  { bracket: 2, limit: 2793.88, rate: 0.090, deduction: 22.77 },
  { bracket: 3, limit: 4190.83, rate: 0.120, deduction: 106.59 },
  { bracket: 4, limit: 8157.41, rate: 0.140, deduction: 190.40 }
];

export const INSS_CEILING_2026 = 951.64;
export const INSS_MAX_BASE_2026 = 8157.41;

/**
 * Cálculo do INSS pela Tabela Progressiva 2026
 * Aplica alíquotas marginais com parcelas a deduzir oficiais.
 * 
 * @param {number} baseSalary - Base de cálculo sujeita à contribuição previdenciária
 * @returns {{ inssValue: number, effectiveRate: number, bracket: number, ceilingApplied: boolean, baseSalary: number }}
 */
export function calculateInssProgressive(baseSalary) {
  const base = Math.max(0, Number(baseSalary) || 0);
  if (base === 0) {
    return {
      inssValue: 0,
      effectiveRate: 0,
      bracket: 1,
      ceilingApplied: false,
      baseSalary: 0
    };
  }

  let inssValue = 0;
  let bracket = 1;
  let ceilingApplied = false;

  if (base <= 1518.00) {
    inssValue = base * 0.075;
    bracket = 1;
  } else if (base <= 2793.88) {
    inssValue = (base * 0.09) - 22.77;
    bracket = 2;
  } else if (base <= 4190.83) {
    inssValue = (base * 0.12) - 106.59;
    bracket = 3;
  } else if (base <= 8157.41) {
    inssValue = (base * 0.14) - 190.40;
    bracket = 4;
  } else {
    inssValue = INSS_CEILING_2026;
    bracket = 4;
    ceilingApplied = true;
  }

  if (inssValue > INSS_CEILING_2026) {
    inssValue = INSS_CEILING_2026;
    ceilingApplied = true;
  }

  inssValue = Math.round(inssValue * 100) / 100;
  const effectiveRate = Number(((inssValue / base) * 100).toFixed(2));

  return {
    inssValue,
    effectiveRate,
    bracket,
    ceilingApplied,
    baseSalary: base
  };
}

/**
 * Cálculo do Reflexo de DSR (Descanso Semanal Remunerado)
 * Fórmulas Legais:
 * - Horas Extras: Súmula nº 172 do TST: `(Total de Horas Extras / Dias Úteis) * Domingos e Feriados`
 * - Adicional Noturno: Súmula nº 60, I do TST: `(Adicional Noturno / Dias Úteis) * Domingos e Feriados`
 * 
 * @param {number} amount - Valor acumulado de horas extras ou adicional noturno
 * @param {number} workingDays - Dias úteis trabalhados no mês
 * @param {number} dsrAndHolidays - Soma de domingos e feriados no mês
 * @returns {number} Valor do reflexo de DSR arredondado para 2 casas decimais
 */
export function calculateDsrReflex(amount, workingDays, dsrAndHolidays) {
  const val = Number(amount) || 0;
  const wDays = Number(workingDays) || 0;
  const dDays = Number(dsrAndHolidays) || 0;

  if (val <= 0 || wDays <= 0 || dDays <= 0) {
    return 0;
  }

  const reflex = (val / wDays) * dDays;
  return Math.round(reflex * 100) / 100;
}

/**
 * Apuração Dinâmica do Calendário Mensal: Dias Úteis e Domingos/Feriados
 * Leva em consideração domingos do mês e feriados oficiais (nacionais, RJ e Campos dos Goytacazes).
 * 
 * @param {string} yearMonth - Formato "YYYY-MM" (ex: "2026-05")
 * @returns {{ daysInMonth: number, sundaysCount: number, nonSundayHolidaysCount: number, dsrAndHolidays: number, workingDays: number }}
 */
export function getMonthWorkingAndDsrDays(yearMonth) {
  const [yearStr, monthStr] = String(yearMonth).split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const daysInMonth = new Date(year, month, 0).getDate();

  const holidays = getOfficialHolidays(year);
  const holidayDatesInMonth = new Set(
    holidays
      .filter(h => h.date.startsWith(yearMonth))
      .map(h => h.date)
  );

  let sundaysCount = 0;
  let nonSundayHolidaysCount = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, "0");
    const dateStr = `${yearMonth}-${dayStr}`;
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = dateObj.getUTCDay(); // 0 = Domingo

    if (dayOfWeek === 0) {
      sundaysCount++;
    } else if (holidayDatesInMonth.has(dateStr)) {
      nonSundayHolidaysCount++;
    }
  }

  const dsrAndHolidays = sundaysCount + nonSundayHolidaysCount;
  const workingDays = Math.max(1, daysInMonth - dsrAndHolidays);

  return {
    daysInMonth,
    sundaysCount,
    nonSundayHolidaysCount,
    dsrAndHolidays,
    workingDays
  };
}

/**
 * Conversor Numérico Monetário para Escrita por Extenso em Português
 * Suporta valores de centavos até milhões com concordância de gênero e número.
 * 
 * @param {number} value - Valor monetário em reais
 * @returns {string} Valor por extenso
 */
export function formatCurrencyInWords(value) {
  const num = Number(value);
  if (isNaN(num) || num <= 0) return "zero reais";

  const centavos = Math.round((num % 1) * 100);
  const inteiros = Math.floor(num);

  const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const especiais = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  function converterCentena(n) {
    if (n === 100) return "cem";
    const c = Math.floor(n / 100);
    const d = Math.floor((n % 100) / 10);
    const u = n % 10;
    const partes = [];

    if (c > 0) partes.push(centenas[c]);
    if (d === 1) {
      partes.push(especiais[u]);
    } else {
      if (d > 1) partes.push(dezenas[d]);
      if (u > 0) partes.push(unidades[u]);
    }
    return partes.join(" e ");
  }

  function converterMilhar(n) {
    if (n === 0) return "";
    const milhoes = Math.floor(n / 1000000);
    const milhares = Math.floor((n % 1000000) / 1000);
    const resto = n % 1000;
    const partes = [];

    if (milhoes > 0) {
      partes.push(milhoes === 1 ? "um milhão" : `${converterCentena(milhoes)} milhões`);
    }
    if (milhares > 0) {
      partes.push(milhares === 1 ? "mil" : `${converterCentena(milhares)} mil`);
    }
    if (resto > 0) {
      partes.push(converterCentena(resto));
    }
    return partes.join(" e ");
  }

  let extenso = "";
  if (inteiros > 0) {
    const textoInteiro = converterMilhar(inteiros);
    extenso += `${textoInteiro} ${inteiros === 1 ? "real" : "reais"}`;
  }

  if (centavos > 0) {
    const textoCentavos = converterCentena(centavos);
    const sufixoCentavos = `${textoCentavos} ${centavos === 1 ? "centavo" : "centavos"}`;
    if (inteiros > 0) {
      extenso += ` e ${sufixoCentavos}`;
    } else {
      extenso = sufixoCentavos;
    }
  }

  return extenso.trim();
}

/**
 * Converte string de horário "HH:MM" para minutos a partir de 00:00
 */
function timeStrToMinutes(t) {
  if (!t) return 0;
  const parts = String(t).split(":").map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

/**
 * Cálculo Mensal da Folha de Pagamento de Colaborador CLT
 * 
 * Regras:
 * - Valida colaborador CLT via isCltEmployee.
 * - Rejeita Cris e Grazi com erro HTTP 403 Forbidden.
 * - Carga mensal padrão de 220 horas para regime 44h 6x1.
 * - Valor da hora normal = salarioBase / 220.
 * - HE 50% em dias úteis e 100% em domingos e feriados.
 * - Adicional noturno urbano (22h às 05h, hora ficta 52m30s, 20%).
 * - Reflexos de DSR sobre HE (Súmula 172 TST) e Adicional Noturno (Súmula 60 TST).
 * - Descontos legais: INSS progressivo 2026, Vale-Transporte (teto 6%), atrasos/faltas, vales quinzenais.
 * - FGTS 8% sobre a remuneração bruta total.
 */
export function calculateMonthlyPayroll(db, employeeId, yearMonth, options = {}) {
  const empId = typeof employeeId === "object" ? employeeId?.id : employeeId;
  const idStr = String(empId || "").toLowerCase().trim();

  // Blindagem estrita de Cris e Grazi
  if (empId === 2 || empId === 3 || empId === "2" || empId === "3" || idStr === "cris" || idStr === "grazi" || isPrestadora({ id: empId })) {
    const err = new Error("Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).");
    err.statusCode = 403;
    err.code = "PRESTADORA_PAYROLL_BLOCKED";
    throw err;
  }

  const emp = getEmployeeRawById(db, empId);
  if (!emp) {
    const err = new Error(`Colaborador CLT ${empId} não encontrado.`);
    err.statusCode = 404;
    err.code = "EMPLOYEE_NOT_FOUND";
    throw err;
  }

  if (!isCltEmployee(emp)) {
    const err = new Error(`Colaborador ${empId} não possui regime CLT ativo.`);
    err.statusCode = 403;
    err.code = "NON_CLT_EMPLOYEE";
    throw err;
  }

  // Carga mensal e Salário Base
  const workloadHours = Number(options.workloadHours) || Number(emp.monthlyWorkloadHours) || 220;

  let baseSalary = 0;
  if (options.baseSalary !== undefined) {
    baseSalary = Number(options.baseSalary) || 0;
  } else if (emp.baseSalary && Number(emp.baseSalary) > 0) {
    baseSalary = Number(emp.baseSalary);
  } else {
    const roleLower = String(emp.role || "").toLowerCase();
    baseSalary = roleLower.includes("cozinha") ? 2400.00 : 1800.00;
  }

  const hourlyRate = Number((baseSalary / workloadHours).toFixed(4));

  // Determinação de Dias Úteis e DSR/Feriados
  let workingDays = 0;
  let dsrAndHolidays = 0;
  let daysInMonth = 30;

  if (options.workingDays !== undefined && options.dsrAndHolidays !== undefined) {
    workingDays = Number(options.workingDays);
    dsrAndHolidays = Number(options.dsrAndHolidays);
    daysInMonth = workingDays + dsrAndHolidays;
  } else {
    const cal = getMonthWorkingAndDsrDays(yearMonth);
    workingDays = cal.workingDays;
    dsrAndHolidays = cal.dsrAndHolidays;
    daysInMonth = cal.daysInMonth;
  }

  // Apuração de Horas Extras, Noturno e Atrasos
  let he50Minutes = 0;
  let he100Minutes = 0;
  let nightMinutes = 0;
  let delayMinutes = 0;

  if (options.he50Minutes !== undefined) he50Minutes = Number(options.he50Minutes);
  if (options.he100Minutes !== undefined) he100Minutes = Number(options.he100Minutes);
  if (options.nightMinutes !== undefined) nightMinutes = Number(options.nightMinutes);
  if (options.delayMinutes !== undefined) delayMinutes = Number(options.delayMinutes);

  // Se não foi fornecido via options, apura diretamente a partir de db.hrTimeRecords e db.hrSchedules
  if (
    options.he50Minutes === undefined &&
    options.he100Minutes === undefined &&
    Array.isArray(db?.hrTimeRecords)
  ) {
    const records = db.hrTimeRecords.filter(r => {
      const matchEmp = String(r.employeeId) === String(empId);
      const matchDate = r.date ? r.date.startsWith(yearMonth) : (r.timestamp && r.timestamp.startsWith(yearMonth));
      return matchEmp && matchDate;
    });

    // Agrupa batidas por data
    const dateMap = {};
    for (const r of records) {
      const d = r.date || (r.timestamp ? r.timestamp.substring(0, 10) : "");
      if (!d) continue;
      if (!dateMap[d]) dateMap[d] = [];
      dateMap[d].push(r);
    }

    const schedules = Array.isArray(db?.hrSchedules) ? db.hrSchedules : [];

    for (const [date, punches] of Object.entries(dateMap)) {
      const schedule = schedules.find(s => String(s.employeeId) === String(empId) && s.date === date) || {};
      const isDsr = Boolean(schedule.isDsr || schedule.shiftType === "dsr");
      const isHoliday = Boolean(schedule.isHoliday || schedule.shiftType === "holiday");

      const entrada = punches.find(p => (p.punchType || p.type) === "entrada");
      const saida = punches.find(p => (p.punchType || p.type) === "saida");
      const almocoSaida = punches.find(p => (p.punchType || p.type) === "almoco_saida");
      const almocoRetorno = punches.find(p => (p.punchType || p.type) === "almoco_retorno");

      if (entrada && saida) {
        let workedMin = Math.max(0, timeStrToMinutes(saida.time) - timeStrToMinutes(entrada.time));
        if (almocoSaida && almocoRetorno) {
          const lMin = Math.max(0, timeStrToMinutes(almocoRetorno.time) - timeStrToMinutes(almocoSaida.time));
          workedMin = Math.max(0, workedMin - lMin);
        }

        if (isDsr || isHoliday) {
          he100Minutes += workedMin;
        } else {
          const planned = typeof schedule.plannedWorkMinutes === "number" ? schedule.plannedWorkMinutes : 440;
          if (workedMin > planned) {
            he50Minutes += (workedMin - planned);
          }
        }
      }
    }
  }

  // 1. Proventos (Vencimentos)
  const he50Amount = Math.round(((he50Minutes / 60) * hourlyRate * 1.5) * 100) / 100;
  const he100Amount = Math.round(((he100Minutes / 60) * hourlyRate * 2.0) * 100) / 100;
  const totalHeAmount = Math.round((he50Amount + he100Amount) * 100) / 100;

  // Adicional Noturno: 20% legal sobre o valor da hora normal para cada hora noturna trabalhada
  const nightAdditionalAmount = Math.round(((nightMinutes / 60) * hourlyRate * 0.20) * 100) / 100;

  // Reflexos de DSR
  const dsrOvertimeReflex = calculateDsrReflex(totalHeAmount, workingDays, dsrAndHolidays);
  const dsrNightReflex = calculateDsrReflex(nightAdditionalAmount, workingDays, dsrAndHolidays);
  const totalDsrReflex = Math.round((dsrOvertimeReflex + dsrNightReflex) * 100) / 100;

  // Outros Proventos (bônus, gratificações, insalubridade)
  const otherEarnings = Number(options.otherEarnings) || 0;

  const totalProventos = Math.round(
    (baseSalary + totalHeAmount + nightAdditionalAmount + totalDsrReflex + otherEarnings) * 100
  ) / 100;

  // 2. Bases Legais
  const baseInss = totalProventos;
  const baseFgts = totalProventos;
  const fgtsMes = Math.round(baseFgts * 0.08 * 100) / 100; // 8% Lei 8.036/90

  // 3. Descontos
  // INSS Progressivo 2026
  const inssDetails = calculateInssProgressive(baseInss);
  const inssDiscount = inssDetails.inssValue;

  // Vale-Transporte: teto 6% do salário base (Lei 7.418/85)
  let vtDiscount = 0;
  const hasVtOptOut = options.vtOptOut === true || emp.transportVoucher?.optIn === false;
  if (!hasVtOptOut) {
    const vtLegalMax = Math.round(baseSalary * 0.06 * 100) / 100;
    if (options.vtCost !== undefined) {
      vtDiscount = Math.min(vtLegalMax, Number(options.vtCost));
    } else {
      vtDiscount = vtLegalMax;
    }
  }

  // Atrasos e Saídas Antecipadas
  const delayAmount = Math.round(((delayMinutes / 60) * hourlyRate) * 100) / 100;

  // Faltas injustificadas
  const absenceDays = Number(options.absenceDays) || 0;
  const absenceAmount = Math.round((absenceDays * (baseSalary / 30)) * 100) / 100;

  // Adiantamentos Salariais / Vales
  const salaryAdvance = Number(options.salaryAdvance) || 0;
  const otherDeductions = Number(options.otherDeductions) || 0;

  const totalDescontos = Math.round(
    (inssDiscount + vtDiscount + delayAmount + absenceAmount + salaryAdvance + otherDeductions) * 100
  ) / 100;

  // 4. Salário Líquido
  const salarioLiquido = Math.round((totalProventos - totalDescontos) * 100) / 100;

  // Rubricas Detalhadas do Holerite
  const proventosItems = [
    { code: "001", description: "Salário Base Mensal", reference: `${workloadHours}h`, amount: baseSalary }
  ];

  if (he50Amount > 0 || he50Minutes > 0) {
    const he50HoursFormatted = `${Math.floor(he50Minutes / 60)}h${String(he50Minutes % 60).padStart(2, "0")}m`;
    proventosItems.push({ code: "101", description: "Horas Extras 50% (Dias Úteis)", reference: he50HoursFormatted, amount: he50Amount });
  }

  if (he100Amount > 0 || he100Minutes > 0) {
    const he100HoursFormatted = `${Math.floor(he100Minutes / 60)}h${String(he100Minutes % 60).padStart(2, "0")}m`;
    proventosItems.push({ code: "102", description: "Horas Extras 100% (Dom/Fer)", reference: he100HoursFormatted, amount: he100Amount });
  }

  if (nightAdditionalAmount > 0 || nightMinutes > 0) {
    const nightHoursFormatted = `${Math.floor(nightMinutes / 60)}h${String(nightMinutes % 60).padStart(2, "0")}m`;
    proventosItems.push({ code: "105", description: "Adicional Noturno 20% (Art. 73 CLT)", reference: nightHoursFormatted, amount: nightAdditionalAmount });
  }

  if (dsrOvertimeReflex > 0) {
    proventosItems.push({ code: "110", description: "DSR sobre Horas Extras (Súmula 172 TST)", reference: `${dsrAndHolidays}/${workingDays}d`, amount: dsrOvertimeReflex });
  }

  if (dsrNightReflex > 0) {
    proventosItems.push({ code: "111", description: "DSR sobre Adicional Noturno (Súmula 60 TST)", reference: `${dsrAndHolidays}/${workingDays}d`, amount: dsrNightReflex });
  }

  if (otherEarnings > 0) {
    proventosItems.push({ code: "199", description: "Outros Vencimentos / Bônus", reference: "-", amount: otherEarnings });
  }

  const descontosItems = [
    { code: "201", description: "INSS Progressivo 2026", reference: `${inssDetails.effectiveRate}%`, amount: inssDiscount }
  ];

  if (vtDiscount > 0) {
    descontosItems.push({ code: "205", description: "Vale-Transporte (Lei 7.418/85)", reference: "6%", amount: vtDiscount });
  }

  if (delayAmount > 0) {
    descontosItems.push({ code: "210", description: "Atrasos e Saídas Antecipadas", reference: `${delayMinutes}m`, amount: delayAmount });
  }

  if (absenceAmount > 0) {
    descontosItems.push({ code: "220", description: "Faltas Injustificadas", reference: `${absenceDays}d`, amount: absenceAmount });
  }

  if (salaryAdvance > 0) {
    descontosItems.push({ code: "250", description: "Adiantamento Salarial / Vale", reference: "-", amount: salaryAdvance });
  }

  if (otherDeductions > 0) {
    descontosItems.push({ code: "299", description: "Outros Descontos Autorizados", reference: "-", amount: otherDeductions });
  }

  const recordId = options.id || `pay_${empId}_${yearMonth.replace("-", "")}_${Date.now().toString(36)}`;

  return {
    id: recordId,
    employeeId: empId,
    employeeName: emp.name,
    cpf: emp.cpf,
    role: emp.role,
    department: emp.department || "Operacional",
    ctpsNumber: emp.ctpsNumber || "-",
    ctpsSeries: emp.ctpsSeries || "-",
    admissionDate: emp.admissionDate || "-",
    pixKey: emp.pixKey || emp.whatsapp || emp.phone || "-",
    pixKeyType: emp.pixKeyType || "phone",
    yearMonth,
    competencia: yearMonth,
    workloadHours,
    hourlyRate,
    calendar: {
      daysInMonth,
      workingDays,
      dsrAndHolidays
    },
    workSummary: {
      he50Minutes,
      he100Minutes,
      nightMinutes,
      delayMinutes
    },
    proventos: proventosItems,
    descontos: descontosItems,
    totalProventos,
    totalDescontos,
    salarioLiquido,
    salarioLiquidoExtenso: formatCurrencyInWords(salarioLiquido),
    baseInss,
    inssDetails,
    baseFgts,
    fgtsMes,
    status: options.status || "fechado",
    payment: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Emissão de Demonstrativo de Pagamento (Holerite)
 * Gera layout estruturado e textual oficial com razão social e bases legais.
 * 
 * @param {object} db - Banco de dados em memória
 * @param {object|string} payrollRecordOrId - Registro completo de folha ou ID de busca
 * @returns {{ payslipHeader: object, employeeInfo: object, items: object[], totals: object, legalBases: object, payslipText: string }}
 */
export function generatePayslip(db, payrollRecordOrId) {
  let record = null;
  if (typeof payrollRecordOrId === "object" && payrollRecordOrId !== null) {
    record = payrollRecordOrId;
  } else if (typeof payrollRecordOrId === "string" || typeof payrollRecordOrId === "number") {
    const targetId = payrollRecordOrId;
    const targetIdStr = String(targetId).toLowerCase().trim();
    if (
      targetId === 2 ||
      targetId === 3 ||
      targetId === "2" ||
      targetId === "3" ||
      targetIdStr === "cris" ||
      targetIdStr === "grazi" ||
      isPrestadora({ id: targetId, username: targetId, name: targetId })
    ) {
      const err = new Error("Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).");
      err.statusCode = 403;
      err.code = "PRESTADORA_PAYROLL_BLOCKED";
      throw err;
    }
    const list = Array.isArray(db?.hrPayroll) ? db.hrPayroll : [];
    record = list.find(p => p.id === targetId);
  }

  if (!record) {
    const err = new Error("Registro de folha de pagamento não encontrado para emissão do holerite.");
    err.statusCode = 404;
    err.code = "PAYROLL_NOT_FOUND";
    throw err;
  }

  const recEmpId = record.employeeId;
  const recEmpIdStr = String(recEmpId || "").toLowerCase().trim();
  if (
    recEmpId === 2 ||
    recEmpId === 3 ||
    recEmpId === "2" ||
    recEmpId === "3" ||
    recEmpIdStr === "cris" ||
    recEmpIdStr === "grazi" ||
    isPrestadora({ id: recEmpId, username: recEmpId, name: recEmpId })
  ) {
    const err = new Error("Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).");
    err.statusCode = 403;
    err.code = "PRESTADORA_PAYROLL_BLOCKED";
    throw err;
  }

  const [yStr, mStr] = String(record.yearMonth || record.competencia || "").split("-");
  const competenciaFormatada = `${mStr || "00"}/${yStr || "0000"}`;

  // Montagem do texto estruturado para impressão ou visualização
  const lines = [
    "================================================================================",
    `  ${EMPLOYER_INFO.tradeName.toUpperCase()} — RECIBO DE PAGAMENTO DE SALÁRIO`,
    `  Razão Social: ${EMPLOYER_INFO.companyName}`,
    `  CNPJ: ${EMPLOYER_INFO.cnpj} — ${EMPLOYER_INFO.city}/${EMPLOYER_INFO.state}`,
    "--------------------------------------------------------------------------------",
    `  COLABORADOR: ${record.employeeName} | CPF: ${record.cpf}`,
    `  CARGO: ${record.role} | CTPS: ${record.ctpsNumber} Sér: ${record.ctpsSeries}`,
    `  COMPETÊNCIA: ${competenciaFormatada} | CARGA MENSAL: ${record.workloadHours}h | ADM: ${record.admissionDate}`,
    "================================================================================",
    "  CÓD  DESCRIÇÃO DA RUBRICA                      REF        VENCIMENTOS   DESCONTOS",
    "--------------------------------------------------------------------------------"
  ];

  for (const p of record.proventos || []) {
    const cod = String(p.code).padEnd(4);
    const desc = String(p.description).padEnd(40).substring(0, 40);
    const ref = String(p.reference || "-").padEnd(10);
    const val = `R$ ${p.amount.toFixed(2).replace(".", ",")}`.padStart(13);
    lines.push(`  ${cod} ${desc} ${ref} ${val}            `);
  }

  for (const d of record.descontos || []) {
    const cod = String(d.code).padEnd(4);
    const desc = String(d.description).padEnd(40).substring(0, 40);
    const ref = String(d.reference || "-").padEnd(10);
    const val = `R$ ${d.amount.toFixed(2).replace(".", ",")}`.padStart(13);
    lines.push(`  ${cod} ${desc} ${ref}              ${val}`);
  }

  lines.push("--------------------------------------------------------------------------------");
  const totProvStr = `R$ ${record.totalProventos.toFixed(2).replace(".", ",")}`.padStart(13);
  const totDescStr = `R$ ${record.totalDescontos.toFixed(2).replace(".", ",")}`.padStart(13);
  lines.push(`  TOTAIS                                              ${totProvStr} ${totDescStr}`);
  lines.push("================================================================================");
  const salLiqStr = `R$ ${record.salarioLiquido.toFixed(2).replace(".", ",")}`;
  lines.push(`  VALOR LÍQUIDO A RECEBER: ${salLiqStr}`);
  lines.push(`  VALOR POR EXTENSO: ${record.salarioLiquidoExtenso}`);
  lines.push("--------------------------------------------------------------------------------");
  lines.push(`  BASES LEGAIS:`);
  lines.push(`  Sal. Base: R$ ${(record.proventos?.[0]?.amount || 0).toFixed(2)} | Base INSS: R$ ${record.baseInss.toFixed(2)} | Base FGTS: R$ ${record.baseFgts.toFixed(2)} | FGTS Mês: R$ ${record.fgtsMes.toFixed(2)}`);
  lines.push(`  Status do Pagamento: ${record.status.toUpperCase()} ${record.payment ? `(Pago em ${record.payment.paidAt} via PIX ${record.payment.pixKey})` : ""}`);
  lines.push("================================================================================");

  return {
    employer: EMPLOYER_INFO,
    employee: {
      id: record.employeeId,
      name: record.employeeName,
      cpf: record.cpf,
      role: record.role,
      ctps: `${record.ctpsNumber}/${record.ctpsSeries}`,
      admissionDate: record.admissionDate
    },
    competencia: competenciaFormatada,
    proventos: record.proventos,
    descontos: record.descontos,
    totals: {
      totalProventos: record.totalProventos,
      totalDescontos: record.totalDescontos,
      salarioLiquido: record.salarioLiquido,
      salarioLiquidoExtenso: record.salarioLiquidoExtenso
    },
    legalBases: {
      baseSalary: record.proventos?.[0]?.amount || 0,
      baseInss: record.baseInss,
      inssEffectiveRate: record.inssDetails?.effectiveRate || 0,
      baseFgts: record.baseFgts,
      fgtsMes: record.fgtsMes
    },
    paymentStatus: record.status,
    paymentDetails: record.payment,
    payslipText: lines.join("\n")
  };
}

/**
 * Registro de Quitação e Baixa de Pagamento via PIX
 * 
 * @param {object} db - Banco de dados em memória
 * @param {string} payrollId - ID do fechamento da folha
 * @param {object} paymentData - Dados do pagamento (chave PIX, transação, comprovante)
 * @returns {object} Registro atualizado com status "pago"
 */
export function registerPayrollPayment(db, payrollId, paymentData = {}) {
  const pIdStr = String(payrollId || "").toLowerCase().trim();
  const bodyEmpId = paymentData?.employeeId;
  const bodyEmpIdStr = String(bodyEmpId || "").toLowerCase().trim();

  if (
    payrollId === 2 ||
    payrollId === 3 ||
    payrollId === "2" ||
    payrollId === "3" ||
    pIdStr === "cris" ||
    pIdStr === "grazi" ||
    isPrestadora({ id: payrollId, username: payrollId, name: payrollId }) ||
    bodyEmpId === 2 ||
    bodyEmpId === 3 ||
    bodyEmpId === "2" ||
    bodyEmpId === "3" ||
    bodyEmpIdStr === "cris" ||
    bodyEmpIdStr === "grazi" ||
    (bodyEmpId && isPrestadora({ id: bodyEmpId, username: bodyEmpId, name: bodyEmpId }))
  ) {
    const err = new Error("Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).");
    err.statusCode = 403;
    err.code = "PRESTADORA_PAYROLL_BLOCKED";
    throw err;
  }

  if (!Array.isArray(db?.hrPayroll)) {
    db.hrPayroll = [];
  }

  const idx = db.hrPayroll.findIndex(p => p.id === payrollId);
  if (idx === -1) {
    const err = new Error(`Folha de pagamento ${payrollId} não encontrada para quitação.`);
    err.statusCode = 404;
    err.code = "PAYROLL_NOT_FOUND";
    throw err;
  }

  const current = db.hrPayroll[idx];
  const curEmpId = current.employeeId;
  const curEmpIdStr = String(curEmpId || "").toLowerCase().trim();
  if (
    curEmpId === 2 ||
    curEmpId === 3 ||
    curEmpId === "2" ||
    curEmpId === "3" ||
    curEmpIdStr === "cris" ||
    curEmpIdStr === "grazi" ||
    isPrestadora({ id: curEmpId, username: curEmpId, name: curEmpId })
  ) {
    const err = new Error("Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).");
    err.statusCode = 403;
    err.code = "PRESTADORA_PAYROLL_BLOCKED";
    throw err;
  }

  const paidAt = paymentData.paidAt || new Date().toISOString();
  const transactionId = paymentData.transactionId || `PIX${Date.now()}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const pixKey = paymentData.pixKey || current.pixKey || "-";
  const receiptProof = paymentData.receiptProof || `comprovante_${payrollId}.pdf`;
  const paidBy = paymentData.paidBy || "admin";

  const paymentRecord = {
    paidAt,
    paidBy,
    pixKey,
    transactionId,
    receiptProof,
    amountPaid: current.salarioLiquido
  };

  current.status = "pago";
  current.payment = paymentRecord;
  current.updatedAt = new Date().toISOString();

  db.hrPayroll[idx] = current;
  return current;
}

/**
 * Fechamento Mensal Consolidado da Folha para Todos os Colaboradores CLT
 * 
 * @param {object} db - Banco de dados em memória
 * @param {string} yearMonth - Mês de competência ("YYYY-MM")
 * @param {object} options - Opções adicionais de fechamento
 * @returns {{ success: boolean, yearMonth: string, closedCount: number, totalProventos: number, totalDescontos: number, totalLiquido: number, payrollRecords: object[] }}
 */
export function closeMonthlyPayroll(db, yearMonth, options = {}) {
  const targetEmpId = options?.employeeId;
  if (targetEmpId !== undefined && targetEmpId !== null && targetEmpId !== "") {
    const idStr = String(targetEmpId).toLowerCase().trim();
    if (
      targetEmpId === 2 ||
      targetEmpId === 3 ||
      targetEmpId === "2" ||
      targetEmpId === "3" ||
      idStr === "cris" ||
      idStr === "grazi" ||
      isPrestadora({ id: targetEmpId, username: targetEmpId, name: targetEmpId })
    ) {
      const err = new Error("Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).");
      err.statusCode = 403;
      err.code = "PRESTADORA_PAYROLL_BLOCKED";
      throw err;
    }
  }

  if (!Array.isArray(db.hrPayroll)) {
    db.hrPayroll = [];
  }

  const employees = Array.isArray(db.hrEmployees) ? db.hrEmployees : [];
  // Seleciona exclusivamente colaboradores CLT ativos e exclui com assertivismo Cris e Grazi
  let cltEmployees = employees.filter(e => isCltEmployee(e) && !isPrestadora(e));

  // Se options.employeeId foi especificado para um colaborador CLT, fecha apenas para ele
  if (targetEmpId !== undefined && targetEmpId !== null && targetEmpId !== "") {
    cltEmployees = cltEmployees.filter(e => String(e.id) === String(targetEmpId));
  }

  const records = [];
  let sumProventos = 0;
  let sumDescontos = 0;
  let sumLiquido = 0;

  for (const emp of cltEmployees) {
    const calculated = calculateMonthlyPayroll(db, emp.id, yearMonth, options);
    
    // Upsert na coleção db.hrPayroll
    const existingIdx = db.hrPayroll.findIndex(p => p.employeeId === emp.id && p.yearMonth === yearMonth);
    if (existingIdx !== -1) {
      db.hrPayroll[existingIdx] = calculated;
    } else {
      db.hrPayroll.push(calculated);
    }

    records.push(calculated);
    sumProventos += calculated.totalProventos;
    sumDescontos += calculated.totalDescontos;
    sumLiquido += calculated.salarioLiquido;
  }

  return {
    success: true,
    yearMonth,
    closedCount: records.length,
    totalProventos: Math.round(sumProventos * 100) / 100,
    totalDescontos: Math.round(sumDescontos * 100) / 100,
    totalLiquido: Math.round(sumLiquido * 100) / 100,
    payrollRecords: records
  };
}

/**
 * Consulta de Registros de Folha de Pagamento
 */
export function getPayrollRecords(db, query = {}) {
  const empId = query?.employeeId;
  if (empId !== undefined && empId !== null && empId !== "") {
    const idStr = String(empId).toLowerCase().trim();
    if (
      empId === 2 ||
      empId === 3 ||
      empId === "2" ||
      empId === "3" ||
      idStr === "cris" ||
      idStr === "grazi" ||
      isPrestadora({ id: empId, username: empId, name: empId })
    ) {
      const err = new Error("Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).");
      err.statusCode = 403;
      err.code = "PRESTADORA_PAYROLL_BLOCKED";
      throw err;
    }
  }

  const list = Array.isArray(db?.hrPayroll) ? db.hrPayroll : [];

  return list
    .filter(p => {
      // Exclui preventivamente qualquer registro de prestadora
      if (
        p.employeeId === 2 ||
        p.employeeId === 3 ||
        String(p.employeeId) === "2" ||
        String(p.employeeId) === "3" ||
        isPrestadora({ id: p.employeeId })
      ) {
        return false;
      }
      if (query.employeeId && String(p.employeeId) !== String(query.employeeId)) return false;
      if (query.yearMonth && p.yearMonth !== query.yearMonth) return false;
      if (query.competencia && p.competencia !== query.competencia) return false;
      if (query.status && p.status !== query.status) return false;
      return true;
    })
    .sort((a, b) => (b.yearMonth || "").localeCompare(a.yearMonth || ""));
}

/**
 * CorpFlats / Guest Flow Manager - Maid WhatsApp Automation Service
 * 
 * Módulo de automação de WhatsApp para Governança e Camareiras:
 * 1. Alerta de Quarto em Limpeza Prolongada (>40 min)
 * 2. Resumo Diário de Produtividade (todo dia às 18:00)
 * 3. Relatório Oficial de Fechamento de Quinzena (Dia 15 e Fim do Mês às 18:00)
 * 4. Disparo de testes com dados reais ou simulados
 */

import { cleanWhatsAppPhone, sendZapiMessage } from "./zapi-service.mjs";

export const DEFAULT_MAID_TRIGGERS = [
  {
    id: "trigger_overtime_cleaning",
    name: "Alerta de Quarto em Limpeza Prolongada (>40 min)",
    description: "Dispara para a camareira responsável quando um quarto estiver há mais de 40 minutos em limpeza, lembrando de concluir no sistema caso já tenha finalizado.",
    enabled: true,
    timing: "overtime",
    thresholdMinutes: 40,
    template: `⚠️ *Lembrete de Limpeza CorpFlats* 🧹

Olá, *{{nome_camareira}}*!
Notamos que o *Flat {{quarto}}* já está em limpeza há *{{tempo_limpeza}} minutos*.

Caso você já tenha finalizado a higienização do quarto, não se esqueça de entrar no sistema e clicar em *"Concluir Limpeza"* para liberar o apartamento na recepção!

_Se você ainda estiver realizando a limpeza, desconsidere este aviso._ Muito obrigado pelo capricho e dedicação! ✨`
  },
  {
    id: "trigger_daily_summary",
    name: "Resumo Diário de Produtividade (18:00)",
    description: "Envia diariamente às 18:00 um balanço das atividades: quartos limpos, tempo médio e demonstrativo financeiro da quinzena.",
    enabled: true,
    timing: "daily_time",
    scheduledTime: "18:00",
    lastExecutedDate: null,
    template: `📊 *Resumo do seu Dia de Trabalho • CorpFlats* 🧹

Olá, *{{nome_camareira}}*!
Aqui está o balanço das suas atividades de hoje (*{{data_hoje}}*):

✅ *Quartos limpos hoje:* {{qtd_quartos_hoje}}
🚪 *Quartos:* {{lista_quartos_hoje}}
⏱️ *Tempo médio por quarto:* {{tempo_medio_hoje}} min

📈 *Demonstrativo da Quinzena ({{periodo_quinzena}}):*
• Total de quartos concluídos: *{{total_quartos_quinzena}}*
• Produção bruta acumulada: *{{bruto_quinzena}}*
• Vales concedidos: *− {{vales_quinzena}}*
💰 *Saldo líquido a receber:* *{{saldo_liquido_quinzena}}*

Muito obrigado por sua dedicação e excelência diária! Tenha um ótimo descanso! 🌟`
  },
  {
    id: "trigger_quinzena_closing",
    name: "Relatório de Fechamento de Quinzena (Dia 15 e Fim do Mês às 18:00)",
    description: "Envia nos dias 15 e no último dia do mês às 18:00 o demonstrativo oficial de fechamento de diárias e valor líquido a receber.",
    enabled: true,
    timing: "quinzena_closing",
    scheduledTime: "18:00",
    lastExecutedDate: null,
    template: `🧾 *Fechamento Oficial de Quinzena • CorpFlats* 🧹

Olá, *{{nome_camareira}}*! Segue o seu demonstrativo consolidado de governança:

📅 *Período:* {{periodo_quinzena}}
🧹 *Total de Quartos Higienizados:* {{total_quartos_quinzena}}
💵 *Valor por Quarto:* {{valor_por_quarto}}
📈 *Produção Bruta:* {{bruto_quinzena}}
🎫 *Vales Concedidos:* − {{vales_quinzena}}
💰 *LÍQUIDO EFETIVO A RECEBER:* *{{saldo_liquido_quinzena}}*
🔑 *Chave PIX Cadastrada:* {{chave_pix}}

📋 *Detalhamento por Dia:*
{{detalhamento_dias}}

Por favor, confira os quartos acima. Caso haja qualquer divergência, avise a administração. O pagamento líquido será processado via PIX. Parabéns e obrigado pelo excelente trabalho nesta quinzena! 👏✨`
  },
  {
    id: "trigger_daily_review_summary",
    name: "Resumo Diário de Avaliações",
    description: "Envia diariamente em horário fixo o resumo das avaliações dos hóspedes dos quartos limpos por cada camareira, com número do quarto, data da limpeza e nota.",
    enabled: true,
    timing: "daily_review_summary",
    scheduledTime: "18:00",
    lastExecutedDate: null,
    template: `⭐ *Resumo Diário de Avaliações • CorpFlats* ⭐

Olá, *{{nome_camareira}}*!
Aqui está o resumo das avaliações recebidas hoje referente aos quartos preparados por você:

{{lista_avaliacoes}}

📊 *Média do dia:* {{media_dia}} ⭐

Muito obrigado pela sua dedicação e excelência! ✨`
  }
];

// ── Utilitários de Data e Moeda ─────────────────────────────────────────────

export function getBrasiliaNow() {
  const offset = Number(global.__simulatedTimeOffsetMs || 0);
  const now = new Date(Date.now() + offset);
  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  const timeParts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(now);
  const hour = Number(timeParts.find(p => p.type === "hour")?.value || "0");
  const minute = Number(timeParts.find(p => p.type === "minute")?.value || "0");
  const second = Number(timeParts.find(p => p.type === "second")?.value || "0");
  return {
    date: dateStr,
    hour,
    minute,
    second,
    timeStr: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
  };
}

export function formatDateBr(isoDate) {
  if (!isoDate) return "";
  const parts = String(isoDate).substring(0, 10).split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

export function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function generatePaymentId() {
  return `pay_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function getExecutionDateStr(isoString) {
  if (!isoString) return getBrasiliaNow().date;
  const str = String(isoString).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  try {
    const offset = Number(global.__simulatedTimeOffsetMs || 0);
    const d = new Date(new Date(str).getTime() + offset);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  } catch {
    return str.substring(0, 10);
  }
}

export function matchesPeriod(entry, payment, startD, endD) {
  if (entry?.reversedAt || payment?.reversedAt || payment?.interStatus === "ESTORNADO") return false;

  if (payment && payment.referencePeriod) {
    const [refStart, refEnd] = payment.referencePeriod.split("_");
    if (refStart === startD && refEnd === endD) return true;
    if (startD <= refStart && endD >= refEnd) return true;
    if (refEnd < startD || refStart > endD) return false;
  }
  const d = entry.entryDate || (entry.createdAt ? getExecutionDateStr(entry.createdAt) : "");
  if (!d) return false;

  // Se o pagamento for no dia seguinte ao fechamento oficial (ex: dia 16 após dia 15, ou dia 01 após fim de mês)
  const [ey, em, ed] = endD.split("-").map(Number);
  const nextDay = new Date(Date.UTC(ey, em - 1, ed + 1)).toISOString().substring(0, 10);
  const isSettlementPayment = payment ? payment.type === "payment" : entry.description?.toLowerCase().includes("pagamento");

  if (d === nextDay && isSettlementPayment) {
    return true;
  }

  // Se for o primeiro dia de uma nova quinzena (dia 16 ou dia 01) e for um pagamento de quitação sem referencePeriod,
  // ele pertenceu ao fechamento da quinzena ANTERIOR, logo não deve vazar para esta nova quinzena
  if (d === startD && (d.endsWith("-16") || d.endsWith("-01")) && isSettlementPayment) {
    return false;
  }

  if (d < startD || d > endD) return false;
  return true;
}

// ── Sincronização Canônica de Diárias Concluídas no Extrato ──────────────────

export function syncMaidCredits(db, userId) {
  if (!db) return;
  if (!db.maidPayments) db.maidPayments = [];
  if (!db.maidStatementEntries) db.maidStatementEntries = [];

  const user = (db.users || []).find(u => u.id === userId);
  if (!user) return;

  const defaultRate = Number(db.cleaningRates?.defaultRatePerRoom || 22.50);
  const userRate = db.cleaningRates?.userRates?.[userId] !== undefined
    ? Number(db.cleaningRates.userRates[userId])
    : defaultRate;

  const defaultStayoverRate = Number(db.cleaningRates?.defaultStayoverRatePerRoom !== undefined ? db.cleaningRates.defaultStayoverRatePerRoom : 15.00);
  const userStayoverRate = db.cleaningRates?.userStayoverRates?.[userId] !== undefined
    ? Number(db.cleaningRates.userStayoverRates[userId])
    : (userId === 2 || userId === 3 ? 15.00 : defaultStayoverRate);

  const cleanings = (db.cleaningRequests || []).filter(r => {
    if (r.status !== "clean" || r.isBedAdjustmentOnly || r.isInstructionOnly || r.type === "instruction" || r.source === "manual_instruction" || r.isPaidCleaning === false) return false;
    if (r.id === 1 && (r.flatId === 22 || r.requestDate === "2026-09-01")) return false;
    return r.assignedUserId === userId;
  });

  const validCleaningMap = new Map();
  for (const c of cleanings) {
    validCleaningMap.set(c.id, c);
  }

  let modified = false;

  // 1. Reconciliação de Setembro+: remove entradas de crédito órfãs ou de diárias não mais válidas/atribuídas
  // Preserva 100% intacto o histórico fechado de Agosto (< 2026-09-01)
  const beforeLen = db.maidStatementEntries.length;
  db.maidStatementEntries = db.maidStatementEntries.filter(e => {
    if (e.userId !== userId || e.entryType !== "credit") return true;
    if (e.description === "Diária — Flat 22" || e.cleaningRequestId === 1) return false;
    if (!e.cleaningRequestId) return true;
    const entryDate = e.entryDate || (e.createdAt ? getExecutionDateStr(e.createdAt) : "");
    if (entryDate < "2026-09-01") return true; // Preserva Agosto
    return validCleaningMap.has(e.cleaningRequestId);
  });
  if (db.maidStatementEntries.length !== beforeLen) modified = true;

  // 1.1 Normaliza taxa por quarto e timestamp real de conclusão nos créditos de Setembro+
  // BLINDAGEM CONTRA SOBRESCRITA DE STAYOVERS:
  for (const e of db.maidStatementEntries) {
    if (e.userId !== userId || e.entryType !== "credit") continue;
    const entryDate = e.entryDate || (e.createdAt ? getExecutionDateStr(e.createdAt) : "");
    if (entryDate < "2026-09-01") continue;

    const linkedCleaning = e.cleaningRequestId ? (validCleaningMap.get(e.cleaningRequestId) || (db.cleaningRequests || []).find(r => r.id === e.cleaningRequestId)) : null;
    const isStayover = e.cleaningType === "stayover" ||
      linkedCleaning?.cleaningType === "stayover" ||
      linkedCleaning?.source === "stayover" ||
      (typeof e.description === "string" && e.description.toLowerCase().includes("stayover"));

    if (isStayover && e.cleaningType !== "stayover") {
      e.cleaningType = "stayover";
      modified = true;
    } else if (!isStayover && !e.cleaningType && e.cleaningRequestId) {
      e.cleaningType = "checkout";
      modified = true;
    }

    const expectedRate = isStayover ? userStayoverRate : userRate;

    if ((userId === 2 || userId === 3) && Math.abs(Number(e.amount || 0) - expectedRate) > 0.001) {
      e.amount = expectedRate;
      modified = true;
    }
    if (e.cleaningRequestId && validCleaningMap.has(e.cleaningRequestId)) {
      const c = validCleaningMap.get(e.cleaningRequestId);
      if (c.completedAt && (!e.createdAt || e.createdAt.substring(0, 10) > entryDate)) {
        e.createdAt = c.completedAt;
        modified = true;
      }
    }
  }

  const existingCreditRefs = new Set(
    db.maidStatementEntries
      .filter(e => e.userId === userId && e.entryType === "credit" && e.cleaningRequestId)
      .map(e => e.cleaningRequestId)
  );

  let newEntries = [];
  for (const cleaning of cleanings) {
    if (existingCreditRefs.has(cleaning.id)) continue;

    const flat = (db.flats || []).find(f => f.id === cleaning.flatId);
    const flatNum = flat ? flat.number : (cleaning.flatNumber || String(cleaning.flatId));
    const entryDate = cleaning.completedAt
      ? getExecutionDateStr(cleaning.completedAt)
      : (cleaning.effectiveDate || cleaning.requestDate);

    const isStayover = cleaning.cleaningType === "stayover" || cleaning.source === "stayover";
    const expectedDesc = isStayover ? `Diária Stayover — Flat ${flatNum}` : `Diária — Flat ${flatNum}`;

    // Se existe uma entrada legada sem cleaningRequestId para o mesmo flat e data da camareira, vincula
    const legacyEntry = db.maidStatementEntries.find(
      e => !e.cleaningRequestId && e.userId === userId && e.entryType === "credit" && e.entryDate === entryDate && (e.description === expectedDesc || (!isStayover && e.description === `Diária — Flat ${flatNum}`))
    );
    if (legacyEntry) {
      legacyEntry.cleaningRequestId = cleaning.id;
      if (!legacyEntry.cleaningType) legacyEntry.cleaningType = isStayover ? "stayover" : "checkout";
      existingCreditRefs.add(cleaning.id);
      modified = true;
      continue;
    }

    const rate = isStayover ? userStayoverRate : userRate;
    newEntries.push({
      id: generatePaymentId(),
      userId,
      cleaningRequestId: cleaning.id,
      paymentId: null,
      entryType: "credit",
      amount: rate,
      description: expectedDesc,
      cleaningType: isStayover ? "stayover" : "checkout",
      entryDate,
      createdAt: cleaning.completedAt || new Date().toISOString(),
    });
    existingCreditRefs.add(cleaning.id);
    modified = true;
  }

  if (newEntries.length > 0) {
    newEntries.sort((a, b) => (a.entryDate || "").localeCompare(b.entryDate || ""));
    db.maidStatementEntries.push(...newEntries);
  }

  return modified;
}


// ── Motor Financeiro Canônico de Quinzena ────────────────────────────────────

export function getMaidPeriodFinances(db, userId, startDate = null, endDate = null) {
  syncMaidCredits(db, userId);

  const bNow = getBrasiliaNow();
  let startD = startDate;
  let endD = endDate;

  if (!startD || !endD) {
    const todayStr = bNow.date;
    const [year, month, day] = todayStr.split("-").map(Number);
    const isFirstHalf = day <= 15;
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    startD = isFirstHalf 
      ? `${year}-${String(month).padStart(2, "0")}-01` 
      : `${year}-${String(month).padStart(2, "0")}-16`;
    endD = isFirstHalf 
      ? `${year}-${String(month).padStart(2, "0")}-15` 
      : `${year}-${String(month).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`;
  }

  // 1. Limpezas válidas no período
  const defaultRate = Number(db?.cleaningRates?.defaultRatePerRoom || 22.50);
  const userRate = db?.cleaningRates?.userRates?.[userId] !== undefined
    ? Number(db.cleaningRates.userRates[userId])
    : defaultRate;

  const defaultStayoverRate = Number(db?.cleaningRates?.defaultStayoverRatePerRoom !== undefined ? db.cleaningRates.defaultStayoverRatePerRoom : 15.00);
  const userStayoverRate = db?.cleaningRates?.userStayoverRates?.[userId] !== undefined
    ? Number(db.cleaningRates.userStayoverRates[userId])
    : (userId === 2 || userId === 3 ? 15.00 : defaultStayoverRate);

  const cleanings = (db?.cleaningRequests || []).filter(r => {
    if (r.status !== "clean" || r.isBedAdjustmentOnly || r.isInstructionOnly || r.type === "instruction" || r.source === "manual_instruction" || r.isPaidCleaning === false) return false;
    if (r.assignedUserId !== userId) return false;
    const effectiveDate = r.completedAt ? getExecutionDateStr(r.completedAt) : (r.effectiveDate || r.requestDate);
    return effectiveDate >= startD && effectiveDate <= endD;
  });

  const checkoutCleanings = cleanings.filter(r => r.cleaningType !== "stayover" && r.source !== "stayover");
  const stayoverCleanings = cleanings.filter(r => r.cleaningType === "stayover" || r.source === "stayover");

  const checkoutCount = checkoutCleanings.length;
  const stayoverCount = stayoverCleanings.length;
  const cleaningsCount = cleanings.length;

  const checkoutGross = Number((checkoutCount * userRate).toFixed(2));
  const stayoverGross = Number((stayoverCount * userStayoverRate).toFixed(2));
  const grossAmount = Number((checkoutGross + stayoverGross).toFixed(2));

  // 2. Saldo devedor de quinzenas anteriores (transporte de conta-corrente negativa)
  const priorEntries = (db?.maidStatementEntries || []).filter(e => {
    if (e.userId !== userId) return false;
    const payment = e.paymentId ? (db.maidPayments || []).find(p => p.id === e.paymentId) : null;
    if (e.reversedAt || payment?.reversedAt || payment?.interStatus === "ESTORNADO") return false;

    if (payment && payment.referencePeriod) {
      const [refStart] = payment.referencePeriod.split("_");
      if (refStart >= startD) return false;
      return true;
    }
    const d = e.entryDate || (e.createdAt ? getExecutionDateStr(e.createdAt) : "");
    if (!d) return false;

    // Se for pagamento de quitação realizado no primeiro dia desta quinzena (dia 16 ou dia 01)
    // referente ao fechamento anterior, conta no saldo da quinzena anterior
    const isSettlement = payment ? payment.type === "payment" : e.description?.toLowerCase().includes("pagamento");
    if (d === startD && (d.endsWith("-16") || d.endsWith("-01")) && isSettlement) {
      return true;
    }

    return d < startD;
  });

  let priorBalance = 0;
  for (const e of priorEntries) {
    if (e.entryType === "credit") {
      priorBalance += Number(e.amount || 0);
    } else {
      priorBalance -= Number(e.amount || 0);
    }
  }
  priorBalance = Number(priorBalance.toFixed(2));
  const previousDebitBalance = priorBalance < 0 ? Math.abs(priorBalance) : 0;

  // 3. Vales e Adiantamentos concedidos no período
  const userVales = (db?.maidStatementEntries || []).filter(e => {
    if (e.userId !== userId || e.entryType !== "debit") return false;
    const payment = e.paymentId ? (db.maidPayments || []).find(p => p.id === e.paymentId) : null;
    if (e.reversedAt || payment?.reversedAt || payment?.interStatus === "ESTORNADO") return false;
    if (!matchesPeriod(e, payment, startD, endD)) return false;
    return payment ? payment.type === "advance" : (e.description?.toLowerCase().includes("vale") || e.description?.toLowerCase().includes("adiantamento"));
  });
  const advancesAmount = Number(userVales.reduce((acc, v) => acc + Number(v.amount || 0), 0).toFixed(2));

  // 4. Pagamentos de quitação no período
  const userPayments = (db?.maidStatementEntries || []).filter(e => {
    if (e.userId !== userId || e.entryType !== "debit") return false;
    const payment = e.paymentId ? (db.maidPayments || []).find(p => p.id === e.paymentId) : null;
    if (e.reversedAt || payment?.reversedAt || payment?.interStatus === "ESTORNADO") return false;
    if (payment && payment.type === "advance") return false;
    if (!matchesPeriod(e, payment, startD, endD)) return false;
    return payment ? payment.type === "payment" : true;
  });
  const paymentsAmount = Number(userPayments.reduce((acc, p) => acc + Number(p.amount || 0), 0).toFixed(2));

  // 5. Saldo Líquido Restante / Pendente
  const rawPending = grossAmount - previousDebitBalance - advancesAmount - paymentsAmount;
  const netPendingAmount = Number(rawPending.toFixed(2));

  // 6. Saldo Vitalício Contábil
  const allUserEntries = (db?.maidStatementEntries || []).filter(e => {
    if (e.userId !== userId) return false;
    if (e.reversedAt) return false;
    const payment = e.paymentId ? (db.maidPayments || []).find(p => p.id === e.paymentId) : null;
    if (payment?.reversedAt || payment?.interStatus === "ESTORNADO") return false;
    return true;
  });
  const lifetimeBalance = Number(
    allUserEntries.reduce((sum, e) => e.entryType === "credit" ? sum + Number(e.amount || 0) : sum - Number(e.amount || 0), 0).toFixed(2)
  );

  return {
    cleaningsCount,
    checkoutCount,
    stayoverCount,
    checkoutGross,
    stayoverGross,
    grossAmount,
    userCheckoutRate: userRate,
    userStayoverRate,
    previousDebitBalance,
    advancesAmount,
    paymentsAmount,
    netPendingAmount,
    lifetimeBalance
  };
}

// ── Estatísticas da Camareira ────────────────────────────────────────────────

export function getMaidStats(db, maidUserId, targetDateStr = null) {
  const bNow = getBrasiliaNow();
  const todayStr = targetDateStr || bNow.date;
  const [year, month, day] = todayStr.split("-").map(Number);

  // Determina Quinzena Atual
  const isFirstHalf = day <= 15;
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const quinzenaStart = isFirstHalf 
    ? `${year}-${String(month).padStart(2, "0")}-01` 
    : `${year}-${String(month).padStart(2, "0")}-16`;
  const quinzenaEnd = isFirstHalf 
    ? `${year}-${String(month).padStart(2, "0")}-15` 
    : `${year}-${String(month).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`;
  const periodLabel = isFirstHalf 
    ? `1ª Quinzena (01 a 15/${String(month).padStart(2, "0")}/${year})`
    : `2ª Quinzena (16 a ${lastDayOfMonth}/${String(month).padStart(2, "0")}/${year})`;

  // Limpezas de Hoje da Camareira
  const todayCleanings = (db.cleaningRequests || []).filter(r => {
    if (r.status !== "clean" || r.isBedAdjustmentOnly || r.isInstructionOnly || r.type === "instruction" || r.source === "manual_instruction" || r.isPaidCleaning === false) return false;
    if (r.assignedUserId !== maidUserId) return false;
    const effectiveDate = r.completedAt ? getExecutionDateStr(r.completedAt) : (r.effectiveDate || r.requestDate);
    return effectiveDate === todayStr;
  });

  const todayRoomsList = todayCleanings.map(r => {
    const flat = (db.flats || []).find(f => f.id === r.flatId);
    return flat ? flat.number : (r.flatNumber || String(r.flatId));
  });

  let todayTotalMinutes = 0;
  let todayValidDurations = 0;
  todayCleanings.forEach(c => {
    if (c.cleaningStartedAt && c.completedAt) {
      const s = new Date(c.cleaningStartedAt).getTime();
      const e = new Date(c.completedAt).getTime();
      if (e > s) {
        const diff = (e - s) / 60000;
        if (diff <= 90) {
          todayTotalMinutes += diff;
          todayValidDurations++;
        }
      }
    }
  });
  const todayAvgDuration = todayValidDurations > 0 ? Math.round(todayTotalMinutes / todayValidDurations) : 35;

  // Finanças canônicas da Quinzena
  const finances = getMaidPeriodFinances(db, maidUserId, quinzenaStart, quinzenaEnd);

  // Limpezas da Quinzena (para o agrupamento de dias)
  const quinzenaCleanings = (db.cleaningRequests || []).filter(r => {
    if (r.status !== "clean" || r.isBedAdjustmentOnly || r.isInstructionOnly || r.type === "instruction" || r.source === "manual_instruction" || r.isPaidCleaning === false) return false;
    if (r.assignedUserId !== maidUserId) return false;
    const effectiveDate = r.completedAt ? getExecutionDateStr(r.completedAt) : (r.effectiveDate || r.requestDate);
    return effectiveDate >= quinzenaStart && effectiveDate <= quinzenaEnd;
  });

  // Taxa por quarto
  const defaultRate = Number(db.cleaningRates?.defaultRatePerRoom || 22.50);
  const userRate = db.cleaningRates?.userRates?.[maidUserId] !== undefined
    ? Number(db.cleaningRates.userRates[maidUserId])
    : defaultRate;

  const defaultStayoverRate = Number(db.cleaningRates?.defaultStayoverRatePerRoom !== undefined ? db.cleaningRates.defaultStayoverRatePerRoom : 15.00);
  const userStayoverRate = db.cleaningRates?.userStayoverRates?.[maidUserId] !== undefined
    ? Number(db.cleaningRates.userStayoverRates[maidUserId])
    : (maidUserId === 2 || maidUserId === 3 ? 15.00 : defaultStayoverRate);

  // Agrupamento por dia para o detalhamento do fechamento
  const cleaningsByDayMap = {};
  quinzenaCleanings.forEach(c => {
    const d = c.completedAt ? getExecutionDateStr(c.completedAt) : (c.effectiveDate || c.requestDate);
    const flat = (db.flats || []).find(f => f.id === c.flatId);
    const fNum = flat ? flat.number : (c.flatNumber || String(c.flatId));
    const isStay = c.cleaningType === "stayover" || c.source === "stayover";
    const label = isStay ? `${fNum} (Stayover)` : `${fNum}`;
    if (!cleaningsByDayMap[d]) cleaningsByDayMap[d] = [];
    cleaningsByDayMap[d].push(label);
  });

  const sortedDays = Object.keys(cleaningsByDayMap).sort();
  let dayBreakdown = "";
  if (sortedDays.length === 0) {
    dayBreakdown = "• Nenhuma diária registrada nesta quinzena.";
  } else {
    dayBreakdown = sortedDays.map(d => {
      const rooms = cleaningsByDayMap[d];
      return `• *${formatDateBr(d)}:* Flats ${rooms.join(", ")} (${rooms.length} ${rooms.length === 1 ? "quarto" : "quartos"})`;
    }).join("\n");
  }

  return {
    todayDate: todayStr,
    todayBr: formatDateBr(todayStr),
    todayCount: todayCleanings.length,
    todayRoomsList: todayRoomsList.length > 0 ? todayRoomsList.join(", ") : "Nenhum quarto",
    todayAvgDuration,
    quinzenaStart,
    quinzenaEnd,
    periodLabel,
    isFirstHalf,
    isClosingDay: day === 15 || day === lastDayOfMonth,
    quinzenaCount: finances.cleaningsCount,
    checkoutCount: finances.checkoutCount,
    stayoverCount: finances.stayoverCount,
    checkoutGross: finances.checkoutGross,
    stayoverGross: finances.stayoverGross,
    ratePerRoom: userRate,
    userCheckoutRate: userRate,
    userStayoverRate,
    stayoverRate: userStayoverRate,
    quinzenaTotalValue: finances.grossAmount,
    grossAmount: finances.grossAmount,
    previousDebitBalance: finances.previousDebitBalance,
    advancesAmount: finances.advancesAmount,
    paymentsAmount: finances.paymentsAmount,
    netPendingAmount: finances.netPendingAmount,
    lifetimeBalance: finances.lifetimeBalance,
    finances,
    dayBreakdown
  };
}

// ── Resolução de Tags do Template ───────────────────────────────────────────

export function resolveMaidTemplateTags(templateText, maidUser, stats = {}, extra = {}) {
  if (!templateText) return "";

  const name = maidUser.name || maidUser.username || "Colaboradora";
  const firstName = name.trim().split(" ")[0] || name;
  const roomNumber = extra.roomNumber || extra.flatNumber || "101";
  const elapsedMins = extra.elapsedMinutes || extra.durationMinutes || 40;
  const pixKey = maidUser.pixKey?.trim() || "Não informada";

  const gross = stats.grossAmount ?? (stats.finances?.grossAmount ?? stats.quinzenaTotalValue ?? 0);
  const advances = stats.advancesAmount ?? (stats.finances?.advancesAmount ?? 0);
  const netPending = stats.netPendingAmount ?? (stats.finances?.netPendingAmount ?? stats.quinzenaTotalValue ?? 0);
  const prevDebit = stats.previousDebitBalance ?? (stats.finances?.previousDebitBalance ?? 0);

  const opts = extra || {};
  let sampleReviewsList = opts.reviewsList || stats.reviewsList || opts.lista_avaliacoes || stats.lista_avaliacoes;
  if (!sampleReviewsList && Array.isArray(opts.reviews) && opts.reviews.length > 0) {
    sampleReviewsList = opts.reviews.map(r => {
      const rawFlat = r.flatNumber || r.roomNumber || r.flat || "Quarto";
      const flatDisplay = String(rawFlat).trim().toLowerCase().startsWith("flat")
        ? String(rawFlat).trim()
        : `Flat ${rawFlat}`;
      const cleanDateBr = formatDateBr(r.cleaningDate || getBrasiliaNow().date);
      const scoreVal = Number(r.score) || 5;
      const stars = "⭐".repeat(Math.max(1, Math.min(5, Math.round(scoreVal))));
      const commentPart = r.comment ? `\n   💬 _"${r.comment}"_` : "";
      return `• *${flatDisplay}*\n   📅 Limpeza: ${cleanDateBr}\n   ⭐ Nota: *${scoreVal}* ${stars}${commentPart}`;
    }).join("\n\n");
  }
  if (!sampleReviewsList) {
    const todayBr = stats.todayBr || formatDateBr(getBrasiliaNow().date);
    sampleReviewsList = `• *Flat 205*\n   📅 Limpeza: ${todayBr}\n   ⭐ Nota: *5* ⭐⭐⭐⭐⭐\n\n• *Flat 312*\n   📅 Limpeza: ${todayBr}\n   ⭐ Nota: *5* ⭐⭐⭐⭐⭐`;
  }

  const sampleAvgScore = opts.avgScore || stats.avgScore || opts.media_dia || stats.media_dia || "5.0";

  let out = templateText
    .replace(/\{\{nome_camareira\}\}/g, name)
    .replace(/\{\{primeiro_nome\}\}/g, firstName)
    .replace(/\{\{quarto\}\}/g, String(roomNumber))
    .replace(/\{\{tempo_limpeza\}\}/g, String(elapsedMins))
    .replace(/\{\{data_hoje\}\}/g, stats.todayBr || formatDateBr(getBrasiliaNow().date))
    .replace(/\{\{qtd_quartos_hoje\}\}/g, String(stats.todayCount ?? 0))
    .replace(/\{\{lista_quartos_hoje\}\}/g, stats.todayRoomsList || "Nenhum quarto")
    .replace(/\{\{tempo_medio_hoje\}\}/g, String(stats.todayAvgDuration ?? 35))
    .replace(/\{\{periodo_quinzena\}\}/g, stats.periodLabel || "Quinzena Atual")
    .replace(/\{\{total_quartos_quinzena\}\}/g, String(stats.quinzenaCount ?? 0))
    .replace(/\{\{valor_por_quarto\}\}/g, formatCurrency(stats.ratePerRoom ?? 22.50))
    .replace(/\{\{total_valor_quinzena\}\}/g, formatCurrency(stats.quinzenaTotalValue ?? 0))
    .replace(/\{\{bruto_quinzena\}\}/g, formatCurrency(gross))
    .replace(/\{\{vales_quinzena\}\}/g, formatCurrency(advances))
    .replace(/\{\{saldo_liquido_quinzena\}\}/g, formatCurrency(netPending))
    .replace(/\{\{saldo_anterior\}\}/g, formatCurrency(prevDebit))
    .replace(/\{\{chave_pix\}\}/g, pixKey)
    .replace(/\{\{detalhamento_dias\}\}/g, stats.dayBreakdown || "• Sem diárias no período.")
    .replace(/\{\{lista_avaliacoes\}\}/g, sampleReviewsList)
    .replace(/\{\{media_dia\}\}/g, String(sampleAvgScore))
    .replace(/\{\{nome_hotel\}\}/g, "CorpFlats");

  return out;
}

// ── Feature F3 & F4: Motor de Triagem por IA para Avaliações Sub-5 ───────────

/**
 * Categorias e regexes do Tier 2 (Motor Determinístico de Governança Hoteleira)
 */
const CLEANING_DEFECT_REGEX = /\b(?:suj[oa]s?|sujeira[s]?|mancha[s]?|manchad[oa]s?|encardid[oa]s?|imund[oa]s?|amarel[oa]s?|amarelid[aã]o|engordurad[oa]s?|gordur[aa]s?|pegajos[oa]s?|grudent[oa]s?|viscos[oa]s?|limo|lodo|cabelo[s]?|poeira[s]?|p[oó]\b|lixo[s]?|chei[oa]s?|falt\w*|sem\b|n[aã]o\s+tinha|acab\w*|esquec\w*|n[aã]o\s+(?:lavar\w*|limpar\w*|trocar\w*)|sem\s+(?:lavar|limpar|trocar)|ruim|p[eé]ssim\w*|mal\s+lavad[oa]s?|mal\s+feit[oa]s?|cheiro\s+ruim|mau\s+cheiro|odor(?:es)?|mofo|inseto[s]?|barata[s]?|formiga[s]?)\b/i;

/**
 * Expressão de defeitos explícitos de governança (excluindo adjetivos genéricos como "ruim" e "péssimo",
 * utilizada para desambiguar comentários onde houve elogio geral à limpeza mas foi apontado um defeito específico).
 */
const EXPLICIT_CLEANING_DEFECT_REGEX = /\b(?:suj[oa]s?|sujeira[s]?|mancha[s]?|manchad[oa]s?|encardid[oa]s?|imund[oa]s?|amarel[oa]s?|amarelid[aã]o|engordurad[oa]s?|gordur[aa]s?|pegajos[oa]s?|grudent[oa]s?|viscos[oa]s?|limo|lodo|cabelo[s]?|poeira[s]?|p[oó]\b|lixo[s]?|chei[oa]s?|falt\w*|sem\b|n[aã]o\s+tinha|acab\w*|esquec\w*|n[aã]o\s+(?:lavar\w*|limpar\w*|trocar\w*)|sem\s+(?:lavar|limpar|trocar)|mal\s+lavad[oa]s?|mal\s+feit[oa]s?|cheiro\s+ruim|mau\s+cheiro|odor(?:es)?|mofo|inseto[s]?|barata[s]?|formiga[s]?)\b/i;

/**
 * Expressão para identificação de elogios à limpeza/quarto
 */
const CLEANING_PRAISE_REGEX = /(?:\b(?:limpeza|quarto|apartamento|flat|cama|banheiro)\s+(?:estava\s+|foi\s+)?(?:uma?\s+)?(?:[oó]tim[oa]|excelente|maravilh\w*|impec[aá]vel|10|perfeit[oa]|muito\s+bo[am]|limp[oa]|cheiros[oa]|primor|show|sensacional|fant[aá]stic[oa])|\b(?:primor|impec[aá]vel|maravilh\w*|excelente)\s+(?:de\s+)?limpeza)\b/i;

const CLEANING_CATEGORY_RULES = [
  {
    key: "enxoval_cama",
    aspect: "lençóis e roupas de cama",
    targetRegex: /\b(?:len[cç][oó][li]s?|fronha[s]?|travesseir[oa]s?|cama[s]?|edredom|edredon|cobertor(?:es)?|manta[s]?|colcha[s]?|colch[aã]o)\b/i
  },
  {
    key: "enxoval_toalhas",
    aspect: "toalhas de banho e rosto",
    targetRegex: /\b(?:toalh[aa]s?|enxoval)\b/i
  },
  {
    key: "amenities_higiene",
    aspect: "amenities e kit banho",
    targetRegex: /\b(?:sabonete[s]?|shampoo[s]?|xampu[s]?|condicionador(?:es)?|papel\s+higi[eê]nico|amenit(?:y|ies)|kit\s+(?:de\s+)?banho|touca[s]?)\b/i
  },
  {
    key: "banheiro_box",
    aspect: "box e banheiro",
    targetRegex: /\b(?:box\b|banheiro[s]?|vaso[s]?|sanit[aá]rio[s]?|privada[s]?|pia\s+do\s+banheiro|espelho[s]?|ralo[s]?)\b/i
  },
  {
    key: "copa_loucas_talheres",
    aspect: "louças, pratos e talheres",
    targetRegex: /\b(?:lou[cç]a[s]?|prato[s]?|talher(?:es)?|garfo[s]?|faca[s]?|colher(?:es)?|copo[s]?|ta[cç]a[s]?|x[ií]cara[s]?|panela[s]?|micro-?ondas|frigobar)\b/i
  },
  {
    key: "limpeza_piso_lixo_poeira",
    aspect: "piso, poeira e lixo",
    targetRegex: /\b(?:poeira|p[oó]\b|ch[aã]o|piso|lixo|lixeira[s]?|cesto[s]?|migalha[s]?|teia[s]?|faxina|limpeza|barata|inseto|formiga)\b/i
  }
];

const NON_CLEANING_CATEGORY_RULES = [
  {
    key: "wifi_internet",
    aspect: "Wi-Fi e Internet",
    category: "non_maid_infrastructure",
    primaryResponsibility: "hotel_gestao",
    regex: /\b(?:wi-?fi|internet|conex[aã]o|sinal\s+de\s+rede|rede\s+sem\s+fio)\b/i
  },
  {
    key: "checkin_portaria",
    aspect: "Check-in e Portaria",
    category: "non_maid_checkin_service",
    primaryResponsibility: "recepcao_portaria",
    regex: /\b(?:check-?in|portaria|porteiro[s]?|recep[cç][aã]o|atendente[s]?|atendimento|fila[s]?|cadastro|demora\s+(?:na|no|pra|para)\s+entrar|libera[cç][aã]o|chave[s]?|senha\s+da\s+porta|fechadura[s]?)\b/i
  },
  {
    key: "ar_condicionado_hidraulica",
    aspect: "Ar-condicionado e Manutenção Predial",
    category: "non_maid_infrastructure",
    primaryResponsibility: "manutencao",
    regex: /\b(?:ar-?condicionado|ar\s+condicionado|n[aã]o\s+gela|pingando|vazamento[s]?|infiltra[cç][aã]o|goteira[s]?|press[aã]o\s+da\s+[aá]gua|chuveiro\s+(?:frio|[aá]gua\s+fria|n[aã]o\s+esquenta|queimado)|aquecedor|torneira\s+vazando|descarga\s+(?:quebrada|com\s+defeito)|ma[cç]aneta[s]?)\b/i
  },
  {
    key: "ruido_externo",
    aspect: "Barulho Externo e Vizinhos",
    category: "non_maid_external_noise",
    primaryResponsibility: "externo",
    regex: /\b(?:barulh[oa]s?|ru[ií]do[s]?|som\s+alto|vizinh[oa]s?|rua|tr[aâ]nsito|obra[s]?|reforma[s]?|ac[uú]stica|isolamento\s+ac[uú]stico|elevador\s+barulhento)\b/i
  },
  {
    key: "tv_eletronicos",
    aspect: "TV e Eletrônicos",
    category: "non_maid_infrastructure",
    primaryResponsibility: "hotel_gestao",
    regex: /\b(?:tv|televis[aã]o|smart\s*tv|netflix|youtube|controle\s+remoto|pilha[s]?|tomada[s]?|l[aâ]mpada[s]?|luz|ilumina[cç][aã]o)\b/i
  },
  {
    key: "cafe_manha",
    aspect: "Café da Manhã",
    category: "non_maid_infrastructure",
    primaryResponsibility: "hotel_gestao",
    regex: /\b(?:caf[eé]\s+da\s+manh[aã]|desjejum|bandeja[s]?\s+de\s+caf[eé]|entrega\s+do\s+caf[eé])\b/i
  }
];

/**
 * Tier 2: Motor Determinístico de Triagem por Expressões Regulares
 */
export function deterministicTriageSub5Review({ score, comment = "", flatNumber = null }) {
  const numScore = Number(score);
  const cleanComment = String(comment || "").trim();

  // Regra 1: Avaliações com nota 5 são automaticamente elegíveis sem necessidade de triagem
  if (numScore === 5) {
    return {
      isCleaningRelated: true,
      category: "maid_cleaning",
      primaryResponsibility: "camareira",
      forwardToMaid: true,
      cleaningAspects: ["avaliacao_nota_5"],
      nonCleaningAspects: [],
      explanation: "Avaliação com nota máxima (5 estrelas): encaminhada automaticamente à camareira responsável.",
      triageMethod: "deterministic_fallback"
    };
  }

  // Regra 2: Avaliações < 5 sem comentário descritivo são retidas para proteger a camareira
  if (!cleanComment) {
    return {
      isCleaningRelated: false,
      category: "non_maid_infrastructure",
      primaryResponsibility: "hotel_gestao",
      forwardToMaid: false,
      cleaningAspects: [],
      nonCleaningAspects: [],
      explanation: "Avaliação inferior a 5 estrelas sem comentário justificativo: retida de envio para a camareira.",
      triageMethod: "deterministic_fallback"
    };
  }

  // Verificação de elogio isolado à limpeza quando a crítica real é de outro setor (ex: "quarto impecável, mas wi-fi ruim").
  // Se houver qualquer defeito explícito de governança (ex: "piso pegajoso", "amenities acabaram", "esqueceram de lavar o banheiro"),
  // o comentário NÃO deve ser tratado como apenas elogio.
  const isCleaningPraised = CLEANING_PRAISE_REGEX.test(cleanComment);
  const hasExplicitCleaningDefect = EXPLICIT_CLEANING_DEFECT_REGEX.test(cleanComment);
  const isCleaningPraisedOnly = isCleaningPraised && !hasExplicitCleaningDefect;

  const cleaningAspects = [];
  if (!isCleaningPraisedOnly) {
    for (const rule of CLEANING_CATEGORY_RULES) {
      if (rule.targetRegex.test(cleanComment) && CLEANING_DEFECT_REGEX.test(cleanComment)) {
        cleaningAspects.push(rule.aspect);
      }
    }
  }

  const nonCleaningAspects = [];
  let primaryNonCleaning = null;
  for (const rule of NON_CLEANING_CATEGORY_RULES) {
    if (rule.regex.test(cleanComment)) {
      nonCleaningAspects.push(rule.aspect);
      if (!primaryNonCleaning) primaryNonCleaning = rule;
    }
  }

  const hasCleaning = cleaningAspects.length > 0;
  const hasNonCleaning = nonCleaningAspects.length > 0;

  if (hasCleaning && !hasNonCleaning) {
    return {
      isCleaningRelated: true,
      category: "maid_cleaning",
      primaryResponsibility: "camareira",
      forwardToMaid: true,
      cleaningAspects,
      nonCleaningAspects: [],
      explanation: `Avaliação com apontamento direto sobre limpeza e governança (${cleaningAspects.join(", ")}). Encaminhada à camareira.`,
      triageMethod: "deterministic_fallback"
    };
  }

  if (hasCleaning && hasNonCleaning) {
    return {
      isCleaningRelated: true,
      category: "mixed",
      primaryResponsibility: "camareira",
      forwardToMaid: true,
      cleaningAspects,
      nonCleaningAspects,
      explanation: `Avaliação mista contendo apontamentos de limpeza (${cleaningAspects.join(", ")}) e infraestrutura (${nonCleaningAspects.join(", ")}). Encaminhada à camareira em função dos itens de governança.`,
      triageMethod: "deterministic_fallback"
    };
  }

  if (!hasCleaning && hasNonCleaning) {
    return {
      isCleaningRelated: false,
      category: primaryNonCleaning?.category || "non_maid_infrastructure",
      primaryResponsibility: primaryNonCleaning?.primaryResponsibility || "hotel_gestao",
      forwardToMaid: false,
      cleaningAspects: [],
      nonCleaningAspects,
      explanation: `Avaliação contendo críticas exclusivas de ${nonCleaningAspects.join(", ")}, fora do escopo da governança. Não encaminhada à camareira.`,
      triageMethod: "deterministic_fallback"
    };
  }

  return {
    isCleaningRelated: false,
    category: "non_maid_infrastructure",
    primaryResponsibility: "hotel_gestao",
    forwardToMaid: false,
    cleaningAspects: [],
    nonCleaningAspects: [],
    explanation: "Avaliação genérica sem itens explícitos de governança: retida para evitar penalização injusta da camareira.",
    triageMethod: "deterministic_fallback"
  };
}

/**
 * Helper de Descoberta de Endpoints Gemini para a Automação de Governança
 */
export async function getMaidGeminiCandidateEndpoints(apiKey, db = null) {
  const preferred = [
    { ver: "v1beta", model: "gemini-2.5-flash" },
    { ver: "v1beta", model: "gemini-2.5-pro" },
    { ver: "v1beta", model: "gemini-2.0-flash" },
    { ver: "v1beta", model: "gemini-1.5-flash" }
  ];
  const savedModel = db?.settings?.geminiModel;
  const savedVer = db?.settings?.geminiApiVersion || "v1beta";
  if (savedModel && !savedModel.includes("tts") && !savedModel.includes("embed")) {
    return [{ ver: savedVer, model: savedModel }, ...preferred.filter(p => p.model !== savedModel)];
  }
  return preferred;
}

/**
 * Helper de Execução de Conteúdo no Gemini com thinkingBudget: 0
 */
export async function callMaidGeminiGenerateContent(apiKey, contents, { db = null, timeoutMs = 6000 } = {}) {
  const candidates = await getMaidGeminiCandidateEndpoints(apiKey, db);
  let lastError = null;

  for (const { ver, model } of candidates) {
    try {
      const payload = { contents };
      if (model.startsWith("gemini-2.5-flash")) {
        payload.generationConfig = { thinkingConfig: { thinkingBudget: 0 } };
      }

      let res = await fetch(`https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!res.ok && res.status === 400 && payload.generationConfig) {
        res = await fetch(`https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents }),
          signal: AbortSignal.timeout(timeoutMs)
        });
      }

      if (res.ok) {
        const data = await res.json();
        return { ok: true, data, model, ver };
      } else {
        const errJson = await res.json().catch(() => ({}));
        lastError = errJson.error?.message || `Status ${res.status}`;
      }
    } catch (e) {
      lastError = e.message;
    }
  }

  return { ok: false, error: lastError || "Falha ao consultar modelos Gemini." };
}

/**
 * Função Canônica Two-Tier de Triagem de Avaliações Sub-5 (Feature F3 & F4)
 * 
 * @param {Object} params
 * @param {number} params.score - Nota da avaliação (1 a 5)
 * @param {string} params.comment - Comentário descritivo fornecido pelo hóspede
 * @param {string} [params.flatNumber] - Número do flat (opcional)
 * @param {Object} [params.db] - Instância do banco de dados em memória
 * @param {Function} [params.aiClientMock] - Mock de IA para testes unitários determinísticos
 * @returns {Promise<FeedbackTriageResult>}
 */
export async function triageSub5Review({
  score,
  comment = "",
  flatNumber = null,
  db = null,
  aiClientMock = null
}) {
  const numScore = Number(score);
  const cleanComment = String(comment || "").trim();

  // Curto-circuito 1: Avaliações nota 5 são automaticamente encaminhadas
  if (numScore === 5) {
    return deterministicTriageSub5Review({ score: 5, comment: cleanComment, flatNumber });
  }

  // Curto-circuito 2: Avaliações inferiores a 5 sem comentário são retidas de envio
  if (!cleanComment) {
    return deterministicTriageSub5Review({ score: numScore, comment: "", flatNumber });
  }

  // Caso haja mock de IA injetado para testes unitários
  if (typeof aiClientMock === "function") {
    try {
      const mockResult = await aiClientMock({ score: numScore, comment: cleanComment, flatNumber });
      if (mockResult && typeof mockResult === "object") {
        return {
          isCleaningRelated: Boolean(mockResult.isCleaningRelated),
          category: mockResult.category || (mockResult.isCleaningRelated ? "maid_cleaning" : "non_maid_infrastructure"),
          primaryResponsibility: mockResult.primaryResponsibility || (mockResult.isCleaningRelated ? "camareira" : "hotel_gestao"),
          forwardToMaid: Boolean(mockResult.forwardToMaid),
          cleaningAspects: Array.isArray(mockResult.cleaningAspects) ? mockResult.cleaningAspects : [],
          nonCleaningAspects: Array.isArray(mockResult.nonCleaningAspects) ? mockResult.nonCleaningAspects : [],
          explanation: mockResult.explanation || "Classificação realizada via IA simulada (Mock).",
          triageMethod: "gemini_llm"
        };
      }
    } catch (mockErr) {
      console.warn("[triageSub5Review] Falha no aiClientMock, acionando fallback determinístico:", mockErr.message);
    }
  }

  // Tier 1: Tentativa com Google Gemini JSON Estruturado
  const apiKey = process.env.GEMINI_API_KEY || db?.settings?.geminiApiKey || process.env.GOOGLE_AI_API_KEY;

  if (apiKey) {
    try {
      const prompt = `Você é um perito em governança hoteleira e triagem de qualidade do CorpFlats.
Sua tarefa é analisar o comentário de um hóspede que avaliou a estadia com nota ${numScore} de 5 e categorizar com precisão cirúrgica se o motivo da insatisfação diz respeito a responsabilidades diretas da camareira/governança (roupas de cama, enxoval de banho, toalhas, amenities, limpeza de box/banheiro, louças/copos/talheres, poeira, lixo, odores) OU se o motivo decorre de fatores alheios (portaria/check-in, Wi-Fi/internet, TV, ar-condicionado, encanamento/pressão de água, barulho de rua/vizinhos).

Texto da avaliação: """${cleanComment}"""
${flatNumber ? `Flat avaliado: ${flatNumber}` : ""}

Diretrizes:
1. SE a reclamação envolver limpeza, toalhas, lençóis, amenidades, banheiro, poeira ou lixo: forwardToMaid: true, isCleaningRelated: true.
2. SE for exclusivamente sobre Wi-Fi, portaria, check-in, ar-condicionado, manutenção ou barulho: forwardToMaid: false, isCleaningRelated: false.
3. SE for misto (reclamou de governança E de itens alheios): forwardToMaid: true, isCleaningRelated: true, category: "mixed".
4. SE a limpeza for expressamente elogiada e a nota baixa for devida a outros fatores: forwardToMaid: false, isCleaningRelated: false.

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem tags markdown):
{
  "isCleaningRelated": boolean,
  "category": "maid_cleaning" | "non_maid_infrastructure" | "non_maid_checkin_service" | "non_maid_external_noise" | "mixed",
  "primaryResponsibility": "camareira" | "hotel_gestao" | "manutencao" | "recepcao_portaria" | "externo",
  "forwardToMaid": boolean,
  "cleaningAspects": ["string"],
  "nonCleaningAspects": ["string"],
  "explanation": "string"
}`;

      const aiRes = await callMaidGeminiGenerateContent(apiKey, [{ parts: [{ text: prompt }] }], { db, timeoutMs: 6000 });

      if (aiRes.ok) {
        const rawText = aiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            isCleaningRelated: Boolean(parsed.isCleaningRelated),
            category: parsed.category || (parsed.isCleaningRelated ? "maid_cleaning" : "non_maid_infrastructure"),
            primaryResponsibility: parsed.primaryResponsibility || (parsed.isCleaningRelated ? "camareira" : "hotel_gestao"),
            forwardToMaid: Boolean(parsed.forwardToMaid),
            cleaningAspects: Array.isArray(parsed.cleaningAspects) ? parsed.cleaningAspects : [],
            nonCleaningAspects: Array.isArray(parsed.nonCleaningAspects) ? parsed.nonCleaningAspects : [],
            explanation: parsed.explanation || "Triagem realizada com sucesso via Google Gemini AI.",
            triageMethod: "gemini_llm"
          };
        }
      }
    } catch (geminiErr) {
      console.warn("[triageSub5Review] Erro no Tier 1 (Gemini), acionando fallback determinístico Tier 2:", geminiErr.message);
    }
  }

  // Tier 2: Fallback determinístico 100% preciso para execução offline ou sem chave
  return deterministicTriageSub5Review({ score: numScore, comment: cleanComment, flatNumber });
}

// ── Feature F1: Identificação Determinística da Camareira (Maid Attribution) ──

/**
 * Localiza de forma determinística a camareira e a limpeza concluída correspondente à reserva avaliada,
 * priorizando limpezas de stayover executadas durante a estadia ou a limpeza de preparação
 * na data ou anterior ao check-in.
 * 
 * @param {object} db - Instância do banco de dados em memória
 * @param {object|string|number} reservation - Objeto da reserva ou ID/código
 * @param {object} [options] - Opções de busca ({ preferStayover?: boolean, flatNumber?: string, evaluationDate?: string })
 * @returns {{
 *   maidUser: { id: number, name: string, username: string, phone: string, whatsapp: string, pixKey?: string, role?: string } | null,
 *   cleaningRequest: { id: any, flatNumber: string, requestDate: string, effectiveDate?: string, status: string, [key: string]: any } | null,
 *   cleaningDate: string | null,
 *   isStayover: boolean
 * }}
 */
export function resolveMaidCleaningForReservation(db, reservation, options = {}) {
  const defaultReturn = {
    maidUser: null,
    cleaningRequest: null,
    cleaningDate: null,
    isStayover: false
  };

  if (!db || (!reservation && !options.flatNumber)) return defaultReturn;

  const { preferStayover = true } = options;

  // 1. Normalização do objeto de reserva
  let resObj = reservation;
  if (typeof reservation === "string" || typeof reservation === "number") {
    resObj = (db.reservations || []).find(r =>
      String(r.id) === String(reservation) ||
      String(r.code) === String(reservation)
    ) || null;
    if (!resObj && !options.flatNumber) return defaultReturn;
  }

  if (!resObj && options.flatNumber) {
    resObj = {
      flatNumber: options.flatNumber,
      date: options.evaluationDate || options.date,
      evaluationDate: options.evaluationDate
    };
  }

  // Se o objeto fornecido estiver incompleto (ex: apenas { id }), busca em db.reservations
  if (resObj && (!resObj.flatNumber && !resObj.flatId) && Array.isArray(db.reservations)) {
    const fullRes = db.reservations.find(r =>
      (resObj.id && String(r.id) === String(resObj.id)) ||
      (resObj.code && String(r.code) === String(resObj.code))
    );
    if (fullRes) {
      resObj = { ...fullRes, ...resObj };
    }
  }

  // Se recebemos um objeto review/feedback com flatMentioned e date
  if (resObj && !resObj.checkinDate && !resObj.checkIn && (resObj.flatMentioned || resObj.flatNumber) && (resObj.date || resObj.evaluationDate)) {
    const targetFn = String(resObj.flatMentioned || resObj.flatNumber || "");
    const rDate = String(resObj.date || resObj.evaluationDate).substring(0, 10);
    const candidateRes = (db.reservations || []).find(r => {
      const fn = String(r.flatNumber || r.roomNumber || "");
      if (fn !== targetFn) return false;
      const cIn = String(r.checkinDate || r.checkIn || "").substring(0, 10);
      const cOut = String(r.checkoutDate || r.checkOut || "").substring(0, 10);
      return (cOut === rDate) || (cIn <= rDate && cOut >= rDate);
    });
    if (candidateRes) {
      resObj = { ...candidateRes, ...resObj };
    }
  }

  // 2. Extração e validação de datas da reserva
  const checkinRaw = resObj?.checkinDate || resObj?.checkIn || resObj?.checkInDate || resObj?.arrivalDate || resObj?.startDate || resObj?.date || resObj?.evaluationDate || options.evaluationDate;
  const checkoutRaw = resObj?.checkoutDate || resObj?.checkOut || resObj?.checkOutDate || resObj?.departureDate || resObj?.endDate || checkinRaw;
  
  if (!checkinRaw) return defaultReturn;

  const checkinDate = String(checkinRaw).trim().substring(0, 10);
  const checkoutDate = String(checkoutRaw).trim().substring(0, 10);

  // Resolução do flat correspondente
  const flatObj = (db.flats || []).find(f =>
    (resObj?.flatId != null && f.id === Number(resObj.flatId)) ||
    (resObj?.flatNumber != null && (String(f.number) === String(resObj.flatNumber) || String(f.id) === String(resObj.flatNumber))) ||
    (options?.flatNumber != null && (String(f.number) === String(options.flatNumber) || String(f.id) === String(options.flatNumber)))
  );

  const flatNumber = String(
    resObj?.flatNumber ||
    resObj?.roomNumber ||
    flatObj?.number ||
    (resObj?.flatId ? String(resObj.flatId) : "") ||
    options?.flatNumber ||
    ""
  ).trim();

  if (!flatNumber) return defaultReturn;

  const flatDigits = flatNumber.replace(/\D/g, "");
  const targetFlatId = flatObj ? flatObj.id : (resObj?.flatId ? Number(resObj.flatId) : null);

  // Filtro de correspondência do flat
  const matchesFlat = (c) => {
    if (!c) return false;
    if (targetFlatId != null && (c.flatId === targetFlatId || Number(c.flatId) === targetFlatId)) return true;
    const cFlatNum = String(c.flatNumber || c.flatId || "").trim();
    if (cFlatNum === flatNumber) return true;
    const cDigits = cFlatNum.replace(/\D/g, "");
    if (cDigits && flatDigits && cDigits === flatDigits) return true;
    return false;
  };

  // Filtro de limpeza concluída válida (ignora instruções manuais, ajustes de cama e não pagas)
  const isValidCleaning = (c) => {
    if (!c) return false;
    if (c.status !== "clean") return false;
    if (c.isBedAdjustmentOnly || c.isInstructionOnly) return false;
    if (c.type === "instruction" || c.type === "bed_adjustment_only") return false;
    if (c.source === "manual_instruction") return false;
    if (c.isPaidCleaning === false) return false;
    if (c.id === 1 && (c.flatId === 22 || c.requestDate === "2026-09-01")) return false;
    return true;
  };

  // Helper de data de execução
  const getCleaningDate = (c) => {
    if (c.completedAt) return getExecutionDateStr(c.completedAt);
    if (c.effectiveDate) return String(c.effectiveDate).trim().substring(0, 10);
    if (c.requestDate) return String(c.requestDate).trim().substring(0, 10);
    if (c.createdAt) return getExecutionDateStr(c.createdAt);
    return "";
  };

  const cleaningsPool = (db.cleaningRequests || []).filter(c => matchesFlat(c) && isValidCleaning(c));

  let matchedCleaning = null;
  let isStayover = false;
  const evalDateUpper = String(options?.evaluationDate || resObj?.evaluationDate || "").trim().substring(0, 10);

  // 3. Etapa 1: Priorização de Stayover executado durante a estadia do hóspede
  if (preferStayover) {
    const stayoverCandidates = cleaningsPool.filter(c => {
      const isSt = c.cleaningType === "stayover" || c.source === "stayover" || c.type === "stayover";
      if (!isSt) return false;
      const cDate = getCleaningDate(c);
      if (!cDate) return false;
      if (evalDateUpper && cDate > evalDateUpper) return false;
      return cDate >= checkinDate && cDate <= checkoutDate;
    });

    if (stayoverCandidates.length > 0) {
      stayoverCandidates.sort((a, b) => {
        const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        const dateA = getCleaningDate(a);
        const dateB = getCleaningDate(b);
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        return (Number(b.id) || 0) - (Number(a.id) || 0);
      });
      matchedCleaning = stayoverCandidates[0];
      isStayover = true;
    }
  }

  // 4. Etapa 2: Limpeza de preparação do quarto (requestDate <= checkinDate)
  if (!matchedCleaning) {
    const prepCandidates = cleaningsPool.filter(c => {
      const isSt = c.cleaningType === "stayover" || c.source === "stayover" || c.type === "stayover";
      if (isSt) return false;
      const execDate = getCleaningDate(c);
      const reqDate = String(c.requestDate || c.effectiveDate || execDate).substring(0, 10);
      if (!reqDate) return false;
      if (evalDateUpper && execDate && execDate > evalDateUpper) return false;
      if (checkoutDate && execDate && execDate > checkoutDate) return false;
      return reqDate <= checkinDate;
    });

    if (prepCandidates.length > 0) {
      prepCandidates.sort((a, b) => {
        // Bônus para vínculo explícito de reserva ou hóspede que chega (arrivingGuest)
        const resCode = String(resObj?.code || resObj?.id || "").toLowerCase();
        const aCodeMatch = Boolean(resCode && (String(a.reservationCode || a.reservationId || "").toLowerCase() === resCode));
        const bCodeMatch = Boolean(resCode && (String(b.reservationCode || b.reservationId || "").toLowerCase() === resCode));
        if (aCodeMatch && !bCodeMatch) return -1;
        if (!aCodeMatch && bCodeMatch) return 1;

        const guestName = String(resObj?.guestName || "").trim().toLowerCase();
        const aArrMatch = Boolean(guestName && a.arrivingGuest && String(a.arrivingGuest).trim().toLowerCase() === guestName);
        const bArrMatch = Boolean(guestName && b.arrivingGuest && String(b.arrivingGuest).trim().toLowerCase() === guestName);
        if (aArrMatch && !bArrMatch) return -1;
        if (!aArrMatch && bArrMatch) return 1;

        // Data mais recente
        const dateA = String(a.requestDate || a.effectiveDate || getCleaningDate(a)).substring(0, 10);
        const dateB = String(b.requestDate || b.effectiveDate || getCleaningDate(b)).substring(0, 10);
        if (dateA !== dateB) return dateB.localeCompare(dateA);

        // Horário de conclusão mais recente
        const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;

        return (Number(b.id) || 0) - (Number(a.id) || 0);
      });

      matchedCleaning = prepCandidates[0];
      isStayover = false;
    }
  }

  if (!matchedCleaning) {
    return defaultReturn;
  }

  // 5. Resolução da Camareira responsável (com fallbacks para missing assignedUserId)
  let resolvedMaidUser = null;
  const cleaningDate = getCleaningDate(matchedCleaning);

  let maidId = matchedCleaning.assignedUserId != null ? Number(matchedCleaning.assignedUserId) : null;

  // Fallback 1: db.maidStatementEntries
  if (!maidId && Array.isArray(db.maidStatementEntries)) {
    const linkedEntry = db.maidStatementEntries.find(e => e.cleaningRequestId === matchedCleaning.id && e.userId);
    if (linkedEntry) {
      maidId = Number(linkedEntry.userId);
    }
  }

  // Busca do usuário em db.users
  let rawUser = null;
  if (maidId && Array.isArray(db.users)) {
    rawUser = db.users.find(u => Number(u.id) === maidId);
  }

  // Fallback 2: username ou assignedUserName
  if (!rawUser && Array.isArray(db.users)) {
    const rawMaidName = String(matchedCleaning.assignedUserName || matchedCleaning.assignedUsername || matchedCleaning.maidName || "").trim().toLowerCase();
    if (rawMaidName) {
      rawUser = db.users.find(u =>
        (u.username && u.username.toLowerCase() === rawMaidName) ||
        (u.name && u.name.toLowerCase() === rawMaidName)
      );
    }
  }

  if (rawUser) {
    const isCris = rawUser.id === 2 || (rawUser.username && rawUser.username.toLowerCase() === "cris");
    const isGrazi = rawUser.id === 3 || (rawUser.username && rawUser.username.toLowerCase() === "grazi");
    const rawWpp = rawUser.whatsapp || rawUser.phone || (isCris ? "5522988486446" : (isGrazi ? "5522999106204" : ""));
    const rawPhone = rawUser.phone || rawUser.whatsapp || (isCris ? "22988486446" : (isGrazi ? "22999106204" : ""));
    const cleanWpp = cleanWhatsAppPhone(rawWpp) || rawWpp;

    resolvedMaidUser = {
      id: rawUser.id,
      name: rawUser.name || rawUser.username || (isCris ? "Cris" : isGrazi ? "Grazi" : "Camareira"),
      username: rawUser.username || "",
      phone: rawPhone,
      whatsapp: cleanWpp,
      pixKey: rawUser.pixKey || (isCris ? "22988486446" : isGrazi ? "12977795766" : ""),
      role: rawUser.role || "camareira"
    };
  }

  return {
    maidUser: resolvedMaidUser,
    cleaningRequest: {
      id: matchedCleaning.id,
      flatNumber: String(matchedCleaning.flatNumber || flatNumber),
      requestDate: String(matchedCleaning.requestDate || cleaningDate),
      effectiveDate: String(matchedCleaning.effectiveDate || cleaningDate),
      status: matchedCleaning.status,
      completedAt: matchedCleaning.completedAt || null,
      cleaningType: matchedCleaning.cleaningType || (isStayover ? "stayover" : "checkout"),
      source: matchedCleaning.source || null,
      assignedUserId: matchedCleaning.assignedUserId || (resolvedMaidUser ? resolvedMaidUser.id : null),
      assignedUsername: matchedCleaning.assignedUsername || (resolvedMaidUser ? resolvedMaidUser.username : null)
    },
    cleaningDate,
    isStayover
  };
}

// ── Feature F5, F6 & F7: Síntese de Opiniões & Disparo em Tempo Real (Mercado Livre) ─

export const OPINION_ITEM_DEFINITIONS = [
  {
    key: "boxBanheiro",
    name: "Box e Banheiro",
    regex: /\b(?:box\b|banheiro[s]?|vaso[s]?|sanit[aá]rio[s]?|privada[s]?|chuveiro|ducha|ralo[s]?|espelho[s]?|pia\s+do\s+banheiro)\b/i,
    positiveHighlight: "Box do banheiro e espelho bem higienizados",
    attentionPoint: "Box do banheiro e rejuntes com manchas ou umidade"
  },
  {
    key: "utensiliosCozinha",
    name: "Louças, Pratos e Utensílios",
    regex: /\b(?:utens[ií]lio[s]?|lou[cç]a[s]?|prato[s]?|talher(?:es)?|garfo[s]?|faca[s]?|colher(?:es)?|copo[s]?|ta[cç]a[s]?|x[ií]cara[s]?|panela[s]?|frigobar|micro-?ondas|pia\s+da\s+cozinha)\b/i,
    positiveHighlight: "Pratos, copos e utensílios de cozinha limpos",
    attentionPoint: "Louças, pratos ou talheres com resíduos ou gordura"
  },
  {
    key: "enxovalCamaBanho",
    name: "Enxoval de Cama e Banho",
    regex: /\b(?:enxoval|len[cç][oó][li]s?|fronha[s]?|travesseir[oa]s?|cama[s]?|edredom|edredon|cobertor(?:es)?|manta[s]?|colcha[s]?|colch[aã]o|toalh[aa]s?|pano[s]?\s+de\s+(?:prato|ch[aã]o|rosto|banho))\b/i,
    positiveHighlight: "Enxoval e lençóis cheirosos e alinhados",
    attentionPoint: "Toalhas ou lençóis faltando ou com manchas"
  },
  {
    key: "pisoPoeira",
    name: "Piso e Poeira",
    regex: /\b(?:piso[s]?|ch[aã]o|poeira[s]?|p[oó]\b|lixo[s]?|lixeira[s]?|cesto[s]?|sujeira[s]?\s+no\s+ch[aã]o|cabelo[s]?\s+no\s+ch[aã]o|migalha[s]?|varr\w*)\b/i,
    positiveHighlight: "Piso bem limpo e sem poeira",
    attentionPoint: "Poeira no piso ou resíduos no chão"
  }
];

const MONTH_NAMES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

function getPeriodLabels(evaluationDate = null) {
  let dateObj;
  if (evaluationDate) {
    const dStr = String(evaluationDate).substring(0, 10);
    const [y, m, d] = dStr.split("-").map(Number);
    dateObj = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  } else {
    const bNow = getBrasiliaNow();
    const [y, m, d] = bNow.date.split("-").map(Number);
    dateObj = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  }
  const currYear = dateObj.getUTCFullYear();
  const currMonthIdx = dateObj.getUTCMonth();
  const currLabel = `${MONTH_NAMES_PT[currMonthIdx]}/${currYear}`;

  const prevMonthDate = new Date(Date.UTC(currYear, currMonthIdx - 1, 1));
  const prevYear = prevMonthDate.getUTCFullYear();
  const prevMonthIdx = prevMonthDate.getUTCMonth();
  const prevLabel = `${MONTH_NAMES_PT[prevMonthIdx]}/${prevYear}`;

  return { currentLabel: currLabel, previousLabel: prevLabel };
}

/**
 * Atualiza incrementalmente a síntese de opiniões dos hóspedes da camareira (Estilo Mercado Livre)
 * e calcula o comparativo de evolução período a período.
 *
 * @param {object} db Instância do banco de dados em memória
 * @param {object} params
 * @param {number|string} params.maidId ID da camareira
 * @param {object} params.review Objeto de avaliação contendo score/rating e comentário
 * @param {object} [params.triageResult] Resultado prévio da triagem por IA
 * @returns {object} Objeto MaidOpinionSynthesis atualizado
 */
export function updateMaidOpinionSynthesis(db, { maidId, review = {}, triageResult = null } = {}) {
  if (!db) throw new Error("updateMaidOpinionSynthesis: db is required");
  if (!maidId && maidId !== 0) throw new Error("updateMaidOpinionSynthesis: maidId is required");

  if (!db.maidOpinionSynthesis) {
    db.maidOpinionSynthesis = {};
  }

  // Identificação do nome da camareira
  let resolvedMaidName = null;
  if (Array.isArray(db.users)) {
    const u = db.users.find(user => user.id === Number(maidId) || String(user.id) === String(maidId));
    if (u) resolvedMaidName = u.name || u.username;
  }
  if (!resolvedMaidName) {
    resolvedMaidName = `Camareira #${maidId}`;
  }

  const { currentLabel, previousLabel } = getPeriodLabels(review?.date || review?.receivedAt || review?.createdAt || review?.respondedAt);

  // Inicialização se inexistente
  if (!db.maidOpinionSynthesis[maidId]) {
    db.maidOpinionSynthesis[maidId] = {
      maidId: Number(maidId) || maidId,
      maidName: resolvedMaidName,
      lastUpdated: new Date().toISOString(),
      currentPeriod: {
        label: currentLabel,
        totalReviews: 0,
        sumScores: 0,
        avgScore: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        itemRecurrence: {
          boxBanheiro: { mentions: 0, positiveCount: 0, negativeCount: 0 },
          utensiliosCozinha: { mentions: 0, positiveCount: 0, negativeCount: 0 },
          enxovalCamaBanho: { mentions: 0, positiveCount: 0, negativeCount: 0 },
          pisoPoeira: { mentions: 0, positiveCount: 0, negativeCount: 0 }
        },
        positiveHighlights: [],
        attentionPoints: []
      },
      previousPeriod: {
        label: previousLabel,
        totalReviews: 0,
        avgScore: 0
      },
      evolution: {
        delta: 0,
        trend: "estabilidade",
        summaryText: "Primeiro período com avaliações registradas. Não há histórico anterior para comparação."
      }
    };
  }

  const synthesis = db.maidOpinionSynthesis[maidId];
  synthesis.maidId = synthesis.maidId || (Number(maidId) || maidId);
  if (!synthesis.maidName || synthesis.maidName.startsWith("Camareira #")) {
    synthesis.maidName = resolvedMaidName;
  }
  synthesis.lastUpdated = new Date().toISOString();

  // Garante integridade da estrutura interna
  synthesis.currentPeriod = synthesis.currentPeriod || {};
  synthesis.currentPeriod.label = synthesis.currentPeriod.label || currentLabel;
  synthesis.currentPeriod.distribution = synthesis.currentPeriod.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  synthesis.currentPeriod.itemRecurrence = synthesis.currentPeriod.itemRecurrence || {};
  for (const def of OPINION_ITEM_DEFINITIONS) {
    synthesis.currentPeriod.itemRecurrence[def.key] = synthesis.currentPeriod.itemRecurrence[def.key] || {
      mentions: 0,
      positiveCount: 0,
      negativeCount: 0
    };
  }
  synthesis.currentPeriod.positiveHighlights = synthesis.currentPeriod.positiveHighlights || [];
  synthesis.currentPeriod.attentionPoints = synthesis.currentPeriod.attentionPoints || [];

  synthesis.previousPeriod = synthesis.previousPeriod || {
    label: previousLabel,
    totalReviews: 0,
    avgScore: 0
  };

  // 1. Atualização incremental da nota média e distribuição
  const rawScore = Number(review?.score ?? review?.rating ?? 5);
  const validScore = Number.isFinite(rawScore) ? rawScore : 5;
  const scoreBucket = Math.min(5, Math.max(1, Math.round(validScore)));

  const prevTotal = Number(synthesis.currentPeriod.totalReviews) || 0;
  let prevSum;
  if (typeof synthesis.currentPeriod.sumScores === "number") {
    prevSum = synthesis.currentPeriod.sumScores;
  } else if (prevTotal > 0 && typeof synthesis.currentPeriod.avgScore === "number") {
    prevSum = Number((synthesis.currentPeriod.avgScore * prevTotal).toFixed(4));
  } else {
    prevSum = 0;
  }

  const newTotalReviews = prevTotal + 1;
  const newSumScores = Number((prevSum + validScore).toFixed(4));
  const newAvgScore = Number((newSumScores / newTotalReviews).toFixed(1));

  synthesis.currentPeriod.totalReviews = newTotalReviews;
  synthesis.currentPeriod.sumScores = newSumScores;
  synthesis.currentPeriod.avgScore = newAvgScore;
  synthesis.currentPeriod.distribution[scoreBucket] = (Number(synthesis.currentPeriod.distribution[scoreBucket]) || 0) + 1;

  // 2. Análise de recorrência de itens críticos e sentimento por oração
  const comment = String(review?.comment || review?.text || review?.feedback || "").trim();
  if (comment) {
    const clauses = comment
      .split(/(?:[.!?;]|\n+|\b(?:mas|por[eé]m|contudo|todavia|no\s+entanto|embora|apesar\s+de)\b)/i)
      .map(c => c.trim())
      .filter(Boolean);

    const NEGATIVE_REGEX = /\b(?:suj[oa]s?|sujeira[s]?|mancha[s]?|manchad[oa]s?|encardid[oa]s?|imund[oa]s?|amarel[oa]s?|engordurad[oa]s?|gordura|pegajos[oa]s?|grudent[oa]s?|viscos[oa]s?|limo|lodo|cabelo[s]?|poeira[s]?|p[oó]\b|lixo|falt\w*|sem\b|n[aã]o\s+tinha|acab\w*|esquec\w*|ruim|p[eé]ssim\w*|mal\s+lavad[oa]s?|mal\s+feit[oa]s?|odor|cheiro\s+ruim|mau\s+cheiro|mofo|bolor|fedendo)\b/i;
    const POSITIVE_REGEX = /\b(?:limp[oa]s?|cheiros[oa]s?|impec[aá]vel|impecaveis|brilhando|perfeit[oa]s?|[oó]tim[oa]s?|excelente[s]?|maravilhos[oa]s?|bom|boa[s]?|gostei|adorei|capricho|alinhad[oa]s?|branquinha[s]?|arrumad[oa]s?)\b/i;

    for (const def of OPINION_ITEM_DEFINITIONS) {
      if (def.regex.test(comment)) {
        synthesis.currentPeriod.itemRecurrence[def.key].mentions += 1;

        const matchingClauses = clauses.filter(c => def.regex.test(c));
        let itemPositive = false;
        let itemNegative = false;

        for (const cl of matchingClauses) {
          const hasNeg = NEGATIVE_REGEX.test(cl);
          const hasPos = POSITIVE_REGEX.test(cl) && !/\bn[aã]o\s+(?:estav|est[aá]|foi)\b/i.test(cl);

          if (hasNeg) {
            itemNegative = true;
          } else if (hasPos) {
            itemPositive = true;
          }
        }

        // Fallback contextual por nota geral se neutro
        if (!itemPositive && !itemNegative) {
          if (validScore >= 5) {
            itemPositive = true;
          } else if (validScore <= 2) {
            itemNegative = true;
          } else if (triageResult?.isCleaningRelated && validScore < 4) {
            itemNegative = true;
          } else {
            itemPositive = validScore >= 4;
            itemNegative = !itemPositive;
          }
        }

        if (itemNegative) {
          synthesis.currentPeriod.itemRecurrence[def.key].negativeCount += 1;
          if (!synthesis.currentPeriod.attentionPoints.includes(def.attentionPoint)) {
            synthesis.currentPeriod.attentionPoints.push(def.attentionPoint);
          }
        } else if (itemPositive) {
          synthesis.currentPeriod.itemRecurrence[def.key].positiveCount += 1;
          if (!synthesis.currentPeriod.positiveHighlights.includes(def.positiveHighlight)) {
            synthesis.currentPeriod.positiveHighlights.push(def.positiveHighlight);
          }
        }
      }
    }
  }

  // Elogio genérico para nota 5 sem menção de item específico
  if (validScore >= 5 && synthesis.currentPeriod.positiveHighlights.length === 0) {
    synthesis.currentPeriod.positiveHighlights.push("Limpeza geral impecável e capricho elogiados");
  }

  // 3. Cálculo de comparativo de evolução com o período anterior
  const prev = synthesis.previousPeriod;
  const hasPreviousReviews = prev && Number(prev.totalReviews) > 0 && typeof prev.avgScore === "number" && !isNaN(prev.avgScore);

  let delta = 0;
  let trend = "estabilidade";
  let summaryText = "";

  if (hasPreviousReviews) {
    const prevAvg = Number(prev.avgScore);
    delta = Number((newAvgScore - prevAvg).toFixed(1));
    if (Object.is(delta, -0)) delta = 0;

    if (delta > 0) {
      trend = "evolucao";
      summaryText = `A nota média subiu +${delta.toFixed(1)} em relação ao período anterior (${newAvgScore.toFixed(1)} vs ${prevAvg.toFixed(1)}). Parabéns pela evolução contínua!`;
    } else if (delta < 0) {
      trend = "regressao";
      const pts = synthesis.currentPeriod.attentionPoints;
      const attentionSummary = pts.length > 0 ? pts.slice(0, 2).join("; ") : "itens de higienização apontados";
      summaryText = `A nota média desceu ${delta.toFixed(1)} em relação ao período anterior (${newAvgScore.toFixed(1)} vs ${prevAvg.toFixed(1)}). Pontos que requerem atenção: ${attentionSummary}.`;
    } else {
      trend = "estabilidade";
      summaryText = `A nota média manteve estabilidade em ${newAvgScore.toFixed(1)} em relação ao período anterior (${prevAvg.toFixed(1)}). Padrão consistente mantido.`;
    }
  } else {
    delta = 0;
    trend = "estabilidade";
    summaryText = `Primeiro período com avaliações registradas (Média: ${newAvgScore.toFixed(1)}). Não há histórico anterior para comparação.`;
  }

  synthesis.evolution = {
    delta,
    trend,
    summaryText
  };

  return synthesis;
}

/**
 * Formata a Mensagem 1: Notificação individual da avaliação recebida.
 */
export function formatMaidIndividualReviewMessage({
  maidName,
  flatDisplay,
  formattedCleaningDate,
  score,
  scoreDisplay,
  commentText,
  authorName
}) {
  let encouragementMsg = "";
  if (score >= 5) {
    encouragementMsg = "🌟 *Parabéns pelo trabalho impecável e capricho!* Seu cuidado encanta nossos hóspedes e mantém o CorpFlats no mais alto padrão de qualidade! Continue brilhando! 👏✨";
  } else if (score === 4) {
    encouragementMsg = "👏 *Excelente trabalho!* Pequenos detalhes fazem a diferença para alcançarmos a nota 5. Muito obrigado pela sua dedicação diária! 🌟💪";
  } else {
    encouragementMsg = "💪 *Agradecemos pela sua dedicação diária!* Compartilhamos essas observações do hóspede para que você saiba exatamente o que foi notado e possamos aperfeiçoar juntos cada detalhe. Estamos juntos! ✨🤝";
  }

  const lines = [
    `🛎️ *Nova Avaliação de Limpeza Recebida!* 🧹`,
    ``,
    `Olá, *${maidName}*!`,
    `Um hóspede acabou de avaliar a higienização de um quarto preparado por você:`,
    ``,
    `🚪 *Imóvel:* *${flatDisplay}*`,
    `📅 *Data da Limpeza:* ${formattedCleaningDate}`,
    `⭐ *Nota Recebida:* *${scoreDisplay}*`,
    ``,
    `💬 *Comentário do Hóspede:*`,
    `"${commentText || "Hóspede avaliou sem deixar comentário por escrito."}"`
  ];

  if (authorName) {
    lines.push(`_— ${authorName}_`);
  }

  lines.push(``, encouragementMsg);
  return lines.join("\n");
}

/**
 * Formata a Mensagem 2: Síntese consolidada de opiniões e comparativo de evolução (Estilo Mercado Livre).
 * Suporta tanto chamada com (synthesis, maidName) quanto com objeto ({ maidName, synthesis, currentScore }).
 */
export function formatMaidOpinionSynthesisMessage(arg1, arg2) {
  let synthesis;
  let maidName;
  let currentScore;

  if (arg1 && typeof arg1 === "object") {
    if (arg1.currentPeriod || arg1.evolution || arg1.maidId) {
      synthesis = arg1;
      maidName = arg2 || synthesis.maidName || "Camareira";
    } else if (arg1.synthesis) {
      synthesis = arg1.synthesis;
      maidName = arg1.maidName || synthesis?.maidName || "Camareira";
      currentScore = arg1.currentScore;
    } else {
      synthesis = arg1;
      maidName = arg2 || synthesis.maidName || "Camareira";
    }
  } else {
    synthesis = {};
    maidName = arg2 || "Camareira";
  }

  const curr = synthesis?.currentPeriod || {};
  const prev = synthesis?.previousPeriod || {};
  const evol = synthesis?.evolution || {};
  const rec = curr.itemRecurrence || {};

  const avgScore = Number(curr.avgScore ?? currentScore ?? 5.0).toFixed(1);
  const totalReviews = curr.totalReviews || 1;
  const starsVisual = "⭐".repeat(Math.max(1, Math.min(5, Math.round(Number(avgScore)))));

  // Termômetro de recorrência de itens críticos
  const formatRecurrenceStatus = (itemData, positiveDefault) => {
    if (!itemData || !itemData.mentions || itemData.mentions === 0) {
      return `🟢 100% positivo (${positiveDefault})`;
    }
    const pos = itemData.positiveCount || 0;
    const neg = itemData.negativeCount || 0;
    if (neg === 0) {
      return `🟢 Excelente (${pos} ${pos === 1 ? "elogio" : "elogios"}, 0 queixas)`;
    }
    if (pos === 0) {
      return `🔴 Ponto de atenção (${neg} ${neg === 1 ? "apontamento" : "apontamentos"})`;
    }
    return `🟡 Misto (${pos} pos / ${neg} ${neg === 1 ? "alerta" : "alertas"})`;
  };

  const statusBox = formatRecurrenceStatus(rec.boxBanheiro, "Box e azulejos sem limo");
  const statusUtensilios = formatRecurrenceStatus(rec.utensiliosCozinha, "Pratos, copos e talheres limpos");
  const statusEnxoval = formatRecurrenceStatus(rec.enxovalCamaBanho, "Lençóis e toalhas sem manchas");
  const statusPiso = formatRecurrenceStatus(rec.pisoPoeira, "Chão e cantos sem poeira");

  // Destaques Positivos
  const praises = (Array.isArray(curr.positiveHighlights) && curr.positiveHighlights.length > 0)
    ? curr.positiveHighlights
    : ["Quarto cheiroso e higienizado com capricho", "Cama montada com capricho e alinhamento"];

  // Comparativo de Evolução
  let comparativeBlock = "";
  const prevAvg = prev.avgScore != null ? Number(prev.avgScore).toFixed(1) : null;
  const delta = evol.delta != null ? Number(evol.delta) : (prevAvg != null ? Number((avgScore - prevAvg).toFixed(1)) : 0.0);
  const trend = evol.trend || (delta > 0 ? "evolucao" : delta < 0 ? "regressao" : "estabilidade");

  if (prevAvg != null && prev.totalReviews > 0) {
    if (trend === "evolucao" || delta > 0) {
      comparativeBlock = `📈 *Comparativo de Evolução:* Sua média *subiu* de *${prevAvg}* (${prev.label || "período anterior"}) para *${avgScore}* (+${delta.toFixed(1)})! Parabéns pela evolução contínua! 🚀`;
    } else if (trend === "regressao" || delta < 0) {
      comparativeBlock = `📉 *Comparativo de Evolução:* Sua média *desceu* de *${prevAvg}* (${prev.label || "período anterior"}) para *${avgScore}* (${delta.toFixed(1)}). Pontos de atenção destacados abaixo para retomarmos a nota máxima! 💪`;
    } else {
      comparativeBlock = `➡️ *Comparativo de Evolução:* Sua média se manteve *estável* em *${avgScore}* (anterior: ${prevAvg} em ${prev.label || "período anterior"}). Excelente constância e padrão! 🎯`;
    }
  } else {
    comparativeBlock = `🆕 *Comparativo de Evolução:* Primeiro ciclo de avaliações em andamento com excelente média consolidada de *${avgScore}*! 🎯`;
  }

  // Pontos de atenção
  const attentionItems = (Array.isArray(curr.attentionPoints) && curr.attentionPoints.length > 0)
    ? curr.attentionPoints
    : (Number(avgScore) < 4.5 ? ["Atenção à revisão final de chão e box do banheiro"] : ["Nenhum ponto crítico — manter o excelente padrão atual!"]);

  return [
    `📊 *Síntese de Opiniões & Resumo Consolidado (Estilo Mercado Livre)* 🏆`,
    ``,
    `Olá, *${maidName}*! Segue a síntese consolidada das avaliações dos hóspedes sobre as suas limpezas em *${curr.label || "Novembro/2026"}*:`,
    ``,
    `⭐ *Nota Média Geral:* *${avgScore} de 5.0* (${starsVisual}) • ${totalReviews} ${totalReviews === 1 ? "avaliação acumulada" : "avaliações acumuladas"}`,
    ``,
    `✨ *Destaques Positivos Mais Citados:*`,
    praises.map(p => `• ${p}`).join("\n"),
    ``,
    `🌡️ *Termômetro de Recorrência (Itens Críticos):*`,
    `🚿 *Box do Banheiro:* ${statusBox}`,
    `🍽️ *Louças e Utensílios:* ${statusUtensilios}`,
    `🛏️ *Enxoval (Cama e Banho):* ${statusEnxoval}`,
    `🧹 *Piso e Poeira:* ${statusPiso}`,
    ``,
    comparativeBlock,
    ``,
    `⚠️ *Pontos que Requerem Atenção:*`,
    attentionItems.map(a => `• ${a}`).join("\n"),
    ``,
    `_Este resumo consolidado é atualizado em tempo real a cada nova avaliação recebida, auxiliando no seu desenvolvimento profissional e reconhecimento na governança CorpFlats._ ✨`
  ].join("\n");
}

/**
 * Disparo em Tempo Real de Alertas Duplos de Avaliação para Camareiras (Feature F7).
 *
 * @param {object} db Instância do banco de dados em memória
 * @param {object} params Parâmetros do disparo
 * @param {object} params.review Objeto da avaliação (com rating/score, comment, flatMentioned, etc.)
 * @param {object} params.maidUser Usuário da camareira responsável ({ id, name, whatsapp, phone })
 * @param {string} [params.cleaningDate] Data em que a limpeza foi realizada
 * @param {object} [params.triageResult] Resultado da triagem por IA
 * @param {Function} [params.sendZapiFn] Função customizada de envio Z-API (para testes e injeção)
 * @returns {Promise<{ success: boolean, messagesSent: number, message1Result?: any, message2Result?: any, error?: string }>}
 */
export async function dispatchRealtimeMaidReviewAlerts(db, {
  review,
  maidUser,
  cleaningDate = null,
  triageResult = null,
  sendZapiFn = null
} = {}) {
  if (!db || !review || !maidUser) {
    return { success: false, messagesSent: 0, error: "Parâmetros obrigatórios ausentes (db, review, maidUser)" };
  }

  const rawPhone = maidUser.whatsapp || maidUser.phone || "";
  const cleanPh = cleanWhatsAppPhone(rawPhone) || rawPhone;
  if (!cleanPh) {
    return { success: false, messagesSent: 0, error: `Camareira ID ${maidUser.id} (${maidUser.name}) sem telefone/WhatsApp válido` };
  }

  const maidName = maidUser.name || maidUser.username || "Colaboradora";
  const score = Number(review.score ?? review.rating ?? 5);
  const commentText = String(review.comment || review.text || review.feedback || "").trim();
  const authorName = review.author || review.guestName || "Hóspede";

  const rawFlat = review.flatMentioned || review.flatNumber || review.roomNumber || review.flat || "Quarto";
  const flatDisplay = String(rawFlat).trim().toLowerCase().startsWith("flat")
    ? String(rawFlat).trim()
    : `Flat ${rawFlat}`;

  const cDate = cleaningDate || review.cleaningDate || review.date || getBrasiliaNow().date;
  const formattedCleaningDate = formatDateBr(cDate);

  const starCount = Math.max(1, Math.min(5, Math.round(score)));
  const starsStr = "⭐".repeat(starCount);
  const scoreDisplay = `${score} de 5 (${starsStr})`;

  // 1. Renderiza Mensagem 1 (Avaliação Recebida)
  const message1 = formatMaidIndividualReviewMessage({
    maidName,
    flatDisplay,
    formattedCleaningDate,
    score,
    scoreDisplay,
    commentText,
    authorName
  });

  // 2. Resolve Síntese de Opiniões para Mensagem 2
  const maidId = maidUser.id;
  let synthesis = db.maidOpinionSynthesis?.[maidId];
  if (!synthesis && typeof updateMaidOpinionSynthesis === "function") {
    synthesis = updateMaidOpinionSynthesis(db, {
      maidId,
      review,
      triageResult
    });
  }

  if (!synthesis) {
    synthesis = {
      maidId,
      maidName,
      lastUpdated: new Date().toISOString(),
      currentPeriod: {
        label: "Novembro/2026",
        totalReviews: 1,
        avgScore: score,
        sumScores: score,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, [score]: 1 },
        itemRecurrence: {
          boxBanheiro: { mentions: 0, positiveCount: 0, negativeCount: 0 },
          utensiliosCozinha: { mentions: 0, positiveCount: 0, negativeCount: 0 },
          enxovalCamaBanho: { mentions: 0, positiveCount: 0, negativeCount: 0 },
          pisoPoeira: { mentions: 0, positiveCount: 0, negativeCount: 0 }
        },
        positiveHighlights: score >= 4 ? ["Quarto cheiroso e higienizado com capricho"] : [],
        attentionPoints: score < 4 ? ["Atenção aos pontos destacados pelo hóspede"] : []
      },
      previousPeriod: {
        label: "Outubro/2026",
        totalReviews: 0,
        avgScore: null
      },
      evolution: {
        delta: 0.0,
        trend: "estabilidade",
        summaryText: `Avaliação com nota ${score.toFixed(1)}`
      }
    };
  }

  // 3. Renderiza Mensagem 2 (Síntese Consolidada & Comparativo de Evolução)
  const message2 = formatMaidOpinionSynthesisMessage({
    maidName,
    synthesis,
    currentScore: score
  });

  // 4. Executa o disparo sequencial via Z-API
  const sender = typeof sendZapiFn === "function" ? sendZapiFn : sendZapiMessage;

  const res1 = await sender(db.zapiConfig || {}, {
    phone: cleanPh,
    message: message1,
    channelId: "maids",
    recipientRole: "camareira",
    triggerEvent: "maid_review_received",
    db
  });

  // Intervalo operacional suave apenas em produção (zero delay em testes)
  if (!sendZapiFn) {
    await new Promise(r => setTimeout(r, 800));
  }

  const res2 = await sender(db.zapiConfig || {}, {
    phone: cleanPh,
    message: message2,
    channelId: "maids",
    recipientRole: "camareira",
    triggerEvent: "maid_opinion_synthesis_update",
    db
  });

  // 5. Registra o histórico das duas mensagens em db.maidAutomationConfig.history
  if (!db.maidAutomationConfig) {
    db.maidAutomationConfig = { enabled: true, triggers: [], history: [] };
  }
  if (!Array.isArray(db.maidAutomationConfig.history)) {
    db.maidAutomationConfig.history = [];
  }

  const nowIso = new Date().toISOString();
  db.maidAutomationConfig.history.unshift({
    id: `rev_alert_1_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId: maidUser.id,
    userName: maidName,
    phone: cleanPh,
    triggerId: "maid_review_received",
    triggerName: "Alerta em Tempo Real: Avaliação Recebida",
    message: message1,
    status: res1?.success ? "sent" : "failed",
    method: res1?.method || (res1?.simulated ? "simulado" : "zapi"),
    error: res1?.error || null,
    sentAt: nowIso
  });

  db.maidAutomationConfig.history.unshift({
    id: `rev_alert_2_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId: maidUser.id,
    userName: maidName,
    phone: cleanPh,
    triggerId: "maid_opinion_synthesis_update",
    triggerName: "Síntese Consolidada de Opiniões (Mercado Livre)",
    message: message2,
    status: res2?.success ? "sent" : "failed",
    method: res2?.method || (res2?.simulated ? "simulado" : "zapi"),
    error: res2?.error || null,
    sentAt: nowIso
  });

  if (db.maidAutomationConfig.history.length > 100) {
    db.maidAutomationConfig.history = db.maidAutomationConfig.history.slice(0, 100);
  }

  return {
    success: true,
    messagesSent: 2,
    message1Result: res1,
    message2Result: res2
  };
}

// ── Feature F2: Hook Listener de Avaliações para Camareiras ───────────────────

/**
 * Sanitiza o comentário de uma avaliação, removendo placeholders de mídia do WhatsApp
 * (como "[image]", "[audio]", "[video]", "[sticker]", "[document]") para que sejam tratados
 * como avaliação sem comentário escrito.
 */
export function sanitizeReviewComment(rawComment) {
  if (typeof rawComment !== "string") return "";
  const trimmed = rawComment.trim();
  if (!trimmed) return "";
  if (/^\[(?:image|audio|video|sticker|document|media|foto|imagem|[aá]udio|v[ií]deo|figurinha)\]$/i.test(trimmed)) {
    return "";
  }
  return trimmed;
}

/**
 * Para avaliações mistas (que contêm crítica de limpeza + crítica de infraestrutura/ar-condicionado/Wi-Fi),
 * extrai apenas os trechos pertinentes à camareira/governança para exibição limpa na mensagem.
 */
export function extractCleaningCommentForMaid(comment, triageResult = null) {
  const clean = sanitizeReviewComment(comment);
  if (!clean) return "";
  if (!triageResult || triageResult.category !== "mixed") {
    return clean;
  }

  // Divide em orações preservando sentido
  const clauses = clean
    .split(/(?:[.!?;]+|\n+|,\s*(?=(?:o\s+box|o\s+ar|a\s+internet|o\s+wi-?fi|o\s+check-?in|a\s+portaria|a\s+recep[cç][aã]o|por[eé]m|mas\b|contudo))|\s+\b(?:e\s+(?:o\s+ar(?:-|\s+)condicionado|a\s+internet|o\s+wi-?fi|a\s+tv|o\s+chuveiro|o\s+check-?in|a\s+portaria|o\s+barulho)|mas\b|por[eé]m\b|contudo\b|todavia\b)\s*)/i)
    .map(c => c.trim().replace(/^[,;:\-–]+\s*|\s*[,;:\-–]+$/g, "").trim())
    .filter(Boolean);

  if (clauses.length <= 1) {
    // Tenta corte direto antes de conjunção + item de infraestrutura conhecido
    const stripped = clean.replace(
      /\s*(?:,\s*)?\b(?:e|mas|por[eé]m)\s+(?:o\s+ar(?:-|\s+)?condicionado|a\s+internet|o\s+wi-?fi|a\s+tv|o\s+barulho|a\s+portaria|o\s+check-?in)\b[\s\S]*$/i,
      ""
    ).trim();
    return stripped || clean;
  }

  const keptClauses = clauses.filter(cl => {
    const hasCleaningTarget = CLEANING_CATEGORY_RULES.some(r => r.targetRegex.test(cl)) || EXPLICIT_CLEANING_DEFECT_REGEX.test(cl);
    const hasNonCleaning = NON_CLEANING_CATEGORY_RULES.some(r => r.regex.test(cl));
    if (hasNonCleaning && !hasCleaningTarget) return false;
    // Remove elogio genérico introdutório ("Adorei a estadia") se houver cláusulas específicas de limpeza
    if (/^(?:adorei|gostei\s+muito|tudo\s+[oó]timo|estadia\s+boa)\b/i.test(cl) && !hasCleaningTarget) return false;
    return true;
  });

  if (keptClauses.length === 0) return clean;
  const joined = keptClauses.join(", ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/**
 * Resolve de forma consistente a reserva associada a um item de avaliação (npsResponses ou reviews).
 * Protege contra registros legados em que npsResponses reutilizou o reservationId de uma estadia anterior
 * do mesmo hóspede em outro flat ou em outro mês.
 */
export function resolveConsistentReservationForReview(db, item, fallbackDate = null) {
  if (!db || !item) return null;

  const itemFlat = String(item.flatNumber || item.flatMentioned || item.roomNumber || "").trim();
  const resCodeOrId = item.reservationId || item.reservationCode || item.code;
  const evalDate = String(item.respondedAt || item.date || item.sentAt || item.createdAt || fallbackDate || "").substring(0, 10);
  const sentDate = String(item.sentAt || evalDate || "").substring(0, 10);
  const guestPhone = cleanWhatsAppPhone(item.guestPhone || item.phone || "");
  const guestName = String(item.guestName || item.author || "").trim().toLowerCase();

  const allReservations = Array.isArray(db.reservations) ? db.reservations : [];

  let directRes = null;
  if (resCodeOrId && allReservations.length > 0) {
    directRes = allReservations.find(r =>
      String(r.id) === String(resCodeOrId) || String(r.code) === String(resCodeOrId)
    ) || null;
  }

  const isDateClose = (d1, d2, maxDaysAfter = 14) => {
    if (!d1 || !d2) return true;
    const ms1 = new Date(`${d1.substring(0, 10)}T12:00:00Z`).getTime();
    const ms2 = new Date(`${d2.substring(0, 10)}T12:00:00Z`).getTime();
    if (isNaN(ms1) || isNaN(ms2)) return true;
    const diffDays = (ms1 - ms2) / 86400000;
    return diffDays >= -2 && diffDays <= maxDaysAfter;
  };

  if (directRes) {
    const resFlat = String(directRes.flatNumber || directRes.roomNumber || "").trim();
    const resOut = String(directRes.checkoutDate || directRes.checkOut || "").substring(0, 10);
    const flatMatches = !itemFlat || !resFlat || resFlat === itemFlat;
    const dateMatches = isDateClose(evalDate, resOut, 14);
    if (flatMatches && dateMatches) {
      return directRes;
    }
  }

  // Se directRes não existe, ou tem flat divergente / data antiga, busca em db.reservations pelo flat correto
  if (allReservations.length > 0 && itemFlat) {
    const sameFlatCandidates = allReservations.filter(r => {
      const rFlat = String(r.flatNumber || r.roomNumber || "").trim();
      if (rFlat !== itemFlat) return false;
      const cIn = String(r.checkinDate || r.checkIn || "").substring(0, 10);
      if (evalDate && cIn && cIn > evalDate) return false;
      return true;
    });

    if (sameFlatCandidates.length > 0) {
      sameFlatCandidates.sort((a, b) => {
        const aPhone = cleanWhatsAppPhone(a.guestPhone || a.phone || "");
        const bPhone = cleanWhatsAppPhone(b.guestPhone || b.phone || "");
        const aPhoneMatch = Boolean(guestPhone && aPhone && (aPhone.endsWith(guestPhone.slice(-8)) || guestPhone.endsWith(aPhone.slice(-8))));
        const bPhoneMatch = Boolean(guestPhone && bPhone && (bPhone.endsWith(guestPhone.slice(-8)) || guestPhone.endsWith(bPhone.slice(-8))));
        if (aPhoneMatch !== bPhoneMatch) return aPhoneMatch ? -1 : 1;

        const aName = String(a.guestName || "").trim().toLowerCase();
        const bName = String(b.guestName || "").trim().toLowerCase();
        const aNameMatch = Boolean(guestName && aName && (aName.includes(guestName) || guestName.includes(aName)));
        const bNameMatch = Boolean(guestName && bName && (bName.includes(guestName) || guestName.includes(bName)));
        if (aNameMatch !== bNameMatch) return aNameMatch ? -1 : 1;

        const aOut = String(a.checkoutDate || a.checkOut || a.checkinDate || "").substring(0, 10);
        const bOut = String(b.checkoutDate || b.checkOut || b.checkinDate || "").substring(0, 10);
        return bOut.localeCompare(aOut);
      });

      const best = sameFlatCandidates[0];
      const bestOut = String(best.checkoutDate || best.checkOut || best.checkinDate || "").substring(0, 10);
      if (isDateClose(evalDate, bestOut, 20)) {
        return best;
      }
    }
  }

  // Se directRes tinha o mesmo flat (apenas data distante) e não achou outra reserva mais recente, mantém directRes
  if (directRes) {
    const resFlat = String(directRes.flatNumber || directRes.roomNumber || "").trim();
    if (!itemFlat || resFlat === itemFlat) {
      return directRes;
    }
  }

  if (itemFlat) {
    return {
      id: directRes ? null : (item.reservationId || null),
      flatNumber: itemFlat,
      checkinDate: sentDate || evalDate,
      checkoutDate: evalDate,
      date: evalDate,
      guestName: item.guestName || item.author || null
    };
  }

  return directRes;
}

/**
 * Hook listener unificado para novas avaliações e respostas NPS.
 * Acionado de forma não-invasiva pelos pontos de ingestão (Z-API e demo-server).
 *
 * @param {object} db Estado global em memória do sistema
 * @param {object} payload Dados da avaliação recebida
 * @param {string} payload.hookType Tipo do evento disparador
 * @param {object} [payload.npsItem] Objeto existente em db.npsResponses
 * @param {object} [payload.review] Objeto existente em db.reviews
 * @param {number} payload.score Nota de 1 a 5
 * @param {string} [payload.comment] Comentário/explicação do hóspede
 * @param {object} [payload.reservation] Objeto da reserva associada
 * @param {string|number} [payload.flatNumber] Número do flat
 * @param {string} [payload.guestPhone] Telefone do hóspede
 * @param {string} [payload.guestName] Nome do hóspede
 * @param {string} [payload.respondedAt] Data/hora da resposta
 * @param {object} options Opções de execução
 * @param {Function} [options.saveDatabase] Função de persistência
 * @param {Function} [options.sendZapiFn] Função de envio WhatsApp Z-API
 * @returns {Promise<object>} Resultado do processamento do hook
 */
export async function handleMaidReviewHook(db, payload, { saveDatabase, sendZapiFn = sendZapiMessage } = {}) {
  if (!db || !payload) return { handled: false, reason: "invalid_payload" };

  const {
    hookType,
    npsItem = null,
    review = null,
    score,
    comment = null,
    reservation = null,
    flatNumber = null,
    guestPhone = null,
    guestName = null,
    respondedAt = null
  } = payload;

  const numScore = Number(score);
  const cleanComment = sanitizeReviewComment(comment);

  // 1. Resolução da Reserva correspondente
  let matchedReservation = reservation || resolveConsistentReservationForReview(db, {
    ...(npsItem || {}),
    ...(review || {}),
    reservationId: payload?.reservationId || npsItem?.reservationId,
    reservationCode: npsItem?.reservationCode,
    flatNumber: flatNumber || npsItem?.flatNumber || review?.flatMentioned,
    guestPhone: guestPhone || npsItem?.guestPhone,
    guestName: guestName || npsItem?.guestName || review?.author,
    respondedAt: respondedAt || npsItem?.respondedAt || review?.date
  });

  // 2. Atribuição determinística da última limpeza (Feature F1)
  const targetFlat = flatNumber || matchedReservation?.flatNumber || npsItem?.flatNumber || review?.flatMentioned;
  const attribution = resolveMaidCleaningForReservation(db, matchedReservation || { flatNumber: targetFlat, date: respondedAt, flatMentioned: targetFlat }, {
    flatNumber: targetFlat,
    evaluationDate: respondedAt
  });

  const maidUser = attribution?.maidUser || null;
  const maidId = maidUser?.id || null;
  const cleaningDate = attribution?.cleaningDate || null;
  const cleaningRequest = attribution?.cleaningRequest || null;

  // 3. Regras de Elegibilidade e Triagem por IA (Features F3 e F4)
  let forwardToMaid = false;
  let triageResult = null;
  let displayComment = cleanComment;

  if (numScore === 5) {
    forwardToMaid = true;
    triageResult = {
      isCleaningRelated: true,
      category: "maid_cleaning",
      primaryResponsibility: "camareira",
      forwardToMaid: true,
      cleaningAspects: cleanComment ? ["avaliacao_excelente_5_estrelas"] : [],
      nonCleaningAspects: [],
      explanation: "Nota 5 é automaticamente elegível para o resumo da camareira.",
      triageMethod: "score_5_direct"
    };
  } else if (numScore <= 4) {
    if (!cleanComment) {
      // Sub-5 sem comentário: elegível para o resumo diário (nota sem comentário, igual à nota 5 sem comentário)
      forwardToMaid = true;
      triageResult = {
        isCleaningRelated: false,
        category: "sub5_sem_comentario",
        primaryResponsibility: "camareira",
        forwardToMaid: true,
        cleaningAspects: [],
        nonCleaningAspects: [],
        explanation: "Avaliação < 5 sem comentário é incluída no resumo diário apenas com a nota.",
        triageMethod: "sub5_score_only_no_comment"
      };
    } else {
      // Triagem por IA (Two-Tier)
      triageResult = await triageSub5Review({
        score: numScore,
        comment: cleanComment,
        flatNumber: targetFlat,
        db
      });
      forwardToMaid = Boolean(triageResult?.forwardToMaid);
      if (forwardToMaid) {
        displayComment = extractCleaningCommentForMaid(cleanComment, triageResult);
      }
    }
  }

  // 4. Criação do registro canônico de avaliação para governança
  const reviewRecord = {
    id: npsItem?.id || review?.id || `rev_hook_${Date.now()}`,
    source: npsItem ? "nps_whatsapp" : "review",
    score: numScore,
    comment: displayComment || null,
    guestName: guestName || npsItem?.guestName || review?.author || "Hóspede",
    guestPhone: guestPhone || npsItem?.guestPhone || null,
    flatNumber: attribution?.cleaningRequest?.flatNumber || targetFlat || null,
    reservationId: matchedReservation?.id || null,
    reservationCode: matchedReservation?.code || null,
    cleaningDate: cleaningDate,
    cleaningRequestId: cleaningRequest?.id || null,
    maidId: maidId,
    maidName: maidUser?.name || null,
    forwardToMaid: forwardToMaid,
    triageResult: triageResult,
    receivedAt: respondedAt || new Date().toISOString(),
    dispatchedToDailySummary: false,
    dispatchedRealtimeAt: null
  };

  // 5. Rastreabilidade no npsItem
  if (npsItem) {
    npsItem.maidAttribution = {
      maidId,
      maidName: maidUser?.name || null,
      cleaningDate,
      cleaningRequestId: cleaningRequest?.id || null,
      forwardToMaid,
      triageCategory: triageResult?.category || null,
      triageMethod: triageResult?.triageMethod || null
    };
  }

  // 6. Atualização de Síntese de Opiniões & Disparo em Tempo Real (R5 / F5 / F6 / F7)
  let realtimeAlertDispatched = false;
  if (forwardToMaid && maidId && displayComment && triageResult?.isCleaningRelated) {
    // Evita duplicidade se já despachou em tempo real para este review
    if (!npsItem?.realtimeMaidAlertDispatched) {
      if (typeof updateMaidOpinionSynthesis === "function") {
        updateMaidOpinionSynthesis(db, {
          maidId,
          review: reviewRecord,
          triageResult
        });
      }

      if (typeof dispatchRealtimeMaidReviewAlerts === "function" && maidUser?.whatsapp) {
        const sendRes = await dispatchRealtimeMaidReviewAlerts(db, {
          review: reviewRecord,
          maidUser,
          cleaningDate,
          triageResult,
          sendZapiFn
        }).catch(err => {
          console.warn("[Realtime Dual Message Warning]:", err?.message);
          return { success: false, error: err?.message };
        });

        if (sendRes?.success) {
          realtimeAlertDispatched = true;
          if (npsItem) npsItem.realtimeMaidAlertDispatched = true;
          reviewRecord.dispatchedRealtimeAt = new Date().toISOString();
        }
      }
    }
  }

  if (typeof saveDatabase === "function") saveDatabase();

  return {
    handled: true,
    hookType,
    reservationCode: matchedReservation?.code || null,
    maidId,
    maidName: maidUser?.name || null,
    forwardToMaid,
    triageCategory: triageResult?.category || null,
    triageMethod: triageResult?.triageMethod || null,
    realtimeAlertDispatched
  };
}

// Registro global do hook para acesso sem dependência circular
globalThis.__CORPFLATS_MAID_REVIEW_HOOK__ = handleMaidReviewHook;

// ────────────────────────────────────────────────────────────────────────────
// MILESTONE 3: Resumo Diário, Formatação e Despacho Retroativo (F8, F9, F10)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Formata a mensagem consolidada diária ou retroativa de avaliações para uma camareira (F9 / R1).
 *
 * @param {object} params
 * @param {string} params.maidName Nome da camareira
 * @param {string} params.targetDate Data de referência (YYYY-MM-DD)
 * @param {Array<object>} params.reviews Lista de avaliações elegíveis
 * @param {boolean} [params.isRetroactive=false] Se é envio retroativo
 * @returns {string} Mensagem formatada no estilo WhatsApp
 */
export function formatDailyReviewsSummaryMessage({
  maidName,
  targetDate,
  reviews = [],
  isRetroactive = false
}) {
  const formattedTargetDate = formatDateBr(targetDate);
  const sortedReviews = [...reviews].sort((a, b) => {
    const dA = String(a.cleaningDate || "");
    const dB = String(b.cleaningDate || "");
    if (dA !== dB) return dB.localeCompare(dA);
    return String(a.flatNumber || "").localeCompare(String(b.flatNumber || ""), undefined, { numeric: true });
  });

  const total = sortedReviews.length;
  const sumScores = sortedReviews.reduce((acc, r) => acc + (Number(r.score) || 0), 0);
  const avgScore = total > 0 ? (sumScores / total).toFixed(1) : "0.0";

  const header = isRetroactive
    ? `⭐ *Resumo de Avaliações de Novembro/2026 • CorpFlats* ⭐\n\nOlá, *${maidName}*!\nReunimos aqui o histórico das avaliações dos hóspedes sobre os quartos higienizados por você em Novembro:`
    : `⭐ *Resumo Diário de Avaliações • CorpFlats* ⭐\n\nOlá, *${maidName}*!\nAqui está o resumo das avaliações recebidas hoje (${formattedTargetDate}) referente aos quartos preparados por você:`;

  const itemsText = sortedReviews.map(r => {
    const rawFlat = r.flatNumber || r.roomNumber || r.flat || "Quarto";
    const flatDisplay = String(rawFlat).trim().toLowerCase().startsWith("flat")
      ? String(rawFlat).trim()
      : `Flat ${rawFlat}`;
    const cleanDateBr = formatDateBr(r.cleaningDate || targetDate);
    const scoreVal = Number(r.score) || 5;
    const stars = "⭐".repeat(Math.max(1, Math.min(5, Math.round(scoreVal))));
    const cleanComment = sanitizeReviewComment(r.comment);
    const commentPart = cleanComment ? `\n   💬 _"${cleanComment}"_` : "";

    return `• *${flatDisplay}*\n   📅 Limpeza: ${cleanDateBr}\n   ⭐ Nota: *${scoreVal}* ${stars}${commentPart}`;
  }).join("\n\n");

  const mediaLabel = isRetroactive ? "Média do mês" : "Média do dia";
  const footer = `\n\n📊 *${mediaLabel}:* *${avgScore}* ⭐ (${total} ${total === 1 ? "avaliação" : "avaliações"})\n\nMuito obrigado pelo seu cuidado e dedicação aos nossos hóspedes! ✨`;

  return `${header}\n\n${itemsText}${footer}`;
}

/**
 * Consolida e despacha o resumo diário de avaliações em horário fixo para camareiras elegíveis (F8 / R1).
 *
 * @param {object} db Instância do banco de dados em memória
 * @param {object} [options]
 * @param {string} [options.targetDate] Data de referência YYYY-MM-DD (padrão: hoje em Brasília)
 * @param {boolean} [options.force=false] Forçar envio ignorando verificação de horário/idempotência
 * @param {Function} [options.sendZapiFn] Função de envio customizada (mock de testes)
 * @returns {Promise<{ maidsNotified: number, totalReviewsSent: number }>}
 */
export async function dispatchDailyReviewsSummary(db, {
  targetDate = null,
  force = false,
  sendZapiFn = null
} = {}) {
  if (!db) {
    return { maidsNotified: 0, totalReviewsSent: 0, error: "db não fornecido" };
  }

  const effectiveDate = targetDate ? String(targetDate).substring(0, 10) : getBrasiliaNow().date;

  // 1. Coleta candidatas correspondentes à data alvo (com deduplicação entre npsResponses e reviews)
  const candidateItems = [];
  const seenIds = new Set();
  const allNpsIds = new Set();

  const allNps = Array.isArray(db.npsResponses) ? db.npsResponses : [];
  for (const item of allNps) {
    if (!item) continue;
    if (item.id) allNpsIds.add(String(item.id));
    if (item.score == null && item.rating == null) continue;
    if (item.id && seenIds.has(String(item.id))) continue;
    if (item.id) seenIds.add(String(item.id));
    const itemDate = String(item.respondedAt || item.date || item.createdAt || "").substring(0, 10);
    if (itemDate === effectiveDate) {
      candidateItems.push({ ...item, _sourceCollection: "npsResponses", _originalRef: item });
    }
  }

  const allReviews = Array.isArray(db.reviews) ? db.reviews : [];
  for (const item of allReviews) {
    if (!item) continue;
    if (item.score == null && item.rating == null) continue;
    // Ignora espelhos sincronizados de db.npsResponses (fromNpsId) para evitar duplicidade
    if (item.fromNpsId && allNpsIds.has(String(item.fromNpsId))) continue;
    const revKey = `rev_${item.id}`;
    if (item.id && seenIds.has(revKey)) continue;
    if (item.id) seenIds.add(revKey);
    const itemDate = String(item.date || item.respondedAt || item.createdAt || "").substring(0, 10);
    if (itemDate === effectiveDate) {
      candidateItems.push({ ...item, _sourceCollection: "reviews", _originalRef: item });
    }
  }

  if (candidateItems.length === 0) {
    return { maidsNotified: 0, totalReviewsSent: 0 };
  }

  const groupedByMaid = {};

  for (const item of candidateItems) {
    // Trava de idempotência (C2): ignora se já despachada e não for force
    if (!force && item.dispatchedToMaidAt) {
      continue;
    }

    // Resolução consistente da Reserva correspondente
    const reservation = resolveConsistentReservationForReview(db, item, effectiveDate);
    const targetFlat = String(reservation?.flatNumber || item.flatNumber || item.flatMentioned || "").trim();

    // Atribuição da camareira da última limpeza (F1)
    const attribution = resolveMaidCleaningForReservation(db, reservation, {
      flatNumber: targetFlat,
      evaluationDate: item.respondedAt || item.date || effectiveDate
    });

    const maidUser = attribution?.maidUser;
    if (!maidUser || !maidUser.id) {
      continue;
    }

    // Triagem de elegibilidade por IA (F3 / F4)
    const score = Number(item.score ?? item.rating ?? 5);
    const rawComment = sanitizeReviewComment(item.comment || item.text || item.feedback || "");
    let displayComment = rawComment;

    let eligible = true;
    if (score < 5 && rawComment) {
      const triage = await triageSub5Review({
        score,
        comment: rawComment,
        flatNumber: targetFlat,
        db
      });
      eligible = Boolean(triage?.forwardToMaid);
      if (eligible) {
        displayComment = extractCleaningCommentForMaid(rawComment, triage);
      }
    }

    if (!eligible) {
      continue;
    }

    const maidId = maidUser.id;
    if (!groupedByMaid[maidId]) {
      groupedByMaid[maidId] = {
        maidUser,
        reviews: [],
        seenCleaningKeys: new Map()
      };
    }

    const finalFlat = String(attribution.cleaningRequest?.flatNumber || targetFlat || "Quarto").trim();
    const finalCleaningDate = attribution.cleaningDate || effectiveDate;
    const dedupeKey = attribution.cleaningRequest?.id
      ? `clean_${attribution.cleaningRequest.id}`
      : `flat_${finalFlat}_${finalCleaningDate}`;

    const existingIdx = groupedByMaid[maidId].seenCleaningKeys.get(dedupeKey);
    const entryObj = {
      id: item.id,
      flatNumber: finalFlat,
      cleaningDate: finalCleaningDate,
      score,
      comment: displayComment,
      rawItem: item._originalRef || item
    };

    if (existingIdx !== undefined) {
      // Se já existe avaliação para a mesma limpeza, mantém a que possui comentário descritivo
      const prevEntry = groupedByMaid[maidId].reviews[existingIdx];
      if (!prevEntry.comment && entryObj.comment) {
        groupedByMaid[maidId].reviews[existingIdx] = entryObj;
      }
      continue;
    }

    groupedByMaid[maidId].seenCleaningKeys.set(dedupeKey, groupedByMaid[maidId].reviews.length);
    groupedByMaid[maidId].reviews.push(entryObj);
  }

  const sender = typeof sendZapiFn === "function" ? sendZapiFn : sendZapiMessage;
  let maidsNotified = 0;
  let totalReviewsSent = 0;

  for (const maidId of Object.keys(groupedByMaid)) {
    const { maidUser, reviews } = groupedByMaid[maidId];
    if (!reviews.length) continue;

    const rawPhone = maidUser.whatsapp || maidUser.phone || "";
    const cleanPh = cleanWhatsAppPhone(rawPhone) || rawPhone;
    if (!cleanPh) continue;

    const message = formatDailyReviewsSummaryMessage({
      maidName: maidUser.name || maidUser.username || "Colaboradora",
      targetDate: effectiveDate,
      reviews,
      isRetroactive: false
    });

    const sendRes = await sender(db.zapiConfig || {}, {
      phone: cleanPh,
      message,
      channelId: "maids",
      recipientRole: "camareira",
      triggerEvent: "trigger_daily_review_summary",
      db
    });

    const nowIso = new Date().toISOString();
    for (const r of reviews) {
      if (r.rawItem) {
        r.rawItem.dispatchedToMaidAt = nowIso;
        r.rawItem.dispatchedToDailySummary = true;
      }
    }

    if (db.maidAutomationConfig) {
      if (!Array.isArray(db.maidAutomationConfig.history)) db.maidAutomationConfig.history = [];
      db.maidAutomationConfig.history.unshift({
        id: `rev_daily_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userId: maidUser.id,
        userName: maidUser.name || maidUser.username,
        phone: cleanPh,
        triggerId: "trigger_daily_review_summary",
        triggerName: "Resumo Diário de Avaliações",
        message,
        status: sendRes?.success ? "sent" : "failed",
        method: sendRes?.method || (sendRes?.simulated ? "simulado" : "zapi"),
        error: sendRes?.error || null,
        sentAt: nowIso
      });
      if (db.maidAutomationConfig.history.length > 100) {
        db.maidAutomationConfig.history = db.maidAutomationConfig.history.slice(0, 100);
      }
    }

    maidsNotified++;
    totalReviewsSent += reviews.length;
  }

  return { maidsNotified, totalReviewsSent };
}

/**
 * Consolida e despacha retroativamente as avaliações elegíveis de Novembro/2026 com trava de idempotência (F10 / R4).
 *
 * @param {object} db Instância do banco de dados em memória
 * @param {object} [options]
 * @param {Function} [options.sendZapiFn] Mock de envio para testes
 * @param {boolean} [options.force=false] Forçar reenvio mesmo se já despachado
 * @returns {Promise<{ maidsNotified: number, totalReviewsSent: number, summaryByMaid: Record<string, number> }>}
 */
export async function dispatchNovemberRetroactiveReviews(db, {
  sendZapiFn = null,
  force = false
} = {}) {
  if (!db) {
    return { maidsNotified: 0, totalReviewsSent: 0, summaryByMaid: {}, error: "db não fornecido" };
  }

  const seenIds = new Set();
  const allNpsIds = new Set();
  const candidateItems = [];

  const allNps = Array.isArray(db.npsResponses) ? db.npsResponses : [];
  for (const item of allNps) {
    if (!item) continue;
    if (item.id) allNpsIds.add(String(item.id));
    if (item.score == null && item.rating == null) continue;
    if (item.id && seenIds.has(String(item.id))) continue;
    if (item.id) seenIds.add(String(item.id));
    const itemDate = String(item.respondedAt || item.date || item.createdAt || "").substring(0, 10);
    if (itemDate.startsWith("2026-11")) {
      candidateItems.push({ ...item, _originalRef: item });
    }
  }

  const allReviews = Array.isArray(db.reviews) ? db.reviews : [];
  for (const item of allReviews) {
    if (!item) continue;
    if (item.score == null && item.rating == null) continue;
    // Ignora espelhos sincronizados de db.npsResponses (fromNpsId) para evitar duplicidade
    if (item.fromNpsId && allNpsIds.has(String(item.fromNpsId))) continue;
    const revKey = `rev_${item.id}`;
    if (item.id && seenIds.has(revKey)) continue;
    if (item.id) seenIds.add(revKey);
    const itemDate = String(item.date || item.respondedAt || item.createdAt || "").substring(0, 10);
    if (itemDate.startsWith("2026-11")) {
      candidateItems.push({ ...item, _originalRef: item });
    }
  }

  const groupedByMaid = {};

  for (const item of candidateItems) {
    // Trava de idempotência (F10 / 6.2)
    if (!force && (item.dispatchedToMaidAt || item.dispatchedRetroactiveAt)) {
      continue;
    }

    const reservation = resolveConsistentReservationForReview(db, item);
    const targetFlat = String(reservation?.flatNumber || item.flatNumber || item.flatMentioned || "").trim();

    const attribution = resolveMaidCleaningForReservation(db, reservation, {
      flatNumber: targetFlat,
      evaluationDate: item.respondedAt || item.date
    });

    const maidUser = attribution?.maidUser;
    if (!maidUser || !maidUser.id) continue;

    const finalCleaningDate = String(attribution.cleaningDate || item.respondedAt || item.date || "").substring(0, 10);
    // Filtra estritamente limpezas realizadas em Novembro/2026 (exclui limpezas de Outubro/2026)
    if (!finalCleaningDate.startsWith("2026-11")) {
      continue;
    }

    const score = Number(item.score ?? item.rating ?? 5);
    const rawComment = sanitizeReviewComment(item.comment || item.text || item.feedback || "");
    let displayComment = rawComment;

    let eligible = true;
    if (score < 5 && rawComment) {
      const triage = await triageSub5Review({
        score,
        comment: rawComment,
        flatNumber: targetFlat,
        db
      });
      eligible = Boolean(triage?.forwardToMaid);
      if (eligible) {
        displayComment = extractCleaningCommentForMaid(rawComment, triage);
      }
    }

    if (!eligible) continue;

    const maidId = maidUser.id;
    if (!groupedByMaid[maidId]) {
      groupedByMaid[maidId] = {
        maidUser,
        reviews: [],
        seenCleaningKeys: new Map()
      };
    }

    const finalFlat = String(attribution.cleaningRequest?.flatNumber || targetFlat || "Quarto").trim();
    const dedupeKey = attribution.cleaningRequest?.id
      ? `clean_${attribution.cleaningRequest.id}`
      : `flat_${finalFlat}_${finalCleaningDate}`;

    const existingIdx = groupedByMaid[maidId].seenCleaningKeys.get(dedupeKey);
    const entryObj = {
      id: item.id,
      flatNumber: finalFlat,
      cleaningDate: finalCleaningDate,
      score,
      comment: displayComment,
      rawItem: item._originalRef || item
    };

    if (existingIdx !== undefined) {
      const prevEntry = groupedByMaid[maidId].reviews[existingIdx];
      if (!prevEntry.comment && entryObj.comment) {
        groupedByMaid[maidId].reviews[existingIdx] = entryObj;
      }
      continue;
    }

    groupedByMaid[maidId].seenCleaningKeys.set(dedupeKey, groupedByMaid[maidId].reviews.length);
    groupedByMaid[maidId].reviews.push(entryObj);
  }

  const sender = typeof sendZapiFn === "function" ? sendZapiFn : sendZapiMessage;
  let maidsNotified = 0;
  let totalReviewsSent = 0;
  const summaryByMaid = {};

  for (const maidId of Object.keys(groupedByMaid)) {
    const { maidUser, reviews } = groupedByMaid[maidId];
    if (!reviews.length) continue;

    const rawPhone = maidUser.whatsapp || maidUser.phone || "";
    const cleanPh = cleanWhatsAppPhone(rawPhone) || rawPhone;
    if (!cleanPh) continue;

    const message = formatDailyReviewsSummaryMessage({
      maidName: maidUser.name || maidUser.username || "Colaboradora",
      targetDate: getBrasiliaNow().date,
      reviews,
      isRetroactive: true
    });

    const sendRes = await sender(db.zapiConfig || {}, {
      phone: cleanPh,
      message,
      channelId: "maids",
      recipientRole: "camareira",
      triggerEvent: "maid_retroactive_november_reviews",
      db
    });

    const nowIso = new Date().toISOString();
    for (const r of reviews) {
      if (r.rawItem) {
        r.rawItem.dispatchedToMaidAt = nowIso;
        r.rawItem.dispatchedRetroactiveAt = nowIso;
      }
    }

    if (db.maidAutomationConfig) {
      if (!Array.isArray(db.maidAutomationConfig.history)) db.maidAutomationConfig.history = [];
      db.maidAutomationConfig.history.unshift({
        id: `rev_retro_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userId: maidUser.id,
        userName: maidUser.name || maidUser.username,
        phone: cleanPh,
        triggerId: "maid_retroactive_november_reviews",
        triggerName: "Resumo Retroativo de Avaliações (Novembro/2026)",
        message,
        status: sendRes?.success ? "sent" : "failed",
        method: sendRes?.method || (sendRes?.simulated ? "simulado" : "zapi"),
        error: sendRes?.error || null,
        sentAt: nowIso
      });
      if (db.maidAutomationConfig.history.length > 100) {
        db.maidAutomationConfig.history = db.maidAutomationConfig.history.slice(0, 100);
      }
    }

    maidsNotified++;
    totalReviewsSent += reviews.length;
    summaryByMaid[maidUser.id] = reviews.length;
  }

  return { maidsNotified, totalReviewsSent, summaryByMaid };
}

// ── Inicialização do Motor de Automações para Camareiras ────────────────────

export function initMaidAutomationEngine(app, getDb, saveDatabase) {
  // Garante a estrutura no banco de dados
  const ensureConfig = () => {
    const db = getDb();
    if (!db.maidAutomationConfig) {
      db.maidAutomationConfig = {
        enabled: true,
        triggers: JSON.parse(JSON.stringify(DEFAULT_MAID_TRIGGERS)),
        history: []
      };
      saveDatabase();
    } else {
      if (!Array.isArray(db.maidAutomationConfig.triggers) || db.maidAutomationConfig.triggers.length === 0) {
        db.maidAutomationConfig.triggers = JSON.parse(JSON.stringify(DEFAULT_MAID_TRIGGERS));
        saveDatabase();
      } else {
        // Garante que todos os triggers padrão existam caso novos tenham sido criados
        for (const defTrig of DEFAULT_MAID_TRIGGERS) {
          const existing = db.maidAutomationConfig.triggers.find(t => t.id === defTrig.id);
          if (!existing) {
            db.maidAutomationConfig.triggers.push(JSON.parse(JSON.stringify(defTrig)));
            saveDatabase();
          } else if (
            (defTrig.id === "trigger_daily_summary" || defTrig.id === "trigger_quinzena_closing") &&
            existing.template &&
            !existing.template.includes("saldo_liquido_quinzena")
          ) {
            existing.template = defTrig.template;
            saveDatabase();
          }
        }
      }
      if (!Array.isArray(db.maidAutomationConfig.history)) {
        db.maidAutomationConfig.history = [];
      }
    }
    return db.maidAutomationConfig;
  };

  // ── Endpoints HTTP ────────────────────────────────────────────────────────

  // 1. Obter Configuração de Gatilhos & Lista de Camareiras com WhatsApp
  app.get("/api/maid-automation/config", (req, res) => {
    const config = ensureConfig();
    const db = getDb();

    const cleaners = (db.users || [])
      .filter(u => u.role === "camareira" || u.role === "cleaner" || u.role === "admin")
      .map(u => {
        const isCris = u.id === 2 || (u.username && u.username.toLowerCase() === "cris");
        const isGrazi = u.id === 3 || (u.username && u.username.toLowerCase() === "grazi");
        const rawWpp = u.whatsapp || u.phone || (isCris ? "5522988486446" : (isGrazi ? "5522999106204" : ""));
        const rawPhone = u.phone || u.whatsapp || (isCris ? "22988486446" : (isGrazi ? "22999106204" : ""));
        const pixKey = u.pixKey || (isCris ? "22988486446" : (isGrazi ? "12977795766" : ""));
        return {
          id: u.id,
          username: u.username,
          name: u.name || u.username,
          role: u.role === "admin" ? "admin" : "camareira",
          whatsapp: rawWpp,
          phone: rawPhone,
          pixKey,
          active: u.active !== false
        };
      });

    res.json({
      config,
      cleaners,
      serverTime: getBrasiliaNow(),
      zapiStatus: {
        configured: Boolean(db.zapiConfig?.instanceId && db.zapiConfig?.token),
        enabled: Boolean(db.zapiConfig?.enabled)
      }
    });
  });

  // 2. Atualizar Gatilhos & Templates
  app.put("/api/maid-automation/config", (req, res) => {
    const config = ensureConfig();
    const { triggers, enabled } = req.body || {};

    if (typeof enabled === "boolean") {
      config.enabled = enabled;
    }

    if (Array.isArray(triggers)) {
      for (const updateTrig of triggers) {
        const existing = config.triggers.find(t => t.id === updateTrig.id);
        if (existing) {
          if (typeof updateTrig.enabled === "boolean") existing.enabled = updateTrig.enabled;
          if (typeof updateTrig.template === "string") existing.template = updateTrig.template;
          if (typeof updateTrig.thresholdMinutes === "number") existing.thresholdMinutes = updateTrig.thresholdMinutes;
          if (typeof updateTrig.scheduledTime === "string") existing.scheduledTime = updateTrig.scheduledTime;
        }
      }
    }

    saveDatabase();
    res.json({ success: true, config });
  });

  // 3. Obter Histórico de Disparos de Camareiras
  app.get("/api/maid-automation/history", (req, res) => {
    const config = ensureConfig();
    res.json(config.history || []);
  });

  // 4. Limpar Histórico de Disparos
  app.delete("/api/maid-automation/history", (req, res) => {
    const config = ensureConfig();
    config.history = [];
    saveDatabase();
    res.json({ success: true, message: "Histórico limpo com sucesso!" });
  });

  // 5. Testar Disparo de Mensagem com Preview Imediato
  app.post("/api/maid-automation/test-dispatch", async (req, res) => {
    const { triggerId, maidUserId, customPhone, previewOnly } = req.body || {};
    const config = ensureConfig();
    const db = getDb();

    const trigger = config.triggers.find(t => t.id === triggerId) || config.triggers[0];
    const maidUser = (db.users || []).find(u => u.id === Number(maidUserId)) || 
                     (db.users || []).find(u => u.role === "camareira") ||
                     { id: 2, username: "Cris", name: "Cris", whatsapp: "22988486446", pixKey: "22988486446" };

    const targetPhone = customPhone || maidUser.whatsapp || maidUser.phone || "5522988486446";
    const cleanPh = cleanWhatsAppPhone(targetPhone);

    const stats = getMaidStats(db, maidUser.id);
    const extra = {
      roomNumber: "211",
      elapsedMinutes: trigger.thresholdMinutes || 40
    };

    const renderedMessage = resolveMaidTemplateTags(trigger.template, maidUser, stats, extra);

    if (previewOnly) {
      return res.json({
        success: true,
        preview: true,
        phone: cleanPh,
        message: renderedMessage,
        triggerName: trigger.name,
        maidName: maidUser.name || maidUser.username
      });
    }

    // Dispara via Z-API (ou modo simulado se sem credenciais)
    const result = await sendZapiMessage(db.zapiConfig, {
      phone: cleanPh,
      message: renderedMessage,
      channelId: "maids",
      recipientRole: "camareira",
      triggerEvent: `maid_test_${trigger.id}`,
      db
    });

    const logEntry = {
      id: `test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: maidUser.id,
      userName: maidUser.name || maidUser.username,
      phone: cleanPh,
      triggerId: trigger.id,
      triggerName: `[TESTE] ${trigger.name}`,
      message: renderedMessage,
      status: result.success ? "sent" : "failed",
      method: result.method || (result.simulated ? "simulado" : "zapi"),
      error: result.error || null,
      sentAt: new Date().toISOString()
    };

    config.history.unshift(logEntry);
    if (config.history.length > 100) config.history = config.history.slice(0, 100);
    saveDatabase();

    res.json({
      success: result.success,
      simulated: Boolean(result.simulated),
      phone: cleanPh,
      message: renderedMessage,
      result
    });
  });

  // 6. Executar Gatilho Manualmente para Todas as Camareiras Ativas
  app.post("/api/maid-automation/dispatch-now", async (req, res) => {
    const { triggerId } = req.body || {};
    const config = ensureConfig();
    const db = getDb();

    const trigger = config.triggers.find(t => t.id === triggerId);
    if (!trigger) return res.status(404).json({ error: "Gatilho não encontrado." });

    if (trigger.id === "trigger_daily_review_summary") {
      const summaryResult = await dispatchDailyReviewsSummary(db, { force: true });
      saveDatabase("manual_dispatch_daily_review_summary");
      return res.json({
        success: true,
        count: summaryResult.maidsNotified,
        totalReviewsSent: summaryResult.totalReviewsSent,
        message: `Resumo diário disparado com sucesso para ${summaryResult.maidsNotified} camareiras (${summaryResult.totalReviewsSent} avaliações).`
      });
    }

    const maids = (db.users || []).filter(u => 
      (u.role === "camareira" || u.role === "cleaner") && 
      u.active !== false && 
      (u.whatsapp || u.phone)
    );

    if (maids.length === 0) {
      return res.status(400).json({ error: "Nenhuma camareira ativa com WhatsApp cadastrado encontrada." });
    }

    const dispatched = [];
    for (const maid of maids) {
      const cleanPh = cleanWhatsAppPhone(maid.whatsapp || maid.phone);
      const stats = getMaidStats(db, maid.id);
      const renderedMessage = resolveMaidTemplateTags(trigger.template, maid, stats, { roomNumber: "113", elapsedMinutes: trigger.thresholdMinutes || 40 });

      const result = await sendZapiMessage(db.zapiConfig, {
        phone: cleanPh,
        message: renderedMessage,
        channelId: "maids",
        recipientRole: "camareira",
        triggerEvent: `maid_manual_${trigger.id}`,
        db
      });

      const logEntry = {
        id: `manual_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userId: maid.id,
        userName: maid.name || maid.username,
        phone: cleanPh,
        triggerId: trigger.id,
        triggerName: `[MANUAL] ${trigger.name}`,
        message: renderedMessage,
        status: result.success ? "sent" : "failed",
        method: result.method || (result.simulated ? "simulado" : "zapi"),
        error: result.error || null,
        sentAt: new Date().toISOString()
      };

      config.history.unshift(logEntry);
      dispatched.push({ maid: maid.name || maid.username, phone: cleanPh, success: result.success });
      await new Promise(r => setTimeout(r, 1000));
    }

    if (config.history.length > 100) config.history = config.history.slice(0, 100);
    saveDatabase();

    res.json({ success: true, count: dispatched.length, dispatched });
  });

  // 7. Disparo Retroativo de Avaliações de Novembro/2026 com Trava de Idempotência
  app.post("/api/maid-automation/dispatch-retroactive-reviews", async (req, res) => {
    try {
      const { force = false } = req.body || {};
      const db = getDb();
      const result = await dispatchNovemberRetroactiveReviews(db, { force: Boolean(force) });
      saveDatabase("dispatch_retroactive_reviews_november");
      res.json({
        success: true,
        ...result,
        message: `Disparo retroativo de Novembro concluído: ${result.maidsNotified} camareiras notificadas, ${result.totalReviewsSent} avaliações enviadas.`
      });
    } catch (err) {
      console.error("[Maid Automation] Erro em dispatch-retroactive-reviews:", err);
      res.status(500).json({ success: false, error: err?.message || "Erro ao processar disparo retroativo" });
    }
  });

  // 8. Disparo Manual do Resumo Diário de Avaliações
  app.post("/api/maid-automation/dispatch-daily-reviews", async (req, res) => {
    try {
      const { targetDate, force = true } = req.body || {};
      const db = getDb();
      const result = await dispatchDailyReviewsSummary(db, { targetDate, force: Boolean(force) });
      saveDatabase("dispatch_daily_reviews_summary");
      res.json({
        success: true,
        ...result,
        message: `Resumo diário disparado com sucesso: ${result.maidsNotified} camareiras notificadas, ${result.totalReviewsSent} avaliações enviadas.`
      });
    } catch (err) {
      console.error("[Maid Automation] Erro em dispatch-daily-reviews:", err);
      res.status(500).json({ success: false, error: err?.message || "Erro ao processar resumo diário de avaliações" });
    }
  });

  // ── Background Runner Contínuo (A Cada 60 Segundos - desfasado em +30s para balancear Event Loop) ───
  setTimeout(() => {
    setInterval(async () => {
      try {
        const db = getDb();
      const config = db?.maidAutomationConfig;
      if (!config || !config.enabled) return;

      const bNow = getBrasiliaNow();
      const nowIso = new Date().toISOString();

      // ────────────────────────────────────────────────────────────────────────
      // GATILHO 1: Alerta de Quarto em Limpeza Prolongada (>40 min)
      // ────────────────────────────────────────────────────────────────────────
      const overtimeTrigger = config.triggers.find(t => t.id === "trigger_overtime_cleaning");
      if (overtimeTrigger && overtimeTrigger.enabled) {
        const thresholdMins = overtimeTrigger.thresholdMinutes || 40;

        const ongoingCleanings = (db.cleaningRequests || []).filter(r => 
          (r.status === "cleaning_now" || r.status === "in_progress") && 
          r.cleaningStartedAt && 
          !r.overtimeAlertSentAt
        );

        for (const reqItem of ongoingCleanings) {
          const startedMs = new Date(reqItem.cleaningStartedAt).getTime();
          const elapsedMins = Math.floor((Date.now() - startedMs) / 60000);

          if (elapsedMins >= thresholdMins) {
            const assignedUser = (db.users || []).find(u => u.id === reqItem.assignedUserId);
            if (assignedUser && (assignedUser.whatsapp || assignedUser.phone)) {
              const cleanPh = cleanWhatsAppPhone(assignedUser.whatsapp || assignedUser.phone);
              const flat = (db.flats || []).find(f => f.id === reqItem.flatId);
              const roomNumber = flat ? flat.number : (reqItem.flatNumber || String(reqItem.flatId));

              const renderedMsg = resolveMaidTemplateTags(
                overtimeTrigger.template, 
                assignedUser, 
                {}, 
                { roomNumber, elapsedMinutes: elapsedMins }
              );

              console.log(`[Auto-Limpeza WhatsApp] Disparando alerta de >${thresholdMins}min para ${assignedUser.username} (Quarto ${roomNumber})...`);

              const sendRes = await sendZapiMessage(db.zapiConfig, {
                phone: cleanPh,
                message: renderedMsg,
                channelId: "maids",
                recipientRole: "camareira",
                triggerEvent: overtimeTrigger.id,
                db
              });

              reqItem.overtimeAlertSentAt = nowIso;

              config.history.unshift({
                id: `cron_ot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                userId: assignedUser.id,
                userName: assignedUser.name || assignedUser.username,
                phone: cleanPh,
                triggerId: overtimeTrigger.id,
                triggerName: overtimeTrigger.name,
                message: renderedMsg,
                status: sendRes.success ? "sent" : "failed",
                method: sendRes.method || (sendRes.simulated ? "simulado" : "zapi"),
                error: sendRes.error || null,
                sentAt: nowIso
              });

              if (config.history.length > 100) config.history = config.history.slice(0, 100);
              saveDatabase();
              await new Promise(r => setTimeout(r, 1500));
            }
          }
        }
      }

      // ────────────────────────────────────────────────────────────────────────
      // GATILHO 3: Relatório de Fechamento de Quinzena (Dia 15 e Fim do Mês às 18:00)
      // ────────────────────────────────────────────────────────────────────────
      const closingTrigger = config.triggers.find(t => t.id === "trigger_quinzena_closing");
      const [currY, currM, currD] = bNow.date.split("-").map(Number);
      const lastDayOfMonth = new Date(currY, currM, 0).getDate();
      const isClosingDay = (currD === 15 || currD === lastDayOfMonth);

      const targetClosingTime = closingTrigger?.scheduledTime || "18:00";
      const [tClosingHour, tClosingMin] = targetClosingTime.split(":").map(Number);
      const isPastOrAtClosingTime = (bNow.hour > tClosingHour) || (bNow.hour === tClosingHour && bNow.minute >= tClosingMin);

      if (closingTrigger && closingTrigger.enabled && isClosingDay && isPastOrAtClosingTime && closingTrigger.lastExecutedDate !== bNow.date) {
        closingTrigger.lastExecutedDate = bNow.date;
        console.log(`[Auto-Limpeza WhatsApp] Executando FECHAMENTO DE QUINZENA para camareiras (${bNow.date} às ${bNow.timeStr})...`);

        const maids = (db.users || []).filter(u => 
          (u.role === "camareira" || u.role === "cleaner") && 
          u.active !== false && 
          (u.whatsapp || u.phone)
        );

        for (const maid of maids) {
          const stats = getMaidStats(db, maid.id, bNow.date);
          // Dispara mesmo se tiver 0 para transparência, ou se tiver feito quartos
          if (stats.quinzenaCount > 0 || stats.todayCount > 0) {
            const cleanPh = cleanWhatsAppPhone(maid.whatsapp || maid.phone);
            const renderedMsg = resolveMaidTemplateTags(closingTrigger.template, maid, stats);

            const sendRes = await sendZapiMessage(db.zapiConfig, {
              phone: cleanPh,
              message: renderedMsg,
              channelId: "maids",
              recipientRole: "camareira",
              triggerEvent: closingTrigger.id,
              db
            });

            config.history.unshift({
              id: `cron_close_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              userId: maid.id,
              userName: maid.name || maid.username,
              phone: cleanPh,
              triggerId: closingTrigger.id,
              triggerName: closingTrigger.name,
              message: renderedMsg,
              status: sendRes.success ? "sent" : "failed",
              method: sendRes.method || (sendRes.simulated ? "simulado" : "zapi"),
              error: sendRes.error || null,
              sentAt: new Date().toISOString()
            });

            await new Promise(r => setTimeout(r, 1500));
          }
        }

        if (config.history.length > 100) config.history = config.history.slice(0, 100);
        saveDatabase();
      }

      // ────────────────────────────────────────────────────────────────────────
      // GATILHO 2: Resumo Diário de Produtividade (Todo dia às 18:00)
      // ────────────────────────────────────────────────────────────────────────
      const dailyTrigger = config.triggers.find(t => t.id === "trigger_daily_summary");
      const targetDailyTime = dailyTrigger?.scheduledTime || "18:00";
      const [tDailyHour, tDailyMin] = targetDailyTime.split(":").map(Number);
      const isPastOrAtDailyTime = (bNow.hour > tDailyHour) || (bNow.hour === tDailyHour && bNow.minute >= tDailyMin);

      // Suprime o resumo diário se for dia de fechamento oficial e o fechamento quinzenal estiver habilitado/executado hoje
      const shouldSuppressDaily = isClosingDay && (closingTrigger?.enabled || closingTrigger?.lastExecutedDate === bNow.date);

      if (dailyTrigger && dailyTrigger.enabled && isPastOrAtDailyTime && dailyTrigger.lastExecutedDate !== bNow.date) {
        dailyTrigger.lastExecutedDate = bNow.date;
        if (shouldSuppressDaily) {
          console.log(`[Auto-Limpeza WhatsApp] Suprimindo disparo de trigger_daily_summary (${bNow.date}) pois hoje é dia de fechamento quinzenal oficial.`);
          saveDatabase();
        } else {
          console.log(`[Auto-Limpeza WhatsApp] Executando RESUMO DIÁRIO para camareiras (${bNow.date} às ${bNow.timeStr})...`);

        const maids = (db.users || []).filter(u => 
          (u.role === "camareira" || u.role === "cleaner") && 
          u.active !== false && 
          (u.whatsapp || u.phone)
        );

        for (const maid of maids) {
          const stats = getMaidStats(db, maid.id, bNow.date);
          if (stats.todayCount > 0 || stats.quinzenaCount > 0) {
            const cleanPh = cleanWhatsAppPhone(maid.whatsapp || maid.phone);
            const renderedMsg = resolveMaidTemplateTags(dailyTrigger.template, maid, stats);

            const sendRes = await sendZapiMessage(db.zapiConfig, {
              phone: cleanPh,
              message: renderedMsg,
              channelId: "maids",
              recipientRole: "camareira",
              triggerEvent: dailyTrigger.id,
              db
            });

            config.history.unshift({
              id: `cron_daily_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              userId: maid.id,
              userName: maid.name || maid.username,
              phone: cleanPh,
              triggerId: dailyTrigger.id,
              triggerName: dailyTrigger.name,
              message: renderedMsg,
              status: sendRes.success ? "sent" : "failed",
              method: sendRes.method || (sendRes.simulated ? "simulado" : "zapi"),
              error: sendRes.error || null,
              sentAt: new Date().toISOString()
            });

            await new Promise(r => setTimeout(r, 1500));
          }
        }

        if (config.history.length > 100) config.history = config.history.slice(0, 100);
        saveDatabase();
        }
      }

      // ────────────────────────────────────────────────────────────────────────
      // GATILHO 4: Resumo Diário de Avaliações dos Hóspedes (F8, F9)
      // ────────────────────────────────────────────────────────────────────────
      const reviewSummaryTrigger = config.triggers.find(t => t.id === "trigger_daily_review_summary");
      const targetReviewTime = reviewSummaryTrigger?.scheduledTime || "18:00";
      const [tReviewHour, tReviewMin] = targetReviewTime.split(":").map(Number);
      const isPastOrAtReviewTime = (bNow.hour > tReviewHour) || (bNow.hour === tReviewHour && bNow.minute >= tReviewMin);

      if (reviewSummaryTrigger && reviewSummaryTrigger.enabled && isPastOrAtReviewTime && reviewSummaryTrigger.lastExecutedDate !== bNow.date) {
        reviewSummaryTrigger.lastExecutedDate = bNow.date;
        console.log(`[Auto-Limpeza WhatsApp] Executando RESUMO DIÁRIO DE AVALIAÇÕES para camareiras (${bNow.date} às ${bNow.timeStr})...`);

        try {
          const summaryResult = await dispatchDailyReviewsSummary(db, {
            targetDate: bNow.date,
            force: false
          });
          console.log(`[Auto-Limpeza WhatsApp] Resumo Diário de Avaliações concluído: ${summaryResult.maidsNotified} camareiras notificadas, ${summaryResult.totalReviewsSent} avaliações enviadas.`);
          saveDatabase();
        } catch (err) {
          console.error("[Auto-Limpeza WhatsApp] Erro no disparo de Resumo Diário de Avaliações:", err?.message);
        }
      }

    } catch (err) {
      console.error("[Maid WhatsApp Automation Error]:", err.message);
    }
    }, 60 * 1000);
  }, 30000);

  console.log("✓ [Maid WhatsApp Automation Engine] Inicializado com sucesso para Governança & Camareiras.");
}

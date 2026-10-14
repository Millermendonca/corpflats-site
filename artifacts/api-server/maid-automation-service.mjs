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
  for (const e of db.maidStatementEntries) {
    if (e.userId !== userId || e.entryType !== "credit") continue;
    const entryDate = e.entryDate || (e.createdAt ? getExecutionDateStr(e.createdAt) : "");
    if (entryDate < "2026-09-01") continue;
    if ((userId === 2 || userId === 3) && Math.abs(Number(e.amount || 0) - userRate) > 0.001) {
      e.amount = userRate;
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

    // Se existe uma entrada legada sem cleaningRequestId para o mesmo flat e data da camareira, vincula
    const legacyEntry = db.maidStatementEntries.find(
      e => !e.cleaningRequestId && e.userId === userId && e.entryType === "credit" && e.entryDate === entryDate && e.description === `Diária — Flat ${flatNum}`
    );
    if (legacyEntry) {
      legacyEntry.cleaningRequestId = cleaning.id;
      existingCreditRefs.add(cleaning.id);
      modified = true;
      continue;
    }

    newEntries.push({
      id: generatePaymentId(),
      userId,
      cleaningRequestId: cleaning.id,
      paymentId: null,
      entryType: "credit",
      amount: userRate,
      description: `Diária — Flat ${flatNum}`,
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

  const cleanings = (db?.cleaningRequests || []).filter(r => {
    if (r.status !== "clean" || r.isBedAdjustmentOnly || r.isInstructionOnly || r.type === "instruction" || r.source === "manual_instruction" || r.isPaidCleaning === false) return false;
    if (r.assignedUserId !== userId) return false;
    const effectiveDate = r.completedAt ? getExecutionDateStr(r.completedAt) : (r.effectiveDate || r.requestDate);
    return effectiveDate >= startD && effectiveDate <= endD;
  });

  const cleaningsCount = cleanings.length;
  const grossAmount = Number((cleaningsCount * userRate).toFixed(2));

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
    grossAmount,
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

  // Agrupamento por dia para o detalhamento do fechamento
  const cleaningsByDayMap = {};
  quinzenaCleanings.forEach(c => {
    const d = c.completedAt ? getExecutionDateStr(c.completedAt) : (c.effectiveDate || c.requestDate);
    const flat = (db.flats || []).find(f => f.id === c.flatId);
    const fNum = flat ? flat.number : (c.flatNumber || String(c.flatId));
    if (!cleaningsByDayMap[d]) cleaningsByDayMap[d] = [];
    cleaningsByDayMap[d].push(fNum);
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
    ratePerRoom: userRate,
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
    .replace(/\{\{nome_hotel\}\}/g, "CorpFlats");

  return out;
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
        // Garante que todos os 3 triggers existam caso novos tenham sido criados
        for (const defTrig of DEFAULT_MAID_TRIGGERS) {
          const existing = db.maidAutomationConfig.triggers.find(t => t.id === defTrig.id);
          if (!existing) {
            db.maidAutomationConfig.triggers.push(JSON.parse(JSON.stringify(defTrig)));
            saveDatabase();
          } else if (existing.template && !existing.template.includes("saldo_liquido_quinzena")) {
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
      recipientRole: "camareira",
      bypassTestMode: true
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
        recipientRole: "camareira",
        bypassTestMode: true
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

  // ── Background Runner Contínuo (A Cada 60 Segundos) ───────────────────────
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
                recipientRole: "camareira",
                bypassTestMode: true
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
              recipientRole: "camareira",
              bypassTestMode: true
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
              recipientRole: "camareira",
              bypassTestMode: true
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

    } catch (err) {
      console.error("[Maid WhatsApp Automation Error]:", err.message);
    }
  }, 60 * 1000);

  console.log("✓ [Maid WhatsApp Automation Engine] Inicializado com sucesso para Governança & Camareiras.");
}

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
    description: "Envia diariamente às 18:00 um balanço das atividades: quartos limpos, tempo médio e total acumulado na quinzena.",
    enabled: true,
    timing: "daily_time",
    scheduledTime: "18:00",
    lastExecutedDate: null,
    template: `📊 *Resumo do seu Dia de Trabalho • CorpFlats* 🧹

Boa tarde, *{{nome_camareira}}*!
Aqui está o balanço das suas atividades de hoje (*{{data_hoje}}*):

✅ *Quartos limpos hoje:* {{qtd_quartos_hoje}}
🚪 *Quartos:* {{lista_quartos_hoje}}
⏱️ *Tempo médio por quarto:* {{tempo_medio_hoje}} min

📈 *Acumulado da Quinzena ({{periodo_quinzena}}):*
• Total de quartos concluídos: *{{total_quartos_quinzena}}*
• Total a receber acumulado: *{{total_valor_quinzena}}*

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
💰 *TOTAL A RECEBER:* *{{total_valor_quinzena}}*
🔑 *Chave PIX Cadastrada:* {{chave_pix}}

📋 *Detalhamento por Dia:*
{{detalhamento_dias}}

Por favor, confira os quartos acima. Caso haja qualquer divergência, avise a administração. Parabéns e obrigado pelo excelente trabalho nesta quinzena! 👏✨`
  }
];

// ── Utilitários de Data e Moeda ─────────────────────────────────────────────

export function getBrasiliaNow() {
  const now = new Date();
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
    if (r.status !== "clean" || r.isBedAdjustmentOnly || r.isPaidCleaning === false) return false;
    if (r.assignedUserId !== maidUserId) return false;
    const effectiveDate = r.completedAt ? r.completedAt.substring(0, 10) : r.requestDate;
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

  // Limpezas da Quinzena
  const quinzenaCleanings = (db.cleaningRequests || []).filter(r => {
    if (r.status !== "clean" || r.isBedAdjustmentOnly || r.isPaidCleaning === false) return false;
    if (r.assignedUserId !== maidUserId) return false;
    const effectiveDate = r.completedAt ? r.completedAt.substring(0, 10) : r.requestDate;
    return effectiveDate >= quinzenaStart && effectiveDate <= quinzenaEnd;
  });

  // Taxa por quarto
  const defaultRate = Number(db.cleaningRates?.defaultRatePerRoom || 22.50);
  const userRate = db.cleaningRates?.userRates?.[maidUserId] !== undefined
    ? Number(db.cleaningRates.userRates[maidUserId])
    : defaultRate;

  const quinzenaTotalValue = quinzenaCleanings.length * userRate;

  // Agrupamento por dia para o detalhamento do fechamento
  const cleaningsByDayMap = {};
  quinzenaCleanings.forEach(c => {
    const d = c.completedAt ? c.completedAt.substring(0, 10) : c.requestDate;
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
    quinzenaCount: quinzenaCleanings.length,
    ratePerRoom: userRate,
    quinzenaTotalValue,
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
          if (!db.maidAutomationConfig.triggers.some(t => t.id === defTrig.id)) {
            db.maidAutomationConfig.triggers.push(JSON.parse(JSON.stringify(defTrig)));
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
      .map(u => ({
        id: u.id,
        username: u.username,
        name: u.name || u.username,
        role: u.role === "admin" ? "admin" : "camareira",
        whatsapp: u.whatsapp || u.phone || "",
        phone: u.phone || u.whatsapp || "",
        pixKey: u.pixKey || "",
        active: u.active !== false
      }));

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
                     { id: 2, username: "Cris", name: "Cris Camareira", whatsapp: "22997124021", pixKey: "22997124021" };

    const targetPhone = customPhone || maidUser.whatsapp || maidUser.phone || "5522997124021";
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
      message: renderedMessage
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
        message: renderedMessage
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
                message: renderedMsg
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
      if (closingTrigger && closingTrigger.enabled && isClosingDay && bNow.timeStr === targetClosingTime && closingTrigger.lastExecutedDate !== bNow.date) {
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
              message: renderedMsg
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

      if (dailyTrigger && dailyTrigger.enabled && bNow.timeStr === targetDailyTime && dailyTrigger.lastExecutedDate !== bNow.date) {
        dailyTrigger.lastExecutedDate = bNow.date;
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
              message: renderedMsg
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

    } catch (err) {
      console.error("[Maid WhatsApp Automation Error]:", err.message);
    }
  }, 60 * 1000);

  console.log("✓ [Maid WhatsApp Automation Engine] Inicializado com sucesso para Governança & Camareiras.");
}

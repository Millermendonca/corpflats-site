import v8 from "node:v8";
import os from "node:os";
import { monitorEventLoopDelay, PerformanceObserver } from "node:perf_hooks";
import crypto from "node:crypto";

/**
 * CorpFlats Real-Time Server Monitor & Root Cause Analysis (RCA) Engine
 * 
 * - Telemetria contínua do processo Node.js e V8 (CPU, RSS, Heap, Event Loop Lag)
 * - Interceptador de requisições HTTP em processamento ativo
 * - Ingestor de Stream de Métricas do Render (OpenTelemetry OTLP JSON)
 * - Motor de Causa Raiz (RCA) em tempo real para picos de memória e bloqueio de CPU
 * - Proteção fail-safe contra estouro de limite de 512MB do Render
 */

// Configurações & Limiares
export const MONITOR_CONFIG = {
  SAMPLE_INTERVAL_MS: 3000,         // Coleta interna a cada 3 segundos
  HISTORY_MAX_SAMPLES: 360,          // ~18 minutos em memória (~1.2MB overhead máximo)
  DIAGNOSTICS_MAX_ITEMS: 50,         // Mantém os últimos 50 diagnósticos
  SLOW_REQUEST_THRESHOLD_MS: 500,    // Requisições acima de 500ms entram para o ranking de gargalos
  MEMORY_SPIKE_DELTA_MB: 25,         // Salto de 25MB em 1 ciclo ativa análise investigativa
  MEMORY_WARNING_PERCENT: 75,        // 75% do heap limit ativa alerta
  MEMORY_CRITICAL_PERCENT: 88,       // 88% do heap limit ativa mitigação proativa
  EVENT_LOOP_WARNING_MS: 100,        // >100ms indica bloqueio síncrono
  EVENT_LOOP_CRITICAL_MS: 300,       // >300ms indica starvation severo
  CPU_WARNING_PERCENT: 70,           // >70% de CPU do processo
  DEFAULT_TOKEN: process.env.RENDER_METRICS_TOKEN || "corpflats_render_stream_token_2026"
};

// Event Loop Delay Monitor
let eventLoopHistogram = null;
try {
  eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
  eventLoopHistogram.enable();
} catch (err) {
  console.warn("[ServerMonitor] monitorEventLoopDelay não disponível:", err?.message);
}

// Garbage Collection Observer
let lastGcStats = { count: 0, totalDurationMs: 0, lastPauseMs: 0, lastType: "none", lastTimestamp: null };
try {
  if (typeof PerformanceObserver !== "undefined") {
    const gcObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        lastGcStats.count++;
        const duration = Math.round(entry.duration * 100) / 100;
        lastGcStats.totalDurationMs += duration;
        lastGcStats.lastPauseMs = duration;
        lastGcStats.lastTimestamp = new Date().toISOString();
        if (entry.detail && entry.detail.kind) {
          lastGcStats.lastType = entry.detail.kind;
        } else {
          lastGcStats.lastType = entry.name || "gc";
        }
      }
    });
    gcObserver.observe({ entryTypes: ["gc"], buffered: false });
  }
} catch (_) {
  // GC observer pode não estar habilitado sem flags específicas, segue silencioso
}

// Estado em Memória da Telemetria
const activeRequestsMap = new Map(); // id -> { method, url, startTime, ip, memStartRss }
const recentSlowRequests = [];       // Ring buffer de requisições lentas
const telemetryHistory = [];         // Ring buffer de telemetria
const diagnosticsHistory = [];       // Ring buffer de diagnósticos de causa raiz
let lastCpuUsage = process.cpuUsage();
let lastCpuTimestamp = Date.now();
let lastMemoryUsage = process.memoryUsage();

// Estado das métricas recebidas do Render Container (OTel Stream)
let renderContainerMetrics = {
  lastReceivedAt: null,
  containerCpuPercent: null,
  containerMemoryBytes: null,
  containerMemoryLimitBytes: 512 * 1024 * 1024, // 512MB default Render Free/Starter
  containerMemoryPercent: null,
  restarts: 0,
  rawAttributes: {}
};

// Auditoria externa conectável (demo-server logAuditEvent)
let auditLogger = null;
export function setAuditLogger(loggerFn) {
  auditLogger = loggerFn;
}

/**
 * Middleware Express para interceptar requisições ativas e medir alocações de memória
 */
export function serverMonitorMiddleware(req, res, next) {
  const reqId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const startTime = Date.now();
  const memStart = process.memoryUsage();
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local";
  const urlPath = req.baseUrl ? `${req.baseUrl}${req.path}` : (req.originalUrl || req.url || "/");

  // Não rastreia o próprio endpoint do monitor para evitar overhead de recursão
  if (urlPath.includes("/api/admin/server-monitor") || urlPath.includes("/api/observability/render-metrics")) {
    return next();
  }

  const reqRecord = {
    id: reqId,
    method: req.method,
    url: urlPath.split("?")[0],
    fullUrl: urlPath,
    startTime,
    ip: String(clientIp).split(",")[0].trim(),
    memStartRss: memStart.rss,
    memStartHeap: memStart.heapUsed
  };

  activeRequestsMap.set(reqId, reqRecord);

  const cleanup = () => {
    activeRequestsMap.delete(reqId);
    const durationMs = Date.now() - startTime;
    const memEnd = process.memoryUsage();
    const heapDeltaMB = Math.round(((memEnd.heapUsed - memStart.heapUsed) / (1024 * 1024)) * 10) / 10;

    // Rastreia se foi lenta ou alocou memória expressiva (>10MB)
    if (durationMs >= MONITOR_CONFIG.SLOW_REQUEST_THRESHOLD_MS || heapDeltaMB >= 10) {
      recentSlowRequests.unshift({
        id: reqId,
        method: reqRecord.method,
        url: reqRecord.url,
        durationMs,
        heapDeltaMB,
        statusCode: res.statusCode,
        timestamp: new Date().toISOString()
      });
      if (recentSlowRequests.length > 30) recentSlowRequests.pop();
    }
  };

  res.on("finish", cleanup);
  res.on("close", cleanup);
  next();
}

/**
 * Coleta instantânea de métricas em tempo real
 */
export function collectCurrentMetrics() {
  const now = Date.now();
  const timeDeltaSec = Math.max(0.1, (now - lastCpuTimestamp) / 1000);
  const currentCpu = process.cpuUsage(lastCpuUsage);
  lastCpuUsage = process.cpuUsage();
  lastCpuTimestamp = now;

  // CPU percent = (microssegundos / 1.000.000) / segundos decorridos * 100
  const totalCpus = os.cpus()?.length || 1;
  const userCpuPercent = Math.min(100, Math.round(((currentCpu.user / 1000000) / timeDeltaSec) * 100) / totalCpus);
  const systemCpuPercent = Math.min(100, Math.round(((currentCpu.system / 1000000) / timeDeltaSec) * 100) / totalCpus);
  const totalProcessCpu = Math.min(100, Math.round((userCpuPercent + systemCpuPercent) * 10) / 10);

  // V8 & Process Memory
  const mem = process.memoryUsage();
  const heapStats = v8.getHeapStatistics();
  let heapSpaces = [];
  try {
    heapSpaces = v8.getHeapSpaceStatistics().map(s => ({
      name: s.space_name,
      sizeMB: Math.round(s.space_size / (1024 * 1024) * 10) / 10,
      usedMB: Math.round(s.space_used_size / (1024 * 1024) * 10) / 10
    }));
  } catch (_) {}

  // Event Loop Delay (nanosegundos -> milissegundos)
  let loopLag = { p50: 0, p90: 0, p99: 0, max: 0, mean: 0 };
  if (eventLoopHistogram) {
    loopLag = {
      p50: Math.round(eventLoopHistogram.percentile(50) / 1000000 * 10) / 10,
      p90: Math.round(eventLoopHistogram.percentile(90) / 1000000 * 10) / 10,
      p99: Math.round(eventLoopHistogram.percentile(99) / 1000000 * 10) / 10,
      max: Math.round(eventLoopHistogram.max / 1000000 * 10) / 10,
      mean: Math.round(eventLoopHistogram.mean / 1000000 * 10) / 10
    };
    eventLoopHistogram.reset();
  }

  const heapLimitMB = Math.round(heapStats.heap_size_limit / (1024 * 1024));
  const heapUsedMB = Math.round(mem.heapUsed / (1024 * 1024));
  const heapTotalMB = Math.round(mem.heapTotal / (1024 * 1024));
  const rssMB = Math.round(mem.rss / (1024 * 1024));
  const externalMB = Math.round(mem.external / (1024 * 1024));
  const heapPercent = Math.round((mem.heapUsed / heapStats.heap_size_limit) * 100);

  // Render Container metrics merged
  const containerMemUsedMB = renderContainerMetrics.containerMemoryBytes 
    ? Math.round(renderContainerMetrics.containerMemoryBytes / (1024 * 1024))
    : rssMB; // Fallback para RSS se ainda não recebeu stream
  const containerMemLimitMB = Math.round(renderContainerMetrics.containerMemoryLimitBytes / (1024 * 1024));
  const containerMemPercent = Math.round((containerMemUsedMB / containerMemLimitMB) * 100);
  const containerCpu = renderContainerMetrics.containerCpuPercent !== null
    ? renderContainerMetrics.containerCpuPercent
    : totalProcessCpu;

  // Active in-flight requests snapshot
  const activeRequests = Array.from(activeRequestsMap.values()).map(r => ({
    id: r.id,
    method: r.method,
    url: r.url,
    ip: r.ip,
    elapsedMs: now - r.startTime
  }));

  const snapshot = {
    timestamp: new Date().toISOString(),
    cpu: {
      processPercent: totalProcessCpu,
      userPercent: userCpuPercent,
      systemPercent: systemCpuPercent,
      containerPercent: containerCpu,
      loadAvg: os.loadavg ? os.loadavg()[0] : null
    },
    memory: {
      rssMB,
      heapUsedMB,
      heapTotalMB,
      heapLimitMB,
      heapPercent,
      externalMB,
      containerMemUsedMB,
      containerMemLimitMB,
      containerMemPercent,
      spaces: heapSpaces
    },
    eventLoop: loopLag,
    gc: { ...lastGcStats },
    traffic: {
      activeRequestsCount: activeRequests.length,
      activeRequests: activeRequests.slice(0, 10)
    },
    renderStreamConnected: Boolean(renderContainerMetrics.lastReceivedAt && (now - new Date(renderContainerMetrics.lastReceivedAt).getTime() < 120000))
  };

  return snapshot;
}

/**
 * Motor de Análise de Causa Raiz (RCA - Root Cause Analysis)
 * Avalia a amostra atual e correlaciona causas de pico ou degradação em tempo real.
 */
export function evaluateRootCauses(currentSnapshot, prevSnapshot) {
  const issues = [];
  const now = new Date().toISOString();

  const heapUsed = currentSnapshot.memory.heapUsedMB;
  const heapLimit = currentSnapshot.memory.heapLimitMB;
  const heapPercent = currentSnapshot.memory.heapPercent;
  const rssMB = currentSnapshot.memory.rssMB;
  const containerPercent = currentSnapshot.memory.containerMemPercent;
  const cpuPercent = currentSnapshot.cpu.processPercent;
  const eventLoopLagMax = currentSnapshot.eventLoop.max;
  const active = currentSnapshot.traffic.activeRequests;

  // 1. Investigação de Salto / Pico Rápido de Memória
  if (prevSnapshot) {
    const heapDeltaMB = heapUsed - prevSnapshot.memory.heapUsedMB;
    if (heapDeltaMB >= MONITOR_CONFIG.MEMORY_SPIKE_DELTA_MB) {
      let candidateRoute = "Operação interna em segundo plano (cache, cron ou renderização)";
      if (active.length > 0) {
        const topActive = [...active].sort((a, b) => b.elapsedMs - a.elapsedMs)[0];
        candidateRoute = `Rota ativa em processamento: ${topActive.method} ${topActive.url} (${topActive.elapsedMs}ms em execução por IP ${topActive.ip})`;
      } else if (recentSlowRequests.length > 0) {
        const lastSlow = recentSlowRequests[0];
        candidateRoute = `Última requisição pesada concluída: ${lastSlow.method} ${lastSlow.url} (alocou ~${lastSlow.heapDeltaMB}MB em ${lastSlow.durationMs}ms)`;
      }

      // Inspeciona espaço V8
      const largeObjSpace = currentSnapshot.memory.spaces.find(s => s.name === "large_object_space");
      let v8Hint = "";
      if (largeObjSpace && largeObjSpace.usedMB > 15) {
        v8Hint = ` (Alocação em Large Object Space: ${largeObjSpace.usedMB}MB — buffers, PDFs ou payloads volumosos)`;
      }

      issues.push({
        id: `RCA_MEM_SPIKE_${Date.now()}`,
        severity: heapPercent > 80 ? "critical" : "warning",
        category: "MEMORY_SPIKE",
        title: `Pico rápido de alocação de memória (+${heapDeltaMB}MB)`,
        probableCause: `${candidateRoute}${v8Hint}`,
        technicalEvidence: {
          heapDeltaMB,
          heapUsedMB: heapUsed,
          heapLimitMB: heapLimit,
          activeRequestsCount: active.length,
          topActiveRoute: active[0] || null
        },
        recommendedAction: "Monitore a rota apontada para avaliar streaming de payloads ou paginação de grandes coleções.",
        timestamp: now
      });
    }
  }

  // 2. Investigação de Limite Crítico de Memória (Risco de OOM no Render)
  if (heapPercent >= MONITOR_CONFIG.MEMORY_WARNING_PERCENT || containerPercent >= MONITOR_CONFIG.MEMORY_WARNING_PERCENT) {
    const isCritical = heapPercent >= MONITOR_CONFIG.MEMORY_CRITICAL_PERCENT || containerPercent >= 88;
    
    let rootCauseText = `O uso de memória atingiu ${Math.max(heapPercent, containerPercent)}% do limite permitido`;
    if (active.length > 0) {
      const topRoutes = active.slice(0, 3).map(r => `${r.method} ${r.url}`).join(", ");
      rootCauseText += `. Requisições simultâneas em execução no momento: [${topRoutes}]`;
    } else {
      rootCauseText += `. Acúmulo persistente retido em heap ou buffers estáticos.`;
    }

    issues.push({
      id: `RCA_MEM_LIMIT_${Date.now()}`,
      severity: isCritical ? "critical" : "warning",
      category: isCritical ? "RENDER_CONTAINER_OOM_RISK" : "MEMORY_HIGH_PRESSURE",
      title: isCritical 
        ? `⚠️ Perigo Crítico de OOM (Out Of Memory) no Render (${Math.max(heapPercent, containerPercent)}%)` 
        : `Atenção: Alta pressão de memória no servidor (${Math.max(heapPercent, containerPercent)}%)`,
      probableCause: rootCauseText,
      technicalEvidence: {
        rssMB,
        heapUsedMB: heapUsed,
        heapLimitMB,
        containerMemUsedMB: currentSnapshot.memory.containerMemUsedMB,
        containerMemLimitMB: currentSnapshot.memory.containerMemLimitMB
      },
      recommendedAction: isCritical 
        ? "Acionamento de coleta de lixo de emergência e liberação imediata de memória." 
        : "Evite requisições de relatórios massivos simultâneas ou aumente o plano da instância.",
      timestamp: now
    });

    // Ação Proativa de Mitigação: se ultrapassar o limiar crítico, tenta forçar GC se disponível
    if (isCritical) {
      triggerManualGc("Auto-mitigação proativa por limiar crítico de memória");
    }
  }

  // 3. Investigação de Travamento do Event Loop (Event Loop Starvation / CPU Síncrona)
  if (eventLoopLagMax >= MONITOR_CONFIG.EVENT_LOOP_WARNING_MS) {
    const isCritical = eventLoopLagMax >= MONITOR_CONFIG.EVENT_LOOP_CRITICAL_MS;
    let cause = "Execução de código síncrono bloqueante no loop de eventos do Node.js";

    if (active.length > 0) {
      const longest = [...active].sort((a, b) => b.elapsedMs - a.elapsedMs)[0];
      cause = `Operação síncrona ou serialização pesada durante: ${longest.method} ${longest.url} (${longest.elapsedMs}ms ativa)`;
    } else if (recentSlowRequests.length > 0) {
      const lastSlow = recentSlowRequests[0];
      cause = `Conclusão da operação síncrona associada a ${lastSlow.method} ${lastSlow.url} (${lastSlow.durationMs}ms)`;
    }

    issues.push({
      id: `RCA_EVENT_LOOP_${Date.now()}`,
      severity: isCritical ? "critical" : "warning",
      category: "EVENT_LOOP_STARVATION",
      title: isCritical ? `Travamento Crítico do Event Loop (${eventLoopLagMax}ms)` : `Atraso no Event Loop (${eventLoopLagMax}ms)`,
      probableCause: cause,
      technicalEvidence: {
        eventLoopLagMax,
        eventLoopP99: currentSnapshot.eventLoop.p99,
        processCpu: cpuPercent,
        activeRequestsCount: active.length
      },
      recommendedAction: "Isole rotinas síncronas demoradas (como JSON.stringify de coleções gigantes ou leitura síncrona de arquivos) em operações assíncronas.",
      timestamp: now
    });
  }

  // 4. Investigação de Sobrecarga de CPU
  if (cpuPercent >= MONITOR_CONFIG.CPU_WARNING_PERCENT) {
    let cause = `Consumo de processamento do processo Node.js em ${cpuPercent}%`;
    if (active.length > 5) {
      cause += ` devido a alta concorrência de tráfego (${active.length} requisições concorrentes)`;
    } else if (eventLoopLagMax > 50) {
      cause += ` associado a computação intensa síncrona (Event Loop atrasado em ${eventLoopLagMax}ms)`;
    }

    issues.push({
      id: `RCA_CPU_HIGH_${Date.now()}`,
      severity: cpuPercent >= 90 ? "critical" : "warning",
      category: "CPU_SPIKE",
      title: `Uso elevado de CPU (${cpuPercent}%)`,
      probableCause: cause,
      technicalEvidence: {
        processCpu: cpuPercent,
        userCpu: currentSnapshot.cpu.userPercent,
        systemCpu: currentSnapshot.cpu.systemPercent,
        activeRequestsCount: active.length
      },
      recommendedAction: "Verifique concorrência de chamadas ou rotinas de parsing de planilhas/PDFs.",
      timestamp: now
    });
  }

  // Salva no histórico de diagnósticos e emite para audit log se relevante
  if (issues.length > 0) {
    for (const issue of issues) {
      diagnosticsHistory.unshift(issue);
      if (diagnosticsHistory.length > MONITOR_CONFIG.DIAGNOSTICS_MAX_ITEMS) {
        diagnosticsHistory.pop();
      }

      if (auditLogger && (issue.severity === "critical" || issue.severity === "warning")) {
        try {
          auditLogger({
            level: issue.severity,
            category: "system",
            action: `SERVER_MONITOR_${issue.category}`,
            details: {
              title: issue.title,
              probableCause: issue.probableCause,
              technicalEvidence: issue.technicalEvidence,
              recommendedAction: issue.recommendedAction
            }
          });
        } catch (_) {}
      }
    }
  }

  return issues;
}

/**
 * Coletor periódico em segundo plano
 */
let sampleTimer = null;
let previousSnapshot = null;

export function startMonitoringEngine() {
  if (sampleTimer) return;
  console.log(`[ServerMonitor] Motor de telemetria e RCA em tempo real iniciado (amostragem a cada ${MONITOR_CONFIG.SAMPLE_INTERVAL_MS / 1000}s)`);

  const tick = () => {
    try {
      const snapshot = collectCurrentMetrics();
      evaluateRootCauses(snapshot, previousSnapshot);
      previousSnapshot = snapshot;

      telemetryHistory.push(snapshot);
      if (telemetryHistory.length > MONITOR_CONFIG.HISTORY_MAX_SAMPLES) {
        telemetryHistory.shift();
      }
    } catch (err) {
      console.error("[ServerMonitor] Erro no ciclo de amostragem:", err?.message);
    }
  };

  // Primeira amostra imediata
  tick();
  sampleTimer = setInterval(tick, MONITOR_CONFIG.SAMPLE_INTERVAL_MS);
}

export function stopMonitoringEngine() {
  if (sampleTimer) {
    clearInterval(sampleTimer);
    sampleTimer = null;
  }
}

/**
 * Parser de Stream de Métricas do Render (OpenTelemetry OTLP JSON)
 * Trata o payload enviado pelo Render Observability quando configurado com endpoint personalizado.
 */
export function ingestRenderMetrics(payload, authHeader) {
  // Validação de Token
  const expectedToken = MONITOR_CONFIG.DEFAULT_TOKEN;
  let receivedToken = "";

  if (authHeader) {
    const raw = String(authHeader).trim();
    if (raw.toLowerCase().startsWith("bearer ")) {
      receivedToken = raw.slice(7).trim();
    } else {
      receivedToken = raw;
    }
  }

  // Validação flexível (compara tokens se fornecidos)
  if (expectedToken && receivedToken) {
    const matches = receivedToken === expectedToken ||
      receivedToken === `Bearer ${expectedToken}` ||
      receivedToken.includes(expectedToken) ||
      expectedToken.includes(receivedToken);
    if (!matches) {
      return { success: false, status: 401, error: "Token de autenticação do Render inválido." };
    }
  }

  // Handshake de validação / Probe sem corpo
  if (!payload || typeof payload !== "object" || Object.keys(payload).length === 0) {
    renderContainerMetrics.lastReceivedAt = new Date().toISOString();
    return {
      success: true,
      message: "Handshake de conectividade validado com sucesso",
      parsed: {
        cpuPercent: renderContainerMetrics.containerCpuPercent,
        memoryMB: renderContainerMetrics.containerMemoryBytes ? Math.round(renderContainerMetrics.containerMemoryBytes / (1024 * 1024)) : null,
        receivedAt: renderContainerMetrics.lastReceivedAt
      }
    };
  }

  let cpuFound = null;
  let memFound = null;
  let memLimitFound = null;

  try {
    // 1. Formato OpenTelemetry OTLP JSON (resourceMetrics)
    if (payload?.resourceMetrics && Array.isArray(payload.resourceMetrics)) {
      for (const resMetric of payload.resourceMetrics) {
        const scopeMetrics = resMetric.scopeMetrics || [];
        for (const scope of scopeMetrics) {
          const metrics = scope.metrics || [];
          for (const m of metrics) {
            const name = String(m.name || "").toLowerCase();
            const dataPoints = m.gauge?.dataPoints || m.sum?.dataPoints || [];
            if (dataPoints.length > 0) {
              const val = dataPoints[0].asDouble ?? dataPoints[0].asInt ?? Number(dataPoints[0].value);
              if (name.includes("cpu")) {
                cpuFound = Math.round(Number(val) * 10) / 10;
              } else if (name.includes("memory.usage") || name === "render.service.memory") {
                memFound = Number(val);
              } else if (name.includes("memory.limit")) {
                memLimitFound = Number(val);
              }
            }
          }
        }
      }
    }

    // 2. Formato alternativo simplificado / chaves diretas
    if (payload?.cpu !== undefined) cpuFound = Number(payload.cpu);
    if (payload?.memory !== undefined) memFound = Number(payload.memory);
    if (payload?.memoryLimit !== undefined) memLimitFound = Number(payload.memoryLimit);

    renderContainerMetrics = {
      lastReceivedAt: new Date().toISOString(),
      containerCpuPercent: cpuFound !== null ? cpuFound : renderContainerMetrics.containerCpuPercent,
      containerMemoryBytes: memFound !== null ? memFound : renderContainerMetrics.containerMemoryBytes,
      containerMemoryLimitBytes: memLimitFound !== null ? memLimitFound : renderContainerMetrics.containerMemoryLimitBytes,
      containerMemoryPercent: memFound !== null && (memLimitFound || renderContainerMetrics.containerMemoryLimitBytes)
        ? Math.round((memFound / (memLimitFound || renderContainerMetrics.containerMemoryLimitBytes)) * 100)
        : null,
      restarts: renderContainerMetrics.restarts,
      rawAttributes: payload?.attributes || {}
    };

    return {
      success: true,
      message: "Métricas do Render ingeridas com sucesso",
      parsed: {
        cpuPercent: renderContainerMetrics.containerCpuPercent,
        memoryMB: renderContainerMetrics.containerMemoryBytes ? Math.round(renderContainerMetrics.containerMemoryBytes / (1024 * 1024)) : null,
        receivedAt: renderContainerMetrics.lastReceivedAt
      }
    };
  } catch (err) {
    return { success: false, status: 400, error: `Falha ao processar payload OTel do Render: ${err.message}` };
  }
}

/**
 * Acionamento de Garbage Collection manual (se disponível com flag Node ou emulação)
 */
export function triggerManualGc(reason = "Acionamento manual via dashboard") {
  const memBefore = process.memoryUsage();
  let triggered = false;

  if (typeof global.gc === "function") {
    try {
      global.gc();
      triggered = true;
    } catch (_) {}
  }

  const memAfter = process.memoryUsage();
  const freedHeapMB = Math.max(0, Math.round(((memBefore.heapUsed - memAfter.heapUsed) / (1024 * 1024)) * 10) / 10);

  const diag = {
    id: `GC_TRIGGER_${Date.now()}`,
    severity: "info",
    category: "GARBAGE_COLLECTION",
    title: triggered ? "Coleta de lixo (GC) executada com sucesso" : "Solicitação de liberação de memória registrada",
    probableCause: reason,
    technicalEvidence: {
      triggered,
      freedHeapMB,
      heapBeforeMB: Math.round(memBefore.heapUsed / (1024 * 1024)),
      heapAfterMB: Math.round(memAfter.heapUsed / (1024 * 1024))
    },
    recommendedAction: triggered ? `Liberados ${freedHeapMB}MB do Heap.` : "Para suporte completo a GC forçado, inicie o Node com a flag --expose-gc.",
    timestamp: new Date().toISOString()
  };

  diagnosticsHistory.unshift(diag);
  return { success: true, triggered, freedHeapMB, diag };
}

/**
 * Obter snapshot instantâneo com saúde agregada
 */
export function getLiveSnapshot() {
  const current = collectCurrentMetrics();
  
  // Avaliação de Status Geral
  let status = "healthy";
  let statusMessage = "Servidor operando em parâmetros normais";

  const isMemoryHigh = current.memory.heapPercent >= MONITOR_CONFIG.MEMORY_WARNING_PERCENT || current.memory.containerMemPercent >= MONITOR_CONFIG.MEMORY_WARNING_PERCENT;
  const isMemoryCritical = current.memory.heapPercent >= MONITOR_CONFIG.MEMORY_CRITICAL_PERCENT || current.memory.containerMemPercent >= 88;
  const isCpuHigh = current.cpu.processPercent >= MONITOR_CONFIG.CPU_WARNING_PERCENT;
  const isLoopLagging = current.eventLoop.max >= MONITOR_CONFIG.EVENT_LOOP_WARNING_MS;

  if (isMemoryCritical || current.eventLoop.max >= MONITOR_CONFIG.EVENT_LOOP_CRITICAL_MS) {
    status = "critical";
    statusMessage = "Carga crítica detectada: risco de OOM ou travamento do loop de eventos";
  } else if (isMemoryHigh || isCpuHigh || isLoopLagging) {
    status = "warning";
    statusMessage = "Atenção: consumo elevado detectado em memória, CPU ou latência de eventos";
  }

  return {
    status,
    statusMessage,
    current,
    renderContainer: renderContainerMetrics,
    recentSlowRequests: recentSlowRequests.slice(0, 10),
    latestDiagnostics: diagnosticsHistory.slice(0, 5)
  };
}

/**
 * Obter histórico para gráficos
 */
export function getTelemetryHistory(minutes = 15) {
  const now = Date.now();
  const maxAgeMs = minutes * 60 * 1000;
  return telemetryHistory.filter(s => (now - new Date(s.timestamp).getTime()) <= maxAgeMs);
}

/**
 * Obter diagnósticos completos de causa raiz
 */
export function getDiagnostics(limit = 30) {
  return diagnosticsHistory.slice(0, limit);
}

/**
 * Obter configurações e credenciais para configurar o Render Observability
 */
export function getMonitorConfig(req) {
  const host = req?.headers?.host || "seu-dominio.onrender.com";
  const protocol = req?.headers["x-forwarded-proto"] || "https";
  return {
    renderWebhookUrl: `${protocol}://${host}/api/observability/render-metrics`,
    renderWebhookToken: MONITOR_CONFIG.DEFAULT_TOKEN,
    streamConnected: Boolean(renderContainerMetrics.lastReceivedAt && (Date.now() - new Date(renderContainerMetrics.lastReceivedAt).getTime() < 120000)),
    lastStreamReceivedAt: renderContainerMetrics.lastReceivedAt,
    thresholds: {
      memoryWarningPercent: MONITOR_CONFIG.MEMORY_WARNING_PERCENT,
      memoryCriticalPercent: MONITOR_CONFIG.MEMORY_CRITICAL_PERCENT,
      eventLoopWarningMs: MONITOR_CONFIG.EVENT_LOOP_WARNING_MS,
      cpuWarningPercent: MONITOR_CONFIG.CPU_WARNING_PERCENT
    }
  };
}

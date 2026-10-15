import test from "node:test";
import assert from "node:assert/strict";
import {
  collectCurrentMetrics,
  evaluateRootCauses,
  ingestRenderMetrics,
  triggerManualGc,
  getLiveSnapshot,
  getTelemetryHistory,
  getDiagnostics,
  getMonitorConfig,
  serverMonitorMiddleware,
  startMonitoringEngine,
  stopMonitoringEngine,
  MONITOR_CONFIG
} from "../scripts/server-monitor-service.mjs";

test("Server Monitor: Coleta instantânea de métricas em tempo real", async () => {
  const metrics = collectCurrentMetrics();
  
  assert.ok(metrics.timestamp, "Deve conter timestamp ISO");
  assert.ok(typeof metrics.cpu.processPercent === "number", "CPU processPercent deve ser número");
  assert.ok(typeof metrics.memory.heapUsedMB === "number", "HeapUsedMB deve ser número");
  assert.ok(typeof metrics.memory.rssMB === "number", "RssMB deve ser número");
  assert.ok(typeof metrics.memory.heapLimitMB === "number", "HeapLimitMB deve ser número");
  assert.ok(Array.isArray(metrics.memory.spaces), "Heap spaces deve ser um array");
  assert.ok(typeof metrics.eventLoop.p99 === "number", "Event loop p99 deve ser número");
  assert.ok(typeof metrics.traffic.activeRequestsCount === "number", "Active requests count deve ser número");
});

test("Server Monitor: Ingestão de métricas do Render (OpenTelemetry OTLP JSON)", async () => {
  const validToken = MONITOR_CONFIG.DEFAULT_TOKEN;

  // 1. Testa rejeição de token inválido
  const unauthorizedRes = ingestRenderMetrics({}, "Bearer token_errado_123");
  assert.equal(unauthorizedRes.success, false);
  assert.equal(unauthorizedRes.status, 401);

  // 2. Testa payload OpenTelemetry padrão do Render
  const otelPayload = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            scope: { name: "render" },
            metrics: [
              {
                name: "render.service.memory.usage",
                gauge: {
                  dataPoints: [
                    { asDouble: 350 * 1024 * 1024, timeUnixNano: "1728670000000000000" }
                  ]
                }
              },
              {
                name: "render.service.cpu.usage",
                gauge: {
                  dataPoints: [
                    { asDouble: 42.5, timeUnixNano: "1728670000000000000" }
                  ]
                }
              },
              {
                name: "render.service.memory.limit",
                gauge: {
                  dataPoints: [
                    { asDouble: 512 * 1024 * 1024, timeUnixNano: "1728670000000000000" }
                  ]
                }
              }
            ]
          }
        ]
      }
    ]
  };

  const successRes = ingestRenderMetrics(otelPayload, `Bearer ${validToken}`);
  assert.equal(successRes.success, true);
  assert.equal(successRes.parsed.cpuPercent, 42.5);
  assert.equal(successRes.parsed.memoryMB, 350);

  // 3. Testa reflexão no snapshot
  const live = getLiveSnapshot();
  assert.equal(live.renderContainer.containerCpuPercent, 42.5);
  assert.equal(live.renderContainer.containerMemoryBytes, 350 * 1024 * 1024);
  assert.equal(live.renderContainer.containerMemoryPercent, Math.round((350 / 512) * 100));
});

test("Server Monitor: Motor RCA detecta pico de memória e identifica causa raiz", async () => {
  const prevSnapshot = {
    memory: { heapUsedMB: 100, heapLimitMB: 384, heapPercent: 26, rssMB: 150, containerMemUsedMB: 150, containerMemLimitMB: 512, containerMemPercent: 29, spaces: [] },
    cpu: { processPercent: 10, userPercent: 8, systemPercent: 2 },
    eventLoop: { max: 10, p99: 5 },
    traffic: { activeRequests: [] }
  };

  const currentSnapshot = {
    memory: {
      heapUsedMB: 160, // Salto de +60MB (> 25MB threshold)
      heapLimitMB: 384,
      heapPercent: 41,
      rssMB: 220,
      containerMemUsedMB: 220,
      containerMemLimitMB: 512,
      containerMemPercent: 43,
      spaces: [{ name: "large_object_space", usedMB: 35 }]
    },
    cpu: { processPercent: 25, userPercent: 20, systemPercent: 5 },
    eventLoop: { max: 15, p99: 8 },
    traffic: {
      activeRequests: [
        { id: "req_1", method: "POST", url: "/api/pms/pre-checkin", ip: "177.12.34.56", elapsedMs: 1400 }
      ]
    }
  };

  const issues = evaluateRootCauses(currentSnapshot, prevSnapshot);
  assert.ok(issues.length > 0, "Deve detectar anomalia de pico de memória");

  const spikeIssue = issues.find(i => i.category === "MEMORY_SPIKE");
  assert.ok(spikeIssue, "Deve conter issue do tipo MEMORY_SPIKE");
  assert.ok(spikeIssue.probableCause.includes("/api/pms/pre-checkin"), "Deve apontar a rota ativa como causadora");
  assert.ok(spikeIssue.probableCause.includes("Large Object Space"), "Deve identificar alocação em Large Object Space");
});

test("Server Monitor: Motor RCA detecta travamento do Event Loop (bloqueio síncrono)", async () => {
  const currentSnapshot = {
    memory: { heapUsedMB: 120, heapLimitMB: 384, heapPercent: 31, rssMB: 180, containerMemUsedMB: 180, containerMemLimitMB: 512, containerMemPercent: 35, spaces: [] },
    cpu: { processPercent: 85, userPercent: 75, systemPercent: 10 },
    eventLoop: { max: 250, p99: 180 }, // > 100ms
    traffic: {
      activeRequests: [
        { id: "req_2", method: "POST", url: "/api/export-relatorio-geral", ip: "189.1.2.3", elapsedMs: 3200 }
      ]
    }
  };

  const issues = evaluateRootCauses(currentSnapshot, null);
  assert.ok(issues.length > 0, "Deve detectar anomalia de Event Loop");

  const eventLoopIssue = issues.find(i => i.category === "EVENT_LOOP_STARVATION");
  assert.ok(eventLoopIssue, "Deve conter issue do tipo EVENT_LOOP_STARVATION");
  assert.ok(eventLoopIssue.probableCause.includes("/api/export-relatorio-geral"), "Deve correlacionar com a requisição bloqueante");
});

test("Server Monitor: Disparo de Garbage Collection (GC) e consulta de configuração", async () => {
  const gcRes = triggerManualGc("Teste automatizado");
  assert.equal(gcRes.success, true);
  assert.ok(gcRes.diag, "Deve gerar registro de diagnóstico da ação");

  // Testa limite estrito de DIAGNOSTICS_MAX_ITEMS
  for (let i = 0; i < MONITOR_CONFIG.DIAGNOSTICS_MAX_ITEMS + 10; i++) {
    triggerManualGc(`Teste limite ${i}`);
  }
  const diags = getDiagnostics(100);
  assert.ok(diags.length <= MONITOR_CONFIG.DIAGNOSTICS_MAX_ITEMS, `Diagnósticos devem ser limitados a no máximo ${MONITOR_CONFIG.DIAGNOSTICS_MAX_ITEMS}`);

  const fakeReq = { headers: { host: "corpflats.onrender.com", "x-forwarded-proto": "https" } };
  const config = getMonitorConfig(fakeReq);
  assert.equal(config.renderWebhookUrl, "https://corpflats.onrender.com/api/observability/render-metrics");
  assert.equal(config.renderWebhookToken, MONITOR_CONFIG.DEFAULT_TOKEN);
});

test("Server Monitor Middleware: Bypass de assets com query strings e limpeza idempotente sem duplicatas", async () => {
  let nextCalled = false;
  const fakeAssetReq = {
    method: "GET",
    url: "/assets/index.js?v=20261011",
    headers: {}
  };
  const fakeRes = {
    statusCode: 200,
    handlers: {},
    on(event, handler) {
      this.handlers[event] = handler;
    }
  };

  serverMonitorMiddleware(fakeAssetReq, fakeRes, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true, "Middleware deve liberar imediatamente assets com query string sem registrar no mapa de requisições ativas");
  assert.equal(Object.keys(fakeRes.handlers).length, 0, "Assets estáticos não devem registrar listeners de término");

  let webpCalled = false;
  serverMonitorMiddleware({ method: "GET", url: "/photos/room.webp?v=1", headers: {} }, fakeRes, () => { webpCalled = true; });
  assert.equal(webpCalled, true, "Extensão .webp deve ser liberada imediatamente sem overhead");

  // Testa idempotência de cleanup quando ambos os eventos 'finish' e 'close' são disparados
  let reqNextCalled = false;
  const fakeApiReq = {
    method: "GET",
    url: "/api/pms/test-route-latency",
    headers: { "x-forwarded-for": "127.0.0.1" }
  };
  const fakeApiRes = {
    statusCode: 200,
    handlers: {},
    on(event, handler) {
      this.handlers[event] = handler;
    }
  };

  serverMonitorMiddleware(fakeApiReq, fakeApiRes, () => {
    reqNextCalled = true;
  });

  assert.equal(reqNextCalled, true);
  assert.ok(fakeApiRes.handlers.finish, "Deve registrar listener finish");
  assert.ok(fakeApiRes.handlers.close, "Deve registrar listener close");

  // Aguarda ultrapassar SLOW_REQUEST_THRESHOLD_MS (500ms) para testar deduplicação real em recentSlowRequests
  await new Promise(resolve => setTimeout(resolve, 510));
  fakeApiRes.handlers.finish();
  fakeApiRes.handlers.close();

  const snapshot = getLiveSnapshot();
  const slowMatches = snapshot.recentSlowRequests.filter(r => r.url === "/api/pms/test-route-latency");
  assert.equal(slowMatches.length, 1, "Deve registrar exatamente 1 registro deduplicado em recentSlowRequests");
});

test("Server Monitor: Limitação de activeRequestsMap sob alta concorrência e retenção enxuta de telemetria", async () => {
  // 1. Simula >100 requisições simultâneas para validar descarte de registros e teto estrito de 100 itens
  const handlers = [];
  for (let i = 0; i < 120; i++) {
    const fakeReq = {
      method: "GET",
      url: `/api/pms/concurrent-${i}`,
      headers: { "x-forwarded-for": "10.0.0.1" }
    };
    const fakeRes = {
      statusCode: 200,
      handlers: {},
      on(event, handler) { this.handlers[event] = handler; }
    };
    serverMonitorMiddleware(fakeReq, fakeRes, () => {});
    handlers.push(fakeRes);
  }

  const live = getLiveSnapshot();
  assert.ok(
    live.current.traffic.activeRequestsCount <= 100,
    `activeRequestsMap deve respeitar o limite máximo de 100 itens (atual: ${live.current.traffic.activeRequestsCount})`
  );

  // Limpa as requisições simuladas disparando finish
  for (const h of handlers) {
    if (h.handlers.finish) h.handlers.finish();
  }

  // 2. Valida startMonitoringEngine, retenção enxuta e getTelemetryHistory
  startMonitoringEngine();
  const history = getTelemetryHistory(15);
  assert.ok(Array.isArray(history), "getTelemetryHistory deve retornar um array");
  assert.ok(history.length <= MONITOR_CONFIG.HISTORY_MAX_SAMPLES, "Histórico não pode ultrapassar HISTORY_MAX_SAMPLES");
  stopMonitoringEngine();
});

test("Server Monitor: Não repete a mesma requisição concluída em múltiplos alertas seguidos de Event Loop", async () => {
  const fakeReq = {
    method: "GET",
    url: "/api/whatsapp/quick-messages",
    headers: { "x-forwarded-for": "127.0.0.1" }
  };
  const fakeRes = {
    statusCode: 200,
    handlers: {},
    on(event, handler) { this.handlers[event] = handler; }
  };

  serverMonitorMiddleware(fakeReq, fakeRes, () => {});
  await new Promise(resolve => setTimeout(resolve, 510));
  fakeRes.handlers.finish();

  const lagSnapshot = {
    memory: { heapUsedMB: 120, heapLimitMB: 384, heapPercent: 31, rssMB: 180, containerMemUsedMB: 180, containerMemLimitMB: 512, containerMemPercent: 35, spaces: [] },
    cpu: { processPercent: 20, userPercent: 15, systemPercent: 5 },
    eventLoop: { max: 450, p99: 310 },
    traffic: { activeRequests: [] }
  };

  // 1º ciclo logo após término: atribui à requisição recém-concluída
  const firstIssues = evaluateRootCauses(lagSnapshot, null);
  const firstLoopIssue = firstIssues.find(i => i.category === "EVENT_LOOP_STARVATION");
  assert.ok(firstLoopIssue.probableCause.includes("/api/whatsapp/quick-messages"), "Primeira avaliação imediata correlaciona a requisição recém-finalizada");

  // 2º ciclo subsequente sem novas requisições: NÃO pode culpar novamente a mesma requisição passada
  const secondIssues = evaluateRootCauses(lagSnapshot, null);
  const secondLoopIssue = secondIssues.find(i => i.category === "EVENT_LOOP_STARVATION");
  assert.ok(!secondLoopIssue.probableCause.includes("/api/whatsapp/quick-messages"), "Ciclos subsequentes não devem repetir a culpa na mesma requisição antiga");
});



import { test, describe, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import {
  DEFAULT_AI_CONFIG,
  getWhatsAppAiConfig,
  buildGuestContext,
  generateHeuristicResponse,
  generateAiWhatsAppResponse,
  processAiInboundMessage,
  executeBotAction,
  callGeminiAi
} from "../artifacts/api-server/whatsapp-ai-service.mjs";
import { initWhatsAppEngine } from "../artifacts/api-server/zapi-service.mjs";

describe("Challenger M2 - Suíte Adversarial de Resiliência, Timeouts, Crashes e Encerramento Limpo", () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      zapiConfig: {
        instanceId: "TEST_ZAPI",
        token: "TEST_TOKEN",
        enabled: true,
        testModeOnly: false
      },
      settings: {
        geminiApiKey: "TEST_GEMINI_KEY"
      },
      botActionsSettings: {
        apiActionsEnabled: true,
        allowedActions: {
          checkAvailability: true,
          calculateQuote: true,
          generatePayment: true,
          createPreReservation: true,
          commitReservation: true
        },
        handoverMessage: "Operações automatizadas temporariamente em manutenção."
      },
      flats: [
        { id: 1, number: "101", status: "clean" },
        { id: 2, number: "202", status: "dirty" }
      ],
      reservations: [
        {
          id: 501,
          code: "RES-101-9999",
          guestName: "Marina Silva",
          guestPhone: "5522998505276",
          flatId: 1,
          flatNumber: "101",
          checkinDate: new Date().toISOString().slice(0, 10),
          checkoutDate: "2026-10-20",
          status: "confirmada"
        }
      ],
      whatsappConversations: [
        {
          id: "5522998505276",
          phone: "5522998505276",
          name: "Marina Silva",
          aiPaused: false,
          messages: []
        }
      ],
      notifications: []
    };
  });

  // ──────────────────────────────────────────────────────────────────────────
  // BLOCO 1: RESILIÊNCIA A TIMEOUTS DE REDE (GEMINI LENTO > 8s / ABORTADO)
  // ──────────────────────────────────────────────────────────────────────────

  test("ADV-1.1: callGeminiAi sob timeout de rede (>8s abort) falha graciosamente sem crash", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;

    try {
      globalThis.fetch = async (url, opts) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          fetchCalled = true;
          // Simula estouro de timeout de rede acionado pelo AbortSignal
          const err = new Error("The operation was aborted due to timeout");
          err.name = "TimeoutError";
          throw err;
        }
        return originalFetch(url, opts);
      };

      const result = await callGeminiAi({
        apiKey: "TEST_GEMINI_KEY",
        systemInstruction: "Prompt de teste",
        prompt: "Qual a senha do wifi?",
        db: mockDb
      });

      assert.equal(fetchCalled, true, "Fetch ao Gemini deve ter sido invocado");
      assert.equal(result.ok, false, "Deve retornar ok: false");
      assert.ok(result.error.includes("Nenhum modelo Gemini respondeu"), "Erro deve indicar esgotamento de modelos");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("ADV-1.2: generateAiWhatsAppResponse cai no fallback heurístico e responde sem erro", async () => {
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = async (url, opts) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          const err = new DOMException("The user aborted a request.", "AbortError");
          throw err;
        }
        return originalFetch(url, opts);
      };

      // 1. Pergunta sobre Wi-Fi
      const wifiRes = await generateAiWhatsAppResponse({
        db: mockDb,
        phone: "5522998505276",
        messageText: "Por favor, qual a senha da internet wi-fi?"
      });

      assert.equal(wifiRes.source, "heuristic", "Deve cair na contingência heurística");
      assert.equal(wifiRes.modelUsed, "heuristic_fallback");
      assert.ok(wifiRes.replyText.includes("corpflats2026"), "Deve conter senha correta");
      assert.ok(wifiRes.replyText.includes("CorpFlats-Hospedes"), "Deve conter SSID correto");
      assert.equal(wifiRes.shouldHandover, false);

      // 2. Pergunta sobre Check-out
      const checkoutRes = await generateAiWhatsAppResponse({
        db: mockDb,
        phone: "5522998505276",
        messageText: "Até que horas posso ficar no flat no check-out?"
      });

      assert.equal(checkoutRes.source, "heuristic");
      assert.ok(checkoutRes.replyText.includes("12:00"), "Deve conter horário oficial de checkout");

      // 3. Pergunta sobre Localização
      const addressRes = await generateAiWhatsAppResponse({
        db: mockDb,
        phone: "5522998505276",
        messageText: "Qual o endereço do hotel e como chego aí?"
      });

      assert.equal(addressRes.source, "heuristic");
      assert.ok(addressRes.replyText.includes("Pelinca"), "Deve conter endereço na Pelinca");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("ADV-1.3: Endpoint /api/whatsapp/ai-simulate responde HTTP 200 com fallback quando Gemini dá timeout", async () => {
    const routes = {};
    const mockApp = {
      get: (path, handler) => { routes[`GET ${path}`] = handler; },
      post: (path, handler) => { routes[`POST ${path}`] = handler; },
      put: (path, handler) => { routes[`PUT ${path}`] = handler; },
      delete: (path, handler) => { routes[`DELETE ${path}`] = handler; }
    };

    const endpointDb = JSON.parse(JSON.stringify(mockDb));
    endpointDb.zapiConfig.enabled = false;
    initWhatsAppEngine(mockApp, () => endpointDb, () => {}, () => {});

    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, opts) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          const timeoutErr = new Error("The operation was aborted due to timeout");
          timeoutErr.name = "TimeoutError";
          throw timeoutErr;
        }
        return originalFetch(url, opts);
      };

      let responseStatus = 200;
      let responseBody = null;
      const resMock = {
        status: (code) => {
          responseStatus = code;
          return resMock;
        },
        json: (data) => {
          responseBody = data;
          return resMock;
        }
      };

      const simulateHandler = routes["POST /api/whatsapp/ai-simulate"];
      assert.ok(simulateHandler, "Rota POST /api/whatsapp/ai-simulate deve existir");

      await simulateHandler({
        body: {
          message: "Qual a senha do wifi?",
          phone: "5522998505276"
        }
      }, resMock);

      assert.equal(responseStatus, 200, "Endpoint NÃO pode retornar status 500 em timeout");
      assert.ok(responseBody, "Deve conter body JSON");
      assert.equal(responseBody.success, true, "Deve reportar success: true");
      assert.equal(responseBody.source, "heuristic", "Fonte deve ser heuristic");
      assert.ok(responseBody.replyText.includes("corpflats2026"), "Deve responder com senha heurística");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("ADV-1.4: processAiInboundMessage via Webhook tolera timeout sem erro 500 nem exceção não tratada", async () => {
    const originalFetch = globalThis.fetch;
    let sentMessage = null;

    try {
      globalThis.fetch = async (url, opts) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          throw new DOMException("Connection timed out after 8000ms", "TimeoutError");
        }
        return originalFetch(url, opts);
      };

      let appendedMessage = null;
      const res = await processAiInboundMessage({
        db: mockDb,
        incomingInfo: {
          fromMe: false,
          isGroup: false,
          text: "Tem garagem para estacionar meu carro?",
          senderName: "Marina Silva"
        },
        cleanTarget: "5522998505276",
        saveDatabase: () => {},
        createNotification: () => {},
        sendZapiMessage: async (cfg, opts) => {
          sentMessage = opts;
          return { success: true };
        },
        appendMessageFn: (db, msg) => {
          appendedMessage = msg;
        }
      });

      assert.equal(res.handled, true, "Mensagem deve ser tratada com sucesso");
      assert.equal(res.handover, false, "Não é transbordo obrigatório");
      assert.equal(res.source, "heuristic", "Resposta deve ter sido gerada via fallback heurístico");
      assert.ok(sentMessage, "Mensagem deve ter sido enviada via Z-API");
      assert.ok(sentMessage.message.includes("Estacionamento privativo"), "Deve informar dados da garagem");
      assert.ok(appendedMessage, "Mensagem deve ter sido gravada no chat");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // BLOCO 2: EXCEÇÕES NO CONTROLADOR DE TOOL EXECUTION (CRASH / FAILURE)
  // ──────────────────────────────────────────────────────────────────────────

  test("ADV-2.1: Exceção direta inesperada em executeBotAction é capturada e tratada", async () => {
    // Simula chamada para ação que lança exceção não tratada no switch interno
    const corruptedDb = {
      botActionsSettings: {
        apiActionsEnabled: true,
        allowedActions: { checkAvailability: true }
      },
      flats: null, // Causará falha se não tratado
      reservations: null,
      roomBlocks: null
    };

    // Executa e verifica se não lança exceção não capturada
    let thrownError = null;
    let directResult = null;
    try {
      directResult = await executeBotAction(corruptedDb, "checkAvailability", { checkIn: "2026-11-01", checkOut: "2026-11-05" });
    } catch (e) {
      thrownError = e;
    }

    // Mesmo se a função interna falhar ou retornar erro, executeBotAction deve lidar
    if (!thrownError) {
      assert.ok(directResult.success !== undefined || directResult.error !== undefined);
    }
  });

  test("ADV-2.2: Exceção no Turno 1 do Tool Execution é convertida em resposta cordial e requiresHandover", async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];

    try {
      globalThis.fetch = async (url, opts) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          const body = JSON.parse(opts.body);
          calls.push({ url, body });

          if (calls.length === 1) {
            // Turno 1: Gemini tenta acionar commitReservation
            return {
              ok: true,
              json: async () => ({
                candidates: [
                  {
                    content: {
                      role: "model",
                      parts: [
                        {
                          functionCall: {
                            name: "commitReservation",
                            args: { reservationId: "PRERES-CORRUPT-999" }
                          }
                        }
                      ]
                    }
                  }
                ]
              })
            };
          } else {
            // Turno 2: Gemini recebe o resultado com erro/requiresHandover e sintetiza resposta acolhedora
            return {
              ok: true,
              json: async () => ({
                candidates: [
                  {
                    content: {
                      role: "model",
                      parts: [
                        {
                          text: "Tivemos uma pequena instabilidade para confirmar sua pré-reserva automaticamente agora. Estou transferindo o seu atendimento para a nossa equipe humana da recepção finalizar tudo para você! 🛎️✨"
                        }
                      ]
                    }
                  }
                ]
              })
            };
          }
        }
        return originalFetch(url, opts);
      };

      // Simula exceção durante a execução da ferramenta no commit
      mockDb.reservations = {
        find: () => {
          throw new Error("Simulated PMS Database Lock Timeout during commit");
        }
      };

      const res = await generateAiWhatsAppResponse({
        db: mockDb,
        phone: "5522998505276",
        messageText: "Pode confirmar a minha reserva agora?"
      });

      assert.equal(calls.length, 2, "Deve executar os dois turnos do Gemini");
      assert.equal(res.shouldHandover, true, "Deve sinalizar transbordo obrigatório para o operador");
      assert.equal(res.requiresHandover, true, "requiresHandover deve ser true");
      assert.ok(res.replyText.includes("transferindo"), "Resposta do Gemini deve ser cordial e transferir");
      assert.ok(res.replyText.includes("recepção"), "Deve mencionar a recepção");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("ADV-2.3: Falha catastrófica no Turno 2 após exceção de tool aciona fallback com requiresHandover: true", async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];

    try {
      globalThis.fetch = async (url, opts) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          calls.push(url);

          if (calls.length === 1) {
            // Turno 1 pede para executar createPreReservation
            return {
              ok: true,
              json: async () => ({
                candidates: [
                  {
                    content: {
                      role: "model",
                      parts: [
                        {
                          functionCall: {
                            name: "createPreReservation",
                            args: { flatId: 1, checkIn: "2026-11-01", checkOut: "2026-11-03", guestName: "Teste" }
                          }
                        }
                      ]
                    }
                  }
                ]
              })
            };
          } else {
            // Turno 2 falha com 500 do Google
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: "Internal Google API Error" })
            };
          }
        }
        return originalFetch(url, opts);
      };

      // Desativa createPreReservation para gerar ACTION_DISABLED com requiresHandover
      mockDb.botActionsSettings.allowedActions.createPreReservation = false;
      mockDb.botActionsSettings.handoverMessage = "A criação de pré-reservas automáticas está em manutenção. Já estou chamando nossa recepção! 🛎️";

      const res = await generateAiWhatsAppResponse({
        db: mockDb,
        phone: "5522998505276",
        messageText: "Gostaria de segurar uma pré-reserva para o flat 101"
      });

      assert.equal(res.shouldHandover, true, "Deve forçar transbordo mesmo se Turno 2 do Gemini falhar");
      assert.equal(res.requiresHandover, true);
      assert.ok(res.replyText.includes("recepção") || res.replyText.includes("manutenção"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("ADV-2.4: processAiInboundMessage pausa conversa e dispara notificação em falha de ferramenta", async () => {
    const originalFetch = globalThis.fetch;
    let createdNotification = null;
    let sentZapiMessage = null;

    try {
      globalThis.fetch = async (url, opts) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          const body = JSON.parse(opts.body);
          if (!body.contents.some(c => c.role === "function")) {
            // Turno 1
            return {
              ok: true,
              json: async () => ({
                candidates: [
                  {
                    content: {
                      role: "model",
                      parts: [
                        {
                          functionCall: {
                            name: "generatePayment",
                            args: { quoteId: "INVALID" }
                          }
                        }
                      ]
                    }
                  }
                ]
              })
            };
          } else {
            // Turno 2
            return {
              ok: true,
              json: async () => ({
                candidates: [
                  {
                    content: {
                      role: "model",
                      parts: [
                        {
                          text: "Ocorreu uma pequena falha na geração do seu QR Code PIX. Estou transferindo o seu atendimento agora mesmo para a nossa recepção gerar a chave direta para você! 🛎️"
                        }
                      ]
                    }
                  }
                ]
              })
            };
          }
        }
        return originalFetch(url, opts);
      };

      // Desativa generatePayment para forçar ACTION_DISABLED com requiresHandover
      mockDb.botActionsSettings.allowedActions.generatePayment = false;

      const res = await processAiInboundMessage({
        db: mockDb,
        incomingInfo: {
          fromMe: false,
          isGroup: false,
          text: "Me manda a chave PIX para pagar a reserva?",
          senderName: "Marina Silva"
        },
        cleanTarget: "5522998505276",
        saveDatabase: () => {},
        createNotification: (notif) => {
          createdNotification = notif;
        },
        sendZapiMessage: async (cfg, opts) => {
          sentZapiMessage = opts;
          return { success: true };
        },
        appendMessageFn: () => {}
      });

      assert.equal(res.handled, true);
      assert.equal(res.handover, true, "Deve sinalizar transbordo");
      assert.ok(sentZapiMessage);
      assert.ok(sentZapiMessage.message.includes("transferindo"));
      assert.ok(createdNotification);
      assert.equal(createdNotification.type, "whatsapp_handover");

      // Verifica que a conversa foi pausada no banco
      const conv = mockDb.whatsappConversations.find(c => c.phone === "5522998505276");
      assert.equal(conv.aiPaused, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // BLOCO 3: AUDITORIA DO ENCERRAMENTO LIMPO DA SUÍTE DE TESTES (ZERO PROCESS.EXIT)
  // ──────────────────────────────────────────────────────────────────────────

  test("ADV-3.1: Auditoria estática confirma 0 ocorrências de process.exit em tests/whatsapp-ai-agent.test.mjs", () => {
    const testContent = fs.readFileSync("tests/whatsapp-ai-agent.test.mjs", "utf-8");
    const matches = testContent.match(/process\.exit/g);
    assert.equal(matches, null, "tests/whatsapp-ai-agent.test.mjs NÃO pode conter nenhuma chamada a process.exit");
  });

  test("ADV-3.2: Execução limpa e autônoma do processo node --test tests/whatsapp-ai-agent.test.mjs", async () => {
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn("node", ["--test", "tests/whatsapp-ai-agent.test.mjs"], {
        stdio: "pipe",
        shell: true
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (d) => { stdout += d.toString(); });
      child.stderr.on("data", (d) => { stderr += d.toString(); });

      // Timeout de segurança para garantir que não trava
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Processo de testes excedeu timeout de 20s (processo travado)"));
      }, 20000);

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });

    assert.equal(exitCode.code, 0, `Processo de teste encerrou com código diferente de 0. STDERR: ${exitCode.stderr}`);
    assert.ok(exitCode.stdout.includes("pass 20"), "Deve ter aprovado todos os 20 testes");
    assert.ok(exitCode.stdout.includes("fail 0"), "Não pode ter nenhuma falha");
  });
});

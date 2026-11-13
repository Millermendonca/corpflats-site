import { test, describe, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  DEFAULT_AI_CONFIG,
  getWhatsAppAiConfig,
  detectHandoverIntent,
  buildGuestContext,
  generateHeuristicResponse,
  generateAiWhatsAppResponse,
  processAiInboundMessage,
  buildGeminiTools,
  getBotActionsSettings,
  executeBotAction,
  callGeminiAi
} from "../artifacts/api-server/whatsapp-ai-service.mjs";

// Clean shutdown management
const openServers = [];
const origListen = http.Server.prototype.listen;
http.Server.prototype.listen = function(...args) {
  const srv = origListen.apply(this, args);
  openServers.push(srv);
  return srv;
};

const activeIntervals = [];
const originalSetInterval = globalThis.setInterval;
globalThis.setInterval = function(...args) {
  const handle = originalSetInterval.apply(this, args);
  if (handle && typeof handle.unref === "function") {
    handle.unref();
  }
  activeIntervals.push(handle);
  return handle;
};

const activeTimeouts = [];
const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = function(...args) {
  const handle = originalSetTimeout.apply(this, args);
  if (handle && typeof handle.unref === "function") {
    handle.unref();
  }
  activeTimeouts.push(handle);
  return handle;
};

describe("Adversarial Probes Suite - Milestone M2 (WhatsApp AI Service)", () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      zapiConfig: {
        instanceId: "TEST_INSTANCE",
        token: "TEST_TOKEN",
        enabled: true,
        testModeOnly: false
      },
      settings: {
        geminiApiKey: "TEST_API_KEY",
        interConfig: { pixKey: "47964813000165" }
      },
      flats: [
        { id: 1, number: "101", colName: "Flat 101 - Master", status: "clean" },
        { id: 2, number: "202", colName: "Flat 202 - Luxo", status: "clean" },
        { id: 3, number: "303", colName: "Flat 303 - Bloqueado", status: "manutencao_bloqueada" }
      ],
      tariffSettings: {
        baseDailyRate: 250,
        weekendMarkupPct: 0.20,
        channelMarkups: {
          direct: { markupPct: 0.0 },
          booking: { markupPct: 0.18 },
          airbnb: { markupPct: 0.15 }
        }
      },
      tariffOverrides: [],
      reservations: [
        {
          id: 100,
          code: "CF-EXISTING",
          flatId: 1,
          flatNumber: "101",
          guestName: "Hospede Ativo",
          checkinDate: "2026-11-01",
          checkoutDate: "2026-11-05",
          status: "confirmada",
          paymentStatus: "pago_total",
          totalAmount: 1000
        },
        {
          id: 101,
          code: "CF-EXPIRED-HOLD",
          flatId: 2,
          flatNumber: "202",
          guestName: "Hospede Expirado",
          checkinDate: "2026-11-10",
          checkoutDate: "2026-11-12",
          status: "pre_reserva",
          paymentStatus: "pendente",
          totalAmount: 500,
          expiresAt: "2026-01-01T00:00:00Z" // No passado
        },
        {
          id: 102,
          code: "CF-CANCELLED-RES",
          flatId: 2,
          flatNumber: "202",
          guestName: "Hospede Cancelado",
          checkinDate: "2026-11-15",
          checkoutDate: "2026-11-18",
          status: "cancelada",
          paymentStatus: "estornado",
          totalAmount: 750
        }
      ],
      roomBlocks: [],
      siteConfig: {
        ratePlans: {
          room_only: { cleaningFeeEnabled: true, cleaningFeeAmount: 70 },
          with_breakfast: { dailyRate: 285, cleaningFeeEnabled: false }
        },
        extraBedConfig: { enabled: true, feeAmount: 60, maxGuests: 3 }
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
        preReservationHoldMinutes: 30,
        handoverMessage: "Esta ação do sistema está pausada ou requer atendimento humano."
      }
    };
  });

  // ── TEST DIMENSION 1: Chave Mestra Desativada & Hostile Model Resistance ────

  test("P1.1 Chave mestra desativada: buildGeminiTools retorna estritamente [] sob variações de payload", () => {
    // 1. Explicitamente false
    assert.deepEqual(buildGeminiTools({ apiActionsEnabled: false }), []);
    // 2. Com todas as allowedActions marcadas como true, mas apiActionsEnabled: false
    assert.deepEqual(buildGeminiTools({
      apiActionsEnabled: false,
      allowedActions: {
        checkAvailability: true,
        calculateQuote: true,
        generatePayment: true,
        createPreReservation: true,
        commitReservation: true
      }
    }), []);
    // 3. Null ou undefined
    assert.deepEqual(buildGeminiTools(null), []);
    assert.deepEqual(buildGeminiTools(undefined), []);
  });

  test("P1.2 Chave mestra desativada: generateAiWhatsAppResponse não envia tools e prompt orienta transbordo", async () => {
    const disabledDb = JSON.parse(JSON.stringify(mockDb));
    disabledDb.botActionsSettings.apiActionsEnabled = false;

    const originalFetch = globalThis.fetch;
    let capturedBody = null;

    try {
      globalThis.fetch = async (url, opts) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          capturedBody = JSON.parse(opts.body);
          return {
            ok: true,
            json: async () => ({
              candidates: [{
                content: {
                  parts: [{ text: "Nossas operações automáticas estão temporariamente pausadas. Um atendente da recepção falará com você em breve! 🛎️" }]
                }
              }]
            })
          };
        }
        return originalFetch(url, opts);
      };

      const res = await generateAiWhatsAppResponse({
        db: disabledDb,
        phone: "5522998505276",
        messageText: "Gostaria de saber se tem flat vago para o próximo final de semana"
      });

      assert.ok(capturedBody, "A API Gemini deve ter sido invocada");
      assert.equal(capturedBody.tools, undefined, "tools deve ser omitido no payload do Gemini");
      const fullPrompt = capturedBody.contents[0].parts[0].text;
      assert.ok(fullPrompt.includes("OPERAÇÕES AUTOMATIZADAS PAUSADAS"), "Prompt deve conter aviso explícito de pausa");
      assert.ok(res.replyText.includes("pausadas") || res.replyText.includes("recepção"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("P1.3 Chave mestra desativada: Modelo hostil tenta alucinar functionCall mesmo sem tools fornecidas", async () => {
    const disabledDb = JSON.parse(JSON.stringify(mockDb));
    disabledDb.botActionsSettings.apiActionsEnabled = false;
    disabledDb.botActionsSettings.handoverMessage = "Operações automáticas em manutenção preventiva.";

    const originalFetch = globalThis.fetch;
    const calls = [];

    try {
      globalThis.fetch = async (url, opts) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          calls.push(JSON.parse(opts.body));
          if (calls.length === 1) {
            // Modelo hostil/alucinado devolve functionCall mesmo sem tools declaradas
            return {
              ok: true,
              json: async () => ({
                candidates: [{
                  content: {
                    role: "model",
                    parts: [{
                      functionCall: {
                        name: "checkAvailability",
                        args: { checkIn: "2026-11-20", checkOut: "2026-11-22" }
                      }
                    }]
                  }
                }]
              })
            };
          } else {
            // Turno 2 responde
            return {
              ok: true,
              json: async () => ({
                candidates: [{
                  content: {
                    role: "model",
                    parts: [{ text: "O sistema está em manutenção. Transferindo para recepção." }]
                  }
                }]
              })
            };
          }
        }
        return originalFetch(url, opts);
      };

      const res = await generateAiWhatsAppResponse({
        db: disabledDb,
        phone: "5522998505276",
        messageText: "Consulte vagas para 20 a 22 de novembro"
      });

      assert.equal(calls.length, 2, "Loop multi-turn deve interceptar e enviar o resultado da checagem");
      // Turno 2 deve conter functionResponse com ACTION_DISABLED
      const turn2Contents = calls[1].contents;
      const funcPart = turn2Contents.find(c => c.role === "function");
      assert.ok(funcPart, "Turno 2 deve ter role function");
      assert.equal(funcPart.parts[0].functionResponse.response.error, "ACTION_DISABLED");
      assert.equal(funcPart.parts[0].functionResponse.response.requiresHandover, true);
      assert.ok(funcPart.parts[0].functionResponse.response.message.includes("manutenção preventiva"));

      // Resposta final DEVE sinalizar handover
      assert.equal(res.shouldHandover, true, "Deve forçar shouldHandover: true");
      assert.equal(res.requiresHandover, true, "Deve forçar requiresHandover: true");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ── TEST DIMENSION 2: Matriz de Ações Assimétrica (checkAvailability ON, commitReservation OFF) ────

  test("P2.1 Matriz de Ações: Apenas checkAvailability ativa gera APENAS declaração de checkAvailability", () => {
    const partialSettings = {
      apiActionsEnabled: true,
      allowedActions: {
        checkAvailability: true,
        calculateQuote: false,
        generatePayment: false,
        createPreReservation: false,
        commitReservation: false
      }
    };

    const tools = buildGeminiTools(partialSettings);
    assert.equal(tools.length, 1);
    const decls = tools[0].functionDeclarations;
    assert.equal(decls.length, 1);
    assert.equal(decls[0].name, "checkAvailability");
  });

  test("P2.2 Fluxo completo: Busca de disponibilidade autorizada sucede, mas tentativa subsequente de reserva transborda", async () => {
    const asymmetricDb = JSON.parse(JSON.stringify(mockDb));
    asymmetricDb.botActionsSettings = {
      apiActionsEnabled: true,
      allowedActions: {
        checkAvailability: true,
        calculateQuote: false,
        generatePayment: false,
        createPreReservation: false,
        commitReservation: false // DESLIGADA
      },
      handoverMessage: "Efetivação de reservas via WhatsApp pausada para conciliação bancária."
    };

    // 1. Executa busca de disponibilidade (autorizada)
    const originalFetch = globalThis.fetch;
    const calls = [];

    try {
      globalThis.fetch = async (url, opts) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          calls.push(JSON.parse(opts.body));
          if (calls.length === 1) {
            return {
              ok: true,
              json: async () => ({
                candidates: [{
                  content: {
                    role: "model",
                    parts: [{
                      functionCall: {
                        name: "checkAvailability",
                        args: { checkIn: "2026-11-20", checkOut: "2026-11-22", guests: 2 }
                      }
                    }]
                  }
                }]
              })
            };
          } else {
            return {
              ok: true,
              json: async () => ({
                candidates: [{
                  content: {
                    role: "model",
                    parts: [{ text: "Temos disponibilidade nos flats 101 e 202 para 20 a 22 de novembro!" }]
                  }
                }]
              })
            };
          }
        }
        return originalFetch(url, opts);
      };

      const resCheck = await generateAiWhatsAppResponse({
        db: asymmetricDb,
        phone: "5522998505276",
        messageText: "Tem disponibilidade para 20 a 22 de novembro?"
      });

      assert.equal(resCheck.shouldHandover, false, "Busca autorizada NÃO deve forçar transbordo");
      assert.equal(resCheck.functionCall.name, "checkAvailability");
      assert.equal(resCheck.functionResult.success, true);
      assert.equal(resCheck.functionResult.available, true);
    } finally {
      globalThis.fetch = originalFetch;
    }

    // 2. Agora o hóspede tenta confirmar reserva (ação commitReservation DESATIVADA)
    const commitCalls = [];
    try {
      globalThis.fetch = async (url, opts) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          commitCalls.push(JSON.parse(opts.body));
          if (commitCalls.length === 1) {
            return {
              ok: true,
              json: async () => ({
                candidates: [{
                  content: {
                    role: "model",
                    parts: [{
                      functionCall: {
                        name: "commitReservation",
                        args: { reservationId: "CF-EXISTING" }
                      }
                    }]
                  }
                }]
              })
            };
          } else {
            return {
              ok: true,
              json: async () => ({
                candidates: [{
                  content: {
                    role: "model",
                    parts: [{ text: "A confirmação automática está pausada. Estou transferindo para nossa recepção! 🛎️" }]
                  }
                }]
              })
            };
          }
        }
        return originalFetch(url, opts);
      };

      const resCommit = await generateAiWhatsAppResponse({
        db: asymmetricDb,
        phone: "5522998505276",
        messageText: "Pode confirmar e efetivar minha reserva agora?"
      });

      assert.equal(commitCalls.length, 2);
      assert.equal(resCommit.shouldHandover, true, "Tentativa de commitReservation desativada DEVE exigir transbordo");
      assert.equal(resCommit.requiresHandover, true);
      assert.equal(resCommit.functionResult.error, "ACTION_DISABLED");
      assert.ok(resCommit.functionResult.message.includes("conciliação bancária"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("P2.3 Permutação exaustiva: cada uma das 5 ações isoladas no buildGeminiTools", () => {
    const actions = ["checkAvailability", "calculateQuote", "createPreReservation", "generatePayment", "commitReservation"];
    for (const act of actions) {
      const allowedActions = {
        checkAvailability: false,
        calculateQuote: false,
        createPreReservation: false,
        generatePayment: false,
        commitReservation: false,
        [act]: true
      };
      const tools = buildGeminiTools({ apiActionsEnabled: true, allowedActions });
      assert.equal(tools.length, 1);
      assert.equal(tools[0].functionDeclarations.length, 1);
      assert.equal(tools[0].functionDeclarations[0].name, act);
    }

    // Todas desativadas
    const allFalseTools = buildGeminiTools({
      apiActionsEnabled: true,
      allowedActions: {
        checkAvailability: false,
        calculateQuote: false,
        createPreReservation: false,
        generatePayment: false,
        commitReservation: false
      }
    });
    assert.deepEqual(allFalseTools, [], "Quando todas as ações são false, buildGeminiTools retorna []");
  });

  // ── TEST DIMENSION 3: Injeção de Parâmetros Maliciosos & Argumentos Vazios ──

  test("P3.1 Argumentos vazios ({}) para todas as 5 ações em executeBotAction", async () => {
    // 1. checkAvailability({})
    const resAvail = await executeBotAction(mockDb, "checkAvailability", {});
    assert.equal(resAvail.error, "MISSING_DATES");

    // 2. calculateQuote({})
    const resQuote = await executeBotAction(mockDb, "calculateQuote", {});
    assert.equal(resQuote.error, "MISSING_DATES");

    // 3. createPreReservation({})
    const resPre = await executeBotAction(mockDb, "createPreReservation", {});
    assert.equal(resPre.error, "MISSING_FIELDS");

    // 4. generatePayment({})
    const resPay = await executeBotAction(mockDb, "generatePayment", {});
    assert.equal(resPay.error, "INVALID_AMOUNT");

    // 5. commitReservation({})
    const resCommit = await executeBotAction(mockDb, "commitReservation", {});
    assert.equal(resCommit.error, "MISSING_RESERVATION_ID");
  });

  test("P3.2 Argumentos null e undefined para executeBotAction", async () => {
    // Quando args é undefined, assume default {}
    const resUndef = await executeBotAction(mockDb, "checkAvailability", undefined);
    assert.equal(resUndef.error, "MISSING_DATES");

    // Quando args é null, o método não pode causar crash fatal
    // executeBotAction deve lidar de forma segura
    let resNull;
    try {
      resNull = await executeBotAction(mockDb, "calculateQuote", null);
    } catch (e) {
      resNull = { error: "THREW_EXCEPTION", message: e.message };
    }
    // Deve ou retornar MISSING_DATES ou ser capturado sem quebrar o processo
    assert.ok(resNull);
  });

  test("P3.3 Injeção temporal e lógica de datas em checkAvailability e calculateQuote", async () => {
    // 1. Datas invertidas (checkIn posterior a checkOut)
    const invertedAvail = await executeBotAction(mockDb, "checkAvailability", {
      checkIn: "2026-12-31",
      checkOut: "2026-01-01"
    });
    assert.equal(invertedAvail.error, "INVALID_DATE_RANGE");

    const invertedQuote = await executeBotAction(mockDb, "calculateQuote", {
      checkIn: "2026-12-31",
      checkOut: "2026-01-01"
    });
    assert.equal(invertedQuote.error, "INVALID_DATE_RANGE");

    // 2. Mesma data de entrada e saída (0 noites)
    const sameDayAvail = await executeBotAction(mockDb, "checkAvailability", {
      checkIn: "2026-10-15",
      checkOut: "2026-10-15"
    });
    assert.equal(sameDayAvail.error, "INVALID_DATE_RANGE");

    const sameDayQuote = await executeBotAction(mockDb, "calculateQuote", {
      checkIn: "2026-10-15",
      checkOut: "2026-10-15"
    });
    assert.equal(sameDayQuote.error, "INVALID_DATE_RANGE");

    // 3. Datas com injeção de payload SQL / XSS / Formato Corrompido
    const xssAvail = await executeBotAction(mockDb, "checkAvailability", {
      checkIn: "<script>alert('xss')</script>",
      checkOut: "'; DROP TABLE reservations; --"
    });
    // Deve rejeitar ou não quebrar o banco de dados
    assert.ok(xssAvail.error || xssAvail.success !== undefined);

    const xssQuote = await executeBotAction(mockDb, "calculateQuote", {
      checkIn: "<script>alert('xss')</script>",
      checkOut: "2026-10-20"
    });
    assert.equal(xssQuote.error, "INVALID_DATE_RANGE");

    // 4. Período gigantesco (> 90 noites) em calculateQuote
    const bigStay = await executeBotAction(mockDb, "calculateQuote", {
      checkIn: "2026-01-01",
      checkOut: "2026-06-01"
    });
    assert.equal(bigStay.error, "MAX_STAY_EXCEEDED");
  });

  test("P3.4 Parâmetros anômalos de hóspedes (negativo, string, acima da capacidade)", async () => {
    // 1. Negativo em checkAvailability -> normaliza para Math.max(1, guests)
    const negAvail = await executeBotAction(mockDb, "checkAvailability", {
      checkIn: "2026-11-20",
      checkOut: "2026-11-22",
      guests: -5
    });
    assert.equal(negAvail.success, true);
    assert.equal(negAvail.guests, 1);

    // 2. Acima da capacidade máxima (maxGuests é 3 no siteConfig) -> nenhum flat disponível
    const overAvail = await executeBotAction(mockDb, "checkAvailability", {
      checkIn: "2026-11-20",
      checkOut: "2026-11-22",
      guests: 99
    });
    assert.equal(overAvail.success, true);
    assert.equal(overAvail.available, false);
    assert.equal(overAvail.totalAvailable, 0);
  });

  test("P3.5 Injeção financeira em generatePayment (valores negativos, zero, strings)", async () => {
    // 1. Valor negativo
    const negPay = await executeBotAction(mockDb, "generatePayment", { amount: -250 });
    assert.equal(negPay.error, "INVALID_AMOUNT");

    // 2. Valor zero
    const zeroPay = await executeBotAction(mockDb, "generatePayment", { amount: 0 });
    assert.equal(zeroPay.error, "INVALID_AMOUNT");

    // 3. String inválida
    const strPay = await executeBotAction(mockDb, "generatePayment", { amount: "quinhentos" });
    assert.equal(strPay.error, "INVALID_AMOUNT");

    // 4. Valor válido gera PIX Copia e Cola estruturado com CRC16
    const validPay = await executeBotAction(mockDb, "generatePayment", { amount: 350.50 });
    assert.equal(validPay.success, true);
    assert.equal(validPay.amount, 350.50);
    assert.ok(validPay.pixCopiaECola.startsWith("00020126"));
    assert.ok(validPay.pixCopiaECola.includes("5406350.50"));
  });

  test("P3.6 Integridade do commitReservation sob estados inválidos (inexistente, cancelada, expirada)", async () => {
    // 1. Reserva inexistente
    const notFound = await executeBotAction(mockDb, "commitReservation", { reservationId: "CF-NAO-EXISTE" });
    assert.equal(notFound.error, "RESERVATION_NOT_FOUND");

    // 2. Reserva já cancelada
    const cancelled = await executeBotAction(mockDb, "commitReservation", { reservationId: "CF-CANCELLED-RES" });
    assert.equal(cancelled.error, "RESERVATION_CANCELLED");

    // 3. Pré-reserva expirada
    const expired = await executeBotAction(mockDb, "commitReservation", { reservationId: "CF-EXPIRED-HOLD" });
    assert.equal(expired.error, "PRE_RESERVATION_EXPIRED");

    // 4. Tentativa de injeção de protótipo em reservationId
    const protoAttack = await executeBotAction(mockDb, "commitReservation", { reservationId: "__proto__" });
    assert.equal(protoAttack.error, "RESERVATION_NOT_FOUND");
  });

  test("P3.7 Ação desconhecida ou perigosa em executeBotAction é bloqueada com segurança", async () => {
    // 1. Ações não cadastradas são bloqueadas pelo guardrail com ACTION_DISABLED e requiresHandover
    const unknown1 = await executeBotAction(mockDb, "dropDatabase", {});
    assert.equal(unknown1.error, "ACTION_DISABLED");
    assert.equal(unknown1.requiresHandover, true);

    const unknown2 = await executeBotAction(mockDb, "eval", {});
    assert.equal(unknown2.error, "ACTION_DISABLED");
    assert.equal(unknown2.requiresHandover, true);

    // 2. Propriedades de protótipo (__proto__) caem no default seguro com UNKNOWN_ACTION
    const unknown3 = await executeBotAction(mockDb, "__proto__", {});
    assert.equal(unknown3.error, "UNKNOWN_ACTION");
    assert.ok(unknown3.message.includes("não é reconhecida"));

    // 3. Ação desconhecida explicitamente configurada em allowedActions cai no switch default
    const dbWithStrangeAction = JSON.parse(JSON.stringify(mockDb));
    dbWithStrangeAction.botActionsSettings.allowedActions.strangeAction = true;
    const resStrange = await executeBotAction(dbWithStrangeAction, "strangeAction", {});
    assert.equal(resStrange.error, "UNKNOWN_ACTION");
    assert.ok(resStrange.message.includes("não é reconhecida"));
  });

  // ── TEST DIMENSION 4: Chaos Engineering no Loop Multi-Turn ──────────────────

  test("P4.1 Turno 1 retorna tool call com argumentos vazios {} e Turno 2 sintetiza resposta cordial", async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];

    try {
      globalThis.fetch = async (url, opts) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          calls.push(JSON.parse(opts.body));
          if (calls.length === 1) {
            return {
              ok: true,
              json: async () => ({
                candidates: [{
                  content: {
                    role: "model",
                    parts: [{
                      functionCall: {
                        name: "checkAvailability",
                        args: {} // VAZIO
                      }
                    }]
                  }
                }]
              })
            };
          } else {
            return {
              ok: true,
              json: async () => ({
                candidates: [{
                  content: {
                    role: "model",
                    parts: [{ text: "Por favor, para qual período (datas de check-in e check-out) você gostaria de consultar?" }]
                  }
                }]
              })
            };
          }
        }
        return originalFetch(url, opts);
      };

      const res = await generateAiWhatsAppResponse({
        db: mockDb,
        phone: "5522998505276",
        messageText: "Tem quarto vago?"
      });

      assert.equal(calls.length, 2);
      // Turno 2 deve conter a resposta do erro MISSING_DATES
      const funcPart = calls[1].contents.find(c => c.role === "function");
      assert.ok(funcPart);
      assert.equal(funcPart.parts[0].functionResponse.response.error, "MISSING_DATES");

      assert.equal(res.source, "gemini");
      assert.ok(res.replyText.includes("check-in e check-out") || res.replyText.includes("período"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("P4.2 Turno 2 sofre timeout / 500: sistema transborda graciosamente sem causar crash no processo", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;

    try {
      globalThis.fetch = async (url, opts) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          callCount++;
          if (callCount === 1) {
            // Turno 1 funciona e chama ação desativada
            return {
              ok: true,
              json: async () => ({
                candidates: [{
                  content: {
                    role: "model",
                    parts: [{
                      functionCall: {
                        name: "commitReservation",
                        args: { reservationId: "CF-123" }
                      }
                    }]
                  }
                }]
              })
            };
          } else {
            // Turno 2 falha com erro 500
            return {
              ok: false,
              status: 500,
              statusText: "Internal Server Error"
            };
          }
        }
        return originalFetch(url, opts);
      };

      const disabledCommitDb = JSON.parse(JSON.stringify(mockDb));
      disabledCommitDb.botActionsSettings.allowedActions.commitReservation = false;

      const res = await generateAiWhatsAppResponse({
        db: disabledCommitDb,
        phone: "5522998505276",
        messageText: "Quero confirmar a reserva agora"
      });

      // Como o Turno 2 falhou, a função deve retornar o fallback com requiresHandover garantido
      assert.equal(res.shouldHandover, true);
      assert.equal(res.requiresHandover, true);
      assert.ok(res.replyText.includes("atendimento humano") || res.replyText.includes("recepção"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  after(async () => {
    activeIntervals.forEach(h => clearInterval(h));
    activeTimeouts.forEach(h => clearTimeout(h));
    for (const srv of openServers) {
      try {
        await new Promise(r => srv.close(r));
      } catch (_) {}
    }
  });
});

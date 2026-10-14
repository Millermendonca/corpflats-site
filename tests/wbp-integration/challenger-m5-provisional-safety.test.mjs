/**
 * tests/wbp-integration/challenger-m5-provisional-safety.test.mjs
 *
 * Challenger 2: Provisional Adapters, General Switch Safety & Pricing Math Contract (Milestone 5).
 *
 * Empirical adversarial stress testing of:
 * 1. Database Integrity Guard: Pre & post-flight verification of baseline data/database.json SHA-256 (e37d74b7...).
 * 2. General Switch Zero-Timer Contract: startCardAutoPurgeScheduler registers strictly 0 timers when isWbpEnabled(db) is false.
 * 3. SEBRAE Pricing Math Contract:
 *    - Nominal contract: Custo UH = R$ 149,38 and Tarifa Mínima = R$ 276,63 (±0,05).
 *    - Exact 100% analytical decomposition: 149,38 + 41,49 + 69,16 + 16,60 = 276,63 (fecha100 = true).
 *    - Mathematical boundary and invalid input stress testing.
 * 4. Provisional Adapters Default-Disabled & Zero Outbound Calls:
 *    - When provisionalMessagesEnabled and provisionalReviewsEnabled are false,
 *      calling provisional endpoints returns { success: false, provisional: true } and 0 outbound calls are made.
 * 5. Provisional Adapters Enabled & OpenAPI Schema Validation Contract:
 *    - Toggling provisional features on sends requests to WBP Simulator.
 *    - Verifies 100% schema validation conformance against wbpAPI.yaml for:
 *      GetMessages, SendMessage, GetReviews, RespondReview.
 * 6. Adversarial edge cases and error handling for provisional endpoints.
 *
 * Strictly adheres to AGENTS.md:
 * - Runs EXCLUSIVELY this targeted test.
 * - Test isolation: DATABASE_URL unset, DATA_FILE in os.tmpdir(), NODE_ENV="test".
 * - Ephemeral port allocation and clean process tree termination.
 */

process.env.NODE_ENV = "test";
delete process.env.DATABASE_URL;

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import net from "node:net";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const prodDbPath = path.resolve(rootDir, "data/database.json");

import {
  startCardAutoPurgeScheduler,
  stopCardAutoPurgeScheduler,
  CreditCardVault
} from "../../artifacts/api-server/wbp/vault.mjs";

import {
  WbpProvisionalAdapter,
  getProvisionalAdapter,
  isProvisionalMessagesEnabled,
  isProvisionalReviewsEnabled,
  setProvisionalMessagesEnabled,
  setProvisionalReviewsEnabled
} from "../../artifacts/api-server/wbp/provisional.mjs";

import {
  isWbpEnabled,
  getIntegrationMode,
  WBP_MODES
} from "../../artifacts/api-server/wbp/config.mjs";

import {
  calculateSebraeRate,
  DEFAULT_SEBRAE_CONFIG,
  round2
} from "../../artifacts/api-server/wbp/pricing.mjs";

import { WbpSimulatorServer } from "../../e2e/wbp-simulator/server.mjs";
import { validateRequest } from "../../e2e/wbp-simulator/schemas/index.mjs";
import { WBPClient } from "../../artifacts/api-server/wbp/client.mjs";

// Helper: dynamic available port
function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

// Helper: kill process tree on Windows
function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

// Helper: wait for HTTP server to become responsive
async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.ok) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Server at ${url} failed to start within ${timeoutMs}ms.`);
}

describe("Suite 1: Baseline Database Integrity Guard (Pre & Post-Flight)", () => {
  const EXPECTED_HASH = "e37d74b7c78622903745709f781c92942be36732de878ac7543f6aeff7eb1882";
  let preHash;

  before(() => {
    const content = fs.readFileSync(prodDbPath);
    preHash = crypto.createHash("sha256").update(content).digest("hex");
  });

  it("baseline data/database.json SHA-256 matches pristine specification", () => {
    assert.equal(
      preHash.toLowerCase(),
      EXPECTED_HASH.toLowerCase(),
      "O hash SHA-256 inicial de data/database.json deve coincidir com o baseline do projeto."
    );
  });

  after(() => {
    const content = fs.readFileSync(prodDbPath);
    const postHash = crypto.createHash("sha256").update(content).digest("hex");
    assert.equal(
      postHash.toLowerCase(),
      preHash.toLowerCase(),
      "CRÍTICO: data/database.json NUNCA deve sofrer mutações durante testes pontuais!"
    );
  });
});

describe("Suite 2: General Switch Zero-Timer Contract (startCardAutoPurgeScheduler)", () => {
  it("when isWbpEnabled(db) is false (mode 'off'), startCardAutoPurgeScheduler registers 0 timers", () => {
    stopCardAutoPurgeScheduler();

    let registeredIntervals = 0;
    const realSetInterval = global.setInterval;
    global.setInterval = (...args) => {
      registeredIntervals++;
      return realSetInterval(...args);
    };

    try {
      // 1. Explicit mode 'off'
      const mockDbOff = {
        settings: {
          wbp_integration_mode: WBP_MODES.OFF
        }
      };
      assert.equal(isWbpEnabled(mockDbOff), false, "isWbpEnabled deve ser false para modo 'off'");

      startCardAutoPurgeScheduler(mockDbOff);
      assert.equal(
        registeredIntervals,
        0,
        "startCardAutoPurgeScheduler NÃO deve registrar nenhum timer quando a integração estiver desativada (R1)"
      );

      // 2. Empty settings (default mode 'off')
      const mockDbDefault = { settings: {} };
      assert.equal(isWbpEnabled(mockDbDefault), false, "isWbpEnabled deve ser false para settings padrão");

      startCardAutoPurgeScheduler(mockDbDefault);
      assert.equal(
        registeredIntervals,
        0,
        "startCardAutoPurgeScheduler NÃO deve registrar nenhum timer para settings padrão"
      );
    } finally {
      stopCardAutoPurgeScheduler();
      global.setInterval = realSetInterval;
    }
  });

  it("when isWbpEnabled(db) is true (mode 'auto'), startCardAutoPurgeScheduler registers exactly 1 unref'd timer", () => {
    stopCardAutoPurgeScheduler();

    let registeredIntervals = 0;
    let unrefCalled = false;
    const realSetInterval = global.setInterval;

    global.setInterval = (...args) => {
      registeredIntervals++;
      const timerObj = realSetInterval(...args);
      const originalUnref = timerObj.unref?.bind(timerObj);
      timerObj.unref = () => {
        unrefCalled = true;
        if (originalUnref) originalUnref();
      };
      return timerObj;
    };

    try {
      const mockDbAuto = {
        settings: {
          wbp_integration_mode: WBP_MODES.AUTO
        }
      };
      assert.equal(isWbpEnabled(mockDbAuto), true, "isWbpEnabled deve ser true para modo 'auto'");

      startCardAutoPurgeScheduler(mockDbAuto);
      assert.equal(registeredIntervals, 1, "startCardAutoPurgeScheduler deve registrar exatamente 1 timer diário quando ativo");
      assert.equal(unrefCalled, true, "O timer de auto-purge DEVE chamar .unref() para não prender o processo do Node");
    } finally {
      stopCardAutoPurgeScheduler();
      global.setInterval = realSetInterval;
    }
  });
});

describe("Suite 3: SEBRAE Pricing Math Contract & Mathematical Stress", () => {
  it("nominal contract: Custo UH = R$ 149,38 e Tarifa Mínima = R$ 276,63 com decomposição 100% exata", () => {
    const rate = calculateSebraeRate();

    // 1. Custo por UH ocupada = R$ 149,38
    assert.equal(rate.custoUH, 149.38, "Custo por UH deve ser exatamente R$ 149,38");
    assert.equal(rate.fixedCostPerSoldUnit, 101.62, "Custo fixo por diária vendida deve ser R$ 101,62");
    assert.equal(rate.varCostPerUnit, 47.76, "Custos variáveis devem somar R$ 47,76");

    // 2. Tarifa Mínima = R$ 276,63 (±0,05)
    assert.equal(rate.tarifaMinima, 276.63, "Tarifa mínima calculada deve ser R$ 276,63");
    assert.ok(
      Math.abs(rate.tarifaMinima - 276.63) <= 0.05,
      "Tarifa mínima deve estar estritamente dentro da margem ±0,05"
    );

    // 3. Decomposição analítica fecha 100%
    assert.equal(rate.decomposicao.custo, 149.38, "Parcela Custo = R$ 149,38");
    assert.equal(rate.decomposicao.comissao, 41.49, "Parcela Comissão (15%) = R$ 41,49");
    assert.equal(rate.decomposicao.margem, 69.16, "Parcela Margem (25%) = R$ 69,16");
    assert.equal(rate.decomposicao.imposto, 16.60, "Parcela Imposto (6%) = R$ 16,60");

    const sumDecomposition = round2(
      rate.decomposicao.custo +
      rate.decomposicao.comissao +
      rate.decomposicao.margem +
      rate.decomposicao.imposto
    );
    assert.equal(sumDecomposition, 276.63, "Soma exata das parcelas (149,38 + 41,49 + 69,16 + 16,60) DEVE ser 276,63");
    assert.equal(rate.somaDecomposicao, 276.63);
    assert.equal(rate.fecha100, true, "Flag fecha100 deve ser true");

    // 4. Parâmetro de comissão em R$ estritamente removido
    assert.equal(
      DEFAULT_SEBRAE_CONFIG.varCommissionDailyReais,
      0.0,
      "Comissão em R$/diária deve ser 0 para evitar contagem dupla (R4)"
    );
  });

  it("mathematical stress: custom parameters always close 100% without rounding residue", () => {
    const stressScenarios = [
      { occupancyRate: 0.50, targetMarginPct: 0.20 },
      { occupancyRate: 0.80, targetMarginPct: 0.30 },
      { occupancyRate: 0.73, daysInMonth: 30, channelCommissionPct: 0.18 },
      { totalUHs: 19, daysInMonth: 28, occupancyRate: 0.60, fixedCostsMonth: 42000 }
    ];

    for (const scenario of stressScenarios) {
      const result = calculateSebraeRate(scenario);
      assert.ok(result.tarifaMinima > result.custoUH, "Tarifa mínima deve superar o custo UH");
      assert.equal(
        result.somaDecomposicao,
        result.tarifaMinima,
        `Soma da decomposição deve igualar a tarifa mínima para cenário: ${JSON.stringify(scenario)}`
      );
      assert.equal(result.fecha100, true, "fecha100 deve ser true para todos os cenários viáveis");
    }
  });

  it("input boundary validation: rejects invalid or impossible parameters", () => {
    // 0 units
    assert.throws(
      () => calculateSebraeRate({ totalUHs: 0 }),
      /maiores que zero/i,
      "Deve rejeitar totalUHs <= 0"
    );

    // 0 occupancy
    assert.throws(
      () => calculateSebraeRate({ occupancyRate: 0 }),
      /entre 0 .* e 1/i,
      "Deve rejeitar occupancyRate <= 0"
    );

    // Occupancy > 100%
    assert.throws(
      () => calculateSebraeRate({ occupancyRate: 1.25 }),
      /entre 0 .* e 1/i,
      "Deve rejeitar occupancyRate > 1.0"
    );

    // Deductions >= 100% (divisor <= 0)
    assert.throws(
      () => calculateSebraeRate({ channelCommissionPct: 0.50, targetMarginPct: 0.45, taxRatePct: 0.10 }),
      /não pode atingir ou ultrapassar 100%/i,
      "Deve rejeitar deduções cuja soma alcance ou ultrapasse 100%"
    );
  });
});

describe("Suite 4 & 5: Provisional Adapters & Operational Safety Integration", () => {
  let tmpDir;
  let tmpDbPath;
  let tmpVaultFile;
  let simulator;
  let simulatorPort;
  let serverProcess;
  let serverPort;
  let serverUrl;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "challenger_m5_provisional_"));
    tmpDbPath = path.join(tmpDir, "database.json");
    tmpVaultFile = path.join(tmpDir, "wbp_card_vault.json");

    // Copy pristine database content to temporary database
    const prodContent = JSON.parse(fs.readFileSync(prodDbPath, "utf-8"));
    if (!prodContent.settings) prodContent.settings = {};
    // Ensure default settings: general switch auto (so server permits traffic when provisional is toggled),
    // but provisional flags strictly FALSE
    prodContent.settings.wbp_integration_mode = "auto";
    prodContent.settings.wbp_provisional_messages_enabled = false;
    prodContent.settings.wbp_provisional_reviews_enabled = false;
    fs.writeFileSync(tmpDbPath, JSON.stringify(prodContent, null, 2), "utf-8");

    // Start WBP Simulator
    simulatorPort = await getAvailablePort();
    simulator = new WbpSimulatorServer({ port: simulatorPort });
    await simulator.start();

    // Start Demo Server in child process with test environment
    serverPort = await getAvailablePort();
    serverUrl = `http://127.0.0.1:${serverPort}`;

    const serverScript = path.resolve(rootDir, "artifacts/api-server/demo-server.mjs");
    const childEnv = {
      ...process.env,
      PORT: String(serverPort),
      DATA_FILE: tmpDbPath,
      NODE_ENV: "test",
      WBP_CARD_VAULT_FILE: tmpVaultFile,
      WBP_BASE_URL: `${simulator.url}/api/cloudpms`,
      WBP_PMS_CID: "gfm1",
      WBP_SHARED_SECRET: "test_secret_m5",
      WBP_INTEGRATION_MODE: "auto",
      CREDIT_CARD_VAULT_KEY: "wbp_test_key_challenger_m5"
    };
    delete childEnv.DATABASE_URL;

    serverProcess = spawn("node", [serverScript], {
      env: childEnv,
      stdio: "pipe",
      cwd: rootDir
    });

    await waitForServer(serverUrl);
  });

  after(async () => {
    if (serverProcess) {
      killProcessTree(serverProcess.pid);
    }
    if (simulator) {
      await simulator.stop();
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it("Test 4.1: Provisional adapters default-disabled check (API & Simulator Zero Outbound Calls)", async () => {
    // 1. Verify settings endpoint reports disabled by default
    const settingsRes = await fetch(`${serverUrl}/api/wbp/provisional/settings`);
    assert.equal(settingsRes.status, 200);
    const settings = await settingsRes.json();
    assert.equal(
      settings.provisionalMessagesEnabled,
      false,
      "provisionalMessagesEnabled deve ser false por padrão (R7)"
    );
    assert.equal(
      settings.provisionalReviewsEnabled,
      false,
      "provisionalReviewsEnabled deve ser false por padrão (R7)"
    );

    // Record simulator requests before attempting provisional calls
    const initialRequestCount = simulator.receivedRequests.length;

    // 2. Call GET /api/wbp/provisional/messages when disabled
    const getMsgRes = await fetch(`${serverUrl}/api/wbp/provisional/messages`);
    assert.equal(getMsgRes.status, 200);
    const getMsgData = await getMsgRes.json();
    assert.equal(getMsgData.enabled, false);
    assert.equal(getMsgData.provisional, true);
    assert.deepEqual(getMsgData.messages, []);

    // 3. Call POST /api/wbp/provisional/messages/send when disabled
    const sendMsgRes = await fetch(`${serverUrl}/api/wbp/provisional/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId: 999,
        text: "Tentativa de envio com adaptador desligado"
      })
    });
    const sendMsgData = await sendMsgRes.json();
    assert.equal(sendMsgData.success, false, "SendMessage deve retornar success: false quando desativado");
    assert.equal(sendMsgData.provisional, true, "Deve conter flag provisional: true");
    assert.match(sendMsgData.error, /disabled by default/i);

    // 4. Call GET /api/wbp/provisional/reviews when disabled
    const getRevRes = await fetch(`${serverUrl}/api/wbp/provisional/reviews`);
    assert.equal(getRevRes.status, 200);
    const getRevData = await getRevRes.json();
    assert.equal(getRevData.enabled, false);
    assert.equal(getRevData.provisional, true);
    assert.deepEqual(getRevData.reviews, []);

    // 5. Call POST /api/wbp/provisional/reviews/respond when disabled
    const respRevRes = await fetch(`${serverUrl}/api/wbp/provisional/reviews/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewId: 888,
        response: "Tentativa de resposta com adaptador desligado"
      })
    });
    const respRevData = await respRevRes.json();
    assert.equal(respRevData.success, false, "RespondReview deve retornar success: false quando desativado");
    assert.equal(respRevData.provisional, true, "Deve conter flag provisional: true");
    assert.match(respRevData.error, /disabled by default/i);

    // 6. Assert that strictly ZERO outbound calls were received by WBP Simulator for provisional verbs
    const provisionalOutboundCalls = simulator.receivedRequests
      .slice(initialRequestCount)
      .filter((r) => ["GetMessages", "SendMessage", "GetReviews", "RespondReview"].includes(r.verb));

    assert.equal(
      provisionalOutboundCalls.length,
      0,
      "EXIGÊNCIA: Nenhuma chamada de saída deve atingir o simulador quando adaptadores provisórios estiverem desativados"
    );
  });

  it("Test 4.2: Direct WbpProvisionalAdapter class unit isolation when disabled", async () => {
    const mockClient = {
      request: async () => {
        throw new Error("Client.request NÃO deveria ter sido chamado!");
      }
    };
    const mockDb = {
      settings: {
        wbp_integration_mode: "auto",
        wbp_provisional_messages_enabled: false,
        wbp_provisional_reviews_enabled: false
      }
    };

    const adapter = new WbpProvisionalAdapter(mockClient, mockDb);

    const msgSendResult = await adapter.sendMessage({ text: "Teste unitário isolado" });
    assert.equal(msgSendResult.success, false);
    assert.equal(msgSendResult.provisional, true);
    assert.equal(msgSendResult.enabled, false);

    const revRespResult = await adapter.respondReview({ reviewId: 10, responseText: "Obrigado" });
    assert.equal(revRespResult.success, false);
    assert.equal(revRespResult.provisional, true);
    assert.equal(revRespResult.enabled, false);
  });

  it("Test 5.1: Provisional adapters enabled check & OpenAPI schema validation (GetMessages, SendMessage, GetReviews, RespondReview)", async () => {
    // 1. Enable provisional flags via settings endpoint
    const enableRes = await fetch(`${serverUrl}/api/wbp/provisional/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messagesEnabled: true,
        reviewsEnabled: true
      })
    });
    assert.equal(enableRes.status, 200);
    const enableData = await enableRes.json();
    assert.equal(enableData.success, true);
    assert.equal(enableData.provisionalMessagesEnabled, true);
    assert.equal(enableData.provisionalReviewsEnabled, true);

    // 2. Inject sample guest message and guest review into WBP Simulator
    simulator.injectMessage({
      wbp_Message_id: 1001,
      order_id: "OTA-TEST-MSG-1",
      sender: "guest",
      senderName: "Lucas Alcantara",
      message: "Gostaria de solicitar check-in antecipado às 11h.",
      date: new Date().toISOString()
    });

    simulator.injectReview({
      wbp_review_id: 2001,
      order_id: "OTA-TEST-REV-1",
      guest_name: "Fernanda Lima",
      score: 10,
      flatNumber: "302",
      review: "Excelente acomodação, atendimento impecável e ótima localização!",
      review_date: "2026-10-14"
    });

    // 3. Execute GET /api/wbp/provisional/messages -> calls WBP Simulator GetMessages
    const getMsgRes = await fetch(`${serverUrl}/api/wbp/provisional/messages`);
    assert.equal(getMsgRes.status, 200);
    const getMsgData = await getMsgRes.json();
    assert.equal(getMsgData.success, true);
    assert.equal(getMsgData.provisional, true);
    assert.ok(getMsgData.messages.length >= 1, "Deve recuperar mensagem injetada");
    const retrievedMsg = getMsgData.messages.find((m) => m.wbpMessageId === 1001 || m.text.includes("check-in antecipado"));
    assert.ok(retrievedMsg, "Mensagem injetada deve constar na listagem");
    assert.equal(retrievedMsg.sender, "guest");

    // 4. Execute POST /api/wbp/provisional/messages/send -> calls WBP Simulator SendMessage
    const sendMsgRes = await fetch(`${serverUrl}/api/wbp/provisional/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId: 1001,
        text: "Olá Lucas! Check-in antecipado liberado a partir das 11h30."
      })
    });
    assert.equal(sendMsgRes.status, 200);
    const sendMsgData = await sendMsgRes.json();
    assert.equal(sendMsgData.success, true);
    assert.equal(sendMsgData.provisional, true);
    assert.equal(sendMsgData.text, "Olá Lucas! Check-in antecipado liberado a partir das 11h30.");

    // 5. Execute GET /api/wbp/provisional/reviews -> calls WBP Simulator GetReviews
    const getRevRes = await fetch(`${serverUrl}/api/wbp/provisional/reviews`);
    assert.equal(getRevRes.status, 200);
    const getRevData = await getRevRes.json();
    assert.equal(getRevData.success, true);
    assert.equal(getRevData.provisional, true);
    assert.ok(getRevData.reviews.length >= 1, "Deve recuperar avaliação injetada");
    const retrievedRev = getRevData.reviews.find((r) => r.wbpReviewId === 2001 || r.author === "Fernanda Lima");
    assert.ok(retrievedRev, "Avaliação injetada deve constar na listagem");
    assert.equal(retrievedRev.rating, 5, "Nota 10/10 normalizada para 5 estrelas");
    assert.equal(retrievedRev.tone, "positive");

    // 6. Execute POST /api/wbp/provisional/reviews/respond -> calls WBP Simulator RespondReview
    const respRevRes = await fetch(`${serverUrl}/api/wbp/provisional/reviews/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewId: 2001,
        response: "Muito obrigado pelo carinho e pela avaliação maravilhosa, Fernanda!"
      })
    });
    assert.equal(respRevRes.status, 200);
    const respRevData = await respRevRes.json();
    assert.equal(respRevData.success, true);
    assert.equal(respRevData.provisional, true);
    assert.equal(respRevData.response, "Muito obrigado pelo carinho e pela avaliação maravilhosa, Fernanda!");

    // 7. Rigorous Schema Validation Audit against OpenAPI Specification (wbpAPI.yaml)
    const verbsToVerify = ["GetMessages", "SendMessage", "GetReviews", "RespondReview"];

    for (const verb of verbsToVerify) {
      const requestsForVerb = simulator.receivedRequests.filter((r) => r.verb === verb);
      assert.ok(
        requestsForVerb.length >= 1,
        `Simulador DEVE ter recebido ao menos 1 requisição para o verbo ${verb}`
      );

      for (const reqRecord of requestsForVerb) {
        // Run strict schema validation (tolerant: false)
        const validation = validateRequest(verb, reqRecord.body, { tolerant: false });
        assert.equal(
          validation.valid,
          true,
          `Validação de schema OpenAPI para verbo '${verb}' falhou: ${validation.errors.join("; ")}`
        );
        assert.equal(
          validation.errors.length,
          0,
          `Verbo '${verb}' não deve apresentar erros de schema OpenAPI`
        );

        // Verify common envelope fields
        assert.equal(reqRecord.body.verb, verb);
        assert.ok(reqRecord.body.guid, "Deve possuir GUID v4");
        assert.equal(reqRecord.body.pms_cid, "gfm1");
        assert.equal(reqRecord.body.shared_secret, "test_secret_m5");
      }
    }
  });

  it("Test 6: Adversarial edge cases and input validation for provisional endpoints", async () => {
    // 1. Missing message text
    const emptyMsgRes = await fetch(`${serverUrl}/api/wbp/provisional/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId: 1001,
        text: ""
      })
    });
    assert.equal(emptyMsgRes.status, 400, "Envio sem texto deve retornar 400 Bad Request");
    const emptyMsgData = await emptyMsgRes.json();
    assert.equal(emptyMsgData.success, false);

    // 2. Missing reviewId or response
    const emptyRevRes = await fetch(`${serverUrl}/api/wbp/provisional/reviews/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewId: null,
        response: ""
      })
    });
    assert.equal(emptyRevRes.status, 400, "Resposta sem reviewId deve retornar 400 Bad Request");
    const emptyRevData = await emptyRevRes.json();
    assert.equal(emptyRevData.success, false);

    // 3. Schema validator detects invalid envelope
    const badEnvelopeValidation = validateRequest("SendMessage", {
      verb: "SendMessage",
      guid: "invalid-not-uuid",
      pms_cid: "gfm1"
      // missing shared_secret and message
    }, { tolerant: false });

    assert.equal(badEnvelopeValidation.valid, false);
    assert.ok(badEnvelopeValidation.errors.length > 0);
  });
});

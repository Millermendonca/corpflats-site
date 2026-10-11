/**
 * Test Suite: Milestone M3 Adversarial Challenge (WhatsApp AI Switches & Tri-Modal Mode)
 * File: tests/challenger-m3-ui-actions.test.mjs
 * Execution: node --test tests/challenger-m3-ui-actions.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 3997;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-challenger-m3-db-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

// ─── 1. PURE LOGIC PROBE: Tri-Modal Indicator Logic ─────────────────────────
// Replicating the exact logic implemented in whatsapp-automation.tsx (lines 691-725)
function computeBotOperationalMode(statusInfo, aiConfig, botActionsSettings) {
  if (!statusInfo?.connected || !aiConfig.enabled) {
    return {
      type: "disabled",
      label: "Bot Desativado",
      badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800",
      dotClass: "bg-rose-500",
      description: !statusInfo?.connected
        ? "Instância Z-API desconectada no WhatsApp. Mensagens recebidas não são entregues à Sofia."
        : "O motor da IA Sofia está desligado nas opções. Respostas automáticas pausadas.",
      iconBg: "bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400"
    };
  }

  if (!botActionsSettings?.apiActionsEnabled) {
    return {
      type: "responder",
      label: "Modo Respondedor Ativo",
      badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800",
      dotClass: "bg-amber-500 animate-pulse",
      description: "A Sofia atua como Concierge Conversacional e FAQ (Gemini puro). Responde dúvidas sobre regras, Wi-Fi e comodidades, mas está proibida de acessar o PMS e gerar cobranças.",
      iconBg: "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
    };
  }

  const activeCount = Object.values(botActionsSettings?.allowedActions || {}).filter(Boolean).length;
  return {
    type: "autonomous",
    label: "Modo Autônomo com Ações",
    badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
    dotClass: "bg-emerald-500 animate-ping",
    description: `A Sofia opera com autonomia executiva via Function Calling. ${activeCount} de 5 ações permitidas no PMS e financeiro (disponibilidade, tarifas, pré-reserva, PIX e confirmação).`,
    iconBg: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
  };
}

describe("Milestone M3 Challenger Suite: WhatsApp AI Switches & Tri-Modal Indicator", () => {

  describe("1. Pure Logic Verification: Tri-Modal State Machine Edge Cases", () => {
    it("Case 1a: Should report 'Bot Desativado' when Z-API is disconnected (connected: false)", () => {
      const mode = computeBotOperationalMode(
        { connected: false },
        { enabled: true },
        { apiActionsEnabled: true, allowedActions: { checkAvailability: true } }
      );
      assert.equal(mode.type, "disabled");
      assert.equal(mode.label, "Bot Desativado");
      assert.match(mode.description, /Instância Z-API desconectada/);
    });

    it("Case 1b: Should report 'Bot Desativado' when statusInfo is null or undefined", () => {
      const modeNull = computeBotOperationalMode(
        null,
        { enabled: true },
        { apiActionsEnabled: true }
      );
      assert.equal(modeNull.type, "disabled");
      assert.equal(modeNull.label, "Bot Desativado");

      const modeUndefined = computeBotOperationalMode(
        undefined,
        { enabled: true },
        { apiActionsEnabled: true }
      );
      assert.equal(modeUndefined.type, "disabled");
      assert.equal(modeUndefined.label, "Bot Desativado");
    });

    it("Case 1c: Should report 'Bot Desativado' when Z-API is connected but aiConfig.enabled === false", () => {
      const mode = computeBotOperationalMode(
        { connected: true },
        { enabled: false },
        { apiActionsEnabled: true, allowedActions: { checkAvailability: true } }
      );
      assert.equal(mode.type, "disabled");
      assert.equal(mode.label, "Bot Desativado");
      assert.match(mode.description, /O motor da IA Sofia está desligado/);
    });

    it("Case 2: Should report 'Modo Respondedor Ativo' when connected and AI on, but apiActionsEnabled === false", () => {
      const mode = computeBotOperationalMode(
        { connected: true },
        { enabled: true },
        {
          apiActionsEnabled: false,
          allowedActions: { checkAvailability: true, calculateQuote: true }
        }
      );
      assert.equal(mode.type, "responder");
      assert.equal(mode.label, "Modo Respondedor Ativo");
      assert.match(mode.description, /proibida de acessar o PMS/);
    });

    it("Case 3a: Should report 'Modo Autônomo com Ações' when connected, AI on, and apiActionsEnabled === true (all 5 actions enabled)", () => {
      const mode = computeBotOperationalMode(
        { connected: true },
        { enabled: true },
        {
          apiActionsEnabled: true,
          allowedActions: {
            checkAvailability: true,
            calculateQuote: true,
            generatePayment: true,
            createPreReservation: true,
            commitReservation: true
          }
        }
      );
      assert.equal(mode.type, "autonomous");
      assert.equal(mode.label, "Modo Autônomo com Ações");
      assert.match(mode.description, /5 de 5 ações permitidas/);
    });

    it("Case 3b: Should dynamically count active actions (e.g. 3 of 5 active)", () => {
      const mode = computeBotOperationalMode(
        { connected: true },
        { enabled: true },
        {
          apiActionsEnabled: true,
          allowedActions: {
            checkAvailability: true,
            calculateQuote: false,
            generatePayment: true,
            createPreReservation: false,
            commitReservation: true
          }
        }
      );
      assert.equal(mode.type, "autonomous");
      assert.match(mode.description, /3 de 5 ações permitidas/);
    });

    it("Case 3c: Should handle 0 of 5 actions gracefully without throwing", () => {
      const mode = computeBotOperationalMode(
        { connected: true },
        { enabled: true },
        {
          apiActionsEnabled: true,
          allowedActions: {
            checkAvailability: false,
            calculateQuote: false,
            generatePayment: false,
            createPreReservation: false,
            commitReservation: false
          }
        }
      );
      assert.equal(mode.type, "autonomous");
      assert.match(mode.description, /0 de 5 ações permitidas/);
    });

    it("Case 3d: Should handle missing allowedActions object safely (fallback to empty object)", () => {
      const mode = computeBotOperationalMode(
        { connected: true },
        { enabled: true },
        { apiActionsEnabled: true }
      );
      assert.equal(mode.type, "autonomous");
      assert.match(mode.description, /0 de 5 ações permitidas/);
    });
  });

  describe("2. Static Verification of whatsapp-automation.tsx UI Invariants", () => {
    const componentSource = fs.readFileSync(
      path.join(rootDir, "artifacts/limpeza/src/pages/whatsapp-automation.tsx"),
      "utf-8"
    );

    it("Ensures BOT_ACTIONS_METADATA contains exactly the 5 canonical system actions", () => {
      const expectedActions = [
        "checkAvailability",
        "calculateQuote",
        "generatePayment",
        "createPreReservation",
        "commitReservation"
      ];
      for (const key of expectedActions) {
        assert.ok(
          componentSource.includes(`key: "${key}"`),
          `Expected key ${key} in BOT_ACTIONS_METADATA`
        );
      }
    });

    it("Ensures granular switch grid applies opacity-60 and pointer-events-none when master switch is off", () => {
      assert.ok(
        componentSource.includes(`!botActionsSettings.apiActionsEnabled ? "opacity-60 pointer-events-none" : ""`),
        "Granular switch grid container must disable pointer events and apply opacity when master switch is off"
      );
    });

    it("Ensures each granular switch explicitly receives disabled={!botActionsSettings.apiActionsEnabled}", () => {
      assert.ok(
        componentSource.includes(`disabled={!botActionsSettings.apiActionsEnabled}`),
        "Granular Switch elements must be functionally disabled when apiActionsEnabled is false"
      );
    });

    it("Ensures warning banner for disabled master switch is present in JSX", () => {
      assert.ok(
        componentSource.includes(`Chave Mestra Desativada:`),
        "Must display informative banner when master switch is disabled"
      );
    });

    it("Ensures master switch toggles handleToggleMasterBotActions and has proper checked binding", () => {
      assert.ok(
        componentSource.includes(`id="master-api-actions-switch"`),
        "Master switch must exist with ID master-api-actions-switch"
      );
      assert.ok(
        componentSource.includes(`checked={botActionsSettings.apiActionsEnabled}`),
        "Master switch must be bound to botActionsSettings.apiActionsEnabled"
      );
      assert.ok(
        componentSource.includes(`onCheckedChange={handleToggleMasterBotActions}`),
        "Master switch must call handleToggleMasterBotActions on change"
      );
    });

    it("Ensures fetchBotActionsSettings is invoked on component mount (useEffect)", () => {
      assert.ok(
        componentSource.includes(`fetchBotActionsSettings()`),
        "fetchBotActionsSettings must be called to hydrate state from server"
      );
    });
  });

  describe("3. Empirical Integration Verification with Live Backend Server", () => {
    before(async () => {
      // Setup isolated test database
      const initialDb = JSON.parse(fs.readFileSync(prodDbPath, "utf-8"));
      initialDb.botActionsSettings = {
        apiActionsEnabled: true,
        allowedActions: {
          checkAvailability: true,
          calculateQuote: true,
          generatePayment: true,
          createPreReservation: true,
          commitReservation: true
        },
        preReservationHoldMinutes: 30,
        handoverMessage: "Esta ação do sistema está pausada ou requer atendimento humano.",
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

      // Spawn test server
      serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
        cwd: rootDir,
        env: {
          ...process.env,
          PORT: String(TEST_PORT),
          DATA_FILE: isolatedDbPath,
          DATABASE_FILE: isolatedDbPath,
          NODE_ENV: "test"
        },
        stdio: "pipe"
      });

      // Poll until server is ready
      let ready = false;
      for (let i = 0; i < 40; i++) {
        try {
          const res = await fetch(`${BASE_URL}/api/system/version`);
          if (res.ok) {
            ready = true;
            break;
          }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 250));
      }

      if (!ready) {
        throw new Error(`Server failed to start on port ${TEST_PORT}`);
      }
    });

    after(() => {
      if (serverProcess && serverProcess.pid) {
        killProcessTree(serverProcess.pid);
      }
      try {
        if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
      } catch (_) {}
    });

    it("GET /api/bot-actions/settings returns 200 with initial configuration", async () => {
      const res = await fetch(`${BASE_URL}/api/bot-actions/settings`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.settings.apiActionsEnabled, true);
      assert.equal(data.settings.allowedActions.checkAvailability, true);
      assert.equal(data.settings.allowedActions.calculateQuote, true);
      assert.equal(data.settings.allowedActions.generatePayment, true);
      assert.equal(data.settings.allowedActions.createPreReservation, true);
      assert.equal(data.settings.allowedActions.commitReservation, true);
    });

    it("Master Switch Toggle: Turning OFF disables all actions and responds 200", async () => {
      const postRes = await fetch(`${BASE_URL}/api/bot-actions/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiActionsEnabled: false })
      });
      assert.equal(postRes.status, 200);
      const postData = await postRes.json();
      assert.equal(postData.settings.apiActionsEnabled, false);

      // Verify persistence via GET
      const getRes = await fetch(`${BASE_URL}/api/bot-actions/settings`);
      const getData = await getRes.json();
      assert.equal(getData.settings.apiActionsEnabled, false);

      // Verify that calling an action endpoint now yields 403 ACTION_DISABLED
      const actRes = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-11-01&checkOut=2026-11-03&guests=2`);
      assert.equal(actRes.status, 403);
      const actData = await actRes.json();
      assert.equal(actData.error, "ACTION_DISABLED");
      assert.equal(actData.requiresHandover, true);
    });

    it("Master Switch Toggle: Turning ON re-enables allowed actions and responds 200", async () => {
      const postRes = await fetch(`${BASE_URL}/api/bot-actions/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiActionsEnabled: true })
      });
      assert.equal(postRes.status, 200);
      const postData = await postRes.json();
      assert.equal(postData.settings.apiActionsEnabled, true);

      // Verify that calling action endpoint is now allowed (returns 200)
      const actRes = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-11-01&checkOut=2026-11-03&guests=2`);
      assert.equal(actRes.status, 200);
    });

    it("Granular Switches Toggle: Turning off and on EACH of the 5 individual actions", async () => {
      const actions = [
        "checkAvailability",
        "calculateQuote",
        "generatePayment",
        "createPreReservation",
        "commitReservation"
      ];

      for (const actionKey of actions) {
        // 1. Disable individual action
        const disRes = await fetch(`${BASE_URL}/api/bot-actions/settings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            allowedActions: { [actionKey]: false }
          })
        });
        assert.equal(disRes.status, 200);
        const disData = await disRes.json();
        assert.equal(disData.settings.allowedActions[actionKey], false, `Action ${actionKey} should be false`);

        // Check persistence via GET
        const getDis = await fetch(`${BASE_URL}/api/bot-actions/settings`);
        const getDisData = await getDis.json();
        assert.equal(getDisData.settings.allowedActions[actionKey], false);

        // Verify other actions were NOT erased or altered
        for (const otherKey of actions) {
          if (otherKey !== actionKey) {
            assert.equal(getDisData.settings.allowedActions[otherKey], true, `Other action ${otherKey} must remain true`);
          }
        }

        // 2. Re-enable individual action
        const enaRes = await fetch(`${BASE_URL}/api/bot-actions/settings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            allowedActions: { [actionKey]: true }
          })
        });
        assert.equal(enaRes.status, 200);
        const enaData = await enaRes.json();
        assert.equal(enaData.settings.allowedActions[actionKey], true, `Action ${actionKey} should be restored to true`);
      }
    });

    it("Advanced Parameters: Updating hold minutes and custom handover message persists and is returned in 403", async () => {
      const customMsg = "Nosso concierge humano irá atendê-lo em instantes pelo WhatsApp.";
      const postRes = await fetch(`${BASE_URL}/api/bot-actions/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preReservationHoldMinutes: 45,
          handoverMessage: customMsg
        })
      });
      assert.equal(postRes.status, 200);
      const postData = await postRes.json();
      assert.equal(postData.settings.preReservationHoldMinutes, 45);
      assert.equal(postData.settings.handoverMessage, customMsg);

      // Verify GET persistence
      const getRes = await fetch(`${BASE_URL}/api/bot-actions/settings`);
      const getData = await getRes.json();
      assert.equal(getData.settings.preReservationHoldMinutes, 45);
      assert.equal(getData.settings.handoverMessage, customMsg);

      // Disable one action and check if the custom handoverMessage is returned in 403
      await fetch(`${BASE_URL}/api/bot-actions/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowedActions: { checkAvailability: false }
        })
      });

      const blockedRes = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-11-01&checkOut=2026-11-03&guests=2`);
      assert.equal(blockedRes.status, 403);
      const blockedData = await blockedRes.json();
      assert.equal(blockedData.message, customMsg);

      // Restore action to true
      await fetch(`${BASE_URL}/api/bot-actions/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowedActions: { checkAvailability: true }
        })
      });
    });

    it("Adversarial/Edge Payload: Empty payload or malformed types do not corrupt DB", async () => {
      // 1. Empty body
      const emptyRes = await fetch(`${BASE_URL}/api/bot-actions/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      assert.equal(emptyRes.status, 200);

      // 2. Invalid non-boolean apiActionsEnabled should be ignored
      const invalidBoolRes = await fetch(`${BASE_URL}/api/bot-actions/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiActionsEnabled: "not_a_boolean" })
      });
      assert.equal(invalidBoolRes.status, 200);
      const dataAfter = await invalidBoolRes.json();
      assert.equal(typeof dataAfter.settings.apiActionsEnabled, "boolean");

      // 3. Negative preReservationHoldMinutes should be ignored
      const invalidHoldRes = await fetch(`${BASE_URL}/api/bot-actions/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preReservationHoldMinutes: -10 })
      });
      assert.equal(invalidHoldRes.status, 200);
      const dataHold = await invalidHoldRes.json();
      assert.ok(dataHold.settings.preReservationHoldMinutes > 0);
    });
  });
});

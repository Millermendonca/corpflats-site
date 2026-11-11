/**
 * Targeted Unit & Integration Test Suite — Resilient Restocker Voice Notification System
 * File: tests/restocker-voice-notifications.test.mjs
 * Execution: node --test tests/restocker-voice-notifications.test.mjs
 * 
 * Strict Isolation Rules:
 * - Tests ONLY the restocker voice notification logic, profile segmentation, tolerance window,
 *   deduplication store, queue sequencing, and checkout notification creation in the backend.
 * - Directly exercises both the runtime backend services and the transpiled client voice engine.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import {
  applyReservationCheckoutAndEarlyRelease,
  buildTodayCheckoutsSummaryForRestockers
} from "../artifacts/api-server/zapi-service.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// ── In-Memory DOM / Browser Storage Shim for Testing Client Voice Engine ──────
class MockLocalStorage {
  constructor() {
    this.store = new Map();
    this.throwOnSetItem = false;
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    if (this.throwOnSetItem) {
      throw new Error("QuotaExceededError: DomException 22");
    }
    this.store.set(String(key), String(value));
  }
  removeItem(key) {
    this.store.delete(String(key));
  }
  clear() {
    this.store.clear();
    this.throwOnSetItem = false;
  }
}

class MockSpeechSynthesisUtterance {
  constructor(text) {
    this.text = text;
    this.lang = "pt-BR";
    this.rate = 1.0;
    this.pitch = 1.0;
    this.volume = 1.0;
    this.voice = null;
    this.onend = null;
    this.onerror = null;
  }
}

class MockSpeechSynthesis {
  constructor() {
    this.speaking = false;
    this.paused = false;
    this.spokenUtterances = [];
    this.cancelledCount = 0;
    this.syncThrowOnSpeak = false;
    this.autoEnd = true;
    this.lastUtterance = null;
    this.pendingTimers = [];
  }
  getVoices() {
    return [
      { name: "Luciana (Brazil)", lang: "pt-BR" },
      { name: "Google português do Brasil", lang: "pt-BR" }
    ];
  }
  speak(utterance) {
    if (this.syncThrowOnSpeak) {
      throw new Error("AudioContext output device error");
    }
    this.spokenUtterances.push(utterance);
    this.lastUtterance = utterance;
    this.speaking = true;
    if (this.autoEnd) {
      // Simula conclusão assíncrona imediata para testes
      const t = setImmediate(() => {
        this.speaking = false;
        if (typeof utterance.onend === "function") {
          utterance.onend({ type: "end", target: utterance });
        }
      });
      this.pendingTimers.push(t);
    }
  }
  resume() {
    this.paused = false;
  }
  pause() {
    this.paused = true;
  }
  cancel() {
    this.speaking = false;
    this.paused = false;
    this.cancelledCount++;
    if (this.lastUtterance && typeof this.lastUtterance.onerror === "function") {
      const u = this.lastUtterance;
      this.lastUtterance = null;
      const t = setImmediate(() => {
        u.onerror({ type: "error", error: "canceled" });
      });
      this.pendingTimers.push(t);
    }
  }
  clearPending() {
    for (const t of this.pendingTimers) {
      clearImmediate(t);
    }
    this.pendingTimers = [];
    if (this.lastUtterance) {
      try {
        this.lastUtterance.onend = null;
        this.lastUtterance.onerror = null;
      } catch {}
      this.lastUtterance = null;
    }
  }
}

// Configura ambiente simulado antes de carregar o módulo
const mockLocalStorage = new MockLocalStorage();
const mockSessionStorage = new MockLocalStorage();
const mockSpeechSynthesis = new MockSpeechSynthesis();

globalThis.window = {
  localStorage: mockLocalStorage,
  sessionStorage: mockSessionStorage,
  speechSynthesis: mockSpeechSynthesis,
  SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
  addEventListener: () => {},
  removeEventListener: () => {}
};
globalThis.localStorage = mockLocalStorage;
globalThis.sessionStorage = mockSessionStorage;
globalThis.speechSynthesis = mockSpeechSynthesis;
globalThis.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
globalThis.navigator = { onLine: true };

// Transpila e carrega dinamicamente o código real de restocker-voice-notifications.ts
const tsSource = fs.readFileSync(
  path.join(rootDir, "artifacts/limpeza/src/lib/restocker-voice-notifications.ts"),
  "utf8"
);
const transpiled = ts.transpileModule(tsSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022
  }
});
const b64 = Buffer.from(transpiled.outputText).toString("base64");
const voiceModule = await import("data:text/javascript;base64," + b64);

const {
  isRestockerProfile,
  isCheckoutWithinTolerance,
  buildCheckoutDedupeKey,
  isCheckoutAlreadySpoken,
  markCheckoutAsSpoken,
  getSpokenCheckoutsMap,
  enqueueCheckoutAnnouncement,
  testVoiceAnnouncement,
  unlockSpeechAudio,
  resetVoiceNotifierForTesting,
  getBrasiliaTodayYmd,
  cleanFlatNumber,
  FLAT_TITLE_REGEX,
  getVoiceNotifierState
} = voiceModule;

describe("Resilient Restocker Voice Notification System — Targeted Test Suite", () => {

  beforeEach(async () => {
    mockSpeechSynthesis.clearPending();
    mockLocalStorage.clear();
    mockSessionStorage.clear();
    mockSpeechSynthesis.spokenUtterances = [];
    mockSpeechSynthesis.speaking = false;
    mockSpeechSynthesis.paused = false;
    mockSpeechSynthesis.cancelledCount = 0;
    mockSpeechSynthesis.syncThrowOnSpeak = false;
    mockSpeechSynthesis.autoEnd = true;
    mockSpeechSynthesis.lastUtterance = null;
    resetVoiceNotifierForTesting();
    await new Promise(r => setTimeout(r, 20));
  });

  // ── 1. Paridade SHA-256 Twin-Server dos Arquivos Tocados ────────────────────
  describe("1. Paridade Byte-a-Byte Twin-Server (AGENTS.md)", () => {
    it("artifacts/api-server/demo-server.mjs e scripts/demo-server.mjs devem possuir hashes idênticos", () => {
      const fileA = fs.readFileSync(path.join(rootDir, "artifacts/api-server/demo-server.mjs"));
      const fileB = fs.readFileSync(path.join(rootDir, "scripts/demo-server.mjs"));
      const hashA = crypto.createHash("sha256").update(fileA).digest("hex");
      const hashB = crypto.createHash("sha256").update(fileB).digest("hex");
      assert.strictEqual(hashA, hashB, "demo-server.mjs deve manter paridade SHA-256 exata");
    });

    it("artifacts/api-server/zapi-service.mjs e scripts/zapi-service.mjs devem possuir hashes idênticos", () => {
      const fileA = fs.readFileSync(path.join(rootDir, "artifacts/api-server/zapi-service.mjs"));
      const fileB = fs.readFileSync(path.join(rootDir, "scripts/zapi-service.mjs"));
      const hashA = crypto.createHash("sha256").update(fileA).digest("hex");
      const hashB = crypto.createHash("sha256").update(fileB).digest("hex");
      assert.strictEqual(hashA, hashB, "zapi-service.mjs deve manter paridade SHA-256 exata");
    });
  });

  // ── 2. Segmentação Estrita de Perfil (R1) ───────────────────────────────────
  describe("2. Segmentação Estrita de Perfil (R1)", () => {
    it("Permite unicamente anserve_repositora quando autenticado diretamente", () => {
      assert.strictEqual(isRestockerProfile({ role: "anserve_repositora" }), true);
    });

    it("Permite anserve_repositora com maiúsculas ou espaços em branco (tolerância de casing)", () => {
      assert.strictEqual(isRestockerProfile({ role: "ANSERVE_REPOSITORA" }), true);
      assert.strictEqual(isRestockerProfile({ role: " anserve_repositora " }), true);
    });

    it("Bloqueia rigorosamente usuários admin, dev, recepcao, camareira e gestores", () => {
      assert.strictEqual(isRestockerProfile({ role: "admin" }), false, "Admin deve ser bloqueado");
      assert.strictEqual(isRestockerProfile({ role: "dev" }), false, "Dev deve ser bloqueado");
      assert.strictEqual(isRestockerProfile({ role: "recepcao" }), false, "Recepcao deve ser bloqueada");
      assert.strictEqual(isRestockerProfile({ role: "camareira" }), false, "Camareira deve ser bloqueada");
      assert.strictEqual(isRestockerProfile({ role: "anserve_gestor" }), false, "Gestor deve ser bloqueado");
      assert.strictEqual(isRestockerProfile({ role: "anserve_faturamento" }), false, "Faturamento deve ser bloqueado");
      assert.strictEqual(isRestockerProfile({ role: "guest" }), false, "Guest deve ser bloqueado");
      assert.strictEqual(isRestockerProfile(null), false, "Deslogado sem token deve ser bloqueado");
    });

    it("Reconhece sessão da repositora autenticada via PIN no Portal /frigobar-reposicao", () => {
      mockLocalStorage.setItem("corpflats_anserve_token", "valid_pin_token_123");
      assert.strictEqual(isRestockerProfile(null), true);
    });

    it("Reconhece sessão em cache no sessionStorage com role anserve_repositora", () => {
      mockSessionStorage.setItem("gfm_auth_user_session_v1", JSON.stringify({ role: "anserve_repositora" }));
      assert.strictEqual(isRestockerProfile(null), true);
    });
  });

  // ── 3. Janela de Tolerância de 4 Horas e Recuperação Offline (R2) ───────────
  describe("3. Janela de Tolerância de 4 Horas e Recuperação Offline (R2)", () => {
    it("Aceita check-out recente ocorrido há 10 minutos no mesmo dia", () => {
      const now = Date.now();
      const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();
      assert.strictEqual(isCheckoutWithinTolerance(tenMinutesAgo, null, now), true);
    });

    it("Aceita check-out no limite da janela de 4 horas (ex: 3h50m atrás)", () => {
      const now = Date.now();
      const threeHoursFiftyAgo = new Date(now - (3 * 3600 + 50 * 60) * 1000).toISOString();
      assert.strictEqual(isCheckoutWithinTolerance(threeHoursFiftyAgo, null, now), true);
    });

    it("Aceita check-out exatamente no limite da janela de 4 horas (4h00m00s)", () => {
      const now = Date.now();
      const exactFourHoursAgo = new Date(now - 4 * 3600 * 1000).toISOString();
      assert.strictEqual(isCheckoutWithinTolerance(exactFourHoursAgo, null, now), true);
    });

    it("Descarta rigorosamente check-outs ocorridos há mais de 4 horas (ex: 4h01m ou 6h atrás)", () => {
      const now = Date.now();
      const fourHoursOneAgo = new Date(now - (4 * 3600 + 60) * 1000).toISOString();
      const sixHoursAgo = new Date(now - 6 * 3600 * 1000).toISOString();
      assert.strictEqual(isCheckoutWithinTolerance(fourHoursOneAgo, null, now), false, "Deve descartar check-out de 4h01m atrás");
      assert.strictEqual(isCheckoutWithinTolerance(sixHoursAgo, null, now), false, "Deve descartar check-out de 6h atrás");
    });

    it("Descarta check-outs de dias anteriores mesmo com diferença curta de horas", () => {
      const now = Date.now();
      const yesterday = new Date(now - 24 * 3600 * 1000).toISOString();
      assert.strictEqual(isCheckoutWithinTolerance(yesterday, null, now), false, "Check-outs de ontem devem ser descartados");
    });

    it("Descarta timestamps nulos, vazios ou com strings de data inválidas", () => {
      const now = Date.now();
      assert.strictEqual(isCheckoutWithinTolerance(null, null, now), false);
      assert.strictEqual(isCheckoutWithinTolerance("invalid-date-string", null, now), false);
      assert.strictEqual(isCheckoutWithinTolerance(null, "hoje", now), false);
      assert.strictEqual(isCheckoutWithinTolerance(null, "texto_qualquer", now), false);
    });

    it("Suporta horários de check-out nos formatos HH:MM, HH:MM:SS, 11h30, 11h30m e 11h30min em Brasília", () => {
      const todayYmd = getBrasiliaTodayYmd();
      const refTimeMs = new Date(`${todayYmd}T12:00:00-03:00`).getTime();

      // Check-out às 11:30 (30m atrás) -> Aceita
      assert.strictEqual(isCheckoutWithinTolerance(null, "11:30", refTimeMs), true);
      // Check-out às 11:30:15 (com segundos) -> Aceita
      assert.strictEqual(isCheckoutWithinTolerance(null, "11:30:15", refTimeMs), true);
      // Check-out às 11h30 (formato 'h') -> Aceita
      assert.strictEqual(isCheckoutWithinTolerance(null, "11h30", refTimeMs), true);
      // Check-out às 11h30m e 11h30min (com sufixo m/min) -> Aceita
      assert.strictEqual(isCheckoutWithinTolerance(null, "11h30m", refTimeMs), true);
      assert.strictEqual(isCheckoutWithinTolerance(null, "11h30min", refTimeMs), true);
      // Check-out às 07:00 (5h atrás) -> Descarta
      assert.strictEqual(isCheckoutWithinTolerance(null, "07:00", refTimeMs), false);
    });
  });

  // ── 4. Deduplicação Estrita, Alphanumeric Flats e Fila de Fala (R3) ─────────
  describe("4. Deduplicação Estrita e Gerenciamento de Fila de Fala (R3)", () => {
    it("Garante frase falada exata 'Check-out flat {número}' com flat limpo", () => {
      const res = enqueueCheckoutAnnouncement({ id: "item_1", flatNumber: "1004" });
      assert.strictEqual(res, true);
      assert.strictEqual(mockSpeechSynthesis.spokenUtterances.length, 1);
      assert.strictEqual(mockSpeechSynthesis.spokenUtterances[0].text, "Check-out flat 1004");
      assert.strictEqual(mockSpeechSynthesis.spokenUtterances[0].lang, "pt-BR");
    });

    it("Suporta flats alfanuméricos como 104B, PH-01 e 202-A sem truncamento", () => {
      const res1 = enqueueCheckoutAnnouncement({ id: "item_alphanumeric_1", flatNumber: "104B" });
      assert.strictEqual(res1, true);
      assert.strictEqual(mockSpeechSynthesis.spokenUtterances[0].text, "Check-out flat 104B");

      const res2 = enqueueCheckoutAnnouncement({ id: "item_alphanumeric_2", flatNumber: "PH-01" });
      assert.strictEqual(res2, true);
    });

    it("Remove prefixos 'Apto', 'Apt', 'Apartamento', 'Quarto', 'UH' sem corromper para 'o 204'", () => {
      assert.strictEqual(cleanFlatNumber("Apto 204"), "204");
      assert.strictEqual(cleanFlatNumber("Apto. 204"), "204");
      assert.strictEqual(cleanFlatNumber("Apt 204"), "204");
      assert.strictEqual(cleanFlatNumber("Apartamento 502"), "502");
      assert.strictEqual(cleanFlatNumber("Quarto 301-A"), "301-A");
      assert.strictEqual(cleanFlatNumber("UH 605"), "605");
      assert.strictEqual(cleanFlatNumber("Flat 1004"), "1004");

      const resApto = enqueueCheckoutAnnouncement({ id: "item_apto_204", flatNumber: "Apto 204" });
      assert.strictEqual(resApto, true);
      assert.strictEqual(mockSpeechSynthesis.spokenUtterances[0].text, "Check-out flat 204", "Não deve enunciar 'Check-out flat o 204'");
    });

    it("Extrai corretamente flat de títulos de notificação com prefixo Apto ou Apartamento", () => {
      const title1 = "Check-out Realizado - Apto 204";
      const title2 = "⚡ Check-out Antecipado - Apt 104B";
      const title3 = "Check-out Realizado - Apartamento 502";
      const title4 = "Check-out Realizado - UH 703";

      assert.strictEqual(title1.match(FLAT_TITLE_REGEX)?.[1], "204");
      assert.strictEqual(title2.match(FLAT_TITLE_REGEX)?.[1], "104B");
      assert.strictEqual(title3.match(FLAT_TITLE_REGEX)?.[1], "502");
      assert.strictEqual(title4.match(FLAT_TITLE_REGEX)?.[1], "703");
    });

    it("Rejeita flat numbers nulos, vazios ou indefinidos", () => {
      assert.strictEqual(enqueueCheckoutAnnouncement({ id: "bad_1", flatNumber: "" }), false);
      assert.strictEqual(enqueueCheckoutAnnouncement({ id: "bad_2", flatNumber: "undefined" }), false);
      assert.strictEqual(enqueueCheckoutAnnouncement({ id: "bad_3", flatNumber: "null" }), false);
    });

    it("Impede duplicações no reload ou reexecução de consultas (deduplicação via localStorage)", () => {
      const first = enqueueCheckoutAnnouncement({ id: "notif_201", flatNumber: "502" });
      assert.strictEqual(first, true);

      // Nova consulta tenta enfileirar o mesmo item
      const second = enqueueCheckoutAnnouncement({ id: "notif_201", flatNumber: "502" });
      assert.strictEqual(second, false, "Segundo enfileiramento deve ser descartado");

      // Consulta complementar tenta com mesmo flat e reservationCode
      const third = enqueueCheckoutAnnouncement({ id: "other_id", flatNumber: "502" });
      assert.strictEqual(third, false, "Mesmo flat já anunciado hoje deve ser deduplicado");
    });

    it("Mantém deduplicação ativa via cache em memória caso localStorage falhe ou lance QuotaExceededError", () => {
      // Simula falha do localStorage (ex: navegação anônima restritiva ou quota estourada)
      mockLocalStorage.throwOnSetItem = true;

      const first = enqueueCheckoutAnnouncement({ id: "notif_quota_1", flatNumber: "901" });
      assert.strictEqual(first, true);

      // Segundo enfileiramento deve ser bloqueado pelo inMemorySpokenMap mesmo com localStorage quebrado
      const second = enqueueCheckoutAnnouncement({ id: "notif_quota_1", flatNumber: "901" });
      assert.strictEqual(second, false, "Cache em memória deve impedir repetições mesmo se localStorage falhar");

      const sameFlat = enqueueCheckoutAnnouncement({ id: "notif_quota_2", flatNumber: "901" });
      assert.strictEqual(sameFlat, false, "Flat 901 já falado deve ser deduplicado em memória");
    });

    it("Testar Voz manual não bloqueia check-outs reais futuros do mesmo flat", async () => {
      const testRes = testVoiceAnnouncement("1004");
      assert.strictEqual(testRes, true);

      const realRes = enqueueCheckoutAnnouncement({
        id: "real_notif_999",
        flatNumber: "1004",
        reservationCode: "RES-999-1004",
        occurredAt: new Date().toISOString()
      });
      assert.strictEqual(realRes, true, "Check-out real do Flat 1004 NÃO deve ser silenciado por teste anterior");
      await new Promise(r => setTimeout(r, 50));
    });

    it("Recupera e sanitiza estado de localStorage corrompido com arrays ou JSON inválido", () => {
      mockLocalStorage.setItem("corpflats_restocker_spoken_checkouts_v1", "[]");
      const map = getSpokenCheckoutsMap();
      assert.deepStrictEqual(map, {}, "Array corrompido deve retornar objeto seguro vazio");

      mockLocalStorage.setItem("corpflats_restocker_spoken_checkouts_v1", "{invalid json");
      const mapBad = getSpokenCheckoutsMap();
      assert.deepStrictEqual(mapBad, {}, "JSON inválido deve retornar objeto seguro vazio");
    });

    it("Trava de idempotência contra double-cleanup protege itens subsequentes na fila em caso de cancelamento do watchdog", async () => {
      // Desativa auto-end para simular travamento
      mockSpeechSynthesis.autoEnd = false;

      enqueueCheckoutAnnouncement({ id: "stalled_1", flatNumber: "101" });
      enqueueCheckoutAnnouncement({ id: "queued_2", flatNumber: "102" });

      // Reativa auto-end para os próximos itens antes do cancelamento
      mockSpeechSynthesis.autoEnd = true;

      // Simula watchdog cancelando o motor de voz durante o item 1 travado
      mockSpeechSynthesis.cancel();

      // Aguarda 600ms para a pausa natural de 400ms e processamento automático do item 2
      await new Promise(r => setTimeout(r, 600));

      const spokenTexts = mockSpeechSynthesis.spokenUtterances.map(u => u.text);
      assert.ok(spokenTexts.includes("Check-out flat 101"), "Item 1 deve ter sido iniciado");
      assert.ok(spokenTexts.includes("Check-out flat 102"), "Item 2 NÃO deve ser descartado por double-shift do watchdog");
    });

    it("Exceção síncrona em speak() não deixa watchdog ativo congelando itens futuros", async () => {
      mockSpeechSynthesis.syncThrowOnSpeak = true;

      // Enfileira item com áudio quebrando
      enqueueCheckoutAnnouncement({ id: "error_item_1", flatNumber: "303" });

      // O erro é tratado sem travar a aplicação
      mockSpeechSynthesis.syncThrowOnSpeak = false;

      // Novo item é enfileirado e processado normalmente
      const res = enqueueCheckoutAnnouncement({ id: "good_item_2", flatNumber: "304" });
      assert.strictEqual(res, true);
    });
  });

  // ── 5. Registro Automático de Notificação no Backend (zapi-service) ────────────
  describe("5. Registro Automático de Notificação no Backend (zapi-service)", () => {
    it("applyReservationCheckoutAndEarlyRelease deve inserir evento de check-out em db.notifications", async () => {
      const fakeDb = {
        notifications: [],
        reservations: [],
        flats: [{ id: 4, number: "1004" }],
        minibarSettings: {}
      };

      const fakeReservation = {
        id: 777,
        code: "RES-777",
        flatId: 4,
        flatNumber: "1004",
        guestName: "Hóspede Teste",
        checkoutDate: "2026-11-11",
        status: "confirmada"
      };

      fakeDb.reservations.push(fakeReservation);

      let saved = false;
      const saveDatabase = () => { saved = true; };

      await applyReservationCheckoutAndEarlyRelease(fakeDb, saveDatabase, fakeReservation, {
        nowIso: "2026-11-11T11:30:00.000Z",
        timeStr: "11:30",
        source: "reception_checkout",
        reportedBy: "Recepção / Teste",
        skipManagerWhatsAppAlert: true,
        skipRestockerWhatsAppAlert: true
      });

      assert.strictEqual(fakeReservation.checkoutDone, true);
      assert.strictEqual(fakeReservation.status, "completed");

      // Verifica se a notificação foi adicionada
      const notif = fakeDb.notifications.find(n => n.category === "checkout");
      assert.ok(notif, "Deve existir notificação de categoria 'checkout'");
      assert.strictEqual(String(notif.metadata?.flatNumber), "1004");
      assert.strictEqual(notif.metadata?.code, "RES-777");
      assert.strictEqual(notif.metadata?.actualCheckoutAt, "2026-11-11T11:30:00.000Z");
    });

    it("buildTodayCheckoutsSummaryForRestockers deve retornar actualCheckoutAt para o filtro de 4h", () => {
      const todayStr = "2026-11-11";
      const fakeDb = {
        reservations: [
          {
            id: 888,
            code: "RES-888",
            flatId: 8,
            flatNumber: "802",
            guestName: "Marina Santos",
            checkoutDate: todayStr,
            actualCheckoutAt: "2026-11-11T10:15:00.000Z",
            actualCheckoutTime: "10:15",
            checkoutDone: true,
            status: "completed"
          }
        ],
        flats: [{ id: 8, number: "802" }]
      };

      const summary = buildTodayCheckoutsSummaryForRestockers(fakeDb, todayStr);
      assert.strictEqual(summary.doneCount, 1);
      assert.strictEqual(summary.doneCheckouts.length, 1);
      assert.strictEqual(summary.doneCheckouts[0].flatNumber, "802");
      assert.strictEqual(summary.doneCheckouts[0].actualCheckoutAt, "2026-11-11T10:15:00.000Z");
    });
  });

});

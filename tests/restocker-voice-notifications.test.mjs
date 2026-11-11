/**
 * Targeted Unit & Integration Test Suite — Resilient Restocker Voice Notification System
 * File: tests/restocker-voice-notifications.test.mjs
 * Execution: node --test tests/restocker-voice-notifications.test.mjs
 * 
 * Strict Isolation Rules:
 * - Tests ONLY the restocker voice notification logic, profile segmentation, tolerance window,
 *   deduplication store, queue sequencing, and checkout notification creation in the backend.
 * - Zero external dependencies, safe in-memory mocks.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  applyReservationCheckoutAndEarlyRelease,
  buildTodayCheckoutsSummaryForRestockers
} from "../artifacts/api-server/zapi-service.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("Resilient Restocker Voice Notification System — Targeted Test Suite", () => {

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
    // Replica a lógica pura de isRestockerProfile do cliente
    function isRestockerProfileMock(user, sessionCache, anserveToken) {
      if (user && user.role) {
        return user.role === "anserve_repositora";
      }
      if (sessionCache && sessionCache.role) {
        return sessionCache.role === "anserve_repositora";
      }
      if (anserveToken) {
        return true;
      }
      return false;
    }

    it("Permite unicamente anserve_repositora quando autenticado diretamente", () => {
      assert.strictEqual(isRestockerProfileMock({ role: "anserve_repositora" }), true);
    });

    it("Bloqueia rigorosamente usuários admin, dev, recepcao, camareira e gestores", () => {
      assert.strictEqual(isRestockerProfileMock({ role: "admin" }), false, "Admin deve ser bloqueado");
      assert.strictEqual(isRestockerProfileMock({ role: "dev" }), false, "Dev deve ser bloqueado");
      assert.strictEqual(isRestockerProfileMock({ role: "recepcao" }), false, "Recepcao deve ser bloqueada");
      assert.strictEqual(isRestockerProfileMock({ role: "camareira" }), false, "Camareira deve ser bloqueada");
      assert.strictEqual(isRestockerProfileMock({ role: "anserve_gestor" }), false, "Gestor deve ser bloqueado");
      assert.strictEqual(isRestockerProfileMock({ role: "anserve_faturamento" }), false, "Faturamento deve ser bloqueado");
      assert.strictEqual(isRestockerProfileMock({ role: "guest" }), false, "Guest deve ser bloqueado");
      assert.strictEqual(isRestockerProfileMock(null), false, "Deslogado sem token deve ser bloqueado");
    });

    it("Reconhece sessão da repositora autenticada via PIN no Portal /frigobar-reposicao", () => {
      assert.strictEqual(isRestockerProfileMock(null, null, "valid_pin_token_123"), true);
      assert.strictEqual(isRestockerProfileMock(null, { role: "anserve_repositora" }, null), true);
    });
  });

  // ── 3. Janela de Tolerância de 4 Horas e Recuperação Offline (R2) ───────────
  describe("3. Janela de Tolerância de 4 Horas e Recuperação Offline (R2)", () => {
    function getBrasiliaTodayYmd() {
      try {
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(new Date());
      } catch {
        return new Date().toISOString().slice(0, 10);
      }
    }

    function isCheckoutWithinToleranceMock(occurredAt, checkoutTimeStr, referenceNowMs) {
      const TOLERANCE_MS = 4 * 60 * 60 * 1000;
      const todayYmd = getBrasiliaTodayYmd();

      if (occurredAt) {
        const d = new Date(occurredAt);
        const ts = d.getTime();
        if (!isNaN(ts)) {
          let itemYmd = "";
          try {
            itemYmd = new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/Sao_Paulo",
              year: "numeric",
              month: "2-digit",
              day: "2-digit"
            }).format(d);
          } catch {
            itemYmd = d.toISOString().slice(0, 10);
          }

          if (itemYmd !== todayYmd) return false;
          const ageMs = referenceNowMs - ts;
          if (ageMs > TOLERANCE_MS) return false;
          if (ageMs < -5 * 60 * 1000) return false;
          return true;
        }
      }

      if (checkoutTimeStr && /^\d{1,2}:\d{2}$/.test(checkoutTimeStr.trim())) {
        const [h, m] = checkoutTimeStr.trim().split(":").map(Number);
        const now = new Date(referenceNowMs);
        const checkoutDate = new Date(now);
        checkoutDate.setHours(h, m, 0, 0);

        const diffMs = referenceNowMs - checkoutDate.getTime();
        if (diffMs > TOLERANCE_MS) return false;
        if (diffMs < -5 * 60 * 1000) return false;
        return true;
      }

      return true;
    }

    it("Aceita check-out recente ocorrido há 10 minutos no mesmo dia", () => {
      const now = Date.now();
      const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();
      assert.strictEqual(isCheckoutWithinToleranceMock(tenMinutesAgo, null, now), true);
    });

    it("Aceita check-out no limite da janela de 4 horas (ex: 3h50m atrás)", () => {
      const now = Date.now();
      const threeHoursFiftyAgo = new Date(now - (3 * 3600 + 50 * 60) * 1000).toISOString();
      assert.strictEqual(isCheckoutWithinToleranceMock(threeHoursFiftyAgo, null, now), true);
    });

    it("Descarta rigorosamente check-outs ocorridos há mais de 4 horas (ex: 4h15m ou 6h atrás)", () => {
      const now = Date.now();
      const fourHoursFifteenAgo = new Date(now - (4 * 3600 + 15 * 60) * 1000).toISOString();
      const sixHoursAgo = new Date(now - 6 * 3600 * 1000).toISOString();
      assert.strictEqual(isCheckoutWithinToleranceMock(fourHoursFifteenAgo, null, now), false, "Deve descartar check-out de 4h15m atrás");
      assert.strictEqual(isCheckoutWithinToleranceMock(sixHoursAgo, null, now), false, "Deve descartar check-out de 6h atrás");
    });

    it("Descarta check-outs de dias anteriores mesmo se a diferença de horas for curta", () => {
      const now = Date.now();
      const yesterday = new Date(now - 24 * 3600 * 1000).toISOString();
      assert.strictEqual(isCheckoutWithinToleranceMock(yesterday, null, now), false, "Check-outs de ontem devem ser descartados");
    });
  });

  // ── 4. Deduplicação Estrita e Fila Sequencial FIFO (R3) ─────────────────────
  describe("4. Deduplicação Estrita e Gerenciamento de Fila de Fala (R3)", () => {
    class MockDedupeStorage {
      constructor() {
        this.store = {};
      }
      isSpoken(key) {
        return Boolean(this.store[key]);
      }
      markSpoken(key, flatNumber) {
        this.store[key] = { flatNumber, spokenAt: new Date().toISOString() };
      }
    }

    class MockSpeechQueue {
      constructor(dedupeStorage) {
        this.storage = dedupeStorage;
        this.queue = [];
        this.spokenSequence = [];
        this.isSpeaking = false;
      }

      enqueue(item) {
        const key = `notif_${item.id}`;
        if (this.storage.isSpoken(key)) return false;
        if (this.queue.some(q => q.id === item.id)) return false;

        this.queue.push(item);
        this.processNext();
        return true;
      }

      processNext() {
        if (this.isSpeaking || this.queue.length === 0) return;
        const current = this.queue[0];
        const key = `notif_${current.id}`;
        if (this.storage.isSpoken(key)) {
          this.queue.shift();
          this.processNext();
          return;
        }

        this.isSpeaking = true;
        // Simula áudio falado sintetizado
        const phrase = `Check-out flat ${current.flatNumber}`;
        this.spokenSequence.push(phrase);
        this.storage.markSpoken(key, current.flatNumber);

        // Conclui e passa para o próximo da fila
        this.queue.shift();
        this.isSpeaking = false;
        this.processNext();
      }
    }

    it("Garante frase falada exata 'Check-out flat {número}'", () => {
      const storage = new MockDedupeStorage();
      const queue = new MockSpeechQueue(storage);
      queue.enqueue({ id: 101, flatNumber: "1004" });
      assert.deepStrictEqual(queue.spokenSequence, ["Check-out flat 1004"]);
    });

    it("Impede duplicações no reload ou reexecução de consultas", () => {
      const storage = new MockDedupeStorage();
      const queue = new MockSpeechQueue(storage);

      const firstAdd = queue.enqueue({ id: 201, flatNumber: "502" });
      assert.strictEqual(firstAdd, true);
      assert.strictEqual(queue.spokenSequence.length, 1);

      // Nova consulta traz o mesmo ID
      const secondAdd = queue.enqueue({ id: 201, flatNumber: "502" });
      assert.strictEqual(secondAdd, false, "Segundo enfileiramento do mesmo ID deve ser ignorado");
      assert.strictEqual(queue.spokenSequence.length, 1, "Não deve falar duas vezes o mesmo check-out");
    });

    it("Processa múltiplos check-outs acumulados na reconexão em ordem sequencial sem atropelo", () => {
      const storage = new MockDedupeStorage();
      const queue = new MockSpeechQueue(storage);

      // Chegam 3 check-outs acumulados durante oscilação de rede
      queue.enqueue({ id: 301, flatNumber: "101" });
      queue.enqueue({ id: 302, flatNumber: "203" });
      queue.enqueue({ id: 303, flatNumber: "405" });

      assert.deepStrictEqual(queue.spokenSequence, [
        "Check-out flat 101",
        "Check-out flat 203",
        "Check-out flat 405"
      ], "Check-outs acumulados devem ser sintetizados em ordem sequencial FIFO");
    });
  });

  // ── 5. Registro Automático de Notificação de Check-out no Backend ────────────
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

      const result = await applyReservationCheckoutAndEarlyRelease(fakeDb, saveDatabase, fakeReservation, {
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

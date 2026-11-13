import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import * as maidService from "../artifacts/api-server/maid-automation-service.mjs";
import * as zapiService from "../artifacts/api-server/zapi-service.mjs";

/**
 * Challenger M1-2 Empirical Stress Harness
 * Adversarial Testing of Hook Resilience, Non-Blocking Error Isolation & Concurrency
 */

// Global Unhandled Rejection Watcher
const unhandledRejections = [];
process.on("unhandledRejection", (reason, promise) => {
  unhandledRejections.push({ reason, promise });
});

function createMockSendZapi() {
  const sent = [];
  const fn = async (config, payload) => {
    sent.push({ config, ...payload, timestamp: new Date().toISOString() });
    return {
      success: true,
      method: "mock_zapi",
      messageId: `MOCK-${sent.length}`
    };
  };
  fn.sent = sent;
  return fn;
}

function createHarnessDb(overrides = {}) {
  return {
    zapiConfig: {
      enabled: true,
      testModeOnly: true,
      instanceId: "TEST_INSTANCE_CHALLENGER",
      token: "TEST_TOKEN_CHALLENGER",
      clientToken: "TEST_CLIENT_CHALLENGER",
      googleReviewUrl: "https://search.google.com/local/writereview?placeid=TEST_CHALLENGER_GOOGLE",
      npsManagerAlertPhone: "22998505276"
    },
    users: [
      {
        id: 2,
        username: "Cris",
        name: "Cris",
        phone: "22988486446",
        whatsapp: "5522988486446",
        role: "camareira",
        active: true
      },
      {
        id: 3,
        username: "Grazi",
        name: "Grazi",
        phone: "22999106204",
        whatsapp: "5522999106204",
        role: "camareira",
        active: true
      }
    ],
    flats: [
      { id: 1, number: "113", name: "Flat 113" },
      { id: 4, number: "211", name: "Flat 211" }
    ],
    cleaningRequests: [
      {
        id: 101,
        flatNumber: "113",
        requestDate: "2026-11-01",
        effectiveDate: "2026-11-01",
        completedAt: "2026-11-01T14:00:00.000Z",
        status: "clean",
        assignedUserId: 2,
        assignedUsername: "Cris",
        source: "checkout"
      },
      {
        id: 201,
        flatNumber: "211",
        requestDate: "2026-11-02",
        effectiveDate: "2026-11-02",
        completedAt: "2026-11-02T13:00:00.000Z",
        status: "clean",
        assignedUserId: 3,
        assignedUsername: "Grazi",
        source: "checkout"
      }
    ],
    reservations: [
      {
        id: "RES-113",
        code: "RES-113",
        guestName: "Alice Walker",
        guestPhone: "5522998881111",
        flatNumber: "113",
        checkinDate: "2026-11-01",
        checkoutDate: "2026-11-05",
        status: "checked_out"
      },
      {
        id: "RES-211",
        code: "RES-211",
        guestName: "Bob Dylan",
        guestPhone: "5522998882222",
        flatNumber: "211",
        checkinDate: "2026-11-02",
        checkoutDate: "2026-11-06",
        status: "checked_out"
      }
    ],
    npsResponses: [],
    reviews: [],
    observations: [],
    maidOpinionSynthesis: {},
    whatsappTemplates: structuredClone(zapiService.DEFAULT_WHATSAPP_TEMPLATES || []),
    ...overrides
  };
}

describe("CHALLENGER 2: Hook Resilience, Non-Blocking Error-Isolation & Concurrency", () => {
  const originalHook = globalThis.__CORPFLATS_MAID_REVIEW_HOOK__;

  afterEach(() => {
    // Restore canonical hook handler after each test
    globalThis.__CORPFLATS_MAID_REVIEW_HOOK__ = originalHook;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SUB-SUITE 1: Aggressive Failure Simulation in invokeMaidReviewHookSafe
  // ──────────────────────────────────────────────────────────────────────────
  describe("1. invokeMaidReviewHookSafe direct failure isolation", () => {
    it("1.1 Gracefully catches synchronous exception 'FATAL_DATABASE_CRASH'", async () => {
      globalThis.__CORPFLATS_MAID_REVIEW_HOOK__ = () => {
        throw new Error("FATAL_DATABASE_CRASH");
      };

      const db = createHarnessDb();
      const payload = { hookType: "score_5_received", score: 5, flatNumber: "113" };

      const res = await zapiService.invokeMaidReviewHookSafe(db, payload);
      assert.equal(res.handled, false);
      assert.match(res.error, /FATAL_DATABASE_CRASH/);
      assert.equal(unhandledRejections.length, 0, "No unhandled rejections allowed");
    });

    it("1.2 Gracefully catches asynchronous promise rejection 'FATAL_DATABASE_CRASH'", async () => {
      globalThis.__CORPFLATS_MAID_REVIEW_HOOK__ = async () => {
        await new Promise(r => setTimeout(r, 10));
        throw new Error("FATAL_DATABASE_CRASH");
      };

      const db = createHarnessDb();
      const payload = { hookType: "inline_sub5_comment_received", score: 3, flatNumber: "211" };

      const res = await zapiService.invokeMaidReviewHookSafe(db, payload);
      assert.equal(res.handled, false);
      assert.match(res.error, /FATAL_DATABASE_CRASH/);
      assert.equal(unhandledRejections.length, 0, "No unhandled rejections allowed");
    });

    it("1.3 Gracefully catches malformed/primitive rejection (string, null)", async () => {
      globalThis.__CORPFLATS_MAID_REVIEW_HOOK__ = () => {
        return Promise.reject("MALFORMED_STRING_ERROR");
      };

      const db = createHarnessDb();
      const payload = { hookType: "score_5_received", score: 5, flatNumber: "113" };

      const res = await zapiService.invokeMaidReviewHookSafe(db, payload);
      assert.equal(res.handled, false);
      assert.equal(res.error, "MALFORMED_STRING_ERROR");
      assert.equal(unhandledRejections.length, 0, "No unhandled rejections allowed");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SUB-SUITE 2: End-to-End WhatsApp NPS Flow Under Hook Fatal Crash
  // ──────────────────────────────────────────────────────────────────────────
  describe("2. handleInboundNpsScoreOrComment under aggressive hook crash", () => {
    it("2.1 Inbound Score '5' finishes gracefully, guest receives Google review link", async () => {
      // Aggressive failure simulation
      let hookCallCount = 0;
      globalThis.__CORPFLATS_MAID_REVIEW_HOOK__ = () => {
        hookCallCount++;
        throw new Error("FATAL_DATABASE_CRASH");
      };

      const mockSend = createMockSendZapi();
      const db = createHarnessDb({
        npsResponses: [
          {
            id: "nps_c2_1",
            reservationId: "RES-113",
            guestName: "Alice Walker",
            guestPhone: "5522998881111",
            flatNumber: "113",
            score: null,
            pendingResponse: true,
            surveyVerifiedSent: true,
            sentAt: new Date().toISOString()
          }
        ]
      });

      const res = await zapiService.handleInboundNpsScoreOrComment({
        db,
        phone: "5522998881111",
        rawPhone: "5522998881111",
        senderName: "Alice Walker",
        cleanText: "5",
        reservation: db.reservations[0],
        flatNumber: "113",
        saveDatabase: () => {},
        sendZapiFn: mockSend
      });

      // Assertions
      assert.equal(res.npsHandled, true, "NPS response must be marked as handled");
      assert.equal(res.score, 5, "Score must be 5");
      assert.equal(db.npsResponses[0].score, 5);
      assert.equal(db.npsResponses[0].awaitingFeedbackComment, false);
      assert.equal(db.npsResponses[0].googleLinkSent, true);

      // Verify guest received reply
      const sent = mockSend.sent.find(m => m.triggerEvent === "nps_approved");
      assert.ok(sent, "Guest must receive the 5-star approved message");
      assert.match(sent.message, /google\.com\/local\/writereview/, "Must include Google review link");

      // Verify hook was called and error was isolated
      assert.equal(hookCallCount, 1, "Hook must have been invoked");
      assert.equal(unhandledRejections.length, 0, "Zero unhandled promise rejections");
    });

    it("2.2 Inbound Score '3 - banheiro sujo' finishes gracefully, guest receives tpl_nps_score_3", async () => {
      let hookCallCount = 0;
      globalThis.__CORPFLATS_MAID_REVIEW_HOOK__ = async () => {
        hookCallCount++;
        await new Promise(r => setTimeout(r, 5));
        throw new Error("FATAL_DATABASE_CRASH");
      };

      const mockSend = createMockSendZapi();
      const db = createHarnessDb({
        npsResponses: [
          {
            id: "nps_c2_2",
            reservationId: "RES-211",
            guestName: "Bob Dylan",
            guestPhone: "5522998882222",
            flatNumber: "211",
            score: null,
            pendingResponse: true,
            surveyVerifiedSent: true,
            sentAt: new Date().toISOString()
          }
        ]
      });

      const res = await zapiService.handleInboundNpsScoreOrComment({
        db,
        phone: "5522998882222",
        rawPhone: "5522998882222",
        senderName: "Bob Dylan",
        cleanText: "3 - banheiro sujo",
        reservation: db.reservations[1],
        flatNumber: "211",
        saveDatabase: () => {},
        sendZapiFn: mockSend
      });

      // Assertions
      assert.equal(res.npsHandled, true, "NPS response must be marked as handled");
      assert.equal(res.score, 3, "Score must be 3");
      assert.equal(db.npsResponses[0].score, 3);
      assert.equal(db.npsResponses[0].comment, "banheiro sujo");
      assert.equal(db.npsResponses[0].awaitingFeedbackComment, false);

      // Verify guest received tpl_nps_score_3
      const sent = mockSend.sent.find(m => m.triggerEvent === "nps_score_3");
      assert.ok(sent, "Guest must receive tpl_nps_score_3 reply");
      assert.match(sent.message, /o que n[ãa]o saiu como esperado ou o que podemos melhorar/i, "Must prompt for feedback");

      // Verify hook was called and error was isolated
      assert.equal(hookCallCount, 1, "Hook must have been invoked");
      assert.equal(unhandledRejections.length, 0, "Zero unhandled promise rejections");
    });

    it("2.3 Step 2 follow-up text comment under hook crash finishes gracefully", async () => {
      let hookCallCount = 0;
      globalThis.__CORPFLATS_MAID_REVIEW_HOOK__ = () => {
        hookCallCount++;
        throw new Error("FATAL_DATABASE_CRASH");
      };

      const mockSend = createMockSendZapi();
      const db = createHarnessDb({
        npsResponses: [
          {
            id: "nps_c2_3",
            reservationId: "RES-211",
            guestName: "Bob Dylan",
            guestPhone: "5522998882222",
            flatNumber: "211",
            score: 3,
            comment: "",
            awaitingFeedbackComment: true,
            awaitingFeedbackSince: new Date().toISOString(),
            surveyVerifiedSent: true
          }
        ]
      });

      const res = await zapiService.handleInboundNpsScoreOrComment({
        db,
        phone: "5522998882222",
        rawPhone: "5522998882222",
        senderName: "Bob Dylan",
        cleanText: "O banheiro estava sujo e toalha rasgada",
        reservation: db.reservations[1],
        flatNumber: "211",
        saveDatabase: () => {},
        sendZapiFn: mockSend
      });

      assert.equal(res.npsHandled, true);
      assert.equal(res.action, "feedback_comment_received");
      assert.equal(db.npsResponses[0].comment, "O banheiro estava sujo e toalha rasgada");
      assert.equal(db.npsResponses[0].awaitingFeedbackComment, false);
      assert.equal(db.reviews.length, 1, "Must sync into db.reviews");

      const thanksSent = mockSend.sent.find(m => m.triggerEvent === "nps_feedback_thanks");
      assert.ok(thanksSent, "Guest must receive thank-you acknowledgment");

      assert.equal(hookCallCount, 1);
      assert.equal(unhandledRejections.length, 0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SUB-SUITE 3: Concurrency & Stress under Chaotic Hook Failures
  // ──────────────────────────────────────────────────────────────────────────
  describe("3. Concurrency & Stress test with multiple simultaneous inbounds", () => {
    it("3.1 20 simultaneous inbound messages with intermittent fatal crashes finish 100% gracefully", async () => {
      let crashCount = 0;
      let okCount = 0;

      // Intermittent crash: crash on every even call, succeed on odd
      globalThis.__CORPFLATS_MAID_REVIEW_HOOK__ = async () => {
        if (Math.random() > 0.5) {
          crashCount++;
          throw new Error("FATAL_DATABASE_CRASH_CHAOS");
        }
        okCount++;
        return { handled: true, chaos: "survived" };
      };

      const mockSend = createMockSendZapi();
      const db = createHarnessDb();

      // Populate 20 pending surveys
      const testCases = [];
      for (let i = 0; i < 20; i++) {
        const phone = `552299888${String(1000 + i).padStart(4, "0")}`;
        const flat = i % 2 === 0 ? "113" : "211";
        db.reservations.push({
          id: `RES-${i}`,
          code: `RES-${i}`,
          guestName: `Guest ${i}`,
          guestPhone: phone,
          flatNumber: flat,
          checkinDate: "2026-11-01",
          checkoutDate: "2026-11-05",
          status: "checked_out"
        });
        db.npsResponses.push({
          id: `nps_sim_${i}`,
          reservationId: `RES-${i}`,
          guestName: `Guest ${i}`,
          guestPhone: phone,
          flatNumber: flat,
          score: null,
          pendingResponse: true,
          surveyVerifiedSent: true,
          sentAt: new Date().toISOString()
        });

        const text = (i % 3 === 0) ? "5" : (i % 3 === 1) ? "3 - banheiro sujo" : "4";
        testCases.push({ phone, text, resId: `RES-${i}`, flat, name: `Guest ${i}` });
      }

      // Execute all 20 in parallel
      const results = await Promise.all(
        testCases.map(tc =>
          zapiService.handleInboundNpsScoreOrComment({
            db,
            phone: tc.phone,
            rawPhone: tc.phone,
            senderName: tc.name,
            cleanText: tc.text,
            reservation: db.reservations.find(r => r.id === tc.resId),
            flatNumber: tc.flat,
            saveDatabase: () => {},
            sendZapiFn: mockSend
          })
        )
      );

      // Verify every single one handled gracefully
      assert.equal(results.length, 20);
      for (const r of results) {
        assert.equal(r.npsHandled, true, "Every parallel call must have npsHandled: true");
      }

      // Verify zero unhandled rejections occurred
      assert.equal(unhandledRejections.length, 0, "Zero unhandled rejections across 20 parallel calls");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SUB-SUITE 4: Verify Hook Points 4 and 5 in demo-server.mjs
  // ──────────────────────────────────────────────────────────────────────────
  describe("4. demo-server.mjs Hook Points 4 and 5 Endpoints Verification", () => {
    let demoServer = null;
    let serverBaseUrl = "";

    before(async () => {
      // Pick an ephemeral port for testing
      const testPort = 5891 + Math.floor(Math.random() * 500);
      process.env.PORT = String(testPort);
      process.env.NODE_ENV = "test";

      // Import demo-server
      demoServer = await import("../artifacts/api-server/demo-server.mjs");
      serverBaseUrl = `http://127.0.0.1:${testPort}`;

      // Give server a moment to bind
      await new Promise(r => setTimeout(r, 200));
    });

    after(async () => {
      if (demoServer?.httpServer) {
        await new Promise(resolve => demoServer.httpServer.close(resolve));
      }
      setTimeout(() => process.exit(0), 300);
    });

    it("4.1 POST /api/ai/nps-response triggers Hook Point 4 and responds 200 even if hook crashes", async () => {
      let hookTriggered = false;
      let receivedPayload = null;

      globalThis.__CORPFLATS_MAID_REVIEW_HOOK__ = (db, payload) => {
        hookTriggered = true;
        receivedPayload = payload;
        // Aggressive crash simulation inside hook
        throw new Error("FATAL_DATABASE_CRASH_IN_HOOK_4");
      };

      const res = await fetch(`${serverBaseUrl}/api/ai/nps-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: "RES-113",
          guestPhone: "5522998881111",
          guestName: "Alice Walker",
          flatNumber: "113",
          score: 5,
          comment: "Estadia perfeita, cama muito macia"
        })
      });

      assert.equal(res.status, 200, "HTTP response must be 200 OK despite hook failure");
      const data = await res.json();
      assert.equal(data.success, true, "Body must indicate success");
      assert.ok(data.npsEntry, "Response must include npsEntry");
      assert.equal(data.npsEntry.score, 5);

      assert.equal(hookTriggered, true, "Hook Point 4 must have been triggered");
      assert.equal(receivedPayload.hookType, "portal_or_api_nps_response");
      assert.equal(receivedPayload.score, 5);
      assert.equal(receivedPayload.flatNumber, "113");
      assert.equal(unhandledRejections.length, 0, "No unhandled rejections");
    });

    it("4.2 POST /api/ai/import-review triggers Hook Point 5 and responds 200 even if hook crashes", async () => {
      let hookTriggered = false;
      let receivedPayload = null;

      globalThis.__CORPFLATS_MAID_REVIEW_HOOK__ = (db, payload) => {
        hookTriggered = true;
        receivedPayload = payload;
        // Aggressive async rejection simulation
        return Promise.reject(new Error("FATAL_DATABASE_CRASH_IN_HOOK_5"));
      };

      const res = await fetch(`${serverBaseUrl}/api/ai/import-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author: "Reviewer Booking",
          rating: 4,
          channel: "booking",
          comment: "Quarto limpo, porém o sinal de Wi-Fi oscilou um pouco.",
          flatMentioned: "211"
        })
      });

      assert.equal(res.status, 200, "HTTP response must be 200 OK despite hook failure");
      const data = await res.json();
      assert.equal(data.success, true, "Body must indicate success");
      assert.ok(data.review, "Response must include review object");
      assert.equal(data.review.rating, 4);

      assert.equal(hookTriggered, true, "Hook Point 5 must have been triggered");
      assert.equal(receivedPayload.hookType, "imported_review");
      assert.equal(receivedPayload.score, 4);
      assert.equal(receivedPayload.flatNumber, "211");
      assert.equal(unhandledRejections.length, 0, "No unhandled rejections");
    });

    it("4.3 POST /api/ai/nps-response with normal hook successfully attributes maid and triages", async () => {
      // Use original canonical hook
      globalThis.__CORPFLATS_MAID_REVIEW_HOOK__ = maidService.handleMaidReviewHook;

      // Seed reservations and cleanings in demoServer.db
      demoServer.db.reservations = demoServer.db.reservations || [];
      demoServer.db.cleaningRequests = demoServer.db.cleaningRequests || [];
      demoServer.db.users = demoServer.db.users || [];

      if (!demoServer.db.users.find(u => u.id === 2)) {
        demoServer.db.users.push({ id: 2, name: "Cris", username: "Cris", role: "camareira", phone: "22988486446" });
      }

      demoServer.db.reservations.unshift({
        id: "RES-999",
        code: "RES-999",
        flatNumber: "113",
        checkinDate: "2026-11-01",
        checkoutDate: "2026-11-05",
        guestName: "Canonical Guest",
        guestPhone: "5522998889999"
      });

      demoServer.db.cleaningRequests.unshift({
        id: 9991,
        flatNumber: "113",
        requestDate: "2026-11-01",
        status: "clean",
        assignedUserId: 2
      });

      const res = await fetch(`${serverBaseUrl}/api/ai/nps-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: "RES-999",
          guestPhone: "5522998889999",
          guestName: "Canonical Guest",
          flatNumber: "113",
          score: 5,
          comment: "Limpeza perfeita e toalhas muito cheirosas"
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.npsEntry.maidAttribution, "npsEntry must have maidAttribution populated");
      assert.equal(data.npsEntry.maidAttribution.maidId, 2, "Maid Cris must be attributed");
      assert.equal(data.npsEntry.maidAttribution.forwardToMaid, true, "Score 5 must forward to maid");
    });
  });
});

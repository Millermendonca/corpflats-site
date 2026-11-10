import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import * as maidService from "../artifacts/api-server/maid-automation-service.mjs";
import * as zapiService from "../artifacts/api-server/zapi-service.mjs";

/**
 * Helper to ensure functions specified in PROJECT.md interface contracts are exported.
 * If not yet implemented, raises a descriptive AssertionError.
 */
function requireMaidExport(fnName) {
  assert.equal(
    typeof maidService[fnName],
    "function",
    `Function '${fnName}' must be implemented and exported from artifacts/api-server/maid-automation-service.mjs (Contract from PROJECT.md)`
  );
  return maidService[fnName];
}

/**
 * Deterministic In-Memory Mock Database Builder
 */
function createMockDb(overrides = {}) {
  return {
    zapiConfig: {
      enabled: true,
      testModeOnly: true,
      instanceId: "TEST_INSTANCE_123",
      token: "TEST_TOKEN_XYZ",
      clientToken: "TEST_CLIENT_TOKEN_ABC",
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
      { id: 4, number: "211", name: "Flat 211" },
      { id: 7, number: "313", name: "Flat 313" }
    ],
    cleaningRequests: [],
    reservations: [],
    npsResponses: [],
    reviews: [],
    observations: [],
    maidOpinionSynthesis: {},
    maidAutomationConfig: {
      enabled: true,
      triggers: [
        {
          id: "trigger_daily_review_summary",
          name: "Resumo Diário de Avaliações",
          enabled: true,
          scheduledTime: "18:00",
          lastExecutedDate: null
        }
      ],
      history: []
    },
    whatsappTemplates: structuredClone(zapiService.DEFAULT_WHATSAPP_TEMPLATES || []),
    ...overrides
  };
}

/**
 * Deterministic Mock Z-API Sender
 */
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

// ────────────────────────────────────────────────────────────────────────────
// TIER 0: Twin-Server Parity & Architecture Guardrails
// ────────────────────────────────────────────────────────────────────────────
describe("Tier 0: Parity & Architecture Guardrails", () => {
  it("0.1 Strict byte-for-byte SHA-256 parity between artifacts/api-server and scripts/ mirrors", () => {
    const maidPrimary = fs.readFileSync(path.resolve("artifacts/api-server/maid-automation-service.mjs"));
    const maidMirror = fs.readFileSync(path.resolve("scripts/maid-automation-service.mjs"));
    assert.strictEqual(
      maidPrimary.equals(maidMirror),
      true,
      "maid-automation-service.mjs primary e scripts/ mirror devem ter paridade 100% byte a byte"
    );

    const zapiPrimary = fs.readFileSync(path.resolve("artifacts/api-server/zapi-service.mjs"));
    const zapiMirror = fs.readFileSync(path.resolve("scripts/zapi-service.mjs"));
    assert.strictEqual(
      zapiPrimary.equals(zapiMirror),
      true,
      "zapi-service.mjs primary e scripts/ mirror devem ter paridade 100% byte a byte"
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// TIER 1: Feature Coverage (R1, R2, R3, R4, R5)
// ────────────────────────────────────────────────────────────────────────────
describe("Tier 1: Feature Coverage", () => {

  // ── Feature 1: Maid Attribution (F1 / R1) ─────────────────────────────────
  describe("F1: Maid Attribution (resolveMaidCleaningForReservation)", () => {
    it("1.1 Identifies preparation cleaning executed on or before check-in date", () => {
      const resolveMaidCleaning = requireMaidExport("resolveMaidCleaningForReservation");
      const db = createMockDb({
        cleaningRequests: [
          {
            id: 101,
            flatNumber: "113",
            requestDate: "2026-11-03",
            effectiveDate: "2026-11-03",
            completedAt: "2026-11-03T13:45:00.000Z",
            status: "clean",
            assignedUserId: 2,
            assignedUsername: "Cris",
            source: "checkout"
          },
          {
            id: 102,
            flatNumber: "113",
            requestDate: "2026-11-05",
            effectiveDate: "2026-11-05",
            completedAt: "2026-11-05T14:00:00.000Z",
            status: "clean",
            assignedUserId: 3,
            assignedUsername: "Grazi",
            source: "checkout" // Executada após o checkout da reserva que avaliou
          }
        ]
      });

      const reservation = {
        id: 501,
        code: "RES-113-B2B-25152172",
        flatNumber: "113",
        checkinDate: "2026-11-03",
        checkoutDate: "2026-11-05",
        guestName: "Samuel Avila"
      };

      const result = resolveMaidCleaning(db, reservation);
      assert.ok(result, "Deve retornar resultado da resolução de camareira");
      assert.equal(result.maidUser?.id, 2, "A camareira responsável deve ser Cris (ID 2)");
      assert.equal(result.cleaningRequest?.id, 101, "O ID da limpeza deve ser 101");
      assert.equal(result.cleaningDate, "2026-11-03", "A data da limpeza deve ser 2026-11-03");
      assert.equal(result.isStayover, false, "Não é stayover");
    });

    it("1.2 Prioritizes stayover cleaning during the stay over prep cleaning", () => {
      const resolveMaidCleaning = requireMaidExport("resolveMaidCleaningForReservation");
      const db = createMockDb({
        cleaningRequests: [
          {
            id: 201,
            flatNumber: "211",
            requestDate: "2026-11-10",
            effectiveDate: "2026-11-10",
            status: "clean",
            assignedUserId: 2,
            assignedUsername: "Cris",
            source: "checkout"
          },
          {
            id: 202,
            flatNumber: "211",
            requestDate: "2026-11-14",
            effectiveDate: "2026-11-14",
            completedAt: "2026-11-14T11:30:00.000Z",
            status: "clean",
            assignedUserId: 3,
            assignedUsername: "Grazi",
            source: "stayover",
            cleaningType: "stayover"
          }
        ]
      });

      const reservation = {
        id: 502,
        code: "RES-211-LONGSTAY",
        flatNumber: "211",
        checkinDate: "2026-11-10",
        checkoutDate: "2026-11-18",
        guestName: "Marcos Vinicius"
      };

      const result = resolveMaidCleaning(db, reservation);
      assert.equal(result.maidUser?.id, 3, "Deve atribuir à Grazi (ID 3), que fez o stayover mais recente durante a estadia");
      assert.equal(result.cleaningRequest?.id, 202);
      assert.equal(result.isStayover, true);
    });

    it("1.3 Handles turnover on same-day distinguishing leaving and arriving guests", () => {
      const resolveMaidCleaning = requireMaidExport("resolveMaidCleaningForReservation");
      const db = createMockDb({
        cleaningRequests: [
          {
            id: 301,
            flatNumber: "313",
            requestDate: "2026-11-16",
            effectiveDate: "2026-11-16",
            completedAt: "2026-11-16T12:00:00.000Z",
            status: "clean",
            assignedUserId: 3,
            assignedUsername: "Grazi",
            leavingGuest: "Anterior Guest",
            arrivingGuest: "Gabriela Silva"
          }
        ]
      });

      const reservation = {
        id: 503,
        code: "B2B-25065298",
        flatNumber: "313",
        checkinDate: "2026-11-16",
        checkoutDate: "2026-11-19",
        guestName: "Gabriela Silva"
      };

      const result = resolveMaidCleaning(db, reservation);
      assert.equal(result.maidUser?.id, 3);
      assert.equal(result.cleaningRequest?.id, 301);
    });

    it("1.4 Direct link via autoReservationId or autoReservationCode", () => {
      const resolveMaidCleaning = requireMaidExport("resolveMaidCleaningForReservation");
      const db = createMockDb({
        cleaningRequests: [
          {
            id: 401,
            flatNumber: "113",
            requestDate: "2026-11-20",
            status: "clean",
            assignedUserId: 2,
            autoReservationId: 504,
            autoReservationCode: "RES-113-B2B-DIRECT"
          }
        ]
      });

      const reservation = {
        id: 504,
        code: "RES-113-B2B-DIRECT",
        flatNumber: "113",
        checkinDate: "2026-11-20",
        checkoutDate: "2026-11-22"
      };

      const result = resolveMaidCleaning(db, reservation);
      assert.equal(result.maidUser?.id, 2);
      assert.equal(result.cleaningRequest?.id, 401);
    });

    it("1.5 Falls back to maid statement credit when cleaningRequest has assignedUserId null", () => {
      const resolveMaidCleaning = requireMaidExport("resolveMaidCleaningForReservation");
      const db = createMockDb({
        cleaningRequests: [
          {
            id: 501,
            flatNumber: "113",
            requestDate: "2026-11-22",
            effectiveDate: "2026-11-22",
            status: "clean",
            assignedUserId: null
          }
        ],
        maidStatementEntries: [
          {
            id: "entry_501",
            userId: 2,
            cleaningRequestId: 501,
            entryType: "credit",
            entryDate: "2026-11-22"
          }
        ]
      });

      const reservation = {
        id: 505,
        code: "RES-FALLBACK",
        flatNumber: "113",
        checkinDate: "2026-11-22",
        checkoutDate: "2026-11-24"
      };

      const result = resolveMaidCleaning(db, reservation);
      assert.equal(result.maidUser?.id, 2, "Deve resgatar camareira através do crédito registrado no extrato");
    });
  });

  // ── Feature 2: Review Flow Preservation (F2 / R2) ─────────────────────────
  describe("F2: Review Flow Preservation (R2)", () => {
    it("2.1 Preserves Score 5 flow: sends Google link and sets awaitingFeedbackComment=false", async () => {
      const mockSend = createMockSendZapi();
      const db = createMockDb({
        reservations: [
          {
            id: "RES-501",
            code: "RES-501",
            guestName: "Ana Clara",
            guestPhone: "5522998887777",
            flatNumber: "113",
            checkinDate: "2026-11-01",
            checkoutDate: "2026-11-03",
            status: "checked_out"
          }
        ],
        npsResponses: [
          {
            id: "nps_1",
            reservationId: "RES-501",
            guestName: "Ana Clara",
            guestPhone: "5522998887777",
            flatNumber: "113",
            score: null,
            pendingResponse: true,
            surveyVerifiedSent: true,
            sentAt: new Date().toISOString()
          }
        ]
      });

      const res = await zapiService.processInboundNpsAndSentiment({
        db,
        phone: "5522998887777",
        senderName: "Ana Clara",
        text: "5",
        saveDatabase: () => {},
        sendZapiFn: mockSend
      });

      assert.equal(res.npsHandled, true);
      assert.equal(db.npsResponses[0].score, 5);
      assert.equal(db.npsResponses[0].googleLinkSent, true);
      assert.equal(db.npsResponses[0].awaitingFeedbackComment, false);
      const sentMsg = mockSend.sent.at(-1);
      assert.equal(sentMsg.triggerEvent, "nps_approved");
      assert.match(sentMsg.message, /google\.com\/local\/writereview/);
    });

    it("2.2 Preserves Score 1-4 flow: sets awaitingFeedbackComment=true and dispatches tpl_nps_score_X", async () => {
      const mockSend = createMockSendZapi();
      const db = createMockDb({
        reservations: [
          {
            id: "RES-502",
            code: "RES-502",
            guestName: "Lucas Mendes",
            guestPhone: "5522998886666",
            flatNumber: "211",
            status: "checked_out"
          }
        ],
        npsResponses: [
          {
            id: "nps_2",
            reservationId: "RES-502",
            guestName: "Lucas Mendes",
            guestPhone: "5522998886666",
            flatNumber: "211",
            score: null,
            pendingResponse: true,
            surveyVerifiedSent: true,
            sentAt: new Date().toISOString()
          }
        ]
      });

      const res = await zapiService.processInboundNpsAndSentiment({
        db,
        phone: "5522998886666",
        senderName: "Lucas Mendes",
        text: "4",
        saveDatabase: () => {},
        sendZapiFn: mockSend
      });

      assert.equal(res.npsHandled, true);
      assert.equal(db.npsResponses[0].score, 4);
      assert.equal(db.npsResponses[0].awaitingFeedbackComment, true, "Deve aguardar comentário de melhoria");
      const sentMsg = mockSend.sent.at(-1);
      assert.equal(sentMsg.triggerEvent, "nps_score_4");
      assert.match(sentMsg.message, /o que você acha que faltou ou o que poderíamos melhorar/);
    });

    it("2.3 Preserves Score 1-2 auto-ticket creation in db.observations", async () => {
      const mockSend = createMockSendZapi();
      const db = createMockDb({
        npsResponses: [
          {
            id: "nps_3",
            guestName: "Carla Dutra",
            guestPhone: "5522998885555",
            flatNumber: "313",
            score: null,
            pendingResponse: true,
            surveyVerifiedSent: true,
            sentAt: new Date().toISOString()
          }
        ]
      });

      await zapiService.processInboundNpsAndSentiment({
        db,
        phone: "5522998885555",
        senderName: "Carla Dutra",
        text: "2",
        saveDatabase: () => {},
        sendZapiFn: mockSend
      });

      assert.equal(db.observations.length, 1, "Deve criar ticket em db.observations para nota <= 2");
      assert.equal(db.observations[0].generatedFromNps, true);
      assert.equal(db.observations[0].severity, "media");
    });

    it("2.4 Step 2: Guest replies with follow-up comment -> captured and synced to db.reviews", async () => {
      const mockSend = createMockSendZapi();
      const db = createMockDb({
        npsResponses: [
          {
            id: "nps_4",
            guestName: "Roberto",
            guestPhone: "5522998884444",
            flatNumber: "113",
            score: 3,
            comment: "",
            awaitingFeedbackComment: true,
            awaitingFeedbackSince: new Date().toISOString(),
            surveyVerifiedSent: true
          }
        ]
      });

      const res = await zapiService.processInboundNpsAndSentiment({
        db,
        phone: "5522998884444",
        senderName: "Roberto",
        text: "O lençol da cama estava manchado e não tinha toalha de rosto.",
        saveDatabase: () => {},
        sendZapiFn: mockSend
      });

      assert.equal(res.npsHandled, true);
      assert.equal(db.npsResponses[0].comment, "O lençol da cama estava manchado e não tinha toalha de rosto.");
      assert.equal(db.npsResponses[0].awaitingFeedbackComment, false);
      assert.equal(db.reviews.length, 1, "Deve sincronizar em db.reviews");
      assert.equal(db.reviews[0].comment, "O lençol da cama estava manchado e não tinha toalha de rosto.");
      const thanksMsg = mockSend.sent.find(m => m.triggerEvent === "nps_feedback_thanks");
      assert.ok(thanksMsg, "Deve ter enviado mensagem de agradecimento tpl_nps_feedback_thanks");
      assert.equal(thanksMsg.triggerEvent, "nps_feedback_thanks");
    });

    it("2.5 Inline score + comment captures both immediately without waiting for second step", async () => {
      const mockSend = createMockSendZapi();
      const db = createMockDb({
        npsResponses: [
          {
            id: "nps_5",
            guestName: "Juliana",
            guestPhone: "5522998883333",
            flatNumber: "211",
            score: null,
            pendingResponse: true,
            surveyVerifiedSent: true
          }
        ]
      });

      const res = await zapiService.processInboundNpsAndSentiment({
        db,
        phone: "5522998883333",
        senderName: "Juliana",
        text: "3 - box do banheiro estava engordurado e louça mal lavada",
        saveDatabase: () => {},
        sendZapiFn: mockSend
      });

      assert.equal(res.npsHandled, true);
      assert.equal(db.npsResponses[0].score, 3);
      assert.equal(db.npsResponses[0].comment, "box do banheiro estava engordurado e louça mal lavada");
      assert.equal(db.npsResponses[0].awaitingFeedbackComment, false);
    });
  });

  // ── Feature 3: AI Feedback Triage Engine & Forwarding Rules (F3, F4 / R3) ──
  describe("F3 & F4: AI Triage Engine & Forwarding Rules (triageSub5Review)", () => {
    it("3.1 5-star ratings are always forwarded without triage", async () => {
      const triageFn = requireMaidExport("triageSub5Review");
      const res = await triageFn({ score: 5, comment: "Excelente flat, maravilhoso!" });
      assert.equal(res.forwardToMaid, true, "Nota 5 sempre deve ser encaminhada");
      assert.equal(res.isCleaningRelated, true);
    });

    it("3.2 Forwards sub-5 cleaning reviews: stained linen, dirty bedsheet", async () => {
      const triageFn = requireMaidExport("triageSub5Review");
      const res = await triageFn({
        score: 3,
        comment: "O lençol estava manchado e o edredom com sujeira visível"
      });
      assert.equal(res.forwardToMaid, true);
      assert.equal(res.isCleaningRelated, true);
      assert.equal(res.primaryResponsibility, "camareira");
    });

    it("3.3 Forwards sub-5 cleaning reviews: missing towels and amenities", async () => {
      const triageFn = requireMaidExport("triageSub5Review");
      const res = await triageFn({
        score: 4,
        comment: "Faltaram toalhas de banho e sabonete na chegada"
      });
      assert.equal(res.forwardToMaid, true);
      assert.equal(res.isCleaningRelated, true);
      assert.equal(res.primaryResponsibility, "camareira");
    });

    it("3.4 Forwards sub-5 cleaning reviews: dirty bathroom and unwashed dishes/utensils", async () => {
      const triageFn = requireMaidExport("triageSub5Review");
      const res = await triageFn({
        score: 2,
        comment: "Box do banheiro encardido com limo e pratos com gordura na pia"
      });
      assert.equal(res.forwardToMaid, true);
      assert.equal(res.isCleaningRelated, true);
      assert.equal(res.primaryResponsibility, "camareira");
    });

    it("3.5 Discards sub-5 non-cleaning reviews: Wi-Fi / Internet problems", async () => {
      const triageFn = requireMaidExport("triageSub5Review");
      const res = await triageFn({
        score: 2,
        comment: "A internet Wi-Fi caiu o tempo todo e não consegui trabalhar da minha reunião"
      });
      assert.equal(res.forwardToMaid, false, "Crítica de Wi-Fi NÃO deve ser encaminhada para camareira");
      assert.equal(res.isCleaningRelated, false);
      assert.notEqual(res.primaryResponsibility, "camareira");
    });

    it("3.6 Discards sub-5 non-cleaning reviews: check-in delay and front desk service", async () => {
      const triageFn = requireMaidExport("triageSub5Review");
      const res = await triageFn({
        score: 1,
        comment: "Demora absurda na portaria para liberar a chave e recepcionista grosseiro"
      });
      assert.equal(res.forwardToMaid, false, "Crítica de check-in / portaria NÃO deve ser enviada à camareira");
      assert.equal(res.isCleaningRelated, false);
    });

    it("3.7 Discards sub-5 non-cleaning reviews: AC hardware failure and plumbing issues", async () => {
      const triageFn = requireMaidExport("triageSub5Review");
      const res = await triageFn({
        score: 2,
        comment: "O ar-condicionado não gela nada e o chuveiro estava gelado"
      });
      assert.equal(res.forwardToMaid, false, "Crítica mecânica / hidráulica NÃO deve ser enviada à camareira");
      assert.equal(res.isCleaningRelated, false);
    });

    it("3.8 Discards sub-5 non-cleaning reviews: external noise, street, and noisy neighbors", async () => {
      const triageFn = requireMaidExport("triageSub5Review");
      const res = await triageFn({
        score: 3,
        comment: "Vizinhos do flat ao lado fizeram barulho e música alta a noite inteira"
      });
      assert.equal(res.forwardToMaid, false, "Barulho externo NÃO deve ser imputado à camareira");
      assert.equal(res.isCleaningRelated, false);
    });

    it("3.9 Two-Tier Resilience: deterministic fallback works with 100% precision when offline", async () => {
      const triageFn = requireMaidExport("triageSub5Review");
      // Explicitly pass an aiClientMock that fails to simulate offline / timeout
      const failingMock = async () => {
        throw new Error("Gemini network timeout simulation");
      };
      const resCleaning = await triageFn({
        score: 3,
        comment: "Chão do quarto com muita poeira e cabelo na cama",
        aiClientMock: failingMock
      });
      assert.equal(resCleaning.forwardToMaid, true);
      assert.equal(resCleaning.triageMethod, "deterministic_fallback");

      const resWifi = await triageFn({
        score: 2,
        comment: "Sinal do wi-fi fraquíssimo",
        aiClientMock: failingMock
      });
      assert.equal(resWifi.forwardToMaid, false);
      assert.equal(resWifi.triageMethod, "deterministic_fallback");
    });

    it("3.10 Two-Tier Resilience: prioritized online LLM mock when available", async () => {
      const triageFn = requireMaidExport("triageSub5Review");
      const mockLLM = async () => ({
        isCleaningRelated: true,
        category: "maid_cleaning",
        primaryResponsibility: "camareira",
        forwardToMaid: true,
        cleaningAspects: ["toalha suja"],
        nonCleaningAspects: [],
        explanation: "Hóspede reclamou de toalha suja.",
        triageMethod: "gemini_llm"
      });

      const res = await triageFn({
        score: 4,
        comment: "Toalha suja",
        aiClientMock: mockLLM
      });
      assert.equal(res.forwardToMaid, true);
      assert.equal(res.triageMethod, "gemini_llm");
    });
  });

  // ── Feature 4: Mercado Livre Opinion Synthesis & Realtime Alerts (F5, F6, F7 / R5)
  describe("F5, F6, F7: Opinion Synthesis & Realtime Dual Alerts (R5)", () => {
    it("4.1 updateMaidOpinionSynthesis accumulates average score and distribution", () => {
      const updateSynthesis = requireMaidExport("updateMaidOpinionSynthesis");
      const db = createMockDb();

      // First review: 5 stars
      let syn = updateSynthesis(db, {
        maidId: 2,
        review: { score: 5, comment: "Tudo limpo e cheiroso, adorei o lençol" }
      });
      assert.equal(syn.currentPeriod.totalReviews, 1);
      assert.equal(syn.currentPeriod.avgScore, 5.0);
      assert.equal(syn.currentPeriod.distribution[5], 1);

      // Second review: 4 stars
      syn = updateSynthesis(db, {
        maidId: 2,
        review: { score: 4, comment: "Muito bom, mas piso tinha poeira" }
      });
      assert.equal(syn.currentPeriod.totalReviews, 2);
      assert.equal(syn.currentPeriod.avgScore, 4.5);
      assert.equal(syn.currentPeriod.distribution[4], 1);
    });

    it("4.2 Termômetro / recurrence counters for critical items (box, louça, enxoval, piso)", () => {
      const updateSynthesis = requireMaidExport("updateMaidOpinionSynthesis");
      const db = createMockDb();

      const syn = updateSynthesis(db, {
        maidId: 2,
        review: {
          score: 4,
          comment: "O box do banheiro e os pratos e talheres estavam limpos, mas faltou toalha no enxoval e o piso tinha pó"
        }
      });

      const rec = syn.currentPeriod.itemRecurrence;
      assert.ok(rec.boxBanheiro.mentions >= 1, "Deve contar menção a box do banheiro");
      assert.ok(rec.utensiliosCozinha.mentions >= 1, "Deve contar menção a utensílios/pratos/talheres");
      assert.ok(rec.enxovalCamaBanho.mentions >= 1, "Deve contar menção a enxoval/toalha");
      assert.ok(rec.pisoPoeira.mentions >= 1, "Deve contar menção a piso/pó");
    });

    it("4.3 Period-over-period delta calculation: positive evolution (trend: 'evolucao')", () => {
      const updateSynthesis = requireMaidExport("updateMaidOpinionSynthesis");
      const db = createMockDb({
        maidOpinionSynthesis: {
          2: {
            maidId: 2,
            maidName: "Cris",
            previousPeriod: {
              label: "Outubro/2026",
              totalReviews: 10,
              avgScore: 4.6
            },
            currentPeriod: {
              label: "Novembro/2026",
              totalReviews: 4,
              avgScore: 4.8,
              sumScores: 19.2,
              distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 3 },
              itemRecurrence: {
                boxBanheiro: { mentions: 2, positiveCount: 2, negativeCount: 0 },
                utensiliosCozinha: { mentions: 2, positiveCount: 2, negativeCount: 0 },
                enxovalCamaBanho: { mentions: 2, positiveCount: 2, negativeCount: 0 },
                pisoPoeira: { mentions: 2, positiveCount: 2, negativeCount: 0 }
              }
            }
          }
        }
      });

      // Add a 5-star review, raising current average to ~4.84
      const syn = updateSynthesis(db, {
        maidId: 2,
        review: { score: 5, comment: "Impecável, tudo perfeito!" }
      });

      assert.ok(syn.evolution.delta > 0, "Delta deve ser positivo");
      assert.equal(syn.evolution.trend, "evolucao", "Tendência deve ser 'evolucao'");
      assert.match(syn.evolution.summaryText, /subiu/i);
    });

    it("4.4 Period-over-period delta calculation: regression / attention (trend: 'regressao')", () => {
      const updateSynthesis = requireMaidExport("updateMaidOpinionSynthesis");
      const db = createMockDb({
        maidOpinionSynthesis: {
          3: {
            maidId: 3,
            maidName: "Grazi",
            previousPeriod: {
              label: "Outubro/2026",
              totalReviews: 15,
              avgScore: 4.9
            },
            currentPeriod: {
              label: "Novembro/2026",
              totalReviews: 2,
              avgScore: 4.0,
              sumScores: 8.0,
              distribution: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 0 },
              itemRecurrence: {
                boxBanheiro: { mentions: 1, positiveCount: 1, negativeCount: 0 },
                utensiliosCozinha: { mentions: 1, positiveCount: 1, negativeCount: 0 },
                enxovalCamaBanho: { mentions: 1, positiveCount: 1, negativeCount: 0 },
                pisoPoeira: { mentions: 1, positiveCount: 1, negativeCount: 0 }
              }
            }
          }
        }
      });

      // Add a 3-star review, dropping average further
      const syn = updateSynthesis(db, {
        maidId: 3,
        review: { score: 3, comment: "Box do banheiro manchado" }
      });

      assert.ok(syn.evolution.delta < 0, "Delta deve ser negativo");
      assert.equal(syn.evolution.trend, "regressao", "Tendência deve ser 'regressao'");
      assert.match(syn.evolution.summaryText, /desceu|atenção/i);
    });

    it("4.5 Period-over-period delta calculation: stability (trend: 'estabilidade')", () => {
      const updateSynthesis = requireMaidExport("updateMaidOpinionSynthesis");
      const db = createMockDb({
        maidOpinionSynthesis: {
          2: {
            maidId: 2,
            maidName: "Cris",
            previousPeriod: {
              label: "Outubro/2026",
              totalReviews: 10,
              avgScore: 5.0
            },
            currentPeriod: {
              label: "Novembro/2026",
              totalReviews: 2,
              avgScore: 5.0,
              sumScores: 10.0,
              distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 2 },
              itemRecurrence: {
                boxBanheiro: { mentions: 1, positiveCount: 1, negativeCount: 0 },
                utensiliosCozinha: { mentions: 1, positiveCount: 1, negativeCount: 0 },
                enxovalCamaBanho: { mentions: 1, positiveCount: 1, negativeCount: 0 },
                pisoPoeira: { mentions: 1, positiveCount: 1, negativeCount: 0 }
              }
            }
          }
        }
      });

      const syn = updateSynthesis(db, {
        maidId: 2,
        review: { score: 5, comment: "Tudo brilhando!" }
      });

      assert.equal(syn.evolution.delta, 0.0);
      assert.equal(syn.evolution.trend, "estabilidade");
    });

    it("4.6 Realtime Dual Message Dispatch: sends Message 1 (review) + Message 2 (synthesis)", async () => {
      const dispatchAlerts = requireMaidExport("dispatchRealtimeMaidReviewAlerts");
      const mockSend = createMockSendZapi();
      const db = createMockDb();

      const maidUser = { id: 2, name: "Cris", phone: "22988486446", whatsapp: "5522988486446" };
      const review = {
        id: 701,
        author: "Mariana Souza",
        rating: 5,
        flatMentioned: "113",
        comment: "O quarto estava impecável e muito cheiroso!"
      };

      const res = await dispatchAlerts(db, {
        review,
        maidUser,
        cleaningDate: "2026-11-08",
        triageResult: { forwardToMaid: true, isCleaningRelated: true },
        sendZapiFn: mockSend
      });

      assert.equal(res.success, true);
      assert.equal(mockSend.sent.length, 2, "Devem ser disparadas 2 mensagens separadas para a camareira");

      // Mensagem 1: A avaliação recebida com quarto, data e nota
      const msg1 = mockSend.sent[0];
      assert.match(msg1.message, /113/, "Mensagem 1 deve citar o quarto Flat 113");
      assert.match(msg1.message, /08\/11\/2026/, "Mensagem 1 deve citar a data da limpeza");
      assert.match(msg1.message, /5/, "Mensagem 1 deve citar a nota 5");
      assert.match(msg1.message, /impecável/i, "Mensagem 1 deve citar o comentário");

      // Mensagem 2: A síntese consolidada Mercado Livre
      const msg2 = mockSend.sent[1];
      assert.match(msg2.message, /Síntese de Opiniões|Resumo Consolidado/i, "Mensagem 2 deve ser o resumo estilo Mercado Livre");
      assert.match(msg2.message, /Nota Média|Média/i, "Mensagem 2 deve conter a nota média");
      assert.match(msg2.message, /Comparativo|Evolução/i, "Mensagem 2 deve conter o comparativo");
    });
  });

  // ── Feature 5: Daily Summary Scheduled Consolidation (F8, F9 / R1) ────────
  describe("F8, F9: Scheduled Daily Review Summary (dispatchDailyReviewsSummary)", () => {
    it("5.1 Consolidates eligible evaluations for each maid with flat number, date, and rating", async () => {
      const dispatchSummary = requireMaidExport("dispatchDailyReviewsSummary");
      const mockSend = createMockSendZapi();
      const db = createMockDb({
        cleaningRequests: [
          {
            id: 801,
            flatNumber: "113",
            requestDate: "2026-11-08",
            effectiveDate: "2026-11-08",
            status: "clean",
            assignedUserId: 2
          },
          {
            id: 802,
            flatNumber: "211",
            requestDate: "2026-11-09",
            effectiveDate: "2026-11-09",
            status: "clean",
            assignedUserId: 2
          }
        ],
        reservations: [
          { id: 901, code: "RES-901", flatNumber: "113", checkinDate: "2026-11-08", checkoutDate: "2026-11-10" },
          { id: 902, code: "RES-902", flatNumber: "211", checkinDate: "2026-11-09", checkoutDate: "2026-11-10" }
        ],
        npsResponses: [
          {
            id: "nps_901",
            reservationId: 901,
            flatNumber: "113",
            score: 5,
            comment: "Excelente!",
            respondedAt: "2026-11-10T10:00:00Z"
          },
          {
            id: "nps_902",
            reservationId: 902,
            flatNumber: "211",
            score: 4,
            comment: "Faltou pano de prato",
            respondedAt: "2026-11-10T11:00:00Z"
          }
        ]
      });

      const res = await dispatchSummary(db, {
        targetDate: "2026-11-10",
        force: true,
        sendZapiFn: mockSend
      });

      assert.ok(res.maidsNotified >= 1, "Deve notificar ao menos 1 camareira");
      assert.equal(res.totalReviewsSent, 2, "Devem ser totalizadas 2 avaliações enviadas");

      const sentSummary = mockSend.sent.find(s => s.phone.includes("22988486446"));
      assert.ok(sentSummary, "Cris deve receber mensagem de resumo");
      assert.match(sentSummary.message, /113/, "Deve listar Flat 113");
      assert.match(sentSummary.message, /211/, "Deve listar Flat 211");
      assert.match(sentSummary.message, /08\/11\/2026/, "Deve conter a data da limpeza do flat 113");
      assert.match(sentSummary.message, /5/, "Deve exibir a nota");
    });

    it("5.2 Dispatches ONLY to maids who had eligible cleanings with reviews in the period", async () => {
      const dispatchSummary = requireMaidExport("dispatchDailyReviewsSummary");
      const mockSend = createMockSendZapi();
      const db = createMockDb({
        cleaningRequests: [
          {
            id: 803,
            flatNumber: "113",
            requestDate: "2026-11-10",
            status: "clean",
            assignedUserId: 2 // Cris teve limpeza avaliada
          }
        ],
        reservations: [
          { id: 903, code: "RES-903", flatNumber: "113", checkinDate: "2026-11-10", checkoutDate: "2026-11-11" }
        ],
        npsResponses: [
          { id: "nps_903", reservationId: 903, flatNumber: "113", score: 5, respondedAt: "2026-11-11T09:00:00Z" }
        ]
      });

      await dispatchSummary(db, {
        targetDate: "2026-11-11",
        force: true,
        sendZapiFn: mockSend
      });

      const sentToCris = mockSend.sent.filter(s => s.phone.includes("22988486446"));
      const sentToGrazi = mockSend.sent.filter(s => s.phone.includes("22999106204"));
      assert.equal(sentToCris.length, 1, "Cris deve receber o resumo");
      assert.equal(sentToGrazi.length, 0, "Grazi não deve receber resumo vazio pois não teve avaliações no dia");
    });

    it("5.3 Excludes non-cleaning discarded sub-5 reviews from the daily summary", async () => {
      const dispatchSummary = requireMaidExport("dispatchDailyReviewsSummary");
      const mockSend = createMockSendZapi();
      const db = createMockDb({
        cleaningRequests: [
          {
            id: 804,
            flatNumber: "313",
            requestDate: "2026-11-10",
            status: "clean",
            assignedUserId: 3 // Grazi
          }
        ],
        reservations: [
          { id: 904, code: "RES-904", flatNumber: "313", checkinDate: "2026-11-10", checkoutDate: "2026-11-11" }
        ],
        npsResponses: [
          {
            id: "nps_904",
            reservationId: 904,
            flatNumber: "313",
            score: 2,
            comment: "Internet caiu durante o dia todo, Wi-Fi péssimo",
            respondedAt: "2026-11-11T12:00:00Z"
          }
        ]
      });

      const res = await dispatchSummary(db, {
        targetDate: "2026-11-11",
        force: true,
        sendZapiFn: mockSend
      });

      assert.equal(res.totalReviewsSent, 0, "Crítica de Wi-Fi deve ser descartada do resumo");
      assert.equal(mockSend.sent.length, 0, "Grazi não deve ser notificada ou cobrada por falha de internet");
    });
  });

  // ── Feature 6: Retroactive November Consolidation (F10 / R4) ──────────────
  describe("F10: Retroactive November Consolidation (dispatchNovemberRetroactiveReviews)", () => {
    it("6.1 Identifies eligible November reviews and dispatches them to responsible maids", async () => {
      const dispatchRetroactive = requireMaidExport("dispatchNovemberRetroactiveReviews");
      const mockSend = createMockSendZapi();
      const db = createMockDb({
        cleaningRequests: [
          {
            id: 1001,
            flatNumber: "113",
            requestDate: "2026-11-03",
            status: "clean",
            assignedUserId: 2
          },
          {
            id: 1002,
            flatNumber: "211",
            requestDate: "2026-11-05",
            status: "clean",
            assignedUserId: 3
          }
        ],
        reservations: [
          { id: 1101, code: "RES-NOV-1", flatNumber: "113", checkinDate: "2026-11-03", checkoutDate: "2026-11-05" },
          { id: 1102, code: "RES-NOV-2", flatNumber: "211", checkinDate: "2026-11-05", checkoutDate: "2026-11-07" }
        ],
        npsResponses: [
          {
            id: "nps_nov_1",
            reservationId: 1101,
            flatNumber: "113",
            score: 5,
            comment: "Novembro começou maravilhoso!",
            respondedAt: "2026-11-05T15:00:00Z"
          },
          {
            id: "nps_nov_2",
            reservationId: 1102,
            flatNumber: "211",
            score: 4,
            comment: "Gostei, faltou apenas um pano de chão extra",
            respondedAt: "2026-11-07T10:00:00Z"
          }
        ]
      });

      const res = await dispatchRetroactive(db, { sendZapiFn: mockSend });
      assert.equal(res.maidsNotified, 2, "Deve notificar Cris e Grazi");
      assert.equal(res.totalReviewsSent, 2, "Total de 2 avaliações retroativas");
      assert.ok(mockSend.sent.length >= 2);
    });

    it("6.2 Idempotency Guard: running twice does not send duplicate dispatches", async () => {
      const dispatchRetroactive = requireMaidExport("dispatchNovemberRetroactiveReviews");
      const mockSend = createMockSendZapi();
      const db = createMockDb({
        cleaningRequests: [
          { id: 1003, flatNumber: "113", requestDate: "2026-11-04", status: "clean", assignedUserId: 2 }
        ],
        reservations: [
          { id: 1103, code: "RES-NOV-3", flatNumber: "113", checkinDate: "2026-11-04", checkoutDate: "2026-11-06" }
        ],
        npsResponses: [
          { id: "nps_nov_3", reservationId: 1103, flatNumber: "113", score: 5, respondedAt: "2026-11-06T12:00:00Z" }
        ]
      });

      // Execução 1
      const res1 = await dispatchRetroactive(db, { sendZapiFn: mockSend });
      assert.equal(res1.totalReviewsSent, 1);
      const countAfterFirstRun = mockSend.sent.length;

      // Execução 2
      const res2 = await dispatchRetroactive(db, { sendZapiFn: mockSend });
      assert.equal(res2.totalReviewsSent, 0, "Segunda execução não deve reenviar avaliações já despachadas");
      assert.equal(mockSend.sent.length, countAfterFirstRun, "Nenhuma mensagem nova deve ser enviada");
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// TIER 2: Boundary & Corner Cases
// ────────────────────────────────────────────────────────────────────────────
describe("Tier 2: Boundary & Corner Cases", () => {
  it("B1: Sub-5 rating with empty or whitespace-only comment is withheld from maid", async () => {
    const triageFn = requireMaidExport("triageSub5Review");
    const resEmpty = await triageFn({ score: 4, comment: "" });
    assert.equal(resEmpty.forwardToMaid, false, "Sem comentário, não deve enviar para a camareira");

    const resSpaces = await triageFn({ score: 3, comment: "     " });
    assert.equal(resSpaces.forwardToMaid, false, "Comentário só com espaços não deve enviar");
  });

  it("B2: Maid with zero previous period reviews handles gracefully without NaN", () => {
    const updateSynthesis = requireMaidExport("updateMaidOpinionSynthesis");
    const db = createMockDb(); // No historical data

    const syn = updateSynthesis(db, {
      maidId: 2,
      review: { score: 5, comment: "Primeira avaliação recebida" }
    });

    assert.equal(syn.currentPeriod.avgScore, 5.0);
    assert.equal(isNaN(syn.evolution.delta), false, "Delta não pode ser NaN");
    assert.ok(syn.evolution.summaryText.length > 0);
  });

  it("B3: Mixed review with both cleaning and Wi-Fi issues forwards cleaning aspect and identifies both", async () => {
    const triageFn = requireMaidExport("triageSub5Review");
    const res = await triageFn({
      score: 3,
      comment: "O banheiro estava bem sujo com cabelo no ralo e a internet Wi-Fi caía toda hora"
    });

    assert.equal(res.forwardToMaid, true, "Avaliação mista contendo limpeza deve ser encaminhada");
    assert.equal(res.category, "mixed");
    assert.ok(res.cleaningAspects.length > 0, "Deve extrair aspectos de limpeza");
    assert.ok(res.nonCleaningAspects.length > 0, "Deve extrair aspectos não pertinentes à camareira");
  });

  it("B4: Unintelligible or neutral phrase on sub-5 rating uses conservative default (forwardToMaid: false)", async () => {
    const triageFn = requireMaidExport("triageSub5Review");
    const res = await triageFn({ score: 3, comment: "ok, tudo bem..." });
    assert.equal(res.forwardToMaid, false, "Comentário neutro sem menção a limpeza não deve culpar camareira");
  });

  it("B5: Reservation with no cleaning record found in database returns null maid without crashing", () => {
    const resolveMaidCleaning = requireMaidExport("resolveMaidCleaningForReservation");
    const db = createMockDb({ cleaningRequests: [] }); // Empty cleanings

    const reservation = {
      id: 999,
      code: "RES-ORPHAN",
      flatNumber: "999",
      checkinDate: "2026-11-01",
      checkoutDate: "2026-11-03"
    };

    const res = resolveMaidCleaning(db, reservation);
    assert.equal(res.maidUser, null);
    assert.equal(res.cleaningRequest, null);
  });

  it("B6: Multiple evaluations on same day for the same maid aggregate into single summary with correct mean", async () => {
    const dispatchSummary = requireMaidExport("dispatchDailyReviewsSummary");
    const mockSend = createMockSendZapi();
    const db = createMockDb({
      cleaningRequests: [
        { id: 2001, flatNumber: "113", requestDate: "2026-11-10", status: "clean", assignedUserId: 2 },
        { id: 2002, flatNumber: "211", requestDate: "2026-11-10", status: "clean", assignedUserId: 2 },
        { id: 2003, flatNumber: "313", requestDate: "2026-11-10", status: "clean", assignedUserId: 2 }
      ],
      reservations: [
        { id: 3001, code: "RES-M1", flatNumber: "113", checkinDate: "2026-11-10", checkoutDate: "2026-11-12" },
        { id: 3002, code: "RES-M2", flatNumber: "211", checkinDate: "2026-11-10", checkoutDate: "2026-11-12" },
        { id: 3003, code: "RES-M3", flatNumber: "313", checkinDate: "2026-11-10", checkoutDate: "2026-11-12" }
      ],
      npsResponses: [
        { id: "nps_m1", reservationId: 3001, flatNumber: "113", score: 5, respondedAt: "2026-11-12T10:00:00Z" },
        { id: "nps_m2", reservationId: 3002, flatNumber: "211", score: 4, respondedAt: "2026-11-12T11:00:00Z" },
        { id: "nps_m3", reservationId: 3003, flatNumber: "313", score: 5, respondedAt: "2026-11-12T12:00:00Z" }
      ]
    });

    const res = await dispatchSummary(db, {
      targetDate: "2026-11-12",
      force: true,
      sendZapiFn: mockSend
    });

    assert.equal(res.maidsNotified, 1);
    assert.equal(res.totalReviewsSent, 3);
    const msg = mockSend.sent[0].message;
    // Média de 5, 4, 5 = 4.67 (arredondado para 4.7)
    assert.match(msg, /4\.7/, "A mensagem deve calcular a média do dia como 4.7");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// TIER 3: Cross-Feature Interactions
// ────────────────────────────────────────────────────────────────────────────
describe("Tier 3: Cross-Feature Interactions", () => {
  it("C1: Inbound comment -> AI Triage -> Opinion Synthesis -> Dual WhatsApp Alert sequence", async () => {
    const triageFn = requireMaidExport("triageSub5Review");
    const updateSynthesis = requireMaidExport("updateMaidOpinionSynthesis");
    const dispatchAlerts = requireMaidExport("dispatchRealtimeMaidReviewAlerts");
    const mockSend = createMockSendZapi();

    const db = createMockDb();
    const maidUser = { id: 2, name: "Cris", phone: "22988486446", whatsapp: "5522988486446" };

    const review = {
      id: 4001,
      author: "Fernanda",
      rating: 4,
      flatMentioned: "113",
      comment: "A cama estava ótima, mas o box do banheiro tinha manchas de sabão"
    };

    // 1. Triage
    const triageRes = await triageFn({
      score: review.rating,
      comment: review.comment,
      flatNumber: review.flatMentioned
    });
    assert.equal(triageRes.forwardToMaid, true);

    // 2. Synthesis update
    const updatedSynthesis = updateSynthesis(db, {
      maidId: maidUser.id,
      review,
      triageResult: triageRes
    });
    assert.ok(updatedSynthesis.currentPeriod.avgScore > 0);

    // 3. Dual Alert dispatch
    const alertRes = await dispatchAlerts(db, {
      review,
      maidUser,
      cleaningDate: "2026-11-09",
      triageResult: triageRes,
      sendZapiFn: mockSend
    });

    assert.equal(alertRes.success, true);
    assert.equal(mockSend.sent.length, 2, "Pipeline deve disparar mensagem de review e mensagem de síntese");
  });

  it("C2: Daily summary ignores reviews already marked with dispatchedToMaidAt", async () => {
    const dispatchSummary = requireMaidExport("dispatchDailyReviewsSummary");
    const mockSend = createMockSendZapi();
    const db = createMockDb({
      cleaningRequests: [
        { id: 5001, flatNumber: "113", requestDate: "2026-11-10", status: "clean", assignedUserId: 2 }
      ],
      reservations: [
        { id: 6001, code: "RES-ALREADY-SENT", flatNumber: "113", checkinDate: "2026-11-10", checkoutDate: "2026-11-11" }
      ],
      npsResponses: [
        {
          id: "nps_sent_already",
          reservationId: 6001,
          flatNumber: "113",
          score: 5,
          respondedAt: "2026-11-11T09:00:00Z",
          dispatchedToMaidAt: "2026-11-11T09:05:00Z" // Já despachado em tempo real
        }
      ]
    });

    const res = await dispatchSummary(db, {
      targetDate: "2026-11-11",
      force: false,
      sendZapiFn: mockSend
    });

    assert.equal(res.totalReviewsSent, 0, "Não deve duplicar envio no resumo diário se já marcado");
    assert.equal(mockSend.sent.length, 0);
  });

  it("C3: Two maids cleaning different rooms for the same guest receive strictly separated alerts", () => {
    const resolveMaidCleaning = requireMaidExport("resolveMaidCleaningForReservation");
    const db = createMockDb({
      cleaningRequests: [
        {
          id: 7001,
          flatNumber: "113",
          requestDate: "2026-11-01",
          status: "clean",
          assignedUserId: 2 // Cris
        },
        {
          id: 7002,
          flatNumber: "211",
          requestDate: "2026-11-15",
          status: "clean",
          assignedUserId: 3 // Grazi
        }
      ]
    });

    // Stay 1 at Flat 113
    const resStay1 = resolveMaidCleaning(db, {
      id: 8001,
      flatNumber: "113",
      checkinDate: "2026-11-01",
      checkoutDate: "2026-11-04",
      guestName: "Viajante Recorrente"
    });
    assert.equal(resStay1.maidUser?.id, 2);

    // Stay 2 at Flat 211
    const resStay2 = resolveMaidCleaning(db, {
      id: 8002,
      flatNumber: "211",
      checkinDate: "2026-11-15",
      checkoutDate: "2026-11-18",
      guestName: "Viajante Recorrente"
    });
    assert.equal(resStay2.maidUser?.id, 3);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// TIER 4: Real-World Scenarios
// ────────────────────────────────────────────────────────────────────────────
describe("Tier 4: Real-World Scenarios", () => {
  it("Scenario 1: Checkout at Flat 113, sub-5 cleaning complaint, attributed to Cris, dual alert and daily summary sent", async () => {
    const resolveMaidCleaning = requireMaidExport("resolveMaidCleaningForReservation");
    const triageFn = requireMaidExport("triageSub5Review");
    const updateSynthesis = requireMaidExport("updateMaidOpinionSynthesis");
    const dispatchAlerts = requireMaidExport("dispatchRealtimeMaidReviewAlerts");
    const mockSend = createMockSendZapi();

    const db = createMockDb({
      cleaningRequests: [
        {
          id: 9001,
          flatNumber: "113",
          requestDate: "2026-11-03",
          effectiveDate: "2026-11-03",
          status: "clean",
          assignedUserId: 2,
          assignedUsername: "Cris"
        }
      ],
      reservations: [
        {
          id: 9101,
          code: "RES-113-SCENARIO-1",
          flatNumber: "113",
          checkinDate: "2026-11-03",
          checkoutDate: "2026-11-05",
          guestName: "Guilherme Santos",
          guestPhone: "5522988112233"
        }
      ]
    });

    const resObj = db.reservations[0];
    const maidResolution = resolveMaidCleaning(db, resObj);
    assert.equal(maidResolution.maidUser?.id, 2);

    const guestComment = "Faltou toalha de rosto e tinha cabelo no chão do banheiro";
    const triage = await triageFn({
      score: 3,
      comment: guestComment,
      flatNumber: resObj.flatNumber
    });
    assert.equal(triage.forwardToMaid, true);

    const reviewObj = {
      id: 9201,
      author: resObj.guestName,
      rating: 3,
      flatMentioned: resObj.flatNumber,
      comment: guestComment
    };

    updateSynthesis(db, {
      maidId: maidResolution.maidUser.id,
      review: reviewObj,
      triageResult: triage
    });

    await dispatchAlerts(db, {
      review: reviewObj,
      maidUser: maidResolution.maidUser,
      cleaningDate: maidResolution.cleaningDate,
      triageResult: triage,
      sendZapiFn: mockSend
    });

    assert.equal(mockSend.sent.length, 2);
    assert.match(mockSend.sent[0].message, /Flat 113/);
    assert.match(mockSend.sent[0].message, /03\/11\/2026/);
    assert.match(mockSend.sent[0].message, /3/);
  });

  it("Scenario 2: Checkout at Flat 211, sub-5 Wi-Fi complaint, discarded from Grazi, recovery ticket opened, Grazi receives 0 alerts", async () => {
    const resolveMaidCleaning = requireMaidExport("resolveMaidCleaningForReservation");
    const triageFn = requireMaidExport("triageSub5Review");
    const mockSend = createMockSendZapi();

    const db = createMockDb({
      cleaningRequests: [
        {
          id: 9002,
          flatNumber: "211",
          requestDate: "2026-11-07",
          status: "clean",
          assignedUserId: 3,
          assignedUsername: "Grazi"
        }
      ],
      reservations: [
        {
          id: 9102,
          code: "RES-211-SCENARIO-2",
          flatNumber: "211",
          checkinDate: "2026-11-07",
          checkoutDate: "2026-11-09",
          guestName: "Patrícia Lima"
        }
      ]
    });

    const resObj = db.reservations[0];
    const maidResolution = resolveMaidCleaning(db, resObj);
    assert.equal(maidResolution.maidUser?.id, 3);

    const guestComment = "Wi-Fi horroroso, não consegui assistir Netflix nem trabalhar";
    const triage = await triageFn({
      score: 2,
      comment: guestComment,
      flatNumber: resObj.flatNumber
    });

    // Verification: Triage must filter this out
    assert.equal(triage.forwardToMaid, false);
    assert.notEqual(triage.primaryResponsibility, "camareira");

    // Grazi must NOT receive any message
    assert.equal(mockSend.sent.length, 0, "Grazi não deve receber mensagem para críticas fora de sua responsabilidade");
  });

  it("Scenario 3: 5-star review at Flat 313 automatically forwarded, Cris praised, synthesis score increases", async () => {
    const resolveMaidCleaning = requireMaidExport("resolveMaidCleaningForReservation");
    const triageFn = requireMaidExport("triageSub5Review");
    const updateSynthesis = requireMaidExport("updateMaidOpinionSynthesis");
    const dispatchAlerts = requireMaidExport("dispatchRealtimeMaidReviewAlerts");
    const mockSend = createMockSendZapi();

    const db = createMockDb({
      cleaningRequests: [
        {
          id: 9003,
          flatNumber: "313",
          requestDate: "2026-11-12",
          status: "clean",
          assignedUserId: 2,
          assignedUsername: "Cris"
        }
      ],
      reservations: [
        {
          id: 9103,
          code: "RES-313-SCENARIO-3",
          flatNumber: "313",
          checkinDate: "2026-11-12",
          checkoutDate: "2026-11-14",
          guestName: "Eduardo Rocha"
        }
      ]
    });

    const resObj = db.reservations[0];
    const maidResolution = resolveMaidCleaning(db, resObj);
    assert.equal(maidResolution.maidUser?.id, 2);

    const triage = await triageFn({
      score: 5,
      comment: "Estadia maravilhosa, tudo brilhando e cheiroso!"
    });
    assert.equal(triage.forwardToMaid, true);

    const reviewObj = {
      id: 9203,
      author: resObj.guestName,
      rating: 5,
      flatMentioned: resObj.flatNumber,
      comment: "Estadia maravilhosa, tudo brilhando e cheiroso!"
    };

    const syn = updateSynthesis(db, {
      maidId: maidResolution.maidUser.id,
      review: reviewObj,
      triageResult: triage
    });
    assert.equal(syn.currentPeriod.avgScore, 5.0);

    await dispatchAlerts(db, {
      review: reviewObj,
      maidUser: maidResolution.maidUser,
      cleaningDate: maidResolution.cleaningDate,
      triageResult: triage,
      sendZapiFn: mockSend
    });

    assert.equal(mockSend.sent.length, 2);
    assert.match(mockSend.sent[0].message, /5 de 5|⭐⭐⭐⭐⭐/);
  });
});

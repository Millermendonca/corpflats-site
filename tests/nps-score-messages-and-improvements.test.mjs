import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  getNpsScoreTemplate,
  getNpsThanksTemplate,
  rebuildNpsImprovementsSummary,
  processInboundNpsAndSentiment,
  checkPendingNpsManagerAlerts,
  wasNpsSurveySentToPhone,
  sanitizeAndDispatchTodaySub5Nps
} from "../scripts/zapi-service.mjs";

test("NPS 1-5 templates, two-step comment collection, and continuous improvements summary", async () => {
  const sentMessages = [];
  const mockSendZapi = async (zapiConfig, payload) => {
    sentMessages.push(payload);
    return {
      success: true,
      method: "mock_zapi",
      messageId: `MOCK-${sentMessages.length}`
    };
  };

  // 1. Validate that all 5 score templates + thanks template exist in DEFAULT_WHATSAPP_TEMPLATES
  for (const tplId of [
    "tpl_post_checkout_review",
    "tpl_nps_score_4",
    "tpl_nps_score_3",
    "tpl_nps_score_2",
    "tpl_nps_score_1",
    "tpl_nps_feedback_thanks"
  ]) {
    const found = DEFAULT_WHATSAPP_TEMPLATES.find((tpl) => tpl.id === tplId);
    assert.ok(found, `Template ${tplId} must exist in DEFAULT_WHATSAPP_TEMPLATES`);
    assert.equal(found.enabled, true, `Template ${tplId} must be enabled by default`);
  }

  const db = {
    zapiConfig: {
      enabled: true,
      testModeOnly: false,
      instanceId: "TEST_INST",
      token: "TEST_TOK",
      clientToken: "TEST_CLIENT",
      npsManagerAlertPhone: "22998505276"
    },
    whatsappTemplates: structuredClone(DEFAULT_WHATSAPP_TEMPLATES),
    reservations: [
      {
        id: "RES-501",
        code: "RES-501",
        guestName: "Carlos Promotor",
        guestPhone: "5522999990005",
        flatNumber: "101",
        checkinDate: "2026-10-18",
        checkoutDate: "2026-10-20",
        status: "checked_out",
        channel: "site"
      },
      {
        id: "RES-401",
        code: "RES-401",
        guestName: "Mariana Nota Quatro",
        guestPhone: "5522999990004",
        flatNumber: "204",
        checkinDate: "2026-10-18",
        checkoutDate: "2026-10-20",
        status: "checked_out",
        channel: "booking"
      },
      {
        id: "RES-201",
        code: "RES-201",
        guestName: "Roberto Nota Dois",
        guestPhone: "5522999990002",
        flatNumber: "305",
        checkinDate: "2026-10-18",
        checkoutDate: "2026-10-20",
        status: "checked_out",
        channel: "airbnb"
      }
    ],
    npsResponses: [
      {
        id: "nps_1",
        reservationId: "RES-501",
        guestName: "Carlos Promotor",
        guestPhone: "5522999990005",
        flatNumber: "101",
        channel: "site",
        score: null,
        comment: "",
        googleLinkSent: false,
        pendingResponse: true,
        sentAt: new Date().toISOString(),
        respondedAt: null
      },
      {
        id: "nps_2",
        reservationId: "RES-401",
        guestName: "Mariana Nota Quatro",
        guestPhone: "5522999990004",
        flatNumber: "204",
        channel: "booking",
        score: null,
        comment: "",
        googleLinkSent: false,
        pendingResponse: true,
        sentAt: new Date().toISOString(),
        respondedAt: null
      },
      {
        id: "nps_3",
        reservationId: "RES-201",
        guestName: "Roberto Nota Dois",
        guestPhone: "5522999990002",
        flatNumber: "305",
        channel: "airbnb",
        score: null,
        comment: "",
        googleLinkSent: false,
        pendingResponse: true,
        sentAt: new Date().toISOString(),
        respondedAt: null
      }
    ],
    reviews: [],
    observations: [],
    whatsappQueue: [],
    whatsappHistory: []
  };

  // Verify helper functions
  assert.equal(getNpsScoreTemplate(db, 5).id, "tpl_post_checkout_review");
  assert.equal(getNpsScoreTemplate(db, 4).id, "tpl_nps_score_4");
  assert.equal(getNpsScoreTemplate(db, 3).id, "tpl_nps_score_3");
  assert.equal(getNpsScoreTemplate(db, 2).id, "tpl_nps_score_2");
  assert.equal(getNpsScoreTemplate(db, 1).id, "tpl_nps_score_1");
  assert.equal(getNpsThanksTemplate(db).id, "tpl_nps_feedback_thanks");

  // 2. Guest 1 replies "5" -> receives Google Review link
  const resScore5 = await processInboundNpsAndSentiment({
    db,
    phone: "5522999990005",
    senderName: "Carlos Promotor",
    text: "5",
    saveDatabase: () => {},
    sendZapiFn: mockSendZapi
  });
  assert.equal(resScore5.npsHandled, true);
  assert.equal(db.npsResponses[0].score, 5);
  assert.equal(db.npsResponses[0].googleLinkSent, true);
  assert.equal(db.npsResponses[0].awaitingFeedbackComment, false);
  assert.equal(sentMessages.at(-1).triggerEvent, "nps_approved");

  // 3. Guest 2 replies "4" (only the number) -> receives tpl_nps_score_4 inviting comment & awaits reply
  const resScore4 = await processInboundNpsAndSentiment({
    db,
    phone: "5522999990004",
    senderName: "Mariana Nota Quatro",
    text: "4",
    saveDatabase: () => {},
    sendZapiFn: mockSendZapi
  });
  assert.equal(resScore4.npsHandled, true);
  assert.equal(resScore4.action, "score_received");
  assert.equal(db.npsResponses[1].score, 4);
  assert.equal(db.npsResponses[1].googleLinkSent, false);
  assert.equal(db.npsResponses[1].awaitingFeedbackComment, true);
  assert.equal(db.npsResponses[1].managerAlertSent, false, "Should wait for guest explanation before alerting manager");
  assert.equal(sentMessages.at(-1).triggerEvent, "nps_score_4");

  // 4. Guest 2 now types what can be improved -> saves comment, sends thanks, updates summary, alerts manager (22998505276)
  const resComment4 = await processInboundNpsAndSentiment({
    db,
    phone: "5522999990004",
    senderName: "Mariana Nota Quatro",
    text: "Gostei muito do flat, mas o travesseiro estava muito alto e faltou filtro de café.",
    saveDatabase: () => {},
    sendZapiFn: mockSendZapi
  });
  assert.equal(resComment4.npsHandled, true);
  assert.equal(resComment4.action, "feedback_comment_received");
  assert.equal(db.npsResponses[1].awaitingFeedbackComment, false);
  assert.equal(db.npsResponses[1].managerAlertSent, true);
  assert.match(db.npsResponses[1].comment, /travesseiro estava muito alto/i);

  // Check that both thanks message to guest AND manager alert to 22998505276 were sent
  const thanksMsgSent = sentMessages.find((m) => m.triggerEvent === "nps_feedback_thanks");
  assert.ok(thanksMsgSent, "Guest must receive tpl_nps_feedback_thanks after typing suggestion");
  const managerAlertMsgSent = sentMessages.find((m) => m.triggerEvent === "nps_manager_improvement_alert");
  assert.ok(managerAlertMsgSent, "Manager must receive WhatsApp alert with guest comment and improvements summary");
  assert.match(managerAlertMsgSent.phone, /22998505276/);
  assert.match(managerAlertMsgSent.message, /Resumo Atualizado de Melhorias a Fazer/i);

  // Verify improvements summary was updated
  assert.ok(db.npsImprovements, "db.npsImprovements must be generated");
  assert.equal(db.npsImprovements.totalFeedbacksAnalyzed, 1);
  assert.ok(db.npsImprovements.pendingCount >= 1);
  assert.match(db.npsImprovements.executiveSummary, /melhoria\(s\) prioritária\(s\) a fazer/i);

  // 5. Guest 3 sends score "2" AND comment in the same message
  const resScore2WithComment = await processInboundNpsAndSentiment({
    db,
    phone: "5522999990002",
    senderName: "Roberto Nota Dois",
    text: "2 - O ar condicionado do quarto 305 estava pingando e fazendo barulho a noite toda",
    saveDatabase: () => {},
    sendZapiFn: mockSendZapi
  });
  assert.equal(resScore2WithComment.npsHandled, true);
  assert.equal(db.npsResponses[2].score, 2);
  assert.equal(db.npsResponses[2].awaitingFeedbackComment, false);
  assert.equal(db.npsResponses[2].managerAlertSent, true);
  assert.ok(db.observations.some((o) => o.generatedFromNps), "Score 2 should also create a recovery ticket");
  assert.equal(db.npsImprovements.totalFeedbacksAnalyzed, 2);

  // 6. Resolve an improvement item and verify pendingCount decreases and resolvedCount increases
  const firstPendingItem = db.npsImprovements.items.find((i) => i.status === "pending");
  assert.ok(firstPendingItem, "Must have at least one pending improvement item");
  firstPendingItem.status = "resolved";
  firstPendingItem.resolvedAt = new Date().toISOString();
  const updatedSummary = await rebuildNpsImprovementsSummary(db);
  assert.equal(updatedSummary.resolvedCount, 1);
  const resolvedCheck = updatedSummary.items.find((i) => i.id === firstPendingItem.id);
  assert.equal(resolvedCheck.status, "resolved");

  // 7. Test 15-minute fallback alert when guest sends only score 3 and never writes a comment
  db.npsResponses.push({
    id: "nps_4",
    reservationId: "RES-301",
    guestName: "Fernanda Silenciosa",
    guestPhone: "5522999990003",
    flatNumber: "402",
    channel: "whatsapp",
    score: 3,
    comment: "",
    googleLinkSent: false,
    pendingResponse: false,
    surveyVerifiedSent: true,
    scoreFollowupSent: true,
    awaitingFeedbackComment: true,
    awaitingFeedbackSince: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    managerAlertSent: false,
    sentAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    respondedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString()
  });

  const fallbackRes = await checkPendingNpsManagerAlerts(
    db,
    () => {},
    () => {},
    { sendZapiFn: mockSendZapi }
  );
  assert.equal(fallbackRes.triggeredCount, 1);
  assert.equal(db.npsResponses[3].managerAlertSent, true, "Fallback alert must be sent after 15 minutes");
  assert.equal(db.npsResponses[3].managerAlertReason, "timeout_15m_without_comment");

  // 8. Strict guard: Guest who NEVER received the NPS survey sends "2" in chat (e.g., Marcos Paulo) -> must NOT be treated as NPS
  assert.equal(wasNpsSurveySentToPhone(db, "5522998401818"), false);
  const prevNpsCount = db.npsResponses.length;
  const resNoSurvey = await processInboundNpsAndSentiment({
    db,
    phone: "5522998401818",
    senderName: "Marcos Paulo",
    text: "2",
    saveDatabase: () => {},
    sendZapiFn: mockSendZapi
  });
  assert.equal(resNoSurvey.npsHandled, false, "Must ignore number 1-5 when NPS survey was never sent to that phone");
  assert.equal(db.npsResponses.length, prevNpsCount, "Must not add bogus entry to db.npsResponses");

  // 9. Sanitize bogus entries & dispatch only today's < 5 evaluations
  db.reservations.push({
    id: 467,
    code: "RES-211-0467",
    guestName: "Anderson Prates",
    guestPhone: "557192753737",
    flatNumber: "907",
    status: "completed"
  });
  db.whatsappQueue.push({
    id: "q_anderson",
    reservationCode: "RES-211-0467",
    guestPhone: "557192753737",
    triggerEvent: "post_checkout_review",
    status: "sent",
    sentAt: "2026-10-21T15:00:50.863Z"
  });
  // Add bogus Marcos Paulo entry, old historical < 5 entry (from 2026-10-18), and today's Anderson Prates entry (2026-10-21)
  db.npsResponses.push(
    {
      id: "nps_bogus_marcos",
      guestName: "Marcos Paulo",
      guestPhone: "5522998401818",
      score: 2,
      pendingResponse: false,
      sentAt: "2026-10-17T01:39:40.622Z",
      respondedAt: "2026-10-17T01:39:40.622Z"
    },
    {
      id: "nps_old_day",
      guestName: "Hóspede Antigo",
      guestPhone: "5521991112222",
      score: 3,
      pendingResponse: false,
      surveyVerifiedSent: true,
      sentAt: "2026-10-18T15:00:00.000Z",
      respondedAt: "2026-10-18T16:00:00.000Z"
    },
    {
      id: "nps_today_anderson",
      guestName: "??",
      guestPhone: "557192753737",
      flatNumber: "907",
      score: 4,
      pendingResponse: false,
      sentAt: "2026-10-21T16:08:19.586Z",
      respondedAt: "2026-10-21T16:08:19.586Z"
    }
  );

  const retroRes = await sanitizeAndDispatchTodaySub5Nps(db, () => {}, {
    sendZapiFn: mockSendZapi,
    onlyDateStr: "2026-10-21",
    dispatchTodayFollowups: true
  });
  assert.equal(retroRes.removedBogusCount, 1, "Must remove bogus Marcos Paulo entry");
  assert.ok(!db.npsResponses.some((n) => n.id === "nps_bogus_marcos"));
  assert.equal(retroRes.dispatchedCount, 1, "Must dispatch follow-up ONLY for today's < 5 evaluation (Anderson Prates)");
  assert.equal(retroRes.dispatched[0].guestName, "Anderson Prates", "Must resolve '??' to official guest name 'Anderson Prates'");
  assert.equal(retroRes.dispatched[0].score, 4);
  assert.match(retroRes.dispatched[0].message, /Anderson/i);
});

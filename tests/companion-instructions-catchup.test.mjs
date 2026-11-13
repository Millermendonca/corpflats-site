import assert from "node:assert/strict";
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  getReservationRecipients,
  buildTemplateTargets,
  resolveWhatsAppTags,
  dispatchCatchUpGuestRulerMessages
} from "../artifacts/api-server/zapi-service.mjs";

async function run() {
  const db = {
    zapiConfig: { instanceId: "", token: "", testModeOnly: false }, // 100% mock/offline
    settings: { checkinTime: "14:00", checkoutTime: "11:00" },
    flats: [{ id: 19, number: "1004", colName: "1004 Solteiro X" }],
    whatsappTemplates: structuredClone(DEFAULT_WHATSAPP_TEMPLATES),
    whatsappQueue: [],
    whatsappHistory: [
      {
        id: "hist_primary_1",
        reservationId: 886,
        reservationCode: "1004-0886",
        recipientType: "guest",
        guestName: "João Titular",
        guestPhone: "5522999990001",
        triggerEvent: "reservation_created",
        status: "sent",
        sentAt: new Date(Date.now() - 3600_000).toISOString()
      }
    ],
    emailQueue: []
  };

  const reservation = {
    id: 886,
    code: "1004-0886",
    flatId: 19,
    flatNumber: "1004",
    status: "confirmada",
    paymentStatus: "pago_total",
    channel: "whatsapp",
    checkinDate: "2026-11-15",
    checkoutDate: "2026-11-18",
    guestCount: 2,
    guestName: "João Titular",
    guestPhone: "(22) 99999-0001",
    fnhrCompleted: true,
    checkedInAt: new Date(Date.now() - 1800_000).toISOString(),
    guests: [
      { index: 1, name: "João Titular", phone: "(22) 99999-0001", hasCompletedCheckin: true },
      { index: 2, name: "Maria Acompanhante", phone: "(22) 99999-0002", hasCompletedCheckin: false }
    ]
  };
  db.reservations = [reservation];

  // 1. Verifica que buildTemplateTargets com onlyGuestIndex: 2 foca exclusivamente no 2º hóspede
  const tplCreated = db.whatsappTemplates.find(t => t.triggerEvent === "reservation_created");
  const recipients = getReservationRecipients(reservation, db);
  const targetsG2 = buildTemplateTargets(tplCreated, recipients, {
    onlyGuestIndex: 2,
    excludeRequester: true,
    allowFallbackToPrimary: false
  });
  assert.equal(targetsG2.length, 1, "Deve retornar exatamente 1 destinatário para onlyGuestIndex: 2");
  assert.equal(targetsG2[0].type, "guest_2");
  assert.equal(targetsG2[0].guestIndex, 2);
  assert.match(targetsG2[0].phone, /99999-0002/);

  // 1b. Verifica que se o 2º hóspede estiver sem telefone, NÃO faz fallback para o 1º hóspede
  const resWithoutG2Phone = {
    ...reservation,
    guests: [
      reservation.guests[0],
      { index: 2, name: "Maria Acompanhante", phone: "" }
    ]
  };
  const emptyTargets = buildTemplateTargets(tplCreated, getReservationRecipients(resWithoutG2Phone, db), {
    onlyGuestIndex: 2,
    excludeRequester: true,
    allowFallbackToPrimary: false
  });
  assert.equal(emptyTargets.length, 0, "Nunca deve cair em fallback para o telefone do 1º hóspede");

  // 2. Verifica que resolveWhatsAppTags gera saudação e link individual ?guest=2 para Maria
  const renderedForG2 = resolveWhatsAppTags(
    "Olá {{primeiro_nome}}! Link: {{link_precheckin}}",
    reservation,
    db,
    "https://corpflats.com.br",
    "guest_2"
  );
  assert.ok(renderedForG2.includes("Olá Maria!"), "Deve usar o primeiro nome da 2ª hóspede");
  assert.ok(renderedForG2.includes("/pre-checkin/1004-0886?guest=2"), "Deve gerar link individual ?guest=2");

  // 3. Verifica que dispatchCatchUpGuestRulerMessages com onlyGuestIndices: [2] envia SÓ para a 2ª hóspede
  const historyBefore = db.whatsappHistory.length;
  const result = await dispatchCatchUpGuestRulerMessages(db, () => {}, reservation, {
    baseUrl: "https://corpflats.com.br",
    onlyGuestIndices: [2]
  });

  assert.ok(
    result.dispatchedStages.includes("guest_2:reservation_created"),
    `Esperava estágio guest_2:reservation_created, recebeu: ${JSON.stringify(result.dispatchedStages)}`
  );

  const newEntries = db.whatsappHistory.slice(historyBefore);
  assert.ok(newEntries.length >= 2, "Deve registrar Apresentação + Confirmação para a 2ª hóspede no histórico");
  for (const h of newEntries) {
    const cleanP = String(h.guestPhone || h.phone || "").replace(/\D/g, "");
    assert.ok(
      cleanP.endsWith("22999990002"),
      `Nenhum envio novo pode ir para o 1º hóspede! Encontrado destino: ${cleanP}`
    );
    assert.equal(h.recipientType, "guest_2");
  }

  // 4. Verifica que na fila futura o pre_checkin_reminder é agendado para guest_2 (pendente), mas pulado para guest_1 (já concluído)
  const remindersForRes = db.whatsappQueue.filter(
    q => q.reservationCode === "1004-0886" && q.triggerEvent === "pre_checkin_reminder" && (q.status === "scheduled" || q.status === "pending")
  );
  assert.equal(remindersForRes.length, 1, "Apenas a 2ª hóspede pendente deve receber lembrete futuro de FNRH");
  assert.equal(remindersForRes[0].recipientType, "guest_2");

  console.log("✅ Teste pontual companion-instructions-catchup concluído com 100% de sucesso!");
}

run().catch(err => {
  console.error("❌ Falha no teste companion-instructions-catchup:", err);
  process.exit(1);
});

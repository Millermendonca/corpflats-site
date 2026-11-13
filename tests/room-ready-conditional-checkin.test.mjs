import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  resolveWhatsAppTags,
  renderTemplateButtons,
  deliverQueueItem
} from "../artifacts/api-server/zapi-service.mjs";

test("Mensagem de Quarto Pronto Condicional ao Check-in Online", async (t) => {
  const tplDirect = DEFAULT_WHATSAPP_TEMPLATES.find(tp => tp.id === "tpl_room_ready_direct");
  const tplOta = DEFAULT_WHATSAPP_TEMPLATES.find(tp => tp.id === "tpl_room_ready_ota");
  const tplRegular = DEFAULT_WHATSAPP_TEMPLATES.find(tp => tp.id === "tpl_room_ready_regular");

  await t.test("1. Quando o hóspede AINDA NÃO fez o Check-in Online: explica que o quarto está limpo e pronto aguardando o Check-in Online, sem mandar ir direto à recepção", () => {
    const resPendingCheckin = {
      id: 701,
      code: "RES-504-0701",
      flatNumber: "504",
      guestName: "Carlos Eduardo",
      guestPhone: "22999991111",
      status: "confirmada",
      channel: "site",
      checkinDate: "2026-11-06",
      checkoutDate: "2026-11-08",
      fnhrCompleted: false,
      preCheckinCompleted: false,
      guests: [
        { index: 1, name: "Carlos Eduardo", phone: "22999991111", hasCompletedCheckin: false }
      ]
    };

    for (const tpl of [tplDirect, tplOta, tplRegular]) {
      const msg = resolveWhatsAppTags(tpl.message, resPendingCheckin, {}, "https://corpflats.com.br", "guest", tpl);
      const btns = renderTemplateButtons(tpl.buttons, resPendingCheckin, {}, "https://corpflats.com.br", "guest", tpl);

      // Deve informar que está limpo e pronto e aguardando fazer o Check-in Online
      assert.match(msg, /limpo e pronto/i, `Template ${tpl.id} deve informar que o quarto está limpo e pronto`);
      assert.match(msg, /Check-in Online/i, `Template ${tpl.id} deve explicar a necessidade do Check-in Online`);
      assert.match(msg, /pre-checkin\/RES-504-0701/, `Template ${tpl.id} deve incluir o link do Check-in Online`);
      assert.match(msg, /ainda não está liberada apenas informando o nome/i, `Template ${tpl.id} deve deixar claro que não basta ir à recepção informar o nome sem fazer o check-in online`);

      // NÃO pode mandar se dirigir diretamente à portaria como se já estivesse liberado
      assert.doesNotMatch(msg, /📍 Ao chegar, basta se identificar na portaria 24h com seu nome/i);
      assert.doesNotMatch(msg, /📍 Ao chegar, vá à portaria 24h e informe seu nome/i);

      // Botão "Fazer Check-in Online" deve ser injetado e "Já Cheguei no Flat" omitido
      assert.ok(btns.some(b => b.id === "btn_chk" && /Check-in Online/i.test(b.label)), `Template ${tpl.id} deve exibir botão de Check-in Online`);
      assert.ok(!btns.some(b => b.id === "btn_cheguei"), `Template ${tpl.id} NÃO deve exibir botão 'Já Cheguei no Flat' antes do Check-in Online`);
    }
  });

  await t.test("2. Quando o hóspede JÁ FEZ o Check-in Online: informa que está pronto e que basta ir à recepção/portaria 24h e informar o nome", () => {
    const resDoneCheckin = {
      id: 702,
      code: "RES-504-0702",
      flatNumber: "504",
      guestName: "Carlos Eduardo",
      guestPhone: "22999991111",
      status: "confirmada",
      channel: "site",
      checkinDate: "2026-11-06",
      checkoutDate: "2026-11-08",
      fnhrCompleted: true,
      preCheckinCompleted: true,
      guests: [
        { index: 1, name: "Carlos Eduardo", phone: "22999991111", hasCompletedCheckin: true, status: "CHECKED_IN" }
      ]
    };

    for (const tpl of [tplDirect, tplOta, tplRegular]) {
      const msg = resolveWhatsAppTags(tpl.message, resDoneCheckin, {}, "https://corpflats.com.br", "guest", tpl);
      const btns = renderTemplateButtons(tpl.buttons, resDoneCheckin, {}, "https://corpflats.com.br", "guest", tpl);

      // Deve orientar ir à portaria 24h e informar o nome e o número do quarto
      assert.match(msg, /portaria 24h.*504/i, `Template ${tpl.id} deve orientar identificar-se na portaria 24h com nome e quarto`);
      assert.doesNotMatch(msg, /ainda não está liberada apenas informando o nome/i, `Template ${tpl.id} não deve exibir trava de check-in pendente quando já concluído`);

      // Botão "Já Cheguei no Flat" deve estar presente e "Fazer Check-in Online" removido
      assert.ok(btns.some(b => b.id === "btn_cheguei"), `Template ${tpl.id} deve exibir botão 'Já Cheguei no Flat' quando Check-in Online concluído`);
      assert.ok(!btns.some(b => b.id === "btn_chk"), `Template ${tpl.id} NÃO deve exibir botão de Check-in Online quando já concluído`);
    }
  });

  await t.test("3. Salvaguarda para template legado salvo no banco e re-renderização dinâmica na entrega da fila (deliverQueueItem)", async () => {
    const legacyMessage = `*{{primeiro_nome}}*, seu flat está pronto! 🔑✨
Seu *Flat {{quarto}}* no *{{nome_hotel}}* já está *Limpo e Liberado* para receber você!

📍 Ao chegar, basta se identificar na portaria 24h com seu nome e o número *{{quarto}}*.`;

    const resv = {
      id: 703,
      code: "RES-602-0703",
      flatId: 602,
      flatNumber: "602",
      guestName: "Mariana Costa",
      guestPhone: "", // sem telefone para não acionar envio externo no teste
      guestEmail: "",
      status: "confirmada",
      channel: "site",
      checkinDate: new Date().toISOString().substring(0, 10),
      checkoutDate: "2026-12-31",
      fnhrCompleted: false,
      preCheckinCompleted: false,
      guests: [{ index: 1, name: "Mariana Costa", hasCompletedCheckin: false }]
    };

    const renderedWhenPending = resolveWhatsAppTags(legacyMessage, resv, {}, "https://corpflats.com.br", "guest", { id: "tpl_room_ready_regular", triggerEvent: "room_ready_regular" });
    assert.match(renderedWhenPending, /aguardando apenas você fazer o seu \*Check-in Online\*/i);
    assert.doesNotMatch(renderedWhenPending, /basta se identificar na portaria 24h com seu nome/i);

    // Simula item agendado às 08:30 quando o check-in ainda estava pendente, e às 09:45 o hóspede conclui o check-in antes da entrega às 10:00
    const db = {
      reservations: [resv],
      whatsappTemplates: DEFAULT_WHATSAPP_TEMPLATES,
      cleaningRequests: [],
      whatsappQueue: [],
      whatsappHistory: []
    };
    const queueItem = {
      id: "q_direct_test",
      reservationId: resv.id,
      reservationCode: resv.code,
      guestName: resv.guestName,
      guestPhone: "",
      guestEmail: "",
      recipientType: "guest",
      triggerEvent: "room_ready",
      templateId: "tpl_room_ready_direct",
      status: "scheduled",
      renderedMessage: renderedWhenPending,
      renderedButtons: []
    };

    // Hóspede conclui check-in online antes da entrega do item da fila
    resv.fnhrCompleted = true;
    resv.preCheckinCompleted = true;
    resv.guests[0].hasCompletedCheckin = true;
    resv.guests[0].status = "CHECKED_IN";

    await deliverQueueItem(db, () => {}, queueItem, { skipWhatsApp: true });
    assert.match(queueItem.renderedMessage, /Ao chegar, basta se identificar na portaria 24h com seu nome e o número \*602\*/i);
    assert.doesNotMatch(queueItem.renderedMessage, /ainda não está liberada apenas informando o nome/i);
  });
});

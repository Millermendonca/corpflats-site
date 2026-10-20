import assert from "node:assert/strict";
import {
  selectFairShareFlat,
  extractActivePreReservationData,
  isOperatorConductingConversation,
  evaluateAndNotifyActivePreReservation,
  createStandardPmsPreReservation,
  handleManagerPreReservationReply,
  parseManagerPreReservationCommand,
  processAiInboundMessage
} from "../artifacts/api-server/whatsapp-ai-service.mjs";

console.log("🧪 Iniciando teste pontual: Assistente Ativa de Pré-Reservas (Sofia)...");

function createMockDb() {
  return {
    zapiConfig: {
      enabled: false,
      channels: {
        ai_agent: { enabled: true, testMode: false, whitelist: [], blacklist: [] }
      }
    },
    settings: {
      emailSettings: { enabled: false },
      interConfig: { pixKey: "47964813000165" }
    },
    whatsappAiSettings: {
      enabled: true,
      mode: "autonomous",
      agentName: "Sofia",
      developerPhone: "22998505276",
      botActionsSettings: {
        apiActionsEnabled: true,
        preReservationHoldMinutes: 30,
        allowedActions: {
          checkAvailability: true,
          calculateQuote: true,
          generatePayment: true,
          createPreReservation: true,
          commitReservation: true
        }
      }
    },
    flats: [
      { id: 1, number: "301", isActive: true, status: "disponivel" },
      { id: 2, number: "404", isActive: true, status: "disponivel" },
      { id: 3, number: "501", isActive: true, status: "disponivel" },
      { id: 4, number: "509", isActive: true, status: "disponivel" }
    ],
    reservations: [
      // Flat 301: 10 diárias ocupadas em novembro/2026
      {
        id: 10,
        code: "RES-301-0010",
        flatId: 1,
        flatNumber: "301",
        checkinDate: "2026-11-01",
        checkoutDate: "2026-11-11",
        status: "confirmada"
      },
      // Flat 404: ocupado no período desejado (20/11 a 22/11/2026)
      {
        id: 11,
        code: "RES-404-0011",
        flatId: 2,
        flatNumber: "404",
        checkinDate: "2026-11-19",
        checkoutDate: "2026-11-23",
        status: "confirmada"
      },
      // Flat 501: 3 diárias ocupadas no mês, último check-out em 15/11/2026
      {
        id: 12,
        code: "RES-501-0012",
        flatId: 3,
        flatNumber: "501",
        checkinDate: "2026-11-12",
        checkoutDate: "2026-11-15",
        status: "checkout"
      },
      // Flat 509: 3 diárias ocupadas no mês, último check-out em 05/11/2026 (há mais dias ocioso -> Flat da Vez!)
      {
        id: 13,
        code: "RES-509-0013",
        flatId: 4,
        flatNumber: "509",
        checkinDate: "2026-11-02",
        checkoutDate: "2026-11-05",
        status: "checkout"
      }
    ],
    guests: [],
    whatsappConversations: [],
    pendingPreReservationProposals: []
  };
}

// ----------------------------------------------------------------------------
// 1. Teste da lógica do "Flat da Vez" (Fair-Share)
// ----------------------------------------------------------------------------
{
  const db = createMockDb();
  const fairShare = selectFairShareFlat(db, "2026-11-20", "2026-11-22");
  assert.ok(fairShare.recommendedFlat, "Deve recomendar um flat disponível");
  assert.equal(fairShare.recommendedFlat.number, "509", "Flat 509 deve ser o Flat da Vez (empatado em 3 diárias no mês com 501, porém há mais dias desde o último checkout)");
  const availNums = fairShare.availableFlats.map(f => f.number);
  assert.deepEqual(availNums, ["509", "501", "301"], "Apenas flats disponíveis ordenados pelo Fair-Share (404 ocupado deve ser excluído)");
  console.log("✅ 1. Lógica Fair-Share ('Flat da Vez') validada com sucesso.");
}

// ----------------------------------------------------------------------------
// 2. Teste do gatilho de 5 dados obrigatórios + intenção de reserva
// ----------------------------------------------------------------------------
{
  const db = createMockDb();
  const guestPhone = "5522999112233";

  // 2.1 Falta CPF, E-mail e Nome Completo (apenas primeiro nome "Carlos")
  const partialMessages1 = [
    { fromMe: false, text: "Olá, gostaria de reservar de 20/11/2026 a 22/11/2026" },
    { fromMe: true, senderName: "Operador", text: "Olá! Temos disponibilidade. A diária fica R$ 250,00, total R$ 500,00." },
    { fromMe: false, text: "Meu nome é Carlos" }
  ];
  const ext1 = extractActivePreReservationData(partialMessages1, db, guestPhone);
  assert.equal(ext1.isComplete, false, "Não deve estar completo sem sobrenome, CPF e e-mail");
  assert.ok(ext1.missingFields.includes("nome_completo"), "Nome de 1 palavra apenas não deve contar como nome completo");
  assert.ok(ext1.missingFields.includes("cpf"), "Deve apontar falta de CPF");
  assert.ok(ext1.missingFields.includes("email"), "Deve apontar falta de e-mail");

  // 2.2 Falta Orçamento/Valor (tem datas, nome completo, CPF e e-mail, mas operador ainda não passou valor)
  const partialMessages2 = [
    { fromMe: false, text: "Quero fazer uma reserva de 20/11/2026 a 22/11/2026" },
    { fromMe: false, text: "Carlos Eduardo Almeida\n123.456.789-01\ncarlos.almeida@gmail.com" }
  ];
  const ext2 = extractActivePreReservationData(partialMessages2, db, guestPhone);
  assert.equal(ext2.isComplete, false, "Não deve estar completo sem orçamento/valor");
  assert.deepEqual(ext2.missingFields, ["orcamento_valor"]);

  // 2.3 Todos os 5 itens presentes + intenção de reserva
  const completeMessages = [
    ...partialMessages2,
    { fromMe: true, senderName: "Operador", text: "Perfeito Carlos! O valor total das 2 diárias fica R$ 540,00 sem café." }
  ];
  const ext3 = extractActivePreReservationData(completeMessages, db, guestPhone);
  assert.equal(ext3.isComplete, true, "Deve estar completo com os 5 itens obrigatórios");
  assert.equal(ext3.checkIn, "2026-11-20");
  assert.equal(ext3.checkOut, "2026-11-22");
  assert.equal(ext3.nights, 2);
  assert.equal(ext3.totalAmount, 540);
  assert.equal(ext3.dailyRate, 270);
  assert.equal(ext3.guestName, "Carlos Eduardo Almeida");
  assert.equal(ext3.guestCpf, "12345678901");
  assert.equal(ext3.guestEmail, "carlos.almeida@gmail.com");
  assert.equal(ext3.includeBreakfast, false);

  // 2.4 Pedido puramente fiscal (Nota Fiscal pós-checkout) não deve disparar intenção de reserva
  const fiscalOnlyMessages = [
    { fromMe: false, text: "Bom dia, preciso da nota fiscal da minha estadia de 01/11/2026 a 03/11/2026 no valor de R$ 500,00. Nome: Carlos Eduardo Almeida, CPF 123.456.789-01, carlos@gmail.com" }
  ];
  const extFiscal = extractActivePreReservationData(fiscalOnlyMessages, db, guestPhone);
  assert.equal(extFiscal.hasBookingIntent, false, "Pedido puramente de nota fiscal não deve ter hasBookingIntent");
  assert.equal(extFiscal.isComplete, false);

  console.log("✅ 2. Extração e validação dos 5 dados mínimos obrigatórios validada com sucesso.");
}

// ----------------------------------------------------------------------------
// 3. Escopo: Sofia sozinha vs. Atendimento conduzido pelo operador humano
// ----------------------------------------------------------------------------
{
  const db = createMockDb();
  const guestPhone = "5522999887766";

  // 3.1 Sofia atendendo sozinha (aiPaused: false, sem mensagens de operador humano)
  const convSofiaAlone = {
    id: "conv_alone",
    phone: guestPhone,
    aiPaused: false,
    messages: [
      { fromMe: false, text: "Quero reservar de 20/11/2026 a 22/11/2026" },
      { fromMe: true, senderName: "Sofia", text: "Olá! Sou a Sofia, Concierge Virtual do CorpFlats. O total fica R$ 540,00." },
      { fromMe: false, text: "Maria Fernanda Costa, CPF 234.567.890-12, maria.costa@uol.com.br" }
    ]
  };
  assert.equal(
    isOperatorConductingConversation(convSofiaAlone, db),
    false,
    "Quando apenas a Sofia respondeu e aiPaused é false, não deve classificar como atendimento de operador"
  );

  let sentToManagerCount = 0;
  const evalAlone = await evaluateAndNotifyActivePreReservation({
    db,
    conv: convSofiaAlone,
    cleanTarget: guestPhone,
    sendZapiMessage: async () => { sentToManagerCount++; return { success: true }; }
  });
  assert.equal(evalAlone.triggered, false);
  assert.equal(evalAlone.reason, "not_operator_conversation");
  assert.equal(sentToManagerCount, 0, "Sofia sozinha não deve enviar pedido de confirmação para o WhatsApp do gestor");

  console.log("✅ 3. Distinção de escopo (Sofia sozinha vs. Operador humano) validada com sucesso.");
}

// ----------------------------------------------------------------------------
// 4. Fluxo Completo: Notificação ao Gestor + Revisão + Confirmação com Edição + Criação Padrão PMS
// ----------------------------------------------------------------------------
{
  const db = createMockDb();
  const guestPhone = "5522999445566";
  const managerPhone = "5522998505276";
  const sentMessages = [];
  const appendedMessages = [];
  let immediateTriggers = [];

  const mockSendZapi = async (_cfg, payload) => {
    sentMessages.push(payload);
    return { success: true, messageId: `mock_${sentMessages.length}` };
  };
  const mockAppendMsg = (_db, msg) => {
    appendedMessages.push(msg);
  };
  const mockTriggerImmediate = async (_db, _save, eventName, reservation) => {
    immediateTriggers.push({ eventName, reservation });
  };

  // Conversa conduzida pelo operador humano (aiPaused: true)
  const conv = {
    id: "conv_manual_1",
    phone: guestPhone,
    name: "Roberto",
    aiPaused: true,
    aiPausedReason: "operator_manual_reply",
    messages: [
      { fromMe: false, text: "Boa tarde! Tem vaga de 20/11/2026 a 22/11/2026 para casal?" },
      { fromMe: true, senderName: "Operador", text: "Boa tarde! Temos sim. Para 2 diárias fica R$ 540,00 sem café ou R$ 614,00 com café da manhã." },
      { fromMe: false, text: "Vamos querer sem café mesmo. Segue meus dados: Roberto Carlos Nascimento, CPF 345.678.901-23, email roberto.nascimento@empresa.com.br" }
    ]
  };
  db.whatsappConversations.push(conv);

  // Hóspede envia a última mensagem completando os 5 dados -> processAiInboundMessage é chamado pelo webhook
  const inboundRes = await processAiInboundMessage({
    db,
    incomingInfo: {
      fromMe: false,
      isGroup: false,
      text: conv.messages[2].text,
      senderName: "Roberto",
      phone: guestPhone
    },
    cleanTarget: guestPhone,
    saveDatabase: () => {},
    createNotification: () => {},
    sendZapiMessage: mockSendZapi,
    appendMessageFn: mockAppendMsg
  });

  assert.equal(inboundRes.skipped, true, "Não deve enviar resposta da IA para o hóspede pois a conversa está com operador humano");
  assert.equal(inboundRes.reason, "conversation_ai_paused");
  assert.equal(inboundRes.activePreReservation?.triggered, true, "Deve ter acionado a Assistente Ativa de Pré-Reservas");

  // Verifica que a Sofia enviou mensagem APENAS para o WhatsApp do gestor (5522998505276)
  assert.equal(sentMessages.length, 1, "Deve ter enviado 1 mensagem via Z-API");
  assert.equal(sentMessages[0].phone, managerPhone, "Destinatário deve ser o WhatsApp do gestor (5522998505276)");
  assert.match(sentMessages[0].message, /Roberto Carlos Nascimento/, "Resumo deve conter o nome completo");
  assert.match(sentMessages[0].message, /345\.678\.901-23/, "Resumo deve conter o CPF formatado");
  assert.match(sentMessages[0].message, /roberto\.nascimento@empresa\.com\.br/, "Resumo deve conter o e-mail");
  assert.match(sentMessages[0].message, /20\/11\/2026 a 22\/11\/2026/, "Resumo deve conter as datas");
  assert.match(sentMessages[0].message, /540,00/, "Resumo deve conter o valor de R$ 540,00 (opção sem café escolhida)");
  assert.match(sentMessages[0].message, /Flat 509/, "Resumo deve sugerir o Flat 509 (Flat da Vez)");

  // Verifica deduplicação se outra mensagem chegar sem alterar os dados
  const dupRes = await evaluateAndNotifyActivePreReservation({
    db,
    conv,
    cleanTarget: guestPhone,
    sendZapiMessage: mockSendZapi
  });
  assert.equal(dupRes.triggered, false);
  assert.equal(dupRes.reason, "proposal_already_notified");
  assert.equal(sentMessages.length, 1, "Não deve reenviar mensagem duplicada ao gestor");

  // 4.1 Gestor tenta colocar em um flat ocupado (Flat 404) -> Sofia avisa do conflito e mantém proposta aberta
  const conflictReply = await handleManagerPreReservationReply({
    db,
    cleanTarget: managerPhone,
    messageText: "Pode criar no flat 404",
    sendZapiMessage: mockSendZapi,
    appendMessageFn: mockAppendMsg,
    triggerImmediateFn: mockTriggerImmediate
  });
  assert.equal(conflictReply.handled, true);
  assert.equal(conflictReply.action, "flat_unavailable");
  assert.match(conflictReply.replyText, /Flat 404.*conflito/i);
  assert.equal(db.reservations.length, 4, "Não deve ter criado reserva em flat ocupado");

  // 4.2 Gestor pede para alterar para o Flat 501 e valor 480 para revisar antes de criar
  const reviewReply = await handleManagerPreReservationReply({
    db,
    cleanTarget: managerPhone,
    messageText: "Muda para o flat 501 e valor 480 para eu revisar",
    sendZapiMessage: mockSendZapi,
    appendMessageFn: mockAppendMsg,
    triggerImmediateFn: mockTriggerImmediate
  });
  assert.equal(reviewReply.handled, true);
  assert.equal(reviewReply.action, "updated_for_review");
  assert.equal(reviewReply.proposal.flatNumber, "501");
  assert.equal(reviewReply.proposal.totalAmount, 480);
  assert.equal(reviewReply.proposal.dailyRate, 240);
  assert.match(reviewReply.replyText, /Resumo Atualizado da Pré-Reserva/);
  assert.equal(db.reservations.length, 4, "Ainda não deve criar a pré-reserva no modo revisão");

  // 4.3 Gestor confirma a criação alterando para o Flat 509 e incluindo café da manhã por R$ 580
  const confirmReply = await handleManagerPreReservationReply({
    db,
    cleanTarget: managerPhone,
    messageText: "Pode criar, mas coloca no flat 509 com café incluso e valor 580",
    sendZapiMessage: mockSendZapi,
    appendMessageFn: mockAppendMsg,
    triggerImmediateFn: mockTriggerImmediate
  });
  assert.equal(confirmReply.handled, true);
  assert.equal(confirmReply.action, "confirmed_and_created");
  assert.ok(confirmReply.reservation, "Deve retornar o objeto da pré-reserva criada");

  const created = confirmReply.reservation;
  assert.equal(created.status, "pre_reserva", "Status deve ser pre_reserva");
  assert.equal(created.flatNumber, "509", "Flat deve ser 509 conforme confirmado pelo gestor");
  assert.equal(created.totalAmount, 580, "Valor total deve ser 580 conforme editado pelo gestor");
  assert.equal(created.dailyRate, 290, "Diária deve ser 290 (580 / 2 diárias)");
  assert.equal(created.includeBreakfast, true, "Café da manhã deve estar incluso");
  assert.equal(created.ratePlan, "with_breakfast");
  assert.equal(created.guestName, "Roberto Carlos Nascimento");
  assert.equal(created.guestCpf, "34567890123");
  assert.equal(created.guestEmail, "roberto.nascimento@empresa.com.br");
  assert.equal(created.guestsCount, 2, "Deve preservar 2 hóspedes (casal) detectado na conversa");
  assert.ok(created.code.startsWith("RES-509-"), "Código deve seguir o padrão PMS RES-{flat}-{id}");
  assert.ok(created.pixCopiaECola && created.pixCopiaECola.length > 20, "Deve gerar payload PIX Copia e Cola");

  // Verifica que a régua padrão de pré-reserva (pre_reservation_created) foi acionada
  assert.equal(immediateTriggers.length, 1, "Deve acionar triggerImmediateWhatsApp exatamente 1 vez");
  assert.equal(immediateTriggers[0].eventName, "pre_reservation_created");
  assert.equal(immediateTriggers[0].reservation.code, created.code);

  // Verifica que NENHUMA mensagem da IA foi enviada para o telefone do hóspede em sentMessages
  const guestSentMessages = sentMessages.filter(m => m.phone === guestPhone);
  assert.equal(guestSentMessages.length, 0, "Sofia NÃO deve enviar mensagem extra de IA ao hóspede na confirmação");

  console.log("✅ 4. Fluxo completo de notificação, revisão, edição, confirmação e criação PMS validado com sucesso.");
}

// ----------------------------------------------------------------------------
// 5. Casos de Borda: Operador completando o 5º item, Edição de Datas/Diária, Coaching Não Interceptado e Cancelamento
// ----------------------------------------------------------------------------
{
  const db = createMockDb();
  const guestPhone = "5522999776655";
  const managerPhone = "5522998505276";
  const sentMessages = [];

  const mockSendZapi = async (_cfg, payload) => {
    sentMessages.push(payload);
    return { success: true, messageId: `mock_edge_${sentMessages.length}` };
  };

  // Hóspede já enviou Datas, Nome Completo, CPF e E-mail; falta apenas o Orçamento/Valor do operador
  const conv = {
    id: "conv_edge_1",
    phone: guestPhone,
    name: "Fernanda",
    aiPaused: true,
    messages: [
      { fromMe: false, text: "Olá! Quero reservar em nome de Fernanda Lima Rocha, CPF 45678901234, fernanda.rocha@outlook.com" },
      { fromMe: false, text: "Check-in: 24/11/2026\nCheck-out: 26/11/2026" },
      { fromMe: true, senderName: "Operador", text: "Perfeito Fernanda! Para essas 2 diárias fica R$ 500,00." }
    ]
  };
  db.whatsappConversations.push(conv);

  // Operador envia a mensagem que completa os 5 itens (incomingInfo.fromMe: true)
  const opEval = await evaluateAndNotifyActivePreReservation({
    db,
    conv,
    cleanTarget: guestPhone,
    incomingInfo: {
      fromMe: true,
      text: conv.messages[2].text,
      phone: guestPhone,
      senderName: "Operador"
    },
    sendZapiMessage: mockSendZapi
  });

  assert.equal(opEval.triggered, true, "Deve disparar quando o operador envia o 5º item faltante (orçamento)");
  assert.equal(opEval.proposal.guestName, "Fernanda Lima Rocha");
  assert.equal(opEval.proposal.guestCpf, "45678901234");
  assert.equal(opEval.proposal.checkIn, "2026-11-24");
  assert.equal(opEval.proposal.checkOut, "2026-11-26");
  assert.equal(opEval.proposal.totalAmount, 500);

  // Comando de calibração de tom do gestor NÃO deve ser engolido como resposta à pré-reserva
  const coachingCheck = await handleManagerPreReservationReply({
    db,
    cleanTarget: managerPhone,
    messageText: "Sofia, seja mais formal e não use emojis",
    sendZapiMessage: mockSendZapi
  });
  assert.equal(coachingCheck.handled, false, "Comando de treinamento/calibração da Sofia não deve ser interceptado como confirmação de pré-reserva");

  // Edição de datas (3 diárias: 25/11 a 28/11) + sufixo "260 reais a diária" -> total deve ir para 780
  const cmdParsed = parseManagerPreReservationCommand(
    "Muda para 25/11/2026 a 28/11/2026 por 260 reais a diária para eu revisar",
    opEval.proposal,
    db
  );
  assert.equal(cmdParsed.matched, true);
  assert.equal(cmdParsed.action, "update_and_review");
  assert.equal(cmdParsed.updates.checkIn, "2026-11-25");
  assert.equal(cmdParsed.updates.checkOut, "2026-11-28");
  assert.equal(cmdParsed.updates.nights, 3);
  assert.equal(cmdParsed.updates.dailyRate, 260);
  assert.equal(cmdParsed.updates.totalAmount, 780);

  // Cancelamento da proposta pelo gestor
  const cancelRes = await handleManagerPreReservationReply({
    db,
    cleanTarget: managerPhone,
    messageText: "Não precisa criar, pode cancelar",
    sendZapiMessage: mockSendZapi
  });
  assert.equal(cancelRes.handled, true);
  assert.equal(cancelRes.action, "cancelled");
  assert.equal(opEval.proposal.status, "cancelled");

  console.log("✅ 5. Casos de borda (operador completando 5º item, edição de datas/diária, não-interceptação de coaching e cancelamento) validados com sucesso.");
}

console.log("🎉 Todos os testes pontuais da Assistente Ativa de Pré-Reservas passaram com 100% de sucesso!");


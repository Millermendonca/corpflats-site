import test from "node:test";
import assert from "node:assert/strict";
import {
  injectSessionContext,
  buildContextoSessaoJson,
  consultarDisponibilidadeTool,
  calcularOrcamentoTool,
  gerarLinkReservaTool,
  enviarMidiaUnidadeTool,
  consultarDetalhesReservaTool,
  atualizarDadosHospedeTool,
  solicitarEarlyCheckinTool,
  solicitarLateCheckoutTool,
  alterarDatasReservaTool,
  estenderEstadiaTool,
  solicitarLimpezaExtraTool,
  abrirChamadoManutencaoTool,
  resolverProblemaCartaoNfcTool,
  autorizarVisitaTemporariaTool,
  processarCancelamentoTool,
  consultarAchadosEPerdidosTool,
  gerenciarNotaFiscalNfseTool,
  notificarAdministradorTool,
  ALL_AGENT_TOOLS,
  getToolsForState,
  handleManagerExtensionReply,
  handleManagerCancellationReply,
} from "../artifacts/api-server/whatsapp-ai-service.mjs";

test("Pilar 1 & 2: Middleware injectSessionContext e State Router (4 Estados + Cartão NFC + Zero-Ask)", () => {
  const now = new Date("2026-11-02T14:30:00-03:00");
  const db = {
    reservations: [
      {
        id: 587,
        code: "RES-212-0587",
        flatNumber: "212",
        guestName: "Miller Mendonça Pessanha",
        guestPhone: "5522998505276",
        checkinDate: "2026-11-02",
        checkoutDate: "2026-11-05",
        paymentStatus: "paid",
        status: "confirmada",
      },
      {
        id: 601,
        code: "RES-301-0601",
        flatNumber: "301",
        guestName: "Ana Clara",
        guestPhone: "5511988887777",
        checkinDate: "2026-11-10",
        checkoutDate: "2026-11-12",
        paymentStatus: "pending",
        status: "confirmada",
      },
      {
        id: 602,
        code: "RES-401-0602",
        flatNumber: "401",
        guestName: "Carlos Ex-Hóspede",
        guestPhone: "5521966665555",
        checkinDate: "2026-10-20",
        checkoutDate: "2026-10-25",
        paymentStatus: "paid",
        status: "concluida",
      },
    ],
  };

  assert.equal(ALL_AGENT_TOOLS.length, 18);

  // 1. Hóspede em estadia -> IN_STAY_CONCIERGE / MODO_CONCIERGE_INSTAY
  const ctxInStay = injectSessionContext({ db, phone: "22998505276", now });
  assert.equal(ctxInStay.estado_atual, "IN_STAY_CONCIERGE");
  assert.equal(ctxInStay.modo_roteamento, "MODO_CONCIERGE_INSTAY");
  assert.equal(ctxInStay.perfil_remetente, "HOSPEDE_ATIVO");
  assert.equal(ctxInStay.reserva_ativa?.id, "RES-212-0587");
  assert.equal(ctxInStay.reserva_ativa?.acesso_imovel, "Cartão NFC retirado na recepção 24h");
  assert.equal(ctxInStay.reserva_ativa?.senha_fechadura, undefined);

  const jsonPayload = JSON.parse(buildContextoSessaoJson(ctxInStay));
  assert.equal(jsonPayload.contexto_sessao.estado_atual, "IN_STAY_CONCIERGE");
  assert.equal(jsonPayload.contexto_sessao.dados_hospede.nome, "Miller Mendonça Pessanha");

  // 2. Reserva futura -> PRE_CHECKIN / MODO_PRE_CHECKIN
  const ctxPre = injectSessionContext({ db, phone: "11988887777", now });
  assert.equal(ctxPre.estado_atual, "PRE_CHECKIN");
  assert.equal(ctxPre.modo_roteamento, "MODO_PRE_CHECKIN");
  assert.equal(ctxPre.reserva_ativa?.id, "RES-301-0601");

  // 3. Pós Check-out -> POS_CHECKOUT / MODO_POS_CHECKOUT
  const ctxPost = injectSessionContext({ db, phone: "21966665555", now });
  assert.equal(ctxPost.estado_atual, "POS_CHECKOUT");
  assert.equal(ctxPost.modo_roteamento, "MODO_POS_CHECKOUT");

  // 4. Lead desconhecido -> COMERCIAL_VENDAS / MODO_COMERCIAL_LEAD
  const ctxLead = injectSessionContext({ db, phone: "21977776666", now });
  assert.equal(ctxLead.estado_atual, "COMERCIAL_VENDAS");
  assert.equal(ctxLead.modo_roteamento, "MODO_COMERCIAL_LEAD");
  assert.equal(ctxLead.perfil_remetente, "LEAD_DESCONHECIDO");
  assert.equal(ctxLead.reserva_ativa, undefined);

  // Tools por estado
  const comercialTools = getToolsForState("COMERCIAL_VENDAS").map((t) => t.name);
  assert.ok(comercialTools.includes("consultar_disponibilidade"));
  assert.ok(comercialTools.includes("calcular_orcamento"));
  assert.ok(comercialTools.includes("gerar_link_reserva"));
  assert.ok(comercialTools.includes("enviar_midia_unidade"));
  assert.ok(comercialTools.includes("notificar_administrador"));

  const inStayTools = getToolsForState("IN_STAY_CONCIERGE").map((t) => t.name);
  assert.ok(inStayTools.includes("solicitar_late_checkout"));
  assert.ok(inStayTools.includes("resolver_problema_cartao_nfc"));
  assert.ok(inStayTools.includes("autorizar_visita_temporaria"));
  assert.ok(inStayTools.includes("processar_cancelamento"));
  assert.ok(inStayTools.includes("consultar_achados_e_perdidos"));
});

test("Regra 1: solicitar_late_checkout (Seg-Sáb cortesia até 13h, Domingo cortesia até 18h se ocupação < 50% com remanejamento para Flat da Vez)", async () => {
  // Segunda-feira 2026-11-02
  const mondayNow = new Date("2026-11-02T10:00:00-03:00");
  const dbMonday = {
    flats: [
      { id: 1, number: "212", isActive: true },
      { id: 2, number: "304", isActive: true },
      { id: 3, number: "509", isActive: true },
      { id: 4, number: "712", isActive: true },
    ],
    reservations: [
      {
        id: 587,
        code: "RES-212-0587",
        flatNumber: "212",
        guestName: "Miller Mendonça Pessanha",
        guestPhone: "5522998505276",
        checkinDate: "2026-11-01",
        checkoutDate: "2026-11-02",
        dailyRate: 250,
        paymentStatus: "paid",
        status: "confirmada",
      },
    ],
  };

  const ctxMon = injectSessionContext({ db: dbMonday, phone: "22998505276", now: mondayNow });

  // 1. Segunda-feira às 13:00 -> Cortesia imediata
  const res13h = await solicitarLateCheckoutTool.execute(
    { horario_solicitado: "13:00", confirmacao_hospede: false },
    ctxMon
  );
  assert.equal(res13h.status, "SUCESSO_EXECUTADO");
  assert.equal(res13h.dados.cortesia, true);
  assert.equal(dbMonday.reservations[0].lateCheckoutTime, "13:00");

  // 2. Segunda-feira às 16:00 sem conflito -> cobra 1 diária inteira (SIMULACAO_AGUARDANDO_CONFIRMACAO)
  const res16hSim = await solicitarLateCheckoutTool.execute(
    { horario_solicitado: "16:00", confirmacao_hospede: false },
    ctxMon
  );
  assert.equal(res16hSim.status, "SIMULACAO_AGUARDANDO_CONFIRMACAO");
  assert.equal(res16hSim.dados.valor_taxa, 250);

  // 3. Domingo (2026-11-08) com ocupação < 50% (1 de 4 flats ocupados = 25%) e outra reserva entrando hoje -> Cortesia até 18h + remaneja próxima reserva para Flat da Vez
  const sundayNow = new Date("2026-11-08T10:00:00-03:00");
  const dbSunday = {
    flats: [
      { id: 1, number: "212", isActive: true },
      { id: 2, number: "304", isActive: true },
      { id: 3, number: "509", isActive: true },
      { id: 4, number: "712", isActive: true },
    ],
    reservations: [
      {
        id: 700,
        code: "RES-212-0700",
        flatNumber: "212",
        guestName: "Hóspede Domingo",
        guestPhone: "5522998505276",
        checkinDate: "2026-11-06",
        checkoutDate: "2026-11-08",
        dailyRate: 250,
        paymentStatus: "paid",
        status: "confirmada",
      },
      {
        id: 701,
        code: "RES-212-0701",
        flatNumber: "212",
        guestName: "Próximo Hóspede Domingo",
        guestPhone: "5511977778888",
        checkinDate: "2026-11-08",
        checkoutDate: "2026-11-10",
        status: "confirmada",
      },
    ],
  };

  const ctxSun = injectSessionContext({ db: dbSunday, phone: "22998505276", now: sundayNow });
  const resSun17h = await solicitarLateCheckoutTool.execute(
    { horario_solicitado: "17:30", confirmacao_hospede: false },
    ctxSun
  );
  assert.equal(resSun17h.status, "SUCESSO_EXECUTADO");
  assert.equal(resSun17h.dados.cortesia, true);
  assert.notEqual(dbSunday.reservations[1].flatNumber, "212"); // Próxima reserva foi remanejada para o Flat da Vez!
});

test("Regras 2, 3, 4, 5, 6 e 7: Prorrogação, Cartão NFC, Visitas, Cancelamento, Descontos 7d/15d/30d e Achados e Perdidos", async () => {
  const sentEmails = [];
  const sentMessages = [];
  globalThis.sendEmailAsync = (payload) => {
    sentEmails.push(payload);
    return payload;
  };

  const db = {
    settings: { adminWhatsapp: "5522998505276", pixKey: "47.964.813/0001-65" },
    tariffSettings: {
      baseRateNoBreakfast: 257,
      breakfastPriceSingle: 35,
      breakfastPriceDouble: 50,
      stayDiscounts: [
        { minNights: 7, discountPercent: 10 },
        { minNights: 15, discountPercent: 15 },
        { minNights: 30, discountPercent: 25 },
      ],
    },
    flats: [
      { id: 1, number: "212", isActive: true, maxGuests: 2 },
      { id: 2, number: "304", isActive: true, maxGuests: 2 },
    ],
    lostAndFound: [
      {
        id: "lf_1",
        flatNumber: "212",
        description: "Carregador de iPhone branco",
        status: "stored",
        foundDate: "2026-11-02",
        photoUrl: "https://corpflats.com.br/lf1.jpg",
      },
    ],
    reservations: [
      {
        id: 587,
        code: "RES-212-0587",
        flatNumber: "212",
        guestName: "Miller Mendonça Pessanha",
        guestCpf: "12585736792",
        guestPhone: "5522999991111",
        checkinDate: "2026-11-02",
        checkoutDate: "2026-11-03",
        guestCount: 1,
        dailyRate: 250,
        totalAmount: 250,
        paymentStatus: "paid",
        status: "confirmada",
      },
    ],
  };

  const leadCtx = injectSessionContext({ db, phone: "21988880000", now: new Date("2026-11-02T10:00:00-03:00") });

  // REGRA 6: Desconto de 10% para 7 diárias + Fotos padrão
  const orc7d = await calcularOrcamentoTool.execute(
    { data_checkin: "2026-11-10", data_checkout: "2026-11-17", quantidade_hospedes: 1 },
    leadCtx
  );
  assert.equal(orc7d.status, "SUCESSO_EXECUTADO");
  assert.equal(orc7d.dados.desconto_duracao_pct, 10);

  const midiaRes = await enviarMidiaUnidadeTool.execute({ categoria_fotos: "PACOTE_COMPLETO" }, leadCtx);
  assert.equal(midiaRes.status, "SUCESSO_EXECUTADO");
  assert.ok(midiaRes.dados.pacote_fotos_padrao.length >= 1);

  const inStayCtx = injectSessionContext({
    db,
    phone: "5522999991111",
    now: new Date("2026-11-02T15:00:00-03:00"),
    runtime: {
      db,
      sendZapiMessage: async (_cfgOrPhone, msgOrOpts) => {
        sentMessages.push(msgOrOpts);
        return { success: true };
      },
    },
  });

  // REGRA 3: Cartão NFC
  // Caso A: Cartão trancado dentro -> dispara e-mail para soho@promenade.com.br
  const nfcCaseA = await resolverProblemaCartaoNfcTool.execute(
    { tipo_ocorrencia: "CARTAO_TRANCADO_DENTRO" },
    inStayCtx
  );
  assert.equal(nfcCaseA.status, "SUCESSO_EXECUTADO");
  assert.equal(sentEmails.at(-1)?.recipient, "soho@promenade.com.br");

  // Caso B: Perda do cartão -> 1ª etapa pede confirmação de R$ 15,00; 2ª etapa gera PIX pendente
  const nfcCaseBSim = await resolverProblemaCartaoNfcTool.execute(
    { tipo_ocorrencia: "PERDA_CARTAO", confirmacao_taxa_segunda_via: false },
    inStayCtx
  );
  assert.equal(nfcCaseBSim.status, "SIMULACAO_AGUARDANDO_CONFIRMACAO");
  assert.equal(nfcCaseBSim.dados.valor_taxa, 15);

  const nfcCaseBExec = await resolverProblemaCartaoNfcTool.execute(
    { tipo_ocorrencia: "PERDA_CARTAO", confirmacao_taxa_segunda_via: true },
    inStayCtx
  );
  assert.equal(nfcCaseBExec.status, "SUCESSO_EXECUTADO");
  assert.ok(db.reservations[0].pendingNfcCardReplacement?.txid);

  // Caso C: Porta não abre -> Passo 1 orienta regravação na recepção; Passo 2 aciona gestor com urgência máxima
  const nfcCaseCStep1 = await resolverProblemaCartaoNfcTool.execute(
    { tipo_ocorrencia: "PORTA_NAO_ABRE", ja_regravou_na_recepcao: false },
    inStayCtx
  );
  assert.equal(nfcCaseCStep1.status, "SUCESSO_EXECUTADO");
  assert.equal(nfcCaseCStep1.dados.etapa, "PASSO_1_ORIENTAR_REGRAVACAO_RECEPCAO");

  const nfcCaseCStep2 = await resolverProblemaCartaoNfcTool.execute(
    { tipo_ocorrencia: "PORTA_NAO_ABRE", ja_regravou_na_recepcao: true },
    inStayCtx
  );
  assert.equal(nfcCaseCStep2.status, "SUCESSO_EXECUTADO");
  assert.equal(nfcCaseCStep2.dados.etapa, "PASSO_2_ALERTA_CRITICO_GESTOR_ACIONADO");
  assert.equal(nfcCaseCStep2.dados.administrador_notificado, true);

  // REGRA 4: Autorização de Visitas Temporárias (bloqueio de lotação máxima + autorização com e-mail)
  const visitaCapacidadeBlock = await autorizarVisitaTemporariaTool.execute(
    { nome_visitante: "Lucas", cpf_visitante: "12345678901", quantidade_visitantes: 2 },
    inStayCtx
  );
  assert.equal(visitaCapacidadeBlock.status, "BLOQUEADO_PELA_REGRA");
  assert.equal(visitaCapacidadeBlock.codigo_regra_bloqueio, "LOTACAO_MAXIMA_FLAT_EXCEDIDA");

  const visitaOk = await autorizarVisitaTemporariaTool.execute(
    { nome_visitante: "Lucas Souza", cpf_visitante: "123.456.789-01", quantidade_visitantes: 1 },
    inStayCtx
  );
  assert.equal(visitaOk.status, "SUCESSO_EXECUTADO");
  assert.equal(sentEmails.at(-1)?.recipient, "soho@promenade.com.br");

  // REGRA 7: Achados e Perdidos
  const achadosFound = await consultarAchadosEPerdidosTool.execute(
    { descricao_item: "carregador" },
    inStayCtx
  );
  assert.equal(achadosFound.status, "SUCESSO_EXECUTADO");
  assert.equal(achadosFound.dados.encontrado_no_sistema, true);

  const achadosNotFound = await consultarAchadosEPerdidosTool.execute(
    { descricao_item: "relógio dourado" },
    inStayCtx
  );
  assert.equal(achadosNotFound.status, "SUCESSO_EXECUTADO");
  assert.equal(achadosNotFound.dados.encontrado_no_sistema, false);
  assert.ok(achadosNotFound.instrucao_para_ia.includes("foto"));

  // REGRA 2: Prorrogação com conflito -> cria proposta #EXT e gestor aprova Opção 1
  db.reservations.push({
    id: 800,
    code: "RES-212-0800",
    flatNumber: "212",
    guestName: "Hóspede Entrando",
    guestPhone: "5511944443333",
    checkinDate: "2026-11-03",
    checkoutDate: "2026-11-05",
    status: "confirmada",
  });
  const extConflict = await estenderEstadiaTool.execute(
    { nova_data_checkout: "2026-11-04", confirmacao_hospede: true },
    inStayCtx
  );
  assert.equal(extConflict.status, "SUCESSO_EXECUTADO");
  assert.equal(extConflict.dados.aguardando_autorizacao_gestor, true);
  assert.equal(db.pendingExtensionProposals.length, 1);

  const extMgrReply = await handleManagerExtensionReply({
    db,
    cleanTarget: "5522998505276",
    messageText: "1",
    sendZapiMessage: async () => ({ success: true }),
  });
  assert.equal(extMgrReply.handled, true);
  assert.equal(extMgrReply.option, 1);
  assert.equal(db.reservations[1].flatNumber, "304"); // Remanejado para o Flat da Vez!

  // REGRA 5: Cancelamento < 24h com pedido de exceção ao gestor (#CANC) e gestor aprova Opção 2 (converter em crédito)
  const cancExc = await processarCancelamentoTool.execute(
    { motivo_cancelamento: "Voo cancelado", solicitar_excecao_gestor: true },
    inStayCtx
  );
  assert.equal(cancExc.status, "SUCESSO_EXECUTADO");
  assert.equal(cancExc.dados.proposta_excecao_enviada_ao_gestor, true);
  assert.equal(db.pendingCancellationProposals.length, 1);

  const cancMgrReply = await handleManagerCancellationReply({
    db,
    cleanTarget: "5522998505276",
    messageText: "2",
    sendZapiMessage: async () => ({ success: true }),
  });
  assert.equal(cancMgrReply.handled, true);
  assert.equal(cancMgrReply.option, 2);
  assert.equal(db.reservations[0].convertedToCredit, true);
});

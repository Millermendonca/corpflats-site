import test from "node:test";
import assert from "node:assert/strict";
import {
  injectSessionContext,
  buildContextoSessaoJson,
  consultarDisponibilidadeTool,
  calcularOrcamentoTool,
  gerarLinkReservaTool,
  consultarDetalhesReservaTool,
  atualizarDadosHospedeTool,
  solicitarEarlyCheckinTool,
  solicitarLateCheckoutTool,
  alterarDatasReservaTool,
  estenderEstadiaTool,
  solicitarLimpezaExtraTool,
  abrirChamadoManutencaoTool,
  gerenciarNotaFiscalNfseTool,
  notificarAdministradorTool,
  getToolsForState,
  executeBotAction,
  buildGuestContext,
} from "../artifacts/api-server/whatsapp-ai-service.mjs";

test("Pilar 1 & 2: Middleware injectSessionContext e State Router (COMERCIAL_VENDAS, PRE_CHECKIN, IN_STAY_CONCIERGE)", () => {
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
    ],
  };

  // 1. Hóspede em estadia -> IN_STAY_CONCIERGE
  const ctxInStay = injectSessionContext({ db, phone: "22998505276", now });
  assert.equal(ctxInStay.estado_atual, "IN_STAY_CONCIERGE");
  assert.equal(ctxInStay.perfil_remetente, "HOSPEDE_ATIVO");
  assert.equal(ctxInStay.reserva_ativa?.id, "RES-212-0587");
  assert.equal(ctxInStay.reserva_ativa?.nome_imovel, "Flat 212");

  const jsonPayload = JSON.parse(buildContextoSessaoJson(ctxInStay));
  assert.equal(jsonPayload.contexto_sessao.estado_atual, "IN_STAY_CONCIERGE");
  assert.equal(jsonPayload.contexto_sessao.dados_hospede.nome, "Miller Mendonça Pessanha");

  // 2. Reserva futura -> PRE_CHECKIN
  const ctxPre = injectSessionContext({ db, phone: "11988887777", now });
  assert.equal(ctxPre.estado_atual, "PRE_CHECKIN");
  assert.equal(ctxPre.reserva_ativa?.id, "RES-301-0601");

  // 3. Lead desconhecido -> COMERCIAL_VENDAS
  const ctxLead = injectSessionContext({ db, phone: "21977776666", now });
  assert.equal(ctxLead.estado_atual, "COMERCIAL_VENDAS");
  assert.equal(ctxLead.perfil_remetente, "LEAD_DESCONHECIDO");
  assert.equal(ctxLead.reserva_ativa, undefined);

  // Tools por estado
  const comercialTools = getToolsForState("COMERCIAL_VENDAS").map((t) => t.name);
  assert.deepEqual(comercialTools, [
    "consultar_disponibilidade",
    "calcular_orcamento",
    "gerar_link_reserva",
    "notificar_administrador",
  ]);

  const preCheckinTools = getToolsForState("PRE_CHECKIN").map((t) => t.name);
  assert.ok(preCheckinTools.includes("consultar_detalhes_reserva"));
  assert.ok(preCheckinTools.includes("atualizar_dados_hospede"));
  assert.ok(preCheckinTools.includes("solicitar_early_checkin"));
  assert.ok(preCheckinTools.includes("gerenciar_nota_fiscal_nfse"));

  const inStayTools = getToolsForState("IN_STAY_CONCIERGE").map((t) => t.name);
  assert.ok(inStayTools.includes("solicitar_late_checkout"));
  assert.ok(inStayTools.includes("alterar_datas_reserva"));
  assert.ok(inStayTools.includes("estender_estadia"));
  assert.ok(inStayTools.includes("solicitar_limpeza_extra"));
  assert.ok(inStayTools.includes("abrir_chamado_manutencao"));
  assert.ok(inStayTools.includes("gerenciar_nota_fiscal_nfse"));
  assert.ok(inStayTools.includes("notificar_administrador"));
});

test("Pilar 3 & 4: Tool Molde solicitar_late_checkout com travas determinísticas e Retorno Instrucional", async () => {
  const now = new Date("2026-11-02T10:00:00-03:00");
  const db = {
    reservations: [
      {
        id: 587,
        code: "RES-212-0587",
        flatNumber: "212",
        guestName: "Miller Mendonça Pessanha",
        guestPhone: "5522998505276",
        checkinDate: "2026-11-01",
        checkoutDate: "2026-11-02",
        paymentStatus: "paid",
        status: "confirmada",
      },
    ],
  };

  const context = injectSessionContext({ db, phone: "22998505276", now });

  // 1. Horário acima do limite máximo (18:00 > 17:00) -> BLOQUEADO_PELA_REGRA
  const resExcede = await solicitarLateCheckoutTool.execute(
    { horario_solicitado: "18:00", confirmacao_hospede: false },
    context
  );
  assert.equal(resExcede.status, "BLOQUEADO_PELA_REGRA");
  assert.equal(resExcede.codigo_regra_bloqueio, "HORARIO_EXCEDE_LIMITE_LATE_CHECKOUT");
  assert.ok(resExcede.instrucao_para_ia.includes("17:00"));

  // 2. Simulação sem confirmação prévia (16:00, confirmacao_hospede: false) -> SIMULACAO_AGUARDANDO_CONFIRMACAO
  const resSimulacao = await solicitarLateCheckoutTool.execute(
    { horario_solicitado: "16:00", confirmacao_hospede: false },
    context
  );
  assert.equal(resSimulacao.status, "SIMULACAO_AGUARDANDO_CONFIRMACAO");
  assert.equal(resSimulacao.dados?.valor_taxa, 120);
  assert.ok(resSimulacao.instrucao_para_ia.includes("120.00"));

  // 3. Efetivação após confirmação do hóspede (16:00, confirmacao_hospede: true) -> SUCESSO_EXECUTADO
  const resSucesso = await solicitarLateCheckoutTool.execute(
    { horario_solicitado: "16:00", confirmacao_hospede: true },
    context
  );
  assert.equal(resSucesso.status, "SUCESSO_EXECUTADO");
  assert.equal(db.reservations[0].lateCheckoutTime, "16:00");
  assert.ok(resSucesso.instrucao_para_ia.includes("16:00"));

  // 4. Conflito de agenda: outro hóspede entrando no mesmo flat no mesmo dia -> BLOQUEADO_PELA_REGRA
  db.reservations.push({
    id: 999,
    code: "RES-212-0999",
    flatNumber: "212",
    guestName: "Próximo Hóspede",
    guestPhone: "5511911112222",
    checkinDate: "2026-11-02",
    checkoutDate: "2026-11-04",
    status: "confirmada",
  });
  const resConflito = await solicitarLateCheckoutTool.execute(
    { horario_solicitado: "15:00", confirmacao_hospede: true },
    context
  );
  assert.equal(resConflito.status, "BLOQUEADO_PELA_REGRA");
  assert.equal(resConflito.codigo_regra_bloqueio, "CONFLITO_LIMPEZA_PROXIMO_HOSPEDE");
  assert.ok(resConflito.instrucao_para_ia.includes("outro hóspede"));
});

test("Catálogo Completo: Comercial, Pré-Check-in, Manutenção, Limpeza e Nota Fiscal (NFS-e)", async () => {
  const sentMessages = [];
  const db = {
    settings: { adminWhatsapp: "5522998505276" },
    flats: [{ number: "212", isActive: true }, { number: "304", isActive: true }],
    reservations: [
      {
        id: 587,
        code: "RES-212-0587",
        flatNumber: "212",
        guestName: "Miller Mendonça Pessanha",
        guestCpf: "12585736792",
        guestEmail: "millerpessanha@gmail.com",
        guestAddress: "Rua Sebastião Rangel, 26 - Parque Turf Club, Campos dos Goytacazes - RJ",
        guestPhone: "5522999991111",
        checkinDate: "2026-11-02",
        checkoutDate: "2026-11-03",
        totalAmount: 2.0,
        paymentStatus: "paid",
        status: "confirmada",
      },
    ],
  };

  // 1. Comercial: consultar_disponibilidade + calcular_orcamento + gerar_link_reserva
  const leadCtx = injectSessionContext({ db, phone: "21988880000", now: new Date("2026-11-02T14:00:00-03:00") });
  const disp = await consultarDisponibilidadeTool.execute(
    { data_checkin: "2026-11-10", data_checkout: "2026-11-12", quantidade_hospedes: 2 },
    leadCtx
  );
  assert.equal(disp.status, "SUCESSO_EXECUTADO");
  assert.equal(disp.dados.unidades_disponiveis, 2);

  const orc = await calcularOrcamentoTool.execute(
    { data_checkin: "2026-11-10", data_checkout: "2026-11-12", quantidade_hospedes: 2 },
    leadCtx
  );
  assert.equal(orc.status, "SUCESSO_EXECUTADO");
  assert.equal(orc.dados.opcao_com_cafe.valor_total, 614);

  const linkSim = await gerarLinkReservaTool.execute(
    { data_checkin: "2026-11-10", data_checkout: "2026-11-12", nome_hospede: "João Silva", confirmacao_hospede: false },
    leadCtx
  );
  assert.equal(linkSim.status, "SIMULACAO_AGUARDANDO_CONFIRMACAO");

  const linkExec = await gerarLinkReservaTool.execute(
    { data_checkin: "2026-11-10", data_checkout: "2026-11-12", nome_hospede: "João Silva", confirmacao_hospede: true },
    leadCtx
  );
  assert.equal(linkExec.status, "SUCESSO_EXECUTADO");
  assert.ok(linkExec.dados.codigo_pre_reserva.startsWith("CF-"));

  // 2. In-Stay: gerenciar_nota_fiscal_nfse (conferência + adição de acompanhante na descrição + confirmação)
  const conv = { phone: "5522999991111", aiPaused: false };
  const inStayCtx = injectSessionContext({
    db,
    phone: "5522999991111",
    now: new Date("2026-11-02T15:00:00-03:00"),
    runtime: {
      db,
      conversation: conv,
      sendZapiMessage: async (phone, text) => sentMessages.push({ phone, text }),
    },
  });

  const nfseUpdate = await gerenciarNotaFiscalNfseTool.execute(
    {
      acao: "ATUALIZAR_DADOS_NOTA",
      hospedes_na_descricao: ["Miller Mendonça Pessanha", "Thamiris Maiara Santos Da Silva"],
    },
    inStayCtx
  );
  assert.equal(nfseUpdate.status, "SIMULACAO_AGUARDANDO_CONFIRMACAO");
  assert.ok(
    nfseUpdate.dados.descricaoServico.includes(
      "Nota relativa à hospedagem de Miller Mendonça Pessanha e Thamiris Maiara Santos Da Silva, no Flat 212."
    )
  );

  // Trava de valor da nota fiscal -> BLOQUEADO_PELA_REGRA + alerta ao administrador
  const nfseValorBlock = await gerenciarNotaFiscalNfseTool.execute(
    {
      acao: "ATUALIZAR_DADOS_NOTA",
      novo_valor_solicitado: 500,
    },
    inStayCtx
  );
  assert.equal(nfseValorBlock.status, "BLOQUEADO_PELA_REGRA");
  assert.equal(nfseValorBlock.codigo_regra_bloqueio, "ALTERACAO_VALOR_REQUER_APROVACAO_GESTOR");

  // Confirmação final da nota fiscal
  const nfseConfirm = await gerenciarNotaFiscalNfseTool.execute(
    { acao: "CONFIRMAR_DADOS_NOTA" },
    inStayCtx
  );
  assert.equal(nfseConfirm.status, "SUCESSO_EXECUTADO");
  assert.equal(db.reservations[0].autoEmitInvoice, true);

  // 3. Manutenção crítica -> abre OS + aciona notifyAdminWhatsApp
  const osRes = await abrirChamadoManutencaoTool.execute(
    {
      categoria_item: "AR_CONDICIONADO",
      descricao_problema: "Ar-condicionado parou de gelar",
      urgencia: "CRITICA",
    },
    inStayCtx
  );
  assert.equal(osRes.status, "SUCESSO_EXECUTADO");
  assert.equal(osRes.dados.administrador_notificado, true);
  assert.equal(db.serviceOrders.length, 1);

  // 4. Limpeza extra -> simulação de taxa (LIMPEZA_COMPLETA) e cortesia (TROCA_TOALHAS_ENXOVAL)
  const limpSim = await solicitarLimpezaExtraTool.execute(
    { tipo_solicitacao: "LIMPEZA_COMPLETA", confirmacao_hospede: false },
    inStayCtx
  );
  assert.equal(limpSim.status, "SIMULACAO_AGUARDANDO_CONFIRMACAO");

  const limpToalhas = await solicitarLimpezaExtraTool.execute(
    { tipo_solicitacao: "TROCA_TOALHAS_ENXOVAL", confirmacao_hospede: true },
    inStayCtx
  );
  assert.equal(limpToalhas.status, "SUCESSO_EXECUTADO");
});

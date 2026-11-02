import test from "node:test";
import assert from "node:assert/strict";
import {
  injectSessionContext,
  buildContextoSessaoJson,
  solicitarLateCheckoutTool,
  alterarDatasReservaTool,
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
  assert.deepEqual(comercialTools, ["notificar_administrador"]);

  const inStayTools = getToolsForState("IN_STAY_CONCIERGE").map((t) => t.name);
  assert.ok(inStayTools.includes("solicitar_late_checkout"));
  assert.ok(inStayTools.includes("alterar_datas_reserva"));
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

test("Pilar 5 & Integração executeBotAction: notificar_administrador e alterar_datas_reserva", async () => {
  const sentMessages = [];
  const db = {
    settings: { adminWhatsapp: "5522998505276" },
    reservations: [
      {
        id: 587,
        code: "RES-212-0587",
        flatNumber: "212",
        guestName: "Miller Mendonça Pessanha",
        guestPhone: "5522999991111",
        checkinDate: "2026-11-02",
        checkoutDate: "2026-11-03",
        paymentStatus: "paid",
        status: "confirmada",
      },
    ],
  };

  const conv = { phone: "5522999991111", aiPaused: false };

  const resNotify = await executeBotAction(db, "notificar_administrador", {
    requesterPhone: "5522999991111",
    nivel_urgencia: "CRITICA",
    categoria: "MANUTENCAO",
    resumo_ocorrencia: "Ar-condicionado do Flat 212 parou de gelar.",
    conversation: conv,
    sendZapiMessage: async (phone, text) => {
      sentMessages.push({ phone, text });
    },
  });

  assert.equal(resNotify.status, "ADMINISTRADOR_NOTIFICADO");
  assert.ok(resNotify.instrucao_para_ia.includes("WhatsApp da gerência"));
  assert.equal(conv.aiPaused, true);
  assert.equal(sentMessages.length, 1);
  assert.ok(sentMessages[0].text.includes("MANUTENCAO"));

  const guestCtx = buildGuestContext({ db, phone: "5522999991111", now: new Date("2026-11-02T15:00:00-03:00") });
  assert.equal(guestCtx.estadoAtual, "IN_STAY_CONCIERGE");
  assert.equal(guestCtx.contextoSessao.reserva_ativa.id, "RES-212-0587");

  const resAlterarSim = await alterarDatasReservaTool.execute(
    {
      nova_data_checkin: "2026-11-02",
      nova_data_checkout: "2026-11-04",
      efetivar_alteracao: false,
    },
    guestCtx.contextoSessao
  );
  assert.equal(resAlterarSim.status, "SIMULACAO_AGUARDANDO_CONFIRMACAO");
  assert.ok(resAlterarSim.instrucao_para_ia.includes("2026-11-04"));
});

/**
 * Teste Automatizado Pontual — Matriz de Destinatários e Sigilo Financeiro
 * (Solicitante não-hóspede vs. 1º/2º/3º Hóspedes Cadastrados)
 */
import assert from "node:assert/strict";
import {
  getReservationRecipients,
  buildTemplateTargets,
  resolveWhatsAppTags,
  renderTemplateButtons,
  DEFAULT_WHATSAPP_TEMPLATES,
  isPureBillingTemplateOrEvent,
  isRequesterAndGuestTemplateOrEvent,
  isGuestOnlyStayOrPostTemplateOrEvent
} from "../scripts/zapi-service.mjs";

let passed = 0;
let failed = 0;

function check(label, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ FALHA: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n================================================================================");
console.log("🧪 TESTE PONTUAL: Roteamento Solicitante vs. Hóspedes & Sigilo Financeiro");
console.log("================================================================================\n");

const mockDb = {
  settings: {
    checkinTime: "14:00",
    checkoutTime: "12:00",
    hotelAddress: "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ"
  },
  zapiConfig: {
    enabled: false,
    testModeOnly: true
  },
  companies: [],
  guests: []
};

// Reserva corporativa / solicitante diferente do hóspede, com 2 hóspedes cadastrados
const corporateRes = {
  id: 9901,
  code: "RES-509-9901",
  flatId: 10,
  flatNumber: "509",
  status: "confirmada",
  paymentStatus: "pago_total",
  paymentMethod: "pix",
  totalAmount: 960,
  paidAmount: 960,
  checkinDate: "2026-11-10",
  checkoutDate: "2026-11-13",
  guestCount: 2,
  includeBreakfast: true,
  guestName: "Carlos Eduardo Hóspede",
  guestPhone: "22999111111",
  guestEmail: "carlos.hospede@teste.com",
  requesterType: "other_person",
  requesterInfo: {
    name: "Paula Secretária Solicitante",
    phone: "22999222222",
    email: "paula.solicitante@empresa.com",
    companyName: "Empresa Alpha Ltda"
  },
  guests: [
    {
      index: 1,
      name: "Carlos Eduardo Hóspede",
      phone: "22999111111",
      email: "carlos.hospede@teste.com",
      hasCompletedCheckin: false
    },
    {
      index: 2,
      name: "Mariana Acompanhante",
      phone: "22999333333",
      email: "mariana.acomp@teste.com",
      hasCompletedCheckin: false
    }
  ],
  _changesContext: [
    { field: "flatNumber", label: "Flat / Quarto", oldValue: "116", newValue: "509" },
    { field: "checkoutDate", label: "Data de Check-out", oldValue: "12/11/2026", newValue: "13/11/2026" },
    { field: "totalAmount", label: "Valor Total", oldValue: "R$ 640,00", newValue: "R$ 960,00" }
  ]
};

const recips = getReservationRecipients(corporateRes, mockDb);

check("1. Identifica solicitante distinto do hóspede (isDifferentFromGuest === true)", recips.requester.isDifferentFromGuest === true);
check("2. Identifica contato próprio do solicitante (hasOwnContact === true)", recips.requester.hasOwnContact === true);
check("3. Identifica acompanhante (2º hóspede) na lista de companions", recips.companions.length === 1 && recips.companions[0].type === "guest_2");

const getTpl = (idOrEvent) =>
  DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === idOrEvent || t.triggerEvent === idOrEvent) || {
    id: idOrEvent,
    triggerEvent: idOrEvent,
    recipientTarget: "guest",
    sendEmail: true
  };

// ── A. Eventos de Orçamento / Cobrança Pura -> SOMENTE Solicitante ──
for (const ev of ["pre_reservation_created", "payment_pending", "additional_daily_pending"]) {
  const tpl = getTpl(ev);
  const targets = buildTemplateTargets(tpl, recips, { targetMode: tpl.recipientTarget || "guest" });
  const types = targets.map(t => t.type);
  check(
    `4.${ev}: enviado EXCLUSIVAMENTE ao solicitante quando há solicitante distinto`,
    types.length === 1 && types[0] === "requester",
    `Obtido: ${JSON.stringify(types)}`
  );
}

// ── B. Eventos de Confirmação, Instruções, Pré-Check-in, Quarto Liberado, Modificação e Cancelamento -> Solicitante + Hóspedes (1 e 2) ──
const sharedEvents = [
  "reservation_created",
  "payment_confirmed",
  "sameday_reservation",
  "checkin_day_instructions",
  "pre_checkin_reminder",
  "pre_checkin_completed",
  "room_ready",
  "room_ready_ota",
  "room_ready_regular",
  "checkin_cleaning_delay",
  "reservation_updated",
  "reservation_cancelled"
];

for (const ev of sharedEvents) {
  const tpl = getTpl(ev);
  const targets = buildTemplateTargets(tpl, recips, { targetMode: tpl.recipientTarget || "guest" });
  const types = targets.map(t => t.type);
  const hasRequester = types.includes("requester");
  const hasGuest1 = types.includes("guest");
  const hasGuest2 = types.includes("guest_2");
  check(
    `5.${ev}: enviado para Solicitante + 1º Hóspede + 2º Hóspede`,
    hasRequester && hasGuest1 && hasGuest2,
    `Obtido: ${JSON.stringify(types)}`
  );
}

// ── C. Eventos de Estadia Interna, Café, Check-out, Avaliação e Achados -> SOMENTE Hóspedes (NUNCA Solicitante) ──
const stayAndPostEvents = [
  "checkin_completed",
  "breakfast_reminder",
  "checkout_reminder",
  "checkout_completed",
  "post_checkout_review",
  "nps_approved",
  "nps_score_4",
  "nps_score_3",
  "nps_score_2",
  "nps_score_1",
  "nps_feedback_thanks",
  "lost_item_registered"
];

for (const ev of stayAndPostEvents) {
  const tpl = getTpl(ev);
  const targets = buildTemplateTargets(tpl, recips, { targetMode: tpl.recipientTarget || "guest" });
  const types = targets.map(t => t.type);
  const hasRequester = types.includes("requester");
  const hasGuest1 = types.includes("guest");
  const hasGuest2 = types.includes("guest_2");
  check(
    `6.${ev}: enviado APENAS aos Hóspedes e NUNCA ao Solicitante não-hóspede`,
    !hasRequester && hasGuest1 && hasGuest2,
    `Obtido: ${JSON.stringify(types)}`
  );
}

// ── D. Sigilo Financeiro nas Mensagens (Solicitante vê valores; Hóspede 1 e 2 NÃO veem valores) ──
const tplConfirm = getTpl("tpl_new_reservation_direct");
const msgRequesterConfirm = resolveWhatsAppTags(tplConfirm.message, corporateRes, mockDb, "https://corpflats.com.br", "requester", tplConfirm);
const msgGuest1Confirm = resolveWhatsAppTags(tplConfirm.message, corporateRes, mockDb, "https://corpflats.com.br", "guest", tplConfirm);
const msgGuest2Confirm = resolveWhatsAppTags(tplConfirm.message, corporateRes, mockDb, "https://corpflats.com.br", "guest_2", tplConfirm);

check("7. Confirmação para Solicitante exibe valores (R$ 960,00)", msgRequesterConfirm.includes("960,00"));
check("8. Confirmação para 1º Hóspede oculta todos os valores financeiros", !msgGuest1Confirm.includes("960,00") && !msgGuest1Confirm.includes("Situação Financeira"));
check("9. Confirmação para 2º Hóspede oculta todos os valores financeiros", !msgGuest2Confirm.includes("960,00") && !msgGuest2Confirm.includes("Situação Financeira"));

// ── E. Sigilo Financeiro em Modificação de Reserva (reservation_updated) ──
const tplUpdated = getTpl("tpl_reservation_updated");
const msgRequesterUpdated = resolveWhatsAppTags(tplUpdated.message, corporateRes, mockDb, "https://corpflats.com.br", "requester", tplUpdated);
const msgGuest1Updated = resolveWhatsAppTags(tplUpdated.message, corporateRes, mockDb, "https://corpflats.com.br", "guest", tplUpdated);

check(
  "10. Modificação para Solicitante inclui troca de flat (116 -> 509), data e valor (R$ 640,00 -> R$ 960,00)",
  msgRequesterUpdated.includes("509") && msgRequesterUpdated.includes("960,00")
);
check(
  "11. Modificação para Hóspede inclui troca de flat (116 -> 509) e data, mas OCULTA valor (R$ 640,00 -> R$ 960,00)",
  msgGuest1Updated.includes("509") && msgGuest1Updated.includes("13/11/2026") && !msgGuest1Updated.includes("960,00") && !msgGuest1Updated.includes("Valor Total")
);

// ── F. Links do Portal Diferenciados (?requester=1 para Solicitante vs. padrão para Hóspede) ──
const btnsRequester = renderTemplateButtons(tplConfirm.buttons, corporateRes, mockDb, "https://corpflats.com.br", "requester", tplConfirm);
const btnsGuest1 = renderTemplateButtons(tplConfirm.buttons, corporateRes, mockDb, "https://corpflats.com.br", "guest", tplConfirm);
const btnsGuest2 = renderTemplateButtons(tplConfirm.buttons, corporateRes, mockDb, "https://corpflats.com.br", "guest_2", tplConfirm);

const portalBtnReq = btnsRequester.find(b => b.id === "btn_portal");
const portalBtnG1 = btnsGuest1.find(b => b.id === "btn_portal");
const portalBtnG2 = btnsGuest2.find(b => b.id === "btn_portal");

check(
  "12. Botão do Portal para Solicitante leva ?requester=1",
  Boolean(portalBtnReq?.url?.includes("/minha-reserva/RES-509-9901?requester=1")),
  `URL obtida: ${portalBtnReq?.url}`
);
check(
  "13. Botão do Portal para 1º Hóspede NÃO leva ?requester=1",
  portalBtnG1?.url === "https://corpflats.com.br/minha-reserva/RES-509-9901",
  `URL obtida: ${portalBtnG1?.url}`
);
check(
  "14. Botão do Portal para 2º Hóspede leva ?guest=2",
  portalBtnG2?.url === "https://corpflats.com.br/minha-reserva/RES-509-9901?guest=2",
  `URL obtida: ${portalBtnG2?.url}`
);

console.log("\n--------------------------------------------------------------------------------");
console.log(`📊 RESULTADO FINAL: ${passed} asserções aprovadas, ${failed} falhas.`);
console.log("--------------------------------------------------------------------------------\n");

if (failed > 0) {
  process.exit(1);
}

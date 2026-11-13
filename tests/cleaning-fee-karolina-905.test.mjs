import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  extractActivePreReservationData,
  evaluateAndNotifyActivePreReservation,
  createStandardPmsPreReservation,
  handleManagerPreReservationReply,
  parseManagerPreReservationCommand
} from "../artifacts/api-server/whatsapp-ai-service.mjs";
import { resolveWhatsAppTags } from "../artifacts/api-server/zapi-service.mjs";

console.log("🧪 Iniciando teste pontual: Taxa de Limpeza (Caso Karolina Flat 905 - 1 para 3 diárias)...");

const serverPath = path.resolve("artifacts/api-server/demo-server.mjs");
const mirrorServerPath = path.resolve("scripts/demo-server.mjs");
const aiPath = path.resolve("artifacts/api-server/whatsapp-ai-service.mjs");
const mirrorAiPath = path.resolve("scripts/whatsapp-ai-service.mjs");
const zapiPath = path.resolve("artifacts/api-server/zapi-service.mjs");
const mirrorZapiPath = path.resolve("scripts/zapi-service.mjs");
const pmsPath = path.resolve("artifacts/limpeza/src/pages/pms-calendar.tsx");
const portalPath = path.resolve("artifacts/limpeza/src/pages/guest-portal.tsx");
const funnelPath = path.resolve("artifacts/limpeza/src/components/booking-funnel-modal.tsx");
const enginePath = path.resolve("artifacts/limpeza/src/pages/booking-engine.tsx");

const serverSrc = fs.readFileSync(serverPath, "utf8");
const pmsSrc = fs.readFileSync(pmsPath, "utf8");
const portalSrc = fs.readFileSync(portalPath, "utf8");
const funnelSrc = fs.readFileSync(funnelPath, "utf8");
const engineSrc = fs.readFileSync(enginePath, "utf8");

// ----------------------------------------------------------------------------
// 1. Paridade byte-a-byte entre arquivos espelhados
// ----------------------------------------------------------------------------
{
  assert.equal(
    fs.readFileSync(serverPath).equals(fs.readFileSync(mirrorServerPath)),
    true,
    "scripts/demo-server.mjs deve ser idêntico a artifacts/api-server/demo-server.mjs"
  );
  assert.equal(
    fs.readFileSync(aiPath).equals(fs.readFileSync(mirrorAiPath)),
    true,
    "scripts/whatsapp-ai-service.mjs deve ser idêntico a artifacts/api-server/whatsapp-ai-service.mjs"
  );
  assert.equal(
    fs.readFileSync(zapiPath).equals(fs.readFileSync(mirrorZapiPath)),
    true,
    "scripts/zapi-service.mjs deve ser idêntico a artifacts/api-server/zapi-service.mjs"
  );
  console.log("✅ 1. Paridade byte-a-byte entre artifacts/api-server/ e scripts/ validada.");
}

// ----------------------------------------------------------------------------
// 2. Sofia / WhatsApp: Cotação de 1 diária + limpeza R$ 70 mudando para 3 diárias
// ----------------------------------------------------------------------------
{
  const db = {
    zapiConfig: { enabled: false },
    settings: {
      emailSettings: { enabled: false },
      interConfig: { pixKey: "47964813000165" }
    },
    siteConfig: {
      pricing: { directDiscountPercent: 15, pixDiscountPercent: 5 },
      ratePlans: {
        with_breakfast: { dailyRate: 225, cleaningFeeEnabled: false, cleaningFeeAmount: 0 },
        room_only: { dailyRate: 190, cleaningFeeEnabled: true, cleaningFeeAmount: 70 }
      }
    },
    whatsappAiSettings: {
      enabled: true,
      mode: "autonomous",
      developerPhone: "22998505276"
    },
    flats: [
      { id: 9, number: "905", isActive: true, status: "disponivel" }
    ],
    reservations: [],
    guests: [],
    whatsappConversations: [],
    pendingPreReservationProposals: []
  };

  const guestPhone = "5522999887766";
  const conv = {
    phone: guestPhone,
    contactName: "Karolina",
    messages: [
      { fromMe: false, text: "Oi, gostaria de ver 1 diária sem café da manhã de 20/11/2026 a 21/11/2026" },
      { fromMe: true, senderRole: "human_operator", text: "Olá Karolina! Para 1 diária sem café da manhã fica R$ 220,00 a diária + R$ 70,00 de taxa de limpeza (total R$ 290,00)." },
      { fromMe: false, text: "Perfeito! Na verdade vou precisar mudar para 3 diárias, de 20/11/2026 a 23/11/2026. Pode fechar a reserva!" },
      { fromMe: false, text: "Meu nome completo é Karolina Oliveira Santos, CPF 123.456.789-01, email karolina@email.com" }
    ]
  };
  db.whatsappConversations.push(conv);

  const extracted = extractActivePreReservationData(conv, db, guestPhone);
  assert.equal(extracted.isComplete, true, "Dados obrigatórios devem estar completos");
  assert.equal(extracted.nights, 3, "Deve detectar a alteração para 3 diárias");
  assert.equal(extracted.includeBreakfast, false, "Plano deve ser sem café da manhã");
  assert.equal(extracted.dailyRate, 220, "Valor da diária líquida deve permanecer R$ 220,00 (sem ser contaminado por R$ 70)");
  assert.equal(extracted.cleaningFee, 70, "Taxa de limpeza de R$ 70,00 deve ser extraída e preservada");
  assert.equal(extracted.totalAmount, 730, "Total para 3 diárias deve ser 3 * 220 + 70 = R$ 730,00 (e não R$ 660,00)");

  const sentMessages = [];
  const evalRes = await evaluateAndNotifyActivePreReservation({
    phone: guestPhone,
    conv,
    db,
    incomingInfo: { isFromMe: false },
    sendZapiMessage: async (_cfg, payload) => {
      sentMessages.push(payload);
      return { success: true };
    }
  });

  assert.equal(evalRes.triggered, true, "Deve disparar proposta de pré-reserva para o gestor");
  assert.equal(evalRes.proposal.totalAmount, 730);
  assert.equal(evalRes.proposal.dailyRate, 220);
  assert.equal(evalRes.proposal.cleaningFee, 70);
  assert.match(sentMessages[0].message, /R\$ 730,00/);
  assert.match(sentMessages[0].message, /Limpeza: R\$ 70,00/);

  // Criação da pré-reserva no PMS via createStandardPmsPreReservation
  const created = await createStandardPmsPreReservation(db, evalRes.proposal, {
    triggerImmediateFn: async () => {}
  });
  assert.equal(created.success, true, "Deve criar a pré-reserva no PMS");
  const res = created.reservation;
  assert.equal(res.flatNumber, "905");
  assert.equal(res.totalAmount, 730, "totalAmount na reserva criada deve ser R$ 730,00");
  assert.equal(res.dailyRate, 220, "dailyRate na reserva criada deve ser R$ 220,00");
  assert.equal(res.cleaningFee, 70, "cleaningFee na reserva criada deve ser R$ 70,00");
  assert.equal(Array.isArray(res.charges), true);
  assert.equal(res.charges.length, 1);
  assert.equal(res.charges[0].type, "cleaning");
  assert.equal(res.charges[0].amount, 70);
  assert.equal(Array.isArray(res.dailyRates), true);
  assert.equal(res.dailyRates.length, 3);
  const sumDailyRates = res.dailyRates.reduce((acc, d) => acc + Number(d.rate), 0);
  assert.equal(sumDailyRates, 660, "Soma das 3 diárias líquidas em dailyRates deve ser R$ 660,00");
  assert.equal(sumDailyRates + res.cleaningFee, res.totalAmount, "Soma de dailyRates (660) + cleaningFee (70) deve fechar exatamente totalAmount (730)");
  assert.equal(res.cardTotalAmount, 766.5, "Cartão (+5%) deve ser calculado sobre R$ 730,00 = R$ 766,50");
  assert.ok(String(res.pixCopiaECola || "").includes("730.00"), "PIX Copia e Cola deve conter o valor composto 730.00");

  console.log("✅ 2. Extração e criação de pré-reserva (1 diária -> 3 diárias com taxa de limpeza R$ 70) validadas.");
}

// ----------------------------------------------------------------------------
// 3. Comando do Gestor alterando proposta de 1 diária (R$ 290) para 3 diárias (R$ 730)
// ----------------------------------------------------------------------------
{
  const db = {
    zapiConfig: { enabled: false },
    settings: { emailSettings: { enabled: false } },
    flats: [{ id: 9, number: "905", isActive: true, status: "disponivel" }],
    reservations: [],
    guests: [],
    pendingPreReservationProposals: [
      {
        id: "PRERES-K905",
        status: "pending_manager",
        guestPhone: "5522999887766",
        guestName: "Karolina Oliveira Santos",
        guestCpf: "12345678901",
        guestEmail: "karolina@email.com",
        checkIn: "2026-11-20",
        checkOut: "2026-11-21",
        nights: 1,
        guests: 1,
        totalAmount: 290,
        dailyRate: 220,
        cleaningFee: 70,
        includeBreakfast: false,
        ratePlan: "room_only",
        flatId: 9,
        flatNumber: "905"
      }
    ]
  };

  const parsed = parseManagerPreReservationCommand(
    "muda para 20/11/2026 a 23/11/2026 e pode criar",
    db.pendingPreReservationProposals[0],
    db
  );
  assert.equal(parsed.matched, true);
  assert.equal(parsed.action, "confirm_and_create");
  assert.equal(parsed.updates.nights, 3);
  assert.equal(parsed.updates.totalAmount, 730, "Parser do gestor deve recalcular 3 * 220 + 70 = 730");

  const replyRes = await handleManagerPreReservationReply({
    messageText: "muda para 20/11/2026 a 23/11/2026 e pode criar",
    cleanTarget: "5522998505276",
    db,
    sendZapiMessage: async () => ({ success: true }),
    triggerImmediateFn: async () => {}
  });
  assert.equal(replyRes.action, "confirmed_and_created");
  assert.equal(replyRes.reservation.totalAmount, 730);
  assert.equal(replyRes.reservation.cleaningFee, 70);
  assert.equal(replyRes.reservation.charges[0].amount, 70);
  assert.match(replyRes.replyText, /R\$ 730,00 \(Diária: R\$ 220,00 \+ Limpeza: R\$ 70,00\)/);

  console.log("✅ 3. Alteração de 1 para 3 diárias via comando do gestor preservando taxa de limpeza validada.");
}

// ----------------------------------------------------------------------------
// 4. Verificação estrutural e funcional do Backend (demo-server.mjs) e Frontend (pms-calendar.tsx)
// ----------------------------------------------------------------------------
{
  // 4.1 reconcileUniversalIntegrity sincroniza cleaningFee <-> charges e corrige Karolina Flat 905
  assert.equal(serverSrc.includes("const isKarolina905 ="), true);
  assert.equal(
    serverSrc.includes("if (!r.earlyCheckout && recChargesSum > 0 && recRatesSum > 0 && Math.abs(curTot - recRatesSum) < 0.05)"),
    true
  );

  // Executa o bloco de autocura da reserva da Karolina no Flat 905 (3 diárias de R$ 220 = R$ 660 sem taxa de limpeza)
  const sliceStart = serverSrc.indexOf("    // Sincronização de Taxa de Limpeza (cleaningFee <-> charges)");
  const sliceEnd = serverSrc.indexOf("    // Sincronização do valor de Cartão (+5%)");
  assert.ok(sliceStart > 0 && sliceEnd > sliceStart, "Bloco de autocura deve existir em reconcileUniversalIntegrity");
  const healSnippet = serverSrc.slice(sliceStart, sliceEnd);
  const runHeal = new Function("r", "db", "statusNorm", "isOtaChannel", `
    let changed = false;
    ${healSnippet}
    return { r, changed };
  `);

  const karolinaRes = {
    id: 9051,
    code: "RES-905-0001",
    flatNumber: "905",
    guestName: "Karolina",
    status: "pre_reserva",
    channel: "whatsapp",
    includeBreakfast: false,
    checkinDate: "2026-11-20",
    checkoutDate: "2026-11-23",
    dailyRate: 220,
    dailyRates: [
      { date: "2026-11-20", rate: 220 },
      { date: "2026-11-21", rate: 220 },
      { date: "2026-11-22", rate: 220 }
    ],
    totalAmount: 660,
    cleaningFee: 0,
    charges: []
  };
  const healResult = runHeal(
    karolinaRes,
    { siteConfig: { ratePlans: { room_only: { cleaningFeeAmount: 70 } } } },
    "pre_reserva",
    false
  );
  assert.equal(healResult.changed, true, "Deve detectar e curar a reserva da Karolina no Flat 905");
  assert.equal(karolinaRes.cleaningFee, 70, "Taxa de limpeza da Karolina no Flat 905 deve ser curada para R$ 70,00");
  assert.equal(karolinaRes.charges.length, 1);
  assert.equal(karolinaRes.charges[0].type, "cleaning");
  assert.equal(karolinaRes.charges[0].amount, 70);
  assert.equal(karolinaRes.totalAmount, 730, "Total da Karolina no Flat 905 deve passar de R$ 660,00 (3 diárias) para R$ 730,00 (3 diárias + R$ 70 limpeza)");

  // 4.2 PUT /api/pms/reservations/:id preserva cleaningFee / charges ao mudar de 1 para 3 diárias
  assert.equal(serverSrc.includes("const oldChargesBeforeEdit = Array.isArray(r.charges)"), true);
  assert.equal(serverSrc.includes("const oldCleaningFeeBeforeEdit = Number(r.cleaningFee) || 0;"), true);
  assert.equal(serverSrc.includes("const extraChargesSum = Array.isArray(r.charges)"), true);
  assert.equal(
    serverSrc.includes("r.totalAmount = Math.round((ratesSum + extraChargesSum) * 100) / 100;"),
    true
  );
  assert.equal(
    serverSrc.includes("r.totalAmount = Math.round((newRateVal * newNightsCount + extraChargesSum) * 100) / 100;"),
    true
  );

  // 4.3 POST /api/reservations/direct-booking popula charges e dailyRates líquidos
  assert.equal(serverSrc.includes("id: `charge_clean_${newResId}`"), true);
  assert.equal(serverSrc.includes("amount: resolvedCleaningFee"), true);

  // 4.4 PMS Calendar (pms-calendar.tsx) preserva charges/cleaningFee no modal, drag-and-drop e buildEffectiveRes
  assert.equal(
    pmsSrc.includes("Math.round((updatedDailyRates.reduce((acc: number, d: any) => acc + (Number(d.rate) || 0), 0) + existingChargesSum) * 100) / 100"),
    true
  );
  assert.equal(
    pmsSrc.includes("const finalChargesSum = loadedCharges.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);"),
    true
  );
  assert.equal(pmsSrc.includes("cleaningFee: formCharges"), true);

  // 4.5 Booking Funnel & Booking Engine fazem deep-merge seguro de room_only com cleaningFeeAmount: 70
  assert.equal(funnelSrc.includes("cleaningFeeEnabled: rawRoomOnly.cleaningFeeEnabled !== false"), true);
  assert.equal(funnelSrc.includes("cleaningFeeAmount: Number(rawRoomOnly.cleaningFeeAmount ?? 70)"), true);
  assert.equal(engineSrc.includes("cleaningFeeEnabled: rawRoomOnly.cleaningFeeEnabled !== false"), true);
  assert.equal(engineSrc.includes("cleaningFeeAmount: Number(rawRoomOnly.cleaningFeeAmount ?? 70)"), true);

  console.log("✅ 4. Autocura da Karolina (Flat 905) e regras de integridade no demo-server.mjs e frontend validadas.");
}

// ----------------------------------------------------------------------------
// 5. Casos de borda: Cotação implícita sem "1 diária", plano com café (limpeza = 0) e execução do PUT de edição 1 -> 3 diárias
// ----------------------------------------------------------------------------
{
  // 5.1 Cotação sem mencionar "1 diária" no texto, apenas "diária R$ 220 (total R$ 290)" e depois mudando para 3 diárias
  const implicitConv = {
    phone: "5522999887766",
    messages: [
      { fromMe: false, text: "Oi, tem vaga de 20/11/2026 a 21/11/2026?" },
      { fromMe: true, senderRole: "human_operator", text: "Temos sim! Sem café da manhã fica R$ 220,00 a diária (total R$ 290,00)." },
      { fromMe: false, text: "Vou mudar para 3 diárias, de 20/11/2026 a 23/11/2026. Pode reservar: Karolina Oliveira Santos, CPF 123.456.789-01, karolina@email.com" }
    ]
  };
  const extImplicit = extractActivePreReservationData(implicitConv, null, "5522999887766");
  assert.equal(extImplicit.nights, 3);
  assert.equal(extImplicit.dailyRate, 220);
  assert.equal(extImplicit.cleaningFee, 70, "Deve inferir R$ 70 de limpeza de (290 - 220 * 1)");
  assert.equal(extImplicit.totalAmount, 730, "Deve recalcular 3 * 220 + 70 = 730 mesmo sem a frase '1 diária' no orçamento");

  // 5.2 Plano COM café da manhã não deve adicionar taxa de limpeza
  const withBfConv = {
    phone: "5522999887766",
    messages: [
      { fromMe: false, text: "Oi, quero 1 diária com café de 20/11/2026 a 21/11/2026" },
      { fromMe: true, senderRole: "human_operator", text: "Para 1 diária com café da manhã fica R$ 275,00 (total R$ 275,00)." },
      { fromMe: false, text: "Vou mudar para 3 diárias com café, de 20/11/2026 a 23/11/2026. Pode fechar: Karolina Oliveira Santos, CPF 123.456.789-01, karolina@email.com" }
    ]
  };
  const extWithBf = extractActivePreReservationData(withBfConv, null, "5522999887766");
  assert.equal(extWithBf.nights, 3);
  assert.equal(extWithBf.includeBreakfast, true);
  assert.equal(extWithBf.dailyRate, 275);
  assert.equal(extWithBf.cleaningFee, 0);
  assert.equal(extWithBf.totalAmount, 825, "3 diárias com café (sem taxa de limpeza) = 3 * 275 = 825");

  // 5.3 Execução real da lógica de recálculo do PUT /api/pms/reservations/:id (1 diária -> 3 diárias)
  const putStart = serverSrc.indexOf("  // Normalização antecipada de charges e cleaningFee na edição");
  const putEnd = serverSrc.indexOf("  // Normalização de payments na edição");
  assert.ok(putStart > 0 && putEnd > putStart, "Bloco de recálculo do PUT deve existir");
  const putSnippet = serverSrc.slice(putStart, putEnd);
  const runPutRecalc = new Function(
    "r",
    "req",
    "db",
    "oldCheckin",
    "oldCheckout",
    "oldTotalAmount",
    "oldDailyRate",
    "oldChargesBeforeEdit",
    "oldCleaningFeeBeforeEdit",
    "oldDailyRatesBeforeEdit",
    `
    const oldRatesSumBeforeEdit = oldDailyRatesBeforeEdit.reduce((acc, d) => acc + (Number(d.rate) || 0), 0);
    const oldPendingAmount = oldTotalAmount;
    const preservedTotalBeforeEdit = oldTotalAmount;
    const isPreReservationBlocked = (res) => res.status === "pre_reserva";
    ${putSnippet}
    return r;
    `
  );

  // Caso A: Redimensionamento de 1 para 3 diárias sem enviar totalAmount (ex: resize ou edição de datas)
  const resCaseA = {
    id: 905,
    status: "pre_reserva",
    channel: "whatsapp",
    includeBreakfast: false,
    checkinDate: "2026-11-20",
    checkoutDate: "2026-11-23",
    dailyRate: 220,
    dailyRates: [{ date: "2026-11-20", rate: 220, channel: "whatsapp" }],
    totalAmount: 290,
    cleaningFee: 70,
    charges: []
  };
  runPutRecalc(
    resCaseA,
    { body: { checkinDate: "2026-11-20", checkoutDate: "2026-11-23" } },
    { siteConfig: { ratePlans: { room_only: { cleaningFeeAmount: 70 } } } },
    "2026-11-20",
    "2026-11-21",
    290,
    220,
    [],
    70,
    [{ date: "2026-11-20", rate: 220, channel: "whatsapp" }],
    true
  );
  assert.equal(resCaseA.dailyRates.length, 3);
  assert.equal(resCaseA.cleaningFee, 70);
  assert.equal(resCaseA.charges.length, 1);
  assert.equal(resCaseA.charges[0].amount, 70);
  assert.equal(resCaseA.totalAmount, 730, "PUT com mudança de 1 para 3 diárias deve calcular 3 * 220 + 70 = 730");

  // Caso B: Edição enviando dailyRates de 3 noites e totalAmount apenas com soma das diárias (660)
  const resCaseB = {
    id: 905,
    status: "pre_reserva",
    channel: "whatsapp",
    includeBreakfast: false,
    checkinDate: "2026-11-20",
    checkoutDate: "2026-11-23",
    dailyRate: 220,
    dailyRates: [
      { date: "2026-11-20", rate: 220, channel: "whatsapp" },
      { date: "2026-11-21", rate: 220, channel: "whatsapp" },
      { date: "2026-11-22", rate: 220, channel: "whatsapp" }
    ],
    totalAmount: 660,
    cleaningFee: 70,
    charges: [{ id: "chg-cleaning", type: "cleaning", title: "Taxa de Limpeza", amount: 70 }]
  };
  runPutRecalc(
    resCaseB,
    {
      body: {
        checkinDate: "2026-11-20",
        checkoutDate: "2026-11-23",
        dailyRates: resCaseB.dailyRates,
        totalAmount: 660
      }
    },
    { siteConfig: { ratePlans: { room_only: { cleaningFeeAmount: 70 } } } },
    "2026-11-20",
    "2026-11-21",
    290,
    220,
    [{ id: "chg-cleaning", type: "cleaning", title: "Taxa de Limpeza", amount: 70 }],
    70,
    [{ date: "2026-11-20", rate: 220, channel: "whatsapp" }],
    true
  );
  assert.equal(resCaseB.totalAmount, 730, "PUT com totalAmount=660 (apenas diárias) deve recompor +70 de taxa de limpeza = 730");

  // Caso C: Remoção intencional da taxa de limpeza via charges: [] (mesmo quando oldChargesBeforeEdit estava vazio e cleaningFee=70)
  const resCaseC = {
    id: 905,
    status: "pre_reserva",
    channel: "whatsapp",
    includeBreakfast: false,
    checkinDate: "2026-11-20",
    checkoutDate: "2026-11-23",
    dailyRate: 220,
    dailyRates: [
      { date: "2026-11-20", rate: 220, channel: "whatsapp" },
      { date: "2026-11-21", rate: 220, channel: "whatsapp" },
      { date: "2026-11-22", rate: 220, channel: "whatsapp" }
    ],
    totalAmount: 730,
    cleaningFee: 70,
    charges: []
  };
  runPutRecalc(
    resCaseC,
    { body: { charges: [] } },
    { siteConfig: { ratePlans: { room_only: { cleaningFeeAmount: 70 } } } },
    "2026-11-20",
    "2026-11-23",
    730,
    220,
    [],
    70,
    resCaseC.dailyRates
  );
  assert.equal(resCaseC.cleaningFee, 0, "Remoção explícita via charges: [] deve zerar cleaningFee");
  assert.equal(resCaseC.charges.length, 0, "Remoção explícita via charges: [] deve manter charges vazio");
  assert.equal(resCaseC.totalAmount, 660, "Remoção explícita via charges: [] deve atualizar totalAmount para 660");

  // Caso D: Remoção intencional via cleaningFee: 0 (mesmo quando r.charges tinha item cleaning)
  const resCaseD = {
    id: 905,
    status: "pre_reserva",
    channel: "whatsapp",
    includeBreakfast: false,
    checkinDate: "2026-11-20",
    checkoutDate: "2026-11-23",
    dailyRate: 220,
    dailyRates: [
      { date: "2026-11-20", rate: 220, channel: "whatsapp" },
      { date: "2026-11-21", rate: 220, channel: "whatsapp" },
      { date: "2026-11-22", rate: 220, channel: "whatsapp" }
    ],
    totalAmount: 730,
    cleaningFee: 70,
    charges: [{ id: "chg-cleaning", type: "cleaning", title: "Taxa de Limpeza", amount: 70 }]
  };
  runPutRecalc(
    resCaseD,
    { body: { cleaningFee: 0 } },
    { siteConfig: { ratePlans: { room_only: { cleaningFeeAmount: 70 } } } },
    "2026-11-20",
    "2026-11-23",
    730,
    220,
    [{ id: "chg-cleaning", type: "cleaning", title: "Taxa de Limpeza", amount: 70 }],
    70,
    resCaseD.dailyRates
  );
  assert.equal(resCaseD.cleaningFee, 0, "PUT com cleaningFee: 0 deve remover item de limpeza de r.charges e zerar cleaningFee");
  assert.equal(resCaseD.charges.length, 0);
  assert.equal(resCaseD.totalAmount, 660);

  // Caso E: Alteração de valor da taxa de limpeza via cleaningFee: 50 (sem enviar charges)
  const resCaseE = {
    id: 905,
    status: "pre_reserva",
    channel: "whatsapp",
    includeBreakfast: false,
    checkinDate: "2026-11-20",
    checkoutDate: "2026-11-23",
    dailyRate: 220,
    dailyRates: [
      { date: "2026-11-20", rate: 220, channel: "whatsapp" },
      { date: "2026-11-21", rate: 220, channel: "whatsapp" },
      { date: "2026-11-22", rate: 220, channel: "whatsapp" }
    ],
    totalAmount: 730,
    cleaningFee: 70,
    charges: [{ id: "chg-cleaning", type: "cleaning", title: "Taxa de Limpeza", amount: 70 }]
  };
  runPutRecalc(
    resCaseE,
    { body: { cleaningFee: 50 } },
    { siteConfig: { ratePlans: { room_only: { cleaningFeeAmount: 70 } } } },
    "2026-11-20",
    "2026-11-23",
    730,
    220,
    [{ id: "chg-cleaning", type: "cleaning", title: "Taxa de Limpeza", amount: 70 }],
    70,
    resCaseE.dailyRates
  );
  assert.equal(resCaseE.cleaningFee, 50);
  assert.equal(resCaseE.charges[0].amount, 50);
  assert.equal(resCaseE.totalAmount, 710, "PUT com cleaningFee: 50 deve atualizar totalAmount para 660 + 50 = 710");

  console.log("✅ 5. Casos de borda (cotação implícita, plano com café, recálculo PUT 1 -> 3 diárias e remoção/edição de taxa) validados.");
}

// ----------------------------------------------------------------------------
// 6. Testes adicionais profundos: Subtotal de 3 diárias + limpeza na mesma mensagem,
//    comandos do gestor (com café / sem café / limpeza), Z-API tags e Portal do Hóspede
// ----------------------------------------------------------------------------
{
  // 6.1 Operador informa subtotal de 3 diárias (R$ 660) + R$ 70 de limpeza na mesma mensagem (effectiveNights === msgQuotedNights)
  const subtotalConv = {
    phone: "5522999887766",
    messages: [
      { fromMe: false, text: "Oi, gostaria de 3 diárias sem café de 20/11/2026 a 23/11/2026" },
      { fromMe: true, senderRole: "human_operator", text: "Para 3 diárias sem café fica R$ 220,00 a diária (R$ 660,00 as diárias) + R$ 70,00 de taxa de limpeza." },
      { fromMe: false, text: "Perfeito, pode reservar! Karolina Oliveira Santos, CPF 123.456.789-01, karolina@email.com" }
    ]
  };
  const extSubtotal = extractActivePreReservationData(subtotalConv, null, "5522999887766");
  assert.equal(extSubtotal.nights, 3);
  assert.equal(extSubtotal.dailyRate, 220);
  assert.equal(extSubtotal.cleaningFee, 70);
  assert.equal(extSubtotal.totalAmount, 730, "Mesmo quando msgQuotedNights === effectiveNights e o texto cita o subtotal das diárias (660), deve somar R$ 70 de limpeza = 730");

  // 6.2 createStandardPmsPreReservation recebendo proposta com totalAmount=660 (apenas diárias) e cleaningFee=70
  const dbForCreate = {
    settings: { interConfig: { pixKey: "47964813000165" } },
    flats: [{ id: 9, number: "905", isActive: true, status: "disponivel" }],
    reservations: [],
    guests: []
  };
  const createdFromStaleProp = await createStandardPmsPreReservation(
    dbForCreate,
    {
      checkIn: "2026-11-20",
      checkOut: "2026-11-23",
      nights: 3,
      guests: 1,
      totalAmount: 660, // veio apenas com 3 * 220
      dailyRate: 220,
      cleaningFee: 70,
      includeBreakfast: false,
      guestName: "Karolina Oliveira Santos",
      guestCpf: "12345678901",
      guestEmail: "karolina@email.com",
      guestPhone: "5522999887766",
      flatId: 9,
      flatNumber: "905"
    },
    { triggerImmediateFn: async () => {} }
  );
  assert.equal(createdFromStaleProp.success, true);
  assert.equal(createdFromStaleProp.reservation.totalAmount, 730, "createStandardPmsPreReservation deve recompor 660 + 70 = 730");
  assert.equal(createdFromStaleProp.reservation.dailyRate, 220, "dailyRate deve permanecer 220 (e não 590/3 = 196.67)");
  assert.equal(createdFromStaleProp.reservation.cleaningFee, 70);

  // 6.3 Gestor alterando plano (com café <-> sem café) e taxa de limpeza via comando no WhatsApp
  const propSemCafe = {
    id: "PRERES-BF1",
    nights: 3,
    dailyRate: 220,
    cleaningFee: 70,
    totalAmount: 730,
    includeBreakfast: false,
    ratePlan: "room_only"
  };
  const cmdToWithBf = parseManagerPreReservationCommand("muda para com café e pode criar", propSemCafe, null);
  assert.equal(cmdToWithBf.matched, true);
  assert.equal(cmdToWithBf.updates.includeBreakfast, true);
  assert.equal(cmdToWithBf.updates.cleaningFee, 0);
  assert.equal(cmdToWithBf.updates.totalAmount, 660, "Mudar para com café deve zerar limpeza e recalcular total para 3 * 220 = 660");

  const propComCafe = {
    id: "PRERES-BF2",
    nights: 3,
    dailyRate: 220,
    cleaningFee: 0,
    totalAmount: 660,
    includeBreakfast: true,
    ratePlan: "with_breakfast"
  };
  const cmdToWithoutBf = parseManagerPreReservationCommand(
    "muda para sem café e pode criar",
    propComCafe,
    { siteConfig: { ratePlans: { room_only: { cleaningFeeEnabled: true, cleaningFeeAmount: 70 } } } }
  );
  assert.equal(cmdToWithoutBf.matched, true);
  assert.equal(cmdToWithoutBf.updates.includeBreakfast, false);
  assert.equal(cmdToWithoutBf.updates.cleaningFee, 70);
  assert.equal(cmdToWithoutBf.updates.totalAmount, 730, "Mudar para sem café deve incluir limpeza R$ 70 e recalcular total para 730");

  const cmdChangeCleaning = parseManagerPreReservationCommand("muda limpeza para R$ 50 e pode criar", propSemCafe, null);
  assert.equal(cmdChangeCleaning.matched, true);
  assert.equal(cmdChangeCleaning.updates.cleaningFee, 50, "Não deve confundir 'limpeza para R$ 50' com valor total da reserva");
  assert.equal(cmdChangeCleaning.updates.totalAmount, 710, "3 * 220 + 50 = 710");

  const cmdWaiveCleaning = parseManagerPreReservationCommand("isenta taxa de limpeza e pode criar", propSemCafe, null);
  assert.equal(cmdWaiveCleaning.matched, true);
  assert.equal(cmdWaiveCleaning.updates.cleaningFee, 0);
  assert.equal(cmdWaiveCleaning.updates.totalAmount, 660);

  // 6.4 Z-API resolveWhatsAppTags recompõe totalAmount se a reserva estava com totalAmount = soma das diárias (660) + cleaningFee (70)
  const tagRes = {
    id: 905,
    code: "RES-905-0001",
    flatNumber: "905",
    guestName: "Karolina Oliveira Santos",
    guestPhone: "5522999887766",
    status: "pre_reserva",
    paymentStatus: "pendente",
    channel: "whatsapp",
    checkinDate: "2026-11-20",
    checkoutDate: "2026-11-23",
    dailyRate: 220,
    dailyRates: [
      { date: "2026-11-20", rate: 220 },
      { date: "2026-11-21", rate: 220 },
      { date: "2026-11-22", rate: 220 }
    ],
    cleaningFee: 70,
    charges: [{ id: "chg-1", type: "cleaning", title: "Taxa de Limpeza", amount: 70 }],
    totalAmount: 660, // valor defasado sem a limpeza
    paidAmount: 0
  };
  const resolvedMsg = resolveWhatsAppTags(
    "Total: {{valor_total}} | Pendente: {{quanto_falta}} | Cartão: {{valor_cartao}} | PIX: {{pix_copia_e_cola}}",
    tagRes,
    { settings: { interConfig: { pixKey: "47964813000165" } } }
  );
  assert.match(resolvedMsg, /Total: R\$\s*730,00/);
  assert.match(resolvedMsg, /Pendente: R\$\s*730,00/);
  assert.match(resolvedMsg, /Cartão: R\$\s*766,50/);
  assert.ok(resolvedMsg.includes("730.00"), "PIX Copia e Cola resolvido no WhatsApp deve conter 730.00");
  assert.equal(tagRes.totalAmount, 730, "resolveWhatsAppTags deve atualizar reservation.totalAmount para 730");

  // 6.5 Guest Portal (demo-server.mjs + guest-portal.tsx) expõe e recompõe charges/cleaningFee
  assert.equal(serverSrc.includes("function ensureReservationCompositeTotal(r)"), true);
  assert.equal(portalSrc.includes("const resolvedTotalInPortal ="), true);

  console.log("✅ 6. Testes profundos (subtotal 3 diárias + limpeza, comandos de café/limpeza do gestor, Z-API tags e Portal do Hóspede) validados.");
}

console.log("🎉 Todos os testes pontuais da Taxa de Limpeza (Karolina Flat 905) passaram com 100% de sucesso!");

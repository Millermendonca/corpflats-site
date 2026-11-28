import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolamento total ANTES de importar o servidor (100% offline: sem PostgreSQL, sem Z-API real, sem SMTP/Zoho real)
const tempDbPath = path.join(os.tmpdir(), `corpflats-req-test-${process.pid}-${Date.now()}.json`);
fs.writeFileSync(
  tempDbPath,
  JSON.stringify({
    zapiConfig: { enabled: true, instanceId: "", token: "", testModeOnly: false },
    settings: {
      hotelName: "CorpFlats",
      checkinTime: "14:00",
      checkoutTime: "11:00",
      emailSettings: { enabled: true },
      smtpConfig: { user: "", pass: "" }
    },
    reservations: [],
    guests: [],
    companies: [],
    agencies: [],
    whatsappHistory: [],
    whatsappConversations: [],
    whatsappQueue: [],
    reservationCommunications: []
  }),
  "utf8"
);

process.env.NODE_ENV = "test";
process.env.PORT = "0";
process.env.DATA_FILE = tempDbPath;
delete process.env.DATABASE_URL;
delete process.env.ZAPI_INSTANCE_ID;
delete process.env.ZAPI_TOKEN;
delete process.env.ZAPI_CLIENT_TOKEN;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
delete process.env.ZOHO_CLIENT_ID;
delete process.env.ZOHO_CLIENT_SECRET;
delete process.env.ZOHO_REFRESH_TOKEN;

const {
  httpServer,
  db,
  areGuestNamesLooselyCompatible,
  pickBestPreservedGuestName,
  findMatchingExistingCrmGuest,
  upsertCrmGuestProfile
} = await import("../artifacts/api-server/demo-server.mjs");

const {
  DEFAULT_WHATSAPP_TEMPLATES,
  WHATSAPP_INTERACTIVE_BODY_SAFE_LIMIT,
  ensureCorpFlatsBootMigrations
} = await import("../artifacts/api-server/zapi-service.mjs");

const {
  dispatchPackagePreReservationCreated
} = await import("../artifacts/api-server/package-reservations-service.mjs");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiJson(baseUrl, method, route, body) {
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-test-bypass-auth": "1"
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function run() {
  // Garante endereço HTTP local efêmero pronto e credenciais Z-API/SMTP limpas
  if (!httpServer.listening) {
    await new Promise((resolve) => httpServer.once("listening", resolve));
  }
  const port = httpServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Cria sessão autenticada admin em memória para chamadas protegidas /api/pms/reservations
  const adminToken = "tok_test_admin_requester_flow";
  if (!Array.isArray(db.sessions)) db.sessions = [];
  db.sessions.push({
    token: adminToken,
    userId: 1,
    username: "admin",
    name: "Admin Teste",
    role: "admin",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString()
  });
  db.zapiConfig = { enabled: true, instanceId: "", token: "", testModeOnly: false };
  db.settings = {
    ...(db.settings || {}),
    checkinTime: "14:00",
    checkoutTime: "11:00",
    emailSettings: { enabled: true },
    smtpConfig: { user: "", pass: "" }
  };
  db.whatsappTemplates = structuredClone(DEFAULT_WHATSAPP_TEMPLATES);
  ensureCorpFlatsBootMigrations(db);

  const authApi = async (method, route, body) => {
    const res = await fetch(`${baseUrl}${route}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };

  // ── CENÁRIO 1 (Caso RES-215-1036): Empresa PJ Faturado (15 dias) com hóspede já identificado ──
  {
    db.whatsappHistory = [];
    db.reservationCommunications = [];

    const createRes = await authApi("POST", "/api/pms/reservations", {
      flatId: 6,
      flatNumber: "215",
      status: "confirmada",
      channel: "whatsapp",
      checkinDate: "2026-12-10",
      checkoutDate: "2026-12-13",
      guestCount: 1,
      adults: 1,
      includeBreakfast: true,
      totalAmount: 960,
      paidAmount: 0,
      paymentMethod: "faturado_boleto",
      paymentStatus: "faturado",
      isFaturadoBoleto: true,
      boletoTermDays: 15,
      isConsumptionFaturado: true,
      requesterIsGuest1: false,
      requesterType: "company",
      companyName: "Engenharia Oceânica Ltda",
      companyCnpj: "12345678000199",
      requesterName: "Fernanda Financeiro",
      requesterPhone: "5521988881111",
      requesterEmail: "compras@engenhariaoceanica.com.br",
      guestName: "Roberto Carlos Mendes",
      guestPhone: "5522999112233",
      guestDocument: "52998224725",
      guestEmail: "roberto.mendes@gmail.com"
    });

    assert.equal(createRes.status, 201, `Esperado 201 ao criar reserva faturada: ${JSON.stringify(createRes.data)}`);
    const createdCode = createRes.data.code;
    await wait(200);

    const reqWaMsgs = db.whatsappHistory.filter(
      (h) => h.reservationCode === createdCode && h.recipientType === "requester"
    );
    assert.equal(reqWaMsgs.length, 1, "Solicitante Empresa PJ deve receber exatamente 1 mensagem de confirmação");
    assert.equal(reqWaMsgs[0].triggerEvent, "requester_reservation_confirmed");
    assert.equal(reqWaMsgs[0].documentUrl, null, "Solicitante NÃO deve receber Manual em PDF");
    assert.ok(
      reqWaMsgs[0].message.length <= WHATSAPP_INTERACTIVE_BODY_SAFE_LIMIT,
      `Corpo da mensagem do solicitante (${reqWaMsgs[0].message.length}) deve respeitar <= ${WHATSAPP_INTERACTIVE_BODY_SAFE_LIMIT} chars`
    );
    assert.match(reqWaMsgs[0].message, /Olá,\s*\*Fernanda\*/);
    assert.match(reqWaMsgs[0].message, /Flat 215/);
    assert.match(reqWaMsgs[0].message, /Roberto Carlos Mendes/);
    assert.match(reqWaMsgs[0].message, /R\$\s*960,00/);
    assert.match(reqWaMsgs[0].message, /Faturado \(Boleto Bancário\)/);
    assert.match(reqWaMsgs[0].message, /15 dias após o check-out.*28\/12\/2026/);
    assert.match(reqWaMsgs[0].message, /Consumos Extras:\s*\*Inclusos no faturamento\*/);
    assert.match(reqWaMsgs[0].message, /Boleto & Nota Fiscal \(NFS-e\):\s*\*Serão emitidos e enviados automaticamente no momento do check-out\.\*/);
    assert.doesNotMatch(reqWaMsgs[0].message, /Wi-Fi|Check-in Online|\/cafe\//i);

    const reqBtnLabels = (reqWaMsgs[0].buttons || []).map((b) => b.label);
    assert.ok(reqBtnLabels.includes("🏨 Portal do Solicitante"), `Botão Portal do Solicitante esperado: ${JSON.stringify(reqBtnLabels)}`);
    assert.ok(!reqBtnLabels.some((l) => /check-in|café|pix/i.test(l)), "Sem botões de estadia ou PIX para faturado");

    // E-mail espelho enviado ao Solicitante
    const reqEmails = db.reservationCommunications.filter(
      (c) =>
        String(c.reservation_id) === createdCode &&
        String(c.recipient).toLowerCase().includes("compras@engenhariaoceanica.com.br") &&
        c.metadata?.trigger === "requester_reservation_confirmed"
    );
    assert.equal(reqEmails.length, 1, "Solicitante deve receber também o e-mail de confirmação e faturamento");

    // Hóspede recebe a régua de estadia (Intro + Confirmação com PDF) SEM valores financeiros
    const guestWaMsgs = db.whatsappHistory.filter(
      (h) => h.reservationCode === createdCode && h.recipientType === "guest"
    );
    assert.equal(guestWaMsgs.length, 2, "Hóspede inédito deve receber Apresentação + Confirmação c/ PDF");
    assert.equal(guestWaMsgs[0].triggerEvent, "corpflats_intro");
    assert.equal(guestWaMsgs[1].triggerEvent, "reservation_created");
    assert.doesNotMatch(guestWaMsgs[1].message, /960,00|Faturado|Boleto/i, "Hóspede NÃO deve ver dados financeiros do solicitante");

    // ── Alteração exclusivamente financeira (Prazo de Faturamento 15 -> 28 dias) ──
    db.whatsappHistory = [];
    db.reservationCommunications = [];
    const putFin = await authApi("PUT", `/api/pms/reservations/${createRes.data.id}`, {
      boletoTermDays: 28
    });
    assert.equal(putFin.status, 200);
    await wait(150);

    const reqUpdFin = db.whatsappHistory.filter((h) => h.triggerEvent === "reservation_updated" && h.recipientType === "requester");
    const guestUpdFin = db.whatsappHistory.filter((h) => h.triggerEvent === "reservation_updated" && h.recipientType === "guest");
    assert.equal(reqUpdFin.length, 1, "Solicitante deve ser notificado quando o prazo de faturamento muda");
    assert.equal(guestUpdFin.length, 0, "Hóspede NÃO deve receber aviso de alteração exclusivamente financeira");
    assert.match(reqUpdFin[0].message, /Prazo de Faturamento/);
    assert.match(reqUpdFin[0].message, /28 dias após o check-out/);
    assert.match(reqUpdFin[0].message, /Roberto Carlos Mendes/);

    // ── Alteração de datas (afeta Solicitante E Hóspede) ──
    await wait(50);
    db.whatsappHistory = [];
    db.reservationCommunications = [];
    const putDates = await authApi("PUT", `/api/pms/reservations/${createRes.data.id}`, {
      checkoutDate: "2026-12-15",
      totalAmount: 1600
    });
    assert.equal(putDates.status, 200);
    await wait(1450);

    const reqUpdDates = db.whatsappHistory.filter((h) => h.triggerEvent === "reservation_updated" && h.recipientType === "requester");
    const guestUpdDates = db.whatsappHistory.filter((h) => h.triggerEvent === "reservation_updated" && h.recipientType === "guest");
    assert.equal(reqUpdDates.length, 1, "Solicitante deve receber alteração de datas + nova posição financeira");
    assert.equal(guestUpdDates.length, 1, "Hóspede deve receber alteração de datas sem valores financeiros");
    assert.match(reqUpdDates[0].message, /R\$\s*1\.600,00/);
    assert.doesNotMatch(guestUpdDates[0].message, /1\.600,00/);

    // ── Cancelamento via PUT status -> "cancelada" (notifica Solicitante E Hóspede no WhatsApp + E-mail) ──
    db.whatsappHistory = [];
    db.reservationCommunications = [];
    const putCancel = await authApi("PUT", `/api/pms/reservations/${createRes.data.id}`, {
      status: "cancelada"
    });
    assert.equal(putCancel.status, 200);
    await wait(1450);

    const reqCancelWa = db.whatsappHistory.filter((h) => h.triggerEvent === "reservation_cancelled" && h.recipientType === "requester");
    const guestCancelWa = db.whatsappHistory.filter((h) => h.triggerEvent === "reservation_cancelled" && h.recipientType === "guest");
    assert.equal(reqCancelWa.length, 1, "Solicitante deve receber WhatsApp de cancelamento ao cancelar via PUT");
    assert.equal(guestCancelWa.length, 1, "Hóspede deve receber WhatsApp de cancelamento ao cancelar via PUT");
    assert.match(reqCancelWa[0].message, /Flat 215/);
    assert.match(reqCancelWa[0].message, /Hóspede:\s*\*Roberto Carlos Mendes\*/);
    assert.doesNotMatch(guestCancelWa[0].message, /Hóspede:\s*\*Roberto Carlos Mendes\*/);

    const reqCancelEmail = db.reservationCommunications.filter(
      (c) =>
        String(c.recipient).toLowerCase().includes("compras@engenhariaoceanica.com.br") &&
        c.metadata?.trigger === "reservation_cancelled"
    );
    assert.equal(reqCancelEmail.length, 1, "Solicitante deve receber e-mail de cancelamento");
  }

  // ── CENÁRIO 2: Terceiro PF / Empresa PJ SEM dados do hóspede ("A Definir") -> 2 mensagens separadas em sequência ──
  let pendingCredCode = "";
  {
    db.whatsappHistory = [];
    db.reservationCommunications = [];

    const createPendingGuestRes = await authApi("POST", "/api/pms/reservations", {
      flatId: 10,
      flatNumber: "509",
      status: "confirmada",
      channel: "whatsapp",
      checkinDate: "2026-12-18",
      checkoutDate: "2026-12-20",
      guestCount: 1,
      adults: 1,
      includeBreakfast: false,
      totalAmount: 640,
      paidAmount: 640,
      paymentMethod: "pix",
      paymentStatus: "pago_total",
      requesterIsGuest1: false,
      requesterType: "other_person",
      requesterName: "Marcos Paulo Araujo",
      requesterPhone: "5521977776666",
      requesterEmail: "marcos.araujo@empresa.com.br",
      guestName: "Hóspede a Definir",
      guestPhone: "",
      informGuestsLater: true
    });

    assert.equal(createPendingGuestRes.status, 201);
    pendingCredCode = createPendingGuestRes.data.code;
    await wait(250);

    const reqMsgs = db.whatsappHistory.filter((h) => h.reservationCode === pendingCredCode);
    assert.equal(reqMsgs.length, 2, `Solicitante sem dados do hóspede deve receber 2 mensagens em sequência, recebeu ${reqMsgs.length}`);
    assert.equal(reqMsgs[0].triggerEvent, "requester_reservation_confirmed", "1ª mensagem deve ser a confirmação + financeiro/NFS-e");
    assert.equal(reqMsgs[1].triggerEvent, "b2b_agency_credential_request", "2ª mensagem deve ser o pedido de credenciamento do hóspede");
    assert.match(reqMsgs[0].message, /Pago Integralmente/);
    assert.match(reqMsgs[0].message, /Nota Fiscal \(NFS-e\):\s*\*Será emitida e enviada automaticamente no momento do check-out\.\*/);
    assert.match(reqMsgs[1].message, /\/credenciamento\//);
  }

  // ── CENÁRIO 3: Agência B2B NÃO recebe a mensagem comercial/financeira de confirmação na criação ──
  {
    db.whatsappHistory = [];
    const createAgencyRes = await authApi("POST", "/api/pms/reservations", {
      flatId: 12,
      flatNumber: "512",
      status: "confirmada",
      channel: "b2b",
      b2bReservationNumber: "LOC-998877",
      checkinDate: "2026-12-21",
      checkoutDate: "2026-12-23",
      guestCount: 1,
      adults: 1,
      totalAmount: 700,
      paidAmount: 0,
      paymentMethod: "faturado_b2b",
      paymentStatus: "faturado",
      requesterIsGuest1: false,
      requesterType: "agency",
      agencyName: "FlyTour Viagens Corporativas",
      agencyAgentName: "Juliana Operadora",
      agencyAgentPhone: "5511966665555",
      agencyAgentEmail: "emissao@flytour-teste.com.br",
      guestName: "Lucas Andrade",
      guestPhone: "5522988112244",
      guestDocument: "11144477735"
    });
    assert.equal(createAgencyRes.status, 201);
    await wait(180);

    const agencyConfirmMsgs = db.whatsappHistory.filter(
      (h) => h.reservationCode === createAgencyRes.data.code && h.triggerEvent === "requester_reservation_confirmed"
    );
    assert.equal(agencyConfirmMsgs.length, 0, "Agência B2B NÃO deve receber requester_reservation_confirmed");
  }

  // ── CENÁRIO 4: Anti-Duplicidade Inteligente no /credenciamento e no CRM de Hóspedes ──
  {
    // Limpa e semeia 1 hóspede já validada no CRM com nome completo oficial
    db.guests = [
      {
        id: 500,
        guestCode: "HOSP-00500",
        name: "Carla Bettero de Araujo Baptista",
        fullName: "Carla Bettero de Araujo Baptista",
        cpf: "39053344705",
        document: "39053344705",
        phone: "22998114455",
        whatsapp: "22998114455",
        email: "carla.bettero@gmail.com",
        fnhrCompleted: true
      }
    ];

    // 4A. Homônimo APENAS por nome (sem CPF, sem telefone e sem e-mail) NÃO deve unificar
    const homonymMatch = findMatchingExistingCrmGuest(db, {
      name: "Carla Bettero de Araujo Baptista",
      document: "",
      phone: "",
      email: ""
    });
    assert.equal(homonymMatch, null, "Nunca deve buscar/unificar hóspede apenas pelo nome sem CPF/telefone/e-mail");

    const homonymUpsert = upsertCrmGuestProfile(db, {
      name: "Carla Bettero de Araujo Baptista"
    });
    assert.notEqual(homonymUpsert.guest.id, 500, "Cadastro sem nenhum identificador forte deve criar novo registro sem contaminar homônimo");
    // Remove o homônimo de teste para seguir os cenários com a base limpa
    db.guests = db.guests.filter((g) => g.id === 500);

    // 4B. Duas pessoas completamente diferentes dividindo o mesmo telefone (ex.: marido "Marcos Paulo" vs esposa "Carla Bettero") NÃO devem se fundir
    const spouseDifferentPerson = findMatchingExistingCrmGuest(db, {
      name: "Marcos Paulo Araujo",
      phone: "+55 (22) 99811-4455"
    });
    assert.equal(spouseDifferentPerson, null, "Esposo com nome incompatível e mesmo telefone não deve sobrescrever/unificar o cadastro da esposa");

    // 4C. Credenciamento real em /api/pms/agency-guest-credential/:code com:
    //     - Telefone com DDI 55 ("5522998114455" vs "22998114455" no CRM)
    //     - Nome abreviado e com erro de grafia pelo solicitante ("Carla Battero")
    //     -> Deve reaproveitar HOSP-00500 (sem duplicar) E preservar "Carla Bettero de Araujo Baptista"!
    db.whatsappHistory = [];
    const credResp = await apiJson(baseUrl, "POST", `/api/pms/agency-guest-credential/${pendingCredCode}`, {
      guestName: "Carla Battero",
      guestDocument: "39053344705",
      guestPhone: "5522998114455",
      guestEmail: "carla.bettero@gmail.com",
      requesterIsGuest1: false
    });
    assert.equal(credResp.status, 200, `Falha no credenciamento: ${JSON.stringify(credResp.data)}`);
    const carlaRecords = db.guests.filter(
      (g) =>
        String(g.cpf || g.document || "").replace(/\D/g, "") === "39053344705" ||
        /carla\s+b[ae]t+ero/i.test(String(g.fullName || g.name || "")) ||
        String(g.phone || g.whatsapp || "").replace(/\D/g, "").endsWith("998114455")
    );
    assert.equal(carlaRecords.length, 1, "NÃO deve duplicar a hóspede no CRM quando telefone/CPF batem com variação de nome");
    assert.equal(carlaRecords[0].id, 500);
    assert.equal(
      carlaRecords[0].fullName,
      "Carla Bettero de Araujo Baptista",
      "Deve preservar o nome mais completo/validado do CRM em vez de achatar para 'Carla Battero'"
    );

    const updatedRes = db.reservations.find((r) => r.code === pendingCredCode);
    assert.equal(updatedRes.guestId, 500, "Reserva deve ficar vinculada ao guestId existente 500");
    assert.equal(
      updatedRes.guestName,
      "Carla Bettero de Araujo Baptista",
      "Reserva também deve preservar o nome completo oficial do CRM"
    );

    // 4D. Compatibilidade fonética/ortográfica brasileira sem CPF (apenas telefone batendo com 9º dígito/55)
    assert.equal(areGuestNamesLooselyCompatible("Carla Battero", "Carla Bettero de Araujo Baptista"), true);
    assert.equal(areGuestNamesLooselyCompatible("Matheus Souza", "Mateus de Sousa Batista"), true);
    assert.equal(areGuestNamesLooselyCompatible("Thiago Baptista", "Tiago Batista"), true);
    assert.equal(areGuestNamesLooselyCompatible("Marcos Paulo", "Carla Bettero"), false);
    assert.equal(
      pickBestPreservedGuestName(carlaRecords[0], "Carla"),
      "Carla Bettero de Araujo Baptista"
    );
  }

  // ── CENÁRIO 5: Pacote Multi-Flat Faturado sem dados dos hóspedes -> 2 mensagens ao Solicitante PJ ──
  {
    const pkgSentMsgs = [];
    const pkgRes1 = {
      id: 9101,
      code: "RES-113-9101",
      packageId: "PKG-FAT01",
      packageCode: "PKG-FAT01",
      flatId: 1,
      flatNumber: "113",
      status: "confirmada",
      channel: "whatsapp",
      checkinDate: "2026-12-10",
      checkoutDate: "2026-12-12",
      guestCount: 1,
      totalAmount: 500,
      paidAmount: 0,
      paymentMethod: "faturado_boleto",
      paymentStatus: "faturado",
      isFaturadoBoleto: true,
      boletoTermDays: 21,
      requesterIsGuest1: false,
      requesterType: "company",
      requesterName: "Patrícia Gestora",
      requesterPhone: "5521991112222",
      requesterEmail: "patricia@corpclient.com.br",
      guestName: "A definir",
      informGuestsLater: true
    };
    const pkgRes2 = {
      ...pkgRes1,
      id: 9102,
      code: "RES-114-9102",
      flatId: 2,
      flatNumber: "114"
    };
    db.reservations.push(pkgRes1, pkgRes2);

    await dispatchPackagePreReservationCreated(db, "PKG-FAT01", "https://corpflats.com.br", {
      sendZapiMessage: async (_cfg, payload) => {
        pkgSentMsgs.push(payload);
        return { success: true, messageId: `pkg_mock_${pkgSentMsgs.length}` };
      }
    });

    assert.equal(pkgSentMsgs.length, 2, "Pacote confirmado PJ sem hóspedes deve enviar 1ª msg de Confirmação/Faturamento e 2ª msg de Credenciamento");
    assert.match(pkgSentMsgs[0].message, /21 dias após o check-out.*02\/01\/2027/);
    assert.match(pkgSentMsgs[0].message, /Boleto & Nota Fiscal \(NFS-e\)/);
    assert.match(pkgSentMsgs[1].message, /Cadastro dos Hóspedes — Pacote PKG-FAT01/);
  }

  console.log("✅ TODOS OS CENÁRIOS (SOLICITANTE + FATURAMENTO/NFSE + ALTERAÇÃO/CANCELAMENTO + ANTI-DUPLICIDADE CRM) PASSARAM 100%!");
}

let exitCode = 0;
try {
  await run();
} catch (err) {
  console.error("❌ FALHA NO TESTE:", err);
  exitCode = 1;
} finally {
  try {
    httpServer.close();
  } catch (_) {}
  try {
    if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
  } catch (_) {}
  process.exit(exitCode);
}

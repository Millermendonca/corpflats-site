import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const serverSrc = fs.readFileSync(path.resolve("scripts/demo-server.mjs"), "utf8");
const calendarSrc = fs.readFileSync(path.resolve("artifacts/limpeza/src/pages/pms-calendar.tsx"), "utf8");

function loadReconciliationSandbox() {
  const startMarker = "function normalizeName(str)";
  const endMarker = "function ensureGuestCodes()";
  const startIdx = serverSrc.indexOf(startMarker);
  const endIdx = serverSrc.indexOf(endMarker);
  assert.ok(startIdx > 0 && endIdx > startIdx, "Bloco de reconciliação deve existir em scripts/demo-server.mjs");

  const gcStartMarker = "export function expandBrazilianPhoneVariants(rawPhonesList)";
  const gcEndMarker = "function escapeVCardValue(val)";
  const gcStartIdx = serverSrc.indexOf(gcStartMarker);
  const gcEndIdx = serverSrc.indexOf(gcEndMarker);
  assert.ok(gcStartIdx > 0 && gcEndIdx > gcStartIdx, "Bloco de Google Contacts deve existir em scripts/demo-server.mjs");

  const codeSlice = serverSrc
    .slice(startIdx, endIdx)
    .replace(/export\s+function\s+/g, "function ");

  const gcSlice = serverSrc
    .slice(gcStartIdx, gcEndIdx)
    .replace(/export\s+function\s+/g, "function ");

  const sandbox = {
    db: { guests: [], reservations: [], invoices: [], guestAccounts: [], emailQueue: [], whatsappQueue: [] },
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(
    `${codeSlice}\n${gcSlice}\nthis.exports = { normalizeName, isSystemOrServiceOrderGuestName, isPlaceholderOrEmptyGuestName, areGuestNamesCompatible, mergeGuestRecords, healContaminatedGuestAndReservationLinks, reconcileAndMergeGuests, expandBrazilianPhoneVariants, buildGuestCallerIdContactData };`,
    sandbox
  );
  return sandbox.exports;
}

test("1. areGuestNamesCompatible: bloqueia fusão entre pessoas distintas (incluindo mesmo prenome com sobrenomes distintos, prefixos como Fabiano/Fabiana e nomes de OS) e permite variações legítimas", () => {
  const { areGuestNamesCompatible, isSystemOrServiceOrderGuestName } = loadReconciliationSandbox();

  assert.equal(areGuestNamesCompatible("Leonardo Portugal", "Francine"), false);
  assert.equal(areGuestNamesCompatible("Leonardo Portugal", "Francine Silva"), false);
  assert.equal(areGuestNamesCompatible("Francine Oliveira", "Leonardo"), false);
  assert.equal(areGuestNamesCompatible("Fabiana", "João Eduardo Leal Correa"), false);
  assert.equal(areGuestNamesCompatible("Fabiano", "Fabiana"), false);
  assert.equal(areGuestNamesCompatible("Leonardo Portugal Federici", "Leonardo Primo de Sousa"), false);
  assert.equal(areGuestNamesCompatible("Leonardo Portugal Federici", "Leonardo da Silva Rodrigues"), false);
  assert.equal(areGuestNamesCompatible("Fabiana Gambi", "Fabiana Rodrigues"), false);

  assert.equal(isSystemOrServiceOrderGuestName("Ordem de Serviço: Limpeza de filtro de ar condicionado"), true);
  assert.equal(areGuestNamesCompatible("Ordem de Serviço: Limpeza de filtro de ar condicionado", "Miller Mendonça Pessanha"), false);
  assert.equal(areGuestNamesCompatible("Manutenção", "Miller Mendonça Pessanha"), false);

  assert.equal(areGuestNamesCompatible("Leonardo Portugal", "Leonardo"), true);
  assert.equal(areGuestNamesCompatible("Leonardo", "Leonardo Portugal"), true);
  assert.equal(areGuestNamesCompatible("Leonardo Portugal", "Leonardo Portugal Federici"), true);
  assert.equal(areGuestNamesCompatible("Fabiana", "Fabiana"), true);
  assert.equal(areGuestNamesCompatible("Hóspede 1", "Leonardo Portugal"), true);
  assert.equal(areGuestNamesCompatible("Hóspede a definir", "Francine"), true);
  assert.equal(areGuestNamesCompatible("", "Leonardo Portugal"), true);
});

test("2. Incidente Flat 215 (Leonardo Portugal vs Francine): autocura separa fichas CRM, restaura nome/telefone e expurga e-mail/CPF/endereço da Francine", () => {
  const { reconcileAndMergeGuests } = loadReconciliationSandbox();

  const mockDb = {
    guests: [
      {
        id: 42,
        guestCode: "HOSP-00042",
        name: "Francine",
        fullName: "Francine Almeida",
        phone: "22999112233",
        additionalPhones: ["22988776655", "22999112233"],
        email: "francine@email.com",
        document: "12345678901",
        documentNumber: "12345678901",
        address: "Rua das Palmeiras, 50",
        street: "Rua das Palmeiras",
        streetNumber: "50",
        neighborhood: "Centro",
        city: "Campos dos Goytacazes",
        state: "RJ",
        cep: "28010000"
      }
    ],
    guestAccounts: [
      {
        id: 1,
        guestId: 42,
        name: "Francine Almeida",
        email: "francine@email.com",
        phone: "22988776655",
        document: "12345678901"
      }
    ],
    reservations: [
      {
        id: 21501,
        code: "RES-215-LEO",
        flatId: 5,
        flatNumber: "215",
        status: "confirmada",
        guestId: 42,
        guestCode: "HOSP-00042",
        guestName: "Francine Almeida",
        guestPhone: "22999112233",
        guestEmail: "francine@email.com",
        guestDocument: "12345678901",
        guestAddress: "Rua das Palmeiras, 50",
        guestStreet: "Rua das Palmeiras",
        guestCity: "Campos dos Goytacazes",
        guestCep: "28010000",
        guests: [
          {
            index: 1,
            guestId: 42,
            name: "Francine Almeida",
            cpf: "12345678901",
            phone: "22999112233",
            email: "francine@email.com"
          }
        ],
        auditLogs: [
          {
            timestamp: "2026-10-28T18:00:00.000Z",
            changes: [
              { field: "guestName", oldValue: "Francine Almeida", newValue: "Leonardo Portugal" },
              { field: "guestPhone", oldValue: "22988776655", newValue: "22999112233" }
            ]
          }
        ]
      }
    ],
    invoices: []
  };

  reconcileAndMergeGuests(mockDb);

  const r215 = mockDb.reservations[0];
  const francine = mockDb.guests.find(g => g.id === 42);
  const leonardo = mockDb.guests.find(g => g.id !== 42 && g.name === "Leonardo Portugal");

  assert.equal(r215.guestName, "Leonardo Portugal");
  assert.equal(r215.guestPhone, "22999112233");
  assert.equal(r215.guestEmail, "");
  assert.equal(r215.guestDocument, "");
  assert.equal(r215.guestAddress, undefined);
  assert.equal(r215.guestStreet, undefined);
  assert.equal(r215.guestCep, undefined);
  assert.notEqual(r215.guestId, 42);
  assert.equal(r215.guests[0].name, "Leonardo Portugal");
  assert.equal(r215.guests[0].email, "");
  assert.equal(r215.guests[0].cpf, "");

  assert.ok(francine, "Ficha da Francine deve continuar existindo");
  assert.equal(francine.fullName, "Francine Almeida");
  assert.equal(francine.phone, "22988776655");
  assert.equal(
    (francine.additionalPhones || []).some(p => String(p).includes("999112233")),
    false,
    "Telefone do Leonardo deve ter sido removido de additionalPhones da Francine"
  );

  assert.ok(leonardo, "Ficha separada do Leonardo Portugal deve ter sido criada");
  assert.equal(r215.guestId, leonardo.id);
  assert.equal(leonardo.phone, "22999112233");
  assert.equal(leonardo.email || "", "");
  assert.equal(leonardo.address, undefined);
});

test("3. Incidente Flat 509 (Fabiana RES-509-0539 / GUEST 359 vs João Eduardo Leal Correa GUEST 20): separa fichas, limpa RG/CPF/e-mail/endereço e cancela emailQueue contaminado", () => {
  const { reconcileAndMergeGuests, buildGuestCallerIdContactData } = loadReconciliationSandbox();

  const mockDb = {
    guests: [
      {
        id: 20,
        guestCode: "HOSP-00020",
        name: "João Eduardo Leal Correa",
        fullName: "João Eduardo Leal Correa",
        phone: "21970450660",
        additionalPhones: ["21970450660", "28999136926"],
        email: "joao.educorrea@gmail.com",
        document: "02393056718",
        documentNumber: "02393056718",
        birthDate: "1982-12-23",
        address: "Rua Dora Bria, 155",
        city: "Rio de Janeiro",
        state: "RJ",
        cep: "21530-280",
        docPhotoUrl: "/api/storage/files/guests/doc_res_1775699527172.jpg",
        googleContactResourceName: "people/c5362578501072660427",
        googleContactDisplayName: "Fabiana • CorpFlats [UH 509]",
        reservationIds: [486, 493, 516, 539]
      },
      {
        id: 359,
        guestCode: "HOSP-00359",
        name: "Fabiana",
        fullName: "Fabiana",
        phone: "28999136926",
        additionalPhones: ["21970450660", "28999136926"],
        email: "joao.educorrea@gmail.com",
        document: "02393056718",
        documentNumber: "02393056718",
        birthDate: "1982-12-23",
        address: "Rua Dora Bria, 155",
        street: "Rua Dora Bria",
        streetNumber: "155",
        neighborhood: "Pavuna",
        city: "Rio de Janeiro",
        state: "RJ",
        cep: "21530-280",
        docPhotoUrl: "/api/storage/files/guests/doc_res_1775699527172.jpg",
        googleContactResourceName: "people/c5362578501072660427",
        googleContactDisplayName: "Fabiana • CorpFlats [UH 509]",
        reservationIds: [486, 493, 516, 539]
      }
    ],
    reservations: [
      {
        id: 486,
        code: "RES-605-0486",
        flatId: 12,
        flatNumber: "605",
        status: "completed",
        guestId: 20,
        guestCode: "HOSP-00020",
        guestName: "João Eduardo Leal Correa",
        guestPhone: "21970450660",
        guestEmail: "joao.educorrea@gmail.com",
        guestDocument: "02393056718",
        birthDate: "1982-12-23",
        guestAddress: "Rua Dora Bria, 155",
        guestCity: "Rio de Janeiro",
        guestState: "RJ",
        guestCep: "21530-280",
        docPhotoUrl: "/api/storage/files/guests/doc_res_1775699527172.jpg",
        checkinDate: "2026-10-16",
        checkoutDate: "2026-10-22"
      },
      {
        id: 539,
        code: "RES-509-0539",
        flatId: 9,
        flatNumber: "509",
        status: "in_house",
        guestId: 359,
        guestCode: "HOSP-00359",
        guestName: "Fabiana",
        guestPhone: "28999136926",
        guestEmail: "joao.educorrea@gmail.com",
        guestDocument: "02393056718",
        birthDate: "1982-12-23",
        guestAddress: "Rua Dora Bria, 155",
        guestCity: "Rio de Janeiro",
        guestState: "RJ",
        guestCep: "21530-280",
        docPhotoUrl: "/api/storage/files/guests/doc_res_1775699527172.jpg",
        fnhrCompleted: true,
        aiVerification: { status: "rejected", reason: "Documento em nome de João Eduardo Leal Correa" },
        aiDocInspection: { extractedName: "JOAO EDUARDO LEAL CORREA" },
        checkinDate: "2026-10-27",
        checkoutDate: "2026-10-30",
        guests: [
          {
            index: 1,
            guestId: 20,
            name: "Fabiana",
            phone: "28999136926",
            email: "joao.educorrea@gmail.com",
            cpf: "02393056718",
            birthDate: "1982-12-23",
            address: "Rua Dora Bria, 155",
            docPhotoUrl: "/api/storage/files/guests/doc_res_1775699527172.jpg",
            hasCompletedCheckin: true,
            aiVerification: { status: "rejected" }
          }
        ]
      }
    ],
    emailQueue: [
      {
        id: "email_539_checkout",
        reservationId: 539,
        reservationCode: "RES-509-0539",
        guestEmail: "joao.educorrea@gmail.com",
        guestName: "Fabiana",
        status: "pending",
        triggerEvent: "checkout_day_morning"
      }
    ],
    whatsappQueue: [],
    invoices: [],
    guestAccounts: []
  };

  const contaminatedEmailItem = mockDb.emailQueue[0];
  reconcileAndMergeGuests(mockDb);

  const r539 = mockDb.reservations.find(r => r.id === 539);
  const g20 = mockDb.guests.find(g => g.id === 20);
  const g359 = mockDb.guests.find(g => g.id === 359);

  // 1. RES-509-0539 deve pertencer exclusivamente à Fabiana sem dados do João Eduardo
  assert.equal(r539.guestId, 359);
  assert.equal(r539.guestCode, "HOSP-00359");
  assert.equal(r539.guestName, "Fabiana");
  assert.equal(r539.guestPhone, "28999136926");
  assert.equal(r539.guestEmail, "");
  assert.equal(r539.guestDocument, "");
  assert.equal(r539.birthDate, undefined);
  assert.equal(r539.guestAddress, undefined);
  assert.equal(r539.guestCity, undefined);
  assert.equal(r539.guestCep, undefined);
  assert.equal(r539.docPhotoUrl || null, null);
  assert.equal(r539.aiVerification, undefined);
  assert.equal(r539.aiDocInspection, undefined);
  assert.equal(Boolean(r539.fnhrCompleted), false);
  assert.equal(r539.guests[0].guestId, 359);
  assert.equal(r539.guests[0].name, "Fabiana");
  assert.equal(r539.guests[0].phone, "28999136926");
  assert.equal(r539.guests[0].email, "");
  assert.equal(r539.guests[0].cpf, "");
  assert.equal(r539.guests[0].docPhotoUrl || null, null);
  assert.equal(r539.guests[0].hasCompletedCheckin, false);

  // 2. GUEST 359 (Fabiana) deve estar limpa e sem resourceName do João
  assert.ok(g359);
  assert.equal(g359.name, "Fabiana");
  assert.equal(g359.fullName, "Fabiana");
  assert.equal(g359.phone, "28999136926");
  assert.deepEqual(Array.from(g359.additionalPhones || []), []);
  assert.equal(g359.email, "");
  assert.equal(g359.document, "");
  assert.equal(g359.documentNumber, "");
  assert.equal(g359.birthDate || "", "");
  assert.equal(g359.address || "", "");
  assert.equal(g359.docPhotoUrl || null, null);
  assert.equal(g359.googleContactResourceName || null, null);
  assert.equal(g359.googleContactDisplayName, "Fabiana • CorpFlats [UH 509]");
  assert.deepEqual(Array.from(g359.reservationIds || []), [539]);

  // 3. GUEST 20 (João Eduardo) deve estar íntegro e sem o telefone da Fabiana
  assert.ok(g20);
  assert.equal(g20.name, "João Eduardo Leal Correa");
  assert.equal(g20.fullName, "João Eduardo Leal Correa");
  assert.equal(g20.phone, "21970450660");
  assert.deepEqual(Array.from(g20.additionalPhones || []), []);
  assert.equal(g20.email, "joao.educorrea@gmail.com");
  assert.equal(g20.document, "02393056718");
  assert.equal(g20.address, "Rua Dora Bria, 155");
  assert.equal(g20.googleContactResourceName, "people/c5362578501072660427");
  assert.deepEqual(Array.from(g20.reservationIds || []), [486]);

  // 4. E-mail agendado para joao.educorrea@gmail.com na reserva 539 deve ter sido cancelado e removido da fila
  assert.equal(contaminatedEmailItem.status, "cancelled");
  assert.equal(mockDb.emailQueue.length, 0);

  // 5. Caller ID Contact Data deve gerar nomes e números corretos para ambos
  const fabianaContact = buildGuestCallerIdContactData(mockDb, g359);
  assert.equal(fabianaContact.displayName, "Fabiana • CorpFlats [UH 509]");
  assert.equal(fabianaContact.e164Phone, "+5528999136926");

  const joaoContact = buildGuestCallerIdContactData(mockDb, g20);
  assert.ok(joaoContact.displayName.startsWith("João Eduardo Leal Correa • CorpFlats"));
  assert.equal(joaoContact.e164Phone, "+5521970450660");
});

test("4. Incidente GUEST 145 (Leonardo Portugal Federici vs Leonardo Primo/Rodrigues/Francine), GUEST 146 (Rodinei/Fabiano) e GUEST 33 (Miller vs Ordem de Serviço)", () => {
  const { reconcileAndMergeGuests } = loadReconciliationSandbox();

  const mockDb = {
    guests: [
      {
        id: 10,
        guestCode: "HOSP-00010",
        name: "Francine Dias de Castro e Silva",
        fullName: "Francine Dias de Castro e Silva",
        phone: "22999746677",
        additionalPhones: ["22999746677", "28981141553"],
        email: "francinedcastro@gmail.com",
        googleContactResourceName: "people/c3038839061011966662"
      },
      {
        id: 145,
        guestCode: "HOSP-00145",
        name: "Leonardo Primo de Sousa",
        fullName: "Leonardo da Silva Rodrigues",
        phone: "28981141553",
        additionalPhones: ["28981141553", "21964526996", "22997288227"],
        email: "francinedcastro@gmail.com",
        document: "13128818786",
        documentNumber: "13128818786",
        birthDate: "1990-05-10",
        address: "Rua Teste, 10",
        googleContactResourceName: "people/c3038839061011966662",
        googleContactDisplayName: "Leonardo da Silva Rodrigues • CorpFlats [UH 215]"
      },
      {
        id: 146,
        guestCode: "HOSP-00146",
        name: "Mariana Oliveira",
        fullName: "Fabiano",
        phone: "28981141553",
        additionalPhones: ["28981141553", "11988887777"],
        googleContactResourceName: "people/c3038839061011966662",
        googleContactDisplayName: "Leonardo Portugal Federici • CorpFlats [UH 215]"
      },
      {
        id: 33,
        guestCode: "HOSP-00033",
        name: "Ordem de Serviço: Limpeza de filtro de ar condicionado",
        fullName: "Ordem de Serviço: Limpeza de filtro de ar condicionado",
        phone: "22998505276",
        additionalPhones: ["22998505276", "21998079582"],
        email: "millerpessanha@gmail.com",
        document: "12585736792",
        googleContactResourceName: "people/c2459960065624833531",
        googleContactDisplayName: "André Gonçalves • CorpFlats [UH 712]"
      }
    ],
    reservations: [
      {
        id: 544,
        code: "RES-215-0544",
        flatId: 5,
        flatNumber: "215",
        status: "in_house",
        guestId: 145,
        guestCode: "HOSP-00145",
        guestName: "Leonardo Portugal Federici",
        guestPhone: "28981141553",
        guestEmail: "francinedcastro@gmail.com",
        guestDocument: "13128818786",
        fnhrCompleted: true,
        aiVerification: { status: "rejected", reason: "Francine" },
        aiDocInspection: { extractedName: "FRANCINE DIAS" },
        guests: [
          {
            index: 1,
            guestId: 10,
            name: "Francine Dias de Castro e Silva",
            phone: "28981141553",
            email: "francinedcastro@gmail.com",
            cpf: "13128818786",
            hasCompletedCheckin: true
          }
        ]
      }
    ],
    invoices: [],
    guestAccounts: []
  };

  reconcileAndMergeGuests(mockDb);

  const g10 = mockDb.guests.find(g => g.id === 10);
  const g145 = mockDb.guests.find(g => g.id === 145);
  const g146 = mockDb.guests.find(g => g.id === 146);
  const g33 = mockDb.guests.find(g => g.id === 33);
  const r544 = mockDb.reservations.find(r => r.id === 544);

  assert.equal(r544.guestId, 145);
  assert.equal(r544.guestName, "Leonardo Portugal Federici");
  assert.equal(r544.guestPhone, "28981141553");
  assert.equal(r544.guestEmail, "");
  assert.equal(r544.guestDocument, "");
  assert.equal(r544.aiVerification, undefined);
  assert.equal(r544.aiDocInspection, undefined);
  assert.equal(Boolean(r544.fnhrCompleted), false);

  assert.equal(g145.name, "Leonardo Portugal Federici");
  assert.equal(g145.fullName, "Leonardo Portugal Federici");
  assert.equal(g145.phone, "28981141553");
  assert.deepEqual(Array.from(g145.additionalPhones || []), []);
  assert.equal(g145.email, "");
  assert.equal(g145.document, "");
  assert.equal(g145.googleContactResourceName || null, null);
  assert.equal(g145.googleContactDisplayName, "Leonardo Portugal Federici • CorpFlats [UH 215]");

  assert.equal(g10.googleContactResourceName, "people/c3038839061011966662");
  assert.equal((g10.additionalPhones || []).includes("28981141553"), false);

  assert.equal(g146.name, "Fabiano");
  assert.equal(g146.phone, "11988887777");
  assert.equal(g146.googleContactResourceName || null, null);

  assert.equal(g33.name, "Miller Mendonça Pessanha");
  assert.equal(g33.fullName, "Miller Mendonça Pessanha");
  assert.equal(g33.phone, "22998505276");
  assert.deepEqual(Array.from(g33.additionalPhones || []), []);
  assert.equal(g33.googleContactResourceName || null, null);
});

test("5. Regressão Produção: RES-114-0525 / RES-408-0494 / RES-116-0019 ('Leonardo' 1 palavra com CPF/e-mail de Leonardo da Silva Rodrigues) não recontamina GUEST 145 (Leonardo Portugal Federici), acompanhantes de WhatsApp não entram em additionalPhones e Rodinei Siqueira Gonçalves é restaurado", () => {
  const {
    areGuestNamesCompatible,
    isPlaceholderOrEmptyGuestName,
    mergeGuestRecords,
    reconcileAndMergeGuests
  } = loadReconciliationSandbox();

  // Emojis no nome não devem quebrar areGuestNamesCompatible
  assert.equal(areGuestNamesCompatible("🏠 João Eduardo Leal Correa", "João Eduardo Leal Correa"), true);
  // Nomes de Ordem de Serviço não devem ser tratados como placeholder vazio
  assert.equal(isPlaceholderOrEmptyGuestName("Ordem de Serviço: Limpeza de filtro"), false);

  // mergeGuestRecords com source sem id (ex: objeto sintético de reserva) não deve achar que sameGuestId === true
  const targetGuest = { id: 145, name: "Leonardo Portugal Federici", fullName: "Leonardo Portugal Federici", phone: "28981141553", email: "" };
  mergeGuestRecords(targetGuest, { name: "Francine", fullName: "Francine Almeida", email: "francine@test.com", document: "11122233344" });
  assert.equal(targetGuest.name, "Leonardo Portugal Federici");
  assert.equal(targetGuest.fullName, "Leonardo Portugal Federici");
  assert.equal(targetGuest.email, "");

  const mockDb = {
    guests: [
      {
        id: 20,
        guestCode: "HOSP-00020",
        name: "João Eduardo Leal Correa",
        fullName: "João Eduardo Leal Correa",
        phone: "21970450660",
        additionalPhones: ["5521970473174"],
        notes: "Mesma reserva de João",
        email: "joao.educorrea@gmail.com",
        document: "02393056718"
      },
      {
        id: 145,
        guestCode: "HOSP-00145",
        name: "Leonardo Portugal Federici",
        fullName: "Leonardo da Silva Rodrigues",
        phone: "28981141553",
        additionalPhones: ["21992115153"],
        email: "leodsrodriguesuber@gmail.com",
        document: "10699917751",
        documentNumber: "10699917751",
        vehiclePlate: "RMP3E19"
      },
      {
        id: 146,
        guestCode: "HOSP-00146",
        name: "Fabiano",
        fullName: "Fabiano",
        phone: "28981141553"
      }
    ],
    reservations: [
      {
        id: 486,
        code: "RES-605-0486",
        flatNumber: "605",
        status: "completed",
        guestId: 20,
        guestName: "João Eduardo Leal Correa",
        guestPhone: "21970450660",
        guestEmail: "joao.educorrea@gmail.com",
        guestDocument: "02393056718",
        guests: [
          { index: 1, guestId: 20, name: "João Eduardo Leal Correa", phone: "21970450660", cpf: "02393056718" },
          { index: 2, name: "Esposa Acompanhante", phone: "21970473174" }
        ]
      },
      {
        id: 544,
        code: "RES-215-0544",
        flatNumber: "215",
        status: "in_house",
        guestId: 145,
        guestName: "Leonardo Portugal Federici",
        guestPhone: "28981141553",
        guests: [
          { index: 1, guestId: 145, name: "Leonardo Portugal Federici", phone: "28981141553" }
        ]
      },
      {
        id: 525,
        code: "RES-114-0525",
        flatNumber: "114",
        status: "completed",
        guestId: 145,
        guestCode: "HOSP-00145",
        guestName: "Leonardo",
        guestPhone: "21992115153",
        guestEmail: "leodsrodriguesuber@gmail.com",
        guestDocument: "10699917751",
        vehiclePlate: "RMP3E19",
        guests: [
          {
            index: 1,
            guestId: 145,
            name: "Leonardo da Silva Rodrigues",
            phone: "21992115153",
            email: "leodsrodriguesuber@gmail.com",
            cpf: "10699917751"
          }
        ]
      },
      {
        id: 216,
        code: "RES-401-0216",
        flatNumber: "401",
        status: "completed",
        guestId: 146,
        guestName: "Rodinei",
        guestPhone: "27999793259",
        guestEmail: "rodineisg@hotmail.com",
        guestDocument: "05626512714",
        guests: [
          {
            index: 1,
            guestId: 146,
            name: "Rodinei Siqueira Gonçalves",
            phone: "27999793259",
            email: "rodineisg@hotmail.com",
            cpf: "05626512714"
          }
        ]
      }
    ],
    whatsappMessages: [
      {
        id: "msg_comp_1",
        reservationId: 486,
        phone: "5521970473174",
        senderName: "Acompanhante"
      }
    ],
    invoices: [],
    guestAccounts: []
  };

  reconcileAndMergeGuests(mockDb);

  const g20 = mockDb.guests.find(g => g.id === 20);
  const g145 = mockDb.guests.find(g => g.id === 145);
  const r525 = mockDb.reservations.find(r => r.id === 525);
  const gLeoRodrigues = mockDb.guests.find(g => g.id !== 145 && String(g.document || "").replace(/\D/g, "") === "10699917751");
  const gRodinei = mockDb.guests.find(g => String(g.document || "").replace(/\D/g, "") === "05626512714");

  // GUEST 145 deve permanecer 100% despoluído após reconcileAndMergeGuests
  assert.equal(g145.name, "Leonardo Portugal Federici");
  assert.equal(g145.fullName, "Leonardo Portugal Federici");
  assert.equal(g145.phone, "28981141553");
  assert.deepEqual(Array.from(g145.additionalPhones || []), []);
  assert.equal(g145.email, "");
  assert.equal(g145.document, "");
  assert.equal(g145.vehiclePlate, undefined);

  // RES-114-0525 e Leonardo da Silva Rodrigues devem ter seu próprio registro CRM separado
  assert.ok(gLeoRodrigues, "Leonardo da Silva Rodrigues deve ter ficha CRM própria e separada do GUEST 145");
  assert.notEqual(r525.guestId, 145);
  assert.equal(r525.guestId, gLeoRodrigues.id);
  assert.equal(r525.guestName, "Leonardo da Silva Rodrigues");

  // GUEST 20 não deve ter o telefone da acompanhante (21970473174) nem a nota contaminada
  assert.deepEqual(Array.from(g20.additionalPhones || []), []);
  assert.equal(g20.notes, "");

  // Rodinei Siqueira Gonçalves deve estar restaurado com CPF, e-mail, telefone e Google Contact
  assert.ok(gRodinei, "Rodinei Siqueira Gonçalves deve existir no CRM");
  assert.equal(gRodinei.fullName, "Rodinei Siqueira Gonçalves");
  assert.equal(gRodinei.phone, "27999793259");
  assert.equal(gRodinei.email, "rodineisg@hotmail.com");
  assert.equal(gRodinei.googleContactResourceName, "people/c8949956793977234769");
});

test("6. Frontend (pms-calendar.tsx) & Backend (PUT /api/pms/reservations/:id): desvincular hóspede não faz fallback para selectedRes.guestId", () => {
  assert.ok(
    calendarSrc.includes("export function areGuestNamesCompatibleUI"),
    "pms-calendar.tsx deve exportar areGuestNamesCompatibleUI"
  );
  assert.ok(
    calendarSrc.includes("surnamesB.some(t => surnamesA.has(t))"),
    "areGuestNamesCompatibleUI deve exigir sobrenome em comum quando ambos os nomes possuem sobrenome"
  );
  assert.ok(
    calendarSrc.includes("guestId: resolvedGuest1Id"),
    "handleSaveRes deve usar resolvedGuest1Id que respeita 'manual' como null sem cair em selectedRes.guestId"
  );
  assert.ok(
    serverSrc.includes("isGuestUnlinkedOrSwitched"),
    "PUT /api/pms/reservations/:id deve detectar desvinculação/troca de hóspede e limpar dados residuais do hóspede anterior"
  );
});


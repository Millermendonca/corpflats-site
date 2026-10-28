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

  const codeSlice = serverSrc
    .slice(startIdx, endIdx)
    .replace(/export\s+function\s+/g, "function ");

  const sandbox = {
    db: { guests: [], reservations: [], invoices: [], guestAccounts: [] },
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(
    `${codeSlice}\nthis.exports = { normalizeName, isPlaceholderOrEmptyGuestName, areGuestNamesCompatible, mergeGuestRecords, healContaminatedGuestAndReservationLinks, reconcileAndMergeGuests };`,
    sandbox
  );
  return sandbox.exports;
}

test("1. areGuestNamesCompatible: bloqueia fusão entre pessoas distintas (Leonardo Portugal vs Francine) e permite variações legítimas", () => {
  const { areGuestNamesCompatible } = loadReconciliationSandbox();

  assert.equal(areGuestNamesCompatible("Leonardo Portugal", "Francine"), false);
  assert.equal(areGuestNamesCompatible("Leonardo Portugal", "Francine Silva"), false);
  assert.equal(areGuestNamesCompatible("Francine Oliveira", "Leonardo"), false);

  assert.equal(areGuestNamesCompatible("Leonardo Portugal", "Leonardo"), true);
  assert.equal(areGuestNamesCompatible("Leonardo", "Leonardo Portugal"), true);
  assert.equal(areGuestNamesCompatible("Hóspede 1", "Leonardo Portugal"), true);
  assert.equal(areGuestNamesCompatible("Hóspede a definir", "Francine"), true);
  assert.equal(areGuestNamesCompatible("", "Leonardo Portugal"), true);
});

test("2. Incidente Flat 215 (Leonardo Portugal vs Francine): autocura separa fichas CRM, restaura nome/telefone e expurga e-mail/CPF/endereço da Francine", () => {
  const { reconcileAndMergeGuests } = loadReconciliationSandbox();

  // Simula exatamente o estado contaminado relatado:
  // - Francine (guestId 42) teve o telefone trocado para o WhatsApp do Leonardo (22999112233) ou salvo em additionalPhones,
  //   e depois o usuário corrigiu o telefone da Francine para 22988776655.
  // - A reserva do Flat 215 (criada para Leonardo Portugal) ficou vinculada ao guestId 42 (Francine),
  //   voltou para o nome de Francine, puxou o e-mail francine@email.com, CPF e endereço dela.
  const mockDb = {
    guests: [
      {
        id: 42,
        guestCode: "HOSP-00042",
        name: "Francine",
        fullName: "Francine Almeida",
        phone: "22999112233", // número do Leonardo que havia entrado por engano
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

  // 1. Reserva do Flat 215 deve estar no nome de Leonardo Portugal, desvinculada da Francine e sem dados dela
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

  // 2. Ficha da Francine deve preservar o nome dela, telefone correto dela (22988776655) e NÃO conter o telefone do Leonardo em additionalPhones
  assert.ok(francine, "Ficha da Francine deve continuar existindo");
  assert.equal(francine.fullName, "Francine Almeida");
  assert.equal(francine.phone, "22988776655");
  assert.equal(
    (francine.additionalPhones || []).some(p => String(p).includes("999112233")),
    false,
    "Telefone do Leonardo deve ter sido removido de additionalPhones da Francine"
  );

  // 3. Ficha própria do Leonardo Portugal deve existir separada e vinculada à reserva do Flat 215
  assert.ok(leonardo, "Ficha separada do Leonardo Portugal deve ter sido criada");
  assert.equal(r215.guestId, leonardo.id);
  assert.equal(leonardo.phone, "22999112233");
  assert.equal(leonardo.email || "", "");
  assert.equal(leonardo.address, undefined);
});

test("3. Frontend (pms-calendar.tsx) & Backend (PUT /api/pms/reservations/:id): desvincular hóspede não faz fallback para selectedRes.guestId", () => {
  assert.ok(
    calendarSrc.includes("export function areGuestNamesCompatibleUI"),
    "pms-calendar.tsx deve exportar areGuestNamesCompatibleUI"
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

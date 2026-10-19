import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Verificação Pontual: Busca e Cadastro de Solicitante Terceiro e 2º/3º Hóspedes no CRM", () => {
  const rootDir = process.cwd();
  const scriptServer = path.join(rootDir, "scripts", "demo-server.mjs");
  const artifactServer = path.join(rootDir, "artifacts", "api-server", "demo-server.mjs");
  const calendarFile = path.join(rootDir, "artifacts", "limpeza", "src", "pages", "pms-calendar.tsx");

  test("1. Paridade byte-a-byte estrita entre scripts/demo-server.mjs e artifacts/api-server/demo-server.mjs", () => {
    const b1 = fs.readFileSync(scriptServer);
    const b2 = fs.readFileSync(artifactServer);
    assert.strictEqual(b1.equals(b2), true, "demo-server.mjs deve ser idêntico em scripts e artifacts/api-server");
  });

  test("2. demo-server.mjs contém lógica de upsert e vínculo de Solicitante Terceiro e Hóspedes Acompanhantes (2º e 3º) em db.guests", () => {
    const code = fs.readFileSync(scriptServer, "utf8");
    assert.ok(code.includes("requesterType === \"other_person\""), "Deve verificar requesterType === 'other_person'");
    assert.ok(code.includes("solicitante_terceiro"), "Deve marcar a tag solicitante_terceiro");
    assert.ok(code.includes("finalRequesterInfo.guestId = reqGuest.id"), "Deve vincular guestId no finalRequesterInfo");
    assert.ok(code.includes("r.requesterInfo.guestId = reqGuest.id"), "Deve vincular guestId na atualização de reserva");
    assert.ok(code.includes("resolvedExtraGuestId = extraGuest.id"), "Deve fazer upsert e vincular guestId dos acompanhantes na criação");
    assert.ok(code.includes("gItem.guestId = extraGuest.id"), "Deve fazer upsert e vincular guestId dos acompanhantes na edição");
  });

  test("3. pms-calendar.tsx contém busca no CRM, select e campos completos para Solicitante Terceiro e 2º/3º Hóspedes", () => {
    const code = fs.readFileSync(calendarFile, "utf8");
    assert.ok(code.includes("formRequesterId"), "Deve conter estado formRequesterId");
    assert.ok(code.includes("requesterSearchFilter"), "Deve conter estado requesterSearchFilter");
    assert.ok(code.includes("handleSelectRequester"), "Deve conter função handleSelectRequester");
    assert.ok(code.includes("Buscar Solicitante Cadastrado (CRM 360°)"), "Deve conter bloco de busca do Solicitante no CRM");

    assert.ok(code.includes("formGuest2Id"), "Deve conter estado formGuest2Id");
    assert.ok(code.includes("guest2SearchFilter"), "Deve conter estado guest2SearchFilter");
    assert.ok(code.includes("handleSelectGuest2"), "Deve conter função handleSelectGuest2");
    assert.ok(code.includes("filteredGuests2"), "Deve conter memo filteredGuests2");
    assert.ok(code.includes("liveGuest2Matches"), "Deve conter memo liveGuest2Matches");
    assert.ok(code.includes("Buscar 2º Hóspede Cadastrado (CRM 360°)"), "Deve conter bloco de busca do 2º Hóspede no CRM");

    assert.ok(code.includes("formGuest3Id"), "Deve conter estado formGuest3Id");
    assert.ok(code.includes("handleSelectGuest3"), "Deve conter função handleSelectGuest3");
    assert.ok(code.includes("Buscar 3º Hóspede Cadastrado (CRM 360°)"), "Deve conter bloco de busca do 3º Hóspede no CRM");
    assert.ok(code.includes("handleSaveAdditionalGuestToCrm"), "Deve conter função handleSaveAdditionalGuestToCrm");
  });
});

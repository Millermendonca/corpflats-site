process.env.NODE_ENV = "test";

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

console.log("🧪 Iniciando teste pontual: Fluxo de Marcação de Fumo na Limpeza da Camareira, Cadastro e Reservas Futuras...");

const serverPath = path.resolve("artifacts/api-server/demo-server.mjs");
const mirrorServerPath = path.resolve("scripts/demo-server.mjs");
const flatCardPath = path.resolve("artifacts/limpeza/src/components/flat-card.tsx");
const pmsCalendarPath = path.resolve("artifacts/limpeza/src/pages/pms-calendar.tsx");
const hoverCardPath = path.resolve("artifacts/limpeza/src/components/reservation-hover-card.tsx");
const crmGuestsPath = path.resolve("artifacts/limpeza/src/pages/crm-guests.tsx");

// ----------------------------------------------------------------------------
// 1. Paridade byte-a-byte entre arquivos espelhados (Twin Parity)
// ----------------------------------------------------------------------------
{
  assert.equal(
    fs.readFileSync(serverPath).equals(fs.readFileSync(mirrorServerPath)),
    true,
    "scripts/demo-server.mjs deve ser idêntico a artifacts/api-server/demo-server.mjs"
  );
  console.log("✅ 1. Paridade byte-a-byte verificada entre artifacts/api-server e scripts/.");
}

// ----------------------------------------------------------------------------
// 2. Verificação estática das diretrizes de UI (R1 e R2)
// ----------------------------------------------------------------------------
{
  const flatCardSrc = fs.readFileSync(flatCardPath, "utf8");

  // R1: Pergunta em destaque ocupando a área do card sem modal
  assert.ok(
    flatCardSrc.includes("showSmokingPrompt"),
    "FlatCard deve conter o estado showSmokingPrompt para a pergunta destacada"
  );
  assert.ok(
    flatCardSrc.includes('data-smoking-prompt="true"'),
    "FlatCard deve renderizar o container data-smoking-prompt"
  );
  assert.ok(
    flatCardSrc.includes("absolute inset-0 z-30"),
    "Container da pergunta deve ocupar 100% da área do card naquele momento (absolute inset-0)"
  );
  assert.ok(
    flatCardSrc.includes("O hóspede fumou no quarto?"),
    "Pergunta em destaque deve indagar claramente se o hóspede fumou no quarto"
  );
  assert.ok(
    flatCardSrc.includes("Sim, fumou") && flatCardSrc.includes("Não fumou"),
    "Deve fornecer opções claras para 'Sim, fumou' e 'Não fumou'"
  );
  assert.ok(
    flatCardSrc.includes("handleFinishCleaningWithSmoking"),
    "Deve concluir diretamente a limpeza com a resposta informada sem modal extra"
  );
  assert.ok(
    flatCardSrc.includes("whitespace-nowrap flex-nowrap"),
    "Botões de fumo devem possuir proteção contra quebra de linha em telas estreitas (< 340px)"
  );

  // R2: Indicador interativo e correção da marcação no card
  assert.ok(
    flatCardSrc.includes('data-smoking-badge="true"'),
    "FlatCard deve conter o badge data-smoking-badge='true' para visualização do fumo"
  );
  assert.ok(
    flatCardSrc.includes("handleToggleSmoking"),
    "FlatCard deve permitir alternar ou desmarcar a seleção diretamente no card"
  );
  assert.ok(
    flatCardSrc.includes("/api/cleaning/assignments") && flatCardSrc.includes("/smoking"),
    "FlatCard deve chamar o endpoint dedicado de fumo para alternar/desmarcar"
  );
  assert.ok(
    flatCardSrc.includes("stayoverSmokedInRoom"),
    "FlatCard deve suportar confirmação de fumo também na limpeza stayover"
  );

  console.log("✅ 2. Verificação estática de UI em FlatCard aprovada (R1 e R2).");
}

// ----------------------------------------------------------------------------
// 3. Verificação estática das sinalizações de reservas futuras e CRM (R3)
// ----------------------------------------------------------------------------
{
  const pmsSrc = fs.readFileSync(pmsCalendarPath, "utf8");
  const hoverSrc = fs.readFileSync(hoverCardPath, "utf8");
  const crmSrc = fs.readFileSync(crmGuestsPath, "utf8");

  assert.ok(
    pmsSrc.includes('data-smoker-alert-badge="true"') && pmsSrc.includes("🚬 Fumante"),
    "PMS Calendar deve conter sinalização visual para equipe na linha do tempo"
  );
  assert.ok(
    pmsSrc.includes("Hóspede Fumante"),
    "PMS Calendar deve exibir indicador de hóspede fumante na modal da reserva"
  );
  assert.ok(
    pmsSrc.includes("pms_calendar_updated"),
    "PMS Calendar deve escutar o evento pms_calendar_updated para sincronização instantânea na mesma aba"
  );
  assert.ok(
    hoverSrc.includes("Hóspede Fumante"),
    "Reservation Hover Card deve exibir o alerta para a equipe"
  );
  assert.ok(
    crmSrc.includes("🚬 Fumante") || crmSrc.includes("Hóspede Fumante"),
    "CRM de Hóspedes deve exibir o status de fumante no perfil/cadastro do hóspede"
  );

  console.log("✅ 3. Verificação estática das sinalizações visuais no PMS, Hover Card e CRM aprovada (R3).");
}

// ----------------------------------------------------------------------------
// 4. Teste funcional real com importação de updateSmokingStatusForCleaning
// ----------------------------------------------------------------------------
async function runRealBackendTests() {
  const { updateSmokingStatusForCleaning, httpServer } = await import("../artifacts/api-server/demo-server.mjs");

  assert.equal(
    typeof updateSmokingStatusForCleaning,
    "function",
    "updateSmokingStatusForCleaning deve ser uma função exportada pelo demo-server.mjs"
  );

  const testDb = {
    cleaningRequests: [
      {
        id: 701,
        flatId: 101,
        flatNumber: "101",
        requestDate: "2026-11-04",
        status: "cleaning_now",
        reservationId: "RES-101-0001",
        leavingGuest: "Carlos Drummond de Andrade"
      },
      {
        id: 702,
        flatId: 202,
        flatNumber: "202",
        requestDate: "2026-11-04",
        status: "cleaning_now",
        reservationId: null,
        leavingGuest: "Clarice Lispector"
      },
      {
        id: 703,
        flatId: 303,
        flatNumber: "303",
        requestDate: "2026-11-04",
        status: "cleaning_now",
        reservationId: "RES-303-0003",
        leavingGuest: "José Saramago"
      }
    ],
    reservations: [
      {
        id: "RES-101-0001",
        code: "RES-101-0001",
        flatId: 101,
        flatNumber: "101",
        guestId: 77,
        guestName: "Carlos Drummond de Andrade",
        guestDocument: "11122233344",
        checkinDate: "2026-11-01",
        checkoutDate: "2026-11-04",
        status: "confirmada"
      },
      {
        id: "RES-FUTURE-0002",
        code: "RES-FUTURE-0002",
        flatId: 202,
        flatNumber: "202",
        guestId: 77,
        guestName: "Carlos Drummond de Andrade",
        guestDocument: "11122233344",
        checkinDate: "2026-12-10",
        checkoutDate: "2026-12-15",
        status: "confirmada"
      },
      {
        id: "RES-FUTURE-CLARICE",
        code: "RES-FUTURE-CLARICE",
        flatId: 404,
        flatNumber: "404",
        guestName: "Clarice Lispector",
        checkinDate: "2026-12-01",
        checkoutDate: "2026-12-05",
        status: "confirmada"
      },
      {
        id: "RES-303-0003",
        code: "RES-303-0003",
        flatId: 303,
        flatNumber: "303",
        guestId: 88,
        guestName: "José Saramago",
        checkinDate: "2026-11-01",
        checkoutDate: "2026-11-04",
        status: "confirmada"
      },
      {
        id: 9999, // ID numérico vs string
        code: "RES-FUTURE-JOSE",
        flatId: 505,
        flatNumber: "505",
        guestId: "88", // ID string vs número
        guestName: "Jose Saramago", // Sem acento
        checkinDate: "2026-12-20",
        checkoutDate: "2026-12-25",
        status: "confirmada"
      },
      {
        id: "RES-ACCOMPANYING",
        code: "RES-ACCOMPANYING",
        flatId: 606,
        flatNumber: "606",
        guestName: "Fernando Pessoa",
        guests: [
          { name: "Carlos Drummond de Andrade", cpf: "11122233344" }
        ],
        checkinDate: "2026-12-28",
        checkoutDate: "2026-12-30",
        status: "confirmada"
      }
    ],
    guests: [
      {
        id: 77,
        guestCode: "HOSP-00077",
        name: "Carlos Drummond",
        fullName: "Carlos Drummond de Andrade",
        document: "111.222.333-44",
        documentNumber: "11122233344",
        tags: ["VIP"]
      },
      {
        id: 88,
        guestCode: "HOSP-00088",
        name: "José Saramago",
        fullName: "José Saramago",
        tags: []
      }
    ]
  };

  const maidUser = { name: "Maria Camareira", role: "camareira" };

  // 4.1. Marcação normal de fumo (isSmoker = true)
  const req1 = testDb.cleaningRequests[0];
  updateSmokingStatusForCleaning(req1, true, maidUser, "2026-11-04", testDb);

  assert.equal(req1.smokedInRoom, true, "req1.smokedInRoom deve ser true");
  assert.equal(req1.guestSmoked, true, "req1.guestSmoked deve ser true");
  assert.equal(testDb.reservations[0].smokedInRoom, true, "Reserva atual deve ter smokedInRoom = true");
  assert.equal(testDb.reservations[0].isSmoker, true, "Reserva atual deve ter isSmoker = true");

  const guestCarlos = testDb.guests.find(g => g.id === 77);
  assert.equal(guestCarlos.isSmoker, true, "Cadastro do hóspede deve estar marcado como fumante");
  assert.ok(guestCarlos.tags.includes("Fumante"), "Tags do hóspede deve incluir 'Fumante'");

  const futureResCarlos = testDb.reservations.find(r => r.code === "RES-FUTURE-0002");
  assert.equal(futureResCarlos.isSmoker, true, "Reserva futura deve ter isSmoker = true");
  assert.equal(futureResCarlos.smokerGuestAlert, true, "Reserva futura deve ter smokerGuestAlert = true");
  assert.ok(futureResCarlos.smokingAlert.includes("histórico de fumo"), "Reserva futura deve ter smokingAlert");

  const accompanyingRes = testDb.reservations.find(r => r.code === "RES-ACCOMPANYING");
  assert.equal(accompanyingRes.isSmoker, true, "Reserva futura com hóspede como acompanhante deve receber alerta");

  console.log("✅ 4.1. Marcação de fumo: atualizou card, cadastro do hóspede e reservas futuras (inclusive acompanhante).");

  // 4.2. Reversão da marcação (isSmoker = false)
  updateSmokingStatusForCleaning(req1, false, maidUser, "2026-11-04", testDb);

  assert.equal(req1.smokedInRoom, false, "req1.smokedInRoom deve reverter para false");
  assert.equal(req1.guestSmoked, false, "req1.guestSmoked deve reverter para false");
  assert.equal(testDb.reservations[0].isSmoker, false, "Reserva atual deve ter isSmoker = false");
  assert.equal(guestCarlos.isSmoker, false, "Cadastro do hóspede deve reverter isSmoker para false");
  assert.equal(guestCarlos.tags.includes("Fumante"), false, "Tag 'Fumante' deve ser removida");
  assert.equal(futureResCarlos.isSmoker, false, "Reserva futura deve reverter isSmoker para false");
  assert.equal(futureResCarlos.smokerGuestAlert, false, "Reserva futura deve desativar alerta");
  assert.equal(futureResCarlos.smokingAlert, undefined, "Alerta deve ser removido da reserva futura");
  assert.equal(accompanyingRes.isSmoker, false, "Alerta de acompanhante deve ser revertido");

  console.log("✅ 4.2. Reversão da indicação: limpou card, cadastro e reservas futuras com sucesso.");

  // 4.3. Alternância reativa (marcar novamente)
  updateSmokingStatusForCleaning(req1, true, maidUser, "2026-11-04", testDb);
  assert.equal(guestCarlos.isSmoker, true);
  assert.equal(futureResCarlos.isSmoker, true);
  console.log("✅ 4.3. Alternância reativa: re-marcou cadastro e reservas futuras com sucesso.");

  // 4.4. Limpeza avulsa/manual sem reserva anterior (res = null, leavingGuest = "Clarice Lispector")
  const req2 = testDb.cleaningRequests[1];
  updateSmokingStatusForCleaning(req2, true, maidUser, "2026-11-04", testDb);

  const guestClarice = testDb.guests.find(g => g.name === "Clarice Lispector" || g.fullName === "Clarice Lispector");
  assert.ok(guestClarice, "Deve criar o cadastro do hóspede em db.guests mesmo sem reserva vinculada");
  assert.equal(guestClarice.isSmoker, true, "Novo hóspede deve ter isSmoker = true");
  assert.ok(guestClarice.tags.includes("Fumante"), "Novo hóspede deve receber tag 'Fumante'");

  const futureResClarice = testDb.reservations.find(r => r.code === "RES-FUTURE-CLARICE");
  assert.equal(futureResClarice.isSmoker, true, "Reserva futura de Clarice deve ser sinalizada como fumante");

  console.log("✅ 4.4. Limpeza avulsa sem reserva: criou cadastro em db.guests e propagou para reservas futuras.");

  // 4.5. Normalização de acentos e tipos de ID mistos (José Saramago vs Jose Saramago, ID string vs número)
  const req3 = testDb.cleaningRequests[2];
  updateSmokingStatusForCleaning(req3, true, maidUser, "2026-11-04", testDb);

  const guestJose = testDb.guests.find(g => g.id === 88);
  assert.equal(guestJose.isSmoker, true, "José Saramago deve ter isSmoker = true");

  const futureJose = testDb.reservations.find(r => r.code === "RES-FUTURE-JOSE");
  assert.equal(futureJose.isSmoker, true, "Reserva futura com 'Jose' (sem acento) deve ser localizada e sinalizada");

  console.log("✅ 4.5. Normalização de acentos e tipos mistos de ID validada com 100% de precisão.");

  if (httpServer && typeof httpServer.close === "function") {
    httpServer.close();
  }

  console.log("\n🎉 TODOS OS TESTES PONTUAIS DE FUMO NA LIMPEZA PASSARAM COM 100% DE SUCESSO!");
  process.exit(0);
}

runRealBackendTests().catch(err => {
  console.error("❌ Falha no teste real:", err);
  process.exit(1);
});

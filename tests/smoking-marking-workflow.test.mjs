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
const pmsReportsPath = path.resolve("artifacts/limpeza/src/pages/pms-reports.tsx");
const liveOpsPath = path.resolve("artifacts/limpeza/src/pages/live-operations-panel.tsx");

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
  assert.ok(
    !flatCardSrc.includes("handleStatusChange") || !flatCardSrc.slice(flatCardSrc.indexOf("handleStatusChange")).split("submitCompletion")[0].includes("/api/cleaning/requests/manual"),
    "handleStatusChange não deve invocar /api/cleaning/requests/manual (previne erro 403 para camareiras)"
  );
  assert.ok(
    !flatCardSrc.includes("handleConfirmStayoverClean") || !flatCardSrc.slice(flatCardSrc.indexOf("handleConfirmStayoverClean")).split("instructionsModalOpen")[0].includes("/api/cleaning/requests/manual"),
    "handleConfirmStayoverClean não deve invocar /api/cleaning/requests/manual (previne erro 403 para camareiras)"
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
  const pmsReportsSrc = fs.readFileSync(pmsReportsPath, "utf8");
  const liveOpsSrc = fs.readFileSync(liveOpsPath, "utf8");

  assert.ok(
    pmsSrc.includes("Hóspede Fumante"),
    "PMS Calendar deve exibir indicador de hóspede fumante exclusivamente na modal de detalhes da reserva"
  );
  assert.ok(
    !pmsSrc.includes('data-smoker-alert-badge="true"'),
    "PMS Calendar não deve exibir badge de fumante na barra da grade do mapa de reservas"
  );
  assert.ok(
    pmsSrc.includes("pms_calendar_updated"),
    "PMS Calendar deve escutar o evento pms_calendar_updated para sincronização instantânea na mesma aba"
  );
  assert.ok(
    !hoverSrc.includes("Hóspede Fumante"),
    "Reservation Hover Card não deve exibir o alerta de fumante"
  );
  assert.ok(
    crmSrc.includes("🚬 Fumante") || crmSrc.includes("Hóspede Fumante"),
    "CRM de Hóspedes deve exibir o status de fumante no perfil/cadastro do hóspede"
  );
  assert.ok(
    !pmsReportsSrc.includes("🚬 Fumante"),
    "PMS Reports não deve exibir badge de fumante nos relatórios"
  );
  assert.ok(
    !liveOpsSrc.includes('data-smoker-alert-badge="true"'),
    "Painel Ao Vivo (Live Operations) não deve exibir badge de fumante"
  );

  console.log("✅ 3. Verificação estática do escopo estrito (apenas Cadastro do Hóspede e Detalhes da Reserva) aprovada (R3).");
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

  // 4.6. Prevenção de poluição de cadastro esqueleto em limpezas sem fumo
  const guestCountBefore = testDb.guests.length;
  const reqNoSmoke = {
    id: 704,
    flatId: 707,
    flatNumber: "707",
    requestDate: "2026-11-04",
    status: "cleaning_now",
    reservationId: "RES-NO-SMOKE",
    leavingGuest: "Machado de Assis"
  };
  testDb.cleaningRequests.push(reqNoSmoke);
  testDb.reservations.push({
    id: "RES-NO-SMOKE",
    code: "RES-NO-SMOKE",
    flatId: 707,
    flatNumber: "707",
    guestName: "Machado de Assis",
    checkinDate: "2026-11-01",
    checkoutDate: "2026-11-04",
    status: "confirmada"
  });
  updateSmokingStatusForCleaning(reqNoSmoke, false, maidUser, "2026-11-04", testDb);
  assert.equal(testDb.guests.length, guestCountBefore, "Limpeza sem fumo não deve poluir db.guests com cadastros esqueletos");
  console.log("✅ 4.6. Limpeza sem fumo não gerou poluição de cadastro esqueleto em db.guests.");

  // 4.7. Correlação de reservas futuras por telefone e e-mail mesmo com nome diferente e sem CPF (Ledger Item 4)
  const reqPhone = {
    id: 705,
    flatId: 808,
    flatNumber: "808",
    requestDate: "2026-11-04",
    status: "cleaning_now",
    reservationId: "RES-PHONE-1",
    leavingGuest: "Guimaraes Rosa"
  };
  testDb.cleaningRequests.push(reqPhone);
  testDb.reservations.push({
    id: "RES-PHONE-1",
    code: "RES-PHONE-1",
    flatId: 808,
    flatNumber: "808",
    guestName: "Guimaraes Rosa",
    guestPhone: "21999887766",
    checkinDate: "2026-11-01",
    checkoutDate: "2026-11-04",
    status: "confirmada"
  });
  testDb.reservations.push({
    id: "RES-FUTURE-PHONE",
    code: "RES-FUTURE-PHONE",
    flatId: 909,
    flatNumber: "909",
    guestName: "J. G. Rosa", // Nome diferente/abreviado, sem CPF, mas mesmo telefone
    guestPhone: "21999887766",
    checkinDate: "2026-12-15",
    checkoutDate: "2026-12-20",
    status: "confirmada"
  });
  updateSmokingStatusForCleaning(reqPhone, true, maidUser, "2026-11-04", testDb);
  const futureResPhone = testDb.reservations.find(r => r.code === "RES-FUTURE-PHONE");
  assert.equal(futureResPhone.isSmoker, true, "Reserva futura com nome abreviado/diferente mas mesmo telefone deve ser correlacionada");
  assert.equal(futureResPhone.smokerGuestAlert, true, "Alerta deve ser ativado na reserva futura correlacionada por telefone");
  console.log("✅ 4.7. Correlação de reservas futuras por telefone/e-mail sem CPF validada com sucesso.");

  // 4.8. Correlação com variação de DDI/DDD no telefone (+55 21 99988-7766 vs (21) 99988-7766)
  const reqDdi = {
    id: 706,
    flatId: 810,
    flatNumber: "810",
    requestDate: "2026-11-04",
    status: "cleaning_now",
    reservationId: "RES-DDI-1",
    leavingGuest: "Ariano Suassuna"
  };
  testDb.cleaningRequests.push(reqDdi);
  testDb.reservations.push({
    id: "RES-DDI-1",
    code: "RES-DDI-1",
    flatId: 810,
    flatNumber: "810",
    guestName: "Ariano Suassuna",
    guestPhone: "5581988776655", // Com código de país 55
    checkinDate: "2026-11-01",
    checkoutDate: "2026-11-04",
    status: "confirmada"
  });
  testDb.reservations.push({
    id: "RES-FUTURE-DDI",
    code: "RES-FUTURE-DDI",
    flatId: 811,
    flatNumber: "811",
    guestName: "A. Suassuna", // Abreviado
    guestPhone: "81988776655", // Sem código 55
    checkinDate: "2026-12-20",
    checkoutDate: "2026-12-25",
    status: "confirmada"
  });
  updateSmokingStatusForCleaning(reqDdi, true, maidUser, "2026-11-04", testDb);
  const futureResDdi = testDb.reservations.find(r => r.code === "RES-FUTURE-DDI");
  assert.equal(futureResDdi.isSmoker, true, "Reserva futura com formato telefônico com/sem DDI 55 deve ser correlacionada");
  console.log("✅ 4.8. Correlação com variação de DDI (+55 81 vs 81) validada com sucesso.");

  // 4.9. Correlação por compatibilidade de nomes com tokens compostos
  const reqNameCompat = {
    id: 707,
    flatId: 812,
    flatNumber: "812",
    requestDate: "2026-11-04",
    status: "cleaning_now",
    reservationId: "RES-NAME-1",
    leavingGuest: "Cecília Benevides de Carvalho Meireles"
  };
  testDb.cleaningRequests.push(reqNameCompat);
  testDb.reservations.push({
    id: "RES-NAME-1",
    code: "RES-NAME-1",
    flatId: 812,
    flatNumber: "812",
    guestName: "Cecília Benevides de Carvalho Meireles",
    checkinDate: "2026-11-01",
    checkoutDate: "2026-11-04",
    status: "confirmada"
  });
  testDb.reservations.push({
    id: "RES-FUTURE-NAME",
    code: "RES-FUTURE-NAME",
    flatId: 813,
    flatNumber: "813",
    guestName: "Cecilia Meireles", // Nome resumido
    checkinDate: "2026-12-10",
    checkoutDate: "2026-12-14",
    status: "confirmada"
  });
  updateSmokingStatusForCleaning(reqNameCompat, true, maidUser, "2026-11-04", testDb);
  const futureResName = testDb.reservations.find(r => r.code === "RES-FUTURE-NAME");
  assert.equal(futureResName.isSmoker, true, "Reserva futura com nome resumido/composto deve ser correlacionada via areGuestNamesCompatible");
  console.log("✅ 4.9. Correlação por compatibilidade de nomes compostos e acentuação validada com sucesso.");

  // 4.10. Preservação de status de fumo multi-estadias quando há outra estadia anterior com histórico
  // Carlos fumou na estadia anterior (req1 está true). Agora Carlos tem uma 2ª estadia onde não fumou.
  // Criamos uma 2ª limpeza (reqCarlosStay2) com fumo = false.
  const reqCarlosStay2 = {
    id: 708,
    flatId: 814,
    flatNumber: "814",
    requestDate: "2026-11-05",
    status: "cleaning_now",
    reservationId: "RES-CARLOS-STAY2",
    leavingGuest: "Carlos Drummond de Andrade"
  };
  testDb.cleaningRequests.push(reqCarlosStay2);
  testDb.reservations.push({
    id: "RES-CARLOS-STAY2",
    code: "RES-CARLOS-STAY2",
    flatId: 814,
    flatNumber: "814",
    guestId: 77,
    guestName: "Carlos Drummond de Andrade",
    guestDocument: "11122233344",
    checkinDate: "2026-11-04",
    checkoutDate: "2026-11-05",
    status: "confirmada"
  });
  // Camareira finaliza a 2ª estadia informando "Não fumou"
  updateSmokingStatusForCleaning(reqCarlosStay2, false, maidUser, "2026-11-05", testDb);
  // Como req1 (1ª estadia) registrou fumo, o cadastro de Carlos em db.guests e suas reservas futuras devem permanecer com alerta!
  const guestCarlosAfterStay2 = testDb.guests.find(g => g.id === 77);
  assert.equal(guestCarlosAfterStay2.isSmoker, true, "Hóspede deve manter status de fumante porque a 1ª estadia registrou fumo");
  const futureCarlosAfterStay2 = testDb.reservations.find(r => r.code === "RES-FUTURE-0002");
  assert.equal(futureCarlosAfterStay2.isSmoker, true, "Reserva futura deve preservar o alerta devido ao histórico anterior");
  console.log("✅ 4.10. Preservação de histórico de fumo multi-estadias validada com sucesso.");

  // 4.11. Prevenção de falso positivo por placeholder "Hóspede 2" ou telefone corporativo B2B de outro hóspede
  testDb.reservations.push({
    id: "RES-UNRELATED-PLACEHOLDER",
    code: "RES-UNRELATED-PLACEHOLDER",
    flatId: 512,
    flatNumber: "512",
    guestId: 77, // Mesmo guestId corporativo/agência, mas hóspede titular diferente
    guestName: "Iago Fernandes Zioto de Freitas",
    guestPhone: "21999887766", // Mesmo telefone de agência
    guests: [
      { index: 1, name: "Iago Fernandes Zioto de Freitas" },
      { index: 2, name: "Hóspede 2" }
    ],
    checkinDate: "2026-12-20",
    checkoutDate: "2026-12-25",
    status: "confirmada"
  });
  updateSmokingStatusForCleaning(req1, true, maidUser, "2026-11-04", testDb);
  const unrelatedRes = testDb.reservations.find(r => r.code === "RES-UNRELATED-PLACEHOLDER");
  assert.equal(Boolean(unrelatedRes.isSmoker), false, "Reserva de outro hóspede com placeholder 'Hóspede 2' ou telefone corporativo jamás deve ser marcada como fumante");
  assert.equal(Boolean(unrelatedRes.smokerGuestAlert), false, "Reserva de outro hóspede jamais deve receber alerta de fumante");
  console.log("✅ 4.11. Proteção anti-falso-positivo (Hóspede 2 / Telefone corporativo B2B) validada com sucesso.");

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

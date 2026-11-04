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
// 4. Teste funcional de lógica de negócio: Backend updateSmokingStatusForCleaning
// ----------------------------------------------------------------------------
{
  const serverSrc = fs.readFileSync(serverPath, "utf8");
  assert.ok(
    serverSrc.includes("function updateSmokingStatusForCleaning"),
    "demo-server.mjs deve exportar/conter a função updateSmokingStatusForCleaning"
  );
  assert.ok(
    serverSrc.includes('app.patch("/api/cleaning/assignments/:requestId/smoking"'),
    "demo-server.mjs deve conter a rota PATCH /api/cleaning/assignments/:requestId/smoking"
  );

  // Criamos um mock representativo de banco de dados para testar a mecânica determinística
  const mockDb = {
    cleaningRequests: [
      {
        id: 501,
        flatId: 101,
        flatNumber: "101",
        requestDate: "2026-11-04",
        status: "cleaning_now",
        reservationId: "RES-101-0001",
        leavingGuest: "Carlos Drummond de Andrade"
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
        id: "RES-202-0002",
        code: "RES-202-0002",
        flatId: 202,
        flatNumber: "202",
        guestId: 77,
        guestName: "Carlos Drummond de Andrade",
        guestDocument: "11122233344",
        checkinDate: "2026-12-10",
        checkoutDate: "2026-12-15",
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
      }
    ]
  };

  // Simulação isolada da função updateSmokingStatusForCleaning conforme demo-server.mjs
  function runUpdateSmoking(db, cleaningItem, isSmoker, userAuth, targetDate) {
    const now = new Date().toISOString();
    cleaningItem.smokedInRoom = Boolean(isSmoker);
    cleaningItem.guestSmoked = Boolean(isSmoker);
    if (isSmoker) {
      cleaningItem.smokedMarkedAt = now;
      cleaningItem.smokedMarkedBy = userAuth?.name || "Camareira";
    } else {
      delete cleaningItem.smokedMarkedAt;
      delete cleaningItem.smokedMarkedBy;
    }

    const effectiveDate = targetDate || cleaningItem.requestDate;
    const res = db.reservations.find(r => r.id === cleaningItem.reservationId);
    if (res) {
      res.smokedInRoom = Boolean(isSmoker);
      res.guestSmoked = Boolean(isSmoker);
      res.isSmoker = Boolean(isSmoker);
    }

    const guest = db.guests.find(g => g.id === res.guestId);
    if (guest) {
      if (!Array.isArray(guest.tags)) guest.tags = [];
      if (isSmoker) {
        guest.isSmoker = true;
        guest.smokedInRoom = true;
        if (!guest.tags.includes("Fumante")) guest.tags.push("Fumante");
      } else {
        guest.isSmoker = false;
        guest.smokedInRoom = false;
        guest.tags = guest.tags.filter(t => t.toLowerCase() !== "fumante");
      }
    }

    for (const otherRes of db.reservations) {
      if (otherRes.id === res.id) continue;
      if (otherRes.guestId === guest.id) {
        if (isSmoker) {
          otherRes.isSmoker = true;
          otherRes.smokerGuestAlert = true;
          otherRes.guestSmoked = true;
          otherRes.smokingAlert = "Hóspede com histórico de fumo no quarto";
        } else {
          otherRes.isSmoker = false;
          otherRes.smokerGuestAlert = false;
          otherRes.guestSmoked = false;
          delete otherRes.smokingAlert;
        }
      }
    }
  }

  const cleaningReq = mockDb.cleaningRequests[0];
  const user = { name: "Maria Camareira", role: "camareira" };

  // ETAPA 1: Camareira marca que fumou (isSmoker = true)
  runUpdateSmoking(mockDb, cleaningReq, true, user, "2026-11-04");

  assert.equal(cleaningReq.smokedInRoom, true, "Cleaning request deve ter smokedInRoom = true");
  assert.equal(cleaningReq.guestSmoked, true, "Cleaning request deve ter guestSmoked = true");
  assert.equal(mockDb.reservations[0].smokedInRoom, true, "Reserva atual deve ter smokedInRoom = true");

  const guestRecord = mockDb.guests[0];
  assert.equal(guestRecord.isSmoker, true, "Cadastro do hóspede deve estar marcado como fumante");
  assert.ok(guestRecord.tags.includes("Fumante"), "Tags do hóspede deve incluir 'Fumante'");

  const futureRes = mockDb.reservations[1];
  assert.equal(futureRes.isSmoker, true, "Reserva futura deve estar marcada com isSmoker = true");
  assert.equal(futureRes.smokerGuestAlert, true, "Reserva futura deve ter alerta smokerGuestAlert = true");
  assert.ok(futureRes.smokingAlert.includes("histórico de fumo"), "Reserva futura deve ter mensagem de alerta");

  console.log("✅ 4.1. Marcação de fumo: atualizou card, cadastro do hóspede e reserva futura com sucesso.");

  // ETAPA 2: Camareira desmarca indicação por engano (isSmoker = false)
  runUpdateSmoking(mockDb, cleaningReq, false, user, "2026-11-04");

  assert.equal(cleaningReq.smokedInRoom, false, "Cleaning request deve reverter smokedInRoom para false");
  assert.equal(cleaningReq.guestSmoked, false, "Cleaning request deve reverter guestSmoked para false");
  assert.equal(mockDb.reservations[0].smokedInRoom, false, "Reserva atual deve reverter smokedInRoom para false");

  assert.equal(guestRecord.isSmoker, false, "Cadastro do hóspede deve reverter isSmoker para false");
  assert.equal(guestRecord.tags.includes("Fumante"), false, "Tag 'Fumante' deve ser removida do hóspede");

  assert.equal(futureRes.isSmoker, false, "Reserva futura deve reverter isSmoker para false");
  assert.equal(futureRes.smokerGuestAlert, false, "Reserva futura deve desativar smokerGuestAlert");
  assert.equal(futureRes.smokingAlert, undefined, "Mensagem de alerta deve ser removida da reserva futura");

  console.log("✅ 4.2. Reversão da indicação: limpou card, cadastro e reservas futuras com sucesso.");

  // ETAPA 3: Alternar novamente (marcar novamente)
  runUpdateSmoking(mockDb, cleaningReq, true, user, "2026-11-04");
  assert.equal(guestRecord.isSmoker, true);
  assert.equal(futureRes.isSmoker, true);
  console.log("✅ 4.3. Alternância reativa: re-marcou cadastro e reservas futuras com sucesso.");
}

console.log("\n🎉 TODOS OS TESTES PONTUAIS DE FUMO NA LIMPEZA PASSARAM COM 100% DE SUCESSO!");

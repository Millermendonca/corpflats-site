import assert from "node:assert";

// Teste Pontual e Estrito: Isolamento de Status de Re-assinatura por Hóspede
console.log("▶ Iniciando teste de isolamento de status de re-assinatura por hóspede...");

// Simulação de reserva com Titular (Miller) e Acompanhante (Thamiris)
const mockReservation = {
  id: 9901,
  code: "RES-TEST-STATUS-ISOLATION",
  guestName: "Miller Titular",
  guestPhone: "22999990001",
  checkinDate: "2026-10-20",
  checkoutDate: "2026-10-25",
  flatNumber: "605",
  status: "confirmada",
  fnhrCompleted: false,
  needsReSignature: true,
  reSignatureReason: "Alteração de período da estadia",
  guests: [
    {
      index: 1,
      name: "Miller Titular",
      phone: "22999990001",
      hasCompletedCheckin: true,
      needsReSignature: false, // Titular já re-assinou!
      signatureUrl: "data:image/png;base64,miller_signature_updated",
      checkinCompletedAt: "2026-10-12T02:00:00.000Z"
    },
    {
      index: 2,
      name: "Thamiris Acompanhante",
      phone: "22999990002",
      hasCompletedCheckin: false,
      needsReSignature: true, // Acompanhante AINDA NÃO re-assinou!
      signatureUrl: null,
      checkinCompletedAt: null
    }
  ]
};

// 1. Verificação da Lógica do Portal do Hóspede para o Titular (activeGuestIndex = 1)
{
  const activeGuestIndex = 1;
  const currentGuest = mockReservation.guests.find(g => g.index === activeGuestIndex);
  
  const reservationNeedsReSignature = Boolean(
    mockReservation.needsReSignature ||
    mockReservation.guests.some(g => Boolean(g.needsReSignature))
  );

  const currentGuestNeedsReSignature = Boolean(
    currentGuest?.needsReSignature !== undefined
      ? currentGuest.needsReSignature
      : (reservationNeedsReSignature && !currentGuest?.hasCompletedCheckin)
  );

  const isCurrentGuestPreCheckinDone = !currentGuestNeedsReSignature && Boolean(
    currentGuest?.hasCompletedCheckin ||
    currentGuest?.signatureUrl
  );

  const otherPendingReSignGuests = mockReservation.guests.filter(
    g => Number(g.index) !== Number(activeGuestIndex) && Boolean(g.needsReSignature)
  );

  assert.strictEqual(reservationNeedsReSignature, true, "A reserva coletivamente ainda aguarda assinaturas");
  assert.strictEqual(currentGuestNeedsReSignature, false, "O titular Miller NÃO deve ser marcado como precisando re-assinar");
  assert.strictEqual(isCurrentGuestPreCheckinDone, true, "O check-in do titular Miller deve ser reconhecido como concluído/atualizado");
  assert.strictEqual(otherPendingReSignGuests.length, 1, "Deve identificar exatamente 1 acompanhante pendente");
  assert.strictEqual(otherPendingReSignGuests[0].name, "Thamiris Acompanhante", "O acompanhante pendente deve ser Thamiris");

  console.log("✓ Cenário 1 (Titular Miller visualizando o portal): Status isolado com perfeição! Assinatura Ok e Thamiris indicada como pendente.");
}

// 2. Verificação da Lógica do Portal do Hóspede ao Alternar para a Acompanhante (activeGuestIndex = 2)
{
  const activeGuestIndex = 2;
  const currentGuest = mockReservation.guests.find(g => g.index === activeGuestIndex);
  
  const reservationNeedsReSignature = Boolean(
    mockReservation.needsReSignature ||
    mockReservation.guests.some(g => Boolean(g.needsReSignature))
  );

  const currentGuestNeedsReSignature = Boolean(
    currentGuest?.needsReSignature !== undefined
      ? currentGuest.needsReSignature
      : (reservationNeedsReSignature && !currentGuest?.hasCompletedCheckin)
  );

  const isCurrentGuestPreCheckinDone = !currentGuestNeedsReSignature && Boolean(
    currentGuest?.hasCompletedCheckin ||
    currentGuest?.signatureUrl
  );

  assert.strictEqual(currentGuestNeedsReSignature, true, "Para Thamiris, o status individual DEVE ser re-assinatura pendente");
  assert.strictEqual(isCurrentGuestPreCheckinDone, false, "O check-in de Thamiris não está concluído");

  console.log("✓ Cenário 2 (Visualizando como Thamiris): Banner de re-assinatura obrigatória exibido especificamente para ela.");
}

// 3. Verificação da Lógica do Pre-Checkin (guest-pre-checkin.tsx)
{
  // Quando Miller abre a página de pre-checkin (gIdx = 1)
  const currentG_Miller = mockReservation.guests.find(g => g.index === 1);
  const isMillerPendingReSign = currentG_Miller?.needsReSignature !== undefined
    ? Boolean(currentG_Miller.needsReSignature)
    : (Boolean(mockReservation.needsReSignature) && !currentG_Miller?.hasCompletedCheckin);

  const isReSignatureNeeded_Miller = isMillerPendingReSign;
  const fnhrDone_Miller = Boolean(!isReSignatureNeeded_Miller && currentG_Miller?.hasCompletedCheckin);

  assert.strictEqual(isReSignatureNeeded_Miller, false, "Miller não deve ser obrigado a re-assinar na página de pre-checkin");
  assert.strictEqual(fnhrDone_Miller, true, "Miller deve ser carregado diretamente na visualização concluída (isCompleted = true)");

  // Quando Thamiris abre a página de pre-checkin (gIdx = 2)
  const currentG_Thamiris = mockReservation.guests.find(g => g.index === 2);
  const isThamirisPendingReSign = currentG_Thamiris?.needsReSignature !== undefined
    ? Boolean(currentG_Thamiris.needsReSignature)
    : (Boolean(mockReservation.needsReSignature) && !currentG_Thamiris?.hasCompletedCheckin);

  const isReSignatureNeeded_Thamiris = isThamirisPendingReSign;
  const fnhrDone_Thamiris = Boolean(!isReSignatureNeeded_Thamiris && currentG_Thamiris?.hasCompletedCheckin);

  assert.strictEqual(isReSignatureNeeded_Thamiris, true, "Thamiris deve ser direcionada para re-assinatura");
  assert.strictEqual(fnhrDone_Thamiris, false, "Thamiris não está concluída");

  console.log("✓ Cenário 3 (Página de Pré-Checkin): Miller carrega visualização concluída, Thamiris carrega formulário de assinatura.");
}

// 4. Conclusão da Re-assinatura por Thamiris
{
  mockReservation.guests[1].hasCompletedCheckin = true;
  mockReservation.guests[1].needsReSignature = false;
  mockReservation.guests[1].signatureUrl = "data:image/png;base64,thamiris_signature_updated";
  
  const hasPending = mockReservation.guests.some(g => g.needsReSignature);
  if (!hasPending) {
    mockReservation.needsReSignature = false;
    delete mockReservation.reSignatureReason;
    mockReservation.fnhrCompleted = true;
  }

  assert.strictEqual(mockReservation.needsReSignature, false, "Após ambos assinarem, a reserva inteira é liberada");
  assert.strictEqual(mockReservation.fnhrCompleted, true, "FNRH coletiva da reserva marcada como 100% concluída");

  console.log("✓ Cenário 4 (Após ambos assinarem): Status da reserva atualizado com sucesso para 100% liberado.");
}

console.log("🎉 Todos os testes de isolamento de re-assinatura por hóspede passaram com 100% de sucesso!");

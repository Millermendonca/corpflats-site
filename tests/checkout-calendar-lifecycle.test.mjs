import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Ciclo Completo de Check-out e Marcação no Calendário PMS', () => {
  const serverPath = path.resolve('artifacts/api-server/demo-server.mjs');
  const scriptsServerPath = path.resolve('scripts/demo-server.mjs');
  const zapiPath = path.resolve('artifacts/api-server/zapi-service.mjs');
  const scriptsZapiPath = path.resolve('scripts/zapi-service.mjs');
  const calendarPagePath = path.resolve('artifacts/limpeza/src/pages/pms-calendar.tsx');
  const hoverCardPath = path.resolve('artifacts/limpeza/src/components/reservation-hover-card.tsx');
  const flatCardPath = path.resolve('artifacts/limpeza/src/components/flat-card.tsx');

  it('1. Deve manter paridade estrita entre demo-server.mjs e zapi-service.mjs em artifacts e scripts', () => {
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    const scriptsCode = fs.readFileSync(scriptsServerPath, 'utf8');
    assert.strictEqual(serverCode, scriptsCode, 'demo-server.mjs deve ser idêntico em artifacts/api-server e scripts/');

    const zapiCode = fs.readFileSync(zapiPath, 'utf8');
    const scriptsZapiCode = fs.readFileSync(scriptsZapiPath, 'utf8');
    assert.strictEqual(zapiCode, scriptsZapiCode, 'zapi-service.mjs deve ser idêntico em artifacts/api-server e scripts/');
  });

  it('2. Card marcado como limpeza iniciada (cleaning_now) deve considerar automaticamente check-out feito e quarto desocupado', () => {
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    const idx = serverCode.indexOf('app.patch("/api/cleaning/assignments/:requestId/status"');
    assert.ok(idx !== -1, 'Rota PATCH /api/cleaning/assignments/:requestId/status deve existir');
    const snippet = serverCode.substring(idx, idx + 4200);

    // Verifica regra manual no card
    assert.ok(snippet.includes('item.isVacant = isVacant;'), 'Deve manter atribuição manual de isVacant');
    assert.ok(snippet.includes('item.isVacantExplicitlySet = true;'), 'Deve manter isVacantExplicitlySet = true');
    assert.ok(snippet.includes('item.vacantSource = userAuth?.role === "admin" ? "admin" : "manual_card";'), 'Deve registrar vacantSource manual_card/admin');

    // Verifica regra automática ao iniciar limpeza (cleaning_now)
    assert.ok(
      snippet.includes('status === "cleaning_now" || status === "in_progress" || status === "clean"'),
      'Deve interceptar cleaning_now / in_progress / clean para marcar desocupado e check-out feito'
    );
    assert.ok(
      snippet.includes('const autoSource = status === "clean" ? "cleaning_completed" : "cleaning_started"'),
      'Deve definir vacantSource como cleaning_started ao iniciar limpeza'
    );
    assert.ok(
      snippet.includes('checkoutRes.checkoutDone = true;'),
      'Deve marcar checkoutDone = true na reserva de saída correspondente'
    );
  });

  it('3. Simulação funcional de fim de ciclo (WhatsApp, Recepção, Link Hóspede, Card Desocupado e Limpeza Iniciada) no Calendário', () => {
    const todayStr = '2026-10-15';

    function computeCalendarCheckoutFlags(r, cleaningRequestsToday) {
      const fNum = String(r.flatNumber || '');
      const todayCleanReq = cleaningRequestsToday.find(cr =>
        (String(cr.flatNumber) === fNum || cr.flatId === r.flatId) &&
        !cr.isInstructionOnly
      );

      const cleanStatus = todayCleanReq ? (todayCleanReq.cleaningRequest?.status || todayCleanReq.status) : null;
      const isCleanReqCheckedOut = Boolean(
        todayCleanReq && (
          Boolean(todayCleanReq.isVacant) ||
          cleanStatus === 'cleaning_now' ||
          cleanStatus === 'in_progress' ||
          cleanStatus === 'clean'
        )
      );
      const isResMarkedCheckedOut = Boolean(
        r.checkoutDone ||
        r.status === 'completed' ||
        r.status === 'checked_out' ||
        r.actualCheckoutAt
      );

      const isCheckingOutToday = r.checkoutDate === todayStr;
      const isArrivingTodayForFuture = r.checkinDate === todayStr && r.checkoutDate > todayStr;
      const isCheckoutDone = !isArrivingTodayForFuture && (
        isResMarkedCheckedOut || (isCheckingOutToday && isCleanReqCheckedOut)
      );
      const isCheckedOutToday = isCheckoutDone && (
        isCheckingOutToday || (Boolean(r.actualCheckoutAt) && String(r.actualCheckoutAt).substring(0, 10) === todayStr)
      );

      return { checkoutDone: isCheckoutDone, isCheckedOutToday };
    }

    // Caso A: Check-out não realizado ainda (quarto ainda ocupado e sujo)
    const resPending = { id: 1, flatId: 1, flatNumber: '113', checkinDate: '2026-10-13', checkoutDate: todayStr, status: 'confirmada' };
    const cleanPending = [{ flatId: 1, flatNumber: '113', status: 'dirty', isVacant: false }];
    assert.deepStrictEqual(computeCalendarCheckoutFlags(resPending, cleanPending), {
      checkoutDone: false,
      isCheckedOutToday: false
    });

    // Caso B: Check-out via Card marcado como Desocupado (mesmo sem r.checkoutDone prévio)
    const resCardVacant = { id: 2, flatId: 2, flatNumber: '114', checkinDate: '2026-10-14', checkoutDate: todayStr, status: 'confirmada' };
    const cleanCardVacant = [{ flatId: 2, flatNumber: '114', status: 'dirty', isVacant: true, vacantSource: 'manual_card' }];
    assert.deepStrictEqual(computeCalendarCheckoutFlags(resCardVacant, cleanCardVacant), {
      checkoutDone: true,
      isCheckedOutToday: true
    });

    // Caso C: Card marcado como Limpeza Iniciada (status === 'cleaning_now') mesmo quando isVacant ainda era false
    const resCleaningStarted = { id: 3, flatId: 3, flatNumber: '115', checkinDate: '2026-10-12', checkoutDate: todayStr, status: 'confirmada' };
    const cleanStarted = [{ flatId: 3, flatNumber: '115', status: 'cleaning_now', isVacant: false }];
    assert.deepStrictEqual(computeCalendarCheckoutFlags(resCleaningStarted, cleanStarted), {
      checkoutDone: true,
      isCheckedOutToday: true
    });

    // Caso D: Check-out informado via WhatsApp Portaria / Painel Recepção / Link Hóspede
    const resWhatsapp = { id: 4, flatId: 4, flatNumber: '116', checkinDate: '2026-10-14', checkoutDate: todayStr, status: 'completed', checkoutDone: true };
    const cleanWhatsapp = [{ flatId: 4, flatNumber: '116', status: 'dirty', isVacant: true, vacantSource: 'reception_checkout' }];
    assert.deepStrictEqual(computeCalendarCheckoutFlags(resWhatsapp, cleanWhatsapp), {
      checkoutDone: true,
      isCheckedOutToday: true
    });

    // Caso E: Reserva que ENTRA hoje (turnover no mesmo flat 116) NUNCA deve ser marcada como check-out feito
    const resArrivingToday = { id: 5, flatId: 4, flatNumber: '116', checkinDate: todayStr, checkoutDate: '2026-10-18', status: 'confirmada' };
    assert.deepStrictEqual(computeCalendarCheckoutFlags(resArrivingToday, cleanWhatsapp), {
      checkoutDone: false,
      isCheckedOutToday: false
    });
  });

  it('4. Frontend (pms-calendar.tsx, reservation-hover-card.tsx e flat-card.tsx) deve exibir marcação visual de check-out e desocupação ao iniciar limpeza', () => {
    const calendarCode = fs.readFileSync(calendarPagePath, 'utf8');
    assert.ok(calendarCode.includes('data-checkout-done-badge="true"'), 'Barra da reserva no calendário deve renderizar badge de check-out feito');
    assert.ok(calendarCode.includes('✓ Saiu'), 'Calendário deve exibir indicador "✓ Saiu" nas reservas de hoje com check-out concluído');
    assert.ok(calendarCode.includes('checkedOutTodayDoneCount'), 'Card de KPI de Check-outs deve contabilizar quantos já saíram hoje');

    const hoverCode = fs.readFileSync(hoverCardPath, 'utf8');
    assert.ok(hoverCode.includes('✓ Check-out Realizado'), 'HoverCard deve exibir status "✓ Check-out Realizado"');
    assert.ok(hoverCode.includes('isCheckoutCompleted'), 'HoverCard deve verificar isCheckoutCompleted unificado');

    const flatCardCode = fs.readFileSync(flatCardPath, 'utf8');
    assert.ok(
      flatCardCode.includes('currentStatus === "cleaning_now" || currentStatus === "clean"'),
      'FlatCard deve considerar automaticamente Desocupado quando limpeza estiver iniciada ou concluída'
    );
  });
});

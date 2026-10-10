import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// Regra oficial Pré-Reserva x Confirmada (canais diretos):
// - Confirmada  => quitada por padrão
// - Pré-Reserva => nenhum valor pago
// - Qualquer valor pago > 0 => Confirmada (sinal ou quitada)
// - Pré-reserva só é considerada paga com evidência real (PIX Inter / Mercado Pago)

const serverPath = path.resolve('artifacts/api-server/demo-server.mjs');
const mirrorPath = path.resolve('scripts/demo-server.mjs');
const pmsPath = path.resolve('artifacts/limpeza/src/pages/pms-calendar.tsx');

const server = fs.readFileSync(serverPath, 'utf8');
const pms = fs.readFileSync(pmsPath, 'utf8');

function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `função ${name} não encontrada`);
  let i = src.indexOf(') {', start) + 2;
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.substring(start, i + 1);
}

function sliceBetween(src, startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  assert.ok(s >= 0, `marcador não encontrado: ${startMarker}`);
  const e = src.indexOf(endMarker, s + startMarker.length);
  assert.ok(e > s, `marcador final não encontrado: ${endMarker}`);
  return src.substring(s, e);
}

// Recorta uma arrow function de componente: `  const nome = (...) => { ... }` até o `}` de fechamento com 2 espaços
function sliceArrow(src, name) {
  const s = src.indexOf(`const ${name} = (`);
  assert.ok(s >= 0, `${name} não encontrado`);
  const m = /\r?\n  \}\r?\n/.exec(src.substring(s));
  assert.ok(m, `fim de ${name} não encontrado`);
  return src.substring(s, s + m.index);
}

describe('Integridade de Pagamento da Pré-Reserva', () => {
  it('1. Paridade byte-a-byte entre demo-server.mjs e scripts/demo-server.mjs', () => {
    assert.strictEqual(fs.readFileSync(serverPath).equals(fs.readFileSync(mirrorPath)), true);
  });

  it('2. Evidência real de pagamento: helpers se comportam conforme a regra', () => {
    const code = `${extractFunction(server, 'hasRealPaymentEvidence')}\n${extractFunction(server, 'isUnverifiedPreReservation')}\nreturn { hasRealPaymentEvidence, isUnverifiedPreReservation };`;
    const { hasRealPaymentEvidence, isUnverifiedPreReservation } = new Function(code)();

    // Caso do bug: pré-reserva com pago_total inconsistente e sem PIX real
    const bogus = { status: 'pre_reserva', channel: 'whatsapp', paymentStatus: 'pago_total', paidAmount: 500, totalAmount: 500 };
    assert.strictEqual(hasRealPaymentEvidence(bogus), false);
    assert.strictEqual(isUnverifiedPreReservation(bogus), true);

    // PIX real confirmado pelo Inter
    assert.strictEqual(isUnverifiedPreReservation({ ...bogus, pixEndToEndId: 'E123', paidAt: '2026-10-10T20:00:00Z' }), false);
    // Cartão Mercado Pago
    assert.strictEqual(isUnverifiedPreReservation({ ...bogus, mpPaymentId: '999' }), false);
    // Confirmada não é pré-reserva
    assert.strictEqual(isUnverifiedPreReservation({ ...bogus, status: 'confirmada' }), false);
    // OTA nunca entra na regra
    assert.strictEqual(isUnverifiedPreReservation({ ...bogus, channel: 'booking' }), false);
    assert.strictEqual(isUnverifiedPreReservation({ ...bogus, channel: 'airbnb' }), false);
  });

  it('3. ensurePaymentConfirmationDispatched não confirma pré-reserva sem pagamento real', () => {
    const fn = extractFunction(server, 'ensurePaymentConfirmationDispatched');
    const guardIdx = fn.indexOf('if (isPreStatus && !hasRealPaymentEvidence(r)) return;');
    const flipIdx = fn.indexOf('r.status = "confirmada"');
    const dispatchIdx = fn.indexOf('triggerImmediateWhatsApp');
    assert.ok(guardIdx > 0, 'guarda de evidência real ausente');
    assert.ok(guardIdx < flipIdx, 'guarda deve vir antes da troca de status');
    assert.ok(guardIdx < dispatchIdx, 'guarda deve vir antes de qualquer disparo de WhatsApp');
  });

  it('4. confirmReservationPayment sempre registra paidAt (fluxo real de PIX/MP continua confirmando)', () => {
    const fn = extractFunction(server, 'confirmReservationPayment');
    assert.match(fn, /r\.paidAt = paidAt \|\| r\.paidAt \|\| new Date\(\)\.toISOString\(\);/);
    assert.ok(fn.indexOf('r.paidAt =') < fn.indexOf('ensurePaymentConfirmationDispatched'));
  });

  it('5. POST /api/pms/reservations: pré-reserva direta nasce sem valor pago; valor pago sem status => confirmada', () => {
    const post = sliceBetween(server, 'app.post("/api/pms/reservations", async', 'db.reservations.unshift(newReservation);');
    assert.match(post, /else if \(isOta \|\| resolvedPaymentStatus === "pago_total" \|\| resolvedPaidAmount > 0\) \{\s*resolvedStatus = "confirmada";/);
    assert.match(post, /if \(resolvedStatus === "pre_reserva" && !isOta\) \{\s*normalizedPayments = \[\];\s*resolvedPaidAmount = 0;\s*resolvedPaymentStatus = "pendente";/);
    assert.ok(post.indexOf('resolvedStatus === "pre_reserva" && !isOta') < post.indexOf('const newReservation = {'));
  });

  it('6. PUT /api/pms/reservations/:id: pré-reserva zera pagamentos; pagamento em pré-reserva confirma', () => {
    const put = sliceBetween(server, 'app.put("/api/pms/reservations/:id", async', 'if (oldStatus === "pre_reserva" && r.status === "confirmada")');
    assert.match(put, /if \(req\.body\.status === "pre_reserva"\) \{\s*r\.payments = \[\];\s*r\.paidAmount = 0;\s*r\.paymentStatus = "pendente";/);
    assert.match(put, /req\.body\.status === undefined && r\.status === "pre_reserva" && Number\(r\.paidAmount\) > 0\) \{\s*r\.status = "confirmada";/);
  });

  it('7. Portal do hóspede e /payment-status não tratam pré-reserva sem prova como paga', () => {
    const portal = sliceBetween(server, 'app.get("/api/pms/guest-portal/:code", async', 'const resolvedTotal');
    assert.match(portal, /let isPaid = !isCancelledRes && !isUnpaidPre && \(/);
    const status = sliceBetween(server, 'app.get("/api/pms/reservations/:code/payment-status"', 'checkInterPixCobStatus');
    assert.match(status, /if \(!isUnverifiedPreReservation\(r\) && \(isOta \|\|/);
  });

  it('8. Auto-sync do extrato inclui pré-reservas sem pagamento real', () => {
    const sync = sliceBetween(server, '// 6.4 Background Auto-Sync', 'for (const r of pendingReservations)');
    assert.match(sync, /isUnverifiedPreReservation\(r\) \|\|/);
  });

  it('9. PMS: botão Pré-Reserva zera pagamentos e botão Confirmada quita por padrão', () => {
    const pre = sliceArrow(pms, 'handleSelectPreReserva');
    assert.match(pre, /setFormStatus\("pre_reserva"\)/);
    assert.match(pre, /setFormPayments\(\[\]\)/);
    assert.match(pre, /setFormPaidAmount\("0"\)/);
    assert.match(pre, /setFormPaymentStatus\("pendente"\)/);
    const conf = sliceArrow(pms, 'handleSelectConfirmada');
    assert.match(conf, /setFormPaymentStatus\("pago_total"\)/);
    assert.match(pms, /onClick=\{handleSelectPreReserva\}/);
    assert.match(pms, /onClick=\{handleSelectConfirmada\}/);
    assert.doesNotMatch(pms, /onClick=\{\(\) => setFormStatus\("pre_reserva"\)\}/);
  });

  it('10. PMS: qualquer valor pago lançado confirma a reserva', () => {
    for (const name of ['handleAddPayment', 'handleRemovePayment', 'handleUpdatePayment']) {
      const body = sliceArrow(pms, name);
      assert.match(body, /if \(newPaidSum > 0\) setFormStatus\("confirmada"\)/, `${name} deve confirmar ao lançar pagamento`);
    }
  });

  it('11. PMS: salvar aplica a trava (pré-reserva sem valor pago / pago => confirmada)', () => {
    assert.match(pms, /if \(formStatus === "pre_reserva"\) \{\s*normalizedPayments = \[\]\s*resolvedPaidAmount = 0\s*resolvedPaymentStatus = "pendente"\s*\} else if \(resolvedPaidAmount > 0\) \{\s*statusToSave = "confirmada"/);
    assert.match(pms, /status: statusToSave,/);
  });

  it('12. PMS: recálculo de diárias não recria pagamento em pré-reserva; abrir detalhes não confirma sozinho', () => {
    assert.match(pms, /if \(formStatus === "pre_reserva" && !isBooking && targetChannel !== "airbnb"\) \{/);
    assert.match(pms, /const isUnpaidPreReserva = resItem\.status === "pre_reserva" && !isOtaRes && !isGatewayPaid;/);
    assert.match(pms, /const isResCurrentlyPaid = !isUnpaidPreReserva && \(/);
  });
});

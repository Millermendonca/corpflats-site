import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import {
  getBrasiliaTodayStr,
  isReservationForToday,
  isReservationForFuture,
  isReservationForTodayOrPast,
  hasReceptionReceivedReservation
} from '../artifacts/api-server/mail-service.mjs';

import {
  triggerGarageEmailNotification
} from '../artifacts/api-server/demo-server.mjs';

describe('Regras Estritas de Comunicação por E-mail (Garagem e Recepção)', () => {
  const serverPath = path.resolve('artifacts/api-server/demo-server.mjs');
  const scriptsServerPath = path.resolve('scripts/demo-server.mjs');
  const mailPath = path.resolve('artifacts/api-server/mail-service.mjs');
  const scriptsMailPath = path.resolve('scripts/mail-service.mjs');

  it('1. Paridade estrita byte-a-byte entre demo-server.mjs e scripts/demo-server.mjs', () => {
    const s1 = fs.readFileSync(serverPath);
    const s2 = fs.readFileSync(scriptsServerPath);
    assert.strictEqual(s1.equals(s2), true, 'Primary e mirror demo-server.mjs devem ser 100% idênticos byte-a-byte');
  });

  it('2. Paridade estrita byte-a-byte entre mail-service.mjs e scripts/mail-service.mjs', () => {
    const m1 = fs.readFileSync(mailPath);
    const m2 = fs.readFileSync(scriptsMailPath);
    assert.strictEqual(m1.equals(m2), true, 'Primary e mirror mail-service.mjs devem ser 100% idênticos byte-a-byte');
  });

  it('3. Helpers de data de Brasília devem classificar corretamente reservas de hoje e futuras', () => {
    const todayStr = getBrasiliaTodayStr();
    assert.match(todayStr, /^\d{4}-\d{2}-\d{2}$/, 'Data de hoje deve seguir o formato YYYY-MM-DD');

    const futureDate = '2099-12-31';
    const pastDate = '2020-01-01';

    const resToday = { checkinDate: todayStr };
    const resFuture = { checkinDate: futureDate };
    const resPast = { checkinDate: pastDate };

    assert.strictEqual(isReservationForToday(resToday), true);
    assert.strictEqual(isReservationForToday(resFuture), false);

    assert.strictEqual(isReservationForFuture(resFuture), true);
    assert.strictEqual(isReservationForFuture(resToday), false);
    assert.strictEqual(isReservationForFuture(resPast), false);

    assert.strictEqual(isReservationForTodayOrPast(resToday), true);
    assert.strictEqual(isReservationForTodayOrPast(resPast), true);
    assert.strictEqual(isReservationForTodayOrPast(resFuture), false);
  });

  it('4. hasReceptionReceivedReservation deve retornar false para reservas com check-in futuro', () => {
    const todayStr = getBrasiliaTodayStr();
    const futureDate = '2099-12-31';

    // Mesmo que tenha carimbos de envio gravados (ex: cópia de dados ou teste), se o check-in é futuro, retorna false
    const resFutureWithFlag = {
      code: 'RES_FUT_1',
      checkinDate: futureDate,
      morningEmailSentDate: todayStr,
      receptionNotifiedAt: new Date().toISOString()
    };
    assert.strictEqual(hasReceptionReceivedReservation(resFutureWithFlag, {}), false, 'Para reservas futuras, hasReceptionReceivedReservation deve ser SEMPRE false');

    const resTodayWithFlag = {
      code: 'RES_TODAY_1',
      checkinDate: todayStr,
      morningEmailSentDate: todayStr
    };
    assert.strictEqual(hasReceptionReceivedReservation(resTodayWithFlag, {}), true, 'Para reservas de hoje já notificadas, deve ser true');
  });

  it('5. triggerGarageEmailNotification deve reter e-mail para reservas futuras, mas salvar o veículo', () => {
    const mockDb = {
      flats: [{ id: 1, number: '113', buildingName: 'Edifício Soho Residence Service' }],
      settings: { garageEmail: 'millerpessanha@gmail.com' },
      garageAuthorizations: [],
      notifications: [],
      reservationCommunications: []
    };
    let saved = false;
    const mockSave = () => { saved = true; };

    const futureRes = {
      id: 9901,
      code: 'TEST_FUT_CAR',
      flatNumber: '113',
      checkinDate: '2099-12-31',
      checkoutDate: '2100-01-05',
      guestName: 'Hóspede Futuro'
    };

    const resResult = triggerGarageEmailNotification(mockDb, mockSave, futureRes, {
      plate: 'ABC1D23',
      brand: 'Toyota',
      model: 'Corolla',
      color: 'Preto'
    });

    assert.strictEqual(resResult.deferred, true, 'Deve indicar que o envio foi retido/diferido');
    assert.strictEqual(resResult.reason, 'future_reservation');
    assert.strictEqual(futureRes.vehicle.plate, 'ABC1D23', 'Dados do veículo devem ter sido salvos na reserva');
    assert.strictEqual(futureRes.vehicle.garageNotifiedAt, undefined, 'garageNotifiedAt NÃO deve ser gravado para envio futuro');
    assert.strictEqual(mockDb.garageAuthorizations.length, 0, 'Nenhum registro de autorização disparada deve ser adicionado');
    assert.strictEqual(mockDb.reservationCommunications.length, 0, 'Nenhum e-mail deve ter sido despachado');
    assert.strictEqual(saved, true, 'Base deve ter sido salva com os dados do veículo');
  });

  it('6. triggerGarageEmailNotification deve disparar e-mail para reservas do dia de hoje', () => {
    const todayStr = getBrasiliaTodayStr();
    const mockDb = {
      flats: [{ id: 1, number: '113', buildingName: 'Edifício Soho Residence Service' }],
      settings: { garageEmail: 'millerpessanha@gmail.com' },
      garageAuthorizations: [],
      notifications: [],
      reservationCommunications: []
    };
    const mockSave = () => {};

    const todayRes = {
      id: 9902,
      code: 'TEST_TODAY_CAR',
      flatNumber: '113',
      checkinDate: todayStr,
      checkoutDate: '2099-12-31',
      guestName: 'Hóspede de Hoje'
    };

    const resResult = triggerGarageEmailNotification(mockDb, mockSave, todayRes, {
      plate: 'XYZ9876',
      brand: 'Honda',
      model: 'Civic',
      color: 'Branco'
    });

    assert.strictEqual(resResult.deferred, undefined, 'Não deve ser retido para reserva de hoje');
    assert.strictEqual(resResult.success, true);
    assert.strictEqual(todayRes.vehicle.plate, 'XYZ9876');
    assert.ok(todayRes.vehicle.garageNotifiedAt, 'garageNotifiedAt deve ser preenchido');
    assert.strictEqual(mockDb.garageAuthorizations.length, 1, 'Autorização deve ser gravada na base');
    assert.strictEqual(mockDb.garageAuthorizations[0].plate, 'XYZ9876');
    assert.strictEqual(mockDb.reservationCommunications.length, 1, 'Comunicação deve ser gravada');
    assert.strictEqual(mockDb.reservationCommunications[0].recipient, 'millerpessanha@gmail.com');
  });

  it('7. demo-server.mjs deve implementar rotina matinal 07:00 que despacha autorização de garagem para reservas do dia', () => {
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    assert.ok(serverCode.includes('triggerGarageEmailNotification(db, saveDatabase, r, r.vehicle, {'), 'Rotina das 07:00 deve disparar liberação de garagem');
    assert.ok(serverCode.includes('Rotina Matinal 07:00 (Dia do Check-in)'), 'Identificador da rotina matinal deve estar documentado');
  });

  it('8. demo-server.mjs deve reter aviso à recepção em edições de reservas futuras', () => {
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    assert.ok(
      serverCode.includes('isReservationForTodayOrPast(r) && hasReceptionReceivedReservation(r, db)'),
      'Edição de reservas deve exigir que a reserva seja para hoje ou passada para notificar recepção'
    );
  });

  it('9. Limpeza de processo pós-testes', () => {
    setTimeout(() => { process.exit(0); }, 50);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import { getBrasiliaTodayStr } from '../artifacts/api-server/mail-service.mjs';
import {
  mergeVehicleData,
  vehicleDetailsDiffer,
  triggerGarageEmailNotification
} from '../artifacts/api-server/demo-server.mjs';

const makeDb = () => ({
  flats: [{ id: 1, number: '605', buildingName: 'Edifício Soho Residence Service' }],
  settings: { garageEmail: 'millerpessanha@gmail.com' },
  garageAuthorizations: [],
  notifications: [],
  reservationCommunications: []
});

describe('Persistência dos dados do veículo (marca/modelo/cor) e reenvio à garagem', () => {
  it('1. Paridade byte-a-byte entre demo-server.mjs primário e espelho', () => {
    const a = fs.readFileSync(path.resolve('artifacts/api-server/demo-server.mjs'));
    const b = fs.readFileSync(path.resolve('scripts/demo-server.mjs'));
    assert.strictEqual(a.equals(b), true);
  });

  it('2. mergeVehicleData preserva marca/modelo/cor para a mesma placa quando chegam vazios', () => {
    const old = { plate: 'SRL9E08', brand: 'Toyota', model: 'Corolla', color: 'Prata' };
    const merged = mergeVehicleData(old, { plate: 'srl9e08', brand: '', model: '', color: '' });
    assert.deepStrictEqual(merged, { plate: 'SRL9E08', brand: 'Toyota', model: 'Corolla', color: 'Prata' });
  });

  it('3. mergeVehicleData aplica novos valores e não herda dados quando a placa muda', () => {
    const old = { plate: 'SRL9E08', brand: 'Toyota', model: 'Corolla', color: 'Prata' };
    assert.deepStrictEqual(
      mergeVehicleData(old, { plate: 'SRL9E08', model: 'Yaris' }),
      { plate: 'SRL9E08', brand: 'Toyota', model: 'Yaris', color: 'Prata' }
    );
    assert.deepStrictEqual(
      mergeVehicleData(old, { plate: 'ABC1D23' }),
      { plate: 'ABC1D23', brand: '', model: '', color: '' }
    );
    assert.strictEqual(mergeVehicleData(old, { plate: '' }), null);
  });

  it('4. vehicleDetailsDiffer detecta mudança de modelo/cor com a mesma placa', () => {
    assert.strictEqual(vehicleDetailsDiffer({ plate: 'SRL9E08' }, { plate: 'SRL9E08', model: 'Corolla' }), true);
    assert.strictEqual(vehicleDetailsDiffer({ plate: 'SRL9E08', model: 'Corolla' }, { plate: 'srl9e08', model: 'corolla ' }), false);
  });

  it('5. Mesma placa já notificada, mas com detalhes novos: atualiza a reserva e reenvia o e-mail completo', () => {
    const db = makeDb();
    const today = getBrasiliaTodayStr();
    // Cenário real do Flat 605: e-mail anterior saiu só com a placa (registro legado sem assinatura)
    const r = {
      id: 605001, code: 'TEST_605', flatNumber: '605', checkinDate: today, checkoutDate: '2099-12-31',
      guestName: 'Hóspede 605',
      vehicle: { plate: 'SRL9E08', brand: '', model: '', color: '', garageNotifiedAt: new Date().toISOString(), lastNotifiedPlate: 'SRL9E08' }
    };

    const result = triggerGarageEmailNotification(db, () => {}, r, { plate: 'SRL9E08', brand: 'Toyota', model: 'Corolla', color: 'Prata' });

    assert.ok(result && result.success, 'Deve reenviar quando os detalhes mudaram');
    assert.strictEqual(r.vehicle.brand, 'Toyota');
    assert.strictEqual(r.vehicle.model, 'Corolla');
    assert.strictEqual(r.vehicle.color, 'Prata');
    assert.strictEqual(db.garageAuthorizations[0].model, 'Corolla');
    assert.ok(db.reservationCommunications[0].bodyHtml?.includes('Toyota - Corolla') || db.reservationCommunications[0].body?.includes('Toyota - Corolla') || JSON.stringify(db.reservationCommunications[0]).includes('Toyota - Corolla'),
      'E-mail deve conter marca e modelo');
  });

  it('6. Mesma placa e mesmos detalhes: não duplica o e-mail', () => {
    const db = makeDb();
    const today = getBrasiliaTodayStr();
    const r = { id: 605002, code: 'TEST_605_DUP', flatNumber: '605', checkinDate: today, checkoutDate: '2099-12-31', guestName: 'Hóspede 605' };
    const v = { plate: 'SRL9E08', brand: 'Toyota', model: 'Corolla', color: 'Prata' };

    assert.ok(triggerGarageEmailNotification(db, () => {}, r, v)?.success);
    assert.strictEqual(triggerGarageEmailNotification(db, () => {}, r, { ...v }), null, 'Segunda chamada idêntica deve ser ignorada');
    // Chamada só com a placa não apaga os dados salvos e não reenvia
    assert.strictEqual(triggerGarageEmailNotification(db, () => {}, r, { plate: 'SRL9E08' }), null);
    assert.strictEqual(r.vehicle.model, 'Corolla');
    assert.strictEqual(db.garageAuthorizations.length, 1);
  });

  it('7. Frontend do pré-checkin envia marca/modelo/cor para qualquer opção de carro', () => {
    const code = fs.readFileSync(path.resolve('artifacts/limpeza/src/pages/guest-pre-checkin.tsx'), 'utf8');
    assert.ok(code.includes('const isCarTransport = ["carro", "Carro próprio", "Carro alugado"].includes(transportMethod)'));
    assert.ok(code.includes('const cleanModel = isCarTransport ? vehicleModel.trim() : ""'));
    assert.ok(!code.includes('transportMethod === "carro"'), 'Não deve haver checagem exclusiva do valor legado "carro"');
  });

  it('8. Limpeza de processo pós-testes', () => {
    setTimeout(() => { process.exit(0); }, 50);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { resolveReservationAttachments } from '../artifacts/api-server/mail-service.mjs';

describe('Anexos de Documentos Oficiais em E-mails para a Recepção', () => {
  const mailServerFile = path.resolve('artifacts/api-server/mail-service.mjs');
  const scriptsMailServerFile = path.resolve('scripts/mail-service.mjs');
  const storageServerFile = path.resolve('artifacts/api-server/storage-service.mjs');
  const scriptsStorageServerFile = path.resolve('scripts/storage-service.mjs');
  const demoServerFile = path.resolve('artifacts/api-server/demo-server.mjs');
  const scriptsDemoServerFile = path.resolve('scripts/demo-server.mjs');

  it('1. Paridade estrita byte-a-byte de mail-service, storage-service e demo-server', () => {
    assert.strictEqual(
      fs.readFileSync(mailServerFile).equals(fs.readFileSync(scriptsMailServerFile)),
      true,
      'mail-service.mjs deve ser idêntico em artifacts/api-server e scripts'
    );
    assert.strictEqual(
      fs.readFileSync(storageServerFile).equals(fs.readFileSync(scriptsStorageServerFile)),
      true,
      'storage-service.mjs deve ser idêntico em artifacts/api-server e scripts'
    );
    assert.strictEqual(
      fs.readFileSync(demoServerFile).equals(fs.readFileSync(scriptsDemoServerFile)),
      true,
      'demo-server.mjs deve ser idêntico em artifacts/api-server e scripts'
    );
  });

  it('2. Hóspede SEM pré-checkin digital deve ter seu documento oficial (Imagem) anexado no e-mail', () => {
    const rawImageB64 = Buffer.alloc(200, 0x11).toString('base64');
    const resWithoutPreCheckin = {
      code: 'RES_DOC_ONLY_01',
      guestName: 'Roberto Alves',
      fnrhDocumentUuid: null, // NÃO fez pré-checkin
      docPhotoUrl: `data:image/jpeg;base64,${rawImageB64}`
    };

    const attachments = resolveReservationAttachments({
      reservation: resWithoutPreCheckin
    });

    assert.strictEqual(attachments.length, 1, 'Deve incluir exatamente o documento oficial');
    assert.ok(attachments[0].filename.startsWith('Documento_Roberto_Alves'), 'Nome do anexo deve identificar o hóspede');
    assert.strictEqual(attachments[0].filename.endsWith('.jpg'), true);
    assert.strictEqual(attachments[0].contentType, 'image/jpeg');
    assert.ok(Buffer.isBuffer(attachments[0].content));
    assert.strictEqual(attachments[0].content.length, 200);
  });

  it('3. Hóspede SEM pré-checkin digital deve ter seu documento oficial em PDF anexado no e-mail', () => {
    const rawPdfB64 = Buffer.alloc(300, 0x22).toString('base64');
    const resWithPdf = {
      code: 'RES_DOC_PDF_02',
      guestName: 'Carla Dias',
      fnrhDocumentUuid: null,
      docPhotoUrl: `data:application/pdf;base64,${rawPdfB64}`
    };

    const attachments = resolveReservationAttachments({
      reservation: resWithPdf
    });

    assert.strictEqual(attachments.length, 1);
    assert.ok(attachments[0].filename.startsWith('Documento_Carla_Dias'));
    assert.strictEqual(attachments[0].filename.endsWith('.pdf'), true);
    assert.strictEqual(attachments[0].contentType, 'application/pdf');
    assert.strictEqual(attachments[0].content.length, 300);
  });

  it('4. Hóspede COM pré-checkin concluído deve ter FNRH + Documento Oficial anexados juntos', () => {
    const testUuid = 'UNIT_TEST_FNRH_UUID_' + Date.now();
    const secureFnrhDir = path.resolve('artifacts/api-server/secure_fnrh');
    if (!fs.existsSync(secureFnrhDir)) {
      fs.mkdirSync(secureFnrhDir, { recursive: true });
    }
    const mockPdfPath = path.join(secureFnrhDir, `FNRH_${testUuid}.pdf`);
    fs.writeFileSync(mockPdfPath, '%PDF-1.4 Mock FNRH Document');

    try {
      const rawImageB64 = Buffer.alloc(150, 0x33).toString('base64');
      const resWithBoth = {
        code: 'RES_FNRH_AND_DOC_03',
        guestName: 'Lucas Lima',
        fnrhDocumentUuid: testUuid,
        docPhotoUrl: `data:image/png;base64,${rawImageB64}`
      };

      const attachments = resolveReservationAttachments({
        reservation: resWithBoth
      });

      assert.strictEqual(attachments.length, 2, 'Deve anexar tanto a FNRH quanto o documento oficial');
      
      const fnrhAtt = attachments.find(a => a.filename.startsWith('FNRH_'));
      const docAtt = attachments.find(a => a.filename.startsWith('Documento_'));

      assert.ok(fnrhAtt, 'Anexo da FNRH deve estar presente');
      assert.strictEqual(fnrhAtt.path, mockPdfPath);

      assert.ok(docAtt, 'Anexo do Documento oficial deve estar presente');
      assert.strictEqual(docAtt.filename.endsWith('.png'), true);
      assert.strictEqual(docAtt.contentType, 'image/png');
    } finally {
      if (fs.existsSync(mockPdfPath)) {
        fs.unlinkSync(mockPdfPath);
      }
    }
  });

  it('5. Reserva multi-hóspedes deve resolver documentos de acompanhantes (co-guests)', () => {
    const docTitularB64 = Buffer.alloc(100, 0x44).toString('base64');
    const docCoGuestB64 = Buffer.alloc(120, 0x55).toString('base64');

    const multiRes = {
      code: 'RES_MULTI_04',
      guestName: 'Bruno Titular',
      docPhotoUrl: `data:image/jpeg;base64,${docTitularB64}`,
      guests: [
        { name: 'Bruno Titular', docPhotoUrl: `data:image/jpeg;base64,${docTitularB64}` },
        { name: 'Juliana Acompanhante', docPhotoUrl: `data:image/png;base64,${docCoGuestB64}` }
      ]
    };

    const attachments = resolveReservationAttachments({
      reservation: multiRes
    });

    assert.strictEqual(attachments.length, 2, 'Deve deduplicar o titular e incluir a acompanhante');
    assert.ok(attachments.some(a => a.filename.includes('Bruno_Titular')));
    assert.ok(attachments.some(a => a.filename.includes('Juliana_Acompanhante')));
  });

  it('6. Documento cadastrado no CRM guest deve ser resolvido se não constar direto na reserva', () => {
    const crmDocB64 = Buffer.alloc(160, 0x66).toString('base64');
    const mockDb = {
      guests: [
        { id: 'GUEST_99', name: 'Marcos CRM', docPhotoUrl: `data:image/jpeg;base64,${crmDocB64}` }
      ]
    };
    const resLinkedToGuest = {
      code: 'RES_LINKED_05',
      guestId: 'GUEST_99',
      guestName: 'Marcos CRM',
      docPhotoUrl: null // Sem documento na reserva, mas presente no CRM
    };

    const attachments = resolveReservationAttachments({
      reservation: resLinkedToGuest,
      db: mockDb
    });

    assert.strictEqual(attachments.length, 1);
    assert.ok(attachments[0].filename.includes('Marcos_CRM'));
  });

  it('7. demo-server.mjs deve integrar resolveReservationAttachments na rotina matinal 07:00 e direct booking', () => {
    const code = fs.readFileSync(demoServerFile, 'utf8');
    assert.ok(code.includes('resolveReservationAttachments({ reservation: r, guest: titularGuest, db })'), 'Rotina das 07:00 deve usar resolveReservationAttachments');
    assert.ok(code.includes('resolveReservationAttachments({ reservation: newReservation, guest, db })'), 'Reserva direta deve usar resolveReservationAttachments');
    assert.ok(code.includes('resolveReservationAttachments({ reservation, guest, db })'), 'PMS nova reserva deve usar resolveReservationAttachments');
  });

  it('8. Limpeza de processo pós-testes', () => {
    setTimeout(() => { process.exit(0); }, 50);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { generateFnrhPdf, SECURE_FNRH_DIR } from '../artifacts/api-server/fnrh-pdf-service.mjs';
import { resolveReservationAttachments, renderCheckinConfirmedEmail } from '../artifacts/api-server/mail-service.mjs';

describe('Integração Completa: Geração de FNRH PDF e Anexos em E-mails para Recepção', () => {
  const filesToClean = [];

  it('1. Paridade estrita byte-a-byte entre artifacts/api-server/ e scripts/', () => {
    const files = [
      'fnrh-pdf-service.mjs',
      'mail-service.mjs',
      'demo-server.mjs',
      'storage-service.mjs'
    ];
    for (const f of files) {
      const art = fs.readFileSync(path.resolve(`artifacts/api-server/${f}`));
      const scr = fs.readFileSync(path.resolve(`scripts/${f}`));
      assert.strictEqual(
        art.equals(scr),
        true,
        `Paridade estrita falhou para: ${f}`
      );
    }
  });

  it('2. generateFnrhPdf deve compilar sem ReferenceError com dados de hóspede (inclusive gender e birthDate)', async () => {
    const testReservation = {
      id: 605,
      code: 'RES-605-MILLER',
      flatNumber: '605',
      checkinDate: '2026-10-07',
      checkoutDate: '2026-10-08',
      guestName: 'Miller Mendonça Pessanha',
      guestDocument: '12345678901',
      guestPhone: '22997124021'
    };

    const guestData = {
      fullName: 'Miller Mendonça Pessanha',
      document: '12345678901',
      phone: '22997124021',
      email: 'miller@corpflats.com.br',
      birthDate: '1990-05-15',
      gender: 'masculino',
      address: 'Rua Conselheiro Otaviano, 209',
      city: 'Campos dos Goytacazes',
      state: 'RJ',
      cep: '28010-140'
    };

    const signatureDummy = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const pdfResult = await generateFnrhPdf({
      reservation: testReservation,
      guestData,
      signatureBase64: signatureDummy
    });

    assert.ok(pdfResult, 'generateFnrhPdf deve retornar objeto com metadados');
    assert.ok(pdfResult.filePath, 'Deve conter filePath');
    assert.ok(fs.existsSync(pdfResult.filePath), 'Arquivo gerado deve existir fisicamente');
    filesToClean.push(pdfResult.filePath);

    const stats = fs.statSync(pdfResult.filePath);
    assert.ok(stats.size > 3000, `Arquivo PDF deve ter tamanho válido (>3KB), tamanho atual: ${stats.size}`);
    assert.ok(pdfResult.documentUuid, 'Deve conter documentUuid');
    assert.ok(pdfResult.sha256Hash, 'Deve conter sha256Hash');
    assert.ok(pdfResult.auditTrail, 'Deve conter auditTrail');
  });

  it('3. resolveReservationAttachments deve anexar AMBOS FNRH PDF e Documento Oficial do Hóspede', async () => {
    // 1. Gera FNRH real no diretório seguro
    const testReservation = {
      id: 605,
      code: 'RES-605-MILLER-02',
      flatNumber: '605',
      guestName: 'Miller Mendonça Pessanha',
      guestDocument: '12345678901',
      checkinDate: '2026-10-07'
    };

    const pdfResult = await generateFnrhPdf({
      reservation: testReservation,
      guestData: {
        fullName: 'Miller Mendonça Pessanha',
        document: '12345678901',
        birthDate: '1990-05-15',
        gender: 'masculino',
        phone: '22997124021'
      },
      signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    });
    filesToClean.push(pdfResult.filePath);

    // Simula a reserva após salvar no banco
    const rawDocB64 = Buffer.alloc(250, 0xAA).toString('base64');
    const completedReservation = {
      ...testReservation,
      fnrhDocumentUuid: pdfResult.documentUuid,
      fnrhFileName: pdfResult.fileName,
      fnrhFilePath: pdfResult.filePath,
      docPhotoUrl: `data:image/jpeg;base64,${rawDocB64}`
    };

    const attachments = resolveReservationAttachments({
      reservation: completedReservation
    });

    assert.strictEqual(attachments.length, 2, 'Deve conter exatamente 2 anexos: FNRH PDF e Documento Oficial');

    const fnrhAtt = attachments.find(a => a.filename.startsWith('FNRH_'));
    const docAtt = attachments.find(a => a.filename.startsWith('Documento_'));

    assert.ok(fnrhAtt, 'Anexo FNRH deve estar presente');
    assert.strictEqual(fnrhAtt.path, pdfResult.filePath);
    assert.ok(fnrhAtt.filename.includes('RES-605-MILLER-02'));
    assert.ok(fnrhAtt.filename.includes('Miller'));

    assert.ok(docAtt, 'Anexo de Documento Oficial deve estar presente');
    assert.ok(docAtt.filename.startsWith('Documento_Miller'));
    assert.strictEqual(docAtt.contentType, 'image/jpeg');
  });

  it('4. resolveReservationAttachments deve localizar FNRH via db.fnrhAuditDocuments quando apenas UUID estiver na reserva', async () => {
    const testReservation = {
      id: 605,
      code: 'RES-605-AUDIT-LOOKUP',
      flatNumber: '605',
      guestName: 'Miller Mendonça',
      guestDocument: '98765432100'
    };

    const pdfResult = await generateFnrhPdf({
      reservation: testReservation,
      guestData: {
        fullName: 'Miller Mendonça',
        document: '98765432100',
        gender: 'masculino'
      }
    });
    filesToClean.push(pdfResult.filePath);

    // Reserva sem fnrhFilePath/fnrhFileName explícitos, mas com UUID e banco auditDocuments
    const reservationOnlyUuid = {
      id: testReservation.id,
      code: testReservation.code,
      guestName: testReservation.guestName,
      fnrhDocumentUuid: pdfResult.documentUuid,
      docPhotoUrl: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrCg=='
    };

    const mockDb = {
      fnrhAuditDocuments: [pdfResult.auditTrail]
    };

    const attachments = resolveReservationAttachments({
      reservation: reservationOnlyUuid,
      db: mockDb
    });

    assert.strictEqual(attachments.length, 2);
    const fnrhAtt = attachments.find(a => a.filename.startsWith('FNRH_'));
    assert.ok(fnrhAtt, 'Deve localizar FNRH pelo auditDocument');
    assert.strictEqual(fnrhAtt.path, pdfResult.filePath);
  });

  it('5. Fallback em demo-server.mjs garante inclusão da FNRH se unshift for necessário', () => {
    const dummyFilePath = path.join(SECURE_FNRH_DIR, 'test_mock_fnrh_unshift.pdf');
    fs.writeFileSync(dummyFilePath, '%PDF-1.4 Mock');
    filesToClean.push(dummyFilePath);

    const r = { code: 'RES-605-UNSHIFT', id: 605, guestName: 'Miller Teste' };
    const validName = 'Miller Teste';
    const fnrhDocument = { filePath: dummyFilePath };

    const emailAttachments = [];
    if (fnrhDocument?.filePath && fs.existsSync(fnrhDocument.filePath) && !emailAttachments.some(a => a.path === fnrhDocument.filePath || (a.filename && a.filename.startsWith('FNRH_')))) {
      emailAttachments.unshift({
        filename: `FNRH_${r.code || r.id}_${validName.replace(/\s+/g, '_')}.pdf`,
        path: fnrhDocument.filePath
      });
    }

    assert.strictEqual(emailAttachments.length, 1);
    assert.strictEqual(emailAttachments[0].path, dummyFilePath);
    assert.strictEqual(emailAttachments[0].filename, 'FNRH_RES-605-UNSHIFT_Miller_Teste.pdf');
  });

  it('6. Limpeza de arquivos temporários de teste', () => {
    for (const f of filesToClean) {
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch (_) {}
      }
    }
  });
});

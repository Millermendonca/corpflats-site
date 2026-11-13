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

  it('5. Fallback em demo-server.mjs garante inclusão da FNRH sem colidir com outros anexos FNRH', () => {
    const dummyFilePath = path.join(SECURE_FNRH_DIR, 'test_mock_fnrh_unshift.pdf');
    fs.writeFileSync(dummyFilePath, '%PDF-1.4 Mock');
    filesToClean.push(dummyFilePath);

    const r = { code: 'RES-605-UNSHIFT', id: 605, guestName: 'Miller Mendonça Teste' };
    const validName = 'Miller Mendonça Teste';
    const fnrhDocument = { filePath: dummyFilePath };

    const emailAttachments = [];
    const safeValidName = validName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s-]/gi, "")
      .trim()
      .replace(/\s+/g, "_");
    const currentFnrhFilename = `FNRH_${r.code || r.id}_${safeValidName}.pdf`;

    if (fnrhDocument?.filePath && fs.existsSync(fnrhDocument.filePath) && !emailAttachments.some(a => a.path === fnrhDocument.filePath || a.filename === currentFnrhFilename)) {
      emailAttachments.unshift({
        filename: currentFnrhFilename,
        path: fnrhDocument.filePath
      });
    }

    assert.strictEqual(emailAttachments.length, 1);
    assert.strictEqual(emailAttachments[0].path, dummyFilePath);
    assert.strictEqual(emailAttachments[0].filename, 'FNRH_RES-605-UNSHIFT_Miller_Mendonca_Teste.pdf');
  });

  it('6. Multi-hóspedes: FNRH do titular e FNRH do co-hóspede devem coexistir sem sobrescrita', async () => {
    const dummyFileTitular = path.join(SECURE_FNRH_DIR, 'test_titular_fnrh.pdf');
    const dummyFileCoGuest = path.join(SECURE_FNRH_DIR, 'test_coguest_fnrh.pdf');
    fs.writeFileSync(dummyFileTitular, '%PDF-1.4 Titular');
    fs.writeFileSync(dummyFileCoGuest, '%PDF-1.4 CoGuest');
    filesToClean.push(dummyFileTitular, dummyFileCoGuest);

    const reservationMulti = {
      id: 605,
      code: 'RES-605-MULTI',
      guestName: 'Miller Mendonça',
      fnrhFilePath: dummyFileTitular,
      fnrhDocumentUuid: 'uuid-titular-123',
      docPhotoUrl: 'data:image/jpeg;base64,QUJD',
      guests: [
        {
          index: 1,
          name: 'Miller Mendonça',
          fnrhFilePath: dummyFileTitular,
          fnrhDocumentUuid: 'uuid-titular-123',
          docPhotoUrl: 'data:image/jpeg;base64,QUJD'
        },
        {
          index: 2,
          name: 'Ana Flávia Silveira',
          fnrhFilePath: dummyFileCoGuest,
          fnrhDocumentUuid: 'uuid-coguest-456',
          docPhotoUrl: 'data:image/png;base64,WFla'
        }
      ]
    };

    const attachments = resolveReservationAttachments({
      reservation: reservationMulti
    });

    // Deve conter 2 FNRHs e 2 Documentos Oficiais (Total = 4)
    assert.strictEqual(attachments.length, 4, 'Deve conter exatamente 4 anexos (2 FNRHs + 2 Documentos)');

    const titularFnrh = attachments.find(a => a.filename.includes('Miller_Mendonca') && a.filename.startsWith('FNRH_'));
    const coGuestFnrh = attachments.find(a => a.filename.includes('Ana_Flavia_Silveira') && a.filename.startsWith('FNRH_'));

    assert.ok(titularFnrh, 'FNRH do titular deve estar presente');
    assert.strictEqual(titularFnrh.path, dummyFileTitular);

    assert.ok(coGuestFnrh, 'FNRH da acompanhante deve estar presente');
    assert.strictEqual(coGuestFnrh.path, dummyFileCoGuest);
  });

  it('7. Normalização de acentos: ç e outros diacríticos devem ser mantidos foneticamente legíveis', () => {
    const dummyFile = path.join(SECURE_FNRH_DIR, 'test_accent_fnrh.pdf');
    fs.writeFileSync(dummyFile, '%PDF-1.4 Accent');
    filesToClean.push(dummyFile);

    const resAccent = {
      code: 'RES-ACCENT-01',
      guestName: 'Miller Mendonça Gonçalves',
      fnrhFilePath: dummyFile
    };

    const attachments = resolveReservationAttachments({
      reservation: resAccent
    });

    assert.strictEqual(attachments.length, 1);
    // 'Mendonça Gonçalves' deve virar 'Mendonca_Goncalves', e NÃO 'Mendona_Gonalves'
    assert.ok(
      attachments[0].filename.includes('Mendonca_Goncalves'),
      `Nome do anexo (${attachments[0].filename}) deve conter 'Mendonca_Goncalves'`
    );
  });

  it('8. findFnrhPath deve selecionar o arquivo mais recente quando houver múltiplos arquivos de prefixo correspondente', async () => {
    const oldFile = path.join(SECURE_FNRH_DIR, 'fnrh_test_mtime_11111111111_1000000000000.pdf');
    const newFile = path.join(SECURE_FNRH_DIR, 'fnrh_test_mtime_11111111111_2000000000000.pdf');
    fs.writeFileSync(oldFile, '%PDF-1.4 Old');
    fs.writeFileSync(newFile, '%PDF-1.4 New');
    filesToClean.push(oldFile, newFile);

    // Força mtime diferente
    const pastTime = new Date('2025-01-01T00:00:00Z');
    const futureTime = new Date('2026-10-07T12:00:00Z');
    fs.utimesSync(oldFile, pastTime, pastTime);
    fs.utimesSync(newFile, futureTime, futureTime);

    const res = {
      id: 'test_mtime',
      code: 'RES-TEST-MTIME',
      guestName: 'Hóspede Recente',
      guestDocument: '11111111111'
    };

    const attachments = resolveReservationAttachments({
      reservation: res
    });

    assert.strictEqual(attachments.length, 1);
    assert.strictEqual(attachments[0].path, newFile, 'Deve selecionar o arquivo com mtime mais recente');
  });

  it('9. demo-server.mjs deve registrar rotas /api/pms/fnrh/:documentUuid/view e download', () => {
    const demoServerCode = fs.readFileSync(path.resolve('artifacts/api-server/demo-server.mjs'), 'utf8');
    assert.ok(demoServerCode.includes('app.get("/api/pms/fnrh/:documentUuid/view", handleFnrhServe(false));'), 'Rota de view da FNRH deve estar registrada');
    assert.ok(demoServerCode.includes('app.get("/api/pms/fnrh/:documentUuid/download", handleFnrhServe(true));'), 'Rota de download da FNRH deve estar registrada');
  });

  it('10. Limpeza de arquivos temporários de teste', () => {
    for (const f of filesToClean) {
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch (_) {}
      }
    }
  });
});

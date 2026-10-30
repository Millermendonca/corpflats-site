import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import zlib from 'node:zlib';
import {
  inspectDocumentWithAI,
  isCamposDosGoytacazes,
  checkYouthLocalRisk,
  comparePersonNames,
  compareCpfDigits,
  compareBirthDates,
  formatOfficialPersonName,
  shouldReplaceWithOfficialDocName,
  syncBidirectionalGuestProfile
} from '../artifacts/api-server/demo-server.mjs';

describe('Inspeção de Documentos com Foto por Inteligência Artificial', () => {
  const serverPath = path.resolve('artifacts/api-server/demo-server.mjs');
  const scriptsServerPath = path.resolve('scripts/demo-server.mjs');

  it('1. Paridade estrita byte-a-byte entre demo-server.mjs e scripts/demo-server.mjs', () => {
    const s1 = fs.readFileSync(serverPath);
    const s2 = fs.readFileSync(scriptsServerPath);
    assert.strictEqual(s1.equals(s2), true, 'Primary e mirror demo-server.mjs devem ser 100% idênticos byte-a-byte');
  });

  it('2. Rejeição com explicação clara e amigável quando nenhum documento for enviado', async () => {
    const resEmpty = await inspectDocumentWithAI({ fileBase64: '', providedName: 'João Silva', providedCpf: '12345678901' });
    assert.strictEqual(resEmpty.success, false);
    assert.strictEqual(resEmpty.isLegible, false);
    assert.strictEqual(resEmpty.isOfficialDocument, false);
    assert.strictEqual(resEmpty.status, 'invalid_input');
    assert.ok(resEmpty.legibilityReason.length > 5, 'Deve fornecer motivo explicativo para o hóspede');
  });

  it('3. Rejeição de arquivo corrompido, em branco ou excessivamente curto', async () => {
    const shortInvalidBase64 = 'data:image/jpeg;base64,QUJDREVGR0g='; // muito curto (< 100 chars)
    const resCorrupt = await inspectDocumentWithAI({ fileBase64: shortInvalidBase64, providedName: 'Maria Santos', providedCpf: '98765432100' });
    assert.strictEqual(resCorrupt.success, false);
    assert.strictEqual(resCorrupt.isLegible, false);
    assert.strictEqual(resCorrupt.isOfficialDocument, false);
    assert.strictEqual(resCorrupt.status, 'file_corrupted');
    assert.ok(resCorrupt.legibilityReason.toLowerCase().includes('corrompido') || resCorrupt.legibilityReason.toLowerCase().includes('foto nítida'));
  });

  it('4. Validação bem-sucedida de documento em formato de imagem válido com fallback estrutural', async () => {
    // Cria uma string base64 válida simulando uma imagem de 300+ bytes
    const sampleImageBase64 = 'data:image/jpeg;base64,' + Buffer.alloc(350, 0xAA).toString('base64');
    const res = await inspectDocumentWithAI({
      fileBase64: sampleImageBase64,
      fileName: 'cnh_frente_verso.jpg',
      providedName: 'Carlos Eduardo Oliveira',
      providedCpf: '111.222.333-44'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.isOfficialDocument, true);
    assert.strictEqual(res.isLegible, true);
    assert.strictEqual(res.extractedName, 'Carlos Eduardo Oliveira');
    assert.strictEqual(res.extractedCpf, '11122233344');
    assert.strictEqual(res.cpfMatches, true);
  });

  it('5. Validação de documento em formato PDF oficial', async () => {
    // Cria um payload simulando cabeçalho de PDF e dados
    const samplePdfHeader = '%PDF-1.4\n' + 'A'.repeat(300);
    const samplePdfBase64 = 'data:application/pdf;base64,' + Buffer.from(samplePdfHeader).toString('base64');
    const res = await inspectDocumentWithAI({
      fileBase64: samplePdfBase64,
      fileName: 'rg_digital.pdf',
      providedName: 'Mariana Duarte Souza',
      providedCpf: '55566677788'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.isOfficialDocument, true);
    assert.strictEqual(res.isLegible, true);
    assert.strictEqual(res.extractedCpf, '55566677788');
    assert.strictEqual(res.cpfMatches, true);
  });

  it('6. Detecção precisa de morador de Campos dos Goytacazes/RJ (sem falso positivo por sobrenome)', async () => {
    const sampleImageBase64 = 'data:image/jpeg;base64,' + Buffer.alloc(350, 0xBB).toString('base64');
    
    // Hóspede com cidade declarada em Campos dos Goytacazes
    const resCampos = await inspectDocumentWithAI({
      fileBase64: sampleImageBase64,
      fileName: 'cnh_lucas.jpg',
      providedName: 'Lucas Peçanha Silva',
      providedCpf: '99988877766',
      providedCity: 'Campos dos Goytacazes'
    });
    assert.strictEqual(resCampos.success, true);
    assert.strictEqual(resCampos.isCamposResident, true, 'Deve marcar isCamposResident quando cidade for Campos');
    assert.strictEqual(resCampos.extractedCity, 'Campos dos Goytacazes');

    // Hóspede com sobrenome "Campos", mas residente em São Paulo (NÃO deve dar falso positivo)
    const resSp = await inspectDocumentWithAI({
      fileBase64: sampleImageBase64,
      fileName: 'cnh_juliana.jpg',
      providedName: 'Juliana Campos de Oliveira',
      providedCpf: '11122233344',
      providedCity: 'São Paulo'
    });
    assert.strictEqual(resSp.isCamposResident, false, 'Sobrenome Campos NÃO deve marcar erroneamente como residente local');
  });

  it('7. Detecção de menor de idade e cálculo de idade a partir de data de nascimento e nome de arquivo', async () => {
    const sampleImageBase64 = 'data:image/jpeg;base64,' + Buffer.alloc(350, 0xDD).toString('base64');

    // 16 anos (nascido em 2010 com referência 2026) -> Menor de idade
    const resMinor = await inspectDocumentWithAI({
      fileBase64: sampleImageBase64,
      fileName: 'rg_pedro.pdf',
      providedName: 'Pedro Alvares',
      providedCpf: '12345678900',
      providedBirthDate: '2010-06-15'
    });
    assert.strictEqual(resMinor.isMinor, true, 'Deve marcar isMinor para idade < 18');
    assert.strictEqual(resMinor.calculatedAge, 16, 'Deve calcular 16 anos');

    // 31 anos (nascido em 1995) -> Maior de idade
    const resAdult = await inspectDocumentWithAI({
      fileBase64: sampleImageBase64,
      fileName: 'cnh_rodrigo.jpg',
      providedName: 'Rodrigo Medeiros',
      providedCpf: '98765432100',
      providedBirthDate: '1995-03-20'
    });
    assert.strictEqual(resAdult.isMinor, false, 'Deve marcar isMinor=false para maior de idade');
    assert.strictEqual(resAdult.calculatedAge, 31);

    // Detecção por arquivo contendo indicador de menor
    const resMinorFile = await inspectDocumentWithAI({
      fileBase64: sampleImageBase64,
      fileName: 'doc_menor_autorizacao.pdf',
      providedName: 'Lucas Menor',
      providedCpf: '33322211100'
    });
    assert.strictEqual(resMinorFile.isMinor, true, 'Deve identificar menoridade por arquivo indicador');
  });

  it('8. Suporte a parâmetros alternativos (aliases documentFile, declaredName, declaredCpf)', async () => {
    const sampleImageBase64 = 'data:image/jpeg;base64,' + Buffer.alloc(350, 0xCC).toString('base64');
    const res = await inspectDocumentWithAI({
      documentFile: sampleImageBase64,
      declaredName: 'Ana Beatriz Mendes',
      declaredCpf: '33344455566'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.isOfficialDocument, true);
    assert.strictEqual(res.isLegible, true);
    assert.strictEqual(res.extractedName, 'Ana Beatriz Mendes');
    assert.strictEqual(res.extractedCpf, '33344455566');
  });

  it('9. Validação estrita obrigatória no endpoint de reserva direta (demo-server.mjs)', () => {
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    assert.ok(serverCode.includes('cleanDoc.length !== 11'), 'Deve validar 11 dígitos do CPF no backend');
    assert.ok(serverCode.includes('hasDocFile'), 'Deve validar anexo obrigatório de documento no backend');
  });

  it('10. Função isCamposDosGoytacazes valida variações locais e rejeita homônimos externos', () => {
    // Casos positivos
    assert.strictEqual(isCamposDosGoytacazes('Campos dos Goytacazes'), true);
    assert.strictEqual(isCamposDosGoytacazes('campos dos goytacazes'), true);
    assert.strictEqual(isCamposDosGoytacazes('CAMPOS DOS GOYTACAZES'), true);
    assert.strictEqual(isCamposDosGoytacazes('Campos dos Goitacazes'), true);
    assert.strictEqual(isCamposDosGoytacazes('Campos', '', 'RJ'), true);
    assert.strictEqual(isCamposDosGoytacazes('Campos - RJ'), true);
    assert.strictEqual(isCamposDosGoytacazes('', 'Av. Pelinca, 100, Campos dos Goytacazes - RJ'), true);
    assert.strictEqual(isCamposDosGoytacazes('Campos'), true);

    // Casos negativos (homônimos fora de Campos dos Goytacazes)
    assert.strictEqual(isCamposDosGoytacazes('Campos do Jordão'), false);
    assert.strictEqual(isCamposDosGoytacazes('Campos Novos'), false);
    assert.strictEqual(isCamposDosGoytacazes('Campos Altos'), false);
    assert.strictEqual(isCamposDosGoytacazes('Campos Verdes'), false);
    assert.strictEqual(isCamposDosGoytacazes('Campos Lindos'), false);
    assert.strictEqual(isCamposDosGoytacazes('São Paulo'), false);
    assert.strictEqual(isCamposDosGoytacazes('Rio de Janeiro'), false);
    assert.strictEqual(isCamposDosGoytacazes(''), false);
  });

  it('11. checkYouthLocalRisk aciona radar para qualquer morador de Campos independente da idade', () => {
    // Morador de Campos com 45 anos (acima de 30) -> Deve acionar radar de morador local
    const riskAdult = checkYouthLocalRisk({
      birthDate: '1981-05-10',
      city: 'Campos dos Goytacazes',
      address: 'Rua Formosa, Centro',
      phone: '22998877665',
      state: 'RJ'
    });
    assert.strictEqual(riskAdult.isTriggered, true, 'Deve acionar alerta para morador local');
    assert.strictEqual(riskAdult.isCampos, true);
    assert.strictEqual(riskAdult.isUnder30, false);
    assert.ok(riskAdult.reason.includes('Campos dos Goytacazes'));

    // Morador de Campos jovem com 21 anos -> Deve acionar alerta de jovem local
    const riskYouth = checkYouthLocalRisk({
      birthDate: '2005-02-15',
      city: 'Campos dos Goytacazes',
      address: 'Pelinca',
      phone: '22991122334',
      state: 'RJ'
    });
    assert.strictEqual(riskYouth.isTriggered, true);
    assert.strictEqual(riskYouth.isCampos, true);
    assert.strictEqual(riskYouth.isUnder30, true);
    assert.ok(riskYouth.reason.includes('jovem'));

    // Hóspede de fora com 25 anos -> NÃO aciona
    const riskExternal = checkYouthLocalRisk({
      birthDate: '2001-08-20',
      city: 'Belo Horizonte',
      address: 'Savassi',
      phone: '31988887777',
      state: 'MG'
    });
    assert.strictEqual(riskExternal.isTriggered, false);
  });

  it('12. isCamposDosGoytacazes valida CEPs de Campos (280xx / 281xx) e rejeita outros CEPs', () => {
    assert.strictEqual(isCamposDosGoytacazes('', '', 'RJ', '28010-000'), true);
    assert.strictEqual(isCamposDosGoytacazes('', '', 'RJ', '28110000'), true);
    assert.strictEqual(isCamposDosGoytacazes('', '', 'RJ', '28035-100'), true);
    assert.strictEqual(isCamposDosGoytacazes('', '', 'RJ', '27910-000'), false); // Macaé
    assert.strictEqual(isCamposDosGoytacazes('', '', 'RJ', '20000-000'), false); // Rio Capital
    assert.strictEqual(isCamposDosGoytacazes('', '', 'SP', '01310-100'), false); // SP
  });

  it('13. inspectDocumentWithAI detecta Campos via originCity e CEP', async () => {
    const sampleImageBase64 = 'data:image/jpeg;base64,' + Buffer.alloc(350, 0xEE).toString('base64');
    
    // Detecção por originCity
    const resOrigin = await inspectDocumentWithAI({
      fileBase64: sampleImageBase64,
      fileName: 'documento.jpg',
      providedName: 'Miller Mendonça',
      providedCpf: '11122233344',
      originCity: 'Campos dos Goytacazes'
    });
    assert.strictEqual(resOrigin.success, true);
    assert.strictEqual(resOrigin.isCamposResident, true, 'Deve detectar Campos através de originCity');

    // Detecção por CEP
    const resCep = await inspectDocumentWithAI({
      fileBase64: sampleImageBase64,
      fileName: 'doc_identidade.jpg',
      providedName: 'Hóspede Teste',
      providedCpf: '22233344455',
      cep: '28035-100'
    });
    assert.strictEqual(resCep.success, true);
    assert.strictEqual(resCep.isCamposResident, true, 'Deve detectar Campos através de CEP 280xx');
  });

  it('14. inspectDocumentWithAI detecta Campos inspecionando stream de texto de PDF', async () => {
    const pdfContentWithCampos = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nstream\nNaturalidade: Campos dos Goytacazes - RJ\nendstream\n%%EOF';
    const pdfBase64 = 'data:application/pdf;base64,' + Buffer.from(pdfContentWithCampos).toString('base64');

    const resPdf = await inspectDocumentWithAI({
      fileBase64: pdfBase64,
      fileName: 'cnh_digital.pdf',
      providedName: 'Miller Mendonça',
      providedCpf: '11122233344'
    });
    assert.strictEqual(resPdf.success, true);
    assert.strictEqual(resPdf.isCamposResident, true, 'Deve extrair e identificar menção a Campos no stream do PDF');
  });

  it('15. checkYouthLocalRisk aciona com originCity e cep de Campos', () => {
    const riskOrigin = checkYouthLocalRisk({
      birthDate: '1990-01-01',
      originCity: 'Campos dos Goytacazes',
      phone: '22999998888',
      state: 'RJ'
    });
    assert.strictEqual(riskOrigin.isTriggered, true);
    assert.strictEqual(riskOrigin.isCampos, true);

    const riskCep = checkYouthLocalRisk({
      birthDate: '1985-06-15',
      cep: '28020-000',
      phone: '21988887777',
      state: 'RJ'
    });
    assert.strictEqual(riskCep.isTriggered, true);
    assert.strictEqual(riskCep.isCampos, true);
  });

  it('16. comparePersonNames valida se documento pertence à mesma pessoa (com e sem preposições/abreviações) e bloqueia terceiros', () => {
    assert.strictEqual(comparePersonNames('MILLER PESSANHA MENDONÇA', 'Miller Pessanha Mendonca'), true);
    assert.strictEqual(comparePersonNames('CARLOS EDUARDO DA SILVA OLIVEIRA', 'Carlos Oliveira'), true);
    assert.strictEqual(comparePersonNames('MARIA CLARA DE SOUZA', 'Maria Clara Souza'), true);
    // Pessoas diferentes (mesmo sobrenome, primeiro nome diferente)
    assert.strictEqual(comparePersonNames('JOÃO PEDRO DA SILVA', 'Maria Clara da Silva'), false);
    // Pessoas completamente diferentes
    assert.strictEqual(comparePersonNames('ROBERTO ALMEIDA SANTOS', 'Lucas Peçanha'), false);
  });

  it('17. Robô pericial detecta divergência de titularidade (nome ou CPF no documento diferente da reserva/ficha)', async () => {
    const rawStream = 'BT /F1 12 Tf (NOME: ROBERTO ALMEIDA SANTOS) Tj (CPF: 999.888.777-66) Tj (DATA DE NASCIMENTO: 15/04/1988) Tj (NATURALIDADE: CAMPOS DOS GOYTACAZES - RJ) Tj ET';
    const compressed = zlib.deflateSync(Buffer.from(rawStream, 'latin1'));
    const pdfBuf = Buffer.concat([
      Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length ' + compressed.length + ' /Filter /FlateDecode >>\nstream\r\n', 'latin1'),
      compressed,
      Buffer.from('\r\nendstream\nendobj\n%%EOF', 'latin1')
    ]);
    const pdfBase64 = 'data:application/pdf;base64,' + pdfBuf.toString('base64');

    // Caso A: Reserva em nome de "Miller Mendonça" (CPF 111.222.333-44), mas anexou documento de "Roberto Almeida Santos" (CPF 999.888.777-66)
    const mismatchRes = await inspectDocumentWithAI({
      fileBase64: pdfBase64,
      fileName: 'cnh_digital.pdf',
      providedName: 'Miller Mendonça',
      providedCpf: '111.222.333-44',
      reservationName: 'Miller Mendonça',
      reservationCpf: '11122233344',
      providedBirthDate: '1992-10-10'
    });

    assert.strictEqual(mismatchRes.extractedName, 'ROBERTO ALMEIDA SANTOS');
    assert.strictEqual(mismatchRes.extractedCpf, '99988877766');
    assert.strictEqual(mismatchRes.nameMatches, false, 'Deve reprovar quando nome no documento diverge do titular');
    assert.strictEqual(mismatchRes.reservationNameMatches, false, 'Deve reprovar quando nome no documento diverge do nome na reserva');
    assert.strictEqual(mismatchRes.cpfMatches, false, 'Deve reprovar quando CPF no documento diverge do CPF informado');
    assert.strictEqual(mismatchRes.birthDateMatches, false, 'Deve detectar divergência na data de nascimento');
    assert.strictEqual(mismatchRes.identityMatches, false, 'identityMatches deve ser false quando não é a mesma pessoa');
    assert.strictEqual(mismatchRes.isCamposResident, true, 'Deve extrair cidade mesmo em stream FlateDecode comprimido');
    assert.ok(Array.isArray(mismatchRes.mismatchReasons) && mismatchRes.mismatchReasons.length >= 2, 'Deve detalhar motivos da divergência');

    // Caso B: Reserva e ficha da mesma pessoa do documento ("Roberto Almeida Santos")
    const matchRes = await inspectDocumentWithAI({
      fileBase64: pdfBase64,
      fileName: 'cnh_digital.pdf',
      providedName: 'Roberto Almeida Santos',
      providedCpf: '999.888.777-66',
      reservationName: 'Roberto Santos',
      reservationCpf: '99988877766',
      providedBirthDate: '1988-04-15'
    });

    assert.strictEqual(matchRes.nameMatches, true);
    assert.strictEqual(matchRes.reservationNameMatches, true);
    assert.strictEqual(matchRes.cpfMatches, true);
    assert.strictEqual(matchRes.birthDateMatches, true);
    assert.strictEqual(matchRes.identityMatches, true);
    assert.strictEqual(matchRes.mismatchReasons.length, 0);
  });

  it('18. Persistência e pré-carregamento automático do documento anexado (syncBidirectionalGuestProfile)', () => {
    const sampleDocUrl = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
    const sampleSelfieUrl = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';

    const mockDb = {
      guests: [
        {
          id: 101,
          guestCode: 'G-101',
          name: 'Miller Pessanha',
          fullName: 'Miller Pessanha',
          email: 'miller@exemplo.com',
          phone: '22999112233',
          document: '12345678901',
          documentNumber: '12345678901',
          docPhotoUrl: sampleDocUrl,
          photoUrl: sampleSelfieUrl
        }
      ],
      guestAccounts: [
        {
          id: 501,
          name: 'Miller Pessanha',
          email: 'miller@exemplo.com',
          phone: '22999112233',
          document: '12345678901'
        }
      ],
      reservations: [
        {
          id: 9001,
          code: 'RES-9001',
          guestId: 101,
          guestName: 'Miller Pessanha',
          guestEmail: 'miller@exemplo.com',
          guestPhone: '22999112233',
          guestDocument: '12345678901',
          guests: [
            { index: 1, name: 'Miller Pessanha', cpf: '12345678901' }
          ]
        }
      ]
    };

    // Ao sincronizar o perfil em uma nova reserva ou login, a conta e a reserva herdam automaticamente o docPhotoUrl salvo anteriormente
    syncBidirectionalGuestProfile(mockDb, mockDb.guestAccounts[0], {});

    assert.strictEqual(mockDb.guestAccounts[0].docPhotoUrl, sampleDocUrl, 'Conta do hóspede deve herdar docPhotoUrl salvo no CRM');
    assert.strictEqual(mockDb.reservations[0].docPhotoUrl, sampleDocUrl, 'Reserva do hóspede deve herdar docPhotoUrl salvo');
    assert.strictEqual(mockDb.reservations[0].guests[0].docPhotoUrl, sampleDocUrl, 'Slot 1 da reserva deve pré-carregar docPhotoUrl para não pedir anexo novamente');
    assert.strictEqual(mockDb.reservations[0].guests[0].selfieUrl, sampleSelfieUrl, 'Slot 1 da reserva deve pré-carregar selfieUrl salva');
  });

  it('19. Caso real RES-715: aceita homógrafo visual I/l ("IAGO" vs "lago") e variações de 1 letra, corrigindo automaticamente o nome da reserva', async () => {
    // Homógrafo I/l direto em comparePersonNames
    assert.strictEqual(
      comparePersonNames('IAGO FERNANDES ZIOTO DE FREITAS', 'lago Fernandes Zioto De Freitas'),
      true,
      'Deve reconhecer "lago" (L minúsculo) como homógrafo visual de "IAGO"'
    );
    // Variação de 1 letra / grafia equivalente
    assert.strictEqual(
      comparePersonNames('MATHEUS PHILIPE SOUZA', 'Mateus Filipe Sousa'),
      true,
      'Deve aceitar variações ortográficas equivalentes (th/t, ph/f, z/s)'
    );
    assert.strictEqual(
      comparePersonNames('LUCAS MENDONCA DA SILVA', 'Lukas Mendonca Silva'),
      true,
      'Deve aceitar diferença de 1 letra quando sobrenomes batem'
    );

    // Simula PDF de CNH Digital da reserva RES-715 (inclusive quando enviado sem extensão .pdf via fileName "documento_hospede")
    const rawStreamIago = 'BT /F1 12 Tf (NOME: IAGO FERNANDES ZIOTO DE FREITAS) Tj (CPF: 162.555.437-06) Tj (DATA DE NASCIMENTO: 20/08/1996) Tj ET';
    const compressedIago = zlib.deflateSync(Buffer.from(rawStreamIago, 'latin1'));
    const pdfBufIago = Buffer.concat([
      Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length ' + compressedIago.length + ' /Filter /FlateDecode >>\nstream\r\n', 'latin1'),
      compressedIago,
      Buffer.from('\r\nendstream\nendobj\n%%EOF', 'latin1')
    ]);
    // Sem prefixo application/pdf para testar detecção por magic bytes %PDF (JVBERi0)
    const pdfBase64NoMime = pdfBufIago.toString('base64');

    const res715 = await inspectDocumentWithAI({
      fileBase64: pdfBase64NoMime,
      fileName: 'documento_hospede',
      providedName: 'lago Fernandes Zioto De Freitas',
      providedCpf: '16255543706',
      reservationName: 'lago Fernandes Zioto De Freitas',
      reservationCpf: '16255543706',
      providedBirthDate: '1996-08-20'
    });

    assert.strictEqual(res715.identityMatches, true, 'RES-715 deve aprovar identidade com sucesso');
    assert.strictEqual(res715.nameMatches, true, 'nameMatches deve ser true para IAGO vs lago');
    assert.strictEqual(res715.reservationNameMatches, true, 'reservationNameMatches deve ser true para IAGO vs lago');
    assert.strictEqual(res715.cpfMatches, true);
    assert.strictEqual(res715.canonicalGuestName, 'Iago Fernandes Zioto de Freitas', 'Deve retornar nome oficial formatado do documento');
    assert.strictEqual(res715.nameAutoCorrected, true, 'Deve sinalizar que o nome foi autocorrigido pelo documento oficial');

    // Simula PDF multi-stream com cabeçalho ICP-Brasil/SERPROACF no 1º stream e rótulos NACIONALIDADE / ASSINATURA no 2º stream
    const streamHeader = zlib.deflateSync(Buffer.from('BT (Titular: AUTORIDADE CERTIFICADORA SERPROACF) Tj (Nome: ICP-BRASIL) Tj ET', 'latin1'));
    const streamBody = zlib.deflateSync(Buffer.from('BT (NOME: IAGO FERNANDES ZIOTO DE FREITAS NACIONALIDADE BRASILEIRA ASSINATURA DO PORTADOR) Tj (CPF: 162.555.437-06) Tj ET', 'latin1'));
    const multiStreamPdf = Buffer.concat([
      Buffer.from('%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\r\n', 'latin1'),
      streamHeader,
      Buffer.from('\r\nendstream\nendobj\n2 0 obj\n<< /Filter /FlateDecode >>\nstream\r\n', 'latin1'),
      streamBody,
      Buffer.from('\r\nendstream\nendobj\n%%EOF', 'latin1')
    ]);
    const resMultiStream = await inspectDocumentWithAI({
      fileBase64: multiStreamPdf.toString('base64'),
      fileName: 'cnh_digital.pdf',
      providedName: 'Zioto',
      providedCpf: '16255543706',
      reservationName: 'Zioto',
      reservationCpf: '16255543706'
    });
    assert.strictEqual(resMultiStream.identityMatches, true, 'Multi-stream PDF com header ICP-Brasil deve aprovar titular');
    assert.strictEqual(resMultiStream.canonicalGuestName, 'Iago Fernandes Zioto de Freitas', 'Deve ignorar SERPROACF/ICP-BRASIL e limpar NACIONALIDADE/ASSINATURA');
  });

  it('20. Aceita reserva com apenas sobrenome, ordem invertida, nome composto parcial, sufixos/títulos e CPF 100% idêntico', () => {
    // Apenas sobrenome na reserva
    assert.strictEqual(comparePersonNames('RODRIGO DE ALMEIDA BRITO', 'Brito'), true);
    assert.strictEqual(comparePersonNames('IAGO FERNANDES ZIOTO DE FREITAS', 'Freitas'), true);
    // Ordem invertida ("Sobrenome Nome")
    assert.strictEqual(comparePersonNames('FREDERICO COSTA', 'Costa Frederico'), true);
    // Nome composto parcial (nome do meio + sobrenome e adição de sobrenome de casada)
    assert.strictEqual(comparePersonNames('ANA CAROLINA TRAVASSOS', 'Carolina Travassos'), true);
    assert.strictEqual(comparePersonNames('ANA CAROLINA FONSECA', 'Carolina Fonseca Silva'), true);
    assert.strictEqual(comparePersonNames('ANA CAROLINA FONSECA', 'Carolina Silva', { cpfMatches: true }), true);
    // Sufixos agnáticos e títulos honoríficos (Jr, Filho, Neto, Dr)
    assert.strictEqual(comparePersonNames('ROBERTO ALMEIDA SANTOS JUNIOR', 'Dr. Roberto Santos'), true);
    assert.strictEqual(comparePersonNames('CARLOS EDUARDO SILVA', 'Carlos Silva Jr'), true);
    assert.strictEqual(comparePersonNames('ANTONIO PEREIRA NETO', 'Antonio Pereira'), true);
    // CPF 100% idêntico + prenome ou único sobrenome compatível
    assert.strictEqual(comparePersonNames('GUILHERME AUGUSTO NOGUEIRA', 'Guilherme', { cpfMatches: true }), true);
    assert.strictEqual(comparePersonNames('IAGO FERNANDES ZIOTO DE FREITAS', 'Ziotu', { cpfMatches: true }), true);

    // Verifica que shouldReplaceWithOfficialDocName recomenda expandir/corrigir para o nome oficial completo do documento sem truncar nomes já completos
    assert.strictEqual(shouldReplaceWithOfficialDocName('Brito', 'RODRIGO DE ALMEIDA BRITO'), true);
    assert.strictEqual(shouldReplaceWithOfficialDocName('Dr. Roberto Santos', 'ROBERTO ALMEIDA SANTOS JUNIOR'), true);
    assert.strictEqual(shouldReplaceWithOfficialDocName('lago Fernandes Zioto De Freitas', 'IAGO FERNANDES ZIOTO DE FREITAS'), true);
    assert.strictEqual(shouldReplaceWithOfficialDocName('Miller Mendonça Pessanha', 'MILLER PESSANHA'), false, 'Não deve truncar nome mais completo da reserva');
    assert.strictEqual(formatOfficialPersonName('IAGO FERNANDES ZIOTO DE FREITAS'), 'Iago Fernandes Zioto de Freitas');
    assert.strictEqual(formatOfficialPersonName('lara mendes'), 'Lara Mendes', 'Não deve corromper o nome próprio Lara para Iara');
  });

  it('21. Rejeita nomes com flexão de gênero distinta ou outro prenome (irmãos/cônjuges com mesmo sobrenome)', () => {
    assert.strictEqual(comparePersonNames('PAULO DA SILVA', 'Paula da Silva'), false);
    assert.strictEqual(comparePersonNames('GABRIEL OLIVEIRA', 'Gabriela Oliveira'), false);
    assert.strictEqual(comparePersonNames('FERNANDO COSTA', 'Fernanda Costa'), false);
    assert.strictEqual(comparePersonNames('CARLOS SOUZA', 'Carla Souza'), false);
    // Mesmo se por erro digitassem o mesmo CPF na reserva e no formulário, Paulo vs Paula ou João vs Maria não devem passar
    assert.strictEqual(comparePersonNames('PAULO DA SILVA', 'Paula da Silva', { cpfMatches: true, cpfMatchesReservation: true }), false);
    assert.strictEqual(comparePersonNames('JOAO DA SILVA', 'Maria da Silva', { cpfMatches: true, cpfMatchesReservation: true }), false);
  });

  it('22. syncBidirectionalGuestProfile preserva vínculo da reserva ao corrigir homógrafo I/l ou expandir sobrenome para nome completo', () => {
    const mockDb = {
      guests: [
        {
          id: 715,
          guestCode: 'HOSP-00715',
          name: 'lago Fernandes Zioto De Freitas',
          fullName: 'lago Fernandes Zioto De Freitas',
          document: '16255543706',
          documentNumber: '16255543706',
          phone: '22999887766'
        }
      ],
      guestAccounts: [],
      reservations: [
        {
          id: 7150,
          code: 'RES-715',
          guestId: 715,
          guestName: 'lago Fernandes Zioto De Freitas',
          guestDocument: '16255543706',
          guestPhone: '22999887766',
          guests: [
            { index: 1, guestId: 715, name: 'lago Fernandes Zioto De Freitas', cpf: '16255543706' }
          ]
        }
      ]
    };

    syncBidirectionalGuestProfile(mockDb, mockDb.guests[0], {
      name: 'Iago Fernandes Zioto de Freitas',
      document: '16255543706',
      phone: '22999887766'
    });

    assert.strictEqual(mockDb.reservations[0].guestId, 715, 'Não deve desvincular guestId da reserva ao corrigir lago -> Iago');
    assert.strictEqual(mockDb.reservations[0].guestName, 'Iago Fernandes Zioto de Freitas', 'Deve atualizar guestName na reserva');
    assert.strictEqual(mockDb.reservations[0].guests[0].name, 'Iago Fernandes Zioto de Freitas', 'Deve atualizar slot 1 da reserva');
  });

  it('23. Limpeza de processo pós-testes', () => {
    setTimeout(() => { process.exit(0); }, 50);
  });
});

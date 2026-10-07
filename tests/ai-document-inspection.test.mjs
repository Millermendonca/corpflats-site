import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import { inspectDocumentWithAI, isCamposDosGoytacazes, checkYouthLocalRisk } from '../artifacts/api-server/demo-server.mjs';

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

  it('16. Limpeza de processo pós-testes', () => {
    setTimeout(() => { process.exit(0); }, 50);
  });
});

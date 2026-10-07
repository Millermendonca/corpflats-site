import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import { inspectDocumentWithAI } from '../artifacts/api-server/demo-server.mjs';

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

  it('6. Detecção de morador de Campos dos Goytacazes/RJ (Radar Operacional)', async () => {
    const sampleImageBase64 = 'data:image/jpeg;base64,' + Buffer.alloc(350, 0xBB).toString('base64');
    const res = await inspectDocumentWithAI({
      fileBase64: sampleImageBase64,
      fileName: 'cnh_campos.jpg',
      providedName: 'Lucas Campos Peçanha',
      providedCpf: '99988877766'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.isCamposResident, true, 'Deve marcar isCamposResident quando vinculado a Campos dos Goytacazes');
    assert.strictEqual(res.extractedCity, 'Campos dos Goytacazes');
  });

  it('7. Suporte a parâmetros alternativos (aliases documentFile, declaredName, declaredCpf)', async () => {
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

  it('8. Limpeza de processo pós-testes', () => {
    setTimeout(() => { process.exit(0); }, 50);
  });
});

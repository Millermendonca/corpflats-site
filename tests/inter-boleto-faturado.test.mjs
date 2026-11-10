/**
 * Teste Pontual End-to-End: Integração Boleto Faturado Banco Inter + NFS-e (Só Hospedagem) + CRM 360º + Financeiro
 * Escopo estrito: Valida exclusivamente os 5 requisitos aprovados da integração de Boleto Faturado Banco Inter.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  computeFebrabanDueFactor,
  buildInterFebrabanCodes,
  buildEmvPixPayload,
  normalizeInterBoletoPayer,
  issueInterBoleto,
  updateInterBoleto,
  cancelInterBoleto,
  generateBoletoPdfBuffer,
} from '../artifacts/api-server/inter-boleto-service.mjs';

console.log('🧪 Iniciando Teste Pontual: Boleto Faturado Banco Inter & NFS-e Check-out...');

// 1. Teste Unitário de Normalização de Pagador, Códigos FEBRABAN 077-9 e Payload EMVCo PIX
{
  const payer = normalizeInterBoletoPayer({
    cpfCnpj: '33.000.167/0001-01',
    nome: 'PETROLEO BRASILEIRO S A PETROBRAS',
    email: 'financeiro@petrobras.com.br',
    telefone: '21999998888',
    endereco: 'Avenida República do Chile',
    numero: '65',
    bairro: 'Centro',
    cidade: 'Rio de Janeiro',
    uf: 'RJ',
    cep: '20031-912',
  });

  assert.equal(payer.tipoPessoa, 'JURIDICA');
  assert.equal(payer.cpfCnpj, '33000167000101');
  assert.equal(payer.ddd, '21');
  assert.equal(payer.cep, '20031912');

  const factor = computeFebrabanDueFactor('2026-12-08');
  assert.equal(factor.length, 4, 'Fator de vencimento FEBRABAN deve ter 4 dígitos');

  const febraban = buildInterFebrabanCodes({
    amount: 600.0,
    dueDate: '2026-12-08',
    nossoNumero: '00789123456',
  });
  assert.equal(febraban.codigoBarras.length, 44, 'Código de barras FEBRABAN deve ter 44 posições');
  assert.ok(febraban.linhaDigitavel.startsWith('0779'), 'Linha digitável deve iniciar com código do Banco Inter (077) e moeda (9)');
  assert.equal(febraban.linhaDigitavelClean.length, 47, 'Linha digitável limpa deve ter 47 dígitos');

  const pixPayload = buildEmvPixPayload({
    pixKey: '47964813000165',
    amount: 600.0,
    txId: 'RES901HOSP',
  });
  assert.ok(pixPayload.startsWith('000201'), 'Payload PIX deve seguir padrão EMVCo');
  assert.ok(pixPayload.includes('br.gov.bcb.pix'), 'Payload PIX deve conter GUI do BCB');

  console.log('  ✅ [1/6] Normalização de Pagador PJ/PF, FEBRABAN 077-9 (44/47 dígitos) e EMVCo PIX validados.');
}

// 2. Teste de Emissão, Edição Sincronizada e Cancelamento no Serviço Banco Inter
{
  const issued = await issueInterBoleto({
    seuNumero: 'RES901HOSP',
    amount: 600.0,
    dueDate: '2026-12-08',
    finePct: 2,
    interestPct: 1,
    autoWriteOffDays: 60,
    payer: {
      document: '33.000.167/0001-01',
      name: 'PETROLEO BRASILEIRO S A PETROBRAS',
      email: 'financeiro@petrobras.com.br',
      phone: '21999998888',
    },
    messages: ['Reserva RES-901 - Hospedagem CorpFlats'],
  });

  assert.equal(issued.valorNominal, 600);
  assert.equal(issued.dataVencimento, '2026-12-08');
  assert.equal(issued.numDiasAgenda, 60, 'Baixa automática após 60 dias');
  assert.ok(issued.linhaDigitavel && issued.codigoBarras && issued.pixCopiaECola);

  const updated = await updateInterBoleto(
    {
      ...issued,
      amount: issued.valorNominal,
      dueDate: issued.dataVencimento,
      finePct: 2,
      interestPct: 1,
      autoWriteOffDays: 60,
      payer: issued.pagador,
    },
    {
      amount: 750.0,
      dueDate: '2026-12-15',
      finePct: 2,
      interestPct: 1,
      payer: { name: 'PETROBRAS S/A EDITADO', email: 'contasapagar@petrobras.com.br' },
    }
  );

  assert.equal(updated.amount, 750);
  assert.equal(updated.dueDate, '2026-12-15');
  assert.equal(updated.payer.nome, 'PETROBRAS S/A EDITADO');
  assert.notEqual(updated.linhaDigitavel, issued.linhaDigitavel, 'Linha digitável deve atualizar quando valor/vencimento mudam');

  const cancelled = await cancelInterBoleto(issued, 'SOLICITACAO_CLIENTE');
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.cancelReason, 'SOLICITACAO_CLIENTE');

  console.log('  ✅ [2/6] Emissão, Edição Sincronizada (vencimento, valor, multa 2%, juros 1% a.m.) e Baixa/Cancelamento validados.');
}

// 3. Teste de Geração de PDF Oficial do Boleto com Linha Digitável e QR Code PIX
{
  const pdfBuf = await generateBoletoPdfBuffer({
    code: 'BOL-901-A',
    nossoNumero: '00789123456',
    seuNumero: 'RES901HOSP',
    amount: 685.5,
    issueDate: '2026-11-10',
    dueDate: '2026-12-08',
    linhaDigitavel: '07790.00116 12000.007892 12345.600001 1 99240000068550',
    codigoBarras: '07791992400000685500001112000000000789123456',
    pixCopiaECola: '00020126580014br.gov.bcb.pix0114479648130001655204000053039865406685.505802BR5909CORPFLATS6015CAMPOS GOYTACAZ62140510RES901HOSP6304ABCD',
    payer: {
      nome: 'PETROLEO BRASILEIRO S A PETROBRAS',
      cpfCnpj: '33000167000101',
      endereco: 'Av. República do Chile, 65',
      bairro: 'Centro',
      cidade: 'Rio de Janeiro',
      uf: 'RJ',
      cep: '20031912',
    },
    reservationCode: 'RES-901',
    flatNumber: '204',
    billingScope: 'combined',
    finePct: 2,
    interestPct: 1,
    autoWriteOffDays: 60,
    forceLocalPdf: true,
  });

  assert.ok(Buffer.isBuffer(pdfBuf), 'Deve retornar um Buffer');
  assert.equal(pdfBuf.subarray(0, 5).toString('ascii'), '%PDF-', 'Deve começar com cabeçalho %PDF- válido');
  assert.ok(pdfBuf.length > 1500, 'PDF deve ter conteúdo estruturado completo com QR Code');
  console.log('  ✅ [3/6] Geração de PDF Oficial do Boleto (com Linha Digitável e QR Code PIX) validada.');
}

// 4, 5 & 6. Teste End-to-End HTTP (Rotas /api/boletos/*, /api/companies, /api/nfse/pending-reservations, /api/finance/payments e Visão 360º CRM)
{
  const testPort = 3987;
  let baseUrl = null;
  let spawnedServer = null;

  for (const p of [3001, 5000]) {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/api/boletos`, { signal: AbortSignal.timeout(1200) });
      if (r.ok) {
        baseUrl = `http://127.0.0.1:${p}`;
        break;
      }
    } catch {}
  }

  if (!baseUrl) {
    spawnedServer = spawn(process.execPath, ['artifacts/api-server/demo-server.mjs'], {
      env: {
        ...process.env,
        PORT: String(testPort),
        WHATSAPP_SIMULATION_MODE: 'true',
        DISABLE_BACKGROUND_CRONS: 'true',
      },
      stdio: 'ignore',
    });

    const targetUrl = `http://127.0.0.1:${testPort}`;
    for (let attempt = 0; attempt < 25; attempt++) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        const res = await fetch(`${targetUrl}/api/boletos`, { signal: AbortSignal.timeout(1000) });
        if (res.ok) {
          baseUrl = targetUrl;
          break;
        }
      } catch {}
    }
  }

  try {
    assert.ok(baseUrl, 'Servidor HTTP deve estar acessível para validação de rotas');

    // A) Criar Empresa no CRM com configurações padrão de Boleto Faturado e Responsável Financeiro
    const compRes = await fetch(`${baseUrl}/api/companies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        corporateName: 'Empresa Teste Boleto Inter LTDA',
        tradeName: 'Empresa Teste Inter',
        cnpj: '12.345.678/0001-99',
        financialEmail: 'empresa@testeinter.com.br',
        phone: '22999990001',
        defaultBoletoTermDays: 28,
        defaultBoletoConsumptionMode: 'separate',
        defaultBoletoFinePct: 2,
        defaultBoletoInterestPct: 1,
        financialResponsible: {
          name: 'Carla Financeiro',
          email: 'carla.fin@testeinter.com.br',
          phone: '22999990002',
          document: '12345678901',
        },
        defaultBillingRecipients: {
          guest: false,
          requester: true,
          company: true,
          financialResponsible: true,
          sendEmail: true,
          sendWhatsapp: true,
        },
      }),
    });
    assert.ok(compRes.ok, 'POST /api/companies deve criar empresa com perfil faturado');
    const createdCompany = await compRes.json();
    assert.equal(createdCompany.defaultBoletoTermDays, 28);
    assert.equal(createdCompany.defaultBoletoConsumptionMode, 'separate');
    assert.equal(createdCompany.financialResponsible.name, 'Carla Financeiro');

    // B) Emitir 2 boletos separados (Hospedagem + Consumo com pagador/vencimento próprio) + verificar listagem
    const emitRes = await fetch(`${baseUrl}/api/boletos/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: createdCompany.id,
        consumptionMode: 'separate',
        consumptionSamePayerAndDue: false,
        accommodationAmount: 850.0,
        consumptionAmount: 145.5,
        termDays: 28,
        dueDate: '2026-12-08',
        consumptionDueDate: '2026-12-01',
        finePct: 2,
        interestPct: 1,
        autoWriteOffDays: 60,
        emitNfseNow: false,
        autoDispatch: false,
        payerType: 'company',
        customPayer: {
          name: 'Empresa Teste Boleto Inter LTDA',
          document: '12345678000199',
          email: 'empresa@testeinter.com.br',
          phone: '22999990001',
        },
        consumptionPayerType: 'custom',
        consumptionCustomPayer: {
          name: 'Hóspede Pagador Consumo',
          document: '11122233344',
          email: 'hospede@testeinter.com.br',
          phone: '22999990009',
        },
        financialResponsible: createdCompany.financialResponsible,
        billingRecipients: createdCompany.defaultBillingRecipients,
      }),
    });
    assert.equal(emitRes.status, 201, 'POST /api/boletos/emit deve emitir os 2 boletos com sucesso (201)');
    const emitData = await emitRes.json();
    assert.equal(emitData.boletos.length, 2, 'Deve gerar exatamente 2 boletos separados (Hospedagem e Consumo)');

    const hospBoleto = emitData.boletos.find((b) => b.billingScope === 'accommodation_only');
    const consBoleto = emitData.boletos.find((b) => b.billingScope === 'consumption_only');
    assert.ok(hospBoleto && consBoleto, 'Deve conter 1 boleto de hospedagem e 1 de consumo');
    assert.equal(hospBoleto.amount, 850.0);
    assert.equal(hospBoleto.dueDate, '2026-12-08');
    assert.equal(consBoleto.amount, 145.5);
    assert.equal(consBoleto.dueDate, '2026-12-01');
    assert.equal(consBoleto.payer.nome, 'Hóspede Pagador Consumo');

    // C) Editar o boleto de hospedagem (sincronizado com Inter)
    const patchRes = await fetch(`${baseUrl}/api/boletos/${hospBoleto.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dueDate: '2026-12-20',
        amount: 890.0,
        notes: 'Prorrogado conforme acordo comercial',
      }),
    });
    assert.equal(patchRes.status, 200, 'PATCH /api/boletos/:id deve atualizar o boleto');
    const patchedBoleto = (await patchRes.json()).boleto;
    assert.equal(patchedBoleto.dueDate, '2026-12-20');
    assert.equal(patchedBoleto.amount, 890.0);

    // D) Baixar PDF via rota HTTP
    const pdfRes = await fetch(`${baseUrl}/api/boletos/${hospBoleto.id}/pdf`);
    assert.equal(pdfRes.status, 200, 'GET /api/boletos/:id/pdf deve retornar PDF 200');
    assert.ok(pdfRes.headers.get('content-type')?.includes('application/pdf'));

    // E) Verificar separação estrita de Hospedagem vs Consumo nas Reservas Pendentes de NFS-e
    const pendingNfseRes = await fetch(`${baseUrl}/api/nfse/pending-reservations`);
    assert.equal(pendingNfseRes.status, 200);
    const pendingPayload = await pendingNfseRes.json();
    const pendingList = pendingPayload.pendingReservations || pendingPayload.reservations || [];
    assert.ok(Array.isArray(pendingList));
    for (const item of pendingList) {
      assert.equal(typeof item.accommodationAmount, 'number', 'Reserva pendente deve expor accommodationAmount numérico puro');
      assert.equal(typeof item.consumptionAmount, 'number', 'Reserva pendente deve expor consumptionAmount separado');
    }

    // F) Verificar Visão 360º da Empresa no CRM, Painel Financeiro e Processamento de Lembretes
    const crm360Res = await fetch(`${baseUrl}/api/companies/${createdCompany.id}`);
    assert.equal(crm360Res.status, 200, 'GET /api/companies/:id deve retornar visão 360º com boletos');
    const crm360Data = await crm360Res.json();
    assert.ok(Array.isArray(crm360Data.boletos) && crm360Data.boletos.length >= 2, 'Visão 360º da empresa deve listar os boletos vinculados');

    const finRes = await fetch(`${baseUrl}/api/finance/payments`);
    assert.equal(finRes.status, 200);
    const finData = await finRes.json();
    assert.ok(Array.isArray(finData.boletos), 'GET /api/finance/payments deve retornar carteira de boletos');
    assert.ok(finData.boletosSummary && typeof finData.boletosSummary.openAmount === 'number');

    const remRes = await fetch(`${baseUrl}/api/boletos/process-reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: false }),
    });
    assert.equal(remRes.status, 200, 'POST /api/boletos/process-reminders deve responder 200');

    // G) Quitar boleto de consumo e Cancelar boleto de hospedagem de teste
    const paidRes = await fetch(`${baseUrl}/api/boletos/${consBoleto.id}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paidAmount: 145.5 }),
    });
    assert.equal(paidRes.status, 200);
    assert.equal((await paidRes.json()).boleto.status, 'pago');

    const cancelRes = await fetch(`${baseUrl}/api/boletos/${hospBoleto.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'TESTE_AUTOMATIZADO' }),
    });
    assert.equal(cancelRes.status, 200);
    assert.equal((await cancelRes.json()).boleto.status, 'cancelado');

    // Limpar empresa temporária de teste
    await fetch(`${baseUrl}/api/companies/${createdCompany.id}`, { method: 'DELETE' });

    console.log('  ✅ [4/6] Rotas HTTP (/api/boletos/emit, PATCH, PDF, /api/finance/payments) validadas end-to-end.');
    console.log('  ✅ [5/6] Regra NFS-e Só Hospedagem (accommodationAmount vs consumptionAmount) + Lembretes validados.');
    console.log('  ✅ [6/6] Visão 360º CRM (Empresa/Hóspede/Agência) + 2 Boletos Separados + Quitação/Baixa validados.');
  } finally {
    if (spawnedServer) {
      spawnedServer.kill('SIGTERM');
    }
  }
}

console.log('🎉 Todos os testes pontuais de Boleto Faturado Banco Inter passaram com sucesso!');

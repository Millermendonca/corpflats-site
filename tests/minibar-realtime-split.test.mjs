/**
 * Teste Pontual Estrito — Divisão em Tempo Real do Frigobar, Vistoria Final Sem Marcação,
 * Identificação dos Demais Hóspedes (FNRH / Inline) e Disparo de WhatsApp Pós-Vistoria
 *
 * Execução: node --test tests/minibar-realtime-split.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 4398;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const isolatedDbPath = path.join(
  os.tmpdir(),
  `test-minibar-realtime-split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`
);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch (_) {}
}

describe("Frigobar — Divisão em Tempo Real, Vistoria Final e WhatsApp Pós-Vistoria", () => {
  it("1. Paridade SHA-256 Twin-Server e Estrutura Visual da Página do Hóspede (guest-minibar.tsx)", () => {
    const fileA = fs.readFileSync(path.join(rootDir, "artifacts/api-server/demo-server.mjs"));
    const fileB = fs.readFileSync(path.join(rootDir, "scripts/demo-server.mjs"));
    const hashA = crypto.createHash("sha256").update(fileA).digest("hex");
    const hashB = crypto.createHash("sha256").update(fileB).digest("hex");
    assert.strictEqual(hashA, hashB, "demo-server.mjs deve manter paridade SHA-256 exata entre artifacts/ e scripts/");

    const uiCode = fs.readFileSync(
      path.join(rootDir, "artifacts/limpeza/src/pages/guest-minibar.tsx"),
      "utf-8"
    );

    // 1.1 Cardápio Digital recolhido por padrão
    assert.match(
      uiCode,
      /const\s+\[showReferenceCatalog,\s*setShowReferenceCatalog\]\s*=\s*useState(?:<boolean>)?\(false\)/,
      "Cardápio Digital deve iniciar recolhido por padrão (showReferenceCatalog = false)"
    );

    // 1.2 Aviso único compacto no topo com botão integrado de check-out e remoção do card de troca de usuário no topo
    assert.match(
      uiCode,
      /Consumo lançado diariamente • Pagamento liberado no check-out/,
      "Os 2 avisos do topo devem estar fundidos em 1 único card compacto"
    );
    assert.match(
      uiCode,
      /Já efetuei o check-out — Liberar Pagamento/,
      "O card compacto do topo deve ter o botão integrado para informar o check-out"
    );
    assert.doesNotMatch(
      uiCode,
      /Quem está acessando o frigobar\?/,
      "Não deve existir card de troca de usuário no topo da página"
    );

    // 1.3 As 3 opções rápidas no Extrato de Consumo por Dia + seção de hóspedes do flat
    assert.match(uiCode, /100% Titular \(Padrão\)/, "Extrato deve exibir opção rápida '100% Titular (Padrão)'");
    assert.match(uiCode, /Dividir Meio a Meio/, "Extrato deve exibir opção rápida 'Dividir Meio a Meio'");
    assert.match(uiCode, /Marcar por Item/, "Extrato deve exibir opção rápida 'Marcar por Item'");
    assert.match(
      uiCode,
      /Hóspedes do Flat — Cobrança e Nota Fiscal por Consumidor/,
      "Extrato deve permitir identificar/completar dados dos demais hóspedes do flat inline"
    );

    // 1.4 Ordem da página: Extrato de Consumo por Dia & Divisão posicionado ACIMA do Cardápio Digital do Frigobar
    const statementIdx = uiCode.indexOf("Extrato de Consumo por Dia & Divisão");
    const catalogIdx = uiCode.indexOf("Cardápio Digital do Frigobar");
    assert.ok(statementIdx > 0 && catalogIdx > 0, "Ambos os blocos (Extrato e Cardápio) devem existir na página");
    assert.ok(
      statementIdx < catalogIdx,
      "O Extrato de Consumo por Dia & Divisão deve aparecer antes/acima do Cardápio Digital recolhido"
    );

    // 1.5 Limpeza visual e remoção de redundâncias (Zero Poluição Visual)
    assert.doesNotMatch(uiCode, /Salvo em tempo real/, "Tag 'Salvo em tempo real' deve ser removida");
    assert.doesNotMatch(uiCode, /Salvo na reserva/, "Tag 'Salvo na reserva' deve ser removida");
    assert.doesNotMatch(uiCode, /Check-out Confirmado[\s\S]*Pagamento Liberado!/, "Card verde redundante de check-out deve ser removido");
    assert.doesNotMatch(uiCode, /✓ Dados NF OK/, "Badge poluída '✓ Dados NF OK' deve ser removida");
    assert.doesNotMatch(uiCode, /📱|🪪|✉️/, "Não deve exibir linha poluída de telefone/CPF/e-mail nos cards dos hóspedes");
    assert.doesNotMatch(uiCode, /Pedido #\{ord\.id\}/, "Não deve exibir código técnico 'Pedido #ORD-MB-...' no histórico");
    assert.match(uiCode, /expandedDetailItemKey/, "Detalhes de lançamento do item devem expandir somente ao clicar");
    assert.match(
      uiCode,
      /pendingBalance > 0 && splitMode !== "titular"/,
      "Lista de divisão por hóspede só deve aparecer quando houver saldo pendente e não estiver em 100% Titular"
    );
    assert.match(
      uiCode,
      /function isGuestPlaceholderName/,
      "Deve detectar nomes genéricos ('2º Hóspede (Acompanhante)') sem exigir âncora final $"
    );
    assert.match(
      uiCode,
      /if \(splitMode === "titular"\)\s*\{\s*return shares\.find\(\(s\) => Number\(s\.guestIndex\) === 1\)/,
      "No modo '100% Titular', a cota ativa deve apontar sempre para o Hóspede 1 (Titular)"
    );
    assert.match(
      uiCode,
      /const firstPending = shares\.find\(\(s\) => Number\(s\.amount \|\| 0\) > 0\)/,
      "Quando o hóspede selecionado tiver saldo R$ 0,00, deve fazer fallback automático para o hóspede com saldo pendente > 0"
    );

    const portalCode = fs.readFileSync(
      path.join(rootDir, "artifacts/limpeza/src/pages/guest-portal.tsx"),
      "utf-8"
    );
    assert.doesNotMatch(
      portalCode,
      /O consumo de frigobar é um serviço independente/,
      "Caixa amarela longa de aviso do frigobar no guest-portal.tsx deve ser removida"
    );
  });

  describe("2. Fluxos E2E de Persistência em Tempo Real, Vistoria Final e Disparo de WhatsApp", () => {
    const checkinDate = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const checkoutDate = new Date(Date.now() + 86400000).toISOString().split("T")[0];

    before(async () => {
      const initialDb = {
        reservations: [
          {
            id: 778901,
            code: "RES-BYITEM-214",
            flatId: 6,
            flatNumber: "214",
            guestId: 9901,
            guestName: "Carlos Eduardo Martins",
            guestPhone: "5522988110011",
            guestDocument: "11122233344",
            guestEmail: "carlos.martins@teste.com",
            status: "confirmada",
            checkinDate,
            checkoutDate,
            totalAmount: 500.0,
            paidAmount: 500.0,
            isPaid: true,
            channel: "direct",
            numGuests: 2,
            guestsCount: 2,
            fnrhHistory: [
              {
                guestIndex: 2,
                fullName: "Fernanda Costa",
                phone: "5522988110022"
              }
            ]
          },
          {
            id: 778902,
            code: "RES-HALF-215",
            flatId: 7,
            flatNumber: "215",
            guestId: 9902,
            guestName: "Roberto Mendes",
            guestPhone: "5522988110033",
            guestDocument: "22233344455",
            guestEmail: "roberto.mendes@teste.com",
            status: "confirmada",
            checkinDate,
            checkoutDate,
            totalAmount: 600.0,
            paidAmount: 600.0,
            isPaid: true,
            channel: "direct",
            numGuests: 2,
            guests: [
              {
                index: 1,
                name: "Roberto Mendes",
                phone: "5522988110033",
                cpf: "22233344455",
                email: "roberto.mendes@teste.com"
              },
              {
                index: 2,
                name: "Juliana Paiva",
                phone: "5522988110044",
                cpf: "66677788899",
                email: "juliana.paiva@teste.com"
              }
            ]
          },
          {
            id: 778903,
            code: "RES-TITULAR-216",
            flatId: 8,
            flatNumber: "216",
            guestId: 9903,
            guestName: "Marcos Vinicius Alves",
            guestPhone: "5522988110055",
            guestDocument: "33344455566",
            guestEmail: "marcos.alves@teste.com",
            status: "confirmada",
            checkinDate,
            checkoutDate,
            totalAmount: 550.0,
            paidAmount: 550.0,
            isPaid: true,
            channel: "direct",
            numGuests: 2,
            guests: [
              {
                index: 1,
                name: "Marcos Vinicius Alves",
                phone: "5522988110055",
                cpf: "33344455566",
                email: "marcos.alves@teste.com"
              },
              {
                index: 2,
                name: "Camila Rocha",
                phone: "5522988110066",
                cpf: "77788899900",
                email: "camila.rocha@teste.com"
              }
            ]
          }
        ],
        guests: [],
        minibarOrders: [],
        minibarInspections: []
      };

      fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

      const env = { ...process.env };
      delete env.DATABASE_URL;

      serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
        cwd: rootDir,
        env: {
          ...env,
          PORT: String(TEST_PORT),
          DATA_FILE: isolatedDbPath,
          DATABASE_FILE: isolatedDbPath,
          NODE_ENV: "test"
        },
        stdio: "pipe"
      });

      let isReady = false;
      for (let i = 0; i < 50; i++) {
        try {
          const res = await fetch(`${BASE_URL}/api/system/version`);
          if (res.ok) {
            isReady = true;
            break;
          }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 200));
      }

      if (!isReady) {
        throw new Error(`Falha ao iniciar servidor de testes na porta ${TEST_PORT}`);
      }
    });

    after(async () => {
      if (serverProcess?.pid) {
        killProcessTree(serverProcess.pid);
      }
      try {
        if (fs.existsSync(isolatedDbPath)) {
          fs.unlinkSync(isolatedDbPath);
        }
      } catch (_) {}
    });

    it("2.1 Modo 'Marcar por Item' (by_item) + Dados do 2º Hóspede + Item na Vistoria Final sem Marcação vai para o Titular + WhatsApp Pós-Vistoria", async () => {
      const resCode = "RES-BYITEM-214";
      const flatNum = "214";

      // 1. Lançamento diário durante a estadia: 2x Cerveja Long Neck (2x R$ 20 = R$ 40,00) + 1x Refrigerante (R$ 12,00) = R$ 52,00
      const resDaily = await fetch(`${BASE_URL}/api/minibar/inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: flatNum,
          reservationCode: resCode,
          inspectedBy: "Camareira Diária",
          status: "lancamento_diario",
          isDailyLaunch: true,
          missingItems: [
            { productId: "prod_cerveja_long_neck", quantity: 2 },
            { productId: "prod_refrigerante", quantity: 1 }
          ]
        })
      });
      assert.strictEqual(resDaily.status, 200);
      const dataDaily = await resDaily.json();
      assert.strictEqual(dataDaily.success, true);
      assert.strictEqual(
        (dataDaily.whatsappMessagesSent || []).length,
        0,
        "Lançamento diário durante a estadia NÃO deve disparar WhatsApp de cobrança"
      );

      // 2. Quando nada é marcado, o padrão deve ser 100% Titular (pagador e tomador da NF) e deve puxar o 2º hóspede da FNRH
      const resCtx = await fetch(`${BASE_URL}/api/minibar/reservation-context/${resCode}`);
      assert.strictEqual(resCtx.status, 200);
      const dataCtx = await resCtx.json();
      assert.strictEqual(dataCtx.success, true);
      assert.strictEqual(dataCtx.pendingBalance, 52.0);
      assert.strictEqual(dataCtx.splitConfig.mode, "titular");
      assert.strictEqual(dataCtx.splitBreakdown.shares[0].guestIndex, 1);
      assert.strictEqual(dataCtx.splitBreakdown.shares[0].amount, 52.0);

      const guest2FromFnrh = dataCtx.reservationGuests.find(g => g.index === 2);
      assert.ok(guest2FromFnrh, "Deve puxar automaticamente o 2º hóspede cadastrado na FNRH");
      assert.strictEqual(guest2FromFnrh.name, "Fernanda Costa");
      assert.strictEqual(guest2FromFnrh.phone, "5522988110022");

      // 3. Completar dados faltantes do 2º hóspede (CPF/CNPJ e E-mail) via /api/minibar/reservation-guests
      const resCompleteGuest2 = await fetch(`${BASE_URL}/api/minibar/reservation-guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: resCode,
          flatNumber: flatNum,
          guestUpdate: {
            index: 2,
            name: "Fernanda Costa",
            phone: "5522988110022",
            cpf: "55566677788",
            email: "fernanda.costa@teste.com"
          }
        })
      });
      assert.strictEqual(resCompleteGuest2.status, 200);
      const dataCompleteGuest2 = await resCompleteGuest2.json();
      assert.strictEqual(dataCompleteGuest2.success, true);
      const guest1Check = dataCompleteGuest2.reservationGuests.find(g => g.index === 1);
      const guest2Updated = dataCompleteGuest2.reservationGuests.find(g => g.index === 2);
      assert.strictEqual(guest1Check.name, "Carlos Eduardo Martins", "Titular não deve ser sobrescrito ao editar o 2º hóspede");
      assert.strictEqual(guest2Updated.cpf, "55566677788");
      assert.strictEqual(guest2Updated.email, "fernanda.costa@teste.com");

      // 4. Salvar divisão "Marcar por Item" (by_item) em tempo real durante a estadia:
      // 4a. Testar primeiro divisão de unidades (2x Cerveja -> 1 un. Hóspede 1 e 1 un. Hóspede 2)
      const pendingItems = dataCompleteGuest2.statement.pendingLaunchedItems;
      const beerItem = pendingItems.find(it => it.productId === "prod_cerveja_long_neck");
      const sodaItem = pendingItems.find(it => it.productId === "prod_refrigerante");
      assert.ok(beerItem && sodaItem);

      const resUnitSplit = await fetch(`${BASE_URL}/api/minibar/split-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: resCode,
          flatNumber: flatNum,
          mode: "by_item",
          itemAssignments: {
            [sodaItem.itemKey]: { 1: 1, 2: 0 },
            [beerItem.itemKey]: { 1: 1, 2: 1 }
          }
        })
      });
      assert.strictEqual(resUnitSplit.status, 200);
      const dataUnitSplit = await resUnitSplit.json();
      assert.strictEqual(
        dataUnitSplit.splitBreakdown.shares.find(s => s.guestIndex === 1).amount,
        32.0,
        "Com 1x Refrigerante (12) + 1x Cerveja (20), Hóspede 1 deve ter R$ 32,00"
      );
      assert.strictEqual(
        dataUnitSplit.splitBreakdown.shares.find(s => s.guestIndex === 2).amount,
        20.0,
        "Com 1x Cerveja (20), Hóspede 2 deve ter R$ 20,00"
      );

      // 4b. Ajustar para:
      // - 1x Refrigerante (R$ 12,00) marcado para o Hóspede 1 (Titular, index 1)
      // - 2x Cerveja Long Neck (R$ 40,00) marcadas para o Hóspede 2 (Fernanda, index 2)
      const resSaveByItem = await fetch(`${BASE_URL}/api/minibar/split-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: resCode,
          flatNumber: flatNum,
          mode: "by_item",
          itemAssignments: {
            [sodaItem.itemKey]: { 1: 1, 2: 0 },
            [beerItem.itemKey]: { 1: 0, 2: 2 }
          }
        })
      });
      assert.strictEqual(resSaveByItem.status, 200);
      const dataSaveByItem = await resSaveByItem.json();
      assert.strictEqual(dataSaveByItem.splitBreakdown.mode, "by_item");

      const share1DuringStay = dataSaveByItem.splitBreakdown.shares.find(s => s.guestIndex === 1);
      const share2DuringStay = dataSaveByItem.splitBreakdown.shares.find(s => s.guestIndex === 2);
      assert.strictEqual(share1DuringStay.amount, 12.0);
      assert.strictEqual(share2DuringStay.amount, 40.0);

      // 5. Hóspede informa check-out: libera pagamento e pré-configura ordens separadas SEM enviar WhatsApp de cobrança de frigobar
      const resCheckout = await fetch(`${BASE_URL}/api/public/minibar/confirm-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: resCode,
          flatNumber: flatNum
        })
      });
      assert.strictEqual(resCheckout.status, 200);
      const dataCheckout = await resCheckout.json();
      assert.strictEqual(dataCheckout.success, true);
      assert.strictEqual(dataCheckout.isCheckedOut, true);
      assert.strictEqual(dataCheckout.whatsappMessagesSent, undefined, "Clique de check-out NÃO deve disparar cobrança de frigobar por WhatsApp");
      assert.strictEqual((dataCheckout.autoSplitOrders || []).length, 2);

      // 6. Repositor finaliza vistoria pós-check-out e lança +1 Água Mineral Garrafa (R$ 7,00) SEM marcação:
      // No modo "by_item", o item da vistoria final sem marcação deve ir automaticamente para o Hóspede Principal (Titular: 12 + 7 = R$ 19,00),
      // enquanto o Hóspede 2 paga exatamente os itens que marcou (R$ 40,00).
      // E SOMENTE agora na vistoria final o WhatsApp é disparado para cada respectivo consumidor!
      const resFinalInsp = await fetch(`${BASE_URL}/api/minibar/inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: flatNum,
          reservationCode: resCode,
          inspectedBy: "Repositora Final Anserve",
          status: "divergencia",
          isDailyLaunch: false,
          isFinalCheckoutInspection: true,
          missingItems: [
            { productId: "prod_agua_mineral_garrafa", quantity: 1 } // Item novo da vistoria final (R$ 7,00) sem marcação
          ]
        })
      });
      assert.strictEqual(resFinalInsp.status, 200);
      const dataFinalInsp = await resFinalInsp.json();
      assert.strictEqual(dataFinalInsp.success, true);
      assert.ok(Array.isArray(dataFinalInsp.whatsappMessagesSent), "Vistoria final deve disparar WhatsApp por consumidor");
      assert.strictEqual(dataFinalInsp.whatsappMessagesSent.length, 2, "Deve enviar 1 WhatsApp para o Titular e 1 para o 2º Hóspede");

      const msgG1 = dataFinalInsp.whatsappMessagesSent.find(m => m.guestIndex === 1);
      const msgG2 = dataFinalInsp.whatsappMessagesSent.find(m => m.guestIndex === 2);
      assert.ok(msgG1 && msgG2);
      assert.strictEqual(
        msgG1.amount,
        19.0,
        "No modo 'by_item', o item lançado na vistoria final sem marcação (R$ 7,00) deve ir para o Hóspede Principal (12 + 7 = 19)"
      );
      assert.match(
        msgG1.message,
        /Nota:\* Itens lançados na vistoria final sem marcação prévia foram atribuídos automaticamente ao Hóspede Principal \(Titular\)/,
        "A mensagem do Titular deve informar sobre os itens da vistoria final sem marcação atribuídos a ele"
      );
      assert.strictEqual(
        msgG2.amount,
        40.0,
        "No modo 'by_item', o 2º Hóspede paga exatamente os itens que marcou (R$ 40,00)"
      );
      assert.match(msgG1.link, /guestIndex=1/);
      assert.match(msgG2.link, /guestIndex=2/);

      // 7. Verifica que cada cobrança e Nota Fiscal está configurada para o respectivo hóspede consumidor (tomador da NF)
      // e que preConfiguredCheckoutSplits NÃO duplica a ordem bruta de divergência junto com as ordens de split
      const resHub = await fetch(`${BASE_URL}/api/minibar/invoices/hub`);
      assert.strictEqual(resHub.status, 200);
      const dataHub = await resHub.json();
      const preSplitsForRes = (dataHub.preConfiguredCheckoutSplits || []).filter(inv => inv.reservationCode === resCode);
      assert.strictEqual(
        preSplitsForRes.length,
        2,
        "preConfiguredCheckoutSplits deve conter exatamente as 2 ordens separadas por hóspede (sem duplicar ORD-MB-DIV)"
      );
      const ordG1 = (dataHub.invoices || []).find(inv => inv.id === `ORD-MB-SPLIT-${resCode}-G1`);
      const ordG2 = (dataHub.invoices || []).find(inv => inv.id === `ORD-MB-SPLIT-${resCode}-G2`);
      assert.ok(ordG1 && ordG2, "Hub de Notas Fiscais deve conter as 2 ordens separadas por hóspede consumidor");

      assert.strictEqual(ordG1.guestName, "Carlos Eduardo Martins");
      assert.strictEqual(ordG1.documentNumber, "11122233344");
      assert.strictEqual(ordG1.totalAmount, 19.0);

      assert.strictEqual(ordG2.guestName, "Fernanda Costa");
      assert.strictEqual(ordG2.documentNumber, "55566677788");
      assert.strictEqual(ordG2.email, "fernanda.costa@teste.com");
      assert.strictEqual(ordG2.totalAmount, 40.0);

      // 8. Pagamento sequencial no modo 'by_item': 2º Hóspede (Fernanda) paga sua parte (R$ 40,00) primeiro
      const resPayG2 = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: `ORD-MB-SPLIT-${resCode}-G2`,
          reservationCode: resCode,
          flatNumber: flatNum,
          requireCheckout: true,
          partialMode: "configured_split",
          paymentMethod: "pix",
          invoicePreference: "detailed",
          document: "55566677788",
          documentType: "cpf",
          email: "fernanda.costa@teste.com",
          phone: "5522988110022",
          consumerGuest: {
            index: 2,
            name: "Fernanda Costa",
            phone: "5522988110022",
            email: "fernanda.costa@teste.com",
            document: "55566677788"
          }
        })
      });
      assert.strictEqual(resPayG2.status, 200);
      const dataPayG2 = await resPayG2.json();
      assert.strictEqual(dataPayG2.totalAmount, 40.0);

      const resSimG2 = await fetch(`${BASE_URL}/api/pms/mercadopago/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "payment",
          external_reference: `MB-${dataPayG2.orderId}`,
          status: "approved",
          transaction_amount: 40.0
        })
      });
      assert.strictEqual(resSimG2.status, 200);

      // Verifica que a parte do Hóspede 1 permanece exatamente R$ 19,00 (1x Refrigerante R$ 12 + 1x Água R$ 7) e a parte do Hóspede 2 está quitada (R$ 0,00)
      const resCtxAfterG2 = await fetch(`${BASE_URL}/api/minibar/reservation-context/${resCode}?guestIndex=1`);
      const dataCtxAfterG2 = await resCtxAfterG2.json();
      assert.strictEqual(dataCtxAfterG2.pendingBalance, 19.0);
      assert.strictEqual(dataCtxAfterG2.totalPaidAmount, 40.0);
      const s1After = dataCtxAfterG2.splitBreakdown.shares.find(s => s.guestIndex === 1);
      const s2After = dataCtxAfterG2.splitBreakdown.shares.find(s => s.guestIndex === 2);
      assert.strictEqual(s1After.amount, 19.0, "Hóspede 1 deve continuar devendo exatamente seus R$ 19,00");
      assert.strictEqual(s2After.amount, 0, "Hóspede 2 já pagou sua parte e deve ter saldo pendente R$ 0,00");
      assert.strictEqual(s2After.isSharePaid, true);
    });

    it("2.2 Modo 'Dividir Meio a Meio' (half_and_half): Divide todo o saldo (inclusive itens da vistoria final sem marcação) 50/50 e preserva a cota do 2º hóspede após pagamento do 1º", async () => {
      const resCode = "RES-HALF-215";
      const flatNum = "215";

      // 1. Lançamento diário durante a estadia: 2x Cerveja Long Neck = R$ 40,00
      const resDaily = await fetch(`${BASE_URL}/api/minibar/inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: flatNum,
          reservationCode: resCode,
          inspectedBy: "Camareira Diária",
          status: "lancamento_diario",
          isDailyLaunch: true,
          missingItems: [{ productId: "prod_cerveja_long_neck", quantity: 2 }]
        })
      });
      assert.strictEqual(resDaily.status, 200);

      // 2. Quarto escolhe "Dividir Meio a Meio" (half_and_half) durante a estadia
      const resSaveHalf = await fetch(`${BASE_URL}/api/minibar/split-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: resCode,
          flatNumber: flatNum,
          mode: "half_and_half"
        })
      });
      assert.strictEqual(resSaveHalf.status, 200);
      const dataSaveHalf = await resSaveHalf.json();
      assert.strictEqual(dataSaveHalf.splitBreakdown.mode, "half_and_half");
      assert.strictEqual(dataSaveHalf.splitBreakdown.shares[0].amount, 20.0);
      assert.strictEqual(dataSaveHalf.splitBreakdown.shares[1].amount, 20.0);

      // 3. Repositor realiza vistoria final pós-check-out com +1 Refrigerante (R$ 12,00) sem marcação -> Saldo Total = R$ 52,00
      // Como o quarto escolheu "Dividir meio a meio", TODO o saldo (inclusive o último dia / vistoria final) divide 50/50 (R$ 26,00 para cada)!
      const resFinal = await fetch(`${BASE_URL}/api/minibar/inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: flatNum,
          reservationCode: resCode,
          inspectedBy: "Repositora Final Anserve",
          status: "divergencia",
          isDailyLaunch: false,
          isFinalCheckoutInspection: true,
          missingItems: [
            { productId: "prod_refrigerante", quantity: 1 } // +R$ 12,00 na vistoria final -> Total R$ 52,00
          ]
        })
      });
      assert.strictEqual(resFinal.status, 200);
      const dataFinal = await resFinal.json();
      assert.strictEqual(dataFinal.success, true);
      assert.strictEqual(
        dataFinal.statement.isCheckedOut,
        true,
        "A vistoria final pós-check-out deve liberar o pagamento imediatamente mesmo que o hóspede não tenha clicado antes no botão manual de check-out"
      );
      assert.strictEqual(dataFinal.whatsappMessagesSent.length, 2);

      const msg1 = dataFinal.whatsappMessagesSent.find(m => m.guestIndex === 1);
      const msg2 = dataFinal.whatsappMessagesSent.find(m => m.guestIndex === 2);
      assert.ok(msg1 && msg2);
      assert.strictEqual(
        msg1.amount,
        26.0,
        "No modo 'half_and_half', o Hóspede 1 deve pagar 50% de todo o saldo incluindo a vistoria final (R$ 26,00)"
      );
      assert.strictEqual(
        msg2.amount,
        26.0,
        "No modo 'half_and_half', o Hóspede 2 deve pagar 50% de todo o saldo incluindo a vistoria final (R$ 26,00)"
      );

      // 4. Pagamento sequencial no modo 'half_and_half':
      // Hóspede 1 clica no seu link do WhatsApp e paga sua cota de R$ 26,00 (com requireCheckout: true)
      const resOrderG1 = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: `ORD-MB-SPLIT-${resCode}-G1`,
          reservationCode: resCode,
          flatNumber: flatNum,
          requireCheckout: true,
          partialMode: "configured_split",
          paymentMethod: "pix",
          invoicePreference: "detailed",
          document: "22233344455",
          documentType: "cpf",
          email: "ana.paula@teste.com",
          phone: "5521999113344",
          consumerGuest: {
            index: 1,
            name: "Ana Paula Souza",
            phone: "5521999113344",
            email: "ana.paula@teste.com",
            document: "22233344455"
          }
        })
      });
      assert.strictEqual(resOrderG1.status, 200, "Pagamento pós-vistoria final não pode falhar com CHECKOUT_REQUIRED");
      const dataOrderG1 = await resOrderG1.json();
      assert.strictEqual(dataOrderG1.totalAmount, 26.0);

      const resSimPayG1 = await fetch(`${BASE_URL}/api/pms/mercadopago/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "payment",
          external_reference: `MB-${dataOrderG1.orderId}`,
          status: "approved",
          transaction_amount: 26.0
        })
      });
      assert.strictEqual(resSimPayG1.status, 200);

      // 5. Hóspede 2 abre seu link (?guestIndex=2) para pagar sua metade:
      // Sua parte DEVE continuar sendo R$ 26,00 (e NÃO ser re-dividida pela metade para R$ 13,00!)
      const resCtxG2 = await fetch(`${BASE_URL}/api/minibar/reservation-context/${resCode}?guestIndex=2`);
      assert.strictEqual(resCtxG2.status, 200);
      const dataCtxG2 = await resCtxG2.json();
      assert.strictEqual(dataCtxG2.pendingBalance, 26.0);
      assert.strictEqual(dataCtxG2.totalPaidAmount, 26.0);

      const g1ShareAfter = dataCtxG2.splitBreakdown.shares.find(s => s.guestIndex === 1);
      const g2ShareAfter = dataCtxG2.splitBreakdown.shares.find(s => s.guestIndex === 2);
      assert.strictEqual(g1ShareAfter.amount, 0, "Cota do Hóspede 1 já foi quitada e deve ser R$ 0,00");
      assert.strictEqual(g1ShareAfter.paidAmount, 26.0);
      assert.strictEqual(g1ShareAfter.isSharePaid, true);
      assert.strictEqual(
        g2ShareAfter.amount,
        26.0,
        "Cota do Hóspede 2 deve permanecer R$ 26,00 após o pagamento do Hóspede 1 (não pode cair para R$ 13,00)"
      );

      // 6. Hóspede 2 paga sua cota de R$ 26,00
      const resOrderG2 = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: `ORD-MB-SPLIT-${resCode}-G2`,
          reservationCode: resCode,
          flatNumber: flatNum,
          requireCheckout: true,
          partialMode: "configured_split",
          paymentMethod: "pix",
          invoicePreference: "detailed",
          document: "99988877766",
          documentType: "cpf",
          email: "roberto.lima@teste.com",
          phone: "5521988776655",
          consumerGuest: {
            index: 2,
            name: "Roberto Lima",
            phone: "5521988776655",
            email: "roberto.lima@teste.com",
            document: "99988877766"
          }
        })
      });
      assert.strictEqual(resOrderG2.status, 200);
      const dataOrderG2 = await resOrderG2.json();
      assert.strictEqual(dataOrderG2.totalAmount, 26.0);

      const resSimPayG2 = await fetch(`${BASE_URL}/api/pms/mercadopago/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "payment",
          external_reference: `MB-${dataOrderG2.orderId}`,
          status: "approved",
          transaction_amount: 26.0
        })
      });
      assert.strictEqual(resSimPayG2.status, 200);

      const resCtxFinal = await fetch(`${BASE_URL}/api/minibar/reservation-context/${resCode}`);
      const dataCtxFinal = await resCtxFinal.json();
      assert.strictEqual(dataCtxFinal.pendingBalance, 0);
      assert.strictEqual(dataCtxFinal.totalPaidAmount, 52.0);
    });

    it("2.3 Modo Padrão ('100% Titular' quando nada foi marcado): Envia 100% da cobrança e NF para o hóspede titular na vistoria final", async () => {
      const resCode = "RES-TITULAR-216";
      const flatNum = "216";

      // 1. Lançamento diário durante a estadia sem nenhuma marcação do hóspede: 1x Cerveja Long Neck (R$ 20,00)
      const resDaily = await fetch(`${BASE_URL}/api/minibar/inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: flatNum,
          reservationCode: resCode,
          inspectedBy: "Camareira Diária",
          status: "lancamento_diario",
          isDailyLaunch: true,
          missingItems: [{ productId: "prod_cerveja_long_neck", quantity: 1 }]
        })
      });
      assert.strictEqual(resDaily.status, 200);

      // 2. Vistoria final pós-check-out com +1 Água Mineral Garrafa (R$ 7,00) -> Total R$ 27,00 (100% Titular por padrão)
      const resFinal = await fetch(`${BASE_URL}/api/minibar/inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: flatNum,
          reservationCode: resCode,
          inspectedBy: "Repositora Final Anserve",
          status: "divergencia",
          isDailyLaunch: false,
          isFinalCheckoutInspection: true,
          missingItems: [{ productId: "prod_agua_mineral_garrafa", quantity: 1 }]
        })
      });
      assert.strictEqual(resFinal.status, 200);
      const dataFinal = await resFinal.json();
      assert.strictEqual(dataFinal.success, true);
      assert.strictEqual(
        dataFinal.whatsappMessagesSent.length,
        1,
        "Quando nada foi marcado (100% Titular), apenas o Hóspede Titular recebe cobrança via WhatsApp"
      );
      assert.strictEqual(dataFinal.whatsappMessagesSent[0].guestIndex, 1);
      assert.strictEqual(dataFinal.whatsappMessagesSent[0].guestName, "Marcos Vinicius Alves");
      assert.strictEqual(dataFinal.whatsappMessagesSent[0].amount, 27.0);
    });
  });
});

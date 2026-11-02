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

      // 3. Completar dados faltantes do 2º hóspede (CPF/CNPJ e E-mail) na seção de divisão do extrato
      const resCompleteGuest2 = await fetch(`${BASE_URL}/api/minibar/split-config`, {
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
      const guest2Updated = dataCompleteGuest2.reservationGuests.find(g => g.index === 2);
      assert.strictEqual(guest2Updated.cpf, "55566677788");
      assert.strictEqual(guest2Updated.email, "fernanda.costa@teste.com");

      // 4. Salvar divisão "Marcar por Item" (by_item) em tempo real durante a estadia:
      // - 1x Refrigerante (R$ 12,00) marcado para o Hóspede 1 (Titular, index 1)
      // - 2x Cerveja Long Neck (R$ 40,00) marcadas para o Hóspede 2 (Fernanda, index 2)
      const pendingItems = dataCompleteGuest2.statement.pendingLaunchedItems;
      const beerItem = pendingItems.find(it => it.productId === "prod_cerveja_long_neck");
      const sodaItem = pendingItems.find(it => it.productId === "prod_refrigerante");
      assert.ok(beerItem && sodaItem);

      const resSaveByItem = await fetch(`${BASE_URL}/api/minibar/split-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: resCode,
          flatNumber: flatNum,
          mode: "by_item",
          itemAssignments: {
            [sodaItem.itemKey]: 1,
            [beerItem.itemKey]: 2
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
      assert.strictEqual(
        msgG2.amount,
        40.0,
        "No modo 'by_item', o 2º Hóspede paga exatamente os itens que marcou (R$ 40,00)"
      );
      assert.match(msgG1.link, /guestIndex=1/);
      assert.match(msgG2.link, /guestIndex=2/);

      // 7. Verifica que cada cobrança e Nota Fiscal está configurada para o respectivo hóspede consumidor (tomador da NF)
      const resHub = await fetch(`${BASE_URL}/api/minibar/invoices/hub`);
      assert.strictEqual(resHub.status, 200);
      const dataHub = await resHub.json();
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
    });

    it("2.2 Modo 'Dividir Meio a Meio' (half_and_half): Divide todo o saldo (inclusive itens da vistoria final sem marcação) 50/50", async () => {
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

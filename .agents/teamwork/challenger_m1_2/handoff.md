# Handoff Report — Challenger M1_2: Desacoplamento Financeiro, Webhooks e Extrato Anserve

## 1. Observation
- **Arquivos inspecionados**:
  - `artifacts/api-server/demo-server.mjs`: Linhas 41438-41457 (webhook Inter), 42521-42586 (webhook Mercado Pago), 46135-46404 (`POST /api/minibar/orders`), 46570-46782 (`POST /api/minibar/inspections`), 46866-46945 (`GET /api/minibar/settlement`).
  - `tests/minibar-backend-flow.test.mjs`: Testes existentes criados pelo `worker_m1`.
- **Suíte de teste de verificação empírica criada e executada**:
  - Arquivo: `tests/challenger-m1-2-verification.test.mjs` (12 testes isolados pontuais, porta 4197, `DATA_FILE` em `os.tmpdir()`, `NODE_ENV=test`, `DATABASE_URL` removida).
  - Execução: `node --test tests/challenger-m1-2-verification.test.mjs`
  - Resultado:
    ```
    # tests 12
    # suites 4
    # pass 12
    # fail 0
    # cancelled 0
    # skipped 0
    # todo 0
    # duration_ms 8882.9842
    ```
- **Achados observados**:
  1. *Desacoplamento Financeiro*:
     - Reserva com valor inicial `totalAmount: 880.00` e `paidAmount: 880.00` foi submetida a 6 operações consecutivas de frigobar:
       - Pedido cortesia R$ 0.00 (`POST /api/minibar/orders`)
       - Pedido PIX R$ 26.00 pendente (`POST /api/minibar/orders`)
       - Liquidação de pedido PIX via webhook Banco Inter (`POST /api/pms/inter/webhook`)
       - Pedido Cartão R$ 16.00 pendente (`POST /api/minibar/orders`)
       - Vistoria com divergência não declarada de R$ 28.00 gerando cobrança pendente (`POST /api/minibar/inspections`)
       - Cancelamento manual de pedido pendente
     - Em TODAS as etapas, `r.totalAmount` permaneceu estritamente em `880.00` no banco e na API pública do portal do hóspede (`/api/pms/guest-portal/:code`). As ordens de frigobar ficam completamente isoladas em `minibarOrders`.
  2. *Webhook Banco Inter*:
     - O envio de payload ao `POST /api/pms/inter/webhook` contendo `{ pix: [{ txid, valor }] }` com `txid` correspondente ao pedido localiza a ordem em `db.minibarOrders` e transiciona `paymentStatus` para `"pago"`, preenchendo `paidAt` e `pixEndToEndId`.
     - O envio com `txid` divergente/inválido mantém o pedido em `"pendente"`.
  3. *Webhook Mercado Pago (FALHA / DEFECT)*:
     - Em `artifacts/api-server/demo-server.mjs` (linhas 42521-42586), o webhook `POST /api/pms/mercadopago/webhook` ignora `external_reference` ou dados de pagamento enviados no corpo da requisição e tenta efetuar uma chamada HTTP externa para `https://api.mercadopago.com/v1/payments/${queryId}` utilizando `accessToken`.
     - Quando um webhook é disparado com `payment.id` e `external_reference` (`MB-<orderId>`), sem credenciais de produção ativas ou sem resposta da API pública do Mercado Pago, a chamada HTTPS síncrona não obtém status `"approved"`, e o pedido PERMANECE com `paymentStatus = "pendente"`.
     - Observação no teste do worker: em `tests/minibar-backend-flow.test.mjs` (linha 427), o worker apenas validou `resWebhook.status === 200`, mascarando o fato de que a ordem `testCardOrderId` jamais foi liquidada para `"pago"`.
  4. *Extrato de Repasse Anserve (`/api/minibar/settlement`)*:
     - A fórmula matemática implementada na linha 46922:
       `netPayableToAnserve = totalOrdersAmount - cardFees - pixFees - commissionCorpFlats + netCourtesyCredit`
     - Validada rigorosamente com dados controlados:
       - Vendas brutas pagas no período: R$ 300.00 (Cartão R$ 100.00 + PIX R$ 200.00 + Cortesia R$ 0.00; pedidos pendentes e pedidos de outras datas estritamente excluídos)
       - Taxa de Cartão (3.99%): R$ 3.99
       - Taxa fixa de PIX (R$ 1.00): R$ 1.00
       - Comissão CorpFlats (10%): R$ 30.00
       - Reembolso de cortesias da CorpFlats para a Anserve (4 kits x R$ 5.00): R$ 20.00
       - Repasse líquido retornado pela API: R$ 285.01 (`300 - 3.99 - 1.00 - 30.00 + 20.00`), exato até o último centavo.
     - Filtragem por data testada isolando datas distintas sem vazamento.

## 2. Logic Chain
1. A especificação do Marco M1 exige expressamente no Ponto 2:
   `Webhook do Mercado Pago com payment.id e external_reference liquida o pedido.`
2. Ao auditar o código de `POST /api/pms/mercadopago/webhook`, constatou-se que o endpoint extrai apenas `queryId` e tenta resolver o pagamento exclusivamente via requisição externa `https.request("https://api.mercadopago.com/v1/payments/" + queryId)`.
3. Não há fallback no webhook para aceitar `external_reference` ou status de pagamento do payload (`req.body.external_reference`, `req.body.payment`, ou `req.body.data.external_reference`), ao contrário do webhook do Banco Inter que processa diretamente os dados da notificação.
4. Consequentemente, o disparo do webhook de teste com `payment.id` e `external_reference` não liquida o pedido de frigobar, deixando-o como `"pendente"`.
5. Os demais itens (desacoplamento financeiro e extrato de repasse) foram aprovados com excelência matemática e isolamento comprovado.

## 3. Caveats
- O teste do Banco Inter depende do campo `pix[0].txid`. O sistema trata corretamente tanto pedidos gerados pelo mTLS do Inter quanto txIds estáticos.
- A divergência no webhook Mercado Pago não afeta o fluxo do Banco Inter nem o cálculo do extrato de liquidação de pedidos que já estejam pagos.

## 4. Conclusion
**Veredito: REQUEST_CHANGES**

O código atende com perfeição aos itens 1 (Desacoplamento Financeiro) e 3 (Extrato de Repasse Anserve), porém REPROVA no item 2 devido à incapacidade do webhook do Mercado Pago de liquidar o pedido quando recebe `payment.id` e `external_reference` via payload.

### Ação Necessária para o Worker (Remediação Pontual):
Em `artifacts/api-server/demo-server.mjs` (linha ~42525) e `scripts/demo-server.mjs`:
No endpoint `POST /api/pms/mercadopago/webhook`, adicionar suporte para ler `external_reference` e status aprovado diretamente do corpo da notificação (`req.body.external_reference`, `data?.external_reference`, ou `req.body.payment`) como fallback caso não haja `accessToken` configurado ou caso a requisição síncrona à API externa do Mercado Pago não seja necessária/esteja em teste, permitindo liquidar o pedido `MB-*` correspondente com `mbOrder.paymentStatus = "pago"` e `mbOrder.mpPaymentId = String(queryId)`.
Atualizar o teste em `tests/minibar-backend-flow.test.mjs` para afirmar `assert.strictEqual(orderStatus.status, "pago")` após o webhook.

## 5. Verification Method
Para reproduzir e auditar as constatações:
```powershell
node --test tests/challenger-m1-2-verification.test.mjs
```
O teste valida:
- Desacoplamento financeiro total em 7 subcenários.
- Liquidação por txId correto e rejeição de txId falso no Inter.
- Comportamento de não-liquidação do webhook Mercado Pago quando enviado com `payment.id` e `external_reference`.
- Cálculo matemático exato do repasse da Anserve (R$ 285.01) e filtros temporais.

# Handoff Report — Milestone M1: Challenger Adversarial & Stress Verification

**Veredito:** `REQUEST_CHANGES`

## 1. Observation

### Obs 1: Paridade Twin-Server SHA-256 Quebrada
- Comando executado:
  ```powershell
  git diff --no-index artifacts/api-server/demo-server.mjs scripts/demo-server.mjs
  ```
- Saída verbatim:
  ```diff
  diff --git a/artifacts/api-server/demo-server.mjs b/scripts/demo-server.mjs
  index 101d64b..37ca26d 100644
  --- a/artifacts/api-server/demo-server.mjs
  +++ b/scripts/demo-server.mjs
  @@ -27255,7 +27255,6 @@ function formatTriggerTitle(trigger) {
       payment_confirmed: "Pagamento Confirmado • Reserva Garantida",
       sameday_reservation: "Reserva de Hoje • Confirmação & Instruções",
       pre_checkin_completed: "Check-in Online Concluído • Confirmação & Instruções",
  -    pre_checkin_enter_prompt: "Pós Check-in Online • Botão: Informar que Entrei",
       room_ready: "Apartamento Pronto • Acesso Liberado",
       checkin_completed: "Check-in Realizado • Boas-Vindas",
       checkout_completed: "Check-out Realizado • Agradecimento",
  ```
- Execução do teste do worker (`node --test tests/minibar-backend-flow.test.mjs`):
  ```
  not ok 1 - F01 / Paridade SHA-256: demo-server.mjs em artifacts/ e scripts/ devem ter hashes idênticos byte-a-byte
    error: 'Arquivos gêmeos de demo-server.mjs devem possuir paridade exata SHA-256'
    expected: 'd8ea1fcaa3efac57759b613cc2f484e8dc851f76dcdb680a78406525330ba5f8'
    actual: 'ceaa95f59664b8ae45754c43bc18013e3f976980801988e6af82bc9b6fd221ed'
  ```

### Obs 2: Discrepância de Código HTTP na Validação de 4 Dígitos (`POST /api/minibar/flat-context`)
- Arquivo `artifacts/api-server/demo-server.mjs`, linhas 45980-45985:
  ```javascript
  if (!matchesPhone && !matchesDoc) {
    return res.status(400).json({
      success: false,
      error: "Dígitos incorretos ou nenhuma reserva ativa no flat"
    });
  }
  ```
- Requisito explícito no despacho do Orquestrador:
  `"Digitação de 4 dígitos incorretos no POST /api/minibar/flat-context (rejeição com 401)."`
- O backend retorna HTTP `400 Bad Request` em vez de HTTP `401 Unauthorized`.

### Obs 3: Vulnerabilidade de Quantidade na Cortesia Gratuita (`prod_cortesia_kit`)
- Arquivo `artifacts/api-server/demo-server.mjs`, linhas 46180-46218:
  ```javascript
  const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
  ...
  if (isCourtesy) {
    if (alreadyConsumedCourtesy) { ... }
    else { unitPrice = 0; }
  }
  const itemTotal = unitPrice * qty; // 0 * 5 = 0
  totalAmount += itemTotal;
  ```
- No teste empírico (Subteste 1.3 de `tests/minibar-stress-challenger.test.mjs`):
  Ao enviar `{ productId: "prod_cortesia_kit", quantity: 5 }`, o backend respondeu com HTTP 200, gravou o pedido com `quantity: 5` e `totalAmount: 0`, burlando o limite `courtesyLimitPerStay: 1`.

### Obs 4: Coerção Forçada de Quantidades Zero e Negativas em Compra (`Math.max(1, qty)`)
- Arquivo `artifacts/api-server/demo-server.mjs`, linha 46180:
  ```javascript
  const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
  ```
- No teste empírico (Subteste 3.3 de `tests/minibar-stress-challenger.test.mjs`):
  - Envio de `{ productId: "prod_agua_sem_gas", quantity: 0 }`: `parseInt(0, 10) || 1` avalia para `1`. O backend grava 1 unidade e cobra R$ 6.00 no total.
  - Envio de `{ productId: "prod_agua_sem_gas", quantity: -10 }`: `Math.max(1, -10)` avalia para `1`. O backend grava 1 unidade e cobra R$ 6.00.
  - Se um carrinho mobile submeter itens desmarcados ou não consumidos com `quantity: 0`, o backend cobra indevidamente por todos eles.

### Obs 5: Cortesia Gratuita Concedida para Flats Sem Reserva Ativa
- Arquivo `artifacts/api-server/demo-server.mjs`, linhas 46154-46166 e 46237-46263:
  Ao requisitar cortesia gratuita informando apenas `flatNumber: "991"` (flat vago, sem reserva ativa), o backend não exige reserva ativa para itens de cortesia e cria o pedido com `reservationCode: ""`, `reservationId: null`, `guestName: "Hóspede CorpFlats"` e `totalAmount: 0`.

---

## 2. Logic Chain

1. **Quebra de Integridade Twin-Server**:
   A regra basilar do projeto (documentada em `ORIGINAL_REQUEST.md` e `AGENTS.md`) exige paridade estrita SHA-256 byte-a-byte entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`. A diferença identificada na linha 27258 quebra o hash e faz o teste unitário oficial falhar (`test 1 failed`).
2. **Semântica HTTP de Autenticação**:
   O endpoint `POST /api/minibar/flat-context` atua como o portão de autenticação do hóspede no mobile via QR Code. O envio de credenciais incorretas (os 4 dígitos do telefone/documento não conferem) é semanticamente uma falha de autenticação (`401 Unauthorized`), conforme requisitado pelo Orquestrador, e não sintaxe malformada (`400 Bad Request`).
3. **Exploit de Custo de Cortesia**:
   O produto `prod_cortesia_kit` tem custo de R$ 6.50 para a CorpFlats/Anserve. Permitir que uma única requisição informe `quantity: 5` (ou mais) e receba 5 kits a R$ 0.00 representa uma brecha financeira direta contra o limite unitário de cortesia da estadia.
4. **Risco de Cobrança Indevida em Quantidade Zero**:
   Aplicações de catálogo/carrinho comumente representam itens inalterados ou zerados com `quantity: 0`. O uso de `parseInt(it.quantity, 10) || 1` transforma zero em 1, causando cobranças automáticas indesejadas por produtos que o hóspede não selecionou.
5. **Vazamento de Cortesia sem Reserva**:
   Cortesias existem para saudar hóspedes com reserva ativa. Permitir a emissão de cortesias em flats vagos possibilita drenagem indevida de estoque e distorce o extrato de repasse (`settlement`), onde cortesias geram créditos compensatórios para a repositora.

---

## 3. Caveats

- Os testes de estresse foram executados com `NODE_ENV=test`, porta isolada 4299 e banco em `os.tmpdir()`, sem chamada aos gateways externos reais (mTLS Banco Inter, Mercado Pago, Z-API e Zoho SMTP), utilizando as rotas de mock/sandbox integradas.
- O comportamento resiliente para pedidos **pagos** (PIX/Cartão) em flats sem reserva foi validado e funciona adequadamente para permitir cobranças avulsas no balcão. O problema reside estritamente nas cortesias gratuitas e nas quantidades zeradas/negativas.

---

## 4. Conclusion

**Veredito: `REQUEST_CHANGES`**

O backend M1 possui uma base sólida e atende grande parte dos requisitos (19/20 testes do worker passam e o teste de estresse do challenger rodou 13/13 cenários). No entanto, são necessárias as seguintes correções pontuais antes do avanço para o Marco M2:

1. **Sincronizar Twin-Server**: Copiar `artifacts/api-server/demo-server.mjs` para `scripts/demo-server.mjs` para restabelecer a paridade SHA-256 e fazer o teste oficial passar 20/20.
2. **Ajustar Status Code para 401**: Em `demo-server.mjs` (linha 45981), alterar o retorno de `res.status(400)` para `res.status(401)` quando os 4 dígitos não coincidirem com o telefone ou documento do hóspede.
3. **Blindar Quantidade de Cortesia**: Em `POST /api/minibar/orders`, forçar que itens com `isCourtesy: true` tenham quantidade máxima de 1 (ou `prod.courtesyLimitPerStay || 1`) por pedido gratuito.
4. **Tratar Quantidade Zero e Negativa**: Em `POST /api/minibar/orders`, desconsiderar itens com `parseInt(it.quantity, 10) <= 0` em vez de convertê-los para 1 via `Math.max(1, qty || 1)`.
5. **Restringir Cortesia a Reservas Ativas**: Exigir que pedidos com `totalAmount === 0` (cortesia) possuam uma reserva ativa identificada no flat (`if (!reservation && totalAmount <= 0) return res.status(400).json({ success: false, error: "Cortesia disponível apenas para hóspedes com reserva ativa no flat." })`).

---

## 5. Verification Method

Para verificar as constatações de forma independente:

1. **Verificar Paridade SHA-256 e Teste Oficial do Worker**:
   ```powershell
   node --test tests/minibar-backend-flow.test.mjs
   ```
   *(Atualmente falha no subteste 1 devido à linha 27258)*.

2. **Executar a Suíte de Testes Adversários do Challenger**:
   ```powershell
   node --test tests/minibar-stress-challenger.test.mjs
   ```
   *(Executa os 13 testes adversários isolados comprovando os comportamentos empíricos)*.

3. **Verificar Diferença Exata entre os Arquivos Gêmeos**:
   ```powershell
   git diff --no-index artifacts/api-server/demo-server.mjs scripts/demo-server.mjs
   ```

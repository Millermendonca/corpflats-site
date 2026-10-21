# Handoff Report — Review & Adversarial Challenge: Milestone M1 (Minibar Backend & Security)

**Agent**: `reviewer_m1_1` (teamwork_preview_reviewer)  
**Roles**: reviewer, critic  
**Date**: 2026-10-21T19:35:00Z  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

### Obs 1: Paridade SHA-256 dos Servidores Gêmeos Quebrada
Comando executado:
```powershell
(Get-FileHash 'artifacts/api-server/demo-server.mjs').Hash
(Get-FileHash 'scripts/demo-server.mjs').Hash
(Get-FileHash 'artifacts/api-server/demo-server.mjs').Hash -eq (Get-FileHash 'scripts/demo-server.mjs').Hash
```
Resultado verbatim observado:
```
CEAA95F59664B8AE45754C43BC18013E3F976980801988E6AF82BC9B6FD221ED
D8EA1FCAA3EFAC57759B613CC2F484E8DC851F76DCDB680A78406525330BA5F8
False
```
Diferença encontrada via `git diff scripts/demo-server.mjs artifacts/api-server/demo-server.mjs`:
```diff
diff --git a/artifacts/api-server/demo-server.mjs b/artifacts/api-server/demo-server.mjs
index 37ca26d..101d64b 100644
--- a/artifacts/api-server/demo-server.mjs
+++ b/artifacts/api-server/demo-server.mjs
@@ -27255,6 +27255,7 @@ function formatTriggerTitle(trigger) {
     payment_confirmed: "Pagamento Confirmado • Reserva Garantida",
     sameday_reservation: "Reserva de Hoje • Confirmação & Instruções",
     pre_checkin_completed: "Check-in Online Concluído • Confirmação & Instruções",
+    pre_checkin_enter_prompt: "Pós Check-in Online • Botão: Informar que Entrei",
     room_ready: "Apartamento Pronto • Acesso Liberado",
     checkin_completed: "Check-in Realizado • Boas-Vindas",
     checkout_completed: "Check-out Realizado • Agradecimento",
```
Timestamp de modificação:
- `artifacts/api-server/demo-server.mjs`: `2026-10-21T16:19:32`
- `scripts/demo-server.mjs`: `2026-10-21T16:13:28`

### Obs 2: Execução do Teste Pontual Obrigatório (`node --test tests/minibar-backend-flow.test.mjs`)
Comando executado:
```powershell
node --test tests/minibar-backend-flow.test.mjs
```
Resultado verbatim observado:
```
TAP version 13
# Subtest: Milestone M1 — Minibar Backend Core & APIs Suite
    # Subtest: F01 / Paridade SHA-256: demo-server.mjs em artifacts/ e scripts/ devem ter hashes idênticos byte-a-byte
    not ok 1 - F01 / Paridade SHA-256: demo-server.mjs em artifacts/ e scripts/ devem ter hashes idênticos byte-a-byte
      ---
      duration_ms: 20.262
      location: 'file:///C:/Users/mille/OneDrive/Hotel/Documentos%20h%C3%B3spedes/Guest-Flow-Manager/tests/minibar-backend-flow.test.mjs:41:3'
      failureType: 'testCodeFailure'
      error: 'Arquivos gêmeos de demo-server.mjs devem possuir paridade exata SHA-256'
      code: 'ERR_ASSERTION'
      name: 'AssertionError'
      expected: 'd8ea1fcaa3efac57759b613cc2f484e8dc851f76dcdb680a78406525330ba5f8'
      actual: 'ceaa95f59664b8ae45754c43bc18013e3f976980801988e6af82bc9b6fd221ed'
...
# tests 20
# suites 2
# pass 19
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 6322.0747
```
No `handoff.md` do `worker_m1`, linhas 16-24, foi atestado `pass 20, fail 0` e paridade `True`, o que diverge da execução real no repositório.

### Obs 3: Desacoplamento Financeiro Verificado
Em `artifacts/api-server/demo-server.mjs`, linhas 46175-46263 e 46291-46400:
- O valor do pedido de frigobar (`order.totalAmount`) é mantido exclusivamente dentro de `db.minibarOrders`.
- Nenhuma operação das rotas `/api/minibar/*` ou dos webhooks `/api/pms/inter/webhook` e `/api/pms/mercadopago/webhook` altera o campo `r.totalAmount` de qualquer reserva em `db.reservations`.
- O teste pontual (subtestes 6 e 8) valida explicitamente que após criação de pedidos PIX e Cartão, o `dataPortal.reservation.totalAmount` permanece estritamente `450.00`.

### Obs 4: Validação dos 4 Dígitos do Contexto do Flat (`/api/minibar/flat-context`)
Em `artifacts/api-server/demo-server.mjs`, linhas 45954-45985:
- Exige `digits.length === 4` e número do flat.
- Testa contra os 4 últimos dígitos do celular (`reservation.guestPhone.endsWith(digits)`) e também contra o CPF (`reservation.guestDocument.endsWith(digits)`).
- Retorna 400 se incorreto (`"Dígitos incorretos ou nenhuma reserva ativa no flat"`).

### Obs 5: Retenção Mínima em `pruneDatabase`
Em `artifacts/api-server/demo-server.mjs`, linhas 8736-8753:
- Se `db.minibarOrders.length > 3000`, expurga apenas pedidos cancelados/não pagos anteriores a `getOffsetDateStr(-730)`. Pedidos pagos (`paymentStatus === "pago"`) são retidos indefinidamente (`(orderDate >= cutoffDate) || (o.paymentStatus === "pago")`).
- `db.minibarInspections` retém todas as inspeções por no mínimo 730 dias.

### Obs 6: Anti-abuso de Cortesia e Brecha em Pedidos Mistos Pendentes
Em `artifacts/api-server/demo-server.mjs`, linhas 46168-46173:
```javascript
const paidOrders = (db.minibarOrders || []).filter(o =>
  (o.reservationCode === finalResCode || String(o.reservationId) === String(reservation?.id)) &&
  o.paymentStatus === "pago"
);
const alreadyConsumedCourtesy = paidOrders.some(o => (o.items || []).some(i => i.isCourtesy));
```
- A verificação de cortesia já usufruída checa **apenas** `o.paymentStatus === "pago"`.
- Se o hóspede fizer um pedido com cortesia + item pago (ex: kit cortesia + água), o pedido é criado com `paymentStatus: "pendente"`.
- Enquanto o pedido estiver pendente, `alreadyConsumedCourtesy` permanece `false`. O hóspede pode abrir múltiplos checkouts simultâneos com cortesia e quitar todos, obtendo múltiplas cortesias gratuitas.

### Obs 7: Seleção de Reserva em Flats Vagos (`findActiveOrRecentReservationForFlat`)
Em `artifacts/api-server/demo-server.mjs`, linhas 45796-45798:
```javascript
// Ordena decrescente por checkinDate
validReservations.sort((a, b) => String(b.checkinDate || "").localeCompare(String(a.checkinDate || "")));
return validReservations[0];
```
- Se o flat estiver vago hoje e o hóspede tiver feito checkout recente (ontem), mas houver uma reserva futura cadastrada (ex: daqui a 1 mês), `b.checkinDate` selecionará a reserva **futura**.
- Quando o hóspede recém-saído escanear o QR code para acertar o frigobar, seus 4 dígitos falharão porque o flat context foi vinculado à reserva futura do próximo hóspede.

### Obs 8: TDZ ReferenceError no `loadDatabase`
No boot do servidor (capturado nos logs):
```
[Database] Erro ao ler database: ReferenceError: Cannot access 'DEFAULT_INTER_CONFIG' before initialization
    at getInterCertificates (artifacts/api-server/demo-server.mjs:41147:43)
    at loadDatabase (artifacts/api-server/demo-server.mjs:6652:56)
    at async artifacts/api-server/demo-server.mjs:9500:1
```
`DEFAULT_INTER_CONFIG` é declarada com `const` na linha 41147, mas referenciada por `loadDatabase` na linha 6652 antes de ser inicializada.

---

## 2. Logic Chain

1. **Paridade Twin-Server & Quebra de Teste** (Obs 1 e Obs 2):
   - A regra R10 do projeto e o checklist do despacho exigem paridade exata SHA-256 byte-a-byte entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.
   - A execução de `Get-FileHash` resultou em `False` devido a uma inserção na linha 27255 de `artifacts/api-server/demo-server.mjs`.
   - O primeiro teste do arquivo pontual `tests/minibar-backend-flow.test.mjs` falhou (`not ok 1 - F01 / Paridade SHA-256`), resultando em 19/20 testes passados e saída com código 1.
   - Portanto, a entrega atual está formalmente quebrada e viola o critério de aceitação de entrega do Marco M1.

2. **Divergência de Atestação no Handoff** (Obs 2):
   - O `handoff.md` do `worker_m1` declarou 20 testes passados e paridade `True`.
   - Como o hash está divergente e o teste falha na linha 41, o trabalho não pode ser aprovado sem a devida reconciliação.

3. **Qualidade e Completude das Features F01 a F10** (Obs 3, Obs 4, Obs 5):
   - As 19 rotas e funcionalidades de negócio (catálogo, gabarito, 4 dígitos, checkout PIX/Cartão, webhooks, NF-e, inspeção com Sofia WhatsApp, repasse financeiro e analytics) funcionam corretamente de ponta a ponta quando testadas no servidor.
   - O desacoplamento financeiro foi rigorosamente respeitado: `r.totalAmount` permanece intacto em todos os fluxos.
   - A retenção de 730 dias em `pruneDatabase` está devidamente implementada.

4. **Vulnerabilidades de Borda Identificadas** (Obs 6, Obs 7, Obs 8):
   - A verificação de cortesia em pedidos mistos pendentes permite bypass caso o hóspede faça pedidos simultâneos antes da compensação.
   - A seleção de flat vago escolhe reservas do futuro em vez do hóspede de checkout recente.
   - O TDZ no boot causa `ReferenceError` capturado no catch de `loadDatabase()`.

---

## 3. Caveats

- As 19 asserções funcionais de frigobar em `tests/minibar-backend-flow.test.mjs` passam com sucesso. A única falha decorre da divergência de 1 linha (`pre_checkin_enter_prompt` adicionada por outra atividade paralela em `artifacts/api-server/demo-server.mjs` sem ser copiada para `scripts/demo-server.mjs`).
- Como a role de reviewer proíbe modificação de código de implementação (`Review-only — do NOT modify implementation code`), a correção não foi aplicada diretamente pelo reviewer, sendo devolvida ao worker para ajuste.

---

## 4. Conclusion

**Veredito**: **REQUEST_CHANGES**

O Marco M1 está com a sua lógica de negócio implementada com excelência e robustez (19 dos 20 testes de frigobar passando, desacoplamento financeiro total, auditoria e telemetria ativas). Contudo, **NÃO PODE SER APROVADO** pelos seguintes motivos mandatórios:
1. **[CRÍTICO - BLOQUEANTE]**: Falha no subteste 1 de `tests/minibar-backend-flow.test.mjs` devido à quebra de paridade SHA-256 entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.
2. **[MAJOR]**: Vulnerabilidade anti-abuso de cortesias para pedidos mistos pendentes (Obs 6).
3. **[MAJOR]**: Precedência errônea de reservas futuras sobre checkout recente no QR Code de flat vago (Obs 7).
4. **[MINOR]**: `ReferenceError` em `loadDatabase` por Temporal Dead Zone em `DEFAULT_INTER_CONFIG` (Obs 8).

---

## 5. Verification Method

Para o worker ou orquestrador verificar a resolução:

1. **Paridade SHA-256**:
   ```powershell
   Copy-Item -Path 'artifacts/api-server/demo-server.mjs' -Destination 'scripts/demo-server.mjs' -Force
   (Get-FileHash 'artifacts/api-server/demo-server.mjs').Hash -eq (Get-FileHash 'scripts/demo-server.mjs').Hash
   ```
   *Condição de invalidação*: Se retornar `False`, rejeitar imediatamente.

2. **Execução Estrita do Teste Pontual**:
   ```powershell
   node --test tests/minibar-backend-flow.test.mjs
   ```
   *Critério de aprovação*: Deve retornar exatamente:
   `# tests 20`
   `# pass 20`
   `# fail 0`
   com código de saída 0.

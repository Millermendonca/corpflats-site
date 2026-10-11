# Relatório de Handoff — Challenger 2 (Milestone M1)

**Agente:** Challenger 2 (Empirical Challenger: critic, specialist)  
**Milestone:** M1 — Backend Core: System Actions API, Tariff Engine & Autonomous Pipeline  
**Data:** 2026-10-11T01:22:00Z  
**Diretório de Trabalho:** `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m1_2`  
**Veredicto Final:** **REQUEST_CHANGES**

---

## 1. Observation

Durante a execução da suíte de testes de estresse adversarial desenvolvida em `tests/challenger-m1-adversarial.test.mjs`, foram observados os seguintes comportamentos e evidências empíricas no servidor monolítico `artifacts/api-server/demo-server.mjs` (e seu espelho `scripts/demo-server.mjs`):

### 1.1 Sucesso nas Permutações de Chaves (Master e Granulares)
- **Chave Mestra Desligada (`apiActionsEnabled: false`)**:
  - Todos os 5 endpoints (`/availability`, `/quote`, `/payment-link`, `/pre-reserve`, `/commit-reservation`) responderam estritamente com status HTTP 403, payload JSON `{ error: "ACTION_DISABLED", action: ..., requiresHandover: true, message: ... }` e suporte a `handoverMessage` customizada, sem falhas ou exceções não tratadas.
- **Chaves Individuais (`allowedActions`)**:
  - A matriz de 5 ações individuais ligadas e desligadas uma a uma funcionou conforme especificado, bloqueando exclusivamente a ação desativada com 403 e liberando as demais.

### 1.2 FALHA CRÍTICA 1: Concorrência e Race Condition (Dupla Reserva / Double-Booking)
- **Comando executado**: `node --test tests/challenger-m1-adversarial.test.mjs` (Subtest 3.1 e 3.2).
- **Código fonte**: `artifacts/api-server/demo-server.mjs` (linhas 20430–20501):
  ```javascript
  20430:     const nowMs = Date.now();
  20431:     const hasConflict = (db.reservations || []).some(r => {
  ...
  20435:       return r.checkinDate < outDate && r.checkoutDate > inDate;
  20436:     });
  20438:     if (hasConflict) {
  20439:       return res.status(409).json({ error: "FLAT_UNAVAILABLE", ... });
  20443:     }
  ...
  20459:     const qrCodeBase64 = await QRCode.toDataURL(pixPayload);
  ...
  20500:     db.reservations.unshift(newReservation);
  20501:     saveDatabase("bot_pre_reserve");
  ```
- **Resultado empírico observado (2 requisições simultâneas para Flat 313 nas datas 2027-01-10 a 2027-01-15)**:
  ```
  [CONCURRENCY EMPIRICAL RESULT] Request 1: 200, Request 2: 200
  [CONCURRENCY EMPIRICAL RESULT] Overlapping active reservations in DB: 2
  ```
  - **Ambas as requisições retornaram HTTP 200 OK.**
  - **Duas pré-reservas ativas foram criadas no banco de dados para a mesma unidade e no mesmo período.**
- **Resultado empírico em rajada (burst de 5 requisições simultâneas para Flat 408 nas datas 2027-02-01 a 2027-02-05)**:
  ```
  [BURST CONCURRENCY RESULT] 200 OK: 5, 409 Conflict: 0, All statuses: 200, 200, 200, 200, 200
  ```
  - **Todas as 5 requisições retornaram HTTP 200 OK.**
  - **5 pré-reservas sobrepostas foram criadas no banco para o mesmo flat.**

### 1.3 FALHA CRÍTICA 2: Falha na Verificação de Pré-Reserva Paga Vencida (`paymentStatus === "pago_total"`)
- **Código fonte**: `artifacts/api-server/demo-server.mjs` (linhas 20172–20195 e 20430–20436):
  Na limpeza de pré-reservas (linhas 20172–20179), há proteção para não expirar se `r.paymentStatus !== "pago_total"`:
  ```javascript
  20174: if (new Date(r.expiresAt).getTime() < nowMs && r.paymentStatus !== "pago_total") {
  20175:   r.status = "expirada";
  20176: }
  ```
  Porém, no filtro de conflitos do mesmo endpoint de disponibilidade (linha 20189):
  ```javascript
  20189: if (r.status === "pre_reserva" && r.expiresAt && new Date(r.expiresAt).getTime() < nowMs) return;
  ```
  E na validação de conflito de `POST /api/bot-actions/pre-reserve` (linha 20433):
  ```javascript
  20433: if (r.status === "pre_reserva" && r.expiresAt && new Date(r.expiresAt).getTime() < nowMs) return false;
  ```
- **Resultado empírico observado (Subtest 2.3)**:
  Quando uma pré-reserva tem `expiresAt` no passado mas `paymentStatus: "pago_total"`, a linha 20189 ignora a reserva como bloqueio e a disponibilidade retorna a UH como livre (`isOccupied: false` e presente no array `flats`). Uma nova pré-reserva pode ser criada por cima da reserva paga de outro hóspede.
  ```
  AssertionError: 'Flat 211 must NOT be available because reservation was paid'
  actual: { id: 4, number: '211', name: '211 de casal', isOccupied: false }
  ```

### 1.4 FALHA ALTA 3: Efetivação de Pré-Reserva Expirada via `commit-reservation` sem Verificação de Conflito
- **Código fonte**: `artifacts/api-server/demo-server.mjs` (linha 20535):
  ```javascript
  20535: if (reservation.status === "cancelada") {
  20536:   return res.status(400).json({ error: "RESERVATION_CANCELLED", ... });
  20537: }
  ```
- **Resultado empírico observado (Subtest 2.6)**:
  Ao invocar `POST /api/bot-actions/commit-reservation` para a reserva `70001` (cujo status já era `"expirada"`), a rota retornou HTTP 200 OK, alterando o status para `"confirmada"`, confirmando no PMS e sobrescrevendo bloqueios sem verificar se a reserva expirou ou se a UH foi alocada para outro hóspede no intervalo:
  ```
  [COMMIT EXPIRED RESERVATION RESULT] Status: 200, Body: {
    success: true,
    reservationId: 70001,
    code: 'CF-EXPIRED-70001',
    status: 'confirmada',
    paymentStatus: 'pago_total',
    pmsConfirmed: true
  }
  ```

### 1.5 DEFEITO MÉDIO 4: `preReservationHoldMinutes` Ignorado em `pre-reserve`
- **Código fonte**: `artifacts/api-server/demo-server.mjs`:
  Linha 20122 aceita e grava `preReservationHoldMinutes`, mas a linha 20449 hard-coda:
  ```javascript
  20449: const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  ...
  20507: holdMinutes: 30
  ```
- **Resultado empírico observado (Subtest 2.5)**:
  Configurando `preReservationHoldMinutes: 15`, a criação de pré-reserva gerou expiração com ~30 minutos (`diffMinutes: 30`) e retornou `holdMinutes: 30`, descumprindo o requisito R3 de expiração configurável.

---

## 2. Logic Chain

1. **Da Concorrência (Race Condition TOCTOU)**:
   A verificação de conflito `hasConflict` (linhas 20431–20436) é síncrona, mas logo em seguida ocorre a chamada assíncrona `await QRCode.toDataURL(pixPayload)` (linha 20459). Durante essa operação assíncrona, o Node.js cede o Event Loop para processar novas requisições. Como a inserção no banco `db.reservations.unshift(newReservation)` só ocorre na linha 20500 (após o término do QR Code), qualquer requisição concorrente que chegue nesse intervalo executa `hasConflict`, não encontra reserva alguma no banco e também prossegue. Assim, ambas as requisições criam pré-reservas para a mesma UH nas mesmas datas (dupla reserva comprovada com 2 e 5 requisições paralelas).

2. **Da Inconsistência de Pré-Reserva Paga**:
   A esteira prevê que um hóspede possa pagar o PIX durante a pré-reserva antes do commit definitivo. A limpeza automática de disponibilidade poupa registros com `r.paymentStatus === "pago_total"`, mas a linha 20189 em `availability` e a linha 20433 em `pre-reserve` desconsideram o bloqueio da UH se `expiresAt < nowMs`, sem validar se o pagamento já havia sido realizado. Com isso, um hóspede que pagou tem sua unidade ofertada e vendida a outro hóspede.

3. **Da Efetivação de Reserva Expirada**:
   O endpoint `commit-reservation` valida apenas `if (reservation.status === "cancelada")`. Como não valida `reservation.status === "expirada"` nem reavalia se as datas estão ocupadas por outra reserva confirmada após a expiração, uma pré-reserva abandonada que venha a ser confirmada tardiamente causa overbooking automático no PMS.

4. **Da Configurabilidade de Hold**:
   O requisito R3 explicita que a expiração provisória deve ser configurável. A API aceita a alteração da chave de configuração, mas o endpoint de criação usa a constante `30 * 60 * 1000` hard-coded.

---

## 3. Caveats

- **Não-modificação de código de produção**: Seguindo a restrição estrita de integridade e do perfil de Challenger (*Review-only — do NOT modify implementation code*), nenhuma correção foi aplicada nos arquivos de produção (`artifacts/api-server/demo-server.mjs` ou `scripts/demo-server.mjs`). As correções devem ser realizadas pelo Worker.
- **Ambiente de Teste**: Os testes foram executados de forma totalmente isolada em porta dedicada (3998) com banco temporário espelhado de `database.json`, sem acionar APIs externas reais.

---

## 4. Conclusion

**Veredicto:** **REQUEST_CHANGES**

O Milestone M1 possui excelente estrutura quanto à matriz de permissões e chaves mestras (100% aprovado), porém **não pode ser aprovado** para avançar aos Milestones M2 (integração do Bot WhatsApp Gemini) e M3 devido a quatro falhas empíricas, sendo a principal uma **vulnerabilidade crítica de concorrência e race condition que gera dupla reserva (double-booking) de flats**, além do risco de sobrescrita de reservas pagas e confirmação indevida de reservas expiradas.

### Ações Necessárias para o Worker:
1. **Eliminar a Race Condition em `pre-reserve`**:
   - Inserir a pré-reserva (ou um lock em memória por `flatId + checkIn + checkOut`) **antes** de chamar `await QRCode.toDataURL(pixPayload)`. Caso o QR code falhe, executar rollback/remoção da reserva.
2. **Corrigir Filtros de Conflito para Reservas Pagas**:
   - Em `availability` (linha 20189) e em `pre-reserve` (linha 20433), adicionar checagem de pagamento:
     `if (r.status === "pre_reserva" && r.expiresAt && new Date(r.expiresAt).getTime() < nowMs && r.paymentStatus !== "pago_total") return;`
3. **Bloquear Commit de Reservas Expiradas ou em Conflito**:
   - Em `commit-reservation` (linha 20535), rejeitar reservas com status `"expirada"` e verificar se o flat não foi ocupado por outra reserva ativa antes de efetivar.
4. **Respeitar `preReservationHoldMinutes`**:
   - Utilizar `getBotActionsSettings().preReservationHoldMinutes || 30` para calcular `expiresAt` e o campo `holdMinutes` no retorno.
5. **Manter Paridade de Arquivos Gêmeos**:
   - Replicar identicamente as correções em `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.

---

## 5. Verification Method

Para reproduzir e verificar de forma independente todas as falhas apontadas:

```bash
node --test tests/challenger-m1-adversarial.test.mjs
```

**Condição de Invalidação / Aprovação Futura**:
- A suíte `tests/challenger-m1-adversarial.test.mjs` deve rodar com **13/13 testes passando (0 falhas)**, confirmando que:
  - Requisições concorrentes retornam 1x 200 OK e 1x 409 Conflict.
  - Reservas pagas não são liberadas após expiração.
  - Reservas expiradas não podem ser confirmadas.
  - A configuração de hold de 15 minutos é respeitada.

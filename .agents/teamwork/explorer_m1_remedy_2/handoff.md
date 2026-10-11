# Relatório de Handoff — Explorer 2 (Remediação Milestone M1)

**Agente:** Explorer 2 (Remediation Explorer: pre-reservation lifecycle specialist)  
**Milestone:** M1 — Backend Core: System Actions API, Tariff Engine & Autonomous Pipeline  
**Data:** 2026-10-11T01:27:00Z  
**Diretório de Trabalho:** `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_remedy_2`  
**Destinatário:** Orchestrator (`3364a657-c855-42a7-a46e-a5463bc245b7`) / Worker  

---

## 1. Observation

Durante a investigação empírica do servidor monolítico em `artifacts/api-server/demo-server.mjs` (e seu arquivo espelho `scripts/demo-server.mjs`), foram analisadas as 3 falhas de ciclo de vida de pré-reservas identificadas no relatório do Challenger 2 (`challenger_m1_2/handoff.md`). A reprodução empírica direta foi executada via `node --test tests/challenger-m1-adversarial.test.mjs`, gerando os seguintes resultados:

### 1.1 Falha 1: Pré-reservas com `paymentStatus === "pago_total"` liberadas indevidamente após `expiresAt`
- **Comando executado:** `node --test tests/challenger-m1-adversarial.test.mjs` (Subtest 2.3)
- **Erro verbatim obtido:**
  ```
  error: 'Flat 211 must NOT be available because reservation was paid'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  actual:
    id: 4
    number: '211'
    name: '211 de casal'
    isOccupied: false
  operator: 'strictEqual'
  ```
- **Código fonte inspecionado:**
  - `artifacts/api-server/demo-server.mjs` (linha 20199):
    ```javascript
    20197:     const busyFlatSet = new Set();
    20198:     (db.reservations || []).forEach(r => {
    20199:       if (r.status === "cancelada" || r.status === "expirada") return;
    20200:       if (r.status === "pre_reserva" && r.expiresAt && new Date(r.expiresAt).getTime() < nowMs) return;
    20201:
    20202:       if (r.checkinDate < outDate && r.checkoutDate > inDate) {
    20203:         if (r.flatId != null) busyFlatSet.add(String(r.flatId));
    20204:         if (r.flatNumber != null) busyFlatSet.add(String(r.flatNumber));
    20205:       }
    20206:     });
    ```
  - `artifacts/api-server/demo-server.mjs` (linha 20433):
    ```javascript
    20431:     const hasConflict = (db.reservations || []).some(r => {
    20432:       if (r.status === "cancelada" || r.status === "expirada") return false;
    20433:       if (r.status === "pre_reserva" && r.expiresAt && new Date(r.expiresAt).getTime() < nowMs) return false;
    20434:       if (String(r.flatId) !== String(flat.id) && String(r.flatNumber) !== String(flat.number)) return false;
    20435:       return r.checkinDate < outDate && r.checkoutDate > inDate;
    20436:     });
    ```
- **Constatação:** Na etapa de limpeza (linha 20184), pré-reservas com `paymentStatus === "pago_total"` são poupadas e não recebem o status `"expirada"`. No entanto, na verificação de conflito (linhas 20200 e 20433), o código ignora sumariamente qualquer pré-reserva com `expiresAt < nowMs`, **sem verificar se ela foi paga**. Como consequência, o flat de uma reserva paga tem seu bloqueio removido e volta a constar como livre para qualquer outro hóspede.

### 1.2 Falha 2: Efetivação de Pré-Reserva Expirada via `commit-reservation` sem validação de status ou conflito
- **Comando executado:** `node --test tests/challenger-m1-adversarial.test.mjs` (Subtest 2.6)
- **Log e erro verbatim obtidos:**
  ```
  # [COMMIT EXPIRED RESERVATION RESULT] Status: 200, Body: {
  #   success: true,
  #   reservationId: 70001,
  #   code: 'CF-EXPIRED-70001',
  #   status: 'confirmada',
  #   paymentStatus: 'pago_total',
  #   paidAmount: 400,
  #   flatNumber: '114',
  #   pmsConfirmed: true,
  #   message: 'Reserva efetivada com sucesso no PMS, UH bloqueada permanentemente e recepção notificada.'
  # }
  # [DEFECT CONFIRMED] commit-reservation confirmed an expired reservation with 200 OK! Status in PMS became: confirmada
  error: 'commit-reservation should reject expired reservations, but returned 200 and confirmed it in PMS!'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  ```
- **Código fonte inspecionado:**
  - `artifacts/api-server/demo-server.mjs` (linhas 20545–20557):
    ```javascript
    20545:     if (reservation.status === "cancelada") {
    20546:       return res.status(400).json({
    20547:         error: "RESERVATION_CANCELLED",
    20548:         message: "Esta reserva está cancelada e não pode ser efetivada."
    20549:       });
    20550:     }
    20551:
    20552:     reservation.status = "confirmada";
    20553:     reservation.paymentStatus = "pago_total";
    20554:     reservation.paidAmount = reservation.totalAmount;
    20555:     reservation.pmsConfirmed = true;
    ```
- **Constatação:** O endpoint `commit-reservation` valida unicamente se `reservation.status === "cancelada"`. Reservas com `status === "expirada"` (ou reservas cujo hold expirou no tempo sem pagamento) são confirmadas com HTTP 200 OK, alterando o status para `"confirmada"` e criando overbooking silencioso caso o flat já tenha sido reatribuído. Além disso, nenhuma revalidação de conflito de datas com outras reservas ativas ou bloqueios de manutenção (`db.roomBlocks`) é realizada antes da confirmação.

### 1.3 Falha 3: `preReservationHoldMinutes` ignorado pelo endpoint `pre-reserve`
- **Comando executado:** `node --test tests/challenger-m1-adversarial.test.mjs` (Subtest 2.5)
- **Log e erro verbatim obtidos:**
  ```
  # [PRE-RESERVE HOLD MINUTES] Configured: 15 min, Result diffMinutes: 30, Response holdMinutes: 30
  # [DEFECT CONFIRMED] preReservationHoldMinutes is configured to 15, but pre-reserve generated expiresAt with ~30 minutes hold and holdMinutes=30
  error: 'preReservationHoldMinutes in settings (15m) should be respected by pre-reserve endpoint, but got 30m (holdMinutes: 30)'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  ```
- **Código fonte inspecionado:**
  - `artifacts/api-server/demo-server.mjs` (linhas 20448–20450 e 20517):
    ```javascript
    20448:     const code = `CF-${Math.floor(100000 + Math.random() * 900000)}`;
    20449:     const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    ...
    20492:           description: `Pré-reserva criada via API com hold de 30 minutos (expira em ${expiresAt})`
    ...
    20517:       holdMinutes: 30
    ```
  - E também em `POST /api/bot-actions/payment-link` (linha 20379):
    ```javascript
    20379:     const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    ```
- **Constatação:** Embora a configuração `db.botActionsSettings.preReservationHoldMinutes` seja persistida corretamente via `POST /api/bot-actions/settings`, o endpoint `pre-reserve` hardcoda o cálculo em `30 * 60 * 1000`, a descrição da auditoria em "30 minutos" e o campo de resposta em `holdMinutes: 30`.

### 1.4 Teste de Paridade Byte-a-Byte
- O teste `tests/pre-reservation-payment-integrity.test.mjs` (linha 50) exige estrita paridade byte-a-byte entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`:
  ```javascript
  assert.strictEqual(fs.readFileSync(serverPath).equals(fs.readFileSync(mirrorPath)), true);
  ```
  Atualmente, o teste passa (12/12 aprovados). Qualquer alteração no servidor deve ser rigorosamente replicada em ambos os arquivos.

---

## 2. Logic Chain

1. **Da retenção de bloqueio para pré-reservas pagas:**
   - Observação 1.1 mostra que a limpeza em `availability` não marca como expirada se `r.paymentStatus === "pago_total"`.
   - Contudo, na linha 20199 (`availability`) e na linha 20433 (`pre-reserve`), o critério para descartar a reserva como bloqueio é apenas:  
     `if (r.status === "pre_reserva" && r.expiresAt && new Date(r.expiresAt).getTime() < nowMs) return;`
   - Como falta a cláusula `&& r.paymentStatus !== "pago_total"`, o código ignora a reserva paga e deixa de adicioná-la a `busyFlatSet`.
   - **Dedução lógica:** Adicionar `&& r.paymentStatus !== "pago_total"` em ambas as checagens garante que pré-reservas pagas nunca sejam ignoradas, mantendo o flat permanentemente bloqueado até a confirmação definitiva ou cancelamento formal.

2. **Da rejeição de commit para reservas expiradas e revalidação de conflito:**
   - Observação 1.2 demonstra que `commit-reservation` aceita reservas com `status === "expirada"` e com hold vencido sem pagamento, retornando 200 OK.
   - Pela especificação do sistema e do teste adversarial, uma reserva com status `"expirada"` ou com hold vencido no momento da chamada (e sem pagamento comprovado) deve retornar HTTP 400 com payload `{ error: "PRE_RESERVATION_EXPIRED", message: ... }`.
   - Além disso, antes de efetivar definitivamente no PMS (`reservation.status = "confirmada"`), o sistema deve revalidar conflitos temporais de datas contra outras reservas ativas e contra bloqueios de manutenção (`db.roomBlocks`). Havendo sobreposição, o endpoint deve retornar HTTP 409 `{ error: "FLAT_UNAVAILABLE", message: ... }`.
   - **Dedução lógica:** Inserir a guarda de status/tempo expirado antes da confirmação e a revalidação de sobreposição protege o PMS contra double-booking tardio.

3. **Da configurabilidade do hold de pré-reserva:**
   - Observação 1.3 mostra que `pre-reserve` ignora o valor configurado em `db.botActionsSettings.preReservationHoldMinutes`.
   - O helper existente `getBotActionsSettings()` retorna as configurações atuais com fallback seguro para `{ preReservationHoldMinutes: 30 }`.
   - **Dedução lógica:** Obter `holdMinutes` a partir de `getBotActionsSettings().preReservationHoldMinutes || 30` e utilizá-lo para calcular `expiresAt`, a mensagem de auditoria e a propriedade `holdMinutes` no JSON de resposta satisfaz integralmente o teste 2.5 e o requisito R3.

---

## 3. Caveats

- **Escopo deste relatório:** Este relatório foca estritamente nas 3 falhas de ciclo de vida e configuração de pré-reservas (Subtests 2.3, 2.5 e 2.6). A falha de concorrência / race condition no `pre-reserve` (Subtests 3.1 e 3.2) foi tratada em paralelo pelo Explorer 1 de Remediação.
- **Não-modificação de código de produção:** Em estrita observância às regras de agente Explorer (Read-only investigation), nenhuma linha de código foi alterada em arquivos de produção nesta etapa. As correções detalhadas abaixo devem ser aplicadas pelo Worker.

---

## 4. Conclusion & Recomendações para o Worker

As 3 falhas de ciclo de vida de pré-reservas possuem diagnóstico 100% mapeado e correções cirúrgicas prontas para implementação imediata pelo Worker.

### 4.1 Estratégia de Implementação e Código Exato

O Worker deve aplicar as seguintes alterações em **`artifacts/api-server/demo-server.mjs`** e replicá-las identicamente em **`scripts/demo-server.mjs`**:

#### A. Corrigir filtro de reservas pagas em `availability`
- **Arquivo:** `artifacts/api-server/demo-server.mjs` (linha ~20199) e `scripts/demo-server.mjs` (linha ~20199)
- **Código Atual (Antes):**
  ```javascript
      if (r.status === "cancelada" || r.status === "expirada") return;
      if (r.status === "pre_reserva" && r.expiresAt && new Date(r.expiresAt).getTime() < nowMs) return;

      if (r.checkinDate < outDate && r.checkoutDate > inDate) {
  ```
- **Código Corrigido (Depois):**
  ```javascript
      if (r.status === "cancelada" || r.status === "expirada") return;
      if ((r.status === "pre_reserva" || r.status === "pendente") && r.expiresAt && new Date(r.expiresAt).getTime() < nowMs && r.paymentStatus !== "pago_total") return;

      if (r.checkinDate < outDate && r.checkoutDate > inDate) {
  ```

#### B. Corrigir verificação de conflito para reservas pagas e aplicar `preReservationHoldMinutes` em `pre-reserve`
- **Arquivo:** `artifacts/api-server/demo-server.mjs` (linhas ~20431–20518) e `scripts/demo-server.mjs` (linhas ~20431–20518)
- **Código Atual (Antes):**
  ```javascript
    // Verifica se o flat já está ocupado por reserva ativa não-expirada
    const nowMs = Date.now();
    const hasConflict = (db.reservations || []).some(r => {
      if (r.status === "cancelada" || r.status === "expirada") return false;
      if (r.status === "pre_reserva" && r.expiresAt && new Date(r.expiresAt).getTime() < nowMs) return false;
      if (String(r.flatId) !== String(flat.id) && String(r.flatNumber) !== String(flat.number)) return false;
      return r.checkinDate < outDate && r.checkoutDate > inDate;
    });

    if (hasConflict) {
      return res.status(409).json({
        error: "FLAT_UNAVAILABLE",
        message: `O Flat ${flat.number} já possui reserva ou bloqueio para o período selecionado.`
      });
    }

    const nextId = db.reservations && db.reservations.length > 0
      ? Math.max(...db.reservations.map(r => r.id || 0)) + 1
      : 1;
    const code = `CF-${Math.floor(100000 + Math.random() * 900000)}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  ```
- **Código Corrigido (Depois):**
  ```javascript
    // Verifica se o flat já está ocupado por reserva ativa não-expirada
    const nowMs = Date.now();
    const hasConflict = (db.reservations || []).some(r => {
      if (r.status === "cancelada" || r.status === "expirada") return false;
      if ((r.status === "pre_reserva" || r.status === "pendente") && r.expiresAt && new Date(r.expiresAt).getTime() < nowMs && r.paymentStatus !== "pago_total") return false;
      if (String(r.flatId) !== String(flat.id) && String(r.flatNumber) !== String(flat.number)) return false;
      return r.checkinDate < outDate && r.checkoutDate > inDate;
    });

    if (hasConflict) {
      return res.status(409).json({
        error: "FLAT_UNAVAILABLE",
        message: `O Flat ${flat.number} já possui reserva ou bloqueio para o período selecionado.`
      });
    }

    const nextId = db.reservations && db.reservations.length > 0
      ? Math.max(...db.reservations.map(r => r.id || 0)) + 1
      : 1;
    const code = `CF-${Math.floor(100000 + Math.random() * 900000)}`;
    const botSettings = getBotActionsSettings();
    const holdMinutes = (typeof botSettings?.preReservationHoldMinutes === "number" && botSettings.preReservationHoldMinutes > 0)
      ? botSettings.preReservationHoldMinutes
      : 30;
    const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000).toISOString();
  ```
- **E na auditoria e resposta de `pre-reserve`:**
  - Em `auditLogs`:
    ```javascript
    description: `Pré-reserva criada via API com hold de ${holdMinutes} minutos (expira em ${expiresAt})`
    ```
  - Em `res.json(...)`:
    ```javascript
    holdMinutes: holdMinutes
    ```

- **Opcional recomendável em `POST /api/bot-actions/payment-link` (linha ~20379):**
  - Substituir `const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();` por:
    ```javascript
    const botSettings = getBotActionsSettings();
    const holdMinutes = (typeof botSettings?.preReservationHoldMinutes === "number" && botSettings.preReservationHoldMinutes > 0)
      ? botSettings.preReservationHoldMinutes
      : 30;
    const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000).toISOString();
    ```

#### C. Bloquear commit de reservas expiradas e revalidar conflitos em `commit-reservation`
- **Arquivo:** `artifacts/api-server/demo-server.mjs` (linhas ~20545–20555) e `scripts/demo-server.mjs` (linhas ~20545–20555)
- **Código Atual (Antes):**
  ```javascript
    if (reservation.status === "cancelada") {
      return res.status(400).json({
        error: "RESERVATION_CANCELLED",
        message: "Esta reserva está cancelada e não pode ser efetivada."
      });
    }

    reservation.status = "confirmada";
    reservation.paymentStatus = "pago_total";
  ```
- **Código Corrigido (Depois):**
  ```javascript
    if (reservation.status === "cancelada") {
      return res.status(400).json({
        error: "RESERVATION_CANCELLED",
        message: "Esta reserva está cancelada e não pode ser efetivada."
      });
    }

    const nowMs = Date.now();
    const isExpiredByTime = (reservation.status === "pre_reserva" || reservation.status === "pendente") &&
      reservation.expiresAt &&
      new Date(reservation.expiresAt).getTime() < nowMs &&
      reservation.paymentStatus !== "pago_total";

    if (reservation.status === "expirada" || isExpiredByTime) {
      if (reservation.status !== "expirada") {
        reservation.status = "expirada";
        reservation.updatedAt = new Date().toISOString();
        saveDatabase("commit_reservation_expired_auto");
      }
      return res.status(400).json({
        error: "PRE_RESERVATION_EXPIRED",
        message: "Esta pré-reserva expirou e não pode ser efetivada."
      });
    }

    // Revalidação de conflito com outras reservas ativas no PMS antes de efetivar definitivamente
    const hasConflict = (db.reservations || []).some(r => {
      if (String(r.id) === String(reservation.id) || String(r.code) === String(reservation.code)) return false;
      if (r.status === "cancelada" || r.status === "expirada") return false;
      if ((r.status === "pre_reserva" || r.status === "pendente") && r.expiresAt && new Date(r.expiresAt).getTime() < nowMs && r.paymentStatus !== "pago_total") return false;
      if (String(r.flatId) !== String(reservation.flatId) && String(r.flatNumber) !== String(reservation.flatNumber)) return false;
      return r.checkinDate < reservation.checkoutDate && r.checkoutDate > reservation.checkinDate;
    });

    if (hasConflict) {
      return res.status(409).json({
        error: "FLAT_UNAVAILABLE",
        message: `O Flat ${reservation.flatNumber || reservation.flatId} já possui outra reserva confirmada para o período selecionado.`
      });
    }

    const hasBlockConflict = (db.roomBlocks || []).some(b => {
      if (String(b.flatId) !== String(reservation.flatId) && String(b.flatNumber) !== String(reservation.flatNumber)) return false;
      return b.startDate < reservation.checkoutDate && b.endDate > reservation.checkinDate;
    });

    if (hasBlockConflict) {
      return res.status(409).json({
        error: "FLAT_UNAVAILABLE",
        message: `O Flat ${reservation.flatNumber || reservation.flatId} possui bloqueio de manutenção para o período selecionado.`
      });
    }

    reservation.status = "confirmada";
    reservation.paymentStatus = "pago_total";
  ```

---

## 5. Verification Method

Para verificar a implementação pelo Worker e comprovar a resolução das 3 falhas:

1. **Executar a suíte adversarial:**
   ```bash
   node --test tests/challenger-m1-adversarial.test.mjs
   ```
   - **Condição de aprovação dos testes de ciclo de vida:**
     - Subtest 2.3: passa com sucesso (Flat 211 permanece bloqueado para reserva paga vencida).
     - Subtest 2.5: passa com sucesso (`holdMinutes` configurado para 15 minutos é respeitado pelo endpoint).
     - Subtest 2.6: passa com sucesso (tentativa de commit da reserva 70001 retorna HTTP 400 `PRE_RESERVATION_EXPIRED`).

2. **Verificar testes de regressão de API:**
   ```bash
   node --test tests/bot-actions-api.test.mjs
   ```
   - Todos os 5 testes devem continuar passando com status 200/403/409 apropriados.

3. **Verificar paridade byte-a-byte entre os arquivos espelho:**
   ```bash
   node --test tests/pre-reservation-payment-integrity.test.mjs
   ```
   - Subtest 1 ("Paridade byte-a-byte entre demo-server.mjs e scripts/demo-server.mjs") deve retornar `ok 1`.

# Relatório de Handoff — Explorer 2 (Backend Engine Explorer)
**Data**: 2026-11-04  
**Missão**: Investigação técnica detalhada dos requisitos R2, R3 e R4 (Gatilho Backend, Elegibilidade, Fair-Share, Hold Temporário de 30min, Expiração Silenciosa, Webhook PIX, Atualização PMS e Governança) para a "Oferta de Domingo Sem Pressa (Saída Livre + Bônus Segunda)".  
**Diretório do Agente**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_2`

---

## 1. Observation (Observações Diretas com Evidências de Código)

### 1.1 Motor de Agendamento em Segundo Plano e Fuso de Brasília
- **Arquivo**: `artifacts/api-server/zapi-service.mjs`
- **Linhas 11224–11232**:
  ```javascript
  const runnerInterval = setInterval(async () => {
    try {
      if (typeof globalThis.__corpflatsIsDbHydrated === "function" && !globalThis.__corpflatsIsDbHydrated()) return;
      const db = getDb();
      if (!db || !db.zapiConfig?.enabled) return;

      const now = new Date();
      const nowIso = now.toISOString();
      cronCounter++;
  ```
- **Linhas 11283–11285**:
  ```javascript
  const nowUtc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brDate = new Date(nowUtc - (3 * 3600000));
  const todayStr = brDate.toISOString().substring(0, 10);
  ```
  *Observação*: O background runner executa a cada 60 segundos com conversão determinística para o horário de Brasília (UTC-3). Rotinas como `checkAndTriggerCleaningDelayAlerts` (linha 14625) rodam dentro desse runner avaliando a hora de Brasília (`brHour` e `brMinute`).

### 1.2 Algoritmo de Alocação Justa de Flats (`selectFairShareFlat`)
- **Arquivo**: `artifacts/api-server/whatsapp-ai-service.mjs`
- **Linha 14345**:
  ```javascript
  export function selectFairShareFlat(db, checkinDate, checkoutDate, excludeResId = null) {
  ```
- **Linhas 14447–14460**:
  ```javascript
  const hasPendingModConflict = validReservations.some(r => {
    const pm = r.pendingModification;
    if (!pm || pm.status !== "awaiting_payment") return false;
    if (pm.expiresAt && new Date(pm.expiresAt).getTime() <= nowMs) return false;
    const targetFlatId = pm.newFlatId ?? r.flatId;
    const targetFlatNum = pm.newFlatNumber ?? r.flatNumber;
    const sameFlat =
      (targetFlatId != null && String(targetFlatId) === String(flat.id)) ||
      (targetFlatNum != null && String(targetFlatNum) === String(flat.number));
    if (!sameFlat) return false;
    const modIn = pm.newCheckinDate || r.checkinDate;
    const modOut = pm.newCheckoutDate || r.checkoutDate;
    return modIn < checkoutDate && modOut > checkinDate;
  });
  ```
- **Arquivo**: `artifacts/api-server/agent-architecture.mjs`
- **Linhas 586–599**:
  ```javascript
  function selectFairShareFlatHelper(db, checkinDate, checkoutDate, excludeFlatNumber = null) {
    if (!db) return null;
    if (typeof globalThis.selectFairShareFlat === 'function') {
      try {
        const res = globalThis.selectFairShareFlat(db, checkinDate, checkoutDate);
        if (res?.recommendedFlat && String(res.recommendedFlat.number) !== String(excludeFlatNumber)) {
          return res.recommendedFlat;
        }
        if (Array.isArray(res?.availableFlats)) {
          const alt = res.availableFlats.find((f) => String(f.number) !== String(excludeFlatNumber));
          if (alt) return alt;
        }
      } catch (_) {}
    }
  ```
- **Linhas 1823–1842**: Em `agent-architecture.mjs`, o padrão de remanejamento de hóspede entrante no domingo já existe:
  ```javascript
  if (isSundayLowOccupancy && horarioFormatado > '13:00' && incomingSameDayRes) {
    const fairFlat = selectFairShareFlatHelper(
      db,
      String(incomingSameDayRes.checkinDate || dataCheckout).slice(0, 10),
      String(incomingSameDayRes.checkoutDate || '').slice(0, 10),
      flatNumber
    );
    if (fairFlat) {
      const oldIncomingFlat = incomingSameDayRes.flatNumber;
      incomingSameDayRes.flatId = fairFlat.id || fairFlat.number;
      incomingSameDayRes.flatNumber = String(fairFlat.number);
      incomingSameDayRes.updatedAt = new Date().toISOString();
  ```

### 1.3 Pré-Reservas e Mecanismo Atual de Expiração
- **Arquivo**: `artifacts/api-server/demo-server.mjs`
- **Linhas 28219–28315 (`sweepExpiredPreReservations`)**:
  ```javascript
  export function sweepExpiredPreReservations(targetDb = db, saveFn = saveDatabase) {
    if (!targetDb || !Array.isArray(targetDb.reservations)) return 0;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    let expiredCount = 0;
    ...
    for (const r of targetDb.reservations) {
      if (!r) continue;
      if (r.status !== "pre_reserva" && r.status !== "pendente") continue;
      if (!r.expiresAt) continue;
      ...
      // 2. Expiração definitiva quando expMs <= nowMs
      const prevStatusLabel = r.status === "pre_reserva" ? "Pré-Reserva" : "Pendente";
      r.status = "expirada";
      r.expiredAt = nowIso;
      ...
      if (!r.expiredWhatsappSentAt && typeof triggerImmediateWhatsApp === "function") {
        r.expiredWhatsappSentAt = nowIso;
        triggerImmediateWhatsApp(
          targetDb,
          saveFn,
          "pre_reservation_expired",
          ...
  ```
  *Observação*: `sweepExpiredPreReservations` foi desenhado apenas para pré-reservas gerais (`r.status === "pre_reserva" || r.status === "pendente"`). Se aplicado a uma reserva em andamento (`confirmed` / `in_stay`), mudar `r.status = "expirada"` destruiria a reserva do hóspede e enviaria mensagem de expiração indesejada. Portanto, o hold de upsell temporário precisa de uma expiração dedicada que limpe apenas `r.pendingSundayUpsell` e `r.pendingModification` sem alterar o status da reserva nem disparar WhatsApp (`isSilentUpsellHold: true`).

### 1.4 Geração de Cobranças PIX
- **Arquivo**: `artifacts/api-server/demo-server.mjs`
- **Linha 57885**: `async function createInterPixCob({ amount, description, debtorName, debtorDocument, reservationCode })`
- **Linha 26443**: `export function generateStaticPixPayload({ pixKey, amount, merchantName, merchantCity, txid })`
- **Linha 250 em `zapi-service.mjs`**: `generateStaticPixPayload` idêntica exportada.

### 1.5 Webhook Oficial do Banco Inter
- **Arquivo**: `artifacts/api-server/demo-server.mjs`
- **Linha 57998**: `app.post("/api/pms/inter/webhook", async (req, res) => {`
- **Linhas 58020–58026**:
  ```javascript
  const resServiceOrder = (db.reservations || []).find(resItem =>
    resItem.pendingStayoverCleaning?.txid === txid ||
    resItem.pendingEarlyCheckin?.txid === txid ||
    resItem.pendingLateCheckout?.txid === txid ||
    resItem.pendingNfcCardReplacement?.txid === txid ||
    resItem.pendingStayExtension?.txid === txid
  );
  ```
  *Observação*: Há um padrão perfeitamente estabelecido para produtos adicionais (`pendingStayoverCleaning`, `pendingEarlyCheckin`, `pendingLateCheckout`, `pendingStayExtension`). A inclusão de `pendingSundayUpsell` se integra de forma transparente a esse bloco.

### 1.6 Governança e Reagendamento de Limpeza
- **Arquivo**: `artifacts/api-server/demo-server.mjs`
- **Linhas 31828–31913**:
  ```javascript
  // Sincronização automática com a Governança / Limpeza quando muda a data de check-out ou flat:
  if (oldCheckout !== r.checkoutDate || oldFlatId !== r.flatId) {
    if (!db.cleaningRequests) db.cleaningRequests = [];
    const flatNum = r.flatNumber || (flat ? flat.number : null);
    const oldReq = db.cleaningRequests.find(c =>
      (c.flatId === oldFlatId || String(c.flatNumber) === String(flatNum)) &&
      c.requestDate === oldCheckout &&
      ...
    if (oldReq) {
      oldReq.requestDate = r.checkoutDate;
      ...
  ```
  *Observação*: O sistema já possui a rotina para transpor o card de limpeza da data antiga para a nova data quando `checkoutDate` é alterado.

---

## 2. Logic Chain (Cadeia de Raciocínio Passo a Passo)

1. **Da Observação 1.1 para o Agendamento dos Sábados às 19:00h**:
   - O runner em `zapi-service.mjs` roda a cada 60s e já gerencia disparos agendados no fuso de Brasília.
   - Para disparar aos sábados às 19:00h, basta verificar `brDate.getDay() === 6 && brDate.getHours() === 19` e comparar `lastTriggerDate !== todayStr` para garantir disparo único no sábado.
   - O botão manual de teste/validação pode disparar a mesma função `triggerSundayUpsellRoutine(db, saveDatabase, { forceDate, isDryRun })`.

2. **Da Observação 1.2 para a Elegibilidade e Fair-Share**:
   - A reserva elegível tem `checkoutDate === targetSundayDate`, status ativo e `guestPhone`.
   - Se o flat estiver vago de domingo para segunda (sem reservas conflitantes em `db.reservations`), a oferta pode ser disparada diretamente (Cenário 1).
   - Se houver reserva entrante no domingo no mesmo flat (`incomingRes`), chamamos `selectFairShareFlat(db, incomingRes.checkinDate, incomingRes.checkoutDate, incomingRes.id)` excluindo o flat atual. Havendo flat alternativo vago, a oferta pode ser disparada porque a entrante poderá ser remanejada (Cenário 2).
   - Se o prédio estiver 100% ocupado ou não houver flat alternativo para a reserva entrante, a oferta é bloqueada (Cenário 3).

3. **Das Observações 1.2 e 1.3 para o Hold de 30min e Expiração Silenciosa**:
   - Ao disparar a oferta, `r.pendingSundayUpsell` armazena `txid`, `pixCopiaECola`, `promotionalPrice`, `expiresAt: now + 30min`, `isSilentUpsellHold: true`, e referências de remanejamento (`incomingReservationId`, `alternateFlatNumber`).
   - Para travar o flat no calendário do PMS sem alterar o check-out definitivo da reserva, gravamos `r.pendingModification = { status: "awaiting_payment", newCheckoutDate: mondayDate, expiresAt, isSilentUpsellHold: true }`. Isso é nativamente respeitado pelo `selectFairShareFlat` e pelo mapa PMS.
   - Após 30 minutos sem pagamento, o loop de 20s remove `r.pendingModification` e marca `r.pendingSundayUpsell.status = "expired"`. Nenhuma mensagem é enviada ao hóspede e `r.status` e `r.checkoutDate` permanecem intactos no domingo às 12:00h.

4. **Das Observações 1.4 e 1.5 para o Webhook PIX**:
   - Quando o Banco Inter notifica o pagamento em `POST /api/pms/inter/webhook`, o sistema localiza a reserva via `resItem.pendingSundayUpsell?.txid === txid`.
   - Atualiza `resItem.checkoutDate = mondayDate`, `resItem.checkoutTime = "12:00"`, `hasSundayUpsell = true`, e adiciona os registros em `charges` e `payments`.
   - Reagenda o card de limpeza em `db.cleaningRequests` de domingo para segunda-feira (Observação 1.6).
   - Se havia remanejamento planejado (`alternateFlatNumber`), altera `incomingRes.flatId` e `incomingRes.flatNumber` para o flat alternativo, incrementa `calendarSequence` e registra log de auditoria.
   - Envia a mensagem obrigatória do requisito R4: *"Pagamento confirmado! 🎉 Seu check-out livre de domingo (com direito a ficar até segunda às 12h se desejar) já está garantido no sistema. Aproveite seu descanso!"*.

5. **Da Observação 1.1 e Arquitetura da Sofia para o Contexto Dinâmico**:
   - Em `agent-architecture.mjs`, `injectSessionContext` adiciona `oferta_domingo_sem_pressa` a `reserva_ativa`.
   - A IA Sofia reconhece que o hóspede recebeu a oferta. Se os 30 minutos expirarem e o hóspede pedir novo PIX no chat, a Sofia pode revalidar a vaga de domingo para segunda e gerar nova cobrança promocional.

---

## 3. Caveats (Ressalvas e Casos de Borda)

1. **Paridade Twin-Server (`artifacts/api-server/` ↔ `scripts/`)**:
   - Todo código escrito nos arquivos de runtime (`demo-server.mjs`, `zapi-service.mjs`, `agent-architecture.mjs`, etc.) deve ser editado exclusivamente em `artifacts/api-server/` e em seguida espelhado em `scripts/` (via cópia) para passar na verificação `scripts/check-twin-parity.mjs`.
2. **Concorrência entre Disparos Manuais e Agendamento Automático**:
   - Uma reserva que já recebeu a oferta para aquele domingo não deve receber duplicatas caso o administrador clique no botão manual repetidas vezes. Devemos verificar `r.sundayUpsellOfferSentDate === targetSundayDate`.
3. **Reserva Entrante que Altera Datas Antes da Confirmação**:
   - No momento da confirmação do PIX do upsell, caso exista remanejamento de reserva entrante pendente, o sistema deve checar rapidamente se o flat alternativo continua vago. Se tiver ocorrido overbooking externo improvável, a gerência é notificada via `notifyAdminWhatsApp`.
4. **Isolamento de Testes**:
   - NUNCA executar `tests/*.test.mjs` de forma ampla ou varreduras completas no repositório, conforme estipulado no `AGENTS.md`. Apenas testes estritamente pontuais desenvolvidos para este fluxo devem ser executados.

---

## 4. Conclusion (Conclusão Arquitetural)

1. O backend atual possui todas as primitivas necessárias para suportar a **"Oferta de Domingo Sem Pressa"** com zero acoplamento destrutivo:
   - Runner em segundo plano com relógio de Brasília em `zapi-service.mjs`.
   - Algoritmo Fair-Share em `whatsapp-ai-service.mjs` e `agent-architecture.mjs`.
   - Mecanismo de trava de calendário temporária via `pendingModification`.
   - Cobrança PIX Banco Inter com fallback em `createInterPixCob` / `generateStaticPixPayload`.
   - Interceptação de transações adicionais no webhook `POST /api/pms/inter/webhook`.
   - Sincronizador de governança em `demo-server.mjs`.
2. A expiração silenciosa (`isSilentUpsellHold: true`) é garantida ao dissociar a expiração do upsell da rotina tradicional de cancelamento de pré-reservas, evitando que mensagens de cancelamento sejam disparadas ao hóspede e mantendo a reserva original inalterada.
3. O plano técnico está pronto para execução pelos implementadores de backend e frontend.

---

## 5. Verification Method (Método de Verificação Independente)

Os implementadores e auditores podem verificar a integridade da implementação seguindo estes passos:

1. **Verificação de Paridade dos Arquivos Gêmeos**:
   ```powershell
   node scripts/check-twin-parity.mjs
   ```
   *Critério de Sucesso*: 100% de paridade SHA-256 entre `artifacts/api-server/` e `scripts/`.

2. **Verificação dos Endpoints de Configuração e Disparo Manual**:
   - Executar chamada para obter configurações:
     ```powershell
     curl http://localhost:5000/api/pms/upsell/sunday/config
     ```
     *Critério de Sucesso*: Retorno HTTP 200 com JSON contendo `enabled`, `sundayUpsellPrice`, `channelId: "guest_schedule"`.
   - Executar simulação de elegibilidade (preview):
     ```powershell
     curl http://localhost:5000/api/pms/upsell/sunday/preview
     ```
     *Critério de Sucesso*: Retorno de lista de reservas ativas com check-out no domingo e classificação de elegibilidade (Flat Vago vs Remanejamento vs Condomínio Ocupado).

3. **Verificação da Expiração Silenciosa (`isSilentUpsellHold: true`)**:
   - Criar uma reserva teste com check-out no domingo.
   - Acionar o disparo de upsell (gerando `pendingSundayUpsell` e `pendingModification` com `expiresAt`).
   - Simular o avanço do relógio em 31 minutos.
   - Executar a rotina de varredura.
   - *Critério de Sucesso*: O hold é removido de `pendingModification`, `pendingSundayUpsell.status` vai para `"expired"`, `r.checkoutDate` continua sendo domingo às 12:00h, `r.status` permanece `"confirmed"` / `"in_stay"`, e NENHUMA mensagem de cancelamento é enviada para a fila de WhatsApp (`db.whatsappQueue`).

4. **Verificação da Confirmação via Webhook PIX**:
   - Enviar payload de teste para `POST /api/pms/inter/webhook` contendo o `txid` da oferta gerada.
   - *Critério de Sucesso*:
     - `r.checkoutDate` atualizado para segunda-feira às 12:00h.
     - Card de limpeza do flat transferido de domingo para segunda-feira em `db.cleaningRequests`.
     - Caso houvesse reserva entrante, ela é alocada no flat alternativo Fair-Share.
     - Mensagem de confirmação enviada com o texto exato do requisito R4.

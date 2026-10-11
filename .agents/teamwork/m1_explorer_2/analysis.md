# Relatório de Análise e Especificação Técnica: Endpoint `/modify-checkout` e Motor de Hold Provisório (`r.pendingModification`)

**Agente**: M1 Explorer 2  
**Data**: 2026-10-11  
**Projeto**: CorpFlats Guest-Flow-Manager  
**Milestone**: Milestone 1 — Backend Simulation, Hold & Settlement Engine  
**Diretório de Trabalho**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_explorer_2`  
**Escopo**: Endpoint `POST /api/pms/guest-portal/:code/modify-checkout`, Estrutura do Hold Provisório (`r.pendingModification`), Integração de Pagamento PIX e Mercado Pago, Algoritmos de Disponibilidade/Conflito e Auto-Expiração de 30 Minutos.

---

## 1. Sumário Executivo

O objetivo desta investigação é projetar a especificação arquitetural e o blueprint de código completo para o endpoint **`POST /api/pms/guest-portal/:code/modify-checkout`** e para a estrutura de **bloqueio provisório de calendário (hold de 30 minutos em `r.pendingModification`)** no backend do CorpFlats (`scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`).

### Diagnóstico da Vulnerabilidade Existente
Atualmente, o endpoint legado `POST /api/pms/guest-portal/:code/modify` (linhas 15.456 a 15.716 do `demo-server.mjs`) altera imediatamente as datas da reserva no banco de dados (`r.checkinDate = newCheckinDate`, `r.checkoutDate = newCheckoutDate`, linhas 15.615–15.616) e adiciona o valor ao total (`r.totalAmount += additionalAmountToPay`, linha 15.529), mesmo quando há acréscimo financeiro a pagar (`additionalAmountToPay > 0`). Se o hóspede fechar a janela, desistir ou não efetuar o pagamento, a estadia já foi estendida no PMS sem nenhuma liquidação prévia.

### Solução Arquitetural de 2 Etapas
Para sanar essa falha crítica:
1. **Etapa 1 (Simulação)**: Endpoint `/modify-preview` (desenhado pelo M1 Explorer 1) calcula custos e verifica disponibilidade sem tocar no banco.
2. **Etapa 2 (Hold & Checkout)**: Quando `additionalAmountToPay > 0`, o endpoint **`POST /modify-checkout`** cria um bloqueio provisório de 30 minutos em `r.pendingModification`, gera cobrança PIX (Banco Inter mTLS oficial com fallback para PIX estático EMV com QR Code Base64) e preferência no Mercado Pago (Checkout Pro), **sem alterar as datas originais da reserva (`r.checkinDate` e `r.checkoutDate` permanecem estritamente intactas)**.
3. **Bloqueio de Calendário sem Efeito Colateral**: Todos os algoritmos de consulta de disponibilidade do sistema (`hasReservationConflict`, `GET /api/reservations/availability`, `GET /api/bot-actions/availability`, `POST /api/bot-actions/pre-reserve`, etc.) passam a reconhecer o hold ativo como bloqueio de quarto. Se o hóspede não pagar em até 30 minutos, o hold expira automaticamente, liberando as datas propostas sem que as datas originais tenham sido adulteradas.

---

## 2. Investigação Técnica dos Subsistemas Existentes em `scripts/demo-server.mjs`

### 2.1 Geração de Cobrança PIX
A investigação detalhada do código-fonte revelou dois mecanismos de emissão PIX em `demo-server.mjs`:

#### A. PIX Dinâmico Inter (mTLS Cobrança Imediata / v2)
- **Função**: `createInterPixCob({ amount, description, debtorName, debtorDocument, reservationCode })` (linhas 27.704–27.776).
- **Mecanismo**: Realiza chamada autenticada mTLS via `https://cdpj.partners.bancointer.com.br/pix/v2/cob/${txid}` utilizando `getInterAccessToken()` e agente HTTPS configurado com certificados da CorpFlats.
- **Retorno**:
  ```javascript
  {
    txid: string,          // Hash hexadecimal de 32 chars
    pixCopiaECola: string, // BR Code oficial gerado pelo Banco Inter
    location: string,
    status: "ATIVA",
    valor: string,
    expiresIn: 3600,
    createdAt: string
  }
  ```
- **Resiliência**: Se as credenciais do Banco Inter não estiverem configuradas ou se a API retornar erro de rede/timeout, a função rejeita a Promise, permitindo fallback transparente para o PIX estático.

#### B. PIX Estático Autônomo (EMV BR Code Padrão BACEN)
- **Função**: `generateStaticPixPayload({ pixKey, amount, merchantName, merchantCity, txid })` (linhas 11.283–11.307).
- **Mecanismo**: Monta a string no padrão EMV BR Code (ID 00 a 63 com cálculo de CRC16).
  - Chave padrão: `47964813000165` (CNPJ CorpFlats).
  - Nome: `CORPFLATS LTDA`.
  - Cidade: `CAMPOS DOS GOYTACAZES`.
  - TxId: Normalizado e sanitizado (até 25 caracteres alfanuméricos).
- **QR Code Base64**: Biblioteca `qrcode` já importada no topo do arquivo (linha 66: `import QRCode from "qrcode";`). A geração ocorre via `await QRCode.toDataURL(pixPayload)`.

### 2.2 Geração de Preferência no Mercado Pago
- **Função**: `createMercadoPagoPreference({ reservationCode, amount, guestName, guestEmail, nights, flatNumber })` (linhas 28.487–28.570).
- **Configuração**: Credenciais em `db.settings.mercadoPagoConfig` ou `DEFAULT_MP_CONFIG` (linhas 28.478–28.485).
- **Retorno**:
  ```javascript
  {
    id: string,               // Preference ID (ex: "pref_123456789")
    initPoint: string,        // URL de checkout web (Checkout Pro)
    sandboxInitPoint: string
  }
  ```

#### Descoberta Crítica de Isolamento: `external_reference`
Na função `createMercadoPagoPreference`, a propriedade `external_reference` é definida como `reservationCode`.
Se usássemos simplesmente `reservationCode: r.code`, uma reserva que já foi paga pelo Mercado Pago no momento da compra original teria um pagamento aprovado registrado com `external_reference = r.code`. Ao consultar `checkMercadoPagoPaymentByRef(r.code)`, a API retornaria o pagamento antigo de semanas atrás, gerando um **falso positivo catastrófico de liquidação imediata**!
**Decisão de Projeto**: No checkout de modificação, a preferência do Mercado Pago deve ser gerada com `external_reference: "MOD-" + r.code` (ou `"MOD-" + r.code + "-" + pendingId`). Dessa forma, a busca por pagamentos da modificação em `checkMercadoPagoPaymentByRef("MOD-" + r.code)` encontrará exclusivamente o pagamento correspondente a essa alteração!

---

## 3. Estrutura do Hold Provisório (`r.pendingModification`)

O bloqueio provisório é anexado diretamente à reserva no array `db.reservations`.

### 3.1 Especificação TypeScript do Objeto
```typescript
interface PendingModification {
  // Identificação e Controle
  pendingId: string;              // Ex: "mod_1728651234_a1b2c3"
  status: 'pending' | 'expired' | 'committed' | 'canceled';
  createdAt: string;              // ISO 8601 (ex: "2026-10-11T13:00:00.000Z")
  expiresAt: string;              // ISO 8601 = createdAt + 30 minutos
  expiredAt?: string;             // ISO 8601 preenchido na expiração
  committedAt?: string;           // ISO 8601 preenchido na confirmação
  canceledAt?: string;            // ISO 8601 preenchido no cancelamento

  // Parâmetros Solicitados para a Nova Estadia
  newCheckinDate: string;         // YYYY-MM-DD
  newCheckoutDate: string;        // YYYY-MM-DD
  newGuestCount: number;          // Ocupantes
  newFlatId: number | string;     // ID do flat de destino
  newFlatNumber: string;          // Número do flat de destino (ex: "114")

  // Valores Financeiros
  additionalAmountToPay: number;  // Valor extra a liquidar (R$)
  paymentMethod: 'pix' | 'credit_card';

  // Artefatos de Cobrança PIX
  pixTxId: string;                // TxId oficial Inter ou sanitizado estático
  pixCopiaECola: string;          // Linha digitável EMV BR Code
  pixQrCodeUrl: string;           // Imagem data:image/png;base64,...

  // Artefatos de Cobrança Mercado Pago
  mpPreferenceId: string | null;  // ID da preferência gerada no MP
  mpCheckoutUrl: string | null;   // URL initPoint para redirecionamento

  // Metadados da Reserva Original (Snapshot de Segurança)
  reason: string;
  oldCheckinDate: string;         // Data de check-in original inalterada
  oldCheckoutDate: string;        // Data de check-out original inalterada
  oldFlatNumber: string;          // Flat original
  oldFlatId: number | string;
  oldTotalAmount: number;         // Valor total original da reserva
  oldNights: number;              // Noites originais
  newNights: number;              // Novas noites calculadas
  extraNights: number;            // Noites adicionais
  dailyRate: number;              // Diária base utilizada no cálculo
  refundAmount: number;           // Valor de estorno elegível (se houver)
  isUnder24h: boolean;            // Flag da política de 24 horas
  nonRefundableReduction: boolean;
}
```

### 3.2 Ciclo de Vida e Transições de Estado

```
                 [ POST /modify-checkout ]
                            │
                            ▼
                    status: 'pending'
                 (Hold ativo por 30 min)
                Bloqueia calendário do flat
               Datas originais NÃO se alteram
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
   Após 30 minutos    Cancelado pelo     Pagamento Detectado
   sem pagamento      hóspede no modal    e Confirmado
         │                  │                  │
         ▼                  ▼                  ▼
 status: 'expired'  status: 'canceled' status: 'committed'
   Hold desfeito      Hold desfeito      Datas originais são
Datas originais     Datas originais     atualizadas para as novas.
permanecem intactas permanecem intactas Pagamento entra em r.payments.
                                        r.needsReSignature = true.
```

---

## 4. Algoritmos de Disponibilidade e Blindagem de Calendário

Para que o hold funcione sem permitir double-booking, todos os pontos de consulta de disponibilidade do sistema devem reconhecer o objeto `r.pendingModification`.

### 4.1 Regras de Bloqueio por Hold
Uma data solicitada `[reqIn, reqOut)` para um apartamento `targetFlat` colide com um hold provisório de outra reserva `other` se:
1. `other.pendingModification` existir;
2. `other.pendingModification.status === "pending"` (ou `"pending_payment"`);
3. `new Date(other.pendingModification.expiresAt).getTime() > Date.now()` (hold ainda não expirou);
4. O flat solicitado for igual ao flat de destino do hold:
   `String(targetFlat) === String(other.pendingModification.newFlatNumber || other.pendingModification.newFlatId)`;
5. Houver sobreposição temporal:
   `other.pendingModification.newCheckinDate < reqOut && other.pendingModification.newCheckoutDate > reqIn`.

### 4.2 Função Canônica Centralizada: `hasReservationConflict`
Propõe-se a criação da função utilitária exportável `hasReservationConflict`:

```javascript
export function hasReservationConflict({
  flatId,
  flatNumber,
  checkinDate,
  checkoutDate,
  excludeReservationId = null,
  excludePendingHoldReservationId = null,
  nowMs = Date.now()
}) {
  const targetFlatIdStr = flatId != null ? String(flatId) : null;
  const targetFlatNumberStr = flatNumber != null ? String(flatNumber) : null;

  // 1. Checa conflito com reservas ativas do PMS
  const conflictWithReservation = (db.reservations || []).some(other => {
    if (excludeReservationId && (other.id === excludeReservationId || other.code === excludeReservationId)) {
      return false;
    }
    if (other.status === "cancelada" || other.status === "CANCELLED" || other.status === "expirada") {
      return false;
    }
    // Expira pré-reservas vencidas
    if ((other.status === "pre_reserva" || other.status === "pendente") && other.expiresAt) {
      if (new Date(other.expiresAt).getTime() < nowMs && other.paymentStatus !== "pago_total") {
        other.status = "expirada";
        return false;
      }
    }

    const otherFlatIdStr = other.flatId != null ? String(other.flatId) : null;
    const otherFlatNumberStr = other.flatNumber != null ? String(other.flatNumber) : null;
    const matchesFlat =
      (targetFlatNumberStr && (targetFlatNumberStr === otherFlatNumberStr || targetFlatNumberStr === otherFlatIdStr)) ||
      (targetFlatIdStr && (targetFlatIdStr === otherFlatIdStr || targetFlatIdStr === otherFlatNumberStr));

    if (!matchesFlat) return false;

    return checkinDate < other.checkoutDate && checkoutDate > other.checkinDate;
  });

  if (conflictWithReservation) return true;

  // 2. Checa conflito com holds provisórios ativos (r.pendingModification)
  const conflictWithPendingHold = (db.reservations || []).some(other => {
    if (excludePendingHoldReservationId && (other.id === excludePendingHoldReservationId || other.code === excludePendingHoldReservationId)) {
      return false;
    }
    const pending = other.pendingModification;
    if (!pending) return false;
    if (pending.status !== "pending" && pending.status !== "pending_payment") return false;

    // Se o hold expirou, atualiza status para expired e não bloqueia
    if (pending.expiresAt && new Date(pending.expiresAt).getTime() < nowMs) {
      pending.status = "expired";
      pending.expiredAt = new Date(nowMs).toISOString();
      return false;
    }

    const pHoldIn = pending.newCheckinDate || pending.proposedCheckinDate;
    const pHoldOut = pending.newCheckoutDate || pending.proposedCheckoutDate;
    const pHoldFlatId = pending.newFlatId != null ? String(pending.newFlatId) : null;
    const pHoldFlatNum = pending.newFlatNumber != null ? String(pending.newFlatNumber) : (pHoldFlatId || String(other.flatNumber));

    const matchesFlat =
      (targetFlatNumberStr && (targetFlatNumberStr === pHoldFlatNum || targetFlatNumberStr === pHoldFlatId)) ||
      (targetFlatIdStr && (targetFlatIdStr === pHoldFlatId || targetFlatIdStr === pHoldFlatNum));

    if (!matchesFlat) return false;

    return checkinDate < pHoldOut && checkoutDate > pHoldIn;
  });

  if (conflictWithPendingHold) return true;

  // 3. Checa conflito com bloqueios de manutenção (db.roomBlocks)
  const conflictWithRoomBlock = (db.roomBlocks || []).some(b => {
    const bFlatId = b.flatId != null ? String(b.flatId) : null;
    const bFlatNum = b.flatNumber != null ? String(b.flatNumber) : null;
    const matchesFlat =
      (targetFlatNumberStr && (targetFlatNumberStr === bFlatNum || targetFlatNumberStr === bFlatId)) ||
      (targetFlatIdStr && (targetFlatIdStr === bFlatId || targetFlatIdStr === bFlatNum));

    if (!matchesFlat) return false;

    return checkinDate < b.endDate && checkoutDate > b.startDate;
  });

  if (conflictWithRoomBlock) return true;

  return false;
}
```

### 4.3 Pontos de Integração em Endpoints Existentes
1. **`GET /api/reservations/availability` (linha 11.183)**:
   - Adicionar o flat do hold ativo de `r.pendingModification` em `occupiedFlatIds`.
2. **`POST /api/reservations/quote` (linha 11.483)**:
   - Adicionar o flat do hold ativo de `r.pendingModification` em `occupiedFlatNumbers`.
3. **`GET /api/bot-actions/availability` (linha 20.756)**:
   - Adicionar o flat e ID do hold ativo em `busyFlatSet`.
4. **`POST /api/bot-actions/pre-reserve` (linha 21.002)**:
   - Incluir verificação de holds provisórios em `hasConflict`.
5. **`POST /api/bot-actions/commit-reservation` (linha 21.175)**:
   - Incluir verificação de holds provisórios em `hasConflict`.

---

## 5. Especificação do Endpoint `POST /api/pms/guest-portal/:code/modify-checkout`

### 5.1 Contrato da Rota
- **Método**: `POST`
- **URL**: `/api/pms/guest-portal/:code/modify-checkout`
- **Headers**: `Content-Type: application/json`

### 5.2 Corpo da Requisição (Input)
```json
{
  "newCheckinDate": "2026-10-15",
  "newCheckoutDate": "2026-10-20",
  "newGuestCount": 2,
  "newFlatId": 2,
  "newFlatNumber": "114",
  "reason": "Extensão de duas diárias",
  "paymentMethod": "pix"
}
```

### 5.3 Pipeline de Processamento
1. **Autenticação & Validação de Canal**:
   - Localiza reserva por código ou telefone: `findReservationByLocatorOrContact(code)`.
   - Se não encontrada: `404 Not Found`.
   - Se `r.status === "cancelada" || r.status === "CANCELLED" || r.status === "expirada"`: `400 Bad Request`.
   - Se o canal não for direto (`whatsapp`, `site`, `site_direto`, `direto`, `balcao`): `403 Forbidden`.
2. **Validação de Parâmetros**:
   - `newCheckinDate` e `newCheckoutDate` obrigatórios.
   - `newCheckoutDate > newCheckinDate`.
   - Resolução do flat de destino: se informado `newFlatId` ou `newFlatNumber`, valida existência em `db.flats`. Caso contrário, mantém o flat atual `r.flatNumber`.
3. **Verificação Concorrente de Disponibilidade**:
   - Executa `hasReservationConflict` para o flat de destino no intervalo `[newCheckinDate, newCheckoutDate)`.
   - Se o flat de destino for o mesmo da reserva atual, passa `excludeReservationId = r.id` (pois a estadia atual será substituída pela nova após a liquidação).
   - Se o flat de destino for diferente, **NÃO** exclui a reserva atual no novo flat (o novo flat deve estar 100% livre).
   - Se houver conflito: `409 Conflict` com `{ error: "FLAT_UNAVAILABLE", message: "..." }`.
4. **Cálculo Financeiro e Política das 24 Horas**:
   - Calcula `oldNights`, `newNights` e `dailyRate`.
   - Se `newNights > oldNights`: calcula `extraNights = newNights - oldNights` e `additionalAmountToPay = extraNights * dailyRate`.
   - Se `additionalAmountToPay <= 0`: retorna `{ success: true, requiresPayment: false, additionalAmountToPay: 0, message: "Esta alteração não possui custo adicional e pode ser confirmada diretamente." }`.
5. **Geração de Cobrança PIX**:
   - Gera `pendingId = "mod_" + Date.now() + "_" + crypto.randomBytes(3).toString("hex")`.
   - Tenta criar cobrança oficial via `createInterPixCob`.
   - Se falhar ou estiver em ambiente sem credenciais Inter: gera PIX estático EMV via `generateStaticPixPayload` com TxId sanitizado.
   - Gera imagem do QR Code em Base64 via `await QRCode.toDataURL(pixCopiaECola)`.
6. **Geração de Preferência Mercado Pago**:
   - Tenta gerar preferência no Mercado Pago via `createMercadoPagoPreference` com `reservationCode = "MOD-" + r.code`.
   - Armazena `mpPreferenceId` e `mpCheckoutUrl` (`initPoint`).
7. **Criação do Bloqueio Atômico**:
   - Preenche `r.pendingModification` com status `"pending"` e `expiresAt = now + 30 min`.
   - Salva o banco de dados via `saveDatabase("modify_checkout_hold")`.
8. **Resposta (Output)**:
   - Retorna HTTP 200 com os dados de pagamento e hold.

### 5.4 Resposta de Sucesso (200 OK)
```json
{
  "success": true,
  "pendingId": "mod_1728651234_a1b2c3",
  "additionalAmountToPay": 320.00,
  "expiresAt": "2026-10-11T13:30:00.000Z",
  "holdMinutes": 30,
  "pixQrCodeUrl": "data:image/png;base64,iVBORw0KGgo...",
  "pixCopiaECola": "00020126580014br.gov.bcb.pix0114479648130001655204000053039865406320.005802BR5914CORPFLATS LTDA6015CAMPOS62270523MODRES31303013206304E8A1",
  "pixTxId": "MODRES3130301320",
  "mpCheckoutUrl": "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref_123456",
  "mpPreferenceId": "pref_123456",
  "newDates": {
    "checkinDate": "2026-10-15",
    "checkoutDate": "2026-10-20"
  },
  "newFlatNumber": "114",
  "newGuestCount": 2
}
```

---

## 6. Blueprint de Implementação (Código Verbatim para o Worker)

Abaixo está o código drop-in exato para inclusão em `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`.

### 6.1 Funções Utilitárias de Hold e Conflito (Inserir antes de `POST /api/pms/guest-portal/:code/modify`, aprox. linha 15.455)

```javascript
// ── Helper: Verifica se um hold provisório está ativo ─────────────────────────
export function isPendingHoldActive(pending, nowMs = Date.now()) {
  if (!pending) return false;
  if (pending.status !== "pending" && pending.status !== "pending_payment") return false;
  if (!pending.expiresAt) return false;
  const expMs = new Date(pending.expiresAt).getTime();
  if (isNaN(expMs) || expMs <= nowMs) {
    return false;
  }
  return true;
}

// ── Helper: Expira hold provisório se o tempo de 30 minutos tiver passado ─────
export function expirePendingHoldIfNeeded(r, nowMs = Date.now()) {
  if (r && r.pendingModification && (r.pendingModification.status === "pending" || r.pendingModification.status === "pending_payment")) {
    const expMs = new Date(r.pendingModification.expiresAt).getTime();
    if (!isNaN(expMs) && expMs <= nowMs) {
      r.pendingModification.status = "expired";
      r.pendingModification.expiredAt = new Date(nowMs).toISOString();
      return true;
    }
  }
  return false;
}

// ── Helper: Verificador Canônico de Conflitos no PMS (Reservas, Holds e RoomBlocks) ──
export function hasReservationConflict({
  flatId,
  flatNumber,
  checkinDate,
  checkoutDate,
  excludeReservationId = null,
  excludePendingHoldReservationId = null,
  nowMs = Date.now()
}) {
  const targetFlatIdStr = flatId != null ? String(flatId) : null;
  const targetFlatNumberStr = flatNumber != null ? String(flatNumber) : null;

  // 1. Checa contra reservas ativas no PMS
  const conflictWithReservation = (db.reservations || []).some(other => {
    if (excludeReservationId && (other.id === excludeReservationId || other.code === excludeReservationId)) {
      return false;
    }
    if (other.status === "cancelada" || other.status === "CANCELLED" || other.status === "expirada") {
      return false;
    }
    // Expira pré-reservas vencidas
    if ((other.status === "pre_reserva" || other.status === "pendente") && other.expiresAt) {
      if (new Date(other.expiresAt).getTime() < nowMs && other.paymentStatus !== "pago_total") {
        other.status = "expirada";
        return false;
      }
    }

    const otherFlatIdStr = other.flatId != null ? String(other.flatId) : null;
    const otherFlatNumberStr = other.flatNumber != null ? String(other.flatNumber) : null;
    const matchesFlat =
      (targetFlatNumberStr && (targetFlatNumberStr === otherFlatNumberStr || targetFlatNumberStr === otherFlatIdStr)) ||
      (targetFlatIdStr && (targetFlatIdStr === otherFlatIdStr || targetFlatIdStr === otherFlatNumberStr));

    if (!matchesFlat) return false;

    return checkinDate < other.checkoutDate && checkoutDate > other.checkinDate;
  });

  if (conflictWithReservation) return true;

  // 2. Checa contra holds provisórios (r.pendingModification)
  const conflictWithPendingHold = (db.reservations || []).some(other => {
    if (excludePendingHoldReservationId && (other.id === excludePendingHoldReservationId || other.code === excludePendingHoldReservationId)) {
      return false;
    }
    const pending = other.pendingModification;
    if (!pending) return false;
    if (pending.status !== "pending" && pending.status !== "pending_payment") return false;

    // Se o hold expirou, atualiza status para expired e não bloqueia
    if (pending.expiresAt && new Date(pending.expiresAt).getTime() < nowMs) {
      pending.status = "expired";
      pending.expiredAt = new Date(nowMs).toISOString();
      return false;
    }

    const pHoldIn = pending.newCheckinDate || pending.proposedCheckinDate;
    const pHoldOut = pending.newCheckoutDate || pending.proposedCheckoutDate;
    const pHoldFlatId = pending.newFlatId != null ? String(pending.newFlatId) : null;
    const pHoldFlatNum = pending.newFlatNumber != null ? String(pending.newFlatNumber) : (pHoldFlatId || String(other.flatNumber));

    const matchesFlat =
      (targetFlatNumberStr && (targetFlatNumberStr === pHoldFlatNum || targetFlatNumberStr === pHoldFlatId)) ||
      (targetFlatIdStr && (targetFlatIdStr === pHoldFlatId || targetFlatIdStr === pHoldFlatNum));

    if (!matchesFlat) return false;

    return checkinDate < pHoldOut && checkoutDate > pHoldIn;
  });

  if (conflictWithPendingHold) return true;

  // 3. Checa contra bloqueios de manutenção (db.roomBlocks)
  const conflictWithRoomBlock = (db.roomBlocks || []).some(b => {
    const bFlatId = b.flatId != null ? String(b.flatId) : null;
    const bFlatNum = b.flatNumber != null ? String(b.flatNumber) : null;
    const matchesFlat =
      (targetFlatNumberStr && (targetFlatNumberStr === bFlatNum || targetFlatNumberStr === bFlatId)) ||
      (targetFlatIdStr && (targetFlatIdStr === bFlatId || targetFlatIdStr === bFlatNum));

    if (!matchesFlat) return false;

    return checkinDate < b.endDate && checkoutDate > b.startDate;
  });

  if (conflictWithRoomBlock) return true;

  return false;
}
```

### 6.2 Endpoint `POST /api/pms/guest-portal/:code/modify-checkout`

```javascript
// ── POST /api/pms/guest-portal/:code/modify-checkout (Etapa 2 - Hold & Pagamento) ──
app.post("/api/pms/guest-portal/:code/modify-checkout", async (req, res) => {
  try {
    const code = (req.params.code || "").trim();
    if (!db.reservations) db.reservations = [];
    const r = findReservationByLocatorOrContact(code) || (db.reservations || []).find(x => x.code === code || String(x.id) === code);
    if (!r) {
      return res.status(404).json({ error: "Reserva não encontrada." });
    }

    if (r.status === "cancelada" || r.status === "CANCELLED" || r.status === "expirada") {
      return res.status(400).json({ error: "Esta reserva está cancelada e não pode ser modificada." });
    }

    const directChannels = ["whatsapp", "site", "site_direto", "direto", "balcao"];
    const channel = (r.channel || "").toLowerCase();
    if (!directChannels.includes(channel)) {
      return res.status(403).json({
        error: `Modificação pelo portal não permitida para reservas do canal ${r.channel || "externo"}. Por favor, solicite a alteração diretamente pela plataforma de origem.`
      });
    }

    const {
      newCheckinDate,
      newCheckoutDate,
      newGuestCount,
      newFlatId,
      newFlatNumber,
      reason,
      paymentMethod = "pix"
    } = req.body || {};

    if (!newCheckinDate || !newCheckoutDate) {
      return res.status(400).json({ error: "Datas de check-in e check-out são obrigatórias." });
    }

    if (newCheckoutDate <= newCheckinDate) {
      return res.status(400).json({ error: "A data de check-out deve ser posterior à data de check-in." });
    }

    // 1. Resolução do Flat de Destino
    let targetFlatId = r.flatId;
    let targetFlatNumber = String(r.flatNumber || r.flatId);

    if (newFlatId != null || newFlatNumber != null) {
      const foundFlat = (db.flats || []).find(f =>
        (newFlatId != null && String(f.id) === String(newFlatId)) ||
        (newFlatNumber != null && String(f.number) === String(newFlatNumber))
      );
      if (foundFlat) {
        targetFlatId = foundFlat.id;
        targetFlatNumber = String(foundFlat.number);
      } else if (newFlatNumber != null) {
        targetFlatNumber = String(newFlatNumber);
      }
    }

    const guestsNum = Math.max(1, Math.min(6, Number(newGuestCount) || r.guestCount || 1));

    // 2. Verificação de Conflitos (Pre-flight Concurrency Check)
    const isSameFlat = targetFlatNumber === String(r.flatNumber || r.flatId);
    const hasConflict = hasReservationConflict({
      flatId: targetFlatId,
      flatNumber: targetFlatNumber,
      checkinDate: newCheckinDate,
      checkoutDate: newCheckoutDate,
      excludeReservationId: isSameFlat ? r.id : null,
      excludePendingHoldReservationId: r.id
    });

    if (hasConflict) {
      return res.status(409).json({
        error: "FLAT_UNAVAILABLE",
        message: `O Flat ${targetFlatNumber} não possui disponibilidade para o período solicitado (${newCheckinDate} a ${newCheckoutDate}). Por favor, selecione outras datas ou entre em contato com nossa administração.`
      });
    }

    // 3. Cálculo Financeiro e Política 24h
    const parseDate = (dStr) => new Date(dStr + "T00:00:00Z");
    const oldNights = Math.max(1, Math.round((parseDate(r.checkoutDate) - parseDate(r.checkinDate)) / 86400000));
    const newNights = Math.max(1, Math.round((parseDate(newCheckoutDate) - parseDate(newCheckinDate)) / 86400000));
    const dailyRate = Number(r.dailyRate) || (oldNights > 0 ? (Number(r.totalAmount || 0) / oldNights) : 160);

    const originalCheckin = new Date(r.checkinDate + "T14:00:00-03:00");
    const cutoff24h = new Date(originalCheckin.getTime() - 24 * 3600 * 1000);
    const now = new Date();
    const isUnder24h = now.getTime() >= cutoff24h.getTime();

    let additionalAmountToPay = 0;
    let refundAmount = 0;
    let nonRefundableReduction = false;

    if (newNights > oldNights) {
      const extraNights = newNights - oldNights;
      additionalAmountToPay = extraNights * dailyRate;
    } else if (newNights < oldNights) {
      const reducedNights = oldNights - newNights;
      const val = reducedNights * dailyRate;
      if (isUnder24h) {
        nonRefundableReduction = true;
      } else {
        refundAmount = val;
      }
    }

    // Se não há acréscimo de valor, o pagamento não é necessário
    if (additionalAmountToPay <= 0) {
      return res.json({
        success: true,
        requiresPayment: false,
        additionalAmountToPay: 0,
        refundAmount,
        message: "Esta alteração não requer pagamento adicional e pode ser confirmada diretamente.",
        newDates: {
          checkinDate: newCheckinDate,
          checkoutDate: newCheckoutDate
        },
        newFlatNumber: targetFlatNumber,
        newGuestCount: guestsNum
      });
    }

    // 4. Parâmetros de Hold (30 minutos)
    const holdMinutes = 30;
    const expiresAt = new Date(now.getTime() + holdMinutes * 60 * 1000).toISOString();
    const pendingId = `mod_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

    // 5. Geração de Cobrança PIX (Inter Dinâmico com Fallback Estático)
    let pixTxId = null;
    let pixCopiaECola = null;

    try {
      const pixResult = await createInterPixCob({
        amount: additionalAmountToPay,
        description: `Modificacao Reserva ${r.code}`,
        debtorName: r.guestName,
        debtorDocument: r.guestDocument || r.document,
        reservationCode: r.code
      });
      pixTxId = pixResult.txid;
      pixCopiaECola = pixResult.pixCopiaECola;
    } catch (pixErr) {
      console.warn("[modify-checkout] Falha ao criar Pix Inter oficial, gerando Pix estático:", pixErr.message);
      const cleanTxId = `MOD${r.code.replace(/[^a-zA-Z0-9]/g, "")}${pendingId.replace(/[^a-zA-Z0-9]/g, "")}`.substring(0, 25);
      pixTxId = cleanTxId;
      pixCopiaECola = generateStaticPixPayload({
        pixKey: db.settings?.interConfig?.pixKey || DEFAULT_INTER_CONFIG?.pixKey || "47964813000165",
        amount: additionalAmountToPay,
        merchantName: "CORPFLATS LTDA",
        merchantCity: "CAMPOS DOS GOYTACAZES",
        txid: cleanTxId
      });
    }

    let qrCodeBase64 = "";
    try {
      qrCodeBase64 = await QRCode.toDataURL(pixCopiaECola);
    } catch (qrErr) {
      console.error("[modify-checkout] Erro ao gerar QRCode:", qrErr);
    }

    // 6. Geração de Preferência Mercado Pago (Checkout Pro)
    let mpPreferenceId = null;
    let mpCheckoutUrl = null;

    try {
      const mpPreference = await createMercadoPagoPreference({
        reservationCode: `MOD-${r.code}`,
        amount: additionalAmountToPay,
        guestName: r.guestName,
        guestEmail: r.guestEmail,
        nights: Math.max(1, newNights - oldNights),
        flatNumber: targetFlatNumber
      });
      if (mpPreference) {
        mpPreferenceId = mpPreference.id;
        mpCheckoutUrl = mpPreference.initPoint;
      }
    } catch (mpErr) {
      console.warn("[modify-checkout] Aviso ao criar preferência Mercado Pago:", mpErr.message);
    }

    // 7. Registro do Bloqueio Provisório em r.pendingModification
    r.pendingModification = {
      pendingId,
      newCheckinDate,
      newCheckoutDate,
      newGuestCount: guestsNum,
      newFlatId: targetFlatId,
      newFlatNumber: targetFlatNumber,
      additionalAmountToPay,
      createdAt: now.toISOString(),
      expiresAt,
      status: "pending",
      paymentMethod: paymentMethod === "credit_card" ? "credit_card" : "pix",
      pixTxId,
      pixQrCodeUrl: qrCodeBase64,
      pixCopiaECola,
      mpPreferenceId,
      mpCheckoutUrl,
      reason: reason || "Modificação solicitada pelo hóspede via autoatendimento",
      oldCheckinDate: r.checkinDate,
      oldCheckoutDate: r.checkoutDate,
      oldFlatNumber: String(r.flatNumber || r.flatId),
      oldFlatId: r.flatId,
      oldTotalAmount: Number(r.totalAmount || 0),
      oldNights,
      newNights,
      extraNights: newNights - oldNights,
      dailyRate,
      refundAmount: 0,
      isUnder24h,
      nonRefundableReduction: false
    };

    saveDatabase("modify_checkout_hold");

    // 8. Resposta ao Hóspede
    res.json({
      success: true,
      pendingId,
      additionalAmountToPay,
      expiresAt,
      holdMinutes,
      pixQrCodeUrl: qrCodeBase64,
      pixCopiaECola,
      pixTxId,
      mpCheckoutUrl,
      mpPreferenceId,
      newDates: {
        checkinDate: newCheckinDate,
        checkoutDate: newCheckoutDate
      },
      newFlatNumber: targetFlatNumber,
      newGuestCount: guestsNum
    });
  } catch (err) {
    console.error("[modify-checkout] Erro inesperado:", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});
```

### 6.3 Adaptação dos Endpoints de Disponibilidade Existentes

#### A. Em `GET /api/reservations/availability` (linhas 11.183–11.187)
Substituir o filtro de `occupiedFlatIds` por:
```javascript
    // Verifica flats ocupados no período (reservas ativas e holds provisórios)
    const nowMs = Date.now();
    const occupiedFlatIds = new Set();

    (db.reservations || []).forEach(r => {
      if (r.status === "cancelada" || r.status === "CANCELLED" || r.status === "expirada") return;
      if ((r.status === "pre_reserva" || r.status === "pendente") && r.expiresAt && new Date(r.expiresAt).getTime() < nowMs && r.paymentStatus !== "pago_total") {
        r.status = "expirada";
        r.updatedAt = new Date().toISOString();
        return;
      }
      // Ocupação da reserva principal
      if (r.checkinDate < checkout && r.checkoutDate > checkin) {
        if (r.flatNumber != null) occupiedFlatIds.add(String(r.flatNumber));
        if (r.flatId != null) occupiedFlatIds.add(String(r.flatId));
      }
      // Ocupação por hold provisório de modificação
      if (r.pendingModification && (r.pendingModification.status === "pending" || r.pendingModification.status === "pending_payment")) {
        if (r.pendingModification.expiresAt && new Date(r.pendingModification.expiresAt).getTime() < nowMs) {
          r.pendingModification.status = "expired";
          r.pendingModification.expiredAt = new Date(nowMs).toISOString();
        } else {
          const pHoldIn = r.pendingModification.newCheckinDate || r.pendingModification.proposedCheckinDate;
          const pHoldOut = r.pendingModification.newCheckoutDate || r.pendingModification.proposedCheckoutDate;
          const pHoldFlat = String(r.pendingModification.newFlatNumber || r.pendingModification.newFlatId || r.flatNumber);
          if (pHoldIn && pHoldOut && pHoldIn < checkout && pHoldOut > checkin) {
            occupiedFlatIds.add(pHoldFlat);
          }
        }
      }
    });
```

#### B. Em `GET /api/bot-actions/availability` (linhas 20.755–20.765)
Acrescentar após a verificação de `r.checkinDate < outDate && r.checkoutDate > inDate`:
```javascript
      // Hold provisório de modificação
      if (r.pendingModification && (r.pendingModification.status === "pending" || r.pendingModification.status === "pending_payment")) {
        if (r.pendingModification.expiresAt && new Date(r.pendingModification.expiresAt).getTime() < nowMs) {
          r.pendingModification.status = "expired";
          r.pendingModification.expiredAt = new Date(nowMs).toISOString();
        } else {
          const pHoldIn = r.pendingModification.newCheckinDate || r.pendingModification.proposedCheckinDate;
          const pHoldOut = r.pendingModification.newCheckoutDate || r.pendingModification.proposedCheckoutDate;
          const pHoldFlatNum = r.pendingModification.newFlatNumber || r.pendingModification.proposedFlatNumber;
          const pHoldFlatId = r.pendingModification.newFlatId || r.pendingModification.proposedFlatId;
          if (pHoldIn && pHoldOut && pHoldIn < outDate && pHoldOut > inDate) {
            if (pHoldFlatId != null) busyFlatSet.add(String(pHoldFlatId));
            if (pHoldFlatNum != null) busyFlatSet.add(String(pHoldFlatNum));
          }
        }
      }
```

---

## 7. Estratégia de Testes Automatizados para o Worker

Para garantir que a implementação seja validada com 100% de precisão antes de qualquer commit, a suíte de testes deve cobrir:

1. **Paridade Byte-a-Byte**:
   `assert.strictEqual(fs.readFileSync('scripts/demo-server.mjs').equals(fs.readFileSync('artifacts/api-server/demo-server.mjs')), true)`.
2. **Criação de Hold Provisório com Datas Originais Inalteradas**:
   - Criar reserva teste `RES-HOLD-001` (Apt 113, 2026-11-01 a 2026-11-03, Total R$ 320,00).
   - Postar em `/modify-checkout` solicitando extensão para 2026-11-05 (+2 diárias = +R$ 320,00).
   - Validar retorno HTTP 200 com `pendingId`, `pixCopiaECola`, `pixQrCodeUrl`, `expiresAt` (now + 30 min).
   - Inspecionar a reserva no banco:
     - `r.checkinDate === "2026-11-01"` (inalterado)
     - `r.checkoutDate === "2026-11-03"` (inalterado)
     - `r.totalAmount === 320` (inalterado)
     - `r.pendingModification.status === "pending"`
     - `r.pendingModification.additionalAmountToPay === 320`.
3. **Bloqueio de Conflito de Calendário por Hold Ativo**:
   - Outra reserva tenta pré-reservar ou modificar para o Apt 113 no período 2026-11-03 a 2026-11-05.
   - O sistema detecta o hold ativo e retorna HTTP 409 Conflict.
4. **Auto-Expiração do Hold de 30 Minutos**:
   - Simular avanço temporal modificando `r.pendingModification.expiresAt` para 1 minuto no passado.
   - Chamar a verificação de disponibilidade ou `/modify-status`.
   - Validar que o hold é marcado como `"expired"` e o calendário do Apt 113 é imediatamente liberado para novas reservas, mantendo as datas originais 2026-11-01 a 2026-11-03 perfeitamente intactas.

---

## 8. Conclusão

Esta especificação resolve integralmente o núcleo do Milestone 1 no tocante ao endpoint de checkout e blindagem de calendário. Ela impede que o hóspede obtenha extensão de reserva sem liquidação prévia, fornece ambos os meios de pagamento (PIX oficial Inter + estático com QR Code Base64 e Mercado Pago), protege o calendário contra double-booking durante os 30 minutos de checkout e garante que desistências ou expirações não afetem as datas originais da reserva.

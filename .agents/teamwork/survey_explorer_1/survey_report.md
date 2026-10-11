# Relatório de Investigação Técnica: Arquitetura de Backend, Modelos de Reserva e Mecanismos de Modificação em 2 Etapas

**Agente**: Survey Explorer 1  
**Data**: 2026-10-11  
**Projeto**: CorpFlats (Guest-Flow-Manager)  
**Escopo**: Backend PMS, scripts/demo-server.mjs, artifacts/api-server/demo-server.mjs, fluxos de pagamento (PIX & Mercado Pago), persistência em data/database.json, validação de disponibilidade e fluxo de alteração de reservas com trava de pagamento e re-assinatura.

---

## 1. Sumário Executivo

A investigação detalhada do código-fonte do backend revelou que o sistema CorpFlats opera atualmente com um servidor Express monolítico de 30.757 linhas mantido sob uma regra estrita de **Paridade Byte-a-Byte (Twin-Server Parity Mandate)** entre `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs` (verificado via SHA256: arquivos idênticos).

Atualmente, o portal do hóspede possui apenas o endpoint legado `POST /api/pms/guest-portal/:code/modify` (linhas 15.456 a 15.716). Este endpoint apresenta uma **vulnerabilidade crítica de integridade financeira**:
1. Quando uma reserva é estendida com acréscimo de diárias (`additionalAmountToPay > 0`), o backend **muta imediatamente as datas no banco de dados** (`r.checkinDate` e `r.checkoutDate`) e salva no `data/database.json`, deixando apenas uma nota de aviso ao hóspede de que "o valor poderá ser pago via PIX ou com a administração".
2. Não existe um endpoint de simulação formal (`/modify-preview`) que consulte a disponibilidade em tempo real antes de submeter alterações.
3. Não há bloqueio provisório (hold) nem integração de checkout no momento da alteração: se o hóspede fechar a janela ou abandonar o pagamento, a reserva já teve suas datas alteradas sem liquidação prévia.
4. Ao alterar datas ou trocar de apartamento, a assinatura do check-in digital anterior e os status de pré-check-in **não são invalidados** no portal do hóspede, violando o requisito de re-assinatura obrigatória com dados atualizados da hospedagem.

Este relatório documenta a arquitetura existente, diagnostica todas as lacunas técnicas e especifica formalmente a solução completa para o fluxo seguro em duas etapas com pré-visualização, hold provisório de 30 minutos, liquidação via PIX ou Mercado Pago antes do commit, invalidação de assinatura e sincronização em tempo real dos painéis da recepção e garagem.

---

## 2. Arquitetura do Backend e Persistência de Dados

### 2.1 Estrutura e Ciclo de Vida
- **Servidor**: Node.js v20+ / Express (`const app = express()`, linha 258).
- **Paridade Obrigatória**: Qualquer alteração em `scripts/demo-server.mjs` deve ser espelhada de forma idêntica em `artifacts/api-server/demo-server.mjs`.
- **Estado em Memória**: Objeto global `db` carregado na inicialização a partir de `data/database.json` (`DB_FILE`, linha 607). Se uma conexão com PostgreSQL (`pgPool`) estiver ativa, o estado é sincronizado com a tabela `system_store` (`key = 'db_state'`).
- **Gravação Atômica em Disco**:
  - Implementada na função `atomicWriteFileSync(filePath, content)` (linhas 5549–5568).
  - Cria um arquivo temporário com prefixo `.tmp_...`, grava e executa `fs.renameSync()`. Em caso de bloqueio temporário (antivírus no Windows), utiliza fallback com `copyFileSync` e `unlinkSync`.
  - Função central `saveDatabase(reason)` (linhas 5570–5612):
    1. Executa reconciliação de limpezas (`reconcileCleaningRequests()`).
    2. Executa expurgo/poda controlada (`pruneDatabase()`).
    3. Serializa `JSON.stringify(db)` e grava atomicamente via `atomicWriteFileSync(DB_FILE, stateJson)`.
    4. Se houver `pgPool`, atualiza `system_store` e insere snapshot em `system_store_backups`.
- **Trilha de Auditoria**:
  - `logAuditEvent(payload)` grava em `db.auditLogs` e no arquivo append-only `audit_logs.jsonl` (linhas 5614–5640).
  - Cada reserva possui seu próprio array `r.auditLogs` manipulado via `addReservationAuditLog(r, entry)`.
  - Histórico de modificações: `r.modificationHistory` registra os parâmetros anteriores e novos (`oldCheckin`, `newCheckin`, `oldCheckout`, `newCheckout`, `oldNights`, `newNights`, `additionalAmountToPay`, `refundAmount`, `reason`, `modifiedAt`).
  - Sincronização iCal (RFC 5545 / RFC 5546): Campo `r.calendarSequence` incrementado a cada alteração de datas ou status.

### 2.2 Modelo de Dados de Reserva (`r` em `db.reservations`)
O modelo possui 69 propriedades ativas mapeadas em produção:
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `number` | Identificador sequencial inteiro no PMS |
| `code` | `string` | Localizador alfanumérico único (ex: `"RES-313-0301"`, `"CF-829104"`) |
| `flatId` | `number` | ID do flat na coleção `db.flats` |
| `flatNumber` | `string` | Número visível do flat (ex: `"113"`, `"313"`) |
| `guestName` | `string` | Nome completo do hóspede titular |
| `guestPhone` | `string` | Telefone com DDD limpo (ex: `"5522998765432"`) |
| `guestEmail` | `string` | E-mail do hóspede para comunicações |
| `guestDocument` | `string` | CPF ou documento do hóspede |
| `guestCount` / `adults` | `number` | Número de ocupantes autorizados |
| `checkinDate` | `string` | Data de entrada no formato `YYYY-MM-DD` |
| `checkoutDate` | `string` | Data de saída no formato `YYYY-MM-DD` |
| `checkinTime` | `string` | Horário oficial de check-in (`"14:00"`) |
| `checkoutTime` | `string` | Horário oficial de check-out (`"12:00"`) |
| `status` | `string` | `"confirmada"`, `"pre_reserva"`, `"in_house"`, `"completed"`, `"cancelada"`, `"expirada"` |
| `paymentStatus` | `string` | `"pago_total"`, `"sinal_pago"`, `"aguardando_pix"`, `"pendente"`, `"parcial"` |
| `channel` | `string` | Canal de aquisição (`"site"`, `"whatsapp"`, `"direto"`, `"booking"`, `"airbnb"`) |
| `totalAmount` | `number` | Valor bruto total da estadia (R$) |
| `paidAmount` | `number` | Valor financeiro já liquidado (R$) |
| `dailyRate` | `number` | Valor da diária padrão contratada |
| `dailyRates` | `array` | Detalhamento diário de tarifas (se aplicável) |
| `payments` | `array` | Lista de pagamentos recebidos `[{ id, amount, method, date, notes }]` |
| `paymentMethod` | `string` | Método principal (`"pix"`, `"cartao_credito"`, `"booking"`, `"dinheiro"`) |
| `pixTxId` | `string` | Identificador de transação PIX (Inter ou estático) |
| `pixCopiaECola` | `string` | Linha digitável EMV BR Code |
| `pixEndToEndId` | `string` | Identificador E2E oficial do Banco Central |
| `mpPaymentId` | `string` | ID de pagamento aprovado no Mercado Pago |
| `mpPreferenceId` | `string` | ID da preferência de checkout no Mercado Pago |
| `mpInitPoint` | `string` | URL do Checkout Pro do Mercado Pago |
| `fnhrCompleted` | `boolean` | Indica se a FNRH/Check-in digital foi preenchida |
| `preCheckinCompleted` | `boolean` | Flag agregada de conclusão do pré-check-in |
| `signatureUrl` | `string` | Imagem da assinatura digital em Base64 ou URL de storage |
| `needsReSignature` | `boolean` | **Flag mestra de invalidação**: indica que é necessária nova assinatura |
| `reSignatureReason` | `string` | Motivo legal/operacional da necessidade de re-assinatura |
| `fnrhPdfUrl` / `fnrhSha256Hash` | `string` | PDF gerado e hash de integridade forense |
| `guests` | `array` | Slots de hóspedes adicionais `[{ index, name, cpf, signatureUrl, hasCompletedCheckin, needsReSignature }]` |
| `vehicle` | `object` | `{ plate, brand, model, color, updatedAt, garageNotifiedAt }` |
| `modificationHistory` | `array` | Histórico cronológico de modificações |
| `auditLogs` | `array` | Registros de auditoria interna da reserva |
| `calendarSequence` | `number` | Contador sequencial para clientes iCal (RFC 5546) |
| `expiresAt` | `string` | Timestamp ISO de expiração (para pré-reservas ou holds) |

---

## 3. Algoritmos de Disponibilidade e Conflito de Calendário

### 3.1 Princípio de Sobreposição Hoteleira
No modelo de hospedagem, a diária se inicia às 14:00 do `checkinDate` e encerra às 12:00 do `checkoutDate`.
Assim, duas estadias `[checkinA, checkoutA)` e `[checkinB, checkoutB)` colidem **se e somente se**:
$$\text{checkinA} < \text{checkoutB} \quad \land \quad \text{checkoutA} > \text{checkinB}$$
Se a Reserva A sai no dia 15 (`checkoutDate = 2026-10-15`) e a Reserva B entra no dia 15 (`checkinDate = 2026-10-15`), não há conflito ($15 < 15$ é falso).

### 3.2 Implementações Existentes no Backend
1. **Consulta Geral (`GET /api/reservations/availability`, linha 11.168)**:
   - Filtra reservas onde `r.status !== "cancelada" && r.checkinDate < checkout && r.checkoutDate > checkin`.
   - Exclui flats com `status === "manutencao_bloqueada"`.
   - Mapeia flats disponíveis e capacidade de camas de solteiro (`twinAllowedFlats`).
2. **Bot Actions API (`GET /api/bot-actions/availability`, linha 20.717)**:
   - Limpa previamente pré-reservas vencidas (`new Date(r.expiresAt).getTime() < nowMs && r.paymentStatus !== "pago_total"`).
   - Mapeia conflitos em reservas ativas e room blocks de manutenção em `db.roomBlocks`.
3. **Pré-Reserva com Hold Provisório (`POST /api/bot-actions/pre-reserve`, linha 20.974)**:
   - Aplica hold de 30 minutos (`expiresAt = now + 30 min`).
   - Verifica conflitos síncronos antes de registrar.
4. **Modificação Legada (`POST /api/pms/guest-portal/:code/modify`, linha 15.488)**:
   - Verifica sobreposição apenas no mesmo flat:
   ```javascript
   const hasConflict = (db.reservations || []).some(other => {
     if (other.id === r.id || other.code === r.code) return false;
     if (other.status === "cancelada" || other.status === "CANCELLED") return false;
     const otherFlat = String(other.flatNumber || other.flatId);
     if (otherFlat !== flatNumberStr) return false;
     return (newCheckinDate < other.checkoutDate) && (newCheckoutDate > other.checkinDate);
   });
   ```
   - **Lacuna**: Não suporta consulta em outro apartamento caso o hóspede deseje ou precise trocar de flat, e não verifica room blocks de manutenção (`db.roomBlocks`).

---

## 4. Fluxos de Pagamento e Liquidação

### 4.1 PIX Dinâmico (Banco Inter mTLS Cobrança Imediata)
- **Função**: `createInterPixCob({ amount, description, debtorName, debtorDocument, reservationCode })` (linhas 27.704–27.776).
- **Mecanismo**: Conexão mTLS com certificados `cert` e `key` do Banco Inter na URL `https://cdpj.partners.bancointer.com.br/pix/v2/cob/${txid}`.
- **Retorno**: `{ txid, pixCopiaECola, location, status, valor, createdAt }`.
- **Verificação Ativa**: `checkInterPixCobStatus(txid)` (linhas 27.850–27.880) consulta o status da cobrança no Banco Inter (`CONCLUIDA`).

### 4.2 PIX Estático (Fallback Autônomo com QR Code)
- **Função**: `generateStaticPixPayload({ pixKey, amount, merchantName, merchantCity, txid })` (linhas 11.283–11.307).
- **Mecanismo**: Gera string EMV BR Code (Padrão Banco Central do Brasil) com cálculo de CRC16.
  - Chave Padrão: CNPJ `47964813000165` (`CORPFLATS LTDA`).
  - Cidade: `CAMPOS DOS GOYTACAZES`.
  - TxId: Normalizado e sanitizado (até 25 caracteres alfanuméricos).
- **QR Code Base64**: Gerado no servidor via biblioteca `QRCode.toDataURL(pixPayload)`.
- **Verificação Ativa**: `checkInterBankingExtratoPix(r)` (linhas 27.940–28.050) consulta o Extrato Bancário Completo do Inter (`/banking/v2/extrato/completo`) com cache de 10 segundos, buscando transações PIX recebidas que coincidam com o valor e dados da reserva.

### 4.3 Mercado Pago (Cartão de Crédito em até 12x)
- **Criação de Preferência**: `createMercadoPagoPreference(...)` (linhas 28.487–28.570).
  - Chamada a `https://api.mercadopago.com/checkout/preferences`.
  - Passa `external_reference: reservationCode` (ou código de modificação).
  - Configura `back_urls` para o portal do hóspede (`/minha-reserva/${code}?payment=success`).
  - Retorna `initPoint` (link de checkout web) e `preferenceId`.
- **Verificação de Pagamento**:
  1. **Webhook Ativo**: `POST /api/pms/mercadopago/webhook` (linhas 28.610–28.670) recebe notificações do tipo `payment`, busca os detalhes via API do Mercado Pago e valida se `status === "approved"`.
  2. **Consulta Ativa por Referência**: `checkMercadoPagoPaymentByRef(externalRef)` (linhas 27.893–27.927) realiza busca ativa em `https://api.mercadopago.com/v1/payments/search?external_reference=${externalRef}`.
- **Polling Unificado**: Endpoint `GET /api/pms/reservations/:code/payment-status` (linhas 28.229–28.343) verifica simultaneamente:
  - Se já possui evidência real em `hasRealPaymentEvidence(r)`.
  - Consulta cobrança Inter via `checkInterPixCobStatus(r.pixTxId)`.
  - Consulta extrato Inter via `checkInterBankingExtratoPix(r)`.
  - Consulta pagamentos Mercado Pago via `checkMercadoPagoPaymentByRef(r.code)`.

### 4.4 Registro Financeiro em `r.payments`
A função `confirmReservationPayment(r, details)` (linhas 28.157–28.225) estrutura os lançamentos:
```javascript
const payRecord = {
  id: `pay_${details.paymentMethod || 'pix'}_${Date.now()}`,
  amount: valorPago,
  method: details.paymentMethod || "pix",
  date: r.paidAt || new Date().toISOString(),
  notes: `Pagamento confirmado via ${source}${endToEndId ? ` (E2E: ${endToEndId})` : ""}`
};
```
Se já houver pagamentos parciais, o sistema soma o total pago:
- Se `sumPaid >= totalAmount`: `paymentStatus = "pago_total"`.
- Se `sumPaid > 0 && sumPaid < totalAmount`: `paymentStatus = "sinal_pago"`.
- Se a reserva era pré-reserva (`status === "pre_reserva"`): é promovida para `status = "confirmada"`.

---

## 5. Diagnóstico de Lacunas Técnicas no Fluxo de Modificação

### 5.1 O Que o Backend Faz Hoje vs. O Que Deve Fazer
| Aspecto | Comportamento Atual (`scripts/demo-server.mjs`) | Requisito Obrigatório (R1 a R4) |
|---|---|---|
| **Simulação prévia** | Inexistente no backend. O cliente calcula estimativa no browser e já posta direto em `/modify`. | Endpoint `/modify-preview` obrigatório com verificação no calendário e cálculo formal. |
| **Verificação de Conflitos** | Feita apenas dentro de `/modify` e só para o mesmo flat atual. Não checa bloqueios de manutenção (`roomBlocks`). | Verificação prévia no `/modify-preview`, suporte a troca de flat e validação contra `db.reservations` e `db.roomBlocks`. |
| **Pagamento de Acréscimo** | As datas são atualizadas **imediatamente no banco**, independentemente de pagamento. | **Datas NÃO são atualizadas**. É gerado um hold provisório de 30 minutos e meios de pagamento (PIX e Cartão). Commit só ocorre após liquidação. |
| **Fechamento do Modal / Abandono** | Como as datas já foram alteradas na requisição inicial, fechar a janela deixa a reserva adulterada sem pagamento. | Se o hóspede abandonar ou o hold expirar, a reserva original permanece 100% inalterada. |
| **Re-Assinatura da Ficha (FNRH)** | Ao alterar datas via portal, `r.fnhrCompleted` e `r.signatureUrl` continuam marcados como concluídos. O hóspede não re-assina. | `r.fnhrCompleted` e assinatura devem ser invalidados (`r.needsReSignature = true`). Portal exibe banner e link de re-assinatura. |
| **Comunicação de Re-Assinatura** | Dispara apenas `reservation_updated` padrão. Não direciona explicitamente para renovação da FNRH. | Dispara mensagem automática com o link personalizado de re-assinatura (`{{link_checkin_digital}}`). |
| **Entrega à Portaria** | Se alterado, apenas envia e-mail de atualização simples se for para hoje. | Ao re-assinar a FNRH atualizada, o novo PDF com trilha forense é gerado e despachado à recepção e garagem. |
| **Painéis em Tempo Real** | O painel de recepção e a folha de garagem leem os dados do banco, mas se a assinatura não foi invalidada, mostram status falso de concluído. | Atualização instantânea dos novos períodos, flats, placas e status de pendência de assinatura. |

### 5.2 Regra de Reembolso de 24 Horas
- **Ponto de Corte (Cutoff)**: 14:00 (horário de Brasília) do dia anterior à data de check-in original:
  $$\text{Cutoff24h} = \text{CheckinOriginal (14:00)} - 24\text{ horas}$$
- **Se `now >= Cutoff24h` (Menos de 24 horas)**:
  - Redução de diárias ou de hóspedes é estritamente **não reembolsável** (`nonRefundableReduction = true`, `refundEligible = 0`).
  - O valor total da reserva não sofre dedução, conforme Cláusula 5 do Contrato de Hospedagem.
- **Se `now < Cutoff24h` (Mais de 24 horas)**:
  - Redução gera estorno ou crédito elegível (`refundAmount = reducedNights * dailyRate`).
  - O valor total da reserva é reduzido proporcionalmente.

---

## 6. Arquitetura do Mecanismo em Duas Etapas com Pagamento Pendente

### 6.1 Diagrama de Estados do Fluxo

```
[ Hóspede seleciona novas datas / flat ]
                  │
                  ▼
   POST /modify-preview (Etapa 1)
                  │
      ┌───────────┴───────────┐
      │                       │
 Conflito / Erro         Disponível
      │                       │
      ▼                       ▼
Retorna 409 /        Apresenta resumo:
Exibe alerta         • Diárias e tarifas
                     • Política de 24h
                     • Valor a pagar ou estorno
                              │
             ┌────────────────┴────────────────┐
             │                                 │
   additionalAmount == 0             additionalAmount > 0
             │                                 │
             ▼                                 ▼
   POST /modify (Commit Direto)     POST /modify-checkout (Etapa 2)
             │                                 │
             │                      Cria hold `r.pendingModification`
             │                      Gera PIX e Mercado Pago
             │                                 │
             │                                 ▼
             │                      Hóspede realiza pagamento
             │                                 │
             │                      Polling: /modify-status
             │                                 │
             │                             [ Pago? ]
             │                       NÃO ◄────┴────► SIM
             │                        │               │
             │                   Hold expira /        │
             │                   cancela:             │
             │                   Reserva intacta      ▼
             │                                   Commit definitivo
             │                                        │
             └────────────────┬───────────────────────┘
                              │
                              ▼
           [ Efetivação das Novas Datas no PMS ]
           • Atualiza checkinDate / checkoutDate / flat
           • Registra pagamento em r.payments e totalAmount
           • Incrementa calendarSequence (iCal)
           • Registra em modificationHistory e auditLogs
           • Invalida assinatura: r.needsReSignature = true
           • Dispara WhatsApp com link de re-assinatura
           • Sincroniza Governança, Café, Recepção e Garagem
                              │
                              ▼
           [ Hóspede assina a nova Ficha Digital ]
           • Gera novo PDF FNRH com dados atualizados
           • Limpa r.needsReSignature = false
           • Envia PDF atualizado para recepção e garagem
```

### 6.2 Estrutura do Hold Provisório (`r.pendingModification`)
Para evitar duplicidade de registros e manter integridade relacional, o hold deve ser armazenado como um objeto anexo dentro da própria reserva existente:

```json
{
  "id": "mod_hold_819203",
  "token": "pm_98a7f1b2c3d4",
  "status": "pending_payment",
  "createdAt": "2026-10-11T13:00:00.000Z",
  "expiresAt": "2026-10-11T13:30:00.000Z",
  "proposedCheckinDate": "2026-10-15",
  "proposedCheckoutDate": "2026-10-20",
  "proposedFlatNumber": "114",
  "proposedFlatId": 2,
  "proposedGuestCount": 2,
  "oldCheckinDate": "2026-10-15",
  "oldCheckoutDate": "2026-10-18",
  "oldFlatNumber": "113",
  "oldTotalAmount": 480.00,
  "oldNights": 3,
  "newNights": 5,
  "extraNights": 2,
  "dailyRate": 160.00,
  "additionalAmountToPay": 320.00,
  "refundAmount": 0.00,
  "isUnder24h": false,
  "nonRefundableReduction": false,
  "reason": "Extensão de duas diárias a trabalho",
  "paymentMethod": "pix",
  "pixTxId": "MOD-RES313-0301-320",
  "pixCopiaECola": "00020126580014br.gov.bcb.pix0114479648130001655204000053039865406320.005802BR5914CORPFLATS LTDA6015CAMPOS62270523MODRES31303013206304E8A1",
  "qrCodeBase64": "data:image/png;base64,iVBORw0KGgo...",
  "mpPreferenceId": "pref_39201948",
  "mpInitPoint": "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref_39201948"
}
```

### 6.3 Blindagem do Calendário Durante o Hold
Nos algoritmos de disponibilidade (`GET /api/reservations/availability`, `GET /api/bot-actions/availability`, e no próprio `/modify-preview`), adiciona-se a regra de verificação:
```javascript
const nowMs = Date.now();
// Limpa holds vencidos automaticamente
if (r.pendingModification && r.pendingModification.status === "pending_payment") {
  if (new Date(r.pendingModification.expiresAt).getTime() < nowMs) {
    r.pendingModification.status = "expired";
    r.pendingModification.expiredAt = new Date().toISOString();
  } else {
    // Hold está ATIVO: bloqueia o flat proposto nas datas propostas
    const pFlat = String(r.pendingModification.proposedFlatNumber || r.pendingModification.proposedFlatId);
    const pIn = r.pendingModification.proposedCheckinDate;
    const pOut = r.pendingModification.proposedCheckoutDate;
    if (pFlat === targetFlatStr && (requestedCheckin < pOut && requestedCheckout > pIn)) {
      isBlockedByTentativeHold = true;
    }
  }
}
```

---

## 7. Especificação Formal dos Endpoints de API

### 7.1 `POST /api/pms/guest-portal/:code/modify-preview`
**Finalidade**: Etapa 1 — Simula a alteração, verifica disponibilidade e calcula custos/estornos sem alterar nenhum dado no banco.

- **Parâmetros de Rota**:
  - `code` (string, obrigatório): Localizador da reserva ou telefone/CPF do hóspede.
- **Corpo da Requisição (JSON)**:
  ```json
  {
    "newCheckinDate": "2026-10-15",
    "newCheckoutDate": "2026-10-20",
    "newGuestCount": 2,
    "newFlatNumber": "114",
    "reason": "Ajuste de agenda"
  }
  ```
- **Validações**:
  - Reserva deve existir e pertencer a canal direto (`whatsapp`, `site`, `site_direto`, `direto`, `balcao`).
  - Status não pode ser `cancelada`, `CANCELLED` ou `completed`.
  - `newCheckinDate` e `newCheckoutDate` no formato `YYYY-MM-DD`, com `newCheckoutDate > newCheckinDate`.
  - Validação de conflito no flat de destino (`newFlatNumber || r.flatNumber`) contra `db.reservations` ativas, holds ativos de outras reservas e `db.roomBlocks`.
- **Códigos de Resposta**:
  - `200 OK`: Período disponível com simulação detalhada.
  - `400 Bad Request`: Datas inválidas ou campos faltantes.
  - `403 Forbidden`: Canal externo (Booking/Airbnb) não permitido no autoatendimento.
  - `404 Not Found`: Reserva não encontrada.
  - `409 Conflict`: Flat ocupado ou em manutenção no período solicitado.
- **Exemplo de Resposta (200 OK)**:
  ```json
  {
    "available": true,
    "current": {
      "flatNumber": "113",
      "checkinDate": "2026-10-15",
      "checkoutDate": "2026-10-18",
      "nights": 3,
      "guestCount": 1,
      "totalAmount": 480.00
    },
    "simulation": {
      "flatNumber": "114",
      "checkinDate": "2026-10-15",
      "checkoutDate": "2026-10-20",
      "nights": 5,
      "guestCount": 2,
      "nightsDiff": 2,
      "dailyRate": 160.00,
      "additionalAmountToPay": 320.00,
      "refundAmount": 0.00,
      "newTotalAmount": 800.00,
      "isUnder24h": false,
      "nonRefundableReduction": false,
      "policyNotice": "Acréscimo de 2 diárias (+R$ 320,00).",
      "requiresPayment": true,
      "requiresReSignature": true
    }
  }
  ```

---

### 7.2 `POST /api/pms/guest-portal/:code/modify-checkout`
**Finalidade**: Etapa 2 — Inicia o checkout da modificação quando `additionalAmountToPay > 0`. Cria o hold provisório de 30 minutos e gera os dados de pagamento (PIX e Mercado Pago) sem alterar as datas da reserva.

- **Corpo da Requisição (JSON)**:
  ```json
  {
    "newCheckinDate": "2026-10-15",
    "newCheckoutDate": "2026-10-20",
    "newGuestCount": 2,
    "newFlatNumber": "114",
    "reason": "Ajuste de agenda",
    "paymentMethod": "pix"
  }
  ```
- **Ações Realizadas**:
  1. Revalida síncronamente a disponibilidade para evitar concorrência.
  2. Gera txId e payload PIX (Inter cobrança com fallback para estático).
  3. Gera QR Code base64.
  4. Gera preferência no Mercado Pago com `external_reference: "MOD-" + r.code`.
  5. Salva `r.pendingModification` com `status: "pending_payment"` e `expiresAt: now + 30 min`.
  6. Grava no banco (`saveDatabase("modify_hold_created")`).
- **Exemplo de Resposta (200 OK)**:
  ```json
  {
    "success": true,
    "holdToken": "pm_98a7f1b2c3d4",
    "expiresAt": "2026-10-11T13:30:00.000Z",
    "holdMinutes": 30,
    "additionalAmountToPay": 320.00,
    "pixCopiaECola": "000201...",
    "qrCodeBase64": "data:image/png;base64,...",
    "pixTxId": "MOD-RES313-0301-320",
    "mpInitPoint": "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=...",
    "mpPreferenceId": "..."
  }
  ```

---

### 7.3 `GET /api/pms/guest-portal/:code/modify-status`
**Finalidade**: Consulta em tempo real (polling a cada 3 a 5 segundos) para verificar se o pagamento do acréscimo foi liquidado.

- **Lógica de Verificação**:
  1. Se `r.pendingModification` não existir ou estiver expirada, retorna `status: "expired"`.
  2. Se já estiver `committed`, retorna `status: "committed"`.
  3. Realiza consulta ativa no Banco Inter (Cobrança e Extrato) e Mercado Pago para a referência da modificação.
  4. Se pagamento for confirmado:
     - Executa o commit definitivo da modificação.
     - Lança o pagamento em `r.payments`.
     - Invalida a assinatura (`r.needsReSignature = true`).
     - Dispara WhatsApp com o link de re-assinatura.
     - Atualiza status para `committed`.
- **Exemplo de Resposta (200 OK — Pago e Confirmado)**:
  ```json
  {
    "paid": true,
    "status": "committed",
    "message": "Pagamento confirmado! Sua estadia foi estendida com sucesso.",
    "newCheckinDate": "2026-10-15",
    "newCheckoutDate": "2026-10-20",
    "flatNumber": "114",
    "needsReSignature": true,
    "reSignatureUrl": "https://corpflats.onrender.com/pre-checkin/RES-313-0301"
  }
  ```

---

### 7.4 `POST /api/pms/guest-portal/:code/modify-cancel-pending`
**Finalidade**: Cancela manualmente o hold provisório caso o hóspede desista ou feche o modal de pagamento, liberando imediatamente o calendário.

- **Ações Realizadas**:
  - Altera `r.pendingModification.status = "cancelled"`.
  - Remove o hold ativo e salva o banco.

---

### 7.5 Atualização do Endpoint Legado `POST /api/pms/guest-portal/:code/modify`
**Finalidade**: Para modificações onde `additionalAmountToPay === 0` (ex: troca de datas com mesmo número de diárias, alteração de hóspedes sem custo, ou reduções com/sem estorno):
- Valida disponibilidade.
- Aplica as novas datas.
- Invalida obrigatoriamente a assinatura (`r.needsReSignature = true`, `r.fnhrCompleted = false`).
- Dispara comunicação com link de re-assinatura.
- Atualiza governança, café e recepção.

---

### 7.6 Atualizações em `POST /api/pms/pre-checkin`
**Finalidade**: Garantir que, ao concluir a re-assinatura:
1. Limpe `r.needsReSignature = false` e `delete r.needsReSignature`.
2. Limpe `g.needsReSignature = false` para os hóspedes.
3. Marque `r.fnhrCompleted = true` e `r.preCheckinCompleted = true`.
4. Gere o novo PDF FNRH com a nova assinatura e envie à recepção e garagem.

---

## 8. Sincronização Operacional e Painéis em Tempo Real

1. **Recepção (`GET /api/reception/today`)**:
   - Como consulta diretamente `db.reservations` em tempo real:
     - O campo `hasCompletedCheckin` utiliza `Boolean(r.fnhrCompleted && !r.needsReSignature)`.
     - Ao modificar uma reserva para hoje, o hóspede aparece imediatamente com badge de "Assinatura Pendente / Re-assinar".
2. **Garagem Soho (`GET /api/pms/garage/daily-sheet`)**:
   - Mapeia em tempo real `r.checkinDate <= todayStr && r.checkoutDate >= todayStr`.
   - Se o hóspede estender a estadia ou trocar de flat, a placa do veículo é mantida e a data de check-out é sincronizada de imediato na lista do dia.
3. **Governança e Camareiras (`db.cleaningRequests`)**:
   - Reconciliação imediata: se a data de saída mudou, a solicitação de limpeza de check-out é remarcada para a nova data de check-out. Se o flat mudou, a solicitação é transferida para o novo apartamento.
4. **Café da Manhã (`db.breakfastOrders`)**:
   - Pedidos fora da nova janela de estadia são automaticamente cancelados (`cancelled`), e pedidos dentro do novo intervalo permanecem ativos.

---

## 9. Conclusão da Investigação

O backend do CorpFlats possui toda a infraestrutura base pronta para suportar o novo fluxo:
- Motor de verificação de datas e flats.
- APIs do Banco Inter (Cobrança e Extrato) e Mercado Pago (Checkout Pro e Webhook).
- Sistema de flags de re-assinatura (`needsReSignature`, FNRH PDF, trilha de auditoria).
- Paridade de templates WhatsApp (Template 2 e Template 21).

A implementação do fluxo seguro em duas etapas exigirá:
1. Criação dos novos endpoints (`/modify-preview`, `/modify-checkout`, `/modify-status`, `/modify-cancel-pending`).
2. Ajuste na verificação de disponibilidade para considerar holds provisórios (`r.pendingModification`).
3. Refatoração do modal de modificação no portal do hóspede (`artifacts/limpeza/src/pages/guest-portal.tsx`) para consumir a pré-visualização, exibir badge de disponibilidade, travar confirmação sem pagamento e abrir o fluxo de checkout com QR Code e Copia e Cola.
4. Inclusão do banner de re-assinatura no portal do hóspede e envio automático do link de renovação da ficha FNRH.
5. Manutenção obrigatória da paridade byte-a-byte entre `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`.

O relatório detalhado e as especificações técnicas acima estão prontos para subsidiar a fase de implementação com total segurança e conformidade arquitetural.

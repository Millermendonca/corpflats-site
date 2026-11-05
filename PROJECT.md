# Project: Ingestão Autônoma de Reservas e Cancelamentos B2B

## Architecture
- **Email Ingestion Core**: `artifacts/api-server/zoho-mail-service.mjs` (espelhado em `scripts/zoho-mail-service.mjs`).
  - Webhook entrypoint (`POST /api/webmail/zoho-webhook` via `demo-server.mjs:42783`).
  - Polling synchronization (`syncZohoMessagesToCache`).
  - Message detail parser (`getWebmailMessageDetail`).
- **Voucher Parser & Enricher**:
  - `parseB2bVoucherText`: Parsing estruturado de vouchers (regexes para datas, diárias, agência, CNPJ, faturamento e NFS-e).
  - `fetchAndParseB2bVoucher`: Obtenção do conteúdo via anexo PDF ou link HTTP do portal B2B / operadoras.
  - `ingestB2bVoucherIntoDb`: Persistência determinística da reserva, hóspede, `dailyRates`, agência e empresa em `db`.
- **B2B Cancellation Service**: `artifacts/api-server/b2b-cancellation-service.mjs` (espelhado em `scripts/b2b-cancellation-service.mjs`).
  - `detectB2bEmailIntent`: Discriminação entre confirmação, cancelamento e outros comunicados.
  - `matchReservationForCancellation`: Busca em 4 camadas (número B2B, RLOC, código PMS, heurística hóspede + checkin).
  - `executeAutonomousB2bCancellation`: Aplicação da cascata canônica de cancelamento do PMS, trava `CHECKED_IN_CANCELLATION`, registro duplo de auditoria e disparo de alerta via Z-API ao gestor.
- **Twin-Server Parity**: Todo arquivo `.mjs` modificado em `artifacts/api-server/` deve ter paridade exata SHA-256 com seu correspondente em `scripts/`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | F1_CALCULO_DIARIAS | Suporte a períodos numéricos e regex explícito de diárias/noites no parser | M1 | R1, Survey 1 |
| 2 | F2_FALLBACK_MATEMATICO_NOITES | Fallback matemático de noites por valor total / diária e cálculo seguro de checkout | M1 | R1, Survey 1 |
| 3 | F3_DAILY_RATES_GERACAO | Geração do array completo de `dailyRates` para todas as diárias da reserva | M1 | R1, Survey 1 |
| 4 | F4_VALIDACAO_GABARITO_113 | Conferência com o gabarito do Flat 113 (B2B-25055349 / Pires Hage, 2 diárias) | M1 | R1, Survey 1 |
| 5 | F5_PDF_EXTRACTION_SERVICE | Utilitário seguro para extração de texto a partir de buffers PDF | M2 | R2, Survey 2 |
| 6 | F6_DOWNLOAD_ANEXOS_EMAIL | Download e extração de vouchers recebidos em anexos PDF no webhook e sync | M2 | R2, Survey 2 |
| 7 | F7_CRAWLER_HTTP_VOUCHER | Acesso HTTP ao link do voucher sem travas impeditivas e suporte a múltiplos padrões | M2 | R2, Survey 2 |
| 8 | F8_EXTRACAO_DADOS_AGENCIA | Extração de Nome da Agência, CNPJ, Agente, Telefone e E-mail | M2 | R2, Survey 2 |
| 9 | F9_EXTRACAO_VALORES_FINANCEIROS | Extração de Valor Total e Comissão da Agência | M2 | R2, Survey 2 |
| 10 | F10_EXTRACAO_INSTRUCOES_NFSE | Extração integral das instruções de emissão de NFS-e do voucher | M2 | R2, Survey 2 |
| 11 | F11_PERSISTENCIA_CAMPOS_AGENCIA_FISCAL | Gravação e sincronização dos dados cadastrais/fiscais em reservas, agências e empresas | M2 | R2, Survey 2 |
| 12 | F12_DETECCAO_EMAIL_CANCELAMENTO | Identificação precisa de e-mails de cancelamento B2B antes da ingestão | M3 | R3, Survey 3 |
| 13 | F13_CASAMENTO_RESERVA_CANCELAMENTO | Localização determinística da reserva a cancelar (B2B num, RLOC, PMS code, heurística) | M3 | R3, Survey 3 |
| 14 | F14_TRAVA_SEGURANCA_CHECKED_IN | Trava operacional bloqueando cancelamento autônomo de hóspede já em estada | M3 | R3, Survey 3 |
| 15 | F15_CASCATA_CANCELAMENTO_PMS | Execução canônica de liberação de quarto, tarefas de governança, café, FNRH e ARI | M3 | R3, Survey 3 |
| 16 | F16_AUDITORIA_NOTIFICACAO_GESTOR | Auditoria dupla e alerta imediato via WhatsApp Z-API ao gestor (5522997124021) | M3 | R3, Survey 3 |
| 17 | F17_TESTES_E2E_SUITE | Execução de suíte E2E pontual validando R1, R2, R3 e Flat 113 | M4 | Critérios de Aceite |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Correção de Diárias & Estadia B2B | F1, F2, F3, F4 | none | DONE |
| M2 | Ingestão Completa de Voucher (PDF & Link) | F5, F6, F7, F8, F9, F10, F11 | M1 | DONE |
| M3 | Cancelamento Autônomo B2B & Notificação | F12, F13, F14, F15, F16 | M2 | DONE |
| M4 | E2E Integration & Verification | F17 (Tiers 1-4 + Adversarial) | M1, M2, M3 | PLANNED |

## Interface Contracts

### M1: Parser de Diárias (`parseB2bVoucherText`)
- Entrada: `rawText: string`, `options?: { ... }`
- Retorno garantido:
  ```typescript
  {
    checkinDate: string; // YYYY-MM-DD
    checkoutDate: string; // YYYY-MM-DD
    nights: number; // >= 1
    dailyRate: number; // >= 0
    totalAmount: number; // >= dailyRate * nights
    // ...
  }
  ```
- Invariante: `nights === Math.round((new Date(checkoutDate) - new Date(checkinDate)) / 86400000)`. Se a reserva tem 2 noites, `nights` DEVE ser 2.

### M2: Extração de Voucher & Dados Cadastrais/Fiscais
- Assinatura: `extractVoucherData(source: { buffer?: Buffer, mimeType?: string, url?: string, text?: string })`
- Retorno:
  ```typescript
  {
    agencyName: string;
    agencyCnpj: string;
    agencyAgentName: string;
    agencyAgentPhone: string;
    agencyAgentEmail: string;
    companyName: string;
    companyCnpj: string;
    totalAmount: number;
    b2bCommissionPct: number;
    b2bCommissionAmount: number;
    invoicingInstructions: string;
    // ...
  }
  ```
- Invariante: Preservar a integridade textual das instruções de NFS-e e salvar em `r.invoicingInstructions` e `r.agencyCnpj`.

### M3: Cancelamento Autônomo (`b2b-cancellation-service.mjs`)
- Assinatura: `executeAutonomousB2bCancellation(db, emailData: { subject: string, from: string, text: string, html: string })`
- Retorno:
  ```typescript
  {
    success: boolean;
    cancelled: boolean;
    blockedReason?: 'CHECKED_IN_CANCELLATION' | 'RESERVATION_NOT_FOUND' | 'MULTIPLE_MATCHES';
    reservationCode?: string;
    matchedBy?: 'b2b_number' | 'rloc' | 'pms_code' | 'heuristic';
    alertSent: boolean;
  }
  ```

## Code Layout
- Backend:
  - `artifacts/api-server/zoho-mail-service.mjs`
  - `artifacts/api-server/b2b-cancellation-service.mjs` (novo módulo desacoplado)
  - `artifacts/api-server/demo-server.mjs`
  - Espelhos obrigatórios: `scripts/zoho-mail-service.mjs` e `scripts/b2b-cancellation-service.mjs`
- Testes Pontuais (sem varredura global):
  - `tests/b2b-voucher-dates.test.mjs` (M1)
  - `tests/b2b-voucher-extraction.test.mjs` (M2)
  - `tests/b2b-cancellation.test.mjs` (M3)
  - `tests/b2b-e2e-suite.test.mjs` (M4)

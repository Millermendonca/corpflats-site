# Manual Humano Completo — Integração Channex.io (OTA Channel Manager) • CorpFlats Soho Residence

Este manual documenta passo a passo como configurar, homologar (nos 14 Testes de Certificação da Channex) e operar no dia a dia a integração entre o **Guest-Flow-Manager PMS (CorpFlats Soho Residence — 19 Flats)** e o **Channex.io REST API v1**.

---

## 1. Visão Geral e Garantias de Segurança Operacional

A integração foi projetada para **zero risco de perda de informações** e **zero impacto na operação atual**:
1. **Chave Geral de 3 Estágios (`off` $\rightarrow$ `observe` $\rightarrow$ `auto`)**:
   - **`off` (Desligado — Padrão)**: O PMS não faz nenhuma chamada de saída para a Channex.io, não inicia timers de polling e responde aos webhooks sem alterar o banco de dados.
   - **`observe` (Somente Observar)**: O PMS grava todos os payloads recebidos em armazenamento durável (`Write-Ahead JSONL`) e simula em qual dos 19 flats a reserva seria alocada via *Fair-Share*, mas **não cria reservas reais**, **não envia confirmação ACK** e **não dispara mensagens de WhatsApp ou e-mail**.
   - **`auto` (Automático)**: Sincronização completa bidirecional ativa.
2. **Supressão Estrita de PIX para OTAs**: Reservas vindas da Booking.com, Airbnb ou Expedia nunca geram cobrança PIX automática no WhatsApp do hóspede (`pixTxId: null`, `pixCopiaECola: null`).
3. **Proteção de Hóspede Hospedado (*In-House*)**: Se uma OTA enviar um cancelamento para uma reserva cujo hóspede já realizou check-in no prédio, o cancelamento automático é bloqueado e a reserva vai para a **Quarentena** com alerta imediato no WhatsApp do gestor.

---

## 2. Configuração das Variáveis de Ambiente (`.env` / Render)

No painel do Render (ou arquivo `.env`), configure as variáveis abaixo:

```env
# Provedor e Modo Inicial (mantenha 'off' até desejar iniciar os testes em staging)
OTA_PROVIDER=channex
CHANNEX_INTEGRATION_MODE=off

# Ambiente Channex: 'staging' (https://staging.channex.io/api/v1) ou 'production' (https://app.channex.io/api/v1)
CHANNEX_ENVIRONMENT=staging

# Chave de API gerada no painel da Channex (enviada no header HTTP 'user-api-key')
CHANNEX_API_KEY=sua_user_api_key_aqui

# Segredo para validação HMAC-SHA256 dos Webhooks recebidos em /api/callback/channex
CHANNEX_WEBHOOK_SECRET=seu_segredo_hmac_sha256_aqui

# Horizonte de sincronização (padrão exigido pela certificação Channex: 500 dias)
CHANNEX_STATE_LENGTH_DAYS=500
```

---

## 3. Passo a Passo: Auto-Setup em 1 Clique dos 19 Flats na Channex

1. Acesse no menu lateral do PMS: **Reservas & Hospedagem $\rightarrow$ Caixa de Entrada OTA** (`/caixa-entrada-ota`).
2. Clique no botão **"Auto-Setup 19 Flats"** no cabeçalho.
3. O PMS criará (ou vinculará automaticamente, caso já existam na sua conta Channex):
   - **Property**: `CorpFlats Soho Residence` (`BRL`, `America/Sao_Paulo`, `state_length: 500`, `min_stay_type: "both"`, `allow_availability_autoupdate_on_confirmation: true`, `allow_availability_autoupdate_on_modification: false`, `allow_availability_autoupdate_on_cancellation: false`).
   - **Room Type**: `Flat` com `count_of_rooms: 19` (pool compartilhado das 19 unidades físicas: 113, 114, 116, 211, 212, 215, 313, 408, 509, 511, 512, 605, 712, 715, 904, 905, 907, 1004 e 1304), ocupação máxima de 3 adultos e ocupação padrão de 2 adultos.
   - **Rate Plan 1 (`Sem Café`)**: `sell_mode: "per_person"`, `rate_mode: "manual"`, opções para 1, 2 (primária) e 3 pessoas.
   - **Rate Plan 2 (`Com Café`)**: `sell_mode: "per_person"`, `rate_mode: "manual"`, opções para 1, 2 (primária) e 3 pessoas com o adicional de café da manhã.
4. Os 4 UUIDs gerados pela Channex (`propertyId`, `roomTypeId`, `ratePlanSemCafeId`, `ratePlanComCafeId`) ficam salvos automaticamente no PMS e visíveis no painel superior da Caixa de Entrada OTA.

---

## 4. Conectando Booking.com, Airbnb e Expedia via White-Label IFrame

1. Na **Caixa de Entrada OTA**, clique em **"Conectar Canais (IFrame)"**.
2. O PMS solicita um `one_time_token` válido por 15 minutos via `POST /api/v1/auth/one_time_token` e abre a interface oficial da Channex em Português (`/auth/exchange?oauth_session_key=...&app_mode=headless&redirect_to=/channels&lng=pt`).
3. Dentro do modal, autentique sua conta do Airbnb (via OAuth) ou informe o Hotel ID da Booking.com e associe aos planos `Flat — Sem Café` e `Flat — Com Café`.

---

## 5. Como Passar nos 14 Testes de Certificação PMS da Channex (`pms-certification-tests.md`)

A Channex exige o preenchimento de uma planilha de certificação contendo os **Task IDs** gerados pelas chamadas da API:

| Teste | Requisito da Channex | Como executar no CorpFlats PMS |
| :--- | :--- | :--- |
| **#1** | **Full Data Update (500 dias em 2 chamadas)** | Clique em **"Full Sync 500d (2 Calls)"** na Caixa de Entrada OTA. O PMS envia 1 chamada `POST /api/v1/availability` e 1 chamada `POST /api/v1/restrictions` cobrindo 500 dias comprimidos e exibe os 2 `task_id`s na tela com botão **Copiar**. |
| **#2** | **Single Date Availability Update** | Crie uma reserva ou bloqueio de manutenção para 1 data no Mapa de Reservas. O PMS envia apenas o delta daquela data para `/availability` e registra o `task_id`. |
| **#3** | **Multiple Date Range Availability Update** | Crie uma reserva de múltiplos dias ou bloqueio de período; o PMS comprime o intervalo `date_from` / `date_to` em 1 chamada para `/availability`. |
| **#4** | **Single Rate Update** | Altere e publique a tarifa de 1 data na tela **Tarifas & Precificação SEBRAE** (`/tarifas`). |
| **#5** | **Multiple Rates Update** | Publique tarifas para os dois planos (`Sem Café` e `Com Café`) em um intervalo de datas. |
| **#6** | **Min Stay Arrival Update** | Altere o `min_los` em `/tarifas` e publique; o PMS atualiza `min_stay_arrival` e `min_stay_through` sem enviar campos `null`. |
| **#7** | **Stop Sell Update** | Ative o bloqueio de vendas (`close` / `stop_sell: true`) para um período e publique. |
| **#8 a #12** | **Recebimento de Reservas (New, Multi-Room, Unmapped, Modification, Cancellation)** | Clique em **"Consultar Feed"** (ou receba via Webhook `/api/callback/channex`). O PMS importa via `GET /api/v1/booking_revisions/feed`, aloca flats via *Fair-Share*, envia não-mapeadas (`room_type_id: null`) para a Quarentena e confirma cada revisão com `POST /api/v1/booking_revisions/:id/ack`. |
| **#13 e #14** | **Rate Limit (10 req/min por endpoint)** | O Outbox do PMS limita estritamente a 10 chamadas/minuto em `/availability` e 10 chamadas/minuto em `/restrictions`, agrupando alterações e pausando 60s automaticamente se receber HTTP `429`. |

---

## 6. Cofre de Cartões PCI (AES-256-GCM) e Cartões Virtuais (VCC)

- **Descarte Imediato de CVV**: Qualquer código de segurança (`cvv`, `cvc`, `security_code`) é removido em memória antes de qualquer gravação em disco ou log.
- **Cofre Criptografado**: O PAN do cartão é criptografado com `AES-256-GCM`. Para visualizar o número completo para cobrança em maquininha POS, o administrador deve reinserir sua senha (gerando um token de uso único válido por 5 minutos).
- **Expurgo Automático D+10**: Cartões são expurgados automaticamente 10 dias após o check-out ou imediatamente em cancelamentos sem multa.
- **Cartões Virtuais (VCC)**: Quando a Booking.com ou Expedia envia um Cartão Virtual (`guarantee.is_virtual: true`), o PMS preserva e exibe o saldo disponível (`virtual_card_current_balance`), a data de ativação (`virtual_card_effective_date`) e a data de expiração (`virtual_card_expiration_date`).

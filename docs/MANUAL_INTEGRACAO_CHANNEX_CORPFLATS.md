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
   - **Property**: `CorpFlats Soho Residence` (`BRL`, `America/Sao_Paulo`, `property_type: "apart_hotel"`, `state_length: 500`, `min_stay_type: "both"`, `allow_availability_autoupdate_on_confirmation: true`, `allow_availability_autoupdate_on_modification: false`, `allow_availability_autoupdate_on_cancellation: false`).
   - **Room Type**: `Flat` com `count_of_rooms: 19` (pool compartilhado das 19 unidades físicas: 113, 114, 116, 211, 212, 215, 313, 408, 509, 511, 512, 605, 712, 715, 904, 905, 907, 1004 e 1304), ocupação máxima de 3 adultos e ocupação padrão de 2 adultos.
   - **Rate Plan 1 (`Sem Café`)**: `sell_mode: "per_person"`, `rate_mode: "manual"`, `ui_read_only: true`, opções para 1, 2 (primária) e 3 pessoas.
   - **Rate Plan 2 (`Com Café`)**: `sell_mode: "per_person"`, `rate_mode: "manual"`, `ui_read_only: true`, opções para 1, 2 (primária) e 3 pessoas com o adicional de café da manhã.
4. Os 4 UUIDs gerados pela Channex (`propertyId`, `roomTypeId`, `ratePlanSemCafeId`, `ratePlanComCafeId`) ficam salvos automaticamente no PMS e visíveis no painel superior da Caixa de Entrada OTA.

---

## 4. Conectando Booking.com, Airbnb e Expedia via White-Label IFrame

1. Na **Caixa de Entrada OTA**, clique em **"Conectar Canais (IFrame)"**.
2. O PMS solicita um `one_time_token` válido por 15 minutos via `POST /api/v1/auth/one_time_token` e abre a interface oficial da Channex em Português (`/auth/exchange?oauth_session_key=...&app_mode=headless&redirect_to=/channels&lng=pt`).
3. Dentro do modal:
   - **Booking.com**: Informe o Hotel ID da Booking.com e mapeie o quarto `Flat` e os planos `Sem Café` e `Com Café`. Caso a Booking.com possua planos derivados (*derived rate plans*), a Channex envia o plano pai em `room.meta.parent_rate_plan_id`, que o PMS reconhece automaticamente.
   - **Airbnb**: Autentique via OAuth oficial da Airbnb, configure *Availability by Default = 0* por segurança e remova qualquer sincronização antiga via iCal antes de ativar o anúncio.

---

## 5. Como Passar nos 14 Testes de Certificação PMS da Channex (`pms-certification-tests.md`)

A Channex exige o preenchimento de uma planilha de certificação contendo os **Task IDs** gerados pelas chamadas da API (`POST /api/v1/availability` e `POST /api/v1/restrictions`):

| Teste Oficial | Requisito da Certificação Channex | Como executar no CorpFlats PMS |
| :--- | :--- | :--- |
| **#1** | **Full Data Update (500 dias em 2 chamadas: 1 Availability + 1 Restrictions)** | Clique em **"Full Sync 500d (2 Calls)"** na Caixa de Entrada OTA. O PMS envia 1 chamada `POST /api/v1/availability` e 1 chamada `POST /api/v1/restrictions` cobrindo 500 dias comprimidos e exibe os 2 `task_id`s na tela com botão **Copiar**. |
| **#2** | **Single Date Update for Single Rate** | Altere e publique a tarifa de 1 data e 1 plano na tela **Tarifas & Precificação SEBRAE** (`/tarifas`). O PMS envia apenas o delta para `/restrictions` (sem tocar em `/availability`) e registra o `task_id`. |
| **#3** | **Single Date Update for Multiple Rates** | Altere e publique a tarifa de 1 única data para ambos os planos (`Sem Café` e `Com Café`). O PMS envia 1 chamada `POST /api/v1/restrictions` com os 2 `rate_plan_id`s. |
| **#4** | **Multiple Date Update for Multiple Rates** | Publique tarifas para um intervalo de datas (`date_from` / `date_to`) nos dois planos (`Sem Café` e `Com Café`); o compressor contíguo agrupa datas com valores idênticos em blocos `date_from`–`date_to`. |
| **#5** | **Min Stay Update** | Altere o `min_los` em `/tarifas` e publique; o PMS atualiza `min_stay_arrival` e `min_stay_through` sem jamais enviar campos `null`. |
| **#6** | **Stop Sell Update** | Ative ou desative `stop_sell` para uma data ou período na Grade de 7 Restrições e publique em 1 chamada `POST /api/v1/restrictions`. |
| **#7** | **Multiple Restrictions Update (`rate`, `stop_sell`, `closed_to_arrival`, `closed_to_departure`, `min_stay`, `max_stay`)** | Altere múltiplas restrições simultaneamente na Grade de 7 Restrições e publique em 1 única chamada. |
| **#8** | **Half-year Update (6 meses com filtro de dias da semana / múltiplos planos)** | Aplique regras de fim de semana (sexta/sábado `min_los = 2`) e dias de semana (`min_los = 1`) para 6 meses em ambos os planos tarifários. |
| **#9** | **Single Date Availability Update** | Crie uma reserva de 1 diária ou bloqueio de 1 noite no Mapa de Reservas. O PMS dispara **apenas** `POST /api/v1/availability` (desacoplado de `/restrictions`) e grava o `task_id`. |
| **#10** | **Multiple Date Availability Update** | Crie uma reserva de múltiplas diárias ou bloqueio de manutenção pluridiário. O PMS comprime datas contíguas com a mesma disponibilidade em `date_from`–`date_to` em 1 chamada `POST /api/v1/availability`. |
| **#11** | **Booking Receiving (`GET /booking_revisions/feed` + `POST /booking_revisions/:id/ack`)** | Clique em **"Consultar Feed"** (ou receba via Webhook `/api/callback/channex`). O PMS processa reservas novas, **Multi-Quarto** (alocando N flats distintos via *Fair-Share*), **Unmapped Room/Rate** (enviando para Quarentena `UNMAPPED_ROOM_OR_RATE`), **Modificações** (3 níveis de realocação) e **Cancelamentos** (com trava *In-House*), confirmando cada revisão com `ACK`. |
| **#12** | **Rate Limits (Máx. 10 req/min em `/availability` e 10 req/min em `/restrictions`)** | O Outbox do PMS controla estritamente a janela deslizante de 10 req/min por propriedade e endpoint, reagendando automaticamente qualquer delta excedente após a janela de 60s e recuperando-se de HTTP `429`. |
| **#13** | **Update Logic (Deltas vs Full Sync & Desacoplamento Availability vs Restrictions)** | O PMS nunca dispara Full Sync em mutações rotineiras (usa deltas enxutos com debounce de 2s / máx 6s) e separa estritamente mutações de ocupação (`/availability`) de mutações tarifárias (`/restrictions`). |
| **#14** | **Extra Notes** | Documenta a arquitetura de 19 flats em pool compartilhado (`count_of_rooms: 19`, `property_type: "apart_hotel"`) e conciliação automática *Fair-Share*. |

---

## 6. Cofre de Cartões PCI (AES-256-GCM) e Cartões Virtuais (VCC)

- **Descarte Imediato de CVV**: Qualquer código de segurança (`cvv`, `cvc`, `security_code`) é removido em memória antes de qualquer gravação em disco ou log.
- **Cofre Criptografado**: O PAN do cartão é criptografado com `AES-256-GCM`. Para visualizar o número completo para cobrança em maquininha POS, o administrador deve reinserir sua senha (gerando um token de uso único válido por 5 minutos).
- **Expurgo Automático D+7**: Alinhado à política PCI DSS da Channex (retenção de 7 dias), os cartões são expurgados automaticamente **7 dias após o check-out (`D+7`)** ou imediatamente em cancelamentos sem multa.
- **Cartões Virtuais (VCC)**: Quando a Booking.com ou Expedia envia um Cartão Virtual (`guarantee.is_virtual: true`), o PMS preserva e exibe o saldo disponível (`virtual_card_current_balance`), a data de ativação (`virtual_card_effective_date`) e a data de expiração (`virtual_card_expiration_date`).

---

## 7. Cobertura dos 28 Eventos de Webhook Channex (`/api/callback/channex`) e Acervo Local

O receptor `/api/callback/channex` valida a assinatura `HMAC-SHA256` sobre os bytes brutos (`x-hmac-timestamp` + `x-hmac-signature-256`, suportando múltiplas chaves em rotação) e classifica todos os **28 tipos de eventos** da Channex:
- **Eventos de Reserva** (`booking`, `booking_new`, `booking_modification`, `booking_cancellation`, `booking_unmapped_room`, `booking_unmapped_rate`, `non_acked_booking`): Ingeridos no pipeline de reservas (ou buscados via `GET /booking_revisions/feed` quando enviados como notificação leve) e confirmados com `ACK`.
- **Eventos Operacionais e de Canal** (`sync_error`, `ari`, `reservation_request`, `alteration_request`, `inquiry`, `message`, `review`, `live_feed_event`, `tax_set_*`, `webhook_test`, etc.): Reconhecidos com `200 OK` sem falsos positivos na Quarentena, gerando alertas operacionais diretos ao gestor quando críticos (`sync_error`, `non_acked_booking`, `booking_unmapped_*`, `reservation_request`, `alteration_request`).
- **Acervo Completo Offline**: Toda a documentação oficial da Channex (**223 páginas Markdown** + especificações **OpenAPI 3.1.0** `openapi.json` e `properties-api.json`) encontra-se espelhada localmente em [`docs/channex/README.md`](./channex/README.md).


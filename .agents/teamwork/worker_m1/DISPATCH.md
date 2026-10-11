## 2026-10-11T00:56:22Z
Você é o Worker de Implementação do Milestone M1 do CorpFlats.
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1
O arquivo de requisitos originais autoritativo é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
O arquivo de escopo do projeto é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_4\PROJECT.md
O relatório de exploração técnica de backend é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_1\analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Arquivos de sua propriedade exclusiva:
- `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` (espelho obrigatório byte-a-byte)
- `data/database.json`
- `tests/tariff-engine.test.mjs`
- `tests/bot-actions-api.test.mjs`

Missão:
Implementar o Milestone M1:
1. R1: Chave Mestra Global (`apiActionsEnabled`) e Matriz Granular (`allowedActions`: checkAvailability, calculateQuote, generatePayment, createPreReservation, commitReservation) em `db.botActionsSettings`.
   - Endpoints `/api/bot-actions/settings` (GET e POST com persistência e hot-update).
   - Middleware/verificador de ação: quando `!apiActionsEnabled` OU `!allowedActions[actionKey]`, rejeita com status 403 e payload:
     `{ error: "ACTION_DISABLED", action: "<actionKey>", requiresHandover: true, message: "Esta ação do sistema está pausada ou requer atendimento humano." }`.
   - Endpoints REST `/api/bot-actions/*`:
     - `GET /api/bot-actions/availability`: query checkIn, checkOut, guests. Consulta conflitos no PMS e desconsidera pré-reservas vencidas (`expiresAt < Date.now()`).
     - `POST /api/bot-actions/quote`: body { checkIn, checkOut, guests, flatId, channel, ratePlan }. Usa o Motor de Tarifas para calcular as noites, aplica markup de canal, soma adicionais de `siteConfig` (limpeza, cama extra, café da manhã se plano com café), discrimina itens e total com validade.
     - `POST /api/bot-actions/payment-link`: body { reservationId, amount, guestName }. Gera payload PIX Copia-e-Cola (BACEN BR Code válido) e QR Code em base64.
     - `POST /api/bot-actions/pre-reserve`: body { flatId, checkIn, checkOut, guestName, guestPhone, guests, channel, total }. Registra reserva com status "pre_reserva" e `expiresAt: Date.now() + 30 * 60 * 1000` (30 min de hold).
     - `POST /api/bot-actions/commit-reservation`: body { reservationId }. Efetiva no PMS para status "confirmada", bloqueio permanente da UH e notificação da recepção.

2. R2: Motor de Tarifas Inteligente & Gestor Multi-Canal:
   - Estrutura `db.tariffSettings` (modo "auto" ou "manual", markups por canal direct/booking/airbnb, weekendMarkupPct) e `db.tariffOverrides` (array com flatId, date, channel, rate).
   - Função de cálculo de diária `calculateDailyRate(flatId, date, channel)`: se modo "auto", calcula a diária sustentável mínima a partir de `getFinancialSettings()` (custos fixos + variáveis / margem SEBRAE) aplicando a curva de sazonalidade do mês; se modo "manual", usa baseRate; aplica fim de semana (+15%) e markup de canal; respeita overrides com prioridade.
   - Sincronização de adicionais (limpeza, cama extra, café) com `db.siteConfig`.
   - Endpoints `/api/tariffs/settings` (GET/POST), `/api/tariffs/calendar` (GET para matriz mensal), `/api/tariffs/bulk-update` (POST para override em lote com filtros), `/api/tariffs/overrides/:id` (DELETE).

3. R3: Criação de Testes Automatizados e Execução:
   - Crie `tests/tariff-engine.test.mjs` testando cálculo SEBRAE, markup de canais, fim de semana, overrides individuais e em massa.
   - Crie `tests/bot-actions-api.test.mjs` testando chave mestra ligada/desligada, chaves individuais ligadas/desligadas (403 ACTION_DISABLED e requiresHandover), e fluxo completo ponta a ponta (availability -> quote -> pre-reserve -> payment-link -> commit).
   - Execute os testes usando `node --test tests/tariff-engine.test.mjs` e `node --test tests/bot-actions-api.test.mjs` até obter 100% de aprovação.

4. Twin-Server Parity Mandate:
   - Copie `artifacts/api-server/demo-server.mjs` para `scripts/demo-server.mjs` e certifique-se de que os hashes SHA-256 são rigorosamente idênticos.

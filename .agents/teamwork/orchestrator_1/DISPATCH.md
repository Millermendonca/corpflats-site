## 2026-10-13T22:06:32Z

Você é o Project Orchestrator para o projeto Guest-Flow-Manager (integração PMS CorpFlats Soho Residence com o channel manager WebBookingPro e reestruturação do módulo de precificação SEBRAE).

Seu diretório de trabalho dedicado é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_1`

O caminho da solicitação original com todos os requisitos detalhados (R1 a R10), critérios de aceitação e referências é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`

Por favor:
1. Leia `ORIGINAL_REQUEST.md` na íntegra.
2. Crie e mantenha seu `BRIEFING.md` e `progress.md` em seu diretório de trabalho (`.agents/teamwork/orchestrator_1/`).
3. Trabalhe no repositório `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager` na branch `feature/wbp-integration` (nunca faça merge na `main` sem aprovação do usuário).
4. Siga estritamente todas as regras do projeto (`AGENTS.md`), incluindo:
   - Paridade byte-a-byte idêntica (SHA-256) entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` e qualquer serviço duplicado.
   - Executar EXCLUSIVAMENTE testes pontuais específicos da integração criados neste projeto; NUNCA executar suítes completas ou testes em lote.
   - Ao alterar `artifacts/limpeza/src`, rodar build e commitar `artifacts/limpeza/dist/`.
   - Realizar `git push` a cada `git commit` na branch ativa.
5. Decomponha o trabalho, coordene os especialistas necessários, mantenha `progress.md` atualizado continuamente e comunique seus avanços e a conclusão final via handoff report.

## 2026-10-13T22:21:52Z

CORREÇÃO URGENTE do usuário (instrução mandatória para o orquestrador e repasse a todos os subagentes):

1) BRANCH: Verifique `git branch --show-current`. Se estiver na `main`, execute imediatamente `git switch -c feature/wbp-integration` a partir de `0501d02`, levando junto as alterações não commitadas da working tree. NUNCA fazer commit ou push na `main`. Confirmem a branch antes de cada commit.

2) NÃO PERDER DOCUMENTAÇÃO EXISTENTE: `PROJECT.md` (projeto anterior "Smart Flat Hub") foi sobrescrito na raiz, e `TEST_INFRA.md` / `TEST_READY.md` (projeto anterior "Reservation Modification Flow") correm o mesmo risco.
   - Isole os arquivos deste projeto em diretório próprio: `docs/integracoes/webbookingpro/PROJECT.md` e `docs/integracoes/webbookingpro/TEST_INFRA.md`.
   - Restaure os originais na raiz com `git checkout 0501d02 -- PROJECT.md` (e qualquer outro arquivo pré-existente afetado).

3) `artifacts/api-server/audit_logs.jsonl` possui 11 linhas locais não commitadas que DEVEM ser preservadas (não fazer checkout ou reset desse arquivo).

Por favor, execute essas correções imediatamente e confirme o cumprimento dos três pontos.

## 2026-10-13T22:50:11Z

ALERTA DE RISCO OPERACIONAL PARA O MARCO 2 (Mandatório - repassar imediatamente ao worker_m2 e subagentes):

O motor de tarifas atual (`calculateDailyRate`, `getTariffSettings`, `calculateSebraeSustainableRate`, `db.tariffSettings`/`tariffOverrides`) é usado FORA da integração: no motor de reservas do site (direct-booking), nas cotações do bot (`/api/bot-actions/quote`), na tela de Tarifas e no cálculo de `dailyRates` ao criar reservas manuais. Conforme R1, com a integração desligada o sistema DEVE se comportar EXATAMENTE como hoje.

Diretrizes obrigatórias para o Marco 2:
1) A nova precificação SEBRAE (custos corrigidos, imposto de 6%, sazonalidade por ocupação real etc.) NÃO PODE alterar os preços que o site, o bot e as reservas manuais calculam hoje enquanto o usuário não a ativar explicitamente, pela pré-visualização e "Publicar" ou por uma chave própria. Os valores e os modos existentes de `db.tariffSettings` devem ser preservados intactos, sem migração destrutiva.
2) O cálculo canônico de disponibilidade alimenta o ARI. Nas telas atuais, ele só pode ACRESCENTAR avisos de conflito, sem bloquear e sem mudar os resultados dos endpoints de disponibilidade existentes para o site e o bot, a menos que explicitamente aprovado.
3) Incluir no M2 um TESTE PONTUAL DE REGRESSÃO obrigatório: com a integração desligada e sem nenhuma publicação, `calculateDailyRate` e o endpoint de cotação devem retornar os mesmos valores exatos de antes da mudança para um conjunto de datas, flats e canais.

Por favor, confirme a recepção e o repasse ao worker_m2.

## 2026-10-13T23:10:08Z

REVISÃO BLOQUEANTE DO USUÁRIO/ORQUESTRADOR-PAI SOBRE tests/wbp-integration/m2-availability-pricing.test.mjs (BLOQUEANTE para o gate do M2 — não submeter nem executar o gate antes de corrigir):

1) ISOLAMENTO QUEBRADO (crítico):
   - Imports ESM são içados (hoisted). O `delete process.env.DATABASE_URL` na linha 24 roda DEPOIS de `demo-server.mjs` ter sido avaliado.
   - O teste não define `DATA_FILE` nem `NODE_ENV=test`, arriscando carregar ou regravar o `data/database.json` REAL.
   - CORREÇÃO: Definir `DATABASE_URL` removida, `DATA_FILE=cópia temporária em os.tmpdir()` e `NODE_ENV=test` ANTES do carregamento (via `await import()` dinâmico ou setup importado primeiro; ou servidor filho isolado como em `tests/tariff-engine.test.mjs`).
   - Provar no teste que `DB_FILE` aponta para a cópia e que o `data/database.json` real não teve mtime/hash alterado.

2) GUARDA DE NÃO-REGRESSÃO COM VALORES-OURO REAIS:
   - Não basta verificar proporções relativas.
   - Comparar com valores-ouro do comportamento LEGADO real: gerar valores de `calculateDailyRate` (vários flats, datas úteis/fins de semana/alta/baixa, canais direct/booking/airbnb, com/sem overrides P1-P4) extraindo o demo-server da `main` (`git show 0501d02:artifacts/api-server/demo-server.mjs` num diretório temporário, sobre a MESMA cópia de dados) e afirmar igualdade exata com o da branch com integração desligada/não publicada.

3) COTAÇÃO BOT E SITE:
   - Adicionar comparação legado vs branch da cotação do bot (`/api/bot-actions/quote`) e do endpoint de preço usado pelo site público com integração desligada.

4) REGRAS AGENTS.md:
   - Executar EXCLUSIVAMENTE este arquivo de teste pontual; proibições de testes em lote e de silenciar notificações permanecem ativas.

Repasse imediatamente ao `worker_m2`. Antes de iniciar o gate, envie as linhas alteradas e a confirmação para validação.

## 2026-10-13T23:22:08Z

REVISÃO DE AJUSTES FINAIS PARA tests/wbp-integration/m2-availability-pricing.test.mjs (Mandatório antes do gate de M2):

1) P1–P4 (linhas 789–836):
   - Os overrides foram gravados no arquivo DEPOIS do spawn; como o demo-server mantém estado em memória, os servidores estavam comparando sem overrides.
   - CORREÇÃO: Injetar os overrides na cópia ANTES do spawn (ou via API nos dois) e ASSERTAR explicitamente que o override foi aplicado e reflete o valor correto (ex: flat 1 em 2026-11-18 direct = 399.00 nos dois) provando que o teste não é vácuo.

2) DUAS CÓPIAS DE BANCO ISOLADAS:
   - Evitar arquivo de DB único compartilhado pelos dois processos (condição de corrida com debounce).
   - Usar DUAS cópias temporárias idênticas em os.tmpdir() (uma para o legado, outra para o ativo) e removê-las no after.

3) ORDEM DE EXECUÇÃO E RESERVA:
   - A criação de reserva (POST /api/pms/reservations na linha 685) ocorre só no servidor ativo antes das comparações, gerando divergência de estado para availability/quote.
   - Mover esse teste para DEPOIS das comparações ou usar instância isolada.
   - Garantir que as comparações de availability/quote cubram também datas com reservas existentes na base inicial.

Repasse ao worker_m2, execute exclusivamente este arquivo de teste pontual e me reporte a contagem final de testes e a asserção do item 1.

## 2026-10-13T23:27:41Z

Ajustes validados com sucesso!
As asserções explícitas de P1–P4 (R$ 399,00 a R$ 499,00), o isolamento com as duas bases em os.tmpdir() e a preservação estrita do data/database.json atendem integralmente aos requisitos da revisão bloqueante.

Está AUTORIZADO o disparo do Portão de Qualidade do Marco 2 (Reviewers, Challengers e Forensic Auditor). Prossiga com o portão e reporte os veredictos.

## 2026-10-14T00:42:21Z

REVISÃO PREVENTIVA DE M3 (m3-ari-sync.test.mjs) — repassar aos revisores/challengers e worker_m3_wbp antes de fechar o Portão 3:

1) CRÍTICO (AGENTS.md — não disparar rotinas/notificações em testes): na linha 528 de `tests/wbp-integration/m3-ari-sync.test.mjs`, ANTES do `await import("../../artifacts/api-server/demo-server.mjs")`, falta definir `process.env.NODE_ENV = "test"` e `process.env.PORT = String(serverPort)`. Sem `NODE_ENV = "test"`, a linha 35811 do `demo-server.mjs` executa `startMonitoringEngine()` ao importar e abre um `httpServer` extra na porta padrão (3000) que não é fechado no `after()`. Definir `process.env.NODE_ENV = "test"` no topo do arquivo (e antes do import), usar `process.env.PORT = String(serverPort)` e fechar `serverModule.httpServer` no `after()`.

2) Asserção de integridade do `data/database.json` real (hash SHA-256 e mtime inalterados antes/depois), igual ao M2.

3) Critérios de aceite obrigatórios de M3 no teste contra o Simulador WBP real (`e2e/wbp-simulator`):
   - Verificar que o `ARIUpdate` gerado pelo `WbpAriSynchronizer` (tanto no full push quanto no incremental após criar/cancelar reserva via rota PMS) chega ao Simulador WBP em <= 10s e passa 100% na validação de schema (`wbpAPI.yaml`) do simulador.
   - Incluir no teste de `variationLimitPct` o caso explícito `variationLimitPct: 0` (confirmando que não é confundido silenciosamente e que respeita o fallback/validação documentada).

## 2026-10-14T01:38:53Z

DIRETIVA PREVENTIVA DE ARQUITETURA PARA O MARCO 4 (incorporar imediatamente no desenho dos Explorers e no Worker de M4):

1) ISOLAMENTO DE NOTIFICAÇÕES EM TESTES (CRÍTICO — AGENTS.md):
   - O M4 testa automações (WhatsApp, e-mail portaria/garagem, SERPRO, alertas ao gestor). Nos testes de M4 (`tests/wbp-integration/m4-*.test.mjs`), NENHUMA mensagem real pode sair para WhatsApp (Z-API), SMTP ou SERPRO, e o código de produção NÃO pode ter notificações silenciadas/comentadas (regra do AGENTS.md). Usar estritamente injeção/interceptador de transporte ou os mocks de sandbox (`e2e/sandbox/mock-zapi`, `mock-smtp`) + `NODE_ENV="test"`, `DATABASE_URL` removida, `DATA_FILE` em `os.tmpdir()` e asserção de hash/mtime do `data/database.json` real.

2) PAGAMENTO `PaymentCollect` vs REGRA LEGADA `pago_total` (R5):
   - O código legado do `demo-server.mjs` força `paymentStatus = "pago_total"` para `booking`/`airbnb`. Para reservas vindas da WBP:
     • `PaymentCollect = "Channel"` → pago pela OTA (`pago_total`), registrando o valor líquido a receber (`netAmount` / comissão descontada).
     • `PaymentCollect = "Property"` → pendente de cobrança no hotel (`pendente`), NÃO pode ser sobrescrito para `pago_total` pela regra legada, e gera alerta para a recepção cobrar no check-in.

3) HIGIENE DE CARTÕES JÁ NA INGESTÃO DE M4 / `storage.mjs` (R6):
   - O payload de reserva da WBP (`BookingCreate`/`GetBookingId`) pode trazer `Cards` (PAN e CVV). Garantir já na entrada (`storage.mjs` e `inbox.mjs`) que:
     • O CVV (`card_cvv`, `cvv`, `cvc`, `security_code`) é descartado IMEDIATAMENTE em memória antes de gravar qualquer arquivo (nem no `wbp_storage_state.json`, nem no blob `db`, nem em logs).
     • O número completo do cartão (PAN) NUNCA entra em `db.reservations`, `wbpInbox`, `quarantineBookings`, `audit_logs.jsonl` ou `console.log` (guardar no registro da reserva apenas máscara/last4 + referência ao cofre criptografado que será completado no M5).

4) TRANSIÇÃO / DEDUPLICAÇÃO SEGURA (R5):
   - Reservas manuais existentes de Booking/Airbnb que casem com segurança (mesmo canal, mesmas datas, nome compatível) são apenas VINCULADAS (`externalOrderId` / metadado WBP), sem duplicar e sem alterar flat/preço/status da reserva manual. Casos duvidosos (ex.: datas parciais ou nome divergente) vão para a Quarentena. Incluir o gerador do Relatório de Conciliação Inicial.

Esta diretriz foi gravada em ORIGINAL_REQUEST.md. Por favor repasse aos Explorers e Worker do Marco 4.

## 2026-10-14T02:03:37Z

AJUSTES PONTUAIS EM `artifacts/api-server/wbp/alerts.mjs` (detectados na leitura imediata do arquivo, aplicar já no `worker_m4_wbp` e espelhar em `scripts/wbp/alerts.mjs`):

1) Respeito estrito ao interruptor geral (`off` / `observe`) e `NODE_ENV === "test"`:
   - Em `startDailySummaryScheduler(db)`: se a integração estiver `off`, NÃO registrar `setInterval` (critério de aceite: "Com o interruptor geral desligado... nenhum timer da integração é registrado"). No callback do timer, checar se está habilitada (`auto`).
   - No modo `observe` ou `off`, NENHUM envio externo (WhatsApp/e-mail) pode disparar (critério de aceite: "No modo somente observar... mocks de WhatsApp, e-mail e SERPRO com contador = 0").
   - Nas linhas 131 e 152 (`global.sendZapiMessage` / `global.sendEmailAsync`), nunca chamar o sender global se `process.env.NODE_ENV === "test"` (em teste só usar `this.zapiSender` / `this.emailSender` injetados).

2) `sendPricingLockAlert` (linha 312 — R8):
   - R8 exige WhatsApp e e-mail ao gestor nos 4 eventos críticos (quarentena, overbooking, falha ARI > 15 min e preço retido pela trava). Hoje `sendPricingLockAlert` envia só WhatsApp; adicionar envio de e-mail quando `settings.channels.email && settings.recipients.managerEmail`.

3) Toggle `triggers.onOverbooking` (linha 195):
   - Em `sendImmediateQuarantineAlert`, quando `reason === "OVERBOOKING"`, respeitar `settings.triggers.onOverbooking` (e `settings.triggers.onQuarantine` para os demais motivos), para que a caixa de seleção `onOverbooking` funcione de forma independente.

4) Resumo diário (linha 392 — R8):
   - R8 pede "reservas recebidas, canceladas e pendências". Incluir no cálculo e no texto de `dispatchDailySummaryAlert` a contagem de reservas OTA canceladas nas últimas 24h (`cancelled24h`).

Esta diretriz foi gravada em ORIGINAL_REQUEST.md. Por favor repasse ao worker_m4_wbp para incorporação imediata no código e no espelho de scripts.

## 2026-10-14T02:05:24Z

AJUSTES PONTUAIS EM `artifacts/api-server/wbp/reconciler.mjs` (detectados na leitura imediata do arquivo, aplicar já no `worker_m4_wbp` e espelhar em `scripts/wbp/reconciler.mjs`):

1) Condição de `isSafeMatch` (linhas 226 e 273 — R5):
   - R5 exige "mesmo canal, mesmas datas, nome semelhante" para vínculo seguro; qualquer divergência de data ou canal é dúvida e deve ir para a Quarentena.
   - Problema A: hoje, se apenas 1 data coincidir (15 pts) + canal (20) + nome (30) + telefone (15) + preço (5) = 85 pts >= 80 → classificaria como `isSafeMatch = true` com datas diferentes!
   - Problema B: hoje, se canal (20) + datas exatas (30) + nome com similaridade 0.85..0.94 (25 pts) e sem telefone/preço digitado no PMS = 75 pts < 80 → cairia em ambíguo apesar do comentário da linha 272 dizer "If dates match exactly and name similarity >= 85% and same channel -> safe match".
   - Correção: `isSafeMatch` DEVE exigir obrigatoriamente `exactChannelMatch && exactDateMatch && nameSim >= 0.85` (e ajustar o score para >= 80 nesse caso); se `score >= 50` mas `!exactChannelMatch || !exactDateMatch`, classificar sempre como `isAmbiguous = true` (`isSafeMatch = false`) para ir à Quarentena.

2) Preservação estrita no vínculo (`applySafeReconciliationLink`, linha 353):
   - Critério de aceite: "Uma reserva manual pré-existente compatível é vinculada, não duplicada, e permanece inalterada, exceto pelo vínculo (teste)".
   - Não sobrescrever campos existentes da reserva manual (guardar os metadados do vínculo apenas em `externalOrderId`, `wbpBookingId`, `wbpSynced`, `wbpMatchedAt` / `wbpLinkMeta`).

Esta diretriz foi gravada em ORIGINAL_REQUEST.md. Por favor repasse ao worker_m4_wbp para incorporação imediata no código e no espelho de scripts.

## 2026-10-14T02:10:59Z

AJUSTES CRÍTICOS EM `artifacts/api-server/wbp/inbox.mjs` (detectados na leitura imediata do arquivo, aplicar já no `worker_m4_wbp` e espelhar em `scripts/wbp/inbox.mjs`):

1) Vazamento de PAN em `normalizeOtaBooking` / `stripCvvDeep` (linhas 50 e 108 — R6):
   - `stripCvvDeep` remove o CVV, mas mantém `CardNumber`/`cardNumber`/`pan` em claro dentro de `sanitized`, que vai para `normalized.rawPayload` e é salvo em `db.wbpInbox` (linhas 739 e 825)!
   - Correção: em `stripCvvDeep` (ou `normalizeOtaBooking`), mascarar também qualquer campo `CardNumber` / `card_number` / `cardNumber` / `pan` no objeto `sanitized` (usando `maskPan`) DEPOIS de extrair `cardLast4` e `cardBrand`, garantindo ZERO PAN completo em `normalized.rawPayload` e em `db.wbpInbox`.

2) Gravação de `netAmount` e `commissionAmount` em `newReservation` (linha 765 — R5):
   - R5 exige: "`PaymentCollect=Channel`: pago pela OTA, com o valor líquido a receber registrado".
   - `normalizeOtaBooking` já calcula `normalized.netAmount` e `normalized.commissionAmount`, mas `newReservation` (linha 765) esqueceu de incluí-los! Adicionar `netAmount: normalized.netAmount`, `commissionAmount: normalized.commissionAmount`, `cardLast4: normalized.cardLast4`, `cardBrand: normalized.cardBrand` no objeto `newReservation`.

3) Guarda de cancelamento em `handleOtaCancellation` (linhas 450–455 — R5):
   - Critério de aceite: "O cancelamento libera o flat e reenvia o ARI. Com check-in feito, vai para a quarentena (teste)".
   - Na linha 453, `isPastCheckinTimeToday` bloqueia cancelamento mesmo quando `status === "ativa"` (sem check-in feito) se a data for hoje/passada. Remover `isPastCheckinTimeToday` da condição de bloqueio e bloquear estritamente quando o check-in estiver feito (`existing.status === "checked_in" || existing.status === "hospedado" || existing.status === "checkin_realizado" || existing.checkedIn === true || Boolean(existing.checkedInAt)`).

4) Histórico estruturado "antes e depois" em `handleOtaModification` (linhas 545–601 — R5):
   - Critério de aceite: "e o histórico contém o 'antes e depois' (teste)".
   - Ao aplicar modificação (mesmo flat ou realocada), capturar `before = { flatId: existing.flatId, flatNumber: existing.flatNumber, checkinDate: oldCheckin, checkoutDate: oldCheckout, totalAmount: existing.totalAmount, breakfastIncluded: existing.breakfastIncluded, guestCount: existing.guestCount }` e `after = { ... }` e gravar `before` e `after` tanto no item de `existing.auditLogs` quanto em `existing.history` / `existing.modificationHistory`.

5) Automações completas no modo `auto` (linhas 830–857 — R5):
   - Critério de aceite: "Reserva sem conflito no modo automático: flat alocado, café conforme o plano, ID externo gravado, PaymentCollect mapeado corretamente, automações disparadas (exceto PIX) (teste)".
   - Em `processIncomingOTA` (modo `auto`, e NUNCA em `observe`): além de `cleaningRequests` (governança) e café (`breakfastIncluded`), disparar sempre no modo `auto`:
     • WhatsApp de boas-vindas (via `alertsManager.sendWhatsApp` para `normalized.guestPhone`, sem PIX);
     • E-mail de portaria/recepção (via `alertsManager.sendEmail`, independentemente de `checkinDate === todayStr`);
     • Registro de fila/evento SERPRO/FNRH (ex.: `db.serproQueue.push(...)` + `newReservation.fnrhStatus = "enviado"` ou hook em `alertsManager`), mantendo `pixTxId: null` e `pixCopiaECola: null`.

Esta diretriz foi gravada em ORIGINAL_REQUEST.md. Por favor repasse ao worker_m4_wbp para incorporação imediata no código e no espelho de scripts.

## 2026-10-14T02:21:53Z

DETALHE IMPORTANTE EM `artifacts/api-server/wbp/inbox.mjs` (linhas 508, 619, 685 e 977) e `ari-sync.mjs`:

1. **Remoção de guarda `NODE_ENV !== "test"` em `notifyPmsMutation`**:
   - O worker colocou `if (process.env.NODE_ENV !== "test")` em volta de `notifyPmsMutation(...)` em `handleOtaCancellation`, `handleOtaModification` e `processIncomingOTA`.
   - Problema: Todos os testes rodam com `NODE_ENV === "test"`, e o critério de aceite exige provar em teste que **"O cancelamento libera o flat e reenvia o ARI"** (e também na criação/modificação). Com `if (process.env.NODE_ENV !== "test")`, o `notifyPmsMutation` fica silenciado nos testes (o que também fere a regra do `AGENTS.md` de não mascarar/silenciar comportamento via guardas `NODE_ENV !== "test"`).
   - Solução obrigatória: Remover o `if (process.env.NODE_ENV !== "test")` das chamadas a `notifyPmsMutation` em `inbox.mjs` para que `notifyPmsMutation` SEMPRE seja chamado no modo `auto`.

2. **Timers Debounce com `.unref()` em `ari-sync.mjs`**:
   - Para que o processo do `node --test` nunca fique preso esperando timer pendente ao encerrar, chamar explicitamente `.unref()` nos timers de debounce em `ari-sync.mjs`:
     ```javascript
     if (this.debounceTimer?.unref) this.debounceTimer.unref();
     if (this.maxWaitTimer?.unref) this.maxWaitTimer.unref();
     ```

3. **Paridade Gêmea Obrigatória**:
   - Replicar e sincronizar as alterações byte-a-byte em `scripts/wbp/inbox.mjs` e `scripts/wbp/ari-sync.mjs` garantindo 100% de paridade SHA-256.

A diretriz foi gravada em `ORIGINAL_REQUEST.md`. Por favor, repasse imediatamente ao `worker_m4_wbp` para aplicação e execução dos testes pontuais.

## 2026-10-14T02:42:05Z

HIGIENE DO REPOSITÓRIO ANTES DO COMMIT DE M4 (`audit_logs.jsonl`):

Detectou-se no `git status` que `artifacts/api-server/audit_logs.jsonl` recebeu linhas de teste (`Pre Hóspede 3`, `RES-503`, etc.) durante os testes do Challenger 2, devido ao caminho fixo na linha ~6869 do `demo-server.mjs`:
`const AUDIT_LOG_FILE = path.join(__dirname, "audit_logs.jsonl");`

Ações obrigatórias antes do commit de M4:
1. Restaurar `artifacts/api-server/audit_logs.jsonl` (`git checkout -- artifacts/api-server/audit_logs.jsonl`) para limpar as linhas sintéticas e preservar exclusivamente os logs reais já commitados em `13d5043`.
2. Na linha ~6869 de `artifacts/api-server/demo-server.mjs` (e no espelho em `scripts/demo-server.mjs`), isolar o `AUDIT_LOG_FILE` em testes:
   ```javascript
   const AUDIT_LOG_FILE = process.env.AUDIT_LOG_FILE || (process.env.NODE_ENV === "test" && process.env.DATA_FILE ? path.join(path.dirname(process.env.DATA_FILE), "audit_logs.jsonl") : path.join(__dirname, "audit_logs.jsonl"));
   ```
   Dessa forma, qualquer teste com `NODE_ENV === "test"` e `DATA_FILE` em `os.tmpdir()` grava `audit_logs.jsonl` no diretório temporário, garantindo isolamento total e zero poluição no repositório.
3. Manter 100% de paridade SHA-256 entre os gêmeos de `demo-server.mjs`.

A diretriz foi registrada em `ORIGINAL_REQUEST.md`. Por favor, execute ou repasse imediatamente ao `worker_m4_wbp` antes de consolidar o commit de M4.

## 2026-10-14T03:34:19Z

DIRETIVA PREVENTIVA DE ARQUITETURA PARA O MARCO 5:

Incorporar obrigatoriamente nos Explorers, Workers e Testers do Marco 5 (Features F25 a F31):

1. **Cofre de Cartões Criptografado (F25 & F26 — R6)**:
   - Integrar `CreditCardVault` (AES-256-GCM com chave em variável de ambiente, nunca no blob do banco) no fluxo de entrada (`callbacks.mjs` / `inbox.mjs`).
   - Capturar o cartão, descartar o CVV em memória imediatamente e criptografar no cofre ANTES do mascaramento do PAN no payload.
   - Provar em teste que varredura por PAN completo e CVV no banco, `wbp_storage_state.json`, logs, `audit_logs.jsonl` e listagens da API retorna **ZERO ocorrências**.
   - Token de visualização: exige admin + redigitação de senha → gera token de **uso único** (invalidado após 1 leitura!) e **validade de 5 minutos**, gravando auditoria. **Não alterar o login atual dos demais usuários.**
   - Auto-purge: expurgar cartões **7 dias após check-out** e **imediatamente no cancelamento sem multa** (testar ambos com avanço de data/tempo).

2. **Adaptadores Provisórios de Mensagens e Avaliações (F27 — R7)**:
   - `GetMessages`/`SendMessage` (integrado ao chat existente) e `GetReviews`/`RespondReview` (integrado ao Review Insights existente) isolados atrás de adaptador, **desligados por padrão**, marcados como provisórios e testados contra o simulador WBP.

3. **Telas de UI Fiéis aos Mockups Aprovados (F28 & F29 — R4, R5)**:
   - Precificação SEBRAE: seguir layout de `mockup_precificacao_1791928509939.jpg` com números corrigidos (**Custo UH R$ 149,38 → Tarifa Mínima R$ 276,63** e 100% de decomposição), modal/painel Pré-visualização & Publicar (`mockup_previsualizacao_v2_1791928602700.jpg`), Orçamento Anual, Indicadores por Canal, Mapeamento Quartos/Planos e 7 Restrições.
   - Caixa de Entrada OTA e Quarentena: seguir `mockup_caixa_entrada_ota_1791928543273.jpg` (sem linhas duplicadas), abas, filtros, gaveta de resolução, conciliação e visualização segura com modal de senha admin.

4. **Página de Ajuda / Manual Humano em Português com Capturas Reais (F30 — R9)**:
   - Entregue **apenas como página de ajuda dentro do sistema**, rica e didática em português:
     - *Admin:* obtenção de credenciais WBP (`cid`, `shared_secret`), mapeamento, modos (`off`, `observe`, `auto`), sandbox, conciliação inicial, precificação SEBRAE e travas, cofre de cartões, alertas e tabela de solução de problemas por código de erro (`4`, `1001`, `1002`, `1003`, `1031`, `1102`, `9203`).
     - *Recepção:* rotina diária, Caixa de Entrada e Quarentena, resolução de conflitos, cobrança `PaymentCollect=Property` vs `Channel`.
     - *Capturas de tela reais* das telas construídas servidas em `public/` ou embutidas na ajuda.

5. **Build & Paridade (F31 — R10)**:
   - Rodar `npm run build` em `artifacts/limpeza` e incluir `artifacts/limpeza/dist/` no commit.
   - Manter paridade SHA-256 em 100% dos arquivos gêmeos de `artifacts/api-server/` e `scripts/`.

## 2026-10-14T04:12:01Z

DIRETIVA PRIORITÁRIA DO SENTINEL / PARENT — AJUSTES PREVENTIVOS EM `artifacts/api-server/wbp/vault.mjs` E INTEGRAÇÃO COM `callbacks.mjs` / `inbox.mjs` (aplicar já no `worker_m5_backend` e espelhar em `scripts/wbp/`):

1) Segurança de boot em Produção sem variável configurada (`vault.mjs`, linha 140):
   - Hoje `_resolveKey()` é chamado no construtor `new CreditCardVault()` e lança `Error("Vault key missing...")` se `NODE_ENV !== "test"` e `CREDIT_CARD_VAULT_KEY` não estiver definida.
   - Risco crítico: quando o código subir para o Render com a integração desligada por padrão (antes de o usuário cadastrar `CREDIT_CARD_VAULT_KEY` no painel do Render), qualquer chamada a `getCardVault()` no startup derrubaria o servidor!
   - Correção: não lançar erro no construtor de `CreditCardVault`; se `CREDIT_CARD_VAULT_KEY` / `WBP_VAULT_KEY` não estiver definida, usar uma chave derivada local de fallback (com `console.warn` apenas quando tentar criptografar em produção), garantindo que o servidor sempre suba com segurança.

2) Guarda do interruptor geral em `startCardAutoPurgeScheduler` (`vault.mjs`, linha 607):
   - Se a integração estiver `off` (`!isWbpEnabled(db)`), `startCardAutoPurgeScheduler` NÃO deve registrar `setInterval` (critério de aceite: zero timers registrados com o interruptor geral desligado).

3) Fiação automática do Cofre na entrada e no cancelamento (`callbacks.mjs` e `inbox.mjs`):
   - Na entrada da reserva (`BookingCreate`, `NotifyBooking`/`GetBookingId`, `processIncomingOTA`): antes de mascarar o PAN, extrair o cartão (já sem CVV!) e gravar no cofre via `getCardVault().storeCard({ orderId, cardData, checkoutDate })`, vinculando `reservationId` e `checkoutDate` ao criar a reserva (`linkReservation`).
   - Em `handleOtaCancellation` (`inbox.mjs`): ao cancelar a reserva (sem multa), chamar automaticamente `getCardVault().purgeCard(normalized.externalOrderId, "cancelled_without_penalty", db)` para cumprir o critério de exclusão imediata no cancelamento sem multa.

## 2026-10-14T04:15:56Z

DIRETIVA PRIORITÁRIA DO SENTINEL / PARENT — REFINAMENTO DO MANUAL OPERACIONAL EM `WbpHelpManualPage.tsx` (Critério Estrito de Aceite R9 para aprovação em auditoria independente):

Repasse imediatamente ao `worker_m5_frontend` antes da execução final do `npm run build`:

1. **Capturas de Tela Reais (tags `<img>`) em `WbpHelpManualPage.tsx`:**
   - Na Seção 4 (`value="screens"`), adicionar elementos visuais reais `<img>` apontando para `/manual/...` (copiar as imagens dos mockups aprovados ou capturas reais para `artifacts/limpeza/public/manual/`, ex: `precificacao-sebrae.jpg`, `previsualizacao-publicar.jpg`, `caixa-entrada-ota.jpg`).
   - Usar `<img src="/manual/..." alt="..." className="w-full rounded-xl border border-border shadow-sm" />` dentro dos cards para garantir que as telas sejam exibidas visualmente na página interna do sistema.

2. **Completude Explícita de Todos os Subtópicos de Administrador (R9) na Seção 1 (`value="admin"`):**
   - **1.1 (Credenciais):** incluir URL oficial de parceria (`https://www.webbookingpro.com/become-a-partner/`), credenciamento de conta de teste (`cid`, `shared_secret`), alinhamentos quinzenais de status, certificação e orientações de teste no simulador/sandbox local (`e2e/wbp-simulator`).
   - **Adicionar 1.6. Conciliação Inicial e Checklist de Entrada em Produção (Go-Live):** guia prático de execução do relatório de conciliação inicial (`/api/wbp/reconciliation-report`) antes de ativar `auto`, vinculação segura de reservas manuais existentes (`channel` + `checkIn`/`checkOut` + similaridade de nome >= 80%) sem duplicar nem alterar, envio de casos ambíguos para quarentena, validação prévia em modo `observe` e disparo da carga completa de ARI inicial (até 31/dez do ano seguinte).
   - **Adicionar 1.7. Configuração de Alertas Críticos e Resumo Diário (08:00):** documentar o badge de notificação no sistema, alertas de WhatsApp/e-mail para a gerência nos 4 eventos críticos (reserva em quarentena, overbooking, falha de envio de ARI > 15 min, preço retido pela trava de variação), resumo diário matinal às 08:00 (recebidas, canceladas, pendentes) e checkboxes de opt-in/opt-out por canal e evento.
   - **Adicionar 1.8. Mensagens e Avaliações (Adaptador Provisório):** explicitar que `GetMessages`/`SendMessage` e `GetReviews`/`RespondReview` estão isolados em adaptador provisório, desligados por padrão até a homologação da especificação final pela WebBookingPro.
   - **Seção 2 (Códigos de Erro):** incluir os códigos `1004` (Invalid rate plan / room mapping) e `1100` / `1101` (Invalid date range / past date) de `docs/wbp/README.md` na tabela de solução de problemas.


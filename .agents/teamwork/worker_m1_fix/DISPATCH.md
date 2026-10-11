## 2026-10-11T01:28:08Z
Você é o Worker de Remediação do Milestone M1 do CorpFlats.
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1_fix
O arquivo de requisitos originais autoritativo é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
O patch e relatório do Remedy Explorer 1 são:
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_remedy_1\handoff.md
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_remedy_1\remedy.patch
O relatório do Remedy Explorer 2 é:
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_remedy_2\handoff.md
O relatório do Remedy Explorer 3 é:
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_remedy_3\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Arquivos de sua propriedade exclusiva:
- `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` (manter 100% de paridade byte-a-byte idêntica)
- `data/database.json`
- `tests/tariff-engine.test.mjs`
- `tests/bot-actions-api.test.mjs`
- `tests/challenger-m1-adversarial.test.mjs`
- `tests/challenger-edge-probes.test.mjs`
- `tests/challenger-tariff-stress.test.mjs`

Missão de Implementação da Remediação:
1. Concorrência e Race Condition em `POST /api/bot-actions/pre-reserve`:
   - Aplicar inserção atômica provisória síncrona na coleção de reservas antes de qualquer yield assíncrono (`await QRCode.toDataURL(pixPayload)`), com rollback caso ocorra erro no QR.
2. Ciclo de vida e regras de pré-reserva:
   - Pré-reservas com `paymentStatus === "pago_total"` mantêm bloqueio mesmo após `expiresAt` (não podem ser descartadas como disponíveis).
   - `POST /api/bot-actions/commit-reservation`: se a reserva estiver com status `"expirada"`, rejeitar com 400 PRE_RESERVATION_EXPIRED ou revalidar conflito com reservas existentes antes de reativar.
   - Hold configurável: ler `db.botActionsSettings.preReservationHoldMinutes || 30` (em milissegundos: `holdMinutes * 60 * 1000`).
3. Calendário e bulk-update:
   - `GET /api/tariffs/calendar` sem `flatId`: considerar apenas overrides globais onde `flatId` é nulo/vazio/"all", nunca overrides específicos de flats individuais.
   - Normalizar comparação de canais em `calendar` com `.toLowerCase()`.
   - Em `POST /api/tariffs/bulk-update`: converter `daysOfWeek` com `.map(Number)` para aceitar strings numéricas.
4. Validação Completa de Testes:
   - Executar:
     `node --test tests/tariff-engine.test.mjs`
     `node --test tests/bot-actions-api.test.mjs`
     `node --test tests/challenger-m1-adversarial.test.mjs`
     `node --test tests/challenger-edge-probes.test.mjs`
     `node --test tests/challenger-tariff-stress.test.mjs`
   - Todos os testes devem passar com 100% de sucesso.
5. Twin-Server Parity Mandate:
   - Copiar `artifacts/api-server/demo-server.mjs` para `scripts/demo-server.mjs` e validar que os hashes SHA-256 são rigorosamente idênticos.
6. Git commit e push para `origin main` conforme diretrizes do repositório.

Ao concluir com 100% dos testes aprovados e paridade idêntica, escreva seu relatório de handoff em:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1_fix\handoff.md
E envie mensagem com o resumo para o orchestrator (3364a657-c855-42a7-a46e-a5463bc245b7).

## 2026-10-07T17:13:01Z

You are teamwork_preview_worker (Worker M4 Final Acceptance & Deployer).
Your working directory: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/worker_m4_final
Parent conversation ID: 0a1ba31b-b6bc-466b-8394-2ba72ae85fb5

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY: Read the authoritative request at:
c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md (specifically the latest entry from 2026-10-07T15:33:29Z).

Read:
- Project Plan: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/orchestrator_2/PROJECT.md

YOUR MISSION (FINAL E2E ACCEPTANCE, BUILD & GIT SYNC):
1. Write and run the authoritative test suite in `tests/fnrh-checkin-toggle.test.mjs` validating all 4 acceptance criteria points:
   - AC 1 (Alternância e Persistência): Toggle no painel/API de configurações alterna entre 'proprio' e 'gov_fnrh' com persistência imediata no banco de dados e resposta JSON confirmando o estado. A alteração reflete instantaneamente em rotas subsequentes sem reiniciar o servidor.
   - AC 2 (Geração de Links Dinâmicos): No modo 'proprio', `getCheckinUrl` retorna URL contendo `/pre-checkin/:code`. No modo 'gov_fnrh' com reserva registrada no SERPRO, retorna a URL oficial do Gov.br (`https://fnrh.turismo.gov.br/precheckin/...`). Em caso de falha simulada ou timeout (>5s) da API SERPRO, `getCheckinUrl` aplica o fallback sem lançar exceção, retornando a URL própria, gravando log de auditoria `FNRH_SERPRO_FALLBACK` e alerta na recepção.
   - AC 3 (Canais de Comunicação): Disparos de WhatsApp (mensagens e botões de ação) e e-mails enviam o link correto conforme a chave ativa e fallback.
   - AC 4 (Ações de Interface): Copiar Link no painel copia a URL condizente com a chave ativa.
2. Execute the test suite:
   `node --test tests/fnrh-checkin-toggle.test.mjs`
   and run the full test battery:
   `node --test tests/m1-backend-serpro-verification.test.mjs tests/m2-messaging-checkin-url.test.mjs tests/challenger-m1-adversarial.test.mjs tests/challenger-m1-2-serpro-integrity.test.mjs tests/service-orders.test.mjs`
   Ensure all tests pass 100%.
3. Verify byte-for-byte twin parity for all mirrored pairs:
   - `artifacts/api-server/demo-server.mjs` == `scripts/demo-server.mjs`
   - `artifacts/api-server/fnrh-serpro-service.mjs` == `scripts/fnrh-serpro-service.mjs`
   - `artifacts/api-server/zapi-service.mjs` == `scripts/zapi-service.mjs`
   - `artifacts/api-server/mail-service.mjs` == `scripts/mail-service.mjs`
   - `artifacts/api-server/whatsapp-ai-service.mjs` == `scripts/whatsapp-ai-service.mjs`
4. Confirm frontend build:
   - Ensure `artifacts/limpeza/dist/public` is built and up-to-date (if needed, run `npm run build` in `artifacts/limpeza`).
5. Execute Git commit & push (USER RULE / AGENTS.md):
   - Stage modified files (including `artifacts/limpeza/dist/`).
   - Run `git commit -m "feat(fnrh): global dynamic check-in provider toggle Gov.br SERPRO vs CorpFlats"`
   - Run `git push origin main` (or active branch).
   - Document commit hash and push output.
6. Write your comprehensive report and `handoff.md` in your working directory.
7. Send a message to parent (0a1ba31b-b6bc-466b-8394-2ba72ae85fb5) when complete.

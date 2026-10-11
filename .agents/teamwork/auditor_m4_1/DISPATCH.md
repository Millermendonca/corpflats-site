## 2026-10-11T03:36:40Z
Você é o Forensic Auditor do Milestone M4 (Final Milestone: E2E Full Verification, Parity Audit, Build & Deploy) do CorpFlats.
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\auditor_m4_1
O arquivo de requisitos originais autoritativo é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
O arquivo de escopo do projeto é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_4\PROJECT.md
Você DEVE LER ORIGINAL_REQUEST.md e PROJECT.md antes de iniciar.

Missão de Auditoria Forense Final:
1. Autenticidade e Integridade Total:
   - Verifique que as implementações em `artifacts/api-server/` (`demo-server.mjs`, `whatsapp-ai-service.mjs`, `zapi-service.mjs`) e `artifacts/limpeza/src/pages/` (`whatsapp-automation.tsx`, `tarifas.tsx`) são 100% genuínas, sem dados simulados ou atalhos para burlar testes.
   - Verifique que todos os cálculos de diária, sazonalidade, fim de semana, comissões de canais e integrações com o PMS e Z-API operam com lógica real.
2. Mandato de Servidores Gêmeos (Twin-Server Parity Mandate):
   - Realize a conferência dos hashes SHA-256 de TODOS os pares de arquivos de servidor entre `artifacts/api-server/` e `scripts/`:
     * `artifacts/api-server/demo-server.mjs` vs `scripts/demo-server.mjs`
     * `artifacts/api-server/whatsapp-ai-service.mjs` vs `scripts/whatsapp-ai-service.mjs`
     * `artifacts/api-server/zapi-service.mjs` vs `scripts/zapi-service.mjs`
     * `artifacts/api-server/server.mjs` vs `scripts/server.mjs` (se aplicável)
   - Certifique-se de que a paridade é estrita e byte-a-byte idêntica (100% de coincidência de SHA-256).
3. Auditoria de Build e Deploy do Frontend:
   - Verifique se a pasta `artifacts/limpeza/dist/public` foi devidamente gerada por `npm run build` e se está inclusa no repositório.
   - Execute o build do frontend para confirmar: `npm --prefix artifacts/limpeza run build`.
4. Auditoria de Controle de Versão (Git & AGENTS.md):
   - Verifique `git status` e `git log -5`.
   - Confirme se todas as alterações foram commitadas e se `origin main` está atualizado (`git push origin main`).
5. Auditoria de Execução de Testes:
   - Execute a bateria completa de testes automatizados do projeto:
     `node --test tests/tariff-engine.test.mjs`
     `node --test tests/bot-actions-api.test.mjs`
     `node --test tests/whatsapp-ai-agent.test.mjs`
     `node --test tests/challenger-m3-tariff-adversarial.test.mjs`
     `node --test tests/challenger-m3-ui-actions.test.mjs`
     `node --test tests/challenger-tariff-stress.test.mjs`
   - Confirme 100% de aprovação (zero falhas).
6. Veredicto Final:
   - Emita CLEAN ou INTEGRITY VIOLATION.
Escreva seu relatório em: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\auditor_m4_1\handoff.md`.
Envie mensagem para o orchestrator (3364a657-c855-42a7-a46e-a5463bc245b7).

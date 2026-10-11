## 2026-10-11T03:17:20Z
Você é o Worker de Remediação do Milestone M3 do CorpFlats.
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3_fix
O relatório com o apontamento exato e a prova de conceito do Challenger 2 é:
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m3_2\handoff.md
O arquivo de requisitos originais autoritativo é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
O arquivo de escopo do projeto é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_4\PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Arquivos de sua propriedade exclusiva:
- `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` (manter rigorosamente 100% de paridade byte-a-byte idêntica)
- `artifacts/limpeza/src/pages/tarifas.tsx`
- `artifacts/limpeza/dist/` (gerado pelo build)

Missão de Remediação:
1. Correção do Contrato de API em `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`:
   Na rota `app.get("/api/tariffs/calendar", (req, res) => { ... })` (por volta da linha 20474):
   Adicione a propriedade `overrides: getTariffOverrides()` na resposta JSON:
   ```javascript
   res.json({
     success: true,
     month: targetMonthStr,
     channel,
     flatId: flatId || null,
     settings: getTariffSettings(),
     days,
     flats,
     overrides: getTariffOverrides()
   });
   ```
2. Paridade Estrita dos Servidores Espelho (Twin-Server Parity Mandate):
   Copie `artifacts/api-server/demo-server.mjs` para `scripts/demo-server.mjs` e garanta que ambos tenham hash SHA-256 100% idêntico.
3. Validação Empírica:
   - Execute `node tests/test-empirical-calendar-payload.mjs` e confirme que `Does calData have 'overrides' key? true`, `UI hasFlatOverride: true` e `UI effectiveRate: 650`.
   - Execute `node --test tests/challenger-m3-tariff-adversarial.test.mjs` e garanta que todos os testes passem.
   - Execute todas as suítes de testes:
     `node --test tests/tariff-engine.test.mjs`
     `node --test tests/bot-actions-api.test.mjs`
     `node --test tests/whatsapp-ai-agent.test.mjs`
     `node --test tests/challenger-m3-ui-actions.test.mjs`
4. Build do Frontend:
   Execute `npm --prefix artifacts/limpeza run build` e certifique-se de que sai com código 0 gerando os arquivos em `artifacts/limpeza/dist/public/`.
5. Git Commit e Push:
   Faça commit com mensagem descritiva (incluindo `artifacts/limpeza/dist/`) e execute `git push origin main`.

Ao concluir e validar com 100% de sucesso, escreva seu relatório de handoff em:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3_fix\handoff.md`
E envie mensagem com o resumo para o orchestrator (3364a657-c855-42a7-a46e-a5463bc245b7).

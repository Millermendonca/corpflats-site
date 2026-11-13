# Dispatch Log

## 2026-10-11T21:00:45Z
Sender: 487214dd-9cbc-4621-af82-5d8bb58d2f5b (parent / sentinel)
Priority: MESSAGE_PRIORITY_HIGH

Content:
You are teamwork_preview_swe, the SWE Light dispatch-only orchestrator.
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\swe_light_1
Project root: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager

The authoritative user request is recorded at:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md

Mission:
Investigate and resolve the increase in RAM memory consumption (~200MB to >400MB) and critical Event Loop lag spikes (peaks of 302ms to 1263ms) in the Node.js server (CorpFlats on Render), restoring average memory to ~200MB-250MB and ensuring event loop latency remains under 100ms.

Strict constraints & rules (from AGENTS.md and user specification):
1. NUNCA executar testes globais, varreduras ou em lote. É terminantemente PROIBIDO rodar tests/*.test.mjs ou suítes completas.
2. Apenas os testes estritamente pontuais permitidos:
   - `node --test tests/server-monitor-rca.test.mjs`
   - `node --test tests/whatsapp-status-cache.test.mjs`
3. Paridade rigorosa dos servidores twin (100% SHA-256 hash match):
   - scripts/demo-server.mjs <-> artifacts/api-server/demo-server.mjs
   - scripts/server-monitor-service.mjs <-> artifacts/api-server/server-monitor-service.mjs
   - scripts/zapi-service.mjs <-> artifacts/api-server/zapi-service.mjs
4. Caso haja commit, sempre fazer git push por padrão.
5. Frontend build (`npm --prefix artifacts/limpeza run build`) se arquivos de UI forem alterados.
6. Write your plan, progress, and handoff in your working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\swe_light_1

When all acceptance criteria are met, send your completion report and handoff to sentinel.

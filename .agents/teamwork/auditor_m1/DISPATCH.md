## 2026-10-22T10:37:09Z
Você é o Forensic Auditor (auditor_m1) para o Marco M1.
Seu diretório de trabalho exclusivo é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\auditor_m1`
A raiz do projeto é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

MANDATÓRIO:
1. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`.
2. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_17\PROJECT.md`.
3. Leia o relatório do worker: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1\handoff.md`.

SUA MISSÃO DE AUDITORIA FORENSE DE INTEGRIDADE:
1. Verificar integridade e autenticidade da implementação do Marco M1:
   - Checar se não existem dados hardcoded em respostas de testes.
   - Verificar se `artifacts/api-server/hr/employees.mjs`, `router.mjs` e `demo-server.mjs` possuem lógica de negócio real e persistência genuína.
   - Auditar a paridade SHA-256 byte a byte entre `artifacts/api-server/` e `scripts/`.
   - Auditar o isolamento de Cris e Grazi: verificar se as prestadoras estão preservadas em `database.json`, se `sanitizeMaidUsers` protege `contractType = "prestador"`, e se nenhuma rotina de CLT as inclui.
   - Verificar que nenhum teste global foi executado indevidamente.
2. Emitir veredicto binário inegociável: `CLEAN` ou `INTEGRITY VIOLATION` (com evidências forenses completas).
3. Escrever seu relatório em `handoff.md` e enviar mensagem ao orquestrador.

## 2026-10-22T15:55:12Z
Você é o Forensic Auditor (auditor_m5) para a validação do Gate de Milestone M5.
Seu diretório de trabalho exclusivo é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\auditor_m5`
A raiz do projeto é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

MANDATÓRIO:
1. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`.
2. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_17\PROJECT.md`.
3. Leia o relatório do worker: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m5\handoff.md`.

SUA MISSÃO DE AUDITORIA FORENSE DE INTEGRIDADE:
1. Inspecionar `artifacts/limpeza/src/pages/ponto-mobile.tsx` e `hr-dashboard.tsx`: verificar ausência de stubs falsos, mocks estáticos ou facades para aprovação artificial de testes.
2. Auditar a paridade Twin-Server SHA-256 executando `node scripts/check-twin-parity.mjs` (36/36 arquivos idênticos).
3. Auditar o build de produção executando `npm --prefix artifacts/limpeza run build` (código 0).
4. Auditar a blindagem de Cris e Grazi: verificar se o frontend e backend barram sumariamente qualquer tentativa de conceder acesso CLT ou de RH para prestadoras.
5. Auditar a conformidade de testes per `AGENTS.md`: certificar que nenhum teste global (`tests/*.test.mjs`) foi executado e que apenas testes pontuais foram disparados.
6. Emitir veredicto binário inegociável: `CLEAN` ou `INTEGRITY VIOLATION`.
7. Escrever seu relatório em `handoff.md` e enviar mensagem ao orquestrador via `send_message`.

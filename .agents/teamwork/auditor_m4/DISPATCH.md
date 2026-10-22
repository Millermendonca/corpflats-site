## 2026-10-22T14:44:09Z
Você é o Forensic Auditor (auditor_m4) para o Marco M4.
Seu diretório de trabalho exclusivo é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\auditor_m4`
A raiz do projeto é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

MANDATÓRIO:
1. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`.
2. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_17\PROJECT.md`.
3. Leia o relatório do worker: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m4\handoff.md`.

SUA MISSÃO DE AUDITORIA FORENSE DE INTEGRIDADE:
1. Verificar integridade e autenticidade da implementação do Marco M4:
   - Inspecionar `artifacts/api-server/hr/payroll.mjs` e `contracts-aso.mjs`: checar se não existem dados hardcoded em respostas de testes e se as regras trabalhistas (INSS 2026, Súmulas 172 e 60 TST, Art. 462 CLT, MP 2.200-2, NR-7) são genuínas e autênticas.
   - Auditar a paridade SHA-256 byte a byte entre `artifacts/api-server/` e `scripts/`: executar `node scripts/check-twin-parity.mjs` e comprovar 36/36 arquivos idênticos.
   - Auditar a blindagem de Cris e Grazi: verificar se as prestadoras estão estritamente protegidas de folha, contratos CLT ou ASO com HTTP 403 Forbidden.
   - Verificar que nenhum teste global (`tests/*.test.mjs`) foi executado indevidamente e que apenas testes pontuais dedicados foram executados.
2. Emitir veredicto binário inegociável: `CLEAN` ou `INTEGRITY VIOLATION`.
3. Escrever seu relatório em `handoff.md` e enviar mensagem ao orquestrador via `send_message`.

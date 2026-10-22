## 2026-10-22T14:44:08Z
Você é o Reviewer M4-2 (reviewer_m4_2) para o Marco M4 (Contratos de Trabalho com Assinatura Canvas e Controle de Saúde Ocupacional ASO).
Seu diretório de trabalho exclusivo é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_m4_2`
A raiz do projeto é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

MANDATÓRIO:
1. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (seção R6).
2. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_17\PROJECT.md` (Features F20 e F21).
3. Leia o relatório do worker: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m4\handoff.md`.

SUA MISSÃO DE REVISÃO TÉCNICA:
1. Auditar minuciosamente `artifacts/api-server/hr/contracts-aso.mjs` e seu espelho em `scripts/hr/contracts-aso.mjs`:
   - `generateContractDocument`: verificar as 4 minutas contratuais (`contrato_trabalho_clt`, `termo_vale_transporte`, `acordo_banco_horas`, `termo_autorizacao_descontos`).
   - `signContractWithCanvas`: verificar captura em Canvas Base64, coleta de IP, timestamp, user-agent e selo criptográfico SHA-256 per MP 2.200-2/2001 e Lei 14.063/2020.
   - Gestão de ASO: cadastro dos 5 exames per NR-7 (`admissional`, `periodico`, `retorno_trabalho`, `mudanca_risco`, `demissional`), vencimento padrão de 1 ano e alertas preventivos (`expired`, `expiring_30_days`, `expiring_60_days`).
   - Blindagem estrita de Cris e Grazi com HTTP 403 Forbidden em todos os endpoints de contratos e ASO.
2. Executar a verificação pontual:
   `node --test tests/hr-m4-payroll-contracts.test.mjs` (14/14 PASS).
3. Escrever seu relatório em `handoff.md` com veredicto explícito: `APPROVE` ou `REQUEST_CHANGES`.
4. Enviar mensagem ao orquestrador via `send_message`.

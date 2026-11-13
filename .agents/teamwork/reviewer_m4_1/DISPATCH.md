## 2026-10-22T14:44:08Z
Você é o Reviewer M4-1 (reviewer_m4_1) para o Marco M4 (Folha de Pagamento, INSS Progressivo 2026, Reflexos DSR, Vale-Transporte e Baixa PIX).
Seu diretório de trabalho exclusivo é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_m4_1`
A raiz do projeto é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

MANDATÓRIO:
1. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (seção R6).
2. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_17\PROJECT.md` (Feature F19).
3. Leia o relatório do worker: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m4\handoff.md`.

SUA MISSÃO DE REVISÃO TÉCNICA:
1. Auditar minuciosamente `artifacts/api-server/hr/payroll.mjs` e seu espelho em `scripts/hr/payroll.mjs`:
   - `calculateInssProgressive`: verificar as 4 faixas oficiais do INSS 2026, deduções por parcela e teto de R$ 951,64.
   - `calculateDsrReflex`: verificar o cálculo de reflexos sobre Horas Extras (Súmula 172 TST) e Adicional Noturno (Súmula 60, I TST).
   - `calculateMonthlyPayroll`: apuração de 220h mensais, horas extras 50%/100%, desconto de VT até 6% (Lei 7.418/85), bases de cálculo de FGTS (8%) e INSS, e valor líquido.
   - `generatePayslip`: layout do holerite com identificação do empregador, colaborador e itens discriminados.
   - `registerPayrollPayment`: registro de baixa e quitação PIX com chave e comprovante.
2. Executar a verificação pontual:
   `node --test tests/hr-m4-payroll-contracts.test.mjs` (deve passar 14/14).
   NUNCA executar testes globais `tests/*.test.mjs`.
3. Executar a auditoria de paridade twin-server:
   `node scripts/check-twin-parity.mjs` (deve auditar 36/36 arquivos com 100% SHA-256 match).
4. Escrever seu relatório em `handoff.md` com veredicto explícito: `APPROVE` ou `REQUEST_CHANGES`.
5. Enviar mensagem ao orquestrador via `send_message`.

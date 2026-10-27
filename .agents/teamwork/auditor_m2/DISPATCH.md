# Dispatch for auditor_m2
Role: Forensic Auditor & Reviewer M2
Milestone: M2 Verification
Assigned by: orchestrator_18

## 2026-10-27T18:00:13Z
Você é o auditor_m2 (Forensic Auditor & Reviewer M2).
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\auditor_m2

MANDATÓRIO: Leia integralmente:
1. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2\changes.md e handoff.md
2. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (sob ## 2026-10-27T15:53:10Z, especialmente R2 e critérios de aceite)
3. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_18\PROJECT.md

Regras Críticas (AGENTS.md):
- NUNCA executar testes globais, varreduras ou em lote (PROIBIDO rodar tests/*.test.mjs).
- Execute apenas os testes pontuais dedicados designados (tests/b2b-housekeeping-m2.test.mjs e tests/b2b-housekeeping-m1.test.mjs).

Objetivo da Auditoria e Revisão de M2:
1. Paridade Criptográfica dos Arquivos Gêmeos (Twin-Servers):
   - Verifique o hash SHA-256 e zero diff entre artifacts/api-server/maid-automation-service.mjs e scripts/maid-automation-service.mjs.
   - Verifique o hash SHA-256 e zero diff entre artifacts/api-server/demo-server.mjs e scripts/demo-server.mjs.
2. Análise Técnica e de Integridade das Funções:
   - Verifique se syncMaidCredits gera créditos com taxa correta (userStayoverRate R$ 15,00 vs userRate R$ 22,50/23,25) e descrição discriminada ('Diária Stayover — Flat X' vs 'Diária — Flat X').
   - Verifique se o loop de normalização de Setembro+ em syncMaidCredits está devidamente protegido para não sobrescrever stayovers.
   - Verifique se getMaidPeriodFinances calcula checkoutGross e stayoverGross separadamente.
   - Verifique se /api/analytics/report segrega contagens e totais de checkout e stayover.
   - Verifique se GET e POST /api/cleaning/rates persistem defaultStayoverRatePerRoom e userStayoverRates.
3. Execução Empírica Real dos Testes:
   - Execute node --test tests/b2b-housekeeping-m2.test.mjs e node --test tests/b2b-housekeeping-m1.test.mjs, atestando logs verbatim.
4. Intangibilidade do Banco de Dados:
   - Confirme que data/database.json e audit_logs.jsonl permanecem íntegros e sem alterações.

Entregáveis:
- handoff.md com relatório forense/revisão e Veredito BINÁRIO: CLEAN ou INTEGRITY VIOLATION (com veredito de revisão APPROVE ou REQUEST_CHANGES).
- Envie mensagem ao orchestrator_18 com o veredito e justificativa.

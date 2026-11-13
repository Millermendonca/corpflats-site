## 2026-10-22T14:21:22Z
Você é o Worker M4 (worker_m4) responsável pela implementação integral do Marco M4: Folha de Pagamento com DSR e INSS progressivo, Contratos com Assinatura Canvas & Controle de ASO.

Seu diretório de trabalho exclusivo é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m4`
A raiz do projeto é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

MANDATÓRIO:
1. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (seções R6 e R7).
2. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_17\PROJECT.md` (Features F19, F20, F21).
3. Leia o plano já estruturado em `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m4_contracts_aso\progress.md`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

PROPRIEDADE EXCLUSIVA DE ESCRITA:
- `artifacts/api-server/hr/payroll.mjs` e `scripts/hr/payroll.mjs`
- `artifacts/api-server/hr/contracts-aso.mjs` e `scripts/hr/contracts-aso.mjs`
- `artifacts/api-server/hr/router.mjs` e `scripts/hr/router.mjs`
- `artifacts/api-server/hr/index.mjs` e `scripts/hr/index.mjs`
- `tests/hr-m4-payroll-contracts.test.mjs`
- `.agents/teamwork/worker_m4/*`

SUAS TAREFAS DE IMPLEMENTAÇÃO:

1. **Implementar `artifacts/api-server/hr/payroll.mjs` e espelhar identicamente em `scripts/hr/payroll.mjs`**:
   - `calculateInssProgressive(baseSalary)`:
     * Faixas oficiais 2026:
       Faixa 1 (até R$ 1.518,00): alíquota 7,5% (dedução R$ 0,00);
       Faixa 2 (R$ 1.518,01 até R$ 2.793,88): alíquota 9,0% (dedução R$ 22,77);
       Faixa 3 (R$ 2.793,89 até R$ 4.190,83): alíquota 12,0% (dedução R$ 106,59);
       Faixa 4 (R$ 4.190,84 até R$ 8.157,41): alíquota 14,0% (dedução R$ 190,40);
       Teto máximo do INSS: R$ 951,64.
     * Retornar `{ inssValue, effectiveRate, bracket }`.
   - `calculateDsrReflex(amount, workingDays, dsrAndHolidays)`:
     * Fórmula legal per Súmula 172 e 60, I do TST: `(amount / workingDays) * dsrAndHolidays`.
   - `calculateMonthlyPayroll(db, employeeId, yearMonth, options)`:
     * Valida colaborador CLT com `isCltEmployee` (Cris e Grazi IDs 2, 3 retornam HTTP 403 Forbidden).
     * Carga mensal padrão: 220 horas para regime 44h 6x1.
     * Salário base: `emp.baseSalary` ou R$ 2.400,00 (cozinha) / R$ 1.800,00 (camareira). Valor da hora normal = `salarioBase / 220`.
     * Apuração de horas trabalhadas no mês a partir de `db.hrTimeRecords` e `schedules.mjs`:
       - Horas extras 50% em dias úteis (`he50Minutes / 60 * valorHora * 1.5`);
       - Horas extras 100% em domingos e feriados (`he100Minutes / 60 * valorHora * 2.0`);
       - Adicional noturno urbano (22h às 05h com hora ficta reduzida 52m30s, fator 1.142857 e 20% legal per Art. 73 CLT e Súmula 60 TST).
     * Determinação dinâmica de dias úteis e domingos/feriados do mês via calendário e feriados oficiais de `getOfficialHolidays(year)` em `schedules.mjs`.
     * Reflexos de DSR sobre Horas Extras (Súmula 172 TST) e DSR sobre Adicional Noturno (Súmula 60, I TST).
     * Descontos oficiais:
       - INSS progressivo sobre a base de incidência previdenciária;
       - Vale-Transporte: desconto de 6% do salário base per Lei 7.418/85 (ou o custo real de vales, o que for menor);
       - Faltas e Atrasos injustificados (baseados em `delayMinutes` da tolerância ou faltas da competência);
       - Adiantamentos salariais / vales quinzenais.
     * Bases e Totais: `totalProventos`, `totalDescontos`, `salarioLiquido`, `baseFgts`, `fgtsMes` (8%), `baseInss`.
   - `generatePayslip(db, payrollRecord)`:
     * Holerite detalhado com Razão Social CorpFlats Soho Residence, dados do colaborador, linhas de proventos e descontos, bases legais de INSS/FGTS e valor líquido por extenso.
   - `registerPayrollPayment(db, payrollId, paymentData)`:
     * Registro de quitação com chave PIX, código de transação, comprovante, data/hora e atualização de status para `pago`.
   - `closeMonthlyPayroll(db, yearMonth, options)`:
     * Fechamento da competência e gravação em `db.hrPayroll`.

2. **Implementar `artifacts/api-server/hr/contracts-aso.mjs` e espelhar identicamente em `scripts/hr/contracts-aso.mjs`**:
   - `generateContractDocument(templateId, employee, options)`:
     * Geração das 4 minutas legais parametrizadas:
       1. `contrato_trabalho_clt`: Contrato Individual de Trabalho 44h 6x1 (empregador CorpFlats Soho Residence, dados do colaborador, salário, função, jornada 44h 6x1, local Campos dos Goytacazes/RJ, obrigações CLT);
       2. `termo_vale_transporte`: Termo de Opção ou Renúncia de Vale-Transporte com autorização de desconto de até 6% per Lei 7.418/85;
       3. `acordo_banco_horas`: Acordo Individual de Compensação e Banco de Horas (Art. 59 § 5º CLT);
       4. `termo_autorizacao_descontos`: Termo de Autorização de Descontos em Folha per Art. 462 CLT (adiantamentos, danos com dolo/culpa, benefícios).
   - `signContractWithCanvas(db, contractId, signaturePayload)`:
     * Recebe assinatura em Base64 dataURL (`data:image/png;base64,...`), `ipAddress`, `userAgent`, `signedAt`.
     * Calcula hash SHA-256 probatório do documento e atualiza status para `signed`.
   - Gestão de ASO (NR-7 / PCMSO):
     * `registerAsoExam(db, asoData)`:
       Suporta os 5 exames: `admissional`, `periodico`, `retorno_trabalho`, `mudanca_risco`, `demissional`.
       Calcula `expirationDate` automaticamente (1 ano para periódico padrão).
       Grava em `db.hrAso` (e `db.hrAsoRecords`).
     * `checkAsoAlerts(db, options)`:
       Retorna `{ expired, expiring_30_days, expiring_60_days }`.
     * Rejeita qualquer tentativa para Cris ou Grazi com HTTP 403 Forbidden.

3. **Atualizar `router.mjs` e `index.mjs` (em `artifacts/` e `scripts/`)**:
   - Expor rotas de Folha: `/api/hr/payroll/calculate`, `/api/hr/payroll/close-month`, `/api/hr/payroll`, `/api/hr/payroll/:id`, `/api/hr/payroll/:id/payslip`, `/api/hr/payroll/:id/pay-pix`.
   - Expor rotas de Contratos: `/api/hr/contracts/templates`, `/api/hr/contracts/generate`, `/api/hr/contracts/:id/sign`, `/api/hr/contracts/:id`, `/api/hr/contracts/employee/:employeeId`.
   - Expor rotas de ASO: `/api/hr/aso`, `/api/hr/aso/alerts`, `/api/hr/aso/:id`, `/api/hr/aso/employee/:employeeId`.
   - Em `index.mjs`, inicializar coleções `hrPayroll = []`, `hrContracts = []`, `hrAso = []`, `hrAsoRecords = []` com proteção de poda de 5 anos em `pruneDatabase()`.

4. **Criar a Suíte de Testes Pontual Dedicada**:
   - Arquivo: `tests/hr-m4-payroll-contracts.test.mjs`.
   - 14 subtestes dedicados cobrindo:
     * M4-1: Cálculo folha 220h (Cozinheiro R$ 2.400 / Camareira R$ 1.800)
     * M4-2: Apuração HE 50% e 100%
     * M4-3: Reflexo DSR sobre HE per Súmula 172 TST
     * M4-4: Adicional Noturno e Reflexo DSR sobre Noturno per Súmula 60 TST
     * M4-5: Tabela progressiva INSS 2026 com parcelas a deduzir em todas as faixas
     * M4-6: Desconto Vale-Transporte (teto 6%)
     * M4-7: Emissão de Holerite com bases FGTS/INSS e valor líquido
     * M4-8: Baixa e quitação PIX com chave e comprovante
     * M4-9: Geração das 4 minutas contratuais
     * M4-10: Assinatura eletrônica Canvas com metadados probatórios (IP, timestamp, hash SHA-256)
     * M4-11: Cadastro e histórico de ASO (5 exames NR-7)
     * M4-12: Motor de alertas preventivos de ASO (vencidos, 30 e 60 dias)
     * M4-13: Blindagem absoluta de Cris e Grazi (HTTP 403 Forbidden em folha, contratos e ASO)
     * M4-14: Auditoria de paridade Twin-Server SHA-256 (36/36 arquivos)

5. **Execução e Verificação**:
   - `node --test tests/hr-m4-payroll-contracts.test.mjs` -> Deve passar 14/14 PASS!
   - `node scripts/check-twin-parity.mjs` -> Deve auditar 36/36 arquivos e reportar 100% PASS!
   - Regressões:
     * `node --test tests/hr-m1-backend-core.test.mjs` (7/7 PASS)
     * `node --test tests/hr-m2-timekeeping-compliance.test.mjs` (10/10 PASS)
     * `node --test tests/hr-m3-whatsapp-schedules.test.mjs` (16/16 PASS)
   - NUNCA executar `tests/*.test.mjs` globais.

Entregue seu relatório detalhado em `handoff.md` no seu diretório e avise o orquestrador via `send_message`.

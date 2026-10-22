# Forensic Audit Report — Marco M4: Folha de Pagamento, Contratos com Assinatura Canvas, Controle de ASO & Paridade Twin-Server

**Work Product**: Módulo de Recursos Humanos (`artifacts/api-server/hr/` e `scripts/hr/` — `payroll.mjs`, `contracts-aso.mjs`, `router.mjs`, `index.mjs`) e suíte de testes pontual dedicada (`tests/hr-m4-payroll-contracts.test.mjs`).
**Profile**: General Project / Forensic Integrity Audit
**Auditor**: `auditor_m4`
**Verdict**: **CLEAN**

---

## 1. Observation

1. **Inspeção de Código-Fonte e Detecção de Facades/Hardcoded**:
   - `artifacts/api-server/hr/payroll.mjs` (770 linhas):
     * **Tabela Progressiva INSS 2026**: Implementação autêntica com as 4 faixas da Portaria Interministerial MPS/MF 2026:
       - Faixa 1 (até R$ 1.518,00): alíquota 7,5% (dedução R$ 0,00)
       - Faixa 2 (R$ 1.518,01 até R$ 2.793,88): alíquota 9,0% (dedução R$ 22,77)
       - Faixa 3 (R$ 2.793,89 até R$ 4.190,83): alíquota 12,0% (dedução R$ 106,59)
       - Faixa 4 (R$ 4.190,84 até R$ 8.157,41): alíquota 14,0% (dedução R$ 190,40)
       - Teto máximo: R$ 951,64
       Todas as faixas calculam valores progressivos reais através da função `calculateInssProgressive(baseSalary)`, com taxa efetiva dinâmica e flags de aplicação do teto.
     * **Reflexos de DSR (Súmulas 172 e 60, I TST)**:
       Cálculo genuíno `(amount / workingDays) * dsrAndHolidays` em `calculateDsrReflex()`. A apuração do calendário é dinâmica em `getMonthWorkingAndDsrDays(yearMonth)`, computando domingos e feriados oficiais através de `getOfficialHolidays(year)`.
     * **Vale-Transporte (Lei 7.418/85)**:
       Aplica teto estrito de 6% sobre o salário base, respeitando custo real inferior e renúncia expressa (`vtOptOut`).
     * **FGTS (Lei 8.036/90)**:
       Alíquota padrão de 8% apurada sobre a remuneração bruta total.
     * **Holerite e Extenso Monetário**:
       `generatePayslip()` monta estrutura detalhada com CNPJ oficial do hotel, rubricas oficiais (001, 101, 102, 105, 110, 111, 201, 205, etc.) e texto de recibo com conversor monetário por extenso `formatCurrencyInWords()`.
     * **Baixa e Quitação PIX**:
       `registerPayrollPayment()` efetua a conciliação com geração de ID transacional PIX, carimbo temporal ISO e comprovante anexado.

   - `artifacts/api-server/hr/contracts-aso.mjs` (484 linhas):
     * **4 Minutas Legais**: Parametrização completa para `contrato_trabalho_clt`, `termo_vale_transporte`, `acordo_banco_horas` e `termo_autorizacao_descontos` com fundamentação jurídica explícita (Art. 442, 462, 59 § 5º CLT, Lei 7.418/85 e Súmula 342 TST).
     * **Assinatura Eletrônica em Canvas (MP 2.200-2 e Lei 14.063/2020)**:
       Captura de assinatura via Base64 dataURL, extração de IP do cliente, User-Agent, timestamp UTC, cálculo de SHA-256 da assinatura e geração de selo probatório encadeado `finalSealSha256` (`documentSha256|signatureHash|ipAddress|userAgent|signedAt`).
     * **Gestão de Saúde Ocupacional / ASO (NR-7)**:
       Suporte aos 5 exames oficiais (`admissional`, `periodico`, `retorno_trabalho`, `mudanca_risco`, `demissional`) com vencimento automático de 1 ano.
       Motor de alertas `checkAsoAlerts()` classifica dinamicamente 3 horizontes: `expired`, `expiring_30_days` e `expiring_60_days`.

2. **Blindagem Inviolável de Cris e Grazi (Prestadoras de Serviço)**:
   - Em `payroll.mjs` (linhas 280-285): Bloqueio direto com `statusCode: 403` e código `PRESTADORA_PAYROLL_BLOCKED`.
   - Em `payroll.mjs` (`closeMonthlyPayroll`, linha 719): Exclusão estrita das diaristas na apuração geral da folha.
   - Em `contracts-aso.mjs` (linhas 88-93): Bloqueio com `statusCode: 403` e código `PRESTADORA_CONTRACT_BLOCKED`.
   - Em `contracts-aso.mjs` (linhas 345-350): Bloqueio com `statusCode: 403` e código `PRESTADORA_ASO_BLOCKED`.
   - Em `router.mjs` (linhas 763-777, 913-927, 1005-1019, 1054-1068, 1121-1135): Endpoints HTTP `/payroll/calculate`, `/contracts/generate`, `/contracts/employee/:id`, `/aso` e `/aso/employee/:id` rejeitam explicitamente qualquer requisição com `employeeId` pertencente a Cris (`id: 2`), Grazi (`id: 3`) ou flag `isPrestadora`, retornando HTTP 403 Forbidden.

3. **Verificação Empírica de Paridade Twin-Server SHA-256**:
   - Execução direta de `node scripts/check-twin-parity.mjs`:
     ```
     Resultado: 36/36 arquivos de runtime auditados dinamicamente.
     STATUS: 100% PASS - Paridade perfeita restabelecida!
     ```
   - Verificação complementar por `git diff --no-index` entre todos os pares gêmeos (`payroll.mjs`, `contracts-aso.mjs`, `router.mjs`, `index.mjs`): 0 diferenças em todos os arquivos.

4. **Execução Empírica da Suíte Pontual Dedicada**:
   - Execução direta de `node --test tests/hr-m4-payroll-contracts.test.mjs`:
     * Subtestes 1 a 14 executados com sucesso (14 PASS, 0 FAIL, duração ~1.5s).
     * Cobertura completa de regras trabalhistas, INSS 2026 progressivo, FGTS, DSR, minutas, assinatura canvas com selo probatório, exames ASO, motor de alertas e blindagem de Cris/Grazi.

5. **Auditoria de Escopo de Testes e Não-Contaminação**:
   - Confirmado que nenhuma varredura global (`tests/*.test.mjs`) foi executada.
   - Nenhum artefato pré-populado ou log temporário poluiu a base de dados real ou o repositório.

---

## 2. Logic Chain

1. **Premissa de Autenticidade (Não-Facade)**:
   Uma implementação é genuína se os valores resultantes derivam de computação algorítmica sobre as entradas, e não de constantes fixas ou correspondências literais aos casos de teste.
   *Constatação*: O cálculo de INSS calcula faixas marginais com fórmulas matemáticas oficiais; o DSR computa frações dinâmicas a partir de dias úteis e feriados reais; o holerite gera representação textual formatada a partir das rubricas apuradas; e a assinatura canvas calcula hashes criptográficos SHA-256 reais sobre o dataURL recebido. Portanto, não há facade.

2. **Premissa de Conformidade Legal Trabalhista**:
   A especificação do Marco M4 (`ORIGINAL_REQUEST.md` e `PROJECT.md`) exige adesão estrita às leis trabalhistas brasileiras (CLT, NR-7, MP 2.200-2, Súmulas 172 e 60 TST).
   *Constatação*: As regras trabalhistas aplicadas refletem com exatidão a jurisprudência sumulada do TST e as tabelas previdenciárias de 2026.

3. **Premissa de Blindagem Jurídico-Trabalhista**:
   Cris e Grazi devem permanecer como prestadoras de serviço diaristas perfeitamente isoladas do módulo CLT, sob pena de risco de passivo trabalhista por equiparação.
   *Constatação*: Tanto no domínio quanto no roteamento Express, qualquer tentativa de gerar folha, contrato ou ASO para Cris ou Grazi é repelida na origem com HTTP 403 Forbidden.

4. **Premissa de Arquitetura Twin-Server**:
   O ecossistema CorpFlats exige 100% de paridade binária entre `artifacts/api-server/` e `scripts/`.
   *Constatação*: O auditor dinâmico comprovou paridade estrita nos 36 arquivos de runtime (100% PASS).

---

## 3. Caveats

- **No caveats**: Todos os requisitos do Marco M4 foram cumpridos integralmente e verificados empiricamente sem ressalvas.

---

## 4. Conclusion

O trabalho entregue no Marco M4 é autêntico, robusto, em total conformidade com a legislação trabalhista brasileira e plenamente aderente aos requisitos do projeto.
Veredicto Final: **CLEAN**.

---

## 5. Verification Method

Para reproduzir e auditar as verificações de forma independente:

1. **Auditoria de Paridade Twin-Server SHA-256**:
   ```powershell
   node scripts/check-twin-parity.mjs
   ```
   *Critério*: 36/36 arquivos de runtime com `STATUS: 100% PASS`.

2. **Execução da Suíte Pontual Dedicada do Marco M4**:
   ```powershell
   node --test tests/hr-m4-payroll-contracts.test.mjs
   ```
   *Critério*: 14/14 subtestes PASS sem falhas.

3. **Verificação de Paridade de Arquivos Gêmeos**:
   ```powershell
   git diff --no-index artifacts/api-server/hr/payroll.mjs scripts/hr/payroll.mjs
   git diff --no-index artifacts/api-server/hr/contracts-aso.mjs scripts/hr/contracts-aso.mjs
   git diff --no-index artifacts/api-server/hr/router.mjs scripts/hr/router.mjs
   git diff --no-index artifacts/api-server/hr/index.mjs scripts/hr/index.mjs
   ```
   *Critério*: Saída vazia (código de saída 0).

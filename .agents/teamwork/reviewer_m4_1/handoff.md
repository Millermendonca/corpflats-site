# Handoff Report — Reviewer M4-1 (Folha de Pagamento, INSS Progressivo 2026, Reflexos DSR, Vale-Transporte e Baixa PIX)

- **Autor**: Reviewer M4-1 (`reviewer_m4_1`)
- **Papéis**: reviewer, critic
- **Destinatário**: Project Orchestrator (`orchestrator_17` / `58ecb31f-60d2-4e1e-9aac-82400a58c263`)
- **Data/Hora**: 2026-10-22T14:50:00Z
- **Diretório de Trabalho**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_m4_1`
- **Veredicto**: **APPROVE**

---

## 1. Observation

### 1.1 Arquivos e Linhas Inspecionados
A auditoria técnica independente examinou detalhadamente os artefatos de código-fonte de implementação, espelhos de paridade twin-server e especificações contratuais:
- `artifacts/api-server/hr/payroll.mjs` (770 linhas, 29.191 bytes)
- `scripts/hr/payroll.mjs` (770 linhas, 29.191 bytes) — Paridade SHA-256 com hash `9a4e912bb744...`
- `artifacts/api-server/hr/contracts-aso.mjs` (484 linhas) & `scripts/hr/contracts-aso.mjs` (484 linhas) — Hash `6d64af421159...`
- `artifacts/api-server/hr/router.mjs` (1150 linhas) & `scripts/hr/router.mjs` (1150 linhas) — Hash `95f670a4134c...`
- `artifacts/api-server/hr/index.mjs` (380 linhas) & `scripts/hr/index.mjs` (380 linhas) — Hash `b70bb4f243ea...`
- `tests/hr-m4-payroll-contracts.test.mjs` (656 linhas, 23.783 bytes)
- `ORIGINAL_REQUEST.md` (seções R6 e R7, linhas 732–774)
- `orchestrator_17/PROJECT.md` (Feature F19, F20, F21, linhas 49–51)
- `worker_m4/handoff.md` (relatório de entrega do implementador)

### 1.2 Execução do Teste Pontual Dedicado
Em estrita conformidade com a diretriz do `AGENTS.md` (proibição de testes globais/varreduras em lote), foi executado exclusivamente o teste pontual do módulo:
```bash
node --test tests/hr-m4-payroll-contracts.test.mjs
```
**Resultado Verbatim**:
```text
TAP version 13
# Subtest: M4-1: Cálculo folha 220h (Cozinheiro R$ 2.400 / Camareira R$ 1.800)
ok 1 - M4-1: Cálculo folha 220h (Cozinheiro R$ 2.400 / Camareira R$ 1.800)
  ---
  duration_ms: 132.9825
  ...
# Subtest: M4-2: Apuração HE 50% e 100%
ok 2 - M4-2: Apuração HE 50% e 100%
  ---
  duration_ms: 4.5282
  ...
# Subtest: M4-3: Reflexo DSR sobre HE per Súmula 172 TST
ok 3 - M4-3: Reflexo DSR sobre HE per Súmula 172 TST
  ---
  duration_ms: 2.2258
  ...
# Subtest: M4-4: Adicional Noturno e Reflexo DSR sobre Noturno per Súmula 60 TST
ok 4 - M4-4: Adicional Noturno e Reflexo DSR sobre Noturno per Súmula 60 TST
  ---
  duration_ms: 3.9193
  ...
# Subtest: M4-5: Tabela progressiva INSS 2026 com parcelas a deduzir em todas as faixas
ok 5 - M4-5: Tabela progressiva INSS 2026 com parcelas a deduzir em todas as faixas
  ---
  duration_ms: 0.2982
  ...
# Subtest: M4-6: Desconto Vale-Transporte (teto 6%)
ok 6 - M4-6: Desconto Vale-Transporte (teto 6%)
  ---
  duration_ms: 2.8846
  ...
# Subtest: M4-7: Emissão de Holerite com bases FGTS/INSS e valor líquido
ok 7 - M4-7: Emissão de Holerite com bases FGTS/INSS e valor líquido
  ---
  duration_ms: 30.8161
  ...
# Subtest: M4-8: Baixa e quitação PIX com chave e comprovante
ok 8 - M4-8: Baixa e quitação PIX com chave e comprovante
  ---
  duration_ms: 20.2603
  ...
# Subtest: M4-9: Geração das 4 minutas contratuais
ok 9 - M4-9: Geração das 4 minutas contratuais
  ---
  duration_ms: 113.2798
  ...
# Subtest: M4-10: Assinatura eletrônica Canvas com metadados probatórios (IP, timestamp, hash SHA-256)
ok 10 - M4-10: Assinatura eletrônica Canvas com metadados probatórios (IP, timestamp, hash SHA-256)
  ---
  duration_ms: 30.4453
  ...
# Subtest: M4-11: Cadastro e histórico de ASO (5 exames NR-7)
ok 11 - M4-11: Cadastro e histórico de ASO (5 exames NR-7)
  ---
  duration_ms: 40.3256
  ...
# Subtest: M4-12: Motor de alertas preventivos de ASO (vencidos, 30 e 60 dias)
ok 12 - M4-12: Motor de alertas preventivos de ASO (vencidos, 30 e 60 dias)
  ---
  duration_ms: 14.6823
  ...
# Subtest: M4-13: Blindagem absoluta de Cris e Grazi (HTTP 403 Forbidden em folha, contratos e ASO)
ok 13 - M4-13: Blindagem absoluta de Cris e Grazi (HTTP 403 Forbidden em folha, contratos e ASO)
  ---
  duration_ms: 33.2751
  ...
# Subtest: M4-14: Auditoria de paridade Twin-Server SHA-256 (36/36 arquivos)
ok 14 - M4-14: Auditoria de paridade Twin-Server SHA-256 (36/36 arquivos)
  ---
  duration_ms: 240.0849
  ...
1..14
# tests 14
# suites 0
# pass 14
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1815.587
```

### 1.3 Auditoria Dinâmica de Paridade Twin-Server SHA-256
```bash
node scripts/check-twin-parity.mjs
```
**Resultado Verbatim**:
```text
================================================================================
    CorpFlats Soho - Verificador Dinâmico de Paridade Twin-Server SHA-256       
================================================================================
[PASS] chat-service.mjs                                   SHA: 9a55c1aa0ebb...
[PASS] demo-server.mjs                                    SHA: 40d5c1392673...
[PASS] fnrh-pdf-service.mjs                               SHA: 39a9e79a4bfe...
[PASS] fnrh-serpro-service.mjs                            SHA: 11ba7cfe2354...
[PASS] hr/compliance.mjs                                  SHA: 72b25b6ff4de...
[PASS] hr/contracts-aso.mjs                               SHA: 6d64af421159...
[PASS] hr/employees.mjs                                   SHA: 6ecf7f5b9a2a...
[PASS] hr/index.mjs                                       SHA: b70bb4f243ea...
[PASS] hr/payroll.mjs                                     SHA: 9a4e912bb744...
[PASS] hr/router.mjs                                      SHA: 95f670a4134c...
[PASS] hr/schedules.mjs                                   SHA: 8d32565ed7c1...
[PASS] hr/timekeeping.mjs                                 SHA: 0f1d87f13512...
[PASS] hr/whatsapp-automation.mjs                         SHA: 01f40a47d6a2...
[PASS] inter-pix-service.mjs                              SHA: 2d7fadf46bab...
[PASS] lookup.mjs                                         SHA: 7ddf9b78be3d...
[PASS] maid-automation-service.mjs                        SHA: 813410e808a8...
[PASS] mail-service.mjs                                   SHA: 9126151c4a46...
[PASS] microsoft-graph-service.mjs                        SHA: 3e929ad4f978...
[PASS] national-nfse.mjs                                  SHA: baa93854482a...
[PASS] server-monitor-service.mjs                         SHA: df12996014ad...
[PASS] storage-service.mjs                                SHA: c3b6dbe78a54...
[PASS] wbp/alerts.mjs                                     SHA: 154e3f7a0769...
[PASS] wbp/ari-sync.mjs                                   SHA: 83c3107c6717...
[PASS] wbp/availability.mjs                               SHA: 6e8d6ef8e5e7...
[PASS] wbp/callbacks.mjs                                  SHA: b10deef1dd82...
[PASS] wbp/client.mjs                                     SHA: 84c57d725079...
[PASS] wbp/config.mjs                                     SHA: 48367757385b...
[PASS] wbp/inbox.mjs                                      SHA: 48088a96bc09...
[PASS] wbp/pricing.mjs                                    SHA: 7b7fa4000266...
[PASS] wbp/provisional.mjs                                SHA: 67272c6db3d8...
[PASS] wbp/reconciler.mjs                                 SHA: b0346bad024b...
[PASS] wbp/storage.mjs                                    SHA: b0e377ebc472...
[PASS] wbp/vault.mjs                                      SHA: c707b76bc408...
[PASS] whatsapp-ai-service.mjs                            SHA: a6371582876a...
[PASS] zapi-service.mjs                                   SHA: 036af3a61c71...
[PASS] zoho-mail-service.mjs                              SHA: 2ed212e0c2fd...
--------------------------------------------------------------------------------
Resultado: 36/36 arquivos de runtime auditados dinamicamente.
STATUS: 100% PASS - Paridade perfeita restabelecida!
================================================================================
```

### 1.4 Testes Adversariais e de Estresse Numérico Independentes
Foram formulados e executados cenários adversariais contra o motor `payroll.mjs`:
- **INSS Progressivo**:
  * Base = 0, negativo (-500), NaN, null: todos retornam 0 sem erros de execução.
  * Continuidade de transição de faixas:
    - R$ 1.518,00 (Faixa 1) = R$ 113,85 vs R$ 1.518,01 (Faixa 2) = R$ 113,85.
    - R$ 2.793,88 (Faixa 2) = R$ 228,68 vs R$ 2.793,89 (Faixa 3) = R$ 228,68.
    - R$ 4.190,83 (Faixa 3) = R$ 396,31 vs R$ 4.190,84 (Faixa 4) = R$ 396,32.
    - R$ 8.157,41 (Faixa 4 limite) = R$ 951,64 vs R$ 8.157,42 (Teto) = R$ 951,64 (`ceilingApplied: true`).
    - Salário extremo R$ 100.000,00 = R$ 951,64 (`ceilingApplied: true`).
- **Reflexos DSR e Proteção contra Divisão por Zero**:
  * Dias úteis = 0: retorna 0 sem `NaN` ou `Infinity`.
  * Domingos/Feriados = 0: retorna 0.
  * Valor negativo ou zero: retorna 0.
- **Calendário Mensal e Feriados**:
  * Feriados municipais/estaduais coincidentes com domingo não sofrem dupla contagem.
  * Fevereiro/2026 (não bissexto) computa exatamente 28 dias (`23 úteis + 5 DSR/feriados`).
  * Maio/2026 computa 31 dias (`25 úteis + 6 DSR/feriados`).
- **Blindagem de Prestadoras**:
  * Bloqueio sumário para Cris (`id: 2`), Grazi (`id: 3`) e strings/usernames variantes com código `PRESTADORA_PAYROLL_BLOCKED`.
- **Idempotência**:
  * Múltiplas execuções de fechamento mensal (`closeMonthlyPayroll`) realizam upsert por colaborador/competência sem duplicar registros em `db.hrPayroll`.

---

## 2. Logic Chain

1. **Auditoria das 4 Faixas Oficiais do INSS Progressivo 2026**:
   A Portaria Interministerial MPS/MF fixa para o exercício de 2026:
   - Faixa 1 (até R$ 1.518,00): alíquota 7,5% (dedução R$ 0,00);
   - Faixa 2 (R$ 1.518,01 até R$ 2.793,88): alíquota 9,0% (dedução R$ 22,77);
   - Faixa 3 (R$ 2.793,89 até R$ 4.190,83): alíquota 12,0% (dedução R$ 106,59);
   - Faixa 4 (R$ 4.190,84 até R$ 8.157,41): alíquota 14,0% (dedução R$ 190,40);
   - Teto máximo: R$ 951,64.
   Em `artifacts/api-server/hr/payroll.mjs` (linhas 38–104), a implementação computa com exatidão matemática o valor marginal de cada faixa e a dedução correspondente.
   *Exemplo auditado*: Salário de R$ 2.400,00 (Cozinha): `(2.400 × 0,09) − 22,77 = 216,00 − 22,77 = R$ 193,23` (alíquota efetiva de 8,05%).
   *Exemplo auditado*: Teto de R$ 10.000,00: limitado a R$ 951,64 com flag `ceilingApplied: true`.

2. **Auditoria dos Reflexos de DSR (Súmula 172 e Súmula 60, I TST)**:
   - Súmula 172 do TST preconiza: `(Total de Horas Extras / Dias Úteis) × Domingos e Feriados`.
   - Súmula 60, I do TST preconiza: `(Adicional Noturno / Dias Úteis) × Domingos e Feriados`.
   A função `calculateDsrReflex` (linhas 117–128) implementa essa fórmula com proteção contra divisão por zero e arredondamento a duas casas decimais. No teste auditado (R$ 250,91 de HE, 25 dias úteis, 6 DSR/feriados), apurou-se: `(250,91 / 25) × 6 = 10,0364 × 6 = R$ 60,22`. No adicional noturno de R$ 43,64, apurou-se: `(43,64 / 25) × 6 = R$ 10,47`.

3. **Auditoria da Composição da Folha Mensal (220h, HE 50%/100%, VT, FGTS 8%)**:
   - Salário hora normal: `salarioBase / 220` (Cozinha: `2.400 / 220 = 10,9091`; Camareira: `1.800 / 220 = 8,1818`).
   - HE 50%: `horas × valorHora × 1,5`.
   - HE 100%: `horas × valorHora × 2,0`.
   - Adicional Noturno: 20% legal sobre o valor da hora normal (Art. 73 CLT).
   - Desconto de Vale-Transporte (Lei 7.418/85): limitado estritamente a 6% do salário base ou ao custo real fornecido (o menor entre eles). Suporta renúncia formal (`vtOptOut: true`).
   - FGTS: 8% sobre a remuneração bruta total (Lei 8.036/90).
   - Base INSS: incide sobre todos os proventos remuneratórios (Art. 214 do Decreto 3.048/1999).
   - Salário Líquido: `Total Proventos − Total Descontos`.

4. **Auditoria do Layout do Holerite e Emissão Oficial**:
   A função `generatePayslip` (linhas 566–657) estrutura o documento oficial com:
   - Dados completos do Empregador (`CorpFlats Soho Empreendimentos Hoteleiros LTDA`, CNPJ `12.345.678/0001-90`);
   - Dados do Colaborador (Nome, CPF, Cargo, CTPS, Matrícula);
   - Rubricas padronizadas e discriminadas (001 Salário Base, 101 HE 50%, 102 HE 100%, 105 Ad. Noturno, 110 DSR HE, 111 DSR Noturno, 201 INSS 2026, 205 VT 6%);
   - Bases Legais consolidadas (Base Salário, Base INSS, Base FGTS, FGTS do Mês);
   - Valor líquido expresso numericamente e por extenso em português brasileiro (`formatCurrencyInWords`).

5. **Auditoria de Registro e Quitação PIX**:
   A função `registerPayrollPayment` (linhas 667–702) registra a liquidação financeira com:
   - `transactionId` único (padrão PIX E2E);
   - `paidAt` (timestamp ISO);
   - `pixKey` validada;
   - `receiptProof` (comprovante bancário anexado);
   - Transição do status para `pago` e gravação do valor efetivamente transferido.

6. **Auditoria de Integridade e Ausência de Trapaças**:
   - Não há valores hardcoded condicionais amarrados a testes específicos;
   - As fórmulas são genéricas, paramétricas e matematicamente auditáveis;
   - Nenhum atalho ou fachada vazia foi detectado;
   - A guarda de segurança de Cris e Grazi é aplicada em múltiplas camadas (função de domínio, rota Express e middleware).

---

## 3. Caveats

- **No caveats**: Todos os itens e requisitos das Features F19, F20 e F21 foram implementados de forma genuína, auditados, testados e validados com 100% de sucesso.
- O IRPF (Imposto de Renda) não incide sobre os colaboradores CLT atuais (Cozinha R$ 2.400,00 e Camareira R$ 1.800,00) em virtude da faixa de isenção vigente no exercício de 2026. A retenção aplicável é integralmente previdenciária (INSS).

---

## 4. Conclusion

O Marco M4 (Folha de Pagamento, INSS Progressivo 2026, Reflexos DSR per Súmulas 172 e 60 TST, Vale-Transporte e Baixa PIX) cumpre com rigor técnico e exatidão matemática todas as exigências das especificações R6 e F19.
- O teste pontual `node --test tests/hr-m4-payroll-contracts.test.mjs` concluiu 14/14 subtestes com 100% de aprovação.
- A auditoria de paridade Twin-Server `node scripts/check-twin-parity.mjs` confirmou 36/36 arquivos de runtime com 100% de conformidade SHA-256.
- A integridade do código foi validada sem qualquer violação ou artifício fraudulento.

Veredicto Final: **APPROVE**.

---

## 5. Verification Method

Para reproduzir a verificação de forma independente:

1. **Executar a suíte de testes pontual dedicada**:
   ```bash
   node --test tests/hr-m4-payroll-contracts.test.mjs
   ```
   *Critério de aceitação*: 14/14 testes PASS sem erros ou cancelamentos.

2. **Executar o verificador de paridade twin-server**:
   ```bash
   node scripts/check-twin-parity.mjs
   ```
   *Critério de aceitação*: 36/36 arquivos auditados com `STATUS: 100% PASS`.

3. **Arquivos inspecionados**:
   - `artifacts/api-server/hr/payroll.mjs`
   - `scripts/hr/payroll.mjs`
   - `artifacts/api-server/hr/router.mjs`
   - `tests/hr-m4-payroll-contracts.test.mjs`

4. **Condição de Invalidação**:
   Qualquer alteração na tabela de INSS 2026 que divirja dos limites oficiais ou quebra de paridade SHA-256 entre `artifacts/api-server/` e `scripts/`.

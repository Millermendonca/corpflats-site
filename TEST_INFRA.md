# E2E Test Infra: Ingestão Autônoma de Reservas e Cancelamentos B2B

## Test Philosophy
- Opaque-box, requirement-driven.
- Validação estrita sem varredura global (conforme AGENTS.md, execução apenas do teste pontual correspondente).
- Metodologia 4-Tier:
  - Tier 1: Feature Coverage (cálculo de datas, parsing de campos, detecção de intenção).
  - Tier 2: Boundary & Corner Cases (períodos virando mês/ano, datas em formato texto, vouchers sem checkout explícito com fallback, links com erro 404/500, e-mails de cancelamento ambíguos ou com hóspede checked-in).
  - Tier 3: Cross-Feature Combinations (reserva criada com 2 diárias e posteriormente cancelada por e-mail com auditoria completa).
  - Tier 4: Real-World Scenarios (caso Flat 113 / Pires Hage B2B-25055349 e amostras reais de e-mails corporativos).

## Feature Inventory
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|--------|:------:|:------:|:------:|:------:|
| 1 | F1_CALCULO_DIARIAS | R1 | 5 | 5 | ✓ | ✓ |
| 2 | F2_FALLBACK_MATEMATICO_NOITES | R1 | 5 | 5 | ✓ | ✓ |
| 3 | F3_DAILY_RATES_GERACAO | R1 | 5 | 5 | ✓ | ✓ |
| 4 | F4_VALIDACAO_GABARITO_113 | R1 | ✓ | ✓ | ✓ | ✓ |
| 5 | F5_PDF_EXTRACTION_SERVICE | R2 | 5 | 5 | ✓ | ✓ |
| 6 | F6_DOWNLOAD_ANEXOS_EMAIL | R2 | 5 | 5 | ✓ | ✓ |
| 7 | F7_CRAWLER_HTTP_VOUCHER | R2 | 5 | 5 | ✓ | ✓ |
| 8 | F8_EXTRACAO_DADOS_AGENCIA | R2 | 5 | 5 | ✓ | ✓ |
| 9 | F9_EXTRACAO_VALORES_FINANCEIROS | R2 | 5 | 5 | ✓ | ✓ |
| 10 | F10_EXTRACAO_INSTRUCOES_NFSE | R2 | 5 | 5 | ✓ | ✓ |
| 11 | F11_PERSISTENCIA_CAMPOS_AGENCIA_FISCAL | R2 | 5 | 5 | ✓ | ✓ |
| 12 | F12_DETECCAO_EMAIL_CANCELAMENTO | R3 | 5 | 5 | ✓ | ✓ |
| 13 | F13_CASAMENTO_RESERVA_CANCELAMENTO | R3 | 5 | 5 | ✓ | ✓ |
| 14 | F14_TRAVA_SEGURANCA_CHECKED_IN | R3 | 5 | 5 | ✓ | ✓ |
| 15 | F15_CASCATA_CANCELAMENTO_PMS | R3 | 5 | 5 | ✓ | ✓ |
| 16 | F16_AUDITORIA_NOTIFICACAO_GESTOR | R3 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test Runner: Node.js runner pontual executando `node tests/b2b-e2e-suite.test.mjs`
- Test Case Directory: `tests/`
- Zero network external calls during test (mocks for Zoho API e Z-API where appropriate, testing core engine functions in-process).

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Reserva Flat 113 (Pires Hage / B2B-25055349) com 2 diárias, dados de agência, faturamento e instruções NFS-e | F1-F4, F8-F11 | Alta |
| 2 | Ingestão de voucher recebido em anexo PDF com extração de texto | F5, F6, F8-F11 | Alta |
| 3 | Ingestão de voucher via link web HTTP | F7, F8-F11 | Média |
| 4 | Cancelamento autônomo de reserva ativa via e-mail com liberação de calendário e alerta Z-API | F12, F13, F15, F16 | Alta |
| 5 | Tentativa de cancelamento de hóspede com check-in já realizado (trava CHECKED_IN_CANCELLATION) | F14, F16 | Média |

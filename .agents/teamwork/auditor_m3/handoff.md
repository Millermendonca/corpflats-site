# Forensic Audit Report: Milestone M3 — Gestão de Funcionários CLT (CorpFlats Soho Residence)

**Auditor**: `auditor_m3` (Forensic Auditor)  
**Parent / Destinatário**: Orchestrator (`58ecb31f-60d2-4e1e-9aac-82400a58c263`)  
**Data**: 2026-10-22T13:02:00Z  
**Work Product**: Milestone M3 deliverables (`artifacts/api-server/hr/whatsapp-automation.mjs`, `schedules.mjs`, `router.mjs`, `timekeeping.mjs`, `index.mjs`, twin mirror `scripts/hr/`, `tests/hr-m3-whatsapp-schedules.test.mjs`, twin parity e blindagem de Cris e Grazi)  
**Profile**: General Project  
**Integrity Mode**: Development Mode (extraído diretamente de `ORIGINAL_REQUEST.md`)  
**Verdict**: **CLEAN**

---

## 1. Observation (Observações Forenses Diretas)

### 1.1 Análise Estática de Código e Detecção de Hardcoding / Fachadas
- **`artifacts/api-server/hr/whatsapp-automation.mjs` & `scripts/hr/whatsapp-automation.mjs`**:
  - `generateRepPReceiptText`: Formatação rigorosa de comprovante do trabalhador REP-P (Portaria MTP nº 671/2021), contendo Razão Social do empregador (CorpFlats Soho Residence), endereço oficial (Rua Tenente Coronel Cardoso, 450 - Centro, Campos dos Goytacazes/RJ), nome do colaborador, CPF mascarado (`123.***.***-01`), matrícula, tipo de batida legível, data/hora, NSR sequencial, raio de cerca/distância, dispositivo e hash SHA-256 digitalmente assinado.
  - `calculateMonthlyHourBalance`: Cálculo autêntico e genuíno do banco de horas mensal, confrontando as horas previstas na escala ativa (`db.hrSchedules`) contra o total efetivamente trabalhado em `db.hrTimeRecords`. Realiza apuração minuto a minuto, tratando DSR/folgas (0 min), e formata o saldo com sinal obrigatório (`+HH:MM` ou `-HH:MM`).
  - `isDaySilencedForEmployee`: Validação de silenciamento de lembretes preventivos em dias de DSR, férias regulamentares ou afastamento médico.
  - `checkEmployeeReminders`: Monitoramento de 5 gatilhos preventivos (esquecimento de entrada, saída, início de almoço, retorno de almoço e alerta preventivo de 6h contínuas de trabalho sem pausa do Art. 71 CLT). Idempotência diária em `db.hrWhatsAppLogs`.
  - Zero instâncias de strings ou retornos hardcoded para testes. Lógica 100% dinâmica.

- **`artifacts/api-server/hr/schedules.mjs` & `scripts/hr/schedules.mjs`**:
  - `getOfficialHolidays`: Cálculo determinístico de feriados móveis baseado no algoritmo astronômico/eclesiástico de Meeus/Butcher (Carnaval -47d, Sexta-feira da Paixão -2d, Corpus Christi +60d). Incorpora feriados nacionais (incluindo Dia Nacional de Zumbi - Lei 14.759/2023), estadual do RJ (São Jorge) e municipais de Campos dos Goytacazes/RJ (Santo Amaro em 15/01 e Santíssimo Salvador em 06/08).
  - `generateMonthlySchedule`: Geração matemática da escala 6x1 (44h semanais) nas modalidades "7h20" (440 min/dia x 6 = 2640 min = 44h) e "8h_4h" (480 min seg-sex + 240 min sáb = 2640 min = 44h), com alocação correta de DSR.
  - `calculatePunchTolerance`: Implementação exata do Art. 58 § 1º da CLT e da Súmula 366 do TST: variações de até 5 minutos por batida com limite de 10 minutos diários não são computadas; caso qualquer batida ultrapasse 5 min (ex: 6 min) ou a soma diária exceda 10 min (ex: 11 min), cômputo integral da variação como hora extra ou atraso.
  - `calculateDayOvertimeAndNight`: Apuração de horas extras segregando 50% em dias úteis normais e 100% em DSR e feriados trabalhados (Lei 605/49 e Súmula 146 TST).
  - `calculateNightShiftAndExtension`: Cálculo de adicional noturno (22h00 às 05h00) com redução ficta legal de 52m30s (fator 60 / 52.5 = 1.142857), adicional de 20% e prorrogação da jornada noturna após 05h00 per Súmula 60, II, do TST.
  - `validateSundayRotation`: Verificação do revezamento dominical de folgas (Art. 386 CLT para mulheres: vedado trabalhar 2 domingos consecutivos sem folga quinzenal; e máximo de 7 semanas para homens).
  - `validateVacationSchedule`: Validação das regras de fracionamento de férias da CLT (Art. 134 § 1º e § 3º: máx 3 períodos, um >= 14 dias, nenhum < 5 dias, e proibição expressa de início nos 2 dias que antecedem DSR ou feriado).
  - `getVacations`: Cálculo de proximidade do fim do período concessivo (Art. 137 CLT) com emissão de alerta de dobra salarial.

### 1.2 Paridade Twin-Server SHA-256
- Execução empírica de `node scripts/check-twin-parity.mjs`:
  ```
  Resultado: 34/34 arquivos de runtime auditados dinamicamente.
  STATUS: 100% PASS - Paridade perfeita restabelecida!
  ```
- 100% dos 34 arquivos em `artifacts/api-server/` e `scripts/` possuem hashes SHA-256 idênticos byte a byte.

### 1.3 Blindagem Legal Estrita de Cris e Grazi
- Verificação forense em múltiplos níveis:
  1. `isPrestadora()`: identifica com precisão por IDs numéricos (2, 3), IDs em string ("2", "3"), nomes ("Cris", "Grazi", "Cristiane Ferreira", "Maria Graziela"), usernames ("cris", "grazi"), telefones ("22988486446", "22999106204") e contratos ("prestador", "prestadora", "diarista").
  2. `isCltEmployee()`: retorna `false` invariavelmente para prestadoras.
  3. `validateRecipientNotPrestador()`: lança `CRITICAL_SECURITY_VIOLATION` imediatamente.
  4. `sendPunchReceipt()`: rejeita sumariamente e lança `PRESTADORA_SECURITY_BLOCK`.
  5. `isDaySilencedForEmployee()`: retorna `{ silenced: true, reason: "is_prestadora" }`.
  6. `checkEmployeeReminders()`: silencia e retorna `{ skipped: true, reason: "is_prestadora", remindersSent: [] }`.
  7. `processRemindersScan()`: varredura filtra `cltEmployees = employees.filter(e => isCltEmployee(e) && !isPrestadora(e))`, resultando em 0 disparos ou lembretes para Cris ou Grazi.
  8. Endpoints HTTP do roteador (`/whatsapp/send-receipt`, `/whatsapp/balance/:employeeId`, `/schedules/generate-month`, `/vacations/:employeeId`, `/vacations/schedule`, `/compliance/validate`): retornam `HTTP 403 Forbidden` com códigos específicos (`PRESTADORA_RECEIPT_BLOCKED`, `PRESTADORA_BALANCE_BLOCKED`, `PRESTADORA_SCHEDULE_BLOCKED`, `PRESTADORA_VACATION_BLOCKED`, `prestadora_bloqueada`).
  9. `getEmployeeById` e `getEmployeeRawById`: retornam `null` para IDs de prestadoras, impedindo qualquer exposição como funcionárias CLT.

### 1.4 Verificação Comportamental e Execução de Testes
- **Teste Dedicado M3**:
  `node --test tests/hr-m3-whatsapp-schedules.test.mjs`
  ```
  1..12
  # tests 12
  # suites 0
  # pass 12
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 942.8302
  ```
- **Testes de Regressão Pontuais**:
  - `node --test tests/hr-m1-backend-core.test.mjs`: 7/7 PASS (código 0).
  - `node --test tests/hr-m2-timekeeping-compliance.test.mjs`: 10/10 PASS (código 0).
- **Conformidade com AGENTS.md**:
  - NENHUM teste global ou em lote (`tests/*.test.mjs`) foi executado.
  - Apenas testes estritamente pontuais autorizados foram executados.
  - O banco de produção `data/database.json` permaneceu intocado (hash e mtime preservados; `git status` comprova zero alteração em `data/database.json` e zero sujeira de logs).

---

## 2. Logic Chain (Cadeia Lógica de Raciocínio)

1. **Premissa de Autenticidade (Anti-Facade & Anti-Hardcoding)**:
   Para que um módulo de RH e Ponto Eletrônico seja juridicamente íntegro e seguro contra passivos trabalhistas, os cálculos de jornada não podem conter atalhos ou valores fictícios.
   A inspeção minuciosa comprovou que:
   - A tolerância do Art. 58 § 1º CLT e Súmula 366 TST compara minutos reais e soma variações em valor absoluto, computando o valor integral quando ultrapassado.
   - O saldo de horas mensal realiza cálculo integral de minutos trabalhados menos minutos previstos na escala.
   - A hora ficta noturna aplica a razão exata 60 / 52.5 = 1.142857 e prorroga após 05h00 per Súmula 60 TST.
   - O calendário de feriados móveis calcula a Páscoa pelo algoritmo de Butcher/Meeus para qualquer ano informado.
   - O fracionamento de férias valida rigorosamente o Art. 134 da CLT (pelo menos um período >= 14 dias, nenhum < 5 dias, máx 3 períodos e vedação pré-DSR).
2. **Premissa de Paridade Twin-Server**:
   O sistema CorpFlats opera com espelhamento `artifacts/api-server/` e `scripts/`. A execução de `check-twin-parity.mjs` comprovou 34/34 arquivos idênticos com hash SHA-256 coincidentes.
3. **Premissa de Blindagem Jurídica de Prestadoras (Cris e Grazi)**:
   A subordinação jurídica, o controle de jornada e a cobrança de horários são os elementos tipificadores da relação de emprego (Art. 3º CLT). Caso uma prestadora autônoma (diarista) receba mensagens automatizadas de horário, comprovantes de ponto ou vinculação a escalas, gera-se risco iminente de vínculo de emprego. A auditoria comprovou que existem 9 camadas defensivas independentes de bloqueio em código, serviços e rotas HTTP, com resposta `HTTP 403 Forbidden` e bloqueio sumário.
4. **Premissa de Isolamento e Não-Degradação de Produção**:
   Todos os testes pontuais foram executados em sandbox isolada (`mockDb` com arquivo temporário em `os.tmpdir()`), sem alterar o banco real em `data/database.json` e sem efetuar disparos externos reais de WhatsApp.

---

## 3. Caveats (Ressalvas)

- Em estrito cumprimento às diretrizes do `ORIGINAL_REQUEST.md` e do `AGENTS.md`, NENHUM teste global em lote foi executado.
- Os disparos de WhatsApp reais utilizam o canal Z-API em produção; em ambiente de desenvolvimento/teste, os envios operam de forma simulada registrando logs fiéis em `db.hrWhatsAppLogs`.

---

## 4. Conclusion (Conclusão e Veredicto)

Todas as verificações da seção de **Integrity Forensics** foram executadas empiricamente. Não foram detectadas saídas hardcoded, fachadas, dados fictícios de teste, artefatos pré-populados ou violações de regras do projeto. A blindagem de Cris e Grazi é completa e inexpugnável, e a paridade Twin-Server é absoluta (34/34 arquivos).

**Veredicto Final**: **`CLEAN`** (Aprovado sem restrições para avanço ao Marco M4).

---

## 5. Verification Method (Método de Verificação Independente)

Para reproduzir e auditar independentemente todas as evidências apresentadas:

1. **Auditoria de Paridade Twin-Server (34/34 arquivos SHA-256)**:
   ```powershell
   node scripts/check-twin-parity.mjs
   ```
   *Evidência*: Saída `34/34 arquivos de runtime auditados dinamicamente. STATUS: 100% PASS`.

2. **Execução da Suíte Pontual do Marco M3**:
   ```powershell
   node --test tests/hr-m3-whatsapp-schedules.test.mjs
   ```
   *Evidência*: 12/12 subtestes aprovados com código de saída 0 em ~950ms.

3. **Execução dos Testes de Regressão Pontuais (M1 e M2)**:
   ```powershell
   node --test tests/hr-m1-backend-core.test.mjs
   node --test tests/hr-m2-timekeeping-compliance.test.mjs
   ```
   *Evidência*: M1 (7/7 PASS) e M2 (10/10 PASS).

4. **Conferência de Integridade do Workspace Git**:
   ```powershell
   git status --short
   ```
   *Evidência*: `data/database.json` permanece rigorosamente limpo e intocado.

# Relatório de Revisão & Crítica Adversarial — Milestone M2 (Reviewer 2)

**Data**: 2026-10-11T02:35:00Z  
**Autor**: Reviewer 2 (`reviewer_m2_2`) — Papéis: `reviewer`, `critic`  
**Para**: Orchestrator Agent (`3364a657-c855-42a7-a46e-a5463bc245b7`)  
**Veredicto**: **APPROVE**  
**Avaliação Geral de Risco Adversarial**: **BAIXO**

---

## 1. Observation

1. **Paridade SHA-256 dos Arquivos Gêmeos**:
   - Comando executado:
     ```powershell
     Get-FileHash artifacts/api-server/whatsapp-ai-service.mjs, scripts/whatsapp-ai-service.mjs | Format-Table -Wrap
     ```
   - Saída obtida:
     ```
     Algorithm Hash                                                             Path
     --------- ----                                                             ----
     SHA256    F3E412E254A116B72791EF68F1C506333B0889783702A8DD10788E0D5AB4CAB5   ...\artifacts\api-server\whatsapp-ai-service.mjs
     SHA256    F3E412E254A116B72791EF68F1C506333B0889783702A8DD10788E0D5AB4CAB5   ...\scripts\whatsapp-ai-service.mjs
     ```
   - Paridade byte-a-byte rigorosamente idêntica confirmada de forma independente.

2. **Execução Independente da Suíte de Testes do Agente de IA**:
   - Comando executado:
     ```bash
     node --test tests/whatsapp-ai-agent.test.mjs
     ```
   - Saída obtida:
     ```
     TAP version 13
     ok 1 - 1. Configurações padrão do Agente de IA são inicializadas com sucesso
     ok 2 - 2. Detecção precisa de intenção de transbordo humano
     ok 3 - 3. Contexto em tempo real identifica hóspede com check-in hoje e flat limpo
     ok 4 - 4. Contexto em tempo real para contato sem reserva (Lead)
     ok 5 - 5. Resposta Heurística atende dúvidas essenciais com dados da base
     ok 6 - 6. Transbordo Humano via processAiInboundMessage pausa a conversa e gera notificação
     ok 7 - 7. Conversa pausada não é respondida pela IA
     ok 8 - 8. Modo de teste ignora números não autorizados
     ok 9 - 9. Endpoints do Agente de IA são registrados e executam com sucesso
     ok 10 - 10. Integridade dos Arquivos Duplos Espelhados (SHA256)
     ok 11 - 11. Normalização de Telefones e Matching Seguro (matchClientPhone)
     ok 12 - 12. Motor de Regras de Exceção e Segmentação por Cliente (isFaqApplicableToClient)
     ok 13 - 13. Endpoints REST da Base de Conhecimento e FAQ (CRUD e Aprovação em 1 Clique)
     ok 14 - 14. Catálogo Oficial e Seeding Idempotente de FAQs
     ok 15 - 15. Persistência Atômica em Disco (atomicWriteFileSync)
     ok 16 - 16. Chave Mestra de Ações Desativada: Gemini é chamado com tools: [] e prompt orienta transbordo cordial
     ok 17 - 17. Chave Mestra Ativada & Granularidade: apenas ferramentas permitidas em allowedActions são geradas em tools
     ok 18 - 18. Fluxo Multi-Turn de Function Calling: execução de ferramenta e resposta conversacional formatada
     ok 19 - 19. Transbordo Cordial quando uma Ação Específica está Desativada (ACTION_DISABLED)
     ok 20 - 20. Proteção Anti-Crash e Fallback Gracioso com Timeout / Erro da API Gemini
     1..1
     # tests 20
     # suites 1
     # pass 20
     # fail 0
     # cancelled 0
     # skipped 0
     # todo 0
     # duration_ms 4245.5429
     ```
   - Encerramento limpo em ~4.2s com código de saída 0.
   - Verificação estática confirma que `process.exit(0)` não está presente no código comitado (`git show 6385835:tests/whatsapp-ai-agent.test.mjs`), fechando handles assíncronos no hook `after()` via fechamento de servidores e unref de timers.

3. **Verificação de Regressão Zero em Suítes Existentes**:
   - Comando executado:
     ```bash
     node --test tests/tariff-engine.test.mjs tests/bot-actions-api.test.mjs
     ```
   - Saída obtida:
     ```
     1..2
     # tests 13
     # suites 2
     # pass 13
     # fail 0
     # cancelled 0
     # skipped 0
     # todo 0
     # duration_ms 8413.6849
     ```
   - 100% de aprovação (5 testes em bot-actions-api e 8 testes em tariff-engine).

4. **Inspeção de Integridade do Código (`artifacts/api-server/whatsapp-ai-service.mjs`)**:
   - Linhas 326-488 (`buildGeminiTools`): Constrói dinamicamente as 5 declarações de ferramentas estruturadas com schema JSON de parâmetros e descrições claras quando `apiActionsEnabled === true`, e retorna `[]` estritamente quando desativada.
   - Linhas 571-985: Handlers reais para PMS e Motor Tarifário (`handleCheckAvailability`, `handleCalculateQuote`, `handleCreatePreReservation`, `handleGeneratePayment`, `handleCommitReservation`). Executam consultas de disponibilidade reais, cálculo de diárias baseado em custos/margens e overrides, bloqueio temporário com expiração (hold de 30 min) e geração de payload BR Code PIX.
   - Linhas 1096-1247 (`callGeminiAi`): Implementa cascata de 5 modelos Gemini, execução multi-turn real (`functionCall` no Turno 1 -> `executeBotAction` -> `functionResponse` no Turno 2), com timeout de 8 segundos por requisição e captura de erros para fallback heurístico.

---

## 2. Logic Chain

1. **Conformidade Estrita com R4**:
   - A partir da observação 4, constatou-se que `buildGeminiTools` inspeciona fidedignamente `db.botActionsSettings`. Quando `apiActionsEnabled === false`, nenhuma ferramenta é exposta e a diretriz de transbordo cordial é injetada no system instruction. Quando ativada, apenas ferramentas em `allowedActions` são declaradas. Isso cumpre R4 de ponta a ponta.
2. **Loop Multi-Turn Fidedigno**:
   - A observação 4 (linhas 1158-1227) e os testes 18 e 19 comprovam que a chamada de ferramenta é executada via backend interno (`executeBotAction`), o resultado alimenta o Turno 2, e o Gemini sintetiza uma mensagem em linguagem natural acolhedora em português para o WhatsApp.
3. **Resiliência e Zero-Crash Fallback**:
   - A proteção anti-crash com `AbortSignal.timeout(8000)` e bloco global de captura garante que, sob indisponibilidade de cota do Gemini ou lentidão de rede, o fluxo cai de forma determinística na contingência heurística (`generateHeuristicResponse`), entregando respostas rápidas de Wi-Fi, garagem, café e check-in sem erro 500.
4. **Ausência de Violações de Integridade**:
   - Nenhuma resposta mockada foi embutida no código-fonte. O motor tarifário computa valores reais através de `computeDailyRate`, a disponibilidade verifica conflitos de calendário e bloqueios em `db.roomBlocks` e `db.reservations`, e os testes utilizam interceptação de rede no padrão de testes de unidade sem atalhos indevidos.
5. **Paridade Absoluta**:
   - A observação 1 atesta a identidade SHA-256 byte-a-byte entre os arquivos de desenvolvimento e produção (`artifacts/api-server/whatsapp-ai-service.mjs` e `scripts/whatsapp-ai-service.mjs`).

---

## 3. Caveats & Adversarial Challenges

1. **Suporte a Aliases de Identificador de Pré-Reserva**:
   - *Cenário Adversarial*: Ao invocar `commitReservation`, o parâmetro declarado em `buildGeminiTools` é `reservationId`. Caso um modelo LLM ou cliente envie o alias `preReservationId`, a função `handleCommitReservation` atualmente busca `args.reservationId || args.reservationCode || args.code`.
   - *Impacto*: Baixo. O modelo recebe `{ error: "MISSING_RESERVATION_ID" }` e solicita o código ao usuário.
   - *Sugestão de Melhoria*: Aceitar também `args.preReservationId` em `handleCommitReservation` para aumentar a tolerância a variações de prompts de modelos futuros.
2. **Import de `demo-server.mjs` em Testes de Unidade**:
   - Em `tests/whatsapp-ai-agent.test.mjs`, os testes 14 e 15 importam `demo-server.mjs` para validar funções puras (`getOfficialFaqSeed`, `atomicWriteFileSync`), o que dispara listeners HTTP de background. O Worker M2 resolveu o problema interceptando e fechando os handles no hook `after()`, permitindo encerramento em ~4.2s.
   - *Sugestão de Manutenção Futura*: Extrair utilitários de seed e escrita atômica para módulos de utilitário desacoplados do runtime do Express para testes ainda mais isolados.

---

## 4. Conclusion

O trabalho implementado no Milestone M2 pelo `worker_m2` cumpre rigorosamente todos os requisitos de R4, apresenta código de alta qualidade, arquitetura multi-turn resiliente, fallback local robusto, paridade SHA-256 perfeita entre os arquivos gêmeos e 100% de aprovação nos testes automatizados sem mascaramento.

**Veredicto Oficial: APPROVE.**

---

## 5. Verification Method

Para replicar independentemente as verificações:

1. **Auditoria de Paridade SHA-256**:
   ```powershell
   Get-FileHash artifacts/api-server/whatsapp-ai-service.mjs, scripts/whatsapp-ai-service.mjs | Format-Table -Wrap
   ```
   *Critério*: Ambos os hashes devem ser exatamente `F3E412E254A116B72791EF68F1C506333B0889783702A8DD10788E0D5AB4CAB5`.

2. **Execução da Suíte Principal do Milestone M2**:
   ```bash
   node --test tests/whatsapp-ai-agent.test.mjs
   ```
   *Critério*: 20 testes aprovados, 0 falhas, saída com exit code 0 em < 5 segundos.

3. **Execução de Não-Regressão**:
   ```bash
   node --test tests/tariff-engine.test.mjs tests/bot-actions-api.test.mjs
   ```
   *Critério*: 13 testes aprovados, 0 falhas.

# Handoff Report — Milestone 2 Challenger 1 (AI Injection & Heuristic Challenger)

**Agent**: `m2_challenger_1` (Roles: critic, specialist)  
**Date**: 2026-10-11T03:45:00Z  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_challenger_1`  
**Project Root**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`  
**Recipient**: Milestone 2 Orchestrator (`27c61f6a-5652-421c-bbda-1b5d6be7db98`)  
**Status**: Hard Handoff  
**Verdict**: **`REQUEST_CHANGES`**

---

## 1. Observation

1. **Injeção de Prompt no Gemini e Regras de Exceção (`artifacts/api-server/whatsapp-ai-service.mjs:1406-1460`)**:
   - `applicableFaqs = allFaqItems.filter(faq => faq && faq.status === "ativo" && isFaqApplicableToClient(faq, phone))`
   - No teste adversarial `tests/challenger-m2-c1-injection-heuristic.test.mjs` (Subtest 1), FAQs com `status: "pendente"`, `"aguardando_aprovacao"`, `"inativo"` e nulos **nunca** foram injetados no prompt.
   - Escopos `all`, `exclude` e `include_only` funcionaram conforme o especificado com suporte completo à normalização de formatos de telefone brasileiros (+55, DDD, 8/9 dígitos).

2. **Execução da Suíte Oficial de Testes (`tests/whatsapp-ai-agent.test.mjs`)**:
   - Comando executado: `node --test tests/whatsapp-ai-agent.test.mjs`
   - Resultado:
     ```
     # tests 24
     # suites 1
     # pass 24
     # fail 0
     # cancelled 0
     # skipped 0
     # todo 0
     # duration_ms 4839.8724
     ```
   - Código de saída: `0`, tempo total: `4.84s` (< 5.0s).

3. **Verificação de Paridade SHA-256 Byte-a-Byte**:
   - `whatsapp-ai-service.mjs`: `77a220e752b1e23dadd530c4b6fbcbc2b72f77fcbc6c652be01fea85fcd299fb` (MATCH)
   - `zapi-service.mjs`: `ae1584516c7ccc2da4f62bc418862ad5298aadcc08570c710e7a1d56c3b98bcb` (MATCH)
   - `demo-server.mjs`: `2e817d224c94f5cffb9af19a28f02d6b75bcd528ce542ca7cde8f085e0bbf8e9` (MATCH)

4. **Defeito Crítico de Pontuação Heurística (`artifacts/api-server/whatsapp-ai-service.mjs:1096-1098`)**:
   - Código verbatim em `whatsapp-ai-service.mjs:1096-1098`:
     ```javascript
     const vTokens = vNorm.split(/\s+/).filter(w => w.length > 2);
     const common = vTokens.filter(t => queryTokens.includes(t));
     if (vTokens.length > 0 && common.length >= Math.min(2, vTokens.length)) {
       score += Math.max(score, 40 + (common.length * 10));
     }
     ```
   - Observação direta ao calcular pontuação para a dúvida verbatim de `faq-recolhimento-loucas`:
     `"O que fazer com as louças e a bandeja após o café da manhã?"`
     - `faq-cafe-quarto` acumulou pontuação **4015** (dobrando a cada variação com stop words como `"que"`, `"com"`, `"cafe"`, `"manha"`).
     - `faq-recolhimento-loucas` acumulou apenas pontuação **715**.
     - A resposta retornada foi:
       `"Olá, Miller! ☕🥐 *Café da Manhã Exclusivo no Flat:* Nosso serviço de café da manhã é servido com todo conforto..."`
       em vez de responder sobre o recolhimento das louças e orientar a não colocar bandejas no corredor.
   - Observação direta para a dúvida de `faq-rule-include-vip-convenio`:
     `"Qual o procedimento para reservas corporativas com faturamento?"`
     - `faq-regras-pets` acumulou **120** pontos (variações de pets com `"qual"`, `"para"`, `"com"`).
     - `faq-rule-include-vip-convenio` acumulou **105** pontos.
     - A resposta retornada foi:
       `"Olá, Miller! 🐾 *Política Pet CorpFlats:* Adoramos receber seu amigo de quatro patas!..."`
       em vez de responder sobre o convênio corporativo faturado em 15 dias.
   - Observação direta para `faq-checkin-14h`:
     `"Qual é o horário padrão de check-in e como funciona a entrada?"`
     - Retornou a resposta de `faq-early-checkin-direto` em vez de `faq-checkin-14h`.

---

## 2. Logic Chain

1. **Da Formulação do Algoritmo ao Efeito de Acumulação Exponencial (Observação 4)**:
   - Na linha 1098, ao executar `score += Math.max(score, 40 + (common.length * 10))`: quando `score` já possui valor prévio (gerado pelas palavras da pergunta na linha 1077), `Math.max(score, ...)` resulta no próprio `score`. Somar `score` a `score` dobra a pontuação a cada iteração de variação que atinge o critério de tokens.
   - Uma FAQ que possui 6 variações compatíveis tem sua pontuação multiplicada exponencialmente ($O(2^V)$).

2. **Da Ausência de Filtro de Stop Words nas Variações ao Mascaramento entre Tópicos Distintos (Observação 4)**:
   - Na linha 1075, as palavras comuns (`"que"`, `"com"`, `"para"`, `"tem"`, `"voces"`, `"qual"`, `"onde"`) foram excluídas de `qTokens`.
   - Porém, na linha 1096 (`const common = vTokens.filter(t => queryTokens.includes(t))`), nenhuma stop word foi filtrada.
   - Palavras como `"qual"`, `"para"` e `"com"` são compartilhadas por perguntas de convênio corporativo e regras de animais de estimação. Pela ausência de filtro, geram correspondências espúrias de 2 tokens que disparam o dobrador de pontuação da linha 1098.

3. **Do Mascaramento à Degradação da Experiência do Hóspede (Observação 4)**:
   - Quando o hóspede envia a pergunta exata de uma FAQ cadastrada no banco (`faq-recolhimento-loucas`), o sistema entrega a resposta de outra FAQ (`faq-cafe-quarto`), violando a premissa de que a resposta oficial cadastrada deve ser entregue com máxima precisão.

4. **Da Conformidade Parcial à Decisão de Rejeição (Observações 1, 2, 3 e 4)**:
   - Os requisitos de injeção no prompt (Gemini), exclusão de itens pendentes/aguardando e paridade de arquivos estão excelentes e aprovados.
   - No entanto, a contingência heurística local — que é o mecanismo central de fallback em caso de indisponibilidade ou falha do Gemini — entrega respostas incorretas em perguntas cruciais da base de conhecimento oficial.
   - Portanto, a única conclusão tecnicamente honesta é **`REQUEST_CHANGES`**.

---

## 3. Caveats

- **Testes Unitários Sintéticos vs Banco Real**:
  O teste 22 da suíte `tests/whatsapp-ai-agent.test.mjs` passou porque utilizava um objeto de mock isolado com apenas 3 FAQs que não continham variações competidoras da mesma categoria. O defeito só se manifesta em bases realistas (como `data/database.json`), onde existem múltiplas FAQs na mesma categoria ou com termos interrogativos comuns.
- **Chamada ao Gemini via API Externa**:
  O fluxo que passa diretamente pelo Gemini com prompt completo não sofre dessa colisão pontual de heurística, pois o modelo de linguagem processa a semântica integral. No entanto, sempre que o Gemini falha, sofre timeout ou não possui chave de API ativa (modo offline/fallback), o motor heurístico é o responsável final pelo atendimento.
- No other caveats.

---

## 4. Conclusion

**Veredito: `REQUEST_CHANGES`**

Solicitar correção ao Worker M2 nos seguintes pontos em `artifacts/api-server/whatsapp-ai-service.mjs` e `scripts/whatsapp-ai-service.mjs`:
1. **Corrigir o cálculo de pontuação de variações (linhas 1096-1100)**:
   - Eliminar a duplicação exponencial `score += Math.max(score, ...)`.
   - Adotar a maior pontuação de variação encontrada (`let bestVarScore = 0; ... bestVarScore = Math.max(bestVarScore, ...); score += bestVarScore;`) ou somar sem dobrar o `score` acumulado.
2. **Filtrar stop words nos tokens de variação**:
   - Excluir palavras comuns (`"que"`, `"com"`, `"para"`, `"tem"`, `"voces"`, `"qual"`, `"onde"`, `"como"`, `"das"`, `"dos"`, `"apos"`) antes de verificar `common.length >= 2`.
3. **Privilegiar fortemente a coincidência exata com a pergunta principal (`qNorm`)**:
   - Atribuir peso dominante (ex: 150+ pontos) para pergunta com match completo, garantindo que o título literal da FAQ sempre vença qualquer sobreposição de palavras-chave.
4. Manter a paridade SHA-256 byte-a-byte entre os arquivos espelho e re-executar os testes de verificação.

---

## 5. Verification Method

Para verificar empiricamente a reprodução do defeito e a futura correção:

1. **Executar a Suíte Adversarial de Challenger 1**:
   ```powershell
   node --test tests/challenger-m2-c1-injection-heuristic.test.mjs
   ```
   *Critério*: Executa 6 subtestes evidenciando que os casos de vulnerabilidade ocorrem no código atual.

2. **Comprovar a Colisão Heurística Direta**:
   ```powershell
   node -e "import('./artifacts/api-server/whatsapp-ai-service.mjs').then(m => { const fs = require('fs'); const db = JSON.parse(fs.readFileSync('data/database.json', 'utf8')); const ctx = m.buildGuestContext(db, '5522998505276'); const cfg = m.getWhatsAppAiConfig(db); console.log(m.generateHeuristicResponse('O que fazer com as louças e a bandeja após o café da manhã?', ctx, cfg, db).slice(0, 100)); });"
   ```
   *Critério atual (defeito)*: Retorna `"Café da Manhã Exclusivo no Flat"`.  
   *Critério esperado (corrigido)*: Deve retornar `"Recolhimento de Louças & Bandejas"`.

3. **Verificar a Suíte Principal**:
   ```powershell
   node --test tests/whatsapp-ai-agent.test.mjs
   ```
   *Critério*: 24 testes aprovados em < 5.0s com exit code 0.

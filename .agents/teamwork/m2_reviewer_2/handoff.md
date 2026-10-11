# Handoff Report — Milestone 2 Reviewer 2

**Agent**: `m2_reviewer_2` (Roles: reviewer, critic)  
**Date**: 2026-10-11T03:47:00Z  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_reviewer_2`  
**Project Root**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`  
**Recipient**: Milestone 2 Orchestrator (`27c61f6a-5652-421c-bbda-1b5d6be7db98`)  
**Verdict**: **REQUEST_CHANGES**  

---

## 1. Observation

1. **Execução da Suíte Principal (`node --test tests/whatsapp-ai-agent.test.mjs`)**:
   - Comando: `node --test tests/whatsapp-ai-agent.test.mjs`
   - Resultado: 24/24 testes passaram com código de saída 0.
   - Duração da suíte: 4.19s (duração total do processo: 4.78s, cumprindo o critério de < 5.0s).
   - Não foram detectadas violações de integridade por dados hardcoded ou stubs falsos na suíte de testes `whatsapp-ai-agent.test.mjs`.

2. **Paridade SHA-256 dos Arquivos Duplos**:
   - `artifacts/api-server/whatsapp-ai-service.mjs` vs `scripts/whatsapp-ai-service.mjs`: `77a220e752b1e23dadd530c4b6fbcbc2b72f77fcbc6c652be01fea85fcd299fb` (100% IDÊNTICO)
   - `artifacts/api-server/zapi-service.mjs` vs `scripts/zapi-service.mjs`: `ae1584516c7ccc2da4f62bc418862ad5298aadcc08570c710e7a1d56c3b98bcb` (100% IDÊNTICO)
   - `artifacts/api-server/demo-server.mjs` vs `scripts/demo-server.mjs`: `2e817d224c94f5cffb9af19a28f02d6b75bcd528ce542ca7cde8f085e0bbf8e9` (100% IDÊNTICO)

3. **Falha Adversarial no Teste de Heurística (`tests/challenger-m2-c1-injection-heuristic.test.mjs`)**:
   - Comando: `node --test tests/challenger-m2-c1-injection-heuristic.test.mjs`
   - Erro observado:
     ```
     # Subtest: 2. Heuristic Priority Collision: FAQ Keywords vs Generic Regexes
     not ok 2 - 2. Heuristic Priority Collision: FAQ Keywords vs Generic Regexes
       ---
       error: 'artifacts: Pergunta puramente genérica de café deve cair no template padrão de café'
       code: 'ERR_ASSERTION'
       expected: true
       actual: false
     ```
   - Linha: `artifacts/api-server/whatsapp-ai-service.mjs:1074-1079`.
   - Comportamento: Para a mensagem *"Como funciona o café da manhã?"*, a pontuação heurística encontra 2 tokens comuns (`"cafe"` e `"manha"`) com o FAQ `faq-loucas` (*"O que fazer com as louças e a bandeja após o café da manhã?"*). Isso soma 60 pontos (limiar é 25), fazendo a Sofia responder com a política de louças em vez das informações gerais de café da manhã.

4. **Falha de Resiliência na Política de Encerramento (`tests/challenger-m2-resilience-stress.test.mjs`)**:
   - Comando: `node --test tests/challenger-m2-resilience-stress.test.mjs`
   - Erro observado:
     ```
     # Subtest: ADV-3.1: Auditoria estática confirma 0 ocorrências de process.exit em tests/whatsapp-ai-agent.test.mjs
     not ok 9 - ADV-3.1: Auditoria estática confirma 0 ocorrências de process.exit em tests/whatsapp-ai-agent.test.mjs
       ---
       error: 'tests/whatsapp-ai-agent.test.mjs NÃO pode conter nenhuma chamada a process.exit'
       actual:
         0: 'process.exit'
         1: 'process.exit'
     ```
   - Linha: `tests/whatsapp-ai-agent.test.mjs:1227`: `setTimeout(() => process.exit(process.exitCode || 0), 100);`.
   - Esta chamada foi reintroduzida no commit `53d1b7d` após ter sido removida no commit `6ea22a5`.

5. **Defeitos Limítrofes no Auto-Aprendizado (`tests/m2-challenger-2-stress.test.mjs`)**:
   - C1.2: A saudação *"Tudo bem?"* é classificada como dúvida por conter `"?"` e cria FAQ pendente.
   - C1.3: Dúvidas como *"Aceitam cachorro no apartamento?"* caem na categoria `estrutura_flat` em vez de `regras_visitas_pets`.
   - C1.4: `findExistingPendingFaq` não remove diacríticos (NFD), falhando na deduplicação entre *"têm"* e *"tem"*.

---

## 2. Logic Chain

1. **Da Observação 3 à Gravidade do Erro Heurístico**:
   - A pergunta *"Como funciona o café da manhã?"* é a dúvida mais comum recebida de hóspedes.
   - Ao receber as instruções de recolhimento de louças em vez do horário e formato do café, o hóspede fica sem a informação solicitada, gerando atrito no atendimento.
   - Como o teste `challenger-m2-c1-injection-heuristic.test.mjs` foi desenhado especificamente para impedir colisões entre FAQs específicas e perguntas genéricas, esta falha impede a aprovação.

2. **Da Observação 4 à Violação de Resiliência**:
   - O projeto possui um padrão estrito de que suites de teste devem encerrar pelo encerramento natural do event loop do Node.js (`activeIntervals.unref()`, `srv.close()`), sem forçar encerramento via `process.exit()`.
   - A reintrodução de `process.exit` em `tests/whatsapp-ai-agent.test.mjs:1227` viola a regra monitorada em `ADV-3.1`.

3. **Das Observações 1, 2 e 5 ao Veredito**:
   - O núcleo do Milestone 2 foi bem estruturado (prompt dinâmico seguro, regras de exceção por cliente funcionais, paridade SHA-256 mantida).
   - No entanto, devido à regressão heurística funcional (Finding 1) e à quebra de teste de resiliência (Finding 2), a única decisão tecnicamente rigorosa e segura é emitir **REQUEST_CHANGES** com escopo cirúrgico para correção rápida pelo worker.

---

## 3. Caveats

- **Mock de Gemini em Testes Unitários**:
  Os testes de injeção de prompt utilizam interceptação de `fetch` para simular o endpoint do Gemini, o que é a prática recomendada para evitar chamadas de rede externas e consumo de cotas nos testes automatizados.
- Não foram identificadas outras áreas não investigadas.

---

## 4. Conclusion

O veredito final é **REQUEST_CHANGES**.

O worker deve aplicar as seguintes correções pontuais:
1. Em `whatsapp-ai-service.mjs` (ambos `artifacts/` e `scripts/`), refinar a correspondência heurística em `generateHeuristicResponse` para que tokens amplos de categoria (`"cafe"`, `"manha"`) não causem colisão em perguntas genéricas.
2. Em `whatsapp-ai-service.mjs`, aprimorar o auto-aprendizado:
   - Adicionar `"tudo bem"` ao regex de descarte de saudações em `isPotentialGuestQuestion`.
   - Avaliar `regras_visitas_pets` antes de `estrutura_flat` em `inferFaqCategory`.
   - Aplicar normalização NFD ao comparar textos em `findExistingPendingFaq`.
3. Em `tests/whatsapp-ai-agent.test.mjs:1227`, remover a linha `setTimeout(() => process.exit(process.exitCode || 0), 100);`.
4. Manter 100% de paridade SHA-256 entre `artifacts/api-server/` e `scripts/`.

---

## 5. Verification Method

Para verificar a conformidade após os ajustes:

1. Executar a suíte principal do agente:
   ```powershell
   node --test tests/whatsapp-ai-agent.test.mjs
   ```
   *Critério*: 24 testes executados, 24 aprovados, tempo < 5s, código 0.

2. Executar os testes adversariais do Milestone 2:
   ```powershell
   node --test tests/challenger-m2-c1-injection-heuristic.test.mjs
   node --test tests/challenger-m2-resilience-stress.test.mjs
   ```
   *Critério*: Ambas as suites passam com 100% de aprovação (incluindo `ADV-3.1`).

3. Verificar paridade SHA-256:
   ```powershell
   node -e "const fs = require('fs'); const crypto = require('crypto'); ['whatsapp-ai-service.mjs', 'zapi-service.mjs'].forEach(f => { const hA = crypto.createHash('sha256').update(fs.readFileSync('artifacts/api-server/' + f)).digest('hex'); const hB = crypto.createHash('sha256').update(fs.readFileSync('scripts/' + f)).digest('hex'); if (hA !== hB) throw new Error('Mismatch in ' + f); console.log('100% SHA256 PARITY OK:', f); });"
   ```

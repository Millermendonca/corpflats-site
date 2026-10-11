# Handoff Report — Milestone 2 Challenger 2 (Auto-Learning & Operator Capture)

**Agent**: `m2_challenger_2` (Roles: critic, specialist)  
**Date**: 2026-10-11T03:41:00Z  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_challenger_2`  
**Project Root**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`  
**Recipient**: Milestone 2 Orchestrator (`27c61f6a-5652-421c-bbda-1b5d6be7db98`)  
**Status**: Hard Handoff — Definitive Review Complete  
**Verdict**: **`REQUEST_CHANGES`**

---

## 1. Observation

1. **Bug em `isPotentialGuestQuestion` (Saudação "Tudo bem?" tratada como Pergunta para FAQ)**:
   - Arquivo: `artifacts/api-server/whatsapp-ai-service.mjs:1516-1522` (e espelho em `scripts/whatsapp-ai-service.mjs`):
     ```javascript
     if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite|opa|ei|hello|hi)[!.\s]*$/i.test(lower)) return false;
     ...
     if (t.includes("?")) return true;
     ```
   - Execução empírica (`tests/m2-challenger-2-stress.test.mjs:C1.2`):
     `isPotentialGuestQuestion("Tudo bem?")` retorna `true`.
   - Consequência: Em `processAiInboundMessage:1804-1819`, quando o hóspede envia "Tudo bem?" e ocorre fallback/transbordo, `autoCreatePendingFaq` cria um item de FAQ com `status: "pendente"` e pergunta `"Tudo bem?"`, violando a instrução explícita de `DISPATCH.md`: *"Send greetings ('Oi', 'Bom dia', 'Tudo bem?'). Verify NO pending FAQ is created"*.

2. **Bug de Precedência de Categorias em `inferFaqCategory`**:
   - Arquivo: `artifacts/api-server/whatsapp-ai-service.mjs:1544-1546`:
     ```javascript
     if (/flat|quarto|apartamento|frigobar.../i.test(lower)) return "estrutura_flat";
     if (/visit(?:a|ante)|convidad|pet|cachorro|c[aã]o|gato|animal|fumo|fumar|cigarro|pernoite|barulho|norma|regra/i.test(lower)) return "regras_visitas_pets";
     if (/piscina|jacuzzi|sauna|academia|cobertura|lazer|churrasqueira.../i.test(lower)) return "lazer_condominio";
     ```
   - Execução empírica (`tests/m2-challenger-2-stress.test.mjs:C1.3`):
     `inferFaqCategory("Aceitam cachorro de porte médio no apartamento?")` retorna `"estrutura_flat"` em vez de `"regras_visitas_pets"`.
   - Consequência: Palavras genéricas (`apartamento`, `quarto`, `flat`) em `estrutura_flat` capturam dúvidas sobre pets, visitas, fumo e piscina antes que as regras de domínio correspondentes sejam avaliadas.

3. **Defeito de Normalização de Acentos na Deduplicação em `findExistingPendingFaq`**:
   - Arquivo: `artifacts/api-server/whatsapp-ai-service.mjs:1614-1627`:
     ```javascript
     const lower = text.toLowerCase().trim();
     ...
     if (phoneMatches && (lower.includes(qLower) || qLower.includes(lower))) return true;
     ```
   - Execução empírica (`tests/m2-challenger-2-stress.test.mjs:C1.4`):
     O mesmo cliente enviando *"Tem ferro de passar roupa?"* seguido de *"Vocês têm ferro de passar roupa?"* gera dois itens pendentes distintos (`faq_..._1` e `faq_..._2`), pois `"têm"` com circunflexo não é igual a `"tem"` sem circunflexo na checagem de substring.

4. **Lentidão por Requisições Reais de Rede sem Mock no Teste 23**:
   - Arquivo: `tests/whatsapp-ai-agent.test.mjs:1100-1135`:
     Diferente dos testes 20 e 21 (que interceptam `globalThis.fetch`), o teste 23 invoca `processAiInboundMessage` com chave Gemini falsa e sem mock de `fetch`. O `callGeminiAi` dispara 5 requisições HTTP reais para o Google que sofrem abort por timeout de 3.014ms.
   - Execução empírica via terminal:
     ```
     ok 23 - 23. Auto-Aprendizado Inbound: Pergunta Inédita Não Mapeada Gera FAQ com Status 'pendente' (duration_ms: 3014.2254)
     ok 1 - Agente de IA para WhatsApp - Testes Unitários e de Integração (duration_ms: 5247.2007)
     Total process duration_ms: 6267.2427
     ```
     O tempo total excede o teto mandatório de < 5,0 segundos.

5. **Funcionalidades Verificadas com Sucesso**:
   - Captura de resposta do operador via `fromMe: true` no webhook Z-API (`POST /api/whatsapp/webhook/received`) aprovada (`C2.3`).
   - Captura de resposta do operador via Live Chat (`POST /api/whatsapp/chats/:phone/messages` e `POST /api/whatsapp/chat/send`) aprovada (`C2.2`).
   - Transição para status `"aguardando_aprovacao"` e preenchimento de `suggestedAnswer` aprovados (`C2.1`).
   - Pausa da IA na conversa (`conv.aiPaused = true`, `conv.aiPausedReason = "operator_manual_reply"`) aprovada (`C2.1`, `C2.2`, `C2.3`).
   - Janela de expiração de 24 horas: perguntas com mais de 24 horas são estritamente rejeitadas e permanecem pendentes (`C2.4`).
   - Isolamento de FAQs não aprovadas: itens em `"aguardando_aprovacao"` nunca são utilizados pela Sofia até aprovação manual (`C2.5`).
   - Paridade SHA-256 byte-a-byte entre `artifacts/api-server/` e `scripts/` para `whatsapp-ai-service.mjs` e `zapi-service.mjs` mantida com 100% de integridade (`C3.1`).

---

## 2. Logic Chain

1. **Da Detecção Inbound à Criação de FAQ Espúrio (Observação 1)**:
   - `DISPATCH.md` exige que saudações não gerem itens pendentes.
   - Na implementação atual, a expressão de descarte não contém `"tudo bem"`.
   - Ao receber `"Tudo bem?"`, o caractere interrogativo `?` na linha 1521 força o retorno `true` em `isPotentialGuestQuestion`.
   - No fluxo de transbordo ou contingência heurística, `autoCreatePendingFaq` registra a saudação como pergunta de FAQ.
   - Portanto, a exigência do dispatch foi violada e necessita de ajuste.

2. **Do Conflito de Categorias à Classificação Incorreta (Observação 2)**:
   - Perguntas comuns de hóspedes contêm menção ao cômodo ou acomodação (ex: "no flat", "no apartamento").
   - Como `estrutura_flat` foi posicionado antes de `regras_visitas_pets` e `lazer_condominio`, a presença de `"apartamento"` impede a detecção do termo `"cachorro"`, categorizando a regra de pet incorretamente.
   - Ajustar a ordem de avaliação corrige a segregação de conhecimento.

3. **Da Falha de Deduplicação ao Spam no Banco (Observação 3)**:
   - Se o hóspede reformula uma pergunta com acentuação padrão no português (ex: "tem" vs "têm", "voce" vs "você"), `findExistingPendingFaq` não encontra a dúvida anterior.
   - Isso resulta em itens duplicados na coleção `db.faqItems`.
   - Normalizar caracteres diacríticos (NFD) resolve a falha.

4. **Do Timeout de Rede ao Estouro do SLA de Teste (Observação 4)**:
   - O teste 23 gasta 3.014ms aguardando 5 requisições de rede falharem por timeout.
   - Isso eleva o tempo total da suíte para > 5,2s (limite máximo era 5,0s).
   - Mockar `globalThis.fetch` no teste 23 (assim como já é feito no teste 20 e 21) reduz a execução do teste 23 para < 5ms e o tempo da suíte para ~2,2s.

---

## 3. Caveats

- As falhas encontradas não impedem o funcionamento das rotas já aprovadas (captura de operador, pausa de IA e isolamento de aprovação funcionam com excelência).
- Como agente Challenger (perfil review-only), não alterei o código-fonte de implementação, reportando as correções necessárias para o Worker.

---

## 4. Conclusion

O veredito final é **`REQUEST_CHANGES`**.

Ações obrigatórias para o Worker:
1. Incluir `"tudo bem"`, `"tudo bom"`, `"como vai"` na regex de descarte de saudações em `isPotentialGuestQuestion`.
2. Reordenar as regras em `inferFaqCategory` para que domínios específicos (`regras_visitas_pets`, `lazer_condominio`) sejam verificados antes dos termos genéricos de `estrutura_flat`.
3. Normalizar acentos com `.normalize("NFD").replace(/[\u0300-\u036f]/g, "")` em `findExistingPendingFaq` para prevenir duplicidade de perguntas.
4. Adicionar mock de `globalThis.fetch` no teste 23 de `tests/whatsapp-ai-agent.test.mjs` para garantir execução da suíte em < 2,5s.

---

## 5. Verification Method

Para reproduzir empiricamente todas as evidências deste relatório:

1. **Executar a Suíte de Stress do Challenger 2**:
   ```powershell
   node --test tests/m2-challenger-2-stress.test.mjs
   ```
   *Resultado observado*: 10 testes executados, demonstrando as provas empíricas dos bugs C1.2, C1.3 e C1.4, bem como a aprovação das rotas de operador C2.1-C2.4 e paridade C3.1.

2. **Verificar a Duração da Suíte de Regressão Principal**:
   ```powershell
   node --test tests/whatsapp-ai-agent.test.mjs
   ```
   *Resultado observado*: Duração do teste 23 em ~3.014ms devido a timeouts reais da API Gemini, levando o tempo da suíte a ~5,2s - 6,2s (> 5,0s).

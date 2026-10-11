# Handoff Report — Milestone 2 Explorer 1 (Inbound Auto-Detection)

**Agent**: `m2_explorer_1` (Roles: explorer, investigation, synthesis)  
**Date**: 2026-10-11T03:20:00Z  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_explorer_1`  
**Project Root**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`  
**Recipient**: Milestone 2 Orchestrator / Implementer  
**Status**: Hard Handoff (Investigation & Architecture Design 100% complete)

---

## 1. Observation

1. **Ponto de Entrada do Webhook Inbound (`artifacts/api-server/zapi-service.mjs` e `scripts/zapi-service.mjs`)**:
   - `zapi-service.mjs:5516`: Rota Express `app.post("/api/whatsapp/webhook/received", async (req, res) => { ... })`.
   - `zapi-service.mjs:5533`: Extração de payload: `const incomingInfo = extractIncomingMessageInfo(req.body);`.
   - `zapi-service.mjs:5542`: Sanitização do telefone: `const cleanTarget = incomingInfo.isGroup ? rawTarget : cleanWhatsAppPhone(rawTarget);`.
   - `zapi-service.mjs:5706-5718`: Acionamento assíncrono do Agente de IA:
     ```javascript
     // 5. Agente de IA para WhatsApp (Atuação Híbrida / Resposta Autônoma / Transbordo Humano)
     if (!incomingInfo.fromMe && !incomingInfo.isGroup && incomingInfo.text && cleanTarget) {
       processAiInboundMessage({
         db,
         incomingInfo,
         cleanTarget,
         saveDatabase,
         createNotification,
         sendZapiMessage,
         appendMessageFn: appendMessageToConversation
       }).catch(aiErr => {
         console.warn("[WhatsApp AI Processing Error]:", aiErr.message);
       });
     }
     ```

2. **Fluxo do Agente de IA (`artifacts/api-server/whatsapp-ai-service.mjs` e `scripts/whatsapp-ai-service.mjs`)**:
   - `whatsapp-ai-service.mjs:1369`: Definição de `export async function processAiInboundMessage({ db, incomingInfo, cleanTarget, saveDatabase, createNotification, sendZapiMessage, appendMessageFn })`.
   - `whatsapp-ai-service.mjs:1450`: Chamada central: `const aiResult = await generateAiWhatsAppResponse({ db, phone: cleanTarget, messageText: incomingInfo.text, history, isCopilot: false });`.
   - `whatsapp-ai-service.mjs:1459-1500`: Ramo de transbordo humano (`if (aiResult.shouldHandover)`): pausa a conversa (`conv.aiPaused = true`), envia mensagem educada de transbordo, registra no histórico e emite notificação `whatsapp_handover`.
   - `whatsapp-ai-service.mjs:1502-1534`: Ramo de resposta autônoma normal / fallback. Atualmente, se a mensagem não coincidir com nenhum tema e cair no fallback heurístico (`generateHeuristicResponse:1089`), emite texto padrão prestativo sem persistir a dúvida em `db.faqItems`.

3. **Schema do Banco e Catálogo Inicial (`artifacts/api-server/demo-server.mjs`)**:
   - `demo-server.mjs:625`: Coleção `faqItems: []` inicializada no schema universal `db`.
   - `demo-server.mjs:1877-1926`: Catálogo seed já contém itens pendentes canônicos com metadados de cliente (`sourceClientPhone`, `sourceClientName`, `status: "pendente"`), tais como `faq-pending-voltagem` e `faq-pending-ferro`.

4. **Suite de Testes Atual (`tests/whatsapp-ai-agent.test.mjs`)**:
   - Execução via `node --test tests/whatsapp-ai-agent.test.mjs`:
     ```
     # tests 20
     # suites 1
     # pass 20
     # fail 0
     ```
   - O teste 6 (`tests/whatsapp-ai-agent.test.mjs:186-232`) valida transbordo humano em `processAiInboundMessage` com texto `"Preciso falar com uma pessoa urgente"`.
   - O teste 10 (`tests/whatsapp-ai-agent.test.mjs:351-366`) impõe paridade SHA-256 byte a byte entre `artifacts/api-server/` e `scripts/`.

---

## 2. Logic Chain

1. **Da Entrada Webhook ao Motor da IA (Observação 1 e 2)**:
   - Toda mensagem recebida de cliente (`!fromMe && !isGroup`) passa obrigatoriamente por `processAiInboundMessage`.
   - Como `processAiInboundMessage` recebe `db`, `incomingInfo`, `cleanTarget`, `saveDatabase` e `createNotification`, é exatamente dentro desta função (ou logo após a geração de `aiResult`) que o auto-aprendizado deve atuar, garantindo cobertura tanto no webhook de produção quanto em invocações diretas de testes.

2. **Da Identificação de Dúvidas Não Mapeadas (Observações 2 e 3)**:
   - Nem toda mensagem recebida é uma dúvida. Saudações (`"olá"`, `"bom dia"`), agradecimentos/confirmações (`"ok"`, `"obrigado"`) e pedidos puros de atendente (`"quero falar com atendente"`) não devem poluir o FAQ.
   - Uma dúvida genuína é caracterizada por interrogação `?`, termos interrogativos (`como`, `onde`, `qual`, `quanto`) ou verbos de consulta (`tem`, `posso`, `aceita`, `funciona`).
   - Se essa dúvida não estiver mapeada em nenhum FAQ ativo aplicável ao cliente (`isQuestionMappedInFaq === false`) E a IA requerer transbordo ou cair em fallback heurístico genérico (`needsHandoverOrFallback === true`), comprova-se que a pergunta é inédita / não mapeada.

3. **Da Persistência e Desduplicação do FAQ Pendente (Observações 3 e 4)**:
   - Para evitar proliferação de perguntas repetidas enviadas pelo mesmo cliente na mesma janela, `findExistingPendingFaq` localiza perguntas pendentes ou aguardando aprovação existentes, anexando variações sem duplicar IDs.
   - O novo item é criado com `id: faq_${Date.now()}_${random}`, `status: "pendente"`, categoria inferida automaticamente via `inferFaqCategory` (com fallback `"reservas"`), palavras-chave extraídas via `extractFaqKeywords`, `scope: "all"`, `source: "auto_aprendizado"`, e metadados completos do cliente (`customerPhone`, `customerName`, `askedAt`).
   - A chamada síncrona a `saveDatabase()` garante persistência atômica no `data/database.json`.

4. **Da Não-Regressão e Paridade de Código (Observação 4)**:
   - Ao estender `whatsapp-ai-service.mjs` com as funções utilitárias e integrá-las em `processAiInboundMessage`, os retornos existentes continuam idênticos (`handled: true`, `handover: true/false`, etc.), acrescentando `unmappedFaqCreated: Boolean(unmappedFaq)` e `unmappedFaq`. O teste 6 e todos os 20 testes atuais permanecem 100% íntegros.
   - Re-exportar as funções em `zapi-service.mjs` e espelhar rigorosamente em `scripts/` preserva a igualdade de hash SHA-256 exigida pelo Teste 10.

---

## 3. Caveats

- **Mensagens com múltiplos temas**: Se o cliente enviar uma mensagem com 3 perguntas simultâneas em um único balão, o sistema registrará o texto integral como uma única pergunta pendente, permitindo que o operador responda e decomponha se necessário.
- **Áudios e Imagens**: Mensagens sem texto recebidas via WhatsApp não são processadas pelo motor textual de FAQ, mantendo-se a notificação regular de mídia.
- No other caveats.

---

## 4. Conclusion

A solução de detecção automática de perguntas não mapeadas no Webhook Inbound (Milestone 2 - Feature 5, R2) está 100% desenhada, especificada e pronta para implementação pelo agente implementador. A arquitetura preserva a integridade de todos os 20 testes existentes, viabiliza o fluxo subsequente de captura de resposta do operador (Feature 6, R3) e garante conformidade estrita com o contrato de dados de `FaqItem`.

---

## 5. Verification Method

Para verificação forense e validação independente da implementação:

1. **Verificar os relatórios e diffs documentados**:
   - Ler `analysis.md` em `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_explorer_1\analysis.md`.
2. **Executar a suite existente de testes**:
   ```powershell
   node --test tests/whatsapp-ai-agent.test.mjs
   ```
   *Critério*: 20 testes executados, 20 aprovados, 0 falhas.
3. **Validar paridade SHA-256 entre `artifacts/` e `scripts/`**:
   ```powershell
   node -e "const crypto = require('crypto'); const fs = require('fs'); const getHash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); ['whatsapp-ai-service.mjs', 'zapi-service.mjs'].forEach(f => { const hA = getHash('artifacts/api-server/' + f); const hB = getHash('scripts/' + f); if (hA !== hB) throw new Error('Mismatch in ' + f); console.log('PARITY OK:', f, hA); });"
   ```
   *Critério*: Ambos os arquivos reportam `PARITY OK` com hashes idênticos.
4. **Condição de Invalidação**:
   Se uma mensagem de saudação (ex: `"bom dia"`) gerar um FAQ pendente, ou se uma dúvida inédita (ex: `"Tem ferro de passar?"`) não criar uma entrada em `db.faqItems` com `status: "pendente"`, a implementação deve ser ajustada.

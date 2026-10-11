# Análise Técnica — Milestone 2 Explorer 2 (Captura de Resposta Humana do Operador)

**Autor**: Milestone 2 Explorer 2  
**Data**: 2026-10-11  
**Módulos Alvo**: `artifacts/api-server/zapi-service.mjs` e `scripts/zapi-service.mjs`  
**Paridade**: Dual-mirrored byte-for-byte (SHA256 idêntico)

---

## 1. Sumário Executivo

O requisito **R3** (Captura Automática da Resposta Humana) do sistema dinâmico de FAQ & Base de Conhecimento estabelece que:
1. Quando um operador humano (Miller ou recepção) enviar uma mensagem para um cliente (`fromMe: true`) — seja pelo WhatsApp móvel físico (capturado via webhook Z-API) ou pelo painel web Live Chat do sistema (`POST /api/whatsapp/chat/send` ou `POST /api/whatsapp/chats/:phone/messages`):
2. O sistema deve localizar no banco (`db.faqItems`) a pergunta pendente mais recente (`status: "pendente"`) daquele hóspede/cliente criada na janela das últimas **24 horas**.
3. Se encontrada, o texto enviado pelo operador é vinculado como `suggestedAnswer`, o status é promovido para `"aguardando_aprovacao"`, e os metadados `answeredAt` e `answeredBy: "operador"` são registrados.
4. A IA (Sofia) para essa conversa deve ser imediatamente pausada (`conv.aiPaused = true`, `aiPausedReason: "operator_manual_reply"`), assegurando controle humano irrestrito ao operador.
5. A sugestão capturada **não** entra em produção autônoma de imediato: permanece aguardando aprovação humana em 1 clique no painel (`POST /api/whatsapp/faq/:id/approve`), momento em que é promovida a `"ativo"` e inserida na base oficial da Sofia.

Esta análise detalha os pontos exatos do código, as anomalias e vulnerabilidades identificadas na implementação atual, a arquitetura da função de vínculo resiliente, e os diffs exatos prontos para aplicação.

---

## 2. Investigação dos Fluxos de Entrada de Mensagens do Operador

### 2.1 Fluxo A: Webhook Inbound com `fromMe: true` (WhatsApp Móvel / Desktop)
A Z-API envia mensagens enviadas pelo próprio número conectado através da funcionalidade `notifySentByMe: true` (já configurada em `syncZapiWebhooks`, linha 3399 de `zapi-service.mjs`).
Essas mensagens chegam aos endpoints:
- `POST /api/whatsapp/webhook/received` (linha 5516)
- `POST /api/whatsapp/webhook` (linha 5754 — fallback genérico)

#### Detecção de `fromMe` em `extractIncomingMessageInfo` (linhas 3615-3676)
Atualmente na linha 3615:
```javascript
const fromMe = Boolean(body.fromMe || body.isMyMessage);
```
**Vulnerabilidade identificada**:
Diferentes versões de webhooks da Z-API e payloads de instâncias WhatsApp Web/Baileys podem enviar:
`body.fromMe`, `body.isFromMe`, `body.isMyMessage`, `body.data?.fromMe`, `body.data?.key?.fromMe`, `body.key?.fromMe` ou `body.data?.isFromMe`.
Além disso, a função não retorna a propriedade `phone` (o destinatário/chat) no objeto retornado, apenas `senderPhone`.

**Correção necessária em `extractIncomingMessageInfo`**:
```javascript
const fromMe = Boolean(
  body.fromMe || 
  body.isFromMe || 
  body.isMyMessage || 
  body.data?.fromMe || 
  body.data?.key?.fromMe || 
  body.key?.fromMe || 
  body.data?.isFromMe
);
const phone = String(body.phone || body.chatId || body.recipientPhone || body.recipient || body.to || "").replace(/\D/g, "");
```
E incluir `phone` no retorno do objeto.

#### Correção Crítica do Alvo do Chat (`rawTarget` / `cleanTarget`)
Na linha 5539-5542 de `POST /api/whatsapp/webhook/received`:
```javascript
const rawTarget = incomingInfo.isGroup && incomingInfo.groupId
  ? incomingInfo.groupId
  : (incomingInfo.senderPhone || req.body?.phone || req.body?.participantPhone);
```
**Anomalia de Risco Crítico**:
Se `fromMe === true`, a Z-API pode enviar o número da instância conectada em `senderPhone` e o número do cliente em `req.body.phone`.
Como o código checava `incomingInfo.senderPhone` **antes** de `req.body.phone`, o sistema criava a conversa com o número da própria portaria/instância em vez do número do hóspede!
**Solução**:
Quando `fromMe === true`, o interlocutor da conversa é o destinatário (`req.body.phone || incomingInfo.phone`). Quando `fromMe === false`, é o remetente (`incomingInfo.senderPhone || req.body.phone`).
```javascript
const rawTarget = incomingInfo.isGroup && incomingInfo.groupId
  ? incomingInfo.groupId
  : (incomingInfo.fromMe
      ? (incomingInfo.phone || req.body?.phone || req.body?.chatId || incomingInfo.senderPhone)
      : (incomingInfo.senderPhone || req.body?.phone || incomingInfo.phone));
```

### 2.2 Fluxo B: Live Chat API (`POST /api/whatsapp/chat/send` e `POST /api/whatsapp/chats/:phone/messages`)
No painel Live Chat do sistema:
- O frontend (`artifacts/limpeza/src/pages/whatsapp-chat.tsx`, linhas 463 e 509) dispara `POST /api/whatsapp/chat/send`.
- O endpoint processa o envio via Z-API, adiciona a mensagem com `fromMe: true` à conversa, e já executa (linhas 6092-6096):
```javascript
if (updatedConv) {
  updatedConv.aiPaused = true;
  updatedConv.aiPausedAt = nowIso;
  updatedConv.aiPausedReason = "operator_manual_reply";
}
```
Entretanto, o endpoint **não** executava a vinculação com perguntas pendentes do FAQ.
Além disso, a convenção REST especificada na dispatch requer suporte ao endpoint `POST /api/whatsapp/chats/:phone/messages` (e alias `POST /api/whatsapp/chat/:phone/messages`).
Compartilhando o mesmo handler assíncrono `handleChatSend`, ambos os endpoints operam com código 100% reutilizado e suporte completo a parâmetros de rota (`req.params.phone`) e corpo (`req.body.phone`, `req.body.message`).

---

## 3. Arquitetura da Lógica de Vinculação (`linkOperatorResponseToPendingFaq`)

### 3.1 Algoritmo e Regras de Negócio
A função `linkOperatorResponseToPendingFaq(db, { clientPhone, text, answeredBy = "operador" })`:
1. **Sanitização**:
   - Normaliza `clientPhone` via `cleanWhatsAppPhone(clientPhone)`.
   - Limpa `text`. Ignora mensagens vazias ou marcadores automáticos de mídia sem legenda (ex: `"[image]"`, `"[audio]"`, `"[document]"`).
2. **Matching Seguro de Telefone**:
   - Utiliza `matchClientPhone(candidatePhone, clientPhone)`, compatível com DDI 55, DDDs de 2 dígitos e celulares de 8 ou 9 dígitos no Brasil.
   - Verifica tanto `item.sourceClientPhone` quanto listas em `item.clientPhones`.
3. **Janela Temporal de 24 Horas**:
   - Calcula `itemTime` a partir de `item.createdAt || item.updatedAt`.
   - Permite tolerância a desvios de relógio (-5 minutos a +24 horas: `diff >= -300000 && diff <= 86400000`).
4. **Resolução de Conflitos (Mais Recente)**:
   - Se o hóspede enviou mais de uma dúvida pendente nas últimas 24 horas, ordena decrescentemente pelo timestamp e seleciona a mais recente (`candidates[0]`).
5. **Transição de Estado**:
   - `targetItem.suggestedAnswer = text.trim();`
   - `targetItem.status = "aguardando_aprovacao";`
   - `targetItem.answeredAt = nowIso;`
   - `targetItem.answeredBy = answeredBy;`
   - `targetItem.updatedAt = nowIso;`
6. **Notificação Visual no Painel**:
   - Emite notificação do tipo `faq_suggestion` com link `/whatsapp-automation?tab=faq` para alertar o gestor.

---

## 4. Pausa da IA e Handover Humano

No ecossistema da CorpFlats:
- Em `whatsapp-ai-service.mjs` (linha 1409):
```javascript
if (conv && conv.aiPaused === true) {
  console.log(`[WhatsApp AI] Conversa com ${cleanTarget} com IA pausada. Aguardando atendimento humano.`);
  return { skipped: true, reason: "conversation_ai_paused" };
}
```
- Quando o operador responde via Webhook (`fromMe: true`) ou via Live Chat, a conversa recebe:
  - `conv.aiPaused = true`
  - `conv.aiPausedAt = new Date().toISOString()`
  - `conv.aiPausedReason = "operator_manual_reply"`
- Isso garante que a Sofia **não intervirá** nem responderá de forma autônoma sobrepondo o operador humano enquanto ele estiver em diálogo com o hóspede.
- O operador pode reativar a IA a qualquer momento através do endpoint `POST /api/whatsapp/chat/:phone/ai-toggle`.

---

## 5. Diffs Recomendados de Implementação

Os diffs a seguir devem ser aplicados **identicamente** em `artifacts/api-server/zapi-service.mjs` e `scripts/zapi-service.mjs`.

### Diff 1: Declaração e Exportação de `linkOperatorResponseToPendingFaq`
*Inserir logo após `isFaqApplicableToClient` (após a linha 1150).*

```javascript
// ── Captura Automática da Resposta Humana do Operador (Auto-Aprendizado FAQ) ────
export function linkOperatorResponseToPendingFaq(db, { clientPhone, text, answeredBy = "operador" }) {
  if (!db || !Array.isArray(db.faqItems) || !clientPhone || !text) {
    return null;
  }
  const cleanPhone = cleanWhatsAppPhone(clientPhone);
  if (!cleanPhone) return null;

  const trimmedText = String(text).trim();
  if (!trimmedText || /^\[(image|audio|video|document|location)\]$/i.test(trimmedText)) {
    return null;
  }

  const now = Date.now();
  const maxAgeMs = 24 * 60 * 60 * 1000; // 24 horas

  // Busca itens de FAQ com status "pendente" para o telefone do cliente nas últimas 24h
  const candidates = db.faqItems.filter(item => {
    if (!item || item.status !== "pendente") return false;

    // Correspondência pelo sourceClientPhone ou pela lista de clientPhones
    const matchesSource = item.sourceClientPhone && matchClientPhone(item.sourceClientPhone, cleanPhone);
    const matchesList = Array.isArray(item.clientPhones) && item.clientPhones.some(p => matchClientPhone(p, cleanPhone));
    if (!matchesSource && !matchesList) return false;

    // Verificação da janela de 24 horas
    const itemDateStr = item.createdAt || item.updatedAt;
    if (!itemDateStr) return true;
    const itemTime = new Date(itemDateStr).getTime();
    if (isNaN(itemTime)) return true;

    const diff = now - itemTime;
    return diff >= -300000 && diff <= maxAgeMs;
  });

  if (candidates.length === 0) return null;

  // Ordena decrescente pelo timestamp mais recente
  candidates.sort((a, b) => {
    const timeA = new Date(a.createdAt || a.updatedAt || 0).getTime() || 0;
    const timeB = new Date(b.createdAt || b.updatedAt || 0).getTime() || 0;
    return timeB - timeA;
  });

  const targetItem = candidates[0];
  const nowIso = new Date().toISOString();

  targetItem.suggestedAnswer = trimmedText;
  targetItem.status = "aguardando_aprovacao";
  targetItem.answeredAt = nowIso;
  targetItem.answeredBy = answeredBy;
  targetItem.updatedAt = nowIso;

  return targetItem;
}
```

---

### Diff 2: Blindagem de `extractIncomingMessageInfo`
*Atualizar linhas 3615 e o retorno em `extractIncomingMessageInfo`:*

```javascript
<<<<
  const fromMe = Boolean(body.fromMe || body.isMyMessage);
====
  const fromMe = Boolean(
    body.fromMe || 
    body.isFromMe || 
    body.isMyMessage || 
    body.data?.fromMe || 
    body.data?.key?.fromMe || 
    body.key?.fromMe || 
    body.data?.isFromMe
  );

  const phone = String(
    body.phone || body.chatId || body.recipientPhone || body.recipient || body.to || ""
  ).replace(/\D/g, "");
>>>>
```
E no objeto de retorno:
```javascript
<<<<
  return {
    isGroup,
    groupId,
    groupName,
    senderPhone,
    senderName,
    fromMe,
====
  return {
    isGroup,
    groupId,
    groupName,
    phone,
    senderPhone,
    senderName,
    fromMe,
>>>>
```

---

### Diff 3: Captura de `fromMe: true` em `POST /api/whatsapp/webhook/received`
*Atualizar linhas 5539-5575:*

```javascript
<<<<
    const rawTarget = incomingInfo.isGroup && incomingInfo.groupId
      ? incomingInfo.groupId
      : (incomingInfo.senderPhone || req.body?.phone || req.body?.participantPhone);
    const cleanTarget = incomingInfo.isGroup ? rawTarget : cleanWhatsAppPhone(rawTarget);
====
    const rawTarget = incomingInfo.isGroup && incomingInfo.groupId
      ? incomingInfo.groupId
      : (incomingInfo.fromMe
          ? (incomingInfo.phone || req.body?.phone || req.body?.chatId || incomingInfo.senderPhone)
          : (incomingInfo.senderPhone || req.body?.phone || incomingInfo.phone));
    const cleanTarget = incomingInfo.isGroup ? rawTarget : cleanWhatsAppPhone(rawTarget);
>>>>
```

E logo após a chamada de `appendMessageToConversation(db, { ... })`:
```javascript
      // Se for mensagem enviada pelo operador (fromMe: true) no WhatsApp móvel ou desktop:
      if (incomingInfo.fromMe && !incomingInfo.isGroup && cleanTarget) {
        // 1. Pausa a IA nesta conversa para assegurar controle humano total
        const conv = updatedConv || (db.whatsappConversations || []).find(c => matchClientPhone(c.phone, cleanTarget));
        if (conv) {
          conv.aiPaused = true;
          conv.aiPausedAt = incomingInfo.timestamp || new Date().toISOString();
          conv.aiPausedReason = "operator_manual_reply";
        }

        // 2. Auto-aprendizado: vincula a resposta do operador se houver pergunta pendente nas últimas 24h
        if (incomingInfo.text) {
          const linkedFaq = linkOperatorResponseToPendingFaq(db, {
            clientPhone: cleanTarget,
            text: incomingInfo.text,
            answeredBy: "operador"
          });

          if (linkedFaq) {
            console.log(`[Z-API Webhook fromMe] Resposta do operador vinculada ao FAQ [${linkedFaq.id}] ("${linkedFaq.question.substring(0, 40)}...") -> aguardando aprovação.`);
            if (typeof createNotification === "function") {
              createNotification({
                title: "💡 Sugestão de FAQ Capturada",
                message: `Resposta do operador para "${linkedFaq.question.substring(0, 60)}" aguardando aprovação no painel de FAQ.`,
                type: "faq_suggestion",
                link: "/whatsapp-automation?tab=faq"
              });
            }
          }
        }

        if (typeof saveDatabase === "function") saveDatabase();
      }
```

---

### Diff 4: Captura em `POST /api/whatsapp/chat/send` e Endpoints REST de Mensagens
*Atualizar linhas 6013-6122 em `zapi-service.mjs`:*

Substituir a declaração direta de `app.post("/api/whatsapp/chat/send", ...)` por uma função reutilizável `handleChatSend` e registrar as rotas:
- `/api/whatsapp/chat/send`
- `/api/whatsapp/chats/:phone/messages`
- `/api/whatsapp/chat/:phone/messages`

E dentro de `handleChatSend`, após `updatedConv.aiPaused = true`:
```javascript
    // Auto-aprendizado: vincula a resposta do operador se houver pergunta pendente nas últimas 24h
    let linkedFaq = null;
    if (!isGroup && cleanPhone && finalMessage) {
      linkedFaq = linkOperatorResponseToPendingFaq(db, {
        clientPhone: cleanPhone,
        text: finalMessage,
        answeredBy: "operador"
      });

      if (linkedFaq) {
        console.log(`[WhatsApp Live Chat] Resposta do operador vinculada ao FAQ [${linkedFaq.id}] ("${linkedFaq.question.substring(0, 40)}...") -> aguardando aprovação.`);
        if (typeof createNotification === "function") {
          createNotification({
            title: "💡 Sugestão de FAQ Capturada",
            message: `Resposta do operador para "${linkedFaq.question.substring(0, 60)}" aguardando aprovação no painel de FAQ.`,
            type: "faq_suggestion",
            link: "/whatsapp-automation?tab=faq"
          });
        }
      }
    }
```
E incluir `linkedFaq` na resposta JSON para rastreabilidade imediata:
```javascript
    res.json({
      success: result.success,
      result,
      conversation: updatedConv,
      linkedFaq: linkedFaq ? {
        id: linkedFaq.id,
        question: linkedFaq.question,
        status: linkedFaq.status,
        suggestedAnswer: linkedFaq.suggestedAnswer
      } : null
    });
```

---

## 6. Verificação e Suite de Testes

Para garantir 100% de cobertura nos testes E2E do Milestone 4:
1. **Teste Unitário de `linkOperatorResponseToPendingFaq`**:
   - Cria item pendente no mockDb com `sourceClientPhone: "5522998505276"`.
   - Executa `linkOperatorResponseToPendingFaq(mockDb, { clientPhone: "22998505276", text: "Temos sim ferro e tábua" })`.
   - Assevera `target.status === "aguardando_aprovacao"` e `target.suggestedAnswer === "Temos sim ferro e tábua"`.
   - Assevera que item criado há mais de 24h é descartado.
2. **Teste de Integração Webhook `fromMe: true`**:
   - Dispara webhook com payload `{ fromMe: true, phone: "5522998505276", text: "..." }`.
   - Assevera que a conversa fica com `aiPaused: true` e a pergunta pendente é promovida a `"aguardando_aprovacao"`.
3. **Teste de Aprovação em 1 Clique**:
   - Dispara `POST /api/whatsapp/faq/:id/approve` sem `body.answer`.
   - Assevera que `item.answer === item.suggestedAnswer` e `item.status === "ativo"`.

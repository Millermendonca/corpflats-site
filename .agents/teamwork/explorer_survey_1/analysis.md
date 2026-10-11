# Análise Técnica Arquitetural: FAQ Dinâmico, Auto-Aprendizado e Regras de Exceção da Sofia (CorpFlats)

**Data**: 2026-10-11  
**Autor**: Explorer Subagent (Survey & Backend Architecture)  
**Escopo**: Gestão de FAQ & Base de Conhecimento, Auto-Aprendizado via Webhook/Live Chat, Motor Heurístico/Gemini, Persistência no Banco e Frontend em `whatsapp-automation.tsx`.

---

## 1. Resumo Executivo & Fronteiras do Sistema

O Agente de IA para WhatsApp (Sofia / CorpFlats) atualmente possui uma base de conhecimento estática encapsulada em `DEFAULT_AI_CONFIG.knowledgeBase` e em heurísticas hardcoded dentro de `whatsapp-ai-service.mjs`. As respostas a dúvidas de hóspedes (como Wi-Fi, horários de check-in/out, café e garagem) estão fixadas no código ou limitadas a campos chave-valor no `db.zapiConfig.aiAgent`.

A nova funcionalidade de **Gestão Dinâmica de FAQ & Base de Conhecimento com Auto-Aprendizado** adiciona:
1. **Coleção Dinâmica no Banco (`db.faqItems`)**: Armazenamento completo de perguntas, variações/palavras-chave, respostas oficiais formatadas, categorias, regras de exceção por cliente e status (`pendente`, `aguardando_aprovacao`, `ativo`, `inativo`).
2. **Auto-Detecção de Perguntas Inéditas (R2)**: Identificação automática no webhook Z-API (`processAiInboundMessage`) quando um cliente faz uma pergunta não mapeada que gere transbordo ou caia na contingência sem resposta de alta confiança, gerando um registro com status `"pendente"`.
3. **Captura da Resposta Humana (R3)**: Monitoramento de mensagens enviadas pelo operador humano (`fromMe: true`) — seja via WhatsApp móvel (recebida no webhook) ou pelo Live Chat do sistema — vinculando o texto digitado pelo Miller/recepção como `suggestedAnswer` com status `"aguardando_aprovacao"`.
4. **Regras de Exceção e Segmentação (R4)**: Suporte a `scope` (`all`, `exclude`, `include_only`) e lista de telefones normalizados (`clientPhones`), permitindo respostas personalizadas ou restrições por hóspede.
5. **Integração em Tempo Real com o Motor da Sofia (R5)**: Carregamento dinâmico de `db.faqItems` no contexto do Google Gemini e busca heurística local prioritária nas palavras-chave do FAQ antes de qualquer transbordo genérico.
6. **Interface de Gestão (R1)**: Aba dedicada em `/whatsapp-automation` com listagem por categorias, filtros por status, aprovação em 1 clique e modal de criação/edição.

---

## 2. Estrutura do Backend & Endpoints da API

### 2.1 Ponto de Montagem do Motor de WhatsApp
O servidor Express em `artifacts/api-server/demo-server.mjs` (linha 5382) e `scripts/demo-server.mjs` inicializa o motor de WhatsApp via:
```javascript
initWhatsAppEngine(app, () => db, saveDatabase, createNotification, (text, ctx) => analyzeTextSentimentWithAI(text, ctx));
```

Dentro de `artifacts/api-server/zapi-service.mjs` (linha 4201), a função `initWhatsAppEngine` registra todos os serviços, webhooks e endpoints relacionados ao WhatsApp:
- Configurações da IA: `GET /api/whatsapp/ai-config` e `POST /api/whatsapp/ai-config` (linhas 6215-6260)
- Simulação de IA: `POST /api/whatsapp/ai-simulate` (linhas 6262-6290)
- Controle de Pausa da Conversa: `POST /api/whatsapp/chat/:phone/ai-toggle` (linhas 6293-6322)
- Sugestão Copiloto: `POST /api/whatsapp/chat/:phone/ai-suggest` (linhas 6325-6359)
- Envio de Mensagens Live Chat: `POST /api/whatsapp/chats/:phone/messages` (linhas 5960-6045)
- Webhooks Z-API: `POST /api/whatsapp/webhook/received`, `disconnected`, `connected`, `webhook` (linhas 5446-5740)

### 2.2 Especificação dos Novos Endpoints RESTful para FAQ
Para atender R1 e as operações de CRUD com persistência atômica, devem ser adicionados os seguintes endpoints em `zapi-service.mjs`:

| Método | Endpoint | Descrição | Payload / Resposta |
|---|---|---|---|
| `GET` | `/api/whatsapp/faq` | Lista todos os FAQs do banco com filtros opcionais | Query: `?status=&category=&search=`. Retorna `{ success: true, items: FaqItem[], counts: { all, active, pending, awaitingApproval } }` |
| `POST` | `/api/whatsapp/faq` | Cria nova pergunta/resposta oficial ou rascunho | Body: `{ question, answer, category, keywords, scope, clientPhones, status }`. Retorna `{ success: true, item: FaqItem }` |
| `PUT` | `/api/whatsapp/faq/:id` | Atualiza item existente (pergunta, resposta, regras, categoria) | Body: campos a atualizar. Retorna `{ success: true, item: FaqItem }` |
| `POST` | `/api/whatsapp/faq/:id/approve` | Aprova sugestão humana / pendente em 1 clique | Body: `{ answer?: string }` (opcional). Promove status para `"ativo"`, define `answer = suggestedAnswer || answer`, atualiza `approvedAt` e `updatedAt`. |
| `DELETE` | `/api/whatsapp/faq/:id` | Remove item do FAQ | Retorna `{ success: true, deletedId }` |

---

## 3. Arquitetura do Webhook Z-API & Inbound Message Flow

### 3.1 Rota e Extração da Mensagem
Quando a Z-API despacha uma mensagem para `POST /api/whatsapp/webhook/received`:
1. **Auditoria**: Registra os últimos 30 payloads brutos em `db.zapiRawWebhookLogs` (linhas 5452-5462).
2. **Extração de Informações (`extractIncomingMessageInfo`)**:
   - `fromMe`: Booleano extraído de `body.fromMe || body.isMyMessage` (linha 3549).
   - `senderPhone`: Dígitos limpos de `participantPhone`, `senderPhone` ou `participant` (linha 3547).
   - `text`: Texto extraído de `body.text`, `body.message.conversation`, `body.message.extendedTextMessage.text` ou mídia (linhas 5558-5575).
   - `cleanTarget`: `cleanWhatsAppPhone(rawTarget)` (linha 5473), garantindo normalização DDI 55.
3. **Persistência na Conversa**: Executa `appendMessageToConversation(db, { phone: cleanTarget, ... })` (linha 5477).
4. **Disparo da IA**:
   Se `!incomingInfo.fromMe && !incomingInfo.isGroup && incomingInfo.text && cleanTarget`, invoca de forma assíncrona:
   ```javascript
   processAiInboundMessage({
     db,
     incomingInfo,
     cleanTarget,
     saveDatabase,
     createNotification,
     sendZapiMessage,
     appendMessageFn: appendMessageToConversation
   })
   ```

### 3.2 Detecção Automática de Perguntas Não Mapeadas (R2)
Dentro de `processAiInboundMessage`:
1. Sofia avalia a mensagem com `generateAiWhatsAppResponse`:
   - Checagem de intenção de transbordo (`detectHandoverIntent`).
   - Busca no FAQ dinâmico (`db.faqItems`).
   - Geração de resposta via Gemini ou Heurística.
2. **Critério de Detecção de Dúvida Não Mapeada**:
   - Se o cliente expressou uma dúvida ou pergunta (ex: contém `?`, ou termos interrogativos `como|qual|quanto|onde|tem|posso|pode|horario|aceita|funciona`) E
   - O resultado gerou um transbordo humano (`shouldHandover === true` por falta de resposta mapeada) OU caiu na resposta de contingência padrão genérica sem match de FAQ de alta confiança:
3. **Criação do Registro Pendente**:
   - Verifica se já existe uma pergunta idêntica ou pendente do mesmo cliente nas últimas 24h para não duplicar.
   - Cria um novo `FaqItem` em `db.faqItems`:
     ```javascript
     {
       id: `faq_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
       question: incomingInfo.text.trim(),
       keywords: extractKeywordsFromText(incomingInfo.text),
       answer: "",
       suggestedAnswer: "",
       category: detectFaqCategory(incomingInfo.text) || "Geral",
       status: "pendente",
       scope: "all",
       clientPhones: [],
       askedBy: {
         phone: cleanTarget,
         name: incomingInfo.senderName || conv?.name || "Hóspede",
         askedAt: new Date().toISOString()
       },
       createdAt: new Date().toISOString(),
       updatedAt: new Date().toISOString()
     }
     ```
   - Persiste no banco com `saveDatabase()`.

---

## 4. Captura Automática da Resposta Humana (R3)

### 4.1 Cenário A: Resposta enviada pelo Operador via WhatsApp Móvel
1. A Z-API está configurada com `notifySentByMe: true` (sincronizada via `syncZapiWebhooks`, linhas 3330-3342 de `zapi-service.mjs`).
2. Quando Miller ou a recepção envia uma mensagem pelo WhatsApp no smartphone para o hóspede:
   - A Z-API dispara o webhook `/api/whatsapp/webhook/received` com:
     - `incomingInfo.fromMe = true`
     - `req.body.phone` = telefone do hóspede (`cleanTarget`)
     - `incomingInfo.text` = resposta digitada pelo operador humano
3. **Captura da Resposta Sugerida**:
   - No webhook, quando `incomingInfo.fromMe === true && incomingInfo.text && cleanTarget`:
     - Localiza a pergunta mais recente em `db.faqItems` que esteja com `status === "pendente"` para aquele cliente (`askedBy.phone` igual a `cleanTarget` ou correspondência de 8 dígitos) dentro de uma janela de atendimento (últimas 24 horas).
     - Se encontrada:
       - Define `faqItem.suggestedAnswer = incomingInfo.text.trim()`.
       - Atualiza `faqItem.status = "aguardando_aprovacao"`.
       - Registra `faqItem.suggestedBy = "Operador Humano (WhatsApp Móvel)"`.
       - Registra `faqItem.suggestedAt = new Date().toISOString()`.
       - Salva o banco (`saveDatabase()`).
       - Dispara notificação:
         ```javascript
         createNotification({
           title: "💡 Sugestão de FAQ Capturada",
           message: `Resposta do operador capturada para a dúvida: "${faqItem.question.substring(0, 50)}...". Pronta para aprovação!`,
           type: "faq_suggestion",
           link: "/whatsapp-automation?tab=knowledge_base"
         });
         ```
     - Além disso, pausa a IA na conversa (`conv.aiPaused = true`, `conv.aiPausedReason = "operator_manual_reply"`) para que o atendente humano continue a conversa sem interrupções da Sofia.

### 4.2 Cenário B: Resposta enviada pelo Live Chat do Sistema
No endpoint `POST /api/whatsapp/chats/:phone/messages` (linhas 5960-6045 de `zapi-service.mjs`):
- O operador envia `finalMessage`.
- O código já marca `conv.aiPaused = true; conv.aiPausedReason = "operator_manual_reply";`.
- Adiciona-se a mesma lógica de captura: busca pergunta pendente para `cleanPhone`, vincula `suggestedAnswer = finalMessage`, atualiza para `"aguardando_aprovacao"` e persiste.

### 4.3 Aprovação e Resposta Direta pelo Painel
- Miller acessa a aba "Base de Conhecimento & FAQ".
- Cards e linhas com status `"aguardando_aprovacao"` aparecem destacados com badge âmbar e botão verde **"Aprovar Sugestão"** (1 clique).
- Ao clicar em "Aprovar": o backend define `answer = suggestedAnswer`, status = `"ativo"` e salva.
- Para qualquer pergunta com status `"pendente"`, Miller pode abrir o modal, redigir a resposta oficial e salvar como `"ativo"`.

---

## 5. Motor de Regras de Exceção e Segmentação (R4)

### 5.1 Campos do FAQ Item
Cada item do FAQ suporta:
- `scope`: `"all"` | `"exclude"` | `"include_only"`
- `clientPhones`: Array de strings (telefones com ou sem formatação/DDI).

### 5.2 Algoritmo de Verificação de Aplicabilidade
```javascript
export function isFaqApplicableToClient(faqItem, clientPhone) {
  if (!faqItem || faqItem.status !== "ativo") return false;
  const scope = faqItem.scope || "all";
  if (scope === "all") return true;

  const targetDigits = String(clientPhone || "").replace(/\D/g, "");
  const targetLast8 = targetDigits.slice(-8);

  const phoneList = Array.isArray(faqItem.clientPhones) ? faqItem.clientPhones : [];
  const matchesList = phoneList.some(p => {
    const pDigits = String(p).replace(/\D/g, "");
    if (!pDigits) return false;
    if (pDigits === targetDigits) return true;
    const pLast8 = pDigits.slice(-8);
    return targetLast8 && pLast8 && targetLast8 === pLast8;
  });

  if (scope === "exclude") {
    // Se o cliente estiver na lista de exclusão, NÃO é aplicável
    return !matchesList;
  }
  if (scope === "include_only") {
    // Só é aplicável se o cliente estiver na lista de inclusão
    return matchesList;
  }
  return true;
}
```

---

## 6. Integração com o Motor da Sofia (`whatsapp-ai-service.mjs`) (R5)

### 6.1 Injeção Dinâmica no Prompt do Google Gemini
Em `generateAiWhatsAppResponse`:
1. Obtém a lista de FAQs ativos e aplicáveis para o telefone consultado:
   ```javascript
   const activeFaqs = (db.faqItems || [])
     .filter(item => isFaqApplicableToClient(item, phone));
   ```
2. Adiciona seção estruturada no prompt do sistema:
   ```text
   [BASE DE CONHECIMENTO OFICIAL CORPFLATS (FAQ DINÂMICO)]
   ${activeFaqs.map((f, i) => `FAQ #${i+1} [${f.category}]:\nPergunta: ${f.question}\nResposta Oficial: ${f.answer}`).join("\n\n")}
   ```
3. O modelo Gemini aprende a priorizar estritamente essas respostas oficiais para qualquer pergunta correspondente.

### 6.2 Contingência Heurística Local Dinâmica
Em `generateHeuristicResponse`:
Antes de recorrer à resposta padrão genérica, o motor busca nos `activeFaqs`:
1. Compara a mensagem do hóspede com as palavras-chave (`keywords`) e variações de cada FAQ ativo aplicável.
2. Se houver correspondência com pontuação alta (match de keyword ou termo chave da pergunta):
   - Retorna a resposta oficial formatada do FAQ (`faq.answer`).
3. Caso contrário, cai nas heurísticas básicas de quarto/estadia ou na mensagem prestativa padrão.

---

## 7. Camada de Dados (`data/database.json`) & Schema do FAQ

### 7.1 Schema Oficial de `db.faqItems`
```typescript
interface FaqItem {
  id: string; // Ex: "faq_wifi_01", "faq_1790581234_abc"
  question: string; // Pergunta principal
  keywords: string[]; // Variações, termos de busca e sinônimos
  answer: string; // Resposta oficial aprovada (formatação WhatsApp)
  suggestedAnswer?: string; // Resposta capturada do operador ou sugerida
  category: "Reservas" | "Check-in/Acesso" | "Wi-Fi/Tecnologia" | "Café da Manhã" | 
            "Garagem" | "Estrutura do Flat" | "Regras/Visitas/Pets" | 
            "Lazer/Condomínio" | "Check-out" | "Geral";
  status: "ativo" | "pendente" | "aguardando_aprovacao" | "inativo";
  scope: "all" | "exclude" | "include_only";
  clientPhones: string[]; // Telefones configurados para exceção
  askedBy?: {
    phone: string;
    name: string;
    askedAt: string;
  };
  suggestedBy?: string;
  suggestedAt?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 7.2 Mapeamento Inicial dos 9 Itens Oficiais Obrigatórios
1. **Wi-Fi** (`Wi-Fi/Tecnologia`): Rede *CorpFlats-Hospedes*, senha `corpflats2026`, velocidade 500MB em todo o flat.
2. **Café da manhã no quarto** (`Café da Manhã`): Cesta gourmet personalizada servida no flat entre 06:30 e 09:30/10:00.
3. **Recolhimento de louças** (`Café da Manhã`): Louças e cesta organizadas na porta do flat ou aviso via WhatsApp para recolhimento pela governança.
4. **Água no frigobar** (`Estrutura do Flat`): Águas minerais no frigobar como cortesia de boas-vindas na chegada.
5. **Regras de visitas** (`Regras/Visitas/Pets`): Permitidas até 22h com identificação obrigatória na portaria do Soho; proibido pernoite sem cadastro.
6. **Regras de pets** (`Regras/Visitas/Pets`): Cães pequeno porte (até 10kg), taxa de R$ 80/estadia, transporte no colo/guia curta, elevador de serviço, proibido ficar sozinho no flat por longos períodos.
7. **Check-in 14h** (`Check-in/Acesso`): Horário padrão a partir das 14:00.
8. **Early check-in para reservas diretas** (`Check-in/Acesso`): Benefício gratuito a partir das 10:00 para reservas diretas (site/WhatsApp), estritamente mediante disponibilidade de limpeza.
9. **Check-out 12h** (`Check-out`): Horário padrão até 12:00, desligar ar-condicionado e luzes, chaves na portaria.

E itens pendentes e em aprovação pré-configurados para validação imediata do fluxo de aprovação.

### 7.3 Persistência Atômica e Reconciliação
- Em `demo-server.mjs`:
  - `loadDatabase()` inicializa `if (!Array.isArray(db.faqItems)) db.faqItems = getDefaultFaqItems();`.
  - Reconciliação de nuvem no PostgreSQL preserva `localFaqItems` se a nuvem ainda não tiver a coleção hidratada.
  - `pruneDatabase()` não descarta itens de FAQ.
  - `saveDatabase()` escreve atomicamente no arquivo local e na tabela `system_store` no Postgres.

---

## 8. Normalização de Telefones no Sistema

A normalização de telefones é crítica para as regras de exceção e a correspondência do operador/cliente:
- `cleanWhatsAppPhone(raw)`:
  - Remove não-dígitos (`\D`).
  - Remove zeros à esquerda (ex: `022...` -> `22...`).
  - Se comprimento for 10 ou 11 dígitos, adiciona o DDI `55` na frente.
- Comparação por sufixo de 8 dígitos (`.slice(-8)`):
  - No Brasil, a numeração móvel com o 9º dígito (`22 99850-5276` vs `22 9850-5276`) e a presença ou ausência do DDI `55` variam entre sistemas e cadastros de hóspedes.
  - Comparar `targetClean.slice(-8) === listPhoneClean.slice(-8)` garante 100% de precisão sem falsos negativos.

---

## 9. Mandato de Paridade de Código
Os seguintes pares de arquivos devem ser mantidos com paridade byte a byte (SHA-256 idêntico):
- `artifacts/api-server/zapi-service.mjs` <-> `scripts/zapi-service.mjs`
- `artifacts/api-server/whatsapp-ai-service.mjs` <-> `scripts/whatsapp-ai-service.mjs`
- `artifacts/api-server/demo-server.mjs` <-> `scripts/demo-server.mjs`
Qualquer alteração implementada em `artifacts/api-server` deve ser imediatamente replicada para `scripts/`.

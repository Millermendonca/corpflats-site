# Análise Técnica — Detecção Automática de Perguntas Não Mapeadas no Webhook Inbound (Milestone 2 - Feature 5)

**Autor**: Milestone 2 Explorer 1  
**Data**: 2026-10-11T03:15:00Z  
**Escopo**: `artifacts/api-server/zapi-service.mjs`, `scripts/zapi-service.mjs`, `artifacts/api-server/whatsapp-ai-service.mjs`, `scripts/whatsapp-ai-service.mjs`  
**Requisitos Alvo**: ORIGINAL_REQUEST §R2 (Detecção Automática de Perguntas Não Mapeadas) & PROJECT.md Feature 5 / Milestone 2

---

## 1. Sumário Executivo

O objetivo desta investigação é mapear e projetar a mecânica completa de **auto-aprendizado em fluxo contínuo** para o Agente de IA (Sofia) no Guest-Flow-Manager quando mensagens inbound de clientes contendo dúvidas/perguntas não mapeadas na Base de Conhecimento chegam via Webhook da Z-API.

Ao detectar que a mensagem do hóspede representa uma dúvida genuína sobre serviços, acomodação ou políticas do hotel que a IA não reconhece com alta confiança no FAQ existente (resultando em fallback heurístico ou necessidade de transbordo humano), o sistema deve registrar instantaneamente uma entrada na coleção `db.faqItems` com `status: "pendente"`, capturando os metadados do cliente para que:
1. O operador humano responda posteriormente pelo WhatsApp ou Live Chat (Feature 6, R3).
2. O texto do operador seja capturado automaticamente como `suggestedAnswer` com status `"aguardando_aprovacao"`.
3. O gestor (Miller) aprove a resposta com 1 clique (`POST /api/whatsapp/faq/:id/approve`), promovendo-a para `"ativo"` para uso autônomo imediato pela Sofia.

---

## 2. Ponto de Entrada e Cadeia de Chamadas no Webhook Inbound

### 2.1 Ponto de Entrada do Webhook (`zapi-service.mjs`)
- **Rota HTTP**: `app.post("/api/whatsapp/webhook/received", ...)` (linhas `5516-5721` de `artifacts/api-server/zapi-service.mjs` e espelho em `scripts/zapi-service.mjs`).
- **Extração da Mensagem**:
  - `incomingInfo = extractIncomingMessageInfo(req.body);` (linha 5533).
  - Sanitização de telefone: `cleanTarget = cleanWhatsAppPhone(rawTarget);` (linha 5542).
  - Gravação no histórico da conversa: `appendMessageToConversation(db, ...);` (linha 5546).
- **Gatilho do Agente de IA**:
  - Linhas `5706-5718`:
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

### 2.2 Motor de Processamento da IA (`whatsapp-ai-service.mjs`)
- **Função**: `export async function processAiInboundMessage({ ... })` (linhas `1369-1535`).
- **Filtros de Elegibilidade Prévios**:
  1. `if (!incomingInfo || incomingInfo.fromMe || incomingInfo.isGroup || !incomingInfo.text || !cleanTarget)` -> pula (`not_eligible`).
  2. `if (aiConfig.enabled === false)` -> pula (`ai_disabled`).
  3. `if (db?.zapiConfig?.testModeOnly === true)` -> valida whitelist contra `DEFAULT_TEST_ALLOWED_PHONES` e `testAllowedPhones`.
  4. `if (conv && conv.aiPaused === true)` -> pula (`conversation_ai_paused`), pois o operador humano já assumiu.
  5. `if (aiConfig.mode === "copilot")` -> pula (`mode_copilot_only`).
  6. `if (aiConfig.mode === "off_hours")` -> valida horário fora de expediente.
- **Avaliação da IA**:
  - Linha 1450: `const aiResult = await generateAiWhatsAppResponse({ db, phone: cleanTarget, messageText: incomingInfo.text, history, isCopilot: false });`
  - Linha 1459: `if (aiResult.shouldHandover)` -> dispara transbordo humano, pausa conversa e cria notificação.
  - Linha 1502: Resposta autônoma normal / fallback heurístico.

---

## 3. Critérios de Detecção de Perguntas Não Mapeadas (Unmapped Detection)

Para evitar poluição da base com saudações, confirmações de rotina ou comandos operacionais, a detecção deve atender rigorosamente a um filtro em 4 etapas:

### 3.1 Etapa 1: É uma Dúvida/Pergunta Potencial de Hóspede? (`isPotentialGuestQuestion`)
A mensagem deve expressar uma intenção de consulta:
- **Positivo**:
  - Contém ponto de interrogação `?`.
  - OU contém termos interrogativos em português: `como`, `onde`, `quando`, `qual`, `quais`, `quanto`, `quantos`, `por que`, `porque`.
  - OU contém verbos/expressões de consulta comuns em hotelaria: `tem`, `teria`, `posso`, `pode`, `podemos`, `consegue`, `consigo`, `dá para`, `aceita`, `aceitam`, `possui`, `possuem`, `existe`, `funciona`, `horário`, `sabe me dizer`, `gostaria de saber`, `queria saber`, `vocês têm`.
  - Tamanho mínimo significativo (>= 6 caracteres).
- **Negativo (Descarte imediato)**:
  - Saudações puras: `oi`, `olá`, `bom dia`, `boa tarde`, `boa noite`, `opa`.
  - Confirmações / Agradecimentos: `ok`, `obrigado`, `obrigada`, `valeu`, `show`, `beleza`, `perfeito`, `entendi`, `sim`, `não`.
  - Pedido direto de humano sem dúvida: `quero falar com humano`, `atendente`, `recepção` (são tratados como transbordo direto, não FAQ).
  - Horários de chegada isolados: `14h`, `12:00` (já tratados pelo módulo de previsão de chegada).

### 3.2 Etapa 2: A Pergunta já está Mapeada no FAQ Ativo? (`isQuestionMappedInFaq`)
Verifica se `db.faqItems` possui algum item com `status === "ativo"` aplicável ao cliente (`isFaqApplicableToClient(faq, clientPhone) === true`):
- Comparação de similaridade de texto: se o texto da mensagem inclui a pergunta do FAQ ou vice-versa.
- Comparação com a lista de variações cadastradas (`faq.variations`).
- Coincidência de 2 ou mais palavras-chave cadastradas (`faq.keywords`).
Se houver correspondência ativa aplicável, a pergunta **já está mapeada** -> NÃO cria FAQ pendente.

### 3.3 Etapa 3: Houve Baixa Confiança, Fallback Heurístico ou Transbordo?
A pergunta é considerada não mapeada quando:
1. `aiResult.shouldHandover === true` ou `aiResult.requiresHandover === true` (transbordo acionado por dúvida complexa ou ação de sistema desativada).
2. OU `aiResult.modelUsed === "heuristic_fallback"` e a resposta emitida é a resposta padrão genérica prestativa (ou seja, não coincidiu com Wi-Fi, Café, Garagem, Localização, Check-in, Check-out ou FAQ ativo).
3. OU `aiResult.isFallback === true` / `aiResult.unmappedQuery === true`.

### 3.4 Etapa 4: Desduplicação de Perguntas Pendentes (`findExistingPendingFaq`)
Se o mesmo cliente (ou outro cliente) já tiver feito a mesma pergunta recentemente e ela já estiver cadastrada com `status: "pendente"` ou `status: "aguardando_aprovacao"`:
- Não duplica o registro em `db.faqItems`.
- Apenas anexa a variação de texto e atualiza `updatedAt` e o array `clientPhones`.

---

## 4. Motor de Inferência de Categorias e Extração de Palavras-Chave

### 4.1 Inferência de Categoria (`inferFaqCategory`)
O sistema classifica automaticamente a pergunta em uma das 9 categorias canônicas do CorpFlats (com fallback para `"reservas"`):

| Categoria | Expressões / Padrões Regex |
|---|---|
| `wifi_tecnologia` | `wifi`, `wi-fi`, `internet`, `senha`, `conectar`, `rede`, `conexão`, `sinal`, `computador`, `smart tv` |
| `cafe_manha` | `café`, `desjejum`, `bandeja`, `louça`, `garrafa térmica`, `cafeteira`, `pão`, `leite` |
| `garagem` | `garagem`, `estacionamento`, `vaga`, `carro`, `veículo`, `placa`, `moto` |
| `checkin_acesso` | `check-in`, `entrada`, `chegada`, `portaria`, `chave`, `cartão`, `acesso`, `early check-in` |
| `checkout` | `check-out`, `saída`, `desocupar`, `deixar o flat`, `entregar chave/cartão`, `late check-out` |
| `estrutura_flat` | `flat`, `quarto`, `frigobar`, `água`, `ar-condicionado`, `tomada`, `voltagem`, `110v`, `220v`, `ferro`, `secador`, `toalha`, `cozinha` |
| `regras_visitas_pets` | `visita`, `convidado`, `pet`, `cachorro`, `cão`, `gato`, `animal`, `fumo`, `fumar`, `pernoite` |
| `lazer_condominio` | `piscina`, `jacuzzi`, `sauna`, `academia`, `cobertura`, `lazer`, `churrasqueira`, `condomínio` |
| `reservas` (default) | `reserva`, `diária`, `preço`, `valor`, `cotação`, `pagamento`, `pix`, `cancelamento`, `data` |

### 4.2 Extração de Palavras-Chave (`extractFaqKeywords`)
Remove stop words do português (`de`, `para`, `com`, `que`, `uma`, etc.), remove acentos via normalização NFD, seleciona termos com 3 ou mais caracteres e retorna as palavras mais descritivas (até 8 termos).

---

## 5. Schema do Item Pendente Criado (`FaqItem`)

Em estrita conformidade com o `PROJECT.md` e `DISPATCH.md`:

```typescript
{
  id: `faq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  question: string,            // Texto original da dúvida do hóspede
  answer: "",                  // Vazio inicialmente
  category: string,            // Inferido via inferFaqCategory (ou "reservas")
  keywords: string[],          // Extraído via extractFaqKeywords
  variations: [questionText],  // Inicializado com a pergunta original
  status: "pendente",          // Status pendente de resposta
  source: "auto_aprendizado",  // Marca de auditoria de auto-aprendizado
  scope: "all",                // Escopo padrão aberto
  clientPhones: [cleanPhone],  // Telefone normalizado do solicitante
  sourceClientPhone: cleanPhone,
  sourceClientName: customerName,
  metadata: {
    customerPhone: cleanPhone,
    customerName: customerName,
    askedAt: ISOString
  },
  createdAt: ISOString,
  updatedAt: ISOString
}
```

---

## 6. Recomendação de Diffs de Implementação

### 6.1 `whatsapp-ai-service.mjs` (em `artifacts/api-server/` e `scripts/`)

#### Adicionar Funções Auxiliares de Detecção e Criação
```javascript
// ── Detecção e Auto-Aprendizado de Perguntas Não Mapeadas (FAQ Sofia) ─────────

export function isPotentialGuestQuestion(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  if (t.length < 5) return false;

  const lower = t.toLowerCase();

  // Descartar saudações puras ou confirmações simples
  if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite|opa|ei|hello|hi)[!.\s]*$/i.test(lower)) return false;
  if (/^(ok|obrigad[oa]|valeu|show|beleza|perfeito|entendi|combinado|certo|t[aá] bom|blz|agrade[cç]o|sim|n[aã]o|positivo)[!.\s]*$/i.test(lower)) return false;
  if (/^(quero falar com (?:um )?humano|atendente|humano|recep[cç][aã]o|falar com algu[eé]m)[!.\s]*$/i.test(lower)) return false;

  // Interrogação explícita
  if (t.includes("?")) return true;

  // Padrões interrogativos
  const patterns = [
    /\b(como|onde|quando|qual|quais|quanto|quantos|quanta|quantas|por que|porque)\b/i,
    /\b(tem|teria|posso|pode|podemos|consegue|consigo|d[aá]\s+para|d[aá]\s+pra)\b/i,
    /\b(aceita|aceitam|possui|possuem|existe|existem|funciona|hor[aá]rio)\b/i,
    /\b(sabe me dizer|gostaria de saber|queria saber|voc[eê]s?\s+t[eê]m?|tem como)\b/i,
    /\b(preciso saber|informa[cç][aã]o|d[uú]vida|procedimento|como fa[cç]o)\b/i
  ];

  return patterns.some(p => p.test(lower));
}

export function inferFaqCategory(text) {
  if (!text || typeof text !== "string") return "reservas";
  const lower = text.toLowerCase();

  if (/wifi|wi-fi|internet|senha(?:\s+do\s+wi-?fi)?|conectar|rede|conex[aã]o|sinal|computador|smart\s*tv/i.test(lower)) return "wifi_tecnologia";
  if (/caf[eé]|desjejum|bandeja|lou[cç]a|garrafa\s+t[eé]rmica|cafeteira|p[aã]o|leite|fruta/i.test(lower)) return "cafe_manha";
  if (/garagem|estacionamento|vaga|carro|ve[ií]culo|placa|moto|estacionar/i.test(lower)) return "garagem";
  if (/check-?in|entrada|cheg(?:ada|ar)|portaria|chave|cart[aã]o|fechadura|acesso|port[aã]o|early|entrar\s+no\s+quarto/i.test(lower)) return "checkin_acesso";
  if (/check-?out|sa[ií]da|desocupa|deixar\s+o\s+flat|entregar\s+(?:chave|cart[aã]o)|late\s+check/i.test(lower)) return "checkout";
  if (/flat|quarto|apartamento|frigobar|[aá]gua|ar[- ]condicionado|ar\s+condicionado|tomada|voltagem|110|220|ferro|t[aá]bua|secador|toalha|cama|travesseiro|len[cç]ol|chuveiro|banheiro|cozinha|micro-ondas|utens[ií]lio|panela|copo|fog[aã]o/i.test(lower)) return "estrutura_flat";
  if (/visit(?:a|ante)|convidad|pet|cachorro|c[aã]o|gato|animal|fumo|fumar|cigarro|pernoite|barulho|norma|regra/i.test(lower)) return "regras_visitas_pets";
  if (/piscina|jacuzzi|sauna|academia|cobertura|lazer|churrasqueira|sal[aã]o|condom[ií]nio|pr[eé]dio|edif[ií]cio/i.test(lower)) return "lazer_condominio";

  return "reservas";
}

export function extractFaqKeywords(text) {
  if (!text || typeof text !== "string") return [];
  const stopWords = new Set([
    "de", "a", "o", "que", "e", "do", "da", "em", "um", "para", "com", "nao", "não",
    "uma", "os", "no", "se", "na", "por", "mais", "as", "dos", "como", "mas", "foi",
    "ao", "ele", "das", "tem", "seu", "sua", "ou", "ser", "quando", "muito", "ha", "há",
    "nos", "ja", "já", "esta", "está", "eu", "tambem", "também", "so", "só", "pelo",
    "pela", "ate", "até", "isso", "ela", "entre", "era", "depois", "sem", "mesmo",
    "aos", "ter", "seus", "quem", "nas", "me", "esse", "eles", "estao", "estão",
    "voce", "você", "tinha", "foram", "essa", "num", "nem", "suas", "meu", "minha",
    "qual", "quais", "onde", "posso", "pode", "favor", "gostaria", "queria", "bom",
    "boa", "dia", "tarde", "noite", "ola", "olá", "corpflats", "hotel"
  ]);

  const clean = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ");

  const words = clean.split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w));
  return Array.from(new Set(words)).slice(0, 8);
}

export function isQuestionMappedInFaq(text, db, clientPhone) {
  if (!db || !Array.isArray(db.faqItems) || !text) return false;
  const lower = text.toLowerCase();

  for (const item of db.faqItems) {
    if (item.status !== "ativo") continue;
    if (typeof isFaqApplicableToClient === "function" && !isFaqApplicableToClient(item, clientPhone)) continue;

    const qLower = (item.question || "").toLowerCase();
    if (qLower && (lower.includes(qLower) || qLower.includes(lower))) return true;

    if (Array.isArray(item.variations)) {
      for (const v of item.variations) {
        const vLower = String(v).toLowerCase();
        if (vLower && (lower.includes(vLower) || vLower.includes(lower))) return true;
      }
    }

    if (Array.isArray(item.keywords) && item.keywords.length > 0) {
      const matchCount = item.keywords.filter(k => lower.includes(String(k).toLowerCase())).length;
      if (matchCount >= 2) return true;
    }
  }

  return false;
}

export function findExistingPendingFaq(text, db, clientPhone) {
  if (!db || !Array.isArray(db.faqItems) || !text) return null;
  const lower = text.toLowerCase().trim();

  return db.faqItems.find(item => {
    if (item.status !== "pendente" && item.status !== "aguardando_aprovacao") return false;
    const qLower = (item.question || "").toLowerCase().trim();
    if (qLower === lower) return true;
    if (item.sourceClientPhone && clientPhone && matchClientPhone(item.sourceClientPhone, clientPhone)) {
      if (lower.includes(qLower) || qLower.includes(lower)) return true;
    }
    return false;
  }) || null;
}

export function autoCreatePendingFaq({
  db,
  questionText,
  senderPhone,
  senderName,
  saveDatabase,
  createNotification
}) {
  if (!db) return null;
  if (!Array.isArray(db.faqItems)) db.faqItems = [];

  const text = (questionText || "").trim();
  if (!text) return null;

  const cleanPhone = cleanWhatsAppPhone(senderPhone) || String(senderPhone || "").replace(/\D/g, "");

  const existing = findExistingPendingFaq(text, db, cleanPhone);
  if (existing) {
    if (Array.isArray(existing.variations) && !existing.variations.includes(text)) {
      existing.variations.push(text);
    }
    existing.updatedAt = new Date().toISOString();
    if (cleanPhone && !existing.clientPhones?.some(p => matchClientPhone(p, cleanPhone))) {
      if (!Array.isArray(existing.clientPhones)) existing.clientPhones = [];
      existing.clientPhones.push(cleanPhone);
    }
    if (typeof saveDatabase === "function") saveDatabase();
    return existing;
  }

  const now = new Date().toISOString();
  const category = inferFaqCategory(text);
  const keywords = extractFaqKeywords(text);
  const randomSuffix = Math.random().toString(36).substring(2, 7);

  const newFaq = {
    id: `faq_${Date.now()}_${randomSuffix}`,
    question: text,
    answer: "",
    category,
    keywords,
    variations: [text],
    status: "pendente",
    source: "auto_aprendizado",
    scope: "all",
    clientPhones: cleanPhone ? [cleanPhone] : [],
    sourceClientPhone: cleanPhone,
    sourceClientName: senderName || "Hóspede",
    metadata: {
      customerPhone: cleanPhone,
      customerName: senderName || "Hóspede",
      askedAt: now
    },
    createdAt: now,
    updatedAt: now
  };

  db.faqItems.push(newFaq);

  if (typeof saveDatabase === "function") {
    saveDatabase();
  }

  if (typeof createNotification === "function") {
    createNotification({
      title: `❓ Nova Dúvida Hóspede: ${senderName || cleanPhone}`,
      message: `Pergunta não mapeada recebida: "${text.substring(0, 100)}". Registrada como pendente no FAQ.`,
      type: "whatsapp_faq_pending",
      link: "/whatsapp-automation"
    });
  }

  console.log(`[Auto-Aprendizado FAQ] Nova dúvida não mapeada registrada como pendente: "${text}" (${cleanPhone})`);

  return newFaq;
}
```

#### Modificar `processAiInboundMessage`
Em `whatsapp-ai-service.mjs`, logo após `const aiResult = await generateAiWhatsAppResponse(...)`:
```javascript
  // 6.5. Auto-Aprendizado: Detecção e Registro de Perguntas Não Mapeadas (R2)
  const isQuestion = isPotentialGuestQuestion(incomingInfo.text);
  const isMapped = isQuestionMappedInFaq(incomingInfo.text, db, cleanTarget);
  const isFallback = aiResult.modelUsed === "heuristic_fallback" &&
                     aiResult.replyText?.includes("Posso te ajudar com informações sobre *Wi-Fi, horários");
  const needsHandoverOrFallback = Boolean(aiResult.shouldHandover || aiResult.requiresHandover || isFallback);

  let unmappedFaq = null;
  if (isQuestion && !isMapped && needsHandoverOrFallback) {
    unmappedFaq = autoCreatePendingFaq({
      db,
      questionText: incomingInfo.text,
      senderPhone: incomingInfo.senderPhone || cleanTarget,
      senderName: incomingInfo.senderName || conv?.name || "Hóspede",
      saveDatabase,
      createNotification
    });
  }
```
E incluir `unmappedFaqCreated: Boolean(unmappedFaq), unmappedFaq` no retorno de ambos os ramos (`aiResult.shouldHandover` e resposta autônoma normal).

### 6.2 `zapi-service.mjs` (em `artifacts/api-server/` e `scripts/`)

Importar e re-exportar as funções em `zapi-service.mjs`:
```javascript
import {
  getWhatsAppAiConfig,
  generateAiWhatsAppResponse,
  processAiInboundMessage,
  DEFAULT_AI_CONFIG,
  autoCreatePendingFaq,
  isPotentialGuestQuestion,
  inferFaqCategory,
  extractFaqKeywords,
  isQuestionMappedInFaq,
  findExistingPendingFaq
} from "./whatsapp-ai-service.mjs";

export {
  autoCreatePendingFaq,
  isPotentialGuestQuestion,
  inferFaqCategory,
  extractFaqKeywords,
  isQuestionMappedInFaq,
  findExistingPendingFaq
};
```
Isso garante que os novos utilitários estejam universalmente acessíveis tanto para testes quanto para endpoints HTTP ou scripts de auditoria em ambos os pacotes espelhados (`artifacts/` e `scripts/`).

---

## 7. Estratégia de Teste e Validação

Para comprovar a eficácia da Feature 5 sem afetar os testes existentes:
1. **Teste de Detecção com Pergunta Inédita**:
   Invocar `processAiInboundMessage` com texto `"O flat possui ferro de passar roupa disponível?"` para um cliente não cadastrado no FAQ.
   *Resultado esperado*: `res.unmappedFaqCreated === true`, `db.faqItems` ganha 1 novo item com `status: "pendente"`, `category: "estrutura_flat"`, `source: "auto_aprendizado"`, `clientPhones: [phone]`.
2. **Teste de Não-Detecção para Perguntas Mapeadas**:
   Invocar com `"Qual a senha do wifi?"` para cliente com FAQ ativo disponível.
   *Resultado esperado*: `res.unmappedFaqCreated === false`, nenhum item pendente adicionado.
3. **Teste de Não-Detecção para Saudações e Confirmações**:
   Invocar com `"Boa tarde, tudo bem?"` e `"ok obrigado"`.
   *Resultado esperado*: `res.unmappedFaqCreated === false`.
4. **Teste de Desduplicação**:
   Enviar a mesma pergunta inédita duas vezes consecutivas.
   *Resultado esperado*: apenas 1 item é mantido em `db.faqItems`, sem proliferação de IDs duplicados.
5. **Verificação de Paridade SHA-256**:
   Garantir hash idêntico entre os pares espelhados.

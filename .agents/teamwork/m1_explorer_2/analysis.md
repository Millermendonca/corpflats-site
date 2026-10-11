# Análise Arquitetural — Milestone 1 Explorer 2
**Escopo**: Normalização de Telefones, Motor de Regras `isFaqApplicableToClient` (`all`, `exclude`, `include_only`), Endpoints REST em `zapi-service.mjs` e Resolução de Divergência SHA-256 em `whatsapp-ai-service.mjs`.

---

## 1. Sumário Executivo

Esta investigação mapeou em detalhes a camada de backend e motor de regras para o Milestone 1 (Backend Core & Database Layer) do Guest-Flow-Manager. Foram analisados os arquivos espelhados:
- `artifacts/api-server/zapi-service.mjs` e `scripts/zapi-service.mjs` (atualmente com hash idêntico: `301F4D859495BC0242EB7F3F050EB4C1BFE482B963D02BB166A5E86794C17007`);
- `artifacts/api-server/whatsapp-ai-service.mjs` (hash `6683557D...`) e `scripts/whatsapp-ai-service.mjs` (hash `1DD69090...`), confirmando a causa exata da divergência de SHA-256;
- `tests/whatsapp-ai-agent.test.mjs`, diagnosticando o comportamento do teste de integridade 10.

Foram projetadas, testadas com suíte de casos de borda e documentadas as implementações para:
1. **Normalização e Matching de Telefones**: Função `matchClientPhone(phoneA, phoneB)` com inteligência para tolerar sufixos de 8 dígitos, presença/ausência do 9º dígito móvel, DDI 55, DDD e sufixos de JID do WhatsApp (`@c.us`), prevenindo falsos positivos entre DDDs distintos (ex: 21 vs 22);
2. **Motor de Regras `isFaqApplicableToClient(faqItem, clientPhone)`**: Suporte rigoroso a escopos (`all`, `exclude`, `include_only`), validação de status (`ativo`), tolerância a arrays ou strings delimitadas de telefones, e tratamento robusto de telefones nulos/inválidos;
3. **Endpoints REST no `initWhatsAppEngine`**:
   - `GET /api/whatsapp/faq`: Listagem com suporte a filtros (`category`, `status`, `scope`, `search`);
   - `POST /api/whatsapp/faq`: Criação com validação de obrigatoriedade, geração de ID (`faq_<timestamp>_<rand>`) e defaults defensivos;
   - `PUT /api/whatsapp/faq/:id`: Edição com atualização de campos e timestamp `updatedAt`;
   - `DELETE /api/whatsapp/faq/:id`: Remoção atômica;
   - `POST /api/whatsapp/faq/:id/approve`: Aprovação em 1 clique, promovendo para `status: "ativo"`, registrando `approvedAt` e promovendo `suggestedAnswer` para `answer`;
4. **Resolução de Paridade Dual-Mirrored**: Alinhamento imediato de `scripts/whatsapp-ai-service.mjs` com `artifacts/api-server/whatsapp-ai-service.mjs` para restaurar paridade de 100% de bytes.

---

## 2. Investigação de Normalização de Telefone & Matching

### 2.1 Análise de `cleanWhatsAppPhone`
Em `zapi-service.mjs` (linhas 1069-1084):
```javascript
export function cleanWhatsAppPhone(rawPhone) {
  if (!rawPhone) return "";
  let digits = String(rawPhone).replace(/\D/g, "");
  if (!digits) return "";
  
  // Remove zeros à esquerda (ex: 022998505276 -> 22998505276)
  while (digits.startsWith("0")) {
    digits = digits.substring(1);
  }

  // Se tem 10 ou 11 dígitos (DDD + número no Brasil), adiciona 55
  if (digits.length === 10 || digits.length === 11) {
    digits = "55" + digits;
  }
  return digits;
}
```

**Comportamento Observado**:
- Entrada com caracteres especiais (`+55 (22) 99850-5276`) ou JID (`5522998505276@c.us`) tem todos os caracteres não-numéricos removidos;
- Zeros à esquerda (ex: de discagem DDD com zero `022...`) são descartados;
- Telefones com 10 dígitos (DDD + 8 dígitos) ou 11 dígitos (DDD + 9 dígitos) recebem o prefixo do DDI brasileiro `55`;
- Números com 12 dígitos (55 + DDD + 8 dígitos - padrão comum retornado pela Z-API) ou 13 dígitos (55 + DDD + 9 dígitos) são preservados;
- Números com menos de 10 dígitos (ex: apenas 8 ou 9 dígitos sem DDD) retornam seus dígitos brutos.

### 2.2 Padrão de Matching no Repositório
No código existente (`zapi-service.mjs:3951`, `5284`, `6301` e `whatsapp-ai-service.mjs:180`, `540`), o sistema compara telefones verificando se os últimos 8 dígitos coincidem:
```javascript
const isAllowed = allowed.some(a => targetNorm.endsWith(a.slice(-8)) || a.endsWith(targetNorm.slice(-8)));
```
**Vantagem**: Resolve a discrepância brasileira do 9º dígito adicional em celulares (o sufixo de 8 dígitos é idêntico com ou sem o 9 inicial).
**Risco Identificado**: Se comparar apenas os últimos 8 dígitos sem validar o DDD, números de DDDs distintos com o mesmo número terminal (ex: `(21) 99850-5276` vs `(22) 99850-5276`) poderiam colidir.

### 2.3 Design da Função `matchClientPhone(phoneA, phoneB)`
Para garantir precisão máxima tanto para telefones completos quanto parciais, desenvolvemos a seguinte lógica:
```javascript
export function matchClientPhone(phoneA, phoneB) {
  if (!phoneA || !phoneB) return false;
  const cleanA = cleanWhatsAppPhone(phoneA);
  const cleanB = cleanWhatsAppPhone(phoneB);
  if (!cleanA || !cleanB) return false;

  // Igualdade exata
  if (cleanA === cleanB) return true;

  // Se algum tiver menos de 8 dígitos, não é comparável
  if (cleanA.length < 8 || cleanB.length < 8) return false;

  const last8A = cleanA.slice(-8);
  const last8B = cleanB.slice(-8);
  if (last8A !== last8B) return false;

  // Extrai DDD para evitar colisão entre estados/regiões diferentes (ex: 21 vs 22)
  const getDdd = (clean) => {
    if (clean.startsWith("55") && (clean.length === 12 || clean.length === 13)) {
      return clean.slice(2, 4);
    }
    if (clean.length === 10 || clean.length === 11) {
      return clean.slice(0, 2);
    }
    return null;
  };

  const dddA = getDdd(cleanA);
  const dddB = getDdd(cleanB);

  // Se ambos forneceram DDD identificável, os DDDs DEVEM ser iguais
  if (dddA && dddB && dddA !== dddB) {
    return false;
  }

  // Sufixo terminal compatível
  return cleanA.endsWith(last8B) || cleanB.endsWith(last8A);
}
```

---

## 3. Investigação & Design do Motor de Regras `isFaqApplicableToClient`

### 3.1 Requisitos do Motor
Conforme `ORIGINAL_REQUEST.md` (§R4):
- `scope`:
  - `"all"`: Válido para todos os clientes (padrão quando omitido);
  - `"exclude"`: Válido para todos, **exceto** os clientes listados em `clientPhones`;
  - `"include_only"`: Válido **exclusivamente** para os clientes listados em `clientPhones`.
- `clientPhones`: Lista de números de telefone formatados ou puros;
- Status: Se `faqItem.status` for informado e diferente de `"ativo"` (ex: `"inativo"`, `"pendente"`, `"aguardando_aprovacao"`), a resposta não deve ser aplicada.

### 3.2 Design da Função `isFaqApplicableToClient`
```javascript
export function isFaqApplicableToClient(faqItem, clientPhone) {
  if (!faqItem) return false;

  // Respeita status: apenas itens ativos (ou itens de teste sem status explícito) são aplicáveis
  if (faqItem.status && faqItem.status !== "ativo") {
    return false;
  }

  const scope = faqItem.scope || "all";
  if (scope === "all") {
    return true;
  }

  // Normaliza lista de telefones da regra (suporta array ou string delimitada)
  const rawPhones = Array.isArray(faqItem.clientPhones)
    ? faqItem.clientPhones
    : (typeof faqItem.clientPhones === "string" ? faqItem.clientPhones.split(/[,;\s]+/) : []);
  const clientPhones = rawPhones.map(p => String(p).trim()).filter(Boolean);

  // Se o telefone do cliente for indefinido/vazio
  if (!clientPhone) {
    if (scope === "exclude") return true; // Não há como excluir cliente desconhecido
    if (scope === "include_only") return false; // Não há como incluir cliente desconhecido
    return true;
  }

  const isMatched = clientPhones.some(p => matchClientPhone(clientPhone, p));

  if (scope === "exclude") {
    // Se deu match com a lista de exclusão, NÃO é aplicável
    return !isMatched;
  }

  if (scope === "include_only") {
    // Se a lista estiver vazia, ninguém é incluído
    if (clientPhones.length === 0) return false;
    // Só é aplicável se coincidir com a lista
    return isMatched;
  }

  return true;
}
```

### 3.3 Matriz de Verificação de Casos de Borda (Testada com Node.js)
| Cenário | Configuração da Regra | Entrada `clientPhone` | Resultado Esperado | Status do Teste |
|---|---|---|---|---|
| Escopo padrão (`all`) | `{ scope: 'all' }` | `"5522998505276"` | `true` | Aprovado |
| Exclusão (match positivo) | `{ scope: 'exclude', clientPhones: ['22998505276'] }` | `"5522998505276"` | `false` | Aprovado |
| Exclusão (não-match) | `{ scope: 'exclude', clientPhones: ['22998505276'] }` | `"5521998505276"` | `true` | Aprovado |
| Inclusão Restrita (match) | `{ scope: 'include_only', clientPhones: ['22998505276'] }` | `"5522998505276"` | `true` | Aprovado |
| Inclusão Restrita (não-match) | `{ scope: 'include_only', clientPhones: ['22998505276'] }` | `"5521998505276"` | `false` | Aprovado |
| Variação 8 vs 9 dígitos | `{ scope: 'include_only', clientPhones: ['552298505276'] }` | `"5522998505276"` | `true` | Aprovado |
| Formatação + JID `@c.us` | `{ scope: 'include_only', clientPhones: ['+55 (22) 99850-5276'] }` | `"5522998505276@c.us"` | `true` | Aprovado |
| Item com `status: "inativo"` | `{ status: 'inativo', scope: 'all' }` | `"5522998505276"` | `false` | Aprovado |
| Item com `status: "pendente"` | `{ status: 'pendente', scope: 'all' }` | `"5522998505276"` | `false` | Aprovado |
| Cliente nulo com `exclude` | `{ scope: 'exclude', clientPhones: ['22998505276'] }` | `null` | `true` | Aprovado |
| Cliente nulo com `include_only` | `{ scope: 'include_only', clientPhones: ['22998505276'] }` | `null` | `false` | Aprovado |
| Lista de telefones como string | `{ scope: 'include_only', clientPhones: '22998505276, 21997142513' }` | `"5521997142513"` | `true` | Aprovado |
| Lista vazia com `include_only` | `{ scope: 'include_only', clientPhones: [] }` | `"5522998505276"` | `false` | Aprovado |

---

## 4. Investigação & Design dos Endpoints REST em `zapi-service.mjs`

### 4.1 Ponto de Injeção
Em `zapi-service.mjs`:
- Inicialização de defaults em `ensureDbDefaults()` (linha 4208+):
  ```javascript
  if (!Array.isArray(db.faqItems)) {
    db.faqItems = [];
  }
  ```
- Registro dos endpoints na função `initWhatsAppEngine`: linha 6360 (logo após `/api/whatsapp/chat/:phone/ai-suggest` e antes do `setTimeout` de auto-sincronização).

### 4.2 Especificação dos 5 Endpoints

#### 1. `GET /api/whatsapp/faq`
- **Finalidade**: Listar perguntas e respostas cadastradas com suporte a filtros dinâmicos;
- **Query Params**:
  - `category`: Filtra por categoria (`reservas`, `checkin_acesso`, `wifi_tecnologia`, etc.);
  - `status`: Filtra por status (`ativo`, `inativo`, `pendente`, `aguardando_aprovacao`);
  - `scope`: Filtra por escopo (`all`, `exclude`, `include_only`);
  - `search`: Busca textual em pergunta, resposta, palavras-chave e variações;
- **Resposta**:
  ```json
  {
    "success": true,
    "count": 10,
    "items": [ ... ]
  }
  ```

#### 2. `POST /api/whatsapp/faq`
- **Finalidade**: Criar um novo item de FAQ;
- **Payload**:
  ```json
  {
    "question": "Como funciona o café da manhã?",
    "answer": "O café da manhã é servido no quarto das 06:30 às 10:00...",
    "category": "cafe_manha",
    "keywords": ["café", "desjejum", "manhã"],
    "variations": ["tem café da manhã?", "que horas é o café?"],
    "scope": "all",
    "clientPhones": [],
    "status": "ativo"
  }
  ```
- **Validação**: `question` obrigatória (retorna 400 se ausente ou vazia);
- **Defaults**:
  - `status`: `"ativo"` se houver resposta, senão `"pendente"`;
  - `category`: `"estrutura_flat"` se não especificada;
  - `scope`: `"all"`;
  - `id`: `faq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  - `createdAt` e `updatedAt`: `new Date().toISOString()`;
- **Persistência**: `db.faqItems.push(newItem)` e chamada a `saveDatabase()`;
- **Status HTTP**: `201 Created`.

#### 3. `PUT /api/whatsapp/faq/:id`
- **Finalidade**: Atualizar campos de um item existente de FAQ;
- **Payload**: Campos parciais (`question`, `answer`, `category`, `keywords`, `variations`, `scope`, `clientPhones`, `status`, `suggestedAnswer`);
- **Validação**: Retorna 404 `{ error: "Item do FAQ não encontrado." }` se ID inexistente;
- **Efeito**: Atualiza campos presentes, define `updatedAt = new Date().toISOString()` e chama `saveDatabase()`;
- **Resposta**: `{ success: true, item: updatedItem }`.

#### 4. `DELETE /api/whatsapp/faq/:id`
- **Finalidade**: Excluir um item de FAQ do banco;
- **Validação**: Retorna 404 se ID inexistente;
- **Efeito**: Remove do array `db.faqItems` e chama `saveDatabase()`;
- **Resposta**: `{ success: true, id: deletedId }`.

#### 5. `POST /api/whatsapp/faq/:id/approve`
- **Finalidade**: Aprovar sugestão em 1 clique (requisito R1 e R3);
- **Payload**: Opcional `{ answer?, category?, question? }`;
- **Lógica**:
  1. Localiza item por ID (404 se ausente);
  2. Determina a resposta final:
     - `req.body.answer` (se fornecido pelo operador no modal);
     - ou `item.suggestedAnswer` (capturado automaticamente da conversa com o hóspede);
     - ou `item.answer` pré-existente;
  3. Se não houver nenhuma resposta válida: retorna 400 `{ error: "Não é possível aprovar sem uma resposta definida ou sugerida." }`;
  4. Atualiza `item.answer = finalAnswer`;
  5. Se `req.body.category` ou `req.body.question` forem passados, atualiza-os;
  6. Define `item.status = "ativo"`;
  7. Define `item.approvedAt = new Date().toISOString()`;
  8. Define `item.updatedAt = new Date().toISOString()`;
  9. Executa `saveDatabase()`;
  10. Retorna `{ success: true, item }`.

---

## 5. Resolução da Divergência SHA-256 em `whatsapp-ai-service.mjs`

### 5.1 Evidência Forense da Divergência
Executando `git diff --no-index artifacts/api-server/whatsapp-ai-service.mjs scripts/whatsapp-ai-service.mjs`:
```diff
--- a/artifacts/api-server/whatsapp-ai-service.mjs
+++ b/scripts/whatsapp-ai-service.mjs
@@ -9,7 +9,7 @@
-import { cleanWhatsAppPhone, DEFAULT_TEST_ALLOWED_PHONES } from "./zapi-service.mjs";
+import { cleanWhatsAppPhone } from "./zapi-service.mjs";
@@ -532,7 +532,8 @@
   // 2. Verifica se está em Modo de Teste
   if (db.zapiConfig?.testModeOnly === true) {
-    const allowed = [...DEFAULT_TEST_ALLOWED_PHONES, ...String(db.zapiConfig.testAllowedPhones || "").split(/[,\s]+/)]
+    const allowed = String(db.zapiConfig.testAllowedPhones || "")
+      .split(/[,\s]+/)
```

### 5.2 Avaliação do Teste de Integridade (Teste 10)
Em `tests/whatsapp-ai-agent.test.mjs` (linha 311):
```javascript
test("10. Integridade dos Arquivos Duplos Espelhados (SHA256)", async () => {
  const hashAiApi = getHash("artifacts/api-server/whatsapp-ai-service.mjs");
  const hashAiScript = getHash("scripts/whatsapp-ai-service.mjs");
  assert.equal(hashAiApi, hashAiScript);
  ...
});
```
Executado isoladamente no Node.js:
`AssertionError: '6683557d7c735deb3b23494ea41307bacfebb33df8252771274d4b24506653c8' == '1dd69090f7ff3ac2e0f513432eb53909dcbd9fd5a4b32853458b5d16b3ee2991'`

A versão em `artifacts/api-server/whatsapp-ai-service.mjs` está **correta**:
- `DEFAULT_TEST_ALLOWED_PHONES` foi criado em `zapi-service.mjs:1096` exatamente para liberar Miller Mendonça (`22998505276`) e números de teste;
- Sem essa inclusão, `scripts/whatsapp-ai-service.mjs` bloqueia mensagens do gestor caso `db.zapiConfig.testAllowedPhones` não seja preenchido explicitamente;
- O arquivo `scripts/whatsapp-ai-service.mjs` simplesmente não havia recebido a atualização de espelhamento.

### 5.3 Resolução Recomendada
Copiar as linhas 12 e 534-540 de `artifacts/api-server/whatsapp-ai-service.mjs` para `scripts/whatsapp-ai-service.mjs`, ou sincronizar o arquivo na íntegra. Além disso, ao adicionar a exportação de `isFaqApplicableToClient` e `matchClientPhone`, garantir que ambos os arquivos recebam exatamente as mesmas linhas e quebras de linha.

---

## 6. Proposta Concreta de Código & Diffs Recomendados

### 6.1 Diffs para `zapi-service.mjs` (Aplicar em `artifacts/api-server/zapi-service.mjs` E `scripts/zapi-service.mjs`)

#### Trecho A: Exportar `matchClientPhone` e `isFaqApplicableToClient` (após linha 1084)
```javascript
// ── Comparador Seguro de Telefones com Tolerância a 8/9 Dígitos e DDD ──────────
export function matchClientPhone(phoneA, phoneB) {
  if (!phoneA || !phoneB) return false;
  const cleanA = cleanWhatsAppPhone(phoneA);
  const cleanB = cleanWhatsAppPhone(phoneB);
  if (!cleanA || !cleanB) return false;

  if (cleanA === cleanB) return true;
  if (cleanA.length < 8 || cleanB.length < 8) return false;

  const last8A = cleanA.slice(-8);
  const last8B = cleanB.slice(-8);
  if (last8A !== last8B) return false;

  const getDdd = (clean) => {
    if (clean.startsWith("55") && (clean.length === 12 || clean.length === 13)) {
      return clean.slice(2, 4);
    }
    if (clean.length === 10 || clean.length === 11) {
      return clean.slice(0, 2);
    }
    return null;
  };

  const dddA = getDdd(cleanA);
  const dddB = getDdd(cleanB);
  if (dddA && dddB && dddA !== dddB) {
    return false;
  }

  return cleanA.endsWith(last8B) || cleanB.endsWith(last8A);
}

// ── Motor de Regras de Exceção e Segmentação por Cliente (FAQ Sofia) ───────────
export function isFaqApplicableToClient(faqItem, clientPhone) {
  if (!faqItem) return false;
  if (faqItem.status && faqItem.status !== "ativo") return false;

  const scope = faqItem.scope || "all";
  if (scope === "all") return true;

  const rawPhones = Array.isArray(faqItem.clientPhones)
    ? faqItem.clientPhones
    : (typeof faqItem.clientPhones === "string" ? faqItem.clientPhones.split(/[,;\s]+/) : []);
  const clientPhones = rawPhones.map(p => String(p).trim()).filter(Boolean);

  if (!clientPhone) {
    if (scope === "exclude") return true;
    if (scope === "include_only") return false;
    return true;
  }

  const isMatched = clientPhones.some(p => matchClientPhone(clientPhone, p));

  if (scope === "exclude") {
    return !isMatched;
  }

  if (scope === "include_only") {
    if (clientPhones.length === 0) return false;
    return isMatched;
  }

  return true;
}
```

#### Trecho B: Inicialização Defensiva em `ensureDbDefaults()` (linha 4208)
```javascript
  function ensureDbDefaults() {
    const db = getDb();
    if (!db) return;
    if (!Array.isArray(db.faqItems)) {
      db.faqItems = [];
    }
    if (!db.zapiConfig) {
      // ...
```

#### Trecho C: Endpoints REST em `initWhatsAppEngine` (linha 6360, após `/api/whatsapp/chat/:phone/ai-suggest`)
```javascript
  // ─── Base de Conhecimento & FAQ Dinâmico Endpoints ─────────────────────────

  // 6. Listar FAQs (com filtros opcionais por categoria, status, escopo e busca)
  app.get("/api/whatsapp/faq", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    let items = Array.isArray(db.faqItems) ? [...db.faqItems] : [];
    const { category, status, scope, search } = req.query || {};

    if (category) {
      items = items.filter(i => i.category === category);
    }
    if (status) {
      items = items.filter(i => i.status === status);
    }
    if (scope) {
      items = items.filter(i => i.scope === scope);
    }
    if (search) {
      const q = String(search).toLowerCase().trim();
      items = items.filter(i =>
        (i.question && i.question.toLowerCase().includes(q)) ||
        (i.answer && i.answer.toLowerCase().includes(q)) ||
        (Array.isArray(i.keywords) && i.keywords.some(k => String(k).toLowerCase().includes(q))) ||
        (Array.isArray(i.variations) && i.variations.some(v => String(v).toLowerCase().includes(q)))
      );
    }

    res.json({ success: true, count: items.length, items });
  });

  // 7. Criar FAQ
  app.post("/api/whatsapp/faq", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const body = req.body || {};
    const question = String(body.question || "").trim();
    if (!question) {
      return res.status(400).json({ error: "Pergunta é obrigatória." });
    }

    const answer = String(body.answer || "").trim();
    const category = body.category || "estrutura_flat";
    const status = body.status || (answer ? "ativo" : "pendente");
    const scope = body.scope || "all";

    const parseList = (val) => {
      if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
      if (typeof val === "string") return val.split(/[,;\n\s]+/).map(s => s.trim()).filter(Boolean);
      return [];
    };

    const keywords = parseList(body.keywords);
    const variations = parseList(body.variations);
    const rawPhones = parseList(body.clientPhones);
    const clientPhones = rawPhones.map(p => cleanWhatsAppPhone(p) || p.replace(/\D/g, "")).filter(Boolean);

    const now = new Date().toISOString();
    const newItem = {
      id: body.id || `faq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      question,
      answer,
      category,
      keywords,
      variations,
      status,
      scope,
      clientPhones,
      suggestedAnswer: body.suggestedAnswer ? String(body.suggestedAnswer).trim() : undefined,
      sourceClientPhone: body.sourceClientPhone ? String(body.sourceClientPhone).trim() : undefined,
      sourceClientName: body.sourceClientName ? String(body.sourceClientName).trim() : undefined,
      createdAt: now,
      updatedAt: now
    };

    db.faqItems.push(newItem);
    if (typeof saveDatabase === "function") saveDatabase();
    res.status(201).json({ success: true, item: newItem });
  });

  // 8. Atualizar FAQ
  app.put("/api/whatsapp/faq/:id", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const item = (db.faqItems || []).find(i => i.id === req.params.id);
    if (!item) {
      return res.status(404).json({ error: "Item do FAQ não encontrado." });
    }

    const body = req.body || {};
    if (body.question !== undefined) item.question = String(body.question).trim();
    if (body.answer !== undefined) item.answer = String(body.answer).trim();
    if (body.category !== undefined) item.category = body.category;
    if (body.status !== undefined) item.status = body.status;
    if (body.scope !== undefined) item.scope = body.scope;

    const parseList = (val) => {
      if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
      if (typeof val === "string") return val.split(/[,;\n\s]+/).map(s => s.trim()).filter(Boolean);
      return [];
    };

    if (body.keywords !== undefined) item.keywords = parseList(body.keywords);
    if (body.variations !== undefined) item.variations = parseList(body.variations);
    if (body.clientPhones !== undefined) {
      const rawPhones = parseList(body.clientPhones);
      item.clientPhones = rawPhones.map(p => cleanWhatsAppPhone(p) || p.replace(/\D/g, "")).filter(Boolean);
    }
    if (body.suggestedAnswer !== undefined) item.suggestedAnswer = String(body.suggestedAnswer).trim();

    item.updatedAt = new Date().toISOString();
    if (typeof saveDatabase === "function") saveDatabase();
    res.json({ success: true, item });
  });

  // 9. Excluir FAQ
  app.delete("/api/whatsapp/faq/:id", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const idx = (db.faqItems || []).findIndex(i => i.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: "Item do FAQ não encontrado." });
    }

    const deleted = db.faqItems.splice(idx, 1)[0];
    if (typeof saveDatabase === "function") saveDatabase();
    res.json({ success: true, id: deleted.id });
  });

  // 10. Aprovar Sugestão em 1 Clique
  app.post("/api/whatsapp/faq/:id/approve", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const item = (db.faqItems || []).find(i => i.id === req.params.id);
    if (!item) {
      return res.status(404).json({ error: "Item do FAQ não encontrado." });
    }

    const body = req.body || {};
    const finalAnswer = body.answer !== undefined && String(body.answer).trim() !== ""
      ? String(body.answer).trim()
      : (item.suggestedAnswer || item.answer);

    if (!finalAnswer) {
      return res.status(400).json({ error: "Não é possível aprovar sem uma resposta definida ou sugerida." });
    }

    item.answer = finalAnswer;
    if (body.category) item.category = body.category;
    if (body.question) item.question = String(body.question).trim();

    item.status = "ativo";
    item.approvedAt = new Date().toISOString();
    item.updatedAt = new Date().toISOString();

    if (typeof saveDatabase === "function") saveDatabase();
    res.json({ success: true, item });
  });
```

---

### 6.2 Diffs para `whatsapp-ai-service.mjs` (Aplicar em `artifacts/api-server/whatsapp-ai-service.mjs` E `scripts/whatsapp-ai-service.mjs`)

#### Linha 12: Import e Re-export
```javascript
import { cleanWhatsAppPhone, DEFAULT_TEST_ALLOWED_PHONES, isFaqApplicableToClient, matchClientPhone } from "./zapi-service.mjs";
import { getCheckinUrlSync as getSerproCheckinUrlSync } from "./fnrh-serpro-service.mjs";

export { isFaqApplicableToClient, matchClientPhone };
```

#### Linha 534: Modo de Teste Idêntico em ambos os espelhos
```javascript
  // 2. Verifica se está em Modo de Teste
  if (db.zapiConfig?.testModeOnly === true) {
    const allowed = [...DEFAULT_TEST_ALLOWED_PHONES, ...String(db.zapiConfig.testAllowedPhones || "").split(/[,\s]+/)]
      .map(p => cleanWhatsAppPhone(p))
      .filter(Boolean);
    const targetNorm = cleanWhatsAppPhone(cleanTarget);
    const isAllowed = allowed.some(a => targetNorm.endsWith(a.slice(-8)) || a.endsWith(targetNorm.slice(-8)));
    if (!isAllowed) {
      console.log(`[WhatsApp AI] Modo de Teste ativo: mensagem de ${cleanTarget} ignorada pela IA.`);
      return { skipped: true, reason: "test_mode_not_allowed" };
    }
  }
```

---

## 7. Próximos Passos para o Worker de Implementação
1. Aplicar os trechos A, B e C em `artifacts/api-server/zapi-service.mjs` e `scripts/zapi-service.mjs`;
2. Atualizar `scripts/whatsapp-ai-service.mjs` e `artifacts/api-server/whatsapp-ai-service.mjs` com o import/re-export e paridade total;
3. Executar script de validação de SHA-256 para assegurar 100% de paridade binária entre `artifacts/` e `scripts/`;
4. Adicionar testes unitários dedicados em `tests/whatsapp-ai-agent.test.mjs` para validar `matchClientPhone`, `isFaqApplicableToClient` e as 5 novas rotas REST do FAQ.

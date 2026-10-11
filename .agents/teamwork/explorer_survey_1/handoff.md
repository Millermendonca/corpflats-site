# Handoff Report: Investigação Técnica de FAQ & Base de Conhecimento Dinâmica da Sofia

**Subagent**: Explorer Survey 1  
**Data**: 2026-10-11  
**Destinatário**: Orchestrator (`27c61f6a-5652-421c-bbda-1b5d6be7db98`)  
**Status**: Concluído (Hard Handoff)

---

## 1. Observation

### O1. Inicialização e Registro de Rotas no Backend
- Em `artifacts/api-server/demo-server.mjs:5382` (e `scripts/demo-server.mjs:5382`):
  ```javascript
  initWhatsAppEngine(app, () => db, saveDatabase, createNotification, (text, ctx) => analyzeTextSentimentWithAI(text, ctx));
  ```
- Em `artifacts/api-server/zapi-service.mjs:4201`:
  `initWhatsAppEngine` recebe `app`, `dbOrGetter`, `saveDatabase`, `createNotification` e registra as rotas `/api/whatsapp/*`.
- Atualmente, as rotas existentes para IA são:
  - `GET /api/whatsapp/ai-config` (linha 6215)
  - `POST /api/whatsapp/ai-config` (linha 6231)
  - `POST /api/whatsapp/ai-simulate` (linha 6262)
  - `POST /api/whatsapp/chat/:phone/ai-toggle` (linha 6293)
  - `POST /api/whatsapp/chat/:phone/ai-suggest` (linha 6325)
- Não existem rotas de FAQ (`/api/whatsapp/faq*` ou `/api/faq*`) registradas no momento.

### O2. Webhook Inbound da Z-API e Disparo da IA
- Em `artifacts/api-server/zapi-service.mjs:5447`:
  Rota `POST /api/whatsapp/webhook/received` processa mensagens recebidas da Z-API.
- Linha 5464: extrai metadados via `extractIncomingMessageInfo(req.body)`.
- Linha 5473: `cleanTarget = incomingInfo.isGroup ? rawTarget : cleanWhatsAppPhone(rawTarget)`.
- Linha 5477: grava mensagem no chat via `appendMessageToConversation`.
- Linhas 5637-5649:
  ```javascript
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

### O3. Manipulação de Mensagens do Operador Humano (`fromMe: true`)
- No Webhook Z-API (`zapi-service.mjs:5477-5506`): mensagens com `incomingInfo.fromMe === true` são salvas no chat (`conv.messages`), mas atualmente não executam busca de perguntas pendentes nem alteram status de FAQ.
- No Live Chat (`zapi-service.mjs:5960-6045`): rota `POST /api/whatsapp/chats/:phone/messages` pausa a IA na conversa nas linhas 6023-6027:
  ```javascript
  if (updatedConv) {
    updatedConv.aiPaused = true;
    updatedConv.aiPausedAt = nowIso;
    updatedConv.aiPausedReason = "operator_manual_reply";
  }
  ```
  mas também não possui integração prévia com perguntas pendentes do FAQ.
- A Z-API possui o recurso `notifySentByMe: true` explicitamente ativado em `syncZapiWebhooks` (`zapi-service.mjs:3330-3342`), o que garante que respostas enviadas pelo Miller diretamente no smartphone cheguem ao webhook com `fromMe: true`.

### O4. Motor da Sofia (`whatsapp-ai-service.mjs`)
- Em `artifacts/api-server/whatsapp-ai-service.mjs`:
  - Linhas 64-80: `DEFAULT_AI_CONFIG.knowledgeBase` armazena chaves estáticas (`address`, `checkinTime`, `checkoutTime`, `wifiNetwork`, `wifiPassword`, `breakfastInfo`, `garageInfo`, `petPolicy`, etc.).
  - Linhas 446-474: `contextString` monta essas propriedades fixas para o system instruction do Gemini.
  - Linhas 286-362: `generateHeuristicResponse` realiza buscas regex hardcoded em `text` para Wi-Fi, café, garagem, endereço, checkout, quarto pronto, lead e saudação, caindo na mensagem padrão de atendimento.
  - Linhas 513-679: `processAiInboundMessage` avalia transbordo (`detectHandoverIntent`) e gera a resposta, sem consultar nenhuma coleção dinâmica de FAQs.

### O5. Persistência de Dados e Banco (`data/database.json`)
- Em `artifacts/api-server/demo-server.mjs:587`:
  `const DB_FILE = process.env.DATA_FILE || process.env.DATABASE_FILE || path.join(DATA_DIR, "database.json");`
- Linhas 3452-3465: `loadDatabase()` faz `Object.assign(db, loaded)`.
- Linha 5026: `saveDatabase()` escreve atomicamente no arquivo local via `fs.writeFileSync(DB_FILE, stateJson, "utf-8")` e replica no PostgreSQL (`system_store`).
- `data/database.json` atualmente não possui a chave `faqItems`.

### O6. Normalização de Telefones
- Em `artifacts/api-server/zapi-service.mjs:1069`:
  ```javascript
  export function cleanWhatsAppPhone(rawPhone) {
    if (!rawPhone) return "";
    let digits = String(rawPhone).replace(/\D/g, "");
    if (!digits) return "";
    while (digits.startsWith("0")) { digits = digits.substring(1); }
    if (digits.length === 10 || digits.length === 11) {
      digits = "55" + digits;
    }
    return digits;
  }
  ```
- Comparação de correspondência resiliente adotada no sistema (`zapi-service.mjs:3951`, `whatsapp-ai-service.mjs:180`):
  `cleanPhone.endsWith(rPhone.slice(-8)) || rPhone.endsWith(cleanPhone.slice(-8))` ou comparação dos últimos 8 dígitos.

### O7. Paridade de Código e Build
- Teste de testes unitários: `node --test tests/whatsapp-ai-agent.test.mjs` passou com 100% de sucesso em 1.88s.
- Teste de build frontend: `npm run build` na pasta `artifacts/limpeza` executou com sucesso (código 0 em 45.47s), gerando `artifacts/limpeza/dist/`.
- Verificação de hashes: 6 de 7 arquivos gêmeos em `artifacts/api-server` e `scripts` possuem SHA-256 idêntico. Divergência prévia identificada em `whatsapp-ai-service.mjs` (`DEFAULT_TEST_ALLOWED_PHONES`).

---

## 2. Logic Chain

1. **Da observação O1 e O5 para a Modelagem de `db.faqItems`**:
   Como não existem FAQs dinâmicos persistidos no banco ou endpoints registrados, a inicialização padrão de `db.faqItems` deve ser inserida em `loadDatabase()` e exposta via endpoints RESTful em `initWhatsAppEngine` (`GET/POST/PUT/DELETE /api/whatsapp/faq` e `POST /api/whatsapp/faq/:id/approve`).
2. **Da observação O2 e O4 para a Auto-Detecção de Perguntas Inéditas (R2)**:
   Em `processAiInboundMessage`, quando uma mensagem inbound de cliente não encontrar correspondência com alta confiança no FAQ e resultar em transbordo ou contingência padrão sem resposta satisfatória, o sistema deve registrar a pergunta em `db.faqItems` com status `"pendente"`, contendo o telefone do cliente, nome, data/hora e categoria inferida.
3. **Da observação O3 para a Captura da Resposta Humana (R3)**:
   Como a Z-API já tem `notifySentByMe: true` configurado e o Live Chat passa pelo endpoint interno, qualquer mensagem enviada com `fromMe === true` para um cliente que possua uma pergunta pendente aberta nas últimas 24h deve vincular o texto do operador a `suggestedAnswer` e promover o status para `"aguardando_aprovacao"`, disparando notificação e pausando a IA na conversa.
4. **Da observação O6 para o Motor de Regras de Exceção (R4)**:
   A função `isFaqApplicableToClient(faqItem, clientPhone)` utilizando a normalização de dígitos e o sufixo de 8 dígitos resolve com precisão matemática os escopos `"all"`, `"exclude"` (ignora resposta se o cliente estiver na lista) e `"include_only"` (só responde se o cliente estiver na lista).
5. **Da observação O4 para a Integração com o Motor da Sofia (R5)**:
   Filtrando `db.faqItems` com `isFaqApplicableToClient`, o prompt do Gemini recebe dinamicamente as FAQs oficiais aprovadas e a contingência heurística local pesquisa nas palavras-chave cadastradas antes do transbordo.
6. **Da observação O7 para a Entrega e Paridade**:
   As alterações no backend devem ser aplicadas em paridade estrita entre `artifacts/api-server/` e `scripts/`, com testes unitários em `tests/whatsapp-ai-agent.test.mjs` e compilação do frontend em `artifacts/limpeza`.

---

## 3. Caveats

1. **Janela de Atendimento para Captura de Resposta**: Assumiu-se uma janela de 24 horas para associar a resposta do operador (`fromMe: true`) à pergunta pendente do cliente. Se o operador responder após 48 horas, a pergunta continuará `"pendente"` no painel e o operador poderá aprová-la/editá-la manualmente.
2. **Anti-Duplicação de Perguntas Pendentes**: Se o mesmo cliente enviar a mesma dúvida repetidas vezes antes de ser respondido, o sistema deve atualizar o timestamp da pergunta pendente existente em vez de gerar múltiplos registros duplicados.
3. **Persistência PostgreSQL vs Arquivo Local**: Em ambiente de desenvolvimento local, a persistência atua primariamente via `data/database.json`. Em ambiente de produção (Render), o PostgreSQL sincroniza via `system_store`. A estrutura proposta é 100% compatível com ambos os mecanismos.

---

## 4. Conclusion

A arquitetura do backend está totalmente mapeada e preparada para receber a Gestão de FAQ & Base de Conhecimento Dinâmica com Auto-Aprendizado:
- **Endpoints CRUD**: Implementáveis diretamente em `zapi-service.mjs:initWhatsAppEngine`.
- **Auto-Detecção (R2)**: Acionável dentro de `whatsapp-ai-service.mjs:processAiInboundMessage`.
- **Captura Humana (R3)**: Acionável no webhook de entrada (`zapi-service.mjs:5477`) e no Live Chat (`zapi-service.mjs:6004`).
- **Motor de Exceção & Sofia (R4 & R5)**: Implementável com `isFaqApplicableToClient` e injeção dinâmica em `generateAiWhatsAppResponse` e `generateHeuristicResponse`.
- **Frontend (R1)**: Nova aba `knowledge_base` em `whatsapp-automation.tsx` com categorias, filtros e aprovação 1-clique.

---

## 5. Verification Method

1. **Testes Unitários e de Integração**:
   Executar o comando de testes do Node.js:
   ```bash
   node --test tests/whatsapp-ai-agent.test.mjs
   ```
   Critério de invalidação: Qualquer falha nos testes de transbordo, heurística ou novas asserções de FAQ e regras de exceção.
2. **Build do Frontend**:
   Executar na pasta `artifacts/limpeza`:
   ```bash
   npm run build
   ```
   Critério de invalidação: Falhas no TypeScript (`tsc`) ou no Vite gerando erro de build.
3. **Auditoria de Paridade**:
   Verificar que `Get-FileHash artifacts/api-server/*.mjs` e `scripts/*.mjs` para os arquivos modificados resultem no mesmo hash SHA-256.

# Relatório de Análise Técnica: Infraestrutura de Testes, Casos de Teste e Estado Git
**Subagente**: Explorer Survey 3  
**Data**: 2026-10-11T01:31:00Z  
**Repositório**: `Guest-Flow-Manager` (`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`)  
**Contexto**: Sistema Dinâmico de Gestão de FAQ & Base de Conhecimento para o Agente de IA do WhatsApp (Sofia / CorpFlats) com Auto-Aprendizado e Regras de Segmentação por Cliente

---

## 1. Sumário Executivo

Esta investigação técnica aprofundada examinou a infraestrutura de testes, os padrões de mocks e fixtures, o estado do repositório Git e os requisitos de teste para os requisitos R2 a R5 descritos em `ORIGINAL_REQUEST.md`.

### Principais Constatações:
1. **Framework e Execução de Testes**: O projeto utiliza nativamente o test runner padrão do Node.js (`node:test` e `node:assert/strict`). Não existe script `"test"` no `package.json` raiz (`npm test` falha com `Missing script: "test"`). Os testes são executados diretamente via comando:
   ```bash
   node --test tests/whatsapp-ai-agent.test.mjs
   ```
2. **Suíte Principal Atual (`tests/whatsapp-ai-agent.test.mjs`)**: Contém 10 testes unitários e de integração cobrindo inicialização de configurações, detecção de transbordo, contexto de hóspede, respostas heurísticas, fluxo de webhook (`processAiInboundMessage`), modo de teste Z-API, rotas Express simuladas e integridade de espelhamento SHA-256.
3. **Descoberta Crítica — Desalinhamento SHA-256 Atual**: Identificamos que `artifacts/api-server/whatsapp-ai-service.mjs` e `scripts/whatsapp-ai-service.mjs` estão atualmente com SHA-256 divergentes (linhas 12 e 535 diferem na importação/uso de `DEFAULT_TEST_ALLOWED_PHONES`). Isso faz falhar o teste `tests/m2-messaging-checkin-url.test.mjs`. Em `tests/whatsapp-ai-agent.test.mjs`, essa falha vinha sendo mascarada por um `process.exit(0)` inserido no hook `after()`.
4. **Organização de Mocks & Fixtures**: A suíte de IA utiliza mock de banco in-memory (`mockDb`), stubs de envio Z-API (`sendZapiMessage`), stubs de notificação (`createNotification`) e simulação de chave Gemini vazia (`geminiApiKey: ""`), o que força deterministicamente a contingência heurística local sem tráfego de rede externo nem custos de API.
5. **Estado Git & Regras `AGENTS.md`**: O branch atual é `main` sincronizado com `origin/main` (`https://github.com/Millermendonca/corpflats-site.git`). A regra mandatória do projeto exige `git push` imediato após qualquer commit e build de verificação (`npm run build`) em `artifacts/limpeza` com inclusão dos artefatos em `dist/public`. O build foi testado e compilou com sucesso em 47.09s.
6. **Mapeamento de Testes para R2-R5**: Foram detalhados 10 novos casos de teste necessários para validar a integridade de banco de FAQs (`db.faqItems`), detecção de dúvidas inéditas com status `"pendente"` (R2), captura de resposta humana com status `"aguardando_aprovacao"` (R3), aprovação em 1 clique para status `"ativo"`, motor de exceções `exclude`/`include_only` (R4), e busca dinâmica heurística e injeção no prompt Gemini (R5).

---

## 2. Inventário e Padrões da Infraestrutura de Testes

### 2.1 Visão Geral do Diretório `tests/`
O diretório `tests/` contém **43 arquivos de teste** (todos com extensão `.mjs`). Uma análise abrangente revelou a coexistência de três arquétipos de teste no projeto:

| Arquétipo | Exemplos | Mecânica de Execução | Tempo Médio |
|---|---|---|---|
| **In-Memory Service Tests** | `tests/whatsapp-ai-agent.test.mjs`, `tests/companion-and-email-mirror.test.mjs` | Importa módulos ESM diretamente, injeta `mockDb` e stubs de funções, executa lógica pura em memória. | 0.8s – 2s |
| **Isolated HTTP Server Tests** | `tests/bot-actions-api.test.mjs`, `tests/challenger-m1-adversarial.test.mjs`, `tests/tariff-engine.test.mjs` | Cria banco temporário (`data/test-*-db-${Date.now()}.json`), spawna `node artifacts/api-server/demo-server.mjs` em porta dedicada (ex: 3996, 4001), dispara `fetch` HTTP reais e encerra o processo via `taskkill /F /T /PID` no `after()`. | 3s – 12s |
| **Full E2E Synthetic Tests** | `e2e/runner.mjs`, `e2e/playwright.config.mjs` | Boot de sandbox isolado na porta 5055 com mocks de Z-API (5056), SMTP (5025) e SERPRO, executando Playwright em Chrome headless. | 30s – 60s |

### 2.2 Scripts de Execução (`package.json`)
No `package.json` raiz (`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\package.json`), a seção de scripts contém:
```json
"scripts": {
  "build": "npm --prefix artifacts/limpeza run build",
  "postinstall": "npm --prefix artifacts/limpeza run build",
  "start": "node server.mjs"
}
```
Não existe `npm test`. O comando `npm test` resulta em:
```
npm ERR! Missing script: "test"
```
Portanto, a convenção padrão e oficial para rodar testes individuais ou em lote no projeto é:
```powershell
node --test tests/whatsapp-ai-agent.test.mjs
node --test tests/bot-actions-api.test.mjs
node --test tests/m2-messaging-checkin-url.test.mjs
```

---

## 3. Análise Detalhada de `tests/whatsapp-ai-agent.test.mjs`

### 3.1 Estrutura e Cobertura Atual
O arquivo possui 333 linhas e estrutura-se com `describe("Agente de IA para WhatsApp - Testes Unitários e de Integração", ...)` contendo 10 testes:

1. **Configurações padrão (`getWhatsAppAiConfig`)** (linhas 76-85):
   Verifica campos `enabled: true`, `mode: "autonomous"`, `agentName: "Sofia"`, palavras-chave de transbordo e base estática de Wi-Fi.
2. **Detecção de transbordo (`detectHandoverIntent`)** (linhas 87-102):
   Verifica frases que solicitam humano ("falar com um atendente humano", "me passa para a recepção", "reclamar da limpeza") vs dúvidas comuns ("qual a senha do wifi", "quarto pronto").
3. **Contexto de hóspede com check-in hoje (`buildGuestContext`)** (linhas 104-111):
   Verifica identificação correta da reserva, flat 101, status `checkin_hoje` e `isRoomReady: true`.
4. **Contexto de Lead sem reserva (`buildGuestContext`)** (linhas 113-117):
   Valida comportamento para contatos não cadastrados (`stayStatus: "sem_reserva_ativa"`).
5. **Respostas heurísticas essenciais (`generateHeuristicResponse`)** (linhas 119-144):
   Testa geração determinística de respostas para Wi-Fi, status do flat, check-out, café da manhã e localização.
6. **Transbordo humano via `processAiInboundMessage`** (linhas 146-192):
   Simula recebimento de mensagem com solicitação de humano; verifica que a conversa é pausada (`conv.aiPaused = true`, `aiPausedReason = "guest_requested_human"`), notificação `whatsapp_handover` é gerada e mensagem de aviso é enviada via Z-API.
7. **Conversa com IA pausada não é respondida** (linhas 194-214):
   Verifica que mensagens enviadas para conversa com `conv.aiPaused = true` retornam `{ skipped: true, reason: "conversation_ai_paused" }`.
8. **Modo de teste restringe destinatários** (linhas 216-236):
   Valida bloqueio quando `zapiConfig.testModeOnly = true` e o número não está em `testAllowedPhones`.
9. **Endpoints HTTP registrados e executados** (linhas 238-309):
   Instancia `initWhatsAppEngine` com um `mockApp` Express simulado; testa:
   - `GET /api/whatsapp/ai-config`
   - `POST /api/whatsapp/ai-config`
   - `POST /api/whatsapp/chat/:phone/ai-toggle`
   - `POST /api/whatsapp/chat/:phone/ai-suggest`
   - `POST /api/whatsapp/ai-simulate`
10. **Integridade dos Arquivos Duplos Espelhados (SHA-256)** (linhas 311-326):
    Compara o hash SHA-256 dos 3 pares de arquivos de backend:
    - `artifacts/api-server/whatsapp-ai-service.mjs` vs `scripts/whatsapp-ai-service.mjs`
    - `artifacts/api-server/zapi-service.mjs` vs `scripts/zapi-service.mjs`
    - `artifacts/api-server/demo-server.mjs` vs `scripts/demo-server.mjs`

### 3.2 Vulnerabilidade Identificada: `process.exit(0)` Mascarando Falhas
No final do arquivo (linhas 328-330):
```javascript
  after(() => {
    process.exit(0);
  });
```
**Impacto Observado**:
Ao rodar `node --test tests/whatsapp-ai-agent.test.mjs`, o hook `after()` dispara `process.exit(0)` de forma abrupta. Isso encerra o processo Node antes que as falhas de assertions assíncronas do Teste 10 sejam reportadas no relatório do test runner.
Ao rodarmos isoladamente a verificação de SHA-256:
```javascript
assert.equal(getHash("artifacts/api-server/whatsapp-ai-service.mjs"), getHash("scripts/whatsapp-ai-service.mjs"));
```
O Node gerou uma exceção real:
```
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
+ '6683557d7c735deb3b23494ea41307bacfebb33df8252771274d4b24506653c8'
- '1dd69090f7ff3ac2e0f513432eb53909dcbd9fd5a4b32853458b5d16b3ee2991'
```
E no teste `tests/m2-messaging-checkin-url.test.mjs` (que não possui `process.exit(0)`), o teste falha com:
```
not ok 3 - 100% byte-for-byte identical: artifacts/api-server/whatsapp-ai-service.mjs <==> scripts/whatsapp-ai-service.mjs
```
**Recomendação Crítica**:
1. Para o time de implementação: sincronizar imediatamente `scripts/whatsapp-ai-service.mjs` com o conteúdo de `artifacts/api-server/whatsapp-ai-service.mjs`.
2. Em `tests/whatsapp-ai-agent.test.mjs`, a necessidade do `process.exit(0)` decorria do fato de `initWhatsAppEngine` iniciar um `setInterval` em segundo plano que mantinha o loop de eventos ativo. Deve-se garantir que o `setInterval` não mantenha o processo aberto (ou que possa ser desativado/unref'd em testes), evitando que o `process.exit(0)` mascare quebras reais.

---

## 4. Organização de Mocks, Stubs e Fixtures

### 4.1 Mock do Banco de Dados (`mockDb`)
O fixture `mockDb` criado no `beforeEach` de `tests/whatsapp-ai-agent.test.mjs` segue o layout canônico:
```javascript
mockDb = {
  zapiConfig: {
    instanceId: "TEST_INSTANCE",
    token: "TEST_TOKEN",
    enabled: true,
    testModeOnly: true,
    testAllowedPhones: "22998505276, 22988486446"
  },
  settings: {
    geminiApiKey: "" // Mantém vazia para garantir contingência heurística determinística
  },
  flats: [
    { id: 1, number: "101", status: "clean" },
    { id: 2, number: "202", status: "dirty" }
  ],
  cleaningRequests: [ ... ],
  reservations: [
    {
      id: 501,
      code: "RES-101-9999",
      guestName: "Carlos Drumond",
      guestPhone: "5522998505276",
      flatId: 1,
      flatNumber: "101",
      checkinDate: new Date().toISOString().slice(0, 10),
      checkoutDate: "2026-10-05",
      status: "confirmada"
    }
  ],
  whatsappConversations: [
    {
      id: "5522998505276",
      phone: "5522998505276",
      name: "Carlos Drumond",
      aiPaused: false,
      messages: []
    }
  ],
  notifications: []
};
```

### 4.2 Stubs de Webhook e Serviços Externos
Ao testar `processAiInboundMessage`:
```javascript
let sentMessage = null;
const sendZapiMock = async (cfg, opts) => {
  sentMessage = opts;
  return { success: true };
};

let createdNotif = null;
const createNotifMock = (n) => {
  createdNotif = n;
  mockDb.notifications.push(n);
};

let appendedMsg = null;
const appendMsgMock = (db, msg) => {
  appendedMsg = msg;
  const c = db.whatsappConversations.find(conv => conv.phone === msg.phone);
  if (c) c.messages.push(msg);
};
```
Essa abordagem permite verificar com precisão cirúrgica:
- O texto exato da mensagem disparada (`sentMessage.message`)
- Os metadados de notificação (`createdNotif.type === "whatsapp_handover"`)
- A persistência no histórico de mensagens da conversa (`appendedMsg`)
- O isolamento completo sem encostar em `data/database.json` de produção (`saveDatabase: () => {}`).

### 4.3 Mock de Rotas Express
No Teste 9, um `mockApp` captura todas as rotas registradas por `initWhatsAppEngine`:
```javascript
const routes = {};
const mockApp = {
  get: (path, handler) => { routes[`GET ${path}`] = handler; },
  post: (path, handler) => { routes[`POST ${path}`] = handler; },
  put: (path, handler) => { routes[`PUT ${path}`] = handler; },
  delete: (path, handler) => { routes[`DELETE ${path}`] = handler; }
};
```
Isso permite testar handlers de endpoints diretamente passando objetos `req` e `res` simulados sem necessitar de bind de porta TCP.

---

## 5. Estado Atual do Git e Diretrizes de Governança

### 5.1 Status do Repositório
- **Branch Ativa**: `main`
- **Status Remoto**: `Your branch is up to date with 'origin/main'.`
- **Remotes**:
  - `origin`: `https://github.com/Millermendonca/corpflats-site.git` (fetch e push)
  - `gitsafe-backup`: `git://gitsafe:5418/backup.git`
- **Último Commit**: `ab9386d5f676059c6ab0af2c659cec7f93b76359` (`feat(m1): implement Bot Actions API, master switch and Tariff Engine with SEBRAE pricing`)
- **Arquivos Não Rastreados / Modificados**:
  - Modificações em arquivos de auditoria e contexto de subagentes anteriores em `.agents/teamwork/`.
  - Alguns arquivos com alterações locais em `artifacts/` provenientes de tarefas prévias.

### 5.2 Regras Mandatórias de `AGENTS.md`
1. **Sempre Fazer `git push` por Padrão**:
   Qualquer `git commit` deve ser imediatamente seguido de `git push` para o repositório remoto (`origin main`). Nunca deixar commits pendentes localmente.
2. **Build de Verificação e Inclusão de `dist/`**:
   Ao alterar arquivos em `artifacts/limpeza/src`, executar `npm run build` na pasta `artifacts/limpeza` e incluir os arquivos gerados em `artifacts/limpeza/dist/` (especificamente `dist/public`) no commit.
3. **Regra de Espelhamento de Código (Dual Mirroring)**:
   Os arquivos de backend existem em duas cópias obrigatórias que devem ser **100% idênticas byte a byte (SHA-256)**:
   - `artifacts/api-server/whatsapp-ai-service.mjs` $\leftrightarrow$ `scripts/whatsapp-ai-service.mjs`
   - `artifacts/api-server/zapi-service.mjs` $\leftrightarrow$ `scripts/zapi-service.mjs`
   - `artifacts/api-server/demo-server.mjs` $\leftrightarrow$ `scripts/demo-server.mjs`
   - `artifacts/api-server/mail-service.mjs` $\leftrightarrow$ `scripts/mail-service.mjs`

---

## 6. Mapeamento de Requisitos de Teste para R2-R5 e Critérios de Aceitação

Para atender completamente a `ORIGINAL_REQUEST.md`, a suíte de testes deve ser expandida para cobrir rigorosamente as novas funcionalidades.

### 6.1 R2: Detecção Automática de Perguntas Não Mapeadas no Webhook Inbound
- **Cenário de Teste**:
  Hóspede envia mensagem inbound (`incomingInfo.fromMe === false`) com dúvida não coberta no FAQ ativo e não reconhecida pelas intenções heurísticas de alta confiança (ex: *"Vocês têm ferro de passar roupa no flat?"* ou *"Tem academia no condomínio?"*).
- **Comportamento Esperado**:
  1. A função `processAiInboundMessage` detecta que a pergunta não tem resposta mapeada de alta confiança.
  2. Cria automaticamente um novo item em `db.faqItems`:
     - `id`: identificador único (ex: `faq_${Date.now()}_...`)
     - `question`: texto exato da dúvida do cliente
     - `status`: `"pendente"`
     - `category`: categoria padrão ou inferida (ex: `"Dúvidas Gerais"`)
     - `clientPhone`: telefone limpo do cliente (`cleanTarget`)
     - `clientName`: nome do remetente (`incomingInfo.senderName` ou nome da reserva)
     - `createdAt`: ISO timestamp
     - `scope`: `"all"`
     - `clientPhones`: `[]`
  3. Gera notificação de alta prioridade para o operador.
  4. Encaminha para transbordo ou resposta contingencial educada informando que a recepção dará retorno.
- **Contra-teste (Idempotência / Não-Poluição)**:
  - Se o cliente perguntar algo já mapeado (ex: *"Qual a senha do wifi?"*), o FAQ responde normalmente e **NÃO** cria entrada em `db.faqItems`.
  - Saudações genéricas (ex: *"Olá, bom dia"*) **NÃO** geram itens pendentes no FAQ.

### 6.2 R3: Captura Automática da Resposta Humana (Sugestão para Aprovação)
- **Cenário de Teste A (Operador respondendo via WhatsApp Móvel)**:
  Webhook Z-API recebe mensagem com `incomingInfo.fromMe === true` para o telefone do cliente.
  Se houver item em `db.faqItems` com `status === "pendente"` e `clientPhone === cleanTarget`:
  - O sistema vincula `suggestedAnswer = incomingInfo.text`.
  - Atualiza o status do FAQ para `"aguardando_aprovacao"`.
  - Registra `answeredAt` e `answeredBy = "operador_whatsapp"`.
- **Cenário de Teste B (Operador respondendo via Live Chat do Sistema)**:
  Endpoint `POST /api/whatsapp/chat/send` disparado pelo painel para o telefone do cliente.
  Se houver item com `status === "pendente"`, o texto enviado vincula-se como `suggestedAnswer` e o status passa para `"aguardando_aprovacao"`.
- **Cenário de Teste C (Aprovação em 1 Clique)**:
  Endpoint `POST /api/whatsapp/faq/:id/approve` chamado:
  - Altera status para `"ativo"`.
  - Promove `suggestedAnswer` para `answer`.
  - Próxima mensagem de qualquer cliente sobre aquele tema já é respondida pela Sofia com a resposta aprovada.

### 6.3 R4: Motor de Regras de Exceção e Segmentação por Cliente
- **Estrutura dos Campos**:
  - `scope`: `"all"` | `"exclude"` | `"include_only"`
  - `clientPhones`: array de strings de telefone normalizadas.
- **Cenário de Teste A (`exclude`)**:
  FAQ sobre "Early Check-in Gratuito" configurado com `scope: "exclude"` e `clientPhones: ["5522998505276"]`.
  - Quando `5522998505276` perguntar sobre early check-in, a regra restrita é ignorada pela IA.
  - Quando outro telefone (ex: `5521999998888`) perguntar, a resposta normal é retornada.
- **Cenário de Teste B (`include_only`)**:
  FAQ de boas-vindas VIP configurado com `scope: "include_only"` e `clientPhones: ["5522998505276"]`.
  - Quando `5522998505276` perguntar, recebe a resposta personalizada VIP.
  - Quando outro telefone perguntar, a resposta VIP é ignorada e a Sofia usa a regra padrão ou genérica.
- **Cenário de Teste C (Normalização de Telefones)**:
  Validação de que `(22) 99850-5276`, `5522998505276`, `22998505276` e `+55 22 99850-5276` casam com o mesmo cliente através da função `cleanWhatsAppPhone`.

### 6.4 R5: Integração em Tempo Real com o Motor da Sofia (`whatsapp-ai-service.mjs`)
- **Cenário de Teste A (Contingência Heurística Dinâmica)**:
  Cadastrar um novo FAQ em `db.faqItems` com pergunta *"Vocês aceitam Pix no check-out?"*, palavras-chave `["pix", "pagar pix", "pagamento pix"]` e status `"ativo"`.
  Chamar `generateHeuristicResponse` com `text: "Consigo pagar com pix na saída?"`.
  Verificar que a resposta heurística retorna o conteúdo oficial cadastrado em `db.faqItems`.
- **Cenário de Teste B (Injeção Dinâmica no Prompt Gemini)**:
  Verificar a montagem do bloco `[BASE DE CONHECIMENTO OFICIAL CORPFLATS]` dentro de `generateAiWhatsAppResponse`:
  Os itens de FAQ com status `"ativo"` e com escopo compatível com o cliente devem ser serializados no prompt do Gemini, permitindo que a IA generativa utilize o conhecimento mais recente cadastrado no banco.
- **Cenário de Teste C (Dinamicidade sem Restart)**:
  Modificar um FAQ em `db.faqItems` e imediatamente disparar uma pergunta: a resposta refletirá o novo conteúdo sem necessidade de reiniciar o servidor.

---

## 7. Matriz de Casos de Teste Recomendados para Adição

Recomenda-se adicionar os seguintes testes em `tests/whatsapp-ai-agent.test.mjs` (ou em arquivo dedicado `tests/whatsapp-faq-engine.test.mjs` devidamente referenciado):

| # | Identificador do Teste | Alvo / Requisito | Asserções Principais |
|---|---|---|---|
| 11 | `11. FAQ Inicial e Estrutura de Coleção` | AC / Persistência | `db.faqItems` inicializado com perguntas obrigatórias (Wi-Fi, café no quarto, louças, frigobar, visitas, pets, check-in 14h, early check-in, check-out 12h). |
| 12 | `12. Endpoints CRUD do FAQ` | R1 / Endpoints | `GET`, `POST`, `PUT`, `DELETE` em `/api/whatsapp/faq` funcionam e persistem instantaneamente. |
| 13 | `13. R2: Detecção Automática de Pergunta Inédita` | R2 / Webhook Inbound | Pergunta inédita gera item com `status: "pendente"`, telefone e nome do cliente em `db.faqItems`. |
| 14 | `14. R2: Dúvida Existente Não Gera Duplicata Pendente` | R2 / Resiliência | Pergunta sobre Wi-Fi responde via base oficial e não insere item pendente. |
| 15 | `15. R3: Captura de Resposta do Operador via Webhook` | R3 / Auto-Aprendizado | Mensagem com `fromMe: true` vincula `suggestedAnswer` e muda status para `"aguardando_aprovacao"`. |
| 16 | `16. R3: Captura de Resposta via Live Chat` | R3 / Auto-Aprendizado | Envio via `/api/whatsapp/chat/send` vincula à pergunta pendente do contato. |
| 17 | `17. R3: Aprovação em 1 Clique Promove para Ativo` | R3 / Aprovação | `POST /api/whatsapp/faq/:id/approve` altera status para `"ativo"`, permitindo uso imediato pela Sofia. |
| 18 | `18. R4: Exceção de Cliente (scope: exclude)` | R4 / Segmentação | Cliente excluído tem resposta ignorada e Sofia transborda ou usa resposta alternativa. |
| 19 | `19. R4: Exceção Positiva (scope: include_only)` | R4 / Segmentação | Apenas cliente explicitamente listado recebe a resposta específica. |
| 20 | `20. R5: Busca Heurística com FAQs Dinâmicos` | R5 / Heurística Local | Pergunta com palavras-chave de FAQ dinâmico ativo é respondida com precisão mesmo sem chave Gemini. |
| 21 | `21. R5: Contexto Gemini Recebe FAQs Ativos` | R5 / Prompt Gemini | Prompt inclui os itens dinâmicos relevantes na Base de Conhecimento. |
| 22 | `22. Paridade Rigorosa dos Arquivos Espelho (SHA-256)` | Governança / AGENTS.md | `artifacts/api-server/whatsapp-ai-service.mjs` $\equiv$ `scripts/whatsapp-ai-service.mjs` (com a correção do desalinhamento atual). |

---

## 8. Verificação do Build Frontend (`artifacts/limpeza`)

Executamos o build do frontend para validar os requisitos de entrega contínua:
- **Comando**: `npm run build` dentro de `artifacts/limpeza`
- **Duração**: 47.09s
- **Código de Saída**: 0 (Sucesso)
- **Artefatos Gerados**:
  - `dist/public/index.html` (2.65 kB)
  - `dist/public/assets/index.css` (380.67 kB)
  - `dist/public/assets/index.js` (3,172.70 kB)
  - `dist/public/assets/pdf.worker.min-*.mjs` (1,417.59 kB)
- **Conformidade**: O processo de build está totalmente operacional e pronto para receber a nova aba de FAQ em `whatsapp-automation.tsx`.

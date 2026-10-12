# Relatório de Investigação Técnica: Motor de IA WhatsApp, Prompt Orchestration e Modo Desenvolvedor (Sofia)

**Data**: 2026-10-11T23:26:00Z  
**Autor**: Explorer 2 (`explorer_2`)  
**Contexto**: Milestone Modo Desenvolvedor & Treinamento Inteligente no WhatsApp (CorpFlats)  
**Arquivo de Origem**: `ORIGINAL_REQUEST.md` (Seção `## Follow-up — 2026-10-11T23:13:31Z`)  

---

## 1. Observation (Observações Diretas)

### 1.1 Arquitetura Atual do Motor de IA e Montagem do Prompt
- **Arquivo**: `scripts/whatsapp-ai-service.mjs` (linhas 44-86 e 1852-1897)
  - `DEFAULT_AI_CONFIG`: contém `enabled`, `mode`, `agentName: "Sofia"`, `agentRole: "Concierge Virtual CorpFlats"`, `responseDelaySeconds: 3`, `systemPrompt`, `knowledgeBase`, `handoverKeywords`.
  - Linha 58: `systemPrompt` padrão define a identidade:
    > *"Você é a Sofia, concierge virtual inteligente e acolhedora dos flats de alto padrão da CorpFlats no Edifício Soho Residence Service em Campos dos Goytacazes/RJ. Seu objetivo é encantar os hóspedes, responder dúvidas com precisão e fornecer assistência ágil e atenciosa..."*
  - Linhas 1852-1883: `contextString` concatena quatro blocos estruturados:
    1. `[CONTEXTO EM TEMPO REAL]` (data/hora de Brasília UTC-3, telefone, nome do hóspede, status da estadia, flat, check-in/out, status de limpeza da governança, room ready, link de pré-check-in).
    2. `[BASE DE CONHECIMENTO OFICIAL CORPFLATS]` (endereço, check-in, check-out, políticas, Wi-Fi `apto {{quarto}}`, senha, café no quarto via bandeja, garagem rotativa, pets, fumo, comodidades, lazer na cobertura).
    3. `dynamicFaqPromptSection`: perguntas e respostas de `db.faqItems` filtradas por `isFaqApplicableToClient(faq, phone)`.
    4. `systemActionsNotice`: aviso sobre ferramentas do sistema (Function Calling ativo ou pausado).
  - Linha 1892: a chamada ao Gemini combina o prompt do sistema e o contexto via:
    ```javascript
    systemInstruction: `${aiConfig.systemPrompt}\n\n${contextString}`
    ```
  - Linha 1641 (`callGeminiAi`): monta o turno com:
    ```javascript
    const fullPrompt = `${systemInstruction}\n\n[MENSAGEM ATUAL DO HÓSPEDE]:\n${prompt}\n\n[INSTRUÇÃO DE RESPOSTA]: Responda diretamente ao hóspede de forma concisa, educada e pronta para envio no WhatsApp.`;
    ```
  - Linha 1917: fallback para `generateHeuristicResponse(messageText, guestContext, aiConfig, applicableFaqs)`.

### 1.2 Lacuna de Calibração de Tom e Diretrizes de Desenvolvedor
- Não existem atualmente no banco ou código os campos `aiConfig.toneSettings` nem `db.whatsappAiSettings.developerGuidelines`.
- Nem `callGeminiAi` nem `generateHeuristicResponse` possuem injeção dinâmica de calibração estilística (concisão, emojis, formalidade) ou de fatos ensinados pelo desenvolvedor.

### 1.3 Paridade dos Arquivos Gêmeos (Twin Servers)
- Execução do comando de verificação:
  `powershell -Command "(Get-FileHash scripts/whatsapp-ai-service.mjs).Hash -eq (Get-FileHash artifacts/api-server/whatsapp-ai-service.mjs).Hash"`
  Retornou: **`False`**.
- Análise de `git diff`:
  - `scripts/whatsapp-ai-service.mjs` possui a versão atualizada (Edifício Soho Residence Service, Wi-Fi por quarto, café da manhã via bandeja no quarto das 05h às 09h30).
  - `artifacts/api-server/whatsapp-ai-service.mjs` possui versão antiga (Av. Pelinca, Wi-Fi único CorpFlats-Hospedes, café buffet das 06h30 às 10h).
  - Ambos os arquivos gêmeos de `zapi-service.mjs` e `demo-server.mjs` estão com paridade 100% íntegra (`True`).

### 1.4 Identificação do Desenvolvedor e Bloqueio de IA
- Em `scripts/zapi-service.mjs` (linha 1298): `22998505276` e `5522998505276` constam na lista `DEFAULT_TEST_ALLOWED_PHONES` identificados como "Miller Mendonça (gestor / desenvolvedor)".
- Em `scripts/whatsapp-ai-service.mjs` (linhas 2185-2189):
  ```javascript
  if (conv && conv.aiPaused === true) {
    console.log(`[WhatsApp AI] Conversa com ${cleanTarget} com IA pausada. Aguardando atendimento humano.`);
    return { skipped: true, reason: "conversation_ai_paused" };
  }
  ```
  Se `conv.aiPaused === true`, todas as mensagens são descartadas pela IA. Para o número do desenvolvedor, isso provoca silenciamento involuntário durante testes e feedbacks.

### 1.5 Fluxo do Webhook Z-API e Rotas de Chat
- Em `scripts/zapi-service.mjs` (linhas 6118-6131): o webhook invoca assincronamente `processAiInboundMessage`.
- Rotas existentes de IA em `scripts/zapi-service.mjs`:
  - `POST /api/whatsapp/ai-simulate` (linha 6810)
  - `POST /api/whatsapp/chat/:phone/ai-toggle` (linha 6841)
  - `POST /api/whatsapp/chat/:phone/ai-suggest` (linha 6873)
- Rota para retificação de mensagens (`/api/whatsapp/chat/:phone/correct-message`) ainda não existe.

---

## 2. Logic Chain (Cadeia Lógica de Raciocínio)

### Passo 1: Montagem Unificada do Prompt da Sofia
A partir das observações em 1.1 e 1.2, o prompt da Sofia precisa manter sua estrutura modular e hierárquica para permitir que calibrações de tom e novas diretrizes sobreponham regras padrão sem apagar a identidade fundamental da Sofia.
A função de montagem dinâmica deve produzir:
```
[PROMPT BASE DA SOFIA]
(Identidade fixa: Sofia, CorpFlats Soho Residence, regras de cordialidade e honestidade)

[DIRETRIZES DE ESTILO & CALIBRAÇÃO DE TOM EM VIGOR]
(Regras extraídas de aiConfig.toneSettings: nível de concisão, política de emojis, grau de formalidade)

[DIRETRIZES DO DESENVOLVEDOR & REGRAS APRENDIDAS (PRIORIDADE MÁXIMA)]
(Lista de db.whatsappAiSettings.developerGuidelines ativas: fatos, horários, correções de flats)

[CONTEXTO EM TEMPO REAL]
(Dados do hóspede e estadia em Brasília UTC-3)

[BASE DE CONHECIMENTO OFICIAL CORPFLATS]
(Políticas institucionais, Wi-Fi, garagem, café, lazer)

[FAQS ATIVAS DINÂMICAS]
[STATUS DE FERRAMENTAS / OPERAÇÕES]
```
Ao montar o prompt dessa forma:
- A injeção ocorre no momento da execução de cada mensagem em `generateAiWhatsAppResponse`.
- Qualquer alteração feita pelo desenvolvedor no WhatsApp ou pelo operador no painel entra em vigor em **milissegundos** para todos os hóspedes reais.
- O prompt base `aiConfig.systemPrompt` permanece intacto, sem risco de deleção acidental de diretrizes vitais de hotelaria.

### Passo 2: Classificação Tri-Modal de Mensagens do Desenvolvedor
A partir da observação 1.4, quando a mensagem provém de `22998505276` ou `5522998505276` (validado por `isDeveloperPhone`):
1. **Bypass Obrigatório**: se `isDeveloperPhone` for verdadeiro, o verificador de `conv.aiPaused === true` é ignorado. O chat com o desenvolvedor nunca pausa nem silencia.
2. **Motor de Classificação (`classifyDeveloperMessage`)**:
   - **Fluxo A — Simulação de Hóspede (`guest_simulation`)**:
     - *Critério*: O desenvolvedor está testando perguntas típicas de clientes.
     - *Exemplos*: *"Qual o horário de check-in?"*, *"O flat 408 está liberado?"*, *"Tem Wi-Fi no flat 605?"*, *"Como funciona o café da manhã?"*, *"Tem vaga para caminhonete?"*, *"Qual a taxa do pet?"*.
     - *Ação da Sofia*: Responde como Concierge Virtual acolhedora, utilizando o contexto real, a base de conhecimento e as ferramentas, aplicando o tom atualmente calibrado.
   - **Fluxo B — Calibração de Tom & Persona (`tone_calibration`)**:
     - *Critério*: Comandos não literais orientando estilo, concisão, emojis, formalidade ou ritmo.
     - *Exemplos*: *"responda de forma mais curta por favor"*, *"seja mais concisa"*, *"use menos emojis"*, *"sem emojis"*, *"adote um tom mais descontraído"*, *"seja mais executiva"*, *"ajuste seu tom para ser mais direta"*.
     - *Processamento*:
       1. Extração da regra estilística e dimensões afetadas (`conciseness: "compact"`, `emojiUsage: "minimal"|"none"`, `formality: "casual"|"formal"`).
       2. Atualização persistente de `db.whatsappAiSettings.toneSettings` e `aiConfig.toneSettings`.
       3. Atualização sutil da seção de estilo em `aiConfig.systemPrompt` no banco (`database.json`).
       4. Resposta cordial anti-papagaio confirmando o ajuste + resumo da regra + amostra ao vivo no novo tom.
   - **Fluxo C — Treinamento Factual / Aprendizado de Diretriz (`factual_coaching`)**:
     - *Critério*: O desenvolvedor informa correções factuais, novos horários, regras específicas de apartamento ou políticas comerciais.
     - *Exemplos*: *"Sofia, o horário do café mudou para 06:30"*, *"Sofia, para o flat 905 a informação correta é que tem micro-ondas e cafeteira Nespresso"*, *"Sofia, o early check-in para reservas diretas agora é a partir das 09h quando liberado"*, *"Não diga que temos restaurante presencial"*.
     - *Processamento*:
       1. Extração do fato/regra, identificação da categoria (`cafe`, `flat_905`, `checkin`, `pet`, `geral`) e eventual número de flat associado.
       2. Registro em `db.whatsappAiSettings.developerGuidelines` com `{ id, text, category, targetFlat, active: true, createdAt, source: "whatsapp_developer" }`.
       3. Resposta inteligente confirmando a assimilação da regra + explicação de como será aplicada aos hóspedes + amostra de resposta.

### Passo 3: Dinâmica Anti-Papagaio (Resposta Inteligente do Assistente)
Por que a Sofia não pode agir como um papagaio literal?
- Se Miller enviar *"responda de forma mais curta por favor"*, responder *"Olá! Claro, vou responder de forma mais curta"* seria uma falha de compreensão contextual.
- Para demonstrar inteligência genuína, a Sofia deve estruturar a confirmação em 4 blocos:
  1. **Reconhecimento do Desenvolvedor/Criador**: Tratar Miller cordialmente como criador do sistema (*"Entendido perfeitamente, Miller! ⚙️ Diretriz de estilo atualizada no sistema."*).
  2. **Resumo da Calibração Realizada**: Destacar de forma pontual o que mudou (*"• Nova calibração: Respostas mais concisas e objetivas, reduzindo extensões e preservando a agilidade para WhatsApp."*).
  3. **Amostra Imediata no Novo Tom**: Apresentar uma simulação prática de como ela responderá a uma dúvida padrão de hóspede usando o novo estilo (*"Veja uma amostra de resposta para dúvida de check-in no novo tom: 👉 'Olá! Nosso check-in inicia às 14h. Se o seu flat estiver liberado antes pela governança, avisamos você imediatamente! 🔑'"*).
  4. **Feedback de Ativação**: Confirmar que a regra já está valendo para todos os atendimentos e convidar a enviar mais testes.

### Passo 4: Retificação de Mensagens para Hóspedes Reais (Web e WhatsApp)
A partir da observação 1.5 e dos requisitos R3.1 e R3.2:
- **No Chat Web (`/whatsapp-chat`)**:
  - Em cada balão onde `msg.fromMe === true` (com tag Sofia ou régua), renderizar o botão discreto `✏️ Corrigir / Ensinar Sofia`.
  - Ao clicar, abre modal com:
    1. Texto original enviado.
    2. Campo para a nova informação correta / ensinamento.
    3. Checkbox "Enviar retificação ao hóspede no WhatsApp" (marcado por padrão) com prévia gerada automaticamente da mensagem gentil de retificação.
  - O endpoint `POST /api/whatsapp/chat/:phone/correct-message` processa em 1 clique:
    - Salva a regra em `developerGuidelines`.
    - Se marcado, dispara a retificação para o cliente via Z-API e grava no histórico do chat.
- **Pelo WhatsApp do Desenvolvedor**:
  - Quando Miller cita um quarto ou hóspede (ex: *"Sofia, para o flat 905 a informação correta é..."*), a Sofia detecta o hóspede associado ao flat 905, grava a diretriz e informa a Miller: *"Diretriz salva! Deseja que eu retifique com o hóspede Carlos do flat 905? Posso enviar: '...' ou já enviei se confirmado."*

### Passo 5: Painel Administrativo de Diretrizes (`/whatsapp-automation`)
A partir da observação 1.2 e requisito R4.2:
- Criar na aba de IA em `/whatsapp-automation` o card dedicado:
  **"🧠 Diretrizes & Calibrações Aprendidas (Modo Treinador)"**.
- Exibe:
  - Status do tom ativo (Concisão, Emojis, Estilo).
  - Tabela/lista de diretrizes com status Ativo/Inativo, Categoria, Origem, Data e botão de Excluir.
  - Botão de adicionar diretriz manual.
  - Simulador com campo de teste.

---

## 3. Caveats (Ressalvas e Limitações)

1. **Paridade SHA-256 Pré-Existente Rompida**:
   - `artifacts/api-server/whatsapp-ai-service.mjs` divergiu de `scripts/whatsapp-ai-service.mjs` em commits anteriores (mantendo dados desatualizados de Pelinca e café buffet). O implementador precisará sincronizar os dois arquivos integralmente para atingir 100% de paridade de hash SHA-256.
2. **Ambiente Sem Conexão / Testes Mockados**:
   - Em ambiente de testes de integração sem chave do Gemini ativa (`GEMINI_API_KEY`), o sistema recorre a `generateHeuristicResponse`. A contingência heurística precisa ser adaptada para obedecer às diretrizes de tom e regras do desenvolvedor de modo determinístico.
3. **Escopo Estrito de Testes**:
   - Conforme as regras mandatadas em `AGENTS.md`, NUNCA rodar testes globais (`tests/*.test.mjs`). Apenas o arquivo pontual dedicado `tests/developer-ai-coaching.test.mjs` deve ser executado.

---

## 4. Conclusion (Conclusão e Diretrizes de Implementação)

A implementação do **Modo Desenvolvedor & Treinamento Inteligente** deve ser executada pelo Agente Implementador seguindo esta estrutura técnica:

### 4.1 Estrutura de Dados no Banco (`database.json`)
```json
{
  "whatsappAiSettings": {
    "developerPhone": "22998505276",
    "toneSettings": {
      "conciseness": "compact",
      "emojiUsage": "minimal",
      "formality": "casual_professional",
      "customRules": [
        "Responda de forma curta e objetiva (ideal 1 a 3 frases)."
      ],
      "updatedAt": "2026-10-11T23:20:00.000Z"
    },
    "developerGuidelines": [
      {
        "id": "guideline_1728691200000",
        "text": "O horário do café da manhã mudou para 06:30 às 09:30.",
        "category": "cafe",
        "targetFlat": null,
        "createdAt": "2026-10-11T23:20:00.000Z",
        "active": true,
        "source": "whatsapp_developer"
      }
    ]
  }
}
```

### 4.2 Métodos a Adicionar em `scripts/whatsapp-ai-service.mjs` e `artifacts/api-server/`
1. `isDeveloperPhone(phone, db)`: reconhece `22998505276`, `5522998505276` ou o telefone configurado.
2. `classifyDeveloperMessage(messageText, db)`: retorna `{ type: "guest_simulation" | "tone_calibration" | "factual_coaching", ... }`.
3. `applyToneCalibration(db, updates)`: extrai parâmetros estilísticos, atualiza `toneSettings` e a seção de estilo em `systemPrompt`.
4. `saveDeveloperGuideline(db, guideline)`: persiste a regra em `developerGuidelines`.
5. `buildDynamicSystemInstruction(aiConfig, db, guestContext)`: monta o prompt combinando prompt base, calibração de tom, diretrizes do desenvolvedor e contexto dinâmico.
6. `formatDeveloperToneConfirmation({ toneUpdates, db })`: gera a confirmação cordial com amostra no novo tom.
7. `formatDeveloperCoachingConfirmation({ newGuideline, db })`: gera a confirmação de aprendizado de regra com amostra de resposta ao hóspede.

### 4.3 Endpoints REST a Adicionar em `scripts/zapi-service.mjs` e `artifacts/api-server/`
1. `POST /api/whatsapp/chat/:phone/correct-message`:
   - Recebe `{ messageId, originalText, correction, sendToGuest, rectificationMessage }`.
   - Cria a diretriz em `developerGuidelines`.
   - Se `sendToGuest === true`, despacha a retificação via Z-API para o hóspede e registra no chat.
2. `GET /api/whatsapp/ai/developer-guidelines`: lista diretrizes ativas/inativas.
3. `POST /api/whatsapp/ai/developer-guidelines`: criação manual via painel.
4. `PUT /api/whatsapp/ai/developer-guidelines/:id`: ativa/desativa ou edita texto.
5. `DELETE /api/whatsapp/ai/developer-guidelines/:id`: remove diretriz.
6. `GET /api/whatsapp/ai/tone-settings`: consulta calibração de tom.
7. `POST /api/whatsapp/ai/tone-settings`: atualiza calibração de tom via interface.

### 4.4 Ajustes Frontend
1. Em `artifacts/limpeza/src/pages/whatsapp-chat.tsx`:
   - Adicionar botão `✏️ Corrigir / Ensinar Sofia` nos balões de mensagem de saída.
   - Popover/Modal com campo de retificação e botão de 1 clique "Ensinar & Retificar".
2. Em `artifacts/limpeza/src/pages/whatsapp-automation.tsx`:
   - Inserir Card "🧠 Diretrizes & Calibrações Aprendidas" com gerenciamento de regras e visualização do tom ativo.
3. Build obrigatório: `npm --prefix artifacts/limpeza run build` e inclusão de `dist/` no commit.

---

## 5. Verification Method (Método de Verificação Independente)

1. **Teste Automatizado Dedicado**:
   Executar exclusivamente o teste pontual da funcionalidade:
   ```powershell
   node --test tests/developer-ai-coaching.test.mjs
   ```
   Cobrindo:
   - Tri-modalidade de mensagens de `22998505276` (simulação de check-in vs "responda de forma mais curta" vs "café mudou para 06:30").
   - Imunidade a `aiPaused` para o número do desenvolvedor.
   - Injeção dinâmica imediata de `developerGuidelines` e `toneSettings` para chamadas subsequentes de outros hóspedes.
   - Chamada a `POST /api/whatsapp/chat/:phone/correct-message` com envio de mensagem retificadora e persistência da diretriz.
2. **Verificação de Paridade SHA-256 Twin-Server**:
   ```powershell
   powershell -Command "(Get-FileHash scripts/whatsapp-ai-service.mjs).Hash -eq (Get-FileHash artifacts/api-server/whatsapp-ai-service.mjs).Hash; (Get-FileHash scripts/zapi-service.mjs).Hash -eq (Get-FileHash artifacts/api-server/zapi-service.mjs).Hash"
   ```
   Ambos devem retornar `True`.
3. **Verificação de Compilação do Frontend**:
   ```powershell
   npm --prefix artifacts/limpeza run build
   ```
   Deve concluir com 0 erros.
4. **Condições de Invalidação**:
   - Se mensagens de tom resultarem em repetições literais de papagaio.
   - Se o chat do desenvolvedor for pausado por detecção de "humano".
   - Se uma calibração de tom apagar regras do prompt base (Soho Residence, proibições de inventar códigos).
   - Se diretrizes salvas não forem refletidas no atendimento de hóspedes subsequentes.

# Original User Request

## Initial Request — 2026-10-11T20:59:22Z

This is a single self-contained fix; keep it small and focused.

Investigar e resolver o aumento no consumo de memória RAM (que saltou de ~200MB para mais de 400MB) e os travamentos críticos do Event Loop (com picos de 302ms e até 1.263ms) no servidor Node.js (CorpFlats no Render) após os deploys recentes, restabelecendo o uso médio de memória para o patamar seguro de ~200MB e garantindo fluidez total na execução.

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

## Requirements

### R1. Diagnóstico e Redução do Consumo de Memória RAM
Identificar as fontes de retenção e alocação desnecessária de memória no processo Node.js — analisando tanto o serviço de telemetria/monitoramento (tamanho dos buffers circulares de histórico/diagnósticos, chamadas frequentes a `process.memoryUsage()` em middlewares, e parsing de payloads OTel) quanto as rotas do backend (como alocações repetidas de Maps e arrays) —, ajustando-as para que o consumo em repouso retorne ao patamar nominal de ~200MB a 250MB.

### R2. Eliminação de Bloqueios Síncronos do Event Loop
Localizar e isolar as operações síncronas pesadas que provocaram travamentos críticos no loop de eventos durante a inicialização/requisições (como serializações `JSON.stringify` de grandes volumes de dados, operações síncronas de arquivo ou varreduras sequenciais de listas volumosas), convertendo-as em execuções assíncronas não bloqueantes ou fatiadas (`setImmediate`/streaming).

### R3. Preservação de Funcionalidades e Blindagem do Monitor
Assegurar que as funcionalidades do painel de monitoramento em tempo real, os alertas de RCA, as métricas e a integração com o Render continuem operando normalmente, porém com custo computacional e de memória desprezível (overhead inferior a 5MB).

### R4. Paridade Rigorosa dos Servidores Twin
Garantir que todas as alterações feitas no backend sejam replicadas com paridade estrita de 100% (hash SHA-256 idêntico) entre os pares de arquivos correspondentes:
- `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`
- `scripts/server-monitor-service.mjs` e `artifacts/api-server/server-monitor-service.mjs`
- `scripts/zapi-service.mjs` e `artifacts/api-server/zapi-service.mjs`

## Acceptance Criteria

### Consumo de Memória & Telemetria
- [ ] O consumo de memória RAM do processo Node.js em regime estável (RSS e Heap) é reduzido de forma mensurável, retornando à faixa de ~200MB a 250MB.
- [ ] O serviço de monitoramento mantém retenção enxuta de memória, sem acúmulo contínuo ou vazamento nos buffers de histórico.

### Latência do Event Loop
- [ ] O atraso do Event Loop (`loopLag.max` e percentil `p99`) permanece abaixo de 100ms em condições nominais, sem registrar novos eventos críticos de travamento (>300ms).

### Integridade e Testes
- [ ] Os testes unitários pontuais associados (`tests/server-monitor-rca.test.mjs` e `tests/whatsapp-status-cache.test.mjs`) passam com 100% de sucesso.
- [ ] A paridade de hash SHA-256 entre `scripts/` e `artifacts/api-server/` é confirmada como idêntica para todos os arquivos modificados.
- [ ] O build de frontend (`npm --prefix artifacts/limpeza run build`) conclui sem erros caso algum arquivo de interface seja ajustado.

## Verification Resources
- Teste pontual do monitor e RCA: `node --test tests/server-monitor-rca.test.mjs`
- Teste pontual de cache e Z-API: `node --test tests/whatsapp-status-cache.test.mjs`
- Verificação de paridade de hash SHA-256 via PowerShell:
  `powershell -Command "(Get-FileHash scripts/demo-server.mjs).Hash -eq (Get-FileHash artifacts/api-server/demo-server.mjs).Hash; (Get-FileHash scripts/server-monitor-service.mjs).Hash -eq (Get-FileHash artifacts/api-server/server-monitor-service.mjs).Hash"`


## Follow-up — 2026-10-11T23:13:31Z

Desenvolver e integrar o Modo Desenvolvedor & Treinamento Inteligente no WhatsApp para o CorpFlats. O número do desenvolvedor (22998505276 / 5522998505276) deve possuir atuação dupla e fluida: simular conversas normais de hóspede (para testes dinâmicos de atendimento, disponibilidade e FAQ) e atuar como treinador/criador do sistema, enviando correções, comandos de calibração de tom/estilo (ex: "responda de forma mais curta por favor") que a IA Sofia interpreta de forma contextual e não-literal (extraindo a regra subjacente e atualizando a calibração de tom/prompt no painel), além de um fluxo simples para retificar e corrigir mensagens enviadas para hóspedes reais tanto via WhatsApp quanto pelo painel Web do Chat.

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

---

## Requirements

### R1. Reconhecimento de Identidade do Desenvolvedor & Modo Híbrido Dinâmico
1. **Identificação Segura & Bypass de Pausa**:
   - Reconhecer de forma persistente o número do desenvolvedor (`22998505276` / `5522998505276`) com flag de desenvolvedor/admin.
   - O chat com o desenvolvedor NUNCA deve sofrer silenciamento involuntário por `aiPaused: true`, garantindo continuidade ininterrupta nos testes.
2. **Alternância Natural de Intenção**:
   - **Fluxo Hóspede**: Quando Miller enviar perguntas sobre serviços, estadias ou comodidades (*"Qual horário de check-in?", "Flat 408 está livre?", "Tem Wi-Fi no flat 605?"*), a Sofia responde no tom acolhedor e profissional de Concierge Virtual, simulando a experiência final do hóspede.
   - **Fluxo Treinador/Feedback**: Quando Miller enviar orientações, correções ou ajustes conceituais (*"Sofia, melhore essa resposta...", "O horário mudou...", "Não responda dessa forma, seja mais objetiva..."*), a Sofia reconhece Miller como criador do sistema e ativa o módulo de aprendizagem.

### R2. Comandos de Calibração de Tom & Persona via WhatsApp
1. **Interpretação e Atualização de Tom**:
   - Quando o desenvolvedor enviar comandos como *"responda de forma mais curta por favor"*, *"use menos emojis"*, *"adote um tom mais descontraído"* ou *"seja mais executiva"*:
   - O motor de IA interpreta o ajuste estilístico e atualiza diretamente a calibração de tom em `aiConfig.systemPrompt` e `aiConfig.toneSettings` no banco (`database.json`), sem sobrescrever a identidade básica nem apagar regras essenciais.
2. **Confirmação com Amostra**:
   - A Sofia responde a Miller no WhatsApp:
     a) Confirmando cordialmente que a calibração de tom foi salva nas configurações do sistema;
     b) Resumindo a nova diretriz de estilo adotada;
     c) Apresentando uma amostra imediata de resposta no novo tom calibrado.

### R3. Correção Simples de Mensagens Enviadas para Hóspedes Reais
1. **Correção via Painel Web (`/whatsapp-chat`)**:
   - Em cada balão de mensagem enviada pela Sofia no chat do hóspede, incluir o botão **"✏️ Corrigir / Ensinar Sofia"**.
   - Ao clicar, abre um popover/modal simples onde o operador informa o que estava incorreto ou como deve ser a resposta.
   - Duas ações integradas em 1 clique:
     - **Ensinar a IA**: Salva a nova regra/diretriz na base da Sofia;
     - **Retificar com o Hóspede**: Envia uma mensagem cordial de retificação automaticamente no WhatsApp do hóspede (com prévia editável).
2. **Correção via WhatsApp pelo Desenvolvedor**:
   - Miller pode enviar mensagens citando o hóspede ou quarto (ex: *"Sofia, para o flat 905 a informação correta é..."* ou respondendo a uma mensagem).
   - A Sofia processa a correção, atualiza a base e oferece/dispara a retificação para o cliente com confirmação.

### R4. Persistência em Tempo Real & Gestão Administrativa
1. **Armazenamento e Reflexo Global**:
   - Salvar as diretrizes aprendidas e calibrações de tom em `db.whatsappAiSettings.developerGuidelines` e `aiConfig.systemPrompt`.
   - Injetar dinamicamente as diretrizes ativas no prompt do sistema de todas as instâncias e conversas com hóspedes reais.
2. **Interface Administrativa (Frontend)**:
   - Na aba do Agente de IA em `/whatsapp-automation`, exibir um card com as diretrizes e calibrações de tom aprendidas via WhatsApp, permitindo visualização, edição, teste e exclusão.

---

## Acceptance Criteria

### Experiência do Desenvolvedor & Hóspede
- [ ] Mensagens de teste de hóspede vindas de `22998505276` recebem respostas normais de concierge da Sofia.
- [ ] A conversa com o desenvolvedor nunca é silenciada ou travada por `aiPaused` involuntário.

### Calibração de Tom & Não-Literalidade
- [ ] Ao receber comandos de tom (ex: *"responda de forma mais curta por favor"*), a Sofia extrai o ajuste estilístico e atualiza a calibração de tom nas configurações (`aiConfig.systemPrompt` / `database.json`).
- [ ] A resposta ao desenvolvedor apresenta: confirmação cordial + resumo da calibração + amostra prática no novo tom.

### Correção de Mensagens para Hóspedes Reais
- [ ] No painel Web do Chat, mensagens da Sofia possuem botão de ação rápido para corrigir a resposta, salvando o aprendizado e permitindo retificar com o hóspede em 1 clique.
- [ ] Correções enviadas pelo desenvolvedor via WhatsApp identificam o contexto do hóspede/quarto e assimilam a informação correta.

### Infraestrutura, Paridade & Regras do Projeto
- [ ] **Twin-Server Parity Mandate**: 100% de paridade SHA-256 entre `artifacts/api-server/` e `scripts/`.
- [ ] **Regra AGENTS.md**: Build de produção executado com sucesso (`npm run build` em `artifacts/limpeza`) e arquivos em `dist/` incluídos.
- [ ] **Git Push**: Todo commit deve ser enviado imediatamente para `origin main`.
- [ ] **Testes Pontuais**: Teste automatizado pontual dedicado (`tests/developer-ai-coaching.test.mjs`) cobrindo calibração de tom, síntese de feedback e fluxo de retificação, com 100% de aprovação.

---

## Verification Plan

### Testes Automatizados Programáticos
1. `tests/developer-ai-coaching.test.mjs`:
   - Classificação de pergunta de hóspede vs comando de calibração de tom vs correção factual.
   - Envio de *"responda de forma mais curta por favor"* -> verifica atualização de `aiConfig.systemPrompt` com a nova restrição de concisão.
   - Envio de feedback factual -> verifica persistência de `developerGuidelines` sem repetição mecânica.
   - Teste do endpoint de retificação `/api/whatsapp/chat/:phone/correct-message` -> verifica disparo de mensagem retificadora ao cliente e absorção no conhecimento da IA.
   - Verificação de imunidade a `aiPaused` no chat do desenvolvedor.

### Verificação de Build & Paridade
- Script de conferência de hash SHA-256 dos arquivos gêmeos.
- `npm run build` na pasta `artifacts/limpeza` com 0 erros de compilação.


## Follow-up — 2026-10-11T23:35:41Z

# Teamwork Project Prompt

> Status: Launched
> Goal: Execução via equipe de agentes Teamwork
> Requested team: Equipe multidisciplinar completa (especialistas em UI/React, Arquiteto IoT para guia de hardware e UX de Hospitalidade)

Desenvolvimento do Smart Flat Hub no sistema Guest-Flow-Manager: uma interface web mobile-first de controle domótico com regras operacionais de chegada (coleta de previsão de chegada, programação restrita a até 30min antes do ETA, desligamento automático fail-safe se o hóspede não confirmar entrada até 30min após o ETA, com alerta prévio de segurança, e música ambiente de boas-vindas automática no dia do check-in a partir do horário oficial). Acompanha guia de arquitetura de hardware IoT e especificações para aquisição.

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

## Requirements

### R1. Interface Web do Hóspede (Smart Flat Hub UI) em Modo Sandbox / Preview Oculto
- **Restrição Crítica de Privacidade:** NADA deste recurso deve estar visível ou acessível para clientes/hóspedes reais no portal em produção no momento, pois trata-se de um projeto para o futuro cujos equipamentos ainda serão adquiridos.
- A tela e os componentes do Smart Flat Hub devem ser desenvolvidos em rota isolada de laboratório/preview (ex: `/preview/smart-flat`, `/admin/smart-flat-preview` ou acessível apenas via parâmetro especial `?preview=smart_flat`), sem adicionar botões ou cards visíveis aos hóspedes reais nas páginas públicas vigentes.
- Interface responsiva mobile-first (PWA), com visual polido no design system do Guest-Flow-Manager (Tailwind CSS, Radix UI, Lucide icons).
- Coleta/validação do horário previsto de chegada (ETA) antes de liberar os agendamentos.

### R2. Programação Inteligente com Janela de Antecedência (Até 30min antes do ETA)
- O hóspede só pode programar a cafeteira ou ligar o ar-condicionado com antecedência máxima de 30 minutos em relação ao horário de chegada informado (ex.: se chega às 14:00, o sistema só permite programar a partir de 13:30, bloqueando ativações anteriores para evitar desperdício e risco térmico).
- Seletor de temperatura do ar-condicionado (18°C a 26°C), modos e botão de acionamento do café com avisos visuais.

### R3. Ciclo Fail-Safe de Presença & Desligamento por Segurança
- Se o hóspede programou o equipamento para ligar, mas **não confirmou a entrada no flat** (seja pelo botão de confirmação ou pela recepção/portaria):
  - **Aviso Preventivo:** Antes do desligamento, o sistema exibe notificação/aviso: *"Você já chegou? Não esqueça de informar sua entrada aqui."*
  - **Desligamento Automático:** Caso passem 30 minutos após o horário previsto de chegada (ex: 14:30 para chegada prevista às 14:00) sem confirmação de entrada, o sistema desliga automaticamente a cafeteira e o ar-condicionado.
  - **Feedback Transparente:** Exibe status claro e envia aviso: *"Equipamento desligado automaticamente por questão de segurança e economia de energia."*

### R4. Trilha Sonora de Boas-Vindas (Welcome Playlist) Automática
- Em flats com check-in agendado para o dia, simular/configurar a reprodução automática de música ambiente de boas-vindas a partir do horário oficial de check-in (ex: 14:00), independente de o hóspede ter programado ou não qualquer aparelho.
- Controle no painel para pausar, retomar ou trocar de música.

### R5. Guia de Hardware IoT & Recomendações de Compra
- Especificação técnica completa e lista de compras de dispositivos custo-benefício (Tomadas inteligentes Tuya/Wi-Fi 16A com proteção térmica para cafeteiras, Smart IR Blasters infravermelho para ar-condicionado split, caixas de som inteligentes Echo Pop/Dot Alexa e interruptores touch de parede).

## Acceptance Criteria

### Isolamento & Invisibilidade para Clientes Reais
- [ ] Nenhum elemento novo, botão ou menção ao Smart Flat é exibido para hóspedes reais no fluxo normal de produção do portal (`guest-portal.tsx`).
- [ ] A interface Smart Flat Hub é completamente funcional e testável via rota/modo de preview interno.

### Fluxo de Chegada, Agendamento e Travas Temporais
- [ ] O sistema impede programar cafeteira/ar com mais de 30 minutos de antecedência do horário informado de chegada.
- [ ] O aviso *"Você já chegou?"* é disparado quando o horário previsto se aproxima/ultrapassa sem confirmação de check-in.
- [ ] O desligamento automático de segurança desativa os aparelhos após 30 minutos do horário previsto caso a entrada não tenha sido confirmada.
- [ ] O status de desligamento por segurança é registrado e exibido na UI.

### Música Ambiente de Boas-Vindas
- [ ] O status da música de boas-vindas indica ativação automática a partir do horário oficial de check-in nos flats com entrada no dia.
- [ ] Controle visual de reprodução (Play / Pause / Volume) direto no hub de preview.

### Qualidade de Código & Build
- [ ] O build do frontend (`npm run build` na pasta `artifacts/limpeza`) executa e é concluído com sucesso (código 0, sem erros TypeScript).
- [ ] NUNCA rodar testes em lote ou globais. Executar estritamente testes pontuais novos se criados, de acordo com o `AGENTS.md`.

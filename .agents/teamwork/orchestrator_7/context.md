# Contexto de Despacho — Modo Desenvolvedor & Treinamento Inteligente no WhatsApp

## Referência Autoritativa
- Arquivo de Requisitos: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (Seção `## Follow-up — 2026-10-11T23:13:31Z`)
- Diretório de Trabalho do Orquestrador: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_7`
- Raiz do Projeto: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

## Missão Principal
Desenvolver e integrar o Modo Desenvolvedor & Treinamento Inteligente no WhatsApp para o CorpFlats. O número do desenvolvedor (`22998505276` / `5522998505276`) deve possuir atuação dupla e fluida: simular conversas normais de hóspede (para testes dinâmicos de atendimento, disponibilidade e FAQ) e atuar como treinador/criador do sistema, enviando correções, comandos de calibração de tom/estilo (ex: "responda de forma mais curta por favor") que a IA Sofia interpreta de forma contextual e não-literal (extraindo a regra subjacente e atualizando a calibração de tom/prompt no painel), além de um fluxo simples para retificar e corrigir mensagens enviadas para hóspedes reais tanto via WhatsApp quanto pelo painel Web do Chat.

## Requisitos Detalhados

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

## Restrições Críticas (Regras do Projeto e AGENTS.md)
1. **NUNCA executar testes globais, varreduras ou em lote**: É terminantemente PROIBIDO rodar `tests/*.test.mjs`, scripts que varrem a pasta `tests/`, ou suítes completas do projeto.
2. **Apenas teste estritamente pontual**: Executar EXCLUSIVAMENTE `node --test tests/developer-ai-coaching.test.mjs`.
3. **Twin-Server Parity Mandate**: Garantir 100% de paridade SHA-256 entre arquivos correspondentes em `scripts/` e `artifacts/api-server/`.
4. **Build de Produção**: Ao alterar arquivos em `artifacts/limpeza/src`, executar o build (`npm run build` em `artifacts/limpeza`) e incluir os arquivos gerados em `artifacts/limpeza/dist/` no commit.
5. **Git Push Imediato**: Fazer `git push origin main` a cada commit realizado.

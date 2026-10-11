# Original User Request

## 2026-10-11T01:21:07Z

Sistema dinâmico de Gestão de FAQ & Base de Conhecimento para o Agente de IA do WhatsApp (Sofia / CorpFlats), com auto-aprendizado em fluxo contínuo (detecção automática de novas perguntas recebidas sem resposta, captura automática da resposta do operador humano como sugestão para aprovação em 1 clique) e motor de regras de exceção e segmentação por cliente.

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

## Requirements

### R1. Interface de Gestão da Base de Conhecimento (Aba dedicada em WhatsApp Automation)
Criar uma aba dedicada ("Base de Conhecimento & FAQ") na página `/whatsapp-automation` com:
- Tabela e cards organizados por categorias (Reservas, Check-in/Acesso, Wi-Fi/Tecnologia, Café da Manhã, Garagem, Estrutura do Flat, Regras/Visitas/Pets, Lazer/Condomínio, Check-out).
- Filtros rápidos por status: "Todas", "Ativas / Respondidas", "Perguntas Pendentes", "Sugestões de IA para Aprovar".
- Modal / Formulário completo para Criar e Editar:
  - Pergunta principal e variações/palavras-chave (sinônimos de busca).
  - Resposta oficial formatada (com suporte a formatação WhatsApp: negrito, itálico, emojis).
  - Categoria e status (ativa/inativa).
  - Configuração de Exceções de Clientes (Regra Padrão, Exceção Negativa "Não vale para...", Exceção Positiva "Só vale para...").
- Ações rápidas na listagem: Aprovar sugestão em 1 clique, Editar, Pausar/Ativar ou Excluir.

### R2. Detecção Automática de Perguntas Não Mapeadas no Webhook Inbound
- Ao processar uma mensagem inbound no webhook da Z-API (`processAiInboundMessage`):
  - Se a mensagem do cliente for uma dúvida/pergunta que a IA não reconheça com alta confiança no FAQ existente e que necessite de transbordo ou resposta humana:
  - O sistema deve criar automaticamente um registro no FAQ com status `"pendente"`, registrando o texto da pergunta do cliente, data/hora, telefone e nome do contato.

### R3. Captura Automática da Resposta Humana (Sugestão para Aprovação)
- Quando o operador humano (Miller ou recepção) enviar uma mensagem subsequente no chat (`fromMe: true`) pelo WhatsApp móvel ou pelo Live Chat do sistema:
  - Se houver uma pergunta pendente aberta para aquele cliente na mesma janela de atendimento, o sistema vincula o texto enviado pelo operador como `suggestedAnswer` (resposta sugerida) e altera o status para `"aguardando_aprovacao"`.
  - Essa resposta **não** entra em produção autônoma imediatamente: ela fica visível no painel com destaque para que o Miller possa revisar, ajustar se necessário e aprovar com 1 clique para entrar no rol de respostas ativas oficiais.
  - O Miller também pode responder a qualquer pergunta pendente diretamente pelo painel do sistema.

### R4. Motor de Regras de Exceção e Segmentação por Cliente
Cada pergunta/resposta no FAQ deve suportar:
- `scope`: `"all"` (todos os clientes), `"exclude"` (exceto clientes especificados) ou `"include_only"` (apenas clientes especificados).
- `clientPhones`: Lista de números de telefone (com ou sem DDI/DDD normalizados).
- Ao avaliar a resposta pelo Agente de IA (`whatsapp-ai-service.mjs`):
  - Se o cliente estiver na lista de exclusão (`exclude`), a resposta é ignorada e a IA busca uma resposta alternativa ou transborda.
  - Se a regra for restrita (`include_only`), a resposta só é utilizada se o telefone do cliente corresponder aos critérios.

### R5. Integração em Tempo Real com o Motor da Sofia (`whatsapp-ai-service.mjs`)
- O serviço de IA deve carregar dinamicamente a lista de FAQs ativos do banco (`db.faqItems` / `db.knowledgeBaseFaq`).
- O prompt do Google Gemini deve receber os itens de FAQ ativos relevantes ao contexto do hóspede.
- A contingência heurística local também deve pesquisar nas palavras-chave e variações dos itens de FAQ cadastrados no banco antes de cair na resposta genérica de transbordo.

## Acceptance Criteria

### Integridade do Banco e Persistência
- [ ] A coleção de FAQs (`db.faqItems`) é inicializada e persistida com segurança no `data/database.json`.
- [ ] O banco já vem populado inicialmente com todas as perguntas e respostas oficiais já mapeadas (Wi-Fi, café da manhã no quarto, recolhimento de louças, água no frigobar, regras de visitas, regras de pets, check-in 14h, early check-in para reservas diretas e check-out 12h) e com as perguntas pendentes identificadas.
- [ ] Operações de CRUD (criar, editar, responder, aprovar e excluir) funcionam e persistem instantaneamente.

### Auto-Aprendizado e Captura de Respostas
- [ ] Simulação de mensagem com dúvida inédita do cliente gera uma entrada com status `"pendente"` no FAQ.
- [ ] Mensagem de resposta enviada pelo operador vincula o texto à pergunta como `"aguardando_aprovacao"`.
- [ ] Aprovação manual no painel promove o status para `"ativo"`, permitindo que a Sofia use a resposta em novos atendimentos.

### Regras de Exceção
- [ ] Cliente configurado em `exclude` não recebe a resposta restrita quando perguntar sobre o tema.
- [ ] Cliente configurado em `include_only` recebe a resposta personalizada com sucesso.

### Qualidade de Código, Testes e Build
- [ ] Todos os testes em `tests/whatsapp-ai-agent.test.mjs` executam e passam com sucesso (incluindo testes unitários para a busca no FAQ dinâmico e regras de exceção).
- [ ] O build do frontend em `artifacts/limpeza` (`npm run build`) compila sem nenhum erro e gera os arquivos em `artifacts/limpeza/dist/`.
- [ ] Seguir rigorosamente as regras do projeto: executar `git push` ao final das alterações.


## 2026-10-11T00:44:00Z

Desenvolver e integrar a API de Ações do Sistema para CorpFlats (Guest-Flow-Manager) com suporte a Function Calling no WhatsApp Bot e consumo externo.

1. R1: Chave Mestra Global (`apiActionsEnabled`) no admin para ligar/desligar todo o acesso do bot à API (revertendo instantaneamente para modo respondedor de mensagens puro), endpoints REST padronizados (`/api/bot-actions/*`: /availability, /quote, /payment-link, /pre-reserve, /commit-reservation) retornando 403 ACTION_DISABLED com flag de transbordo caso desligado, e matriz de chaves granulares (`checkAvailability`, `calculateQuote`, `generatePayment`, `createPreReservation`, `commitReservation`).
2. R2: Motor de Tarifas Inteligente & Gestor Multi-Canal (Tariff Engine em `db.tariffSettings` / `db.tariffOverrides`) com cálculo automático baseado nos parâmetros SEBRAE de `getFinancialSettings()`, markup/comissão por canal (Direto, Booking, Airbnb, etc.), edição granular individual (flat x dia) e em lote/massa com filtros, sincronização de adicionais com `siteConfig`.
3. R3: Fluxo Autônomo de Reservas & Cobrança no PMS (consulta de conflitos, quote discriminado, pré-reserva com bloqueio provisório e expiração, PIX Copia-e-Cola e QR Code, efetivação para confirmada no PMS).
4. R4: IA com Function Calling Adaptativo & Fallback Gracioso no WhatsApp (`whatsapp-ai-service.mjs`), instanciando Gemini com `tools: []` quando a chave mestra estiver desligada ou apenas com as ferramentas autorizadas quando ligada, com transbordo humano cordial.
5. R5: Interface Administrativa no Frontend (Switches na aba IA em `whatsapp-automation.tsx` e Calendário/Editor de Tarifas Multi-Canal em `tarifas.tsx`).
6. Regras Obrigatórias de Infraestrutura:
   - Twin-Server Parity Mandate: Paridade exata byte-a-byte entre `artifacts/api-server/` e `scripts/` (`demo-server.mjs`, `zapi-service.mjs`, `whatsapp-ai-service.mjs`, etc.).
   - Regra AGENTS.md: `npm run build` na pasta `artifacts/limpeza` com inclusão de `artifacts/limpeza/dist/` em qualquer commit relevante.
   - Git push imediato para `origin main` em todo commit.
   - Bateria de testes automatizados com 100% de aprovação (`tests/tariff-engine.test.mjs`, `tests/bot-actions-api.test.mjs`, etc.).

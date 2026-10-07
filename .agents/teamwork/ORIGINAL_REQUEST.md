# Original User Request

## 2026-09-30T21:42:59Z

Implementar um módulo completo de gestão de prestadores de serviço externo (pintores, eletricistas, etc.) para o sistema hoteleiro CorpFlats, com portal público via link único para o prestador, painel admin de criação e acompanhamento, integração com o dashboard de camareiras, notificações via email + tela + WhatsApp, e bloqueio no calendário PMS.

Working directory: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

Integrity mode: development

---

## Contexto do Projeto

O sistema é um hotel manager chamado **Guest-Flow-Manager / CorpFlats**. A stack é:

- **Backend:** Node.js/Express em `artifacts/api-server/demo-server.mjs` — servidor monolítico com ~24k linhas. Há um **mirror obrigatório** em `scripts/demo-server.mjs` que deve permanecer **byte-a-byte idêntico** ao arquivo principal após cada modificação.
- **Frontend:** React 18 + TypeScript + Tailwind CSS + Vite em `artifacts/limpeza/src/`. Usa Wouter para roteamento, Tanstack Query, shadcn/ui, lucide-react.
- **Banco de dados:** JSON em `data/database.json` (sem ORM, leitura/escrita direta em memória com persist).
- **Notificações existentes:** serviço Z-API (WhatsApp) em `artifacts/api-server/zapi-service.mjs`, email em `artifacts/api-server/mail-service.mjs`, notificações internas via `db.auditLogs`.
- **Regra crítica do projeto (AGENTS.md):** Após qualquer commit, executar `npm run build` na pasta `artifacts/limpeza` e incluir os arquivos gerados em `artifacts/limpeza/dist/` no commit, depois fazer `git push origin main`.

---

## Requirements

### R1. Estrutura de Dados

Adicionar ao `data/database.json` duas novas chaves raiz:

**`serviceOrders`** — array de ordens de serviço, cada uma contendo:
- `id`, `title`, `token` (24 chars hex único), `status` (draft/active/closed)
- `createdAt`, `createdBy`
- `cleanFlatMode`: `"never"` | `"priority"` | `"always"` (ver R3)
- `maxSimultaneousFlats`: número inteiro (ex: 2)
- `maxFlatsPerDay`: número inteiro (ex: 4)
- `requirePhotos`: boolean
- `estimatedDurationHours`: número ou null
- `instructionFormat`: `"text"` | `"list"`
- `flats[]`: array com `{ flatId, flatNumber, instructions, status (pending/in_progress/done), startedAt, finishedAt, workerName, workerCpf, estimatedFinishAt, observations, photos[], needsCleaning (null/true/false) }`

**`serviceWorkers`** — array de registros de identificação de prestadores, cada um contendo:
- `id`, `serviceOrderId`, `token`
- `mainWorker: { name, cpf }`
- `collaborators[]: { name, cpf }`
- `registeredAt`

### R2. Backend — Novos Endpoints REST

Adicionar ao `artifacts/api-server/demo-server.mjs` (e mirror em `scripts/demo-server.mjs`) os seguintes endpoints:

**Rotas admin (requerem autenticação, role admin):**
- `GET /api/service-orders` — lista todos
- `POST /api/service-orders` — cria novo (gera token único com crypto)
- `GET /api/service-orders/:id` — detalhe
- `PATCH /api/service-orders/:id` — edita
- `DELETE /api/service-orders/:id` — remove
- `GET /api/service-orders/:id/progress` — painel de acompanhamento com status de cada flat

**Rotas públicas (sem autenticação):**
- `GET /api/service/public/:token` — retorna dados do serviço para o prestador (título, flats, instruções, configurações)
- `POST /api/service/public/:token/register` — prestador cadastra `{ mainWorker: { name, cpf }, collaborators[] }`
- `POST /api/service/public/:token/flats/:flatId/start` — inicia serviço em flat, com validação de limites e regras de flat limpo
- `POST /api/service/public/:token/flats/:flatId/finish` — finaliza flat com `{ observations, needsCleaning, photos[] }`
- `POST /api/service/public/:token/flats/:flatId/photos` — upload de fotos (multipart, usando o `uploadImageToStorage` existente)

**Modificação em rotas existentes:**
- `GET /api/flats`: adicionar campo `serviceInProgress: { serviceTitle, workerName, serviceOrderId } | null` em cada flat que tiver um flat de serviceOrder com `status: "in_progress"`
- Calendário/disponibilidade: quando flat tem serviço com `estimatedFinishAt`, incluir informação de bloqueio

### R3. Lógica de Negócio no Backend

**Validações ao iniciar flat (`start`):**
1. Prestador deve ter registro em `serviceWorkers` para aquele token (se não tiver → 403)
2. Contar flats com `status: "in_progress"` do prestador na ordem → deve ser < `maxSimultaneousFlats`
3. Contar flats com `status: "done"` finalizados hoje pelo prestador → deve ser < `maxFlatsPerDay`
4. Avaliar `cleanFlatMode` (considera **apenas os flats do serviço**):
   - `"never"` → bloquear se flat está limpo (não tem pós-checkout nem dirty)
   - `"priority"` → só liberar flat limpo se **nenhum** outro flat do serviço estiver sujo (pós-checkout ou check-out previsto para hoje)
   - `"always"` → liberar qualquer flat (mas API retorna `prioritySuggested: true` para sujos)

**Ao finalizar flat (`finish`):**
- Se flat estava limpo (ocupado por hóspede ou vago limpo): `needsCleaning` é obrigatório no body
- Se `requirePhotos: true` na ordem: `photos` não pode ser vazio
- Setar `finishedAt`, limpar bloqueio de camareira
- Desbloquear calendário PMS (remover `estimatedFinishAt` se for o flat mais recente)

**Notificações disparadas em `start` e `finish`:**
- WhatsApp para o número `5522998505276` (admin) com resumo do evento
- WhatsApp para a recepção (buscar telefone nas configurações do sistema)
- Email para a recepção (via `mail-service.mjs`)
- Notificação interna no sistema (push via mecanismo existente ou `db.notifications`)

Mensagem WhatsApp exemplo (start):
> 🔧 *Serviço iniciado* — [Título do Serviço]
> 🏠 Flat *[número]* | Prestador: [Nome] · CPF: [CPF]
> ⏰ [hora] · Previsão: [X]h
> ➡️ Liberar cartão de acesso ao flat [número]

Mensagem WhatsApp exemplo (finish):
> ✅ *Serviço finalizado* — [Título]
> 🏠 Flat *[número]* | Prestador: [Nome]
> ⏰ [início] → [fim] ([duração])
> 🧹 Precisa camareira: *[Sim/Não/N.A.]*
> 📝 Obs: "[observações]"
> 📷 [N] foto(s) disponíveis no sistema

### R4. Tela Admin — Gestão de Serviços

Criar página `artifacts/limpeza/src/pages/service-orders.tsx` com 3 abas:

**Aba 1 — Lista de Serviços:**
- Cards com título, status badge, barra de progresso (X/Y flats finalizados), link copiável
- Botões: "Novo Serviço", "Ver Progresso", "Editar", "Encerrar/Reativar"

**Aba 2 — Criar/Editar Serviço:**
- Campo título
- Toggle de permissão de flat limpo com 3 opções claramente explicadas (nunca / só se não houver sujo / sempre com prioridade)
- Campos numéricos: máx. simultâneos e máx. por dia
- Toggle: fotos obrigatórias ou opcionais
- Campo de duração prevista por flat (horas, opcional)
- Seleção de flats: grid checkbox com todos os 19 flats ativos
- Instruções: campo "aplicar a todos" + opção de instrução individual por flat
- Toggle de formato: texto corrido ou lista de itens

**Aba 3 — Painel de Acompanhamento:**
- Tabela em tempo real (polling/refetch) com: Flat | Status | Prestador | Iniciado | Finalizado | Precisa Camareira | Obs | Fotos
- Filtro por status
- Linha clicável → modal com fotos e observações completas
- Botão admin para resetar flat para "pending" (reabertura)

Adicionar rota `<AdminRoute path="/servicos" component={ServiceOrders} />` em `App.tsx`.

### R5. Portal Público do Prestador

Criar página `artifacts/limpeza/src/pages/service-worker-portal.tsx`, acessível via rota pública `/servico/:token` sem autenticação.

**Banner de identificação** (sempre visível no topo, destacado visualmente):
- Campos nome completo e CPF do prestador principal
- Seção para adicionar colaboradores (nome + CPF por colaborador)
- Botão salvar identificação
- Após salvo: banner muda para verde mostrando nome identificado
- Se tentar iniciar flat sem identificação → modal de alerta bloqueando a ação

**Lista de flats** com cards mostrando:
- Número do flat e status de ocupação (ícone/badge: Ocupado / Sujo Pós-Checkout / Vago Limpo)
- Instruções do serviço para aquele flat
- Status atual (Pendente / Em Andamento / Finalizado)
- Botão de ação com estados: Iniciar / Bloqueado (com motivo) / Em andamento / Finalizado

**Modal de finalização:**
- Aviso de limpeza (sempre)
- Se flat estava limpo: pergunta obrigatória "Precisa de camareira para finalizar a limpeza?" (radio Sim/Não)
- Campo de observações
- Upload de fotos (máx 5; se `requirePhotos: true` → obrigatório)
- Botão confirmar

Adicionar rota pública `<Route path="/servico/:token" component={ServiceWorkerPortal} />` em `App.tsx`.

### R6. Integração com Dashboard de Camareiras

No componente `artifacts/limpeza/src/components/flat-card.tsx`:
- Se `flat.serviceInProgress` presente: exibir badge "🔧 Serviço em andamento" no card
- Desabilitar botão de iniciar limpeza com tooltip explicativo (aguardando finalização do serviço)
- Visual do card deve claramente indicar o bloqueio sem ocultar as demais informações

### R7. Integração com Calendário PMS

Na tela de calendário (`artifacts/limpeza/src/pages/pms-calendar.tsx`) ou via dado retornado pela API:
- Se flat tem serviço ativo com `estimatedFinishAt`, exibir período bloqueado no calendário com badge "🔧 [Título do Serviço]"
- O bloqueio é visual — admin pode sobrescrever — mas deve exibir aviso ao tentar criar reserva naquele período

### R8. Build e Deploy

Após todas as implementações:
1. Rodar `npm run build` na pasta `artifacts/limpeza`
2. Incluir os arquivos gerados em `artifacts/limpeza/dist/` no commit
3. Fazer commit com mensagem descritiva
4. Fazer `git push origin main`

---

## Acceptance Criteria

### Backend e Dados
- [ ] `data/database.json` contém as chaves `serviceOrders` e `serviceWorkers` (arrays, podem estar vazios)
- [ ] `GET /api/service-orders` retorna 200 com autenticação admin; retorna 401/403 sem autenticação
- [ ] `POST /api/service-orders` cria serviço com token único de 24 chars hex, retorna o objeto criado
- [ ] `GET /api/service/public/:token` retorna 200 com token válido; retorna 404 com token inválido
- [ ] `POST /api/service/public/:token/flats/:flatId/start` retorna 403 se prestador não registrado
- [ ] `POST /api/service/public/:token/flats/:flatId/start` retorna 400 se limite de simultâneos atingido
- [ ] `POST /api/service/public/:token/flats/:flatId/start` retorna 400 se limite diário atingido
- [ ] `POST /api/service/public/:token/flats/:flatId/finish` retorna 400 se flat estava limpo e `needsCleaning` não foi informado
- [ ] `GET /api/flats` inclui `serviceInProgress` nos flats com serviço ativo
- [ ] Mirror `scripts/demo-server.mjs` é byte-a-byte idêntico a `artifacts/api-server/demo-server.mjs`

### Frontend Admin
- [ ] Rota `/servicos` acessível apenas para admin (redireciona para login ou access-denied se não admin)
- [ ] Formulário de criação de serviço salva e retorna sem erros
- [ ] Link do serviço é copiável e ao abrir em aba anônima exibe o portal do prestador
- [ ] Painel de acompanhamento mostra status atualizado dos flats (sem reload manual)
- [ ] As 3 opções de `cleanFlatMode` são exibidas com descrição clara de cada uma

### Portal do Prestador
- [ ] Rota `/servico/:token` abre sem autenticação
- [ ] Clicar em "Iniciar" sem identificação exibe modal bloqueante
- [ ] Após identificação, iniciar flat muda status do card para "Em andamento"
- [ ] Botão "Iniciar" desabilitado visualmente quando limite de simultâneos atingido, com mensagem explicativa
- [ ] Modal de finalização exige `needsCleaning` quando flat estava limpo
- [ ] Modal de finalização exige foto quando `requirePhotos: true`
- [ ] Flat sujo: card da camareira no dashboard mostra badge de bloqueio e botão "Iniciar Limpeza" desabilitado

### Notificações
- [ ] Ao iniciar flat: mensagem WhatsApp enviada para `5522998505276` com dados do evento
- [ ] Ao finalizar flat: mensagem WhatsApp enviada para `5522998505276` com resumo completo
- [ ] Notificação interna visível no sistema para a recepção

### Build
- [ ] `npm run build` na pasta `artifacts/limpeza` conclui sem erros
- [ ] Arquivos em `artifacts/limpeza/dist/` atualizados e incluídos no commit
- [ ] `git push origin main` executado com sucesso

## 2026-10-07T15:33:29Z

Implementar uma chave seletora global e dinâmica no CorpFlats (Guest-Flow-Manager) que permite alternar a experiência de check-in entre o formulário próprio do sistema e o check-in oficial da FNRH (Gov.br/Serpro). Quando ativo o modo Gov.br, o sistema cadastra a reserva na API Serpro (POST /reservas) para obter o link_precheckin oficial do Governo Federal, enviando-o em todas as mensagens de WhatsApp, e-mails e botões de interface, contando com fallback automático e transparente para o check-in próprio caso o Gov.br apresente lentidão ou indisponibilidade.

Working directory: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager
Integrity mode: development

## Requirements

### R1. Chave Seletora de Provedor de Check-in no Painel Administrativo
- Adicionar configuração no sistema (`settings.checkinProvider`: `'proprio'` | `'gov_fnrh'`) com persistência imediata no banco de dados (SQLite/PostgreSQL) e atualização em tempo real sem restart do servidor.
- Criar componente visual de alternância (Toggle Switch) no painel administrativo (Aba de Configurações / Geral) exibindo claramente o provedor ativo:
  - **Check-in Próprio (CorpFlats)**
  - **Check-in Gov.br (FNRH Digital - Ministério do Turismo)**
- Incluir na interface um badge de status indicando o modo ativo e a saúde da conexão com a API do SERPRO.

### R2. Serviço de Integração com API SERPRO FNRH v2.4.2 e Obtenção do Link Oficial
- Criar cliente HTTP (`scripts/fnrh-serpro-service.mjs` e importado no `demo-server.mjs`) configurado com Basic Auth (`usuario:senha` gerados no portal Serpro), ambiente (`homologacao` / `producao`) e cabeçalho `cpf_solicitante`.
- Ao criar ou selecionar uma reserva com o modo Gov.br ativo, invocar `POST /reservas` na API SERPRO enviando os dados da reserva (`numero_reserva`, `data_entrada`, `data_saida`, `quantidade_hospede_adulto`, `quantidade_hospede_menor`, `origem_reserva_id: 'MEIOHOSPEDAGEM'`).
- Capturar e persistir no objeto da reserva o `serproReservaId` e o `link_precheckin` oficial retornado pelo Ministério do Turismo.

### R3. Função Helper Centralizada e Fallback Resiliente de URLs
- Implementar a função utilitária global `getCheckinUrl(reservation, guestIndex, baseUrl)`:
  - Se `checkinProvider === 'gov_fnrh'`: retornar o `reservation.serproPrecheckinUrl`.
  - Se o link do Gov.br ainda não estiver gerado ou se a chamada à API SERPRO falhar/sofrer timeout (> 5 segundos), ativar o **fallback inteligente**: retornar imediatamente o link do check-in próprio (`${baseUrl}/pre-checkin/${reservation.code}?guest=${guestIndex || 1}`) e registrar log de auditoria com alerta no painel administrativo para a recepção.
  - Se `checkinProvider === 'proprio'`: retornar sempre o link interno (`${baseUrl}/pre-checkin/${reservation.code}?guest=${guestIndex || 1}`).

### R4. Unificação Universal de Links em Disparos e Interface
- **WhatsApp**:
  - Atualizar a rota e gatilhos de envio de WhatsApp (ex: lembrete de pré-checkin pendente `tpl_pre_checkin_reminder`, confirmação de nova reserva `tpl_reserva_site_confirmada`, mensagens automáticas do agente IA) para utilizar exclusivamente o link retornado por `getCheckinUrl`.
- **E-mails**:
  - Atualizar os templates de e-mail (confirmação ao hóspede, lembretes de pré-check-in, e-mails de instrução de acesso) para incorporar a URL dinâmica.
- **Painel Administrativo & Portais**:
  - Botão "Copiar Link de Check-in" na listagem de reservas e no modal de detalhes da reserva deve copiar a URL ativa resolvida por `getCheckinUrl`.
  - Botão de envio manual de WhatsApp e teste de check-in devem seguir a mesma resolução.

## Acceptance Criteria

### Alternância e Persistência
- [ ] O toggle no painel de configurações alterna entre `'proprio'` e `'gov_fnrh'` com persistência imediata no banco de dados e resposta JSON confirmando o estado.
- [ ] A alteração reflete instantaneamente em todas as rotas subsequentes de geração de link sem reinicialização do servidor.

### Geração de Links Dinâmicos
- [ ] No modo `'proprio'`, `getCheckinUrl` retorna uma URL contendo `/pre-checkin/:code`.
- [ ] No modo `'gov_fnrh'` com reserva registrada no SERPRO, `getCheckinUrl` retorna a URL oficial do Gov.br (`https://fnrh.turismo.gov.br/precheckin/...`).
- [ ] Em caso de falha simulada ou timeout da API SERPRO, `getCheckinUrl` aplica o fallback sem lançar exceção, retornando a URL própria e registrando aviso.

### Canais de Comunicação
- [ ] Disparo de mensagem de lembrete de pré-check-in via WhatsApp envia o link correto conforme a chave ativa.
- [ ] Disparo de e-mail de confirmação e lembrete envia o link correto conforme a chave ativa.
- [ ] Ação de "Copiar Link" no painel copia a URL condizente com a chave ativa.

### Testes Automatizados
- [ ] Teste unitário e de integração em `tests/fnrh-checkin-toggle.test.mjs` validando:
  1. Alternância de provedor via API de configurações.
  2. Resolução de links no modo Próprio e no modo Gov.br.
  3. Resiliência do fallback inteligente quando o SERPRO falha.
  4. Formatação de mensagens de WhatsApp e e-mails contendo a URL resolvida.


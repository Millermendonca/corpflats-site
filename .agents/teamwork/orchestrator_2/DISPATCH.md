## 2026-10-07T15:35:45Z

Implementar uma chave seletora global e dinâmica no CorpFlats (Guest-Flow-Manager) que permite alternar a experiência de check-in entre o formulário próprio do sistema e o check-in oficial da FNRH (Gov.br/Serpro). Quando ativo o modo Gov.br, o sistema cadastra a reserva na API Serpro (POST /reservas) para obter o link_precheckin oficial do Governo Federal, enviando-o em todas as mensagens de WhatsApp, e-mails e botões de interface, contando com fallback automático e transparente para o check-in próprio caso o Gov.br apresente lentidão ou indisponibilidade.

Working directory: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager
Integrity mode: development

### R1. Chave Seletora de Provedor de Check-in no Painel Administrativo
- Configuração no sistema (`settings.checkinProvider`: `'proprio'` | `'gov_fnrh'`) com persistência imediata no banco de dados e atualização em tempo real sem restart do servidor.
- Componente visual Toggle Switch no painel administrativo (Aba de Configurações / Geral) exibindo:
  - Check-in Próprio (CorpFlats)
  - Check-in Gov.br (FNRH Digital - Ministério do Turismo)
- Status badge indicando modo ativo e saúde da conexão com a API do SERPRO.

### R2. Serviço de Integração com API SERPRO FNRH v2.4.2 e Obtenção do Link Oficial
- Cliente HTTP (`scripts/fnrh-serpro-service.mjs`, importado em `artifacts/api-server/demo-server.mjs` e espelhado em `scripts/demo-server.mjs`) configurado com Basic Auth (`usuario:senha`), ambiente (`homologacao` / `producao`) e cabeçalho `cpf_solicitante`.
- Ao criar ou selecionar reserva com modo Gov.br ativo, invocar `POST /reservas` na API SERPRO (`numero_reserva`, `data_entrada`, `data_saida`, `quantidade_hospede_adulto`, `quantidade_hospede_menor`, `origem_reserva_id: 'MEIOHOSPEDAGEM'`).
- Persistir no objeto da reserva o `serproReservaId` e o `link_precheckin`.

### R3. Função Helper Centralizada e Fallback Resiliente de URLs
- Helper global `getCheckinUrl(reservation, guestIndex, baseUrl)`:
  - Se `checkinProvider === 'gov_fnrh'`: retornar `reservation.serproPrecheckinUrl` ou `reservation.link_precheckin`.
  - Se link do Gov.br não gerado ou chamada SERPRO falhar/timeout (> 5s): fallback inteligente para check-in próprio (`${baseUrl}/pre-checkin/${reservation.code}?guest=${guestIndex || 1}`) e log de auditoria com alerta no painel para recepção.
  - Se `checkinProvider === 'proprio'`: retornar link próprio.

### R4. Unificação Universal de Links em Disparos e Interface
- WhatsApp: rotas e templates (`tpl_pre_checkin_reminder`, `tpl_reserva_site_confirmada`, agente IA) usando exclusivamente `getCheckinUrl`.
- E-mails: templates (confirmação, lembretes de pré-checkin, instruções de acesso) usando `getCheckinUrl`.
- Painel Administrativo & Portais: botões "Copiar Link de Check-in", envio manual e teste usando `getCheckinUrl`.

### Acceptance Criteria & Regras
- Testes em `tests/fnrh-checkin-toggle.test.mjs` validando todos os 4 requisitos.
- Mirror byte-a-byte idêntico entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.
- Build do frontend `npm run build` na pasta `artifacts/limpeza` com inclusão de `dist/` no commit.
- Git commit e push para `origin main`.

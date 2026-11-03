# Original User Request

## Initial Request — 2026-11-02T23:16:47Z

Executar tudo ao mesmo tempo com uma equipe de agentes em paralelo todas as modificações propostas para o Guest-Flow-Manager nas Prioridades 1 a 3 (eliminação de tela branca/carregamento de módulos no frontend, otimização de latência de telas e rotas GET, e estabilidade do servidor Node e banco PostgreSQL no Render).

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

## Requirements

### R1. Prioridade 1 — Fim da Tela Branca e do "Carregando módulo..." (Frontend)
- Habilitar cache inteligente de assets em `artifacts/api-server/demo-server.mjs` e `artifacts/limpeza/vite.config.ts` (cache imutável `Cache-Control: public, max-age=31536000, immutable` para chunks com hash e validação `Cache-Control: no-cache` com ETag para arquivos sem hash), mantendo `no-store, no-cache` apenas para `index.html` e `sw.js`.
- Converter as 17 páginas pesadas importadas estaticamente no topo de `artifacts/limpeza/src/App.tsx` para `lazyWithRetry` (`Dashboard`, `CleaningForm`, `CheckinBatch`, `ServiceOrders`, `PmsCalendar`, `GuestPortal`, `GuestPreCheckin`, `GuestMinibar`, `GuestEarlyCheckin`, `GuestLateCheckout`, `GuestBreakfast`, `GuestReviews`, `GuestCheckout`, `GuestCompanionForm`, `PublicPreCheckin`, `WhatsappChat`, `WhatsappAutomation`, além de `MaintenanceStaffView`) para reduzir drasticamente o bundle inicial.
- Eliminar a cascata sequencial (waterfall) nos Guards (`AdminGuard`, `DevGuard`, `ReceptionGuard`, `StaffGuard` em `artifacts/limpeza/src/App.tsx`) para que o download dos chunks das rotas não fique bloqueado aguardando `/api/auth/me`, utilizando cache de sessão de forma segura sem comprometer a proteção de rotas.

### R2. Prioridade 2 — Fim da Lentidão ao Abrir Telas (Frontend e Backend)
- Não montar `<PmsCalendar modalOnly />` em `artifacts/limpeza/src/components/floating-new-reservation.tsx` enquanto o modal estiver fechado; carregar e montar sob demanda apenas quando o modal for aberto e, dentro de `pms-calendar.tsx`, desativar polling de 4s e cálculos pesados enquanto fechado.
- Retirar `reconcileAndMergeGuests` e `reconcileUniversalIntegrity` do caminho síncrono de todas as requisições GET em `artifacts/api-server/demo-server.mjs` implementando controle de cooldown/dirty flag; evitar a chamada duplicada de `getRequestsForDate(dateStr)` em `GET /api/reservations/checkouts`; e otimizar `computePeriodicTaskStatus` e `regularizeHousekeepingPreventiveTasks` com indexação/cache O(1).
- Reduzir a frequência de polling de `GET /api/pms/calendar` em `pms-calendar.tsx` de 4s para um intervalo de 10s–15s, pausando o polling quando a aba estiver oculta (`document.hidden`).

### R3. Prioridade 3 — Estabilidade do Servidor Node e do Banco PostgreSQL no Render
- Enxugar o `db_state` e otimizar `flushPgState()` em `artifacts/api-server/demo-server.mjs` para prevenir Event Loop starvation e OOM no PostgreSQL.
- Aprimorar `offloadHistoricalBase64Media()` e `pruneDatabase()` para descarregar payloads Base64 puros e podar históricos/logs excessivos sem travar o Event Loop durante a persistência.

### R4. Diretrizes Obrigatórias do Projeto e Controle de Versão
- Sempre fazer `git push` para o repositório remoto (`origin main` ou branch ativa) imediatamente após cada `git commit`.
- Ao alterar arquivos em `artifacts/limpeza/src`, rodar o build (`npm run build` na pasta `artifacts/limpeza`) e incluir os arquivos gerados em `artifacts/limpeza/dist/` no commit.
- NUNCA executar testes globais, varreduras ou em lote (terminantemente proibido rodar `tests/*.test.mjs`, scripts que varrem a pasta `tests/`, ou suítes completas do projeto).
- Executar exclusivamente o teste pontual estritamente associado ao que foi alterado. Proibido rodar testes de outros módulos e proibido mascarar/silenciar notificações em código.

## Acceptance Criteria

### Build e Frontend
- [ ] O comando `npm run build` na pasta `artifacts/limpeza` executa sem erros e gera os artefatos atualizados em `artifacts/limpeza/dist/`.
- [ ] As 17 páginas pesadas em `App.tsx` utilizam `lazyWithRetry`, reduzindo o tamanho do bundle inicial `index.js`.
- [ ] O componente `<PmsCalendar modalOnly />` não é montado nem dispara requisições de rede enquanto o modal de nova reserva estiver fechado.
- [ ] Os Guards de rota não bloqueiam o download dos chunks lazy enquanto aguardam a validação de autenticação.

### Performance e Estabilidade do Backend
- [ ] As rotas `GET /api/pms/guests` e `GET /api/reservations/checkouts` respondem sem executar reconciliação O(N^2) síncrona sem cooldown.
- [ ] `getRequestsForDate(dateStr)` não é chamada de forma duplicada em `GET /api/reservations/checkouts`.
- [ ] `computePeriodicTaskStatus` e `regularizeHousekeepingPreventiveTasks` executam com complexidade O(1) através de agrupamento/indexação prévia.
- [ ] O polling de `GET /api/pms/calendar` em `pms-calendar.tsx` respeita o intervalo de 10s–15s e pausa com `document.hidden`.
- [ ] `flushPgState()` executa a persistência no PostgreSQL sem travar o Event Loop por tempo prolongado e sem disparar OOM.

### Diretrizes e Controle de Versão
- [ ] Nenhuma suíte de testes global ou varredura de arquivos de teste foi disparada.
- [ ] Apenas testes pontuais diretamente associados às alterações foram executados, sem mascarar notificações.
- [ ] Todos os commits foram enviados para o repositório remoto via `git push`.

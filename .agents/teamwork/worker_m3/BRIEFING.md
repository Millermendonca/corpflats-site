# BRIEFING — 2026-10-19T05:02:00Z

## Mission
Implementar o Milestone 3 (Auto-Hide Sidebar, 6 Categorias Accordion, Busca Rápida e Remoção de WBP Manual em `artifacts/limpeza/src/components/layout.tsx`) para garantir 100% de largura visível do calendário PMS e reorganização ergonômica da navegação CorpFlats.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3
- Original parent: c4864abd-776b-4ad1-aef9-25c7af7463df
- Milestone: Milestone 3 (Layout Auto-Hide Sidebar & Nav Reorganization)

## 🔒 Key Constraints
- DO NOT CHEAT. All implementations must be genuine. Real state and behavior only.
- Strict file ownership for Worker M3:
  - `artifacts/limpeza/src/components/layout.tsx`
- Follow project rules in AGENTS.md:
  - Sempre fazer `git push` por padrão após commits para `origin main` (ou branch ativa).
  - Executar `npm run build` na pasta `artifacts/limpeza` para atualizar `artifacts/limpeza/dist/`.
  - NUNCA executar testes globais, varreduras ou em lote.
- Persistência de pin/unpin em `localStorage` (`gfm_sidebar_pinned`).
- Largura desktop 0px no fluxo normal quando desfixado (`w-0`), liberando 100% de largura para `/reservas`.
- Hover edge trigger na borda esquerda (`w-3 hover:w-7`) e menu trigger flutuante no topo esquerdo.
- 6 categorias operacionais em accordion com busca rápida unificada.
- Categoria 6 ("🛠️ Engenharia & Dev") estritamente oculta quando `user?.role !== 'dev'`.
- Remoção completa de referências/links ao Manual WBP.

## Current Parent
- Conversation ID: c4864abd-776b-4ad1-aef9-25c7af7463df
- Updated: 2026-10-19T05:02:00Z

## Task Summary
- **What was built**:
  1. Desktop Auto-Hide Sidebar (`artifacts/limpeza/src/components/layout.tsx`):
     - Barra lateral desktop com largura 0px no fluxo normal do documento flexbox (`w-0 overflow-hidden pointer-events-none`), garantindo 100% da viewport para `/reservas` (Mapa de Reservas PMS).
     - Hover edge trigger na borda esquerda (`fixed left-0 w-3 hover:w-7 z-30`) com pílula de destaque e mini-chevron.
     - Botão gatilho discreto de Menu no topo esquerdo (`fixed left-3 top-3/top-12 z-30`).
     - Overlay flutuante deslizante suave com `transition-transform duration-300 ease-in-out` (`translate-x-0` vs `-translate-x-full`) e backdrop discreto para fechar ao clicar fora.
     - Auto-recolhimento ao retirar o mouse com debounce de 280ms (`handleMouseLeaveSidebar`).
     - Botão de alternância Pin/Unpin no cabeçalho da sidebar com persistência em `localStorage` (`gfm_sidebar_pinned`). Quando fixada, o espaçador flexbox expande suavemente para `w-64 lg:w-72`.
     - Fechamento automático ao navegar se desfixada.
  2. Barra de Busca Rápida no Topo da Sidebar (Desktop & Mobile):
     - Campo de busca integrado com ícone `Search` e botão de limpar `X`.
     - Filtragem em tempo real sobre `label`, `description`, rota `href` e `title`.
     - Auto-expansão imediata de todas as categorias que contêm itens correspondentes (`isCategoryOpen`).
  3. 6 Categorias Reorganizadas em Accordion por Prioridade Operacional:
     - 1. **📅 Reservas & Hospedagem** (aberta por padrão: `defaultOpen = true`, liderada pelo PMS `/reservas` e Caixa OTA `/caixa-entrada-ota`)
     - 2. **💬 Comunicação & Atendimento** (`/whatsapp-chat`, `/whatsapp`, `/emails`, `/notificacoes`)
     - 3. **🧹 Governança & Manutenção** (`/dashboard`, `/reports`, `/lista-compras`, `/observations`, `/tasks`, `/surveys`, `/servicos`, `/achados-perdidos`, `/automacoes-camareiras`)
     - 4. **💰 Financeiro, Tarifas & Fiscal** (`/financeiro`, `/tarifas`, `/pagamentos`, `/notas`, `/funil-vendas`)
     - 5. **🏨 Propriedade & Equipe** (`/equipe`, `/propriedade`, `/garagem`, `/avaliacoes-ia`, `/editor-site`)
     - 6. **🛠️ Engenharia & Dev** (estritamente restrita a `isDev = user?.role === 'dev'`)
     - Auto-expansão da categoria correspondente à rota ativa (`isItemActive`).
  4. Remoção Completa do Manual WBP:
     - Removidas todas as referências, ícones `HelpCircle` e links para `/ajuda-wbp` em `layout.tsx`.
     - Rodapé da sidebar exibe botão para `/configuracoes` apenas para `dev`, e para `/equipe` para `admin`.
  5. Compilação TypeScript/Vite com `npm run build` bem-sucedida em 28.02s com código de saída 0, gerando os novos bundles em `artifacts/limpeza/dist/`.

## Key Decisions Made
- Spacer flexbox condicional (`w-0` vs `w-64 lg:w-72`) com `<aside fixed>`: Permite que o mapa de reservas ocupe 100% da tela sem redesenhar o grid ao abrir a sidebar flutuante em overlay, e quando fixada pelo usuário, a transição é suave e reserva espaço físico.
- Busca unificada e expansão reativa: Durante a digitação na busca, qualquer categoria com itens correspondentes é forçada a expandir, eliminando atrito de navegação.
- Isolamento estrito da categoria 6: Inclusão condicional no array `navCategories` avaliada por `isDev = user?.role === 'dev'`, garantindo que administradores hoteleiros (`role === 'admin'`) não vejam nem localizem rotas técnicas na busca.

## Artifact Index
- `DISPATCH.md` — assignment from orchestrator
- `BRIEFING.md` — persistent memory
- `progress.md` — liveness heartbeat
- `handoff.md` — final completion report

## Change Tracker
- **Files modified**:
  - `artifacts/limpeza/src/components/layout.tsx` (Auto-hide sidebar, busca rápida, 6 categorias accordion, dev isolation, remoção wbp)
  - `artifacts/limpeza/dist/` (Artefatos de build atualizados)
- **Build status**: PASS (`npm run build` exit code 0)
- **Pending issues**: none

## Quality Status
- **Build/test result**: PASS (Vite v7.3.6 production build exit code 0)
- **Lint status**: clean
- **Tests added/modified**: Layout visual e de comportamento verificado via compilação e inspeção de código

## Loaded Skills
- None required.

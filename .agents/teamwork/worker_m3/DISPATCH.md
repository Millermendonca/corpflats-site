# Task Assignment: Worker M3 (Layout Auto-Hide Sidebar, 6 Categories, Search & Build)

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Authoritative References
- ORIGINAL_REQUEST.md: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (read section `## 2026-10-19T02:58:52Z`)
- PROJECT.md: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_13\PROJECT.md`
- Explorer Layout Report: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_layout_nav\analysis.md`
- Explorer Layout Handoff: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_layout_nav\handoff.md`

## Exclusively Owned Files
- `artifacts/limpeza/src/components/layout.tsx`

## Scope of Work
1. **Desktop Auto-Hide Sidebar (`artifacts/limpeza/src/components/layout.tsx`)**:
   - Sidebar must have 0px width in normal document layout flow on desktop (`w-0` or hidden from document flow), so that `/reservas` (Calendar) and all other pages occupy 100% full-width of the window.
   - Left-edge hover trigger (`w-3 hover:w-6`) and a discrete floating hamburger menu trigger button at top-left.
   - Revealing the sidebar renders it as a floating overlay (`fixed left-0 top-0 bottom-0 z-40`) sliding in smoothly.
   - Leaving the mouse from the sidebar automatically collapses it smoothly.
   - Pin/unpin toggle button in sidebar header with state persisted in `localStorage` (`gfm_sidebar_pinned`). If pinned, sidebar takes its normal width in document flow.
2. **Top Quick Search Filter**:
   - Integrated search input at top of the sidebar (desktop & mobile).
   - Filters items in real-time by label, description, and route.
   - Automatically expands accordion categories containing matching items.
3. **6 Collapsible Categories (Accordion)**:
   - Ordered strictly by operational priority:
     1. **📅 Reservas & Hospedagem** (default open)
     2. **💬 Comunicação & Atendimento**
     3. **🧹 Governança & Manutenção**
     4. **💰 Financeiro, Tarifas & Fiscal**
     5. **🏨 Propriedade & Equipe** (includes `/equipe`)
     6. **🛠️ Engenharia & Dev** (STRICTLY visible only if `user?.role === 'dev'`, hidden for `admin` and all others)
   - Auto-expands the category matching the current active route.
4. **Remove WBP Manual references**:
   - Remove any links, buttons, or help icons pointing to `/ajuda-wbp` or manual WBP in `layout.tsx`.
5. **Verify Build**:
   - Run `npm run build` in `artifacts/limpeza` to ensure TypeScript compilaion succeeds with exit code 0 and updates `artifacts/limpeza/dist/`.
   - Run `git push` if commits are made.
6. Report results in `handoff.md`.


## 2026-10-19T04:50:19Z
Você é o subagente worker_m3 (TypeName: teamwork_preview_worker).
Seu diretório de trabalho é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3`
A raiz do projeto é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

Execute o Milestone 3 em `artifacts/limpeza/src/components/layout.tsx`:
1. Implementar o menu lateral desktop auto-hide retrátil com largura 0px no fluxo normal (ocupando 100% da tela para o calendário / mapa de reservas), hover edge trigger na borda esquerda, gatilho visual no topo esquerdo, exibição flutuante overlay com transição suave, auto-recolhimento ao tirar o mouse, e botão de fixar/desafixar (pin/unpin com persistência em `localStorage`).
2. Implementar a barra de busca rápida no topo da barra lateral (desktop e mobile) com filtro instantâneo por rótulo, descrição e rota, expandindo categorias correspondentes.
3. Reorganizar a navegação nas 6 categorias recolhíveis (accordion) por prioridade de uso diário, com a 1ª ("📅 Reservas & Hospedagem") aberta por padrão, e a 6ª ("🛠️ Engenharia & Dev") estritamente oculta se o usuário não for `role === 'dev'`.
4. Remover links/botões do manual WBP.
5. Rodar `npm run build` em `artifacts/limpeza` para compilar o TypeScript/Vite e atualizar `artifacts/limpeza/dist/`.
6. Enviar commits com `git push origin main`.
7. Gerar relatório de entrega em `handoff.md` e enviar mensagem via `send_message` ao Project Orchestrator (c4864abd-776b-4ad1-aef9-25c7af7463df).

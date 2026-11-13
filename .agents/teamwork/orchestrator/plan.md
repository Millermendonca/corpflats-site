# Orchestration Plan — Padronização Visual do Frigobar, Kit de Boas-Vindas & Repasse Anserve

## Objective
Implementar as diretrizes completas de frigobar:
1. Padronização e substituição das fotos do cardápio por marcas reais comerciais (fundo branco puro, proporções, ângulo e iluminação uniformes).
2. Galeria para validação e aprovação prévia das fotos com nomes de produtos e marcas antes da implantação final.
3. Inclusão dos itens de cortesia (Kit de Boas-Vindas) no cardápio do hóspede (`/frigobar/:flatNumber`): até 2 copos d'água mineral e até 2 amendoins Mendorato em destaque no topo com selo visual de cortesia e R$ 0,00.
4. Contabilização individual pela repositora no checklist/painel Anserve (0-2 copos e 0-2 amendoins) sem gerar ordem de reposição para a repositora (reposição feita por camareira na virada de hóspede).
5. Segregação e valor zerado (R$ 0,00) no extrato do hóspede e nos detalhes de reserva do PMS, sem acrescer o total a pagar da reserva.
6. Distinção de fornecimento e apuração de repasse financeiro à Anserve: amendoins Mendorato = fornecimento próprio do hotel (R$ 0 repasse); copos d'água = estoque Anserve (consumo cortesia * custo unitário para totalizador de repasse devido à Anserve pelo hotel).

## Step-by-Step Execution Plan

### Phase 0: Survey & Technical Investigation (3 Explorers in Parallel)
- **Explorer 1**: R1 & R2 — Frigobar catalog, current product list, real commercial brand mapping, image asset locations/formats, and preview gallery design for prior user approval.
- **Explorer 2**: R3 & R5 — Guest minibar page (`/frigobar/:flatNumber`), welcome kit section with cortesia badge & R$ 0,00, and reservation statement / PMS consumption detail segregation.
- **Explorer 3**: R4 & R6 — Anserve restock/conferência panel (`anserve-restock.tsx`, `anserve-dashboard.tsx`), checklist modification without restock triggers, and financial reconciliation for Anserve water cup cost repasse vs Mendorato own supply.

### Phase 1: Survey Synthesis into PROJECT.md & Decomposition
- Synthesize explorer findings into `PROJECT.md`.
- Define Feature Inventory (F1 to FN) and decompose into clean milestones.
- Specify Interface Contracts and Code Layout.

### Phase 2: Milestone Implementation (Workers)
- Worker(s) implement changes following twin file rule (`artifacts/api-server/` -> `scripts/`) and frontend guidelines.
- Build frontend (`npm run build` in `artifacts/limpeza`).
- Execute strictly targeted tests if applicable.

### Phase 3: Gate Verification (Multi-Agent Verification)
- 2 Reviewers independently assess code quality, contracts, and requirements.
- 2 Challengers empirically test edge cases, financial calculations, and UI presentation.
- 1 Forensic Auditor verifies zero cheating, authentic logic, and twin parity.

### Phase 4: Final Integration, Build & Git Push
- Worker runs final verification build.
- Git commit and `git push` to remote origin.

### Phase 5: Sentinel Final Reporting
- Present complete results to parent Sentinel via `send_message`.

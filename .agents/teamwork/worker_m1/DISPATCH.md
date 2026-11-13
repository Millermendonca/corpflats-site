# DISPATCH — worker_m1

## Milestone 1: Padronização Visual das Fotos por Marcas Reais & Galeria de Homologação (R1 & R2)

### Mandatory Instructions
1. Read `ORIGINAL_REQUEST.md` at:
   `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`
2. Read `PROJECT.md` at:
   `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md`
3. Read `survey_explorer_1` report at:
   `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1\survey_report.md`
   and `handoff.md`.

### MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

### Scope & Tasks
1. **R1: Padronização Visual das Fotos por Marcas Reais Comerciais**:
   - Provide/prepare the standardized photos for all products of the catalog mapped to real commercial brands (Coca-Cola 350ml, Coca-Cola Zero 350ml, Toddynho 200ml, Heineken Long Neck 330ml, Red Bull 250ml, Pringles Original 114g/40g, KitKat 41.5g, Kinder Bueno Duplo 43g, Mendorato Santa Helena 27g, Água Mineral Copo Selado 200ml, Água Mineral Garrafa 500ml, etc.).
   - Follow the visual standard: pure white background (`#FFFFFF`), uniform proportions 1:1, studio 5500K lighting, frontal 10°-15° angle, soft contact shadow.
2. **R2: Galeria de Validação e Homologação Prévia no `minibar-admin.tsx`**:
   - In `artifacts/limpeza/src/pages/minibar-admin.tsx`, implement the `galeria_marcas` sub-view (inside `<TabsContent value="catalogo">` or dedicated tab/modal) that displays side-by-side:
     * Proposed real commercial brand photo.
     * Legacy / current photo.
     * Official product name and assigned commercial brand (with manufacturer and volume/weight).
     * Homologation status ("Aprovado", "Pendente", "Troca Solicitada").
     * Alternative brand switcher (e.g. switch between Heineken / Stella Artois, or Toddynho / Nescau).
     * Approval actions (individual "Aprovar Foto" button and "Aprovar Todas as Fotos" bulk button) that persist the approval state in the system.
3. **Verification**:
   - Run `npm run build` in `artifacts/limpeza` to ensure zero compilation or bundle errors.
   - Document verification results in your `handoff.md`.


## 2026-11-11T10:43:52Z
You are worker_m1, a teamwork_worker.
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1\
Project root: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY REFERENCES:
1. Read ORIGINAL_REQUEST.md at:
   c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
2. Read PROJECT.md at:
   c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md
3. Read survey_explorer_1 findings at:
   c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1\survey_report.md
   and c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1\handoff.md
4. Read your DISPATCH.md at:
   c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1\DISPATCH.md

YOUR TASKS (Milestone 1 — Requirements R1 & R2):
1. R1: Standardize the photo assets for all minibar catalog products mapped to real commercial brands (Coca-Cola, Coca-Cola Zero, Toddynho, Heineken, Red Bull, Pringles, KitKat, Kinder Bueno Duplo, Mendorato Santa Helena, Água Mineral Copo Selado, Água Mineral Garrafa, etc.). Ensure images comply with the visual standard: pure white background (#FFFFFF), uniform 1:1 proportion, studio lighting, frontal 10°-15° angle, and soft ambient shadow. Place/update the images in `artifacts/limpeza/public/images/frigobar/` (including proposed brand images or real brand assets).
2. R2: Implement the Validation & Homologation Gallery in `artifacts/limpeza/src/pages/minibar-admin.tsx`:
   - Under tab `catalogo`, implement the sub-view `galeria_marcas` (with button in the sub-view selector alongside "Produtos & Preços" and "Quantidade Padrão").
   - Display side-by-side: proposed commercial photo vs legacy/current photo, product name, commercial brand name, manufacturer, and volume/weight.
   - Include status indicators ("Aprovado", "Pendente", "Troca Solicitada"), alternative brand selector, and approval buttons (individual "Aprovar Foto" and "Aprovar Todas as Fotos").
   - Persist approval status so the user can review and approve before final production rollout.
3. Verification:
   - Run `npm run build` in `artifacts/limpeza` to confirm zero TypeScript and bundling errors.
   - Ensure twin parity if any backend file is touched (though M1 focuses on frontend and public assets).
   - Write full implementation report and handoff to `handoff.md` in your working directory.
   - Message caller upon completion.

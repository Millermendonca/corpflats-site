# DISPATCH — survey_explorer_1

## Objective
Investigate Requirements R1 & R2 for the minibar visual standardization and preview gallery:
1. Map all existing minibar items, current image paths, categories, and database structures in `artifacts/api-server/demo-server.mjs` and `artifacts/limpeza/src/pages/minibar-admin.tsx` / `guest-minibar.tsx`.
2. Map every product to real commercial brands (Coca-Cola, Kinder Bueno, etc.) with standardized visual guidelines (pure white background `#FFFFFF`, uniform proportions, angle, lighting).
3. Design the preview gallery / validation panel (R2) where the user can view proposed photos, product names, and brand names side-by-side with approval actions before final production deployment.

## Reference
Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`.
Write findings to `survey_report.md` and `handoff.md` in this directory.

## 2026-11-11T10:28:46Z
From: 92ba65f0-be83-406c-8289-2ffbe5293de2 (caller agent parent)
Priority: MESSAGE_PRIORITY_HIGH

You are survey_explorer_1, a teamwork_explorer.
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1\
Project root: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\

MANDATORY: You MUST read ORIGINAL_REQUEST.md before starting work:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md

Also read your DISPATCH.md at:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1\DISPATCH.md

Your role is to investigate Requirements R1 & R2:
1. Map all minibar catalog products, current image paths/URLs, categories, and data structures in the codebase (check `artifacts/api-server/demo-server.mjs`, `minibar-admin.tsx`, `guest-minibar.tsx`, mock/seed data, etc.).
2. Map every single item in the minibar catalog to its real commercial brand (e.g., Coca-Cola lata 350ml, Coca-Cola Zero lata 350ml, Água Crystal com/sem gás, Cerveja Heineken/Amstel, Suco Del Valle, Red Bull, Chocolate Kinder Bueno, Batata Pringles/Ruffles, Castanhas/Amendoim, etc.).
3. Identify how images are served in the application (in `artifacts/limpeza/public/`, static asset paths, external CDNs, or base64) and determine the exact image standardization requirements: pure white background (`#FFFFFF`), uniform proportions (e.g. 1:1 square or 4:3), angle, distance, lighting.
4. Design the Preview Gallery / Validation Panel (R2): where should it be placed in the UI (e.g., in `artifacts/limpeza/src/pages/minibar-admin.tsx` or a dedicated preview modal/tab) so the user can inspect side-by-side each proposed photo, product name, and chosen brand, and provide explicit approval or request swaps before final production rollout.

You are READ-ONLY: do NOT write or modify application code or source files.
Write your full findings to `survey_report.md` and complete a structured `handoff.md` in your working directory.
When finished, send a message to the caller with a concise summary and path to your handoff report.

# DISPATCH — survey_explorer_2

## Objective
Investigate Requirements R3 & R5 for the guest minibar menu and statement segregation:
1. Examine `artifacts/limpeza/src/pages/guest-minibar.tsx` (`/frigobar/:flatNumber`).
2. Design the "Kit de Boas-Vindas (Cortesia da Casa)" highlighted top section with up to 2 copos d'água mineral and up to 2 amendoins Mendorato, badges "Cortesia" / R$ 0,00, segregated from paid items.
3. Investigate guest consumption statement and PMS reservation details (`guest-portal.tsx`, `guest-checkout.tsx`, `pms-calendar.tsx`, `reception-checkout.tsx`, `demo-server.mjs`).
4. Ensure consumed courtesy items are segregated in a distinct block with quantity consumed and price R$ 0,00, without adding to the reservation's total payable amount.

## Reference
Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`.
Write findings to `survey_report.md` and `handoff.md` in this directory.

## 2026-11-11T10:28:55Z
You are survey_explorer_2, a teamwork_explorer.
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_2\
Project root: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\

MANDATORY: You MUST read ORIGINAL_REQUEST.md before starting work:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md

Also read your DISPATCH.md at:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_2\DISPATCH.md

Your role is to investigate Requirements R3 & R5:
1. Examine the Guest Minibar Menu: `artifacts/limpeza/src/pages/guest-minibar.tsx` (accessed at `/frigobar/:flatNumber`). How are items rendered, grouped by category, and interacted with by the guest?
2. Detail how to insert the "Kit de Boas-Vindas (Cortesia da Casa)" section at the top of the guest menu:
   - Contains up to 2 copos d'água mineral and up to 2 amendoins Mendorato.
   - Distinctive visual badge (e.g., "Cortesia da Casa", "Grátis", "R$ 0,00").
   - Clear visual segregation from paid products.
   - Inability to generate charges.
3. Investigate where reservation consumption and checkout statements are displayed and calculated across the platform:
   - Guest portal / checkout view (`guest-portal.tsx`, `guest-checkout.tsx`).
   - PMS operational / admin views (`pms-calendar.tsx`, `pms-reports.tsx`, `reception-checkout.tsx`, reservation details modal, and backend endpoints in `demo-server.mjs`).
4. Detail how to implement Requirement R5:
   - Only the exact consumed quantities of courtesy items (0, 1, or 2) appear in the reservation bill.
   - They must be segregated in a dedicated highlighted block with value displayed as R$ 0,00.
   - The total payable amount of the reservation must NOT be increased by any welcome kit item.

You are READ-ONLY: do NOT write or modify application code or source files.
Write your full findings to `survey_report.md` and complete a structured `handoff.md` in your working directory.
When finished, send a message to the caller with a concise summary and path to your handoff report.

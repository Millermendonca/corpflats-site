## 2026-10-13T23:28:19Z
You are Reviewer 2 for Milestone 2 (Canonical Availability & SEBRAE Pricing Engine with Safety Locks).
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_m2_2`

Read these documents before reviewing:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
4. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2\handoff.md`

Your Mission:
1. Conduct an independent architecture, math, and non-regression review of Milestone 2:
   - SEBRAE Math verification: check that variable costs exclude R$/day commission (R$ 23.25 + 15.51 + 9.00 = 47.76), fixed cost is R$ 101.62, total UH cost is R$ 149.38, divisor is 0.54, Tarifa Mínima is R$ 276.63, and analytical decomposition closes 100% with zero residue.
   - Breakfast surcharge (OBP) mapping: standard double base rate, single discount, extra bed for 3rd guest, and R$ 25/guest/night added for "Com café".
   - Safety locks: floor lock, 30% variation lock, staged publication workflow.
   - Non-regression: verify that when integration is off/unpublished, legacy quotes and daily rate calculations remain 100% identical penny-for-penny.
   - Test isolation: verify tests run on temporary DB copies and do not mutate real `data/database.json`.
2. Run exclusively `node --test tests/wbp-integration/m2-availability-pricing.test.mjs`. (NEVER run global test suites!).
3. State your explicit verdict in `handoff.md`: APPROVE or REQUEST_CHANGES. Send message to orchestrator.

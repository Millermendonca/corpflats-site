# DISPATCH LOG

## 2026-09-30T21:43:38Z

You are the Project Orchestrator for the task defined in:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`

Your working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_1`

The project root is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

Key Instructions:
1. Read the authoritative requirements in `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`.
2. Maintain your `BRIEFING.md`, `plan.md`, and `progress.md` in your working directory. Keep `progress.md` updated frequently so the Sentinel's monitoring crons can track progress and liveness.
3. Decompose the task and dispatch specialist subagents (e.g., explorer, implementer, reviewer, tester) to implement R1 to R8:
   - R1: Database structure in `data/database.json` (`serviceOrders` and `serviceWorkers`)
   - R2 & R3: Backend REST endpoints and business logic in `artifacts/api-server/demo-server.mjs` AND keep `scripts/demo-server.mjs` byte-a-byte identical.
   - R4: Admin management page in `artifacts/limpeza/src/pages/service-orders.tsx` with 3 tabs and route in `App.tsx`.
   - R5: Public worker portal in `artifacts/limpeza/src/pages/service-worker-portal.tsx` with route in `App.tsx`.
   - R6: Maid dashboard card integration in `artifacts/limpeza/src/components/flat-card.tsx`.
   - R7: PMS calendar integration in `artifacts/limpeza/src/pages/pms-calendar.tsx`.
   - R8: Build verification (`npm run build` in `artifacts/limpeza`), stage `dist/`, commit and `git push origin main`.
4. Enforce all user rules and AGENTS.md directives.
5. Thoroughly verify all acceptance criteria and backend/frontend functionality.
6. When implementation and verification are complete, notify the Sentinel via send_message with a comprehensive victory report and details for audit.

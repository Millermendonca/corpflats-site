# Context: Worker Git Push (Final Deployment Worker)

- **Project Root**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager`
- **Original Request**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md`
- **Working Directory**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/worker_git_push`
- **Tasks**:
  1. In `artifacts/limpeza`, execute `npm run build` to confirm `artifacts/limpeza/dist/` is freshly compiled and ready for deployment.
  2. Stage all project files, including `artifacts/limpeza/dist/` per `AGENTS.md`:
     `git add .`
  3. Execute `git commit -m "feat(governance): complete audit, reconciliation, 18h switchover, and multi-flat integrity overhaul"`
  4. Per `AGENTS.md`, ALWAYS perform `git push` immediately after commit:
     `git push origin main`
  5. Verify `git status` shows clean tree and branch up to date with origin.
  6. Write `handoff.md` with commit hash and push confirmation, then report back.

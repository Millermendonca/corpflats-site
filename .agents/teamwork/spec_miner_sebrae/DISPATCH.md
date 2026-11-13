## 2026-10-13T22:08:00Z
You are the SEBRAE Pricing & UI Workflow Spec Miner.
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\spec_miner_sebrae`

Read the authoritative documents:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first)
2. `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\scratch\sebrae_dump.txt`
3. `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\analise_precificacao_sebrae.md`
4. `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\mockups.md`
5. Inspect mockups:
   - `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\mockup_precificacao_1791928509939.jpg`
   - `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\mockup_previsualizacao_v2_1791928602700.jpg`
   - `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\mockup_caixa_entrada_ota_1791928543273.jpg`

Your mission:
Extract complete technical specifications for the SEBRAE pricing engine, locks, and UI workflows:
- Math specification:
  - Exact UH cost breakdown: R$ 101,62 (fixo) + 23,25 (limpeza) + 15,51 (enxoval) + 9,00 (energia) = R$ 149,38 (R$/diária channel commission removed!).
  - Tarifa Mínima formula: Custo / (1 - 0.15 comissão - 0.25 margem - 0.06 imposto) = R$ 276,63 (± R$ 0,05).
  - Verify exact component breakdown sum to verify it closes perfectly.
- Pricing safety locks: floor lock, variation lock (default 30%), preview & publish workflow.
- UI requirements & layouts:
  - Tarifa Mínima tab (matching mockup)
  - Pré-visualização & Publicar modal/screen (matching mockup)
  - Caixa de Entrada OTA screen with tabs/quarantine (matching mockup)
  - Initial reconciliation report for pre-existing manual bookings
  - Help manual page in system (R9 requirements: admin & reception guide, error codes, screenshots placeholder)
- Output: write your findings to `analysis.md` and complete handoff to `handoff.md` in your working directory. Send a brief message back to orchestrator upon completion.

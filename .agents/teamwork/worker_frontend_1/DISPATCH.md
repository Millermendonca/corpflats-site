# Task Assignment: Worker Frontend UI Sandbox (M1 & M3)

## Mission
Implement the Smart Flat Hub UI Sandbox and Welcome Audio controls in `artifacts/limpeza/`:
1. **Privacy Isolation (R1)**:
   - Ensure ZERO elements, buttons, or links are visible to real guests in production (`guest-portal.tsx`).
   - Create the preview route `/preview/smart-flat` and `/preview/smart-flat/:code` in `artifacts/limpeza/src/App.tsx`.
   - Also allow preview via query parameter `?preview=smart_flat`.
2. **UI Components (R1, R2, R3, R4)**:
   - Create `artifacts/limpeza/src/pages/smart-flat-preview.tsx` and modular components under `artifacts/limpeza/src/components/smart-flat/`:
     * `SmartFlatHub.tsx`: Main hub view with header, flat selector, status banners.
     * `DeviceCard.tsx`: Reusable device card for Coffee Maker (power switch, thermal warning icon, auto-off indicator).
     * `ClimateControl.tsx`: AC controls with temperature slider (18°C to 26°C), mode selector (cool, fan, heat, dry), fan speed, and status.
     * `FailSafeStatus.tsx`: Presence verification, ETA display, warning notification ("Você já chegou?"), auto-shutdown countdown, and "Confirmar Entrada no Flat" button.
     * `WelcomeMusicPlayer.tsx`: Audio player with play/pause, volume control, track list, and ambient status.
     * `SandboxToolbar.tsx`: Developer & preview toolbar allowing simulation of time offsets, ETA changes, and state testing.
   - Use Tailwind CSS v4, Radix UI primitives (`Slider`, `Switch`, `Tabs`, `Progress`), and Lucide icons.
3. **Build & Verification**:
   - Run `npm run build` in `artifacts/limpeza` to verify clean TypeScript compilation (exit code 0).
   - Ensure generated assets in `artifacts/limpeza/dist/` are created properly.

## Write Ownership
- `artifacts/limpeza/src/App.tsx`
- `artifacts/limpeza/src/pages/smart-flat-preview.tsx`
- `artifacts/limpeza/src/components/smart-flat/*`
- `artifacts/limpeza/dist/*`

## Mandatory Rules
- DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
- NUNCA executar testes globais ou em lote (tests/*.test.mjs).
- Path to ORIGINAL_REQUEST.md: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`.
- Path to AGENTS.md: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`.

Output your handoff report to: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_frontend_1\handoff.md`.

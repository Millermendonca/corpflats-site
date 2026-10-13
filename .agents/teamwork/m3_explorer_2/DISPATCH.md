## 2026-10-11T15:45:41Z
You are M3 Explorer 2 for Milestone 3 of the CorpFlats Guest-Flow-Manager project.

Your Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m3_explorer_2
Authoritative Request: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (read section from 2026-10-11T12:53:32Z)
Project Plan: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md

Scope: Milestone 3 — Guest Portal UI Flow, Modals & Operational Panels.
Focus: Re-Signature Banner in `guest-portal.tsx` & Fast-Track Re-signing flow in `guest-pre-checkin.tsx`.

Tasks:
1. Read ORIGINAL_REQUEST.md and PROJECT.md.
2. Inspect `artifacts/limpeza/src/pages/guest-portal.tsx`:
   - Design the prominent re-signature alert banner at the top of the Guest Portal and inside the Reservation Card whenever `reservation.needsReSignature === true`.
   - Banner must include clear explanation: "Sua reserva teve as datas ou acomodação alteradas. É obrigatório assinar a declaração atualizada para liberar o acesso ao condomínio."
   - Button: "Assinar Termo Atualizado" linking directly to `/pre-checkin/${reservation.code}?resign=1`.
3. Inspect `artifacts/limpeza/src/pages/guest-pre-checkin.tsx`:
   - Check lines where `resign=1` and `needsReSignature` are handled (e.g. lines 605-640, 2067-2080).
   - Ensure the re-signing experience preserves all previously filled guest fields (name, CPF, phone, address, photo ID) so the guest does not have to re-fill anything.
   - Ensure the signature canvas is cleared and ready for the fresh signature.
   - Verify that upon submitting, the endpoint `POST /api/pms/pre-checkin` is called with the new signature and `resign=1`, redirecting back to the Guest Portal with success confirmation.
4. Provide exact drop-in code blueprints for `guest-portal.tsx` and `guest-pre-checkin.tsx`.
5. Write analysis to `analysis.md` and standard `handoff.md`. Send completion message when done.

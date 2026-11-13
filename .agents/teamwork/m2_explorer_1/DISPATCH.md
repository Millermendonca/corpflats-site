# Dispatch — Milestone 2 Explorer 1 (Inbound Auto-Detection)

## Objective
Investigate how inbound messages are processed in `zapi-service.mjs` and `whatsapp-ai-service.mjs`:
1. Find where incoming customer messages trigger Sofia AI evaluation in `processAiInboundMessage`.
2. Determine how to detect when a customer question is unmapped (i.e. low confidence or triggers human handover/fallback).
3. Design the exact logic to auto-create a pending FAQ entry in `db.faqItems`:
   - `id`: `faq_${Date.now()}_${random}`
   - `question`: message text
   - `answer`: "" (or null)
   - `category`: infer or default to "reservas" / appropriate category
   - `status`: "pendente"
   - `source`: "auto_aprendizado"
   - `clientPhones`: [senderPhone]
   - `scope`: "all"
   - `metadata`: `{ customerPhone, customerName, askedAt: ISOString }`
4. Formulate the exact code diff for `artifacts/api-server/zapi-service.mjs` and `scripts/zapi-service.mjs`.

Write `analysis.md` and `handoff.md` in your working directory. Notify orchestrator via `send_message`.


## 2026-10-11T03:03:56Z
You are Milestone 2 Explorer 1 for Guest-Flow-Manager.
Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_explorer_1
Project root: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager

Investigate inbound webhook and unmapped question auto-detection in zapi-service.mjs and whatsapp-ai-service.mjs.
Provide recommended implementation diffs for both artifacts/ and scripts/.
Write analysis.md and handoff.md in your working directory.
When done, notify me via send_message with a summary and handoff path.


## 2026-10-11T14:40:28Z
You are M2 Explorer 1 for Milestone 2 of the CorpFlats Guest-Flow-Manager project.

Your Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_explorer_1
Authoritative Request: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (read section from 2026-10-11T12:53:32Z)
Project Plan: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md

Scope: Milestone 2 — Re-Signature Lifecycle, Document Delivery & Ops Synchronization.
Focus: Re-signature invalidation on date/flat change and pre-checkin clearance.
1. Read ORIGINAL_REQUEST.md and PROJECT.md.
2. Inspect `scripts/demo-server.mjs` lines around 13712-13768 (`PUT /api/pms/reservations/:id`), lines 15616-15822 (`commitPendingModification`), lines 16580-16750 (`POST /modify`), lines 19350-19632 (`POST /api/pms/pre-checkin`).
3. Detail how date/flat changes across all pathways (portal modification, admin edit) must invalidate previous check-in signatures:
   - Sets `r.needsReSignature = true`, `r.reSignatureReason = "Alteração de acomodação (flat) ou período da estadia"`
   - Clears `r.fnhrCompleted = false`, `r.signatureUrl = null`, `r.checkedInAt = null`
   - Deletes stale `r.fnrhPdfUrl`, `r.fnrhDocumentUuid`, `r.fnrhSha256Hash`
   - Flags guest items in `r.guests` with `needsReSignature = true`.
4. In `POST /api/pms/pre-checkin`: ensure that upon receiving the renewed check-in submission and signature:
   - Sets `r.needsReSignature = false`, `r.fnhrCompleted = true`
   - Sets `targetGuest.needsReSignature = false`, `targetGuest.hasCompletedCheckin = true`
   - Persists state to database.
5. Provide exact drop-in code blueprint for `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`.
6. Write analysis to `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_explorer_1\analysis.md` and standard `handoff.md`. Send completion message when done.

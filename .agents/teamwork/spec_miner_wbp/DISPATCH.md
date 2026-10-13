## 2026-10-13T22:07:59Z
You are the WBP Specification Miner for the WebBookingPro integration.
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\spec_miner_wbp`

Read the authoritative documents:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first)
2. `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\wbp_docs\wbpAPI.yaml`
3. `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\wbp_docs\README.md`
4. `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\wbp_docs\pages\`

Your mission:
Extract complete technical specifications for the client and the simulator:
- Endpoints: HealthCheck, SetupProperty, GetRoomTypes, GetRatePlans, ARIUpdate, GetBookingList, GetBookingId, AckBooking.
- Callbacks in PMS: BookingCreate, NotifyBooking (form-urlencoded), ARIFullRefresh, RoomInfo.
- Authentication, headers, `guid` per request, SHA-256 / shared_secret verification.
- Known inconsistencies and edge cases: end_date inclusive, 5-minute margin on wbp_booking_version, UTC weekend logic, rate plan fields (rate, rdef_single, adults additions), restrictions (minNights, maxNights, stop-sell, CTA, CTD, min/max advance).
- Error codes and handling: 1001, 1002, 1102, timeouts.
- Requirements for the local WBP simulator: schema validation against wbpAPI.yaml, injection of new/modified/cancelled reservations, simulated failures/timeouts.
- Output: write your findings to `analysis.md` and complete handoff to `handoff.md` in your working directory. Send a brief message back to orchestrator upon completion.

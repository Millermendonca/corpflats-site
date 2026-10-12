# Explorer 1 Task: Backend WhatsApp Routing, AI Pause Bypass & Data Models

Working Directory: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_1`
Root Directory: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

## 2026-10-11T23:18:12Z
Investigate the backend WhatsApp architecture for CorpFlats in c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager.
Authoritative requirements: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (Seção ## Follow-up — 2026-10-11T23:13:31Z).
Your working directory is c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_1.
You are a read-only exploration agent. Do NOT modify source code files. Do NOT run global test suites.

Analyze:
1. Where and how incoming WhatsApp messages are received and processed (scripts/whatsapp-routes.mjs, scripts/whatsapp-service.mjs, scripts/whatsapp-ai.mjs, scripts/zapi-service.mjs, scripts/demo-server.mjs, etc.).
2. How aiPaused is currently checked, set, and stored for chats/threads. How to implement the persistent developer immunity/bypass for phone numbers 22998505276 and 5522998505276 (both normalized and unnormalized formats) so that this number is NEVER muted by aiPaused: true.
3. How database.json stores WhatsApp settings, AI config, chats, and where db.whatsappAiSettings.developerGuidelines should reside.
4. Twin-Server Parity requirements: which files in scripts/ correspond to artifacts/api-server/ and how changes should be synchronized.
5. Provide precise line numbers, function names, and recommendations for implementing R1 (developer identification & pause bypass) and supporting endpoints for R3 (message rectification endpoint /api/whatsapp/chat/:phone/correct-message).
Write your complete report to c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_1\handoff.md and send a message when done.

## 2026-10-11T23:50:52Z
You are Worker 2 (Frontend Web Chat & Automation UI Specialist).
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_2.
Project root: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager.
Authoritative Requirements: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (Seção ## Follow-up — 2026-10-11T23:13:31Z).
Read the blueprint from Explorer 3:
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_3\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

STRICT AGENTS.MD RULES:
1. NUNCA executar testes globais, varreduras ou em lote (PROIBIDO rodar tests/*.test.mjs).
2. Build de Produção: ao alterar arquivos em artifacts/limpeza/src, executar obrigatoriamente npm --prefix artifacts/limpeza run build (ou npm run build dentro de artifacts/limpeza) e verificar saída sem erros em artifacts/limpeza/dist/.

YOUR EXCLUSIVE WRITE OWNERSHIP:
- artifacts/limpeza/src/pages/whatsapp-chat.tsx
- artifacts/limpeza/src/pages/whatsapp-automation.tsx
- artifacts/limpeza/dist/

TASK OBJECTIVES:
1. Implement 1-Click Message Rectification in Web Chat (artifacts/limpeza/src/pages/whatsapp-chat.tsx):
   - In Sofia's message bubbles (isFromMe && !msg.triggerEvent && (msg.senderName?.toLowerCase().includes('sofia') || msg.sender === 'system')), add the button:
     ✏️ Corrigir / Ensinar Sofia
   - Implement the correction dialog using Dialog, DialogContent, etc. from @/components/ui/dialog:
     - Display the original Sofia message.
     - Input field for "O que a Sofia deve aprender? (Diretriz / Regra)".
     - Input field for "Mensagem Cordial de Retificação para o WhatsApp" with checkbox "Enviar ao Hóspede" (checked by default).
     - 1-click action button "Salvar Diretriz & Enviar Retificação" (or "Salvar Apenas na IA" if unchecked) that calls POST /api/whatsapp/chat/:phone/correct-message with payload:
       { messageId, originalText, guideline, rectificationMessage, sendToGuest, category: "factual" }.
     - Refresh messages and show success toast/alert upon completion.
2. Implement Guidelines & Tone Management in WhatsApp Automation (artifacts/limpeza/src/pages/whatsapp-automation.tsx):
   - In tab ai_agent (TabsContent value="ai_agent"), in the left column (lg:col-span-7), place the new Card immediately before the Base de Conhecimento card (around line 2282):
     🧠 Diretrizes & Calibrações Aprendidas (developerGuidelines)
   - Show:
     - Badge with active guidelines count.
     - Button "Nova Diretriz" opening a modal to add manual rule (calling POST /api/whatsapp/developer-guidelines).
     - List of guidelines with category badges (🎨 Tom & Estilo vs 📌 Fato / Regra), source badges (📱 WhatsApp Dev vs 🖥️ Chat Web vs ⚙️ Manual), timestamp, rule text, and sample (if present).
     - Action button to test guideline directly in the simulator (setting simulator input).
     - Action button to delete guideline (calling DELETE /api/whatsapp/developer-guidelines/:id).
   - Fetch guidelines on load and when tab becomes active via GET /api/whatsapp/developer-guidelines or GET /api/whatsapp/ai-config.
3. Production Build:
   - Run npm --prefix artifacts/limpeza run build.
   - Verify exit code is 0 and assets in artifacts/limpeza/dist/public are updated.
4. Write your completion report to c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_2\handoff.md and send a message.

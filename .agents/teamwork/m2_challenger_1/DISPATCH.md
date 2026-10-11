# Dispatch — Milestone 2 Challenger 1 (AI Injection & Heuristic Challenger)

## Objective
Empirically stress-test Sofia prompt injection and heuristic matching:
1. Test prompt injection with multiple client phones: allowed client vs excluded client vs include_only client.
2. Test heuristic matching priority: ensure specific FAQ keywords (e.g. "louças do café", "visitas", "pets", "early check-in") match FAQ answers and are not swallowed by generic regexes.
3. Test with inactive or pending FAQs: ensure they NEVER match or appear in prompt.
4. Run `node --test tests/whatsapp-ai-agent.test.mjs` and check duration and exit code.
Deliver a definitive verdict: `APPROVE` or `REQUEST_CHANGES`.

Write `challenge.md` and `handoff.md` in your working directory. Notify orchestrator via `send_message`.


## 2026-10-11T03:33:31Z
You are Challenger 1 for Milestone 2 for Guest-Flow-Manager.
Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_challenger_1
Project root: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager

MANDATORY INSTRUCTION: You MUST read ORIGINAL_REQUEST.md before starting:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md

Read task instructions in:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_challenger_1\DISPATCH.md
and the worker handoff:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_worker\handoff.md

Empirically test:
1. Prompt injection with client scopes (all, exclude, include_only) and confirm pending/awaiting items are never injected.
2. Heuristic priority matching for FAQ keywords before generic regexes.
3. Run `node --test tests/whatsapp-ai-agent.test.mjs` and check execution time and exit code.
Deliver definitive verdict: APPROVE or REQUEST_CHANGES.
Write challenge.md and handoff.md in your working directory. Notify orchestrator via send_message.

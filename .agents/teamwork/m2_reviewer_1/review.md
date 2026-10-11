# Milestone 2 Review & Adversarial Challenge Report

**Reviewer**: Reviewer 1 (`m2_reviewer_1`)  
**Roles**: reviewer, critic  
**Target Commit**: `53d1b7d5fdd29629e1f9c547bc945044f67bfc40`  
**Date**: 2026-10-11T03:43:00Z  
**Verdict**: **`APPROVE`**  
**Overall Risk Assessment**: **LOW**

---

## 1. Executive Summary

Milestone 2 implements the dynamic Knowledge Base & FAQ Auto-Learning Engine for the WhatsApp AI Agent (Sofia / CorpFlats):
1. **Dynamic Prompt Injection & Exception Rules** (`whatsapp-ai-service.mjs:1400-1463`): Active FAQs filtered strictly by client applicability (`all`, `exclude`, `include_only`) and injected into the Gemini context under `## BASE DE CONHECIMENTO & REGRAS (FAQS ATIVAS):`.
2. **Prioritized Heuristic Contingency** (`whatsapp-ai-service.mjs:1045-1144`): Dynamic FAQ evaluation executed prior to static regexes, using tokenized scoring, diacritic normalization, variation matching, and keyword weights.
3. **Unmapped Inbound Question Auto-Detection** (`whatsapp-ai-service.mjs:1803-1819`): Inbound guest questions triggering handover or heuristic fallback automatically register as `"pendente"` with category inference, keyword extraction, and operator notification.
4. **Operator Response Capture & AI Pausing** (`zapi-service.mjs:1168-1244`, `5687-5715`, `6244-6263`): Human replies (`fromMe: true` via webhook or Live Chat REST endpoints) match pending guest questions within a 24-hour window, populate `suggestedAnswer`, transition status to `"aguardando_aprovacao"`, and pause the AI (`conv.aiPaused = true`, `aiPausedReason = "operator_manual_reply"`).
5. **Twin-Server Parity**: 100% SHA-256 byte parity confirmed across all mirrored `.mjs` server pairs between `artifacts/api-server/` and `scripts/`.
6. **Test Suite**: All 24 tests in `tests/whatsapp-ai-agent.test.mjs` pass in **4.83s** (< 5.0s requirement) with exit code 0.
7. **Infrastructure Cleanliness**: Port 5000 is verified clean with zero listeners before and after execution.

---

## 2. Integrity & Anti-Cheating Verification

| Check | Result | Evidence |
|---|---|---|
| Hardcoded Test Results | **PASS** | No hardcoded test responses or artificial test branching found in `whatsapp-ai-service.mjs` or `zapi-service.mjs`. |
| Facade / Dummy Logic | **PASS** | Scoring algorithm, phone matching regex, 24h window calculation, and database persistence are authentic and complete. |
| Task Delegation / Shortcuts | **PASS** | Logic implemented natively in project code. |
| Fabricated Logs / Outputs | **PASS** | Verified independently by running tests, port inspection, and hash verification in real-time. |
| Self-Certifying Verification | **PASS** | Independent review verified all 24 tests directly via Node.js test runner and measured wall-clock execution time. |

---

## 3. Architecture & Interface Conformance Review

### 3.1 Dynamic Prompt Injection (`generateAiWhatsAppResponse`)
- **Location**: `artifacts/api-server/whatsapp-ai-service.mjs:1400-1463` and mirror `scripts/whatsapp-ai-service.mjs`.
- **Status Filtering**: Queries `db.faqItems` (and falls back to `db.knowledgeBaseFaq`). Strictly filters `faq.status === "ativo"`. Items in `"pendente"` or `"aguardando_aprovacao"` are NEVER leaked into the Gemini prompt.
- **Rule Engine**: Evaluates `isFaqApplicableToClient(faq, phone)` supporting `all`, `exclude`, and `include_only` with DDI/DDD normalization via `matchClientPhone`.
- **Format**: Injected with markdown headers, category tags, question variations, and official answers.

### 3.2 Heuristic Fallback Engine (`generateHeuristicResponse`)
- **Location**: `artifacts/api-server/whatsapp-ai-service.mjs:1045-1144`.
- **Precedence**: Evaluated at step 0 of heuristic fallback. Avoids shadowing of specific FAQs by generic regexes (e.g., breakfast dishes vs general breakfast).
- **Matching Mechanics**:
  - Main question exact/partial match: +80 pts.
  - Significant token overlap: +30 pts per word.
  - Question variation match: +100 pts.
  - Multi-word keyword match: +50 pts; single keyword: +15 to +25 pts.
  - Threshold: >= 25 pts.

### 3.3 Auto-Learning Inbound Webhook (`processAiInboundMessage`)
- **Location**: `artifacts/api-server/whatsapp-ai-service.mjs:1803-1819`.
- **Detection**: Evaluates `isPotentialGuestQuestion`, `!isQuestionMappedInFaq`, and `needsHandoverOrFallback`.
- **Persistence**: Employs `autoCreatePendingFaq` to create records in `db.faqItems` with `status: "pendente"`, `source: "auto_aprendizado"`, inferred category, extracted keywords, and triggers operator notification.

### 3.4 Operator Response Capture & AI Pausing (`zapi-service.mjs`)
- **Location**: `artifacts/api-server/zapi-service.mjs:1168-1244`.
- **Dual Hook**:
  - Z-API Webhook: Triggered on `incomingInfo.fromMe === true` in `POST /api/whatsapp/webhook/received`.
  - Live Chat API: Triggered on manual messages sent via `handleChatSend` (`/api/whatsapp/chat/send`, `/api/whatsapp/chats/:phone/messages`).
- **Matching & Expiration**: 24-hour window enforced; candidates sorted by most recent timestamp; telephone matched with normalization.
- **State Transition**: Sets `status: "aguardando_aprovacao"`, `suggestedAnswer`, `answeredBy: "operador"`.
- **Conversation Safety**: Automatically sets `conv.aiPaused = true` and `conv.aiPausedReason = "operator_manual_reply"`.

---

## 4. SHA-256 Parity & Test Execution Matrix

### 4.1 SHA-256 Byte Parity Matrix
| File | artifacts/api-server/ Hash | scripts/ Hash | Parity Status |
|---|---|---|---|
| `whatsapp-ai-service.mjs` | `77a220e752b1e23dadd530c4b6fbcbc2b72f77fcbc6c652be01fea85fcd299fb` | `77a220e752b1e23dadd530c4b6fbcbc2b72f77fcbc6c652be01fea85fcd299fb` | **100% IDENTICAL** |
| `zapi-service.mjs` | `ae1584516c7ccc2da4f62bc418862ad5298aadcc08570c710e7a1d56c3b98bcb` | `ae1584516c7ccc2da4f62bc418862ad5298aadcc08570c710e7a1d56c3b98bcb` | **100% IDENTICAL** |
| `demo-server.mjs` | `2e817d224c94f5cffb9af19a28f02d6b75bcd528ce542ca7cde8f085e0bbf8e9` | `2e817d224c94f5cffb9af19a28f02d6b75bcd528ce542ca7cde8f085e0bbf8e9` | **100% IDENTICAL** |
| `fnrh-pdf-service.mjs` | `845254a8419ea08343a4baff7bcfd2d61d22c4376643d8103dac2a131582771b` | `845254a8419ea08343a4baff7bcfd2d61d22c4376643d8103dac2a131582771b` | **100% IDENTICAL** |
| `fnrh-serpro-service.mjs` | `daadda63426434cd9925fcc25b7d726f83fec50e7f737e09bbef9500f8f4c78a` | `daadda63426434cd9925fcc25b7d726f83fec50e7f737e09bbef9500f8f4c78a` | **100% IDENTICAL** |
| `mail-service.mjs` | `3f17611b44a6d54480434e7aa7b81d50bf436fc332523886a1548b5d036cc34c` | `3f17611b44a6d54480434e7aa7b81d50bf436fc332523886a1548b5d036cc34c` | **100% IDENTICAL** |
| `storage-service.mjs` | `c3b6dbe78a5464d89e220e32c79e6cf56eefcbc3d33b6ec5cb35a8c5fb48fb10` | `c3b6dbe78a5464d89e220e32c79e6cf56eefcbc3d33b6ec5cb35a8c5fb48fb10` | **100% IDENTICAL** |

### 4.2 Test Execution Metrics
- **Command**: `node --test tests/whatsapp-ai-agent.test.mjs`
- **Output**: TAP 13, 24 tests executed, 24 passed, 0 failed.
- **Execution Time**: **4.836s** (Requirement: < 5.0s).
- **Exit Code**: **0**.
- **Port 5000 Cleanliness**: Confirmed before and after testing (`netstat` and `Get-NetTCPConnection` returned 0 connections).

---

## 5. Adversarial Critic Findings & Stress Test Observations

### [Minor] Finding 1: Heuristic Token Collision on Broad Category Queries
- **Location**: `whatsapp-ai-service.mjs:1074-1078`
- **Description**: Significant tokens in common award 30 points each. When a user asks a broad question (e.g. "Como funciona o café da manhã?"), if an existing specific FAQ contains those broad tokens (e.g. `faq-loucas`: "O que fazer com as louças e a bandeja após o café da manhã?"), the token overlap yields 60 points (2 tokens * 30 pts), crossing the 25-point threshold and returning the specific FAQ instead of allowing generic category handling.
- **Severity**: Minor / Non-blocking.
- **Mitigation Recommendation**: In future tuning, require minimum query coverage ratio (e.g., matching tokens must represent >= 50% of the target question length) or discount broad category tokens when no specific noun/verb is matched.

### [Minor] Finding 2: Greeting with Question Mark ("Tudo bem?") Question Filter
- **Location**: `whatsapp-ai-service.mjs:1520-1522`
- **Description**: `isPotentialGuestQuestion("Tudo bem?")` returns true because the check for `?` precedes pattern matching, and "tudo bem" is not in the greeting regex. If handover occurs, this may create a pending FAQ for a conversational pleasantry.
- **Severity**: Minor / Non-blocking.
- **Mitigation Recommendation**: Add `tudo bem` and `como vai` to the greeting regex in `isPotentialGuestQuestion`.

### [Minor] Finding 3: Accent Normalization in `findExistingPendingFaq`
- **Location**: `whatsapp-ai-service.mjs:1620-1626`
- **Description**: Deduplication compares `lower.includes(qLower)` on lowercase text without stripping diacritics. As a result, variations like "Vocês têm ferro?" and "Vocês tem ferro?" might not deduplicate against each other.
- **Severity**: Minor / Non-blocking.
- **Mitigation Recommendation**: Apply `.normalize("NFD").replace(/[\u0300-\u036f]/g, "")` before containment checks in `findExistingPendingFaq`.

---

## 6. Final Verdict

**VERDICT: `APPROVE`**

All requirements of Milestone 2 (Features 5, 6, and 7) are fully met with high architectural fidelity, zero integrity violations, complete twin-server SHA-256 parity, clean port hygiene, and a 100% passing test suite running under 5 seconds.

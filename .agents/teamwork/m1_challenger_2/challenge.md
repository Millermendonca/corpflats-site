# Adversarial Challenge Report — Milestone 1

**Agent**: `m1_challenger_2` (Roles: critic, specialist)  
**Date**: 2026-10-11T02:23:00Z  
**Project**: Guest-Flow-Manager Dynamic FAQ & Knowledge Base (Milestone 1)  
**Target Code**: `artifacts/api-server/zapi-service.mjs`, `artifacts/api-server/demo-server.mjs`, `scripts/`  
**Test Suite**: `tests/challenger-m1-rest-atomic-stress.test.mjs`

---

## Challenge Summary

**Overall risk assessment**: **LOW**  
**Verdict**: **APPROVE**

Milestone 1 satisfies all functional and non-functional requirements under empirical adversarial testing. The 5 REST endpoints correctly handle invalid payloads, missing mandatory fields, non-existent IDs, and 1-click approval flows. `atomicWriteFileSync` demonstrated 100% cleanup of temporary `.tmp_*` files across 100 rapid sequential writes, 50 asynchronous concurrent workers, and injected error paths (directory target, lock simulation). Seeding is strictly idempotent and non-destructive. SHA-256 byte parity between `artifacts/` and `scripts/` is verified at 100%.

One non-blocking implementation nuance was uncovered regarding `parseList` splitting on `\s` when string inputs are supplied for `variations` or formatted `clientPhones`. Because the API contract and TypeScript interface specify `string[]` arrays (which process flawlessly), this does not block Milestone 1, but is documented below with recommended mitigations for Milestones 2 and 3.

---

## Challenges

### [Low] Challenge 1: String Delimiter Splitting in `parseList` for Multi-Word Variations and Formatted Phones

- **Assumption challenged**: The helper `parseList(val)` in `zapi-service.mjs:6476 & 6526` uses `val.split(/[,;\n\s]+/)` to conveniently support string inputs across keywords, variations, and clientPhones.
- **Attack scenario**: If a client sends `variations` as a newline-delimited string (e.g. from a raw textarea) `"Tem ferro de passar?\nOnde tem ferro?"`, or `clientPhones` as formatted text with spaces `"(22) 99850-5276"`, the `\s` token in the regex splits on internal spaces.
  - Sentence `"Tem ferro de passar?"` becomes `["Tem", "ferro", "de", "passar?"]` instead of preserving the complete question phrasing.
  - Phone `"(22) 99850-5276"` becomes `["22", "998505276"]`, isolating `"22"` and stripping DDD context from the 9-digit number.
- **Blast radius**: Low for Milestone 1 because the interface contract specifies arrays (`variations: string[]`, `clientPhones: string[]`), which branch to `Array.isArray(val)` and retain complete phrases and numbers. However, in Milestone 3 (frontend UI form), if a textarea sends a raw string without client-side `.split("\n")`, variations would be fragmented.
- **Mitigation**: In Milestone 3, ensure the frontend `use-faq` hook converts textarea lines into `string[]` arrays before dispatching POST/PUT, or refine `parseList` to `/[\r\n;]+/` for variations.

### [Low] Challenge 2: Temp File Residue Under Atomic Write Failures & Concurrent Bursts

- **Assumption challenged**: `atomicWriteFileSync` in Windows environments might leave orphaned `.tmp_*` files if `renameSync` or `copyFileSync` fail under rapid access, locks, or path errors.
- **Attack scenario**: 
  1. 100 rapid sequential writes to the same database file.
  2. 50 asynchronous concurrent workers writing simultaneously.
  3. Writing to a destination path that is a directory (forcing an OS-level exception).
- **Stress Test Result**: Under all scenarios, zero `.tmp_*` files remained in the filesystem (`tmpFiles.length === 0`). The inner fallback block cleanly executes `if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)`.
- **Blast radius**: None. The implementation is highly resilient.

### [Low] Challenge 3: 1-Click Approval (`/api/whatsapp/faq/:id/approve`) Without Answers

- **Assumption challenged**: Calling approval on an unmapped pending question without any human answer might erroneously activate an empty FAQ item.
- **Attack scenario**: An operator triggers approval on an item with status `"pendente"` that has `answer: ""` and `suggestedAnswer: undefined`, without passing a body override.
- **Stress Test Result**: The endpoint strictly rejects the request with HTTP 400 `{ error: "Não é possível aprovar sem uma resposta definida ou sugerida." }`. When an answer is provided in the body or pre-existing in `suggestedAnswer`, status immediately transitions to `"ativo"` and records `approvedAt`.

### [Low] Challenge 4: Seeding Idempotency and Custom Operator Edit Preservation

- **Assumption challenged**: Executing `seedInitialFaqItems(db)` repeatedly might duplicate items or overwrite operator customizations (such as custom Wi-Fi credentials or customized checkout times).
- **Attack scenario**: Seed executed on an empty DB, followed by 100 consecutive runs, followed by a user edit to `faq-wifi`, followed by deleting `faq-checkout-12h`.
- **Stress Test Result**:
  - Empty DB: 15 items inserted, returns `true`.
  - 100 consecutive runs: 15 items maintained, returns `false`.
  - Operator edited answer on `faq-wifi`: preserved unchanged.
  - Deleted item `faq-checkout-12h`: restored without overwriting other customized items.

---

## Stress Test Results

Executed via: `node --test tests/challenger-m1-rest-atomic-stress.test.mjs`  
All 14 tests completed in **~6.2 seconds** with **0 failures** (exit code 0).

| Subtest | Scenario Tested | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|---|
| **1.1** | Registration of all 5 FAQ endpoints | All 5 routes exist in simulated router | All 5 routes registered | **PASS** |
| **2.1** | GET filters (category, status, scope, search) | Filters return exact subsets; search is case-insensitive | Exact matches, no regex crash, handles null DB fields | **PASS** |
| **3.1** | POST payload validation & defaults | 400 on empty question; default "pendente" or "ativo"; ID & ISO timestamps generated | HTTP 400 on empty; 201 on valid; defaults set | **PASS** |
| **3.2** | POST parseList string whitespace behavior | Empirically documents `\s` delimiter behavior for string inputs | Documented: arrays preserve phrases, strings split on `\s` | **PASS** |
| **4.1** | PUT granular updates & 404 | 404 on missing ID; granular field updates; updatedAt advanced | HTTP 404 on invalid ID; updates applied, timestamps advanced | **PASS** |
| **5.1** | DELETE removal & idempotency | 200 on existing ID, removed from DB; 404 on subsequent DELETE | Item removed; repeat call returns HTTP 404 | **PASS** |
| **6.1** | POST /:id/approve 1-click logic | 404 on missing ID; 400 on empty answer; promotes suggestedAnswer to answer with "ativo" | HTTP 400 without answer; HTTP 200 with suggestedAnswer | **PASS** |
| **7.1** | Seeding idempotency (100 cycles) | 15 seeds; preserves user customizations; restores deleted seeds | 15 items maintained; zero duplicates; edits preserved | **PASS** |
| **8.1** | Atomic write single file & temp check | Target written; zero `.tmp_*` files left | Content verified; 0 temp files | **PASS** |
| **8.2** | 100 rapid sequential atomic writes | Target reflects iteration 99; zero `.tmp_*` files left | Final content intact; 0 temp files | **PASS** |
| **8.3** | Atomic write failure cleanup | Destination is directory; exception handled; zero `.tmp_*` files left | Handled cleanly; 0 temp files remaining | **PASS** |
| **8.4** | Atomic write 2MB massive payload | 2MB payload written and readable; zero `.tmp_*` files left | Payload verified; 0 temp files | **PASS** |
| **8.5** | 50 concurrent async atomic writes | Target exists and parseable; zero `.tmp_*` files left | 50 tasks completed; 0 temp files | **PASS** |
| **9.1** | Rule engine & phone normalization | Strict DDD 21 vs 22 discrimination; scope rules (all/exclude/include_only) | Strict discrimination confirmed; all scopes verified | **PASS** |

---

## Unchallenged Areas

- **PostgreSQL Cloud Latency / Connection Pooling**: In-memory and local disk persistence (`data/database.json`) were tested under stress; live remote PostgreSQL connection was bypassed using test mock configuration.
- **Frontend React UI**: Belongs to Milestone 3.

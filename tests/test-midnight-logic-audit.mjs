import assert from 'node:assert/strict';

// Import or recreate the exact functions from artifacts/api-server/demo-server.mjs
const BRAZIL_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function getTodayStr() {
  return BRAZIL_DATE_FORMATTER.format(new Date());
}

function getExecutionDateStr(isoString) {
  if (!isoString) return getTodayStr();
  try {
    return BRAZIL_DATE_FORMATTER.format(new Date(isoString));
  } catch {
    return isoString.substring(0, 10);
  }
}

console.log("=== TIMEZONE & MIDNIGHT BOUNDARY AUDIT ===");

// Scenario: A worker finishes a flat at 21:30 local Brazil time (UTC-3) on 2026-09-30
const finishDateBrazil = new Date("2026-09-30T21:30:00-03:00");
const finishedAtUtcIso = finishDateBrazil.toISOString(); // "2026-10-01T00:30:00.000Z"

// At 21:35 local Brazil time, worker tries to start another flat
const checkDateBrazil = new Date("2026-09-30T21:35:00-03:00");
const brazilTodayStr = BRAZIL_DATE_FORMATTER.format(checkDateBrazil); // "2026-09-30"

// Server's implementation at line 8159:
// const doneTodayCount = (order.flats || []).filter(f => f.status === "done" && f.finishedAt && f.finishedAt.substring(0, 10) === todayStr).length;
const serverDoneCheck = finishedAtUtcIso.substring(0, 10) === brazilTodayStr;

console.log("1. FinishedAt UTC ISO:", finishedAtUtcIso);
console.log("2. Naive substring(0, 10):", finishedAtUtcIso.substring(0, 10));
console.log("3. Brazil local date at time of check:", brazilTodayStr);
console.log("4. Server's line 8159 match result:", serverDoneCheck);

if (!serverDoneCheck) {
  console.log("❌ VULNERABILITY CONFIRMED: Line 8159 fails to count flats finished between 21:00 and 23:59:59 Brazil time towards today's daily limit!");
}

// Next morning at 09:00 Brazil time (2026-10-01):
const nextMorningBrazil = new Date("2026-10-01T09:00:00-03:00");
const nextDayTodayStr = BRAZIL_DATE_FORMATTER.format(nextMorningBrazil); // "2026-10-01"
const nextDayDoneCheck = finishedAtUtcIso.substring(0, 10) === nextDayTodayStr;

console.log("5. Next day Brazil date:", nextDayTodayStr);
console.log("6. Next day match result with yesterday's 21:30 flat:", nextDayDoneCheck);

if (nextDayDoneCheck) {
  console.log("❌ QUOTA THEFT CONFIRMED: Yesterday's late-night flat is erroneously counted against TODAY's daily limit on October 1st!");
}

// Correct implementation using getExecutionDateStr:
const correctSameDayCheck = getExecutionDateStr(finishedAtUtcIso) === brazilTodayStr;
const correctNextDayCheck = getExecutionDateStr(finishedAtUtcIso) === nextDayTodayStr;

console.log("7. Correct check with getExecutionDateStr on same day:", correctSameDayCheck);
console.log("8. Correct check with getExecutionDateStr on next day:", correctNextDayCheck);

assert.strictEqual(serverDoneCheck, false, "Server's current code fails on day boundary");
assert.strictEqual(nextDayDoneCheck, true, "Server's current code falsely consumes next day's quota");
assert.strictEqual(correctSameDayCheck, true, "Correct fix properly matches on same day");
assert.strictEqual(correctNextDayCheck, false, "Correct fix properly isolates next day");

console.log("\nAudit passed: Empirical proof of vulnerability established.");

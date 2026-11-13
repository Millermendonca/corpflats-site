import assert from 'node:assert/strict';

const BRAZIL_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function getExecutionDateStr(isoString) {
  try {
    return BRAZIL_DATE_FORMATTER.format(new Date(isoString));
  } catch {
    return isoString.substring(0, 10);
  }
}

// Flat started at 21:30 local Brazil time on 2026-09-30
const startedAtBrazil = new Date("2026-09-30T21:30:00-03:00");
const startedAtUtcIso = startedAtBrazil.toISOString(); // "2026-10-01T00:30:00.000Z"

// Estimated duration 2 hours -> finishes at 23:30 local Brazil time on 2026-09-30
const finishAtBrazil = new Date("2026-09-30T23:30:00-03:00");
const finishAtUtcIso = finishAtBrazil.toISOString(); // "2026-10-01T02:30:00.000Z"

// Server's implementation at line 9981:
const naiveStartDate = startedAtUtcIso.substring(0, 10);
const naiveEndDate = finishAtUtcIso.substring(0, 10);

console.log("Naive start date in calendar:", naiveStartDate);
console.log("Actual Brazil local start date:", BRAZIL_DATE_FORMATTER.format(startedAtBrazil));

// Calendar query for today (2026-09-30):
const queryStart = "2026-09-30";
const queryEnd = "2026-09-30";

const naiveMatchesQuery = (naiveStartDate <= queryEnd && naiveEndDate >= queryStart);
console.log("Does naive block appear in today's PMS calendar?", naiveMatchesQuery);

if (!naiveMatchesQuery) {
  console.log("❌ VULNERABILITY CONFIRMED: A service block active right now (between 21:00 and 23:59 Brazil time) is INVISIBLE in today's PMS calendar!");
}

const correctStartDate = getExecutionDateStr(startedAtUtcIso);
const correctEndDate = getExecutionDateStr(finishAtUtcIso);
const correctMatchesQuery = (correctStartDate <= queryEnd && correctEndDate >= queryStart);
console.log("Does correct block appear in today's PMS calendar?", correctMatchesQuery);

assert.strictEqual(naiveMatchesQuery, false, "Naive calendar block fails to display on current day");
assert.strictEqual(correctMatchesQuery, true, "Correct calendar block displays on current day");

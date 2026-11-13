import assert from "node:assert/strict";
import * as maidService from "../artifacts/api-server/maid-automation-service.mjs";

console.log("================================================================================");
console.log("   CHALLENGER 1 — EMPIRICAL STRESS TEST SUITE (MILESTONE 1)");
console.log("================================================================================");

const {
  resolveMaidCleaningForReservation,
  triageSub5Review,
  deterministicTriageSub5Review
} = maidService;

assert.equal(typeof resolveMaidCleaningForReservation, "function", "resolveMaidCleaningForReservation must be exported");
assert.equal(typeof triageSub5Review, "function", "triageSub5Review must be exported");
assert.equal(typeof deterministicTriageSub5Review, "function", "deterministicTriageSub5Review must be exported");

const results = [];
function report(name, passed, detail) {
  results.push({ name, passed, detail });
  const status = passed ? "[PASS]" : "[FAIL]";
  console.log(`${status} ${name}: ${detail}`);
}

// ==============================================================================
// CHALLENGE 1: resolveMaidCleaningForReservation
// ==============================================================================
console.log("\n--- CHALLENGE 1: resolveMaidCleaningForReservation ---");

// Test 1.1: Multiple stayovers during a 14-day stay (does it pick the latest stayover?)
try {
  const db1 = {
    users: [
      { id: 2, username: "Cris", name: "Cris", phone: "22988486446", whatsapp: "5522988486446", role: "camareira" },
      { id: 3, username: "Grazi", name: "Grazi", phone: "22999106204", whatsapp: "5522999106204", role: "camareira" }
    ],
    flats: [{ id: 1, number: "113" }],
    reservations: [{
      id: 501,
      code: "RES-LONG-14D",
      flatNumber: "113",
      checkinDate: "2026-11-01",
      checkoutDate: "2026-11-15",
      guestName: "Hóspede Longa Estada"
    }],
    cleaningRequests: [
      { id: 10, flatNumber: "113", requestDate: "2026-11-01", completedAt: "2026-11-01T12:00:00.000Z", status: "clean", cleaningType: "checkout", assignedUserId: 2 },
      { id: 11, flatNumber: "113", requestDate: "2026-11-05", completedAt: "2026-11-05T14:00:00.000Z", status: "clean", cleaningType: "stayover", assignedUserId: 3 },
      { id: 12, flatNumber: "113", requestDate: "2026-11-10", completedAt: "2026-11-10T15:30:00.000Z", status: "clean", cleaningType: "stayover", assignedUserId: 2 },
      { id: 13, flatNumber: "113", requestDate: "2026-11-13", completedAt: "2026-11-13T16:00:00.000Z", status: "clean", cleaningType: "stayover", assignedUserId: 3 }
    ]
  };

  const res1 = resolveMaidCleaningForReservation(db1, "RES-LONG-14D");
  const passed1 = res1 &&
    res1.isStayover === true &&
    res1.cleaningRequest?.id === 13 &&
    res1.maidUser?.id === 3 &&
    res1.cleaningDate === "2026-11-13";
  report("1.1 Multiple stayovers in 14-day stay picks latest stayover (Day 13 Grazi)", passed1,
    `cleaningId=${res1?.cleaningRequest?.id}, maidId=${res1?.maidUser?.id}, isStayover=${res1?.isStayover}, date=${res1?.cleaningDate}`);
} catch (e) {
  report("1.1 Multiple stayovers in 14-day stay", false, e.message);
}

// Test 1.2: Same-day turnover where Guest A leaves at 11am and Guest B checks in at 2pm
try {
  const db2 = {
    users: [
      { id: 2, username: "Cris", name: "Cris", phone: "22988486446", whatsapp: "5522988486446", role: "camareira" },
      { id: 3, username: "Grazi", name: "Grazi", phone: "22999106204", whatsapp: "5522999106204", role: "camareira" }
    ],
    flats: [{ id: 1, number: "113" }],
    reservations: [
      { id: 101, code: "RES-GUEST-A", flatNumber: "113", checkinDate: "2026-11-01", checkoutDate: "2026-11-05", guestName: "Guest A" },
      { id: 102, code: "RES-GUEST-B", flatNumber: "113", checkinDate: "2026-11-05", checkoutDate: "2026-11-08", guestName: "Guest B" }
    ],
    cleaningRequests: [
      { id: 51, flatNumber: "113", requestDate: "2026-11-01", completedAt: "2026-11-01T11:30:00.000Z", status: "clean", cleaningType: "checkout", assignedUserId: 2, reservationCode: "RES-GUEST-A" },
      { id: 52, flatNumber: "113", requestDate: "2026-11-05", completedAt: "2026-11-05T12:30:00.000Z", status: "clean", cleaningType: "checkout", assignedUserId: 3, reservationCode: "RES-GUEST-B" }
    ]
  };

  const resA = resolveMaidCleaningForReservation(db2, "RES-GUEST-A");
  const resB = resolveMaidCleaningForReservation(db2, "RES-GUEST-B");

  const passedGuestA = resA && resA.cleaningRequest?.id === 51 && resA.maidUser?.id === 2 && resA.cleaningDate === "2026-11-01";
  const passedGuestB = resB && resB.cleaningRequest?.id === 52 && resB.maidUser?.id === 3 && resB.cleaningDate === "2026-11-05";

  report("1.2 Same-day turnover: Guest A gets Nov 01 prep (Cris), Guest B gets Nov 05 turnover (Grazi)", passedGuestA && passedGuestB,
    `GuestA: cleanId=${resA?.cleaningRequest?.id} maid=${resA?.maidUser?.name} | GuestB: cleanId=${resB?.cleaningRequest?.id} maid=${resB?.maidUser?.name}`);
} catch (e) {
  report("1.2 Same-day turnover", false, e.message);
}

// Test 1.3: Reservation with missing flat number but present in db.reservations
try {
  const db3 = {
    users: [{ id: 2, username: "Cris", name: "Cris", phone: "22988486446", role: "camareira" }],
    flats: [{ id: 4, number: "211" }],
    reservations: [{ id: 777, code: "RES-777", flatNumber: "211", checkinDate: "2026-11-02", checkoutDate: "2026-11-06" }],
    cleaningRequests: [{ id: 70, flatNumber: "211", requestDate: "2026-11-02", status: "clean", assignedUserId: 2 }]
  };

  const resObjMissing = resolveMaidCleaningForReservation(db3, { id: 777 });
  const resCodeMissing = resolveMaidCleaningForReservation(db3, "RES-777");

  const passed3 = resObjMissing && resObjMissing.cleaningRequest?.id === 70 && resObjMissing.maidUser?.id === 2 &&
                  resCodeMissing && resCodeMissing.cleaningRequest?.id === 70 && resCodeMissing.maidUser?.id === 2;
  report("1.3 Reservation with missing flat number resolved from db.reservations", passed3,
    `resObj: flat=${resObjMissing?.cleaningRequest?.flatNumber} maid=${resObjMissing?.maidUser?.name}`);
} catch (e) {
  report("1.3 Reservation with missing flat number", false, e.message);
}

// Test 1.4: Cleaning records with missing assignedUserId but present in db.maidStatementEntries or username match
try {
  const db4 = {
    users: [
      { id: 2, username: "Cris", name: "Cris", phone: "22988486446", role: "camareira" },
      { id: 3, username: "Grazi", name: "Grazi", phone: "22999106204", role: "camareira" }
    ],
    flats: [{ id: 7, number: "313" }, { id: 8, number: "314" }],
    reservations: [
      { id: 801, code: "RES-FALLBACK-STATEMENT", flatNumber: "313", checkinDate: "2026-11-03", checkoutDate: "2026-11-07" },
      { id: 802, code: "RES-FALLBACK-USERNAME", flatNumber: "314", checkinDate: "2026-11-04", checkoutDate: "2026-11-08" }
    ],
    cleaningRequests: [
      { id: 91, flatNumber: "313", requestDate: "2026-11-03", status: "clean", assignedUserId: null },
      { id: 92, flatNumber: "314", requestDate: "2026-11-04", status: "clean", assignedUserId: null, assignedUserName: "grazi" }
    ],
    maidStatementEntries: [
      { id: 1001, cleaningRequestId: 91, userId: 2, amount: 80 }
    ]
  };

  const resStatement = resolveMaidCleaningForReservation(db4, "RES-FALLBACK-STATEMENT");
  const resUsername = resolveMaidCleaningForReservation(db4, "RES-FALLBACK-USERNAME");

  const passed4A = resStatement && resStatement.maidUser?.id === 2 && resStatement.maidUser?.name === "Cris";
  const passed4B = resUsername && resUsername.maidUser?.id === 3 && resUsername.maidUser?.name === "Grazi";

  report("1.4 Missing assignedUserId resolved via statementEntries (Cris) & username match (Grazi)", passed4A && passed4B,
    `Statement Maid: ${resStatement?.maidUser?.name} (id=${resStatement?.maidUser?.id}) | Username Maid: ${resUsername?.maidUser?.name} (id=${resUsername?.maidUser?.id})`);
} catch (e) {
  report("1.4 Missing assignedUserId fallbacks", false, e.message);
}

// Test 1.5: Ignored cleanings (in_progress, instructionOnly, bedAdjustmentOnly)
try {
  const dbIgnored = {
    users: [{ id: 2, username: "Cris", name: "Cris", phone: "22988486446", role: "camareira" }],
    flats: [{ id: 1, number: "113" }],
    reservations: [{ id: 1, flatNumber: "113", checkinDate: "2026-11-05", checkoutDate: "2026-11-08" }],
    cleaningRequests: [
      { id: 1, flatNumber: "113", requestDate: "2026-11-05", status: "in_progress", assignedUserId: 2 },
      { id: 2, flatNumber: "113", requestDate: "2026-11-05", status: "clean", isInstructionOnly: true, assignedUserId: 2 },
      { id: 3, flatNumber: "113", requestDate: "2026-11-05", status: "clean", isBedAdjustmentOnly: true, assignedUserId: 2 },
      { id: 4, flatNumber: "113", requestDate: "2026-11-04", status: "clean", assignedUserId: 2 }
    ]
  };
  const res = resolveMaidCleaningForReservation(dbIgnored, 1);
  const passed = res && res.cleaningRequest?.id === 4;
  report("1.5 Ignored cleanings: skips in_progress, instructionOnly, bedAdjustmentOnly", passed, `selectedId=${res?.cleaningRequest?.id}`);
} catch (e) {
  report("1.5 Ignored cleanings", false, e.message);
}

// ==============================================================================
// CHALLENGE 2: triageSub5Review
// ==============================================================================
console.log("\n--- CHALLENGE 2: triageSub5Review ---");

// Sub-challenge 2.1: Subtle complaints
const subtleCases = [
  { text: "travesseiro com cheiro ruim", expectedForward: true, aspect: "enxoval / cheiro" },
  { text: "o piso estava pegajoso", expectedForward: true, aspect: "piso / sujeira" },
  { text: "banheiro com cabelo no ralo", expectedForward: true, aspect: "banheiro / ralo / cabelo" },
  { text: "amenities acabaram", expectedForward: true, aspect: "amenities" }
];

for (const sc of subtleCases) {
  try {
    const res = deterministicTriageSub5Review({ score: 3, comment: sc.text });
    const passed = res.forwardToMaid === sc.expectedForward && res.isCleaningRelated === sc.expectedForward;
    report(`2.1 Subtle complaint: "${sc.text}"`, passed,
      `forward=${res.forwardToMaid}, isCleaningRelated=${res.isCleaningRelated}, cat=${res.category}, aspects=${res.cleaningAspects.join("/") || "none"}`);
  } catch (e) {
    report(`2.1 Subtle complaint: "${sc.text}"`, false, e.message);
  }
}

// Sub-challenge 2.2: Non-maid complaints
const nonMaidCases = [
  { text: "Wi-Fi oscilando na reunião", expectedForward: false, cat: "non_maid_infrastructure" },
  { text: "porta emperrada", expectedForward: false, cat: "non_maid_infrastructure" },
  { text: "check-in demorado", expectedForward: false, cat: "non_maid_checkin_service" },
  { text: "elevador barulhento", expectedForward: false, cat: "non_maid_external_noise" }
];

for (const nmc of nonMaidCases) {
  try {
    const res = deterministicTriageSub5Review({ score: 2, comment: nmc.text });
    const passed = res.forwardToMaid === false && res.isCleaningRelated === false;
    report(`2.2 Non-maid complaint: "${nmc.text}"`, passed,
      `forward=${res.forwardToMaid}, isCleaningRelated=${res.isCleaningRelated}, cat=${res.category}, nonAspects=${res.nonCleaningAspects.join("/") || "none"}`);
  } catch (e) {
    report(`2.2 Non-maid complaint: "${nmc.text}"`, false, e.message);
  }
}

// Sub-challenge 2.3: Mixed complaints
const mixedCases = [
  { text: "Cama suja e internet ruim", expectedForward: true, expectedCat: "mixed" }
];

for (const mc of mixedCases) {
  try {
    const res = deterministicTriageSub5Review({ score: 2, comment: mc.text });
    const passed = res.forwardToMaid === true && res.isCleaningRelated === true && res.category === "mixed";
    report(`2.3 Mixed complaint: "${mc.text}"`, passed,
      `forward=${res.forwardToMaid}, cat=${res.category}, cleaningAspects=${res.cleaningAspects.join("/")}, nonCleaningAspects=${res.nonCleaningAspects.join("/")}`);
  } catch (e) {
    report(`2.3 Mixed complaint: "${mc.text}"`, false, e.message);
  }
}

// Sub-challenge 2.4: Sarcasm / Subtle phrasing
const sarcasmCases = [
  { text: "Adorei a toalha encardida (sqn)", expectedForward: true },
  { text: "O quarto estava um primor de limpeza, só esqueceram de lavar o banheiro", expectedForward: true }
];

for (const sarc of sarcasmCases) {
  try {
    const res = deterministicTriageSub5Review({ score: 1, comment: sarc.text });
    const passed = res.forwardToMaid === sarc.expectedForward && res.isCleaningRelated === sarc.expectedForward;
    report(`2.4 Sarcasm/Subtle phrasing: "${sarc.text}"`, passed,
      `forward=${res.forwardToMaid}, isCleaningRelated=${res.isCleaningRelated}, cat=${res.category}, aspects=${res.cleaningAspects.join("/") || "none"}`);
  } catch (e) {
    report(`2.4 Sarcasm/Subtle phrasing: "${sarc.text}"`, false, e.message);
  }
}

// Sub-challenge 2.5: Also test triageSub5Review with AI mock for intelligent nuances
console.log("\n--- CHALLENGE 2.5: triageSub5Review with AI Mock & Async invocation ---");
try {
  const aiMock = async ({ score, comment }) => {
    if (comment.includes("banheiro") || comment.includes("toalha") || comment.includes("pegajoso") || comment.includes("amenities")) {
      return {
        isCleaningRelated: true,
        category: "maid_cleaning",
        primaryResponsibility: "camareira",
        forwardToMaid: true,
        cleaningAspects: ["limpeza e governança"],
        nonCleaningAspects: [],
        explanation: "Identificado defeito de limpeza pelo Gemini AI."
      };
    }
    return {
      isCleaningRelated: false,
      category: "non_maid_infrastructure",
      primaryResponsibility: "hotel_gestao",
      forwardToMaid: false,
      cleaningAspects: [],
      nonCleaningAspects: ["infraestrutura"],
      explanation: "Sem itens de limpeza."
    };
  };

  const asyncRes1 = await triageSub5Review({
    score: 1,
    comment: "O quarto estava um primor de limpeza, só esqueceram de lavar o banheiro",
    aiClientMock: aiMock
  });
  const passedAsync1 = asyncRes1.forwardToMaid === true && asyncRes1.triageMethod === "gemini_llm";
  report("2.5 Async triageSub5Review with AI Mock on subtle irony", passedAsync1,
    `forward=${asyncRes1.forwardToMaid}, method=${asyncRes1.triageMethod}`);

  const asyncRes2 = await triageSub5Review({
    score: 5,
    comment: "Tudo perfeito!",
    aiClientMock: aiMock
  });
  const passedAsync2 = asyncRes2.forwardToMaid === true && asyncRes2.category === "maid_cleaning";
  report("2.5 Async triageSub5Review short-circuit for score 5", passedAsync2,
    `forward=${asyncRes2.forwardToMaid}, method=${asyncRes2.triageMethod}`);

  const asyncRes3 = await triageSub5Review({
    score: 3,
    comment: "",
    aiClientMock: aiMock
  });
  const passedAsync3 = asyncRes3.forwardToMaid === false;
  report("2.5 Async triageSub5Review short-circuit for sub-5 with empty comment", passedAsync3,
    `forward=${asyncRes3.forwardToMaid}`);

} catch (e) {
  report("2.5 Async triageSub5Review", false, e.message);
}

// ==============================================================================
// SUMMARY
// ==============================================================================
console.log("\n================================================================================");
const failed = results.filter(r => !r.passed);
console.log(`TOTAL CHECKS: ${results.length} | PASSED: ${results.length - failed.length} | FAILED: ${failed.length}`);
if (failed.length > 0) {
  console.log("FAILURES DETECTED:");
  failed.forEach(f => console.log(` - ${f.name}: ${f.detail}`));
}
console.log("================================================================================");

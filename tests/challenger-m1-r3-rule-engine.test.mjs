import assert from "node:assert/strict";
import test from "node:test";
import { matchClientPhone, isFaqApplicableToClient, cleanWhatsAppPhone } from "../artifacts/api-server/zapi-service.mjs";
import { matchClientPhone as matchScript, isFaqApplicableToClient as isFaqScript, cleanWhatsAppPhone as cleanScript } from "../scripts/zapi-service.mjs";

test("Challenger 1 M1-R3: Rule Engine & Edge Cases Stress", async (t) => {
  await t.test("1. Sub-8-digit edge cases for matchClientPhone", () => {
    const sub8Pairs = [
      ["123", "123"],
      ["", ""],
      ["1", "1"],
      ["12", "12"],
      ["1234", "1234"],
      ["12345", "12345"],
      ["123456", "123456"],
      ["1234567", "1234567"],
      ["0", "0"],
      ["0000000", "0000000"],
      ["!@#$%", "!@#$%"],
      ["abc", "abc"],
      ["---", "---"],
      ["123", "456"],
      ["123", null],
      [null, "123"],
      [undefined, undefined]
    ];

    for (const [a, b] of sub8Pairs) {
      assert.equal(matchClientPhone(a, b), false, `matchClientPhone('${a}', '${b}') should be false`);
      assert.equal(matchScript(a, b), false, `matchScript('${a}', '${b}') should be false`);
    }
  });

  await t.test("2. Non-object primitive inputs for isFaqApplicableToClient", () => {
    const primitiveInputs = [
      123,
      0,
      -1,
      "abc",
      "",
      true,
      false,
      null,
      undefined,
      NaN,
      Infinity,
      42n
    ];

    const testPhones = ["5522998505276", "22998505276", "", null, undefined];

    for (const prim of primitiveInputs) {
      for (const phone of testPhones) {
        assert.equal(
          isFaqApplicableToClient(prim, phone),
          false,
          `isFaqApplicableToClient(${typeof prim === 'bigint' ? '42n' : JSON.stringify(prim)}, ${JSON.stringify(phone)}) should be false`
        );
        assert.equal(
          isFaqScript(prim, phone),
          false,
          `isFaqScript(${typeof prim === 'bigint' ? '42n' : JSON.stringify(prim)}, ${JSON.stringify(phone)}) should be false`
        );
      }
    }
  });

  await t.test("3. Normal phone matching with Brazilian number formats & 9th digit", () => {
    const phoneFull = "5522998505276";
    const phoneNoDdi = "22998505276";
    const phoneNo9th = "552298505276";
    const phoneNoDdiNo9th = "2298505276";
    const phoneFormatted = "+55 (22) 99850-5276";
    const phoneSuffix = "5522998505276@c.us";

    const cluster = [phoneFull, phoneNoDdi, phoneNo9th, phoneNoDdiNo9th, phoneFormatted, phoneSuffix];

    for (const p1 of cluster) {
      for (const p2 of cluster) {
        assert.equal(matchClientPhone(p1, p2), true, `Cluster match failed between ${p1} and ${p2}`);
        assert.equal(matchScript(p1, p2), true, `Script cluster match failed between ${p1} and ${p2}`);
      }
    }

    // Different DDD must NOT match
    const diffDdd = "5521998505276";
    assert.equal(matchClientPhone(phoneFull, diffDdd), false);
    assert.equal(matchScript(phoneFull, diffDdd), false);

    // Different terminal digits must NOT match
    const diffTerminal = "5522998505277";
    assert.equal(matchClientPhone(phoneFull, diffTerminal), false);
    assert.equal(matchScript(phoneFull, diffTerminal), false);
  });

  await t.test("4. Exception scopes: 'all', 'exclude', 'include_only'", () => {
    const targetPhone = "5522998505276";
    const otherPhone = "5521999998888";

    // Scope 'all'
    const faqAll = { status: "ativo", scope: "all", question: "Q", answer: "A" };
    assert.equal(isFaqApplicableToClient(faqAll, targetPhone), true);
    assert.equal(isFaqApplicableToClient(faqAll, otherPhone), true);
    assert.equal(isFaqApplicableToClient(faqAll, null), true);

    // Scope 'exclude'
    const faqExclude = {
      status: "ativo",
      scope: "exclude",
      clientPhones: ["22998505276"], // without 55 DDI
      question: "Q",
      answer: "A"
    };
    // targetPhone matches exclusion list -> excluded -> false
    assert.equal(isFaqApplicableToClient(faqExclude, targetPhone), false);
    assert.equal(isFaqApplicableToClient(faqExclude, "22 99850-5276"), false);
    assert.equal(isFaqApplicableToClient(faqExclude, "+55 22 9850-5276"), false);
    // otherPhone is not excluded -> true
    assert.equal(isFaqApplicableToClient(faqExclude, otherPhone), true);
    // null client phone with exclude -> true (not on exclusion list)
    assert.equal(isFaqApplicableToClient(faqExclude, null), true);

    // Scope 'include_only'
    const faqInclude = {
      status: "ativo",
      scope: "include_only",
      clientPhones: ["5522998505276"],
      question: "Q",
      answer: "A"
    };
    // targetPhone is included -> true
    assert.equal(isFaqApplicableToClient(faqInclude, targetPhone), true);
    assert.equal(isFaqApplicableToClient(faqInclude, "2298505276"), true); // 8 digit variant
    // otherPhone is not included -> false
    assert.equal(isFaqApplicableToClient(faqInclude, otherPhone), false);
    // null client phone with include_only -> false
    assert.equal(isFaqApplicableToClient(faqInclude, null), false);

    // Empty include_only -> false for all
    const faqIncludeEmpty = {
      status: "ativo",
      scope: "include_only",
      clientPhones: [],
      question: "Q",
      answer: "A"
    };
    assert.equal(isFaqApplicableToClient(faqIncludeEmpty, targetPhone), false);
  });

  await t.test("5. FAQ Item status check", () => {
    const statuses = ["pendente", "aguardando_aprovacao", "inativo", "rejeitado"];
    for (const status of statuses) {
      const faq = { status, scope: "all", question: "Q", answer: "A" };
      assert.equal(isFaqApplicableToClient(faq, "5522998505276"), false, `Status ${status} should evaluate to false`);
    }
  });
});

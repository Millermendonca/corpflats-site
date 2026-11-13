import assert from "node:assert/strict";
import test from "node:test";
import { matchClientPhone, isFaqApplicableToClient } from "../artifacts/api-server/zapi-service.mjs";
import { matchClientPhone as matchScript, isFaqApplicableToClient as isFaqScript } from "../scripts/zapi-service.mjs";

test("Adversarial Harness: matchClientPhone & isFaqApplicableToClient", async (t) => {

  await t.test("1. Verificação de Paridade entre artifacts e scripts", () => {
    assert.equal(typeof matchClientPhone, "function");
    assert.equal(typeof matchScript, "function");
    assert.equal(typeof isFaqApplicableToClient, "function");
    assert.equal(typeof isFaqScript, "function");

    const samplePairs = [
      ["5522998505276", "22998505276"],
      ["552298505276", "5522998505276"],
      ["5521998505276", "5522998505276"],
      ["", "5522998505276"],
      [null, "5522998505276"]
    ];

    for (const [a, b] of samplePairs) {
      assert.equal(matchClientPhone(a, b), matchScript(a, b), `Mismatch between artifacts and scripts for ${a}, ${b}`);
    }
  });

  await t.test("2. Variações de Formato e Sanitização (DDI, DDD, pontuação, sufixos WhatsApp)", () => {
    const basePhone = "5522998505276";
    const validVariants = [
      "5522998505276",
      "22998505276",
      "+55 22 99850-5276",
      "+55 (22) 99850-5276",
      "5522998505276@c.us",
      "5522998505276@s.whatsapp.net",
      "022998505276",
      "005522998505276",
      "22 9 9850 5276",
      "55-22-99850-5276",
      "   5522998505276   "
    ];

    for (const v1 of validVariants) {
      for (const v2 of validVariants) {
        assert.equal(matchClientPhone(v1, v2), true, `Deveria casar: ${v1} com ${v2}`);
      }
    }
  });

  await t.test("3. Transição Brasileira 8 dígitos vs 9 dígitos em Múltiplos DDDs", () => {
    const ddds = ["11", "21", "22", "31", "41", "51", "61", "71", "81", "85", "91"];
    const terminal = "98505276"; // 8 dígitos

    for (const ddd of ddds) {
      const p8 = `55${ddd}${terminal}`;
      const p9 = `55${ddd}9${terminal}`;
      const p8_noddi = `${ddd}${terminal}`;
      const p9_noddi = `${ddd}9${terminal}`;

      assert.equal(matchClientPhone(p8, p9), true, `8 vs 9 dígitos para DDD ${ddd} com DDI`);
      assert.equal(matchClientPhone(p9, p8), true, `9 vs 8 dígitos para DDD ${ddd} com DDI`);
      assert.equal(matchClientPhone(p8_noddi, p9), true, `8 sem DDI vs 9 com DDI para DDD ${ddd}`);
      assert.equal(matchClientPhone(p8, p9_noddi), true, `8 com DDI vs 9 sem DDI para DDD ${ddd}`);
      assert.equal(matchClientPhone(p8_noddi, p9_noddi), true, `8 sem DDI vs 9 sem DDI para DDD ${ddd}`);
    }
  });

  await t.test("4. Blindagem Antitransbordo entre DDDs Distintos (Prevenção de Falso-Positivo)", () => {
    const terminal = "98505276";
    const ddds = ["11", "21", "22", "24", "27", "31", "41", "51", "81"];

    for (let i = 0; i < ddds.length; i++) {
      for (let j = 0; j < ddds.length; j++) {
        if (i === j) continue;
        const dddA = ddds[i];
        const dddB = ddds[j];

        const phoneA = `55${dddA}9${terminal}`;
        const phoneB = `55${dddB}9${terminal}`;
        assert.equal(
          matchClientPhone(phoneA, phoneB),
          false,
          `COLISÃO INDEVIDA entre DDD ${dddA} e DDD ${dddB} com mesmo terminal ${terminal}`
        );

        const phoneA8 = `55${dddA}${terminal}`;
        const phoneB8 = `55${dddB}${terminal}`;
        assert.equal(
          matchClientPhone(phoneA8, phoneB8),
          false,
          `COLISÃO INDEVIDA entre DDD ${dddA} e DDD ${dddB} no formato 8 dígitos`
        );
      }
    }
  });

  await t.test("5. Entradas Extremas, Nulas, Tipos Incorretos e Injeções Adversariais", () => {
    const invalidInputs = [
      null,
      undefined,
      "",
      "   ",
      "\n\t",
      "0",
      "000000",
      "123",
      "1234567",
      "abcdefgh",
      "xyz@c.us",
      "!@#$%^&*()_+",
      "{ \"$gt\": \"\" }",
      "5522.*",
      "' OR '1'='1",
      "<script>alert(1)</script>",
      [],
      {},
      true,
      false,
      NaN,
      Infinity
    ];

    const validPhone = "5522998505276";

    for (const inv of invalidInputs) {
      assert.equal(
        matchClientPhone(inv, validPhone),
        false,
        `Entrada inválida [${String(inv)}] não deve casar com telefone válido`
      );
      assert.equal(
        matchClientPhone(validPhone, inv),
        false,
        `Telefone válido não deve casar com entrada inválida [${String(inv)}]`
      );
      assert.equal(
        matchClientPhone(inv, inv),
        false,
        `Entrada inválida [${String(inv)}] não deve casar consigo mesma como telefone`
      );
    }
  });

  await t.test("6. isFaqApplicableToClient: Escopo 'all' (Padrão)", () => {
    const faq = { id: "faq-test", question: "Wi-fi?", answer: "corpflats", scope: "all", status: "ativo" };

    assert.equal(isFaqApplicableToClient(faq, "5522998505276"), true);
    assert.equal(isFaqApplicableToClient(faq, "21999998888"), true);
    assert.equal(isFaqApplicableToClient(faq, null), true);
    assert.equal(isFaqApplicableToClient(faq, ""), true);
    assert.equal(isFaqApplicableToClient(faq, undefined), true);

    // Escopo omitido deve assumir "all"
    const faqNoScope = { id: "faq-test", question: "Wi-fi?", answer: "corpflats", status: "ativo" };
    assert.equal(isFaqApplicableToClient(faqNoScope, "5522998505276"), true);
    assert.equal(isFaqApplicableToClient(faqNoScope, null), true);
  });

  await t.test("7. isFaqApplicableToClient: Escopo 'exclude' (Lista Negra)", () => {
    const faq = {
      id: "faq-exclude",
      question: "Early checkin gratuito?",
      answer: "Apenas reservas diretas",
      scope: "exclude",
      clientPhones: ["5521999990001", "21999990002", "5522988486446"],
      status: "ativo"
    };

    // Clientes na lista negra devem ser bloqueados em qualquer formatação
    assert.equal(isFaqApplicableToClient(faq, "5521999990001"), false);
    assert.equal(isFaqApplicableToClient(faq, "21999990001"), false);
    assert.equal(isFaqApplicableToClient(faq, "+55 (21) 99999-0001"), false);
    assert.equal(isFaqApplicableToClient(faq, "5521999990002@c.us"), false);
    assert.equal(isFaqApplicableToClient(faq, "22988486446"), false);

    // Clientes fora da lista negra devem ser aceitos
    assert.equal(isFaqApplicableToClient(faq, "5522998505276"), true);
    assert.equal(isFaqApplicableToClient(faq, "5511999999999"), true);

    // Cliente nulo/indefinido não está na lista negra -> deve ser aceito
    assert.equal(isFaqApplicableToClient(faq, null), true);
    assert.equal(isFaqApplicableToClient(faq, ""), true);

    // Lista negra vazia -> ninguém excluído, todos passam
    const faqEmptyExclude = { ...faq, clientPhones: [] };
    assert.equal(isFaqApplicableToClient(faqEmptyExclude, "5521999990001"), true);
  });

  await t.test("8. isFaqApplicableToClient: Escopo 'include_only' (Lista Branca / VIP)", () => {
    const faq = {
      id: "faq-vip",
      question: "Desconto especial VIP?",
      answer: "Sim, 20% off",
      scope: "include_only",
      clientPhones: ["5522998505276", "22988486446"],
      status: "ativo"
    };

    // Clientes autorizados passam
    assert.equal(isFaqApplicableToClient(faq, "5522998505276"), true);
    assert.equal(isFaqApplicableToClient(faq, "22998505276"), true);
    assert.equal(isFaqApplicableToClient(faq, "+55 (22) 99850-5276"), true);
    assert.equal(isFaqApplicableToClient(faq, "5522988486446"), true);

    // Clientes não autorizados são bloqueados
    assert.equal(isFaqApplicableToClient(faq, "5521999990001"), false);
    assert.equal(isFaqApplicableToClient(faq, "5511988887777"), false);

    // Cliente nulo/vazio é bloqueado em include_only
    assert.equal(isFaqApplicableToClient(faq, null), false);
    assert.equal(isFaqApplicableToClient(faq, ""), false);
    assert.equal(isFaqApplicableToClient(faq, undefined), false);

    // Fail-safe: include_only com lista vazia deve bloquear todos
    const faqEmptyInclude = { ...faq, clientPhones: [] };
    assert.equal(isFaqApplicableToClient(faqEmptyInclude, "5522998505276"), false);
  });

  await t.test("9. isFaqApplicableToClient: Suporte a clientPhones como String Delimitada", () => {
    const faqStringPhones = {
      id: "faq-str",
      question: "Regra restrita?",
      answer: "Ok",
      scope: "include_only",
      clientPhones: "5522998505276, 21999990001; +55 (22) 98848-6446\n5511988887777",
      status: "ativo"
    };

    assert.equal(isFaqApplicableToClient(faqStringPhones, "5522998505276"), true);
    assert.equal(isFaqApplicableToClient(faqStringPhones, "21999990001"), true);
    assert.equal(isFaqApplicableToClient(faqStringPhones, "22988486446"), true);
    assert.equal(isFaqApplicableToClient(faqStringPhones, "11988887777"), true);
    assert.equal(isFaqApplicableToClient(faqStringPhones, "5521988889999"), false);
  });

  await t.test("10. isFaqApplicableToClient: Status Não-Ativo Bloqueia Automaticamente", () => {
    const statuses = ["pendente", "aguardando_aprovacao", "inativo", "arquivado", "draft"];

    for (const st of statuses) {
      const faq = {
        id: `faq-${st}`,
        question: "Dúvida?",
        answer: "Resposta",
        scope: "all",
        status: st
      };
      assert.equal(
        isFaqApplicableToClient(faq, "5522998505276"),
        false,
        `Item com status [${st}] deve ser rejeitado`
      );
    }
  });

  await t.test("11. isFaqApplicableToClient: Itens Nulos ou Malformados", () => {
    assert.equal(isFaqApplicableToClient(null, "5522998505276"), false);
    assert.equal(isFaqApplicableToClient(undefined, "5522998505276"), false);
    assert.equal(isFaqApplicableToClient("", "5522998505276"), false);
    assert.equal(isFaqApplicableToClient(123, "5522998505276"), false);
  });
});

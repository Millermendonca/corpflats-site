import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { 
  findReservationByPhone, 
  findAllReservationsByPhone, 
  resolveWhatsAppTags, 
  DEFAULT_WHATSAPP_TEMPLATES 
} from "../scripts/zapi-service.mjs";

test("RES-605-0398 Payment, Same-Day Dispatch & Phone Matching Suite", async (t) => {
  // 1. Verificação de paridade total entre scripts e artifacts
  await t.test("1. Byte-by-byte file parity between scripts and artifacts/api-server", () => {
    const demoServerScript = fs.readFileSync("scripts/demo-server.mjs");
    const demoServerArtifact = fs.readFileSync("artifacts/api-server/demo-server.mjs");
    assert.strictEqual(demoServerScript.equals(demoServerArtifact), true, "scripts/demo-server.mjs and artifacts/api-server/demo-server.mjs must be identical byte-by-byte");

    const zapiScript = fs.readFileSync("scripts/zapi-service.mjs");
    const zapiArtifact = fs.readFileSync("artifacts/api-server/zapi-service.mjs");
    assert.strictEqual(zapiScript.equals(zapiArtifact), true, "scripts/zapi-service.mjs and artifacts/api-server/zapi-service.mjs must be identical byte-by-byte");
  });

  // 2. Matcher findReservationByPhone prioriza extensão ativa sobre reserva que faz checkout hoje
  await t.test("2. findReservationByPhone picks extension RES-605-0398 over checking-out RES-605-0390", () => {
    const now = new Date();
    const brasiliaFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const todayStr = brasiliaFormatter.format(now);
    
    // Data futura para checkout da extensão
    const futureDate = new Date(now.getTime() + 4 * 24 * 3600 * 1000);
    const futureStr = brasiliaFormatter.format(futureDate);

    // Data passada para checkin da reserva anterior
    const pastDate = new Date(now.getTime() - 5 * 24 * 3600 * 1000);
    const pastStr = brasiliaFormatter.format(pastDate);

    const testDb = {
      reservations: [
        {
          id: 390,
          code: "RES-605-0390",
          flatNumber: "605",
          guestName: "Miller Mendonça Pessanha",
          guestPhone: "5522998505276",
          status: "confirmada",
          checkinDate: pastStr,
          checkoutDate: todayStr, // Checkout HOJE
          paymentStatus: "pago_total",
          totalAmount: 1200,
          paidAmount: 1200
        },
        {
          id: 398,
          code: "RES-605-0398",
          flatNumber: "605",
          guestName: "Miller Mendonça Pessanha",
          guestPhone: "5522998505276",
          status: "confirmada",
          checkinDate: todayStr, // Check-in HOJE
          checkoutDate: futureStr, // Continua além de hoje
          paymentStatus: "pago_total",
          totalAmount: 1500,
          paidAmount: 1500
        }
      ]
    };

    const bestRes = findReservationByPhone(testDb, "5522998505276");
    assert.ok(bestRes, "Deve encontrar reserva correspondente");
    assert.strictEqual(bestRes.code, "RES-605-0398", "A extensão RES-605-0398 deve ser escolhida no lugar da reserva que sai hoje");
  });

  // 3. Critérios de desempate em activeToday: confirmada > pré-reserva, staysBeyond > checkout hoje, maior checkout, maior ID
  await t.test("3. activeToday sorting criteria precedence (confirmed > pre_reserva, staysBeyond, checkoutDate, id)", () => {
    const now = new Date();
    const brasiliaFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const todayStr = brasiliaFormatter.format(now);
    const futureStr1 = "2029-12-01";
    const futureStr2 = "2029-12-05";

    // Subcaso A: Confirmada ganha de pré-reserva mesmo se pré-reserva tiver checkout maior
    const dbPreVsConf = {
      reservations: [
        {
          id: 100,
          code: "RES-PRE-001",
          guestPhone: "22999990001",
          status: "pre_reserva",
          checkinDate: todayStr,
          checkoutDate: futureStr2
        },
        {
          id: 101,
          code: "RES-CONF-001",
          guestPhone: "22999990001",
          status: "confirmada",
          checkinDate: todayStr,
          checkoutDate: futureStr1
        }
      ]
    };
    assert.strictEqual(findReservationByPhone(dbPreVsConf, "22999990001").code, "RES-CONF-001");

    // Subcaso B: Ambas confirmadas, checkout maior ganha
    const dbCheckoutDate = {
      reservations: [
        {
          id: 102,
          code: "RES-SHORT-001",
          guestPhone: "22999990002",
          status: "confirmada",
          checkinDate: todayStr,
          checkoutDate: futureStr1
        },
        {
          id: 103,
          code: "RES-LONG-001",
          guestPhone: "22999990002",
          status: "confirmada",
          checkinDate: todayStr,
          checkoutDate: futureStr2
        }
      ]
    };
    assert.strictEqual(findReservationByPhone(dbCheckoutDate, "22999990002").code, "RES-LONG-001");

    // Subcaso C: Mesmas datas, maior ID ganha
    const dbId = {
      reservations: [
        {
          id: 104,
          code: "RES-OLD-001",
          guestPhone: "22999990003",
          status: "confirmada",
          checkinDate: todayStr,
          checkoutDate: futureStr1
        },
        {
          id: 105,
          code: "RES-NEW-001",
          guestPhone: "22999990003",
          status: "confirmada",
          checkinDate: todayStr,
          checkoutDate: futureStr1
        }
      ]
    };
    assert.strictEqual(findReservationByPhone(dbId, "22999990003").code, "RES-NEW-001");
  });

  // 4. tpl_sameday_reservation_instructions possui linha de status de pagamento e resolve tags
  await t.test("4. tpl_sameday_reservation_instructions includes status_pagamento and resolves correctly", () => {
    const tpl = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_sameday_reservation_instructions");
    assert.ok(tpl, "Template tpl_sameday_reservation_instructions deve existir");
    assert.ok(tpl.message.includes("• Pagamento: *{{status_pagamento}}*"), "Mensagem deve conter a linha de status de pagamento");

    const sampleRes = {
      id: 398,
      code: "RES-605-0398",
      flatNumber: "605",
      guestName: "Miller Mendonça",
      guestPhone: "5522998505276",
      status: "confirmada",
      checkinDate: "2026-10-11",
      checkoutDate: "2026-10-15",
      paymentStatus: "pago_total",
      totalAmount: 1500,
      paidAmount: 1500
    };

    const resolved = resolveWhatsAppTags(tpl.message, sampleRes, {}, "https://corpflats.onrender.com");
    assert.ok(resolved.includes("• Pagamento: *Confirmado / Pago (100%)*"), "Deve resolver status_pagamento para Confirmado / Pago (100%)");
  });

  // 5. isConfirmationAlreadyDispatched não bloqueia payment_confirmed após sameday_reservation
  await t.test("5. isConfirmationAlreadyDispatched ignores sameday_reservation triggerEvent", () => {
    const demoServerCode = fs.readFileSync("scripts/demo-server.mjs", "utf8");
    const fnStart = demoServerCode.indexOf("function isConfirmationAlreadyDispatched(r)");
    assert.ok(fnStart > 0, "isConfirmationAlreadyDispatched deve existir");
    const fnBody = demoServerCode.substring(fnStart, fnStart + 600);
    assert.strictEqual(fnBody.includes("h.triggerEvent === \"sameday_reservation\""), false, "sameday_reservation não pode ser tratado como confirmação em isConfirmationAlreadyDispatched");
  });

  // 6. ensurePaymentConfirmationDispatched dispara payment_confirmed e garante sameday_reservation se check-in no mesmo dia após as 07:01
  await t.test("6. ensurePaymentConfirmationDispatched sends payment receipt and guarantees sameday_reservation", () => {
    const demoServerCode = fs.readFileSync("scripts/demo-server.mjs", "utf8");
    const start = demoServerCode.indexOf("function ensurePaymentConfirmationDispatched(");
    assert.ok(start >= 0, "ensurePaymentConfirmationDispatched deve existir");
    let i = demoServerCode.indexOf(") {", start) + 2;
    let depth = 0;
    for (; i < demoServerCode.length; i++) {
      if (demoServerCode[i] === "{") depth++;
      else if (demoServerCode[i] === "}") { depth--; if (depth === 0) break; }
    }
    const fnBody = demoServerCode.substring(start, i + 1);

    const paymentConfirmedIdx = fnBody.indexOf('"payment_confirmed"');
    const samedayIdx = fnBody.indexOf('"sameday_reservation"');
    assert.ok(paymentConfirmedIdx > 0, "Disparo de payment_confirmed deve estar presente");
    assert.ok(samedayIdx > 0, "Disparo de sameday_reservation deve estar presente");
    assert.ok(paymentConfirmedIdx < samedayIdx, "payment_confirmed deve ser disparado antes do sameday_reservation garantido");
  });

  // 7. Preview de automações reconhece pago_total e quita saldo restante
  await t.test("7. Preview tags in whatsapp-automation.tsx handle pago_total properly", () => {
    const autoCode = fs.readFileSync("artifacts/limpeza/src/pages/whatsapp-automation.tsx", "utf8");
    assert.ok(autoCode.includes('targetRes.paymentStatus === "pago_total"'), "whatsapp-automation.tsx deve verificar pago_total");
    assert.ok(autoCode.includes('isPaidInFull ? 0 : Math.max(0, totalAmount - paidAmount)'), "whatsapp-automation.tsx deve zerar pendente quando quitado");
  });

  // 8. Frontend chat possui helpers de pagamento, status de reserva e ativação no dossiê
  await t.test("8. Frontend chat in whatsapp-chat.tsx includes helpers and dossier activation button", () => {
    const chatCode = fs.readFileSync("artifacts/limpeza/src/pages/whatsapp-chat.tsx", "utf8");
    assert.ok(chatCode.includes("function getPaymentInfo"), "Deve conter helper getPaymentInfo");
    assert.ok(chatCode.includes("function getReservationStatusInfo"), "Deve conter helper getReservationStatusInfo");
    assert.ok(chatCode.includes("Ativar no Dossiê"), "Deve conter botão Ativar no Dossiê");
    assert.ok(chatCode.includes("selectedResCode"), "Deve conter estado selectedResCode");
    assert.ok(chatCode.includes("?reservationCode="), "Deve passar reservationCode na busca de conversas");
  });
});

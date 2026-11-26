import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  resolveWhatsAppTags,
  renderTemplateButtons,
  sendZapiMessage
} from "../scripts/zapi-service.mjs";

describe("Achados e Perdidos - Notificação WhatsApp com Foto Real e Botão Interativo", () => {
  test("Garante paridade de bytes 100% (SHA-256) entre scripts/ e artifacts/api-server/", () => {
    const hash = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

    const hashDemo1 = hash(path.resolve("scripts/demo-server.mjs"));
    const hashDemo2 = hash(path.resolve("artifacts/api-server/demo-server.mjs"));
    assert.strictEqual(hashDemo1, hashDemo2, "scripts/demo-server.mjs e artifacts/api-server/demo-server.mjs devem ter o mesmo hash SHA-256");

    const hashZapi1 = hash(path.resolve("scripts/zapi-service.mjs"));
    const hashZapi2 = hash(path.resolve("artifacts/api-server/zapi-service.mjs"));
    assert.strictEqual(hashZapi1, hashZapi2, "scripts/zapi-service.mjs e artifacts/api-server/zapi-service.mjs devem ter o mesmo hash SHA-256");
  });

  test("Template tpl_lost_item_registered é limpo (sem URL de foto nem link wa.me no corpo) e usa botão interativo", () => {
    const template = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_lost_item_registered");
    assert.ok(template, "Template tpl_lost_item_registered deve existir em DEFAULT_WHATSAPP_TEMPLATES");
    assert.ok(template.message.includes("{{nome_camareira}}"), "Template deve conter {{nome_camareira}}");
    assert.ok(!template.message.includes("{{foto_item}}"), "Corpo da mensagem não deve conter link de foto {{foto_item}}");
    assert.ok(!template.message.includes("{{link_whatsapp_camareira}}"), "Corpo da mensagem não deve conter link cru {{link_whatsapp_camareira}}");
    assert.ok(!template.message.includes("Link direto:"), "Corpo da mensagem não deve exibir linha de Link direto");
    assert.ok(Array.isArray(template.buttons) && template.buttons.length === 1, "Deve possuir botão interativo para falar com a camareira");
    assert.strictEqual(template.buttons[0].type, "URL");
    assert.strictEqual(template.buttons[0].url, "{{link_whatsapp_camareira}}");
  });

  test("resolveWhatsAppTags resolve local_no_quarto, limpa foto_item e resolve botão wa.me da camareira", () => {
    const template = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_lost_item_registered");
    const context = {
      guestName: "Fernanda Silva",
      flatNumber: "305",
      description: "Carregador Apple branco",
      locationInRoom: "Mesa de cabeceira",
      photoUrl: "https://pub-b6324a98d1d943eda4e7285b5d23a963.r2.dev/lost_items/foto.jpg",
      maidName: "Grazi",
      maidPhone: "5522999106204"
    };

    const text = resolveWhatsAppTags(template.message, context);
    const buttons = renderTemplateButtons(template.buttons, context, {}, "https://corpflats.com.br", "guest", template);

    assert.ok(text.includes("Fernanda"), "Deve conter o primeiro nome do hóspede");
    assert.ok(text.includes("*Flat 305* (Mesa de cabeceira)"), "Deve conter o flat e o local no quarto");
    assert.ok(text.includes("Carregador Apple branco"), "Deve conter a descrição do item");
    assert.ok(text.includes("Grazi"), "Deve conter o nome da camareira");
    assert.ok(!text.includes("https://"), "Texto principal deve ficar limpo, sem nenhum link https://");
    assert.ok(!text.includes("r2.dev"), "Texto principal não deve conter URL da foto");
    assert.strictEqual(buttons.length, 1);
    assert.strictEqual(buttons[0].url, "https://wa.me/5522999106204");
  });

  test("sendZapiMessage envia a foto real embutida em /send-button-actions junto com o botão da camareira", async () => {
    const capturedRequests = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts = {}) => {
      capturedRequests.push({
        url: String(url),
        body: opts.body ? JSON.parse(opts.body) : null
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({ zaapId: "zaap_test_123", messageId: "msg_test_123" })
      };
    };

    try {
      const samplePhotoBase64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/";
      const maidUrl = "https://wa.me/5522988486446?text=Ol%C3%A1%2C%20Cris!";
      const res = await sendZapiMessage(
        {
          instanceId: "test-instance",
          token: "test-token",
          baseUrl: "https://api.z-api.io",
          deliveryMode: "text_links" // Garante que sendMode: "buttons" sobrepõe deliveryMode legado
        },
        {
          phone: "5521999887766",
          message: "Olá, *Roberto*! Tudo bem?\n\n📦 *Item encontrado:* Relógio prata\n👩‍💼 *Encontrado e guardado por:* Cris",
          footer: "CorpFlats • Governança & Hospitalidade",
          buttons: [{ id: "btn_contact_maid", type: "URL", label: "💬 Falar com Cris", url: maidUrl }],
          sendMode: "buttons",
          image: "https://pub-example.r2.dev/lost_items/relogio.jpg",
          imageBase64: samplePhotoBase64,
          channelId: "stay_operations",
          recipientRole: "guest",
          triggerEvent: "lost_item_registered",
          bypassTestMode: true
        }
      );

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.method, "buttons");
      assert.strictEqual(res.hasImage, true);
      assert.strictEqual(capturedRequests.length, 1);
      assert.ok(capturedRequests[0].url.endsWith("/send-button-actions"));
      assert.strictEqual(capturedRequests[0].body.image, samplePhotoBase64);
      assert.ok(!capturedRequests[0].body.message.includes("http"), "Corpo enviado à Z-API não contém links crus");
      assert.strictEqual(capturedRequests[0].body.buttonActions.length, 1);
      assert.strictEqual(capturedRequests[0].body.buttonActions[0].type, "URL");
      assert.strictEqual(capturedRequests[0].body.buttonActions[0].label, "💬 Falar com Cris");
      assert.strictEqual(capturedRequests[0].body.buttonActions[0].url, maidUrl);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("sendZapiMessage envia a foto via /send-image caso a Z-API recuse imagem no cabeçalho de /send-button-actions", async () => {
    const capturedRequests = [];
    const originalFetch = globalThis.fetch;
    let attempt = 0;
    globalThis.fetch = async (url, opts = {}) => {
      attempt++;
      const parsedBody = opts.body ? JSON.parse(opts.body) : null;
      capturedRequests.push({ url: String(url), body: parsedBody });
      if (attempt === 1 && String(url).endsWith("/send-button-actions") && parsedBody?.image) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: "Header image rejected" })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ zaapId: `zaap_fallback_${attempt}`, messageId: `msg_fallback_${attempt}` })
      };
    };

    try {
      const samplePhotoBase64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/";
      const res = await sendZapiMessage(
        {
          instanceId: "test-instance",
          token: "test-token",
          baseUrl: "https://api.z-api.io"
        },
        {
          phone: "5521999887766",
          message: "📦 *Item encontrado:* Óculos de sol",
          buttons: [{ id: "btn_contact_maid", type: "URL", label: "💬 Falar com Cris", url: "https://wa.me/5522988486446" }],
          sendMode: "buttons",
          imageBase64: samplePhotoBase64,
          channelId: "stay_operations",
          recipientRole: "guest",
          triggerEvent: "lost_item_registered",
          bypassTestMode: true
        }
      );

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.hasImage, true);
      assert.strictEqual(capturedRequests.length, 3);
      assert.ok(capturedRequests[0].url.endsWith("/send-button-actions") && Boolean(capturedRequests[0].body.image));
      assert.ok(capturedRequests[1].url.endsWith("/send-button-actions") && !capturedRequests[1].body.image);
      assert.ok(capturedRequests[2].url.endsWith("/send-image") && capturedRequests[2].body.image === samplePhotoBase64);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

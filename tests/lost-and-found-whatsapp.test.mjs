import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { 
  DEFAULT_WHATSAPP_TEMPLATES, 
  resolveWhatsAppTags 
} from "../scripts/zapi-service.mjs";

describe("Achados e Perdidos - Notificação WhatsApp com Contato da Camareira", () => {
  test("Garante paridade de bytes 100% (SHA-256) entre scripts/ e artifacts/api-server/", () => {
    const hash = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

    const hashDemo1 = hash(path.resolve("scripts/demo-server.mjs"));
    const hashDemo2 = hash(path.resolve("artifacts/api-server/demo-server.mjs"));
    assert.strictEqual(hashDemo1, hashDemo2, "scripts/demo-server.mjs e artifacts/api-server/demo-server.mjs devem ter o mesmo hash SHA-256");

    const hashZapi1 = hash(path.resolve("scripts/zapi-service.mjs"));
    const hashZapi2 = hash(path.resolve("artifacts/api-server/zapi-service.mjs"));
    assert.strictEqual(hashZapi1, hashZapi2, "scripts/zapi-service.mjs e artifacts/api-server/zapi-service.mjs devem ter o mesmo hash SHA-256");
  });

  test("Template tpl_lost_item_registered existe e contém tags da camareira", () => {
    const template = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_lost_item_registered");
    assert.ok(template, "Template tpl_lost_item_registered deve existir em DEFAULT_WHATSAPP_TEMPLATES");
    assert.ok(template.message.includes("{{nome_camareira}}"), "Template deve conter {{nome_camareira}}");
    assert.ok(template.message.includes("{{whatsapp_camareira}}"), "Template deve conter {{whatsapp_camareira}}");
    assert.ok(template.message.includes("{{link_whatsapp_camareira}}"), "Template deve conter {{link_whatsapp_camareira}}");
  });

  test("resolveWhatsAppTags resolve corretamente tags do item e da camareira", () => {
    const rawTemplate = "Olá {{nome_hospede}}, esquecido no Flat {{quarto}}: {{descricao_item}}{{local_no_quarto}}. Contato da camareira {{nome_camareira}}: {{whatsapp_camareira}} ou {{link_whatsapp_camareira}}";
    
    const context = {
      guestName: "Roberto Carlos",
      flatNumber: "204",
      description: "Relógio dourado",
      locationInRoom: "Criado-mudo",
      maidName: "Cris",
      maidPhone: "5522988486446"
    };

    const resolved = resolveWhatsAppTags(rawTemplate, context);

    assert.ok(resolved.includes("Roberto Carlos"), "Deve conter o nome do hóspede");
    assert.ok(resolved.includes("Flat 204"), "Deve conter o flat");
    assert.ok(resolved.includes("Relógio dourado"), "Deve conter a descrição do item");
    assert.ok(resolved.includes("Criado-mudo"), "Deve conter o local");
    assert.ok(resolved.includes("Cris"), "Deve conter o nome da camareira");
    assert.ok(resolved.includes("5522988486446"), "Deve conter o whatsapp da camareira");
    assert.ok(resolved.includes("https://wa.me/5522988486446"), "Deve conter o link direto da camareira");
  });

  test("Garante formatação de mensagem com botão direto para WhatsApp da camareira", () => {
    const template = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_lost_item_registered");
    const context = {
      guestName: "Fernanda Silva",
      flatNumber: "305",
      description: "Carregador Apple branco",
      locationInRoom: "Mesa de cabeceira",
      maidName: "Grazi",
      maidPhone: "5522999106204"
    };

    const text = resolveWhatsAppTags(template.message, context);

    assert.ok(text.includes("Fernanda Silva"), "Deve conter o nome do hóspede");
    assert.ok(text.includes("305"), "Deve conter o flat");
    assert.ok(text.includes("Carregador Apple branco"), "Deve conter a descrição do item");
    assert.ok(text.includes("Grazi"), "Deve conter o nome da camareira");
    assert.ok(text.includes("5522999106204"), "Deve conter o whatsapp da camareira");
    assert.ok(text.includes("https://wa.me/5522999106204"), "Deve conter o link wa.me");
  });
});

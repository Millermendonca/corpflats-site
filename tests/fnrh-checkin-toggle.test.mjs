/**
 * Authoritative Acceptance Test Suite: FNRH SERPRO Gov.br Check-in Provider Toggle & Resilient Link Unification
 * File: tests/fnrh-checkin-toggle.test.mjs
 * 
 * Validates all 4 Acceptance Criteria points:
 * - AC 1 (Alternância e Persistência): Toggle no painel/API de configurações alterna entre 'proprio' e 'gov_fnrh'
 *   com persistência imediata no banco de dados e resposta JSON confirmando o estado. A alteração reflete
 *   instantaneamente em rotas subsequentes sem reiniciar o servidor.
 * - AC 2 (Geração de Links Dinâmicos): No modo 'proprio', getCheckinUrl retorna URL contendo /pre-checkin/:code.
 *   No modo 'gov_fnrh' com reserva registrada no SERPRO, retorna a URL oficial do Gov.br (https://fnrh.turismo.gov.br/precheckin/...).
 *   Em caso de falha simulada ou timeout (>5s) da API SERPRO, getCheckinUrl aplica o fallback sem lançar exceção,
 *   retornando a URL própria, gravando log de auditoria FNRH_SERPRO_FALLBACK e alerta na recepção.
 * - AC 3 (Canais de Comunicação): Disparos de WhatsApp (mensagens e botões de ação) e e-mails enviam o link correto
 *   conforme a chave ativa e fallback.
 * - AC 4 (Ações de Interface): Copiar Link no painel copia a URL condizente com a chave ativa.
 * - Suite 5: Verificação de Paridade Estrita dos 5 pares de arquivos espelho e verificação de sintaxe Node.js.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 3998;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-fnrh-toggle-db-${Date.now()}.json`);

let serverProcess = null;

const adminToken = Buffer.from(JSON.stringify({ v: 2, id: 1 })).toString("base64");
const adminHeaders = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${adminToken}`
};

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Lifecycle: Isolated Server Spawning & Cleanup
// ─────────────────────────────────────────────────────────────────────────────
before(async () => {
  // 1. Prepare isolated test database
  const initialDb = JSON.parse(fs.readFileSync(prodDbPath, "utf-8"));
  initialDb.settings = initialDb.settings || {};
  initialDb.settings.checkinProvider = "proprio";
  initialDb.settings.serproConfig = {
    env: "homologacao",
    mock: true,
    user: "test-user",
    password: "test-password",
    cpfSolicitante: "12585736792"
  };
  initialDb.auditLogs = [];
  initialDb.notifications = [];
  fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

  // 2. Spawn live demo-server instance on isolated port
  serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      NODE_ENV: "test",
      DATABASE_URL: "",
      DATABASE_FILE: isolatedDbPath,
      SERPRO_MOCK: "true"
    },
    stdio: "pipe"
  });

  // 3. Wait for live test server to become ready
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/settings`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 250));
  }
  assert.ok(ready, `Live demo-server failed to bind to port ${TEST_PORT} within timeout`);
});

after(() => {
  if (serverProcess?.pid) {
    killProcessTree(serverProcess.pid);
  }
  if (fs.existsSync(isolatedDbPath)) {
    try { fs.unlinkSync(isolatedDbPath); } catch (_) {}
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: AC 1 — Alternância e Persistência (Provider Toggling & Live Persistence)
// ─────────────────────────────────────────────────────────────────────────────
describe("AC 1: Alternância e Persistência do Provedor de Check-in", () => {
  it("1.1 GET /api/settings retorna estado inicial 'proprio' por padrão", async () => {
    const res = await fetch(`${BASE_URL}/api/settings`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.checkinProvider, "proprio");
  });

  it("1.2 PATCH /api/settings alterna para 'gov_fnrh' com resposta JSON imediata confirmando o estado", async () => {
    const patchRes = await fetch(`${BASE_URL}/api/settings`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ checkinProvider: "gov_fnrh" })
    });
    assert.strictEqual(patchRes.status, 200);
    const updated = await patchRes.json();
    assert.strictEqual(updated.checkinProvider, "gov_fnrh");
  });

  it("1.3 Persistência imediata no banco de dados físico em disco sem atrasos", async () => {
    assert.ok(fs.existsSync(isolatedDbPath), "O arquivo de banco isolado deve existir");
    const diskContent = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
    assert.strictEqual(
      diskContent.settings.checkinProvider,
      "gov_fnrh",
      "O valor persistido em disco deve ser 'gov_fnrh' imediatamente após o PATCH"
    );
  });

  it("1.4 Alteração reflete instantaneamente em rotas subsequentes sem reiniciar o servidor", async () => {
    const getRes = await fetch(`${BASE_URL}/api/settings`);
    assert.strictEqual(getRes.status, 200);
    const data = await getRes.json();
    assert.strictEqual(data.checkinProvider, "gov_fnrh");

    // Rota de status SERPRO reflete o provedor ativo 'gov_fnrh'
    const statusRes = await fetch(`${BASE_URL}/api/fnrh-serpro/status`);
    assert.strictEqual(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.strictEqual(statusData.provider, "gov_fnrh");
  });

  it("1.5 PATCH /api/settings alterna de volta para 'proprio' com persistência imediata", async () => {
    const patchRes = await fetch(`${BASE_URL}/api/settings`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ checkinProvider: "proprio" })
    });
    assert.strictEqual(patchRes.status, 200);
    const updated = await patchRes.json();
    assert.strictEqual(updated.checkinProvider, "proprio");

    const diskContent = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
    assert.strictEqual(diskContent.settings.checkinProvider, "proprio");
  });

  it("1.6 Validação de integridade: rejeita valores inválidos com HTTP 400 e preserva estado atual", async () => {
    const badRes = await fetch(`${BASE_URL}/api/settings`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ checkinProvider: "provedor_invalido_xyz" })
    });
    assert.strictEqual(badRes.status, 400);
    const err = await badRes.json();
    assert.ok(err.error.includes("checkinProvider inválido"));

    // O estado permanece inalterado ('proprio')
    const checkRes = await fetch(`${BASE_URL}/api/settings`);
    const checkData = await checkRes.json();
    assert.strictEqual(checkData.checkinProvider, "proprio");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: AC 2 — Geração de Links Dinâmicos e Fallback Resiliente
// ─────────────────────────────────────────────────────────────────────────────
describe("AC 2: Geração de Links Dinâmicos e Fallback Resiliente", async () => {
  const { fnrhSerproService, getCheckinUrl, getCheckinUrlSync } = await import(
    "../artifacts/api-server/fnrh-serpro-service.mjs"
  );

  const mockDbProprio = {
    settings: { checkinProvider: "proprio", baseUrl: "https://corpflats.onrender.com" }
  };

  const mockDbGov = {
    settings: {
      checkinProvider: "gov_fnrh",
      baseUrl: "https://corpflats.onrender.com",
      serproConfig: { env: "homologacao", mock: true }
    }
  };

  it("2.1 No modo 'proprio', getCheckinUrl retorna URL contendo /pre-checkin/:code", async () => {
    const reservation = { code: "RES-PROPRIO-001", id: 1001 };
    const url = await getCheckinUrl(reservation, 1, "https://corpflats.onrender.com", mockDbProprio);

    assert.ok(url.includes("/pre-checkin/RES-PROPRIO-001"), "Deve conter rota /pre-checkin/:code");
    assert.strictEqual(url, "https://corpflats.onrender.com/pre-checkin/RES-PROPRIO-001?guest=1");
  });

  it("2.2 No modo 'gov_fnrh' com reserva pré-registrada no SERPRO, retorna URL oficial do Gov.br", async () => {
    const reservation = {
      code: "RES-GOV-CACHED-002",
      id: 1002,
      serproPrecheckinUrl: "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resgov002"
    };
    const url = await getCheckinUrl(reservation, 1, "https://corpflats.onrender.com", mockDbGov);

    assert.ok(url.startsWith("https://fnrh.turismo.gov.br/precheckin/"), "Deve retornar URL oficial Gov.br");
    assert.strictEqual(url, "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resgov002");
  });

  it("2.3 No modo 'gov_fnrh' sem registro prévio, invoca SERPRO e retorna URL oficial Gov.br persistindo metadados", async () => {
    fnrhSerproService.setMockMode(true);
    fnrhSerproService.setMockError(null);
    fnrhSerproService.setMockTimeout(false);

    const reservation = {
      code: "RES-GOV-NEW-003",
      id: 1003,
      checkinDate: "2026-10-25",
      checkoutDate: "2026-10-30",
      adults: 2,
      children: 1
    };

    const url = await getCheckinUrl(reservation, 1, "https://corpflats.onrender.com", mockDbGov);

    assert.ok(url.startsWith("https://fnrh.turismo.gov.br/precheckin/"));
    assert.ok(reservation.serproReservaId, "Deve gravar serproReservaId na reserva");
    assert.strictEqual(reservation.serproPrecheckinUrl, url);
    assert.strictEqual(reservation.link_precheckin, url);
    assert.strictEqual(reservation.serproStatus, "CRIADA");
  });

  it("2.4 Fallback sob falha simulada (HTTP 500 / rede): retorna URL própria sem lançar exceção", async () => {
    fnrhSerproService.setMockMode(true);
    fnrhSerproService.setMockError("Servidor SERPRO temporariamente instável (HTTP 500)");

    const reservation = {
      code: "RES-ERR-FALLBACK-004",
      id: 1004,
      checkinDate: "2026-10-25",
      checkoutDate: "2026-10-30"
    };

    // Não deve lançar erro
    let url;
    await assert.doesNotReject(async () => {
      url = await getCheckinUrl(reservation, 1, "https://corpflats.onrender.com", mockDbGov);
    });

    assert.strictEqual(url, "https://corpflats.onrender.com/pre-checkin/RES-ERR-FALLBACK-004?guest=1");
    assert.ok(reservation.serproError, "Deve registrar serproError no objeto da reserva");
    assert.ok(reservation.serproError.includes("Servidor SERPRO temporariamente instável"));

    fnrhSerproService.setMockError(null);
  });

  it("2.5 Fallback sob timeout simulado (>5s): retorna URL própria sem lançar exceção", async () => {
    fnrhSerproService.setMockMode(true);
    fnrhSerproService.setMockTimeout(true);

    const reservation = {
      code: "RES-TIMEOUT-FALLBACK-005",
      id: 1005,
      checkinDate: "2026-10-25",
      checkoutDate: "2026-10-30"
    };

    let url;
    await assert.doesNotReject(async () => {
      url = await getCheckinUrl(reservation, 1, "https://corpflats.onrender.com", mockDbGov);
    });

    assert.strictEqual(url, "https://corpflats.onrender.com/pre-checkin/RES-TIMEOUT-FALLBACK-005?guest=1");
    assert.ok(reservation.serproError, "Deve registrar erro de timeout na reserva");
    assert.ok(reservation.serproError.includes("ETIMEDOUT") || reservation.serproError.includes("tempo limite"));

    fnrhSerproService.setMockTimeout(false);
  });

  it("2.6 Fallback no servidor ao vivo: grava log de auditoria FNRH_SERPRO_FALLBACK e alerta na recepção", async () => {
    // 1. Ativa modo 'gov_fnrh' no servidor ao vivo
    await fetch(`${BASE_URL}/api/settings`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ checkinProvider: "gov_fnrh" })
    });

    // 2. Cria reserva com datas inválidas para provocar falha controlada do SERPRO e ativar fallback
    const payload = {
      flatId: 1,
      guestName: "Hóspede Teste Fallback Auditoria",
      checkinDate: "data-invalida",
      checkoutDate: "2026-11-01",
      adults: 1,
      children: 0,
      totalAmount: 500,
      status: "confirmada"
    };

    const createRes = await fetch(`${BASE_URL}/api/pms/reservations`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(payload)
    });

    assert.strictEqual(createRes.status, 201);
    const createdRes = await createRes.json();
    assert.ok(createdRes.code, "Reserva criada com sucesso");

    // 3. Verifica se log de auditoria FNRH_SERPRO_FALLBACK foi gravado
    const auditRes = await fetch(`${BASE_URL}/api/audit-logs`, { headers: adminHeaders });
    assert.strictEqual(auditRes.status, 200);
    const auditData = await auditRes.json();
    const logs = auditData.logs || auditData;

    const fallbackAudit = logs.find(
      l => l.action === "FNRH_SERPRO_FALLBACK" && l.details?.reservationCode === createdRes.code
    );
    assert.ok(fallbackAudit, "Deve registrar entrada FNRH_SERPRO_FALLBACK no audit log");
    assert.strictEqual(fallbackAudit.category, "integration");
    assert.strictEqual(fallbackAudit.level, "warning");

    // 4. Verifica se alerta para a recepção foi criado na central de notificações
    const notifRes = await fetch(`${BASE_URL}/api/notifications`);
    assert.strictEqual(notifRes.status, 200);
    const notifData = await notifRes.json();
    const notifs = notifData.notifications || notifData;

    const receptionAlert = notifs.find(
      n => (n.message && n.message.includes(createdRes.code)) || (n.details?.reservationCode === createdRes.code)
    );
    assert.ok(receptionAlert, "Deve criar alerta na recepção com os detalhes da reserva");
  });

  it("2.7 Helper síncrono getCheckinUrlSync resolve URLs sem promessas em ambos os modos", () => {
    const resProprio = { code: "RES-SYNC-01", id: 101 };
    const syncProprio = getCheckinUrlSync(resProprio, 2, "https://corpflats.onrender.com", mockDbProprio);
    assert.strictEqual(typeof syncProprio, "string");
    assert.strictEqual(syncProprio, "https://corpflats.onrender.com/pre-checkin/RES-SYNC-01?guest=2");

    const resGov = {
      code: "RES-SYNC-02",
      id: 102,
      serproPrecheckinUrl: "https://fnrh.turismo.gov.br/precheckin/uuid-sync-1234"
    };
    const syncGov = getCheckinUrlSync(resGov, 1, "https://corpflats.onrender.com", mockDbGov);
    assert.strictEqual(typeof syncGov, "string");
    assert.strictEqual(syncGov, "https://fnrh.turismo.gov.br/precheckin/uuid-sync-1234");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: AC 3 — Canais de Comunicação (WhatsApp e E-mails)
// ─────────────────────────────────────────────────────────────────────────────
describe("AC 3: Canais de Comunicação (WhatsApp e E-mails)", async () => {
  const zapi = await import("../artifacts/api-server/zapi-service.mjs");
  const mail = await import("../artifacts/api-server/mail-service.mjs");
  const aiService = await import("../artifacts/api-server/whatsapp-ai-service.mjs");

  const mockDbProprio = {
    settings: { checkinProvider: "proprio", baseUrl: "https://corpflats.onrender.com" }
  };

  const mockDbGov = {
    settings: { checkinProvider: "gov_fnrh", baseUrl: "https://corpflats.onrender.com" }
  };

  const reservationProprio = {
    code: "RES-COMM-PROP",
    id: 2001,
    guestName: "Mariana Souza",
    flatNumber: 105,
    checkinDate: "2026-11-10",
    checkoutDate: "2026-11-15",
    guestCount: 2,
    guests: [
      { name: "Mariana Souza", hasCompletedCheckin: true, status: "CHECKED_IN" },
      { name: "Felipe Souza" }
    ]
  };

  const reservationGov = {
    code: "RES-COMM-GOV",
    id: 2002,
    guestName: "Juliana Mendes",
    flatNumber: 203,
    checkinDate: "2026-11-12",
    checkoutDate: "2026-11-17",
    serproPrecheckinUrl: "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-rescommgov",
    guestCount: 2,
    guests: [
      { name: "Juliana Mendes", hasCompletedCheckin: true, status: "CHECKED_IN" },
      { name: "Pedro Mendes" }
    ]
  };

  const reservationFallback = {
    code: "RES-COMM-FALLBACK",
    id: 2003,
    guestName: "Rodrigo Faro",
    flatNumber: 304,
    checkinDate: "2026-11-14",
    checkoutDate: "2026-11-19",
    guestCount: 1,
    guests: [{ name: "Rodrigo Faro" }]
  };

  it("3.1 WhatsApp: tag {{link_checkin_digital}} resolve link dinâmico em mensagens conforme a chave ativa", () => {
    const rawTemplate = "Olá, realize seu check-in aqui: {{link_checkin_digital}}";

    // Modo Próprio
    const msgProprio = zapi.resolveWhatsAppTags(
      rawTemplate,
      reservationProprio,
      mockDbProprio,
      "https://corpflats.onrender.com"
    );
    assert.ok(msgProprio.includes("https://corpflats.onrender.com/pre-checkin/RES-COMM-PROP?guest=1"));

    // Modo Gov.br
    const msgGov = zapi.resolveWhatsAppTags(
      rawTemplate,
      reservationGov,
      mockDbGov,
      "https://corpflats.onrender.com"
    );
    assert.ok(msgGov.includes("https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-rescommgov"));

    // Fallback inteligente (modo gov_fnrh mas sem URL do SERPRO)
    const msgFallback = zapi.resolveWhatsAppTags(
      rawTemplate,
      reservationFallback,
      mockDbGov,
      "https://corpflats.onrender.com"
    );
    assert.ok(msgFallback.includes("https://corpflats.onrender.com/pre-checkin/RES-COMM-FALLBACK?guest=1"));
  });

  it("3.2 WhatsApp: lembrete multi-hóspedes inclui link correto do 2º hóspede", () => {
    // Modo Próprio: link específico do hóspede 2 (?guest=2)
    const msgProprio = zapi.resolveWhatsAppTags(
      "{{mensagem_pendencia_hospedes}}",
      reservationProprio,
      mockDbProprio,
      "https://corpflats.onrender.com"
    );
    assert.ok(msgProprio.includes("2º hóspede"));
    assert.ok(msgProprio.includes("https://corpflats.onrender.com/pre-checkin/RES-COMM-PROP?guest=2"));

    // Modo Gov.br: direciona para o link oficial FNRH
    const msgGov = zapi.resolveWhatsAppTags(
      "{{mensagem_pendencia_hospedes}}",
      reservationGov,
      mockDbGov,
      "https://corpflats.onrender.com"
    );
    assert.ok(msgGov.includes("2º hóspede"));
    assert.ok(msgGov.includes("https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-rescommgov"));
  });

  it("3.3 WhatsApp: botões de ação resolvem link correto e aplicam filtro por conclusão", () => {
    const rawButtons = [
      { id: "btn_chk", type: "URL", label: "Check-in", url: "{{link_checkin_digital}}" }
    ];
    const template = { id: "tpl_pre_checkin_reminder", triggerEvent: "pre_checkin_reminder" };

    // Botão no modo Próprio
    const btnsProprio = zapi.renderTemplateButtons(
      rawButtons,
      reservationProprio,
      mockDbProprio,
      "https://corpflats.onrender.com",
      "guest",
      template
    );
    assert.strictEqual(btnsProprio[0].url, "https://corpflats.onrender.com/pre-checkin/RES-COMM-PROP?guest=1");

    // Botão no modo Gov.br
    const btnsGov = zapi.renderTemplateButtons(
      rawButtons,
      reservationGov,
      mockDbGov,
      "https://corpflats.onrender.com",
      "guest",
      template
    );
    assert.strictEqual(btnsGov[0].url, "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-rescommgov");

    // Filtro: remove botão de check-in quando todos os hóspedes concluíram (inclusive turismo.gov.br)
    const doneReservationGov = {
      ...reservationGov,
      preCheckinCompleted: true,
      guests: [{ name: "Juliana Mendes", hasCompletedCheckin: true, status: "CHECKED_IN" }]
    };
    const filteredBtns = zapi.renderTemplateButtons(
      rawButtons,
      doneReservationGov,
      mockDbGov,
      "https://corpflats.onrender.com",
      "guest",
      "tpl_checkin_day_instructions"
    );
    const chkBtn = filteredBtns.find(b => b.id === "btn_chk" || b.url?.includes("turismo.gov.br") || b.url?.includes("pre-checkin"));
    assert.strictEqual(chkBtn, undefined, "Botão de check-in deve ser suprimido quando check-in já concluído");
    assert.ok(filteredBtns.some(b => b.id === "btn_cheguei"), "Botão 'Já Cheguei no Flat' deve ser oferecido no lugar");
  });

  it("3.4 E-mails: templates incorporam a URL dinâmica e identificador visual oficial", () => {
    // 1. Confirmação de reserva no modo Próprio
    const emailProprio = mail.renderReservationConfirmationEmail({
      reservation: reservationProprio,
      flat: { number: "105" },
      settings: mockDbProprio.settings,
      db: mockDbProprio
    });
    assert.ok(emailProprio.bodyHtml.includes("https://corpflats.onrender.com/pre-checkin/RES-COMM-PROP?guest=1"));
    assert.ok(emailProprio.bodyHtml.includes("Realizar Pré-Check-in Digital"));

    // 2. Confirmação de reserva no modo Gov.br
    const emailGov = mail.renderReservationConfirmationEmail({
      reservation: reservationGov,
      flat: { number: "203" },
      settings: mockDbGov.settings,
      db: mockDbGov
    });
    assert.ok(emailGov.bodyHtml.includes("https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-rescommgov"));
    assert.ok(emailGov.bodyHtml.includes("Fazer Check-in Oficial Gov.br (FNRH)"));

    // 3. Lembrete de pré-checkin
    const reminderEmail = mail.renderPreCheckinReminderEmail({
      reservation: reservationGov,
      flat: { number: "203" },
      settings: mockDbGov.settings,
      db: mockDbGov
    });
    assert.ok(reminderEmail.bodyHtml.includes("https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-rescommgov"));

    // 4. Instruções de acesso
    const accessEmail = mail.renderAccessInstructionsEmail({
      reservation: reservationGov,
      flat: { number: "203" },
      settings: mockDbGov.settings,
      db: mockDbGov
    });
    assert.ok(accessEmail.bodyHtml.includes("https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-rescommgov"));
  });

  it("3.5 Agente IA WhatsApp: responde dúvidas de check-in com a URL do provedor ativo", () => {
    const aiDb = {
      settings: { checkinProvider: "gov_fnrh", baseUrl: "https://corpflats.onrender.com" },
      reservations: [
        {
          code: "RES-AI-TEST",
          guestName: "Thiago Lacerda",
          guestPhone: "5521988887777",
          flatNumber: 401,
          checkinDate: "2026-11-20",
          checkoutDate: "2026-11-25",
          serproPrecheckinUrl: "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resaitest",
          status: "confirmed"
        }
      ],
      flats: [{ number: 401, status: "clean" }],
      cleaningRequests: []
    };

    const ctx = aiService.buildGuestContext(aiDb, "5521988887777");
    assert.ok(ctx.hasReservation);
    assert.strictEqual(ctx.checkinUrl, "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resaitest");

    const reply = aiService.generateHeuristicResponse("Como faço meu check-in online?", ctx);
    assert.ok(reply.includes("https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resaitest"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: AC 4 — Ações de Interface (Frontend Link Resolvers & UI Actions)
// ─────────────────────────────────────────────────────────────────────────────
describe("AC 4: Ações de Interface e Copiar Link no Painel Administrativo", async () => {
  // Transpilação e carregamento direto do código frontend TypeScript em runtime
  const ts = (await import("typescript")).default;
  const tsCode = fs.readFileSync(path.join(rootDir, "artifacts/limpeza/src/lib/checkin-url.ts"), "utf-8");
  const jsCode = ts.transpileModule(tsCode, {
    compilerOptions: { module: ts.ModuleKind.ESNext }
  }).outputText;
  const dataUri = `data:text/javascript;base64,${Buffer.from(jsCode).toString("base64")}`;
  const { getCheckinUrl: getFrontendCheckinUrl } = await import(dataUri);

  it("4.1 Helper central do frontend (checkin-url.ts) retorna URL própria no modo 'proprio'", () => {
    const res = { code: "RES-UI-PROP", id: 3001 };
    const settings = { checkinProvider: "proprio" };

    const url = getFrontendCheckinUrl(res, 1, "https://corpflats.onrender.com", settings);
    assert.strictEqual(url, "https://corpflats.onrender.com/pre-checkin/RES-UI-PROP?guest=1");

    const urlGuest2 = getFrontendCheckinUrl(res, 2, "https://corpflats.onrender.com", settings);
    assert.strictEqual(urlGuest2, "https://corpflats.onrender.com/pre-checkin/RES-UI-PROP?guest=2");
  });

  it("4.2 Helper central do frontend retorna URL oficial Gov.br no modo 'gov_fnrh'", () => {
    const res = {
      code: "RES-UI-GOV",
      id: 3002,
      serproPrecheckinUrl: "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resuip01"
    };
    const settings = { checkinProvider: "gov_fnrh" };

    const url = getFrontendCheckinUrl(res, 1, "https://corpflats.onrender.com", settings);
    assert.strictEqual(url, "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resuip01");
  });

  it("4.3 Helper central do frontend ativa fallback para URL própria quando link Gov.br está ausente", () => {
    const res = { code: "RES-UI-FALLBACK", id: 3003 };
    const settings = { checkinProvider: "gov_fnrh" };

    const url = getFrontendCheckinUrl(res, 1, "https://corpflats.onrender.com", settings);
    assert.strictEqual(url, "https://corpflats.onrender.com/pre-checkin/RES-UI-FALLBACK?guest=1");
  });

  it("4.4 Simulação de Ação 'Copiar Link' em componentes do painel administrativo", () => {
    const origin = "https://corpflats.onrender.com";
    const settingsGov = { checkinProvider: "gov_fnrh" };
    const settingsProp = { checkinProvider: "proprio" };

    const sampleRes = {
      code: "RES-ACTION-TEST",
      id: 3004,
      serproPrecheckinUrl: "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resaction04"
    };

    // 1. Simulação: Botão Copiar Link no Calendário PMS (pms-calendar.tsx linha 7343)
    const pmsCalendarCopiedGov = getFrontendCheckinUrl(sampleRes, 1, origin, settingsGov);
    assert.strictEqual(
      pmsCalendarCopiedGov,
      "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resaction04",
      "No Calendário PMS com modo gov_fnrh ativo, 'Copiar Link' deve copiar o link oficial Gov.br"
    );

    const pmsCalendarCopiedProp = getFrontendCheckinUrl(sampleRes, 1, origin, settingsProp);
    assert.strictEqual(
      pmsCalendarCopiedProp,
      "https://corpflats.onrender.com/pre-checkin/RES-ACTION-TEST?guest=1",
      "No Calendário PMS com modo proprio ativo, 'Copiar Link' deve copiar o link interno"
    );

    // 2. Simulação: Hover Card de Reserva (reservation-hover-card.tsx linha 200)
    const hoverCardCopied = getFrontendCheckinUrl(sampleRes, 1, origin, settingsGov);
    assert.strictEqual(hoverCardCopied, "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resaction04");

    // 3. Simulação: Tablet da Recepção (reception-tablet.tsx linhas 777 e 793)
    const tabletCopied = getFrontendCheckinUrl(sampleRes, 2, origin, settingsProp);
    assert.strictEqual(tabletCopied, "https://corpflats.onrender.com/pre-checkin/RES-ACTION-TEST?guest=2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: Paridade Estrita dos Arquivos Espelho (Twin Mirror Parity)
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite 5: Paridade Estrita dos Arquivos Espelho e Verificação de Sintaxe", () => {
  const mirroredPairs = [
    ["artifacts/api-server/demo-server.mjs", "scripts/demo-server.mjs"],
    ["artifacts/api-server/fnrh-serpro-service.mjs", "scripts/fnrh-serpro-service.mjs"],
    ["artifacts/api-server/zapi-service.mjs", "scripts/zapi-service.mjs"],
    ["artifacts/api-server/mail-service.mjs", "scripts/mail-service.mjs"],
    ["artifacts/api-server/whatsapp-ai-service.mjs", "scripts/whatsapp-ai-service.mjs"]
  ];

  for (const [fileA, fileB] of mirroredPairs) {
    it(`Paridade byte-a-byte estrita e SHA-256 idêntico: ${fileA} <==> ${fileB}`, () => {
      const pathA = path.join(rootDir, fileA);
      const pathB = path.join(rootDir, fileB);

      assert.ok(fs.existsSync(pathA), `Arquivo deve existir: ${fileA}`);
      assert.ok(fs.existsSync(pathB), `Arquivo deve existir: ${fileB}`);

      const bufA = fs.readFileSync(pathA);
      const bufB = fs.readFileSync(pathB);

      assert.strictEqual(bufA.length, bufB.length, `Tamanho em bytes divergente para ${fileA} vs ${fileB}`);
      assert.ok(bufA.equals(bufB), `Buffer.equals falhou para ${fileA} vs ${fileB}`);

      const hashA = crypto.createHash("sha256").update(bufA).digest("hex");
      const hashB = crypto.createHash("sha256").update(bufB).digest("hex");
      assert.strictEqual(hashA, hashB, `SHA-256 divergente para ${fileA} vs ${fileB}`);
    });
  }

  it("Node.js syntax check (node --check) para todos os scripts backend", () => {
    const files = [
      "artifacts/api-server/demo-server.mjs",
      "scripts/demo-server.mjs",
      "artifacts/api-server/fnrh-serpro-service.mjs",
      "scripts/fnrh-serpro-service.mjs",
      "artifacts/api-server/zapi-service.mjs",
      "scripts/zapi-service.mjs",
      "artifacts/api-server/mail-service.mjs",
      "scripts/mail-service.mjs",
      "artifacts/api-server/whatsapp-ai-service.mjs",
      "scripts/whatsapp-ai-service.mjs"
    ];

    for (const rel of files) {
      const fullPath = path.join(rootDir, rel);
      assert.doesNotThrow(() => {
        execSync(`node --check "${fullPath}"`, { stdio: "pipe" });
      }, `Sintaxe Node.js inválida em ${rel}`);
    }
  });
});

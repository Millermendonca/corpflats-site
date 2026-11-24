import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const tmpDbPath = path.join(os.tmpdir(), `gfm-funnel-avail-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
fs.writeFileSync(
  tmpDbPath,
  JSON.stringify({
    flats: [
      { id: 1, number: "113", status: "clean" },
      { id: 2, number: "114", status: "clean" },
      { id: 3, number: "115", status: "clean" },
      { id: 4, number: "202", status: "manutencao_bloqueada" },
    ],
    reservations: [
      {
        id: 101,
        code: "RES-113-0101",
        flatId: 1,
        flatNumber: "113",
        checkinDate: "2026-12-10",
        checkoutDate: "2026-12-12",
        status: "confirmada",
      },
    ],
    funnelEvents: [],
    abandonedCarts: [],
    notifications: [],
  }),
  "utf8"
);

process.env.NODE_ENV = "test";
process.env.DATA_FILE = tmpDbPath;
process.env.PORT = "0";
delete process.env.DATABASE_URL;

const { app, httpServer, db } = await import("../artifacts/api-server/demo-server.mjs");

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (httpServer && httpServer.listening) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  try {
    fs.unlinkSync(tmpDbPath);
  } catch {}
  setTimeout(() => process.exit(0), 50);
});

test("1. Paridade SHA-256 entre artifacts/api-server/demo-server.mjs e scripts/demo-server.mjs", () => {
  const h1 = crypto.createHash("sha256").update(fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"))).digest("hex");
  const h2 = crypto.createHash("sha256").update(fs.readFileSync(path.resolve("scripts/demo-server.mjs"))).digest("hex");
  assert.equal(h1, h2);
});

test("2. GET /api/reservations/availability retorna totalFlatsCount e totalAvailableFlats exatos para multi-flat", async () => {
  db.flats = [
    { id: 1, number: "113", status: "clean" },
    { id: 2, number: "114", status: "clean" },
    { id: 3, number: "115", status: "clean" },
    { id: 4, number: "202", status: "manutencao_bloqueada" },
  ];
  db.reservations = [
    {
      id: 101,
      code: "RES-113-0101",
      flatId: 1,
      flatNumber: "113",
      checkinDate: "2026-12-10",
      checkoutDate: "2026-12-12",
      status: "confirmada",
    },
  ];

  const res = await fetch(`${baseUrl}/api/reservations/availability?checkin=2026-12-10&checkout=2026-12-12`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.available, true);
  assert.equal(data.totalFlatsCount, 3, "Deve contar apenas flats ativos (excluindo manutencao_bloqueada)");
  assert.equal(data.totalAvailableFlats, 2, "Deve retornar exatamente 2 flats livres");
});

test("3. POST /api/funnel/track unifica sessionId, aceita roomsCount/flatsCount e registra placement + pagePath sem sobrescrever para 1 flat", async () => {
  db.funnelEvents = [];
  db.abandonedCarts = [];

  const sid = "cf_unified_test_001";

  // Passo 1: clique em Reservar Pacote (2 Flats) na Home
  const r1 = await fetch(`${baseUrl}/api/funnel/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: sid,
      step: 1,
      stepName: "busca_datas",
      checkinDate: "2026-12-10",
      checkoutDate: "2026-12-11",
      flatsCount: 2,
      roomsCount: 2,
      adultsCount: 4,
      rooms: [
        { id: 1, bedType: "queen", adults: 2 },
        { id: 2, bedType: "queen", adults: 2 },
      ],
      ratePlan: "with_breakfast",
      totalAmount: 511.5,
      pagePath: "/",
      attribution: { utm_source: "google", utm_campaign: "brand" },
      status: "pesquisando",
    }),
  });
  assert.equal(r1.status, 200);

  // Passo 2: modal abre Etapa 1 com a MESMA sessionId unificada
  const r2 = await fetch(`${baseUrl}/api/funnel/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: sid,
      step: 2,
      stepName: "personalizacao_extras",
      checkinDate: "2026-12-10",
      checkoutDate: "2026-12-11",
      flatsCount: 2,
      roomsCount: 2,
      adultsCount: 4,
      ratePlan: "with_breakfast",
      totalAmount: 511.5,
      status: "pesquisando",
    }),
  });
  assert.equal(r2.status, 200);

  // Passo 3: clique no Concierge WhatsApp enviando apenas roomsCount + placement (como faz whatsapp-concierge.ts)
  const r3 = await fetch(`${baseUrl}/api/funnel/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: sid,
      step: 1,
      stepName: "whatsapp_concierge_click",
      status: "transbordo_whatsapp",
      placement: "funnel_step_helper",
      pagePath: "/",
      checkinDate: "2026-12-10",
      checkoutDate: "2026-12-11",
      ratePlan: "with_breakfast",
      roomsCount: 2,
      adultsCount: 4,
      totalAmount: 511.5,
    }),
  });
  assert.equal(r3.status, 200);

  // Passo 4: evento subsequente sem flatsCount/roomsCount NÃO pode rebaixar flatsCount de 2 para 1
  const r4 = await fetch(`${baseUrl}/api/funnel/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: sid,
      step: 2,
      stepName: "personalizacao_extras",
      checkinDate: "2026-12-10",
      checkoutDate: "2026-12-11",
      totalAmount: 0,
      status: "pesquisando",
    }),
  });
  assert.equal(r4.status, 200);

  assert.equal(db.abandonedCarts.length, 1, "Deve existir apenas 1 carrinho unificado (zero duplicidade cf_ vs funnel_)");
  const cart = db.abandonedCarts[0];
  assert.equal(cart.sessionId, sid);
  assert.equal(cart.flatsCount, 2, "flatsCount deve permanecer 2");
  assert.equal(cart.adultsCount, 4);
  assert.equal(cart.currentStep, 2, "currentStep deve manter o maior passo atingido");
  assert.equal(cart.lastConciergePlacement, "funnel_step_helper", "Deve registrar em qual botão do WhatsApp clicou");
  assert.equal(cart.pagePath, "/");
  assert.equal(cart.utm_source, "google");
  assert.equal(cart.totalAmount, 511.5, "totalAmount=0 não deve zerar valor já calculado");

  const waEv = db.funnelEvents.find((e) => e.stepName === "whatsapp_concierge_click");
  assert.ok(waEv, "Evento whatsapp_concierge_click deve estar gravado");
  assert.equal(waEv.flatsCount, 2);
  assert.equal(waEv.placement, "funnel_step_helper");
  assert.equal(waEv.pagePath, "/");
});

test("4. Contratos do frontend: selo de disponibilidade, persistência de rooms, sessionId unificada e zero nota de lotação", () => {
  const engineSrc = fs.readFileSync(path.resolve("artifacts/limpeza/src/pages/booking-engine.tsx"), "utf8");
  const modalSrc = fs.readFileSync(path.resolve("artifacts/limpeza/src/components/booking-funnel-modal.tsx"), "utf8");
  const seoSrc = fs.readFileSync(path.resolve("artifacts/limpeza/src/lib/seo-landing-pages.ts"), "utf8");
  const trackSrc = fs.readFileSync(path.resolve("artifacts/limpeza/src/lib/analytics-tracking.ts"), "utf8");
  const conciergeSrc = fs.readFileSync(path.resolve("artifacts/limpeza/src/lib/whatsapp-concierge.ts"), "utf8");

  assert.match(engineSrc, /id="hero-availability-status"/);
  assert.match(engineSrc, /hasInsufficientFlats/);
  assert.match(engineSrc, /pixTotalAmount: isAvailabilityReady \? pixTotalAmount : undefined/);
  assert.match(engineSrc, /rooms: sanitizedRooms/);

  assert.match(modalSrc, /useState\(\(\) => getSessionTrackingId\(\)\)/);
  assert.doesNotMatch(modalSrc, /`funnel_\$\{Date\.now\(\)\}/);
  assert.match(modalSrc, /modalStockIssue/);
  assert.match(modalSrc, /rooms: sanitizedRooms/);
  assert.match(modalSrc, /Disponibilidade confirmada para suas datas/);
  assert.doesNotMatch(modalSrc, /extraBedConfig\?\.notice/);

  assert.match(seoSrc, /initialRooms\?: DraftRoomSnapshot\[\]/);
  assert.match(seoSrc, /ctaButtonText: "Reservar agora"/);

  assert.match(trackSrc, /export function sendTelemetryLater/);
  assert.match(trackSrc, /fetchLater/);
  assert.match(conciergeSrc, /sendTelemetryLater\("\/api\/funnel\/track", payload\)/);
  assert.match(conciergeSrc, /flatsCount: resolvedRoomsCount/);
});

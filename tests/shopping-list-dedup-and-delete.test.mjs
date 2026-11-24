import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDbPath = path.join(os.tmpdir(), `gfm-shopping-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
fs.writeFileSync(tmpDbPath, JSON.stringify({ shoppingList: [], shoppingPendingDeletes: [], notifications: [] }), "utf8");

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
  try { fs.unlinkSync(tmpDbPath); } catch {}
  setTimeout(() => process.exit(0), 50);
});

test("Lista de Compras: deduplicação de cliques simultâneos, variações de acento/caixa, itens comprados e deleção definitiva", async () => {
  db.shoppingList = [];
  db.shoppingPendingDeletes = [];

  // 1) Três POSTs simultâneos idênticos (simula duplo clique / retry concorrente) -> apenas 1 item criado
  const concurrentRes = await Promise.all([
    fetch(`${baseUrl}/api/shopping-list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Água Sanitária" }),
    }),
    fetch(`${baseUrl}/api/shopping-list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Água Sanitária" }),
    }),
    fetch(`${baseUrl}/api/shopping-list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "agua sanitaria" }),
    }),
  ]);

  const createdItems = await Promise.all(concurrentRes.map((r) => r.json()));
  const uniqueIds = new Set(createdItems.map((i) => i.id));
  assert.equal(uniqueIds.size, 1, "POSTs simultâneos para o mesmo item devem retornar exatamente o mesmo ID");

  let list = await (await fetch(`${baseUrl}/api/shopping-list`)).json();
  assert.equal(list.length, 1, "Deve haver apenas 1 item na lista após POSTs simultâneos");
  const itemId = list[0].id;

  // 2) Novo POST sequencial com caixa/espaços diferentes -> deduplicado (status 200), não duplica
  const dupRes = await fetch(`${baseUrl}/api/shopping-list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "  AGUA   SANITÁRIA  " }),
  });
  assert.equal(dupRes.status, 200);
  const dupBody = await dupRes.json();
  assert.equal(dupBody.id, itemId);

  list = await (await fetch(`${baseUrl}/api/shopping-list`)).json();
  assert.equal(list.length, 1, "POST sequencial duplicado não pode criar segundo item");

  // 3) Mesmo título mas quantidade diferente -> permitido (ex: item com quantidade distinta)
  const diffQtyRes = await fetch(`${baseUrl}/api/shopping-list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Água Sanitária", quantity: "2 galões" }),
  });
  assert.equal(diffQtyRes.status, 201);
  const diffQtyItem = await diffQtyRes.json();
  assert.notEqual(diffQtyItem.id, itemId);

  list = await (await fetch(`${baseUrl}/api/shopping-list`)).json();
  assert.equal(list.length, 2, "Item com quantidade distinta deve ser permitido");

  // 4) Marcar o primeiro como comprado permite adicionar novo pendente com o mesmo nome
  const toggleRes = await fetch(`${baseUrl}/api/shopping-list/${encodeURIComponent(itemId)}/toggle`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed: true }),
  });
  assert.equal(toggleRes.status, 200);

  const reAddAfterComplete = await fetch(`${baseUrl}/api/shopping-list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Água Sanitária" }),
  });
  assert.equal(reAddAfterComplete.status, 201);
  const reAdded = await reAddAfterComplete.json();
  assert.notEqual(reAdded.id, itemId);

  // 5) Rejeita DELETE de ID otimista temp_*
  const tempDelRes = await fetch(`${baseUrl}/api/shopping-list/temp_12345`, { method: "DELETE" });
  assert.equal(tempDelRes.status, 400);

  // 6) Apagar TODOS os itens esvazia a lista e NÃO ressuscita em GETs subsequentes
  list = await (await fetch(`${baseUrl}/api/shopping-list`)).json();
  assert.equal(list.length, 3);
  for (const it of list) {
    const delRes = await fetch(`${baseUrl}/api/shopping-list/${encodeURIComponent(it.id)}`, { method: "DELETE" });
    assert.equal(delRes.status, 200);
  }

  const afterEmpty1 = await (await fetch(`${baseUrl}/api/shopping-list`)).json();
  const afterEmpty2 = await (await fetch(`${baseUrl}/api/shopping-list?refresh=1`)).json();
  assert.equal(afterEmpty1.length, 0, "Lista deve permanecer vazia após excluir todos os itens");
  assert.equal(afterEmpty2.length, 0, "Lista não pode ressuscitar itens em refresh subsequente");
});

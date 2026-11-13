import test from "node:test";
import assert from "node:assert/strict";
import { getZapiStatus, clearZapiStatusCache } from "../scripts/zapi-service.mjs";

test("Z-API Status: Retorna erro de configuração se credenciais faltarem", async () => {
  clearZapiStatusCache();
  const res = await getZapiStatus({});
  assert.equal(res.connected, false);
  assert.equal(res.configured, false);
});

test("Z-API Status: Cache em memória e single-flight", async () => {
  clearZapiStatusCache();

  // Mock global.fetch para medir chamadas à Z-API
  const originalFetch = global.fetch;
  let fetchCount = 0;

  global.fetch = async (url) => {
    fetchCount++;
    return {
      ok: true,
      json: async () => ({ connected: true, smartphoneConnected: true, phone: "5522999999999" })
    };
  };

  try {
    const config = { instanceId: "inst_test_123", token: "tok_test_456" };

    // Primeira chamada: deve fazer fetch
    const res1 = await getZapiStatus(config);
    assert.equal(res1.connected, true);
    assert.equal(res1.fromCache, undefined);
    assert.ok(fetchCount >= 1, "Deve ter realizado ao menos 1 fetch");

    const fetchesAfterFirst = fetchCount;

    // Segunda chamada consecutiva: DEVE retornar do cache sem novos fetches!
    const res2 = await getZapiStatus(config);
    assert.equal(res2.connected, true);
    assert.equal(res2.fromCache, true, "Segunda chamada deve vir com flag fromCache=true");
    assert.equal(fetchCount, fetchesAfterFirst, "Não deve ter incrementado o contador de fetches");

    // Terceira chamada com force=true: deve renovar o cache
    const res3 = await getZapiStatus(config, { force: true });
    assert.equal(res3.connected, true);
    assert.equal(res3.fromCache, undefined, "Chamada com force não deve vir do cache");
    assert.ok(fetchCount > fetchesAfterFirst, "Chamada forçada deve ter realizado novo fetch");
  } finally {
    global.fetch = originalFetch;
    clearZapiStatusCache();
  }
});

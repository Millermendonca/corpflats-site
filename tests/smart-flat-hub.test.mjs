import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

// Configura ambiente de teste
process.env.NODE_ENV = "test";
process.env.PORT = "0";

import {
  app,
  httpServer,
  parseTimeToMinutes,
  minutesToTimeStr,
  createDefaultSmartFlatState,
  resolveSmartFlatContext,
  getOrCreateSmartFlat,
  evaluateSmartFlatState,
  WELCOME_TRACKS
} from "../artifacts/api-server/demo-server.mjs";

test("Smart Flat Hub: Utilitários de Tempo (parseTimeToMinutes & minutesToTimeStr)", () => {
  // Teste de parsing em múltiplos formatos tolerantes
  assert.equal(parseTimeToMinutes("14:00"), 840);
  assert.equal(parseTimeToMinutes("14:30"), 870);
  assert.equal(parseTimeToMinutes("14h30"), 870);
  assert.equal(parseTimeToMinutes("14h"), 840);
  assert.equal(parseTimeToMinutes("08:15"), 495);
  assert.equal(parseTimeToMinutes("23:59"), 1439);
  assert.equal(parseTimeToMinutes("00:00"), 0);

  // Formatos inválidos retornam null
  assert.equal(parseTimeToMinutes("invalido"), null);
  assert.equal(parseTimeToMinutes(""), null);
  assert.equal(parseTimeToMinutes(null), null);
  assert.equal(parseTimeToMinutes("25:00"), null);

  // Conversão de volta para string HH:mm
  assert.equal(minutesToTimeStr(840), "14:00");
  assert.equal(minutesToTimeStr(870), "14:30");
  assert.equal(minutesToTimeStr(495), "08:15");
  assert.equal(minutesToTimeStr(0), "00:00");
  assert.equal(minutesToTimeStr(1439), "23:59");
});

test("Smart Flat Hub: Estado Padrão Inicial (createDefaultSmartFlatState)", () => {
  const sf = createDefaultSmartFlatState("509");
  assert.equal(sf.flatNumber, "509");
  assert.equal(sf.devices.coffeeMaker.power, false);
  assert.equal(sf.devices.ac.power, false);
  assert.equal(sf.devices.ac.targetTemperature, 22);
  assert.equal(sf.devices.welcomePlaylist.volume, 35);
  assert.equal(sf.devices.welcomePlaylist.isPlaying, false);
  assert.equal(sf.presence.isEntranceConfirmed, false);
  assert.equal(sf.failSafe.warningActive, false);
  assert.equal(sf.failSafe.shutoffTriggered, false);
});

test("Smart Flat Hub: Janela de Antecedência de 30min (R2)", () => {
  const sf = createDefaultSmartFlatState("113");

  // Sem ETA informado: não permite programar
  evaluateSmartFlatState(sf, null, { hour: 13, minute: 0, date: "2026-10-12", timeStr: "13:00" });
  assert.equal(sf.timeContext.canSchedule, false);
  assert.match(sf.timeContext.scheduleBlockReason, /informe seu horário previsto/i);

  // Com ETA informado às 14:00
  sf.presence.eta = "14:00";

  // Às 13:00 (antecedência de 60min > 30min): Bloqueado
  evaluateSmartFlatState(sf, null, { hour: 13, minute: 0, date: "2026-10-12", timeStr: "13:00" });
  assert.equal(sf.timeContext.canSchedule, false);
  assert.equal(sf.timeContext.scheduleAllowedFrom, "13:30");
  assert.match(sf.timeContext.scheduleBlockReason, /a partir das 13:30 para chegada às 14:00/i);

  // Às 13:29: Bloqueado
  evaluateSmartFlatState(sf, null, { hour: 13, minute: 29, date: "2026-10-12", timeStr: "13:29" });
  assert.equal(sf.timeContext.canSchedule, false);

  // Às 13:30 (exatos 30min antes do ETA): Liberado
  evaluateSmartFlatState(sf, null, { hour: 13, minute: 30, date: "2026-10-12", timeStr: "13:30" });
  assert.equal(sf.timeContext.canSchedule, true);
  assert.equal(sf.timeContext.scheduleBlockReason, null);

  // Às 13:45 (15min antes do ETA): Liberado
  evaluateSmartFlatState(sf, null, { hour: 13, minute: 45, date: "2026-10-12", timeStr: "13:45" });
  assert.equal(sf.timeContext.canSchedule, true);
});

test("Smart Flat Hub: Ciclo Fail-Safe de Presença (R3)", () => {
  const sf = createDefaultSmartFlatState("313");
  sf.presence.eta = "14:00";
  sf.devices.coffeeMaker.power = true;
  sf.devices.ac.power = true;

  // 1. Antes do ETA (13:45): Aparelhos ligados e sem aviso
  evaluateSmartFlatState(sf, null, { hour: 13, minute: 45, date: "2026-10-12", timeStr: "13:45" });
  assert.equal(sf.devices.coffeeMaker.power, true);
  assert.equal(sf.devices.ac.power, true);
  assert.equal(sf.failSafe.warningActive, false);
  assert.equal(sf.failSafe.shutoffTriggered, false);

  // 2. Horário do ETA alcançado (14:00 a 14:29): Aviso preventivo ativado
  evaluateSmartFlatState(sf, null, { hour: 14, minute: 5, date: "2026-10-12", timeStr: "14:05" });
  assert.equal(sf.devices.coffeeMaker.power, true);
  assert.equal(sf.devices.ac.power, true);
  assert.equal(sf.failSafe.warningActive, true);
  assert.equal(sf.failSafe.warningMessage, "Você já chegou? Não esqueça de informar sua entrada aqui.");
  assert.equal(sf.failSafe.shutoffTriggered, false);

  // 3. Após 30min do ETA (14:30 em diante): Desligamento automático compulsório por segurança
  evaluateSmartFlatState(sf, null, { hour: 14, minute: 30, date: "2026-10-12", timeStr: "14:30" });
  assert.equal(sf.devices.coffeeMaker.power, false, "Cafeteira deve ser desligada");
  assert.equal(sf.devices.ac.power, false, "Ar-condicionado deve ser desligado");
  assert.equal(sf.failSafe.warningActive, false);
  assert.equal(sf.failSafe.shutoffTriggered, true);
  assert.equal(
    sf.failSafe.shutoffReason,
    "Equipamento desligado automaticamente por questão de segurança e economia de energia."
  );

  // 4. Cenário com Entrada Confirmada: Desarma o fail-safe imediatamente
  const sfConfirm = createDefaultSmartFlatState("313");
  sfConfirm.presence.eta = "14:00";
  sfConfirm.presence.isEntranceConfirmed = true;
  sfConfirm.devices.coffeeMaker.power = true;
  sfConfirm.devices.ac.power = true;

  evaluateSmartFlatState(sfConfirm, null, { hour: 14, minute: 40, date: "2026-10-12", timeStr: "14:40" });
  assert.equal(sfConfirm.devices.coffeeMaker.power, true, "Não desliga se entrada confirmada");
  assert.equal(sfConfirm.devices.ac.power, true, "Não desliga se entrada confirmada");
  assert.equal(sfConfirm.failSafe.warningActive, false);
  assert.equal(sfConfirm.failSafe.shutoffTriggered, false);
});

test("Smart Flat Hub: Ativação Automática da Trilha Sonora no Dia do Check-in (R4)", () => {
  const sf = createDefaultSmartFlatState("712");
  const reservation = {
    code: "RES-712-001",
    flatNumber: "712",
    checkinDate: "2026-10-12",
    status: "confirmada"
  };

  // Dia anterior ao check-in: Não toca
  evaluateSmartFlatState(sf, reservation, { hour: 14, minute: 30, date: "2026-10-11", timeStr: "14:30" });
  assert.equal(sf.devices.welcomePlaylist.isPlaying, false);
  assert.equal(sf.devices.welcomePlaylist.autoTriggered, false);

  // No dia do check-in antes das 14:00 (ex: 11:30): Não toca
  evaluateSmartFlatState(sf, reservation, { hour: 11, minute: 30, date: "2026-10-12", timeStr: "11:30" });
  assert.equal(sf.devices.welcomePlaylist.isPlaying, false);
  assert.equal(sf.devices.welcomePlaylist.autoTriggered, false);

  // No dia do check-in a partir das 14:00: Ativa automaticamente
  evaluateSmartFlatState(sf, reservation, { hour: 14, minute: 0, date: "2026-10-12", timeStr: "14:00" });
  assert.equal(sf.devices.welcomePlaylist.isPlaying, true);
  assert.equal(sf.devices.welcomePlaylist.autoTriggered, true);
  assert.ok(sf.devices.welcomePlaylist.autoTriggeredAt);
});

test("Smart Flat Hub: Endpoints HTTP via API REST", async () => {
  // Inicializa servidor em porta efêmera para requisições HTTP reais
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. GET /api/smart-flat/:target
    const resGet = await fetch(`${baseUrl}/api/smart-flat/113`);
    assert.equal(resGet.status, 200);
    const dataGet = await resGet.json();
    assert.equal(dataGet.ok, true);
    assert.equal(dataGet.smartFlat.flatNumber, "113");

    // 2. POST /api/smart-flat/:target/eta
    const resEta = await fetch(`${baseUrl}/api/smart-flat/113/eta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimatedArrivalTime: "15:00" })
    });
    assert.equal(resEta.status, 200);
    const dataEta = await resEta.json();
    assert.equal(dataEta.ok, true);
    assert.equal(dataEta.eta, "15:00");
    assert.equal(dataEta.scheduleAllowedFrom, "14:30");

    // 3. POST /api/smart-flat/:target/devices (Rejeição de temperatura fora da faixa)
    const resTempInvalid = await fetch(`${baseUrl}/api/smart-flat/113/devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ac: { targetTemperature: 15 } })
    });
    assert.equal(resTempInvalid.status, 400);
    const dataTempInvalid = await resTempInvalid.json();
    assert.match(dataTempInvalid.error, /temperatura.*entre 18°c e 26°c/i);

    // 4. POST /api/smart-flat/:target/playlist (Ações de áudio)
    const resPlay = await fetch(`${baseUrl}/api/smart-flat/113/playlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "play" })
    });
    assert.equal(resPlay.status, 200);
    const dataPlay = await resPlay.json();
    assert.equal(dataPlay.ok, true);
    assert.equal(dataPlay.welcomePlaylist.isPlaying, true);

    const resVolume = await fetch(`${baseUrl}/api/smart-flat/113/playlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_volume", volume: 45 })
    });
    assert.equal(resVolume.status, 200);
    const dataVolume = await resVolume.json();
    assert.equal(dataVolume.welcomePlaylist.volume, 45);

    // 5. POST /api/smart-flat/:target/confirm-entrance (Confirmação de entrada)
    const resEntrance = await fetch(`${baseUrl}/api/smart-flat/113/confirm-entrance`, {
      method: "POST"
    });
    assert.equal(resEntrance.status, 200);
    const dataEntrance = await resEntrance.json();
    assert.equal(dataEntrance.ok, true);
    assert.equal(dataEntrance.smartFlat.presence.isEntranceConfirmed, true);
    assert.equal(dataEntrance.smartFlat.failSafe.warningActive, false);

    // 6. POST /api/smart-flat/:target/simulate (Simulação de desligamento por segurança)
    const resSim = await fetch(`${baseUrl}/api/smart-flat/113/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forceShutoff: true })
    });
    assert.equal(resSim.status, 200);
    const dataSim = await resSim.json();
    assert.equal(dataSim.ok, true);
    assert.equal(dataSim.smartFlat.failSafe.shutoffTriggered, true);
    assert.match(dataSim.smartFlat.failSafe.shutoffReason, /economia de energia/i);

  } finally {
    server.close();
  }
});

test.after(() => {
  try {
    httpServer.close();
  } catch (_) {}
  setTimeout(() => process.exit(0), 200).unref();
});

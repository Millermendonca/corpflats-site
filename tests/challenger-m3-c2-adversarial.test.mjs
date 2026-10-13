/**
 * Test Suite: Milestone 3 Challenger 2 - Adversarial Verification
 * Focus: Fast-Track Re-Signing Flow & Garage Dashboard Polling
 * File: tests/challenger-m3-c2-adversarial.test.mjs
 * Execution: node --test tests/challenger-m3-c2-adversarial.test.mjs
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

const TEST_PORT = 3993;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-challenger-m3-c2-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

function getDb() {
  return JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
}

describe("Milestone 3 Challenger 2: Adversarial Fast-Track Re-Signing & Garage Polling", () => {
  const STALE_SIG = "data:image/png;base64,STALE_OLD_SIGNATURE_DATA_11111";
  const FRESH_SIG = "data:image/png;base64,FRESH_NEW_SIGNATURE_DATA_99999";
  const OLD_UUID = "fnrh-stale-uuid-0001";
  const OLD_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  before(async () => {
    // 0. Limpa porta se ocupada
    try {
      const netstatOutput = execSync(`netstat -ano | findstr :${TEST_PORT}`, { encoding: "utf8" });
      for (const line of netstatOutput.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1].endsWith(`:${TEST_PORT}`)) {
          const pid = parts[parts.length - 1];
          if (pid && pid !== "0") killProcessTree(pid);
        }
      }
      await new Promise(r => setTimeout(r, 400));
    } catch (_) {}

    // 1. Inicializa banco de dados com cenário desafiador
    const initialDb = fs.existsSync(prodDbPath)
      ? JSON.parse(fs.readFileSync(prodDbPath, "utf-8"))
      : {};

    initialDb.flats = [
      { id: 101, number: "201", receptionEmail: "recepcao.201@corpflats.com.br" },
      { id: 102, number: "202", receptionEmail: "recepcao.202@corpflats.com.br" }
    ];

    initialDb.settings = {
      ...(initialDb.settings || {}),
      receptionEmail: "portaria@corpflats.com.br",
      garageEmail: "garagem@corpflats.com.br",
      buildingName: "Edifício Soho Residence Service"
    };

    const todayStr = new Date().toISOString().substring(0, 10);

    // Reserva com perfil completo e re-assinatura pendente por alteração de flat e datas
    const resAdversarial = {
      id: 9901,
      code: "RES-CHALLENGE-001",
      guestName: "Dr. Roberto Macedo de Souza",
      guestEmail: "roberto.macedo@advocacia.com.br",
      guestPhone: "5522999887766",
      guestDocument: "12345678900",
      guestAddress: "Av. Alberto Lamego, 2000 - Parque Califórnia",
      guestCity: "Campos dos Goytacazes",
      guestState: "RJ",
      guestCep: "28013-602",
      flatId: 101,
      flatNumber: "201",
      checkinDate: todayStr,
      checkoutDate: "2026-10-18",
      guestCount: 2,
      dailyRate: 180,
      totalAmount: 360,
      paidAmount: 360,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "site_direto",
      fnhrCompleted: false, // Invalidado após modificação
      needsReSignature: true, // Flag obrigatória
      reSignatureReason: "Datas alteradas para hoje e flat transferido para 201",
      reSignatureUrl: "/pre-checkin/RES-CHALLENGE-001?resign=1",
      signatureUrl: null, // Stale signature cleared
      fnrhDocumentUuid: OLD_UUID,
      fnrhSha256Hash: OLD_HASH,
      vehicle: {
        plate: "RTO9B88",
        brand: "Honda",
        model: "Civic Touring",
        color: "Prata Metálico"
      },
      guests: [
        {
          index: 1,
          name: "Dr. Roberto Macedo de Souza",
          cpf: "12345678900",
          phone: "5522999887766",
          email: "roberto.macedo@advocacia.com.br",
          address: "Av. Alberto Lamego, 2000 - Parque Califórnia",
          city: "Campos dos Goytacazes",
          state: "RJ",
          cep: "28013-602",
          hasCompletedCheckin: false,
          needsReSignature: true
        },
        {
          index: 2,
          name: "Dra. Carolina Alcantara",
          cpf: "98765432100",
          phone: "5522999776655",
          email: "carolina.alcantara@advocacia.com.br",
          hasCompletedCheckin: false,
          needsReSignature: true
        }
      ]
    };

    initialDb.reservations = [resAdversarial];
    initialDb.fnrhAuditDocuments = initialDb.fnrhAuditDocuments || [];
    initialDb.reservationCommunications = initialDb.reservationCommunications || [];

    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    // Inicia servidor com processo isolado
    serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
      cwd: rootDir,
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        DATA_FILE: isolatedDbPath,
        DATABASE_FILE: isolatedDbPath,
        NODE_ENV: "test"
      },
      stdio: "pipe"
    });

    // Aguarda servidor responder no ping
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/system/version`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 250));
    }

    if (!ready) {
      throw new Error(`Servidor de teste não inicializou na porta ${TEST_PORT}`);
    }
  });

  after(async () => {
    if (serverProcess?.pid) {
      killProcessTree(serverProcess.pid);
    }
    await new Promise(r => setTimeout(r, 400));
    if (fs.existsSync(isolatedDbPath)) {
      try { fs.unlinkSync(isolatedDbPath); } catch (_) {}
    }
  });

  it("CHALLENGE 1: GET /api/pms/pre-checkin/:code com ?resign=1 preserva 100% dos dados cadastrais e veículo, e limpa assinatura antiga", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/pre-checkin/RES-CHALLENGE-001?resign=1`);
    assert.equal(res.status, 200, "Endpoint deve responder 200 OK");
    const data = await res.json();

    assert.ok(data.reservation, "Deve retornar reserva");
    const r = data.reservation;

    // Preservação 100% dos dados cadastrais
    assert.equal(r.guestName, "Dr. Roberto Macedo de Souza", "Nome completo deve ser preservado");
    assert.equal(r.guestDocument, "12345678900", "CPF/Documento deve ser preservado");
    assert.equal(r.guestPhone, "5522999887766", "Telefone deve ser preservado");
    assert.equal(r.guestEmail, "roberto.macedo@advocacia.com.br", "E-mail deve ser preservado");
    assert.equal(r.guestAddress, "Av. Alberto Lamego, 2000 - Parque Califórnia", "Endereço deve ser preservado");
    assert.equal(r.guestCity, "Campos dos Goytacazes", "Cidade deve ser preservada");
    assert.equal(r.guestState, "RJ", "Estado deve ser preservado");
    assert.equal(r.guestCep, "28013-602", "CEP deve ser preservado");

    // Preservação do veículo para autorização de garagem
    assert.ok(r.vehicle, "Objeto vehicle deve existir");
    assert.equal(r.vehicle.plate, "RTO9B88", "Placa do veículo deve ser preservada");
    assert.equal(r.vehicle.brand, "Honda", "Marca do veículo deve ser preservada");
    assert.equal(r.vehicle.model, "Civic Touring", "Modelo do veículo deve ser preservado");
    assert.equal(r.vehicle.color, "Prata Metálico", "Cor do veículo deve ser preservada");

    // Preservação dos acompanhantes cadastrados
    assert.equal(r.guests.length, 2, "Lista de hóspedes deve conter 2 ocupantes");
    assert.equal(r.guests[0].name, "Dr. Roberto Macedo de Souza");
    assert.equal(r.guests[1].name, "Dra. Carolina Alcantara");

    // Status de re-assinatura
    assert.equal(r.needsReSignature, true, "needsReSignature deve estar true");
    assert.equal(r.signatureUrl, null, "Assinatura anterior deve estar limpa/nula");
  });

  it("CHALLENGE 2: Simulação de carregamento do formulário frontend com ?resign=1 salta para Passo 3 e zera canvas", () => {
    const preCheckinPath = path.join(rootDir, "artifacts/limpeza/src/pages/guest-pre-checkin.tsx");
    const code = fs.readFileSync(preCheckinPath, "utf-8");

    // 1. Verificação de detecção do parâmetro resign=1
    assert.ok(
      code.includes('sp.get("resign") === "1"'),
      "Deve detectar ?resign=1 via URLSearchParams"
    );

    // 2. Verificação de salto direto para o Passo 3 (Assinatura)
    assert.ok(
      code.includes('if (sp.get("resign") === "1" && !sp.get("step")) return 3'),
      "Estado inicial de step deve ser 3 quando ?resign=1 e não há step explicito"
    );

    // 3. Verificação de invalidação do canvas de assinatura
    assert.ok(
      code.includes("const isReSignatureNeeded = Boolean("),
      "Deve calcular isReSignatureNeeded"
    );
    assert.ok(
      code.includes("const sig = isReSignatureNeeded ? null : ("),
      "Assinatura prévia deve ser forçada a null quando isReSignatureNeeded"
    );

    // 4. Verificação de preservação dos dados do veículo no formulário
    assert.ok(
      code.includes("setVehiclePlate(v.plate)"),
      "Deve preencher estado de placa de veículo preservado"
    );
    assert.ok(
      code.includes("setVehicleModel(v.model || \"\")"),
      "Deve preencher estado de modelo de veículo preservado"
    );
  });

  it("CHALLENGE 3: POST /api/pms/pre-checkin com resign='1' autentica nova assinatura, limpa needsReSignature e regenera FNRH", async () => {
    const submitPayload = {
      code: "RES-CHALLENGE-001",
      guestIndex: 1,
      fullName: "Dr. Roberto Macedo de Souza",
      document: "12345678900",
      phone: "5522999887766",
      email: "roberto.macedo@advocacia.com.br",
      birthDate: "1980-04-12",
      gender: "masculino",
      cep: "28013-602",
      address: "Av. Alberto Lamego, 2000 - Parque Califórnia",
      city: "Campos dos Goytacazes",
      state: "RJ",
      resign: "1",
      isReSignature: true,
      signatureBase64: FRESH_SIG,
      legalDeclarationAccepted: true,
      transportMethod: "Carro próprio",
      vehiclePlate: "RTO9B88",
      vehicleBrand: "Honda",
      vehicleModel: "Civic Touring",
      vehicleColor: "Prata Metálico"
    };

    const res = await fetch(`${BASE_URL}/api/pms/pre-checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submitPayload)
    });

    assert.equal(res.status, 200, "Submissão de re-assinatura deve retornar 200 OK");
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.fnrhDocument, "Deve retornar novo documento FNRH gerado");

    const newDoc = json.fnrhDocument;
    assert.ok(newDoc.documentUuid, "Deve conter novo documentUuid");
    assert.notEqual(newDoc.documentUuid, OLD_UUID, "Novo UUID deve ser diferente do antigo UUID obsoleto");
    assert.ok(newDoc.sha256Hash, "Deve conter hash SHA-256");
    assert.equal(newDoc.sha256Hash.length, 64, "Hash SHA-256 deve ter 64 caracteres hexadecimais");
    assert.notEqual(newDoc.sha256Hash, OLD_HASH, "Novo hash deve ser diferente do antigo");

    // Verifica persistência e saneamento no banco de dados
    const db = getDb();
    const r = db.reservations.find(x => x.code === "RES-CHALLENGE-001");
    assert.ok(r, "Reserva deve existir no banco");

    // Hóspede titular teve a pendência de re-assinatura liberada
    const g1 = r.guests.find(g => g.index === 1);
    assert.equal(g1.hasCompletedCheckin, true, "Titular deve ter hasCompletedCheckin=true");
    assert.equal(g1.needsReSignature, false, "needsReSignature do titular deve ser false");
    assert.equal(g1.fnrhDocumentUuid, newDoc.documentUuid, "UUID do titular deve ser atualizado");
    assert.equal(g1.fnrhSha256Hash, newDoc.sha256Hash, "Hash do titular deve ser atualizado");

    // Acompanhante 2 ainda pendente
    const g2 = r.guests.find(g => g.index === 2);
    assert.equal(g2.needsReSignature, true, "needsReSignature do acompanhante deve permanecer true até ele assinar");

    // Agora assina o acompanhante 2 para verificar liberação global da reserva
    const submitPayloadG2 = {
      code: "RES-CHALLENGE-001",
      guestIndex: 2,
      fullName: "Dra. Carolina Alcantara",
      document: "98765432100",
      phone: "5522999776655",
      email: "carolina.alcantara@advocacia.com.br",
      birthDate: "1985-08-20",
      gender: "feminino",
      resign: "1",
      isReSignature: true,
      signatureBase64: FRESH_SIG,
      legalDeclarationAccepted: true
    };

    const resG2 = await fetch(`${BASE_URL}/api/pms/pre-checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submitPayloadG2)
    });
    assert.equal(resG2.status, 200);

    const dbFinal = getDb();
    const rFinal = dbFinal.reservations.find(x => x.code === "RES-CHALLENGE-001");
    // Agora que ambos assinaram, toda a reserva é liberada
    assert.equal(rFinal.needsReSignature, false, "needsReSignature da reserva inteira deve ser false");
    assert.equal(rFinal.fnhrCompleted, true, "fnhrCompleted da reserva inteira deve ser true");
    assert.equal(rFinal.reSignatureReason, undefined, "reSignatureReason deve ser removido");

    // Trilha de auditoria interna registrada
    assert.ok(
      dbFinal.fnrhAuditDocuments.length >= 2,
      "Devem haver trilhas de auditoria forense registradas"
    );
  });

  it("CHALLENGE 4: Verificação do fluxo de redirecionamento do Fast-Track (?resign_success=1)", () => {
    const preCheckinPath = path.join(rootDir, "artifacts/limpeza/src/pages/guest-pre-checkin.tsx");
    const code = fs.readFileSync(preCheckinPath, "utf-8");

    // Verifica que o frontend redireciona para o portal após sucesso da re-assinatura
    assert.ok(
      code.includes("if (isReSignatureNeeded || resData.wasReSignature)"),
      "Deve verificar se foi um fluxo de re-assinatura após sucesso"
    );
    assert.ok(
      code.includes("resign_success=1"),
      "Deve redirecionar para /minha-reserva/:code?resign_success=1"
    );
    assert.ok(
      code.includes("setTimeout(() => {"),
      "Deve aguardar timeout para fornecer feedback ao usuário antes de redirecionar"
    );
  });

  it("CHALLENGE 5: Garage Dashboard Polling de 30s, escutas de visibilidade/foco e limpeza no unmount", () => {
    const garagePath = path.join(rootDir, "artifacts/limpeza/src/pages/garage-dashboard.tsx");
    const code = fs.readFileSync(garagePath, "utf-8");

    // 1. Polling de 30 segundos com setInterval
    assert.ok(code.includes("setInterval"), "Deve usar setInterval para background polling");
    assert.ok(code.includes("30000"), "Intervalo de polling deve ser exatamente 30000ms (30 segundos)");

    // 2. Modo silencioso (silent=true) no polling contínuo para evitar flicker na interface
    assert.ok(
      code.includes("fetchGarageData(true)"),
      "Deve chamar fetchGarageData(true) no polling silencioso"
    );
    assert.ok(
      code.includes("if (!silent) setLoading(true)"),
      "Modo silencioso não deve reativar spinner setLoading(true)"
    );

    // 3. Event listeners de foco e visibilidade
    assert.ok(
      code.includes('window.addEventListener("focus", handleVisibilityOrFocus)'),
      "Deve registrar listener na janela para evento 'focus'"
    );
    assert.ok(
      code.includes('document.addEventListener("visibilitychange", handleVisibilityOrFocus)'),
      "Deve registrar listener no documento para evento 'visibilitychange'"
    );

    // 4. Limpeza rigorosa no desmonte (cleanup function)
    assert.ok(code.includes("return () => {"), "Deve ter função de retorno para cleanup");
    assert.ok(code.includes("clearInterval(intervalId)"), "Cleanup deve executar clearInterval");
    assert.ok(
      code.includes('window.removeEventListener("focus", handleVisibilityOrFocus)'),
      "Cleanup deve remover listener de focus"
    );
    assert.ok(
      code.includes('document.removeEventListener("visibilitychange", handleVisibilityOrFocus)'),
      "Cleanup deve remover listener de visibilitychange"
    );

    // 5. useCallback para estabilidade referencial de dependência
    assert.ok(
      code.includes("useCallback(async (silent = false) => {"),
      "fetchGarageData deve ser memoizado via useCallback"
    );
  });

  it("CHALLENGE 6: Sincronização dinâmica da relação diária da garagem (/api/pms/garage/daily-sheet)", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/garage/daily-sheet`);
    assert.equal(res.status, 200, "Daily sheet deve responder 200 OK");
    const json = await res.json();

    assert.ok(Array.isArray(json.vehicles), "Deve retornar array de veículos");

    // O veículo da reserva RES-CHALLENGE-001 (que teve checkin hoje) deve estar presente
    const v = json.vehicles.find(x => x.reservationCode === "RES-CHALLENGE-001");
    assert.ok(v, "Veículo de RES-CHALLENGE-001 deve figurar na relação de hoje");
    assert.equal(v.plate, "RTO9B88", "Placa do veículo deve corresponder");
    assert.equal(v.flatNumber, "201", "Flat atualizado (201) deve ser refletido imediatamente");
    assert.equal(v.guestName, "Dr. Roberto Macedo de Souza");
    assert.equal(v.model, "Civic Touring");
  });
});

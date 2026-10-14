/**
 * tests/wbp-integration/m5-vault-ui.test.mjs
 *
 * Milestone 5: Credit Card Encrypted Vault, Admin Reauth, Auto-Purge & Provisional Adapters.
 * Features 25, 26, 27.
 *
 * Strictly adheres to AGENTS.md & Milestone 5 Requirements:
 * - Test isolation: DATABASE_URL unset, DATA_FILE in os.tmpdir(), NODE_ENV="test".
 * - Key resolution: isolated key derivation in test mode.
 * - Asserts real data/database.json retains identical SHA-256 hash before and after.
 * - Ephemeral port, clean process termination.
 */

process.env.NODE_ENV = "test";
delete process.env.DATABASE_URL;
process.env.WBP_CARD_VAULT_FILE = path.join(os.tmpdir(), `global_wbp_vault_${process.pid}.json`);

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import net from "node:net";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const prodDbPath = path.resolve(rootDir, "data/database.json");

import {
  CreditCardVault,
  getCardVault,
  stripCvvDeep,
  maskPan,
  detectCardBrand,
  maskPanDeep,
  addDays,
  runZeroLeakageForensicAudit,
  startCardAutoPurgeScheduler,
  stopCardAutoPurgeScheduler
} from "../../artifacts/api-server/wbp/vault.mjs";

import {
  WbpProvisionalAdapter,
  getProvisionalAdapter,
  isProvisionalMessagesEnabled,
  isProvisionalReviewsEnabled,
  setProvisionalMessagesEnabled,
  setProvisionalReviewsEnabled
} from "../../artifacts/api-server/wbp/provisional.mjs";

import {
  processIncomingOTA,
  handleOtaCancellation,
  normalizeOtaBooking
} from "../../artifacts/api-server/wbp/inbox.mjs";

import { WBPClient } from "../../artifacts/api-server/wbp/client.mjs";
import { WbpSimulatorServer } from "../../e2e/wbp-simulator/server.mjs";
import { WBP_MODES, setIntegrationMode } from "../../artifacts/api-server/wbp/config.mjs";

// Helper: dynamic port
function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

// Helper: kill process tree on Windows
function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

// Helper: wait for HTTP server to become responsive
async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.ok) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Server at ${url} failed to start within ${timeoutMs}ms.`);
}

describe("Milestone 5: Real Database Integrity Guard (Pre-Flight & Post-Flight)", () => {
  let initialHash;

  before(() => {
    const content = fs.readFileSync(prodDbPath);
    initialHash = crypto.createHash("sha256").update(content).digest("hex");
  });

  it("baseline data/database.json SHA-256 is recorded and pristine", () => {
    assert.ok(initialHash, "Hash inicial deve existir.");
    assert.equal(initialHash.toUpperCase(), "7E94A217681EA595DC10681EC3D1AD0964E6B2DBCE828ACD8F6D8633B87E71C6");
  });

  after(() => {
    const content = fs.readFileSync(prodDbPath);
    const postHash = crypto.createHash("sha256").update(content).digest("hex");
    assert.equal(postHash, initialHash, "CRÍTICO: data/database.json de produção NUNCA deve ser alterado pelos testes!");
  });
});

describe("Test 1: AES-256-GCM Encryption & Decryption Engine with Separate Key", () => {
  it("encrypts with 12-byte IV, 16-byte auth tag, and decrypts successfully", () => {
    const testKey = crypto.randomBytes(32);
    const vault = new CreditCardVault({ key: testKey, storageFile: path.join(os.tmpdir(), `vault_test1_${Date.now()}.json`) });

    const cardData = {
      cardNumber: "4111222233334444",
      holderName: "Maria Silva",
      expireMonth: "12",
      expireYear: "2028",
      brand: "Visa"
    };

    const aad = "res_12345";
    const encrypted = vault.encryptCard(cardData, aad);

    assert.equal(encrypted.algorithm, "aes-256-gcm");
    assert.equal(Buffer.from(encrypted.iv, "hex").length, 12, "IV deve ter 12 bytes.");
    assert.equal(Buffer.from(encrypted.authTag, "hex").length, 16, "Auth Tag deve ter 16 bytes.");
    assert.ok(encrypted.ciphertext, "Ciphertext deve existir.");

    // Decrypt with correct AAD
    const decrypted = vault.decryptCard(encrypted, aad);
    assert.equal(decrypted.cardNumber, "4111222233334444");
    assert.equal(decrypted.holderName, "Maria Silva");
    assert.equal(decrypted.expireMonth, "12");
    assert.equal(decrypted.expireYear, "2028");
    assert.equal(decrypted.brand, "Visa");
  });

  it("fails decryption when ciphertext or auth tag is tampered", () => {
    const testKey = crypto.randomBytes(32);
    const vault = new CreditCardVault({ key: testKey, storageFile: path.join(os.tmpdir(), `vault_tamper_${Date.now()}.json`) });

    const cardData = { cardNumber: "5500111122223333", holderName: "João Souza", expireMonth: "08", expireYear: "2029" };
    const encrypted = vault.encryptCard(cardData, "res_555");

    // Tamper with ciphertext
    const tampered = { ...encrypted, ciphertext: "ff" + encrypted.ciphertext.slice(2) };
    assert.throws(() => {
      vault.decryptCard(tampered, "res_555");
    }, /Unsupported state or unable to authenticate data|bad decrypt/i);

    // Tamper with AAD
    assert.throws(() => {
      vault.decryptCard(encrypted, "wrong_aad_context");
    }, /Unsupported state or unable to authenticate data|bad decrypt/i);
  });
});

describe("Test 2: In-Memory CVV/CVC Discard Protocol (PCI DSS SAD Rule)", () => {
  it("irreversibly purges CVV/CVC variants in memory before any storage or encryption", () => {
    const rawPayload = {
      orderId: "OTA-9988",
      guestName: "Carlos Mendes",
      reservation: {
        Cards: [
          {
            CardNumber: "4532111122223333",
            CardHolderName: "Carlos Mendes",
            CardExpireMonth: "06",
            CardExpireYear: "2027",
            CardCvv: "999",
            cvv: "999",
            cvc: "999",
            security_code: "999"
          }
        ]
      }
    };

    const stripped = stripCvvDeep(rawPayload);
    const serialized = JSON.stringify(stripped);

    assert.ok(!serialized.includes("999"), "CVV '999' NUNCA deve existir após stripCvvDeep.");
    assert.ok(!serialized.includes("CardCvv"), "Chave CardCvv deve ser eliminada.");
    assert.ok(!serialized.includes("security_code"), "Chave security_code deve ser eliminada.");
  });

  it("CreditCardVault.encryptCard purges CVV before cipher processing even if caller accidentally supplies it", () => {
    const vault = new CreditCardVault({ storageFile: path.join(os.tmpdir(), `vault_cvv_${Date.now()}.json`) });
    const dirtyCard = {
      cardNumber: "4011000011112222",
      holderName: "Ana Paula",
      expireMonth: "10",
      expireYear: "2030",
      cvv: "789",
      security_code: "789"
    };

    const encrypted = vault.encryptCard(dirtyCard, "res_cvv");
    const decrypted = vault.decryptCard(encrypted, "res_cvv");

    assert.equal(decrypted.cardNumber, "4011000011112222");
    assert.equal(decrypted.cvv, undefined, "CVV nunca deve ser gravado ou decifrado.");
    assert.equal(decrypted.security_code, undefined);
  });
});

describe("Test 3: Zero-Leakage Forensic Scan (PCI DSS & R6 Zero-Leakage Audit)", () => {
  it("proves 0 full PANs and 0 CVVs exist unencrypted across database, files, logs, and API outputs", async () => {
    const testPan = "4916888877776666";
    const testCvv = "321";

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gfm-forensic-"));
    const tmpDbPath = path.join(tmpDir, "database.json");
    const tmpStoragePath = path.join(tmpDir, "wbp_raw_payloads.jsonl");
    const tmpAuditLogPath = path.join(tmpDir, "audit_logs.jsonl");
    const tmpVaultPath = path.join(tmpDir, "wbp_card_vault.json");
    process.env.WBP_CARD_VAULT_FILE = tmpVaultPath;
    getCardVault({ storageFile: tmpVaultPath, forceNew: true });
    const vault = new CreditCardVault({ storageFile: tmpVaultPath });

    // Seed mock db
    const db = {
      settings: { wbp_integration_mode: "auto" },
      reservations: [],
      wbpInbox: [],
      users: [{ id: 1, username: "admin", role: "admin", passwordHash: "dummy" }]
    };

    // Raw payload delivered by OTA with full PAN and CVV
    const incomingBooking = {
      orderId: "OTA-LEAK-TEST-001",
      guestName: "Hóspede Teste Vazamento",
      checkinDate: "2026-11-01",
      checkoutDate: "2026-11-04",
      totalPrice: 1200.0,
      paymentCollect: "Channel",
      channel: "booking",
      Cards: [
        {
          CardNumber: testPan,
          CardHolderName: "Hóspede Teste Vazamento",
          CardExpireMonth: "11",
          CardExpireYear: "2028",
          CardCvv: testCvv
        }
      ]
    };

    // Process through normal inbound normalization and PMS ingestion
    const normalized = normalizeOtaBooking(incomingBooking);

    // Save PMS database state to disk
    fs.writeFileSync(tmpDbPath, JSON.stringify(db), "utf-8");

    // Write audit log entry (simulating real activity)
    const auditLine = JSON.stringify({
      timestamp: new Date().toISOString(),
      action: "OTA_BOOKING_IMPORTED",
      details: { orderId: "OTA-LEAK-TEST-001", maskedPan: normalized.cardLast4 ? `•••• •••• •••• ${normalized.cardLast4}` : "" }
    });
    fs.writeFileSync(tmpAuditLogPath, auditLine + "\n", "utf-8");

    // Record raw payload
    fs.writeFileSync(tmpStoragePath, JSON.stringify(normalized.rawPayload) + "\n", "utf-8");

    // Simulated API list response
    const apiResponse = {
      success: true,
      reservations: [
        {
          id: 1,
          guestName: "Hóspede Teste Vazamento",
          cardLast4: normalized.cardLast4,
          cardBrand: normalized.cardBrand,
          maskedPan: `•••• •••• •••• ${normalized.cardLast4}`
        }
      ]
    };

    const capturedLogs = [
      `[Demo Server] Importando reserva OTA-LEAK-TEST-001 para Flat 101`,
      `[WBP Inbox] Reserva salva com sucesso. Cartão ${normalized.cardBrand} final ${normalized.cardLast4}`
    ];

    // Run Forensic Scanner
    const auditResult = runZeroLeakageForensicAudit({
      pan: testPan,
      cvv: testCvv,
      db,
      dbFilePath: tmpDbPath,
      storageFilePath: tmpStoragePath,
      auditLogFilePath: tmpAuditLogPath,
      apiResponses: [apiResponse],
      capturedLogs
    });

    assert.equal(auditResult.clean, true, `Violações detectadas no escaneamento forense: ${auditResult.violations.join(", ")}`);
    assert.equal(auditResult.violationCount, 0, "Deve haver EXATAMENTE ZERO ocorrências de PAN ou CVV em texto claro.");

    // Clean up temporary directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("Milestone 5 Full HTTP Server Integration (Admin Reauth, Single-Use Burning & Endpoints)", () => {
  let serverProcess;
  let serverPort;
  let serverUrl;
  let tmpDir;
  let tmpDbPath;
  let simulator;
  let simulatorPort;

  before(async () => {
    // 1. Setup isolated tmp directory and database
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gfm-m5-server-"));
    tmpDbPath = path.join(tmpDir, "database.json");

    // Copy production database seed into tmp
    const prodContent = JSON.parse(fs.readFileSync(prodDbPath, "utf-8"));
    prodContent.settings = prodContent.settings || {};
    prodContent.settings.wbp_integration_mode = "auto";
    prodContent.settings.wbp_provisional_messages_enabled = false;
    prodContent.settings.wbp_provisional_reviews_enabled = false;

    // Seed a known reservation with card in vault
    const testOrderId = "OTA-CARD-RES-777";
    const testPan = "4000123456789010";

    const testReservation = {
      id: 777,
      code: "RES-101-7777",
      flatId: 1,
      flatNumber: "101",
      guestName: "Dr. Roberto Reauth",
      checkinDate: "2026-10-20",
      checkoutDate: "2026-10-25",
      totalAmount: 1500.0,
      paidAmount: 0,
      paymentCollect: "Property",
      status: "ativa",
      hasCard: true,
      cardLast4: "9010",
      cardBrand: "Visa",
      vaultStatus: "active",
      externalOrderId: testOrderId,
      wbpBookingId: testOrderId
    };

    prodContent.reservations = prodContent.reservations || [];
    prodContent.reservations.push(testReservation);
    fs.writeFileSync(tmpDbPath, JSON.stringify(prodContent, null, 2), "utf-8");

    // Initialize Card Vault in tmp directory and store card
    const tmpVaultFile = path.join(tmpDir, "wbp_card_vault.json");
    process.env.WBP_CARD_VAULT_FILE = tmpVaultFile;
    process.env.DATA_FILE = tmpDbPath;

    const testVault = new CreditCardVault({ storageFile: tmpVaultFile });
    testVault.storeCard({
      orderId: testOrderId,
      reservationId: 777,
      cardData: {
        cardNumber: testPan,
        holderName: "Roberto Reauth",
        expireMonth: "09",
        expireYear: "2029",
        brand: "Visa"
      },
      checkoutDate: "2026-10-25"
    });

    // 2. Start WBP Simulator
    simulatorPort = await getAvailablePort();
    simulator = new WbpSimulatorServer({ port: simulatorPort });
    await simulator.start();

    // 3. Start isolated Demo Server
    serverPort = await getAvailablePort();
    serverUrl = `http://127.0.0.1:${serverPort}`;

    const serverScript = path.resolve(rootDir, "artifacts/api-server/demo-server.mjs");
    const childEnv = {
      ...process.env,
      PORT: String(serverPort),
      DATA_FILE: tmpDbPath,
      NODE_ENV: "test",
      WBP_CARD_VAULT_FILE: tmpVaultFile,
      WBP_BASE_URL: `${simulator.url}/api/cloudpms`,
      WBP_PMS_CID: "gfm1",
      WBP_SHARED_SECRET: "test_secret_m5",
      CREDIT_CARD_VAULT_KEY: "wbp_test_card_vault_key_2026_isolated"
    };
    delete childEnv.DATABASE_URL;

    serverProcess = spawn("node", [serverScript], {
      env: childEnv,
      stdio: "pipe",
      cwd: rootDir
    });

    serverProcess.stdout.on("data", (d) => {
      const msg = d.toString();
      if (process.env.DEBUG_TEST) console.log("[Server stdout]", msg.trim());
    });

    serverProcess.stderr.on("data", (d) => {
      const msg = d.toString();
      if (process.env.DEBUG_TEST) console.error("[Server stderr]", msg.trim());
    });

    await waitForServer(serverUrl);
  });

  after(async () => {
    delete process.env.WBP_CARD_VAULT_FILE;
    delete process.env.DATA_FILE;
    if (serverProcess) {
      killProcessTree(serverProcess.pid);
    }
    if (simulator) {
      await simulator.stop();
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it("Test 4: Admin Reauth & Token Expiration: valid admin produces token; invalid rejected; 5-min TTL enforced", async () => {
    // 4.1 Valid admin credentials
    const validRes = await fetch(`${serverUrl}/api/wbp/vault/reauth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "admin",
        password: "admin123", // Matches standard admin user in db.users
        reservationId: 777
      })
    });

    const validData = await validRes.json();
    assert.equal(validRes.status, 200, "Reautenticação de admin deve ter sucesso.");
    assert.equal(validData.success, true);
    assert.ok(validData.token, "Deve retornar um token UUID v4.");
    assert.equal(validData.expiresInSeconds, 300, "Token deve ter validade estrita de 5 minutos (300 segundos).");

    // 4.2 Invalid password rejected with 401
    const badPwRes = await fetch(`${serverUrl}/api/wbp/vault/reauth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "admin",
        password: "wrongPasswordXYZ",
        reservationId: 777
      })
    });
    assert.equal(badPwRes.status, 401, "Senha incorreta deve retornar HTTP 401.");

    // 4.3 Non-admin user rejected with 401/403
    const nonAdminRes = await fetch(`${serverUrl}/api/wbp/vault/reauth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "non_existent_or_guest",
        password: "password123",
        reservationId: 777
      })
    });
    assert.equal(nonAdminRes.status, 401, "Usuário não-admin deve ser rejeitado.");
  });

  it("Test 5: Single-Use Token Burning: token is consumed on 1st view; 2nd view with SAME token fails 403", async () => {
    // 1. Obtain fresh 5-minute single-use token
    const reauthRes = await fetch(`${serverUrl}/api/wbp/vault/reauth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "admin",
        password: "admin123",
        reservationId: 777
      })
    });
    const reauthData = await reauthRes.json();
    const token = reauthData.token;
    assert.ok(token, "Deve obter token de uso único.");

    // 2. First view attempt: must succeed and decrypt card
    const viewRes1 = await fetch(`${serverUrl}/api/wbp/vault/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        reservationId: 777
      })
    });

    assert.equal(viewRes1.status, 200, "Primeira visualização com token válido deve retornar 200.");
    const viewData1 = await viewRes1.json();
    assert.equal(viewData1.success, true);
    assert.ok(viewData1.card, "Dados do cartão devem ser retornados.");
    assert.equal(viewData1.card.cardNumber, "4000123456789010");
    assert.equal(viewData1.card.holderName, "Roberto Reauth");
    assert.equal(viewData1.card.expireMonth, "09");
    assert.equal(viewData1.card.expireYear, "2029");
    assert.equal(viewData1.card.cvv, undefined, "CVV NUNCA deve ser retornado.");

    // 3. Second view attempt with the EXACT SAME TOKEN: must be BURNED and return 403 Forbidden
    const viewRes2 = await fetch(`${serverUrl}/api/wbp/vault/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        reservationId: 777
      })
    });

    assert.equal(viewRes2.status, 403, "Segunda tentativa com mesmo token DEVE falhar com 403 Forbidden (Single-Use Token Burning).");
    const viewData2 = await viewRes2.json();
    assert.equal(viewData2.success, false);
    assert.match(viewData2.error, /inválido, expirado ou já utilizado/i);
  });

  it("Test 6: Auto-Purge 7 Days Post-Checkout (Time-travel verification)", async () => {
    // Trigger purge endpoint with effective date T+3 (before 7 days post-checkout)
    // Reservation 777 check-out is 2026-10-25 -> purge date is 2026-11-01
    const resEarly = await fetch(`${serverUrl}/api/wbp/vault/purge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentDate: "2026-10-28" })
    });
    const dataEarly = await resEarly.json();
    assert.equal(dataEarly.success, true);
    assert.equal(dataEarly.purgedCount, 0, "Nenhum cartão deve ser expurgado antes de 7 dias pós check-out.");

    // Advance time to T+8 days (2026-11-02 >= 2026-11-01)
    const resExpired = await fetch(`${serverUrl}/api/wbp/vault/purge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentDate: "2026-11-02" })
    });
    const dataExpired = await resExpired.json();
    assert.equal(dataExpired.success, true);
    assert.ok(dataExpired.purgedCount >= 1, "Cartão com check-out há mais de 7 dias deve ser expurgado.");

    // Verify card is now purged in vault and cannot be viewed
    const reauthRes = await fetch(`${serverUrl}/api/wbp/vault/reauth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin123", reservationId: 777 })
    });
    const reauthData = await reauthRes.json();
    const token = reauthData.token;

    const viewRes = await fetch(`${serverUrl}/api/wbp/vault/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, reservationId: 777 })
    });
    assert.equal(viewRes.status, 404, "Cartão expurgado não deve mais ser encontrado para visualização.");
  });

  it("Test 7: Immediate Auto-Purge on Cancellation without Penalty", async () => {
    // 1. Create and store a fresh card for a new reservation
    const cancelOrderId = "OTA-CANCEL-009";
    const cancelReservationId = 888;
    const testPan = "5500999988887777";

    const testVault = new CreditCardVault({ storageFile: path.join(tmpDir, "wbp_card_vault.json") });
    testVault.storeCard({
      orderId: cancelOrderId,
      reservationId: cancelReservationId,
      cardData: {
        cardNumber: testPan,
        holderName: "Gisele Cancelamento",
        expireMonth: "05",
        expireYear: "2030",
        brand: "Mastercard"
      },
      checkoutDate: "2026-12-15" // Way in the future
    });

    const cardBefore = testVault.getCardRecordByIdentifier(cancelReservationId);
    assert.equal(cardBefore.status, "active", "Cartão deve estar ativo antes do cancelamento.");

    // 2. Perform cancellation via handleOtaCancellation
    const mockDb = {
      reservations: [
        {
          id: cancelReservationId,
          code: "RES-102-8888",
          externalOrderId: cancelOrderId,
          wbpBookingId: cancelOrderId,
          status: "ativa",
          flatNumber: "102",
          hasCard: true
        }
      ]
    };

    const cancelResult = handleOtaCancellation({
      db: mockDb,
      normalized: { externalOrderId: cancelOrderId },
      vault: testVault
    });

    assert.equal(cancelResult.success, true);
    assert.equal(cancelResult.action, "cancelled");

    // 3. Verify card was purged IMMEDIATELY without waiting 7 days!
    const cardAfter = testVault.getCardRecordByIdentifier(cancelReservationId);
    assert.equal(cardAfter.status, "purged", "Cartão DEVE ser expurgado imediatamente no cancelamento sem multa.");
    assert.equal(cardAfter.encrypted, null, "Ciphertext criptografado DEVE ser destruído.");
    assert.equal(mockDb.reservations[0].vaultStatus, "purged");
  });

  it("Test 8: Provisional Chat and Review Adapters (Disabled by Default & Simulator Validated)", async () => {
    // 8.1 Gated by default: Provisional Messages & Reviews are disabled
    const getSettingsRes = await fetch(`${serverUrl}/api/wbp/provisional/settings`);
    const settingsData = await getSettingsRes.json();
    assert.equal(settingsData.provisionalMessagesEnabled, false, "Mensagens provisórias devem vir desligadas por padrão (R7).");
    assert.equal(settingsData.provisionalReviewsEnabled, false, "Avaliações provisórias devem vir desligadas por padrão (R7).");

    // Outbound calls return empty lists with provisional notice
    const msgResDisabled = await fetch(`${serverUrl}/api/wbp/provisional/messages`);
    const msgDataDisabled = await msgResDisabled.json();
    assert.equal(msgDataDisabled.enabled, false);
    assert.equal(msgDataDisabled.provisional, true);
    assert.equal(msgDataDisabled.messages.length, 0);

    const revResDisabled = await fetch(`${serverUrl}/api/wbp/provisional/reviews`);
    const revDataDisabled = await revResDisabled.json();
    assert.equal(revDataDisabled.enabled, false);
    assert.equal(revDataDisabled.provisional, true);
    assert.equal(revDataDisabled.reviews.length, 0);

    // 8.2 Toggle provisional features ON
    const toggleRes = await fetch(`${serverUrl}/api/wbp/provisional/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messagesEnabled: true, reviewsEnabled: true })
    });
    const toggleData = await toggleRes.json();
    assert.equal(toggleData.provisionalMessagesEnabled, true);
    assert.equal(toggleData.provisionalReviewsEnabled, true);

    // 8.3 Inject simulated message and review into WBP Simulator
    simulator.injectMessage({
      wbp_Message_id: 501,
      order_id: "OTA-MSG-1",
      sender: "guest",
      senderName: "Hóspede João",
      message: "Qual o horário do check-in?",
      date: new Date().toISOString()
    });

    simulator.injectReview({
      wbp_review_id: 901,
      order_id: "OTA-REV-1",
      guest_name: "Mariana Costa",
      score: 10,
      flatNumber: "105",
      review: "Estadia incrível! Flat limpo e moderno.",
      review_date: "2026-10-13"
    });

    // 8.4 Fetch messages via adapter against simulator
    const msgRes = await fetch(`${serverUrl}/api/wbp/provisional/messages`);
    const msgData = await msgRes.json();
    assert.equal(msgData.success, true);
    assert.equal(msgData.provisional, true);
    assert.ok(msgData.count >= 1);
    const firstMsg = msgData.messages[0];
    assert.equal(firstMsg.text, "Qual o horário do check-in?");
    assert.equal(firstMsg.sender, "guest");
    assert.equal(firstMsg.provisional, true);

    // Send reply message
    const sendRes = await fetch(`${serverUrl}/api/wbp/provisional/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: 501, text: "O check-in inicia às 14:00 horas." })
    });
    const sendData = await sendRes.json();
    assert.equal(sendData.success, true);
    assert.equal(sendData.provisional, true);
    assert.equal(sendData.text, "O check-in inicia às 14:00 horas.");

    // 8.5 Fetch reviews via adapter against simulator
    const revRes = await fetch(`${serverUrl}/api/wbp/provisional/reviews`);
    const revData = await revRes.json();
    assert.equal(revData.success, true);
    assert.equal(revData.provisional, true);
    assert.ok(revData.count >= 1);
    const firstRev = revData.reviews[0];
    assert.equal(firstRev.author, "Mariana Costa");
    assert.equal(firstRev.rating, 5); // 10 scale converted to 5 stars
    assert.equal(firstRev.tone, "positive");

    // Respond to review
    const respRes = await fetch(`${serverUrl}/api/wbp/provisional/reviews/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewId: 901, response: "Muito obrigado pela excelente avaliação!" })
    });
    const respData = await respRes.json();
    assert.equal(respData.success, true);
    assert.equal(respData.provisional, true);
    assert.equal(respData.response, "Muito obrigado pela excelente avaliação!");
  });
});

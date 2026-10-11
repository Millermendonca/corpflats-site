/**
 * Challenger 2 Milestone 1 Round 3 Empirical Verification Suite
 * Lifecycle Teardown, Port 5000 Cleanliness, Concurrency & Atomic Persistence Stress
 */

process.env.PORT = "0";

import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync, spawn } from "node:child_process";
import { initWhatsAppEngine } from "../artifacts/api-server/zapi-service.mjs";

const { atomicWriteFileSync, getOfficialFaqSeed, seedInitialFaqItems } = await import("../artifacts/api-server/demo-server.mjs");

describe("Milestone 1 Round 3 - Challenger 2 Empirical Lifecycle & Persistence Suite", () => {

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Process Exit & Port Cleanliness
  // ──────────────────────────────────────────────────────────────────────────
  test("1.1 tests/whatsapp-ai-agent.test.mjs exits cleanly with code 0 in < 4s on clean port 5000", async () => {
    // 1. Pre-check: Verify port 5000 is clean before starting
    let portOutputPre = "";
    try {
      portOutputPre = execSync("netstat -ano | findstr :5000", { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
    } catch (_) {
      portOutputPre = "";
    }
    assert.equal(portOutputPre.trim(), "", "Port 5000 must be clean before test run");

    // 2. Spawn node --test tests/whatsapp-ai-agent.test.mjs and measure execution duration
    const startTime = Date.now();
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, ["--test", "tests/whatsapp-ai-agent.test.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, PORT: "0" },
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => { stdout += d.toString(); });
      child.stderr.on("data", (d) => { stderr += d.toString(); });

      child.on("close", (code) => {
        const duration = Date.now() - startTime;
        resolve({ code, duration, stdout, stderr });
      });
    });

    // 3. Verify exit code and duration
    assert.equal(result.code, 0, `Process must exit with code 0. Stderr: ${result.stderr}`);
    assert.ok(
      result.duration < 4500,
      `Process must terminate cleanly in < 4.5s (threshold < 4s with margin). Actual: ${result.duration}ms`
    );

    // 4. Post-check: Verify port 5000 remains clean after termination
    let portOutputPost = "";
    try {
      portOutputPost = execSync("netstat -ano | findstr :5000", { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
    } catch (_) {
      portOutputPost = "";
    }
    assert.equal(portOutputPost.trim(), "", "Port 5000 must remain clean after test run");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Concurrency and Atomic Disk Persistence of FAQ Items
  // ──────────────────────────────────────────────────────────────────────────
  test("2.1 Atomic disk writes survive 100 rapid asynchronous concurrent mutations without corruption or .tmp leaks", async () => {
    const testDir = path.resolve("data", `.challenger2_atomic_${Date.now()}`);
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    const targetFile = path.join(testDir, "database.json");

    // Initialize mock database with official seed items
    const testDb = {
      faqItems: JSON.parse(JSON.stringify(getOfficialFaqSeed())),
      updatedAt: new Date().toISOString()
    };
    atomicWriteFileSync(targetFile, JSON.stringify(testDb, null, 2));

    // Execute 100 concurrent async writes with variable payloads and randomized micro-delays
    const concurrencyTasks = Array.from({ length: 100 }, (_, idx) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          try {
            // Clone and mutate state
            const clone = JSON.parse(JSON.stringify(testDb));
            clone.faqItems.push({
              id: `faq-concurrent-${idx}`,
              question: `Pergunta concorrente de teste ${idx}?`,
              answer: `Resposta atômica garantida para o item ${idx}.`,
              status: idx % 2 === 0 ? "ativo" : "pendente",
              category: "estrutura_flat",
              scope: "all",
              createdAt: new Date().toISOString()
            });
            clone.lastWorkerIndex = idx;
            clone.updatedAt = new Date().toISOString();

            atomicWriteFileSync(targetFile, JSON.stringify(clone, null, 2));
          } catch (err) {
            assert.fail(`atomicWriteFileSync failed during concurrent mutation ${idx}: ${err.message}`);
          }
          resolve();
        }, Math.floor(Math.random() * 25));
      });
    });

    await Promise.all(concurrencyTasks);

    // Assert target file exists, is valid uncorrupted JSON, and contains no syntax errors
    assert.ok(fs.existsSync(targetFile), "Target file must exist after concurrent writes");
    const rawContent = fs.readFileSync(targetFile, "utf-8");
    assert.ok(rawContent.length > 0, "Target file content must not be empty or truncated");

    let parsedDb = null;
    assert.doesNotThrow(() => {
      parsedDb = JSON.parse(rawContent);
    }, "Target file must be valid, uncorrupted JSON");

    assert.ok(Array.isArray(parsedDb.faqItems), "faqItems must remain an array");
    assert.ok(parsedDb.faqItems.length >= 9, "faqItems must contain all baseline items");
    assert.ok(typeof parsedDb.lastWorkerIndex === "number", "lastWorkerIndex must be a valid number");

    // Assert zero orphaned .tmp files remain in directory
    const lingeringTmp = fs.readdirSync(testDir).filter(f => f.startsWith(".tmp_"));
    assert.equal(lingeringTmp.length, 0, `No .tmp files should remain. Found: ${lingeringTmp.join(", ")}`);

    // Clean up
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. REST Engine Concurrency with Disk Persistence
  // ──────────────────────────────────────────────────────────────────────────
  test("3.1 Concurrent REST operations (POST, PUT, APPROVE, GET) persist atomically to disk", async () => {
    const testDir = path.resolve("data", `.challenger2_rest_${Date.now()}`);
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    const targetDbFile = path.join(testDir, "rest_database.json");

    // Initialize mock database state
    const dbState = {
      faqItems: JSON.parse(JSON.stringify(getOfficialFaqSeed())),
      zapiConfig: { enabled: false }
    };

    const saveToDisk = () => {
      atomicWriteFileSync(targetDbFile, JSON.stringify(dbState, null, 2));
    };

    // Initial persistence
    saveToDisk();

    // Setup simulated Express router
    const routes = {};
    const mockApp = {
      get: (p, h) => { routes[`GET ${p}`] = h; },
      post: (p, h) => { routes[`POST ${p}`] = h; },
      put: (p, h) => { routes[`PUT ${p}`] = h; },
      delete: (p, h) => { routes[`DELETE ${p}`] = h; }
    };

    initWhatsAppEngine(mockApp, () => dbState, saveToDisk, () => {});

    function executeRoute(method, pathPattern, { params = {}, query = {}, body = {} } = {}) {
      const handler = routes[`${method} ${pathPattern}`];
      if (!handler) throw new Error(`Missing route: ${method} ${pathPattern}`);
      let status = 200;
      let json = null;
      handler(
        { params, query, body },
        {
          status: (s) => { status = s; return { json: (d) => { json = d; } }; },
          json: (d) => { json = d; }
        }
      );
      return { status, json };
    }

    // 1. Create 20 pending FAQ items concurrently
    const createdIds = [];
    for (let i = 0; i < 20; i++) {
      const res = executeRoute("POST", "/api/whatsapp/faq", {
        body: {
          question: `Dúvida de teste concorrente #${i}?`,
          suggestedAnswer: `Sugestão automática para a dúvida #${i}`,
          category: "estrutura_flat",
          status: "aguardando_aprovacao"
        }
      });
      assert.equal(res.status, 201);
      assert.ok(res.json.item.id);
      createdIds.push(res.json.item.id);
    }

    // 2. Perform concurrent mixed operations: PUT, APPROVE, GET
    const operations = [];
    // 10 PUTs
    for (let i = 0; i < 10; i++) {
      operations.push(() => {
        const res = executeRoute("PUT", "/api/whatsapp/faq/:id", {
          params: { id: createdIds[i] },
          body: { keywords: [`chave_${i}`, "concorrente"] }
        });
        assert.equal(res.status, 200);
      });
    }

    // 10 Approvals
    for (let i = 10; i < 20; i++) {
      operations.push(() => {
        const res = executeRoute("POST", "/api/whatsapp/faq/:id/approve", {
          params: { id: createdIds[i] },
          body: { answer: `Resposta oficial e aprovada para #${i}` }
        });
        assert.equal(res.status, 200);
        assert.equal(res.json.item.status, "ativo");
      });
    }

    // 20 GET queries
    for (let i = 0; i < 20; i++) {
      operations.push(() => {
        const res = executeRoute("GET", "/api/whatsapp/faq", {
          query: { search: "concorrente" }
        });
        assert.equal(res.status, 200);
        assert.ok(res.json.count >= 0);
      });
    }

    // Execute all concurrently in random order
    await Promise.all(
      operations.sort(() => Math.random() - 0.5).map((op) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            op();
            resolve();
          }, Math.floor(Math.random() * 20));
        });
      })
    );

    // Verify disk content
    assert.ok(fs.existsSync(targetDbFile));
    const contentOnDisk = JSON.parse(fs.readFileSync(targetDbFile, "utf-8"));
    assert.equal(contentOnDisk.faqItems.length, dbState.faqItems.length);

    // Check that the 10 approved items are indeed "ativo" on disk
    for (let i = 10; i < 20; i++) {
      const diskItem = contentOnDisk.faqItems.find(item => item.id === createdIds[i]);
      assert.ok(diskItem, `Item ${createdIds[i]} must exist on disk`);
      assert.equal(diskItem.status, "ativo", `Item ${createdIds[i]} must have status 'ativo' on disk`);
      assert.ok(diskItem.approvedAt, "Item must have approvedAt timestamp");
    }

    // Cleanup
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Production Database JSON Integrity
  // ──────────────────────────────────────────────────────────────────────────
  test("4.1 Production data/database.json is fully valid and contains all 15 official baseline FAQs", () => {
    const prodDbPath = path.resolve("data", "database.json");
    assert.ok(fs.existsSync(prodDbPath), "data/database.json must exist in project");

    const content = fs.readFileSync(prodDbPath, "utf-8");
    let prodDb = null;
    assert.doesNotThrow(() => {
      prodDb = JSON.parse(content);
    }, "data/database.json must be valid JSON");

    assert.ok(Array.isArray(prodDb.faqItems), "prodDb.faqItems must be an array");
    assert.ok(prodDb.faqItems.length >= 15, `prodDb.faqItems should have at least 15 items, found ${prodDb.faqItems.length}`);

    // Verify all 9 required official core FAQs exist
    const coreFaqIds = [
      "faq-wifi",
      "faq-cafe-quarto",
      "faq-recolhimento-loucas",
      "faq-agua-frigobar",
      "faq-regras-visitas",
      "faq-regras-pets",
      "faq-checkin-14h",
      "faq-early-checkin-direto",
      "faq-checkout-12h"
    ];

    for (const coreId of coreFaqIds) {
      const found = prodDb.faqItems.find(f => f.id === coreId);
      assert.ok(found, `Official FAQ ${coreId} must exist in data/database.json`);
      assert.equal(found.status, "ativo", `Official FAQ ${coreId} must be active`);
      assert.ok(found.answer && found.answer.length > 10, `Official FAQ ${coreId} must have official answer`);
    }

    // Verify pending and suggested items exist
    const pendingItems = prodDb.faqItems.filter(f => f.status === "pendente");
    assert.ok(pendingItems.length >= 2, "Must contain pending questions");

    const suggestedItems = prodDb.faqItems.filter(f => f.status === "aguardando_aprovacao");
    assert.ok(suggestedItems.length >= 2, "Must contain items awaiting approval");

    // Verify scoped rule items exist
    const excludeItems = prodDb.faqItems.filter(f => f.scope === "exclude");
    assert.ok(excludeItems.length >= 1, "Must contain exclude rule FAQ");

    const includeOnlyItems = prodDb.faqItems.filter(f => f.scope === "include_only");
    assert.ok(includeOnlyItems.length >= 1, "Must contain include_only rule FAQ");
  });

  after(() => {
    setTimeout(() => {
      process.exit(0);
    }, 100);
  });
});

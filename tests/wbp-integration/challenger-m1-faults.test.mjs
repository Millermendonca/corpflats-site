import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";
import http from "node:http";

// Ensure DATABASE_URL is strictly unset for test isolation
delete process.env.DATABASE_URL;

import { WBPClient, WbpApiError } from "../../artifacts/api-server/wbp/client.mjs";
import { WBPSimulator } from "../../e2e/wbp-simulator/server.mjs";
import { validateRequest, validateCommonEnvelope } from "../../e2e/wbp-simulator/schemas/index.mjs";

describe("Challenger 2: Fault Injection, Timeout Handling & Schema Validation", () => {
  let simulator;
  let client;

  before(async () => {
    // Start local WBP Simulator with strictSchemas enabled for schema enforcement
    simulator = new WBPSimulator({
      sharedSecret: "test-shared-secret-m1",
      wbpPropertyId: "111",
      pmsPropertyId: "soho-19",
      currency: "BRL",
      strictSchemas: true // Challenge: verify simulator rejects invalid payloads
    });
    await simulator.start(0);

    client = new WBPClient({
      baseUrl: simulator.url,
      sharedSecret: "test-shared-secret-m1",
      wbpPropertyId: "111",
      pmsPropertyId: "soho-19",
      currency: "BRL",
      timeoutMs: 40,
      maxRetries: 2,
      backoffBaseMs: 10
    });
  });

  after(async () => {
    if (simulator) {
      await simulator.stop();
    }
  });

  beforeEach(() => {
    simulator.reset();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. SCHEMA VALIDATION: INVALID PAYLOAD REJECTION
  // ═══════════════════════════════════════════════════════════════════════════
  describe("1. OpenAPI Schema Validation: Rejection of Invalid Payloads", () => {
    it("schema validator rejects payloads missing common envelope fields (guid, pms_cid, shared_secret, verb)", () => {
      // 1. Missing guid
      const r1 = validateRequest("HealthCheck", {
        verb: "HealthCheck",
        pms_cid: "corpflats",
        shared_secret: "secret"
      });
      assert.strictEqual(r1.valid, false, "Must reject payload missing guid");
      assert(r1.errors.some((e) => e.includes("guid")), "Error must mention guid");

      // 2. Non-UUID v4 guid
      const r2 = validateRequest("HealthCheck", {
        verb: "HealthCheck",
        guid: "not-a-valid-uuid-v4",
        pms_cid: "corpflats",
        shared_secret: "secret"
      });
      assert.strictEqual(r2.valid, false, "Must reject invalid guid format");
      assert(r2.errors.some((e) => e.includes("UUID v4")), "Error must require UUID v4");

      // 3. Missing pms_cid
      const r3 = validateRequest("HealthCheck", {
        verb: "HealthCheck",
        guid: crypto.randomUUID(),
        shared_secret: "secret"
      });
      assert.strictEqual(r3.valid, false, "Must reject payload missing pms_cid");
      assert(r3.errors.some((e) => e.includes("pms_cid")), "Error must mention pms_cid");

      // 4. Missing shared_secret
      const r4 = validateRequest("HealthCheck", {
        verb: "HealthCheck",
        guid: crypto.randomUUID(),
        pms_cid: "corpflats"
      });
      assert.strictEqual(r4.valid, false, "Must reject payload missing shared_secret");
      assert(r4.errors.some((e) => e.includes("shared_secret")), "Error must mention shared_secret");

      // 5. Mismatched verb
      const r5 = validateRequest("HealthCheck", {
        verb: "WrongVerb",
        guid: crypto.randomUUID(),
        pms_cid: "corpflats",
        shared_secret: "secret"
      });
      assert.strictEqual(r5.valid, false, "Must reject mismatched verb");
      assert(r5.errors.some((e) => e.includes("incompatível")), "Error must state verb mismatch");
    });

    it("schema validator rejects endpoint-specific missing required fields across all verbs", () => {
      const validEnvelope = {
        guid: crypto.randomUUID(),
        pms_cid: "corpflats",
        shared_secret: "secret",
        wbp_property_id: "111"
      };

      // SetupProperty missing wbp_property_password
      const rSetup = validateRequest("SetupProperty", {
        ...validEnvelope,
        verb: "SetupProperty",
        RoomInfo: "not-an-array"
      });
      assert.strictEqual(rSetup.valid, false);
      assert(rSetup.errors.some((e) => e.includes("wbp_property_password")));
      assert(rSetup.errors.some((e) => e.includes("array")));

      // ARIUpdate missing currency or non-3-letter currency
      const rAriNoCurr = validateRequest("ARIUpdate", {
        ...validEnvelope,
        verb: "ARIUpdate",
        currency: "REAL", // 4 letters, invalid ISO
        Inventory: []
      });
      assert.strictEqual(rAriNoCurr.valid, false);
      assert(rAriNoCurr.errors.some((e) => e.includes("currency")));

      // ARIUpdate with invalid Inventory item (reversed dates: start > end)
      const rAriDates = validateRequest("ARIUpdate", {
        ...validEnvelope,
        verb: "ARIUpdate",
        currency: "BRL",
        Inventory: [
          {
            wbp_room_id: "111",
            wbp_rate_id: "sem_cafe",
            start_date: "2026-12-31",
            end_date: "2026-01-01", // End before start
            units: 5
          }
        ]
      });
      assert.strictEqual(rAriDates.valid, false);
      assert(rAriDates.errors.some((e) => e.includes("não pode ser posterior")));

      // ARIUpdate with negative units and negative rate
      const rAriNegative = validateRequest("ARIUpdate", {
        ...validEnvelope,
        verb: "ARIUpdate",
        currency: "BRL",
        Inventory: [
          {
            wbp_room_id: "111",
            wbp_rate_id: "sem_cafe",
            start_date: "2026-10-01",
            end_date: "2026-10-05",
            units: -3,
            rate: -100
          }
        ]
      });
      assert.strictEqual(rAriNegative.valid, false);
      assert(rAriNegative.errors.some((e) => e.includes("inteiro não-negativo")));
      assert(rAriNegative.errors.some((e) => e.includes("decimal válido")));

      // GetBookingId missing booking_id
      const rBookingId = validateRequest("GetBookingId", {
        ...validEnvelope,
        verb: "GetBookingId"
      });
      assert.strictEqual(rBookingId.valid, false);
      assert(rBookingId.errors.some((e) => e.includes("booking_id")));

      // AckBooking missing booking_id
      const rAck = validateRequest("AckBooking", {
        ...validEnvelope,
        verb: "AckBooking"
      });
      assert.strictEqual(rAck.valid, false);
      assert(rAck.errors.some((e) => e.includes("booking_id")));
    });

    it("simulator HTTP server rejects invalid payload missing required fields with HTTP 400", async () => {
      // Send raw HTTP POST to simulator with invalid payload missing required fields
      const res = await fetch(`${simulator.url}/HealthCheck`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verb: "HealthCheck"
          // Missing: guid, pms_cid, shared_secret
        })
      });

      assert.strictEqual(res.status, 400, "Simulator must respond with HTTP 400 on schema violation");
      const body = await res.json();
      assert.strictEqual(body.success, false, "Response body must indicate success: false");
      assert(Array.isArray(body.errors), "Response body must contain an errors array");
      assert(body.errors.length >= 3, "Errors array must list all missing required fields");
      assert(body.errors.some((e) => e.msg.includes("guid")), "Must report missing guid");
      assert(body.errors.some((e) => e.msg.includes("pms_cid")), "Must report missing pms_cid");
      assert(body.errors.some((e) => e.msg.includes("shared_secret")), "Must report missing shared_secret");
    });

    it("simulator HTTP server rejects ARIUpdate with invalid dates or missing inventory", async () => {
      const res = await fetch(`${simulator.url}/ARIUpdate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verb: "ARIUpdate",
          guid: crypto.randomUUID(),
          pms_cid: "corpflats",
          shared_secret: "test-shared-secret-m1",
          currency: "BRL",
          Inventory: [
            {
              wbp_room_id: "111",
              wbp_rate_id: "sem_cafe",
              start_date: "2026-11-20",
              end_date: "2026-11-10", // start > end
              units: 2
            }
          ]
        })
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert(data.errors.some((e) => e.msg.includes("não pode ser posterior")));
    });

    it("empirical probe: simulator behavior under default configuration (strictSchemas: false)", async () => {
      // Spin up simulator with default configuration to observe if schema validation is enforced by default
      const defaultSim = new WBPSimulator({
        sharedSecret: "sec",
        wbpPropertyId: "111"
      });
      await defaultSim.start(0);

      try {
        const res = await fetch(`${defaultSim.url}/HealthCheck`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verb: "HealthCheck" }) // Missing guid, pms_cid, shared_secret
        });

        // Record the exact behavior:
        // In the current implementation, server.mjs checks: if (!validation.valid && this.strictSchemas)
        // If this.strictSchemas is false (default), it does NOT reject with 400.
        const body = await res.json();
        const rejectsByDefault = res.status === 400 && body.success === false;

        // Document the finding empirically
        if (!rejectsByDefault) {
          assert.strictEqual(res.status, 200, "Observed: default simulator allows invalid payload with HTTP 200");
          assert.strictEqual(body.success, true, "Observed: default simulator returns success: true");
          // This empirical finding indicates that strictSchemas: true must be set or server.mjs patched to reject by default
        } else {
          assert.strictEqual(res.status, 400);
        }
      } finally {
        await defaultSim.stop();
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. TERMINAL ERROR CODES: NON-RETRY BEHAVIOR (1001, 1002, 1102)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("2. Terminal Error Codes: Strict Non-Retry Behavior", () => {
    it("does NOT retry on Error 1001 (FAULT.OTA.LOGIN: Invalid credentials) — exactly 1 attempt", async () => {
      simulator.setFailureMode("SetupProperty", {
        errorCode: 1001,
        errorMessage: "The login details you provided are incorrect."
      });

      let caughtError = null;
      try {
        await client.setupProperty({}, { bypassSwitch: true });
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError, "Client must throw on Error 1001");
      assert(caughtError instanceof WbpApiError, "Error must be instance of WbpApiError");
      assert.strictEqual(caughtError.code, 1001, "Error code must be 1001");
      assert.strictEqual(caughtError.retryable, false, "Must be flagged as non-retryable");

      // Verify simulator received call count is strictly 1
      const calls = simulator.getReceivedRequests().filter((r) => r.verb === "SetupProperty");
      assert.strictEqual(calls.length, 1, "Must make exactly 1 attempt without retries on Error 1001");
    });

    it("does NOT retry on Error 1002 (FAULT.OTA.NOTENABLED: Channel not enabled) — exactly 1 attempt", async () => {
      simulator.setFailureMode("SetupProperty", {
        errorCode: 1002,
        errorMessage: "Credentials not enabled for channel management."
      });

      let caughtError = null;
      try {
        await client.setupProperty({}, { bypassSwitch: true });
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError, "Client must throw on Error 1002");
      assert.strictEqual(caughtError.code, 1002);
      assert.strictEqual(caughtError.retryable, false);

      const calls = simulator.getReceivedRequests().filter((r) => r.verb === "SetupProperty");
      assert.strictEqual(calls.length, 1, "Must make exactly 1 attempt without retries on Error 1002");
    });

    it("does NOT retry on Error 1102 (FAULT.OTA.CURRENCY: Currency mismatch) — exactly 1 attempt", async () => {
      simulator.setFailureMode("ARIUpdate", {
        errorCode: 1102,
        errorMessage: "Your currency setting doesn't match the currency for this channel."
      });

      let caughtError = null;
      try {
        await client.sendARIUpdate(
          {
            currency: "BRL",
            Inventory: [
              {
                wbp_room_id: "111",
                wbp_rate_id: "sem_cafe",
                start_date: "2026-10-15",
                end_date: "2026-10-20",
                units: 10,
                rate: 276.63
              }
            ]
          },
          { bypassSwitch: true }
        );
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError, "Client must throw on Error 1102");
      assert.strictEqual(caughtError.code, 1102);
      assert.strictEqual(caughtError.retryable, false);

      const calls = simulator.getReceivedRequests().filter((r) => r.verb === "ARIUpdate");
      assert.strictEqual(calls.length, 1, "Must make exactly 1 attempt without retries on Error 1102");
    });

    it("verifies terminal error non-retry across HealthCheck, GetBookingList, GetBookingId, AckBooking", async () => {
      const verbsToTest = [
        {
          name: "HealthCheck",
          call: () => client.healthCheck({ bypassSwitch: true })
        },
        {
          name: "GetBookingList",
          call: () => client.getBookingList({ wbp_booking_version: null }, { bypassSwitch: true })
        },
        {
          name: "GetBookingId",
          call: () => client.getBookingId({ booking_id: "9999" }, { bypassSwitch: true })
        },
        {
          name: "AckBooking",
          call: () => client.ackBooking({ booking_id: "9999" }, { bypassSwitch: true })
        }
      ];

      for (const item of verbsToTest) {
        simulator.clearFailureModes();
        simulator.setFailureMode(item.name, {
          errorCode: 1001,
          errorMessage: `Terminal login fault on ${item.name}`
        });

        await assert.rejects(
          item.call,
          (err) => {
            assert(err instanceof WbpApiError);
            assert.strictEqual(err.code, 1001);
            assert.strictEqual(err.retryable, false);
            return true;
          },
          `Expected terminal error on ${item.name}`
        );

        const calls = simulator.getReceivedRequests().filter((r) => r.verb === item.name);
        assert.strictEqual(calls.length, 1, `${item.name} must be called exactly once`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. TRANSIENT ERRORS, TIMEOUTS & GUID IDEMPOTENCY REUSE
  // ═══════════════════════════════════════════════════════════════════════════
  describe("3. Transient Errors & Timeouts: Retries and GUID Preservation", () => {
    it("retries on transient Error 1003 (FAULT.OTA.OFFLINE) reusing the EXACT SAME GUID across all attempts", async () => {
      simulator.setFailureMode("GetRatePlans", {
        errorCode: 1003,
        errorMessage: "Channel offline or temporary timeout."
      });

      let caughtError = null;
      try {
        await client.getRatePlans({ bypassSwitch: true });
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError, "Client must eventually fail after exhausting retries");

      // Verify simulator received requests: 1 initial + 2 retries = 3 total
      const calls = simulator.getReceivedRequests().filter((r) => r.verb === "GetRatePlans");
      assert.strictEqual(calls.length, 3, "Must make 1 initial attempt + 2 retries (3 total attempts)");

      // Check GUID preservation across all 3 attempts
      const firstGuid = calls[0].guid;
      assert.ok(firstGuid, "First attempt must have a GUID");
      assert.strictEqual(calls[1].guid, firstGuid, "Retry 1 must reuse identical GUID");
      assert.strictEqual(calls[2].guid, firstGuid, "Retry 2 must reuse identical GUID");
    });

    it("retries on transient Error 1004 (FAULT.OTA.BROKEN) reusing the EXACT SAME GUID", async () => {
      simulator.setFailureMode("GetRoomTypes", {
        errorCode: 1004,
        errorMessage: "Service temporarily unable to update."
      });

      let caughtError = null;
      try {
        await client.getRoomTypes({ bypassSwitch: true });
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError);
      const calls = simulator.getReceivedRequests().filter((r) => r.verb === "GetRoomTypes");
      assert.strictEqual(calls.length, 3, "Must retry up to maxRetries on 1004");
      assert.strictEqual(calls[1].guid, calls[0].guid, "Must reuse GUID on retry 1");
      assert.strictEqual(calls[2].guid, calls[0].guid, "Must reuse GUID on retry 2");
    });

    it("succeeds when transient error recovers on retry attempt, preserving same GUID", async () => {
      let callCount = 0;
      let recordedGuids = [];

      // Create an ephemeral server that fails on attempts 1 and 2 with 1003, then succeeds on attempt 3
      const transientServer = http.createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

        callCount++;
        recordedGuids.push(body?.guid);

        if (callCount < 3) {
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              success: false,
              errors: [{ id: 1003, msg: `Transient failure attempt ${callCount}` }]
            })
          );
        }

        // Attempt 3 succeeds!
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            RatePlans: [{ wbp_rate_id: "sem_cafe", title: "Sem Café" }]
          })
        );
      });

      await new Promise((resolve) => transientServer.listen(0, "127.0.0.1", resolve));
      const transientPort = transientServer.address().port;

      const recoveryClient = new WBPClient({
        baseUrl: `http://127.0.0.1:${transientPort}`,
        sharedSecret: "test-shared-secret-m1",
        timeoutMs: 100,
        maxRetries: 2,
        backoffBaseMs: 10
      });

      try {
        const res = await recoveryClient.getRatePlans({ bypassSwitch: true });
        assert.strictEqual(res.success, true, "Call must succeed after transient error recovery");
        assert.strictEqual(callCount, 3, "Must have attempted 3 times before succeeding");
        assert.strictEqual(recordedGuids.length, 3, "Must have recorded 3 GUIDs");
        assert.ok(recordedGuids[0], "First attempt must have GUID");
        assert.strictEqual(recordedGuids[1], recordedGuids[0], "Retry 1 must reuse exact same GUID");
        assert.strictEqual(recordedGuids[2], recordedGuids[0], "Retry 2 must reuse exact same GUID");
      } finally {
        await new Promise((resolve) => transientServer.close(resolve));
      }
    });

    it("retries on HTTP timeout (delay > client timeoutMs) reusing the EXACT SAME GUID across attempts", async () => {
      simulator.clearFailureModes();
      // Delay response for 120ms (client timeout is 40ms)
      simulator.setFailureMode("HealthCheck", { delayMs: 120 });

      let caughtError = null;
      try {
        await client.healthCheck({ bypassSwitch: true });
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError, "Client must fail after retrying timeouts");
      assert.strictEqual(caughtError.code, 1003, "Timeout failure must be assigned code 1003");

      const calls = simulator.getReceivedRequests().filter((r) => r.verb === "HealthCheck");
      assert.strictEqual(calls.length, 3, "Must have made 3 attempts due to timeouts");

      const baseGuid = calls[0].guid;
      assert.ok(baseGuid, "Initial call must have GUID");
      assert.strictEqual(calls[1].guid, baseGuid, "Timeout retry 1 must reuse exact GUID");
      assert.strictEqual(calls[2].guid, baseGuid, "Timeout retry 2 must reuse exact GUID");
    });

    it("retries on network socket drop (connection dropped) reusing the EXACT SAME GUID", async () => {
      simulator.clearFailureModes();
      simulator.setFailureMode("GetBookingList", { dropConnection: true });

      let caughtError = null;
      try {
        await client.getBookingList({ wbp_booking_version: null }, { bypassSwitch: true });
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError, "Client must fail after network connection drops");
      assert.strictEqual(caughtError.code, 3, "Network failure must report code 3");

      const calls = simulator.getReceivedRequests().filter((r) => r.verb === "GetBookingList");
      assert.strictEqual(calls.length, 3, "Must make 3 attempts when socket is destroyed");

      const firstGuid = calls[0].guid;
      assert.ok(firstGuid);
      assert.strictEqual(calls[1].guid, firstGuid);
      assert.strictEqual(calls[2].guid, firstGuid);
    });

    it("caller-supplied custom GUID is preserved across retries and returned on ARIUpdate", async () => {
      simulator.clearFailureModes();
      simulator.setFailureMode("ARIUpdate", { delayMs: 120 }); // Trigger timeout retries

      const customGuid = "77777777-8888-4999-a000-bbbbbbbbbbbb";
      let caughtError = null;

      try {
        await client.sendARIUpdate(
          {
            currency: "BRL",
            Inventory: [
              {
                wbp_room_id: "111",
                wbp_rate_id: "sem_cafe",
                start_date: "2026-10-15",
                end_date: "2026-10-20",
                units: 14,
                rate: 276.63
              }
            ]
          },
          { guid: customGuid, bypassSwitch: true }
        );
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError);
      const calls = simulator.getReceivedRequests().filter((r) => r.verb === "ARIUpdate");
      assert.strictEqual(calls.length, 3);
      assert.strictEqual(calls[0].guid, customGuid, "Attempt 1 must use caller custom GUID");
      assert.strictEqual(calls[1].guid, customGuid, "Retry 1 must use caller custom GUID");
      assert.strictEqual(calls[2].guid, customGuid, "Retry 2 must use caller custom GUID");
    });
  });
});

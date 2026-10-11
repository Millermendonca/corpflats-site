/**
 * e2e/sandbox/pix-simulator.mjs
 * 
 * Simulator for PIX payment lifecycle (Instant confirmation, webhook delivery, QR expiration).
 * Interacts with the isolated test backend without touching external banking APIs.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Simulates an instant PIX payment by dispatching the official Banco Inter webhook payload
 * to the backend endpoint `POST /api/pms/inter/webhook`.
 * 
 * @param {object} options
 * @param {string} [options.baseUrl="http://127.0.0.1:5055"] - Test backend base URL
 * @param {string} [options.txid] - Transaction ID
 * @param {number} [options.amount] - Paid amount
 * @param {string} [options.reservationCode] - Optional reservation code to lookup txid if not provided
 * @param {string} [options.endToEndId] - Optional EndToEnd PIX identifier
 * @returns {Promise<{ success: boolean, txid: string, amount: number, status: number }>}
 */
export async function simulatePixPayment(options = {}) {
  const baseUrl = (options.baseUrl || "http://127.0.0.1:5055").replace(/\/+$/, "");
  let txid = options.txid;
  let amount = options.amount;
  const reservationCode = options.reservationCode;

  // If reservationCode provided without txid/amount, inspect reservation first
  if (reservationCode && (!txid || !amount)) {
    try {
      const res = await fetch(`${baseUrl}/api/pms/guest-portal/${encodeURIComponent(reservationCode)}`);
      if (res.ok) {
        const json = await res.json();
        const r = json.reservation;
        if (r) {
          txid = txid || r.pixTxId || `PIX_SANDBOX_TX_${r.code}`;
          amount = amount !== undefined ? amount : (r.totalAmount || 100);
        }
      }
    } catch {}
  }

  if (!txid) {
    txid = `PIX_SANDBOX_TX_${Date.now()}`;
  }
  if (amount === undefined) {
    amount = 250.00;
  }

  const endToEndId = options.endToEndId || `E00000000${Date.now()}SANDBOXPIX`;
  const horario = new Date().toISOString();

  const webhookPayload = {
    pix: [
      {
        txid,
        valor: amount,
        horario,
        endToEndId
      }
    ]
  };

  const response = await fetch(`${baseUrl}/api/pms/inter/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(webhookPayload)
  });

  return {
    success: response.ok,
    status: response.status,
    txid,
    amount,
    endToEndId,
    horario
  };
}

/**
 * Checks payment status of a reservation via the backend API.
 * 
 * @param {object} options
 * @param {string} [options.baseUrl="http://127.0.0.1:5055"]
 * @param {string} options.reservationCode
 * @returns {Promise<object>}
 */
export async function checkPaymentStatus(options = {}) {
  const baseUrl = (options.baseUrl || "http://127.0.0.1:5055").replace(/\/+$/, "");
  const code = options.reservationCode;
  if (!code) throw new Error("[pix-simulator] reservationCode is required for checkPaymentStatus");

  const response = await fetch(`${baseUrl}/api/pms/reservations/${encodeURIComponent(code)}/payment-status`);
  if (!response.ok) {
    throw new Error(`[pix-simulator] Failed to check payment status: ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Simulates expiration of a PIX QR Code for a reservation.
 * Clears the existing payload and sets expiration flags in the test database.
 * 
 * @param {object} options
 * @param {string} [options.baseUrl="http://127.0.0.1:5055"]
 * @param {string} options.reservationCode
 * @param {string} [options.testDbPath="data/database.test.json"]
 * @returns {Promise<{ success: boolean, reservationCode: string }>}
 */
export async function simulatePixExpiration(options = {}) {
  const baseUrl = (options.baseUrl || "http://127.0.0.1:5055").replace(/\/+$/, "");
  const code = options.reservationCode;
  const testDbPath = path.resolve(process.cwd(), options.testDbPath || "data/database.test.json");

  if (!code) throw new Error("[pix-simulator] reservationCode is required for simulatePixExpiration");

  if (fs.existsSync(testDbPath)) {
    const raw = fs.readFileSync(testDbPath, "utf-8");
    const db = JSON.parse(raw);
    const r = (db.reservations || []).find(item => item.code === code);
    if (r) {
      r.pixCopiaECola = null;
      r.pixTxId = "PIX_SANDBOX_TX_001";
      r.paymentStatus = "aguardando_pix";
      r.paidAmount = 0.00;
      r.isPaid = false;
      r.pixExpired = true;
      r.pixExpiredAt = new Date().toISOString();
      fs.writeFileSync(testDbPath, JSON.stringify(db, null, 2), "utf-8");

      // Notify test server to reload database
      await fetch(`${baseUrl}/api/test/db-reset`, { method: "POST" }).catch(() => {});

      return { success: true, reservationCode: code, expired: true };
    }
  }

  return { success: false, reservationCode: code, message: "Reservation not found in test DB" };
}

/**
 * e2e/sandbox/mock-zapi.mjs
 * 
 * In-memory Mock Server for Z-API WhatsApp Gateway.
 * Intercepts outbound WhatsApp messages and provides synthetic inbound webhook dispatch.
 * Prevents real network traffic to Z-API production endpoints.
 */

import http from "node:http";

let serverInstance = null;
let currentPort = 5056;
const sentMessages = [];

/**
 * Parses JSON body from incoming HTTP request.
 */
function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({ raw: body });
      }
    });
  });
}

/**
 * Handles incoming mock Z-API requests.
 */
async function handleRequest(req, res) {
  const url = req.url || "/";
  const method = req.method || "GET";

  // CORS headers for browser/local testing
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Client-Token");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint
  if (url === "/health" || url === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "mock-zapi", messageCount: sentMessages.length }));
    return;
  }

  // Query sent messages via HTTP if needed
  if (url === "/mock/messages" && method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(sentMessages));
    return;
  }

  if (url === "/mock/messages" && method === "DELETE") {
    sentMessages.length = 0;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ cleared: true }));
    return;
  }

  // Handle standard Z-API Gateway endpoints: /instances/:id/token/:token/...
  const zapiRegex = /^\/instances\/([^/]+)\/token\/([^/]+)\/(.+)$/;
  const match = url.split("?")[0].match(zapiRegex);

  if (match) {
    const [, instanceId, token, action] = match;
    const body = method === "POST" ? await readJsonBody(req) : {};
    const messageId = `ZAAP_MOCK_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Intercept outbound send actions
    if (action.startsWith("send-") || method === "POST") {
      const recorded = {
        id: messageId,
        timestamp: new Date().toISOString(),
        instanceId,
        action,
        phone: body.phone || body.phoneId || null,
        message: body.message || body.caption || body.text || null,
        body
      };
      sentMessages.push(recorded);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        zaapId: messageId,
        messageId,
        id: messageId,
        success: true,
        connected: true,
        status: "PENDING"
      }));
      return;
    }

    // Status or device info
    if (action === "status" || action === "device") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        connected: true,
        sessionStatus: "CONNECTED",
        battery: 100,
        phone: "5522998505276"
      }));
      return;
    }

    // Chats or messages listing
    if (action === "chats" || action === "messages") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify([]));
      return;
    }
  }

  // Fallback 200 for any other Z-API route
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: true, simulated: true }));
}

/**
 * Starts the mock Z-API server.
 * @param {number} [port=5056]
 * @returns {Promise<http.Server>}
 */
export function startMockZapi(port = 5056) {
  return new Promise((resolve, reject) => {
    if (serverInstance) {
      return resolve(serverInstance);
    }
    currentPort = port;
    const srv = http.createServer(handleRequest);

    srv.listen(port, "127.0.0.1", () => {
      serverInstance = srv;
      resolve(srv);
    });

    srv.on("error", err => {
      reject(err);
    });
  });
}

/**
 * Stops the mock Z-API server.
 * @returns {Promise<void>}
 */
export function stopMockZapi() {
  return new Promise((resolve) => {
    if (!serverInstance) return resolve();
    serverInstance.close(() => {
      serverInstance = null;
      resolve();
    });
  });
}

/**
 * Returns all intercepted sent messages.
 */
export function getSentMessages() {
  return [...sentMessages];
}

/**
 * Clears intercepted sent messages.
 */
export function clearSentMessages() {
  sentMessages.length = 0;
}

/**
 * Returns the most recent intercepted message.
 */
export function getLastMessage() {
  return sentMessages.length > 0 ? sentMessages[sentMessages.length - 1] : null;
}

/**
 * Finds sent messages matching a specific phone number.
 */
export function findMessagesByPhone(phone) {
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  return sentMessages.filter(m => {
    const target = String(m.phone || "").replace(/\D/g, "");
    return target.includes(cleanPhone) || cleanPhone.includes(target);
  });
}

/**
 * Simulates an incoming WhatsApp message into the running backend webhook.
 * @param {object} options
 * @param {string} [options.backendBaseUrl="http://127.0.0.1:5055"]
 * @param {string} options.phone - Sender phone number
 * @param {string} options.text - Message content
 * @param {boolean} [options.isGroup=false]
 * @param {string} [options.chatName]
 * @param {string} [options.senderName]
 * @returns {Promise<Response>}
 */
export async function dispatchIncomingMessage(options = {}) {
  const backendBaseUrl = (options.backendBaseUrl || "http://127.0.0.1:5055").replace(/\/+$/, "");
  const phone = options.phone || "5522998877661";
  const text = options.text || "Olá, gostaria de informações sobre a minha reserva";
  const isGroup = Boolean(options.isGroup);
  const chatName = options.chatName || (isGroup ? "Checkout Flats" : "Hóspede");
  const senderName = options.senderName || "Hóspede Teste";
  const messageId = `ZAAP_INBOUND_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const payload = {
    phone,
    text: { message: text },
    isGroup,
    chatName,
    senderName,
    messageId,
    instanceId: "SANDBOX_MOCK_INSTANCE",
    status: "RECEIVED",
    timestamp: Date.now()
  };

  const response = await fetch(`${backendBaseUrl}/api/whatsapp/webhook/received`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  return response;
}

/**
 * e2e/sandbox/mock-smtp.mjs
 * 
 * Lightweight in-memory SMTP interceptor server built with native Node.js TCP sockets.
 * Intercepts all outbound Nodemailer emails on port 5025.
 * Zero external dependencies. Zero network egress.
 */

import net from "node:net";
import fs from "node:fs";
import path from "node:path";

const EMAILS_FILE = path.resolve(process.cwd(), "e2e/sandbox/.mock-smtp-emails.json");

let smtpServer = null;
let activeSockets = new Set();
const sentEmails = [];

function decodeMimeHeader(val) {
  if (!val || typeof val !== "string") return "";
  return val.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_, charset, encoding, text) => {
    try {
      if (encoding.toUpperCase() === "B") {
        return Buffer.from(text, "base64").toString(charset.toLowerCase() === "utf-8" ? "utf8" : "latin1");
      } else if (encoding.toUpperCase() === "Q") {
        return text.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (__, hex) => String.fromCharCode(parseInt(hex, 16)));
      }
    } catch {}
    return text;
  });
}

/**
 * Extracts basic headers and body from raw RFC 2822 email payload.
 */
function parseRawEmail(rawText, envelopeFrom, envelopeTo) {
  const parts = rawText.split(/\r?\n\r?\n/);
  const headerSection = parts[0] || "";
  const bodySection = parts.slice(1).join("\n\n");

  const headers = {};
  const lines = headerSection.split(/\r?\n/);
  let currentHeader = "";

  for (const line of lines) {
    if (/^[ \t]/.test(line) && currentHeader) {
      headers[currentHeader] += " " + line.trim();
    } else {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        currentHeader = match[1].toLowerCase().trim();
        headers[currentHeader] = match[2].trim();
      }
    }
  }

  const rawSubject = headers["subject"] || "(Sem Assunto)";
  const subject = decodeMimeHeader(rawSubject);
  const from = decodeMimeHeader(headers["from"] || envelopeFrom || "");
  const to = decodeMimeHeader(headers["to"] || envelopeTo.join(", ") || "");

  return {
    id: `SMTP_MOCK_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    receivedAt: new Date().toISOString(),
    from,
    to,
    subject,
    headers,
    body: bodySection.trim(),
    raw: rawText
  };
}

/**
 * Starts the mock SMTP TCP server.
 * @param {number} [port=5025]
 * @returns {Promise<net.Server>}
 */
export function startMockSmtp(port = 5025) {
  sentEmails.length = 0;
  try {
    fs.writeFileSync(EMAILS_FILE, "[]", "utf-8");
  } catch {}

  return new Promise((resolve, reject) => {
    if (smtpServer) {
      return resolve(smtpServer);
    }

    const server = net.createServer((socket) => {
      activeSockets.add(socket);
      socket.on("close", () => activeSockets.delete(socket));

      let state = "GREET";
      let envelopeFrom = "";
      let envelopeTo = [];
      let dataBuffer = "";

      // Greeting
      socket.write("220 mock-smtp Service Ready\r\n");

      let incomingBuffer = "";

      socket.on("data", (chunk) => {
        incomingBuffer += chunk.toString("latin1");

        while (true) {
          if (state === "DATA") {
            const combined = dataBuffer + incomingBuffer;
            const dataEndIndex = combined.indexOf("\r\n.\r\n");
            const altEndIndex = combined.indexOf("\n.\n");
            const endIndex = dataEndIndex !== -1 ? dataEndIndex : altEndIndex;

            if (endIndex !== -1) {
              const fullData = combined.substring(0, endIndex);
              const remainder = combined.substring(endIndex + (dataEndIndex !== -1 ? 5 : 3));
              incomingBuffer = remainder;
              dataBuffer = "";
              state = "COMMAND";

              const parsed = parseRawEmail(fullData, envelopeFrom, envelopeTo);
              sentEmails.push(parsed);
              try {
                fs.writeFileSync(EMAILS_FILE, JSON.stringify(sentEmails, null, 2), "utf-8");
              } catch {}

              socket.write("250 2.0.0 Ok: queued as " + parsed.id + "\r\n");
            } else {
              dataBuffer = combined;
              incomingBuffer = "";
              break;
            }
          } else {
            const lineEndIndex = incomingBuffer.indexOf("\n");
            if (lineEndIndex === -1) break;

            const line = incomingBuffer.substring(0, lineEndIndex).replace(/\r$/, "");
            incomingBuffer = incomingBuffer.substring(lineEndIndex + 1);

            const upper = line.toUpperCase().trim();

            if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
              socket.write("250-mock-smtp\r\n250-8BITMIME\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n");
            } else if (upper.startsWith("AUTH")) {
              socket.write("235 2.7.0 Authentication successful\r\n");
            } else if (upper.startsWith("MAIL FROM:")) {
              envelopeFrom = line.substring(10).trim().replace(/^<|>$/g, "");
              socket.write("250 2.1.0 Ok\r\n");
            } else if (upper.startsWith("RCPT TO:")) {
              const rcpt = line.substring(8).trim().replace(/^<|>$/g, "");
              envelopeTo.push(rcpt);
              socket.write("250 2.1.5 Ok\r\n");
            } else if (upper === "DATA") {
              state = "DATA";
              dataBuffer = "";
              socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
            } else if (upper === "RSET") {
              envelopeFrom = "";
              envelopeTo = [];
              dataBuffer = "";
              state = "COMMAND";
              socket.write("250 2.0.0 OK\r\n");
            } else if (upper === "NOOP") {
              socket.write("250 2.0.0 OK\r\n");
            } else if (upper === "QUIT") {
              socket.write("221 2.0.0 Bye\r\n");
              socket.end();
            } else {
              socket.write("250 2.0.0 OK\r\n");
            }
          }
        }
      });
    });

    server.listen(port, "127.0.0.1", () => {
      smtpServer = server;
      resolve(server);
    });

    server.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Stops the mock SMTP server and forcefully closes sockets.
 * @returns {Promise<void>}
 */
export function stopMockSmtp() {
  return new Promise((resolve) => {
    if (!smtpServer) return resolve();

    for (const sock of activeSockets) {
      try { sock.destroy(); } catch {}
    }
    activeSockets.clear();

    smtpServer.close(() => {
      smtpServer = null;
      resolve();
    });
  });
}

/**
 * Returns all intercepted emails.
 */
export function getSentEmails() {
  try {
    if (fs.existsSync(EMAILS_FILE)) {
      const data = fs.readFileSync(EMAILS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch {}
  return [...sentEmails];
}

/**
 * Clears intercepted emails.
 */
export function clearSentEmails() {
  sentEmails.length = 0;
  try {
    fs.writeFileSync(EMAILS_FILE, "[]", "utf-8");
  } catch {}
}

/**
 * Returns the most recent intercepted email.
 */
export function getLastEmail() {
  const emails = getSentEmails();
  return emails.length > 0 ? emails[emails.length - 1] : null;
}

/**
 * Finds emails sent to a specific recipient address.
 */
export function findEmailsByRecipient(email) {
  const target = String(email || "").toLowerCase().trim();
  const emails = getSentEmails();
  return emails.filter(e => e.to.toLowerCase().includes(target));
}

/**
 * CorpFlats / Guest Flow Manager — Serviço Banco Inter PIX Cash-Out
 *
 * Integração com a API Banking do Banco Inter para pagamentos PIX automáticos
 * para as camareiras (Governança).
 *
 * Pré-requisitos:
 *  - Conta PJ Inter com integração criada no Internet Banking
 *  - Variáveis de ambiente: INTER_CLIENT_ID, INTER_CLIENT_SECRET
 *  - Certificados: INTER_CERT_PATH (cert.crt), INTER_KEY_PATH (cert.key)
 *  - INTER_ENV=sandbox | production
 */

import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INTER_ENV = process.env.INTER_ENV || "sandbox";
const BASE_URL = INTER_ENV === "production"
  ? "https://cdpj.partners.bancointer.com.br"
  : "https://cdpjsandbox.ti.inter.co";

// Cache do token (evita chamar OAuth a cada PIX)
let _tokenCache = null;
let _tokenExpiresAt = 0;

// -- Helpers -----------------------------------------------------------------

function getInterCredentials() {
  return {
    clientId: process.env.INTER_CLIENT_ID || "",
    clientSecret: process.env.INTER_CLIENT_SECRET || "",
    certPath: process.env.INTER_CERT_PATH || path.join(__dirname, "certs", "inter.crt"),
    keyPath: process.env.INTER_KEY_PATH || path.join(__dirname, "certs", "inter.key"),
  };
}

function isInterConfigured() {
  const creds = getInterCredentials();
  return Boolean(
    creds.clientId &&
    creds.clientSecret &&
    fs.existsSync(creds.certPath) &&
    fs.existsSync(creds.keyPath)
  );
}

function buildMtlsAgent(certPath, keyPath) {
  try {
    return new https.Agent({
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
      rejectUnauthorized: true,
    });
  } catch (err) {
    throw new Error(`[Inter PIX] Falha ao carregar certificados mTLS: ${err.message}`);
  }
}

async function httpsRequest(url, options, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || "GET",
      headers: options.headers || {},
      agent: options.agent,
    };

    const req = https.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// -- OAuth Token --------------------------------------------------------------

/**
 * Obtém token OAuth2 do Banco Inter (com cache de 55 min, token dura 60 min)
 */
export async function getInterToken() {
  if (_tokenCache && Date.now() < _tokenExpiresAt) {
    return _tokenCache;
  }

  const creds = getInterCredentials();
  if (!isInterConfigured()) {
    throw new Error("[Inter PIX] Credenciais ou certificados não configurados.");
  }

  const agent = buildMtlsAgent(creds.certPath, creds.keyPath);
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: "pagamento-pix.write extrato.read",
    grant_type: "client_credentials",
  }).toString();

  const res = await httpsRequest(
    `${BASE_URL}/oauth/v2/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
      agent,
    },
    body
  );

  if (res.status !== 200 || !res.body?.access_token) {
    throw new Error(`[Inter PIX] Falha na autenticação OAuth: HTTP ${res.status} — ${JSON.stringify(res.body)}`);
  }

  _tokenCache = res.body.access_token;
  _tokenExpiresAt = Date.now() + (55 * 60 * 1000);

  console.log("[Inter PIX] Token OAuth renovado com sucesso.");
  return _tokenCache;
}

// -- Pagamento PIX ------------------------------------------------------------

/**
 * Envia um pagamento PIX para a chave da camareira
 */
export async function sendInterPix({ amount, pixKey, description, idempotencyKey }) {
  if (!amount || amount <= 0) throw new Error("Valor inválido para pagamento PIX.");
  if (!pixKey) throw new Error("Chave PIX não informada.");
  if (!idempotencyKey) throw new Error("Chave de idempotência obrigatória.");

  // Modo simulação quando não há credenciais
  if (!isInterConfigured()) {
    console.warn("[Inter PIX] MODO SIMULAÇÃO — Credenciais não configuradas.");
    return {
      simulated: true,
      success: true,
      txId: `SIM_${idempotencyKey.replace(/-/g, "").substring(0, 12).toUpperCase()}`,
      status: "PAGO",
      amount,
      pixKey,
      description,
      message: "Pagamento simulado. Configure INTER_CLIENT_ID, INTER_CLIENT_SECRET e certificados para produção.",
    };
  }

  const token = await getInterToken();
  const creds = getInterCredentials();
  const agent = buildMtlsAgent(creds.certPath, creds.keyPath);

  const payload = JSON.stringify({
    valor: amount.toFixed(2),
    destinatario: {
      tipo: "CHAVE",
      chave: pixKey,
    },
    descricao: (description || "Pagamento Camareira CorpFlats").substring(0, 140),
  });

  const res = await httpsRequest(
    `${BASE_URL}/banking/v2/pix`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "x-id-idempotente": idempotencyKey,
      },
      agent,
    },
    payload
  );

  if (res.status === 200 || res.status === 201) {
    const txId = res.body?.txId || res.body?.endToEndId || res.body?.codigoTransacao || idempotencyKey;
    console.log(`[Inter PIX] PIX enviado com sucesso. txId: ${txId}`);
    return {
      simulated: false,
      success: true,
      txId,
      status: res.body?.status || "PAGO",
      amount,
      pixKey,
      description,
      rawResponse: res.body,
    };
  }

  // Idempotência: se já foi pago, retorna o mesmo resultado
  if (res.status === 422 && res.body?.codigo === "DUPLICATED_REQUEST") {
    return {
      simulated: false,
      success: true,
      txId: idempotencyKey,
      status: "PAGO",
      amount,
      pixKey,
      description,
      alreadyProcessed: true,
    };
  }

  throw new Error(`[Inter PIX] Falha no pagamento PIX: HTTP ${res.status} — ${JSON.stringify(res.body)}`);
}

/**
 * Consulta status de um pagamento PIX pelo txId
 */
export async function getInterPixStatus(txId) {
  if (!isInterConfigured()) {
    return { simulated: true, txId, status: "PAGO" };
  }

  const token = await getInterToken();
  const creds = getInterCredentials();
  const agent = buildMtlsAgent(creds.certPath, creds.keyPath);

  const res = await httpsRequest(
    `${BASE_URL}/banking/v2/pix/${encodeURIComponent(txId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      agent,
    }
  );

  if (res.status === 200) {
    return { simulated: false, txId, ...res.body };
  }

  throw new Error(`[Inter PIX] Falha ao consultar txId ${txId}: HTTP ${res.status}`);
}

export { isInterConfigured, getInterCredentials, INTER_ENV, BASE_URL };

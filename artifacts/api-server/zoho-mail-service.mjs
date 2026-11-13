import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  getSmtpConfig,
  sendEmailAsync,
  resendEmailAsync,
  wrapEmailTemplate,
  renderCheckinConfirmedEmail,
  renderReservationUpdateEmail,
  renderGarageAuthorizationEmail,
  renderReservationConfirmationEmail,
  renderPreCheckinReminderEmail,
  renderAccessInstructionsEmail,
  renderB2bAgencyCredentialRequestEmail,
  renderManualEmail,
  resolveReservationAttachments,
  ensureReservationAttachmentsReady,
  validateGuestEmailAddress,
  isInternalOrThirdPartyOperationalEmail,
  notifyGuestInvalidEmailViaWhatsApp,
  reconcileFalsePositiveEmailAlerts
} from "./mail-service.mjs";
import { extractTextFromPdfBuffer } from "./pdf-extract-service.mjs";
import {
  detectB2bEmailIntent,
  matchReservationForCancellation,
  executeAutonomousB2bCancellation,
  resolveB2bManagerWhatsApp
} from "./b2b-cancellation-service.mjs";
import {
  lookupCnpj,
  resolveKnownCnpjDirectory,
  isGenericPelincaCompanyAddress,
  enrichCrmEntityWithCnpjData
} from "./lookup.mjs";
import {
  isMissingGuestDataForCredential,
  getReservationRecipients,
  resolveValidRequesterWhatsApp,
  dispatchRequesterGuestCredentialRequest,
  sendCredentialContingencyManagerAlert,
  sendZapiMessage
} from "./zapi-service.mjs";

// ── Cache em memória para Ciclo de Vida OAuth2 Zoho ───────────────────────────
const zohoTokenCache = {
  accessToken: null,
  expiresAt: 0,
  accountId: null,
  primaryEmailAddress: null,
  accountDisplayName: null,
  lastSyncAt: null,
  lastWebhookAt: null,
  webhookEndpoint: "https://corpflats.com.br/api/webmail/zoho-webhook",
  lastError: null,
  lastFolderSyncAt: {},
  folderMapCache: null,
  folderMapExpiresAt: 0,
  syncInFlightByKey: {},
  lastB2bDispatchCheckAt: 0
};

// Cache curto em RAM (TTL 20s) para resumos de anexos de reservas, evitando milhares de fs.existsSync repetidos por listagem
const reservationAttSummaryCache = new Map();

function getCachedReservationAttSummary(reservation, db) {
  if (!reservation) return { count: 0, filenames: [] };
  const guestCountSig = Array.isArray(reservation.guests)
    ? reservation.guests.map(g => `${g?.index || ""}:${g?.hasCompletedCheckin ? 1 : 0}:${g?.fnrhDocumentUuid || ""}`).join(",")
    : "";
  const cacheKey = `${reservation.id}|${reservation.updatedAt || ""}|${reservation.fnrhSignedAt || ""}|${reservation.fnhrCompleted ? 1 : 0}|${reservation.fnrhDocumentUuid || ""}|${guestCountSig}`;
  const now = Date.now();
  const hit = reservationAttSummaryCache.get(reservation.id);
  if (hit && hit.sig === cacheKey && now - hit.ts < 20000) {
    return hit.val;
  }
  const atts = resolveReservationAttachments({ reservation, db });
  const val = {
    count: atts.length,
    filenames: atts.map(a => a.filename)
  };
  if (reservationAttSummaryCache.size > 500) {
    reservationAttSummaryCache.clear();
  }
  reservationAttSummaryCache.set(reservation.id, { sig: cacheKey, ts: now, val });
  return val;
}

const DEMO_SEED_IDS = new Set([
  "inb_welcome_portaria_1",
  "inb_guest_question_1",
  "inb_garage_confirm_1"
]);

const DEFAULT_SYSTEM_LABELS = [
  { id: "lbl_reserva", name: "Reservas & OTAs", color: "#10B981", system: true },
  { id: "lbl_hospede", name: "Hóspedes", color: "#06B6D4", system: true },
  { id: "lbl_portaria", name: "Portaria Soho", color: "#3B82F6", system: true },
  { id: "lbl_garagem", name: "Garagem PFB", color: "#F59E0B", system: true },
  { id: "lbl_urgente", name: "Alerta / Erro Entrega", color: "#EF4444", system: true },
  { id: "lbl_financeiro", name: "Financeiro", color: "#8B5CF6", system: true },
  { id: "lbl_codigos", name: "Códigos & Acessos", color: "#64748B", system: true }
];

const LEGACY_EMPTY_FOLDER_IDS = new Set([
  "fld_portaria",
  "fld_garagem",
  "fld_fornecedores"
]);

/**
 * Garante as coleções necessárias no banco em memória / persistido
 */
export function ensureWebmailCollections(db) {
  if (!db) return;
  if (!db.settings) db.settings = {};
  if (!db.settings.zohoOAuth) db.settings.zohoOAuth = {};
  if (!Array.isArray(db.emailDrafts)) db.emailDrafts = [];
  if (!db.emailStateMeta || typeof db.emailStateMeta !== "object") {
    db.emailStateMeta = {};
  }
  if (!Array.isArray(db.emailCustomFolders)) {
    db.emailCustomFolders = [];
  } else {
    // Remove pastas vazias legadas que duplicavam as etiquetas de Portaria e Garagem
    const usedFolders = new Set(
      Object.values(db.emailStateMeta)
        .map(m => m?.folder)
        .filter(Boolean)
    );
    db.emailCustomFolders = db.emailCustomFolders.filter(
      cf => !LEGACY_EMPTY_FOLDER_IDS.has(cf.id) || usedFolders.has(cf.id)
    );
  }
  if (!Array.isArray(db.emailLabels) || db.emailLabels.length === 0) {
    db.emailLabels = [...DEFAULT_SYSTEM_LABELS];
  } else {
    const defaultById = new Map(DEFAULT_SYSTEM_LABELS.map(l => [l.id, l]));
    // Atualiza nomes e cores das etiquetas de sistema e preserva etiquetas criadas pelo usuário
    const customUserLabels = db.emailLabels.filter(
      l => l && !defaultById.has(l.id) && l.id !== "lbl_vip"
    );
    db.emailLabels = [...DEFAULT_SYSTEM_LABELS, ...customUserLabels];
  }
  if (!Array.isArray(db.zohoMessagesCache)) {
    db.zohoMessagesCache = [];
  }
  if (!Array.isArray(db.webmailInboundMessages)) {
    db.webmailInboundMessages = [];
  }
  if (!Array.isArray(db.processedB2bCancelEmailKeys)) {
    db.processedB2bCancelEmailKeys = [];
  }

  // Semeia mensagens iniciais de demonstração operacional na Caixa de Entrada caso esteja vazia,
  // permitindo testar leitura em thread, resposta rápida, anexos e vínculo com reservas imediatamente.
  if (db.webmailInboundMessages.length === 0 && !db.settings.webmailSeededV1) {
    const sampleRes = (db.reservations || []).find(r => r.status !== "cancelada") || (db.reservations || [])[0];
    const flatNum = sampleRes?.flatNumber || "113";
    const guestName = sampleRes?.guestName || "Hóspede CorpFlats";
    const guestEmail = sampleRes?.guestEmail || "hospede.exemplo@empresa.com.br";
    const resCode = sampleRes?.code || `RES-${flatNum}`;
    const now = Date.now();

    db.webmailInboundMessages.push(
      {
        id: "inb_welcome_portaria_1",
        threadId: `thread_${resCode}`,
        folder: "inbox",
        direction: "inbound",
        fromName: "Recepção Soho Residence (Promenade)",
        fromEmail: db.settings?.receptionEmail || "soho@promenade.com.br",
        recipient: getSmtpConfig(db).fromEmail || "reservas@corpflats.com.br",
        cc: "",
        subject: `Re: Flat ${flatNum} - ${guestName} (Confirmação de Recebimento Portaria)`,
        snippet: `Recebemos a ficha FNRH e a liberação de entrada para o Flat ${flatNum} (${guestName}). Chaves separadas na recepção 24h.`,
        bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #1F2937; line-height: 1.6;">
          <p>Olá, equipe <strong>CorpFlats</strong>!</p>
          <p>Confirmamos o recebimento da documentação cadastral e da Ficha FNRH referente à reserva <strong>#${resCode}</strong> (<strong>Flat ${flatNum}</strong> — Hóspede: <strong>${guestName}</strong>).</p>
          <p>O acesso já encontra-se pré-autorizado na portaria 24h do Edifício Soho Residence Service.</p>
          <hr style="border:none;border-top:1px solid #E5E7EB;margin:16px 0;" />
          <p style="font-size:12px;color:#6B7280;">Atenciosamente,<br/><strong>Recepção & Portaria 24h • Edifício Soho Residence</strong></p>
        </div>`,
        bodyText: `Olá, equipe CorpFlats! Confirmamos o recebimento da documentação cadastral e da Ficha FNRH referente à reserva #${resCode} (Flat ${flatNum} - Hóspede: ${guestName}).`,
        isRead: false,
        isStarred: true,
        labels: ["lbl_portaria", "lbl_reserva"],
        reservation_id: String(sampleRes?.id || resCode),
        reservationCode: resCode,
        created_at: new Date(now - 25 * 60 * 1000).toISOString(),
        attachments: []
      },
      {
        id: "inb_guest_question_1",
        threadId: `thread_guest_${resCode}`,
        folder: "inbox",
        direction: "inbound",
        fromName: guestName,
        fromEmail: guestEmail,
        recipient: getSmtpConfig(db).fromEmail || "reservas@corpflats.com.br",
        cc: "",
        subject: `Dúvida sobre vaga de garagem e Early Check-in - Flat ${flatNum} (#${resCode})`,
        snippet: `Olá! Gostaria de confirmar se consigo entrar um pouco antes das 14h e cadastrar a placa do meu veículo para o estacionamento.`,
        bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #1F2937; line-height: 1.6;">
          <p>Bom dia, pessoal do <strong>CorpFlats</strong>!</p>
          <p>Estou com a reserva <strong>#${resCode}</strong> confirmada para o <strong>Flat ${flatNum}</strong>.</p>
          <p>Gostaria de saber se há possibilidade de <em>Early Check-in</em> por volta das 12h30 e se já posso informar a placa do carro por aqui para liberar o estacionamento PFB.</p>
          <p>Muito obrigado,<br/><strong>${guestName}</strong></p>
        </div>`,
        bodyText: `Bom dia, pessoal do CorpFlats! Estou com a reserva #${resCode} confirmada para o Flat ${flatNum}. Gostaria de saber sobre Early Check-in e liberação de garagem.`,
        isRead: false,
        isStarred: false,
        labels: ["lbl_reserva", "lbl_garagem"],
        reservation_id: String(sampleRes?.id || resCode),
        reservationCode: resCode,
        created_at: new Date(now - 2 * 3600 * 1000).toISOString(),
        attachments: []
      },
      {
        id: "inb_garage_confirm_1",
        threadId: `thread_garage_${flatNum}`,
        folder: "inbox",
        direction: "inbound",
        fromName: "PFB Estacionamentos - Soho",
        fromEmail: db.settings?.garageEmail || "promenadesoho@pfbestacionamentos.com.br",
        recipient: getSmtpConfig(db).fromEmail || "reservas@corpflats.com.br",
        cc: "",
        subject: `Re: Autorização de Garagem Liberada - Flat ${flatNum}`,
        snippet: `Veículo cadastrado na cancela eletrônica para o período da estadia do Flat ${flatNum}.`,
        bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #1F2937; line-height: 1.6;">
          <p>Prezada Administração CorpFlats,</p>
          <p>Informamos que a liberação de vaga de garagem referente ao <strong>Flat ${flatNum}</strong> foi registrada com sucesso no sistema da PFB Estacionamentos.</p>
          <p>Cordialmente,<br/><strong>Operação PFB Estacionamentos • Promenade Soho</strong></p>
        </div>`,
        bodyText: `Prezada Administração CorpFlats, Informamos que a liberação de vaga de garagem referente ao Flat ${flatNum} foi registrada com sucesso.`,
        isRead: true,
        isStarred: false,
        labels: ["lbl_garagem"],
        reservation_id: String(sampleRes?.id || resCode),
        reservationCode: resCode,
        created_at: new Date(now - 18 * 3600 * 1000).toISOString(),
        attachments: []
      }
    );
    db.settings.webmailSeededV1 = true;
  }
}

function buildZohoB2bCancelSignature(subject = "", from = "") {
  const normSubj = String(subject || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  const normFrom = String(from || "").trim().toLowerCase();
  return normSubj || normFrom ? `sig:${normFrom}|${normSubj}` : "";
}

function hasProcessedZohoB2bCancelKey(db, keys = []) {
  if (!db || !Array.isArray(db.processedB2bCancelEmailKeys)) return false;
  return keys.some(k => k && db.processedB2bCancelEmailKeys.includes(k));
}

function markProcessedZohoB2bCancelKey(db, keys = []) {
  if (!db) return;
  if (!Array.isArray(db.processedB2bCancelEmailKeys)) {
    db.processedB2bCancelEmailKeys = [];
  }
  for (const k of keys) {
    if (!k) continue;
    if (!db.processedB2bCancelEmailKeys.includes(k)) {
      db.processedB2bCancelEmailKeys.unshift(k);
    }
  }
  if (db.processedB2bCancelEmailKeys.length > 2000) {
    db.processedB2bCancelEmailKeys.length = 2000;
  }
}

/**
 * Obtém a configuração consolidada do Zoho OAuth2 (.env > db.settings.zohoOAuth)
 */
export function getZohoOAuthConfig(db, overrides = {}) {
  const saved = db?.settings?.zohoOAuth || {};
  const clientId = (overrides.clientId !== undefined ? overrides.clientId : (process.env.ZOHO_CLIENT_ID || saved.clientId || "")).trim();
  const clientSecret = (overrides.clientSecret !== undefined && overrides.clientSecret !== "••••••••"
    ? overrides.clientSecret
    : (process.env.ZOHO_CLIENT_SECRET || saved.clientSecret || "")).trim();
  const refreshToken = (overrides.refreshToken !== undefined && overrides.refreshToken !== "••••••••"
    ? overrides.refreshToken
    : (process.env.ZOHO_REFRESH_TOKEN || saved.refreshToken || "")).trim();
  const accountId = (overrides.accountId !== undefined
    ? overrides.accountId
    : (process.env.ZOHO_ACCOUNT_ID || saved.accountId || zohoTokenCache.accountId || "")).trim();
  const dc = (overrides.dc || process.env.ZOHO_DC || saved.dc || "com").replace(/^\./, "").trim();

  const accountsDomain = dc.startsWith("http") ? dc : `https://accounts.zoho.${dc}`;
  const mailApiBase = `https://mail.zoho.${dc}/api`;

  const isConfigured = Boolean(clientId && clientSecret && refreshToken);

  return {
    clientId,
    clientSecret,
    refreshToken,
    accountId,
    dc,
    accountsDomain,
    mailApiBase,
    isConfigured
  };
}

/**
 * Troca um Authorization Code temporário ("Self Client" do Zoho API Console) por um Refresh Token permanente
 */
export async function exchangeZohoGrantCode(db, saveDatabase, { grantCode, clientId, clientSecret, dc = "com" }) {
  const cfg = getZohoOAuthConfig(db, { clientId, clientSecret, dc });
  if (!cfg.clientId || !cfg.clientSecret || !grantCode) {
    return {
      ok: false,
      error: "Informe o Client ID, Client Secret e o Código de Autorização (Self Client Grant Code)."
    };
  }

  try {
    const params = new URLSearchParams({
      code: grantCode.trim(),
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret
    });

    const tokenUrl = `${cfg.accountsDomain}/oauth/v2/token`;
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return {
        ok: false,
        error: `Erro Zoho OAuth (${data.error || res.status}): Verifique se o Grant Code não expirou e se o Data Center (${cfg.dc}) corresponde à sua conta Zoho.`
      };
    }

    if (!db.settings) db.settings = {};
    if (!db.settings.zohoOAuth) db.settings.zohoOAuth = {};
    db.settings.zohoOAuth.clientId = cfg.clientId;
    db.settings.zohoOAuth.clientSecret = cfg.clientSecret;
    db.settings.zohoOAuth.dc = cfg.dc;
    if (data.refresh_token) {
      db.settings.zohoOAuth.refreshToken = data.refresh_token;
    }

    if (data.access_token) {
      zohoTokenCache.accessToken = data.access_token;
      zohoTokenCache.expiresAt = Date.now() + ((Number(data.expires_in) || 3600) - 300) * 1000;
    }

    // Descobre accountId imediatamente
    const accResult = await discoverZohoAccountId(db);
    if (accResult.accountId) {
      db.settings.zohoOAuth.accountId = accResult.accountId;
    }

    if (typeof saveDatabase === "function") saveDatabase();

    return {
      ok: true,
      refreshToken: data.refresh_token || db.settings.zohoOAuth.refreshToken,
      accountId: accResult.accountId || null,
      primaryEmailAddress: accResult.primaryEmailAddress || null,
      message: data.refresh_token
        ? "Refresh Token gerado e salvo automaticamente com sucesso!"
        : "Token de acesso obtido! (Obs: O Zoho só retorna refresh_token na primeira troca do código; se já possuir um, mantenha-o salvo)."
    };
  } catch (err) {
    return {
      ok: false,
      error: `Falha de rede ao contatar Zoho Accounts: ${err.message}`
    };
  }
}

/**
 * Obtém ou renova automaticamente o access_token do Zoho OAuth2 em memória
 */
export async function getZohoAccessToken(db, overrides = {}, forceRefresh = false) {
  const cfg = getZohoOAuthConfig(db, overrides);
  if (!cfg.isConfigured) {
    return { ok: false, error: "Credenciais Zoho OAuth2 não configuradas.", isConfigured: false };
  }

  const now = Date.now();
  if (!forceRefresh && zohoTokenCache.accessToken && zohoTokenCache.expiresAt > now) {
    return { ok: true, accessToken: zohoTokenCache.accessToken, config: cfg };
  }

  try {
    const params = new URLSearchParams({
      refresh_token: cfg.refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "refresh_token"
    });

    const tokenUrl = `${cfg.accountsDomain}/oauth/v2/token`;
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    const data = await res.json();
    if (!res.ok || data.error || !data.access_token) {
      const errMsg = data.error || `HTTP ${res.status}`;
      zohoTokenCache.lastError = errMsg;
      return {
        ok: false,
        error: `Falha ao renovar access_token Zoho (${errMsg}). Verifique Client ID, Secret, Refresh Token e Data Center (${cfg.dc}).`
      };
    }

    const expiresInSec = Number(data.expires_in) || 3600;
    zohoTokenCache.accessToken = data.access_token;
    zohoTokenCache.expiresAt = now + Math.max(60, expiresInSec - 300) * 1000;
    zohoTokenCache.lastError = null;

    return { ok: true, accessToken: data.access_token, config: cfg };
  } catch (err) {
    zohoTokenCache.lastError = err.message;
    return { ok: false, error: `Erro de conexão com Zoho OAuth2: ${err.message}` };
  }
}

/**
 * Descobre e faz cache automático do accountId via GET /api/accounts
 */
export async function discoverZohoAccountId(db, overrides = {}) {
  const tokenRes = await getZohoAccessToken(db, overrides);
  if (!tokenRes.ok) return tokenRes;

  const { accessToken, config } = tokenRes;
  if (config.accountId && zohoTokenCache.accountId === config.accountId && zohoTokenCache.primaryEmailAddress) {
    return {
      ok: true,
      accountId: config.accountId,
      primaryEmailAddress: zohoTokenCache.primaryEmailAddress,
      accountDisplayName: zohoTokenCache.accountDisplayName
    };
  }

  try {
    const res = await fetch(`${config.mailApiBase}/accounts`, {
      method: "GET",
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        Accept: "application/json"
      }
    });

    const data = await res.json();
    if (!res.ok || !Array.isArray(data?.data) || data.data.length === 0) {
      return {
        ok: false,
        error: data?.data?.moreInfo || data?.status?.description || `Não foi possível listar contas na Zoho Mail API (HTTP ${res.status}). Verifique se os escopos ZohoMail.accounts.READ e ZohoMail.messages.ALL estão ativos.`
      };
    }

    const primaryAcc = data.data[0];
    const discoveredId = String(primaryAcc.accountId || "").trim();
    const emailAddr = primaryAcc.primaryEmailAddress || primaryAcc.incomingUserName || "";
    const dispName = primaryAcc.accountDisplayName || primaryAcc.displayName || "CorpFlats";

    zohoTokenCache.accountId = discoveredId;
    zohoTokenCache.primaryEmailAddress = emailAddr;
    zohoTokenCache.accountDisplayName = dispName;

    if (db?.settings?.zohoOAuth && discoveredId) {
      db.settings.zohoOAuth.accountId = discoveredId;
      db.settings.zohoOAuth.primaryEmailAddress = emailAddr;
    }

    return {
      ok: true,
      accountId: discoveredId,
      primaryEmailAddress: emailAddr,
      accountDisplayName: dispName,
      accounts: data.data
    };
  } catch (err) {
    return {
      ok: false,
      error: `Erro ao consultar /api/accounts no Zoho Mail: ${err.message}`
    };
  }
}

/**
 * Helper genérico para chamadas autenticadas à Zoho Mail REST API
 */
export async function callZohoMailApi(db, endpointPath, options = {}) {
  const tokenRes = await getZohoAccessToken(db);
  if (!tokenRes.ok) return tokenRes;

  let accountId = tokenRes.config.accountId || zohoTokenCache.accountId;
  if (!accountId && endpointPath.includes("{accountId}")) {
    const accRes = await discoverZohoAccountId(db);
    if (!accRes.ok) return accRes;
    accountId = accRes.accountId;
  }

  const finalPath = endpointPath.replace("{accountId}", accountId || "");
  const url = `${tokenRes.config.mailApiBase}${finalPath.startsWith("/") ? "" : "/"}${finalPath}`;

  try {
    const headers = {
      Authorization: `Zoho-oauthtoken ${tokenRes.accessToken}`,
      Accept: "application/json",
      ...(options.body && typeof options.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    };

    let res = await fetch(url, {
      ...options,
      headers
    });

    // Se retornou 401, força renovação única do token e tenta novamente
    if (res.status === 401) {
      const retryToken = await getZohoAccessToken(db, {}, true);
      if (retryToken.ok) {
        headers.Authorization = `Zoho-oauthtoken ${retryToken.accessToken}`;
        res = await fetch(url, { ...options, headers });
      }
    }

    const contentType = res.headers.get("content-type") || "";
    let payload;
    if (options.responseType === "buffer" && res.ok) {
      const ab = await res.arrayBuffer();
      payload = Buffer.from(ab);
    } else {
      payload = contentType.includes("application/json") ? await res.json() : await res.text();
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: payload?.data?.moreInfo || payload?.status?.description || `Erro Zoho API HTTP ${res.status}`,
        raw: payload
      };
    }

    zohoTokenCache.lastSyncAt = new Date().toISOString();
    return {
      ok: true,
      status: res.status,
      data: payload?.data !== undefined ? payload.data : payload,
      raw: payload
    };
  } catch (err) {
    return {
      ok: false,
      error: `Erro na requisição Zoho Mail API (${endpointPath}): ${err.message}`
    };
  }
}

/**
 * Sanitizador seguro de HTML de e-mail para proteger contra XSS mantendo layouts ricos
 */
export function sanitizeEmailHtml(rawHtml = "") {
  if (!rawHtml || typeof rawHtml !== "string") return "";
  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "blocked:");
}

/**
 * Extrai texto limpo para snippet a partir de HTML
 */
export function extractTextSnippet(htmlOrText = "", maxLen = 140) {
  if (!htmlOrText) return "";
  const noStyle = String(htmlOrText)
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
  return noStyle.length > maxLen ? noStyle.slice(0, maxLen).trim() + "…" : noStyle;
}

/**
 * Normaliza assunto para agrupamento inteligente de Threads (remove Re:, Fwd:, Enc:, etc.)
 */
export function normalizeThreadSubject(subject = "") {
  return String(subject || "")
    .replace(/^(\s*(re|fw|fwd|enc|resp)\s*:\s*)+/gi, "")
    .trim()
    .toLowerCase();
}

/**
 * Cruza automaticamente um e-mail com o banco de reservas e hóspedes do CorpFlats
 */
export function matchEmailWithReservation(db, item) {
  if (!db || !item) return null;
  const reservations = db.reservations || [];
  if (reservations.length === 0) return null;

  const explicitId = item.reservation_id || item.reservationId || item.reservationCode || item.metadata?.reservationCode;
  let matched = null;

  if (explicitId && explicitId !== "0" && explicitId !== "MANUAL" && explicitId !== "TEST") {
    const cleanExp = String(explicitId).trim().toUpperCase();
    matched = reservations.find(
      r => String(r.id).toUpperCase() === cleanExp || (r.code && String(r.code).toUpperCase() === cleanExp)
    );
  }

  // 2. Busca por código #RES-... ou #CORP-... no assunto, snippet ou corpo
  if (!matched) {
    const textToScan = `${item.subject || ""} ${item.snippet || ""} ${item.bodyText || ""}`;
    const codeMatch = textToScan.match(/\b(RES-[A-Z0-9-]+|CORP-[A-Z0-9-]+)\b/i);
    if (codeMatch) {
      const targetCode = codeMatch[1].toUpperCase();
      matched = reservations.find(r => r.code && String(r.code).toUpperCase() === targetCode);
    }
  }

  // 3. Busca por endereço de e-mail do remetente, destinatário ou e-mail citado em erro de entrega (Bounce)
  if (!matched) {
    const extractedFromBody = [];
    const scanText = `${item.snippet || ""} ${item.bodyText || ""}`;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    let emMatch;
    while ((emMatch = emailRegex.exec(scanText)) !== null) {
      extractedFromBody.push(emMatch[0]);
    }

    const candidateEmails = [item.fromEmail, item.recipient, ...extractedFromBody]
      .filter(Boolean)
      .flatMap(e => String(e).split(/[,;]/))
      .map(e => e.replace(/.*<([^>]+)>.*/, "$1").trim().toLowerCase())
      .filter(
        e =>
          e &&
          e.includes("@") &&
          !e.includes("corpflats") &&
          !e.includes("promenade") &&
          !e.includes("pfbestacionamentos") &&
          !e.includes("zoho") &&
          !e.includes("b2breservas")
      );

    if (candidateEmails.length > 0) {
      matched = reservations.find(r => {
        const rEmail = (r.guestEmail || "").trim().toLowerCase();
        if (rEmail && candidateEmails.includes(rEmail)) return true;
        if (Array.isArray(r.guests)) {
          return r.guests.some(g => g.email && candidateEmails.includes(String(g.email).trim().toLowerCase()));
        }
        return false;
      });
    }
  }

  // 4. Busca por "Flat XXX" no assunto
  if (!matched && item.subject) {
    const flatMatch = String(item.subject).match(/\bFlat\s+(\d+[A-Z]?)\b/i);
    if (flatMatch) {
      const flatNum = flatMatch[1];
      const candidates = reservations.filter(r => String(r.flatNumber) === flatNum && r.status !== "cancelada");
      if (candidates.length === 1) {
        matched = candidates[0];
      } else if (candidates.length > 1) {
        matched =
          candidates.find(
            r => r.guestName && item.subject.toLowerCase().includes(r.guestName.toLowerCase().split(" ")[0])
          ) || candidates[0];
      }
    }
  }

  // 5. Padrão B2B Reservas: Nº B2B (ex: 25055349, 25057926), RLOC (ex: ZYIK2X) ou "(SOBRENOME/NOME)"
  if (!matched && (item.subject || item.snippet || item.bodyText)) {
    const scanB2b = `${item.subject || ""} ${item.snippet || ""} ${item.bodyText || ""}`;
    const b2bNumMatch = scanB2b.match(/(?:Confirma[cç][aã]o\s+d[ae]\s+Reserva\s*[-:]?\s*|Reserva\s+B2B\s*#?\s*)(\d{7,10})\b/i);
    if (b2bNumMatch) {
      const targetNum = b2bNumMatch[1].trim();
      matched = reservations.find(
        r =>
          r &&
          r.status !== "cancelada" &&
          (String(r.b2bReservationNumber || "") === targetNum ||
            String(r.externalReservationNumber || "") === targetNum ||
            String(r.b2bLocatorRloc || "") === targetNum)
      );
    }

    if (!matched && item.subject) {
      const b2bMatch = String(item.subject).match(/\(([^/)]+)\/([^)]+)\)(?:.*Check-in:\s*(\d{2})\/(\d{2})\/(\d{4}))?/i);
      if (b2bMatch) {
        const lastToken = b2bMatch[1].trim().toLowerCase();
        const firstToken = b2bMatch[2].trim().toLowerCase().split(/\s+/)[0];
        const checkinIso =
          b2bMatch[3] && b2bMatch[4] && b2bMatch[5] ? `${b2bMatch[5]}-${b2bMatch[4]}-${b2bMatch[3]}` : null;

        matched = reservations.find(r => {
          if (!r || r.status === "cancelada") return false;
          const gName = String(r.guestName || "").toLowerCase();
          const nameMatches = gName.includes(firstToken) && gName.includes(lastToken);
          if (!nameMatches) return false;
          if (checkinIso && r.checkinDate && r.checkinDate !== checkinIso) return false;
          return true;
        });
      }
    }
  }

  if (!matched) return null;

  const flat = (db.flats || []).find(f => f.id === matched.flatId || String(f.number) === String(matched.flatNumber));
  const attSummary = getCachedReservationAttSummary(matched, db);

  return {
    id: matched.id,
    code: matched.code || `RES-${matched.flatNumber || "00"}-${matched.id}`,
    flatNumber: matched.flatNumber || flat?.number || "N/I",
    buildingName: flat?.buildingName || flat?.building || db.settings?.buildingName || "Edifício Soho Residence Service",
    guestName: matched.guestName || "Hóspede Titular",
    guestEmail: matched.guestEmail || "",
    guestPhone: matched.guestPhone || "",
    guestDocument: matched.guestDocument || "",
    checkinDate: matched.checkinDate || "",
    checkoutDate: matched.checkoutDate || "",
    status: matched.status || "confirmada",
    fnhrCompleted: Boolean(matched.fnhrCompleted || matched.fnrhDocumentUuid || matched.guests?.[0]?.hasCompletedCheckin),
    vehiclePlate: matched.vehicle?.plate || "",
    attachmentsAvailableCount: attSummary.count,
    attachmentsSummary: attSummary.filenames,
    receptionNotified: Boolean(matched.morningEmailSentDate || matched.receptionNotifiedAt)
  };
}

/**
 * Decodifica entidades HTML retornadas pela Zoho Mail API em campos de remetente, destinatário e assunto
 */
export function decodeZohoEntities(str = "") {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .trim();
}

export function cleanAddressField(raw = "") {
  const decoded = decodeZohoEntities(raw);
  return decoded
    .replace(/"([^"]+)"\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, "$1 <$2>")
    .replace(/<([^>]+)>/g, "$1")
    .trim();
}

/**
 * Descobre e classifica todas as pastas da conta Zoho Mail (incluindo Inbox principal, Notification e Newsletter)
 */
export async function resolveZohoFolders(db, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && zohoTokenCache.folderMapCache && zohoTokenCache.folderMapExpiresAt > now) {
    return zohoTokenCache.folderMapCache;
  }

  const zohoFolderMap = {
    inbox: null,
    inboxFolderIds: [],
    newsletters: null,
    sent: null,
    drafts: null,
    trash: null,
    spam: null,
    outbox: null,
    archive: null,
    folderCategoryById: {},
    folderNameById: {}
  };

  const foldersRes = await callZohoMailApi(db, "/accounts/{accountId}/folders");
  if (foldersRes.ok && Array.isArray(foldersRes.data)) {
    for (const zf of foldersRes.data) {
      const fId = String(zf.folderId || "").trim();
      if (!fId) continue;
      const fType = String(zf.folderType || "").trim().toLowerCase();
      const fName = String(zf.folderName || "").trim().toLowerCase();
      const fPath = String(zf.path || "").trim().toLowerCase();

      zohoFolderMap.folderNameById[fId] = zf.folderName || "";

      if (fType === "sent" || fName === "sent" || fName === "enviados" || fPath === "/sent") {
        zohoFolderMap.sent = fId;
        zohoFolderMap.folderCategoryById[fId] = "sent";
      } else if (fType.includes("draft") || fName.includes("draft") || fName.includes("rascunho")) {
        zohoFolderMap.drafts = fId;
        zohoFolderMap.folderCategoryById[fId] = "drafts";
      } else if (fType.includes("trash") || fName.includes("trash") || fName.includes("lixeira")) {
        zohoFolderMap.trash = fId;
        zohoFolderMap.folderCategoryById[fId] = "trash";
      } else if (fType.includes("spam") || fType.includes("junk") || fName.includes("spam") || fName.includes("lixo")) {
        zohoFolderMap.spam = fId;
        zohoFolderMap.folderCategoryById[fId] = "spam";
      } else if (fType.includes("outbox") || fName.includes("outbox") || fName.includes("saída") || fName.includes("saida")) {
        zohoFolderMap.outbox = fId;
        zohoFolderMap.folderCategoryById[fId] = "outbox";
      } else if (fType.includes("archive") || fName.includes("archive") || fName.includes("arquivo")) {
        zohoFolderMap.archive = fId;
        zohoFolderMap.folderCategoryById[fId] = "archive";
      } else if (fType.includes("template") || fType.includes("snooze") || fName.includes("template") || fName.includes("snooze")) {
        zohoFolderMap.folderCategoryById[fId] = "other";
      } else if (fName.includes("newsletter") || fPath.includes("newsletter")) {
        zohoFolderMap.newsletters = fId;
        if (!zohoFolderMap.inboxFolderIds.includes(fId)) {
          zohoFolderMap.inboxFolderIds.push(fId);
        }
        zohoFolderMap.folderCategoryById[fId] = "newsletters";
      } else if (fName === "inbox" || fName === "caixa de entrada" || fPath === "/inbox") {
        // Caixa de Entrada Principal sempre na primeira posição
        zohoFolderMap.inbox = fId;
        zohoFolderMap.inboxFolderIds = [fId, ...zohoFolderMap.inboxFolderIds.filter(x => x !== fId)];
        zohoFolderMap.folderCategoryById[fId] = "inbox";
      } else if (
        fType === "inbox" ||
        fName.includes("inbox") ||
        fName.includes("notification") ||
        fName.includes("notifica")
      ) {
        if (!zohoFolderMap.inboxFolderIds.includes(fId)) {
          zohoFolderMap.inboxFolderIds.push(fId);
        }
        if (!zohoFolderMap.inbox) {
          zohoFolderMap.inbox = fId;
        }
        zohoFolderMap.folderCategoryById[fId] = "inbox";
      } else {
        if (!zohoFolderMap.inboxFolderIds.includes(fId)) {
          zohoFolderMap.inboxFolderIds.push(fId);
        }
        zohoFolderMap.folderCategoryById[fId] = "inbox";
      }
    }

    zohoTokenCache.folderMapCache = zohoFolderMap;
    zohoTokenCache.folderMapExpiresAt = now + 5 * 60 * 1000;
  }

  return zohoFolderMap;
}

/**
 * Classifica com precisão a pasta e direção de uma mensagem Zoho com base no folderId real e nos endereços
 */
function classifyZohoMessageFolder(zm, zohoFolderMap, fallbackFolder = "inbox") {
  const zfId = String(zm.folderId || zm.zohoFolderId || "").trim();
  const fromLower = String(zm.fromAddress || zm.fromEmail || zm.sender || "").toLowerCase();
  const toLower = String(zm.toAddress || zm.recipient || "").toLowerCase();
  const subjLower = String(zm.subject || "").toLowerCase();

  const isOperationalSender =
    fromLower.includes("b2breservas") ||
    fromLower.includes("promenade.com.br") ||
    fromLower.includes("pfbestacionamentos") ||
    fromLower.includes("booking.com") ||
    fromLower.includes("airbnb") ||
    fromLower.includes("expedia") ||
    fromLower.includes("mailer-daemon") ||
    subjLower.includes("confirmacao de reserva") ||
    subjLower.includes("confirmação de reserva") ||
    subjLower.includes("confirmacao da reserva");

  if (zfId && zohoFolderMap?.folderCategoryById?.[zfId]) {
    const cat = zohoFolderMap.folderCategoryById[zfId];
    if (cat === "newsletters") {
      return isOperationalSender ? "inbox" : "newsletters";
    }
    if (cat && cat !== "other") return cat;
  }
  if (zfId === "7807358000000009011") {
    return isOperationalSender ? "inbox" : "newsletters";
  }
  if (zfId && zohoFolderMap?.sent && zfId === String(zohoFolderMap.sent)) return "sent";
  if (zfId && zohoFolderMap?.drafts && zfId === String(zohoFolderMap.drafts)) return "drafts";
  if (zfId && zohoFolderMap?.trash && zfId === String(zohoFolderMap.trash)) return "trash";
  if (zfId && zohoFolderMap?.spam && zfId === String(zohoFolderMap.spam)) return "spam";
  if (zfId && zohoFolderMap?.archive && zfId === String(zohoFolderMap.archive)) return "archive";

  const isFromOwnDomain = fromLower.includes("@corpflats.com.br");
  const isToOwnDomain = toLower.includes("@corpflats.com.br");

  if (isFromOwnDomain && !isToOwnDomain && fallbackFolder !== "drafts" && fallbackFolder !== "trash") {
    return "sent";
  }

  // Heurística para remetentes conhecidos de marketing/newsletter
  if (
    !isOperationalSender &&
    (fromLower.includes("v4company.com") ||
      fromLower.includes("gruposenses.com.br") ||
      fromLower.includes("agendor.com.br") ||
      fromLower.includes("relacionamento.stone.com.br"))
  ) {
    return "newsletters";
  }

  if (["sent", "drafts", "trash", "spam", "archive", "outbox", "newsletters"].includes(fallbackFolder) && !zfId) {
    return fallbackFolder;
  }
  return "inbox";
}

/**
 * Infere etiquetas automáticas inteligentes EXCLUSIVAMENTE para mensagens recebidas (inbound)
 */
function inferZohoSmartLabels(item, existingLabels = [], matchedReservation = null) {
  if (item.direction !== "inbound" || item.folder === "sent" || item.folder === "queue" || item.folder === "drafts") {
    return [];
  }

  const validSystemIds = new Set(DEFAULT_SYSTEM_LABELS.map(l => l.id));
  // Preserva etiquetas customizadas aplicadas manualmente pelo usuário, mas recalcula as de sistema com precisão
  const set = new Set(
    (Array.isArray(existingLabels) ? existingLabels : []).filter(
      id => id && !validSystemIds.has(id) && id !== "lbl_vip"
    )
  );

  const fromLower = String(item.fromEmail || item.fromName || "").toLowerCase();
  const subjLower = String(item.subject || "").toLowerCase();
  const hay = `${fromLower} ${item.recipient || ""} ${subjLower}`.toLowerCase();

  // 1. Códigos de Acesso / 2FA / Verificação (separados para não poluir a etiqueta Reserva!)
  const isAccessCode =
    subjLower.includes("código de acesso") ||
    subjLower.includes("codigo de acesso") ||
    subjLower.includes("código de autenticação") ||
    subjLower.includes("codigo de autenticacao") ||
    subjLower.includes("autenticação b2b") ||
    subjLower.includes("autenticacao b2b") ||
    subjLower.includes("código de verificação") ||
    subjLower.includes("codigo de verificacao") ||
    subjLower.includes("verification code") ||
    subjLower.includes("código de segurança") ||
    subjLower.includes("token de acesso");

  if (isAccessCode) {
    set.add("lbl_codigos");
  }

  // 2. Portaria Soho
  if (fromLower.includes("promenade.com.br") || subjLower.includes("portaria")) {
    set.add("lbl_portaria");
  }

  // 3. Garagem PFB
  if (fromLower.includes("pfbestacionamentos") || subjLower.includes("garagem")) {
    set.add("lbl_garagem");
  }

  // 4. Alerta / Erro de Entrega (Bounce mailer-daemon ou urgente)
  if (
    fromLower.includes("mailer-daemon") ||
    fromLower.includes("postmaster") ||
    subjLower.includes("undelivered") ||
    subjLower.includes("failure notice") ||
    subjLower.includes("falha na entrega") ||
    subjLower.includes("urgente")
  ) {
    set.add("lbl_urgente");
  }

  // 5. Reservas & OTAs (apenas confirmações, alterações ou assuntos reais de reserva — nunca códigos de login)
  if (
    !isAccessCode &&
    (fromLower.includes("b2breservas") ||
      fromLower.includes("booking.com") ||
      fromLower.includes("airbnb") ||
      fromLower.includes("expedia") ||
      fromLower.includes("omnibees") ||
      fromLower.includes("decolar") ||
      subjLower.includes("confirmacao de reserva") ||
      subjLower.includes("confirmação de reserva") ||
      subjLower.includes("confirmacao da reserva") ||
      subjLower.includes("confirmação da reserva") ||
      subjLower.includes("nova reserva") ||
      subjLower.includes("cancelamento de reserva") ||
      subjLower.includes("reserva res-"))
  ) {
    set.add("lbl_reserva");
  }

  // 6. Financeiro (boletos, notas fiscais, comprovantes, faturas, bancos)
  if (
    hay.includes("nota fiscal") ||
    hay.includes("nfs-e") ||
    hay.includes("nf-e") ||
    hay.includes("boleto") ||
    hay.includes("fatura") ||
    hay.includes("comprovante") ||
    hay.includes("financeiro") ||
    (fromLower.includes("stone.com.br") && !fromLower.includes("relacionamento.stone.com.br"))
  ) {
    set.add("lbl_financeiro");
  }

  // 7. Hóspedes (e-mails diretos enviados por hóspedes ou vinculados a reserva de hóspede)
  const isSystemOrPartner =
    fromLower.includes("b2breservas") ||
    fromLower.includes("promenade.com.br") ||
    fromLower.includes("pfbestacionamentos") ||
    fromLower.includes("mailer-daemon") ||
    fromLower.includes("zohocorp.com") ||
    fromLower.includes("zoho.com") ||
    fromLower.includes("v4company.com") ||
    fromLower.includes("gruposenses.com.br") ||
    fromLower.includes("agendor.com.br") ||
    fromLower.includes("stone.com.br");

  const isPersonalGuestDomain =
    fromLower.includes("@gmail.com") ||
    fromLower.includes("@hotmail.com") ||
    fromLower.includes("@icloud.com") ||
    fromLower.includes("@outlook.com") ||
    fromLower.includes("@yahoo.com") ||
    fromLower.includes("@live.com") ||
    fromLower.includes("@uol.com.br") ||
    fromLower.includes("@terra.com.br");

  if (!isSystemOrPartner && !isAccessCode && (matchedReservation || isPersonalGuestDomain)) {
    set.add("lbl_hospede");
  }

  return Array.from(set);
}

/**
 * Extrai o timestamp UTC real de uma mensagem da Zoho Mail API.
 * O campo sentDateInGMT da Zoho (.com / California PDT) retorna deslocado +7h no futuro,
 * enquanto receivedTime e os 13 primeiros dígitos do messageId representam o epoch UTC real em ms.
 */
export function resolveZohoTrueIsoDate(zm = {}) {
  const receivedMs = Number(zm.receivedTime || zm.receivedTimeMs || 0);
  if (receivedMs > 1500000000000 && receivedMs < 2500000000000) {
    return new Date(receivedMs).toISOString();
  }

  const rawMsgId = String(zm.zohoMessageId || zm.messageId || zm.id || "").replace(/^zoho_/, "").trim();
  if (/^\d{13,}/.test(rawMsgId)) {
    const idEpochMs = Number(rawMsgId.slice(0, 13));
    if (idEpochMs > 1500000000000 && idEpochMs < 2500000000000) {
      return new Date(idEpochMs).toISOString();
    }
  }

  const sentGmtMs = Number(zm.sentDateInGMT || 0);
  if (sentGmtMs > 1500000000000) {
    const correctedMs = sentGmtMs > Date.now() + 15 * 60 * 1000 ? sentGmtMs - 7 * 3600 * 1000 : sentGmtMs;
    return new Date(correctedMs).toISOString();
  }

  return zm.created_at || new Date().toISOString();
}

/**
 * Sincroniza mensagens da Zoho Mail API para o cache local quando OAuth2 está ativo
 */
export async function syncZohoMessagesToCache(db, { folder = "inbox", search = "", limit = 50, incremental = false, saveDatabase = null } = {}) {
  ensureWebmailCollections(db);
  const oauthCfg = getZohoOAuthConfig(db);
  if (!oauthCfg.isConfigured) {
    return { ok: false, synced: 0, mode: "local_smtp" };
  }

  try {
    const zohoFolderMap = await resolveZohoFolders(db);
    let rawZohoMessages = [];
    const lastFolderSyncMs = zohoTokenCache.lastFolderSyncAt?.[folder] || 0;
    const canUseIncrementalWindow =
      !search &&
      (incremental || (db.zohoMessagesCache.length > 0 && Date.now() - lastFolderSyncMs < 15 * 60 * 1000));
    const effectiveLimit = canUseIncrementalWindow ? Math.min(Number(limit) || 50, 25) : (Number(limit) || 50);

    if (search) {
      const endpoint = `/accounts/{accountId}/messages/search?searchKey=entire:${encodeURIComponent(search)}&limit=${limit}`;
      const msgRes = await callZohoMailApi(db, endpoint);
      if (msgRes.ok && Array.isArray(msgRes.data)) {
        rawZohoMessages.push(...msgRes.data);
      }
    } else if (folder === "inbox" || folder === "newsletters" || folder === "starred" || folder === "archive") {
      // Sincroniza em paralelo TODAS as caixas de entrada do Zoho (Inbox principal + Notification + Newsletter)
      const targetFolders = zohoFolderMap.inboxFolderIds.length > 0
        ? zohoFolderMap.inboxFolderIds.slice(0, 6)
        : (zohoFolderMap.inbox ? [zohoFolderMap.inbox] : [null]);

      const requests = targetFolders.map(fId => {
        const qp = new URLSearchParams({ limit: String(effectiveLimit), includeto: "true" });
        if (fId) qp.set("folderId", String(fId));
        return callZohoMailApi(db, `/accounts/{accountId}/messages/view?${qp.toString()}`);
      });

      const results = await Promise.allSettled(requests);
      for (const r of results) {
        if (r.status === "fulfilled" && r.value?.ok && Array.isArray(r.value.data)) {
          rawZohoMessages.push(...r.value.data);
        }
      }
    } else {
      const qp = new URLSearchParams({ limit: String(effectiveLimit), includeto: "true" });
      if (zohoFolderMap[folder]) {
        qp.set("folderId", String(zohoFolderMap[folder]));
      }
      const msgRes = await callZohoMailApi(db, `/accounts/{accountId}/messages/view?${qp.toString()}`);
      if (msgRes.ok && Array.isArray(msgRes.data)) {
        rawZohoMessages.push(...msgRes.data);
      }
    }

    let addedOrUpdated = 0;
    let b2bCancelProcessedMutated = false;
    const nowSyncMs = Date.now();
    const MAX_AUTONOMOUS_CANCEL_AGE_MS = 24 * 60 * 60 * 1000; // 24 horas (evita disparar alertas retroativos de e-mails antigos)

    for (const zm of rawZohoMessages) {
      if (!zm || !zm.messageId) continue;
      const zId = `zoho_${zm.messageId}`;
      const existingIdx = db.zohoMessagesCache.findIndex(m => m.id === zId);
      const existingMsg = existingIdx >= 0 ? db.zohoMessagesCache[existingIdx] : null;
      const isoDate = resolveZohoTrueIsoDate(zm);

      const resolvedFolder = classifyZohoMessageFolder(zm, zohoFolderMap, folder);
      const resolvedDirection = resolvedFolder === "sent" ? "outbound" : (resolvedFolder === "drafts" ? "draft" : "inbound");
      const cleanFromName = decodeZohoEntities(zm.sender || zm.fromAddress || "Remetente");
      const cleanFromEmail = cleanAddressField(zm.fromAddress || zm.sender || "");
      const cleanRecipient = cleanAddressField(zm.toAddress || "");
      const cleanCc = cleanAddressField(zm.ccAddress || "");
      const cleanReplyTo = cleanAddressField(zm.replyTo || zm.replyToAddress || "");
      const cleanSubject = decodeZohoEntities(zm.subject || "(Sem assunto)");
      const cleanSnippet = decodeZohoEntities(zm.summary || "");

      const mapped = {
        id: zId,
        zohoMessageId: String(zm.messageId),
        zohoFolderId: String(zm.folderId || zohoFolderMap[resolvedFolder] || ""),
        zohoFolderName: zohoFolderMap.folderNameById?.[String(zm.folderId || "")] || "",
        threadId: zm.threadId ? `zthread_${zm.threadId}` : undefined,
        folder: resolvedFolder,
        direction: resolvedDirection,
        fromName: cleanFromName,
        fromEmail: cleanFromEmail,
        recipient: cleanRecipient,
        cc: cleanCc,
        replyTo: cleanReplyTo,
        subject: cleanSubject,
        snippet: cleanSnippet,
        bodyHtml: existingMsg ? existingMsg.bodyHtml : "",
        attachments: existingMsg && Array.isArray(existingMsg.attachments) ? existingMsg.attachments : [],
        isRead: String(zm.status) === "1" || Boolean(zm.isRead),
        isStarred: Boolean(zm.flagid && zm.flagid !== "flag_not_set"),
        hasAttachments: Boolean(zm.hasAttachment === "1" || zm.hasAttachment === true),
        receivedTimeMs: Number(zm.receivedTime || 0) || undefined,
        b2bCancelProcessed: Boolean(existingMsg?.b2bCancelProcessed || existingMsg?.b2bCancelled),
        b2bCancelled: Boolean(existingMsg?.b2bCancelled),
        created_at: isoDate,
        source: "zoho_api"
      };
      const subjResMatch =
        String(mapped.subject || "").match(/Confirma[cç][aã]o\s+(?:d[ae]\s+)?(?:Reserva\s*)?[\s:\-#]*(\d{7,10})/i) ||
        String(mapped.subject || "").match(/Reserva(?:\s+B2B)?\s*[\s:\-#]+(\d{7,10})/i) ||
        String(mapped.subject || "").match(/\b(25\d{6})\b/);
      const subjResNum = subjResMatch ? String(subjResMatch[1] || "").trim() : "";
      const isB2bConfirmationEmail =
        mapped.direction === "inbound" &&
        (String(mapped.fromEmail || "").toLowerCase().includes("b2breservas") ||
          Boolean(subjResNum) ||
          /\b(?:b2b\s*reservas|ordem\s+de\s+hospedagem|conf_reserva\.php)\b/i.test(`${mapped.subject || ""} ${mapped.snippet || ""}`));

      const hasCompleteB2bReservation =
        subjResNum &&
        (db.reservations || []).some(
          r =>
            r &&
            r.status !== "cancelada" &&
            (String(r.b2bReservationNumber || "") === subjResNum ||
              String(r.externalReservationNumber || "") === subjResNum) &&
            Boolean(
              r.guestName &&
              r.checkinDate &&
              r.agencyName &&
              r.agencyCnpj &&
              r.agencyAgentEmail &&
              r.companyName &&
              r.companyCnpj &&
              Array.isArray(r.nfDeliveryEmails) &&
              r.nfDeliveryEmails.length > 0 &&
              (String(r.agencyName || "").trim().toUpperCase() !== String(r.companyName || "").trim().toUpperCase() ||
                String(r.agencyTradeName || "").trim().toUpperCase() !== String(r.companyName || "").trim().toUpperCase()) &&
              !String(r.companyName || "").includes("HOTEL CORPFLATS") &&
              Number(r.dailyRate) > 0 &&
              Number(r.dailyRate) < 10000
            )
        );

      const extractAttList = (attRes) => {
        if (!attRes || !attRes.ok) return [];
        if (Array.isArray(attRes.data?.attachments)) return attRes.data.attachments;
        if (Array.isArray(attRes.data)) return attRes.data;
        if (Array.isArray(attRes.raw?.data?.attachments)) return attRes.raw.data.attachments;
        if (Array.isArray(attRes.raw?.data)) return attRes.raw.data;
        return [];
      };

      const fromLower = String(mapped.fromEmail || "").toLowerCase();
      const folderNameLower = String(mapped.zohoFolderName || "").toLowerCase();
      const isNonB2bSystemOrMarketing =
        resolvedFolder !== "inbox" ||
        /newsletter|marketing|spam|trash|lixeira|sent|enviado/i.test(folderNameLower) ||
        fromLower.includes("corpflats.com.br") ||
        fromLower.includes("@booking.com") ||
        fromLower.includes("@airbnb.com") ||
        fromLower.includes("@expedia.com") ||
        fromLower.includes("@decolar.com") ||
        fromLower.includes("@channex.io");

      const messagePreview = {
        subject: mapped.subject,
        text: mapped.snippet,
        from: mapped.fromEmail
      };
      const previewIntent = detectB2bEmailIntent(messagePreview);
      const cancelSig = buildZohoB2bCancelSignature(mapped.subject, mapped.fromEmail);
      const alreadyCancelEvaluated =
        mapped.b2bCancelProcessed ||
        hasProcessedZohoB2bCancelKey(db, [zId, cancelSig]);

      const isB2bCancellationCandidate =
        mapped.direction === "inbound" &&
        !isNonB2bSystemOrMarketing &&
        (previewIntent.isCancellation || /cancel/i.test(mapped.subject || ""));

      if (isB2bCancellationCandidate && !alreadyCancelEvaluated) {
        const msgTimeMs = Number(mapped.receivedTimeMs) || new Date(isoDate || 0).getTime() || 0;
        const isStaleHistoricalEmail = msgTimeMs > 0 && (nowSyncMs - msgTimeMs) > MAX_AUTONOMOUS_CANCEL_AGE_MS;

        // E-mails históricos (> 24h) são apenas carimbados como já avaliados sem disparar cancelamento retroativo nem spam WhatsApp
        if (isStaleHistoricalEmail) {
          mapped.b2bCancelProcessed = true;
          markProcessedZohoB2bCancelKey(db, [zId, cancelSig]);
          b2bCancelProcessedMutated = true;
        } else {
          try {
            let fetchedHtml = mapped.bodyHtml || "";
            if (!fetchedHtml && mapped.zohoMessageId && mapped.zohoFolderId) {
              try {
                const contentRes = await callZohoMailApi(
                  db,
                  `/accounts/{accountId}/folders/${mapped.zohoFolderId}/messages/${mapped.zohoMessageId}/content`
                );
                if (contentRes.ok && contentRes.data?.content) {
                  fetchedHtml = contentRes.data.content;
                  mapped.bodyHtml = fetchedHtml;
                }
              } catch {}
            }

            let attachmentPdfText = "";
            if (mapped.hasAttachments && mapped.zohoMessageId && mapped.zohoFolderId) {
              try {
                const attRes = await callZohoMailApi(
                  db,
                  `/accounts/{accountId}/folders/${mapped.zohoFolderId}/messages/${mapped.zohoMessageId}/attachmentinfo`
                );
                const rawAtts = extractAttList(attRes);
                if (rawAtts.length > 0) {
                  mapped.attachments = rawAtts.map(a => ({
                    id: a.attachmentId || a.id,
                    filename: a.attachmentName || a.filename || "anexo.pdf",
                    size: a.attachmentSize || a.size || 0,
                    contentType: a.contentType || "application/octet-stream",
                    downloadUrl: `/api/webmail/attachments/${mapped.zohoFolderId}/${mapped.zohoMessageId}/${a.attachmentId || a.id}?name=${encodeURIComponent(a.attachmentName || a.filename || "anexo")}`
                  }));
                  for (const att of rawAtts) {
                    const attId = att?.attachmentId || att?.id;
                    const fname = String(att?.attachmentName || att?.filename || "");
                    const mime = String(att?.contentType || "");
                    if (attId && (fname.toLowerCase().endsWith(".pdf") || mime.toLowerCase() === "application/pdf")) {
                      try {
                        const fileRes = await callZohoMailApi(
                          db,
                          `/accounts/{accountId}/folders/${mapped.zohoFolderId}/messages/${mapped.zohoMessageId}/attachments/${attId}`,
                          { responseType: "buffer" }
                        );
                        if (fileRes.ok && Buffer.isBuffer(fileRes.data)) {
                          const pdfText = extractTextFromPdfBuffer(fileRes.data);
                          if (pdfText) attachmentPdfText += `\n${pdfText}`;
                        }
                      } catch {}
                    }
                  }
                }
              } catch {}
            }

            const combinedText = [mapped.snippet || "", attachmentPdfText].filter(Boolean).join("\n");
            const emailCancelData = {
              id: zId,
              zohoMessageId: mapped.zohoMessageId,
              subject: mapped.subject,
              text: combinedText,
              html: fetchedHtml,
              from: mapped.fromEmail
            };

            // Marca imediatamente como processado ANTES do disparo para impedir reprocessamento em loops/syncs concorrentes
            mapped.b2bCancelProcessed = true;
            markProcessedZohoB2bCancelKey(db, [zId, cancelSig]);
            b2bCancelProcessedMutated = true;

            const fullIntent = detectB2bEmailIntent(emailCancelData);
            if (fullIntent.isCancellation) {
              const preMatch = matchReservationForCancellation(db, emailCancelData);
              const isExplicitB2bSender = fromLower.includes("b2breservas");
              // Na sincronização passiva de caixa de entrada, só executa se casar com reserva do PMS ou vier do portal B2B Reservas
              if (preMatch.matched || preMatch.candidatesCount > 0 || isExplicitB2bSender) {
                const cancelRes = await executeAutonomousB2bCancellation(db, emailCancelData, {
                  saveDatabase
                });
                if (cancelRes.cancelled) {
                  addedOrUpdated++;
                }
                mapped.b2bParsed = true;
                mapped.b2bCancelled = Boolean(cancelRes.cancelled);
              }
            }
          } catch (cancelErr) {
            console.warn("[B2B Sync Cancel] Erro ao processar cancelamento:", cancelErr?.message || cancelErr);
          }
        }
      }

      const needsB2bParse =
        !mapped.b2bCancelled &&
        isB2bConfirmationEmail &&
        (!existingMsg?.b2bParsed || (subjResNum && !hasCompleteB2bReservation));

      if (needsB2bParse) {
        try {
          let fetchedHtml = mapped.bodyHtml || "";
          let contentFetchFailed = false;
          if (!fetchedHtml && mapped.zohoMessageId && mapped.zohoFolderId) {
            try {
              const contentRes = await callZohoMailApi(
                db,
                `/accounts/{accountId}/folders/${mapped.zohoFolderId}/messages/${mapped.zohoMessageId}/content`
              );
              if (contentRes.ok && contentRes.data?.content) {
                fetchedHtml = contentRes.data.content;
                mapped.bodyHtml = fetchedHtml;
              } else {
                contentFetchFailed = true;
              }
            } catch {
              contentFetchFailed = true;
            }
          }

          let attachmentPdfText = "";
          const attachmentPdfBuffers = [];
          let attFetchFailed = false;
          if (mapped.hasAttachments && mapped.zohoMessageId && mapped.zohoFolderId) {
            try {
              const attRes = await callZohoMailApi(
                db,
                `/accounts/{accountId}/folders/${mapped.zohoFolderId}/messages/${mapped.zohoMessageId}/attachmentinfo`
              );
              const rawAtts = extractAttList(attRes);
              if (!attRes.ok) attFetchFailed = true;
              if (rawAtts.length > 0) {
                mapped.attachments = rawAtts.map(a => ({
                  id: a.attachmentId || a.id,
                  filename: a.attachmentName || a.filename || "anexo.pdf",
                  size: a.attachmentSize || a.size || 0,
                  contentType: a.contentType || "application/octet-stream",
                  downloadUrl: `/api/webmail/attachments/${mapped.zohoFolderId}/${mapped.zohoMessageId}/${a.attachmentId || a.id}?name=${encodeURIComponent(a.attachmentName || a.filename || "anexo")}`
                }));
                for (const att of rawAtts) {
                  const attId = att?.attachmentId || att?.id;
                  const fname = String(att?.attachmentName || att?.filename || "");
                  const mime = String(att?.contentType || "");
                  if (attId && (fname.toLowerCase().endsWith(".pdf") || mime.toLowerCase() === "application/pdf")) {
                    try {
                      const fileRes = await callZohoMailApi(
                        db,
                        `/accounts/{accountId}/folders/${mapped.zohoFolderId}/messages/${mapped.zohoMessageId}/attachments/${attId}`,
                        { responseType: "buffer" }
                      );
                      if (fileRes.ok && Buffer.isBuffer(fileRes.data)) {
                        attachmentPdfBuffers.push(fileRes.data);
                        const pdfText = extractTextFromPdfBuffer(fileRes.data);
                        if (pdfText) attachmentPdfText += `\n${pdfText}`;
                      } else {
                        attFetchFailed = true;
                      }
                    } catch {
                      attFetchFailed = true;
                    }
                  }
                }
              }
            } catch {
              attFetchFailed = true;
            }
          }

          const combinedRawText = [mapped.snippet || "", attachmentPdfText].filter(Boolean).join("\n");
          const parsedB2b = await fetchAndParseB2bVoucher({
            rawText: combinedRawText,
            htmlText: fetchedHtml || "",
            subject: mapped.subject || "",
            fromEmail: mapped.fromEmail || "",
            cc: mapped.cc || "",
            replyTo: mapped.replyTo || "",
            pdfBuffers: attachmentPdfBuffers,
            db
          });
          if (parsedB2b.b2bReservationNumber && parsedB2b.guestName && parsedB2b.checkinDate) {
            const ingestRes = ingestB2bVoucherIntoDb(db, parsedB2b, {
              saveDatabase,
              autoSendCredentialEmail: false
            });
            if (ingestRes?.ok) {
              await enrichB2bIngestedEntitiesCnpj(db, { ...ingestRes, saveDatabase });
              addedOrUpdated++;
            }
          }
          const gotCompleteAgency = Boolean(
            parsedB2b.agencyName &&
            parsedB2b.agencyAgentName &&
            (parsedB2b.agencyAgentEmail || parsedB2b.agencyAgentPhone)
          );
          if ((!contentFetchFailed && !attFetchFailed) || gotCompleteAgency) {
            mapped.b2bParsed = true;
          }
        } catch (b2bErr) {
          console.warn("[B2B Sync Parse] Aviso ao processar voucher B2B:", b2bErr?.message || b2bErr);
        }
      } else if (existingMsg?.b2bParsed) {
        mapped.b2bParsed = true;
      }

      const isPotentialInboundBounce =
        !existingMsg?.guestBounceProcessed &&
        mapped.direction === "inbound" &&
        isLikelyInboundBounceEnvelope(mapped);

      if (isPotentialInboundBounce && !mapped.bodyHtml && mapped.zohoMessageId && mapped.zohoFolderId) {
        try {
          const bounceContentRes = await callZohoMailApi(
            db,
            `/accounts/{accountId}/folders/${mapped.zohoFolderId}/messages/${mapped.zohoMessageId}/content`
          );
          if (bounceContentRes.ok && bounceContentRes.data?.content) {
            mapped.bodyHtml = bounceContentRes.data.content;
          }
        } catch {
          // Segue com snippet caso o endpoint de conteúdo oscile
        }
      }

      const matchedRes = matchEmailWithReservation(db, mapped);
      mapped.labels = inferZohoSmartLabels(
        mapped,
        existingMsg ? existingMsg.labels : [],
        matchedRes
      );

      if (!existingMsg?.guestBounceProcessed && mapped.direction === "inbound") {
        const bounceHandled = await processInboundBounceForGuestEmail(db, saveDatabase, mapped, matchedRes);
        if (bounceHandled?.isBounce) {
          mapped.guestBounceProcessed = true;
        }
      } else if (existingMsg?.guestBounceProcessed) {
        mapped.guestBounceProcessed = true;
      }

      if (existingIdx >= 0) {
        const changed =
          existingMsg.isRead !== mapped.isRead ||
          existingMsg.isStarred !== mapped.isStarred ||
          existingMsg.folder !== mapped.folder ||
          (!existingMsg.b2bParsed && mapped.b2bParsed) ||
          (!existingMsg.b2bCancelProcessed && mapped.b2bCancelProcessed) ||
          (!existingMsg.guestBounceProcessed && mapped.guestBounceProcessed);
        db.zohoMessagesCache[existingIdx] = { ...existingMsg, ...mapped };
        if (changed) addedOrUpdated++;
      } else {
        db.zohoMessagesCache.unshift(mapped);
        addedOrUpdated++;
      }
    }

    reconcileFalsePositiveEmailAlerts(db, saveDatabase);

    if (b2bCancelProcessedMutated && typeof saveDatabase === "function") {
      saveDatabase("zoho_b2b_cancel_processed");
    }

    zohoTokenCache.lastFolderSyncAt[folder] = Date.now();
    zohoTokenCache.lastSyncAt = new Date().toISOString();
    return { ok: true, synced: addedOrUpdated, mode: "zoho_api" };
  } catch (err) {
    return { ok: false, error: err.message, mode: "hybrid_fallback" };
  }
}

function isLikelyInboundBounceEnvelope(msgItem = {}) {
  const fromLower = String(msgItem.fromEmail || msgItem.from || "").toLowerCase();
  const subjLower = String(msgItem.subject || "").toLowerCase();
  if (/dmarc|tlsrpt|aggregate\s+report|report\s+domain|automatic\s+reply|out\s+of\s+office|respostas?\s+autom[aá]ticas?/i.test(`${fromLower} ${subjLower}`)) {
    return false;
  }
  return (
    fromLower.includes("mailer-daemon") ||
    fromLower.includes("mail delivery") ||
    (fromLower.includes("postmaster") && /undeliver|delivery|failure|failed|returned|falha|entreg/i.test(subjLower)) ||
    subjLower.includes("undelivered") ||
    subjLower.includes("undeliverable") ||
    subjLower.includes("delivery status notification") ||
    subjLower.includes("delivery failure") ||
    subjLower.includes("mail delivery failed") ||
    subjLower.includes("returned mail") ||
    subjLower.includes("falha na entrega") ||
    subjLower.includes("não foi possível entregar") ||
    subjLower.includes("nao foi possivel entregar")
  );
}

/**
 * Detecta mensagens de devolução permanente (hard bounce / mailer-daemon / Undelivered Mail) recentes,
 * exige que o endereço de e-mail do hóspede esteja explicitamente citado no corpo da falha (sem suposição por horário/reserva),
 * marca a comunicação original como "bounced" e avisa o hóspede no WhatsApp para corrigir o e-mail.
 */
export async function processInboundBounceForGuestEmail(db, saveDatabase, msgItem = {}, matchedResSummary = null) {
  try {
    if (!db || !msgItem) return { isBounce: false };
    if (!isLikelyInboundBounceEnvelope(msgItem)) {
      return { isBounce: false };
    }

    const msgMs = new Date(msgItem.created_at || msgItem.date || Date.now()).getTime();
    const nowMs = Date.now();
    if (!msgMs || Number.isNaN(msgMs) || nowMs - msgMs > 48 * 3600 * 1000) {
      return { isBounce: true, ignoredReason: "bounce_older_than_48h" };
    }

    const rawBodyPlain = String(msgItem.bodyHtml || "")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    const combinedText = `${msgItem.subject || ""}\n${msgItem.snippet || ""}\n${msgItem.bodyText || ""}\n${rawBodyPlain}`;

    // Ignora relatórios DMARC/TLS e DSNs meramente informativos ou de atraso temporário (Delay / Greylisting / Relay / Delivered)
    const isNonFailureDsn =
      /delivery\s+status\s+notification\s*\(\s*(?:delay|relay|success)\s*\)/i.test(combinedText) ||
      /action\s*:\s*(?:delayed|relayed|delivered|expanded)\b/i.test(combinedText) ||
      /(?:delivery\s+is\s+delayed|will\s+continue\s+trying|keep\s+trying\s+to\s+deliver|warning:\s+message\s+delayed)/i.test(combinedText);

    const hasPermanentFailureSignal =
      /action\s*:\s*failed\b/i.test(combinedText) ||
      /\b(?:55[0-4]|51[0-3]|5\.[1247]\.\d+)\b/i.test(combinedText) ||
      /(?:undelivered|undeliverable|delivery\s+failed|delivery\s+failure|mail\s+delivery\s+failed|returned\s+mail|permanent\s+error|permanently\s+failed|user\s+unknown|no\s+such\s+user|recipient\s+address\s+rejected|mailbox\s+unavailable|does\s+not\s+exist|domain\s+not\s+found|unrouteable|invalid\s+recipient|falha\s+na\s+entrega|n[aã]o\s+foi\s+poss[ií]vel\s+entregar)/i.test(
        combinedText
      );

    if (isNonFailureDsn && !/action\s*:\s*failed\b/i.test(combinedText)) {
      return { isBounce: true, ignoredReason: "non_permanent_delay_or_relay_dsn" };
    }
    if (!hasPermanentFailureSignal) {
      return { isBounce: true, ignoredReason: "missing_permanent_failure_signal" };
    }

    const ownEmailLower = String(getSmtpConfig(db)?.fromEmail || "contato@corpflats.com.br").trim().toLowerCase();
    const senderLower = String(msgItem.fromEmail || msgItem.from || "").replace(/.*<([^>]+)>.*/, "$1").trim().toLowerCase();
    const extractedEmails = new Set();
    const emailMatches = combinedText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi) || [];
    for (const rawEm of emailMatches) {
      const em = String(rawEm).trim().toLowerCase().replace(/[.,;:!?)]+$/g, "");
      if (!em || em === ownEmailLower || em === senderLower) continue;
      if (
        em.includes("mailer-daemon") ||
        em.includes("postmaster") ||
        em.includes("noreply") ||
        em.includes("no-reply") ||
        em.includes("corpflats.com.br") ||
        em.includes("zoho.com") ||
        em.includes("zohomail.com")
      ) {
        continue;
      }
      if (isInternalOrThirdPartyOperationalEmail(em, null, db)) continue;
      extractedEmails.add(em);
    }

    // NUNCA adivinha nem assume o e-mail do hóspede da reserva se o endereço não constar explicitamente na mensagem de erro
    if (extractedEmails.size === 0) {
      return { isBounce: true, ignoredReason: "no_explicit_bounced_email_in_message" };
    }

    const reservations = Array.isArray(db.reservations) ? db.reservations : [];
    const comms = Array.isArray(db.reservationCommunications) ? db.reservationCommunications : [];
    let targetRes = null;
    let bouncedEmail = "";
    let matchedGuestIdx = 1;

    const reservationMatchesCandidate = (r, candidateEmail) => {
      if (!r || r.status === "cancelada" || r.status === "cancelled") return false;
      if (String(r.guestEmail || "").trim().toLowerCase() === candidateEmail) return true;
      if (Array.isArray(r.guests) && r.guests.some(g => String(g?.email || "").trim().toLowerCase() === candidateEmail)) return true;
      return false;
    };

    const hasRecentOutboundToEmail = (r, candidateEmail) => {
      if (comms.length === 0) return true;
      const rCodeUpper = String(r.code || "").trim().toUpperCase();
      const rIdStr = r.id != null ? String(r.id) : "";
      return comms.some(c => {
        if (!c || c.direction === "inbound") return false;
        if (String(c.recipient || "").trim().toLowerCase() !== candidateEmail) return false;
        const cResUpper = String(c.reservation_id || "").trim().toUpperCase();
        const sameRes = !cResUpper || cResUpper === "0" || (rCodeUpper && cResUpper === rCodeUpper) || (rIdStr && String(c.reservation_id) === rIdStr);
        if (!sameRes) return false;
        const cMs = new Date(c.created_at || c.createdAt || c.metadata?.sentAt || 0).getTime();
        return !cMs || nowMs - cMs <= 72 * 3600 * 1000;
      });
    };

    for (const candidateEmail of extractedEmails) {
      const matchingResList = reservations.filter(r => reservationMatchesCandidate(r, candidateEmail));
      if (matchingResList.length === 0) continue;

      const preferredFromSummary = matchedResSummary
        ? matchingResList.find(r => r.id === matchedResSummary.id || (r.code && r.code === matchedResSummary.code))
        : null;

      const chosen =
        (preferredFromSummary && hasRecentOutboundToEmail(preferredFromSummary, candidateEmail) ? preferredFromSummary : null) ||
        matchingResList.find(r => hasRecentOutboundToEmail(r, candidateEmail)) ||
        null;

      if (chosen) {
        targetRes = chosen;
        bouncedEmail = candidateEmail;
        if (Array.isArray(chosen.guests)) {
          const idx = chosen.guests.findIndex(g => String(g?.email || "").trim().toLowerCase() === candidateEmail);
          if (idx >= 0) matchedGuestIdx = Number(chosen.guests[idx]?.index) || idx + 1;
        }
        break;
      }
    }

    if (!targetRes || !bouncedEmail || isInternalOrThirdPartyOperationalEmail(bouncedEmail, targetRes, db)) {
      return { isBounce: true, ignoredReason: "no_matching_guest_reservation" };
    }

    const nowIso = new Date().toISOString();
    const resCodeUpper = String(targetRes.code || "").trim().toUpperCase();
    const resIdStr = targetRes.id != null ? String(targetRes.id) : "";

    if (Array.isArray(db.reservationCommunications)) {
      for (const c of db.reservationCommunications) {
        if (!c || c.direction === "inbound") continue;
        const cResUpper = String(c.reservation_id || "").trim().toUpperCase();
        const sameRes = (resCodeUpper && cResUpper === resCodeUpper) || (resIdStr && String(c.reservation_id) === resIdStr);
        if (!sameRes) continue;
        if (String(c.recipient || "").trim().toLowerCase() === bouncedEmail && (c.status === "sent" || c.status === "pending")) {
          c.status = "bounced";
          c.metadata = {
            ...(c.metadata || {}),
            bouncedAt: nowIso,
            bounceSubject: msgItem.subject || "Undelivered Mail"
          };
        }
      }
    }

    const notifyResult = await notifyGuestInvalidEmailViaWhatsApp({
      db,
      saveDatabase,
      reservation: targetRes,
      guestIndex: matchedGuestIdx,
      invalidEmail: bouncedEmail,
      reason: `E-mail devolvido pelo servidor de destino (${msgItem.subject || "Bounce"})`,
      source: "zoho_bounce"
    });

    return { isBounce: true, notified: notifyResult?.notified || false, bouncedEmail, reservationCode: targetRes.code };
  } catch (err) {
    console.warn("[Zoho Bounce Handler] Aviso ao processar devolução de e-mail:", err?.message || err);
    return { isBounce: false, error: err?.message };
  }
}

/**
 * Constrói a lista unificada de mensagens do Webmail (Zoho Cache + Inbound + Comunicações Enviadas + Fila + Rascunhos)
 */
export function buildUnifiedMessagesList(db) {
  ensureWebmailCollections(db);
  const smtpCfg = getSmtpConfig(db);
  const defaultFromName = smtpCfg.fromName || "CorpFlats";
  const defaultFromEmail = smtpCfg.fromEmail || smtpCfg.user || "reservas@corpflats.com.br";
  const stateMeta = db.emailStateMeta || {};
  const folderMap = zohoTokenCache.folderMapCache;
  const hasRealZohoMessages = Array.isArray(db.zohoMessagesCache) && db.zohoMessagesCache.length > 0;

  const unified = [];
  const seenIds = new Set();

  // Pré-indexa os envios locais do motor CorpFlats para evitar duplicar o mesmo e-mail enviado via SMTP na pasta Enviados
  const engineSentSignatures = (db.reservationCommunications || [])
    .filter(c => c && c.type === "email" && c.direction !== "inbound")
    .map(c => ({
      subj: normalizeThreadSubject(c.subject || ""),
      recip: String(c.recipient || "").toLowerCase(),
      timeMs: new Date(c.created_at || 0).getTime()
    }));

  // 1. Mensagens da Zoho REST API cacheadas (com normalização de timestamp UTC real, pasta e entidades HTML)
  for (const zm of db.zohoMessagesCache || []) {
    if (seenIds.has(zm.id)) continue;
    const meta = stateMeta[zm.id] || {};
    if (meta.deletedForever) continue;

    const naturalFolder = classifyZohoMessageFolder(zm, folderMap, zm.folder || "inbox");
    const naturalDirection = naturalFolder === "sent" ? "outbound" : (naturalFolder === "drafts" ? "draft" : "inbound");
    const correctedIsoDate = resolveZohoTrueIsoDate(zm);

    zm.folder = naturalFolder;
    zm.direction = naturalDirection;
    zm.created_at = correctedIsoDate;
    zm.fromName = decodeZohoEntities(zm.fromName || zm.fromEmail || "Remetente");
    zm.fromEmail = cleanAddressField(zm.fromEmail || "");
    zm.recipient = cleanAddressField(zm.recipient || "");
    zm.cc = cleanAddressField(zm.cc || "");
    zm.subject = decodeZohoEntities(zm.subject || "(Sem assunto)");
    zm.snippet = decodeZohoEntities(zm.snippet || "");

    // Se for uma cópia na pasta Sent do Zoho de um disparo já registrado no motor local CorpFlats nos últimos 5 min, evita duplicar na lista
    if (naturalFolder === "sent") {
      const zSubj = normalizeThreadSubject(zm.subject);
      const zRecip = String(zm.recipient || "").toLowerCase();
      const zTimeMs = new Date(correctedIsoDate).getTime();
      const isDuplicateOfEngine = engineSentSignatures.some(sig =>
        sig.subj === zSubj &&
        (sig.recip.includes(zRecip) || zRecip.includes(sig.recip)) &&
        Math.abs(sig.timeMs - zTimeMs) < 5 * 60 * 1000
      );
      if (isDuplicateOfEngine) continue;
    }

    seenIds.add(zm.id);

    const item = {
      ...zm,
      folder: meta.folder || naturalFolder,
      direction: naturalDirection,
      created_at: correctedIsoDate,
      isRead: meta.isRead !== undefined ? meta.isRead : zm.isRead !== false,
      isStarred: meta.isStarred !== undefined ? meta.isStarred : Boolean(zm.isStarred),
      status: zm.status || (naturalDirection === "outbound" ? "sent" : "received")
    };
    item.matchedReservation = matchEmailWithReservation(db, item);
    item.labels = inferZohoSmartLabels(
      item,
      Array.isArray(meta.labels) ? meta.labels : (Array.isArray(zm.labels) ? zm.labels : []),
      item.matchedReservation
    );
    unified.push(item);
  }

  // 2. Mensagens recebidas locais / Webhooks (db.webmailInboundMessages)
  for (const inb of db.webmailInboundMessages || []) {
    // Oculta as 3 mensagens de demonstração iniciais assim que a conta real da Zoho Mail API estiver populada
    if (hasRealZohoMessages && DEMO_SEED_IDS.has(inb.id)) continue;
    if (seenIds.has(inb.id)) continue;
    seenIds.add(inb.id);
    const meta = stateMeta[inb.id] || {};
    if (meta.deletedForever) continue;

    const item = {
      ...inb,
      folder: meta.folder || inb.folder || "inbox",
      direction: "inbound",
      isRead: meta.isRead !== undefined ? meta.isRead : Boolean(inb.isRead),
      isStarred: meta.isStarred !== undefined ? meta.isStarred : Boolean(inb.isStarred),
      hasAttachments: Boolean((inb.attachments && inb.attachments.length > 0) || inb.hasAttachments),
      status: "received",
      source: inb.source || "local_inbound"
    };
    item.matchedReservation = matchEmailWithReservation(db, item);
    item.labels = inferZohoSmartLabels(
      item,
      Array.isArray(meta.labels) ? meta.labels : (Array.isArray(inb.labels) ? inb.labels : []),
      item.matchedReservation
    );
    unified.push(item);
  }

  // 3. Histórico de Comunicações e Disparos do Sistema (db.reservationCommunications)
  for (const comm of db.reservationCommunications || []) {
    if (!comm || comm.type !== "email") continue;
    const id = comm.id;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const meta = stateMeta[id] || {};
    if (meta.deletedForever) continue;

    const isFailedOrPending = comm.status === "failed" || comm.status === "pending";
    const isInboundComm = comm.direction === "inbound";
    const defaultFolder = isFailedOrPending ? "outbox" : (isInboundComm ? "inbox" : "sent");

    const item = {
      id,
      communicationId: id,
      threadId: comm.threadId || undefined,
      folder: meta.folder || defaultFolder,
      direction: comm.direction || "outbound",
      fromName: isInboundComm ? (comm.fromName || comm.recipient) : defaultFromName,
      fromEmail: isInboundComm ? (comm.fromEmail || comm.recipient) : defaultFromEmail,
      recipient: comm.recipient || "",
      cc: comm.cc || comm.metadata?.cc || "",
      bcc: comm.bcc || comm.metadata?.bcc || "",
      subject: comm.subject || "(Sem assunto)",
      snippet: extractTextSnippet(comm.body || comm.subject),
      bodyHtml: comm.body || "",
      bodyText: extractTextSnippet(comm.body || "", 2000),
      isRead: meta.isRead !== undefined ? meta.isRead : true,
      isStarred: meta.isStarred !== undefined ? meta.isStarred : false,
      labels: [],
      status: comm.status || "sent",
      reservation_id: comm.reservation_id,
      metadata: comm.metadata || {},
      hasAttachments: Boolean(comm.metadata?.hasAttachments || (comm.attachments && comm.attachments.length > 0)),
      attachmentsCount: comm.metadata?.attachmentsCount || (comm.attachments ? comm.attachments.length : 0),
      created_at: comm.created_at || new Date().toISOString(),
      source: "corpflats_engine"
    };
    item.matchedReservation = matchEmailWithReservation(db, item);
    if (isInboundComm) {
      item.labels = inferZohoSmartLabels(item, meta.labels || comm.labels || [], item.matchedReservation);
    }
    unified.push(item);
  }

  // 4. Fila de E-mails Agendados (db.emailQueue -> pasta 'queue', sem poluir as etiquetas de Recebidos!)
  for (const q of db.emailQueue || []) {
    if (!q || q.status === "cancelled" || q.status === "sent") continue;
    const qId = q.id;
    if (seenIds.has(qId)) continue;
    seenIds.add(qId);
    const meta = stateMeta[qId] || {};
    if (meta.deletedForever) continue;

    const item = {
      id: qId,
      queueId: q.id,
      folder: meta.folder || "queue",
      direction: "scheduled",
      fromName: defaultFromName,
      fromEmail: defaultFromEmail,
      recipient: q.recipient || "",
      cc: q.cc || "",
      subject: q.subject || "(Agendado)",
      snippet: extractTextSnippet(q.bodyText || q.bodyHtml || q.subject),
      bodyHtml: q.bodyHtml || "",
      bodyText: q.bodyText || "",
      isRead: meta.isRead !== undefined ? meta.isRead : true,
      isStarred: meta.isStarred !== undefined ? meta.isStarred : false,
      labels: [],
      status: "scheduled",
      scheduledFor: q.scheduledFor,
      triggerEvent: q.triggerEvent,
      guestName: q.guestName,
      reservation_id: q.reservationId,
      reservationCode: q.reservationCode,
      hasAttachments: false,
      created_at: q.scheduledFor || q.createdAt || new Date().toISOString(),
      source: "email_queue"
    };
    item.matchedReservation = matchEmailWithReservation(db, item);
    unified.push(item);
  }

  // 5. Rascunhos Salvos (db.emailDrafts -> pasta 'drafts')
  for (const dr of db.emailDrafts || []) {
    if (!dr || !dr.id) continue;
    if (seenIds.has(dr.id)) continue;
    seenIds.add(dr.id);
    const meta = stateMeta[dr.id] || {};
    if (meta.deletedForever) continue;

    const item = {
      id: dr.id,
      draftId: dr.id,
      folder: meta.folder || "drafts",
      direction: "draft",
      fromName: defaultFromName,
      fromEmail: defaultFromEmail,
      recipient: Array.isArray(dr.to) ? dr.to.join(", ") : (dr.recipient || dr.to || ""),
      cc: Array.isArray(dr.cc) ? dr.cc.join(", ") : (dr.cc || ""),
      bcc: Array.isArray(dr.bcc) ? dr.bcc.join(", ") : (dr.bcc || ""),
      subject: dr.subject || "(Rascunho sem assunto)",
      snippet: extractTextSnippet(dr.bodyHtml || dr.bodyText || "Rascunho em edição..."),
      bodyHtml: dr.bodyHtml || "",
      bodyText: dr.bodyText || "",
      isRead: true,
      isStarred: meta.isStarred !== undefined ? meta.isStarred : Boolean(dr.isStarred),
      labels: Array.isArray(meta.labels) ? meta.labels : (Array.isArray(dr.labels) ? dr.labels : []),
      status: "draft",
      reservation_id: dr.reservationId || dr.reservationCode || null,
      reservationCode: dr.reservationCode || null,
      templateKey: dr.templateKey || "custom",
      attachReservationDocs: Boolean(dr.attachReservationDocs),
      attachments: Array.isArray(dr.attachments) ? dr.attachments : [],
      hasAttachments: Boolean((dr.attachments && dr.attachments.length > 0) || dr.attachReservationDocs),
      created_at: dr.updatedAt || dr.createdAt || new Date().toISOString(),
      updatedAt: dr.updatedAt || dr.createdAt || new Date().toISOString(),
      source: "drafts"
    };
    item.matchedReservation = matchEmailWithReservation(db, item);
    unified.push(item);
  }

  // Ordena por data decrescente (exceto fila que mostra próximos primeiro quando filtrada na UI)
  unified.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  return unified;
}

/**
 * Calcula contadores dinâmicos de pastas e etiquetas
 */
export function getWebmailFoldersAndCounts(db, prebuiltAll = null) {
  ensureWebmailCollections(db);
  const all = Array.isArray(prebuiltAll) ? prebuiltAll : buildUnifiedMessagesList(db);

  const counts = {
    inbox: { total: 0, unread: 0 },
    newsletters: { total: 0, unread: 0 },
    starred: { total: 0, unread: 0 },
    drafts: { total: 0, unread: 0 },
    queue: { total: 0, unread: 0 },
    outbox: { total: 0, unread: 0 },
    sent: { total: 0, unread: 0 },
    archive: { total: 0, unread: 0 },
    spam: { total: 0, unread: 0 },
    trash: { total: 0, unread: 0 }
  };

  const customCounts = {};
  for (const cf of db.emailCustomFolders || []) {
    customCounts[cf.id] = { total: 0, unread: 0 };
  }

  const labelCounts = {};
  for (const lb of db.emailLabels || []) {
    labelCounts[lb.id] = { total: 0, unread: 0 };
  }

  for (const m of all) {
    const fld = m.folder || "inbox";
    if (counts[fld]) {
      counts[fld].total++;
      if (!m.isRead) counts[fld].unread++;
    } else if (customCounts[fld]) {
      customCounts[fld].total++;
      if (!m.isRead) customCounts[fld].unread++;
    }

    if (m.isStarred && fld !== "trash" && fld !== "spam") {
      counts.starred.total++;
      if (!m.isRead) counts.starred.unread++;
    }

    if (fld !== "trash" && fld !== "spam" && fld !== "drafts") {
      counts.archive.total++;
    }

    // Regra de ouro: etiquetas contam apenas e-mails recebidos (inbound) fora de lixeira/spam
    if (m.direction === "inbound" && Array.isArray(m.labels) && fld !== "trash" && fld !== "spam") {
      for (const lid of m.labels) {
        if (labelCounts[lid]) {
          labelCounts[lid].total++;
          if (!m.isRead) labelCounts[lid].unread++;
        }
      }
    }
  }

  const systemFolders = [
    { id: "inbox", name: "Caixa de Entrada", icon: "Inbox", total: counts.inbox.total, unread: counts.inbox.unread, badgeType: "unread" },
    { id: "newsletters", name: "Newsletters & Promoções", icon: "Sparkles", total: counts.newsletters.total, unread: counts.newsletters.unread, badgeType: "unread" },
    { id: "starred", name: "Com Estrela", icon: "Star", total: counts.starred.total, unread: counts.starred.unread, badgeType: "total" },
    { id: "drafts", name: "Rascunhos", icon: "FileEdit", total: counts.drafts.total, unread: counts.drafts.unread, badgeType: "total" },
    { id: "queue", name: "Fila Agendada", icon: "Clock", total: counts.queue.total, unread: counts.queue.unread, badgeType: "total", accent: "amber" },
    { id: "outbox", name: "Caixa de Saída", icon: "SendHorizontal", total: counts.outbox.total, unread: counts.outbox.unread, badgeType: "total", accent: counts.outbox.total > 0 ? "rose" : undefined },
    { id: "sent", name: "Enviados", icon: "Send", total: counts.sent.total, unread: 0, badgeType: "total" },
    { id: "archive", name: "Todos / Arquivo", icon: "Archive", total: counts.archive.total, unread: 0, badgeType: "none" },
    { id: "spam", name: "Spam", icon: "ShieldAlert", total: counts.spam.total, unread: counts.spam.unread, badgeType: "total" },
    { id: "trash", name: "Lixeira", icon: "Trash2", total: counts.trash.total, unread: 0, badgeType: "total" }
  ];

  const customFolders = (db.emailCustomFolders || []).map(cf => ({
    ...cf,
    total: customCounts[cf.id]?.total || 0,
    unread: customCounts[cf.id]?.unread || 0
  }));

  const labels = (db.emailLabels || []).map(lb => ({
    ...lb,
    total: labelCounts[lb.id]?.total || 0,
    unread: labelCounts[lb.id]?.unread || 0
  }));

  return { systemFolders, customFolders, labels };
}

function isNonThreadableGenericSubject(normSubj) {
  if (!normSubj || normSubj.length <= 4) return true;
  return (
    normSubj === "código de acesso" ||
    normSubj === "codigo de acesso" ||
    normSubj === "código de autenticação b2b" ||
    normSubj === "codigo de autenticacao b2b" ||
    normSubj === "undelivered mail returned to sender" ||
    normSubj === "delivery status notification (failure)"
  );
}

/**
 * Executa sincronização Zoho deduplicada em voo por pasta/busca (evita chamadas concorrentes repetidas)
 */
async function runZohoSyncDeduped(db, { folder = "inbox", search = "", incremental = false, saveDatabase = null } = {}) {
  const syncKey = `${folder}|${String(search || "").trim().toLowerCase()}`;
  if (zohoTokenCache.syncInFlightByKey[syncKey]) {
    return zohoTokenCache.syncInFlightByKey[syncKey];
  }

  const promise = (async () => {
    try {
      const syncRes = await syncZohoMessagesToCache(db, {
        folder,
        search,
        incremental,
        saveDatabase
      });
      if (syncRes.ok && syncRes.synced > 0 && typeof saveDatabase === "function") {
        saveDatabase("zoho_sync_incremental");
      }
      return syncRes;
    } finally {
      delete zohoTokenCache.syncInFlightByKey[syncKey];
    }
  })();

  zohoTokenCache.syncInFlightByKey[syncKey] = promise;
  return promise;
}

function triggerThrottledB2bCredentialCheck(db, saveDatabase) {
  const now = Date.now();
  if (now - (zohoTokenCache.lastB2bDispatchCheckAt || 0) < 30000) return;
  zohoTokenCache.lastB2bDispatchCheckAt = now;
  Promise.resolve()
    .then(() => ensurePendingB2bAgencyCredentialDispatches(db, saveDatabase))
    .catch(err => console.warn("[Webmail B2B Credential Background] Aviso:", err?.message || err));
}

function computeWebmailItemDigest(m) {
  const labelsSig = Array.isArray(m.labels) ? m.labels.join(",") : "";
  const resSig = m.matchedReservation
    ? `${m.matchedReservation.id}:${m.matchedReservation.fnhrCompleted ? 1 : 0}:${m.matchedReservation.attachmentsAvailableCount || 0}:${m.matchedReservation.vehiclePlate || ""}`
    : "";
  return [
    m.isRead ? "1" : "0",
    m.isStarred ? "1" : "0",
    m.folder || "",
    m.status || "",
    m.threadCount || 1,
    labelsSig,
    resSig,
    m.hasAttachments ? "1" : "0",
    m.scheduledFor || "",
    m.updatedAt || "",
    (m.subject || "").length,
    (m.snippet || "").slice(0, 32)
  ].join("|");
}

function stripHeavyWebmailFields(m) {
  const isDraft = m.folder === "drafts" || m.status === "draft";
  if (isDraft) return m;
  const { bodyHtml, bodyText, ...lightItem } = m;
  return {
    ...lightItem,
    hasCachedBody: Boolean(bodyHtml)
  };
}

/**
 * Filtra e pagina mensagens para a Coluna 2 (Lista de E-mails / Threads)
 * Suporta leitura em memória ultra-rápida (syncRemote=false), compactação de payload e Delta Incremental (knownDigests)
 */
export async function listWebmailMessages(db, {
  folder = "inbox",
  labelId = "",
  quickFilter = "all",
  search = "",
  syncRemote = false,
  compact = false,
  knownDigests = null,
  saveDatabase = null
} = {}) {
  ensureWebmailCollections(db);

  const oauthCfg = getZohoOAuthConfig(db);
  const syncTargetFolder = labelId ? "inbox" : folder;
  const effectiveZohoFolder = syncTargetFolder === "newsletters" ? "inbox" : syncTargetFolder;
  const lastFolderSync = zohoTokenCache.lastFolderSyncAt?.[effectiveZohoFolder] || 0;
  const canSyncFolder =
    oauthCfg.isConfigured &&
    syncTargetFolder !== "queue" &&
    syncTargetFolder !== "outbox";

  let syncMeta = { synced: 0, backgroundTriggered: false };

  if (canSyncFolder) {
    if (syncRemote) {
      // Quando o cliente pediu sync explícito (ex: botão Atualizar ou estágio 2 em background), aguarda o sync incremental deduplicado
      const syncRes = await runZohoSyncDeduped(db, {
        folder: effectiveZohoFolder,
        search,
        incremental: !search,
        saveDatabase
      });
      syncMeta.synced = Number(syncRes?.synced || 0);
    } else if (Date.now() - lastFolderSync > 30000) {
      // Leitura instantânea (syncRemote=false): NUNCA bloqueia a resposta HTTP! Dispara atualização Zoho em background
      syncMeta.backgroundTriggered = true;
      void runZohoSyncDeduped(db, {
        folder: effectiveZohoFolder,
        search: "",
        incremental: true,
        saveDatabase
      });
    }
  }

  // Dispara verificação B2B em background com throttle de 30s sem travar a listagem da UI
  triggerThrottledB2bCredentialCheck(db, saveDatabase);

  const all = buildUnifiedMessagesList(db);
  const cleanSearch = String(search || "").trim().toLowerCase();
  const todayBrStr = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  let filtered = all.filter(m => {
    // 1. Filtro por Etiqueta (se selecionado na sidebar) -> estritamente apenas recebidos (inbound)
    if (labelId) {
      if (m.direction !== "inbound" || m.folder === "trash" || m.folder === "spam") return false;
      if (!Array.isArray(m.labels) || !m.labels.includes(labelId)) return false;
    } else {
      // 2. Filtro por Pasta
      if (folder === "starred") {
        if (!m.isStarred || m.folder === "trash") return false;
      } else if (folder === "archive") {
        if (m.folder === "trash" || m.folder === "spam" || m.folder === "drafts") return false;
      } else {
        if (m.folder !== folder) return false;
      }
    }

    // 3. Pílulas de Filtro Rápido Contextuais (Quick Toggles)
    if (quickFilter === "unread" && m.isRead) return false;
    if (quickFilter === "starred" && !m.isStarred) return false;
    if (quickFilter === "hasAttachment" && !m.hasAttachments && !(m.matchedReservation?.attachmentsAvailableCount > 0)) return false;
    if (quickFilter === "hasReservation" && !m.matchedReservation) return false;
    if (quickFilter === "failed" && m.status !== "failed") return false;

    if (quickFilter === "today") {
      const refIso = (folder === "queue" && !labelId) ? (m.scheduledFor || m.created_at) : m.created_at;
      const msgBrStr = new Date(refIso || 0).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
      if (msgBrStr !== todayBrStr) return false;
    }

    const toStr = Array.isArray(m.to) ? m.to.join(" ") : String(m.to || "");
    const ccStr = Array.isArray(m.cc) ? m.cc.join(" ") : String(m.cc || "");
    const recLow = `${m.recipient || ""} ${toStr} ${ccStr}`.toLowerCase();
    const subjLow = String(m.subject || "").toLowerCase();
    const tplLow = String(m.templateKey || "").toLowerCase();

    // Filtros contextuais de Enviados (sent)
    if (quickFilter === "sent_guests") {
      if (recLow.includes("promenade.com.br") || recLow.includes("pfbestacionamentos")) return false;
      if (!m.matchedReservation && (subjLow.includes("portaria") || subjLow.includes("garagem"))) return false;
    }
    if (quickFilter === "sent_portaria") {
      if (!recLow.includes("promenade.com.br") && !subjLow.includes("portaria") && !subjLow.includes("liberação de acesso")) return false;
    }
    if (quickFilter === "sent_garage") {
      if (!recLow.includes("pfbestacionamentos") && !subjLow.includes("garagem") && !subjLow.includes("vaga de estacionamento")) return false;
    }

    // Filtros contextuais da Fila Agendada (queue)
    if (quickFilter === "queue_24h") {
      const schedMs = new Date(m.scheduledFor || m.created_at || 0).getTime();
      if (schedMs > Date.now() + 24 * 3600 * 1000) return false;
    }
    if (quickFilter === "queue_checkin") {
      const isCheckin =
        tplLow.includes("checkin") ||
        tplLow.includes("arrival") ||
        subjLow.includes("check-in") ||
        subjLow.includes("instruções de chegada") ||
        subjLow.includes("liberação") ||
        subjLow.includes("garagem");
      if (!isCheckin) return false;
    }
    if (quickFilter === "queue_welcome") {
      const isWelcome =
        tplLow.includes("welcome") ||
        subjLow.includes("bem-vindo") ||
        subjLow.includes("boas-vindas") ||
        subjLow.includes("confirmação");
      if (!isWelcome) return false;
    }
    if (quickFilter === "queue_checkout") {
      const isCheckout =
        tplLow.includes("checkout") ||
        subjLow.includes("check-out") ||
        subjLow.includes("agradecimento");
      if (!isCheckout) return false;
    }

    // 4. Busca Instantânea
    if (cleanSearch) {
      const haystack = [
        m.subject,
        m.fromName,
        m.fromEmail,
        m.recipient,
        m.cc,
        m.snippet,
        m.reservation_id,
        m.reservationCode,
        m.matchedReservation?.code,
        m.matchedReservation?.guestName,
        m.matchedReservation?.flatNumber ? `flat ${m.matchedReservation.flatNumber}` : ""
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(cleanSearch)) return false;
    }

    return true;
  });

  // Se for a pasta de Fila Agendada, ordena pela próxima data programada
  if (folder === "queue" && !labelId) {
    filtered.sort((a, b) => new Date(a.scheduledFor || a.created_at).getTime() - new Date(b.scheduledFor || b.created_at).getTime());
  }

  // Calcula contagem de mensagens na mesma conversa (Thread Count)
  const subjectMap = new Map();
  for (const m of all) {
    if (m.folder === "trash" || m.folder === "drafts") continue;
    const normSubj = normalizeThreadSubject(m.subject);
    const key = m.threadId || (!isNonThreadableGenericSubject(normSubj) ? `subj_${normSubj}` : m.id);
    subjectMap.set(key, (subjectMap.get(key) || 0) + 1);
  }

  const itemsWithThreadCount = filtered.map(m => {
    const normSubj = normalizeThreadSubject(m.subject);
    const key = m.threadId || (!isNonThreadableGenericSubject(normSubj) ? `subj_${normSubj}` : m.id);
    const enriched = {
      ...m,
      threadCount: subjectMap.get(key) || 1
    };
    enriched._digest = computeWebmailItemDigest(enriched);
    return enriched;
  });

  const { systemFolders, customFolders, labels } = getWebmailFoldersAndCounts(db, all);
  const zohoStatus = getZohoStatusSummary(db);

  // Modo Delta Incremental: retorna APENAS mensagens novas/alteradas e IDs removidos!
  if (knownDigests && typeof knownDigests === "object" && !Array.isArray(knownDigests)) {
    const orderedIds = itemsWithThreadCount.map(m => m.id);
    const currentIdSet = new Set(orderedIds);
    const prevIds = Object.keys(knownDigests);

    const upserted = [];
    for (const item of itemsWithThreadCount) {
      if (knownDigests[item.id] !== item._digest) {
        upserted.push(compact ? stripHeavyWebmailFields(item) : item);
      }
    }

    const removedIds = [];
    for (const oldId of prevIds) {
      if (!currentIdSet.has(oldId)) {
        removedIds.push(oldId);
      }
    }

    const sameOrder =
      prevIds.length === orderedIds.length &&
      prevIds.every((id, idx) => id === orderedIds[idx]);
    const unchanged = upserted.length === 0 && removedIds.length === 0 && sameOrder;

    return {
      deltaMode: true,
      unchanged,
      upserted,
      removedIds,
      orderedIds,
      totalCount: orderedIds.length,
      syncMeta,
      systemFolders,
      customFolders,
      labels,
      zohoStatus
    };
  }

  const outputMessages = compact
    ? itemsWithThreadCount.map(stripHeavyWebmailFields)
    : itemsWithThreadCount;

  return {
    messages: outputMessages,
    syncMeta,
    systemFolders,
    customFolders,
    labels,
    zohoStatus
  };
}

/**
 * Obtém detalhes completos de uma mensagem + histórico da Thread em Acordeão + Anexos
 */
export async function getWebmailMessageDetail(db, saveDatabase, messageId, options = {}) {
  const markRead = options?.markRead !== false;
  ensureWebmailCollections(db);
  const all = buildUnifiedMessagesList(db);
  const target = all.find(m => m.id === messageId);
  if (!target) {
    return { ok: false, error: "Mensagem não encontrada." };
  }

  // Se for mensagem vinda da Zoho REST API e ainda não tiver o HTML ou lista de anexos carregados, busca na Zoho API
  let cacheMutated = false;
  if (target.source === "zoho_api" && target.zohoMessageId && target.zohoFolderId) {
    if (!target.bodyHtml) {
      const contentRes = await callZohoMailApi(
        db,
        `/accounts/{accountId}/folders/${target.zohoFolderId}/messages/${target.zohoMessageId}/content`
      );
      if (contentRes.ok && contentRes.data?.content) {
        target.bodyHtml = contentRes.data.content;
        const cached = (db.zohoMessagesCache || []).find(c => c.id === target.id);
        if (cached) {
          cached.bodyHtml = target.bodyHtml;
          cacheMutated = true;
        }
      }
    }

    if (target.hasAttachments && (!Array.isArray(target.attachments) || target.attachments.length === 0)) {
      const attRes = await callZohoMailApi(
        db,
        `/accounts/{accountId}/folders/${target.zohoFolderId}/messages/${target.zohoMessageId}/attachmentinfo`
      );
      const rawAtts = Array.isArray(attRes.data?.attachments)
        ? attRes.data.attachments
        : Array.isArray(attRes.data)
          ? attRes.data
          : Array.isArray(attRes.raw?.data?.attachments)
            ? attRes.raw.data.attachments
            : Array.isArray(attRes.raw?.data)
              ? attRes.raw.data
              : [];
      if (attRes.ok && rawAtts.length > 0) {
        target.attachments = rawAtts.map(a => ({
          id: a.attachmentId || a.id,
          filename: a.attachmentName || a.filename || "anexo.pdf",
          size: a.attachmentSize || a.size || 0,
          contentType: a.contentType || "application/octet-stream",
          downloadUrl: `/api/webmail/attachments/${target.zohoFolderId}/${target.zohoMessageId}/${a.attachmentId || a.id}?name=${encodeURIComponent(a.attachmentName || a.filename || "anexo")}`
        }));
        const cached = (db.zohoMessagesCache || []).find(c => c.id === target.id);
        if (cached) {
          cached.attachments = target.attachments;
          cacheMutated = true;
        }
      }
    }
  }

  // Se for confirmação de reserva B2B AINDA NÃO PROCESSADA, extrai dados do voucher e garante vínculo das 4 pontas no banco
  if (
    !target.b2bParsed &&
    target.direction === "inbound" &&
    (String(target.fromEmail || "").toLowerCase().includes("b2breservas") ||
      /Confirma[cç][aã]o\s+d[ae]\s+Reserva\s*[-:]?\s*\d{7,10}/i.test(target.subject || "") ||
      /\bVOUCHER\b/i.test(target.subject || ""))
  ) {
    let attachmentPdfText = "";
    if (Array.isArray(target.attachments) && target.zohoFolderId && target.zohoMessageId) {
      for (const att of target.attachments) {
        const fname = String(att.filename || "");
        const mime = String(att.contentType || "");
        if (fname.toLowerCase().endsWith(".pdf") || mime.toLowerCase() === "application/pdf") {
          try {
            const fileRes = await callZohoMailApi(
              db,
              `/accounts/{accountId}/folders/${target.zohoFolderId}/messages/${target.zohoMessageId}/attachments/${att.id}`,
              { responseType: "buffer" }
            );
            if (fileRes.ok && Buffer.isBuffer(fileRes.data)) {
              const pdfText = extractTextFromPdfBuffer(fileRes.data);
              if (pdfText) attachmentPdfText += `\n${pdfText}`;
            }
          } catch {}
        }
      }
    }

    const combinedBody = [target.bodyText || target.snippet || "", attachmentPdfText].filter(Boolean).join("\n");
    const parsedB2b = await fetchAndParseB2bVoucher({
      rawText: combinedBody,
      htmlText: target.bodyHtml || "",
      subject: target.subject || ""
    });
    if (parsedB2b.b2bReservationNumber && parsedB2b.guestName && parsedB2b.checkinDate) {
      const ingestRes = ingestB2bVoucherIntoDb(db, parsedB2b, { saveDatabase, autoSendCredentialEmail: false });
      if (ingestRes?.ok) {
        await enrichB2bIngestedEntitiesCnpj(db, { ...ingestRes, saveDatabase });
      }
      if (!target.matchedReservation) {
        target.matchedReservation = matchEmailWithReservation(db, target);
      }
    }
    target.b2bParsed = true;
    const cached = (db.zohoMessagesCache || []).find(c => c.id === target.id);
    if (cached) {
      cached.b2bParsed = true;
      cacheMutated = true;
    }
  }

  if (cacheMutated && typeof saveDatabase === "function") {
    saveDatabase("webmail_detail_cache");
  }

  // Resolve anexos da reserva se aplicável
  let resolvedAttachments = Array.isArray(target.attachments) ? [...target.attachments] : [];
  if (target.matchedReservation && resolvedAttachments.length === 0) {
    const resObj = (db.reservations || []).find(r => String(r.id) === String(target.matchedReservation.id));
    if (resObj) {
      const resAtts = resolveReservationAttachments({ reservation: resObj, db });
      resolvedAttachments = resAtts.map((a, idx) => ({
        id: `res_att_${idx}`,
        filename: a.filename,
        size: a.content ? a.content.length : 148000,
        contentType: a.contentType || (a.filename?.endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
        downloadUrl: a.path && String(a.path).startsWith("http")
          ? a.path
          : `/api/webmail/reservation-attachment/${encodeURIComponent(String(resObj.code || resObj.id))}/${idx}`
      }));
    }
  }

  // Marca automaticamente como lido ao abrir (exceto em prefetch de segundo plano)
  if (markRead && !target.isRead) {
    if (!db.emailStateMeta[target.id]) db.emailStateMeta[target.id] = {};
    db.emailStateMeta[target.id].isRead = true;
    target.isRead = true;
    if (typeof saveDatabase === "function") saveDatabase("webmail_mark_read");
  }

  // Agrupa todas as mensagens da mesma conversa (Thread) e ordena da MAIS RECENTE (topo) para a mais antiga
  const normTargetSubj = normalizeThreadSubject(target.subject);
  const rawThreadMessages = all
    .filter(m => {
      if (m.id === target.id) return true;
      if (m.folder === "trash" || m.folder === "drafts") return false;
      if (target.threadId && m.threadId === target.threadId) return true;
      if (!isNonThreadableGenericSubject(normTargetSubj) && normalizeThreadSubject(m.subject) === normTargetSubj) {
        return true;
      }
      return false;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Garante que a mensagem mais recente (topo do acordeão) tenha o HTML carregado caso seja da Zoho API
  const newestInThread = rawThreadMessages[0];
  if (
    newestInThread &&
    newestInThread.id !== target.id &&
    newestInThread.source === "zoho_api" &&
    !newestInThread.bodyHtml &&
    newestInThread.zohoMessageId &&
    newestInThread.zohoFolderId
  ) {
    const newestRes = await callZohoMailApi(
      db,
      `/accounts/{accountId}/folders/${newestInThread.zohoFolderId}/messages/${newestInThread.zohoMessageId}/content`
    );
    if (newestRes.ok && newestRes.data?.content) {
      newestInThread.bodyHtml = newestRes.data.content;
      const cachedNewest = (db.zohoMessagesCache || []).find(c => c.id === newestInThread.id);
      if (cachedNewest) cachedNewest.bodyHtml = newestInThread.bodyHtml;
      if (typeof saveDatabase === "function") saveDatabase();
    }
  }

  const threadMessages = rawThreadMessages.map(tm => ({
    ...tm,
    bodyHtml: sanitizeEmailHtml(tm.bodyHtml || `<p>${tm.bodyText || tm.snippet || ""}</p>`),
    attachments: tm.id === target.id ? resolvedAttachments : (tm.attachments || [])
  }));

  return {
    ok: true,
    message: {
      ...target,
      bodyHtml: sanitizeEmailHtml(target.bodyHtml || `<p>${target.bodyText || target.snippet || ""}</p>`),
      attachments: resolvedAttachments
    },
    threadMessages
  };
}

/**
 * Auto-Save ou Atualização de Rascunho (Draft)
 */
export async function saveWebmailDraft(db, saveDatabase, payload = {}) {
  ensureWebmailCollections(db);
  const draftId = payload.id || payload.draftId || `drf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const toList = Array.isArray(payload.to)
    ? payload.to
    : String(payload.to || payload.recipient || "").split(/[,;]/).map(s => s.trim()).filter(Boolean);
  const ccList = Array.isArray(payload.cc)
    ? payload.cc
    : String(payload.cc || "").split(/[,;]/).map(s => s.trim()).filter(Boolean);
  const bccList = Array.isArray(payload.bcc)
    ? payload.bcc
    : String(payload.bcc || "").split(/[,;]/).map(s => s.trim()).filter(Boolean);

  const draftRecord = {
    id: draftId,
    to: toList,
    recipient: toList.join(", "),
    cc: ccList,
    bcc: bccList,
    subject: String(payload.subject || "").trim(),
    bodyHtml: payload.bodyHtml || "",
    bodyText: payload.bodyText || "",
    reservationId: payload.reservationId || null,
    reservationCode: payload.reservationCode || null,
    templateKey: payload.templateKey || "custom",
    useTransactionalLayout: payload.useTransactionalLayout !== false,
    attachReservationDocs: Boolean(payload.attachReservationDocs),
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
    inReplyTo: payload.inReplyTo || null,
    updatedAt: now,
    createdAt: payload.createdAt || now
  };

  const existingIdx = db.emailDrafts.findIndex(d => d.id === draftId);
  if (existingIdx >= 0) {
    db.emailDrafts[existingIdx] = { ...db.emailDrafts[existingIdx], ...draftRecord };
  } else {
    db.emailDrafts.unshift(draftRecord);
  }

  // Se o Zoho OAuth2 estiver ativo, sincroniza o rascunho remotamente em background
  const oauthCfg = getZohoOAuthConfig(db);
  if (oauthCfg.isConfigured && (draftRecord.subject || draftRecord.bodyHtml || draftRecord.bodyText)) {
    const smtpCfg = getSmtpConfig(db);
    callZohoMailApi(db, "/accounts/{accountId}/messages", {
      method: "POST",
      body: JSON.stringify({
        fromAddress: zohoTokenCache.primaryEmailAddress || smtpCfg.fromEmail,
        toAddress: draftRecord.recipient,
        ccAddress: ccList.join(", "),
        bccAddress: bccList.join(", "),
        subject: draftRecord.subject || "(Rascunho)",
        content: draftRecord.bodyHtml || draftRecord.bodyText || "",
        mode: "draft",
        mailFormat: "html"
      })
    }).catch(() => {});
  }

  if (typeof saveDatabase === "function") saveDatabase();
  return { ok: true, draft: draftRecord };
}

/**
 * Exclui um rascunho
 */
export function deleteWebmailDraft(db, saveDatabase, draftId) {
  ensureWebmailCollections(db);
  const before = db.emailDrafts.length;
  db.emailDrafts = db.emailDrafts.filter(d => d.id !== draftId);
  if (db.emailStateMeta?.[draftId]) {
    delete db.emailStateMeta[draftId];
  }
  if (typeof saveDatabase === "function") saveDatabase();
  return { ok: true, removed: before !== db.emailDrafts.length };
}

/**
 * Envia e-mail pelo Webmail (Novo, Responder, Encaminhar, com Templates Hoteleiros e Anexos FNRH/Upload)
 */
export async function sendWebmailMessage(db, saveDatabase, payload = {}) {
  ensureWebmailCollections(db);
  const toList = Array.isArray(payload.to)
    ? payload.to
    : String(payload.to || payload.recipient || "").split(/[,;]/).map(s => s.trim()).filter(Boolean);
  const ccList = Array.isArray(payload.cc)
    ? payload.cc
    : String(payload.cc || "").split(/[,;]/).map(s => s.trim()).filter(Boolean);
  const bccList = Array.isArray(payload.bcc)
    ? payload.bcc
    : String(payload.bcc || "").split(/[,;]/).map(s => s.trim()).filter(Boolean);

  const recipientStr = toList.join(", ");
  const ccStr = ccList.join(", ");
  const bccStr = bccList.join(", ");
  const subjectStr = String(payload.subject || "").trim();
  const rawBodyHtml = payload.bodyHtml || "";
  const rawBodyText = payload.bodyText || extractTextSnippet(rawBodyHtml, 4000);

  if (!recipientStr || !subjectStr) {
    return { ok: false, error: "Destinatário (Para) e Assunto são obrigatórios." };
  }

  // Localiza reserva vinculada (se informada no compositor)
  const resIdentifier = payload.reservationCode || payload.reservationId;
  const reservation = resIdentifier
    ? (db.reservations || []).find(r => String(r.id) === String(resIdentifier) || r.code === resIdentifier)
    : null;
  const flat = reservation
    ? (db.flats || []).find(f => f.id === reservation.flatId || String(f.number) === String(reservation.flatNumber))
    : null;

  // Renderiza com o Template Transacional de 600px se solicitado
  let finalHtml = rawBodyHtml;
  if (payload.useTransactionalLayout !== false) {
    const rendered = renderManualEmail({
      subject: subjectStr,
      message: rawBodyHtml || rawBodyText,
      reservation,
      flat,
      settings: db.settings
    });
    finalHtml = rendered.bodyHtml;
  } else if (!finalHtml && rawBodyText) {
    finalHtml = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #1F2937; line-height: 1.6; white-space: pre-wrap;">${rawBodyText}</div>`;
  }

  // Prepara lista de anexos (Anexos da Reserva FNRH/Doc + Uploads do Compositor)
  const attachments = [];
  if (payload.attachReservationDocs && reservation) {
    const resAtts = await ensureReservationAttachmentsReady({ reservation, db });
    if (Array.isArray(resAtts)) {
      attachments.push(...resAtts);
    }
  }

  if (Array.isArray(payload.attachments)) {
    for (const att of payload.attachments) {
      if (!att) continue;
      if (att.dataUrl && String(att.dataUrl).startsWith("data:")) {
        const match = String(att.dataUrl).match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          attachments.push({
            filename: att.filename || att.name || "anexo.bin",
            content: Buffer.from(match[2], "base64"),
            contentType: match[1]
          });
        }
      } else if (att.path) {
        attachments.push({
          filename: att.filename || att.name || path.basename(att.path),
          path: att.path
        });
      }
    }
  }

  // Se havia um rascunho em edição, remove-o dos rascunhos ativos
  if (payload.draftId) {
    deleteWebmailDraft(db, null, payload.draftId);
  }

  // Tenta enviar via Zoho Mail REST API se OAuth2 estiver ativo e sem anexos locais em disco
  const oauthCfg = getZohoOAuthConfig(db);
  let sentViaZohoRest = false;
  let zohoMsgId = null;

  if (oauthCfg.isConfigured && attachments.length === 0) {
    const smtpCfg = getSmtpConfig(db);
    const resolvedFromAddress =
      zohoTokenCache.primaryEmailAddress ||
      db?.settings?.zohoOAuth?.primaryEmailAddress ||
      smtpCfg.fromEmail;
    const zohoRes = await callZohoMailApi(db, "/accounts/{accountId}/messages", {
      method: "POST",
      body: JSON.stringify({
        fromAddress: resolvedFromAddress,
        toAddress: recipientStr,
        ...(ccStr ? { ccAddress: ccStr } : {}),
        ...(bccStr ? { bccAddress: bccStr } : {}),
        subject: subjectStr,
        content: finalHtml,
        mailFormat: "html",
        ...(payload.replyType === "reply" ? { action: "reply", inReplyTo: payload.inReplyTo } : {}),
        ...(payload.replyType === "replyall" ? { action: "replyall", inReplyTo: payload.inReplyTo } : {}),
        ...(payload.replyType === "forward" ? { action: "forward", inReplyTo: payload.inReplyTo } : {})
      })
    });

    if (zohoRes.ok) {
      sentViaZohoRest = true;
      zohoMsgId = zohoRes.data?.messageId || `zoho_sent_${Date.now()}`;
    }
  }

  if (sentViaZohoRest) {
    const now = new Date().toISOString();
    const commLog = {
      id: crypto.randomUUID(),
      reservation_id: String(reservation?.code || reservation?.id || payload.reservationCode || "MANUAL"),
      type: "email",
      direction: "outbound",
      recipient: recipientStr,
      cc: ccStr || null,
      bcc: bccStr || null,
      subject: subjectStr,
      body: finalHtml,
      status: "sent",
      metadata: {
        trigger: payload.trigger || "webmail_zoho_api",
        sentVia: "zoho_rest_api",
        messageId: zohoMsgId,
        sentAt: now,
        reservationCode: reservation?.code || null,
        guestName: reservation?.guestName || null,
        hasAttachments: attachments.length > 0,
        attachmentsCount: attachments.length
      },
      created_at: now,
      createdAt: now
    };
    if (!db.reservationCommunications) db.reservationCommunications = [];
    db.reservationCommunications.unshift(commLog);
    if (typeof saveDatabase === "function") saveDatabase();
    return {
      ok: true,
      method: "zoho_rest_api",
      communication: commLog
    };
  }

  // Fallback/Motor Principal Integrado: Dispara via sendEmailAsync (Nodemailer Zoho SMTP)
  const commLog = sendEmailAsync({
    db,
    saveDatabase,
    reservationId: reservation?.code || reservation?.id || payload.reservationCode || "MANUAL",
    recipient: recipientStr,
    cc: ccStr || undefined,
    bcc: bccStr || undefined,
    subject: subjectStr,
    bodyHtml: finalHtml,
    bodyText: rawBodyText,
    type: "email",
    direction: "outbound",
    attachments,
    metadata: {
      trigger: payload.trigger || "webmail_compose",
      replyType: payload.replyType || undefined,
      inReplyTo: payload.inReplyTo || undefined,
      reservationCode: reservation?.code || null,
      flatNumber: reservation?.flatNumber || flat?.number || null,
      guestName: reservation?.guestName || null
    }
  });

  return {
    ok: true,
    method: "smtp_engine",
    communication: commLog
  };
}

/**
 * Executa ações em massa ou individuais (Lido/Não lido, Estrela, Arquivar, Mover, Etiquetas, Lixeira)
 */
export async function performWebmailBulkAction(db, saveDatabase, {
  messageIds = [],
  action,
  targetFolderId,
  labelId
} = {}) {
  ensureWebmailCollections(db);
  if (!Array.isArray(messageIds) || messageIds.length === 0 || !action) {
    return { ok: false, error: "Selecione ao menos uma mensagem e uma ação válida." };
  }

  const zohoMsgIds = [];

  for (const id of messageIds) {
    if (!db.emailStateMeta[id]) db.emailStateMeta[id] = {};
    const meta = db.emailStateMeta[id];

    // Se for mensagem da Zoho API, coleta o ID numérico para sincronizar com PUT /updatemessage
    if (String(id).startsWith("zoho_")) {
      zohoMsgIds.push(String(id).replace(/^zoho_/, ""));
    }

    switch (action) {
      case "markAsRead":
        meta.isRead = true;
        break;
      case "markAsUnread":
        meta.isRead = false;
        break;
      case "star":
        meta.isStarred = true;
        break;
      case "unstar":
        meta.isStarred = false;
        break;
      case "archive":
        meta.folder = "archive";
        break;
      case "unarchive":
      case "moveToInbox":
        meta.folder = "inbox";
        break;
      case "moveToFolder":
        if (targetFolderId) meta.folder = targetFolderId;
        break;
      case "spam":
        meta.folder = "spam";
        break;
      case "trash":
        meta.folder = "trash";
        break;
      case "deleteForever":
        meta.deletedForever = true;
        if (String(id).startsWith("drf_")) {
          db.emailDrafts = (db.emailDrafts || []).filter(d => d.id !== id);
        }
        break;
      case "applyLabel":
        if (labelId) {
          const current = new Set(Array.isArray(meta.labels) ? meta.labels : []);
          current.add(labelId);
          meta.labels = Array.from(current);
        }
        break;
      case "removeLabel":
        if (labelId && Array.isArray(meta.labels)) {
          meta.labels = meta.labels.filter(l => l !== labelId);
        }
        break;
      default:
        break;
    }

    // Atualiza também diretamente em webmailInboundMessages se existir
    const inb = (db.webmailInboundMessages || []).find(m => m.id === id);
    if (inb) {
      if (meta.isRead !== undefined) inb.isRead = meta.isRead;
      if (meta.isStarred !== undefined) inb.isStarred = meta.isStarred;
      if (meta.folder) inb.folder = meta.folder;
      if (Array.isArray(meta.labels)) inb.labels = meta.labels;
    }
  }

  // Sincroniza em background com a Zoho Mail REST API caso haja mensagens remotas
  const oauthCfg = getZohoOAuthConfig(db);
  if (oauthCfg.isConfigured && zohoMsgIds.length > 0) {
    let zohoMode = null;
    const zohoPayload = { messageId: zohoMsgIds };
    if (action === "markAsRead") zohoMode = "markAsRead";
    else if (action === "markAsUnread") zohoMode = "markAsUnread";
    else if (action === "star") {
      zohoMode = "flagMails";
      zohoPayload.flagid = "important";
    } else if (action === "unstar") {
      zohoMode = "flagMails";
      zohoPayload.flagid = "flag_not_set";
    } else if (action === "moveToFolder" && targetFolderId) {
      zohoMode = "moveMessage";
      zohoPayload.destfolderId = targetFolderId;
    }

    if (zohoMode) {
      callZohoMailApi(db, "/accounts/{accountId}/updatemessage", {
        method: "PUT",
        body: JSON.stringify({ mode: zohoMode, ...zohoPayload })
      }).catch(() => {});
    }
  }

  if (typeof saveDatabase === "function") saveDatabase();
  return { ok: true, updatedCount: messageIds.length, action };
}

/**
 * Cria pasta personalizada (Zoho API + Banco Local)
 */
export async function createWebmailCustomFolder(db, saveDatabase, { name, color = "#6366F1" }) {
  ensureWebmailCollections(db);
  const cleanName = String(name || "").trim();
  if (!cleanName) return { ok: false, error: "Informe o nome da pasta." };

  const folderObj = {
    id: `fld_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
    name: cleanName,
    color,
    createdAt: new Date().toISOString()
  };

  const oauthCfg = getZohoOAuthConfig(db);
  if (oauthCfg.isConfigured) {
    const zRes = await callZohoMailApi(db, "/accounts/{accountId}/folders", {
      method: "POST",
      body: JSON.stringify({ folderName: cleanName })
    });
    if (zRes.ok && zRes.data?.folderId) {
      folderObj.zohoFolderId = String(zRes.data.folderId);
    }
  }

  db.emailCustomFolders.push(folderObj);
  if (typeof saveDatabase === "function") saveDatabase();
  return { ok: true, folder: folderObj };
}

/**
 * Cria etiqueta colorida personalizada (Zoho API + Banco Local)
 */
export async function createWebmailLabel(db, saveDatabase, { name, color = "#10B981" }) {
  ensureWebmailCollections(db);
  const cleanName = String(name || "").trim();
  if (!cleanName) return { ok: false, error: "Informe o nome da etiqueta." };

  const labelObj = {
    id: `lbl_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
    name: cleanName,
    color,
    system: false,
    createdAt: new Date().toISOString()
  };

  const oauthCfg = getZohoOAuthConfig(db);
  if (oauthCfg.isConfigured) {
    const zRes = await callZohoMailApi(db, "/accounts/{accountId}/labels", {
      method: "POST",
      body: JSON.stringify({ displayName: cleanName, color })
    });
    if (zRes.ok && zRes.data?.labelId) {
      labelObj.zohoLabelId = String(zRes.data.labelId);
    }
  }

  db.emailLabels.push(labelObj);
  if (typeof saveDatabase === "function") saveDatabase();
  return { ok: true, label: labelObj };
}

/**
 * Resumo de status do Zoho OAuth2 + Motor SMTP para a Topbar do Webmail
 */
export function getZohoStatusSummary(db) {
  const oauthCfg = getZohoOAuthConfig(db);
  const smtpCfg = getSmtpConfig(db);
  return {
    oauthConfigured: oauthCfg.isConfigured,
    oauthConnected: Boolean(oauthCfg.isConfigured && zohoTokenCache.accessToken && !zohoTokenCache.lastError),
    accountId: oauthCfg.accountId || zohoTokenCache.accountId || null,
    primaryEmailAddress: zohoTokenCache.primaryEmailAddress || smtpCfg.fromEmail || smtpCfg.user || "reservas@corpflats.com.br",
    dc: oauthCfg.dc || "com",
    lastSyncAt: zohoTokenCache.lastSyncAt,
    lastWebhookAt: zohoTokenCache.lastWebhookAt || db?.settings?.zohoOAuth?.lastWebhookAt || null,
    webhookEndpoint:
      db?.settings?.zohoOAuth?.webhookEndpoint ||
      zohoTokenCache.webhookEndpoint ||
      "https://corpflats.com.br/api/webmail/zoho-webhook",
    lastError: zohoTokenCache.lastError,
    smtpConfigured: smtpCfg.isConfigured,
    smtpHost: smtpCfg.host,
    smtpPort: smtpCfg.port,
    smtpUser: smtpCfg.user,
    fromName: smtpCfg.fromName,
    fromEmail: smtpCfg.fromEmail,
    engineEnabled: db?.settings?.emailSettings?.enabled !== false,
    receptionEmail: db?.settings?.receptionEmail || "soho@promenade.com.br",
    garageEmail: db?.settings?.garageEmail || "promenadesoho@pfbestacionamentos.com.br"
  };
}

/**
 * Gera preview preenchido de um template oficial do CorpFlats para uma reserva selecionada no Compositor
 */
export function buildComposerReservationTemplate(db, { templateKey, reservationId }) {
  const r = reservationId
    ? (db.reservations || []).find(x => String(x.id) === String(reservationId) || x.code === reservationId)
    : null;
  const flat = r
    ? (db.flats || []).find(f => f.id === r.flatId || String(f.number) === String(r.flatNumber))
    : null;

  const receptionEmail = flat?.receptionEmail || db.settings?.receptionEmail || "soho@promenade.com.br";
  const garageEmail = db.settings?.garageEmail || "promenadesoho@pfbestacionamentos.com.br";

  if (!r) {
    if (templateKey === "portaria") {
      return {
        to: receptionEmail,
        subject: "Flat [Número] - [Nome do Hóspede] ([Check-in] a [Check-out])",
        bodyText: "Prezada Recepção / Portaria,\n\nSolicitamos a liberação de entrada e acesso para o hóspede titular referente à estadia informada.\n\nAtenciosamente,\nEquipe CorpFlats",
        bodyHtml: ""
      };
    }
    if (templateKey === "garagem") {
      return {
        to: garageEmail,
        subject: "Flat [Número] - [Nome do Hóspede] ([Check-in] a [Check-out])",
        bodyText: "Prezada Equipe PFB Estacionamentos,\n\nSolicitamos a liberação de entrada e acesso à vaga de garagem para o veículo cadastrado.\n\nAtenciosamente,\nEquipe CorpFlats",
        bodyHtml: ""
      };
    }
    if (templateKey === "hospede_welcome") {
      return {
        to: "",
        subject: "[CONFIRMAÇÃO DE RESERVA] Bem-vindo(a) ao CorpFlats",
        bodyText: "Olá!\n\nSua reserva no CorpFlats está confirmada. Lembre-se de preencher seu Pré-Check-in Digital para liberação rápida na portaria 24h.\n\nAtenciosamente,\nEquipe CorpFlats",
        bodyHtml: ""
      };
    }
    return { to: "", subject: "", bodyText: "", bodyHtml: "" };
  }

  if (templateKey === "portaria") {
    const rendered = renderCheckinConfirmedEmail({ reservation: r, flat, settings: db.settings, db });
    return {
      to: receptionEmail,
      subject: rendered.subject,
      bodyHtml: rendered.bodyHtml,
      bodyText: `Informativo cadastral da reserva #${r.code || r.id} referente ao Flat ${r.flatNumber} (${r.guestName}).`,
      attachReservationDocs: true
    };
  }

  if (templateKey === "garagem") {
    const rendered = renderGarageAuthorizationEmail({ reservation: r, flat, vehicle: r.vehicle, settings: db.settings });
    return {
      to: garageEmail,
      subject: rendered.subject,
      bodyHtml: rendered.bodyHtml,
      bodyText: `Solicitação de liberação de garagem para o Flat ${r.flatNumber} - Hóspede: ${r.guestName}.`,
      attachReservationDocs: false
    };
  }

  if (templateKey === "hospede_welcome") {
    const rendered = renderReservationConfirmationEmail({ reservation: r, flat, settings: db.settings, db });
    return {
      to: r.guestEmail || "",
      subject: rendered.subject,
      bodyHtml: rendered.bodyHtml,
      bodyText: `Olá, ${r.guestName}! Sua reserva #${r.code || r.id} no Flat ${r.flatNumber} está confirmada.`,
      attachReservationDocs: false
    };
  }

  if (templateKey === "acesso_wifi") {
    const rendered = renderAccessInstructionsEmail({ reservation: r, flat, settings: db.settings, db });
    return {
      to: r.guestEmail || "",
      subject: rendered.subject,
      bodyHtml: rendered.bodyHtml,
      bodyText: `Olá, ${r.guestName}! Seguem as instruções de acesso e Wi-Fi para o Flat ${r.flatNumber}.`,
      attachReservationDocs: false
    };
  }

  if (templateKey === "lembrete_checkin") {
    const rendered = renderPreCheckinReminderEmail({ reservation: r, flat, settings: db.settings, db });
    return {
      to: r.guestEmail || "",
      subject: rendered.subject,
      bodyHtml: rendered.bodyHtml,
      bodyText: `Olá, ${r.guestName}! Lembrete de preenchimento da ficha digital para entrada no Flat ${r.flatNumber}.`,
      attachReservationDocs: false
    };
  }

  if (templateKey === "b2b_credenciamento") {
    const agency = (db.agencies || []).find(a => Number(a.id) === Number(r.agencyId));
    const company = (db.companies || []).find(c => Number(c.id) === Number(r.companyId));
    const rendered = renderB2bAgencyCredentialRequestEmail({
      reservation: r,
      flat,
      agency,
      company,
      settings: db.settings,
      db
    });
    const toEmail = resolveB2bCredentialTargetEmail(r, db, "");
    return {
      to: toEmail,
      cc: "",
      subject: rendered.subject,
      bodyHtml: rendered.bodyHtml,
      bodyText: rendered.bodyText,
      attachReservationDocs: false
    };
  }

  return {
    to: r.guestEmail || receptionEmail,
    subject: `Flat ${r.flatNumber} - ${r.guestName} (#${r.code || r.id})`,
    bodyText: `Olá, ${r.guestName}!\n\nReferente à sua reserva #${r.code || r.id} no Flat ${r.flatNumber}:\n\n`,
    bodyHtml: ""
  };
}

/**
 * Converte HTML em texto estruturado preservando quebras de linha de blocos e tabelas
 */
function htmlToStructuredLines(html = "") {
  if (!html) return "";
  return String(html)
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/<\/(?:td|th)\s*>\s*<(?:td|th)\b[^>]*>/gi, " : ")
    .replace(/<(?:br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(?:tr|p|div|li|h[1-6]|table|section|article)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/:\s*:/g, ":")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/**
 * Limpa valor extraído de um campo de voucher B2B removendo rótulos adjacentes na mesma linha
 */
function cleanB2bFieldValue(val = "") {
  return String(val || "")
    .split(/\s*(?:\||;\s+|\s+-\s+(?=(?:Unidade|Filial|Ponto\s+de\s+Venda|Emissor|Agente|Solicitante|Empresa|Centro\s+de\s+Custo|Hotel|Apto|Apartamento|Per[ií]odo|H[oó]spede|Check-?in|Check-?out|Entrada|Sa[ií]da|Tarifa|Di[aá]ria|Valor|Cart[aã]o|Token|RLOC|Localizador)\b))/i)[0]
    .replace(/\s+(?:Status|Unidade(?:\s*[\/\-]?\s*POS)?|Filial|Ponto\s+de\s+Venda|Emissor|Agente|Solicitante|Empresa(?:\s+Cliente)?|Centro\s+de\s+Custo|Hotel|Apto|Apartamento|Per[ií\ufffd?]?odo|H[oó\ufffd?]?spedes?|Hospedes?|Check-?in|Check-?out|Entrada|Sa[ií\ufffd?]?da|Garantia(?:\s+NO\s+SHOW)?|Forma\s+de\s+pagamento|Despesas(?:\s+autorizadas)?|Tarifa|Di[aá\ufffd?]?ria|Valor(?:\s+m[eé\ufffd?]?dio)?|Observa[cç\ufffd?][aã\ufffd?]?o|Cart[aã\ufffd?]?o|Token(?:\s+VCN)?|RLOC|Localizador)\s*[:\-].*$/i, "")
    .replace(/^[:\-\s]+|[:\-\s]+$/g, "")
    .trim();
}

function parseB2bMoney(raw = "") {
  const s = String(raw || "").trim();
  if (!s) return 0;
  if (s.includes(".") && s.includes(",")) {
    return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (s.includes(",")) {
    return Number(s.replace(",", ".")) || 0;
  }
  return Number(s) || 0;
}

/**
 * Faz o parse de um e-mail ou voucher PDF/HTML da B2B Reservas (BOOKING_WS e OTA_WS)
 * extraindo os dados das 4 pontas (B2B + Agência + Empresa + Hóspede), Cartão Virtual VCN,
 * Comissão, Centro de Custo e Regra de Nota Fiscal.
 * Aceita objeto `{ rawText, text, htmlText, html, subject }` ou argumentos posicionais `(rawText, htmlText, subject)`.
 */
function isNonAgencySystemEmailAddress(email = "") {
  const e = String(email || "").trim().toLowerCase();
  if (!e || !e.includes("@")) return true;
  return (
    e.includes("corpflats.com.br") ||
    e.includes("promenade.com.br") ||
    e.includes("b2breservas.com.br") ||
    e.includes("omnibees.com") ||
    e.includes("booking.com") ||
    e.includes("airbnb.com") ||
    e.includes("expedia.com") ||
    e.includes("decolar.com") ||
    e.includes("channex.io") ||
    e.includes("zoho.com") ||
    e.startsWith("no-reply@") ||
    e.startsWith("noreply@") ||
    e.startsWith("nao-responda@") ||
    e.startsWith("mailer-daemon@")
  );
}

function extractHeaderAgencyEmails(...headerValues) {
  const out = [];
  const seen = new Set();
  for (const val of headerValues) {
    if (!val) continue;
    const matches = String(val).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    for (const m of matches) {
      const clean = m.trim().toLowerCase();
      if (isNonAgencySystemEmailAddress(clean)) continue;
      if (isPureBillingMailbox(clean)) continue;
      if (!seen.has(clean)) {
        seen.add(clean);
        out.push(clean);
      }
    }
  }
  return out;
}

/**
 * Identifica caixas de e-mail exclusivas de Nota Fiscal, Faturamento ou Conciliação,
 * que NUNCA devem receber solicitações de dados do hóspede (/credenciamento).
 */
export function isPureBillingMailbox(email = "") {
  const clean = String(email || "").trim().toLowerCase();
  if (!clean || !clean.includes("@")) return false;
  if (clean.endsWith("@b2breservas.com.br")) return true;
  const localPart = clean.split("@")[0] || "";
  return /^(?:conciliacao|faturamento|faturamentodpr|nf|nfe|nfse|notafiscal|notas?fiscais|nfebimbo[a-z0-9_.-]*|fiscal|financeiro|contasapagar|cobranca|envionf|envionotas|recebimentonf)(?:$|[._\-0-9])/i.test(
    localPart
  );
}

/**
 * Resolve de forma determinística e isolada o destinatário do e-mail de Credenciamento do Hóspede B2B.
 * REGRA DE OURO: Envia EXCLUSIVAMENTE ao e-mail do Solicitante ("Reservado por" / Emissor).
 * NUNCA faz fallback nem cópia (CC) para E-mails de Envio da NFS-e, Faturamento ou Conciliação.
 */
export function resolveB2bCredentialTargetEmail(reservation, db = null, explicitToEmail = "") {
  if (!reservation) return "";
  const cleanDigits = v => String(v || "").replace(/\D/g, "");
  const resAgCnpj = cleanDigits(reservation.agencyCnpj);
  const resAgNameLower = String(reservation.agencyTradeName || reservation.agencyName || "").trim().toLowerCase();
  const linkedAgency = Array.isArray(db?.agencies)
    ? db.agencies.find(a => {
        if (!a) return false;
        if (reservation.agencyId && String(a.id) === String(reservation.agencyId)) return true;
        if (resAgCnpj && resAgCnpj.length === 14 && cleanDigits(a.cnpj) === resAgCnpj) return true;
        if (
          resAgNameLower &&
          (String(a.tradeName || "").trim().toLowerCase() === resAgNameLower ||
            String(a.corporateName || "").trim().toLowerCase() === resAgNameLower)
        ) {
          return true;
        }
        return false;
      })
    : null;
  const resCompCnpj = cleanDigits(reservation.companyCnpj);
  const linkedCompany = Array.isArray(db?.companies)
    ? db.companies.find(c => {
        if (!c) return false;
        if (reservation.companyId && String(c.id) === String(reservation.companyId)) return true;
        if (resCompCnpj && resCompCnpj.length === 14 && cleanDigits(c.cnpj) === resCompCnpj) return true;
        return false;
      })
    : null;

  const norm = v => String(v || "").trim().toLowerCase();
  const explicitRequesterEmails = new Set(
    [reservation.agencyAgentEmail, reservation.requesterInfo?.email, reservation.requesterEmail]
      .map(norm)
      .filter(e => e && e.includes("@") && !isNonAgencySystemEmailAddress(e) && !isPureBillingMailbox(e))
  );

  const nfForbiddenSet = new Set(
    [
      ...(Array.isArray(reservation.nfDeliveryEmails) ? reservation.nfDeliveryEmails : []),
      linkedCompany?.financialEmail,
      linkedCompany?.emailFinanceiro,
      linkedCompany?.email
    ]
      .map(norm)
      .filter(Boolean)
  );

  const agFinancialNorm = norm(linkedAgency?.financialEmail || linkedAgency?.emailFinanceiro || "");

  const isAllowedSolicitanteEmail = (rawCand, { isFallbackCrm = false } = {}) => {
    const c = norm(rawCand);
    if (!c || !c.includes("@")) return false;
    if (isNonAgencySystemEmailAddress(c)) return false;
    if (isPureBillingMailbox(c)) return false;
    // Se estiver na lista de NF/empresa e NÃO for o e-mail explícito do solicitante na reserva, bloqueia!
    if (nfForbiddenSet.has(c) && !explicitRequesterEmails.has(c)) return false;
    if (isFallbackCrm) {
      if (nfForbiddenSet.has(c)) return false;
      // Se o e-mail operacional da agência for idêntico ao e-mail financeiro/documentação e não estiver salvo na reserva, bloqueia se houver e-mail financeiro dedicado distinto nos agentes
      if (agFinancialNorm && c === agFinancialNorm && /^atendimentonacional@/i.test(c)) return false;
    }
    return true;
  };

  if (explicitToEmail && isAllowedSolicitanteEmail(explicitToEmail)) {
    return norm(explicitToEmail);
  }

  for (const primary of [
    reservation.agencyAgentEmail,
    reservation.requesterInfo?.email,
    reservation.requesterEmail
  ]) {
    if (isAllowedSolicitanteEmail(primary)) {
      return norm(primary);
    }
  }

  // Fallback único permitido: e-mail operacional da agência no CRM (desde que NÃO seja financeiro/NF/conciliação)
  if (linkedAgency?.email && isAllowedSolicitanteEmail(linkedAgency.email, { isFallbackCrm: true })) {
    return norm(linkedAgency.email);
  }

  return "";
}

/**
 * Emite alerta imediato e deduplicado ao WhatsApp do gestor quando uma reserva B2B
 * entra sem e-mail do solicitante (e sem contato do hóspede) ou sem e-mail de envio da NFS-e,
 * evitando qualquer chute/invenção de endereço de e-mail.
 */
export async function notifyManagerB2bMissingDataAlert(db, reservation, missingFields = []) {
  if (!db || !reservation || !Array.isArray(missingFields) || missingFields.length === 0) {
    return { alerted: false };
  }
  const key = String(
    reservation.code || reservation.b2bReservationNumber || reservation.externalReservationNumber || reservation.id || ""
  )
    .trim()
    .toUpperCase();
  if (!key) return { alerted: false };

  if (!Array.isArray(db.processedB2bMissingDataAlerts)) db.processedB2bMissingDataAlerts = [];
  if (!Array.isArray(db.b2bMissingDataAlerts)) db.b2bMissingDataAlerts = [];

  const dedupeSig = `${key}:${missingFields.slice().sort().join(",")}`;
  if (db.processedB2bMissingDataAlerts.includes(dedupeSig)) {
    return { alerted: false, deduplicated: true };
  }
  db.processedB2bMissingDataAlerts.unshift(dedupeSig);
  if (db.processedB2bMissingDataAlerts.length > 500) {
    db.processedB2bMissingDataAlerts.length = 500;
  }

  const summaryMsg =
    `⚠️ * Revisão Manual B2B Necessária (${reservation.code || `#${reservation.b2bReservationNumber}`})*\n` +
    `Hóspede: *${reservation.guestName || "Não informado"}*\n` +
    `Período: ${reservation.checkinDate || "?"} a ${reservation.checkoutDate || "?"} (Flat ${reservation.flatNumber || "?"})\n` +
    `Agência / Empresa: ${reservation.agencyTradeName || reservation.agencyName || "—"} / ${reservation.companyName || "—"}\n` +
    `Campos ausentes no voucher: *${missingFields.join(", ")}*\n` +
    `A reserva foi confirmada no mapa para bloquear o flat, e o disparo automático foi retido com segurança (nenhum e-mail foi inventado).`;

  const alertRecord = {
    id: `b2b_missing_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    reservationCode: reservation.code || "",
    b2bReservationNumber: reservation.b2bReservationNumber || "",
    guestName: reservation.guestName || "",
    missingFields,
    message: summaryMsg,
    createdAt: new Date().toISOString(),
    whatsappSent: false
  };
  db.b2bMissingDataAlerts.unshift(alertRecord);
  if (db.b2bMissingDataAlerts.length > 200) {
    db.b2bMissingDataAlerts.length = 200;
  }

  const zapiReady = Boolean(
    db?.zapiConfig?.instanceId &&
    db?.zapiConfig?.token &&
    process.env.NODE_ENV !== "test"
  );
  if (zapiReady) {
    try {
      const managerPhone = resolveB2bManagerWhatsApp(db);
      if (managerPhone) {
        await sendZapiMessage(db, managerPhone, summaryMsg);
        alertRecord.whatsappSent = true;
      }
    } catch (err) {
      console.warn("[B2B Missing Data Alert] Falha ao enviar alerta WhatsApp ao gestor:", err?.message || err);
    }
  }

  return { alerted: true, alertRecord };
}

/**
 * Extrai dados específicos da seção "Reservado por" (Nome, E-mail e Telefone do Solicitante)
 * em qualquer formato de voucher B2B Reservas (linha única, tabela HTML ou bloco multilinhas).
 */
function extractReservadoPorInfo(fullScan = "") {
  const result = { name: "", email: "", phone: "" };
  if (!fullScan) return result;

  const stopSectionRe =
    /^(?:Observa[cç][oõ\ufffd?]?es|Pol[ií\ufffd?]?tica|Garantia|Forma\s+de\s+[Pp]agamento|Dados\s+para|Instru[cç][oõ\ufffd?]?es|Para\s*:|H[oó\ufffd?]?spedes?|Per[ií\ufffd?]?odo|Check-?in|Check-?out|Valor|Tarifa|Di[aá\ufffd?]?ria|Comiss[aã\ufffd?]?o|Powered\s+by|_{4,})/i;

  const blockMatch = fullScan.match(
    /(?:^|\n)[^\S\r\n]*Reservado\s+por\b[^\S\r\n]*[:\-]?[^\S\r\n]*([^\r\n]*(?:\n[^\r\n]+){0,6})/i
  );
  if (!blockMatch) return result;

  const rawLines = blockMatch[1]
    .split(/\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const relevantLines = [];
  for (let idx = 0; idx < rawLines.length; idx++) {
    const ln = rawLines[idx];
    if (idx > 0 && stopSectionRe.test(ln)) break;
    relevantLines.push(ln);
  }

  const blockText = relevantLines.join("\n");
  const emailMatches = blockText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const validEmail = emailMatches
    .map(e => e.trim().toLowerCase())
    .find(e => !isNonAgencySystemEmailAddress(e) && !isPureBillingMailbox(e));
  if (validEmail) {
    result.email = validEmail;
  }

  const phoneMatch = blockText.match(
    /(?:Telefone|Tel|Fone|Celular|WhatsApp)?\s*[:\-]?\s*(\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4}(?:\s*[/e]\s*\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4})?)/i
  );
  if (phoneMatch) {
    result.phone = phoneMatch[1].replace(/[^\d+()-\s/]/g, "").replace(/\s+/g, " ").trim();
  }

  for (const ln of relevantLines) {
    const cleaned = cleanB2bFieldValue(
      ln
        .replace(/^(?:Nome|Solicitante|Consultor(?:\(a\))?|Agente|Atendente)\s*[:\-]+\s*/i, "")
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "")
        .replace(/(?:E-?mail|Telefone|Tel|Fone|Celular|WhatsApp)\s*[:\-]*.*/i, "")
        .replace(/\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4}.*$/, "")
        .replace(/^[:\-\s|/]+|[:\-\s|/]+$/g, "")
    );
    if (
      cleaned &&
      cleaned.length >= 2 &&
      !cleaned.includes("@") &&
      !/^(?:E-?mail|Telefone|Tel|Fone|CNPJ|CPF|Nome|Dados|Instru[cç][oõ]es)$/i.test(cleaned)
    ) {
      result.name = cleaned;
      break;
    }
  }

  return result;
}

const KNOWN_CITY_UF_IBGE = {
  "SAO PAULO": { city: "São Paulo", uf: "SP", ibge: "3550308", cepPrefix: "0" },
  "CAMPINAS": { city: "Campinas", uf: "SP", ibge: "3509502", cepPrefix: "1" },
  "BARUERI": { city: "Barueri", uf: "SP", ibge: "3505708", cepPrefix: "0" },
  "OSASCO": { city: "Osasco", uf: "SP", ibge: "3534401", cepPrefix: "0" },
  "SANTO ANDRE": { city: "Santo André", uf: "SP", ibge: "3547809", cepPrefix: "0" },
  "SAO BERNARDO DO CAMPO": { city: "São Bernardo do Campo", uf: "SP", ibge: "3548708", cepPrefix: "0" },
  "RIO DE JANEIRO": { city: "Rio de Janeiro", uf: "RJ", ibge: "3304557", cepPrefix: "2" },
  "MACAE": { city: "Macaé", uf: "RJ", ibge: "3302403", cepPrefix: "2" },
  "CAMPOS DOS GOYTACAZES": { city: "Campos dos Goytacazes", uf: "RJ", ibge: "3301009", cepPrefix: "2" },
  "SAO JOAO DA BARRA": { city: "São João da Barra", uf: "RJ", ibge: "3305000", cepPrefix: "2" },
  "NITEROI": { city: "Niterói", uf: "RJ", ibge: "3303302", cepPrefix: "2" },
  "CURITIBA": { city: "Curitiba", uf: "PR", ibge: "4106902", cepPrefix: "8" },
  "BELO HORIZONTE": { city: "Belo Horizonte", uf: "MG", ibge: "3106200", cepPrefix: "3" },
  "PORTO ALEGRE": { city: "Porto Alegre", uf: "RS", ibge: "4314902", cepPrefix: "9" },
  "SALVADOR": { city: "Salvador", uf: "BA", ibge: "2927408", cepPrefix: "4" },
  "BRASILIA": { city: "Brasília", uf: "DF", ibge: "5300108", cepPrefix: "7" },
  "ITAJAI": { city: "Itajaí", uf: "SC", ibge: "4208203", cepPrefix: "8" },
  "BLUMENAU": { city: "Blumenau", uf: "SC", ibge: "4202404", cepPrefix: "8" },
  "FLORIANOPOLIS": { city: "Florianópolis", uf: "SC", ibge: "4205407", cepPrefix: "8" },
  "RECIFE": { city: "Recife", uf: "PE", ibge: "2611606", cepPrefix: "5" },
  "FORTALEZA": { city: "Fortaleza", uf: "CE", ibge: "2304400", cepPrefix: "6" },
  "GOIANIA": { city: "Goiânia", uf: "GO", ibge: "5208707", cepPrefix: "7" },
  "VITORIA": { city: "Vitória", uf: "ES", ibge: "3205309", cepPrefix: "2" }
};

/**
 * Extrai endereço fiscal completo (logradouro, número, complemento, bairro, CEP de 7 ou 8 dígitos,
 * cidade, UF e IBGE) tanto de campos rotulados quanto da linha compacta padrão do B2B Reservas:
 * Ex: "RUA ERICO VERISSIMO, 342, 0, , Bairro: JARDIM CAMBARA, CEP: 0556000, SAO PAULO"
 */
function parseB2bFiscalAddressBlock(sectionText = "") {
  const out = {
    address: "",
    number: "",
    complement: "",
    neighborhood: "",
    cep: "",
    city: "",
    state: "",
    ibgeCode: "",
    found: false
  };
  if (!sectionText) return out;

  const normCityKey = (s = "") =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();

  const toTitlePt = (s = "") =>
    String(s || "")
      .trim()
      .toLowerCase()
      .replace(/(?:^|\s)\S/g, m => m.toUpperCase())
      .replace(/\b(De|Da|Do|Dos|Das|E)\b/g, m => m.toLowerCase());

  // 1. Formato inline clássico B2B Reservas: "<RUA>, <NUM>, <COMPL>, Bairro: <BAIRRO>, CEP: <CEP>, <CIDADE>"
  const inlineB2bAddr = sectionText.match(
    /(?:^|\n)\s*(?:Endere[cç]o\s*[:\-]+\s*)?([A-Za-zÀ-ÿ0-9.'º°\-/\s]{4,90}?)\s*,\s*(?:n[º°.]?\s*)?(\d+[A-Za-z0-9/-]*|S\/N)\s*,\s*([^,\n]*?)\s*(?:,\s*)*Bairro\s*[:\-]*\s*([^,\n]+?)\s*,\s*CEP\s*[:\-]*\s*(\d{4,5}-?\d{3}|\d{7,8})\s*(?:,\s*([A-Za-zÀ-ÿ\s'.-]+?)(?:\s*[/\-]\s*([A-Z]{2}))?)?(?=\s*(?:\n|$))/i
  );

  if (inlineB2bAddr) {
    const rawStreet = inlineB2bAddr[1].trim();
    if (!/pelinca/i.test(rawStreet) && !/^(?:Nome|CNPJ|Raz[aã]o|Enviar|Instru[cç][oõ]es)/i.test(rawStreet)) {
      out.address = rawStreet === rawStreet.toUpperCase() ? toTitlePt(rawStreet) : rawStreet;
      out.number = inlineB2bAddr[2].trim();
      const rawCompl = String(inlineB2bAddr[3] || "").replace(/^[,;\s-]+|[,;\s-]+$/g, "").trim();
      if (rawCompl && !/^(?:0|00|s\/c|sem\s+complemento|-)$/i.test(rawCompl)) {
        out.complement = rawCompl;
      }
      const rawBairro = inlineB2bAddr[4].trim();
      out.neighborhood = rawBairro === rawBairro.toUpperCase() ? toTitlePt(rawBairro) : rawBairro;
      out.cep = inlineB2bAddr[5].replace(/\D/g, "");
      if (inlineB2bAddr[6]) {
        const rawCity = inlineB2bAddr[6].trim();
        out.city = rawCity === rawCity.toUpperCase() ? toTitlePt(rawCity) : rawCity;
      }
      if (inlineB2bAddr[7]) {
        out.state = inlineB2bAddr[7].trim().toUpperCase();
      }
      out.found = true;
    }
  }

  // 2. Campos rotulados individuais (fallback ou complemento)
  if (!out.address) {
    const addrMatch = sectionText.match(
      /(?:Endere[cç]o(?:\s+da\s+Empresa|\s+do\s+Tomador|\s+para\s+Faturamento)?|Logradouro)\s*[:\-]+\s*([^\n|]+)/i
    );
    if (addrMatch) {
      const rawAddr = cleanB2bFieldValue(addrMatch[1]);
      if (rawAddr && !/pelinca/i.test(rawAddr)) {
        const parts = rawAddr.match(/^([^,]+?)(?:,\s*(?:n[º°.]?\s*)?(\d+[A-Za-z0-9/-]*|S\/N))?(?:\s*[-,]\s*(.+))?$/i);
        out.address = (parts ? parts[1] : rawAddr).trim();
        if (parts?.[2]) out.number = parts[2].trim();
        if (parts?.[3] && !out.neighborhood) {
          const tail = parts[3].trim();
          if (!/^(?:0|Bairro)/i.test(tail)) out.neighborhood = tail;
        }
        out.found = true;
      }
    }
  }

  if (!out.neighborhood) {
    const bMatch = sectionText.match(/Bairro\s*[:\-]+\s*([^\n|,;]+)/i);
    if (bMatch) {
      const bVal = cleanB2bFieldValue(bMatch[1]);
      out.neighborhood = bVal === bVal.toUpperCase() ? toTitlePt(bVal) : bVal;
    }
  }

  if (!out.cep) {
    const cMatch = sectionText.match(/CEP\s*[:\-]*\s*(\d{5}-?\d{3}|\d{7,8})\b/i);
    if (cMatch) {
      out.cep = cMatch[1].replace(/\D/g, "");
    }
  }

  if (!out.city) {
    const csMatch = sectionText.match(
      /(?:Cidade|Munic[ií]pio)\s*[:\-]+\s*([A-Za-zÀ-ÿ\s'.-]+?)(?:\s*[/\-]\s*([A-Z]{2}))?(?=\s*(?:\n|\||CEP|CNPJ|$))/i
    );
    if (csMatch) {
      const cVal = cleanB2bFieldValue(csMatch[1]);
      out.city = cVal === cVal.toUpperCase() ? toTitlePt(cVal) : cVal;
      if (csMatch[2] && !out.state) out.state = csMatch[2].trim().toUpperCase();
    }
  }

  if (!out.state) {
    const ufMatch = sectionText.match(/\b(?:UF|Estado)\s*[:\-]+\s*([A-Z]{2})\b/i);
    if (ufMatch) out.state = ufMatch[1].trim().toUpperCase();
  }

  // Enriquecimento de UF, IBGE e normalização de CEP truncado de 7 dígitos (ex: "0556000" em São Paulo -> "05560000")
  const cityHit = out.city ? KNOWN_CITY_UF_IBGE[normCityKey(out.city)] : null;
  if (cityHit) {
    out.city = cityHit.city;
    if (!out.state) out.state = cityHit.uf;
    if (!out.ibgeCode) out.ibgeCode = cityHit.ibge;
  }

  if (out.cep.length === 7) {
    if (out.state === "SP" || cityHit?.uf === "SP") {
      out.cep = out.cep.startsWith("0") ? `${out.cep}0` : `0${out.cep}`;
    } else {
      out.cep = `${out.cep}0`;
    }
  }

  return out;
}

export function parseB2bVoucherText(input = {}, htmlArg = "", subjectArg = "") {
  const extraMeta =
    typeof subjectArg === "object" && subjectArg !== null ? subjectArg : {};
  const opts =
    typeof input === "string"
      ? {
          rawText: input,
          htmlText: htmlArg || "",
          subject: typeof subjectArg === "string" ? subjectArg : (extraMeta.subject || ""),
          ...extraMeta
        }
      : (input || {});
  const rawText = opts.rawText || opts.text || "";
  const htmlText = opts.htmlText || opts.html || htmlArg || "";
  const subject = opts.subject || (typeof subjectArg === "string" ? subjectArg : "") || "";
  const headerAgencyEmails = extractHeaderAgencyEmails(
    opts.replyTo,
    opts.cc,
    opts.fromEmail || opts.fromAddress || opts.from
  );
  const combinedHtml = String(htmlText || "");
  const structuredHtmlLines = htmlToStructuredLines(combinedHtml);
  const cleanText = [structuredHtmlLines, String(rawText || "").replace(/\r/g, "\n")]
    .filter(Boolean)
    .join("\n");
  const fullScan = `${subject || ""}\n${cleanText}`;

  const dmyToIso = (dmy) => {
    const m = String(dmy || "").match(/(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})/);
    return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
  };

  const formatGuestName = (str = "") =>
    String(str || "")
      .trim()
      .toLowerCase()
      .replace(/(?:^|\s)\S/g, a => a.toUpperCase())
      .replace(/\b(De|Da|Do|Dos|Das|E)\b/g, m => m.toLowerCase());

  const formatCnpj = (str = "") => {
    const digits = String(str || "").replace(/\D/g, "");
    if (digits.length === 14) {
      return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
    }
    return str ? String(str).trim() : "";
  };

  const formatPhone = (str = "") => {
    return String(str || "")
      .replace(/[^\d+()-\s/]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  // 1. Número da Reserva B2B e RLOC
  const resNumMatch =
    fullScan.match(/Confirma[cç][aã]o\s+(?:d[ae]\s+)?(?:Reserva\s*)?[\s:\-#]*(\d{7,10})/i) ||
    fullScan.match(/N[uú°º]?(?:mero)?\s+d[ae]\s+(?:Reserva|Confirma[cç][aã]o)\s*[\s:\-#]*(\d{7,10})/i) ||
    fullScan.match(/Reserva(?:\s+B2B)?\s*[\s:\-#]+(\d{7,10})/i) ||
    fullScan.match(/C[oó]d(?:igo)?\.?\s+Reserva\s*[\s:\-#]*(\d{7,10})/i) ||
    fullScan.match(/\b(25\d{6})\b/);
  const b2bReservationNumber = resNumMatch ? resNumMatch[1].trim() : "";

  const rlocMatch =
    fullScan.match(/(?:RLOC|Localizador(?:\s+da\s+Reserva)?)\s*[\s:\-#]+([A-Z0-9]{5,12})/i);
  const b2bLocatorRloc = rlocMatch ? rlocMatch[1].trim().toUpperCase() : b2bReservationNumber;

  // 2. Link do Voucher OTA_WS e Link de Conciliação
  const voucherUrlMatch =
    opts.voucherUrl ||
    opts.url ||
    combinedHtml.match(/https?:\/\/portal\.b2breservas\.com\.br\/content\/conf_reserva\.php\?cd_reserva=[^\s"'<>]+/i)?.[0] ||
    fullScan.match(/https?:\/\/portal\.b2breservas\.com\.br\/content\/conf_reserva\.php\?cd_reserva=[^\s"'<>]+/i)?.[0] ||
    combinedHtml.match(/https?:\/\/[^\s"'<>]+\/(?:voucher|conf_reserva|ordem_hospedagem|reserva\/voucher)[^\s"'<>]*/i)?.[0] ||
    fullScan.match(/https?:\/\/[^\s"'<>]+\/(?:voucher|conf_reserva|ordem_hospedagem|reserva\/voucher)[^\s"'<>]*/i)?.[0] ||
    fullScan.match(/(?:Voucher|Link(?:\s+do\s+Voucher)?|Acesse(?:\s+o\s+voucher)?|Ver\s+Reserva)\s*[:\-]?\s*(https?:\/\/[^\s"'<>]+)/i)?.[1] ||
    combinedHtml.match(/<a\s+[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>(?:[^<]*(?:voucher|visualizar\s+voucher|ver\s+reserva|acessar\s+voucher)[^<]*)<\/a>/i)?.[1] ||
    "";
  const voucherUrl = voucherUrlMatch ? String(voucherUrlMatch).replace(/&amp;/g, "&") : "";

  const conciliationUrlMatch =
    combinedHtml.match(/https?:\/\/portal\.b2breservas\.com\.br\/index\.php\?ds_destino=reserva\/conciliacao\/reserva_conciliacao\.php[^\s"'<>]+/i) ||
    fullScan.match(/https?:\/\/portal\.b2breservas\.com\.br\/index\.php\?ds_destino=reserva\/conciliacao\/reserva_conciliacao\.php[^\s"'<>]+/i);
  const b2bConciliationUrl = conciliationUrlMatch ? conciliationUrlMatch[0].replace(/&amp;/g, "&") : "";

  const b2bOriginType =
    voucherUrl || /Confirmacao\s+da\s+Reserva\s*:/i.test(subject) || /\bOTA_WS\b/i.test(fullScan)
      ? "OTA_WS"
      : "BOOKING_WS";

  // 3. Hóspede
  let guestName = "";
  const subjGuestMatch =
    String(subject || "").match(/\(([^/)]+)\/([^)]+)\)/) ||
    fullScan.match(/Confirma[çc][ãa\ufffd?]?o\s+d[ae]\s+Reserva\s*[:\-]*\s*\d+\s*-\s*\(([^/)]+)\/([^)]+)\)/i);
  if (subjGuestMatch) {
    const part1 = subjGuestMatch[1].trim();
    const part2 = subjGuestMatch[2].trim();
    // Se a segunda parte tiver preposição (DA/DE/DO/DOS) ou múltiplos sobrenomes enquanto a primeira é nome, preserva part1 + part2
    if (/\b(?:DE|DA|DO|DOS|DAS)\b/i.test(part2) && !/\b(?:DE|DA|DO|DOS|DAS)\b/i.test(part1)) {
      guestName = `${part1} ${part2}`.replace(/\s+/g, " ").trim();
    } else {
      guestName = `${part2} ${part1}`.replace(/\s+/g, " ").trim();
    }
  }
  const bodyGuestParenMatch = fullScan.match(
    /(?:H[oóô\ufffd?]?spedes?|Hospedes?)(?:\(s\))?(?:\s*\([^)]*\))?\s*[:\-]+\s*\(([^)]+)\)/i
  );
  const bodyGuestMatch =
    bodyGuestParenMatch ||
    fullScan.match(/(?:H[oóô\ufffd?]?spedes?|Hospedes?)(?:\(s\))?(?:\s*\([^)]*\))?\s*[:\-]+\s*([^\n|]+)/i) ||
    fullScan.match(/Passageiros?(?:\(s\))?\s*[:\-]+\s*([^\n|]+)/i) ||
    fullScan.match(/Pax\s*[:\-]+\s*([^\n|]+)/i);
  if (bodyGuestMatch) {
    const rawPax = cleanB2bFieldValue(bodyGuestMatch[1].replace(/\s+/g, " "))
      .replace(/^\(+|\)+$/g, "")
      .replace(/\s*\(\d*\s*ADT\).*$/i, "")
      .trim();
    if (rawPax.includes("/")) {
      const [last, first] = rawPax.split("/").map(s => s.replace(/^\(+|\)+$/g, "").trim());
      if (first && last) guestName = `${first} ${last}`.replace(/\s+/g, " ").trim();
    } else if (rawPax && rawPax.length >= 4) {
      guestName = rawPax;
    }
  }
  if (guestName && guestName === guestName.toUpperCase() && guestName.length > 3) {
    guestName = formatGuestName(guestName);
  }

  // 4. Datas Check-in / Check-out (DD/MM/YYYY, Período, até, -, ou datas separadas)
  let checkinDate = "";
  let checkoutDate = "";
  const checkinMatch =
    fullScan.match(/(?:Check-?in|Data\s+(?:d[ae]\s+)?Entrada|Entrada|Chegada)\s*[:\-]*\s*(\d{1,2}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{4})/i);
  const checkoutMatch =
    fullScan.match(/(?:Check-?out|Data\s+(?:d[ae]\s+)?Sa[ií\ufffd?]?da|Sa[ií\ufffd?]?da|Partida)\s*[:\-]*\s*(\d{1,2}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{4})/i);
  if (checkinMatch) checkinDate = dmyToIso(checkinMatch[1]);
  if (checkoutMatch) checkoutDate = dmyToIso(checkoutMatch[1]);

  if (!checkinDate || !checkoutDate) {
    // Formato com data completa: DD/MM/YYYY a/até/- DD/MM/YYYY
    const periodFullMatch = fullScan.match(
      /(?:Per[ií\ufffd?]?odo(?:\s+d[ae])?|Estadia(?:\s+d[ae])?)?\s*[:\-]*\s*(\d{1,2}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{4})\s*(?:a|at[eé]|[-–—])\s*(\d{1,2}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{4})/i
    );
    if (periodFullMatch) {
      if (!checkinDate) checkinDate = dmyToIso(periodFullMatch[1]);
      if (!checkoutDate) checkoutDate = dmyToIso(periodFullMatch[2]);
    }
  }

  if (!checkinDate || !checkoutDate) {
    // Formato abreviado de período: DD/MM a DD/MM/YYYY
    const periodShortMatch = fullScan.match(
      /(?:Per[ií\ufffd?]?odo(?:\s+d[ae])?|Estadia(?:\s+d[ae])?)?\s*[:\-]*\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*(?:a|at[eé]|[-–—])\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})/i
    );
    if (periodShortMatch) {
      const year = Number(periodShortMatch[5]);
      const m1 = String(periodShortMatch[2]).padStart(2, "0");
      const d1 = String(periodShortMatch[1]).padStart(2, "0");
      const m2 = String(periodShortMatch[4]).padStart(2, "0");
      const d2 = String(periodShortMatch[3]).padStart(2, "0");
      const y1 = Number(m1) > Number(m2) ? year - 1 : year;
      if (!checkinDate) checkinDate = `${y1}-${m1}-${d1}`;
      if (!checkoutDate) checkoutDate = `${year}-${m2}-${d2}`;
    }
  }

  if (!checkinDate || !checkoutDate) {
    // Formato com nome de mês (ex: 26/out - 30/out)
    const periodMatch = fullScan.match(
      /Per[ií\ufffd?]?odo\s*[:\-]*\s*(\d{1,2})\s*\/\s*([a-zç]{3})\s*-\s*(\d{1,2})\s*\/\s*([a-zç]{3})/i
    );
    if (periodMatch) {
      const monthMap = {
        jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
        jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12"
      };
      const baseYear = checkinDate ? Number(checkinDate.slice(0, 4)) : new Date().getFullYear();
      const d1 = String(periodMatch[1]).padStart(2, "0");
      const m1 = monthMap[periodMatch[2].toLowerCase()] || "01";
      const d2 = String(periodMatch[3]).padStart(2, "0");
      const m2 = monthMap[periodMatch[4].toLowerCase()] || m1;
      const y2 = Number(m2) < Number(m1) ? baseYear + 1 : baseYear;
      if (!checkinDate) checkinDate = `${baseYear}-${m1}-${d1}`;
      if (!checkoutDate) checkoutDate = `${y2}-${m2}-${d2}`;
    }
  }

  // Extração explícita de quantidade de diárias / noites
  let explicitNights = 0;
  const nightsMatch =
    fullScan.match(/(?:Total\s+de\s+|Qtd\.?\s+de\s+|Qtd\.?\s+|N[uú\ufffd?]?mero\s+de\s+)?(?:Di[aá\ufffd?]?rias?|Noites?)\s*[:\-#]+\s*(\d+)\b/i) ||
    fullScan.match(/(?<!(?:R\$|BRL|\$)\s*)\b(\d{1,3})\s+(?:di[aá\ufffd?]?ria\(?s?\)?|noite\(?s?\)?)\b/i) ||
    fullScan.match(/(?:Di[aá\ufffd?]?rias?|Noites?)\s*[:\-#]*\s*(\d+)\b/i);
  if (nightsMatch) {
    const parsedN = parseInt(nightsMatch[1], 10);
    if (parsedN > 0 && parsedN <= 365) {
      explicitNights = parsedN;
    }
  }

  // 5. Tarifa, Comissão, Valor Total e Café da Manhã
  const hasBreakfast = !/\bSEM\s+CAF[EÉ\ufffd?]/i.test(fullScan);
  const commPctMatch = fullScan.match(/(?:Comiss[aã\ufffd?]?o|COMISSIONAD[AO])[\s:\-(]*(\d+(?:[.,]\d+)?)\s*%/i);
  const hasExplicitCommKeyword = /\bCOMISSIONAD[AO]\b/i.test(fullScan);
  const hasExplicitNetKeyword =
    /\b(?:TARIFA\s+NET|NET\s+RATE|POL[IÍ]TICA\s*:\s*NET)\b/i.test(fullScan) ||
    /(?:\bTarifa\b|\bComiss[aã\ufffd?]?o\b)[^\n]{0,30}\bNET\b/i.test(fullScan);
  const _explicitRatePolicy = Boolean(commPctMatch || hasExplicitCommKeyword || hasExplicitNetKeyword);
  let b2bCommissionPct = commPctMatch ? Number(String(commPctMatch[1]).replace(",", ".")) : 0;
  if (!commPctMatch && hasExplicitCommKeyword) {
    b2bCommissionPct = 12;
  }
  const b2bRatePolicy = b2bCommissionPct > 0 || hasExplicitCommKeyword ? "COMISSIONADA" : "NET";

  const totalMatch =
    fullScan.match(/(?:Valor\s+Total|Total(?:\s+da\s+Reserva|\s+Geral|\s+dos\s+Servi[cç]os)?|Total(?:\s+em\s+(?:R\$|BRL))?)[\s:\-]*(?:R\$|BRL)\s*([\d.,]+)/i) ||
    fullScan.match(/\bTotal\s*[:\-]*\s*(?:R\$|BRL)\s*([\d.,]+)/i);
  let totalAmount = totalMatch ? parseB2bMoney(totalMatch[1]) : 0;

  const rateMatch =
    fullScan.match(/(?:Di[aá\ufffd?]?ria(?:\s+M[eé\ufffd?]?dia)?|Valor\s+(?:m[eé\ufffd?]?dio\s+)?da\s+Di[aá\ufffd?]?ria(?:\s+para\s+o\s+per[ií\ufffd?]?odo)?|Tarifa(?:\s+Di[aá\ufffd?]?ria)?)[\s:\-]*(?:R\$|BRL)\s*([\d.,]+)/i) ||
    fullScan.match(/(?:R\$|BRL)\s*(280[.,]00|300[.,]00|313[.,]00|347[.,]00|400[.,]00)/i);
  let dailyRate = 0;
  if (rateMatch) {
    dailyRate = parseB2bMoney(rateMatch[1]);
  }

  // Reconciliação determinística de noites, checkout, diária e valor total
  let nights = 0;
  let dateNights = 0;
  if (checkinDate && checkoutDate) {
    dateNights = Math.round(
      (new Date(`${checkoutDate}T12:00:00Z`).getTime() - new Date(`${checkinDate}T12:00:00Z`).getTime()) / 86400000
    );
  }

  let mathNights = 0;
  if (dailyRate > 0 && totalAmount > 0) {
    const rawN = Math.round(totalAmount / dailyRate);
    if (rawN >= 1 && Math.abs(totalAmount - dailyRate * rawN) < 0.05 * dailyRate) {
      mathNights = rawN;
    }
  }

  const _explicitCheckout = Boolean(dateNights > 0 || explicitNights > 0 || mathNights > 0);
  if (dateNights > 0) {
    nights = dateNights;
  } else if (explicitNights > 0) {
    nights = explicitNights;
  } else if (mathNights > 0) {
    nights = mathNights;
  } else {
    nights = 1;
  }

  if (checkoutDate && checkinDate && checkoutDate <= checkinDate) {
    checkoutDate = new Date(new Date(`${checkinDate}T12:00:00Z`).getTime() + (nights || 1) * 86400000).toISOString().slice(0, 10);
  }

  if (!checkoutDate && checkinDate && nights > 0) {
    checkoutDate = new Date(new Date(`${checkinDate}T12:00:00Z`).getTime() + nights * 86400000).toISOString().slice(0, 10);
  }

  if (dailyRate === 0 && totalAmount > 0 && nights > 0) {
    dailyRate = +(totalAmount / nights).toFixed(2);
  } else if (totalAmount === 0 && dailyRate > 0 && nights > 0) {
    totalAmount = +(dailyRate * nights).toFixed(2);
  }

  // Bloco de cabeçalho superior do PDF da B2B Reservas ("Unidade: ... Para: HOTEL CORPFLATS")
  const b2bPdfHeaderBlockMatch = fullScan.match(
    /(?:^|\n)\s*Unidade\s*[:\-]+\s*[^\r\n]+[\s\S]{1,800}?(?=(?:\n\s*Para\s*[:\-]|\n\s*DADOS\s+DA\s+HOSPEDAGEM|$))/i
  );
  const b2bPdfHeaderBlock = b2bPdfHeaderBlockMatch ? b2bPdfHeaderBlockMatch[0] : "";

  // Blocos completos de encaminhamento de documentação, instruções de envio e emissão de Nota Fiscal (sem truncamento de página)
  const docForwardMatch = fullScan.match(
    /Dados\s+para\s+encaminhamento\s+da\s+documenta[cç][aã\ufffd?]?o[^\r\n]*\n+\s*([^\r\n]+)/i
  );
  const docForwardLine = docForwardMatch ? cleanB2bFieldValue(docForwardMatch[1]) : "";
  const docForwardSectionMatch = fullScan.match(
    /Dados\s+para\s+encaminhamento\s+da\s+documenta[cç][aã\ufffd?]?o[\s\S]*?(?=(?:Dados\s+para\s+emiss[aã\ufffd?]?o\s+d[aeo]\s+nota\s+fiscal|_{5,}|Powered\s+by|$))/i
  );
  const docForwardSectionText = docForwardSectionMatch ? docForwardSectionMatch[0] : "";

  const instrucoesEnvioDocMatch = fullScan.match(
    /Instru[cç][oõ\ufffd?]?es\s+para\s+envio\s+da\s+documenta[cç][aã\ufffd?]?o[\s\S]*?(?=(?:Dados\s+para\s+emiss[aã\ufffd?]?o\s+d[aeo]\s+nota\s+fiscal|_{5,}|Powered\s+by|$))/i
  );
  const instrucoesEnvioDocText = instrucoesEnvioDocMatch ? instrucoesEnvioDocMatch[0] : "";

  const nfSectionMatch = fullScan.match(
    /(?:Dados\s+para\s+emiss[aã\ufffd?]?o\s+d[aeo]\s+nota\s+fiscal|DADOS\s+PARA\s+NOTA\s+FISCAL)[\s\S]*?(?=(?:_{5,}|Powered\s+by|$))/i
  );
  const nfSectionText = nfSectionMatch ? nfSectionMatch[0] : "";

  // Regras numeradas de faturamento na página 2 dos vouchers B2B ("1. Emitir uma nota fiscal para cada UH...")
  const numberedFiscalRulesMatch = fullScan.match(
    /1\.\s*Emitir\s+uma\s+nota\s+fiscal\s+para\s+cada\s+UH[\s\S]*?(?=(?:Dados\s+para\s+encaminhamento|Instru[cç][oõ\ufffd?]?es\s+para\s+envio|Dados\s+para\s+emiss[aã\ufffd?]?o|Powered\s+by|$))/i
  );
  const numberedFiscalRulesText = numberedFiscalRulesMatch ? numberedFiscalRulesMatch[0].replace(/\s+/g, " ").trim() : "";

  const isFieldLabelOnly = (val = "") =>
    /^(?:Telefone|Tel|Fone|Celular|WhatsApp|E-?mail|CNPJ|CPF|Unidade|Filial|Ponto\s+de\s+Venda|Empresa|Cliente|Nome|Raz[aã]o\s+Social|H[oó\ufffd?]?spede|Passageiro|Endere[cç]o|Cidade|CEP|Per[ií\ufffd?]?odo|Check-?in|Check-?out|Entrada|Sa[ií\ufffd?]?da|Tarifa|Valor|Total|Dados\s+(?:d[aeo]|para)|Instru[cç][oõ\ufffd?]?es|Enviar\s+notas)/i.test(
      String(val || "").trim()
    );

  // Extração dedicada do bloco "Reservado por" (Solicitante real da reserva)
  const reservadoPorInfo = extractReservadoPorInfo(fullScan);

  // 6. Agência, Unidade POS, Emissor, Empresa e Centro de Custo (suporta rótulo + valor na mesma linha ou na linha seguinte, e múltiplos blocos Agência)
  const isTechnicalIntegratorAgencyPlaceholder = (val = "") =>
    /^(?:sistema[_\s-]*integrador|integrador|b2b[_\s-]*reservas|portal[_\s-]*b2b|ota[_\s-]*ws|booking[_\s-]*ws|n\/?a|nao\s+informado|não\s+informado|-+)$/i.test(
      String(val || "").trim()
    );

  const extractBestAgencyName = (scanText) => {
    const candidates = [];
    const patterns = [
      {
        qualified: true,
        re: /(?<!Dados\s+da\s+)\b(?:Ag[eê\ufffd?]?ncia|Agencia)\s+(?:Solicitante|de\s+Viagens|Emissora)\s*[:\-]+[^\S\r\n]*([^\r\n]+)/gi
      },
      {
        qualified: true,
        re: /(?:^|\n)[^\S\r\n]*(?:Ag[eê\ufffd?]?ncia|Agencia)\s+(?:Solicitante|de\s+Viagens|Emissora)\s*[:\-]*\s*\n+\s*([^\r\n:]{3,90})/gi
      },
      {
        qualified: false,
        re: /(?:^|\n)[^\S\r\n]*(?:Ag[eê\ufffd?]?ncia|Agencia)\s*[:\-]+[^\S\r\n]*([^\r\n]+)/gi
      },
      {
        qualified: false,
        re: /(?<!Dados\s+da\s+)(?<!CNPJ\s+)(?<!CNPJ\s+da\s+)(?<!Telefone\s+)(?<!Telefone\s+da\s+)(?<!E-?mail\s+)(?<!E-?mail\s+da\s+)\b(?:Ag[eê\ufffd?]?ncia|Agencia)\s*[:\-]+[^\S\r\n]*([^\r\n]+)/gi
      },
      {
        qualified: false,
        re: /(?:^|\n)[^\S\r\n]*(?:Ag[eê\ufffd?]?ncia|Agencia)\s*[:\-]*\s*\n+\s*([^\r\n:]{3,90})/gi
      }
    ];
    for (const { qualified, re } of patterns) {
      for (const m of scanText.matchAll(re)) {
        let cleaned = cleanB2bFieldValue(m[1] || "");
        cleaned = cleaned
          .replace(/^(?:Ag[eê\ufffd?]?ncia|Agencia)(?:\s+(?:Solicitante|de\s+Viagens|Emissora))?\s*[:\-]+\s*/i, "")
          .trim();
        if (!cleaned || isFieldLabelOnly(cleaned) || isTechnicalIntegratorAgencyPlaceholder(cleaned)) {
          continue;
        }
        candidates.push({ value: cleaned, qualified });
      }
    }
    const qualifiedHit = candidates.find(c => c.qualified);
    return (qualifiedHit || candidates[0])?.value || "";
  };

  let agencyName = extractBestAgencyName(fullScan);
  const posMatch = fullScan.match(/(?:Unidade(?:\s*[\/\-]?\s*POS)?|Filial|Ponto\s+de\s+Venda)\s*[:\-]+[^\S\r\n]*([^\r\n]+)/i);
  const agentLabelPattern =
    "(?:Emissor(?:\\(a\\))?|Agente(?:\\s+(?:Emissor|Solicitante|de\\s+Viagens|Respons[aá]vel))?|Consultor(?:\\(a\\))?(?:\\s+(?:de\\s+Viagens|Respons[aá]vel|Solicitante|Comercial|Corporativo))?|Atendente(?:\\s+Respons[aá]vel)?|Reservado\\s+por|Emitido\\s+por|Solicitante(?:\\s+da\\s+Reserva|\\s+Respons[aá]vel)?)";
  const agentSameLineMatch =
    fullScan.match(new RegExp(`(?:^|\\n)[^\\S\\r\\n]*${agentLabelPattern}\\s*[:\\-]+[^\\S\\r\\n]*([^\\r\\n]+)`, "i")) ||
    fullScan.match(
      new RegExp(
        `(?<!(?:Ag[eê\\ufffd?]?ncia|Agencia|Dados\\s+da\\s+Ag[eê\\ufffd?]?ncia|Dados\\s+do|CNPJ|Empresa|Telefone|Tel|Fone|Celular|WhatsApp|Contato|E-?mail)\\s+)\\b${agentLabelPattern}\\s*[:\\-]+[^\\S\\r\\n]*([^\\r\\n]+)`,
        "i"
      )
    );
  const agentNextLineMatch =
    fullScan.match(new RegExp(`(?:^|\\n)[^\\S\\r\\n]*${agentLabelPattern}\\s*[:\\-]*\\s*\\n+\\s*([^\\r\\n:]{2,70})`, "i"));
  const nfExplicitCompanyMatch = nfSectionText.match(/(?:Raz[aã\ufffd?]?o\s+Social|Nome(?:\s+Empresarial)?|Cliente)\s*[:\-]+[^\S\r\n]*([^\r\n]+)/i);
  const companyMatch =
    nfExplicitCompanyMatch ||
    fullScan.match(/Empresa(?:\s+Cliente)?\s*[:\-]+[^\S\r\n]*([^\r\n]+)/i) ||
    docForwardSectionText.match(/(?:^|\n)\s*Cliente\s*[:\-]+[^\S\r\n]*([^\r\n]+)/i) ||
    fullScan.match(/(?:^|\n)\s*Cliente\s*[:\-]+[^\S\r\n]*([^\r\n]+)/i);
  const costCenterMatch = fullScan.match(/(?:Centro\s+de\s+Custo|Cliente\s+Id)\s*[:\-]+[^\S\r\n]*([A-Za-z0-9._-]+)/i);

  const agencyPosUnit = posMatch ? cleanB2bFieldValue(posMatch[1]) : "";
  let agencyAgentName = reservadoPorInfo.name || (agentSameLineMatch ? cleanB2bFieldValue(agentSameLineMatch[1]) : "");
  if (agencyAgentName && agencyAgentName.includes("@")) {
    agencyAgentName = agencyAgentName.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "").replace(/^[:\-\s|/]+|[:\-\s|/]+$/g, "").trim();
  }
  if ((!agencyAgentName || isFieldLabelOnly(agencyAgentName)) && agentNextLineMatch) {
    const nextLineVal = cleanB2bFieldValue(agentNextLineMatch[1]);
    if (nextLineVal && !isFieldLabelOnly(nextLineVal) && !nextLineVal.includes("@")) {
      agencyAgentName = nextLineVal;
    }
  }
  if (isFieldLabelOnly(agencyAgentName)) {
    agencyAgentName = "";
  }
  if (agencyAgentName && agencyName && agencyAgentName.toLowerCase() === agencyName.toLowerCase()) {
    agencyAgentName = "";
  }
  // Se o emissor técnico for ARGO.GLOBALIS mas houver nome real em "Reservado por", prioriza o nome real; caso contrário preserva o emissor
  const rawTechEmissor = agentSameLineMatch ? cleanB2bFieldValue(agentSameLineMatch[1]) : "";
  if (
    !agencyAgentName &&
    rawTechEmissor &&
    !isFieldLabelOnly(rawTechEmissor) &&
    (!agencyName || rawTechEmissor.toLowerCase() !== agencyName.toLowerCase())
  ) {
    agencyAgentName = rawTechEmissor;
  }

  let companyName = companyMatch ? cleanB2bFieldValue(companyMatch[1]) : "";

  if (!companyName || /^CLIENTES\s*-\s*NET$/i.test(companyName)) {
    const nfDprMatch = nfSectionText.match(/DADOS\s+PARA\s+NOTA\s+FISCAL\s*:\s*\n+\s*([^\r\n]+)/i);
    if (nfDprMatch) {
      companyName = cleanB2bFieldValue(nfDprMatch[1]);
    }
  }

  // Inteligência para formatos BOOKING_WS e OTA_WS da B2B Reservas (separação estrita Ponta 2 Agência vs Ponta 3 Empresa)
  const knownTmcRegex = /\b(PAYTRACK|TRIPSERVICE|COPASTUR|AVIPAM|OPUS(?:\s+VIAGENS)?|KONTIK|VOETUR|FLYTOUR|GLOBALIS|ALATUR|BCD|CVC|REXTUR|RESERVA\s+FACIL|ONFLY|VOLL)\b/i;
  if (!agencyName) {
    if (companyName.includes(" - ")) {
      const [part1, ...rest] = companyName.split(" - ").map(s => s.trim());
      if (knownTmcRegex.test(part1)) {
        agencyName = part1.charAt(0).toUpperCase() + part1.slice(1).toLowerCase();
        companyName = rest.join(" - ").trim() || companyName;
      }
    } else if (
      knownTmcRegex.test(companyName) ||
      knownTmcRegex.test(agencyAgentName) ||
      knownTmcRegex.test(rawTechEmissor) ||
      knownTmcRegex.test(agencyPosUnit) ||
      knownTmcRegex.test(docForwardLine) ||
      knownTmcRegex.test(reservadoPorInfo.email) ||
      /@globalis\.com\.br/i.test(fullScan)
    ) {
      const tmcMatch =
        companyName.match(knownTmcRegex) ||
        agencyAgentName.match(knownTmcRegex) ||
        rawTechEmissor.match(knownTmcRegex) ||
        agencyPosUnit.match(knownTmcRegex) ||
        docForwardLine.match(knownTmcRegex) ||
        reservadoPorInfo.email.match(knownTmcRegex) ||
        fullScan.match(/\b(GLOBALIS)\b/i);
      if (tmcMatch) {
        const rawTmc = tmcMatch[1].trim().toUpperCase();
        if (rawTmc === "GLOBALIS") {
          agencyName = "Globalis Viagens";
        } else if (rawTmc === "FLYTOUR") {
          agencyName = /RIOCENTRO/i.test(agencyPosUnit || docForwardLine)
            ? "Flytour Riocentro"
            : /CURITIBA|DPR\s+TURISMO/i.test(agencyPosUnit || docForwardLine || companyName)
              ? "Flytour Curitiba (DPR Turismo)"
              : "Flytour";
        } else {
          agencyName = rawTmc.charAt(0).toUpperCase() + rawTmc.slice(1).toLowerCase();
        }
      }
      if (agencyPosUnit && companyName.toUpperCase() === agencyName.toUpperCase()) {
        companyName =
          agencyPosUnit.toUpperCase() === "UNIAO QUIMICA"
            ? "União Química"
            : agencyPosUnit;
      }
    } else if (/^LACTALIS\s+DO\s+BRASIL$/i.test(agencyPosUnit) && /^WEBSERVICE$/i.test(agencyAgentName)) {
      agencyName = "Opus Viagens";
    } else if (/DPR\s+TURISMO/i.test(agencyPosUnit) || /faturamentodpr@flytour\.com\.br/i.test(fullScan)) {
      agencyName = "Flytour Curitiba (DPR Turismo)";
    }
  }

  // Normalização de empresas contratantes conhecidas em vouchers B2B
  if (
    (/^TRIDENT\s*-\s*FLYTOUR/i.test(agencyPosUnit) && (!companyName || /^TURICENTER\s+TURISMO/i.test(companyName))) ||
    /^TRIDENT\s+ENERGY(?:\s+DO\s+BRASIL)?(?:\s+LTDA)?$/i.test(companyName)
  ) {
    companyName = "Trident Energy do Brasil";
  } else if (/^BIMBO(?:\s+DO\s+BRASIL(?:\s+LTDA)?)?$/i.test(companyName) || (!companyName && /\bBIMBO\b/i.test(fullScan) && /GLOBALIS/i.test(fullScan))) {
    companyName = "Bimbo do Brasil Ltda";
  } else if (/^CARREFOUR\s+COM[EÉ]RCIO\s+E\s+IND[UÚ]STRIA(?:\s+LTDA)?$/i.test(companyName)) {
    companyName = "Carrefour Comércio e Indústria Ltda";
  }

  // Blocos estritos de Agência / Solicitante (NÃO inclui seção de envio de NF/documentação para jamais contaminar agencyAgentEmail!)
  const strictAgencyBlocksList = [];
  if (b2bPdfHeaderBlock) strictAgencyBlocksList.push(b2bPdfHeaderBlock);
  for (const m of fullScan.matchAll(
    /(?:Dados\s+(?:da\s+)?Ag[eê\ufffd?]?ncia|Dados\s+do\s+Solicitante|(?:^|\n)\s*Ag[eê\ufffd?]?ncia(?:\s+(?:Solicitante|de\s+Viagens|Emissora))?\s*[:\-\n]|Solicitante\s*:)[\s\S]{1,650}?(?=(?:Dados\s+(?:da\s+)?Empresa|Dados\s+para\s+encaminhamento|Instru[cç][oõ\ufffd?]?es\s+para\s+envio|Dados\s+para\s+emiss[aã\ufffd?]?o|Instru[cç][oõ\ufffd?]?es\s+(?:de|para)\s+Faturamento|FORMA\s+DE\s+PAGAMENTO|Tarifa\s*:|Di[aá\ufffd?]?ria\s+M[eé\ufffd?]?dia|$))/gi
  )) {
    if (m[0]) strictAgencyBlocksList.push(m[0]);
  }

  if (!agencyName && docForwardLine && !isFieldLabelOnly(docForwardLine) && !docForwardLine.includes("@")) {
    agencyName = docForwardLine;
  }

  // Extração determinística de CNPJs (Agência vs Empresa)
  const cnpjPattern = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/;
  let agencyCnpj = "";
  const directAgencyCnpjMatch =
    fullScan.match(/(?:CNPJ\s+(?:da\s+)?Ag[eê\ufffd?]?ncia|CNPJ\s+Solicitante|Ag[eê\ufffd?]?ncia[^\n]*\bCNPJ)\s*[:\-]?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i) ||
    b2bPdfHeaderBlock.match(/\bCNPJ\s*[:\-]?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i);
  if (directAgencyCnpjMatch) {
    agencyCnpj = formatCnpj(directAgencyCnpjMatch[1]);
  } else {
    for (const blk of strictAgencyBlocksList) {
      const blockCnpj = blk.match(cnpjPattern);
      if (blockCnpj) {
        agencyCnpj = formatCnpj(blockCnpj[0]);
        break;
      }
    }
  }

  let companyCnpj = "";
  const directCompanyCnpjMatch =
    nfSectionText.match(/(?:Cnpj\s*\/\s*CPF|CNPJ)\s*[:\-]?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i) ||
    fullScan.match(/(?:CNPJ\s+(?:da\s+)?Empresa|CNPJ\s+Cliente|CNPJ\s+Faturamento|CNPJ\s+Tomador|Empresa[^\n]*\bCNPJ)\s*[:\-]?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i);
  if (directCompanyCnpjMatch) {
    companyCnpj = formatCnpj(directCompanyCnpjMatch[1]);
  } else {
    const companyBlockMatch = fullScan.match(/(?:Dados\s+(?:da\s+)?Empresa|Empresa(?:\s+Cliente)?|Faturad[ao]\s+Para|Tomador|Instru[cç][oõ\ufffd?]?es\s+(?:de|para)\s+Faturamento)[\s\S]{1,500}?(?=(?:H[oó\ufffd?]?spede|Passageiro|Tarifa|Di[aá\ufffd?]?ria|Total|Valores|Pol[ií\ufffd?]?tica|$))/i);
    if (companyBlockMatch) {
      const blockCnpj = companyBlockMatch[0].match(cnpjPattern);
      if (blockCnpj && (!agencyCnpj || formatCnpj(blockCnpj[0]) !== agencyCnpj)) {
        companyCnpj = formatCnpj(blockCnpj[0]);
      }
    }
  }

  // Se o CNPJ da agência ainda estiver vazio e a seção de encaminhamento trouxer um CNPJ diferente do tomador (ex: agência emissora), aproveita com segurança
  if (!agencyCnpj && docForwardSectionText) {
    const docBlkCnpj = docForwardSectionText.match(/(?:Cnpj\s*\/\s*CPF|CNPJ)\s*[:\-]?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i);
    if (docBlkCnpj) {
      const formattedDocCnpj = formatCnpj(docBlkCnpj[1]);
      if (!companyCnpj || formattedDocCnpj !== companyCnpj) {
        agencyCnpj = formattedDocCnpj;
      }
    }
  }

  // Fallback se houver CNPJs formatados no texto não capturados pelos blocos
  const allFoundCnpjs = Array.from(new Set((fullScan.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g) || []).map(formatCnpj)));
  if (!agencyCnpj && allFoundCnpjs.length > 0) {
    const unassigned = allFoundCnpjs.find(c => c !== companyCnpj);
    if (unassigned) {
      if (!directCompanyCnpjMatch) {
        agencyCnpj = unassigned;
      }
    } else if (!directCompanyCnpjMatch && !companyCnpj) {
      agencyCnpj = allFoundCnpjs[0];
    }
  }
  if (!companyCnpj && allFoundCnpjs.length > 0) {
    const unassigned = allFoundCnpjs.find(c => c !== agencyCnpj);
    if (unassigned) {
      if (!directAgencyCnpjMatch) {
        companyCnpj = unassigned;
      }
    } else if (!directAgencyCnpjMatch && !agencyCnpj) {
      companyCnpj = allFoundCnpjs[0];
    }
  }

  // Telefone da Agência / Solicitante (prioriza "Reservado por" e blocos estritos da agência)
  let agencyAgentPhone = reservadoPorInfo.phone || "";
  const explicitAgencyPhoneMatch =
    fullScan.match(/(?:Telefone|Tel|Fone|Celular|WhatsApp|Contato)\s+(?:da\s+)?Ag[eê\ufffd?]?ncia\s*[:\-\n]*\s*([+()\d\s\-\/\.]{8,35})/i) ||
    fullScan.match(/(?:Telefone|Tel|Fone|Celular|WhatsApp|Contato)\s+(?:do\s+Agente|do\s+Consultor|do\s+Emissor|do\s+Solicitante|Agente|Consultor|Emissor|Solicitante)\s*[:\-\n]*\s*([+()\d\s\-\/\.]{8,35})/i) ||
    fullScan.match(/Ag[eê\ufffd?]?ncia[^\n]*(?:Tel|Telefone|Fone|Celular|WhatsApp)\s*[:\-]?\s*([+()\d\s\-\/\.]{8,35})/i) ||
    fullScan.match(/(?:Agente|Consultor|Emissor)[^\n]*(?:Tel|Telefone|Fone|Celular|WhatsApp)\s*[:\-]?\s*([+()\d\s\-\/\.]{8,35})/i) ||
    b2bPdfHeaderBlock.match(/(?:Telefone|Tel|Fone|Celular|WhatsApp)\s*[:\-\n]+\s*([+()\d\s\-\/\.]{8,35})/i);
  if (!agencyAgentPhone && explicitAgencyPhoneMatch) {
    agencyAgentPhone = formatPhone(explicitAgencyPhoneMatch[1]);
  }
  if (!agencyAgentPhone) {
    for (const blk of strictAgencyBlocksList) {
      const labeledBlkPhone = blk.match(/(?:Telefone|Tel|Fone|Celular|WhatsApp|Contato)\s*[:\-\n]+\s*([+()\d\s\-\/\.]{8,35})/i);
      if (labeledBlkPhone) {
        const cand = formatPhone(labeledBlkPhone[1]);
        if (cand && cand.replace(/\D/g, "").length >= 10) {
          agencyAgentPhone = cand;
          break;
        }
      }
      const blockPhone = blk.match(/(?:Telefone|Tel|Fone|Celular|WhatsApp|Contato)?\s*[:\-]?\s*(\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4}(?:\s*[/e]\s*\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4})?)/i);
      if (blockPhone) {
        const cand = formatPhone(blockPhone[1]);
        if (cand && cand.replace(/\D/g, "").length >= 10) {
          agencyAgentPhone = cand;
          break;
        }
      }
    }
  }

  // 7. Cartão Virtual VCN, Bandeira Explícita & Token
  const cardMatch = fullScan.match(/\b((?:5\d{3,5}|4\d{3,5}|37\d{2,4})[xX*]{4,8}\d{4})\b/);
  const cardFinalMatch = fullScan.match(/Final\s*[:\-]?\s*(\d{4})\b/i);
  const vcnTokenMatch = fullScan.match(/(?:Token(?:\s+VCN)?|C[oó\ufffd?]?digo\s+VCN)\s*[:\-]?\s*([A-Z0-9]{5,12})\b/i);
  const explicitBrandMatch = fullScan.match(/\bBandeira\s*[:\-]+\s*([^\r\n]+)/i);
  let explicitBrand = "";
  if (explicitBrandMatch) {
    const rawB = cleanB2bFieldValue(explicitBrandMatch[1]).toUpperCase();
    if (rawB.includes("AMERICAN") || rawB.includes("AMEX")) explicitBrand = "American Express";
    else if (rawB.includes("VISA")) explicitBrand = "Visa";
    else if (rawB.includes("MASTER")) explicitBrand = "Mastercard";
    else if (rawB.includes("ELO")) explicitBrand = "Elo";
  }

  const b2bCardMasked = cardMatch
    ? cardMatch[1]
    : cardFinalMatch
      ? `**** **** **** ${cardFinalMatch[1]}`
      : "";
  const b2bCardBrand = b2bCardMasked.startsWith("37")
    ? "American Express"
    : b2bCardMasked.startsWith("4")
      ? "Visa"
      : b2bCardMasked
        ? "Mastercard"
        : explicitBrand;
  const b2bVcnToken = vcnTokenMatch ? vcnTokenMatch[1].trim().toUpperCase() : "";
  const b2bPaymentType = /FATURAD[AO]/i.test(fullScan) && !b2bCardMasked && !b2bVcnToken ? "FATURADO" : "VIRTUAL_CARD";

  // 8. Segregação Estrita de E-mails: Solicitante ("Reservado por") vs Envio de NFS-e (2 Camadas)
  let agencyAgentEmail = "";
  if (reservadoPorInfo.email && !isNonAgencySystemEmailAddress(reservadoPorInfo.email)) {
    agencyAgentEmail = reservadoPorInfo.email;
  }

  if (!agencyAgentEmail) {
    const explicitAgencyEmailMatch =
      fullScan.match(/(?:E-?mail\s+(?:do\s+)?(?:Solicitante|Agente|Consultor|Emissor|Atendente)|E-?mail\s+(?:da\s+)?Ag[eê\ufffd?]?ncia)\s*[:\-\n]*\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
      fullScan.match(/(?:Solicitante|Agente|Consultor|Emissor)[^\n]*\bE-?mail\s*[:\-]?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
      fullScan.match(/Ag[eê\ufffd?]?ncia[^\n]*\bE-?mail\s*[:\-]?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
      b2bPdfHeaderBlock.match(/\bE-?mail\s*[:\-\n]+\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (explicitAgencyEmailMatch && !isNonAgencySystemEmailAddress(explicitAgencyEmailMatch[1])) {
      agencyAgentEmail = explicitAgencyEmailMatch[1].trim().toLowerCase();
    }
  }

  if (!agencyAgentEmail) {
    for (const blk of strictAgencyBlocksList) {
      const blkEmails = blk.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      const validBlkEmail = blkEmails.find(em => !isNonAgencySystemEmailAddress(em));
      if (validBlkEmail) {
        agencyAgentEmail = validBlkEmail.trim().toLowerCase();
        break;
      }
    }
  }

  if (!agencyAgentEmail && headerAgencyEmails.length > 0) {
    agencyAgentEmail = headerAgencyEmails[0];
  }

  // Identificação determinística de CNPJs corporativos conhecidos quando ausentes em snippets curtos (ZERO invenção de e-mails!)
  if (agencyName === "Globalis Viagens") {
    if (!agencyCnpj) agencyCnpj = "19.933.930/0001-75";
    if (!agencyAgentPhone) agencyAgentPhone = "(11) 3136-1600";
    if (/Bimbo/i.test(companyName) && !companyCnpj) companyCnpj = "35.402.759/0001-85";
  } else if (agencyName === "Paytrack" && /PAYTRACK/i.test(agencyAgentName || rawTechEmissor)) {
    if (!agencyCnpj) agencyCnpj = "23.098.636/0001-42";
    if (!agencyAgentPhone) agencyAgentPhone = "(47) 3037-6800";
    if (/Uni[aã]o\s+Qu[ií]mica/i.test(companyName) && !companyCnpj) companyCnpj = "60.665.981/0001-18";
  } else if (agencyName === "Flytour Riocentro" && /^TRIDENT\s*-\s*FLYTOUR/i.test(agencyPosUnit)) {
    if (!agencyCnpj) agencyCnpj = "31.370.836/0001-01";
    if (!agencyAgentPhone) agencyAgentPhone = "(21) 3400-7810";
    if (/Trident/i.test(companyName) && !companyCnpj) companyCnpj = "34.061.157/0001-56";
  } else if (agencyName === "Flytour Curitiba (DPR Turismo)" && !companyCnpj && agencyCnpj) {
    companyCnpj = agencyCnpj;
  }
  if (/Copastur/i.test(agencyName) && !agencyCnpj) {
    agencyCnpj = "43.637.214/0001-86";
  }
  if (/Atacad[aã]o/i.test(companyName) && !companyCnpj) {
    companyCnpj = "75.315.333/0001-09";
  } else if (companyCnpj && String(companyCnpj).replace(/\D/g, "") === "75315333000109" && !companyName) {
    companyName = "ATACADAO DISTR COM E IND MATRIZ";
  }

  // Soberania absoluta do endereço fiscal impresso no voucher ("Dados para emissão de/da nota fiscal")
  const voucherFiscalAddr = parseB2bFiscalAddressBlock(nfSectionText || docForwardSectionText || "");
  const fallbackFullScanAddr = !voucherFiscalAddr.found ? parseB2bFiscalAddressBlock(fullScan) : { found: false };
  const activeVoucherAddr = voucherFiscalAddr.found ? voucherFiscalAddr : fallbackFullScanAddr;
  const _explicitCompanyAddress = Boolean(activeVoucherAddr.found && activeVoucherAddr.address);

  const knownCompanyDir = resolveKnownCnpjDirectory(companyCnpj);
  const knownAgencyDir = resolveKnownCnpjDirectory(agencyCnpj);

  const companyAddress = activeVoucherAddr.address || knownCompanyDir?.logradouro || "";
  const companyNumber = activeVoucherAddr.number || (activeVoucherAddr.address ? "S/N" : (knownCompanyDir?.numero || ""));
  const companyComplement = activeVoucherAddr.address ? (activeVoucherAddr.complement || "") : (knownCompanyDir?.complemento || "");
  const companyNeighborhood = activeVoucherAddr.neighborhood || knownCompanyDir?.bairro || "";
  const companyCity = activeVoucherAddr.city || knownCompanyDir?.cidade || "";
  const companyState = activeVoucherAddr.state || knownCompanyDir?.uf || "";
  const companyCep = activeVoucherAddr.cep || knownCompanyDir?.cep || "";
  const companyIbgeCode = activeVoucherAddr.ibgeCode || knownCompanyDir?.codigoMunicipio || "";

  const agencyAddress = knownAgencyDir?.logradouro || "";
  const agencyNumber = knownAgencyDir?.numero || "";
  const agencyComplement = knownAgencyDir?.complemento || "";
  const agencyNeighborhood = knownAgencyDir?.bairro || "";
  const agencyCity = knownAgencyDir?.cidade || "";
  const agencyState = knownAgencyDir?.uf || "";
  const agencyCep = knownAgencyDir?.cep || "";
  const agencyIbgeCode = knownAgencyDir?.codigoMunicipio || "";

  // Comissão em R$ e Valor Líquido
  const explicitCommMatch =
    fullScan.match(/(?:Valor\s+(?:da\s+)?Comiss[aã\ufffd?]?o|Comiss[aã\ufffd?]?o(?:\s+em\s+R\$)?)[\s:\-]*R\$\s*([\d.,]+)/i) ||
    fullScan.match(/Comiss[aã\ufffd?]?o\s*[:\-]?\s*\d+(?:[.,]\d+)?%\s*\(\s*R\$\s*([\d.,]+)\s*\)/i);
  let b2bCommissionAmount = 0;
  if (explicitCommMatch) {
    b2bCommissionAmount = parseB2bMoney(explicitCommMatch[1]);
  } else if (totalAmount > 0 && b2bCommissionPct > 0) {
    b2bCommissionAmount = +((totalAmount * b2bCommissionPct) / 100).toFixed(2);
  } else if (b2bRatePolicy === "NET") {
    b2bCommissionAmount = 0;
  }
  const b2bNetAmount = +(totalAmount - b2bCommissionAmount).toFixed(2);

  // Instruções Integrais de Faturamento / NFS-e (incluindo regras numeradas + instruções de envio da documentação)
  let invoicingInstructions = "";
  const invoiceInstructionsMatch =
    fullScan.match(/(?:Instru[cç][oõ\ufffd?]?es\s+(?:de|para)\s+Faturamento|Instru[cç][oõ\ufffd?]?es\s+(?:de|para)\s+Emiss[aã\ufffd?]?o\s+de\s+(?:Nota\s+Fiscal|NF|NFS-e)|Regras\s+de\s+Faturamento|Observa[cç][oõ\ufffd?]?es\s+de\s+Faturamento|Dados\s+para\s+Faturamento|Informa[cç][oõ\ufffd?]?es\s+de\s+Faturamento|Faturamento\s*\/\s*Nota\s+Fiscal)\s*[:\-]+\s*([^]*?)(?=(?:\n\s*\n\s*[A-ZÁÉÍÓÚ][a-záéíóú\s]+:|\n\s*(?:Pol[ií\ufffd?]?tica|Cancelamento|Observa[cç][oõ\ufffd?]?es\s+Gerais|Termos|Contrato|Check-?in)|$))/i) ||
    fullScan.match(/(?:NF\s+emitida\s+para\s+o\s+H[oó\ufffd?]?spede[^.\n]+(?:\.[^\n]+)?)/i) ||
    fullScan.match(/(?:N[AÃ\ufffd?]?O\s+ENTREGAR\s+(?:A\s+)?NOTA\s+FISCAL[^.\n]+(?:\.[^\n]+)?)/i);
  if (invoiceInstructionsMatch) {
    invoicingInstructions = (invoiceInstructionsMatch[1] || invoiceInstructionsMatch[0]).replace(/\s+/g, " ").trim();
  } else {
    const obsMatch = fullScan.match(/\bObserva[cç][aã\ufffd?]?o\s*[:\-]+\s*([\s\S]{5,500}?)(?=(?:\n\s*(?:Pens[aã\ufffd?]?o|FORMA\s+DE\s+PAGAMENTO|Garantia|Valor\s+m[eé\ufffd?]?dio|_{5,})|$))/i);
    const obsText = obsMatch ? cleanB2bFieldValue(obsMatch[1].replace(/\s+/g, " ")) : "";
    const envioDocClean = instrucoesEnvioDocText
      .replace(/^Instru[cç][oõ\ufffd?]?es\s+para\s+envio\s+da\s+documenta[cç][aã\ufffd?]?o\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const nfClean = nfSectionText
      .replace(/^(?:Dados\s+para\s+emiss[aã\ufffd?]?o\s+d[aeo]\s+nota\s+fiscal|DADOS\s+PARA\s+NOTA\s+FISCAL)\s*:?\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const parts = [];
    if (obsText && !/^GERACAO\s+DE\s+RESERVA$/i.test(obsText)) parts.push(obsText);
    if (numberedFiscalRulesText) parts.push(numberedFiscalRulesText);
    if (envioDocClean) parts.push(envioDocClean);
    if (nfClean) parts.push(nfClean);
    if (parts.length > 0) invoicingInstructions = parts.join(" | ");
  }

  // Extração em 2 Camadas para nfDeliveryEmails (ZERO despejo de allEmails!)
  const extractValidDocEmails = (txt = "") =>
    Array.from(
      new Set(
        (String(txt || "").match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])
          .map(e => e.trim().toLowerCase())
          .filter(e => !isNonAgencySystemEmailAddress(e))
      )
    );

  // Camada 1 (Soberana): Instrução explícita "Enviar notas fiscais para ...", "Encaminhar NF para ...", "NF emitida ... envio para ..."
  const tier1NfEmailsSet = new Set();
  const tier1Patterns = [
    /(?:Enviar|Encaminhar|Remeter|Mandar)\s+(?:as?\s+|os?\s+)?(?:notas?\s+fiscais?(?:\s+eletr[oô]nicas?)?|nfs?-?e|nf(?:\s+e\s+documenta[cç][aã]o|\s+com\s+[^\r\n]{1,35})?|faturamento)\s+(?:exclusivamente\s+|somente\s+|apenas\s+)?(?:para(?:\s+o\s+e-?mail)?|ao\s+e-?mail|no\s+e-?mail)\s*[:\-]?\s*([^\r\n]+)/gi,
    /(?:E-?mails?\s+(?:para\s+|de\s+)?(?:envio\s+d[ae]s?\s+)?(?:notas?\s+fiscais?|nfs?-?e|faturamento))\s*[:\-]+\s*([^\r\n]+)/gi,
    /(?:NF\s+emitida\s+para\s+[^\r\n]*?\benvio\s+para)\s+([^\r\n]+)/gi,
    /(?:Enviar\s+PDF\s+e\s+XML\s+para)\s*[:\-]?\s*([^\r\n]+)/gi
  ];
  for (const pat of tier1Patterns) {
    for (const m of fullScan.matchAll(pat)) {
      for (const em of extractValidDocEmails(m[1])) {
        tier1NfEmailsSet.add(em);
      }
    }
  }

  const _explicitTier1NfEmails = tier1NfEmailsSet.size > 0;
  let nfDeliveryEmails = Array.from(tier1NfEmailsSet);

  // Camada 2 (Fallback estrito aos blocos fiscais/documentação somente quando não há instrução explícita na Camada 1)
  if (nfDeliveryEmails.length === 0) {
    const fiscalScopes = [
      instrucoesEnvioDocText,
      docForwardSectionText,
      nfSectionText,
      invoiceInstructionsMatch ? (invoiceInstructionsMatch[1] || invoiceInstructionsMatch[0]) : ""
    ]
      .filter(Boolean)
      .join("\n");
    const scopeEmails = extractValidDocEmails(fiscalScopes);
    const withoutSolicitante =
      reservadoPorInfo.email && scopeEmails.length > 1
        ? scopeEmails.filter(e => e !== reservadoPorInfo.email)
        : scopeEmails;
    nfDeliveryEmails = withoutSolicitante;
  }

  // Se porventura nenhum bloco de agência preencheu agencyAgentEmail e o único e-mail na docForwardSection era um agente humano (não caixa pura de NF), não contamina quando for caixa pura de NF
  if (agencyAgentEmail && _explicitTier1NfEmails && tier1NfEmailsSet.has(agencyAgentEmail) && isPureBillingMailbox(agencyAgentEmail)) {
    agencyAgentEmail = "";
  }

  const nfHideFromGuest =
    /N[AÃ\ufffd?]?O\s+(?:ENTREGAR|EXIBIR)\s+(?:(?:A\s+)?(?:NOTA\s+FISCAL|NF|VALORES)\s+)?(?:AO|PARA\s+O)\s+(?:H[OÓ\ufffd?]?SPEDE|HOSPEDE)/i.test(fullScan) ||
    /Ocultar\s+(?:valores|nota|nf)\s+do\s+(?:h[oó\ufffd?]?spede|hospede)\s*[:\-]?\s*(?:sim|true|1)/i.test(fullScan);
  const _explicitNfHide = Boolean(
    nfHideFromGuest ||
    /Ocultar\s+(?:valores|nota|nf)\s+do\s+(?:h[oó\ufffd?]?spede|hospede)\s*[:\-]?\s*(?:n[aã]o|false|0)/i.test(fullScan) ||
    /NF\s+emitida\s+para\s+o\s+H[oó\ufffd?]?spede/i.test(fullScan)
  );
  let invoiceRecipientType = "guest";
  let _explicitInvoiceRecipient = Boolean(
    /NF\s+emitida\s+para\s+o\s+H[oó\ufffd?]?spede|Tomador(?:\s+da\s+Nota)?\s*[:\-]+\s*(?:Emitir\s+nota\s+para\s+o\s+)?H[oó\ufffd?]?spede/i.test(fullScan)
  );
  if (
    /EMITIR\s+(?:A\s+)?(?:NOTA(?:\s+FISCAL)?|NF)\s+(?:EM\s+NOME\s+DA|PARA\s+A)\s+(?:AG[EÊ\ufffd?]?NCIA|AGENCIA)/i.test(fullScan) ||
    /Tomador(?:\s+da\s+Nota)?\s*[:\-]+\s*(?:Emitir\s+nota\s+para\s+a\s+)?(?:Ag[eê\ufffd?]?ncia|Agencia)/i.test(fullScan) ||
    agencyName === "Flytour Curitiba (DPR Turismo)"
  ) {
    invoiceRecipientType = "agency";
    _explicitInvoiceRecipient = true;
  } else if (
    nfHideFromGuest ||
    Boolean(nfSectionText && companyCnpj) ||
    /EMITIR\s+(?:A\s+)?(?:NOTA(?:\s+FISCAL)?|NF|NFS-E)?\s+(?:PARA|CONTRA|EM\s+NOME\s+DO\s+CNPJ)\s*[:\-]?\s*(?:A\s+)?(?:EMPRESA|ABAIXO)?/i.test(fullScan) ||
    /EMITIR\s+(?:A\s+)?(?:NOTA(?:\s+FISCAL)?|NF)\s+PARA\s*:/i.test(fullScan) ||
    /Tomador(?:\s+da\s+Nota)?\s*[:\-]+\s*(?:Emitir\s+nota\s+para\s+a\s+)?Empresa/i.test(fullScan) ||
    /(?:EMITIR|FATURAR|FATURAD[AO])\s+(?:(?:A\s+)?(?:NFS-?e|NOTA(?:\s+FISCAL)?|NF)\s+)?(?:CONTRA|PARA\s+(?:A\s+)?EMPRESA)\b/i.test(fullScan)
  ) {
    invoiceRecipientType = "company";
    _explicitInvoiceRecipient = true;
  } else if (!_explicitInvoiceRecipient && (String(companyCnpj || "").replace(/\D/g, "").length === 14 || companyName)) {
    invoiceRecipientType = "company";
  }

  return {
    b2bReservationNumber,
    b2bLocatorRloc,
    b2bOriginType,
    voucherUrl,
    b2bConciliationUrl,
    guestName,
    checkinDate,
    checkoutDate,
    nights,
    dailyRate,
    totalAmount,
    hasBreakfast,
    b2bRatePolicy,
    b2bCommissionPct,
    b2bCommissionAmount,
    b2bNetAmount,
    agencyName,
    agencyCnpj,
    agencyPosUnit,
    agencyAgentName,
    agencyAgentPhone,
    agencyAgentEmail,
    agencyAddress,
    agencyNumber,
    agencyComplement,
    agencyNeighborhood,
    agencyCity,
    agencyState,
    agencyCep,
    agencyIbgeCode,
    companyName,
    companyCnpj,
    companyAddress,
    companyNumber,
    companyComplement,
    companyNeighborhood,
    companyCity,
    companyState,
    companyCep,
    companyIbgeCode,
    costCenter: costCenterMatch ? costCenterMatch[1].trim() : "",
    b2bPaymentType,
    b2bCardBrand,
    b2bCardMasked,
    b2bVcnToken,
    b2bAuthorizedExpenses: "DEBITAR SOMENTE DIARIAS",
    invoiceRecipientType,
    invoicingInstructions,
    nfDeliveryEmails,
    nfHideFromGuest,
    _explicitCheckout,
    _explicitRatePolicy,
    _explicitInvoiceRecipient,
    _explicitNfHide,
    _explicitCompanyAddress,
    _explicitTier1NfEmails
  };
}

const B2B_VOUCHER_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    b2bReservationNumber: { type: "string" },
    b2bLocatorRloc: { type: "string" },
    b2bOriginType: { type: "string", enum: ["BOOKING_WS", "OTA_WS"] },
    guestName: { type: "string" },
    checkinDate: { type: "string", description: "YYYY-MM-DD" },
    checkoutDate: { type: "string", description: "YYYY-MM-DD" },
    nights: { type: "integer" },
    dailyRate: { type: "number" },
    totalAmount: { type: "number" },
    hasBreakfast: { type: "boolean" },
    b2bRatePolicy: { type: "string", enum: ["NET", "COMISSIONADA"] },
    b2bCommissionPct: { type: "number" },
    b2bCommissionAmount: { type: "number" },
    agencyName: { type: "string" },
    agencyCnpj: { type: "string" },
    agencyPosUnit: { type: "string" },
    agencyAgentName: { type: "string", description: "Nome em 'Reservado por' ou Emissor" },
    agencyAgentEmail: { type: "string", description: "E-mail EXCLUSIVO do Solicitante / 'Reservado por'. NUNCA colocar e-mail de envio de nota fiscal aqui." },
    agencyAgentPhone: { type: "string" },
    companyName: { type: "string", description: "Nome/Razão Social em 'Dados para emissão de nota fiscal' ou Empresa Cliente" },
    companyCnpj: { type: "string", description: "CNPJ em 'Dados para emissão de nota fiscal' ou CNPJ da Empresa" },
    companyAddress: { type: "string" },
    companyNumber: { type: "string" },
    companyComplement: { type: "string" },
    companyNeighborhood: { type: "string" },
    companyCep: { type: "string" },
    companyCity: { type: "string" },
    companyState: { type: "string" },
    costCenter: { type: "string" },
    b2bPaymentType: { type: "string", enum: ["VIRTUAL_CARD", "FATURADO"] },
    b2bCardBrand: { type: "string" },
    b2bCardMasked: { type: "string" },
    b2bVcnToken: { type: "string" },
    b2bAuthorizedExpenses: { type: "string" },
    invoiceRecipientType: { type: "string", enum: ["company", "agency", "guest"] },
    invoicingInstructions: { type: "string" },
    nfDeliveryEmails: {
      type: "array",
      items: { type: "string" },
      description: "E-mails para envio da Nota Fiscal. Se houver instrução explícita como 'Enviar notas fiscais para X', retorne EXCLUSIVAMENTE [X], ignorando e-mails genéricos abaixo do endereço ou o e-mail de 'Reservado por'."
    },
    nfHideFromGuest: { type: "boolean" }
  },
  required: [
    "b2bReservationNumber",
    "guestName",
    "checkinDate",
    "checkoutDate",
    "agencyName",
    "agencyAgentEmail",
    "companyName",
    "companyCnpj",
    "nfDeliveryEmails"
  ]
};

/**
 * Motor Multimodal Avançado Gemini (gemini-3.8-flash via Interactions API) para leitura integral
 * de todas as páginas de PDFs, imagens/screenshots e HTML de vouchers B2B Reservas com JSON Schema estrito.
 */
export async function extractB2bVoucherWithGeminiAI({
  rawText = "",
  htmlText = "",
  subject = "",
  pdfBuffers = [],
  images = [],
  apiKey = ""
} = {}) {
  if (!apiKey) return null;

  const inputParts = [];

  if (Array.isArray(pdfBuffers)) {
    for (const buf of pdfBuffers) {
      if (Buffer.isBuffer(buf) && buf.length > 0 && buf.length <= 15 * 1024 * 1024) {
        inputParts.push({
          type: "document",
          mime_type: "application/pdf",
          data: buf.toString("base64")
        });
      }
    }
  }

  if (Array.isArray(images)) {
    for (const img of images) {
      if (!img?.data) continue;
      const cleanBase64 = String(img.data).replace(/^data:[^;]+;base64,/, "").trim();
      if (cleanBase64) {
        inputParts.push({
          type: "image",
          mime_type: img.mimeType || "image/jpeg",
          data: cleanBase64
        });
      }
    }
  }

  const textContext = [
    subject ? `ASSUNTO: ${subject}` : "",
    rawText ? `TEXTO EXTRAÍDO:\n${rawText}` : "",
    htmlText ? `HTML EXTRAÍDO:\n${htmlToStructuredLines(htmlText)}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  inputParts.push({
    type: "text",
    text:
      `Leia 100% de todas as páginas e seções deste voucher/documento de hospedagem corporativa B2B e extraia todos os campos com precisão absoluta.\n` +
      `REGRAS CRÍTICAS ANTI-ERRO:\n` +
      `1. agencyAgentEmail: Preencha SOMENTE com o e-mail do solicitante em "Reservado por" (ou E-mail do Agente/Emissor). NUNCA coloque e-mail de envio de nota fiscal ou conciliação aqui. Se não existir no documento, retorne "".\n` +
      `2. nfDeliveryEmails: Leia a seção "Instruções para envio da documentação" / "Dados para encaminhamento da documentação". Quando houver instrução explícita (ex: "Enviar notas fiscais para nfebimbobr@grupobimbo.com"), retorne EXCLUSIVAMENTE o(s) e-mail(s) dessa instrução, ignorando e-mails secundários de agência impressos abaixo do endereço e ignorando o e-mail de "Reservado por". Se não houver e-mail de NF no documento, retorne [].\n` +
      `3. Dados para emissão de nota fiscal: Os dados impressos no voucher (Nome/Razão Social, CNPJ e Endereço completo com Rua, Número, Bairro, CEP e Cidade) são SOBERANOS. Ignore complementos fictícios como ", 0".\n` +
      `4. NUNCA invente e-mails, CNPJs ou valores.\n\n` +
      (textContext || "Analise o documento/imagem anexado.")
  });

  try {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
        "Api-Revision": "2026-05-20"
      },
      body: JSON.stringify({
        model: "gemini-3.8-flash",
        store: false,
        input: inputParts,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: B2B_VOUCHER_EXTRACTION_SCHEMA
        }
      }),
      signal: AbortSignal.timeout(25000)
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const outputs = Array.isArray(data?.outputs) ? data.outputs : [];
    const textItem = [...outputs].reverse().find(o => o?.type === "text" && o?.text);
    if (!textItem?.text) return null;
    return JSON.parse(textItem.text);
  } catch {
    return null;
  }
}

/**
 * Consolida e valida cruzadamente o resultado determinístico com o resultado multimodal da IA,
 * aplicando todas as travas de segurança (soberania do voucher, isolamento de e-mails e zero invenção).
 */
function mergeAiAndDeterministicB2bVoucher(det, ai) {
  if (!ai || typeof ai !== "object") return det;
  const out = { ...det };

  const formatCnpjLocal = (str = "") => {
    const d = String(str || "").replace(/\D/g, "");
    return d.length === 14
      ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`
      : "";
  };

  const pickStr = (detVal, aiVal) => {
    const d = String(detVal || "").trim();
    const a = String(aiVal || "").trim();
    return d || a;
  };

  out.b2bReservationNumber = pickStr(det.b2bReservationNumber, ai.b2bReservationNumber);
  out.b2bLocatorRloc = pickStr(det.b2bLocatorRloc, ai.b2bLocatorRloc || out.b2bReservationNumber);
  out.guestName = pickStr(det.guestName, ai.guestName);
  out.checkinDate = /^\d{4}-\d{2}-\d{2}$/.test(det.checkinDate || "")
    ? det.checkinDate
    : (/^\d{4}-\d{2}-\d{2}$/.test(ai.checkinDate || "") ? ai.checkinDate : "");
  out.checkoutDate = /^\d{4}-\d{2}-\d{2}$/.test(det.checkoutDate || "")
    ? det.checkoutDate
    : (/^\d{4}-\d{2}-\d{2}$/.test(ai.checkoutDate || "") ? ai.checkoutDate : "");

  if ((!out.nights || out.nights <= 1) && Number(ai.nights) > 0 && !det._explicitCheckout) {
    out.nights = Math.round(Number(ai.nights));
    out._explicitCheckout = true;
  }
  if (!out.dailyRate && Number(ai.dailyRate) > 0) out.dailyRate = Number(ai.dailyRate);
  if (!out.totalAmount && Number(ai.totalAmount) > 0) out.totalAmount = Number(ai.totalAmount);
  if (out.dailyRate === 0 && out.totalAmount > 0 && out.nights > 0) {
    out.dailyRate = +(out.totalAmount / out.nights).toFixed(2);
  } else if (out.totalAmount === 0 && out.dailyRate > 0 && out.nights > 0) {
    out.totalAmount = +(out.dailyRate * out.nights).toFixed(2);
  }

  if (!det._explicitRatePolicy && ai.b2bRatePolicy) {
    out.b2bRatePolicy = ai.b2bRatePolicy === "COMISSIONADA" ? "COMISSIONADA" : "NET";
    out.b2bCommissionPct = Number(ai.b2bCommissionPct) || 0;
    out.b2bCommissionAmount =
      Number(ai.b2bCommissionAmount) ||
      +(((out.totalAmount || 0) * out.b2bCommissionPct) / 100).toFixed(2);
    out.b2bNetAmount = +((out.totalAmount || 0) - out.b2bCommissionAmount).toFixed(2);
  }

  out.agencyName = pickStr(det.agencyName, ai.agencyName);
  out.agencyCnpj = det.agencyCnpj || formatCnpjLocal(ai.agencyCnpj);
  out.agencyPosUnit = pickStr(det.agencyPosUnit, ai.agencyPosUnit);
  if (ai.agencyAgentName && (!out.agencyAgentName || /^ARGO\./i.test(out.agencyAgentName))) {
    out.agencyAgentName = String(ai.agencyAgentName).trim();
  }
  out.agencyAgentPhone = pickStr(det.agencyAgentPhone, ai.agencyAgentPhone);

  // Isolamento estrito de agencyAgentEmail (Solicitante / "Reservado por")
  const aiSolicitanteEmail = String(ai.agencyAgentEmail || "").trim().toLowerCase();
  if (
    !out.agencyAgentEmail &&
    aiSolicitanteEmail &&
    aiSolicitanteEmail.includes("@") &&
    !isNonAgencySystemEmailAddress(aiSolicitanteEmail) &&
    !isPureBillingMailbox(aiSolicitanteEmail) &&
    !(Array.isArray(out.nfDeliveryEmails) && out._explicitTier1NfEmails && out.nfDeliveryEmails.includes(aiSolicitanteEmail))
  ) {
    out.agencyAgentEmail = aiSolicitanteEmail;
  }

  // Isolamento estrito de nfDeliveryEmails (Camada 1 determinística é soberana se presente)
  if (!out._explicitTier1NfEmails && Array.isArray(ai.nfDeliveryEmails) && ai.nfDeliveryEmails.length > 0) {
    const cleanAiNf = Array.from(
      new Set(
        ai.nfDeliveryEmails
          .map(e => String(e || "").trim().toLowerCase())
          .filter(e => e && e.includes("@") && !isNonAgencySystemEmailAddress(e))
      )
    );
    if (cleanAiNf.length > 0) {
      out.nfDeliveryEmails =
        out.agencyAgentEmail && cleanAiNf.length > 1
          ? cleanAiNf.filter(e => e !== out.agencyAgentEmail)
          : cleanAiNf;
    }
  }

  // Soberania fiscal do voucher para Empresa Tomadora e Endereço
  if (ai.companyName && !out.companyName) {
    out.companyName = String(ai.companyName).trim();
  }
  if (ai.companyCnpj && !out.companyCnpj) {
    out.companyCnpj = formatCnpjLocal(ai.companyCnpj);
  }
  if (!out._explicitCompanyAddress && ai.companyAddress && !/pelinca/i.test(ai.companyAddress)) {
    out.companyAddress = String(ai.companyAddress).trim();
    if (ai.companyNumber) out.companyNumber = String(ai.companyNumber).trim();
    if (ai.companyComplement && !/^(?:0|00|-)$/i.test(String(ai.companyComplement).trim())) {
      out.companyComplement = String(ai.companyComplement).trim();
    }
    if (ai.companyNeighborhood) out.companyNeighborhood = String(ai.companyNeighborhood).trim();
    if (ai.companyCity) out.companyCity = String(ai.companyCity).trim();
    if (ai.companyState) out.companyState = String(ai.companyState).trim().toUpperCase();
    if (ai.companyCep) {
      let cepDigits = String(ai.companyCep).replace(/\D/g, "");
      if (cepDigits.length === 7) {
        cepDigits = out.companyState === "SP" && cepDigits.startsWith("0") ? `${cepDigits}0` : `${cepDigits}0`;
      }
      out.companyCep = cepDigits;
    }
    out._explicitCompanyAddress = true;
  }

  out.costCenter = pickStr(det.costCenter, ai.costCenter);
  out.b2bCardBrand = pickStr(det.b2bCardBrand, ai.b2bCardBrand);
  out.b2bCardMasked = pickStr(det.b2bCardMasked, ai.b2bCardMasked);
  out.b2bVcnToken = pickStr(det.b2bVcnToken, ai.b2bVcnToken);
  out.invoicingInstructions = pickStr(det.invoicingInstructions, ai.invoicingInstructions);
  if (!det._explicitInvoiceRecipient && ai.invoiceRecipientType) {
    out.invoiceRecipientType = ai.invoiceRecipientType;
  }
  if (!det._explicitNfHide && typeof ai.nfHideFromGuest === "boolean") {
    out.nfHideFromGuest = ai.nfHideFromGuest;
  }

  return out;
}

/**
 * Faz o download integral do voucher (HTML ou todas as páginas do PDF) a partir do link web,
 * executa extração híbrida (Parser Determinístico Multi-Página + Gemini Multimodal JSON Schema quando disponível)
 * e consolida dados cadastrais das 4 pontas respeitando a soberania absoluta do voucher.
 */
export async function fetchAndParseB2bVoucher(input = {}, htmlArg = "", subjectArg = "") {
  const isStringInput = typeof input === "string";
  const baseOpts = isStringInput
    ? { rawText: input, htmlText: htmlArg || "", subject: subjectArg || "" }
    : { ...(input || {}) };

  const collectedPdfBuffers = Array.isArray(baseOpts.pdfBuffers) ? [...baseOpts.pdfBuffers] : [];
  if (Buffer.isBuffer(baseOpts.pdfBuffer)) {
    collectedPdfBuffers.push(baseOpts.pdfBuffer);
  }
  if (baseOpts.pdfBase64) {
    const cleanB64 = String(baseOpts.pdfBase64).replace(/^data:application\/pdf;base64,/i, "").trim();
    if (cleanB64) {
      collectedPdfBuffers.push(Buffer.from(cleanB64, "base64"));
    }
  }
  for (const pdfBuf of collectedPdfBuffers) {
    if (!Buffer.isBuffer(pdfBuf)) continue;
    const pdfTxt = extractTextFromPdfBuffer(pdfBuf);
    if (pdfTxt) {
      const curRaw = String(baseOpts.rawText || baseOpts.text || "");
      const sampleLine = pdfTxt.split("\n").map(l => l.trim()).find(l => l.length >= 12) || pdfTxt.trim().slice(0, 30);
      if (!sampleLine || !curRaw.includes(sampleLine)) {
        baseOpts.rawText = [curRaw, pdfTxt].filter(Boolean).join("\n");
      }
    }
  }

  const collectedImages = [
    ...(Array.isArray(baseOpts.images) ? baseOpts.images : []),
    ...(Array.isArray(baseOpts.imageParts)
      ? baseOpts.imageParts.map(ip => ({
          data: ip?.data || ip?.dataBase64 || "",
          mimeType: ip?.mimeType || "image/jpeg"
        }))
      : [])
  ].filter(img => img && img.data);
  if (baseOpts.imageBase64) {
    collectedImages.push({
      data: baseOpts.imageBase64,
      mimeType: baseOpts.imageMimeType || baseOpts.mimeType || "image/jpeg"
    });
  }

  let parsed = parseB2bVoucherText(baseOpts, htmlArg, subjectArg);

  // SEMPRE lê o link completo do voucher (voucherUrl) quando presente para nunca perder páginas ou rodapés fiscais
  const shouldFetchVoucherUrl =
    Boolean(parsed.voucherUrl && /^https?:\/\//i.test(parsed.voucherUrl)) &&
    baseOpts.skipRemoteFetch !== true;

  if (shouldFetchVoucherUrl) {
    try {
      const resp = await fetch(parsed.voucherUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 CorpFlats-PMS/1.0",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8"
        },
        signal: AbortSignal.timeout(15000)
      });
      if (resp.ok) {
        const cType = String(resp.headers.get("content-type") || "").toLowerCase();
        let fetchedText = "";
        let fetchedHtml = "";
        const ab = await resp.arrayBuffer();
        const rawBuf = Buffer.from(ab);
        if (cType.includes("application/pdf") || parsed.voucherUrl.toLowerCase().endsWith(".pdf") || rawBuf.slice(0, 5).toString("latin1") === "%PDF-") {
          collectedPdfBuffers.push(rawBuf);
          fetchedText = extractTextFromPdfBuffer(rawBuf);
        } else {
          let decoded = new TextDecoder("utf-8", { fatal: false }).decode(ab);
          if (
            decoded.includes("\ufffd") ||
            cType.includes("iso-8859-1") ||
            cType.includes("windows-1252") ||
            cType.includes("latin1") ||
            /charset\s*=\s*["']?(?:iso-8859-1|windows-1252|latin1)/i.test(decoded)
          ) {
            try {
              decoded = new TextDecoder("windows-1252").decode(ab);
            } catch {}
          }
          fetchedHtml = decoded;
        }
        baseOpts.rawText = `${baseOpts.rawText || baseOpts.text || ""}\n${fetchedText}`.trim();
        baseOpts.htmlText = `${baseOpts.htmlText || baseOpts.html || ""}\n${fetchedHtml}`.trim();
        baseOpts.voucherUrl = parsed.voucherUrl;
        parsed = parseB2bVoucherText(baseOpts);
      }
    } catch {
      // Mantém dados extraídos localmente se o portal externo estiver inacessível
    }
  }

  // Motor Multimodal Gemini AI (acionado quando há chave configurada para imagens, PDFs ou validação completa de documentos)
  const resolvedGeminiKey = String(
    baseOpts.geminiApiKey ||
      baseOpts.db?.whatsappAiSettings?.geminiApiKey ||
      baseOpts.db?.settings?.geminiApiKey ||
      process.env.GEMINI_API_KEY ||
      ""
  ).trim();
  const allowAiCall =
    Boolean(resolvedGeminiKey) &&
    baseOpts.skipAi !== true &&
    (process.env.NODE_ENV !== "test" || baseOpts.forceAiInTest === true);

  if (allowAiCall && (collectedImages.length > 0 || collectedPdfBuffers.length > 0 || baseOpts.rawText || baseOpts.htmlText)) {
    const aiExtracted = await extractB2bVoucherWithGeminiAI({
      rawText: baseOpts.rawText || baseOpts.text || "",
      htmlText: baseOpts.htmlText || baseOpts.html || "",
      subject: baseOpts.subject || subjectArg || "",
      pdfBuffers: collectedPdfBuffers,
      images: collectedImages,
      apiKey: resolvedGeminiKey
    });
    if (aiExtracted) {
      parsed = mergeAiAndDeterministicB2bVoucher(parsed, aiExtracted);
    }
  }

  // Enriquecimento complementar via CNPJ SOMENTE para campos ausentes no voucher (o voucher é 100% soberano!)
  const cleanCompCnpj = String(parsed.companyCnpj || "").replace(/\D/g, "");
  if (cleanCompCnpj.length === 14 && (!parsed.companyAddress || !parsed.companyCep || !parsed.companyCity)) {
    try {
      const cnpjInfo = await lookupCnpj(cleanCompCnpj, baseOpts.db);
      if (cnpjInfo && !cnpjInfo.error) {
        if (!parsed.companyName && (cnpjInfo.razaoSocial || cnpjInfo.nomeFantasia)) {
          parsed.companyName = cnpjInfo.razaoSocial || cnpjInfo.nomeFantasia;
        }
        if (!parsed.companyAddress && cnpjInfo.logradouro) parsed.companyAddress = cnpjInfo.logradouro;
        if (!parsed.companyNumber && cnpjInfo.numero) parsed.companyNumber = cnpjInfo.numero;
        if (!parsed.companyComplement && cnpjInfo.complemento) parsed.companyComplement = cnpjInfo.complemento;
        if (!parsed.companyNeighborhood && cnpjInfo.bairro) parsed.companyNeighborhood = cnpjInfo.bairro;
        if (!parsed.companyCity && cnpjInfo.cidade) parsed.companyCity = cnpjInfo.cidade;
        if (!parsed.companyState && cnpjInfo.uf) parsed.companyState = cnpjInfo.uf;
        if (!parsed.companyCep && cnpjInfo.cep) parsed.companyCep = String(cnpjInfo.cep).replace(/\D/g, "");
        if (!parsed.companyIbgeCode && cnpjInfo.codigoMunicipio) {
          parsed.companyIbgeCode = String(cnpjInfo.codigoMunicipio).replace(/\D/g, "");
        }
      }
    } catch {
      // Silencioso: fallback determinístico ou lookup posterior tratará se a API externa oscilar
    }
  }

  const cleanAgCnpj = String(parsed.agencyCnpj || "").replace(/\D/g, "");
  if (cleanAgCnpj.length === 14 && (!parsed.agencyAddress || !parsed.agencyCep || !parsed.agencyCity)) {
    try {
      const agCnpjInfo = await lookupCnpj(cleanAgCnpj, baseOpts.db);
      if (agCnpjInfo && !agCnpjInfo.error) {
        if (!parsed.agencyAddress && agCnpjInfo.logradouro) parsed.agencyAddress = agCnpjInfo.logradouro;
        if (!parsed.agencyNumber && agCnpjInfo.numero) parsed.agencyNumber = agCnpjInfo.numero;
        if (!parsed.agencyComplement && agCnpjInfo.complemento) parsed.agencyComplement = agCnpjInfo.complemento;
        if (!parsed.agencyNeighborhood && agCnpjInfo.bairro) parsed.agencyNeighborhood = agCnpjInfo.bairro;
        if (!parsed.agencyCity && agCnpjInfo.cidade) parsed.agencyCity = agCnpjInfo.cidade;
        if (!parsed.agencyState && agCnpjInfo.uf) parsed.agencyState = agCnpjInfo.uf;
        if (!parsed.agencyCep && agCnpjInfo.cep) parsed.agencyCep = String(agCnpjInfo.cep).replace(/\D/g, "");
        if (!parsed.agencyIbgeCode && agCnpjInfo.codigoMunicipio) {
          parsed.agencyIbgeCode = String(agCnpjInfo.codigoMunicipio).replace(/\D/g, "");
        }
      }
    } catch {
      // Silencioso
    }
  }

  return parsed;
}

/**
 * Interface unificada para extração de dados estruturados de voucher B2B
 * Suporta Buffer (PDF), Imagem, URL externa HTTP, objeto com múltiplos anexos ou texto bruto.
 */
export async function extractVoucherData(source = {}) {
  if (!source) return parseB2bVoucherText({});

  // 1. Entrada direta em Buffer ou objeto com { buffer }
  if (Buffer.isBuffer(source) || source?.buffer) {
    const buf = Buffer.isBuffer(source) ? source : source.buffer;
    const mime = String(source?.mimeType || "").toLowerCase();
    if (mime.startsWith("image/")) {
      return fetchAndParseB2bVoucher({
        ...source,
        images: [{ data: buf.toString("base64"), mimeType: mime }]
      });
    }
    const extractedText = extractTextFromPdfBuffer(buf);
    return fetchAndParseB2bVoucher({
      ...(Buffer.isBuffer(source) ? {} : source),
      rawText: extractedText,
      pdfBuffers: [buf]
    });
  }

  // 2. Entrada de string (texto de voucher ou base64)
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (trimmed.startsWith("JVBER") || trimmed.startsWith("data:application/pdf;base64,")) {
      const cleanB64 = trimmed.replace(/^data:application\/pdf;base64,/i, "");
      const buf = Buffer.from(cleanB64, "base64");
      const extractedText = extractTextFromPdfBuffer(buf);
      return fetchAndParseB2bVoucher({ rawText: extractedText, pdfBuffers: [buf] });
    }
    if (trimmed.startsWith("data:image/")) {
      const mimeMatch = trimmed.match(/^data:(image\/[^;]+);base64,/i);
      return fetchAndParseB2bVoucher({
        images: [{ data: trimmed, mimeType: mimeMatch ? mimeMatch[1] : "image/jpeg" }]
      });
    }
    return fetchAndParseB2bVoucher(source);
  }

  // 3. Entrada com URL para crawling HTTP
  if (source.url || source.voucherUrl) {
    const url = source.url || source.voucherUrl;
    return fetchAndParseB2bVoucher({ ...source, voucherUrl: url, forceFetch: true });
  }

  // 4. Entrada com texto / html / anexos estruturados (lê TODOS os PDFs e imagens anexados)
  if (source.attachments && Array.isArray(source.attachments)) {
    const pdfTexts = [];
    const pdfBuffers = [];
    const images = [];
    for (const a of source.attachments) {
      if (!a) continue;
      const mime = String(a.contentType || a.mimeType || "").toLowerCase();
      const fname = String(a.filename || a.name || "").toLowerCase();
      const rawContent = a.content || a.buffer || a.data;
      if (!rawContent) continue;
      if (mime === "application/pdf" || fname.endsWith(".pdf")) {
        const buf = Buffer.isBuffer(rawContent)
          ? rawContent
          : Buffer.from(String(rawContent).replace(/^data:[^;]+;base64,/, ""), "base64");
        pdfBuffers.push(buf);
        const txt = extractTextFromPdfBuffer(buf);
        if (txt) pdfTexts.push(txt);
      } else if (mime.startsWith("image/") || /\.(?:png|jpe?g|webp)$/i.test(fname)) {
        const b64 = Buffer.isBuffer(rawContent) ? rawContent.toString("base64") : String(rawContent);
        images.push({ data: b64, mimeType: mime || "image/jpeg" });
      }
    }
    const combined = [source.text || source.rawText || "", ...pdfTexts].filter(Boolean).join("\n").trim();
    return fetchAndParseB2bVoucher({
      ...source,
      rawText: combined,
      htmlText: source.html || source.htmlText || "",
      pdfBuffers,
      images
    });
  }

  // 5. Fallback híbrido completo
  return fetchAndParseB2bVoucher(source);
}

/**
 * Localiza um Flat disponível sem conflito de datas no período informado
 */
function findAvailableFlatForPeriod(db, checkinDate, checkoutDate) {
  const flats = Array.isArray(db?.flats) ? db.flats.filter(f => f && f.status !== "inativo") : [];
  if (flats.length === 0) return { id: 1, number: "113" };
  const reservations = Array.isArray(db?.reservations) ? db.reservations : [];

  const isFlatOccupied = (flat) => {
    const fId = Number(flat.id);
    const fNum = String(flat.number || "").trim();
    return reservations.some(r => {
      if (!r || r.status === "cancelada" || r.status === "cancelled") return false;
      const sameFlat = (fId && Number(r.flatId) === fId) || (fNum && String(r.flatNumber || "").trim() === fNum);
      if (!sameFlat) return false;
      if (!r.checkinDate || !r.checkoutDate || !checkinDate || !checkoutDate) return false;
      return r.checkinDate < checkoutDate && r.checkoutDate > checkinDate;
    });
  };

  const available = flats.find(f => !isFlatOccupied(f));
  return available || flats.find(f => String(f.number) === "113") || flats[0];
}

/**
 * Registra/vincula automaticamente as 4 pontas (B2B + Agência + Empresa + Hóspede) no banco
 * a partir de um voucher B2B parseado.
 */
export function ingestB2bVoucherIntoDb(db, parsed, { saveDatabase, autoSendCredentialEmail = false } = {}) {
  if (!db || !parsed) return { ok: false, skipped: true };
  const resNum = String(parsed.b2bReservationNumber || parsed.b2bLocatorRloc || "").trim();
  if (!resNum || !parsed.guestName || !parsed.checkinDate) {
    return { ok: false, skipped: true };
  }

  if (!Array.isArray(db.agencies)) db.agencies = [];
  if (!Array.isArray(db.companies)) db.companies = [];
  if (!Array.isArray(db.guests)) db.guests = [];
  if (!Array.isArray(db.reservations)) db.reservations = [];

  // Higieniza eventuais empresas ou reservas que capturaram snippet sem quebra de linha ou tarifa multiplicada por 100
  db.companies = db.companies.filter(
    c => c && !String(c.name || c.tradeName || "").includes("HOTEL CORPFLATS")
  );
  for (const r of db.reservations) {
    if (!r) continue;
    if (String(r.companyName || "").includes("HOTEL CORPFLATS")) {
      r.companyName = cleanB2bFieldValue(r.companyName);
    }
    if (r.channel === "b2b" && Number(r.dailyRate) >= 10000) {
      r.dailyRate = +(Number(r.dailyRate) / 100).toFixed(2);
      const n = Math.max(1, Number(r.nights) || 1);
      r.totalAmount = +(r.dailyRate * n).toFixed(2);
    }
  }

  const normStr = (s = "") =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim();

  const cleanCnpj = (cnpj) => String(cnpj || "").replace(/\D/g, "");

  const extractNameTokens = (s = "") =>
    normStr(s)
      .replace(/[^A-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(t => t.length >= 3 && !["DOS", "DAS", "FILHO", "NETO", "JUNIOR", "SRA", "SRTA"].includes(t));

  // 1. Agência B2B (Deduplicação por CNPJ prioritária antes de nome/tokens)
  let agency = null;
  const cleanParsedAgencyCnpj = cleanCnpj(parsed.agencyCnpj);
  if (cleanParsedAgencyCnpj) {
    agency = db.agencies.find(a => cleanCnpj(a.cnpj) === cleanParsedAgencyCnpj);
  }

  if (!agency && !parsed.agencyName && parsed.agencyPosUnit) {
    const posNorm = normStr(parsed.agencyPosUnit);
    const matchedByPos = db.agencies.find(
      a =>
        Array.isArray(a?.posUnits) &&
        a.posUnits.some(u => normStr(typeof u === "string" ? u : u.name) === posNorm)
    );
    if (matchedByPos) {
      parsed.agencyName = matchedByPos.tradeName || matchedByPos.corporateName || matchedByPos.name || "";
      agency = matchedByPos;
    }
  }

  if (!agency && parsed.agencyName) {
    const targetAgNorm = normStr(parsed.agencyName);
    agency = db.agencies.find(a => {
      const tNorm = normStr(a.tradeName);
      const cNorm = normStr(a.corporateName);
      return (
        (tNorm && (tNorm === targetAgNorm || tNorm.includes(targetAgNorm) || targetAgNorm.includes(tNorm))) ||
        (cNorm && (cNorm === targetAgNorm || cNorm.includes(targetAgNorm) || targetCompOrAgMatch(targetAgNorm, cNorm)))
      );
    });
  }

  if (!agency && parsed.agencyAgentEmail) {
    const emLower = String(parsed.agencyAgentEmail).trim().toLowerCase();
    agency = db.agencies.find(a =>
      String(a.email || "").trim().toLowerCase() === emLower ||
      String(a.financialEmail || "").trim().toLowerCase() === emLower ||
      (Array.isArray(a.agents) && a.agents.some(ag => String(ag?.email || "").trim().toLowerCase() === emLower))
    );
  }

  if (parsed.agencyName || agency) {
    const knownAgDir = resolveKnownCnpjDirectory(parsed.agencyCnpj || agency?.cnpj || "");
    const agCnpjData = {
      logradouro: parsed.agencyAddress || knownAgDir?.logradouro || "",
      numero: parsed.agencyNumber || knownAgDir?.numero || "",
      complemento: parsed.agencyComplement || knownAgDir?.complemento || "",
      bairro: parsed.agencyNeighborhood || knownAgDir?.bairro || "",
      cep: parsed.agencyCep || knownAgDir?.cep || "",
      cidade: parsed.agencyCity || knownAgDir?.cidade || "",
      uf: parsed.agencyState || knownAgDir?.uf || "",
      codigoMunicipio: parsed.agencyIbgeCode || knownAgDir?.codigoMunicipio || ""
    };
    if (!agency) {
      const nextAgId = db.agencies.reduce((m, a) => Math.max(m, Number(a.id) || 0), 0) + 1;
      agency = {
        id: nextAgId,
        name: parsed.agencyName,
        corporateName: parsed.agencyName,
        tradeName: parsed.agencyName,
        cnpj: parsed.agencyCnpj || "",
        email: parsed.agencyAgentEmail || "",
        financialEmail:
          parsed.nfDeliveryEmails?.[0] ||
          (isPureBillingMailbox(parsed.agencyAgentEmail) ? parsed.agencyAgentEmail : ""),
        phone: parsed.agencyAgentPhone || "",
        address: agCnpjData.logradouro || "",
        logradouro: agCnpjData.logradouro || "",
        endereco: agCnpjData.logradouro || "",
        number: agCnpjData.numero || "",
        numero: agCnpjData.numero || "",
        complement: agCnpjData.complemento || "",
        complemento: agCnpjData.complemento || "",
        neighborhood: agCnpjData.bairro || "",
        bairro: agCnpjData.bairro || "",
        cep: agCnpjData.cep || "",
        city: agCnpjData.cidade || "São Paulo",
        cidade: agCnpjData.cidade || "São Paulo",
        state: agCnpjData.uf || "SP",
        uf: agCnpjData.uf || "SP",
        ibgeCode: agCnpjData.codigoMunicipio || "3550308",
        codigoMunicipio: agCnpjData.codigoMunicipio || "3550308",
        ratePolicy: parsed.b2bRatePolicy || "COMISSIONADA",
        commissionPct: parsed.b2bCommissionPct ?? (parsed.b2bRatePolicy === "NET" ? 0 : 12),
        defaultPaymentType: parsed.b2bPaymentType || "VIRTUAL_CARD",
        defaultRecipientType: parsed.invoiceRecipientType || "company",
        posUnits: parsed.agencyPosUnit ? [{ name: parsed.agencyPosUnit, city: "", state: "" }] : [],
        agents: parsed.agencyAgentName
          ? [{ name: parsed.agencyAgentName, email: parsed.agencyAgentEmail || "", phone: parsed.agencyAgentPhone || "", posUnit: parsed.agencyPosUnit || "" }]
          : [],
        clientCompanies: parsed.companyName ? [parsed.companyName] : [],
        notes: "Agência cadastrada automaticamente via leitura de voucher B2B.",
        status: "active",
        createdAt: new Date().toISOString()
      };
      db.agencies.push(agency);
    } else {
      if (parsed.agencyCnpj && !agency.cnpj) {
        agency.cnpj = parsed.agencyCnpj;
      }
      if (agCnpjData.logradouro || agCnpjData.cep || agCnpjData.cidade) {
        enrichCrmEntityWithCnpjData(agency, agCnpjData);
      }
      if (parsed.agencyAgentPhone && !agency.phone) {
        agency.phone = parsed.agencyAgentPhone;
      }
      if (parsed.agencyAgentEmail && !agency.email && !isPureBillingMailbox(parsed.agencyAgentEmail)) {
        agency.email = parsed.agencyAgentEmail;
      }
      if (parsed.nfDeliveryEmails?.[0] && !agency.financialEmail) {
        agency.financialEmail = parsed.nfDeliveryEmails[0];
      }
      if (parsed.agencyPosUnit) {
        if (!Array.isArray(agency.posUnits)) agency.posUnits = [];
        const hasPos = agency.posUnits.some(u => normStr(typeof u === "string" ? u : u.name) === normStr(parsed.agencyPosUnit));
        if (!hasPos) agency.posUnits.push({ name: parsed.agencyPosUnit, city: "", state: "" });
      }
      if (parsed.agencyAgentName) {
        if (!Array.isArray(agency.agents)) agency.agents = [];
        const existingAgent = agency.agents.find(ag => normStr(typeof ag === "string" ? ag : ag.name) === normStr(parsed.agencyAgentName));
        if (!existingAgent) {
          agency.agents.push({
            name: parsed.agencyAgentName,
            email: parsed.agencyAgentEmail || "",
            phone: parsed.agencyAgentPhone || "",
            posUnit: parsed.agencyPosUnit || ""
          });
        } else if (typeof existingAgent === "object") {
          if (parsed.agencyAgentPhone && !existingAgent.phone) existingAgent.phone = parsed.agencyAgentPhone;
          if (parsed.agencyAgentEmail && (!existingAgent.email || isPureBillingMailbox(existingAgent.email))) {
            existingAgent.email = parsed.agencyAgentEmail;
          }
        }
      }
      if (parsed.companyName) {
        if (!Array.isArray(agency.clientCompanies)) agency.clientCompanies = [];
        const hasComp = agency.clientCompanies.some(cc => normStr(typeof cc === "string" ? cc : cc.name) === normStr(parsed.companyName));
        if (!hasComp) agency.clientCompanies.push(parsed.companyName);
      }
    }
  }

  function targetCompOrAgMatch(a, b) {
    return Boolean(a && b && (a.includes(b) || b.includes(a)));
  }

  // 2. Empresa Cliente (Deduplicação por CNPJ prioritária antes de nome/tokens)
  let company = null;
  const cleanParsedCompanyCnpj = cleanCnpj(parsed.companyCnpj);
  if (cleanParsedCompanyCnpj) {
    company = db.companies.find(c => cleanCnpj(c.cnpj) === cleanParsedCompanyCnpj);
  }

  if (!company && parsed.companyName) {
    const targetCompNorm = normStr(parsed.companyName);
    company = db.companies.find(c => {
      const tNorm = normStr(c.tradeName);
      const cNorm = normStr(c.corporateName);
      return (
        (tNorm && (tNorm === targetCompNorm || tNorm.includes(targetCompNorm) || targetCompNorm.includes(tNorm))) ||
        (cNorm && (cNorm === targetCompNorm || cNorm.includes(targetCompNorm) || targetCompNorm.includes(cNorm)))
      );
    });
  }

  if (parsed.companyName || company) {
    const knownCompDir = resolveKnownCnpjDirectory(parsed.companyCnpj || company?.cnpj || "");
    const compCnpjData = {
      logradouro: parsed.companyAddress || knownCompDir?.logradouro || "",
      numero: parsed.companyNumber || knownCompDir?.numero || "",
      complemento: parsed.companyComplement || knownCompDir?.complemento || "",
      bairro: parsed.companyNeighborhood || knownCompDir?.bairro || "",
      cep: parsed.companyCep || knownCompDir?.cep || "",
      cidade: parsed.companyCity || knownCompDir?.cidade || "",
      uf: parsed.companyState || knownCompDir?.uf || "",
      codigoMunicipio: parsed.companyIbgeCode || knownCompDir?.codigoMunicipio || ""
    };
    if (!company) {
      const nextCompId = db.companies.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0) + 1;
      company = {
        id: nextCompId,
        name: parsed.companyName,
        corporateName: parsed.companyName,
        razaoSocial: parsed.companyName,
        tradeName: knownCompDir?.nomeFantasia || parsed.companyName,
        nomeFantasia: knownCompDir?.nomeFantasia || parsed.companyName,
        cnpj: parsed.companyCnpj || "",
        email: parsed.nfDeliveryEmails?.[0] || "",
        financialEmail: parsed.nfDeliveryEmails?.[0] || "",
        emailFinanceiro: parsed.nfDeliveryEmails?.[0] || "",
        phone: parsed.agencyAgentPhone || "",
        address: compCnpjData.logradouro || "",
        logradouro: compCnpjData.logradouro || "",
        endereco: compCnpjData.logradouro || "",
        number: compCnpjData.numero || "",
        numero: compCnpjData.numero || "",
        complement: compCnpjData.complemento || "",
        complemento: compCnpjData.complemento || "",
        neighborhood: compCnpjData.bairro || "",
        bairro: compCnpjData.bairro || "",
        cep: compCnpjData.cep || "",
        city: compCnpjData.cidade || "",
        cidade: compCnpjData.cidade || "",
        state: compCnpjData.uf || "",
        uf: compCnpjData.uf || "",
        ibgeCode: compCnpjData.codigoMunicipio || "",
        codigoMunicipio: compCnpjData.codigoMunicipio || "",
        billingType: "faturado_b2b",
        billingTerms: parsed.invoicingInstructions || "",
        invoicingInstructions: parsed.invoicingInstructions || "",
        notes: "Empresa vinculada automaticamente via voucher B2B.",
        createdAt: new Date().toISOString()
      };
      db.companies.push(company);
    } else {
      if (parsed.companyCnpj && !company.cnpj) {
        company.cnpj = parsed.companyCnpj;
      }
      if (parsed._explicitCompanyAddress && parsed.companyAddress) {
        // Soberania absoluta do endereço fiscal impresso no voucher sobre dicionário/Receita anterior
        company.address = parsed.companyAddress;
        company.logradouro = parsed.companyAddress;
        company.endereco = parsed.companyAddress;
        company.number = parsed.companyNumber || "S/N";
        company.numero = parsed.companyNumber || "S/N";
        company.complement = parsed.companyComplement || "";
        company.complemento = parsed.companyComplement || "";
        if (parsed.companyNeighborhood) {
          company.neighborhood = parsed.companyNeighborhood;
          company.bairro = parsed.companyNeighborhood;
        }
        if (parsed.companyCep) company.cep = parsed.companyCep;
        if (parsed.companyCity) {
          company.city = parsed.companyCity;
          company.cidade = parsed.companyCity;
        }
        if (parsed.companyState) {
          company.state = parsed.companyState;
          company.uf = parsed.companyState;
        }
        if (parsed.companyIbgeCode) {
          company.ibgeCode = parsed.companyIbgeCode;
          company.codigoMunicipio = parsed.companyIbgeCode;
        }
      } else if (compCnpjData.logradouro || compCnpjData.cep || compCnpjData.cidade) {
        enrichCrmEntityWithCnpjData(company, compCnpjData);
      }
      if (parsed.invoicingInstructions) {
        company.billingTerms = parsed.invoicingInstructions;
        company.invoicingInstructions = parsed.invoicingInstructions;
      }
      if (parsed.agencyAgentPhone && !company.phone) {
        company.phone = parsed.agencyAgentPhone;
      }
      if (parsed.nfDeliveryEmails?.[0] && (!company.financialEmail || parsed._explicitTier1NfEmails)) {
        company.financialEmail = parsed.nfDeliveryEmails[0];
        company.emailFinanceiro = parsed.nfDeliveryEmails[0];
      }
    }
  }

  // 3. Hóspede Corporativo (busca por nome exato ou tokens equivalentes)
  const targetGuestNorm = normStr(parsed.guestName);
  const parsedGuestTokens = extractNameTokens(parsed.guestName);
  let guest = db.guests.find(g => {
    const gNorm = normStr(g.fullName || g.name);
    if (gNorm === targetGuestNorm) return true;
    const gTokens = extractNameTokens(g.fullName || g.name);
    return (
      parsedGuestTokens.length >= 2 &&
      gTokens.length >= 2 &&
      parsedGuestTokens.every(t => gTokens.includes(t)) &&
      gTokens.every(t => parsedGuestTokens.includes(t))
    );
  });
  if (!guest) {
    const nextGuestId = db.guests.reduce((m, g) => Math.max(m, Number(g.id) || 0), 0) + 1;
    guest = {
      id: nextGuestId,
      name: parsed.guestName,
      fullName: parsed.guestName,
      cpf: "",
      documentType: "CPF",
      documentNumber: "",
      phone: "",
      whatsapp: "",
      email: "",
      companyId: company?.id || null,
      companyName: company?.tradeName || parsed.companyName || "",
      agencyId: agency?.id || null,
      agencyName: agency?.tradeName || parsed.agencyName || "",
      category: "Corporativo B2B",
      notes: `Hóspede B2B Reserva #${resNum}`,
      createdAt: new Date().toISOString()
    };
    db.guests.push(guest);
  } else {
    if (company?.id && !guest.companyId) {
      guest.companyId = company.id;
      guest.companyName = company.tradeName || parsed.companyName;
    }
    if (agency?.id && !guest.agencyId) {
      guest.agencyId = agency.id;
      guest.agencyName = agency.tradeName || parsed.agencyName;
    }
  }

  // 4. Reserva B2B (Cria em flat disponível ou enriquece reserva existente/manual)
  let reservation = db.reservations.find(
    r =>
      r &&
      r.status !== "cancelada" &&
      r.status !== "cancelled" &&
      (String(r.b2bReservationNumber || "") === resNum ||
        String(r.externalReservationNumber || "") === resNum ||
        String(r.b2bLocatorRloc || "") === resNum)
  );

  // Fallback inteligente: vincula reserva manual já criada para o mesmo hóspede e mesma data de check-in (ex: RES-512-0530 Valtencir Soares no Flat 512)
  if (!reservation && parsedGuestTokens.length > 0 && parsed.checkinDate) {
    reservation = db.reservations.find(r => {
      if (!r || r.status === "cancelada" || r.status === "cancelled") return false;
      if (r.b2bReservationNumber && String(r.b2bReservationNumber) !== resNum) return false;
      if (r.checkinDate !== parsed.checkinDate) return false;
      const resTokens = extractNameTokens(r.guestName || "");
      if (resTokens.length === 0) return false;
      const allResInParsed = resTokens.every(t => parsedGuestTokens.includes(t));
      const allParsedInRes = parsedGuestTokens.every(t => resTokens.includes(t));
      const sharedCount = resTokens.filter(t => parsedGuestTokens.includes(t)).length;
      return (
        allResInParsed ||
        allParsedInRes ||
        sharedCount >= 2 ||
        (resTokens.length === 1 && resTokens[0].length >= 5 && parsedGuestTokens.includes(resTokens[0]))
      );
    });
  }

  const checkinDate = parsed.checkinDate || reservation?.checkinDate;
  let checkoutDate = (parsed._explicitCheckout === false && reservation?.checkoutDate) ? "" : (parsed.checkoutDate || "");
  const parsedDailyRate = Number(parsed.dailyRate) || 0;
  const parsedTotalAmount = Number(parsed.totalAmount) || 0;

  // Resolução segura de noites (4-tier):
  // 1. parsed.nights explícito > 0 (apenas quando _explicitCheckout !== false ou reserva nova)
  // 2. Ou diferença entre checkoutDate e checkinDate se checkoutDate fornecido
  // 3. Ou fallback matemático: parsed.totalAmount / parsed.dailyRate
  // 4. Ou reserva existente / fallback mínimo de 1 diária
  let nights = 0;
  if (parsed._explicitCheckout !== false && Number(parsed.nights) > 0) {
    nights = Math.round(Number(parsed.nights));
  } else if (checkoutDate && checkinDate) {
    const diffDays = Math.round(
      (new Date(`${checkoutDate}T12:00:00Z`).getTime() - new Date(`${checkinDate}T12:00:00Z`).getTime()) / 86400000
    );
    if (diffDays > 0) nights = diffDays;
  } else if (parsedTotalAmount > 0 && parsedDailyRate > 0) {
    const mathNights = Math.round(parsedTotalAmount / parsedDailyRate);
    if (mathNights > 0) nights = mathNights;
  } else if (reservation?.checkoutDate && checkinDate && reservation.checkoutDate > checkinDate) {
    const resDiff = Math.round(
      (new Date(`${reservation.checkoutDate}T12:00:00Z`).getTime() - new Date(`${checkinDate}T12:00:00Z`).getTime()) / 86400000
    );
    if (resDiff > 0) {
      checkoutDate = reservation.checkoutDate;
      nights = resDiff;
    }
  } else if (Number(parsed.nights) > 0) {
    nights = Math.round(Number(parsed.nights));
  }

  if (!nights || nights < 1) {
    nights = Number(reservation?.nights) > 0 ? Math.round(Number(reservation.nights)) : 1;
  }

  if (checkoutDate && checkinDate && checkoutDate <= checkinDate) {
    checkoutDate = new Date(new Date(`${checkinDate}T12:00:00Z`).getTime() + (nights || 1) * 86400000).toISOString().slice(0, 10);
  }

  // Se checkoutDate não foi informado, computa checkinDate + nights dias usando meio-dia UTC
  if (!checkoutDate && checkinDate) {
    checkoutDate = new Date(new Date(`${checkinDate}T12:00:00Z`).getTime() + nights * 86400000).toISOString().slice(0, 10);
  }

  let dailyRate = parsedDailyRate;
  if (!dailyRate && parsedTotalAmount > 0 && nights > 0) {
    dailyRate = +(parsedTotalAmount / nights).toFixed(2);
  }
  if (!dailyRate) {
    dailyRate = Number(reservation?.dailyRate) || 280;
  }

  const totalAmount = parsedTotalAmount > 0 ? +(parsedTotalAmount.toFixed(2)) : +(dailyRate * nights).toFixed(2);
  const hasExplicitPolicy =
    parsed._explicitRatePolicy !== false &&
    (parsed._explicitRatePolicy === true ||
      Number(parsed.b2bCommissionPct) > 0 ||
      parsed.b2bRatePolicy === "COMISSIONADA");
  const resolvedRatePolicy = hasExplicitPolicy
    ? (parsed.b2bRatePolicy || "COMISSIONADA")
    : (reservation?.b2bRatePolicy || agency?.defaultRatePolicy || parsed.b2bRatePolicy || "COMISSIONADA");
  const commPct = hasExplicitPolicy
    ? (Number(parsed.b2bCommissionPct) || (resolvedRatePolicy === "NET" ? 0 : 12))
    : Number(
        reservation?.b2bCommissionPct ??
          agency?.defaultCommissionPct ??
          parsed.b2bCommissionPct ??
          (resolvedRatePolicy === "NET" ? 0 : 12)
      ) || 0;
  const b2bCommissionAmount =
    hasExplicitPolicy && parsed.b2bCommissionAmount !== undefined && Number(parsed.b2bCommissionAmount) > 0
      ? Number(parsed.b2bCommissionAmount)
      : +((totalAmount * commPct) / 100).toFixed(2);
  const b2bNetRate = +(dailyRate * (1 - commPct / 100)).toFixed(2);
  const b2bNetAmount =
    hasExplicitPolicy && parsed.b2bNetAmount !== undefined && Number(parsed.b2bNetAmount) > 0
      ? Number(parsed.b2bNetAmount)
      : +(totalAmount - b2bCommissionAmount).toFixed(2);
  const hasExplicitRecipient =
    parsed._explicitInvoiceRecipient !== false &&
    (parsed._explicitInvoiceRecipient === true ||
      (parsed.invoiceRecipientType && parsed.invoiceRecipientType !== "guest"));
  const resolvedRecipientType = hasExplicitRecipient
    ? parsed.invoiceRecipientType
    : (reservation?.invoiceRecipientType ||
       agency?.defaultInvoiceRecipient ||
       agency?.defaultRecipientType ||
       parsed.invoiceRecipientType ||
       "company");

  // Geração determinística de dailyRates (F3) para todas as noites da estadia
  const dailyRates = [];
  if (checkinDate && nights > 0) {
    const startCheckinMs = new Date(`${checkinDate}T12:00:00Z`).getTime();
    for (let i = 0; i < nights; i++) {
      const nightDate = new Date(startCheckinMs + i * 86400000).toISOString().slice(0, 10);
      dailyRates.push({
        date: nightDate,
        rate: dailyRate,
        channel: "b2b"
      });
    }
  }

  const firstCrmAgent = Array.isArray(agency?.agents)
    ? agency.agents.find(ag => ag && typeof ag === "object" && (ag.name || ag.email || ag.phone || ag.whatsapp))
    : null;

  let created = false;
  const resolvedOperationalFirstAgentEmail =
    firstCrmAgent?.email && !isPureBillingMailbox(firstCrmAgent.email) ? firstCrmAgent.email : "";
  const resolvedOperationalAgencyEmail =
    agency?.email && !isPureBillingMailbox(agency.email) ? agency.email : "";

  if (!reservation) {
    const flat = findAvailableFlatForPeriod(db, checkinDate, checkoutDate);
    const nextResId = db.reservations.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
    const initialSolicitanteEmail =
      parsed.agencyAgentEmail ||
      resolvedOperationalFirstAgentEmail ||
      resolvedOperationalAgencyEmail ||
      "";
    const initialAgentName = parsed.agencyAgentName || firstCrmAgent?.name || "";
    const initialAgentPhone =
      parsed.agencyAgentPhone ||
      firstCrmAgent?.whatsapp ||
      firstCrmAgent?.phone ||
      agency?.whatsapp ||
      agency?.phone ||
      "";

    reservation = {
      id: nextResId,
      code: `RES-${flat.number}-B2B-${resNum}`,
      flatId: flat.id,
      flatNumber: String(flat.number),
      guestId: guest.id,
      guestName: guest.fullName,
      guestEmail: guest.email || "",
      guestPhone: guest.phone || "",
      guestDocument: guest.cpf || "",
      companyId: company?.id || null,
      companyName: company?.tradeName || parsed.companyName || "",
      companyCnpj: parsed.companyCnpj || company?.cnpj || "",
      companyAddress: parsed._explicitCompanyAddress ? (parsed.companyAddress || "") : (company?.address || parsed.companyAddress || ""),
      companyNumber: parsed._explicitCompanyAddress ? (parsed.companyNumber || "S/N") : (company?.number || parsed.companyNumber || ""),
      companyComplement: parsed._explicitCompanyAddress ? (parsed.companyComplement || "") : (company?.complement || parsed.companyComplement || ""),
      companyNeighborhood: parsed._explicitCompanyAddress ? (parsed.companyNeighborhood || "") : (company?.neighborhood || parsed.companyNeighborhood || ""),
      companyCep: parsed._explicitCompanyAddress ? (parsed.companyCep || "") : (company?.cep || parsed.companyCep || ""),
      companyCity: parsed._explicitCompanyAddress ? (parsed.companyCity || "") : (company?.city || parsed.companyCity || ""),
      companyState: parsed._explicitCompanyAddress ? (parsed.companyState || "") : (company?.state || parsed.companyState || ""),
      companyIbgeCode: parsed._explicitCompanyAddress ? (parsed.companyIbgeCode || "") : (company?.ibgeCode || parsed.companyIbgeCode || ""),
      agencyId: agency?.id || null,
      agencyName: agency?.tradeName || parsed.agencyName || "",
      agencyTradeName: agency?.tradeName || parsed.agencyName || "",
      agencyCorporateName: agency?.corporateName || parsed.agencyName || "",
      agencyCnpj: parsed.agencyCnpj || agency?.cnpj || "",
      agencyPosUnit: parsed.agencyPosUnit || "",
      agencyAgentName: initialAgentName,
      agencyAgentEmail: initialSolicitanteEmail,
      agencyAgentPhone: initialAgentPhone,
      requesterInfo: {
        name: initialAgentName || agency?.tradeName || parsed.agencyName || "",
        phone: initialAgentPhone,
        email: initialSolicitanteEmail
      },
      invoicingInstructions: parsed.invoicingInstructions || "",
      checkinDate,
      checkoutDate,
      nights,
      dailyRate,
      totalAmount,
      dailyRates,
      status: "confirmada",
      channel: "b2b",
      requesterType: "agency_b2b",
      paymentStatus: "pendente",
      paymentMethod: parsed.b2bPaymentType === "FATURADO" ? "faturado_b2b" : "vcn_b2b",
      hasBreakfast: parsed.hasBreakfast !== false,
      includeBreakfast: parsed.hasBreakfast !== false,
      b2bReservationNumber: resNum,
      externalReservationNumber: resNum,
      b2bLocatorRloc: parsed.b2bLocatorRloc || resNum,
      b2bOriginType: parsed.b2bOriginType || "BOOKING_WS",
      b2bRatePolicy: resolvedRatePolicy,
      b2bCommissionPct: commPct,
      b2bCommissionAmount,
      b2bNetRate,
      b2bNetAmount,
      b2bPaymentType: parsed.b2bPaymentType || "VIRTUAL_CARD",
      b2bCardBrand: parsed.b2bCardBrand || "",
      b2bCardMasked: parsed.b2bCardMasked || "",
      b2bVcnToken: parsed.b2bVcnToken || "",
      b2bAuthorizedExpenses: parsed.b2bAuthorizedExpenses || "DEBITAR SOMENTE DIARIAS",
      b2bConciliationUrl: parsed.b2bConciliationUrl || "",
      voucherUrl: parsed.voucherUrl || "",
      b2bVoucherUrl: parsed.voucherUrl || "",
      costCenter: parsed.costCenter || "",
      invoiceRecipientType: resolvedRecipientType,
      nfRecipientType: resolvedRecipientType,
      nfDeliveryEmails: Array.isArray(parsed.nfDeliveryEmails) ? parsed.nfDeliveryEmails : [],
      nfHideFromGuest: parsed._explicitNfHide ? Boolean(parsed.nfHideFromGuest) : (resolvedRecipientType !== "guest"),
      preCheckinUnlocked: true,
      accessUnlocked: true,
      credentialToken: `B2B-${resNum}`,
      credentialStatus: guest.phone && guest.cpf ? "completed" : "pending_agency",
      createdAt: new Date().toISOString()
    };
    db.reservations.push(reservation);
    created = true;
  } else {
    // Enriquece a reserva existente (ou manual, preservando Flat, código e telefone já lançados)
    reservation.channel = "b2b";
    reservation.requesterType = "agency_b2b";
    reservation.b2bReservationNumber = resNum;
    reservation.externalReservationNumber = reservation.externalReservationNumber || resNum;
    reservation.b2bLocatorRloc = parsed.b2bLocatorRloc || reservation.b2bLocatorRloc || resNum;
    reservation.b2bOriginType = parsed.b2bOriginType || reservation.b2bOriginType || "BOOKING_WS";

    if (guest?.id && !reservation.guestId) {
      reservation.guestId = guest.id;
    }
    if (reservation.guestPhone && guest && !guest.phone) {
      guest.phone = reservation.guestPhone;
      guest.whatsapp = reservation.guestPhone;
    }
    if (reservation.guestDocument && guest && !guest.cpf) {
      guest.cpf = reservation.guestDocument;
      guest.documentNumber = reservation.guestDocument;
    }
    if (reservation.guestEmail && guest && !guest.email) {
      guest.email = reservation.guestEmail;
    }

    if (agency?.id) {
      reservation.agencyId = agency.id;
      reservation.agencyName = agency.corporateName || agency.tradeName || parsed.agencyName || reservation.agencyName || "";
      reservation.agencyTradeName = agency.tradeName || parsed.agencyName || reservation.agencyTradeName || "";
      reservation.agencyCorporateName = agency.corporateName || parsed.agencyName || reservation.agencyCorporateName || "";
      reservation.agencyCnpj = parsed.agencyCnpj || agency.cnpj || reservation.agencyCnpj || "";
    } else if (
      parsed.agencyName &&
      (!reservation.agencyName || normStr(reservation.agencyName) === normStr(reservation.companyName))
    ) {
      reservation.agencyName = parsed.agencyName;
      reservation.agencyTradeName = parsed.agencyName;
    }
    if (parsed.agencyCnpj) {
      reservation.agencyCnpj = parsed.agencyCnpj;
    }
    if (parsed.agencyPosUnit) {
      reservation.agencyPosUnit = parsed.agencyPosUnit;
    }
    if (parsed.agencyAgentName) {
      const isGenericSystemAgent = /^(?:ARGO\.|WEBSERVICE|PAYTRACK|SISTEMA|B2B)/i.test(String(parsed.agencyAgentName).trim());
      if (
        !reservation.agencyAgentName ||
        !isGenericSystemAgent ||
        /^(?:ARGO\.|WEBSERVICE|PAYTRACK|SISTEMA|B2B)/i.test(String(reservation.agencyAgentName).trim())
      ) {
        reservation.agencyAgentName = parsed.agencyAgentName;
      }
    } else if (!reservation.agencyAgentName && firstCrmAgent?.name) {
      reservation.agencyAgentName = firstCrmAgent.name;
    }
    if (parsed.agencyAgentPhone) {
      reservation.agencyAgentPhone = parsed.agencyAgentPhone;
    } else if (!reservation.agencyAgentPhone) {
      const crmAgPhone = firstCrmAgent?.whatsapp || firstCrmAgent?.phone || agency?.whatsapp || agency?.phone || "";
      if (crmAgPhone) reservation.agencyAgentPhone = crmAgPhone;
    }
    const agentEmailCandidate =
      parsed.agencyAgentEmail ||
      resolvedOperationalFirstAgentEmail ||
      resolvedOperationalAgencyEmail ||
      "";
    if (agentEmailCandidate && (!reservation.agencyAgentEmail || parsed.agencyAgentEmail || isPureBillingMailbox(reservation.agencyAgentEmail))) {
      reservation.agencyAgentEmail = agentEmailCandidate;
    }
    reservation.requesterInfo = {
      name: reservation.agencyAgentName || reservation.agencyTradeName || reservation.agencyName || "",
      phone: reservation.agencyAgentPhone || "",
      email: reservation.agencyAgentEmail || ""
    };

    if (company?.id) {
      reservation.companyId = company.id;
      reservation.companyName = company.corporateName || company.tradeName || parsed.companyName || reservation.companyName || "";
      reservation.companyCnpj = parsed.companyCnpj || company.cnpj || reservation.companyCnpj || "";
    } else if (parsed.companyName) {
      reservation.companyName = parsed.companyName;
    }
    if (parsed.companyCnpj) {
      reservation.companyCnpj = parsed.companyCnpj;
    }
    const resolvedCompAddr = parsed._explicitCompanyAddress
      ? (parsed.companyAddress || "")
      : (company?.address || parsed.companyAddress || "");
    if (
      resolvedCompAddr &&
      (parsed._explicitCompanyAddress ||
        !reservation.companyAddress ||
        isGenericPelincaCompanyAddress({ address: reservation.companyAddress, cep: reservation.companyCep }))
    ) {
      reservation.companyAddress = resolvedCompAddr;
      reservation.companyNumber = parsed._explicitCompanyAddress
        ? (parsed.companyNumber || "S/N")
        : (company?.number || parsed.companyNumber || reservation.companyNumber || "");
      reservation.companyComplement = parsed._explicitCompanyAddress
        ? (parsed.companyComplement || "")
        : (company?.complement || parsed.companyComplement || reservation.companyComplement || "");
      reservation.companyNeighborhood = parsed._explicitCompanyAddress
        ? (parsed.companyNeighborhood || "")
        : (company?.neighborhood || parsed.companyNeighborhood || reservation.companyNeighborhood || "");
      reservation.companyCep = parsed._explicitCompanyAddress
        ? (parsed.companyCep || "")
        : (company?.cep || parsed.companyCep || reservation.companyCep || "");
      reservation.companyCity = parsed._explicitCompanyAddress
        ? (parsed.companyCity || "")
        : (company?.city || parsed.companyCity || reservation.companyCity || "");
      reservation.companyState = parsed._explicitCompanyAddress
        ? (parsed.companyState || "")
        : (company?.state || parsed.companyState || reservation.companyState || "");
      reservation.companyIbgeCode = parsed._explicitCompanyAddress
        ? (parsed.companyIbgeCode || "")
        : (company?.ibgeCode || parsed.companyIbgeCode || reservation.companyIbgeCode || "");
    }
    if (parsed.costCenter) {
      reservation.costCenter = parsed.costCenter;
    }
    if (parsed.invoicingInstructions) {
      reservation.invoicingInstructions = parsed.invoicingInstructions;
    }

    reservation.checkinDate = checkinDate;
    reservation.checkoutDate = checkoutDate;
    reservation.nights = nights;
    reservation.dailyRate = dailyRate;
    reservation.totalAmount = totalAmount;
    reservation.dailyRates = dailyRates;
    if (parsed.hasBreakfast !== undefined) {
      reservation.hasBreakfast = parsed.hasBreakfast !== false;
      reservation.includeBreakfast = parsed.hasBreakfast !== false;
    }

    reservation.b2bRatePolicy = resolvedRatePolicy;
    reservation.b2bCommissionPct = commPct;
    reservation.b2bCommissionAmount = b2bCommissionAmount;
    reservation.b2bNetRate = b2bNetRate;
    reservation.b2bNetAmount = b2bNetAmount;
    reservation.b2bPaymentType = parsed.b2bPaymentType || reservation.b2bPaymentType || "VIRTUAL_CARD";
    reservation.paymentMethod =
      reservation.b2bPaymentType === "FATURADO"
        ? "faturado_b2b"
        : !reservation.paymentMethod || reservation.paymentMethod === "pix"
          ? "vcn_b2b"
          : reservation.paymentMethod;

    if (parsed.b2bCardMasked) {
      reservation.b2bCardMasked = parsed.b2bCardMasked;
    }
    if (parsed.b2bCardBrand) {
      reservation.b2bCardBrand = parsed.b2bCardBrand;
    }
    if (parsed.b2bVcnToken) {
      reservation.b2bVcnToken = parsed.b2bVcnToken;
    }
    if (parsed.b2bAuthorizedExpenses && !reservation.b2bAuthorizedExpenses) {
      reservation.b2bAuthorizedExpenses = parsed.b2bAuthorizedExpenses;
    }
    if (parsed.b2bConciliationUrl) {
      reservation.b2bConciliationUrl = parsed.b2bConciliationUrl;
    }
    if (parsed.voucherUrl) {
      reservation.voucherUrl = parsed.voucherUrl;
      reservation.b2bVoucherUrl = parsed.voucherUrl;
    }

    reservation.invoiceRecipientType = resolvedRecipientType;
    reservation.nfRecipientType = resolvedRecipientType;
    if (Array.isArray(parsed.nfDeliveryEmails) && parsed.nfDeliveryEmails.length > 0) {
      if (parsed._explicitTier1NfEmails) {
        reservation.nfDeliveryEmails = Array.from(new Set(parsed.nfDeliveryEmails));
      } else {
        const existingCleanNf = (Array.isArray(reservation.nfDeliveryEmails) ? reservation.nfDeliveryEmails : []).filter(
          e => e && String(e).trim().toLowerCase() !== "conciliacao@b2breservas.com.br"
        );
        const mergedEmails = new Set([...existingCleanNf, ...parsed.nfDeliveryEmails]);
        reservation.nfDeliveryEmails = Array.from(mergedEmails);
      }
    }
    if (parsed.nfHideFromGuest === true || parsed._explicitNfHide === true || reservation.nfHideFromGuest === undefined) {
      reservation.nfHideFromGuest = Boolean(parsed.nfHideFromGuest);
    }
    if (!reservation.credentialToken) {
      reservation.credentialToken = `B2B-${resNum}`;
    }
    if (!reservation.credentialStatus) {
      reservation.credentialStatus =
        reservation.guestPhone && reservation.guestDocument ? "completed" : "pending_agency";
    }
    reservation.updatedAt = new Date().toISOString();
  }

  // Trava Anti-Erro (Decisão 3): Alerta imediato ao WhatsApp do gestor se faltar e-mail do solicitante ou de NFS-e (sem inventar e-mails!)
  const missingCriticalEmails = [];
  if (isMissingGuestDataForCredential(reservation) && !resolveB2bCredentialTargetEmail(reservation, db)) {
    missingCriticalEmails.push("E-mail do Solicitante (Reservado por)");
  }
  if (!Array.isArray(reservation.nfDeliveryEmails) || reservation.nfDeliveryEmails.length === 0) {
    missingCriticalEmails.push("E-mail p/ Envio da NFS-e");
  }
  if (missingCriticalEmails.length > 0) {
    notifyManagerB2bMissingDataAlert(db, reservation, missingCriticalEmails).catch(() => {});
  }

  // Se a reserva possuir confirmedFiscalData ou invoiceDetails poluídos com o fallback "Av. Pelinca" para um CNPJ real, corrige imediatamente
  if (company && company.address && !isGenericPelincaCompanyAddress(company)) {
    for (const overlayKey of ["confirmedFiscalData", "invoiceDetails"]) {
      const ov = reservation?.[overlayKey];
      if (!ov) continue;
      const ovDoc = cleanCnpj(ov.tomadorCpfCnpj || ov.doc || "");
      const compDoc = cleanCnpj(company.cnpj || "");
      if (
        (ovDoc.length === 14 && ovDoc === compDoc) ||
        (ov.tomadorTipo === "PJ" && isGenericPelincaCompanyAddress({
          address: ov.tomadorEndereco,
          cep: ov.tomadorCep,
          neighborhood: ov.tomadorBairro,
          city: ov.tomadorCidade
        }))
      ) {
        if (isGenericPelincaCompanyAddress({
          address: ov.tomadorEndereco,
          cep: ov.tomadorCep,
          neighborhood: ov.tomadorBairro,
          city: ov.tomadorCidade
        })) {
          ov.tomadorEndereco = company.address || company.logradouro;
          ov.tomadorNumero = company.number || company.numero || "S/N";
          ov.tomadorComplemento = company.complement || company.complemento || "";
          ov.tomadorBairro = company.neighborhood || company.bairro || "";
          ov.tomadorCep = String(company.cep || "").replace(/\D/g, "");
          ov.tomadorCidade = company.city || company.cidade || "";
          ov.tomadorUf = company.state || company.uf || "";
          ov.tomadorCodigoMunicipio = String(company.ibgeCode || company.codigoMunicipio || "").replace(/\D/g, "");
        }
      }
    }
  }

  // Disparo cordial automático (E-mail + WhatsApp validado) se a reserva B2B ainda estiver sem dados do hóspede
  if (autoSendCredentialEmail && isMissingGuestDataForCredential(reservation)) {
    if (!hasB2bCredentialEmailAlreadyBeenSent(db, reservation, "initial")) {
      dispatchB2bAgencyCredentialEmail(db, saveDatabase, reservation, {
        trigger: "b2b_auto_credential_request",
        stageKey: "initial"
      }).catch(err => {
        console.warn("[B2B Auto Credential] Aviso ao disparar e-mail de credenciamento à agência:", err.message);
      });
    }
    if (!reservation.b2bCredentialWhatsappSentAt) {
      dispatchRequesterGuestCredentialRequest(db, saveDatabase, reservation, {
        stageKey: "initial",
        isReminder: false
      }).catch(err => {
        console.warn("[B2B Auto Credential] Aviso ao disparar WhatsApp de credenciamento à agência:", err.message);
      });
    }
  }

  // Se a empresa ou agência possui CNPJ de 14 dígitos mas ainda está sem endereço real, consulta Receita Federal / BrasilAPI em background
  const needsCompanyLookup = Boolean(
    company &&
    cleanCnpj(company.cnpj).length === 14 &&
    (!company.address || isGenericPelincaCompanyAddress(company))
  );
  const needsAgencyLookup = Boolean(
    agency &&
    cleanCnpj(agency.cnpj).length === 14 &&
    (!agency.address || isGenericPelincaCompanyAddress(agency))
  );
  if ((needsCompanyLookup || needsAgencyLookup) && process.env.NODE_ENV !== "test") {
    enrichB2bIngestedEntitiesCnpj(db, { company, agency, reservation, saveDatabase }).catch(() => {});
  }

  if (typeof saveDatabase === "function") saveDatabase();
  return { ok: true, created, reservation, agency, company, guest };
}

export async function enrichB2bIngestedEntitiesCnpj(db, { company, agency, reservation, saveDatabase } = {}) {
  let updated = false;
  const cleanDigits = v => String(v || "").replace(/\D/g, "");
  if (company && cleanDigits(company.cnpj).length === 14 && (!company.address || isGenericPelincaCompanyAddress(company))) {
    try {
      const info = await lookupCnpj(company.cnpj, db);
      if (info && !info.error && (info.logradouro || info.cep || info.cidade)) {
        if (enrichCrmEntityWithCnpjData(company, info)) {
          updated = true;
        }
        if (reservation && company.address && !isGenericPelincaCompanyAddress(company)) {
          reservation.companyAddress = company.address;
          reservation.companyNumber = company.number || "S/N";
          reservation.companyComplement = company.complement || "";
          reservation.companyNeighborhood = company.neighborhood || "";
          reservation.companyCep = cleanDigits(company.cep);
          reservation.companyCity = company.city || "";
          reservation.companyState = company.state || "";
          reservation.companyIbgeCode = cleanDigits(company.ibgeCode);
          updated = true;
        }
        for (const overlayKey of ["confirmedFiscalData", "invoiceDetails"]) {
          const ov = reservation?.[overlayKey];
          if (!ov) continue;
          if (isGenericPelincaCompanyAddress({
            address: ov.tomadorEndereco,
            cep: ov.tomadorCep,
            neighborhood: ov.tomadorBairro,
            city: ov.tomadorCidade
          })) {
            ov.tomadorEndereco = company.address || company.logradouro;
            ov.tomadorNumero = company.number || company.numero || "S/N";
            ov.tomadorComplemento = company.complement || company.complemento || "";
            ov.tomadorBairro = company.neighborhood || company.bairro || "";
            ov.tomadorCep = cleanDigits(company.cep);
            ov.tomadorCidade = company.city || company.cidade || "";
            ov.tomadorUf = company.state || company.uf || "";
            ov.tomadorCodigoMunicipio = cleanDigits(company.ibgeCode || company.codigoMunicipio);
            updated = true;
          }
        }
      }
    } catch {
      // Silencioso
    }
  }
  if (agency && cleanDigits(agency.cnpj).length === 14 && (!agency.address || isGenericPelincaCompanyAddress(agency))) {
    try {
      const info = await lookupCnpj(agency.cnpj, db);
      if (info && !info.error && (info.logradouro || info.cep || info.cidade)) {
        if (enrichCrmEntityWithCnpjData(agency, info)) {
          updated = true;
        }
      }
    } catch {
      // Silencioso
    }
  }
  if (updated && typeof saveDatabase === "function") {
    saveDatabase();
  }
  return updated;
}

// Trava em memória contra disparos concorrentes de credenciamento para a mesma reserva
const inFlightB2bCredentialLocks = new Set();
let isRunningPendingB2bDispatches = false;
let lastPendingB2bDispatchCheckAt = 0;

function getB2bReservationLockKeys(reservation) {
  const keys = [];
  if (!reservation) return keys;
  const resId = String(reservation.id || "").trim();
  const resCode = String(reservation.code || "").trim().toUpperCase();
  const b2bNum = String(reservation.b2bReservationNumber || reservation.externalReservationNumber || "").trim();
  if (resId) keys.push(`ID:${resId}`);
  if (resCode) keys.push(`CODE:${resCode}`);
  if (b2bNum) keys.push(`B2B:${b2bNum}`);
  return keys;
}

function getCommCredentialStageKey(c) {
  if (c?.metadata?.stageKey) return String(c.metadata.stageKey).trim();
  const trig = String(c?.metadata?.trigger || "").toLowerCase();
  if (trig.includes("reminder_")) {
    const idx = trig.indexOf("reminder_");
    return trig.slice(idx);
  }
  const subj = String(c?.subject || "").toLowerCase();
  if (subj.includes("check-in hoje")) return "reminder_checkin";
  if (subj.includes("lembrete")) return "reminder_legacy";
  return "initial";
}

function isB2bCredentialCommMatch(c, resCodeUpper, resIdStr, b2bNum) {
  if (!c || c.type !== "email") return false;
  if (c.direction && c.direction !== "outbound") return false;
  const cRes = String(c.reservation_id || "").trim().toUpperCase();
  const cMetaCode = String(c.metadata?.reservationCode || "").trim().toUpperCase();
  const cMetaB2b = String(c.metadata?.b2bReservationNumber || "").trim();
  const subj = String(c.subject || "").toLowerCase();
  const trig = String(c.metadata?.trigger || "").toLowerCase();

  const matchesRes =
    (resCodeUpper && (cRes === resCodeUpper || cMetaCode === resCodeUpper || subj.includes(resCodeUpper.toLowerCase()))) ||
    (resIdStr && cRes === resIdStr) ||
    (b2bNum && (cMetaB2b === b2bNum || subj.includes(b2bNum.toLowerCase())));

  if (!matchesRes) return false;

  return (
    trig.includes("b2b") ||
    trig.includes("credenciamento") ||
    trig.includes("credential") ||
    subj.includes("credenciamento") ||
    subj.includes("dados do hóspede") ||
    subj.includes("dados do hospede")
  );
}

/**
 * Verifica de forma determinística e por estágio (`stageKey`: "initial", "reminder_24h_1", etc.)
 * se o e-mail de Confirmação / Lembrete de Dados do Hóspede já foi enviado para esta reserva.
 */
export function hasB2bCredentialEmailAlreadyBeenSent(db, reservation, stageKey = "initial") {
  if (!reservation) return false;
  if (reservation.b2bCredentialCompletedAt || reservation.credentialStatus === "completed") return true;

  const targetStage = String(stageKey || "initial").trim();
  if (reservation.credentialSentStages?.[targetStage]?.emailSentAt) {
    return true;
  }

  const resCodeUpper = String(reservation.code || "").trim().toUpperCase();
  const resIdStr = String(reservation.id || "").trim();
  const b2bNum = String(reservation.b2bReservationNumber || reservation.externalReservationNumber || "").trim();

  if (targetStage !== "initial") {
    if (Array.isArray(db?.reservationCommunications)) {
      const stageComm = db.reservationCommunications.find(
        c =>
          c &&
          c.status !== "failed" &&
          isB2bCredentialCommMatch(c, resCodeUpper, resIdStr, b2bNum) &&
          getCommCredentialStageKey(c) === targetStage
      );
      if (stageComm) return true;
    }
    return false;
  }

  if (reservation.b2bCredentialEmailSentAt) return true;

  // 1. Verifica se alguma reserva irmã com o mesmo código ou número B2B já possui o carimbo inicial
  if (Array.isArray(db?.reservations) && (b2bNum || resCodeUpper)) {
    const siblingSent = db.reservations.find(
      other =>
        other &&
        other !== reservation &&
        other.b2bCredentialEmailSentAt &&
        ((b2bNum &&
          (String(other.b2bReservationNumber || "").trim() === b2bNum ||
            String(other.externalReservationNumber || "").trim() === b2bNum)) ||
          (resCodeUpper && String(other.code || "").trim().toUpperCase() === resCodeUpper))
    );
    if (siblingSent) {
      reservation.b2bCredentialEmailSentAt = siblingSent.b2bCredentialEmailSentAt;
      reservation.b2bCredentialEmailRecipient =
        reservation.b2bCredentialEmailRecipient || siblingSent.b2bCredentialEmailRecipient || "";
      return true;
    }
  }

  // 2. Verifica em db.reservationCommunications (estágio inicial)
  if (Array.isArray(db?.reservationCommunications)) {
    const comm = db.reservationCommunications.find(
      c =>
        c &&
        c.status !== "failed" &&
        isB2bCredentialCommMatch(c, resCodeUpper, resIdStr, b2bNum) &&
        getCommCredentialStageKey(c) === "initial"
    );
    if (comm) {
      reservation.b2bCredentialEmailSentAt =
        comm.created_at || comm.createdAt || comm.metadata?.sentAt || new Date().toISOString();
      reservation.b2bCredentialEmailRecipient =
        reservation.b2bCredentialEmailRecipient || comm.recipient || reservation.agencyAgentEmail || "";
      return true;
    }
  }

  // 3. Verifica em db.zohoMessagesCache (mensagens enviadas sincronizadas da pasta Sent do Zoho)
  if (Array.isArray(db?.zohoMessagesCache)) {
    const sentZoho = db.zohoMessagesCache.find(zm => {
      if (!zm || (zm.direction !== "outbound" && zm.folder !== "sent")) return false;
      const subj = String(zm.subject || "").toLowerCase();
      const isCredSubj =
        subj.includes("dados do hóspede") ||
        subj.includes("dados do hospede") ||
        subj.includes("credenciamento");
      if (!isCredSubj) return false;
      return (
        (b2bNum && subj.includes(b2bNum.toLowerCase())) ||
        (resCodeUpper && subj.includes(resCodeUpper.toLowerCase()))
      );
    });
    if (sentZoho) {
      reservation.b2bCredentialEmailSentAt = sentZoho.created_at || sentZoho.createdAt || new Date().toISOString();
      reservation.b2bCredentialEmailRecipient =
        reservation.b2bCredentialEmailRecipient || sentZoho.recipient || reservation.agencyAgentEmail || "";
      return true;
    }
  }

  return false;
}

/**
 * Remove registros duplicados de e-mails de credenciamento por estágio (`stageKey`),
 * preservando o envio inicial + cada lembrete legítimo (24h, manhã check-in, 12h check-in).
 */
export function deduplicateB2bCredentialCommunications(db) {
  if (!db || !Array.isArray(db.reservationCommunications)) return 0;
  const seenKeys = new Set();
  const filtered = [];
  let removed = 0;

  for (const c of db.reservationCommunications) {
    if (!c || c.type !== "email") {
      filtered.push(c);
      continue;
    }
    const trig = String(c.metadata?.trigger || "").toLowerCase();
    const subj = String(c.subject || "").toLowerCase();
    const isB2bCred =
      trig.includes("b2b") ||
      trig.includes("credenciamento") ||
      trig.includes("credential") ||
      subj.includes("credenciamento") ||
      subj.includes("dados do hóspede") ||
      subj.includes("dados do hospede");

    if (!isB2bCred) {
      filtered.push(c);
      continue;
    }

    const baseKey = String(
      c.metadata?.b2bReservationNumber ||
      c.metadata?.reservationCode ||
      c.reservation_id ||
      c.subject ||
      ""
    )
      .trim()
      .toUpperCase();

    if (!baseKey) {
      filtered.push(c);
      continue;
    }

    const stagePart = getCommCredentialStageKey(c).toUpperCase();
    const dedupKey = `${baseKey}::${stagePart}`;

    if (seenKeys.has(dedupKey)) {
      removed++;
      continue;
    }
    seenKeys.add(dedupKey);
    filtered.push(c);
  }

  if (removed > 0) {
    db.reservationCommunications = filtered;
  }
  return removed;
}

function resolveRequesterTargetEmail(db, reservation, toEmail = "") {
  const linkedAgency = reservation?.agencyId
    ? (db?.agencies || []).find(a => String(a.id) === String(reservation.agencyId))
    : null;
  const linkedCompany = reservation?.companyId
    ? (db?.companies || []).find(c => String(c.id) === String(reservation.companyId))
    : null;

  const isB2b =
    String(reservation?.channel || "").toLowerCase().includes("b2b") ||
    Boolean(reservation?.b2bReservationNumber) ||
    reservation?.requesterType === "agency_b2b";

  if (isB2b) {
    const strictTarget = resolveB2bCredentialTargetEmail(reservation, db, toEmail);
    return {
      targetEmail: strictTarget,
      linkedAgency,
      linkedCompany,
      agencyNfEmails: []
    };
  }

  const firstCompanyAgent = Array.isArray(linkedCompany?.agents)
    ? linkedCompany.agents.find(ag => ag && ag.email && String(ag.email).includes("@") && !isPureBillingMailbox(ag.email))
    : null;

  const rawCandidates = [
    toEmail,
    reservation?.requesterInfo?.email,
    reservation?.requesterEmail,
    reservation?.agencyAgentEmail,
    reservation?.companyData?.companyEmail,
    firstCompanyAgent?.email,
    linkedCompany?.email
  ];
  const validNonB2bTarget = rawCandidates
    .map(v => String(v || "").trim().toLowerCase())
    .find(e => e && e.includes("@") && !isNonAgencySystemEmailAddress(e) && !isPureBillingMailbox(e)) || "";

  return {
    targetEmail: validNonB2bTarget,
    linkedAgency,
    linkedCompany,
    agencyNfEmails: []
  };
}

/**
 * Dispara o e-mail cordial de Confirmação / Lembrete + Link Seguro de Credenciamento do Hóspede (/credenciamento/:code)
 * Prioriza Zoho Mail REST API (quando OAuth2 estiver conectado) e faz fallback automático para Nodemailer SMTP,
 * registrando imediatamente no Histórico de Comunicações da Reserva e na pasta Enviados do E-mail Hub.
 */
export async function dispatchB2bAgencyCredentialEmail(
  db,
  saveDatabase,
  reservation,
  {
    toEmail = "",
    baseUrl = "https://corpflats.com.br",
    trigger = "b2b_agency_credential_request",
    force = false,
    isReminder = false,
    reminderKind = "",
    reminderNumber = 1,
    stageKey = "",
    nowIsoOverride = ""
  } = {}
) {
  if (!db || !reservation) {
    return { ok: false, error: "Reserva não informada." };
  }

  const resolvedStageKey = String(
    stageKey || (isReminder ? `reminder_${reminderKind || reminderNumber}` : "initial")
  ).trim();

  const lockKeys = getB2bReservationLockKeys(reservation);
  if (lockKeys.some(k => inFlightB2bCredentialLocks.has(k))) {
    return {
      ok: true,
      skipped: true,
      reason: "already_in_flight",
      stageKey: resolvedStageKey,
      sentTo: reservation.b2bCredentialEmailRecipient || ""
    };
  }

  if (!force && hasB2bCredentialEmailAlreadyBeenSent(db, reservation, resolvedStageKey)) {
    return {
      ok: true,
      skipped: true,
      alreadySent: true,
      stageKey: resolvedStageKey,
      sentAt:
        reservation.credentialSentStages?.[resolvedStageKey]?.emailSentAt ||
        reservation.b2bCredentialEmailSentAt,
      sentTo: reservation.b2bCredentialEmailRecipient || ""
    };
  }

  const { targetEmail, linkedAgency, linkedCompany } = resolveRequesterTargetEmail(
    db,
    reservation,
    toEmail
  );
  const flat = (db.flats || []).find(
    f => Number(f.id) === Number(reservation.flatId) || String(f.number) === String(reservation.flatNumber)
  );

  if (!targetEmail || !targetEmail.includes("@")) {
    await notifyManagerB2bMissingDataAlert(db, reservation, ["E-mail do Solicitante (Reservado por)"]).catch(() => {});
    return {
      ok: false,
      blockedMissingSolicitanteEmail: true,
      error:
        "E-mail do solicitante ('Reservado por') não informado no voucher/reserva. Por segurança, nunca enviamos solicitação de dados do hóspede para e-mails de NFS-e ou conciliação."
    };
  }

  // REGRA IMUTÁVEL: Zero cópia (CC) para e-mails de envio de NFS-e ou conciliação!
  const ccList = [];

  const hostBase = String(baseUrl || "https://corpflats.com.br")
    .replace(/https?:\/\/corpflats\.onrender\.com/gi, "https://corpflats.com.br")
    .replace(/\/+$/, "");
  const credentialUrl = `${hostBase}/credenciamento/${encodeURIComponent(String(reservation.code || reservation.id))}`;

  const rendered = renderB2bAgencyCredentialRequestEmail({
    reservation,
    flat,
    agency: linkedAgency,
    company: linkedCompany,
    settings: db.settings,
    baseUrl: hostBase,
    credentialUrl,
    db,
    isReminder,
    reminderKind,
    reminderNumber
  });

  // Marca lock em memória e carimbo na reserva ANTES do await de rede para impedir disparos paralelos
  for (const k of lockKeys) inFlightB2bCredentialLocks.add(k);
  const previousSentAt = reservation.b2bCredentialEmailSentAt || null;
  const previousStageEntry = reservation.credentialSentStages?.[resolvedStageKey]
    ? { ...reservation.credentialSentStages[resolvedStageKey] }
    : null;
  const preSendIso = nowIsoOverride || new Date().toISOString();
  if (!isReminder || !reservation.b2bCredentialEmailSentAt) {
    reservation.b2bCredentialEmailSentAt = preSendIso;
  }
  reservation.b2bCredentialEmailRecipient = targetEmail;

  try {
    // Remove apenas eventual tentativa anterior com falha (ou reenvio forçado) do MESMO estágio
    if (Array.isArray(db.reservationCommunications)) {
      const resCodeUpper = String(reservation.code || "").trim().toUpperCase();
      const resIdStr = String(reservation.id || "").trim();
      const b2bNum = String(reservation.b2bReservationNumber || reservation.externalReservationNumber || "").trim();
      db.reservationCommunications = db.reservationCommunications.filter(c => {
        if (!c || c.type !== "email") return true;
        if (!force && c.status !== "failed") return true;
        if (!isB2bCredentialCommMatch(c, resCodeUpper, resIdStr, b2bNum)) return true;
        return getCommCredentialStageKey(c) !== resolvedStageKey;
      });
    }

    const sendRes = await sendWebmailMessage(db, saveDatabase, {
      to: targetEmail,
      cc: ccList,
      subject: rendered.subject,
      bodyHtml: rendered.bodyHtml,
      bodyText: rendered.bodyText,
      reservationId: reservation.code || reservation.id,
      reservationCode: reservation.code,
      useTransactionalLayout: false,
      trigger
    });

    const nowIso = nowIsoOverride || new Date().toISOString();
    if (!sendRes?.ok || sendRes?.communication?.status === "failed") {
      reservation.b2bCredentialEmailSentAt = previousSentAt;
      if (reservation.credentialSentStages) {
        if (previousStageEntry) reservation.credentialSentStages[resolvedStageKey] = previousStageEntry;
        else delete reservation.credentialSentStages[resolvedStageKey];
      }
    } else {
      if (!isReminder || !previousSentAt) {
        reservation.b2bCredentialEmailSentAt = nowIso;
      } else {
        reservation.b2bCredentialEmailSentAt = previousSentAt;
      }
      reservation.credentialLastEmailSentAt = nowIso;
      reservation.credentialFirstRequestSentAt = reservation.credentialFirstRequestSentAt || nowIso;
      reservation.credentialLastRequestSentAt = nowIso;
      if (!reservation.credentialSentStages || typeof reservation.credentialSentStages !== "object") {
        reservation.credentialSentStages = {};
      }
      reservation.credentialSentStages[resolvedStageKey] = {
        ...(reservation.credentialSentStages[resolvedStageKey] || {}),
        sentAt: reservation.credentialSentStages[resolvedStageKey]?.sentAt || nowIso,
        emailSentAt: nowIso,
        recipient: targetEmail
      };
    }

    if (sendRes?.communication) {
      sendRes.communication.metadata = {
        ...(sendRes.communication.metadata || {}),
        trigger,
        stageKey: resolvedStageKey,
        isReminder: Boolean(isReminder),
        reminderKind: reminderKind || "",
        reminderNumber: Number(reminderNumber) || 0,
        credentialUrl: rendered.credentialUrl || credentialUrl,
        agencyName: reservation.agencyTradeName || reservation.agencyName || linkedAgency?.tradeName || "",
        b2bReservationNumber: reservation.b2bReservationNumber || reservation.externalReservationNumber || "",
        lastAutoRetryAt: nowIso
      };
    }

    if (typeof saveDatabase === "function") {
      saveDatabase(isReminder ? "b2b_credential_email_reminder_sent" : "b2b_credential_email_sent");
    }

    return {
      ok: Boolean(sendRes?.ok),
      success: Boolean(sendRes?.ok),
      stageKey: resolvedStageKey,
      isReminder: Boolean(isReminder),
      sentTo: reservation.b2bCredentialEmailRecipient,
      recipient: targetEmail,
      cc: ccList,
      credentialUrl: rendered.credentialUrl || credentialUrl,
      sentAt: nowIso,
      method: sendRes?.method || "smtp_engine",
      communicationId: sendRes?.communication?.id || null,
      communication: sendRes?.communication || null
    };
  } catch (err) {
    reservation.b2bCredentialEmailSentAt = previousSentAt;
    throw err;
  } finally {
    for (const k of lockKeys) inFlightB2bCredentialLocks.delete(k);
  }
}

export function getBrtDateParts(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(d);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const hour = Number(map.hour || 0);
  const minute = Number(map.minute || 0);
  return {
    dateIso: `${map.year}-${map.month}-${map.day}`,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute
  };
}

/**
 * Avalia deterministicamente qual ação da régua de credenciamento do hóspede deve ocorrer agora (em BRT):
 *  - Envio inicial imediato (`stageKey: "initial"`)
 *  - Antes do dia do check-in (`hoje < checkinDate`): 1 lembrete a cada 24h após o envio anterior (`reminder_24h_N`)
 *  - No dia do check-in (`D0`, reserva criada antes de `D0`): lembrete às 08:00 BRT (`reminder_checkin_morning`),
 *    lembrete às 12:00 BRT (`reminder_checkin_noon`) e alerta urgente ao gestor às 13:00 BRT se continuar pendente
 *  - Reserva same-day (`D0`): envio inicial imediato; se inicial < 11:00 BRT -> lembrete às 12:00 BRT + alerta às 13:00 BRT;
 *    se inicial >= 11:00 BRT -> lembrete +2h (`reminder_sameday_2h`) + alerta +1h após o lembrete.
 */
export function evaluateCredentialScheduleDecision(reservation, nowInput = new Date()) {
  if (!reservation) return { action: "none", reason: "no_reservation" };
  const nowDate = nowInput instanceof Date ? nowInput : new Date(nowInput);
  const nowMs = nowDate.getTime();
  const nowBrt = getBrtDateParts(nowDate);
  const checkinIso = String(reservation.checkinDate || "").slice(0, 10);
  const checkoutIso = String(reservation.checkoutDate || "").slice(0, 10);

  if (checkoutIso && checkoutIso < nowBrt.dateIso) {
    return { action: "none", reason: "past_checkout" };
  }

  const sentStages = reservation.credentialSentStages && typeof reservation.credentialSentStages === "object"
    ? reservation.credentialSentStages
    : {};

  const initialIso =
    reservation.credentialFirstRequestSentAt ||
    sentStages.initial?.sentAt ||
    sentStages.initial?.emailSentAt ||
    sentStages.initial?.whatsappSentAt ||
    reservation.b2bCredentialEmailSentAt ||
    reservation.b2bCredentialWhatsappSentAt ||
    "";

  if (!initialIso) {
    return {
      action: "send_stage",
      stageKey: "initial",
      isReminder: false,
      reminderKind: "",
      reminderNumber: 0
    };
  }

  const initialDate = new Date(initialIso);
  const initialMs = initialDate.getTime();
  const initialBrt = getBrtDateParts(initialDate);
  const isSameDayBooking = Boolean(checkinIso && initialBrt.dateIso >= checkinIso);

  const stage24hEntries = Object.entries(sentStages)
    .filter(([k, v]) => k.startsWith("reminder_24h_") && (v?.sentAt || v?.emailSentAt || v?.whatsappSentAt))
    .map(([k, v]) => ({
      key: k,
      num: Number(k.replace("reminder_24h_", "")) || 1,
      ms: new Date(v.sentAt || v.emailSentAt || v.whatsappSentAt).getTime()
    }))
    .sort((a, b) => a.num - b.num);

  const totalRemindersSent = Object.entries(sentStages).filter(
    ([k, v]) => k !== "initial" && (v?.sentAt || v?.emailSentAt || v?.whatsappSentAt)
  ).length;

  // 1. Antes do dia do check-in: 1 lembrete a cada 24h após o envio anterior até D-1
  if (checkinIso && nowBrt.dateIso < checkinIso) {
    const last24h = stage24hEntries.length > 0 ? stage24hEntries[stage24hEntries.length - 1] : null;
    const referenceMs = last24h ? last24h.ms : initialMs;
    if (nowMs - referenceMs >= 24 * 60 * 60 * 1000) {
      const nextNum = (last24h ? last24h.num : 0) + 1;
      return {
        action: "send_stage",
        stageKey: `reminder_24h_${nextNum}`,
        isReminder: true,
        reminderKind: "24h",
        reminderNumber: nextNum
      };
    }
    if (!reservation.b2bCredentialWhatsappSentAt && !reservation.credentialInitialWaEvaluatedAt) {
      return { action: "catchup_initial_whatsapp", stageKey: "initial" };
    }
    return { action: "none", reason: "waiting_next_24h_window" };
  }

  // 2. Dia do check-in (D0)
  if (checkinIso && nowBrt.dateIso === checkinIso) {
    if (!isSameDayBooking) {
      const hasMorning = Boolean(
        sentStages.reminder_checkin_morning?.sentAt ||
        sentStages.reminder_checkin_morning?.emailSentAt ||
        sentStages.reminder_checkin_morning?.whatsappSentAt
      );
      const hasNoon = Boolean(
        sentStages.reminder_checkin_noon?.sentAt ||
        sentStages.reminder_checkin_noon?.emailSentAt ||
        sentStages.reminder_checkin_noon?.whatsappSentAt
      );

      if (nowBrt.minutesOfDay >= 8 * 60 && nowBrt.minutesOfDay < 12 * 60 && !hasMorning) {
        return {
          action: "send_stage",
          stageKey: "reminder_checkin_morning",
          isReminder: true,
          reminderKind: "checkin_morning",
          reminderNumber: totalRemindersSent + 1
        };
      }

      if (nowBrt.minutesOfDay >= 12 * 60 && !hasNoon) {
        return {
          action: "send_stage",
          stageKey: "reminder_checkin_noon",
          isReminder: true,
          reminderKind: "checkin_noon",
          reminderNumber: totalRemindersSent + 1
        };
      }

      if (nowBrt.minutesOfDay >= 13 * 60 && hasNoon && !reservation.credentialCheckinUrgentAlertSentAt) {
        return { action: "manager_overdue_alert", reason: "checkin_13h_overdue" };
      }

      if (!reservation.b2bCredentialWhatsappSentAt && !reservation.credentialInitialWaEvaluatedAt) {
        return { action: "catchup_initial_whatsapp", stageKey: "initial" };
      }
      return { action: "none", reason: "waiting_checkin_day_slot" };
    }

    // Reserva criada no próprio dia do check-in (Same-Day D0)
    if (initialBrt.minutesOfDay < 11 * 60) {
      const hasNoon = Boolean(
        sentStages.reminder_checkin_noon?.sentAt ||
        sentStages.reminder_checkin_noon?.emailSentAt ||
        sentStages.reminder_checkin_noon?.whatsappSentAt
      );
      if (nowBrt.minutesOfDay >= 12 * 60 && !hasNoon) {
        return {
          action: "send_stage",
          stageKey: "reminder_checkin_noon",
          isReminder: true,
          reminderKind: "checkin_noon",
          reminderNumber: totalRemindersSent + 1
        };
      }
      if (nowBrt.minutesOfDay >= 13 * 60 && hasNoon && !reservation.credentialCheckinUrgentAlertSentAt) {
        return { action: "manager_overdue_alert", reason: "sameday_13h_overdue" };
      }
    } else {
      const samedayStage = sentStages.reminder_sameday_2h;
      const hasSameday2h = Boolean(
        samedayStage?.sentAt || samedayStage?.emailSentAt || samedayStage?.whatsappSentAt
      );
      if (!hasSameday2h && nowMs - initialMs >= 2 * 60 * 60 * 1000) {
        return {
          action: "send_stage",
          stageKey: "reminder_sameday_2h",
          isReminder: true,
          reminderKind: "sameday_2h",
          reminderNumber: totalRemindersSent + 1
        };
      }
      if (hasSameday2h && !reservation.credentialCheckinUrgentAlertSentAt) {
        const remSentMs = new Date(
          samedayStage.sentAt || samedayStage.emailSentAt || samedayStage.whatsappSentAt
        ).getTime();
        if (nowMs - remSentMs >= 60 * 60 * 1000) {
          return { action: "manager_overdue_alert", reason: "sameday_post_reminder_1h_overdue" };
        }
      }
    }

    if (!reservation.b2bCredentialWhatsappSentAt && !reservation.credentialInitialWaEvaluatedAt) {
      return { action: "catchup_initial_whatsapp", stageKey: "initial" };
    }
    return { action: "none", reason: "waiting_sameday_slot" };
  }

  // 3. Após o dia do check-in (estadia em andamento ainda sem credenciamento)
  if (!reservation.credentialCheckinUrgentAlertSentAt) {
    return { action: "manager_overdue_alert", reason: "post_checkin_overdue" };
  }

  return { action: "none", reason: "completed_all_stages" };
}

/**
 * Motor unificado de disparos e lembretes de credenciamento (/credenciamento/:code) para TODAS as reservas
 * confirmadas aguardando preenchimento do hóspede (Agências B2B, Empresas e Solicitantes Terceiros),
 * operando simultaneamente via E-mail e WhatsApp validado + contingência para o Gestor.
 */
export async function ensurePendingB2bAgencyCredentialDispatches(
  db,
  saveDatabase,
  {
    baseUrl = "https://corpflats.com.br",
    forceCheck = false,
    nowOverride = null,
    allowSimulatedSend = false,
    phoneExistsChecker = null
  } = {}
) {
  if (!db || !Array.isArray(db.reservations)) return { dispatched: 0, remindersDispatched: 0, managerAlerts: 0 };
  if (!Array.isArray(db.reservationCommunications)) db.reservationCommunications = [];

  if (isRunningPendingB2bDispatches) {
    return { dispatched: 0, remindersDispatched: 0, managerAlerts: 0, skipped: true };
  }
  if (!forceCheck && !nowOverride && Date.now() - lastPendingB2bDispatchCheckAt < 55000) {
    return { dispatched: 0, remindersDispatched: 0, managerAlerts: 0, throttled: true };
  }

  const canSendEmailReal = Boolean(
    getZohoOAuthConfig(db).isConfigured || getSmtpConfig(db).isConfigured || allowSimulatedSend
  );
  const canSendWaReal = Boolean(
    (db?.zapiConfig?.enabled !== false && db?.zapiConfig?.instanceId && db?.zapiConfig?.token) ||
    process.env.ZAPI_INSTANCE_ID ||
    allowSimulatedSend
  );

  if (!canSendEmailReal && !canSendWaReal) {
    return { dispatched: 0, remindersDispatched: 0, managerAlerts: 0 };
  }

  isRunningPendingB2bDispatches = true;
  if (!nowOverride) {
    lastPendingB2bDispatchCheckAt = Date.now();
  }
  let dispatched = 0;
  let remindersDispatched = 0;
  let managerAlerts = 0;
  let didMutateState = false;

  const evalDate = nowOverride ? (nowOverride instanceof Date ? nowOverride : new Date(nowOverride)) : new Date();
  const evalIso = evalDate.toISOString();
  const todayBrIso = getBrtDateParts(evalDate).dateIso;

  try {
    const removedDups = deduplicateB2bCredentialCommunications(db);
    if (removedDups > 0) didMutateState = true;

    for (const r of db.reservations) {
      if (!r) continue;
      const st = String(r.status || "").toLowerCase().trim();
      if (
        st === "cancelada" ||
        st === "cancelled" ||
        st === "checkout" ||
        st === "concluida" ||
        st === "no_show" ||
        st === "pre_reserva" ||
        st === "pendente"
      ) {
        continue;
      }

      if (r.checkoutDate && String(r.checkoutDate).slice(0, 10) < todayBrIso) continue;
      if (r.b2bCredentialCompletedAt || r.credentialStatus === "completed") continue;
      if (!isMissingGuestDataForCredential(r)) continue;

      const isB2b =
        String(r.channel || "").toLowerCase().includes("b2b") ||
        Boolean(r.b2bReservationNumber) ||
        r.requesterType === "agency_b2b";
      const recips = getReservationRecipients(r, db);
      const isSeparateRequester = Boolean(
        isB2b ||
        (r.requesterType && r.requesterType !== "guest") ||
        recips.requester?.isDifferentFromGuest
      );
      if (!isSeparateRequester) continue;

      // Sincroniza eventual envio inicial legado registrado apenas em communications/Zoho Sent
      const hadSentAtBefore = Boolean(r.b2bCredentialEmailSentAt);
      if (!hadSentAtBefore && hasB2bCredentialEmailAlreadyBeenSent(db, r, "initial") && r.b2bCredentialEmailSentAt) {
        r.credentialFirstRequestSentAt = r.credentialFirstRequestSentAt || r.b2bCredentialEmailSentAt;
        didMutateState = true;
      }

      const decision = evaluateCredentialScheduleDecision(r, evalDate);
      if (decision.action === "none") continue;

      if (decision.action === "catchup_initial_whatsapp") {
        if (canSendWaReal) {
          r.credentialInitialWaEvaluatedAt = evalIso;
          didMutateState = true;
          const waCatchup = await dispatchRequesterGuestCredentialRequest(db, saveDatabase, r, {
            baseUrl,
            stageKey: "initial",
            isReminder: false,
            ...(phoneExistsChecker ? { phoneExistsChecker } : {})
          });
          if (waCatchup?.dispatched) {
            if (!r.credentialSentStages || typeof r.credentialSentStages !== "object") r.credentialSentStages = {};
            r.credentialSentStages.initial = {
              ...(r.credentialSentStages.initial || {}),
              sentAt: r.credentialSentStages.initial?.sentAt || r.b2bCredentialEmailSentAt || evalIso,
              whatsappSentAt: evalIso,
              whatsappRecipient: waCatchup.requesterPhone || ""
            };
            dispatched++;
          }
        }
        continue;
      }

      if (decision.action === "manager_overdue_alert") {
        const alertRes = await sendCredentialContingencyManagerAlert(
          db,
          saveDatabase,
          r,
          "checkin_day_overdue",
          { baseUrl, reason: decision.reason }
        );
        if (alertRes?.sent) managerAlerts++;
        continue;
      }

      if (decision.action === "send_stage") {
        const { stageKey, isReminder, reminderKind, reminderNumber } = decision;
        const { targetEmail } = resolveRequesterTargetEmail(db, r);
        const hasEmailTarget = Boolean(targetEmail && targetEmail.includes("@"));

        // Verifica se este estágio falhou por e-mail há menos de 15 min para evitar flood de retentativa SMTP
        const resCode = String(r.code || "").trim().toUpperCase();
        const resId = String(r.id || "").trim();
        const b2bNum = String(r.b2bReservationNumber || r.externalReservationNumber || "").trim();
        const existingFailedComm = db.reservationCommunications.find(
          c =>
            c &&
            c.status === "failed" &&
            isB2bCredentialCommMatch(c, resCode, resId, b2bNum) &&
            getCommCredentialStageKey(c) === stageKey
        );
        const emailRetryThrottled = Boolean(
          existingFailedComm &&
          evalDate.getTime() -
            new Date(
              existingFailedComm.metadata?.lastAutoRetryAt ||
                existingFailedComm.created_at ||
                existingFailedComm.createdAt ||
                0
            ).getTime() <
            900000
        );

        let emailSucceeded = false;
        let waSucceeded = false;

        if (hasEmailTarget && canSendEmailReal && !emailRetryThrottled) {
          try {
            const emailRes = await dispatchB2bAgencyCredentialEmail(db, saveDatabase, r, {
              baseUrl,
              trigger: isReminder ? `b2b_credential_${stageKey}` : "b2b_auto_credential_request",
              force: false,
              isReminder,
              reminderKind,
              reminderNumber,
              stageKey,
              nowIsoOverride: evalIso
            });
            if (emailRes?.ok && !emailRes?.skipped) {
              emailSucceeded = true;
            }
          } catch (err) {
            console.warn(`[Credential Sync] Falha de e-mail (${stageKey}) na reserva ${r.code}:`, err.message);
          }
        }

        let waRes = null;
        if (canSendWaReal) {
          try {
            waRes = await dispatchRequesterGuestCredentialRequest(db, saveDatabase, r, {
              baseUrl,
              isReminder,
              reminderKind,
              reminderNumber,
              stageKey,
              ...(phoneExistsChecker ? { phoneExistsChecker } : {})
            });
            if (waRes?.dispatched) {
              waSucceeded = true;
              r.credentialInitialWaEvaluatedAt = r.credentialInitialWaEvaluatedAt || evalIso;
              if (!r.credentialSentStages || typeof r.credentialSentStages !== "object") {
                r.credentialSentStages = {};
              }
              r.credentialSentStages[stageKey] = {
                ...(r.credentialSentStages[stageKey] || {}),
                sentAt: r.credentialSentStages[stageKey]?.sentAt || evalIso,
                whatsappSentAt: evalIso,
                whatsappRecipient: waRes.requesterPhone || ""
              };
              r.credentialFirstRequestSentAt = r.credentialFirstRequestSentAt || evalIso;
              r.credentialLastRequestSentAt = evalIso;
              didMutateState = true;
            } else if (waRes?.reason === "no_valid_requester_whatsapp") {
              r.credentialInitialWaEvaluatedAt = r.credentialInitialWaEvaluatedAt || evalIso;
            }
          } catch (err) {
            console.warn(`[Credential Sync] Falha de WhatsApp (${stageKey}) na reserva ${r.code}:`, err.message);
          }
        }

        if (emailSucceeded || waSucceeded) {
          if (isReminder) remindersDispatched++;
          else dispatched++;
        } else if (!hasEmailTarget && (!waRes || !waRes.dispatched)) {
          // Contingência imediata: Reserva sem NENHUM e-mail e sem NENHUM WhatsApp válido da agência/solicitante
          const waCheck = waRes || (await resolveValidRequesterWhatsApp(db, r, phoneExistsChecker ? { phoneExistsChecker } : {}));
          if (!waCheck?.valid) {
            const alertRes = await sendCredentialContingencyManagerAlert(
              db,
              saveDatabase,
              r,
              "missing_contact",
              { baseUrl }
            );
            if (alertRes?.sent) managerAlerts++;
          }
        }
      }
    }

    if (didMutateState && typeof saveDatabase === "function") {
      saveDatabase("b2b_credential_schedule_sync");
    }
  } finally {
    isRunningPendingB2bDispatches = false;
  }

  return { dispatched, remindersDispatched, managerAlerts };
}

/**
 * Auto-Reparo Pós-Hidratação para Reservas B2B Incompletas:
 * Localiza reservas B2B ativas que chegaram sem nome/e-mail/telefone da agência ou agente,
 * reprocessando mensagens em cache do Zoho (buscando corpo/PDF se ausentes), URL do voucher e CRM `db.agencies`.
 */
export async function repairIncompleteB2bReservations(db, saveDatabase) {
  if (!db || !Array.isArray(db.reservations)) return { repairedCount: 0, repairedCodes: [] };
  const repairedCodes = [];
  const oauthConfigured = Boolean(getZohoOAuthConfig(db).isConfigured);
  let resolvedInboxFolderId = "";

  const extractAttListLocal = resObj => {
    if (!resObj?.ok || !resObj.data) return [];
    if (Array.isArray(resObj.data)) return resObj.data;
    if (Array.isArray(resObj.data.attachments)) return resObj.data.attachments;
    return [];
  };

  for (const r of db.reservations) {
    if (!r) continue;
    const st = String(r.status || "").toLowerCase().trim();
    if (st === "cancelada" || st === "cancelled") continue;

    const isB2b =
      String(r.channel || "").toLowerCase().includes("b2b") ||
      Boolean(r.b2bReservationNumber) ||
      r.requesterType === "agency_b2b";
    if (!isB2b) continue;

    const missingCoreAgencyData =
      !r.agencyName ||
      !r.agencyAgentName ||
      (!r.agencyAgentEmail && !r.agencyAgentPhone);
    if (!missingCoreAgencyData) continue;

    const beforeSig = JSON.stringify([
      r.agencyId || "",
      r.agencyName || "",
      r.agencyCnpj || "",
      r.agencyAgentName || "",
      r.agencyAgentEmail || "",
      r.agencyAgentPhone || ""
    ]);

    const resNum = String(r.b2bReservationNumber || r.externalReservationNumber || "").trim();

    // 1. Procura mensagem original correspondente em db.zohoMessagesCache
    if (resNum && Array.isArray(db.zohoMessagesCache)) {
      const candidateMsgs = db.zohoMessagesCache.filter(m => {
        if (!m || m.direction === "outbound" || m.folder === "sent" || m.b2bCancelled) return false;
        const hay = `${m.subject || ""} ${m.snippet || ""} ${m.bodyHtml || ""}`;
        if (!hay.includes(resNum)) return false;
        return !/cancelamento|cancelada|cancelled/i.test(String(m.subject || ""));
      });

      for (const msg of candidateMsgs) {
        let htmlText = msg.bodyHtml || "";
        let pdfText = "";
        const pdfBuffers = [];

        if (oauthConfigured && msg.zohoMessageId) {
          if (!resolvedInboxFolderId) {
            try {
              const fMap = await resolveZohoFolders(db);
              resolvedInboxFolderId = fMap.inbox || fMap.inboxFolderIds?.[0] || "";
            } catch {}
          }
          const folderId = msg.zohoFolderId || resolvedInboxFolderId;
          if (!htmlText && folderId) {
            try {
              const cRes = await callZohoMailApi(
                db,
                `/accounts/{accountId}/folders/${folderId}/messages/${msg.zohoMessageId}/content`
              );
              if (cRes.ok && cRes.data?.content) {
                htmlText = cRes.data.content;
                msg.bodyHtml = htmlText;
              }
            } catch {}
          }
          if (msg.hasAttachments && folderId) {
            try {
              const attRes = await callZohoMailApi(
                db,
                `/accounts/{accountId}/folders/${folderId}/messages/${msg.zohoMessageId}/attachmentinfo`
              );
              const atts = extractAttListLocal(attRes);
              for (const att of atts) {
                const attId = att?.attachmentId || att?.id;
                const fname = String(att?.attachmentName || att?.filename || "");
                const mime = String(att?.contentType || "");
                if (attId && (fname.toLowerCase().endsWith(".pdf") || mime.toLowerCase() === "application/pdf")) {
                  try {
                    const fileRes = await callZohoMailApi(
                      db,
                      `/accounts/{accountId}/folders/${folderId}/messages/${msg.zohoMessageId}/attachments/${attId}`,
                      { responseType: "buffer" }
                    );
                    if (fileRes.ok && Buffer.isBuffer(fileRes.data)) {
                      pdfBuffers.push(fileRes.data);
                      const extracted = extractTextFromPdfBuffer(fileRes.data);
                      if (extracted) pdfText += `\n${extracted}`;
                    }
                  } catch {}
                }
              }
            } catch {}
          }
        }

        try {
          const parsed = await fetchAndParseB2bVoucher({
            rawText: [msg.snippet || "", pdfText].filter(Boolean).join("\n"),
            htmlText,
            subject: msg.subject || "",
            fromEmail: msg.fromEmail || msg.fromAddress || "",
            cc: msg.cc || msg.ccAddress || "",
            replyTo: msg.replyTo || msg.replyToAddress || "",
            voucherUrl: r.voucherUrl || r.b2bVoucherUrl || "",
            pdfBuffers,
            db
          });
          if (parsed.b2bReservationNumber || resNum) {
            if (!parsed.b2bReservationNumber) parsed.b2bReservationNumber = resNum;
            if (!parsed.guestName) parsed.guestName = r.guestName;
            if (!parsed.checkinDate) parsed.checkinDate = r.checkinDate;
            ingestB2bVoucherIntoDb(db, parsed, {
              saveDatabase: null,
              autoSendCredentialEmail: false
            });
          }
        } catch {}
      }
    }

    // 2. Se ainda faltar contato e houver URL do voucher salva na reserva, tenta enriquecer pelo link web
    const stillMissingContact = !r.agencyName || !r.agencyAgentName || (!r.agencyAgentEmail && !r.agencyAgentPhone);
    const savedVoucherUrl = r.voucherUrl || r.b2bVoucherUrl || "";
    if (stillMissingContact && savedVoucherUrl && process.env.NODE_ENV !== "test") {
      try {
        const parsedFromUrl = await fetchAndParseB2bVoucher({
          rawText: "",
          voucherUrl: savedVoucherUrl,
          forceFetch: true,
          db
        });
        if (parsedFromUrl.agencyName && !r.agencyName) {
          r.agencyName = parsedFromUrl.agencyName;
          r.agencyTradeName = parsedFromUrl.agencyName;
        }
        if (parsedFromUrl.agencyCnpj && !r.agencyCnpj) r.agencyCnpj = parsedFromUrl.agencyCnpj;
        if (parsedFromUrl.agencyAgentName && !r.agencyAgentName) r.agencyAgentName = parsedFromUrl.agencyAgentName;
        if (parsedFromUrl.agencyAgentEmail && !r.agencyAgentEmail) r.agencyAgentEmail = parsedFromUrl.agencyAgentEmail;
        if (parsedFromUrl.agencyAgentPhone && !r.agencyAgentPhone) r.agencyAgentPhone = parsedFromUrl.agencyAgentPhone;
      } catch {}
    }

    // 3. Reconciliação final com CRM `db.agencies` (por ID, CNPJ, Nome ou E-mail de Agente)
    if (Array.isArray(db.agencies) && db.agencies.length > 0) {
      const rCnpjDigits = String(r.agencyCnpj || "").replace(/\D/g, "");
      const rAgNameLower = String(r.agencyName || r.agencyTradeName || "").trim().toLowerCase();
      const rAgEmailLower = String(r.agencyAgentEmail || "").trim().toLowerCase();

      const matchedAgency = db.agencies.find(a => {
        if (!a) return false;
        if (r.agencyId && String(a.id) === String(r.agencyId)) return true;
        if (rCnpjDigits && String(a.cnpj || "").replace(/\D/g, "") === rCnpjDigits) return true;
        if (
          rAgNameLower &&
          (String(a.tradeName || "").trim().toLowerCase() === rAgNameLower ||
            String(a.corporateName || "").trim().toLowerCase() === rAgNameLower)
        ) {
          return true;
        }
        if (
          rAgEmailLower &&
          (String(a.email || "").trim().toLowerCase() === rAgEmailLower ||
            String(a.financialEmail || "").trim().toLowerCase() === rAgEmailLower ||
            (Array.isArray(a.agents) && a.agents.some(ag => String(ag?.email || "").trim().toLowerCase() === rAgEmailLower)))
        ) {
          return true;
        }
        return false;
      });

      if (matchedAgency) {
        if (!r.agencyId) r.agencyId = matchedAgency.id;
        if (!r.agencyName) r.agencyName = matchedAgency.tradeName || matchedAgency.corporateName || "";
        if (!r.agencyTradeName) r.agencyTradeName = matchedAgency.tradeName || r.agencyName || "";
        if (!r.agencyCorporateName) r.agencyCorporateName = matchedAgency.corporateName || r.agencyName || "";
        if (!r.agencyCnpj && matchedAgency.cnpj) r.agencyCnpj = matchedAgency.cnpj;
        const currentEmailLower = String(r.agencyAgentEmail || "").trim().toLowerCase();
        const emailMatchedAg =
          currentEmailLower && Array.isArray(matchedAgency.agents)
            ? matchedAgency.agents.find(
                ag => ag && typeof ag === "object" && String(ag.email || "").trim().toLowerCase() === currentEmailLower
              )
            : null;
        const firstAg =
          emailMatchedAg ||
          (Array.isArray(matchedAgency.agents)
            ? matchedAgency.agents.find(ag => ag && typeof ag === "object" && (ag.name || ag.email || ag.phone || ag.whatsapp))
            : null);
        if (!r.agencyAgentName && firstAg?.name) r.agencyAgentName = firstAg.name;
        if (!r.agencyAgentEmail) {
          const candAgEmail = firstAg?.email || matchedAgency.email || "";
          if (candAgEmail && !isPureBillingMailbox(candAgEmail)) {
            r.agencyAgentEmail = candAgEmail;
          }
        }
        if (!r.agencyAgentPhone) {
          r.agencyAgentPhone = firstAg?.whatsapp || firstAg?.phone || matchedAgency.whatsapp || matchedAgency.phone || "";
        }
      }
    }

    const afterSig = JSON.stringify([
      r.agencyId || "",
      r.agencyName || "",
      r.agencyCnpj || "",
      r.agencyAgentName || "",
      r.agencyAgentEmail || "",
      r.agencyAgentPhone || ""
    ]);

    if (afterSig !== beforeSig) {
      r.updatedAt = new Date().toISOString();
      repairedCodes.push(r.code || String(r.id));
    }
  }

  if (repairedCodes.length > 0 && typeof saveDatabase === "function") {
    saveDatabase("b2b_incomplete_reservations_repaired");
  }

  return { repairedCount: repairedCodes.length, repairedCodes };
}

/**
 * Processa notificação em tempo real (Webhook / Push) de novo e-mail recebido no Zoho Mail.
 * Sincroniza imediatamente a Caixa de Entrada, processa eventuais vouchers B2B e dispara credenciamento.
 */
export async function handleZohoIncomingWebhook(db, saveDatabase, payload = {}) {
  ensureWebmailCollections(db);
  const nowIso = new Date().toISOString();
  zohoTokenCache.lastWebhookAt = nowIso;
  if (db?.settings?.zohoOAuth) {
    db.settings.zohoOAuth.lastWebhookAt = nowIso;
  }

  let directIngest = null;
  const rawSubj = String(payload?.subject || payload?.Subject || payload?.data?.subject || "").trim();
  const rawFrom = String(payload?.fromAddress || payload?.sender || payload?.From || payload?.data?.fromAddress || "").trim();
  const rawCc = String(payload?.ccAddress || payload?.cc || payload?.Cc || payload?.data?.ccAddress || "").trim();
  const rawReplyTo = String(payload?.replyTo || payload?.replyToAddress || payload?.ReplyTo || payload?.data?.replyTo || "").trim();
  let rawHtml = String(payload?.content || payload?.html || payload?.bodyHtml || payload?.data?.content || "").trim();
  const rawText = String(payload?.summary || payload?.text || payload?.bodyText || payload?.data?.summary || "").trim();
  const rawWebhookMsgId = String(payload?.messageId || payload?.id || payload?.data?.messageId || "").trim();
  const rawWebhookFolderId = String(payload?.folderId || payload?.data?.folderId || "").trim();

  let attachmentPdfText = "";
  const attachmentPdfBuffers = [];
  const attachments = Array.isArray(payload?.attachments)
    ? payload.attachments
    : Array.isArray(payload?.data?.attachments)
      ? payload.data.attachments
      : [];
  for (const att of attachments) {
    const fname = String(att?.filename || att?.name || att?.attachmentName || "");
    const mime = String(att?.contentType || att?.mimeType || "");
    if (fname.toLowerCase().endsWith(".pdf") || mime.toLowerCase() === "application/pdf") {
      let pdfBuf = null;
      if (Buffer.isBuffer(att.content)) pdfBuf = att.content;
      else if (Buffer.isBuffer(att.data)) pdfBuf = att.data;
      else if (Buffer.isBuffer(att.buffer)) pdfBuf = att.buffer;
      else if (typeof att.content === "string") {
        pdfBuf = Buffer.from(att.content, att.isBase64 || att.encoding === "base64" ? "base64" : "binary");
      } else if (typeof att.data === "string") {
        pdfBuf = Buffer.from(att.data, "base64");
      }
      if (pdfBuf) {
        attachmentPdfBuffers.push(pdfBuf);
        const extracted = extractTextFromPdfBuffer(pdfBuf);
        if (extracted) attachmentPdfText += `\n${extracted}`;
      }
    }
  }

  // Quando o Webhook do Zoho envia apenas metadados/resumo (sem HTML completo ou sem bytes do PDF anexo),
  // busca o conteúdo integral e os PDFs via API antes da ingestão direta B2B
  if (rawWebhookMsgId && getZohoOAuthConfig(db).isConfigured && (!rawHtml || !attachmentPdfText)) {
    try {
      let targetFolderId = rawWebhookFolderId;
      if (!targetFolderId) {
        const fMap = await resolveZohoFolders(db);
        targetFolderId = fMap.inbox || fMap.inboxFolderIds?.[0] || "";
      }
      if (targetFolderId) {
        if (!rawHtml) {
          const contentRes = await callZohoMailApi(
            db,
            `/accounts/{accountId}/folders/${targetFolderId}/messages/${rawWebhookMsgId}/content`
          );
          if (contentRes.ok && contentRes.data?.content) {
            rawHtml = contentRes.data.content;
          }
        }
        if (!attachmentPdfText) {
          const attInfoRes = await callZohoMailApi(
            db,
            `/accounts/{accountId}/folders/${targetFolderId}/messages/${rawWebhookMsgId}/attachmentinfo`
          );
          const attList = Array.isArray(attInfoRes?.data)
            ? attInfoRes.data
            : Array.isArray(attInfoRes?.data?.attachments)
              ? attInfoRes.data.attachments
              : [];
          for (const att of attList) {
            const attId = att?.attachmentId || att?.id;
            const fname = String(att?.attachmentName || att?.filename || "");
            const mime = String(att?.contentType || "");
            if (attId && (fname.toLowerCase().endsWith(".pdf") || mime.toLowerCase() === "application/pdf")) {
              const fileRes = await callZohoMailApi(
                db,
                `/accounts/{accountId}/folders/${targetFolderId}/messages/${rawWebhookMsgId}/attachments/${attId}`,
                { responseType: "buffer" }
              );
              if (fileRes.ok && Buffer.isBuffer(fileRes.data)) {
                attachmentPdfBuffers.push(fileRes.data);
                const extracted = extractTextFromPdfBuffer(fileRes.data);
                if (extracted) attachmentPdfText += `\n${extracted}`;
              }
            }
          }
        }
      }
    } catch {}
  }

  const combinedRawText = [rawText, attachmentPdfText].filter(Boolean).join("\n");

  const webhookZId = rawWebhookMsgId ? `zoho_${rawWebhookMsgId}` : "";
  const webhookCancelSig = buildZohoB2bCancelSignature(rawSubj, rawFrom);
  const webhookCancelKeys = [webhookZId, webhookCancelSig].filter(Boolean);

  const emailData = {
    ...(webhookZId ? { id: webhookZId, zohoMessageId: rawWebhookMsgId } : {}),
    subject: rawSubj,
    from: rawFrom,
    cc: rawCc,
    replyTo: rawReplyTo,
    html: rawHtml,
    text: combinedRawText,
    summary: rawText,
    attachments
  };

  let directCancelResult = null;
  const intent = detectB2bEmailIntent(emailData);

  if (intent.isCancellation) {
    if (!hasProcessedZohoB2bCancelKey(db, webhookCancelKeys)) {
      markProcessedZohoB2bCancelKey(db, webhookCancelKeys);
      try {
        directCancelResult = await executeAutonomousB2bCancellation(db, emailData, {
          saveDatabase
        });
      } catch (cancelErr) {
        console.warn("[Zoho Webhook Direct B2B Cancel] Erro ao processar cancelamento:", cancelErr?.message || cancelErr);
      }
    }
  } else {
    const isB2bCandidate =
      (rawSubj &&
        (rawFrom.toLowerCase().includes("b2breservas") ||
          /(?:Confirma[cç][aã]o\s+d[ae]\s+Reserva|Reserva\s+Confirmada|\bVoucher\b)[\s\S]*?\b\d{6,12}\b/i.test(rawSubj))) ||
      /Confirma[cç][aã]o\s+d[ae]\s+Reserva|\bVOUCHER\b|b2breservas\.com\.br/i.test(`${combinedRawText}\n${rawHtml}`);

    if (isB2bCandidate) {
      try {
        const parsedB2b = await fetchAndParseB2bVoucher({
          rawText: combinedRawText,
          htmlText: rawHtml,
          subject: rawSubj,
          fromEmail: rawFrom,
          cc: rawCc,
          replyTo: rawReplyTo,
          pdfBuffers: attachmentPdfBuffers,
          db
        });
        if (parsedB2b.b2bReservationNumber && parsedB2b.guestName && parsedB2b.checkinDate) {
          directIngest = ingestB2bVoucherIntoDb(db, parsedB2b, {
            saveDatabase,
            autoSendCredentialEmail: false
          });
          if (directIngest?.ok) {
            await enrichB2bIngestedEntitiesCnpj(db, { ...directIngest, saveDatabase });
          }
        }
      } catch (err) {
        console.warn("[Zoho Webhook Direct B2B] Aviso:", err?.message || err);
      }
    }
  }

  await processInboundBounceForGuestEmail(db, saveDatabase, {
    fromEmail: rawFrom,
    from: rawFrom,
    subject: rawSubj,
    bodyHtml: rawHtml,
    bodyText: combinedRawText,
    snippet: rawText,
    direction: "inbound",
    created_at: nowIso
  });

  const syncRes = await syncZohoMessagesToCache(db, {
    folder: "inbox",
    limit: 40,
    saveDatabase
  });

  await ensurePendingB2bAgencyCredentialDispatches(db, saveDatabase, { forceCheck: true });

  if (typeof saveDatabase === "function") {
    saveDatabase("zoho_webhook_sync");
  }

  return {
    ok: true,
    synced: syncRes?.synced || 0,
    directIngestedReservation: directIngest?.reservation?.code || null,
    directCancelledReservation: directCancelResult?.reservationCode || null,
    directCancelled: directCancelResult?.cancelled || false,
    lastWebhookAt: nowIso
  };
}

/**
 * Registra / assegura o endpoint de Webhook de entrada na conta Zoho Mail (quando suportado pelo escopo OAuth)
 * e realiza a sincronização imediata de inicialização para capturar e-mails recebidos recentemente.
 */
export async function ensureZohoWebhookRegistered(
  db,
  saveDatabase,
  { baseUrl = "https://corpflats.com.br" } = {}
) {
  ensureWebmailCollections(db);
  const hostBase = String(baseUrl || "https://corpflats.com.br")
    .replace(/https?:\/\/corpflats\.onrender\.com/gi, "https://corpflats.com.br")
    .replace(/\/+$/, "");
  const webhookUrl = `${hostBase}/api/webmail/zoho-webhook`;

  zohoTokenCache.webhookEndpoint = webhookUrl;
  if (db?.settings?.zohoOAuth) {
    db.settings.zohoOAuth.webhookEndpoint = webhookUrl;
  }

  const oauthCfg = getZohoOAuthConfig(db);
  if (!oauthCfg.isConfigured) {
    return { ok: false, reason: "oauth_not_configured", webhookUrl };
  }

  try {
    const existingRes = await callZohoMailApi(db, "/accounts/{accountId}/webhooks");
    const list = Array.isArray(existingRes?.data) ? existingRes.data : [];
    const alreadyRegistered = list.some(w =>
      String(w?.callbackUrl || w?.webhookUrl || w?.url || "").includes("/api/webmail/zoho-webhook")
    );
    if (!alreadyRegistered) {
      await callZohoMailApi(db, "/accounts/{accountId}/webhooks", {
        method: "POST",
        body: JSON.stringify({
          callbackUrl: webhookUrl,
          events: ["incoming_mail", "NEW_MAIL"]
        })
      }).catch(() => {});
    }
  } catch {
    // Escopo OAuth atual pode não incluir gerenciamento de webhooks; filtros do Zoho Mail podem postar diretamente no endpoint
  }

  const syncRes = await syncZohoMessagesToCache(db, {
    folder: "inbox",
    limit: 50,
    saveDatabase
  });

  if (syncRes.ok && syncRes.synced > 0 && typeof saveDatabase === "function") {
    saveDatabase("zoho_boot_sync");
  }

  return {
    ok: true,
    webhookUrl,
    synced: syncRes?.synced || 0
  };
}

export {
  detectB2bEmailIntent,
  matchReservationForCancellation,
  executeAutonomousB2bCancellation
};


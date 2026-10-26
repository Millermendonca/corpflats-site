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
  ensureReservationAttachmentsReady
} from "./mail-service.mjs";

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
  folderMapExpiresAt: 0
};

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
    const payload = contentType.includes("application/json") ? await res.json() : await res.text();

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

  // 6. Correlação de Bounce (mailer-daemon / Undelivered Mail) pelo horário do disparo imediatamente anterior
  if (!matched && item.direction === "inbound") {
    const fromLower = String(item.fromEmail || "").toLowerCase();
    const subjLower = String(item.subject || "").toLowerCase();
    if (fromLower.includes("mailer-daemon") || subjLower.includes("undelivered")) {
      const bounceMs = new Date(item.created_at || 0).getTime();
      if (bounceMs > 0 && Array.isArray(db.reservationCommunications)) {
        const recentComm = db.reservationCommunications.find(c => {
          if (!c || c.type !== "email" || c.direction === "inbound" || !c.reservation_id) return false;
          const cMs = new Date(c.created_at || 0).getTime();
          return bounceMs >= cMs && bounceMs - cMs <= 3 * 60 * 1000;
        });
        if (recentComm?.reservation_id) {
          const targetId = String(recentComm.reservation_id).toUpperCase();
          matched = reservations.find(
            r => String(r.id).toUpperCase() === targetId || (r.code && String(r.code).toUpperCase() === targetId)
          );
        }
      }
    }
  }

  if (!matched) return null;

  const flat = (db.flats || []).find(f => f.id === matched.flatId || String(f.number) === String(matched.flatNumber));
  const atts = resolveReservationAttachments({ reservation: matched, db });

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
    attachmentsAvailableCount: atts.length,
    attachmentsSummary: atts.map(a => a.filename),
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
export async function syncZohoMessagesToCache(db, { folder = "inbox", search = "", limit = 50, saveDatabase = null } = {}) {
  ensureWebmailCollections(db);
  const oauthCfg = getZohoOAuthConfig(db);
  if (!oauthCfg.isConfigured) {
    return { ok: false, synced: 0, mode: "local_smtp" };
  }

  try {
    const zohoFolderMap = await resolveZohoFolders(db);
    let rawZohoMessages = [];

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
        const qp = new URLSearchParams({ limit: String(limit), includeto: "true" });
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
      const qp = new URLSearchParams({ limit: String(limit), includeto: "true" });
      if (zohoFolderMap[folder]) {
        qp.set("folderId", String(zohoFolderMap[folder]));
      }
      const msgRes = await callZohoMailApi(db, `/accounts/{accountId}/messages/view?${qp.toString()}`);
      if (msgRes.ok && Array.isArray(msgRes.data)) {
        rawZohoMessages.push(...msgRes.data);
      }
    }

    let addedOrUpdated = 0;
    for (const zm of rawZohoMessages) {
      if (!zm || !zm.messageId) continue;
      const zId = `zoho_${zm.messageId}`;
      const existingIdx = db.zohoMessagesCache.findIndex(m => m.id === zId);
      const isoDate = resolveZohoTrueIsoDate(zm);

      const resolvedFolder = classifyZohoMessageFolder(zm, zohoFolderMap, folder);
      const resolvedDirection = resolvedFolder === "sent" ? "outbound" : (resolvedFolder === "drafts" ? "draft" : "inbound");
      const cleanFromName = decodeZohoEntities(zm.sender || zm.fromAddress || "Remetente");
      const cleanFromEmail = cleanAddressField(zm.fromAddress || zm.sender || "");
      const cleanRecipient = cleanAddressField(zm.toAddress || "");
      const cleanCc = cleanAddressField(zm.ccAddress || "");
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
        subject: cleanSubject,
        snippet: cleanSnippet,
        bodyHtml: existingIdx >= 0 ? db.zohoMessagesCache[existingIdx].bodyHtml : "",
        isRead: String(zm.status) === "1" || Boolean(zm.isRead),
        isStarred: Boolean(zm.flagid && zm.flagid !== "flag_not_set"),
        hasAttachments: Boolean(zm.hasAttachment === "1" || zm.hasAttachment === true),
        receivedTimeMs: Number(zm.receivedTime || 0) || undefined,
        created_at: isoDate,
        source: "zoho_api"
      };
      const existingMsg = existingIdx >= 0 ? db.zohoMessagesCache[existingIdx] : null;
      const subjResMatch = String(mapped.subject || "").match(/Confirma[cç][aã]o\s+d[ae]\s+Reserva\s*[-:]?\s*(\d{7,10})/i);
      const subjResNum = subjResMatch ? subjResMatch[1].trim() : "";
      const isB2bConfirmationEmail =
        mapped.direction === "inbound" &&
        (String(mapped.fromEmail || "").toLowerCase().includes("b2breservas") ||
          Boolean(subjResNum));

      const hasCompleteB2bReservation =
        subjResNum &&
        (db.reservations || []).some(
          r =>
            r &&
            r.status !== "cancelada" &&
            (String(r.b2bReservationNumber || "") === subjResNum ||
              String(r.externalReservationNumber || "") === subjResNum) &&
            Boolean(r.agencyName || r.companyName)
        );

      const needsB2bParse =
        isB2bConfirmationEmail &&
        (!existingMsg?.b2bParsed || (subjResNum && !hasCompleteB2bReservation));

      if (needsB2bParse) {
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
            } catch {
              // Ignora falha pontual de conteúdo na sincronização
            }
          }
          const parsedB2b = await fetchAndParseB2bVoucher({
            rawText: mapped.snippet || "",
            htmlText: fetchedHtml || "",
            subject: mapped.subject || ""
          });
          if (parsedB2b.b2bReservationNumber && parsedB2b.guestName && parsedB2b.checkinDate) {
            const ingestRes = ingestB2bVoucherIntoDb(db, parsedB2b, {
              saveDatabase,
              autoSendCredentialEmail: true
            });
            if (ingestRes?.ok) {
              addedOrUpdated++;
            }
          }
          mapped.b2bParsed = true;
        } catch (b2bErr) {
          console.warn("[B2B Sync Parse] Aviso ao processar voucher B2B:", b2bErr?.message || b2bErr);
        }
      } else if (existingMsg?.b2bParsed) {
        mapped.b2bParsed = true;
      }

      const matchedRes = matchEmailWithReservation(db, mapped);
      mapped.labels = inferZohoSmartLabels(
        mapped,
        existingMsg ? existingMsg.labels : [],
        matchedRes
      );

      if (existingIdx >= 0) {
        const changed =
          existingMsg.isRead !== mapped.isRead ||
          existingMsg.isStarred !== mapped.isStarred ||
          existingMsg.folder !== mapped.folder ||
          (!existingMsg.b2bParsed && mapped.b2bParsed);
        db.zohoMessagesCache[existingIdx] = { ...existingMsg, ...mapped };
        if (changed) addedOrUpdated++;
      } else {
        db.zohoMessagesCache.unshift(mapped);
        addedOrUpdated++;
      }
    }

    zohoTokenCache.lastFolderSyncAt[folder] = Date.now();
    zohoTokenCache.lastSyncAt = new Date().toISOString();
    return { ok: true, synced: addedOrUpdated, mode: "zoho_api" };
  } catch (err) {
    return { ok: false, error: err.message, mode: "hybrid_fallback" };
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
export function getWebmailFoldersAndCounts(db) {
  ensureWebmailCollections(db);
  const all = buildUnifiedMessagesList(db);

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
 * Filtra e pagina mensagens para a Coluna 2 (Lista de E-mails / Threads)
 */
export async function listWebmailMessages(db, {
  folder = "inbox",
  labelId = "",
  quickFilter = "all",
  search = "",
  syncRemote = false,
  saveDatabase = null
} = {}) {
  ensureWebmailCollections(db);

  const oauthCfg = getZohoOAuthConfig(db);
  const syncTargetFolder = labelId ? "inbox" : folder;
  const lastFolderSync = zohoTokenCache.lastFolderSyncAt?.[syncTargetFolder] || 0;
  const shouldAutoSync =
    oauthCfg.isConfigured &&
    syncTargetFolder !== "queue" &&
    syncTargetFolder !== "outbox" &&
    (syncRemote || Date.now() - lastFolderSync > 30000);

  if (shouldAutoSync) {
    const syncRes = await syncZohoMessagesToCache(db, {
      folder: syncTargetFolder === "newsletters" ? "inbox" : syncTargetFolder,
      search,
      saveDatabase
    });
    if (syncRes.ok && syncRes.synced > 0 && typeof saveDatabase === "function") {
      saveDatabase();
    }
  }

  // Garante que reservas B2B sem WhatsApp/CPF do hóspede tenham o e-mail cordial de credenciamento disparado à agência
  await ensurePendingB2bAgencyCredentialDispatches(db, saveDatabase);

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
    return {
      ...m,
      threadCount: subjectMap.get(key) || 1
    };
  });

  const { systemFolders, customFolders, labels } = getWebmailFoldersAndCounts(db);

  return {
    messages: itemsWithThreadCount,
    systemFolders,
    customFolders,
    labels,
    zohoStatus: getZohoStatusSummary(db)
  };
}

/**
 * Obtém detalhes completos de uma mensagem + histórico da Thread em Acordeão + Anexos
 */
export async function getWebmailMessageDetail(db, saveDatabase, messageId) {
  ensureWebmailCollections(db);
  const all = buildUnifiedMessagesList(db);
  const target = all.find(m => m.id === messageId);
  if (!target) {
    return { ok: false, error: "Mensagem não encontrada." };
  }

  // Se for mensagem vinda da Zoho REST API e ainda não tiver o HTML carregado sob demanda, busca na Zoho API
  if (target.source === "zoho_api" && !target.bodyHtml && target.zohoMessageId && target.zohoFolderId) {
    const contentRes = await callZohoMailApi(
      db,
      `/accounts/{accountId}/folders/${target.zohoFolderId}/messages/${target.zohoMessageId}/content`
    );
    if (contentRes.ok && contentRes.data?.content) {
      target.bodyHtml = contentRes.data.content;
      const cached = (db.zohoMessagesCache || []).find(c => c.id === target.id);
      if (cached) cached.bodyHtml = target.bodyHtml;
    }

    if (target.hasAttachments) {
      const attRes = await callZohoMailApi(
        db,
        `/accounts/{accountId}/folders/${target.zohoFolderId}/messages/${target.zohoMessageId}/attachmentinfo`
      );
      if (attRes.ok && Array.isArray(attRes.data?.attachments)) {
        target.attachments = attRes.data.attachments.map(a => ({
          id: a.attachmentId,
          filename: a.attachmentName,
          size: a.attachmentSize,
          contentType: a.contentType || "application/octet-stream",
          downloadUrl: `/api/webmail/attachments/${target.zohoFolderId}/${target.zohoMessageId}/${a.attachmentId}?name=${encodeURIComponent(a.attachmentName || "anexo")}`
        }));
      }
    }
  }

  // Se for confirmação de reserva B2B, extrai dados do voucher e garante vínculo das 4 pontas no banco
  if (
    target.direction === "inbound" &&
    (String(target.fromEmail || "").toLowerCase().includes("b2breservas") ||
      /Confirma[cç][aã]o\s+d[ae]\s+Reserva\s*[-:]?\s*\d{7,10}/i.test(target.subject || ""))
  ) {
    const parsedB2b = await fetchAndParseB2bVoucher({
      rawText: target.bodyText || target.snippet || "",
      htmlText: target.bodyHtml || "",
      subject: target.subject || ""
    });
    if (parsedB2b.b2bReservationNumber && parsedB2b.guestName && parsedB2b.checkinDate) {
      ingestB2bVoucherIntoDb(db, parsedB2b, { saveDatabase, autoSendCredentialEmail: true });
      if (!target.matchedReservation) {
        target.matchedReservation = matchEmailWithReservation(db, target);
      }
    }
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

  // Marca automaticamente como lido ao abrir
  if (!target.isRead) {
    if (!db.emailStateMeta[target.id]) db.emailStateMeta[target.id] = {};
    db.emailStateMeta[target.id].isRead = true;
    target.isRead = true;
    if (typeof saveDatabase === "function") saveDatabase();
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
    const zohoRes = await callZohoMailApi(db, "/accounts/{accountId}/messages", {
      method: "POST",
      body: JSON.stringify({
        fromAddress: zohoTokenCache.primaryEmailAddress || smtpCfg.fromEmail,
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
      created_at: now
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
    const toEmail =
      r.agencyAgentEmail ||
      agency?.financialEmail ||
      (Array.isArray(r.nfDeliveryEmails) && r.nfDeliveryEmails[0]) ||
      r.guestEmail ||
      "";
    return {
      to: toEmail,
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
    .replace(/\r/g, "\n")
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
    .split(/\s*(?:\||;\s+|\s+-\s+(?=(?:Unidade|Filial|Emissor|Agente|Solicitante|Empresa|Centro\s+de\s+Custo|Check-?in|Check-?out|Entrada|Sa[ií]da|Tarifa|Di[aá]ria|Cart[aã]o|Token|RLOC|Localizador)\b))/i)[0]
    .replace(/\s+(?:Unidade(?:\s*[\/\-]?\s*POS)?|Filial|Ponto\s+de\s+Venda|Emissor|Agente|Solicitante|Empresa(?:\s+Cliente)?|Centro\s+de\s+Custo|Check-?in|Check-?out|Entrada|Sa[ií]da|Tarifa|Di[aá]ria|Cart[aã]o|Token(?:\s+VCN)?|RLOC|Localizador)\s*[:\-].*$/i, "")
    .replace(/^[:\-\s]+|[:\-\s]+$/g, "")
    .trim();
}

/**
 * Faz o parse de um e-mail ou voucher PDF/HTML da B2B Reservas (BOOKING_WS e OTA_WS)
 * extraindo os dados das 4 pontas (B2B + Agência + Empresa + Hóspede), Cartão Virtual VCN,
 * Comissão, Centro de Custo e Regra de Nota Fiscal.
 * Aceita objeto `{ rawText, text, htmlText, html, subject }` ou argumentos posicionais `(rawText, htmlText, subject)`.
 */
export function parseB2bVoucherText(input = {}, htmlArg = "", subjectArg = "") {
  const opts =
    typeof input === "string"
      ? { rawText: input, htmlText: htmlArg || "", subject: subjectArg || "" }
      : (input || {});
  const rawText = opts.rawText || opts.text || "";
  const htmlText = opts.htmlText || opts.html || htmlArg || "";
  const subject = opts.subject || subjectArg || "";
  const combinedHtml = String(htmlText || "");
  const cleanText = [String(rawText || "").replace(/\r/g, "\n"), htmlToStructuredLines(combinedHtml)]
    .filter(Boolean)
    .join("\n");
  const fullScan = `${subject || ""}\n${cleanText}`;

  const dmyToIso = (dmy) => {
    const m = String(dmy || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
  };

  // 1. Número da Reserva B2B e RLOC
  const resNumMatch =
    fullScan.match(/Confirma[cç][aã]o\s+(?:d[ae]\s+)?(?:Reserva\s*)?[\s:\-#]*(\d{7,10})/i) ||
    fullScan.match(/N[uú°º]?(?:mero)?\s+d[ae]\s+(?:Reserva|Confirma[cç][aã]o)\s*[\s:\-#]*(\d{7,10})/i) ||
    fullScan.match(/Reserva\s+B2B\s*[\s:\-#]*(\d{7,10})/i) ||
    fullScan.match(/C[oó]d(?:igo)?\.?\s+Reserva\s*[\s:\-#]*(\d{7,10})/i) ||
    fullScan.match(/\b(25\d{6})\b/);
  const b2bReservationNumber = resNumMatch ? resNumMatch[1].trim() : "";

  const rlocMatch =
    fullScan.match(/(?:RLOC|Localizador(?:\s+da\s+Reserva)?)\s*[\s:\-#]+([A-Z0-9]{5,12})/i);
  const b2bLocatorRloc = rlocMatch ? rlocMatch[1].trim().toUpperCase() : b2bReservationNumber;

  // 2. Link do Voucher OTA_WS e Link de Conciliação
  const voucherUrlMatch =
    combinedHtml.match(/https?:\/\/portal\.b2breservas\.com\.br\/content\/conf_reserva\.php\?cd_reserva=[^\s"'<>]+/i) ||
    fullScan.match(/https?:\/\/portal\.b2breservas\.com\.br\/content\/conf_reserva\.php\?cd_reserva=[^\s"'<>]+/i);
  const voucherUrl = voucherUrlMatch ? voucherUrlMatch[0].replace(/&amp;/g, "&") : "";

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
  const subjGuestMatch = String(subject || "").match(/\(([^/)]+)\/([^)]+)\)/);
  if (subjGuestMatch) {
    const last = subjGuestMatch[1].trim();
    const first = subjGuestMatch[2].trim();
    guestName = `${first} ${last}`.replace(/\s+/g, " ").trim();
  }
  const bodyGuestMatch =
    fullScan.match(/(?:H[oóô\ufffd?]?spede|Hospede)(?:\(s\))?\s*[:\-]+\s*([^\n|]+)/i) ||
    fullScan.match(/Passageiro(?:\(s\))?\s*[:\-]+\s*([^\n|]+)/i) ||
    fullScan.match(/Pax\s*[:\-]+\s*([^\n|]+)/i);
  if (bodyGuestMatch) {
    const rawPax = cleanB2bFieldValue(bodyGuestMatch[1]).replace(/\s*\(ADT\).*$/i, "").trim();
    if (rawPax.includes("/")) {
      const [last, first] = rawPax.split("/").map(s => s.trim());
      if (first && last) guestName = `${first} ${last}`;
    } else if (rawPax) {
      guestName = rawPax;
    }
  }

  // 4. Datas Check-in / Check-out
  let checkinDate = "";
  let checkoutDate = "";
  const checkinMatch = fullScan.match(/Check-?in[\s:\-]*(\d{2}\/\d{2}\/\d{4})/i) || fullScan.match(/Entrada[\s:\-]*(\d{2}\/\d{2}\/\d{4})/i);
  const checkoutMatch = fullScan.match(/Check-?out[\s:\-]*(\d{2}\/\d{2}\/\d{4})/i) || fullScan.match(/Sa[ií\ufffd?]?da[\s:\-]*(\d{2}\/\d{2}\/\d{4})/i);
  if (checkinMatch) checkinDate = dmyToIso(checkinMatch[1]);
  if (checkoutMatch) checkoutDate = dmyToIso(checkoutMatch[1]);

  // 5. Tarifa, Comissão e Café da Manhã
  const hasBreakfast = !/\bSEM\s+CAF[EÉ\ufffd?]/i.test(fullScan);
  const commPctMatch = fullScan.match(/(?:Comiss[aã\ufffd?]?o|COMISSIONAD[AO])[\s:\-(]*(\d+(?:[.,]\d+)?)\s*%/i);
  let b2bCommissionPct = commPctMatch ? Number(String(commPctMatch[1]).replace(",", ".")) : 0;
  if (!commPctMatch && /\bCOMISSIONAD[AO]\b/i.test(fullScan)) {
    b2bCommissionPct = 12;
  }
  const b2bRatePolicy = b2bCommissionPct > 0 || /\bCOMISSIONAD[AO]\b/i.test(fullScan) ? "COMISSIONADA" : "NET";

  const rateMatch =
    fullScan.match(/(?:Di[aá\ufffd?]?ria(?:\s+M[eé\ufffd?]?dia)?|Valor\s+da\s+Di[aá\ufffd?]?ria|Tarifa(?:\s+Di[aá\ufffd?]?ria)?)[\s:\-]*R\$\s*([\d.,]+)/i) ||
    fullScan.match(/R\$\s*(280[.,]00|300[.,]00|313[.,]00|400[.,]00)/i);
  let dailyRate = 0;
  if (rateMatch) {
    dailyRate = Number(String(rateMatch[1]).replace(/\./g, "").replace(",", ".")) || 0;
  } else {
    const totalMatch = fullScan.match(/(?:Valor\s+Total|Total(?:\s+da\s+Reserva|\s+Geral)?)[\s:\-]*R\$\s*([\d.,]+)/i);
    if (totalMatch) {
      const totalVal = Number(String(totalMatch[1]).replace(/\./g, "").replace(",", ".")) || 0;
      const nightsCount =
        checkinDate && checkoutDate
          ? Math.max(1, Math.round((new Date(`${checkoutDate}T12:00:00Z`) - new Date(`${checkinDate}T12:00:00Z`)) / 86400000))
          : 1;
      dailyRate = +(totalVal / nightsCount).toFixed(2);
    }
  }

  // 6. Agência, Unidade POS, Emissor, Empresa e Centro de Custo
  const agencyMatch = fullScan.match(/(?:Ag[eê\ufffd?]?ncia|Agencia)(?:\s+(?:Solicitante|de\s+Viagens))?\s*[:\-]+\s*([^\n]+)/i);
  const posMatch = fullScan.match(/(?:Unidade(?:\s*[\/\-]?\s*POS)?|Filial|Ponto\s+de\s+Venda)\s*[:\-]+\s*([^\n]+)/i);
  const agentMatch = fullScan.match(/(?:Emissor|Agente|Solicitante)\s*[:\-]+\s*([^\n]+)/i);
  const companyMatch = fullScan.match(/Empresa(?:\s+Cliente)?\s*[:\-]+\s*([^\n]+)/i);
  const costCenterMatch = fullScan.match(/Centro\s+de\s+Custo\s*[:\-]+\s*([A-Za-z0-9._-]+)/i);

  // 7. Cartão Virtual VCN & Token
  const cardMatch = fullScan.match(/\b((?:5\d{3,5}|4\d{3,5}|37\d{2,4})[xX*]{4,8}\d{4})\b/);
  const cardFinalMatch = fullScan.match(/Final\s*[:\-]?\s*(\d{4})\b/i);
  const vcnTokenMatch = fullScan.match(/(?:Token(?:\s+VCN)?|C[oó\ufffd?]?digo\s+VCN)\s*[:\-]?\s*([A-Z0-9]{5,12})\b/i);
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
        : "";
  const b2bVcnToken = vcnTokenMatch ? vcnTokenMatch[1].trim().toUpperCase() : "";
  const b2bPaymentType = /FATURAD[AO]/i.test(fullScan) && !b2bCardMasked && !b2bVcnToken ? "FATURADO" : "VIRTUAL_CARD";

  // 8. Regra de Nota Fiscal e E-mails
  const allEmails = Array.from(
    new Set(
      (fullScan.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])
        .map(e => e.trim().toLowerCase())
        .filter(
          e =>
            !e.includes("corpflats.com.br") &&
            !e.includes("promenade.com.br") &&
            !e.includes("b2breservas.com.br")
        )
    )
  );

  const nfHideFromGuest =
    /N[AÃ\ufffd?]?O\s+(?:ENTREGAR|EXIBIR)\s+(?:A\s+)?(?:NOTA\s+FISCAL|NF|VALORES)\s+(?:AO|PARA\s+O)\s+(?:H[OÓ\ufffd?]?SPEDE|HOSPEDE)/i.test(fullScan) ||
    /Ocultar\s+(?:valores|nota|nf)\s+do\s+(?:h[oó\ufffd?]?spede|hospede)\s*[:\-]?\s*(?:sim|true|1)/i.test(fullScan);
  let invoiceRecipientType = "guest";
  if (
    /EMITIR\s+(?:A\s+)?(?:NOTA(?:\s+FISCAL)?|NF)\s+(?:EM\s+NOME\s+DA|PARA\s+A)\s+(?:AG[EÊ\ufffd?]?NCIA|AGENCIA)/i.test(fullScan) ||
    /Tomador(?:\s+da\s+Nota)?\s*[:\-]+\s*(?:Emitir\s+nota\s+para\s+a\s+)?(?:Ag[eê\ufffd?]?ncia|Agencia)/i.test(fullScan)
  ) {
    invoiceRecipientType = "agency";
  } else if (
    nfHideFromGuest ||
    /EMITIR\s+(?:A\s+)?(?:NOTA(?:\s+FISCAL)?|NF)\s+PARA\s*[:\-]?\s*(?:A\s+)?EMPRESA/i.test(fullScan) ||
    /EMITIR\s+(?:A\s+)?(?:NOTA(?:\s+FISCAL)?|NF)\s+PARA\s*:/i.test(fullScan) ||
    /Tomador(?:\s+da\s+Nota)?\s*[:\-]+\s*(?:Emitir\s+nota\s+para\s+a\s+)?Empresa/i.test(fullScan)
  ) {
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
    hasBreakfast,
    b2bRatePolicy,
    b2bCommissionPct,
    dailyRate,
    agencyName: agencyMatch ? cleanB2bFieldValue(agencyMatch[1]) : "",
    agencyPosUnit: posMatch ? cleanB2bFieldValue(posMatch[1]) : "",
    agencyAgentName: agentMatch ? cleanB2bFieldValue(agentMatch[1]) : "",
    companyName: companyMatch ? cleanB2bFieldValue(companyMatch[1]) : "",
    costCenter: costCenterMatch ? costCenterMatch[1].trim() : "",
    b2bPaymentType,
    b2bCardBrand,
    b2bCardMasked,
    b2bVcnToken,
    b2bAuthorizedExpenses: "DEBITAR SOMENTE DIARIAS",
    invoiceRecipientType,
    nfDeliveryEmails: allEmails,
    nfHideFromGuest
  };
}

/**
 * Faz o download opcional do link `conf_reserva.php` (OTA_WS) quando presente no e-mail/texto
 * e retorna os dados consolidados do voucher B2B.
 */
export async function fetchAndParseB2bVoucher(input = {}, htmlArg = "", subjectArg = "") {
  let parsed = parseB2bVoucherText(input, htmlArg, subjectArg);
  if (
    parsed.voucherUrl &&
    (!parsed.checkoutDate || !parsed.agencyName || !parsed.companyName || !parsed.dailyRate || !parsed.b2bCardMasked)
  ) {
    try {
      const resp = await fetch(parsed.voucherUrl, {
        headers: { "User-Agent": "Mozilla/5.0 CorpFlats-PMS/1.0" },
        signal: AbortSignal.timeout(8000)
      });
      if (resp.ok) {
        const fetchedHtml = await resp.text();
        const opts =
          typeof input === "string"
            ? { rawText: input, htmlText: `${htmlArg || ""}\n${fetchedHtml}`, subject: subjectArg || "" }
            : {
                ...(input || {}),
                htmlText: `${input?.htmlText || input?.html || ""}\n${fetchedHtml}`
              };
        parsed = parseB2bVoucherText(opts);
      }
    } catch {
      // Mantém dados extraídos localmente se o portal externo estiver inacessível
    }
  }
  return parsed;
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

  const normStr = (s = "") =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim();

  const extractNameTokens = (s = "") =>
    normStr(s)
      .replace(/[^A-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(t => t.length >= 3 && !["DOS", "DAS", "FILHO", "NETO", "JUNIOR", "SRA", "SRTA"].includes(t));

  // 1. Agência B2B
  let agency = null;
  if (parsed.agencyName) {
    const targetAgNorm = normStr(parsed.agencyName);
    agency = db.agencies.find(a => {
      const tNorm = normStr(a.tradeName);
      const cNorm = normStr(a.corporateName);
      return (
        (tNorm && (tNorm === targetAgNorm || tNorm.includes(targetAgNorm) || targetAgNorm.includes(tNorm))) ||
        (cNorm && (cNorm === targetAgNorm || cNorm.includes(targetAgNorm) || targetCompOrAgMatch(targetAgNorm, cNorm)))
      );
    });
    if (!agency) {
      const nextAgId = db.agencies.reduce((m, a) => Math.max(m, Number(a.id) || 0), 0) + 1;
      agency = {
        id: nextAgId,
        name: parsed.agencyName,
        corporateName: parsed.agencyName,
        tradeName: parsed.agencyName,
        cnpj: "",
        email: parsed.nfDeliveryEmails?.[0] || "",
        financialEmail: parsed.nfDeliveryEmails?.[0] || "",
        phone: "",
        city: "São Paulo",
        state: "SP",
        ratePolicy: parsed.b2bRatePolicy || "COMISSIONADA",
        commissionPct: parsed.b2bCommissionPct ?? (parsed.b2bRatePolicy === "NET" ? 0 : 12),
        defaultPaymentType: parsed.b2bPaymentType || "VIRTUAL_CARD",
        defaultRecipientType: parsed.invoiceRecipientType || "company",
        posUnits: parsed.agencyPosUnit ? [{ name: parsed.agencyPosUnit, city: "", state: "" }] : [],
        agents: parsed.agencyAgentName
          ? [{ name: parsed.agencyAgentName, email: parsed.nfDeliveryEmails?.[0] || "", phone: "", posUnit: parsed.agencyPosUnit || "" }]
          : [],
        clientCompanies: parsed.companyName ? [parsed.companyName] : [],
        notes: "Agência cadastrada automaticamente via leitura de voucher B2B.",
        status: "active",
        createdAt: new Date().toISOString()
      };
      db.agencies.push(agency);
    } else {
      if (parsed.agencyPosUnit) {
        if (!Array.isArray(agency.posUnits)) agency.posUnits = [];
        const hasPos = agency.posUnits.some(u => normStr(typeof u === "string" ? u : u.name) === normStr(parsed.agencyPosUnit));
        if (!hasPos) agency.posUnits.push({ name: parsed.agencyPosUnit, city: "", state: "" });
      }
      if (parsed.agencyAgentName) {
        if (!Array.isArray(agency.agents)) agency.agents = [];
        const hasAgent = agency.agents.some(ag => normStr(typeof ag === "string" ? ag : ag.name) === normStr(parsed.agencyAgentName));
        if (!hasAgent) {
          agency.agents.push({
            name: parsed.agencyAgentName,
            email: parsed.nfDeliveryEmails?.[0] || "",
            phone: "",
            posUnit: parsed.agencyPosUnit || ""
          });
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

  // 2. Empresa Cliente
  let company = null;
  if (parsed.companyName) {
    const targetCompNorm = normStr(parsed.companyName);
    company = db.companies.find(c => {
      const tNorm = normStr(c.tradeName);
      const cNorm = normStr(c.corporateName);
      return (
        (tNorm && (tNorm === targetCompNorm || tNorm.includes(targetCompNorm) || targetCompNorm.includes(tNorm))) ||
        (cNorm && (cNorm === targetCompNorm || cNorm.includes(targetCompNorm) || targetCompNorm.includes(cNorm)))
      );
    });
    if (!company) {
      const nextCompId = db.companies.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0) + 1;
      company = {
        id: nextCompId,
        name: parsed.companyName,
        corporateName: parsed.companyName,
        tradeName: parsed.companyName,
        cnpj: "",
        email: parsed.nfDeliveryEmails?.[0] || "",
        phone: "",
        city: "",
        state: "",
        billingType: "faturado_b2b",
        notes: "Empresa vinculada automaticamente via voucher B2B.",
        createdAt: new Date().toISOString()
      };
      db.companies.push(company);
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
  const checkoutDate =
    parsed.checkoutDate ||
    reservation?.checkoutDate ||
    new Date(new Date(`${checkinDate}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
  const nights = Math.max(
    1,
    Math.round((new Date(`${checkoutDate}T12:00:00Z`) - new Date(`${checkinDate}T12:00:00Z`)) / 86400000)
  );
  const dailyRate = Number(parsed.dailyRate) || Number(reservation?.dailyRate) || 280;
  const totalAmount = +(dailyRate * nights).toFixed(2);
  const commPct = Number(
    parsed.b2bCommissionPct ?? reservation?.b2bCommissionPct ?? (parsed.b2bRatePolicy === "NET" ? 0 : 12)
  ) || 0;
  const b2bCommissionAmount = +((totalAmount * commPct) / 100).toFixed(2);
  const b2bNetRate = +(dailyRate * (1 - commPct / 100)).toFixed(2);
  const resolvedRecipientType =
    parsed.invoiceRecipientType ||
    reservation?.invoiceRecipientType ||
    agency?.defaultRecipientType ||
    "company";

  let created = false;
  if (!reservation) {
    const flat = findAvailableFlatForPeriod(db, checkinDate, checkoutDate);
    const nextResId = db.reservations.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;

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
      companyCnpj: company?.cnpj || "",
      agencyId: agency?.id || null,
      agencyName: agency?.tradeName || parsed.agencyName || "",
      agencyTradeName: agency?.tradeName || parsed.agencyName || "",
      agencyCorporateName: agency?.corporateName || parsed.agencyName || "",
      agencyCnpj: agency?.cnpj || "",
      agencyPosUnit: parsed.agencyPosUnit || "",
      agencyAgentName: parsed.agencyAgentName || "",
      agencyAgentEmail: parsed.nfDeliveryEmails?.[0] || agency?.financialEmail || "",
      checkinDate,
      checkoutDate,
      nights,
      dailyRate,
      totalAmount,
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
      b2bRatePolicy: parsed.b2bRatePolicy || "COMISSIONADA",
      b2bCommissionPct: commPct,
      b2bCommissionAmount,
      b2bNetRate,
      b2bPaymentType: parsed.b2bPaymentType || "VIRTUAL_CARD",
      b2bCardBrand: parsed.b2bCardBrand || "",
      b2bCardMasked: parsed.b2bCardMasked || "",
      b2bVcnToken: parsed.b2bVcnToken || "",
      b2bAuthorizedExpenses: parsed.b2bAuthorizedExpenses || "DEBITAR SOMENTE DIARIAS",
      b2bConciliationUrl: parsed.b2bConciliationUrl || "",
      b2bVoucherUrl: parsed.voucherUrl || "",
      costCenter: parsed.costCenter || "",
      invoiceRecipientType: resolvedRecipientType,
      nfRecipientType: resolvedRecipientType,
      nfDeliveryEmails: Array.isArray(parsed.nfDeliveryEmails) ? parsed.nfDeliveryEmails : [],
      nfHideFromGuest: Boolean(parsed.nfHideFromGuest),
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
      reservation.agencyName = agency.tradeName || agency.corporateName || parsed.agencyName || reservation.agencyName || "";
      reservation.agencyTradeName = agency.tradeName || parsed.agencyName || reservation.agencyTradeName || "";
      reservation.agencyCorporateName = agency.corporateName || parsed.agencyName || reservation.agencyCorporateName || "";
      reservation.agencyCnpj = agency.cnpj || reservation.agencyCnpj || "";
    } else if (parsed.agencyName && !reservation.agencyName) {
      reservation.agencyName = parsed.agencyName;
      reservation.agencyTradeName = parsed.agencyName;
    }
    if (parsed.agencyPosUnit && !reservation.agencyPosUnit) {
      reservation.agencyPosUnit = parsed.agencyPosUnit;
    }
    if (parsed.agencyAgentName && !reservation.agencyAgentName) {
      reservation.agencyAgentName = parsed.agencyAgentName;
    }
    const agentEmailCandidate = parsed.nfDeliveryEmails?.[0] || agency?.financialEmail || agency?.email || "";
    if (agentEmailCandidate && !reservation.agencyAgentEmail) {
      reservation.agencyAgentEmail = agentEmailCandidate;
    }

    if (company?.id) {
      reservation.companyId = company.id;
      reservation.companyName = company.tradeName || company.corporateName || parsed.companyName || reservation.companyName || "";
      reservation.companyCnpj = company.cnpj || reservation.companyCnpj || "";
    } else if (parsed.companyName && !reservation.companyName) {
      reservation.companyName = parsed.companyName;
    }
    if (parsed.costCenter && !reservation.costCenter) {
      reservation.costCenter = parsed.costCenter;
    }

    if (parsed.checkoutDate) {
      reservation.checkoutDate = parsed.checkoutDate;
    }
    reservation.nights = nights;
    if (Number(parsed.dailyRate) > 0) {
      reservation.dailyRate = dailyRate;
      reservation.totalAmount = totalAmount;
    } else if (!reservation.totalAmount && dailyRate > 0) {
      reservation.totalAmount = totalAmount;
    }
    if (parsed.hasBreakfast !== undefined) {
      reservation.hasBreakfast = parsed.hasBreakfast !== false;
      reservation.includeBreakfast = parsed.hasBreakfast !== false;
    }

    reservation.b2bRatePolicy = parsed.b2bRatePolicy || reservation.b2bRatePolicy || "COMISSIONADA";
    reservation.b2bCommissionPct = commPct;
    reservation.b2bCommissionAmount = b2bCommissionAmount;
    reservation.b2bNetRate = b2bNetRate;
    reservation.b2bPaymentType = parsed.b2bPaymentType || reservation.b2bPaymentType || "VIRTUAL_CARD";
    reservation.paymentMethod =
      reservation.b2bPaymentType === "FATURADO"
        ? "faturado_b2b"
        : !reservation.paymentMethod || reservation.paymentMethod === "pix"
          ? "vcn_b2b"
          : reservation.paymentMethod;

    if (parsed.b2bCardMasked) {
      reservation.b2bCardMasked = parsed.b2bCardMasked;
      reservation.b2bCardBrand = parsed.b2bCardBrand || reservation.b2bCardBrand || "";
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
      reservation.b2bVoucherUrl = parsed.voucherUrl;
    }

    reservation.invoiceRecipientType = resolvedRecipientType;
    reservation.nfRecipientType = resolvedRecipientType;
    if (Array.isArray(parsed.nfDeliveryEmails) && parsed.nfDeliveryEmails.length > 0) {
      const mergedEmails = new Set([
        ...(Array.isArray(reservation.nfDeliveryEmails) ? reservation.nfDeliveryEmails : []),
        ...parsed.nfDeliveryEmails
      ]);
      reservation.nfDeliveryEmails = Array.from(mergedEmails);
    }
    if (parsed.nfHideFromGuest !== undefined) {
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

  // Disparo cordial automático se a reserva B2B ainda estiver sem telefone ou CPF do hóspede
  if (
    autoSendCredentialEmail &&
    (!reservation.guestPhone || !reservation.guestDocument) &&
    !reservation.b2bCredentialEmailSentAt
  ) {
    dispatchB2bAgencyCredentialEmail(db, saveDatabase, reservation, {
      trigger: "b2b_auto_credential_request"
    }).catch(err => {
      console.warn("[B2B Auto Credential] Aviso ao disparar e-mail de credenciamento à agência:", err.message);
    });
  }

  if (typeof saveDatabase === "function") saveDatabase();
  return { ok: true, created, reservation, agency, company, guest };
}

/**
 * Dispara o e-mail cordial de Confirmação B2B + Link Seguro de Credenciamento do Hóspede (/credenciamento/:code)
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
    trigger = "b2b_agency_credential_request"
  } = {}
) {
  if (!db || !reservation) {
    return { ok: false, error: "Reserva não informada." };
  }

  const linkedAgency = reservation.agencyId
    ? (db.agencies || []).find(a => String(a.id) === String(reservation.agencyId))
    : null;
  const linkedCompany = reservation.companyId
    ? (db.companies || []).find(c => String(c.id) === String(reservation.companyId))
    : null;
  const flat = (db.flats || []).find(
    f => Number(f.id) === Number(reservation.flatId) || String(f.number) === String(reservation.flatNumber)
  );

  const nfEmails = Array.isArray(reservation.nfDeliveryEmails) ? reservation.nfDeliveryEmails : [];
  const guestEmailLower = String(reservation.guestEmail || "").trim().toLowerCase();
  const agencyNfEmails = nfEmails.filter(
    e => e && String(e).includes("@") && String(e).trim().toLowerCase() !== guestEmailLower
  );

  const targetEmail = String(
    toEmail ||
      reservation.agencyAgentEmail ||
      reservation.requesterInfo?.email ||
      reservation.requesterEmail ||
      linkedAgency?.financialEmail ||
      linkedAgency?.email ||
      linkedCompany?.email ||
      linkedCompany?.financialEmail ||
      linkedCompany?.emailFinanceiro ||
      agencyNfEmails[0] ||
      nfEmails[0] ||
      ""
  ).trim();

  if (!targetEmail || !targetEmail.includes("@")) {
    return { ok: false, error: "E-mail do solicitante ou agência não informado na reserva." };
  }

  const ccList = agencyNfEmails.filter(
    e => String(e).trim().toLowerCase() !== targetEmail.toLowerCase()
  );

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
    db
  });

  // Se já existia um registro com falha (status: failed) para o credenciamento desta reserva, remove antes de reenviar para evitar duplicidade
  if (Array.isArray(db.reservationCommunications)) {
    const resCodeUpper = String(reservation.code || "").trim().toUpperCase();
    const resIdStr = String(reservation.id || "").trim();
    db.reservationCommunications = db.reservationCommunications.filter(c => {
      if (!c || c.type !== "email" || c.status !== "failed") return true;
      const cRes = String(c.reservation_id || "").trim().toUpperCase();
      if (cRes !== resCodeUpper && cRes !== resIdStr) return true;
      const trig = String(c.metadata?.trigger || "").toLowerCase();
      const subj = String(c.subject || "").toLowerCase();
      return !(trig.includes("b2b") || trig.includes("credenciamento") || subj.includes("credenciamento"));
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

  const nowIso = new Date().toISOString();
  reservation.b2bCredentialEmailSentAt = nowIso;
  reservation.b2bCredentialEmailRecipient = ccList.length > 0 ? `${targetEmail}, ${ccList.join(", ")}` : targetEmail;

  if (sendRes?.communication) {
    sendRes.communication.metadata = {
      ...(sendRes.communication.metadata || {}),
      trigger,
      credentialUrl: rendered.credentialUrl || credentialUrl,
      agencyName: reservation.agencyTradeName || reservation.agencyName || linkedAgency?.tradeName || "",
      b2bReservationNumber: reservation.b2bReservationNumber || reservation.externalReservationNumber || "",
      lastAutoRetryAt: nowIso
    };
  }

  if (typeof saveDatabase === "function") {
    saveDatabase("b2b_credential_email_sent");
  }

  return {
    ok: true,
    success: true,
    sentTo: reservation.b2bCredentialEmailRecipient,
    recipient: targetEmail,
    cc: ccList,
    credentialUrl: rendered.credentialUrl || credentialUrl,
    sentAt: nowIso,
    method: sendRes?.method || "smtp_engine",
    communicationId: sendRes?.communication?.id || null,
    communication: sendRes?.communication || null
  };
}

/**
 * Varre todas as reservas B2B ativas que ainda estão sem WhatsApp/CPF do hóspede
 * e garante que o e-mail cordial de solicitação de credenciamento (/credenciamento/:code)
 * tenha sido enviado e registrado para a agência responsável.
 */
export async function ensurePendingB2bAgencyCredentialDispatches(
  db,
  saveDatabase,
  { baseUrl = "https://corpflats.com.br" } = {}
) {
  if (!db || !Array.isArray(db.reservations)) return { dispatched: 0 };
  if (!Array.isArray(db.reservationCommunications)) db.reservationCommunications = [];

  const canSendReal = Boolean(getZohoOAuthConfig(db).isConfigured || getSmtpConfig(db).isConfigured);
  if (!canSendReal) return { dispatched: 0 };
  let dispatched = 0;

  for (const r of db.reservations) {
    if (!r || r.status === "cancelada" || r.status === "cancelled") continue;
    const isB2b = String(r.channel || "").toLowerCase().includes("b2b") || Boolean(r.b2bReservationNumber);
    if (!isB2b) continue;

    const cleanPhone = String(r.guestPhone || "").replace(/\D/g, "");
    const cleanDoc = String(r.guestDocument || "").replace(/\D/g, "");
    if (cleanPhone.length >= 10 && cleanDoc.length >= 5) continue;
    if (r.b2bCredentialCompletedAt) continue;

    const resCode = String(r.code || "").trim().toUpperCase();
    const resId = String(r.id || "").trim();

    const existingComm = db.reservationCommunications.find(c => {
      if (!c || c.type !== "email") return false;
      const cRes = String(c.reservation_id || "").trim().toUpperCase();
      if (cRes !== resCode && cRes !== resId) return false;
      const trig = String(c.metadata?.trigger || "").toLowerCase();
      const subj = String(c.subject || "").toLowerCase();
      return trig.includes("b2b") || trig.includes("credenciamento") || subj.includes("credenciamento");
    });

    if (existingComm) {
      if (!r.b2bCredentialEmailSentAt) {
        r.b2bCredentialEmailSentAt = existingComm.created_at || new Date().toISOString();
        r.b2bCredentialEmailRecipient = existingComm.recipient || r.agencyAgentEmail || "";
      }
      if (existingComm.status === "sent" || existingComm.status === "delivered" || existingComm.status === "pending") {
        continue;
      }
      // Se falhou anteriormente, só tenta reenviar se Zoho OAuth ou SMTP estiverem configurados e após intervalo mínimo de 5 min
      const lastTryMs = existingComm.metadata?.lastAutoRetryAt
        ? new Date(existingComm.metadata.lastAutoRetryAt).getTime()
        : new Date(existingComm.created_at || 0).getTime();
      if (!canSendReal || Date.now() - lastTryMs < 300000) {
        continue;
      }
    }

    try {
      const res = await dispatchB2bAgencyCredentialEmail(db, saveDatabase, r, {
        baseUrl,
        trigger: "b2b_auto_credential_request"
      });
      if (res && res.ok) {
        dispatched++;
      }
    } catch (err) {
      console.warn(`[B2B Credential Sync] Falha ao disparar credenciamento para reserva ${r.code}:`, err.message);
    }
  }

  return { dispatched };
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
  const rawHtml = String(payload?.content || payload?.html || payload?.bodyHtml || payload?.data?.content || "").trim();
  const rawText = String(payload?.summary || payload?.text || payload?.bodyText || payload?.data?.summary || "").trim();

  if (
    rawSubj &&
    (rawFrom.toLowerCase().includes("b2breservas") ||
      /Confirma[cç][aã]o\s+d[ae]\s+Reserva\s*[-:]?\s*\d{7,10}/i.test(rawSubj))
  ) {
    try {
      const parsedB2b = await fetchAndParseB2bVoucher({
        rawText,
        htmlText: rawHtml,
        subject: rawSubj
      });
      if (parsedB2b.b2bReservationNumber && parsedB2b.guestName && parsedB2b.checkinDate) {
        directIngest = ingestB2bVoucherIntoDb(db, parsedB2b, {
          saveDatabase,
          autoSendCredentialEmail: true
        });
      }
    } catch (err) {
      console.warn("[Zoho Webhook Direct B2B] Aviso:", err?.message || err);
    }
  }

  const syncRes = await syncZohoMessagesToCache(db, {
    folder: "inbox",
    limit: 40,
    saveDatabase
  });

  await ensurePendingB2bAgencyCredentialDispatches(db, saveDatabase);

  if (typeof saveDatabase === "function") {
    saveDatabase("zoho_webhook_sync");
  }

  return {
    ok: true,
    synced: syncRes?.synced || 0,
    directIngestedReservation: directIngest?.reservation?.code || null,
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





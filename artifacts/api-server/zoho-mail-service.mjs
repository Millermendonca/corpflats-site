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

  // 5. Padrão B2B Reservas: "Confirmacao da Reserva: 25057926 (SOBRENOME/NOME) - Check-in: DD/MM/YYYY"
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
export async function syncZohoMessagesToCache(db, { folder = "inbox", search = "", limit = 50 } = {}) {
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
      const matchedRes = matchEmailWithReservation(db, mapped);
      mapped.labels = inferZohoSmartLabels(
        mapped,
        existingIdx >= 0 ? db.zohoMessagesCache[existingIdx].labels : [],
        matchedRes
      );

      if (existingIdx >= 0) {
        db.zohoMessagesCache[existingIdx] = { ...db.zohoMessagesCache[existingIdx], ...mapped };
      } else {
        db.zohoMessagesCache.unshift(mapped);
      }
      addedOrUpdated++;
    }

    zohoTokenCache.lastFolderSyncAt[folder] = Date.now();
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
    const syncRes = await syncZohoMessagesToCache(db, { folder: syncTargetFolder === "newsletters" ? "inbox" : syncTargetFolder, search });
    if (syncRes.ok && syncRes.synced > 0 && typeof saveDatabase === "function") {
      saveDatabase();
    }
  }

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

  return {
    to: r.guestEmail || receptionEmail,
    subject: `Flat ${r.flatNumber} - ${r.guestName} (#${r.code || r.id})`,
    bodyText: `Olá, ${r.guestName}!\n\nReferente à sua reserva #${r.code || r.id} no Flat ${r.flatNumber}:\n\n`,
    bodyHtml: ""
  };
}

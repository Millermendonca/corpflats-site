import nodemailer from "nodemailer";
import dns from "dns";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import {
  getCheckinUrlSync as getSerproCheckinUrlSync,
  getCheckinUrl as getSerproCheckinUrl
} from "./fnrh-serpro-service.mjs";
import { rebuildFnrhPdfOnTheFly } from "./fnrh-pdf-service.mjs";

/**
 * Resolução dinâmica e unificada de URL de check-in para disparos de e-mail.
 */
export function getCheckinUrlSync(reservation, guestIndex = 1, baseUrl = "", dbInstance = null) {
  if (typeof globalThis.getCheckinUrlSync === "function") {
    return globalThis.getCheckinUrlSync(reservation, guestIndex, baseUrl, dbInstance);
  }
  if (typeof getSerproCheckinUrlSync === "function") {
    return getSerproCheckinUrlSync(reservation, guestIndex, baseUrl, dbInstance);
  }
  const activeDb = dbInstance || (typeof globalThis.db !== "undefined" ? globalThis.db : null);
  const activeSettings = activeDb?.settings || activeDb || {};
  const currentProvider = activeSettings.checkinProvider || "proprio";
  const hostBase = (baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.com.br").replace(/\/$/, "");
  const safeGuestIndex = Number(guestIndex) || 1;
  const resCode = reservation?.code || reservation?.id || "";
  const internalCheckinUrl = `${hostBase}/pre-checkin/${resCode}?guest=${safeGuestIndex}`;

  if (currentProvider === "gov_fnrh" && (reservation?.serproPrecheckinUrl || reservation?.link_precheckin)) {
    return reservation.serproPrecheckinUrl || reservation.link_precheckin;
  }

  return internalCheckinUrl;
}

function resolveEmailGuestCount(reservation) {
  if (!reservation || typeof reservation !== "object") return 1;
  const raw =
    Number(reservation.guestCount) ||
    Number(reservation.guestsCount) ||
    Number(reservation.numGuests) ||
    Number(reservation.adults) ||
    (typeof reservation.guests === "number" ? Number(reservation.guests) : 0) ||
    (Array.isArray(reservation.guests) && reservation.guests.length > 0 ? reservation.guests.length : 0) ||
    1;
  return Math.max(1, Math.round(raw));
}

function formatEmailChannelLabel(reservation) {
  if (!reservation || typeof reservation !== "object") return "Site CorpFlats";
  if (reservation.channelLabel && String(reservation.channelLabel).trim()) {
    return String(reservation.channelLabel).trim();
  }
  const raw = String(reservation.channel || reservation.source || "").toLowerCase().trim();
  if (
    raw.includes("b2b") ||
    raw.includes("corporat") ||
    raw.includes("agenc") ||
    raw.includes("agênc") ||
    reservation.isCorporate ||
    reservation.isB2B ||
    reservation.agencyId ||
    reservation.b2bReservationNumber ||
    reservation.b2bLocatorRloc
  ) {
    return "B2B / Corporativo";
  }
  if (raw.includes("booking")) return "Booking.com";
  if (raw.includes("airbnb")) return "Airbnb";
  if (raw.includes("expedia")) return "Expedia";
  if (raw.includes("decolar")) return "Decolar";
  if (raw.includes("whats") || raw.includes("wpp") || raw === "direta" || raw === "direto") return "WhatsApp";
  if (raw.includes("site") || raw.includes("motor") || raw.includes("corpflats") || raw === "direct") return "Site CorpFlats";
  if (raw.includes("balcao") || raw.includes("balcão") || raw.includes("presencial") || raw.includes("recepcao") || raw.includes("recepção")) {
    return "Recepção / Balcão";
  }
  if (raw === "outros" || raw === "outro") return "Outros";
  const orig = String(reservation.channel || reservation.source || "").trim();
  return orig ? orig.charAt(0).toUpperCase() + orig.slice(1) : "Site CorpFlats";
}

export function isOtaOrB2bReservation(reservation) {
  if (!reservation || typeof reservation !== "object") return false;
  const raw = String(reservation.channel || reservation.source || "").toLowerCase().trim();
  return Boolean(
    raw.includes("booking") ||
    raw.includes("airbnb") ||
    raw.includes("expedia") ||
    raw.includes("decolar") ||
    raw.includes("b2b") ||
    raw.includes("corporat") ||
    raw.includes("agenc") ||
    raw.includes("agênc") ||
    raw.includes("empresa") ||
    reservation.isCorporate ||
    reservation.isB2B ||
    reservation.isB2b ||
    reservation.agencyId ||
    reservation.agencyName ||
    reservation.companyId ||
    reservation.companyName ||
    reservation.requesterType === "company" ||
    reservation.b2bReservationNumber ||
    reservation.b2bLocatorRloc
  );
}

export function evaluateReceptionCheckinStage(reservation) {
  const expectedGuests = Math.max(1, resolveEmailGuestCount(reservation));
  const hasExplicitCount = Boolean(
    Number(reservation?.guestCount) > 0 ||
    Number(reservation?.guestsCount) > 0 ||
    Number(reservation?.numGuests) > 0 ||
    Number(reservation?.adults) > 0
  );
  const needsReSignature = Boolean(reservation?.needsReSignature);
  const rawGuestsAll = Array.isArray(reservation?.guests) ? reservation.guests : [];
  const rawGuests = hasExplicitCount
    ? rawGuestsAll.filter((g, idx) => (Number(g?.index) || idx + 1) <= expectedGuests)
    : rawGuestsAll;

  let completedGuests = 0;
  if (rawGuests.length > 0) {
    completedGuests = rawGuests.filter(g =>
      g &&
      !needsReSignature &&
      !g.needsReSignature &&
      Boolean(g.hasCompletedCheckin || g.status === "CHECKED_IN" || g.fnrhDocumentUuid || g.fnrhSignedAt)
    ).length;
  } else {
    const titularCompleted =
      !needsReSignature &&
      Boolean(
        reservation?.fnhrCompleted ||
        reservation?.preCheckinCompleted ||
        reservation?.fnrhDocumentUuid ||
        reservation?.fnrhSignedAt
      );
    completedGuests = titularCompleted ? 1 : 0;
  }

  completedGuests = Math.min(completedGuests, expectedGuests);
  const pendingGuests = Math.max(0, expectedGuests - completedGuests);
  const stage = completedGuests === 0
    ? "awaiting"
    : completedGuests < expectedGuests
      ? "partial"
      : "completed";

  return {
    expectedGuests,
    completedGuests,
    pendingGuests,
    needsReSignature,
    stage
  };
}


export async function getCheckinUrl(reservation, guestIndex = 1, baseUrl = "", dbInstance = null) {
  if (typeof globalThis.getCheckinUrl === "function") {
    return globalThis.getCheckinUrl(reservation, guestIndex, baseUrl, dbInstance);
  }
  if (typeof getSerproCheckinUrl === "function") {
    return getSerproCheckinUrl(reservation, guestIndex, baseUrl, dbInstance);
  }
  return getCheckinUrlSync(reservation, guestIndex, baseUrl, dbInstance);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-carrega arquivo .env da raiz do projeto e do Render (/etc/secrets)
export function loadEnvFiles() {
  const potentialPaths = [
    "/etc/secrets/.env",
    "/etc/secrets/env",
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "../../.env"),
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, ".env")
  ];

  if (fs.existsSync("/etc/secrets")) {
    try {
      const files = fs.readdirSync("/etc/secrets");
      for (const file of files) {
        const full = path.join("/etc/secrets", file);
        try {
          if (fs.statSync(full).isFile() && !potentialPaths.includes(full)) {
            potentialPaths.push(full);
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  for (const p of potentialPaths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf-8");
        let count = 0;
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const idx = trimmed.indexOf("=");
          if (idx > 0) {
            const key = trimmed.slice(0, idx).trim();
            let val = trimmed.slice(idx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key] || process.env[key] === "") {
              process.env[key] = val;
              count++;
            }
          }
        }
        if (count > 0) {
          console.log(`[MailService EnvLoader] ${count} variáveis carregadas com sucesso de: ${p}`);
        }
      }
    } catch (_) {}
  }
}
loadEnvFiles();

/**
 * Obtém as configurações SMTP consolidadas (Variáveis de Ambiente > Banco de Dados > Padrões Zoho)
 */
export function getSmtpConfig(db, overrides = {}) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    loadEnvFiles();
  }
  const emailSettings = db?.settings?.emailSettings || {};
  let host = overrides.host || process.env.SMTP_HOST || emailSettings.host || "smtp.zoho.com";
  // Migra automaticamente hosts antigos que o Zoho bloqueou
  if (host === "smtppro.zoho.com") {
    host = "smtp.zoho.com";
  }

  const port = Number(overrides.port || process.env.SMTP_PORT || emailSettings.port || 465);
  const user = (overrides.user !== undefined && overrides.user !== "") 
    ? overrides.user 
    : (process.env.SMTP_USER || emailSettings.user || "");
  const pass = (overrides.pass !== undefined && overrides.pass !== "" && overrides.pass !== "••••••••") 
    ? overrides.pass 
    : (process.env.SMTP_PASS || emailSettings.pass || "");
  const fromName = overrides.fromName || process.env.SMTP_FROM_NAME || emailSettings.fromName || "CorpFlats";
  const fromEmail = overrides.fromEmail || process.env.SMTP_FROM_EMAIL || emailSettings.fromEmail || user || "reservas@corpflats.com.br";
  const secure = port === 465;

  return {
    host,
    port,
    user,
    pass,
    fromName,
    fromEmail,
    secure,
    isConfigured: Boolean(user && pass)
  };
}

/**
 * Cria ou obtém instância do transporter Nodemailer
 */
export function createTransporter(db, overrides = {}) {
  const config = getSmtpConfig(db, overrides);
  if (!config.user || !config.pass) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

/**
 * Testa a conexão com o servidor SMTP Zoho
 */
export async function verifySmtpConnection(db, overrides = {}) {
  const config = getSmtpConfig(db, overrides);
  if (!config.user || !config.pass) {
    return {
      ok: false,
      error: "Credenciais de SMTP (SMTP_USER ou SMTP_PASS) não estão configuradas."
    };
  }

  try {
    const transporter = createTransporter(db, overrides);
    if (!transporter) {
      return { ok: false, error: "Falha ao instanciar o transporte SMTP." };
    }
    await transporter.verify();
    return {
      ok: true,
      message: `Conexão SMTP estabelecida com sucesso com ${config.host}:${config.port} via conta ${config.user}!`
    };
  } catch (err) {
    let friendlyError = `Falha na verificação SMTP: ${err.message}`;
    if (err.message?.includes("554") && err.message?.includes("Access Restricted")) {
      friendlyError = `Erro 554 (Acesso Restrito do Zoho): Altere o servidor para "smtp.zoho.com" (o host antigo smtppro.zoho.com foi descontinuado pelo Zoho). Verifique também se o E-mail do Remetente é do seu domínio corporativo e se o "Acesso SMTP" está ativo na sua conta Zoho.`;
    } else if (err.message?.includes("535") || err.message?.includes("Authentication Failed")) {
      friendlyError = `Erro de Autenticação (535): Usuário ou senha incorretos. Caso utilize autenticação em 2 etapas (2FA) no Zoho, você deve gerar uma "Senha de Aplicativo" em zoho.com > Segurança > Senhas de Aplicativo.`;
    }

    return {
      ok: false,
      error: friendlyError
    };
  }
}

/**
 * Formata data no padrão brasileiro DD/MM/AAAA
 */
function formatDateBr(dateStr) {
  if (!dateStr) return "-";
  try {
    const parts = String(dateStr).split("T")[0].split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/**
 * Layout HTML Base CorpFlats (UI/UX Refatorado — Padrão Gmail / Superhuman / Linear)
 * Tabelas fluidas aninhadas + CSS Inline defensivo + Responsividade Mobile
 */
export function wrapEmailTemplate({ title, badge = "", contentHtml, footerHtml = "" }) {
  const fontStack = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${title}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      background-color: #F8FAFC;
      color: #374151;
      font-family: ${fontStack};
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      max-width: 600px;
      margin: 0 auto;
      width: 100%;
    }
    .email-card {
      background-color: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
    }
    .email-card-pad {
      padding: 36px 40px;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.4;
      letter-spacing: 0.2px;
    }
    .badge-checkin { background-color: #ECFDF5; color: #047857; border: 1px solid #A7F3D0; }
    .badge-update { background-color: #FFFBEB; color: #B45309; border: 1px solid #FDE68A; }
    .badge-cancel { background-color: #FEF2F2; color: #B91C1C; border: 1px solid #FECACA; }
    .badge-general { background-color: #F9FAFB; color: #374151; border: 1px solid #E5E7EB; }
    .section-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #6B7280;
      margin: 24px 0 8px 0;
    }
    .info-card {
      background-color: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .info-table {
      width: 100%;
      border-collapse: collapse;
    }
    .info-table td {
      padding: 6px 0;
      font-size: 14px;
      line-height: 1.5;
      vertical-align: top;
      font-family: ${fontStack};
    }
    .info-table .label {
      color: #6B7280;
      font-weight: 500;
      width: 38%;
      font-size: 13px;
    }
    .info-table .val {
      color: #111827;
      font-weight: 600;
      width: 62%;
      font-size: 14px;
    }
    .guest-box {
      background-color: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      padding: 16px;
      margin-top: 8px;
    }
    .callout-alert {
      background-color: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-left: 3px solid #D97706;
      padding: 16px;
      border-radius: 6px;
      margin-bottom: 16px;
    }
    .callout-cancel {
      background-color: #FEF2F2;
      border: 1px solid #FECACA;
      border-left: 3px solid #DC2626;
      padding: 16px;
      border-radius: 6px;
      margin-bottom: 16px;
    }
    .btn-action {
      display: inline-block;
      padding: 12px 24px;
      background-color: #111827;
      color: #FFFFFF !important;
      text-decoration: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 700;
      line-height: 1.4;
      margin-top: 8px;
    }
    @media only screen and (max-width: 600px) {
      .outer-pad {
        padding: 16px 12px !important;
      }
      .email-card-pad {
        padding: 20px !important;
      }
      .info-table .label,
      .info-table .val {
        display: block !important;
        width: 100% !important;
        padding: 2px 0 !important;
      }
      .info-table tr {
        display: block !important;
        padding: 6px 0 !important;
        border-bottom: 1px solid #F3F4F6;
      }
      .info-table tr:last-child {
        border-bottom: none !important;
      }
      .btn-action {
        display: block !important;
        text-align: center !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; width: 100%; background-color: #F8FAFC; color: #374151; font-family: ${fontStack}; -webkit-font-smoothing: antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #F8FAFC; width: 100%; margin: 0; padding: 0;">
    <tr>
      <td align="center" class="outer-pad" style="padding: 32px 16px;">
        <!--[if mso]>
        <table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="600">
        <tr>
        <td width="600">
        <![endif]-->
        <div class="wrapper" style="max-width: 600px; margin: 0 auto; width: 100%;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-card" style="background-color: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 8px; width: 100%; border-collapse: separate;">
            <tr>
              <td class="email-card-pad" style="padding: 36px 40px; font-family: ${fontStack}; color: #374151; font-size: 15px; line-height: 1.6; text-align: left;">
                <!-- Header Sutil e Discreto com Respiro Inferior de 24px -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #E5E7EB;">
                  <tr>
                    <td align="left" valign="middle" style="font-family: ${fontStack};">
                      <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: #111827; margin-right: 8px; vertical-align: middle;"></span>
                      <span style="color: #111827; font-size: 15px; font-weight: 600; letter-spacing: -0.2px; vertical-align: middle;">CorpFlats</span>
                      <span style="color: #9CA3AF; font-size: 12px; font-weight: 400; margin-left: 6px; vertical-align: middle;">• Gestão de Hospedagem</span>
                    </td>
                    <td align="right" valign="middle" style="font-family: ${fontStack};">
                      ${badge}
                    </td>
                  </tr>
                </table>

                <!-- Corpo Principal -->
                <div class="content" style="color: #374151; font-size: 15px; line-height: 1.6; font-family: ${fontStack};">
                  ${contentHtml}
                </div>

                <!-- Footer Separado por HR -->
                <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 32px 0 16px 0;" />
                <div class="footer" style="font-size: 12px; line-height: 1.5; color: #6B7280; text-align: left; font-family: ${fontStack};">
                  <div style="font-weight: 600; color: #374151; margin-bottom: 4px;">CorpFlats • Sistema Transacional de Hotelaria</div>
                  <div>
                    ${footerHtml || `Este é um e-mail transacional automatizado gerado pelo sistema CorpFlats.<br/>Para suporte ou dúvidas operacionais, consulte a administração do hotel.`}
                  </div>
                </div>
              </td>
            </tr>
          </table>
        </div>
        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildPortariaAdaptiveButtonsHtml({ reservation, hostBase = "", stageInfo }) {
  const portariaBase = String(hostBase || "https://corpflats.com.br")
    .replace(/\/+$/, "")
    .replace(/https?:\/\/corpflats\.onrender\.com/gi, "https://corpflats.com.br") || "https://corpflats.com.br";
  const resCode = String(reservation?.code || reservation?.reservationCode || reservation?.id || "").trim();
  const resParam = resCode ? `res=${encodeURIComponent(resCode)}` : "";

  const sendCheckinLinkUrl = `${portariaBase}/portaria?${resParam ? `${resParam}&` : ""}action=send-checkin-link`;
  const verifyEarlyCheckinUrl = `${portariaBase}/portaria?${resParam ? `${resParam}&` : ""}action=verify-early-checkin`;
  const openPortariaUrl = `${portariaBase}/portaria${resParam ? `?${resParam}` : ""}`;

  const isAllCompleted = stageInfo?.stage === "completed";

  const buttonsHtml = isAllCompleted
    ? `
      <a href="${verifyEarlyCheckinUrl}" class="btn-action" style="display: inline-block; background-color: #0F766E; color: #FFFFFF !important; font-weight: 700; font-size: 13px; padding: 11px 18px; border-radius: 6px; text-decoration: none; margin: 4px 8px 4px 0;">
        ⏰ Verificar permissão para Early Check-in
      </a>
      <a href="${openPortariaUrl}" class="btn-action" style="display: inline-block; background-color: #111827; color: #FFFFFF !important; font-weight: 700; font-size: 13px; padding: 11px 18px; border-radius: 6px; text-decoration: none; margin: 4px 0;">
        🏢 Abrir Terminal da Portaria
      </a>
    `
    : `
      <a href="${sendCheckinLinkUrl}" class="btn-action" style="display: inline-block; background-color: #059669; color: #FFFFFF !important; font-weight: 700; font-size: 13px; padding: 11px 18px; border-radius: 6px; text-decoration: none; margin: 4px 8px 4px 0;">
        📲 Enviar link para check-in digital
      </a>
      <a href="${verifyEarlyCheckinUrl}" class="btn-action" style="display: inline-block; background-color: #111827; color: #FFFFFF !important; font-weight: 700; font-size: 13px; padding: 11px 18px; border-radius: 6px; text-decoration: none; margin: 4px 0;">
        ⏰ Verificar permissão para Early Check-in
      </a>
    `;

  const descriptionText = isAllCompleted
    ? "Acesse direto sem login pelo tablet ou computador da portaria para verificar permissão de Early Check-in, conferir selfie/documento/FNRH e liberar a entrada."
    : "Acesse direto sem login pelo tablet ou computador da portaria para disparar o link no WhatsApp (ou exibir o QR Code no balcão) e verificar a permissão de Early Check-in.";

  return `
    <!-- Bloco de Ação Adaptativo: Terminal da Portaria (Acesso Direto Sem Senha) -->
    <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-top: 24px;">
      <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; margin-bottom: 4px;">Painel da Recepção & Portaria 24h • Acesso Livre</div>
      <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 6px;">Ações Rápidas no Terminal da Portaria</div>
      <p style="font-size: 13px; color: #6B7280; margin: 0 0 14px 0; line-height: 1.5;">
        ${descriptionText}
      </p>
      <div>
        ${buttonsHtml}
      </div>
    </div>
  `;
}

/**
 * Gatilho A: Template Informativo de Reserva / Check-in à Recepção e Portaria
 */
export function renderCheckinConfirmedEmail({ reservation, flat, settings, baseUrl = "", db = null }) {
  const rawFlat = flat?.number || reservation?.flatNumber || "Não informado";
  const cleanFlat = String(rawFlat).replace(/^flat\s*/i, "").trim();
  const flatDisplay = cleanFlat ? `Flat ${cleanFlat}` : "Flat Não informado";
  const flatNumber = cleanFlat || "Não informado";
  const buildingName = flat?.buildingName || flat?.building || settings?.buildingName || "Edifício Soho Residence Service";
  const guestName = reservation?.guestName || "Hóspede Titular";
  const checkinDateBr = formatDateBr(reservation?.checkinDate);
  const checkoutDateBr = formatDateBr(reservation?.checkoutDate);

  const hostBase = baseUrl || settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.com.br";
  const checkinUrl = getCheckinUrlSync(reservation, 1, hostBase, db || settings);
  const checkinUrlGuest2 = getCheckinUrlSync(reservation, 2, hostBase, db || settings);

  const subject = `${flatDisplay} - ${guestName} (${checkinDateBr} a ${checkoutDateBr})`;

  const checkinTime = settings?.checkinTime || "14:00";
  const checkoutTime = settings?.checkoutTime || "12:00";
  const isOtaOrB2b = isOtaOrB2bReservation(reservation);
  const freeEarlyHour = isOtaOrB2b ? "12:00" : "10:00";
  const earlyCheckin = reservation?.earlyCheckinAuthorized
    ? (reservation?.earlyCheckinTime
        ? `Autorizado pela Administração (a partir das ${reservation.earlyCheckinTime}, mediante flat limpo)`
        : "Autorizado pela Administração (liberação antecipada mediante flat limpo)")
    : `Cortesia a partir das ${freeEarlyHour} (${isOtaOrB2b ? "regra OTA/Agência" : "regra Site/Direto/WhatsApp"}, mediante flat limpo; antes disso somente com autorização da Administração)`;

  const stageInfo = evaluateReceptionCheckinStage(reservation);
  const { expectedGuests, completedGuests, stage, needsReSignature } = stageInfo;

  // Monta lista de hóspedes ordenada por slot (1..expectedGuests), preservando titular no slot 1 mesmo se hóspede 2 assinar primeiro
  const rawGuestsArr = Array.isArray(reservation?.guests) ? reservation.guests : [];
  let guests = [];
  if (rawGuestsArr.length > 0) {
    for (let slot = 1; slot <= expectedGuests; slot++) {
      const posFallback = rawGuestsArr[slot - 1] && (!rawGuestsArr[slot - 1].index || Number(rawGuestsArr[slot - 1].index) === slot)
        ? rawGuestsArr[slot - 1]
        : null;
      const existing = rawGuestsArr.find(g => Number(g?.index || 0) === slot) || posFallback;
      if (existing) {
        guests.push(existing);
      } else if (slot === 1) {
        guests.push({
          index: 1,
          name: guestName,
          cpf: reservation?.guestDocument || "",
          phone: reservation?.guestPhone || "",
          email: reservation?.guestEmail || "",
          hasCompletedCheckin: false
        });
      } else {
        guests.push({
          index: slot,
          name: `Hóspede ${slot} (Acompanhante)`,
          cpf: "",
          phone: "",
          email: "",
          hasCompletedCheckin: false
        });
      }
    }
  } else {
    guests = [{
      index: 1,
      name: guestName,
      cpf: reservation?.guestDocument || "",
      phone: reservation?.guestPhone || "",
      email: reservation?.guestEmail || "",
      hasCompletedCheckin: completedGuests >= 1
    }];
    if (Array.isArray(reservation?.additionalGuests) && reservation.additionalGuests.length > 0) {
      guests.push(...reservation.additionalGuests);
    }
    while (guests.length < expectedGuests) {
      guests.push({
        index: guests.length + 1,
        name: `Hóspede ${guests.length + 1} (Acompanhante)`,
        cpf: "",
        phone: "",
        email: "",
        hasCompletedCheckin: false
      });
    }
  }

  const isGuestCheckinCompleted = (g, idx) => {
    if (needsReSignature || g?.needsReSignature) return false;
    if (Boolean(g?.hasCompletedCheckin || g?.status === "CHECKED_IN" || g?.fnrhDocumentUuid || g?.fnrhSignedAt)) return true;
    if (!Array.isArray(reservation?.guests) || reservation.guests.length === 0) {
      return idx === 0 && completedGuests >= 1;
    }
    return false;
  };

  const guestsHtml = guests.map((g, idx) => {
    const guestDone = isGuestCheckinCompleted(g, idx);
    const guestBadgeHtml = guestDone
      ? `<span style="display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background-color: #ECFDF5; color: #047857; border: 1px solid #A7F3D0; margin-left: 6px;">Check-in Digital OK</span>`
      : `<span style="display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background-color: #FEF2F2; color: #B91C1C; border: 1px solid #FECACA; margin-left: 6px;">Aguardando Check-in Digital</span>`;
    return `
    <div class="guest-box" style="background-color: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 6px; padding: 14px 16px; margin-top: ${idx === 0 ? '0' : '8px'};">
      <div style="font-weight: 600; color: #111827; font-size: 14px; margin-bottom: 6px;">
        👤 Hóspede ${idx + 1}: ${g.name || (idx === 0 ? guestName : `Hóspede ${idx + 1}`)} ${guestBadgeHtml}
      </div>
      <table class="info-table" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
        <tr><td class="label" style="padding: 4px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Documento:</td><td class="val" style="padding: 4px 0; font-size: 13px; color: #111827; font-weight: 600; width: 62%;">${g.cpf || g.document || g.doc || "Não informado"}</td></tr>
        <tr><td class="label" style="padding: 4px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Telefone / WhatsApp:</td><td class="val" style="padding: 4px 0; font-size: 13px; color: #111827; font-weight: 600; width: 62%;">${g.phone || (idx === 0 ? reservation?.guestPhone : "") || "Não informado"}</td></tr>
        <tr><td class="label" style="padding: 4px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">E-mail:</td><td class="val" style="padding: 4px 0; font-size: 13px; color: #111827; font-weight: 600; width: 62%;">${g.email || (idx === 0 ? reservation?.guestEmail : "") || "Não informado"}</td></tr>
      </table>
    </div>
  `;
  }).join("");

  // Veículo
  const vehicle = reservation?.vehicle;
  const vehicleHtml = (vehicle && vehicle.plate) ? `
    <table class="info-table" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
      <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Placa:</td><td class="val" style="padding: 5px 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${vehicle.plate.toUpperCase()}</td></tr>
      <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Modelo / Marca:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${[vehicle.brand, vehicle.model].filter(Boolean).join(" - ") || "Não informado"}</td></tr>
      <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Cor:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${vehicle.color || "Não informado"}</td></tr>
    </table>
  ` : `<div style="font-size: 13px; color: #6B7280;">Nenhum veículo cadastrado para esta estadia.</div>`;

  // Observações e Notas de Recepção (apenas nota destinada à portaria/recepção)
  const rawReceptionNotes = (reservation?.receptionNotes || "").trim();
  const cleanReceptionNotes = rawReceptionNotes.replace(/^nota\s+(de\s+)?recep[cç][aã]o:\s*/i, "").trim();
  const receptionNotes = cleanReceptionNotes ? `Nota de Recepção: ${cleanReceptionNotes}` : "";

  const clearedGuestNames = guests
    .map((g, idx) => (isGuestCheckinCompleted(g, idx) ? (g.name || (idx === 0 ? guestName : `Hóspede ${idx + 1}`)) : null))
    .filter(Boolean)
    .join(", ") || guestName;

  const firstPendingIdxZero = guests.findIndex((g, idx) => !isGuestCheckinCompleted(g, idx));
  const firstPendingGuestSlot = firstPendingIdxZero >= 0 ? firstPendingIdxZero + 1 : 2;
  const checkinUrlPendingGuest = firstPendingGuestSlot === 2
    ? checkinUrlGuest2
    : getCheckinUrlSync(reservation, firstPendingGuestSlot, hostBase, db || settings);

  const guestsSectionTitle = stage === "completed"
    ? `Hóspedes com Check-in Digital Concluído (${guests.length})`
    : stage === "partial"
      ? `Hóspedes na Reserva — Check-in Parcial (${completedGuests}/${expectedGuests})`
      : `Hóspedes na Reserva — Aguardando Check-in Digital (${guests.length})`;

  const statusCalloutHtml = stage === "awaiting"
    ? `
      <!-- Alerta Vermelho: Check-in Digital Ainda Não Realizado -->
      <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-left: 4px solid #DC2626; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
        <div style="color: #B91C1C; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;">🚫 ATENÇÃO PORTARIA: CHECK-IN AINDA NÃO LIBERADO (AGUARDANDO CHECK-IN DIGITAL)</div>
        <p style="color: #7F1D1D; font-size: 13px; margin: 6px 0 0 0; line-height: 1.55;">
          <strong>O check-in presencial desta reserva ainda NÃO está liberado na portaria</strong>, pois estamos aguardando o preenchimento obrigatório do <strong>Check-in Digital${needsReSignature ? " (re-assinatura de termo pendente)" : ""}</strong> pelo(s) hóspede(s). Caso o hóspede chegue ao balcão, utilize o botão abaixo para enviar o link no WhatsApp ou exibir o QR Code na tela.
        </p>
      </div>
    `
    : stage === "partial"
      ? `
      <!-- Alerta Amarelo: Check-in Parcial (ex: 1/2 preenchido) -->
      <div style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-left: 4px solid #D97706; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
        <div style="color: #92400E; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;">⚠️ ATENÇÃO PORTARIA: CHECK-IN PARCIAL (${completedGuests}/${expectedGuests})</div>
        <p style="color: #78350F; font-size: 13px; margin: 6px 0 0 0; line-height: 1.55;">
          <strong>Apenas ${clearedGuestNames} preencheu a ficha digital e está com cadastro liberado</strong> (entrada sujeita ao horário permitido e limpeza do flat). <strong>O(s) demais hóspede(s) permanece(m) BLOQUEADO(S)</strong> na portaria até concluírem o Check-in Digital individual.
        </p>
        <div style="margin-top: 10px;">
          <a href="${checkinUrlPendingGuest}" style="color: #B45309; font-weight: 700; font-size: 13px; text-decoration: underline;">
            🔗 Link direto de Check-in para o ${firstPendingGuestSlot}º Hóspede
          </a>
        </div>
      </div>
    `
      : `
      <!-- Aviso Verde: Check-in Digital Concluído por Todos -->
      <div style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-left: 4px solid #059669; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
        <div style="color: #065F46; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;">✅ CHECK-IN DIGITAL CONCLUÍDO (${completedGuests}/${expectedGuests}) — CADASTRO PRONTO</div>
        <p style="color: #064E3B; font-size: 13px; margin: 6px 0 0 0; line-height: 1.55;">
          <strong>Todos os hóspedes concluíram o Check-in Digital e assinaram a FNRH.</strong> O cadastro está pronto; a liberação da entrada física está sujeita ao cumprimento do horário permitido (ou permissão de Early Check-in) e à conclusão da limpeza do apartamento no Terminal da Portaria.
        </p>
      </div>
    `;

  const contentHtml = `
    <div style="margin-bottom: 18px;">
      <h1 style="font-size: 20px; font-weight: 600; line-height: 1.3; color: #111827; margin: 0 0 8px 0;">Olá, Equipe de Recepção & Portaria</h1>
      <p style="font-size: 15px; color: #374151; margin: 0; line-height: 1.6;">
        Segue o informativo cadastral da reserva referente ao <strong>Flat ${flatNumber}</strong> no condomínio <strong>${buildingName}</strong>.
      </p>
    </div>

    ${statusCalloutHtml}

    ${Boolean(reservation?.hasMinor || guests.some(g => g.isMinor)) ? `
      <!-- Alerta de Menor de Idade (ECA Art. 82) -->
      <div style="background-color: #FFF1F2; border: 1px solid #FECDD3; border-left: 3px solid #E11D48; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
        <div style="color: #9F1239; font-size: 13px; font-weight: 600;">👶 ATENÇÃO RECEPÇÃO: HÓSPEDE MENOR DE IDADE REGISTRADO (ECA Art. 82)</div>
        <p style="color: #881337; font-size: 13px; margin: 6px 0 0 0; line-height: 1.5;">
          Identificado hóspede menor de 18 anos nesta estadia. <strong>Conforme a Lei nº 8.069/1990 (ECA), é obrigatória a presença dos pais ou responsável maior portando autorização formal por escrito com firma reconhecida em cartório para liberação de chaves.</strong>
        </p>
      </div>
    ` : ""}

    ${Boolean(reservation?.isCamposResident || reservation?.riskAttentionReason?.toLowerCase()?.includes("campos")) ? `
      <!-- Alerta de Radar Local (Campos dos Goytacazes/RJ) -->
      <div style="background-color: #F5F3FF; border: 1px solid #DDD6FE; border-left: 3px solid #7C3AED; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
        <div style="color: #5B21B6; font-size: 13px; font-weight: 600;">📍 RADAR OPERACIONAL: HÓSPEDE DE CAMPOS DOS GOYTACAZES/RJ</div>
        <p style="color: #4C1D95; font-size: 13px; margin: 6px 0 0 0; line-height: 1.5;">
          Hóspede residente ou com documento emitido em Campos dos Goytacazes/RJ. Reserva incluída no radar de atenção operacional da equipe.
        </p>
      </div>
    ` : ""}

    ${Boolean(!needsReSignature && (reservation?.fnrhDocumentUuid || reservation?.fnrhFilePath || guests.some(g => g.fnrhDocumentUuid || g.fnrhFilePath))) ? `
      <!-- Aviso de FNRH PDF Anexada -->
      <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-left: 3px solid #059669; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; font-size: 13px; color: #374151; line-height: 1.5;">
        <strong style="color: #111827;">📄 Ficha Digital FNRH Anexada em PDF:</strong> A Ficha Nacional de Registro de Hóspedes (FNRH) assinada digitalmente com trilha forense e QR Code foi anexada a este e-mail em formato PDF.
      </div>
    ` : ""}

    ${Boolean(reservation?.docPhotoUrl || reservation?.docPhotoPath || reservation?.documentPhotoUrl || guests.some(g => g.docPhotoUrl || g.docPhotoPath)) ? `
      <!-- Aviso de Documento Oficial Anexado -->
      <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-left: 3px solid #16A34A; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; font-size: 13px; color: #374151; line-height: 1.5;">
        <strong style="color: #111827;">📎 Documento Oficial do Hóspede Anexado:</strong> O documento com foto (PDF ou imagem) anexado à reserva foi incluído como anexo a este e-mail para conferência na recepção.
      </div>
    ` : ""}

    <div class="section-title" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin: 24px 0 8px 0;">Identificação da Unidade</div>
    <div class="info-card" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <table class="info-table" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Edifício:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${buildingName}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Apartamento:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">Flat ${flatNumber}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Código da Reserva:</td><td class="val" style="padding: 5px 0; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #111827; font-weight: 600; width: 62%;">#${reservation?.code || reservation?.id}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Total de Hóspedes:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${expectedGuests}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Canal da Reserva:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${formatEmailChannelLabel(reservation)}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Status Check-in Digital:</td><td class="val" style="padding: 5px 0; font-size: 14px; font-weight: 700; color: ${stage === "completed" ? "#047857" : stage === "partial" ? "#B45309" : "#B91C1C"}; width: 62%;">${stage === "completed" ? `Concluído (${completedGuests}/${expectedGuests})` : stage === "partial" ? `Parcial (${completedGuests}/${expectedGuests})` : `Aguardando check-in (0/${expectedGuests})`}</td></tr>
      </table>
    </div>

    <div class="section-title" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin: 24px 0 8px 0;">Período da Hospedagem</div>
    <div class="info-card" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <table class="info-table" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Entrada (Check-in):</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${checkinDateBr} (Horário padrão: ${checkinTime})</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Early Check-in:</td><td class="val" style="padding: 5px 0; font-size: 13px; color: #111827; font-weight: 600; width: 62%; line-height: 1.45;">${earlyCheckin}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Saída (Check-out):</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${checkoutDateBr} (até as ${checkoutTime})</td></tr>
      </table>
    </div>

    <div class="section-title" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin: 24px 0 8px 0;">${guestsSectionTitle}</div>
    <div class="info-card" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      ${guestsHtml}
    </div>

    <div class="section-title" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin: 24px 0 8px 0;">Veículo / Vaga de Garagem</div>
    <div class="info-card" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      ${vehicleHtml}
    </div>

    ${receptionNotes ? `
      <div class="section-title" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin: 24px 0 8px 0;">Observações de Acesso</div>
      <div class="info-card" style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
        <div style="font-size: 14px; color: #92400E; font-weight: 600;">${receptionNotes}</div>
      </div>
    ` : ""}

    ${buildPortariaAdaptiveButtonsHtml({ reservation, hostBase, stageInfo })}
  `;

  const badge = stage === "awaiting"
    ? `<span class="badge badge-awaiting" style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; background-color: #FEF2F2; color: #B91C1C; border: 1px solid #FECACA;">Aguardando check-in</span>`
    : stage === "partial"
      ? `<span class="badge badge-partial" style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; background-color: #FFFBEB; color: #B45309; border: 1px solid #FDE68A;">Check-in Parcial (${completedGuests}/${expectedGuests})</span>`
      : `<span class="badge badge-checkin" style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; background-color: #ECFDF5; color: #047857; border: 1px solid #A7F3D0;">Check-in Digital Concluído</span>`;

  const bodyHtml = wrapEmailTemplate({ title: subject, badge, contentHtml });

  return {
    subject,
    bodyHtml,
    html: bodyHtml,
    checkinUrl,
    checkinStage: stage,
    completedGuests,
    expectedGuests
  };
}

/**
 * Gatilho B: Template de Alteração de Reserva à Recepção/Portaria
 */
export function renderReservationUpdateEmail({ reservation, flat, changes = [], changesSummary = [], actionType, updateType, settings, baseUrl = "", db = null }) {
  const rawFlat = flat?.number || reservation?.flatNumber || "Não informado";
  const cleanFlat = String(rawFlat).replace(/^flat\s*/i, "").trim();
  const flatNumber = cleanFlat || "Não informado";
  const buildingName = flat?.buildingName || flat?.building || settings?.buildingName || "Edifício Soho Residence Service";
  const guestName = reservation?.guestName || "Hóspede Titular";
  const checkinDateBr = formatDateBr(reservation?.checkinDate);
  const checkoutDateBr = formatDateBr(reservation?.checkoutDate);
  const periodStr = (checkinDateBr && checkoutDateBr && checkinDateBr !== "Não informada")
    ? ` (${checkinDateBr} a ${checkoutDateBr})`
    : "";

  const hostBase = baseUrl || settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.com.br";
  const checkinUrl = getCheckinUrlSync(reservation, 1, hostBase, db || settings);
  
  const allChanges = [...changes, ...changesSummary];
  const isCancelled = actionType === "cancelled" ||
    updateType === "cancelled" ||
    reservation?.status === "cancelada" ||
    reservation?.status === "cancelado" ||
    allChanges.some(c => (typeof c === "string" ? c.toLowerCase().includes("cancelad") : (c.field === "status" && String(c.newValue || "").toLowerCase().includes("cancelad"))));

  // Detecta se houve troca de Flat / Apartamento
  const flatChangeObj = allChanges.find(c =>
    c && typeof c === "object" && (
      c.field === "flatNumber" ||
      c.field === "flatId" ||
      /apartamento|acomoda[cç][aã]o|quarto|flat/i.test(`${c.label || ""} ${c.field || ""}`)
    )
  );

  const normalizeFlatNum = (val) => {
    const s = String(val ?? "").replace(/^flat\s*/i, "").trim();
    return s;
  };

  const oldFlatNumClean = flatChangeObj ? normalizeFlatNum(flatChangeObj.oldValue) : "";
  const newFlatNumClean = flatChangeObj ? (normalizeFlatNum(flatChangeObj.newValue) || flatNumber) : flatNumber;
  const hasFlatChange = Boolean(!isCancelled && flatChangeObj && oldFlatNumClean && newFlatNumClean && oldFlatNumClean !== newFlatNumClean);

  const oldFlatDisplay = oldFlatNumClean ? `Flat ${oldFlatNumClean}` : "Anterior";
  const newFlatDisplay = newFlatNumClean ? `Flat ${newFlatNumClean}` : `Flat ${flatNumber}`;

  let subject;
  if (isCancelled) {
    subject = `[CANCELAMENTO DE RESERVA] Flat ${flatNumber} - ${guestName}${periodStr}`;
  } else if (hasFlatChange) {
    subject = `⚠️ ATENÇÃO: ${oldFlatDisplay} alterado para ${newFlatDisplay} - ${guestName}${periodStr}`;
  } else {
    subject = `[ATUALIZAÇÃO DE RESERVA] Flat ${flatNumber} - ${guestName}${periodStr}`;
  }

  const formatChangeValue = (val) => {
    const s = String(val ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return formatDateBr(s);
    return s;
  };

  const changesHtml = allChanges.map(c => {
    if (typeof c === "string") {
      return `<li style="margin-bottom: 10px;">${c}</li>`;
    }
    const isFlatItem = c.field === "flatNumber" || c.field === "flatId" || /apartamento|acomoda[cç][aã]o|quarto|flat/i.test(`${c.label || ""} ${c.field || ""}`);
    const oldValFormatted = formatChangeValue(c.oldValue) || "Anterior";
    const newValFormatted = formatChangeValue(c.newValue) || "Novo";
    const itemLabel = isFlatItem ? "Acomodação / Quarto" : (c.label || c.field);

    return `
      <li style="margin-bottom: 12px; list-style: none; padding: 10px 12px; background-color: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 6px;">
        <div style="font-weight: 700; color: #111827; font-size: 14px; margin-bottom: 6px;">• ${itemLabel}:</div>
        <div style="font-size: 14px; color: #B91C1C; margin-bottom: 4px; padding-left: 8px;">
          ❌ <strong>${isFlatItem ? "Flat anterior" : "Anterior"}:</strong> <span style="text-decoration: line-through; color: #DC2626; font-weight: 600;">${oldValFormatted}</span>
        </div>
        <div style="font-size: 15px; color: #047857; font-weight: 800; padding-left: 8px;">
          ✅ <strong>${isFlatItem ? "SEU NOVO FLAT" : "Atualizado"}:</strong> <span style="background-color: #ECFDF5; color: #065F46; padding: 2px 6px; border-radius: 4px; border: 1px solid #A7F3D0;">${newValFormatted}</span> ${isFlatItem ? "🔑" : ""}
        </div>
      </li>
    `;
  }).join("");

  const updateStageInfo = evaluateReceptionCheckinStage(reservation);
  const newFlatBoxHeader = updateStageInfo.stage === "completed"
    ? "✅ NOVO APARTAMENTO DA RESERVA (CADASTRO DIGITAL CONCLUÍDO):"
    : updateStageInfo.stage === "partial"
      ? `⚠️ NOVO APARTAMENTO DA RESERVA (CHECK-IN PARCIAL ${updateStageInfo.completedGuests}/${updateStageInfo.expectedGuests}):`
      : "🏠 NOVO APARTAMENTO DA RESERVA (AGUARDANDO CHECK-IN DIGITAL):";

  const flatChangeBannerHtml = hasFlatChange ? `
    <!-- Banner de Alerta Máximo de Troca de Apartamento -->
    <div style="background-color: #FEF2F2; border: 2px solid #DC2626; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
      <div style="background-color: #DC2626; color: #FFFFFF; font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; text-align: center;">
        🚨 ATENÇÃO PORTARIA: TROCA DE APARTAMENTO
      </div>

      <!-- Caixa 1: Flat Antigo Riscado (Vermelho) -->
      <div style="background-color: #FFFFFF; border: 2px dashed #EF4444; border-radius: 8px; padding: 14px 16px; margin-bottom: 12px;">
        <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; color: #B91C1C; margin-bottom: 4px;">
          ❌ NÃO LIBERAR / APARTAMENTO ANTIGO (DESATIVADO NESTA RESERVA):
        </div>
        <div style="font-size: 22px; font-weight: 800; color: #DC2626; text-decoration: line-through;">
          ${oldFlatDisplay}
        </div>
      </div>

      <!-- Caixa 2: Novo Flat Designado -->
      <div style="background-color: #ECFDF5; border: 2px solid #059669; border-radius: 8px; padding: 16px; margin-bottom: 14px;">
        <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; color: #047857; margin-bottom: 4px;">
          ${newFlatBoxHeader}
        </div>
        <div style="font-size: 26px; font-weight: 900; color: #065F46; letter-spacing: -0.3px;">
          ${newFlatDisplay.toUpperCase()} 🔑
        </div>
      </div>

      <!-- Aviso Operacional Expresso -->
      <div style="background-color: #FEE2E2; border-left: 4px solid #B91C1C; padding: 12px 14px; border-radius: 4px; color: #7F1D1D; font-size: 14px; line-height: 1.5; font-weight: 600;">
        ⚠️ <strong>IMPORTANTE:</strong> NÃO entregue a chave nem libere o acesso ao <strong><span style="text-decoration: line-through;">${oldFlatDisplay}</span></strong> (pode estar ocupado por outro hóspede). A acomodação correta de <strong>${guestName}</strong> passa a ser o <strong>${newFlatDisplay}</strong>${updateStageInfo.stage !== "completed" ? ` — <strong>atenção: a entrada presencial ainda aguarda conclusão do Check-in Digital${updateStageInfo.needsReSignature ? " (re-assinatura de termo obrigatória)" : ""}</strong>` : " (sujeito ao horário permitido e limpeza no Terminal da Portaria)"}.
      </div>
    </div>
  ` : "";

  const updateCheckinCalloutHtml = isCancelled
    ? ""
    : updateStageInfo.stage === "awaiting"
      ? `
      <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-left: 4px solid #DC2626; border-radius: 6px; padding: 14px 16px; margin-bottom: 16px;">
        <strong style="color: #B91C1C; font-size: 13px;">🚫 ATENÇÃO PORTARIA: CHECK-IN AINDA NÃO LIBERADO (AGUARDANDO CHECK-IN DIGITAL)</strong>
        <p style="color: #7F1D1D; font-size: 13px; margin: 5px 0 0 0; line-height: 1.5;">
          O check-in presencial desta reserva <strong>ainda NÃO está liberado</strong>, pois aguarda o preenchimento do Check-in Digital${updateStageInfo.needsReSignature ? " (re-assinatura de termo pendente após alteração da reserva)" : ""}.
        </p>
      </div>
      `
      : updateStageInfo.stage === "partial"
        ? `
      <div style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-left: 4px solid #D97706; border-radius: 6px; padding: 14px 16px; margin-bottom: 16px;">
        <strong style="color: #92400E; font-size: 13px;">⚠️ ATENÇÃO PORTARIA: CHECK-IN PARCIAL (${updateStageInfo.completedGuests}/${updateStageInfo.expectedGuests})</strong>
        <p style="color: #78350F; font-size: 13px; margin: 5px 0 0 0; line-height: 1.5;">
          Apenas ${updateStageInfo.completedGuests} de ${updateStageInfo.expectedGuests} hóspede(s) concluiu o Check-in Digital. O(s) demais hóspede(s) permanece(m) bloqueado(s) até preencherem a ficha individual.
        </p>
      </div>
      `
        : "";

  const contentHtml = `
    <div style="margin-bottom: 20px;">
      <h1 style="font-size: 20px; font-weight: 700; line-height: 1.3; color: ${hasFlatChange ? '#B91C1C' : '#111827'}; margin: 0 0 8px 0;">
        ${hasFlatChange ? `⚠️ Alteração de Apartamento: ${oldFlatDisplay} ➔ ${newFlatDisplay}` : "Aviso de Modificação de Reserva"}
      </h1>
      <p style="font-size: 15px; color: #374151; margin: 0; line-height: 1.6;">
        ${hasFlatChange
          ? `A reserva de <strong>${guestName}</strong> no condomínio <strong>${buildingName}</strong> foi transferida do <strong><span style="text-decoration: line-through; color: #DC2626;">${oldFlatDisplay}</span></strong> para o <strong><span style="color: #047857;">${newFlatDisplay}</span></strong>.`
          : `A reserva referente ao <strong>Flat ${flatNumber}</strong> no condomínio <strong>${buildingName}</strong> sofreu alterações no sistema.`}
      </p>
    </div>

    ${flatChangeBannerHtml}
    ${updateCheckinCalloutHtml}

    ${isCancelled ? `
      <div class="callout-cancel" style="background-color: #FEF2F2; border: 1px solid #FECACA; border-left: 3px solid #DC2626; padding: 16px; border-radius: 6px; margin-bottom: 16px;">
        <strong style="color: #B91C1C; font-size: 14px;">ATENÇÃO: RESERVA CANCELADA</strong>
        <p style="color: #7F1D1D; font-size: 13px; margin: 6px 0 0 0; line-height: 1.5;">
          A entrada para esta reserva não deve ser liberada. O quarto retornou ao status vago.
        </p>
      </div>
    ` : `
      <div class="callout-alert" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-left: 4px solid ${hasFlatChange ? '#DC2626' : '#D97706'}; padding: 16px; border-radius: 6px; margin-bottom: 16px;">
        <strong style="color: #111827; font-size: 14px; display: block; margin-bottom: 10px;">Modificações Realizadas:</strong>
        <ul style="margin: 0; padding: 0; font-size: 14px; color: #374151; line-height: 1.6;">
          ${changesHtml || "<li style='list-style: none;'>As datas ou detalhes cadastrais da reserva foram atualizados.</li>"}
        </ul>
      </div>
    `}

    <div class="section-title" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin: 24px 0 8px 0;">Resumo Atualizado da Reserva</div>
    <div class="info-card" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <table class="info-table" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Apartamento Atual:</td>
          <td class="val" style="padding: 5px 0; font-size: 15px; color: #047857; font-weight: 800; width: 62%;">
            Flat ${flatNumber} (${buildingName})
            ${hasFlatChange ? `<span style="display: block; font-size: 12px; color: #DC2626; font-weight: 600;">❌ Anterior: <span style="text-decoration: line-through;">${oldFlatDisplay}</span> (não liberar)</span>` : ""}
          </td>
        </tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Hóspede Titular:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${guestName}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Entrada (Check-in):</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${checkinDateBr}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Saída (Check-out):</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${checkoutDateBr}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Total de Hóspedes:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${updateStageInfo.expectedGuests}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Canal da Reserva:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${formatEmailChannelLabel(reservation)}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Status da Reserva:</td><td class="val" style="padding: 5px 0; font-size: 14px; text-transform: uppercase; color: ${isCancelled ? '#DC2626' : '#059669'}; font-weight: 600; width: 62%;">${reservation?.status || "Confirmada"}</td></tr>
        ${!isCancelled ? `<tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Status Check-in Digital:</td><td class="val" style="padding: 5px 0; font-size: 14px; font-weight: 700; color: ${updateStageInfo.stage === "completed" ? "#047857" : updateStageInfo.stage === "partial" ? "#B45309" : "#B91C1C"}; width: 62%;">${updateStageInfo.stage === "completed" ? `Concluído (${updateStageInfo.completedGuests}/${updateStageInfo.expectedGuests})` : updateStageInfo.stage === "partial" ? `Parcial (${updateStageInfo.completedGuests}/${updateStageInfo.expectedGuests})` : `Aguardando check-in (0/${updateStageInfo.expectedGuests})`}</td></tr>` : ""}
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Check-in Digital:</td><td class="val" style="padding: 5px 0; font-size: 14px; width: 62%;"><a href="${checkinUrl}" style="color: #111827; font-weight: 600; text-decoration: underline;">Acessar Ficha de Check-in</a></td></tr>
      </table>
    </div>
    ${!isCancelled ? buildPortariaAdaptiveButtonsHtml({ reservation, hostBase, stageInfo: updateStageInfo }) : ""}
  `;

  const badge = isCancelled 
    ? `<span class="badge badge-cancel" style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; background-color: #FEF2F2; color: #B91C1C; border: 1px solid #FECACA;">Reserva Cancelada</span>` 
    : hasFlatChange
      ? `<span class="badge badge-flat-change" style="display: inline-block; padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 800; background-color: #DC2626; color: #FFFFFF; border: 1px solid #B91C1C;">TROCA DE FLAT: ${oldFlatNumClean} ➔ ${newFlatNumClean}</span>`
      : updateStageInfo.stage === "awaiting"
        ? `<span class="badge badge-awaiting" style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; background-color: #FEF2F2; color: #B91C1C; border: 1px solid #FECACA;">Aguardando check-in</span>`
        : updateStageInfo.stage === "partial"
          ? `<span class="badge badge-partial" style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; background-color: #FFFBEB; color: #B45309; border: 1px solid #FDE68A;">Check-in Parcial (${updateStageInfo.completedGuests}/${updateStageInfo.expectedGuests})</span>`
          : `<span class="badge badge-update" style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background-color: #ECFDF5; color: #047857; border: 1px solid #A7F3D0;">Check-in Digital Concluído</span>`;

  const bodyHtml = wrapEmailTemplate({ title: subject, badge, contentHtml });
  return {
    subject,
    bodyHtml,
    html: bodyHtml,
    checkinUrl,
    checkinStage: isCancelled ? "cancelled" : updateStageInfo.stage
  };
}

/**
 * Template para E-mail Manual / Personalizado
 */
export function renderManualEmail({ subject, message, bodyText, reservation, flat, settings }) {
  const flatNumber = flat?.number || reservation?.flatNumber || "Geral";
  const guestName = reservation?.guestName || "";
  const buildingName = flat?.buildingName || flat?.building || settings?.buildingName || "CorpFlats";
  const finalMessage = message || bodyText || "";

  const contentHtml = `
    <div style="margin-bottom: 20px;">
      <h1 style="font-size: 20px; font-weight: 600; line-height: 1.3; color: #111827; margin: 0 0 8px 0;">${subject}</h1>
      ${reservation ? `
        <p style="font-size: 12px; color: #6B7280; margin: 0;">
          Ref: Flat ${flatNumber} • Hóspede: ${guestName} • Reserva #${reservation?.code || reservation?.id} • ${buildingName}
        </p>
      ` : ""}
    </div>

    <div class="info-card" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; line-height: 1.6; font-size: 15px; color: #374151; white-space: pre-wrap;">${finalMessage}</div>
  `;

  const badge = `<span class="badge badge-general" style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background-color: #F9FAFB; color: #374151; border: 1px solid #E5E7EB;">Mensagem Direta</span>`;
  const bodyHtml = wrapEmailTemplate({ title: subject, badge, contentHtml });
  return { subject, bodyHtml, html: bodyHtml };
}

/**
 * Escapa caracteres especiais de HTML (uso em textos vindos de templates/reservas).
 */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Converte a formatação do WhatsApp (*negrito*, _itálico_, ~riscado~, links e quebras de linha)
 * em HTML seguro para e-mail.
 */
export function whatsAppTextToEmailHtml(text = "") {
  let html = escapeHtml(text);
  // Links soltos → <a> (antes da formatação para não quebrar URLs com "_" ou "*")
  const urlTokens = [];
  html = html.replace(/https?:\/\/[^\s<]+/g, (url) => {
    const cleanUrl = url.replace(/[.,;:!?)]+$/, "");
    const trailing = url.slice(cleanUrl.length);
    urlTokens.push(`<a href="${cleanUrl}" style="color: #111827; font-weight: 600; text-decoration: underline; word-break: break-all;">${cleanUrl}</a>`);
    return `\u0000URL${urlTokens.length - 1}\u0000${trailing}`;
  });
  html = html
    .replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/gm, "$1<em>$2</em>")
    .replace(/~([^~\n]+)~/g, "<s>$1</s>")
    .replace(/\n/g, "<br/>");
  html = html.replace(/\u0000URL(\d+)\u0000/g, (_, idx) => urlTokens[Number(idx)] || "");
  return html;
}

/**
 * Gatilho F: Espelho por E-mail das mensagens automáticas da régua de WhatsApp
 * (enviado ao hóspede principal, acompanhantes e solicitante que possuam e-mail).
 * Botões do WhatsApp viram links clicáveis; respostas rápidas (REPLY) são omitidas.
 */
export function renderWhatsAppMirrorEmail({
  message = "",
  buttons = [],
  footer = "",
  subject = "",
  documentUrl = "",
  documentName = "",
  appOrigin = "",
  settings = null
} = {}) {
  const origin = String(appOrigin || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.com.br").replace(/\/+$/, "");
  const absolutize = (url) => {
    const raw = String(url || "").trim();
    if (!raw) return "";
    if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
    return `${origin}${raw.startsWith("/") ? "" : "/"}${raw}`;
  };

  const finalSubject = String(subject || "Informações da sua reserva").trim();
  const messageHtml = whatsAppTextToEmailHtml(message);

  const buttonsHtml = (Array.isArray(buttons) ? buttons : [])
    .filter(Boolean)
    .map(b => {
      const label = escapeHtml(b.label || b.text || "Abrir");
      const type = String(b.type || "").toUpperCase();
      if (type === "COPY" || b.copyCode) {
        const code = String(b.copyCode || "").trim();
        const link = absolutize(b.url);
        return `
          <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin: 12px 0; text-align: left;">
            <div style="font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 8px;">${label}</div>
            ${code ? `<div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; color: #111827; word-break: break-all; background-color: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 6px; padding: 10px 12px;">${escapeHtml(code)}</div>` : ""}
            ${link ? `<a href="${escapeHtml(link)}" class="btn-action" style="display: inline-block; padding: 12px 24px; background-color: #111827; color: #FFFFFF !important; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 700; margin-top: 10px;">Abrir página para copiar</a>` : ""}
          </div>`;
      }
      if (type === "CALL" || (b.phone && !b.url)) {
        const digits = String(b.phone || "").replace(/\D/g, "");
        if (!digits) return "";
        return `<a href="https://wa.me/${digits}" class="btn-action" style="display: inline-block; padding: 12px 24px; background-color: #111827; color: #FFFFFF !important; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 700; margin-right: 8px; margin-top: 8px;">${label}</a>`;
      }
      const link = absolutize(b.url);
      if (!link) return ""; // Respostas rápidas (REPLY) não funcionam por e-mail
      return `<a href="${escapeHtml(link)}" class="btn-action" style="display: inline-block; padding: 12px 24px; background-color: #111827; color: #FFFFFF !important; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 700; margin-right: 8px; margin-top: 8px;">${label}</a>`;
    })
    .filter(Boolean)
    .join("\n");

  const docLink = documentUrl ? absolutize(documentUrl) : "";
  const docHtml = docLink
    ? `<a href="${escapeHtml(docLink)}" class="btn-action" style="display: inline-block; padding: 12px 24px; background-color: #111827; color: #FFFFFF !important; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 700; margin-top: 8px;">📄 Baixar ${escapeHtml(documentName || "documento")}</a>`
    : "";

  const footerLine = footer ? `<div style="margin-top: 20px; font-size: 12px; color: #6B7280;">${escapeHtml(footer)}</div>` : "";

  const contentHtml = `
    <div style="margin-bottom: 16px;">
      <h1 style="font-size: 20px; font-weight: 600; line-height: 1.3; color: #111827; margin: 0;">${escapeHtml(finalSubject)}</h1>
    </div>
    <div style="font-size: 15px; line-height: 1.6; color: #374151;">
      ${messageHtml}
    </div>
    ${(buttonsHtml || docHtml) ? `
      <div style="margin-top: 24px;">
        ${buttonsHtml}
        ${docHtml}
      </div>
    ` : ""}
    ${footerLine}
  `;

  const hotelName = escapeHtml(settings?.hotelName || "CorpFlats");
  const footerHtml = `Você recebeu este e-mail porque está cadastrado(a) em uma reserva no ${hotelName}.<br/>
      Esta mensagem também foi enviada pelo nosso WhatsApp. Em caso de dúvidas, responda este e-mail ou fale conosco pelo WhatsApp.`;

  const badge = `<span class="badge badge-general" style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background-color: #F9FAFB; color: #374151; border: 1px solid #E5E7EB;">Sua Reserva</span>`;
  const bodyHtml = wrapEmailTemplate({ title: escapeHtml(finalSubject), badge, contentHtml, footerHtml });

  const bodyText = [
    String(message || "").replace(/[*_~]/g, ""),
    ...(Array.isArray(buttons) ? buttons : [])
      .filter(b => b && (b.url || b.copyCode))
      .map(b => `${b.label || "Link"}: ${b.copyCode || absolutize(b.url)}`),
    docLink ? `${documentName || "Documento"}: ${docLink}` : ""
  ].filter(Boolean).join("\n\n");

  return { subject: finalSubject, bodyHtml, html: bodyHtml, bodyText };
}

/**
 * Gatilho C: Template de Liberação / Autorização de Garagem
 * Destinado ao estacionamento (promenadesoho@pfbestacionamentos.com.br) e portaria
 */
export function renderGarageAuthorizationEmail({ reservation, flat, vehicle, settings }) {
  const rawFlat = flat?.number || reservation?.flatNumber || "Não informado";
  const cleanFlat = String(rawFlat).replace(/^flat\s*/i, "").trim();
  const flatDisplay = cleanFlat ? `Flat ${cleanFlat}` : "Flat Não informado";
  const buildingName = flat?.buildingName || flat?.building || settings?.buildingName || "Edifício Soho Residence Service";
  const guestName = reservation?.guestName || "Hóspede CorpFlats";
  const checkinDateBr = formatDateBr(reservation?.checkinDate);
  const checkoutDateBr = formatDateBr(reservation?.checkoutDate);
  const checkinTime = settings?.checkinTime || reservation?.checkinTime || "14:00";
  const checkoutTime = settings?.checkoutTime || reservation?.checkoutTime || "12:00";

  const v = vehicle || reservation?.vehicle || {};
  const vPlate = String(v.plate || "NÃO INFORMADA").toUpperCase().trim();
  const vBrand = (v.brand || "").trim();
  const vModel = (v.model || "").trim();
  const vColor = (v.color || "").trim();
  const vehicleDesc = [vBrand, vModel].filter(Boolean).join(" - ") || "Veículo de Passeio";

  // Sempre colocar no assunto do e-mail apenas número do flat, nome do hóspede e período conforme instrução
  const subject = `${flatDisplay} - ${guestName} (${checkinDateBr} a ${checkoutDateBr})`;

  const contentHtml = `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 20px; font-weight: 600; line-height: 1.3; color: #111827; margin: 0 0 8px 0;">Olá, Equipe da Garagem (PFB Estacionamentos)</h1>
      <p style="font-size: 15px; color: #374151; margin: 0; line-height: 1.6;">
        Solicitamos a <strong>liberação de entrada e acesso à vaga de garagem</strong> para o veículo cadastrado abaixo, referente à acomodação no <strong>${flatDisplay}</strong> (${buildingName}).
      </p>
    </div>

    <div class="section-title" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin: 24px 0 8px 0;">Veículo Autorizado</div>
    <div class="info-card" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <table class="info-table" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td class="label" style="padding: 5px 0; color: #6B7280; font-weight: 500; font-size: 13px; width: 38%;">Placa do Veículo:</td>
          <td class="val" style="padding: 5px 0; width: 62%;">
            <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 15px; font-weight: 700; color: #111827; background-color: #FFFFFF; padding: 4px 10px; border-radius: 6px; border: 1px solid #E5E7EB; letter-spacing: 0.8px; display: inline-block;">
              ${vPlate}
            </span>
          </td>
        </tr>
        <tr>
          <td class="label" style="padding: 5px 0; color: #6B7280; font-weight: 500; font-size: 13px; width: 38%;">Modelo / Marca:</td>
          <td class="val" style="padding: 5px 0; color: #111827; font-size: 14px; font-weight: 600; width: 62%;">${vehicleDesc}</td>
        </tr>
        <tr>
          <td class="label" style="padding: 5px 0; color: #6B7280; font-weight: 500; font-size: 13px; width: 38%;">Cor:</td>
          <td class="val" style="padding: 5px 0; color: #111827; font-size: 14px; font-weight: 600; width: 62%;">${vColor || "Não informada"}</td>
        </tr>
        <tr>
          <td class="label" style="padding: 5px 0; color: #6B7280; font-weight: 500; font-size: 13px; width: 38%;">Status de Entrada:</td>
          <td class="val" style="padding: 5px 0; color: #059669; font-weight: 600; font-size: 13px; width: 62%;">✓ ENTRADA LIBERADA NA GARAGEM</td>
        </tr>
      </table>
    </div>

    <div class="section-title" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin: 24px 0 8px 0;">Identificação da Unidade & Hóspede</div>
    <div class="info-card" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <table class="info-table" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Apartamento:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${flatDisplay}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Edifício / Condomínio:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${buildingName}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Código da Reserva:</td><td class="val" style="padding: 5px 0; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #111827; font-weight: 600; width: 62%;">#${reservation?.code || reservation?.id || "-"}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Hóspede Titular:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${guestName}</td></tr>
        ${reservation?.guestDocument ? `<tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Documento / CPF:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${reservation.guestDocument}</td></tr>` : ""}
        ${reservation?.guestPhone ? `<tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Telefone / WhatsApp:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${reservation.guestPhone}</td></tr>` : ""}
      </table>
    </div>

    <div class="section-title" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin: 24px 0 8px 0;">Período da Estadia Autorizada</div>
    <div class="info-card" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <table class="info-table" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Entrada (Check-in):</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${checkinDateBr} (a partir das ${checkinTime})</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Saída (Check-out):</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${checkoutDateBr} (até às ${checkoutTime})</td></tr>
      </table>
    </div>

    ${reservation?.receptionNotes && reservation.receptionNotes.trim() ? `
      <div class="section-title" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin: 24px 0 8px 0;">Observações Adicionais</div>
      <div class="info-card" style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
        <div style="font-size: 14px; color: #92400E; font-weight: 600;">
          Nota de Recepção: ${reservation.receptionNotes.trim().replace(/^nota\s+(de\s+)?recep[cç][aã]o:\s*/i, "").trim()}
        </div>
      </div>
    ` : ""}
  `;

  const badge = `<span class="badge" style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background-color: #F9FAFB; color: #374151; border: 1px solid #E5E7EB;">Garagem Autorizada</span>`;
  const bodyHtml = wrapEmailTemplate({ title: subject, badge, contentHtml });

  return { subject, bodyHtml, html: bodyHtml };
}

/**
 * Gatilho D: Template de Confirmação de Reserva ao Hóspede com Link Dinâmico de Check-in
 */
export function renderReservationConfirmationEmail({ reservation, flat, settings, baseUrl = "", db = null }) {
  const rawFlat = flat?.number || reservation?.flatNumber || "Não informado";
  const cleanFlat = String(rawFlat).replace(/^flat\s*/i, "").trim();
  const flatDisplay = cleanFlat ? `Flat ${cleanFlat}` : "Flat Não informado";
  const buildingName = flat?.buildingName || flat?.building || settings?.buildingName || "Edifício Soho Residence Service";
  const guestName = reservation?.guestName || "Hóspede Titular";
  const checkinDateBr = formatDateBr(reservation?.checkinDate);
  const checkoutDateBr = formatDateBr(reservation?.checkoutDate);
  const checkinTime = settings?.checkinTime || reservation?.checkinTime || "14:00";
  const checkoutTime = settings?.checkoutTime || reservation?.checkoutTime || "12:00";
  const resCode = reservation?.code || reservation?.id || "-";
  const hostBase = baseUrl || settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.com.br";

  const checkinUrl = getCheckinUrlSync(reservation, 1, hostBase, db || settings);
  const isGov = checkinUrl.includes("turismo.gov.br");
  const buttonLabel = isGov ? "🇧🇷 Fazer Check-in Oficial Gov.br (FNRH)" : "📝 Realizar Pré-Check-in Digital";

  const subject = `[CONFIRMAÇÃO DE RESERVA] ${flatDisplay} - ${guestName} (${checkinDateBr} a ${checkoutDateBr})`;

  const contentHtml = `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 20px; font-weight: 600; line-height: 1.3; color: #111827; margin: 0 0 8px 0;">Sua Reserva está Confirmada</h1>
      <p style="font-size: 15px; color: #374151; margin: 0; line-height: 1.6;">
        Olá, <strong>${guestName}</strong>. É uma satisfação receber você no <strong>${buildingName}</strong>. Abaixo estão os detalhes da sua estadia e o link para o pré-check-in digital.
      </p>
    </div>

    <!-- Chamada para Pré Check-in Digital Dinâmico -->
    <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
      <div style="font-size: 12px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: #6B7280; margin-bottom: 4px;">Agilidade na Portaria</div>
      <div style="font-size: 16px; font-weight: 600; color: #111827; margin-bottom: 6px;">Realize seu Check-in Digital Antecipado</div>
      <p style="font-size: 14px; color: #374151; margin: 0 0 16px 0; line-height: 1.5;">
        Para liberar seu acesso na portaria 24h sem filas, preencha os dados dos hóspedes pelo link seguro abaixo:
      </p>
      <a href="${checkinUrl}" class="btn-action" style="display: inline-block; background-color: #111827; color: #FFFFFF !important; font-weight: 700; font-size: 14px; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
        ${buttonLabel}
      </a>
      <div style="font-size: 12px; color: #6B7280; margin-top: 12px; word-break: break-all;">
        Ou copie o link: <span style="text-decoration: underline;">${checkinUrl}</span>
      </div>
    </div>

    <div class="section-title" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin: 24px 0 8px 0;">Identificação da Unidade</div>
    <div class="info-card" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <table class="info-table" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Edifício:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${buildingName}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Acomodação:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${flatDisplay}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Código da Reserva:</td><td class="val" style="padding: 5px 0; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #111827; font-weight: 600; width: 62%;">#${resCode}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Total de Hóspedes:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${resolveEmailGuestCount(reservation)}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Canal da Reserva:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${formatEmailChannelLabel(reservation)}</td></tr>
      </table>
    </div>

    <div class="section-title" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin: 24px 0 8px 0;">Período da Hospedagem</div>
    <div class="info-card" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <table class="info-table" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Entrada (Check-in):</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${checkinDateBr} (a partir das ${checkinTime})</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Saída (Check-out):</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${checkoutDateBr} (até às ${checkoutTime})</td></tr>
      </table>
    </div>
  `;

  const badge = `<span class="badge badge-checkin" style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background-color: #ECFDF5; color: #047857; border: 1px solid #A7F3D0;">Reserva Confirmada</span>`;
  const bodyHtml = wrapEmailTemplate({ title: subject, badge, contentHtml });
  return { subject, bodyHtml, html: bodyHtml, checkinUrl };
}
export const renderConfirmationEmail = renderReservationConfirmationEmail;

/**
 * Gatilho E: Template de Lembrete de Pré-Check-in Pendente com Link Dinâmico
 */
export function renderPreCheckinReminderEmail({ reservation, flat, settings, baseUrl = "", db = null }) {
  const rawFlat = flat?.number || reservation?.flatNumber || "Não informado";
  const cleanFlat = String(rawFlat).replace(/^flat\s*/i, "").trim();
  const flatDisplay = cleanFlat ? `Flat ${cleanFlat}` : "Flat Não informado";
  const buildingName = flat?.buildingName || flat?.building || settings?.buildingName || "Edifício Soho Residence Service";
  const guestName = reservation?.guestName || "Hóspede Titular";
  const checkinDateBr = formatDateBr(reservation?.checkinDate);
  const checkinTime = settings?.checkinTime || reservation?.checkinTime || "14:00";
  const resCode = reservation?.code || reservation?.id || "-";
  const hostBase = baseUrl || settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.com.br";

  const checkinUrl = getCheckinUrlSync(reservation, 1, hostBase, db || settings);
  const checkinUrlGuest2 = getCheckinUrlSync(reservation, 2, hostBase, db || settings);
  const isGov = checkinUrl.includes("turismo.gov.br");
  const buttonLabel = isGov ? "🇧🇷 Preencher Ficha Oficial Gov.br (FNRH)" : "📝 Preencher Pré-Check-in Digital";

  const isMultiGuest = (Number(reservation?.guestCount || reservation?.adults || 1) > 1);
  const firstGuestDone = Boolean(reservation?.guests?.[0]?.hasCompletedCheckin || reservation?.guests?.[0]?.status === "CHECKED_IN");

  const subject = `[LEMBRETE DE CHECK-IN] ${flatDisplay} - ${guestName} (Entrada: ${checkinDateBr})`;

  const contentHtml = `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 20px; font-weight: 600; line-height: 1.3; color: #111827; margin: 0 0 8px 0;">Lembrete de Pré-Check-in Digital</h1>
      <p style="font-size: 15px; color: #374151; margin: 0; line-height: 1.6;">
        Olá, <strong>${guestName}</strong>. Sua entrada no <strong>${flatDisplay}</strong> está próxima (${checkinDateBr} a partir das ${checkinTime}).
      </p>
    </div>

    ${isMultiGuest && firstGuestDone ? `
      <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-left: 3px solid #D97706; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
        <div style="color: #111827; font-size: 14px; font-weight: 600;">Cadastro Pendente do 2º Hóspede</div>
        <p style="color: #374151; font-size: 14px; margin: 6px 0 14px 0; line-height: 1.5;">
          A ficha do titular foi recebida com sucesso. Falta apenas o preenchimento do segundo acompanhante para liberação na portaria:
        </p>
        <a href="${checkinUrlGuest2}" class="btn-action" style="display: inline-block; background-color: #111827; color: #FFFFFF !important; font-weight: 700; font-size: 14px; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
          Preencher Check-in do 2º Hóspede
        </a>
      </div>
    ` : `
      <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
        <div style="font-size: 12px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: #6B7280; margin-bottom: 4px;">Liberação Antecipada</div>
        <div style="font-size: 16px; font-weight: 600; color: #111827; margin-bottom: 6px;">Sua Ficha de Check-in ainda está pendente</div>
        <p style="font-size: 14px; color: #374151; margin: 0 0 16px 0; line-height: 1.5;">
          Preencha antecipadamente para que a portaria autorize sua entrada sem burocracia na chegada:
        </p>
        <a href="${checkinUrl}" class="btn-action" style="display: inline-block; background-color: #111827; color: #FFFFFF !important; font-weight: 700; font-size: 14px; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
          ${buttonLabel}
        </a>
        <div style="font-size: 12px; color: #6B7280; margin-top: 12px; word-break: break-all;">
          Ou acesse: <span style="text-decoration: underline;">${checkinUrl}</span>
        </div>
      </div>
    `}

    <div class="section-title" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin: 24px 0 8px 0;">Dados da Estadia</div>
    <div class="info-card" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <table class="info-table" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Apartamento:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${flatDisplay} (${buildingName})</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Código da Reserva:</td><td class="val" style="padding: 5px 0; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #111827; font-weight: 600; width: 62%;">#${resCode}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Data de Entrada:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${checkinDateBr} (a partir das ${checkinTime})</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Total de Hóspedes:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${resolveEmailGuestCount(reservation)}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Canal da Reserva:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${formatEmailChannelLabel(reservation)}</td></tr>
      </table>
    </div>
  `;

  const badge = `<span class="badge badge-update" style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background-color: #FFFBEB; color: #B45309; border: 1px solid #FDE68A;">Lembrete de Check-in</span>`;
  const bodyHtml = wrapEmailTemplate({ title: subject, badge, contentHtml });
  return { subject, bodyHtml, html: bodyHtml, checkinUrl };
}
export const renderReminderEmail = renderPreCheckinReminderEmail;

/**
 * Gatilho F: Template de Instruções de Acesso ao Flat com Link Dinâmico de Check-in
 */
export function renderAccessInstructionsEmail({ reservation, flat, settings, baseUrl = "", db = null }) {
  const rawFlat = flat?.number || reservation?.flatNumber || "Não informado";
  const cleanFlat = String(rawFlat).replace(/^flat\s*/i, "").trim();
  const flatDisplay = cleanFlat ? `Flat ${cleanFlat}` : "Flat Não informado";
  const buildingName = flat?.buildingName || flat?.building || settings?.buildingName || "Edifício Soho Residence Service";
  const guestName = reservation?.guestName || "Hóspede Titular";
  const checkinDateBr = formatDateBr(reservation?.checkinDate);
  const checkinTime = settings?.checkinTime || reservation?.checkinTime || "14:00";
  const resCode = reservation?.code || reservation?.id || "-";
  const hostBase = baseUrl || settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.com.br";

  const checkinUrl = getCheckinUrlSync(reservation, 1, hostBase, db || settings);
  const wifiNetwork = flat?.wifiNetwork || settings?.wifiNetwork || (flatDisplay ? `apto ${flatDisplay}` : "apto {quarto}");
  const wifiPassword = flat?.wifiPassword || settings?.wifiPassword || "1234567890123";

  const subject = `[INSTRUÇÕES DE ACESSO] ${flatDisplay} - ${guestName} (${buildingName})`;

  const contentHtml = `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 20px; font-weight: 600; line-height: 1.3; color: #111827; margin: 0 0 8px 0;">Instruções para sua Chegada e Acesso</h1>
      <p style="font-size: 15px; color: #374151; margin: 0; line-height: 1.6;">
        Olá, <strong>${guestName}</strong>. Seguem todas as informações necessárias para sua entrada no <strong>${flatDisplay}</strong>.
      </p>
    </div>

    <!-- Passos de Entrada -->
    <div class="info-card" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <div style="font-weight: 600; color: #111827; font-size: 14px; margin-bottom: 8px;">Passo a Passo para Entrada:</div>
      <ol style="margin: 0 0 16px 18px; padding: 0; font-size: 14px; color: #374151; line-height: 1.6;">
        <li>Dirija-se à <strong>portaria 24h</strong> do condomínio <strong>${buildingName}</strong>.</li>
        <li>Identifique-se informando seu nome e o <strong>${flatDisplay}</strong>.</li>
        <li>Certifique-se de que seu <strong>Pré-Check-in Digital</strong> está concluído no link abaixo para autorização imediata da chave.</li>
      </ol>
      <div>
        <a href="${checkinUrl}" class="btn-action" style="display: inline-block; background-color: #111827; color: #FFFFFF !important; font-weight: 700; font-size: 14px; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
          📝 Acessar / Conferir Ficha de Check-in
        </a>
      </div>
    </div>

    <div class="section-title" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin: 24px 0 8px 0;">Conexão Wi-Fi</div>
    <div class="info-card" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <table class="info-table" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Rede:</td><td class="val" style="padding: 5px 0; font-size: 14px; font-weight: 600; color: #111827; width: 62%;">${wifiNetwork}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Senha:</td><td class="val" style="padding: 5px 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${wifiPassword}</td></tr>
      </table>
    </div>

    <div class="section-title" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin: 24px 0 8px 0;">Detalhes da Reserva</div>
    <div class="info-card" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <table class="info-table" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Acomodação:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${flatDisplay} (${buildingName})</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Código da Reserva:</td><td class="val" style="padding: 5px 0; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #111827; font-weight: 600; width: 62%;">#${resCode}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Horário de Entrada:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${checkinDateBr} a partir das ${checkinTime}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Total de Hóspedes:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${resolveEmailGuestCount(reservation)}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Canal da Reserva:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${formatEmailChannelLabel(reservation)}</td></tr>
      </table>
    </div>
  `;

  const badge = `<span class="badge badge-general" style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background-color: #F9FAFB; color: #374151; border: 1px solid #E5E7EB;">Instruções de Acesso</span>`;
  const bodyHtml = wrapEmailTemplate({ title: subject, badge, contentHtml });
  return { subject, bodyHtml, html: bodyHtml, checkinUrl };
}
export const renderAccessInstructionEmail = renderAccessInstructionsEmail;

/**
 * Gatilho G: Template de Confirmação de Reserva B2B e Solicitação Cordial de Credenciamento do Hóspede para a Agência
 * Enviado ao agente emissor / agência de viagens com o link seguro de credenciamento (/credenciamento/:code)
 * sem expor valores financeiros ao hóspede e explicando a obrigatoriedade do preenchimento prévio para liberação na portaria.
 */
export function renderB2bAgencyCredentialRequestEmail({
  reservation,
  flat,
  agency = null,
  company = null,
  settings = null,
  baseUrl = "",
  credentialUrl = "",
  isReminder = false,
  reminderKind = "",
  reminderNumber = 1,
  db = null
} = {}) {
  const rawFlat = flat?.number || reservation?.flatNumber || "Não informado";
  const cleanFlat = String(rawFlat).replace(/^flat\s*/i, "").trim();
  const flatDisplay = cleanFlat ? `Flat ${cleanFlat}` : "Flat Designado";
  const buildingName = flat?.buildingName || flat?.building || settings?.buildingName || "Edifício Soho Residence Service";
  const rawGuestName = String(reservation?.guestName || "").trim();
  const isPendingGuest =
    !rawGuestName ||
    Boolean(reservation?.guestPending) ||
    /^(h[óo]spede(\s*\d+|\s+a\s+definir.*|\s+titular|\s+b2b)?|a\s+definir.*)$/i.test(rawGuestName);
  const guestName = isPendingGuest ? "A Definir (Pendente)" : rawGuestName;
  const checkinDateBr = formatDateBr(reservation?.checkinDate);
  const checkoutDateBr = formatDateBr(reservation?.checkoutDate);
  const checkinTime = settings?.checkinTime || reservation?.checkinTime || "14:00";
  const checkoutTime = settings?.checkoutTime || reservation?.checkoutTime || "12:00";
  const resCode = reservation?.code || reservation?.id || "-";
  const b2bNumber = reservation?.b2bReservationNumber || reservation?.externalReservationNumber || "";
  const rloc = reservation?.b2bLocatorRloc || b2bNumber || "";
  const companyName = company?.tradeName || company?.corporateName || reservation?.companyName || "";
  const reqContactName = reservation?.requesterInfo?.name || reservation?.requesterName || "";
  const agencyName = agency?.tradeName || agency?.corporateName || reservation?.agencyName || companyName || reqContactName || "Solicitante";
  const agencyPosUnit = reservation?.agencyPosUnit || "";
  const agentName = (reservation?.agencyAgentName && !/^(WEBSERVICE|SISTEMA|ARGO\.)/i.test(String(reservation.agencyAgentName).trim()))
    ? reservation.agencyAgentName
    : (reqContactName && reqContactName !== agencyName ? reqContactName : "");

  const hostBase = String(
    baseUrl ||
    settings?.baseUrl ||
    (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) ||
    "https://corpflats.com.br"
  )
    .replace(/https?:\/\/corpflats\.onrender\.com/gi, "https://corpflats.com.br")
    .replace(/\/+$/, "");

  const finalCredentialUrl =
    credentialUrl ||
    `${hostBase}/credenciamento/${encodeURIComponent(String(resCode))}`;

  const refLabel = b2bNumber
    ? `Reserva #${b2bNumber}${rloc && rloc !== b2bNumber ? ` (RLOC: ${rloc})` : ""}`
    : `Reserva #${resCode}`;

  const isCheckinDayReminder =
    isReminder &&
    (reminderKind === "checkin_morning" || reminderKind === "checkin_noon" || reminderKind === "sameday_2h");

  const guestSubjectPart = !isPendingGuest ? ` - ${guestName}` : "";
  const subject = isReminder
    ? isCheckinDayReminder
      ? `[LEMBRETE URGENTE • CHECK-IN HOJE] Dados do Hóspede Pendentes - ${refLabel}${guestSubjectPart} (${checkinDateBr})`
      : `[LEMBRETE • DADOS DO HÓSPEDE PENDENTES] ${refLabel}${guestSubjectPart} (${checkinDateBr} a ${checkoutDateBr})`
    : `[CONFIRMAÇÃO & DADOS DO HÓSPEDE] ${refLabel}${guestSubjectPart} (${checkinDateBr} a ${checkoutDateBr})`;

  const greetingName = agentName
    ? `Olá, <strong>${escapeHtml(agentName)}</strong>${agencyName && agencyName !== agentName ? ` (${escapeHtml(agencyName)})` : ""}`
    : `Olá, <strong>${escapeHtml(agencyName)}</strong>`;

  const guestIntroFragment = !isPendingGuest
    ? `do(a) hóspede <strong>${escapeHtml(guestName)}</strong>`
    : `solicitada por você`;

  const headerTitle = isReminder
    ? (isCheckinDayReminder
        ? "⏰ Check-in Hoje • Preenchimento Urgente dos Dados do Hóspede"
        : "🔔 Lembrete • Preenchimento Pendente dos Dados do Hóspede")
    : "Reserva Confirmada • Dados do Hóspede para Liberação na Recepção";

  const introParagraphsHtml = isReminder
    ? isCheckinDayReminder
      ? `
      <p style="font-size: 15px; color: #374151; margin: 0 0 12px 0; line-height: 1.6;">
        ${greetingName}, tudo bem? O check-in da <strong>${escapeHtml(refLabel)}</strong> ${guestIntroFragment}${companyName ? ` (<strong>${escapeHtml(companyName)}</strong>)` : ""} no <strong>${escapeHtml(buildingName)}</strong> (${escapeHtml(flatDisplay)}) acontece <strong>hoje (${checkinDateBr}, a partir das ${checkinTime})</strong>, e vimos que os dados completos do hóspede <strong>ainda não foram preenchidos</strong> em nosso sistema.
      </p>
      <p style="font-size: 15px; color: #374151; margin: 0; line-height: 1.6;">
        Pedimos por gentileza o preenchimento imediato pelo link seguro abaixo para que possamos liberar a entrada na portaria 24h e enviar as instruções de acesso ao hóspede sem atrasos na chegada.
      </p>`
      : `
      <p style="font-size: 15px; color: #374151; margin: 0 0 12px 0; line-height: 1.6;">
        ${greetingName}, tudo bem? Passando para lembrar que vimos que os dados completos do hóspede da <strong>${escapeHtml(refLabel)}</strong> ${guestIntroFragment}${companyName ? ` (<strong>${escapeHtml(companyName)}</strong>)` : ""} no <strong>${escapeHtml(buildingName)}</strong> (${escapeHtml(flatDisplay)}, período de <strong>${checkinDateBr} a ${checkoutDateBr}</strong>) <strong>ainda não foram preenchidos</strong>.
      </p>
      <p style="font-size: 15px; color: #374151; margin: 0; line-height: 1.6;">
        Utilize o link seguro abaixo (ou encaminhe-o diretamente ao hóspede) para concluir o cadastro antecipado e garantir a liberação automática na recepção.
      </p>`
    : `
      <p style="font-size: 15px; color: #374151; margin: 0 0 12px 0; line-height: 1.6;">
        ${greetingName}, tudo bem? Confirmamos com muita satisfação a reserva ${guestIntroFragment}${companyName ? ` (<strong>${escapeHtml(companyName)}</strong>)` : ""} no <strong>${escapeHtml(buildingName)}</strong> (${escapeHtml(flatDisplay)}), para o período de <strong>${checkinDateBr} a ${checkoutDateBr}</strong>.
      </p>
      <p style="font-size: 15px; color: #374151; margin: 0; line-height: 1.6;">
        Como ainda não temos os dados completos e o contato direto do hóspede na reserva, disponibilizamos abaixo o nosso <strong>Link Seguro para Preenchimento dos Dados do Hóspede</strong>.
      </p>`;

  const contentHtml = `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 20px; font-weight: 600; line-height: 1.3; color: #111827; margin: 0 0 10px 0;">
        ${headerTitle}
      </h1>
      ${introParagraphsHtml}
    </div>

    <!-- Alerta de Obrigatoriedade de Credenciamento Prévio -->
    <div style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-left: 4px solid #D97706; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
      <div style="color: #92400E; font-size: 14px; font-weight: 700; margin-bottom: 6px;">
        ⚠️ IMPORTANTE: LIBERAÇÃO ANTECIPADA OBRIGATÓRIA NA RECEPÇÃO / PORTARIA 24H
      </div>
      <p style="color: #78350F; font-size: 13.5px; margin: 0; line-height: 1.55;">
        O preenchimento antecipado pelo link abaixo (informando <strong>Nome Completo, CPF/Passaporte, WhatsApp e E-mail do hóspede</strong>) é <strong>indispensável para gerar a autorização de entrada na portaria do edifício</strong>.<br/><br/>
        Ressaltamos gentilmente que <strong>esses dados não podem ser informados apenas na hora no balcão</strong>, pois nossa operação é digital e, sem o cadastro prévio pelo link, o sistema da recepção/portaria não conseguirá localizar a reserva nem autorizar a entrada do hóspede no condomínio.
      </p>
    </div>

    <!-- Call to Action Principal: Link de Credenciamento -->
    <div style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: center;">
      <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: #15803D; margin-bottom: 6px;">
        Ambiente Seguro • Sem Exibição de Valores Financeiros
      </div>
      <div style="font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 8px;">
        Preencher Dados do Hóspede e Liberar Entrada na Portaria
      </div>
      <p style="font-size: 13.5px; color: #374151; margin: 0 0 16px 0; line-height: 1.5;">
        Você pode preencher os dados diretamente pelo botão abaixo (ou encaminhar este link ao hóspede, pois a página <strong>não exibe tarifas nem valores financeiros</strong>). Assim que concluído, enviaremos automaticamente pelo WhatsApp do hóspede todas as instruções de chegada, Wi-Fi e acesso ao flat:
      </p>
      <a href="${escapeHtml(finalCredentialUrl)}" class="btn-action" style="display: inline-block; background-color: #111827; color: #FFFFFF !important; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 6px; text-decoration: none;">
        🔐 Preencher Dados do Hóspede
      </a>
      <div style="font-size: 12px; color: #4B5563; margin-top: 12px; word-break: break-all;">
        Link direto: <a href="${escapeHtml(finalCredentialUrl)}" style="color: #111827; font-weight: 600; text-decoration: underline;">${escapeHtml(finalCredentialUrl)}</a>
      </div>
    </div>

    <div class="section-title" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin: 24px 0 8px 0;">Resumo da Reserva Confirmada</div>
    <div class="info-card" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <table class="info-table" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
        ${b2bNumber ? `<tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Nº Reserva Externa:</td><td class="val" style="padding: 5px 0; font-size: 14px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #111827; font-weight: 700; width: 62%;">${escapeHtml(b2bNumber)}${rloc && rloc !== b2bNumber ? ` (RLOC: ${escapeHtml(rloc)})` : ""}</td></tr>` : ""}
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Código Interno CorpFlats:</td><td class="val" style="padding: 5px 0; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #111827; font-weight: 600; width: 62%;">#${escapeHtml(resCode)}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Hóspede Titular:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${escapeHtml(guestName)}</td></tr>
        ${companyName ? `<tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Empresa Solicitante:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${escapeHtml(companyName)}</td></tr>` : ""}
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Solicitante:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${escapeHtml(agencyName)}${agencyPosUnit ? ` • ${escapeHtml(agencyPosUnit)}` : ""}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Edifício / Acomodação:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${escapeHtml(flatDisplay)} — ${escapeHtml(buildingName)}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Entrada (Check-in):</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${checkinDateBr} (a partir das ${checkinTime})</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Saída (Check-out):</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${checkoutDateBr} (até às ${checkoutTime})</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Total de Hóspedes:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${resolveEmailGuestCount(reservation)}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Canal da Reserva:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${escapeHtml(formatEmailChannelLabel(reservation))}</td></tr>
      </table>
    </div>

    <p style="font-size: 13.5px; color: #4B5563; margin: 16px 0 0 0; line-height: 1.5;">
      Permanecemos à inteira disposição por este e-mail ou pelo nosso WhatsApp de Atendimento para qualquer suporte adicional. Muito obrigado pela atenção!
    </p>
  `;

  const badge = isReminder
    ? `<span class="badge badge-checkin" style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background-color: ${isCheckinDayReminder ? "#FEF2F2" : "#FFFBEB"}; color: ${isCheckinDayReminder ? "#B91C1C" : "#B45309"}; border: 1px solid ${isCheckinDayReminder ? "#FECACA" : "#FDE68A"};">${isCheckinDayReminder ? "Check-in Hoje • Dados Pendentes" : `Lembrete${reminderNumber > 1 ? ` #${reminderNumber}` : ""} • Dados do Hóspede`}</span>`
    : `<span class="badge badge-checkin" style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background-color: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE;">Reserva • Dados do Hóspede</span>`;
  const bodyHtml = wrapEmailTemplate({ title: subject, badge, contentHtml });
  const textIntro = isReminder
    ? (isCheckinDayReminder
        ? `O check-in da ${refLabel}${!isPendingGuest ? ` (${guestName})` : ""} no ${buildingName} (${flatDisplay}) acontece HOJE (${checkinDateBr}, a partir das ${checkinTime}), e vimos que os dados completos do hóspede ainda não foram preenchidos.`
        : `Passando para lembrar que vimos que os dados completos do hóspede da ${refLabel}${!isPendingGuest ? ` (${guestName})` : ""} no ${buildingName} (${flatDisplay}), período de ${checkinDateBr} a ${checkoutDateBr}, ainda não foram preenchidos.`)
    : `Confirmamos a reserva ${refLabel}${!isPendingGuest ? ` para o(a) hóspede ${guestName}` : ""} no ${buildingName} (${flatDisplay}), período de ${checkinDateBr} a ${checkoutDateBr} • Total de Hóspedes: ${resolveEmailGuestCount(reservation)} • Canal: ${formatEmailChannelLabel(reservation)}.`;
  const bodyText = [
    `Olá, ${agentName || agencyName}!`,
    textIntro,
    `IMPORTANTE: Para gerar a liberação de entrada na recepção/portaria do prédio, é obrigatório o preenchimento antecipado dos dados do hóspede (Nome Completo, CPF/Passaporte, WhatsApp e E-mail) através do nosso link seguro abaixo. Não é possível informar apenas na hora no balcão, pois sem o cadastro prévio pelo link a portaria não conseguirá localizar a reserva nem autorizar a entrada.`,
    `Link Seguro para Preenchimento dos Dados do Hóspede (sem exibição de valores financeiros): ${finalCredentialUrl}`,
    `Muito obrigado pela atenção! Equipe CorpFlats`
  ].join("\n\n");

  return { subject, bodyHtml, html: bodyHtml, bodyText, credentialUrl: finalCredentialUrl };
}

/**
 * Retorna a data atual no fuso horário oficial de Brasília (America/Sao_Paulo) no formato YYYY-MM-DD.
 */
export function getBrasiliaTodayStr() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

/**
 * Converte qualquer data/timestamp ISO para YYYY-MM-DD no fuso horário de Brasília (America/Sao_Paulo).
 * Evita que eventos ocorridos entre 21:00 e 23:59 BRT (00:00–02:59 UTC do dia seguinte) sejam atribuídos ao dia errado.
 */
export function toBrasiliaDateStr(dateInput) {
  if (!dateInput) return "";
  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput).substring(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
}

/**
 * Determina se a reserva tem check-in estritamente para o dia de hoje.
 */
export function isReservationForToday(reservation) {
  if (!reservation) return false;
  const checkin = reservation.checkinDate || reservation.checkIn || reservation.checkInDate;
  if (!checkin) return false;
  return String(checkin).substring(0, 10) === getBrasiliaTodayStr();
}

/**
 * Determina se a reserva é para uma data futura (check-in posterior ao dia de hoje).
 */
export function isReservationForFuture(reservation) {
  if (!reservation) return false;
  const checkin = reservation.checkinDate || reservation.checkIn || reservation.checkInDate;
  if (!checkin) return false;
  return String(checkin).substring(0, 10) > getBrasiliaTodayStr();
}

/**
 * Determina se a reserva é para o dia de hoje ou anterior (estadias em andamento ou no dia de chegada).
 */
export function isReservationForTodayOrPast(reservation) {
  if (!reservation) return false;
  const checkin = reservation.checkinDate || reservation.checkIn || reservation.checkInDate;
  if (!checkin) return true;
  return String(checkin).substring(0, 10) <= getBrasiliaTodayStr();
}

/**
 * Verifica no histórico real de comunicações (`db.reservationCommunications`) se um e-mail
 * destinado efetivamente ao endereço da recepção/portaria já foi enviado para a reserva.
 * Nunca confunde e-mails enviados ao hóspede (ex: `pre_checkin_completed`) com e-mails da recepção.
 */
export function hasReceptionEmailInComms(reservation, db = {}, options = {}) {
  if (!reservation) return false;
  const { dateStr = null, requireFnrhIfCompleted = false } = options || {};

  const resCode = String(reservation.code || reservation.reservationCode || "").trim().toUpperCase();
  const resId = String(reservation.id || "").trim();

  const flat = (db?.flats || []).find(f => f.id === reservation.flatId || String(f.number) === String(reservation.flatNumber));
  const receptionEmail = (flat?.receptionEmail || db?.settings?.receptionEmail || db?.settings?.buildingEmail || process.env.RECEPTION_EMAIL || "soho@promenade.com.br").toLowerCase().trim();

  const stageInfo = evaluateReceptionCheckinStage(reservation);
  const hasGuestFnrhCompleted = stageInfo.completedGuests > 0;

  const comms = Array.isArray(db?.reservationCommunications) ? db.reservationCommunications : [];
  return comms.some(c => {
    if (!c || c.type !== "email") return false;
    if (c.status !== "sent" && c.status !== "delivered" && c.status !== "pending") return false;

    const cResId = String(c.reservation_id || "").trim().toUpperCase();
    const isSameRes = (resCode && cResId === resCode) || (resId && cResId === resId);
    if (!isSameRes) return false;

    const recipient = String(c.recipient || "").toLowerCase().trim();
    const cc = String(c.cc || c.metadata?.cc || "").toLowerCase().trim();
    const isToReception = recipient.includes(receptionEmail) || cc.includes(receptionEmail);
    if (!isToReception) return false;

    const trigger = String(c.metadata?.trigger || "").trim();
    // CRÍTICO: "pre_checkin_completed" é o e-mail espelho enviado ao HÓSPEDE, nunca à recepção
    if (trigger === "pre_checkin_completed") return false;

    const isReceptionDispatch =
      trigger === "morning_checkin_07h" ||
      trigger === "pre_checkin" ||
      trigger === "re_signature_checkin" ||
      trigger === "checkin_confirmed" ||
      trigger === "self_checkin_arrival_fallback" ||
      trigger === "reception_manual_checkin_fallback" ||
      trigger === "pms_reservation_created" ||
      trigger === "sameday_pms_created" ||
      trigger === "sameday_direct_booking" ||
      trigger === "payment_confirmed" ||
      trigger === "pms_pre_reservation_confirmed" ||
      trigger === "bot_commit_reservation" ||
      trigger === "reservation_created_reception" ||
      trigger === "reservation_update" ||
      trigger === "guest_portal_modify" ||
      trigger === "portal_modify_settled" ||
      (c.subject && (
        c.subject.toUpperCase().includes("CHECK-IN") ||
        c.subject.toUpperCase().includes("ATUALIZAÇÃO DE RESERVA") ||
        c.subject.toUpperCase().includes("LIBERAÇÃO DE HOSPEDAGEM")
      ));

    if (!isReceptionDispatch) return false;

    if (dateStr) {
      const sentBrDate = toBrasiliaDateStr(c.created_at || c.metadata?.sentAt || c.sentAt || c.createdAt);
      if (sentBrDate !== dateStr) return false;
    }

    if (requireFnrhIfCompleted && hasGuestFnrhCompleted) {
      const hasFnrhAttachment =
        Boolean(c.metadata?.hasPdfAttached) ||
        trigger === "pre_checkin" ||
        trigger === "re_signature_checkin" ||
        trigger === "self_checkin_arrival_fallback" ||
        trigger === "reception_manual_checkin_fallback";
      if (!hasFnrhAttachment) return false;
      if (stageInfo.stage === "completed" && c.metadata?.checkinStage && c.metadata.checkinStage !== "completed") {
        return false;
      }
    }

    return true;
  });
}

/**
 * Verifica se a recepção/portaria já recebeu os dados desta reserva por e-mail previamente.
 * Alterações e cancelamentos só devem ser informados à recepção se eles já receberam a reserva antes.
 * Se a alteração/cancelamento ocorrer antes do disparo para o e-mail deles (ex: antes da rotina das 07h do check-in),
 * a recepção não precisa ser notificada, pois já receberá as informações atualizadas quando forem disparadas.
 */
export function hasReceptionReceivedReservation(reservation, db = {}) {
  if (!reservation) return false;

  // Regra de Comunicação Estrita:
  // Se a reserva tem check-in para data futura, a recepção NUNCA deve receber e-mails de alteração
  // ou cancelamento com antecedência. Reservas futuras sempre aguardam o dia do check-in (rotina das 07:00).
  if (isReservationForFuture(reservation)) {
    return false;
  }

  // 1. Checa histórico real de comunicações destinadas ao e-mail da recepção
  if (hasReceptionEmailInComms(reservation, db)) {
    return true;
  }

  // 2. Fallback para indicadores diretos apenas se não houver histórico de comunicações da reserva no banco
  // (evita que um carimbo morningEmailSentDate gravado indevidamente mascare a ausência real de envio à recepção)
  const resCode = String(reservation.code || reservation.reservationCode || "").trim().toUpperCase();
  const resId = String(reservation.id || "").trim();
  const comms = Array.isArray(db?.reservationCommunications) ? db.reservationCommunications : [];
  const hasAnyCommsForReservation = comms.some(c => {
    if (!c) return false;
    const cResId = String(c.reservation_id || "").trim().toUpperCase();
    return (resCode && cResId === resCode) || (resId && cResId === resId);
  });

  if (!hasAnyCommsForReservation) {
    if (Boolean(reservation.morningEmailSentDate) || 
        Boolean(reservation.morningEmailSentAt) || 
        Boolean(reservation.receptionNotifiedAt) || 
        Boolean(reservation.receptionEmailSentAt)) {
      return true;
    }
  }

  return false;
}

/**
 * Fila / Serviço Assíncrono de Disparo de E-mail
 * Grava o log imediatamente no histórico e despacha em background sem bloquear a requisição HTTP.
 */
export function sendEmailAsync({
  db,
  saveDatabase,
  reservationId,
  recipient,
  cc,
  bcc,
  subject,
  bodyHtml,
  html,
  bodyText = "",
  type = "email",
  direction = "outbound",
  metadata = {},
  attachments = [],
  overrides = {},
  onDeliveryResult = null
}) {
  if (!recipient || !subject) {
    console.warn("[MailService] Destinatário ou assunto ausentes. Abortando.");
    if (typeof onDeliveryResult === "function") {
      try {
        onDeliveryResult({ success: false, status: "failed", error: "Destinatário ou assunto de e-mail ausentes." });
      } catch (_) {}
    }
    return null;
  }

  // Verifica se o motor automático de e-mails está pausado pelo usuário
  if (metadata?.isAutomated && db?.settings?.emailSettings?.enabled === false) {
    console.log(`[MailService ⏸️] Motor de e-mails automáticos pausado. Disparo para ${recipient} ('${subject}') suspenso.`);
    return null;
  }

  const finalHtml = bodyHtml || html || "";
  const preExtractedCleanBody = htmlToStructuredReceptionWhatsAppBody(finalHtml, bodyText);
  const commId = crypto.randomUUID();
  const now = new Date().toISOString();

  const logEntry = {
    id: commId,
    reservation_id: String(reservationId || "0"),
    type: type || "email",
    direction: direction || "outbound",
    recipient: recipient.trim(),
    cc: cc ? String(cc).trim() : null,
    bcc: bcc ? String(bcc).trim() : null,
    subject: subject.trim(),
    body: finalHtml || bodyText || "",
    status: "pending",
    metadata: {
      ...metadata,
      cc: cc ? String(cc).trim() : undefined,
      bcc: bcc ? String(bcc).trim() : undefined,
      cleanBodyText: preExtractedCleanBody ? preExtractedCleanBody.slice(0, 3500) : undefined,
      hasAttachments: Array.isArray(attachments) && attachments.length > 0,
      attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
      attempts: 1,
      queuedAt: now
    },
    created_at: now,
    createdAt: now
  };

  if (!db.reservationCommunications) {
    db.reservationCommunications = [];
  }

  // Insere no início do histórico da reserva
  db.reservationCommunications.unshift(logEntry);

  // Se o e-mail já foi identificado como inválido no check-in, registra como falha pendente de correção sem disparar SMTP (protege reputação do domínio)
  if (metadata?.awaitingEmailCorrection === true) {
    logEntry.status = "failed";
    logEntry.metadata.error = metadata.invalidEmailReason || "E-mail inválido informado no check-in (aguardando correção do hóspede via WhatsApp).";
    logEntry.metadata.failedAt = now;
    if (typeof saveDatabase === "function") saveDatabase();
    if (typeof onDeliveryResult === "function") {
      setImmediate(() => {
        try {
          onDeliveryResult({
            success: false,
            status: "failed",
            error: logEntry.metadata.error,
            failedAt: now,
            communicationId: logEntry.id
          });
        } catch (_) {}
      });
    }
    return logEntry;
  }

  if (typeof saveDatabase === "function") saveDatabase();

  // Execução assíncrona não bloqueante
  setImmediate(async () => {
    try {
      const config = getSmtpConfig(db, overrides);
      const customTransporter = overrides?.transporter || null;
      if (!customTransporter && (!config.user || !config.pass)) {
        throw new Error("SMTP não configurado no backend (credenciais de SMTP_USER/SMTP_PASS ausentes).");
      }

      const transporter = customTransporter || createTransporter(db, overrides);
      if (!transporter) {
        throw new Error("Não foi possível criar transporte SMTP.");
      }

      const mailOptions = {
        from: `"${config.fromName || "CorpFlats"}" <${config.fromEmail || config.user || "contato@corpflats.com.br"}>`,
        to: recipient.trim(),
        ...(cc ? { cc: String(cc).trim() } : {}),
        ...(bcc ? { bcc: String(bcc).trim() } : {}),
        subject: subject.trim(),
        html: finalHtml || `<p>${bodyText}</p>`,
        text: bodyText || subject,
        ...(Array.isArray(attachments) && attachments.length > 0 ? { attachments } : {})
      };

      const info = await transporter.sendMail(mailOptions);

      logEntry.status = "sent";
      logEntry.metadata.messageId = info.messageId;
      logEntry.metadata.sentAt = new Date().toISOString();
      delete logEntry.metadata.error;
      console.log(`[MailService] ✓ E-mail enviado para ${recipient} (MsgID: ${info.messageId})`);
      if (typeof onDeliveryResult === "function") {
        try {
          onDeliveryResult({
            success: true,
            status: "sent",
            messageId: info.messageId,
            sentAt: logEntry.metadata.sentAt,
            communicationId: logEntry.id
          });
        } catch (_) {}
      }

      if (isEmailAddressedToReception(logEntry, db)) {
        evaluateReceptionEmailFallbackAutoRecovery(db, saveDatabase);
        if (isReceptionEmailFallbackActive(db)) {
          try {
            await forwardReceptionEmailToWhatsApp({
              db,
              saveDatabase,
              comm: logEntry,
              rawBodyHtml: finalHtml,
              rawAttachments: attachments,
              isRetroactive: false,
              triggerSource: "live_active_fallback",
              overrides
            });
          } catch (fbErr) {
            console.warn("[ReceptionFallback] Aviso ao encaminhar e-mail da recepção via WhatsApp:", fbErr?.message || fbErr);
          }
        }
      }
    } catch (err) {
      logEntry.status = "failed";
      logEntry.metadata.error = err.message || String(err);
      logEntry.metadata.failedAt = new Date().toISOString();
      console.error(`[MailService] ✗ Falha ao enviar e-mail para ${recipient}:`, err.message);
      if (typeof onDeliveryResult === "function") {
        try {
          onDeliveryResult({
            success: false,
            status: "failed",
            error: logEntry.metadata.error,
            failedAt: logEntry.metadata.failedAt,
            communicationId: logEntry.id
          });
        } catch (_) {}
      }

      if (isEmailAddressedToReception(logEntry, db)) {
        try {
          recordReceptionEmailDeliveryIssue(db, saveDatabase, {
            source: "smtp_error",
            reason: err.message || String(err),
            subject: logEntry.subject,
            recipient: logEntry.recipient,
            eventAt: logEntry.metadata.failedAt
          });
          if (ensureReceptionEmailFallbackState(db).enabled !== false) {
            await forwardReceptionEmailToWhatsApp({
              db,
              saveDatabase,
              comm: logEntry,
              rawBodyHtml: finalHtml,
              rawAttachments: attachments,
              isRetroactive: false,
              triggerSource: "smtp_failure_fallback",
              overrides
            });
            dispatchRetroactiveTodayReceptionEmailsToWhatsApp(db, saveDatabase, {
              triggerSource: "smtp_error_auto_sweep",
              overrides
            }).catch(() => {});
          }
        } catch (recFbErr) {
          console.warn("[ReceptionFallback] Erro no fallback automático após falha SMTP:", recFbErr?.message || recFbErr);
        }
      }
      // Se a rejeição SMTP indicar endereço/domínio de destinatário inexistente em e-mail de hóspede, avisa via WhatsApp
      const normRecip = String(recipient || "").trim().toLowerCase();
      const acceptedLower = Array.isArray(err?.accepted)
        ? err.accepted.map(e => String(e || "").replace(/.*<([^>]+)>.*/, "$1").trim().toLowerCase()).filter(Boolean)
        : [];
      const rejectedLower = Array.isArray(err?.rejected)
        ? err.rejected.map(e => String(e || "").replace(/.*<([^>]+)>.*/, "$1").trim().toLowerCase()).filter(Boolean)
        : [];
      const recipientActuallyRejected =
        normRecip &&
        !acceptedLower.includes(normRecip) &&
        (rejectedLower.length === 0 || rejectedLower.includes(normRecip));

      if (recipientActuallyRejected && isRecipientDeliverySmtpError(err, normRecip) && db && reservationId && String(reservationId) !== "0") {
        try {
          const resKeyUpper = String(reservationId).trim().toUpperCase();
          const matchedRes = (db.reservations || []).find(
            r => r && (String(r.id) === String(reservationId) || String(r.code || "").trim().toUpperCase() === resKeyUpper)
          );
          if (matchedRes && !isInternalOrThirdPartyOperationalEmail(logEntry, matchedRes, db)) {
            await notifyGuestInvalidEmailViaWhatsApp({
              db,
              saveDatabase,
              reservation: matchedRes,
              invalidEmail: normRecip,
              reason: err.message || String(err),
              source: "smtp_rejection",
              overrides
            });
          }
        } catch (alertErr) {
          console.warn("[MailService] Falha ao notificar hóspede sobre erro de e-mail via WhatsApp:", alertErr?.message || alertErr);
        }
      }
    } finally {
      if (typeof saveDatabase === "function") saveDatabase();
    }
  });

  return logEntry;
}

/**
 * Reenvia um e-mail com falha
 */
export async function resendEmailAsync({ db, saveDatabase, communicationId }) {
  const comm = (db.reservationCommunications || []).find(c => c.id === communicationId);
  if (!comm) {
    throw new Error("Registro de comunicação não encontrado.");
  }

  comm.status = "pending";
  comm.metadata = comm.metadata || {};
  comm.metadata.attempts = (comm.metadata.attempts || 1) + 1;
  comm.metadata.lastRetryAt = new Date().toISOString();
  if (typeof saveDatabase === "function") saveDatabase();

  let resolvedResendAttachments = [];
  try {
    const config = getSmtpConfig(db);
    if (!config.user || !config.pass) {
      throw new Error("Credenciais de SMTP ausentes.");
    }

    const transporter = createTransporter(db);
    const mailOptions = {
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: comm.recipient,
      ...(comm.cc || comm.metadata?.cc ? { cc: comm.cc || comm.metadata?.cc } : {}),
      subject: comm.subject,
      html: comm.body
    };

    // Re-resolve anexos caso seja uma comunicação vinculada a reserva
    if (comm.reservation_id && String(comm.reservation_id) !== "0") {
      const resItem = (db?.reservations || []).find(r => String(r.id) === String(comm.reservation_id) || r.code === comm.reservation_id);
      if (resItem) {
        const atts = await ensureReservationAttachmentsReady({ reservation: resItem, db }).catch(() =>
          resolveReservationAttachments({ reservation: resItem, db })
        );
        if (Array.isArray(atts) && atts.length > 0) {
          resolvedResendAttachments = atts;
          mailOptions.attachments = atts;
        }
      }
    }

    const info = await transporter.sendMail(mailOptions);
    comm.status = "sent";
    comm.metadata.messageId = info.messageId;
    comm.metadata.sentAt = new Date().toISOString();
    delete comm.metadata.error;
    if (isEmailAddressedToReception(comm, db) && isReceptionEmailFallbackActive(db)) {
      await forwardReceptionEmailToWhatsApp({
        db,
        saveDatabase,
        comm,
        rawAttachments: resolvedResendAttachments,
        isRetroactive: false,
        triggerSource: "resend_active_fallback"
      }).catch(() => {});
    }
    if (typeof saveDatabase === "function") saveDatabase();
    return { ok: true, message: "E-mail reenviado com sucesso!" };
  } catch (err) {
    comm.status = "failed";
    comm.metadata.error = err.message;
    comm.metadata.failedAt = new Date().toISOString();
    if (isEmailAddressedToReception(comm, db)) {
      recordReceptionEmailDeliveryIssue(db, saveDatabase, {
        source: "smtp_resend_error",
        reason: err.message || String(err),
        subject: comm.subject,
        recipient: comm.recipient
      });
      if (ensureReceptionEmailFallbackState(db).enabled !== false) {
        await forwardReceptionEmailToWhatsApp({
          db,
          saveDatabase,
          comm,
          rawAttachments: resolvedResendAttachments,
          isRetroactive: false,
          triggerSource: "resend_smtp_failure_fallback"
        }).catch(() => {});
      }
    }
    if (typeof saveDatabase === "function") saveDatabase();
    return { ok: false, error: err.message };
  }
}

/**
 * Resolve todos os anexos oficiais de uma reserva para envio à recepção:
 * 1. Ficha Nacional de Registro de Hóspedes (FNRH em PDF), se gerada no pré-check-in digital.
 * 2. Documento(s) oficial(is) com foto anexado(s) pelo hóspede (no motor de reservas, CRM ou PMS).
 *    Mesmo se a pessoa NÃO fizer o check-in digital, o documento oficial anexado na reserva é enviado!
 */
export function resolveReservationAttachments({ reservation, guest = null, db = null }) {
  if (!reservation) return [];
  const attachments = [];
  const resCode = reservation.code || reservation.id || "RES";
  const primaryName = (reservation.guestName || guest?.name || "Hospede")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/gi, "")
    .trim()
    .replace(/\s+/g, "_");

  // Helper para resolver caminho físico da FNRH nos diretórios seguros e legados
  const candidateFnrhDirs = [
    path.join(__dirname, "secure_uploads", "fnrh_documents"),
    path.join(__dirname, "uploads", "fnrh_documents"),
    path.join(__dirname, "secure_fnrh"),
    path.join(__dirname, "fnrh_docs"),
    path.resolve(process.cwd(), "artifacts/api-server/secure_uploads/fnrh_documents"),
    path.resolve(process.cwd(), "scripts/secure_uploads/fnrh_documents"),
    path.resolve(process.cwd(), "secure_uploads/fnrh_documents"),
    path.resolve(process.cwd(), "uploads/fnrh_documents"),
    path.resolve(process.cwd(), "artifacts/api-server/secure_fnrh"),
    path.resolve(process.cwd(), "scripts/secure_fnrh")
  ].filter((d, i, arr) => arr.indexOf(d) === i);

  function findFnrhPath({ filePath, fileName, uuid, code, id, cpf }) {
    // A. Caminho explícito existente
    if (filePath && typeof filePath === "string" && fs.existsSync(filePath)) {
      return filePath;
    }

    // B. Nomes de arquivo candidatos
    const candidateNames = [];
    if (filePath && typeof filePath === "string") candidateNames.push(path.basename(filePath));
    if (fileName && typeof fileName === "string") candidateNames.push(path.basename(fileName));
    if (uuid && typeof uuid === "string") {
      candidateNames.push(`FNRH_${uuid}.pdf`);
      candidateNames.push(`fnrh_${uuid}.pdf`);
      candidateNames.push(`Ficha_Checkin_${uuid}.pdf`);
      candidateNames.push(`ficha_checkin_${uuid}.pdf`);
    }
    if (code) {
      candidateNames.push(`FNRH_${code}.pdf`);
      candidateNames.push(`fnrh_${code}.pdf`);
      candidateNames.push(`Ficha_Checkin_${code}.pdf`);
      candidateNames.push(`ficha_checkin_${code}.pdf`);
    }
    if (id) {
      candidateNames.push(`FNRH_${id}.pdf`);
      candidateNames.push(`fnrh_${id}.pdf`);
      candidateNames.push(`Ficha_Checkin_${id}.pdf`);
      candidateNames.push(`ficha_checkin_${id}.pdf`);
    }

    // Checa nomes diretos em cada diretório candidato
    for (const dir of candidateFnrhDirs) {
      if (!fs.existsSync(dir)) continue;
      for (const name of candidateNames) {
        const full = path.join(dir, name);
        if (fs.existsSync(full)) return full;
      }
    }

    // C. Varredura por padrão de arquivo nos diretórios (UUID ou código/ID da reserva)
    for (const dir of candidateFnrhDirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const files = fs.readdirSync(dir);
        if (uuid && typeof uuid === "string") {
          const matchUuid = files.find(f => f.includes(uuid) && f.endsWith(".pdf"));
          if (matchUuid) return path.join(dir, matchUuid);
        }
        const cleanId = id ? String(id).toLowerCase() : null;
        const cleanCode = code ? String(code).toLowerCase() : null;
        const cleanCpf = cpf ? String(cpf).replace(/\D/g, "") : null;

        // Se CPF estiver disponível, tenta primeiro casamento estrito com id + cpf
        if (cleanCpf && (cleanId || cleanCode)) {
          const cpfMatches = files.filter(f => {
            if (!f.endsWith(".pdf")) return false;
            const lower = f.toLowerCase();
            if (cleanId && (lower.startsWith(`fnrh_${cleanId}_${cleanCpf}_`) || lower.startsWith(`ficha_checkin_${cleanId}_${cleanCpf}_`) || lower.startsWith(`ficha_${cleanId}_`))) return true;
            if (cleanCode && (lower.startsWith(`fnrh_${cleanCode}_${cleanCpf}_`) || lower.startsWith(`ficha_checkin_${cleanCode}_${cleanCpf}_`) || lower.startsWith(`ficha_${cleanCode}_`))) return true;
            return false;
          });
          if (cpfMatches.length > 0) {
            cpfMatches.sort((a, b) => {
              try {
                return fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs;
              } catch {
                return 0;
              }
            });
            return path.join(dir, cpfMatches[0]);
          }
        }

        const matchingFiles = files.filter(f => {
          if (!f.endsWith(".pdf")) return false;
          const lower = f.toLowerCase();
          if (cleanId && (lower.startsWith(`fnrh_${cleanId}_`) || lower.startsWith(`fnrh_${cleanId}.`) || lower.startsWith(`ficha_checkin_${cleanId}_`) || lower.startsWith(`ficha_${cleanId}_`))) return true;
          if (cleanCode && (lower.startsWith(`fnrh_${cleanCode}_`) || lower.startsWith(`fnrh_${cleanCode}.`) || lower.startsWith(`ficha_checkin_${cleanCode}_`) || lower.startsWith(`ficha_${cleanCode}_`))) return true;
          return false;
        });

        if (matchingFiles.length > 0) {
          // Ordena pelo mtime mais recente para garantir a versão mais recente gerada
          matchingFiles.sort((a, b) => {
            try {
              const statA = fs.statSync(path.join(dir, a)).mtimeMs;
              const statB = fs.statSync(path.join(dir, b)).mtimeMs;
              return statB - statA;
            } catch {
              return 0;
            }
          });
          return path.join(dir, matchingFiles[0]);
        }
      } catch (_) {}
    }

    return null;
  }

  // 1. FNRH em PDF do Titular (se pré-checkin digital concluído)
  const titularGuestRecord = Array.isArray(reservation.guests) ? reservation.guests.find(g => Number(g.index) === 1) || reservation.guests[0] : null;
  const titularUuid = titularGuestRecord?.fnrhDocumentUuid || reservation.fnrhDocumentUuid || guest?.fnrhDocumentUuid;
  let titularAuditDoc = null;
  if (Array.isArray(db?.fnrhAuditDocuments) && (titularUuid || reservation.id || resCode)) {
    titularAuditDoc = db.fnrhAuditDocuments.find(a => (titularUuid && a.documentUuid === titularUuid) || String(a.reservationId) === String(reservation.id) || a.reservationCode === resCode);
  }
  let titularAuditFileName = titularGuestRecord?.fnrhFileName || reservation.fnrhFileName || titularGuestRecord?.fnrhAuditTrail?.fileName || reservation.fnrhAuditTrail?.fileName || guest?.fnrhAuditTrail?.fileName || titularAuditDoc?.fileName;

  const titularFnrhPath = findFnrhPath({
    filePath: titularGuestRecord?.fnrhFilePath || reservation.fnrhFilePath || guest?.fnrhFilePath,
    fileName: titularAuditFileName,
    uuid: titularUuid,
    code: resCode,
    id: reservation.id,
    cpf: titularGuestRecord?.cpf || titularGuestRecord?.document || reservation.guestDocument || guest?.document
  });

  const titularR2Url = titularGuestRecord?.r2Url || titularGuestRecord?.fnrhR2Url || (typeof titularGuestRecord?.fnrhPdfUrl === "string" && titularGuestRecord.fnrhPdfUrl.startsWith("http") ? titularGuestRecord.fnrhPdfUrl : null) || reservation?.r2Url || reservation?.fnrhR2Url || (typeof reservation?.fnrhPdfUrl === "string" && reservation.fnrhPdfUrl.startsWith("http") ? reservation.fnrhPdfUrl : null) || titularAuditDoc?.r2Url;

  if (titularFnrhPath) {
    attachments.push({
      filename: `FNRH_${resCode}_${primaryName}.pdf`,
      path: titularFnrhPath
    });
  } else if (titularR2Url) {
    attachments.push({
      filename: `FNRH_${resCode}_${primaryName}.pdf`,
      path: titularR2Url
    });
  }

  // FNRHs de Co-hóspedes (se houverem concluído pré-checkin digital)
  if (Array.isArray(reservation.guests)) {
    reservation.guests.forEach((g, idx) => {
      if (Number(g.index) === 1 || (idx === 0 && !g.index)) return;
      const gUuid = g.fnrhDocumentUuid;
      let coAuditDoc = null;
      if (Array.isArray(db?.fnrhAuditDocuments) && gUuid) {
        coAuditDoc = db.fnrhAuditDocuments.find(a => a.documentUuid === gUuid);
      }
      let gAuditFileName = g.fnrhFileName || g.fnrhAuditTrail?.fileName || coAuditDoc?.fileName;
      const coGuestFnrhPath = findFnrhPath({
        filePath: g.fnrhFilePath,
        fileName: gAuditFileName,
        uuid: gUuid,
        code: resCode,
        id: reservation.id,
        cpf: g.cpf || g.document
      });
      const coGuestR2Url = g.r2Url || g.fnrhR2Url || (typeof g.fnrhPdfUrl === "string" && g.fnrhPdfUrl.startsWith("http") ? g.fnrhPdfUrl : null) || coAuditDoc?.r2Url;

      const gName = (g.name || `Hospede_${idx + 1}`)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s-]/gi, "")
        .trim()
        .replace(/\s+/g, "_");

      if (coGuestFnrhPath && !attachments.some(a => a.path === coGuestFnrhPath)) {
        attachments.push({
          filename: `FNRH_${resCode}_${gName}.pdf`,
          path: coGuestFnrhPath
        });
      } else if (coGuestR2Url && !attachments.some(a => a.path === coGuestR2Url)) {
        attachments.push({
          filename: `FNRH_${resCode}_${gName}.pdf`,
          path: coGuestR2Url
        });
      }
    });
  }

  // 2. Documentos Oficiais anexados (Titular e Co-hóspedes)
  const docSources = [];

  // Documento gravado diretamente na reserva
  if (reservation.docPhotoPath) {
    docSources.push({ raw: reservation.docPhotoPath, name: primaryName, isPath: true });
  }
  if (reservation.docPhotoUrl) {
    docSources.push({ raw: reservation.docPhotoUrl, name: primaryName });
  } else if (reservation.documentPhotoUrl) {
    docSources.push({ raw: reservation.documentPhotoUrl, name: primaryName });
  }

  // Documento gravado no hóspede titular
  const titularGuest = guest || (db?.guests || []).find(g => 
    (reservation.guestId && g.id === reservation.guestId) ||
    (reservation.guestDocument && (g.documentNumber || g.document) === reservation.guestDocument)
  );
  if (titularGuest?.docPhotoUrl) {
    docSources.push({ raw: titularGuest.docPhotoUrl, name: primaryName });
  }

  // Documentos de hóspedes cadastrados no array reservation.guests
  if (Array.isArray(reservation.guests)) {
    reservation.guests.forEach((g, idx) => {
      const gName = (g.name || `Hospede_${idx + 1}`)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s-]/gi, "")
        .trim()
        .replace(/\s+/g, "_");
      if (g.docPhotoPath) {
        docSources.push({ raw: g.docPhotoPath, name: gName, isPath: true });
      }
      if (g.docPhotoUrl) {
        docSources.push({ raw: g.docPhotoUrl, name: gName });
      }
    });
  }

  // Deduplica por valor do arquivo/URL para não enviar repetido
  const seenRaw = new Set();
  let docCount = 0;

  for (const src of docSources) {
    if (!src.raw || typeof src.raw !== "string") continue;
    const trimmed = src.raw.trim();
    if (!trimmed || seenRaw.has(trimmed)) continue;
    seenRaw.add(trimmed);
    docCount++;

    const docSuffix = docCount > 1 ? `_${docCount}` : "";

    // Caso A: Arquivo em disco
    const isExplicitPath = Boolean(src.isPath || trimmed.startsWith("/") || trimmed.match(/^[a-zA-Z]:[\\\/]/));
    let resolvedDiskPath = null;
    if (isExplicitPath && fs.existsSync(trimmed)) {
      resolvedDiskPath = trimmed;
    } else {
      const uploadsDir = path.join(__dirname, "uploads");
      const localUploadPath = path.join(uploadsDir, path.basename(trimmed));
      if (fs.existsSync(localUploadPath)) {
        resolvedDiskPath = localUploadPath;
      }
    }

    if (resolvedDiskPath) {
      const ext = path.extname(resolvedDiskPath).replace(".", "") || "pdf";
      attachments.push({
        filename: `Documento_${src.name}${docSuffix}.${ext}`,
        path: resolvedDiskPath
      });
      continue;
    }

    // Caso B: Base64 data URI
    if (trimmed.startsWith("data:")) {
      const match = trimmed.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mime = match[1];
        const rawB64 = match[2];
        const ext = mime.includes("pdf") ? "pdf" : mime.includes("png") ? "png" : mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : "webp";
        attachments.push({
          filename: `Documento_${src.name}${docSuffix}.${ext}`,
          content: Buffer.from(rawB64, "base64"),
          contentType: mime
        });
        continue;
      }
    }

    // Caso C: URL Web (Cloudflare R2 ou CDN externa)
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      let ext = "pdf";
      const cleanUrl = trimmed.split("?")[0].toLowerCase();
      if (cleanUrl.endsWith(".png")) ext = "png";
      else if (cleanUrl.endsWith(".jpg") || cleanUrl.endsWith(".jpeg")) ext = "jpg";
      else if (cleanUrl.endsWith(".webp")) ext = "webp";
      else if (cleanUrl.endsWith(".pdf")) ext = "pdf";

      attachments.push({
        filename: `Documento_${src.name}${docSuffix}.${ext}`,
        path: trimmed
      });
      continue;
    }
  }

  return attachments;
}

/**
 * Garante que os arquivos físicos ou URLs R2 da FNRH estejam disponíveis antes do disparo do e-mail.
 * Caso o arquivo tenha sido apagado pelo reinício do Render e não haja URL R2, recompila on-the-fly.
 */
export async function ensureReservationAttachmentsReady({ reservation, guest = null, db = null, appOrigin = "https://corpflats.com.br" }) {
  if (!reservation) return resolveReservationAttachments({ reservation, guest, db });

  // 1. Titular
  const titularGuestRecord = Array.isArray(reservation.guests) ? reservation.guests.find(g => Number(g.index) === 1) || reservation.guests[0] : null;
  const isTitularDone = Boolean(
    !reservation.needsReSignature &&
    !titularGuestRecord?.needsReSignature &&
    (reservation.fnhrCompleted || titularGuestRecord?.hasCompletedCheckin || reservation.fnrhDocumentUuid || titularGuestRecord?.fnrhDocumentUuid)
  );

  if (isTitularDone) {
    const hasDisk = titularGuestRecord?.fnrhFilePath && fs.existsSync(titularGuestRecord.fnrhFilePath);
    const hasR2 = Boolean(titularGuestRecord?.r2Url || titularGuestRecord?.fnrhR2Url || (typeof titularGuestRecord?.fnrhPdfUrl === "string" && titularGuestRecord.fnrhPdfUrl.startsWith("http")) || reservation.r2Url || reservation.fnrhR2Url || (typeof reservation.fnrhPdfUrl === "string" && reservation.fnrhPdfUrl.startsWith("http")));
    if (!hasDisk && !hasR2) {
      try {
        console.log(`[MailService 🔄] Arquivo FNRH do titular ausente em disco e sem R2. Reconstruindo on-the-fly para ${reservation.code || reservation.id}...`);
        const rebuilt = await rebuildFnrhPdfOnTheFly({ reservation, guest: titularGuestRecord || guest, appOrigin, db });
        if (rebuilt) {
          if (titularGuestRecord) {
            titularGuestRecord.fnrhFilePath = rebuilt.filePath;
            titularGuestRecord.fnrhFileName = rebuilt.fileName;
            titularGuestRecord.fnrhPdfUrl = rebuilt.fileUrl;
            if (rebuilt.r2Url) titularGuestRecord.r2Url = rebuilt.r2Url;
          }
          reservation.fnrhFilePath = rebuilt.filePath;
          reservation.fnrhFileName = rebuilt.fileName;
          reservation.fnrhPdfUrl = rebuilt.fileUrl;
          if (rebuilt.r2Url) reservation.r2Url = rebuilt.r2Url;
        }
      } catch (err) {
        console.warn("[MailService] Falha ao reconstruir FNRH do titular on-the-fly:", err.message);
      }
    }
  }

  // 2. Co-hóspedes
  if (Array.isArray(reservation.guests)) {
    for (let idx = 0; idx < reservation.guests.length; idx++) {
      const g = reservation.guests[idx];
      if (Number(g.index) === 1 || (idx === 0 && !g.index)) continue;
      const isCoGuestDone = Boolean(!g.needsReSignature && (g.hasCompletedCheckin || g.fnrhDocumentUuid));
      if (isCoGuestDone) {
        const hasDisk = g.fnrhFilePath && fs.existsSync(g.fnrhFilePath);
        const hasR2 = Boolean(g.r2Url || g.fnrhR2Url || (typeof g.fnrhPdfUrl === "string" && g.fnrhPdfUrl.startsWith("http")));
        if (!hasDisk && !hasR2) {
          try {
            console.log(`[MailService 🔄] Arquivo FNRH do co-hóspede ${g.name} ausente em disco e sem R2. Reconstruindo on-the-fly...`);
            const rebuilt = await rebuildFnrhPdfOnTheFly({ reservation, guest: g, appOrigin, db });
            if (rebuilt) {
              g.fnrhFilePath = rebuilt.filePath;
              g.fnrhFileName = rebuilt.fileName;
              g.fnrhPdfUrl = rebuilt.fileUrl;
              if (rebuilt.r2Url) g.r2Url = rebuilt.r2Url;
            }
          } catch (err) {
            console.warn(`[MailService] Falha ao reconstruir FNRH do co-hóspede ${g.name} on-the-fly:`, err.message);
          }
        }
      }
    }
  }

  return resolveReservationAttachments({ reservation, guest, db });
}

// ══════════════════════════════════════════════════════════════════════════════
// VALIDAÇÃO DE E-MAIL DE HÓSPEDE, AVISO VIA WHATSAPP E REENVIO DE PENDENTES
// ══════════════════════════════════════════════════════════════════════════════

const COMMON_EMAIL_DOMAIN_TYPOS = {
  "gamil.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "gmail.cmo": "gmail.com",
  "gmail.cim": "gmail.com",
  "gmail.vom": "gmail.com",
  "gmail.xom": "gmail.com",
  "gmail.comm": "gmail.com",
  "gmail.com.br": "gmail.com",
  "gmaill.com": "gmail.com",
  "gimail.com": "gmail.com",
  "gemail.com": "gmail.com",
  "gmailcom": "gmail.com",
  "hotmal.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotnail.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "homtail.com": "hotmail.com",
  "htmail.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotmail.cm": "hotmail.com",
  "hotmail.comm": "hotmail.com",
  "hotmailcom": "hotmail.com",
  "hotmal.com.br": "hotmail.com.br",
  "hotmai.com.br": "hotmail.com.br",
  "hotnail.com.br": "hotmail.com.br",
  "hotmail.con.br": "hotmail.com.br",
  "outlok.com": "outlook.com",
  "oulook.com": "outlook.com",
  "outllok.com": "outlook.com",
  "outloook.com": "outlook.com",
  "outlook.con": "outlook.com",
  "outlook.cm": "outlook.com",
  "outlook.comm": "outlook.com",
  "outlookcom": "outlook.com",
  "outlok.com.br": "outlook.com.br",
  "oulook.com.br": "outlook.com.br",
  "outlook.con.br": "outlook.com.br",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yhoo.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yahoo.cm": "yahoo.com",
  "yahoo.comm": "yahoo.com",
  "yaho.com.br": "yahoo.com.br",
  "yahooo.com.br": "yahoo.com.br",
  "yahoo.con.br": "yahoo.com.br",
  "iclod.com": "icloud.com",
  "icoud.com": "icloud.com",
  "iclould.com": "icloud.com",
  "icloud.con": "icloud.com",
  "icloud.cm": "icloud.com",
  "icloud.com.br": "icloud.com",
  "uol.con.br": "uol.com.br",
  "uoll.com.br": "uol.com.br",
  "bol.con.br": "bol.com.br",
  "boll.com.br": "bol.com.br",
  "terra.con.br": "terra.com.br",
  "globo.con": "globo.com"
};

const KNOWN_VALID_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.com.br",
  "outlook.com",
  "outlook.com.br",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.com.br",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "uol.com.br",
  "bol.com.br",
  "terra.com.br",
  "globo.com",
  "ig.com.br",
  "r7.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
  "corpflats.com.br"
]);

const domainDnsCache = new Map();
const inFlightInvalidEmailAlerts = new Set();

function withTimeout(promise, ms) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error("DNS_TIMEOUT");
      err.code = "ETIMEOUT";
      reject(err);
    }, ms);
    if (timer && typeof timer.unref === "function") timer.unref();
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Valida sintaxe, erros comuns de digitação de domínio e registros DNS (MX / A / AAAA)
 * do endereço de e-mail informado pelo hóspede.
 */
export async function validateGuestEmailAddress(rawEmail, options = {}) {
  const {
    checkDns = true,
    timeoutMs = 2500,
    stripTrailingPunctuation = false,
    dnsResolver = null
  } = options;

  let cleaned = String(rawEmail ?? "")
    .trim()
    .replace(/^[\s"'<>]+|[\s"'<>]+$/g, "");
  if (stripTrailingPunctuation) {
    cleaned = cleaned.replace(/[.,;:!?]+$/g, "").trim();
  }
  const normalizedEmail = cleaned.toLowerCase();

  if (!normalizedEmail) {
    return {
      valid: false,
      isEmpty: true,
      normalizedEmail: "",
      reason: "empty",
      message: "Nenhum endereço de e-mail foi informado.",
      suggestedEmail: null
    };
  }

  if (/\s/.test(normalizedEmail)) {
    const compact = normalizedEmail.replace(/\s+/g, "");
    const compactCheck = compact.includes("@") ? await validateGuestEmailAddress(compact, { ...options, checkDns: false }) : null;
    return {
      valid: false,
      isEmpty: false,
      normalizedEmail,
      reason: "contains_spaces",
      message: "O endereço de e-mail contém espaços em branco.",
      suggestedEmail: compactCheck?.valid ? compactCheck.normalizedEmail : (compactCheck?.suggestedEmail || null)
    };
  }

  const atParts = normalizedEmail.split("@");
  if (atParts.length !== 2) {
    return {
      valid: false,
      isEmpty: false,
      normalizedEmail,
      reason: atParts.length < 2 ? "missing_at" : "multiple_at",
      message: "Formato de e-mail inválido (verifique o símbolo '@').",
      suggestedEmail: null
    };
  }

  const [localPart, rawDomain] = atParts;

  if (
    !localPart ||
    localPart.length > 64 ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(localPart)
  ) {
    return {
      valid: false,
      isEmpty: false,
      normalizedEmail,
      reason: "invalid_local_part",
      message: "A parte antes do '@' no e-mail possui caracteres ou formato inválido.",
      suggestedEmail: null
    };
  }

  if (!rawDomain || rawDomain.length > 253) {
    return {
      valid: false,
      isEmpty: false,
      normalizedEmail,
      reason: "invalid_domain",
      message: "O domínio após o '@' no e-mail está ausente ou inválido.",
      suggestedEmail: null
    };
  }

  // Checa erros conhecidos de digitação de domínio antes mesmo da checagem estrita de ponto
  if (COMMON_EMAIL_DOMAIN_TYPOS[rawDomain]) {
    const fixedDomain = COMMON_EMAIL_DOMAIN_TYPOS[rawDomain];
    return {
      valid: false,
      isEmpty: false,
      normalizedEmail,
      reason: "domain_typo",
      message: `O domínio '@${rawDomain}' parece conter um erro de digitação.`,
      suggestedEmail: `${localPart}@${fixedDomain}`
    };
  }

  if (rawDomain.endsWith(".") && rawDomain.length > 4) {
    const trimmedDomain = rawDomain.replace(/\.+$/g, "");
    const fixedDomain = COMMON_EMAIL_DOMAIN_TYPOS[trimmedDomain] || trimmedDomain;
    return {
      valid: false,
      isEmpty: false,
      normalizedEmail,
      reason: "trailing_dot",
      message: "O endereço de e-mail termina com um ponto indevido.",
      suggestedEmail: trimmedDomain.includes(".") ? `${localPart}@${fixedDomain}` : null
    };
  }

  if (
    rawDomain.startsWith(".") ||
    rawDomain.includes("..") ||
    !rawDomain.includes(".")
  ) {
    return {
      valid: false,
      isEmpty: false,
      normalizedEmail,
      reason: "invalid_domain_format",
      message: `O domínio '@${rawDomain}' está incompleto ou mal formatado.`,
      suggestedEmail: null
    };
  }

  // Checa sufixos de digitação comuns (.con, .con.br, .comm, .cmo)
  if (/\.con\.br$/i.test(rawDomain)) {
    return {
      valid: false,
      isEmpty: false,
      normalizedEmail,
      reason: "domain_typo",
      message: `O domínio '@${rawDomain}' parece conter erro na terminação (.con.br).`,
      suggestedEmail: `${localPart}@${rawDomain.replace(/\.con\.br$/i, ".com.br")}`
    };
  }
  if (/\.(?:con|comm|cmo)$/i.test(rawDomain)) {
    return {
      valid: false,
      isEmpty: false,
      normalizedEmail,
      reason: "domain_typo",
      message: `O domínio '@${rawDomain}' parece conter erro na terminação.`,
      suggestedEmail: `${localPart}@${rawDomain.replace(/\.(?:con|comm|cmo)$/i, ".com")}`
    };
  }

  const domainLabels = rawDomain.split(".");
  const tld = domainLabels[domainLabels.length - 1];
  const allLabelsValid = domainLabels.every(lbl => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(lbl));
  const tldValid = /^[a-z]{2,24}$/i.test(tld);

  if (!allLabelsValid || !tldValid) {
    return {
      valid: false,
      isEmpty: false,
      normalizedEmail,
      reason: "invalid_domain_syntax",
      message: `O domínio '@${rawDomain}' possui formato inválido.`,
      suggestedEmail: null
    };
  }

  if (!checkDns) {
    return {
      valid: true,
      isEmpty: false,
      normalizedEmail,
      reason: null,
      message: null,
      suggestedEmail: null
    };
  }

  if (KNOWN_VALID_EMAIL_DOMAINS.has(rawDomain) && !dnsResolver) {
    return {
      valid: true,
      isEmpty: false,
      normalizedEmail,
      reason: null,
      message: null,
      suggestedEmail: null
    };
  }

  const nowMs = Date.now();
  if (!dnsResolver && domainDnsCache.has(rawDomain)) {
    const cached = domainDnsCache.get(rawDomain);
    if (cached.expiresAt > nowMs) {
      return cached.valid
        ? { valid: true, isEmpty: false, normalizedEmail, reason: null, message: null, suggestedEmail: null }
        : {
            valid: false,
            isEmpty: false,
            normalizedEmail,
            reason: cached.reason || "domain_not_found",
            message: cached.message || `O domínio '@${rawDomain}' não existe ou não recebe e-mails.`,
            suggestedEmail: null
          };
    }
    domainDnsCache.delete(rawDomain);
  }

  const resolver = dnsResolver || dns.promises;

  try {
    const mxRecords = await withTimeout(resolver.resolveMx(rawDomain), timeoutMs);
    if (Array.isArray(mxRecords)) {
      const validMx = mxRecords.filter(r => r && typeof r.exchange === "string" && r.exchange.trim() && r.exchange.trim() !== ".");
      if (validMx.length > 0) {
        if (!dnsResolver) {
          domainDnsCache.set(rawDomain, { valid: true, expiresAt: nowMs + 30 * 60 * 1000 });
        }
        return { valid: true, isEmpty: false, normalizedEmail, reason: null, message: null, suggestedEmail: null };
      }
      if (mxRecords.length > 0 && validMx.length === 0) {
        const msg = `O domínio '@${rawDomain}' está configurado para não receber e-mails.`;
        if (!dnsResolver) {
          domainDnsCache.set(rawDomain, { valid: false, reason: "domain_null_mx", message: msg, expiresAt: nowMs + 10 * 60 * 1000 });
        }
        return { valid: false, isEmpty: false, normalizedEmail, reason: "domain_null_mx", message: msg, suggestedEmail: null };
      }
    }
  } catch (mxErr) {
    const code = String(mxErr?.code || "").toUpperCase();
    if (code === "ENOTFOUND") {
      const msg = `O domínio '@${rawDomain}' não existe.`;
      if (!dnsResolver) {
        domainDnsCache.set(rawDomain, { valid: false, reason: "domain_not_found", message: msg, expiresAt: nowMs + 10 * 60 * 1000 });
      }
      return { valid: false, isEmpty: false, normalizedEmail, reason: "domain_not_found", message: msg, suggestedEmail: null };
    }
    if (code === "ENODATA") {
      try {
        const resolveAddrPromises = [];
        if (typeof resolver.resolve4 === "function") resolveAddrPromises.push(resolver.resolve4(rawDomain));
        if (typeof resolver.resolve6 === "function") resolveAddrPromises.push(resolver.resolve6(rawDomain));
        if (resolveAddrPromises.length > 0) {
          const ips = await withTimeout(Promise.any(resolveAddrPromises), timeoutMs);
          if (Array.isArray(ips) && ips.length > 0) {
            if (!dnsResolver) {
              domainDnsCache.set(rawDomain, { valid: true, expiresAt: nowMs + 30 * 60 * 1000 });
            }
            return { valid: true, isEmpty: false, normalizedEmail, reason: null, message: null, suggestedEmail: null };
          }
        }
        const msg = `O domínio '@${rawDomain}' não possui servidor de e-mail válido.`;
        if (!dnsResolver) {
          domainDnsCache.set(rawDomain, { valid: false, reason: "domain_no_mail_server", message: msg, expiresAt: nowMs + 10 * 60 * 1000 });
        }
        return { valid: false, isEmpty: false, normalizedEmail, reason: "domain_no_mail_server", message: msg, suggestedEmail: null };
      } catch (addrErr) {
        const subErrors = Array.isArray(addrErr?.errors) ? addrErr.errors : [addrErr];
        const allDefinitiveNotFound = subErrors.length > 0 && subErrors.every(e => {
          const c = String(e?.code || "").toUpperCase();
          return c === "ENOTFOUND" || c === "ENODATA";
        });
        if (allDefinitiveNotFound) {
          const msg = `O domínio '@${rawDomain}' não existe ou não possui servidor de e-mail.`;
          if (!dnsResolver) {
            domainDnsCache.set(rawDomain, { valid: false, reason: "domain_no_mail_server", message: msg, expiresAt: nowMs + 10 * 60 * 1000 });
          }
          return { valid: false, isEmpty: false, normalizedEmail, reason: "domain_no_mail_server", message: msg, suggestedEmail: null };
        }
      }
    }
    // Em falhas transitórias de rede/timeout DNS (ESERVFAIL, ETIMEOUT, etc.), opera em fail-open para nunca acusar falso positivo
    return { valid: true, isEmpty: false, normalizedEmail, reason: null, message: null, suggestedEmail: null, dnsSkipped: true };
  }

  return { valid: true, isEmpty: false, normalizedEmail, reason: null, message: null, suggestedEmail: null };
}

/**
 * Identifica se um erro retornado pelo servidor SMTP refere-se de forma inequívoca a destinatário/domínio inválido
 * (ignorando erros de remetente, rate-limit, anti-spam, relay, política do servidor de envio ou conexão).
 */
export function isRecipientDeliverySmtpError(err, recipientEmail = "") {
  if (!err) return false;
  const rawMsg = `${err.message || ""} ${err.response || ""} ${err.code || ""}`;
  if (
    /SMTP n[aã]o configurado|Credenciais de SMTP|535\b|5\.7\.\d+|5\.4\.6|Authentication Failed|Access Restricted|Relaying disallowed|relay not permitted|unusual sending|rate limit|sending limit|daily limit|quota|too many|spam|unsolicited|sender|from address|policy|blocked|blacklist|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ESOCKET|EAI_AGAIN|getaddrinfo\s+ENOTFOUND|ENOTFOUND\s+smtp\./i.test(
      rawMsg
    )
  ) {
    return false;
  }
  const respCode = Number(err.responseCode || 0);
  if ([510, 511, 512, 513].includes(respCode)) {
    return true;
  }
  return /\b(?:510|511|512|513|5\.1\.[1236]|5\.1\.10)\b|user unknown|invalid recipient|bad recipient|recipient address rejected|no such user|mailbox unavailable|mailbox not found|bad recipient address syntax|address syntax|domain not found|recipient.*does not exist|does not exist.*recipient|user.*does not exist|account.*does not exist|invalid mailbox|unrouteable address/i.test(
    rawMsg
  );
}

/**
 * Garante que comunicações internas (portaria, garagem, agências B2B) nunca sejam tratadas como e-mail pessoal do hóspede.
 */
export function isInternalOrThirdPartyOperationalEmail(commOrRecipient, reservation = null, db = null) {
  const comm = typeof commOrRecipient === "object" && commOrRecipient !== null ? commOrRecipient : null;
  const recipient = String(comm ? comm.recipient : commOrRecipient || "").trim().toLowerCase();
  const trigger = String(comm?.metadata?.trigger || comm?.triggerEvent || "").trim().toLowerCase();
  const recipientType = String(comm?.metadata?.recipientType || "").trim().toLowerCase();

  if (recipientType === "reception" || recipientType === "garage" || recipientType === "agency" || recipientType === "requester") {
    return true;
  }

  const internalTriggers = new Set([
    "morning_checkin_07h",
    "pre_checkin",
    "re_signature_checkin",
    "checkin_confirmed",
    "self_checkin_arrival_fallback",
    "reception_manual_checkin_fallback",
    "pre_checkin_vehicle",
    "sofia_whatsapp_vehicle",
    "sofia_whatsapp_vehicle_retrigger",
    "b2b_agency_credential_request",
    "reservation_created_reception",
    "pms_reservation_created",
    "sameday_pms_created",
    "sameday_direct_booking",
    "pms_pre_reservation_confirmed",
    "bot_commit_reservation",
    "reservation_update",
    "guest_portal_modify",
    "portal_modify_settled"
  ]);

  if (internalTriggers.has(trigger) && comm?.metadata?.channel !== "whatsapp_mirror") {
    return true;
  }

  const receptionEmail = String(
    db?.settings?.receptionEmail ||
    db?.settings?.buildingEmail ||
    (typeof process !== "undefined" && process.env?.RECEPTION_EMAIL) ||
    "soho@promenade.com.br"
  ).trim().toLowerCase();

  const garageEmail = String(
    db?.settings?.garageEmail ||
    (typeof process !== "undefined" && process.env?.GARAGE_EMAIL) ||
    "promenadesoho@pfbestacionamentos.com.br"
  ).trim().toLowerCase();

  if (!recipient) return false;
  if (recipient === receptionEmail || recipient === garageEmail) return true;
  if (recipient.includes("promenade.com.br") || recipient.includes("pfbestacionamentos") || recipient.includes("b2breservas")) {
    return true;
  }

  if (reservation) {
    const agencyEmail = String(reservation.agencyEmail || reservation.b2bAgencyEmail || "").trim().toLowerCase();
    if (agencyEmail && recipient === agencyEmail) return true;
    const reqEmail = String(reservation.requesterInfo?.email || reservation.requesterEmail || "").trim().toLowerCase();
    const guestEmail = String(reservation.guestEmail || "").trim().toLowerCase();
    if (reqEmail && recipient === reqEmail && reqEmail !== guestEmail) return true;
  }

  return false;
}

function normalizePhoneSimple(phone) {
  return String(phone || "").replace(/\D/g, "");
}

/**
 * Envia um aviso amigável via WhatsApp ao hóspede informando que o e-mail preenchido no check-in/reserva
 * está incorreto ou retornou erro, pedindo o e-mail correto para atualizar no sistema e reenviar pendentes.
 */
export async function notifyGuestInvalidEmailViaWhatsApp({
  db = null,
  saveDatabase = null,
  sendZapiMessage: sendZapiMessageParam = null,
  evaluateZapiChannelPolicy: evaluatePolicyParam = null,
  appendMessageToConversation: appendConvParam = null,
  createNotification: createNotificationParam = null,
  reservation = null,
  guestIndex = 1,
  invalidEmail = "",
  reason = "",
  suggestedEmail = null,
  source = "checkin",
  overrides = {}
} = {}) {
  if (!db || !reservation) {
    return { notified: false, reason: "missing_context" };
  }

  const normInvalid = String(invalidEmail || "").trim().toLowerCase();
  if (!normInvalid) {
    return { notified: false, reason: "empty_email" };
  }

  if (isInternalOrThirdPartyOperationalEmail(normInvalid, reservation, db)) {
    return { notified: false, reason: "internal_email_ignored" };
  }

  const rawStatus = String(reservation.status || "").toLowerCase();
  if (rawStatus === "cancelada" || rawStatus === "cancelled" || rawStatus === "expirada") {
    return { notified: false, reason: "reservation_inactive" };
  }

  // Não notifica estadias encerradas há mais de 48h
  const nowMs = Date.now();
  const isCheckedOut = Boolean(
    reservation.checkoutDone ||
    reservation.checkoutCompleted ||
    rawStatus === "concluida" ||
    rawStatus === "checked_out" ||
    rawStatus === "completed"
  );
  if (isCheckedOut) {
    const coMs = new Date(
      reservation.actualCheckoutAt ||
      reservation.checkoutCompletedAt ||
      (reservation.checkoutDate ? `${String(reservation.checkoutDate).slice(0, 10)}T15:00:00-03:00` : 0)
    ).getTime();
    if (!coMs || nowMs - coMs > 48 * 3600 * 1000) {
      return { notified: false, reason: "reservation_checked_out_too_old" };
    }
  }

  const safeIdx = Math.max(1, Number(guestIndex) || 1);
  const targetGuest = Array.isArray(reservation.guests)
    ? (reservation.guests.find(g => Number(g?.index) === safeIdx) || reservation.guests[safeIdx - 1] || null)
    : null;

  const currentGuestEmail = String(
    (safeIdx === 1 ? reservation.guestEmail : targetGuest?.email) ||
    targetGuest?.email ||
    reservation.guestEmail ||
    ""
  ).trim().toLowerCase();

  // Se o hóspede já atualizou o e-mail para outro endereço válido, ignora bounces atrasados do e-mail antigo
  if (currentGuestEmail && currentGuestEmail !== normInvalid && !reservation.guestEmailInvalid) {
    return { notified: false, reason: "email_already_corrected" };
  }

  // Se o hóspede já confirmou explicitamente que este endereço está correto, não incomoda novamente
  if (
    Array.isArray(reservation.confirmedValidEmails) &&
    reservation.confirmedValidEmails.some(em => String(em || "").trim().toLowerCase() === normInvalid)
  ) {
    return { notified: false, reason: "already_confirmed_valid_by_guest" };
  }

  // Em rejeição de transporte SMTP, se outro e-mail recente já foi aceito/enviado para o mesmo endereço,
  // trata-se de oscilação/rate-limit do relay de envio e nunca de endereço inexistente do hóspede
  if (source === "smtp_rejection" && Array.isArray(db.reservationCommunications)) {
    const recentSuccessExists = db.reservationCommunications.some(c => {
      if (!c || c.direction === "inbound" || c.status !== "sent") return false;
      if (String(c.recipient || "").trim().toLowerCase() !== normInvalid) return false;
      const sentMs = new Date(c.metadata?.sentAt || c.created_at || c.createdAt || 0).getTime();
      return sentMs > 0 && nowMs - sentMs <= 72 * 3600 * 1000;
    });
    if (recentSuccessExists) {
      return { notified: false, reason: "email_already_delivered_recently" };
    }
  }

  // Se não veio sugestão pronta, verifica se há erro conhecido de digitação para sugerir
  let finalSuggested = suggestedEmail || null;
  if (!finalSuggested) {
    try {
      const quickCheck = await validateGuestEmailAddress(normInvalid, { checkDns: false });
      if (quickCheck?.suggestedEmail) finalSuggested = quickCheck.suggestedEmail;
    } catch (_) {}
  }

  const resCode = String(
    reservation.code ||
    reservation.reservationCode ||
    (reservation.id != null ? `RES-${reservation.flatNumber || "00"}-${String(reservation.id).padStart(4, "0")}` : "RES")
  );
  const dedupKey = `${resCode.toUpperCase()}:${normInvalid}`;

  if (inFlightInvalidEmailAlerts.has(dedupKey)) {
    return { notified: false, reason: "in_flight_dedup" };
  }

  if (!Array.isArray(reservation.notifiedInvalidEmails)) {
    reservation.notifiedInvalidEmails = [];
  }
  const alreadyNotified =
    reservation.notifiedInvalidEmails.some(item => String(item?.email || "").toLowerCase() === normInvalid) ||
    (
      reservation.emailCorrectionRequest?.status === "awaiting_reply" &&
      String(reservation.emailCorrectionRequest?.invalidEmail || "").toLowerCase() === normInvalid &&
      Boolean(reservation.emailCorrectionRequest?.whatsappSent)
    );

  if (alreadyNotified) {
    return { notified: false, reason: "already_notified" };
  }

  const rawPhone =
    targetGuest?.whatsappPhone ||
    targetGuest?.phone ||
    targetGuest?.whatsapp ||
    reservation.whatsappPhone ||
    reservation.guestPhone ||
    reservation.phone ||
    "";
  const cleanPhone = normalizePhoneSimple(rawPhone);
  const nowIso = new Date().toISOString();

  reservation.guestEmailInvalid = true;
  reservation.emailCorrectionRequest = {
    status: "awaiting_reply",
    invalidEmail: normInvalid,
    suggestedEmail: finalSuggested,
    guestIndex: safeIdx,
    reason: reason || "E-mail inválido ou com falha de entrega",
    source,
    notifiedAt: nowIso,
    phone: cleanPhone || null,
    whatsappSent: false
  };

  const notifyPanelFn = createNotificationParam || globalThis.__corpflatsCreateNotification;
  const guestFullName = String(targetGuest?.name || reservation.guestName || "Hóspede").trim();
  const primeiroNome = guestFullName.split(/\s+/)[0] || "Hóspede";
  const flatNum = reservation.flatNumber || "S/N";

  if (!cleanPhone || cleanPhone.length < 8) {
    if (typeof notifyPanelFn === "function") {
      try {
        notifyPanelFn({
          category: "pre_checkin",
          title: `⚠️ E-mail Inválido no Check-in - Flat ${flatNum}`,
          message: `${guestFullName} informou um e-mail inválido (${normInvalid}) e não possui telefone WhatsApp válido para solicitação automática.`,
          severity: "warning",
          metadata: { reservationId: reservation.id, reservationCode: resCode, invalidEmail: normInvalid },
          targetUrl: "/reservas"
        });
      } catch (_) {}
    }
    if (typeof saveDatabase === "function") saveDatabase();
    return { notified: false, reason: "missing_guest_phone" };
  }

  const sendZapiFn = sendZapiMessageParam || globalThis.__corpflatsSendZapiMessage;
  const evalPolicyFn = evaluatePolicyParam || globalThis.__corpflatsEvaluateZapiChannelPolicy;
  const appendConvFn = appendConvParam || globalThis.__corpflatsAppendMessageToConversation;

  const hasCheckinDone = Boolean(
    source === "checkin" ||
    reservation.hasPreCheckin ||
    reservation.preCheckinCompleted ||
    reservation.fnhrCompleted ||
    targetGuest?.hasCompletedCheckin
  );

  const sugestaoTrecho = finalSuggested ? ` Você quis dizer *${finalSuggested}*?` : "";
  const messageText = hasCheckinDone
    ? `Olá, ${primeiroNome}! Seu check-in digital do *Flat ${flatNum}* já está confirmado! ✅\n\n` +
      `Notamos apenas que o e-mail preenchido no cadastro (*${normInvalid}*) está incorreto ou não pôde receber nossas mensagens.${sugestaoTrecho}\n\n` +
      `Por favor, envie aqui mesmo o seu *e-mail correto* para já alterarmos no sistema e reenviarmos seus e-mails pendentes!`
    : `Olá, ${primeiroNome}! Notamos que o e-mail informado na sua reserva do *Flat ${flatNum}* (*${normInvalid}*) está incorreto ou retornou erro de entrega.${sugestaoTrecho}\n\n` +
      `Por favor, responda aqui mesmo com o seu *e-mail correto* para já atualizarmos no sistema e reenviarmos seus e-mails pendentes!`;

  if (typeof evalPolicyFn === "function") {
    try {
      const policy = evalPolicyFn({
        channelId: "guest_schedule",
        phone: rawPhone,
        message: messageText,
        recipientRole: "guest",
        triggerEvent: "invalid_email_correction"
      });
      if (policy && policy.allowed === false) {
        console.warn(`[EmailCorrection] Disparo WhatsApp bloqueado pela política de canal para ${rawPhone}: ${policy.reason || policy.error}`);
        if (typeof saveDatabase === "function") saveDatabase();
        return { notified: false, reason: "channel_policy_blocked" };
      }
    } catch (_) {}
  }

  if (typeof sendZapiFn !== "function") {
    if (typeof saveDatabase === "function") saveDatabase();
    return { notified: false, reason: "zapi_sender_unavailable" };
  }

  inFlightInvalidEmailAlerts.add(dedupKey);
  try {
    const waResult = await sendZapiFn(rawPhone, messageText, {
      channelId: "guest_schedule",
      recipientRole: "guest",
      triggerEvent: "invalid_email_correction",
      title: "Confirmação de E-mail"
    });

    const sentOk = Boolean(waResult?.success !== false);
    if (sentOk) {
      reservation.emailCorrectionRequest.whatsappSent = true;
      reservation.notifiedInvalidEmails.push({
        email: normInvalid,
        suggestedEmail: finalSuggested,
        source,
        reason: reason || "invalid_email",
        notifiedAt: nowIso
      });
    }

    if (!Array.isArray(db.whatsappHistory)) db.whatsappHistory = [];
    db.whatsappHistory.push({
      id: `auto_emailfix_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      reservationCode: resCode,
      reservationId: reservation.id || null,
      title: "Solicitação de Correção de E-mail",
      guestName: guestFullName,
      guestPhone: rawPhone,
      recipientType: "guest",
      recipientName: guestFullName,
      triggerEvent: "invalid_email_correction",
      message: messageText,
      status: sentOk ? "sent" : "failed",
      method: waResult?.method || "auto_invalid_email_check",
      error: waResult?.error || null,
      sentAt: nowIso
    });

    if (typeof appendConvFn === "function") {
      try {
        appendConvFn({
          phone: rawPhone,
          senderName: "Sofia • CorpFlats",
          fromMe: true,
          text: messageText,
          type: "text",
          triggerEvent: "invalid_email_correction",
          reservationCode: resCode,
          status: sentOk ? "delivered" : "failed",
          timestamp: nowIso,
          messageId: waResult?.messageId || `msg_emailfix_${Date.now()}`
        });
      } catch (_) {}
    }

    if (typeof notifyPanelFn === "function") {
      try {
        notifyPanelFn({
          category: "pre_checkin",
          title: `📧 E-mail Incorreto Detectado - Flat ${flatNum} (${primeiroNome})`,
          message: `O e-mail '${normInvalid}' apresentou erro. Aviso enviado automaticamente via WhatsApp solicitando o e-mail correto.`,
          severity: "info",
          metadata: {
            reservationId: reservation.id,
            reservationCode: resCode,
            flatNumber: flatNum,
            invalidEmail: normInvalid,
            suggestedEmail: finalSuggested,
            source
          },
          targetUrl: "/whatsapp-chat"
        });
      } catch (_) {}
    }

    if (typeof saveDatabase === "function") saveDatabase();
    return {
      notified: sentOk,
      phone: rawPhone,
      message: messageText,
      invalidEmail: normInvalid,
      suggestedEmail: finalSuggested
    };
  } finally {
    inFlightInvalidEmailAlerts.delete(dedupKey);
  }
}

/**
 * Atualiza o e-mail do hóspede em todas as entidades do sistema (reserva, ficha de hóspedes,
 * CRM, portal do hóspede, frigobar, fila agendada) e reenvia automaticamente os e-mails pendentes
 * ou com falha que não sejam antigos (janela padrão: até 72 horas).
 */
export async function updateGuestEmailAndResendRecentPending({
  db = null,
  saveDatabase = null,
  reservation = null,
  guestIndex = 1,
  newEmail = "",
  maxAgeHours = 72,
  syncProfileFn = null,
  ensureScheduledEmailsFn = null,
  sendCheckinMirrorFn = null,
  baseUrl = "",
  skipPreCheckinMirrorSynthesis = false,
  overrides = {}
} = {}) {
  const cleanNewEmail = String(newEmail || "").trim().toLowerCase();
  if (!cleanNewEmail || !db) {
    return {
      ok: false,
      error: "Dados insuficientes para atualizar o e-mail.",
      resentCount: 0,
      resentSubjects: [],
      updatedScheduledCount: 0,
      skippedTooOldCount: 0
    };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const maxAgeMs = (Number(maxAgeHours) > 0 ? Number(maxAgeHours) : 72) * 3600 * 1000;
  const safeIdx = Math.max(1, Number(guestIndex) || 1);

  const previousInvalidEmails = new Set();
  const targetAffectedEmails = new Set([cleanNewEmail]);
  let sameEmailConfirmed = false;
  const collectOld = (val) => {
    const v = String(val || "").trim().toLowerCase();
    if (!v) return;
    targetAffectedEmails.add(v);
    if (v !== cleanNewEmail) {
      previousInvalidEmails.add(v);
    }
  };

  if (reservation) {
    const prevFlaggedEmail = String(
      reservation.emailCorrectionRequest?.invalidEmail ||
      (reservation.guestEmailInvalid ? reservation.guestEmail : "") ||
      ""
    ).trim().toLowerCase();
    if (prevFlaggedEmail && prevFlaggedEmail === cleanNewEmail) {
      sameEmailConfirmed = true;
    }

    collectOld(reservation.emailCorrectionRequest?.invalidEmail);
    if (Array.isArray(reservation.notifiedInvalidEmails)) {
      for (const item of reservation.notifiedInvalidEmails) collectOld(item?.email);
    }
    if (safeIdx === 1) collectOld(reservation.guestEmail);

    if (Array.isArray(reservation.guests)) {
      const targetG = reservation.guests.find(g => Number(g?.index) === safeIdx) || reservation.guests[safeIdx - 1];
      if (targetG) {
        collectOld(targetG.email);
        targetG.email = cleanNewEmail;
      } else if (safeIdx === 1 && reservation.guests[0]) {
        collectOld(reservation.guests[0].email);
        reservation.guests[0].email = cleanNewEmail;
      }
    }

    if (safeIdx === 1 || !reservation.guestEmail || previousInvalidEmails.has(String(reservation.guestEmail || "").trim().toLowerCase())) {
      collectOld(reservation.guestEmail);
      reservation.guestEmail = cleanNewEmail;
    }

    // Atualiza e-mail fiscal/NFS-e na reserva apenas se era o próprio e-mail inválido anterior (preserva e-mail corporativo B2B distinto)
    if (reservation.fiscalData?.email && previousInvalidEmails.has(String(reservation.fiscalData.email).trim().toLowerCase())) {
      reservation.fiscalData.email = cleanNewEmail;
    }
    if (reservation.nfseRecipientEmail && previousInvalidEmails.has(String(reservation.nfseRecipientEmail).trim().toLowerCase())) {
      reservation.nfseRecipientEmail = cleanNewEmail;
    }

    reservation.guestEmailInvalid = false;
    if (sameEmailConfirmed) {
      if (!Array.isArray(reservation.confirmedValidEmails)) {
        reservation.confirmedValidEmails = [];
      }
      if (!reservation.confirmedValidEmails.includes(cleanNewEmail)) {
        reservation.confirmedValidEmails.push(cleanNewEmail);
      }
    }
    if (reservation.emailCorrectionRequest) {
      reservation.emailCorrectionRequest = {
        ...reservation.emailCorrectionRequest,
        status: sameEmailConfirmed ? "resolved_confirmed_same" : "resolved",
        correctedEmail: cleanNewEmail,
        resolvedAt: nowIso
      };
    }

    if (Array.isArray(reservation.auditLogs)) {
      reservation.auditLogs.unshift({
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        action: sameEmailConfirmed ? "guest_email_confirmed_valid" : "guest_email_corrected",
        timestamp: nowIso,
        actor: { name: "Sofia IA / Autoatendimento", role: "system", type: "ai" },
        source: "WhatsApp / Check-in",
        description: sameEmailConfirmed
          ? `Hóspede confirmou que o e-mail cadastrado (${cleanNewEmail}) está correto`
          : `E-mail do hóspede atualizado para ${cleanNewEmail}`,
        changes: [
          {
            field: "guestEmail",
            label: "E-mail do Hóspede",
            oldValue: Array.from(previousInvalidEmails)[0] || cleanNewEmail,
            newValue: cleanNewEmail
          }
        ]
      });
    }

    reservation.updatedAt = nowIso;
  }

  // Sincroniza CRM (db.guests) e Contas do Portal (db.guestAccounts)
  const cleanDoc = String(reservation?.guestDocument || reservation?.guestCpf || "").replace(/\D+/g, "");
  const cleanPhone = normalizePhoneSimple(reservation?.guestPhone || reservation?.whatsappPhone || "");

  if (Array.isArray(db.guests)) {
    for (const g of db.guests) {
      if (!g) continue;
      const gDoc = String(g.documentNumber || g.document || "").replace(/\D+/g, "");
      const gPhone = normalizePhoneSimple(g.phone || g.whatsapp || "");
      const gEmail = String(g.email || "").trim().toLowerCase();
      const isSameGuest =
        (reservation?.guestId && Number(g.id) === Number(reservation.guestId)) ||
        (cleanDoc && cleanDoc.length >= 11 && gDoc === cleanDoc) ||
        (cleanPhone && cleanPhone.length >= 8 && gPhone && (gPhone.endsWith(cleanPhone.slice(-8)) || cleanPhone.endsWith(gPhone.slice(-8)))) ||
        (gEmail && previousInvalidEmails.has(gEmail));
      if (isSameGuest && safeIdx === 1) {
        g.email = cleanNewEmail;
        g.updatedAt = nowIso;
      }
    }
  }

  if (Array.isArray(db.guestAccounts) && safeIdx === 1) {
    const emailAlreadyTakenByOther = db.guestAccounts.some(acc => {
      if (!acc || String(acc.email || "").trim().toLowerCase() !== cleanNewEmail) return false;
      const accDoc = String(acc.cpf || acc.document || "").replace(/\D+/g, "");
      if (cleanDoc && accDoc && accDoc !== cleanDoc) return true;
      if (reservation?.guestId && acc.guestId && Number(acc.guestId) !== Number(reservation.guestId)) return true;
      return false;
    });
    if (!emailAlreadyTakenByOther) {
      for (const acc of db.guestAccounts) {
        if (!acc) continue;
        const accDoc = String(acc.cpf || acc.document || "").replace(/\D+/g, "");
        const accPhone = normalizePhoneSimple(acc.phone || "");
        const accEmail = String(acc.email || "").trim().toLowerCase();
        const isSameAcc =
          (reservation?.guestId && Number(acc.guestId) === Number(reservation.guestId)) ||
          (cleanDoc && cleanDoc.length >= 11 && accDoc === cleanDoc) ||
          (cleanPhone && cleanPhone.length >= 8 && accPhone && (accPhone.endsWith(cleanPhone.slice(-8)) || cleanPhone.endsWith(accPhone.slice(-8)))) ||
          (accEmail && previousInvalidEmails.has(accEmail));
        if (isSameAcc) {
          acc.email = cleanNewEmail;
          acc.updatedAt = nowIso;
        }
      }
    }
  }

  // Invoca sincronizador bidirecional oficial do PMS quando disponível (propaga para reservas futuras ativas do mesmo titular)
  const syncFn = syncProfileFn || globalThis.__corpflatsSyncBidirectionalGuestProfile;
  if (typeof syncFn === "function" && reservation && safeIdx === 1) {
    try {
      syncFn({
        guestId: reservation.guestId || null,
        cpf: cleanDoc || undefined,
        phone: reservation.guestPhone || undefined,
        email: cleanNewEmail,
        name: reservation.guestName || undefined,
        sourceReservationId: reservation.id
      });
    } catch (_) {}
  }

  // Atualiza pedidos de frigobar vinculados à reserva que tinham o e-mail incorreto
  if (reservation && Array.isArray(db.minibarOrders)) {
    const resCodeUpper = String(reservation.code || "").trim().toUpperCase();
    for (const order of db.minibarOrders) {
      if (!order) continue;
      const sameRes =
        (reservation.id != null && String(order.reservationId) === String(reservation.id)) ||
        (resCodeUpper && String(order.reservationCode || "").trim().toUpperCase() === resCodeUpper);
      if (sameRes && previousInvalidEmails.has(String(order.customerEmail || "").trim().toLowerCase())) {
        order.customerEmail = cleanNewEmail;
      }
    }
  }

  let resentCount = 0;
  const resentSubjects = [];
  let updatedScheduledCount = 0;
  let skippedTooOldCount = 0;

  if (!reservation) {
    if (typeof saveDatabase === "function") await saveDatabase();
    return {
      ok: true,
      newEmail: cleanNewEmail,
      previousInvalidEmails: Array.from(previousInvalidEmails),
      resentCount,
      resentSubjects,
      updatedScheduledCount,
      skippedTooOldCount
    };
  }

  const resIdStr = reservation.id != null ? String(reservation.id) : "";
  const resCode = String(
    reservation.code ||
    reservation.reservationCode ||
    (resIdStr ? `RES-${reservation.flatNumber || "00"}-${resIdStr}` : "")
  );
  const resCodeUpper = resCode.toUpperCase();

  const rawStatus = String(reservation.status || "").toLowerCase();
  const isCancelled = rawStatus === "cancelada" || rawStatus === "cancelled" || rawStatus === "expirada";
  const isCheckedOut = Boolean(
    reservation.checkoutDone ||
    reservation.checkoutCompleted ||
    rawStatus === "concluida" ||
    rawStatus === "checked_out" ||
    rawStatus === "completed"
  );
  const checkoutRefMs = isCheckedOut
    ? new Date(
        reservation.actualCheckoutAt ||
        reservation.checkoutCompletedAt ||
        (reservation.checkoutDate ? `${String(reservation.checkoutDate).slice(0, 10)}T15:00:00-03:00` : 0)
      ).getTime()
    : 0;

  const ensureSchedFn = ensureScheduledEmailsFn || globalThis.__corpflatsEnsureScheduledEmails;
  if (typeof ensureSchedFn === "function" && !isCancelled && !isCheckedOut && safeIdx === 1) {
    try {
      ensureSchedFn(reservation);
    } catch (_) {}
  }

  const resentDedupKeys = new Set();
  const skippedTooOldDedupKeys = new Set();

  const isTriggerIrrelevantAfterCheckout = (trig = "", subj = "") => {
    if (!isCheckedOut) return false;
    if (checkoutRefMs && nowMs - checkoutRefMs > 48 * 3600 * 1000) return true;
    const t = String(trig || "").toLowerCase();
    const s = String(subj || "").toLowerCase();
    if (
      t === "checkin_welcome" ||
      t === "pre_checkin_completed" ||
      t === "room_ready" ||
      t === "breakfast_reminder" ||
      t === "reservation_created" ||
      t === "sameday_reservation" ||
      s.includes("instruções de chegada") ||
      s.includes("check-in online concluído")
    ) {
      return true;
    }
    return false;
  };

  // 1. Fila de E-mails Agendados (db.emailQueue)
  if (Array.isArray(db.emailQueue) && !isCancelled) {
    for (const q of db.emailQueue) {
      if (!q || q.status === "cancelled" || q.status === "sent" || q.status === "expired") continue;
      const qCode = String(q.reservationCode || "").trim().toUpperCase();
      const qId = q.reservationId != null ? String(q.reservationId) : "";
      const isMatch = (resCodeUpper && (qCode === resCodeUpper || qId.toUpperCase() === resCodeUpper)) || (resIdStr && qId === resIdStr);
      if (!isMatch) continue;

      const schedMs = q.scheduledFor ? new Date(q.scheduledFor).getTime() : NaN;
      if (!Number.isNaN(schedMs) && schedMs > nowMs) {
        if (String(q.recipient || "").trim().toLowerCase() !== cleanNewEmail || q.status === "failed") {
          q.recipient = cleanNewEmail;
          q.status = "pending";
          q.error = null;
          q.updatedAt = nowIso;
          updatedScheduledCount++;
        }
      } else {
        const refMs = !Number.isNaN(schedMs) ? schedMs : new Date(q.createdAt || 0).getTime();
        const dedupKey = String(q.triggerEvent || q.subject || "").trim().toLowerCase();
        if (isTriggerIrrelevantAfterCheckout(q.triggerEvent, q.subject)) {
          q.status = "cancelled";
          q.error = "Cancelado: estadia já encerrada";
          continue;
        }
        if (refMs > 0 && nowMs - refMs <= maxAgeMs) {
          q.recipient = cleanNewEmail;
          q.status = "sent";
          q.sentAt = nowIso;
          q.error = null;
          sendEmailAsync({
            db,
            saveDatabase,
            reservationId: resCode || resIdStr,
            recipient: cleanNewEmail,
            subject: q.subject,
            bodyHtml: q.bodyHtml,
            bodyText: q.bodyText || "",
            metadata: {
              isAutomated: true,
              trigger: q.triggerEvent || "scheduled_queue_resend",
              resentAfterEmailCorrection: true
            },
            overrides
          });
          if (dedupKey) resentDedupKeys.add(dedupKey);
          resentCount++;
          resentSubjects.push(q.subject);
        } else {
          q.status = "expired";
          q.error = "Não reenviado após correção de e-mail: agendamento antigo";
          if (dedupKey && !skippedTooOldDedupKeys.has(dedupKey)) {
            skippedTooOldDedupKeys.add(dedupKey);
            skippedTooOldCount++;
          }
        }
      }
    }
  }

  // 2. Histórico de Comunicações Pendentes / Com Falha / Devolvidas (db.reservationCommunications)
  if (Array.isArray(db.reservationCommunications) && !isCancelled) {
    const alreadySentKeysToNewEmail = new Set();
    const candidates = [];

    for (const c of db.reservationCommunications) {
      if (!c || (c.direction && c.direction !== "outbound")) continue;
      const cResUpper = String(c.reservation_id || "").trim().toUpperCase();
      const sameRes = (resCodeUpper && cResUpper === resCodeUpper) || (resIdStr && String(c.reservation_id) === resIdStr);
      if (!sameRes) continue;
      if (isInternalOrThirdPartyOperationalEmail(c, reservation, db)) continue;

      const dedupKey = String(c.metadata?.trigger || c.subject || "").trim().toLowerCase();
      const cRecipient = String(c.recipient || "").trim().toLowerCase();

      if (c.status === "sent" && cRecipient === cleanNewEmail && dedupKey) {
        alreadySentKeysToNewEmail.add(dedupKey);
        continue;
      }

      // Se o hóspede confirmou que o próprio e-mail atual está correto e o registro já havia sido entregue via SMTP
      // antes de um falso bounce, restaura o status "sent" sem disparar cópia duplicada
      if (sameEmailConfirmed && c.status === "bounced" && cRecipient === cleanNewEmail && Boolean(c.metadata?.sentAt)) {
        c.status = "sent";
        if (c.metadata) {
          delete c.metadata.bouncedAt;
          delete c.metadata.bounceSubject;
        }
        if (dedupKey) alreadySentKeysToNewEmail.add(dedupKey);
        continue;
      }

      if (c.metadata?.supersededByResend) continue;

      const createdMs = new Date(c.created_at || c.createdAt || c.metadata?.queuedAt || 0).getTime();
      const isFailedOrPending =
        c.status === "failed" ||
        c.status === "bounced" ||
        (c.status === "pending" && (c.metadata?.awaitingEmailCorrection || (createdMs > 0 && nowMs - createdMs > 15000)));

      if (!isFailedOrPending) continue;

      const belongsToGuestTarget =
        targetAffectedEmails.has(cRecipient) ||
        c.metadata?.awaitingEmailCorrection === true ||
        (c.metadata?.channel === "whatsapp_mirror" && (c.metadata?.recipientType || "guest") === "guest");

      if (belongsToGuestTarget) {
        candidates.push({ comm: c, createdMs, dedupKey });
      }
    }

    // Ordena do mais recente para o mais antigo para reenviar apenas a versão mais atual de cada assunto/gatilho
    candidates.sort((a, b) => (b.createdMs || 0) - (a.createdMs || 0));

    for (const { comm, createdMs, dedupKey } of candidates) {
      if (dedupKey && (alreadySentKeysToNewEmail.has(dedupKey) || resentDedupKeys.has(dedupKey))) {
        comm.metadata = { ...(comm.metadata || {}), supersededByResend: true };
        continue;
      }

      if (isTriggerIrrelevantAfterCheckout(comm.metadata?.trigger, comm.subject)) {
        comm.metadata = { ...(comm.metadata || {}), skippedResendReason: "post_checkout_irrelevant", skippedAt: nowIso };
        continue;
      }

      if (!createdMs || Number.isNaN(createdMs) || nowMs - createdMs > maxAgeMs) {
        comm.metadata = { ...(comm.metadata || {}), skippedResendReason: "too_old", skippedAt: nowIso };
        if (!dedupKey || !skippedTooOldDedupKeys.has(dedupKey)) {
          if (dedupKey) skippedTooOldDedupKeys.add(dedupKey);
          skippedTooOldCount++;
        }
        continue;
      }

      const cleanMeta = { ...(comm.metadata || {}) };
      delete cleanMeta.awaitingEmailCorrection;
      delete cleanMeta.invalidEmailReason;
      delete cleanMeta.error;
      delete cleanMeta.failedAt;
      delete cleanMeta.bouncedAt;
      delete cleanMeta.supersededByResend;

      comm.metadata = {
        ...(comm.metadata || {}),
        supersededByResend: true,
        resentTo: cleanNewEmail,
        resentAt: nowIso
      };

      sendEmailAsync({
        db,
        saveDatabase,
        reservationId: resCode || resIdStr,
        recipient: cleanNewEmail,
        subject: comm.subject,
        bodyHtml: comm.body,
        metadata: {
          ...cleanMeta,
          resentAfterEmailCorrection: true,
          resentFromCommunicationId: comm.id,
          previousRecipient: comm.recipient
        },
        overrides
      });

      if (dedupKey) resentDedupKeys.add(dedupKey);
      resentCount++;
      resentSubjects.push(comm.subject);
    }

    // 3. Caso o check-in tenha sido concluído recentemente e ainda não exista e-mail de confirmação enviado/reenviado
    if (
      !skipPreCheckinMirrorSynthesis &&
      !isCheckedOut &&
      !resentDedupKeys.has("pre_checkin_completed") &&
      !alreadySentKeysToNewEmail.has("pre_checkin_completed")
    ) {
      const hasCheckinDone = Boolean(
        reservation.hasPreCheckin ||
        reservation.preCheckinCompleted ||
        reservation.fnhrCompleted
      );
      const checkinDoneMs = new Date(
        reservation.checkedInAt ||
        reservation.fnrhSignedAt ||
        reservation.preCheckinCompletedAt ||
        0
      ).getTime();

      if (hasCheckinDone && checkinDoneMs > 0 && nowMs - checkinDoneMs <= maxAgeMs) {
        const sendMirrorFn = sendCheckinMirrorFn || globalThis.__corpflatsSendPreCheckinMirrorEmail;
        if (typeof sendMirrorFn === "function") {
          try {
            const mirrorLog = sendMirrorFn(reservation, cleanNewEmail, safeIdx, baseUrl);
            if (mirrorLog) {
              resentDedupKeys.add("pre_checkin_completed");
              resentCount++;
              resentSubjects.push(mirrorLog.subject || "Confirmação de Check-in Online");
            }
          } catch (_) {}
        }
      }
    }
  }

  if (typeof saveDatabase === "function") {
    await saveDatabase();
  }

  return {
    ok: true,
    newEmail: cleanNewEmail,
    sameEmailConfirmed,
    previousInvalidEmails: Array.from(previousInvalidEmails),
    resentCount,
    resentSubjects,
    updatedScheduledCount,
    skippedTooOldCount
  };
}

/**
 * Reconcilia automaticamente alertas de e-mail incorreto gerados por falso positivo (ex: bounce sem menção
 * ao e-mail do hóspede ou quando o hóspede já respondeu no WhatsApp confirmando o mesmo endereço).
 */
export function reconcileFalsePositiveEmailAlerts(db, saveDatabase = null) {
  if (!db || !Array.isArray(db.reservations)) return { reconciled: 0 };
  let reconciled = 0;
  const nowIso = new Date().toISOString();
  const zohoCache = Array.isArray(db.zohoMessagesCache) ? db.zohoMessagesCache : [];
  const comms = Array.isArray(db.reservationCommunications) ? db.reservationCommunications : [];
  const convs = Array.isArray(db.whatsappConversations) ? db.whatsappConversations : [];

  for (const r of db.reservations) {
    if (!r || (!r.guestEmailInvalid && r.emailCorrectionRequest?.status !== "awaiting_reply")) continue;
    const req = r.emailCorrectionRequest;
    const normFlagged = String(req?.invalidEmail || r.guestEmail || "").trim().toLowerCase();
    if (!normFlagged) continue;

    const cleanPhone = normalizePhoneSimple(req?.phone || r.whatsappPhone || r.guestPhone || r.phone || "");
    const notifiedMs = req?.notifiedAt ? new Date(req.notifiedAt).getTime() : 0;

    // 1. Verifica se o hóspede já respondeu no WhatsApp após o alerta repetindo/confirmando o mesmo endereço
    let guestConfirmedSameInWa = false;
    if (cleanPhone.length >= 8 && notifiedMs > 0) {
      const matchedConv = convs.find(c => {
        const p = normalizePhoneSimple(c?.phone);
        return p && (p.endsWith(cleanPhone.slice(-8)) || cleanPhone.endsWith(p.slice(-8)));
      });
      if (matchedConv && Array.isArray(matchedConv.messages)) {
        guestConfirmedSameInWa = matchedConv.messages.some(m => {
          if (!m || m.fromMe) return false;
          const mMs = new Date(m.timestamp || m.createdAt || 0).getTime();
          if (mMs > 0 && mMs < notifiedMs - 5000) return false;
          if (mMs > 0 && Date.now() - mMs < 2 * 60 * 1000) return false;
          const txt = String(m.text || m.message || "").toLowerCase();
          return txt.includes(normFlagged);
        });
      }
    }

    // 2. Verifica se foi um falso positivo de zoho_bounce (nenhum bounce no cache cita o e-mail do hóspede)
    let isFalseZohoBounce = false;
    if (!guestConfirmedSameInWa && req?.source === "zoho_bounce" && zohoCache.length > 0) {
      const anyBounceMentionsGuest = zohoCache.some(m => {
        if (!m || m.direction !== "inbound") return false;
        const blob = `${m.subject || ""}\n${m.snippet || ""}\n${m.bodyText || ""}\n${m.bodyHtml || ""}`.toLowerCase();
        return blob.includes(normFlagged);
      });
      if (!anyBounceMentionsGuest) {
        isFalseZohoBounce = true;
      }
    }

    // 3. Verifica se foi um falso positivo de smtp_rejection quando outro e-mail ao mesmo destinatário já foi entregue
    let isFalseSmtpRejection = false;
    if (!guestConfirmedSameInWa && !isFalseZohoBounce && req?.source === "smtp_rejection") {
      isFalseSmtpRejection = comms.some(c => {
        if (!c || c.direction === "inbound" || c.status !== "sent") return false;
        return String(c.recipient || "").trim().toLowerCase() === normFlagged;
      });
    }

    if (guestConfirmedSameInWa || isFalseZohoBounce || isFalseSmtpRejection) {
      r.guestEmailInvalid = false;
      if (!Array.isArray(r.confirmedValidEmails)) r.confirmedValidEmails = [];
      if (guestConfirmedSameInWa && !r.confirmedValidEmails.includes(normFlagged)) {
        r.confirmedValidEmails.push(normFlagged);
      }
      if (r.emailCorrectionRequest) {
        r.emailCorrectionRequest = {
          ...r.emailCorrectionRequest,
          status: guestConfirmedSameInWa ? "resolved_confirmed_same" : "cancelled_false_positive",
          correctedEmail: normFlagged,
          resolvedAt: nowIso
        };
      }

      const resCodeUpper = String(r.code || "").trim().toUpperCase();
      const resIdStr = r.id != null ? String(r.id) : "";
      for (const c of comms) {
        if (!c || c.direction === "inbound") continue;
        const cResUpper = String(c.reservation_id || "").trim().toUpperCase();
        const sameRes = (resCodeUpper && cResUpper === resCodeUpper) || (resIdStr && String(c.reservation_id) === resIdStr);
        if (!sameRes) continue;
        if (String(c.recipient || "").trim().toLowerCase() === normFlagged && c.status === "bounced" && c.metadata?.sentAt) {
          c.status = "sent";
          delete c.metadata.bouncedAt;
          delete c.metadata.bounceSubject;
        }
      }

      r.updatedAt = nowIso;
      reconciled++;
    }
  }

  if (reconciled > 0 && typeof saveDatabase === "function") {
    saveDatabase("reconcile_false_positive_email_alerts");
  }
  return { reconciled };
}

// ═════════════════════════════════════════════════════════════════════════════
// MOTOR DE FALLBACK AUTOMÁTICO DE E-MAILS DA RECEPÇÃO PARA WHATSAPP (2237040100)
// ═════════════════════════════════════════════════════════════════════════════

const RECEPTION_FALLBACK_DEFAULT_PHONE = "2237040100";
const RECEPTION_FALLBACK_HARD_MIN_DATE_BR = "2026-11-13";
const RECEPTION_FALLBACK_DEFAULT_AUTO_WINDOW_MINUTES = 75;
const RECEPTION_FALLBACK_CLEAN_DELIVERY_VERIFY_MINUTES = 45;
const inFlightReceptionFallbackIds = new Set();
let retroactiveReceptionSweepPromise = null;
let lastReceptionFallbackPanelAlertMs = 0;

function normalizeBrazilWhatsAppPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    return `55${digits}`;
  }
  return digits;
}

export function ensureReceptionEmailFallbackState(db) {
  if (!db || typeof db !== "object") {
    return {
      enabled: true,
      mode: "auto",
      manualForce: false,
      autoDetect: true,
      autoWindowMinutes: RECEPTION_FALLBACK_DEFAULT_AUTO_WINDOW_MINUTES,
      autoWindowHours: 1.25,
      whatsappPhone: RECEPTION_FALLBACK_DEFAULT_PHONE,
      minDateBrasilia: RECEPTION_FALLBACK_HARD_MIN_DATE_BR,
      autoActiveUntil: null,
      lastIssueEventAt: null,
      lastIssueDetectedAt: null,
      lastIssueSource: null,
      lastIssueReason: null,
      lastRecoveredAt: null,
      lastRecoverySource: null,
      lastRecoveryReason: null,
      previousRecoveredAt: null,
      processedDsnMessageIds: [],
      totalForwardedCount: 0,
      lastForwardedAt: null
    };
  }
  if (!db.settings || typeof db.settings !== "object") {
    db.settings = {};
  }
  if (!db.settings.receptionEmailFallback || typeof db.settings.receptionEmailFallback !== "object") {
    db.settings.receptionEmailFallback = {};
  }
  const cfg = db.settings.receptionEmailFallback;
  if (cfg.enabled === undefined) cfg.enabled = true;
  if (cfg.manualForce === undefined) cfg.manualForce = false;
  if (!cfg.mode || !["active", "auto", "disabled"].includes(cfg.mode)) {
    cfg.mode = cfg.enabled === false ? "disabled" : "auto";
  }
  if (cfg.autoDetect === undefined) cfg.autoDetect = true;
  if (!Number(cfg.autoWindowMinutes) || Number(cfg.autoWindowMinutes) <= 0) {
    cfg.autoWindowMinutes = RECEPTION_FALLBACK_DEFAULT_AUTO_WINDOW_MINUTES;
  }
  cfg.autoWindowHours = Number((Number(cfg.autoWindowMinutes) / 60).toFixed(2));
  if (!cfg.whatsappPhone || !String(cfg.whatsappPhone).replace(/\D/g, "")) {
    cfg.whatsappPhone = RECEPTION_FALLBACK_DEFAULT_PHONE;
  }
  cfg.minDateBrasilia = RECEPTION_FALLBACK_HARD_MIN_DATE_BR;
  if (cfg.autoActiveUntil === undefined) cfg.autoActiveUntil = null;
  if (cfg.lastIssueEventAt === undefined) cfg.lastIssueEventAt = null;
  if (cfg.lastIssueDetectedAt === undefined) cfg.lastIssueDetectedAt = null;
  if (cfg.lastIssueSource === undefined) cfg.lastIssueSource = null;
  if (cfg.lastIssueReason === undefined) cfg.lastIssueReason = null;
  if (cfg.lastRecoveredAt === undefined) cfg.lastRecoveredAt = null;
  if (cfg.lastRecoverySource === undefined) cfg.lastRecoverySource = null;
  if (cfg.lastRecoveryReason === undefined) cfg.lastRecoveryReason = null;
  if (cfg.previousRecoveredAt === undefined) cfg.previousRecoveredAt = null;
  if (!Array.isArray(cfg.processedDsnMessageIds)) cfg.processedDsnMessageIds = [];
  if (typeof cfg.totalForwardedCount !== "number") cfg.totalForwardedCount = 0;
  if (cfg.lastForwardedAt === undefined) cfg.lastForwardedAt = null;

  if (!Array.isArray(db.receptionWhatsappFallbackSentIds)) {
    db.receptionWhatsappFallbackSentIds = [];
  }

  // Migração v2: converte o modo fixo inicial ("active" + janela de 24h) para "auto" com auto-desativação
  // e limpa bolhas antigas com CSS bruto no histórico local do /whatsapp-chat.
  if (!cfg.migratedAutoModeV2) {
    cfg.migratedAutoModeV2 = true;
    cfg.autoWindowMinutes = RECEPTION_FALLBACK_DEFAULT_AUTO_WINDOW_MINUTES;
    cfg.autoWindowHours = Number((RECEPTION_FALLBACK_DEFAULT_AUTO_WINDOW_MINUTES / 60).toFixed(2));
    if (cfg.mode === "active" && !cfg.manualForce) {
      cfg.mode = cfg.enabled === false ? "disabled" : "auto";
    }

    const nowMs = Date.now();
    const windowMs = cfg.autoWindowMinutes * 60 * 1000;
    let latestRealDsnMs = 0;

    if (Array.isArray(db.zohoMessagesCache)) {
      for (const m of db.zohoMessagesCache) {
        if (!m) continue;
        const fromL = String(m.fromEmail || m.from || "").toLowerCase();
        const subjL = String(m.subject || "").toLowerCase();
        const isDsn =
          fromL.includes("mailer-daemon") ||
          fromL.includes("postmaster") ||
          subjL.includes("delivery status notification") ||
          subjL.includes("undelivered");
        if (!isDsn) continue;
        const mId = String(m.id || m.zohoMessageId || "").trim();
        if (mId && !cfg.processedDsnMessageIds.includes(mId)) {
          cfg.processedDsnMessageIds.unshift(mId);
        }
        const combined = `${m.subject || ""} ${m.snippet || ""} ${m.bodyText || ""} ${m.bodyHtml || ""}`.toLowerCase();
        if (combined.includes("promenade.com.br")) {
          const ts = new Date(m.created_at || m.date || 0).getTime() || 0;
          if (ts > latestRealDsnMs) latestRealDsnMs = ts;
        }
      }
      if (cfg.processedDsnMessageIds.length > 500) {
        cfg.processedDsnMessageIds.length = 500;
      }
    }

    if (latestRealDsnMs > 0) {
      cfg.lastIssueEventAt = new Date(latestRealDsnMs).toISOString();
    }

    // Se não há DSN recente nos últimos 75 minutos, desativa imediatamente o circuito de contingência
    if (!latestRealDsnMs || nowMs - latestRealDsnMs > windowMs) {
      cfg.autoActiveUntil = null;
      cfg.lastRecoveredAt = new Date(nowMs).toISOString();
      cfg.lastRecoverySource = "auto_recovery_v2";
      cfg.lastRecoveryReason = "Serviço de e-mail da recepção normalizado (sem novos avisos DSN recentes)";
    } else {
      cfg.autoActiveUntil = new Date(latestRealDsnMs + windowMs).toISOString();
    }

    try {
      healDirtyCssReceptionFallbackMessages(db);
    } catch (_) {}
  }

  return cfg;
}

export function markReceptionEmailRecovered(db, saveDatabase = null, {
  source = "auto_recovery",
  reason = "Entrega de e-mails para a recepção normalizada"
} = {}) {
  if (!db) return { recovered: false };
  const cfg = ensureReceptionEmailFallbackState(db);
  const wasActive = Boolean(
    (cfg.mode === "active" && !cfg.manualForce) ||
    (cfg.autoActiveUntil && new Date(cfg.autoActiveUntil).getTime() > Date.now()) ||
    cfg.autoActiveUntil
  );

  const nowIso = new Date().toISOString();
  cfg.autoActiveUntil = null;
  if (cfg.mode === "active" && !cfg.manualForce) {
    cfg.mode = cfg.enabled === false ? "disabled" : "auto";
  }
  cfg.lastRecoveredAt = nowIso;
  cfg.lastRecoverySource = source;
  cfg.lastRecoveryReason = String(reason || "Serviço normalizado").slice(0, 400);

  if (wasActive) {
    console.log(`[ReceptionFallback ✅] E-mail da recepção normalizado (${source}): fallback WhatsApp desativado automaticamente.`);
    const notifyFn = globalThis.__corpflatsCreateNotification;
    if (typeof notifyFn === "function") {
      try {
        notifyFn({
          category: "email",
          title: "✅ E-mail da Recepção Normalizado",
          message: `O recebimento de e-mails da recepção voltou ao normal (${cfg.lastRecoveryReason}). O fallback para WhatsApp (${cfg.whatsappPhone}) foi desativado automaticamente.`,
          severity: "info",
          targetUrl: "/emails",
          link: "/emails",
          metadata: {
            source,
            reason: cfg.lastRecoveryReason,
            recoveredAt: nowIso
          }
        });
      } catch (_) {}
    }
    if (typeof saveDatabase === "function") {
      saveDatabase("reception_email_recovered");
    }
  }

  return { recovered: wasActive, cfg };
}

export function evaluateReceptionEmailFallbackAutoRecovery(db, saveDatabase = null, {
  inboundFromEmail = "",
  inboundCreatedAt = "",
  lastZohoInboxSyncMs = 0
} = {}) {
  if (!db) return { recovered: false };
  const cfg = ensureReceptionEmailFallbackState(db);
  if (cfg.enabled === false || cfg.mode === "disabled") return { recovered: false };
  if (cfg.mode === "active" && cfg.manualForce === true) return { recovered: false };

  const nowMs = Date.now();
  const lastIssueMs = new Date(cfg.lastIssueEventAt || cfg.lastIssueDetectedAt || 0).getTime() || 0;

  // Sinal 1: E-mail legítimo recebido da própria recepção / domínio @promenade.com.br após o incidente
  if (inboundFromEmail) {
    const cleanSender = String(inboundFromEmail).replace(/.*<([^>]+)>.*/, "$1").trim().toLowerCase();
    const recAddrs = getReceptionEmailAddresses(db);
    const isFromReception =
      recAddrs.has(cleanSender) ||
      (cleanSender.endsWith("@promenade.com.br") && !cleanSender.includes("mailer-daemon") && !cleanSender.includes("postmaster"));
    const inboundMs = inboundCreatedAt ? new Date(inboundCreatedAt).getTime() : nowMs;
    if (isFromReception && inboundMs > 0 && (!lastIssueMs || inboundMs > lastIssueMs)) {
      if (cfg.autoActiveUntil || !cfg.lastRecoveredAt) {
        return markReceptionEmailRecovered(db, saveDatabase, {
          source: "inbound_reception_email",
          reason: `E-mail recebido normalmente de ${cleanSender}`
        });
      }
    }
  }

  if (!cfg.autoActiveUntil) {
    return { recovered: false };
  }

  const expMs = new Date(cfg.autoActiveUntil).getTime();

  // Sinal 2: Janela de contingência expirou sem novas falhas SMTP nem novos DSNs de atraso/erro
  if (Number.isNaN(expMs) || nowMs >= expMs) {
    return markReceptionEmailRecovered(db, saveDatabase, {
      source: "cooldown_window_expired",
      reason: `Sem novas falhas SMTP ou avisos de atraso (DSN) nos últimos ${cfg.autoWindowMinutes || RECEPTION_FALLBACK_DEFAULT_AUTO_WINDOW_MINUTES} minutos`
    });
  }

  // Sinal 3: E-mail enviado à recepção APÓS o incidente permaneceu sem qualquer DSN após sincronização do Zoho Mail
  const verifyWaitMs = RECEPTION_FALLBACK_CLEAN_DELIVERY_VERIFY_MINUTES * 60 * 1000;
  const syncMs = Number(lastZohoInboxSyncMs) || (db?.settings?.zohoOAuth?.lastSyncAt ? new Date(db.settings.zohoOAuth.lastSyncAt).getTime() : 0) || 0;
  if (lastIssueMs > 0 && syncMs > lastIssueMs && Array.isArray(db.reservationCommunications)) {
    const cleanProbeComm = db.reservationCommunications.find(c => {
      if (!c || c.status !== "sent" || c.metadata?.deliveryIssue) return false;
      if (!isEmailAddressedToReception(c, db)) return false;
      const sentMs = new Date(c.metadata?.sentAt || c.created_at || c.createdAt || 0).getTime() || 0;
      if (!sentMs || sentMs <= lastIssueMs) return false;
      return (nowMs - sentMs) >= verifyWaitMs && syncMs >= (sentMs + verifyWaitMs - 5 * 60 * 1000);
    });
    if (cleanProbeComm) {
      return markReceptionEmailRecovered(db, saveDatabase, {
        source: "verified_clean_outbound_delivery",
        reason: `Entrega normalizada confirmada (e-mail '${cleanProbeComm.subject}' sem retorno de DSN)`
      });
    }
  }

  return { recovered: false };
}

export function isReceptionEmailFallbackActive(db) {
  const cfg = ensureReceptionEmailFallbackState(db);
  if (cfg.enabled === false || cfg.mode === "disabled") return false;
  if (cfg.mode === "active" && cfg.manualForce === true) return true;
  evaluateReceptionEmailFallbackAutoRecovery(db);
  if (cfg.autoActiveUntil) {
    const expMs = new Date(cfg.autoActiveUntil).getTime();
    if (!Number.isNaN(expMs) && expMs > Date.now()) {
      return true;
    }
  }
  return false;
}

export function getReceptionEmailAddresses(db) {
  const set = new Set(["soho@promenade.com.br"]);
  const configured = String(db?.settings?.receptionEmail || "").trim().toLowerCase();
  if (configured && configured.includes("@")) set.add(configured);
  if (Array.isArray(db?.flats)) {
    for (const f of db.flats) {
      const fRec = String(f?.receptionEmail || "").trim().toLowerCase();
      if (fRec && fRec.includes("@")) set.add(fRec);
    }
  }
  return set;
}

function extractEmailListLower(raw) {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : String(raw).split(/[,;]/);
  const out = [];
  for (const item of items) {
    const str = String(item || "").trim();
    if (!str) continue;
    const angle = str.match(/<([^>]+)>/);
    const addr = (angle ? angle[1] : str).trim().toLowerCase();
    if (addr && addr.includes("@")) out.push(addr);
  }
  return out;
}

export function isEmailAddressedToReception(commOrParams, db = null) {
  if (!commOrParams || typeof commOrParams !== "object") return false;
  if (commOrParams.type && commOrParams.type !== "email") return false;
  if (commOrParams.direction === "inbound") return false;
  const trigger = String(commOrParams.metadata?.trigger || commOrParams.trigger || "").trim();
  if (trigger === "pre_checkin_completed") return false;

  const receptionAddrs = getReceptionEmailAddresses(db);
  const allRecipients = [
    ...extractEmailListLower(commOrParams.recipient || commOrParams.to),
    ...extractEmailListLower(commOrParams.cc || commOrParams.metadata?.cc),
    ...extractEmailListLower(commOrParams.bcc || commOrParams.metadata?.bcc)
  ];
  return allRecipients.some(addr => receptionAddrs.has(addr));
}

export function getCommBrasiliaDateStr(commOrIso) {
  const raw =
    typeof commOrIso === "string" || commOrIso instanceof Date
      ? commOrIso
      : (commOrIso?.created_at || commOrIso?.createdAt || commOrIso?.metadata?.sentAt || commOrIso?.metadata?.queuedAt || "");
  if (!raw) return "";
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return toBrasiliaDateStr(d);
}

function formatBrasiliaDateTimeDisplay(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate || Date.now());
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
}

export function recordReceptionEmailDeliveryIssue(db, saveDatabase, {
  source = "email_issue",
  reason = "",
  subject = "",
  recipient = "",
  eventAt = null,
  messageId = ""
} = {}) {
  if (!db) return { activated: false, reason: "missing_db" };
  const cfg = ensureReceptionEmailFallbackState(db);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const windowMinutes = Math.max(10, Number(cfg.autoWindowMinutes) || RECEPTION_FALLBACK_DEFAULT_AUTO_WINDOW_MINUTES);
  const windowMs = windowMinutes * 60 * 1000;

  const cleanMsgId = String(messageId || "").trim();
  if (cleanMsgId) {
    if (cfg.processedDsnMessageIds.includes(cleanMsgId)) {
      return { activated: false, ignoredReason: "dsn_already_processed", cfg };
    }
    cfg.processedDsnMessageIds.unshift(cleanMsgId);
    if (cfg.processedDsnMessageIds.length > 500) {
      cfg.processedDsnMessageIds.length = 500;
    }
  }

  const parsedEventMs = eventAt ? new Date(eventAt).getTime() : nowMs;
  const eventMs = !Number.isNaN(parsedEventMs) && parsedEventMs > 0 ? Math.min(parsedEventMs, nowMs) : nowMs;

  // Ignora DSNs antigos (fora da janela de frescor) para que sincronizações históricas nunca reativem o fallback
  if (nowMs - eventMs > windowMs) {
    if (cleanMsgId && typeof saveDatabase === "function") {
      saveDatabase("reception_dsn_stale_seen");
    }
    return { activated: false, ignoredReason: "stale_event_outside_window", cfg };
  }

  // Ignora eventos cujo carimbo de tempo seja anterior ou igual à última recuperação confirmada
  const lastRecoveredMs = cfg.lastRecoveredAt ? new Date(cfg.lastRecoveredAt).getTime() : 0;
  if (lastRecoveredMs > 0 && eventMs <= lastRecoveredMs) {
    if (cleanMsgId && typeof saveDatabase === "function") {
      saveDatabase("reception_dsn_before_recovery");
    }
    return { activated: false, ignoredReason: "event_older_than_recovery", cfg };
  }

  const wasActiveBefore = isReceptionEmailFallbackActive(db);

  cfg.lastIssueEventAt = new Date(eventMs).toISOString();
  cfg.lastIssueDetectedAt = nowIso;
  cfg.lastIssueSource = source;
  cfg.lastIssueReason = String(reason || "Falha/atraso na entrega de e-mail para a recepção").slice(0, 500);

  if (cfg.lastRecoveredAt) {
    cfg.previousRecoveredAt = cfg.lastRecoveredAt;
    cfg.lastRecoveredAt = null;
  }

  let activatedNow = false;
  if (cfg.autoDetect !== false && cfg.enabled !== false && cfg.mode !== "disabled") {
    cfg.autoActiveUntil = new Date(eventMs + windowMs).toISOString();
    if (!cfg.manualForce) {
      cfg.mode = "auto";
    }
    activatedNow = true;
  }

  const notifyFn = globalThis.__corpflatsCreateNotification;
  if (activatedNow && typeof notifyFn === "function" && (!wasActiveBefore || nowMs - lastReceptionFallbackPanelAlertMs > 30 * 60 * 1000)) {
    lastReceptionFallbackPanelAlertMs = nowMs;
    try {
      notifyFn({
        category: "email",
        title: "📲 Fallback WhatsApp Recepção Ativado",
        message: `Detectada instabilidade no e-mail da recepção (${recipient || "soho@promenade.com.br"}: ${cfg.lastIssueReason.slice(0, 120)}). Contingência ativa automaticamente por ${windowMinutes} min no WhatsApp ${cfg.whatsappPhone}.`,
        severity: "warning",
        targetUrl: "/whatsapp-chat?phone=552237040100",
        link: "/whatsapp-chat?phone=552237040100",
        metadata: {
          source,
          reason: cfg.lastIssueReason,
          subject,
          eventAt: cfg.lastIssueEventAt,
          autoActiveUntil: cfg.autoActiveUntil,
          whatsappPhone: cfg.whatsappPhone
        }
      });
    } catch (_) {}
  }

  if (typeof saveDatabase === "function") {
    saveDatabase("reception_email_issue_detected");
  }
  return { activated: activatedNow, cfg };
}

function decodeHtmlEntitiesBasic(str) {
  if (!str) return "";
  return String(str)
    .replace(/&nbsp;/gi, " ")
    .replace(/&bull;/gi, "•")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&rarr;/gi, "→")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCodePoint(n) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const n = parseInt(hex, 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : "";
    });
}

function stripResidualCssNoise(input = "") {
  if (!input) return "";
  let t = String(input);

  // Remove blocos @media aninhados e regras CSS com chaves completas
  t = t.replace(/@media[^{]*\{[\s\S]*?\}\s*\}/gi, " ");
  let prev = "";
  let guard = 0;
  while (t !== prev && guard < 8) {
    prev = t;
    guard++;
    t = t.replace(/(?:^|\n)\s*[.#@a-zA-Z0-9_,\s>+~:[\]="'-]{1,140}\{[^{}]*\}/g, "\n");
  }

  // Remove regra CSS truncada no final da string (ex: ".guest-box { background-color: #FFF; margin-top:")
  t = t.replace(/(?:^|\n)\s*[.#@a-zA-Z0-9_,\s>+~:-]{1,100}\{[^{}]*$/g, "\n");

  const cssPropLineRe =
    /^\s*(?:margin(?:-\w+)?|padding(?:-\w+)?|font-(?:family|size|weight|style)|background(?:-color|-image)?|border(?:-\w+)?|color|width|max-width|min-width|height|display|line-height|letter-spacing|text-(?:align|transform|decoration)|vertical-align|border-collapse|border-radius|-webkit-[\w-]+|-ms-[\w-]+|mso-[\w-]+)\s*:[^;\n]*;?\s*$/i;
  const cssSelectorOnlyLineRe =
    /^\s*(?:body,\s*table|table,\s*td|\.[a-z0-9_-]+(?:\s+\.[a-z0-9_-]+|\s+[a-z0-9_-]+)*|@media\b)[,\s]*\{?\s*$/i;

  return t
    .split(/\r?\n/)
    .filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (trimmed === "{" || trimmed === "}") return false;
      if (cssPropLineRe.test(trimmed)) return false;
      if (cssSelectorOnlyLineRe.test(trimmed)) return false;
      return true;
    })
    .join("\n");
}

export function htmlToStructuredReceptionWhatsAppBody(html = "", fallbackText = "") {
  const source = String(html || "").trim();
  if (!source) {
    return stripResidualCssNoise(String(fallbackText || "")).trim();
  }

  let s = source;

  // Se o template completo CorpFlats tiver <div class="content">, extrai diretamente o miolo útil antes do rodapé
  const contentMatch = s.match(/<div\b[^>]*class=["'][^"']*\bcontent\b[^"']*["'][^>]*>([\s\S]*?)(?:<!--\s*Footer|<hr\b[^>]*margin:\s*32px|<div\b[^>]*class=["'][^"']*\bfooter\b)/i);
  if (contentMatch && contentMatch[1]) {
    s = contentMatch[1];
  } else {
    // Remove blocos completos e TAMBÉM blocos truncados sem tag de fechamento (caso comm.body tenha sido cortado em 3000 chars!)
    s = s
      .replace(/<head\b[\s\S]*?<\/head>/gi, "")
      .replace(/<style\b[\s\S]*?<\/style>/gi, "")
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/<title\b[\s\S]*?<\/title>/gi, "")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "")
      .replace(/<xml\b[\s\S]*?<\/xml>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "");

    // Se <style, <script, <!-- ou <head (sem <body) ficou aberto por truncamento, descarta tudo dali até o fim
    s = s
      .replace(/<style\b[\s\S]*$/gi, "")
      .replace(/<script\b[\s\S]*$/gi, "")
      .replace(/<!--[\s\S]*$/g, "");

    if (/<head\b/i.test(s) && !/<body\b/i.test(s)) {
      s = s.replace(/<head\b[\s\S]*$/gi, "");
    }

    s = s
      .replace(/<div[^>]*class=["'][^"']*header[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "")
      .replace(/<div[^>]*class=["'][^"']*footer[^"']*["'][^>]*>[\s\S]*$/gi, "");
  }

  // Preserva links operacionais úteis (Terminal da Portaria, Check-in Digital, Verificação FNRH)
  s = s.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const cleanHref = decodeHtmlEntitiesBasic(String(href || "").trim());
    const cleanInner = decodeHtmlEntitiesBasic(String(inner || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!cleanHref || cleanHref.startsWith("mailto:") || cleanHref.startsWith("tel:") || cleanHref.startsWith("#")) {
      return cleanInner;
    }
    if (/\/(portaria|pre-checkin|verificar-ficha|credenciamento|servico)/i.test(cleanHref)) {
      if (cleanInner && !cleanInner.includes(cleanHref)) {
        return `\n🔗 *${cleanInner}:* ${cleanHref}\n`;
      }
      return `\n🔗 ${cleanHref}\n`;
    }
    return cleanInner || cleanHref;
  });

  // Tachado (ex: Flat anterior em alterações de reserva)
  s = s.replace(/<span\b[^>]*line-through[^>]*>([\s\S]*?)<\/span>/gi, (_, inner) => {
    const clean = String(inner || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return clean ? `~${clean}~` : "";
  });
  s = s.replace(/<(?:s|strike|del)\b[^>]*>([\s\S]*?)<\/(?:s|strike|del)>/gi, (_, inner) => {
    const clean = String(inner || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return clean ? `~${clean}~` : "";
  });

  // Negrito
  s = s.replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, (_, inner) => {
    const clean = String(inner || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return clean ? `*${clean}*` : "";
  });

  // Tabelas chave-valor de 2 colunas (Apartamento, Código, Datas, Placa, etc.)
  s = s.replace(/<tr\b[^>]*>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi, (_, col1, col2) => {
    const k = decodeHtmlEntitiesBasic(String(col1 || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    const v = decodeHtmlEntitiesBasic(String(col2 || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!k && !v) return "";
    if (!k) return `\n${v}\n`;
    if (/^corpflats\b/i.test(k) && /gest[aã]o de hospedag/i.test(k)) {
      return v ? `\n*${v}*\n` : "";
    }
    const cleanKey = k.replace(/^\*+|\*+$/g, "").replace(/:$/, "").trim();
    return `\n• *${cleanKey}:* ${v}\n`;
  });

  // Quebras de bloco e listas
  s = s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/(?:p|div|li|tr|h1|h2|h3|h4|h5|h6|table|ul|ol|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  s = decodeHtmlEntitiesBasic(s);
  s = stripResidualCssNoise(s);

  // Remove rodapés institucionais automáticos
  s = s
    .replace(/CorpFlats\s*•\s*Sistema Transacional de Hotelaria[\s\S]*$/i, "")
    .replace(/Este [eé] um e-mail transacional automatizado[\s\S]*$/i, "")
    .replace(/Mensagem autom[aá]tica enviada pelo sistema de gest[aã]o[\s\S]*$/i, "");

  const lines = s
    .split(/\r?\n/)
    .map(line =>
      line
        .replace(/[ \t]+/g, " ")
        .replace(/\*{2,}/g, "*")
        .replace(/^•\s*•\s*/, "• ")
        .trim()
    );

  const compacted = [];
  for (const line of lines) {
    if (!line) {
      if (compacted.length > 0 && compacted[compacted.length - 1] !== "") {
        compacted.push("");
      }
      continue;
    }
    if (
      compacted.length <= 3 &&
      /^(corpflats(?:\s*•\s*gest[aã]o de hospedage[mn]s?)?|gest[aã]o de hospedage[mn]s?|informativo operacional)$/i.test(
        line.replace(/\*/g, "").trim()
      )
    ) {
      continue;
    }
    if (
      line.startsWith("• ") &&
      compacted.length >= 2 &&
      compacted[compacted.length - 1] === "" &&
      compacted[compacted.length - 2].startsWith("• ")
    ) {
      compacted.pop();
    }
    compacted.push(line);
  }

  const out = compacted.join("\n").trim();
  if (out) return out;
  return stripResidualCssNoise(String(fallbackText || "")).trim();
}

function formatIsoDateToBrShort(dateStr) {
  const s = String(dateStr || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

function buildReceptionSummaryFromReservationAndMeta(comm, reservation = null, db = null) {
  const subject = String(comm?.subject || "").trim();
  const trigger = String(comm?.metadata?.trigger || "").trim().toLowerCase();
  const lines = [];

  const isCancel = trigger.includes("cancel") || /cancelamento|cancelad[oa]/i.test(subject);
  const flatChangeMatch = subject.match(/Flat\s*(\w+)\s+alterad[oa]\s+para\s+Flat\s*(\w+)/i);
  const isUpdate = Boolean(flatChangeMatch) || trigger.includes("update") || /atualiza[cç][aã]o|alterad[oa]/i.test(subject);

  if (isCancel) {
    lines.push("🚫 *Reserva Cancelada — Desautorizar Acesso na Portaria*");
  } else if (isUpdate) {
    lines.push("🔄 *Atualização de Reserva / Unidade*");
  } else {
    lines.push("✅ *Autorização de Hospedagem e Liberação na Portaria*");
  }
  lines.push("");

  const flatFromSubj = subject.match(/Flat\s*(\d+[A-Za-z]?)/i)?.[1] || "";
  const flatNum = String(
    (flatChangeMatch ? flatChangeMatch[2] : "") ||
    reservation?.flatNumber ||
    comm?.metadata?.flatNumber ||
    flatFromSubj ||
    ""
  ).replace(/^flat\s*/i, "").trim();

  if (flatChangeMatch) {
    lines.push(`• *Mudança de Unidade:* ~Flat ${flatChangeMatch[1]}~ → *Flat ${flatChangeMatch[2]}*`);
  } else if (flatNum) {
    lines.push(`• *Apartamento:* Flat ${flatNum}`);
  }

  const resCode = reservation?.code || (comm?.reservation_id && comm.reservation_id !== "0" ? comm.reservation_id : comm?.metadata?.reservationCode) || "";
  if (resCode && resCode !== "MANUAL") {
    lines.push(`• *Reserva:* #${resCode}`);
  }

  let guestName = reservation?.guestName || comm?.metadata?.guestName || "";
  if (!guestName) {
    const subjGuest = subject.match(/Flat\s*\w+\s*-\s*([^(]+?)(?:\s*\(|$)/i);
    if (subjGuest) guestName = subjGuest[1].trim();
  }
  const guestDoc = reservation?.guestDocument || reservation?.guestCpf || reservation?.cpf || "";
  if (guestName) {
    lines.push(`• *Hóspede Titular:* ${guestName}${guestDoc ? ` (Doc: ${guestDoc})` : ""}`);
  }

  const companions = Array.isArray(reservation?.additionalGuests)
    ? reservation.additionalGuests
    : (Array.isArray(reservation?.companions) ? reservation.companions : []);
  for (let i = 0; i < companions.length; i++) {
    const comp = companions[i];
    const cName = String(comp?.name || comp?.fullName || "").trim();
    const cDoc = String(comp?.cpf || comp?.document || comp?.rg || "").trim();
    if (cName) {
      lines.push(`• *Acompanhante ${i + 1}:* ${cName}${cDoc ? ` (Doc: ${cDoc})` : ""}`);
    }
  }

  const datesFromSubj = subject.match(/\((\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})\)/i);
  const checkinBr = reservation?.checkinDate ? formatIsoDateToBrShort(reservation.checkinDate) : (datesFromSubj?.[1] || "");
  const checkoutBr = reservation?.checkoutDate ? formatIsoDateToBrShort(reservation.checkoutDate) : (datesFromSubj?.[2] || "");
  if (checkinBr && checkoutBr) {
    const ciTime = reservation?.earlyCheckinTime || reservation?.checkinTime || "14:00";
    const coTime = reservation?.lateCheckoutTime || reservation?.checkoutTime || "12:00";
    lines.push(`• *Período:* ${checkinBr} (entrada ${ciTime}) a ${checkoutBr} (saída ${coTime})`);
  }

  const plate = String(reservation?.vehiclePlate || reservation?.carPlate || reservation?.licensePlate || "").trim();
  const model = [reservation?.vehicleModel || reservation?.carModel, reservation?.vehicleColor || reservation?.carColor]
    .map(v => String(v || "").trim())
    .filter(Boolean)
    .join(" ");
  if (plate || model) {
    lines.push(`• *Veículo:* ${[model, plate ? `Placa *${plate.toUpperCase()}*` : ""].filter(Boolean).join(" — ")}`);
  }

  if (!isCancel) {
    const baseUrl = String(process.env.SERVER_BASE_URL || db?.settings?.publicBaseUrl || "https://corpflats.com.br").replace(/\/+$/, "");
    lines.push(`\n🔗 *Terminal da Portaria:* ${baseUrl}/portaria`);
  }

  return lines.join("\n").trim();
}

export function formatReceptionEmailForWhatsApp({
  comm,
  rawBodyHtml = "",
  reservation = null,
  db = null,
  attachmentCount = 0,
  isRetroactive = false
} = {}) {
  const subject = String(comm?.subject || "Informativo Operacional Recepção").trim();
  const createdIso = comm?.created_at || comm?.createdAt || comm?.metadata?.sentAt || new Date().toISOString();
  const sentTimeBr = formatBrasiliaDateTimeDisplay(createdIso);
  const ccRaw = String(comm?.cc || comm?.metadata?.cc || "").toLowerCase();
  const ccHasGarage = ccRaw.includes("pfbestacionamentos") || Boolean(comm?.metadata?.garageEmail && ccRaw.includes(String(comm.metadata.garageEmail).toLowerCase()));

  let bodyFormatted = "";
  if (rawBodyHtml && String(rawBodyHtml).trim()) {
    bodyFormatted = htmlToStructuredReceptionWhatsAppBody(rawBodyHtml, comm?.bodyText || "");
  }
  if (!bodyFormatted && comm?.metadata?.cleanBodyText) {
    bodyFormatted = stripResidualCssNoise(String(comm.metadata.cleanBodyText)).trim();
  }
  if (!bodyFormatted) {
    bodyFormatted = htmlToStructuredReceptionWhatsAppBody(comm?.body || comm?.bodyHtml || "", comm?.bodyText || "");
  }
  // Caso o corpo salvo em comm.body tenha sido truncado no meio do <head>/<style> ou contenha apenas o assunto repetido
  if (!bodyFormatted || bodyFormatted === subject || bodyFormatted.length < 15) {
    bodyFormatted = buildReceptionSummaryFromReservationAndMeta(comm, reservation, db);
  }

  if (bodyFormatted.length > 3300) {
    bodyFormatted = `${bodyFormatted.slice(0, 3290).trim()}…`;
  }

  const headerLines = [
    "📧➡️📲 *[E-MAIL RECEPÇÃO • FALLBACK WHATSAPP]*",
    `📌 *Assunto:* ${subject}`,
    `🕒 *Envio original:* ${sentTimeBr}${isRetroactive ? " _(reenvio de contingência — hoje)_" : ""}`
  ];
  if (ccHasGarage) {
    headerLines.push("🅿️ _Cópia enviada também à Garagem (PFB)_");
  }
  headerLines.push("────────────────────");

  const parts = [headerLines.join("\n"), bodyFormatted];
  if (attachmentCount > 0) {
    parts.push(`────────────────────\n📎 *${attachmentCount} anexo(s)* enviado(s) logo abaixo nesta conversa.`);
  }

  return parts.filter(Boolean).join("\n").trim();
}

export function healDirtyCssReceptionFallbackMessages(db) {
  if (!db || !db.whatsappConversations || typeof db.whatsappConversations !== "object") {
    return 0;
  }
  const commsByMsgId = new Map();
  if (Array.isArray(db.reservationCommunications)) {
    for (const c of db.reservationCommunications) {
      const mid = c?.metadata?.whatsappFallbackMessageId;
      if (mid) commsByMsgId.set(String(mid), c);
    }
  }

  let healed = 0;
  for (const [phoneKey, conv] of Object.entries(db.whatsappConversations)) {
    const digits = String(conv?.phone || phoneKey || "").replace(/\D/g, "");
    if (!digits.endsWith("2237040100") && !digits.endsWith("37040100")) continue;
    if (!Array.isArray(conv?.messages)) continue;

    for (const msg of conv.messages) {
      if (!msg || typeof msg.text !== "string") continue;
      const looksLikeCssLeak =
        msg.text.includes("-webkit-text-size-adjust") ||
        msg.text.includes("mso-table-lspace") ||
        msg.text.includes(".email-card") ||
        msg.text.includes(".info-table");
      if (!looksLikeCssLeak) continue;

      let matchedComm = msg.messageId ? commsByMsgId.get(String(msg.messageId)) : null;
      if (!matchedComm && Array.isArray(db.reservationCommunications)) {
        const subjMatch = msg.text.match(/\*Assunto:\*\s*([^\r\n]+)/);
        const subj = subjMatch ? subjMatch[1].trim() : "";
        if (subj) {
          matchedComm = db.reservationCommunications.find(c => String(c?.subject || "").trim() === subj) || null;
        }
      }
      if (matchedComm) {
        const res = findReservationForComm(db, matchedComm);
        const attCount = Number(matchedComm.metadata?.whatsappFallbackAttachmentsSent || 0);
        msg.text = formatReceptionEmailForWhatsApp({
          comm: matchedComm,
          reservation: res,
          db,
          attachmentCount: attCount,
          isRetroactive: Boolean(matchedComm.metadata?.whatsappFallbackIsRetroactive)
        });
      } else {
        msg.text = stripResidualCssNoise(msg.text).trim();
      }
      healed++;
    }
  }
  return healed;
}

function findReservationForComm(db, comm) {
  if (!db || !comm) return null;
  const reservations = Array.isArray(db.reservations) ? db.reservations : [];
  const rawResId = String(comm.reservation_id || comm.reservationCode || comm.metadata?.reservationCode || "").trim();
  if (rawResId && rawResId !== "0" && rawResId !== "MANUAL") {
    const upper = rawResId.toUpperCase();
    const direct = reservations.find(
      r => r && (String(r.id) === rawResId || String(r.code || "").trim().toUpperCase() === upper)
    );
    if (direct) return direct;
  }
  // Fallback por assunto + data de hoje se reservation_id estiver ausente
  const metaFlat = String(comm.metadata?.flatNumber || "").replace(/^flat\s*/i, "").trim();
  const metaGuest = String(comm.metadata?.guestName || "").trim().toLowerCase();
  if (metaFlat && metaGuest) {
    const candidates = reservations.filter(r => {
      if (!r) return false;
      const rFlat = String(r.flatNumber || "").replace(/^flat\s*/i, "").trim();
      const rGuest = String(r.guestName || "").trim().toLowerCase();
      return rFlat === metaFlat && (rGuest === metaGuest || rGuest.includes(metaGuest) || metaGuest.includes(rGuest));
    });
    if (candidates.length === 1) return candidates[0];
  }
  return null;
}

function inferAttachmentMimeAndExt(filename = "", contentType = "", buf = null) {
  const cleanContent = String(contentType || "").split(";")[0].trim().toLowerCase();
  const extFromName = String(filename || "").includes(".")
    ? String(filename).split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";

  if (Buffer.isBuffer(buf) && buf.length >= 4) {
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
      return { ext: "pdf", mime: "application/pdf" };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return { ext: "jpg", mime: "image/jpeg" };
    }
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { ext: "png", mime: "image/png" };
    }
    if (
      buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
    ) {
      return { ext: "webp", mime: "image/webp" };
    }
  }

  const mimeToExt = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx"
  };
  const extToMime = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  };

  if (cleanContent && mimeToExt[cleanContent]) {
    return { ext: extFromName && extToMime[extFromName] ? extFromName : mimeToExt[cleanContent], mime: cleanContent };
  }
  if (extFromName && extToMime[extFromName]) {
    return { ext: extFromName, mime: extToMime[extFromName] };
  }
  return { ext: extFromName || "pdf", mime: cleanContent || "application/pdf" };
}

async function materializeSingleAttachment(att, commId, index) {
  if (!att) return null;
  let buf = null;
  let remoteUrl = null;
  let detectedContentType = att.contentType || "";

  if (Buffer.isBuffer(att.content)) {
    buf = att.content;
  } else if (typeof att.content === "string" && att.content.trim()) {
    const raw = att.content.trim();
    const dataMatch = raw.match(/^data:([^;]+);base64,(.+)$/i);
    if (dataMatch) {
      detectedContentType = detectedContentType || dataMatch[1];
      buf = Buffer.from(dataMatch[2], "base64");
    } else {
      buf = Buffer.from(raw, att.encoding || "base64");
    }
  } else if (typeof att.path === "string" && att.path.trim()) {
    const p = att.path.trim();
    const dataMatch = p.match(/^data:([^;]+);base64,(.+)$/i);
    if (dataMatch) {
      detectedContentType = detectedContentType || dataMatch[1];
      buf = Buffer.from(dataMatch[2], "base64");
    } else if (/^https?:\/\//i.test(p)) {
      remoteUrl = p;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const resp = await fetch(p, { signal: controller.signal });
        clearTimeout(timer);
        if (resp.ok) {
          detectedContentType = detectedContentType || resp.headers.get("content-type") || "";
          const ab = await resp.arrayBuffer();
          buf = Buffer.from(ab);
        }
      } catch (fetchErr) {
        console.warn(`[ReceptionFallback] Aviso ao baixar anexo remoto (${p}):`, fetchErr?.message || fetchErr);
      }
    } else {
      let diskCandidate = p;
      if (p.startsWith("/api/storage/files/")) {
        diskCandidate = path.join(__dirname, "uploads", p.replace(/^\/api\/storage\/files\//, ""));
      } else if (p.startsWith("/storage/files/")) {
        diskCandidate = path.join(__dirname, "uploads", p.replace(/^\/storage\/files\//, ""));
      }
      if (fs.existsSync(diskCandidate)) {
        try {
          buf = fs.readFileSync(diskCandidate);
        } catch (readErr) {
          console.warn(`[ReceptionFallback] Aviso ao ler anexo local (${diskCandidate}):`, readErr?.message || readErr);
        }
      }
    }
  }

  if ((!buf || buf.length === 0) && !remoteUrl) {
    return null;
  }

  const rawName = String(att.filename || att.name || `Anexo_${index + 1}`).trim();
  const { ext, mime } = inferAttachmentMimeAndExt(rawName, detectedContentType, buf);
  const baseWithoutExt = rawName.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[^\w\-.À-ÿ ()]/g, "_").trim() || `Anexo_${index + 1}`;
  const finalFileName = `${baseWithoutExt}.${ext}`;

  let diskRelPath = null;
  if (buf && buf.length > 0) {
    try {
      const relDir = "reception-fallback";
      const targetDir = path.join(__dirname, "uploads", relDir);
      fs.mkdirSync(targetDir, { recursive: true });
      const safeDiskFile = `${String(commId).replace(/[^a-zA-Z0-9_-]/g, "")}_${index}_${finalFileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const absTarget = path.join(targetDir, safeDiskFile);
      fs.writeFileSync(absTarget, buf);
      diskRelPath = `${relDir}/${safeDiskFile}`;
    } catch (writeErr) {
      console.warn("[ReceptionFallback] Aviso ao persistir cópia local do anexo:", writeErr?.message || writeErr);
    }
  }

  const base64DataUri = buf && buf.length > 0 ? `data:${mime};base64,${buf.toString("base64")}` : null;
  const chatMediaUrl = `/api/emails/reception-fallback/attachment/${encodeURIComponent(String(commId))}/${index}/${encodeURIComponent(finalFileName)}`;

  return {
    fileName: finalFileName,
    mimeType: mime,
    extension: ext,
    base64DataUri,
    remoteUrl,
    diskRelPath,
    chatMediaUrl,
    sizeBytes: buf ? buf.length : 0
  };
}

function hasCommBeenForwardedToReceptionWhatsApp(db, comm) {
  if (!comm) return false;
  if (comm.metadata?.whatsappFallbackSent === true || comm.metadata?.whatsappFallbackSentAt) {
    return true;
  }
  const sentList = Array.isArray(db?.receptionWhatsappFallbackSentIds) ? db.receptionWhatsappFallbackSentIds : [];
  return sentList.some(item => (typeof item === "string" ? item === comm.id : item?.commId === comm.id));
}

export async function forwardReceptionEmailToWhatsApp({
  db,
  saveDatabase = null,
  comm,
  rawBodyHtml = "",
  rawAttachments = [],
  reservation = null,
  isRetroactive = false,
  triggerSource = "live",
  allowResend = false,
  todayBrOverride = "",
  overrides = {}
} = {}) {
  if (!db || !comm || !comm.id) {
    return { forwarded: false, reason: "invalid_comm" };
  }
  if (!isEmailAddressedToReception(comm, db)) {
    return { forwarded: false, reason: "not_addressed_to_reception" };
  }

  const commBrDate = getCommBrasiliaDateStr(comm);
  const todayBr = todayBrOverride || getBrasiliaTodayStr();
  const createdMs = new Date(comm.created_at || comm.createdAt || comm.metadata?.sentAt || 0).getTime() || 0;

  // TRAVA ABSOLUTA DE DATA: NUNCA enviar nada anterior a 2026-11-13 nem de dias anteriores ("nada de ontem")
  if (!commBrDate || commBrDate < RECEPTION_FALLBACK_HARD_MIN_DATE_BR) {
    return { forwarded: false, skipped: true, reason: "before_hard_min_date", commBrDate, todayBr };
  }
  if (isRetroactive && commBrDate < todayBr) {
    return { forwarded: false, skipped: true, reason: "before_today_retroactive_cutoff", commBrDate, todayBr };
  }
  if (!isRetroactive && !allowResend && commBrDate < todayBr && (Date.now() - createdMs > 15 * 60 * 1000)) {
    return { forwarded: false, skipped: true, reason: "stale_previous_day_email", commBrDate, todayBr };
  }

  if (!allowResend && hasCommBeenForwardedToReceptionWhatsApp(db, comm)) {
    return { forwarded: false, skipped: true, reason: "already_forwarded" };
  }
  if (inFlightReceptionFallbackIds.has(comm.id)) {
    return { forwarded: false, skipped: true, reason: "in_flight" };
  }

  const cfg = ensureReceptionEmailFallbackState(db);
  const cleanPhone = normalizeBrazilWhatsAppPhone(cfg.whatsappPhone || RECEPTION_FALLBACK_DEFAULT_PHONE);
  if (!cleanPhone) {
    return { forwarded: false, reason: "missing_reception_whatsapp_phone" };
  }

  const sendZapiFn = overrides?.sendZapiMessageFn || globalThis.__corpflatsSendZapiMessage;
  const sendZapiDocFn = overrides?.sendZapiDocumentFn || globalThis.__corpflatsSendZapiDocument;
  const appendConvFn = overrides?.appendMessageToConversationFn || globalThis.__corpflatsAppendMessageToConversation;

  if (typeof sendZapiFn !== "function") {
    return { forwarded: false, reason: "zapi_sender_unavailable" };
  }

  inFlightReceptionFallbackIds.add(comm.id);
  try {
    const matchedRes = reservation || findReservationForComm(db, comm);
    let candidateAttachments = Array.isArray(rawAttachments) ? [...rawAttachments] : [];

    const commExpectedAttachments = Boolean(
      comm.metadata?.hasAttachments ||
      Number(comm.metadata?.attachmentsCount || 0) > 0 ||
      comm.metadata?.hasPdfAttached ||
      comm.metadata?.hasDocumentAttached
    );

    if (candidateAttachments.length === 0 && commExpectedAttachments && matchedRes) {
      try {
        const readyAtts = await ensureReservationAttachmentsReady({ reservation: matchedRes, db });
        if (Array.isArray(readyAtts) && readyAtts.length > 0) {
          candidateAttachments = readyAtts;
        }
      } catch (_) {
        try {
          const syncAtts = resolveReservationAttachments({ reservation: matchedRes, db });
          if (Array.isArray(syncAtts) && syncAtts.length > 0) {
            candidateAttachments = syncAtts;
          }
        } catch (__) {}
      }
    }

    const materializedAttachments = [];
    for (let i = 0; i < candidateAttachments.length; i++) {
      const mat = await materializeSingleAttachment(candidateAttachments[i], comm.id, i);
      if (mat) materializedAttachments.push(mat);
    }

    const formattedText = formatReceptionEmailForWhatsApp({
      comm,
      rawBodyHtml,
      reservation: matchedRes,
      db,
      attachmentCount: materializedAttachments.length,
      isRetroactive
    });

    const textSendRes = await sendZapiFn(cleanPhone, formattedText, {
      bypassTestMode: true,
      recipientRole: "reception",
      channelId: "reception",
      triggerEvent: "reception_email_fallback"
    });

    if (!textSendRes || !textSendRes.success) {
      return {
        forwarded: false,
        reason: "zapi_text_send_failed",
        error: textSendRes?.error || "Falha ao enviar texto via Z-API"
      };
    }

    const nowIso = new Date().toISOString();
    const textMsgId = textSendRes.messageId || `rec_fb_txt_${comm.id}_${Date.now()}`;

    if (typeof appendConvFn === "function") {
      try {
        appendConvFn({
          phone: cleanPhone,
          senderName: "CorpFlats",
          fromMe: true,
          text: formattedText,
          type: "text",
          triggerEvent: "reception_email_fallback",
          status: "delivered",
          timestamp: nowIso,
          messageId: textMsgId
        });
      } catch (_) {}
    }

    const attachmentResults = [];
    const attachmentSpacingMs = overrides?.attachmentDelayMs !== undefined ? Number(overrides.attachmentDelayMs) : 550;
    const flatLabel = matchedRes?.flatNumber || comm?.metadata?.flatNumber
      ? `Flat ${String(matchedRes?.flatNumber || comm?.metadata?.flatNumber).replace(/^flat\s*/i, "").trim()}`
      : "";
    const guestLabel = matchedRes?.guestName || comm?.metadata?.guestName || "";
    const contextSuffix = [flatLabel, guestLabel].filter(Boolean).join(" • ");

    for (let idx = 0; idx < materializedAttachments.length; idx++) {
      const attItem = materializedAttachments[idx];
      if (attachmentSpacingMs > 0) {
        await new Promise(resolve => setTimeout(resolve, attachmentSpacingMs));
      }
      const attCaption = `📎 Anexo (${idx + 1}/${materializedAttachments.length}): ${attItem.fileName}${contextSuffix ? ` — ${contextSuffix}` : ""}`;

      let docRes = null;
      if (typeof sendZapiDocFn === "function") {
        docRes = await sendZapiDocFn({
          phone: cleanPhone,
          document: attItem.base64DataUri || attItem.remoteUrl,
          fileName: attItem.fileName,
          caption: attCaption,
          bypassTestMode: true,
          recipientRole: "reception",
          channelId: "reception",
          triggerEvent: "reception_email_fallback_attachment"
        });
      }

      const docMsgId = docRes?.messageId || `rec_fb_doc_${comm.id}_${idx}_${Date.now()}`;
      attachmentResults.push({
        fileName: attItem.fileName,
        mimeType: attItem.mimeType,
        chatMediaUrl: attItem.chatMediaUrl,
        remoteUrl: attItem.remoteUrl || null,
        diskRelPath: attItem.diskRelPath || null,
        success: Boolean(docRes?.success),
        messageId: docMsgId,
        error: docRes?.success ? null : (docRes?.error || "Falha no envio do documento")
      });

      if (typeof appendConvFn === "function") {
        try {
          appendConvFn({
            phone: cleanPhone,
            senderName: "CorpFlats",
            fromMe: true,
            text: attCaption,
            type: "document",
            mediaUrl: attItem.chatMediaUrl,
            fileName: attItem.fileName,
            caption: attCaption,
            triggerEvent: "reception_email_fallback_attachment",
            status: docRes?.success ? "delivered" : "failed",
            timestamp: new Date().toISOString(),
            messageId: docMsgId
          });
        } catch (_) {}
      }
    }

    comm.metadata = comm.metadata || {};
    comm.metadata.whatsappFallbackSent = true;
    comm.metadata.whatsappFallbackSentAt = nowIso;
    comm.metadata.whatsappFallbackPhone = cleanPhone;
    comm.metadata.whatsappFallbackMessageId = textMsgId;
    comm.metadata.whatsappFallbackTrigger = triggerSource;
    comm.metadata.whatsappFallbackIsRetroactive = Boolean(isRetroactive);
    comm.metadata.whatsappFallbackAttachmentsSent = attachmentResults.filter(a => a.success).length;
    comm.metadata.whatsappFallbackAttachmentMeta = attachmentResults.map(a => ({
      fileName: a.fileName,
      mimeType: a.mimeType,
      chatMediaUrl: a.chatMediaUrl,
      remoteUrl: a.remoteUrl,
      diskRelPath: a.diskRelPath,
      messageId: a.messageId,
      success: a.success
    }));

    if (!Array.isArray(db.receptionWhatsappFallbackSentIds)) {
      db.receptionWhatsappFallbackSentIds = [];
    }
    if (!db.receptionWhatsappFallbackSentIds.some(x => (typeof x === "string" ? x === comm.id : x?.commId === comm.id))) {
      db.receptionWhatsappFallbackSentIds.unshift({
        commId: comm.id,
        reservationId: comm.reservation_id || null,
        subject: comm.subject,
        originalCreatedAt: comm.created_at || comm.createdAt || nowIso,
        sentAt: nowIso,
        phone: cleanPhone,
        messageId: textMsgId,
        attachmentsSent: comm.metadata.whatsappFallbackAttachmentsSent,
        triggerSource
      });
      if (db.receptionWhatsappFallbackSentIds.length > 1000) {
        db.receptionWhatsappFallbackSentIds = db.receptionWhatsappFallbackSentIds.slice(0, 1000);
      }
    }

    cfg.totalForwardedCount = (Number(cfg.totalForwardedCount) || 0) + 1;
    cfg.lastForwardedAt = nowIso;

    if (typeof saveDatabase === "function") {
      saveDatabase("reception_email_whatsapp_fallback");
    }

    console.log(
      `[ReceptionFallback ✓] E-mail '${comm.subject}' encaminhado para WhatsApp ${cleanPhone} (${attachmentResults.filter(a => a.success).length}/${materializedAttachments.length} anexo(s)).`
    );

    return {
      forwarded: true,
      commId: comm.id,
      subject: comm.subject,
      phone: cleanPhone,
      messageId: textMsgId,
      attachmentsTotal: materializedAttachments.length,
      attachmentsSent: attachmentResults.filter(a => a.success).length,
      attachmentResults
    };
  } finally {
    inFlightReceptionFallbackIds.delete(comm.id);
  }
}

export async function dispatchRetroactiveTodayReceptionEmailsToWhatsApp(db, saveDatabase = null, options = {}) {
  if (!db) return { ok: false, reason: "missing_db" };
  const cfg = ensureReceptionEmailFallbackState(db);
  if (!options.force && !isReceptionEmailFallbackActive(db)) {
    return { ok: true, skipped: true, reason: "fallback_inactive", sentCount: 0 };
  }

  if (retroactiveReceptionSweepPromise) {
    return retroactiveReceptionSweepPromise;
  }

  const runPromise = (async () => {
    const todayBr = options.todayBrOverride || getBrasiliaTodayStr();
    if (!todayBr || todayBr < RECEPTION_FALLBACK_HARD_MIN_DATE_BR) {
      return { ok: false, reason: "invalid_today_date", todayBr };
    }

    const prevRecoveredMs = !options.force && cfg.previousRecoveredAt
      ? new Date(cfg.previousRecoveredAt).getTime() || 0
      : 0;

    const allComms = Array.isArray(db.reservationCommunications) ? db.reservationCommunications : [];
    const eligibleToday = allComms
      .filter(c => {
        if (!c || !isEmailAddressedToReception(c, db)) return false;
        const brDate = getCommBrasiliaDateStr(c);
        // ESTRITAMENTE HOJE (>= 2026-11-13 e === todayBr): nada de ontem ou dias anteriores!
        if (!brDate || brDate < RECEPTION_FALLBACK_HARD_MIN_DATE_BR || brDate !== todayBr) return false;
        if (!options.allowResend && hasCommBeenForwardedToReceptionWhatsApp(db, c)) return false;
        // Se o e-mail já havia normalizado antes no mesmo dia e houve nova queda depois, varre apenas o período da nova queda
        if (prevRecoveredMs > 0 && c.status !== "failed" && !c.metadata?.deliveryIssue) {
          const cMs = new Date(c.created_at || c.createdAt || c.metadata?.sentAt || 0).getTime() || 0;
          if (cMs > 0 && cMs < prevRecoveredMs - 45 * 60 * 1000) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const msA = new Date(a.created_at || a.createdAt || a.metadata?.sentAt || 0).getTime() || 0;
        const msB = new Date(b.created_at || b.createdAt || b.metadata?.sentAt || 0).getTime() || 0;
        return msA - msB;
      });

    const pacingDelayMs = options.pacingDelayMs !== undefined ? Number(options.pacingDelayMs) : 1100;
    const results = [];

    for (let i = 0; i < eligibleToday.length; i++) {
      const comm = eligibleToday[i];
      if (i > 0 && pacingDelayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, pacingDelayMs));
      }
      const res = await forwardReceptionEmailToWhatsApp({
        db,
        saveDatabase,
        comm,
        isRetroactive: true,
        triggerSource: options.triggerSource || "retroactive_today_sweep",
        allowResend: Boolean(options.allowResend),
        todayBrOverride: todayBr,
        overrides: options.overrides || {}
      });
      results.push({
        commId: comm.id,
        subject: comm.subject,
        created_at: comm.created_at || comm.createdAt,
        ...res
      });
    }

    return {
      ok: true,
      todayBr,
      minDateBrasilia: RECEPTION_FALLBACK_HARD_MIN_DATE_BR,
      candidatesFound: eligibleToday.length,
      sentCount: results.filter(r => r.forwarded).length,
      attachmentsSentTotal: results.reduce((acc, r) => acc + (Number(r.attachmentsSent) || 0), 0),
      results
    };
  })().finally(() => {
    if (retroactiveReceptionSweepPromise === runPromise) {
      retroactiveReceptionSweepPromise = null;
    }
  });

  retroactiveReceptionSweepPromise = runPromise;
  return runPromise;
}

export function getReceptionEmailFallbackStatusSummary(db) {
  const cfg = ensureReceptionEmailFallbackState(db);
  const todayBr = getBrasiliaTodayStr();
  const allComms = Array.isArray(db?.reservationCommunications) ? db.reservationCommunications : [];

  const todayReceptionComms = allComms
    .filter(c => {
      if (!c || !isEmailAddressedToReception(c, db)) return false;
      const brDate = getCommBrasiliaDateStr(c);
      return brDate >= RECEPTION_FALLBACK_HARD_MIN_DATE_BR && brDate === todayBr;
    })
    .sort((a, b) => new Date(a.created_at || a.createdAt || 0).getTime() - new Date(b.created_at || b.createdAt || 0).getTime())
    .map(c => ({
      id: c.id,
      reservationId: c.reservation_id,
      subject: c.subject,
      recipient: c.recipient,
      cc: c.cc || c.metadata?.cc || null,
      emailStatus: c.status,
      deliveryIssue: c.metadata?.deliveryIssue || null,
      created_at: c.created_at || c.createdAt,
      brDate: getCommBrasiliaDateStr(c),
      hasAttachments: Boolean(c.metadata?.hasAttachments || Number(c.metadata?.attachmentsCount || 0) > 0),
      attachmentsCount: Number(c.metadata?.attachmentsCount || 0),
      whatsappForwarded: hasCommBeenForwardedToReceptionWhatsApp(db, c),
      whatsappForwardedAt: c.metadata?.whatsappFallbackSentAt || null,
      whatsappMessageId: c.metadata?.whatsappFallbackMessageId || null,
      whatsappAttachmentsSent: Number(c.metadata?.whatsappFallbackAttachmentsSent || 0),
      attachmentMeta: c.metadata?.whatsappFallbackAttachmentMeta || []
    }));

  return {
    active: isReceptionEmailFallbackActive(db),
    todayBr,
    config: cfg,
    receptionEmails: Array.from(getReceptionEmailAddresses(db)),
    whatsappTargetClean: normalizeBrazilWhatsAppPhone(cfg.whatsappPhone),
    todayTotalReceptionEmails: todayReceptionComms.length,
    todayForwardedCount: todayReceptionComms.filter(c => c.whatsappForwarded).length,
    todayPendingCount: todayReceptionComms.filter(c => !c.whatsappForwarded).length,
    todayCommunications: todayReceptionComms
  };
}

export async function serveReceptionFallbackAttachment(db, req, res) {
  try {
    const commId = String(req.params?.commId || "").trim();
    const attIndex = Math.max(0, Number(req.params?.attIndex) || 0);
    const comm = (db?.reservationCommunications || []).find(c => String(c?.id) === commId);
    if (!comm) {
      return res.status(404).json({ error: "Comunicação de e-mail não encontrada." });
    }

    const metaList = Array.isArray(comm.metadata?.whatsappFallbackAttachmentMeta)
      ? comm.metadata.whatsappFallbackAttachmentMeta
      : [];
    const metaItem = metaList[attIndex] || null;
    const fileName = String(metaItem?.fileName || req.params?.fileName || `documento_${attIndex + 1}.pdf`);

    if (metaItem?.diskRelPath) {
      const absDisk = path.join(__dirname, "uploads", metaItem.diskRelPath);
      if (fs.existsSync(absDisk)) {
        res.setHeader("Content-Type", metaItem.mimeType || "application/octet-stream");
        res.setHeader("Content-Disposition", `inline; filename="${fileName.replace(/"/g, "")}"`);
        res.setHeader("Cache-Control", "private, max-age=3600");
        return res.sendFile(absDisk);
      }
    }

    if (metaItem?.remoteUrl && /^https?:\/\//i.test(metaItem.remoteUrl)) {
      return res.redirect(302, metaItem.remoteUrl);
    }

    // Auto-regeneração resiliente caso o disco efêmero tenha sido reiniciado em deploy
    const matchedRes = findReservationForComm(db, comm);
    if (matchedRes) {
      const freshAtts = await ensureReservationAttachmentsReady({ reservation: matchedRes, db }).catch(() =>
        resolveReservationAttachments({ reservation: matchedRes, db })
      );
      if (Array.isArray(freshAtts) && freshAtts.length > 0) {
        const chosen = freshAtts[attIndex] || freshAtts[0];
        const remat = await materializeSingleAttachment(chosen, comm.id, attIndex);
        if (remat?.diskRelPath) {
          const absDisk = path.join(__dirname, "uploads", remat.diskRelPath);
          if (fs.existsSync(absDisk)) {
            res.setHeader("Content-Type", remat.mimeType || "application/octet-stream");
            res.setHeader("Content-Disposition", `inline; filename="${remat.fileName.replace(/"/g, "")}"`);
            return res.sendFile(absDisk);
          }
        }
        if (remat?.remoteUrl) {
          return res.redirect(302, remat.remoteUrl);
        }
      }
    }

    return res.status(404).json({ error: "Arquivo de anexo não disponível." });
  } catch (err) {
    console.warn("[ReceptionFallback Attachment Serve] Erro:", err?.message || err);
    return res.status(500).json({ error: "Erro ao carregar anexo da recepção." });
  }
}




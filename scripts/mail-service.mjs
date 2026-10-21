import nodemailer from "nodemailer";
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

/**
 * Gatilho A: Template de Aviso de Check-in Concluído à Recepção/Portaria
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
  const earlyCheckin = reservation?.earlyCheckinAuthorized ? "Sim (Liberação antecipada autorizada)" : "Padrão (a partir das " + checkinTime + ")";

  // Monta lista de hóspedes (Titular + Acompanhantes)
  let guests = [];
  if (Array.isArray(reservation?.guests) && reservation.guests.length > 0) {
    guests = [...reservation.guests];
  } else {
    guests = [{ name: guestName, cpf: reservation?.guestDocument || "", phone: reservation?.guestPhone || "", email: reservation?.guestEmail || "" }];
    if (Array.isArray(reservation?.additionalGuests) && reservation.additionalGuests.length > 0) {
      guests.push(...reservation.additionalGuests);
    }
  }

  const guestsHtml = guests.map((g, idx) => `
    <div class="guest-box" style="background-color: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 6px; padding: 14px 16px; margin-top: ${idx === 0 ? '0' : '8px'};">
      <div style="font-weight: 600; color: #111827; font-size: 14px; margin-bottom: 6px;">
        👤 Hóspede ${idx + 1}: ${g.name || guestName}
      </div>
      <table class="info-table" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
        <tr><td class="label" style="padding: 4px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Documento:</td><td class="val" style="padding: 4px 0; font-size: 13px; color: #111827; font-weight: 600; width: 62%;">${g.cpf || g.document || g.doc || "Não informado"}</td></tr>
        <tr><td class="label" style="padding: 4px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Telefone / WhatsApp:</td><td class="val" style="padding: 4px 0; font-size: 13px; color: #111827; font-weight: 600; width: 62%;">${g.phone || reservation?.guestPhone || "Não informado"}</td></tr>
        <tr><td class="label" style="padding: 4px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">E-mail:</td><td class="val" style="padding: 4px 0; font-size: 13px; color: #111827; font-weight: 600; width: 62%;">${g.email || reservation?.guestEmail || "Não informado"}</td></tr>
      </table>
    </div>
  `).join("");

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

  const expectedGuests = Number(reservation?.guestCount || reservation?.adults || guests.length || 1);
  const completedGuests = guests.filter(g => g.hasCompletedCheckin || g.cpf || g.document).length;
  const isPendingSecondGuest = expectedGuests > 1 && completedGuests < expectedGuests;

  const contentHtml = `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 20px; font-weight: 600; line-height: 1.3; color: #111827; margin: 0 0 8px 0;">Olá, Equipe de Recepção & Portaria</h1>
      <p style="font-size: 15px; color: #374151; margin: 0; line-height: 1.6;">
        Segue o informativo cadastral da reserva referente ao <strong>Flat ${flatNumber}</strong> no condomínio <strong>${buildingName}</strong>.
      </p>
    </div>

    ${isPendingSecondGuest ? `
      <!-- Alerta de 2 Hóspedes com apenas 1 Ficha Preenchida -->
      <div style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-left: 3px solid #D97706; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
        <div style="color: #92400E; font-size: 13px; font-weight: 600;">⚠️ ATENÇÃO PORTARIA: RESERVA PARA ${expectedGuests} HÓSPEDES</div>
        <p style="color: #78350F; font-size: 13px; margin: 6px 0 0 0; line-height: 1.5;">
          <strong>Apenas o 1º hóspede (${guestName}) que preencheu a ficha digital está LIBERADO para check-in.</strong> O segundo hóspede AINDA NÃO ESTÁ LIBERADO; estamos aguardando o preenchimento digital de sua ficha para autorização de acesso ao flat.
        </p>
        <div style="margin-top: 10px;">
          <a href="${checkinUrlGuest2}" style="color: #B45309; font-weight: 600; font-size: 13px; text-decoration: underline;">
            🔗 Link de Check-in para o 2º Hóspede
          </a>
        </div>
      </div>
    ` : ""}

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

    ${Boolean(reservation?.fnrhDocumentUuid || reservation?.fnrhFilePath || guests.some(g => g.fnrhDocumentUuid || g.fnrhFilePath)) ? `
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
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Check-in Digital:</td><td class="val" style="padding: 5px 0; font-size: 14px; width: 62%;"><a href="${checkinUrl}" style="color: #111827; font-weight: 600; text-decoration: underline;">Abrir Ficha de Check-in</a></td></tr>
      </table>
    </div>

    <div class="section-title" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin: 24px 0 8px 0;">Período da Hospedagem</div>
    <div class="info-card" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <table class="info-table" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Entrada (Check-in):</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${checkinDateBr} (Previsão: ${checkinTime})</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Early Check-in:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${earlyCheckin}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Saída (Check-out):</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${checkoutDateBr} (até as ${checkoutTime})</td></tr>
      </table>
    </div>

    <div class="section-title" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin: 24px 0 8px 0;">Hóspedes Autorizados (${guests.length})</div>
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

    <!-- Bloco de Ação: Terminal da Portaria -->
    <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-top: 24px;">
      <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; margin-bottom: 4px;">Painel da Recepção & Portaria 24h</div>
      <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 6px;">Consulte Detalhes no Terminal da Portaria</div>
      <p style="font-size: 13px; color: #6B7280; margin: 0 0 14px 0; line-height: 1.5;">
        Acesse pelo tablet ou computador da portaria para conferência de documentos, fotos dos hóspedes e baixa rápida de entrada.
      </p>
      <a href="https://corpflats.com.br/portaria" class="btn-action" style="display: inline-block; background-color: #111827; color: #FFFFFF !important; font-weight: 700; font-size: 14px; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
        Abrir Terminal da Portaria (/portaria)
      </a>
    </div>
  `;

  const badge = `<span class="badge badge-checkin" style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background-color: #ECFDF5; color: #047857; border: 1px solid #A7F3D0;">Check-in Confirmado</span>`;
  const bodyHtml = wrapEmailTemplate({ title: subject, badge, contentHtml });

  return { subject, bodyHtml, html: bodyHtml, checkinUrl };
}

/**
 * Gatilho B: Template de Alteração de Reserva à Recepção/Portaria
 */
export function renderReservationUpdateEmail({ reservation, flat, changes = [], changesSummary = [], actionType, settings, baseUrl = "", db = null }) {
  const flatNumber = flat?.number || reservation?.flatNumber || "Não informado";
  const buildingName = flat?.buildingName || flat?.building || settings?.buildingName || "Edifício Soho Residence Service";
  const guestName = reservation?.guestName || "Hóspede Titular";

  const hostBase = baseUrl || settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.com.br";
  const checkinUrl = getCheckinUrlSync(reservation, 1, hostBase, db || settings);
  
  const allChanges = [...changes, ...changesSummary];
  const isCancelled = actionType === "cancelled" || 
    reservation?.status === "cancelada" || 
    allChanges.some(c => (typeof c === "string" ? c.toLowerCase().includes("cancelad") : (c.field === "status" && c.newValue === "cancelada")));

  const subject = isCancelled 
    ? `[CANCELAMENTO DE RESERVA] Flat ${flatNumber} - ${guestName}`
    : `[ATUALIZAÇÃO DE RESERVA] Flat ${flatNumber} - ${guestName}`;

  const changesHtml = allChanges.map(c => {
    if (typeof c === "string") {
      return `<li style="margin-bottom: 6px;">${c}</li>`;
    }
    return `
      <li style="margin-bottom: 6px;">
        <strong style="color: #111827;">${c.label || c.field}:</strong> 
        <span style="text-decoration: line-through; color: #9CA3AF;">${c.oldValue || "Anterior"}</span> 
        ➔ <strong style="color: #111827;">${c.newValue || "Novo"}</strong>
      </li>
    `;
  }).join("");

  const contentHtml = `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 20px; font-weight: 600; line-height: 1.3; color: #111827; margin: 0 0 8px 0;">Aviso de Modificação de Reserva</h1>
      <p style="font-size: 15px; color: #374151; margin: 0; line-height: 1.6;">
        A reserva referente ao <strong>Flat ${flatNumber}</strong> no condomínio <strong>${buildingName}</strong> sofreu alterações no sistema.
      </p>
    </div>

    ${isCancelled ? `
      <div class="callout-cancel" style="background-color: #FEF2F2; border: 1px solid #FECACA; border-left: 3px solid #DC2626; padding: 16px; border-radius: 6px; margin-bottom: 16px;">
        <strong style="color: #B91C1C; font-size: 14px;">ATENÇÃO: RESERVA CANCELADA</strong>
        <p style="color: #7F1D1D; font-size: 13px; margin: 6px 0 0 0; line-height: 1.5;">
          A entrada para esta reserva não deve ser liberada. O quarto retornou ao status vago.
        </p>
      </div>
    ` : `
      <div class="callout-alert" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-left: 3px solid #D97706; padding: 16px; border-radius: 6px; margin-bottom: 16px;">
        <strong style="color: #111827; font-size: 14px;">Modificações Realizadas:</strong>
        <ul style="margin: 8px 0 0 18px; padding: 0; font-size: 14px; color: #374151; line-height: 1.6;">
          ${changesHtml || "<li>As datas ou detalhes cadastrais da reserva foram atualizados.</li>"}
        </ul>
      </div>
    `}

    <div class="section-title" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; margin: 24px 0 8px 0;">Resumo Atualizado da Reserva</div>
    <div class="info-card" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <table class="info-table" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Apartamento:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">Flat ${flatNumber} (${buildingName})</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Hóspede Titular:</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${guestName}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Entrada (Check-in):</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${formatDateBr(reservation?.checkinDate)}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Saída (Check-out):</td><td class="val" style="padding: 5px 0; font-size: 14px; color: #111827; font-weight: 600; width: 62%;">${formatDateBr(reservation?.checkoutDate)}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Status Atual:</td><td class="val" style="padding: 5px 0; font-size: 14px; text-transform: uppercase; color: ${isCancelled ? '#DC2626' : '#059669'}; font-weight: 600; width: 62%;">${reservation?.status || "Confirmada"}</td></tr>
        <tr><td class="label" style="padding: 5px 0; font-size: 13px; color: #6B7280; font-weight: 500; width: 38%;">Check-in Digital:</td><td class="val" style="padding: 5px 0; font-size: 14px; width: 62%;"><a href="${checkinUrl}" style="color: #111827; font-weight: 600; text-decoration: underline;">Acessar Ficha de Check-in</a></td></tr>
      </table>
    </div>
  `;

  const badge = isCancelled 
    ? `<span class="badge badge-cancel" style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background-color: #FEF2F2; color: #B91C1C; border: 1px solid #FECACA;">Reserva Cancelada</span>` 
    : `<span class="badge badge-update" style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background-color: #FFFBEB; color: #B45309; border: 1px solid #FDE68A;">Reserva Alterada</span>`;

  const bodyHtml = wrapEmailTemplate({ title: subject, badge, contentHtml });
  return { subject, bodyHtml, html: bodyHtml, checkinUrl };
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
      </table>
    </div>
  `;

  const badge = `<span class="badge badge-general" style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background-color: #F9FAFB; color: #374151; border: 1px solid #E5E7EB;">Instruções de Acesso</span>`;
  const bodyHtml = wrapEmailTemplate({ title: subject, badge, contentHtml });
  return { subject, bodyHtml, html: bodyHtml, checkinUrl };
}
export const renderAccessInstructionEmail = renderAccessInstructionsEmail;

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

  // 1. Indicadores diretos gravados na própria reserva
  if (Boolean(reservation.morningEmailSentDate) || 
      Boolean(reservation.morningEmailSentAt) || 
      Boolean(reservation.receptionNotifiedAt) || 
      Boolean(reservation.receptionEmailSentAt)) {
    return true;
  }

  const resCode = String(reservation.code || reservation.reservationCode || "").trim().toUpperCase();
  const resId = String(reservation.id || "").trim();

  // 2. E-mail oficial da recepção para o flat/hotel
  const flat = (db?.flats || []).find(f => f.id === reservation.flatId || String(f.number) === String(reservation.flatNumber));
  const receptionEmail = (flat?.receptionEmail || db?.settings?.receptionEmail || db?.settings?.buildingEmail || process.env.RECEPTION_EMAIL || "soho@promenade.com.br").toLowerCase().trim();

  // 3. Checa histórico de comunicações
  const comms = db?.reservationCommunications || [];
  return comms.some(c => {
    if (!c || c.type !== "email") return false;
    const cResId = String(c.reservation_id || "").trim().toUpperCase();
    const isSameRes = (resCode && cResId === resCode) || (resId && cResId === resId);
    if (!isSameRes) return false;

    const recipient = String(c.recipient || "").toLowerCase().trim();
    const cc = String(c.cc || "").toLowerCase().trim();
    const isToReception = recipient.includes(receptionEmail) || cc.includes(receptionEmail);
    if (!isToReception) return false;

    // Disparos que configuram que a portaria recebeu a reserva (rotina 07h, ficha pre-checkin ou entrada)
    const trigger = c.metadata?.trigger;
    const isInitialDispatch = trigger === "morning_checkin_07h" || 
                              trigger === "pre_checkin" || 
                              trigger === "checkin_confirmed" || 
                              trigger === "pms_reservation_created" ||
                              (c.subject && c.subject.toUpperCase().includes("CHECK-IN"));

    return isInitialDispatch && (c.status === "sent" || c.status === "delivered" || c.status === "pending");
  });
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
  overrides = {}
}) {
  if (!recipient || !subject) {
    console.warn("[MailService] Destinatário ou assunto ausentes. Abortando.");
    return null;
  }

  // Verifica se o motor automático de e-mails está pausado pelo usuário
  if (metadata?.isAutomated && db?.settings?.emailSettings?.enabled === false) {
    console.log(`[MailService ⏸️] Motor de e-mails automáticos pausado. Disparo para ${recipient} ('${subject}') suspenso.`);
    return null;
  }

  const finalHtml = bodyHtml || html || "";
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
      hasAttachments: Array.isArray(attachments) && attachments.length > 0,
      attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
      attempts: 1,
      queuedAt: now
    },
    created_at: now
  };

  if (!db.reservationCommunications) {
    db.reservationCommunications = [];
  }

  // Insere no início do histórico da reserva
  db.reservationCommunications.unshift(logEntry);
  if (typeof saveDatabase === "function") saveDatabase();

  // Execução assíncrona não bloqueante
  setImmediate(async () => {
    try {
      const config = getSmtpConfig(db, overrides);
      if (!config.user || !config.pass) {
        throw new Error("SMTP não configurado no backend (credenciais de SMTP_USER/SMTP_PASS ausentes).");
      }

      const transporter = createTransporter(db, overrides);
      if (!transporter) {
        throw new Error("Não foi possível criar transporte SMTP.");
      }

      const mailOptions = {
        from: `"${config.fromName}" <${config.fromEmail}>`,
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
    } catch (err) {
      logEntry.status = "failed";
      logEntry.metadata.error = err.message || String(err);
      logEntry.metadata.failedAt = new Date().toISOString();
      console.error(`[MailService] ✗ Falha ao enviar e-mail para ${recipient}:`, err.message);
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

  try {
    const config = getSmtpConfig(db);
    if (!config.user || !config.pass) {
      throw new Error("Credenciais de SMTP ausentes.");
    }

    const transporter = createTransporter(db);
    const mailOptions = {
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: comm.recipient,
      subject: comm.subject,
      html: comm.body
    };

    // Re-resolve anexos caso seja uma comunicação vinculada a reserva
    if (comm.reservation_id && String(comm.reservation_id) !== "0") {
      const resItem = (db?.reservations || []).find(r => String(r.id) === String(comm.reservation_id) || r.code === comm.reservation_id);
      if (resItem) {
        const atts = resolveReservationAttachments({ reservation: resItem, db });
        if (Array.isArray(atts) && atts.length > 0) {
          mailOptions.attachments = atts;
        }
      }
    }

    const info = await transporter.sendMail(mailOptions);
    comm.status = "sent";
    comm.metadata.messageId = info.messageId;
    comm.metadata.sentAt = new Date().toISOString();
    delete comm.metadata.error;
    if (typeof saveDatabase === "function") saveDatabase();
    return { ok: true, message: "E-mail reenviado com sucesso!" };
  } catch (err) {
    comm.status = "failed";
    comm.metadata.error = err.message;
    comm.metadata.failedAt = new Date().toISOString();
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


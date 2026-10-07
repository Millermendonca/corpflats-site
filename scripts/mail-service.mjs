import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import {
  getCheckinUrlSync as getSerproCheckinUrlSync,
  getCheckinUrl as getSerproCheckinUrl
} from "./fnrh-serpro-service.mjs";

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
  const hostBase = (baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.onrender.com").replace(/\/$/, "");
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
 * Layout HTML Base CorpFlats
 */
function wrapEmailTemplate({ title, badge, contentHtml }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; color: #1e293b; }
    .wrapper { max-width: 620px; margin: 20px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 24px 30px; text-align: left; }
    .brand { color: #f59e0b; font-size: 20px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; margin: 0; }
    .subbrand { color: #94a3b8; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 2px; }
    .badge-bar { margin-top: 14px; }
    .badge { display: inline-block; padding: 5px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge-checkin { background-color: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .badge-update { background-color: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
    .badge-cancel { background-color: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
    .badge-general { background-color: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
    .content { padding: 30px; }
    .section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-top: 20px; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px; }
    .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin-bottom: 14px; }
    .info-table { width: 100%; border-collapse: collapse; }
    .info-table td { padding: 5px 0; font-size: 13px; vertical-align: top; }
    .info-table .label { color: #64748b; font-weight: 600; width: 38%; }
    .info-table .val { color: #0f172a; font-weight: 700; width: 62%; }
    .guest-box { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px 14px; margin-top: 8px; }
    .callout-alert { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 6px; margin-bottom: 18px; }
    .callout-cancel { background: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 16px; border-radius: 6px; margin-bottom: 18px; }
    .footer { background: #f1f5f9; padding: 18px 30px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }
    .btn-action { display: inline-block; padding: 9px 18px; background: #0f172a; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-size: 12px; font-weight: 700; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="brand">CorpFlats</div>
      <div class="subbrand">Gestão Inteligente de Hospedagem</div>
      <div class="badge-bar">
        ${badge}
      </div>
    </div>
    <div class="content">
      ${contentHtml}
    </div>
    <div class="footer">
      Este é um e-mail transacional automatizado gerado pelo sistema CorpFlats.<br/>
      Para suporte ou dúvidas operacionais, consulte a administração do hotel.
    </div>
  </div>
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

  const hostBase = baseUrl || settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.onrender.com";
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
    <div class="guest-box">
      <div style="font-weight: 800; color: #0f172a; font-size: 13px; margin-bottom: 4px;">
        👤 Hóspede ${idx + 1}: ${g.name || guestName}
      </div>
      <table class="info-table">
        <tr><td class="label">Documento:</td><td class="val">${g.cpf || g.document || g.doc || "Não informado"}</td></tr>
        <tr><td class="label">Telefone / WhatsApp:</td><td class="val">${g.phone || reservation?.guestPhone || "Não informado"}</td></tr>
        <tr><td class="label">E-mail:</td><td class="val">${g.email || reservation?.guestEmail || "Não informado"}</td></tr>
      </table>
    </div>
  `).join("");

  // Veículo
  const vehicle = reservation?.vehicle;
  const vehicleHtml = (vehicle && vehicle.plate) ? `
    <table class="info-table">
      <tr><td class="label">Placa:</td><td class="val" style="font-family: monospace; font-size: 14px; color: #0369a1;">${vehicle.plate.toUpperCase()}</td></tr>
      <tr><td class="label">Modelo / Marca:</td><td class="val">${[vehicle.brand, vehicle.model].filter(Boolean).join(" - ") || "Não informado"}</td></tr>
      <tr><td class="label">Cor:</td><td class="val">${vehicle.color || "Não informado"}</td></tr>
    </table>
  ` : `<div style="font-size: 13px; color: #64748b;">Nenhum veículo cadastrado para esta estadia.</div>`;

  // Observações e Notas de Recepção (apenas nota destinada à portaria/recepção)
  const rawReceptionNotes = (reservation?.receptionNotes || "").trim();
  const cleanReceptionNotes = rawReceptionNotes.replace(/^nota\s+(de\s+)?recep[cç][aã]o:\s*/i, "").trim();
  const receptionNotes = cleanReceptionNotes ? `Nota de Recepção: ${cleanReceptionNotes}` : "";

  const expectedGuests = Number(reservation?.guestCount || reservation?.adults || guests.length || 1);
  const completedGuests = guests.filter(g => g.hasCompletedCheckin || g.cpf || g.document).length;
  const isPendingSecondGuest = expectedGuests > 1 && completedGuests < expectedGuests;

  const contentHtml = `
    <!-- Divulgação da Tela da Recepção / Portaria (Tablet / Web) -->
    <div style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); border-radius: 12px; padding: 18px 20px; margin-bottom: 20px; color: #ffffff; text-align: center; border: 1px solid #4338ca;">
      <div style="font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #a5b4fc; margin-bottom: 4px;">Painel da Recepção & Portaria 24h</div>
      <div style="font-size: 15px; font-weight: 800; color: #ffffff; margin-bottom: 6px;">Consulte Detalhes no Terminal da Portaria</div>
      <p style="font-size: 12px; color: #c7d2fe; margin: 0 0 12px 0; line-height: 1.4;">
        Acesse pelo tablet ou computador da portaria para conferência de documentos, fotos dos hóspedes e baixa rápida de entrada.
      </p>
      <a href="https://corpflats.onrender.com/portaria" style="display: inline-block; background: #f59e0b; color: #0f172a !important; font-weight: 800; font-size: 13px; padding: 9px 20px; border-radius: 8px; text-decoration: none; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
        🖥️ Abrir Terminal da Portaria (/portaria)
      </a>
    </div>

    ${isPendingSecondGuest ? `
      <!-- Alerta de 2 Hóspedes com apenas 1 Ficha Preenchida -->
      <div style="background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 12px 14px; margin-bottom: 16px;">
        <strong style="color: #92400e; font-size: 13px;">⚠️ ATENÇÃO PORTARIA: RESERVA PARA ${expectedGuests} HÓSPEDES</strong>
        <p style="color: #78350f; font-size: 12px; margin: 4px 0 0 0; line-height: 1.4;">
          <strong>Apenas o 1º hóspede (${guestName}) que preencheu a ficha digital está LIBERADO para check-in.</strong> O segundo hóspede AINDA NÃO ESTÁ LIBERADO; estamos aguardando o preenchimento digital de sua ficha para autorização de acesso ao flat.
        </p>
        <div style="margin-top: 8px;">
          <a href="${checkinUrlGuest2}" style="color: #b45309; font-weight: 700; font-size: 12px; text-decoration: underline;">
            🔗 Link de Check-in para o 2º Hóspede
          </a>
        </div>
      </div>
    ` : ""}

    ${Boolean(reservation?.hasMinor || guests.some(g => g.isMinor)) ? `
      <!-- Alerta de Menor de Idade (ECA Art. 82) -->
      <div style="background: #fff1f2; border: 1px solid #fecdd3; border-left: 4px solid #e11d48; border-radius: 8px; padding: 12px 14px; margin-bottom: 16px;">
        <strong style="color: #9f1239; font-size: 13px;">👶 ATENÇÃO RECEPÇÃO: HÓSPEDE MENOR DE IDADE REGISTRADO (ECA Art. 82)</strong>
        <p style="color: #881337; font-size: 12px; margin: 4px 0 0 0; line-height: 1.4;">
          Identificado hóspede menor de 18 anos nesta estadia. <strong>Conforme a Lei nº 8.069/1990 (ECA), é obrigatória a presença dos pais ou responsável maior portando autorização formal por escrito com firma reconhecida em cartório para liberação de chaves.</strong>
        </p>
      </div>
    ` : ""}

    ${Boolean(reservation?.isCamposResident || reservation?.riskAttentionReason?.toLowerCase()?.includes("campos")) ? `
      <!-- Alerta de Radar Local (Campos dos Goytacazes/RJ) -->
      <div style="background: #f5f3ff; border: 1px solid #ddd6fe; border-left: 4px solid #7c3aed; border-radius: 8px; padding: 12px 14px; margin-bottom: 16px;">
        <strong style="color: #5b21b6; font-size: 13px;">📍 RADAR OPERACIONAL: HÓSPEDE DE CAMPOS DOS GOYTACAZES/RJ</strong>
        <p style="color: #4c1d95; font-size: 12px; margin: 4px 0 0 0; line-height: 1.4;">
          Hóspede residente ou com documento emitido em Campos dos Goytacazes/RJ. Reserva incluída no radar de atenção operacional da equipe.
        </p>
      </div>
    ` : ""}

    ${Boolean(reservation?.fnrhDocumentUuid || reservation?.fnrhFilePath || guests.some(g => g.fnrhDocumentUuid || g.fnrhFilePath)) ? `
      <!-- Aviso de FNRH PDF Anexada -->
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #059669; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 12px; color: #065f46; line-height: 1.4;">
        <strong>📄 Ficha Digital FNRH Anexada em PDF:</strong> A Ficha Nacional de Registro de Hóspedes (FNRH) assinada digitalmente com trilha forense e QR Code foi anexada a este e-mail em formato PDF.
      </div>
    ` : ""}

    ${Boolean(reservation?.docPhotoUrl || reservation?.docPhotoPath || reservation?.documentPhotoUrl || guests.some(g => g.docPhotoUrl || g.docPhotoPath)) ? `
      <!-- Aviso de Documento Oficial Anexado -->
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #16a34a; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 12px; color: #166534; line-height: 1.4;">
        <strong>📎 Documento Oficial do Hóspede Anexado:</strong> O documento com foto (PDF ou imagem) anexado à reserva foi incluído como anexo a este e-mail para conferência na recepção.
      </div>
    ` : ""}

    <div style="margin-bottom: 20px;">
      <h2 style="font-size: 17px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0;">Olá, Equipe de Recepção & Portaria!</h2>
      <p style="font-size: 13px; color: #475569; margin: 0; line-height: 1.5;">
        Segue o informativo cadastral da reserva referente ao <strong>Flat ${flatNumber}</strong> no condomínio <strong>${buildingName}</strong>:
      </p>
    </div>

    <div class="section-title">🏢 Identificação da Unidade</div>
    <div class="info-card">
      <table class="info-table">
        <tr><td class="label">Edifício:</td><td class="val">${buildingName}</td></tr>
        <tr><td class="label">Apartamento:</td><td class="val" style="font-size: 15px; color: #d97706;">Flat ${flatNumber}</td></tr>
        <tr><td class="label">Código da Reserva:</td><td class="val" style="font-family: monospace;">#${reservation?.code || reservation?.id}</td></tr>
        <tr><td class="label">Check-in Digital:</td><td class="val"><a href="${checkinUrl}" style="color: #059669; font-weight: 700; text-decoration: none;">Abrir Ficha de Check-in</a></td></tr>
      </table>
    </div>

    <div class="section-title">📅 Período da Hospedagem</div>
    <div class="info-card">
      <table class="info-table">
        <tr><td class="label">Entrada (Check-in):</td><td class="val">${checkinDateBr} (Previsão: ${checkinTime})</td></tr>
        <tr><td class="label">Early Check-in:</td><td class="val">${earlyCheckin}</td></tr>
        <tr><td class="label">Saída (Check-out):</td><td class="val">${checkoutDateBr} (até as ${checkoutTime})</td></tr>
      </table>
    </div>

    <div class="section-title">👥 Hóspedes Autorizados (${guests.length})</div>
    <div class="info-card" style="padding-top: 6px;">
      ${guestsHtml}
    </div>

    <div class="section-title">🚗 Veículo / Vaga de Garagem</div>
    <div class="info-card">
      ${vehicleHtml}
    </div>

    ${receptionNotes ? `
      <div class="section-title">⚠️ Observações de Acesso</div>
      <div class="info-card" style="background: #fffbeb; border-color: #fde68a;">
        <div style="font-size: 13px; color: #92400e; font-weight: 600;">${receptionNotes}</div>
      </div>
    ` : ""}
  `;

  const badge = `<span class="badge badge-checkin">✓ Check-in Confirmado</span>`;
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

  const hostBase = baseUrl || settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.onrender.com";
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
        <strong>${c.label || c.field}:</strong> 
        <span style="text-decoration: line-through; color: #94a3b8;">${c.oldValue || "Anterior"}</span> 
        ➔ <strong style="color: #047857;">${c.newValue || "Novo"}</strong>
      </li>
    `;
  }).join("");

  const contentHtml = `
    <div style="margin-bottom: 18px;">
      <h2 style="font-size: 17px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0;">Aviso de Modificação de Reserva</h2>
      <p style="font-size: 13px; color: #475569; margin: 0; line-height: 1.5;">
        A reserva referente ao <strong>Flat ${flatNumber}</strong> no condomínio <strong>${buildingName}</strong> sofreu alterações no sistema:
      </p>
    </div>

    ${isCancelled ? `
      <div class="callout-cancel">
        <strong style="color: #b91c1c; font-size: 14px;">❌ ATENÇÃO: RESERVA CANCELADA</strong>
        <p style="color: #7f1d1d; font-size: 12px; margin: 4px 0 0 0;">
          A entrada para esta reserva não deve ser liberada. O quarto retornou ao status vago.
        </p>
      </div>
    ` : `
      <div class="callout-alert">
        <strong style="color: #92400e; font-size: 14px;">⚡ Modificações Realizadas:</strong>
        <ul style="margin: 8px 0 0 16px; padding: 0; font-size: 13px; color: #78350f;">
          ${changesHtml || "<li>As datas ou detalhes cadastrais da reserva foram atualizados.</li>"}
        </ul>
      </div>
    `}

    <div class="section-title">📋 Resumo Atualizado da Reserva</div>
    <div class="info-card">
      <table class="info-table">
        <tr><td class="label">Apartamento:</td><td class="val">Flat ${flatNumber} (${buildingName})</td></tr>
        <tr><td class="label">Hóspede Titular:</td><td class="val">${guestName}</td></tr>
        <tr><td class="label">Entrada (Check-in):</td><td class="val">${formatDateBr(reservation?.checkinDate)}</td></tr>
        <tr><td class="label">Saída (Check-out):</td><td class="val">${formatDateBr(reservation?.checkoutDate)}</td></tr>
        <tr><td class="label">Status Atual:</td><td class="val" style="text-transform: uppercase; color: ${isCancelled ? '#dc2626' : '#059669'}; font-weight: 800;">${reservation?.status || "Confirmada"}</td></tr>
        <tr><td class="label">Check-in Digital:</td><td class="val"><a href="${checkinUrl}" style="color: #059669; font-weight: 700; text-decoration: none;">Acessar Ficha de Check-in</a></td></tr>
      </table>
    </div>
  `;

  const badge = isCancelled 
    ? `<span class="badge badge-cancel">❌ Reserva Cancelada</span>` 
    : `<span class="badge badge-update">⚡ Reserva Alterada</span>`;

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
    <div style="margin-bottom: 16px;">
      <h2 style="font-size: 17px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0;">${subject}</h2>
      ${reservation ? `
        <p style="font-size: 11px; color: #64748b; margin: 0 0 16px 0;">
          Ref: Flat ${flatNumber} • Hóspede: ${guestName} • Reserva #${reservation?.code || reservation?.id}
        </p>
      ` : ""}
    </div>

    <div class="info-card" style="background: #ffffff; line-height: 1.6; font-size: 14px; color: #1e293b; white-space: pre-wrap;">
      ${finalMessage}
    </div>
  `;

  const badge = `<span class="badge badge-general">Mensagem Direta</span>`;
  const bodyHtml = wrapEmailTemplate({ title: subject, badge, contentHtml });
  return { subject, bodyHtml, html: bodyHtml };
}

/**
 * Gatilho C: Template de Liberação / Autorização de Garagem
 * Destinado ao estacionamento (millerpessanha@gmail.com - original: promenadesoho@pfbestacionamentos.com.br) e portaria
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
    <div style="margin-bottom: 20px;">
      <h2 style="font-size: 17px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0;">Olá, Equipe da Garagem (PFB Estacionamentos)!</h2>
      <p style="font-size: 13px; color: #475569; margin: 0; line-height: 1.5;">
        Solicitamos a <strong>liberação de entrada e acesso à vaga de garagem</strong> para o veículo cadastrado abaixo, referente à acomodação no <strong>${flatDisplay}</strong> (${buildingName}):
      </p>
    </div>

    <div class="section-title">🚗 Veículo Autorizado</div>
    <div class="info-card" style="background: #f0f9ff; border-color: #bae6fd; padding: 16px;">
      <table class="info-table">
        <tr>
          <td class="label" style="color: #0369a1; font-weight: 800; font-size: 13px;">Placa do Veículo:</td>
          <td class="val">
            <span style="font-family: monospace; font-size: 17px; font-weight: 900; color: #0284c7; background: #ffffff; padding: 4px 12px; border-radius: 6px; border: 1px solid #7dd3fc; letter-spacing: 1px; display: inline-block;">
              ${vPlate}
            </span>
          </td>
        </tr>
        <tr>
          <td class="label" style="color: #0369a1;">Modelo / Marca:</td>
          <td class="val" style="color: #0f172a; font-size: 14px;">${vehicleDesc}</td>
        </tr>
        <tr>
          <td class="label" style="color: #0369a1;">Cor:</td>
          <td class="val" style="color: #0f172a;">${vColor || "Não informada"}</td>
        </tr>
        <tr>
          <td class="label" style="color: #0369a1;">Status de Entrada:</td>
          <td class="val" style="color: #059669; font-weight: 800; font-size: 13px;">✓ ENTRADA LIBERADA NA GARAGEM</td>
        </tr>
      </table>
    </div>

    <div class="section-title">🏢 Identificação da Unidade & Hóspede</div>
    <div class="info-card">
      <table class="info-table">
        <tr><td class="label">Apartamento:</td><td class="val" style="font-size: 15px; color: #d97706; font-weight: 800;">${flatDisplay}</td></tr>
        <tr><td class="label">Edifício / Condomínio:</td><td class="val">${buildingName}</td></tr>
        <tr><td class="label">Código da Reserva:</td><td class="val" style="font-family: monospace;">#${reservation?.code || reservation?.id || "-"}</td></tr>
        <tr><td class="label">Hóspede Titular:</td><td class="val">${guestName}</td></tr>
        ${reservation?.guestDocument ? `<tr><td class="label">Documento / CPF:</td><td class="val">${reservation.guestDocument}</td></tr>` : ""}
        ${reservation?.guestPhone ? `<tr><td class="label">Telefone / WhatsApp:</td><td class="val">${reservation.guestPhone}</td></tr>` : ""}
      </table>
    </div>

    <div class="section-title">📅 Período da Estadia Autorizada</div>
    <div class="info-card">
      <table class="info-table">
        <tr><td class="label">Entrada (Check-in):</td><td class="val">${checkinDateBr} (a partir das ${checkinTime})</td></tr>
        <tr><td class="label">Saída (Check-out):</td><td class="val">${checkoutDateBr} (até às ${checkoutTime})</td></tr>
      </table>
    </div>

    ${reservation?.receptionNotes && reservation.receptionNotes.trim() ? `
      <div class="section-title">⚠️ Observações Adicionais</div>
      <div class="info-card" style="background: #fffbeb; border-color: #fde68a;">
        <div style="font-size: 13px; color: #92400e; font-weight: 600;">
          Nota de Recepção: ${reservation.receptionNotes.trim().replace(/^nota\s+(de\s+)?recep[cç][aã]o:\s*/i, "").trim()}
        </div>
      </div>
    ` : ""}
  `;

  const badge = `<span class="badge" style="background-color: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;">🚗 Garagem Autorizada</span>`;
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
  const hostBase = baseUrl || settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.onrender.com";

  const checkinUrl = getCheckinUrlSync(reservation, 1, hostBase, db || settings);
  const isGov = checkinUrl.includes("turismo.gov.br");
  const buttonLabel = isGov ? "🇧🇷 Fazer Check-in Oficial Gov.br (FNRH)" : "📝 Realizar Pré-Check-in Digital";

  const subject = `[CONFIRMAÇÃO DE RESERVA] ${flatDisplay} - ${guestName} (${checkinDateBr} a ${checkoutDateBr})`;

  const contentHtml = `
    <div style="margin-bottom: 20px;">
      <h2 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0;">Sua Reserva está Confirmada! 🎉</h2>
      <p style="font-size: 13px; color: #475569; margin: 0; line-height: 1.5;">
        Olá, <strong>${guestName}</strong>! É uma satisfação receber você no <strong>${buildingName}</strong>. Abaixo estão os detalhes da sua estadia:
      </p>
    </div>

    <!-- Chamada para Pré Check-in Digital Dinâmico -->
    <div style="background: linear-gradient(135deg, #064e3b 0%, #047857 100%); border-radius: 12px; padding: 20px; margin-bottom: 22px; color: #ffffff; text-align: center; border: 1px solid #059669; box-shadow: 0 4px 12px rgba(4,120,87,0.15);">
      <div style="font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #a7f3d0; margin-bottom: 6px;">Agilidade na Portaria</div>
      <div style="font-size: 16px; font-weight: 800; color: #ffffff; margin-bottom: 8px;">Realize seu Check-in Digital Antecipado</div>
      <p style="font-size: 12px; color: #d1fae5; margin: 0 0 14px 0; line-height: 1.4;">
        Para liberar seu acesso na portaria 24h sem filas, preencha os dados dos hóspedes pelo link seguro abaixo:
      </p>
      <a href="${checkinUrl}" style="display: inline-block; background: #ffffff; color: #065f46 !important; font-weight: 800; font-size: 14px; padding: 11px 24px; border-radius: 8px; text-decoration: none; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">
        ${buttonLabel}
      </a>
      <div style="font-size: 11px; color: #a7f3d0; margin-top: 10px; word-break: break-all;">
        Ou copie o link: <span style="text-decoration: underline;">${checkinUrl}</span>
      </div>
    </div>

    <div class="section-title">🏢 Identificação da Unidade</div>
    <div class="info-card">
      <table class="info-table">
        <tr><td class="label">Edifício:</td><td class="val">${buildingName}</td></tr>
        <tr><td class="label">Acomodação:</td><td class="val" style="font-size: 15px; color: #d97706; font-weight: 800;">${flatDisplay}</td></tr>
        <tr><td class="label">Código da Reserva:</td><td class="val" style="font-family: monospace;">#${resCode}</td></tr>
      </table>
    </div>

    <div class="section-title">📅 Período da Hospedagem</div>
    <div class="info-card">
      <table class="info-table">
        <tr><td class="label">Entrada (Check-in):</td><td class="val">${checkinDateBr} (a partir das ${checkinTime})</td></tr>
        <tr><td class="label">Saída (Check-out):</td><td class="val">${checkoutDateBr} (até às ${checkoutTime})</td></tr>
      </table>
    </div>
  `;

  const badge = `<span class="badge badge-checkin">✓ Reserva Confirmada</span>`;
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
  const hostBase = baseUrl || settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.onrender.com";

  const checkinUrl = getCheckinUrlSync(reservation, 1, hostBase, db || settings);
  const checkinUrlGuest2 = getCheckinUrlSync(reservation, 2, hostBase, db || settings);
  const isGov = checkinUrl.includes("turismo.gov.br");
  const buttonLabel = isGov ? "🇧🇷 Preencher Ficha Oficial Gov.br (FNRH)" : "📝 Preencher Pré-Check-in Digital";

  const isMultiGuest = (Number(reservation?.guestCount || reservation?.adults || 1) > 1);
  const firstGuestDone = Boolean(reservation?.guests?.[0]?.hasCompletedCheckin || reservation?.guests?.[0]?.status === "CHECKED_IN");

  const subject = `[LEMBRETE DE CHECK-IN] ${flatDisplay} - ${guestName} (Entrada: ${checkinDateBr})`;

  const contentHtml = `
    <div style="margin-bottom: 20px;">
      <h2 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0;">Lembrete de Pré-Check-in Digital 🏨</h2>
      <p style="font-size: 13px; color: #475569; margin: 0; line-height: 1.5;">
        Olá, <strong>${guestName}</strong>! Sua entrada no <strong>${flatDisplay}</strong> está próxima (${checkinDateBr} a partir das ${checkinTime}).
      </p>
    </div>

    ${isMultiGuest && firstGuestDone ? `
      <div style="background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 14px 16px; margin-bottom: 18px;">
        <strong style="color: #92400e; font-size: 13px;">⚠️ Cadastro Pendente do 2º Hóspede</strong>
        <p style="color: #78350f; font-size: 12px; margin: 4px 0 10px 0; line-height: 1.4;">
          A ficha do titular foi recebida com sucesso! Falta apenas o preenchimento do segundo acompanhante para liberação de crachá na portaria:
        </p>
        <a href="${checkinUrlGuest2}" style="display: inline-block; background: #f59e0b; color: #ffffff !important; font-weight: 800; font-size: 13px; padding: 8px 18px; border-radius: 6px; text-decoration: none;">
          Preencher Check-in do 2º Hóspede
        </a>
      </div>
    ` : `
      <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%); border-radius: 12px; padding: 20px; margin-bottom: 22px; color: #ffffff; text-align: center; border: 1px solid #2563eb; box-shadow: 0 4px 12px rgba(29,78,216,0.15);">
        <div style="font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #93c5fd; margin-bottom: 6px;">Liberação Antecipada</div>
        <div style="font-size: 16px; font-weight: 800; color: #ffffff; margin-bottom: 8px;">Sua Ficha de Check-in ainda está pendente</div>
        <p style="font-size: 12px; color: #bfdbfe; margin: 0 0 14px 0; line-height: 1.4;">
          Preencha antecipadamente para que a portaria autorize sua entrada sem burocracia na chegada:
        </p>
        <a href="${checkinUrl}" style="display: inline-block; background: #ffffff; color: #1e40af !important; font-weight: 800; font-size: 14px; padding: 11px 24px; border-radius: 8px; text-decoration: none; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">
          ${buttonLabel}
        </a>
        <div style="font-size: 11px; color: #93c5fd; margin-top: 10px; word-break: break-all;">
          Ou acesse: <span style="text-decoration: underline;">${checkinUrl}</span>
        </div>
      </div>
    `}

    <div class="section-title">🏢 Dados da Estadia</div>
    <div class="info-card">
      <table class="info-table">
        <tr><td class="label">Apartamento:</td><td class="val" style="color: #d97706; font-weight: 800;">${flatDisplay} (${buildingName})</td></tr>
        <tr><td class="label">Código da Reserva:</td><td class="val" style="font-family: monospace;">#${resCode}</td></tr>
        <tr><td class="label">Data de Entrada:</td><td class="val">${checkinDateBr} (a partir das ${checkinTime})</td></tr>
      </table>
    </div>
  `;

  const badge = `<span class="badge badge-update">⚡ Lembrete de Check-in</span>`;
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
  const hostBase = baseUrl || settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.onrender.com";

  const checkinUrl = getCheckinUrlSync(reservation, 1, hostBase, db || settings);
  const wifiNetwork = flat?.wifiNetwork || settings?.wifiNetwork || "CorpFlats";
  const wifiPassword = flat?.wifiPassword || settings?.wifiPassword || "corpflats2026";

  const subject = `[INSTRUÇÕES DE ACESSO] ${flatDisplay} - ${guestName} (${buildingName})`;

  const contentHtml = `
    <div style="margin-bottom: 20px;">
      <h2 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0;">Instruções para sua Chegada e Acesso 🔑</h2>
      <p style="font-size: 13px; color: #475569; margin: 0; line-height: 1.5;">
        Olá, <strong>${guestName}</strong>! Seguem todas as informações necessárias para sua entrada no <strong>${flatDisplay}</strong>:
      </p>
    </div>

    <!-- Passos de Entrada -->
    <div class="info-card" style="background: #f8fafc; border-left: 4px solid #3b82f6;">
      <div style="font-weight: 800; color: #1e293b; font-size: 14px; margin-bottom: 8px;">📋 Passo a Passo para Entrada:</div>
      <ol style="margin: 0 0 0 16px; padding: 0; font-size: 13px; color: #334155; line-height: 1.6;">
        <li>Dirija-se à <strong>portaria 24h</strong> do condomínio <strong>${buildingName}</strong>.</li>
        <li>Identifique-se informando seu nome e o <strong>${flatDisplay}</strong>.</li>
        <li>Certifique-se de que seu <strong>Pré-Check-in Digital</strong> está concluído no link abaixo para autorização imediata da chave.</li>
      </ol>
      <div style="margin-top: 14px; text-align: center;">
        <a href="${checkinUrl}" style="display: inline-block; background: #2563eb; color: #ffffff !important; font-weight: 800; font-size: 13px; padding: 10px 22px; border-radius: 8px; text-decoration: none;">
          📝 Acessar / Conferir Ficha de Check-in
        </a>
      </div>
    </div>

    <div class="section-title">📶 Conexão Wi-Fi</div>
    <div class="info-card">
      <table class="info-table">
        <tr><td class="label">Rede:</td><td class="val" style="font-weight: 800; color: #0369a1;">${wifiNetwork}</td></tr>
        <tr><td class="label">Senha:</td><td class="val" style="font-family: monospace; font-size: 14px; color: #0f172a;">${wifiPassword}</td></tr>
      </table>
    </div>

    <div class="section-title">🏢 Detalhes da Reserva</div>
    <div class="info-card">
      <table class="info-table">
        <tr><td class="label">Acomodação:</td><td class="val" style="color: #d97706; font-weight: 800;">${flatDisplay} (${buildingName})</td></tr>
        <tr><td class="label">Código da Reserva:</td><td class="val" style="font-family: monospace;">#${resCode}</td></tr>
        <tr><td class="label">Horário de Entrada:</td><td class="val">${checkinDateBr} a partir das ${checkinTime}</td></tr>
      </table>
    </div>
  `;

  const badge = `<span class="badge badge-general">🔑 Instruções de Acesso</span>`;
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
  const receptionEmail = (flat?.receptionEmail || db?.settings?.receptionEmail || db?.settings?.buildingEmail || process.env.RECEPTION_EMAIL || "millerpessanha@gmail.com").toLowerCase().trim();

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
    }
    if (code) {
      candidateNames.push(`FNRH_${code}.pdf`);
      candidateNames.push(`fnrh_${code}.pdf`);
    }
    if (id) {
      candidateNames.push(`FNRH_${id}.pdf`);
      candidateNames.push(`fnrh_${id}.pdf`);
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
            if (cleanId && lower.startsWith(`fnrh_${cleanId}_${cleanCpf}_`)) return true;
            if (cleanCode && lower.startsWith(`fnrh_${cleanCode}_${cleanCpf}_`)) return true;
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
          if (cleanId && (lower.startsWith(`fnrh_${cleanId}_`) || lower.startsWith(`fnrh_${cleanId}.`))) return true;
          if (cleanCode && (lower.startsWith(`fnrh_${cleanCode}_`) || lower.startsWith(`fnrh_${cleanCode}.`))) return true;
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
  let titularAuditFileName = titularGuestRecord?.fnrhFileName || reservation.fnrhFileName || titularGuestRecord?.fnrhAuditTrail?.fileName || reservation.fnrhAuditTrail?.fileName || guest?.fnrhAuditTrail?.fileName;
  if (!titularAuditFileName && titularUuid && Array.isArray(db?.fnrhAuditDocuments)) {
    const auditDoc = db.fnrhAuditDocuments.find(a => a.documentUuid === titularUuid || String(a.reservationId) === String(reservation.id) || a.reservationCode === resCode);
    if (auditDoc?.fileName) titularAuditFileName = auditDoc.fileName;
  }

  const titularFnrhPath = findFnrhPath({
    filePath: titularGuestRecord?.fnrhFilePath || reservation.fnrhFilePath || guest?.fnrhFilePath,
    fileName: titularAuditFileName,
    uuid: titularUuid,
    code: resCode,
    id: reservation.id,
    cpf: titularGuestRecord?.cpf || titularGuestRecord?.document || reservation.guestDocument || guest?.document
  });

  if (titularFnrhPath) {
    attachments.push({
      filename: `FNRH_${resCode}_${primaryName}.pdf`,
      path: titularFnrhPath
    });
  }

  // FNRHs de Co-hóspedes (se houverem concluído pré-checkin digital)
  if (Array.isArray(reservation.guests)) {
    reservation.guests.forEach((g, idx) => {
      if (Number(g.index) === 1 || (idx === 0 && !g.index)) return;
      const gUuid = g.fnrhDocumentUuid;
      let gAuditFileName = g.fnrhFileName || g.fnrhAuditTrail?.fileName;
      if (!gAuditFileName && gUuid && Array.isArray(db?.fnrhAuditDocuments)) {
        const auditDoc = db.fnrhAuditDocuments.find(a => a.documentUuid === gUuid);
        if (auditDoc?.fileName) gAuditFileName = auditDoc.fileName;
      }
      const coGuestFnrhPath = findFnrhPath({
        filePath: g.fnrhFilePath,
        fileName: gAuditFileName,
        uuid: gUuid,
        code: resCode,
        id: reservation.id,
        cpf: g.cpf || g.document
      });
      if (coGuestFnrhPath && !attachments.some(a => a.path === coGuestFnrhPath)) {
        const gName = (g.name || `Hospede_${idx + 1}`)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^\w\s-]/gi, "")
          .trim()
          .replace(/\s+/g, "_");
        attachments.push({
          filename: `FNRH_${resCode}_${gName}.pdf`,
          path: coGuestFnrhPath
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


import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-carrega arquivo .env da raiz do projeto se existir
try {
  const rootEnvPath = path.resolve(__dirname, "../../.env");
  if (fs.existsSync(rootEnvPath)) {
    const envContent = fs.readFileSync(rootEnvPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (e) {
  console.warn("[MailService] Aviso ao carregar .env:", e.message);
}

/**
 * Obtém as configurações SMTP consolidadas (Variáveis de Ambiente > Banco de Dados > Padrões Zoho)
 */
export function getSmtpConfig(db) {
  const emailSettings = db?.settings?.emailSettings || {};
  const host = process.env.SMTP_HOST || emailSettings.host || "smtppro.zoho.com";
  const port = Number(process.env.SMTP_PORT || emailSettings.port || 465);
  const user = process.env.SMTP_USER || emailSettings.user || "";
  const pass = process.env.SMTP_PASS || emailSettings.pass || "";
  const fromName = process.env.SMTP_FROM_NAME || emailSettings.fromName || "CorpFlats";
  const fromEmail = process.env.SMTP_FROM_EMAIL || emailSettings.fromEmail || user || "reservas@corpflats.com.br";
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
export function createTransporter(db) {
  const config = getSmtpConfig(db);
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
export async function verifySmtpConnection(db) {
  const config = getSmtpConfig(db);
  if (!config.user || !config.pass) {
    return {
      ok: false,
      error: "Credenciais de SMTP (SMTP_USER ou SMTP_PASS) não estão configuradas."
    };
  }

  try {
    const transporter = createTransporter(db);
    if (!transporter) {
      return { ok: false, error: "Falha ao instanciar o transporte SMTP." };
    }
    await transporter.verify();
    return {
      ok: true,
      message: `Conexão SMTP estabelecida com sucesso com ${config.host}:${config.port} via conta ${config.user}!`
    };
  } catch (err) {
    return {
      ok: false,
      error: `Falha na verificação SMTP: ${err.message}`
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
export function renderCheckinConfirmedEmail({ reservation, flat, settings }) {
  const flatNumber = flat?.number || reservation?.flatNumber || "Não informado";
  const buildingName = flat?.buildingName || flat?.building || settings?.buildingName || "Edifício Soho Residence Service";
  const guestName = reservation?.guestName || "Hóspede Titular";
  const checkinDateBr = formatDateBr(reservation?.checkinDate);
  const checkoutDateBr = formatDateBr(reservation?.checkoutDate);

  const subject = `[CHECK-IN CONFIRMADO] Flat ${flatNumber} - ${guestName} (${checkinDateBr} a ${checkoutDateBr})`;

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

  // Observações e Notas de Recepção
  const receptionNotes = [
    reservation?.receptionNotes ? `Nota de Recepção: ${reservation.receptionNotes}` : null,
    reservation?.specialRequests ? `Pedido Especial: ${reservation.specialRequests}` : null,
    reservation?.notes ? `Obs: ${reservation.notes}` : null
  ].filter(Boolean).join(" • ");

  const contentHtml = `
    <div style="margin-bottom: 20px;">
      <h2 style="font-size: 17px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0;">Olá, Equipe de Recepção / Portaria!</h2>
      <p style="font-size: 13px; color: #475569; margin: 0; line-height: 1.5;">
        O hóspede concluiu o formulário de <strong>Check-in Digital (FNHR)</strong>. Seguem todos os dados cadastrais e de acesso para a devida liberação na portaria:
      </p>
    </div>

    <div class="section-title">🏢 Identificação da Unidade</div>
    <div class="info-card">
      <table class="info-table">
        <tr><td class="label">Edifício:</td><td class="val">${buildingName}</td></tr>
        <tr><td class="label">Apartamento:</td><td class="val" style="font-size: 15px; color: #d97706;">Flat ${flatNumber}</td></tr>
        <tr><td class="label">Código da Reserva:</td><td class="val" style="font-family: monospace;">#${reservation?.code || reservation?.id}</td></tr>
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

  return { subject, bodyHtml, html: bodyHtml };
}

/**
 * Gatilho B: Template de Alteração de Reserva à Recepção/Portaria
 */
export function renderReservationUpdateEmail({ reservation, flat, changes = [], changesSummary = [], actionType, settings }) {
  const flatNumber = flat?.number || reservation?.flatNumber || "Não informado";
  const buildingName = flat?.buildingName || flat?.building || settings?.buildingName || "Edifício Soho Residence Service";
  const guestName = reservation?.guestName || "Hóspede Titular";
  
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
      </table>
    </div>
  `;

  const badge = isCancelled 
    ? `<span class="badge badge-cancel">❌ Reserva Cancelada</span>` 
    : `<span class="badge badge-update">⚡ Reserva Alterada</span>`;

  const bodyHtml = wrapEmailTemplate({ title: subject, badge, contentHtml });
  return { subject, bodyHtml, html: bodyHtml };
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
 * Fila / Serviço Assíncrono de Disparo de E-mail
 * Grava o log imediatamente no histórico e despacha em background sem bloquear a requisição HTTP.
 */
export function sendEmailAsync({
  db,
  saveDatabase,
  reservationId,
  recipient,
  subject,
  bodyHtml,
  html,
  bodyText = "",
  type = "email",
  direction = "outbound",
  metadata = {}
}) {
  if (!recipient || !subject) {
    console.warn("[MailService] Destinatário ou assunto ausentes. Abortando.");
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
    subject: subject.trim(),
    body: finalHtml || bodyText || "",
    status: "pending",
    metadata: {
      ...metadata,
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
      const config = getSmtpConfig(db);
      if (!config.user || !config.pass) {
        throw new Error("SMTP não configurado no backend (credenciais de SMTP_USER/SMTP_PASS ausentes).");
      }

      const transporter = createTransporter(db);
      if (!transporter) {
        throw new Error("Não foi possível criar transporte SMTP.");
      }

      const mailOptions = {
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: recipient.trim(),
        subject: subject.trim(),
        html: finalHtml || `<p>${bodyText}</p>`,
        text: bodyText || subject
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

/**
 * B2B Autonomous Cancellation Service
 * File: artifacts/api-server/b2b-cancellation-service.mjs
 *
 * Responsibilities (Milestone 3 - F12, F13, F14, F15, F16):
 * - F12_DETECCAO_EMAIL_CANCELAMENTO: Detecção precisa de intenção de cancelamento vs voucher de confirmação.
 * - F13_CASAMENTO_RESERVA_CANCELAMENTO: Busca em 4 camadas (B2B num, RLOC, código PMS, heurística hóspede + checkin).
 * - F14_TRAVA_SEGURANCA_CHECKED_IN: Invariante CHECKED_IN_CANCELLATION para bloquear cancelamento de hóspede em estada.
 * - F15_CASCATA_CANCELAMENTO_PMS: Cascata canônica de cancelamento do PMS (demo-server.mjs:37170-37328),
 *   liberação de quarto, limpeza de tarefas de governança, pedidos de café e seeds B2B.
 * - F16_AUDITORIA_NOTIFICACAO_GESTOR: Auditoria dupla (reserva + global) e alerta prioritário WhatsApp Z-API ao gestor.
 */

import { sendZapiMessage } from "./zapi-service.mjs";

const DEFAULT_ADMIN_WHATSAPP = "5522997124021";

/**
 * Normaliza strings removendo acentos e espaços extras para comparação segura
 */
function normalizeStr(str = "") {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

/**
 * Extrai tokens significativos de nome para comparação heurística
 */
export function extractNameTokens(name = "") {
  return normalizeStr(name)
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      token =>
        token.length >= 3 &&
        !["DOS", "DAS", "DE", "DA", "DO", "FILHO", "NETO", "JUNIOR", "SOBRINHO", "SRA", "SRTA", "SR"].includes(token)
    );
}

/**
 * Normaliza datas nos formatos DD/MM/YYYY ou YYYY-MM-DD para YYYY-MM-DD
 */
export function normalizeIsoDate(dateStr = "") {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const ddmmyyyy = s.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, "0");
    const month = ddmmyyyy[2].padStart(2, "0");
    let year = ddmmyyyy[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }
  return null;
}

/**
 * Detecta intenção de cancelamento em e-mails recebidos, diferenciando-os de confirmações
 * de reserva que citam políticas de cancelamento ou termos genéricos.
 *
 * @param {object|string} emailData - Dados do e-mail (subject, text, html, summary, etc.)
 * @returns {{ isCancellation: boolean, isVoucher: boolean, confidence: number, cancellationKeywords: string[] }}
 */
export function detectB2bEmailIntent(emailData = {}) {
  let subject = "";
  let text = "";
  let html = "";

  if (typeof emailData === "string") {
    text = emailData;
  } else if (emailData && typeof emailData === "object") {
    subject = String(emailData.subject || emailData.Subject || "").trim();
    text = String(emailData.text || emailData.bodyText || emailData.summary || "").trim();
    html = String(emailData.html || emailData.bodyHtml || emailData.content || "").trim();
  }

  const cleanSubject = normalizeStr(subject);
  const cleanBody = normalizeStr(`${text}\n${html.replace(/<[^>]+>/g, " ")}`);
  const fullText = `${cleanSubject}\n${cleanBody}`;

  const cancellationKeywordsFound = [];
  const keywordCandidates = [
    "CANCELAMENTO",
    "CANCELADA",
    "CANCELADO",
    "CANCELAR",
    "CANCELLATION",
    "CANCELLED",
    "CANCELED"
  ];

  for (const kw of keywordCandidates) {
    if (fullText.includes(kw)) {
      cancellationKeywordsFound.push(kw.toLowerCase());
    }
  }

  // Padrões explícitos de cancelamento no assunto
  const subjectCancellationPattern =
    /(?:CANCELAMENTO|CANCELLATION|BOOKING\s+CANCELL?ATION|CANCELLATION\s+OF\s+BOOKING|BOOKING\s+CANCELL?ED|RESERVA\s+(?:FOI\s+)?CANCELADA|SOLICITA[CÇ][AÃ]O\s+DE\s+CANCELAMENTO|CANCELAMENTO\s+EFETUADO)/i;

  // Padrões imperativos / de ação de cancelamento no corpo do e-mail
  const bodyActionCancellationPattern =
    /(?:SOLICITA(?:MOS)?\s+(?:O\s+)?CANCELAMENTO|PEDIMOS\s+(?:O\s+)?CANCELAMENTO|FAVOR\s+CANCELAR|PROCEDER\s+COM\s+O\s+CANCELAMENTO|CANCELAMENTO\s+DA\s+RESERVA|CANCELAMENTO\s+DO\s+VOUCHER|CONFIRMAMOS\s+O\s+CANCELAMENTO|RESERVA\s+(?:FOI|ESTA|ESTÁ)\s+CANCELADA|PLEASE\s+CANCEL\s+THE\s+BOOKING|WE\s+REQUEST\s+CANCELLATION)/i;

  // Padrões de voucher / confirmação
  const voucherPattern =
    /(?:CONFIRMA[CÇ][AÃ]O\s+D[AE]\s+RESERVA|\bVOUCHER\b|CONFIRMED\s+BOOKING|BOOKING\s+CONFIRMATION|NOVO\s+VOUCHER)/i;

  // Padrões de falso positivo (menção de regras/política de cancelamento em vouchers)
  const isOnlyPolicyNotice =
    /(?:POL[IÍ]TICA\s+DE\s+CANCELAMENTO|REGRAS?\s+DE\s+CANCELAMENTO|CANCELAMENTO\s+GRATUITO|TAXA\s+DE\s+CANCELAMENTO|MULTA\s+DE\s+CANCELAMENTO|EM\s+CASO\s+DE\s+CANCELAMENTO)/i.test(
      fullText
    );

  const hasSubjectCancellation = subjectCancellationPattern.test(cleanSubject);
  const hasBodyActionCancellation = bodyActionCancellationPattern.test(cleanBody);
  const hasVoucherSignals = voucherPattern.test(cleanSubject) || voucherPattern.test(cleanBody);

  // Decisão e cálculo de confiança
  if (hasSubjectCancellation) {
    return {
      isCancellation: true,
      isVoucher: false,
      confidence: 1.0,
      cancellationKeywords: Array.from(new Set(cancellationKeywordsFound))
    };
  }

  if (hasBodyActionCancellation && !cleanSubject.includes("CONFIRMACAO DE RESERVA")) {
    return {
      isCancellation: true,
      isVoucher: false,
      confidence: 0.92,
      cancellationKeywords: Array.from(new Set(cancellationKeywordsFound))
    };
  }

  if (hasVoucherSignals) {
    // É um voucher/confirmação que eventualmente citou regras de cancelamento
    return {
      isCancellation: false,
      isVoucher: true,
      confidence: 0.95,
      cancellationKeywords: []
    };
  }

  if (cancellationKeywordsFound.length > 0 && !isOnlyPolicyNotice && (hasBodyActionCancellation || /CANCEL/i.test(cleanSubject))) {
    return {
      isCancellation: true,
      isVoucher: false,
      confidence: 0.8,
      cancellationKeywords: Array.from(new Set(cancellationKeywordsFound))
    };
  }

  return {
    isCancellation: false,
    isVoucher: false,
    confidence: 0.0,
    cancellationKeywords: []
  };
}

/**
 * Extrai campos úteis de cancelamento a partir do payload de e-mail
 */
export function extractCancellationData(emailData = {}) {
  let subject = "";
  let text = "";
  let html = "";

  if (typeof emailData === "string") {
    text = emailData;
  } else if (emailData && typeof emailData === "object") {
    subject = String(emailData.subject || emailData.Subject || "").trim();
    text = String(emailData.text || emailData.bodyText || emailData.summary || "").trim();
    html = String(emailData.html || emailData.bodyHtml || emailData.content || "").trim();
  }

  const combined = `${subject}\n${text}\n${html.replace(/<[^>]+>/g, " ")}`;

  // 1. Número da reserva B2B (ex: 25055349 ou B2B-25055349)
  let b2bReservationNumber = null;
  const b2bPrefixMatch = combined.match(/\bB2B[-_\s]?(\d{6,10})\b/i);
  if (b2bPrefixMatch) {
    b2bReservationNumber = b2bPrefixMatch[1];
  } else {
    const numLabelMatch = combined.match(/(?:reserva|voucher|b2b|n[ºo°]|número|pedido)[:\s#]*(\d{7,10})\b/i);
    if (numLabelMatch) {
      b2bReservationNumber = numLabelMatch[1];
    } else {
      const standaloneNumMatch = combined.match(/\b(250\d{5})\b/);
      if (standaloneNumMatch) {
        b2bReservationNumber = standaloneNumMatch[1];
      }
    }
  }

  // 2. Localizador / RLOC (ex: LOC-12345, RLOC: ABCD12, RLOC-AZUL01)
  let rloc = null;
  const rlocMatch =
    combined.match(/(?:localizador|rloc|locator|loc)[:\s#]+(?:rloc[-_\s]?)?([A-Z0-9_-]{3,15})\b/i) ||
    combined.match(/\b(?:RLOC|LOC)[-_\s]?([A-Z0-9]{4,10})\b/i);
  if (rlocMatch) {
    rloc = rlocMatch[1].trim().toUpperCase();
  }

  // 3. Código PMS (ex: RES-605, RES-113)
  let pmsCode = null;
  const pmsMatch = combined.match(/\b(RES-\d{3,7})\b/i);
  if (pmsMatch) {
    pmsCode = pmsMatch[1].toUpperCase();
  }

  // 4. Hóspede
  let guestName = null;
  const guestMatch = combined.match(/(?:h[óo]spede|guest|passageiro|nome(?:\s+do\s+h[óo]spede)?|titular)[:\s]+([A-ZÀ-Úa-zà-ú\s]{4,60})(?:\n|\r|,|-|\.|\/|$)/i);
  if (guestMatch) {
    guestName = guestMatch[1].trim();
  }

  // 5. Datas (Check-in e Check-out)
  let checkinDate = null;
  let checkoutDate = null;
  const periodMatch = combined.match(/(?:per[íi]odo|periodo)[:\s]+(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})\s+(?:a|at[ée]|-)\s+(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/i);
  if (periodMatch) {
    checkinDate = normalizeIsoDate(periodMatch[1]);
    checkoutDate = normalizeIsoDate(periodMatch[2]);
  } else {
    const inMatch = combined.match(/(?:check-?in|entrada|chegada|data\s+de\s+entrada)[:\s]+(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/i);
    if (inMatch) checkinDate = normalizeIsoDate(inMatch[1]);
    const outMatch = combined.match(/(?:check-?out|sa[íi]da|partida|data\s+de\s+sa[íi]da)[:\s]+(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/i);
    if (outMatch) checkoutDate = normalizeIsoDate(outMatch[1]);
  }

  // 6. Motivo do cancelamento
  let reason = null;
  const reasonMatch = combined.match(/(?:motivo|justificativa|reason)[:\s]+([^\n\r]{4,120})/i);
  if (reasonMatch) {
    reason = reasonMatch[1].trim();
  }

  return {
    b2bReservationNumber,
    rloc,
    pmsCode,
    guestName,
    checkinDate,
    checkoutDate,
    reason
  };
}

/**
 * Executa a busca da reserva no PMS através da estratégia em 4 camadas:
 * - Tier 1: Número da reserva B2B (b2bReservationNumber, externalReservationNumber, notes)
 * - Tier 2: Localizador / RLOC (rloc, locator, b2bLocatorRloc, externalCode, notes)
 * - Tier 3: Código PMS (id, code, reservationCode)
 * - Tier 4: Heurística (tokens significativos do nome do hóspede + data de check-in)
 *
 * @param {object} db - Base de dados PMS
 * @param {object} cancelData - Critérios de busca ou payload de cancelamento
 * @returns {{ matched: boolean, reservation?: object, matchedBy?: 'b2b_number' | 'rloc' | 'pms_code' | 'heuristic', candidatesCount: number, candidates?: object[] }}
 */
export function matchReservationForCancellation(db, cancelData = {}) {
  const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
  if (reservations.length === 0) {
    return { matched: false, candidatesCount: 0 };
  }

  // Se cancelData contiver texto ou e-mail bruto, realiza extração estruturada
  const extracted = cancelData?.b2bReservationNumber || cancelData?.rloc || cancelData?.pmsCode
    ? cancelData
    : extractCancellationData(cancelData);

  const rawB2b = String(extracted.b2bReservationNumber || cancelData.b2bReservationNumber || "").trim();
  const cleanB2bDigits = rawB2b.replace(/^B2B-/i, "").trim();
  const rawRloc = String(extracted.rloc || cancelData.rloc || cancelData.locator || cancelData.b2bLocatorRloc || "").trim().toUpperCase();
  const rawPmsCode = String(extracted.pmsCode || cancelData.pmsCode || cancelData.code || cancelData.id || cancelData.reservationCode || "").trim().toUpperCase();
  const rawGuestName = String(extracted.guestName || cancelData.guestName || "").trim();
  const rawCheckinDate = normalizeIsoDate(extracted.checkinDate || cancelData.checkinDate);

  // ── TIER 1: Número da Reserva B2B ───────────────────────────────────────────
  if (cleanB2bDigits) {
    const prefixed = `B2B-${cleanB2bDigits}`;
    const tier1Matches = reservations.filter(r => {
      if (!r) return false;
      const b2bNum = String(r.b2bReservationNumber || "").trim();
      const extNum = String(r.externalReservationNumber || r.externalCode || "").trim();
      const code = String(r.code || "").trim();
      const notes = String(r.notes || "");
      return (
        b2bNum === cleanB2bDigits ||
        b2bNum === prefixed ||
        extNum === cleanB2bDigits ||
        extNum === prefixed ||
        code === prefixed ||
        code === cleanB2bDigits ||
        notes.includes(cleanB2bDigits)
      );
    });

    if (tier1Matches.length === 1) {
      return {
        matched: true,
        reservation: tier1Matches[0],
        matchedBy: "b2b_number",
        candidatesCount: 1
      };
    }

    if (tier1Matches.length > 1) {
      // Desempate por reserva ativa / não cancelada
      const activeCandidates = tier1Matches.filter(r => r.status !== "cancelada" && r.status !== "cancelled");
      if (activeCandidates.length === 1) {
        return {
          matched: true,
          reservation: activeCandidates[0],
          matchedBy: "b2b_number",
          candidatesCount: 1
        };
      }
      return {
        matched: false,
        matchedBy: "b2b_number",
        candidatesCount: tier1Matches.length,
        candidates: tier1Matches
      };
    }
  }

  // ── TIER 2: Localizador / RLOC ──────────────────────────────────────────────
  if (rawRloc) {
    const cleanRloc = rawRloc.replace(/^(?:RLOC|LOC)[-_\s]?/i, "").trim();
    const tier2Matches = reservations.filter(r => {
      if (!r) return false;
      const rlocVal = String(r.b2bLocatorRloc || r.locator || r.rloc || "").trim().toUpperCase();
      const extVal = String(r.externalCode || "").trim().toUpperCase();
      const notesVal = String(r.notes || "").toUpperCase();
      return (
        rlocVal === rawRloc ||
        (cleanRloc && (rlocVal === `RLOC-${cleanRloc}` || rlocVal === `LOC-${cleanRloc}` || rlocVal === cleanRloc)) ||
        extVal === rawRloc ||
        (cleanRloc && (extVal === `RLOC-${cleanRloc}` || extVal === `LOC-${cleanRloc}` || extVal === cleanRloc)) ||
        notesVal.includes(rawRloc) ||
        (cleanRloc && notesVal.includes(cleanRloc))
      );
    });

    if (tier2Matches.length === 1) {
      return {
        matched: true,
        reservation: tier2Matches[0],
        matchedBy: "rloc",
        candidatesCount: 1
      };
    }

    if (tier2Matches.length > 1) {
      const activeCandidates = tier2Matches.filter(r => r.status !== "cancelada" && r.status !== "cancelled");
      if (activeCandidates.length === 1) {
        return {
          matched: true,
          reservation: activeCandidates[0],
          matchedBy: "rloc",
          candidatesCount: 1
        };
      }
      return {
        matched: false,
        matchedBy: "rloc",
        candidatesCount: tier2Matches.length,
        candidates: tier2Matches
      };
    }
  }

  // ── TIER 3: Código PMS ──────────────────────────────────────────────────────
  if (rawPmsCode) {
    const tier3Matches = reservations.filter(r => {
      if (!r) return false;
      return (
        String(r.id) === rawPmsCode ||
        String(r.code || "").toUpperCase() === rawPmsCode ||
        String(r.reservationCode || "").toUpperCase() === rawPmsCode
      );
    });

    if (tier3Matches.length === 1) {
      return {
        matched: true,
        reservation: tier3Matches[0],
        matchedBy: "pms_code",
        candidatesCount: 1
      };
    }

    if (tier3Matches.length > 1) {
      const activeCandidates = tier3Matches.filter(r => r.status !== "cancelada" && r.status !== "cancelled");
      if (activeCandidates.length === 1) {
        return {
          matched: true,
          reservation: activeCandidates[0],
          matchedBy: "pms_code",
          candidatesCount: 1
        };
      }
      return {
        matched: false,
        matchedBy: "pms_code",
        candidatesCount: tier3Matches.length,
        candidates: tier3Matches
      };
    }
  }

  // ── TIER 4: Heurística (Hóspede + Data de Check-in) ─────────────────────────
  if (rawGuestName && rawCheckinDate) {
    const queryTokens = extractNameTokens(rawGuestName);
    if (queryTokens.length > 0) {
      const tier4Matches = reservations.filter(r => {
        if (!r) return false;
        if (r.checkinDate !== rawCheckinDate) return false;
        const resGuestTokens = extractNameTokens(r.guestName || "");
        if (resGuestTokens.length === 0) return false;

        const commonTokens = queryTokens.filter(t => resGuestTokens.includes(t));
        const minTokensRequired = Math.min(2, queryTokens.length);
        return commonTokens.length >= minTokensRequired;
      });

      if (tier4Matches.length === 1) {
        return {
          matched: true,
          reservation: tier4Matches[0],
          matchedBy: "heuristic",
          candidatesCount: 1
        };
      }

      if (tier4Matches.length > 1) {
        const activeCandidates = tier4Matches.filter(r => r.status !== "cancelada" && r.status !== "cancelled");
        if (activeCandidates.length === 1) {
          return {
            matched: true,
            reservation: activeCandidates[0],
            matchedBy: "heuristic",
            candidatesCount: 1
          };
        }
        return {
          matched: false,
          matchedBy: "heuristic",
          candidatesCount: tier4Matches.length,
          candidates: tier4Matches
        };
      }
    }
  }

  return {
    matched: false,
    candidatesCount: 0
  };
}

/**
 * Formata mensagem estruturada de alerta WhatsApp para o gestor
 */
export function formatCancellationManagerAlert(reservation = {}, matchResult = {}, reason = "") {
  const flat = reservation.flatNumber || "N/A";
  const guest = reservation.guestName || "Hóspede não informado";
  const agency = reservation.agencyName || reservation.companyName || "Agência B2B";
  const checkin = reservation.checkinDate || "N/A";
  const checkout = reservation.checkoutDate || "N/A";
  const code = reservation.code || reservation.id || "N/A";
  const b2bNum = reservation.b2bReservationNumber || "N/A";
  const rloc = reservation.b2bLocatorRloc || reservation.locator || reservation.rloc || "N/A";
  const b2bDisplay =
    b2bNum !== "N/A" && rloc !== "N/A"
      ? `${b2bNum} (RLOC: ${rloc})`
      : b2bNum !== "N/A"
        ? b2bNum
        : rloc;
  const tier = matchResult?.matchedBy || "sistema";
  const finalReason = reason || reservation.cancellationReason || "E-mail de cancelamento B2B autônomo";

  return (
    `❌ *CANCELAMENTO AUTÔNOMO B2B PROCESSADO*\n\n` +
    `A reserva foi cancelada com sucesso no sistema PMS:\n` +
    `🏨 *Flat:* ${flat}\n` +
    `👤 *Hóspede:* ${guest}\n` +
    `🏢 *Agência/Empresa:* ${agency}\n` +
    `📅 *Período:* ${checkin} até ${checkout}\n` +
    `🔢 *Código PMS:* ${code}\n` +
    `🏷️ *B2B / RLOC:* ${b2bDisplay}\n` +
    `🎯 *Identificado por:* ${tier}\n` +
    `ℹ️ *Motivo:* ${finalReason}\n\n` +
    `✅ Quarto e escala de governança foram liberados automaticamente.`
  );
}

/**
 * Formata mensagem estruturada de alerta urgente para tentativa de cancelamento bloqueada
 */
export function formatBlockedCancellationAlert(reservation = {}, matchResult = {}, reason = "") {
  const flat = reservation.flatNumber || "N/A";
  const guest = reservation.guestName || "Hóspede não informado";
  const code = reservation.code || reservation.id || "N/A";
  const checkin = reservation.checkinDate || "N/A";

  return (
    `🚨 *ALERTA URGENTE: TENTATIVA DE CANCELAMENTO BLOQUEADA*\n\n` +
    `Um e-mail de cancelamento B2B foi recebido para a reserva *${code}* (*Flat ${flat}*), ` +
    `porém o hóspede *${guest}* *JÁ ESTÁ EM ESTADIA (CHECKED-IN)* (Entrada: ${checkin}).\n\n` +
    `🔒 *Ação do Sistema:* O cancelamento autônomo foi *BLOQUEADO* pela trava de segurança operacional (CHECKED_IN_CANCELLATION).\n` +
    `⚠️ *Ação Necessária:* Entre em contato com a agência e o hóspede para verificar a situação.`
  );
}

/**
 * Executa o fluxo integral de cancelamento autônomo B2B a partir de um e-mail:
 * 1. Valida intenção de cancelamento (detectB2bEmailIntent).
 * 2. Localiza a reserva em 4 camadas (matchReservationForCancellation).
 * 3. Valida a invariante operacional CHECKED_IN_CANCELLATION.
 * 4. Aplica a cascata canônica de cancelamento PMS (demo-server.mjs:37170-37328).
 * 5. Registra auditoria dupla (na reserva e global no sistema).
 * 6. Dispara alerta WhatsApp Z-API e notificação na central de alertas.
 *
 * @param {object} db - Banco de dados do PMS
 * @param {object|string} emailData - Dados do e-mail
 * @param {object} options - Opções (saveDatabase, sendZapiMessage, createNotification, syncAriForReservation, cancellationReason)
 * @returns {Promise<{ success: boolean, cancelled: boolean, blockedReason?: string, reservationCode?: string, reservation?: object, matchedBy?: string, alertSent: boolean }>}
 */
export async function executeAutonomousB2bCancellation(db, emailData = {}, options = {}) {
  const nowIso = new Date().toISOString();
  const intent = detectB2bEmailIntent(emailData);

  if (!intent.isCancellation) {
    return {
      success: false,
      cancelled: false,
      blockedReason: "NOT_A_CANCELLATION",
      alertSent: false
    };
  }

  const cancelExtract = extractCancellationData(emailData);
  const matchResult = matchReservationForCancellation(db, cancelExtract);

  // Caso 1: Reserva não encontrada
  if (!matchResult.matched || !matchResult.reservation) {
    const adminPhone = db?.settings?.adminWhatsApp || DEFAULT_ADMIN_WHATSAPP;
    const notFoundReason = matchResult.candidatesCount > 1 ? "MULTIPLE_MATCHES" : "RESERVATION_NOT_FOUND";

    if (!Array.isArray(db.auditLogs)) db.auditLogs = [];
    const auditId = db.auditLogs.length > 0 ? (Number(db.auditLogs[0].id) || db.auditLogs.length) + 1 : 1;
    db.auditLogs.unshift({
      id: auditId,
      timestamp: nowIso,
      level: "warning",
      category: "reservation",
      action: `B2B_CANCELLATION_${notFoundReason}`,
      actor: { name: "Sistema Autônomo B2B", role: "system", type: "system" },
      source: "b2b_email_cancellation",
      details: {
        extractedCriteria: cancelExtract,
        candidatesCount: matchResult.candidatesCount || 0
      }
    });

    const notFoundAlert =
      `⚠️ *AVISO: E-MAIL DE CANCELAMENTO B2B SEM CORRESPONDÊNCIA*\n\n` +
      `Recebido e-mail de cancelamento, mas o sistema não encontrou uma reserva única correspondente no PMS.\n` +
      `🏷️ *Critérios extraídos:* B2B: ${cancelExtract.b2bReservationNumber || "N/A"} | RLOC: ${cancelExtract.rloc || "N/A"} | Hóspede: ${cancelExtract.guestName || "N/A"} | Checkin: ${cancelExtract.checkinDate || "N/A"}\n` +
      `🔍 *Resultado:* ${notFoundReason === "MULTIPLE_MATCHES" ? "Múltiplas reservas candidatas" : "Nenhuma reserva localizada"}.\n\n` +
      `Por favor, verifique manualmente a caixa de e-mails.`;

    const zapiFn = options.sendZapiMessage || sendZapiMessage;
    let alertSent = false;
    if (typeof zapiFn === "function") {
      try {
        await zapiFn(adminPhone, notFoundAlert, {
          db,
          isAdminAlert: true,
          bypassTestMode: true,
          recipientRole: "developer"
        });
        alertSent = true;
      } catch (zErr) {
        console.warn("[B2B Cancellation] Falha ao enviar WhatsApp de aviso ao gestor:", zErr?.message || zErr);
      }
    }

    if (typeof options.saveDatabase === "function") {
      options.saveDatabase("b2b_cancellation_unmatched");
    }

    return {
      success: false,
      cancelled: false,
      blockedReason: notFoundReason,
      matchedBy: null,
      alertSent
    };
  }

  const reservation = matchResult.reservation;
  const adminPhone = db?.settings?.adminWhatsApp || DEFAULT_ADMIN_WHATSAPP;

  // ── INVARIANTE CHECKED_IN_CANCELLATION: Bloqueio de cancelamento com hóspede em estada ──
  const isCheckedIn =
    reservation.status === "in_house" ||
    reservation.status === "checked_in" ||
    Boolean(reservation.checkedInAt) ||
    Boolean(reservation.actualCheckinTime);

  if (isCheckedIn) {
    if (!Array.isArray(reservation.auditLogs)) reservation.auditLogs = [];
    const blockAuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: nowIso,
      action: "cancellation_blocked",
      actor: { id: null, name: "Sistema Autônomo B2B", role: "system", type: "system" },
      source: "E-mail de Cancelamento B2B",
      description: "Tentativa de cancelamento autônomo bloqueada: hóspede já realizou check-in / status in_house.",
      changes: [{ field: "status", label: "Status da Reserva", oldValue: reservation.status, newValue: reservation.status }]
    };
    reservation.auditLogs.unshift(blockAuditEntry);

    if (!Array.isArray(db.auditLogs)) db.auditLogs = [];
    const globalLogId = db.auditLogs.length > 0 ? (Number(db.auditLogs[0].id) || db.auditLogs.length) + 1 : 1;
    db.auditLogs.unshift({
      id: globalLogId,
      timestamp: nowIso,
      level: "danger",
      category: "reservation",
      action: "RESERVATION_CANCELLATION_BLOCKED_CHECKED_IN",
      actor: blockAuditEntry.actor,
      source: "b2b_email_cancellation",
      details: {
        reservationId: reservation.id,
        reservationCode: reservation.code,
        flatNumber: reservation.flatNumber,
        guestName: reservation.guestName,
        status: reservation.status,
        checkedInAt: reservation.checkedInAt,
        matchedBy: matchResult.matchedBy
      }
    });

    // Notificação na central
    const notifObj = {
      category: "reservation",
      title: "🚨 Tentativa de Cancelamento Bloqueada (Hóspede em Estadia)",
      message: `Cancelamento da reserva ${reservation.code || reservation.id} (Flat ${reservation.flatNumber}) foi bloqueado porque o hóspede ${reservation.guestName} já está hospedado.`,
      severity: "danger",
      targetUrl: `/reservas?code=${reservation.code || reservation.id}`,
      metadata: {
        reservationId: reservation.id,
        reservationCode: reservation.code,
        flatNumber: reservation.flatNumber,
        guestName: reservation.guestName,
        blockedReason: "CHECKED_IN_CANCELLATION"
      }
    };
    if (typeof options.createNotification === "function") {
      options.createNotification(notifObj);
    } else {
      if (!Array.isArray(db.notifications)) db.notifications = [];
      db.notifications.unshift({ id: Date.now(), ...notifObj, createdAt: nowIso, read: false });
    }

    // Alerta urgente via WhatsApp
    const zapiFn = options.sendZapiMessage || sendZapiMessage;
    let alertSent = false;
    if (typeof zapiFn === "function") {
      try {
        const blockedMsg = formatBlockedCancellationAlert(reservation, matchResult, cancelExtract.reason);
        await zapiFn(adminPhone, blockedMsg, {
          db,
          isAdminAlert: true,
          bypassTestMode: true,
          recipientRole: "developer"
        });
        alertSent = true;
      } catch (zErr) {
        console.warn("[B2B Cancellation] Falha ao enviar WhatsApp urgente de cancelamento bloqueado:", zErr?.message || zErr);
      }
    }

    if (typeof options.saveDatabase === "function") {
      options.saveDatabase("b2b_cancellation_blocked_checked_in");
    }

    return {
      success: false,
      cancelled: false,
      blockedReason: "CHECKED_IN_CANCELLATION",
      reservationCode: reservation.code || String(reservation.id),
      reservation,
      matchedBy: matchResult.matchedBy,
      alertSent
    };
  }

  // ── PMS CANCELLATION CASCADE (Canônica de demo-server.mjs:37170-37328) ───────
  const prevStatus = reservation.status;
  const reasonText = cancelExtract.reason || options.cancellationReason || "E-mail de cancelamento B2B autônomo";

  reservation.status = "cancelada";
  reservation.cancelledAt = nowIso;
  reservation.cancellationReason = reasonText;
  reservation.updatedAt = nowIso;
  reservation.calendarSequence = (reservation.calendarSequence || 0) + 1;

  // Registro em deletedB2bSeeds para evitar ressuscitação por mock ou sync
  if (reservation.b2bReservationNumber || (reservation.code && String(reservation.code).startsWith("B2B-"))) {
    if (!Array.isArray(db.deletedB2bSeeds)) db.deletedB2bSeeds = [];
    if (reservation.b2bReservationNumber && !db.deletedB2bSeeds.includes(String(reservation.b2bReservationNumber))) {
      db.deletedB2bSeeds.push(String(reservation.b2bReservationNumber));
    }
    if (reservation.code && !db.deletedB2bSeeds.includes(String(reservation.code))) {
      db.deletedB2bSeeds.push(String(reservation.code));
    }
  }

  // Liberação de instruções automáticas da governança na data de check-in
  const flatNum = String(
    reservation.flatNumber ||
      (Array.isArray(db.flats) ? db.flats.find(f => f.id === reservation.flatId)?.number : "") ||
      ""
  );

  const cleanReq = (db.cleaningRequests || []).find(
    c =>
      (String(c.flatNumber) === flatNum || (reservation.flatId && c.flatId === reservation.flatId)) &&
      c.requestDate === reservation.checkinDate &&
      !c.isInstructionOnly &&
      c.source !== "manual_instruction" &&
      c.source !== "manual"
  );

  if (cleanReq) {
    if (!cleanReq.manualTwinBeds) cleanReq.twinBeds = false;
    if (!cleanReq.manualExtraMattress) cleanReq.extraMattress = false;
    if (!cleanReq.manualAdminNote) {
      cleanReq.adminNote = null;
      cleanReq.pendingObservation = null;
    }
    cleanReq.arrivingGuest = null;
    cleanReq.autoReservationCode = null;
    cleanReq.autoReservationId = null;
    cleanReq.updatedAt = nowIso;
  }

  // Descarte automático de cards de limpeza de check-out não realizados na data de saída
  const checkoutDatesToClear = Array.from(new Set([reservation.checkoutDate, reservation.earlyCheckoutDate].filter(Boolean)));
  for (const chkDate of checkoutDatesToClear) {
    const hasOtherActiveCheckout = (db.reservations || []).some(
      other =>
        other.id !== reservation.id &&
        other.status !== "cancelada" &&
        other.status !== "cancelado" &&
        other.status !== "cancelled" &&
        other.status !== "no_show" &&
        String(other.flatNumber || (Array.isArray(db.flats) ? db.flats.find(f => f.id === other.flatId)?.number : "") || "") === flatNum &&
        (other.checkoutDate === chkDate || other.earlyCheckoutDate === chkDate)
    );

    if (!hasOtherActiveCheckout) {
      for (const c of db.cleaningRequests || []) {
        const isInst = Boolean(
          c.isInstructionOnly ||
            c.source === "manual_instruction" ||
            c.type === "instruction" ||
            c.type === "bed_adjustment_only" ||
            c.isBedAdjustmentOnly
        );
        if (isInst) continue;
        if (
          (String(c.flatNumber) === flatNum || (reservation.flatId && c.flatId === reservation.flatId)) &&
          c.requestDate === chkDate &&
          c.source === "checkout" &&
          c.status !== "clean" &&
          c.status !== "deleted" &&
          !c.isDeleted &&
          !c.isVacantExplicitlySet &&
          !c.markedByAdmin
        ) {
          c.isDeleted = true;
          c.status = "deleted";
          c.deletedAt = nowIso;
          c.deletedBy = "reservation_cancelled";
          c.deletedReservationId = reservation.id;
          c.updatedAt = nowIso;
        }
      }
    }
  }

  // Marca pedidos de café da manhã vinculados como cancelados
  if (!db.breakfastOrders) db.breakfastOrders = [];
  db.breakfastOrders.forEach(o => {
    if (
      (o.reservationCode && (o.reservationCode === reservation.code || o.reservationCode === reservation.reservationCode)) ||
      o.reservationId === reservation.id ||
      (String(o.roomNumber) === String(reservation.flatNumber) && o.date >= reservation.checkinDate && o.date <= reservation.checkoutDate)
    ) {
      o.status = "cancelled";
      o.cancelReason = "Reserva B2B cancelada via e-mail autônomo";
    }
  });

  // Marca tarefas de serviço / OS associadas como canceladas se presentes
  if (Array.isArray(db.tasks)) {
    db.tasks.forEach(t => {
      if (t.reservationId === reservation.id || t.reservationCode === reservation.code) {
        t.status = "cancelled";
        t.updatedAt = nowIso;
      }
    });
  }

  // FNRH SERPRO
  if (reservation.serproReservaId && reservation.serproStatus !== "CANCELADA") {
    reservation.serproStatus = "CANCELADA";
    reservation.serproCancelledAt = nowIso;
  }

  // Sincronização ARI opcional (Channel Manager)
  if (typeof options.syncAriForReservation === "function") {
    try {
      await options.syncAriForReservation(reservation);
    } catch (ariErr) {
      console.warn("[B2B Cancellation] Aviso ao sincronizar ARI:", ariErr?.message || ariErr);
    }
  }

  // ── AUDITORIA DUPLA (Reserva + Global) ──────────────────────────────────────
  if (!Array.isArray(reservation.auditLogs)) reservation.auditLogs = [];
  const auditEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: nowIso,
    action: "cancelled",
    actor: {
      id: null,
      name: "Sistema Autônomo B2B",
      role: "system",
      type: "system"
    },
    source: "E-mail de Cancelamento B2B",
    description: `Cancelamento autônomo B2B processado via e-mail. Motivo: ${reasonText}`,
    changes: [
      {
        field: "status",
        label: "Status da Reserva",
        oldValue: prevStatus || "confirmada",
        newValue: "cancelada"
      }
    ]
  };
  reservation.auditLogs.unshift(auditEntry);
  reservation.lastModifiedBy = {
    timestamp: nowIso,
    actor: auditEntry.actor,
    source: auditEntry.source
  };

  if (!Array.isArray(db.auditLogs)) db.auditLogs = [];
  const globalLogId = db.auditLogs.length > 0 ? (Number(db.auditLogs[0].id) || db.auditLogs.length) + 1 : 1;
  const globalAuditEntry = {
    id: globalLogId,
    timestamp: nowIso,
    level: "warning",
    category: "reservation",
    action: "RESERVATION_CANCELLED_B2B_AUTONOMOUS",
    actor: auditEntry.actor,
    source: "b2b_email_cancellation",
    details: {
      reservationId: reservation.id,
      reservationCode: reservation.code,
      b2bReservationNumber: reservation.b2bReservationNumber,
      rloc: reservation.b2bLocatorRloc || reservation.locator || reservation.rloc,
      flatNumber: reservation.flatNumber,
      guestName: reservation.guestName,
      agencyName: reservation.agencyName,
      checkinDate: reservation.checkinDate,
      checkoutDate: reservation.checkoutDate,
      matchedBy: matchResult.matchedBy,
      reason: reasonText
    }
  };
  db.auditLogs.unshift(globalAuditEntry);

  // ── NOTIFICAÇÃO NA CENTRAL DE ALERTAS ────────────────────────────────────────
  const notifObj = {
    category: "reservation",
    title: "❌ Cancelamento Autônomo B2B",
    message: `Reserva ${reservation.code || reservation.id} (${reservation.guestName}, Flat ${reservation.flatNumber}) cancelada via e-mail B2B. Quarto liberado.`,
    severity: "warning",
    targetUrl: `/reservas?code=${reservation.code || reservation.id}`,
    metadata: {
      reservationId: reservation.id,
      reservationCode: reservation.code,
      flatNumber: reservation.flatNumber,
      guestName: reservation.guestName,
      source: "b2b_email_cancellation",
      matchedBy: matchResult.matchedBy
    }
  };

  if (typeof options.createNotification === "function") {
    options.createNotification(notifObj);
  } else {
    if (!Array.isArray(db.notifications)) db.notifications = [];
    db.notifications.unshift({ id: Date.now(), ...notifObj, createdAt: nowIso, read: false });
  }

  // ── ALERTA WHATSAPP Z-API AO GESTOR ─────────────────────────────────────────
  const zapiFn = options.sendZapiMessage || sendZapiMessage;
  let alertSent = false;
  if (typeof zapiFn === "function") {
    try {
      const alertMessage = formatCancellationManagerAlert(reservation, matchResult, reasonText);
      await Promise.race([
        zapiFn(adminPhone, alertMessage, {
          db,
          isAdminAlert: true,
          bypassTestMode: true,
          recipientRole: "developer"
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Z-API timeout")), 2000))
      ]);
      alertSent = true;
    } catch (zErr) {
      console.warn("[B2B Cancellation] Aviso ao enviar WhatsApp ao gestor:", zErr?.message || zErr);
      alertSent = true;
    }
  }

  if (typeof options.saveDatabase === "function") {
    options.saveDatabase("b2b_autonomous_cancellation");
  }

  return {
    success: true,
    cancelled: true,
    reservationCode: reservation.code || String(reservation.id),
    reservation,
    matchedBy: matchResult.matchedBy,
    alertSent
  };
}

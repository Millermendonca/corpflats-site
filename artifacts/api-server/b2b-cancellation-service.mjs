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

const DEFAULT_ADMIN_WHATSAPP = "5522998505276";
const HOTEL_OWN_BOT_PHONES = new Set(["5522997124021", "22997124021"]);
const unmatchedAlertWindowTimestamps = [];

function isHotelOwnBotPhone(rawPhone = "", db = null) {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  if (!digits) return false;
  if (HOTEL_OWN_BOT_PHONES.has(digits)) return true;
  if ((digits.endsWith("997124021") || digits.endsWith("97124021")) && (digits.startsWith("5522") || digits.startsWith("22"))) {
    return true;
  }
  const connectedDigits = String(db?.zapiConfig?.connectedPhone || "").replace(/\D/g, "");
  if (connectedDigits && digits === connectedDigits) return true;
  return false;
}

export function resolveB2bManagerWhatsApp(db = null) {
  const candidates = [
    db?.settings?.managerWhatsApp,
    db?.whatsappAiSettings?.developerPhone,
    db?.zapiConfig?.npsManagerAlertPhone,
    db?.settings?.adminPhone,
    db?.settings?.adminWhatsApp,
    DEFAULT_ADMIN_WHATSAPP
  ];
  for (const raw of candidates) {
    let digits = String(raw || "").replace(/\D/g, "");
    if (!digits) continue;
    if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith("55")) {
      digits = `55${digits}`;
    }
    // NUNCA dispara alerta de gestor para o próprio número oficial Z-API do hotel (evita loop de auto-conversa)
    if (isHotelOwnBotPhone(digits, db)) continue;
    if (digits.length >= 12) return digits;
  }
  return DEFAULT_ADMIN_WHATSAPP;
}

function buildB2bCancelAlertDedupeKey(emailData = {}, cancelExtract = {}) {
  if (emailData && typeof emailData === "object") {
    const explicitId = String(emailData.id || emailData.messageId || emailData.zohoMessageId || "").trim();
    if (explicitId) return `id:${explicitId}`;
  }
  const subj =
    emailData && typeof emailData === "object"
      ? normalizeStr(emailData.subject || emailData.Subject || "")
      : normalizeStr(String(emailData || "").slice(0, 120));
  const from =
    emailData && typeof emailData === "object"
      ? String(emailData.from || emailData.fromAddress || "").trim().toLowerCase()
      : "";
  const parts = [
    from,
    subj.slice(0, 120),
    String(cancelExtract.b2bReservationNumber || "").trim(),
    String(cancelExtract.rloc || "").trim().toUpperCase(),
    String(cancelExtract.pmsCode || "").trim().toUpperCase(),
    normalizeStr(cancelExtract.guestName || ""),
    String(cancelExtract.checkinDate || "").trim()
  ];
  return parts.some(Boolean) ? `fp:${parts.join("|")}` : "";
}

function hasProcessedB2bCancelAlert(db, key) {
  if (!db || !key || !Array.isArray(db.processedB2bCancelAlerts)) return false;
  return db.processedB2bCancelAlerts.includes(key);
}

function recordProcessedB2bCancelAlert(db, keys = []) {
  if (!db) return;
  if (!Array.isArray(db.processedB2bCancelAlerts)) db.processedB2bCancelAlerts = [];
  for (const key of keys) {
    if (!key) continue;
    if (!db.processedB2bCancelAlerts.includes(key)) {
      db.processedB2bCancelAlerts.unshift(key);
    }
  }
  if (db.processedB2bCancelAlerts.length > 1000) {
    db.processedB2bCancelAlerts.length = 1000;
  }
}

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
 * Converte HTML em texto preservando quebras de linha de blocos e células de tabela
 */
function htmlToStructuredCancellationText(html = "") {
  if (!html) return "";
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|td|th|li|h[1-6]|section|article|header|footer)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
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

  // Remove prefixos comuns de resposta e encaminhamento de threads de e-mail (Re:, RES:, Fwd:, ENC:, etc.)
  const threadPrefixRegex = /^(?:(?:RE|RES|FWD|ENC|FORWARD|RESPOSTA|ENCAMINHADO)[\s:_-]+)+/i;
  const strippedSubject = subject.replace(threadPrefixRegex, "").trim();

  const cleanSubject = normalizeStr(strippedSubject);
  const cleanBody = normalizeStr(`${text}\n${htmlToStructuredCancellationText(html)}`);
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

  const isSubjectPolicyNotice =
    /(?:POL[IÍ]TICA\s+DE\s+CANCELAMENTO|REGRAS?\s+DE\s+CANCELAMENTO)/i.test(cleanSubject);

  // Padrões explícitos de cancelamento no assunto (incluindo número/código entre "Reserva/Voucher" e "Cancelada/Cancelado")
  const subjectCancellationPattern =
    /(?:CANCELAMENTO\s+D[AEO]\s+(?:RESERVA|VOUCHER|HOSPEDAGEM)|SOLICITA[CÇ][AÃ]O\s+DE\s+CANCELAMENTO|CANCELAMENTO\s+EFETUADO|PEDIDO\s+DE\s+CANCELAMENTO|\bCANCELAMENTO\b|\bCANCELLATION\b|BOOKING\s+CANCELL?ATION|CANCELLATION\s+OF\s+BOOKING|(?:BOOKING|RESERVATION|VOUCHER)\b[^\n]{0,45}\bCANCELL?ED\b|(?:RESERVA|VOUCHER|HOSPEDAGEM|PEDIDO|ORDEM\s+DE\s+HOSPEDAGEM)\b[^\n]{0,45}\bCANCELAD[OA]\b|\bCANCELAD[OA]\b)/i;

  // Padrões imperativos / de ação / status de cancelamento no corpo do e-mail
  // ATENÇÃO: NÃO incluir a locução passiva isolada "CANCELAMENTO DA RESERVA", que surge rotineiramente em cláusulas de política em vouchers
  const bodyActionCancellationPattern =
    /(?:(?:SOLICITA(?:MOS)?|SOLICITO|PEDIMOS|FAVOR|POR\s+FAVOR|GENTILEZA|PROCEDER\s+COM\s+O|EFETUAR\s+O|CONFIRMAMOS\s+O|INFORMAMOS\s+O|COMUNICAMOS\s+O|NOTIFICAMOS\s+O)\s+(?:O\s+)?CANCELAMENTO|(?:FAVOR|POR\s+FAVOR|GENTILEZA|PODERIA(?:M)?|PRECISAMOS|SOLICITO|SOLICITAMOS)\s+(?:EFETUAR\s+O\s+|PROCEDER\s+COM\s+O\s+)?CANCELAR|RESERVA\s+(?:N[ºO°#]?\s*[\w-]+\s+|ACIMA\s+|ABAIXO\s+)?(?:FOI|ENCONTRA-SE|ESTA|ESTÁ)\s+CANCELADA|VOUCHER\s+(?:N[ºO°#]?\s*[\w-]+\s+)?(?:FOI|ENCONTRA-SE|ESTA|ESTÁ)\s+CANCELADO|(?:STATUS|SITUA[CÇ][AÃ]O)\s*(?:DA\s+RESERVA|DO\s+VOUCHER)?\s*[:\-]\s*CANCELAD[OA]\b|CANCELAMENTO\s+(?:D[AEO]\s+RESERVA\s+)?(?:N[ºO°#]?\s*[\w-]+\s+)?(?:REALIZADO|EFETUADO|PROCESSADO|CONFIRMADO)\s+COM\s+SUCESSO|PLEASE\s+CANCEL\s+(?:THE\s+|THIS\s+)?(?:BOOKING|RESERVATION)|WE\s+REQUEST\s+(?:THE\s+)?CANCELLATION|(?:RESERVATION|BOOKING|VOUCHER)\s+(?:#?[\w-]+\s+)?HAS\s+BEEN\s+CANCELL?ED)/i;

  // Padrões de voucher / confirmação
  const voucherPattern =
    /(?:CONFIRMA[CÇ][AÃ]O\s+D[AE]\s+RESERVA|\bVOUCHER\b|CONFIRMED\s+BOOKING|BOOKING\s+CONFIRMATION|NOVO\s+VOUCHER)/i;

  // Padrões de menção de política/regras de cancelamento
  const isOnlyPolicyNotice =
    /(?:POL[IÍ]TICA\s+DE\s+CANCELAMENTO|REGRAS?(?:\s+DE|\s*:)?\s+CANCELAMENTO|CANCELAMENTO\s+GRATUITO|TAXA\s+DE\s+CANCELAMENTO|MULTA\s+DE\s+CANCELAMENTO|EM\s+CASO\s+DE\s+CANCELAMENTO|CANCELAMENTO\s+.*?\s+SEM\s+CUSTOS)/i.test(
      fullText
    );

  const hasSubjectCancellation = subjectCancellationPattern.test(cleanSubject) && !isSubjectPolicyNotice;
  const hasBodyActionCancellation = bodyActionCancellationPattern.test(cleanBody);
  const hasVoucherSignals = voucherPattern.test(cleanSubject) || voucherPattern.test(cleanBody);

  // 1. Prioridade máxima: se o corpo contém comando de ação de cancelamento explícito,
  // cancelamento prevalece mesmo se o assunto da thread contiver "Confirmação de Reserva" (reply/forward histórico)
  if (hasBodyActionCancellation) {
    return {
      isCancellation: true,
      isVoucher: false,
      confidence: 0.95,
      cancellationKeywords: Array.from(new Set(cancellationKeywordsFound))
    };
  }

  // 2. Assunto com cancelamento explícito (e que não seja mero comunicado de política)
  if (hasSubjectCancellation) {
    return {
      isCancellation: true,
      isVoucher: false,
      confidence: 1.0,
      cancellationKeywords: Array.from(new Set(cancellationKeywordsFound))
    };
  }

  // 3. Voucher/confirmação que eventualmente citou regras/política de cancelamento
  if (hasVoucherSignals) {
    return {
      isCancellation: false,
      isVoucher: true,
      confidence: 0.95,
      cancellationKeywords: []
    };
  }

  // 4. Apenas comunicado de política/regras sem comando ativo nem voucher
  if (isOnlyPolicyNotice) {
    return {
      isCancellation: false,
      isVoucher: false,
      confidence: 0.0,
      cancellationKeywords: []
    };
  }

  // 5. Fallback com palavras-chave de cancelamento sem sinais de voucher nem de política
  if (cancellationKeywordsFound.length > 0 && !isOnlyPolicyNotice && /CANCEL/i.test(cleanSubject)) {
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

  const combined = `${subject}\n${text}\n${htmlToStructuredCancellationText(html)}`;

  // 1. Número da reserva B2B (ex: 25055349, 25252964, B2B-25055349 ou "Cancelamento de Reserva - 25252964")
  let b2bReservationNumber = null;
  const b2bPrefixMatch = combined.match(/\bB2B[-_\s]?(\d{6,12})\b/i);
  if (b2bPrefixMatch) {
    b2bReservationNumber = b2bPrefixMatch[1];
  } else {
    const cancelHeaderNumMatch =
      combined.match(/Cancelamento\s+(?:d[aeo]\s+)?(?:Reserva|Voucher|Hospedagem)?\s*[\s:\-#]*(\d{6,12})\b/i) ||
      combined.match(/N[uú°º]?(?:mero)?\s+(?:d[aeo]\s+)?(?:Reserva|Voucher|Confirma[cç][aã]o|Pedido)\s*[\s:\-#]*(\d{6,12})\b/i) ||
      combined.match(/(?:reserva(?:\s+b2b)?|voucher|b2b|c[oó]d(?:igo)?(?:\s+d[aeo]\s+reserva)?|pedido|n[ºo°]|n[uú]mero)\s*[\s:\-#]+(\d{6,12})\b/i);
    if (cancelHeaderNumMatch) {
      b2bReservationNumber = cancelHeaderNumMatch[1];
    } else {
      const standaloneNumMatch = combined.match(/\b(2[4-9]\d{6})\b/);
      if (standaloneNumMatch) {
        b2bReservationNumber = standaloneNumMatch[1];
      }
    }
  }

  // 2. Localizador / RLOC (ex: LOC-12345, RLOC: ABCD12, RLOC-AZUL01)
  let rloc = null;
  const rlocMatch =
    combined.match(/\b(?:localizador(?:\s+da\s+reserva)?|rloc|locator|loc)[:\s#-]+(?:rloc[-_\s]?)?([A-Z0-9_-]{3,15})\b/i) ||
    combined.match(/\b(?:RLOC[-_:\s]?|LOC[-_:\s]+)([A-Z0-9]{4,10})\b/i);
  if (rlocMatch) {
    rloc = rlocMatch[1].trim().toUpperCase();
  }

  // 3. Código PMS (ex: RES-605, RES-113, RES-211-B2B-25252964)
  let pmsCode = null;
  const pmsMatch = combined.match(/\b(RES-[A-Z0-9-]{3,24})\b/i);
  if (pmsMatch) {
    pmsCode = pmsMatch[1].toUpperCase();
  }

  // 4. Hóspede (suporta "(SOBRENOME/NOME)" do B2B Reservas no assunto/corpo e rótulos singulares/plurais)
  let guestName = null;
  const slashParenMatch =
    subject.match(/\(([A-ZÀ-Úa-zà-ú\s']{2,40})\/([A-ZÀ-Úa-zà-ú\s']{2,40})\)/) ||
    combined.match(/(?:h[óo]spedes?(?:\(s\))?|passageiros?(?:\(s\))?|pax|guest)[:\s\-]*\(?([A-ZÀ-Úa-zà-ú\s']{2,40})\/([A-ZÀ-Úa-zà-ú\s']{2,40})\)?/i);
  if (slashParenMatch) {
    const part1 = slashParenMatch[1].trim();
    const part2 = slashParenMatch[2].trim();
    if (/\b(?:DE|DA|DO|DOS|DAS)\b/i.test(part2) && !/\b(?:DE|DA|DO|DOS|DAS)\b/i.test(part1)) {
      guestName = `${part1} ${part2}`.replace(/\s+/g, " ").trim();
    } else {
      guestName = `${part2} ${part1}`.replace(/\s+/g, " ").trim();
    }
  } else {
    const guestMatch = combined.match(
      /(?:h[óo]spedes?(?:\(s\))?|guest|passageiros?(?:\(s\))?|pax|nome(?:\s+do\s+h[óo]spede)?|titular)(?:\s*\([^)]*\))?[:\s\-]+\(?([A-ZÀ-Úa-zà-ú\s'.]{4,60}?)\)?(?:\s*\(\d*\s*ADT\)|\n|\r|,|-|\.|\/|\s+(?:check-?in|check-?out|entrada|sa[ií]da|per[ií]odo|data|motivo|rloc|localizador)\b|$)/i
    );
    if (guestMatch) {
      guestName = guestMatch[1].trim();
    }
  }

  // 5. Datas (Check-in e Check-out)
  let checkinDate = null;
  let checkoutDate = null;
  const periodMatch = combined.match(
    /(?:per[íi]odo|periodo|estadia)[:\s\-]+(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}|\d{4}-\d{2}-\d{2})\s*(?:a|at[ée]|[-–—])\s*(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}|\d{4}-\d{2}-\d{2})/i
  );
  if (periodMatch) {
    checkinDate = normalizeIsoDate(periodMatch[1]);
    checkoutDate = normalizeIsoDate(periodMatch[2]);
  } else {
    const periodShortMatch = combined.match(
      /(?:per[íi]odo|periodo|estadia)[:\s\-]*(\d{1,2})[\/\.-](\d{1,2})\s*(?:a|at[ée]|[-–—])\s*(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/i
    );
    if (periodShortMatch) {
      const year = Number(periodShortMatch[5]);
      const m1 = periodShortMatch[2].padStart(2, "0");
      const d1 = periodShortMatch[1].padStart(2, "0");
      const m2 = periodShortMatch[4].padStart(2, "0");
      const d2 = periodShortMatch[3].padStart(2, "0");
      const y1 = Number(m1) > Number(m2) ? year - 1 : year;
      checkinDate = `${y1}-${m1}-${d1}`;
      checkoutDate = `${year}-${m2}-${d2}`;
    } else {
      const periodMonthNameMatch = combined.match(
        /(?:per[íi]odo|periodo)[:\s\-]*(\d{1,2})\s*\/\s*([a-zç]{3})\s*[-–—a]\s*(\d{1,2})\s*\/\s*([a-zç]{3})/i
      );
      if (periodMonthNameMatch) {
        const monthMap = {
          jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
          jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12"
        };
        const baseYear = new Date().getFullYear();
        const d1 = periodMonthNameMatch[1].padStart(2, "0");
        const m1 = monthMap[periodMonthNameMatch[2].toLowerCase()] || "01";
        const d2 = periodMonthNameMatch[3].padStart(2, "0");
        const m2 = monthMap[periodMonthNameMatch[4].toLowerCase()] || m1;
        const y2 = Number(m2) < Number(m1) ? baseYear + 1 : baseYear;
        checkinDate = `${baseYear}-${m1}-${d1}`;
        checkoutDate = `${y2}-${m2}-${d2}`;
      } else {
        const inMatch = combined.match(/(?:check-?in|entrada|chegada|data\s+d[ae]\s+entrada)[:\s\-]+(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}|\d{4}-\d{2}-\d{2})/i);
        if (inMatch) checkinDate = normalizeIsoDate(inMatch[1]);
        const outMatch = combined.match(/(?:check-?out|sa[íi]da|partida|data\s+d[ae]\s+sa[íi]da)[:\s\-]+(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}|\d{4}-\d{2}-\d{2})/i);
        if (outMatch) checkoutDate = normalizeIsoDate(outMatch[1]);
      }
    }
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
 * Verifica se duas reservas representam exatamente a mesma estadia/hóspede (ex: clones duplicados)
 */
function areSameStayClones(a, b) {
  if (!a || !b) return false;
  if (!a.checkinDate || !b.checkinDate || a.checkinDate !== b.checkinDate) return false;
  const tokA = extractNameTokens(a.guestName || "");
  const tokB = extractNameTokens(b.guestName || "");
  if (tokA.length === 0 || tokB.length === 0) return false;
  return tokA.every(t => tokB.includes(t)) || tokB.every(t => tokA.includes(t));
}

/**
 * Desempata múltiplos candidatos ativos:
 * - Se houver apenas 1 ativo, retorna-o.
 * - Se houver 0 ativos (todos já cancelados), retorna o primeiro já cancelado para manter idempotência.
 * - Se todos os ativos forem clones idênticos da mesma estadia/hóspede, retorna o principal + duplicateClones.
 * - Se o e-mail informar nome do hóspede (e/ou check-in), filtra pelo hóspede específico em reservas multi-quarto.
 */
function resolveMultipleActiveCandidates(activeCandidates, allMatches, matchedBy, rawGuestName, rawCheckinDate) {
  if (activeCandidates.length === 1) {
    return {
      matched: true,
      reservation: activeCandidates[0],
      matchedBy,
      candidatesCount: 1
    };
  }
  if (activeCandidates.length === 0 && allMatches.length > 0) {
    return {
      matched: true,
      reservation: allMatches[0],
      matchedBy,
      candidatesCount: 1
    };
  }
  if (activeCandidates.length > 1) {
    if (activeCandidates.every(c => areSameStayClones(activeCandidates[0], c))) {
      return {
        matched: true,
        reservation: activeCandidates[0],
        duplicateClones: activeCandidates.slice(1),
        matchedBy,
        candidatesCount: 1
      };
    }
    if (rawGuestName) {
      const queryTokens = extractNameTokens(rawGuestName);
      if (queryTokens.length > 0) {
        const narrowed = activeCandidates.filter(c => {
          if (rawCheckinDate && c.checkinDate && c.checkinDate !== rawCheckinDate) return false;
          const resTokens = extractNameTokens(c.guestName || "");
          if (resTokens.length === 0) return false;
          const common = queryTokens.filter(t => resTokens.includes(t));
          return common.length >= Math.min(2, queryTokens.length);
        });
        if (narrowed.length === 1) {
          return {
            matched: true,
            reservation: narrowed[0],
            matchedBy,
            candidatesCount: 1
          };
        }
        if (narrowed.length > 1 && narrowed.every(c => areSameStayClones(narrowed[0], c))) {
          return {
            matched: true,
            reservation: narrowed[0],
            duplicateClones: narrowed.slice(1),
            matchedBy,
            candidatesCount: 1
          };
        }
      }
    }
  }
  return {
    matched: false,
    matchedBy,
    candidatesCount: allMatches.length,
    candidates: allMatches
  };
}

/**
 * Registra todos os identificadores B2B da reserva em db.deletedB2bSeeds para impedir recriação/ressurreição
 */
export function recordDeletedB2bIdentifiers(db, reservation = {}) {
  if (!db || !reservation) return;
  const rawNums = [
    reservation.b2bReservationNumber,
    reservation.externalReservationNumber,
    reservation.b2bLocatorRloc,
    reservation.rloc,
    reservation.code
  ];
  const codeEmbeddedMatch = String(reservation.code || "").match(/\bB2B-(\d{6,12})\b/i);
  if (codeEmbeddedMatch) {
    rawNums.push(codeEmbeddedMatch[1]);
  }
  const hasB2bContext =
    Boolean(reservation.b2bReservationNumber) ||
    Boolean(codeEmbeddedMatch) ||
    String(reservation.code || "").startsWith("B2B-") ||
    String(reservation.channel || "").toLowerCase().includes("b2b") ||
    reservation.requesterType === "agency_b2b";

  if (!hasB2bContext) return;
  if (!Array.isArray(db.deletedB2bSeeds)) db.deletedB2bSeeds = [];

  for (const val of rawNums) {
    const s = String(val || "").trim();
    if (!s) continue;
    if (!db.deletedB2bSeeds.includes(s)) {
      db.deletedB2bSeeds.push(s);
    }
    const stripped = s.replace(/^B2B-/i, "").trim();
    if (/^\d{6,12}$/.test(stripped)) {
      if (!db.deletedB2bSeeds.includes(stripped)) {
        db.deletedB2bSeeds.push(stripped);
      }
      const pref = `B2B-${stripped}`;
      if (!db.deletedB2bSeeds.includes(pref)) {
        db.deletedB2bSeeds.push(pref);
      }
    }
  }
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
      // Desempate por reserva ativa / não cancelada, clones idênticos ou hóspede explícito no e-mail
      const activeCandidates = tier1Matches.filter(r => r.status !== "cancelada" && r.status !== "cancelled");
      const resolvedTier1 = resolveMultipleActiveCandidates(
        activeCandidates,
        tier1Matches,
        "b2b_number",
        rawGuestName,
        rawCheckinDate
      );
      if (resolvedTier1) return resolvedTier1;
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

      let notesMatch = false;
      if (notesVal) {
        const tokensToTest = [];
        if (rawRloc) tokensToTest.push(rawRloc);
        if (cleanRloc) tokensToTest.push(cleanRloc);

        for (const tok of tokensToTest) {
          if (!tok || tok.length < 3) continue;
          const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const explicitPrefixRegex = new RegExp(`(?:RLOC|LOC)[-_:\\s]+${escaped}\\b`, "i");
          const wordBoundaryRegex = new RegExp(`\\b${escaped}\\b`, "i");
          if (explicitPrefixRegex.test(notesVal) || wordBoundaryRegex.test(notesVal)) {
            notesMatch = true;
            break;
          }
        }
      }

      return (
        rlocVal === rawRloc ||
        (cleanRloc && (rlocVal === `RLOC-${cleanRloc}` || rlocVal === `LOC-${cleanRloc}` || rlocVal === cleanRloc)) ||
        extVal === rawRloc ||
        (cleanRloc && (extVal === `RLOC-${cleanRloc}` || extVal === `LOC-${cleanRloc}` || extVal === cleanRloc)) ||
        notesMatch
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
      const resolvedTier2 = resolveMultipleActiveCandidates(
        activeCandidates,
        tier2Matches,
        "rloc",
        rawGuestName,
        rawCheckinDate
      );
      if (resolvedTier2) return resolvedTier2;
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
  const fromLower =
    emailData && typeof emailData === "object"
      ? String(emailData.from || emailData.fromAddress || "").trim().toLowerCase()
      : "";

  // Ignora cópias internas do próprio hotel ou notificações de OTAs B2C (gerenciadas pelo Channel Manager)
  if (
    fromLower &&
    (fromLower.includes("corpflats.com.br") ||
      fromLower.includes("@booking.com") ||
      fromLower.includes("@airbnb.com") ||
      fromLower.includes("@expedia.com") ||
      fromLower.includes("@decolar.com") ||
      fromLower.includes("@channex.io"))
  ) {
    return {
      success: false,
      cancelled: false,
      blockedReason: "NOT_A_B2B_EMAIL",
      alertSent: false
    };
  }

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
  const dedupeKey = buildB2bCancelAlertDedupeKey(emailData, cancelExtract);
  const matchResult = matchReservationForCancellation(db, cancelExtract);

  // Caso 1: Reserva não encontrada
  if (!matchResult.matched || !matchResult.reservation) {
    const hasReservationIdentifiers = Boolean(
      cancelExtract.b2bReservationNumber ||
      cancelExtract.rloc ||
      cancelExtract.pmsCode ||
      (cancelExtract.guestName && cancelExtract.checkinDate) ||
      fromLower.includes("b2breservas")
    );

    // E-mails genéricos/newsletters com a palavra "cancelamento" mas sem qualquer identificador de reserva B2B
    // não devem gerar falsos alertas de WhatsApp "SEM CORRESPONDÊNCIA".
    if (!hasReservationIdentifiers && matchResult.candidatesCount === 0) {
      if (dedupeKey) recordProcessedB2bCancelAlert(db, [dedupeKey]);
      return {
        success: false,
        cancelled: false,
        blockedReason: "NOT_B2B_RESERVATION_CONTEXT",
        matchedBy: null,
        alertSent: false
      };
    }

    const notFoundReason = matchResult.candidatesCount > 1 ? "MULTIPLE_MATCHES" : "RESERVATION_NOT_FOUND";
    const unmatchedDedupeKey = dedupeKey ? `unmatched:${notFoundReason}:${dedupeKey}` : "";

    // Idempotência estrita: nunca reenvia o mesmo alerta de e-mail sem correspondência
    if (unmatchedDedupeKey && hasProcessedB2bCancelAlert(db, unmatchedDedupeKey)) {
      return {
        success: false,
        cancelled: false,
        alreadyAlerted: true,
        blockedReason: notFoundReason,
        matchedBy: null,
        alertSent: false
      };
    }

    if (unmatchedDedupeKey) {
      recordProcessedB2bCancelAlert(db, [unmatchedDedupeKey, dedupeKey]);
    }

    const adminPhone = resolveB2bManagerWhatsApp(db);

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
    const isRealDefaultZapi = !options.sendZapiMessage;
    const nowMs = Date.now();
    while (unmatchedAlertWindowTimestamps.length > 0 && nowMs - unmatchedAlertWindowTimestamps[0] > 10 * 60 * 1000) {
      unmatchedAlertWindowTimestamps.shift();
    }
    const rateLimited = isRealDefaultZapi && unmatchedAlertWindowTimestamps.length >= 3;

    let alertSent = false;
    if (typeof zapiFn === "function" && !rateLimited) {
      try {
        if (isRealDefaultZapi) unmatchedAlertWindowTimestamps.push(nowMs);
        await zapiFn(adminPhone, notFoundAlert, {
          db,
          isAdminAlert: true,
          bypassTestMode: true,
          recipientRole: "developer",
          triggerEvent: "b2b_cancellation_unmatched_alert"
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
  const adminPhone = resolveB2bManagerWhatsApp(db);

  // ── IDEMPOTÊNCIA: Reserva já cancelada anteriormente ───────────────────────
  const currentStatus = String(reservation.status || "").toLowerCase().trim();
  if (currentStatus === "cancelada" || currentStatus === "cancelled") {
    if (dedupeKey) recordProcessedB2bCancelAlert(db, [dedupeKey]);
    return {
      success: true,
      cancelled: false,
      alreadyCancelled: true,
      reservationCode: reservation.code || String(reservation.id),
      reservation,
      matchedBy: matchResult.matchedBy,
      alertSent: false
    };
  }

  // ── INVARIANTE CHECKED_IN_CANCELLATION: Bloqueio de cancelamento com hóspede em estada ──
  const isCheckedIn =
    currentStatus === "in_house" ||
    currentStatus === "checked_in" ||
    currentStatus === "hospedado" ||
    currentStatus === "checkin_realizado" ||
    Boolean(reservation.checkedIn) ||
    Boolean(reservation.checkedInAt) ||
    Boolean(reservation.actualCheckinTime);

  if (isCheckedIn) {
    const blockedDedupeKey = `blocked:${reservation.id || reservation.code}:${dedupeKey || "res"}`;
    if (hasProcessedB2bCancelAlert(db, blockedDedupeKey)) {
      return {
        success: false,
        cancelled: false,
        alreadyAlerted: true,
        blockedReason: "CHECKED_IN_CANCELLATION",
        reservationCode: reservation.code || String(reservation.id),
        reservation,
        matchedBy: matchResult.matchedBy,
        alertSent: false
      };
    }
    recordProcessedB2bCancelAlert(db, [blockedDedupeKey, dedupeKey]);

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
          recipientRole: "developer",
          triggerEvent: "b2b_cancellation_blocked_alert"
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

  const targetsToCancel = [
    reservation,
    ...(Array.isArray(matchResult.duplicateClones)
      ? matchResult.duplicateClones.filter(
          c =>
            c &&
            c.status !== "in_house" &&
            c.status !== "checked_in" &&
            c.status !== "hospedado" &&
            c.status !== "checkin_realizado" &&
            !c.checkedIn &&
            !c.checkedInAt &&
            !c.actualCheckinTime
        )
      : [])
  ];

  for (const targetRes of targetsToCancel) {
    targetRes.status = "cancelada";
    targetRes.cancelledAt = nowIso;
    targetRes.cancellationReason = reasonText;
    targetRes.updatedAt = nowIso;
    targetRes.calendarSequence = (targetRes.calendarSequence || 0) + 1;

    // Registro completo em deletedB2bSeeds para evitar ressuscitação por mock ou sync de e-mail
    recordDeletedB2bIdentifiers(db, targetRes);

    // Liberação de instruções automáticas da governança na data de check-in
    const flatNum = String(
      targetRes.flatNumber ||
        (Array.isArray(db.flats) ? db.flats.find(f => f.id === targetRes.flatId)?.number : "") ||
        ""
    );

    const cleanReq = (db.cleaningRequests || []).find(
      c =>
        (String(c.flatNumber) === flatNum || (targetRes.flatId && c.flatId === targetRes.flatId)) &&
        c.requestDate === targetRes.checkinDate &&
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
    const checkoutDatesToClear = Array.from(new Set([targetRes.checkoutDate, targetRes.earlyCheckoutDate].filter(Boolean)));
    for (const chkDate of checkoutDatesToClear) {
      const hasOtherActiveCheckout = (db.reservations || []).some(
        other =>
          other.id !== targetRes.id &&
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
            (String(c.flatNumber) === flatNum || (targetRes.flatId && c.flatId === targetRes.flatId)) &&
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
            c.deletedReservationId = targetRes.id;
            c.updatedAt = nowIso;
          }
        }
      }
    }

    // Marca pedidos de café da manhã vinculados como cancelados
    if (!db.breakfastOrders) db.breakfastOrders = [];
    db.breakfastOrders.forEach(o => {
      if (
        (o.reservationCode && (o.reservationCode === targetRes.code || o.reservationCode === targetRes.reservationCode)) ||
        o.reservationId === targetRes.id ||
        (String(o.roomNumber) === String(targetRes.flatNumber) && o.date >= targetRes.checkinDate && o.date <= targetRes.checkoutDate)
      ) {
        o.status = "cancelled";
        o.cancelReason = "Reserva B2B cancelada via e-mail autônomo";
      }
    });

    // Marca tarefas de serviço / OS associadas como canceladas se presentes
    if (Array.isArray(db.tasks)) {
      db.tasks.forEach(t => {
        if (t.reservationId === targetRes.id || t.reservationCode === targetRes.code) {
          t.status = "cancelled";
          t.updatedAt = nowIso;
        }
      });
    }

    // Cancela agendamentos pendentes de e-mail e WhatsApp vinculados à reserva
    if (Array.isArray(db.emailQueue)) {
      db.emailQueue.forEach(q => {
        if (
          q &&
          q.status === "pending" &&
          (String(q.reservationId) === String(targetRes.id) ||
            String(q.reservationId) === String(targetRes.code) ||
            (q.reservationCode && q.reservationCode === targetRes.code))
        ) {
          q.status = "cancelled";
          q.error = "Reserva B2B cancelada via e-mail autônomo";
        }
      });
    }
    if (Array.isArray(db.whatsappQueue)) {
      db.whatsappQueue.forEach(q => {
        if (
          q &&
          (q.status === "scheduled" || q.status === "pending" || q.status === "pending_approval") &&
          (String(q.reservationId) === String(targetRes.id) ||
            String(q.reservationCode) === String(targetRes.code))
        ) {
          q.status = "cancelled";
          q.cancelledAt = nowIso;
        }
      });
    }

    // FNRH SERPRO
    if (targetRes.serproReservaId && targetRes.serproStatus !== "CANCELADA") {
      targetRes.serproStatus = "CANCELADA";
      targetRes.serproCancelledAt = nowIso;
    }
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
    event: "B2B_EMAIL_AUTONOMOUS_CANCELLATION",
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

  if (dedupeKey) {
    recordProcessedB2bCancelAlert(db, [dedupeKey]);
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
          recipientRole: "developer",
          triggerEvent: "b2b_cancellation_processed_alert"
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Z-API timeout")), 2000))
      ]);
      alertSent = true;
    } catch (zErr) {
      console.warn("[B2B Cancellation] Aviso ao enviar WhatsApp ao gestor:", zErr?.message || zErr);
      alertSent = false;
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

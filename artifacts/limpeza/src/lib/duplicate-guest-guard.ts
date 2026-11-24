export type DuplicateGuestMatchedField = "document" | "name" | "phone"

export interface GuestSlotCandidate {
  flatIndex?: number
  flatLabel?: string
  guestIndex: number
  name?: string | null
  document?: string | null
  phone?: string | null
  isMinor?: boolean
  informLater?: boolean
  checkinDate?: string | null
  checkoutDate?: string | null
}

export interface DuplicateGuestConflict {
  matchedField: DuplicateGuestMatchedField
  sameFlat: boolean
  otherSlot: GuestSlotCandidate
  title: string
  message: string
}

export interface SlotDuplicateInspection {
  hasConflict: boolean
  firstConflict: DuplicateGuestConflict | null
  byField: Partial<Record<DuplicateGuestMatchedField, DuplicateGuestConflict>>
}

const PLACEHOLDER_GUEST_NAME_RE =
  /^(h[oó]spede(\s+\d+)?|acompanhante(\s+\d+)?|visitante(\s+\d+)?|a\s*definir.*|sem\s+nome|pendente|bloqueio|manuten[cç][aã]o|teste|quarto|flat(\s+\d+)?)$/i

const NAME_CONNECTORS = new Set(["de", "da", "do", "dos", "das", "e"])

export function normalizeGuestFullNameForDuplicateCheck(raw?: string | null): string {
  const trimmed = String(raw || "").trim()
  if (!trimmed || PLACEHOLDER_GUEST_NAME_RE.test(trimmed)) return ""

  const ascii = trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")

  const tokens = ascii
    .split(/\s+/)
    .filter((t) => t.length > 0 && !NAME_CONNECTORS.has(t))

  if (tokens.length < 2) return ""
  const joined = tokens.join(" ")
  return joined.length >= 5 ? joined : ""
}

export function normalizeGuestDocumentForDuplicateCheck(raw?: string | null): string {
  const trimmed = String(raw || "").trim()
  if (!trimmed) return ""

  if (/[a-zA-Z]/.test(trimmed)) {
    const alnum = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "")
    return alnum.length >= 5 ? `PASS:${alnum}` : ""
  }

  const digits = trimmed.replace(/\D/g, "")
  if (digits.length !== 11) return ""
  if (/^(\d)\1{10}$/.test(digits)) return ""
  return `CPF:${digits}`
}

export function guestPhonesMatchForDuplicateCheck(
  phoneA?: string | null,
  phoneB?: string | null
): boolean {
  const parsePhone = (raw?: string | null) => {
    const str = String(raw || "").trim()
    if (!str) return null
    let digits = str.replace(/\D/g, "")
    while (digits.startsWith("0")) digits = digits.slice(1)
    const isExplicitIntl = str.startsWith("+") && !digits.startsWith("55")
    const minLen = isExplicitIntl ? 8 : 10
    if (digits.length < minLen) return null
    let ddd: string | null = null
    if (!isExplicitIntl) {
      if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
        ddd = digits.slice(2, 4)
      } else if (digits.length === 10 || digits.length === 11) {
        ddd = digits.slice(0, 2)
      }
    }
    return { digits, ddd, isExplicitIntl }
  }

  const a = parsePhone(phoneA)
  const b = parsePhone(phoneB)
  if (!a || !b) return false
  if (a.digits === b.digits) return true
  if (a.isExplicitIntl || b.isExplicitIntl) return false
  if (a.digits.slice(-8) !== b.digits.slice(-8)) return false
  if (a.ddd && b.ddd && a.ddd !== b.ddd) return false
  return true
}

export function doStayDatesOverlap(
  inA?: string | null,
  outA?: string | null,
  inB?: string | null,
  outB?: string | null
): boolean {
  const a1 = String(inA || "").trim().slice(0, 10)
  const a2 = String(outA || "").trim().slice(0, 10)
  const b1 = String(inB || "").trim().slice(0, 10)
  const b2 = String(outB || "").trim().slice(0, 10)
  if (!a1 || !a2 || !b1 || !b2) return true
  if (a2 <= a1 || b2 <= b1) return true
  return a1 < b2 && a2 > b1
}

function buildDuplicateConflictMessage(
  matchedField: DuplicateGuestMatchedField,
  sameFlat: boolean,
  current: GuestSlotCandidate,
  other: GuestSlotCandidate
): { title: string; message: string } {
  if (sameFlat) {
    if (other.guestIndex === 1) {
      if (matchedField === "document") {
        return {
          title: "CPF/Passaporte repetido do Hóspede Principal",
          message:
            "Este hóspede já foi informado como Hóspede Principal (mesmo CPF/Passaporte). Informe o documento individual do acompanhante.",
        }
      }
      if (matchedField === "phone") {
        return {
          title: "WhatsApp repetido do Hóspede Principal",
          message:
            "Este WhatsApp já foi informado para o Hóspede Principal (Hóspede 1). Informe o número individual do acompanhante.",
        }
      }
      return {
        title: "Hóspede já informado como Hóspede Principal",
        message:
          "Este hóspede já foi informado como Hóspede Principal (Hóspede 1). Informe os dados do acompanhante.",
      }
    }

    if (current.guestIndex === 1) {
      const compLabel = `Acompanhante (Hóspede ${other.guestIndex})`
      if (matchedField === "document") {
        return {
          title: `Documento já informado no ${compLabel}`,
          message: `Este CPF/Passaporte já está cadastrado para o ${compLabel} nesta reserva.`,
        }
      }
      if (matchedField === "phone") {
        return {
          title: `WhatsApp já informado no ${compLabel}`,
          message: `Este WhatsApp já está cadastrado para o ${compLabel} nesta reserva.`,
        }
      }
      return {
        title: `Hóspede já informado como ${compLabel}`,
        message: `Este hóspede já está cadastrado como ${compLabel} nesta reserva. Cada participante deve ter seu próprio registro.`,
      }
    }

    const otherCompLabel = `Hóspede ${other.guestIndex}`
    if (matchedField === "document") {
      return {
        title: `Documento repetido do ${otherCompLabel}`,
        message: `Este CPF/Passaporte já foi informado para o ${otherCompLabel}. Informe o documento individual do ${current.guestIndex}º hóspede.`,
      }
    }
    if (matchedField === "phone") {
      return {
        title: `WhatsApp repetido do ${otherCompLabel}`,
        message: `Este WhatsApp já foi informado para o ${otherCompLabel}. Informe o WhatsApp individual do ${current.guestIndex}º hóspede.`,
      }
    }
    return {
      title: `Hóspede já informado como ${otherCompLabel}`,
      message: `Este hóspede já foi informado como ${otherCompLabel}. Informe os dados do ${current.guestIndex}º hóspede.`,
    }
  }

  const otherFlatLabel = other.flatLabel || `Flat #${(other.flatIndex ?? 0) + 1}`
  const otherRoleLabel = other.guestIndex === 1 ? "Hóspede Principal" : `Hóspede ${other.guestIndex}`

  if (matchedField === "document") {
    return {
      title: `Hóspede já informado no ${otherFlatLabel}`,
      message: `Este CPF/Passaporte já foi informado no ${otherFlatLabel} (${otherRoleLabel}) para este mesmo período. Informe o hóspede que ficará neste apartamento.`,
    }
  }
  if (matchedField === "phone") {
    return {
      title: `WhatsApp já usado no ${otherFlatLabel}`,
      message: `Este WhatsApp já foi informado no ${otherFlatLabel} (${otherRoleLabel}) para este mesmo período. Cada hóspede deve ter seu próprio WhatsApp individual.`,
    }
  }
  return {
    title: `Hóspede já informado no ${otherFlatLabel}`,
    message: `Este hóspede já foi informado no ${otherFlatLabel} (${otherRoleLabel}) para este mesmo período. Informe o hóspede que ficará neste apartamento.`,
  }
}

export function inspectSlotDuplicates(
  current: GuestSlotCandidate,
  otherSlots: GuestSlotCandidate[]
): SlotDuplicateInspection {
  if (current.informLater) {
    return { hasConflict: false, firstConflict: null, byField: {} }
  }

  const curDoc = normalizeGuestDocumentForDuplicateCheck(current.document)
  const curName = normalizeGuestFullNameForDuplicateCheck(current.name)
  const curHasPhone = Boolean(current.phone && String(current.phone).replace(/\D/g, "").length >= 8)

  const byField: Partial<Record<DuplicateGuestMatchedField, DuplicateGuestConflict>> = {}
  let firstConflict: DuplicateGuestConflict | null = null

  for (const other of otherSlots) {
    if (!other || other.informLater) continue
    const sameFlat = (current.flatIndex ?? 0) === (other.flatIndex ?? 0)
    if (sameFlat && current.guestIndex === other.guestIndex) continue
    if (
      !sameFlat &&
      !doStayDatesOverlap(
        current.checkinDate,
        current.checkoutDate,
        other.checkinDate,
        other.checkoutDate
      )
    ) {
      continue
    }

    if (!byField.name && curName) {
      const otherName = normalizeGuestFullNameForDuplicateCheck(other.name)
      if (otherName && curName === otherName) {
        const { title, message } = buildDuplicateConflictMessage("name", sameFlat, current, other)
        const conflict: DuplicateGuestConflict = {
          matchedField: "name",
          sameFlat,
          otherSlot: other,
          title,
          message,
        }
        byField.name = conflict
        if (!firstConflict) firstConflict = conflict
      }
    }

    if (!byField.document && curDoc) {
      const otherDoc = normalizeGuestDocumentForDuplicateCheck(other.document)
      if (otherDoc && curDoc === otherDoc) {
        const { title, message } = buildDuplicateConflictMessage("document", sameFlat, current, other)
        const conflict: DuplicateGuestConflict = {
          matchedField: "document",
          sameFlat,
          otherSlot: other,
          title,
          message,
        }
        byField.document = conflict
        if (!firstConflict) firstConflict = conflict
      }
    }

    if (!byField.phone && curHasPhone && !current.isMinor && !other.isMinor) {
      if (guestPhonesMatchForDuplicateCheck(current.phone, other.phone)) {
        const { title, message } = buildDuplicateConflictMessage("phone", sameFlat, current, other)
        const conflict: DuplicateGuestConflict = {
          matchedField: "phone",
          sameFlat,
          otherSlot: other,
          title,
          message,
        }
        byField.phone = conflict
        if (!firstConflict) firstConflict = conflict
      }
    }
  }

  return {
    hasConflict: Boolean(firstConflict),
    firstConflict,
    byField,
  }
}

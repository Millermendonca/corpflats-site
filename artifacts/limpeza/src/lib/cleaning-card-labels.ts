export interface EffectiveCheckoutDateParams {
  originalRequestDate?: string | null
  checkoutDate?: string | null
  requestDate?: string | null
  reservationCheckoutDate?: string | null
  viewDate: string
}

export interface LeavingGuestLabelParams {
  checkoutDateRef: string
  todayStr: string
  yesterdayStr: string
  tomorrowStr: string
  currentStatus?: string | null
}

function extractIsoDateOnly(value?: string | null): string | null {
  if (!value) return null
  const candidate = String(value).trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null
}

/**
 * Formats an ISO date string (YYYY-MM-DD or full ISO timestamp) as DD/MM
 * without local timezone shifting.
 */
export function formatShortBrDate(isoDate?: string | null): string {
  if (!isoDate) return ""
  const trimmed = String(isoDate).trim()
  if (!trimmed) return ""
  const head = trimmed.slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head)
  if (match) {
    return `${match[3]}/${match[2]}`
  }
  return trimmed
}

/**
 * Resolves the real checkout date associated with a cleaning card,
 * prioritizing carry-over metadata (`originalRequestDate`) over the viewed date.
 */
export function resolveEffectiveCheckoutDate(params: EffectiveCheckoutDateParams): string {
  const candidates = [
    params.originalRequestDate,
    params.checkoutDate,
    params.requestDate,
    params.reservationCheckoutDate,
    params.viewDate,
  ]
  for (const item of candidates) {
    const valid = extractIsoDateOnly(item)
    if (valid) return valid
  }
  return String(params.viewDate || "").trim().slice(0, 10)
}

/**
 * Computes the guest checkout prefix label based on the card's actual checkout date
 * relative to today's date (`todayStr`, `yesterdayStr`, `tomorrowStr`).
 */
export function resolveLeavingGuestLabel(params: LeavingGuestLabelParams): string {
  const { checkoutDateRef, todayStr, yesterdayStr, tomorrowStr, currentStatus } = params
  const isClean = currentStatus === "clean"
  if (!checkoutDateRef) {
    return isClean ? "Saiu:" : "Check-out hoje:"
  }

  const dateBr = formatShortBrDate(checkoutDateRef)

  if (checkoutDateRef === yesterdayStr) {
    return isClean ? `Saiu ontem (${dateBr}):` : `Check-out ontem (${dateBr}):`
  }
  if (checkoutDateRef < yesterdayStr) {
    return isClean ? `Saiu em ${dateBr}:` : `Check-out em ${dateBr}:`
  }
  if (checkoutDateRef === todayStr) {
    return isClean ? "Saiu:" : "Check-out hoje:"
  }
  if (checkoutDateRef === tomorrowStr) {
    return "Check-out amanhã:"
  }
  return dateBr ? `Saída Prevista (${dateBr}):` : "Saída Prevista:"
}

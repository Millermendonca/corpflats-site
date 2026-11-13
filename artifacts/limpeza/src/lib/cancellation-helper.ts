// ══════════════════════════════════════════════════════════════════════════════
// Guest Flow Manager - Official 24h Cancellation & Refund Policy
// ══════════════════════════════════════════════════════════════════════════════

export interface CancellationPolicyResult {
  policyType: "flexivel" | "rigorosa"
  title: string
  badgeText: string
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  isEligibleForRefund: boolean
  refundPercentage: number // 100 ou 0
  refundAmount: number
  freeCancellationDeadline: string // Ex: "09/10/2026 às 14:00"
  deadlineDateIso: string
  explanation: string
  shortSummary: string
}

function formatBrasiliaDateTime(date: Date): string {
  const dayStr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)
  const timeStr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
  return `${dayStr} às ${timeStr}`
}

/**
 * Calcula a política oficial de cancelamento da CorpFlats (ancorada em America/Sao_Paulo, UTC-3):
 * - Cancelamento gratuito com 100% de reembolso até 24 horas antes das 14:00 do dia do check-in.
 * - Faltando menos de 24 horas para o check-in (14:00) ou No-Show: cobrança/retenção de 100% (sem reembolso).
 */
export function calculateCancellationPolicy(
  _bookingDateOrCreatedAt: string | Date,
  checkinDateStr: string,
  totalAmount: number = 0,
  checkinTimeStr: string = "14:00",
  nowDate: Date = new Date(),
  freeCancellationHours: number = 24,
  noShowPenaltyPercent: number = 100
): CancellationPolicyResult {
  const cleanDate = typeof checkinDateStr === "string" && /^\d{4}-\d{2}-\d{2}/.test(checkinDateStr.trim())
    ? checkinDateStr.trim().slice(0, 10)
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(nowDate)

  const [rawH, rawM] = String(checkinTimeStr || "14:00").split(":").map((n) => parseInt(n, 10))
  const hh = String(Number.isFinite(rawH) ? rawH : 14).padStart(2, "0")
  const mm = String(Number.isFinite(rawM) ? rawM : 0).padStart(2, "0")

  // Check-in oficial ancorado no fuso de Brasília (-03:00), independente do fuso do navegador
  const officialCheckinDateTime = new Date(`${cleanDate}T${hh}:${mm}:00-03:00`)
  const freeHours = Number.isFinite(Number(freeCancellationHours)) ? Math.max(0, Number(freeCancellationHours)) : 24
  const penaltyPct = Number.isFinite(Number(noShowPenaltyPercent))
    ? Math.min(100, Math.max(0, Number(noShowPenaltyPercent)))
    : 100

  const deadlineDateTime = new Date(officialCheckinDateTime.getTime() - freeHours * 3600 * 1000)
  const formattedDeadline = formatBrasiliaDateTime(deadlineDateTime)
  const deadlineIso = deadlineDateTime.toISOString()

  const isBeforeDeadline = nowDate.getTime() <= deadlineDateTime.getTime()

  if (isBeforeDeadline) {
    return {
      policyType: "flexivel",
      title: `Cancelamento Gratuito até ${freeHours}h antes`,
      badgeText: "✓ Cancelamento Gratuito (100% de Reembolso)",
      badgeVariant: "default",
      isEligibleForRefund: true,
      refundPercentage: 100,
      refundAmount: totalAmount,
      freeCancellationDeadline: formattedDeadline,
      deadlineDateIso: deadlineIso,
      explanation: `Cancelamento gratuito com 100% de reembolso até ${formattedDeadline} (${freeHours} horas antes das ${hh}:${mm} do dia do check-in). Faltando menos de ${freeHours}h para o check-in, é cobrado ${penaltyPct}%.`,
      shortSummary: `Cancelamento gratuito com 100% de reembolso até ${formattedDeadline}.`
    }
  } else {
    const refundPctAfter = Math.max(0, 100 - penaltyPct)
    const refundAmtAfter = Math.round(totalAmount * (refundPctAfter / 100) * 100) / 100
    return {
      policyType: "rigorosa",
      title: "Prazo de Cancelamento Gratuito Encerrado",
      badgeText: `⚠️ Menos de ${freeHours}h para o Check-in (Sem Reembolso)`,
      badgeVariant: "destructive",
      isEligibleForRefund: refundAmtAfter > 0,
      refundPercentage: refundPctAfter,
      refundAmount: refundAmtAfter,
      freeCancellationDeadline: formattedDeadline,
      deadlineDateIso: deadlineIso,
      explanation: `O prazo de cancelamento gratuito (${freeHours}h antes das ${hh}:${mm} do dia do check-in) encerrou em ${formattedDeadline}. Faltando menos de ${freeHours} horas para o check-in, é cobrado ${penaltyPct}% do valor da reserva.`,
      shortSummary: `Menos de ${freeHours}h para o check-in (prazo gratuito encerrou em ${formattedDeadline} — cobrança de ${penaltyPct}%).`
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Guest Flow Manager - Automated Dynamic Cancellation & Refund Policy
// ══════════════════════════════════════════════════════════════════════════════

import { parseISO, differenceInDays, differenceInHours, addDays, format } from "date-fns"
import { ptBR } from "date-fns/locale"

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

/**
 * Calcula a política de cancelamento aplicável com base na antecedência da reserva em relação ao check-in:
 * - Mais de 7 dias de antecedência: Política Rigorosa (não reembolsável)
 * - 7 dias ou menos de antecedência: Política Flexível (100% de reembolso se cancelado até 24h antes do check-in)
 */
export function calculateCancellationPolicy(
  bookingDateOrCreatedAt: string | Date,
  checkinDateStr: string,
  totalAmount: number = 0,
  checkinTimeStr: string = "14:00",
  nowDate: Date = new Date()
): CancellationPolicyResult {
  const bookingDate = typeof bookingDateOrCreatedAt === "string" 
    ? (bookingDateOrCreatedAt.includes("T") ? parseISO(bookingDateOrCreatedAt) : new Date(bookingDateOrCreatedAt))
    : bookingDateOrCreatedAt

  const checkinDate = typeof checkinDateStr === "string" && checkinDateStr.includes("-")
    ? parseISO(checkinDateStr)
    : new Date()

  // Diferença em dias inteiros entre o momento que a reserva foi feita e o check-in
  const antecedenceDays = differenceInDays(checkinDate, bookingDate)

  // O check-in oficial ocorre no dia de check-in às 14:00
  const [hours, minutes] = (checkinTimeStr || "14:00").split(":").map(Number)
  const officialCheckinDateTime = new Date(checkinDate)
  officialCheckinDateTime.setHours(hours || 14, minutes || 0, 0, 0)

  // Prazo limite para reembolso na política flexível: 24 horas antes do check-in
  const deadlineDateTime = new Date(officialCheckinDateTime.getTime() - 24 * 3600 * 1000)
  const formattedDeadline = format(deadlineDateTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  const deadlineIso = deadlineDateTime.toISOString()

  // 1. POLÍTICA RIGOROSA (Feita com mais de 7 dias de antecedência)
  if (antecedenceDays > 7) {
    return {
      policyType: "rigorosa",
      title: "Política Rigorosa",
      badgeText: "🔒 Política Rigorosa (Não Reembolsável)",
      badgeVariant: "destructive",
      isEligibleForRefund: false,
      refundPercentage: 0,
      refundAmount: 0,
      freeCancellationDeadline: formattedDeadline,
      deadlineDateIso: deadlineIso,
      explanation: `Reserva realizada com ${antecedenceDays} dias de antecedência (mais de 7 dias). Por se tratar de um bloqueio antecipado da unidade, não há reembolso em caso de cancelamento.`,
      shortSummary: "Não reembolsável após confirmação da reserva."
    }
  }

  // 2. POLÍTICA FLEXÍVEL (Feita com 7 dias ou menos de antecedência)
  const hoursUntilCheckin = differenceInHours(officialCheckinDateTime, nowDate)
  const isBeforeDeadline = nowDate.getTime() <= deadlineDateTime.getTime()

  if (isBeforeDeadline) {
    return {
      policyType: "flexivel",
      title: "Política Flexível",
      badgeText: "✓ Cancelamento Gratuito (100% de Reembolso)",
      badgeVariant: "default",
      isEligibleForRefund: true,
      refundPercentage: 100,
      refundAmount: totalAmount,
      freeCancellationDeadline: formattedDeadline,
      deadlineDateIso: deadlineIso,
      explanation: `Cancelamento 100% gratuito com estorno integral disponível até ${formattedDeadline} (24 horas antes do check-in).`,
      shortSummary: `Cancelamento gratuito até ${formattedDeadline}.`
    }
  } else {
    return {
      policyType: "flexivel",
      title: "Política Flexível (Prazo Expirado)",
      badgeText: "⚠️ Fora do Prazo de Reembolso",
      badgeVariant: "secondary",
      isEligibleForRefund: false,
      refundPercentage: 0,
      refundAmount: 0,
      freeCancellationDeadline: formattedDeadline,
      deadlineDateIso: deadlineIso,
      explanation: `O prazo de cancelamento gratuito encerrou em ${formattedDeadline} (menos de 24 horas para o check-in). O cancelamento liberará o apartamento, mas sem devolução de valores.`,
      shortSummary: `Prazo de cancelamento com reembolso expirou em ${formattedDeadline}.`
    }
  }
}

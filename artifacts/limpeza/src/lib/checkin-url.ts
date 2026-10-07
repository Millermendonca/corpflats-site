/**
 * Helper utilitário centralizado para resolução dinâmica da URL de check-in.
 * 
 * Suporta alternância entre:
 * - Check-in Gov.br FNRH Oficial (Ministério do Turismo / SERPRO)
 * - Check-in Próprio CorpFlats (com fallback resiliente inteligente)
 */

export interface CheckinUrlReservation {
  id?: string | number;
  code?: string;
  reservationCode?: string;
  serproPrecheckinUrl?: string;
  link_precheckin?: string;
  checkinUrl?: string;
  checkinProvider?: "proprio" | "gov_fnrh" | string;
  [key: string]: any;
}

export interface CheckinUrlSettings {
  checkinProvider?: "proprio" | "gov_fnrh" | string;
  [key: string]: any;
}

/**
 * Retorna a URL de pré-check-in apropriada de acordo com o provedor ativo e
 * a presença do link oficial SERPRO / Ministério do Turismo.
 *
 * @param reservation Objeto da reserva (contendo code, id, serproPrecheckinUrl, link_precheckin, etc.)
 * @param guestIndex Índice do hóspede (padrão: 1)
 * @param baseUrl URL base opcional (calculada a partir de window.location.origin se omitida)
 * @param settings Configurações do sistema ({ checkinProvider: 'proprio' | 'gov_fnrh' })
 */
export function getCheckinUrl(
  reservation: CheckinUrlReservation | null | undefined,
  guestIndex: number = 1,
  baseUrl: string = "",
  settings: CheckinUrlSettings | null = null
): string {
  const hostBase = (baseUrl || (typeof window !== "undefined" ? window.location.origin : "https://corpflats.onrender.com")).replace(/\/+$/, "")
  const resCode = reservation?.code || reservation?.reservationCode || String(reservation?.id || "")
  const safeGuestIndex = Number(guestIndex) || 1
  const internalFallback = `${hostBase}/pre-checkin/${resCode}?guest=${safeGuestIndex}`

  // Determina o provedor: configurações explícitas têm precedência máxima
  const provider = settings?.checkinProvider 
    || reservation?.checkinProvider 
    || ((reservation?.serproPrecheckinUrl || reservation?.link_precheckin) ? "gov_fnrh" : "proprio")

  if (provider === "gov_fnrh") {
    const govUrl = reservation?.serproPrecheckinUrl || reservation?.link_precheckin
    if (govUrl && typeof govUrl === "string" && govUrl.trim().length > 0) {
      return govUrl.trim()
    }

    if (reservation?.checkinUrl && !reservation.checkinUrl.includes("/pre-checkin/")) {
      return reservation.checkinUrl.trim()
    }
  }

  return internalFallback
}

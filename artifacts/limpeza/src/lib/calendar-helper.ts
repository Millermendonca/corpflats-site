// ══════════════════════════════════════════════════════════════════════════════
// Guest Flow Manager - Professional Calendar Integration (RFC 5545 / RFC 5546)
// Suporte a Criação (SEQ 0), Remarcação/Atualização (SEQ > 0) e Cancelamento (CANCEL)
// ══════════════════════════════════════════════════════════════════════════════

export interface ReservationCalendarData {
  id: string | number
  reservationCode: string
  guestName: string
  guestEmail?: string
  guestPhone?: string
  flatNumber: string | number
  flatName?: string
  checkinDate: string // YYYY-MM-DD
  checkoutDate: string // YYYY-MM-DD
  checkinTime?: string // default "14:00"
  checkoutTime?: string // default "12:00"
  numGuests?: number
  totalAmount?: number
  accessCode?: string // Senha da fechadura eletrônica
  wifiNetwork?: string
  wifiPassword?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  hostName?: string
  hostPhone?: string
  manageUrl?: string
  calendarSequence?: number // SEQUENCE incremental (0 na criação, 1 na remarcação, etc.)
  status?: string // "confirmada" | "remarcada" | "cancelada" | "checked_in"
}

const DEFAULT_PROPERTY = {
  name: "CorpFlats - Soho Residence Service",
  address: "Rua Conselheiro Otaviano, 209 - Centro",
  city: "Campos dos Goytacazes",
  state: "RJ",
  zipCode: "28010-140",
  hostName: "CorpFlats Campos dos Goytacazes",
  hostPhone: "+55 (22) 99712-4021",
  hostEmail: "reservas@corpflats.com.br",
  wifiNetwork: "CorpFlats_Hospedes",
  wifiPassword: "hospedeconforto",
  checkinTime: "14:00",
  checkoutTime: "12:00"
}

/**
 * Formata data e hora para o formato ISO compacto UTC / Local para iCal: YYYYMMDDTHHMMSS
 */
function formatIcsDateTime(dateStr: string, timeStr = "14:00"): string {
  const [year, month, day] = (dateStr || "2026-01-01").split("-")
  const [hours, minutes] = (timeStr || "14:00").split(":")
  return `${year}${month}${day}T${hours}${minutes}00`
}

/**
 * 1. Gera o arquivo .ics universal (RFC 5545 / RFC 5546) com suporte a Atualizações e Cancelamento
 */
export function generateIcsContent(
  data: ReservationCalendarData,
  overrideAction?: "REQUEST" | "CANCEL"
): string {
  const prop = DEFAULT_PROPERTY
  const isCancelled = overrideAction === "CANCEL" || data.status === "cancelada" || data.status === "CANCELLED"
  const method = isCancelled ? "CANCEL" : "REQUEST"
  const eventStatus = isCancelled ? "CANCELLED" : "CONFIRMED"
  const sequence = data.calendarSequence ?? (isCancelled ? 1 : 0)

  const checkinDt = formatIcsDateTime(data.checkinDate, data.checkinTime || prop.checkinTime)
  const checkoutDt = formatIcsDateTime(data.checkoutDate, data.checkoutTime || prop.checkoutTime)
  const nowDt = formatIcsDateTime(new Date().toISOString().split("T")[0], "00:00") + "Z"

  const uid = `booking-${data.reservationCode}@corpflats.com.br`
  const title = isCancelled 
    ? `CANCELADA: Hospedagem CorpFlats Macaé - Flat ${data.flatNumber} (#${data.reservationCode})`
    : sequence > 0
    ? `REMARCADA: Hospedagem CorpFlats Macaé - Flat ${data.flatNumber} (#${data.reservationCode})`
    : `Hospedagem CorpFlats Macaé - Flat ${data.flatNumber} - Reserva #${data.reservationCode}`

  const location = `${prop.name}, ${prop.address}, ${prop.city} - ${prop.state}, CEP ${prop.zipCode}`
  const manageUrl = data.manageUrl || `https://corpflats.onrender.com/minha-reserva/${data.reservationCode}`
  const guestEmail = data.guestEmail || `hospede-${data.reservationCode}@corpflats.com.br`

  const descriptionLines: string[] = []

  if (isCancelled) {
    descriptionLines.push(
      `⚠️ RESERVA CANCELADA`,
      `----------------------------------------`,
      `A sua reserva #${data.reservationCode} no Flat ${data.flatNumber} foi cancelada.`,
      `Para mais informações ou suporte, acesse: ${manageUrl}`,
      `WhatsApp da Central: ${prop.hostPhone}`
    )
  } else {
    descriptionLines.push(
      sequence > 0 ? `🔄 RESERVA REMARCADA / ATUALIZADA` : `🏨 HOSPEDAGEM CONFIRMADA NA CORPFLATS MACAÉ`,
      `----------------------------------------`,
      `Acomodação: Flat Studio ${data.flatNumber} (${data.flatName || 'Studio Executivo Climatizado'})`,
      `Código Localizador: ${data.reservationCode}`,
      `Hóspede Principal: ${data.guestName}`,
      `Total de Hóspedes: ${data.numGuests || 2} pessoa(s)`,
      ``,
      `🕒 HORÁRIOS:`,
      `Check-in: ${data.checkinDate} a partir das ${data.checkinTime || prop.checkinTime}`,
      `Check-out: ${data.checkoutDate} até as ${data.checkoutTime || prop.checkoutTime}`,
      ``,
      data.accessCode ? `🔑 SENHA DA FECHADURA DIGITAL: ${data.accessCode}` : `🔑 ACESSO: As instruções e senha serão liberadas no dia do check-in.`,
      `📶 WI-FI: Rede "${data.wifiNetwork || prop.wifiNetwork}" | Senha "${data.wifiPassword || prop.wifiPassword}"`,
      `🚗 ESTACIONAMENTO: Garagem rotativa inclusa com portaria 24h`,
      ``,
      `📲 GERENCIAR SUA RESERVA:`,
      `${manageUrl}`,
      ``,
      `📞 SUPORTE & WHATSAPP: ${prop.hostPhone}`
    )
  }

  const formattedDesc = descriptionLines
    .join("\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")

  const partStat = sequence > 0 ? "NEEDS-ACTION" : "ACCEPTED"

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CorpFlats Macae//Motor de Reservas 2.0//PT",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `STATUS:${eventStatus}`,
    `DTSTAMP:${nowDt}`,
    `DTSTART;TZID=America/Sao_Paulo:${checkinDt}`,
    `DTEND;TZID=America/Sao_Paulo:${checkoutDt}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${formattedDesc}`,
    `LOCATION:${location}`,
    `URL:${manageUrl}`,
    `ORGANIZER;CN="${prop.hostName}":mailto:${prop.hostEmail}`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=${partStat};CN=${data.guestName}:mailto:${guestEmail}`
  ]

  // Se não for cancelado, adiciona os alarmes de lembrete
  if (!isCancelled) {
    lines.push(
      "BEGIN:VALARM",
      "TRIGGER:-PT24H",
      "ACTION:DISPLAY",
      `DESCRIPTION:Lembrete de Check-in: Sua estadia no Flat ${data.flatNumber} da CorpFlats começa amanhã!`,
      "END:VALARM",
      "BEGIN:VALARM",
      "TRIGGER:-PT2H",
      "ACTION:DISPLAY",
      `DESCRIPTION:Check-in CorpFlats hoje às 14:00 - Flat ${data.flatNumber}. Tenha seu código de acesso em mãos.`,
      "END:VALARM"
    )
  }

  lines.push("END:VEVENT", "END:VCALENDAR")

  return lines.join("\r\n")
}

/**
 * 2. Download direto do arquivo .ics
 */
export function downloadIcsFile(
  data: ReservationCalendarData,
  overrideAction?: "REQUEST" | "CANCEL"
): void {
  const icsText = generateIcsContent(data, overrideAction)
  const blob = new Blob([icsText], { type: "text/calendar;charset=utf-8" })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `reserva-corpflats-${data.reservationCode}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

/**
 * 3. Gera URL de Adição Direta no Google Agenda
 */
export function getGoogleCalendarUrl(data: ReservationCalendarData): string {
  const prop = DEFAULT_PROPERTY
  const checkinDt = formatIcsDateTime(data.checkinDate, data.checkinTime || prop.checkinTime)
  const checkoutDt = formatIcsDateTime(data.checkoutDate, data.checkoutTime || prop.checkoutTime)

  const title = `Hospedagem CorpFlats Macaé - Flat ${data.flatNumber} (#${data.reservationCode})`
  const location = `${prop.name}, ${prop.address}, ${prop.city} - ${prop.state}`
  const manageUrl = data.manageUrl || `https://corpflats.onrender.com/minha-reserva/${data.reservationCode}`

  const details = [
    `🏨 HOSPEDAGEM CONFIRMADA NA CORPFLATS MACAÉ`,
    `Acomodação: Flat ${data.flatNumber}`,
    `Reserva: #${data.reservationCode}`,
    `Hóspede: ${data.guestName}`,
    `Check-in: ${data.checkinDate} a partir das ${data.checkinTime || prop.checkinTime}`,
    `Check-out: ${data.checkoutDate} até as ${data.checkoutTime || prop.checkoutTime}`,
    data.accessCode ? `🔑 Senha da Porta: ${data.accessCode}` : `🔑 Chave digital liberada no check-in`,
    `Wi-Fi: ${data.wifiNetwork || prop.wifiNetwork} (Senha: ${data.wifiPassword || prop.wifiPassword})`,
    `Acessar Portal da Reserva: ${manageUrl}`,
    `WhatsApp Suporte: ${prop.hostPhone}`
  ].join("\n")

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${checkinDt}/${checkoutDt}`,
    details: details,
    location: location,
    ctz: "America/Sao_Paulo"
  })

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/**
 * 4. Gera URL de Adição Direta no Outlook / Office 365 Web
 */
export function getOutlookCalendarUrl(data: ReservationCalendarData): string {
  const prop = DEFAULT_PROPERTY
  const checkinIso = `${data.checkinDate}T${data.checkinTime || prop.checkinTime}:00`
  const checkoutIso = `${data.checkoutDate}T${data.checkoutTime || prop.checkoutTime}:00`

  const title = `Hospedagem CorpFlats Macaé - Flat ${data.flatNumber} (#${data.reservationCode})`
  const location = `${prop.name}, ${prop.address}, ${prop.city} - ${prop.state}`
  const manageUrl = data.manageUrl || `https://corpflats.onrender.com/minha-reserva/${data.reservationCode}`

  const body = `Hospedagem confirmada no Flat ${data.flatNumber} (Reserva #${data.reservationCode}). Hóspede: ${data.guestName}. Gerenciar: ${manageUrl}`

  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: title,
    startdt: checkinIso,
    enddt: checkoutIso,
    body: body,
    location: location
  })

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`
}

/**
 * 5. Gera URL para o Yahoo Calendar
 */
export function getYahooCalendarUrl(data: ReservationCalendarData): string {
  const prop = DEFAULT_PROPERTY
  const checkinDt = formatIcsDateTime(data.checkinDate, data.checkinTime || prop.checkinTime)
  const checkoutDt = formatIcsDateTime(data.checkoutDate, data.checkoutTime || prop.checkoutTime)

  const title = `Hospedagem CorpFlats Macaé - Flat ${data.flatNumber}`
  const location = `${prop.name}, ${prop.address}, ${prop.city} - ${prop.state}`

  const params = new URLSearchParams({
    v: "60",
    view: "d",
    type: "20",
    title: title,
    st: checkinDt,
    et: checkoutDt,
    in_loc: location,
    desc: `Reserva #${data.reservationCode} - Flat ${data.flatNumber}. Hóspede: ${data.guestName}`
  })

  return `https://calendar.yahoo.com/?${params.toString()}`
}

/**
 * 6. Gera Metadados Estruturados JSON-LD Schema.org/LodgingReservation
 */
export function generateLodgingJsonLd(data: ReservationCalendarData): Record<string, any> {
  const prop = DEFAULT_PROPERTY
  const checkinIso = `${data.checkinDate}T${data.checkinTime || prop.checkinTime}:00-03:00`
  const checkoutIso = `${data.checkoutDate}T${data.checkoutTime || prop.checkoutTime}:00-03:00`

  return {
    "@context": "http://schema.org",
    "@type": "LodgingReservation",
    "reservationNumber": data.reservationCode,
    "reservationStatus": data.status === "cancelada" ? "http://schema.org/ReservationCancelled" : "http://schema.org/ReservationConfirmed",
    "underName": {
      "@type": "Person",
      "name": data.guestName,
      "email": data.guestEmail || undefined,
      "telephone": data.guestPhone || undefined
    },
    "reservationFor": {
      "@type": "LodgingBusiness",
      "name": prop.name,
      "address": {
        "@type": "PostalAddress",
        "streetAddress": prop.address,
        "addressLocality": prop.city,
        "addressRegion": prop.state,
        "postalCode": prop.zipCode,
        "addressCountry": "BR"
      },
      "telephone": prop.hostPhone
    },
    "checkinTime": checkinIso,
    "checkoutTime": checkoutIso,
    "numGuests": data.numGuests || 2,
    "priceCurrency": "BRL",
    "price": data.totalAmount || undefined,
    "url": data.manageUrl || `https://corpflats.onrender.com/minha-reserva/${data.reservationCode}`
  }
}

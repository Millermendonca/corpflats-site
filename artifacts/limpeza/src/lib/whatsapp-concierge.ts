import {
  getSessionTrackingId,
  getStoredAttribution,
  trackWhatsAppConciergeClick,
} from "@/lib/analytics-tracking";

export type ConciergePlacement =
  | "booking_card"
  | "desktop_sticky_pill"
  | "mobile_sticky_bar"
  | "funnel_step_helper"
  | "funnel_exit_intent"
  | "long_stay_custom"
  | "footer_contact";

export interface ConciergeContext {
  whatsappNumber?: string;
  placement: ConciergePlacement;
  pagePath: string;
  pageLabel?: string;
  checkinDate?: string;
  checkoutDate?: string;
  nights?: number;
  adultsCount?: number;
  childrenCount?: number;
  roomsCount?: number;
  bedType?: "queen" | "twin";
  ratePlan?: "with_breakfast" | "room_only";
  pixTotalAmount?: number;
  funnelStep?: number;
  funnelStepLabel?: string;
  isWorkTrip?: boolean;
  customQuestion?: string;
}

const DEFAULT_WHATSAPP = "5522997124021";

function formatIsoDateToBr(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatCurrencyBr(val?: number): string {
  if (typeof val !== "number" || !Number.isFinite(val) || val <= 0) return "";
  return val.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Monta uma mensagem natural contextualizada para a IA Comercial (Sofia)
 * extrair datas, hóspedes, tipo de cama, plano de café e página sem repetir perguntas (Zero-Ask),
 * sem jamais expor dados pessoais sensíveis (CPF/e-mail) na URL.
 */
export function buildSmartConciergeMessage(ctx: ConciergeContext): string {
  if (ctx.customQuestion) {
    return ctx.customQuestion;
  }

  const checkinBr = formatIsoDateToBr(ctx.checkinDate);
  const checkoutBr = formatIsoDateToBr(ctx.checkoutDate);
  const nights = ctx.nights && ctx.nights > 0 ? ctx.nights : undefined;
  const adults = ctx.adultsCount && ctx.adultsCount > 0 ? ctx.adultsCount : 1;
  const children = ctx.childrenCount && ctx.childrenCount > 0 ? ctx.childrenCount : 0;
  const rooms = ctx.roomsCount && ctx.roomsCount > 0 ? ctx.roomsCount : 1;

  const guestsParts = [`${adults} ${adults === 1 ? "adulto" : "adultos"}`];
  if (children > 0) {
    guestsParts.push(`${children} ${children === 1 ? "criança" : "crianças"}`);
  }
  const guestsLabel = guestsParts.join(" e ");
  const bedLabel = ctx.bedType === "twin" ? "2 camas de solteiro" : "cama Casal Queen";
  const rateLabel =
    ctx.ratePlan === "room_only" ? "tarifa Sem Café" : "tarifa Com Café no Flat";
  const pixLabel = formatCurrencyBr(ctx.pixTotalAmount);
  const pageTag = ctx.pageLabel ? ` (${ctx.pageLabel})` : "";

  const staySummaryParts: string[] = [];
  if (checkinBr && checkoutBr) {
    staySummaryParts.push(
      `de ${checkinBr} a ${checkoutBr}${nights ? ` (${nights} ${nights === 1 ? "diária" : "diárias"})` : ""}`
    );
  }
  staySummaryParts.push(
    `para ${guestsLabel}, ${rooms} ${rooms === 1 ? "flat" : "flats"} (${bedLabel}, ${rateLabel}${
      pixLabel ? ` — R$ ${pixLabel} c/ 5% OFF no PIX` : ""
    })`
  );
  if (ctx.isWorkTrip) {
    staySummaryParts.push("viagem corporativa/CNPJ");
  }

  if (
    ctx.placement === "funnel_step_helper" ||
    ctx.placement === "funnel_exit_intent"
  ) {
    const stepInfo = ctx.funnelStepLabel ? ` na etapa "${ctx.funnelStepLabel}"` : "";
    return `Olá! Estava reservando no site oficial da CorpFlats${pageTag} (${staySummaryParts.join(", ")})${stepInfo} e fiquei com uma dúvida. Pode me ajudar a concluir?`;
  }

  if (ctx.placement === "long_stay_custom") {
    return `Olá! Estou na página de Estadia Longa do site oficial da CorpFlats (${staySummaryParts.join(", ")}) e gostaria de cotar condições para estadia prolongada.`;
  }

  return `Olá! Estou no site oficial da CorpFlats${pageTag} vendo disponibilidade ${staySummaryParts.join(", ")}. Pode me ajudar com uma dúvida?`;
}

export function buildSmartConciergeUrl(ctx: ConciergeContext): string {
  const cleanPhone =
    String(ctx.whatsappNumber || DEFAULT_WHATSAPP).replace(/\D/g, "") ||
    DEFAULT_WHATSAPP;
  const message = buildSmartConciergeMessage(ctx);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

/**
 * Registra micro-conversão não-bloqueante (GA4 + Meta Pixel + Funil interno PMS)
 * e abre o atendimento 24h da Sofia no WhatsApp.
 */
export function openSmartWhatsAppConcierge(ctx: ConciergeContext): void {
  const totalGuests = (ctx.adultsCount || 1) + (ctx.childrenCount || 0);

  try {
    trackWhatsAppConciergeClick({
      placement: ctx.placement,
      pagePath: ctx.pagePath || (typeof window !== "undefined" ? window.location.pathname : "/"),
      checkinDate: ctx.checkinDate,
      checkoutDate: ctx.checkoutDate,
      nights: ctx.nights,
      totalGuests,
      ratePlan: ctx.ratePlan,
      value: ctx.pixTotalAmount,
    });
  } catch {}

  try {
    const payload = JSON.stringify({
      sessionId: getSessionTrackingId(),
      step: ctx.funnelStep || 1,
      stepName: "whatsapp_concierge_click",
      status: "transbordo_whatsapp",
      placement: ctx.placement,
      pagePath: ctx.pagePath || (typeof window !== "undefined" ? window.location.pathname : "/"),
      checkinDate: ctx.checkinDate,
      checkoutDate: ctx.checkoutDate,
      ratePlan: ctx.ratePlan,
      roomsCount: ctx.roomsCount || 1,
      adultsCount: ctx.adultsCount || 1,
      totalAmount: ctx.pixTotalAmount,
      attribution: getStoredAttribution(),
    });

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/funnel/track", blob);
    } else if (typeof fetch === "function") {
      fetch("/api/funnel/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {}

  const url = buildSmartConciergeUrl(ctx);
  if (typeof window !== "undefined") {
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
      window.location.href = url;
    }
  }
}

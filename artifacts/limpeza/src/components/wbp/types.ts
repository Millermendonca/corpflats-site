export type WbpIntegrationMode = "off" | "observe" | "auto";

export type PaymentCollectType = "Channel" | "Property";

export interface OtaReservationItem {
  id: string;
  orderId: string;
  receivedAt: string;
  channel: "booking" | "airbnb" | "direct" | string;
  channelReservationId: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  planId: "sem_cafe" | "com_cafe" | string;
  planName: string;
  guestCount: number;
  paymentCollect: PaymentCollectType;
  totalGrossAmount: number;
  totalNetAmount: number;
  currency: string;
  status: "imported" | "quarantine" | "linked" | "cancelled" | "modified";
  allocatedFlat?: string | null;
  quarantineReason?: string | null;
  quarantineDiagnostic?: string | null;
  linkedReservationCode?: string | null;
  rawPayload?: any;
  cardLast4?: string;
  cardBrand?: string;
  cardExpMonth?: string;
  cardExpYear?: string;
  hasCard?: boolean;
}

export interface WbpTelemetryHealth {
  mode: WbpIntegrationMode;
  lastPollingMinutesAgo: number;
  lastAriSyncSecondsAgo: number;
  pendingQuarantineCount: number;
  isPollingActive: boolean;
  isAriSyncing: boolean;
}

export interface QuarantineResolutionPayload {
  action: "assign_flat" | "force_accept" | "link_existing";
  flatNumber?: string;
  existingReservationId?: string;
  notes?: string;
}

export interface QuarantineRejectPayload {
  reason: string;
  notes?: string;
}

export interface DecryptedCardDetails {
  cardholderName: string;
  cardBrand: string;
  cardNumber: string;
  cardLast4: string;
  cardExpMonth: string;
  cardExpYear: string;
  cvvNotice: string;
}

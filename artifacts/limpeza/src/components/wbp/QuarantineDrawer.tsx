import React, { useState } from "react";
import { 
  X, 
  ShieldAlert, 
  Building2, 
  Check, 
  Ban, 
  Link2, 
  CreditCard, 
  Code, 
  Copy, 
  AlertTriangle, 
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Coffee,
  Layers,
  Calendar,
  Lock
} from "lucide-react";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription 
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  OtaReservationItem, 
  QuarantineResolutionPayload, 
  QuarantineRejectPayload 
} from "./types";
import { SecureCardModal } from "./SecureCardModal";

interface QuarantineDrawerProps {
  item: OtaReservationItem | null;
  isOpen: boolean;
  onClose: () => void;
  onResolve: (id: string, payload: QuarantineResolutionPayload) => Promise<void>;
  onReject: (id: string, payload: QuarantineRejectPayload) => Promise<void>;
  onLink: (id: string, existingReservationId: string) => Promise<void>;
}

// 19 canonical flats of CorpFlats Soho Residence
const ALL_19_FLATS = [
  "113", "114", "116", "211", "212", "215", "313", "408", "509",
  "511", "512", "605", "712", "715", "904", "905", "907", "1004", "1304"
];

export const QuarantineDrawer: React.FC<QuarantineDrawerProps> = ({
  item,
  isOpen,
  onClose,
  onResolve,
  onReject,
  onLink,
}) => {
  const [selectedFlat, setSelectedFlat] = useState<string>("605");
  const [manualReservationCode, setManualReservationCode] = useState<string>("");
  const [actionNotes, setActionNotes] = useState<string>("");
  const [rejectReason, setRejectReason] = useState<string>("Overbooking não solucionável");
  const [isRawJsonExpanded, setIsRawJsonExpanded] = useState<boolean>(false);
  const [isSecureCardModalOpen, setIsSecureCardModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);

  if (!item) return null;

  const isQuarantine = item.status === "quarantine";
  const displayCheckin = (item as any).checkIn || item.checkinDate;
  const displayCheckout = (item as any).checkOut || item.checkoutDate;
  const displayNights = (item as any).nightsCount || item.nights || 1;
  const displayPlan = (item as any).planId || item.ratePlan || "sem_cafe";
  const displayTotal = (item as any).totalGrossAmount ?? item.totalPrice ?? 0;
  const displayFlat = (item as any).allocatedFlat || item.flatNumber;

  const handleAssignFlat = async () => {
    setIsSubmitting(true);
    try {
      await onResolve(item.id, {
        action: "assign_flat",
        flatNumber: selectedFlat,
        notes: actionNotes,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForceAccept = async () => {
    setIsSubmitting(true);
    try {
      await onResolve(item.id, {
        action: "force_accept",
        notes: actionNotes || "Aceite forçado pelo administrador",
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLinkManual = async () => {
    if (!manualReservationCode.trim()) return;
    setIsSubmitting(true);
    try {
      await onLink(item.id, manualReservationCode.trim());
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    try {
      await onReject(item.id, {
        reason: rejectReason,
        notes: actionNotes,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyJson = () => {
    const jsonStr = JSON.stringify((item as any).rawPayload || item, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0 flex flex-col h-full bg-background">
          {/* Header */}
          <div className="p-5 border-b border-border bg-muted/20 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isQuarantine ? (
                  <Badge className="bg-rose-600 text-white text-xs gap-1 font-bold">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Quarentena
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-600 text-white text-xs gap-1 font-bold">
                    <Check className="w-3.5 h-3.5" />
                    Reserva Confirmada
                  </Badge>
                )}
                <span className="text-xs font-mono text-muted-foreground">
                  Nº OTA: {(item as any).channelReservationId || item.orderId}
                </span>
              </div>
            </div>

            <h2 className="text-xl font-black text-foreground pt-1">
              {item.guestName}
            </h2>
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <span>{item.channel === "booking" ? "Booking.com" : item.channel === "airbnb" ? "Airbnb" : item.channel === "expedia" ? "Expedia" : "Channex.io"}</span>
              <span>•</span>
              <span>{displayCheckin} → {displayCheckout} ({displayNights} noites)</span>
            </p>
          </div>

          <div className="p-5 space-y-6 flex-1">
            {/* Quarantine Diagnostic Reason Box */}
            {isQuarantine && (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 space-y-2">
                <div className="flex items-center gap-2 text-rose-800 dark:text-rose-200 font-bold text-xs">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  Diagnóstico de Bloqueio em Quarentena
                </div>
                <p className="text-xs text-rose-950 dark:text-rose-100 font-medium">
                  {(item as any).quarantineDiagnostic || item.quarantineReasonDetail || item.quarantineReason || "Conflito de alocação ou indisponibilidade nas datas solicitadas."}
                </p>
                <div className="text-[11px] text-rose-800/80 dark:text-rose-300/80 pt-1 border-t border-rose-200 dark:border-rose-900">
                  Esta reserva permanece isolada sem gerar overbooking no calendário até que uma ação seja tomada abaixo.
                </div>
              </div>
            )}

            {/* Reservation Summary Details */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-muted/30 rounded-xl space-y-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                  Plano & Café
                </span>
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  {displayPlan === "com_cafe" ? (
                    <>
                      <Coffee className="w-3.5 h-3.5 text-amber-600" />
                      Com café ({(item as any).guestCount || (item.adults + item.children) || 2} hósp.)
                    </>
                  ) : (
                    <>
                      <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                      Sem café
                    </>
                  )}
                </span>
              </div>

              <div className="p-3 bg-muted/30 rounded-xl space-y-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                  Forma de Cobrança
                </span>
                <span className="font-bold text-foreground">
                  {item.paymentCollect === "Channel" ? (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      Pago pela OTA (Channel)
                    </span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400">
                      Cobrar no Hotel (Property)
                    </span>
                  )}
                </span>
              </div>

              <div className="p-3 bg-muted/30 rounded-xl space-y-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                  Valor Total
                </span>
                <span className="font-bold font-mono text-foreground text-sm">
                  R$ {Number(displayTotal || 0).toFixed(2)}
                </span>
              </div>

              <div className="p-3 bg-muted/30 rounded-xl space-y-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                  Flat Alocado
                </span>
                <span className="font-black font-mono text-foreground text-sm">
                  {displayFlat ? `Flat ${displayFlat}` : "Pendente (Quarentena)"}
                </span>
              </div>
            </div>

            {/* Masked Card & Secure Vault Access */}
            <div className="p-3.5 bg-muted/30 border border-border/70 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-xs text-foreground block">
                    Garantia de Cartão de Crédito
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {item.maskedCard || `•••• ${(item as any).cardLast4 || "4242"}`} ({item.cardBrand || "Visa"})
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsSecureCardModalOpen(true)}
                className="h-8 text-xs font-semibold gap-1.5 border-primary/40 hover:bg-primary/10 text-primary"
              >
                <Lock className="w-3 h-3" />
                Ver (exige senha)
              </Button>
            </div>

            {/* Actions for Quarantine Resolution */}
            {isQuarantine && (
              <div className="space-y-4 pt-2 border-t border-border">
                <div className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Resolução da Quarentena
                </div>

                {/* Option 1: Manual Room Assignment */}
                <div className="p-3.5 bg-card border border-border rounded-xl space-y-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-xs text-foreground">
                      1. Alocar Flat Manualmente (dos 19 do Soho Residence)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={selectedFlat} onValueChange={setSelectedFlat}>
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue placeholder="Selecione um flat" />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_19_FLATS.map((f) => (
                          <SelectItem key={f} value={f}>
                            Flat {f} (Soho Residence)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      onClick={handleAssignFlat}
                      disabled={isSubmitting}
                      className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1 shadow-xs"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Confirmar Flat {selectedFlat}
                    </Button>
                  </div>
                </div>

                {/* Option 2: Link to Existing Manual PMS Reservation */}
                <div className="p-3.5 bg-card border border-border rounded-xl space-y-2">
                  <span className="font-bold text-xs text-foreground block">
                    2. Vincular a Reserva Manual Existente no PMS
                  </span>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Código ou ID da reserva (ex: RES-605-1234)..."
                      value={manualReservationCode}
                      onChange={(e) => setManualReservationCode(e.target.value)}
                      className="h-8 text-xs flex-1"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleLinkManual}
                      disabled={isSubmitting || !manualReservationCode.trim()}
                      className="h-8 text-xs font-semibold"
                    >
                      Vincular Reserva
                    </Button>
                  </div>
                </div>

                {/* Option 3: Force Accept */}
                <div className="p-3.5 bg-card border border-border rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-foreground">
                      3. Aceitar Mesmo Assim (Forçar Aceite)
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleForceAccept}
                      disabled={isSubmitting}
                      className="h-8 text-xs text-foreground hover:bg-muted font-semibold"
                    >
                      Forçar Aceite
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Cria a reserva no sistema mesmo com conflito, atribuindo o próximo flat vago via fair-share.
                  </p>
                </div>

                {/* Option 4: Reject and Notify Channel */}
                <div className="p-3.5 bg-rose-50/40 dark:bg-rose-950/20 border border-rose-300 dark:border-rose-900 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-rose-950 dark:text-rose-200">
                      4. Rejeitar Reserva e Notificar Canal
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleReject}
                      disabled={isSubmitting}
                      className="h-8 text-xs font-bold gap-1"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Rejeitar Reserva
                    </Button>
                  </div>
                  <Input
                    placeholder="Motivo da recusa (ex: Sem disponibilidade física)..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="h-7 text-xs bg-background"
                  />
                </div>
              </div>
            )}

            {/* Collapsible Raw JSON Payload Inspector */}
            <div className="pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsRawJsonExpanded(!isRawJsonExpanded)}
                className="flex items-center justify-between w-full py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Code className="w-3.5 h-3.5" />
                  Payload Original da Reserva OTA (JSON)
                </span>
                {isRawJsonExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {isRawJsonExpanded && (
                <div className="mt-2 space-y-2">
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                    <span>Estrutura bruta sanitizada (zero CVV em memória)</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCopyJson}
                      className="h-6 text-[10px] gap-1 px-2"
                    >
                      {copiedJson ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      {copiedJson ? "Copiado!" : "Copiar JSON"}
                    </Button>
                  </div>
                  <pre className="p-3 bg-muted/60 dark:bg-slate-950 border border-border rounded-xl text-[10px] font-mono overflow-x-auto max-h-60 leading-relaxed text-foreground">
                    {JSON.stringify(item.rawPayload || {
                      OrderId: item.orderId,
                      Channel: item.channel,
                      GuestName: item.guestName,
                      StartDate: item.checkIn,
                      EndDate: item.checkOut,
                      RatePlan: item.planId,
                      PaymentCollect: item.paymentCollect,
                      TotalAmount: item.totalGrossAmount,
                      Card: {
                        Brand: item.cardBrand || "Visa",
                        Last4: item.cardLast4 || "4242",
                        Expiry: `${item.cardExpMonth || "12"}/${item.cardExpYear || "2028"}`,
                        SecurityCode: "[DISCARDED_IN_MEMORY_PCI_DSS]"
                      }
                    }, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Secure Card Modal */}
      <SecureCardModal
        isOpen={isSecureCardModalOpen}
        onClose={() => setIsSecureCardModalOpen(false)}
        reservationId={item.id}
        orderId={item.orderId}
        guestName={item.guestName}
        cardLast4={item.cardLast4}
        cardBrand={item.cardBrand}
      />
    </>
  );
};

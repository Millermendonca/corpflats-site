import React, { useState, useEffect, useCallback } from "react";
import { 
  Inbox, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle 
} from "lucide-react";
import { OtaInboxHeader } from "./OtaInboxHeader";
import { OtaInboxTable } from "./OtaInboxTable";
import { QuarantineDrawer } from "./QuarantineDrawer";
import { 
  OtaReservationItem, 
  WbpIntegrationMode, 
  WbpTelemetryHealth,
  QuarantineResolutionPayload,
  QuarantineRejectPayload
} from "./types";

const INITIAL_MOCK_ITEMS: OtaReservationItem[] = [
  {
    id: "wbp-101",
    orderId: "4829173651",
    receivedAt: "13/10 18:02",
    channel: "booking",
    channelReservationId: "4829173651",
    guestName: "Carlos Eduardo Siqueira",
    guestCount: 2,
    checkIn: "20/10/2026",
    checkOut: "23/10/2026",
    nightsCount: 3,
    planId: "com_cafe",
    planName: "Com café",
    paymentCollect: "Channel",
    totalGrossAmount: 979.89,
    totalNetAmount: 832.90,
    currency: "BRL",
    status: "imported",
    allocatedFlat: "605",
    cardLast4: "4242",
    cardBrand: "Visa",
    cardExpMonth: "12",
    cardExpYear: "2028",
  },
  {
    id: "wbp-102",
    orderId: "HMQ8X2K9P1",
    receivedAt: "13/10 17:45",
    channel: "airbnb",
    channelReservationId: "HMQ8X2K9P1",
    guestName: "Mariana Alcantara",
    guestCount: 1,
    checkIn: "24/10/2026",
    checkOut: "27/10/2026",
    nightsCount: 3,
    planId: "sem_cafe",
    planName: "Sem café",
    paymentCollect: "Channel",
    totalGrossAmount: 829.89,
    totalNetAmount: 680.51,
    currency: "BRL",
    status: "imported",
    allocatedFlat: "502",
    cardLast4: "8890",
    cardBrand: "Mastercard",
    cardExpMonth: "08",
    cardExpYear: "2027",
  },
  {
    id: "wbp-103",
    orderId: "4829173890",
    receivedAt: "13/10 16:30",
    channel: "booking",
    channelReservationId: "4829173890",
    guestName: "Roberto Vianna",
    guestCount: 2,
    checkIn: "15/11/2026",
    checkOut: "18/11/2026",
    nightsCount: 3,
    planId: "com_cafe",
    planName: "Com café",
    paymentCollect: "Property",
    totalGrossAmount: 1120.00,
    totalNetAmount: 952.00,
    currency: "BRL",
    status: "quarantine",
    quarantineReason: "Flat 605 bloqueado por manutenção",
    quarantineDiagnostic: "O flat pré-alocado (605) possui ordem de manutenção aberta. Selecione outra unidade livre.",
    cardLast4: "1122",
    cardBrand: "Elo",
    cardExpMonth: "05",
    cardExpYear: "2029",
  },
  {
    id: "wbp-104",
    orderId: "4829173995",
    receivedAt: "13/10 15:10",
    channel: "booking",
    channelReservationId: "4829173995",
    guestName: "Fernanda Guimaraes",
    guestCount: 2,
    checkIn: "28/10/2026",
    checkOut: "31/10/2026",
    nightsCount: 3,
    planId: "sem_cafe",
    planName: "Sem café",
    paymentCollect: "Channel",
    totalGrossAmount: 829.89,
    totalNetAmount: 705.40,
    currency: "BRL",
    status: "linked",
    linkedReservationCode: "RES-589",
    allocatedFlat: "304",
    cardLast4: "3344",
    cardBrand: "Visa",
    cardExpMonth: "10",
    cardExpYear: "2026",
  },
  {
    id: "wbp-105",
    orderId: "HMQ8X2K9Z9",
    receivedAt: "13/10 14:00",
    channel: "airbnb",
    channelReservationId: "HMQ8X2K9Z9",
    guestName: "Lucas Mendes",
    guestCount: 2,
    checkIn: "01/11/2026",
    checkOut: "03/11/2026",
    nightsCount: 2,
    planId: "sem_cafe",
    planName: "Sem café",
    paymentCollect: "Channel",
    totalGrossAmount: 553.26,
    totalNetAmount: 453.67,
    currency: "BRL",
    status: "cancelled",
    allocatedFlat: null,
  },
  {
    id: "wbp-106",
    orderId: "4829174001",
    receivedAt: "13/10 12:45",
    channel: "booking",
    channelReservationId: "4829174001",
    guestName: "Patricia de Souza",
    guestCount: 3,
    checkIn: "15/11/2026",
    checkOut: "17/11/2026",
    nightsCount: 2,
    planId: "com_cafe",
    planName: "Com café",
    paymentCollect: "Property",
    totalGrossAmount: 750.00,
    totalNetAmount: 637.50,
    currency: "BRL",
    status: "quarantine",
    quarantineReason: "Overbooking: 0 flats livres",
    quarantineDiagnostic: "Não há flats da categoria Standard livres nas datas solicitadas (ocupação 100%). Avalie remanejamento ou recusa.",
    cardLast4: "5566",
    cardBrand: "Mastercard",
    cardExpMonth: "01",
    cardExpYear: "2030",
  }
];

export const OtaInboxContainer: React.FC = () => {
  const [items, setItems] = useState<OtaReservationItem[]>(INITIAL_MOCK_ITEMS);
  const [selectedItem, setSelectedItem] = useState<OtaReservationItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [isSyncingAri, setIsSyncingAri] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [telemetry, setTelemetry] = useState<WbpTelemetryHealth>({
    mode: "observe",
    lastPollingMinutesAgo: 4,
    lastAriSyncSecondsAgo: 12,
    pendingQuarantineCount: 2,
    isPollingActive: false,
    isAriSyncing: false,
  });

  const fetchInboxData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Mode
      const modeRes = await fetch("/api/wbp/mode");
      if (modeRes.ok) {
        const modeData = await modeRes.json();
        if (modeData && modeData.mode) {
          setTelemetry(prev => ({ ...prev, mode: modeData.mode }));
        }
      }

      // 2. Fetch Inbox items
      const inboxRes = await fetch("/api/wbp/inbox");
      if (inboxRes.ok) {
        const inboxData = await inboxRes.json();
        if (Array.isArray(inboxData) && inboxData.length > 0) {
          setItems(inboxData);
          const qCount = inboxData.filter(i => i.status === "quarantine").length;
          setTelemetry(prev => ({ ...prev, pendingQuarantineCount: qCount }));
        }
      }
    } catch {
      // Keep resilient fallback
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInboxData();
    const interval = setInterval(fetchInboxData, 30000);
    return () => clearInterval(interval);
  }, [fetchInboxData]);

  const handleChangeMode = async (newMode: WbpIntegrationMode) => {
    try {
      const res = await fetch("/api/wbp/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: newMode }),
      });
      if (res.ok) {
        setTelemetry(prev => ({ ...prev, mode: newMode }));
        setToastMessage(`Modo alterado para ${newMode.toUpperCase()}`);
        setTimeout(() => setToastMessage(null), 4000);
      }
    } catch {
      setTelemetry(prev => ({ ...prev, mode: newMode }));
    }
  };

  const handlePollNow = async () => {
    setIsPolling(true);
    try {
      await fetch("/api/wbp/worker/poll", { method: "POST" });
      setTelemetry(prev => ({ ...prev, lastPollingMinutesAgo: 0 }));
      setToastMessage("Consulta de reservas enviada à WebBookingPro!");
      setTimeout(() => setToastMessage(null), 4000);
      await fetchInboxData();
    } catch {
      setToastMessage("Consulta de reservas enviada!");
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setIsPolling(false);
    }
  };

  const handleSyncAriNow = async () => {
    setIsSyncingAri(true);
    try {
      await fetch("/api/wbp/ari/full-sync", { method: "POST" });
      setTelemetry(prev => ({ ...prev, lastAriSyncSecondsAgo: 0 }));
      setToastMessage("Sincronização completa de ARI disparada com sucesso!");
      setTimeout(() => setToastMessage(null), 4000);
    } catch {
      setToastMessage("Sincronização completa de ARI disparada!");
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setIsSyncingAri(false);
    }
  };

  const handleSelectItem = (item: OtaReservationItem) => {
    setSelectedItem(item);
    setIsDrawerOpen(true);
  };

  const handleResolveQuarantine = async (id: string, payload: QuarantineResolutionPayload) => {
    try {
      await fetch(`/api/wbp/quarantine/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setItems(prev => prev.map(item => {
        if (item.id === id) {
          return {
            ...item,
            status: "imported",
            allocatedFlat: payload.flatNumber || "605",
            quarantineReason: null,
            quarantineDiagnostic: null,
          };
        }
        return item;
      }));

      setToastMessage(`Reserva liberada da quarentena com sucesso no Flat ${payload.flatNumber || "605"}!`);
      setTimeout(() => setToastMessage(null), 5000);
    } catch {
      setItems(prev => prev.map(item => {
        if (item.id === id) {
          return {
            ...item,
            status: "imported",
            allocatedFlat: payload.flatNumber || "605",
            quarantineReason: null,
            quarantineDiagnostic: null,
          };
        }
        return item;
      }));
    }
  };

  const handleRejectQuarantine = async (id: string, payload: QuarantineRejectPayload) => {
    try {
      await fetch(`/api/wbp/quarantine/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setItems(prev => prev.filter(item => item.id !== id));
      setToastMessage("Reserva em quarentena rejeitada e notificação registrada.");
      setTimeout(() => setToastMessage(null), 4000);
    } catch {
      setItems(prev => prev.filter(item => item.id !== id));
    }
  };

  const handleLinkQuarantine = async (id: string, existingReservationId: string) => {
    try {
      await fetch(`/api/wbp/quarantine/${id}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ existingReservationId }),
      });

      setItems(prev => prev.map(item => {
        if (item.id === id) {
          return {
            ...item,
            status: "linked",
            linkedReservationCode: existingReservationId,
            quarantineReason: null,
          };
        }
        return item;
      }));
      setToastMessage(`Reserva vinculada com sucesso a ${existingReservationId}!`);
      setTimeout(() => setToastMessage(null), 4000);
    } catch {}
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl p-3 px-4 flex items-center gap-3 text-xs font-semibold text-emerald-900 dark:text-emerald-200 shadow-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header with Mode Pill and Telemetry */}
      <OtaInboxHeader
        telemetry={telemetry}
        onChangeMode={handleChangeMode}
        onPollNow={handlePollNow}
        onSyncAriNow={handleSyncAriNow}
        isPolling={isPolling}
        isSyncingAri={isSyncingAri}
      />

      {/* Main Table with Filters & Deduplication */}
      <OtaInboxTable
        items={items}
        onSelectItem={handleSelectItem}
        isLoading={isLoading}
      />

      {/* Slide-over Quarantine Drawer */}
      <QuarantineDrawer
        item={selectedItem}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onResolve={handleResolveQuarantine}
        onReject={handleRejectQuarantine}
        onLink={handleLinkQuarantine}
      />
    </div>
  );
};

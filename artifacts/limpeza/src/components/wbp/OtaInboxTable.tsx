import React, { useState, useMemo } from "react";
import { 
  Inbox, 
  Calendar, 
  CreditCard, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Link2, 
  Eye, 
  Search,
  ExternalLink,
  ShieldAlert,
  Coffee,
  Layers,
  ArrowRight
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { OtaReservationItem } from "./types";

interface OtaInboxTableProps {
  items: OtaReservationItem[];
  onSelectItem: (item: OtaReservationItem) => void;
  isLoading: boolean;
}

type FilterTab = "all" | "imported" | "quarantine" | "linked" | "cancelled";

export const OtaInboxTable: React.FC<OtaInboxTableProps> = ({
  items,
  onSelectItem,
  isLoading,
}) => {
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Deduplication guarantee: Keep only the latest entry per external orderId / channelReservationId
  const deduplicatedItems = useMemo(() => {
    const seen = new Map<string, OtaReservationItem>();
    for (const item of items) {
      const key = item.orderId || item.channelReservationId || item.id;
      if (!seen.has(key)) {
        seen.set(key, item);
      }
    }
    return Array.from(seen.values());
  }, [items]);

  // Counts per status
  const counts = useMemo(() => {
    return {
      all: deduplicatedItems.length,
      imported: deduplicatedItems.filter(i => i.status === "imported").length,
      quarantine: deduplicatedItems.filter(i => i.status === "quarantine").length,
      linked: deduplicatedItems.filter(i => i.status === "linked").length,
      cancelled: deduplicatedItems.filter(i => i.status === "cancelled").length,
    };
  }, [deduplicatedItems]);

  // Filtered items by tab and search
  const filteredItems = useMemo(() => {
    return deduplicatedItems.filter(item => {
      // Tab filter
      if (filterTab === "imported" && item.status !== "imported") return false;
      if (filterTab === "quarantine" && item.status !== "quarantine") return false;
      if (filterTab === "linked" && item.status !== "linked") return false;
      if (filterTab === "cancelled" && item.status !== "cancelled") return false;

      // Text search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesGuest = (item.guestName || "").toLowerCase().includes(query);
        const matchesOrder =
          (item.orderId || "").toLowerCase().includes(query) ||
          (item.channelReservationId || "").toLowerCase().includes(query);
        const matchesFlat = item.allocatedFlat?.toLowerCase().includes(query);
        return matchesGuest || matchesOrder || matchesFlat;
      }
      return true;
    });
  }, [deduplicatedItems, filterTab, searchQuery]);

  const renderChannelBadge = (channel: string) => {
    const clean = (channel || "").toLowerCase();
    if (clean.includes("booking")) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-[#003580] text-white">
          Booking.com
        </span>
      );
    }
    if (clean.includes("airbnb")) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-[#FF385C] text-white">
          Airbnb
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-muted text-muted-foreground border border-border">
        {channel || "Canal"}
      </span>
    );
  };

  const renderPaymentBadge = (paymentCollect: string) => {
    if (paymentCollect === "Channel") {
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold">
          Pago pela OTA
        </Badge>
      );
    }
    return (
      <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold gap-1 animate-pulse">
        <AlertTriangle className="w-2.5 h-2.5" />
        Cobrar no hotel
      </Badge>
    );
  };

  const renderStatusBadge = (item: OtaReservationItem) => {
    if (item.status === "quarantine") {
      return (
        <Badge className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold gap-1">
          <ShieldAlert className="w-3 h-3" />
          Quarentena: {item.quarantineReason || "Conflito"}
        </Badge>
      );
    }
    if (item.status === "linked") {
      return (
        <Badge variant="outline" className="text-sky-700 dark:text-sky-300 border-sky-400 bg-sky-50 dark:bg-sky-950/40 text-[10px] font-bold gap-1">
          <Link2 className="w-3 h-3" />
          Vinculada {item.linkedReservationCode ? `a ${item.linkedReservationCode}` : ""}
        </Badge>
      );
    }
    if (item.status === "cancelled") {
      return (
        <Badge variant="secondary" className="text-muted-foreground text-[10px] font-bold gap-1">
          <XCircle className="w-3 h-3" />
          Cancelada pela OTA
        </Badge>
      );
    }
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold gap-1">
        <CheckCircle2 className="w-3 h-3" />
        Importada
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFilterTab("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterTab === "all"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            Todas ({counts.all})
          </button>
          <button
            onClick={() => setFilterTab("imported")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterTab === "imported"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            Importadas ({counts.imported})
          </button>
          <button
            onClick={() => setFilterTab("quarantine")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterTab === "quarantine"
                ? "bg-rose-600 text-white shadow-xs"
                : counts.quarantine > 0
                  ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            Quarentena
            {counts.quarantine > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                filterTab === "quarantine" ? "bg-white text-rose-700" : "bg-rose-600 text-white"
              }`}>
                {counts.quarantine}
              </span>
            )}
          </button>
          <button
            onClick={() => setFilterTab("linked")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterTab === "linked"
                ? "bg-sky-600 text-white shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            Vinculadas ({counts.linked})
          </button>
          <button
            onClick={() => setFilterTab("cancelled")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterTab === "cancelled"
                ? "bg-muted-foreground text-background shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            Canceladas ({counts.cancelled})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por hóspede, nº OTA ou flat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-xs h-8"
          />
        </div>
      </div>

      {/* Main Deduplicated Reservations Table */}
      <div className="border border-border rounded-xl overflow-hidden bg-card shadow-xs">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 text-xs">
                <TableHead className="w-24 font-bold">Recebida</TableHead>
                <TableHead className="w-28 font-bold">Canal</TableHead>
                <TableHead className="w-28 font-bold">Nº OTA</TableHead>
                <TableHead className="font-bold">Hóspede</TableHead>
                <TableHead className="font-bold">Datas da Estadia</TableHead>
                <TableHead className="w-24 font-bold">Plano</TableHead>
                <TableHead className="w-32 font-bold">Pagamento</TableHead>
                <TableHead className="font-bold">Status</TableHead>
                <TableHead className="w-16 text-center font-bold">Flat</TableHead>
                <TableHead className="w-20 text-right font-bold">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground text-xs">
                    {isLoading ? "Carregando reservas das OTAs..." : "Nenhuma reserva encontrada para este filtro."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => {
                  const isQuarantine = item.status === "quarantine";
                  return (
                    <TableRow 
                      key={item.id}
                      className={`text-xs transition-colors cursor-pointer ${
                        isQuarantine
                          ? "bg-rose-50/40 dark:bg-rose-950/20 hover:bg-rose-50/70 dark:hover:bg-rose-950/30"
                          : "hover:bg-muted/30"
                      }`}
                      onClick={() => onSelectItem(item)}
                    >
                      {/* Recebida */}
                      <TableCell className="font-mono text-muted-foreground whitespace-nowrap">
                        {item.receivedAt}
                      </TableCell>

                      {/* Canal */}
                      <TableCell>
                        {renderChannelBadge(item.channel)}
                      </TableCell>

                      {/* Nº OTA */}
                      <TableCell className="font-mono font-semibold text-foreground">
                        {item.channelReservationId || item.orderId}
                      </TableCell>

                      {/* Hóspede */}
                      <TableCell className="font-bold text-foreground">
                        {item.guestName}
                        {item.guestCount && item.guestCount > 1 && (
                          <span className="text-[10px] text-muted-foreground font-normal ml-1">
                            ({item.guestCount} pess.)
                          </span>
                        )}
                      </TableCell>

                      {/* Datas */}
                      <TableCell className="whitespace-nowrap font-medium text-foreground">
                        {item.checkIn} → {item.checkOut}
                        <span className="text-[11px] text-muted-foreground ml-1">
                          ({item.nightsCount} noites)
                        </span>
                      </TableCell>

                      {/* Plano */}
                      <TableCell>
                        <span className="inline-flex items-center gap-1 font-medium">
                          {item.planId === "com_cafe" ? (
                            <>
                              <Coffee className="w-3 h-3 text-amber-600" />
                              Com café
                            </>
                          ) : (
                            <>
                              <Layers className="w-3 h-3 text-muted-foreground" />
                              Sem café
                            </>
                          )}
                        </span>
                      </TableCell>

                      {/* Pagamento */}
                      <TableCell>
                        {renderPaymentBadge(item.paymentCollect)}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        {renderStatusBadge(item)}
                      </TableCell>

                      {/* Flat */}
                      <TableCell className="text-center font-black text-foreground">
                        {item.allocatedFlat ? (
                          <span className="px-1.5 py-0.5 rounded bg-muted font-mono">
                            {item.allocatedFlat}
                          </span>
                        ) : (
                          <span className="text-muted-foreground font-mono">—</span>
                        )}
                      </TableCell>

                      {/* Ações */}
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectItem(item);
                          }}
                          className="h-7 text-xs px-2 gap-1 text-primary hover:text-primary hover:bg-primary/10"
                        >
                          {isQuarantine ? "Resolver" : "Ver"}
                          <ArrowRight className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

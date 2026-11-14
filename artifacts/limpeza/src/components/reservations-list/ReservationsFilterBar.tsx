import React, { useState } from "react";
import {
  Search,
  X,
  SlidersHorizontal,
  Bookmark,
  Plus,
  Trash2,
  Columns3,
  Coffee,
  IdCard,
  FileText,
  Building2,
  RotateCcw,
} from "lucide-react";
import { format, subDays, addDays, startOfMonth, endOfMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  QuickTabKey,
  ReservationListFilters,
  DEFAULT_RESERVATION_FILTERS,
  SavedFilterView,
  SYSTEM_SAVED_VIEWS,
  TableDensity,
  OptionalColumnKey,
  OPTIONAL_COLUMNS_META,
  FlatSummaryItem,
  DateFilterTarget,
} from "./types";

interface TabCounts {
  all: number;
  arrivals_today: number;
  in_house: number;
  departures_today: number;
  pre_reservations: number;
  quarantine: number;
  cancelled_expired: number;
}

interface ReservationsFilterBarProps {
  filters: ReservationListFilters;
  onChangeFilters: (updater: (prev: ReservationListFilters) => ReservationListFilters) => void;
  tabCounts: TabCounts;
  flats: FlatSummaryItem[];
  density: TableDensity;
  onChangeDensity: (d: TableDensity) => void;
  visibleColumns: OptionalColumnKey[];
  onToggleColumn: (col: OptionalColumnKey) => void;
  customViews: SavedFilterView[];
  onSaveCustomView: (name: string) => void;
  onDeleteCustomView: (id: string) => void;
  onApplySavedView: (view: SavedFilterView) => void;
}

export const ReservationsFilterBar: React.FC<ReservationsFilterBarProps> = ({
  filters,
  onChangeFilters,
  tabCounts,
  flats,
  density,
  onChangeDensity,
  visibleColumns,
  onToggleColumn,
  customViews,
  onSaveCustomView,
  onDeleteCustomView,
  onApplySavedView,
}) => {
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");

  const tabs: { key: QuickTabKey; label: string; count: number; urgent?: boolean }[] = [
    { key: "all", label: "Todas", count: tabCounts.all },
    { key: "arrivals_today", label: "Chegadas Hoje", count: tabCounts.arrivals_today },
    { key: "in_house", label: "Hospedados", count: tabCounts.in_house },
    { key: "departures_today", label: "Saídas Hoje", count: tabCounts.departures_today },
    { key: "pre_reservations", label: "⏳ Pré-Reservas", count: tabCounts.pre_reservations },
    {
      key: "quarantine",
      label: "⚠️ Quarentena OTA",
      count: tabCounts.quarantine,
      urgent: tabCounts.quarantine > 0,
    },
    { key: "cancelled_expired", label: "Canceladas / Expiradas", count: tabCounts.cancelled_expired },
  ];

  const handlePresetChange = (preset: ReservationListFilters["datePreset"]) => {
    const now = new Date();
    let start = "";
    let end = "";
    if (preset === "today") {
      start = format(now, "yyyy-MM-dd");
      end = start;
    } else if (preset === "last_7d") {
      start = format(subDays(now, 7), "yyyy-MM-dd");
      end = format(now, "yyyy-MM-dd");
    } else if (preset === "this_month") {
      start = format(startOfMonth(now), "yyyy-MM-dd");
      end = format(endOfMonth(now), "yyyy-MM-dd");
    } else if (preset === "next_30d") {
      start = format(now, "yyyy-MM-dd");
      end = format(addDays(now, 30), "yyyy-MM-dd");
    }

    onChangeFilters((prev) => ({
      ...prev,
      datePreset: preset,
      startDate: preset === "custom" ? prev.startDate : start,
      endDate: preset === "custom" ? prev.endDate : end,
    }));
  };

  const hasAnyActiveFilter =
    filters.tab !== "all" ||
    Boolean(filters.search.trim()) ||
    filters.channel !== "all" ||
    filters.flatNumber !== "all" ||
    filters.financial !== "all" ||
    filters.datePreset !== "all" ||
    Boolean(filters.startDate) ||
    Boolean(filters.endDate) ||
    filters.onlyWithBreakfast ||
    filters.onlyPendingFnrh ||
    filters.onlyPendingNfse ||
    filters.onlyCorporate;

  const allSavedViews = [...SYSTEM_SAVED_VIEWS, ...customViews];

  const handleConfirmSaveView = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newViewName.trim()) return;
    onSaveCustomView(newViewName.trim());
    setNewViewName("");
    setSaveViewOpen(false);
  };

  return (
    <div className="rounded-2xl border border-border/80 bg-card shadow-2xs p-3 sm:p-4 space-y-3">
      <style>{`
        @property --gfm-fade-start {
          syntax: "<length>";
          inherits: false;
          initial-value: 0px;
        }
        @property --gfm-fade-end {
          syntax: "<length>";
          inherits: false;
          initial-value: 0px;
        }
        .gfm-tabs-fade-scroller {
          overflow-x: auto;
          scrollbar-width: thin;
          --fade-size: 2.25rem;
          scroll-padding-inline: var(--fade-size);
          mask:
            linear-gradient(black, black) no-clip subtract,
            linear-gradient(to right, black, transparent) 0 0 / var(--gfm-fade-start) 100% no-repeat no-clip,
            linear-gradient(to right, transparent, black) 100% 0 / var(--gfm-fade-end) 100% no-repeat no-clip;
          animation: gfm-reveal-fade-start linear both, gfm-hide-fade-end linear both;
          animation-timeline: scroll(self inline);
          animation-range: 0 var(--fade-size), calc(100% - var(--fade-size)) 100%;
        }
        @keyframes gfm-reveal-fade-start {
          to { --gfm-fade-start: var(--fade-size); }
        }
        @keyframes gfm-hide-fade-end {
          from { --gfm-fade-end: var(--fade-size); }
        }
      `}</style>
      {/* 1. Abas Rápidas de Status com Fade Horizontal */}
      <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-2.5">
        <div className="flex items-center gap-1.5 py-0.5 pr-4 max-w-full gfm-tabs-fade-scroller">
          {tabs.map((t) => {
            const active = filters.tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onChangeFilters((prev) => ({ ...prev, tab: t.key }))}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  active
                    ? t.urgent
                      ? "bg-rose-600 text-white shadow-xs"
                      : "bg-primary text-primary-foreground shadow-xs"
                    : t.urgent
                      ? "bg-rose-50 text-rose-700 border border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 hover:bg-rose-100/70"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
                }`}
              >
                <span>{t.label}</span>
                <span
                  className={`inline-flex items-center justify-center min-w-[20px] h-4 px-1.5 rounded-full text-[10px] font-black ${
                    active
                      ? "bg-white/20 text-current"
                      : t.urgent
                        ? "bg-rose-600 text-white animate-pulse"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Botão Colunas & Densidade (Estilo Hostaway / Cloudbeds) */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-bold gap-1.5 shrink-0 rounded-xl"
              title="Personalizar colunas visíveis e densidade das linhas"
            >
              <Columns3 className="w-3.5 h-3.5 text-primary" />
              <span className="hidden sm:inline">Colunas & Densidade</span>
              {visibleColumns.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  +{visibleColumns.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-3.5 space-y-3.5">
            <div className="space-y-1.5">
              <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Densidade das Linhas
              </div>
              <div className="grid grid-cols-2 gap-1.5 bg-muted/50 p-1 rounded-xl border">
                <button
                  type="button"
                  onClick={() => onChangeDensity("comfortable")}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    density === "comfortable"
                      ? "bg-background text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Confortável
                </button>
                <button
                  type="button"
                  onClick={() => onChangeDensity("compact")}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    density === "compact"
                      ? "bg-background text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Compacta (Alta)
                </button>
              </div>
            </div>

            <div className="space-y-2 border-t pt-3">
              <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Colunas Extras Opcionais
              </div>
              <div className="space-y-2">
                {OPTIONAL_COLUMNS_META.map((col) => {
                  const checked = visibleColumns.includes(col.key);
                  return (
                    <label
                      key={col.key}
                      className="flex items-start gap-2.5 cursor-pointer group"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => onToggleColumn(col.key)}
                        className="mt-0.5"
                      />
                      <div className="leading-tight">
                        <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                          {col.label}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {col.description}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* 2. Linha Principal de Busca + Seletores Combináveis */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2">
        {/* Busca Global */}
        <div className="relative sm:col-span-2 lg:col-span-4">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={filters.search}
            onChange={(e) =>
              onChangeFilters((prev) => ({ ...prev, search: e.target.value }))
            }
            placeholder="Buscar hóspede, código RES, ID OTA, WhatsApp, CPF, empresa, placa ou flat..."
            className="h-9 pl-8 pr-8 text-xs rounded-xl"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onChangeFilters((prev) => ({ ...prev, search: "" }))}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Canal */}
        <div className="lg:col-span-2">
          <Select
            value={filters.channel}
            onValueChange={(val) =>
              onChangeFilters((prev) => ({ ...prev, channel: val }))
            }
          >
            <SelectTrigger className="h-9 text-xs rounded-xl">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs font-semibold">
                Todos os Canais
              </SelectItem>
              <SelectItem value="site" className="text-xs">
                🌐 Site Próprio
              </SelectItem>
              <SelectItem value="whatsapp" className="text-xs">
                💬 WhatsApp / Direto
              </SelectItem>
              <SelectItem value="booking" className="text-xs">
                🏨 Booking.com
              </SelectItem>
              <SelectItem value="airbnb" className="text-xs">
                🏠 Airbnb
              </SelectItem>
              <SelectItem value="b2b" className="text-xs">
                🏢 B2B / Agência
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Flat */}
        <div className="lg:col-span-2">
          <Select
            value={filters.flatNumber}
            onValueChange={(val) =>
              onChangeFilters((prev) => ({ ...prev, flatNumber: val }))
            }
          >
            <SelectTrigger className="h-9 text-xs rounded-xl">
              <SelectValue placeholder="Apartamento" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value="all" className="text-xs font-semibold">
                Todos os Flats
              </SelectItem>
              {flats.map((fl) => (
                <SelectItem key={fl.id} value={fl.number} className="text-xs">
                  Flat {fl.number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Financeiro */}
        <div className="lg:col-span-2">
          <Select
            value={filters.financial}
            onValueChange={(val) =>
              onChangeFilters((prev) => ({ ...prev, financial: val }))
            }
          >
            <SelectTrigger className="h-9 text-xs rounded-xl">
              <SelectValue placeholder="Financeiro" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs font-semibold">
                Financeiro: Todos
              </SelectItem>
              <SelectItem value="has_balance" className="text-xs">
                ⏳ Com Saldo a Receber
              </SelectItem>
              <SelectItem value="paid" className="text-xs">
                ✓ 100% Quitadas / OTA
              </SelectItem>
              <SelectItem value="cobrar_hotel" className="text-xs">
                🏨 Cobrar no Hotel (OTA)
              </SelectItem>
              <SelectItem value="faturado_pj" className="text-xs">
                🏢 Faturado PJ / Boleto
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Período Rápido */}
        <div className="lg:col-span-2">
          <Select
            value={filters.datePreset}
            onValueChange={(val) =>
              handlePresetChange(val as ReservationListFilters["datePreset"])
            }
          >
            <SelectTrigger className="h-9 text-xs rounded-xl">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs font-semibold">
                Qualquer Data
              </SelectItem>
              <SelectItem value="today" className="text-xs">
                Hoje
              </SelectItem>
              <SelectItem value="last_7d" className="text-xs">
                Últimos 7 dias
              </SelectItem>
              <SelectItem value="this_month" className="text-xs">
                Mês Atual
              </SelectItem>
              <SelectItem value="next_30d" className="text-xs">
                Próximos 30 dias
              </SelectItem>
              <SelectItem value="custom" className="text-xs font-semibold text-primary">
                📅 Período Personalizado...
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Seletor de Tipo de Data & Datas Customizadas (exibido quando há filtro de período ativo) */}
      {filters.datePreset !== "all" && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs bg-muted/30 p-2.5 rounded-xl border border-border/60">
          <SlidersHorizontal className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="font-bold text-muted-foreground">Filtrar data por:</span>
          <Select
            value={filters.dateTarget}
            onValueChange={(val) =>
              onChangeFilters((prev) => ({
                ...prev,
                dateTarget: val as DateFilterTarget,
              }))
            }
          >
            <SelectTrigger className="h-8 w-48 text-xs rounded-lg bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="receivedAt" className="text-xs">
                Data que caiu no sistema
              </SelectItem>
              <SelectItem value="checkinDate" className="text-xs">
                Data de Check-in
              </SelectItem>
              <SelectItem value="checkoutDate" className="text-xs">
                Data de Check-out
              </SelectItem>
            </SelectContent>
          </Select>

          <Input
            type="date"
            value={filters.startDate}
            onChange={(e) =>
              onChangeFilters((prev) => ({
                ...prev,
                datePreset: "custom",
                startDate: e.target.value,
              }))
            }
            className="h-8 w-34 text-xs rounded-lg bg-background"
          />
          <span className="text-muted-foreground">até</span>
          <Input
            type="date"
            value={filters.endDate}
            onChange={(e) =>
              onChangeFilters((prev) => ({
                ...prev,
                datePreset: "custom",
                endDate: e.target.value,
              }))
            }
            className="h-8 w-34 text-xs rounded-lg bg-background"
          />
        </div>
      )}

      {/* 3. Barra Inferior: Chips Rápidos + Visões Salvas (Estilo Hostaway) + Reset */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Chips Operacionais Rápidos */}
          <button
            type="button"
            onClick={() =>
              onChangeFilters((prev) => ({
                ...prev,
                onlyWithBreakfast: !prev.onlyWithBreakfast,
              }))
            }
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
              filters.onlyWithBreakfast
                ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-400 font-bold"
                : "bg-background text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            <Coffee className="w-3 h-3" />
            Com Café
          </button>

          <button
            type="button"
            onClick={() =>
              onChangeFilters((prev) => ({
                ...prev,
                onlyPendingFnrh: !prev.onlyPendingFnrh,
              }))
            }
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
              filters.onlyPendingFnrh
                ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-400 font-bold"
                : "bg-background text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            <IdCard className="w-3 h-3" />
            Sem FNRH
          </button>

          <button
            type="button"
            onClick={() =>
              onChangeFilters((prev) => ({
                ...prev,
                onlyPendingNfse: !prev.onlyPendingNfse,
              }))
            }
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
              filters.onlyPendingNfse
                ? "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-400 font-bold"
                : "bg-background text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            <FileText className="w-3 h-3" />
            Sem NFS-e
          </button>

          <button
            type="button"
            onClick={() =>
              onChangeFilters((prev) => ({
                ...prev,
                onlyCorporate: !prev.onlyCorporate,
              }))
            }
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
              filters.onlyCorporate
                ? "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-400 font-bold"
                : "bg-background text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            <Building2 className="w-3 h-3" />
            B2B / Empresas
          </button>

          <span className="text-border mx-0.5 hidden sm:inline">|</span>

          {/* Visões Salvas / Favoritos */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/25 hover:bg-primary/15 transition-colors cursor-pointer"
              >
                <Bookmark className="w-3 h-3" />
                Visões Salvas ({allSavedViews.length})
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-2.5 space-y-1.5">
              <div className="text-[11px] font-black uppercase tracking-wider text-muted-foreground px-1.5 py-0.5">
                Atalhos Inteligentes (Hostaway Style)
              </div>
              {allSavedViews.map((view) => (
                <div
                  key={view.id}
                  className="flex items-center justify-between gap-1 rounded-lg hover:bg-muted/70 px-2 py-1.5 group"
                >
                  <button
                    type="button"
                    onClick={() => onApplySavedView(view)}
                    className="text-xs font-semibold text-left flex-1 truncate cursor-pointer group-hover:text-primary"
                  >
                    {view.name}
                  </button>
                  {!view.isSystem && (
                    <button
                      type="button"
                      onClick={() => onDeleteCustomView(view.id)}
                      className="text-muted-foreground hover:text-rose-600 p-0.5 cursor-pointer"
                      title="Excluir filtro salvo"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </PopoverContent>
          </Popover>

          {hasAnyActiveFilter && (
            <Popover open={saveViewOpen} onOpenChange={setSaveViewOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  Salvar Filtro Atual
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-3">
                <form onSubmit={handleConfirmSaveView} className="space-y-2.5">
                  <Label className="text-xs font-bold">Nome do Filtro Favorito</Label>
                  <Input
                    value={newViewName}
                    onChange={(e) => setNewViewName(e.target.value)}
                    placeholder="Ex: Booking do Mês s/ NF"
                    className="h-8 text-xs"
                    autoFocus
                  />
                  <Button type="submit" size="sm" className="w-full h-8 text-xs font-bold">
                    Salvar nos Favoritos
                  </Button>
                </form>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {hasAnyActiveFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChangeFilters(() => ({ ...DEFAULT_RESERVATION_FILTERS }))}
            className="h-7 px-2.5 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 gap-1 rounded-lg"
          >
            <RotateCcw className="w-3 h-3" />
            Limpar Filtros
          </Button>
        )}
      </div>
    </div>
  );
};

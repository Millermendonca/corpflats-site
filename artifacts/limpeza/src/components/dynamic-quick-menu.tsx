import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import {
  Menu,
  Pin,
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Minimize2,
  Maximize2,
  Rows2,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { canonicalizeRoute, UserMenuPreferences } from "@/lib/permissions";
import { useBackLayer, navigateFromOverlay } from "@/lib/back-navigation";

export interface QuickMenuItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: any;
  badge?: number | string | null;
  description?: string;
}

export interface QuickMenuState {
  visibleCount: number;
  pinnedModules: string[];
  usageCounts: Record<string, number>;
  lastUsedAt: Record<string, number>;
  desktopMode: "single_line" | "expanded" | "pill";
  mobileMode: "single_line" | "pill";
  updatedAt: number;
}

const SHORT_LABELS: Record<string, string> = {
  "/reservas": "Reservas",
  "/painel-aovivo": "Ao Vivo",
  "/caixa-entrada-ota": "OTA Inbox",
  "/relatorios-reservas": "Ocupação",
  "/crm": "Hóspedes",
  "/portaria": "Portaria",
  "/pedidos-cafe": "Café",
  "/relatorios-cafe": "Rel. Café",
  "/reservar": "Site Direto",
  "/whatsapp-chat": "WhatsApp",
  "/disparo-inteligente": "Disparos",
  "/whatsapp": "Auto. WA",
  "/emails": "E-mails",
  "/notificacoes": "Alertas",
  "/dashboard": "Limpeza",
  "/raio-x-flats": "Raio-X",
  "/reports": "Extrato PIX",
  "/lista-compras": "Compras",
  "/observations": "Avarias",
  "/tasks": "Tarefas",
  "/surveys": "Vistorias",
  "/servicos": "OS / Manut.",
  "/achados-perdidos": "Achados",
  "/automacoes-camareiras": "Auto. Cam.",
  "/financeiro": "Financeiro",
  "/tarifas": "Tarifas",
  "/pagamentos": "Pagamentos",
  "/notas": "Notas NFS-e",
  "/funil-vendas": "Funil IA",
  "/equipe": "Equipe",
  "/rh": "RH & Ponto",
  "/propriedade": "Propriedade",
  "/garagem": "Garagem",
  "/avaliacoes-ia": "Avaliações",
  "/editor-site": "Editor Site",
  "/frigobar": "Frigobar",
  "/anserve": "Anserve",
  "/frigobar-notas": "NF Frigobar",
  "/frigobar-reposicao": "Reposição",
  "/frigobar-gestao": "Est. Frigobar",
  "/configuracoes": "Integrações",
  "/zapi-conexao": "Z-API",
  "/jornada-reservas": "Jornada",
  "/monitor-servidor": "Servidor",
  "/ia-status": "Status IA",
  "/logs": "Auditoria",
};

// Ordem inicial inteligente para quando o usuário ainda não acumulou cliques
const INITIAL_PRIORITY_ORDER: string[] = [
  "/reservas",
  "/crm",
  "/dashboard",
  "/reports",
  "/notas",
  "/financeiro",
  "/pagamentos",
  "/whatsapp-chat",
  "/pedidos-cafe",
  "/portaria",
  "/garagem",
  "/caixa-entrada-ota",
  "/tarifas",
  "/observations",
  "/tasks",
  "/lista-compras",
  "/automacoes-camareiras",
  "/achados-perdidos",
];

export function getShortModuleLabel(href: string, fallbackLabel: string): string {
  const canonical = canonicalizeRoute(href);
  if (SHORT_LABELS[canonical]) return SHORT_LABELS[canonical];
  return fallbackLabel.split("(")[0].trim();
}

/**
 * Ordena os módulos acessíveis colocando primeiro os fixados (📌 na ordem escolhida)
 * e em seguida os mais usados pelo usuário (com desempate por uso mais recente e prioridade operacional).
 */
export function sortQuickMenuModules<T extends { href: string }>(
  items: T[],
  pinnedModules: string[],
  usageCounts: Record<string, number>,
  lastUsedAt: Record<string, number>
): T[] {
  const byHref = new Map<string, T>();
  const originalIndex = new Map<string, number>();

  items.forEach((item, idx) => {
    const canon = canonicalizeRoute(item.href);
    if (!byHref.has(canon)) {
      byHref.set(canon, item);
      originalIndex.set(canon, idx);
    }
  });

  const pinnedCanonical: string[] = [];
  const pinnedSet = new Set<string>();
  for (const raw of pinnedModules || []) {
    const canon = canonicalizeRoute(raw);
    if (byHref.has(canon) && !pinnedSet.has(canon)) {
      pinnedSet.add(canon);
      pinnedCanonical.push(canon);
    }
  }

  const unpinned: T[] = [];
  for (const [canon, item] of byHref.entries()) {
    if (!pinnedSet.has(canon)) {
      unpinned.push(item);
    }
  }

  unpinned.sort((a, b) => {
    const ca = canonicalizeRoute(a.href);
    const cb = canonicalizeRoute(b.href);

    const countA = Number(usageCounts?.[ca] || 0);
    const countB = Number(usageCounts?.[cb] || 0);
    if (countB !== countA) return countB - countA;

    const lastA = Number(lastUsedAt?.[ca] || 0);
    const lastB = Number(lastUsedAt?.[cb] || 0);
    if (lastB !== lastA) return lastB - lastA;

    const prioA = INITIAL_PRIORITY_ORDER.indexOf(ca);
    const prioB = INITIAL_PRIORITY_ORDER.indexOf(cb);
    if (prioA !== -1 && prioB !== -1) return prioA - prioB;
    if (prioA !== -1) return -1;
    if (prioB !== -1) return 1;

    return (originalIndex.get(ca) ?? 999) - (originalIndex.get(cb) ?? 999);
  });

  const pinnedItems = pinnedCanonical.map((c) => byHref.get(c)!).filter(Boolean);
  return [...pinnedItems, ...unpinned];
}

function buildStorageKey(user: any): string {
  const keyPart = user?.id || user?.username || "default";
  return `gfm_quick_menu_v1_${String(keyPart).toLowerCase()}`;
}

function getDefaultVisibleCount(user: any, totalAccessible: number): number {
  if (totalAccessible <= 0) return 1;
  const role = String(user?.role || "").toLowerCase();
  if (role === "camareira" || role === "anserve_repositora" || role === "anserve_gestor") {
    return Math.min(5, totalAccessible);
  }
  return Math.min(8, totalAccessible);
}

function loadInitialQuickMenuState(user: any, totalAccessible: number): QuickMenuState {
  const fallbackCount = getDefaultVisibleCount(user, totalAccessible);
  const base: QuickMenuState = {
    visibleCount: fallbackCount,
    pinnedModules: [],
    usageCounts: {},
    lastUsedAt: {},
    desktopMode: "single_line",
    mobileMode: "single_line",
    updatedAt: 0,
  };

  let localParsed: Partial<QuickMenuState> | null = null;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(buildStorageKey(user));
      if (raw) {
        localParsed = JSON.parse(raw);
      }
    } catch {}
  }

  const serverPrefs = (user?.menuPreferences || null) as (UserMenuPreferences & { updatedAt?: number }) | null;
  const localUpdated = Number(localParsed?.updatedAt || 0);
  const serverUpdated = Number(serverPrefs?.updatedAt || 0);

  const chosen: any =
    serverPrefs && serverUpdated > localUpdated
      ? { ...localParsed, ...serverPrefs }
      : { ...serverPrefs, ...localParsed };

  if (!chosen) return base;

  return {
    visibleCount:
      typeof chosen.visibleCount === "number" && chosen.visibleCount >= 1
        ? chosen.visibleCount
        : fallbackCount,
    pinnedModules: Array.isArray(chosen.pinnedModules) ? chosen.pinnedModules : [],
    usageCounts:
      chosen.usageCounts && typeof chosen.usageCounts === "object" ? chosen.usageCounts : {},
    lastUsedAt:
      chosen.lastUsedAt && typeof chosen.lastUsedAt === "object" ? chosen.lastUsedAt : {},
    desktopMode:
      chosen.desktopMode === "expanded" || chosen.desktopMode === "pill"
        ? chosen.desktopMode
        : "single_line",
    mobileMode: chosen.mobileMode === "pill" ? "pill" : "single_line",
    updatedAt: Math.max(localUpdated, serverUpdated),
  };
}

export function useDynamicQuickMenu(
  effectiveUser: any,
  accessibleItems: QuickMenuItem[],
  location: string
) {
  const queryClient = useQueryClient();
  const userIdentity = `${effectiveUser?.id || ""}_${effectiveUser?.username || ""}`;
  const [state, setState] = useState<QuickMenuState>(() =>
    loadInitialQuickMenuState(effectiveUser, accessibleItems.length)
  );
  const [pinEditMode, setPinEditMode] = useState(false);
  const [mobileGridOpen, setMobileGridOpen] = useState(false);

  const syncTimerRef = useRef<any>(null);
  const pendingSyncPayloadRef = useRef<QuickMenuState | null>(null);
  const lastTrackedModuleRef = useRef<string>("");

  const flushPendingServerSync = useCallback((useKeepalive = false) => {
    const payload = pendingSyncPayloadRef.current;
    if (!payload) return;
    pendingSyncPayloadRef.current = null;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    try {
      fetch("/api/auth/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        keepalive: useKeepalive,
        body: JSON.stringify({ menuPreferences: payload }),
      }).catch(() => {});
    } catch {}
  }, []);

  // Re-hydrate when user identity changes (e.g. login / account switch)
  useEffect(() => {
    if (!effectiveUser) return;
    setState(loadInitialQuickMenuState(effectiveUser, accessibleItems.length));
  }, [userIdentity]);

  const persistState = useCallback(
    (next: QuickMenuState, immediateServerSync = false) => {
      if (!effectiveUser || typeof window === "undefined") return;
      try {
        localStorage.setItem(buildStorageKey(effectiveUser), JSON.stringify(next));
      } catch {}

      // Only sync to server for real session users (skip anonymous pin routes without session cookie)
      if (!effectiveUser?.id) return;

      // Keep React Query /api/auth/me cache in sync so Shell remounts never revert to stale server prefs
      queryClient.setQueryData(getGetMeQueryKey(), (old: any) =>
        old && typeof old === "object" ? { ...old, menuPreferences: next } : old
      );

      pendingSyncPayloadRef.current = next;
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
      syncTimerRef.current = setTimeout(
        () => {
          flushPendingServerSync(false);
        },
        immediateServerSync ? 350 : 2200
      );
    },
    [effectiveUser, queryClient, flushPendingServerSync]
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPendingServerSync(true);
      }
    };
    const handlePageHide = () => {
      flushPendingServerSync(true);
    };
    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      flushPendingServerSync(true);
    };
  }, [flushPendingServerSync]);

  // Track usage automatically whenever user navigates to a module
  useEffect(() => {
    if (!effectiveUser || accessibleItems.length === 0) return;
    const canon = canonicalizeRoute(location);
    if (!canon || canon === "/login") return;

    const isKnownModule = accessibleItems.some(
      (item) => canonicalizeRoute(item.href) === canon
    );
    if (!isKnownModule) return;

    if (lastTrackedModuleRef.current === canon) return;
    lastTrackedModuleRef.current = canon;

    setState((prev) => {
      const next: QuickMenuState = {
        ...prev,
        usageCounts: {
          ...prev.usageCounts,
          [canon]: Number(prev.usageCounts[canon] || 0) + 1,
        },
        lastUsedAt: {
          ...prev.lastUsedAt,
          [canon]: Date.now(),
        },
        updatedAt: Date.now(),
      };
      persistState(next, false);
      return next;
    });
  }, [location, effectiveUser, accessibleItems.length, persistState]);

  const maxCount = Math.max(1, accessibleItems.length);
  const effectiveVisibleCount = Math.min(Math.max(1, state.visibleCount), maxCount);

  const orderedItems = useMemo(
    () =>
      sortQuickMenuModules(
        accessibleItems,
        state.pinnedModules,
        state.usageCounts,
        state.lastUsedAt
      ),
    [accessibleItems, state.pinnedModules, state.usageCounts, state.lastUsedAt]
  );

  const visibleItems = useMemo(
    () => orderedItems.slice(0, effectiveVisibleCount),
    [orderedItems, effectiveVisibleCount]
  );

  const adjustVisibleCount = useCallback(
    (delta: number) => {
      setState((prev) => {
        const clampedBase = Math.min(Math.max(1, prev.visibleCount), maxCount);
        const nextVal = Math.min(Math.max(1, clampedBase + delta), maxCount);
        if (nextVal === prev.visibleCount) return prev;
        const next: QuickMenuState = {
          ...prev,
          visibleCount: nextVal,
          updatedAt: Date.now(),
        };
        persistState(next, true);
        return next;
      });
    },
    [maxCount, persistState]
  );

  const togglePinModule = useCallback(
    (href: string) => {
      const canon = canonicalizeRoute(href);
      setState((prev) => {
        const currentPins = prev.pinnedModules.map(canonicalizeRoute);
        const isAlreadyPinned = currentPins.includes(canon);
        const nextPins = isAlreadyPinned
          ? currentPins.filter((p) => p !== canon)
          : [...currentPins, canon];
        const next: QuickMenuState = {
          ...prev,
          pinnedModules: nextPins,
          // Ensure newly pinned favorite is visible if user pinned an item beyond visibleCount
          visibleCount:
            !isAlreadyPinned && nextPins.length > prev.visibleCount
              ? Math.min(nextPins.length, maxCount)
              : prev.visibleCount,
          updatedAt: Date.now(),
        };
        persistState(next, true);
        return next;
      });
    },
    [maxCount, persistState]
  );

  const setDesktopMode = useCallback(
    (mode: "single_line" | "expanded" | "pill") => {
      setState((prev) => {
        const next: QuickMenuState = {
          ...prev,
          desktopMode: mode,
          updatedAt: Date.now(),
        };
        persistState(next, true);
        return next;
      });
    },
    [persistState]
  );

  const setMobileMode = useCallback(
    (mode: "single_line" | "pill") => {
      setState((prev) => {
        const next: QuickMenuState = {
          ...prev,
          mobileMode: mode,
          updatedAt: Date.now(),
        };
        persistState(next, true);
        return next;
      });
    },
    [persistState]
  );

  const pinnedSet = useMemo(
    () => new Set(state.pinnedModules.map(canonicalizeRoute)),
    [state.pinnedModules]
  );

  return {
    state,
    orderedItems,
    visibleItems,
    effectiveVisibleCount,
    maxCount,
    pinnedSet,
    pinEditMode,
    setPinEditMode,
    mobileGridOpen,
    setMobileGridOpen,
    adjustVisibleCount,
    togglePinModule,
    setDesktopMode,
    setMobileMode,
  };
}

interface DesktopQuickMenuBarProps {
  menu: ReturnType<typeof useDynamicQuickMenu>;
  isItemActive: (href: string) => boolean;
  isSidebarPinned: boolean;
  onOpenFullMenu: () => void;
  alertBannerVisible: boolean;
}

export function DesktopQuickMenuBar({
  menu,
  isItemActive,
  isSidebarPinned,
  onOpenFullMenu,
  alertBannerVisible,
}: DesktopQuickMenuBarProps) {
  const {
    state,
    orderedItems,
    visibleItems,
    effectiveVisibleCount,
    maxCount,
    pinnedSet,
    pinEditMode,
    setPinEditMode,
    adjustVisibleCount,
    togglePinModule,
    setDesktopMode,
  } = menu;

  if (orderedItems.length === 0) return null;

  // Compact Pill Mode: frees 100% of vertical screen height
  if (state.desktopMode === "pill") {
    return (
      <div
        className={`hidden md:flex print:hidden fixed z-30 items-center gap-1.5 px-2 py-1 rounded-full bg-card/95 backdrop-blur-md border border-border/90 shadow-lg ${
          alertBannerVisible ? "top-11" : "top-2.5"
        } ${isSidebarPinned ? "left-[16.75rem] lg:left-[18.75rem]" : "left-3"}`}
        role="toolbar"
        aria-label="Atalhos rápidos minimizados"
      >
        {!isSidebarPinned && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenFullMenu}
            aria-label="Abrir menu completo por categorias"
            title="Abrir menu completo por categorias"
            className="h-7 px-2 gap-1 text-xs font-bold rounded-full hover:bg-primary/10 text-foreground"
          >
            <Menu className="w-3.5 h-3.5 text-primary" />
            <span>Menu</span>
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setDesktopMode("single_line")}
          aria-label="Expandir barra de menus dinâmicos"
          title="Expandir barra de atalhos mais usados"
          className="h-7 px-2.5 gap-1.5 text-[11px] font-bold rounded-full bg-primary/10 hover:bg-primary/20 text-primary"
        >
          <Sparkles className="w-3 h-3" />
          <span>Atalhos ({effectiveVisibleCount})</span>
          <Maximize2 className="w-3 h-3" />
        </Button>
      </div>
    );
  }

  const isExpandedWrap = state.desktopMode === "expanded";
  const itemsToRender = pinEditMode ? orderedItems : visibleItems;

  return (
    <div className="hidden md:flex print:hidden shrink-0 items-start justify-between gap-2 px-3 py-1.5 bg-card/95 backdrop-blur-sm border-b border-border/80 z-20">
      {/* Esquerda: Botão Menu Completo (quando sidebar retrátil) + Botões Dinâmicos */}
      <div
        className={`flex items-center gap-1 min-w-0 flex-1 ${
          isExpandedWrap
            ? "flex-wrap"
            : "flex-nowrap overflow-x-auto no-scrollbar"
        }`}
      >
        {!isSidebarPinned && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenFullMenu}
            aria-label="Abrir menu completo por categorias"
            title="Abrir menu completo na ordem padrão por categorias"
            className="h-7 px-2.5 gap-1.5 text-[11px] font-bold rounded-xl border-border/90 bg-muted/40 hover:bg-muted shrink-0"
          >
            <Menu className="w-3.5 h-3.5 text-primary" />
            <span>Menu</span>
          </Button>
        )}

        {itemsToRender.map((item, idx) => {
          const canon = canonicalizeRoute(item.href);
          const active = isItemActive(item.href);
          const isPinnedFav = pinnedSet.has(canon);
          const isOutsideVisibleRange = pinEditMode && idx >= effectiveVisibleCount;
          const label = item.shortLabel || getShortModuleLabel(item.href, item.label);

          if (pinEditMode) {
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => togglePinModule(item.href)}
                aria-pressed={isPinnedFav}
                title={
                  isPinnedFav
                    ? `Desafixar "${item.label}" dos favoritos`
                    : `Fixar "${item.label}" sempre na frente (📌)`
                }
                className={`group inline-flex items-center gap-1.5 h-7 px-2.5 rounded-xl text-[11px] font-bold border transition-all shrink-0 cursor-pointer ${
                  isPinnedFav
                    ? "bg-amber-500/15 border-amber-500/50 text-amber-800 dark:text-amber-300 shadow-2xs"
                    : isOutsideVisibleRange
                      ? "bg-muted/20 border-dashed border-border/60 text-muted-foreground opacity-65 hover:opacity-100"
                      : "bg-muted/50 border-border text-foreground hover:border-amber-500/50"
                }`}
              >
                <Pin
                  className={`w-3 h-3 shrink-0 ${
                    isPinnedFav ? "fill-amber-500 text-amber-600" : "text-muted-foreground"
                  }`}
                />
                <item.icon className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">{label}</span>
              </button>
            );
          }

          return (
            <Link key={item.href} href={item.href} className="shrink-0">
              <div
                title={`${item.label}${isPinnedFav ? " • Fixado nos favoritos" : " • Ordenado pelos mais usados"}`}
                className={`group relative inline-flex items-center gap-1.5 h-7 px-2.5 rounded-xl text-[11px] transition-all cursor-pointer select-none ${
                  active
                    ? "bg-primary text-primary-foreground font-extrabold shadow-xs"
                    : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground font-semibold border border-transparent hover:border-border/70"
                }`}
              >
                <item.icon className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">{label}</span>
                {isPinnedFav && (
                  <Pin
                    className={`w-2.5 h-2.5 shrink-0 ${
                      active ? "text-amber-300 fill-amber-300" : "text-amber-500 fill-amber-500/80"
                    }`}
                  />
                )}
                {item.badge ? (
                  <span
                    className={`px-1.5 py-0 rounded-full text-[9px] font-black leading-4 ${
                      active ? "bg-white text-primary" : "bg-rose-600 text-white"
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Direita: Controles rápidos (- / + quantidade, 📌 fixar, recolher 1 linha / grade, pílula) */}
      <div
        role="toolbar"
        aria-label="Configurar quantidade e exibição dos menus rápidos"
        className="flex items-center gap-1 shrink-0 bg-muted/40 border border-border/70 rounded-xl px-1.5 py-0.5"
      >
        <button
          type="button"
          onClick={() => adjustVisibleCount(-1)}
          disabled={effectiveVisibleCount <= 1}
          aria-label="Diminuir quantidade de botões no menu rápido"
          title="Mostrar menos botões na barra rápida"
          className="h-6 w-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-35 transition-colors cursor-pointer"
        >
          <Minus className="w-3 h-3" />
        </button>
        <span
          className="text-[10.5px] font-extrabold font-mono px-1 text-foreground select-none"
          title={`Exibindo ${effectiveVisibleCount} de ${maxCount} módulos disponíveis`}
        >
          {effectiveVisibleCount}
        </span>
        <button
          type="button"
          onClick={() => adjustVisibleCount(1)}
          disabled={effectiveVisibleCount >= maxCount}
          aria-label="Aumentar quantidade de botões no menu rápido"
          title="Mostrar mais botões na barra rápida"
          className="h-6 w-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-35 transition-colors cursor-pointer"
        >
          <Plus className="w-3 h-3" />
        </button>

        <div className="w-px h-3.5 bg-border mx-0.5" />

        <button
          type="button"
          onClick={() => setPinEditMode(!pinEditMode)}
          aria-pressed={pinEditMode}
          aria-label="Modo fixar módulos favoritos"
          title={
            pinEditMode
              ? "Concluir fixação de favoritos"
              : "Fixar ou desafixar módulos favoritos (📌)"
          }
          className={`h-6 px-1.5 rounded-lg flex items-center gap-1 text-[10px] font-bold transition-colors cursor-pointer ${
            pinEditMode
              ? "bg-amber-500 text-white shadow-2xs"
              : "text-muted-foreground hover:text-foreground hover:bg-card"
          }`}
        >
          <Pin className="w-3 h-3" />
          {pinEditMode && <span>OK</span>}
        </button>

        {effectiveVisibleCount > 5 && (
          <button
            type="button"
            onClick={() =>
              setDesktopMode(isExpandedWrap ? "single_line" : "expanded")
            }
            aria-pressed={isExpandedWrap}
            aria-label={
              isExpandedWrap
                ? "Recolher atalhos em 1 linha"
                : "Expandir atalhos em múltiplas linhas"
            }
            title={
              isExpandedWrap
                ? "Recolher em 1 linha compacta"
                : "Ver todos os ícones em grade no topo"
            }
            className={`h-6 w-6 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              isExpandedWrap
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-card"
            }`}
          >
            {isExpandedWrap ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <Rows2 className="w-3.5 h-3.5" />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setPinEditMode(false);
            setDesktopMode("pill");
          }}
          aria-label="Minimizar barra de menus em pílula compacta"
          title="Minimizar barra em pílula compacta para liberar a tela"
          className="h-6 w-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer"
        >
          <Minimize2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

interface MobileQuickMenuBarProps {
  menu: ReturnType<typeof useDynamicQuickMenu>;
  isItemActive: (href: string) => boolean;
  mobileMenuOpen: boolean;
  onOpenFullMenu: () => void;
}

export function MobileQuickMenuBar({
  menu,
  isItemActive,
  mobileMenuOpen,
  onOpenFullMenu,
}: MobileQuickMenuBarProps) {
  const [, setLocation] = useLocation();
  const {
    state,
    orderedItems,
    visibleItems,
    effectiveVisibleCount,
    maxCount,
    pinnedSet,
    pinEditMode,
    setPinEditMode,
    mobileGridOpen,
    setMobileGridOpen,
    adjustVisibleCount,
    togglePinModule,
    setMobileMode,
  } = menu;

  useBackLayer(
    mobileGridOpen,
    () => {
      setPinEditMode(false);
      setMobileGridOpen(false);
    },
    "mobile-quick-menu-grid"
  );

  if (orderedItems.length === 0) return null;

  // Compact Pill Mode on Mobile: frees the entire bottom edge
  if (state.mobileMode === "pill" && !mobileGridOpen) {
    return (
      <div
        role="toolbar"
        aria-label="Atalhos rápidos minimizados"
        className="md:hidden print:hidden fixed bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] left-3 z-40 flex items-center gap-1 px-2 py-1.5 rounded-full bg-card/95 backdrop-blur-md border border-border shadow-2xl"
      >
        <button
          type="button"
          onClick={() => setMobileMode("single_line")}
          aria-label="Expandir barra inferior de atalhos"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-[11px] font-extrabold shadow-xs"
        >
          <Sparkles aria-hidden="true" className="w-3.5 h-3.5" />
          <span>Atalhos ({effectiveVisibleCount})</span>
        </button>
        <button
          type="button"
          onClick={onOpenFullMenu}
          aria-label="Abrir menu completo por categorias"
          className="p-1.5 rounded-full text-foreground hover:bg-muted"
        >
          <Menu aria-hidden="true" className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const gridItems = pinEditMode ? orderedItems : visibleItems;

  return (
    <>
      {/* Painel Inferior Expansível em Grade (Celular) */}
      {mobileGridOpen && (
        <div className="md:hidden print:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div
            aria-hidden="true"
            onClick={() => {
              setPinEditMode(false);
              setMobileGridOpen(false);
            }}
            className="fixed inset-0 bg-black/55 backdrop-blur-[1px] animate-in fade-in"
          />

          <div className="relative z-10 bg-card border-t border-border rounded-t-3xl shadow-2xl p-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] max-h-[82dvh] flex flex-col gap-3 animate-in slide-in-from-bottom duration-200">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto -mt-1" />

            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span>Menus Dinâmicos (Mais Usados)</span>
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  {pinEditMode
                    ? "Toque nos módulos abaixo para fixar (📌) ou desafixar favoritos"
                    : "Ordenado automaticamente pelo seu uso + favoritos fixados"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPinEditMode(false);
                  setMobileGridOpen(false);
                }}
                aria-label="Recolher grade em 1 linha"
                className="h-7 px-2.5 rounded-xl bg-muted text-foreground text-[11px] font-bold flex items-center gap-1 shrink-0"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                <span>1 linha</span>
              </button>
            </div>

            {/* Controles Rápidos: Quantidade (- / +), Fixar (📌), Pílula e Menu Completo */}
            <div
              role="toolbar"
              aria-label="Configurar barra rápida"
              className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-2xl bg-muted/40 border border-border/70"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10.5px] font-bold text-muted-foreground pl-1">
                  Qtd:
                </span>
                <button
                  type="button"
                  onClick={() => adjustVisibleCount(-1)}
                  disabled={effectiveVisibleCount <= 1}
                  aria-label="Diminuir quantidade de ícones"
                  className="h-7 w-7 rounded-xl bg-card border border-border flex items-center justify-center text-foreground disabled:opacity-35"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-black font-mono min-w-[2.2rem] text-center">
                  {effectiveVisibleCount}/{maxCount}
                </span>
                <button
                  type="button"
                  onClick={() => adjustVisibleCount(1)}
                  disabled={effectiveVisibleCount >= maxCount}
                  aria-label="Aumentar quantidade de ícones"
                  className="h-7 w-7 rounded-xl bg-card border border-border flex items-center justify-center text-foreground disabled:opacity-35"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPinEditMode(!pinEditMode)}
                  aria-pressed={pinEditMode}
                  aria-label="Fixar favoritos"
                  className={`h-7 px-2.5 rounded-xl text-[11px] font-bold flex items-center gap-1 border transition-colors ${
                    pinEditMode
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-card text-foreground border-border"
                  }`}
                >
                  <Pin className="w-3 h-3" />
                  <span>{pinEditMode ? "Concluir" : "Fixar"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPinEditMode(false);
                    setMobileGridOpen(false);
                    setMobileMode("pill");
                  }}
                  aria-label="Minimizar em pílula compacta"
                  className="h-7 px-2.5 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground text-[11px] font-bold flex items-center gap-1"
                >
                  <Minimize2 className="w-3 h-3" />
                  <span>Pílula</span>
                </button>
              </div>
            </div>

            {/* Grade de Ícones */}
            <div className="grid grid-cols-4 gap-2 overflow-y-auto py-0.5 max-h-[52dvh]">
              {gridItems.map((item, idx) => {
                const canon = canonicalizeRoute(item.href);
                const active = isItemActive(item.href);
                const isPinnedFav = pinnedSet.has(canon);
                const isOutsideRange = pinEditMode && idx >= effectiveVisibleCount;
                const label =
                  item.shortLabel || getShortModuleLabel(item.href, item.label);

                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => {
                      if (pinEditMode) {
                        togglePinModule(item.href);
                      } else {
                        navigateFromOverlay(setLocation, item.href, () =>
                          setMobileGridOpen(false)
                        );
                      }
                    }}
                    aria-pressed={pinEditMode ? isPinnedFav : undefined}
                    className={`relative flex flex-col items-center justify-center p-2 rounded-2xl border text-center transition-all min-h-[64px] ${
                      pinEditMode
                        ? isPinnedFav
                          ? "bg-amber-500/15 border-amber-500/60 text-amber-800 dark:text-amber-300"
                          : isOutsideRange
                            ? "bg-muted/20 border-dashed border-border/60 text-muted-foreground opacity-60"
                            : "bg-muted/40 border-border text-foreground"
                        : active
                          ? "bg-primary text-primary-foreground border-primary font-black shadow-sm"
                          : "bg-muted/35 hover:bg-muted border-border/60 text-foreground"
                    }`}
                  >
                    {isPinnedFav && (
                      <Pin
                        className={`w-3 h-3 absolute top-1.5 left-1.5 ${
                          active && !pinEditMode
                            ? "text-amber-300 fill-amber-300"
                            : "text-amber-500 fill-amber-500"
                        }`}
                      />
                    )}
                    {item.badge ? (
                      <span
                        className={`absolute top-1 right-1 px-1.5 min-w-[16px] h-4 rounded-full text-[9px] font-black flex items-center justify-center ${
                          active && !pinEditMode
                            ? "bg-white text-primary"
                            : "bg-rose-600 text-white"
                        }`}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                    <item.icon className="w-5 h-5 mb-1 shrink-0" />
                    <span className="text-[10px] font-bold leading-tight line-clamp-1 w-full">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="pt-1 border-t border-border/60 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                Precisa ver todas as categorias padrão?
              </span>
              <button
                type="button"
                onClick={() => {
                  setPinEditMode(false);
                  setMobileGridOpen(false);
                  onOpenFullMenu();
                }}
                className="text-[11px] font-bold text-primary flex items-center gap-1"
              >
                <Menu className="w-3.5 h-3.5" />
                <span>Abrir Menu Completo (☰)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra Inferior em 1 Linha (Celular) */}
      <div className="md:hidden print:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border px-1.5 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom,0px))] flex items-center gap-1 shadow-2xl">
        <div className="flex-1 min-w-0 flex items-center gap-0.5 overflow-x-auto no-scrollbar">
          {visibleItems.map((item) => {
            const canon = canonicalizeRoute(item.href);
            const active = isItemActive(item.href);
            const isPinnedFav = pinnedSet.has(canon);
            const label =
              item.shortLabel || getShortModuleLabel(item.href, item.label);

            return (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 min-w-[60px] flex-1 max-w-[88px]"
              >
                <div
                  className={`relative flex flex-col items-center py-1 px-1 rounded-xl transition-all ${
                    active
                      ? "text-primary bg-primary/10 font-black"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="relative">
                    <item.icon className="w-5 h-5" />
                    {isPinnedFav && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 absolute -top-0.5 -left-1.5" />
                    )}
                    {item.badge ? (
                      <span className="absolute -top-1.5 -right-2.5 bg-rose-600 text-white font-black text-[9px] min-w-[15px] h-3.5 px-1 rounded-full flex items-center justify-center shadow-2xs">
                        {typeof item.badge === "number" && item.badge > 9
                          ? "9+"
                          : item.badge}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[9.5px] mt-0.5 font-bold text-center leading-tight truncate w-full">
                    {label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Botões fixos à direita: Grade/Config (▲) e Menu Completo (☰) */}
        <div className="flex items-center gap-0.5 shrink-0 pl-1 border-l border-border/70">
          <button
            type="button"
            onClick={() => setMobileGridOpen(true)}
            aria-label="Expandir grade de atalhos e configurar quantidade"
            title="Expandir grade e ajustar botões"
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
              mobileGridOpen
                ? "text-primary bg-primary/10 font-black"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="w-5 h-5" />
            <span className="text-[9px] mt-0.5 font-bold leading-tight">
              Grade
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenFullMenu}
            aria-label="Abrir menu completo por categorias"
            title="Menu completo por categorias"
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
              mobileMenuOpen
                ? "text-primary bg-primary/10 font-black"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[9px] mt-0.5 font-bold leading-tight">
              Menu
            </span>
          </button>
        </div>
      </div>
    </>
  );
}

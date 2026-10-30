import React from "react";
import { useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import {
  Sparkles,
  Building2,
  FileText,
  Package,
  ExternalLink
} from "lucide-react";

export interface MinibarEcosystemNavProps {
  currentScreen: "admin" | "anserve" | "notas" | "reposicao";
  pendingInvoicesCount?: number;
}

export function MinibarEcosystemNav({
  currentScreen,
  pendingInvoicesCount
}: MinibarEcosystemNavProps) {
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const role = user?.role || "";

  const isAdminOrDev = role === "admin" || role === "dev";
  const isGestor = isAdminOrDev || role === "anserve_gestor";
  const isFaturamento = isGestor || role === "anserve_faturamento";
  const isRepositora = isGestor || role === "anserve_repositora";

  const navItems = [
    {
      id: "admin" as const,
      label: "Estratégico & Cardápio",
      subLabel: "Diretoria CorpFlats",
      href: "/frigobar-admin",
      icon: Sparkles,
      visible: isAdminOrDev,
      activeClass: "bg-primary text-primary-foreground border-primary shadow-sm"
    },
    {
      id: "anserve" as const,
      label: "Gestor Anserve",
      subLabel: "Vendas, Repasse & Equipe",
      href: "/anserve",
      icon: Building2,
      visible: isGestor,
      activeClass: "bg-teal-600 text-white border-teal-500 shadow-sm"
    },
    {
      id: "notas" as const,
      label: "Central de Notas Fiscais",
      subLabel: "Emissão & Envio de NF",
      href: "/frigobar-notas",
      icon: FileText,
      visible: isFaturamento,
      badgeCount: pendingInvoicesCount,
      activeClass: "bg-indigo-600 text-white border-indigo-500 shadow-sm"
    },
    {
      id: "reposicao" as const,
      label: "App da Repositora",
      subLabel: "Lançamento Diário nos Flats",
      href: "/frigobar-reposicao",
      icon: Package,
      visible: isRepositora,
      activeClass: "bg-sky-600 text-white border-sky-500 shadow-sm"
    }
  ].filter((item) => item.visible);

  // Se o usuário tiver acesso a apenas 1 tela (ex: apenas repositora ou apenas faturamento), não precisa exibir seletor de múltiplas telas
  if (navItems.length <= 1) {
    return null;
  }

  return (
    <div className="w-full bg-card/90 backdrop-blur-sm border border-border rounded-2xl p-2 shadow-xs print:hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 px-2 py-0.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
            🧊 Ecossistema Frigobar:
          </span>
        </div>

        <div className="grid grid-cols-2 lg:flex lg:flex-wrap items-center gap-1.5 flex-1 sm:justify-end">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === currentScreen;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setLocation(item.href)}
                className={`flex items-center justify-between sm:justify-start gap-2 px-3 py-2 rounded-xl border text-left transition-all min-w-0 ${
                  isActive
                    ? item.activeClass
                    : "bg-muted/40 hover:bg-muted text-foreground border-border/80"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-current" : "text-primary"}`} />
                  <div className="min-w-0">
                    <span className="text-xs font-black block truncate leading-tight">
                      {item.label}
                    </span>
                    <span
                      className={`text-[10px] hidden xl:block truncate ${
                        isActive ? "opacity-90" : "text-muted-foreground"
                      }`}
                    >
                      {item.subLabel}
                    </span>
                  </div>
                </div>

                {typeof item.badgeCount === "number" && item.badgeCount > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                      isActive
                        ? "bg-white text-indigo-700"
                        : "bg-amber-500 text-slate-950"
                    }`}
                  >
                    {item.badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

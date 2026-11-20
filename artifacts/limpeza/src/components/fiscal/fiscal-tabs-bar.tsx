import { useEffect, useRef } from "react"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Sparkles, Zap, FileText, Sliders } from "lucide-react"

export type FiscalTabKey = "studio" | "batch" | "history" | "settings"

interface FiscalTabsBarProps {
  activeTab: FiscalTabKey
  pendingPriorityCount: number
  invoicesCount: number
  retryQueueCount: number
}

export function FiscalTabsBar({
  activeTab,
  pendingPriorityCount,
  invoicesCount,
  retryQueueCount,
}: FiscalTabsBarProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const tabRefs = useRef<Partial<Record<FiscalTabKey, HTMLButtonElement | null>>>({})

  // Keep active tab scrolled smoothly into view on single-row horizontal tab bar
  useEffect(() => {
    const activeEl = tabRefs.current[activeTab]
    if (!activeEl || typeof activeEl.scrollIntoView !== "function") return
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    activeEl.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: prefersReduced ? "auto" : "smooth",
    })
  }, [activeTab])

  // Fallback for browsers without scroll-driven animations: IntersectionObserver toggles .more-start/.more-end
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    const supportsScrollTimeline =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("animation-timeline", "scroll()")

    if (supportsScrollTimeline) {
      scroller.classList.remove("more-start", "more-end")
      return
    }

    const firstTab = tabRefs.current.studio
    const lastTab = tabRefs.current.settings
    if (!firstTab || !lastTab || typeof IntersectionObserver === "undefined") return

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === firstTab) {
            scroller.classList.toggle("more-start", !entry.isIntersecting)
          }
          if (entry.target === lastTab) {
            scroller.classList.toggle("more-end", !entry.isIntersecting)
          }
        }
      },
      { root: scroller, threshold: 1, rootMargin: "1px" }
    )

    io.observe(firstTab)
    io.observe(lastTab)

    return () => {
      io.disconnect()
      scroller.classList.remove("more-start", "more-end")
    }
  }, [])

  return (
    <div className="bg-card border border-border p-1.5 rounded-2xl shadow-xs w-full min-w-0">
      <TabsList
        ref={scrollerRef}
        aria-label="Seções de Notas Fiscais"
        className="fiscal-tabs-scroller bg-transparent p-0 rounded-xl h-auto w-full justify-start lg:justify-center gap-1.5 text-muted-foreground"
      >
        <TabsTrigger
          ref={(el) => {
            tabRefs.current.studio = el
          }}
          value="studio"
          className="fiscal-tab-trigger rounded-xl px-3.5 py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
        >
          <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Emitir Nota Avulsa</span>
        </TabsTrigger>

        <TabsTrigger
          ref={(el) => {
            tabRefs.current.batch = el
          }}
          value="batch"
          className="fiscal-tab-trigger rounded-xl px-3.5 py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
        >
          <Zap className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Reservas sem Nota</span>
          {pendingPriorityCount > 0 && (
            <Badge className="ml-0.5 bg-amber-500 text-white text-[10px] px-1.5 py-0 shrink-0">
              {pendingPriorityCount}
            </Badge>
          )}
        </TabsTrigger>

        <TabsTrigger
          ref={(el) => {
            tabRefs.current.history = el
          }}
          value="history"
          className="fiscal-tab-trigger rounded-xl px-3.5 py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
        >
          <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Notas Emitidas ({invoicesCount})</span>
          {retryQueueCount > 0 && (
            <Badge className="ml-0.5 bg-rose-600 text-white text-[10px] px-1.5 py-0 shrink-0">
              {retryQueueCount}
            </Badge>
          )}
        </TabsTrigger>

        <TabsTrigger
          ref={(el) => {
            tabRefs.current.settings = el
          }}
          value="settings"
          className="fiscal-tab-trigger rounded-xl px-3.5 py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
        >
          <Sliders className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="sm:hidden">Config. &amp; Cert. A1</span>
          <span className="hidden sm:inline">Configurações &amp; Certificado A1</span>
        </TabsTrigger>
      </TabsList>
    </div>
  )
}

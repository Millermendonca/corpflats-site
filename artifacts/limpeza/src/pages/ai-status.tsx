import React, { useState, useEffect, useCallback } from "react"
import { Shell } from "@/components/layout"
import {
  Brain,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Zap,
  Shield,
  Activity,
  Server,
  Key,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface TestResult {
  status: number
  ok: boolean
  body: string
}

interface AiTestResponse {
  hasApiKey: boolean
  keyPrefix: string | null
  keyLength: number
  testProduct: string
  geminiTest: TestResult | { error: string } | null
  fallbackResult: string | null
  cached: boolean
  cacheAge?: string
}

function StatusBadge({ ok, label, detail }: { ok: boolean | null; label: string; detail?: string }) {
  if (ok === null) return (
    <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/30 border border-border/40">
      <div className="w-2.5 h-2.5 rounded-full bg-gray-300 animate-pulse" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
  return (
    <div className={`flex items-center gap-2 p-3 rounded-xl border ${
      ok ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800"
         : "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800"
    }`}>
      {ok
        ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        : <XCircle className="w-4 h-4 text-red-500 shrink-0" />
      }
      <div className="min-w-0">
        <span className={`text-sm font-medium ${ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
          {label}
        </span>
        {detail && <p className="text-[11px] text-muted-foreground mt-0.5 break-all">{detail}</p>}
      </div>
    </div>
  )
}

export default function AiStatusPage() {
  const [data, setData] = useState<AiTestResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastCheck, setLastCheck] = useState<Date | null>(null)
  const [testProduct, setTestProduct] = useState("queijo minas frescal")
  const [customProduct, setCustomProduct] = useState("")

  const runTest = useCallback(async (product?: string, forceRefresh = false) => {
    setLoading(true)
    try {
      const p = product || testProduct
      const refreshParam = forceRefresh ? "&refresh=1" : ""
      const res = await fetch(`/api/shopping-list/ai-test?product=${encodeURIComponent(p)}${refreshParam}`)
      if (res.ok) {
        const d = await res.json()
        setData(d)
        setLastCheck(new Date())
        setTestProduct(p)
      }
    } catch {} finally { setLoading(false) }
  }, [testProduct])

  useEffect(() => { runTest() }, [])

  // Auto-refresh a cada 5 minutos (servidor faz cache, não gasta cota)
  useEffect(() => {
    const iv = setInterval(() => runTest(), 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [runTest])

  const getMethodStatus = (test: TestResult | { error: string } | null): { ok: boolean | null; detail: string } => {
    if (!test) return { ok: null, detail: "Aguardando..." }
    if ("error" in test) return { ok: false, detail: test.error }
    if (test.ok) return { ok: true, detail: `HTTP ${test.status} — Operacional ✅` }
    try {
      const parsed = JSON.parse(test.body)
      const msg = parsed?.error?.message || test.body
      if (test.status === 503) return { ok: false, detail: `⏳ Alta demanda — ${msg.slice(0, 120)}` }
      if (test.status === 429) return { ok: false, detail: `⚠️ Cota excedida — ${msg.slice(0, 120)}` }
      if (test.status === 404) return { ok: false, detail: `❌ Modelo não encontrado — ${msg.slice(0, 120)}` }
      if (test.status === 401 || test.status === 403) return { ok: false, detail: `🔑 Autenticação falhou — ${msg.slice(0, 120)}` }
      return { ok: false, detail: `HTTP ${test.status} — ${msg.slice(0, 120)}` }
    } catch {
      return { ok: false, detail: `HTTP ${test.status} — ${test.body.slice(0, 100)}` }
    }
  }

  const geminiStatus = getMethodStatus(data?.geminiTest ?? null)
  const geminiWorking = geminiStatus.ok === true
  const geminiOverloaded = !geminiWorking && data?.geminiTest && "status" in data.geminiTest && (data.geminiTest.status === 503 || data.geminiTest.status === 429)

  return (
    <Shell>
      <div className="space-y-5 max-w-2xl mx-auto pb-20 overflow-x-hidden w-full">

        {/* Header */}
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">Status da IA</h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => runTest(undefined, true)}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Status geral */}
        <div className={`p-4 rounded-2xl border-2 ${
          geminiWorking
            ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/10 dark:border-emerald-800"
            : geminiOverloaded
              ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10 dark:border-amber-800"
              : "border-red-300 bg-red-50/50 dark:bg-red-950/10 dark:border-red-800"
        }`}>
          <div className="flex items-center gap-3">
            {geminiWorking
              ? <><CheckCircle2 className="w-8 h-8 text-emerald-500" /><div><p className="font-bold text-emerald-700 dark:text-emerald-400">IA Operacional</p><p className="text-sm text-emerald-600/70 dark:text-emerald-500/70">Gemini está categorizando seus itens automaticamente</p></div></>
              : geminiOverloaded
                ? <><AlertTriangle className="w-8 h-8 text-amber-500" /><div><p className="font-bold text-amber-700 dark:text-amber-400">IA Temporariamente Indisponível</p><p className="text-sm text-amber-600/70 dark:text-amber-500/70">Alta demanda nos servidores do Google — usando regras de keywords como fallback</p></div></>
                : <><XCircle className="w-8 h-8 text-red-500" /><div><p className="font-bold text-red-700 dark:text-red-400">IA Offline</p><p className="text-sm text-red-600/70 dark:text-red-500/70">Gemini não está respondendo — categorizando por regras de keywords</p></div></>
            }
          </div>
        </div>

        {/* Chave API */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-muted-foreground flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5" /> Chave de API
          </h2>
          <div className="grid gap-2">
            <StatusBadge
              ok={data?.hasApiKey ?? null}
              label={data?.hasApiKey ? `Configurada (${data.keyPrefix}, ${data.keyLength} chars)` : "Não configurada"}
              detail={!data?.hasApiKey ? "Configure GEMINI_API_KEY no Render" : undefined}
            />
          </div>
        </div>

        {/* Conexão Gemini */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-muted-foreground flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> Conexão Gemini
          </h2>
          <div className="grid gap-2">
            <StatusBadge ok={geminiStatus.ok} label="API Gemini 3.8 Flash" detail={geminiStatus.detail} />
            {data?.cached && (
              <p className="text-[10px] text-muted-foreground ml-1">
                📦 Resultado em cache (atualizado há {data.cacheAge}) — clique Atualizar para forçar nova verificação
              </p>
            )}
          </div>
        </div>

        {/* Categorização */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-muted-foreground flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Teste de Categorização
          </h2>

          {/* Input para testar produto */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Testar produto... ex: sabão em pó"
              value={customProduct}
              onChange={e => setCustomProduct(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && customProduct.trim()) runTest(customProduct.trim()) }}
              className="flex-1 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <Button
              size="sm"
              onClick={() => { if (customProduct.trim()) runTest(customProduct.trim()) }}
              disabled={loading || !customProduct.trim()}
              className="rounded-xl"
            >
              Testar
            </Button>
          </div>

          <div className="p-3 rounded-xl bg-muted/30 border border-border/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Produto testado:</span>
              <span className="text-sm font-medium">{data?.testProduct || "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Brain className="w-3 h-3" /> Resultado IA:
              </span>
              <span className="text-sm font-medium text-primary">
                {data?.finalResult ? (
                  (() => { try { return JSON.parse(data.finalResult).join(", ") } catch { return data.finalResult } })()
                ) : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Activity className="w-3 h-3" /> Fallback keywords:
              </span>
              <span className="text-sm font-medium text-muted-foreground">
                {data?.fallbackResult ? (
                  (() => { try { return JSON.parse(data.fallbackResult).join(", ") } catch { return data.fallbackResult } })()
                ) : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Info do sistema */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-muted-foreground flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5" /> Sistema
          </h2>
          <div className="p-3 rounded-xl bg-muted/30 border border-border/40 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Modelo:</span>
              <span className="text-xs font-mono">gemini-3.8-flash</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Fallback:</span>
              <span className="text-xs">Regras de keywords (400+ palavras)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> Última verificação:
              </span>
              <span className="text-xs">{lastCheck ? lastCheck.toLocaleTimeString("pt-BR") : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Auto-refresh:</span>
              <span className="text-xs">A cada 5 minutos</span>
            </div>
          </div>
        </div>

        {/* Dica */}
        <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-200/50 dark:bg-blue-950/10 dark:border-blue-800/50">
          <p className="text-xs text-blue-700/80 dark:text-blue-400/80">
            <strong>💡 Como funciona:</strong> Ao adicionar um item na lista de compras, o servidor
            tenta categorizar com o Gemini (IA). Se a IA estiver indisponível, usa as regras de
            keywords como fallback. Seus itens sempre serão categorizados.
          </p>
        </div>

      </div>
    </Shell>
  )
}

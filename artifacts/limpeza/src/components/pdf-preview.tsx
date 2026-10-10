import { useEffect, useRef, useState } from "react"
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs"
import { ExternalLink, FileText, Maximize2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/**
 * Preview de PDF renderizado no próprio navegador via PDF.js (canvas).
 *
 * Motivo: navegadores mobile (Chrome Android, Samsung Internet, Safari iOS)
 * NÃO exibem PDF dentro de <iframe> — mostram apenas um placeholder "Abrir".
 * Renderizando em canvas o preview funciona igual em qualquer dispositivo.
 *
 * Usa o build "legacy" do pdfjs-dist para compatibilidade com Androids antigos
 * e carrega a lib sob demanda (import dinâmico) para não pesar o bundle principal.
 */

type PdfjsLib = typeof import("pdfjs-dist/legacy/build/pdf.mjs")

let pdfjsPromise: Promise<PdfjsLib> | null = null

function loadPdfjs(): Promise<PdfjsLib> {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
    ])
      .then(([lib, worker]) => {
        lib.GlobalWorkerOptions.workerSrc = worker.default
        return lib
      })
      .catch((err) => {
        pdfjsPromise = null // permite nova tentativa
        throw err
      })
  }
  return pdfjsPromise
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",")
  const meta = dataUrl.slice(0, comma)
  const payload = dataUrl.slice(comma + 1)
  if (/;base64/i.test(meta)) {
    const bin = atob(payload)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  }
  return new TextEncoder().encode(decodeURIComponent(payload))
}

/**
 * Abre o PDF em nova aba. URLs data: são convertidas em blob: porque os
 * navegadores bloqueiam navegação direta para data: em nova aba.
 */
export function openPdfInNewTab(url: string) {
  if (url.startsWith("data:")) {
    try {
      const blob = new Blob([dataUrlToBytes(url) as Uint8Array<ArrayBuffer>], { type: "application/pdf" })
      const blobUrl = URL.createObjectURL(blob)
      window.open(blobUrl, "_blank")
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch (err) {
      console.warn("[PdfPreview] Falha ao abrir PDF data:", err)
    }
    return
  }
  window.open(url, "_blank")
}

function usePdfDocument(url: string) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!url) return
    let cancelled = false
    let task: PDFDocumentLoadingTask | null = null
    setDoc(null)
    setError(false)

    loadPdfjs()
      .then((pdfjs) => {
        if (cancelled) return null
        const source = url.startsWith("data:") ? { data: dataUrlToBytes(url) } : { url }
        task = pdfjs.getDocument({ ...source, isEvalSupported: false })
        return task.promise
      })
      .then((loaded) => {
        if (loaded && !cancelled) setDoc(loaded)
      })
      .catch((err) => {
        if (cancelled) return
        console.warn("[PdfPreview] Falha ao carregar PDF:", err)
        setError(true)
      })

    return () => {
      cancelled = true
      task?.destroy()
    }
  }, [url])

  return { doc, error, loading: !doc && !error }
}

const MAX_CANVAS_PIXELS = 12_000_000

function PdfPageCanvas({ doc, pageNumber, className }: { doc: PDFDocumentProxy; pageNumber: number; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [aspect, setAspect] = useState(297 / 210) // A4 até sabermos o tamanho real
  const [rendered, setRendered] = useState(false)

  // Acompanha a largura do container (com debounce) para renderizar nítido em qualquer tela
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      const w = Math.floor(el.clientWidth)
      setWidth((prev) => (Math.abs(prev - w) > 4 ? w : prev))
    }
    update()
    const ro = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(update, 150)
    })
    ro.observe(el)
    return () => {
      clearTimeout(timer)
      ro.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!width) return
    let cancelled = false
    let task: RenderTask | null = null

    ;(async () => {
      const page = await doc.getPage(pageNumber)
      if (cancelled) return
      const base = page.getViewport({ scale: 1 })
      setAspect(base.height / base.width)

      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      let scale = (width / base.width) * dpr
      const pixels = base.width * scale * base.height * scale
      if (pixels > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / pixels)
      const viewport = page.getViewport({ scale })

      // Canvas novo a cada render evita conflito com renders cancelados em andamento
      const canvas = document.createElement("canvas")
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.width = "100%"
      canvas.style.height = "auto"
      canvas.style.display = "block"
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Canvas 2D indisponível")

      task = page.render({ canvasContext: ctx, viewport })
      await task.promise
      if (cancelled || !hostRef.current) return
      hostRef.current.replaceChildren(canvas)
      setRendered(true)
    })().catch((err) => {
      if (err?.name === "RenderingCancelledException") return
      console.warn(`[PdfPreview] Falha ao renderizar página ${pageNumber}:`, err)
    })

    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, pageNumber, width])

  return (
    <div ref={wrapRef} className={cn("relative w-full bg-white shadow-md", className)}>
      {!rendered && <div className="w-full animate-pulse bg-slate-200" style={{ aspectRatio: `1 / ${aspect}` }} />}
      <div ref={hostRef} />
    </div>
  )
}

function PdfFallback({ url, dark }: { url: string; dark?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl p-8 text-center",
        dark ? "bg-slate-950 text-slate-300" : "bg-slate-50 text-slate-600"
      )}
    >
      <FileText className="h-10 w-10 opacity-60" />
      <p className="text-sm font-medium">Não foi possível exibir a pré-visualização do documento.</p>
      <button
        type="button"
        onClick={() => openPdfInNewTab(url)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Abrir PDF
      </button>
    </div>
  )
}

export interface PdfPreviewProps {
  url: string
  title?: string
  /** Tema escuro (ex.: modal do tablet da recepção) */
  dark?: boolean
  className?: string
}

/**
 * Mostra a 1ª página do PDF e um botão "Ver completo" que abre um visualizador
 * em tela cheia com todas as páginas.
 */
export function PdfPreview({ url, title = "Documento PDF", dark, className }: PdfPreviewProps) {
  const { doc, error, loading } = usePdfDocument(url)
  const [fullOpen, setFullOpen] = useState(false)

  if (error) return <PdfFallback url={url} dark={dark} />

  const numPages = doc?.numPages ?? 0

  return (
    <div className={cn("space-y-3", className)}>
      <div
        className={cn(
          "rounded-2xl border p-3 sm:p-4 shadow-inner",
          dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-100"
        )}
      >
        {loading || !doc ? (
          <div className="w-full animate-pulse rounded bg-slate-200" style={{ aspectRatio: "210 / 297" }} />
        ) : (
          <button
            type="button"
            onClick={() => setFullOpen(true)}
            className="block w-full cursor-zoom-in text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            aria-label={`Ver ${title} completo`}
          >
            <PdfPageCanvas doc={doc} pageNumber={1} />
          </button>
        )}
      </div>

      <button
        type="button"
        disabled={!doc}
        onClick={() => setFullOpen(true)}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50",
          dark
            ? "border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
            : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
        )}
      >
        <Maximize2 className="h-4 w-4" />
        Ver completo
        {numPages > 1 && <span className="font-medium opacity-70">• {numPages} páginas</span>}
      </button>

      {doc && <PdfViewerDialog open={fullOpen} onOpenChange={setFullOpen} url={url} title={title} doc={doc} />}
    </div>
  )
}

export interface PdfViewerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** URL http(s)/relativa ou data:application/pdf;base64,... */
  url: string
  title?: string
  /** Documento já carregado (evita baixar de novo) */
  doc?: PDFDocumentProxy | null
}

/**
 * Visualizador de PDF em tela cheia (todas as páginas, renderizadas via PDF.js).
 * Funciona em celular/tablet, onde abrir o PDF numa aba/iframe não exibe nada.
 */
export function PdfViewerDialog({ open, onOpenChange, url, title = "Documento PDF", doc: providedDoc }: PdfViewerDialogProps) {
  // Só carrega por conta própria se não recebeu o doc pronto; após a 1ª abertura mantém carregado
  const [activated, setActivated] = useState(false)
  useEffect(() => {
    if (open) setActivated(true)
  }, [open])
  const own = usePdfDocument(!providedDoc && (open || activated) ? url : "")
  const doc = providedDoc ?? own.doc
  const numPages = doc?.numPages ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 h-[92dvh] sm:h-[92vh] sm:max-w-4xl bg-slate-100 text-slate-900">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 pr-14">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm sm:text-base font-bold">{title}</DialogTitle>
            <DialogDescription className="text-[11px] text-slate-500">
              {doc ? `${numPages} ${numPages === 1 ? "página" : "páginas"}` : own.error ? "Falha ao carregar" : "Carregando…"}
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={() => openPdfInNewTab(url)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Nova aba
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-6">
          <div className="mx-auto max-w-3xl space-y-4">
            {doc ? (
              Array.from({ length: numPages }, (_, i) => <PdfPageCanvas key={i + 1} doc={doc} pageNumber={i + 1} />)
            ) : own.error ? (
              <PdfFallback url={url} />
            ) : (
              <div className="w-full animate-pulse rounded bg-slate-200" style={{ aspectRatio: "210 / 297" }} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default PdfPreview

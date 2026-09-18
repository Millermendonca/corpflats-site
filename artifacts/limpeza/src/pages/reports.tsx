import { useState, useEffect, useMemo } from "react"
import { useLocation } from "wouter"
import { useGetMe } from "@workspace/api-client-react"
import { Shell } from "@/components/layout"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog"
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts"
import { format, startOfMonth, endOfMonth, setDate, addMonths, subMonths } from "date-fns"
import { ptBR } from "date-fns/locale"
import { 
  Calendar, BarChart3, Printer, 
  DollarSign, Users, Check, Sliders, ChevronLeft, ChevronRight,
  Receipt, MessageSquare, Plus, Trash2, AlertTriangle, Info,
  Banknote, Gift, Wallet, Send, ArrowUpRight, ArrowDownLeft, RefreshCw,
  Copy, Share2, ShieldCheck, ListFilter, Clock, Sparkles, User
} from "lucide-react"

// ── Helpers de Formatação ───────────────────────────────────────────────────
function formatDate(dateStr?: string) {
  if (!dateStr) return "—"
  const parts = dateStr.substring(0, 10).split("-")
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  return dateStr
}

function formatTime(isoStr?: string) {
  if (!isoStr) return ""
  try {
    const d = new Date(isoStr)
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  } catch {
    return ""
  }
}

function formatBRL(val?: number) {
  return Number(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Tipos ────────────────────────────────────────────────────────────────────
interface StatementEntry {
  id: string
  userId: number
  cleaningRequestId?: string | null
  paymentId?: string | null
  entryType: "credit" | "debit"
  amount: number
  description: string
  entryDate: string
  createdAt: string
  balanceAfter: number
  payment: {
    id: string
    type: string
    interTxId: string | null
    interStatus: string | null
    interSimulated: boolean
    paidAt: string | null
    createdAt?: string
  } | null
}

interface MaidStatementData {
  userId: number
  userName: string
  pixKey: string
  balance: number
  statement: StatementEntry[]
}

// ── Geradores de Documento A4 Executivo para Impressão ───────────────────────
function printReceiptWindow(cleaner: any, startDate: string, endDate: string) {
  if (!cleaner) return
  const name = cleaner.name || cleaner.username
  const count = cleaner.count || 0
  const rate = Number(cleaner.ratePerRoom || 35).toFixed(2)
  const total = formatBRL(cleaner.totalToPay || 0)
  const startFmt = formatDate(startDate)
  const endFmt = formatDate(endDate)
  const now = new Date()
  const nowFmt = now.toLocaleDateString("pt-BR") + " às " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  const protocol = `#REC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${String(cleaner.userId || 1).padStart(3, "0")}`

  const rowsHtml = (cleaner.cleanings || [])
    .slice()
    .sort((a: any, b: any) => new Date(a.completedAt || a.effectiveDate || a.requestDate).getTime() - new Date(b.completedAt || b.effectiveDate || b.requestDate).getTime())
    .map((c: any, idx: number) => {
      const execDate = c.effectiveDate || (c.completedAt ? c.completedAt.substring(0, 10) : c.requestDate)
      const dateFmt = formatDate(execDate)
      let timeFmt = "—"
      if (c.cleaningStartedAt && c.completedAt) {
        timeFmt = `${format(new Date(c.cleaningStartedAt), "HH:mm")} às ${format(new Date(c.completedAt), "HH:mm")}`
      } else if (c.completedAt) {
        timeFmt = format(new Date(c.completedAt), "HH:mm")
      }
      const dur = c.durationMinutes || 35
      const guest = c.leavingGuest ? `<div style="font-size: 8pt; color: #64748b;">Saída: ${c.leavingGuest}</div>` : ""
      return `
        <tr>
          <td style="text-align: center; color: #94a3b8; font-family: monospace;">${String(idx + 1).padStart(2, "0")}</td>
          <td>${dateFmt}</td>
          <td style="font-family: monospace; color: #475569;">${timeFmt}</td>
          <td><strong>Apartamento ${c.flatNumber}</strong>${guest}</td>
          <td style="text-align: center; font-family: monospace;">${dur} min</td>
          <td style="text-align: right; font-weight: bold; color: #059669; font-family: monospace;">R$ ${rate}</td>
        </tr>
      `
    }).join("")

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Recibo de Diárias - ${name}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm 15mm 15mm 15mm; }
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 9.5pt;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .logo-box { display: flex; align-items: center; gap: 10px; }
    .logo-badge {
      background: #4338ca;
      color: #ffffff;
      font-weight: 900;
      font-size: 13pt;
      padding: 6px 12px;
      border-radius: 8px;
    }
    .title { font-size: 13pt; font-weight: 900; text-transform: uppercase; margin: 0; }
    .subtitle { font-size: 8.5pt; color: #64748b; margin: 2px 0 0 0; font-weight: 600; }
    .meta-box { text-align: right; font-size: 8.5pt; font-family: monospace; color: #64748b; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
    .info-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 14px;
    }
    .info-label { font-size: 8pt; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 2px; }
    .info-val { font-size: 11pt; font-weight: 800; color: #0f172a; }
    .total-banner {
      background: #ecfdf5;
      border: 1.5px solid #10b981;
      border-radius: 10px;
      padding: 12px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .total-val { font-size: 20pt; font-weight: 900; color: #065f46; font-family: monospace; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 16px; }
    th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      text-align: left;
      padding: 7px 10px;
      border-bottom: 1.5px solid #cbd5e1;
      text-transform: uppercase;
      font-size: 8pt;
    }
    td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
    tr { page-break-inside: avoid; }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 50px;
      margin-top: 35px;
      page-break-inside: avoid;
    }
    .sig-line {
      border-top: 1px solid #64748b;
      margin-top: 35px;
      padding-top: 6px;
      text-align: center;
      font-size: 9pt;
    }
    .sig-name { font-weight: 700; color: #0f172a; }
    .sig-role { font-size: 8pt; color: #64748b; }
    .disclaimer {
      text-align: center;
      font-size: 8pt;
      font-style: italic;
      color: #64748b;
      margin-top: 20px;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-box">
      <div class="logo-badge">CF</div>
      <div>
        <h1 class="title">CorpFlats Residence Service</h1>
        <p class="subtitle">Demonstrativo Oficial de Diárias • Governança & Camareiras</p>
      </div>
    </div>
    <div class="meta-box">
      <div><strong>Protocolo:</strong> ${protocol}</div>
      <div><strong>Emissão:</strong> ${nowFmt}</div>
    </div>
  </div>

  <div class="grid-2">
    <div class="info-card">
      <div class="info-label">Colaboradora Responsável</div>
      <div class="info-val">${name} <span style="font-size: 9pt; font-weight: normal; color: #64748b;">(${cleaner.role || "camareira"})</span></div>
    </div>
    <div class="info-card">
      <div class="info-label">Período de Apuração</div>
      <div class="info-val">${startFmt} até ${endFmt}</div>
    </div>
  </div>

  <div class="total-banner">
    <div>
      <div style="font-size: 8.5pt; font-weight: 700; color: #065f46; text-transform: uppercase;">Valor Total Líquido a Receber</div>
      <div class="total-val">R$ ${total}</div>
      <div style="font-size: 8.5pt; color: #047857; margin-top: 2px;">
        Cálculo: <strong>${count} quartos</strong> × <strong>R$ ${rate}</strong> por quarto limpo
      </div>
    </div>
    <div style="text-align: right;">
      <span style="background: #10b981; color: white; padding: 4px 10px; border-radius: 20px; font-weight: 800; font-size: 8.5pt;">
        Aprovado para Pagamento
      </span>
      <div style="font-size: 8.5pt; color: #64748b; margin-top: 6px; font-family: monospace;">
        Tempo Médio: ~${cleaner.avgDurationMinutes || 35} min/quarto
      </div>
    </div>
  </div>

  <div style="font-weight: 800; font-size: 9pt; text-transform: uppercase; margin-bottom: 6px;">
    Detalhamento dos Apartamentos Atendidos (${cleaner.cleanings?.length || 0} itens):
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 35px; text-align: center;">#</th>
        <th>Data</th>
        <th>Horário</th>
        <th>Apartamento</th>
        <th style="text-align: center;">Duração</th>
        <th style="text-align: right;">Valor</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr style="background: #f8fafc; font-weight: bold; border-top: 2px solid #cbd5e1;">
        <td colspan="4" style="text-align: right; text-transform: uppercase; padding: 8px 10px;">Total (${count} diárias):</td>
        <td style="text-align: center; padding: 8px 10px;">~${cleaner.avgDurationMinutes || 35} min méd.</td>
        <td style="text-align: right; color: #059669; font-size: 11pt; font-family: monospace; padding: 8px 10px;">R$ ${total}</td>
      </tr>
    </tfoot>
  </table>

  <div class="disclaimer">
    "Declaramos para os devidos fins a realização das limpezas e higienizações acima discriminadas no padrão de excelência CorpFlats."
  </div>

  <div class="signatures">
    <div>
      <div class="sig-line">
        <div class="sig-name">Gestão CorpFlats</div>
        <div class="sig-role">Administração & Governança</div>
      </div>
    </div>
    <div>
      <div class="sig-line">
        <div class="sig-name">${name}</div>
        <div class="sig-role">Colaboradora de Governança</div>
      </div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 250);
    };
  </script>
</body>
</html>`

  const win = window.open("", "_blank")
  if (win) {
    win.document.write(html)
    win.document.close()
    win.focus()
  } else {
    document.body.classList.add("printing-receipt-mode")
    window.print()
  }
}

function printGeneralReportWindow(report: any, history: any[], startDate: string, endDate: string, user: any, isAdmin: boolean) {
  const startFmt = formatDate(startDate)
  const endFmt = formatDate(endDate)
  const now = new Date()
  const nowFmt = now.toLocaleDateString("pt-BR") + " às " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  const protocol = `#REL-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-GOV`

  if (!isAdmin) {
    const cleanerData = {
      name: user?.name || user?.username,
      username: user?.username,
      role: user?.role || "camareira",
      count: history.length,
      ratePerRoom: report?.myRatePerRoom || report?.defaultRatePerRoom || 35.00,
      totalToPay: report?.myNetToPay ?? report?.myTotalToPay ?? (history.length * Number(report?.myRatePerRoom || 35)),
      avgDurationMinutes: 35,
      cleanings: history
    }
    return printReceiptWindow(cleanerData, startDate, endDate)
  }

  const grandTotal = formatBRL(report?.grandTotalNetToPay ?? report?.grandTotalToPay ?? 0)
  const totalCleanings = report?.totalCleanings || (report?.cleaningsByUser || []).reduce((acc: number, c: any) => acc + (c.count || 0), 0)

  const cleanerRowsHtml = (report?.cleaningsByUser || []).map((c: any) => `
    <tr>
      <td style="padding: 8px 10px;">
        <strong>${c.name || c.username}</strong>
        <span style="font-size: 8.5pt; color: #64748b; text-transform: capitalize;"> (${c.role})</span>
      </td>
      <td style="text-align: center; padding: 8px 10px; font-weight: bold;">${c.count} flats</td>
      <td style="text-align: center; padding: 8px 10px; font-family: monospace;">R$ ${Number(c.ratePerRoom || 35).toFixed(2)}</td>
      <td style="text-align: right; padding: 8px 10px; font-family: monospace;">R$ ${formatBRL(c.totalToPay)}</td>
      <td style="text-align: right; padding: 8px 10px; font-family: monospace; color: #b45309;">- R$ ${formatBRL(c.advancesInPeriod || 0)}</td>
      <td style="text-align: right; padding: 8px 10px; font-weight: 800; color: #059669; font-family: monospace; font-size: 11pt;">
        R$ ${formatBRL(c.netToPay ?? c.totalToPay)}
      </td>
    </tr>
  `).join("")

  const roomsRowsHtml = (history || [])
    .slice()
    .sort((a: any, b: any) => new Date(a.completedAt || a.effectiveDate || a.requestDate).getTime() - new Date(b.completedAt || b.effectiveDate || b.requestDate).getTime())
    .map((entry: any, idx: number) => {
      const execDate = entry.effectiveDate || (entry.completedAt ? entry.completedAt.substring(0, 10) : entry.requestDate)
      const dateFmt = formatDate(execDate)
      let timeFmt = "—"
      if (entry.cleaningStartedAt && entry.completedAt) {
        timeFmt = `${format(new Date(entry.cleaningStartedAt), "HH:mm")} às ${format(new Date(entry.completedAt), "HH:mm")}`
      } else if (entry.completedAt) {
        timeFmt = format(new Date(entry.completedAt), "HH:mm")
      }
      const dur = entry.durationMinutes ? `${entry.durationMinutes} min` : "~35 min"
      const guest = entry.leavingGuest ? `<div style="font-size: 8pt; color: #64748b;">Saída: ${entry.leavingGuest}</div>` : ""
      const origin = entry.addedBy ? `Manual (${entry.addedBy})` : "PMS Automático"

      return `
        <tr>
          <td style="text-align: center; color: #94a3b8; font-family: monospace;">${String(idx + 1).padStart(2, "0")}</td>
          <td>${dateFmt}</td>
          <td style="font-family: monospace; color: #475569;">${timeFmt}</td>
          <td><strong>Apartamento ${entry.flatNumber}</strong>${guest}</td>
          <td>${entry.assignedUsername || "Camareira"}</td>
          <td style="text-align: center; font-family: monospace;">${dur}</td>
          <td style="font-size: 8pt; color: #64748b;">${origin}</td>
        </tr>
      `
    }).join("")

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório de Governança - CorpFlats</title>
  <style>
    @page { size: A4 portrait; margin: 14mm 15mm 14mm 15mm; }
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 9pt;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .logo-box { display: flex; align-items: center; gap: 10px; }
    .logo-badge {
      background: #0284c7;
      color: #ffffff;
      font-weight: 900;
      font-size: 13pt;
      padding: 6px 12px;
      border-radius: 8px;
    }
    .title { font-size: 13pt; font-weight: 900; text-transform: uppercase; margin: 0; }
    .subtitle { font-size: 8.5pt; color: #64748b; margin: 2px 0 0 0; font-weight: 600; }
    .meta-box { text-align: right; font-size: 8.5pt; font-family: monospace; color: #64748b; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .summary-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 14px;
      text-align: center;
    }
    .summary-box.highlight { background: #ecfdf5; border-color: #10b981; }
    .summary-label { font-size: 8pt; font-weight: 700; color: #64748b; text-transform: uppercase; }
    .summary-val { font-size: 16pt; font-weight: 900; color: #0f172a; margin-top: 2px; }
    .summary-val.highlight { color: #065f46; font-family: monospace; }
    .section-title {
      font-weight: 800;
      font-size: 9.5pt;
      text-transform: uppercase;
      margin: 16px 0 8px 0;
      border-left: 3px solid #0284c7;
      padding-left: 8px;
      color: #0f172a;
    }
    table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 16px; }
    th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      text-align: left;
      padding: 6px 8px;
      border-bottom: 1.5px solid #cbd5e1;
      text-transform: uppercase;
      font-size: 7.5pt;
    }
    td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
    tr { page-break-inside: avoid; }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 50px;
      margin-top: 30px;
      page-break-inside: avoid;
    }
    .sig-line {
      border-top: 1px solid #64748b;
      margin-top: 30px;
      padding-top: 6px;
      text-align: center;
      font-size: 8.5pt;
    }
    .sig-name { font-weight: 700; color: #0f172a; }
    .sig-role { font-size: 7.5pt; color: #64748b; }
    .disclaimer {
      text-align: center;
      font-size: 7.5pt;
      font-style: italic;
      color: #64748b;
      margin-top: 20px;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-box">
      <div class="logo-badge">CF</div>
      <div>
        <h1 class="title">CorpFlats Residence Service</h1>
        <p class="subtitle">Relatório Oficial de Fechamento de Governança & Diárias</p>
      </div>
    </div>
    <div class="meta-box">
      <div><strong>Protocolo:</strong> ${protocol}</div>
      <div><strong>Período:</strong> ${startFmt} a ${endFmt}</div>
      <div><strong>Emissão:</strong> ${nowFmt}</div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-box highlight">
      <div class="summary-label">Líquido a Pagar na Quinzena</div>
      <div class="summary-val highlight">R$ ${grandTotal}</div>
      <div style="font-size: 7.5pt; color: #047857; margin-top: 2px;">Bruto produzido abatendo adiantamentos</div>
    </div>
    <div class="summary-box">
      <div class="summary-label">Quartos Limpos no Período</div>
      <div class="summary-val">${totalCleanings} flats</div>
      <div style="font-size: 7.5pt; color: #64748b; margin-top: 2px;">Check-outs + Manuais</div>
    </div>
    <div class="summary-box">
      <div class="summary-label">Camareiras com Diárias</div>
      <div class="summary-val">${report?.cleaningsByUser?.length || 0} ativas</div>
      <div style="font-size: 7.5pt; color: #64748b; margin-top: 2px;">Colaboradoras credenciadas</div>
    </div>
  </div>

  <div class="section-title">1. Resumo Consolidado de Diárias por Colaboradora</div>
  <table>
    <thead>
      <tr>
        <th>Colaboradora</th>
        <th style="text-align: center;">Quartos Executados</th>
        <th style="text-align: center;">Valor por Quarto</th>
        <th style="text-align: right;">Bruto Produzido</th>
        <th style="text-align: right;">Vales no Período</th>
        <th style="text-align: right;">Líquido a Pagar</th>
      </tr>
    </thead>
    <tbody>
      ${cleanerRowsHtml}
    </tbody>
    <tfoot>
      <tr style="background: #f8fafc; font-weight: bold; border-top: 2px solid #cbd5e1;">
        <td style="padding: 6px 8px; text-transform: uppercase;">Total Geral:</td>
        <td style="text-align: center; padding: 6px 8px;">${totalCleanings} flats</td>
        <td style="text-align: center; padding: 6px 8px;">—</td>
        <td style="text-align: right; padding: 6px 8px; font-family: monospace;">R$ ${formatBRL(report?.grandTotalToPay)}</td>
        <td style="text-align: right; padding: 6px 8px; font-family: monospace; color: #b45309;">- R$ ${formatBRL(report?.grandTotalAdvances || 0)}</td>
        <td style="text-align: right; color: #059669; font-size: 11pt; font-family: monospace; padding: 6px 8px;">R$ ${grandTotal}</td>
      </tr>
    </tfoot>
  </table>

  <div class="section-title">2. Detalhamento Auditável de Todos os Quartos Limpos (${history?.length || 0} registros)</div>
  <table>
    <thead>
      <tr>
        <th style="width: 30px; text-align: center;">#</th>
        <th>Data</th>
        <th>Horário</th>
        <th>Apartamento</th>
        <th>Camareira</th>
        <th style="text-align: center;">Duração</th>
        <th>Origem</th>
      </tr>
    </thead>
    <tbody>
      ${roomsRowsHtml}
    </tbody>
  </table>

  <div class="disclaimer">
    "Relatório gerado automaticamente pelo Sistema Integrado CorpFlats PMS & Governança. Todos os registros foram auditados eletronicamente."
  </div>

  <div class="signatures">
    <div>
      <div class="sig-line">
        <div class="sig-name">Supervisão de Governança</div>
        <div class="sig-role">Conferência dos Apartamentos</div>
      </div>
    </div>
    <div>
      <div class="sig-line">
        <div class="sig-name">Diretoria Administrativa / Financeiro</div>
        <div class="sig-role">Aprovação para Liberação de Pagamento</div>
      </div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 250);
    };
  </script>
</body>
</html>`

  const win = window.open("", "_blank")
  if (win) {
    win.document.write(html)
    win.document.close()
    win.focus()
  } else {
    document.body.classList.add("printing-report-mode")
    window.print()
  }
}

// ── COMPONENTE PRINCIPAL UNIFICADO ──────────────────────────────────────────
export default function Reports() {
  const [location] = useLocation()
  const { data: user, isLoading: loadingUser } = useGetMe()
  const { toast } = useToast()
  const isAdmin = user?.role === "admin"

  // Se o usuário entrou por /extrato, inicia na aba de Extrato; caso contrário, no Fechamento Quinzenal
  const defaultTab = location.includes("extrato") ? "statement" : location.includes("history") ? "history" : "payroll"
  const [activeTab, setActiveTab] = useState<string>(defaultTab)

  // ── Período e Quinzena Selecionada ──
  const now = new Date()
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(now)
  const [selectedQuinzena, setSelectedQuinzena] = useState<"q1" | "q2" | "month" | "custom">("month")

  const initialStart = format(startOfMonth(now), "yyyy-MM-dd")
  const initialEnd = format(endOfMonth(now), "yyyy-MM-dd")

  const [startDate, setStartDate] = useState(initialStart)
  const [endDate, setEndDate] = useState(initialEnd)

  // ── Dados do Backend ──
  const [report, setReport] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCleanerFilter, setSelectedCleanerFilter] = useState<string>("all")

  // ── Configuração de Taxas ──
  const [ratesModalOpen, setRatesModalOpen] = useState(false)
  const [defaultRateInput, setDefaultRateInput] = useState("35.00")
  const [cleanersList, setCleanersList] = useState<any[]>([])
  const [userRatesInput, setUserRatesInput] = useState<Record<string, string>>({})
  const [savingRates, setSavingRates] = useState(false)

  // ── Modal de Recibo Individual da Camareira ──
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [activeCleanerReceipt, setActiveCleanerReceipt] = useState<any | null>(null)

  // ── Gestão de Limpezas Manuais / Retroativas (ADM) ──
  const [flatsList, setFlatsList] = useState<any[]>([])
  const [addCleaningModalOpen, setAddCleaningModalOpen] = useState(false)
  const [addFlatNumber, setAddFlatNumber] = useState("")
  const [addRequestDate, setAddRequestDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const [addCleanerId, setAddCleanerId] = useState("")
  const [addDurationMinutes, setAddDurationMinutes] = useState("35")
  const [addAdminNote, setAddAdminNote] = useState("")
  const [isSubmittingAddCleaning, setIsSubmittingAddCleaning] = useState(false)

  // ── Confirmação de Exclusão de Limpeza ──
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [cleaningToDelete, setCleaningToDelete] = useState<any | null>(null)
  const [isDeletingCleaning, setIsDeletingCleaning] = useState(false)

  // ── Módulo de Pagamento & Vale (PIX / Inter) ──
  const [payModalOpen, setPayModalOpen] = useState(false)
  const [activePayCleaner, setActivePayCleaner] = useState<any | null>(null)
  const [payType, setPayType] = useState<"payment" | "advance">("payment")
  const [payAmount, setPayAmount] = useState("")
  const [payDescription, setPayDescription] = useState("")
  const [payingLoading, setPayingLoading] = useState(false)

  // ── Módulo de Extrato & Ledger Detalhado ──
  const [selectedStatementCleanerId, setSelectedStatementCleanerId] = useState<string>("")
  const [statementData, setStatementData] = useState<MaidStatementData | null>(null)
  const [loadingStatement, setLoadingStatement] = useState(false)
  const [statementFilter, setStatementFilter] = useState<"all" | "credits" | "debits">("all")
  const [selectedEntry, setSelectedEntry] = useState<StatementEntry | null>(null)
  const [copiedPix, setCopiedPix] = useState(false)
  const [copiedReceipt, setCopiedReceipt] = useState(false)
  const [sendingWa, setSendingWa] = useState(false)

  // ── Busca de Dados Globais ──
  const fetchReport = async () => {
    setLoading(true)
    try {
      const [repRes, histRes, ratesRes, flatsRes, balancesRes] = await Promise.all([
        fetch(`/api/analytics/report?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" }).then(r => r.json()),
        fetch(`/api/cleaning/history?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" }).then(r => r.json()),
        fetch("/api/cleaning/rates", { credentials: "include" }).then(r => r.json()).catch(() => null),
        fetch("/api/flats", { credentials: "include" }).then(r => r.json()).catch(() => []),
        fetch("/api/maids/all-balances").then(r => r.json()).catch(() => [])
      ])

      setReport(repRes)
      setHistory(Array.isArray(histRes) ? histRes : [])
      if (Array.isArray(flatsRes) && flatsRes.length > 0) setFlatsList(flatsRes)

      if (Array.isArray(balancesRes) && balancesRes.length > 0) {
        setCleanersList(balancesRes)
        if (!selectedStatementCleanerId) {
          setSelectedStatementCleanerId(String(balancesRes[0].id))
        }
      }

      if (ratesRes) {
        if (ratesRes.defaultRatePerRoom) setDefaultRateInput(String(ratesRes.defaultRatePerRoom))
        if (Array.isArray(ratesRes.cleaners)) {
          const initialMap: Record<string, string> = {}
          ratesRes.cleaners.forEach((c: any) => {
            initialMap[String(c.userId)] = String(c.rate !== undefined ? c.rate : ratesRes.defaultRatePerRoom || 35.00)
          })
          setUserRatesInput(initialMap)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      fetchReport()
    }
  }, [user, startDate, endDate])

  // ── Busca do Extrato da Camareira Selecionada ──
  const fetchStatement = async (targetId?: string) => {
    try {
      setLoadingStatement(true)
      const url = isAdmin && targetId
        ? `/api/maids/${targetId}/statement`
        : `/api/maids/statement/me`
      const res = await fetch(url)
      if (res.ok) {
        setStatementData(await res.json())
      }
    } catch (err: any) {
      toast({
        title: "Erro ao carregar extrato",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setLoadingStatement(false)
    }
  }

  useEffect(() => {
    if (!loadingUser) {
      if (isAdmin && selectedStatementCleanerId) {
        fetchStatement(selectedStatementCleanerId)
      } else if (!isAdmin) {
        fetchStatement()
      }
    }
  }, [loadingUser, isAdmin, selectedStatementCleanerId])

  // ── Seletor de Quinzena ──
  const applyQuinzena = (type: "q1" | "q2" | "month", targetMonth: Date = currentMonthDate) => {
    setSelectedQuinzena(type)
    if (type === "q1") {
      setStartDate(format(startOfMonth(targetMonth), "yyyy-MM-dd"))
      setEndDate(format(setDate(targetMonth, 15), "yyyy-MM-dd"))
    } else if (type === "q2") {
      setStartDate(format(setDate(targetMonth, 16), "yyyy-MM-dd"))
      setEndDate(format(endOfMonth(targetMonth), "yyyy-MM-dd"))
    } else if (type === "month") {
      setStartDate(format(startOfMonth(targetMonth), "yyyy-MM-dd"))
      setEndDate(format(endOfMonth(targetMonth), "yyyy-MM-dd"))
    }
  }

  const handlePrevMonth = () => {
    const newMonth = subMonths(currentMonthDate, 1)
    setCurrentMonthDate(newMonth)
    applyQuinzena(selectedQuinzena === "custom" ? "month" : selectedQuinzena, newMonth)
  }

  const handleNextMonth = () => {
    const newMonth = addMonths(currentMonthDate, 1)
    setCurrentMonthDate(newMonth)
    applyQuinzena(selectedQuinzena === "custom" ? "month" : selectedQuinzena, newMonth)
  }

  // ── Ações de Pagamento e Vales ──
  const handleOpenPay = (cleaner: any, type: "payment" | "advance") => {
    setActivePayCleaner(cleaner)
    setPayType(type)
    const suggested = type === "payment"
      ? (cleaner.netToPay && cleaner.netToPay > 0 ? String(cleaner.netToPay.toFixed(2)) : String(Number(cleaner.currentBalance || cleaner.totalToPay || 0).toFixed(2)))
      : ""
    setPayAmount(suggested)
    setPayDescription("")
    setPayModalOpen(true)
  }

  const handleConfirmPay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activePayCleaner) return
    const targetUserId = activePayCleaner.userId || activePayCleaner.id
    const amount = parseFloat(payAmount.replace(",", "."))
    if (!amount || amount <= 0) {
      toast({ title: "Valor inválido", description: "Informe um valor maior que zero.", variant: "destructive" })
      return
    }

    try {
      setPayingLoading(true)
      const res = await fetch(`/api/maids/${targetUserId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          type: payType,
          description: payDescription.trim() || undefined,
          sendWhatsApp: true,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast({
          title: payType === "advance" ? "✓ Vale Registrado!" : "✓ Pagamento Concluído!",
          description: data.message || "A operação foi lançada e notificada no WhatsApp.",
        })
        setPayModalOpen(false)
        fetchReport()
        if (isAdmin && selectedStatementCleanerId === String(targetUserId)) {
          fetchStatement(String(targetUserId))
        } else if (!isAdmin) {
          fetchStatement()
        }
      } else {
        toast({ title: "Falha no processamento", description: data.error || "Não foi possível processar.", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro de conexão", description: err.message, variant: "destructive" })
    } finally {
      setPayingLoading(false)
    }
  }

  // ── Enviar Extrato via WhatsApp ──
  const handleSendStatementWhatsApp = async (targetUserId?: number) => {
    try {
      setSendingWa(true)
      const uid = targetUserId || statementData?.userId || user?.id
      const res = await fetch("/api/maids/statement/send-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid }),
      })
      const data = await res.json()
      if (res.ok && (data.success || data.simulated)) {
        toast({
          title: "✓ Extrato Enviado com Sucesso!",
          description: `O resumo financeiro detalhado foi enviado para o WhatsApp cadastrado (${data.phone || ""}).`,
        })
      } else {
        toast({
          title: "Falha no Envio",
          description: data.error || data.message || "Verifique se o WhatsApp está cadastrado.",
          variant: "destructive",
        })
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" })
    } finally {
      setSendingWa(false)
    }
  }

  // ── Copiar Chave PIX ──
  const handleCopyPixKey = (key?: string) => {
    const targetKey = key || statementData?.pixKey
    if (!targetKey) return
    navigator.clipboard.writeText(targetKey)
    setCopiedPix(true)
    toast({ title: "Chave PIX copiada!", description: targetKey })
    setTimeout(() => setCopiedPix(false), 2500)
  }

  // ── Copiar Texto de Comprovante de Lançamento ──
  const handleCopyReceiptText = () => {
    if (!selectedEntry) return
    const isCredit = selectedEntry.entryType === "credit"
    const isAdvance = selectedEntry.payment?.type === "advance"
    const txType = isCredit ? "Crédito por Diária Concluída" : isAdvance ? "Vale Adiantamento" : "Pagamento PIX"

    const text = `🏨 *CorpFlats Soho — Comprovante de Lançamento*
----------------------------------------
*Tipo:* ${txType}
*Colaboradora:* ${statementData?.userName || "Camareira"}
*Chave PIX:* ${statementData?.pixKey || "Não cadastrada"}
*Data:* ${formatDate(selectedEntry.entryDate)} ${selectedEntry.createdAt && formatTime(selectedEntry.createdAt) ? `às ${formatTime(selectedEntry.createdAt)}` : ""}
*Descrição:* ${selectedEntry.description}
*Valor:* ${isCredit ? "+" : "−"} R$ ${formatBRL(selectedEntry.amount)}
*Saldo Resultante:* R$ ${formatBRL(selectedEntry.balanceAfter)}
${selectedEntry.payment?.interTxId ? `*TxID / Autenticação:* ${selectedEntry.payment.interTxId}\n*Banco:* Banco Inter S.A.` : "*Registro:* Auditado e registrado no sistema"}
----------------------------------------
Comprovante digital emitido em ${new Date().toLocaleDateString("pt-BR")}`

    navigator.clipboard.writeText(text)
    setCopiedReceipt(true)
    toast({ title: "Comprovante copiado!", description: "Cole no WhatsApp para envio rápido." })
    setTimeout(() => setCopiedReceipt(false), 2500)
  }

  // ── Transição Direta para a Aba de Extrato da Camareira ──
  const handleViewCleanerStatement = (cleaner: any) => {
    setSelectedStatementCleanerId(String(cleaner.userId || cleaner.id))
    setActiveTab("statement")
  }

  // ── Gestão de Limpezas Retroativas ──
  const handleOpenAddCleaningModal = () => {
    setAddFlatNumber(flatsList[0]?.number || "101")
    setAddRequestDate(startDate || format(new Date(), "yyyy-MM-dd"))
    const defaultCleaner = cleanersList.find(c => c.username?.toLowerCase() === "grazi") || cleanersList[0]
    setAddCleanerId(defaultCleaner ? String(defaultCleaner.userId || defaultCleaner.id) : "3")
    setAddDurationMinutes("35")
    setAddAdminNote("")
    setAddCleaningModalOpen(true)
  }

  const handleSubmitAddCleaning = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addFlatNumber || !addRequestDate) return
    setIsSubmittingAddCleaning(true)
    try {
      const res = await fetch("/api/cleaning/admin/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: addFlatNumber,
          requestDate: addRequestDate,
          assignedUserId: addCleanerId ? Number(addCleanerId) : null,
          status: "clean",
          durationMinutes: Number(addDurationMinutes) || 35,
          adminNote: addAdminNote.trim() || null
        }),
        credentials: "include"
      })
      if (res.ok) {
        toast({ title: "✓ Diária Registrada!", description: `Flat ${addFlatNumber} adicionado ao fechamento.` })
        setAddCleaningModalOpen(false)
        fetchReport()
      } else {
        const err = await res.json()
        toast({ title: "Erro", description: err.error || "Erro ao adicionar diária.", variant: "destructive" })
      }
    } finally {
      setIsSubmittingAddCleaning(false)
    }
  }

  const executeDeleteCleaning = async () => {
    if (!cleaningToDelete?.id) return
    setIsDeletingCleaning(true)
    try {
      const res = await fetch(`/api/cleaning/admin/record/${cleaningToDelete.id}`, {
        method: "DELETE",
        credentials: "include"
      })
      if (res.ok) {
        toast({ title: "Diária Removida", description: "O registro foi excluído do fechamento." })
        setDeleteConfirmOpen(false)
        setCleaningToDelete(null)
        fetchReport()
      } else {
        const err = await res.json()
        toast({ title: "Erro", description: err.error || "Erro ao remover.", variant: "destructive" })
      }
    } finally {
      setIsDeletingCleaning(false)
    }
  }

  // ── Salvar Taxas por Quarto ──
  const handleSaveRates = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingRates(true)
    try {
      const formattedUserRates: Record<string, number> = {}
      Object.entries(userRatesInput).forEach(([userId, val]) => {
        const num = parseFloat(val)
        if (!isNaN(num) && num >= 0) {
          formattedUserRates[userId] = num
        }
      })

      const res = await fetch("/api/cleaning/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          defaultRatePerRoom: parseFloat(defaultRateInput) || 35.00,
          userRates: formattedUserRates
        }),
        credentials: "include"
      })
      if (res.ok) {
        toast({ title: "Taxas Atualizadas", description: "Os novos valores de diária foram salvos com sucesso." })
        setRatesModalOpen(false)
        fetchReport()
      }
    } finally {
      setSavingRates(false)
    }
  }

  // ── Filtros da Lista de Extrato ──
  const rawStatementList = statementData?.statement || []
  const creditEntries = useMemo(() => rawStatementList.filter(e => e.entryType === "credit"), [rawStatementList])
  const debitEntries = useMemo(() => rawStatementList.filter(e => e.entryType === "debit"), [rawStatementList])
  const totalCredits = useMemo(() => creditEntries.reduce((acc, it) => acc + Number(it.amount || 0), 0), [creditEntries])
  const totalDebits = useMemo(() => debitEntries.reduce((acc, it) => acc + Number(it.amount || 0), 0), [debitEntries])

  const filteredStatementList = useMemo(() => {
    if (statementFilter === "credits") return creditEntries
    if (statementFilter === "debits") return debitEntries
    return rawStatementList
  }, [statementFilter, rawStatementList, creditEntries, debitEntries])

  const filteredHistory = history.filter(h => {
    if (selectedCleanerFilter === "all") return true
    return String(h.assignedUserId) === selectedCleanerFilter || h.assignedUsername === selectedCleanerFilter
  })

  // Saldo geral da camareira em visualização
  const statementBalance = statementData?.balance || 0
  const statementBalancePositive = statementBalance >= 0

  return (
    <Shell>
      <div className="flex-1 p-3 sm:p-6 md:p-8 max-w-6xl mx-auto w-full space-y-5 print:p-0 print:m-0 print:max-w-none pb-24">
        
        {/* ── CABEÇALHO SUPERIOR ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-border/80">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Badge variant="outline" className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 border-primary/30 text-primary bg-primary/5">
                🧹 Governança & Financeiro
              </Badge>
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                Ao Vivo
              </Badge>
            </div>
            <h1 className="text-xl sm:text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
              <Wallet className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-600 shrink-0" />
              <span>{isAdmin ? "Fechamento & Diárias das Camareiras" : "Meu Fechamento & Extrato"}</span>
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              {isAdmin 
                ? "Painel unificado de fechamento quinzenal, conta corrente com saldos e vales, pagamentos PIX e histórico operacional auditado." 
                : `Acompanhe suas diárias executadas, vales recebidos, comprovantes e saldo em conta corrente, ${user?.username}!`}
            </p>
          </div>

          {/* Botões de Ação Globais */}
          <div className="flex items-center gap-2 print:hidden flex-wrap sm:flex-nowrap">
            {isAdmin && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setRatesModalOpen(true)}
                className="h-9 px-3 rounded-xl text-xs font-bold gap-1.5 border-border"
              >
                <Sliders className="w-3.5 h-3.5 text-primary" />
                <span className="hidden sm:inline">Configurar Diária</span>
              </Button>
            )}

            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => printGeneralReportWindow(report, filteredHistory, startDate, endDate, user, isAdmin)} 
              className="h-9 px-3 rounded-xl text-xs font-bold gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Imprimir A4</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchReport}
              disabled={loading}
              className="h-9 px-3 rounded-xl text-xs font-bold gap-1.5"
              title="Atualizar dados"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
          </div>
        </div>

        {/* ── BARRA SELETORA DE QUINZENAS E MESES ── */}
        <Card className="rounded-3xl border border-border p-3.5 sm:p-4 shadow-sm print:hidden">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            {/* Navegador de Mês */}
            <div className="flex items-center justify-between sm:justify-start gap-1 bg-muted/40 p-1.5 rounded-2xl border border-border/60">
              <Button size="icon" variant="ghost" onClick={handlePrevMonth} className="h-8 w-8 rounded-xl hover:bg-background">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="font-black text-xs sm:text-sm text-foreground min-w-[130px] text-center capitalize">
                {format(currentMonthDate, "MMMM 'de' yyyy", { locale: ptBR })}
              </div>
              <Button size="icon" variant="ghost" onClick={handleNextMonth} className="h-8 w-8 rounded-xl hover:bg-background">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Seletor Rápido de Quinzenas */}
            <div className="grid grid-cols-3 sm:flex sm:items-center gap-1.5">
              <Button
                variant={selectedQuinzena === "q1" ? "default" : "outline"}
                size="sm"
                onClick={() => applyQuinzena("q1")}
                className="h-9 px-2 sm:px-3 text-[11px] sm:text-xs font-bold rounded-xl gap-1 shadow-2xs justify-center"
              >
                <Calendar className="w-3.5 h-3.5 shrink-0 hidden xs:inline" />
                <span>1ª Quinzena</span>
              </Button>

              <Button
                variant={selectedQuinzena === "q2" ? "default" : "outline"}
                size="sm"
                onClick={() => applyQuinzena("q2")}
                className="h-9 px-2 sm:px-3 text-[11px] sm:text-xs font-bold rounded-xl gap-1 shadow-2xs justify-center"
              >
                <Calendar className="w-3.5 h-3.5 shrink-0 hidden xs:inline" />
                <span>2ª Quinzena</span>
              </Button>

              <Button
                variant={selectedQuinzena === "month" ? "default" : "outline"}
                size="sm"
                onClick={() => applyQuinzena("month")}
                className="h-9 px-2 sm:px-3 text-[11px] sm:text-xs font-bold rounded-xl gap-1 shadow-2xs justify-center"
              >
                <span>Mês Todo</span>
              </Button>
            </div>

            {/* Inputs Manuais de Data */}
            <div className="flex items-center gap-1.5 bg-muted/40 p-1.5 rounded-2xl border border-border/60">
              <Input 
                type="date" 
                value={startDate} 
                onChange={e => {
                  setStartDate(e.target.value)
                  setSelectedQuinzena("custom")
                }} 
                className="h-8 text-xs flex-1 sm:w-32 rounded-xl bg-background border border-border/50" 
              />
              <span className="text-xs font-bold text-muted-foreground px-1">até</span>
              <Input 
                type="date" 
                value={endDate} 
                onChange={e => {
                  setEndDate(e.target.value)
                  setSelectedQuinzena("custom")
                }} 
                className="h-8 text-xs flex-1 sm:w-32 rounded-xl bg-background border border-border/50" 
              />
            </div>
          </div>
        </Card>

        {/* ── CARDS DE KPIS FINANCEIROS DA QUINZENA ── */}
        {isAdmin ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
            {/* 1. Bruto Produzido */}
            <Card className="p-4 rounded-3xl border border-border bg-card shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Produzido na Quinzena
                </span>
                <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-lg sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  + R$ {formatBRL(report?.grandTotalToPay)}
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">
                  {report?.totalCleanings || 0} quartos concluídos
                </span>
              </div>
            </Card>

            {/* 2. Vales / Adiantamentos */}
            <Card className="p-4 rounded-3xl border border-border bg-card shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Vales no Período
                </span>
                <div className="w-7 h-7 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <Gift className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-lg sm:text-2xl font-black text-amber-600 dark:text-amber-400">
                  − R$ {formatBRL(report?.grandTotalAdvances || 0)}
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">
                  Abatidos do acerto
                </span>
              </div>
            </Card>

            {/* 3. Líquido a Pagar na Quinzena */}
            <Card className="p-4 rounded-3xl border-2 border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-950/20 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-[11px] font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                  Líquido a Pagar
                </span>
                <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-lg sm:text-2xl font-black text-emerald-700 dark:text-emerald-300">
                  R$ {formatBRL(report?.grandTotalNetToPay ?? report?.grandTotalToPay ?? 0)}
                </div>
                <span className="text-[10px] text-emerald-800/80 dark:text-emerald-400 font-bold">
                  Produzido − Vales
                </span>
              </div>
            </Card>

            {/* 4. Colaboradoras Ativas */}
            <Card className="p-4 rounded-3xl border border-border bg-card shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Camareiras Ativas
                </span>
                <div className="w-7 h-7 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-lg sm:text-2xl font-black text-foreground">
                  {report?.cleaningsByUser?.length || 0} colaboradoras
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">
                  Com produção no período
                </span>
              </div>
            </Card>
          </div>
        ) : (
          /* Card da Camareira */
          <div className="rounded-3xl p-5 sm:p-7 border shadow-md relative overflow-hidden transition-all bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 text-white border-emerald-500/40">
            <div className="relative z-10 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-100 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-300" />
                  Saldo Disponível a Receber
                </span>
                <span className="text-[10px] font-bold bg-white/20 px-2.5 py-0.5 rounded-full">
                  Ao Vivo
                </span>
              </div>

              <div className="text-3xl sm:text-5xl font-black tracking-tight">
                R$ {formatBRL(statementBalance)}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-white/15">
                {statementData?.pixKey && (
                  <button
                    type="button"
                    onClick={() => handleCopyPixKey(statementData.pixKey)}
                    className="inline-flex items-center gap-1.5 bg-black/25 hover:bg-black/40 text-emerald-100 text-xs font-mono px-3 py-1.5 rounded-xl border border-white/15"
                  >
                    <span className="font-sans font-bold text-[10px] text-emerald-300 uppercase">PIX:</span>
                    <span>{statementData.pixKey}</span>
                    {copiedPix ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5 text-white/70" />}
                  </button>
                )}

                <Button
                  onClick={() => handleSendStatementWhatsApp()}
                  disabled={sendingWa}
                  size="sm"
                  className="rounded-xl font-bold text-xs gap-1.5 bg-[#25d366] hover:bg-[#20bd5a] text-white"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sendingWa ? "Enviando..." : "Receber no WhatsApp"}</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── ABAS PRINCIPAIS UNIFICADAS ── */}
        {isAdmin ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
            <TabsList className="bg-card border border-border p-1.5 rounded-2xl h-auto grid grid-cols-2 sm:grid-cols-4 gap-1.5 shadow-xs print:hidden w-full">
              <TabsTrigger 
                value="payroll" 
                className="rounded-xl py-2.5 px-3 text-xs font-bold gap-2 flex items-center justify-center data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
              >
                <DollarSign className="w-4 h-4 shrink-0 text-emerald-500 data-[state=active]:text-inherit" />
                <span>Fechamento Quinzenal</span>
              </TabsTrigger>

              <TabsTrigger 
                value="statement" 
                className="rounded-xl py-2.5 px-3 text-xs font-bold gap-2 flex items-center justify-center data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
              >
                <Wallet className="w-4 h-4 shrink-0 text-teal-500 data-[state=active]:text-inherit" />
                <span>Extrato & Conta Corrente</span>
              </TabsTrigger>

              <TabsTrigger 
                value="history" 
                className="rounded-xl py-2.5 px-3 text-xs font-bold gap-2 flex items-center justify-center data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
              >
                <ListFilter className="w-4 h-4 shrink-0 text-primary data-[state=active]:text-inherit" />
                <span>Quartos Limpos ({history.length})</span>
              </TabsTrigger>

              <TabsTrigger 
                value="charts" 
                className="rounded-xl py-2.5 px-3 text-xs font-bold gap-2 flex items-center justify-center data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
              >
                <BarChart3 className="w-4 h-4 shrink-0 text-indigo-500 data-[state=active]:text-inherit" />
                <span>Produtividade</span>
              </TabsTrigger>
            </TabsList>

            {/* ══════════════════════════════════════════════════════════════════
                ABA 1: FECHAMENTO QUINZENAL (O PAINEL DE ACERTO TRANSPARENTE)
               ══════════════════════════════════════════════════════════════════ */}
            <TabsContent value="payroll" className="space-y-4 m-0">
              <Card className="rounded-3xl border border-border shadow-sm overflow-hidden">
                <CardHeader className="p-5 border-b border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                      <Receipt className="w-5 h-5 text-emerald-600" />
                      <span>Demonstrativo Consolidado de Fechamento por Camareira</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Cálculo exato: Bruto Produzido (−) Vales Concedidos (=) Líquido a Pagar da Quinzena
                    </CardDescription>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                        <tr>
                          <th className="p-3.5">Colaboradora</th>
                          <th className="p-3.5 text-center">Quartos Limpos</th>
                          <th className="p-3.5 text-center">Taxa / Flat</th>
                          <th className="p-3.5 text-right">Bruto Produzido</th>
                          <th className="p-3.5 text-right">Vales Concedidos</th>
                          <th className="p-3.5 text-right">Líquido a Pagar</th>
                          <th className="p-3.5 text-right">Saldo Atual</th>
                          <th className="p-3.5 text-center">Chave PIX</th>
                          <th className="p-3.5 text-right print:hidden">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(!report?.cleaningsByUser || report.cleaningsByUser.length === 0) ? (
                          <tr>
                            <td colSpan={9} className="p-8 text-center text-muted-foreground">
                              Nenhuma limpeza finalizada registrada no período de {formatDate(startDate)} a {formatDate(endDate)}.
                            </td>
                          </tr>
                        ) : (
                          report.cleaningsByUser.map((c: any) => {
                            const netVal = c.netToPay ?? (c.totalToPay - (c.advancesInPeriod || 0))
                            return (
                              <tr key={c.userId} className="hover:bg-muted/20 transition-colors">
                                <td className="p-3.5">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black text-xs">
                                      {(c.name || c.username).charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                      <span className="font-bold text-foreground block">{c.name || c.username}</span>
                                      <span className="text-[10px] text-muted-foreground capitalize">{c.role}</span>
                                    </div>
                                  </div>
                                </td>

                                <td className="p-3.5 text-center">
                                  <Badge className="bg-emerald-600 text-white font-black text-xs px-2.5 py-0.5">
                                    {c.count} {c.count === 1 ? "quarto" : "quartos"}
                                  </Badge>
                                </td>

                                <td className="p-3.5 text-center font-mono font-bold text-foreground">
                                  R$ {Number(c.ratePerRoom || report.defaultRatePerRoom || 35).toFixed(2)}
                                </td>

                                <td className="p-3.5 text-right font-mono font-semibold text-foreground">
                                  + R$ {formatBRL(c.totalToPay)}
                                </td>

                                <td className="p-3.5 text-right font-mono font-semibold text-amber-600">
                                  {Number(c.advancesInPeriod || 0) > 0 ? `− R$ ${formatBRL(c.advancesInPeriod)}` : "R$ 0,00"}
                                </td>

                                <td className="p-3.5 text-right">
                                  <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm sm:text-base font-mono">
                                    R$ {formatBRL(netVal)}
                                  </span>
                                </td>

                                <td className="p-3.5 text-right font-mono font-semibold text-foreground">
                                  R$ {formatBRL(c.currentBalance)}
                                </td>

                                <td className="p-3.5 text-center">
                                  {c.pixKey ? (
                                    <button
                                      type="button"
                                      onClick={() => handleCopyPixKey(c.pixKey)}
                                      className="inline-flex items-center gap-1 font-mono text-[10px] bg-muted hover:bg-muted/80 px-2 py-0.5 rounded-lg border border-border"
                                      title="Copiar Chave PIX"
                                    >
                                      <span>{c.pixKey.substring(0, 10)}…</span>
                                      <Copy className="w-3 h-3 text-muted-foreground" />
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground italic">Sem PIX</span>
                                  )}
                                </td>

                                <td className="p-3.5 text-right print:hidden">
                                  <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                    <Button
                                      size="sm"
                                      onClick={() => handleOpenPay(c, "payment")}
                                      className="h-8 px-2.5 text-[11px] font-bold rounded-xl gap-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                                      title="Pagar via PIX com comprovante automático"
                                    >
                                      <Banknote className="w-3.5 h-3.5" />
                                      <span>Pagar PIX</span>
                                    </Button>

                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleOpenPay(c, "advance")}
                                      className="h-8 px-2 text-[11px] font-bold rounded-xl gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                                      title="Lançar vale / adiantamento para abater do acerto"
                                    >
                                      <Gift className="w-3.5 h-3.5" />
                                      <span>Vale</span>
                                    </Button>

                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleViewCleanerStatement(c)}
                                      className="h-8 px-2 text-[11px] font-bold rounded-xl gap-1 hover:border-primary/40 text-primary"
                                      title="Ver extrato completo da conta corrente"
                                    >
                                      <Wallet className="w-3.5 h-3.5" />
                                      <span>Extrato</span>
                                    </Button>

                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        setActiveCleanerReceipt(c)
                                        setReceiptModalOpen(true)
                                      }}
                                      className="h-8 px-2 text-[11px] font-bold rounded-xl gap-1 text-muted-foreground hover:text-foreground"
                                      title="Gerar recibo A4 para impressão"
                                    >
                                      <Receipt className="w-3.5 h-3.5" />
                                      <span>Recibo</span>
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ══════════════════════════════════════════════════════════════════
                ABA 2: EXTRATO & CONTA CORRENTE (FINTECH LEDGER COMPLETO)
               ══════════════════════════════════════════════════════════════════ */}
            <TabsContent value="statement" className="space-y-4 m-0">
              {/* Seletor da Camareira */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3.5 sm:p-4 rounded-3xl border border-border">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-foreground">Colaboradora Selecionada:</span>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedStatementCleanerId}
                    onChange={e => setSelectedStatementCleanerId(e.target.value)}
                    className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground shadow-2xs"
                  >
                    {cleanersList.map(c => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name || c.username} — Saldo em Conta: R$ {formatBRL(c.balance)}
                      </option>
                    ))}
                  </select>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchStatement(selectedStatementCleanerId)}
                    disabled={loadingStatement}
                    className="h-10 px-3 rounded-xl text-xs font-bold"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingStatement ? "animate-spin text-primary" : ""}`} />
                  </Button>
                </div>
              </div>

              {/* Card Fintech de Saldo da Camareira */}
              <div className={`rounded-3xl p-5 sm:p-7 border shadow-md relative overflow-hidden transition-all ${
                statementBalancePositive 
                  ? "bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 text-white border-emerald-500/40" 
                  : "bg-gradient-to-br from-rose-600 via-rose-700 to-slate-900 text-white border-rose-500/40"
              }`}>
                <div className="relative z-10 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-100 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-300" />
                      Saldo em Conta Corrente • {statementData?.userName || "Camareira"}
                    </span>
                    <span className="text-[10px] font-bold bg-white/20 px-2.5 py-0.5 rounded-full">
                      Tempo Real
                    </span>
                  </div>

                  <div>
                    <div className="text-3xl sm:text-5xl font-black tracking-tight">
                      R$ {formatBRL(statementBalance)}
                    </div>

                    <div className="mt-2 flex items-center">
                      {statementData?.pixKey ? (
                        <button
                          type="button"
                          onClick={() => handleCopyPixKey(statementData.pixKey)}
                          className="inline-flex items-center gap-1.5 bg-black/25 hover:bg-black/40 text-emerald-100 text-xs font-mono px-3 py-1.5 rounded-xl border border-white/15"
                          title="Clique para copiar a chave PIX"
                        >
                          <span className="font-sans font-bold text-[10px] text-emerald-300 uppercase">PIX:</span>
                          <span className="truncate max-w-[180px] sm:max-w-xs">{statementData.pixKey}</span>
                          {copiedPix ? <Check className="w-3.5 h-3.5 text-emerald-300 ml-1" /> : <Copy className="w-3.5 h-3.5 text-white/70 ml-1" />}
                        </button>
                      ) : (
                        <span className="text-[11px] text-amber-200 bg-amber-950/40 px-2.5 py-1 rounded-xl border border-amber-500/30">
                          Chave PIX não cadastrada no perfil
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ações da Conta */}
                  <div className="pt-2 border-t border-white/15 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <Button
                      onClick={() => handleSendStatementWhatsApp()}
                      disabled={sendingWa}
                      className="h-11 rounded-2xl font-black text-xs gap-2 bg-[#25d366] hover:bg-[#20bd5a] text-white shadow-md flex-1"
                    >
                      <Send className="w-4 h-4 shrink-0" />
                      <span>{sendingWa ? "Enviando Extrato..." : "Enviar Extrato no WhatsApp"}</span>
                    </Button>

                    <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
                      <Button
                        onClick={() => {
                          const cl = cleanersList.find(c => String(c.id) === selectedStatementCleanerId)
                          handleOpenPay(cl || { id: Number(selectedStatementCleanerId), currentBalance: statementBalance }, "payment")
                        }}
                        className="h-11 px-4 rounded-2xl text-xs font-black gap-1.5 bg-white text-slate-900 hover:bg-slate-100 shadow-md"
                      >
                        <Banknote className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Pagar PIX</span>
                      </Button>

                      <Button
                        onClick={() => {
                          const cl = cleanersList.find(c => String(c.id) === selectedStatementCleanerId)
                          handleOpenPay(cl || { id: Number(selectedStatementCleanerId) }, "advance")
                        }}
                        className="h-11 px-4 rounded-2xl text-xs font-black gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-md"
                      >
                        <Gift className="w-4 h-4 text-amber-900 shrink-0" />
                        <span>Dar Vale</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Resumo Rápido de Entradas vs Saídas */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
                <div className="p-3.5 sm:p-4 rounded-2xl border border-border bg-card shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Total em Diárias</span>
                    <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="mt-2">
                    <div className="text-base sm:text-xl font-black text-emerald-600">+ R$ {formatBRL(totalCredits)}</div>
                    <span className="text-[10px] text-muted-foreground">{creditEntries.length} créditos registrados</span>
                  </div>
                </div>

                <div className="p-3.5 sm:p-4 rounded-2xl border border-border bg-card shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Total Pago & Vales</span>
                    <ArrowDownLeft className="w-4 h-4 text-rose-600" />
                  </div>
                  <div className="mt-2">
                    <div className="text-base sm:text-xl font-black text-rose-600">− R$ {formatBRL(totalDebits)}</div>
                    <span className="text-[10px] text-muted-foreground">{debitEntries.length} saídas registradas</span>
                  </div>
                </div>
              </div>

              {/* Filtros da Linha do Tempo */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setStatementFilter("all")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                    statementFilter === "all" ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                  }`}
                >
                  Todas ({rawStatementList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatementFilter("credits")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1 ${
                    statementFilter === "credits" ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <ArrowUpRight className="w-3 h-3" />
                  Diárias ({creditEntries.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatementFilter("debits")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1 ${
                    statementFilter === "debits" ? "bg-rose-600 text-white" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <ArrowDownLeft className="w-3 h-3" />
                  Pagos & Vales ({debitEntries.length})
                </button>
              </div>

              {/* Tabela de Lançamentos do Extrato */}
              <Card className="rounded-3xl border border-border shadow-xs overflow-hidden">
                <CardContent className="p-0">
                  {loadingStatement ? (
                    <div className="p-12 text-center text-xs text-muted-foreground">Carregando extrato completo...</div>
                  ) : filteredStatementList.length === 0 ? (
                    <div className="p-12 text-center text-xs text-muted-foreground">Nenhuma movimentação encontrada neste extrato.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                          <tr>
                            <th className="p-3.5">Tipo</th>
                            <th className="p-3.5">Data & Hora</th>
                            <th className="p-3.5">Descrição</th>
                            <th className="p-3.5 text-center">TxID / Autenticação</th>
                            <th className="p-3.5 text-right">Valor</th>
                            <th className="p-3.5 text-right">Saldo Após</th>
                            <th className="p-3.5 text-center">Comprovante</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filteredStatementList.map(entry => {
                            const isCredit = entry.entryType === "credit"
                            const isAdvance = entry.payment?.type === "advance"

                            return (
                              <tr 
                                key={entry.id} 
                                onClick={() => setSelectedEntry(entry)}
                                className="hover:bg-muted/30 transition-colors cursor-pointer"
                              >
                                <td className="p-3.5">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                                      isCredit ? "bg-emerald-500/15 text-emerald-600" : isAdvance ? "bg-amber-500/15 text-amber-600" : "bg-rose-500/15 text-rose-600"
                                    }`}>
                                      {isCredit ? <ArrowUpRight className="w-3.5 h-3.5" /> : isAdvance ? <Gift className="w-3.5 h-3.5" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
                                    </div>
                                    <span className={`font-bold ${isCredit ? "text-emerald-700 dark:text-emerald-400" : isAdvance ? "text-amber-700 dark:text-amber-400" : "text-rose-700 dark:text-rose-400"}`}>
                                      {isCredit ? "Crédito Diária" : isAdvance ? "Vale Adiantado" : "Pagamento PIX"}
                                    </span>
                                  </div>
                                </td>

                                <td className="p-3.5 text-muted-foreground whitespace-nowrap">
                                  <span className="font-semibold text-foreground">{formatDate(entry.entryDate)}</span>
                                  {entry.createdAt && (
                                    <span className="text-[11px] block text-muted-foreground/80">{formatTime(entry.createdAt)}</span>
                                  )}
                                </td>

                                <td className="p-3.5 font-medium text-foreground">
                                  {entry.description}
                                </td>

                                <td className="p-3.5 text-center">
                                  {entry.payment?.interTxId ? (
                                    <span className="font-mono text-[10px] bg-muted px-2 py-0.5 rounded-lg text-primary">
                                      {entry.payment.interTxId.substring(0, 14)}…
                                    </span>
                                  ) : isAdvance ? (
                                    <Badge className="text-[9px] px-1.5 py-0 bg-amber-500/15 text-amber-700 border-amber-500/20">
                                      Vale Local
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground text-[10px]">Auditado</span>
                                  )}
                                </td>

                                <td className={`p-3.5 text-right font-black text-sm ${isCredit ? "text-emerald-600" : "text-rose-600"}`}>
                                  {isCredit ? "+" : "−"} R$ {formatBRL(entry.amount)}
                                </td>

                                <td className="p-3.5 text-right font-bold text-foreground font-mono">
                                  R$ {formatBRL(entry.balanceAfter)}
                                </td>

                                <td className="p-3.5 text-center">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 text-xs font-bold gap-1 rounded-lg text-primary"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedEntry(entry)
                                    }}
                                  >
                                    <Share2 className="w-3 h-3" />
                                    <span>Ver</span>
                                  </Button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ══════════════════════════════════════════════════════════════════
                ABA 3: HISTÓRICO DE QUARTOS LIMPOS (AUDITORIA OPERACIONAL)
               ══════════════════════════════════════════════════════════════════ */}
            <TabsContent value="history" className="space-y-4 m-0">
              <Card className="rounded-3xl border border-border shadow-sm overflow-hidden">
                <CardHeader className="p-5 border-b border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                      <ListFilter className="w-5 h-5 text-primary" />
                      <span>Histórico Auditável de Limpezas Realizadas</span>
                    </CardTitle>
                    <CardDescription className="text-xs">Registro detalhado com data, flat, camareira e tempo de execução</CardDescription>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedCleanerFilter}
                      onChange={e => setSelectedCleanerFilter(e.target.value)}
                      className="h-8.5 rounded-xl border border-border bg-background px-3 text-xs font-semibold"
                    >
                      <option value="all">Todas as Camareiras</option>
                      {report?.cleaningsByUser?.map((u: any) => (
                        <option key={u.userId} value={String(u.userId)}>{u.name || u.username}</option>
                      ))}
                    </select>

                    <Button
                      type="button"
                      onClick={handleOpenAddCleaningModal}
                      size="sm"
                      className="h-8.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs gap-1.5 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar Limpeza Manual</span>
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  {filteredHistory.length === 0 ? (
                    <div className="p-12 text-center text-xs text-muted-foreground">Nenhuma limpeza encontrada no período selecionado.</div>
                  ) : (
                    <div>
                      <div className="max-h-[460px] overflow-y-auto overflow-x-auto print:max-h-none print:overflow-visible">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead className="bg-muted/95 backdrop-blur-md text-muted-foreground font-bold border-b border-border sticky top-0 z-10 shadow-2xs">
                            <tr>
                              <th className="p-3.5">Data da Limpeza</th>
                              <th className="p-3.5">Flat</th>
                              <th className="p-3.5">Camareira Responsável</th>
                              <th className="p-3.5">Duração</th>
                              <th className="p-3.5">Status</th>
                              <th className="p-3.5">Origem / Auditoria</th>
                              <th className="p-3.5 text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {[...filteredHistory].sort((a: any, b: any) => {
                              const tA = new Date(a.completedAt || a.effectiveDate || a.requestDate).getTime()
                              const tB = new Date(b.completedAt || b.effectiveDate || b.requestDate).getTime()
                              return tB - tA
                            }).map((entry: any) => {
                              const execDateStr = entry.effectiveDate || (entry.completedAt ? entry.completedAt.substring(0, 10) : entry.requestDate)
                              const formattedDate = formatDate(execDateStr)
                              const timeRange = entry.cleaningStartedAt && entry.completedAt 
                                ? `${format(new Date(entry.cleaningStartedAt), "HH:mm")} às ${format(new Date(entry.completedAt), "HH:mm")}`
                                : (entry.completedAt ? format(new Date(entry.completedAt), "HH:mm") : null)

                              return (
                                <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                                  <td className="p-3.5 text-foreground font-semibold whitespace-nowrap">
                                    <div className="flex flex-col">
                                      <span>{formattedDate}</span>
                                      {timeRange && (
                                        <span className="text-[10px] text-muted-foreground font-normal flex items-center gap-1">
                                          <Clock className="w-3 h-3 text-muted-foreground" />
                                          {timeRange}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-3.5 font-bold text-foreground">
                                    Apt {entry.flatNumber}
                                  </td>
                                  <td className="p-3.5 capitalize font-semibold text-foreground">
                                    {entry.assignedUsername || "Camareira"}
                                  </td>
                                  <td className="p-3.5 text-muted-foreground font-mono">
                                    {entry.durationMinutes ? `${entry.durationMinutes} min` : "~35 min"}
                                  </td>
                                  <td className="p-3.5">
                                    <Badge className="bg-emerald-600 text-white text-[10px] px-2 py-0.5 font-bold">
                                      Concluído
                                    </Badge>
                                  </td>
                                  <td className="p-3.5">
                                    {entry.addedBy ? (
                                      <div className="flex flex-col gap-0.5">
                                        <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 w-fit font-bold">
                                          Manual (ADM: {entry.addedBy})
                                        </Badge>
                                        <span className="text-[10px] text-muted-foreground">
                                          Adicionado em {entry.addedAt ? format(new Date(entry.addedAt), "dd/MM 'às' HH:mm") : "-"}
                                        </span>
                                        {entry.adminNote && (
                                          <span className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                                            "{entry.adminNote}"
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="flex flex-col gap-0.5">
                                        <Badge variant="secondary" className="text-[10px] w-fit font-medium">
                                          Automático (PMS)
                                        </Badge>
                                        {entry.leavingGuest && (
                                          <span className="text-[10px] text-muted-foreground">
                                            Saída: {entry.leavingGuest}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-3.5 text-right">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        setCleaningToDelete(entry)
                                        setDeleteConfirmOpen(true)
                                      }}
                                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                                      title="Remover diária do relatório"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="p-3 bg-muted/20 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground font-semibold">
                        <span>Total listado: <strong>{filteredHistory.length}</strong> limpezas no período</span>
                        <span>Rolagem vertical ativa</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ══════════════════════════════════════════════════════════════════
                ABA 4: PRODUTIVIDADE & GRÁFICOS
               ══════════════════════════════════════════════════════════════════ */}
            <TabsContent value="charts" className="space-y-4 m-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Card className="rounded-3xl border border-border shadow-sm p-5 space-y-4">
                  <h3 className="font-black text-sm text-foreground flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-600" />
                    <span>Demandas de Limpeza por Dia da Semana</span>
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={report?.cleaningsByDayOfWeek || []}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="dayName" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card className="rounded-3xl border border-border shadow-sm p-5 space-y-4">
                  <h3 className="font-black text-sm text-foreground flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>Flats com Maior Rotatividade de Limpezas</span>
                  </h3>
                  <div className="h-64 overflow-y-auto space-y-1.5 pr-1">
                    {(report?.topFlatsByCleanings || []).map((f: any, i: number) => (
                      <div key={f.flatNumber} className="p-2.5 rounded-xl bg-muted/40 border border-border flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-primary/10 text-primary font-bold flex items-center justify-center text-[10px]">
                            #{i + 1}
                          </span>
                          <span className="font-bold text-foreground">Flat {f.flatNumber}</span>
                        </div>
                        <Badge variant="outline" className="font-bold">
                          {f.count} limpezas
                        </Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          /* ══════════════════════════════════════════════════════════════════
              VISÃO EXCLUSIVA DA CAMAREIRA (SIMPLES, CLARA E ACOLHEDORA)
             ══════════════════════════════════════════════════════════════════ */
          <div className="space-y-5">
            {/* Resumo da Quinzena */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="p-4 rounded-3xl border border-border bg-card shadow-2xs">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Quartos Concluídos
                </span>
                <div className="text-2xl font-black text-foreground mt-1">
                  {history.length} flats
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Taxa por quarto: <strong>R$ {Number(report?.myRatePerRoom || 35).toFixed(2)}</strong>
                </span>
              </Card>

              <Card className="p-4 rounded-3xl border border-border bg-card shadow-2xs">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Vales no Período
                </span>
                <div className="text-2xl font-black text-amber-600 mt-1">
                  − R$ {formatBRL(report?.myAdvancesInPeriod || 0)}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Adiantamentos concedidos
                </span>
              </Card>

              <Card className="p-4 rounded-3xl border border-emerald-500/50 bg-emerald-500/10 shadow-2xs">
                <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-wider block">
                  Líquido da Quinzena
                </span>
                <div className="text-2xl font-black text-emerald-800 dark:text-emerald-200 mt-1">
                  R$ {formatBRL(report?.myNetToPay ?? (history.length * Number(report?.myRatePerRoom || 35)))}
                </div>
                <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                  Valor a receber no acerto
                </span>
              </Card>
            </div>

            {/* Abas da Camareira */}
            <Tabs defaultValue="my-rooms" className="space-y-4">
              <TabsList className="bg-card border border-border p-1 rounded-2xl h-auto grid grid-cols-2 gap-1 w-full sm:w-80">
                <TabsTrigger value="my-rooms" className="rounded-xl py-2 text-xs font-bold">
                  Minhas Diárias ({history.length})
                </TabsTrigger>
                <TabsTrigger value="my-statement" className="rounded-xl py-2 text-xs font-bold">
                  Meu Extrato
                </TabsTrigger>
              </TabsList>

              <TabsContent value="my-rooms" className="m-0">
                <Card className="rounded-3xl border border-border shadow-sm overflow-hidden">
                  <CardHeader className="p-4 bg-muted/20 border-b border-border">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary" />
                      Apartamentos Higienizados na Quinzena
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {history.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        Nenhum quarto limpo registrado no período selecionado.
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {history.map((h: any, i: number) => {
                          const hDate = h.effectiveDate || (h.completedAt ? h.completedAt.substring(0, 10) : h.requestDate)
                          return (
                            <div key={i} className="p-3.5 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-2xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center font-black text-xs">
                                  {h.flatNumber}
                                </div>
                                <div>
                                  <span className="font-bold text-xs text-foreground block">Apartamento {h.flatNumber}</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {formatDate(hDate)} {h.completedAt ? `às ${format(new Date(h.completedAt), "HH:mm")}` : ""}
                                    {h.leavingGuest ? ` • Saída: ${h.leavingGuest}` : ""}
                                  </span>
                                </div>
                              </div>
                              <Badge className="bg-emerald-600 text-white font-bold text-xs">
                                + R$ {Number(report?.myRatePerRoom || 35).toFixed(2)}
                              </Badge>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="my-statement" className="m-0">
                <Card className="rounded-3xl border border-border shadow-sm overflow-hidden">
                  <CardHeader className="p-4 bg-muted/20 border-b border-border">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-emerald-600" />
                      Histórico de Diárias, Pagamentos e Vales
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {rawStatementList.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        Nenhuma movimentação registrada no seu extrato.
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {rawStatementList.map(entry => {
                          const isCredit = entry.entryType === "credit"
                          const isAdvance = entry.payment?.type === "advance"
                          return (
                            <div 
                              key={entry.id} 
                              onClick={() => setSelectedEntry(entry)}
                              className="p-3.5 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                  isCredit ? "bg-emerald-500/15 text-emerald-600" : isAdvance ? "bg-amber-500/15 text-amber-600" : "bg-rose-500/15 text-rose-600"
                                }`}>
                                  {isCredit ? <ArrowUpRight className="w-4 h-4" /> : isAdvance ? <Gift className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                                </div>
                                <div>
                                  <span className="font-bold text-xs text-foreground block">{entry.description}</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {formatDate(entry.entryDate)} • Saldo após: R$ {formatBRL(entry.balanceAfter)}
                                  </span>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`text-xs font-black ${isCredit ? "text-emerald-600" : "text-rose-600"}`}>
                                  {isCredit ? "+" : "−"} R$ {formatBRL(entry.amount)}
                                </div>
                                <span className="text-[10px] text-primary flex items-center justify-end gap-0.5">
                                  Comprovante <ChevronRight className="w-3 h-3" />
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            MODAL 1: CONFIGURAR VALORES POR QUARTO (TAXAS BASE E INDIVIDUAIS)
           ══════════════════════════════════════════════════════════════════ */}
        <Dialog open={ratesModalOpen} onOpenChange={setRatesModalOpen}>
          <DialogContent className="sm:max-w-lg bg-card border border-border rounded-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                <span>Configurar Valores de Diária por Camareira</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Defina valores personalizados para cada colaboradora conforme o acordo de diárias
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveRates} className="space-y-4 pt-2">
              <div className="p-3.5 rounded-2xl bg-muted/40 border border-border space-y-1.5">
                <Label className="text-xs font-bold text-foreground">Valor Padrão Base (R$) *</Label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-xs text-muted-foreground">R$</span>
                  <Input 
                    type="number"
                    step="0.50"
                    value={defaultRateInput}
                    onChange={e => setDefaultRateInput(e.target.value)}
                    required
                    className="pl-10 text-sm font-black text-emerald-600 rounded-xl h-10 bg-background"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Aplicado para novas camareiras que não tenham valor individual configurado abaixo.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-primary" />
                  <span>Valores Específicos por Colaboradora:</span>
                </Label>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {cleanersList.length === 0 ? (
                    <div className="text-xs text-muted-foreground p-3 text-center">Nenhuma camareira cadastrada na equipe.</div>
                  ) : (
                    cleanersList.map(c => (
                      <div key={c.id || c.userId} className="p-3 rounded-2xl bg-card border border-border flex items-center justify-between gap-3 shadow-2xs hover:border-primary/40 transition-colors">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black text-xs shrink-0">
                            {(c.name || c.username).charAt(0).toUpperCase()}
                          </div>
                          <div className="truncate">
                            <span className="font-bold text-xs text-foreground block truncate">{c.name || c.username}</span>
                            <span className="text-[10px] text-muted-foreground capitalize">{c.role || "camareira"}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs font-bold text-muted-foreground">R$</span>
                          <Input 
                            type="number"
                            step="0.50"
                            placeholder={defaultRateInput}
                            value={userRatesInput[String(c.id || c.userId)] || ""}
                            onChange={e => {
                              const val = e.target.value
                              setUserRatesInput(prev => ({ ...prev, [String(c.id || c.userId)]: val }))
                            }}
                            className="w-24 h-9 text-xs font-black text-emerald-600 rounded-xl text-right"
                          />
                          <span className="text-[10px] text-muted-foreground">/quarto</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <DialogFooter className="gap-2 pt-3 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setRatesModalOpen(false)} className="rounded-xl h-9 text-xs font-bold">
                  Cancelar
                </Button>
                <Button type="submit" disabled={savingRates} className="rounded-xl h-9 text-xs font-bold bg-primary text-primary-foreground">
                  {savingRates ? "Salvando..." : "Salvar Todos os Valores"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════════════════════════════════
            MODAL 2: PAGAR PIX / LANÇAR VALE (COM SUGESTÃO INTELIGENTE)
           ══════════════════════════════════════════════════════════════════ */}
        <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                {payType === "advance" ? (
                  <><Gift className="w-5 h-5 text-amber-500" /> Conceder Vale (Adiantamento)</>
                ) : (
                  <><Banknote className="w-5 h-5 text-emerald-600" /> Pagar Camareira via PIX</>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {activePayCleaner?.name || activePayCleaner?.username} —{" "}
                {activePayCleaner?.pixKey ? `PIX: ${activePayCleaner.pixKey}` : "Sem PIX cadastrado"}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleConfirmPay} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPayType("payment")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-bold transition-all ${
                    payType === "payment" ? "bg-emerald-600 text-white border-emerald-600 shadow-xs" : "bg-card border-border/60 text-muted-foreground"
                  }`}
                >
                  <Banknote className="w-4 h-4" /> Pagamento PIX
                </button>
                <button
                  type="button"
                  onClick={() => setPayType("advance")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-bold transition-all ${
                    payType === "advance" ? "bg-amber-500 text-white border-amber-500 shadow-xs" : "bg-card border-border/60 text-muted-foreground"
                  }`}
                >
                  <Gift className="w-4 h-4" /> Vale (Adiantamento)
                </button>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Valor da Operação (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0,00"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="rounded-xl h-11 text-lg font-black text-center"
                  required
                />

                {/* Botões Rápidos de Preenchimento Inteligente */}
                {payType === "payment" && activePayCleaner && (
                  <div className="flex items-center justify-center gap-2 pt-1">
                    {activePayCleaner.netToPay !== undefined && Number(activePayCleaner.netToPay) > 0 && (
                      <button
                        type="button"
                        onClick={() => setPayAmount(Number(activePayCleaner.netToPay).toFixed(2))}
                        className="text-[10px] text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded-lg font-bold border border-emerald-500/20"
                      >
                        Líquido da Quinzena (R$ {formatBRL(activePayCleaner.netToPay)})
                      </button>
                    )}
                    {activePayCleaner.currentBalance !== undefined && Number(activePayCleaner.currentBalance) > 0 && (
                      <button
                        type="button"
                        onClick={() => setPayAmount(Number(activePayCleaner.currentBalance).toFixed(2))}
                        className="text-[10px] text-primary bg-primary/10 hover:bg-primary/20 px-2 py-1 rounded-lg font-bold border border-primary/20"
                      >
                        Saldo em Conta (R$ {formatBRL(activePayCleaner.currentBalance)})
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Descrição (opcional)</Label>
                <Input
                  placeholder={payType === "advance" ? "ex: Vale para transporte / despesas" : "ex: Acerto quinzenal de diárias"}
                  value={payDescription}
                  onChange={e => setPayDescription(e.target.value)}
                  className="rounded-xl h-9 text-xs"
                />
              </div>

              <div className="text-[10px] text-muted-foreground p-3 rounded-2xl bg-muted/40 border border-border/40">
                {payType === "payment"
                  ? "✅ O pagamento será enviado para a chave PIX cadastrada (Banco Inter ou simulação) e o comprovante com TxID será transmitido automaticamente ao WhatsApp da camareira."
                  : "🎫 O vale concedido será imediatamente lançado como saída no extrato, debitará dos próximos pagamentos e avisará a colaboradora no WhatsApp."}
              </div>

              <DialogFooter className="gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setPayModalOpen(false)} className="rounded-xl h-9 text-xs font-bold">
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={payingLoading || !payAmount}
                  className={`rounded-xl h-9 text-xs font-bold gap-1.5 ${
                    payType === "advance" ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-600 hover:bg-emerald-700"
                  } text-white`}
                >
                  {payingLoading ? "Processando..." : payType === "advance" ? "Confirmar Vale" : "Pagar Agora via PIX"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════════════════════════════════
            MODAL 3: RECIBO TIMBRADO A4 DA QUINZENA (COM WHATSAPP)
           ══════════════════════════════════════════════════════════════════ */}
        <Dialog open={receiptModalOpen} onOpenChange={setReceiptModalOpen}>
          <DialogContent className="w-[95vw] sm:max-w-3xl bg-card border border-border rounded-3xl max-h-[92vh] overflow-y-auto p-0 shadow-2xl">
            <div className="p-3.5 sm:p-4 bg-muted/20 border-b border-border flex items-center justify-between gap-3 sticky top-0 z-20 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-600 text-white font-bold text-xs px-2.5 py-0.5 rounded-full">
                  Recibo Oficial
                </Badge>
                <span className="text-xs text-muted-foreground font-semibold">
                  Demonstrativo de Diárias
                </span>
              </div>

              <div className="flex items-center gap-2">
                {activeCleanerReceipt && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const count = activeCleanerReceipt.count || 0
                      const rate = Number(activeCleanerReceipt.ratePerRoom || report?.defaultRatePerRoom || 35).toFixed(2)
                      const net = formatBRL(activeCleanerReceipt.netToPay ?? activeCleanerReceipt.totalToPay)
                      const name = activeCleanerReceipt.name || activeCleanerReceipt.username
                      const msg = `📄 *CORPFLATS • FECHAMENTO DE DIÁRIAS*\n\nOlá, *${name}*!\nSegue o resumo do seu fechamento de governança:\n\n🗓️ *Período:* ${formatDate(startDate)} a ${formatDate(endDate)}\n🧹 *Total de Quartos Limpos:* ${count} flats\n💵 *Valor por Quarto:* R$ ${rate}\n💰 *VALOR TOTAL A RECEBER:* *R$ ${net}*\n\nObrigado pela dedicação e excelente trabalho! ✨`
                      window.open("https://api.whatsapp.com/send?text=" + encodeURIComponent(msg), "_blank")
                    }}
                    className="h-9 px-3 rounded-xl text-xs font-bold gap-1.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </Button>
                )}

                <Button
                  size="sm"
                  onClick={() => printReceiptWindow(activeCleanerReceipt, startDate, endDate)}
                  className="h-9 px-3.5 rounded-xl text-xs font-bold gap-1.5 bg-primary text-primary-foreground shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir / PDF</span>
                </Button>

                <Button size="sm" variant="ghost" onClick={() => setReceiptModalOpen(false)} className="h-9 w-9 p-0 rounded-xl">
                  ✕
                </Button>
              </div>
            </div>

            {activeCleanerReceipt && (
              <div className="p-5 sm:p-8 space-y-5 bg-card text-foreground text-xs">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-lg">
                      CF
                    </div>
                    <div>
                      <h2 className="text-base sm:text-xl font-black uppercase">CorpFlats Residence Service</h2>
                      <p className="text-[11px] text-muted-foreground">Demonstrativo de Fechamento de Diárias • Governança & Camareiras</p>
                    </div>
                  </div>
                  <div className="text-right font-mono text-[10px] text-muted-foreground">
                    <div>Protocolo: #REC-${format(new Date(), "yyyyMM")}-${String(activeCleanerReceipt.userId).padStart(3, "0")}</div>
                    <div>Emissão: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-muted/30 border border-border">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">Colaboradora Responsável</span>
                    <div className="text-sm font-black text-foreground mt-0.5">{activeCleanerReceipt.name || activeCleanerReceipt.username}</div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-muted/30 border border-border">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">Período de Apuração</span>
                    <div className="text-sm font-black text-foreground mt-0.5">{formatDate(startDate)} até {formatDate(endDate)}</div>
                  </div>
                </div>

                <div className="p-4 sm:p-5 rounded-3xl bg-emerald-500/10 border-2 border-emerald-500/40 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase block">Valor Total Líquido a Receber</span>
                    <div className="text-3xl font-black text-emerald-950 dark:text-emerald-100 mt-0.5">
                      R$ {formatBRL(activeCleanerReceipt.netToPay ?? activeCleanerReceipt.totalToPay)}
                    </div>
                    <span className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80">
                      Cálculo: {activeCleanerReceipt.count} quartos × R$ {Number(activeCleanerReceipt.ratePerRoom || report?.defaultRatePerRoom || 35).toFixed(2)} por quarto limpo
                    </span>
                  </div>
                  <Badge className="bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                    Aprovado
                  </Badge>
                </div>

                {/* Tabela de Quartos no Recibo */}
                <div className="rounded-2xl border border-border overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/40 font-bold border-b border-border">
                      <tr>
                        <th className="p-2.5 w-10 text-center">#</th>
                        <th className="p-2.5">Data</th>
                        <th className="p-2.5">Horário</th>
                        <th className="p-2.5">Apartamento</th>
                        <th className="p-2.5 text-center">Duração</th>
                        <th className="p-2.5 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(activeCleanerReceipt.cleanings || []).map((c: any, idx: number) => {
                        const execDateStr = c.effectiveDate || (c.completedAt ? c.completedAt.substring(0, 10) : c.requestDate)
                        const timeRange = c.cleaningStartedAt && c.completedAt
                          ? `${format(new Date(c.cleaningStartedAt), "HH:mm")} - ${format(new Date(c.completedAt), "HH:mm")}`
                          : (c.completedAt ? format(new Date(c.completedAt), "HH:mm") : "—")
                        return (
                          <tr key={idx}>
                            <td className="p-2.5 text-center font-mono text-muted-foreground">{String(idx + 1).padStart(2, "0")}</td>
                            <td className="p-2.5">{formatDate(execDateStr)}</td>
                            <td className="p-2.5 font-mono text-muted-foreground">{timeRange}</td>
                            <td className="p-2.5 font-bold">Apartamento {c.flatNumber}</td>
                            <td className="p-2.5 text-center font-mono">{c.durationMinutes || 35} min</td>
                            <td className="p-2.5 text-right font-black text-emerald-600">R$ {Number(activeCleanerReceipt.ratePerRoom || 35).toFixed(2)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════════════════════════════════
            MODAL 4: LANÇAR DIÁRIA MANUAL RETROATIVA (ADM)
           ══════════════════════════════════════════════════════════════════ */}
        <Dialog open={addCleaningModalOpen} onOpenChange={setAddCleaningModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                <span>Lançar Diária de Limpeza Manual</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Insira uma diária de limpeza (incluindo datas retroativas) no relatório da equipe.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmitAddCleaning} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Apartamento *</Label>
                  <select
                    value={addFlatNumber}
                    onChange={e => setAddFlatNumber(e.target.value)}
                    className="w-full h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold"
                    required
                  >
                    {flatsList.map(f => (
                      <option key={f.id} value={String(f.number)}>Flat {f.number}</option>
                    ))}
                    {!flatsList.some(f => String(f.number) === "408") && (
                      <option value="408">Flat 408</option>
                    )}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Data da Limpeza *</Label>
                  <Input
                    type="date"
                    value={addRequestDate}
                    onChange={e => setAddRequestDate(e.target.value)}
                    className="rounded-xl h-10 text-xs font-semibold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Camareira Responsável *</Label>
                  <select
                    value={addCleanerId}
                    onChange={e => setAddCleanerId(e.target.value)}
                    className="w-full h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold"
                    required
                  >
                    {cleanersList.map(c => (
                      <option key={c.userId || c.id} value={String(c.userId || c.id)}>
                        {c.name || c.username}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Duração (minutos)</Label>
                  <Input
                    type="number"
                    min="10"
                    max="180"
                    value={addDurationMinutes}
                    onChange={e => setAddDurationMinutes(e.target.value)}
                    className="rounded-xl h-10 text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Motivo / Observação do Lançamento</Label>
                <Input
                  placeholder="Ex: Check-out antecipado / Registro manual"
                  value={addAdminNote}
                  onChange={e => setAddAdminNote(e.target.value)}
                  className="rounded-xl h-10 text-xs"
                />
              </div>

              <div className="p-3 bg-muted/40 rounded-2xl border border-border flex items-start gap-2.5 text-[11px] text-muted-foreground">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>
                  O lançamento será registrado com auditoria (seu login, data e hora) e integrará imediatamente o cálculo de diárias e saldo da colaboradora.
                </span>
              </div>

              <DialogFooter className="gap-2 sm:justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setAddCleaningModalOpen(false)} className="rounded-xl">
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={isSubmittingAddCleaning} className="rounded-xl bg-primary text-primary-foreground font-bold">
                  {isSubmittingAddCleaning ? "Salvando..." : "Confirmar Diária"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════════════════════════════════
            MODAL 5: CONFIRMAÇÃO DE EXCLUSÃO DE DIÁRIA (ADM)
           ══════════════════════════════════════════════════════════════════ */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <span>Remover Diária de Limpeza</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Tem certeza de que deseja remover esta diária do fechamento?
              </DialogDescription>
            </DialogHeader>

            {cleaningToDelete && (
              <div className="p-4 bg-muted/40 rounded-2xl border border-border space-y-2 text-xs">
                <div>Flat: <strong className="text-foreground">Apt {cleaningToDelete.flatNumber}</strong></div>
                <div>Data: <strong className="text-foreground">{formatDate(cleaningToDelete.requestDate)}</strong></div>
                <div>Camareira: <strong className="text-foreground">{cleaningToDelete.assignedUsername || "Camareira"}</strong></div>
                {cleaningToDelete.adminNote && <div>Observação: <span className="italic">{cleaningToDelete.adminNote}</span></div>}
              </div>
            )}

            <DialogFooter className="gap-2 sm:justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setDeleteConfirmOpen(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button type="button" variant="destructive" size="sm" disabled={isDeletingCleaning} onClick={executeDeleteCleaning} className="rounded-xl font-bold">
                {isDeletingCleaning ? "Excluindo..." : "Sim, Excluir Diária"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════════════════════════════════
            MODAL 6: COMPROVANTE DIGITAL DE LANÇAMENTO (DO EXTRATO)
           ══════════════════════════════════════════════════════════════════ */}
        <Dialog open={!!selectedEntry} onOpenChange={open => !open && setSelectedEntry(null)}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl p-5 sm:p-6 shadow-2xl">
            {selectedEntry && (
              <>
                <DialogHeader className="text-center sm:text-center pb-2 border-b border-border/80">
                  <div className={`w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-2 ${
                    selectedEntry.entryType === "credit"
                      ? "bg-emerald-500/15 text-emerald-600"
                      : selectedEntry.payment?.type === "advance"
                        ? "bg-amber-500/15 text-amber-600"
                        : "bg-rose-500/15 text-rose-600"
                  }`}>
                    {selectedEntry.entryType === "credit" ? (
                      <ArrowUpRight className="w-6 h-6" />
                    ) : selectedEntry.payment?.type === "advance" ? (
                      <Gift className="w-6 h-6" />
                    ) : (
                      <Banknote className="w-6 h-6" />
                    )}
                  </div>
                  
                  <DialogTitle className="text-base font-black text-center">
                    Comprovante de Lançamento
                  </DialogTitle>
                  <DialogDescription className="text-xs text-center">
                    {selectedEntry.entryType === "credit" 
                      ? "Crédito por Conclusão de Faxina" 
                      : selectedEntry.payment?.type === "advance" 
                        ? "Vale / Adiantamento Financeiro" 
                        : "Pagamento de Diárias via PIX"}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 pt-2 text-xs">
                  <div className="p-4 rounded-2xl bg-muted/30 border border-border/70 text-center">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                      Valor do Lançamento
                    </span>
                    <div className={`text-2xl sm:text-3xl font-black mt-0.5 ${
                      selectedEntry.entryType === "credit" ? "text-emerald-600" : "text-rose-600"
                    }`}>
                      {selectedEntry.entryType === "credit" ? "+" : "−"} R$ {formatBRL(selectedEntry.amount)}
                    </div>
                    <span className="text-[11px] text-muted-foreground font-medium block mt-1">
                      Saldo restante após este item: <strong>R$ {formatBRL(selectedEntry.balanceAfter)}</strong>
                    </span>
                  </div>

                  <div className="space-y-2 rounded-2xl p-3.5 bg-card border border-border">
                    <div className="flex justify-between items-center py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Descrição:</span>
                      <strong className="text-foreground text-right">{selectedEntry.description}</strong>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Colaboradora:</span>
                      <strong className="text-foreground">{statementData?.userName || "Camareira"}</strong>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Data da Operação:</span>
                      <strong className="text-foreground">
                        {formatDate(selectedEntry.entryDate)} {selectedEntry.createdAt && formatTime(selectedEntry.createdAt) ? `às ${formatTime(selectedEntry.createdAt)}` : ""}
                      </strong>
                    </div>

                    {statementData?.pixKey && (
                      <div className="flex justify-between items-center py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Chave PIX:</span>
                        <span className="font-mono font-bold text-foreground text-[11px]">{statementData.pixKey}</span>
                      </div>
                    )}

                    {selectedEntry.payment?.interTxId && (
                      <div className="py-1">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Autenticação Bancária:</span>
                          <Badge variant="outline" className="font-mono text-[9px] text-primary">
                            {selectedEntry.payment.interTxId.substring(0, 16)}…
                          </Badge>
                        </div>
                      </div>
                    )}
                  </div>

                  <DialogFooter className="gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyReceiptText}
                      className="rounded-xl text-xs font-bold gap-1.5 flex-1"
                    >
                      {copiedReceipt ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedReceipt ? "Copiado!" : "Copiar Texto p/ WhatsApp"}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedEntry(null)}
                      className="rounded-xl text-xs font-bold"
                    >
                      Fechar
                    </Button>
                  </DialogFooter>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

      </div>
    </Shell>
  )
}

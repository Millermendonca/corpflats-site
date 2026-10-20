import { useState, useEffect, useRef, useMemo } from "react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog"
import { 
  FileText, PlusCircle, CheckCircle2, AlertCircle, RefreshCw, Download, 
  Search, ShieldCheck, QrCode, Building2, User, Phone, Mail, 
  Send, Bot, Sparkles, Globe, ArrowRight, ExternalLink, Calendar, MapPin,
  Settings, Sliders, Check, Copy, HelpCircle, Code, ListFilter, MessageSquare,
  Trash2, Zap, Filter, Clock, CheckSquare, Layers, FileSpreadsheet, Eye, X,
  ChevronRight, UploadCloud, AlertTriangle, PlayCircle, KeyRound, Lock
} from "lucide-react"

import { useToast } from "@/hooks/use-toast"
import { sendDirectZapiWithFallback, bindZapiClickOrHoldWaWeb, buildDirectWaWebUrl } from "@/hooks/use-quick-messages"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

interface ExtractedData {
  tomadorNome?: string
  tomadorCpfCnpj?: string
  tomadorEmail?: string
  tomadorTelefone?: string
  tomadorEndereco?: string
  tomadorNumero?: string
  tomadorComplemento?: string
  tomadorBairro?: string
  tomadorCodigoMunicipio?: string
  tomadorCidade?: string
  tomadorUf?: string
  tomadorCep?: string
  valorServico?: string | number
  checkIn?: string
  checkOut?: string
  quantidadeDiarias?: number
  flatNumber?: string
  descricaoServico?: string
  aliquotaIss?: string | number
}

interface CrmSearchItem {
  id: string
  type: "company" | "guest" | "reservation"
  title: string
  subtitle: string
  badge: string
  raw: any
}

export default function FiscalInvoicesPage() {
  const { toast } = useToast()

  // ── Navegação do Hub Fiscal (5 Abas Especializadas) ─────────────────────────
  const [activeTab, setActiveTab] = useState<"studio" | "batch" | "history" | "contingency" | "settings">("studio")

  // ── Motor Emissor Ativo ───────────────────────────────────────────────────
  const [sistemaEmissor, setSistemaEmissor] = useState<"giss_prefeitura" | "padrao_nacional">("giss_prefeitura")

  // ── Filtro Global de Competência (YYYY-MM ou "all") ────────────────────────
  const [selectedCompetencia, setSelectedCompetencia] = useState<string>("all")

  // ── Dados Fiscais Principais ───────────────────────────────────────────────
  const [invoices, setInvoices] = useState<any[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(true)
  const [certStatus, setCertStatus] = useState<{
    daysRemaining: number
    expiringSoon: boolean
    titular?: string
    validade?: string
    cnpj?: string
    emissor?: string
  } | null>({
    daysRemaining: 142,
    expiringSoon: false,
    titular: "RENTAL MILLER'S LTDA ME",
    validade: "2027-03-12",
    cnpj: "47.964.813/0001-65",
    emissor: "AC SERASA ICP-Brasil"
  })

  // ── Fila de Retentativa / Contingência ──────────────────────────────────────
  const [retryQueue, setRetryQueue] = useState<any[]>([])
  const [loadingRetryQueue, setLoadingRetryQueue] = useState(false)
  const [reprocessingId, setReprocessingId] = useState<string | null>(null)

  // ── Regras de Canal & Automação ────────────────────────────────────────────
  const [channelRules, setChannelRules] = useState<any>({
    direct: true,
    whatsapp: true,
    booking: true,
    airbnb: true,
    autoCheckout: true
  })
  const [savingChannelRules, setSavingChannelRules] = useState(false)

  // ── CRM Multi-Entidade (Hóspedes PF, Empresas PJ e Reservas) ───────────────
  const [guests, setGuests] = useState<any[]>([])
  const [companies, setCompanies] = useState<any[]>([])
  const [reservations, setReservations] = useState<any[]>([])
  const [guestSearchQuery, setGuestSearchQuery] = useState("")
  const [guestDropdownOpen, setGuestDropdownOpen] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null)
  const [selectedGuest, setSelectedGuest] = useState<any | null>(null)
  const [linkedCompany, setLinkedCompany] = useState<any | null>(null)
  const [linkedGuest, setLinkedGuest] = useState<any | null>(null)
  const [linkedReservation, setLinkedReservation] = useState<any | null>(null)
  const [tomadorMode, setTomadorMode] = useState<"pj" | "pf">("pf")
  const guestComboboxRef = useRef<HTMLDivElement>(null)

  // ── Configurações Fiscais e Template de Tags ────────────────────────────────
  const [fiscalSettings, setFiscalSettings] = useState<any>({
    descriptionTemplate: "Nota relativa à hospedagem {artigo} {nome_hospede}{flat_info}.\nLocal: {local_nome}.\n{local_endereco}\nQuantidade de diárias: {diarias}\n{checkin_info}\n{checkout_info}",
    aliquotaPadrao: 2.00,
    codigoServico: "09.02",
    codigoTributacaoMunicipio: "799020000",
    cnae: "5510801",
    optanteSimplesNacional: true
  })
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSuccess, setSettingsSuccess] = useState(false)

  // ── Emissor Studio: Chat IA vs Formulário Estruturado ───────────────────────
  const [studioInputMode, setStudioInputMode] = useState<"chat" | "form">("chat")
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Olá! 👋 Sou o assistente de emissão de NFS-e da CorpFlats.\n\nDigite os dados do cliente e da hospedagem de forma livre (nome, CPF/CNPJ, flat, datas e valor). Os dados são sincronizados em tempo real com o formulário e o espelho DANFSE ao lado!"
    }
  ])
  const [chatInput, setChatInput] = useState("")
  const [chatLoading, setChatLoading] = useState(false)
  const [extractedData, setExtractedData] = useState<ExtractedData>({})
  const [isReadyToEmit, setIsReadyToEmit] = useState(false)
  const [isEmitting, setIsEmitting] = useState(false)
  const [emissionSuccessData, setEmissionSuccessData] = useState<any | null>(null)
  const [lastEmittedInvoice, setLastEmittedInvoice] = useState<any | null>(null)
  const [emissionErrorData, setEmissionErrorData] = useState<any | null>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // ── Campos Estruturados do Formulário ──────────────────────────────────────
  const [formTomadorNome, setFormTomadorNome] = useState("")
  const [formTomadorDoc, setFormTomadorDoc] = useState("")
  const [formTomadorEmail, setFormTomadorEmail] = useState("")
  const [formTomadorTelefone, setFormTomadorTelefone] = useState("")
  const [formTomadorCep, setFormTomadorCep] = useState("28035000")
  const [formTomadorEndereco, setFormTomadorEndereco] = useState("Av. Pelinca")
  const [formTomadorNumero, setFormTomadorNumero] = useState("100")
  const [formTomadorComplemento, setFormTomadorComplemento] = useState("")
  const [formTomadorBairro, setFormTomadorBairro] = useState("Pelinca")
  const [formTomadorCidade, setFormTomadorCidade] = useState("Campos dos Goytacazes")
  const [formTomadorUf, setFormTomadorUf] = useState("RJ")
  const [formTomadorIbge, setFormTomadorIbge] = useState("3301009")
  const [formFlatNumber, setFormFlatNumber] = useState("")
  const [formCheckin, setFormCheckin] = useState(new Date().toISOString().substring(0, 10))
  const [formCheckout, setFormCheckout] = useState(new Date(Date.now() + 86400000).toISOString().substring(0, 10))
  const [formDiarias, setFormDiarias] = useState(1)
  const [formValor, setFormValor] = useState("")
  const [formDescricao, setFormDescricao] = useState("")
  const [formAliquota, setFormAliquota] = useState("2.00")
  const [isLookingUpDoc, setIsLookingUpDoc] = useState(false)
  const [isLookingUpCep, setIsLookingUpCep] = useState(false)

  // ── Faturamento & Lote State ────────────────────────────────────────────────
  const [pendingSearch, setPendingSearch] = useState("")
  const [pendingTypeFilter, setPendingTypeFilter] = useState<"all" | "pf" | "pj">("all")
  const [pendingCompanyFilter, setPendingCompanyFilter] = useState<string>("all")
  const [pendingCadastralFilter, setPendingCadastralFilter] = useState<"all" | "ready" | "pending_doc">("all")
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([])
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [batchEmitting, setBatchEmitting] = useState(false)
  const [batchResults, setBatchResults] = useState<any | null>(null)

  // ── Faturamento B2B Consolidado State ───────────────────────────────────────
  const [consolidatedModalOpen, setConsolidatedModalOpen] = useState(false)
  const [consolidatedCompanyId, setConsolidatedCompanyId] = useState<string>("")
  const [consolidatedEmitting, setConsolidatedEmitting] = useState(false)
  const [consolidatedResults, setConsolidatedResults] = useState<any | null>(null)

  // ── Livro Fiscal Avançado State & Modais ────────────────────────────────────
  const [searchFilter, setSearchFilter] = useState("")
  const [livroStatusFilter, setLivroStatusFilter] = useState<string>("all")
  const [livroTomadorFilter, setLivroTomadorFilter] = useState<string>("all")
  const [livroSistemaFilter, setLivroSistemaFilter] = useState<string>("all")
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [invoiceToCancel, setInvoiceToCancel] = useState<any | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [isCancelling, setIsCancelling] = useState(false)
  const [replaceModalOpen, setReplaceModalOpen] = useState(false)
  const [invoiceToReplace, setInvoiceToReplace] = useState<any | null>(null)
  const [isReplacing, setIsReplacing] = useState(false)

  // ── Cofre do Certificado A1 State ───────────────────────────────────────────
  const [certModalOpen, setCertModalOpen] = useState(false)
  const [certFile, setCertFile] = useState<File | null>(null)
  const [certPassphrase, setCertPassphrase] = useState("")
  const [certUploading, setCertUploading] = useState(false)

  // ── Carregamento de Dados ──────────────────────────────────────────────────
  const fetchInvoices = async () => {
    setLoadingInvoices(true)
    try {
      const res = await fetch("/api/nfse/invoices", { credentials: "include" })
      const data = await res.json()
      if (data.invoices && Array.isArray(data.invoices)) {
        setInvoices(data.invoices)
      }
      if (data.certStatus) {
        setCertStatus(data.certStatus)
      }
      if (data.channelRules) {
        setChannelRules(data.channelRules)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingInvoices(false)
    }
  }

  const fetchGuests = async () => {
    try {
      const res = await fetch("/api/pms/guests", { credentials: "include" })
      const data = await res.json()
      if (Array.isArray(data)) setGuests(data)
    } catch (e) {
      console.error(e)
    }
  }

  const fetchCompanies = async () => {
    try {
      const res = await fetch("/api/companies", { credentials: "include" })
      const data = await res.json()
      if (Array.isArray(data)) setCompanies(data)
    } catch (e) {
      console.error(e)
    }
  }

  const fetchReservations = async () => {
    try {
      const res = await fetch("/api/pms/calendar?startDate=2026-01-01&endDate=2027-12-31", { credentials: "include" })
      const data = await res.json()
      if (data && Array.isArray(data.reservations)) {
        setReservations(data.reservations)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const fetchRetryQueue = async () => {
    setLoadingRetryQueue(true)
    try {
      const res = await fetch("/api/nfse/retry-queue", { credentials: "include" })
      const data = await res.json()
      if (data && Array.isArray(data.items)) {
        setRetryQueue(data.items)
      } else if (Array.isArray(data)) {
        setRetryQueue(data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingRetryQueue(false)
    }
  }

  const fetchFiscalSettings = async () => {
    try {
      const res = await fetch("/api/nfse/settings", { credentials: "include" })
      const data = await res.json()
      if (data) setFiscalSettings(data)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    fetchInvoices()
    fetchGuests()
    fetchCompanies()
    fetchReservations()
    fetchRetryQueue()
    fetchFiscalSettings()
  }, [])

  // ── Helper de Discriminação de Serviços ─────────────────────────────────────
  const buildCorporateDescription = (guestName: string, flat?: string, checkin?: string, checkout?: string, diarias?: number) => {
    let desc = `Nota fiscal de prestação de serviços de hospedagem corporativa referente ao colaborador ${guestName}`
    if (flat) desc += `, no Flat ${flat}`
    desc += ".\nLocal: CorpFlats Macaé / Campos dos Goytacazes."
    desc += "\nAv. Pelinca, 100 - Pelinca, Campos dos Goytacazes - RJ, CEP 28035-000"
    if (diarias) desc += `\nQuantidade de diárias: ${diarias}`
    if (checkin) desc += `\nCheck-in: ${checkin}`
    if (checkout) desc += `\nCheck-out: ${checkout}`
    return desc
  }

  const buildStandardDescription = (guestName: string, flat?: string, checkin?: string, checkout?: string, diarias?: number) => {
    let desc = `Nota relativa à hospedagem de ${guestName}`
    if (flat) desc += `, no Flat ${flat}`
    desc += ".\nLocal: CorpFlats."
    desc += "\nAv. Pelinca, 100 - Pelinca, Campos dos Goytacazes - RJ, CEP 28035-000"
    if (diarias) desc += `\nQuantidade de diárias: ${diarias}`
    if (checkin) desc += `\nCheck-in: ${checkin}`
    if (checkout) desc += `\nCheck-out: ${checkout}`
    return desc
  }

  // ── Aplicar Empresa (PJ) como Tomadora ─────────────────────────────────────
  const applyTomadorPJ = (comp: any, guestInfo?: any, stayInfo?: any) => {
    setTomadorMode("pj")
    const compDoc = (comp.cnpj || "").replace(/\D/g, "")
    const compName = comp.corporateName || comp.tradeName || comp.razaoSocial || comp.name || "Empresa"
    const compEmail = comp.financialEmail || comp.email || ""
    const compTel = (comp.phone || "").replace(/\D/g, "")
    const compEnd = comp.address || comp.logradouro || comp.endereco || "Av. Pelinca"
    const compNum = comp.number || comp.numero || "100"
    const compComp = comp.complement || comp.complemento || ""
    const compBairro = comp.neighborhood || comp.bairro || "Pelinca"
    const compCidade = comp.city || comp.cidade || "Campos dos Goytacazes"
    const compUf = comp.state || comp.uf || "RJ"
    const compCep = (comp.cep || "28035000").replace(/\D/g, "")
    const compIbge = comp.ibgeCode || comp.codigoMunicipio || "3301009"

    const guestName = guestInfo?.fullName || guestInfo?.name || ""
    const flat = stayInfo?.flatNumber || extractedData.flatNumber || formFlatNumber
    const checkin = stayInfo?.checkIn || extractedData.checkIn || formCheckin
    const checkout = stayInfo?.checkOut || extractedData.checkOut || formCheckout
    const diarias = stayInfo?.quantidadeDiarias || extractedData.quantidadeDiarias || formDiarias
    const valor = stayInfo?.valorServico || extractedData.valorServico || formValor

    const desc = guestName 
      ? buildCorporateDescription(guestName, flat, checkin, checkout, diarias)
      : `Nota fiscal de prestação de serviços de hospedagem corporativa.\nLocal: CorpFlats.\nAv. Pelinca, 100 - Pelinca, Campos dos Goytacazes - RJ, CEP 28035-000`

    setExtractedData(prev => ({
      ...prev,
      tomadorNome: compName,
      tomadorCpfCnpj: compDoc,
      tomadorEmail: compEmail,
      tomadorTelefone: compTel,
      tomadorEndereco: compEnd,
      tomadorNumero: compNum,
      tomadorComplemento: compComp,
      tomadorBairro: compBairro,
      tomadorCidade: compCidade,
      tomadorUf: compUf,
      tomadorCep: compCep,
      tomadorCodigoMunicipio: compIbge,
      descricaoServico: desc,
      ...(stayInfo || {})
    }))

    setFormTomadorNome(compName)
    setFormTomadorDoc(compDoc)
    setFormTomadorEmail(compEmail)
    setFormTomadorTelefone(compTel)
    setFormTomadorEndereco(compEnd)
    setFormTomadorNumero(compNum)
    setFormTomadorComplemento(compComp)
    setFormTomadorBairro(compBairro)
    setFormTomadorCidade(compCidade)
    setFormTomadorUf(compUf)
    setFormTomadorCep(compCep)
    setFormTomadorIbge(compIbge)
    setFormDescricao(desc)
    if (flat) setFormFlatNumber(flat)
    if (checkin) setFormCheckin(checkin)
    if (checkout) setFormCheckout(checkout)
    if (diarias) setFormDiarias(diarias)
    if (valor) setFormValor(String(valor))

    if (compName && compDoc && valor) {
      setIsReadyToEmit(true)
    }
  }

  // ── Aplicar Hóspede (PF) como Tomador ───────────────────────────────────────
  const applyTomadorPF = (guest: any, stayInfo?: any) => {
    setTomadorMode("pf")
    const guestDoc = (guest.documentNumber || guest.document || guest.cpf || "").replace(/\D/g, "")
    const guestName = guest.fullName || guest.name || "Hóspede"
    const guestEmail = guest.email || ""
    const guestTel = (guest.phone || "").replace(/\D/g, "")
    const guestEnd = guest.address || guest.logradouro || guest.endereco || "Av. Pelinca"
    const guestNum = guest.number || guest.numero || "100"
    const guestComp = guest.complement || guest.complemento || ""
    const guestBairro = guest.neighborhood || guest.bairro || "Pelinca"
    const guestCidade = guest.city || guest.cidade || "Campos dos Goytacazes"
    const guestUf = guest.state || guest.uf || "RJ"
    const guestCep = (guest.cep || "28035000").replace(/\D/g, "")
    const guestIbge = guest.ibgeCode || guest.codigoMunicipio || "3301009"

    const flat = stayInfo?.flatNumber || extractedData.flatNumber || formFlatNumber
    const checkin = stayInfo?.checkIn || extractedData.checkIn || formCheckin
    const checkout = stayInfo?.checkOut || extractedData.checkOut || formCheckout
    const diarias = stayInfo?.quantidadeDiarias || extractedData.quantidadeDiarias || formDiarias
    const valor = stayInfo?.valorServico || extractedData.valorServico || formValor

    const desc = buildStandardDescription(guestName, flat, checkin, checkout, diarias)

    setExtractedData(prev => ({
      ...prev,
      tomadorNome: guestName,
      tomadorCpfCnpj: guestDoc,
      tomadorEmail: guestEmail,
      tomadorTelefone: guestTel,
      tomadorEndereco: guestEnd,
      tomadorNumero: guestNum,
      tomadorComplemento: guestComp,
      tomadorBairro: guestBairro,
      tomadorCidade: guestCidade,
      tomadorUf: guestUf,
      tomadorCep: guestCep,
      tomadorCodigoMunicipio: guestIbge,
      descricaoServico: desc,
      ...(stayInfo || {})
    }))

    setFormTomadorNome(guestName)
    setFormTomadorDoc(guestDoc)
    setFormTomadorEmail(guestEmail)
    setFormTomadorTelefone(guestTel)
    setFormTomadorEndereco(guestEnd)
    setFormTomadorNumero(guestNum)
    setFormTomadorComplemento(guestComp)
    setFormTomadorBairro(guestBairro)
    setFormTomadorCidade(guestCidade)
    setFormTomadorUf(guestUf)
    setFormTomadorCep(guestCep)
    setFormTomadorIbge(guestIbge)
    setFormDescricao(desc)
    if (flat) setFormFlatNumber(flat)
    if (checkin) setFormCheckin(checkin)
    if (checkout) setFormCheckout(checkout)
    if (diarias) setFormDiarias(diarias)
    if (valor) setFormValor(String(valor))

    if (guestName && guestDoc && valor) {
      setIsReadyToEmit(true)
    }
  }

  // ── Alternar Tomador entre PJ e PF ──────────────────────────────────────────
  const handleToggleTomadorMode = () => {
    if (tomadorMode === "pj") {
      const guest = linkedGuest || selectedGuest
      if (guest) {
        applyTomadorPF(guest, extractedData)
        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: `Tomador alternado para Pessoa Física: **${guest.fullName || guest.name}** (CPF: ${guest.documentNumber || guest.cpf || 'Não informado'}). 👤\n\nTodos os detalhes da estadia, flat e valores foram preservados!`
          }
        ])
      } else {
        setMessages(prev => [
          ...prev,
          { role: "assistant", content: "Não há dados de hóspede PF vinculados para alternar." }
        ])
      }
    } else {
      if (linkedCompany) {
        applyTomadorPJ(linkedCompany, linkedGuest || selectedGuest, extractedData)
        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: `Tomador alternado para Pessoa Jurídica: **${linkedCompany.corporateName || linkedCompany.name}** (CNPJ: ${linkedCompany.cnpj}). 🏢\n\nO colaborador **${(linkedGuest || selectedGuest)?.fullName || ''}** foi mantido na discriminação da nota!`
          }
        ])
      } else {
        setMessages(prev => [
          ...prev,
          { role: "assistant", content: "Não há empresa corporativa PJ vinculada a este hóspede para alternar." }
        ])
      }
    }
  }

  // ── Preencher Dados de Estadia a partir de Reserva ─────────────────────────
  const populateStayFromReservation = (res: any) => {
    const flat = String(res.flatNumber || "")
    const checkin = res.checkinDate ? String(res.checkinDate).substring(0, 10) : ""
    const checkout = res.checkoutDate ? String(res.checkoutDate).substring(0, 10) : ""
    const valor = String(res.totalAmount || res.price || res.totalPrice || "")
    let diarias = 1
    if (checkin && checkout) {
      const t1 = new Date(checkin).getTime()
      const t2 = new Date(checkout).getTime()
      if (t2 > t1) {
        diarias = Math.max(1, Math.round((t2 - t1) / (1000 * 60 * 60 * 24)))
      }
    }

    const foundGuest = guests.find(g => 
      (res.guestId && String(g.id) === String(res.guestId)) ||
      (res.guestName && (g.fullName || g.name || "").toLowerCase() === String(res.guestName).toLowerCase())
    ) || (res.guestName ? { fullName: res.guestName, email: res.guestEmail, phone: res.guestPhone } : null)

    const stayInfo = {
      flatNumber: flat,
      checkIn: checkin,
      checkOut: checkout,
      quantidadeDiarias: diarias,
      valorServico: valor
    }

    if (foundGuest) {
      setLinkedGuest(foundGuest)
      setSelectedGuest(foundGuest)

      const linkedComp = foundGuest.companyId 
        ? companies.find(c => String(c.id) === String(foundGuest.companyId))
        : null

      if (linkedComp) {
        setLinkedCompany(linkedComp)
        applyTomadorPJ(linkedComp, foundGuest, stayInfo)
      } else {
        setLinkedCompany(null)
        applyTomadorPF(foundGuest, stayInfo)
      }
    } else {
      setExtractedData(prev => ({
        ...prev,
        ...stayInfo
      }))
      setFormFlatNumber(flat)
      if (checkin) setFormCheckin(checkin)
      if (checkout) setFormCheckout(checkout)
      setFormDiarias(diarias)
      if (valor) setFormValor(valor)
    }

    setMessages(prev => [
      ...prev,
      {
        role: "assistant",
        content: `Reserva carregada com sucesso! Flat **${flat}** • **${res.guestName || 'Hóspede'}**\n📅 Período: **${checkin}** a **${checkout}** (${diarias} diárias)\n💰 Valor: **R$ ${Number(valor || 0).toFixed(2)}**\n\nTodos os campos foram preenchidos no Studio para emissão!`
      }
    ])
  }

  // ── Leitura de Parâmetros de URL do CRM / Reservas ─────────────────────────
  const urlParamsProcessed = useRef(false)
  useEffect(() => {
    if (urlParamsProcessed.current) return
    const urlParams = new URLSearchParams(window.location.search)
    if (!urlParams.toString()) return

    const docParam = urlParams.get("doc") || urlParams.get("cpf") || urlParams.get("cnpj")
    const nomeParam = urlParams.get("nome")
    const flatParam = urlParams.get("flat") || urlParams.get("flatNumber")
    const checkinParam = urlParams.get("checkin") || urlParams.get("checkIn")
    const checkoutParam = urlParams.get("checkout") || urlParams.get("checkOut")
    const valorParam = urlParams.get("valor") || urlParams.get("valorServico")
    const diariasParam = urlParams.get("diarias") || urlParams.get("quantidadeDiarias")
    const resCodeParam = urlParams.get("resCode") || urlParams.get("reserva") || urlParams.get("resId")
    const companyIdParam = urlParams.get("companyId")
    const guestIdParam = urlParams.get("guestId")

    if ((companyIdParam && companies.length === 0) || (guestIdParam && guests.length === 0)) {
      return
    }

    if (docParam || nomeParam || flatParam || checkinParam || checkoutParam || valorParam || diariasParam || resCodeParam || companyIdParam || guestIdParam) {
      urlParamsProcessed.current = true

      const cleanDoc = (docParam || "").replace(/\D/g, "")
      const diariasNum = diariasParam ? Number(diariasParam) : (
        checkinParam && checkoutParam 
          ? Math.max(1, Math.round((new Date(checkoutParam).getTime() - new Date(checkinParam).getTime()) / (1000 * 60 * 60 * 24)))
          : 1
      )

      if (flatParam) setFormFlatNumber(flatParam)
      if (checkinParam) setFormCheckin(checkinParam)
      if (checkoutParam) setFormCheckout(checkoutParam)
      if (diariasParam) setFormDiarias(diariasNum)
      if (valorParam) setFormValor(valorParam)
      if (nomeParam) setFormTomadorNome(nomeParam)
      if (cleanDoc) setFormTomadorDoc(cleanDoc)

      let matchedCompany: any = null
      if (companyIdParam && companies.length > 0) {
        matchedCompany = companies.find(c => String(c.id) === String(companyIdParam))
      }

      let matchedGuest: any = null
      if (guestIdParam && guests.length > 0) {
        matchedGuest = guests.find(g => String(g.id) === String(guestIdParam))
        if (matchedGuest && matchedGuest.companyId && !matchedCompany && companies.length > 0) {
          matchedCompany = companies.find(c => String(c.id) === String(matchedGuest.companyId))
        }
      }

      if (!matchedCompany && cleanDoc.length === 14 && companies.length > 0) {
        matchedCompany = companies.find(c => (c.cnpj || "").replace(/\D/g, "") === cleanDoc)
      }

      let matchedRes: any = null
      if (resCodeParam && reservations.length > 0) {
        matchedRes = reservations.find(r => String(r.code) === resCodeParam || String(r.id) === resCodeParam)
      }

      const isPj = Boolean(matchedCompany) || cleanDoc.length === 14
      if (matchedCompany) setLinkedCompany(matchedCompany)
      if (matchedGuest) {
        setLinkedGuest(matchedGuest)
        setSelectedGuest(matchedGuest)
      }
      setTomadorMode(isPj ? "pj" : "pf")

      const stayInfo = {
        flatNumber: flatParam || (matchedRes ? String(matchedRes.flatNumber) : undefined),
        checkIn: checkinParam || (matchedRes ? String(matchedRes.checkinDate) : undefined),
        checkOut: checkoutParam || (matchedRes ? String(matchedRes.checkoutDate) : undefined),
        quantidadeDiarias: diariasNum,
        valorServico: valorParam || (matchedRes ? String(matchedRes.totalAmount) : undefined)
      }

      if (matchedCompany) {
        applyTomadorPJ(matchedCompany, matchedGuest || (nomeParam ? { fullName: nomeParam } : null), stayInfo)
      } else if (matchedGuest) {
        applyTomadorPF(matchedGuest, stayInfo)
      } else {
        setExtractedData(prev => ({
          ...prev,
          tomadorNome: nomeParam || prev.tomadorNome,
          tomadorCpfCnpj: cleanDoc || prev.tomadorCpfCnpj,
          ...stayInfo
        }))
      }

      const ready = Boolean((nomeParam || matchedCompany || matchedGuest) && (cleanDoc || matchedCompany?.cnpj || matchedGuest?.documentNumber) && (valorParam || matchedRes?.totalAmount))
      setIsReadyToEmit(ready)

      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: `Dados importados via URL/CRM com sucesso!\n${nomeParam || matchedCompany?.corporateName || matchedCompany?.name || matchedGuest?.fullName ? `• **${nomeParam || matchedCompany?.corporateName || matchedCompany?.name || matchedGuest?.fullName}** (${cleanDoc || matchedCompany?.cnpj || matchedGuest?.documentNumber || 'Sem documento'})\n` : ""}${flatParam || matchedRes?.flatNumber ? `• Flat **${flatParam || matchedRes?.flatNumber}**\n` : ""}${checkinParam ? `• Período: **${checkinParam}** a **${checkoutParam || '—'}** (${diariasNum} diárias)\n` : ""}${valorParam ? `• Valor: **R$ ${Number(valorParam).toFixed(2)}**\n` : ""}\n${isPj ? "🏢 Tomador configurado como Pessoa Jurídica (Empresa)." : "👤 Tomador configurado como Pessoa Física (Hóspede)."}`
        }
      ])
    }
  }, [companies, guests, reservations])

  // Fechar dropdown de hóspedes ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (guestComboboxRef.current && !guestComboboxRef.current.contains(event.target as Node)) {
        setGuestDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Scroll suave isolado dentro da caixa do chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: "smooth"
      })
    }
  }, [messages, chatLoading])

  // ── Filtro do Combobox Multi-Entidade ───────────────────────────────────────
  const filteredCrmItems = useMemo<CrmSearchItem[]>(() => {
    const q = guestSearchQuery.trim().toLowerCase()
    const qDigits = guestSearchQuery.replace(/\D/g, "")

    const matchingCompanies = companies.filter(c => {
      if (!q) return true
      const nameMatch = (c.corporateName || c.tradeName || c.razaoSocial || c.name || "").toLowerCase().includes(q)
      const cnpjMatch = qDigits ? (c.cnpj || "").replace(/\D/g, "").includes(qDigits) : false
      const emailMatch = (c.financialEmail || c.email || "").toLowerCase().includes(q)
      return nameMatch || cnpjMatch || emailMatch
    }).slice(0, q ? 10 : 5).map(c => ({
      id: `comp-${c.id}`,
      type: "company" as const,
      title: c.corporateName || c.tradeName || c.razaoSocial || c.name,
      subtitle: `CNPJ: ${c.cnpj || "Sem CNPJ"}${c.financialEmail || c.email ? ` • ${c.financialEmail || c.email}` : ""}`,
      badge: "🏢 PJ",
      raw: c
    }))

    const matchingGuests = guests.filter(g => {
      if (!q) return true
      const nameMatch = (g.fullName || g.name || "").toLowerCase().includes(q)
      const docMatch = qDigits ? (g.documentNumber || g.document || g.cpf || "").replace(/\D/g, "").includes(qDigits) : false
      const emailMatch = (g.email || "").toLowerCase().includes(q)
      return nameMatch || docMatch || emailMatch
    }).slice(0, q ? 15 : 10).map(g => ({
      id: `guest-${g.id}`,
      type: "guest" as const,
      title: g.fullName || g.name,
      subtitle: `${g.documentNumber || g.cpf ? `CPF: ${g.documentNumber || g.cpf}` : "Sem documento"}${g.companyName ? ` • 🏢 ${g.companyName}` : ""}${g.email ? ` • ${g.email}` : ""}`,
      badge: g.companyId ? "👤 PF (Corp)" : "👤 PF",
      raw: g
    }))

    const matchingReservations = reservations.filter(r => {
      if (!q) return true
      const guestMatch = (r.guestName || "").toLowerCase().includes(q)
      const flatMatch = String(r.flatNumber || "").toLowerCase().includes(q)
      const codeMatch = (r.code || "").toLowerCase().includes(q)
      return guestMatch || flatMatch || codeMatch
    }).slice(0, q ? 10 : 5).map(r => ({
      id: `res-${r.id || r.code}`,
      type: "reservation" as const,
      title: `Flat ${r.flatNumber} • ${r.guestName}`,
      subtitle: `${r.checkinDate || ""} a ${r.checkoutDate || ""}${r.totalAmount ? ` • R$ ${Number(r.totalAmount).toFixed(2)}` : ""}`,
      badge: "📅 Reserva",
      raw: r
    }))

    return [...matchingCompanies, ...matchingGuests, ...matchingReservations]
  }, [companies, guests, reservations, guestSearchQuery])

  const handleSelectEntity = (item: CrmSearchItem) => {
    setSelectedEntity(item)
    setGuestDropdownOpen(false)
    setGuestSearchQuery(item.title)

    if (item.type === "company") {
      const comp = item.raw
      setLinkedCompany(comp)
      applyTomadorPJ(comp, linkedGuest || selectedGuest, extractedData)
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: `Empresa selecionada como Tomadora: **${comp.corporateName || comp.tradeName || comp.name}** (CNPJ: ${comp.cnpj || 'Sem CNPJ'}). 🏢\n\nAgora informe o valor e os dados da hospedagem para emitirmos a NFS-e!`
        }
      ])
    } else if (item.type === "guest") {
      const g = item.raw
      setSelectedGuest(g)
      setLinkedGuest(g)

      const linkedComp = g.companyId 
        ? companies.find(c => String(c.id) === String(g.companyId))
        : null

      if (linkedComp) {
        setLinkedCompany(linkedComp)
        applyTomadorPJ(linkedComp, g, extractedData)
        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: `Hóspede corporativo selecionado: **${g.fullName || g.name}**! 🏢\n\nA empresa parceira **${linkedComp.corporateName || linkedComp.name}** (CNPJ: ${linkedComp.cnpj}) foi definida automaticamente como Tomadora.\n\n💡 Você pode alternar para Pessoa Física no banner acima.`
          }
        ])
      } else {
        setLinkedCompany(null)
        applyTomadorPF(g, extractedData)
        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: `Hóspede selecionado: **${g.fullName || g.name}** (${g.documentNumber || g.cpf ? `Doc: ${g.documentNumber || g.cpf}` : 'Sem documento'}). 👤\n\nAgora passe o valor da hospedagem ou confirme os dados ao lado!`
          }
        ])
      }

      const guestRes = reservations.find(r => 
        (g.id && r.guestId && String(r.guestId) === String(g.id)) ||
        (r.guestName && (g.fullName || g.name || "").toLowerCase() === r.guestName.toLowerCase())
      )
      if (guestRes) {
        populateStayFromReservation(guestRes)
      }
    } else if (item.type === "reservation") {
      const res = item.raw
      setLinkedReservation(res)
      populateStayFromReservation(res)
    }
  }

  // ── Sincronização Formulário -> Preview ──────────────────────────────────────
  const syncFormToPreview = () => {
    setExtractedData(prev => ({
      ...prev,
      tomadorNome: formTomadorNome,
      tomadorCpfCnpj: formTomadorDoc,
      tomadorEmail: formTomadorEmail,
      tomadorTelefone: formTomadorTelefone,
      tomadorEndereco: formTomadorEndereco,
      tomadorNumero: formTomadorNumero,
      tomadorComplemento: formTomadorComplemento,
      tomadorBairro: formTomadorBairro,
      tomadorCidade: formTomadorCidade,
      tomadorUf: formTomadorUf,
      tomadorCep: formTomadorCep,
      tomadorCodigoMunicipio: formTomadorIbge,
      flatNumber: formFlatNumber,
      checkIn: formCheckin,
      checkOut: formCheckout,
      quantidadeDiarias: formDiarias,
      valorServico: formValor,
      descricaoServico: formDescricao,
      aliquotaIss: formAliquota
    }))
    const ready = Boolean(formTomadorNome.trim() && formTomadorDoc.replace(/\D/g, "").length >= 11 && Number(formValor) > 0)
    setIsReadyToEmit(ready)
  }

  // ── Envio de Mensagem no Chat Fiscal ─────────────────────────────────────────
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = chatInput.trim()
    if (!text || chatLoading) return

    const newMsgs: ChatMessage[] = [...messages, { role: "user", content: text }]
    setMessages(newMsgs)
    setChatInput("")
    setChatLoading(true)

    try {
      const res = await fetch("/api/invoices/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMsgs,
          currentData: extractedData,
          tomador: extractedData
        }),
        credentials: "include"
      })
      const json = await res.json()
      if (json.reply) {
        setMessages(prev => [...prev, { role: "assistant", content: json.reply }])
      }
      if (json.data) {
        const merged = { ...extractedData, ...json.data }
        setExtractedData(merged)

        // Sincroniza de volta para o formulário estruturado
        if (merged.tomadorNome) setFormTomadorNome(merged.tomadorNome)
        if (merged.tomadorCpfCnpj) setFormTomadorDoc(merged.tomadorCpfCnpj)
        if (merged.tomadorEmail) setFormTomadorEmail(merged.tomadorEmail)
        if (merged.tomadorTelefone) setFormTomadorTelefone(merged.tomadorTelefone)
        if (merged.tomadorEndereco) setFormTomadorEndereco(merged.tomadorEndereco)
        if (merged.tomadorNumero) setFormTomadorNumero(merged.tomadorNumero)
        if (merged.tomadorBairro) setFormTomadorBairro(merged.tomadorBairro)
        if (merged.tomadorCep) setFormTomadorCep(merged.tomadorCep)
        if (merged.flatNumber) setFormFlatNumber(merged.flatNumber)
        if (merged.checkIn) setFormCheckin(merged.checkIn)
        if (merged.checkOut) setFormCheckout(merged.checkOut)
        if (merged.quantidadeDiarias) setFormDiarias(merged.quantidadeDiarias)
        if (merged.valorServico) setFormValor(String(merged.valorServico))
        if (merged.descricaoServico) setFormDescricao(merged.descricaoServico)

        if (merged.tomadorNome && merged.tomadorCpfCnpj && merged.valorServico) {
          setIsReadyToEmit(true)
        }
      }
      if (typeof json.ready === "boolean") {
        setIsReadyToEmit(json.ready)
      }
      fetchGuests()
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "Erro ao interpretar mensagem. Tente passar nome, documento e valor." }
      ])
    } finally {
      setChatLoading(false)
    }
  }

  // ── Emissão Oficial NFS-e (Transmitir) ──────────────────────────────────────
  const handleEmitInvoice = async (paramsOverride?: any) => {
    setIsEmitting(true)
    setEmissionErrorData(null)

    const payload = paramsOverride || {
      sistemaEmissor,
      tomadorNome: formTomadorNome || extractedData.tomadorNome,
      tomadorCpfCnpj: formTomadorDoc || extractedData.tomadorCpfCnpj,
      tomadorEmail: formTomadorEmail || extractedData.tomadorEmail,
      tomadorTelefone: formTomadorTelefone || extractedData.tomadorTelefone,
      tomadorEndereco: formTomadorEndereco || extractedData.tomadorEndereco,
      tomadorNumero: formTomadorNumero || extractedData.tomadorNumero,
      tomadorComplemento: formTomadorComplemento || extractedData.tomadorComplemento,
      tomadorBairro: formTomadorBairro || extractedData.tomadorBairro,
      tomadorCidade: formTomadorCidade || extractedData.tomadorCidade,
      tomadorUf: formTomadorUf || extractedData.tomadorUf,
      tomadorCep: formTomadorCep || extractedData.tomadorCep,
      tomadorCodigoMunicipio: formTomadorIbge || extractedData.tomadorCodigoMunicipio,
      flatNumber: formFlatNumber || extractedData.flatNumber,
      checkIn: formCheckin || extractedData.checkIn,
      checkOut: formCheckout || extractedData.checkOut,
      quantidadeDiarias: formDiarias || extractedData.quantidadeDiarias,
      valorServico: formValor || extractedData.valorServico,
      descricaoServico: formDescricao || extractedData.descricaoServico,
      aliquotaIss: formAliquota || extractedData.aliquotaIss
    }

    try {
      const res = await fetch("/api/nfse/emit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include"
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        setEmissionErrorData(data)
        toast({
          title: "Falha na Emissão",
          description: data.error || data.erros?.[0]?.Descricao || "Inconsistência na validação fiscal.",
          variant: "destructive"
        })
        return
      }

      const inv = data.invoice || data
      const successPayload = {
        ...data,
        ...inv,
        numeroNfse: data.numeroNfse || inv.numeroNfse,
        codigoVerificacao: data.codigoVerificacao || inv.codigoVerificacao,
        danfseUrl: data.danfseUrl || `/api/nfse/danfse/${inv.id || inv.numeroNfse}`,
        linkPrefeitura: data.linkPrefeitura || inv.linkPrefeitura
      }

      setEmissionSuccessData(successPayload)
      setLastEmittedInvoice(successPayload)
      fetchInvoices()
      fetchRetryQueue()

      toast({
        title: "NFS-e Autorizada com Sucesso! 🎉",
        description: `Nota Nº ${successPayload.numeroNfse} autorizada via ${sistemaEmissor === 'giss_prefeitura' ? 'GissOnline' : 'Padrão Nacional'}.`
      })

      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: `🎉 NOTA FISCAL AUTORIZADA COM SUCESSO!\n\n🧾 **NFS-e Nº ${successPayload.numeroNfse}**\n🔑 Código: **${successPayload.codigoVerificacao}**\n🏛️ Emissor: ${sistemaEmissor === 'giss_prefeitura' ? 'Prefeitura de Campos dos Goytacazes (GissOnline)' : 'Padrão Nacional (Gov.br)'}\n\nA nota já consta no Livro Fiscal e você pode abrir o espelho DANFSE oficial ao lado!`
        }
      ])
    } catch (err: any) {
      setEmissionErrorData({ error: err.message })
      toast({
        title: "Erro de Conexão",
        description: err.message,
        variant: "destructive"
      })
    } finally {
      setIsEmitting(false)
    }
  }

  // ── Auto Lookup de CNPJ ────────────────────────────────────────────────────
  const handleLookupDoc = async () => {
    const clean = formTomadorDoc.replace(/\D/g, "")
    if (clean.length !== 14) {
      toast({
        title: "CNPJ Incompleto",
        description: "Informe 14 dígitos para consultar na Receita.",
        variant: "destructive"
      })
      return
    }
    setIsLookingUpDoc(true)
    try {
      const res = await fetch(`/api/invoices/lookup-cnpj/${clean}`)
      const data = await res.json()
      if (data.razaoSocial) setFormTomadorNome(data.razaoSocial)
      if (data.logradouro) setFormTomadorEndereco(data.logradouro)
      if (data.numero) setFormTomadorNumero(data.numero)
      if (data.bairro) setFormTomadorBairro(data.bairro)
      if (data.cep) setFormTomadorCep(data.cep)
      if (data.email && !formTomadorEmail) setFormTomadorEmail(data.email)
      if (data.telefone && !formTomadorTelefone) setFormTomadorTelefone(data.telefone)
      toast({
        title: "CNPJ Encontrado",
        description: `${data.razaoSocial || 'Dados importados com sucesso'}`
      })
      syncFormToPreview()
    } catch {
      toast({
        title: "Erro na Busca",
        description: "Não foi possível consultar os dados do CNPJ.",
        variant: "destructive"
      })
    } finally {
      setIsLookingUpDoc(false)
    }
  }

  // ── Auto Lookup de CEP ─────────────────────────────────────────────────────
  const handleLookupCep = async () => {
    const clean = formTomadorCep.replace(/\D/g, "")
    if (clean.length !== 8) {
      toast({
        title: "CEP Inválido",
        description: "Informe 8 dígitos para consultar o CEP.",
        variant: "destructive"
      })
      return
    }
    setIsLookingUpCep(true)
    try {
      const res = await fetch(`/api/invoices/lookup-cep/${clean}`)
      const data = await res.json()
      if (data.logradouro) setFormTomadorEndereco(data.logradouro)
      if (data.bairro) setFormTomadorBairro(data.bairro)
      if (data.cidade || data.localidade) setFormTomadorCidade(data.cidade || data.localidade)
      if (data.uf) setFormTomadorUf(data.uf)
      if (data.ibge) setFormTomadorIbge(data.ibge)
      toast({
        title: "Endereço Localizado",
        description: `${data.logradouro || ''} - ${data.bairro || ''}`
      })
      syncFormToPreview()
    } catch {
      toast({
        title: "Erro na Busca de CEP",
        description: "CEP não encontrado.",
        variant: "destructive"
      })
    } finally {
      setIsLookingUpCep(false)
    }
  }

  // ── Salvar Configurações Fiscais ───────────────────────────────────────────
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingSettings(true)
    setSettingsSuccess(false)
    try {
      const res = await fetch("/api/nfse/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fiscalSettings),
        credentials: "include"
      })
      if (res.ok) {
        setSettingsSuccess(true)
        toast({ title: "Configurações Fiscais Salvas" })
        setTimeout(() => setSettingsSuccess(false), 3000)
      }
    } finally {
      setSavingSettings(false)
    }
  }

  // ── Inserir Tag no Template ────────────────────────────────────────────────
  const handleInsertTag = (tag: string) => {
    setFiscalSettings((prev: any) => ({
      ...prev,
      descriptionTemplate: (prev.descriptionTemplate || "") + tag
    }))
  }

  // ── Recalcular Diárias ao Mudar Checkin/Checkout ───────────────────────────
  const handleDateChange = (newIn?: string, newOut?: string) => {
    const cin = newIn !== undefined ? newIn : formCheckin
    const cout = newOut !== undefined ? newOut : formCheckout
    if (newIn !== undefined) setFormCheckin(newIn)
    if (newOut !== undefined) setFormCheckout(newOut)

    if (cin && cout) {
      const t1 = new Date(cin).getTime()
      const t2 = new Date(cout).getTime()
      if (t2 > t1) {
        const d = Math.max(1, Math.round((t2 - t1) / (1000 * 60 * 60 * 24)))
        setFormDiarias(d)
        setExtractedData(prev => ({
          ...prev,
          checkIn: cin,
          checkOut: cout,
          quantidadeDiarias: d
        }))
      }
    }
  }

  // ── Reservas Pendentes de Emissão de Nota (R3) ─────────────────────────────
  const pendingReservationsList = useMemo(() => {
    return reservations.filter(r => {
      // Ignora canceladas
      if (r.status === "cancelada" || r.status === "cancelled") return false

      // Verifica se já existe NFS-e autorizada para esta reserva
      const hasInvoice = invoices.some(inv => {
        if (inv.status !== "autorizada") return false
        const matchResId = inv.reservationId && String(inv.reservationId) === String(r.id)
        const matchResCode = inv.reservationCode && (String(inv.reservationCode) === String(r.code) || String(inv.reservationCode) === String(r.id))
        const matchConsolidated = inv.reservationIds && Array.isArray(inv.reservationIds) && inv.reservationIds.includes(String(r.id))
        return matchResId || matchResCode || matchConsolidated
      })

      return !hasInvoice
    }).map(r => {
      const guest = guests.find(g => 
        (r.guestId && String(g.id) === String(r.guestId)) ||
        (r.guestName && (g.fullName || g.name || "").toLowerCase() === String(r.guestName).toLowerCase())
      ) || (r.guestName ? { fullName: r.guestName, email: r.guestEmail, phone: r.guestPhone } : null)

      const company = guest?.companyId 
        ? companies.find(c => String(c.id) === String(guest.companyId))
        : (r.companyId ? companies.find(c => String(c.id) === String(r.companyId)) : null)

      const doc = (company?.cnpj || guest?.documentNumber || guest?.document || guest?.cpf || "").replace(/\D/g, "")
      const hasDoc = doc.length >= 11
      const isPj = Boolean(company)

      let diarias = 1
      if (r.checkinDate && r.checkoutDate) {
        const t1 = new Date(r.checkinDate).getTime()
        const t2 = new Date(r.checkoutDate).getTime()
        if (t2 > t1) {
          diarias = Math.max(1, Math.round((t2 - t1) / (1000 * 60 * 60 * 24)))
        }
      }

      return {
        ...r,
        diarias,
        guest,
        company,
        doc,
        hasDoc,
        isPj,
        tomadorDefaultName: isPj ? (company.corporateName || company.name) : (guest?.fullName || guest?.name || r.guestName),
        tomadorDefaultDoc: doc
      }
    })
  }, [reservations, invoices, guests, companies])

  // Filtro de Reservas Pendentes
  const filteredPendingReservations = useMemo(() => {
    return pendingReservationsList.filter(r => {
      // 1. Busca textual
      if (pendingSearch.trim()) {
        const q = pendingSearch.toLowerCase()
        const nameMatch = (r.guestName || r.tomadorDefaultName || "").toLowerCase().includes(q)
        const flatMatch = String(r.flatNumber || "").toLowerCase().includes(q)
        const codeMatch = (r.code || "").toLowerCase().includes(q)
        const compMatch = (r.company?.corporateName || r.company?.name || "").toLowerCase().includes(q)
        if (!nameMatch && !flatMatch && !codeMatch && !compMatch) return false
      }

      // 2. Filtro PF / PJ
      if (pendingTypeFilter === "pf" && r.isPj) return false
      if (pendingTypeFilter === "pj" && !r.isPj) return false

      // 3. Filtro Empresa
      if (pendingCompanyFilter !== "all") {
        if (!r.company || String(r.company.id) !== pendingCompanyFilter) return false
      }

      // 4. Filtro Cadastral
      if (pendingCadastralFilter === "ready" && !r.hasDoc) return false
      if (pendingCadastralFilter === "pending_doc" && r.hasDoc) return false

      return true
    })
  }, [pendingReservationsList, pendingSearch, pendingTypeFilter, pendingCompanyFilter, pendingCadastralFilter])

  // Ações em Lote: Seleção
  const handleToggleSelectPending = (id: string) => {
    setSelectedPendingIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSelectAllPending = () => {
    if (selectedPendingIds.length === filteredPendingReservations.length) {
      setSelectedPendingIds([])
    } else {
      setSelectedPendingIds(filteredPendingReservations.map(r => String(r.id || r.code)))
    }
  }

  // Emissão 1-Clique de Reserva Pendente
  const handleEmitPendingSingle = async (res: any) => {
    const isPj = res.isPj && res.company
    const stayInfo = {
      flatNumber: String(res.flatNumber),
      checkIn: res.checkinDate,
      checkOut: res.checkoutDate,
      quantidadeDiarias: res.diarias,
      valorServico: res.totalAmount || res.price || "0"
    }

    if (isPj) {
      applyTomadorPJ(res.company, res.guest, stayInfo)
    } else {
      applyTomadorPF(res.guest || { fullName: res.guestName }, stayInfo)
    }

    const payload = {
      sistemaEmissor,
      reservationId: res.id,
      reservationCode: res.code,
      tomadorNome: isPj ? (res.company.corporateName || res.company.name) : (res.guest?.fullName || res.guestName),
      tomadorCpfCnpj: res.doc,
      flatNumber: String(res.flatNumber),
      checkIn: res.checkinDate,
      checkOut: res.checkoutDate,
      quantidadeDiarias: res.diarias,
      valorServico: res.totalAmount || res.price || "0",
      descricaoServico: isPj 
        ? buildCorporateDescription(res.guest?.fullName || res.guestName, String(res.flatNumber), res.checkinDate, res.checkoutDate, res.diarias)
        : buildStandardDescription(res.guest?.fullName || res.guestName, String(res.flatNumber), res.checkinDate, res.checkoutDate, res.diarias)
    }

    await handleEmitInvoice(payload)
  }

  // Carregar Reserva Pendente no Studio
  const handleLoadToStudio = (res: any) => {
    populateStayFromReservation(res)
    setActiveTab("studio")
    toast({
      title: "Reserva Carregada no Studio",
      description: `Revise os campos e confirme a transmissão da NFS-e.`
    })
  }

  // Emissão em Lote Sequencial
  const handleBatchEmitSelected = async () => {
    if (selectedPendingIds.length === 0) return
    setBatchEmitting(true)
    setBatchResults(null)
    setBatchModalOpen(true)

    const selectedItems = pendingReservationsList.filter(r => selectedPendingIds.includes(String(r.id || r.code)))
    const results: any[] = []

    try {
      // Tenta chamar o endpoint de lote primário
      const res = await fetch("/api/nfse/emit-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sistemaEmissor,
          reservationIds: selectedPendingIds
        }),
        credentials: "include"
      })

      if (res.ok) {
        const data = await res.json()
        setBatchResults(data)
        fetchInvoices()
        setSelectedPendingIds([])
        return
      }
    } catch {}

    // Fallback sequencial seguro caso endpoint não esteja disponível
    for (const item of selectedItems) {
      try {
        const isPj = item.isPj && item.company
        const emitRes = await fetch("/api/nfse/emit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sistemaEmissor,
            reservationId: item.id,
            reservationCode: item.code,
            tomadorNome: item.tomadorDefaultName,
            tomadorCpfCnpj: item.tomadorDefaultDoc,
            flatNumber: String(item.flatNumber),
            checkIn: item.checkinDate,
            checkOut: item.checkoutDate,
            quantidadeDiarias: item.diarias,
            valorServico: item.totalAmount || "0",
            descricaoServico: isPj 
              ? buildCorporateDescription(item.guestName, String(item.flatNumber), item.checkinDate, item.checkoutDate, item.diarias)
              : buildStandardDescription(item.guestName, String(item.flatNumber), item.checkinDate, item.checkoutDate, item.diarias)
          }),
          credentials: "include"
        })
        const data = await emitRes.json()
        results.push({ item, success: emitRes.ok && data.success, data })
      } catch (err: any) {
        results.push({ item, success: false, error: err.message })
      }
    }

    const successCount = results.filter(r => r.success).length
    setBatchResults({
      success: true,
      totalCount: selectedItems.length,
      authorizedCount: successCount,
      errorCount: selectedItems.length - successCount,
      results
    })
    fetchInvoices()
    setSelectedPendingIds([])
    setBatchEmitting(false)
  }

  // Faturamento B2B Consolidado
  const selectedB2BItems = useMemo(() => {
    return pendingReservationsList.filter(r => selectedPendingIds.includes(String(r.id || r.code)))
  }, [pendingReservationsList, selectedPendingIds])

  const handleOpenConsolidatedModal = () => {
    if (selectedPendingIds.length === 0) {
      toast({
        title: "Selecione Reservas",
        description: "Selecione pelo menos 2 estadias corporativas para consolidar.",
        variant: "destructive"
      })
      return
    }

    // Auto-detecta empresa se todos forem da mesma
    const comps = Array.from(new Set(selectedB2BItems.map(i => i.company?.id).filter(Boolean)))
    if (comps.length === 1) {
      setConsolidatedCompanyId(String(comps[0]))
    }
    setConsolidatedModalOpen(true)
  }

  const handleEmitConsolidatedB2B = async () => {
    const comp = companies.find(c => String(c.id) === consolidatedCompanyId)
    if (!comp) {
      toast({
        title: "Empresa Não Selecionada",
        description: "Selecione a empresa tomadora da NFS-e consolidada.",
        variant: "destructive"
      })
      return
    }

    setConsolidatedEmitting(true)
    const totalVal = selectedB2BItems.reduce((acc, i) => acc + Number(i.totalAmount || 0), 0)

    let corporateDesc = `Faturamento consolidado referente aos serviços de hospedagem corporativa para os seguintes colaboradores:\n`
    selectedB2BItems.forEach(i => {
      corporateDesc += `• ${i.guestName || 'Colaborador'} (Flat ${i.flatNumber}, ${i.checkinDate} a ${i.checkoutDate} - ${i.diarias} diárias): R$ ${Number(i.totalAmount || 0).toFixed(2)}\n`
    })
    corporateDesc += `Valor Total: R$ ${totalVal.toFixed(2)}.\nLocal: CorpFlats - Av. Pelinca, 100, Campos dos Goytacazes/RJ.`

    try {
      const res = await fetch("/api/nfse/emit-consolidated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sistemaEmissor,
          companyId: comp.id,
          reservationIds: selectedPendingIds,
          tomadorNome: comp.corporateName || comp.tradeName || comp.name,
          tomadorCpfCnpj: (comp.cnpj || "").replace(/\D/g, ""),
          tomadorEmail: comp.financialEmail || comp.email,
          tomadorTelefone: comp.phone,
          valorServico: totalVal,
          descricaoServico: corporateDesc
        }),
        credentials: "include"
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setConsolidatedResults(data)
        fetchInvoices()
        setSelectedPendingIds([])
        toast({
          title: "NFS-e Consolidada Emitida! 🏢",
          description: `Nota autorizada para ${comp.corporateName} no valor de R$ ${totalVal.toFixed(2)}.`
        })
      } else {
        // Fallback para endpoint /api/nfse/emit comum com metadados consolidados
        const fallbackRes = await fetch("/api/nfse/emit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sistemaEmissor,
            isConsolidated: true,
            companyId: comp.id,
            reservationIds: selectedPendingIds,
            tomadorNome: comp.corporateName || comp.tradeName || comp.name,
            tomadorCpfCnpj: (comp.cnpj || "").replace(/\D/g, ""),
            tomadorEmail: comp.financialEmail || comp.email,
            tomadorTelefone: comp.phone,
            valorServico: totalVal,
            descricaoServico: corporateDesc
          }),
          credentials: "include"
        })
        const fbData = await fallbackRes.json()
        if (fallbackRes.ok && fbData.success) {
          setConsolidatedResults(fbData)
          fetchInvoices()
          setSelectedPendingIds([])
          toast({
            title: "NFS-e Consolidada Emitida!",
            description: `Nota emitida com sucesso.`
          })
        } else {
          toast({
            title: "Erro na Emissão Consolidada",
            description: fbData.error || "Inconsistência nos parâmetros.",
            variant: "destructive"
          })
        }
      }
    } catch (e: any) {
      toast({
        title: "Erro de Conexão",
        description: e.message,
        variant: "destructive"
      })
    } finally {
      setConsolidatedEmitting(false)
    }
  }

  // ── Competências Únicas Encontradas nas Notas ──────────────────────────────
  const uniqueCompetencias = useMemo(() => {
    const set = new Set<string>()
    invoices.forEach(inv => {
      if (inv.competencia) set.add(inv.competencia)
      else if (inv.dataEmissao) set.add(String(inv.dataEmissao).substring(0, 7))
    })
    return Array.from(set).sort().reverse()
  }, [invoices])

  // ── Livro Fiscal: Filtros Multi-Critério ────────────────────────────────────
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      // 1. Competência
      if (selectedCompetencia !== "all") {
        const comp = inv.competencia || (inv.dataEmissao ? String(inv.dataEmissao).substring(0, 7) : "")
        if (comp !== selectedCompetencia) return false
      }

      // 2. Status
      if (livroStatusFilter !== "all") {
        if ((inv.status || "autorizada") !== livroStatusFilter) return false
      }

      // 3. Tomador PF / PJ
      if (livroTomadorFilter !== "all") {
        const cleanDoc = (inv.tomadorCpfCnpj || "").replace(/\D/g, "")
        const isPj = cleanDoc.length === 14 || Boolean(inv.companyId)
        if (livroTomadorFilter === "pf" && isPj) return false
        if (livroTomadorFilter === "pj" && !isPj) return false
      }

      // 4. Sistema Emissor
      if (livroSistemaFilter !== "all") {
        if (inv.sistemaEmissor !== livroSistemaFilter) return false
      }

      // 5. Busca Textual
      if (searchFilter.trim()) {
        const term = searchFilter.toLowerCase()
        const matchNome = (inv.tomadorNome || "").toLowerCase().includes(term)
        const matchDoc = (inv.tomadorCpfCnpj || "").includes(term)
        const matchNum = String(inv.numeroNfse || inv.numeroNota || "").includes(term)
        const matchFlat = String(inv.flatNumber || "").includes(term)
        const matchVerif = String(inv.codigoVerificacao || "").toLowerCase().includes(term)
        if (!matchNome && !matchDoc && !matchNum && !matchFlat && !matchVerif) return false
      }

      return true
    })
  }, [invoices, selectedCompetencia, livroStatusFilter, livroTomadorFilter, livroSistemaFilter, searchFilter])

  // ── Subtotais do Período Filtrado ──────────────────────────────────────────
  const livroSubtotais = useMemo(() => {
    let faturamentoTotal = 0
    let issTotal = 0
    let autorizadasCount = 0
    let canceladasCount = 0
    let substituidasCount = 0
    let pfCount = 0
    let pjCount = 0

    filteredInvoices.forEach(inv => {
      const val = Number(inv.valorServico || 0)
      const st = inv.status || "autorizada"

      if (st === "autorizada") {
        autorizadasCount++
        faturamentoTotal += val
        const aliq = Number(inv.aliquotaIss || 2)
        issTotal += (val * aliq) / 100
      } else if (st === "cancelada") {
        canceladasCount++
      } else if (st === "substituida") {
        substituidasCount++
      }

      const docClean = (inv.tomadorCpfCnpj || "").replace(/\D/g, "")
      if (docClean.length === 14 || inv.companyId) {
        pjCount++
      } else {
        pfCount++
      }
    })

    return {
      faturamentoTotal,
      issTotal,
      autorizadasCount,
      canceladasCount,
      substituidasCount,
      pfCount,
      pjCount,
      totalCount: filteredInvoices.length
    }
  }, [filteredInvoices])

  // ── Cancelamento de NFS-e (R4) ──────────────────────────────────────────────
  const handleConfirmCancel = async () => {
    if (!invoiceToCancel || !cancelReason.trim()) {
      toast({
        title: "Motivo Obrigatório",
        description: "Informe a justificativa do cancelamento.",
        variant: "destructive"
      })
      return
    }

    setIsCancelling(true)
    try {
      const res = await fetch(`/api/nfse/cancel/${invoiceToCancel.id || invoiceToCancel.numeroNfse}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: cancelReason }),
        credentials: "include"
      })

      const data = await res.json()
      if (res.ok && data.success) {
        toast({
          title: "NFS-e Cancelada",
          description: `A nota Nº ${invoiceToCancel.numeroNfse} foi marcada como cancelada.`
        })
        setCancelModalOpen(false)
        setInvoiceToCancel(null)
        setCancelReason("")
        fetchInvoices()
      } else {
        toast({
          title: "Erro ao Cancelar",
          description: data.error || "A prefeitura rejeitou o pedido de cancelamento.",
          variant: "destructive"
        })
      }
    } catch (e: any) {
      toast({
        title: "Erro de Conexão",
        description: e.message,
        variant: "destructive"
      })
    } finally {
      setIsCancelling(false)
    }
  }

  // ── Substituição de NFS-e (R4) ──────────────────────────────────────────────
  const handleConfirmReplace = async (inv: any) => {
    setInvoiceToReplace(inv)
    setIsReplacing(true)

    try {
      const res = await fetch(`/api/nfse/replace/${inv.id || inv.numeroNfse}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: "Correção de dados da NFS-e" }),
        credentials: "include"
      })

      const data = await res.json()
      if (res.ok && data.success) {
        toast({
          title: "Substituição Iniciada",
          description: `Nota original substituída. Rascunho carregado no Studio!`
        })

        const draft = data.draft || inv
        setFormTomadorNome(draft.tomadorNome || "")
        setFormTomadorDoc(draft.tomadorCpfCnpj || "")
        setFormTomadorEmail(draft.tomadorEmail || "")
        setFormTomadorTelefone(draft.tomadorTelefone || "")
        setFormFlatNumber(draft.flatNumber || "")
        setFormCheckin(draft.checkIn || "")
        setFormCheckout(draft.checkOut || "")
        setFormDiarias(draft.quantidadeDiarias || 1)
        setFormValor(String(draft.valorServico || ""))
        setFormDescricao(draft.descricaoServico || "")
        setExtractedData(draft)

        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: `🔄 **Substituição de NFS-e Carregada!**\n\nOs dados da nota **Nº ${inv.numeroNfse}** foram clonados para este rascunho de substituição. Ajuste os campos necessários e transmita a nova nota autorizada!`
          }
        ])

        setActiveTab("studio")
        fetchInvoices()
      } else {
        toast({
          title: "Erro na Substituição",
          description: data.error || "Não foi possível iniciar a substituição.",
          variant: "destructive"
        })
      }
    } catch (e: any) {
      toast({
        title: "Erro de Conexão",
        description: e.message,
        variant: "destructive"
      })
    } finally {
      setIsReplacing(false)
    }
  }

  // ── Exportação Kit Contador (CSV UTF-8 BOM e JSON) ──────────────────────────
  const handleExportAccountingCsv = () => {
    // 1. Tenta baixar via endpoint oficial se disponível
    const compParam = selectedCompetencia !== "all" ? selectedCompetencia : ""
    const url = `/api/nfse/export-accounting?format=csv&competencia=${compParam}`

    // 2. Geração direta no client com UTF-8 BOM (\uFEFF) para garantia 100% no Excel
    const headers = [
      "Número NFS-e",
      "RPS",
      "Data Emissão",
      "Competência",
      "Status",
      "Sistema",
      "Cód. Verificação/Chave",
      "CPF/CNPJ Tomador",
      "Nome/Razão Social",
      "Tipo Tomador",
      "Endereço",
      "Flat",
      "Check-in",
      "Check-out",
      "Valor Bruto (R$)",
      "Alíquota ISS (%)",
      "Valor ISS (R$)",
      "Discriminação"
    ]

    const rows = filteredInvoices.map(inv => {
      const docClean = (inv.tomadorCpfCnpj || "").replace(/\D/g, "")
      const isPj = docClean.length === 14 || Boolean(inv.companyId)
      const val = Number(inv.valorServico || 0)
      const aliq = Number(inv.aliquotaIss || 2)
      const iss = (val * aliq) / 100
      const comp = inv.competencia || (inv.dataEmissao ? String(inv.dataEmissao).substring(0, 7) : "")
      const desc = (inv.descricaoServico || "").replace(/"/g, '""').replace(/\n/g, " ")

      return [
        inv.numeroNfse || inv.numeroNota || "",
        inv.rpsNumero || "",
        inv.dataEmissao ? new Date(inv.dataEmissao).toLocaleDateString("pt-BR") : "",
        comp,
        inv.status || "autorizada",
        inv.sistemaEmissor === "giss_prefeitura" ? "GissOnline" : "Padrão Nacional",
        inv.codigoVerificacao || inv.chaveAcesso || "",
        inv.tomadorCpfCnpj || "",
        `"${(inv.tomadorNome || "").replace(/"/g, '""')}"`,
        isPj ? "PJ" : "PF",
        `"${(inv.tomadorEndereco || "").replace(/"/g, '""')}"`,
        inv.flatNumber || "",
        inv.checkIn || "",
        inv.checkOut || "",
        val.toFixed(2),
        aliq.toFixed(2),
        iss.toFixed(2),
        `"${desc}"`
      ].join(";")
    })

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows].join("\r\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `kit-contador-nfse-${selectedCompetencia !== 'all' ? selectedCompetencia : 'completo'}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: "Kit Contador CSV Gerado",
      description: "Arquivo exportado em formato Excel UTF-8 com sucesso!"
    })
  }

  const handleExportAccountingJson = () => {
    const jsonContent = JSON.stringify(filteredInvoices, null, 2)
    const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `kit-contador-nfse-${selectedCompetencia !== 'all' ? selectedCompetencia : 'completo'}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: "Kit Contador JSON Exportado",
      description: `${filteredInvoices.length} notas exportadas em arquivo JSON.`
    })
  }

  // ── Reprocessar Fila de Contingência ────────────────────────────────────────
  const handleRetryItem = async (itemId: string) => {
    setReprocessingId(itemId)
    try {
      const res = await fetch(`/api/nfse/retry-queue/${itemId}/retry`, {
        method: "POST",
        credentials: "include"
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast({
          title: "Nota Reprocessada com Sucesso!",
          description: `NFS-e autorizada via contingência.`
        })
        fetchRetryQueue()
        fetchInvoices()
      } else {
        toast({
          title: "Falha na Retentativa",
          description: data.error || "O servidor da prefeitura retornou nova instabilidade.",
          variant: "destructive"
        })
      }
    } catch (e: any) {
      toast({
        title: "Erro de Conexão",
        description: e.message,
        variant: "destructive"
      })
    } finally {
      setReprocessingId(null)
    }
  }

  const handleRemoveRetryItem = async (itemId: string) => {
    try {
      const res = await fetch(`/api/nfse/retry-queue/${itemId}`, {
        method: "DELETE",
        credentials: "include"
      })
      if (res.ok) {
        toast({ title: "Item Removido da Fila de Contingência" })
        fetchRetryQueue()
      }
    } catch (e) {
      console.error(e)
    }
  }

  // ── Salvar Regras de Canal ──────────────────────────────────────────────────
  const handleToggleChannelRule = async (channelKey: string, currentVal: boolean) => {
    const updated = { ...channelRules, [channelKey]: !currentVal }
    setChannelRules(updated)
    setSavingChannelRules(true)
    try {
      await fetch("/api/nfse/channel-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: channelKey, enabled: !currentVal, rules: updated }),
        credentials: "include"
      })
      toast({
        title: "Regra Atualizada",
        description: `Canal ${channelKey} configurado para ${!currentVal ? 'emissão automática' : 'manual'}.`
      })
    } catch {
      toast({
        title: "Erro ao Salvar Regra",
        variant: "destructive"
      })
    } finally {
      setSavingChannelRules(false)
    }
  }

  // ── Upload de Certificado A1 ────────────────────────────────────────────────
  const handleUploadCertificate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!certFile) {
      toast({
        title: "Arquivo Obrigatório",
        description: "Selecione um arquivo .pfx ou .p12.",
        variant: "destructive"
      })
      return
    }

    setCertUploading(true)
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1]
        const res = await fetch("/api/nfse/certificate/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: certFile.name,
            fileBase64: base64,
            passphrase: certPassphrase
          }),
          credentials: "include"
        })

        const data = await res.json()
        if (res.ok && data.success) {
          toast({
            title: "Certificado A1 Atualizado com Sucesso!",
            description: "Chaves criptográficas instaladas no cofre seguro."
          })
          setCertModalOpen(false)
          setCertFile(null)
          setCertPassphrase("")
          fetchInvoices()
        } else {
          toast({
            title: "Erro no Certificado",
            description: data.error || "Senha incorreta ou arquivo inválido.",
            variant: "destructive"
          })
        }
        setCertUploading(false)
      }
      reader.readAsDataURL(certFile)
    } catch (e: any) {
      toast({
        title: "Erro no Upload",
        description: e.message,
        variant: "destructive"
      })
      setCertUploading(false)
    }
  }

  // ── Derivação dos Valores do Live Preview DANFSE ────────────────────────────
  const previewTomadorNome = formTomadorNome || extractedData.tomadorNome || "Nome do Tomador / Hóspede"
  const previewTomadorDoc = formTomadorDoc || extractedData.tomadorCpfCnpj || "000.000.000-00"
  const previewTomadorEmail = formTomadorEmail || extractedData.tomadorEmail || "email@exemplo.com"
  const previewTomadorTelefone = formTomadorTelefone || extractedData.tomadorTelefone || "(22) 99999-9999"
  const previewTomadorEndereco = `${formTomadorEndereco || extractedData.tomadorEndereco || 'Av. Pelinca'}, ${formTomadorNumero || extractedData.tomadorNumero || '100'}${formTomadorComplemento ? ` - ${formTomadorComplemento}` : ''} - ${formTomadorBairro || extractedData.tomadorBairro || 'Pelinca'}, ${formTomadorCidade || 'Campos dos Goytacazes'} - ${formTomadorUf || 'RJ'}, CEP ${formTomadorCep || '28035-000'}`
  const previewValorServico = Number(formValor || extractedData.valorServico || 0)
  const previewAliquotaIss = Number(formAliquota || 2)
  const previewValorIss = (previewValorServico * previewAliquotaIss) / 100
  const previewDescricao = formDescricao || extractedData.descricaoServico || (
    formTomadorNome ? buildStandardDescription(formTomadorNome, formFlatNumber, formCheckin, formCheckout, formDiarias) : "Discriminação dos serviços de hospedagem..."
  )

  return (
    <Shell>
      <div className="space-y-6 pb-20">
        {/* ══════════════════════════════════════════════════════════════════════
            R1: COCKPIT EXECUTIVO DE KPIS & MONITORAMENTO NO TOPO
           ══════════════════════════════════════════════════════════════════════ */}
        <div className="bg-card border border-border p-5 rounded-3xl shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl font-black tracking-tight text-foreground flex items-center gap-2 flex-wrap">
                    <span>Hub Fiscal & Emissor NFS-e 360°</span>
                    <Badge className="bg-emerald-600 text-white text-[10px] h-5">Produção Real</Badge>
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    Rental Miller's LTDA • CNPJ: <strong>47.964.813/0001-65</strong> • IM: <strong>142591</strong> • Campos dos Goytacazes/RJ
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Filtro de Competência Mensal */}
              <div className="flex items-center gap-1.5 bg-muted/60 px-3 py-1.5 rounded-2xl border border-border text-xs">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-bold text-muted-foreground">Competência:</span>
                <select
                  value={selectedCompetencia}
                  onChange={e => setSelectedCompetencia(e.target.value)}
                  className="bg-transparent font-black text-foreground cursor-pointer focus:outline-hidden"
                >
                  <option value="all">Todas as Competências</option>
                  {uniqueCompetencias.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Status do Certificado Digital A1 */}
              <button
                onClick={() => setCertModalOpen(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border text-xs font-bold transition-all shadow-2xs ${
                  certStatus && certStatus.daysRemaining < 30
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-600 animate-pulse"
                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                }`}
                title="Clique para abrir o Cofre do Certificado A1"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Certificado A1: <strong>{certStatus ? `${certStatus.daysRemaining}d` : "Válido"}</strong></span>
                <KeyRound className="w-3 h-3 opacity-60 ml-0.5" />
              </button>

              {/* Seletor Rápido de Motor Emissor */}
              <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-2xl border border-border">
                <button
                  onClick={() => setSistemaEmissor("giss_prefeitura")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    sistemaEmissor === "giss_prefeitura"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>🏛️ GissOnline</span>
                </button>

                <button
                  onClick={() => setSistemaEmissor("padrao_nacional")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    sistemaEmissor === "padrao_nacional"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>🇧🇷 Padrão Nacional</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4 KPI Cards em Tempo Real */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-border/60">
            {/* Card 1: Faturamento Emitido & ISS */}
            <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/80 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Faturamento Emitido</span>
                <div className="text-lg font-black text-emerald-600 mt-0.5">
                  R$ {livroSubtotais.faturamentoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  ISS Estimado (2%): <strong className="text-foreground">R$ {livroSubtotais.issTotal.toFixed(2)}</strong>
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
            </div>

            {/* Card 2: Notas Autorizadas vs Canceladas/Substituídas */}
            <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/80 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Status das Notas</span>
                <div className="text-lg font-black text-foreground mt-0.5 flex items-center gap-1.5">
                  <span className="text-emerald-600">{livroSubtotais.autorizadasCount}</span>
                  <span className="text-xs text-muted-foreground font-normal">autorizadas</span>
                  {livroSubtotais.canceladasCount > 0 && (
                    <span className="text-xs text-rose-500 font-bold ml-1">({livroSubtotais.canceladasCount} canc.)</span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Divisão: <strong>{livroSubtotais.pfCount} PF</strong> • <strong>{livroSubtotais.pjCount} PJ</strong>
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                <Layers className="w-4 h-4" />
              </div>
            </div>

            {/* Card 3: Reservas Pendentes de NFS-e (Clicável para aba Lote) */}
            <button
              onClick={() => setActiveTab("batch")}
              className="p-3.5 rounded-2xl bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/20 transition-all text-left flex items-center justify-between group cursor-pointer"
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Reservas Pendentes</span>
                  <Badge className="bg-amber-500 text-white text-[9px] h-4 px-1">Faturar</Badge>
                </div>
                <div className="text-lg font-black text-amber-700 dark:text-amber-300 mt-0.5">
                  {pendingReservationsList.length} estadias
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                  <span>Clique para emitir em lote</span>
                  <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </div>
            </button>

            {/* Card 4: Fila de Contingência / Retentativa */}
            <button
              onClick={() => setActiveTab("contingency")}
              className={`p-3.5 rounded-2xl border transition-all text-left flex items-center justify-between group cursor-pointer ${
                retryQueue.length > 0 
                  ? "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/30" 
                  : "bg-muted/30 hover:bg-muted/50 border-border/80"
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Contingência & Fila</span>
                  {retryQueue.length > 0 && (
                    <Badge className="bg-rose-600 text-white text-[9px] h-4 px-1 animate-pulse">Atenção</Badge>
                  )}
                </div>
                <div className={`text-lg font-black mt-0.5 ${retryQueue.length > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {retryQueue.length > 0 ? `${retryQueue.length} na fila` : "0 pendências"}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                  <span>{retryQueue.length > 0 ? "Reprocessar envios" : "Tudo operacional"}</span>
                  <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${retryQueue.length > 0 ? 'bg-rose-500/15 text-rose-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
                <Clock className="w-4 h-4" />
              </div>
            </button>
          </div>
        </div>

        {/* ── NAVEGAÇÃO DO HUB FISCAL (5 ABAS ESPECÍFICAS) ── */}
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="space-y-5">
          <TabsList className="bg-card border border-border p-1.5 rounded-2xl h-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 shadow-xs">
            <TabsTrigger value="studio" className="rounded-xl py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Sparkles className="w-4 h-4" />
              <span>✨ Emissor Studio</span>
            </TabsTrigger>

            <TabsTrigger value="batch" className="rounded-xl py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Zap className="w-4 h-4" />
              <span>📥 Faturamento & Lote</span>
              {pendingReservationsList.length > 0 && (
                <Badge className="ml-1 bg-amber-500 text-white text-[10px] px-1.5 py-0">
                  {pendingReservationsList.length}
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger value="history" className="rounded-xl py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FileText className="w-4 h-4" />
              <span>📚 Livro Fiscal ({invoices.length})</span>
            </TabsTrigger>

            <TabsTrigger value="contingency" className="rounded-xl py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Clock className="w-4 h-4" />
              <span>⚡ Contingência & Automação</span>
              {retryQueue.length > 0 && (
                <Badge className="ml-1 bg-rose-600 text-white text-[10px] px-1.5 py-0">
                  {retryQueue.length}
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger value="settings" className="rounded-xl py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Sliders className="w-4 h-4" />
              <span>⚙️ Config & Certificado A1</span>
            </TabsTrigger>
          </TabsList>

          {/* ══════════════════════════════════════════════════════════════════════
              R2: EMISSOR STUDIO UNIFICADO (CHAT IA + FORMULÁRIO + LIVE PREVIEW)
             ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="studio" className="space-y-4 m-0">
            {/* Banner da Última Nota Emitida com Ações Pós-Emissão */}
            {lastEmittedInvoice && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-3xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-xs text-foreground flex items-center gap-2">
                      <span>NFS-e Nº {lastEmittedInvoice.numeroNfse} Autorizada!</span>
                      <Badge className="bg-emerald-600 text-white text-[10px]">
                        {sistemaEmissor === 'giss_prefeitura' ? 'Prefeitura de Campos (Giss)' : 'Padrão Nacional'}
                      </Badge>
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Tomador: <strong>{lastEmittedInvoice.tomadorNome}</strong> • Valor: <strong>R$ {Number(lastEmittedInvoice.valorServico || 0).toFixed(2)}</strong> • Cód: <span className="font-mono">{lastEmittedInvoice.codigoVerificacao}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                  {lastEmittedInvoice.danfseUrl && (
                    <Button 
                      size="sm"
                      onClick={() => window.open(lastEmittedInvoice.danfseUrl, "_blank")}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl h-8.5 gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Ver DANFSE</span>
                    </Button>
                  )}
                  {lastEmittedInvoice.linkPrefeitura && (
                    <Button 
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(lastEmittedInvoice.linkPrefeitura, "_blank")}
                      className="font-bold text-xs rounded-xl h-8.5 gap-1.5 border-emerald-600/30 text-emerald-700 dark:text-emerald-300"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Portal Giss</span>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    {...bindZapiClickOrHoldWaWeb({
                      toast,
                      onClickZapi: async () => {
                        const message = `Olá, ${lastEmittedInvoice.tomadorNome}! Segue sua Nota Fiscal de Hospedagem CorpFlats (NFS-e Nº ${lastEmittedInvoice.numeroNfse}): https://corpflats.onrender.com/api/nfse/danfse/${lastEmittedInvoice.id || lastEmittedInvoice.numeroNfse}`
                        const phone = (lastEmittedInvoice.tomadorTelefone || "").replace(/\D/g, "")
                        await sendDirectZapiWithFallback({
                          phone: phone ? (phone.startsWith("55") ? phone : `55${phone}`) : "",
                          message,
                          recipientName: lastEmittedInvoice.tomadorNome || "Tomador",
                          triggerEvent: "nfse_dispatch",
                          label: `NFS-e Nº ${lastEmittedInvoice.numeroNfse}`,
                          toast
                        })
                      },
                      getWaUrl: () => {
                        const message = `Olá, ${lastEmittedInvoice.tomadorNome}! Segue sua Nota Fiscal de Hospedagem CorpFlats (NFS-e Nº ${lastEmittedInvoice.numeroNfse}): https://corpflats.onrender.com/api/nfse/danfse/${lastEmittedInvoice.id || lastEmittedInvoice.numeroNfse}`
                        return buildDirectWaWebUrl(lastEmittedInvoice.tomadorTelefone, message)
                      }
                    })}
                    className="font-bold text-xs rounded-xl h-8.5 gap-1.5 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                    title="Clique: enviar via Z-API | Segure 2s: abrir no WhatsApp Web"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </Button>
                  <Button 
                    size="sm"
                    variant="ghost"
                    onClick={() => setLastEmittedInvoice(null)}
                    className="font-bold text-xs rounded-xl h-8.5 text-muted-foreground"
                  >
                    Fechar
                  </Button>
                </div>
              </div>
            )}

            {/* Topo do Studio: CRM 360° Combobox & Alternador PJ/PF */}
            <div className="bg-card border border-border p-4 rounded-3xl shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Combobox Pesquisável Multi-Entidade */}
              <div className="relative flex-1" ref={guestComboboxRef}>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input 
                    placeholder="Pesquisar Hóspede (PF), Empresa (PJ) ou Reserva para carregar..."
                    value={guestSearchQuery}
                    onChange={e => {
                      setGuestSearchQuery(e.target.value)
                      setGuestDropdownOpen(true)
                    }}
                    onFocus={() => setGuestDropdownOpen(true)}
                    className="h-10 text-xs pl-9 pr-8 rounded-2xl bg-background font-medium border-border"
                  />
                  {guestSearchQuery && (
                    <button
                      onClick={() => {
                        setGuestSearchQuery("")
                        setSelectedGuest(null)
                        setSelectedEntity(null)
                        setLinkedCompany(null)
                        setLinkedGuest(null)
                        setLinkedReservation(null)
                        setExtractedData({})
                        setIsReadyToEmit(false)
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>

                {guestDropdownOpen && (
                  <div className="absolute top-11 left-0 right-0 z-50 bg-popover border border-border rounded-2xl shadow-xl max-h-72 overflow-y-auto p-1.5 text-xs space-y-1">
                    {filteredCrmItems.length === 0 ? (
                      <div className="p-3 text-center text-muted-foreground">Nenhuma entidade ou reserva encontrada</div>
                    ) : (
                      filteredCrmItems.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectEntity(item)}
                          className="w-full text-left p-2.5 rounded-xl hover:bg-muted/80 transition-colors flex items-start justify-between gap-2 border border-transparent hover:border-border/50"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-foreground truncate">{item.title}</span>
                            <span className="text-[10px] text-muted-foreground font-mono truncate">
                              {item.subtitle}
                            </span>
                          </div>
                          <Badge 
                            variant="outline" 
                            className={`text-[10px] shrink-0 ${
                              item.type === "company" ? "border-indigo-500/40 text-indigo-700 dark:text-indigo-300" :
                              item.type === "guest" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" :
                              "border-amber-500/40 text-amber-700 dark:text-amber-300"
                            }`}
                          >
                            {item.badge}
                          </Badge>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Botão de Alternância PJ / PF se houver vínculo */}
              {linkedCompany && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleToggleTomadorMode}
                  className="h-10 px-4 rounded-2xl font-bold text-xs gap-2 border-indigo-500/40 hover:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{tomadorMode === "pj" ? "Alternar para Hóspede (PF)" : "Alternar para Empresa (PJ)"}</span>
                </Button>
              )}
            </div>

            {/* Grid de Duas Colunas Integradas: Studio de Emissão */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* ── COLUNA 1 (ESQUERDA): ENTRADA (CHAT IA OU FORMULÁRIO ESTRUTURADO) ── */}
              <div className="lg:col-span-7 space-y-4">
                <Card className="rounded-3xl border border-border shadow-sm">
                  <CardHeader className="p-4 border-b border-border flex flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        {studioInputMode === "chat" ? <Bot className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
                      </div>
                      <div>
                        <CardTitle className="text-sm font-black text-foreground">
                          {studioInputMode === "chat" ? "Assistente Fiscal IA" : "Formulário Estruturado de Emissão"}
                        </CardTitle>
                        <CardDescription className="text-[11px]">
                          {studioInputMode === "chat" ? "Extração livre e sincronização instantânea" : "Edição direta dos campos fiscais e cadastrais"}
                        </CardDescription>
                      </div>
                    </div>

                    {/* Alternador de Modo: Chat vs Formulário */}
                    <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border">
                      <button
                        type="button"
                        onClick={() => setStudioInputMode("chat")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                          studioInputMode === "chat" ? "bg-background text-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>Chat IA</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setStudioInputMode("form")
                          syncFormToPreview()
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                          studioInputMode === "form" ? "bg-background text-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Formulário</span>
                      </button>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4">
                    {/* Modo 1: Chat Inteligente */}
                    {studioInputMode === "chat" ? (
                      <div className="space-y-3">
                        <div 
                          ref={chatContainerRef}
                          className="h-[430px] overflow-y-auto space-y-3 p-3 rounded-2xl bg-muted/20 border border-border/60 text-xs"
                        >
                          {messages.map((m, idx) => (
                            <div 
                              key={idx}
                              className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                              {m.role === "assistant" && (
                                <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5">
                                  <Bot className="w-3.5 h-3.5" />
                                </div>
                              )}
                              <div className={`p-3 rounded-2xl max-w-[85%] whitespace-pre-wrap leading-relaxed ${
                                m.role === "user"
                                  ? "bg-primary text-primary-foreground font-medium rounded-tr-xs"
                                  : "bg-card border border-border text-foreground font-normal rounded-tl-xs shadow-2xs"
                              }`}>
                                {m.content}
                              </div>
                            </div>
                          ))}
                          {chatLoading && (
                            <div className="flex items-center gap-2 text-muted-foreground text-xs italic p-2">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Interpretando mensagem e dados fiscais...</span>
                            </div>
                          )}
                        </div>

                        {/* Input do Chat */}
                        <form onSubmit={handleSendMessage} className="flex gap-2">
                          <Input 
                            placeholder="Ex: Emitir nota para Dr. Carlos, CPF 12345678900, flat 102, 3 diárias, R$ 750,00..."
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            disabled={chatLoading}
                            className="text-xs h-10 rounded-2xl bg-background"
                          />
                          <Button 
                            type="submit"
                            disabled={chatLoading || !chatInput.trim()}
                            className="h-10 px-4 rounded-2xl bg-primary text-primary-foreground font-bold text-xs gap-1.5 shrink-0"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Enviar</span>
                          </Button>
                        </form>

                        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                          <span>💡 Dica: Você pode digitar livremente ou abrir o formulário para editar campo por campo.</span>
                          <button
                            type="button"
                            onClick={() => {
                              setStudioInputMode("form")
                              syncFormToPreview()
                            }}
                            className="font-bold text-primary hover:underline"
                          >
                            Editar no formulário →
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Modo 2: Formulário Estruturado Editável */
                      <div className="space-y-4">
                        {/* Seção Tomador */}
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-primary" /> Dados do Tomador (Cliente)
                            </span>
                            <div className="flex items-center gap-2 text-[11px]">
                              <button
                                type="button"
                                onClick={() => setTomadorMode("pf")}
                                className={`font-bold px-2 py-0.5 rounded-lg transition-colors ${tomadorMode === "pf" ? "bg-emerald-600 text-white" : "text-muted-foreground hover:text-foreground"}`}
                              >
                                Pessoa Física (PF)
                              </button>
                              <button
                                type="button"
                                onClick={() => setTomadorMode("pj")}
                                className={`font-bold px-2 py-0.5 rounded-lg transition-colors ${tomadorMode === "pj" ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-foreground"}`}
                              >
                                Pessoa Jurídica (PJ)
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                            {/* Documento com Botão Buscar CNPJ */}
                            <div className="sm:col-span-5 space-y-1">
                              <Label className="text-[11px] font-bold">
                                {tomadorMode === "pj" ? "CNPJ da Empresa" : "CPF do Hóspede"}
                              </Label>
                              <div className="flex gap-1.5">
                                <Input 
                                  placeholder={tomadorMode === "pj" ? "00.000.000/0000-00" : "000.000.000-00"}
                                  value={formTomadorDoc}
                                  onChange={e => {
                                    setFormTomadorDoc(e.target.value)
                                    syncFormToPreview()
                                  }}
                                  className="h-9 text-xs rounded-xl"
                                />
                                {tomadorMode === "pj" && (
                                  <Button 
                                    type="button" 
                                    size="sm"
                                    onClick={handleLookupDoc}
                                    disabled={isLookingUpDoc}
                                    className="h-9 px-2.5 rounded-xl text-xs font-bold bg-muted hover:bg-muted/80 text-foreground border border-border shrink-0"
                                    title="Buscar Razão Social e Endereço pelo CNPJ"
                                  >
                                    <Search className={`w-3.5 h-3.5 ${isLookingUpDoc ? 'animate-spin' : ''}`} />
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Nome / Razão Social */}
                            <div className="sm:col-span-7 space-y-1">
                              <Label className="text-[11px] font-bold">
                                {tomadorMode === "pj" ? "Razão Social" : "Nome Completo"}
                              </Label>
                              <Input 
                                placeholder="Nome completo ou Razão Social..."
                                value={formTomadorNome}
                                onChange={e => {
                                  setFormTomadorNome(e.target.value)
                                  syncFormToPreview()
                                }}
                                className="h-9 text-xs rounded-xl font-bold"
                              />
                            </div>

                            {/* E-mail e Telefone */}
                            <div className="sm:col-span-6 space-y-1">
                              <Label className="text-[11px] font-bold">E-mail para envio</Label>
                              <Input 
                                placeholder="financeiro@empresa.com"
                                value={formTomadorEmail}
                                onChange={e => {
                                  setFormTomadorEmail(e.target.value)
                                  syncFormToPreview()
                                }}
                                className="h-9 text-xs rounded-xl"
                              />
                            </div>

                            <div className="sm:col-span-6 space-y-1">
                              <Label className="text-[11px] font-bold">Telefone (com DDD)</Label>
                              <Input 
                                placeholder="(22) 99999-9999"
                                value={formTomadorTelefone}
                                onChange={e => {
                                  setFormTomadorTelefone(e.target.value)
                                  syncFormToPreview()
                                }}
                                className="h-9 text-xs rounded-xl"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Seção Endereço com Busca Automática de CEP */}
                        <div className="space-y-2.5 pt-2 border-t border-border">
                          <span className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-primary" /> Endereço do Tomador
                          </span>

                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                            <div className="sm:col-span-4 space-y-1">
                              <Label className="text-[11px] font-bold">CEP</Label>
                              <div className="flex gap-1.5">
                                <Input 
                                  placeholder="28035-000"
                                  value={formTomadorCep}
                                  onChange={e => {
                                    setFormTomadorCep(e.target.value)
                                    syncFormToPreview()
                                  }}
                                  className="h-9 text-xs rounded-xl"
                                />
                                <Button 
                                  type="button" 
                                  size="sm"
                                  onClick={handleLookupCep}
                                  disabled={isLookingUpCep}
                                  className="h-9 px-2.5 rounded-xl text-xs font-bold bg-muted hover:bg-muted/80 text-foreground border border-border shrink-0"
                                  title="Buscar endereço pelo CEP"
                                >
                                  <Search className={`w-3.5 h-3.5 ${isLookingUpCep ? 'animate-spin' : ''}`} />
                                </Button>
                              </div>
                            </div>

                            <div className="sm:col-span-6 space-y-1">
                              <Label className="text-[11px] font-bold">Logradouro / Rua</Label>
                              <Input 
                                placeholder="Av. Pelinca"
                                value={formTomadorEndereco}
                                onChange={e => {
                                  setFormTomadorEndereco(e.target.value)
                                  syncFormToPreview()
                                }}
                                className="h-9 text-xs rounded-xl"
                              />
                            </div>

                            <div className="sm:col-span-2 space-y-1">
                              <Label className="text-[11px] font-bold">Número</Label>
                              <Input 
                                placeholder="100"
                                value={formTomadorNumero}
                                onChange={e => {
                                  setFormTomadorNumero(e.target.value)
                                  syncFormToPreview()
                                }}
                                className="h-9 text-xs rounded-xl"
                              />
                            </div>

                            <div className="sm:col-span-4 space-y-1">
                              <Label className="text-[11px] font-bold">Bairro</Label>
                              <Input 
                                placeholder="Pelinca"
                                value={formTomadorBairro}
                                onChange={e => {
                                  setFormTomadorBairro(e.target.value)
                                  syncFormToPreview()
                                }}
                                className="h-9 text-xs rounded-xl"
                              />
                            </div>

                            <div className="sm:col-span-5 space-y-1">
                              <Label className="text-[11px] font-bold">Município</Label>
                              <Input 
                                placeholder="Campos dos Goytacazes"
                                value={formTomadorCidade}
                                onChange={e => {
                                  setFormTomadorCidade(e.target.value)
                                  syncFormToPreview()
                                }}
                                className="h-9 text-xs rounded-xl"
                              />
                            </div>

                            <div className="sm:col-span-3 space-y-1">
                              <Label className="text-[11px] font-bold">UF / Estado</Label>
                              <Input 
                                placeholder="RJ"
                                value={formTomadorUf}
                                onChange={e => {
                                  setFormTomadorUf(e.target.value)
                                  syncFormToPreview()
                                }}
                                className="h-9 text-xs rounded-xl"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Seção Estadia & Valores */}
                        <div className="space-y-2.5 pt-2 border-t border-border">
                          <span className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-primary" /> Estadia & Valores
                          </span>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            <div className="space-y-1">
                              <Label className="text-[11px] font-bold">Flat Nº</Label>
                              <Input 
                                placeholder="Ex: 102"
                                value={formFlatNumber}
                                onChange={e => {
                                  setFormFlatNumber(e.target.value)
                                  syncFormToPreview()
                                }}
                                className="h-9 text-xs rounded-xl"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[11px] font-bold">Check-in</Label>
                              <Input 
                                type="date"
                                value={formCheckin}
                                onChange={e => handleDateChange(e.target.value, undefined)}
                                className="h-9 text-xs rounded-xl"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[11px] font-bold">Check-out</Label>
                              <Input 
                                type="date"
                                value={formCheckout}
                                onChange={e => handleDateChange(undefined, e.target.value)}
                                className="h-9 text-xs rounded-xl"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[11px] font-bold">Diárias</Label>
                              <Input 
                                type="number"
                                min={1}
                                value={formDiarias}
                                onChange={e => {
                                  setFormDiarias(Number(e.target.value))
                                  syncFormToPreview()
                                }}
                                className="h-9 text-xs rounded-xl"
                              />
                            </div>

                            <div className="col-span-2 space-y-1">
                              <Label className="text-[11px] font-bold">Valor Total do Serviço (R$)</Label>
                              <Input 
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={formValor}
                                onChange={e => {
                                  setFormValor(e.target.value)
                                  syncFormToPreview()
                                }}
                                className="h-9 text-xs rounded-xl font-black text-emerald-600"
                              />
                            </div>

                            <div className="col-span-2 space-y-1">
                              <Label className="text-[11px] font-bold">Alíquota ISS (%)</Label>
                              <Input 
                                type="number"
                                step="0.01"
                                value={formAliquota}
                                onChange={e => {
                                  setFormAliquota(e.target.value)
                                  syncFormToPreview()
                                }}
                                className="h-9 text-xs rounded-xl"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Seção Discriminação do Serviço com Tags Rápidas */}
                        <div className="space-y-2 pt-2 border-t border-border">
                          <div className="flex items-center justify-between">
                            <Label className="text-[11px] font-bold">Discriminação dos Serviços</Label>
                            <button
                              type="button"
                              onClick={() => {
                                const guest = formTomadorNome || "Hóspede"
                                const desc = tomadorMode === "pj" 
                                  ? buildCorporateDescription(guest, formFlatNumber, formCheckin, formCheckout, formDiarias)
                                  : buildStandardDescription(guest, formFlatNumber, formCheckin, formCheckout, formDiarias)
                                setFormDescricao(desc)
                                setExtractedData(prev => ({ ...prev, descricaoServico: desc }))
                              }}
                              className="text-[10px] text-primary font-bold hover:underline"
                            >
                              ↺ Gerar automático
                            </button>
                          </div>

                          <Textarea 
                            rows={3}
                            value={formDescricao}
                            onChange={e => {
                              setFormDescricao(e.target.value)
                              syncFormToPreview()
                            }}
                            className="text-xs font-mono rounded-xl p-2.5 bg-background leading-relaxed"
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* ── COLUNA 2 (DIREITA): LIVE DANFSE VISUAL PREVIEW & TRANSMISSÃO ── */}
              <div className="lg:col-span-5 space-y-4">
                <Card className="rounded-3xl border border-border shadow-md overflow-hidden bg-white dark:bg-card">
                  <CardHeader className="p-3.5 bg-muted/40 border-b border-border flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" />
                      <span className="text-xs font-black text-foreground">Espelho DANFSE ao Vivo</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                      ● Prévia em Tempo Real
                    </Badge>
                  </CardHeader>

                  <CardContent className="p-4 space-y-3.5 text-[11px]">
                    {/* Cabeçalho Oficial do DANFSE */}
                    <div className="border border-border/80 rounded-2xl p-3 bg-muted/10 space-y-2 text-center">
                      <div className="font-black text-xs uppercase tracking-wide text-foreground">
                        {sistemaEmissor === "giss_prefeitura" ? "Prefeitura Municipal de Campos dos Goytacazes" : "República Federativa do Brasil"}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-semibold">
                        {sistemaEmissor === "giss_prefeitura" ? "Secretaria Municipal de Fazenda • GissOnline" : "Ambiente de Dados Nacional • Padrão Nacional ADN"}
                      </div>
                      <div className="inline-block bg-primary/10 text-primary font-black px-2.5 py-0.5 rounded-md text-[10px]">
                        DOCUMENTO AUXILIAR DA NOTA FISCAL DE SERVIÇOS ELETRÔNICA (DANFSE)
                      </div>
                      <div className="flex justify-between text-[10px] font-mono text-muted-foreground pt-1 border-t border-border/40">
                        <span>Nº: <strong>{lastEmittedInvoice?.numeroNfse || "PRÉVIA"}</strong></span>
                        <span>Emissão: <strong>{new Date().toLocaleDateString("pt-BR")}</strong></span>
                        <span>Comp: <strong>{new Date().toISOString().substring(0, 7)}</strong></span>
                      </div>
                    </div>

                    {/* Prestador */}
                    <div className="border border-border/80 rounded-2xl p-2.5 bg-muted/5 space-y-1">
                      <span className="font-black text-[10px] uppercase text-muted-foreground tracking-wider">Prestador de Serviços</span>
                      <div className="font-bold text-foreground">RENTAL MILLER'S LTDA ME</div>
                      <div className="text-muted-foreground text-[10px]">
                        CNPJ: <span className="font-mono font-bold">47.964.813/0001-65</span> • IM: <span className="font-mono">142591</span>
                      </div>
                      <div className="text-muted-foreground text-[10px]">
                        Av. Pelinca, 100 - Pelinca, Campos dos Goytacazes/RJ • CEP 28035-000
                      </div>
                    </div>

                    {/* Tomador */}
                    <div className="border border-border/80 rounded-2xl p-2.5 bg-muted/5 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-black text-[10px] uppercase text-muted-foreground tracking-wider">Tomador do Serviço</span>
                        <Badge className="text-[9px] h-4 px-1.5" variant="outline">
                          {previewTomadorDoc.replace(/\D/g, "").length === 14 ? "🏢 PJ" : "👤 PF"}
                        </Badge>
                      </div>
                      <div className="font-bold text-foreground truncate">{previewTomadorNome}</div>
                      <div className="text-muted-foreground text-[10px] font-mono">
                        CPF/CNPJ: <strong>{previewTomadorDoc}</strong>
                      </div>
                      <div className="text-muted-foreground text-[10px] truncate">
                        {previewTomadorEndereco}
                      </div>
                    </div>

                    {/* Discriminação do Serviço */}
                    <div className="border border-border/80 rounded-2xl p-2.5 bg-muted/5 space-y-1">
                      <span className="font-black text-[10px] uppercase text-muted-foreground tracking-wider">Discriminação dos Serviços</span>
                      <div className="text-[10px] font-mono whitespace-pre-wrap text-foreground/90 leading-relaxed bg-background/50 p-2 rounded-xl border border-border/50 max-h-36 overflow-y-auto">
                        {previewDescricao}
                      </div>
                    </div>

                    {/* Valores e Tributação */}
                    <div className="border border-border/80 rounded-2xl p-2.5 bg-muted/10 space-y-2">
                      <span className="font-black text-[10px] uppercase text-muted-foreground tracking-wider">Valores & Tributos</span>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="flex justify-between"><span className="text-muted-foreground">Valor dos Serviços:</span> <strong className="font-mono">R$ {previewValorServico.toFixed(2)}</strong></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Deduções Legais:</span> <span className="font-mono">R$ 0,00</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Base de Cálculo:</span> <span className="font-mono">R$ {previewValorServico.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Alíquota ISS:</span> <span className="font-mono">{previewAliquotaIss.toFixed(2)}%</span></div>
                      </div>

                      <div className="pt-2 border-t border-border/60 flex justify-between items-center text-xs">
                        <span className="font-bold text-muted-foreground">Valor do ISS:</span>
                        <strong className="font-mono text-foreground font-black">R$ {previewValorIss.toFixed(2)}</strong>
                      </div>

                      <div className="flex justify-between items-center text-sm pt-1 border-t border-border/40">
                        <span className="font-black text-foreground">Valor Líquido:</span>
                        <strong className="font-mono text-emerald-600 font-black">R$ {previewValorServico.toFixed(2)}</strong>
                      </div>
                    </div>

                    {/* Botão Principal de Transmissão */}
                    <Button 
                      onClick={() => handleEmitInvoice()}
                      disabled={isEmitting || !previewTomadorNome || previewValorServico <= 0}
                      className="w-full h-11 rounded-2xl font-black text-xs gap-2 shadow-md bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {isEmitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Transmitindo à Prefeitura...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Transmitir NFS-e Oficial ({sistemaEmissor === 'giss_prefeitura' ? 'GissOnline' : 'Padrão Nacional'})</span>
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════════
              R3: ABA FATURAMENTO & LOTE (RESERVAS PENDENTES & B2B CONSOLIDADO)
             ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="batch" className="space-y-4 m-0">
            <Card className="rounded-3xl border border-border shadow-sm">
              <CardHeader className="p-5 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span>Fila de Reservas Pendentes de NFS-e</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Estadias finalizadas ou ativas que ainda não possuem nota fiscal autorizada vinculada
                  </CardDescription>
                </div>

                {/* Botões de Ação em Lote */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={fetchReservations}
                    className="h-9 px-3 rounded-xl text-xs font-bold gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Atualizar</span>
                  </Button>

                  <Button 
                    size="sm"
                    onClick={handleBatchEmitSelected}
                    disabled={selectedPendingIds.length === 0 || batchEmitting}
                    className="h-9 px-3.5 rounded-xl text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Emitir Selecionadas ({selectedPendingIds.length})</span>
                  </Button>

                  <Button 
                    size="sm"
                    variant="outline"
                    onClick={handleOpenConsolidatedModal}
                    disabled={selectedPendingIds.length < 2}
                    className="h-9 px-3.5 rounded-xl text-xs font-bold gap-1.5 border-indigo-500/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Faturamento B2B Consolidado</span>
                  </Button>
                </div>
              </CardHeader>

              {/* Barra de Filtros das Pendências */}
              <div className="p-4 bg-muted/20 border-b border-border flex flex-wrap items-center gap-3 text-xs">
                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar hóspede, flat, código..."
                    value={pendingSearch}
                    onChange={e => setPendingSearch(e.target.value)}
                    className="pl-8 text-xs h-8.5 rounded-xl bg-background"
                  />
                </div>

                <div className="flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded-xl border border-border">
                  <span className="text-muted-foreground font-bold">Tipo:</span>
                  <select
                    value={pendingTypeFilter}
                    onChange={(e: any) => setPendingTypeFilter(e.target.value)}
                    className="bg-transparent font-bold text-foreground cursor-pointer focus:outline-hidden"
                  >
                    <option value="all">Todos</option>
                    <option value="pf">Pessoa Física (PF)</option>
                    <option value="pj">Pessoa Jurídica (PJ)</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded-xl border border-border">
                  <span className="text-muted-foreground font-bold">Empresa:</span>
                  <select
                    value={pendingCompanyFilter}
                    onChange={e => setPendingCompanyFilter(e.target.value)}
                    className="bg-transparent font-bold text-foreground cursor-pointer focus:outline-hidden max-w-[180px] truncate"
                  >
                    <option value="all">Todas as Empresas</option>
                    {companies.map(c => (
                      <option key={c.id} value={String(c.id)}>{c.corporateName || c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded-xl border border-border">
                  <span className="text-muted-foreground font-bold">Cadastro:</span>
                  <select
                    value={pendingCadastralFilter}
                    onChange={(e: any) => setPendingCadastralFilter(e.target.value)}
                    className="bg-transparent font-bold text-foreground cursor-pointer focus:outline-hidden"
                  >
                    <option value="all">Todos</option>
                    <option value="ready">Prontos com Documento</option>
                    <option value="pending_doc">Falta CPF/CNPJ</option>
                  </select>
                </div>

                <div className="ml-auto text-muted-foreground font-mono">
                  {filteredPendingReservations.length} encontradas • {selectedPendingIds.length} selecionadas
                </div>
              </div>

              {/* Tabela de Reservas Pendentes */}
              <CardContent className="p-0">
                {filteredPendingReservations.length === 0 ? (
                  <div className="p-12 text-center text-xs text-muted-foreground space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto opacity-70" />
                    <p className="font-bold">Nenhuma reserva pendente de NFS-e encontrada.</p>
                    <p className="text-[11px]">Todas as estadias elegíveis já foram faturadas ou filtradas.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/40 text-muted-foreground border-b border-border font-bold">
                        <tr>
                          <th className="p-3 w-10 text-center">
                            <input 
                              type="checkbox" 
                              checked={selectedPendingIds.length > 0 && selectedPendingIds.length === filteredPendingReservations.length}
                              onChange={handleSelectAllPending}
                              className="rounded cursor-pointer"
                            />
                          </th>
                          <th className="p-3">Código / Flat</th>
                          <th className="p-3">Hóspede & Tomador Padrão</th>
                          <th className="p-3">Empresa Parceira</th>
                          <th className="p-3">Período / Diárias</th>
                          <th className="p-3">Valor (R$)</th>
                          <th className="p-3">Cadastro</th>
                          <th className="p-3 text-right">Ações Rápidas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredPendingReservations.map(res => {
                          const isSelected = selectedPendingIds.includes(String(res.id || res.code))
                          return (
                            <tr key={res.id || res.code} className={`hover:bg-muted/20 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
                              <td className="p-3 text-center">
                                <input 
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelectPending(String(res.id || res.code))}
                                  className="rounded cursor-pointer"
                                />
                              </td>

                              <td className="p-3 font-mono">
                                <div className="font-bold text-foreground">Flat {res.flatNumber}</div>
                                <div className="text-[10px] text-muted-foreground">{res.code || `#${res.id}`} • {res.channel || 'direto'}</div>
                              </td>

                              <td className="p-3">
                                <div className="font-bold text-foreground flex items-center gap-1.5">
                                  <span>{res.tomadorDefaultName}</span>
                                  <Badge variant="outline" className="text-[9px] h-4 px-1">
                                    {res.isPj ? "🏢 PJ" : "👤 PF"}
                                  </Badge>
                                </div>
                                <div className="text-[10px] text-muted-foreground font-mono">
                                  {res.tomadorDefaultDoc || "Sem documento informado"}
                                </div>
                              </td>

                              <td className="p-3">
                                {res.company ? (
                                  <div>
                                    <div className="font-bold text-foreground">{res.company.corporateName || res.company.name}</div>
                                    <div className="text-[10px] text-muted-foreground font-mono">{res.company.cnpj}</div>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>

                              <td className="p-3">
                                <div>{res.checkinDate} a {res.checkoutDate}</div>
                                <div className="text-[10px] text-muted-foreground font-bold">{res.diarias} diárias</div>
                              </td>

                              <td className="p-3 font-black text-emerald-600 font-mono">
                                R$ {Number(res.totalAmount || res.price || 0).toFixed(2)}
                              </td>

                              <td className="p-3">
                                {res.hasDoc ? (
                                  <Badge className="bg-emerald-600 text-white text-[9px] h-4.5 px-1.5 gap-1">
                                    <Check className="w-2.5 h-2.5" /> Pronto
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="border-amber-500/50 text-amber-600 text-[9px] h-4.5 px-1.5 gap-1">
                                    <AlertTriangle className="w-2.5 h-2.5" /> Falta Doc
                                  </Badge>
                                )}
                              </td>

                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    size="sm"
                                    onClick={() => handleEmitPendingSingle(res)}
                                    disabled={!res.hasDoc || isEmitting}
                                    className="h-7 px-2 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white gap-1 shadow-2xs"
                                    title="Emitir NFS-e com 1 clique"
                                  >
                                    <Zap className="w-3 h-3" />
                                    <span>1-Clique</span>
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleLoadToStudio(res)}
                                    className="h-7 px-2 text-[11px] font-bold rounded-lg text-primary border-primary/30 hover:bg-primary/10 gap-1"
                                    title="Carregar no Emissor Studio para revisar"
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    <span>Studio</span>
                                  </Button>
                                </div>
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

          {/* ══════════════════════════════════════════════════════════════════════
              R4: ABA LIVRO FISCAL AVANÇADO (FILTROS, SUBTOTAIS, CANCELAR & KIT)
             ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="history" className="space-y-4 m-0">
            <Card className="rounded-3xl border border-border shadow-sm">
              <CardHeader className="p-5 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span>Livro Fiscal Eletrônico & Gestão Contábil</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Histórico completo de notas autorizadas, canceladas e substituídas com exportação para contabilidade
                  </CardDescription>
                </div>

                {/* Botões do Kit Contador */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleExportAccountingCsv}
                    className="h-9 px-3 rounded-xl text-xs font-bold gap-1.5 border-emerald-600/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 shadow-2xs"
                    title="Exportar Planilha Excel UTF-8 BOM com todas as colunas fiscais"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Kit Contador (CSV Excel)</span>
                  </Button>

                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleExportAccountingJson}
                    className="h-9 px-3 rounded-xl text-xs font-bold gap-1.5 border-border shadow-2xs"
                    title="Exportar Pacote JSON Estruturado"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>JSON</span>
                  </Button>

                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={fetchInvoices}
                    className="h-9 px-3 rounded-xl text-xs font-bold gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingInvoices ? 'animate-spin' : ''}`} />
                    <span>Atualizar</span>
                  </Button>
                </div>
              </CardHeader>

              {/* Filtros Multi-Critério do Livro Fiscal */}
              <div className="p-4 bg-muted/20 border-b border-border flex flex-wrap items-center gap-3 text-xs">
                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar tomador, CPF, nota, flat..."
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    className="pl-8 text-xs h-8.5 rounded-xl bg-background"
                  />
                </div>

                <div className="flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded-xl border border-border">
                  <span className="text-muted-foreground font-bold">Status:</span>
                  <select
                    value={livroStatusFilter}
                    onChange={e => setLivroStatusFilter(e.target.value)}
                    className="bg-transparent font-bold text-foreground cursor-pointer focus:outline-hidden"
                  >
                    <option value="all">Todos os Status</option>
                    <option value="autorizada">Autorizadas</option>
                    <option value="cancelada">Canceladas</option>
                    <option value="substituida">Substituídas</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded-xl border border-border">
                  <span className="text-muted-foreground font-bold">Tomador:</span>
                  <select
                    value={livroTomadorFilter}
                    onChange={e => setLivroTomadorFilter(e.target.value)}
                    className="bg-transparent font-bold text-foreground cursor-pointer focus:outline-hidden"
                  >
                    <option value="all">PF e PJ</option>
                    <option value="pf">Pessoa Física (PF)</option>
                    <option value="pj">Pessoa Jurídica (PJ)</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded-xl border border-border">
                  <span className="text-muted-foreground font-bold">Sistema:</span>
                  <select
                    value={livroSistemaFilter}
                    onChange={e => setLivroSistemaFilter(e.target.value)}
                    className="bg-transparent font-bold text-foreground cursor-pointer focus:outline-hidden"
                  >
                    <option value="all">Todos os Sistemas</option>
                    <option value="giss_prefeitura">GissOnline (Prefeitura)</option>
                    <option value="padrao_nacional">Padrão Nacional</option>
                  </select>
                </div>

                <div className="ml-auto font-mono text-muted-foreground">
                  {filteredInvoices.length} notas no livro
                </div>
              </div>

              {/* Barra de Subtotais do Período Filtrado */}
              <div className="bg-muted/40 px-5 py-2.5 border-b border-border flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <span className="text-muted-foreground">Notas Filtradas:</span>{" "}
                    <strong className="text-foreground font-black">{livroSubtotais.totalCount}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Faturamento Bruto:</span>{" "}
                    <strong className="text-emerald-600 font-black">
                      R$ {livroSubtotais.faturamentoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">ISS Apurado:</span>{" "}
                    <strong className="text-foreground font-black">
                      R$ {livroSubtotais.issTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="text-emerald-600 font-bold">{livroSubtotais.autorizadasCount} autorizadas</span>
                  {livroSubtotais.canceladasCount > 0 && (
                    <span className="text-rose-500 font-bold">• {livroSubtotais.canceladasCount} canceladas</span>
                  )}
                  {livroSubtotais.substituidasCount > 0 && (
                    <span className="text-purple-500 font-bold">• {livroSubtotais.substituidasCount} substituídas</span>
                  )}
                </div>
              </div>

              {/* Tabela do Livro Fiscal */}
              <CardContent className="p-0">
                {loadingInvoices ? (
                  <div className="p-12 text-center text-xs text-muted-foreground">Carregando livro fiscal...</div>
                ) : filteredInvoices.length === 0 ? (
                  <div className="p-12 text-center text-xs text-muted-foreground">Nenhuma nota fiscal encontrada no período.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/40 text-muted-foreground border-b border-border font-bold">
                        <tr>
                          <th className="p-3.5">Número / Chave</th>
                          <th className="p-3.5">Sistema</th>
                          <th className="p-3.5">Tomador / Hóspede</th>
                          <th className="p-3.5">Apartamento</th>
                          <th className="p-3.5">Valor (R$)</th>
                          <th className="p-3.5">Emissão</th>
                          <th className="p-3.5">Status</th>
                          <th className="p-3.5 text-right">Ações Fiscais</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredInvoices.map((inv: any) => {
                          const status = inv.status || "autorizada"
                          const isAuthorized = status === "autorizada"
                          const isCancelled = status === "cancelada"
                          const isReplaced = status === "substituida"

                          return (
                            <tr key={inv.id || inv.numeroNfse} className="hover:bg-muted/20 transition-colors">
                              <td className="p-3.5 font-mono">
                                <div className="font-bold text-primary">{inv.numeroNfse || inv.numeroNota || `#${inv.id}`}</div>
                                <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">{inv.codigoVerificacao || inv.chaveAcesso}</div>
                              </td>

                              <td className="p-3.5">
                                <Badge variant="outline" className="text-[10px] font-semibold">
                                  {inv.sistemaEmissor === "giss_prefeitura" ? "🏛️ GissOnline" : "🇧🇷 Padrão Nacional"}
                                </Badge>
                              </td>

                              <td className="p-3.5">
                                <div className="font-bold text-foreground flex items-center gap-1.5">
                                  <span>{inv.tomadorNome}</span>
                                  <Badge variant="outline" className="text-[9px] h-3.5 px-1">
                                    {(inv.tomadorCpfCnpj || "").replace(/\D/g, "").length === 14 ? "PJ" : "PF"}
                                  </Badge>
                                </div>
                                <div className="text-[10px] text-muted-foreground font-mono">{inv.tomadorCpfCnpj}</div>
                              </td>

                              <td className="p-3.5 font-semibold text-foreground">
                                {inv.flatNumber ? `Flat ${inv.flatNumber}` : "—"}
                              </td>

                              <td className="p-3.5 font-black text-emerald-600 font-mono">
                                R$ {Number(inv.valorServico || 0).toFixed(2)}
                              </td>

                              <td className="p-3.5 text-muted-foreground">
                                {inv.dataEmissao ? new Date(inv.dataEmissao).toLocaleDateString("pt-BR") : "—"}
                              </td>

                              <td className="p-3.5">
                                {isAuthorized && (
                                  <Badge className="bg-emerald-600 text-white text-[10px] px-2 py-0.5">
                                    Autorizada
                                  </Badge>
                                )}
                                {isCancelled && (
                                  <div>
                                    <Badge className="bg-rose-600 text-white text-[10px] px-2 py-0.5">
                                      Cancelada
                                    </Badge>
                                    {inv.motivoCancelamento && (
                                      <div className="text-[9px] text-rose-500 font-medium truncate max-w-[120px]" title={inv.motivoCancelamento}>
                                        {inv.motivoCancelamento}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {isReplaced && (
                                  <Badge className="bg-purple-600 text-white text-[10px] px-2 py-0.5">
                                    Substituída
                                  </Badge>
                                )}
                              </td>

                              <td className="p-3.5 text-right">
                                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                  {/* Ver DANFSE */}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(`/api/nfse/danfse/${inv.id || inv.numeroNfse}`, "_blank")}
                                    className="h-7 px-2 text-[11px] font-bold rounded-lg gap-1 text-emerald-700 dark:text-emerald-300 border-emerald-600/40 hover:bg-emerald-500/10 shadow-2xs"
                                    title="Visualizar e Imprimir Espelho DANFSE Oficial"
                                  >
                                    <ExternalLink className="w-3 h-3 text-emerald-600" />
                                    <span>DANFSE</span>
                                  </Button>

                                  {/* Portal Giss */}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      const link = inv.linkPrefeitura || `https://giss.campos.rj.gov.br/nfse/visualizar?num=${inv.numeroNfse}&cod=${inv.codigoVerificacao}`
                                      window.open(link, "_blank")
                                    }}
                                    className="h-7 px-2 text-[11px] font-bold rounded-lg gap-1 text-blue-700 dark:text-blue-300 border-blue-600/40 hover:bg-blue-500/10 shadow-2xs"
                                    title="Consultar no Portal GissOnline da Prefeitura"
                                  >
                                    <Globe className="w-3 h-3 text-blue-600" />
                                    <span>Giss</span>
                                  </Button>

                                  {/* Baixar XML */}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => window.open(`/api/nfse/xml/${inv.id}`, "_blank")}
                                    className="h-7 px-1.5 text-[11px] font-bold rounded-lg text-muted-foreground hover:text-foreground"
                                    title="Baixar XML Assinado"
                                  >
                                    <Download className="w-3 h-3" />
                                  </Button>

                                  {/* WhatsApp Z-API e Web Click/Hold */}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    {...bindZapiClickOrHoldWaWeb({
                                      toast,
                                      onClickZapi: async () => {
                                        const message = `Olá, ${inv.tomadorNome}! Segue sua Nota Fiscal de Hospedagem CorpFlats (NFS-e Nº ${inv.numeroNfse}): https://corpflats.onrender.com/api/nfse/danfse/${inv.id}`
                                        const phone = (inv.tomadorTelefone || "").replace(/\D/g, "")
                                        await sendDirectZapiWithFallback({
                                          phone: phone ? (phone.startsWith("55") ? phone : `55${phone}`) : "",
                                          message,
                                          recipientName: inv.tomadorNome || "Tomador",
                                          triggerEvent: "nfse_dispatch",
                                          label: `NFS-e Nº ${inv.numeroNfse}`,
                                          toast
                                        })
                                      },
                                      getWaUrl: () => {
                                        const message = `Olá, ${inv.tomadorNome}! Segue sua Nota Fiscal de Hospedagem CorpFlats (NFS-e Nº ${inv.numeroNfse}): https://corpflats.onrender.com/api/nfse/danfse/${inv.id}`
                                        return buildDirectWaWebUrl(inv.tomadorTelefone, message)
                                      }
                                    })}
                                    className="h-7 px-1.5 text-[11px] font-bold rounded-lg text-emerald-600 hover:bg-emerald-500/10"
                                    title="Clique: enviar via Z-API | Segure 2s: abrir no WhatsApp Web"
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                  </Button>

                                  {/* Ciclo de Vida: Substituir & Cancelar se Autorizada */}
                                  {isAuthorized && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleConfirmReplace(inv)}
                                        className="h-7 px-2 text-[10px] font-bold rounded-lg text-purple-600 border-purple-500/30 hover:bg-purple-500/10"
                                        title="Substituir NFS-e por uma nova com correção"
                                      >
                                        <RefreshCw className="w-3 h-3" />
                                        <span>Substituir</span>
                                      </Button>

                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          setInvoiceToCancel(inv)
                                          setCancelModalOpen(true)
                                        }}
                                        className="h-7 px-1.5 text-[10px] font-bold rounded-lg text-rose-500 hover:bg-rose-500/10"
                                        title="Cancelar NFS-e na Prefeitura"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    </>
                                  )}
                                </div>
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

          {/* ══════════════════════════════════════════════════════════════════════
              R5: CENTRAL DE CONTINGÊNCIA & AUTOMAÇÃO POR CANAL
             ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="contingency" className="space-y-4 m-0">
            {/* Painel da Fila de Retentativa */}
            <Card className="rounded-3xl border border-border shadow-sm">
              <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4 text-rose-500" />
                    <span>Fila de Contingência & Retentativa Automática</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Emissões enfileiradas automaticamente devido a instabilidades temporárias nos servidores da prefeitura
                  </CardDescription>
                </div>

                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={fetchRetryQueue}
                  className="h-9 px-3 rounded-xl text-xs font-bold gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingRetryQueue ? 'animate-spin' : ''}`} />
                  <span>Atualizar Fila</span>
                </Button>
              </CardHeader>

              <CardContent className="p-0">
                {retryQueue.length === 0 ? (
                  <div className="p-12 text-center text-xs text-muted-foreground space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto opacity-80" />
                    <p className="font-bold text-foreground">Fila de contingência limpa!</p>
                    <p className="text-[11px]">Nenhuma nota fiscal pendente de retentativa externa no momento.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/40 text-muted-foreground border-b border-border font-bold">
                        <tr>
                          <th className="p-3.5">ID / Data</th>
                          <th className="p-3.5">Tomador</th>
                          <th className="p-3.5">Valor (R$)</th>
                          <th className="p-3.5">Motivo da Falha / Detalhe</th>
                          <th className="p-3.5">Tentativas</th>
                          <th className="p-3.5">Próxima Tentativa</th>
                          <th className="p-3.5 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {retryQueue.map((item: any) => (
                          <tr key={item.id} className="hover:bg-muted/20">
                            <td className="p-3.5 font-mono">
                              <div className="font-bold text-foreground">#{item.id}</div>
                              <div className="text-[10px] text-muted-foreground">{item.createdAt ? new Date(item.createdAt).toLocaleTimeString("pt-BR") : "—"}</div>
                            </td>

                            <td className="p-3.5">
                              <div className="font-bold text-foreground">{item.tomadorNome || item.payload?.tomadorNome || "Tomador"}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{item.tomadorCpfCnpj || item.payload?.tomadorCpfCnpj}</div>
                            </td>

                            <td className="p-3.5 font-black text-foreground font-mono">
                              R$ {Number(item.valorServico || item.payload?.valorServico || 0).toFixed(2)}
                            </td>

                            <td className="p-3.5 max-w-[260px]">
                              <div className="text-rose-500 font-medium text-[11px] truncate" title={item.lastError || item.error}>
                                {item.lastError || item.error || "Timeout conexão GissOnline"}
                              </div>
                            </td>

                            <td className="p-3.5">
                              <Badge variant="outline" className="text-[10px] font-bold">
                                {item.attempts || 1} / 5
                              </Badge>
                            </td>

                            <td className="p-3.5 text-muted-foreground text-[11px]">
                              {item.nextRetry ? new Date(item.nextRetry).toLocaleTimeString("pt-BR") : "Em espera"}
                            </td>

                            <td className="p-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  onClick={() => handleRetryItem(item.id)}
                                  disabled={reprocessingId === item.id}
                                  className="h-7 px-2.5 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                                >
                                  {reprocessingId === item.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
                                  <span>Reprocessar Agora</span>
                                </Button>

                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRemoveRetryItem(item.id)}
                                  className="h-7 px-2 text-[11px] font-bold rounded-lg text-rose-500 hover:bg-rose-500/10"
                                  title="Remover da fila"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Regras de Automação por Canal */}
            <Card className="rounded-3xl border border-border shadow-sm">
              <CardHeader className="p-5 border-b border-border">
                <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <span>Automação de Emissão por Canal de Reserva</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Configure quais reservas disparam emissão fiscal automática e quais aguardam liberação manual
                </CardDescription>
              </CardHeader>

              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { key: "direct", title: "Reservas Diretas (Site)", desc: "Auto-emissão ao confirmar pagamento da reserva direta" },
                    { key: "whatsapp", title: "Reservas WhatsApp / Balcão", desc: "Auto-emissão ao registrar hóspede com CPF/CNPJ no chat" },
                    { key: "booking", title: "Reservas Booking.com", desc: "Auto-emissão com dados fiscais fornecidos pelo canal OTA" },
                    { key: "airbnb", title: "Reservas Airbnb", desc: "Auto-emissão com recibo de repasse e dados do hóspede" },
                    { key: "autoCheckout", title: "Auto-Emissão no Check-out", desc: "Dispara NFS-e no momento em que a governança ou recepção marca saída" }
                  ].map(rule => (
                    <div key={rule.key} className="p-4 rounded-2xl bg-muted/20 border border-border flex items-center justify-between gap-4">
                      <div>
                        <h4 className="font-bold text-xs text-foreground">{rule.title}</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{rule.desc}</p>
                      </div>
                      <Switch 
                        checked={channelRules[rule.key] !== false}
                        onCheckedChange={() => handleToggleChannelRule(rule.key, channelRules[rule.key] !== false)}
                        disabled={savingChannelRules}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 5: CONFIGURAÇÕES FISCAIS & COFRE DO CERTIFICADO A1
             ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="settings" className="space-y-4 m-0">
            {/* Cofre do Certificado Digital A1 */}
            <Card className="rounded-3xl border border-border shadow-sm">
              <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    <span>Cofre do Certificado Digital A1</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Certificado ICP-Brasil utilizado na assinatura digital dos lotes SOAP e ADN
                  </CardDescription>
                </div>

                <Button 
                  onClick={() => setCertModalOpen(true)}
                  className="h-9 px-3.5 rounded-xl text-xs font-bold gap-1.5 bg-primary text-primary-foreground shadow-xs"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>Fazer Upload (.pfx / .p12)</span>
                </Button>
              </CardHeader>

              <CardContent className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                  <div className="p-3.5 rounded-2xl bg-muted/30 border border-border">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Status de Validade</span>
                    <div className="text-sm font-black text-emerald-600 mt-1 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{certStatus?.daysRemaining || 142} dias restantes</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Expira em: {certStatus?.validade || "2027-03-12"}</div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-muted/30 border border-border">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Titular</span>
                    <div className="text-sm font-black text-foreground mt-1 truncate">
                      {certStatus?.titular || "RENTAL MILLER'S LTDA"}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">CNPJ: 47.964.813/0001-65</div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-muted/30 border border-border">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Autoridade Certificadora</span>
                    <div className="text-sm font-black text-foreground mt-1">
                      {certStatus?.emissor || "AC Serasa ICP-Brasil"}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Tipo: A1 (Software / PFX)</div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-muted/30 border border-border">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Segurança</span>
                    <div className="text-sm font-black text-foreground mt-1 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-primary" />
                      <span>Criptografia AES-256</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Armazenado em cofre seguro</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Template de Tags & Parâmetros Fiscais da Empresa */}
            <Card className="rounded-3xl border border-border shadow-sm">
              <CardHeader className="p-5 border-b border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                      <Sliders className="w-5 h-5 text-primary" />
                      <span>Configurações Fiscais & Template de Discriminação</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Defina o modelo de texto padrão com tags dinâmicas e os parâmetros fiscais da empresa
                    </CardDescription>
                  </div>
                  {settingsSuccess && (
                    <Badge className="bg-emerald-600 text-white text-xs gap-1 py-1">
                      <Check className="w-3.5 h-3.5" /> Salvo com sucesso!
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                <form onSubmit={handleSaveSettings} className="space-y-6">
                  {/* Editor do Template de Tags */}
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Code className="w-4 h-4 text-primary" />
                        Texto Padrão da Discriminação do Serviço (com Tags Dinâmicas)
                      </Label>
                      <span className="text-[11px] text-muted-foreground">Clique nas tags abaixo para inserir no texto</span>
                    </div>

                    {/* Botões de Tags Rápidas */}
                    <div className="flex flex-wrap gap-1.5 p-2.5 rounded-2xl bg-muted/40 border border-border">
                      {[
                        { tag: "{nome_hospede}", label: "Nome do Hóspede" },
                        { tag: "{artigo}", label: "Artigo (do/da)" },
                        { tag: "{cpf_cnpj}", label: "CPF/CNPJ" },
                        { tag: "{flat}", label: "Número do Flat" },
                        { tag: "{flat_info}", label: "Texto do Flat" },
                        { tag: "{diarias}", label: "Qtd. Diárias" },
                        { tag: "{checkin_info}", label: "Linha Check-in" },
                        { tag: "{checkout_info}", label: "Linha Check-out" },
                        { tag: "{valor_total}", label: "Valor em R$" },
                        { tag: "{local_nome}", label: "Nome Local (CorpFlats)" },
                        { tag: "{local_endereco}", label: "Endereço Local" }
                      ].map(t => (
                        <button
                          key={t.tag}
                          type="button"
                          onClick={() => handleInsertTag(t.tag)}
                          className="px-2.5 py-1 rounded-xl bg-card hover:bg-primary hover:text-primary-foreground border border-border text-[11px] font-mono font-bold transition-all shadow-2xs"
                        >
                          + {t.tag} ({t.label})
                        </button>
                      ))}
                    </div>

                    <Textarea 
                      value={fiscalSettings.descriptionTemplate || ""}
                      onChange={e => setFiscalSettings({ ...fiscalSettings, descriptionTemplate: e.target.value })}
                      rows={6}
                      className="text-xs font-mono rounded-2xl leading-relaxed p-3.5 bg-background"
                      required
                    />
                  </div>

                  {/* Parâmetros Fiscais da Empresa */}
                  <div className="space-y-4 pt-2 border-t border-border">
                    <h3 className="text-xs font-black text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-primary" /> Parâmetros Municipais & Tributários
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      <div className="space-y-1.5">
                        <Label className="font-bold">Alíquota de ISS (%)</Label>
                        <Input 
                          type="number"
                          step="0.01"
                          value={fiscalSettings.aliquotaPadrao || "2.00"}
                          onChange={e => setFiscalSettings({ ...fiscalSettings, aliquotaPadrao: e.target.value })}
                          className="text-xs rounded-xl h-9.5"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="font-bold">Item da Lista de Serviço (ABRASF)</Label>
                        <Input 
                          value={fiscalSettings.codigoServico || "09.02"}
                          onChange={e => setFiscalSettings({ ...fiscalSettings, codigoServico: e.target.value })}
                          className="text-xs rounded-xl h-9.5"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="font-bold">Código de Tributação Municipal</Label>
                        <Input 
                          value={fiscalSettings.codigoTributacaoMunicipio || "799020000"}
                          onChange={e => setFiscalSettings({ ...fiscalSettings, codigoTributacaoMunicipio: e.target.value })}
                          className="text-xs rounded-xl h-9.5"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="font-bold">CNAE Principal</Label>
                        <Input 
                          value={fiscalSettings.cnae || "5510801"}
                          onChange={e => setFiscalSettings({ ...fiscalSettings, cnae: e.target.value })}
                          className="text-xs rounded-xl h-9.5"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="font-bold">Inscrição Municipal (IM)</Label>
                        <Input 
                          value="142591"
                          disabled
                          className="text-xs rounded-xl h-9.5 bg-muted/60"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="font-bold">CNPJ Prestador</Label>
                        <Input 
                          value="47.964.813/0001-65"
                          disabled
                          className="text-xs rounded-xl h-9.5 bg-muted/60"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button 
                      type="submit"
                      disabled={savingSettings}
                      className="h-11 px-8 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs gap-2 shadow-md"
                    >
                      {savingSettings ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      <span>Salvar Configurações Fiscais</span>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ══════════════════════════════════════════════════════════════════════
            MODAIS AUXILIARES
           ══════════════════════════════════════════════════════════════════════ */}

        {/* Modal de Cancelamento de NFS-e */}
        <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl shadow-2xl">
            <DialogHeader className="text-left pb-2">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-600 flex items-center justify-center mb-2">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <DialogTitle className="text-base font-black text-foreground">
                Cancelar NFS-e Nº {invoiceToCancel?.numeroNfse}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                O cancelamento será transmitido diretamente à Prefeitura de Campos dos Goytacazes. Esta ação é irreversível.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 rounded-xl bg-muted/30 border border-border space-y-1">
                <div>Tomador: <strong>{invoiceToCancel?.tomadorNome}</strong></div>
                <div>Valor: <strong>R$ {Number(invoiceToCancel?.valorServico || 0).toFixed(2)}</strong></div>
                <div>Código de Verificação: <span className="font-mono">{invoiceToCancel?.codigoVerificacao}</span></div>
              </div>

              <div className="space-y-1.5">
                <Label className="font-bold">Motivo do Cancelamento (Obrigatório)</Label>
                <Textarea 
                  placeholder="Ex: Erro no preenchimento do valor das diárias..."
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  rows={3}
                  className="text-xs rounded-xl"
                  required
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button 
                variant="outline"
                onClick={() => setCancelModalOpen(false)}
                className="font-bold text-xs rounded-xl h-9.5"
              >
                Voltar
              </Button>
              <Button 
                onClick={handleConfirmCancel}
                disabled={isCancelling || !cancelReason.trim()}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl h-9.5 gap-1.5"
              >
                {isCancelling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Confirmar Cancelamento</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal de Faturamento B2B Consolidado */}
        <Dialog open={consolidatedModalOpen} onOpenChange={setConsolidatedModalOpen}>
          <DialogContent className="sm:max-w-lg bg-card border border-border rounded-3xl shadow-2xl">
            <DialogHeader className="text-left pb-2">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center mb-2">
                <Building2 className="w-5 h-5" />
              </div>
              <DialogTitle className="text-base font-black text-foreground">
                Faturamento Corporativo B2B Consolidado
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Emissão de 1 única NFS-e consolidando múltiplas estadias de colaboradores para a empresa parceira
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-2 text-xs">
              <div className="space-y-1.5">
                <Label className="font-bold">Empresa Parceira Tomadora da NFS-e</Label>
                <select
                  value={consolidatedCompanyId}
                  onChange={e => setConsolidatedCompanyId(e.target.value)}
                  className="w-full h-9.5 rounded-xl border border-border bg-background px-3 text-xs font-bold"
                >
                  <option value="">Selecione a Empresa...</option>
                  {companies.map(c => (
                    <option key={c.id} value={String(c.id)}>
                      {c.corporateName || c.name} • CNPJ: {c.cnpj}
                    </option>
                  ))}
                </select>
              </div>

              <div className="border border-border rounded-2xl p-3 bg-muted/20 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-muted-foreground">Estadias Selecionadas:</span>
                  <strong className="text-foreground">{selectedB2BItems.length} estadias</strong>
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-border/60 text-[11px]">
                  {selectedB2BItems.map(i => (
                    <div key={i.id || i.code} className="py-1.5 flex justify-between">
                      <div>
                        <strong className="text-foreground">{i.guestName}</strong>
                        <div className="text-[10px] text-muted-foreground">Flat {i.flatNumber} • {i.checkinDate} a {i.checkoutDate} ({i.diarias}d)</div>
                      </div>
                      <div className="font-mono font-bold text-emerald-600">
                        R$ {Number(i.totalAmount || 0).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-border flex justify-between items-center text-xs font-black">
                  <span>Valor Total Consolidado:</span>
                  <span className="text-emerald-600 font-mono text-sm">
                    R$ {selectedB2BItems.reduce((acc, i) => acc + Number(i.totalAmount || 0), 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button 
                variant="outline"
                onClick={() => setConsolidatedModalOpen(false)}
                className="font-bold text-xs rounded-xl h-9.5"
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleEmitConsolidatedB2B}
                disabled={consolidatedEmitting || !consolidatedCompanyId}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl h-9.5 gap-1.5"
              >
                {consolidatedEmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Building2 className="w-3.5 h-3.5" />}
                <span>Emitir NFS-e Consolidada</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal de Upload de Certificado A1 */}
        <Dialog open={certModalOpen} onOpenChange={setCertModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl shadow-2xl">
            <DialogHeader className="text-left pb-2">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-2">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <DialogTitle className="text-base font-black text-foreground">
                Upload de Certificado Digital A1
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Envie o arquivo .pfx ou .p12 do seu certificado ICP-Brasil e informe a senha para validação imediata
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleUploadCertificate} className="space-y-3.5 py-2 text-xs">
              <div className="space-y-1.5">
                <Label className="font-bold">Arquivo do Certificado (.pfx / .p12)</Label>
                <Input 
                  type="file"
                  accept=".pfx,.p12"
                  onChange={e => setCertFile(e.target.files?.[0] || null)}
                  className="text-xs rounded-xl h-10 cursor-pointer"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="font-bold">Senha de Proteção do Certificado</Label>
                <Input 
                  type="password"
                  placeholder="Digite a senha do certificado..."
                  value={certPassphrase}
                  onChange={e => setCertPassphrase(e.target.value)}
                  className="text-xs rounded-xl h-9.5"
                  required
                />
              </div>

              <div className="p-3 rounded-xl bg-muted/40 border border-border text-[11px] text-muted-foreground leading-relaxed">
                🔒 O arquivo e a senha serão armazenados com criptografia de ponta a ponta no servidor para assinatura digital dos lotes da prefeitura.
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button 
                  type="button"
                  variant="outline"
                  onClick={() => setCertModalOpen(false)}
                  className="font-bold text-xs rounded-xl h-9.5"
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit"
                  disabled={certUploading || !certFile || !certPassphrase}
                  className="bg-primary text-primary-foreground font-bold text-xs rounded-xl h-9.5 gap-1.5"
                >
                  {certUploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                  <span>Instalar Certificado A1</span>
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal de Sucesso de Emissão */}
        <Dialog open={!!emissionSuccessData} onOpenChange={() => setEmissionSuccessData(null)}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl shadow-2xl">
            <DialogHeader className="text-center pb-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <DialogTitle className="text-lg font-black text-foreground">NFS-e Autorizada com Sucesso!</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                A nota fiscal foi processada e autorizada pelo sistema {sistemaEmissor === "giss_prefeitura" ? "GissOnline (Prefeitura de Campos)" : "Padrão Nacional (Gov.br)"}.
              </DialogDescription>
            </DialogHeader>

            {emissionSuccessData && (
              <div className="p-4 rounded-2xl bg-muted/50 border border-border text-xs space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Número da Nota:</span> <strong className="text-primary font-black text-sm">{emissionSuccessData.numeroNfse || emissionSuccessData.numeroNota || "Emitida"}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Código de Verificação:</span> <strong className="font-mono">{emissionSuccessData.codigoVerificacao}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Data/Hora:</span> <span>{new Date().toLocaleString("pt-BR")}</span></div>
              </div>
            )}

            <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button 
                onClick={() => {
                  const target = emissionSuccessData?.danfseUrl || `/api/nfse/danfse/${emissionSuccessData?.numeroNfse || emissionSuccessData?.id || 'latest'}`
                  window.open(target, "_blank")
                }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl h-10 gap-1.5 shadow-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Ver DANFSE Oficial</span>
              </Button>

              <Button 
                variant="outline"
                onClick={() => window.open(emissionSuccessData?.linkPrefeitura || "https://goytacazes.giss.com.br/portal/#/nfse/consulta", "_blank")}
                className="flex-1 font-bold text-xs rounded-xl h-10 gap-1.5 border-emerald-600/30 text-emerald-700 dark:text-emerald-400"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Portal Giss</span>
              </Button>

              <Button 
                variant="outline"
                onClick={() => setEmissionSuccessData(null)}
                className="font-bold text-xs rounded-xl h-10 px-4"
              >
                Concluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal de Erro / Rejeição de Emissão */}
        <Dialog open={!!emissionErrorData} onOpenChange={() => setEmissionErrorData(null)}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl shadow-2xl">
            <DialogHeader className="text-center pb-2">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto mb-2">
                <AlertCircle className="w-7 h-7" />
              </div>
              <DialogTitle className="text-lg font-black text-foreground">Retorno do Validador</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Ocorreu uma rejeição ou inconsistência durante o envio da nota fiscal.
              </DialogDescription>
            </DialogHeader>

            <div className="p-4 rounded-2xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200 space-y-1.5">
              <div className="font-bold">Detalhe da Rejeição:</div>
              <p className="font-mono text-[11px] leading-relaxed">
                {emissionErrorData?.error || emissionErrorData?.erros?.[0]?.Descricao || "Erro desconhecido na transmissão."}
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button 
                variant="outline"
                onClick={() => setEmissionErrorData(null)}
                className="w-full font-bold text-xs rounded-xl h-10"
              >
                Voltar e Corrigir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  )
}

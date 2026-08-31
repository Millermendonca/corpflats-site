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
  Settings, Sliders, Check, Copy, HelpCircle, Code, ListFilter, MessageSquare
} from "lucide-react"

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
  tomadorBairro?: string
  tomadorCodigoMunicipio?: string
  tomadorUf?: string
  tomadorCep?: string
  valorServico?: string
  checkIn?: string
  checkOut?: string
  quantidadeDiarias?: number
  flatNumber?: string
  descricaoServico?: string
}

export default function FiscalInvoicesPage() {
  // ── Aba Ativa ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"chat" | "form" | "history" | "settings">("chat")
  
  // ── Motor Emissor (Prefeitura vs Nacional) ─────────────────────────────────
  const [sistemaEmissor, setSistemaEmissor] = useState<"giss_prefeitura" | "padrao_nacional">("giss_prefeitura")

  // ── Dados Fiscais e Livro de Notas ─────────────────────────────────────────
  const [invoices, setInvoices] = useState<any[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(true)
  const [searchFilter, setSearchFilter] = useState("")

  // ── Clientes do CRM e Combobox Pesquisável ──────────────────────────────────
  const [guests, setGuests] = useState<any[]>([])
  const [guestSearchQuery, setGuestSearchQuery] = useState("")
  const [guestDropdownOpen, setGuestDropdownOpen] = useState(false)
  const [selectedGuest, setSelectedGuest] = useState<any | null>(null)
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

  // ── Chat Fiscal Inteligente ────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Olá! 👋 Sou o assistente de emissão de NFS-e da CorpFlats.\n\nPode me passar os dados do cliente e da hospedagem de forma livre (nome, CPF/CNPJ, apartamento, datas e valor). Eu preencho tudo automaticamente para você!"
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

  // ── Formulário Tradicional de Emissão ──────────────────────────────────────
  const [formTomadorNome, setFormTomadorNome] = useState("")
  const [formTomadorDoc, setFormTomadorDoc] = useState("")
  const [formTomadorEmail, setFormTomadorEmail] = useState("")
  const [formTomadorTelefone, setFormTomadorTelefone] = useState("")
  const [formTomadorCep, setFormTomadorCep] = useState("28035000")
  const [formTomadorEndereco, setFormTomadorEndereco] = useState("Av. Pelinca, 100")
  const [formTomadorNumero, setFormTomadorNumero] = useState("100")
  const [formTomadorBairro, setFormTomadorBairro] = useState("Pelinca")
  const [formFlatNumber, setFormFlatNumber] = useState("")
  const [formCheckin, setFormCheckin] = useState(new Date().toISOString().substring(0, 10))
  const [formCheckout, setFormCheckout] = useState(new Date(Date.now() + 86400000).toISOString().substring(0, 10))
  const [formDiarias, setFormDiarias] = useState(1)
  const [formValor, setFormValor] = useState("")
  const [formDescricao, setFormDescricao] = useState("")
  const [formAliquota, setFormAliquota] = useState("2.00")
  const [isLookingUpDoc, setIsLookingUpDoc] = useState(false)

  // ── Carregamento de Dados ──────────────────────────────────────────────────
  const fetchInvoices = async () => {
    setLoadingInvoices(true)
    try {
      const res = await fetch("/api/nfse/invoices", { credentials: "include" })
      const data = await res.json()
      if (data.invoices) setInvoices(data.invoices)
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
    fetchFiscalSettings()

    // Leitura de parâmetros de hóspede vindos do CRM
    const urlParams = new URLSearchParams(window.location.search)
    const docParam = urlParams.get("doc")
    const nomeParam = urlParams.get("nome")
    if (docParam || nomeParam) {
      const cleanDoc = (docParam || "").replace(/\D/g, "")
      setExtractedData(prev => ({
        ...prev,
        tomadorNome: nomeParam || prev.tomadorNome,
        tomadorCpfCnpj: cleanDoc || prev.tomadorCpfCnpj
      }))
      setFormTomadorNome(nomeParam || "")
      setFormTomadorDoc(cleanDoc || "")
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: `Hóspede importado do CRM: **${nomeParam || 'Cliente'}** (${cleanDoc || 'Sem CPF'}). 👤\n\nAgora é só me passar o valor da hospedagem e o número do apartamento para emitirmos a NFS-e!`
        }
      ])
    }
  }, [])

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

  // ── Filtro do Combobox de Hóspedes ──────────────────────────────────────────
  const filteredGuests = useMemo(() => {
    if (!guestSearchQuery.trim()) return guests.slice(0, 30)
    const q = guestSearchQuery.toLowerCase()
    return guests.filter(g => 
      (g.fullName || "").toLowerCase().includes(q) ||
      (g.documentNumber || "").replace(/\D/g, "").includes(q.replace(/\D/g, "")) ||
      (g.email || "").toLowerCase().includes(q)
    )
  }, [guests, guestSearchQuery])

  const handleSelectGuest = (g: any) => {
    setSelectedGuest(g)
    setGuestDropdownOpen(false)
    setGuestSearchQuery(g.fullName || "")

    const cleanDoc = (g.documentNumber || "").replace(/\D/g, "")
    
    // Atualiza estado do Chat
    const updatedChatData: ExtractedData = {
      ...extractedData,
      tomadorNome: g.fullName,
      tomadorCpfCnpj: cleanDoc,
      tomadorEmail: g.email || "",
      tomadorTelefone: g.phone ? g.phone.replace(/\D/g, "") : "",
      tomadorEndereco: "Av. Pelinca, 100",
      tomadorCep: "28035000"
    }
    setExtractedData(updatedChatData)

    // Atualiza estado do Formulário
    setFormTomadorNome(g.fullName)
    setFormTomadorDoc(cleanDoc)
    setFormTomadorEmail(g.email || "")
    setFormTomadorTelefone(g.phone || "")

    setMessages(prev => [
      ...prev,
      {
        role: "assistant",
        content: `Cliente selecionado: **${g.fullName}** (${cleanDoc || 'Sem CPF'}). 👤\n\nAgora é só me passar o valor da hospedagem, diárias ou flat!`
      }
    ])

    if (updatedChatData.tomadorNome && updatedChatData.tomadorCpfCnpj && updatedChatData.valorServico) {
      setIsReadyToEmit(true)
    }
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
        setExtractedData(prev => {
          const merged = { ...prev, ...json.data }
          if (merged.tomadorNome && merged.tomadorCpfCnpj && merged.valorServico) {
            setIsReadyToEmit(true)
          }
          return merged
        })
      }
      if (typeof json.ready === "boolean") {
        setIsReadyToEmit(json.ready)
      }
      fetchGuests() // Atualiza lista de hóspedes caso tenha havido auto-cadastro
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "Erro ao interpretar mensagem. Tente digitar nome, CPF e valor." }
      ])
    } finally {
      setChatLoading(false)
    }
  }

  // ── Emissão Oficial (Chat ou Formulário) ────────────────────────────────────
  const handleEmitInvoice = async (params: any) => {
    setIsEmitting(true)
    setEmissionErrorData(null)

    try {
      const res = await fetch("/api/nfse/emit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sistemaEmissor,
          ...params
        }),
        credentials: "include"
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        setEmissionErrorData(data)
        return
      }

      const inv = data.invoice || data
      const successPayload = {
        ...data,
        ...inv,
        numeroNfse: data.numeroNfse || inv.numeroNfse,
        codigoVerificacao: data.codigoVerificacao || inv.codigoVerificacao,
        danfseUrl: data.danfseUrl || `/api/nfse/danfse/${inv.id}`,
        linkPrefeitura: data.linkPrefeitura || inv.linkPrefeitura
      }

      setEmissionSuccessData(successPayload)
      setLastEmittedInvoice(successPayload)
      fetchInvoices()

      // Limpa os campos do formulário para a próxima emissão
      setFormValor("")
      setExtractedData(prev => ({ ...prev, valorServico: 0 }))
      setIsReadyToEmit(false)

      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: `🎉 NOTA FISCAL AUTORIZADA COM SUCESSO!\n\n🧾 **NFS-e Nº ${successPayload.numeroNfse}**\n🔑 Código: **${successPayload.codigoVerificacao}**\n🏛️ Emissor: Prefeitura de Campos dos Goytacazes (GissOnline)\n\nA nota já consta na tabela de histórico abaixo e você pode abrir o DANFSE oficial ou consultar na prefeitura!`
        }
      ])
    } catch (err: any) {
      setEmissionErrorData({ error: err.message })
    } finally {
      setIsEmitting(false)
    }
  }

  // ── Auto Lookup de CNPJ / CEP no Formulário ────────────────────────────────
  const handleLookupDoc = async () => {
    const clean = formTomadorDoc.replace(/\D/g, "")
    if (clean.length !== 14) return
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
    } catch {}
    finally {
      setIsLookingUpDoc(false)
    }
  }

  // ── Salvar Configurações Fiscais & Template de Tags ─────────────────────────
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
        setTimeout(() => setSettingsSuccess(false), 3000)
      }
    } finally {
      setSavingSettings(false)
    }
  }

  // Inserir tag no editor de template
  const handleInsertTag = (tag: string) => {
    setFiscalSettings((prev: any) => ({
      ...prev,
      descriptionTemplate: (prev.descriptionTemplate || "") + tag
    }))
  }

  // ── Filtro do Livro de Notas ────────────────────────────────────────────────
  const filteredInvoices = invoices.filter(inv => {
    if (!searchFilter.trim()) return true
    const term = searchFilter.toLowerCase()
    return (
      (inv.tomadorNome || "").toLowerCase().includes(term) ||
      (inv.tomadorCpfCnpj || "").includes(term) ||
      String(inv.numeroNfse || "").includes(term) ||
      String(inv.flatNumber || "").includes(term)
    )
  })

  return (
    <Shell>
      <div className="space-y-6 pb-20">
        {/* Header com Seletor de Sistema Emissor */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card border border-border p-5 rounded-3xl shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight text-foreground flex items-center gap-2">
                  <span>Gestão Fiscal & Emissor NFS-e</span>
                  <Badge className="bg-emerald-600 text-white text-[10px] h-5">Produção Real</Badge>
                </h1>
                <p className="text-xs text-muted-foreground">
                  Rental Miller's LTDA • CNPJ: <strong>47.964.813/0001-65</strong> • IM: <strong>142591</strong>
                </p>
              </div>
            </div>
          </div>

          {/* Alternador de Motor: GissOnline vs Padrão Nacional */}
          <div className="flex items-center gap-2 bg-muted/60 p-1.5 rounded-2xl border border-border">
            <button
              onClick={() => setSistemaEmissor("giss_prefeitura")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                sistemaEmissor === "giss_prefeitura"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>🏛️ Prefeitura de Campos (GissOnline)</span>
            </button>

            <button
              onClick={() => setSistemaEmissor("padrao_nacional")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                sistemaEmissor === "padrao_nacional"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Globe className="w-4 h-4" />
              <span>🇧🇷 Padrão Nacional (Gov.br)</span>
            </button>
          </div>
        </div>

        {/* ── NAVEGAÇÃO DO HUB FISCAL (4 FERRAMENTAS DEDICADAS) ── */}
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="space-y-5">
          <TabsList className="bg-card border border-border p-1.5 rounded-2xl h-auto grid grid-cols-2 md:grid-cols-4 gap-1.5 shadow-xs">
            <TabsTrigger value="chat" className="rounded-xl py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Bot className="w-4 h-4" />
              <span>💬 Emissor Inteligente (Chat)</span>
            </TabsTrigger>

            <TabsTrigger value="form" className="rounded-xl py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <PlusCircle className="w-4 h-4" />
              <span>📝 Emissão Tradicional (Formulário)</span>
            </TabsTrigger>

            <TabsTrigger value="history" className="rounded-xl py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FileText className="w-4 h-4" />
              <span>📚 Livro Fiscal ({invoices.length})</span>
            </TabsTrigger>

            <TabsTrigger value="settings" className="rounded-xl py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Sliders className="w-4 h-4" />
              <span>⚙️ Configurações & Templates</span>
            </TabsTrigger>
          </TabsList>

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 1: EMISSOR INTELIGENTE (CHAT IA COM COMBOBOX E AUTO-CADASTRO)
             ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="chat" className="space-y-4 m-0">
            {/* Banner Destacado da Última Nota Emitida */}
            {lastEmittedInvoice && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-3xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-xs text-foreground flex items-center gap-2">
                      <span>NFS-e Nº {lastEmittedInvoice.numeroNfse} Autorizada!</span>
                      <Badge className="bg-emerald-600 text-white text-[10px]">Prefeitura de Campos</Badge>
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Tomador: <strong>{lastEmittedInvoice.tomadorNome}</strong> • Valor: <strong>R$ {Number(lastEmittedInvoice.valorServico || 0).toFixed(2)}</strong> • Cód: <span className="font-mono">{lastEmittedInvoice.codigoVerificacao}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {lastEmittedInvoice.danfseUrl && (
                    <Button 
                      size="sm"
                      onClick={() => window.open(lastEmittedInvoice.danfseUrl, "_blank")}
                      className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl h-8.5 gap-1.5"
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
                      className="flex-1 sm:flex-none font-bold text-xs rounded-xl h-8.5 gap-1.5 border-emerald-600/30 text-emerald-700 dark:text-emerald-300"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Prefeitura (Giss)</span>
                    </Button>
                  )}
                  <Button 
                    size="sm"
                    variant="ghost"
                    onClick={() => setActiveTab("history")}
                    className="font-bold text-xs rounded-xl h-8.5 text-muted-foreground"
                  >
                    Ver no Livro Fiscal →
                  </Button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Lado Esquerdo: Chat Conversacional */}
              <div className="lg:col-span-7 space-y-3">
                <Card className="rounded-3xl border border-border shadow-md flex flex-col h-[580px]">
                  <CardHeader className="p-4 border-b border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-black text-foreground">Assistente Fiscal IA</CardTitle>
                        <CardDescription className="text-[11px]">Extração automática e auto-cadastro no CRM</CardDescription>
                      </div>
                    </div>

                    {/* Combobox Pesquisável de Hóspedes */}
                    <div className="relative w-full sm:w-64" ref={guestComboboxRef}>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input 
                          placeholder="Buscar hóspede/CPF..."
                          value={guestSearchQuery}
                          onChange={e => {
                            setGuestSearchQuery(e.target.value)
                            setGuestDropdownOpen(true)
                          }}
                          onFocus={() => setGuestDropdownOpen(true)}
                          className="h-8.5 text-xs pl-8 pr-7 rounded-xl bg-background font-medium"
                        />
                        {guestSearchQuery && (
                          <button
                            onClick={() => {
                              setGuestSearchQuery("")
                              setSelectedGuest(null)
                              setExtractedData({})
                              setIsReadyToEmit(false)
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                          >
                            ×
                          </button>
                        )}
                      </div>

                      {/* Dropdown Flutuante de Hóspedes */}
                      {guestDropdownOpen && (
                        <div className="absolute top-10 left-0 right-0 z-50 bg-popover border border-border rounded-2xl shadow-xl max-h-60 overflow-y-auto p-1 text-xs space-y-0.5">
                          {filteredGuests.length === 0 ? (
                            <div className="p-3 text-center text-muted-foreground">Nenhum hóspede encontrado</div>
                          ) : (
                            filteredGuests.map(g => (
                              <button
                                key={g.id}
                                type="button"
                                onClick={() => handleSelectGuest(g)}
                                className="w-full text-left p-2 rounded-xl hover:bg-muted/80 transition-colors flex flex-col"
                              >
                                <span className="font-bold text-foreground">{g.fullName}</span>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {g.documentNumber ? `Doc: ${g.documentNumber}` : "Sem documento"} {g.email ? `• ${g.email}` : ""}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </CardHeader>

                  {/* Área de Mensagens */}
                  <CardContent ref={chatContainerRef} className="p-4 flex-1 overflow-y-auto space-y-3">
                    {messages.map((msg, idx) => (
                      <div key={idx} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                        <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-xs ${
                          msg.role === "user" ? "bg-primary text-primary-foreground font-bold" : "bg-muted text-muted-foreground"
                        }`}>
                          {msg.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                        </div>
                        <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                          msg.role === "user" 
                            ? "bg-primary text-primary-foreground font-medium rounded-tr-xs" 
                            : "bg-muted/80 text-foreground font-medium border border-border/60 rounded-tl-xs"
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex gap-2.5 items-center text-xs text-muted-foreground animate-pulse">
                        <Bot className="w-4 h-4 animate-spin text-primary" />
                        <span>Processando e estruturando os dados fiscais...</span>
                      </div>
                    )}
                  </CardContent>

                  {/* Input de Mensagem */}
                  <div className="p-3 border-t border-border bg-card rounded-b-3xl">
                    <form onSubmit={handleSendMessage} className="flex gap-2">
                      <Input 
                        placeholder="Ex: Hospedagem para Miller Pessanha CPF 12585736792 valor 250 flat 113"
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        disabled={chatLoading}
                        className="h-10 text-xs rounded-2xl bg-background"
                      />
                      <Button 
                        type="submit" 
                        disabled={chatLoading || !chatInput.trim()}
                        className="h-10 px-4 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs shrink-0 shadow-sm"
                      >
                        <Send className="w-3.5 h-3.5 mr-1" />
                        <span>Enviar</span>
                      </Button>
                    </form>
                  </div>
                </Card>
              </div>

              {/* Lado Direito: Preview Estruturado */}
              <div className="lg:col-span-5 space-y-3">
                <Card className="rounded-3xl border border-border shadow-md h-[580px] flex flex-col justify-between">
                  <div>
                    <CardHeader className="p-4 border-b border-border/80 pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-black text-foreground flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          <span>Dados Extraídos da Nota</span>
                        </CardTitle>
                        <Badge variant={isReadyToEmit ? "default" : "outline"} className={isReadyToEmit ? "bg-emerald-600 text-white text-[10px]" : "text-[10px]"}>
                          {isReadyToEmit ? "✓ Pronto para Emitir" : "Aguardando Dados"}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 space-y-3 overflow-y-auto max-h-[400px]">
                      {/* Tomador */}
                      <div className="p-3 rounded-2xl bg-muted/40 border border-border space-y-1.5">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-primary" /> Tomador do Serviço
                        </div>
                        <div className="grid grid-cols-1 gap-1 text-xs">
                          <div><span className="text-muted-foreground">Nome:</span> <strong className="text-foreground">{extractedData.tomadorNome || "—"}</strong></div>
                          <div><span className="text-muted-foreground">CPF/CNPJ:</span> <strong className="text-foreground font-mono">{extractedData.tomadorCpfCnpj || "—"}</strong></div>
                          {extractedData.tomadorEmail && <div><span className="text-muted-foreground">E-mail:</span> <span className="text-foreground">{extractedData.tomadorEmail}</span></div>}
                          {extractedData.tomadorTelefone && <div><span className="text-muted-foreground">Tel:</span> <span className="text-foreground">{extractedData.tomadorTelefone}</span></div>}
                        </div>
                      </div>

                      {/* Hospedagem e Valores */}
                      <div className="p-3 rounded-2xl bg-muted/40 border border-border space-y-1.5">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-primary" /> Hospedagem e Valores
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div><span className="text-muted-foreground">Valor Total:</span> <div className="text-base font-black text-emerald-600">{extractedData.valorServico ? `R$ ${extractedData.valorServico}` : "—"}</div></div>
                          <div><span className="text-muted-foreground">Apartamento:</span> <div className="text-sm font-bold text-foreground">{extractedData.flatNumber ? `Flat ${extractedData.flatNumber}` : "Não especificado"}</div></div>
                          <div><span className="text-muted-foreground">Check-in:</span> <div className="font-semibold">{extractedData.checkIn || "—"}</div></div>
                          <div><span className="text-muted-foreground">Check-out:</span> <div className="font-semibold">{extractedData.checkOut || "—"}</div></div>
                        </div>
                      </div>

                      {/* Discriminação */}
                      {extractedData.descricaoServico && (
                        <div className="p-3 rounded-2xl bg-muted/40 border border-border space-y-1">
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Discriminação Formatada (Template com Tags):</div>
                          <p className="text-[11px] font-mono text-muted-foreground bg-background p-2.5 rounded-xl whitespace-pre-wrap leading-relaxed border border-border/60">
                            {extractedData.descricaoServico}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </div>

                  {/* Botão de Ação de Emissão */}
                  <div className="p-4 border-t border-border bg-card rounded-b-3xl">
                    <Button
                      onClick={() => handleEmitInvoice({
                        tomadorNome: extractedData.tomadorNome,
                        tomadorCpfCnpj: extractedData.tomadorCpfCnpj,
                        tomadorEmail: extractedData.tomadorEmail,
                        tomadorTelefone: extractedData.tomadorTelefone,
                        tomadorEndereco: extractedData.tomadorEndereco,
                        tomadorNumero: extractedData.tomadorNumero,
                        tomadorBairro: extractedData.tomadorBairro,
                        tomadorCep: extractedData.tomadorCep,
                        flatNumber: extractedData.flatNumber,
                        valorServico: extractedData.valorServico,
                        discriminacao: extractedData.descricaoServico,
                        checkIn: extractedData.checkIn,
                        checkOut: extractedData.checkOut,
                        quantidadeDiarias: extractedData.quantidadeDiarias
                      })}
                      disabled={!isReadyToEmit || isEmitting}
                      className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md gap-2"
                    >
                      {isEmitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Transmitindo NFS-e...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Emitir NFS-e Agora ({sistemaEmissor === "giss_prefeitura" ? "GissOnline" : "Padrão Nacional"})</span>
                        </>
                      )}
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 2: EMISSOR TRADICIONAL (FORMULÁRIO ESTRUTURADO COMPLETO)
             ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="form" className="space-y-4 m-0">
            <Card className="rounded-3xl border border-border shadow-md">
              <CardHeader className="p-5 border-b border-border">
                <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-primary" />
                  <span>Emissão Tradicional de NFS-e</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Preencha os dados estruturados do tomador e da hospedagem para emissão direta
                </CardDescription>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                <form onSubmit={(e) => {
                  e.preventDefault()
                  handleEmitInvoice({
                    tomadorNome: formTomadorNome,
                    tomadorCpfCnpj: formTomadorDoc,
                    tomadorEmail: formTomadorEmail,
                    tomadorTelefone: formTomadorTelefone,
                    tomadorEndereco: formTomadorEndereco,
                    tomadorNumero: formTomadorNumero,
                    tomadorBairro: formTomadorBairro,
                    tomadorCep: formTomadorCep,
                    flatNumber: formFlatNumber,
                    valorServico: formValor,
                    discriminacao: formDescricao,
                    checkIn: formCheckin,
                    checkOut: formCheckout,
                    quantidadeDiarias: formDiarias
                  })
                }} className="space-y-6">
                  {/* Seção Tomador */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <User className="w-4 h-4 text-primary" /> Dados do Tomador (Hóspede ou Empresa)
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">CPF ou CNPJ *</Label>
                        <div className="flex gap-1.5">
                          <Input 
                            placeholder="000.000.000-00"
                            value={formTomadorDoc}
                            onChange={e => setFormTomadorDoc(e.target.value)}
                            required
                            className="text-xs rounded-xl h-9.5"
                          />
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm" 
                            onClick={handleLookupDoc}
                            disabled={isLookingUpDoc || formTomadorDoc.replace(/\D/g, "").length !== 14}
                            className="h-9.5 px-2.5 text-[11px] font-bold rounded-xl shrink-0"
                          >
                            {isLookingUpDoc ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Buscar CNPJ"}
                          </Button>
                        </div>
                      </div>

                      <div className="md:col-span-2 space-y-1.5">
                        <Label className="text-xs font-bold">Nome Completo ou Razão Social *</Label>
                        <Input 
                          placeholder="Ex: Miller Mendonça Pessanha"
                          value={formTomadorNome}
                          onChange={e => setFormTomadorNome(e.target.value)}
                          required
                          className="text-xs rounded-xl h-9.5 font-medium"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">E-mail (opcional)</Label>
                        <Input 
                          type="email"
                          placeholder="contato@exemplo.com"
                          value={formTomadorEmail}
                          onChange={e => setFormTomadorEmail(e.target.value)}
                          className="text-xs rounded-xl h-9.5"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">Telefone (opcional)</Label>
                        <Input 
                          placeholder="22998505276"
                          value={formTomadorTelefone}
                          onChange={e => setFormTomadorTelefone(e.target.value)}
                          className="text-xs rounded-xl h-9.5"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">CEP</Label>
                        <Input 
                          placeholder="28035000"
                          value={formTomadorCep}
                          onChange={e => setFormTomadorCep(e.target.value)}
                          className="text-xs rounded-xl h-9.5"
                        />
                      </div>

                      <div className="md:col-span-2 space-y-1.5">
                        <Label className="text-xs font-bold">Endereço / Logradouro</Label>
                        <Input 
                          placeholder="Av. Pelinca"
                          value={formTomadorEndereco}
                          onChange={e => setFormTomadorEndereco(e.target.value)}
                          className="text-xs rounded-xl h-9.5"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">Número</Label>
                        <Input 
                          placeholder="100"
                          value={formTomadorNumero}
                          onChange={e => setFormTomadorNumero(e.target.value)}
                          className="text-xs rounded-xl h-9.5"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Seção Hospedagem e Valores */}
                  <div className="space-y-4 pt-2 border-t border-border">
                    <h3 className="text-xs font-black text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-primary" /> Dados da Hospedagem & Valores
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">Valor Total (R$) *</Label>
                        <Input 
                          placeholder="250.00"
                          value={formValor}
                          onChange={e => setFormValor(e.target.value)}
                          required
                          className="text-xs rounded-xl h-9.5 font-bold text-emerald-600 text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">Apartamento / Flat</Label>
                        <Input 
                          placeholder="Ex: 113"
                          value={formFlatNumber}
                          onChange={e => setFormFlatNumber(e.target.value)}
                          className="text-xs rounded-xl h-9.5"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">Data Check-in</Label>
                        <Input 
                          type="date"
                          value={formCheckin}
                          onChange={e => setFormCheckin(e.target.value)}
                          className="text-xs rounded-xl h-9.5"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">Data Check-out</Label>
                        <Input 
                          type="date"
                          value={formCheckout}
                          onChange={e => setFormCheckout(e.target.value)}
                          className="text-xs rounded-xl h-9.5"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Discriminação dos Serviços</Label>
                      <Textarea 
                        placeholder="SERVIÇOS DE HOSPEDAGEM EM FLAT MOBILIADO..."
                        value={formDescricao}
                        onChange={e => setFormDescricao(e.target.value)}
                        rows={4}
                        className="text-xs font-mono rounded-xl leading-relaxed"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button 
                      type="submit"
                      disabled={isEmitting || !formTomadorNome || !formTomadorDoc || !formValor}
                      className="w-full md:w-auto h-11 px-8 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs gap-2 shadow-md"
                    >
                      {isEmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      <span>Emitir NFS-e Tradicional ({sistemaEmissor === "giss_prefeitura" ? "GissOnline" : "Padrão Nacional"})</span>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 3: LIVRO FISCAL & HISTÓRICO COMPLETO
             ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="history" className="space-y-4 m-0">
            <Card className="rounded-3xl border border-border shadow-sm">
              <CardHeader className="p-5 border-b border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span>Livro de Notas Fiscais Emitidas</span>
                  </CardTitle>
                  <CardDescription className="text-xs">Histórico de NFS-e autorizadas, espelhos DANFSE e XMLs</CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-64">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input 
                      placeholder="Buscar hóspede, CPF, número..."
                      value={searchFilter}
                      onChange={e => setSearchFilter(e.target.value)}
                      className="pl-8 text-xs h-9 rounded-xl bg-background"
                    />
                  </div>
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

              <CardContent className="p-0">
                {loadingInvoices ? (
                  <div className="p-12 text-center text-xs text-muted-foreground">Carregando notas fiscais...</div>
                ) : filteredInvoices.length === 0 ? (
                  <div className="p-12 text-center text-xs text-muted-foreground">Nenhuma nota fiscal encontrada.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/40 text-muted-foreground border-b border-border font-bold">
                        <tr>
                          <th className="p-3.5">Número</th>
                          <th className="p-3.5">Sistema</th>
                          <th className="p-3.5">Tomador / Hóspede</th>
                          <th className="p-3.5">Apartamento</th>
                          <th className="p-3.5">Valor (R$)</th>
                          <th className="p-3.5">Data Emissão</th>
                          <th className="p-3.5">Status</th>
                          <th className="p-3.5 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredInvoices.map((inv: any) => (
                          <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                            <td className="p-3.5 font-mono font-bold text-primary">{inv.numeroNfse || inv.numeroNota || `#${inv.id}`}</td>
                            <td className="p-3.5">
                              <Badge variant="outline" className="text-[10px] font-semibold">
                                {inv.sistemaEmissor === "giss_prefeitura" ? "🏛️ GissOnline" : "🇧🇷 Padrão Nacional"}
                              </Badge>
                            </td>
                            <td className="p-3.5">
                              <div className="font-bold text-foreground">{inv.tomadorNome}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{inv.tomadorCpfCnpj}</div>
                            </td>
                            <td className="p-3.5 font-semibold text-foreground">
                              {inv.flatNumber ? `Flat ${inv.flatNumber}` : "—"}
                            </td>
                            <td className="p-3.5 font-black text-emerald-600">
                              R$ {Number(inv.valorServico || 0).toFixed(2)}
                            </td>
                            <td className="p-3.5 text-muted-foreground">
                              {inv.dataEmissao ? new Date(inv.dataEmissao).toLocaleDateString("pt-BR") : "—"}
                            </td>
                            <td className="p-3.5">
                              <Badge className="bg-emerald-600 text-white text-[10px] px-2 py-0.5">
                                Autorizada
                              </Badge>
                            </td>
                            <td className="p-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => window.open(`/api/nfse/danfse/${inv.id || inv.numeroNfse}`, "_blank")}
                                  className="h-7.5 px-2.5 text-[11px] font-bold rounded-lg gap-1 text-emerald-700 dark:text-emerald-300 border-emerald-600/40 hover:bg-emerald-500/10 shadow-2xs"
                                  title="Visualizar e Imprimir Espelho DANFSE Oficial"
                                >
                                  <ExternalLink className="w-3 h-3 text-emerald-600" />
                                  <span>DANFSE</span>
                                </Button>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const link = inv.linkPrefeitura || `https://giss.campos.rj.gov.br/nfse/visualizar?num=${inv.numeroNfse}&cod=${inv.codigoVerificacao}`;
                                    window.open(link, "_blank");
                                  }}
                                  className="h-7.5 px-2.5 text-[11px] font-bold rounded-lg gap-1 text-blue-700 dark:text-blue-300 border-blue-600/40 hover:bg-blue-500/10 shadow-2xs"
                                  title="Consultar no Portal GissOnline da Prefeitura"
                                >
                                  <Globe className="w-3 h-3 text-blue-600" />
                                  <span>Giss</span>
                                </Button>

                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => window.open(`/api/nfse/xml/${inv.id}`, "_blank")}
                                  className="h-7.5 px-2 text-[11px] font-bold rounded-lg text-muted-foreground hover:text-foreground"
                                  title="Baixar XML Assinado"
                                >
                                  <Download className="w-3 h-3" />
                                  <span className="hidden sm:inline ml-1">XML</span>
                                </Button>

                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    const text = encodeURIComponent(`Olá, ${inv.tomadorNome}! Segue sua Nota Fiscal de Hospedagem CorpFlats (NFS-e Nº ${inv.numeroNfse}): https://corpflats.onrender.com/api/nfse/danfse/${inv.id}`);
                                    const phone = (inv.tomadorTelefone || "").replace(/\D/g, "");
                                    window.open(phone ? `https://wa.me/55${phone}?text=${text}` : `https://wa.me/?text=${text}`, "_blank");
                                  }}
                                  className="h-7.5 px-2 text-[11px] font-bold rounded-lg text-emerald-600 hover:bg-emerald-500/10"
                                  title="Enviar no WhatsApp do Hóspede"
                                >
                                  <MessageSquare className="w-3 h-3" />
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
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 4: CONFIGURAÇÕES FISCAIS & EDITOR DE TEMPLATES COM TAGS
             ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="settings" className="space-y-4 m-0">
            <Card className="rounded-3xl border border-border shadow-md">
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

        {/* ── MODAIS DE SUCESSO E ERRO ── */}
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
                  const target = emissionSuccessData?.danfseUrl || `/api/nfse/danfse/${emissionSuccessData?.numeroNfse || emissionSuccessData?.id || 'latest'}`;
                  window.open(target, "_blank");
                }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl h-10 gap-1.5 shadow-sm"
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
                <span>Portal GissOnline</span>
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

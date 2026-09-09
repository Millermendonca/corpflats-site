import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { useGetMe } from "@workspace/api-client-react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { 
  Users, Search, Plus, Phone, Mail, User, MessageCircle, 
  Calendar, BedDouble, DollarSign, History, Star, Edit2, ShieldCheck, Tag, 
  FileText, Building2, Building, ExternalLink, Download, Send, MapPin, 
  CheckCircle2, UserCheck, Eye, Sparkles, RefreshCw, Trash2, Heart, Award, 
  Car, Coffee, Filter, ZoomIn, Camera, PenTool, Maximize2, AlertTriangle
} from "lucide-react"

import { AccessDenied } from "@/components/access-denied"

export default function CrmGuests() {
  const [, setLocation] = useLocation()
  const { data: user, isLoading: loadingUser } = useGetMe()

  const [activeTab, setActiveTab] = useState<"guests" | "companies">("guests")
  const [guests, setGuests] = useState<any[]>([])
  const [companies, setCompanies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>("all")

  // Lightbox de Mídias (Selfie, Documento, Assinatura)
  const [lightboxMedia, setLightboxMedia] = useState<{ url: string; title: string; subtitle?: string } | null>(null)

  // Modal Detail 360º
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [activeGuest, setActiveGuest] = useState<any | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Modal Create / Edit Guest
  const [guestModalOpen, setGuestModalOpen] = useState(false)
  const [editingGuest, setEditingGuest] = useState<any | null>(null)
  const [formName, setFormName] = useState("")
  const [formPhone, setFormPhone] = useState("")
  const [formEmail, setFormEmail] = useState("")
  const [formDocument, setFormDocument] = useState("")
  const [formCity, setFormCity] = useState("")
  const [formCompanyId, setFormCompanyId] = useState("")
  const [formNotes, setFormNotes] = useState("")
  const [formPreferences, setFormPreferences] = useState({
    bedType: "casal",
    floorPreference: "alto",
    hasPet: false,
    vehiclePlate: "",
    breakfastNotes: ""
  })
  const [formIsMonthlyGuest, setFormIsMonthlyGuest] = useState(false)
  const [formAutoInvoice, setFormAutoInvoice] = useState(false)
  const [savingGuest, setSavingGuest] = useState(false)

  // Modal Create / Edit Company
  const [companyModalOpen, setCompanyModalOpen] = useState(false)
  const [editingCompany, setEditingCompany] = useState<any | null>(null)
  const [compCnpj, setCompCnpj] = useState("")
  const [compCorporateName, setCompCorporateName] = useState("")
  const [compTradeName, setCompTradeName] = useState("")
  const [compCep, setCompCep] = useState("")
  const [compAddress, setCompAddress] = useState("")
  const [compCity, setCompCity] = useState("")
  const [compStateReg, setCompStateReg] = useState("")
  const [compMunReg, setCompMunReg] = useState("")
  const [compFinancialEmail, setCompFinancialEmail] = useState("")
  const [compPhone, setCompPhone] = useState("")
  const [compContactPerson, setCompContactPerson] = useState("")
  const [compBillingTerms, setCompBillingTerms] = useState("30 dias")
  const [compNotes, setCompNotes] = useState("")
  const [loadingCnpj, setLoadingCnpj] = useState(false)
  const [savingCompany, setSavingCompany] = useState(false)

  const fetchGuests = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/pms/guests", { credentials: "include" })
      const data = await res.json()
      setGuests(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }

  const fetchCompanies = async () => {
    try {
      const res = await fetch("/api/companies", { credentials: "include" })
      const data = await res.json()
      setCompanies(Array.isArray(data) ? data : [])
    } catch {}
  }

  useEffect(() => {
    fetchGuests()
    fetchCompanies()
  }, [])

  const calculateGuestAge = (birthDate?: string) => {
    if (!birthDate) return null
    const bDate = new Date(String(birthDate).substring(0, 10) + "T12:00:00")
    if (isNaN(bDate.getTime())) return null
    const diffMs = new Date().getTime() - bDate.getTime()
    return Math.max(0, Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000)))
  }

  const handleOpenDetail = async (guest: any) => {
    setLoadingDetail(true)
    setDetailModalOpen(true)
    try {
      const res = await fetch(`/api/pms/guests/${guest.id}`, { credentials: "include" })
      const data = await res.json()
      setActiveGuest(data)
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleLookupCnpj = async (val: string) => {
    const clean = val.replace(/\D/g, "")
    if (clean.length === 14) {
      setLoadingCnpj(true)
      try {
        const res = await fetch(`/api/invoices/lookup-cnpj/${clean}`)
        if (res.ok) {
          const data = await res.json()
          if (data.razaoSocial) setCompCorporateName(data.razaoSocial)
          if (data.nomeFantasia) setCompTradeName(data.nomeFantasia)
          if (data.email) setCompFinancialEmail(data.email)
          if (data.telefone) setCompPhone(data.telefone)
          if (data.cep) setCompCep(data.cep)
          if (data.logradouro) setCompAddress(`${data.logradouro}, ${data.bairro || ''}`.trim())
          if (data.cidade && data.uf) setCompCity(`${data.cidade}/${data.uf}`)
        }
      } catch {}
      finally {
        setLoadingCnpj(false)
      }
    }
  }

  const handleOpenNewGuest = () => {
    setEditingGuest(null)
    setFormName("")
    setFormPhone("")
    setFormEmail("")
    setFormDocument("")
    setFormCity("")
    setFormCompanyId("")
    setFormIsMonthlyGuest(false)
    setFormAutoInvoice(false)
    setFormNotes("")
    setFormPreferences({
      bedType: "casal",
      floorPreference: "alto",
      hasPet: false,
      vehiclePlate: "",
      breakfastNotes: ""
    })
    setGuestModalOpen(true)
  }

  const handleEditGuest = (g: any) => {
    setEditingGuest(g)
    setFormName(g.fullName || g.name || "")
    setFormPhone(g.phone || "")
    setFormEmail(g.email || "")
    setFormDocument(g.documentNumber || g.document || "")
    setFormCity(g.city || "")
    setFormCompanyId(g.companyId ? String(g.companyId) : "")
    setFormIsMonthlyGuest(Boolean(g.isMonthlyGuest || g.clientType === "mensalista"))
    setFormAutoInvoice(Boolean(g.autoEmitInvoice))
    setFormNotes(g.notes || "")
    setFormPreferences({
      bedType: g.preferences?.bedType || "casal",
      floorPreference: g.preferences?.floorPreference || "alto",
      hasPet: Boolean(g.preferences?.hasPet || g.hasPet),
      vehiclePlate: g.preferences?.vehiclePlate || "",
      breakfastNotes: g.preferences?.breakfastNotes || ""
    })
    setGuestModalOpen(true)
  }

  const handleSaveGuest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim()) return

    setSavingGuest(true)
    try {
      const payload = {
        fullName: formName.trim(),
        name: formName.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim(),
        documentNumber: formDocument.trim(),
        document: formDocument.trim(),
        city: formCity.trim(),
        companyId: formCompanyId ? Number(formCompanyId) : null,
        isMonthlyGuest: Boolean(formIsMonthlyGuest),
        clientType: formIsMonthlyGuest ? "mensalista" : "avulso",
        autoEmitInvoice: Boolean(formAutoInvoice),
        notes: formNotes.trim(),
        preferences: formPreferences
      }

      if (editingGuest) {
        await fetch(`/api/pms/guests/${editingGuest.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include"
        })
      } else {
        await fetch("/api/pms/guests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include"
        })
      }
      setGuestModalOpen(false)
      fetchGuests()
    } finally {
      setSavingGuest(false)
    }
  }

  const handleOpenNewCompany = () => {
    setEditingCompany(null)
    setCompCorporateName("")
    setCompTradeName("")
    setCompCnpj("")
    setCompStateReg("")
    setCompMunReg("")
    setCompFinancialEmail("")
    setCompPhone("")
    setCompContactPerson("")
    setCompBillingTerms("30 dias")
    setCompNotes("")
    setCompanyModalOpen(true)
  }

  const handleEditCompany = (c: any) => {
    setEditingCompany(c)
    setCompCorporateName(c.corporateName || "")
    setCompTradeName(c.tradeName || "")
    setCompCnpj(c.cnpj || "")
    setCompStateReg(c.stateRegistration || "")
    setCompMunReg(c.municipalRegistration || "")
    setCompFinancialEmail(c.financialEmail || "")
    setCompPhone(c.phone || "")
    setCompContactPerson(c.contactPerson || "")
    setCompBillingTerms(c.billingTerms || "30 dias")
    setCompNotes(c.notes || "")
    setCompanyModalOpen(true)
  }

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!compCorporateName.trim() || !compCnpj.trim()) return

    setSavingCompany(true)
    try {
      const payload = {
        corporateName: compCorporateName.trim(),
        tradeName: compTradeName.trim() || compCorporateName.trim(),
        cnpj: compCnpj.trim(),
        stateRegistration: compStateReg.trim(),
        municipalRegistration: compMunReg.trim(),
        financialEmail: compFinancialEmail.trim(),
        phone: compPhone.trim(),
        contactPerson: compContactPerson.trim(),
        billingTerms: compBillingTerms.trim(),
        notes: compNotes.trim()
      }

      if (editingCompany) {
        await fetch(`/api/companies/${editingCompany.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include"
        })
      } else {
        await fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include"
        })
      }
      setCompanyModalOpen(false)
      fetchCompanies()
    } finally {
      setSavingCompany(false)
    }
  }

  // ── Central de WhatsApp com Templates Prontos ──────────────────────────────
  const handleSendWhatsAppTemplate = (type: "welcome" | "room_ready" | "review" | "pix" | "invoice", guest: any) => {
    if (!guest.phone) {
      alert("Hóspede não possui telefone cadastrado.")
      return
    }
    const cleanPhone = guest.phone.replace(/\D/g, "")
    const phoneWithDDI = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`
    const firstName = (guest.fullName || guest.name || "Hóspede").split(" ")[0]

    let msg = ""
    switch (type) {
      case "welcome":
        msg = `Olá, ${firstName}! Tudo bem? Seja muito bem-vindo ao CorpFlats. Para agilizar sua entrada na portaria, preencha seu pré-check-in rápido aqui: https://corpflats.onrender.com/pre-checkin`
        break
      case "room_ready":
        msg = `Olá, ${firstName}! Boas notícias: o seu flat já está 100% limpo, higienizado e liberado para entrada antecipada. Tenha uma excelente estadia!`
        break
      case "review":
        msg = `Olá, ${firstName}! Agradecemos imensamente pela sua estadia no CorpFlats. Sua opinião é muito importante para nós. Poderia nos avaliar no Google com 5 estrelas? Leva apenas 30 segundos: https://g.page/r/corpflats/review`
        break
      case "pix":
        msg = `Olá, ${firstName}! Segue a chave PIX oficial do CorpFlats (CNPJ): 47.964.813/0001-65 (Rental Miller's LTDA). Assim que efetuar o pagamento, nos envie o comprovante por aqui. Obrigado!`
        break
      case "invoice":
        msg = `Olá, ${firstName}! Sua Nota Fiscal de Serviço (NFS-e) relativa à sua hospedagem no CorpFlats foi emitida com sucesso pela Prefeitura de Campos. Qualquer dúvida estamos à disposição!`
        break
    }

    window.open(`https://api.whatsapp.com/send?phone=${phoneWithDDI}&text=${encodeURIComponent(msg)}`, "_blank")
  }

  // Exportar Base de Contatos em CSV
  const handleExportCsv = () => {
    window.open("/api/pms/guests/export/csv", "_blank")
  }

  // Filtragem de Hóspedes
  const filteredGuests = guests.filter(g => {
    const term = search.toLowerCase()
    const matchesSearch = (
      (g.fullName || g.name || "").toLowerCase().includes(term) ||
      (g.phone || "").toLowerCase().includes(term) ||
      (g.email || "").toLowerCase().includes(term) ||
      (g.documentNumber || g.document || "").includes(term) ||
      (g.city || "").toLowerCase().includes(term) ||
      (g.companyName || "").toLowerCase().includes(term)
    )

    if (!matchesSearch) return false

    if (selectedTagFilter === "all") return true
    if (selectedTagFilter === "vip") return (g.tags || []).includes("VIP")
    if (selectedTagFilter === "recurrent") return (g.tags || []).includes("Recorrente")
    if (selectedTagFilter === "corporate") return Boolean(g.companyId || (g.tags || []).includes("Corporativo"))
    if (selectedTagFilter === "pet") return Boolean(g.hasPet || (g.tags || []).includes("Pet"))

    return true
  })

  // Filtragem de Empresas
  const filteredCompanies = companies.filter(c => {
    const term = search.toLowerCase()
    return (
      (c.corporateName || "").toLowerCase().includes(term) ||
      (c.tradeName || "").toLowerCase().includes(term) ||
      (c.cnpj || "").includes(term) ||
      (c.contactPerson || "").toLowerCase().includes(term)
    )
  })

  // Estatísticas do CRM
  const totalGuests = guests.length
  const totalLtv = guests.reduce((acc, g) => acc + (g.totalSpent || 0), 0)
  const vipCount = guests.filter(g => (g.tags || []).includes("VIP")).length
  const totalCompanies = companies.length

  if (!loadingUser && user?.role !== "admin") {
    return <Shell><AccessDenied /></Shell>
  }

  return (
    <Shell>
      <div className="space-y-6 pb-20 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border p-5 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-foreground flex items-center gap-2">
                <span>CRM 360º • Hóspedes & Empresas PJ</span>
                <Badge className="bg-primary/20 text-primary hover:bg-primary/30 border-0 text-[10px]">
                  LTV & Histórico Unificado
                </Badge>
              </h1>
              <p className="text-xs text-muted-foreground">
                Gestão de relacionamento, métricas de fidelidade, preferências e faturamento corporativo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline"
              size="sm" 
              onClick={handleExportCsv}
              className="h-10 px-3.5 rounded-2xl text-xs font-bold gap-1.5 border-border"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Base (CSV)</span>
            </Button>

            {activeTab === "guests" ? (
              <Button 
                onClick={handleOpenNewGuest} 
                size="sm" 
                className="h-10 px-4 rounded-2xl font-black text-xs gap-1.5 bg-primary text-primary-foreground shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Hóspede (PF)</span>
              </Button>
            ) : (
              <Button 
                onClick={handleOpenNewCompany} 
                size="sm" 
                className="h-10 px-4 rounded-2xl font-black text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
              >
                <Building2 className="w-4 h-4" />
                <span>Nova Empresa (PJ)</span>
              </Button>
            )}
          </div>
        </div>

        {/* ── CARDS DE MÉTRICAS CRM & LTV ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <Card className="rounded-2xl border border-border p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Hóspedes Cadastrados</div>
                <div className="text-xl font-black text-foreground">{totalGuests}</div>
              </div>
            </div>
          </Card>

          <Card className="rounded-2xl border border-border p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">LTV Total Gerado</div>
                <div className="text-xl font-black text-emerald-600">R$ {totalLtv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>
          </Card>

          <Card className="rounded-2xl border border-border p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                <Star className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Hóspedes VIPs & Frequentes</div>
                <div className="text-xl font-black text-amber-600">{vipCount}</div>
              </div>
            </div>
          </Card>

          <Card className="rounded-2xl border border-border p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Empresas Parceiras (PJ)</div>
                <div className="text-xl font-black text-indigo-600">{totalCompanies}</div>
              </div>
            </div>
          </Card>
        </div>

        {/* ── NAVEGAÇÃO PF vs PJ ── */}
        <div className="grid grid-cols-2 gap-2 p-1.5 bg-muted/60 rounded-2xl border border-border">
          <button
            type="button"
            onClick={() => { setActiveTab("guests"); setSearch(""); }}
            className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
              activeTab === "guests"
                ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="w-4 h-4 text-primary" />
            <span>Hóspedes Pessoas Físicas ({totalGuests})</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab("companies"); setSearch(""); }}
            className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
              activeTab === "companies"
                ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="w-4 h-4 text-indigo-600" />
            <span>Empresas & Faturamento Corporativo ({totalCompanies})</span>
          </button>
        </div>

        {/* ── BARRA DE BUSCA E FILTRO DE TAGS ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border p-3 rounded-2xl">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
            <Input 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder={activeTab === "guests" ? "Buscar por nome, CPF, celular, e-mail, cidade ou empresa..." : "Buscar por Razão Social, Nome Fantasia, CNPJ ou Gestor..."} 
              className="pl-9.5 text-xs h-10 rounded-xl bg-background"
            />
          </div>

          {activeTab === "guests" && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: "all", label: "Todos" },
                { id: "vip", label: "⭐ VIPs" },
                { id: "recurrent", label: "🔁 Recorrentes" },
                { id: "corporate", label: "🏢 Corporativo" },
                { id: "pet", label: "🐾 Pet" }
              ].map(f => (
                <Button
                  key={f.id}
                  variant={selectedTagFilter === f.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedTagFilter(f.id)}
                  className="h-8.5 px-3 text-[11px] font-bold rounded-xl shrink-0"
                >
                  {f.label}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* ── LISTAGEM DE HÓSPEDES (PF) ── */}
        {activeTab === "guests" && (
          <Card className="rounded-3xl border border-border shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-16 text-center text-xs text-muted-foreground">Carregando hóspedes e histórico...</div>
              ) : filteredGuests.length === 0 ? (
                <div className="p-16 text-center text-xs text-muted-foreground">Nenhum hóspede encontrado para os filtros aplicados.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/40 text-muted-foreground border-b border-border font-bold">
                      <tr>
                        <th className="p-3.5">Hóspede</th>
                        <th className="p-3.5">Documento / Contato</th>
                        <th className="p-3.5">Cidade / Empresa</th>
                        <th className="p-3.5">LTV (Total Gasto)</th>
                        <th className="p-3.5">Estadias / Flat Mais Frequente</th>
                        <th className="p-3.5">Tags</th>
                        <th className="p-3.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredGuests.map(g => (
                        <tr key={g.id} className="hover:bg-muted/20 transition-colors">
                          <td className="p-3.5">
                            <div className="flex items-center gap-2.5">
                              {g.photoUrl ? (
                                <img
                                  src={g.photoUrl}
                                  alt={g.fullName || g.name}
                                  onClick={() => setLightboxMedia({ 
                                    url: g.photoUrl, 
                                    title: `Selfie Biométrica - ${g.fullName || g.name}`,
                                    subtitle: `Hóspede: ${g.guestCode || `HOSP-${String(g.id).padStart(5, '0')}`} • CPF: ${g.documentNumber || g.document || 'Não informado'}`
                                  })}
                                  className="w-10 h-10 rounded-xl object-cover border border-primary/30 shadow-xs cursor-pointer hover:scale-105 hover:border-primary transition-all shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black text-xs shrink-0">
                                  {(g.fullName || g.name || "H").substring(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-foreground block">{g.fullName || g.name}</span>
                                  {g.guestCode && (
                                    <span className="font-mono text-[9px] text-muted-foreground bg-muted/60 border border-border px-1.5 py-0.2 rounded">
                                      {g.guestCode}
                                    </span>
                                  )}
                                  {g.fnhrCompleted ? (
                                    <Badge className="text-[9px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 gap-1 font-bold px-1.5 py-0">
                                      <CheckCircle2 className="w-2.5 h-2.5" /> FNHR OK
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-400/40 px-1.5 py-0">
                                      Pendente FNHR
                                    </Badge>
                                  )}
                                  {(g.isMonthlyGuest || g.clientType === "mensalista") && (
                                    <Badge className="text-[9px] bg-purple-600 text-white font-black px-1.5 py-0.2 rounded-md">
                                      🏢 Mensalista
                                    </Badge>
                                  )}
                                </div>
                                {g.lastStayDate && (
                                  <span className="text-[10px] text-muted-foreground">
                                    Última visita: {new Date(g.lastStayDate).toLocaleDateString("pt-BR")}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="p-3.5">
                            <div className="font-mono text-muted-foreground">{g.documentNumber || g.document || "Sem CPF"}</div>
                            {g.phone && <div className="text-[11px] text-foreground font-semibold">{g.phone}</div>}
                            {g.email && <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{g.email}</div>}
                          </td>

                          <td className="p-3.5">
                            {g.city && <div className="text-foreground">{g.city}</div>}
                            {g.companyName && (
                              <Badge variant="outline" className="text-[10px] text-indigo-600 border-indigo-200 mt-0.5">
                                🏢 {g.companyName}
                              </Badge>
                            )}
                          </td>

                          <td className="p-3.5">
                            <div className="font-black text-emerald-600 text-sm">
                              R$ {(g.totalSpent || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                            {g.averageTicket > 0 && (
                              <div className="text-[10px] text-muted-foreground">Méd: R$ {g.averageTicket.toFixed(2)}</div>
                            )}
                          </td>

                          <td className="p-3.5">
                            <div className="font-bold text-foreground">
                              {g.totalStays || 1} {g.totalStays === 1 ? "estadia" : "estadias"} • {g.totalNights || 1} noites
                            </div>
                            {g.favoriteFlat && (
                              <div className="text-[10px] text-muted-foreground">Flat mais frequente: <strong>Apt {g.favoriteFlat}</strong></div>
                            )}
                          </td>

                          <td className="p-3.5">
                            <div className="flex flex-wrap gap-1">
                              {(g.tags || []).map((t: string) => (
                                <Badge 
                                  key={t} 
                                  className={`text-[9px] px-1.5 py-0 ${
                                    t === 'VIP' ? 'bg-amber-500 text-white' :
                                    t === 'Recorrente' ? 'bg-emerald-600 text-white' :
                                    t === 'Corporativo' ? 'bg-indigo-600 text-white' : 'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {t}
                                </Badge>
                              ))}
                            </div>
                          </td>

                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {g.phone && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleSendWhatsAppTemplate("welcome", g)}
                                  title="WhatsApp"
                                  className="h-8 w-8 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-xl"
                                >
                                  <MessageCircle className="w-4 h-4" />
                                </Button>
                              )}

                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleEditGuest(g)}
                                title="Editar Cadastro"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-xl"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>

                              <Button
                                size="sm"
                                onClick={() => handleOpenDetail(g)}
                                className="h-8 px-2.5 text-[11px] font-bold rounded-xl gap-1 bg-primary/10 text-primary hover:bg-primary/20"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Ver 360º</span>
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
        )}

        {/* ── LISTAGEM DE EMPRESAS (PJ) ── */}
        {activeTab === "companies" && (
          <Card className="rounded-3xl border border-border shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {filteredCompanies.length === 0 ? (
                <div className="p-16 text-center text-xs text-muted-foreground">Nenhuma empresa parceira cadastrada.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/40 text-muted-foreground border-b border-border font-bold">
                      <tr>
                        <th className="p-3.5">Empresa / Razão Social</th>
                        <th className="p-3.5">CNPJ / Inscrições</th>
                        <th className="p-3.5">Contato / E-mail Financeiro</th>
                        <th className="p-3.5">Condição de Faturamento</th>
                        <th className="p-3.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredCompanies.map(c => (
                        <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                          <td className="p-3.5">
                            <div className="font-bold text-foreground">{c.tradeName || c.corporateName}</div>
                            <div className="text-[10px] text-muted-foreground">{c.corporateName}</div>
                          </td>

                          <td className="p-3.5 font-mono">
                            <div>{c.cnpj}</div>
                            {c.municipalRegistration && <div className="text-[10px] text-muted-foreground">IM: {c.municipalRegistration}</div>}
                          </td>

                          <td className="p-3.5">
                            <div className="font-semibold text-foreground">{c.contactPerson || "Gestor de Viagens"}</div>
                            {c.financialEmail && <div className="text-[10px] text-muted-foreground">{c.financialEmail}</div>}
                            {c.phone && <div className="text-[10px] text-muted-foreground">{c.phone}</div>}
                          </td>

                          <td className="p-3.5">
                            <Badge variant="outline" className="text-[10px] font-bold text-indigo-600 border-indigo-200">
                              {c.billingTerms || "30 dias"}
                            </Badge>
                          </td>

                          <td className="p-3.5 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditCompany(c)}
                              className="h-8 px-2.5 text-[11px] font-bold rounded-xl gap-1 text-primary hover:bg-primary/10"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Editar</span>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── MODAL FICHA 360º DO HÓSPEDE ── */}
        {/* ── MODAL FICHA 360º DO HÓSPEDE COM MÍDIAS E FNHR UNIFICADA ── */}
        <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
          <DialogContent className="sm:max-w-4xl bg-card border border-border rounded-3xl max-h-[88vh] overflow-y-auto p-6">
            <DialogHeader className="border-b border-border pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  {activeGuest?.photoUrl ? (
                    <div 
                      onClick={() => setLightboxMedia({ 
                        url: activeGuest.photoUrl, 
                        title: `Foto / Biometria Facial - ${activeGuest.fullName || activeGuest.name}`,
                        subtitle: `${activeGuest.guestCode || ''} • CPF: ${activeGuest.documentNumber || activeGuest.document || '-'}`
                      })}
                      className="relative group cursor-pointer shrink-0"
                    >
                      <img
                        src={activeGuest.photoUrl}
                        alt={activeGuest.fullName || activeGuest.name}
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-primary/40 shadow-md group-hover:brightness-90 transition-all"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 rounded-2xl transition-opacity">
                        <ZoomIn className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black text-xl shrink-0 border border-primary/20">
                      {(activeGuest?.fullName || activeGuest?.name || "H").substring(0, 2).toUpperCase()}
                    </div>
                  )}

                  <div>
                    <DialogTitle className="text-xl font-black text-foreground flex items-center gap-2 flex-wrap">
                      <span>{activeGuest?.fullName || activeGuest?.name}</span>
                      {activeGuest?.guestCode && (
                        <span className="font-mono text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-lg border border-primary/20">
                          {activeGuest.guestCode}
                        </span>
                      )}
                      {activeGuest?.fnhrCompleted ? (
                        <Badge className="text-[10px] bg-emerald-600 text-white font-black gap-1 py-0.5 px-2">
                          <CheckCircle2 className="w-3 h-3" /> FNHR OK
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400/50 py-0.5 px-2">
                          Pendente FNHR
                        </Badge>
                      )}
                      {(activeGuest?.tags || []).map((t: string) => (
                        <Badge 
                          key={t} 
                          className={`text-[10px] ${
                            t === 'VIP' ? 'bg-amber-500 text-white font-bold' :
                            t === 'Recorrente' ? 'bg-emerald-600 text-white font-bold' :
                            'bg-muted text-muted-foreground'
                          }`}
                        >
                          {t}
                        </Badge>
                      ))}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                      <span>CPF: <strong>{activeGuest?.documentNumber || activeGuest?.document || "—"}</strong></span>
                      <span>•</span>
                      <span>Tel: <strong>{activeGuest?.phone || "Não informado"}</strong></span>
                      <span>•</span>
                      <span>Email: <strong>{activeGuest?.email || "Não informado"}</strong></span>
                    </DialogDescription>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {activeGuest?.phone && (
                    <Button
                      size="sm"
                      onClick={() => {
                        const cleanP = String(activeGuest.phone).replace(/\D/g, '').replace(/^55/, '');
                        window.open(`https://wa.me/55${cleanP}?text=${encodeURIComponent(`Olá, ${activeGuest.fullName || activeGuest.name}! Falamos da CorpFlats.`)}`, '_blank');
                      }}
                      className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 shadow-xs"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>WhatsApp</span>
                    </Button>
                  )}
                  {activeGuest?.fnhrCompleted && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const resCode = activeGuest.reservations?.[0]?.code || activeGuest.stays?.[0]?.code || 'view';
                        window.open(`/pre-checkin/${resCode}?readonly=true&guestId=${activeGuest.id}`, '_blank');
                      }}
                      className="h-9 px-3 rounded-xl border-primary/30 text-primary hover:bg-primary/10 text-xs font-bold gap-1.5"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Ficha FNHR</span>
                    </Button>
                  )}
                </div>
              </div>
            </DialogHeader>

            {loadingDetail ? (
              <div className="p-16 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                <span>Carregando dados 360º e mídias de check-in...</span>
              </div>
            ) : activeGuest && (
              <div className="space-y-6 pt-3 text-xs">
                {/* ── GALERIA DE MÍDIAS E DOCUMENTOS BIOMÉTRICOS ── */}
                <div className="space-y-2.5">
                  <div className="font-bold text-foreground flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-primary" />
                      <span className="text-sm font-black">Galeria de Identificação & Biometria Digital</span>
                    </div>
                    {activeGuest.fnhrCompleted && (
                      <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Ficha FNHR Concluída {activeGuest.fnhrCompletedAt ? `(${new Date(activeGuest.fnhrCompletedAt).toLocaleDateString("pt-BR")})` : ''}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Card 1: Selfie Biométrica */}
                    <div className="p-3.5 rounded-2xl bg-muted/30 border border-border flex flex-col justify-between space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground text-[11px] flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5 text-primary" /> Selfie Facial
                        </span>
                        {activeGuest.photoUrl ? (
                          <Badge className="text-[9px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/30">Anexada</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] text-muted-foreground">Pendente</Badge>
                        )}
                      </div>

                      {activeGuest.photoUrl ? (
                        <div 
                          onClick={() => setLightboxMedia({ 
                            url: activeGuest.photoUrl, 
                            title: `Selfie Biométrica - ${activeGuest.fullName || activeGuest.name}`,
                            subtitle: "Reconhecimento facial conferido no Check-in Digital"
                          })}
                          className="relative group cursor-pointer rounded-xl overflow-hidden bg-background border border-border h-36 flex items-center justify-center shadow-inner"
                        >
                          <img
                            src={activeGuest.photoUrl}
                            alt="Selfie"
                            className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 text-white font-bold text-xs transition-opacity">
                            <ZoomIn className="w-4 h-4" /> Ampliar
                          </div>
                        </div>
                      ) : (
                        <div className="h-36 rounded-xl border border-dashed border-border bg-muted/20 flex flex-col items-center justify-center text-muted-foreground text-center p-3">
                          <Camera className="w-6 h-6 mb-1 opacity-40" />
                          <span className="text-[11px]">Nenhuma foto anexada</span>
                        </div>
                      )}
                    </div>

                    {/* Card 2: Foto do Documento */}
                    <div className="p-3.5 rounded-2xl bg-muted/30 border border-border flex flex-col justify-between space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground text-[11px] flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Documento (RG / CNH)
                        </span>
                        {activeGuest.docPhotoUrl ? (
                          <Badge className="text-[9px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/30">Validado</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] text-muted-foreground">Pendente</Badge>
                        )}
                      </div>

                      {activeGuest.docPhotoUrl ? (
                        <div 
                          onClick={() => setLightboxMedia({ 
                            url: activeGuest.docPhotoUrl, 
                            title: `Documento de Identidade Oficial - ${activeGuest.fullName || activeGuest.name}`,
                            subtitle: `CPF: ${activeGuest.documentNumber || activeGuest.document || 'Oficial'}`
                          })}
                          className="relative group cursor-pointer rounded-xl overflow-hidden bg-background border border-border h-36 flex items-center justify-center shadow-inner"
                        >
                          <img
                            src={activeGuest.docPhotoUrl}
                            alt="Documento"
                            className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 text-white font-bold text-xs transition-opacity">
                            <ZoomIn className="w-4 h-4" /> Ampliar
                          </div>
                        </div>
                      ) : (
                        <div className="h-36 rounded-xl border border-dashed border-border bg-muted/20 flex flex-col items-center justify-center text-muted-foreground text-center p-3">
                          <FileText className="w-6 h-6 mb-1 opacity-40" />
                          <span className="text-[11px]">Documento não anexado</span>
                        </div>
                      )}
                    </div>

                    {/* Card 3: Assinatura Digital */}
                    <div className="p-3.5 rounded-2xl bg-muted/30 border border-border flex flex-col justify-between space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground text-[11px] flex items-center gap-1">
                          <PenTool className="w-3.5 h-3.5 text-primary" /> Assinatura Digital
                        </span>
                        {activeGuest.signatureUrl ? (
                          <Badge className="text-[9px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/30">Assinado</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] text-muted-foreground">Pendente</Badge>
                        )}
                      </div>

                      {activeGuest.signatureUrl ? (
                        <div 
                          onClick={() => setLightboxMedia({ 
                            url: activeGuest.signatureUrl, 
                            title: `Termo de Estadia Assinado Digitalmente - ${activeGuest.fullName || activeGuest.name}`,
                            subtitle: "Assinatura digitalizada e vinculada ao CPF com carimbo de tempo"
                          })}
                          className="relative group cursor-pointer rounded-xl overflow-hidden bg-white border border-border h-36 flex items-center justify-center shadow-inner p-2"
                        >
                          <img
                            src={activeGuest.signatureUrl}
                            alt="Assinatura"
                            className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 text-white font-bold text-xs transition-opacity">
                            <ZoomIn className="w-4 h-4" /> Ampliar
                          </div>
                        </div>
                      ) : (
                        <div className="h-36 rounded-xl border border-dashed border-border bg-muted/20 flex flex-col items-center justify-center text-muted-foreground text-center p-3">
                          <PenTool className="w-6 h-6 mb-1 opacity-40" />
                          <span className="text-[11px]">Assinatura pendente</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Alertas de Menor ou Auditoria de IA */}
                  {activeGuest.isMinor && (
                    <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                        <span>
                          <strong>Hóspede Menor de Idade ({activeGuest.minorAge || calculateGuestAge(activeGuest.birthDate)} anos).</strong> Parentesco declarado: {activeGuest.minorKinship || 'Não especificado'}.
                        </span>
                      </div>
                      {activeGuest.minorAuthDocUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLightboxMedia({
                            url: activeGuest.minorAuthDocUrl,
                            title: `Autorização de Hospedagem de Menor - ${activeGuest.fullName || activeGuest.name}`,
                            subtitle: "Documento de autorização dos pais/responsáveis legais (ECA)"
                          })}
                          className="h-7 text-[11px] font-bold rounded-lg border-amber-400 text-amber-900 dark:text-amber-100"
                        >
                          Ver Autorização ECA
                        </Button>
                      )}
                    </div>
                  )}

                  {activeGuest.aiVerification && (
                    <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-800 dark:text-sky-200 text-[11px] flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span>Auditoria IA: <strong>{activeGuest.aiVerification.status === 'approved' ? 'Aprovado' : 'Em análise'}</strong> • {activeGuest.aiVerification.facialMatch || 'Biometria compatível'} • {activeGuest.aiVerification.documentValidity || 'Documento autêntico'}</span>
                      </div>
                      <Badge className="bg-sky-600 text-white text-[9px]">Confiança {activeGuest.aiVerification.confidence || 99}%</Badge>
                    </div>
                  )}
                </div>

                {/* ── GRID DE DADOS MINISTERIAIS (FNHR) & PESSOAIS ── */}
                <div className="space-y-2">
                  <div className="font-bold text-foreground flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="text-sm font-black">Ficha Cadastral e Ministerial (FNHR)</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 rounded-2xl bg-muted/20 border border-border">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-muted-foreground">CPF / Documento</div>
                      <div className="text-xs font-bold text-foreground mt-0.5 font-mono">{activeGuest.documentNumber || activeGuest.document || "Não informado"}</div>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase font-bold text-muted-foreground">Nascimento & Idade</div>
                      <div className="text-xs font-bold text-foreground mt-0.5">
                        {activeGuest.birthDate ? `${activeGuest.birthDate} (${calculateGuestAge(activeGuest.birthDate) || '-'} anos)` : "Não informada"}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase font-bold text-muted-foreground">Gênero / Sexo</div>
                      <div className="text-xs font-bold text-foreground mt-0.5 capitalize">{activeGuest.gender || "Não informado"}</div>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase font-bold text-muted-foreground">Veículo Registrado</div>
                      <div className="text-xs font-bold text-foreground mt-0.5 flex items-center gap-1">
                        <Car className="w-3 h-3 text-muted-foreground" />
                        <span>{activeGuest.vehiclePlate ? `${activeGuest.vehiclePlate} (${activeGuest.vehicleModel || activeGuest.vehicleBrand || 'Veículo'})` : "Sem carro"}</span>
                      </div>
                    </div>

                    <div className="col-span-2">
                      <div className="text-[10px] uppercase font-bold text-muted-foreground">Endereço Residencial Completo</div>
                      <div className="text-xs font-semibold text-foreground mt-0.5">
                        {activeGuest.address || "Endereço não cadastrado"}
                      </div>
                    </div>

                    <div className="col-span-2">
                      <div className="text-[10px] uppercase font-bold text-muted-foreground">Cidade / Estado / País</div>
                      <div className="text-xs font-semibold text-foreground mt-0.5">
                        {activeGuest.city ? `${activeGuest.city}/${activeGuest.state || 'RJ'}` : "Não informada"} • {activeGuest.country || "Brasil"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── MÉTRICAS DE HOSPEDAGEM E PREFERÊNCIAS ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-2xl bg-muted/40 border border-border">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">LTV Total</div>
                    <div className="text-base font-black text-emerald-600 mt-0.5">
                      R$ {(activeGuest.totalSpent || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-muted/40 border border-border">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">Total Estadias</div>
                    <div className="text-base font-black text-foreground mt-0.5">{activeGuest.totalStays || 1} visitas</div>
                  </div>

                  <div className="p-3 rounded-2xl bg-muted/40 border border-border">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">Cama Preferida</div>
                    <div className="text-sm font-bold text-foreground mt-0.5 capitalize">{activeGuest.preferences?.bedType || "Casal"}</div>
                  </div>

                  <div className="p-3 rounded-2xl bg-muted/40 border border-border">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">Flat Frequente</div>
                    <div className="text-sm font-bold text-foreground mt-0.5">
                      {activeGuest.favoriteFlat ? `Apto ${activeGuest.favoriteFlat}` : "Variado"}
                    </div>
                  </div>
                </div>

                {/* Central de Templates WhatsApp */}
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2.5">
                  <div className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                    <MessageCircle className="w-4 h-4" /> Disparar Mensagem Rápida no WhatsApp
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button 
                      size="sm" 
                      onClick={() => handleSendWhatsAppTemplate("welcome", activeGuest)}
                      className="h-8 text-[11px] font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      👋 Boas-vindas & Pré-Checkin
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={() => handleSendWhatsAppTemplate("room_ready", activeGuest)}
                      className="h-8 text-[11px] font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      ✨ Quarto Liberado
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={() => handleSendWhatsAppTemplate("review", activeGuest)}
                      className="h-8 text-[11px] font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      ⭐ Pedir Avaliação Google
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={() => handleSendWhatsAppTemplate("pix", activeGuest)}
                      className="h-8 text-[11px] font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      ⚡ Enviar Chave PIX
                    </Button>
                  </div>
                </div>

                {/* Histórico de Reservas */}
                <div className="space-y-2">
                  <div className="font-bold text-foreground flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-primary" /> Histórico de Estadias & Reservas ({activeGuest.reservations?.length || 0})
                  </div>
                  {(!activeGuest.reservations || activeGuest.reservations.length === 0) ? (
                    <div className="p-4 text-center text-muted-foreground bg-muted/20 rounded-2xl">Nenhuma reserva registrada no histórico.</div>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {activeGuest.reservations.map((r: any) => (
                        <div key={r.id} className="p-2.5 rounded-xl bg-muted/40 border border-border flex items-center justify-between">
                          <div>
                            <span className="font-bold text-foreground">Flat {r.flatNumber || "—"}</span>
                            <span className="text-muted-foreground text-[11px] ml-2">
                              {r.checkinDate} a {r.checkoutDate} ({r.nightsCount || 1} noites)
                            </span>
                            {r.fnhrCompleted && (
                              <Badge className="ml-2 text-[9px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">FNHR OK</Badge>
                            )}
                          </div>
                          <div className="font-black text-emerald-600">
                            R$ {Number(r.totalAmount || r.totalPrice || 0).toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Histórico de Notas Fiscais */}
                <div className="space-y-2">
                  <div className="font-bold text-foreground flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-primary" /> Notas Fiscais Emitidas ({activeGuest.invoices?.length || 0})
                  </div>
                  {(!activeGuest.invoices || activeGuest.invoices.length === 0) ? (
                    <div className="p-4 text-center text-muted-foreground bg-muted/20 rounded-2xl">Nenhuma nota fiscal emitida ainda.</div>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {activeGuest.invoices.map((inv: any) => (
                        <div key={inv.id} className="p-2.5 rounded-xl bg-muted/40 border border-border flex items-center justify-between">
                          <div>
                            <span className="font-bold text-primary font-mono">{inv.numeroNfse || `#${inv.id}`}</span>
                            <span className="text-muted-foreground text-[11px] ml-2">
                              {inv.dataEmissao ? new Date(inv.dataEmissao).toLocaleDateString("pt-BR") : "—"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground">R$ {Number(inv.valorServico || 0).toFixed(2)}</span>
                            {inv.danfseUrl && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(inv.danfseUrl, "_blank")}
                                className="h-6 px-2 text-[10px] font-bold rounded-lg text-primary border-primary/40"
                              >
                                DANFSE
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 pt-4 border-t border-border flex-wrap sm:flex-nowrap">
              <Button
                onClick={() => {
                  setDetailModalOpen(false)
                  setLocation(`/notas?doc=${activeGuest?.documentNumber || activeGuest?.document || ''}&nome=${encodeURIComponent(activeGuest?.fullName || activeGuest?.name || '')}`)
                }}
                className="rounded-xl h-10 text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Emitir NFS-e para este Hóspede</span>
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setDetailModalOpen(false)}
                className="rounded-xl h-10 text-xs font-bold"
              >
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── MODAL CADASTRO/EDIÇÃO DE HÓSPEDE ── */}
        <Dialog open={guestModalOpen} onOpenChange={setGuestModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black">{editingGuest ? "Editar Hóspede" : "Novo Hóspede"}</DialogTitle>
              <DialogDescription className="text-xs">Dados de contato, documento e preferências</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveGuest} className="space-y-3 pt-2 text-xs">
              <div className="space-y-1">
                <Label className="font-bold">Nome Completo *</Label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} required className="h-9 text-xs rounded-xl font-medium" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="font-bold">CPF / Documento</Label>
                  <Input value={formDocument} onChange={e => setFormDocument(e.target.value)} className="h-9 text-xs rounded-xl font-mono" />
                </div>
                <div className="space-y-1">
                  <Label className="font-bold">WhatsApp / Celular</Label>
                  <Input value={formPhone} onChange={e => setFormPhone(e.target.value)} className="h-9 text-xs rounded-xl" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="font-bold">E-mail</Label>
                  <Input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} className="h-9 text-xs rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label className="font-bold">Cidade / UF</Label>
                  <Input value={formCity} onChange={e => setFormCity(e.target.value)} className="h-9 text-xs rounded-xl" />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="font-bold">Empresa Parceira (Opcional)</Label>
                <select 
                  value={formCompanyId} 
                  onChange={e => setFormCompanyId(e.target.value)}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-xs"
                >
                  <option value="">Nenhuma (Pessoa Física Avulsa)</option>
                  {companies.map(c => (
                    <option key={c.id} value={String(c.id)}>{c.tradeName || c.corporateName}</option>
                  ))}
                </select>
              </div>


              {/* Switch: Mensalista / Contrato Long Stay */}
              <div className="p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">Cliente Mensalista / Contrato Long Stay</span>
                    <span className="text-[11px] text-muted-foreground">Reservas deste cliente ganham destaque no Livro de Reservas</span>
                  </div>
                </div>
                <Switch checked={formIsMonthlyGuest} onCheckedChange={setFormIsMonthlyGuest} />
              </div>

              {/* Switch: Auto-Emitir Nota Fiscal (NFS-e) */}
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">Auto-Emitir Nota Fiscal (NFS-e) no Check-out</span>
                    <span className="text-[11px] text-muted-foreground">Emite e envia NFS-e no WhatsApp deste hóspede no check-out</span>
                  </div>
                </div>
                <Switch checked={formAutoInvoice} onCheckedChange={setFormAutoInvoice} />
              </div>

              <div className="space-y-1">
                <Label className="font-bold">Observações / Preferências</Label>
                <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} className="text-xs rounded-xl" />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setGuestModalOpen(false)} className="rounded-xl h-9 text-xs font-bold">Cancelar</Button>
                <Button type="submit" disabled={savingGuest} className="rounded-xl h-9 text-xs font-bold bg-primary text-primary-foreground">
                  {savingGuest ? "Salvando..." : "Salvar Hóspede"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── MODAL CADASTRO/EDIÇÃO DE EMPRESA ── */}
        <Dialog open={companyModalOpen} onOpenChange={setCompanyModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <span>{editingCompany ? "Editar Empresa" : "Nova Empresa Parceira (PJ)"}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">Faturamento corporativo e cadastro B2B</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveCompany} className="space-y-3 pt-2 text-xs">
              <div className="space-y-1">
                <Label className="font-bold">CNPJ *</Label>
                <div className="flex gap-1.5">
                  <Input 
                    value={compCnpj} 
                    onChange={e => {
                      setCompCnpj(e.target.value)
                      handleLookupCnpj(e.target.value)
                    }} 
                    required 
                    placeholder="00.000.000/0000-00"
                    className="h-9 text-xs rounded-xl font-mono" 
                  />
                  {loadingCnpj && <RefreshCw className="w-4 h-4 animate-spin text-primary self-center" />}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="font-bold">Razão Social *</Label>
                <Input value={compCorporateName} onChange={e => setCompCorporateName(e.target.value)} required className="h-9 text-xs rounded-xl" />
              </div>

              <div className="space-y-1">
                <Label className="font-bold">Nome Fantasia</Label>
                <Input value={compTradeName} onChange={e => setCompTradeName(e.target.value)} className="h-9 text-xs rounded-xl" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="font-bold">E-mail Financeiro</Label>
                  <Input value={compFinancialEmail} onChange={e => setCompFinancialEmail(e.target.value)} className="h-9 text-xs rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label className="font-bold">Condição de Faturamento</Label>
                  <Input value={compBillingTerms} onChange={e => setCompBillingTerms(e.target.value)} placeholder="Ex: 30 dias" className="h-9 text-xs rounded-xl" />
                </div>
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setCompanyModalOpen(false)} className="rounded-xl h-9 text-xs font-bold">Cancelar</Button>
                <Button type="submit" disabled={savingCompany} className="rounded-xl h-9 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white">
                  {savingCompany ? "Salvando..." : "Salvar Empresa"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── LIGHTBOX ZOOM MODAL (EM TELA CHEIA) ── */}
        {lightboxMedia && (
          <Dialog open={!!lightboxMedia} onOpenChange={(open) => !open && setLightboxMedia(null)}>
            <DialogContent className="sm:max-w-4xl bg-card/95 backdrop-blur-md border border-border rounded-3xl p-5 shadow-2xl">
              <DialogHeader className="border-b border-border pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                      <Maximize2 className="w-4 h-4 text-primary" />
                      <span>{lightboxMedia.title}</span>
                    </DialogTitle>
                    {lightboxMedia.subtitle && (
                      <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                        {lightboxMedia.subtitle}
                      </DialogDescription>
                    )}
                  </div>
                </div>
              </DialogHeader>

              <div className="flex items-center justify-center p-4 bg-muted/20 rounded-2xl max-h-[72vh] overflow-hidden my-2">
                <img
                  src={lightboxMedia.url}
                  alt={lightboxMedia.title}
                  className="max-h-[68vh] max-w-full object-contain rounded-xl shadow-lg border border-border"
                />
              </div>

              <DialogFooter className="flex items-center justify-between pt-2 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(lightboxMedia.url, "_blank")}
                  className="text-xs font-bold rounded-xl gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir em Nova Aba</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => setLightboxMedia(null)}
                  className="text-xs font-bold rounded-xl"
                >
                  Fechar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </Shell>
  )
}

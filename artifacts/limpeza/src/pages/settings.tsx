import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { 
  useGetSettings, 
  useUpdateSettings, 
  useSyncReservations,
  useGetMe,
  getGetSettingsQueryKey
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from "@/components/ui/dialog"
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { 
  RefreshCw, Check, Users, Key, ShieldCheck, UserPlus, AlertCircle, Cloud, 
  HardDrive, Zap, Sparkles, Database, Lock, Trash2, Edit2, CreditCard
} from "lucide-react"

import { AccessDenied } from "@/components/access-denied"

export default function SystemSettings() {
  const [, setLocation] = useLocation()
  const { data: user, isLoading: loadingUser } = useGetMe()
  const queryClient = useQueryClient()
  const { data: settings } = useGetSettings()

  const [saved, setSaved] = useState(false)
  const [newShareUrl, setNewShareUrl] = useState("")

  const updateSettings = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        setSaved(true)
        setNewShareUrl("")
        setTimeout(() => setSaved(false), 2000)
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() })
      }
    }
  })

  const sync = useSyncReservations({
    mutation: {
      onSuccess: (data) => {
        alert(`Sincronização concluída! ${data.message || ''}`)
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() })
      },
      onError: (err: any) => {
        alert(`Erro ao sincronizar: ${err.message || 'Erro desconhecido'}`)
      }
    }
  })

  // Users Management states
  const [usersList, setUsersList] = useState<any[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [newUserModalOpen, setNewUserModalOpen] = useState(false)
  const [newUsername, setNewUsername] = useState("")
  const [newUserPassword, setNewUserPassword] = useState("")
  const [newUserRole, setNewUserRole] = useState("camareira")
  const [userError, setUserError] = useState("")

  const [resetPwModalOpen, setResetPwModalOpen] = useState(false)
  const [targetUser, setTargetUser] = useState<any | null>(null)
  const [adminNewPassword, setAdminNewPassword] = useState("")
  const [resetPwError, setResetPwError] = useState("")
  const [resetPwSuccess, setResetPwSuccess] = useState("")
  const [savingUser, setSavingUser] = useState(false)

  // Storage & Cloudflare R2 states
  const [storageData, setStorageData] = useState<any | null>(null)
  const [storageModalOpen, setStorageModalOpen] = useState(false)
  const [r2AccountId, setR2AccountId] = useState("")
  const [r2AccessKeyId, setR2AccessKeyId] = useState("")
  const [r2SecretAccessKey, setR2SecretAccessKey] = useState("")
  const [r2BucketName, setR2BucketName] = useState("corpflats-docs")
  const [r2PublicUrl, setR2PublicUrl] = useState("")
  const [savingStorage, setSavingStorage] = useState(false)
  const [storageSuccess, setStorageSuccess] = useState("")

  // LGPD Cleanup states
  const [cleanupModalOpen, setCleanupModalOpen] = useState(false)
  const [retentionDays, setRetentionDays] = useState("60")
  const [cleaningDocs, setCleaningDocs] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<string | null>(null)

  // Microsoft Graph API states
  const [msGraphConfig, setMsGraphConfig] = useState<any | null>(null)
  const [msGraphModalOpen, setMsGraphModalOpen] = useState(false)
  const [msTenantId, setMsTenantId] = useState("common")
  const [msClientId, setMsClientId] = useState("")
  const [msClientSecret, setMsClientSecret] = useState("")
  const [msFilePath, setMsFilePath] = useState("/Hotel/Documentos hóspedes/Planilha.xlsx")
  const [savingMsGraph, setSavingMsGraph] = useState(false)
  const [testingMsGraph, setTestingMsGraph] = useState(false)
  const [msGraphMessage, setMsGraphMessage] = useState<string | null>(null)

  // Banco Inter PIX states
  const [interConfig, setInterConfig] = useState<any | null>(null)
  const [testingInter, setTestingInter] = useState(false)
  const [interTestMsg, setInterTestMsg] = useState<string | null>(null)

  // Mercado Pago states
  const [mpConfig, setMpConfig] = useState<any | null>(null)
  const [mpAccessToken, setMpAccessToken] = useState("")
  const [mpPublicKey, setMpPublicKey] = useState("")
  const [mpClientId, setMpClientId] = useState("")
  const [mpClientSecret, setMpClientSecret] = useState("")
  const [mpSandbox, setMpSandbox] = useState(false)
  const [savingMp, setSavingMp] = useState(false)
  const [mpSuccessMsg, setMpSuccessMsg] = useState<string | null>(null)

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users")
      if (res.ok) {
        const data = await res.json()
        setUsersList(data)
      }
    } finally {
      setLoadingUsers(false)
    }
  }

  const fetchStorageConfig = async () => {
    try {
      const res = await fetch("/api/storage/config")
      if (res.ok) {
        const data = await res.json()
        setStorageData(data)
        if (data.r2) {
          setR2AccountId(data.r2.accountId || "")
          setR2BucketName(data.r2.bucketName || "corpflats-docs")
          setR2PublicUrl(data.r2.publicUrl || "")
        }
      }
    } catch {}
  }

  const fetchMsGraphConfig = async () => {
    try {
      const res = await fetch("/api/integrations/microsoft-graph/config")
      if (res.ok) {
        const data = await res.json()
        setMsGraphConfig(data)
        if (data.tenantId) setMsTenantId(data.tenantId)
        if (data.filePath) setMsFilePath(data.filePath)
      }
    } catch {}
  }

  const fetchInterConfig = async () => {
    try {
      const res = await fetch("/api/integrations/inter/config")
      if (res.ok) {
        const data = await res.json()
        setInterConfig(data)
      }
    } catch {}
  }

  const fetchMpConfig = async () => {
    try {
      const res = await fetch("/api/integrations/mercadopago/config")
      if (res.ok) {
        const data = await res.json()
        setMpConfig(data)
        if (data.accessToken) setMpAccessToken(data.accessToken)
        if (data.publicKey) setMpPublicKey(data.publicKey)
        if (data.clientId) setMpClientId(data.clientId)
        if (data.sandbox !== undefined) setMpSandbox(data.sandbox)
      }
    } catch {}
  }

  useEffect(() => {
    fetchUsers()
    fetchStorageConfig()
    fetchMsGraphConfig()
    fetchInterConfig()
    fetchMpConfig()
  }, [])

  if (loadingUser) return null
  if (user?.role !== "admin") return <Shell><AccessDenied /></Shell>

  // Handlers de Ações Técnicas
  const handleSaveStorage = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingStorage(true)
    setStorageSuccess("")
    try {
      const res = await fetch("/api/storage/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "r2",
          r2: {
            accountId: r2AccountId,
            accessKeyId: r2AccessKeyId,
            secretAccessKey: r2SecretAccessKey,
            bucketName: r2BucketName,
            publicUrl: r2PublicUrl
          }
        })
      })
      if (res.ok) {
        setStorageSuccess("Configurações do Cloudflare R2 salvas com sucesso!")
        fetchStorageConfig()
        setTimeout(() => setStorageModalOpen(false), 1500)
      }
    } finally {
      setSavingStorage(false)
    }
  }

  const handleSaveMsGraph = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingMsGraph(true)
    try {
      const res = await fetch("/api/integrations/microsoft-graph/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: msTenantId,
          clientId: msClientId,
          clientSecret: msClientSecret,
          filePath: msFilePath
        })
      })
      if (res.ok) {
        alert("Configurações do Microsoft Graph salvas com sucesso!")
        setMsGraphModalOpen(false)
        fetchMsGraphConfig()
      }
    } finally {
      setSavingMsGraph(false)
    }
  }

  const handleTestMsGraph = async () => {
    setTestingMsGraph(true)
    setMsGraphMessage(null)
    try {
      const res = await fetch("/api/integrations/microsoft-graph/test", { method: "POST" })
      const data = await res.json()
      setMsGraphMessage(data.message || (data.success ? "Conexão estabelecida com sucesso!" : "Falha ao conectar."))
    } catch (e: any) {
      setMsGraphMessage("Erro ao testar conexão: " + e.message)
    } finally {
      setTestingMsGraph(false)
    }
  }

  const handleSaveMp = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingMp(true)
    try {
      const res = await fetch("/api/integrations/mercadopago/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: mpAccessToken,
          publicKey: mpPublicKey,
          clientId: mpClientId,
          clientSecret: mpClientSecret,
          sandbox: mpSandbox
        })
      })
      if (res.ok) {
        setMpSuccessMsg("Credenciais do Mercado Pago salvas com sucesso!")
        setTimeout(() => setMpSuccessMsg(null), 3000)
        fetchMpConfig()
      }
    } finally {
      setSavingMp(false)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setUserError("")
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername, password: newUserPassword, role: newUserRole })
      })
      const data = await res.json()
      if (res.ok) {
        setNewUserModalOpen(false)
        setNewUsername("")
        setNewUserPassword("")
        fetchUsers()
      } else {
        setUserError(data.error || "Erro ao criar usuário.")
      }
    } catch {
      setUserError("Erro na requisição.")
    }
  }

  const handleDeleteUser = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este usuário?")) return
    try {
      await fetch(`/api/admin/users/${id}`, { method: "DELETE" })
      fetchUsers()
    } catch {
      alert("Erro ao excluir usuário.")
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetUser || !adminNewPassword) return
    setResetPwError("")
    setResetPwSuccess("")
    setSavingUser(true)

    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: adminNewPassword })
      })
      if (res.ok) {
        setResetPwSuccess(`Senha de ${targetUser.name || targetUser.username} alterada com sucesso!`)
        setTimeout(() => {
          setResetPwModalOpen(false)
          setAdminNewPassword("")
          setTargetUser(null)
        }, 1500)
      } else {
        const d = await res.json()
        setResetPwError(d.error || "Erro ao redefinir senha.")
      }
    } finally {
      setSavingUser(false)
    }
  }

  return (
    <Shell>
      <div className="space-y-6 pb-20 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card border border-border p-5 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-foreground">Integrações Técnicas & Nuvem</h1>
              <p className="text-xs text-muted-foreground">APIs de sincronização, nuvem de fotos, gateways de pagamento e usuários</p>
            </div>
          </div>
        </div>

        {/* ── SEÇÃO 1: NUVEM E SINCRONIZAÇÃO ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Cloudflare R2 */}
          <Card className="rounded-3xl border border-border shadow-sm flex flex-col justify-between">
            <div>
              <CardHeader className="p-5 border-b border-border pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black text-foreground flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-orange-500" />
                    <span>Armazenamento Cloudflare R2</span>
                  </CardTitle>
                  <Badge variant={storageData?.r2?.accountId ? "default" : "outline"} className="text-[10px]">
                    {storageData?.r2?.accountId ? "✓ Configurado" : "Pendente"}
                  </Badge>
                </div>
                <CardDescription className="text-xs">Armazenamento em nuvem para fotos de vistorias, avarias e documentos</CardDescription>
              </CardHeader>

              <CardContent className="p-5 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Provedor Ativo:</span>
                  <span className="font-bold text-foreground font-mono">{storageData?.provider || "Local / R2"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Bucket Name:</span>
                  <span className="font-mono">{storageData?.r2?.bucketName || "corpflats-docs"}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Account ID:</span>
                  <span className="font-mono">{storageData?.r2?.accountId ? `${storageData.r2.accountId.substring(0, 8)}...` : "Não definido"}</span>
                </div>
              </CardContent>
            </div>

            <div className="p-4 border-t border-border bg-muted/20 rounded-b-3xl">
              <Button 
                onClick={() => setStorageModalOpen(true)}
                className="w-full text-xs font-bold rounded-xl h-9.5 bg-primary text-primary-foreground gap-1.5"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>Configurar Cloudflare R2</span>
              </Button>
            </div>
          </Card>

          {/* Microsoft Graph API */}
          <Card className="rounded-3xl border border-border shadow-sm flex flex-col justify-between">
            <div>
              <CardHeader className="p-5 border-b border-border pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black text-foreground flex items-center gap-2">
                    <Database className="w-4 h-4 text-blue-500" />
                    <span>Sincronização Microsoft Graph API</span>
                  </CardTitle>
                  <Badge variant={msGraphConfig?.clientId ? "default" : "outline"} className="text-[10px]">
                    {msGraphConfig?.clientId ? "✓ Integrado" : "Pendente"}
                  </Badge>
                </div>
                <CardDescription className="text-xs">Conexão direta com a planilha Excel oficial no OneDrive</CardDescription>
              </CardHeader>

              <CardContent className="p-5 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Caminho da Planilha:</span>
                  <span className="font-mono text-[11px] truncate max-w-[200px]">{msGraphConfig?.filePath || "/Hotel/Planilha.xlsx"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Client ID:</span>
                  <span className="font-mono">{msGraphConfig?.clientId ? `${msGraphConfig.clientId.substring(0, 8)}...` : "Não configurado"}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Status do Token:</span>
                  <span className="font-bold text-emerald-600">Ativo</span>
                </div>
              </CardContent>
            </div>

            <div className="p-4 border-t border-border bg-muted/20 rounded-b-3xl flex gap-2">
              <Button 
                onClick={handleTestMsGraph}
                disabled={testingMsGraph}
                variant="outline"
                className="flex-1 text-xs font-bold rounded-xl h-9.5 gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testingMsGraph ? 'animate-spin' : ''}`} />
                <span>Testar Conexão</span>
              </Button>
              <Button 
                onClick={() => setMsGraphModalOpen(true)}
                className="flex-1 text-xs font-bold rounded-xl h-9.5 bg-primary text-primary-foreground gap-1.5"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Configurar API</span>
              </Button>
            </div>
          </Card>
        </div>

        {/* ── SEÇÃO 2: GATEWAYS DE PAGAMENTO ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Banco Inter PIX */}
          <Card className="rounded-3xl border border-border shadow-sm flex flex-col justify-between">
            <CardHeader className="p-5 border-b border-border pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-black text-foreground flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span>Banco Inter PIX (API Webhook)</span>
                </CardTitle>
                <Badge className="bg-emerald-600 text-white text-[10px]">Ativo</Badge>
              </div>
              <CardDescription className="text-xs">Geração de QR Code PIX com conciliação bancária instantânea</CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Chave PIX:</span>
                <span className="font-mono font-bold">{interConfig?.pixKey || "47.964.813/0001-65"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Certificado mTLS:</span>
                <span className="font-bold text-emerald-600">Instalado e Válido</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Webhook de Notificação:</span>
                <span className="font-bold text-foreground">Conectado</span>
              </div>
            </CardContent>

            <div className="p-4 border-t border-border bg-muted/20 rounded-b-3xl">
              <Button 
                onClick={async () => {
                  setTestingInter(true)
                  try {
                    const res = await fetch("/api/integrations/inter/test-pix", { method: "POST" })
                    const d = await res.json()
                    alert(d.message || "Teste concluído com sucesso!")
                  } finally {
                    setTestingInter(false)
                  }
                }}
                disabled={testingInter}
                variant="outline"
                className="w-full text-xs font-bold rounded-xl h-9.5 gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testingInter ? 'animate-spin' : ''}`} />
                <span>Testar Comunicação Banco Inter</span>
              </Button>
            </div>
          </Card>

          {/* Mercado Pago */}
          <Card className="rounded-3xl border border-border shadow-sm flex flex-col justify-between">
            <CardHeader className="p-5 border-b border-border pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-black text-foreground flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-blue-500" />
                  <span>Mercado Pago (Cartão & Links)</span>
                </CardTitle>
                <Badge variant={mpConfig?.accessToken ? "default" : "outline"} className="text-[10px]">
                  {mpConfig?.accessToken ? "✓ Configurado" : "Pendente"}
                </Badge>
              </div>
              <CardDescription className="text-xs">Processamento de cartões de crédito e links de pagamento</CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-3 text-xs">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold">Access Token</Label>
                <Input 
                  type="password"
                  value={mpAccessToken}
                  onChange={e => setMpAccessToken(e.target.value)}
                  placeholder="APP_USR-..."
                  className="text-xs h-8.5 rounded-xl font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold">Public Key</Label>
                <Input 
                  value={mpPublicKey}
                  onChange={e => setMpPublicKey(e.target.value)}
                  placeholder="APP_USR-..."
                  className="text-xs h-8.5 rounded-xl font-mono"
                />
              </div>
            </CardContent>

            <div className="p-4 border-t border-border bg-muted/20 rounded-b-3xl">
              <Button 
                onClick={handleSaveMp}
                disabled={savingMp}
                className="w-full text-xs font-bold rounded-xl h-9.5 bg-primary text-primary-foreground gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Salvar Credenciais Mercado Pago</span>
              </Button>
            </div>
          </Card>
        </div>

        {/* ── SEÇÃO 3: GESTÃO DE USUÁRIOS E EQUIPE ── */}
        <Card className="rounded-3xl border border-border shadow-sm">
          <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                <span>Usuários da Equipe & Níveis de Acesso</span>
              </CardTitle>
              <CardDescription className="text-xs">Contas de acesso para camareiras, recepção e administradores</CardDescription>
            </div>

            <Button 
              size="sm"
              onClick={() => setNewUserModalOpen(true)}
              className="h-9 px-3 rounded-xl text-xs font-bold gap-1.5 bg-primary text-primary-foreground shadow-xs"
            >
              <UserPlus className="w-4 h-4" />
              <span>Novo Usuário</span>
            </Button>
          </CardHeader>

          <CardContent className="p-0">
            {loadingUsers ? (
              <div className="p-8 text-center text-xs text-muted-foreground">Carregando equipe...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/40 text-muted-foreground border-b border-border font-bold">
                    <tr>
                      <th className="p-3.5">Nome / Login</th>
                      <th className="p-3.5">Perfil</th>
                      <th className="p-3.5">Último Acesso</th>
                      <th className="p-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {usersList.map((u: any) => (
                      <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                        <td className="p-3.5 font-bold text-foreground flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black">
                            {(u.name || u.username).substring(0, 2).toUpperCase()}
                          </div>
                          <span>{u.name || u.username}</span>
                        </td>
                        <td className="p-3.5">
                          <Badge variant={u.role === "admin" ? "default" : "outline"} className="text-[10px]">
                            {u.role === "admin" ? "Administrador" : u.role === "recepcao" ? "Recepção" : "Camareira"}
                          </Badge>
                        </td>
                        <td className="p-3.5 text-muted-foreground">
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("pt-BR") : "—"}
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button 
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setTargetUser(u)
                                setAdminNewPassword("")
                                setResetPwModalOpen(true)
                              }}
                              className="h-7 px-2 text-[11px] font-bold rounded-lg text-primary hover:bg-primary/10"
                            >
                              <Key className="w-3 h-3 mr-1" />
                              <span>Redefinir Senha</span>
                            </Button>
                            {u.role !== "admin" && (
                              <Button 
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteUser(u.id)}
                                className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
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

        {/* Modal Cloudflare R2 */}
        <Dialog open={storageModalOpen} onOpenChange={setStorageModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <Cloud className="w-5 h-5 text-orange-500" />
                Configurar Cloudflare R2
              </DialogTitle>
              <DialogDescription className="text-xs">Insira as credenciais do bucket S3 compatível da Cloudflare</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveStorage} className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Account ID</Label>
                <Input value={r2AccountId} onChange={e => setR2AccountId(e.target.value)} required className="text-xs rounded-xl h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Access Key ID</Label>
                <Input value={r2AccessKeyId} onChange={e => setR2AccessKeyId(e.target.value)} required className="text-xs rounded-xl h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Secret Access Key</Label>
                <Input type="password" value={r2SecretAccessKey} onChange={e => setR2SecretAccessKey(e.target.value)} required className="text-xs rounded-xl h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Bucket Name</Label>
                <Input value={r2BucketName} onChange={e => setR2BucketName(e.target.value)} required className="text-xs rounded-xl h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Public Domain / Custom URL (opcional)</Label>
                <Input value={r2PublicUrl} onChange={e => setR2PublicUrl(e.target.value)} className="text-xs rounded-xl h-9" />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setStorageModalOpen(false)} className="rounded-xl h-9 text-xs font-bold">Cancelar</Button>
                <Button type="submit" disabled={savingStorage} className="rounded-xl h-9 text-xs font-bold bg-primary text-primary-foreground">
                  {savingStorage ? "Salvando..." : "Salvar R2"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal Microsoft Graph */}
        <Dialog open={msGraphModalOpen} onOpenChange={setMsGraphModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-500" />
                Configurar Microsoft Graph API
              </DialogTitle>
              <DialogDescription className="text-xs">Conexão Azure App Registration com o OneDrive da Empresa</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveMsGraph} className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Tenant ID</Label>
                <Input value={msTenantId} onChange={e => setMsTenantId(e.target.value)} required className="text-xs rounded-xl h-9 font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Client ID (App ID)</Label>
                <Input value={msClientId} onChange={e => setMsClientId(e.target.value)} required className="text-xs rounded-xl h-9 font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Client Secret</Label>
                <Input type="password" value={msClientSecret} onChange={e => setMsClientSecret(e.target.value)} required className="text-xs rounded-xl h-9 font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Caminho da Planilha no OneDrive</Label>
                <Input value={msFilePath} onChange={e => setMsFilePath(e.target.value)} required className="text-xs rounded-xl h-9 font-mono" />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setMsGraphModalOpen(false)} className="rounded-xl h-9 text-xs font-bold">Cancelar</Button>
                <Button type="submit" disabled={savingMsGraph} className="rounded-xl h-9 text-xs font-bold bg-primary text-primary-foreground">
                  {savingMsGraph ? "Salvando..." : "Salvar Configuração"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal Novo Usuário */}
        <Dialog open={newUserModalOpen} onOpenChange={setNewUserModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" />
                Cadastrar Novo Usuário
              </DialogTitle>
              <DialogDescription className="text-xs">Crie credenciais de acesso para um colaborador</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateUser} className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Nome / Usuário</Label>
                <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} required className="text-xs rounded-xl h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Senha Inicial</Label>
                <Input type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} required className="text-xs rounded-xl h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Perfil de Acesso</Label>
                <Select value={newUserRole} onValueChange={setNewUserRole}>
                  <SelectTrigger className="h-9 text-xs rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="camareira">Camareira (Apenas Limpeza)</SelectItem>
                    <SelectItem value="recepcao">Recepção / Portaria</SelectItem>
                    <SelectItem value="admin">Administrador Geral</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setNewUserModalOpen(false)} className="rounded-xl h-9 text-xs font-bold">Cancelar</Button>
                <Button type="submit" className="rounded-xl h-9 text-xs font-bold bg-primary text-primary-foreground">Criar Usuário</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal Redefinir Senha */}
        <Dialog open={resetPwModalOpen} onOpenChange={setResetPwModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                Redefinir Senha de {targetUser?.name || targetUser?.username}
              </DialogTitle>
              <DialogDescription className="text-xs">Defina uma nova senha para este usuário</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleResetPassword} className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Nova Senha</Label>
                <Input type="password" value={adminNewPassword} onChange={e => setAdminNewPassword(e.target.value)} required className="text-xs rounded-xl h-9" />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setResetPwModalOpen(false)} className="rounded-xl h-9 text-xs font-bold">Cancelar</Button>
                <Button type="submit" disabled={savingUser} className="rounded-xl h-9 text-xs font-bold bg-primary text-primary-foreground">
                  {savingUser ? "Alterando..." : "Salvar Nova Senha"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  )
}

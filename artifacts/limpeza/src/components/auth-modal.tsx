import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  User, Lock, Mail, Phone, Fingerprint, Globe, Sparkles, 
  ArrowRight, KeyRound, AlertCircle, CheckCircle2, Shield 
} from "lucide-react"
import { 
  loginWithEmail, registerAccount, loginWithGoogleCredential, loginWithGooglePopup,
  loginWithPasskey, requestPasswordReset, initGoogleOneTap, UserProfile 
} from "@/lib/auth-client"
import { useToast } from "@/hooks/use-toast"

interface AuthModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (user: UserProfile) => void
}

export function AuthModal({ open, onOpenChange, onSuccess }: AuthModalProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<"login" | "register" | "forgot">("login")
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  // Form States - Login
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")

  // Form States - Register
  const [regName, setRegName] = useState("")
  const [regEmail, setRegEmail] = useState("")
  const [regPassword, setRegPassword] = useState("")
  const [regPhone, setRegPhone] = useState("")
  const [regDocument, setRegDocument] = useState("")

  // Form States - Forgot
  const [forgotEmail, setForgotEmail] = useState("")
  const [forgotSuccess, setForgotSuccess] = useState(false)

  // Inicializa Google One Tap automaticamente quando o modal abre
  useEffect(() => {
    if (open) {
      setErrorMsg("")
      initGoogleOneTap((user) => {
        toast({
          title: `Olá, ${user.name}! 👋`,
          description: "Login realizado com sucesso via Google."
        })
        if (onSuccess) onSuccess(user)
        onOpenChange(false)
      })
    }
  }, [open])

  const handleGoogleClick = async () => {
    setLoading(true)
    setErrorMsg("")
    try {
      const res = await loginWithGooglePopup((user) => {
        toast({
          title: `Olá, ${user.name}! 👋`,
          description: "Login realizado com sucesso via Google."
        })
        if (onSuccess) onSuccess(user)
        onOpenChange(false)
      })
      if (!res.success && res.error && !res.error.includes("fechada") && !res.error.includes("Cancelado")) {
        setErrorMsg(res.error)
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao conectar com o Google.")
    } finally {
      setLoading(false)
    }
  }

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg("")
    try {
      const res = await loginWithEmail(loginEmail, loginPassword)
      if (res.success && res.user) {
        toast({
          title: `Bem-vindo(a), ${res.user.name}!`,
          description: "Login realizado com sucesso."
        })
        if (onSuccess) onSuccess(res.user)
        onOpenChange(false)
      } else {
        setErrorMsg(res.error || "E-mail ou senha inválidos.")
      }
    } catch {
      setErrorMsg("Erro de conexão com o servidor.")
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg("")
    try {
      const res = await registerAccount({
        name: regName,
        email: regEmail,
        password: regPassword,
        phone: regPhone,
        document: regDocument
      })
      if (res.success && res.user) {
        toast({
          title: "Conta criada com sucesso! 🎉",
          description: "Você já está conectado."
        })
        if (onSuccess) onSuccess(res.user)
        onOpenChange(false)
      } else {
        setErrorMsg(res.error || "Erro ao cadastrar conta.")
      }
    } catch {
      setErrorMsg("Erro de conexão.")
    } finally {
      setLoading(false)
    }
  }

  const handlePasskeyLogin = async () => {
    setLoading(true)
    setErrorMsg("")
    try {
      const res = await loginWithPasskey(loginEmail)
      if (res.success && res.user) {
        toast({
          title: `Bem-vindo(a), ${res.user.name}! 📱`,
          description: "Autenticado com Biometria / Passkey."
        })
        if (onSuccess) onSuccess(res.user)
        onOpenChange(false)
      } else {
        setErrorMsg(res.error || "Falha na leitura biométrica.")
      }
    } catch {
      setErrorMsg("Erro na autenticação biométrica.")
    } finally {
      setLoading(false)
    }
  }

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg("")
    try {
      const res = await requestPasswordReset(forgotEmail)
      if (res.success) {
        setForgotSuccess(true)
      } else {
        setErrorMsg(res.error || "Erro ao solicitar recuperação.")
      }
    } catch {
      setErrorMsg("Erro de conexão.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
        <DialogHeader className="text-center space-y-1">
          <div className="w-10 h-10 rounded-2xl bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold mx-auto mb-1">
            <Shield className="w-5 h-5" />
          </div>
          <DialogTitle className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            {activeTab === "login" ? "Acessar Minha Conta" : activeTab === "register" ? "Criar Conta de Hóspede" : "Recuperar Senha"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {activeTab === "login" 
              ? "Entre para gerenciar reservas, liberação de garagem e dados cadastrais." 
              : activeTab === "register" 
              ? "Cadastre-se para check-in instantâneo e descontos exclusivos." 
              : "Informe seu e-mail para receber as instruções de recuperação."}
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v: any) => { setActiveTab(v); setErrorMsg(""); }} className="space-y-4 pt-2">
          {activeTab !== "forgot" && (
            <TabsList className="grid grid-cols-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
              <TabsTrigger value="login" className="rounded-xl text-xs font-bold py-2">
                Entrar
              </TabsTrigger>
              <TabsTrigger value="register" className="rounded-xl text-xs font-bold py-2">
                Criar Conta
              </TabsTrigger>
            </TabsList>
          )}

          {/* 1. ABA LOGIN */}
          <TabsContent value="login" className="space-y-4">
            {/* Botão Oficial do Google */}
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleClick}
              disabled={loading}
              className="w-full h-10 rounded-xl font-bold text-xs border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-800 dark:text-slate-200 flex items-center justify-center gap-2.5 shadow-2xs transition-all active:scale-[0.98]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Continuar com o Google</span>
            </Button>

            {/* Botão de Biometria / Passkey */}
            <Button
              type="button"
              variant="outline"
              onClick={handlePasskeyLogin}
              disabled={loading}
              className="w-full h-10 rounded-xl font-bold text-xs border-sky-200 dark:border-sky-800 hover:bg-sky-50 dark:hover:bg-sky-950/40 text-sky-700 dark:text-sky-300 flex items-center justify-center gap-2"
            >
              <Fingerprint className="w-4 h-4 text-sky-600" />
              <span>Entrar com Biometria / Passkey</span>
            </Button>

            <div className="relative flex py-1 items-center">
              <div className="grow border-t border-slate-200 dark:border-slate-800"></div>
              <span className="shrink mx-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider">ou com e-mail</span>
              <div className="grow border-t border-slate-200 dark:border-slate-800"></div>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold">E-mail</Label>
                <Input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="rounded-xl h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-bold">Senha</Label>
                  <button
                    type="button"
                    onClick={() => { setActiveTab("forgot"); setErrorMsg(""); }}
                    className="text-[10px] text-sky-600 font-semibold hover:underline"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
                <Input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="rounded-xl h-9 text-xs"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-10 bg-sky-600 hover:bg-sky-700 text-white font-black text-xs rounded-xl shadow-md shadow-sky-600/20"
              >
                {loading ? "Entrando..." : "Acessar Conta"}
              </Button>
            </form>
          </TabsContent>

          {/* 2. ABA CADASTRO */}
          <TabsContent value="register" className="space-y-3">
            {/* Botão Oficial do Google */}
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleClick}
              disabled={loading}
              className="w-full h-9 rounded-xl font-bold text-xs border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-800 dark:text-slate-200 flex items-center justify-center gap-2.5 shadow-2xs transition-all active:scale-[0.98]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Cadastrar com o Google</span>
            </Button>

            <div className="relative flex py-0.5 items-center">
              <div className="grow border-t border-slate-200 dark:border-slate-800"></div>
              <span className="shrink mx-3 text-[9px] text-slate-400 font-bold uppercase tracking-wider">ou preencha os dados</span>
              <div className="grow border-t border-slate-200 dark:border-slate-800"></div>
            </div>

            <form onSubmit={handleRegisterSubmit} className="space-y-2.5">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Nome Completo *</Label>
                <Input
                  required
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  placeholder="Seu nome"
                  className="rounded-xl h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold">E-mail *</Label>
                <Input
                  type="email"
                  required
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="rounded-xl h-8 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold">WhatsApp *</Label>
                  <Input
                    required
                    value={regPhone}
                    onChange={e => setRegPhone(e.target.value)}
                    placeholder="(22) 99999-9999"
                    className="rounded-xl h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold">CPF</Label>
                  <Input
                    value={regDocument}
                    onChange={e => setRegDocument(e.target.value)}
                    placeholder="000.000.000-00"
                    className="rounded-xl h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Criar Senha * (Mínimo 6 caracteres)</Label>
                <Input
                  type="password"
                  required
                  value={regPassword}
                  onChange={e => setRegPassword(e.target.value)}
                  placeholder="••••••••"
                  className="rounded-xl h-8 text-xs"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-9 bg-sky-600 hover:bg-sky-700 text-white font-black text-xs rounded-xl shadow-md shadow-sky-600/20 mt-1"
              >
                {loading ? "Cadastrando..." : "Concluir Cadastro"}
              </Button>
            </form>
          </TabsContent>

          {/* 3. ABA RECUPERAÇÃO DE SENHA */}
          <TabsContent value="forgot" className="space-y-4">
            {forgotSuccess ? (
              <div className="text-center py-4 space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">E-mail de Recuperação Enviado!</h4>
                <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                  Se o endereço <strong>{forgotEmail}</strong> estiver cadastrado, enviamos as instruções de redefinição de senha para sua caixa de entrada.
                </p>
                <Button
                  onClick={() => { setForgotSuccess(false); setActiveTab("login"); }}
                  variant="outline"
                  className="rounded-xl text-xs font-bold"
                >
                  Voltar para o Login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold">E-mail Cadastrado</Label>
                  <Input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="rounded-xl h-9 text-xs"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl"
                >
                  {loading ? "Enviando..." : "Enviar Link de Recuperação"}
                </Button>

                <button
                  type="button"
                  onClick={() => setActiveTab("login")}
                  className="w-full text-center text-xs text-slate-500 hover:underline pt-1"
                >
                  Lembrou da senha? Voltar para o Login
                </button>
              </form>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

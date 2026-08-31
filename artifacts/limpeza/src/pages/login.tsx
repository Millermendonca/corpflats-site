import { useState } from "react"
import { useLocation } from "wouter"
import { useLogin, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Sparkles, AlertCircle } from "lucide-react"

export default function Login() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const [errorMsg, setErrorMsg] = useState("")
  const { data: user } = useGetMe()

  const getRedirectDateStr = () => {
    const now = new Date()
    let redirectDate = now
    if (now.getHours() >= 18) {
      redirectDate = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    }
    const yyyy = redirectDate.getFullYear()
    const mm = String(redirectDate.getMonth() + 1).padStart(2, '0')
    const dd = String(redirectDate.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  if (user) {
    setTimeout(() => {
      setLocation(`/dashboard?date=${getRedirectDateStr()}`)
    }, 0)
    return null
  }

  const login = useLogin({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetMeQueryKey(), data)
        setLocation(`/dashboard?date=${getRedirectDateStr()}`)
      },
      onError: (err: any) => {
        setErrorMsg(err.message || "Usuário ou senha incorretos.")
      }
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setErrorMsg("Informe seu usuário e senha.")
      return
    }
    setErrorMsg("")
    login.mutate({ data: { username: username.trim(), password } })
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <Card className="w-full max-w-sm shadow-xl border-border/80 rounded-2xl overflow-hidden">
        <CardHeader className="text-center pb-4 pt-6 bg-muted/20 border-b">
          <div className="mx-auto w-12 h-12 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center mb-2 shadow-xs">
            <Sparkles className="w-6 h-6" />
          </div>
          <CardTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Guest Flow</CardTitle>
          <CardDescription className="text-xs">Sistema de Governança & Limpeza</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-xs font-semibold">Usuário</Label>
              <Input
                id="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Ex: admin, Cris, Grazi..."
                autoComplete="username"
                autoCapitalize="none"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Digite sua senha"
                required
              />
            </div>

            {errorMsg && (
              <div className="text-xs text-destructive bg-destructive/10 p-3 rounded-xl border border-destructive/20 flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <Button type="submit" className="w-full font-bold shadow-xs mt-2" disabled={login.isPending}>
              {login.isPending ? "Entrando..." : "Entrar no Sistema"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

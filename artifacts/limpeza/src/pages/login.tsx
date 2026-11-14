import { useState } from "react"
import { useLocation } from "wouter"
import { useLogin, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { AlertCircle } from "lucide-react"
import { CorpFlatsLogo } from "@/components/brand-logo"
import { resolveInitialRouteForUser } from "@/lib/permissions"

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

  const login = useLogin({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetMeQueryKey(), data)
        setLocation(resolveInitialRouteForUser(data as any, getRedirectDateStr()))
      },
      onError: (err: any) => {
        setErrorMsg(err.message || "Usuário ou senha incorretos.")
      }
    }
  })

  if (user) {
    setTimeout(() => {
      setLocation(resolveInitialRouteForUser(user as any, getRedirectDateStr()))
    }, 0)
    return null
  }

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
    <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-[#091E26] via-[#0D2E3A] to-[#091E26] p-4">
      <Card className="w-full max-w-sm shadow-2xl border-[#C5A059]/30 rounded-2xl overflow-hidden bg-card">
        <CardHeader className="text-center pb-5 pt-7 bg-gradient-to-b from-[#091E26] to-[#0F3D4C] border-b border-[#C5A059]/25">
          <div className="mx-auto flex items-center justify-center mb-2">
            <CorpFlatsLogo variant="dark" animated={true} className="w-56 h-auto" />
          </div>
          <CardDescription className="text-[11px] font-semibold uppercase tracking-widest text-[#C5A059]">
            Gestão Hoteleira & Serviços Exclusivos
          </CardDescription>
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

            <Button type="submit" className="w-full font-bold shadow-xs mt-2 bg-[#0F3D4C] hover:bg-[#145266] text-white" disabled={login.isPending}>
              {login.isPending ? "Entrando..." : "Entrar no Sistema"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

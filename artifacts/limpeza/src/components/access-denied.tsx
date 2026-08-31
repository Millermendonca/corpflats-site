import { useLocation } from "wouter"
import { useGetMe, useLogout, getGetMeQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ShieldAlert, LogIn, LayoutDashboard, UserCheck } from "lucide-react"

interface AccessDeniedProps {
  moduleName?: string
}

export function AccessDenied({ moduleName = "este serviço" }: AccessDeniedProps) {
  const [, setLocation] = useLocation()
  const { data: user } = useGetMe()
  const queryClient = useQueryClient()
  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.setQueryData(getGetMeQueryKey(), null)
        setLocation("/login")
      }
    }
  })

  const handleSwitchToAdmin = async () => {
    try {
      await logoutMutation.mutateAsync()
    } catch {
      await fetch("/api/auth/logout", { method: "POST" })
      queryClient.setQueryData(getGetMeQueryKey(), null)
      setLocation("/login")
    }
  }

  return (
    <Shell>
      <div className="min-h-[70vh] flex items-center justify-center p-4 sm:p-6 w-full">
        <Card className="max-w-md w-full rounded-3xl border-2 border-amber-500/30 shadow-xl overflow-hidden text-center bg-card">
          <div className="bg-gradient-to-b from-amber-500/20 via-amber-500/10 to-transparent p-6 sm:p-8 space-y-3">
            <div className="w-16 h-16 bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <ShieldAlert className="w-8 h-8" />
            </div>
            
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              Acesso Restrito ao Administrador
            </h1>
            
            <p className="text-xs text-muted-foreground font-medium max-w-sm mx-auto leading-relaxed">
              Você não possui credenciais válidas com permissão de administrador para acessar <strong className="text-slate-800 dark:text-slate-200">{moduleName}</strong>.
            </p>
          </div>

          <CardContent className="p-6 pt-0 space-y-4">
            {user && (
              <div className="p-3 bg-muted/30 rounded-2xl border text-xs flex items-center justify-between">
                <div className="text-left">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Conta Conectada</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{user.name || user.username}</span>
                </div>
                <Badge variant="outline" className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px] capitalize">
                  Perfil: {user.role === "cleaner" ? "Camareira" : user.role}
                </Badge>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <Button 
                onClick={() => setLocation("/dashboard")}
                className="w-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold h-11 rounded-xl text-xs gap-2"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Ir para Painel de Governança</span>
              </Button>

              <Button 
                variant="outline"
                onClick={handleSwitchToAdmin}
                className="w-full font-bold h-11 rounded-xl text-xs gap-2 text-primary border-primary/30 hover:bg-primary/5"
              >
                <LogIn className="w-4 h-4" />
                <span>Entrar como Administrador</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Shell>
  )
}

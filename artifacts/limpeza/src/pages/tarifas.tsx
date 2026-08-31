import { useState, useEffect } from "react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { 
  Coins, Sparkles, Save, RotateCcw, Coffee, Building2, 
  Layers, Heart, DollarSign, ExternalLink, QrCode
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function TarifasEditor() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<any>(null)

  useEffect(() => {
    fetchRatesConfig()
  }, [])

  const fetchRatesConfig = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/site-content")
      if (res.ok) {
        const data = await res.json()
        setConfig(data)
      }
    } catch (err) {
      console.error("Erro ao carregar tarifas:", err)
      toast({
        title: "Erro ao carregar",
        description: "Não foi possível carregar as tarifas do sistema.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const res = await fetch("/api/site-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      })
      if (res.ok) {
        toast({
          title: "Tarifas atualizadas com sucesso! 💰",
          description: "Os novos valores de diárias, taxas e regras já estão ativos no motor de reservas.",
        })
      } else {
        throw new Error("Falha ao salvar tarifas")
      }
    } catch (err) {
      console.error(err)
      toast({
        title: "Erro ao salvar",
        description: "Ocorreu um erro ao salvar as tarifas no servidor.",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  const handleResetDefaults = () => {
    if (!window.confirm("Deseja restaurar as tarifas para os valores padrão sugeridos?")) return

    const updated = {
      ...config,
      ratePlans: {
        with_breakfast: {
          name: "Com Café Incluso",
          dailyRate: 225,
          cleaningFeeEnabled: false,
          cleaningFeeAmount: 0,
          cleaningFeeType: "per_stay",
          description: "Diária com Café da Manhã servido exclusivamente no flat"
        },
        room_only: {
          name: "Sem Café",
          dailyRate: 190,
          cleaningFeeEnabled: true,
          cleaningFeeAmount: 70,
          cleaningFeeType: "per_stay",
          description: "Tarifa econômica sem café da manhã"
        }
      },
      bedConfig: {
        twinFeeAmount: 30,
        twinFeeType: "per_stay",
        cutoffHour: 12
      },
      extraBedConfig: {
        enabled: true,
        feeAmount: 60,
        feeType: "per_stay",
        cutoffHour: 12,
        maxGuests: 3,
        warningMessage: "Nossos flats são projetados para até 2 pessoas (lotação ideal). Para acomodar com carinho um 3º hóspede, disponibilizamos a montagem de 1 colchonete extra com enxoval completo e higienizado."
      },
      petPolicy: {
        enabled: true,
        feeAmount: 80,
        feeType: "per_stay",
        allowedSpecies: "Cachorros (Cães) de pequeno e médio porte (até 15kg)",
        rules: "• Uso obrigatório de guia/coleira nas áreas sociais do condomínio.\n• Proibido deixar o animal sozinho no flat por longos períodos.\n• O hóspede tutor é responsável pela conservação e integridade do apartamento."
      },
      pricing: {
        directDiscountPercent: 15
      }
    }

    setConfig(updated)
    toast({
      title: "Tarifas Restauradas",
      description: "Valores restaurados. Clique em 'Salvar Alterações' para confirmar.",
    })
  }

  if (loading || !config) {
    return (
      <Shell>
        <div className="p-8 text-center text-slate-500">
          <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium">Carregando painel de tarifas & taxas...</p>
        </div>
      </Shell>
    )
  }

  const withBreakfast = config?.ratePlans?.with_breakfast || {
    name: "Com Café Incluso",
    dailyRate: 225,
    cleaningFeeEnabled: false,
    cleaningFeeAmount: 0,
    cleaningFeeType: "per_stay",
    description: "Diária com Café da Manhã servido exclusivamente no flat"
  }

  const roomOnly = config?.ratePlans?.room_only || {
    name: "Sem Café",
    dailyRate: 190,
    cleaningFeeEnabled: true,
    cleaningFeeAmount: 70,
    cleaningFeeType: "per_stay",
    description: "Tarifa econômica sem café da manhã"
  }

  const bedConfig = config?.bedConfig || {
    twinFeeAmount: 30,
    twinFeeType: "per_stay",
    cutoffHour: 12
  }

  const extraBedConfig = config?.extraBedConfig || {
    enabled: true,
    feeAmount: 60,
    feeType: "per_stay",
    cutoffHour: 12,
    maxGuests: 3,
    warningMessage: "Nossos flats são projetados para até 2 pessoas (lotação ideal). Para acomodar com carinho um 3º hóspede, disponibilizamos a montagem de 1 colchonete extra com enxoval completo e higienizado."
  }

  const petPolicy = config?.petPolicy || {
    enabled: true,
    feeAmount: 80,
    feeType: "per_stay"
  }

  const pricing = config?.pricing || {
    directDiscountPercent: 15
  }

  return (
    <Shell>
      <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6 pb-28">
        {/* Header Superior com Ações Rápidas */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                <Coins className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                Gestão de Tarifas, Preços & Taxas
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Configure os valores das diárias com e sem café, taxas de limpeza, colchonete extra (3º hóspede), camas de solteiro e política pet.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open("/reservar", "_blank")}
              className="text-xs font-bold gap-1.5 h-9 rounded-xl border-slate-300 dark:border-slate-700 hover:bg-slate-100"
            >
              <span>Ver no Motor de Reservas</span>
              <ExternalLink className="w-3 h-3 ml-0.5 opacity-60" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleResetDefaults}
              disabled={saving}
              className="text-xs font-bold gap-1.5 h-9 rounded-xl border-slate-300 dark:border-slate-700 hover:bg-rose-50 hover:text-rose-600 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Padrões</span>
            </Button>

            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs gap-1.5 h-9 px-4 rounded-xl shadow-md transition-all"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? "Salvando..." : "Salvar Tarifas"}</span>
            </Button>
          </div>
        </div>

        {/* Banner Informativo sobre Precificação Dinâmica Inteligente */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-50 to-indigo-50 dark:from-sky-950/40 dark:to-indigo-950/40 border border-sky-200 dark:border-sky-800 flex items-start gap-3 shadow-xs">
          <Sparkles className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <span className="font-bold text-slate-900 dark:text-slate-100 block">
              Pronto para Precificação Dinâmica & Planilhas Inteligentes
            </span>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Esta tela centraliza todos os parâmetros de precificação dos flats. Futuramente, estes valores poderão ser recalculados e sincronizados de forma 100% automatizada a partir da sua planilha de precificação por temporada e taxa de ocupação.
            </p>
          </div>
        </div>

        {/* 1. SEÇÃO DE DIÁRIAS (COM CAFÉ E SEM CAFÉ) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Diária com Café da Manhã */}
          <Card className="rounded-3xl border-amber-200/80 dark:border-amber-900/50 shadow-sm bg-gradient-to-b from-amber-50/20 to-transparent">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold">
                    <Coffee className="w-4 h-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-black text-amber-950 dark:text-amber-200">
                      Diária com Café da Manhã
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Servido exclusivamente e privativamente no flat
                    </CardDescription>
                  </div>
                </div>
                <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-2 py-0.5">
                  R$ {withBreakfast.dailyRate}/noite
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Valor da Diária Base (R$ / noite)</Label>
                <Input
                  type="number"
                  value={withBreakfast.dailyRate ?? 225}
                  onChange={e => {
                    const current = config.ratePlans || {}
                    setConfig({
                      ...config,
                      ratePlans: {
                        ...current,
                        with_breakfast: { ...withBreakfast, dailyRate: Number(e.target.value) }
                      }
                    })
                  }}
                  className="font-black text-sm h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                />
              </div>

              {/* Taxa de Limpeza para este plano */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-bold block">Taxa de Limpeza no Plano com Café</Label>
                    <span className="text-[11px] text-slate-500">Cobrar taxa de limpeza neste regime?</span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={!withBreakfast.cleaningFeeEnabled ? "default" : "outline"}
                      onClick={() => {
                        const current = config.ratePlans || {}
                        setConfig({
                          ...config,
                          ratePlans: {
                            ...current,
                            with_breakfast: { ...withBreakfast, cleaningFeeEnabled: false, cleaningFeeAmount: 0 }
                          }
                        })
                      }}
                      className="text-xs font-bold h-7 px-2.5 rounded-lg"
                    >
                      Isento (Grátis)
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={withBreakfast.cleaningFeeEnabled ? "default" : "outline"}
                      onClick={() => {
                        const current = config.ratePlans || {}
                        setConfig({
                          ...config,
                          ratePlans: {
                            ...current,
                            with_breakfast: { ...withBreakfast, cleaningFeeEnabled: true, cleaningFeeAmount: 70 }
                          }
                        })
                      }}
                      className="text-xs font-bold h-7 px-2.5 rounded-lg"
                    >
                      Cobrar Taxa
                    </Button>
                  </div>
                </div>

                {withBreakfast.cleaningFeeEnabled && (
                  <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold">Valor (R$)</Label>
                      <Input
                        type="number"
                        value={withBreakfast.cleaningFeeAmount ?? 70}
                        onChange={e => {
                          const current = config.ratePlans || {}
                          setConfig({
                            ...config,
                            ratePlans: {
                              ...current,
                              with_breakfast: { ...withBreakfast, cleaningFeeAmount: Number(e.target.value) }
                            }
                          })
                        }}
                        className="text-xs h-8 rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold">Frequência</Label>
                      <select
                        value={withBreakfast.cleaningFeeType || "per_stay"}
                        onChange={e => {
                          const current = config.ratePlans || {}
                          setConfig({
                            ...config,
                            ratePlans: {
                              ...current,
                              with_breakfast: { ...withBreakfast, cleaningFeeType: e.target.value }
                            }
                          })
                        }}
                        className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-xs font-bold"
                      >
                        <option value="per_stay">Por Estadia (1x)</option>
                        <option value="per_night">Por Noite / Diária</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-600">Descrição Comercial no Card</Label>
                <Input
                  value={withBreakfast.description || "Diária com Café da Manhã servido exclusivamente no flat"}
                  onChange={e => {
                    const current = config.ratePlans || {}
                    setConfig({
                      ...config,
                      ratePlans: {
                        ...current,
                        with_breakfast: { ...withBreakfast, description: e.target.value }
                      }
                    })
                  }}
                  className="text-xs h-8 rounded-xl bg-white dark:bg-slate-900"
                />
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Diária Sem Café (Econômica) */}
          <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm bg-gradient-to-b from-slate-50/50 to-transparent">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-slate-700 text-white flex items-center justify-center font-bold">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-black text-slate-900 dark:text-slate-100">
                      Diária Sem Café (Tarifa Econômica)
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Apenas hospedagem em flat completo e climatizado
                    </CardDescription>
                  </div>
                </div>
                <Badge className="bg-slate-800 text-white font-bold text-xs px-2 py-0.5">
                  R$ {roomOnly.dailyRate}/noite
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Valor da Diária Base (R$ / noite)</Label>
                <Input
                  type="number"
                  value={roomOnly.dailyRate ?? 190}
                  onChange={e => {
                    const current = config.ratePlans || {}
                    setConfig({
                      ...config,
                      ratePlans: {
                        ...current,
                        room_only: { ...roomOnly, dailyRate: Number(e.target.value) }
                      }
                    })
                  }}
                  className="font-black text-sm h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                />
              </div>

              {/* Taxa de Limpeza para este plano */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-bold block">Taxa de Limpeza no Plano Sem Café</Label>
                    <span className="text-[11px] text-slate-500">Cobrada 1x por estadia para higienização</span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={roomOnly.cleaningFeeEnabled !== false ? "default" : "outline"}
                      onClick={() => {
                        const current = config.ratePlans || {}
                        setConfig({
                          ...config,
                          ratePlans: {
                            ...current,
                            room_only: { ...roomOnly, cleaningFeeEnabled: true, cleaningFeeAmount: 70 }
                          }
                        })
                      }}
                      className="text-xs font-bold h-7 px-2.5 rounded-lg"
                    >
                      Cobrar Taxa
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={roomOnly.cleaningFeeEnabled === false ? "default" : "outline"}
                      onClick={() => {
                        const current = config.ratePlans || {}
                        setConfig({
                          ...config,
                          ratePlans: {
                            ...current,
                            room_only: { ...roomOnly, cleaningFeeEnabled: false, cleaningFeeAmount: 0 }
                          }
                        })
                      }}
                      className="text-xs font-bold h-7 px-2.5 rounded-lg"
                    >
                      Isento
                    </Button>
                  </div>
                </div>

                {roomOnly.cleaningFeeEnabled !== false && (
                  <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold">Valor (R$)</Label>
                      <Input
                        type="number"
                        value={roomOnly.cleaningFeeAmount ?? 70}
                        onChange={e => {
                          const current = config.ratePlans || {}
                          setConfig({
                            ...config,
                            ratePlans: {
                              ...current,
                              room_only: { ...roomOnly, cleaningFeeAmount: Number(e.target.value) }
                            }
                          })
                        }}
                        className="text-xs h-8 rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold">Frequência</Label>
                      <select
                        value={roomOnly.cleaningFeeType || "per_stay"}
                        onChange={e => {
                          const current = config.ratePlans || {}
                          setConfig({
                            ...config,
                            ratePlans: {
                              ...current,
                              room_only: { ...roomOnly, cleaningFeeType: e.target.value }
                            }
                          })
                        }}
                        className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-xs font-bold"
                      >
                        <option value="per_stay">Por Estadia (1x)</option>
                        <option value="per_night">Por Noite / Diária</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-600">Descrição Comercial no Card</Label>
                <Input
                  value={roomOnly.description || "Tarifa econômica sem café da manhã"}
                  onChange={e => {
                    const current = config.ratePlans || {}
                    setConfig({
                      ...config,
                      ratePlans: {
                        ...current,
                        room_only: { ...roomOnly, description: e.target.value }
                      }
                    })
                  }}
                  className="text-xs h-8 rounded-xl bg-white dark:bg-slate-900"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 2. SEÇÃO DE TAXAS ADICIONAIS & SERVIÇOS ESPECIAIS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Taxa de Colchonete Extra (3º Hóspede) */}
          <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-sky-100 dark:bg-sky-950 text-sky-600 flex items-center justify-center font-bold">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-black">Colchonete 3º Hóspede</CardTitle>
                    <CardDescription className="text-[11px]">Enxoval completo e higienizado</CardDescription>
                  </div>
                </div>
                <Badge className="bg-sky-100 text-sky-800 font-bold text-[10px]">
                  R$ {extraBedConfig.feeAmount}/estadia
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Valor da Taxa (R$)</Label>
                <Input
                  type="number"
                  value={extraBedConfig.feeAmount ?? 60}
                  onChange={e => {
                    const current = config.extraBedConfig || {}
                    setConfig({
                      ...config,
                      extraBedConfig: { ...current, feeAmount: Number(e.target.value) }
                    })
                  }}
                  className="font-bold h-9 rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Frequência</Label>
                <select
                  value={extraBedConfig.feeType || "per_stay"}
                  onChange={e => {
                    const current = config.extraBedConfig || {}
                    setConfig({
                      ...config,
                      extraBedConfig: { ...current, feeType: e.target.value }
                    })
                  }}
                  className="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 text-xs font-bold"
                >
                  <option value="per_stay">Taxa Única por Estadia</option>
                  <option value="per_night">Por Diária / Noite</option>
                </select>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 leading-tight">
                ⏰ <strong>Horário de Corte:</strong> Reservas para o mesmo dia feitas após as <strong>12:00</strong> desativam automaticamente a opção de 3º hóspede.
              </div>
            </CardContent>
          </Card>

          {/* Taxa de 2 Camas de Solteiro (Configuração Twin) */}
          <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center font-bold">
                    🛏️
                  </div>
                  <div>
                    <CardTitle className="text-sm font-black">2 Camas de Solteiro</CardTitle>
                    <CardDescription className="text-[11px]">Montagem com lençóis individuais</CardDescription>
                  </div>
                </div>
                <Badge className="bg-indigo-100 text-indigo-800 font-bold text-[10px]">
                  R$ {bedConfig.twinFeeAmount}/estadia
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Valor da Taxa (R$)</Label>
                <Input
                  type="number"
                  value={bedConfig.twinFeeAmount ?? 30}
                  onChange={e => {
                    const current = config.bedConfig || {}
                    setConfig({
                      ...config,
                      bedConfig: { ...current, twinFeeAmount: Number(e.target.value) }
                    })
                  }}
                  className="font-bold h-9 rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Frequência</Label>
                <select
                  value={bedConfig.twinFeeType || "per_stay"}
                  onChange={e => {
                    const current = config.bedConfig || {}
                    setConfig({
                      ...config,
                      bedConfig: { ...current, twinFeeType: e.target.value }
                    })
                  }}
                  className="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 text-xs font-bold"
                >
                  <option value="per_stay">Taxa Única por Estadia</option>
                  <option value="per_night">Por Diária / Noite</option>
                </select>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 leading-tight">
                ⏰ <strong>Horário de Corte:</strong> Reservas para hoje após as <strong>12:00</strong> desativam 2 camas de solteiro (apenas Queen).
              </div>
            </CardContent>
          </Card>

          {/* Taxa Pet Friendly */}
          <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 flex items-center justify-center font-bold">
                    <Heart className="w-4 h-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-black">Taxa Pet Friendly</CardTitle>
                    <CardDescription className="text-[11px]">Higienização especial para cães</CardDescription>
                  </div>
                </div>
                <Badge className="bg-rose-100 text-rose-800 font-bold text-[10px]">
                  R$ {petPolicy.feeAmount}/pet
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Valor da Taxa Pet (R$ / pet)</Label>
                <Input
                  type="number"
                  value={petPolicy.feeAmount ?? 80}
                  onChange={e => {
                    const current = config.petPolicy || {}
                    setConfig({
                      ...config,
                      petPolicy: { ...current, feeAmount: Number(e.target.value) }
                    })
                  }}
                  className="font-bold h-9 rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Frequência</Label>
                <select
                  value={petPolicy.feeType || "per_stay"}
                  onChange={e => {
                    const current = config.petPolicy || {}
                    setConfig({
                      ...config,
                      petPolicy: { ...current, feeType: e.target.value }
                    })
                  }}
                  className="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 text-xs font-bold"
                >
                  <option value="per_stay">Taxa Única por Estadia</option>
                  <option value="per_night">Por Diária / Noite</option>
                </select>
              </div>

              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-[11px] text-rose-900 dark:text-rose-200 leading-tight">
                🐕 Permitido apenas <strong>Cães</strong> até 15kg com aceite de regulamento no checkout.
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 3. DESCONTO DE RESERVA DIRETA */}
        <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-black flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                  Desconto de Reserva Direta no Site Oficial
                </CardTitle>
                <CardDescription className="text-xs">
                  Incentivo aplicado automaticamente para os clientes que reservam pelo site oficial em vez de OTAs (Airbnb/Booking).
                </CardDescription>
              </div>
              <Badge className="bg-emerald-100 text-emerald-800 font-bold text-xs">
                {pricing.directDiscountPercent || 15}% OFF Ativo
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
              <div className="space-y-2 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-900 dark:text-slate-100">Desconto de Reserva Direta (%)</Label>
                  <Badge className="bg-sky-100 text-sky-800 font-bold text-[10px]">{pricing.directDiscountPercent ?? 15}% OFF</Badge>
                </div>
                <div className="relative max-w-xs">
                  <Input
                    type="number"
                    value={pricing.directDiscountPercent ?? 15}
                    onChange={e => {
                      const current = config.pricing || {}
                      setConfig({
                        ...config,
                        pricing: { ...current, directDiscountPercent: Number(e.target.value) }
                      })
                    }}
                    className="font-black text-sm h-10 rounded-xl pr-8"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-black text-slate-400">%</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Desconto aplicado sobre o valor base da diária em comparação com Booking e Airbnb.
                </p>
              </div>

              <div className="space-y-2 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-black text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-emerald-600" />
                    <span>Desconto Especial PIX Instantâneo (%)</span>
                  </Label>
                  <Badge className="bg-emerald-600 text-white font-black text-[10px] animate-pulse">
                    ⚡ {pricing.pixDiscountPercent ?? 5}% OFF no PIX
                  </Badge>
                </div>
                <div className="relative max-w-xs">
                  <Input
                    type="number"
                    value={pricing.pixDiscountPercent ?? 5}
                    onChange={e => {
                      const current = config.pricing || {}
                      setConfig({
                        ...config,
                        pricing: { ...current, pixDiscountPercent: Number(e.target.value) }
                      })
                    }}
                    className="font-black text-sm h-10 rounded-xl pr-12 border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-black text-emerald-600">% OFF</span>
                </div>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-400 leading-tight">
                  Deixa a opção no PIX 5% mais barata que no cartão, tornando o fechamento por PIX irresistível para o hóspede.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Shell>
  )
}

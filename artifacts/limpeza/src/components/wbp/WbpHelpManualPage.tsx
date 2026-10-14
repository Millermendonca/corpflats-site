import React, { useState } from "react";
import { 
  BookOpen, 
  ShieldCheck, 
  HelpCircle, 
  AlertTriangle, 
  CheckCircle2, 
  Server, 
  Key, 
  Lock, 
  Layers, 
  Building2, 
  Coffee, 
  CreditCard, 
  DollarSign, 
  Activity, 
  Sparkles,
  Inbox,
  Workflow,
  Search,
  ExternalLink,
  ChevronRight,
  FileCode2,
  Terminal,
  Send,
  Radio,
  FileText,
  Bell,
  MessageSquare,
  ThumbsUp,
  Image as ImageIcon
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const WbpHelpManualPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState<string>("admin");
  const [errorSearch, setErrorSearch] = useState<string>("");

  const errorCodesList = [
    {
      code: "4",
      message: "System error",
      cause: "Instabilidade temporária, manutenção de infraestrutura ou timeout nos servidores da WebBookingPro.",
      remedy: "O PMS enfileira automaticamente a mensagem com retry exponencial e backoff inteligente. Verifique o indicador de saúde de conexão no topo da Caixa de Entrada OTA.",
      severity: "warning"
    },
    {
      code: "1001",
      message: "Invalid credentials",
      cause: "O Company ID (cid), o shared_secret ou a assinatura criptográfica SHA-1 enviada no cabeçalho é inválida ou expirou.",
      remedy: "Verifique as variáveis de ambiente WBP_CID e WBP_SHARED_SECRET no painel de administração ou variáveis do Render. Certifique-se de que não há espaços em branco no início ou fim das chaves.",
      severity: "danger"
    },
    {
      code: "1002",
      message: "Hotel not found",
      cause: "O identificador da propriedade (wbp_property_id) não está cadastrado ou foi desativado no inventário da WebBookingPro.",
      remedy: "Confirme com o suporte da WebBookingPro se a propriedade do CorpFlats Soho Residence (19 flats) está ativada e se o ID da propriedade corresponde exatamente ao configurado no PMS.",
      severity: "danger"
    },
    {
      code: "1003",
      message: "Room or rate not mapped",
      cause: "Um código de quarto (room_type) ou plano tarifário (rate_plan) enviado no payload de ARI não possui de/para no channel manager.",
      remedy: "No CorpFlats, o quarto canônico é 'flat' e os dois planos são 'sem_cafe' e 'com_cafe'. Acesse o painel da WebBookingPro e certifique-se de que os anúncios da Booking e Airbnb apontam para esses códigos.",
      severity: "warning"
    },
    {
      code: "1004",
      message: "Invalid rate plan / room mapping",
      cause: "O plano tarifário especificado não está vinculado ao tipo de acomodação na matriz da WebBookingPro.",
      remedy: "Confirme na tela de mapeamento da WBP se 'sem_cafe' e 'com_cafe' estão ambos associados à categoria 'flat'.",
      severity: "warning"
    },
    {
      code: "1031",
      message: "Integration disabled",
      cause: "A integração XML da propriedade está desativada no channel manager ou o interruptor geral do PMS está no modo 'Desligado'.",
      remedy: "No PMS, altere o modo de 'Desligado' para 'Somente Observar' ou 'Automático' pelo cabeçalho da Caixa de Entrada OTA. Na WebBookingPro, solicite a liberação do switch XML.",
      severity: "warning"
    },
    {
      code: "1100",
      message: "Invalid date range",
      cause: "Data final anterior à data inicial ou formato ISO incompatível.",
      remedy: "O PMS formata automaticamente todas as datas no padrão AAAA-MM-DD com end_date inclusivo. Verifique se o relógio do servidor está sincronizado via NTP.",
      severity: "warning"
    },
    {
      code: "1101",
      message: "Past date modification rejected",
      cause: "Tentativa de enviar disponibilidade ou tarifa para datas passadas já encerradas.",
      remedy: "O PMS filtra o envio de ARI apenas para a data corrente em diante (hoje até 31/12 do ano seguinte).",
      severity: "warning"
    },
    {
      code: "1102",
      message: "ARI validation error",
      cause: "O payload XML/JSON de ARI violou o schema da API (ex: end_date menor que start_date, tarifa negativa ou formato de data incorreto).",
      remedy: "O motor de ARI do Guest-Flow-Manager já garante end_date inclusivo e bloqueia tarifas abaixo do piso. Revise se há bloqueios manuais ou ordens de manutenção com períodos anômalos.",
      severity: "warning"
    },
    {
      code: "9203",
      message: "Rate below minimum floor",
      cause: "A tarifa líquida enviada está abaixo do piso mínimo cadastrado no canal ou da Tarifa Mínima Sustentável (R$ 276,63).",
      remedy: "A Trava de Piso do PMS impede o envio de tarifas abaixo de R$ 276,63. Verifique se foram aplicados descontos excessivos na aba 'Tarifário & Sazonalidade' ou no canal.",
      severity: "danger"
    }
  ];

  const filteredErrors = errorCodesList.filter(e => 
    !errorSearch.trim() || 
    e.code.includes(errorSearch) || 
    e.message.toLowerCase().includes(errorSearch.toLowerCase()) ||
    e.cause.toLowerCase().includes(errorSearch.toLowerCase()) ||
    e.remedy.toLowerCase().includes(errorSearch.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-20">
      {/* Manual Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                Manual da Integração WebBookingPro
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Guia oficial de operação, rotinas da recepção, precificação SEBRAE e códigos de erro
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-semibold">
            Versão R9 • CorpFlats Soho
          </Badge>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeSection} onValueChange={setActiveSection} className="space-y-6">
        <TabsList className="bg-muted/70 p-1 rounded-xl h-auto flex flex-wrap gap-1 border border-border/60">
          <TabsTrigger value="admin" className="text-xs py-2 px-4 gap-1.5 font-bold data-[state=active]:bg-background data-[state=active]:shadow-xs">
            <Server className="w-3.5 h-3.5" />
            1. Guia do Administrador
          </TabsTrigger>
          <TabsTrigger value="errors" className="text-xs py-2 px-4 gap-1.5 font-bold data-[state=active]:bg-background data-[state=active]:shadow-xs text-rose-600 dark:text-rose-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            2. Códigos de Erro WBP
          </TabsTrigger>
          <TabsTrigger value="reception" className="text-xs py-2 px-4 gap-1.5 font-bold data-[state=active]:bg-background data-[state=active]:shadow-xs text-emerald-600 dark:text-emerald-400">
            <Inbox className="w-3.5 h-3.5" />
            3. Guia da Recepção & Pagamentos
          </TabsTrigger>
          <TabsTrigger value="screens" className="text-xs py-2 px-4 gap-1.5 font-bold data-[state=active]:bg-background data-[state=active]:shadow-xs">
            <Sparkles className="w-3.5 h-3.5" />
            4. Capturas Reais da Interface
          </TabsTrigger>
        </TabsList>

        {/* Section 1: Guia do Administrador */}
        <TabsContent value="admin" className="space-y-6 mt-0">
          {/* Card 1.1: Credenciais & Setup */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                <CardTitle className="text-base font-bold text-foreground">
                  1.1. Obtenção de Credenciais e Configuração de Ambiente
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Procedimento para habilitar e conectar a API Build-To-Us da WebBookingPro
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs leading-relaxed text-foreground/90">
              <p>
                Para conectar o <strong>Guest-Flow-Manager</strong> à WebBookingPro, a diretoria do CorpFlats deve solicitar formalmente a adesão ao programa de conectividade através do canal oficial de parceiros:
              </p>
              <div className="p-3 bg-muted/40 rounded-xl border border-border/60 flex items-center justify-between">
                <div>
                  <span className="font-bold text-foreground block">Portal Oficial de Parceria WBP:</span>
                  <a 
                    href="https://www.webbookingpro.com/become-a-partner/" 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-primary hover:underline font-mono text-[11px] inline-flex items-center gap-1 mt-0.5"
                  >
                    https://www.webbookingpro.com/become-a-partner/
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <Badge variant="outline" className="text-[10px]">Canal Oficial</Badge>
              </div>
              <p>
                Durante o credenciamento, a equipe de engenharia da WebBookingPro agenda alinhamentos quinzenais de status técnico para homologação dos endpoints de callback e validação de schema. Eles fornecerão as credenciais para o ambiente de testes e posteriormente de produção:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li><strong className="text-foreground">Company ID (cid):</strong> Identificador único da conta hoteleira na WBP (ex: <code className="font-mono text-foreground">corpflats_soho</code>).</li>
                <li><strong className="text-foreground">Shared Secret:</strong> Chave secreta compartilhada para assinatura criptográfica HMAC/SHA-1 de saída e validação de requisições de callback no PMS.</li>
                <li><strong className="text-foreground">Property ID & Senha:</strong> Identificador do condomínio Soho Residence (19 flats).</li>
                <li><strong className="text-foreground">Simulador Local (Sandbox):</strong> O sistema dispõe do simulador completo em <code className="font-mono text-foreground">e2e/wbp-simulator</code> permitindo testar todos os cenários sem envio externo de dados.</li>
              </ul>
              <div className="p-3 bg-muted/40 rounded-xl font-mono text-[11px] border border-border/60 space-y-1">
                <span className="text-muted-foreground block font-bold text-[10px] uppercase">
                  Variáveis de Ambiente Obrigatórias (Painel Render / .env):
                </span>
                <div>WBP_CID=corpflats_soho</div>
                <div>WBP_SHARED_SECRET=chave_secreta_sha1_wbp</div>
                <div>WBP_PROPERTY_ID=soho_campos_19</div>
                <div>WBP_PROPERTY_PASSWORD=senha_propriedade</div>
                <div>CREDIT_CARD_VAULT_KEY=chave_de_32_bytes_para_aes_256_gcm</div>
              </div>
            </CardContent>
          </Card>

          {/* Card 1.2: Mapeamento de Quartos e Planos */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                <CardTitle className="text-base font-bold text-foreground">
                  1.2. Mapeamento Canônico de Quartos e Planos Tarifários
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Estrutura de estoque compartilhado nos 19 flats do Soho Residence
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs leading-relaxed text-foreground/90">
              <p>
                O empreendimento possui <strong>19 unidades habitacionais individuais</strong>, gerenciadas de forma unificada sob <strong>1 tipo de quarto canônico</strong> e <strong>2 planos tarifários</strong>:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="p-3.5 bg-muted/30 border border-border/70 rounded-xl space-y-1">
                  <span className="font-bold text-foreground text-sm flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-emerald-600" />
                    Quarto Canônico: Flat (código: flat)
                  </span>
                  <p className="text-muted-foreground text-[11px]">
                    Estoque compartilhado de 19 flats. Qualquer reserva em qualquer flat reduz automaticamente a disponibilidade de todos os planos anunciados para aquelas noites.
                  </p>
                </div>

                <div className="p-3.5 bg-muted/30 border border-border/70 rounded-xl space-y-1">
                  <span className="font-bold text-foreground text-sm flex items-center gap-1.5">
                    <Coffee className="w-4 h-4 text-amber-600" />
                    Planos: Sem Café e Com Café
                  </span>
                  <p className="text-muted-foreground text-[11px]">
                    <strong>Sem café (sem_cafe):</strong> Tarifa base do motor SEBRAE.<br />
                    <strong>Com café (com_cafe):</strong> Tarifa base + adicional por hóspede/noite (padrão R$ 25,00/pessoa), enviado proporcionalmente nos campos de ocupação (rate, rdef_single, adult_1, adult_2).
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 1.3: Modos de Operação & Sandbox */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-sky-600" />
                <CardTitle className="text-base font-bold text-foreground">
                  1.3. Modos de Operação (Interruptor Geral) e Homologação Sandbox
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Garantia de segurança operacional sem impacto na operação existente
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs leading-relaxed text-foreground/90">
              <p>
                A integração opera sob um interruptor mestre com 3 modos rigorosamente isolados:
              </p>
              <div className="space-y-2">
                <div className="p-3 bg-muted/20 border border-border/60 rounded-xl">
                  <strong className="text-foreground">1. Desligado (off):</strong> Padrão de fábrica. Nenhuma chamada de saída é realizada, nenhum agendador roda em segundo plano e callbacks respondem como não habilitados. O sistema se comporta exatamente como antes da integração.
                </div>
                <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800 rounded-xl">
                  <strong className="text-amber-950 dark:text-amber-200">2. Somente Observar (observe):</strong> Recebe e grava todos os payloads das OTAs de forma durável fora do blob principal. Exibe tudo na Caixa de Entrada OTA, mas NÃO cria reservas reais no calendário e NÃO dispara automações de WhatsApp ou e-mail. Permite acompanhar as vendas das OTAs em segurança.
                </div>
                <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-500/40 rounded-xl">
                  <strong className="text-emerald-950 dark:text-emerald-200">3. Automático (auto):</strong> Operação autônoma de produção. Aloca flats livres pelo algoritmo fair-share, vincula reservas manuais pré-existentes, envia ARI incremental em segundos e dispara automações da estadia (com exclusão estrita de PIX).
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 1.4: Precificação SEBRAE e Travas */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                <CardTitle className="text-base font-bold text-foreground">
                  1.4. Precificação SEBRAE e Travas Operacionais
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Custo UH R$ 149,38, Tarifa Mínima R$ 276,63 e as 3 travas invioláveis
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs leading-relaxed text-foreground/90">
              <p>
                A metodologia SEBRAE foi ajustada para eliminar a duplicidade histórica de comissões (que antes aparecia como custo fixo em R$ e também no divisor):
              </p>
              <div className="p-3 bg-muted/30 rounded-xl space-y-1 font-mono text-[11px]">
                <div>• Custo Fixo por Diária Vendida (65% ocupação): R$ 101,62</div>
                <div>• Custos Variáveis por UH (Limpeza R$ 23,25 + Enxoval R$ 15,51 + Energia R$ 9,00): R$ 47,76</div>
                <div className="font-bold text-emerald-700 dark:text-emerald-400">• Total Custo por UH: R$ 149,38</div>
                <div>• Divisor de Marcação: 1 - Comissão 15% - Margem 25% - Imposto 6% = 0,54</div>
                <div className="font-bold text-emerald-700 dark:text-emerald-400">• Tarifa Mínima Sustentável: 149,38 ÷ 0,54 = R$ 276,63 (✓ fecha 100%)</div>
              </div>
              <div className="space-y-1.5 pt-1">
                <strong className="text-foreground">As 3 Travas do Sistema:</strong>
                <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                  <li><strong>Trava de Piso:</strong> O sistema rejeita o envio de qualquer tarifa inferior a R$ 276,63 (ou piso manual superior).</li>
                  <li><strong>Trava de Variação (30%):</strong> Qualquer oscilação brusca superior a 30% em relação ao último valor enviado fica retida até confirmação expressa do administrador.</li>
                  <li><strong>Publicação em Rascunho (Staged):</strong> Alterações em parâmetros de custos e tarifas não são enviadas às OTAs até que o administrador aprove na aba "Pré-visualização & Publicar".</li>
                </ol>
              </div>
            </CardContent>
          </Card>

          {/* Card 1.5: Cofre de Cartões PCI-DSS */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-rose-600" />
                <CardTitle className="text-base font-bold text-foreground">
                  1.5. Cofre de Cartões de Crédito Criptografado (PCI-DSS R6)
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Armazenamento isolado, descarte irrevogável de CVV e auditoria
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs leading-relaxed text-foreground/90">
              <p>
                Em conformidade rigorosa com a norma internacional PCI-DSS v4.0 e o requisito R6:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li><strong className="text-foreground">Zero CVV:</strong> O código de segurança (CVV/CVC) é permanentemente descartado em memória no momento do recebimento. Nunca é gravado em disco, banco ou logs.</li>
                <li><strong className="text-foreground">Criptografia AES-256-GCM:</strong> Os 16 dígitos do cartão e data de expiração são cifrados com chave isolada em variável de ambiente (CREDIT_CARD_VAULT_KEY).</li>
                <li><strong className="text-foreground">Reautenticação de Administrador:</strong> Para visualizar o cartão, o administrador deve redigitar sua senha pessoal, gerando um token descartável com validade rígida de 5 minutos.</li>
                <li><strong className="text-foreground">Expurgo Automático:</strong> Os dados do cartão são apagados de forma irreversível 7 dias após o check-out do hóspede ou imediatamente em caso de cancelamento sem penalidade.</li>
              </ul>
            </CardContent>
          </Card>

          {/* Card 1.6: Conciliação Inicial e Checklist de Go-Live */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
              <div className="flex items-center gap-2">
                <Workflow className="w-5 h-5 text-indigo-600" />
                <CardTitle className="text-base font-bold text-foreground">
                  1.6. Conciliação Inicial e Checklist de Entrada em Produção (Go-Live)
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Procedimento obrigatório antes de ativar o modo Automático
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs leading-relaxed text-foreground/90">
              <p>
                Antes de colocar a integração no modo <strong>Automático</strong>, execute o checklist operacional de transição segura:
              </p>
              <div className="p-3 bg-muted/30 rounded-xl space-y-2">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</span>
                  <div>
                    <strong>Gerar Relatório de Conciliação Inicial:</strong> Acesse <code className="font-mono text-foreground">GET /api/wbp/reconciliation/report</code> para analisar o cruzamento entre as reservas manuais pré-existentes e o inventário das OTAs.
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</span>
                  <div>
                    <strong>Vinculação Segura (Matching):</strong> O motor identifica correspondências exatas (<code className="font-mono text-foreground">canal idêntico</code> + <code className="font-mono text-foreground">check-in/out idênticos</code> + <code className="font-mono text-foreground">similaridade de nome ≥ 80%</code>) e vincula sem duplicar ou alterar tarifas da reserva existente.
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">3</span>
                  <div>
                    <strong>Quarentena de Casos Ambíguos:</strong> Qualquer reserva com divergência de datas, nomes parciais ou flat indisponível vai para a Quarentena da Caixa de Entrada OTA para conferência do gestor.
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">4</span>
                  <div>
                    <strong>Disparo da Carga Inicial de ARI:</strong> Clicar no botão "Sincronizar ARI" no topo da Caixa de Entrada OTA para enviar a carga completa de disponibilidade e tarifas desde a data atual até 31 de dezembro do ano subsequente.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 1.7: Configuração de Alertas Críticos e Resumo Diário */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-600" />
                <CardTitle className="text-base font-bold text-foreground">
                  1.7. Central de Alertas Críticos e Resumo Diário (08:00)
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Notificações imediatas via WhatsApp, E-mail e painel do sistema
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs leading-relaxed text-foreground/90">
              <p>
                O sistema monitora eventos críticos e despacha alertas imediatos para a gerência:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3 bg-muted/20 border border-border/60 rounded-xl space-y-1">
                  <span className="font-bold text-foreground flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    4 Eventos Críticos Imediatos:
                  </span>
                  <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                    <li>Reserva retida na Quarentena</li>
                    <li>Overbooking detectado (0 flats livres)</li>
                    <li>Falha contínua de envio de ARI &gt; 15 min</li>
                    <li>Tarifa retida pela Trava de Variação (&gt;30%)</li>
                  </ul>
                </div>

                <div className="p-3 bg-muted/20 border border-border/60 rounded-xl space-y-1">
                  <span className="font-bold text-foreground flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-emerald-600" />
                    Resumo Diário às 08:00:
                  </span>
                  <p className="text-muted-foreground text-[11px]">
                    Disparo diário pontual com total de reservas recebidas nas últimas 24h, cancelamentos, status de ocupação e pendências abertas na quarentena.
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Cada gestor pode habilitar ou desabilitar canais específicos (WhatsApp e/ou E-mail) individualmente através de caixas de seleção na Central de Notificações (/notificacoes).
              </p>
            </CardContent>
          </Card>

          {/* Card 1.8: Mensagens e Avaliações (Adaptador Provisório) */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-sky-600" />
                <CardTitle className="text-base font-bold text-foreground">
                  1.8. Mensagens e Avaliações (Adaptador Provisório R7)
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Integração modular de mensageria com o chat WhatsApp e Review Insights
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs leading-relaxed text-foreground/90">
              <p>
                Como a especificação da API oficial da WebBookingPro para mensagens com hóspedes (<code className="font-mono text-foreground">GetMessages / SendMessage</code>) e respostas de avaliações (<code className="font-mono text-foreground">GetReviews / RespondReview</code>) possui lacunas contratuais em homologação:
              </p>
              <div className="p-3 bg-muted/30 border border-border/60 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Isolamento por Adaptador:
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Os módulos foram implementados atrás de uma interface adaptadora isolada (<code className="font-mono text-foreground">provisional.mjs</code>), <strong>desligados por padrão</strong>. Quando ativados, conectam-se de forma transparente ao Chat do WhatsApp existente e ao painel de Review Insights sem risco de instabilidade.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Section 2: Tabela de Códigos de Erro da WebBookingPro */}
        <TabsContent value="errors" className="space-y-6 mt-0">
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                  <div>
                    <CardTitle className="text-base font-bold text-foreground">
                      Tabela de Diagnóstico e Resolução de Códigos de Erro WBP
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Consulte a causa provável e a ação corretiva imediata para cada código retornado pela API
                    </CardDescription>
                  </div>
                </div>

                <div className="relative w-full sm:w-60">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar código ou palavra..."
                    value={errorSearch}
                    onChange={(e) => setErrorSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-background border border-border"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border text-muted-foreground">
                      <th className="text-center py-2.5 px-3 w-16 font-bold">Código</th>
                      <th className="text-left py-2.5 px-3 w-40 font-bold">Mensagem WBP</th>
                      <th className="text-left py-2.5 px-4 font-bold">Causa Provável</th>
                      <th className="text-left py-2.5 px-4 font-bold">Ação Corretiva no Guest-Flow-Manager</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-sans">
                    {filteredErrors.map((err) => (
                      <tr key={err.code} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-3 text-center">
                          <span className="font-mono font-black text-rose-600 dark:text-rose-400 text-xs px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900">
                            {err.code}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-foreground">
                          {err.message}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground leading-relaxed">
                          {err.cause}
                        </td>
                        <td className="py-3 px-4 font-medium text-foreground leading-relaxed">
                          {err.remedy}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Section 3: Guia Operacional da Recepção */}
        <TabsContent value="reception" className="space-y-6 mt-0">
          {/* Card: Rotina Diária */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
              <div className="flex items-center gap-2">
                <Inbox className="w-5 h-5 text-primary" />
                <CardTitle className="text-base font-bold text-foreground">
                  3.1. Rotina Diária da Recepção
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Passo a passo no início e ao longo de cada turno
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs leading-relaxed text-foreground/90">
              <ol className="list-decimal pl-5 space-y-2">
                <li>
                  <strong>Abertura do Turno:</strong> Ao assumir o plantão na recepção, acesse a <strong>Caixa de Entrada OTA</strong> pelo menu lateral ou pelo topo da tela.
                </li>
                <li>
                  <strong>Verificar Badge de Quarentena:</strong> Se o contador da Quarentena estiver maior que zero (badge vermelho), abra imediatamente o filtro "Quarentena" para resolver as pendências.
                </li>
                <li>
                  <strong>Conferir Alocações no Mapa:</strong> Verifique as reservas com status "Importada" e confira os números dos flats atribuídos no Livro de Reservas (/reservas).
                </li>
                <li>
                  <strong>Identificar Pagamentos:</strong> Olhe atentamente a coluna "Pagamento" para separar os hóspedes que já pagaram à OTA daqueles que pagarão no balcão.
                </li>
              </ol>
            </CardContent>
          </Card>

          {/* Card: Regra de Ouro de Pagamentos */}
          <Card className="border-emerald-500/40 shadow-xs bg-emerald-50/10 dark:bg-emerald-950/10">
            <CardHeader className="pb-3 border-b border-emerald-300 dark:border-emerald-800/40 bg-emerald-500/10">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                <CardTitle className="text-base font-bold text-emerald-950 dark:text-emerald-200">
                  3.2. A Regra de Ouro de Pagamentos: Channel vs Property
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
                Atenção absoluta para nunca cobrar um hóspede em duplicidade!
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-xs leading-relaxed">
              {/* PaymentCollect = Channel */}
              <div className="p-4 bg-card border-2 border-emerald-500/60 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-black text-sm text-emerald-700 dark:text-emerald-400">
                    SITUAÇÃO 1: PaymentCollect = Channel (PAGO PELA OTA)
                  </span>
                  <Badge className="bg-emerald-600 text-white font-bold text-[10px]">PAGO</Badge>
                </div>
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-lg text-rose-900 dark:text-rose-200 font-bold">
                  ⛔ NUNCA COBRAR AS DIÁRIAS DO HÓSPEDE NO BALCÃO DA RECEPÇÃO!
                </div>
                <p className="text-muted-foreground">
                  O valor integral da hospedagem já foi cobrado diretamente pela Booking.com ou pelo Airbnb no cartão do cliente. A OTA repassará o valor líquido ao hotel via cartão virtual (VCC) ou depósito bancário programado.
                </p>
                <div className="text-[11px] text-foreground font-semibold">
                  O que cobrar no check-in/out: Apenas consumos extras e adicionais não inclusos na reserva original (café avulso, taxa de pet, estadias adicionais).
                </div>
              </div>

              {/* PaymentCollect = Property */}
              <div className="p-4 bg-card border-2 border-amber-500/60 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-black text-sm text-amber-700 dark:text-amber-400">
                    SITUAÇÃO 2: PaymentCollect = Property (COBRAR NO HOTEL)
                  </span>
                  <Badge className="bg-amber-500 text-white font-bold text-[10px] animate-pulse">COBRAR NO CHECK-IN</Badge>
                </div>
                <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-lg text-amber-900 dark:text-amber-200 font-bold">
                  💳 SOLICITAR O PAGAMENTO AO HÓSPEDE NO MOMENTO DO CHECK-IN!
                </div>
                <p className="text-muted-foreground">
                  O hóspede optou por pagar diretamente no estabelecimento. Os dados de cartão informados no canal servem apenas como garantia de reserva (no-show).
                </p>
                <div className="text-[11px] text-foreground font-semibold">
                  Procedimento: Cobrar o valor total da reserva na maquininha do hotel (crédito/débito), PIX ou dinheiro antes de entregar as chaves/senha do flat.
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Resolução de Quarentena */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
                <CardTitle className="text-base font-bold text-foreground">
                  3.3. Como Resolver Casos de Quarentena Passo a Passo
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Ações na gaveta lateral de resolução
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs leading-relaxed text-foreground/90">
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                <li>
                  <strong className="text-foreground">Overbooking / Sem Flat Livre:</strong> Ocorre quando todas as 19 unidades já estão ocupadas. Verifique com a governança se há bloqueios que possam ser cancelados ou contate a gerência para remanejamento externo. Se não for possível atender, clique em "Rejeitar Reserva e Notificar Canal".
                </li>
                <li>
                  <strong className="text-foreground">Flat em Manutenção:</strong> A reserva solicitou ou foi pré-alocada em uma unidade com ordem de serviço aberta. Abra a gaveta de quarentena, use o seletor "Alocar Flat Manualmente", escolha outra unidade desocupada e clique em "Confirmar Flat".
                </li>
                <li>
                  <strong className="text-foreground">Correspondência Ambígua:</strong> O sistema detectou uma reserva manual pré-existente com datas e nomes coincidentes. Clique em "Vincular a Reserva Existente" para manter o histórico sem duplicar o quarto.
                </li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Section 4: Capturas Reais da Interface (com tags img) */}
        <TabsContent value="screens" className="space-y-6 mt-0">
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-primary" />
                <CardTitle className="text-base font-bold text-foreground">
                  4.1. Capturas Reais das Telas do Sistema
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Visualização oficial de layout e fluxo dos módulos integrados à WebBookingPro
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-8">
              {/* Screen 1: Precificação SEBRAE */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs">1</span>
                    Tela de Precificação SEBRAE — Aba Tarifa Mínima (/precificacao-sebrae)
                  </h3>
                  <Badge variant="outline" className="text-[10px]">Piso R$ 276,63</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Grade de 3 cartões (Custo UH R$ 149,38, Fórmula com barra stacked fechando 100%, e Planos publicados com adicional de café).
                </p>
                <div className="overflow-hidden rounded-xl border border-border shadow-sm">
                  <img 
                    src="/manual/precificacao-sebrae.jpg" 
                    alt="Precificação SEBRAE - Aba Tarifa Mínima" 
                    className="w-full object-cover rounded-xl"
                  />
                </div>
              </div>

              {/* Screen 2: Pré-visualização & Publicar */}
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-amber-600 text-white flex items-center justify-center text-xs">2</span>
                    Modal / Aba de Pré-visualização & Publicar
                  </h3>
                  <Badge variant="outline" className="text-[10px]">Trava de Variação &gt; 30%</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Painel de conferência com 4 chips de KPI, destaque em âmbar para tarifas com trava de variação (+38% 🔒), painel de confirmação e botão de publicação oficial.
                </p>
                <div className="overflow-hidden rounded-xl border border-border shadow-sm">
                  <img 
                    src="/manual/previsualizacao-publicar.jpg" 
                    alt="Pré-visualização & Publicar com travas de variação" 
                    className="w-full object-cover rounded-xl"
                  />
                </div>
              </div>

              {/* Screen 3: Caixa de Entrada OTA e Quarentena */}
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-rose-600 text-white flex items-center justify-center text-xs">3</span>
                    Caixa de Entrada OTA com Gaveta de Quarentena (/caixa-entrada-ota)
                  </h3>
                  <Badge variant="outline" className="text-[10px]">Gestão de Conflitos</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tabela desduplicada de reservas recebidas da Booking e Airbnb, status da conexão, e gaveta lateral de resolução com alocação manual de flat e acesso seguro a dados de cartão.
                </p>
                <div className="overflow-hidden rounded-xl border border-border shadow-sm">
                  <img 
                    src="/manual/caixa-entrada-ota.jpg" 
                    alt="Caixa de Entrada OTA e Gaveta de Resolução de Quarentena" 
                    className="w-full object-cover rounded-xl"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

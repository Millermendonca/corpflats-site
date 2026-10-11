# Handoff Report: Milestone M3 — Frontend Admin UI (WhatsApp AI Switches)

**Author**: Explorer M3.1 (`explorer_m3_1`)  
**Target Recipient**: Orchestrator (`3364a657-c855-42a7-a46e-a5463bc245b7`) & Worker M3  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m3_1`  
**Date**: 2026-10-11  

---

## 1. Observation

### 1.1 Backend Endpoints & Data Model
- **Endpoint GET**: `/api/bot-actions/settings`
  - Implementado em `artifacts/api-server/demo-server.mjs:20644-20649` (espelhado em `scripts/demo-server.mjs:20644-20649`).
  - Retorna:
    ```json
    {
      "success": true,
      "settings": {
        "apiActionsEnabled": true,
        "allowedActions": {
          "checkAvailability": true,
          "calculateQuote": true,
          "generatePayment": true,
          "createPreReservation": true,
          "commitReservation": true
        },
        "preReservationHoldMinutes": 30,
        "handoverMessage": "Esta ação do sistema está pausada ou requer atendimento humano.",
        "updatedAt": "2026-10-11T..."
      }
    }
    ```
- **Endpoint POST**: `/api/bot-actions/settings`
  - Implementado em `artifacts/api-server/demo-server.mjs:20651-20689`.
  - Aceita body com:
    - `apiActionsEnabled` (`boolean`)
    - `allowedActions` (`object` com chaves parciais/totais booleanas)
    - `preReservationHoldMinutes` (`number > 0`)
    - `handoverMessage` (`string`)
  - Atualiza atomicamente `db.botActionsSettings`, sincroniza espelho em `db.zapiConfig.aiAgent.actionsConfig` e persiste no `data/database.json`.
  - Retorna `{ success: true, settings: current }`.
- **Backend WhatsApp AI Function Calling**:
  - Implementado em `artifacts/api-server/whatsapp-ai-service.mjs:326-380`.
  - Se `apiActionsEnabled === false`, `buildGeminiTools` retorna `[]` (Gemini opera como respondedor de FAQ conversacional puro sem tools).
  - Se `apiActionsEnabled === true`, inclui apenas ferramentas com `allowedActions[action] === true`.
  - Se uma ferramenta for acionada ou chamada diretamente enquanto desativada, a API responde HTTP 403 `ACTION_DISABLED` com `requiresHandover: true` e `handoverMessage`.

### 1.2 Estado Atual de `whatsapp-automation.tsx`
- **Arquivo**: `artifacts/limpeza/src/pages/whatsapp-automation.tsx` (4.083 linhas).
- **Aba `<TabsContent value="ai_agent">`**: Localizada entre as linhas `1468` e `1950`.
- **Componentes Atuais na Aba**:
  1. *Banner Superior de 3 Cards* (linhas 1470-1536):
     - Card 1: "Motor de IA" (`aiConfig.enabled` -> Ativo/Desativado, Nome Sofia, Concierge Virtual).
     - Card 2: "Modelo LLM" (`geminiStatus.configured` -> Google Gemini / Heurístico Local).
     - Card 3: "Ambiente de Disparo" (`aiTestModeOnly` -> Modo Teste / Produção).
  2. *Grid Principal* (linhas 1539-1948):
     - Coluna Esquerda (7 cols):
       - Card "Modo de Atuação & Parâmetros Principais" (Modo Autônomo/Copiloto/Fora do Expediente, Delay, Telefones de Teste, Nome/Cargo, Prompt Base).
       - Card "Base de Conhecimento Rápida" (Wi-Fi, Check-in/out, Café, Garagem, Endereço + Botão Salvar).
     - Coluna Direita (5 cols):
       - Card "Simulador do Agente de IA" (Input de teste, simulação em tempo real, balão WhatsApp e contexto detectado).
- **Lacuna Identificada**:
  - O frontend atualmente consome apenas `/api/whatsapp/ai-config`, `/api/whatsapp/status` e `/api/whatsapp/ai-simulate`.
  - Não há nenhuma menção ou chamada para `/api/bot-actions/settings` no frontend.
  - A Chave Mestra Global (`apiActionsEnabled`) e a Matriz dos 5 interruptores granulares (`allowedActions`) não estão presentes na interface.
  - O Indicador Tri-modal de Status em tempo real ainda não foi construído.

### 1.3 Testes e Compilação
- `tests/bot-actions-api.test.mjs`: 5/5 testes passando (5.4s).
- `tests/whatsapp-ai-agent.test.mjs`: 20/20 testes passando (2.4s).
- `tests/tariff-engine.test.mjs`: 8/8 testes passando (3.2s).
- Build Vite do frontend (`artifacts/limpeza`): compila com sucesso gerando bundle de produção sem erros.

---

## 2. Logic Chain

1. **Requisito Original R5 / Dispatch**: A interface de administração do WhatsApp precisa fornecer ao operador (Miller) o controle total e visual sobre a autonomia da IA na execução de ações reais de reserva e finanças.
2. **Necessidade do Indicador Tri-modal**:
   - Se a Z-API estiver desconectada ou o bot estiver desligado (`!statusInfo?.connected || !aiConfig.enabled`), o sistema deve exibir visualmente o estado **"Bot Desativado"** (vermelho/cinza), alertando que nenhuma mensagem é tratada.
   - Se o bot estiver ativo mas a chave mestra de ações estiver desligada (`botActionsSettings.apiActionsEnabled === false`), o sistema deve exibir **"Modo Respondedor Ativo"** (âmbar), alertando que o bot opera exclusivamente respondendo dúvidas/FAQ sem executar reservas ou gerar cobranças.
   - Se o bot estiver ativo e a chave mestra ligada (`botActionsSettings.apiActionsEnabled === true`), o sistema deve exibir **"Modo Autônomo com Ações"** (verde pulsante), indicando que o Function Calling está operacional e listando quantas das 5 ações estão autorizadas.
3. **Necessidade do Highlight Card da Chave Mestra (`apiActionsEnabled`)**:
   - Deve ser posicionado com destaque imediato na aba `ai_agent` (logo após o banner superior de cards), com visual de destaque (borda colorida, fundo gradiente, badge de alto contraste).
   - O switch deve alternar com atualização otimista (optimistic update) e feedback sonoro/visual via toast, salvando instantaneamente no backend via `POST /api/bot-actions/settings`.
4. **Necessidade da Matriz Visual de 5 Interruptores (`allowedActions`)**:
   - As 5 ações mapeiam perfeitamente os fluxos autônomos:
     1. `checkAvailability`: Consulta de disponibilidade de flats no período e hóspedes.
     2. `calculateQuote`: Cálculo de diárias e orçamentos via Tariff Engine inteligente (SEBRAE + markups).
     3. `generatePayment`: Emissão de cobrança PIX com Copia-e-Cola BACEN e QR Code dinâmico.
     4. `createPreReservation`: Criação de pré-reserva com hold provisório de 30 minutos no PMS.
     5. `commitReservation`: Efetivação definitiva da reserva no PMS com bloqueio de calendário.
   - Quando `apiActionsEnabled === false`, os 5 interruptores devem ficar visivelmente desabilitados (com `opacity-60`, `pointer-events-none` e banner explicativo informando que a chave mestra tem precedência).
   - Cada interruptor deve possuir seu próprio toggle instantâneo com toast e persistência imediata.
5. **Configurações Adicionais de Retenção e Transbordo**:
   - Para paridade total com o backend, o card deve incluir inputs para:
     - `preReservationHoldMinutes`: Tempo de bloqueio provisório da pré-reserva (default 30 min).
     - `handoverMessage`: Mensagem enviada ao hóspede caso a IA tente executar uma ação desativada.
     - Botão para salvar esses parâmetros adicionais.

---

## 3. Caveats

- **Paridade Z-API Mirror**: O backend sincroniza `db.zapiConfig.aiAgent.actionsConfig` automaticamente quando `POST /api/bot-actions/settings` é chamado. O frontend deve interagir diretamente com a API canônica `/api/bot-actions/settings`.
- **Dependência de Z-API Status**: O status de conexão é determinado por `statusInfo?.connected`. Se o usuário recarregar a página, `statusInfo` pode demorar alguns milissegundos para responder via `/api/whatsapp/status`. O indicador tri-modal trata com elegância esse breve carregamento.
- **Isolamento de Responsabilidade**: As modificações devem ser concentradas em `artifacts/limpeza/src/pages/whatsapp-automation.tsx`. Nenhum arquivo de backend precisa ser alterado para esta entrega.
- **Regras do Projeto**: Após a implementação pelo Worker, o build `npm run build` deve ser executado em `artifacts/limpeza` e os arquivos em `artifacts/limpeza/dist/` devem ser verificados e incluídos no commit com `git push`.

---

## 4. Conclusion & Especificação Técnica Completa para o Worker M3

### 4.1 Estrutura de Tipos e Metadados das Ações

```tsx
interface BotActionsSettings {
  apiActionsEnabled: boolean
  allowedActions: {
    checkAvailability: boolean
    calculateQuote: boolean
    generatePayment: boolean
    createPreReservation: boolean
    commitReservation: boolean
  }
  preReservationHoldMinutes: number
  handoverMessage: string
  updatedAt?: string
}

type BotActionKey = keyof BotActionsSettings["allowedActions"]

interface BotActionMeta {
  key: BotActionKey
  title: string
  endpoint: string
  method: "GET" | "POST"
  description: string
  iconName: string
  badgeText: string
  colorClass: string
}

const BOT_ACTIONS_METADATA: BotActionMeta[] = [
  {
    key: "checkAvailability",
    title: "Consultar Disponibilidade",
    endpoint: "/api/bot-actions/availability",
    method: "GET",
    description: "Consulta flats livres no período informado (check-in/check-out) e capacidade de hóspedes diretamente no PMS.",
    iconName: "Calendar",
    badgeText: "PMS Query",
    colorClass: "blue"
  },
  {
    key: "calculateQuote",
    title: "Calcular Orçamento & Tarifas",
    endpoint: "/api/bot-actions/quote",
    method: "POST",
    description: "Simula cotação detalhada com diárias do Motor Tarifário Inteligente (custos fixos/variáveis SEBRAE + markups por canal).",
    iconName: "Sliders",
    badgeText: "Tariff Engine",
    colorClass: "emerald"
  },
  {
    key: "generatePayment",
    title: "Gerar Pagamento PIX",
    endpoint: "/api/bot-actions/payment-link",
    method: "POST",
    description: "Emite payload BACEN BR Code copia-e-cola e QR Code base64 em tempo real para liquidação instantânea.",
    iconName: "QrCode",
    badgeText: "PIX BACEN",
    colorClass: "purple"
  },
  {
    key: "createPreReservation",
    title: "Criar Pré-Reserva (Hold Provisório)",
    endpoint: "/api/bot-actions/pre-reserve",
    method: "POST",
    description: "Bloqueia temporariamente o flat no calendário pelo tempo configurado (ex: 30 min) para garantir o quarto durante o PIX.",
    iconName: "Clock",
    badgeText: "Hold PMS",
    colorClass: "amber"
  },
  {
    key: "commitReservation",
    title: "Efetivar Reserva Confirmada",
    endpoint: "/api/bot-actions/commit-reservation",
    method: "POST",
    description: "Converte a pré-reserva em reserva confirmada definitiva no PMS, gerando código e travando permanentemente o calendário.",
    iconName: "CheckCheck",
    badgeText: "PMS Lock",
    colorClass: "emerald"
  }
]
```

---

### 4.2 Lógica do Indicador Tri-modal de Status em Tempo Real

```tsx
const getBotOperationalMode = () => {
  // 1. Bot Desativado (Z-API desconectada ou Sofia desligada)
  if (!statusInfo?.connected || !aiConfig.enabled) {
    return {
      type: "disabled",
      label: "Bot Desativado",
      badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800",
      dotClass: "bg-rose-500",
      description: !statusInfo?.connected
        ? "Instância Z-API desconectada no WhatsApp. Mensagens recebidas não são entregues à Sofia."
        : "O motor da IA Sofia está desligado nas opções. Respostas automáticas pausadas.",
      iconBg: "bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400"
    }
  }

  // 2. Modo Respondedor Ativo (Bot ligado, mas Chave Mestra desligada)
  if (!botActionsSettings.apiActionsEnabled) {
    return {
      type: "responder",
      label: "Modo Respondedor Ativo",
      badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800",
      dotClass: "bg-amber-500 animate-pulse",
      description: "A Sofia atua como Concierge Conversacional e FAQ (Gemini puro). Responde dúvidas sobre regras, Wi-Fi e comodidades, mas está proibida de acessar o PMS e gerar cobranças.",
      iconBg: "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
    }
  }

  // 3. Modo Autônomo com Ações (Bot ligado e Chave Mestra ligada)
  const activeCount = Object.values(botActionsSettings.allowedActions || {}).filter(Boolean).length
  return {
    type: "autonomous",
    label: "Modo Autônomo com Ações",
    badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
    dotClass: "bg-emerald-500 animate-ping",
    description: `A Sofia opera com autonomia executiva via Function Calling. ${activeCount} de 5 ações permitidas no PMS e financeiro (disponibilidade, tarifas, pré-reserva, PIX e confirmação).`,
    iconBg: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
  }
}
```

---

### 4.3 Integração de Estado e Handlers em `WhatsappAutomation`

Adicionar ao componente `WhatsappAutomation` em `whatsapp-automation.tsx`:

```tsx
// Estado das Chaves de Ação do Bot
const [botActionsSettings, setBotActionsSettings] = useState<BotActionsSettings>({
  apiActionsEnabled: true,
  allowedActions: {
    checkAvailability: true,
    calculateQuote: true,
    generatePayment: true,
    createPreReservation: true,
    commitReservation: true
  },
  preReservationHoldMinutes: 30,
  handoverMessage: "Esta ação do sistema está pausada ou requer atendimento humano."
})
const [loadingBotActions, setLoadingBotActions] = useState<boolean>(false)
const [savingBotActions, setSavingBotActions] = useState<boolean>(false)
const [showAdvancedActions, setShowAdvancedActions] = useState<boolean>(false)

// Carregamento de Configurações
const fetchBotActionsSettings = async () => {
  try {
    setLoadingBotActions(true)
    const res = await fetch("/api/bot-actions/settings")
    if (res.ok) {
      const data = await res.json()
      if (data.settings) {
        setBotActionsSettings(data.settings)
      }
    }
  } catch (err: any) {
    console.warn("Erro ao buscar configurações de bot-actions:", err.message)
  } finally {
    setLoadingBotActions(false)
  }
}

// Inserir chamada no useEffect inicial:
// useEffect(() => {
//   ...
//   fetchBotActionsSettings()
// }, [])

// Toggle Instantâneo da Chave Mestra
const handleToggleMasterBotActions = async (enabled: boolean) => {
  const previous = botActionsSettings.apiActionsEnabled
  setBotActionsSettings(prev => ({ ...prev, apiActionsEnabled: enabled }))
  try {
    const res = await fetch("/api/bot-actions/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiActionsEnabled: enabled })
    })
    if (res.ok) {
      const data = await res.json()
      if (data.settings) {
        setBotActionsSettings(data.settings)
      }
      toast({
        title: enabled ? "⚡ Ações Autônomas Ativadas!" : "🛡️ Modo Respondedor Puro Ativado",
        description: enabled
          ? "A Sofia agora tem permissão para acionar ferramentas no PMS, tarifário e PIX."
          : "Sofia agora opera exclusivamente como tiradora de dúvidas. Chamadas da API de ações responderão 403 ACTION_DISABLED."
      })
    } else {
      setBotActionsSettings(prev => ({ ...prev, apiActionsEnabled: previous }))
      toast({ title: "Erro ao alternar chave mestra", variant: "destructive" })
    }
  } catch (err: any) {
    setBotActionsSettings(prev => ({ ...prev, apiActionsEnabled: previous }))
    toast({ title: "Falha na comunicação com o servidor", description: err.message, variant: "destructive" })
  }
}

// Toggle Instantâneo de Ação Granular Individual
const handleToggleGranularAction = async (actionKey: BotActionKey, enabled: boolean) => {
  const previous = botActionsSettings.allowedActions?.[actionKey] ?? true
  setBotActionsSettings(prev => ({
    ...prev,
    allowedActions: {
      ...prev.allowedActions,
      [actionKey]: enabled
    }
  }))
  try {
    const res = await fetch("/api/bot-actions/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        allowedActions: {
          [actionKey]: enabled
        }
      })
    })
    if (res.ok) {
      const data = await res.json()
      if (data.settings) {
        setBotActionsSettings(data.settings)
      }
      const meta = BOT_ACTIONS_METADATA.find(m => m.key === actionKey)
      toast({
        title: enabled ? "Ação Habilitada" : "Ação Desabilitada",
        description: `${meta?.title || actionKey}: ${enabled ? "Autorizado para IA." : "Pausado (transbordo amigável ativado)."}`
      })
    } else {
      setBotActionsSettings(prev => ({
        ...prev,
        allowedActions: {
          ...prev.allowedActions,
          [actionKey]: previous
        }
      }))
      toast({ title: "Erro ao atualizar permissão", variant: "destructive" })
    }
  } catch (err: any) {
    setBotActionsSettings(prev => ({
      ...prev,
      allowedActions: {
        ...prev.allowedActions,
        [actionKey]: previous
      }
    }))
    toast({ title: "Falha de conexão", description: err.message, variant: "destructive" })
  }
}

// Salvar Parâmetros Avançados (Hold & Mensagem de Transbordo)
const handleSaveBotActionsParams = async () => {
  try {
    setSavingBotActions(true)
    const res = await fetch("/api/bot-actions/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preReservationHoldMinutes: Number(botActionsSettings.preReservationHoldMinutes) || 30,
        handoverMessage: botActionsSettings.handoverMessage || "Esta ação do sistema está pausada ou requer atendimento humano."
      })
    })
    if (res.ok) {
      const data = await res.json()
      if (data.settings) {
        setBotActionsSettings(data.settings)
      }
      toast({
        title: "Parâmetros Salvos! ✨",
        description: "Tempo de retenção e mensagem de transbordo atualizados com sucesso."
      })
    } else {
      toast({ title: "Erro ao salvar parâmetros", variant: "destructive" })
    }
  } catch (err: any) {
    toast({ title: "Falha ao salvar", description: err.message, variant: "destructive" })
  } finally {
    setSavingBotActions(false)
  }
}
```

---

### 4.4 Design Visual de Componentes JSX na Aba `ai_agent`

#### 4.4.1 Atualização do Banner Superior (4 Cards em vez de 3)
Ajustar o grid superior (linha 1470) para `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`:
1. **Card 1: Motor de IA** (`Sofia / Concierge Virtual`)
2. **Card 2: Modelo LLM** (`Google Gemini / Heurístico Local`)
3. **Card 3: Ambiente de Disparo** (`Modo Teste / Produção`)
4. **Card 4: Modo Operacional Tri-modal** (Novo):
   - Exibe o status dinâmico calculado por `getBotOperationalMode()`:
     - Badge colorido com dot indicador.
     - Título: `Bot Desativado`, `Modo Respondedor Ativo` ou `Modo Autônomo com Ações`.
     - Subtítulo com contagem de ações ativas (`X/5 ativas`).

#### 4.4.2 Highlight Card: Chave Mestra e Matriz de 5 Interruptores
Posicionar imediatamente acima do grid principal (entre o banner superior e a linha 1539):

```tsx
{/* ════════════════════════════════════════════════════════════════════
    DESTAQUE: CHAVE MESTRA & MATRIZ DE AÇÕES DO SISTEMA (BOT ACTIONS API)
════════════════════════════════════════════════════════════════════ */}
<Card className={`border-2 transition-all shadow-md rounded-2xl overflow-hidden ${
  botActionsSettings.apiActionsEnabled
    ? "border-emerald-500/40 bg-gradient-to-br from-emerald-500/5 via-background to-background dark:border-emerald-500/30"
    : "border-amber-500/40 bg-gradient-to-br from-amber-500/5 via-background to-background dark:border-amber-500/30"
}`}>
  {/* Header do Card com Interruptor Mestre */}
  <CardHeader className="p-5 sm:p-6 border-b bg-card/60 backdrop-blur-xs">
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className={`p-2 rounded-xl ${
            botActionsSettings.apiActionsEnabled 
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" 
              : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          }`}>
            <Zap className={`w-5 h-5 ${botActionsSettings.apiActionsEnabled ? "animate-pulse" : ""}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg font-black tracking-tight">
                Chave Mestra Global de Ações do Sistema
              </CardTitle>
              <Badge variant="outline" className={`font-bold text-[10px] uppercase tracking-wider ${
                botActionsSettings.apiActionsEnabled
                  ? "border-emerald-500 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60"
                  : "border-amber-500 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60"
              }`}>
                {botActionsSettings.apiActionsEnabled ? "API Actions ON" : "API Actions OFF"}
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Controla se o Agente de IA (Sofia) pode acionar o Function Calling para executar reservas, orçamentos e PIX no sistema.
            </CardDescription>
          </div>
        </div>
      </div>

      {/* Switch Mestre com Destaque Visual */}
      <div className="flex items-center gap-3 self-end lg:self-center bg-background/80 dark:bg-slate-900/80 p-2.5 px-4 rounded-xl border shadow-xs">
        <div className="text-right">
          <Label htmlFor="master-api-actions-switch" className="text-xs font-black cursor-pointer block">
            {botActionsSettings.apiActionsEnabled ? "Ações Autônomas Ativas" : "Modo Respondedor Puro"}
          </Label>
          <span className="text-[10px] text-muted-foreground">
            {botActionsSettings.apiActionsEnabled 
              ? "Gemini com Function Calling habilitado" 
              : "Bloqueia /api/bot-actions com 403"}
          </span>
        </div>
        <Switch
          id="master-api-actions-switch"
          checked={botActionsSettings.apiActionsEnabled}
          onCheckedChange={handleToggleMasterBotActions}
          className="data-[state=checked]:bg-emerald-600 scale-110"
        />
      </div>
    </div>

    {/* Banner Explicativo do Modo Tri-modal Atual */}
    {(() => {
      const mode = getBotOperationalMode()
      return (
        <div className={`mt-4 p-3 rounded-xl border flex items-start gap-3 transition-colors ${
          mode.type === "autonomous"
            ? "bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/50 text-emerald-900 dark:text-emerald-100"
            : mode.type === "responder"
            ? "bg-amber-50/70 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50 text-amber-900 dark:text-amber-100"
            : "bg-rose-50/70 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/50 text-rose-900 dark:text-rose-100"
        }`}>
          <div className={`p-1.5 rounded-lg shrink-0 ${mode.iconBg}`}>
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${mode.dotClass}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black">{mode.label}</span>
              <Badge className={`text-[10px] px-1.5 py-0 ${mode.badgeClass}`}>{mode.label}</Badge>
            </div>
            <p className="text-[11px] leading-relaxed opacity-90 mt-0.5">{mode.description}</p>
          </div>
        </div>
      )
    })()}
  </CardHeader>

  {/* Corpo do Card: Matriz dos 5 Interruptores Granulares */}
  <CardContent className="p-5 sm:p-6 space-y-5">
    <div className="flex items-center justify-between">
      <div>
        <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-blue-500" />
          Matriz de Permissões Granulares (5 Ações Executivas)
        </h4>
        <p className="text-[11px] text-muted-foreground">
          Ative ou silencie ações individuais de acordo com o nível de autonomia desejado.
        </p>
      </div>
      <Badge variant="secondary" className="text-[10px] font-bold">
        {Object.values(botActionsSettings.allowedActions || {}).filter(Boolean).length} de 5 Habilitadas
      </Badge>
    </div>

    {/* Alerta de Chave Mestra Desativada */}
    {!botActionsSettings.apiActionsEnabled && (
      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/60 flex items-center gap-2.5 text-amber-800 dark:text-amber-200 text-xs">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
        <span>
          <strong>Chave Mestra Desativada:</strong> Os interruptores individuais abaixo estão suspensos. A Sofia não executará nenhuma ação até que o interruptor mestre seja religado.
        </span>
      </div>
    )}

    {/* Grid dos 5 Cards Granulares */}
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 transition-opacity ${
      !botActionsSettings.apiActionsEnabled ? "opacity-60 pointer-events-none" : ""
    }`}>
      {BOT_ACTIONS_METADATA.map((action) => {
        const isAllowed = botActionsSettings.allowedActions?.[action.key] !== false
        return (
          <div
            key={action.key}
            className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
              isAllowed
                ? "bg-card border-slate-200 dark:border-slate-800 shadow-2xs hover:border-blue-400"
                : "bg-muted/40 border-dashed border-slate-300 dark:border-slate-800 opacity-75"
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg text-xs font-bold ${
                    isAllowed ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground"
                  }`}>
                    {action.key === "checkAvailability" && <Calendar className="w-4 h-4" />}
                    {action.key === "calculateQuote" && <Sliders className="w-4 h-4" />}
                    {action.key === "generatePayment" && <QrCode className="w-4 h-4" />}
                    {action.key === "createPreReservation" && <Clock className="w-4 h-4" />}
                    {action.key === "commitReservation" && <CheckCheck className="w-4 h-4" />}
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-foreground leading-snug">{action.title}</h5>
                    <span className="text-[10px] font-mono text-muted-foreground">{action.endpoint}</span>
                  </div>
                </div>
                <Switch
                  id={`action-toggle-${action.key}`}
                  checked={isAllowed}
                  disabled={!botActionsSettings.apiActionsEnabled}
                  onCheckedChange={(checked) => handleToggleGranularAction(action.key, checked)}
                  className="data-[state=checked]:bg-blue-600 scale-90"
                />
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {action.description}
              </p>
            </div>

            <div className="pt-3 mt-2 border-t flex items-center justify-between text-[10px]">
              <span className="font-semibold text-muted-foreground">{action.badgeText}</span>
              <Badge variant={isAllowed ? "default" : "secondary"} className={`text-[9px] px-1.5 py-0 ${
                isAllowed ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}>
                {isAllowed ? "Autorizado" : "Pausado (403)"}
              </Badge>
            </div>
          </div>
        )
      })}
    </div>

    {/* Parâmetros Avançados (Hold & Mensagem de Transbordo) */}
    <div className="pt-2 border-t">
      <button
        type="button"
        onClick={() => setShowAdvancedActions(!showAdvancedActions)}
        className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1.5 py-1"
      >
        <Sliders className="w-3.5 h-3.5" />
        {showAdvancedActions ? "Ocultar Parâmetros Avançados de Retenção & Transbordo" : "Configurar Tempo de Hold e Mensagem de Transbordo..."}
      </button>

      {showAdvancedActions && (
        <div className="mt-3 p-4 rounded-xl bg-muted/40 border space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pre-reservation-hold" className="text-xs font-semibold">
                Tempo de Hold da Pré-Reserva (minutos)
              </Label>
              <Input
                id="pre-reservation-hold"
                type="number"
                min="5"
                max="120"
                value={botActionsSettings.preReservationHoldMinutes || 30}
                onChange={(e) => setBotActionsSettings(prev => ({ ...prev, preReservationHoldMinutes: Number(e.target.value) || 30 }))}
                className="h-9 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Tempo de bloqueio provisório no PMS até expiração se o PIX não for liquidado.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="handover-message-input" className="text-xs font-semibold">
                Mensagem Padrão de Transbordo (Ação Pausada)
              </Label>
              <Input
                id="handover-message-input"
                value={botActionsSettings.handoverMessage || ""}
                onChange={(e) => setBotActionsSettings(prev => ({ ...prev, handoverMessage: e.target.value }))}
                placeholder="Ex: Esta ação do sistema está pausada ou requer atendimento humano."
                className="h-9 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Resposta cordial orientada pela Sofia caso o hóspede solicite uma ação desativada.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button
              type="button"
              size="sm"
              onClick={handleSaveBotActionsParams}
              disabled={savingBotActions}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold gap-1.5"
            >
              {savingBotActions ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Salvar Parâmetros Avançados
            </Button>
          </div>
        </div>
      )}
    </div>
  </CardContent>
</Card>
```

---

## 5. Verification Method

Para verificar a implementação após o Worker aplicar as alterações:

1. **Inspeção do Código**:
   - Confirmar que `whatsapp-automation.tsx` carrega `GET /api/bot-actions/settings` no `useEffect`.
   - Confirmar que `handleToggleMasterBotActions` e `handleToggleGranularAction` realizam `POST /api/bot-actions/settings`.
   - Confirmar a renderização dos 4 cards de status e do Highlight Card completo.
2. **Build do Frontend**:
   ```powershell
   npm run build --prefix artifacts/limpeza
   ```
   Deve compilar com código de saída 0 e gerar os arquivos em `artifacts/limpeza/dist/public/`.
3. **Bateria de Testes Unitários e de Integração**:
   ```powershell
   node --test tests/bot-actions-api.test.mjs
   node --test tests/whatsapp-ai-agent.test.mjs
   node --test tests/tariff-engine.test.mjs
   ```
   Todos os testes devem passar com 100% de aprovação.
4. **Verificação de Regras do Projeto**:
   - Realizar commit com mensagem descritiva incluindo `artifacts/limpeza/dist/`.
   - Executar `git push` imediatamente para `origin main`.

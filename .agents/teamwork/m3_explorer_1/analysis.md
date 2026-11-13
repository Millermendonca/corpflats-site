# Análise Técnica & Blueprint de UI: Modal Multi-Etapas de Modificação de Reserva

**Projeto**: CorpFlats Guest-Flow-Manager  
**Milestone**: M3 — Guest Portal UI Flow, Modals & Operational Panels  
**Agente**: M3 Explorer 1  
**Arquivo Alvo**: `artifacts/limpeza/src/pages/guest-portal.tsx`  
**Data**: 2026-10-11  

---

## 1. Resumo Executivo & Diagnóstico

O fluxo atual de modificação de reservas no Portal do Hóspede (`guest-portal.tsx`) consiste em um formulário monolítico simples que tenta disparar diretamente `POST /api/pms/guest-portal/:code/modify`. 

Com a implementação do **Milestone 1** no backend (`scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`), foram estabelecidas salvaguardas estritas de liquidação financeira e integridade do calendário:
1. **Bloqueio de Modificação Não Liquidada**: O endpoint `POST /modify` rejeita alterações que aumentem o valor da reserva com status `402 PAYMENT_REQUIRED`.
2. **Nova Arquitetura de Simulação e Hold**:
   - `POST /modify-preview`: Simulação read-only que verifica concorrência de calendário no flat e calcula o demonstrativo financeiro e a política de 24h.
   - `POST /modify-checkout`: Geração de hold provisório de 30 minutos com PIX Dinâmico/Estático (QR Code + Copia e Cola) e preferência de Cartão Mercado Pago, mantendo as datas originais no banco.
   - `GET /modify-status?pendingId=...`: Endpoint de consulta ativa e conciliação que realiza o commit atômico assim que a liquidação é detectada.
   - `POST /modify-cancel-pending`: Liberação explícita do bloqueio provisório a pedido do hóspede, restaurando a disponibilidade do período e preservando a reserva original.
3. **Invalidação Obrigatória de Assinatura (R3 / M2)**:
   - Qualquer alteração de datas ou troca de apartamento invalida a assinatura anterior da FNRH (`needsReSignature = true`, `fnhrCompleted = false`), exigindo re-assinatura pelo hóspede via `/pre-checkin/:code?resign=1`.

Este documento estabelece o design completo da experiência de usuário multi-etapas e fornece o **blueprint exato de código** para implementação direta em `guest-portal.tsx`.

---

## 2. Mapeamento dos Contratos de API (Milestone 1 Backend)

### 2.1. `POST /api/pms/guest-portal/:code/modify-preview`
- **Objetivo**: Simulação read-only da disponibilidade e valores antes de qualquer bloqueio.
- **Payload**:
  ```json
  {
    "newCheckinDate": "2026-11-10",
    "newCheckoutDate": "2026-11-14",
    "newGuestCount": 2,
    "newFlatNumber": "113",
    "reason": "Extensão a trabalho"
  }
  ```
- **Resposta de Sucesso (200 OK)**:
  ```json
  {
    "success": true,
    "available": true,
    "originalDates": {
      "checkinDate": "2026-11-10",
      "checkoutDate": "2026-11-12",
      "nights": 2,
      "flatNumber": "113",
      "guestCount": 2,
      "totalAmount": 320.00
    },
    "newDates": {
      "checkinDate": "2026-11-10",
      "checkoutDate": "2026-11-14",
      "nights": 4,
      "flatNumber": "113",
      "guestCount": 2,
      "totalAmount": 640.00
    },
    "flat": { "id": 113, "number": "113" },
    "dailyRate": 160.00,
    "duration": 4,
    "extraNights": 2,
    "additionalAmountToPay": 320.00,
    "refundAmount": 0,
    "currency": "BRL",
    "requiresPayment": true,
    "requiresReSignature": true,
    "isUnder24h": false,
    "nonRefundableReduction": false,
    "policyNotice": "Acréscimo de 2 diárias (+R$ 320.00)."
  }
  ```
- **Resposta de Conflito de Calendário (409 Conflict)**:
  ```json
  {
    "success": false,
    "available": false,
    "error": "CONFLICT",
    "message": "O Flat 113 não possui disponibilidade para o período solicitado (2026-11-10 a 2026-11-15).",
    "conflictMessage": "O Flat 113 não possui disponibilidade para o período solicitado (2026-11-10 a 2026-11-15)."
  }
  ```
- **Outros Erros**:
  - `403 Forbidden` (`EXTERNAL_CHANNEL`): Reserva de OTA (Booking/Airbnb) não pode ser modificada diretamente no portal.
  - `400 Bad Request` (`INVALID_DATES`, `RESERVATION_CANCELLED`).

---

### 2.2. `POST /api/pms/guest-portal/:code/modify-checkout`
- **Objetivo**: Criação do hold provisório de 30 minutos e geração de cobrança PIX/Cartão.
- **Payload**:
  ```json
  {
    "newCheckinDate": "2026-11-10",
    "newCheckoutDate": "2026-11-14",
    "newGuestCount": 2,
    "paymentMethod": "pix",
    "reason": "Extensão de viagem"
  }
  ```
- **Resposta de Sucesso com Pagamento (200 OK)**:
  ```json
  {
    "success": true,
    "pendingId": "mod_1760197000000_a1b2c3",
    "additionalAmountToPay": 320.00,
    "expiresAt": "2026-10-11T16:22:00.000Z",
    "holdMinutes": 30,
    "pixQrCodeUrl": "data:image/png;base64,iVBORw0KGgo...",
    "pixCopiaECola": "00020126580014br.gov.bcb.pix...",
    "pixTxId": "MODRES0011760197000000",
    "mpCheckoutUrl": "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=...",
    "mpPreferenceId": "123456789",
    "newDates": { "checkinDate": "2026-11-10", "checkoutDate": "2026-11-14" },
    "newFlatNumber": "113",
    "newGuestCount": 2
  }
  ```

---

### 2.3. `GET /api/pms/guest-portal/:code/modify-status?pendingId=:id`
- **Objetivo**: Polling assíncrono para verificar se o pagamento foi liquidado no Banco Inter ou Mercado Pago.
- **Respostas**:
  1. **Ainda Pendente**:
     ```json
     {
       "success": true,
       "paid": false,
       "status": "pending",
       "committed": false,
       "message": "Aguardando confirmação do pagamento.",
       "pendingId": "mod_...",
       "expiresAt": "...",
       "additionalAmountToPay": 320.00,
       "pixCopiaECola": "...",
       "pixQrCodeUrl": "..."
     }
     ```
  2. **Liquidado e Confirmado (Commit Atômico)**:
     ```json
     {
       "success": true,
       "paid": true,
       "status": "paid",
       "committed": true,
       "message": "Pagamento confirmado! As datas da sua estadia foram atualizadas com sucesso.",
       "newCheckinDate": "2026-11-10",
       "newCheckoutDate": "2026-11-14",
       "flatNumber": "113",
       "needsReSignature": true,
       "reSignatureUrl": "/pre-checkin/RES-M1-001?resign=1"
     }
     ```
  3. **Hold Expirado**:
     ```json
     {
       "success": true,
       "paid": false,
       "status": "expired",
       "committed": false,
       "message": "O prazo de 30 minutos para pagamento desta alteração expirou. Por favor, inicie uma nova simulação."
     }
     ```

---

### 2.4. `POST /api/pms/guest-portal/:code/modify-cancel-pending`
- **Objetivo**: Hóspede desiste da alteração durante o checkout, liberando o hold provisório de 30 minutos e restaurando a disponibilidade do flat imediatamente.
- **Payload**:
  ```json
  { "pendingId": "mod_1760197000000_a1b2c3" }
  ```
- **Resposta**:
  ```json
  {
    "success": true,
    "message": "Alteração pendente cancelada com sucesso. O bloqueio temporário foi liberado.",
    "originalDates": {
      "checkinDate": "2026-11-10",
      "checkoutDate": "2026-11-12",
      "flatNumber": "113"
    }
  }
  ```

---

### 2.5. Alteração Sem Custo Adicional (`additionalAmountToPay <= 0`)
- Quando a alteração tem custo R$ 0,00 (ex: deslocamento de datas de 2 noites para outras 2 noites disponíveis, ou redução de diárias):
  - Chama diretamente `POST /api/pms/guest-portal/:code/modify`.
  - O backend aplica a alteração no banco, invalida a assinatura (`needsReSignature = true`), registra a trilha de auditoria e retorna:
    ```json
    {
      "success": true,
      "message": "Reserva modificada com sucesso!",
      "newCheckinDate": "2026-11-11",
      "newCheckoutDate": "2026-11-13",
      "needsReSignature": true,
      "reSignatureUrl": "/pre-checkin/RES-M1-001?resign=1"
    }
    ```

---

## 3. Design da Experiência do Usuário (Multi-Step Modal)

### 3.1. Visão Geral das Etapas

```
[ Início: Abrir Modal ]
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  ETAPA 1: SIMULAÇÃO & DISPONIBILIDADE (PREVIEW)        │
│  - Seleção de Check-in, Check-out e Nº de Hóspedes     │
│  - Chamada automática / debounced a /modify-preview    │
│  - Badge de Disponibilidade: Verde vs Vermelho (409)   │
│  - Demonstrativo Financeiro (Diária, Noites, Total)    │
│  - Aviso de Política de 24 horas                       │
└────────────────────────────────────────────────────────┘
         │
         ├─────────────────────────────────────────┐
         │ (requiresPayment === true)              │ (requiresPayment === false)
         ▼                                         ▼
┌────────────────────────────────────────┐  ┌────────────────────────────────────┐
│  ETAPA 2: CHECKOUT & HOLD (30 MIN)     │  │  CONFIRMAÇÃO DIRETA                │
│  - POST /modify-checkout               │  │  - POST /modify (custo 0)          │
│  - Cronômetro regressivo (30:00)       │  └────────────────────────────────────┘
│  - Opção PIX (QR Code + Copia e Cola)  │                 │
│  - Opção Cartão (Link Mercado Pago)    │                 │
│  - Polling a cada 2.5s (/modify-status)│                 │
│  - Botão "Cancelar e Manter Originais" │                 │
└────────────────────────────────────────┘                 │
         │ (Pagamento detectado)                           │
         └─────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  ETAPA 3: SUCESSO & PROMPT DE RE-ASSINATURA (R3)       │
│  - Card celebrativo com novas datas e acomodação       │
│  - Banner de Alerta: Assinatura da FNRH invalidada     │
│  - Botão Principal: "Assinar Nova Ficha de Check-in"   │
│    -> redireciona para /pre-checkin/:code?resign=1     │
│  - Botão Secundário: "Concluir e Voltar ao Painel"     │
└────────────────────────────────────────────────────────┘
```

---

### 3.2. Banner de Re-Assinatura no Portal Principal (`guest-portal.tsx`)

Além do fluxo do modal, quando o hóspede acessa sua reserva e `reservation.needsReSignature === true`:
- Um banner de alta visibilidade (amber/laranja com ícone de `FileText` / `AlertTriangle`) é posicionado no topo da página principal.
- Exibe o motivo: "As datas ou a acomodação foram alteradas. É obrigatório assinar a nova Ficha de Registro de Hóspedes antes da sua entrada."
- Botão direto: `Assinar Nova Ficha de Check-in` direcionando para `/pre-checkin/:code?resign=1`.

---

## 4. Blueprint de Código Drop-in para `guest-portal.tsx`

Abaixo estão os blocos exatos de código projetados para substituição e integração em `artifacts/limpeza/src/pages/guest-portal.tsx`.

### 4.1. Declaração de Estados (Substituir linhas 105-114)

```tsx
  // ── Modificar Reserva Multi-Step States (M3) ────────────────────────
  const [modifyModalOpen, setModifyModalOpen] = useState(false)
  const [modStep, setModStep] = useState<"preview" | "checkout" | "success">("preview")
  const [modCheckinDate, setModCheckinDate] = useState("")
  const [modCheckoutDate, setModCheckoutDate] = useState("")
  const [modGuestCount, setModGuestCount] = useState(1)
  const [modReason, setModReason] = useState("")

  // Etapa 1: Simulação & Preview
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewData, setPreviewData] = useState<any | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Etapa 2: Checkout & Hold
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutData, setCheckoutData] = useState<any | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [modPaymentMethod, setModPaymentMethod] = useState<"pix" | "card">("pix")
  const [modCopiedPix, setModCopiedPix] = useState(false)
  const [modTimeRemaining, setModTimeRemaining] = useState("30:00")
  const [modPollingActive, setModPollingActive] = useState(false)
  const [cancellingHold, setCancellingHold] = useState(false)

  // Etapa 3: Sucesso & Re-assinatura
  const [modifySuccessInfo, setModifySuccessInfo] = useState<{
    message: string
    newCheckinDate: string
    newCheckoutDate: string
    newFlatNumber: string
    needsReSignature: boolean
    reSignatureUrl: string
  } | null>(null)
```

---

### 4.2. Efeitos de Polling e Contagem Regressiva do Hold (Inserir após estados)

```tsx
  // Contagem regressiva do Hold Provisório de 30 minutos
  useEffect(() => {
    if (modStep !== "checkout" || !checkoutData?.expiresAt || !modifyModalOpen) return

    const updateTimer = () => {
      const diff = new Date(checkoutData.expiresAt).getTime() - Date.now()
      if (diff <= 0) {
        setModTimeRemaining("00:00")
        setCheckoutError("O prazo de 30 minutos para pagamento desta alteração expirou. Por favor, reinicie a simulação.")
        setModPollingActive(false)
      } else {
        const totalSecs = Math.floor(diff / 1000)
        const mins = Math.floor(totalSecs / 60)
        const secs = totalSecs % 60
        setModTimeRemaining(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`)
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [modStep, checkoutData?.expiresAt, modifyModalOpen])

  // Polling em segundo plano para detecção automática de pagamento (/modify-status)
  useEffect(() => {
    if (!modPollingActive || !checkoutData?.pendingId || !modifyModalOpen) return

    const pendingId = checkoutData.pendingId
    const currentCode = data?.reservation?.code || code

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(currentCode)}/modify-status?pendingId=${encodeURIComponent(pendingId)}`)
        if (!res.ok) return
        const json = await res.json()

        if (json.paid || json.status === "paid" || json.committed) {
          clearInterval(pollInterval)
          setModPollingActive(false)
          setModifySuccessInfo({
            message: json.message || "Pagamento confirmado! As datas da sua estadia foram atualizadas com sucesso.",
            newCheckinDate: json.newCheckinDate || checkoutData.newDates?.checkinDate,
            newCheckoutDate: json.newCheckoutDate || checkoutData.newDates?.checkoutDate,
            newFlatNumber: json.flatNumber || checkoutData.newFlatNumber || data?.reservation?.flatNumber,
            needsReSignature: Boolean(json.needsReSignature),
            reSignatureUrl: json.reSignatureUrl || `/pre-checkin/${encodeURIComponent(currentCode)}?resign=1`
          })
          setModStep("success")
          fetchPortalData(currentCode)
        } else if (json.status === "expired") {
          clearInterval(pollInterval)
          setModPollingActive(false)
          setCheckoutError("O prazo de 30 minutos para pagamento expirou. Por favor, reinicie a alteração.")
        }
      } catch (err) {
        console.warn("[Modify Status Polling] Erro:", err)
      }
    }, 2500)

    return () => clearInterval(pollInterval)
  }, [modPollingActive, checkoutData?.pendingId, modifyModalOpen, data?.reservation?.code, code])
```

---

### 4.3. Funções Handlers de Negócio (Substituir linhas 312-358)

```tsx
  // Abertura do Modal e Inicialização
  const handleOpenModifyModal = () => {
    if (!data?.reservation) return
    const r = data.reservation
    setModStep("preview")
    setModCheckinDate(r.checkinDate || "")
    setModCheckoutDate(r.checkoutDate || "")
    setModGuestCount(r.guestCount || 1)
    setModReason("")
    setPreviewData(null)
    setPreviewError(null)
    setCheckoutData(null)
    setCheckoutError(null)
    setModPollingActive(false)
    setModifySuccessInfo(null)
    setModifyModalOpen(true)

    // Dispara a primeira simulação com os dados atuais
    if (r.checkinDate && r.checkoutDate) {
      handleRunPreview(r.checkinDate, r.checkoutDate, r.guestCount || 1)
    }
  }

  // Executa Simulação no /modify-preview
  const handleRunPreview = async (checkin = modCheckinDate, checkout = modCheckoutDate, guests = modGuestCount) => {
    if (!data?.reservation || !checkin || !checkout) return
    const currentCode = data.reservation.code || code

    if (checkout <= checkin) {
      setPreviewError("A data de check-out deve ser posterior à data de check-in.")
      setPreviewData(null)
      return
    }

    setPreviewLoading(true)
    setPreviewError(null)

    try {
      const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(currentCode)}/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: checkin,
          newCheckoutDate: checkout,
          newGuestCount: guests,
          reason: modReason
        })
      })

      const json = await res.json()

      if (res.status === 409) {
        setPreviewData({ available: false, conflictMessage: json.conflictMessage || json.message })
        setPreviewError(json.conflictMessage || json.message)
      } else if (!res.ok) {
        setPreviewError(json.message || json.error || "Erro ao consultar disponibilidade.")
        setPreviewData(null)
      } else {
        setPreviewData(json)
        setPreviewError(null)
      }
    } catch (err: any) {
      setPreviewError(err.message || "Erro de conexão com o servidor.")
      setPreviewData(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  // Avançar para Etapa 2 (Checkout com Hold de 30 Minutos)
  const handleProceedToCheckout = async () => {
    if (!data?.reservation || !previewData?.available) return
    const currentCode = data.reservation.code || code

    setCheckoutLoading(true)
    setCheckoutError(null)

    try {
      const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(currentCode)}/modify-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: modCheckinDate,
          newCheckoutDate: modCheckoutDate,
          newGuestCount: modGuestCount,
          paymentMethod: modPaymentMethod === "card" ? "credit_card" : "pix",
          reason: modReason
        })
      })

      const json = await res.json()

      if (!res.ok) {
        setCheckoutError(json.message || json.error || "Erro ao gerar cobrança de alteração.")
      } else {
        setCheckoutData(json)
        setModStep("checkout")
        setModPollingActive(true)
      }
    } catch (err: any) {
      setCheckoutError(err.message || "Erro ao conectar com o servidor.")
    } finally {
      setCheckoutLoading(false)
    }
  }

  // Cancelar Hold Provisório e Restaurar Datas Originais
  const handleCancelHold = async () => {
    if (!data?.reservation || !checkoutData?.pendingId) return
    const currentCode = data.reservation.code || code

    setCancellingHold(true)
    try {
      const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(currentCode)}/modify-cancel-pending`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingId: checkoutData.pendingId })
      })
      if (res.ok) {
        setModPollingActive(false)
        setCheckoutData(null)
        setModifyModalOpen(false)
        fetchPortalData(currentCode)
      }
    } catch (err) {
      console.error("Erro ao cancelar hold:", err)
    } finally {
      setCancellingHold(false)
    }
  }

  // Confirmar Alteração com Custo Zero (Sem Pagamento)
  const handleConfirmZeroCostModify = async () => {
    if (!data?.reservation) return
    const currentCode = data.reservation.code || code

    setCheckoutLoading(true)
    setPreviewError(null)

    try {
      const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(currentCode)}/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: modCheckinDate,
          newCheckoutDate: modCheckoutDate,
          newGuestCount: modGuestCount,
          reason: modReason
        })
      })

      const json = await res.json()

      if (res.ok) {
        setModifySuccessInfo({
          message: json.message || "Reserva modificada com sucesso!",
          newCheckinDate: json.newCheckinDate || modCheckinDate,
          newCheckoutDate: json.newCheckoutDate || modCheckoutDate,
          newFlatNumber: json.reservation?.flatNumber || data.reservation.flatNumber,
          needsReSignature: Boolean(json.needsReSignature),
          reSignatureUrl: json.reSignatureUrl || `/pre-checkin/${encodeURIComponent(currentCode)}?resign=1`
        })
        setModStep("success")
        fetchPortalData(currentCode)
      } else {
        setPreviewError(json.error || json.message || "Não foi possível confirmar a alteração.")
      }
    } catch (err: any) {
      setPreviewError(err.message || "Erro de conexão com o servidor.")
    } finally {
      setCheckoutLoading(false)
    }
  }
```

---

### 4.4. Banner de Re-Assinatura no Portal Principal (Inserir logo acima do Hero Card)

```tsx
        {/* ── Banner de Alerta M2/M3: Renovação Obrigatória de Assinatura ─── */}
        {reservation.needsReSignature && !isCancelled && (
          <div className="rounded-3xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 via-orange-50/80 to-amber-50 p-5 sm:p-6 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-sm shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-600 text-white text-[10.5px] font-bold px-2 py-0.5">
                    ⚠️ Assinatura Pendente
                  </Badge>
                  <span className="text-[11px] text-amber-900 font-semibold">
                    Alteração de Estadia / Acomodação
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-amber-950 mt-1">
                  Renovação de Assinatura da Ficha de Check-in Necessária
                </h3>
                <p className="text-xs sm:text-sm text-amber-900/90 mt-0.5 leading-relaxed">
                  As datas ou acomodação desta reserva foram modificadas. Conforme as normas legais e do condomínio, é indispensável assinar a Ficha Nacional de Registro de Hóspedes (FNRH) atualizada para liberar o seu acesso na portaria.
                </p>
              </div>
            </div>

            <Button
              type="button"
              onClick={() => setLocation(`/pre-checkin/${encodeURIComponent(reservation.code)}?resign=1`)}
              className="w-full sm:w-auto h-11 px-5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-all active:scale-95 shrink-0 flex items-center justify-center gap-2"
            >
              <FileText className="w-4.5 h-4.5" />
              <span>Assinar Nova Ficha de Check-in</span>
            </Button>
          </div>
        )}
```

---

### 4.5. JSX Completo do Modal Multi-Etapas (Substituir linhas 3117-3323)

```tsx
      {/* ── Modal Multi-Etapas: Modificar Reserva (Milestone 3) ──────────── */}
      <Dialog 
        open={modifyModalOpen} 
        onOpenChange={(open) => {
          if (!open && modStep === "checkout" && checkoutData?.pendingId) {
            if (confirm("Você possui um hold provisório ativo para estas datas. Deseja cancelar o bloqueio e manter suas datas originais?")) {
              handleCancelHold()
            }
            return
          }
          setModifyModalOpen(open)
        }}
      >
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto bg-white border border-slate-200 text-slate-900 rounded-3xl p-5 sm:p-7 shadow-2xl">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 border border-sky-200 flex items-center justify-center font-bold shadow-2xs">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-base sm:text-lg font-black text-slate-900 leading-snug">
                    {modStep === "preview" && "Modificar Estadia & Hóspedes"}
                    {modStep === "checkout" && "Pagamento da Alteração"}
                    {modStep === "success" && "Alteração Confirmada!"}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500">
                    Flat {reservation?.flatNumber} • Localizador: <strong className="font-mono text-slate-700">{reservation?.code}</strong>
                  </DialogDescription>
                </div>
              </div>

              {/* Indicador de Etapa */}
              <div className="flex items-center gap-1 shrink-0">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  modStep === "preview" ? "bg-sky-600 text-white" : "bg-emerald-100 text-emerald-700"
                }`}>
                  1
                </span>
                <span className="w-3 h-0.5 bg-slate-200" />
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  modStep === "checkout" ? "bg-sky-600 text-white" : (modStep === "success" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400")
                }`}>
                  2
                </span>
                <span className="w-3 h-0.5 bg-slate-200" />
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  modStep === "success" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"
                }`}>
                  3
                </span>
              </div>
            </div>
          </DialogHeader>

          {/* ══════════════════════════════════════════════════════════════════
              ETAPA 1: SIMULAÇÃO & PREVIEW
          ══════════════════════════════════════════════════════════════════ */}
          {modStep === "preview" && (
            <div className="space-y-4 py-2 text-xs">
              {previewError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <strong className="block font-bold">Aviso de Disponibilidade</strong>
                    <span>{previewError}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-700 font-bold text-[11px]">Nova Data de Check-in (Entrada)</Label>
                  <Input
                    type="date"
                    value={modCheckinDate}
                    onChange={(e) => {
                      const val = e.target.value
                      setModCheckinDate(val)
                      if (val && modCheckoutDate) handleRunPreview(val, modCheckoutDate, modGuestCount)
                    }}
                    required
                    className="bg-white border-slate-200 text-slate-900 rounded-xl text-xs h-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-700 font-bold text-[11px]">Nova Data de Check-out (Saída)</Label>
                  <Input
                    type="date"
                    value={modCheckoutDate}
                    onChange={(e) => {
                      const val = e.target.value
                      setModCheckoutDate(val)
                      if (modCheckinDate && val) handleRunPreview(modCheckinDate, val, modGuestCount)
                    }}
                    required
                    min={modCheckinDate || undefined}
                    className="bg-white border-slate-200 text-slate-900 rounded-xl text-xs h-10"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-slate-700 font-bold text-[11px]">Quantidade de Hóspedes</Label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4].map(num => (
                    <Button
                      key={num}
                      type="button"
                      variant={modGuestCount === num ? "default" : "outline"}
                      onClick={() => {
                        setModGuestCount(num)
                        if (modCheckinDate && modCheckoutDate) handleRunPreview(modCheckinDate, modCheckoutDate, num)
                      }}
                      className={`flex-1 h-9 rounded-xl text-xs font-bold ${
                        modGuestCount === num 
                          ? "bg-slate-900 text-white shadow-xs" 
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <Users className="w-3.5 h-3.5 mr-1" />
                      {num} {num === 1 ? "Pessoa" : "Pessoas"}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-slate-700 text-[11px]">Motivo da alteração (opcional):</Label>
                <Input
                  value={modReason}
                  onChange={e => setModReason(e.target.value)}
                  placeholder="Ex: Extensão a trabalho, reagendamento..."
                  className="bg-white border-slate-200 text-xs h-9 rounded-xl text-slate-900"
                />
              </div>

              {/* Status de Disponibilidade & Feedback */}
              {previewLoading && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center gap-2 text-slate-600 font-semibold">
                  <RefreshCw className="w-4 h-4 animate-spin text-sky-600" />
                  <span>Consultando disponibilidade e calculando valores...</span>
                </div>
              )}

              {previewData && !previewLoading && (
                <div className="space-y-3 pt-1">
                  {/* Badge de Disponibilidade */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Status do Calendário
                    </span>
                    {previewData.available ? (
                      <Badge className="bg-emerald-600 text-white font-bold text-xs py-1 px-3 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Disponível para o Período</span>
                      </Badge>
                    ) : (
                      <Badge className="bg-rose-600 text-white font-bold text-xs py-1 px-3 flex items-center gap-1.5">
                        <Ban className="w-3.5 h-3.5" />
                        <span>Indisponível / Conflito</span>
                      </Badge>
                    )}
                  </div>

                  {/* Detalhamento de Custos */}
                  <div className="p-4 bg-slate-50/90 border border-slate-200/80 rounded-2xl space-y-2.5">
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Duração da Estadia:</span>
                      <span className="font-bold text-slate-900">
                        {previewData.originalDates.nights} diárias → {previewData.newDates.nights} diárias
                        {previewData.extraNights > 0 && (
                          <span className="text-sky-600 font-bold ml-1">(+{previewData.extraNights})</span>
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-slate-600">
                      <span>Valor da Diária Base:</span>
                      <span className="font-bold text-slate-900">
                        R$ {Number(previewData.dailyRate).toFixed(2)}
                      </span>
                    </div>

                    {previewData.extraNights > 0 && (
                      <div className="flex justify-between items-center pt-2 border-t border-slate-200/60 font-bold text-sky-950">
                        <span>Acréscimo a Pagar:</span>
                        <span className="text-base text-sky-600 font-mono">
                          + R$ {Number(previewData.additionalAmountToPay).toFixed(2)}
                        </span>
                      </div>
                    )}

                    {previewData.refundAmount > 0 && (
                      <div className="flex justify-between items-center pt-2 border-t border-slate-200/60 font-bold text-emerald-950">
                        <span>Estorno / Crédito Elegível:</span>
                        <span className="text-base text-emerald-600 font-mono">
                          - R$ {Number(previewData.refundAmount).toFixed(2)}
                        </span>
                      </div>
                    )}

                    {!previewData.requiresPayment && previewData.refundAmount <= 0 && (
                      <div className="flex justify-between items-center pt-2 border-t border-slate-200/60 font-bold text-slate-800">
                        <span>Acréscimo Financeiro:</span>
                        <span className="text-emerald-600 font-bold">R$ 0,00 (Sem custo adicional)</span>
                      </div>
                    )}
                  </div>

                  {/* Aviso da Regra de 24h */}
                  {previewData.isUnder24h && previewData.nonRefundableReduction && (
                    <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                      <AlertTriangle className="w-4.5 h-4.5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <strong className="block font-bold">Regra de Cancelamento / Redução (Menos de 24h)</strong>
                        <p className="text-[11px] leading-relaxed text-amber-800">
                          A redução de diárias ou hóspedes com menos de 24h do início da estadia não confere direito a estorno ou reembolso conforme as condições contratuais.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModifyModalOpen(false)}
                  className="rounded-xl border-slate-200 text-slate-700"
                >
                  Cancelar
                </Button>

                {previewData?.available && previewData?.requiresPayment && (
                  <Button
                    type="button"
                    disabled={checkoutLoading}
                    onClick={handleProceedToCheckout}
                    className="font-bold text-xs rounded-xl bg-sky-600 hover:bg-sky-700 text-white shadow-xs gap-1.5"
                  >
                    <span>{checkoutLoading ? "Gerando Cobrança..." : `Continuar para Pagamento (R$ ${Number(previewData.additionalAmountToPay).toFixed(2)})`}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                )}

                {previewData?.available && !previewData?.requiresPayment && (
                  <Button
                    type="button"
                    disabled={checkoutLoading}
                    onClick={handleConfirmZeroCostModify}
                    className="font-bold text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{checkoutLoading ? "Confirmando..." : "Confirmar Alteração de Datas"}</span>
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              ETAPA 2: CHECKOUT COM HOLD DE 30 MINUTOS
          ══════════════════════════════════════════════════════════════════ */}
          {modStep === "checkout" && checkoutData && (
            <div className="space-y-4 py-2 text-xs">
              {checkoutError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{checkoutError}</span>
                </div>
              )}

              {/* Banner de Hold Provisório com Cronômetro */}
              <div className="p-3.5 bg-sky-50 rounded-2xl border border-sky-200 flex items-center justify-between gap-3 text-sky-950">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-sky-600 shrink-0" />
                  <div>
                    <span className="font-bold block text-xs">Bloqueio Provisório de 30 Minutos</span>
                    <span className="text-[11px] text-sky-800">Suas datas estão reservadas enquanto conclui o pagamento.</span>
                  </div>
                </div>
                <Badge variant="outline" className="bg-white border-sky-300 font-mono font-bold text-sm px-2.5 py-1 text-sky-700 shrink-0">
                  ⏳ {modTimeRemaining}
                </Badge>
              </div>

              {/* Caixa de Valor Adicional */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/90 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                    Valor Adicional a Liquidar
                  </span>
                  <span className="text-xs text-slate-600">
                    Novas datas: {checkoutData.newDates?.checkinDate} até {checkoutData.newDates?.checkoutDate}
                  </span>
                </div>
                <span className="text-2xl font-black text-slate-900 font-mono">
                  R$ {Number(checkoutData.additionalAmountToPay).toFixed(2)}
                </span>
              </div>

              {/* Seletor de Método de Pagamento */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setModPaymentMethod("pix")}
                  className={`p-3 rounded-2xl border text-center font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                    modPaymentMethod === "pix"
                      ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  <span>PIX Instantâneo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModPaymentMethod("card")}
                  className={`p-3 rounded-2xl border text-center font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                    modPaymentMethod === "card"
                      ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Cartão de Crédito</span>
                </button>
              </div>

              {/* ABA PIX */}
              {modPaymentMethod === "pix" && (
                <div className="space-y-3.5 p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                  {checkoutData.pixQrCodeUrl && (
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="p-2.5 bg-white border border-slate-200 rounded-2xl shadow-xs">
                        <img
                          src={checkoutData.pixQrCodeUrl}
                          alt="QR Code PIX para Alteração"
                          className="w-44 h-44 rounded-xl"
                        />
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium text-center">
                        Abra o app do seu banco e aponte a câmera para o QR Code.
                      </span>
                    </div>
                  )}

                  {checkoutData.pixCopiaECola && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-slate-700">PIX Copia e Cola:</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(checkoutData.pixCopiaECola)
                            setModCopiedPix(true)
                            setTimeout(() => setModCopiedPix(false), 3000)
                          }}
                          className="text-xs font-bold text-sky-700 hover:text-sky-800 flex items-center gap-1"
                        >
                          {modCopiedPix ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{modCopiedPix ? "Código Copiado!" : "Copiar Código PIX"}</span>
                        </button>
                      </div>

                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 font-mono text-[11px] text-slate-700 break-all select-all max-h-16 overflow-y-auto">
                        {checkoutData.pixCopiaECola}
                      </div>

                      <Button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(checkoutData.pixCopiaECola)
                          setModCopiedPix(true)
                          setTimeout(() => setModCopiedPix(false), 3000)
                        }}
                        className="w-full h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 mt-2 shadow-xs"
                      >
                        {modCopiedPix ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        <span>{modCopiedPix ? "Código PIX Copiado com Sucesso!" : "Copiar Código PIX"}</span>
                      </Button>
                    </div>
                  )}

                  {/* Feedback de Polling Ativo */}
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-center gap-2 text-emerald-800 font-semibold text-xs">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                    <span>Aguardando confirmação bancária em tempo real...</span>
                  </div>
                </div>
              )}

              {/* ABA CARTÃO DE CRÉDITO */}
              {modPaymentMethod === "card" && (
                <div className="space-y-3.5 p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                  <div className="text-center space-y-2 py-2">
                    <CreditCard className="w-10 h-10 text-sky-600 mx-auto" />
                    <h4 className="font-bold text-slate-900 text-sm">Checkout Seguro Mercado Pago</h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                      Você será redirecionado para o ambiente protegido do Mercado Pago para efetuar o pagamento com cartão de crédito.
                    </p>
                  </div>

                  {checkoutData.mpCheckoutUrl && (
                    <a
                      href={checkoutData.mpCheckoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full h-11 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Pagar no Mercado Pago ↗</span>
                    </a>
                  )}

                  {/* Feedback de Polling Ativo */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center gap-2 text-slate-600 font-semibold text-xs text-center">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-600" />
                    <span>Após concluir o pagamento, esta tela atualizará automaticamente.</span>
                  </div>
                </div>
              )}

              <DialogFooter className="flex flex-col sm:flex-row justify-between gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  disabled={cancellingHold}
                  onClick={handleCancelHold}
                  className="rounded-xl border-rose-200 bg-rose-50/60 hover:bg-rose-100 text-rose-800 text-xs font-bold"
                >
                  {cancellingHold ? "Cancelando Bloqueio..." : "Cancelar e Manter Datas Originais"}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setModStep("preview")}
                  className="rounded-xl text-slate-600 text-xs font-semibold"
                >
                  ← Voltar à Simulação
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              ETAPA 3: SUCESSO & PROMPT DE RE-ASSINATURA OBRIGATÓRIA (R3)
          ══════════════════════════════════════════════════════════════════ */}
          {modStep === "success" && modifySuccessInfo && (
            <div className="space-y-4 py-3 text-xs">
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-emerald-950">
                    Estadia Alterada com Sucesso!
                  </h3>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    {modifySuccessInfo.message}
                  </p>
                </div>
              </div>

              {/* Demonstrativo das Novas Datas */}
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2 text-slate-700">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block border-b border-slate-200 pb-1">
                  Resumo da Hospedagem Atualizada
                </span>
                <div className="flex justify-between">
                  <span>Novo Período:</span>
                  <strong className="text-slate-900 font-bold">
                    {modifySuccessInfo.newCheckinDate} até {modifySuccessInfo.newCheckoutDate}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>Acomodação:</span>
                  <strong className="text-slate-900 font-bold">
                    Flat {modifySuccessInfo.newFlatNumber}
                  </strong>
                </div>
              </div>

              {/* ALERTA CRÍTICO: RE-ASSINATURA OBRIGATÓRIA DA FICHA DE CHECK-IN */}
              {modifySuccessInfo.needsReSignature && (
                <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border-2 border-amber-300 shadow-xs space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <strong className="block text-amber-950 font-bold text-sm">
                        Assinatura da Ficha de Check-in Necessária
                      </strong>
                      <p className="text-xs text-amber-900 mt-1 leading-relaxed">
                        Como as datas ou a acomodação da sua reserva foram alteradas, sua assinatura digital anterior foi invalidada. É obrigatório assinar a nova Ficha Nacional de Registro de Hóspedes (FNRH) com as informações atualizadas.
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={() => {
                      setModifyModalOpen(false)
                      setLocation(modifySuccessInfo.reSignatureUrl || `/pre-checkin/${encodeURIComponent(reservation?.code || code)}?resign=1`)
                    }}
                    className="w-full h-11 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    <FileText className="w-4.5 h-4.5" />
                    <span>Assinar Nova Ficha de Check-in Agora →</span>
                  </Button>
                </div>
              )}

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModifyModalOpen(false)}
                  className="w-full h-10 rounded-xl border-slate-200 text-slate-700 font-bold text-xs"
                >
                  Concluir e Voltar ao Painel
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
```

---

## 5. Garantias de Qualidade & Não-Regressão

1. **Paridade com as Regras do Projeto**:
   - Nenhuma alteração no código de produção foi realizada neste modo de exploração.
   - O blueprint acima está pronto para aplicação atômica pelo Agente Implementador.
2. **Compatibilidade Rigorosa de Tipos**:
   - Utiliza as propriedades retornadas pelos endpoints de Milestone 1 testados em `tests/m1-reservation-modification-settlement.test.mjs`.
3. **Resiliência do Hóspede**:
   - O hóspede pode cancelar o hold provisório a qualquer momento em Step 2 com `handleCancelHold`, liberando o calendário no backend sem deixar lixo no banco.
   - O cronômetro e o polling automático garantem que a tela reaja imediatamente sem exigir refresh manual da página.

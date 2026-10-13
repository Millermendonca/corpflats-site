# Análise Técnica & Blueprints: Banner de Re-assinatura & Fast-Track no Pré-Checkin (Milestone 3)

**Autor**: M3 Explorer 2 (`m3_explorer_2`)  
**Data**: 2026-10-11T15:55:00Z  
**Escopo**: Milestone 3 — Guest Portal UI Flow, Modals & Operational Panels  
**Arquivos de Foco**:
- `artifacts/limpeza/src/pages/guest-portal.tsx`
- `artifacts/limpeza/src/pages/guest-pre-checkin.tsx`
- Suporte no backend: `artifacts/api-server/demo-server.mjs` & `scripts/demo-server.mjs` (Paridade SHA-256)

---

## 1. Visão Geral da Arquitetura & Fluxo do Usuário

Quando uma reserva confirmada tem suas datas ou flat alterados (seja pelo autoatendimento do Portal ou pelo painel do PMS Admin):
1. O backend invalida a FNRH anterior, limpando a assinatura antiga e setando `needsReSignature = true` (na reserva e nos hóspedes individuais).
2. O hóspede acessa o Portal (`/minha-reserva/:code`):
   - **Banner de Alerta no Topo**: Destacado, com fundo âmbar/laranja de alto contraste, texto explicativo regulatório e botão de ação direta `"Assinar Termo Atualizado"`.
   - **Card da Reserva (Check-in/Entrada)**: Substitui o status "Dados Enviados" por "⚠️ Re-assinatura Obrigatória" e botão de ação direta.
   - **Navbar / Menu Mobile**: Exibe o botão de ação rápida pulsante para re-assinatura.
3. Ao clicar em `"Assinar Termo Atualizado"`, o hóspede é direcionado para:
   `/pre-checkin/${reservation.code}?resign=1`
4. Na página de Pré-Check-in (`guest-pre-checkin.tsx`):
   - **Preservação Total de Dados (Fast-Track)**: Nome, CPF, e-mail, telefone, endereço residencial completo, dados do veículo e fotos (documento de identidade e selfie) já preenchidos anteriormente são 100% preservados. O hóspede não digita nada novamente.
   - **Canvas de Assinatura Limpo**: A assinatura antiga revogada é descartada (`signatureData = null`), deixando o quadro de desenho limpo e pronto para a nova assinatura.
   - **Salto Automático para o Passo 3**: O usuário entra diretamente na etapa de assinatura (ou pode revisar os passos anteriores se desejar).
   - **Banner Informativo Expresso**: Exibe o motivo da atualização das datas/acomodação.
5. Ao confirmar a nova assinatura:
   - Envia `POST /api/pms/pre-checkin` com `resign: "1"`, a nova assinatura em Base64 e o código OTP 2FA.
   - O backend gera novo PDF com carimbo de tempo forense e hash SHA-256, sincroniza a portaria e envia por e-mail para a recepção.
   - O frontend redireciona de volta para `/minha-reserva/${reservation.code}?resign_success=1`, exibindo banner de confirmação e acesso liberado.

---

## 2. Diagnóstico & Descobertas Críticas no Código Atual

### 2.1 Descoberta 1: Falta da projeção de `needsReSignature` em `GET /api/pms/guest-portal/:code`
- **Arquivo**: `artifacts/api-server/demo-server.mjs:15090-15142` (e `scripts/demo-server.mjs`).
- **Problema**: O endpoint projeta campos específicos da reserva em `res.json({ reservation: { ... } })`. Embora `r.needsReSignature = true` seja persistido no banco de dados, esse campo não estava listado na projeção retornada para o Portal do Hóspede.
- **Solução**: Adicionar `needsReSignature`, `reSignatureReason` e `reSignatureUrl` na projeção da reserva em `demo-server.mjs` (mantendo paridade exata de 100% entre `artifacts/api-server/` e `scripts/`).

### 2.2 Descoberta 2: Ícone `AlertTriangle` não importado em `guest-pre-checkin.tsx`
- **Arquivo**: `artifacts/limpeza/src/pages/guest-pre-checkin.tsx:11-15, 2070`.
- **Problema**: A linha 2070 utiliza `<AlertTriangle className="..." />`, mas `AlertTriangle` não está na lista de imports de `"lucide-react"`. Isso quebraria a compilação do TypeScript (`npm run build`).
- **Solução**: Incluir `AlertTriangle` na declaração de importação do `lucide-react`.

### 2.3 Descoberta 3: Ícone `PenTool` não importado em `guest-portal.tsx`
- **Arquivo**: `artifacts/limpeza/src/pages/guest-portal.tsx:10-18`.
- **Problema**: O botão de re-assinatura utilizará o ícone `PenTool`, mas ele não está importado de `"lucide-react"`.
- **Solução**: Adicionar `PenTool` na lista de imports do `lucide-react` em `guest-portal.tsx`.

### 2.4 Descoberta 4: Cálculo de `isPreCheckinDone` no Portal
- **Arquivo**: `artifacts/limpeza/src/pages/guest-portal.tsx:460-470`.
- **Problema**: Atualmente, `isPreCheckinDone` considerava check-ins anteriores mesmo quando `needsReSignature === true`.
- **Solução**: `isPreCheckinDone` deve ser falso se `needsReSignature === true`, forçando o card e a interface a exigirem a re-assinatura atualizada.

---

## 3. Drop-In Code Blueprint: `artifacts/limpeza/src/pages/guest-portal.tsx`

### Modificação 1: Adicionar `PenTool` aos imports (Linhas 10-18)
```tsx
<<<< ORIGINAL
import { 
  Building2, Star, RotateCcw, Calendar, Users, User, Coffee, ShieldCheck, 
  Sparkles, CheckCircle2, ArrowRight, Clock, KeyRound, 
  MessageCircle, FileText, Ban, AlertTriangle, ChevronRight,
  Wifi, HelpCircle, Check, Copy, Phone, UserCheck, ShieldAlert,
  MapPin, Navigation, ExternalLink, Car, ArrowLeft, Search,
  CreditCard, QrCode, RefreshCw, AlertCircle, DoorOpen, MoreVertical,
  Download, Printer
} from "lucide-react"
====
import { 
  Building2, Star, RotateCcw, Calendar, Users, User, Coffee, ShieldCheck, 
  Sparkles, CheckCircle2, ArrowRight, Clock, KeyRound, 
  MessageCircle, FileText, Ban, AlertTriangle, ChevronRight,
  Wifi, HelpCircle, Check, Copy, Phone, UserCheck, ShieldAlert,
  MapPin, Navigation, ExternalLink, Car, ArrowLeft, Search,
  CreditCard, QrCode, RefreshCw, AlertCircle, DoorOpen, MoreVertical,
  Download, Printer, PenTool
} from "lucide-react"
>>>>
```

### Modificação 2: Suporte a `needsReSignature`, `reSignatureReason` e `getCheckinPath` (Linhas 445-478)
```tsx
<<<< ORIGINAL
  const isCurrentGuestTitular = Number(currentGuest?.index || activeGuestIndex) === 1

  const isCurrentGuestPreCheckinDone = Boolean(
    currentGuest?.hasCompletedCheckin ||
    currentGuest?.status === "CHECKED_IN" ||
    currentGuest?.fnrhSignedAt ||
    currentGuest?.signatureUrl ||
    (guestsList.length === 1 && (
      reservation?.fnhrCompleted ||
      reservation?.preCheckinCompleted ||
      reservation?.hasPreCheckin
    ))
  )

  const isPreCheckinDone = guestsList.length > 1
    ? isCurrentGuestPreCheckinDone
    : Boolean(
        data?.preCheckinStatus?.completed ||
        data?.preCheckinStatus?.isFullyCompleted ||
        reservation?.fnhrCompleted ||
        reservation?.preCheckinCompleted ||
        reservation?.hasPreCheckin ||
        (Array.isArray(reservation?.guests) && reservation.guests.length > 0 && reservation.guests.some((g: any) => g.hasCompletedCheckin))
      )

  const getCheckinPath = (readonly = false) => {
    const c = code || reservation?.code || ""
    const gParam = activeGuestIndex > 1 ? `guest=${activeGuestIndex}` : ""
    const roParam = readonly ? "readonly=true" : ""
    const parts = [gParam, roParam].filter(Boolean).join("&")
    return `/pre-checkin/${c}${parts ? `?${parts}` : ""}`
  }
====
  const isCurrentGuestTitular = Number(currentGuest?.index || activeGuestIndex) === 1

  const needsReSignature = Boolean(
    reservation?.needsReSignature ||
    (currentGuest && currentGuest.needsReSignature)
  )

  const reSignatureReason = reservation?.reSignatureReason || 
    "Sua reserva teve as datas ou acomodação alteradas. É obrigatório assinar a declaração atualizada para liberar o acesso ao condomínio."

  const isCurrentGuestPreCheckinDone = !needsReSignature && Boolean(
    currentGuest?.hasCompletedCheckin ||
    currentGuest?.status === "CHECKED_IN" ||
    currentGuest?.fnrhSignedAt ||
    currentGuest?.signatureUrl ||
    (guestsList.length === 1 && (
      reservation?.fnhrCompleted ||
      reservation?.preCheckinCompleted ||
      reservation?.hasPreCheckin
    ))
  )

  const isPreCheckinDone = !needsReSignature && (guestsList.length > 1
    ? isCurrentGuestPreCheckinDone
    : Boolean(
        data?.preCheckinStatus?.completed ||
        data?.preCheckinStatus?.isFullyCompleted ||
        reservation?.fnhrCompleted ||
        reservation?.preCheckinCompleted ||
        reservation?.hasPreCheckin ||
        (Array.isArray(reservation?.guests) && reservation.guests.length > 0 && reservation.guests.some((g: any) => g.hasCompletedCheckin))
      ))

  const getCheckinPath = (readonly = false) => {
    const c = code || reservation?.code || ""
    const gParam = activeGuestIndex > 1 ? `guest=${activeGuestIndex}` : ""
    const roParam = readonly ? "readonly=true" : ""
    const resignParam = needsReSignature ? "resign=1" : ""
    const parts = [gParam, roParam, resignParam].filter(Boolean).join("&")
    return `/pre-checkin/${c}${parts ? `?${parts}` : ""}`
  }
>>>>
```

### Modificação 3: Botão de Ação Rápida na Navbar Desktop e Mobile Dropdown (Linhas 1404-1420 & 1484-1495)
```tsx
<<<< ORIGINAL
            {!hasEnteredFlat && !isPreCheckinDone && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLocation(getCheckinPath(false))}
                className="hidden md:inline-flex h-9 px-3 rounded-xl border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs items-center gap-2 shadow-2xs"
              >
                <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Pré-Check-in</span>
              </Button>
            )}
====
            {!hasEnteredFlat && needsReSignature && (
              <Button
                type="button"
                size="sm"
                onClick={() => setLocation(getCheckinPath(false))}
                className="hidden md:inline-flex h-9 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs items-center gap-2 shadow-sm animate-pulse"
              >
                <PenTool className="w-4 h-4 shrink-0" />
                <span>Assinar Termo Atualizado</span>
              </Button>
            )}
            {!hasEnteredFlat && !needsReSignature && !isPreCheckinDone && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLocation(getCheckinPath(false))}
                className="hidden md:inline-flex h-9 px-3 rounded-xl border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs items-center gap-2 shadow-2xs"
              >
                <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Pré-Check-in</span>
              </Button>
            )}
>>>>
```

E no menu mobile dropdown (linhas 1484-1495):
```tsx
<<<< ORIGINAL
                  {!hasEnteredFlat && !isPreCheckinDone && (
                    <DropdownMenuItem
                      onClick={() => setLocation(getCheckinPath(false))}
                      className="flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold rounded-xl cursor-pointer hover:bg-slate-100 text-indigo-700"
                    >
                      <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>Pré-Check-in Digital</span>
                    </DropdownMenuItem>
                  )}
====
                  {!hasEnteredFlat && needsReSignature && (
                    <DropdownMenuItem
                      onClick={() => setLocation(getCheckinPath(false))}
                      className="flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold rounded-xl cursor-pointer hover:bg-amber-50 text-amber-900"
                    >
                      <PenTool className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Assinar Termo Atualizado</span>
                    </DropdownMenuItem>
                  )}
                  {!hasEnteredFlat && !needsReSignature && !isPreCheckinDone && (
                    <DropdownMenuItem
                      onClick={() => setLocation(getCheckinPath(false))}
                      className="flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold rounded-xl cursor-pointer hover:bg-slate-100 text-indigo-700"
                    >
                      <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>Pré-Check-in Digital</span>
                    </DropdownMenuItem>
                  )}
>>>>
```

### Modificação 4: Banner de Re-assinatura Obrigatória no Topo do `<main>` (Logo após a linha 1557)
```tsx
<<<< ORIGINAL
      {/* ── Main Container ──────────────────────────────────────────────── */}
      <main className="max-w-4xl w-full mx-auto px-4 py-6 sm:py-8 space-y-6">
        
        {/* ── Banner de Alerta: Reserva Cancelada ───────────────────────── */}
====
      {/* ── Main Container ──────────────────────────────────────────────── */}
      <main className="max-w-4xl w-full mx-auto px-4 py-6 sm:py-8 space-y-6">
        
        {/* ── Banner de Alerta: Re-assinatura Obrigatória (Datas ou Flat Alterados) ── */}
        {!isCancelled && needsReSignature && (
          <div className="rounded-3xl border-2 border-amber-400 bg-gradient-to-r from-amber-50 via-orange-50/80 to-amber-50 p-5 sm:p-6 shadow-md space-y-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-sm shrink-0">
                  <PenTool className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-amber-600 text-white text-[10.5px] font-bold px-2 py-0.5">
                      ⚠️ ASSINATURA PENDENTE • ATUALIZAÇÃO OBRIGATÓRIA
                    </Badge>
                    <span className="text-[11px] text-amber-800 font-semibold font-mono">
                      Flat {reservation.flatNumber} • {reservation.code}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-amber-950 mt-1">
                    Declaração de Check-in Requer Nova Assinatura
                  </h2>
                  <p className="text-xs sm:text-sm text-amber-900/90 mt-0.5 leading-relaxed max-w-2xl">
                    Sua reserva teve as datas ou acomodação alteradas. É obrigatório assinar a declaração atualizada para liberar o acesso ao condomínio.
                  </p>
                </div>
              </div>

              <div className="shrink-0 w-full sm:w-auto">
                <Button
                  type="button"
                  onClick={() => setLocation(getCheckinPath(false))}
                  className="w-full sm:w-auto h-11 px-5 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all"
                >
                  <PenTool className="w-4 h-4" />
                  <span>Assinar Termo Atualizado</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="p-3 bg-white/80 rounded-xl border border-amber-200/80 text-xs text-amber-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Seus dados e documentos estão salvos:</strong> você só precisará conferir as novas informações da estadia e assinar digitalmente.
              </span>
            </div>
          </div>
        )}

        {/* ── Banner de Confirmação: Re-assinatura Concluída com Sucesso ─────────── */}
        {typeof window !== "undefined" && new URLSearchParams(window.location.search).get("resign_success") === "1" && !needsReSignature && (
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-lg flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black tracking-tight">
                  ✓ Ficha de Check-in Re-assinada com Sucesso!
                </h3>
                <p className="text-xs sm:text-sm text-emerald-50 leading-relaxed mt-0.5">
                  Sua declaração atualizada com as novas datas e acomodação foi autenticada e enviada para a portaria. O acesso ao condomínio está 100% liberado!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Banner de Alerta: Reserva Cancelada ───────────────────────── */}
>>>>
```

### Modificação 5: Card de Entrada/Check-in com Aviso e Botão de Re-assinatura (Linhas 1775-1856)
```tsx
<<<< ORIGINAL
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider block">
                    Check-in (Entrada)
                  </span>
                  {hasEnteredFlat ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 font-bold text-[10px]">
                      ✓ Entrada Confirmada
                    </Badge>
                  ) : isPreCheckinDone ? (
                    <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-300 font-bold text-[10px]">
                      ✓ Dados Enviados
                    </Badge>
                  ) : (
                    <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                      Autoatendimento
                    </span>
                  )}
                </div>
                <span className="text-sm sm:text-base font-bold text-slate-900 block mt-0.5">
                  {checkinFormatted}
                </span>
                <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>A partir das {data?.checkinTime || "14:00"} (antecipado assim que limpo)</span>
                </span>
              </div>

              {hasEnteredFlat ? (
                <div className="space-y-1.5 mt-2">
                  <div className="w-full h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-bold flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                    <span>Entrada Realizada no Flat</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocation(getCheckinPath(true))}
                    className="text-[11px] text-slate-500 hover:text-slate-700 text-center w-full underline"
                  >
                    Ver Dados do Check-in
                  </button>
                </div>
              ) : isPreCheckinDone ? (
                <div className="space-y-1.5 mt-2">
                  <Button
                    type="button"
                    disabled={confirmingSelfCheckin}
                    onClick={async () => {
                      try {
                        setConfirmingSelfCheckin(true)
                        const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(code || reservation.code)}/self-checkin`, { method: "POST" })
                        if (res.ok) {
                          setSelfCheckinNotice(true)
                          await fetchPortalData(code || reservation.code)
                        }
                      } catch {}
                      finally {
                        setConfirmingSelfCheckin(false)
                      }
                    }}
                    className="w-full h-10 text-xs sm:text-sm font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4.5 h-4.5 shrink-0" />
                    <span>{confirmingSelfCheckin ? "Confirmando..." : "📍 Já Cheguei no Flat (Confirmar Entrada)"}</span>
                  </Button>
                  <button
                    type="button"
                    onClick={() => setLocation(getCheckinPath(true))}
                    className="text-[11px] text-slate-500 hover:text-slate-700 text-center w-full underline"
                  >
                    Ver Dados do Check-in
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={() => setLocation(getCheckinPath(false))}
                  className="w-full h-10 text-xs sm:text-sm font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all active:scale-95 flex items-center justify-center gap-2 mt-2"
                >
                  <FileText className="w-4.5 h-4.5 shrink-0" />
                  <span>Pré-Check-in Digital</span>
                </Button>
              )}
====
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider block">
                    Check-in (Entrada)
                  </span>
                  {hasEnteredFlat ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 font-bold text-[10px]">
                      ✓ Entrada Confirmada
                    </Badge>
                  ) : needsReSignature ? (
                    <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 font-bold text-[10px] animate-pulse">
                      ⚠️ Re-assinatura Obrigatória
                    </Badge>
                  ) : isPreCheckinDone ? (
                    <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-300 font-bold text-[10px]">
                      ✓ Dados Enviados
                    </Badge>
                  ) : (
                    <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                      Autoatendimento
                    </span>
                  )}
                </div>
                <span className="text-sm sm:text-base font-bold text-slate-900 block mt-0.5">
                  {checkinFormatted}
                </span>
                <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>A partir das {data?.checkinTime || "14:00"} (antecipado assim que limpo)</span>
                </span>
              </div>

              {needsReSignature ? (
                <div className="space-y-2 mt-2">
                  <div className="p-2.5 rounded-xl bg-amber-100/90 border border-amber-300 text-amber-950 text-xs font-medium leading-snug">
                    <span className="font-bold block text-amber-900 mb-0.5">⚠️ Assinatura Atualizada Obrigatória</span>
                    Sua reserva teve as datas ou acomodação alteradas. É obrigatório assinar a declaração atualizada para liberar o acesso ao condomínio.
                  </div>
                  <Button
                    type="button"
                    onClick={() => setLocation(getCheckinPath(false))}
                    className="w-full h-10 text-xs sm:text-sm font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <PenTool className="w-4.5 h-4.5 shrink-0" />
                    <span>Assinar Termo Atualizado</span>
                  </Button>
                </div>
              ) : hasEnteredFlat ? (
                <div className="space-y-1.5 mt-2">
                  <div className="w-full h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-bold flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                    <span>Entrada Realizada no Flat</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocation(getCheckinPath(true))}
                    className="text-[11px] text-slate-500 hover:text-slate-700 text-center w-full underline"
                  >
                    Ver Dados do Check-in
                  </button>
                </div>
              ) : isPreCheckinDone ? (
                <div className="space-y-1.5 mt-2">
                  <Button
                    type="button"
                    disabled={confirmingSelfCheckin}
                    onClick={async () => {
                      try {
                        setConfirmingSelfCheckin(true)
                        const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(code || reservation.code)}/self-checkin`, { method: "POST" })
                        if (res.ok) {
                          setSelfCheckinNotice(true)
                          await fetchPortalData(code || reservation.code)
                        }
                      } catch {}
                      finally {
                        setConfirmingSelfCheckin(false)
                      }
                    }}
                    className="w-full h-10 text-xs sm:text-sm font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4.5 h-4.5 shrink-0" />
                    <span>{confirmingSelfCheckin ? "Confirmando..." : "📍 Já Cheguei no Flat (Confirmar Entrada)"}</span>
                  </Button>
                  <button
                    type="button"
                    onClick={() => setLocation(getCheckinPath(true))}
                    className="text-[11px] text-slate-500 hover:text-slate-700 text-center w-full underline"
                  >
                    Ver Dados do Check-in
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={() => setLocation(getCheckinPath(false))}
                  className="w-full h-10 text-xs sm:text-sm font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all active:scale-95 flex items-center justify-center gap-2 mt-2"
                >
                  <FileText className="w-4.5 h-4.5 shrink-0" />
                  <span>Pré-Check-in Digital</span>
                </Button>
              )}
>>>>
```

---

## 4. Drop-In Code Blueprint: `artifacts/limpeza/src/pages/guest-pre-checkin.tsx`

### Modificação 1: Importar `AlertTriangle` de `"lucide-react"` (Linhas 11-15)
```tsx
<<<< ORIGINAL
import { 
  Building2, User, Phone, Mail, Camera, FileText, CheckCircle2, 
  MapPin, ShieldCheck, ArrowRight, ArrowLeft, PenTool, AlertCircle, Zap, Car,
  Printer, Edit3, Share2, Eye, ZoomIn, Download, ExternalLink, MessageCircle, Clock, Calendar, Check, Ban, Lock, Award, KeyRound, Search, RefreshCw, Copy
} from "lucide-react"
====
import { 
  Building2, User, Phone, Mail, Camera, FileText, CheckCircle2, 
  MapPin, ShieldCheck, ArrowRight, ArrowLeft, PenTool, AlertCircle, AlertTriangle, Zap, Car,
  Printer, Edit3, Share2, Eye, ZoomIn, Download, ExternalLink, MessageCircle, Clock, Calendar, Check, Ban, Lock, Award, KeyRound, Search, RefreshCw, Copy
} from "lucide-react"
>>>>
```

### Modificação 2: Suporte a `resign=1` na Inicialização do Step (Linhas 72-79)
```tsx
<<<< ORIGINAL
  const [step, setStep] = useState(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search)
      const st = parseInt(sp.get("step") || "1", 10)
      if (st >= 1 && st <= 3) return st
    }
    return 1
  })
====
  const isResignParam = useMemo(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search)
      return sp.get("resign") === "1"
    }
    return false
  }, [])

  const [step, setStep] = useState(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search)
      if (sp.get("resign") === "1" && !sp.get("step")) return 3
      const st = parseInt(sp.get("step") || "1", 10)
      if (st >= 1 && st <= 3) return st
    }
    return 1
  })
>>>>
```

### Modificação 3: Fast-Track & Limpeza do Canvas em `loadGuestData` (Linhas 600-641)
```tsx
<<<< ORIGINAL
    // Isolamento estrito de fotos e biometria:
    // Hóspede 1: pode ler do cadastro titular
    // Hóspede 2+: lê SOMENTE de currentG (NUNCA herda fotos do hóspede 1!)
    const selfie = currentG?.selfieUrl || (isTitular ? (res.selfieUrl || guest.photoUrl || null) : null)
    const doc = currentG?.docPhotoUrl || (isTitular ? (res.docPhotoUrl || guest.docPhotoUrl || null) : null)
    const isReSignatureNeeded = Boolean(res.needsReSignature || currentG?.needsReSignature)
    const sig = isReSignatureNeeded ? null : (currentG?.signatureUrl || (isTitular ? res.signatureUrl : null))

    setSelfiePhoto(selfie || null)
    setDocPhoto(doc || null)
    setSignatureData(sig || null)

    // O Hóspede só é considerado concluído se ELE MESMO (currentG) tiver check-in feito nesta reserva!
    const fnhrDone = Boolean(
      !isReSignatureNeeded && (
        currentG?.hasCompletedCheckin || 
        (isTitular && res.fnhrCompleted && res.signatureUrl && selfie)
      )
    )

    // Detecção de cadastro prévio / hóspede frequente salvo
    const hasPreviousProfile = Boolean(
      (isTitular && (guest.fnhrCompleted || guest.id)) ||
      (doc && gName && gDoc) ||
      currentG?.hasCompletedCheckin
    )
    setIsReturningGuest(hasPreviousProfile)

    if (currentG?.checkinCompletedAt || (isTitular && res.updatedAt)) {
      setCompletedTimestamp(currentG?.checkinCompletedAt || res.updatedAt)
    } else {
      setCompletedTimestamp(null)
    }

    if (isReadOnlyDocument) {
      setIsCompleted(true)
      setIsEditing(false)
    } else {
      setIsCompleted(fnhrDone)
      setIsEditing(!fnhrDone)
    }
====
    // Isolamento estrito de fotos e biometria:
    // Hóspede 1: pode ler do cadastro titular
    // Hóspede 2+: lê SOMENTE de currentG (NUNCA herda fotos do hóspede 1!)
    const selfie = currentG?.selfieUrl || (isTitular ? (res.selfieUrl || guest.photoUrl || null) : null)
    const doc = currentG?.docPhotoUrl || (isTitular ? (res.docPhotoUrl || guest.docPhotoUrl || null) : null)
    const isReSignatureNeeded = Boolean(
      isResignParam || 
      res.needsReSignature || 
      currentG?.needsReSignature
    )
    const sig = isReSignatureNeeded ? null : (currentG?.signatureUrl || (isTitular ? res.signatureUrl : null))

    setSelfiePhoto(selfie || null)
    setDocPhoto(doc || null)
    setSignatureData(sig || null)

    // O Hóspede só é considerado concluído se ELE MESMO (currentG) tiver check-in feito nesta reserva E não precisar re-assinar!
    const fnhrDone = Boolean(
      !isReSignatureNeeded && (
        currentG?.hasCompletedCheckin || 
        (isTitular && res.fnhrCompleted && res.signatureUrl && selfie)
      )
    )

    // Detecção de cadastro prévio / hóspede frequente salvo
    const hasPreviousProfile = Boolean(
      (isTitular && (guest.fnhrCompleted || guest.id)) ||
      (doc && gName && gDoc) ||
      currentG?.hasCompletedCheckin
    )
    setIsReturningGuest(hasPreviousProfile)

    if (currentG?.checkinCompletedAt || (isTitular && res.updatedAt)) {
      setCompletedTimestamp(currentG?.checkinCompletedAt || res.updatedAt)
    } else {
      setCompletedTimestamp(null)
    }

    if (isReadOnlyDocument) {
      setIsCompleted(true)
      setIsEditing(false)
    } else if (isReSignatureNeeded) {
      setIsCompleted(false)
      setIsEditing(true)
      // Fast-track: se já possui os dados cadastrais preservados e não há ?step= na URL, direciona diretamente para o Passo 3 (Assinatura)
      const hasBaseData = Boolean(gName && gDoc && gPhone)
      if (hasBaseData && !new URLSearchParams(window.location.search).get("step")) {
        setStep(3)
      }
    } else {
      setIsCompleted(fnhrDone)
      setIsEditing(!fnhrDone)
    }
>>>>
```

### Modificação 4: Envio de `resign: "1"` e Redirecionamento de Sucesso em `handleSubmit` (Linhas 975-1120)
```tsx
<<<< ORIGINAL
      const res = await fetch("/api/pms/pre-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          code: code || reservation?.code,
          reservationId: reservation?.id,
          guestIndex: selectedGuestIndex,
          token: signatureToken || (typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("token") || "") : ""),
          whatsappOtp: whatsappOtpInput.trim(),
          fullName,
====
      const isReSignatureNeeded = Boolean(
        isResignParam || 
        reservation?.needsReSignature || 
        guestList[selectedGuestIndex - 1]?.needsReSignature
      )

      const res = await fetch("/api/pms/pre-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          code: code || reservation?.code,
          reservationId: reservation?.id,
          guestIndex: selectedGuestIndex,
          token: signatureToken || (typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("token") || "") : ""),
          whatsappOtp: whatsappOtpInput.trim(),
          resign: isReSignatureNeeded ? "1" : undefined,
          isReSignature: isReSignatureNeeded,
          fullName,
>>>>
```
E no tratamento da resposta de sucesso (após a linha 1114):
```tsx
<<<< ORIGINAL
        setIsCompleted(true)
        setIsEditing(false)
        setSuccess(true)
      } else {
        alert(resData?.error || "Erro ao registrar check-in. Por favor, tente novamente.")
      }
====
        setIsCompleted(true)
        setIsEditing(false)
        setSuccess(true)

        if (isReSignatureNeeded || resData.wasReSignature) {
          // Fast-track: Redireciona com confirmação de sucesso de volta ao Portal do Hóspede
          const targetCode = resData.reservation?.code || reservation?.code || code
          setTimeout(() => {
            setLocation(`/minha-reserva/${encodeURIComponent(targetCode)}?resign_success=1${selectedGuestIndex > 1 ? `&guest=${selectedGuestIndex}` : ""}`)
          }, 1500)
        }
      } else {
        alert(resData?.error || "Erro ao registrar check-in. Por favor, tente novamente.")
      }
>>>>
```

### Modificação 5: Banner de Atualização com Botão Fast-track para Passo 3 (Linhas 2067-2080)
```tsx
<<<< ORIGINAL
        {Boolean(reservation?.needsReSignature || guestList[selectedGuestIndex - 1]?.needsReSignature) && (
          <div className="p-4 sm:p-5 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-2 shadow-sm">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-900 rounded-full text-xs font-bold">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
              <span>Reserva Atualizada • Nova Assinatura Necessária</span>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-amber-950">
              {reservation?.reSignatureReason || "Sua acomodação ou período da estadia foi atualizado."}
            </h3>
            <p className="text-xs text-amber-800 leading-relaxed">
              Todos os seus dados cadastrais e documentos foram preservados com total segurança. Por favor, confira os novos dados do flat e período acima e assine ao final da página para confirmar sua nova Ficha de Hospedagem.
            </p>
          </div>
        )}
====
        {Boolean(isResignParam || reservation?.needsReSignature || guestList[selectedGuestIndex - 1]?.needsReSignature) && (
          <div className="p-4 sm:p-5 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-2.5 shadow-sm animate-in fade-in">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-900 rounded-full text-xs font-bold">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                <span>Reserva Atualizada • Nova Assinatura Obrigatória</span>
              </div>
              {step < 3 && (
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="text-xs font-bold text-amber-900 hover:text-amber-950 underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Ir direto para assinatura (Passo 3)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <h3 className="text-sm sm:text-base font-bold text-amber-950">
              {reservation?.reSignatureReason || "Sua reserva teve as datas ou acomodação alteradas. É obrigatório assinar a declaração atualizada para liberar o acesso ao condomínio."}
            </h3>
            <p className="text-xs text-amber-800 leading-relaxed">
              ⚡ <strong>Fluxo Expresso:</strong> Todos os seus dados cadastrais (Nome, CPF, Telefone, Endereço e Foto do Documento) foram preservados com segurança. Confira os novos dados do flat e período acima e assine ao final para confirmar sua nova Ficha de Hospedagem.
            </p>
          </div>
        )}
>>>>
```

---

## 5. Drop-In Code Blueprint: Backend `demo-server.mjs` (Twin-Server Parity)

Tanto em `artifacts/api-server/demo-server.mjs` quanto em `scripts/demo-server.mjs`, em torno da linha 15136:
```javascript
<<<< ORIGINAL
      fnhrCompleted: Boolean(r.fnhrCompleted),
      preCheckinCompleted: Boolean(r.preCheckinCompleted || r.fnhrCompleted || (Array.isArray(r.guests) && r.guests.some(g => g.hasCompletedCheckin))),
      hasPreCheckin: Boolean(r.hasPreCheckin || r.preCheckinCompleted || r.fnhrCompleted || (Array.isArray(r.guests) && r.guests.some(g => g.hasCompletedCheckin))),
      checkedInAt: r.checkedInAt || null,
      actualCheckinAt: r.actualCheckinAt || null,
      guestSelfCheckin: Boolean(r.guestSelfCheckin)
====
      fnhrCompleted: Boolean(r.fnhrCompleted),
      preCheckinCompleted: Boolean(r.preCheckinCompleted || r.fnhrCompleted || (Array.isArray(r.guests) && r.guests.some(g => g.hasCompletedCheckin))),
      hasPreCheckin: Boolean(r.hasPreCheckin || r.preCheckinCompleted || r.fnhrCompleted || (Array.isArray(r.guests) && r.guests.some(g => g.hasCompletedCheckin))),
      needsReSignature: Boolean(r.needsReSignature),
      reSignatureReason: r.reSignatureReason || null,
      reSignatureUrl: r.needsReSignature ? `/pre-checkin/${r.code}?resign=1` : null,
      checkedInAt: r.checkedInAt || null,
      actualCheckinAt: r.actualCheckinAt || null,
      guestSelfCheckin: Boolean(r.guestSelfCheckin)
>>>>
```
E em `preCheckinStatus` (linha 15171):
```javascript
<<<< ORIGINAL
    preCheckinStatus: {
      totalGuests,
      completedCheckins,
      isFullyCompleted: completedCheckins >= totalGuests,
      completed: Boolean(
        r.fnhrCompleted ||
        r.preCheckinCompleted ||
        r.hasPreCheckin ||
        (completedCheckins >= totalGuests && totalGuests > 0) ||
        (Array.isArray(r.guests) && r.guests.length > 0 && r.guests.some(g => g.hasCompletedCheckin))
      )
    },
====
    preCheckinStatus: {
      totalGuests,
      completedCheckins,
      isFullyCompleted: completedCheckins >= totalGuests,
      completed: Boolean(
        !r.needsReSignature && (
          r.fnhrCompleted ||
          r.preCheckinCompleted ||
          r.hasPreCheckin ||
          (completedCheckins >= totalGuests && totalGuests > 0) ||
          (Array.isArray(r.guests) && r.guests.length > 0 && r.guests.some(g => g.hasCompletedCheckin))
        )
      )
    },
>>>>
```

---

## 6. Verificação e Conformidade com as Regras do Projeto

1. **Escopo Estrito de Testes (AGENTS.md)**:
   - Proibido rodar testes globais (`tests/*.test.mjs`).
   - Apenas o teste pontual associado a reservas e pré-checkin (`tests/m1-reservation-modification.test.mjs` ou script de teste específico de M3) deve ser executado pelo implementador (Worker).
2. **Build de Verificação**:
   - `npm run build` na pasta `artifacts/limpeza` compila o frontend e gera os assets em `dist/`.
   - Com as correções de imports de `AlertTriangle` e `PenTool`, a tipagem TypeScript e empacotamento Vite rodam limpos.
3. **Paridade Byte-a-Byte**:
   - Qualquer alteração em `demo-server.mjs` deve ser sincronizada rigorosamente entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.

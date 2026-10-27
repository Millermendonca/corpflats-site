# Análise de Arquitetura: Guest Portal & Frontend Housekeeping UI (Stayover B2B)

**Autor:** `explorer_survey_3`  
**Data:** 2026-10-27  
**Alvo:** Implementação do Serviço Diário de Governança (Stayover) Exclusivo para Reservas B2B  
**Diretório de Trabalho:** `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_3`  

---

## 1. Visão Geral e Fronteiras do Problema

O objetivo desta investigação é mapear com exatidão cirúrgica as estruturas de código necessárias para suportar o **Serviço Diário de Governança (Stayover) Exclusivo para Reservas B2B**, abrangendo:
1. **Portal do Hóspede (`guest-portal.tsx` e `demo-server.mjs`)**:
   - Detecção de reservas B2B;
   - Implementação dos controles de "Não Perturbe" (DND) e "Solicitação de Troca de Enxoval" (cama/banho para o dia seguinte);
   - Proteção estrita com retorno `403 Forbidden` para reservas não-B2B (Booking, Airbnb, WhatsApp, Site Direto).
2. **Cards de Limpeza e Modais de Conclusão (`flat-card.tsx` e `demo-server.mjs`)**:
   - Análise do fluxo atual de check-out, modal de vistoria (`InspectionModal` / `finishModalOpen`), bloqueio de tempo mínimo (10 min) e encerramento indevido de reservas;
   - Especificação do card Stayover B2B com visual diferenciado, contagem "Dia X de Y", nome do hóspede, status de enxoval e alerta de 3 dias;
   - Alerta visual e bloqueio de ações quando "Não Perturbe" estiver ativo;
   - Modal simplificado de conclusão (apenas perguntas de troca de toalhas e cama, sem vistoria de saída e sem trava de 10 min).
3. **Desenho da Suíte de Testes Pontuais (`tests/b2b-stayover-housekeeping.test.mjs`)**:
   - Arquitetura isolada seguindo o padrão de ouro de `tests/tariff-engine.test.mjs`;
   - Cobertura integral dos requisitos R1 a R4 sem regressões no banco de produção.

---

## 2. Investigação do Portal do Hóspede (`guest-portal.tsx` & Backend em `demo-server.mjs`)

### 2.1. Backend: Exposição de Dados em `GET /api/pms/guest-portal/:code`
- **Localização:** `artifacts/api-server/demo-server.mjs:24360` e `scripts/demo-server.mjs:24360`.
- **Resolução da Reserva:** `const r = findReservationByLocatorOrContact(code);` (linha 24363).
- **Verificação Canônica de Reserva B2B:**
  ```javascript
  // Linha 24468 de demo-server.mjs:
  const chanLower = String(r.channel || "").toLowerCase();
  const isB2b = chanLower === "b2b" || chanLower.includes("b2b") || Boolean(r.b2bReservationNumber || r.agencyId || r.agencyName);
  ```
  O campo `isB2b` já é injetado no objeto retornado na linha 24640:
  `reservation.isB2b = isB2b;`
- **Adaptação Necessária para Stayover B2B no Payload JSON:**
  No objeto de resposta de `GET /api/pms/guest-portal/:code` (linhas 24631–24762), adicionar a propriedade `b2bHousekeeping`:
  ```javascript
  const todayStr = bNow.date;
  const tomorrowStr = addDaysToDateStr(todayStr, 1);
  const isStayoverDate = Boolean(r.checkinDate < todayStr && r.checkoutDate > todayStr);

  const b2bHousekeeping = isB2b ? {
    isStayover: isStayoverDate,
    doNotDisturb: Boolean(r.doNotDisturb),
    tomorrowStr,
    stayDayNumber: Math.max(1, differenceInDays(todayStr, r.checkinDate) + 1),
    totalStayNights: Math.max(1, differenceInDays(r.checkoutDate, r.checkinDate)),
    lastBeddingChangeDate: r.lastBeddingChangeDate || r.checkinDate,
    daysSinceBeddingChange: differenceInDays(todayStr, r.lastBeddingChangeDate || r.checkinDate),
    lastTowelsChangeDate: r.lastTowelsChangeDate || r.checkinDate,
    daysSinceTowelsChange: differenceInDays(todayStr, r.lastTowelsChangeDate || r.checkinDate),
    needsBeddingChangeAlert: differenceInDays(todayStr, r.lastBeddingChangeDate || r.checkinDate) >= 3,
    scheduledLinenForTomorrow: (r.linenRequests || []).find(req => req.targetDate === tomorrowStr && req.status !== "cancelled") || null,
    linenRequestsHistory: r.linenRequests || []
  } : null;
  ```
  Se `!isB2b`, `b2bHousekeeping` será `null` ou omitido.

### 2.2. Backend: Novos Endpoints do Portal do Hóspede B2B
Devem ser adicionados imediatamente após as rotas do guest portal (por volta da linha 24765 em `demo-server.mjs` e `scripts/demo-server.mjs`):

#### A. Rota "Não Perturbe" (DND): `POST /api/pms/guest-portal/:code/do-not-disturb`
```javascript
app.post("/api/pms/guest-portal/:code/do-not-disturb", (req, res) => {
  const code = (req.params.code || "").trim();
  const r = findReservationByLocatorOrContact(code);
  if (!r) return res.status(404).json({ error: "Reserva não encontrada." });

  const chanLower = String(r.channel || "").toLowerCase();
  const isB2b = chanLower === "b2b" || chanLower.includes("b2b") || Boolean(r.b2bReservationNumber || r.agencyId || r.agencyName);
  if (!isB2b) {
    return res.status(403).json({ error: "Serviço de governança diária exclusivo para reservas corporativas (B2B)." });
  }

  const { doNotDisturb } = req.body;
  r.doNotDisturb = Boolean(doNotDisturb);
  r.dndUpdatedAt = new Date().toISOString();
  saveDatabase("guest_portal_dnd_toggle");

  return res.json({
    success: true,
    doNotDisturb: r.doNotDisturb,
    message: r.doNotDisturb
      ? "Modo Não Perturbe ativado. A equipe de governança não entrará no quarto para a arrumação hoje."
      : "Modo Não Perturbe desativado. A arrumação diária foi liberada."
  });
});
```

#### B. Rota "Solicitação de Enxoval": `POST /api/pms/guest-portal/:code/linen-request`
```javascript
app.post("/api/pms/guest-portal/:code/linen-request", (req, res) => {
  const code = (req.params.code || "").trim();
  const r = findReservationByLocatorOrContact(code);
  if (!r) return res.status(404).json({ error: "Reserva não encontrada." });

  const chanLower = String(r.channel || "").toLowerCase();
  const isB2b = chanLower === "b2b" || chanLower.includes("b2b") || Boolean(r.b2bReservationNumber || r.agencyId || r.agencyName);
  if (!isB2b) {
    return res.status(403).json({ error: "Serviço de governança diária exclusivo para reservas corporativas (B2B)." });
  }

  const { type, action } = req.body; // type: "bedding" | "towels" | "both", action?: "cancel"
  const bNow = getBrasiliaNow();
  const todayStr = bNow.date;
  const tomorrowStr = addDaysToDateStr(todayStr, 1);

  if (!r.linenRequests) r.linenRequests = [];

  if (action === "cancel") {
    r.linenRequests = r.linenRequests.map(reqItem => {
      if (reqItem.targetDate === tomorrowStr && reqItem.status !== "completed") {
        return { ...reqItem, status: "cancelled", cancelledAt: new Date().toISOString() };
      }
      return reqItem;
    });
    saveDatabase("guest_portal_linen_cancel");
    return res.json({ success: true, message: "Solicitação de troca cancelada com sucesso.", scheduledFor: tomorrowStr, activeRequest: null });
  }

  if (!["bedding", "towels", "both"].includes(type)) {
    return res.status(400).json({ error: "Tipo de solicitação inválido. Opções: 'bedding', 'towels' ou 'both'." });
  }

  // Cancela pendentes anteriores para amanhã e cria a nova
  r.linenRequests = r.linenRequests.filter(reqItem => reqItem.targetDate !== tomorrowStr || reqItem.status === "completed");
  const newReq = {
    id: `lr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type,
    targetDate: tomorrowStr,
    status: "pending",
    requestedAt: new Date().toISOString()
  };
  r.linenRequests.push(newReq);
  saveDatabase("guest_portal_linen_request");

  return res.json({
    success: true,
    scheduledFor: tomorrowStr,
    activeRequest: newReq,
    message: `Troca de enxoval (${type === "bedding" ? "roupa de cama" : type === "towels" ? "toalhas de banho" : "cama e banho"}) agendada para amanhã (${tomorrowStr}).`
  });
});
```

### 2.3. Frontend: Componente B2B em `guest-portal.tsx`
- **Posicionamento Ideal no Layout:**  
  Entre o `2. Card: Acomodação & Chave de Acesso / Portaria` (término na linha 3236) e o `3. Card: Room Service & Café da Manhã` (início na linha 3238).
- **Condição de Renderização:**
  `data?.reservation?.isB2b && data?.b2bHousekeeping`
- **Elementos Visuais e Interações:**
  1. **Header do Card:**
     - Ícone `Sparkles` ou `BedDouble`;
     - Título: `Serviço Diário de Governança & Conforto`;
     - Badge: `Exclusivo B2B Corporativo` (`bg-sky-100 text-sky-800 border-sky-300`).
  2. **Controle de "Não Perturbe" (DND):**
     - Botão / Toggle estilizado:
       - Se `doNotDisturb === true`: Fundo avermelhado/rosa com badge `🔕 Não Perturbe Ativado (Limpeza Dispensada Hoje)`. Botão: `Desativar Não Perturbe`.
       - Se `doNotDisturb === false`: Fundo esmeralda suave com badge `🔔 Arrumação Liberada para Hoje`. Botão: `Ativar "Não Perturbe" (Dispensar Arrumação)`.
     - Subtexto explicativo: "Ao ativar, nossa camareira não entrará no flat para a higienização diária."
  3. **Solicitação de Troca de Roupa de Cama & Banho:**
     - Texto de apoio: "As trocas são programadas sempre para o dia seguinte durante a higienização diária."
     - Exibição de Alerta Preventivo: se `b2bHousekeeping.needsBeddingChangeAlert`, exibir card âmbar amigável: *"Sua roupa de cama foi trocada há mais de 3 dias. Sugerimos solicitar a troca para amanhã!"*
     - Três botões de ação rápida:
       - `[ 🛏️ Trocar Cama ]`
       - `[ 🚿 Trocar Toalhas ]`
       - `[ ✨ Trocar Ambos (Cama + Toalhas) ]`
     - Se já houver solicitação agendada para amanhã (`scheduledLinenForTomorrow`):
       - Exibe banner de confirmação em azul/esmeralda: *"Agendado para amanhã ({data}): Troca de {tipo}"*.
       - Botão secundário `[ Cancelar Solicitação ]`.

---

## 3. Investigação dos Cards de Governança (`flat-card.tsx`)

### 3.1. Análise da Estrutura Atual de Check-out e Modais
- **Arquivo:** `artifacts/limpeza/src/components/flat-card.tsx` (3098 linhas).
- **Renderização Principal:** Linhas 1120–1850.
- **Ciclo de Status:**
  `dirty` → `will_clean` → `cleaning_now` → `clean` (ou `pending_issue`).
- **Modal de Conclusão / Vistoria (`finishModalOpen`):**
  - Declarado na linha 114: `const [finishModalOpen, setFinishModalOpen] = useState(false)`;
  - Renderizado nas linhas 2183–2610;
  - Exibe tarefas preventivas periódicas (`pendingPeriodicTasks`) e vistorias de saída (`pendingSurveys`);
  - Ao submeter (`submitCompletion`, linhas 975–1024), dispara `PATCH /api/cleaning/assignments/${request.id}/status` com `{ status: "clean", executedPeriodicTaskIds, surveyAnswers, ... }`.
- **Modal de Conclusão pelo Admin (`adminCleanModalOpen`):**
  - Declarado na linha 246: `const [adminCleanModalOpen, setAdminCleanModalOpen] = useState(false)`;
  - Renderizado nas linhas 2831–2920;
  - Permite selecionar a camareira responsável (`selectedMaidId`) e confirmar `clean` sem passar pela vistoria de saída das camareiras.

### 3.2. Bloqueio Crítico Identificado: Trava de 10 Minutos e Vistoria de Saída
1. **Trava de 10 Minutos no Frontend (`flat-card.tsx:902–909` e `945–948`):**
   ```typescript
   if (request?.cleaningStartedAt) {
     const started = new Date(request.cleaningStartedAt).getTime()
     const mins = (Date.now() - started) / 60000
     if (mins < 10) {
       setMinTimeAlertOpen(true)
       return
     }
   }
   ```
2. **Trava de 10 Minutos no Backend (`demo-server.mjs:15824–15832`):**
   ```javascript
   if (status === "clean" && item.cleaningStartedAt && !customCompletedAt && !isInstructionRequest) {
     const started = new Date(item.cleaningStartedAt).getTime();
     const elapsedMinutes = (Date.now() - started) / 60000;
     if (elapsedMinutes < 10 && userAuth?.role !== "admin" && userAuth?.role !== "dev") {
       return res.status(400).json({
         error: "Não é possível finalizar a limpeza ainda. Tempo insuficiente de higienização (mínimo de 10 minutos)."
       });
     }
   }
   ```
   **Diagnóstico:** Para limpezas do tipo `stayover`, a trava de 10 minutos **DEVE SER OBRIGATORIAMENTE DESVINCULADA** tanto no frontend quanto no backend (`!isStayoverRequest`).

3. **Vistoria de Saída de Check-out (`flat-card.tsx:911–914` e `2261–2600`):**
   No check-out, a camareira responde questionários de danos, frigobar e itens esquecidos.
   Em `stayover`, o hóspede continua no quarto! **NÃO pode haver vistoria de saída.**

### 3.3. Risco Operacional Crítico no Backend: Baixa Involuntária de Reserva
Nas linhas 15834–15875 de `artifacts/api-server/demo-server.mjs`:
```javascript
if (!isInstructionRequest && (status === "cleaning_now" || status === "in_progress" || status === "clean")) {
  ...
  checkoutRes.checkoutDone = true;
  checkoutRes.status = "completed";
  ...
  triggerCheckoutWhatsApp(...);
}
```
**Impacto Devastador se não isolado:** Iniciar ou concluir uma limpeza de Stayover daria baixa de check-out no hóspede que ainda vai ficar mais 5 dias no flat!
**Correção Obrigatória:** Adicionar guarda explícita:
`const isStayover = item.source === "stayover" || item.cleaningType === "stayover";`
Se `isStayover === true`:
- **NÃO** marcar `checkoutDone = true`;
- **NÃO** alterar status da reserva para `completed`;
- **NÃO** marcar flat como desocupado (`flat.isOccupied` permanece `true`);
- **NÃO** disparar WhatsApp de check-out.

---

## 4. Mapeamento das Alterações em `flat-card.tsx` para Stayover B2B

### 4.1. Propriedades e Identificação
Detectar se o card atual é Stayover:
```typescript
const isStayover = Boolean(
  flat.source === "stayover" ||
  flat.cleaningType === "stayover" ||
  request?.source === "stayover" ||
  request?.cleaningType === "stayover"
);

const linenTracking = flat.linenTracking || request?.linenTracking || null;
const isDND = Boolean(
  flat.doNotDisturb ||
  request?.doNotDisturb ||
  linenTracking?.doNotDisturb
);
```

### 4.2. Diferenciação Visual do Card
- **Topo / Header do Card:**
  Ao invés de mostrar o card padrão de check-out, exibir:
  ```tsx
  {isStayover && (
    <Badge className="bg-sky-700 text-white font-extrabold text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-xs">
      <Sparkles className="w-3.5 h-3.5" />
      <span>Stayover B2B • Diária em Andamento</span>
    </Badge>
  )}
  ```
- **Dia da Estadia (Dia X de Y):**
  ```tsx
  {isStayover && linenTracking && (
    <div className="flex items-center gap-1.5 text-xs font-bold text-sky-950 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-xl px-2.5 py-1.5">
      <Calendar className="w-3.5 h-3.5 text-sky-600" />
      <span>Estadia: Dia {linenTracking.stayDayNumber} de {linenTracking.totalStayNights}</span>
    </div>
  )}
  ```
- **Hóspede em Estadia:**
  Exibir explicitamente:
  `👤 Hóspede: {flat.activeReservation?.guestName || flat.guestName || request?.guestName || "Hóspede Corporativo"}`
- **Status de Enxoval & Alertas:**
  ```tsx
  {isStayover && linenTracking && (
    <div className="p-2.5 rounded-xl border border-border bg-muted/40 space-y-1.5 text-xs">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground font-medium">Roupa de Cama:</span>
        <span className="font-bold">
          {linenTracking.daysSinceBeddingChange === 0 ? "Trocada hoje" : `há ${linenTracking.daysSinceBeddingChange} dia(s)`}
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground font-medium">Toalhas de Banho:</span>
        <span className="font-bold">
          {linenTracking.daysSinceTowelsChange === 0 ? "Trocadas hoje" : `há ${linenTracking.daysSinceTowelsChange} dia(s)`}
        </span>
      </div>

      {/* Alerta de 3 Dias */}
      {linenTracking.needsBeddingChangeAlert && (
        <Badge className="w-full justify-center bg-amber-500 hover:bg-amber-600 text-white font-black text-[10px] py-1 gap-1 animate-pulse">
          <AlertTriangle className="w-3 h-3" />
          <span>Troca de cama recomendada (3+ dias sem troca)</span>
        </Badge>
      )}

      {/* Pedido do Hóspede pelo Portal */}
      {linenTracking.guestRequestedBedding && (
        <Badge className="w-full justify-center bg-indigo-600 text-white font-bold text-[10px] py-0.5">
          🛎️ Hóspede solicitou troca de cama
        </Badge>
      )}
      {linenTracking.guestRequestedTowels && (
        <Badge className="w-full justify-center bg-teal-600 text-white font-bold text-[10px] py-0.5">
          🛎️ Hóspede solicitou troca de toalhas
        </Badge>
      )}
    </div>
  )}
  ```

### 4.3. Bloqueio Operacional pelo "Não Perturbe" (DND)
Se `isDND === true`:
1. Renderizar banner em destaque:
   ```tsx
   <div className="p-3 rounded-2xl bg-rose-100 dark:bg-rose-950/60 border-2 border-rose-400 dark:border-rose-800 text-rose-950 dark:text-rose-200 text-xs font-black flex items-center gap-2 shadow-xs">
     <Ban className="w-4 h-4 text-rose-600 shrink-0" />
     <span>🔕 Não Perturbe — Hóspede dispensou a limpeza diária</span>
   </div>
   ```
2. Na área de botões de ação:
   Substituir os botões normais de limpeza por:
   ```tsx
   <Button disabled className="w-full bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-xs cursor-not-allowed">
     🔕 Ações Bloqueadas pelo Não Perturbe
   </Button>
   ```

### 4.4. Modal Simplificado de Conclusão de Stayover (`StayoverCompletionModal`)
Ao invés do modal de vistoria de saída:
- Criar estado: `const [stayoverModalOpen, setStayoverModalOpen] = useState(false)`
- Estados de checklist:
  - `const [stayoverTowelsChanged, setStayoverTowelsChanged] = useState<boolean>(true)`
  - `const [stayoverBeddingChanged, setStayoverBeddingChanged] = useState<boolean>(false)`
- No clique de "Concluir" em `flat-card.tsx` quando `isStayover`:
  - Se camareira: abrir `setStayoverModalOpen(true)` (sem verificar vistoria de saída e sem checar 10 min);
  - Se admin: abrir `setAdminCleanModalOpen(true)`, que para `isStayover` exibirá adicionalmente os dois toggles de troca de enxoval.
- **Interface do Modal:**
  1. Pergunta 1: *"As toalhas de banho foram trocadas?"* [✓ Sim] [✕ Não]
  2. Pergunta 2: *"A roupa de cama foi trocada?"* [✓ Sim] [✕ Não]
  3. Botão "Confirmar Conclusão da Diária" que dispara:
     ```typescript
     await fetch(`/api/cleaning/assignments/${request.id}/status`, {
       method: "PATCH",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({
         status: "clean",
         cleaningType: "stayover",
         towelsChanged: stayoverTowelsChanged,
         beddingChanged: stayoverBeddingChanged,
         flatNumber: flat.flatNumber,
         flatId: flat.flatId,
         date: date
       }),
       credentials: "include"
     });
     ```

---

## 5. Desenho da Suíte de Testes Pontuais (`tests/b2b-stayover-housekeeping.test.mjs`)

### 5.1. Padrão Arquitetural
Seguir o modelo comprovado e seguro de `tests/tariff-engine.test.mjs`:
- `node:test` (`describe`, `it`, `before`, `after`) e `node:assert/strict`;
- Porta exclusiva: `TEST_PORT = 3999`;
- Cópia do banco de dados isolada em `data/test-b2b-stayover-db-<timestamp>.json`;
- Processo filho do servidor (`artifacts/api-server/demo-server.mjs`) gerado via `spawn` com `NODE_ENV = "test"`, `PORT = String(TEST_PORT)`, `DATA_FILE = isolatedDbPath`;
- Desligamento limpo com `taskkill /F /T /PID` e deleção da cópia de testes no `after()`;
- **Nenhum teste global executado.**

### 5.2. Casos de Teste Essenciais (Matriz de Conformidade)
1. **Geração Seletiva de Cards Stayover (R1):**
   - Cria reserva B2B com `checkinDate: 2026-10-25`, `checkoutDate: 2026-10-30`.
   - Consulta `GET /api/reservations/checkouts?date=2026-10-27`.
   - Assert: card gerado com `source: "stayover"` e `cleaningType: "stayover"`.
   - Cria reserva Booking nas mesmas datas.
   - Assert: reserva Booking NÃO gera card stayover no dia 2026-10-27.
2. **Conclusão Segura sem Check-out (R1/R3):**
   - Envia `PATCH /api/cleaning/assignments/:requestId/status` com `status: "clean"`, `towelsChanged: true`, `beddingChanged: false`.
   - Assert: reserva original permanece com `checkoutDone !== true` e `status: "confirmada"`.
   - Assert: `flat.isOccupied === true`.
   - Assert: `towelsChanged` e `beddingChanged` gravados.
3. **Tracking de Enxoval & Alerta de 3 Dias (R3):**
   - No dia 2 (2 dias sem troca): `needsBeddingChangeAlert === false`.
   - No dia 3 (3 dias sem troca): `needsBeddingChangeAlert === true`.
4. **Tarifação de Diaristas & Extrato (R2):**
   - `GET /api/cleaning/rates` retorna `defaultStayoverRatePerRoom: 15.00`.
   - Extrato da Cris (`id: 2`) credita R$ 15.00 para a diária Stayover concluída, discriminando `Stayover`.
5. **Portal do Hóspede B2B Não Perturbe & Solicitação (R4):**
   - `GET /api/pms/guest-portal/:code` retorna `b2bHousekeeping` para B2B e `null` para Booking.
   - `POST /api/pms/guest-portal/:code/do-not-disturb` com `doNotDisturb: true` atualiza a reserva e reflete no card de Stayover.
   - `POST /api/pms/guest-portal/:code/linen-request` agenda troca para o dia seguinte (`tomorrowStr`).
   - Ambas as rotas retornam `403 Forbidden` quando chamadas com localizador de reserva Booking/Airbnb/Site Direto.
6. **Integridade de Produção:**
   - Hash SHA-256 de `data/database.json` permanece idêntico antes e depois dos testes.

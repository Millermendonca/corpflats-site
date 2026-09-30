# Análise Técnica de Integração — R6 (Dashboard de Camareiras) & R7 (Calendário PMS)

**Data:** 2026-09-30  
**Autor:** Explorer 3 — Integrations Survey Explorer  
**Alvos Investigados:**  
1. `artifacts/limpeza/src/components/flat-card.tsx` (R6)  
2. `artifacts/limpeza/src/pages/pms-calendar.tsx` (R7)  
3. `artifacts/limpeza/src/pages/dashboard.tsx` (Contexto R6)  
4. `artifacts/api-server/demo-server.mjs` (Contratos de API `/api/flats`, `/api/reservations/checkouts`, `/api/pms/calendar`)  

---

## 1. Sumário Executivo

A implementação dos requisitos **R6** (bloqueio e sinalização no card da camareira) e **R7** (bloqueio visual e aviso de sobreposição no calendário PMS) conecta diretamente o novo módulo de Ordens de Serviço Externo (`serviceOrders`) com as rotinas diárias da equipe de governança e da recepção.

- **Para R6 (Maid Dashboard Flat Card):** O card em `flat-card.tsx` possui um sistema modular de badges no topo e botões contextuais de transição no rodapé (`dirty` -> `will_clean` -> `cleaning_now` -> `clean`). Quando `flat.serviceInProgress` estiver presente, um badge de alerta `🔧 Serviço em andamento` deve ser fixado na linha de badges e em um box descritivo, desabilitando o botão de assumir/iniciar limpeza com tooltip explicativo (`Tooltip` Radix já disponível na stack). Crucialmente, identificamos que o dashboard consome `GET /api/reservations/checkouts`, exigindo que este endpoint também propague `serviceInProgress` junto ao `GET /api/flats`.
- **Para R7 (PMS Calendar):** O calendário em `pms-calendar.tsx` renderiza uma grade contínua com multi-dias calculados via `dayLayoutMap` e `getBlockPosition`. O backend `GET /api/pms/calendar` retorna uma coleção `blocks` (atualmente de `db.roomBlocks`). Ao injetar os serviços ativos com `estimatedFinishAt` diretamente nessa coleção `blocks` como blocos do tipo `reason: "service_order"`, o calendário ganha suporte nativo para posicionamento exato. O visual do bloco renderizará o badge `🔧 [Título do Serviço]`, e a tentativa de criação ou deslocamento de reserva sobre o período exibirá alerta em tempo real e diálogo de confirmação para permitir que administradores possam sobrescrever de forma consciente.

---

## 2. Investigação R6 — Dashboard de Camareiras (`flat-card.tsx`)

### 2.1 Como o estado, badges e botões de ação são atualmente renderizados

O componente `FlatCard` (`artifacts/limpeza/src/components/flat-card.tsx`, 2418 linhas) é instanciado em `dashboard.tsx` (linhas 615–629) para cada apartamento retornado por `useListCheckouts({ date })` (`GET /api/reservations/checkouts`).

#### A. Ciclo de Vida e Estados do Flat:
O status é derivado em:
- **Linha 393:** `const currentStatus: FlatStatus = (request?.status as FlatStatus) || "dirty"`
- Os estilos visuais são mapeados em `statusStyles` (linhas 35–78):
  - `dirty`: Vermelho/Rose (`AlertCircle`, label `"Sujo"`)
  - `will_clean`: Azul-céu (`Clock`, label `"Vou Limpar"`)
  - `cleaning_now`: Azul forte (`PlayCircle`, label `"Limpando"`)
  - `pending_issue`: Âmbar (`AlertCircle`, label `"Com Pendência"`)
  - `clean`: Esmeralda (`CheckCircle2`, label `"Limpo"`)
  - `extended`: Púrpura (`CalendarX`, label `"Estendeu"`)
  - `no_show`: Ardósia (`UserX`, label `"No Show"`)

#### B. Barra de Badges (Linhas 1061–1126):
Renderiza badges com base em condições booleanas:
- **Linha 1063–1066:** Status base do flat (`conf.label` com ícone dinâmico)
- **Linha 1070–1079:** Remuneração (Admin only: `"Remunerado"` ou `"Favor / Não Remunerado"`)
- **Linha 1081–1101:** Pendência do dia anterior (`"Pendente do turno de hoje"` / `"Não limpo em dd/MM"`)
- **Linha 1103–1113:** Check-in previsto hoje/amanhã (`"🟢 Entra Hoje"` / `"🟢 Entra Amanhã"`)
- **Linha 1115–1125:** Cronômetro de limpeza em andamento (`elapsedMinutes`)

#### C. Botões de Ação no Rodapé (Linhas 1315–1568):
- **Para status `"dirty"` ou `"pending"` (linhas 1325–1371):
  - **Admin:** Exibe botão `"Vou Limpar"` (`handleStatusChange("will_clean")`) e botão `"Marcar Limpo"` (`setAdminCleanModalOpen(true)`).
  - **Camareira:** Exibe botão largura total `"Vou Limpar"` (`handleStatusChange("will_clean")`).
  - **Seleção em lote (linhas 945–958):** Checkbox no topo esquerdo do card para seleção múltipla e claim em lote.
- **Para status `"will_clean"` (linhas 1373–1406):
  - Exibe botão `"Iniciar"` com ícone `Sparkles` (`handleStatusChange("cleaning_now")`), além de `"Devolver"` (`handleRelease`).

---

### 2.2 Onde e como adicionar o badge "🔧 Serviço em andamento"

O objeto `flat` recebe o campo `flat.serviceInProgress`:
```typescript
interface ServiceInProgressInfo {
  serviceTitle: string;
  workerName: string;
  serviceOrderId: number | string;
}
```

Recomendamos **dois pontos visuais complementares**:

#### Ponto 1 — Linha de Badges de Status (Linha 1062 de `flat-card.tsx`):
Inserir imediatamente ao lado do badge de status (`conf.label`):
```tsx
{flat.serviceInProgress && (
  <Badge 
    className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10.5px] shadow-2xs px-2 py-0.5 flex items-center gap-1 rounded-lg border border-amber-600 animate-pulse shrink-0"
    title={flat.serviceInProgress.workerName 
      ? `Prestador: ${flat.serviceInProgress.workerName} • Serviço: ${flat.serviceInProgress.serviceTitle || "Em andamento"}`
      : "Serviço externo em andamento no flat"}
  >
    <Wrench className="w-3 h-3 shrink-0" />
    <span>🔧 Serviço em andamento</span>
  </Badge>
)}
```

#### Ponto 2 — Box Informativo de Bloqueio no Corpo do Card (Linha 1278 de `flat-card.tsx`):
Para cumprir a diretriz *"Visual do card deve claramente indicar o bloqueio sem ocultar as demais informações"*:
```tsx
{flat.serviceInProgress && (
  <div className="bg-amber-100/90 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-700/80 rounded-xl p-2.5 text-xs text-amber-950 dark:text-amber-200 shadow-2xs space-y-1">
    <div className="flex items-center gap-1.5 font-black text-amber-900 dark:text-amber-300">
      <Wrench className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
      <span>Serviço Externo em Andamento:</span>
    </div>
    <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-200">
      {flat.serviceInProgress.serviceTitle || "Manutenção"}
      {flat.serviceInProgress.workerName && ` • Prestador: ${flat.serviceInProgress.workerName}`}
    </p>
    <p className="text-[10px] text-amber-800 dark:text-amber-400 font-medium">
      Aguardando conclusão do serviço externo para liberar a higienização do apartamento.
    </p>
  </div>
)}
```

#### Ponto 3 — Borda do Card:
Na linha 934, adicionar à classe do `<Card>`:
```tsx
Boolean(flat.serviceInProgress) && "border-amber-400/90 dark:border-amber-600 shadow-amber-100/50"
```

---

### 2.3 Como desabilitar a limpeza com Tooltip Explicativo

A biblioteca Radix Tooltip já está instalada e disponível em `@/components/ui/tooltip` (`Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider`), com o provedor global já presente em `App.tsx` (linhas 386–393).

#### Ações a desabilitar:
1. **Botão de Iniciar/Vou Limpar em estado `"dirty"` (linhas 1328–1370):**
   Quando `flat.serviceInProgress` for truthy:
   - O botão deve estar `disabled`.
   - Se for camareira: rótulo `"Iniciar Limpeza (Bloqueado)"` ou `"Vou Limpar (Bloqueado)"`.
   - Como botões HTML desabilitados não disparam eventos de hover no Radix, envolver o botão desabilitado em um `<div className="w-full">` dentro do `<TooltipTrigger asChild>`.
   - Conteúdo do Tooltip:
     ```
     "Aguardando finalização do serviço externo: [Título do Serviço] (Prestador: [Nome])"
     ```

2. **Botão de Iniciar em estado `"will_clean"` (linhas 1375–1382):**
   - Caso um quarto tenha sido assumido antes do início do serviço externo, o botão `"Iniciar"` (que passa para `cleaning_now`) também deve ser desabilitado com o mesmo tooltip.

3. **Desativação de Seleção em Lote (Linhas 945–958):**
   - O checkbox de seleção em lote deve ter a condição:
     ```tsx
     selectable && currentStatus === "dirty" && !isAssignedToOther && !isInstruction && !flat.serviceInProgress
     ```
   - Isso impede que a camareira selecione o quarto bloqueado para a ação coletiva de `"Vou Limpar"`.

#### Código Exemplo de Integração do Botão Desabilitado:
```tsx
{flat.serviceInProgress ? (
  <Tooltip>
    <TooltipTrigger asChild>
      <div className="w-full cursor-not-allowed">
        <Button 
          size="sm" 
          disabled 
          className="w-full bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold cursor-not-allowed shadow-none border border-slate-300 dark:border-slate-700"
        >
          <Wrench className="w-3.5 h-3.5 mr-1 text-amber-600" />
          <span>Iniciar Limpeza (Serviço em Andamento)</span>
        </Button>
      </div>
    </TooltipTrigger>
    <TooltipContent className="bg-slate-900 text-white text-xs max-w-xs p-2.5 rounded-xl shadow-lg border border-slate-700">
      <p className="font-bold text-amber-400 mb-0.5">⚠️ Limpeza Bloqueada</p>
      <p>Aguardando finalização do serviço: <strong>{flat.serviceInProgress.serviceTitle || "Serviço Externo"}</strong></p>
      {flat.serviceInProgress.workerName && (
        <p className="text-[11px] text-slate-300 mt-0.5">Prestador no local: {flat.serviceInProgress.workerName}</p>
      )}
    </TooltipContent>
  </Tooltip>
) : (
  /* Renderização normal dos botões de ação */
)}
```

---

### 2.4 Ponto Crítico de Integração Backend para R6

Em nossa inspeção de `dashboard.tsx` (linhas 87–90 e 609–630), constatamos que os cards são renderizados a partir do hook:
```typescript
const { data: checkouts } = useListCheckouts({ date: selectedDateStr })
```
Que chama **`GET /api/reservations/checkouts`** (e NÃO `GET /api/flats`).

**Recomendação Arquitetural:**
No backend (`artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`):
1. No endpoint `GET /api/reservations/checkouts` (linha 6114), ao mapear `requestsForDate.map(req_ => ...)`, calcular e incluir:
   ```javascript
   // Verifica se há ordem de serviço ativa com flat em andamento
   const activeOrder = (db.serviceOrders || []).find(so => so.status === "active");
   const activeFlatService = activeOrder?.flats?.find(f => 
     (f.flatId === flat.id || String(f.flatNumber) === String(flat.number)) && 
     f.status === "in_progress"
   );
   const serviceInProgress = activeFlatService ? {
     serviceTitle: activeOrder.title,
     workerName: activeFlatService.workerName || "",
     serviceOrderId: activeOrder.id
   } : null;
   ```
2. Adicionar `serviceInProgress` tanto no objeto raiz retornado quanto no objeto `flat` embutido.
3. Isso garante que a camareira veja o status em tempo real sem depender de chamadas adicionais no frontend.

---

## 3. Investigação R7 — Calendário PMS (`pms-calendar.tsx`)

### 3.1 Arquitetura do Calendário e Renderização da Linha do Tempo

O calendário em `artifacts/limpeza/src/pages/pms-calendar.tsx` (8292 linhas) implementa uma visão contínua multi-mês sem quebras:

1. **Linha do Tempo (Linhas 1416–1443):**
   - Início: `timelineStart = subDays(new Date(), 30)` (-30 dias)
   - Fim: `timelineEnd = addDays(new Date(), 90)` (+90 dias)
   - Intervalo: `daysInView = eachDayOfInterval({ start: timelineStart, end: timelineEnd })`
   - Larguras de coluna:
     - `FLAT_COL_WIDTH = 145px` (coluna fixa à esquerda com números dos apartamentos)
     - `EXPANDED_COL_WIDTH = 100px` (dia de hoje e ontem)
     - `NORMAL_COL_WIDTH = 48px` (demais dias)
   - `dayLayoutMap`: Dicionário indexado por data (`YYYY-MM-DD`) que calcula a posição exata `left` e `width` em pixels de cada dia na grade.

2. **Posicionamento de Blocos (`getBlockPosition`, linhas 1497–1525):**
   ```typescript
   const getBlockPosition = (startDate: string, endDate: string) => {
     // Localiza startDate e endDate no dayLayoutMap
     // startX = dayLayoutMap[startDate].left
     // endX = dayLayoutMap[endDate].left + dayLayoutMap[endDate].width
     // Retorna: { left: startX, width: Math.max(endX - startX, 24) }
   }
   ```
   Qualquer item em `data.blocks` com `startDate` e `endDate` válidos é desenhado perfeitamente como uma barra horizontal sobre as datas na linha correspondente do apartamento.

3. **Renderização dos Blocos de Quarto na Grade (Linhas 3848–3886):**
   ```tsx
   {flatBlocks.map(blockItem => {
     const bPos = getBlockPosition(blockItem.startDate, blockItem.endDate);
     if (!bPos) return null;
     return (
       <div
         key={`block-${blockItem.id}`}
         style={{ position: "absolute", left: `${bPos.left}px`, width: `${bPos.width}px`, top: "7px", height: "34px" }}
         onClick={(e) => { e.stopPropagation(); handleOpenBlockDetails(blockItem, flat); }}
         className="rounded-xl bg-slate-900/90 text-white flex items-center justify-between px-2.5 text-[10.5px] font-bold shadow-xs z-10 cursor-pointer overflow-hidden border border-slate-700 hover:border-amber-400/60"
       >
         {/* Conteúdo do Bloco */}
       </div>
     );
   })}
   ```

---

### 3.2 Ingestão de Dados da API (`GET /api/pms/calendar`)

No carregamento e a cada sincronização (função `fetchData()`, linhas 1555–1607):
- Requisição: `GET /api/pms/calendar?startDate=${startStr}&endDate=${endStr}&_t=${Date.now()}`
- O servidor (`demo-server.mjs`, linhas 9234–9249) responde com:
  ```json
  {
    "startDate": "...",
    "endDate": "...",
    "flats": [...],
    "reservations": [...],
    "blocks": [...]
  }
  ```

#### Injeção no Backend do Bloqueio de Serviço em `blocks`:
Para que o calendário PMS reconheça automaticamente serviços ativos com `estimatedFinishAt`, o backend `GET /api/pms/calendar` deve injetar os serviços na lista `blocks` enviada ao cliente:
```javascript
// Em demo-server.mjs (linhas 9234–9237):
const blocks = (db.roomBlocks || []).filter(b => b.startDate <= end && b.endDate >= start);

for (const order of (db.serviceOrders || [])) {
  if (order.status !== "active") continue;
  for (const fItem of (order.flats || [])) {
    if (fItem.status !== "in_progress" || !fItem.estimatedFinishAt) continue;
    const startDate = fItem.startedAt ? fItem.startedAt.slice(0, 10) : todayStr;
    const endDate = fItem.estimatedFinishAt.slice(0, 10);
    if (startDate <= end && endDate >= start) {
      blocks.push({
        id: `service_block_${order.id}_${fItem.flatId}`,
        flatId: fItem.flatId,
        flatNumber: fItem.flatNumber,
        startDate: startDate,
        endDate: endDate,
        reason: "service_order",
        serviceTitle: order.title,
        serviceOrderId: order.id,
        workerName: fItem.workerName || null,
        estimatedFinishAt: fItem.estimatedFinishAt,
        isServiceBlock: true,
        notes: `🔧 ${order.title}${fItem.workerName ? ` (Prestador: ${fItem.workerName})` : ''}`
      });
    }
  }
}
```

---

### 3.3 Como Renderizar o Badge Visual "🔧 [Título do Serviço]"

Na seção de renderização dos blocos (linhas 3848–3886 de `pms-calendar.tsx`):
Diferenciar se `blockItem.isServiceBlock || blockItem.reason === "service_order"`:

```tsx
{flatBlocks.map(blockItem => {
  const bPos = getBlockPosition(blockItem.startDate, blockItem.endDate);
  if (!bPos) return null;

  const isService = Boolean(blockItem.isServiceBlock || blockItem.reason === "service_order");

  return (
    <div
      key={`block-${blockItem.id}`}
      style={{ 
        position: "absolute",
        left: `${bPos.left}px`,
        width: `${bPos.width}px`,
        top: "7px",
        height: "34px"
      }}
      onClick={(e) => { e.stopPropagation(); handleOpenBlockDetails(blockItem, flat); }}
      className={cn(
        "rounded-xl flex items-center justify-between px-2.5 text-[10.5px] font-bold shadow-xs z-10 cursor-pointer overflow-hidden transition-all hover:scale-[1.01] active:scale-[0.99] group",
        isService 
          ? "bg-amber-950/95 hover:bg-amber-900 text-amber-100 border border-amber-500/80 shadow-amber-900/30"
          : "bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700 hover:border-amber-400/60"
      )}
      title={isService 
        ? `🔧 Serviço: ${blockItem.serviceTitle || blockItem.notes} • Previsão: ${blockItem.estimatedFinishAt ? format(parseISO(blockItem.estimatedFinishAt), "dd/MM HH:mm") : blockItem.endDate} • Clique para ver detalhes`
        : `Bloqueio: ${blockItem.reason === 'manutencao' ? 'Manutenção' : 'Bloqueio'} • Clique para ver detalhes ou remover`}
    >
      <div className="flex items-center gap-1.5 truncate">
        {isService ? (
          <>
            <Wrench className="w-3.5 h-3.5 shrink-0 text-amber-400 animate-pulse" />
            <span className="truncate font-black text-amber-200">
              🔧 {blockItem.serviceTitle || "Serviço Externo"}
              {blockItem.workerName && <span className="opacity-80 font-normal ml-1">({blockItem.workerName})</span>}
            </span>
          </>
        ) : (
          <>
            <Lock className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span className="truncate">
              {blockItem.reason === "manutencao" ? "🛠️ Manutenção" : "🔑 Bloqueio"} {blockItem.notes ? `• ${blockItem.notes}` : ""}
            </span>
          </>
        )}
      </div>

      {!isService && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteBlock(blockItem.id);
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-600 rounded-lg text-white transition-all shrink-0 ml-1.5"
          title="Remover Bloqueio"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
})}
```

#### Modal de Detalhes do Bloqueio (`blockDetailsModalOpen`, linhas 7630–7695):
Quando `selectedBlockForDetails.isServiceBlock` for verdadeiro:
- Mostrar cabeçalho com ícone `Wrench` e título `"Serviço Externo em Andamento"`.
- Exibir Prestador, Previsão de Término e botão `"Ir para Gestão de Serviços (/servicos)"` ao invés do botão destrutivo de remoção manual.

---

### 3.4 Fluxo de Criação de Reservas e Ponto de Interceptação com Aviso

O fluxo de criação de reservas ocorre através de 3 gatilhos:
1. **Desktop Mouse Drag na grade:** `handleStartDrag` -> ao soltar: `handleOpenNewResRange(flatId, start, end)` (linhas 1936–1962).
2. **Mobile 2-Tap na grade:** 1º toque marca início, 2º toque chama `handleOpenNewResRange` (linhas 1980–1995).
3. **Botão Superior "Nova Reserva":** Chama `handleOpenNewRes()` (linhas 2010–2050 e 3115).

Todos os fluxos inicializam os estados do formulário (`formFlatId`, `formCheckin`, `formCheckout`) e abrem o modal principal (`setResModalOpen(true)`).

#### A. Interceptação Visual no Formulário do Modal (`Dialog open={resModalOpen}`):
Calculamos a existência de sobreposição em tempo real:
```tsx
const activeServiceBlockConflict = useMemo(() => {
  if (!formFlatId || !formCheckin || !formCheckout) return null;
  return data.blocks.find(b => {
    if (!b.isServiceBlock && b.reason !== "service_order") return false;
    const sameFlat = b.flatId === Number(formFlatId) || String(b.flatNumber) === String(formFlatId);
    if (!sameFlat) return false;
    // Conflito de período (check-in antes do término do bloqueio e check-out após o início)
    return formCheckin < b.endDate && formCheckout > b.startDate;
  });
}, [formFlatId, formCheckin, formCheckout, data.blocks]);
```

Inserir banner de aviso de alta visibilidade no topo do formulário (logo acima dos campos de Apartamento e Canal, linha 4250):
```tsx
{activeServiceBlockConflict && (
  <div className="p-3 bg-amber-500/15 dark:bg-amber-950/40 border-2 border-amber-500/70 rounded-2xl flex items-start gap-3 text-xs text-amber-950 dark:text-amber-200 shadow-2xs">
    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
    <div className="space-y-1">
      <div className="font-black text-sm flex items-center gap-1.5 text-amber-900 dark:text-amber-300">
        <span>Aviso: Apartamento com Serviço Externo no Período</span>
      </div>
      <p className="text-[11.5px] leading-relaxed font-medium">
        O apartamento selecionado possui o serviço <strong>"{activeServiceBlockConflict.serviceTitle}"</strong> programado/em andamento
        {activeServiceBlockConflict.workerName ? ` com ${activeServiceBlockConflict.workerName}` : ""} até{" "}
        <strong>
          {activeServiceBlockConflict.estimatedFinishAt 
            ? format(parseISO(activeServiceBlockConflict.estimatedFinishAt), "dd/MM/yyyy 'às' HH:mm") 
            : activeServiceBlockConflict.endDate}
        </strong>.
      </p>
      <p className="text-[10.5px] text-amber-800 dark:text-amber-400 italic">
        ℹ️ Este bloqueio é visual. Administradores podem salvar a reserva normalmente para sobrescrever o período.
      </p>
    </div>
  </div>
)}
```

#### B. Interceptação no Envio (`handleSaveRes`, linha 2658):
Antes de submeter o `POST /api/pms/reservations`:
```tsx
if (activeServiceBlockConflict) {
  const flatObj = data.flats.find(f => String(f.id) === String(formFlatId));
  const proceed = confirm(
    `⚠️ AVISO DE CONFLITO COM SERVIÇO EXTERNO\n\n` +
    `O Apt ${flatObj?.number || formFlatId} possui o serviço "${activeServiceBlockConflict.serviceTitle}" em andamento no período selecionado (${format(parseISO(activeServiceBlockConflict.startDate), "dd/MM")} a ${format(parseISO(activeServiceBlockConflict.endDate), "dd/MM")}).\n\n` +
    `Deseja prosseguir e criar a reserva sobrescrevendo este bloqueio?`
  );
  if (!proceed) {
    return;
  }
}
```

#### C. Interceptação ao Mover/Redimensionar Reserva (`resDragState`, linha 1184):
Atualmente, a linha 1190 impede qualquer arraste se `hasBlockConflict` for verdadeiro via `alert()`.
Para permitir que o administrador sobrescreva serviços externos:
```tsx
const serviceBlockConflict = data.blocks.find(b => {
  const isService = b.isServiceBlock || b.reason === "service_order";
  if (!isService) return false;
  const sameFlat = b.flatId === current.currentFlatId || String(b.flatNumber) === String(current.currentFlatNumber);
  return sameFlat && b.startDate <= current.currentCheckout && b.endDate >= current.currentCheckin;
});

const hasHardBlockConflict = data.blocks.some(b => {
  if (b.isServiceBlock || b.reason === "service_order") return false;
  const sameFlat = b.flatId === current.currentFlatId || String(b.flatNumber) === String(current.currentFlatNumber);
  return sameFlat && b.startDate <= current.currentCheckout && b.endDate >= current.currentCheckin;
});

if (hasConflict || hasHardBlockConflict) {
  alert(`Não foi possível alterar a reserva: o Apt ${current.currentFlatNumber} já possui reserva ou bloqueio manual no período.`);
  setResDragState(null);
  return;
}

if (serviceBlockConflict) {
  const proceed = confirm(`⚠️ O Apt ${current.currentFlatNumber} possui o serviço "${serviceBlockConflict.serviceTitle}" em andamento neste período. Deseja sobrescrever e mover a reserva mesmo assim?`);
  if (!proceed) {
    setResDragState(null);
    return;
  }
}
```

---

## 4. Matriz de Compatibilidade e Endpoints Afetados

| Componente | Requisito | Ação Necessária | Arquivo de Destino |
|---|---|---|---|
| Maid Card | R6 | Inserir badge "🔧 Serviço em andamento" e box de aviso | `artifacts/limpeza/src/components/flat-card.tsx` |
| Maid Card | R6 | Desabilitar botão de início com tooltip explicativo | `artifacts/limpeza/src/components/flat-card.tsx` |
| Checkouts API | R6 (Prereq) | Retornar `serviceInProgress` em cada flat | `artifacts/api-server/demo-server.mjs` (linha ~6114) |
| PMS Calendar API | R7 (Prereq) | Injetar serviços com `estimatedFinishAt` no array `blocks` | `artifacts/api-server/demo-server.mjs` (linha ~9234) |
| Fair Share API | R7 (Prereq) | Considerar service blocks no cálculo de quarto sugerido | `artifacts/api-server/demo-server.mjs` (linha ~8840) |
| PMS Calendar | R7 | Renderizar barra de bloqueio "🔧 [Título do Serviço]" | `artifacts/limpeza/src/pages/pms-calendar.tsx` (linha ~3860) |
| PMS Calendar | R7 | Exibir alerta visual no modal de criação de reserva | `artifacts/limpeza/src/pages/pms-calendar.tsx` (linha ~4250) |
| PMS Calendar | R7 | Interceptar submissão (`confirm`) permitindo override admin | `artifacts/limpeza/src/pages/pms-calendar.tsx` (linha ~2658) |
| PMS Calendar | R7 | Ajustar colisão de drag-and-drop para permitir override | `artifacts/limpeza/src/pages/pms-calendar.tsx` (linha ~1184) |

---

## 5. Recomendações e Plano de Ação para os Implementadores

1. **Prioridade de Execução:**
   - No **M1 (Backend)**: Garantir que `GET /api/flats`, `GET /api/reservations/checkouts` e `GET /api/pms/calendar` já retornem os dados estruturados (`serviceInProgress` e blocos sintéticos de `service_order`).
   - No **M4 (Dashboard & Calendar Integrations)**: Realizar as modificações pontuais em `flat-card.tsx` e `pms-calendar.tsx` conforme especificado neste relatório.
2. **Build e Teste de Regressão:**
   - Testar o build (`npm run build` na pasta `artifacts/limpeza`) imediatamente após os edits para validar tipagem TypeScript do Radix Tooltip e Date-fns.
   - Certificar sincronismo byte-a-byte entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.

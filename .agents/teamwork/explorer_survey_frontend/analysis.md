# Frontend Architecture Survey & Blueprint Report

**Date:** 2026-09-30  
**Author:** Explorer 2 (Frontend Survey Explorer)  
**Target Module:** External Service Provider Management Module (`artifacts/limpeza/src/`)  
**Workspace:** `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`  

---

## 1. Executive Summary

This report maps the frontend architecture for the new **External Service Provider Management Module** within `artifacts/limpeza/src/`. The frontend stack is built with **React 18 + TypeScript + Vite + Tailwind CSS + Wouter + TanStack Query v5 + Radix UI / shadcn/ui**.

The investigation assessed five key architectural domains:
1. **Routing System (`App.tsx`) & Navigation (`layout.tsx`)**: Guard patterns (`AdminRoute`, `ReceptionRoute`, `StaffRoute`, standard `Route`), module naming conventions, route registration, and sidebar integration.
2. **UI Component Library & Design Patterns**: Comprehensive inventory of existing Radix UI / shadcn/ui components (`Tabs`, `Dialog`, `Progress`, `Table`, `Badge`, `Switch`, `RadioGroup`, `Toaster`, `Card`, `Tooltip`, etc.) and styling conventions.
3. **API & Data Fetching Patterns**: TanStack Query v5 object syntax, session cookie credentials handling, `customFetch` in `@workspace/api-client-react`, and browser-side WebP image compression (`image-compression.ts`).
4. **Admin Service Orders Specification (`service-orders.tsx` - R4)**: Component blueprint for the 3-tab architecture (Service List, Create/Edit Form, Real-time Tracking Panel) with exact UI component mappings.
5. **Public Worker Portal Specification (`service-worker-portal.tsx` - R5)**: Component blueprint for the mobile-first, standalone public portal with worker/collaborator registration banner, flat cards, camera/photo capture, and completion modal.
6. **Maid Dashboard & PMS Calendar Integrations (R6 & R7)**: Exact integration points in `flat-card.tsx` (service status badge & cleaning button lock) and `pms-calendar.tsx` (visual maintenance block display & booking warning).

---

## 2. Routing Configuration & Navigation Layout

### 2.1 Route Declaration Architecture (`artifacts/limpeza/src/App.tsx`)
`App.tsx` uses **Wouter** (`Route`, `Switch`, `useLocation`) wrapped inside `QueryClientProvider` and `TooltipProvider`:

```tsx
<QueryClientProvider client={queryClient}>
  <TooltipProvider>
    <VersionGuard>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster />
    </VersionGuard>
  </TooltipProvider>
</QueryClientProvider>
```

### 2.2 Route Guarding Patterns
`App.tsx` defines three guarded route components:

1. **`AdminRoute`** (Lines 95-101):
   ```tsx
   function AdminRoute({ path, component, moduleName }: { path: string; component: React.ComponentType<any>; moduleName: string }) {
     return (
       <Route path={path}>
         {(params) => <AdminGuard component={component} moduleName={moduleName} params={params} />}
       </Route>
     );
   }
   ```
   - Checks `useGetMe()`:
     - `isLoading`: Renders loading spinner ("Verificando permissões...").
     - `!user`: Redirects to `/login`.
     - `user.role !== "admin"`: Renders `<AccessDenied moduleName={moduleName} />`.
     - `user.role === "admin"`: Renders target component with params.
   - **Requirement for R4**: Notice `moduleName` is **required**! For example:
     ```tsx
     <AdminRoute path="/servicos" component={ServiceOrders} moduleName="a Gestão de Ordens de Serviço" />
     <AdminRoute path="/service-orders" component={ServiceOrders} moduleName="a Gestão de Ordens de Serviço" />
     ```

2. **Standard `Route`** (Public Routes, unauthenticated):
   ```tsx
   <Route path="/servico/:token" component={ServiceWorkerPortal} />
   <Route path="/service/:token" component={ServiceWorkerPortal} />
   ```
   - Standalone public routes (like `/reservar`, `/pre-checkin/:code`, `/checkout/:code`) do NOT wrap in `AdminGuard` or `StaffGuard`.
   - Standalone routes do NOT use `<Shell>` layout; they render clean, self-contained mobile-responsive interfaces.

### 2.3 Navigation & Sidebar Menu Integration (`artifacts/limpeza/src/components/layout.tsx`)
In `layout.tsx`, navigation items are categorized under `navCategories`:
- Current categories include:
  1. `🧹 Governança & Camareiras`
  2. `💬 Central de Comunicação`
  3. `📅 Reservas & Hospedagem`
  4. `🧾 Gestão Fiscal & NFS-e`
  5. `💰 Financeiro & Vendas`
  6. `🏨 Propriedade & Regras`
  7. `⚙️ Sistema & Integrações`

**Recommended Navigation Placement**:
Under category `🧹 Governança & Camareiras` (Lines 220-230 in `layout.tsx`):
```tsx
...(isAdmin ? [{
  href: "/servicos",
  label: "Ordens de Serviço & Prestadores",
  icon: Wrench, // import { Wrench } from "lucide-react"
  description: "Gestão de pintores, eletricistas e reparos em flats"
}] : []),
```

---

## 3. UI Component Inventory & Design Patterns

The project features a complete set of **shadcn/ui (Radix UI + Tailwind CSS)** components in `artifacts/limpeza/src/components/ui/`:

| Component | Path | Key Sub-components / Props | Use Case in Service Provider Module |
|-----------|------|---------------------------|-------------------------------------|
| **Tabs** | `components/ui/tabs.tsx` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | 3 abas da tela Admin R4: Lista, Criar/Editar, Acompanhamento |
| **Progress** | `components/ui/progress.tsx` | `Progress` (`value={0..100}`) | Barra de progresso de conclusão de flats na lista e tracking |
| **Table** | `components/ui/table.tsx` | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` | Tabela detalhada em tempo real na Aba 3 (Tracking Panel) |
| **Badge** | `components/ui/badge.tsx` | `Badge` (`variant="default" \| "secondary" \| "destructive" \| "outline"`) | Badges de status (`draft`, `active`, `closed`, `pending`, `in_progress`, `done`) e ocupação do flat |
| **Card** | `components/ui/card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | Cards de serviço (Aba 1) e cards de flats do prestador (R5) |
| **Dialog / Modal** | `components/ui/dialog.tsx` | `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `DialogDescription` | Modal de identificação obrigatória, modal de finalização com fotos, modal de zoom de foto |
| **Alert Dialog** | `components/ui/alert-dialog.tsx` | `AlertDialog`, `AlertDialogContent`, `AlertDialogAction`, etc. | Confirmação de encerramento de ordem ou reset de flat para pending |
| **Radio Group** | `components/ui/radio-group.tsx` | `RadioGroup`, `RadioGroupItem` | Seleção do `cleanFlatMode` e resposta obrigatória de `needsCleaning` |
| **Switch** | `components/ui/switch.tsx` | `Switch` (`checked`, `onCheckedChange`) | Toggle `requirePhotos`, toggle instruções individuais por flat |
| **Checkbox** | `components/ui/checkbox.tsx` | `Checkbox` (`checked`, `onCheckedChange`) | Seleção dos 19 flats ativos no grid de criação |
| **Input / Textarea** | `components/ui/input.tsx`, `textarea.tsx` | `Input`, `Textarea` | Campos de formulário (título, instruções, CPF, observações) |
| **Select** | `components/ui/select.tsx` | `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` | Filtro de ordem de serviço, filtros de status |
| **Toast** | `hooks/use-toast.ts` + `components/ui/toaster.tsx` | `const { toast } = useToast(); toast({ title, description, variant })` | Feedback ao copiar link, salvar serviço, finalizar flat, erros |
| **Tooltip** | `components/ui/tooltip.tsx` | `Tooltip`, `TooltipTrigger`, `TooltipContent` | Tooltips explicativos nos botões desabilitados |
| **Skeleton / Spinner**| `components/ui/skeleton.tsx`, `spinner.tsx` | `Skeleton`, `Spinner` | Estados de carregamento suave de dados |

### Design Tokens & Styling Conventions:
- **Tailwind CSS classes**:
  - Backgrounds: `bg-card`, `bg-background`, `bg-muted`, `bg-slate-50 dark:bg-slate-900`
  - Rounded corners: Modern curved aesthetics (`rounded-2xl`, `rounded-3xl`, `rounded-xl`)
  - Shadows: Subtle elevations (`shadow-xs`, `shadow-sm`, `shadow-md`, `shadow-2xl`)
  - Colors:
    - Primary: Indigo/Blue (`bg-primary`, `text-primary-foreground`)
    - Success: Emerald (`bg-emerald-600`, `text-emerald-700`, `bg-emerald-50`)
    - Warning: Amber (`bg-amber-500`, `text-amber-800`, `bg-amber-50`)
    - Danger/Blocked: Rose/Red (`bg-rose-500`, `text-rose-700`, `bg-rose-50`)
    - Information: Sky/Cyan (`bg-sky-500`, `text-sky-800`, `bg-sky-50`)

---

## 4. API Query Patterns, Auth & File Uploads

### 4.1 TanStack Query v5 Syntax
The application runs `@tanstack/react-query` v5 (`5.101.4`).
All query options must use the v5 object signature:

```tsx
// Querying Service Orders (Admin)
const { data, isLoading, refetch } = useQuery({
  queryKey: ["service-orders"],
  queryFn: async () => {
    const res = await fetch("/api/service-orders", { credentials: "include" });
    if (!res.ok) throw new Error("Erro ao carregar ordens de serviço");
    return res.json();
  },
  refetchInterval: 15000, // Background polling for live updates
});

// Mutations
const queryClient = useQueryClient();
const createOrderMutation = useMutation({
  mutationFn: async (newOrder) => {
    const res = await fetch("/api/service-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newOrder),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Falha ao criar ordem");
    }
    return res.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["service-orders"] });
    toast({ title: "Ordem criada com sucesso!" });
  },
});
```

### 4.2 Auth & Session Handling
- Web application calls send session cookies automatically via `credentials: "include"`.
- Public endpoints (`/api/service/public/:token/*`) do not require authentication cookies or Bearer tokens. They authenticate solely via the 24-character hexadecimal token in the URL.

### 4.3 Client-Side Image Compression (`image-compression.ts`)
The project contains an optimized browser image compression utility in `artifacts/limpeza/src/lib/image-compression.ts`:
- Automatically resizes high-resolution mobile photos (4K/8K, 5–10MB) down to 1280px–1400px WebP/JPEG (~80–120KB, ~97% reduction).
- Exports:
  ```ts
  import { compressImage } from "@/lib/image-compression";
  
  const result = await compressImage(file, {
    maxWidth: 1280,
    maxHeight: 1280,
    quality: 0.8,
    preferredFormat: "image/webp",
  });
  // result.base64 -> data:image/webp;base64,...
  ```
- This can be sent directly as Base64 in JSON payload or converted to a compressed Blob for FormData multipart upload.

---

## 5. Specification for Admin Management Page (`service-orders.tsx` - R4)

File: `artifacts/limpeza/src/pages/service-orders.tsx`  
Route: `<AdminRoute path="/servicos" component={ServiceOrders} moduleName="a Gestão de Ordens de Serviço" />`  
Layout: `<Shell>` wrapper with header and 3 tabs.

### 5.1 Tab 1 — Lista de Serviços
- **Header**: Search bar, filter by status (`all`, `active`, `closed`), button "+ Nova Ordem de Serviço" (activates Tab 2).
- **Cards Grid**:
  - Service Title (`order.title`).
  - Status Badge: Active (Emerald), Closed (Slate), Draft (Gray).
  - Progress indicator:
    - `<Progress value={(doneFlats / totalFlats) * 100} className="h-2" />`
    - Text: `X de Y flats finalizados (Z%)`
  - Settings summary chips:
    - `cleanFlatMode`: "Nunca limpo" / "Prioritário" / "Sempre livre"
    - `maxSimultaneousFlats`: "Máx. X simultâneos"
    - `maxFlatsPerDay`: "Máx. Y/dia"
    - `requirePhotos`: "Fotos obrigatórias"
  - Link Copiável:
    - Input readonly showing `${window.location.origin}/servico/${order.token}`
    - Button with `Copy` icon + tooltip: Click copies to clipboard, fires `toast({ title: "Link copiado!" })`.
    - Button with `ExternalLink` icon to open in new tab.
  - Card Action Buttons:
    - "Ver Acompanhamento": Switches to Tab 3 with this order pre-selected.
    - "Editar": Switches to Tab 2 loading this order's data.
    - "Encerrar / Reativar": Calls `PATCH /api/service-orders/:id` with toggled status.

### 5.2 Tab 2 — Criar / Editar Serviço
Form state schema:
```ts
interface ServiceOrderForm {
  title: string;
  cleanFlatMode: "never" | "priority" | "always";
  maxSimultaneousFlats: number;
  maxFlatsPerDay: number;
  requirePhotos: boolean;
  estimatedDurationHours: number | null;
  instructionFormat: "text" | "list";
  generalInstructions: string;
  customInstructionsByFlat: boolean;
  selectedFlatIds: number[];
  flatInstructions: Record<number, string>; // flatId -> specific instruction
}
```

- **Clean Flat Mode Radio Cards** (Visual clarity as requested in R4):
  - Option 1 (`"never"`): **🚫 Nunca permitir flat limpo**  
    *O prestador só poderá iniciar serviços em flats sujos (pós-checkout ou aguardando limpeza). Flats limpos ficam estritamente bloqueados para evitar retrabalho de camareiras.*
  - Option 2 (`"priority"`): **⚠️ Prioridade para flats sujos**  
    *O prestador só poderá iniciar um flat limpo se não houver nenhum outro flat da ordem em estado sujo. Assim que surgir um flat pós-checkout, ele deve ser priorizado.*
  - Option 3 (`"always"`): **✅ Liberar qualquer flat (com aviso)**  
    *O prestador pode escolher qualquer flat da ordem, mesmo que limpo. O sistema apenas destaca visualmente os que estão sujos como prioritários.*

- **Numeric & Toggle Fields**:
  - `maxSimultaneousFlats`: Number input (default `2`, min `1`, max `19`).
  - `maxFlatsPerDay`: Number input (default `4`, min `1`, max `19`).
  - `estimatedDurationHours`: Number input in hours (e.g. `4`, optional).
  - `requirePhotos`: Switch toggle (default `true`).
  - `instructionFormat`: ToggleGroup (`"text"` / `"list"`).

- **Flat Selection Grid (19 flats ativos)**:
  - Fetched via `useListFlats()` from `@workspace/api-client-react`.
  - Header actions: "Selecionar Todos" (selects all 19 flats) / "Desmarcar Todos".
  - Grid: `grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5`.
  - Flat Card Checkbox: Flat number, badge of current condition (Ocupado / Vago Limpo / Sujo).

- **Instructions Section**:
  - Textarea for General Instructions (applied to all flats).
  - Switch: "Personalizar instruções individuais por flat".
  - If checked: Displays collapsible cards for each selected flat allowing custom notes (e.g. "Pintar apenas teto do banheiro", "Trocar disjuntor do ar").

### 5.3 Tab 3 — Painel de Acompanhamento (Tracking Panel)
- Real-time polling with `refetchInterval: 10000` (10 seconds) or manual "Atualizar Agora" button.
- Filter toolbar:
  - Select active service order.
  - Filter flats by status: `Todos`, `Pendente`, `Em Andamento`, `Finalizado`.
- Summary Metrics:
  - 4 KPI cards: Total Flats | Pendentes | Em Andamento | Finalizados.
- Tracking Table (`<Table>`):
  - Columns:
    - **Flat**: Number + occupancy condition.
    - **Status**:
      - `pending`: Badge slate/muted ("Pendente")
      - `in_progress`: Badge blue/sky with pulsing dot ("Em Andamento")
      - `done`: Badge emerald with check icon ("Finalizado")
    - **Prestador**: `workerName` (CPF formatted).
    - **Início**: Timestamp formatted (`dd/MM/yyyy HH:mm`).
    - **Fim**: Timestamp formatted + elapsed duration (e.g. `1h 45min`).
    - **Precisa Camareira**:
      - `true`: `<Badge className="bg-amber-100 text-amber-900 border-amber-300">🧹 Sim, chamar camareira</Badge>`
      - `false`: `<Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">✓ Não, mantido limpo</Badge>`
      - `null`: `<span className="text-muted-foreground">-</span>`
    - **Obs**: Snippet with popover/modal on click.
    - **Fotos**: Count badge (e.g. "📷 3 fotos") clicking opens photo gallery dialog.
    - **Ação**: Botão "Reabrir / Resetar" (resets flat to `pending`, clears worker lock if needed).
- Flat Detail Dialog:
  - Clickable from any row to inspect complete details, high-res photos with zoom, worker name, and timestamps.

---

## 6. Specification for Public Worker Portal (`service-worker-portal.tsx` - R5)

File: `artifacts/limpeza/src/pages/service-worker-portal.tsx`  
Route: `<Route path="/servico/:token" component={ServiceWorkerPortal} />`  
Security: Public, no login required, no `Shell`.

### 6.1 Layout & Mobile Experience
- Viewport mobile-optimized: `max-w-xl mx-auto px-4 py-5 space-y-6`.
- Header: CorpFlats Logo, Service Order Title, Badge showing overall progress.

### 6.2 Identification Banner (Highlighted at top)
- State persisted in `serviceWorkers` on backend and cached in `localStorage`:
  - `gfm_worker_registered_${token}` = `{ id, mainWorker, collaborators }`.
- **State 1: Unregistered (Amber / Alert Style)**:
  - Alert Card with icon `UserCheck`.
  - Title: "Identificação do Prestador Obrigatória"
  - Inputs:
    - Nome Completo do Responsável (input text)
    - CPF do Responsável (input with CPF mask `000.000.000-00`)
  - Dynamic Collaborators List:
    - "+ Adicionar Ajudante / Colaborador"
    - Row with Name + CPF + remove button for each helper.
  - Button: "Salvar Identificação".
- **State 2: Registered (Emerald / Active Style)**:
  - Green Card with check icon.
  - "Prestador Identificado: **{mainWorker.name}** (CPF: {mainWorker.cpf})".
  - If collaborators: "Ajudantes: {collaborators.map(c => c.name).join(', ')}".
  - Small "Editar" button to update registration if needed.
- **Blocking Guard**:
  - If the worker clicks "Iniciar Serviço" on any flat without saving identification:
    - Shows blocking modal: "Identificação Necessária"
    - "Por favor, preencha seus dados de identificação no topo da tela antes de iniciar o serviço."
    - Smooth scroll to top identification card.

### 6.3 Flats Cards List
- For each flat in `order.flats`:
  - Card with prominent flat number (e.g. "Flat 204").
  - Flat occupancy badge:
    - 🔴 "Sujo Pós-Checkout"
    - 🟢 "Vago Limpo"
    - 🟣 "Ocupado por Hóspede"
  - Service status badge:
    - `pending`: "Aguardando"
    - `in_progress`: "Em Andamento (Iniciado às HH:mm)"
    - `done`: "Concluído ✓"
  - Instructions display:
    - Text format or bullet list format.
  - Action Button states:
    - **When `pending`**:
      - If validation rules fail:
        - Limit simultaneous reached: Disabled button with message `Limite atingido: máximo de ${maxSimultaneousFlats} flats em andamento.`
        - Limit daily reached: Disabled button with message `Limite diário atingido: máximo de ${maxFlatsPerDay} flats por dia.`
        - Clean flat blocked by rule: Disabled button with message `Flat limpo bloqueado: regras do serviço exigem iniciar flats sujos primeiro.`
      - If allowed: Button "🔧 Iniciar Serviço no Flat" (fires `POST /api/service/public/:token/flats/:flatId/start`).
    - **When `in_progress`**:
      - Button "✅ Finalizar Serviço" (opens Finalization Modal).
    - **When `done`**:
      - Badge "Finalizado ✓" (disabled, green with finish time).

### 6.4 Finalization Modal
Dialog triggered on "Finalizar Serviço":
- Header: "Finalizar Serviço — Flat {flatNumber}"
- Informational cleaning notice:
  - "A governança do hotel será notificada imediatamente após a finalização."
- **Mandatory `needsCleaning` check (if flat was originally clean)**:
  - Question: "Este flat precisa de camareira para higienização/revisão?"
  - Radio options:
    - `true`: "Sim, precisa de camareira para limpar/revisar"
    - `false`: "Não, o quarto permaneceu totalmente limpo e intacto"
  - Validation: User cannot submit without answering if the flat was clean!
- **Observations textarea**:
  - "Observações sobre o serviço realizado (reparos, detalhes, tintas usadas, etc.)"
- **Photo Upload (with camera capture & compression)**:
  - Label: `requirePhotos ? "Fotos do Serviço (Obrigatório)*" : "Fotos do Serviço (Opcional)"`
  - Input: `<input type="file" accept="image/*" capture="environment" multiple />`
  - Photos preview grid with remove button (X) on each photo.
  - Client-side compression via `compressImage()` ensures fast upload even on 3G/4G connections.
- Submit Button:
  - "Confirmar e Finalizar Serviço"
  - Submits to `POST /api/service/public/:token/flats/:flatId/finish`.
  - On success: Closes modal, refreshes portal data, shows completion celebration.

---

## 7. Integration Specifications: Maid Dashboard & PMS Calendar

### 7.1 Maid Dashboard Integration (`artifacts/limpeza/src/components/flat-card.tsx` - R6)
The maid dashboard renders each room via `FlatCard`.
When `GET /api/flats` returns `serviceInProgress: { serviceTitle, workerName, serviceOrderId }`:

1. **Badge Display** (inside badges area, around lines 1350–1362):
   ```tsx
   {flat.serviceInProgress && (
     <Badge className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] px-2 py-0.5 shadow-2xs flex items-center gap-1 rounded-lg animate-pulse">
       <Wrench className="w-3 h-3" />
       <span>🔧 Serviço em andamento: {flat.serviceInProgress.serviceTitle} ({flat.serviceInProgress.workerName})</span>
     </Badge>
   )}
   ```
2. **Action Button Disable** (around lines 1430–1475):
   - When `flat.serviceInProgress` is active, disable the "Vou Limpar" / "Iniciar" button:
   ```tsx
   {flat.serviceInProgress ? (
     <div className="p-2.5 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200 font-semibold">
       <Wrench className="w-4 h-4 text-amber-600 shrink-0" />
       <span>Flat em manutenção externa ({flat.serviceInProgress.serviceTitle}). Aguardando término do prestador para liberar a limpeza.</span>
     </div>
   ) : (
     // Standard Vou Limpar / Iniciar buttons
   )}
   ```

### 7.2 PMS Calendar Integration (`artifacts/limpeza/src/pages/pms-calendar.tsx` - R7)
In `pms-calendar.tsx`, room blocks are managed via `data.blocks` or visual overlays:
1. When a flat has an active service with `estimatedFinishAt`, display a block stripe/badge on the calendar grid:
   - Badge: `"🔧 [Título do Serviço]"` in amber/slate.
2. In the reservation creation modal (`handleSaveReservation`), if the chosen dates overlap with an active service:
   - Display a warning banner:
     `"⚠️ Atenção: O Flat {flatNumber} possui um serviço externo em andamento ({serviceTitle}) previsto até {estimatedFinishAt}. O bloqueio pode ser sobrescrito pelo administrador."`
   - Admin can confirm to proceed or pick another flat suggested by the Fair-Share algorithm.

---

## 8. Summary Table of Files to Create or Modify

| File Path | Action | Description |
|-----------|--------|-------------|
| `artifacts/limpeza/src/pages/service-orders.tsx` | **Create** | R4: Admin management page with 3 tabs (List, Create/Edit, Tracking Panel). |
| `artifacts/limpeza/src/pages/service-worker-portal.tsx` | **Create** | R5: Standalone public worker portal with token-based access, identification banner, flat cards, and finish modal. |
| `artifacts/limpeza/src/App.tsx` | **Modify** | Add imports and routes: `<AdminRoute path="/servicos" component={ServiceOrders} moduleName="a Gestão de Ordens de Serviço" />` and `<Route path="/servico/:token" component={ServiceWorkerPortal} />`. |
| `artifacts/limpeza/src/components/layout.tsx` | **Modify** | Add sidebar navigation link for `/servicos` under `🧹 Governança & Camareiras`. |
| `artifacts/limpeza/src/components/flat-card.tsx` | **Modify** | R6: Add `serviceInProgress` badge and cleaning button lock with explanatory message. |
| `artifacts/limpeza/src/pages/pms-calendar.tsx` | **Modify** | R7: Display visual block for flats with active services and warning on reservation attempt. |

---

## 9. Verification & Readiness Assessment

1. **All UI components required exist** in `artifacts/limpeza/src/components/ui/` (`Tabs`, `Progress`, `Table`, `Dialog`, `RadioGroup`, `Switch`, `Checkbox`, `Badge`, `Card`, etc.). No external package installation needed.
2. **Icons**: `lucide-react` is installed and includes all necessary icons (`Wrench`, `ClipboardList`, `Plus`, `Pencil`, `Copy`, `ExternalLink`, `CheckCircle2`, `AlertCircle`, `Camera`, `Clock`, `Trash2`, `RotateCcw`, `Sparkles`).
3. **Data Fetching**: `@tanstack/react-query` v5 is configured with standard cache and refetch capabilities.
4. **Image Handling**: `image-compression.ts` is available to compress mobile photos on client before upload.
5. **No conflicting routes**: Paths `/servicos` and `/servico/:token` do not collide with any existing routes in `App.tsx`.

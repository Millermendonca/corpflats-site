# Handoff Report — Frontend Bundle Explorer (Prioridade 1)

**Working directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_1\`  
**Target Milestone**: Prioridade 1 — Frontend Bundle, Code Splitting & Caching  
**Recipient**: Orchestrator & Worker Agents  

---

## 1. Observation

### 1.1 Cache Control no Servidor Node (`artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`)
- **Arquivo**: `artifacts/api-server/demo-server.mjs` (linhas 57430–57496) e `scripts/demo-server.mjs` (linhas 57430–57496).
- **Código atual**:
  ```javascript
  if (fs.existsSync(distPath)) {
    const assetsDir = path.join(distPath, "assets");
    if (fs.existsSync(assetsDir)) {
      app.use("/assets", express.static(assetsDir, {
        setHeaders: (res) => {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }));
      // Fallback para chunks JS com hash antigo (evita Failed to fetch dynamically imported module após deploy)
      app.get("/assets/:filename", (req, res, next) => { ... });
    }
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('/index.js') || filePath.endsWith('\\index.js') || filePath.endsWith('/index.css') || filePath.endsWith('\\index.css')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
    }));
  ```
- **Problema Observado**:
  1. A pasta `/assets` inteira está configurada com `no-store, no-cache, must-revalidate, proxy-revalidate` (linha 57435). Isso força o navegador a baixar novamente todos os chunks JS (mesmo os que possuem hash de conteúdo, como `BarChart-cXOFDI51.js` de 381 KB) em cada clique e navegação no 4G/5G.
  2. Arquivos sem hash (`index.js` e `index.css`) também estão com `no-store`, impedindo a resposta ultra-rápida HTTP `304 Not Modified` via ETag do Express.
  3. `index.html` em `serveSpaWithMetadata` (linhas 57101–57104) já possui `no-store, no-cache`, o que está correto para garantir a entrega da versão mais recente do HTML com as tags `<script>` corretas.

### 1.2 Configuração do Rollup/Vite (`artifacts/limpeza/vite.config.ts`)
- **Arquivo**: `artifacts/limpeza/vite.config.ts` (linhas 47–58)
- **Código atual**:
  ```typescript
  rollupOptions: {
    output: {
      // Nome fixo sem hash — cache-busting via servidor (Cache-Control)
      entryFileNames: 'assets/index.js',
      chunkFileNames: 'assets/[name]-[hash].js',
      assetFileNames: (assetInfo) => {
        if (assetInfo.name?.endsWith('.css')) return 'assets/index.css';
        return 'assets/[name]-[hash][extname]';
      },
    },
  },
  ```
- **Observação**:
  1. `entryFileNames` gera `assets/index.js` (fixo sem hash).
  2. Testes de regressão existentes (`tests/service-orders-admin-frontend.test.mjs`, linha 11 e 93; `tests/service-orders-admin-challenge.test.mjs`, linha 11) dependem explicitamente da existência física de `artifacts/limpeza/dist/public/assets/index.js` (`fs.existsSync(distJsPath)`).
  3. Por isso, a combinação exigida na R1 é: `entryFileNames: 'assets/index.js'` e `assets/index.css` servidos com `Cache-Control: no-cache` + ETag (revalidação imediata com 304), e todos os chunks `assets/[name]-[hash].js` servidos com cache imutável de 1 ano (`Cache-Control: public, max-age=31536000, immutable`).

### 1.3 Bundle Inicial Monolítico de 2.4 MB em `artifacts/limpeza/src/App.tsx`
- **Arquivo**: `artifacts/limpeza/src/App.tsx` (linhas 14–31)
- **Código atual**:
  ```typescript
  // Páginas públicas e operacionais principais (Carregamento Imediato — sem dependência de chunk dinâmico no 5G)
  import Login from '@/pages/login';
  import Dashboard from '@/pages/dashboard';
  import PmsCalendar from '@/pages/pms-calendar';
  import WhatsappAutomation from '@/pages/whatsapp-automation';
  import WhatsappChat from '@/pages/whatsapp-chat';
  import GuestPreCheckin from '@/pages/guest-pre-checkin';
  import AgencyGuestCredential from '@/pages/agency-guest-credential';
  import VerifyFnrh from '@/pages/verify-fnrh';
  import BookingEngine from '@/pages/booking-engine';
  import GuestBreakfast from '@/pages/guest-breakfast';
  import GuestCheckout from '@/pages/guest-checkout';
  import GuestPortal from '@/pages/guest-portal';
  import GuestMinibar from '@/pages/guest-minibar';
  import MyAccount from '@/pages/my-account';
  import ServiceOrders from '@/pages/service-orders';
  import ServiceWorkerPortal from '@/pages/service-worker-portal';
  import NotFound from '@/pages/not-found';
  ```
- **Tamanho dos Arquivos no Disco**:
  - `pms-calendar.tsx`: 687 KB
  - `whatsapp-automation.tsx`: 342 KB
  - `guest-portal.tsx`: 290 KB
  - `guest-pre-checkin.tsx`: 231 KB
  - `service-orders.tsx`: 188 KB
  - `whatsapp-chat.tsx`: 148 KB
  - `guest-minibar.tsx`: 118 KB
  - `service-worker-portal.tsx`: 108 KB
  - `guest-breakfast.tsx`: 88 KB
  - `booking-engine.tsx`: 83 KB
  - `my-account.tsx`: 54 KB
  - `dashboard.tsx`: 52 KB
  - `agency-guest-credential.tsx`: 36 KB
  - `guest-checkout.tsx`: 20 KB
  - `verify-fnrh.tsx`: 11 KB
  - `login.tsx`: 4.3 KB
  - `not-found.tsx`: 0.7 KB
  **Total gerado no bundle compilado `index.js`**: **2.407.757 bytes (~2.4 MB)**.
- **Observação**: Toda a árvore de componentes dessas 17 páginas está sendo embutida no arquivo `index.js`. O navegador é obrigado a baixar e fazer parse de 2.4 MB de JavaScript mesmo se o visitante for apenas um hóspede acessando `/minha-reserva` ou um funcionário acessando `/login`.

### 1.4 Vazamento de Dependência em `floating-new-reservation.tsx`
- **Arquivo**: `artifacts/limpeza/src/components/floating-new-reservation.tsx` (linhas 5 e 210)
- **Código atual**:
  ```typescript
  import PmsCalendar from '@/pages/pms-calendar';
  ...
  {!isOnReservationsPage && <PmsCalendar modalOnly />}
  ```
- **Observação Crítica**: `App.tsx` importa `<FloatingNewReservationButton />` estaticamente (linha 11 e 607). Se `FloatingNewReservationButton` continuar importando `PmsCalendar` estaticamente, o Rollup continuará puxando os 687 KB do `PmsCalendar` para o bundle principal `index.js`. É obrigatório tornar esse import dinâmico/lazy e só montar sob demanda quando o modal for aberto.

### 1.5 Cascata Sequencial (Waterfall) nos Guards de Rota em `App.tsx`
- **Arquivo**: `artifacts/limpeza/src/App.tsx` (linhas 127–260)
- **Código atual**:
  ```typescript
  function AdminGuard({ component: Component, moduleName, params }: { component: React.ComponentType<any>; moduleName: string; params?: any }) {
    const { data: user, isLoading } = useGetMe();
    const [location] = useLocation();

    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-muted-foreground font-semibold">Verificando permissões...</span>
          </div>
        </div>
      );
    }

    if (!user) {
      return <Redirect to="/login" />;
    }

    if (!hasModuleAccess(user as any, location)) {
      return <AccessDenied moduleName={moduleName} />;
    }

    return <Component {...params} />;
  }
  ```
  *(Estrutura idêntica em `DevGuard` linha 161, `ReceptionGuard` linha 195 e `StaffGuard` linha 229).*
- **Problema Observado**:
  1. Durante o carregamento inicial, `useGetMe()` faz a requisição de rede para `GET /api/auth/me`. Enquanto a requisição está em trânsito, `isLoading === true`.
  2. O guard renderiza a tela com o spinner "Verificando permissões...".
  3. `<Component {...params} />` **NÃO é renderizado**.
  4. Como `Component` é embrulhado em `React.lazy()`, o React **só dispara a busca do chunk JS quando `<Component />` é montado na árvore**.
  5. **Waterfall**: Primeiro espera a rede responder `/api/auth/me` (300ms–1500ms). Só depois o Guard monta o componente e o navegador começa a baixar o chunk lazy do módulo (mais 400ms–1500ms). Durante esse tempo, o usuário vê o spinner de carregamento de módulo.

---

## 2. Logic Chain & Recommended Strategy

### 2.1 Smart Asset Caching no Backend Node
- **Premissa 1**: Chunks JS e arquivos de assets que possuem hash em seu nome (ex: `[name]-[hash].js`, `[name]-[hash].css`) têm conteúdo criptograficamente atrelado ao nome do arquivo. Uma vez criados, seu conteúdo nunca muda.
- **Premissa 2**: Arquivos sem hash (`index.js`, `index.css`, `favicon.ico`, `manifest.json`) podem ser atualizados em cada deploy, mas durante o uso normal raramente mudam. O cabeçalho `Cache-Control: no-cache` instrui o navegador a armazená-los em cache, mas sempre enviar uma requisição condicional leve (`If-None-Match: <etag>`). Se o arquivo não mudou, o servidor responde `304 Not Modified` instantaneamente com 0 bytes de payload.
- **Premissa 3**: `index.html` e `sw.js` precisam sempre refletir o estado mais recente sem qualquer cache intermediário (`Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`), para que o cliente sempre obtenha os links mais recentes para os chunks com hash.
- **Estratégia Recomendada para `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`**:
  Substituir os blocos de `express.static` nas linhas 57430–57496 pela função padronizada `setSmartAssetCacheHeaders`:

  ```javascript
  function setSmartAssetCacheHeaders(res, filePath) {
    const fileName = path.basename(filePath);

    // 1. index.html e Service Worker: NUNCA armazenar em cache
    if (fileName === 'index.html' || fileName === 'sw.js' || fileName === 'service-worker.js') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return;
    }

    // 2. Chunks e assets imutáveis com hash gerados pelo Vite
    const isHashed = /-[a-zA-Z0-9_-]{6,}\.(js|mjs|css|png|jpg|jpeg|gif|svg|webp|woff|woff2|ico|json|map)$/i.test(fileName);
    if (isHashed) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return;
    }

    // 3. Arquivos sem hash (ex: index.js, index.css, favicon.ico, manifest.json)
    // Permite cache no navegador com revalidação condicional obrigatória via ETag (HTTP 304 Not Modified)
    res.setHeader('Cache-Control', 'no-cache');
  }
  ```

  Aplicar essa função em:
  ```javascript
  if (fs.existsSync(distPath)) {
    const assetsDir = path.join(distPath, "assets");
    if (fs.existsSync(assetsDir)) {
      app.use("/assets", express.static(assetsDir, {
        setHeaders: setSmartAssetCacheHeaders
      }));
      // Manter a rota de fallback para chunks antigos...
    }
    app.use(express.static(distPath, {
      setHeaders: setSmartAssetCacheHeaders
    }));
    ...
  } else if (fs.existsSync(fallbackDistPath)) {
    app.use(express.static(fallbackDistPath, {
      setHeaders: setSmartAssetCacheHeaders
    }));
    ...
  }
  ```

### 2.2 Configuração em `artifacts/limpeza/vite.config.ts`
- **Estratégia Recomendada**:
  Manter o `entryFileNames: 'assets/index.js'` para garantir a compatibilidade com os testes existentes, garantir que `chunkFileNames` utilize `assets/[name]-[hash].js` e que CSS isolado receba hash se não for o `index.css`:
  ```typescript
  rollupOptions: {
    output: {
      entryFileNames: 'assets/index.js',
      chunkFileNames: 'assets/[name]-[hash].js',
      assetFileNames: (assetInfo) => {
        if (assetInfo.name === 'index.css' || (assetInfo.name?.endsWith('.css') && !assetInfo.name?.includes('-'))) {
          return 'assets/index.css';
        }
        return 'assets/[name]-[hash][extname]';
      },
    },
  },
  ```

### 2.3 Conversão das Páginas Pesadas em `artifacts/limpeza/src/App.tsx` para `lazyWithRetry`
- **Premissa**: A função `lazyWithRetry` já existe em `App.tsx` (linhas 33–63).
- **Aprimoramento da Função `lazyWithRetry`**: Adicionar a capacidade de pré-carregamento imediato `.preload()` para que guards possam disparar o download do chunk dinâmico sem esperar a resolução síncrona:
  ```typescript
  function lazyWithRetry<T extends React.ComponentType<any>>(
    factory: () => Promise<{ default: T }>
  ) {
    let factoryPromise: Promise<{ default: T }> | null = null;
    const loadWithRetry = () => {
      if (!factoryPromise) {
        factoryPromise = (async () => {
          const delays = [500, 1200, 2200];
          let lastError: unknown;
          for (let attempt = 0; attempt <= delays.length; attempt++) {
            try {
              return await factory();
            } catch (err) {
              lastError = err;
              if (attempt < delays.length) {
                await new Promise((r) => setTimeout(r, delays[attempt]));
              }
            }
          }
          if (typeof window !== 'undefined') {
            try {
              const lastReload = Number(sessionStorage.getItem('gfm_chunk_reload_ts') || '0');
              const now = Date.now();
              if (now - lastReload > 10000) {
                sessionStorage.setItem('gfm_chunk_reload_ts', String(now));
                window.location.reload();
              }
            } catch {}
          }
          throw lastError;
        })();
      }
      return factoryPromise;
    };

    const LazyComponent = lazy(loadWithRetry) as React.LazyExoticComponent<T> & { preload: () => Promise<{ default: T }> };
    LazyComponent.preload = loadWithRetry;
    return LazyComponent;
  }
  ```
- **Conversão dos Imports Estáticos no Topo de `App.tsx`**:
  Manter apenas `Login` e `NotFound` estáticos (ou lazy) para que a tela de login inicial abra em menos de 10ms:
  ```typescript
  import Login from '@/pages/login';
  import NotFound from '@/pages/not-found';

  // 15 Páginas Operacionais Pesadas convertidas para lazyWithRetry com code-splitting
  const Dashboard = lazyWithRetry(() => import('@/pages/dashboard'));
  const PmsCalendar = lazyWithRetry(() => import('@/pages/pms-calendar'));
  const WhatsappAutomation = lazyWithRetry(() => import('@/pages/whatsapp-automation'));
  const WhatsappChat = lazyWithRetry(() => import('@/pages/whatsapp-chat'));
  const GuestPreCheckin = lazyWithRetry(() => import('@/pages/guest-pre-checkin'));
  const AgencyGuestCredential = lazyWithRetry(() => import('@/pages/agency-guest-credential'));
  const VerifyFnrh = lazyWithRetry(() => import('@/pages/verify-fnrh'));
  const BookingEngine = lazyWithRetry(() => import('@/pages/booking-engine'));
  const GuestBreakfast = lazyWithRetry(() => import('@/pages/guest-breakfast'));
  const GuestCheckout = lazyWithRetry(() => import('@/pages/guest-checkout'));
  const GuestPortal = lazyWithRetry(() => import('@/pages/guest-portal'));
  const GuestMinibar = lazyWithRetry(() => import('@/pages/guest-minibar'));
  const MyAccount = lazyWithRetry(() => import('@/pages/my-account'));
  const ServiceOrders = lazyWithRetry(() => import('@/pages/service-orders'));
  const ServiceWorkerPortal = lazyWithRetry(() => import('@/pages/service-worker-portal'));
  ```
- **Resultado Esperado no Build**:
  - O arquivo `dist/public/assets/index.js` terá seu tamanho reduzido de 2.4 MB para ~250 KB!
  - Cada página pesada gerará seu chunk isolado com hash (ex: `pms-calendar-[hash].js`, `guest-portal-[hash].js`, etc.).
  - A rota `<GuestPortalWrapper />` continuará funcionando normalmente porque o componente `<Suspense>` já engloba todo o `<Switch>` em `Router()` (linha 287).

### 2.4 Eliminação do Waterfall nos Route Guards com Cache de Sessão Não-Bloqueante
- **Premissa de Segurança**:
  1. A segurança real da aplicação reside no backend (cookies HTTP-only protegidos, autenticação JWT/session em todas as rotas `/api/*`).
  2. O frontend guarda uma cópia da identidade do usuário para renderizar telas e permissões.
  3. Se armazenarmos o usuário autenticado em `sessionStorage` e `localStorage` sob a chave `gfm_auth_user_session_v1`, podemos:
     - Inicializar o `queryClient` do TanStack Query imediatamente com `queryClient.setQueryData(getGetMeQueryKey(), cachedUser)` no boot da aplicação.
     - Isso faz com que `useGetMe()` retorne o usuário instantaneamente no primeiro render (`data !== undefined`), enquanto revalida silenciosamente em segundo plano com o backend.
     - Se o backend retornar `401 Unauthorized` ou sessão inválida, o React Query descarta os dados e o Guard redireciona imediatamente para `/login`, mantendo a integridade estrita das rotas protegidas.
- **Implementação da Camada de Sessão em `App.tsx`**:
  ```typescript
  import { useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';

  const SESSION_USER_KEY = 'gfm_auth_user_session_v1';

  function getCachedAuthUser(): any | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(SESSION_USER_KEY) || localStorage.getItem(SESSION_USER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.id && parsed.role) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  function setCachedAuthUser(user: any | null) {
    if (typeof window === 'undefined') return;
    try {
      if (user) {
        const serialized = JSON.stringify(user);
        sessionStorage.setItem(SESSION_USER_KEY, serialized);
        localStorage.setItem(SESSION_USER_KEY, serialized);
      } else {
        sessionStorage.removeItem(SESSION_USER_KEY);
        localStorage.removeItem(SESSION_USER_KEY);
      }
    } catch {}
  }

  // Hook centralizado para guards com revalidação não-bloqueante
  function useSessionUser() {
    const { data: user, isLoading, isError } = useGetMe();

    useEffect(() => {
      if (user) {
        setCachedAuthUser(user);
      } else if (user === null || isError) {
        setCachedAuthUser(null);
      }
    }, [user, isError]);

    const cached = getCachedAuthUser();
    const effectiveUser = user !== undefined ? user : cached;
    const isTrulyLoading = isLoading && !cached;

    return {
      user: effectiveUser,
      isLoading: isTrulyLoading,
    };
  }
  ```

  - **Inicialização do React Query**:
  ```typescript
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 5000,
      }
    }
  });

  const initialUser = getCachedAuthUser();
  if (initialUser) {
    queryClient.setQueryData(getGetMeQueryKey(), initialUser);
  }
  ```

- **Guards Otimizados (`AdminGuard`, `DevGuard`, `ReceptionGuard`, `StaffGuard`)**:
  ```typescript
  function AdminGuard({ component: Component, moduleName, params }: { component: React.ComponentType<any>; moduleName: string; params?: any }) {
    const { user, isLoading } = useSessionUser();
    const [location] = useLocation();

    // Dispara o download antecipado do chunk JS da rota em paralelo enquanto verifica se necessário
    useEffect(() => {
      if ((Component as any)?.preload) {
        (Component as any).preload();
      }
    }, [Component]);

    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-muted-foreground font-semibold">Verificando permissões...</span>
          </div>
        </div>
      );
    }

    if (!user) {
      return <Redirect to="/login" />;
    }

    if (!hasModuleAccess(user as any, location)) {
      return <AccessDenied moduleName={moduleName} />;
    }

    return <Component {...params} />;
  }
  ```
  *(Aplicar a mesma substituição em `DevGuard`, `ReceptionGuard` e `StaffGuard`).*

---

## 3. Caveats & Edge Cases

1. **Dependência Circular ou Indireta com `floating-new-reservation.tsx`**:
   - Se o Worker alterar `App.tsx` para lazy import de `PmsCalendar`, mas esquecer de alterar `artifacts/limpeza/src/components/floating-new-reservation.tsx`, o Vite colocará o `PmsCalendar` no bundle principal de qualquer forma.
   - **Ação**: O Worker deve alterar a linha 5 de `floating-new-reservation.tsx` para `const PmsCalendar = React.lazy(() => import('@/pages/pms-calendar'));` e envolver a renderização com `<React.Suspense fallback={null}>`, ou montar apenas quando `isResModalOpen === true`.
2. **Paridade Twin-Server**:
   - `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` são servidores gêmeos. A alteração em `express.static` deve ser aplicada em ambos os arquivos para garantir coerência caso o ambiente de execução alterne entre eles.
3. **Logout e Expiração de Sessão**:
   - Quando o usuário clica em Sair (em `layout.tsx` linha 169), o código chama `queryClient.setQueryData(getGetMeQueryKey(), null)`.
   - O hook `useSessionUser` detecta `user === null` e apaga `gfm_auth_user_session_v1`, garantindo que um usuário deslogado não consiga ver resquícios de interface administrativa.
4. **Reserva do Arquivo `assets/index.js` nos Testes**:
   - Alguns testes checam `assert.ok(fs.existsSync(distJsPath))`. Mantendo `entryFileNames: 'assets/index.js'`, esses testes continuarão passando com 100% de sucesso sem nenhuma alteração nos scripts de teste.

---

## 4. Conclusion

1. **Causa Raiz da Lentidão e Tela Branca**:
   - O cabeçalho `Cache-Control: no-store` aplicado a todo o diretório `/assets` em `demo-server.mjs` proibia o navegador de reter qualquer chunk ou CSS compilado.
   - O bundle inicial `index.js` acumulava 2.4 MB devido a 17 páginas pesadas importadas estaticamente.
   - Os guards de rota bloqueavam o download dos chunks com um spinner enquanto aguardavam a resposta síncrona de `/api/auth/me`.
2. **Solução Completa e Segura**:
   - Cache imutável (`Cache-Control: public, max-age=31536000, immutable`) para chunks com hash; validação por ETag (`Cache-Control: no-cache`) para arquivos sem hash (`index.js`, `index.css`); e `no-store` estrito para `index.html` e `sw.js`.
   - Conversão de todas as 15 páginas operacionais pesadas em `App.tsx` para `lazyWithRetry`.
   - Remoção do import estático de `PmsCalendar` em `floating-new-reservation.tsx`.
   - Hidratação imediata do usuário no TanStack Query com cache de sessão não-bloqueante nos guards, executando download de chunks em paralelo à revalidação da sessão.

---

## 5. Verification Method

Para o Worker validar a implementação com segurança:

1. **Executar o Build do Frontend**:
   ```powershell
   cd "c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\artifacts\limpeza"
   npm run build
   ```
   - **Critério de Aceite**: O build deve completar sem erros TypeScript ou Rollup.
   - **Verificação de Tamanho**: O arquivo `artifacts/limpeza/dist/public/assets/index.js` deve ser significativamente menor que os 2.4 MB originais (esperado: entre 200 KB e 450 KB). Múltiplos chunks com hash (ex: `pms-calendar-*.js`, `whatsapp-automation-*.js`) devem estar presentes na pasta `dist/public/assets/`.

2. **Executar Teste Pontual Estrito do Frontend** (Respeitando estritamente a regra de ouro de não rodar suítes globais):
   ```powershell
   cd "c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager"
   node tests/service-orders-admin-frontend.test.mjs
   ```
   - **Critério de Aceite**: O teste pontual de frontend deve passar completamente (asserções sobre a existência do bundle e integridade dos componentes).

3. **Verificação dos Cabeçalhos HTTP de Cache**:
   - Iniciar o servidor de teste ou inspecionar a resposta de `/assets/index.js`: deve conter `Cache-Control: no-cache` e header `ETag`.
   - Requisitar qualquer chunk com hash (ex: `/assets/pms-calendar-*.js`): deve conter `Cache-Control: public, max-age=31536000, immutable`.
   - Requisitar `/` ou `/index.html`: deve conter `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`.

4. **Diretriz de Controle de Versão**:
   - Incluir os arquivos atualizados em `artifacts/limpeza/dist/` no commit.
   - Executar `git push origin main` imediatamente após o commit.

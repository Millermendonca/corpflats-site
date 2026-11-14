import { type ReactNode, Suspense, lazy, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { cancelGoogleOneTap } from '@/lib/auth-client';
import { useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';
import { AccessDenied } from '@/components/access-denied';
import { CorpFlatsSplashScreen } from '@/components/brand-logo';
import { hasModuleAccess } from '@/lib/permissions';
import NotFound from '@/pages/not-found';

const AdminAiCopilot = lazy(() => import('@/components/admin-ai-copilot').then(m => ({ default: m.AdminAiCopilot })));

const INITIAL_SSR_SNAPSHOT_HTML =
  typeof document !== 'undefined'
    ? document.getElementById('ssr-seo-snapshot')?.outerHTML || ''
    : '';

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

// 15 Páginas Operacionais Pesadas convertidas para lazyWithRetry com code-splitting
const Dashboard = lazyWithRetry(() => import('@/pages/dashboard'));
const PmsCalendar = lazyWithRetry(() => import('@/pages/pms-calendar'));
const WhatsappAutomation = lazyWithRetry(() => import('@/pages/whatsapp-automation'));
const WhatsappBroadcast = lazyWithRetry(() => import('@/pages/whatsapp-broadcast'));
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
// import ServiceOrders from '@/pages/service-orders';
const ServiceOrders = lazyWithRetry(() => import('@/pages/service-orders'));
const ServiceWorkerPortal = lazyWithRetry(() => import('@/pages/service-worker-portal'));
const HandymanPortal = lazyWithRetry(() => import('@/pages/handyman-portal'));

// Páginas Administrativas e Backoffice Secundárias (Code-Splitting com Retry Automático)
const History = lazyWithRetry(() => import('@/pages/history'));
const Settings = lazyWithRetry(() => import('@/pages/settings'));
const PropertySettings = lazyWithRetry(() => import('@/pages/property-settings'));
const Tasks = lazyWithRetry(() => import('@/pages/tasks'));
const Observations = lazyWithRetry(() => import('@/pages/observations'));
const LostAndFoundPage = lazyWithRetry(() => import('@/pages/lost-and-found'));
const Reports = lazyWithRetry(() => import('@/pages/reports'));
const Surveys = lazyWithRetry(() => import('@/pages/surveys'));
const PmsReportsPage = lazyWithRetry(() => import('@/pages/pms-reports'));
const CrmGuests = lazyWithRetry(() => import('@/pages/crm-guests'));
const ReceptionTablet = lazyWithRetry(() => import('@/pages/reception-tablet'));
const FinancialDashboard = lazyWithRetry(() => import('@/pages/financial-dashboard'));
const MarketingTraffic = lazyWithRetry(() => import('@/pages/marketing-traffic'));
const FiscalInvoices = lazyWithRetry(() => import('@/pages/fiscal-invoices'));
const BreakfastProduction = lazyWithRetry(() => import('@/pages/breakfast-production'));
const NotificationsHub = lazyWithRetry(() => import('@/pages/notifications-hub'));
const ReceptionCheckout = lazyWithRetry(() => import('@/pages/reception-checkout'));
const LiveOperationsPanel = lazyWithRetry(() => import('@/pages/live-operations-panel'));
const ReviewInsights = lazyWithRetry(() => import('@/pages/review-insights'));
const GarageDashboard = lazyWithRetry(() => import('@/pages/garage-dashboard'));
const Payments = lazyWithRetry(() => import('@/pages/payments'));
const SiteEditor = lazyWithRetry(() => import('@/pages/site-editor'));
const TarifasEditor = lazyWithRetry(() => import('@/pages/tarifas'));
const SystemLogsPage = lazyWithRetry(() => import('@/pages/system-logs'));
const MaidWhatsappAutomation = lazyWithRetry(() => import('@/pages/maid-whatsapp-automation'));
const ShoppingListPage = lazyWithRetry(() => import('@/pages/shopping-list'));
const AiStatusPage = lazyWithRetry(() => import('@/pages/ai-status'));
const MaidStatementPage = lazyWithRetry(() => import('@/pages/maid-statement'));
const ZapiConnection = lazyWithRetry(() => import('@/pages/zapi-connection'));
const EmailHub = lazyWithRetry(() => import('@/pages/email-hub'));
const ReservationJourney = lazyWithRetry(() => import('@/pages/reservation-journey'));
const ServerMonitorPage = lazyWithRetry(() => import('@/pages/server-monitor'));
const SmartFlatPreview = lazyWithRetry(() => import('@/pages/smart-flat-preview'));
const PricingSebraePage = lazyWithRetry(() => import('@/pages/precificacao-sebrae'));
const OtaInboxPage = lazyWithRetry(() => import('@/pages/ota-inbox'));
const ReservationsListPage = lazyWithRetry(() => import('@/pages/reservations-list'));
const AjudaWbpPage = lazyWithRetry(() => import('@/pages/ajuda-wbp'));
const EquipePage = lazyWithRetry(() => import('@/pages/equipe'));
const FlatXrayHub = lazyWithRetry(() => import('@/pages/flat-xray-hub'));
const AnserveRestock = lazyWithRetry(() => import('@/pages/anserve-restock'));
const AnserveDashboard = lazyWithRetry(() => import('@/pages/anserve-dashboard'));
const MinibarAdmin = lazyWithRetry(() => import('@/pages/minibar-admin'));
const MinibarInvoices = lazyWithRetry(() => import('@/pages/minibar-invoices'));
const HrDashboard = lazyWithRetry(() => import('@/pages/hr-dashboard'));
const PontoMobile = lazyWithRetry(() => import('@/pages/ponto-mobile'));
const Login = lazyWithRetry(() => import('@/pages/login'));
const FloatingNewReservationButton = lazyWithRetry(() =>
  import('@/components/floating-new-reservation').then((m) => ({
    default: m.FloatingNewReservationButton,
  }))
);
const RestockerVoiceNotifier = lazyWithRetry(() =>
  import('@/components/restocker-voice-notifier').then((m) => ({
    default: m.RestockerVoiceNotifier,
  }))
);

const PUBLIC_BOOKING_SEO_PATHS = new Set([
  '/',
  '/hospedagem-corporativa-campos',
  '/fim-de-semana-campos',
  '/flat-centro-campos-rj',
  '/estadia-longa-campos',
  '/reservar',
  '/booking',
]);

if (typeof window !== 'undefined') {
  const initPath = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  if (PUBLIC_BOOKING_SEO_PATHS.has(initPath)) {
    BookingEngine.preload().catch(() => {});
  }
}


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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5000,
      retry: (failureCount, error: any) => {
        const status = error?.status ?? error?.response?.status;
        if (status === 401 || status === 403 || /\b(401|403)\b/.test(String(error?.message || ""))) {
          return false;
        }
        return failureCount < 2;
      },
    }
  }
});

const initialUser = getCachedAuthUser();
if (initialUser) {
  queryClient.setQueryData(getGetMeQueryKey(), initialUser);
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

function Redirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation(to); }, [setLocation, to]);
  return null;
}

function AdminGuard({ component: Component, moduleName, params }: { component: React.ComponentType<any>; moduleName: string; params?: any }) {
  const { user, isLoading } = useSessionUser();
  const [location] = useLocation();

  useEffect(() => {
    if ((Component as any)?.preload) {
      (Component as any).preload();
    }
  }, [Component]);

  if (isLoading) {
    return <CorpFlatsSplashScreen label="Verificando permissões..." />;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (!hasModuleAccess(user as any, location)) {
    return <AccessDenied moduleName={moduleName} />;
  }

  return <Component {...params} />;
}

function AdminRoute({ path, component, moduleName }: { path: string; component: React.ComponentType<any>; moduleName: string }) {
  return (
    <Route path={path}>
      {(params) => <AdminGuard component={component} moduleName={moduleName} params={params} />}
    </Route>
  );
}

function DevGuard({ component: Component, moduleName, params }: { component: React.ComponentType<any>; moduleName: string; params?: any }) {
  const { user, isLoading } = useSessionUser();
  const [location] = useLocation();

  useEffect(() => {
    if ((Component as any)?.preload) {
      (Component as any).preload();
    }
  }, [Component]);

  if (isLoading) {
    return <CorpFlatsSplashScreen label="Verificando permissões de desenvolvedor..." />;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (user.role !== "dev" || !hasModuleAccess(user as any, location)) {
    return <AccessDenied moduleName={moduleName} />;
  }

  return <Component {...params} />;
}

function DevRoute({ path, component, moduleName }: { path: string; component: React.ComponentType<any>; moduleName: string }) {
  return (
    <Route path={path}>
      {(params) => <DevGuard component={component} moduleName={moduleName} params={params} />}
    </Route>
  );
}

function ReceptionGuard({ component: Component, moduleName, params }: { component: React.ComponentType<any>; moduleName: string; params?: any }) {
  const { user, isLoading } = useSessionUser();
  const [location] = useLocation();

  useEffect(() => {
    if ((Component as any)?.preload) {
      (Component as any).preload();
    }
  }, [Component]);

  if (isLoading) {
    return <CorpFlatsSplashScreen label="Verificando credenciais..." />;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (!hasModuleAccess(user as any, location)) {
    return <AccessDenied moduleName={moduleName} />;
  }

  return <Component {...params} />;
}

function ReceptionRoute({ path, component, moduleName }: { path: string; component: React.ComponentType<any>; moduleName: string }) {
  return (
    <Route path={path}>
      {(params) => <ReceptionGuard component={component} moduleName={moduleName} params={params} />}
    </Route>
  );
}

function StaffGuard({ component: Component, moduleName = "o módulo de governança", params }: { component: React.ComponentType<any>; moduleName?: string; params?: any }) {
  const { user, isLoading } = useSessionUser();
  const [location] = useLocation();

  useEffect(() => {
    if ((Component as any)?.preload) {
      (Component as any).preload();
    }
  }, [Component]);

  if (isLoading) {
    return <CorpFlatsSplashScreen label="Carregando governança..." />;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (!hasModuleAccess(user as any, location)) {
    return <AccessDenied moduleName={moduleName} />;
  }

  return <Component {...params} />;
}

function StaffRoute({ path, component, moduleName }: { path: string; component: React.ComponentType<any>; moduleName?: string }) {
  return (
    <Route path={path}>
      {(params) => <StaffGuard component={component} moduleName={moduleName} params={params} />}
    </Route>
  );
}

function GuestPortalWrapper(props: any) {
  if (typeof window !== 'undefined') {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('preview') === 'smart_flat') {
      return <SmartFlatPreview />;
    }
  }
  return <GuestPortal {...props} />;
}

function PageLoadingFallback() {
  if (typeof window !== 'undefined') {
    const curPath = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    if (PUBLIC_BOOKING_SEO_PATHS.has(curPath)) {
      if (INITIAL_SSR_SNAPSHOT_HTML) {
        return <div dangerouslySetInnerHTML={{ __html: INITIAL_SSR_SNAPSHOT_HTML }} />;
      }
      return <div className="min-h-dvh bg-slate-50" aria-busy="true" />;
    }
  }
  return <CorpFlatsSplashScreen label="Carregando módulo..." />;
}

function LegacyBookingAliasRoute() {
  const [, setLocation] = useLocation();
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const isVisualEditor =
    new URLSearchParams(search).get('edit') === 'true' ||
    (typeof window !== 'undefined' && window.location.hash.includes('edit=true'));

  useEffect(() => {
    if (!isVisualEditor && typeof window !== 'undefined') {
      const target = `/${window.location.search || ''}${window.location.hash || ''}`;
      window.history.replaceState(null, '', target);
      setLocation('/', { replace: true } as any);
    }
  }, [isVisualEditor, setLocation]);

  return <BookingEngine landingSlug="home" />;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Suspense fallback={<PageLoadingFallback />}>
      <Switch>
        {/* Smart Flat Hub Sandbox Preview Routes (Isolated from production guests) */}
        <Route path="/preview/smart-flat/:code" component={SmartFlatPreview} />
        <Route path="/preview/smart-flat" component={SmartFlatPreview} />
        <Route path="/preview/smart-flat/" component={SmartFlatPreview} />
        <Route path="/admin/smart-flat-preview/:code" component={SmartFlatPreview} />
        <Route path="/admin/smart-flat-preview" component={SmartFlatPreview} />
        <Route path="/admin/smart-flat-preview/" component={SmartFlatPreview} />

        {/* Public Booking Engine & SEO Landing Pages */}
        <Route path="/reservar" component={LegacyBookingAliasRoute} />
        <Route path="/booking" component={LegacyBookingAliasRoute} />
        <Route path="/hospedagem-corporativa-campos">
          {() => <BookingEngine landingSlug="hospedagem-corporativa-campos" />}
        </Route>
        <Route path="/fim-de-semana-campos">
          {() => <BookingEngine landingSlug="fim-de-semana-campos" />}
        </Route>
        <Route path="/flat-centro-campos-rj">
          {() => <BookingEngine landingSlug="flat-centro-campos-rj" />}
        </Route>
        <Route path="/estadia-longa-campos">
          {() => <BookingEngine landingSlug="estadia-longa-campos" />}
        </Route>
        <Route path="/minha-conta" component={MyAccount} />
        <Route path="/minhaconta" component={MyAccount} />
        <Route path="/perfil" component={MyAccount} />
        <Route path="/my-account" component={MyAccount} />
        <Route path="/minha-reserva/:code/cafe" component={GuestBreakfast} />
        <Route path="/minha-reserva/:code/room-service" component={GuestBreakfast} />
        <Route path="/portal-hospede/:code/cafe" component={GuestBreakfast} />
        <Route path="/guest-portal/:code/cafe" component={GuestBreakfast} />

        {/* Minibar / Frigobar: Portais Anserve e Admin CorpFlats */}
        <Route path="/frigobar-reposicao" component={AnserveRestock} />
        <Route path="/anserve/reposicao" component={AnserveRestock} />
        <AdminRoute path="/frigobar-notas" component={MinibarInvoices} moduleName="a Central de Emissão de Notas Fiscais do Frigobar" />
        <AdminRoute path="/anserve/notas" component={MinibarInvoices} moduleName="a Central de Emissão de Notas Fiscais do Frigobar" />
        <AdminRoute path="/notas-frigobar" component={MinibarInvoices} moduleName="a Central de Emissão de Notas Fiscais do Frigobar" />
        <AdminRoute path="/anserve" component={AnserveDashboard} moduleName="o Painel de Supervisão Anserve" />
        <AdminRoute path="/frigobar-gestao" component={AnserveDashboard} moduleName="o Painel de Gestão Anserve" />
        <AdminRoute path="/frigobar-admin" component={MinibarAdmin} moduleName="a Gestão de Frigobar CorpFlats" />
        <AdminRoute path="/frigobar" component={MinibarAdmin} moduleName="a Gestão de Frigobar CorpFlats" />
        <AdminRoute path="/minibar-admin" component={MinibarAdmin} moduleName="a Gestão de Frigobar CorpFlats" />
        <AdminRoute path="/admin/frigobar" component={MinibarAdmin} moduleName="a Gestão de Frigobar CorpFlats" />

        {/* Public Minibar / Frigobar Guest Routes (Precedência Obrigatória no Wouter) */}
        <Route path="/minha-reserva/:code/frigobar" component={GuestMinibar} />
        <Route path="/minha-reserva/:code/minibar" component={GuestMinibar} />
        <Route path="/portal-hospede/:code/frigobar" component={GuestMinibar} />
        <Route path="/guest-portal/:code/frigobar" component={GuestMinibar} />
        <Route path="/frigobar/flat/:flatNumber" component={GuestMinibar} />
        <Route path="/minibar/flat/:flatNumber" component={GuestMinibar} />
        <Route path="/frigobar/:flatNumber" component={GuestMinibar} />
        <Route path="/minibar/:flatNumber" component={GuestMinibar} />
        <Route path="/minha-reserva/:code" component={GuestPortalWrapper} />
        <Route path="/minha-reserva" component={GuestPortalWrapper} />
        <Route path="/copiar-pix/:code" component={GuestPortalWrapper} />
        <Route path="/copiar-pix" component={GuestPortalWrapper} />
        <Route path="/pix/:code" component={GuestPortalWrapper} />
        <Route path="/pix" component={GuestPortalWrapper} />
        <Route path="/portal-hospede/:code" component={GuestPortalWrapper} />
        <Route path="/portal-hospede" component={GuestPortalWrapper} />
        <Route path="/guest-portal/:code" component={GuestPortalWrapper} />
        <Route path="/guest-portal" component={GuestPortalWrapper} />
        <Route path="/pre-checkin/:code" component={GuestPreCheckin} />
        <Route path="/pre-checkin" component={GuestPreCheckin} />
        <Route path="/credenciamento/:code" component={AgencyGuestCredential} />
        <Route path="/credenciamento" component={AgencyGuestCredential} />
        <Route path="/credenciamento-hospede/:code" component={AgencyGuestCredential} />
        <Route path="/credenciamento-hospede" component={AgencyGuestCredential} />
        <Route path="/identificar-reserva/:code" component={AgencyGuestCredential} />
        <Route path="/identificar-reserva" component={AgencyGuestCredential} />
        <Route path="/identificar" component={AgencyGuestCredential} />
        <Route path="/cadastro-hospede/:code" component={AgencyGuestCredential} />
        <Route path="/cadastro-hospede" component={AgencyGuestCredential} />
        <Route path="/verificar-ficha/:uuid" component={VerifyFnrh} />
        <Route path="/verificar-ficha" component={VerifyFnrh} />

        {/* Reception Tablet Portaria & Checkout Routes (Acesso Direto sem Login / Senha) */}
        <Route path="/portaria" component={ReceptionTablet} />
        <Route path="/tablet" component={ReceptionTablet} />
        <Route path="/recepcao" component={ReceptionCheckout} />
        <Route path="/reception" component={ReceptionCheckout} />

        {/* Public Guest Checkout Route */}
        <Route path="/minha-reserva/:code/checkout" component={GuestCheckout} />
        <Route path="/minha-reserva/:code/saida" component={GuestCheckout} />
        <Route path="/portal-hospede/:code/checkout" component={GuestCheckout} />
        <Route path="/guest-portal/:code/checkout" component={GuestCheckout} />
        <Route path="/checkout/:code" component={GuestCheckout} />
        <Route path="/checkout" component={GuestCheckout} />
        <Route path="/check-out/:code" component={GuestCheckout} />
        <Route path="/check-out" component={GuestCheckout} />
        <Route path="/saida/:code" component={GuestCheckout} />
        <Route path="/saida" component={GuestCheckout} />

        {/* Public Breakfast Order Portal */}
        <Route path="/cafe/:code" component={GuestBreakfast} />
        <Route path="/cafe" component={GuestBreakfast} />
        <Route path="/cafe-da-manha/:code" component={GuestBreakfast} />
        <Route path="/cafe-da-manha" component={GuestBreakfast} />
        <Route path="/breakfast/:code" component={GuestBreakfast} />
        <Route path="/breakfast" component={GuestBreakfast} />

        {/* Public External Service Worker Portal & Handyman Portal */}
        <Route path="/servico/:token" component={ServiceWorkerPortal} />
        <Route path="/service/:token" component={ServiceWorkerPortal} />
        <Route path="/manutencao/:token" component={HandymanPortal} />
        <Route path="/faz-tudo/:token" component={HandymanPortal} />

        {/* Terminal Mobile de Registro de Ponto CLT (Selfie, GPS & Whitelist) */}
        <Route path="/ponto" component={PontoMobile} />
        <Route path="/bater-ponto" component={PontoMobile} />
        <Route path="/terminal-ponto" component={PontoMobile} />
        <Route path="/ponto-mobile" component={PontoMobile} />
        <Route path="/registro-ponto" component={PontoMobile} />

        {/* Live Operations & AI (Admin Only) */}
        <AdminRoute path="/painel-aovivo" component={LiveOperationsPanel} moduleName="o Painel Operacional Ao Vivo" />
        <AdminRoute path="/live-ops" component={LiveOperationsPanel} moduleName="o Painel Operacional Ao Vivo" />
        <AdminRoute path="/aovivo" component={LiveOperationsPanel} moduleName="o Painel Operacional Ao Vivo" />
        <AdminRoute path="/avaliacoes-ia" component={ReviewInsights} moduleName="as Avaliações & Inteligência Artificial" />
        <AdminRoute path="/reviews-ia" component={ReviewInsights} moduleName="as Avaliações & Inteligência Artificial" />
        <AdminRoute path="/garagem" component={GarageDashboard} moduleName="o Controle de Garagem & Vagas" />
        <AdminRoute path="/estacionamento" component={GarageDashboard} moduleName="o Controle de Garagem & Vagas" />

        {/* Staff & Maid Housekeeping Routes (Maids & Admin) */}
        <Route path="/login" component={Login} />
        <StaffRoute path="/dashboard" component={Dashboard} />
        <StaffRoute path="/lista-compras" component={ShoppingListPage} />
        <StaffRoute path="/compras" component={ShoppingListPage} />
        <StaffRoute path="/extrato" component={Reports} />
        <StaffRoute path="/meu-extrato" component={MaidStatementPage} />
        <StaffRoute path="/extrato-camareiras" component={Reports} />
        <StaffRoute path="/fechamento" component={Reports} />
        <StaffRoute path="/fechamento-limpeza" component={Reports} />
        <StaffRoute path="/tasks" component={Tasks} />
        <StaffRoute path="/tarefas" component={Tasks} />
        <StaffRoute path="/achados-perdidos" component={LostAndFoundPage} />
        <StaffRoute path="/achados" component={LostAndFoundPage} />
        <StaffRoute path="/lost-and-found" component={LostAndFoundPage} />
        <StaffRoute path="/observations" component={Observations} />
        <StaffRoute path="/ocorrencias" component={Observations} />
        <StaffRoute path="/avarias" component={Observations} />
        <StaffRoute path="/reports" component={Reports} />
        <StaffRoute path="/relatorios" component={Reports} />
        <StaffRoute path="/history" component={History} />
        <StaffRoute path="/historico" component={History} />

        {/* Gestão de Equipe & Níveis de Acesso (Admin e Dev) */}
        <AdminRoute path="/equipe" component={EquipePage} moduleName="a Gestão de Equipe & Níveis de Acesso" />
        <AdminRoute path="/usuarios" component={EquipePage} moduleName="a Gestão de Equipe & Níveis de Acesso" />
        <AdminRoute path="/team" component={EquipePage} moduleName="a Gestão de Equipe & Níveis de Acesso" />

        {/* Gestão de RH & Colaboradores CLT (Admin e Dev) */}
        <AdminRoute path="/rh" component={HrDashboard} moduleName="a Gestão de RH & Colaboradores CLT" />
        <AdminRoute path="/colaboradores" component={HrDashboard} moduleName="a Gestão de RH & Colaboradores CLT" />
        <AdminRoute path="/funcionarios" component={HrDashboard} moduleName="a Gestão de RH & Colaboradores CLT" />
        <AdminRoute path="/recursos-humanos" component={HrDashboard} moduleName="a Gestão de RH & Colaboradores CLT" />
        <AdminRoute path="/gestao-rh" component={HrDashboard} moduleName="a Gestão de RH & Colaboradores CLT" />

        {/* Administrative & Technical Dev Routes */}
        <DevRoute path="/jornada-reservas" component={ReservationJourney} moduleName="o Mapa da Jornada de Reservas" />
        <DevRoute path="/jornada-comunicacao" component={ReservationJourney} moduleName="o Mapa da Jornada de Reservas" />
        <DevRoute path="/fluxo-reservas" component={ReservationJourney} moduleName="o Mapa da Jornada de Reservas" />
        <DevRoute path="/mapa-jornada" component={ReservationJourney} moduleName="o Mapa da Jornada de Reservas" />
        <DevRoute path="/jornada" component={ReservationJourney} moduleName="o Mapa da Jornada de Reservas" />
        <AdminRoute path="/emails" component={EmailHub} moduleName="o Gerenciador de E-mails" />
        <AdminRoute path="/email-hub" component={EmailHub} moduleName="o Gerenciador de E-mails" />
        <AdminRoute path="/gerenciador-emails" component={EmailHub} moduleName="o Gerenciador de E-mails" />
        <AdminRoute path="/whatsapp-chat" component={WhatsappChat} moduleName="o WhatsApp Web Corporativo" />
        <AdminRoute path="/chat" component={WhatsappChat} moduleName="o WhatsApp Web Corporativo" />
        <AdminRoute path="/whatsapp-web" component={WhatsappChat} moduleName="o WhatsApp Web Corporativo" />
        <AdminRoute path="/chat-whatsapp" component={WhatsappChat} moduleName="o WhatsApp Web Corporativo" />
        <AdminRoute path="/automacoes-camareiras" component={MaidWhatsappAutomation} moduleName="as Automações de WhatsApp para Camareiras" />
        <AdminRoute path="/camareiras-whatsapp" component={MaidWhatsappAutomation} moduleName="as Automações de WhatsApp para Camareiras" />
        <AdminRoute path="/governanca-whatsapp" component={MaidWhatsappAutomation} moduleName="as Automações de WhatsApp para Camareiras" />
        <AdminRoute path="/whatsapp-automation" component={WhatsappAutomation} moduleName="a Automação de WhatsApp" />
        <AdminRoute path="/whatsapp" component={WhatsappAutomation} moduleName="a Automação de WhatsApp" />
        <AdminRoute path="/automacao-whatsapp" component={WhatsappAutomation} moduleName="a Automação de WhatsApp" />
        <ReceptionRoute path="/disparo-inteligente" component={WhatsappBroadcast} moduleName="o Disparo Inteligente de Mensagens" />
        <ReceptionRoute path="/whatsapp-broadcast" component={WhatsappBroadcast} moduleName="o Disparo Inteligente de Mensagens" />
        <ReceptionRoute path="/broadcast" component={WhatsappBroadcast} moduleName="o Disparo Inteligente de Mensagens" />
        <ReceptionRoute path="/campanhas-whatsapp" component={WhatsappBroadcast} moduleName="o Disparo Inteligente de Mensagens" />
        <DevRoute path="/zapi-conexao" component={ZapiConnection} moduleName="a Conexão Z-API" />
        <DevRoute path="/conexao-zapi" component={ZapiConnection} moduleName="a Conexão Z-API" />
        <DevRoute path="/sistema/zapi" component={ZapiConnection} moduleName="a Conexão Z-API" />
        <DevRoute path="/zapi" component={ZapiConnection} moduleName="a Conexão Z-API" />
        <AdminRoute path="/notificacoes" component={NotificationsHub} moduleName="a Central de Notificações" />
        <AdminRoute path="/notifications" component={NotificationsHub} moduleName="a Central de Notificações" />
        <AdminRoute path="/alertas" component={NotificationsHub} moduleName="a Central de Notificações" />
        <AdminRoute path="/pedidos-cafe" component={BreakfastProduction} moduleName="o Painel de Produção do Café da Manhã" />
        <AdminRoute path="/cafe-dashboard" component={BreakfastProduction} moduleName="o Painel de Produção do Café da Manhã" />
        <AdminRoute path="/historico-cafe" component={BreakfastProduction} moduleName="o Histórico do Café da Manhã" />
        <AdminRoute path="/relatorios-cafe" component={BreakfastProduction} moduleName="os Relatórios do Café da Manhã" />
        <AdminRoute path="/insights-cafe" component={BreakfastProduction} moduleName="os Relatórios do Café da Manhã" />
        <AdminRoute path="/reservas" component={PmsCalendar} moduleName="o Livro de Reservas & Mapa de Ocupação" />
        <AdminRoute path="/pms-calendar" component={PmsCalendar} moduleName="o Livro de Reservas & Mapa de Ocupação" />
        <AdminRoute path="/relatorios-reservas" component={PmsReportsPage} moduleName="os Relatórios de Reservas & Ocupação" />
        <AdminRoute path="/relatorio-reservas" component={PmsReportsPage} moduleName="os Relatórios de Reservas & Ocupação" />
        <AdminRoute path="/pms-reports" component={PmsReportsPage} moduleName="os Relatórios de Reservas & Ocupação" />
        <AdminRoute path="/crm" component={CrmGuests} moduleName="o CRM de Hóspedes & Empresas" />
        <AdminRoute path="/pagamentos" component={Payments} moduleName="a Gestão de Pagamentos & PIX" />
        <AdminRoute path="/payments" component={Payments} moduleName="a Gestão de Pagamentos & PIX" />
        <AdminRoute path="/recebiveis" component={Payments} moduleName="a Gestão de Recebíveis" />
        <AdminRoute path="/taxas" component={Payments} moduleName="a Gestão de Taxas" />
        <AdminRoute path="/financeiro" component={FinancialDashboard} moduleName="o ERP Financeiro & DRE" />
        <AdminRoute path="/financial" component={FinancialDashboard} moduleName="o ERP Financeiro & DRE" />
        <AdminRoute path="/precificacao" component={FinancialDashboard} moduleName="a Precificação Financeira" />
        <AdminRoute path="/finance" component={FinancialDashboard} moduleName="o ERP Financeiro & DRE" />
        <AdminRoute path="/funil-vendas" component={MarketingTraffic} moduleName="o Funil de Vendas & Tráfego IA" />
        <AdminRoute path="/trafego" component={MarketingTraffic} moduleName="o Funil de Vendas & Tráfego IA" />
        <AdminRoute path="/marketing" component={MarketingTraffic} moduleName="o Painel de Marketing" />
        <AdminRoute path="/ads" component={MarketingTraffic} moduleName="o Painel de Tráfego & Ads" />
        <AdminRoute path="/notas" component={FiscalInvoices} moduleName="o Hub de Notas Fiscais (NFS-e)" />
        <AdminRoute path="/nfse" component={FiscalInvoices} moduleName="o Hub de Notas Fiscais (NFS-e)" />
        <AdminRoute path="/invoices" component={FiscalInvoices} moduleName="o Hub de Notas Fiscais (NFS-e)" />
        <AdminRoute path="/guests" component={CrmGuests} moduleName="o CRM de Hóspedes" />
        <AdminRoute path="/hospedes" component={CrmGuests} moduleName="o CRM de Hóspedes" />
        <AdminRoute path="/surveys" component={Surveys} moduleName="as Vistorias de Saída" />
        <AdminRoute path="/vistorias" component={Surveys} moduleName="as Vistorias de Saída" />
        <AdminRoute path="/propriedade" component={PropertySettings} moduleName="as Regras & Configurações da Propriedade" />
        <AdminRoute path="/hotel" component={PropertySettings} moduleName="as Regras & Configurações do Hotel" />
        <AdminRoute path="/regras" component={PropertySettings} moduleName="as Regras da Casa" />
        <DevRoute path="/settings" component={Settings} moduleName="as Configurações Técnicas do Sistema" />
        <DevRoute path="/configuracoes" component={Settings} moduleName="as Configurações Técnicas do Sistema" />
        <DevRoute path="/configuracao" component={Settings} moduleName="as Configurações Técnicas do Sistema" />
        <DevRoute path="/ajustes" component={Settings} moduleName="os Ajustes Técnicos do Sistema" />
        <AdminRoute path="/editor-site" component={SiteEditor} moduleName="o Editor Visual do Site" />
        <AdminRoute path="/configurar-site" component={SiteEditor} moduleName="o Editor Visual do Site" />
        <AdminRoute path="/personalizar-site" component={SiteEditor} moduleName="o Editor Visual do Site" />
        <AdminRoute path="/site-editor" component={SiteEditor} moduleName="o Editor Visual do Site" />
        <AdminRoute path="/cms" component={SiteEditor} moduleName="o CMS do Site" />
        <AdminRoute path="/tarifas" component={TarifasEditor} moduleName="a Gestão de Tarifas & Políticas" />
        <AdminRoute path="/gestao-tarifas" component={TarifasEditor} moduleName="a Gestão de Tarifas & Políticas" />
        <AdminRoute path="/tabela-tarifas" component={TarifasEditor} moduleName="a Tabela de Tarifas" />
        <AdminRoute path="/precos" component={TarifasEditor} moduleName="a Gestão de Preços" />
        <DevRoute path="/logs" component={SystemLogsPage} moduleName="os Logs & Auditoria Fail-Safe" />
        <DevRoute path="/auditoria" component={SystemLogsPage} moduleName="os Logs & Auditoria Fail-Safe" />
        <DevRoute path="/system-logs" component={SystemLogsPage} moduleName="os Logs do Sistema" />
        <DevRoute path="/audit" component={SystemLogsPage} moduleName="a Auditoria do Sistema" />
        <DevRoute path="/ia-status" component={AiStatusPage} moduleName="o Status da IA" />
        <DevRoute path="/ai-status" component={AiStatusPage} moduleName="o Status da IA" />
        <DevRoute path="/status-ia" component={AiStatusPage} moduleName="o Status da IA" />
        <DevRoute path="/monitor-servidor" component={ServerMonitorPage} moduleName="o Monitor do Servidor em Tempo Real" />
        <DevRoute path="/servidor" component={ServerMonitorPage} moduleName="o Monitor do Servidor em Tempo Real" />
        <DevRoute path="/server-monitor" component={ServerMonitorPage} moduleName="o Monitor do Servidor em Tempo Real" />

        {/* External Service Orders Management (Admin Only) */}
        <AdminRoute path="/raio-x-flats" component={FlatXrayHub} moduleName="o Raio-X & Hub dos Flats" />
        <AdminRoute path="/diario-flats" component={FlatXrayHub} moduleName="o Diário & Raio-X dos Flats" />
        <AdminRoute path="/hub-manutencao" component={FlatXrayHub} moduleName="o Hub de Manutenção & Governança" />
        <AdminRoute path="/raio-x" component={FlatXrayHub} moduleName="o Raio-X dos Flats" />
        <AdminRoute path="/prontuario-flats" component={FlatXrayHub} moduleName="o Prontuário dos Flats" />
        <AdminRoute path="/servicos" component={ServiceOrders} moduleName="a Gestão de Ordens de Serviço" />
        <AdminRoute path="/service-orders" component={ServiceOrders} moduleName="a Gestão de Ordens de Serviço" />

        {/* Feature 28: Precificação SEBRAE & Publicar (Admin Only) */}
        <AdminRoute path="/precificacao-sebrae" component={PricingSebraePage} moduleName="a Precificação SEBRAE" />
        <AdminRoute path="/pricing-sebrae" component={PricingSebraePage} moduleName="a Precificação SEBRAE" />

        {/* Feature 29: Central / Lista Geral de Reservas & Quarentena OTA Unificada (Recepção e Admin) */}
        <ReceptionRoute path="/lista-reservas" component={ReservationsListPage} moduleName="a Lista de Reservas (Central)" />
        <ReceptionRoute path="/central-reservas" component={ReservationsListPage} moduleName="a Lista de Reservas (Central)" />
        <ReceptionRoute path="/todas-reservas" component={ReservationsListPage} moduleName="a Lista de Reservas (Central)" />
        <ReceptionRoute path="/caixa-entrada-ota" component={ReservationsListPage} moduleName="a Central de Reservas & OTAs" />
        <ReceptionRoute path="/ota-inbox" component={ReservationsListPage} moduleName="a Central de Reservas & OTAs" />
        <ReceptionRoute path="/quarentena" component={ReservationsListPage} moduleName="a Quarentena de Reservas" />
        <ReceptionRoute path="/ajuda-wbp" component={AjudaWbpPage} moduleName="o Manual de Integração Channex.io" />
        <ReceptionRoute path="/ajuda-channex" component={AjudaWbpPage} moduleName="o Manual de Integração Channex.io" />

        <Route path="/">
          {() => <BookingEngine landingSlug="home" />}
        </Route>
        <Route component={NotFound} />
      </Switch>
      </Suspense>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  useEffect(() => {
    const isGuestLoggedIn = Boolean(
      localStorage.getItem("corpflats_guest_profile") || localStorage.getItem("corpflats_guest_email")
    );
    const cleanPath = (location || "/").split("?")[0].replace(/\/+$/, "") || "/";
    if (isGuestLoggedIn || !PUBLIC_BOOKING_SEO_PATHS.has(cleanPath)) {
      cancelGoogleOneTap();
    }
  }, [location]);
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function VersionGuard({ children }: { children: ReactNode }) {
  useEffect(() => {
    let isMounted = true;

    const checkAppVersion = async () => {
      try {
        const res = await fetch("/api/system/version?_nocache=" + Date.now(), { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const serverVersion = data.version;
        if (!serverVersion || !isMounted) return;

        const currentVersion = localStorage.getItem("gfm_app_version");

        if (currentVersion && currentVersion !== serverVersion) {
          console.log(`[Deploy Detector] Nova versão (${serverVersion}) detectada. Atualizando versão local...`);
          localStorage.setItem("gfm_app_version", serverVersion);
          // Recarrega a página atual para obter os novos scripts e CSS sem deslogar ninguém nem redirecionar para /login
          window.location.reload();
          return;
        }

        if (!currentVersion) {
          localStorage.setItem("gfm_app_version", serverVersion);
        }
      } catch {}
    };

    checkAppVersion();
    const timer = setInterval(checkAppVersion, 30000);
    window.addEventListener("focus", checkAppVersion);
    return () => {
      isMounted = false;
      clearInterval(timer);
      window.removeEventListener("focus", checkAppVersion);
    };
  }, []);

  return <>{children}</>;
}

const PUBLIC_GUEST_PATH_PREFIXES = [
  "/reservar",
  "/booking",
  "/hospedagem-corporativa-campos",
  "/fim-de-semana-campos",
  "/flat-centro-campos-rj",
  "/estadia-longa-campos",
  "/pre-checkin",
  "/minha-conta",
  "/minha-reserva",
  "/checkout",
  "/cafe",
  "/frigobar/",
  "/credenciamento",
  "/verificar-ficha",
  "/servico/",
];

function StaffGlobalOverlays() {
  const [location] = useLocation();
  const cleanPath = (location || "/").split("?")[0];
  const isPublicGuestRoute =
    cleanPath === "/" ||
    PUBLIC_GUEST_PATH_PREFIXES.some((prefix) =>
      prefix.endsWith("/")
        ? cleanPath.startsWith(prefix)
        : cleanPath === prefix || cleanPath.startsWith(`${prefix}/`)
    );

  if (isPublicGuestRoute && !getCachedAuthUser()) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <RestockerVoiceNotifier />
      <FloatingNewReservationButton />
      <AdminAiCopilot />
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <VersionGuard>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
            <StaffGlobalOverlays />
          </WouterRouter>
          <Toaster />
        </VersionGuard>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

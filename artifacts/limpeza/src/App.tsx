import { type ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

import Login from '@/pages/login';
import Dashboard from '@/pages/dashboard';
import History from '@/pages/history';
import Settings from '@/pages/settings';
import PropertySettings from '@/pages/property-settings';
import Tasks from '@/pages/tasks';
import Observations from '@/pages/observations';
import LostAndFoundPage from '@/pages/lost-and-found';
import Reports from '@/pages/reports';
import Surveys from '@/pages/surveys';
import PmsCalendar from '@/pages/pms-calendar';
import PmsReportsPage from '@/pages/pms-reports';
import CrmGuests from '@/pages/crm-guests';
import ReceptionTablet from '@/pages/reception-tablet';
import GuestPreCheckin from '@/pages/guest-pre-checkin';
import BookingEngine from '@/pages/booking-engine';
import FinancialDashboard from '@/pages/financial-dashboard';
import MarketingTraffic from '@/pages/marketing-traffic';
import FiscalInvoices from '@/pages/fiscal-invoices';
import GuestBreakfast from '@/pages/guest-breakfast';
import BreakfastProduction from '@/pages/breakfast-production';
import NotificationsHub from '@/pages/notifications-hub';
import GuestCheckout from '@/pages/guest-checkout';
import ReceptionCheckout from '@/pages/reception-checkout';
import GuestPortal from '@/pages/guest-portal';
import LiveOperationsPanel from '@/pages/live-operations-panel';
import ReviewInsights from '@/pages/review-insights';
import GarageDashboard from '@/pages/garage-dashboard';
import Payments from '@/pages/payments';
import SiteEditor from '@/pages/site-editor';
import TarifasEditor from '@/pages/tarifas';
import SystemLogsPage from '@/pages/system-logs';
import MyAccount from '@/pages/my-account';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5000,
    }
  }
});

function Redirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation(to); }, [setLocation, to]);
  return null;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        {/* Public Booking Engine & Guest Hub */}
        <Route path="/reservar" component={BookingEngine} />
        <Route path="/booking" component={BookingEngine} />
        <Route path="/minha-conta" component={MyAccount} />
        <Route path="/minhaconta" component={MyAccount} />
        <Route path="/perfil" component={MyAccount} />
        <Route path="/my-account" component={MyAccount} />
        <Route path="/minha-reserva/:code" component={GuestPortal} />
        <Route path="/minha-reserva" component={GuestPortal} />
        <Route path="/portal-hospede/:code" component={GuestPortal} />
        <Route path="/portal-hospede" component={GuestPortal} />
        <Route path="/guest-portal/:code" component={GuestPortal} />
        <Route path="/guest-portal" component={GuestPortal} />
        <Route path="/pre-checkin/:code" component={GuestPreCheckin} />
        <Route path="/pre-checkin" component={GuestPreCheckin} />

        {/* Reception Tablet Portaria Route */}
        <Route path="/portaria" component={ReceptionTablet} />
        <Route path="/tablet" component={ReceptionTablet} />

        {/* Public Guest Checkout Route */}
        <Route path="/checkout" component={GuestCheckout} />
        <Route path="/check-out" component={GuestCheckout} />
        <Route path="/saida" component={GuestCheckout} />

        {/* Reception Fast Checkout Route */}
        <Route path="/recepcao" component={ReceptionCheckout} />
        <Route path="/reception" component={ReceptionCheckout} />

        {/* Public Breakfast Order Portal */}
        <Route path="/cafe" component={GuestBreakfast} />
        <Route path="/cafe-da-manha" component={GuestBreakfast} />
        <Route path="/breakfast" component={GuestBreakfast} />

        {/* Live 27" Command Operations Panel */}
        <Route path="/painel-aovivo" component={LiveOperationsPanel} />
        <Route path="/live-ops" component={LiveOperationsPanel} />
        <Route path="/aovivo" component={LiveOperationsPanel} />

        {/* AI Reviews & Garage Management */}
        <Route path="/avaliacoes-ia" component={ReviewInsights} />
        <Route path="/reviews-ia" component={ReviewInsights} />
        <Route path="/garagem" component={GarageDashboard} />
        <Route path="/estacionamento" component={GarageDashboard} />

        {/* Staff & Admin Routes */}
        <Route path="/login" component={Login} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/notificacoes" component={NotificationsHub} />
        <Route path="/notifications" component={NotificationsHub} />
        <Route path="/alertas" component={NotificationsHub} />
        <Route path="/pedidos-cafe" component={BreakfastProduction} />
        <Route path="/cafe-dashboard" component={BreakfastProduction} />
        <Route path="/reservas" component={PmsCalendar} />
        <Route path="/relatorios-reservas" component={PmsReportsPage} />
        <Route path="/relatorio-reservas" component={PmsReportsPage} />
        <Route path="/pms-reports" component={PmsReportsPage} />
        <Route path="/crm" component={CrmGuests} />
        <Route path="/pagamentos" component={Payments} />
        <Route path="/payments" component={Payments} />
        <Route path="/recebiveis" component={Payments} />
        <Route path="/taxas" component={Payments} />
        <Route path="/financeiro" component={FinancialDashboard} />
        <Route path="/precificacao" component={FinancialDashboard} />
        <Route path="/finance" component={FinancialDashboard} />
        <Route path="/trafego" component={MarketingTraffic} />
        <Route path="/marketing" component={MarketingTraffic} />
        <Route path="/ads" component={MarketingTraffic} />
        <Route path="/notas" component={FiscalInvoices} />
        <Route path="/nfse" component={FiscalInvoices} />
        <Route path="/invoices" component={FiscalInvoices} />
        <Route path="/guests" component={CrmGuests} />
        <Route path="/hospedes" component={CrmGuests} />
        <Route path="/surveys" component={Surveys} />
        <Route path="/vistorias" component={Surveys} />
        <Route path="/history" component={History} />
        <Route path="/historico" component={History} />
        <Route path="/propriedade" component={PropertySettings} />
        <Route path="/hotel" component={PropertySettings} />
        <Route path="/regras" component={PropertySettings} />
        <Route path="/settings" component={Settings} />
        <Route path="/configuracoes" component={Settings} />
        <Route path="/configuracao" component={Settings} />
        <Route path="/ajustes" component={Settings} />
        <Route path="/editor-site" component={SiteEditor} />
        <Route path="/configurar-site" component={SiteEditor} />
        <Route path="/personalizar-site" component={SiteEditor} />
        <Route path="/site-editor" component={SiteEditor} />
        <Route path="/cms" component={SiteEditor} />
        <Route path="/tarifas" component={TarifasEditor} />
        <Route path="/gestao-tarifas" component={TarifasEditor} />
        <Route path="/tabela-tarifas" component={TarifasEditor} />
        <Route path="/precos" component={TarifasEditor} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/tarefas" component={Tasks} />
        <Route path="/achados-perdidos" component={LostAndFoundPage} />
        <Route path="/achados" component={LostAndFoundPage} />
        <Route path="/lost-and-found" component={LostAndFoundPage} />
        <Route path="/observations" component={Observations} />
        <Route path="/ocorrencias" component={Observations} />
        <Route path="/avarias" component={Observations} />
        <Route path="/reports" component={Reports} />
        <Route path="/relatorios" component={Reports} />
        <Route path="/logs" component={SystemLogsPage} />
        <Route path="/auditoria" component={SystemLogsPage} />
        <Route path="/system-logs" component={SystemLogsPage} />
        <Route path="/audit" component={SystemLogsPage} />
        <Route path="/"><Redirect to="/login" /></Route>
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
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
          console.warn(`[Deploy Detector] Nova versão (${serverVersion}) detectada! Limpando cache e forçando reautenticação...`);
          try {
            await fetch("/api/auth/logout", { method: "POST" });
          } catch {}
          localStorage.clear();
          sessionStorage.clear();
          localStorage.setItem("gfm_app_version", serverVersion);
          window.location.replace("/login");
          return;
        }

        if (!currentVersion) {
          localStorage.setItem("gfm_app_version", serverVersion);
        }
      } catch {}
    };

    checkAppVersion();
    const timer = setInterval(checkAppVersion, 15000);
    window.addEventListener("focus", checkAppVersion);
    return () => {
      isMounted = false;
      clearInterval(timer);
      window.removeEventListener("focus", checkAppVersion);
    };
  }, []);

  return <>{children}</>;
}

function App() {
  return (
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
  );
}

export default App;

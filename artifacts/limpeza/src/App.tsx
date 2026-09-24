import { type ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { cancelGoogleOneTap } from '@/lib/auth-client';
import { useGetMe } from '@workspace/api-client-react';
import { AccessDenied } from '@/components/access-denied';

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
import VerifyFnrh from '@/pages/verify-fnrh';
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
import WhatsappAutomation from '@/pages/whatsapp-automation';
import WhatsappChat from '@/pages/whatsapp-chat';
import MaidWhatsappAutomation from '@/pages/maid-whatsapp-automation';
import ShoppingListPage from '@/pages/shopping-list';
import MaidStatementPage from '@/pages/maid-statement';
import ZapiConnection from '@/pages/zapi-connection';
import EmailHub from '@/pages/email-hub';
import ReservationJourney from '@/pages/reservation-journey';
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

function AdminGuard({ component: Component, moduleName, params }: { component: React.ComponentType<any>; moduleName: string; params?: any }) {
  const { data: user, isLoading } = useGetMe();

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

  if (user.role !== "admin") {
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

function ReceptionGuard({ component: Component, moduleName, params }: { component: React.ComponentType<any>; moduleName: string; params?: any }) {
  const { data: user, isLoading } = useGetMe();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground font-semibold">Verificando credenciais...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (user.role !== "admin" && user.role !== "recepcao") {
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

function StaffGuard({ component: Component, params }: { component: React.ComponentType<any>; params?: any }) {
  const { data: user, isLoading } = useGetMe();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground font-semibold">Carregando governança...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <Component {...params} />;
}

function StaffRoute({ path, component }: { path: string; component: React.ComponentType<any> }) {
  return (
    <Route path={path}>
      {(params) => <StaffGuard component={component} params={params} />}
    </Route>
  );
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
        <Route path="/minha-reserva/:code/cafe" component={GuestBreakfast} />
        <Route path="/minha-reserva/:code/room-service" component={GuestBreakfast} />
        <Route path="/portal-hospede/:code/cafe" component={GuestBreakfast} />
        <Route path="/guest-portal/:code/cafe" component={GuestBreakfast} />
        <Route path="/minha-reserva/:code" component={GuestPortal} />
        <Route path="/minha-reserva" component={GuestPortal} />
        <Route path="/portal-hospede/:code" component={GuestPortal} />
        <Route path="/portal-hospede" component={GuestPortal} />
        <Route path="/guest-portal/:code" component={GuestPortal} />
        <Route path="/guest-portal" component={GuestPortal} />
        <Route path="/pre-checkin/:code" component={GuestPreCheckin} />
        <Route path="/pre-checkin" component={GuestPreCheckin} />
        <Route path="/verificar-ficha/:uuid" component={VerifyFnrh} />
        <Route path="/verificar-ficha" component={VerifyFnrh} />

        {/* Reception Tablet Portaria Route (Admin / Recepção) */}
        <ReceptionRoute path="/portaria" component={ReceptionTablet} moduleName="o Terminal da Portaria" />
        <ReceptionRoute path="/tablet" component={ReceptionTablet} moduleName="o Terminal da Portaria" />
        <ReceptionRoute path="/recepcao" component={ReceptionCheckout} moduleName="o Checkout da Recepção" />
        <ReceptionRoute path="/reception" component={ReceptionCheckout} moduleName="o Checkout da Recepção" />

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
        <StaffRoute path="/meu-extrato" component={Reports} />
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

        {/* Administrative Only Routes (Strictly Forbidden to Maids) */}
        <AdminRoute path="/jornada-reservas" component={ReservationJourney} moduleName="o Mapa da Jornada de Reservas" />
        <AdminRoute path="/jornada-comunicacao" component={ReservationJourney} moduleName="o Mapa da Jornada de Reservas" />
        <AdminRoute path="/fluxo-reservas" component={ReservationJourney} moduleName="o Mapa da Jornada de Reservas" />
        <AdminRoute path="/mapa-jornada" component={ReservationJourney} moduleName="o Mapa da Jornada de Reservas" />
        <AdminRoute path="/jornada" component={ReservationJourney} moduleName="o Mapa da Jornada de Reservas" />
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
        <AdminRoute path="/whatsapp" component={WhatsappAutomation} moduleName="a Automação de WhatsApp" />
        <AdminRoute path="/automacao-whatsapp" component={WhatsappAutomation} moduleName="a Automação de WhatsApp" />
        <AdminRoute path="/zapi-conexao" component={ZapiConnection} moduleName="a Conexão Z-API" />
        <AdminRoute path="/conexao-zapi" component={ZapiConnection} moduleName="a Conexão Z-API" />
        <AdminRoute path="/sistema/zapi" component={ZapiConnection} moduleName="a Conexão Z-API" />
        <AdminRoute path="/zapi" component={ZapiConnection} moduleName="a Conexão Z-API" />
        <AdminRoute path="/notificacoes" component={NotificationsHub} moduleName="a Central de Notificações" />
        <AdminRoute path="/notifications" component={NotificationsHub} moduleName="a Central de Notificações" />
        <AdminRoute path="/alertas" component={NotificationsHub} moduleName="a Central de Notificações" />
        <AdminRoute path="/pedidos-cafe" component={BreakfastProduction} moduleName="o Painel de Produção do Café da Manhã" />
        <AdminRoute path="/cafe-dashboard" component={BreakfastProduction} moduleName="o Painel de Produção do Café da Manhã" />
        <AdminRoute path="/historico-cafe" component={BreakfastProduction} moduleName="o Histórico do Café da Manhã" />
        <AdminRoute path="/relatorios-cafe" component={BreakfastProduction} moduleName="os Relatórios do Café da Manhã" />
        <AdminRoute path="/insights-cafe" component={BreakfastProduction} moduleName="os Relatórios do Café da Manhã" />
        <AdminRoute path="/reservas" component={PmsCalendar} moduleName="o Livro de Reservas & Mapa de Ocupação" />
        <AdminRoute path="/relatorios-reservas" component={PmsReportsPage} moduleName="os Relatórios de Reservas & Ocupação" />
        <AdminRoute path="/relatorio-reservas" component={PmsReportsPage} moduleName="os Relatórios de Reservas & Ocupação" />
        <AdminRoute path="/pms-reports" component={PmsReportsPage} moduleName="os Relatórios de Reservas & Ocupação" />
        <AdminRoute path="/crm" component={CrmGuests} moduleName="o CRM de Hóspedes & Empresas" />
        <AdminRoute path="/pagamentos" component={Payments} moduleName="a Gestão de Pagamentos & PIX" />
        <AdminRoute path="/payments" component={Payments} moduleName="a Gestão de Pagamentos & PIX" />
        <AdminRoute path="/recebiveis" component={Payments} moduleName="a Gestão de Recebíveis" />
        <AdminRoute path="/taxas" component={Payments} moduleName="a Gestão de Taxas" />
        <AdminRoute path="/financeiro" component={FinancialDashboard} moduleName="o ERP Financeiro & DRE" />
        <AdminRoute path="/precificacao" component={FinancialDashboard} moduleName="a Precificação Financeira" />
        <AdminRoute path="/finance" component={FinancialDashboard} moduleName="o ERP Financeiro & DRE" />
        <AdminRoute path="/trafego" component={MarketingTraffic} moduleName="o Tráfego Autônomo & IA" />
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
        <AdminRoute path="/settings" component={Settings} moduleName="as Configurações do Sistema" />
        <AdminRoute path="/configuracoes" component={Settings} moduleName="as Configurações do Sistema" />
        <AdminRoute path="/configuracao" component={Settings} moduleName="as Configurações do Sistema" />
        <AdminRoute path="/ajustes" component={Settings} moduleName="os Ajustes do Sistema" />
        <AdminRoute path="/editor-site" component={SiteEditor} moduleName="o Editor Visual do Site" />
        <AdminRoute path="/configurar-site" component={SiteEditor} moduleName="o Editor Visual do Site" />
        <AdminRoute path="/personalizar-site" component={SiteEditor} moduleName="o Editor Visual do Site" />
        <AdminRoute path="/site-editor" component={SiteEditor} moduleName="o Editor Visual do Site" />
        <AdminRoute path="/cms" component={SiteEditor} moduleName="o CMS do Site" />
        <AdminRoute path="/tarifas" component={TarifasEditor} moduleName="a Gestão de Tarifas & Políticas" />
        <AdminRoute path="/gestao-tarifas" component={TarifasEditor} moduleName="a Gestão de Tarifas & Políticas" />
        <AdminRoute path="/tabela-tarifas" component={TarifasEditor} moduleName="a Tabela de Tarifas" />
        <AdminRoute path="/precos" component={TarifasEditor} moduleName="a Gestão de Preços" />
        <AdminRoute path="/logs" component={SystemLogsPage} moduleName="os Logs & Auditoria Fail-Safe" />
        <AdminRoute path="/auditoria" component={SystemLogsPage} moduleName="os Logs & Auditoria Fail-Safe" />
        <AdminRoute path="/system-logs" component={SystemLogsPage} moduleName="os Logs do Sistema" />
        <AdminRoute path="/audit" component={SystemLogsPage} moduleName="a Auditoria do Sistema" />

        <Route path="/"><Redirect to="/reservar" /></Route>
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  useEffect(() => {
    const isGuestLoggedIn = Boolean(
      localStorage.getItem("corpflats_guest_profile") || localStorage.getItem("corpflats_guest_email")
    );
    if (isGuestLoggedIn || (location !== "/reservar" && location !== "/booking" && location !== "/")) {
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

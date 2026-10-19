// ══════════════════════════════════════════════════════════════════════════════
// Guest Flow Manager - Catálogo Central de Permissões Granulares por Módulo
// ══════════════════════════════════════════════════════════════════════════════

export interface PermissionModule {
  href: string;
  label: string;
  description: string;
  devOnly?: boolean;
}

export interface PermissionCategory {
  id: string;
  title: string;
  devOnly?: boolean;
  items: PermissionModule[];
}

export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  // 1. 📅 Reservas & Hospedagem (reservas)
  {
    id: "reservas",
    title: "📅 Reservas & Hospedagem",
    items: [
      { href: "/reservas", label: "Mapa de Reservas (PMS)", description: "Calendário de ocupação e reservas" },
      { href: "/caixa-entrada-ota", label: "Caixa de Entrada OTA", description: "Reservas Booking/Airbnb, quarentena e conciliação" },
      { href: "/relatorios-reservas", label: "Relatórios & Ocupação (PMS)", description: "Taxa de ocupação, diária média, RevPAR e ranking" },
      { href: "/crm", label: "Hóspedes & Empresas (CRM 360)", description: "LTV, fidelidade, preferências e faturamento PJ" },
      { href: "/portaria", label: "Terminal da Portaria (Tablet)", description: "Check-in presencial e liberação" },
      { href: "/pedidos-cafe", label: "Café da Manhã & Produção", description: "Ficha técnica e montagem dos pedidos" },
      { href: "/relatorios-cafe", label: "Relatórios & Histórico do Café", description: "Insights de consumo, custos e histórico geral" },
      { href: "/reservar", label: "Site de Reservas Diretas", description: "Página pública de vendas" }
    ]
  },

  // 2. 💬 Comunicação & Atendimento (comunicacao)
  {
    id: "comunicacao",
    title: "💬 Comunicação & Atendimento",
    items: [
      { href: "/whatsapp-chat", label: "WhatsApp Web (Chat)", description: "Conversas em tempo real, envio e histórico completo" },
      { href: "/whatsapp", label: "Automação WhatsApp", description: "Réguas de gatilhos, editor, fila e histórico" },
      { href: "/emails", label: "Gerenciador de E-mails", description: "E-mails enviados, agendados, redator e controle do motor" },
      { href: "/notificacoes", label: "Central de Notificações", description: "Alertas de pedidos, chamados e auditoria" }
    ]
  },

  // 3. 🧹 Governança & Manutenção (governanca)
  {
    id: "governanca",
    title: "🧹 Governança & Manutenção",
    items: [
      { href: "/dashboard", label: "Painel de Limpeza", description: "Quartos sujos, limpos e em andamento" },
      { href: "/reports", label: "Fechamento & Diárias", description: "Fechamento quinzenal, extrato em tempo real, vales e PIX" },
      { href: "/lista-compras", label: "Lista de Compras", description: "Itens para reposição, compras e governança" },
      { href: "/observations", label: "Ocorrências & Avarias", description: "Defeitos e manutenções relatadas" },
      { href: "/tasks", label: "Tarefas Preventivas", description: "Trocas de filtro, dedetizações e rotinas" },
      { href: "/surveys", label: "Vistorias de Saída", description: "Conferência de itens e fotos pós checkout" },
      { href: "/servicos", label: "Serviços Externos", description: "Ordens de serviço, manutenção e prestadores" },
      { href: "/achados-perdidos", label: "Achados & Perdidos", description: "Objetos esquecidos, custódia e devoluções" },
      { href: "/automacoes-camareiras", label: "Automação WhatsApp Camareiras", description: "Gatilhos automáticos, alertas de quarto e fechamentos" }
    ]
  },

  // 4. 💰 Financeiro, Tarifas & Fiscal (financeiro)
  {
    id: "financeiro",
    title: "💰 Financeiro, Tarifas & Fiscal",
    items: [
      { href: "/financeiro", label: "ERP Financeiro & DRE", description: "DRE Gerencial, Contas a Pagar/Receber, Long-Stay e Fluxo de Caixa" },
      { href: "/tarifas", label: "Tarifas & Precificação SEBRAE", description: "Calendário, Custo por UH, Tarifa Mínima, Sazonalidade, Canais e WBP" },
      { href: "/pagamentos", label: "Pagamentos, PIX & Cauções", description: "Conciliação PIX Inter, Mercado Pago, Taxas e Cauções" },
      { href: "/notas", label: "Hub de Notas Fiscais (NFS-e)", description: "Chat IA, formulário, livro fiscal e templates" },
      { href: "/funil-vendas", label: "Funil de Vendas & Tráfego IA", description: "Funil 5 etapas, recuperação WhatsApp e anúncios Meta/Google IA" }
    ]
  },

  // 5. 🏨 Propriedade & Equipe (propriedade)
  {
    id: "propriedade",
    title: "🏨 Propriedade & Equipe",
    items: [
      { href: "/equipe", label: "Equipe & Níveis de Acesso", description: "Usuários do sistema, permissões, WhatsApp e senhas" },
      { href: "/propriedade", label: "Flats, Políticas & Regras", description: "Quartos, horários, regras da casa e contratos" },
      { href: "/garagem", label: "Controle de Garagem & Vagas", description: "Vagas rotativas e placas de veículos" },
      { href: "/avaliacoes-ia", label: "Avaliações & Satisfação IA", description: "Análise de sentimentos e reviews do Google" },
      { href: "/editor-site", label: "Editor Visual do Site", description: "Fotos, comodidades, slogans e textos" }
    ]
  },

  // 6. 🛠️ Engenharia & Dev (engenharia, devOnly: true)
  {
    id: "engenharia",
    title: "🛠️ Engenharia & Dev",
    devOnly: true,
    items: [
      { href: "/configuracoes", label: "Integrações Técnicas & Nuvem", description: "Cloudflare R2, Microsoft Graph, chaves de API e certificados", devOnly: true },
      { href: "/zapi-conexao", label: "Conexão Z-API (WhatsApp)", description: "Instância, QR Code, credenciais e status de conexão", devOnly: true },
      { href: "/jornada-reservas", label: "Mapa da Jornada (Fluxograma)", description: "Fluxograma completo de mensagens WhatsApp e e-mails por etapa", devOnly: true },
      { href: "/monitor-servidor", label: "Monitor do Servidor & IA", description: "Telemetria de CPU, RAM em tempo real, RCA e Render stream", devOnly: true },
      { href: "/ia-status", label: "Status da IA", description: "Monitoramento dos modelos Gemini, OpenAI e latências", devOnly: true },
      { href: "/logs", label: "Logs & Auditoria Fail-Safe", description: "Auditoria fail-safe de eventos e erros", devOnly: true }
    ]
  }
];

export const DEV_ONLY_MODULES: string[] = [
  "/configuracoes",
  "/zapi-conexao",
  "/jornada-reservas",
  "/monitor-servidor",
  "/ia-status",
  "/logs"
];

export const ALL_CANONICAL_MODULES: string[] = PERMISSION_CATEGORIES.flatMap(cat => cat.items.map(it => it.href));

export const OPERATIONAL_MODULES: string[] = PERMISSION_CATEGORIES
  .filter(cat => !cat.devOnly)
  .flatMap(cat => cat.items.map(it => it.href));

export const RESERVAS_MODULES: string[] = PERMISSION_CATEGORIES
  .find(c => c.id === "reservas")!
  .items.map(it => it.href);

export const CAMAREIRA_MODULES: string[] = [
  "/dashboard",
  "/reports",
  "/lista-compras",
  "/observations",
  "/tasks",
  "/achados-perdidos"
];

export const RECEPCAO_MODULES: string[] = Array.from(
  new Set([...RESERVAS_MODULES, ...CAMAREIRA_MODULES])
);

export const ADMIN_MODULES: string[] = [...OPERATIONAL_MODULES];

export const DEV_MODULES: string[] = [...ALL_CANONICAL_MODULES];

/**
 * Retorna os módulos padrão canônicos liberados para um determinado perfil base.
 */
export function getDefaultModulesForRole(role?: string | null): string[] {
  const normRole = (role || "").toLowerCase().trim();
  switch (normRole) {
    case "dev":
      return [...DEV_MODULES];
    case "admin":
      return [...ADMIN_MODULES];
    case "recepcao":
    case "reception":
      return [...RECEPCAO_MODULES];
    case "camareira":
    default:
      return [...CAMAREIRA_MODULES];
  }
}

/**
 * Mapeamento exaustivo de rotas alternativas/aliases para suas rotas canônicas no menu/permissões.
 */
export const ROUTE_ALIASES: Record<string, string> = {
  // Equipe / Usuários
  "/usuarios": "/equipe",
  "/usuarios-equipe": "/equipe",
  "/team": "/equipe",
  "/users": "/equipe",

  // Tarifas & Precificação
  "/precificacao-sebrae": "/tarifas",
  "/pricing-sebrae": "/tarifas",
  "/gestao-tarifas": "/tarifas",
  "/tabela-tarifas": "/tarifas",
  "/precos": "/tarifas",

  // Extratos & Fechamento
  "/meu-extrato": "/reports",
  "/extrato": "/reports",
  "/extrato-camareiras": "/reports",
  "/fechamento": "/reports",
  "/fechamento-limpeza": "/reports",
  "/relatorios": "/reports",
  "/history": "/reports",
  "/historico": "/reports",

  // Configurações Técnicas
  "/settings": "/configuracoes",
  "/configuracao": "/configuracoes",
  "/ajustes": "/configuracoes",

  // Z-API
  "/conexao-zapi": "/zapi-conexao",
  "/sistema/zapi": "/zapi-conexao",
  "/zapi": "/zapi-conexao",

  // Jornada
  "/jornada-comunicacao": "/jornada-reservas",
  "/fluxo-reservas": "/jornada-reservas",
  "/mapa-jornada": "/jornada-reservas",
  "/jornada": "/jornada-reservas",

  // Monitor do Servidor
  "/servidor": "/monitor-servidor",
  "/server-monitor": "/monitor-servidor",

  // IA Status
  "/ai-status": "/ia-status",
  "/status-ia": "/ia-status",

  // Logs & Auditoria
  "/auditoria": "/logs",
  "/system-logs": "/logs",
  "/audit": "/logs",

  // Portaria & Recepção
  "/tablet": "/portaria",
  "/recepcao": "/portaria",
  "/reception": "/portaria",

  // Painel Ao Vivo
  "/painel-aovivo": "/reservas",
  "/live-ops": "/reservas",
  "/aovivo": "/reservas",

  // Avaliações
  "/reviews-ia": "/avaliacoes-ia",

  // Garagem
  "/estacionamento": "/garagem",

  // Compras
  "/compras": "/lista-compras",

  // Tarefas
  "/tarefas": "/tasks",

  // Achados
  "/achados": "/achados-perdidos",
  "/lost-and-found": "/achados-perdidos",

  // Ocorrências
  "/ocorrencias": "/observations",
  "/avarias": "/observations",

  // E-mails
  "/email-hub": "/emails",
  "/gerenciador-emails": "/emails",

  // WhatsApp Chat
  "/chat": "/whatsapp-chat",
  "/whatsapp-web": "/whatsapp-chat",
  "/chat-whatsapp": "/whatsapp-chat",

  // Automações WhatsApp
  "/camareiras-whatsapp": "/automacoes-camareiras",
  "/governanca-whatsapp": "/automacoes-camareiras",
  "/whatsapp-automation": "/whatsapp",
  "/automacao-whatsapp": "/whatsapp",

  // Notificações
  "/notifications": "/notificacoes",
  "/alertas": "/notificacoes",

  // Café
  "/cafe-dashboard": "/pedidos-cafe",
  "/historico-cafe": "/pedidos-cafe",
  "/insights-cafe": "/relatorios-cafe",

  // Relatórios de Reservas
  "/relatorio-reservas": "/relatorios-reservas",
  "/pms-reports": "/relatorios-reservas",

  // CRM
  "/guests": "/crm",
  "/hospedes": "/crm",

  // Pagamentos
  "/payments": "/pagamentos",
  "/recebiveis": "/pagamentos",
  "/taxas": "/pagamentos",

  // Financeiro
  "/financial": "/financeiro",
  "/precificacao": "/financeiro",
  "/finance": "/financeiro",
  "/dre": "/financeiro",
  "/contas": "/financeiro",
  "/fluxo-caixa": "/financeiro",

  // Funil / Tráfego
  "/trafego": "/funil-vendas",
  "/marketing": "/funil-vendas",
  "/ads": "/funil-vendas",

  // Notas Fiscais
  "/nfse": "/notas",
  "/invoices": "/notas",

  // Vistorias
  "/vistorias": "/surveys",

  // Serviços
  "/service-orders": "/servicos",

  // Propriedade
  "/hotel": "/propriedade",
  "/regras": "/propriedade",

  // Editor Site
  "/configurar-site": "/editor-site",
  "/personalizar-site": "/editor-site",
  "/site-editor": "/editor-site",
  "/cms": "/editor-site",

  // Caixa de Entrada OTA
  "/ota-inbox": "/caixa-entrada-ota",
  "/quarentena": "/caixa-entrada-ota",

  // Reservar
  "/booking": "/reservar"
};

/**
 * Normaliza qualquer rota ou alias para sua rota canônica no sistema de permissões.
 */
export function canonicalizeRoute(path: string): string {
  if (!path) return "";
  const clean = (path.split("?")[0].replace(/\/+$/, "") || "/").toLowerCase();
  return ROUTE_ALIASES[clean] || clean;
}

export interface UserWithPermissions {
  id?: number | string;
  role?: string;
  username?: string;
  allowedModules?: string[];
}

/**
 * Verifica se um usuário possui acesso a determinada rota (suportando aliases).
 */
export function hasModuleAccess(
  user: UserWithPermissions | null | undefined,
  path: string
): boolean {
  if (!user) return false;
  const canonical = canonicalizeRoute(path);

  // Módulos estritamente restritos a desenvolvedores
  if (DEV_ONLY_MODULES.includes(canonical) && user.role !== "dev") {
    return false;
  }

  // Lista efetiva de módulos permitidos
  const allowed = Array.isArray(user.allowedModules)
    ? user.allowedModules
    : getDefaultModulesForRole(user.role);

  return allowed.includes(canonical);
}

/**
 * Verifica se a lista de módulos concedidos corresponde exatamente ao padrão do perfil.
 */
export function isDefaultPermissionsForRole(
  role: string | null | undefined,
  allowedModules?: string[] | null
): boolean {
  if (!Array.isArray(allowedModules)) return true;
  const defaults = getDefaultModulesForRole(role);
  const setGiven = new Set(allowedModules);
  if (defaults.length !== setGiven.size) return false;

  return defaults.every(m => setGiven.has(m));
}

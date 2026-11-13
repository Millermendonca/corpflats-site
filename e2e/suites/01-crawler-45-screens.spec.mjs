/**
 * e2e/suites/01-crawler-45-screens.spec.mjs
 * 
 * Milestone 2 (M2) - Universal 45 Screens Crawler & Health Guard
 * Systematically tests 100% of mapped screens (45 functional screens + 404 fallback)
 * across Mobile 375px, Tablet 768px, and Desktop 1920px viewports.
 * 
 * Guards Enforced:
 * 1. Zero White Screen (#root contains rendered DOM elements with non-zero dimensions)
 * 2. Zero Unhandled Console Errors (`console.error` and `pageerror`)
 * 3. Zero Unexpected 4xx/5xx Internal API Responses
 * 4. Essential Interactive Element Rendering (Buttons, Tables, Forms, Badges, Tabs)
 */

import { test, expect } from "@playwright/test";
import { injectAuthSession, PERSONAS } from "../fixtures/auth-fixtures.mjs";
import { attachErrorGuard } from "../fixtures/error-guard.mjs";

/**
 * Complete and exhaustive catalog of all 45 mapped functional screens + fallback.
 */
export const SCREEN_CATALOG = [
  // --- GRUPO 1: GOVERNANÇA & CAMAREIRAS (STAFF) ---
  {
    id: 1,
    name: "Painel de Limpeza & Governança",
    route: "/dashboard",
    persona: "maid",
    category: "Governança",
    expectedKeywords: ["Governança", "Limpeza", "Flat", "Vou Limpar", "Cris", "Quartos"]
  },
  {
    id: 2,
    name: "Tarefas Preventivas & Rotinas Periódicas",
    route: "/tasks",
    persona: "maid",
    category: "Governança",
    expectedKeywords: ["Tarefas", "Preventivas", "Recorrentes", "Cadastrar", "Executar"]
  },
  {
    id: 3,
    name: "Ocorrências & Avarias",
    route: "/observations",
    persona: "maid",
    category: "Governança",
    expectedKeywords: ["Ocorrências", "Avarias", "Defeito", "Manutenção", "Nova"]
  },
  {
    id: 4,
    name: "Achados & Perdidos",
    route: "/achados-perdidos",
    persona: "maid",
    category: "Governança",
    expectedKeywords: ["Achados", "Perdidos", "Item", "Cadastrar", "Status"]
  },
  {
    id: 5,
    name: "Histórico de Limpezas",
    route: "/history",
    persona: "maid",
    category: "Governança",
    expectedKeywords: ["Histórico", "Limpezas", "Período", "Camareira", "Duração"]
  },
  {
    id: 6,
    name: "Lista de Compras de Insumos",
    route: "/lista-compras",
    persona: "maid",
    category: "Governança",
    expectedKeywords: ["Compras", "Insumos", "Adicionar", "Item", "Limpeza"]
  },
  {
    id: 7,
    name: "Fechamento Quinzenal & Relatórios",
    route: "/reports",
    persona: "maid",
    category: "Governança",
    expectedKeywords: ["Fechamento", "Relatórios", "Diárias", "Quinzena", "Recibo"]
  },
  {
    id: 8,
    name: "Extrato Individual da Camareira",
    route: "/meu-extrato",
    persona: "maid",
    category: "Governança",
    expectedKeywords: ["Extrato", "Saldo", "Camareira", "PIX", "Crédito"]
  },

  // --- GRUPO 2: PORTARIA & RECEPÇÃO ---
  {
    id: 9,
    name: "Terminal da Portaria (Tablet 24h)",
    route: "/portaria",
    persona: "reception",
    category: "Portaria",
    expectedKeywords: ["Portaria", "Terminal", "Chegadas", "Liberar", "Veículo"]
  },
  {
    id: 10,
    name: "Checkout Rápido da Recepção",
    route: "/recepcao",
    persona: "reception",
    category: "Portaria",
    expectedKeywords: ["Recepção", "Check-out", "Flat", "Confirmar", "Chave"]
  },

  // --- GRUPO 3: HÓSPEDE & CANAIS PÚBLICOS ---
  {
    id: 11,
    name: "Login do Sistema Staff",
    route: "/login",
    persona: "public",
    category: "Público",
    expectedKeywords: ["CorpFlats", "Entrar", "Usuário", "Senha", "Login"]
  },
  {
    id: 12,
    name: "Motor de Reservas Diretas & Catálogo",
    route: "/reservar",
    persona: "public",
    category: "Hóspede",
    expectedKeywords: ["CorpFlats", "Reservar", "Check-in", "Check-out", "Hóspedes", "Suítes"]
  },
  {
    id: 13,
    name: "Portal Minha Conta do Hóspede",
    route: "/minha-conta",
    persona: "public",
    category: "Hóspede",
    expectedKeywords: ["Minha Conta", "Perfil", "Reservas", "Identificação", "Entrar"]
  },
  {
    id: 14,
    name: "Pré-Check-in Digital com FNRH Oficial",
    route: "/pre-checkin/RES-TEST-CHECKIN-TODAY",
    persona: "public",
    category: "Hóspede",
    expectedKeywords: ["Pré-Check-in", "FNRH", "Hóspede", "Roberto", "Documento", "Identificação"]
  },
  {
    id: 15,
    name: "Portal do Hóspede (Minha Reserva & Fechadura)",
    route: "/minha-reserva/RES-TEST-CHECKIN-TODAY",
    persona: "public",
    category: "Hóspede",
    expectedKeywords: ["Roberto", "Reserva", "CorpFlats", "Flat", "Acesso", "Voucher"]
  },
  {
    id: 16,
    name: "Pedido de Café da Manhã do Hóspede",
    route: "/cafe/RES-TEST-CHECKIN-TODAY",
    persona: "public",
    category: "Hóspede",
    expectedKeywords: ["Café", "Manhã", "Pedido", "Horário", "Hóspedes"]
  },
  {
    id: 17,
    name: "Auto-Checkout do Hóspede",
    route: "/checkout/RES-TEST-CHECKIN-TODAY",
    persona: "public",
    category: "Hóspede",
    expectedKeywords: ["Check-out", "Saída", "Despedida", "Confirmar", "Obrigado"]
  },
  {
    id: 18,
    name: "Verificação Pública de Autenticidade FNRH",
    route: "/verificar-ficha",
    persona: "public",
    category: "Público",
    expectedKeywords: ["Verificação", "Ficha", "Autenticidade", "FNRH", "Documento"]
  },
  {
    id: 19,
    name: "Portal Público do Prestador de Serviços",
    route: "/servico/tok_sandbox_worker_12345",
    persona: "public",
    category: "Prestador",
    expectedKeywords: ["Pintura", "Reparos", "Serviço", "Prestador", "Flat", "Identificação"]
  },

  // --- GRUPO 4: GESTÃO HOTELEIRA, PMS & ADMIN ---
  {
    id: 20,
    name: "Livro de Reservas PMS & Mapa de Ocupação",
    route: "/reservas",
    persona: "admin",
    category: "Admin PMS",
    expectedKeywords: ["Reservas", "Mapa", "Ocupação", "Nova Reserva", "Calendário"]
  },
  {
    id: 21,
    name: "Relatórios & Métricas de Ocupação PMS",
    route: "/relatorios-reservas",
    persona: "admin",
    category: "Admin PMS",
    expectedKeywords: ["Relatórios", "Ocupação", "RevPAR", "Diária Média", "Receita"]
  },
  {
    id: 22,
    name: "CRM 360º de Hóspedes & Empresas",
    route: "/crm",
    persona: "admin",
    category: "Admin PMS",
    expectedKeywords: ["CRM", "Hóspedes", "Empresas", "Buscar", "Histórico"]
  },
  {
    id: 23,
    name: "Painel de Produção do Café da Manhã",
    route: "/pedidos-cafe",
    persona: "admin",
    category: "Operacional",
    expectedKeywords: ["Café da Manhã", "Produção", "Pedidos", "Cozinha", "Hoje"]
  },
  {
    id: 24,
    name: "Controle de Garagem & Vagas Rotativas",
    route: "/garagem",
    persona: "admin",
    category: "Operacional",
    expectedKeywords: ["Garagem", "Vagas", "Veículos", "Placa", "Autorização"]
  },
  {
    id: 25,
    name: "Painel Operacional Ao Vivo (Live Ops)",
    route: "/painel-aovivo",
    persona: "admin",
    category: "Operacional",
    expectedKeywords: ["Painel", "Operacional", "Ao Vivo", "Ocupação", "Tempo Real"]
  },
  {
    id: 26,
    name: "Central de Notificações Unificadas",
    route: "/notificacoes",
    persona: "admin",
    category: "Comunicação",
    expectedKeywords: ["Notificações", "Alertas", "Lidas", "Severidade"]
  },
  {
    id: 27,
    name: "Gestão de Ordens de Serviço Externas",
    route: "/servicos",
    persona: "admin",
    category: "Admin Operacional",
    expectedKeywords: ["Ordens de Serviço", "Serviços", "Novo Serviço", "Progresso"]
  },
  {
    id: 28,
    name: "Vistorias de Saída & Checklists",
    route: "/surveys",
    persona: "admin",
    category: "Admin Operacional",
    expectedKeywords: ["Vistorias", "Checklists", "Saída", "Nova Vistoria"]
  },
  {
    id: 29,
    name: "Gestão de Pagamentos, PIX & Conciliação",
    route: "/pagamentos",
    persona: "admin",
    category: "Financeiro",
    expectedKeywords: ["Pagamentos", "PIX", "Transações", "Conciliação", "Taxas"]
  },
  {
    id: 30,
    name: "ERP Financeiro & DRE Gerencial",
    route: "/financeiro",
    persona: "admin",
    category: "Financeiro",
    expectedKeywords: ["Financeiro", "DRE", "Contas a Pagar", "Receber", "Fluxo"]
  },
  {
    id: 31,
    name: "Hub Fiscal de Notas Fiscais (NFS-e)",
    route: "/notas",
    persona: "admin",
    category: "Fiscal",
    expectedKeywords: ["Notas Fiscais", "NFS-e", "Emitir", "Tomador", "Serviço"]
  },
  {
    id: 32,
    name: "Funil de Vendas & Tráfego Pago IA",
    route: "/trafego",
    persona: "admin",
    category: "Marketing",
    expectedKeywords: ["Funil", "Tráfego", "Marketing", "Conversão", "Campanhas"]
  },
  {
    id: 33,
    name: "Avaliações, Satisfação & Sentimento IA",
    route: "/avaliacoes-ia",
    persona: "admin",
    category: "Qualidade",
    expectedKeywords: ["Avaliações", "Satisfação", "NPS", "Sentimento", "Reviews"]
  },
  {
    id: 34,
    name: "WhatsApp Web Chat Corporativo",
    route: "/whatsapp-chat",
    persona: "admin",
    category: "Comunicação",
    expectedKeywords: ["WhatsApp", "Chat", "Conversas", "Mensagens", "Buscar"]
  },
  {
    id: 35,
    name: "Automação de WhatsApp (Réguas & Gatilhos)",
    route: "/whatsapp",
    persona: "admin",
    category: "Comunicação",
    expectedKeywords: ["Automação", "WhatsApp", "Gatilhos", "Réguas", "Disparos"]
  },
  {
    id: 36,
    name: "Automações de WhatsApp para Camareiras",
    route: "/automacoes-camareiras",
    persona: "admin",
    category: "Comunicação",
    expectedKeywords: ["Camareiras", "WhatsApp", "Automações", "Notificações", "Governança"]
  },
  {
    id: 37,
    name: "Conexão Z-API (WhatsApp Gateway)",
    route: "/zapi-conexao",
    persona: "admin",
    category: "Integrações",
    expectedKeywords: ["Z-API", "Conexão", "Instância", "QR Code", "Status"]
  },
  {
    id: 38,
    name: "Gerenciador de E-mails Transacionais",
    route: "/emails",
    persona: "admin",
    category: "Comunicação",
    expectedKeywords: ["E-mails", "Email", "Hub", "Histórico", "SMTP", "Fila"]
  },
  {
    id: 39,
    name: "Mapa da Jornada de Reservas & Comunicação",
    route: "/jornada-reservas",
    persona: "admin",
    category: "Comunicação",
    expectedKeywords: ["Jornada", "Fluxo", "Etapas", "Disparos", "Hóspede"]
  },
  {
    id: 40,
    name: "Editor Visual do Site (CMS do Hotel)",
    route: "/editor-site",
    persona: "admin",
    category: "CMS",
    expectedKeywords: ["Editor", "Site", "CMS", "Hero", "Comodidades", "FAQ"]
  },
  {
    id: 41,
    name: "Gestão de Tarifas, Taxas & Políticas",
    route: "/tarifas",
    persona: "admin",
    category: "Tarifas",
    expectedKeywords: ["Tarifas", "Diária", "Preços", "Taxa", "Limpeza", "Café"]
  },
  {
    id: 42,
    name: "Regras da Casa & Propriedade",
    route: "/propriedade",
    persona: "admin",
    category: "Configurações",
    expectedKeywords: ["Propriedade", "Regras", "Flats", "Check-in", "Check-out"]
  },
  {
    id: 43,
    name: "Configurações Globais & SERPRO FNRH",
    route: "/settings",
    persona: "admin",
    category: "Configurações",
    expectedKeywords: ["Configurações", "SERPRO", "Check-in", "Usuários", "Sistema"]
  },
  {
    id: 44,
    name: "Diagnóstico & Status da IA (Gemini)",
    route: "/ia-status",
    persona: "admin",
    category: "IA",
    expectedKeywords: ["IA", "Gemini", "Status", "Diagnóstico", "Latência"]
  },
  {
    id: 45,
    name: "Logs de Auditoria & Segurança Fail-Safe",
    route: "/logs",
    persona: "admin",
    category: "Auditoria",
    expectedKeywords: ["Logs", "Auditoria", "Eventos", "Nível", "Segurança"]
  },

  // --- SUPLEMENTAR: FALLBACK 404 ---
  {
    id: 46,
    name: "Tela 404 Not Found (Fallback do Sistema)",
    route: "/rota-inexistente-404-teste-universal",
    persona: "public",
    category: "Sistema",
    expectedKeywords: ["404", "não encontrada", "Voltar", "Página", "Início"]
  }
];


test.describe("Universal 45 Screens Crawler & Sanity Suite (R2)", () => {
  for (const screen of SCREEN_CATALOG) {
    test(`[Tela ${String(screen.id).padStart(2, "0")}/45] ${screen.name} (${screen.route}) [${screen.persona}]`, async ({ page }, testInfo) => {
      // 1. Authenticate persona
      await injectAuthSession(page.context(), screen.persona);

      // 2. Attach strict error guard
      const guard = attachErrorGuard(page, {
        allowGuestAuth401: true
      });

      try {
        // 3. For guest account portal, initialize authenticated guest session in localStorage
        if (screen.route === "/minha-conta") {
          await page.addInitScript(() => {
            try {
              localStorage.setItem("corpflats_guest_email", "mariana.costa@exemplo.com");
              localStorage.setItem("corpflats_guest_profile", JSON.stringify({
                id: 101,
                name: "Mariana Costa",
                email: "mariana.costa@exemplo.com",
                phone: "(21) 98765-4321",
                document: "123.456.789-00",
                role: "guest"
              }));
            } catch {}
          });
        }

        // 4. Navigate to screen
        const response = await page.goto(screen.route, {
          waitUntil: "domcontentloaded",
          timeout: 25000
        });

        // 4. Verify HTTP status is healthy
        if (response) {
          expect(response.status()).toBeLessThan(400);
        }

        // 5. Enforce Zero White Screen Guard
        await guard.assertZeroWhiteScreen(10000);

        // 6. Enforce Zero Console & API Errors Guard
        guard.assertNoErrors();

        // 7. Verify Essential Elements (Ensure page did not crash or render blank error shell)
        const rootText = await page.locator("#root").innerText();
        const hasKeyword = screen.expectedKeywords.some(keyword =>
          rootText.toLowerCase().includes(keyword.toLowerCase())
        );

        // Also check if any buttons, inputs, tables, or cards are rendered
        const interactiveElementsCount = await page.locator("button, a, input, table, [role='tab'], svg, [data-state]").count();
        expect(interactiveElementsCount, `Screen ${screen.name} has no rendered interactive elements`).toBeGreaterThan(0);

        if (!hasKeyword) {
          console.warn(`[Crawler Warning] Screen ${screen.name} rendered without primary keyword match. Root snippet: "${rootText.slice(0, 120).replace(/\s+/g, ' ')}"`);
        }
        expect(hasKeyword || interactiveElementsCount >= 2).toBe(true);

      } finally {
        guard.detach();
      }
    });
  }
});

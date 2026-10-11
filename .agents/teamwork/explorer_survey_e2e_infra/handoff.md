# Relatório de Levantamento e Arquitetura Técnica E2E (Explorer 3)

**Módulo**: Infraestrutura de Testes Sintéticos E2E, Varredura Universal, Cenários R3/R4/R5 e Relatórios  
**Data**: 2026-10-11T00:52:00Z  
**Autor**: Explorer 3 (Survey E2E Infrastructure & Architecture)  
**Destinatário**: Orchestrator (Lead Architect)

---

## 1. Observation (Evidências Empíricas e Observações Diretas)

### 1.1 Ambiente de Execução, Runtime e Binários do Sistema
- **Node.js & npm**:
  - Comando: `node -v; npm -v`
  - Saída: `v20.10.0` e `10.2.3`. Suporte nativo a ES Modules (`import`/`export`), `node:test`, `node:assert/strict`, `fetch` global e `crypto`.
- **Gerenciador de Pacotes & PowerShell ExecutionPolicy**:
  - Comando: `pnpm -v` gerou erro:
    `pnpm : O arquivo C:\Users\mille\AppData\Roaming\npm\pnpm.ps1 não pode ser carregado porque a execução de scripts foi desabilitada neste sistema (PSSecurityException / Restricted).`
  - Resolução verificada: `pnpm.cmd -v` e `npm.cmd -v` executam com sucesso código de saída 0 (`pnpm.cmd` versão `9.15.9`, `npm.cmd` versão `10.2.3`).
  - Conectividade de rede com registro npm: `npm ping` respondeu com `npm notice PONG 11444ms`.
- **Navegadores Disponíveis no Host Windows**:
  - Google Chrome instalado: `C:\Program Files\Google\Chrome\Application\chrome.exe` (Versão do Produto: `155.0.8059.39`).
  - Microsoft Edge instalado: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` (Versão do Produto: `155.0.4283.45`).
  - Cache local Playwright: `C:\Users\mille\AppData\Local\ms-playwright-go\1.57.0`.

### 1.2 Ecossistema Atual do Repositório e Testes Existentes
- **Raiz do Repositório (`package.json`)**:
  - Dependências existentes: `@replit/connectors-sdk`, `@types/nodemailer`, `@xmldom/xmldom`, `cookie-parser`, `cors`, `express`, `node-forge`, `nodemailer`, `pdfkit`, `pg`, `qrcode`, `xlsx`, `xml-crypto`, `xpath`.
  - Scripts: `"build": "npm --prefix artifacts/limpeza run build"`, `"start": "node server.mjs"`.
  - Configuração do Workspace (`pnpm-workspace.yaml`): define `packages: [artifacts/*, lib/*, lib/integrations/*, scripts]`.
- **Pasta de Testes Existentes (`tests/`)**:
  - Contém 39 suítes escritas em ESM executadas com o runner nativo `node --test` (ex: `tests/service-orders-e2e-final.test.mjs`, `tests/fnrh-checkin-toggle.test.mjs`, `tests/vehicle-details-persistence.test.mjs`).
  - Invocação comprovada em `tests/service-orders-e2e-final.test.mjs`:
    ```javascript
    serverChild = spawn('node', ['artifacts/api-server/demo-server.mjs'], {
      env: { ...process.env, PORT: String(PORT), DATABASE_FILE: isolatedDbPath, NODE_ENV: 'test' }
    });
    ```
- **Backend Monolítico (`artifacts/api-server/demo-server.mjs` - 28.781 linhas)**:
  - Espelho estrito em `scripts/demo-server.mjs` que deve permanecer byte-a-byte idêntico.
  - Carregamento de banco isolado: linha 519: `const DB_FILE = process.env.DATA_FILE || process.env.DATABASE_FILE || path.join(DATA_DIR, "database.json");`.
  - Autenticação e Sessão (linhas 5318-5334):
    `AUTH_COOKIE_NAME = "gfm_session_v2"; AUTH_SESSION_VERSION = 2;`
    Token é decodificado via `Buffer.from(token, "base64").toString("utf-8")` contendo `{ v: 2, id: <userId> }`.
    Usuários padrão (linhas 521-525): id 1 (`admin`), id 2 (`Cris` - camareira), id 3 (`Grazi` - camareira).
  - Servidor de Arquivos Estáticos e SPA Fallback (linhas 27345-27365):
    Serve `artifacts/limpeza/dist/public` diretamente com fallback para `index.html`.
    `artifacts/limpeza/dist/public/index.html` já está compilado e existente.

### 1.3 Mapeamento Completo das 45 Telas do Sistema
A análise de `artifacts/limpeza/src/App.tsx` e `artifacts/limpeza/src/pages/` revelou exatamente **45 componentes de página de negócio** (+ 1 página `not-found.tsx`):
1. `AiStatusPage` (`/ia-status`, `/ai-status`, `/status-ia`) - Admin
2. `BookingEngine` (`/reservar`, `/booking`) - Público
3. `BreakfastProduction` (`/pedidos-cafe`, `/cafe-dashboard`, `/historico-cafe`, etc.) - Admin
4. `CrmGuests` (`/crm`, `/guests`, `/hospedes`) - Admin
5. `Dashboard` (`/dashboard`) - Camareira / Staff
6. `EmailHub` (`/emails`, `/email-hub`, `/gerenciador-emails`) - Admin
7. `FinancialDashboard` (`/financeiro`, `/precificacao`, `/finance`) - Admin
8. `FiscalInvoices` (`/notas`, `/nfse`, `/invoices`) - Admin
9. `GarageDashboard` (`/garagem`, `/estacionamento`) - Admin
10. `GuestBreakfast` (`/minha-reserva/:code/cafe`, `/cafe/:code`, etc.) - Hóspede / Público
11. `GuestCheckout` (`/minha-reserva/:code/checkout`, `/checkout/:code`, etc.) - Hóspede / Público
12. `GuestPortal` (`/minha-reserva/:code`, `/copiar-pix/:code`, `/portal-hospede/:code`) - Hóspede / Público
13. `GuestPreCheckin` (`/pre-checkin/:code`, `/pre-checkin`) - Hóspede / Público
14. `History` (`/history`, `/historico`) - Camareira / Staff
15. `LiveOperationsPanel` (`/painel-aovivo`, `/live-ops`, `/aovivo`) - Admin
16. `Login` (`/login`) - Público
17. `LostAndFoundPage` (`/achados-perdidos`, `/achados`, `/lost-and-found`) - Camareira / Staff
18. `MaidStatementPage` (`maid-statement.tsx`, importado no App.tsx) - Camareira / Staff
19. `MaidWhatsappAutomation` (`/automacoes-camareiras`, `/camareiras-whatsapp`) - Admin
20. `MarketingTraffic` (`/trafego`, `/marketing`, `/ads`) - Admin
21. `MyAccount` (`/minha-conta`, `/minhaconta`, `/perfil`, `/my-account`) - Hóspede / Público
22. `NotificationsHub` (`/notificacoes`, `/notifications`, `/alertas`) - Admin
23. `Observations` (`/observations`, `/ocorrencias`, `/avarias`) - Camareira / Staff
24. `Payments` (`/pagamentos`, `/payments`, `/recebiveis`, `/taxas`) - Admin
25. `PmsCalendar` (`/reservas`) - Admin
26. `PmsReportsPage` (`/relatorios-reservas`, `/relatorio-reservas`, `/pms-reports`) - Admin
27. `PropertySettings` (`/propriedade`, `/hotel`, `/regras`) - Admin
28. `ReceptionCheckout` (`/recepcao`, `/reception`) - Portaria / Recepção
29. `ReceptionTablet` (`/portaria`, `/tablet`) - Portaria / Recepção
30. `Reports` (`/extrato`, `/fechamento`, `/reports`, `/relatorios`) - Camareira / Staff
31. `ReservationJourney` (`/jornada-reservas`, `/fluxo-reservas`, `/mapa-jornada`) - Admin
32. `ReviewInsights` (`/avaliacoes-ia`, `/reviews-ia`) - Admin
33. `ServiceOrders` (`/servicos`, `/service-orders`) - Admin
34. `ServiceWorkerPortal` (`/servico/:token`, `/service/:token`) - Prestador de Serviço (Público)
35. `Settings` (`/settings`, `/configuracoes`, `/ajustes`) - Admin
36. `ShoppingListPage` (`/lista-compras`, `/compras`) - Camareira / Staff
37. `SiteEditor` (`/editor-site`, `/site-editor`, `/cms`) - Admin
38. `Surveys` (`/surveys`, `/vistorias`) - Admin
39. `SystemLogsPage` (`/logs`, `/auditoria`, `/system-logs`, `/audit`) - Admin
40. `TarifasEditor` (`/tarifas`, `/gestao-tarifas`, `/tabela-tarifas`, `/precos`) - Admin
41. `Tasks` (`/tasks`, `/tarefas`) - Camareira / Staff
42. `VerifyFnrh` (`/verificar-ficha/:uuid`, `/verificar-ficha`) - Público
43. `WhatsappAutomation` (`/whatsapp`, `/automacao-whatsapp`) - Admin
44. `WhatsappChat` (`/whatsapp-chat`, `/chat`, `/whatsapp-web`) - Admin
45. `ZapiConnection` (`/zapi-conexao`, `/conexao-zapi`, `/zapi`) - Admin

### 1.4 Inspeção Técnica dos Requisitos R3 (Jornadas Humanas Anti-Frustração)
- **R3.1 Zero Amnésia**:
  - Em `artifacts/api-server/demo-server.mjs` (linhas 18074–18115): na rota `GET /api/pms/pre-checkin/:code`, o backend localiza hóspedes anteriores por documento (`cleanDoc`), telefone ou e-mail. Se encontrado, injeta automaticamente `docPhotoUrl: guest?.docPhotoUrl || r.docPhotoUrl || null`, `selfieUrl: guest?.photoUrl || r.selfieUrl || null`, `cpf`, `birthDate`, `address`, `city`, `state`, `cep`.
  - Em `artifacts/limpeza/src/pages/guest-pre-checkin.tsx` (linhas 523–550 e 2750–2760): se o documento ou foto já existirem do cadastro prévio, `isReturningGuest` é ativado, exibindo o status preservado sem forçar re-envio.
- **R3.2 Vínculo Multicanal Automático (`/minha-conta`)**:
  - Em `artifacts/api-server/demo-server.mjs` (linhas 23559–23586): a rota `GET /api/guest-auth/me` localiza o histórico de reservas filtrando por `guestEmail` e por `guestPhone`. Na criação de contas ou sincronização por CPF, as reservas manuais são vinculadas imediatamente ao histórico do hóspede.
- **R3.3 Persistência Completa de Veículo**:
  - Em `artifacts/api-server/demo-server.mjs` (linhas 25366–25389): `GET /api/pms/garage/daily-sheet` mapeia e retorna explicitamente `{ plate, brand, model, color, flatNumber, checkinDate, checkoutDate }`.
  - Em `artifacts/limpeza/src/pages/garage-dashboard.tsx` (linhas 240–250): renderiza na tela a placa (`v.plate`), marca/modelo (`v.brand v.model`) e cor (`v.color`).
- **R3.4 Gestão de Acesso e Chaves (Fechadura 14:00)**:
  - Em `artifacts/limpeza/src/pages/guest-portal.tsx` (linhas 2201–2241): o código de acesso (`accessCode`) só é exibido se a reserva estiver paga (`isPaid`) e liberada. Antes do horário regulamentar (14:00) ou enquanto o apartamento estiver em faxina (`!isFlatClean`), exibe o aviso com ícone de relógio: *"Apartamento em Preparação & Higienização 🧹 - Horário oficial a partir das 14:00"*.
- **R3.5 Resiliência de Pagamento (PIX em Tempo Real)**:
  - Em `artifacts/limpeza/src/pages/guest-portal.tsx` (linhas 420–440, 2009–2030): exibe o QR Code dinâmico e o código Copia e Cola. O TanStack Query executa refetching e, quando o webhook/servidor confirma o pagamento (`isPaid: true`), o componente substitui automaticamente o painel PIX pela confirmação e liberação do voucher.
- **R3.6 Upload Mobile Resiliente & Canvas Signature**:
  - Em `artifacts/limpeza/src/lib/image-compression.ts`: comprime imagens de alta resolução redimensionando até 1400px e convertendo para WebP/JPEG com qualidade 0.8, reduzindo de ~6MB para 80-120KB (~97% de compressão).
  - Em `artifacts/limpeza/src/pages/guest-pre-checkin.tsx` (linhas 711–745 e 2846–2857): `<canvas ref={canvasRef} ... onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />`. Deve possuir `touch-action: none` para impedir scroll de tela involuntário durante o desenho da assinatura no mobile.
- **R3.7 Isolamento de Acompanhantes (Hóspede 2 não sobrescreve Hóspede 1)**:
  - Em `artifacts/api-server/demo-server.mjs` (linhas 18096–18166): os slots `r.guests[0]` e `r.guests[1]` são instanciados e mantidos com dados independentes. Atualizações enviadas pelo segundo hóspede afetam apenas seu índice correspondente.

### 1.5 Inspeção Técnica dos Requisitos R4 (Pairwise Testing)
- **19 Flats Ativos**: 113, 114, 116, 211, 212, 215, 313, 408, 509, 511, 512, 605, 712, 715, 904, 905, 907, 1004, 1304.
- **7 Estados de Governança**: Vago Sujo, Vago Limpo, Ocupado, Saída Prevista, Faxina Periódica, Arrumação, Manutenção Bloqueada.
- **Ordens de Serviço**: Rota pública `/servico/:token` com validação de `cleanFlatMode` ("never", "priority", "always"), limites simultâneos e diários, envio de fotos e conclusão com `needsCleaning`.
- **Café da Manhã**: Regra de corte às 22:00 (`artifacts/api-server/demo-server.mjs` e `tests/breakfast-incident-recovery.test.mjs`).

---

## 2. Logic Chain (Cadeia de Raciocínio da Arquitetura)

1. **Premissa de Execução sem Overhead de Instalação de Navegador**:
   - Uma vez que o Google Chrome 155 (`C:\Program Files\Google\Chrome\Application\chrome.exe`) e o Microsoft Edge 155 (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`) já estão instalados no host Windows, a suite E2E pode configurar o Playwright com `channel: 'chrome'` ou `executablePath`.
   - Isso elimina o download demorado de navegadores de múltiplos gigabytes, permitindo execução instantânea e determinística.

2. **Isolamento de Sandbox & Prevenção de Efeitos Colaterais**:
   - O servidor Express monolítico (`artifacts/api-server/demo-server.mjs`) aceita nativamente a variável `DATABASE_FILE`.
   - O runner de E2E deve gerar `data/database.test.json` antes dos testes e iniciar uma instância dedicada do Express em uma porta de teste (ex: `4399`), garantindo que o banco de produção (`data/database.json`) permaneça 100% intocado.
   - Variáveis como `SMTP_PORT=9` e `ZAPI_TEST_MODE=true` garantem zero tráfego para APIs de produção reais.

3. **Simulação de Personas via Cookies Determinísticos**:
   - A autenticação do sistema baseia-se no cookie `gfm_session_v2` com token base64 `{ v: 2, id: <userId> }`.
   - Em vez de realizar logins lentos pela tela a cada teste, os fixtures do Playwright podem injetar diretamente o cookie de sessão do Admin (`id: 1`) ou Camareira (`id: 2`), permitindo alternar de perfil em microssegundos com zero instabilidade.

4. **Três Viewports Obrigatórios para Varredura R2**:
   - Para atender ao requisito de responsividade e zero telas brancas em Desktop, Tablet e Mobile:
     - Desktop: `1920x1080`
     - Tablet: `768x1024` (iPad)
     - Mobile: `375x812` (iPhone X/12)
   - O Playwright oferece suporte nativo a projetos com viewports e emulação touch mobile (`isMobile: true`, `hasTouch: true`).

5. **Captura Automatizada de Falhas e Geração do Relatório Consolidado**:
   - A configuração `screenshot: 'only-on-failure'` e `video: 'retain-on-failure'` do Playwright grava vídeos e fotos automaticamente caso algum teste falhe.
   - Um gerador de relatório customizado (`e2e/reporters/html-report-generator.mjs`) compilará todos os resultados em um único arquivo HTML standalone em `e2e/reports/index.html`, indexando links locais diretos para os vídeos e fotos de falha.

---

## 3. Caveats (Ressalvas e Limitações Identificadas)

1. **PowerShell ExecutionPolicy**:
   - Não se deve invocar `pnpm` diretamente via linha de comando no terminal do Windows devido à restrição de política de scripts `.ps1`. Deve-se sempre usar `pnpm.cmd`, `npm.cmd` ou invocar scripts via `node`.
2. **Página `maid-statement.tsx` no Roteamento**:
   - O componente `MaidStatementPage` está presente no repositório e importado no topo de `App.tsx`, porém a rota `/extrato` aponta para o componente `Reports`. No crawler R2, o arquivo `maid-statement.tsx` deve ser testado isoladamente como componente para garantir 100% de cobertura das 45 telas.
3. **Canvas Touch-Action no Mobile**:
   - No componente `guest-pre-checkin.tsx`, o canvas possui handlers touch, porém para assegurar que navegadores mobile não disparem scroll padrão durante a assinatura, deve-se verificar o atributo CSS `touch-action: none`.
4. **Espelho Estrito Obrigatório**:
   - Qualquer alteração eventual no servidor backend `artifacts/api-server/demo-server.mjs` exige a replicação exata byte-a-byte em `scripts/demo-server.mjs`.

---

## 4. Conclusion & Arquitetura Proposta para `e2e/`

Propomos a estrutura arquitetural modular completa para o diretório `e2e/`, permitindo que os próximos agentes implementadores executem suas tarefas de forma autônoma e desacoplada.

### 4.1 Estrutura de Diretórios Proposta

```
e2e/
├── package.json                         # Dependências da suite E2E (@playwright/test) e scripts
├── playwright.config.mjs                # Configuração do Playwright (Chrome, viewports, vídeo, relatórios)
├── runner.mjs                           # CLI mestre: bootstrap do sandbox, orquestração e teardown
├── fixtures/
│   ├── auth.fixture.mjs                 # Injeção de cookies para Admin, Recepção, Camareira e Hóspede
│   ├── browser.fixture.mjs              # Configurações de Desktop (1920px), Tablet (768px) e Mobile (375px)
│   └── database.fixture.mjs             # Gerador de seeds e isolamento do database.test.json
├── mocks/
│   ├── zapi-mock.mjs                    # Emulador Z-API / WhatsApp com fila de saída e envio sintético
│   ├── smtp-mock.mjs                    # Interceptador SMTP em memória para captura de e-mails
│   ├── payment-mock.mjs                 # Simulador de webhooks PIX (pagamento instantâneo e expiração)
│   └── serpro-mock.mjs                  # Emulador de validação de CPF / FNRH do SERPRO
├── pages/                               # Page Object Models (POM) encapsulando ações de interface
│   ├── base.pom.mjs                     # Base POM com captura de console.error e erros HTTP 4xx/5xx
│   ├── booking-engine.pom.mjs           # Ações da tela /reservar
│   ├── guest-portal.pom.mjs             # Ações da tela /minha-reserva
│   ├── pre-checkin.pom.mjs              # Ações da tela /pre-checkin
│   ├── reception-tablet.pom.mjs         # Ações da tela /portaria
│   ├── pms-calendar.pom.mjs             # Ações da tela /reservas
│   └── service-worker.pom.mjs           # Ações da tela /servico/:token
├── suites/
│   ├── r1-sandbox/
│   │   └── sandbox-integrity.test.mjs   # Validação de isolamento do banco e bloqueio de rede externa
│   ├── r2-crawler/
│   │   ├── screen-catalog.mjs           # Catálogo parametrizado das 45 telas e personas
│   │   └── universal-crawler.test.mjs   # Crawler multi-viewport (100% das 45 páginas)
│   ├── r3-anti-frustration/
│   │   ├── zero-amnesia.test.mjs         # Validação de documentos mantidos de hóspede recorrente
│   │   ├── multichannel-link.test.mjs   # Vínculo automático de reservas no /minha-conta por telefone/CPF
│   │   ├── vehicle-persistence.test.mjs # Propagação íntegra de placa, marca, modelo e cor
│   │   ├── digital-lock-14h.test.mjs    # Bloqueio de fechadura antes das 14:00 e liberação destacada
│   │   ├── pix-realtime.test.mjs        # Atualização em tempo real de PIX e regeneração sob expiração
│   │   ├── mobile-upload-signature.test.mjs # Compressão WebP e assinatura sem rolagem de tela
│   │   └── companion-isolation.test.mjs # Hóspede 2 não sobrescreve Hóspede 1
│   ├── r4-pairwise/
│   │   ├── compositions-durations.test.mjs # Solo, casal, famílias com menores, lotação máxima e estadias
│   │   ├── flats-governance-19.test.mjs    # Matriz dos 19 flats sob todos os 7 estados de governança
│   │   ├── service-orders-lifecycle.test.mjs # Ciclo completo de Ordens de Serviço (admin + prestador)
│   │   └── breakfast-cutoff.test.mjs       # Regras de café da manhã e corte às 22:00
│   └── r5-chaos/
│       ├── chaos-engine.mjs             # Motor de duplo clique rápido, caracteres especiais e histórico
│       └── chaos-explorer.test.mjs      # Agente explorador autônomo e auditor de usabilidade/textos
├── reporters/
│   ├── html-report-generator.mjs        # Compilador do dashboard e2e/reports/index.html
│   └── report-template.html             # Template HTML standalone com suporte a abas, filtros e badges
└── reports/
    ├── index.html                       # Relatório consolidado com taxa de sucesso por módulo
    └── artifacts/                       # Pasta indexada contendo vídeos (.webm) e capturas (.png)
```

### 4.2 Arquitetura de Configuração do Playwright (`e2e/playwright.config.mjs`)

```javascript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './suites',
  outputDir: './reports/artifacts',
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false, // Execução controlada para integridade sequencial de estados
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['./reporters/html-report-generator.mjs', { outputFile: './reports/index.html' }]
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:4399',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    channel: 'chrome', // Usa Google Chrome nativo do host Windows
    headless: true,
  },
  projects: [
    {
      name: 'Desktop-1920',
      use: {
        viewport: { width: 1920, height: 1080 }
      }
    },
    {
      name: 'Tablet-768',
      use: {
        ...devices['iPad Mini'],
        viewport: { width: 768, height: 1024 }
      }
    },
    {
      name: 'Mobile-375',
      use: {
        ...devices['iPhone 12'],
        viewport: { width: 375, height: 812 }
      }
    }
  ]
});
```

### 4.3 Especificação dos Pacotes (`e2e/package.json`)

```json
{
  "name": "@workspace/e2e",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node runner.mjs",
    "test:crawler": "npx.cmd playwright test suites/r2-crawler",
    "test:anti-frustration": "npx.cmd playwright test suites/r3-anti-frustration",
    "test:pairwise": "npx.cmd playwright test suites/r4-pairwise",
    "test:chaos": "npx.cmd playwright test suites/r5-chaos",
    "report:open": "node -e \"import('open').then(o => o.default('reports/index.html'))\""
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0"
  }
}
```

---

## 5. Verification Method (Método de Verificação Independente)

Para que qualquer outro agente ou o orquestrador comprove de forma independente as constatações deste relatório:

1. **Verificação de Binários e Navegadores**:
   ```powershell
   node -v
   powershell -Command "(Get-Item 'C:\Program Files\Google\Chrome\Application\chrome.exe').VersionInfo.ProductVersion"
   powershell -Command "(Get-Item 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe').VersionInfo.ProductVersion"
   ```
   *Condição de invalidação*: Chrome ou Edge ausentes ou não executáveis.

2. **Verificação de Execução de Comandos**:
   ```powershell
   pnpm.cmd -v
   npm.cmd -v
   ```
   *Condição de invalidação*: Falha ao invocar os binários `.cmd`.

3. **Verificação da Contagem de Telas e Rotas**:
   Execute o script `parse-routes.mjs` criado neste relatório:
   ```powershell
   node .agents/teamwork/explorer_survey_e2e_infra/parse-routes.mjs
   ```
   *Resultado esperado*: 44 componentes catalogados no `App.tsx` + 1 componente adicional `MaidStatementPage` = 45 telas.

4. **Verificação dos Pontos de Negócio no Código**:
   - Zero Amnésia: Inspecionar `artifacts/api-server/demo-server.mjs:18074` e `artifacts/limpeza/src/pages/guest-pre-checkin.tsx:523`.
   - Vínculo Multicanal: Inspecionar `artifacts/api-server/demo-server.mjs:23559` e `artifacts/limpeza/src/pages/my-account.tsx:93`.
   - Dados Veiculares: Inspecionar `artifacts/api-server/demo-server.mjs:25366` e `artifacts/limpeza/src/pages/garage-dashboard.tsx:240`.
   - Fechadura 14h: Inspecionar `artifacts/limpeza/src/pages/guest-portal.tsx:2201`.
   - Compressão de Imagens: Inspecionar `artifacts/limpeza/src/lib/image-compression.ts:16`.

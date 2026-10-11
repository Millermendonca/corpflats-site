# Relatório de Investigação & Inventário Completo: 100% das 45 Telas, Rotas e Personas do Ecossistema CorpFlats (Guest-Flow-Manager)

## 1. Observation

Durante a varredura minuciosa e estrita do código-fonte do frontend localizado em `artifacts/limpeza/src/`, foram realizadas as seguintes observações diretas no repositório:

1. **Roteador Principal e Guards**: Em `artifacts/limpeza/src/App.tsx`:
   - Utilização da biblioteca `wouter` (`Route`, `Switch`, `useLocation`, `Router as WouterRouter`) com `base={import.meta.env.BASE_URL}`.
   - Três guards de autenticação/autorização bem definidos:
     - `AdminGuard` / `AdminRoute` (linhas 73-104): Valida `user && user.role === "admin"`. Se não autenticado, redireciona para `/login`; se não admin, renderiza `<AccessDenied moduleName={moduleName} />`.
     - `ReceptionGuard` / `ReceptionRoute` (linhas 106-137): Valida `user && (user.role === "admin" || user.role === "recepcao")`. Redireciona não autenticados para `/login` e bloqueia perfis sem acesso com `<AccessDenied />`.
     - `StaffGuard` / `StaffRoute` (linhas 139-166): Valida qualquer usuário autenticado (`user.role === "admin"`, `"recepcao"` ou `"camareira"`). Redireciona não autenticados para `/login`.
     - Rotas Públicas (`Route`, linhas 173-196, 205-226, 238, 340-341): Acesso público livre (hóspedes, prestadores e visitantes), sem necessidade de sessão interna de staff.
   - Total de arquivos presentes no diretório `artifacts/limpeza/src/pages/`: **Exatamente 46 arquivos**, sendo **45 telas/views funcionais** e 1 tela de fallback (`not-found.tsx`).

2. **Navegação Global e Responsividade**: Em `artifacts/limpeza/src/components/layout.tsx`:
   - Categorias no menu Desktop (linhas 229-299):
     - `🧹 Governança & Camareiras`
     - `💬 Central de Comunicação`
     - `📅 Reservas & Hospedagem`
     - `🧾 Gestão Fiscal & NFS-e`
     - `💰 Financeiro & Vendas`
     - `🏨 Propriedade & Regras`
     - `⚙️ Sistema & Integrações`
   - Mobile Header fixo (`md:hidden sticky top-0`, linhas 322-431) com logo, sininho de alertas com badge e botão para abrir a gaveta lateral.
   - Mobile Bottom Navigation Bar (`md:hidden fixed bottom-0 left-0 right-0 z-40`, linhas 549-667) com 5 atalhos principais diferenciados por persona (Admin vs Camareira).
   - Mobile Drawer Lateral deslizante (`w-4/5 max-w-sm`, linhas 670-795) com campo de busca em tempo real (`Search Input`) para encontrar instantaneamente qualquer módulo do sistema.

3. **Elementos de Alta Interatividade & Regras Específicas**:
   - **Assinatura Digital em Canvas**: Em `artifacts/limpeza/src/pages/guest-pre-checkin.tsx` (linhas 2825-2860), elemento `<canvas ref={canvasRef}>` com handlers de toque (`onTouchStart`, `onTouchMove`, `onTouchEnd`), prevenção de rolagem involuntária de tela no celular e conversão para PNG Base64 com carimbo SHA-256 e QR Code.
   - **Persistência Completa de Veículos**: Campos `placa` (máscara Mercosul), `marca`, `modelo` e `cor` mapeados em `guest-pre-checkin.tsx`, `guest-portal.tsx`, `my-account.tsx`, `garage-dashboard.tsx`, `pms-calendar.tsx`, `reception-tablet.tsx` e `booking-funnel-modal.tsx`.
   - **Gestão de Fechadura Digital & Horários**: Em `artifacts/limpeza/src/pages/guest-portal.tsx` (linhas 2201-2241), o código de acesso (`accessCode`) da fechadura digital é mantido oculto até o horário oficial de check-in (14:00 ou 12:00 antecipado limpo) e liberado apenas após a reserva estar paga (`accessCode && isPaid`), com mensagem amigável quando o flat estiver em limpeza ("Apartamento em Preparação & Higienização 🧹").
   - **Seleção e Produção de Café da Manhã**: Em `guest-breakfast.tsx` (portal do hóspede com suporte a múltiplos hóspedes, escolhas padrão vs personalizadas, frutas, bebidas, pães, restrições e trava rígida às 22:00 para o dia seguinte) e `breakfast-production.tsx` (painel da cozinha com abas de pedidos do dia/amanhã, histórico, insights e fichas técnicas).
   - **Portal Público do Prestador de Serviço**: Em `service-worker-portal.tsx` e painel admin em `service-orders.tsx`, gerenciando token público de 24 caracteres hexadecimais, cadastro de colaboradores e início/conclusão de serviços com upload de fotos comprimidas.

---

## 2. Logic Chain

A dedução e validação do inventário exaustivo seguiram a cadeia lógica:

1. **Premissa de Escopo**: O sistema Guest-Flow-Manager (CorpFlats) foi projetado para operar com 5 personas fundamentais (Admin, Portaria/Recepção, Camareira/Staff, Hóspede e Prestador Externo).
2. **Confirmação Arquitetural**: A varredura de `artifacts/limpeza/src/pages/` revelou exatamente 46 componentes de página. Descontando o componente `not-found.tsx` (página de erro 404), restam precisamente as **45 telas funcionais** estipuladas na especificação de testes sintéticos E2E (`R2: Varredura Universal de Telas & Sanidade - 100% das 45 Telas`).
3. **Mapeamento de Rotas e Aliases**: No `App.tsx`, múltiplas rotas convergem para componentes centrais (ex: `/reservar` e `/booking` apontam para `BookingEngine`; `/portaria` e `/tablet` apontam para `ReceptionTablet`; `/servicos` e `/service-orders` apontam para `ServiceOrders`). O crawler sintético deve conhecer tanto a rota canônica primária quanto todos os aliases.
4. **Matriz de Responsividade**: O layout baseia-se em Tailwind CSS com breakpoints padronizados: Mobile (`375px` - viewport de smartphone comum com bottom bar e drawer), Tablet (`768px` - breakpoint `md:` onde o bottom bar é substituído pela barra lateral e orientação horizontal prevalece) e Desktop (`1920px` - telas full HD/4K com grids multi-colunas de 3 a 5 cards e timeline extendida).
5. **Classificação das 45 Telas**: Para viabilizar a navegação automatizada determinística, cada uma das 45 telas foi estruturada com seus atributos vitais: Nome da Tela, Componente Arquivo, Rotas & Aliases, Persona / Nível de Acesso, Finalidade de Negócio, Elementos Interativos Críticos e Requisitos de Responsividade.

---

## 3. Matriz Completa e Exaustiva das 45 Telas (Inventário E2E)

### GRUPO 1: GOVERNANÇA & CAMAREIRAS (STAFF)

#### 1. Dashboard de Governança / Painel de Limpeza
- **Arquivo**: `artifacts/limpeza/src/pages/dashboard.tsx`
- **Rotas**: `/dashboard`
- **Persona / Guard**: `Camareira (Staff)` / `Admin` (`StaffRoute`)
- **Finalidade**: Gestão operacional dos 19 flats do hotel, acompanhando quartos sujos, em limpeza, limpos, ocupados e saídas previstas.
- **Elementos Interativos**:
  - Seletor de data (Hoje, Ontem, Amanhã, Seletor de Calendário).
  - Cards de Flats (`FlatCard`) com foto, hóspede de saída/entrada e status.
  - Botão "Vou Limpar" (Assumir Limpeza).
  - Botão "Iniciar Limpeza" / "Finalizar Limpeza".
  - Badge de bloqueio "🔧 Serviço em andamento" quando houver ordem de serviço ativa.
  - Filtro por status e camareira.
  - Dialog de atribuição de limpeza em lote (`useBatchClaimFlats`).
  - Dialog de atraso / reabertura de quarto.
- **Responsividade**:
  - *Mobile (375px)*: Cards empilhados em 1 coluna vertical com botões touch largos; bottom bar fixa visível.
  - *Tablet (768px)*: Grid de 2 colunas (`sm:grid-cols-2`).
  - *Desktop (1920px)*: Grid de 3 a 4 colunas (`lg:grid-cols-3 xl:grid-cols-4`).

#### 2. Tarefas Preventivas & Rotinas Periódicas
- **Arquivo**: `artifacts/limpeza/src/pages/tasks.tsx`
- **Rotas**: `/tasks`, `/tarefas`
- **Persona / Guard**: `Camareira (Staff)` / `Admin` (`StaffRoute`)
- **Finalidade**: Controle e execução de manutenções preventivas (troca de filtros de ar, dedetização, higienização de cortinas).
- **Elementos Interativos**:
  - Tabs: Tarefas Pendentes vs Recorrentes Cadastradas.
  - Dialog `TaskFormDialog` com campos: Nome, Descrição, Periodicidade (Presets: 7, 15, 30, 60, 90, 180, 365 dias), Tipo de contagem (dias corridos vs dias ocupados).
  - Grid de checkboxes para seleção múltipla dos 19 flats.
  - Botão de execução rápida com data e responsável.
  - Botões de editar e excluir tarefa.
- **Responsividade**:
  - *Mobile (375px)*: Lista em cartões verticais com botões de ação compactos.
  - *Tablet (768px)*: Tabela responsiva com rolagem suave.
  - *Desktop (1920px)*: Grid de alta densidade com métricas de cumprimento.

#### 3. Ocorrências & Avarias
- **Arquivo**: `artifacts/limpeza/src/pages/observations.tsx`
- **Rotas**: `/observations`, `/ocorrencias`, `/avarias`
- **Persona / Guard**: `Camareira (Staff)` / `Admin` (`StaffRoute`)
- **Finalidade**: Relato e resolução de defeitos, danos a mobília ou avarias identificadas durante a rotina de governança.
- **Elementos Interativos**:
  - Cards de ocorrência com identificação do flat, categoria (`defeito`, `manutencao`, `outro`) e autor.
  - Botão "Nova Ocorrência" abrindo Dialog com select de flat, categoria e textarea de descrição.
  - Botão "Resolver Ocorrência" com registro de resolução.
  - Filtros de status (Pendentes vs Resolvidas).
- **Responsividade**:
  - *Mobile (375px)*: Cards com badges de severidade em destaque; botão flutuante/topo.
  - *Tablet (768px)*: Grid de 2 colunas.
  - *Desktop (1920px)*: Grid de 3 colunas com timeline de histórico.

#### 4. Achados & Perdidos
- **Arquivo**: `artifacts/limpeza/src/pages/lost-and-found.tsx`
- **Rotas**: `/achados-perdidos`, `/achados`, `/lost-and-found`
- **Persona / Guard**: `Camareira (Staff)` / `Admin` (`StaffRoute`)
- **Finalidade**: Inventário, custódia e devolução de itens esquecidos por hóspedes nos apartamentos.
- **Elementos Interativos**:
  - Campo de busca por item, hóspede ou flat.
  - Botão "Cadastrar Item" abrindo Dialog com campos: Flat, Descrição, Local no Quarto, Notas.
  - Upload de foto com compressão automática via canvas HTML5 no navegador.
  - Vínculo automático com o último hóspede registrado (Nome, Telefone, Check-out).
  - Botão "Contatar Hóspede via WhatsApp".
  - Seletor de status: `guardado`, `devolvido`, `descartado`.
- **Responsividade**:
  - *Mobile (375px)*: Captura direta de foto pela câmera do celular; compressão local imediata.
  - *Tablet (768px)*: Tabela com miniatura de fotos e modal lightbox.
  - *Desktop (1920px)*: Galeria em grid visual com filtros avançados.

#### 5. Histórico de Limpezas
- **Arquivo**: `artifacts/limpeza/src/pages/history.tsx`
- **Rotas**: `/history`, `/historico`
- **Persona / Guard**: `Camareira (Staff)` / `Admin` (`StaffRoute`)
- **Finalidade**: Auditoria temporal de todas as limpezas executadas no hotel.
- **Elementos Interativos**:
  - Filtro de período com inputs de Data Inicial e Data Final.
  - Linhas de histórico com flat, camareira responsável, horário de início, horário de término, duração e status final.
- **Responsividade**:
  - *Mobile (375px)*: Cards compactos em formato timeline.
  - *Tablet (768px)*: Tabela com ordenação por coluna.
  - *Desktop (1920px)*: Tabela detalhada em tela cheia com métricas de tempo médio.

#### 6. Lista de Compras de Insumos
- **Arquivo**: `artifacts/limpeza/src/pages/shopping-list.tsx`
- **Rotas**: `/lista-compras`, `/compras`
- **Persona / Guard**: `Camareira (Staff)` / `Admin` (`StaffRoute`)
- **Finalidade**: Reposição de materiais de limpeza, insumos de enxoval e compras de supermercado para governança.
- **Elementos Interativos**:
  - Input rápido com auto-complete inteligente baseado em catálogo histórico.
  - Seletor de categoria (Alimentos, Carnes, Limpeza, Bebidas, etc.).
  - Checkbox interativo para marcar item como comprado / concluído.
  - Drag-and-drop / Reordenação manual de prioridade (`sortOrder`).
  - Badge de itens pendentes refletido no layout global.
  - Ações de editar e excluir item com confirmação toast.
- **Responsividade**:
  - *Mobile (375px)*: Otimizado para uso no supermercado pelo celular (linhas com checkboxes táteis grandes).
  - *Tablet (768px)*: Visualização em lista categorizada com badges coloridos.
  - *Desktop (1920px)*: Gestão em duas colunas (pendentes vs concluídos recentes).

#### 7. Fechamento Quinzenal & Relatórios de Diárias
- **Arquivo**: `artifacts/limpeza/src/pages/reports.tsx`
- **Rotas**: `/reports`, `/relatorios`, `/fechamento`, `/fechamento-limpeza`
- **Persona / Guard**: `Camareira (Staff)` / `Admin` (`StaffRoute`)
- **Finalidade**: Fechamento quinzenal de diárias das camareiras, prestação de contas e impressão de recibos oficiais A4.
- **Elementos Interativos**:
  - Tabs: Fechamento Quinzenal (`payroll`), Extrato em Tempo Real (`statement`), Histórico (`history`).
  - Seletor rápido de quinzena (1ª Quinzena, 2ª Quinzena, Mês Completo, Período Personalizado).
  - Gráficos de barra Recharts com limpezas por dia e por camareira.
  - Botão "Imprimir Recibo Executivo A4" (`printReceiptWindow`) com assinatura formal e protocolo.
  - Registro de adiantamentos/vales e quitação de pagamentos PIX.
- **Responsividade**:
  - *Mobile (375px)*: Resumo financeiro em cards de saldo; tabelas com scroll horizontal.
  - *Tablet (768px)*: Gráficos adaptados em 100% da largura.
  - *Desktop (1920px)*: Layout executivo multi-cards com painel de métricas e exportação para impressão.

#### 8. Extrato Financeiro Individual da Camareira
- **Arquivo**: `artifacts/limpeza/src/pages/maid-statement.tsx`
- **Rotas**: `/extrato`, `/meu-extrato`, `/extrato-camareiras` (vinculada via rotas de extrato)
- **Persona / Guard**: `Camareira (Staff)` / `Admin` (`StaffRoute`)
- **Finalidade**: Consulta em tempo real do saldo a receber pela camareira por quarto limpo, créditos, débitos e PIX.
- **Elementos Interativos**:
  - Card de Saldo Atual com badge de chave PIX cadastrada.
  - Timeline de lançamentos (Créditos por faxina finalizada vs Débitos por adiantamento).
  - Botão de envio de extrato via WhatsApp.
  - Dialog de detalhes de pagamento bancário (Inter TxID, status de liquidação).
  - Botão de cópia de chave PIX e protocolo.
- **Responsividade**:
  - *Mobile (375px)*: Interface estilo extrato bancário móvel (FinTech UI) com cartões de crédito/débito destacados.
  - *Tablet / Desktop (768px-1920px)*: Visão detalhada de extrato com filtros por período.

---

### GRUPO 2: PORTARIA, RECEPÇÃO & OPERAÇÃO PRESENCIAL

#### 9. Terminal da Portaria (Tablet 24h)
- **Arquivo**: `artifacts/limpeza/src/pages/reception-tablet.tsx`
- **Rotas**: `/portaria`, `/tablet`
- **Persona / Guard**: `Portaria / Recepção` / `Admin` (`ReceptionRoute`)
- **Finalidade**: Terminal de controle presencial para a recepção e guarita do condomínio Soho, liberando hóspedes e inspecionando documentos.
- **Elementos Interativos**:
  - Tabs: Chegadas de Hoje (`arrivals`), Hóspedes no Hotel (`inHouse`), Check-ins Concluídos (`completed`).
  - Cards de hóspede com número do flat, status de pré-check-in FNRH e status de limpeza do quarto.
  - Badge de Veículo Autorizado com Placa, Marca, Modelo e Cor.
  - Botão "Liberar Check-in" (com aviso bloqueante caso o quarto ainda esteja em limpeza).
  - Dialog de Liberação Forçada de Quarto em Limpeza.
  - Botão "Ver Ficha FNRH" abrindo modal com visualizador PDF (`PdfPreview`) ou aba de dados brutos.
  - Lightbox com zoom de fotos de documento (RG/CNH frente/verso) e selfie do hóspede.
  - Botão "Reenviar Link WhatsApp" e "Copiar Link de Check-in" (resolvido dinamicamente via `getCheckinUrl`).
- **Responsividade**:
  - *Mobile (375px)*: Lista vertical com botões grandes de liberação rápida.
  - *Tablet (768px)*: **Viewport Primário de Design** (Otimizado especificamente para iPad / Tablets em suporte na bancada da recepção).
  - *Desktop (1920px)*: Grid expandido de alta capacidade de atendimento.

#### 10. Checkout Rápido da Recepção
- **Arquivo**: `artifacts/limpeza/src/pages/reception-checkout.tsx`
- **Rotas**: `/recepcao`, `/reception`
- **Persona / Guard**: `Portaria / Recepção` / `Admin` (`ReceptionRoute`)
- **Finalidade**: Registro relâmpago de devolução de chave pelo porteiro/recepcionista, sinalizando imediatamente o quarto como "Sujo" no painel da governança.
- **Elementos Interativos**:
  - Input com auto-foco imediato para digitação do número do flat.
  - Submissão com tecla `Enter` ou botão "Confirmar Check-out".
  - Lista de checkouts recentes da sessão com flat e horário exato.
  - Mensagem de sucesso com limpeza disparada em tempo real.
- **Responsividade**:
  - *Mobile (375px)*: Formulário centralizado minimalista em modo escuro de alto contraste.
  - *Tablet / Desktop (768px-1920px)*: Centralizado com histórico lateral.

#### 11. Controle de Garagem & Vagas Rotativas
- **Arquivo**: `artifacts/limpeza/src/pages/garage-dashboard.tsx`
- **Rotas**: `/garagem`, `/estacionamento`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Gestão de veículos autorizados no estacionamento rotativo do Edifício Soho e envio formal de autorização para a guarita.
- **Elementos Interativos**:
  - Tabela de veículos ativos: Placa, Marca, Modelo, Cor, Flat, Hóspede e Período de Estadia.
  - Botão "Reenviar Autorização por E-mail" para `millerpessanha@gmail.com`.
  - Botão "Copiar Dados da Placa".
  - Botão "Cadastrar Veículo Manual" abrindo Dialog com inputs de placa, marca, modelo, cor, flat e datas.
- **Responsividade**:
  - *Mobile (375px)*: Cartões de veículos com badge da placa em destaque.
  - *Tablet / Desktop (768px-1920px)*: Tabela completa com status de disparo de e-mail.

#### 12. Painel Operacional Ao Vivo (Live Ops Command Center)
- **Arquivo**: `artifacts/limpeza/src/pages/live-operations-panel.tsx`
- **Rotas**: `/painel-aovivo`, `/live-ops`, `/aovivo`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Dashboard de monitoramento em tempo real (painel de parede/TV ou gerência) com atualização automática a cada 5 segundos.
- **Elementos Interativos**:
  - Botão de alternar Tela Cheia (`Fullscreen Toggle`).
  - Relógio digital de alta precisão.
  - Indicadores em tempo real: Taxa de Ocupação, Quartos Limpos vs Sujos, Chegadas Previstas com horários, Pedidos de Café da Manhã e Avarias Críticas.
- **Responsividade**:
  - *Mobile (375px)*: Pilha de cartões com polling dinâmico.
  - *Tablet (768px)*: Grade 2x2.
  - *Desktop (1920px)*: **Viewport Primário de Design** (Layout de sala de comando em alta resolução com grids balanceados).

---

### GRUPO 3: HÓSPEDE & CANAIS PÚBLICOS

#### 13. Motor de Reservas Diretas & Catálogo
- **Arquivo**: `artifacts/limpeza/src/pages/booking-engine.tsx`
- **Rotas**: `/reservar`, `/booking`, `/` (redirecionamento canônico)
- **Persona / Guard**: `Hóspede` / `Público Geral` (Rota Pública)
- **Finalidade**: Venda direta de estadias sem comissões de OTAs, com motor de busca de disponibilidade, catálogo dos flats e cálculo de tarifas.
- **Elementos Interativos**:
  - Widget de busca: Check-in, Check-out, Hóspedes e Quartos.
  - Cards dos 19 flats com carrossel de fotos, tags de comodidades, capacidade máxima e preço total com descontos.
  - Modal do Funil de Reservas (`BookingFunnelModal`) em 4 etapas:
    1. Composição de datas e hóspedes.
    2. Opcionais (Café da manhã, Vaga de garagem, Cama extra, Pet).
    3. Identificação do hóspede (Nome, CPF, E-mail, WhatsApp, Placa do Carro).
    4. Pagamento instantâneo por PIX com QR Code dinâmico, código copia-e-cola, cronômetro de expiração e polling de confirmação.
  - Integração com Google One Tap / Login Social via `AuthModal`.
  - Seções de comodidades, localização com mapa interativo, regras da casa e FAQs.
- **Responsividade**:
  - *Mobile (375px)*: Motor de busca em formato gaveta retrátil; cards de fotos com gestos de toque; funil em modal de tela cheia.
  - *Tablet (768px)*: Grid de flats em 2 colunas.
  - *Desktop (1920px)*: Layout sofisticado com hero banner, galeria rica e funil centralizado.

#### 14. Portal Minha Conta do Hóspede
- **Arquivo**: `artifacts/limpeza/src/pages/my-account.tsx`
- **Rotas**: `/minha-conta`, `/minhaconta`, `/perfil`, `/my-account`
- **Persona / Guard**: `Hóspede` (Rota Pública com autenticação local do cliente)
- **Finalidade**: Área logada do hóspede para auto-gerenciamento de perfil, acompanhamento de estadias, veículos e segurança da conta.
- **Elementos Interativos**:
  - Tabs: Dados Cadastrais (`profile`), Minhas Reservas (`reservations`), Segurança (`security`).
  - Formulário cadastral com busca automática de CEP via ViaCEP, dados PJ de faturamento.
  - Cadastro de Veículo: Placa, Marca, Modelo e Cor.
  - Lista de reservas passadas e futuras com atalhos para voucher, adicionar ao calendário (`AddToCalendar`) e portal do flat.
  - Aba de Segurança: Alterar senha, Registro de biometria / Passkeys WebAuthn, Exportar dados pessoais (LGPD) e Excluir conta.
- **Responsividade**:
  - *Mobile (375px)*: Formulário em coluna única com tabs horizontais roláveis.
  - *Tablet / Desktop (768px-1920px)*: Painel de duas colunas com navegação lateral e cartões organizados.

#### 15. Pré-Check-in Digital com FNRH Oficial
- **Arquivo**: `artifacts/limpeza/src/pages/guest-pre-checkin.tsx`
- **Rotas**: `/pre-checkin/:code`, `/pre-checkin`
- **Persona / Guard**: `Hóspede` (Rota Pública com validação de código de reserva)
- **Finalidade**: Preenchimento antecipado obrigatório da Ficha Nacional de Registro de Hóspedes (Ministério do Turismo / EMBRATUR), anexo de documentos e assinatura digital.
- **Elementos Interativos**:
  - Navegador de etapas (Steps 1 a 5).
  - Step 1: Dados pessoais completos com validação de data de nascimento, CPF e busca de CEP.
  - Step 2: Hóspedes adicionais / acompanhantes e regras para menores de idade (ECA Art. 82).
  - Step 3: Fotos de documento (RG ou CNH frente e verso) e Selfie segurando o documento, com compressão local via canvas.
  - Step 4: Cadastro veicular (Placa, Marca, Modelo, Cor) com aviso de liberação na garagem Soho.
  - Step 5: **Canvas de Assinatura Digital** (`<canvas ref={canvasRef}>`) com touch support, botão de limpar assinatura, aceite legal dos termos de hospedagem e termo de responsabilidade LGPD.
  - Geração de protocolo FNRH com hash SHA-256 e selo de conformidade com QR Code.
  - Mecanismo "Zero Amnésia": hóspede recorrente tem seus dados e fotos carregados automaticamente sem novo upload.
- **Responsividade**:
  - *Mobile (375px)*: **Viewport Crítico** — Assinatura em canvas bloqueia rolagem da página (`touch-action: none`) para permitir traço fluído com o dedo; câmera abre diretamente pelo navegador.
  - *Tablet / Desktop (768px-1920px)*: Visualizador em card centralizado estilo documento executivo.

#### 16. Portal do Hóspede (Minha Reserva & Acesso Digital)
- **Arquivo**: `artifacts/limpeza/src/pages/guest-portal.tsx`
- **Rotas**: `/minha-reserva/:code`, `/minha-reserva`, `/portal-hospede/:code`, `/portal-hospede`, `/guest-portal/:code`, `/guest-portal`, `/pix/:code`, `/copiar-pix/:code`
- **Persona / Guard**: `Hóspede` (Rota Pública)
- **Finalidade**: Hub digital central do hóspede durante toda a sua estadia, contendo chave da fechadura, PIX, Wi-Fi, garagem e serviços.
- **Elementos Interativos**:
  - Card de Pagamento PIX com QR code dinâmico, código de cópia, confirmação em tempo real e alternância para cartão.
  - Card de Fechadura Digital / Portaria: Exibe código de acesso somente após pagamento e a partir das 14:00 (ou 12:00 com quarto limpo), com botão de copiar senha e aviso amigável se em higienização.
  - Seletor de Previsão de Chegada no dia da estadia para priorizar a governança.
  - Card de Wi-Fi com nome da rede e senha copiáveis com 1 clique.
  - Card de Veículo / Garagem para cadastro e alteração de placa.
  - Acesso ao Pedido de Café da Manhã e repetição de pedidos favoritos.
  - Modal de Modificação de Reserva (alterar datas e hóspedes).
  - Modal de Cancelamento Self-Service com cálculo de políticas de reembolso.
  - Botão de envio de voucher por WhatsApp e download de comprovante.
- **Responsividade**:
  - *Mobile (375px)*: **Viewport Mais Usado pelos Hóspedes** (Acesso no celular durante a viagem); botões touch generosos, cards com hierarquia clara e zero rolagem horizontal.
  - *Tablet / Desktop (768px-1920px)*: Painel centralizado elegante com cards informativos.

#### 17. Pedido de Café da Manhã do Hóspede
- **Arquivo**: `artifacts/limpeza/src/pages/guest-breakfast.tsx`
- **Rotas**: `/cafe/:code`, `/cafe`, `/cafe-da-manha/:code`, `/cafe-da-manha`, `/breakfast/:code`, `/breakfast`, `/minha-reserva/:code/cafe`, `/portal-hospede/:code/cafe`
- **Persona / Guard**: `Hóspede` (Rota Pública)
- **Finalidade**: Montagem e agendamento do pedido de café da manhã servido no quarto pelo room service.
- **Elementos Interativos**:
  - Identificação de quarto e hóspedes (1, 2 ou 3 hóspedes).
  - Data de entrega e seletor de horário de entrega (`deliveryTime` em slots de 15 min entre 07:00 e 10:00).
  - Toggle entre Pedido Padrão ("standard") vs Personalizado ("custom").
  - Toggle de distribuição: O mesmo para todos ("same_for_all") vs Individual por hóspede ("individual").
  - Abas individuais para personalização de cada hóspede: Pães, Bebidas Quentes, Sucos, Acompanhamentos (queijo, ovos, presunto), Complementos (manteiga, mel), Frutas, Bolos/Doces e Adoçante.
  - Textarea de restrições alimentares e observações.
  - Checkboxes para repetição automática do pedido nos demais dias da estadia.
  - **Validação de Curfew**: Bloqueio de pedidos após as 22:00 para a manhã do dia seguinte.
  - Confirmação com protocolo de pedido e botão de envio para o WhatsApp do hotel.
- **Responsividade**:
  - *Mobile (375px)*: Abas tácteis por hóspede com checkboxes de itens em formato pílula; rolagem suave.
  - *Tablet / Desktop (768px-1920px)*: Grid balanceado com resumo do pedido fixo lateralmente.

#### 18. Auto-Checkout do Hóspede
- **Arquivo**: `artifacts/limpeza/src/pages/guest-checkout.tsx`
- **Rotas**: `/checkout/:code`, `/checkout`, `/check-out/:code`, `/check-out`, `/saida/:code`, `/saida`, `/minha-reserva/:code/checkout`, `/portal-hospede/:code/checkout`
- **Persona / Guard**: `Hóspede` (Rota Pública)
- **Finalidade**: Confirmação autônoma de saída pelo próprio hóspede ao desocupar o flat.
- **Elementos Interativos**:
  - Checklist de despedida: Desligar ar-condicionado, fechar janelas, deixar chave/cartão na bancada e encostar a porta.
  - Botão de confirmação de saída ("Confirmar Check-out").
  - Notificação instantânea para a governança liberando o quarto para limpeza.
  - Redirecionamento para a pesquisa de satisfação e agradecimento.
- **Responsividade**:
  - *Mobile (375px)*: Fluxo rápido de 1 tela no smartphone.
  - *Tablet / Desktop (768px-1920px)*: Card centralizado.

#### 19. Verificação Pública de Autenticidade FNRH
- **Arquivo**: `artifacts/limpeza/src/pages/verify-fnrh.tsx`
- **Rotas**: `/verificar-ficha/:uuid`, `/verificar-ficha`
- **Persona / Guard**: `Público Geral` / `Fiscalização` / `Auditoria` (Rota Pública)
- **Finalidade**: Consulta pública da autenticidade da ficha de pré-check-in digital gerada pelo hotel, acessada via escaneamento do QR Code impresso no documento.
- **Elementos Interativos**:
  - Badge de validação criptográfica (Válido / Inválido).
  - Exibição dos dados auditados: Hóspede, CPF/Documento mascarado, Apartamento, Período de Estadia, Carimbo de Data/Hora UTC e Assinatura Digital.
  - Hash SHA-256 com botão de copiar para conferência independente.
  - Botão de download do PDF oficial da ficha.
- **Responsividade**:
  - *Mobile (375px)*: Layout responsivo otimizado para abertura imediata após leitura do QR Code pela câmera.
  - *Tablet / Desktop (768px-1920px)*: Certificado visual centralizado.

#### 20. Portal do Prestador de Serviços Externos
- **Arquivo**: `artifacts/limpeza/src/pages/service-worker-portal.tsx`
- **Rotas**: `/servico/:token`, `/service/:token`
- **Persona / Guard**: `Prestador de Serviço Externo` (Rota Pública protegida por token criptográfico de 24 hex chars)
- **Finalidade**: Portal móvel utilizado por pintores, eletricistas, encanadores e prestadores externos contratados para atuar nos flats.
- **Elementos Interativos**:
  - Banner superior de identificação: Nome completo e CPF do prestador titular + cadastro de colaboradores da equipe com botão salvar.
  - Cards de Flats atribuídos: Número do flat, status de ocupação (Ocupado / Sujo Pós-checkout / Vago Limpo), instruções de serviço (texto ou lista) e status atual.
  - Botão de Ação dinâmico: "Iniciar Serviço" / "Bloqueado" (com motivo explicativo: limite simultâneo atingido, limite diário ou regra de flat limpo) / "Em Andamento" / "Finalizado".
  - Modal Bloqueante: Alerta se tentar iniciar serviço sem identificação prévia de CPF.
  - Modal de Finalização: Aviso de limpeza, pergunta obrigatória se precisa de camareira caso o flat estivesse limpo ("Precisa de camareira para finalizar?"), textarea de observações técnicas e upload de fotos comprobatórias com compressão no navegador (obrigatório se `requirePhotos: true`).
- **Responsividade**:
  - *Mobile (375px)*: **Viewport Crítico** — Desenvolvido especificamente para uso no canteiro de trabalho por operários em celulares modestos; upload de fotos resiliente e botões de grande contraste.
  - *Tablet / Desktop (768px-1920px)*: Lista organizada com pré-visualização de imagens.

#### 21. Tela de Login Staff
- **Arquivo**: `artifacts/limpeza/src/pages/login.tsx`
- **Rotas**: `/login`
- **Persona / Guard**: `Staff Interno` (Admin, Recepção, Camareiras) (Rota Pública de Autenticação)
- **Finalidade**: Ponto de entrada de credenciais para todos os operadores internos do sistema.
- **Elementos Interativos**:
  - Campos: Nome de Usuário e Senha.
  - Mensagem de erro em caso de credenciais inválidas.
  - Botão "Entrar no Sistema".
  - Inteligência de redirecionamento de turno: Se autenticado após as 18:00, redireciona o painel de governança já para o dia seguinte (`/dashboard?date=AMANHÃ`).
- **Responsividade**:
  - *Mobile (375px)*: Card centralizado em tela cheia com inputs ergonômicos.
  - *Tablet / Desktop (768px-1920px)*: Card elegante flutuante.

---

### GRUPO 4: GESTÃO HOTELEIRA, PMS & RESERVAS (ADMIN)

#### 22. Livro de Reservas PMS & Mapa de Ocupação
- **Arquivo**: `artifacts/limpeza/src/pages/pms-calendar.tsx`
- **Rotas**: `/reservas`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Sistema central de gerenciamento hoteleiro (Property Management System), mapa visual em grade com todos os 19 flats e histórico de reservas.
- **Elementos Interativos**:
  - Timeline interativa (Grade de flats no eixo Y e datas no eixo X com navegação mensal e semanal).
  - Blocos de reservas com cores por canal (Site Próprio, WhatsApp, Booking.com, Airbnb, Bloqueio de Manutenção, Ordem de Serviço).
  - Hover Card (`ReservationHoverCard`) com pré-visualização de hóspede, datas, valor e status de governança.
  - Drawer / Modal Completo da Reserva:
    - Edição de datas, número do flat e canal de venda.
    - Extrato financeiro da estadia (diárias, taxa de limpeza, pet, cama extra, café).
    - Conciliação de pagamentos com botão de baixa manual ou PIX.
    - Acesso à FNRH e links de check-in (`getCheckinUrl`).
    - Dados do veículo (Placa, Marca, Modelo, Cor) com disparo de e-mail para a garagem.
    - Código da fechadura digital.
    - Mensagens rápidas pré-formatadas para envio direto ao WhatsApp do hóspede.
  - Botão "Nova Reserva" para inclusão manual de estadias.
  - Bloqueio de manutenção com bloqueio de calendário PMS.
- **Responsividade**:
  - *Mobile (375px)*: Timeline com rolagem horizontal suave e visualização diária simplificada.
  - *Tablet (768px)*: Timeline com zoom de visualização por quinzena.
  - *Desktop (1920px)*: **Viewport Primário de Design** (Visão panorâmica de 30 dias de todos os 19 apartamentos com scroll suave).

#### 23. Relatórios & Métricas de Ocupação PMS
- **Arquivo**: `artifacts/limpeza/src/pages/pms-reports.tsx`
- **Rotas**: `/relatorios-reservas`, `/relatorio-reservas`, `/pms-reports`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Inteligência de negócio hoteleiro, taxa de ocupação, diária média (ADR), receita total e RevPAR.
- **Elementos Interativos**:
  - Cards de KPIs principais (Ocupação %, RevPAR, Diária Média R$, Receita Total, Noites Vendidas).
  - Filtros rápidos de data: "Este Mês", "Mês Passado", "Últimos 30 Dias", "Últimos 90 Dias" e período customizado.
  - Tabs: Ocupação por Apartamento, Desempenho por Canal de Venda (OTAs vs Venda Direta), Gráficos de Evolução Diária.
  - Botão de exportação e impressão de relatório executivo.
- **Responsividade**:
  - *Mobile (375px)*: Cards de métricas empilhados verticalmente.
  - *Tablet (768px)*: Gráficos adaptados e grade de 2 colunas.
  - *Desktop (1920px)*: Painel analítico executivo em grade completa.

#### 24. CRM 360º de Hóspedes & Empresas
- **Arquivo**: `artifacts/limpeza/src/pages/crm-guests.tsx`
- **Rotas**: `/crm`, `/guests`, `/hospedes`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Base de relacionamento com clientes, histórico de consumo, LTV (Lifetime Value), fidelidade e contratos corporativos PJ.
- **Elementos Interativos**:
  - Tabs: Hóspedes Individuais (`guests`) vs Empresas Parceiras (`companies`).
  - Campo de busca em tempo real com filtros por tag (VIP, Corporativo, Recorrente, Pet, etc.).
  - Cards de hóspedes com total gasto, número de estadias e status documental.
  - Modal 360º de Detalhes do Hóspede:
    - Histórico de todas as reservas já realizadas.
    - Preferências pessoais (tipo de cama, travesseiro, andar, restrições).
    - Veículos vinculados (histórico de placas).
    - Galeria documental arquivada: Fotos de RG/CNH, selfie com documento e assinatura digital, com visualizador Lightbox e download em PDF.
  - Modal de Criação / Edição de Hóspede e Cadastro de Empresa PJ para faturamento.
- **Responsividade**:
  - *Mobile (375px)*: Lista em cartões verticais com botões de chamada e WhatsApp.
  - *Tablet / Desktop (768px-1920px)*: Grid visual com gaveta lateral de detalhes 360º.

#### 25. Vistorias de Saída & Checklists de Apartamento
- **Arquivo**: `artifacts/limpeza/src/pages/surveys.tsx`
- **Rotas**: `/surveys`, `/vistorias`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Criação de formulários de vistoria de saída pós-checkout e conferência de itens do enxoval e mobília.
- **Elementos Interativos**:
  - Editor visual de vistorias: criação de perguntas com tipos dinâmicos (Sim/Não, Escolha Única, Múltipla Escolha, Escala de Avaliação 1-5, Texto Livre, Foto com exigência condicional).
  - Vínculo de vistoria com flats específicos.
  - Visualização de vistorias preenchidas com galeria de fotos de evidência enviadas pela governança.
  - Ativação / Desativação de formulários em tempo real.
- **Responsividade**:
  - *Mobile (375px)*: Editor com formulários empilhados; visualização de resposta com fotos em grade.
  - *Tablet / Desktop (768px-1920px)*: Painel dividido entre construtor de questionários e histórico de inspeções.

#### 26. Gestão de Ordens de Serviço Externas
- **Arquivo**: `artifacts/limpeza/src/pages/service-orders.tsx`
- **Rotas**: `/servicos`, `/service-orders`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Gestão completa de prestadores de serviços externos (pintores, eletricistas), criação de ordens e acompanhamento em tempo real.
- **Elementos Interativos**:
  - **Aba 1 (Lista de Ordens)**: Cards com título, token, link público copiável, barra de progresso (X/Y flats concluídos), status badge e botões "Novo Serviço", "Ver Progresso", "Editar" e "Encerrar".
  - **Aba 2 (Criar / Editar Serviço)**:
    - Campo Título.
    - Toggle `cleanFlatMode` com 3 opções detalhadas: "Nunca permitir flat limpo", "Apenas se não houver sujo", "Sempre liberar com prioridade".
    - Inputs numéricos: Máximo de flats simultâneos e máximo de flats por dia.
    - Toggle de obrigatoriedade de fotos (`requirePhotos`).
    - Duração prevista em horas por flat.
    - Grid de seleção com os 19 flats ativos.
    - Instruções gerais ("aplicar a todos") ou personalizadas por flat, com seletor de formato (texto corrido vs lista de itens).
  - **Aba 3 (Painel de Acompanhamento em Tempo Real)**:
    - Tabela viva com colunas: Flat, Status, Prestador Identificado, Início, Fim, Necessidade de Camareira, Observações e Fotos.
    - Filtro por status de flat (Pendente, Em Andamento, Concluído).
    - Modal de inspeção detalhada de fotos e observações técnicas.
    - Botão de reabertura de flat para "Pendente" pelo administrador.
- **Responsividade**:
  - *Mobile (375px)*: Cards com barra de progresso visual; tabela convertida em blocos informativos.
  - *Tablet / Desktop (768px-1920px)*: Interface rica com abas e tabela de alta densidade.

---

### GRUPO 5: ALIMENTAÇÃO & PRODUÇÃO (COZINHA & CAFÉ DA MANHÃ)

#### 27. Painel de Produção & Cozinha do Café da Manhã
- **Arquivo**: `artifacts/limpeza/src/pages/breakfast-production.tsx`
- **Rotas**: `/pedidos-cafe`, `/cafe-dashboard`, `/historico-cafe`, `/relatorios-cafe`, `/insights-cafe`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Painel de produção diária da cozinha, montagem das bandejas de café da manhã, controle de horários de entrega e ficha técnica de insumos.
- **Elementos Interativos**:
  - Tabs Principais: Pedidos de Hoje / Amanhã (`orders`), Histórico (`history`), Insights & Estatísticas (`insights`), Ficha Técnica (`technical_sheet`).
  - Toggle de data: "Hoje" vs "Amanhã" com lista de apartamentos ordenados por horário de entrega.
  - Lista de montagem detalhada por apartamento (itens individuais por hóspede, bebidas, pães, frutas, restrições e notas).
  - Botão "Marcar como Entregue" com carimbo de horário.
  - Botão "Notificar Hóspede via WhatsApp" avisando que o café está a caminho.
  - Ficha Técnica: Cadastro de ingredientes, porções e custo unitário.
  - Gráficos Recharts de consumo semanal e previsão de compras de padaria/hortifrúti.
- **Responsividade**:
  - *Mobile (375px)*: Modo de conferência tátil na bancada da cozinha; botões largos de conclusão.
  - *Tablet (768px)*: Layout em 2 colunas para operação por tablet na cozinha.
  - *Desktop (1920px)*: Gestão integral com gráficos de consumo e fichas de custos.

---

### GRUPO 6: COMUNICAÇÃO MULTICANAL & ATENDIMENTO

#### 28. WhatsApp Web Chat Corporativo
- **Arquivo**: `artifacts/limpeza/src/pages/whatsapp-chat.tsx`
- **Rotas**: `/whatsapp-chat`, `/chat`, `/whatsapp-web`, `/chat-whatsapp`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Central de atendimento e conversas em tempo real via WhatsApp integrada ao cadastro do PMS.
- **Elementos Interativos**:
  - Coluna Esquerda: Lista de conversas ativas, campo de busca de contatos, indicador de mensagens não lidas e pino para fixar conversa no topo.
  - Coluna Central: Feed de chat em tempo real com balões de mensagem, status de entrega (`Check` / `CheckCheck`), input de texto, seletor de emojis, envio de anexos (fotos, documentos, áudio) e seletor de respostas rápidas (`useQuickMessages`).
  - Coluna Direita: Cartão lateral com perfil do hóspede, dados da reserva ativa vinculada, links de check-in e atalhos operacionais.
- **Responsividade**:
  - *Mobile (375px)*: Navegação entre lista de conversas e conversa aberta estilo aplicativo de mensagens (botão voltar).
  - *Tablet (768px)*: Visualização em duas colunas (conversas + chat).
  - *Desktop (1920px)*: **Viewport Primário de Design** (Três colunas completas abertas simultaneamente).

#### 29. Automação de WhatsApp (Réguas & Gatilhos)
- **Arquivo**: `artifacts/limpeza/src/pages/whatsapp-automation.tsx`
- **Rotas**: `/whatsapp`, `/automacao-whatsapp`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Gerenciamento de réguas de comunicação automática com hóspedes por eventos do ciclo de hospedagem.
- **Elementos Interativos**:
  - Lista de gatilhos automáticos (Lembrete de Pré-checkin, Confirmação de Reserva, Liberação de Senha, Alerta de Café, Check-out, Avaliação NPS).
  - Editor visual de templates com tags dinâmicas (`{{hospede}}`, `{{flat}}`, `{{senha}}`, `{{link_checkin}}`, etc.).
  - Fila de disparos agendados e histórico de envios com status de entrega.
  - Simulador de mensagens com teste de disparo imediato para número cadastrado.
- **Responsividade**:
  - *Mobile (375px)*: Cartões de automação com switches de ligar/desligar.
  - *Tablet / Desktop (768px-1920px)*: Painel de gerenciamento com editor de templates e visualizador prévio de smartphone.

#### 30. Automações de WhatsApp para Camareiras
- **Arquivo**: `artifacts/limpeza/src/pages/maid-whatsapp-automation.tsx`
- **Rotas**: `/automacoes-camareiras`, `/camareiras-whatsapp`, `/governanca-whatsapp`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Automação de notificações internas disparadas para a equipe de governança via WhatsApp.
- **Elementos Interativos**:
  - Gatilhos de governança: Notificação de check-out de hóspede (liberação de quarto para limpeza), início/fim de faxinas, alerta de atraso após as 14h e fechamento quinzenal de diárias.
  - Editor de mensagens direcionadas às camareiras com variáveis dinâmicas.
  - Teste de disparo individual e histórico de alertas.
- **Responsividade**:
  - *Mobile (375px)*: Lista em cartões com toggles de ativação.
  - *Tablet / Desktop (768px-1920px)*: Painel completo de configuração.

#### 31. Conexão Z-API (WhatsApp Gateway & QR Code)
- **Arquivo**: `artifacts/limpeza/src/pages/zapi-connection.tsx`
- **Rotas**: `/zapi-conexao`, `/conexao-zapi`, `/sistema/zapi`, `/zapi`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Monitoramento e pareamento da instância Z-API que alimenta o tráfego de WhatsApp do hotel.
- **Elementos Interativos**:
  - Indicador de status de conexão em tempo real (Conectado / Desconectado / Reconectando).
  - Exibição de QR Code atualizado para leitura no WhatsApp do celular com contador de expiração.
  - Configuração de credenciais técnicas: Instance ID, Token e Client Token.
  - Botão de envio de mensagem de teste para validação de entrega.
  - Configurações de fallback (texto simples vs botões).
- **Responsividade**:
  - *Mobile (375px)*: QR Code centralizado com instruções de escaneamento.
  - *Tablet / Desktop (768px-1920px)*: Painel técnico com métricas de conectividade.

#### 32. Gerenciador & Hub de E-mails Transacionais
- **Arquivo**: `artifacts/limpeza/src/pages/email-hub.tsx`
- **Rotas**: `/emails`, `/email-hub`, `/gerenciador-emails`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Central de disparo, agendamento e histórico de e-mails do sistema (confirmações, vouchers e autorizações de garagem).
- **Elementos Interativos**:
  - Tabs: Histórico (`history`), Fila de Saída (`queue`), Redator Manual (`composer`), Configurações SMTP (`settings`).
  - Redator de e-mails com seleção de templates (Voucher, Garagem, Boas-vindas, Personalizado).
  - Dialog de visualização / leitura do HTML do e-mail enviado (`selectedMail`).
  - Configurações de SMTP (Host, Porta, Usuário, Senha, E-mail da Recepção e da Garagem).
- **Responsividade**:
  - *Mobile (375px)*: Tabela de histórico adaptada em cartões; modal de pré-visualização em tela cheia.
  - *Tablet / Desktop (768px-1920px)*: Interface de cliente de e-mail corporativo.

#### 33. Mapa da Jornada de Reservas & Comunicação
- **Arquivo**: `artifacts/limpeza/src/pages/reservation-journey.tsx`
- **Rotas**: `/jornada-reservas`, `/jornada-comunicacao`, `/fluxo-reservas`, `/mapa-jornada`, `/jornada`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Visualizador em fluxograma interativo de todas as 9 etapas da experiência do hóspede e respectivos disparos multicanal (WhatsApp e E-mail).
- **Elementos Interativos**:
  - Nós da jornada com ordenação cronológica:
    1. Confirmação Imediata (D-X)
    2. Véspera de Entrada (D-1)
    3. Manhã do Check-in (07:00)
    4. Entrada & Liberação de Quarto Limpo / Senha (12:00 / 14:00)
    5. Noite da Estadia / Pedido de Café (20:00 - 22:00)
    6. Manhã da Estadia / Entrega de Café (07:00)
    7. Véspera de Saída (D-1 Checkout)
    8. Dia do Check-out (11:00)
    9. Pós-Check-out / Vistoria & NPS
  - Cards detalhados com gatilhos, condições de envio, canal e texto verbatim das mensagens.
  - Dialog de simulação de disparo para reserva específica.
- **Responsividade**:
  - *Mobile (375px)*: Fluxograma em formato de linha do tempo vertical com cartões expansíveis.
  - *Tablet / Desktop (768px-1920px)*: Fluxograma panorâmico com nós conectados e visualização de réguas.

---

### GRUPO 7: FINANCEIRO, FISCAL & TARIFAS (ADMIN)

#### 34. ERP Financeiro & DRE Gerencial
- **Arquivo**: `artifacts/limpeza/src/pages/financial-dashboard.tsx`
- **Rotas**: `/financeiro`, `/precificacao`, `/finance`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Gestão financeira de contas a pagar, contas a receber, fluxo de caixa e DRE gerencial com margem de lucro por flat.
- **Elementos Interativos**:
  - Tabs: DRE Gerencial (`dre`), Contas a Pagar (`payables`), Contas a Receber (`receivables`), Fluxo de Caixa (`cashflow`), Contratos & Repasses (`contracts`), Precificação (`pricing`).
  - DRE Gerencial com linhas de Receita Bruta, Deduções de OTAs, Custos Operacionais e Lucro Líquido.
  - Dialog "Novo Contas a Pagar" (Flat, Categoria, Descrição, Fornecedor, Valor, Vencimento, Recorrência).
  - Dialog "Novo Contas a Receber" (Flat, Cliente, Categoria, Valor, Vencimento, Forma de Recebimento).
  - Filtros por escopo (Geral CorpFlats vs Apartamento específico) e status de quitação.
- **Responsividade**:
  - *Mobile (375px)*: DRE em cartões de métricas; tabelas financeiras com rolagem lateral.
  - *Tablet / Desktop (768px-1920px)*: Visão contábil completa com gráficos e tabelas financeiras consolidadas.

#### 35. Gestão de Pagamentos, PIX & Conciliação
- **Arquivo**: `artifacts/limpeza/src/pages/payments.tsx`
- **Rotas**: `/pagamentos`, `/payments`, `/recebiveis`, `/taxas`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Monitoramento de transações financeiras, conciliação de webhooks de PIX e configuração de taxas de intermediação bancária.
- **Elementos Interativos**:
  - Tabs: Histórico de Transações (`history`), Meios de Pagamento (`methods`), Configuração de Taxas (`feeSettings`), Conciliação Ativa (`reconcile`).
  - Tabela de transações com status de liquidação, data, valor e flat.
  - Modal de Comprovante Detalhado com protocolo bancário e payload.
  - Inputs de taxas percentuais: PIX Banco Inter (0%), Mercado Pago (3.99%), Booking.com (13%), Airbnb (3%).
  - Botão de forçar sincronização e conciliação de pagamentos pendentes.
- **Responsividade**:
  - *Mobile (375px)*: Lista em cartões de transações com badges de status de pagamento.
  - *Tablet / Desktop (768px-1920px)*: Painel de tesouraria com filtros e gráficos de recebimento.

#### 36. Gestão de Tarifas, Taxas & Políticas
- **Arquivo**: `artifacts/limpeza/src/pages/tarifas.tsx`
- **Rotas**: `/tarifas`, `/gestao-tarifas`, `/tabela-tarifas`, `/precos`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Parametrização da tabela de preços, custos de adicionais e políticas comerciais do motor de reservas.
- **Elementos Interativos**:
  - Inputs de valores monetários: Diária base sem café, diária base com café da manhã.
  - Taxa de limpeza por estadia.
  - Taxa de pet (por animal e por estadia).
  - Adicional de cama extra / hóspede excedente.
  - Descontos progressivos para estadias longas (> 7 dias, > 15 dias, > 30 dias).
  - Políticas de parcelamento no cartão de crédito e desconto de PIX à vista.
  - Botão "Salvar Tarifas" com persistência imediata no backend.
- **Responsividade**:
  - *Mobile (375px)*: Formulário em blocos verticais com teclados numéricos apropriados.
  - *Tablet / Desktop (768px-1920px)*: Grade comparativa de taxas e diárias.

#### 37. Hub Fiscal de Notas Fiscais (NFS-e)
- **Arquivo**: `artifacts/limpeza/src/pages/fiscal-invoices.tsx`
- **Rotas**: `/notas`, `/nfse`, `/invoices`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Emissão, cancelamento e auditoria de Notas Fiscais de Serviço Eletrônicas (NFS-e) com suporte a IA e prefeitura.
- **Elementos Interativos**:
  - Tabs: Chat IA Fiscal (`chat`), Formulário Direto (`form`), Livro de Notas (`history`), Configurações Fiscais (`settings`).
  - Chat IA para emissão assistida em linguagem natural ("Emitir nota para o hóspede Carlos do Flat 1017").
  - Formulário com autocomplete de clientes do CRM (Nome, CPF/CNPJ, E-mail, Endereço com código de município).
  - Alternância de motor emissor: Padrão Nacional vs GISS Prefeitura.
  - Livro fiscal de notas emitidas com botões de download de XML, DANFE PDF e link da prefeitura.
- **Responsividade**:
  - *Mobile (375px)*: Interface de chat e formulário em tela cheia com inputs adaptados.
  - *Tablet / Desktop (768px-1920px)*: Painel contábil completo com histórico fiscal lateral.

---

### GRUPO 8: MARKETING, AVALIAÇÕES & CMS (ADMIN)

#### 38. Funil de Vendas & Tráfego Pago IA
- **Arquivo**: `artifacts/limpeza/src/pages/marketing-traffic.tsx`
- **Rotas**: `/trafego`, `/marketing`, `/ads`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Acompanhamento do funil de conversão de reservas, carrinhos abandonados e geração de anúncios por inteligência artificial.
- **Elementos Interativos**:
  - Tabs: Funil de Conversão (`funnel`), Carrinhos Abandonados (`carts`), Campanhas Ativas (`campaigns`), Estúdio IA (`studio`), Configurações (`settings`).
  - Gráfico de funil (Visitantes -> Pesquisas -> Seleção de Flat -> Dados -> Pagamento Concluído).
  - Tabela de carrinhos abandonados com botão de disparo de mensagem de recuperação por WhatsApp.
  - Estúdio IA: Seletor de público (Casais, Famílias, Trabalho) e botão para gerar copies de alta conversão.
  - Modal "Nova Campanha de Tráfego" com orçamento diário e copy.
- **Responsividade**:
  - *Mobile (375px)*: Gráfico de funil adaptado verticalmente; botões de recuperação de carrinho no topo.
  - *Tablet / Desktop (768px-1920px)*: Dashboard de marketing de alta densidade.

#### 39. Avaliações, Satisfação & Sentimento IA
- **Arquivo**: `artifacts/limpeza/src/pages/review-insights.tsx`
- **Rotas**: `/avaliacoes-ia`, `/reviews-ia`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Consolidação de avaliações dos hóspedes, índice NPS, análise de sentimentos por IA e geração de alertas preventivos.
- **Elementos Interativos**:
  - Tabs: Visão Geral (`overview`), Lista de Reviews (`reviews`), Alertas de Manutenção (`maintenance`), Gerador de Respostas IA (`ai-generator`).
  - Score de satisfação geral (0 a 100) e distribuição NPS (Promotores, Neutros, Detratores).
  - Análise semântica de tom (Positivo, Neutro, Negativo) com destaques em cores.
  - Alertas de avarias e manutenções identificadas automaticamente pelo texto do hóspede.
  - Botão de geração de resposta polida com IA com 1 clique para colar no Google/Booking.
- **Responsividade**:
  - *Mobile (375px)*: Cartões de avaliações com tags de sentimento e notas por estrelas.
  - *Tablet / Desktop (768px-1920px)*: Dashboard analítico de reputação e qualidade.

#### 40. Editor Visual do Site (CMS do Hotel)
- **Arquivo**: `artifacts/limpeza/src/pages/site-editor.tsx`
- **Rotas**: `/editor-site`, `/configurar-site`, `/personalizar-site`, `/site-editor`, `/cms`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Gerenciamento de conteúdo (CMS) do site de reservas diretas, fotos, slogans e comodidades.
- **Elementos Interativos**:
  - Tabs: Hero & Destaques (`hero`), Marca & Contato (`branding`), Comodidades (`amenities`), Perguntas Frequentes (`faq`), Depoimentos (`testimonials`), SEO (`seo`).
  - Galeria de seleção de fotos de alta qualidade com URLs e títulos.
  - Campos de texto: Slogan, chamada de ação, título da página, descrição institucional.
  - Gerenciamento de itens de FAQ (adicionar, editar pergunta/resposta e excluir).
  - Botão "Salvar Alterações do Site" com atualização em tempo real sem rebuild.
- **Responsividade**:
  - *Mobile (375px)*: Editor em blocos empilhados com botões de preview.
  - *Tablet / Desktop (768px-1920px)*: Painel de edição com visualizador prévio do site.

---

### GRUPO 9: CONFIGURAÇÕES, PROPRIEDADE, IA & AUDITORIA (ADMIN)

#### 41. Regras da Casa & Configurações da Propriedade
- **Arquivo**: `artifacts/limpeza/src/pages/property-settings.tsx`
- **Rotas**: `/propriedade`, `/hotel`, `/regras`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Cadastro dos apartamentos físicos, regras condominiais, política pet e horários regulamentares.
- **Elementos Interativos**:
  - Lista dos 19 flats físicos com botões para cadastrar novo flat, editar e excluir.
  - Inputs de horários regulamentares: Check-in padrão (`14:00`) e Check-out padrão (`12:00`).
  - Endereço da propriedade e URL do Google Maps para rota de navegação.
  - Textarea de Regras da Casa (silêncio após as 22h, proibição de festas, regras de lixo).
  - Textarea de Política Pet Oficial (regras de elevador, porte até 10kg, taxa e avarias).
  - Textarea de Termos Contratuais exibidos no pré-check-in digital.
- **Responsividade**:
  - *Mobile (375px)*: Formulário estruturado com áreas de texto dimensionadas.
  - *Tablet / Desktop (768px-1920px)*: Gestão de flats à esquerda e regras contratuais à direita.

#### 42. Configurações Globais & SERPRO FNRH Toggle
- **Arquivo**: `artifacts/limpeza/src/pages/settings.tsx`
- **Rotas**: `/settings`, `/configuracoes`, `/configuracao`, `/ajustes`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Configurações de infraestrutura técnica, chaves de API em nuvem, gestão de usuários operadores e chave seletora FNRH Gov.br.
- **Elementos Interativos**:
  - **Chave Seletora Global de Check-in (`settings.checkinProvider`)**:
    - Toggle Switch entre `Check-in Próprio (CorpFlats)` e `Check-in Gov.br (FNRH Digital - SERPRO)`.
    - Badge de saúde e latência da API do SERPRO em tempo real.
  - Gestão de Usuários Operadores (Admins, Recepcionistas, Camareiras) com alteração de permissão e reset de senha.
  - Integrações em Nuvem: Cloudflare R2 (Storage de fotos), Microsoft Graph (Calendário PMS) e Banco de Dados.
  - Botão de teste de sincronização forçada de reservas.
- **Responsividade**:
  - *Mobile (375px)*: Toggles e botões com espaçamento adequado para toque.
  - *Tablet / Desktop (768px-1920px)*: Painel de configurações avançadas do sistema.

#### 43. Diagnóstico & Status da IA (Google Gemini Healthcheck)
- **Arquivo**: `artifacts/limpeza/src/pages/ai-status.tsx`
- **Rotas**: `/ia-status`, `/ai-status`, `/status-ia`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Painel de telemetria e diagnóstico do motor de inteligência artificial (Google Gemini API) usado nos assistentes e chats.
- **Elementos Interativos**:
  - Status badges de conectividade, API Key ativa e tamanho da chave.
  - Botão "Testar Conexão IA Agora" (disparo de prompt sintético de teste).
  - Indicadores de tempo de resposta (latência em ms), cache e fallback resiliente.
- **Responsividade**:
  - *Mobile (375px)*: Badges de status empilhados com texto explicativo.
  - *Tablet / Desktop (768px-1920px)*: Painel de saúde de serviço (Healthcheck Dashboard).

#### 44. Central de Notificações Unificadas
- **Arquivo**: `artifacts/limpeza/src/pages/notifications-hub.tsx`
- **Rotas**: `/notificacoes`, `/notifications`, `/alertas`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Central consolidada de alertas operacionais críticos, pedidos pendentes e notificações push.
- **Elementos Interativos**:
  - Lista de notificações com categorias (Café, Achados, Avarias, Check-out pós-horário, Limpeza).
  - Badges de severidade (`info`, `warning`, `critical`).
  - Configuração de som (Hotel chime de aviso normal ou urgente) e Web Push nativo no navegador.
  - Botão "Marcar Todas como Lidas".
  - Filtro por categoria e severidade.
  - Clique no card redireciona diretamente para a tela de ação pertinente.
- **Responsividade**:
  - *Mobile (375px)*: Lista em cartões verticais com swipe/toque para ler.
  - *Tablet / Desktop (768px-1920px)*: Central de notificações corporativa.

#### 45. Logs de Auditoria & Segurança Fail-Safe
- **Arquivo**: `artifacts/limpeza/src/pages/system-logs.tsx`
- **Rotas**: `/logs`, `/auditoria`, `/system-logs`, `/audit`
- **Persona / Guard**: `Admin` (`AdminRoute`)
- **Finalidade**: Livro-razão e auditoria imutável de eventos operacionais, falhas, autorizações e logins com rastreamento de IP e ator.
- **Elementos Interativos**:
  - Campo de busca em texto livre por ação, IP ou ator.
  - Filtros por nível (`info`, `success`, `warning`, `error`, `critical`) e categoria (`reservation`, `payment`, `cleaning`, `auth`, `system`).
  - Toggle de atualização automática em tempo real (`Auto-refresh`).
  - Dialog de Detalhes do Evento com payload JSON formatado e botão de copiar.
  - Botão de exportação de logs em formato JSON/CSV.
- **Responsividade**:
  - *Mobile (375px)*: Linhas de log resumidas com badge de nível.
  - *Tablet / Desktop (768px-1920px)*: Terminal visual de logs de segurança com busca avançada.

---

### TELA SUPLEMENTAR DE FALLBACK (SISTEMA)

#### (Extra) Tela 404 - Not Found
- **Arquivo**: `artifacts/limpeza/src/pages/not-found.tsx`
- **Rotas**: Wildcard / Rota não mapeada
- **Persona / Guard**: `Todas` (Pública)
- **Finalidade**: Tela amigável de erro 404 caso o usuário acerte uma URL inexistente.
- **Elementos Interativos**: Card de aviso "404 Page Not Found", ícone de alerta e mensagem explicativa.

---

## 4. Tabela-Resumo Consolidada: As 45 Telas por Persona e Rotas

| # | Nome da Tela | Rota Primária | Aliases Suportados | Persona Principal | Guard do App.tsx |
|---|---|---|---|---|---|
| **1** | Login do Sistema | `/login` | — | Staff (Todos) | Public Route |
| **2** | Painel de Limpeza & Governança | `/dashboard` | — | Camareira / Admin | `StaffRoute` |
| **3** | Tarefas Preventivas | `/tasks` | `/tarefas` | Camareira / Admin | `StaffRoute` |
| **4** | Ocorrências & Avarias | `/observations` | `/ocorrencias`, `/avarias` | Camareira / Admin | `StaffRoute` |
| **5** | Achados & Perdidos | `/achados-perdidos` | `/achados`, `/lost-and-found` | Camareira / Admin | `StaffRoute` |
| **6** | Histórico de Limpezas | `/history` | `/historico` | Camareira / Admin | `StaffRoute` |
| **7** | Lista de Compras de Insumos | `/lista-compras` | `/compras` | Camareira / Admin | `StaffRoute` |
| **8** | Fechamento & Relatórios das Camareiras | `/reports` | `/relatorios`, `/fechamento`, `/fechamento-limpeza` | Camareira / Admin | `StaffRoute` |
| **9** | Extrato Financeiro Individual da Camareira | `/extrato` | `/meu-extrato`, `/extrato-camareiras` | Camareira / Admin | `StaffRoute` |
| **10** | Terminal da Portaria (Tablet 24h) | `/portaria` | `/tablet` | Portaria / Recepção | `ReceptionRoute` |
| **11** | Checkout da Recepção | `/recepcao` | `/reception` | Portaria / Recepção | `ReceptionRoute` |
| **12** | Motor de Reservas Diretas | `/reservar` | `/booking`, `/` | Hóspede / Público | Public Route |
| **13** | Portal Minha Conta do Hóspede | `/minha-conta` | `/minhaconta`, `/perfil`, `/my-account` | Hóspede | Public Route |
| **14** | Pré-Check-in Digital FNRH | `/pre-checkin/:code` | `/pre-checkin` | Hóspede | Public Route |
| **15** | Portal do Hóspede & Fechadura | `/minha-reserva/:code` | `/portal-hospede/:code`, `/guest-portal/:code`, `/pix/:code` | Hóspede | Public Route |
| **16** | Pedido de Café da Manhã | `/cafe/:code` | `/cafe-da-manha/:code`, `/breakfast/:code`, `/minha-reserva/:code/cafe` | Hóspede | Public Route |
| **17** | Auto-Checkout do Hóspede | `/checkout/:code` | `/check-out/:code`, `/saida/:code`, `/minha-reserva/:code/checkout` | Hóspede | Public Route |
| **18** | Verificação de Ficha FNRH | `/verificar-ficha/:uuid` | `/verificar-ficha` | Público / Auditoria | Public Route |
| **19** | Portal do Prestador de Serviço | `/servico/:token` | `/service/:token` | Prestador Externo | Public Route |
| **20** | Livro de Reservas & Calendário PMS | `/reservas` | — | Admin | `AdminRoute` |
| **21** | Relatórios & Ocupação PMS | `/relatorios-reservas` | `/relatorio-reservas`, `/pms-reports` | Admin | `AdminRoute` |
| **22** | CRM 360º de Hóspedes & Empresas | `/crm` | `/guests`, `/hospedes` | Admin | `AdminRoute` |
| **23** | Painel de Produção do Café da Manhã | `/pedidos-cafe` | `/cafe-dashboard`, `/historico-cafe`, `/relatorios-cafe` | Admin | `AdminRoute` |
| **24** | Controle de Garagem & Vagas | `/garagem` | `/estacionamento` | Admin | `AdminRoute` |
| **25** | Painel Operacional Ao Vivo (Live Ops) | `/painel-aovivo` | `/live-ops`, `/aovivo` | Admin | `AdminRoute` |
| **26** | Central de Notificações Unificadas | `/notificacoes` | `/notifications`, `/alertas` | Admin | `AdminRoute` |
| **27** | Gestão de Ordens de Serviço | `/servicos` | `/service-orders` | Admin | `AdminRoute` |
| **28** | Vistorias de Saída & Checklists | `/surveys` | `/vistorias` | Admin | `AdminRoute` |
| **29** | Gestão de Pagamentos & PIX | `/pagamentos` | `/payments`, `/recebiveis`, `/taxas` | Admin | `AdminRoute` |
| **30** | ERP Financeiro & DRE Gerencial | `/financeiro` | `/precificacao`, `/finance` | Admin | `AdminRoute` |
| **31** | Hub Fiscal de Notas Fiscais (NFS-e) | `/notas` | `/nfse`, `/invoices` | Admin | `AdminRoute` |
| **32** | Funil de Vendas & Tráfego IA | `/trafego` | `/marketing`, `/ads` | Admin | `AdminRoute` |
| **33** | Avaliações & Satisfação IA | `/avaliacoes-ia` | `/reviews-ia` | Admin | `AdminRoute` |
| **34** | WhatsApp Web Chat Corporativo | `/whatsapp-chat` | `/chat`, `/whatsapp-web`, `/chat-whatsapp` | Admin | `AdminRoute` |
| **35** | Automação de WhatsApp (Réguas) | `/whatsapp` | `/automacao-whatsapp` | Admin | `AdminRoute` |
| **36** | Automação WhatsApp Camareiras | `/automacoes-camareiras` | `/camareiras-whatsapp`, `/governanca-whatsapp` | Admin | `AdminRoute` |
| **37** | Conexão Z-API (WhatsApp Gateway) | `/zapi-conexao` | `/conexao-zapi`, `/sistema/zapi`, `/zapi` | Admin | `AdminRoute` |
| **38** | Gerenciador de E-mails Transacionais | `/emails` | `/email-hub`, `/gerenciador-emails` | Admin | `AdminRoute` |
| **39** | Mapa da Jornada de Reservas | `/jornada-reservas` | `/jornada-comunicacao`, `/fluxo-reservas`, `/jornada` | Admin | `AdminRoute` |
| **40** | Editor Visual do Site (CMS) | `/editor-site` | `/configurar-site`, `/site-editor`, `/cms` | Admin | `AdminRoute` |
| **41** | Gestão de Tarifas & Taxas | `/tarifas` | `/gestao-tarifas`, `/tabela-tarifas`, `/precos` | Admin | `AdminRoute` |
| **42** | Regras da Casa & Propriedade | `/propriedade` | `/hotel`, `/regras` | Admin | `AdminRoute` |
| **43** | Configurações do Sistema & SERPRO | `/settings` | `/configuracoes`, `/configuracao`, `/ajustes` | Admin | `AdminRoute` |
| **44** | Diagnóstico & Status da IA | `/ia-status` | `/ai-status`, `/status-ia` | Admin | `AdminRoute` |
| **45** | Logs de Auditoria Fail-Safe | `/logs` | `/auditoria`, `/system-logs`, `/audit` | Admin | `AdminRoute` |

---

## 5. Requisitos Específicos para os Testes Sintéticos E2E

Para garantir 100% de cobertura nos testes sintéticos automatizados conforme os requisitos R1 a R5 de `ORIGINAL_REQUEST.md`, o crawler e executor E2E devem implementar os seguintes padrões de interação:

1. **Gestão de Viewports**:
   - **Mobile (375px x 667px / 375px x 812px)**: Avaliar renderização correta do header móvel (`md:hidden`), abertura e navegação pelo drawer lateral (`mobileMenuOpen`), clique na barra inferior móvel permanente (`bottom-0 z-40`), formulários sem quebra horizontal e assinatura em canvas com `touch-action: none`.
   - **Tablet (768px x 1024px)**: Avaliar terminal da portaria (`/portaria`) com visualização de cards de chegadas e visualizador PDF integrado sem overflow.
   - **Desktop (1920px x 1080px)**: Avaliar timeline do PMS (`/reservas`) com renderização dos 19 flats e chat do WhatsApp em 3 colunas simultâneas.

2. **Interação com Canvas & Uploads**:
   - Para assinar digitalmente em `guest-pre-checkin.tsx`, o teste automatizado deve disparar sequências de `pointerdown`, `pointermove` e `pointerup` (ou `mousedown`/`mousemove`/`mouseup`) nas coordenadas internas do `<canvas ref={canvasRef}>`, garantindo que o `signatureData` não seja nulo antes de habilitar o botão de conclusão.
   - Para uploads de fotos de documentos, selfies e vistorias, utilizar arquivos mock em Base64/Blob que passem pelo módulo `compressImage` sem erros.

3. **Cenários Anti-Frustração**:
   - **Zero Amnésia**: Reutilizar o mesmo CPF/E-mail em duas reservas subsequentes e validar que o formulário de pré-check-in já inicia com os dados pessoais e fotos preenchidos.
   - **Auto-Vínculo**: Criar reserva no PMS e realizar login em `/minha-conta` com o mesmo e-mail para validar que a reserva aparece listada na aba de estadias.
   - **Veículo Completo**: Verificar que o cadastro de `placa`, `marca`, `modelo` e `cor` em `/pre-checkin/:code` reflete imediatamente em `/garagem` e `/portaria`.
   - **Fechadura Bloqueada vs Liberada**: Validar que antes das 14:00 (ou enquanto o flat não estiver "limpo") o código da fechadura digital não é renderizado no portal do hóspede, surgindo após a liberação.

---

## 6. Caveats

- **Ambiente de Dados Reais**: Esta investigação foi estritamente estática e de leitura de código-fonte (`read-only`), não tendo alterado dados nem disparado requisições de rede para produção.
- **Parametrização de Rotas com `:code` e `:token`**: As rotas públicas dinâmicas (`/pre-checkin/:code`, `/minha-reserva/:code`, `/cafe/:code`, `/checkout/:code`, `/servico/:token`) necessitam de sementes determinísticas geradas no banco de testes (`database.test.json`) para renderizar os dados completos sem tela de "Reserva não encontrada". O sandbox de teste deve semear pelo menos 1 reserva em cada estado (pendente de check-in, em estadia, checkout pendente) e 1 ordem de serviço ativa com token fixo.
- **No caveats**: Todos os 45 arquivos de telas e componentes de rota foram inspecionados com exatidão no código-fonte.

---

## 7. Conclusion

O sistema Guest-Flow-Manager (CorpFlats) possui uma arquitetura de frontend altamente modular com **exatamente 45 telas/views funcionais** que cobrem todo o ciclo hoteleiro, distribuídas estrategicamente entre 5 personas:
- **Admin**: 45 telas acessíveis (sendo 26 exclusivas e 19 compartilhadas).
- **Portaria / Recepção**: 2 telas operacionais exclusivas (`/portaria`, `/recepcao`) + telas de apoio.
- **Camareira / Governança (Staff)**: 7 telas operacionais de limpeza, vistorias e fechamento.
- **Hóspede**: 7 telas públicas no portal e motor de reservas.
- **Prestador de Serviço Externo**: 1 tela pública dedicada protegida por token criptográfico.

O inventário acima fornece a referência completa de rotas, componentes, elementos essenciais e comportamentos responsivos para subsidiar a construção do crawler universal e dos testes sintéticos E2E autônomos.

---

## 8. Verification Method

Para verificar independentemente a exatidão deste inventário:
1. **Contagem de Arquivos em `pages/`**:
   Execute no terminal ou verifique via ferramenta de listagem de diretório:
   ```powershell
   Get-ChildItem "artifacts\limpeza\src\pages" | Measure-Object
   # Resultado comprovado: 46 arquivos (45 telas funcionais + not-found.tsx)
   ```
2. **Conferência das Rotas no `App.tsx`**:
   Inspecione `artifacts/limpeza/src/App.tsx` entre as linhas 170 e 343 para confirmar que todas as rotas listadas na Tabela-Resumo estão declaradas com seus respectivos guards (`AdminRoute`, `ReceptionRoute`, `StaffRoute`, `Route`).
3. **Build do Frontend**:
   Para atestar que todas as 45 telas compilam sem erros de tipagem TypeScript ou imports ausentes:
   ```powershell
   cd "artifacts\limpeza"
   npm run build
   ```

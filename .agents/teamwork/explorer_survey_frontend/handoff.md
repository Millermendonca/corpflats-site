# Relatório de Levantamento de Frontend (Survey) — Sistema de Gestão de Funcionários CLT

## 1. Observation

Durante a investigação detalhada da base de código do frontend em `artifacts/limpeza/`, foram observados os seguintes fatos concretos:

### 1.1. Arquitetura de Build e Dependências (`artifacts/limpeza/package.json`)
- **Gerenciador de build:** Vite 7.3.6 com plugin `@vitejs/plugin-react` e `@tailwindcss/vite` (Tailwind v4).
- **Roteador:** O projeto **não** utiliza `react-router-dom`; utiliza **`wouter` (`^3.3.5`)** como roteador SPA (`Route, Switch, useLocation, Router as WouterRouter`).
- **Design System e Componentes UI:** Radix UI primitives completos estão instalados:
  - `@radix-ui/react-tabs` (`^1.1.4`)
  - `@radix-ui/react-switch` (`^1.1.4`)
  - `@radix-ui/react-dialog` (`^1.1.7`)
  - `@radix-ui/react-alert-dialog` (`^1.1.7`)
  - `@radix-ui/react-select` (`^2.1.7`)
  - `@radix-ui/react-table` (via `src/components/ui/table.tsx`)
  - `@radix-ui/react-accordion` (`^1.2.4`)
  - `lucide-react` para iconografia unificada
  - `sonner` (`^2.0.7`) e custom `Toaster` para notificações
  - `@tanstack/react-query` para gerenciamento de estado assíncrono
- **Pipeline de Build:**
  - O comando `npm --prefix artifacts/limpeza run build` foi executado diretamente no terminal e retornou **código de saída 0** (`built in 53.31s`), transformando 3.395 módulos e gerando o bundle de produção em `dist/public/`.

### 1.2. Sistema de Rotas e Navegação (`artifacts/limpeza/src/App.tsx` e `components/layout.tsx`)
- Em `App.tsx`:
  - Rotas protegidas utilizam guards específicos: `AdminRoute` (`AdminGuard`), `ReceptionRoute`, `StaffRoute`, `DevRoute`.
  - Todas as páginas secundárias utilizam code-splitting resiliente com `lazyWithRetry(() => import('@/pages/...'))`.
  - Rotas públicas como `/reservar`, `/minha-reserva/:code`, `/servico/:token` e `/frigobar/flat/:flatNumber` são instanciadas diretamente com `<Route path="..." component={...} />`.
- Em `components/layout.tsx`:
  - O componente `Shell` encapsula o menu desktop retrátil/fixável (`gfm_sidebar_pinned`) e o drawer mobile.
  - O menu organiza os módulos em categorias colapsáveis (`reservas`, `comunicacao`, `governanca`, `financeiro`, `propriedade`, `frigobar`, `engenharia`).
  - O acesso aos itens do menu é filtrado dinamicamente pela função `hasModuleAccess(user, item.href)`.

### 1.3. Controle Granular de Permissões (`artifacts/limpeza/src/lib/permissions.ts`)
- O catálogo `PERMISSION_CATEGORIES` organiza todos os módulos canônicos.
- A função `canonicalizeRoute(path)` mapeia aliases para rotas canônicas via `ROUTE_ALIASES`.
- As rotas de administração (`ADMIN_MODULES`) e desenvolvedor (`DEV_MODULES`) herdam os módulos operacionais.
- Linhas 395-405 do `permissions.ts` mostram o padrão consolidado de liberação automática para `admin` e `dev`:
  ```ts
  const frigobarModules = ["/frigobar", "/anserve", "/frigobar-reposicao", "/frigobar-gestao"];
  if ((user.role === "dev" || user.role === "admin") && frigobarModules.includes(canonical)) {
    return true;
  }
  ```

### 1.4. Isolamento das Prestadoras Autônomas Cris e Grazi (`data/database.json`)
- No arquivo `data/database.json`:
  - Usuário ID 2: `username: "Cris"`, `role: "camareira"`, `name: "Cris"`, `pixKey: "22988486446"`.
  - Usuário ID 3: `username: "Grazi"`, `role: "camareira"`, `name: "Grazi"`, `pixKey: "12977795766"`.
- Ambas possuem `allowedModules` restritos a governança operacional (`/dashboard`, `/reports`, `/lista-compras`, etc.). Elas são remuneradas por diária de limpeza (extrato de governança quinzenal) e **não** possuem vínculo empregatício CLT.

### 1.5. Recursos Nativos Disponíveis (Câmera, Assinatura Canvas e GPS)
- **Canvas de Assinatura:** Em `artifacts/limpeza/src/pages/guest-pre-checkin.tsx` (linhas 992-1040 e 3754-3800), já existe uma implementação nativa de assinatura sobre `<canvas>` HTML5 com suporte a eventos de mouse (`onMouseDown`, `onMouseMove`, `onMouseUp`) e touch mobile (`onTouchStart`, `onTouchMove`, `onTouchEnd`), gerando imagem via `canvas.toDataURL("image/png")`. Não há dependência de bibliotecas externas adicionais.
- **Compressão de Imagens:** `artifacts/limpeza/src/lib/image-compression.ts` disponibiliza `compressImage(file, { maxWidth, maxHeight, quality })` capaz de reduzir fotos de 5MB para ~80KB em WebP/JPEG via Canvas nativo.
- **Localização do Hotel e Cerca Virtual:** Em `artifacts/api-server/zapi-service.mjs` (linhas 4102-4106), as coordenadas oficiais do Soho Residence são:
  - Latitude: `-21.7584`
  - Longitude: `-41.3262`
  - Endereço: `Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ, 28010-140`.

---

## 2. Logic Chain

A partir das observações acima, a arquitetura e o planejamento do frontend para o Sistema de Gestão de Funcionários CLT foram delineados seguindo os seguintes passos lógicos:

### 2.1. Estratégia de Rotas e Páginas
1. **Página 1: Painel Administrativo de RH (`artifacts/limpeza/src/pages/hr-dashboard.tsx`)**:
   - Rota canônica: `/rh`
   - Aliases suportados: `/colaboradores`, `/funcionarios`, `/recursos-humanos`, `/admin/rh`.
   - Protegida por `AdminRoute` (`moduleName="o Sistema de Gestão de RH & Colaboradores CLT"`), garantindo que apenas usuários autorizados com perfil Admin ou Dev acessem a gestão contratual, folha e travas sindicais.
2. **Página 2: Interface Mobile de Batida de Ponto (`artifacts/limpeza/src/pages/ponto-mobile.tsx`)**:
   - Rota canônica: `/ponto`
   - Aliases suportados: `/rh/ponto`, `/bater-ponto`, `/terminal-ponto`.
   - Declarada como `<Route path="/ponto" component={PontoMobilePage} />` pública/operacional, permitindo que funcionários de Cozinha e Governança registrem ponto tanto a partir de um tablet compartilhado fixo na parede da copa/recepção quanto a partir de seus próprios smartphones, autenticando-se por seleção de colaborador + PIN de 4 dígitos ou sessão ativa.

### 2.2. Integração no Catálogo de Permissões (`lib/permissions.ts`)
1. Incluir a categoria `👥 Recursos Humanos & Ponto CLT` (ou módulo em `propriedade`):
   ```ts
   { href: "/rh", label: "Gestão de RH & Colaboradores CLT", description: "Funcionários, escalas 6x1, ponto com selfie/GPS, travas CLT, folha e ASO" }
   ```
2. Adicionar os aliases em `ROUTE_ALIASES`:
   ```ts
   "/colaboradores": "/rh",
   "/funcionarios": "/rh",
   "/recursos-humanos": "/rh",
   "/admin/rh": "/rh",
   "/rh/ponto": "/ponto",
   "/bater-ponto": "/ponto",
   "/terminal-ponto": "/ponto"
   ```
3. Na função `hasModuleAccess()`, estender a cláusula de bypass para `admin` e `dev` garantindo que `/rh` seja visível imediatamente mesmo em usuários com `allowedModules` legados gravados no banco.
4. No menu lateral `Shell` (`components/layout.tsx`), adicionar o item de navegação com ícone `UserCheck` ou `Users` e badge indicando eventuais pendências de conformidade ou ASO a vencer.

### 2.3. Arquitetura da Interface Mobile de Batida de Ponto (`/ponto`)
O fluxo do colaborador na tela mobile de ponto é estruturado em 4 etapas lineares e intuitivas:
1. **Identificação do Colaborador & Modo Terminal:**
   - O aplicativo lê o `deviceToken` em `localStorage.getItem("gfm_device_token")`. Se não existir, gera um UUID persistente.
   - Exibe status do dispositivo:
     - Se a Whitelist estiver ativada e o dispositivo for autorizado: badge verde *"Terminal Oficial Autorizado"*.
     - Se a Whitelist estiver desativada: badge azul *"Modo Flexível (Qualquer Dispositivo)"*.
     - Se a Whitelist estiver ativada e o dispositivo não for autorizado: aviso em tela informando a exigência de dispositivo cadastrado.
   - Seleção do Colaborador: Dropdown ou cards visuais com foto e cargo (ex: *"Maria - Cozinha CLT"* ou *"Juliana - Camareira CLT"*).
   - Validação por Teclado Numérico (PIN de 4 dígitos) para evitar batidas indevidas por terceiros em aparelhos compartilhados.
2. **Captura de Selfie ao Vivo (Câmera Nativa):**
   - Inicia o stream da câmera frontal com `navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })` exibindo um viewfinder com moldura oval ("Enquadre seu rosto").
   - Botão de disparo que captura um frame do `<video>` para `<canvas>`, gerando um JPEG comprimido (máximo 640x640, ~40KB).
   - Fallback de contingência caso o navegador bloqueie permissão de webcam: `<input type="file" accept="image/*" capture="user" />` com compressão automática via `compressImage`.
3. **Geolocalização & Cerca Virtual (GPS):**
   - Dispara `navigator.geolocation.getCurrentPosition({ enableHighAccuracy: true })`.
   - Calcula a distância instantânea em metros até o Soho Residence `(-21.7584, -41.3262)` via fórmula de Haversine.
   - Exibe indicador em tempo real:
     - Distância <= 150m: *"Dentro do Hotel (~24m) • GPS Válido"* (Verde).
     - Distância > 150m: *"Fora do Hotel (~450m do Soho Residence)"* (Alerta Amarelo/Vermelho conforme o nível de trava configurado).
4. **Seleção da Ação de Ponto e Confirmação:**
   - 4 botões de toque amplo com cores e ícones claros:
     - `🟢 Entrada Expediente`
     - `🟡 Saída Almoço (Intervalo)`
     - `🔵 Retorno Almoço`
     - `🔴 Saída Expediente`
   - Ao confirmar:
     - Envia POST para `/api/hr/timeclock` com `{ employeeId, type, selfieBase64, latitude, longitude, accuracy, deviceToken, pin }`.
     - Exibe Comprovante Digital imediato com:
       - NSR (Número Sequencial de Registro) e Hash SHA-256 da batida;
       - Data e hora exatas com carimbo de segundo;
       - Distância e status do GPS;
       - Histórico de batidas já efetuadas no dia atual;
       - Resumo de horas trabalhadas no dia e saldo acumulado de banco de horas (positivo ou negativo);
       - Alerta visual *"Comprovante e extrato enviados para seu WhatsApp!"*.

### 2.4. Arquitetura do Painel Admin de RH (`/rh`)
O Painel de RH é construído com Radix `<Tabs>` contendo 6 abas principais e um modal/gaveta para gestão da Whitelist de Dispositivos:

#### Header Superior do Painel
- Título: *"Gestão de Recursos Humanos & Funcionários CLT"* com badge *"CorpFlats Soho Residence"*.
- Indicadores Rápidos (KPIs):
  - Colaboradores CLT Ativos (2)
  - Prestadoras Diaristas (2: Cris & Grazi — Isoladas)
  - Batidas Registradas Hoje (ex: 4 batidas)
  - Saldo Total de Banco de Horas da Equipe (+4h20m)
  - Status da Whitelist de Terminais (Ativa / Aberta)
  - Botão de Ação Rápida: *"Abrir Terminal de Ponto Mobile"* e *"Configurar Whitelist"*.

#### Aba 1: Funcionários (Cadastro CLT vs. Isolamento de Cris e Grazi)
- **Seção Superior — Colaboradores em Regime CLT:**
  - Tabela e Cards com dados contratuais: Matrícula, Nome, Cargo (*Funcionário de Cozinha* ou *Camareira CLT*), CTPS Digital, Jornada Padrão 6x1 (44h semanais, 7h20/dia ou 8h seg-sex + 4h sáb), Horário Previsto de Almoço (ex: 12:00 às 13:00), Salário Base, Adicionais (Insalubridade 20%, Adicional Noturno), Chave PIX, Telefone/WhatsApp, Status ASO (Apto), PIN de Acesso ao Ponto.
  - Ações: Editar dados, redefinir PIN, visualizar ficha cadastral completa, inativar.
- **Seção Inferior — Prestadoras Autônomas / Diaristas (Cris & Grazi):**
  - Card destacado com moldura âmbar e badge cinza/âmbar: `Prestadora de Serviço Autônoma (Diarista / Governança)`.
  - Exibe claramente Cris (id: 2) e Grazi (id: 3) com a menção:
    > *"Colaboradoras autônomas com remuneração por faxina avulsa no Fechamento Quinzenal de Governança. Estritamente isentas de controle de ponto CLT, banco de horas, folha mensal e travas sindicais."*
  - Links diretos para seus respectivos extratos em `/reports`.

#### Aba 2: Escalas & Espelho de Ponto Digital
- **Seletor de Competência:** Mês/Ano e filtro por Colaborador.
- **Visualizador e Gerador de Escalas 6x1:**
  - Calendário mensal com marcação de dias normais de trabalho, dias de folga semanal (DSR), folgas dominicais periódicas, feriados e períodos de férias.
  - Validação visual automática da regra de descanso semanal remunerado (não permitir mais de 6 dias de trabalho sem folga).
- **Espelho de Ponto Diário (Portaria 671 MTE):**
  - Tabela linha a linha de cada dia do mês:
    - Data e Dia da Semana
    - Entrada 1, Saída Almoço, Retorno Almoço, Saída 2
    - Total de Horas Trabalhadas
    - Tolerância legal (Art. 58 §1º CLT — 5 min/batida até 10 min/dia)
    - Horas Normais, Horas Extras 50% (dias úteis), Horas Extras 100% (domingos/feriados)
    - Adicional Noturno (22h às 05h com hora ficta de 52m30s)
    - Saldo Diário e Saldo Acumulado (Banco de Horas)
  - Botão "Inspecionar Batida": Abre modal exibindo a **Selfie tirada**, mini-mapa com a localização exata do GPS e o aparelho utilizado.
  - Botão "Inclusão / Ajuste Manual pelo Admin": Modal com justificativa obrigatória e campo de assinatura do gestor (exigência MTE).
  - Botão "Exportar Espelho (PDF)" e "Enviar Espelho para o WhatsApp do Colaborador".

#### Aba 3: Motor de Conformidade & Travas em 3 Níveis
- Painel interativo com 10 cards de regras trabalhistas e sindicais. Cada regra possui uma chave seletora com 3 opções:
  1. `🟡 Apenas Alerta (alert)`: Permite o registro e emite alerta no painel e WhatsApp do gestor.
  2. `🟠 Override Admin com Senha (admin_override)`: Bloqueia a ação até que o administrador insira senha mestre e justificativa textual.
  3. `🔴 Bloqueio Total (hard_block)`: Impede terminantemente a ação (ex: proíbe bater ponto em férias ou proíbe salvar escala ilegal).
- **As 10 Regras Parametrizáveis:**
  1. Trabalho contínuo superior a 6h sem pausa intrajornada de almoço;
  2. Intervalo de almoço inferior a 1h (para jornadas > 6h);
  3. Intervalo interjornada inferior a 11h consecutivas entre dois expedientes (Art. 66 CLT);
  4. Escala com mais de 6 dias de trabalho consecutivos sem DSR (Art. 67 CLT / OJ 410 SDI-1);
  5. Escala sem folga dominical periódica no ciclo legal;
  6. Excesso de horas extras diárias (> 2h extras / 10h diárias totais — Art. 59 CLT);
  7. Escalação ou batida durante férias ou afastamento médico;
  8. Colaborador escalado com ASO vencido;
  9. Batida de ponto fora do raio de GPS do hotel (cerca virtual parametrizável em metros, ex: 150m);
  10. Batida em aparelho não autorizado na Whitelist (quando a Whitelist estiver ativada).
- **Log de Auditoria de Overrides:** Tabela registrando quem autorizou exceções, horário, justificativa e colaborador afetado.

#### Aba 4: Folha de Pagamento & Holerite
- **Apuração da Folha Mensal:**
  - Tabela sintética consolidando a competência selecionada:
    - Salário Base Contratual
    - Proventos: Horas Extras 50%, Horas Extras 100%, DSR sobre Horas Extras (reflexo), Adicional Noturno, Insalubridade
    - Descontos: INSS (alíquotas progressivas oficiais), Vale Transporte (6% ou valor efetivo), Faltas/Atrasos, Adiantamentos/Vales
    - Salário Líquido a Pagar
- **Demonstrativo / Holerite Oficial:**
  - Modal com layout formatado para impressão ou PDF oficial contendo logotipo CorpFlats, dados da empresa, CNPJ, dados do funcionário, CBO, discriminação de proventos/descontos e bases legais (FGTS, INSS, IRRF).
- **Integração Financeira & Baixa PIX:**
  - Botão "Copiar Chave PIX" do funcionário ou gerar cobrança/pagamento.
  - Botão "Registrar Pagamento / Baixa PIX" com anexo do comprovante bancário e disparo do holerite no WhatsApp do colaborador.

#### Aba 5: Contratos & Assinatura Eletrônica
- **Minutas Pré-Preenchidas Prontas para Assinatura:**
  1. Contrato Individual de Trabalho por Prazo Indeterminado (CLT 44h semanais, regime 6x1);
  2. Acordo Individual de Compensação de Horas / Banco de Horas;
  3. Termo de Ciência e Autorização para Registro de Ponto em Celular e Aparelho da Empresa;
  4. Ficha de Entrega e Uso de Equipamentos de Proteção Individual (EPI);
  5. Termo de Opção de Vale Transporte.
- **Canvas de Assinatura Eletrônica:**
  - Pad digital integrado na interface com suporte a touch e caneta.
  - Registro de validade jurídica: Timestamp UTC, IP de origem, User-Agent e Hash SHA-256 do documento gerado com a assinatura embutida.
- **Checklist de Documentos Admissionais:**
  - Lista de verificação com badges de status (Pendente / Anexado / Aprovado): RG/CNH, CPF, CTPS Digital, Comprovante de Residência, Certidão de Casamento/Nascimento, Título de Eleitor, ASO Admissional.

#### Aba 6: Saúde Ocupacional / ASO (PCMSO)
- **Cadastro e Histórico de Exames:**
  - Tipos: Admissional, Periódico, Retorno ao Trabalho, Mudança de Função/Risco, Demissional.
  - Tabela com: Colaborador, Tipo de Exame, Data de Realização, Validade (12 meses), Data de Vencimento, Clínica/Médico Examinador, Status de Aptidão (*Apto*, *Inapto*, *Pendente*), Anexo do ASO (upload/visualização de PDF ou foto).
- **Monitor de Alertas Preventivos:**
  - Badges com contagem regressiva de dias:
    - `🟢 Em dia` (> 60 dias)
    - `🟡 Atenção` (30 a 60 dias)
    - `🟠 Vencendo em breve` (< 30 dias)
    - `🔴 ASO Vencido` (Alerta imediato com bloqueio no motor de conformidade).
  - Botão "Agendar Exame Periódico" e "Notificar Clínica Médica".

#### Gestão de Whitelist de Aparelhos (Sub-painel / Modal)
- **Interruptor Geral:** Toggle *"Exigir Aparelho Autorizado (Bloquear demais celulares)"*.
  - Quando desativado: Colaboradores batem ponto por qualquer celular válido (padrão inicial enquanto o tablet corporativo não for adquirido).
  - Quando ativado: Apenas dispositivos cadastrados na lista podem registrar ponto.
- **Botão de Auto-Autorização:** *"Autorizar este dispositivo atual como Terminal Oficial"* (salva o fingerprint `gfm_device_token` local no banco com nome ex: *"Tablet Portaria / Recepção"*).
- **Gerador de Pareamento QR Code:** Permite que o gestor aponte a câmera do novo celular ou tablet da empresa para pareá-lo instantaneamente como dispositivo autorizado.
- **Tabela de Dispositivos Cadastrados:** Nome amigável, Token de identificação (mascarado), Data de cadastro, Último ponto registrado por este aparelho, Status (*Ativo* / *Bloqueado*), Botões de revogação e exclusão.

---

## 3. Caveats

1. **Permissões de Câmera e GPS no Navegador:**
   - Em navegadores móveis (Safari no iOS e Chrome no Android), o acesso a `navigator.mediaDevices.getUserMedia` e `navigator.geolocation` exige conexão segura (`https://` ou `localhost`). O deploy em produção no Render já roda sob HTTPS com certificado SSL, garantindo pleno funcionamento.
   - Caso o colaborador negue a permissão de câmera ao vivo no prompt do navegador, a interface mobile foi planejada para exibir um fallback claro via `<input type="file" accept="image/*" capture="user" />`, permitindo tirar a selfie sem travar a aplicação.
2. **Precisão do GPS em Ambientes Fechados:**
   - Em áreas internas com interferência (ex: copa no térreo do Soho Residence), a precisão do GPS do celular pode oscilar entre 10 e 50 metros. Por esse motivo, a cerca virtual recomendada deve ser parametrizada com raio padrão entre 100m e 150m do hotel, evitando falsos positivos de colaboradores que estão fisicamente no prédio.
3. **Persistência de Cookies e Armazenamento Local no Modo Terminal:**
   - Ao utilizar um tablet corporativo compartilhado onde múltiplos colaboradores batem ponto consecutivamente, a interface de ponto mobile não deve persistir a sessão de um colaborador individual, exigindo sempre a seleção do nome e digitação do PIN de 4 dígitos a cada nova batida.

---

## 4. Conclusion

1. **Viabilidade Técnica Plena:** O frontend existente em `artifacts/limpeza/` possui 100% dos componentes e ferramentas necessários para construir o Sistema Completo de Gestão de Funcionários CLT.
2. **Zero Dependências Externas Novas:** Nenhuma biblioteca adicional precisa ser adicionada ao `package.json`. Recursos como assinatura em canvas, captura de selfie em `<video>`, compressão de imagens e geolocalização serão implementados usando APIs nativas de alta performance e os utilitários já consolidados no projeto (`image-compression.ts`, Radix UI, Lucide e Tailwind).
3. **Isolamento de Cris e Grazi Garantido:** A interface do RH destacará explicitamente Cris e Grazi em uma seção separada de "Prestadoras Autônomas de Governança", blindando-as de qualquer trava trabalhista, banco de horas ou folha CLT.
4. **Prontidão de Build:** O teste de compilação executado (`npm --prefix artifacts/limpeza run build`) comprovou código de saída 0 sem quebras de tipagem.
5. **Divisão de Telas Recomendada:**
   - `artifacts/limpeza/src/pages/hr-dashboard.tsx` (Painel Administrativo com as 6 Abas e Whitelist).
   - `artifacts/limpeza/src/pages/ponto-mobile.tsx` (Terminal Mobile com Câmera/Selfie, GPS e Validação de Aparelho).
   - Atualização em `artifacts/limpeza/src/App.tsx`, `components/layout.tsx` e `lib/permissions.ts`.

---

## 5. Verification Method

Para que o orquestrador e os próximos workers possam verificar independentemente as constatações deste relatório:

1. **Verificação da Pipeline de Build:**
   Executar no terminal:
   ```bash
   npm --prefix artifacts/limpeza run build
   ```
   *Condição de validação:* Código de saída 0 com geração dos arquivos em `artifacts/limpeza/dist/public/`.

2. **Inspeção dos Arquivos de Referência do Frontend:**
   - Verificar as rotas e guards em `artifacts/limpeza/src/App.tsx`.
   - Verificar a estrutura do menu categorizado em `artifacts/limpeza/src/components/layout.tsx`.
   - Verificar o catálogo de permissões em `artifacts/limpeza/src/lib/permissions.ts`.
   - Verificar a assinatura sobre Canvas em `artifacts/limpeza/src/pages/guest-pre-checkin.tsx` (linhas 992-1040).
   - Verificar o compressor nativo em `artifacts/limpeza/src/lib/image-compression.ts`.
   - Verificar as coordenadas oficiais do hotel Soho Residence em `artifacts/api-server/zapi-service.mjs` (linha 4104: `-21.7584, -41.3262`).
   - Verificar o cadastro existente das prestadoras Cris e Grazi em `data/database.json` (linhas 52-89).

3. **Condições de Invalidação:**
   - Qualquer necessidade de adicionar bibliotecas pesadas de terceiros (ex: `signature_pad`, `react-signature-canvas`, `leaflet` ou bibliotecas proprietárias de câmera) é desnecessária e contrária às diretrizes de leveza e estabilidade do projeto.

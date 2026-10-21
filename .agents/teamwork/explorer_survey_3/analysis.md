# Análise Técnica Profunda: Arquitetura do Ecossistema de Frigobar (CorpFlats + Anserve)

**Data**: 2026-10-21T18:45:00Z  
**Autor**: Explorer Survey 3 (Management, Anserve & Admin Portals, CRM & Sofia AI Explorer)  
**Projeto**: Guest-Flow-Manager (CorpFlats — Edifício Soho Residence Service, Campos dos Goytacazes - RJ)  
**Escopo**: Mapeamento dos 6 Eixos de Gestão, Portais Anserve, Admin CorpFlats, CRM 360 e Sofia IA.

---

## Sumário Executivo

A implementação do novo ecossistema de Frigobar para os 19 flats da CorpFlats em parceria com a **Anserve** substitui o antigo modelo operacional ("frigobar vazio e desligado sem cortesia") por um modelo de autoatendimento mobile e governança inteligente.

Este documento detalha o mapeamento técnico e arquitetural dos **6 eixos estratégicos**:
1. **Controle de Acesso e Perfis Híbridos**: Adição de `anserve_repositora` e `anserve_gestor` em `permissions.ts`, `equipe.tsx` e mecanismo de link rápido mobile com token persistente/PIN.
2. **Interface da Repositora Anserve (`/frigobar-reposicao`)**: Visão prioritária por flat (checkouts do dia em destaque), conferência de consumo declarado vs físico, apontamento de divergências com fotos e reposição de itens pagos e cortesias (cápsulas Nespresso, balas e amendoim).
3. **Interface de Supervisão Anserve (`/anserve` / `/frigobar-gestao`)**: Fila de Notas Fiscais sem poluição no WhatsApp, upload de NF com disparo automático multicanal (Z-API WhatsApp + E-mail + Área da Reserva) e conciliação de repasse.
4. **Interface Admin CorpFlats (`/frigobar`)**: Gestão de catálogo, cortesias, gabarito padrão por flat, gerador de QR Codes para displays de acrílico e extrato financeiro CorpFlats ↔ Anserve.
5. **CRM do Hóspede & Analytics Demográfico (`crm-guests.tsx`)**: Histórico de consumo 360º no cadastro do hóspede, tags de afinidade e cruzamento analítico de origem demográfica (cidade/UF) vs mix de produtos consumidos.
6. **Integração com a IA Sofia (`whatsapp-ai-service.mjs`)**: Injeção do módulo `minibar` em `buildGuestContext`, expansão de `querySystemData`, erradicação do texto legado de "frigobar vazio" no system prompt e réguas automáticas de cobrança amigável em caso de divergência.

---

## 1. Eixo 1: Controle de Acesso e Perfis de Usuário (Anserve & CorpFlats)

### 1.1. Mapeamento Atual no Frontend e Backend
- **Frontend**: `artifacts/limpeza/src/lib/permissions.ts` gerencia:
  - `PERMISSION_CATEGORIES`: 6 categorias existentes (`reservas`, `comunicacao`, `governanca`, `financeiro`, `propriedade`, `engenharia`).
  - `getDefaultModulesForRole(role)`: define permissões padrão para `camareira`, `recepcao`, `admin` e `dev`.
  - `hasModuleAccess(user, path)`: normaliza aliases e verifica se o usuário autenticado tem permissão em `allowedModules`.
- **Backend**: `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` (mantendo paridade SHA-256) replicam as mesmas regras em:
  - `ensureSystemUsers()`: inicializa usuários padrões.
  - `GET /api/admin/users`: lista colaboradores com seus respectivos `allowedModules`.
  - `POST /api/admin/users` e `PATCH /api/admin/users/:id`: salva e sanitiza permissões, bloqueando concessão indevida de módulos `devOnly`.
- **Interface de Gestão**: `artifacts/limpeza/src/pages/equipe.tsx` provê o seletor visual de telas, badges de perfis e modais de criação/edição.

### 1.2. Especificação dos Novos Perfis de Acesso
Definir 2 novos perfis especializados para os colaboradores da empresa parceira Anserve:

| Perfil (`role`) | Título no Sistema | Módulos Padrão (`getDefaultModulesForRole`) | Escopo e Responsabilidade |
| :--- | :--- | :--- | :--- |
| `anserve_repositora` | 📦 Repositora Anserve | `["/frigobar-reposicao"]` | Acesso estrito mobile à conferência e reposição de itens nos flats. Sem acesso a financeiro, tarifas, reservas gerais ou governança de limpeza. |
| `anserve_gestor` | 🏢 Gestor Anserve | `["/anserve", "/frigobar-reposicao", "/frigobar-gestao"]` | Supervisão geral do frigobar: fila de emissão e anexo de NFs, relatórios de divergência, controle de estoque da parceira e extrato de repasse. |

Para os perfis existentes da CorpFlats:
- `admin`: herda automaticamente `/frigobar`, `/anserve`, `/frigobar-reposicao`, `/frigobar-gestao` em `OPERATIONAL_MODULES`.
- `dev`: herda todas as telas.
- `recepcao` e `camareira`: mantêm seus escopos atuais (recepção pode receber visualização de `/frigobar` como consulta opcional configurada em `allowedModules`).

### 1.3. Categoria de Permissões no Catálogo (`permissions.ts`)
Adicionar a categoria de Frigobar no catálogo central `PERMISSION_CATEGORIES`:
```typescript
{
  id: "frigobar",
  title: "🧊 Frigobar & Anserve",
  items: [
    { href: "/frigobar", label: "Gestão de Frigobar (CorpFlats)", description: "Catálogo, gabarito por flat, QR Codes e extrato de repasse" },
    { href: "/anserve", label: "Painel de Supervisão Anserve", description: "Fila de NFs, emissão, anexo e conferência geral" },
    { href: "/frigobar-reposicao", label: "Portal da Repositora", description: "Conferência rápida, apontamento de divergências e reposição" },
    { href: "/frigobar-gestao", label: "Relatórios & Estoque Anserve", description: "Métricas de saída, consumo de cortesias e auditoria" }
  ]
}
```

### 1.4. Arquitetura do Link Rápido Mobile com Token / PIN
A repositora trabalha em trânsito entre os 19 flats e não deve enfrentar barreiras de digitação de senhas complexas ou desconexões por expiração de cookie:
1. **Link com Token Persistente**:
   - URL: `https://corpflats.onrender.com/frigobar-reposicao?token=ANSERVE_REP_TOKEN_HASH`
   - O backend valida o token e retorna uma sessão simplificada com escopo restrito (`role: "anserve_repositora"`).
   - O frontend grava o token no `localStorage` (`corpflats_anserve_token`). Nas visitas seguintes, o colaborador pode acessar diretamente sem reenviar o link ou salvar o ícone na tela inicial do celular (PWA/Homescreen).
2. **Fallback com Teclado Numérico PIN (4 Dígitos)**:
   - Se o token não estiver presente ou for expirado/revogado, a tela exibe um keypad numérico direto (0-9) solicitando o PIN operacional cadastrado para a repositora em `/equipe`.
   - Sem campos de texto convencionais: 4 círculos preenchíveis e validação instantânea no 4º dígito.

---

## 2. Eixo 2: Interface da Repositora Anserve (`/frigobar-reposicao`)

### 2.1. Arquitetura Mobile-First & Hierarquia Visual
A tela `/frigobar-reposicao` deve ser totalmente orientada à agilidade operacional em smartphones (Android/iOS).

```
┌────────────────────────────────────────────────────────┐
│  📦 CorpFlats + Anserve — Reposição de Frigobar        │
│  Colaboradora: Joana (Anserve) • 21/10/2026            │
├────────────────────────────────────────────────────────┤
│  [🔴 Check-out Hoje (4)]  [🔵 Ocupados (11)]  [🟢 Livres (4)] │
├────────────────────────────────────────────────────────┤
│  FLAT 113 — 1º Andar                 [🔴 Check-out Hoje]│
│  Hóspede: Carlos Eduardo Silva (RES-113-0944)          │
│  Estadia: 19/10 a 21/10 (Saída prevista: 12:00)        │
│                                                        │
│  🛒 Consumo Declarado/Pago pelo Hóspede:               │
│  • 2x Cerveja Heineken 330ml (R$ 20,00) - PAGO PIX     │
│  • 1x Água c/ Gás Crystal 500ml (R$ 6,00) - PAGO PIX   │
│  Total Declarado: R$ 26,00 (Sem pendências registradas)│
│                                                        │
│  [ ✅ CONFORME (Sem Divergência) ]                     │
│  [ ⚠️ APONTAR DIVERGÊNCIA / CONSUMO NÃO PAGO ]         │
│  [ 📦 Registrar Reposição Física (Pagos + Cortesias) ]  │
└────────────────────────────────────────────────────────┘
```

### 2.2. Priorização Operacional por Status do Flat
1. **🔴 Check-out Hoje (Prioridade Máxima)**:
   - Hóspede saindo ou recém-saído.
   - Janela crítica: o flat deve ser inspecionado antes da camareira finalizar a higienização e antes da entrada do próximo hóspede (às 14:00).
2. **🔵 Ocupado (Stayover / Durante Estadia)**:
   - Inspeção sob demanda ou reposição periódica quando autorizada pelo hóspede.
3. **🟢 Livre / Limpo**:
   - Garantia de que o gabarito padrão e o kit de cortesias de boas-vindas estão 100% montados para a próxima chegada.

### 2.3. Fluxo de Conferência: "Conforme" vs "Apontar Divergência"
1. **Botão "Conforme (Sem Divergência)"**:
   - O minibar físico bate exatamente com a soma: `Gabarito Padrão - Itens Pagos pelo Hóspede`.
   - Um toque registra a vistoria como `conforme` no backend (`POST /api/minibar/inspections`).
   - Marca automaticamente a necessidade de repor os itens retirados para restabelecer o estoque cheio do flat.
2. **Botão "Apontar Divergência / Consumo Não Pago"**:
   - Abre modal mobile com a lista dos itens do catálogo do flat.
   - Steppers intuitivos (`-` e `+`) para indicar unidades consumidas que não foram declaradas/pagas.
   - **Upload de Evidência**: Botão de foto com ativação direta da câmera traseira do celular (`capture="environment"`), permitindo fotografar o frigobar aberto.
   - Campo para observações breves (ex: *"2 cervejas e 1 chocolate consumidos sem registro no portal"*).
   - Ao confirmar o apontamento:
     - Cria um pedido pendente (`status: "divergence_pending"`) vinculado à reserva.
     - **Disparo Automático da IA Sofia no WhatsApp**: A Sofia envia imediatamente mensagem para o WhatsApp do hóspede informando a divergência com cortesia e fornecendo o link direto de pagamento.

### 2.4. Registro de Reposição (Itens Pagos + Kit de Cortesias)
A repositora registra no mesmo fluxo o que foi recolocado fisicamente no flat:
- **Itens de Venda**: Quantidades repostas de cada produto para restabelecer o gabarito.
- **Kit Cortesia de Boas-Vindas**:
  - Cápsulas Nespresso (Padrão: 2 unidades por reserva).
  - Balas / Sachês de cortesia.
  - Amendoim / Snack cortesia de boas-vindas.
- Esse registro alimenta o **Extrato de Repasse CorpFlats ↔ Anserve**, gerando o crédito financeiro de reembolso que a CorpFlats pagará à Anserve pelo custo das cortesias fornecidas.

---

## 3. Eixo 3: Interface de Supervisão Anserve (`/anserve` / `/frigobar-gestao`)

### 3.1. Fila de Notas Fiscais Pendentes (Sem Alertas de WhatsApp)
**Restrição Operacional Crítica**: Não deve ser enviado nenhum alerta de WhatsApp para a equipe da Anserve a cada venda avulsa. O volume de mensagens geraria ruído desnecessário. Toda a supervisão fiscal é realizada de forma centralizada pelo painel `/anserve`.

#### Informações Exibidas na Fila:
- **Identificador do Pedido**: ID do consumo e horário do pagamento.
- **Identificação do Hóspede & Flat**: Nome do titular, Flat e Código da Reserva.
- **Documento Fiscal Selecionado**: CPF do hóspede OU CNPJ corporativo / outro CPF indicado no checkout.
- **E-mail de Destino**: E-mail confirmado pelo cliente para recebimento do XML/PDF.
- **Valor Total Pago**: Valor discriminado em reais (R$).
- **Opção de Discriminação Escolhida pelo Hóspede**:
  - 📄 **Itens discriminados**: Exibir todos os produtos individuais (ex: "2x Cerveja Heineken, 1x Água").
  - 💧 **"Água"**: Agrupamento contábil sob a rubrica "Água Mineral" (frequente em políticas de reembolso corporativo de empresas que vetam bebidas alcoólicas ou nomenclaturas de frigobar).
  - 🧊 **"Consumo de Frigobar"**: Lançamento genérico sob a rubrica global de frigobar.

### 3.2. Fluxo de Anexo e Disparo Multicanal da Nota Fiscal
Ao emitir a Nota Fiscal eletrônica no sistema da Anserve:
1. O gestor da Anserve localiza a linha na Fila de Pendentes e clica em **"Anexar Nota Fiscal"**.
2. Realiza o upload do arquivo (PDF ou imagem escaneada/fotografada da NF).
3. O sistema salva o documento em storage durável (`/api/minibar/orders/:id/invoice`).
4. **Disparo Automático Triplo**:
   - **WhatsApp via Z-API**: Dispara automaticamente mensagem de agradecimento com o arquivo PDF da NF anexado diretamente no chat do hóspede.
   - **E-mail do Hóspede**: Envia e-mail formatado via `mail-service.mjs` com o PDF da nota fiscal em anexo.
   - **Área da Reserva (`/minha-reserva/:code`)**: A nota fiscal fica disponível imediatamente para download no portal do hóspede na seção de recibos e faturas.

### 3.3. Painel de Reposição e Fechamento Quinzenal/Mensal
- Resumo consolidado de saídas por flat e por categoria.
- Total acumulado de cortesias repostas (Nespresso, balas, amendoim) com cálculo de ressarcimento a receber da CorpFlats.
- Relatório de divergências apontadas x recuperadas.

---

## 4. Eixo 4: Interface Admin CorpFlats (`/frigobar`)

### 4.1. Catálogo de Produtos e Gestão de Cortesias
Tela administrativa no PMS para a CorpFlats configurar o mix de produtos oferecidos nos 19 flats:
- **Campos do Produto**:
  - Foto do produto (upload ou URL otimizada).
  - Nome comercial e descrição.
  - Categoria (`Água & Sucos`, `Refrigerantes`, `Cervejas & Alcoólicos`, `Snacks & Chocolates`, `Cafés & Especiais`).
  - Preço de Venda ao Hóspede (R$).
  - Preço de Custo / Repasse da Anserve (R$).
  - Quantidade Padrão no Flat (Gabarito padrão).
  - Flag `isCourtesy`: Determina se o item faz parte do kit de boas-vindas gratuito ou se é item de venda.
  - Suporte a itens híbridos: Cápsulas de Nespresso possuem 2 unidades como cortesia no check-in, mas unidades adicionais constam no catálogo a preço de venda unitário (ex: R$ 4,50/cápsula extra).

### 4.2. Gabarito Padrão por Flat
- Matriz configurável com o estoque ideal de cada um dos 19 flats ativos (113, 114, 116, 211, 212, 215, 313, 408, 509, 511, 512, 605, 712, 715, 904, 905, 907, 1004, 1304).
- Permite diferenciar gabaritos caso flats com layout maior ou perfil executivo tenham itens específicos (ex: vinhos ou cervejas artesanais selecionadas).

### 4.3. Gerador e Impressão de QR Codes Individuais
- Gerador dinâmico de códigos QR vinculados a cada flat:
  - Destino: `https://corpflats.onrender.com/frigobar/flat/{flatNumber}`
- **Layout de Display de Acrílico (A6 / Balcão)**:
  - Botão de exportação para PDF ou impressão direta com template gráfico pronto:
    - Logotipo CorpFlats & Frigobar Express.
    - Número do flat em destaque.
    - Texto explicativo simples: *"Aponte a câmera do seu celular, confirme os 4 últimos dígitos do seu telefone e aproveite com comodidade."*
    - Ícones informando pagamento fácil via PIX e Cartão de Crédito.

### 4.4. Extrato de Fechamento & Repasse CorpFlats ↔ Anserve
Algoritmo de cálculo financeiro transparente entre as duas partes:

$$\text{Valor Bruto Vendido} = \sum (\text{Pedidos de Frigobar Pagos})$$

$$\text{Taxas Financeiras} = \text{Taxas de Gateway PIX Inter} + \text{Taxas de Cartão Mercado Pago}$$

$$\text{Comissão CorpFlats} = \text{Percentual acordado sobre o faturamento líquido}$$

$$\text{Crédito de Cortesias Repostas} = \sum (\text{Qtd Cápsulas/Balas/Amendoim Repostas} \times \text{Custo Unitário da Cortesia})$$

$$\mathbf{\text{Repasse Líquido à Anserve}} = \text{Valor Bruto} - \text{Taxas} - \text{Comissão CorpFlats} + \text{Crédito de Cortesias}$$

O sistema permite filtrar por período (quinzenal ou mensal), emitir o extrato detalhado em PDF/Excel e registrar a quitação do fechamento.

---

## 5. Eixo 5: CRM do Hóspede & Analytics Demográfico (`crm-guests.tsx`)

### 5.1. Mapeamento Atual em `artifacts/limpeza/src/pages/crm-guests.tsx`
O CRM já dispõe de:
- Ficha 360º do hóspede (`activeGuest`) acessível por modal detalhado.
- Galeria de mídias biométricas (Selfie, Documento PDF/Imagem, Assinatura digital do termo).
- Ficha cadastral e ministerial (FNHR) com endereço residencial, CPF, idade, gênero, cidade e estado de origem (`activeGuest.city`, `activeGuest.state`).
- Histórico de Estadias (`activeGuest.reservations`) e Histórico de Notas Fiscais Emitidas (`activeGuest.invoices`).
- Métricas LTV de hospedagem (`totalSpent`, `totalStays`, `favoriteFlat`).

### 5.2. Incorporação do Módulo de Frigobar na Ficha 360º
Adicionar uma nova aba/seção dedicada: **"🧊 Consumo de Frigobar & Preferências"**:
1. **Métricas Rápidas de Frigobar**:
   - `LTV Frigobar`: Total financeiro gasto em frigobar pelo hóspede ao longo de todas as suas visitas.
   - `Ticket Médio Frigobar`: Gasto médio por estadia.
   - `Taxa de Conformidade`: Percentual de estadias em que o hóspede pagou espontaneamente sem gerar divergência.
2. **Histórico de Pedidos de Frigobar**:
   - Tabela com Data/Hora, Flat, Itens consumidos, Método de pagamento (PIX / Cartão), Valor (R$) e Link da Nota Fiscal emitida.
3. **Tags Automáticas de Preferência de Frigobar**:
   - O motor analítico atribui automaticamente tags no perfil:
     - 🍺 *Consumidor: Cerveja Artesanal*
     - 🍷 *Apreciador: Vinhos & Espumantes*
     - ☕ *Alto Consumo: Café Nespresso*
     - 🍫 *Snacks Noturnos*
     - ⭐ *Hóspede Frigobar Vip* (LTV frigobar > R$ 150)

### 5.3. Cruzamento Analítico Demográfico (Origem vs Mix de Consumo)
Integrar ao módulo de relatórios analíticos (`/api/minibar/analytics` e painel `/frigobar`) a inteligência de cruzamento de dados:
- **Origem Geográfica**: Dados ministeriais consolidados no FNHR/CRM (Cidade e Estado do hóspede: Rio de Janeiro, São Paulo, Macaé, Belo Horizonte, Vitória, etc.).
- **Mix de Categorias Consumidas**: Bebidas Alcoólicas, Não Alcoólicas, Snacks, Cafés.
- **Geração de Insights de Negócio**:
  - *"Hóspedes de São Paulo consomem 42% mais cervejas artesanais e água tônica."*
  - *"Hóspedes corporativos de Macaé e Rio de Janeiro consomem predominantemente águas com/sem gás e refrigerantes zero."*
  - *"Famílias com estadias de lazer nos fins de semana apresentam maior consumo de snacks, chocolates e sucos integrais."*
- Esses insights permitem à Anserve e à CorpFlats ajustar preventivamente o mix de reposição nos flats conforme a previsão de perfil de hóspedes do mapa de reservas.

---

## 6. Eixo 6: Integração com a Sofia IA (`whatsapp-ai-service.mjs`)

### 6.1. Injeção de Contexto no `buildGuestContext`
O arquivo `artifacts/api-server/whatsapp-ai-service.mjs` concentra a inteligência de atendimento da Sofia no WhatsApp. Na função `buildGuestContext(db, phone, passedHistory)`:
- Adicionar propriedades específicas de frigobar:
  ```javascript
  const canonicalResCode = matchedReservation ? (matchedReservation.code || ...) : null;
  const minibarUrl = canonicalResCode ? `${appOrigin}/minha-reserva/${canonicalResCode}/frigobar` : null;
  const reservationOrders = (db?.minibarOrders || []).filter(o => 
    o.reservationCode === canonicalResCode || (matchedReservation && o.reservationId === matchedReservation.id)
  );
  const minibarTotalPaid = reservationOrders
    .filter(o => o.status === "paid")
    .reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
  const minibarPendingDivergences = (db?.minibarInspections || []).filter(i => 
    i.reservationCode === canonicalResCode && i.hasDivergence && !i.divergenceResolved
  );
  ```
- O objeto retornado passa a incluir `minibarUrl`, `minibarTotalPaid`, `hasMinibarOrders: reservationOrders.length > 0` e `hasPendingMinibarDivergence: minibarPendingDivergences.length > 0`.

### 6.2. Suporte no Motor Universal de Consulta `querySystemData`
Em `whatsapp-ai-service.mjs:918`, expandir os módulos do switch adicionando `case "minibar":` / `case "frigobar":`:
- **Se o solicitante for Hóspede (`requesterRole === "guest"`)**:
  - Retorna o cardápio ativo de produtos com nomes e preços.
  - Retorna o status das cortesias inclusas de boas-vindas: *"2 cápsulas de café Nespresso, balas e amendoim na chegada"*.
  - Retorna o link direto `/minha-reserva/:code/frigobar` para conferência e pagamento.
  - **Regra Contábil Mandatória**: Retorna explicitamente que o frigobar **NÃO pode ser faturado junto à diária do hotel**, devendo ser pago de forma separada pelo link via PIX ou Cartão.
- **Se o solicitante for Gestor / Admin (`requesterRole === "admin"`)**:
  - Retorna resumo de faturamento do dia, quantidade de NFs pendentes de anexo e alertas de divergência não resolvidas.

### 6.3. Atualização Crítica do System Prompt & FAQs da Sofia
Hoje, o prompt da Sofia contém textos legados que instruem que o frigobar está vazio e que não há cortesia:
- `whatsapp-ai-service.mjs:173`: `"frigobar vazio e ligado para uso particular (sem cortesia de água)"`
- `whatsapp-ai-service.mjs:4376-4377` e `8532`: Menções a frigobar vazio.
- `demo-server.mjs:3547-3550` (FAQ `faq-agua-frigobar`): *"Não disponibilizamos água mineral ou bebidas como cortesia gratuita de boas-vindas."*

**Reformulação Obrigatória**:
1. Atualizar as diretrizes da Sofia:
   - *"Os flats contam com frigobar abastecido com bebidas, refrigerantes, cervejas e snacks selecionados, além de cortesia especial de boas-vindas (2 cápsulas Nespresso, balas e amendoim)!"*
   - *"O consumo do frigobar é pago de forma avulsa e digital pelo próprio hóspede, não sendo possível faturar junto com a hospedagem."*
2. Treinar a Sofia para responder a dúvidas de consumo:
   - Quando o hóspede perguntar *"Tem água no quarto?"*, *"Quanto custa a cerveja?"* ou *"Consumi itens do frigobar, como pago?"*:
     - A Sofia responde cordial e brevemente informando que há itens à disposição.
     - Envia o link oficial da reserva: `https://corpflats.onrender.com/minha-reserva/{code}/frigobar`.
3. Notificação Proativa de Divergência Apontada pela Repositora:
   - Quando a repositora registrar itens faltantes não declarados, a Sofia envia a mensagem automática pré-formatada:
     > *"Olá, {Nome}! Esperamos que tenha tido uma excelente estadia no Flat {Flat}. Na conferência de rotina do frigobar, identificamos o consumo de: {itens}. Como não encontramos o registro prévio no portal, geramos o link direto para acerto via PIX ou Cartão: {minibarUrl}. Muito obrigado e até breve!"*

---

## 7. Contratos de API REST Backend (Arquitetura Proposta)

Para garantir paridade absoluta entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`, os seguintes endpoints devem ser implementados de forma idêntica:

| Método | Endpoint | Papel Mínimo | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/minibar/products` | Público | Lista catálogo de produtos ativos e gabarito padrão. |
| `POST` | `/api/minibar/products` | `admin`, `dev` | Criação/edição de produtos, preços e cortesias. |
| `POST` | `/api/minibar/flat-context` | Público | Valida QR Code do flat via 4 últimos dígitos do telefone do hóspede. |
| `GET` | `/api/minibar/reservation-context/:code` | Público | Retorna dados da reserva, itens disponíveis e histórico de pedidos. |
| `POST` | `/api/minibar/orders` | Público | Cria pedido de frigobar e gera cobrança PIX (Banco Inter) ou Cartão (Mercado Pago). |
| `GET` | `/api/minibar/orders/:id/status` | Público | Polling de liquidação do pagamento via Webhook/Gateway. |
| `GET` | `/api/minibar/inspections/flats` | `anserve_repositora`, `anserve_gestor`, `admin` | Lista flats agrupados por prioridade (Checkout hoje, Ocupado, Livre) com consumos declarados. |
| `POST` | `/api/minibar/inspections` | `anserve_repositora`, `anserve_gestor`, `admin` | Registra conformidade ou divergência (fotos, faltantes) e reposição de pagos/cortesias. |
| `GET` | `/api/minibar/invoices/pending` | `anserve_gestor`, `admin`, `dev` | Lista fila de NFs pendentes com formato de discriminação e dados fiscais. |
| `POST` | `/api/minibar/orders/:id/invoice` | `anserve_gestor`, `admin`, `dev` | Upload do PDF/imagem da NF e disparo automático para WhatsApp Z-API e E-mail. |
| `GET` | `/api/minibar/settlement` | `anserve_gestor`, `admin`, `dev` | Extrato financeiro de repasse CorpFlats ↔ Anserve com comissões e cortesias. |
| `GET` | `/api/minibar/analytics` | `admin`, `dev` | Relatórios de consumo cruzados com dados demográficos do CRM/FNRH. |

---

## 8. Conclusão da Investigação
O ecossistema planejado é completamente viável e se integra organicamente à infraestrutura já existente do Guest-Flow-Manager:
- O sistema de permissões granulares (`permissions.ts` e `equipe.tsx`) possui extensibilidade imediata para `anserve_repositora` e `anserve_gestor`.
- A arquitetura de portais de autoatendimento (como visto em `service-worker-portal.tsx` e `guest-portal`) fornece o padrão ideal para o link rápido mobile da repositora sem burocracia de senha.
- A centralização da Sofia no WhatsApp (`whatsapp-ai-service.mjs`) resolve de forma elegante a cobrança amigável de divergências e a distribuição digital de Notas Fiscais, sem sobrecarregar a comunicação manual de nenhuma das partes.

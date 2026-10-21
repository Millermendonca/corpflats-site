# Handoff Report: Mapeamento de Portais Anserve, Admin CorpFlats, CRM & Sofia IA (Frigobar)

**Agente**: `explorer_survey_3` (teamwork_preview_explorer)  
**Destinatário**: Project Orchestrator (`d10c20e2-adfb-4695-835e-52dd3bebe9a9`)  
**Data**: 2026-10-21T18:50:00Z  
**Tipo**: Hard (Tarefa de Investigação Concluída)  
**Arquivo de Análise Completo**: `.agents/teamwork/explorer_survey_3/analysis.md`

---

## 1. Observation (Observações Diretas)

1. **Catálogo de Permissões e Perfis Atuais**:
   - Arquivo `artifacts/limpeza/src/lib/permissions.ts:19-106` define `PERMISSION_CATEGORIES` com 6 categorias (`reservas`, `comunicacao`, `governanca`, `financeiro`, `propriedade`, `engenharia`).
   - Linhas `147-161`: `getDefaultModulesForRole(role)` trata exclusivamente `dev`, `admin`, `recepcao`/`reception` e `camareira` (fallback).
   - Linhas `166-250`: `ROUTE_ALIASES` normaliza sinônimos de rotas para acesso granular.
   - Arquivo `artifacts/limpeza/src/pages/equipe.tsx:63`: tipo `role: "dev" | "admin" | "recepcao" | "camareira" | string`.
   - Linhas `1150-1167` e `1250-1270`: elementos `<select>` no cadastro e edição de colaboradores oferecem apenas as 4 opções padrão.

2. **Guarda de Rotas e Navegação Dinâmica**:
   - Arquivo `artifacts/limpeza/src/App.tsx:200-243`: `AdminGuard` e `StaffGuard` chamam estritamente `hasModuleAccess(user as any, location)`.
   - Arquivo `artifacts/limpeza/src/components/layout.tsx:424-430`: `rawNavCategories` é mapeado e filtrado dinamicamente com `cat.items.filter(item => hasModuleAccess(user as any, item.href))`.
   - Linhas `880-975`: o menu inferior mobile (`BottomNav`) exibe abas fixas por condição estática (`if (isAdminOrDev) ... else if (isRecepcao) ... else ...` com botões de camareira: Limpeza, Compras, Extrato, Manutenções).

3. **Arquitetura de Acesso sem Senha / Link Rápido**:
   - Arquivo `artifacts/limpeza/src/pages/service-worker-portal.tsx:1-100`: padrão de portal operacional de prestador com validação de token ou PIN numérico sem dependência do cookie de autenticação padrão.

4. **CRM 360 e Dados Ministeriais**:
   - Arquivo `artifacts/limpeza/src/pages/crm-guests.tsx:850-930`: tabela de hóspedes exibe LTV (`totalSpent`), estadias (`totalStays`), flat favorito e tags.
   - Linhas `1200-1415`: modal de detalhes 360º exibe mídias biométricas (Selfie, Documento PDF/Imagem, Assinatura digital) e ficha FNHR (`activeGuest.city`, `activeGuest.state`, endereço completo).
   - Linhas `1568-1615`: renderiza `activeGuest.reservations` e `activeGuest.invoices`. Não há atualmente histórico nem métricas de frigobar.

5. **IA Sofia e Contexto no WhatsApp**:
   - Arquivo `artifacts/api-server/whatsapp-ai-service.mjs:753-796`: `buildGuestContext` retorna `reservationCode`, `checkinUrl`, `checkoutUrl`, status de estadia e quarto, sem informações de frigobar.
   - Linhas `918-1440`: `querySystemData` suporta 10 módulos (`flats`, `reservations`, `cleaning`, `maintenance`, `breakfast`, `garage`, `lost_and_found`, `faq`, `finance`, `sentiment`). Não há suporte a frigobar.
   - Linha `173`: o prompt do sistema instrui explicitamente: `"frigobar vazio e ligado para uso particular (sem cortesia de água)"`.
   - Linhas `4376-4377` e `8532`: respostas prontas da IA reiteram frigobar vazio para uso particular.
   - Arquivo `artifacts/api-server/demo-server.mjs:3547-3550` (FAQ `faq-agua-frigobar`): *"Não disponibilizamos água mineral ou bebidas como cortesia gratuita de boas-vindas."*

---

## 2. Logic Chain (Cadeia Lógica de Raciocínio)

1. **Sobre o Controle de Acesso (Eixo 1)**:
   - A partir de (1) e (2), como `hasModuleAccess` já delega a liberação para `allowedModules`, basta adicionar os papéis `anserve_repositora` e `anserve_gestor` em `getDefaultModulesForRole(role)` em `permissions.ts` e seus espelhos no backend.
   - O papel `anserve_repositora` deve ter como padrão apenas `["/frigobar-reposicao"]`.
   - O papel `anserve_gestor` deve ter como padrão `["/anserve", "/frigobar-reposicao", "/frigobar-gestao"]`.
   - Para evitar que o menu inferior mobile (`BottomNav` em `layout.tsx`) direcione a repositora para telas de governança às quais ela não tem acesso, a barra inferior deve renderizar itens contextuais para os perfis da Anserve.
   - Para permitir operação imediata sem login, o padrão de token persistente demonstrado em (3) deve ser adotado na rota `/frigobar-reposicao?token=...` com gravação em `localStorage`.

2. **Sobre a Interface da Repositora (Eixo 2)**:
   - Da análise operacional, flats com checkout no dia são a prioridade máxima para a vistoria de saída antes da entrada do próximo hóspede às 14:00.
   - Exibir o consumo já declarado/pago pelo hóspede permite à repositora conferir se o estoque restante bate com a conta física.
   - O botão "Conforme" atesta a ausência de extravios e registra a reposição física necessária (itens vendidos + reposição das cortesias: 2 cápsulas Nespresso, balas e amendoim).
   - O botão "Apontar divergência" captura a quantidade faltante, permite foto da câmera do celular e cria cobrança pendente.

3. **Sobre a Interface de Supervisão da Anserve (Eixo 3)**:
   - Para evitar sobrecarga de alertas no WhatsApp dos gestores da Anserve, a fila de NFs no painel `/anserve` atua como o ponto focal.
   - Os dados exibidos (Nome, CPF/CNPJ corporativo, E-mail, Valor e o formato de discriminação: *Itens discriminados*, *Água* ou *Consumo de Frigobar*) fornecem tudo o que o emissor fiscal precisa.
   - O upload da NF anexada na plataforma aciona automaticamente o disparo do PDF para o WhatsApp (Z-API) e E-mail do hóspede, além de publicar na Área da Reserva (`/minha-reserva/:code`).

4. **Sobre o Painel Admin CorpFlats (Eixo 4)**:
   - O catálogo centraliza preços, fotos, estoques ideais (gabarito) por flat e cortesias.
   - O gerador de QR Codes individualiza cada flat (`/frigobar/flat/:flatNumber`), gerando cartões em formato A6 para displays físicos nos apartamentos.
   - O extrato CorpFlats ↔ Anserve consolida o balanço: `Valor Vendido Pago - Taxas Financeiras - Comissão + Custo de Cortesias Repostas = Repasse Líquido à Anserve`.

5. **Sobre o CRM e Analytics Demográfico (Eixo 5)**:
   - A partir de (4), a ficha 360º de `crm-guests.tsx` já armazena o histórico ministerial com Cidade e UF de origem do hóspede.
   - Adicionando o card de histórico de frigobar e tags automáticas de preferência (ex: *Cerveja Artesanal*, *Vinho*, *Nespresso*), o hotel passa a traçar o perfil de consumo de cada hóspede.
   - O cruzamento analítico permite correlacionar origem demográfica (ex: SP vs RJ vs MG) com categorias consumidas, orientando a estocagem preventiva.

6. **Sobre a Integração da Sofia IA (Eixo 6)**:
   - A partir de (5), o texto legado afirmando que o frigobar é vazio e que não há cortesia deve ser completamente removido de `whatsapp-ai-service.mjs` e `demo-server.mjs`.
   - Adicionando o módulo `minibar` no `querySystemData` e os links no `buildGuestContext`, a Sofia consegue responder perguntas sobre bebidas, enviar o link `/minha-reserva/:code/frigobar` e reforçar a regra contábil: *"O frigobar é faturado de forma independente e não pode ser embutido na diária do hotel"*.
   - Ao ser registrada uma divergência de conferência pela repositora, o backend aciona a Sofia para enviar mensagem proativa amigável ao hóspede com os itens e o link de pagamento.

---

## 3. Caveats (Ressalvas & Limitações)

1. **Paridade SHA-256 Obrigatória**: Quaisquer rotas ou modificações adicionadas em `artifacts/api-server/demo-server.mjs` devem ser espelhadas de forma exata e idêntica em `scripts/demo-server.mjs`.
2. **Ambiente de Testes (`AGENTS.md`)**: É expressamente proibido rodar suítes globais (`tests/*.test.mjs`). Apenas testes unitários pontuais dedicados aos endpoints novos de frigobar podem ser executados durante a fase de implementação.
3. **Storage de Notas Fiscais**: O upload de PDF ou imagens de notas fiscais pode ser salvo como Data URL / Base64 no banco de dados temporariamente ou transferido para bucket Cloudflare R2 caso configurado. O backend deve suportar ambas as estratégias com fallback resiliente.

---

## 4. Conclusion (Conclusão & Direcionamento de Implementação)

A arquitetura dos 6 eixos está totalmente detalhada e mapeada no arquivo `.agents/teamwork/explorer_survey_3/analysis.md`. A estrutura do PMS comporta com total naturalidade as novas interfaces, contratos de API e inteligência de IA sem quebrar o fluxo de produção já existente.

---

## 5. Verification Method (Método de Verificação Independente)

O implementador e o orquestrador podem verificar de forma independente as constatações deste relatório através dos seguintes passos:

1. **Inspeção de Arquivos**:
   - `artifacts/limpeza/src/lib/permissions.ts` (linhas 19-161): verificar categorias e `getDefaultModulesForRole`.
   - `artifacts/limpeza/src/pages/equipe.tsx` (linhas 1150-1270): verificar `<select>` de perfis de usuário.
   - `artifacts/limpeza/src/pages/crm-guests.tsx` (linhas 1200-1615): verificar seções de ficha 360º, FNHR e histórico.
   - `artifacts/api-server/whatsapp-ai-service.mjs` (linhas 173, 620-796 e 918-1440): verificar diretrizes de frigobar, `buildGuestContext` e `querySystemData`.
   - `.agents/teamwork/explorer_survey_3/analysis.md`: ler a especificação técnica detalhada com contratos REST e mockups conceituais.

2. **Condições de Invalidação**:
   - Se for encontrada alguma restrição no modelo de permissões que impeça a criação dos perfis `anserve_repositora` e `anserve_gestor`.
   - Se os módulos do menu lateral não puderem ser filtrados de forma independente por `hasModuleAccess`.

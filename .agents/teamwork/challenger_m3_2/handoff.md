# Relatório de Verificação Adversária (Challenger M3_2)

**Agente**: `challenger_m3_2` (teamwork_preview_challenger)  
**Destinatário**: Project Orchestrator (`d10c20e2-adfb-4695-835e-52dd3bebe9a9`)  
**Data**: 2026-10-21T21:38:00Z  
**Tipo**: Hard (Tarefa Concluída)  
**Veredito**: **REQUEST_CHANGES**

---

## 1. Observation (Observações Diretas)

1. **Upload de Arquivo Inválido ou Vazio na Nota Fiscal (`anserve-dashboard.tsx` e backend)**:
   - Em `artifacts/limpeza/src/pages/anserve-dashboard.tsx`:
     - Linhas 216-224: `handleUploadInvoice` verifica `if (!selectedOrderForInvoice || !invoiceFileData)` e bloqueia o envio com toast de alerta destrutivo: `"Selecione o arquivo PDF ou foto da Nota Fiscal para prosseguir."`
     - Linha 687: O input possui `accept="application/pdf,image/*"`.
     - Linha 715: O botão de submissão possui a propriedade `disabled={uploadingInvoice || !invoiceFileData}`.
     - Linhas 246-249 e 466-470: Ao abrir ou fechar o modal, as variáveis `invoiceFileData`, `invoiceFileName` e `invoiceNumberInput` são redefinidas para `null` / `""`.
   - Em `artifacts/api-server/demo-server.mjs`:
     - Linhas 46706-46709: `POST /api/minibar/orders/:id/invoice` valida `if (!fileData) return res.status(400).json({ success: false, error: "Arquivo da Nota Fiscal (Base64 ou URL) é obrigatório." })`.
   - **Status**: **APROVADO (Resiliente e Protegido)**.

2. **Preservação dos Dados Fiscais na Emissão da NF (`anserve-dashboard.tsx`)**:
   - `guest-minibar.tsx` envia na criação do pedido: `document`, `documentType` ("cpf" | "cnpj"), `companyName`, `email`, e `invoicePreference` ("detailed" | "water" | "minibar_consumption").
   - `demo-server.mjs` (linhas 46455-46461) persiste esses dados diretamente em `order.fiscalPreferences`.
   - `GET /api/minibar/invoices/pending` entrega o pedido completo para `anserve-dashboard.tsx`.
   - Em `anserve-dashboard.tsx`:
     - Linhas 270-292 (`renderPreferenceBadge`): exibe pílulas visuais específicas:
       - `"water"`: 💧 Lançar como "Água"
       - `"minibar_consumption"`: 🧊 Consumo de Frigobar
       - `"detailed"` / padrão: 📄 Discriminar Todos os Itens
     - Linhas 418-452: No card de cada pedido pendente, renderiza explicitamente o documento fiscal informado (`fiscalPreferences.documentNumber || guestDocument`), e-mail de envio, razão social corporativa (se houver) e os itens consumidos.
     - Linhas 611-652: No modal de anexo da NF, exibe o resumo completo de todos esses dados fiscais para o operador antes do upload.
   - **Status**: **APROVADO (Fidedigno e Completo)**.

3. **Consistência Matemática do Extrato de Repasse Financeiro (`demo-server.mjs`, `anserve-dashboard.tsx` e `minibar-admin.tsx`)**:
   - No backend (`demo-server.mjs`, linhas 47146-47196):
     - Cartão: `cardFees = cardOrdersAmount * 3.99%`
     - PIX: `pixFees = pixOrdersAmount * 0.99%`
     - Comissão: `commissionCorpFlats = totalOrdersAmount * commPercent`
     - Crédito de Cortesias: `courtesyRestockCost = sum(insp.restockedCourtesyTotalCost)`
     - Repasse Líquido: `netPayableToAnserve = totalOrdersAmount - cardFees - pixFees - commissionCorpFlats + courtesyRestockCost`
     - O JSON retornado por `GET /api/minibar/settlement` inclui `cardFees`, `pixFees`, `commissionCorpFlats`, `courtesyRestockCost` e `netPayableToAnserve`, mas **NÃO inclui** um campo com a chave `totalFees`.
   - Em `anserve-dashboard.tsx` (linhas 542):
     - Card de taxas usa fallback: `- R$ {Number(settlement.totalFees || (settlement.cardFees + settlement.pixFees) || 0).toFixed(2)}` (calcula corretamente a soma das taxas).
   - **ANOMALIA / FALHA DETECTADA em `minibar-admin.tsx`**:
     - Em `artifacts/limpeza/src/pages/minibar-admin.tsx` (linhas 822-829):
       ```tsx
       <Card className="rounded-3xl border border-border bg-card p-4 space-y-1">
         <span className="text-[11px] text-muted-foreground font-semibold">Taxas Financeiras Retidas</span>
         <div className="text-xl font-black text-red-600 dark:text-red-400">
           - R$ {Number(settlementData.totalFees || 0).toFixed(2)}
         </div>
         <span className="text-[10px] text-muted-foreground block">
           Mercado Pago + PIX Inter
         </span>
       </Card>
       ```
     - Como `settlementData.totalFees` é `undefined`, `settlementData.totalFees || 0` resulta em `0`, renderizando sempre `- R$ 0.00` nas Taxas Financeiras Retidas no painel de administração da CorpFlats.
     - Isso cria uma inconsistência visual e contábil na tela: o Repasse Líquido deduz as taxas de cartão e PIX corretamente, mas o card de taxas exibe `0.00`, gerando a falsa impressão de que a conta não fecha (`Total - 0 - Comissão != Líquido`).
   - **Status**: **REPROVADO (Necessita ajuste pontual em `minibar-admin.tsx` ou no backend)**.

4. **Estilização `@media print` no Gerador de Displays A6 (`minibar-admin.tsx`)**:
   - Em `artifacts/limpeza/src/pages/minibar-admin.tsx` (linhas 398-428):
     ```css
     @media print {
       body {
         background: white !important;
         color: black !important;
       }
       aside, nav, header, footer, .print\\:hidden {
         display: none !important;
       }
       .print-qr-grid {
         display: grid !important;
         grid-template-columns: repeat(2, 1fr) !important;
         gap: 16px !important;
         padding: 0 !important;
         margin: 0 !important;
       }
       .print-card-a6 {
         page-break-inside: avoid !important;
         break-inside: avoid !important;
         border: 1.5px solid #000 !important;
         border-radius: 12px !important;
         padding: 16px !important;
         height: 480px !important;
         display: flex !important;
         flex-direction: column !important;
         justify-content: space-between !important;
         align-items: center !important;
         text-align: center !important;
         box-sizing: border-box !important;
       }
     }
     ```
   - **ANOMALIA / FALHA DETECTADA**:
     - A instrução da missão determina: *"verifique se oculta menus, barras e elementos desnecessários e formata 1 card A6 limpo por página"*.
     - Ocultação de menus e barras: **Conforme** (`aside, nav, header, footer, .print:hidden` são ocultados).
     - Formatação de 1 card por página: **Não atende**. A regra atual força uma grade de 2 colunas (`grid-template-columns: repeat(2, 1fr) !important;`) sem `break-after: page;` ou `page-break-after: always;` em `.print-card-a6`.
     - Se o operador selecionar o formato de papel A6 na impressora para produzir os displays individuais, a grade de 2 colunas comprime cada card em 50% da largura (esmagando o QR Code e tornando-o ilegível).
     - Se for impresso em A4, os cards ficam dispostos em grade contínua com altura fixa de `480px`, sem garantir quebras de página limpas e unitárias por card A6.
   - **Status**: **REPROVADO (Necessita ajuste na folha de estilos `@media print`)**.

5. **Build de Produção Vite**:
   - Executado `npm --prefix artifacts/limpeza run build`:
   - Concluído com código de saída 0 em 49.25s, gerando `dist/public/` sem erros de compilação ou de tipos.
   - **Status**: **APROVADO**.

---

## 2. Logic Chain (Cadeia Lógica de Raciocínio)

1. A validação de arquivos para NF e a preservação de campos fiscais foram comprovadas diretamente no código-fonte do componente `anserve-dashboard.tsx` e no fluxo de ponta a ponta com o backend.
2. No extrato financeiro, enquanto a API do backend calcula com exatidão todas as retenções e deduções (`netPayableToAnserve = total - cardFees - pixFees - commission + courtesy`), ela retorna as taxas divididas em `cardFees` e `pixFees`. O componente `anserve-dashboard.tsx` lida com isso adequadamente através de `settlement.totalFees || (settlement.cardFees + settlement.pixFees) || 0`. Entretanto, `minibar-admin.tsx` acessa diretamente `settlementData.totalFees || 0`, o que resulta na renderização estática de `- R$ 0.00`, rompendo a fidelidade matemática visual apresentada ao administrador da CorpFlats.
3. No gerador de displays A6, a especificação requer formatação de "1 card A6 limpo por página". A presença de `grid-template-columns: repeat(2, 1fr)` combinada com a ausência de `break-after: page` / `page-break-after: always` impede a impressão direta unitária em folhas A6 ou o isolamento de 1 display por página.

---

## 3. Caveats (Ressalvas)

- Em estrito cumprimento às diretrizes de `AGENTS.md`, não foram executadas suítes globais de testes (`tests/*.test.mjs`). A verificação foi realizada por análise estática de código, auditoria de invariantes matemáticos e execução do build Vite oficial.

---

## 4. Conclusion (Conclusão & Veredito)

**Veredito**: **REQUEST_CHANGES**

O código do Milestone M3 apresenta excelente nível de implementação e segurança, com build 100% íntegro. Contudo, para aprovação final, são necessárias as seguintes duas correções pontuais:

1. **Correção no Extrato do Admin (`minibar-admin.tsx` / backend)**:
   - Em `artifacts/limpeza/src/pages/minibar-admin.tsx` (linha 825), atualizar a exibição das taxas retidas para:
     ```tsx
     - R$ {Number(settlementData.totalFees || ((settlementData.cardFees || 0) + (settlementData.pixFees || 0)) || 0).toFixed(2)}
     ```
     *(Ou, alternativamente, incluir `totalFees: Number((cardFees + pixFees).toFixed(2))` na resposta de `GET /api/minibar/settlement` em `demo-server.mjs`).*

2. **Ajuste na Impressão A6 (`minibar-admin.tsx`)**:
   - Ajustar o bloco `@media print` em `artifacts/limpeza/src/pages/minibar-admin.tsx` para garantir 1 card A6 limpo por página:
     - Remover o `grid-template-columns: repeat(2, 1fr)` ou alterá-lo para `display: block` / `grid-template-columns: 1fr` em impressão;
     - Adicionar `break-after: page !important; page-break-after: always !important;` na classe `.print-card-a6`;
     - (Opcional/Recomendado): Adicionar `@page { size: A6 portrait; margin: 8mm; }` ou dimensionamento proporcional para evitar cortes.

---

## 5. Verification Method (Método de Verificação Independente)

1. **Inspeção de Linha de Taxas**:
   - Verificar linha 825 de `artifacts/limpeza/src/pages/minibar-admin.tsx` e confirmar se utiliza a soma de `cardFees + pixFees` ou se o backend fornece `totalFees`.
2. **Inspeção de CSS de Impressão A6**:
   - Verificar linhas 406-428 de `artifacts/limpeza/src/pages/minibar-admin.tsx` e confirmar que cada `.print-card-a6` possui quebra de página garantida (`break-after: page;`) sem divisão forçada em duas colunas por página.
3. **Build de Produção**:
   ```bash
   npm --prefix artifacts/limpeza run build
   ```
   Deve compilar com código de saída 0.

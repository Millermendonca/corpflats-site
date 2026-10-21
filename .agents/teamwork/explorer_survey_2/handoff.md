# Handoff Report — Explorer Survey 2
**Mapeamento de Arquitetura do Frontend Mobile do Hóspede & Rotas de Autoatendimento do Frigobar**
**Data/Hora**: 2026-10-21T18:48:00Z  
**Origem**: explorer_survey_2 (teamwork_preview_explorer)  
**Destinatário**: Project Orchestrator (d10c20e2-adfb-4695-835e-52dd3bebe9a9)  
**Tipo de Handoff**: Hard (Task complete)  

---

## 1. Observation

1. **Roteamento Público no Wouter (`artifacts/limpeza/src/App.tsx`)**:
   - Em `App.tsx` (linhas 287–342), as rotas públicas de autoatendimento para hóspedes (`/reservar`, `/minha-reserva/:code/cafe`, `/minha-reserva/:code`, `/minha-reserva/:code/checkout`) não possuem guardas de sessão (`AdminGuard`, `StaffGuard`).
   - A linha 294 traz `<Route path="/minha-reserva/:code/cafe" component={GuestBreakfast} />` imediatamente antes da linha 298 `<Route path="/minha-reserva/:code" component={GuestPortalWrapper} />`. A avaliação de rotas do Wouter é top-down.
2. **Estrutura de Cards no Portal do Hóspede (`artifacts/limpeza/src/pages/guest-portal.tsx`)**:
   - Linha 1860: `DropdownMenuContent` com atalhos de navegação rápida para o hóspede.
   - Linhas 3228–3338: Bloco dedicado ao café da manhã (`<Card className="bg-gradient-to-b from-amber-50/50 via-white to-amber-50/20 ...">`).
   - Linhas 3341–3390: Bloco de Wi-Fi (`<Card className="bg-white rounded-3xl border border-slate-200/80 ...">`).
   - Linhas 4120–4205: Implementação de polling com detecção bancária a cada 2.500 ms para PIX e link seguro de redirecionamento para o Mercado Pago.
3. **Componentes UI no Repositório (`artifacts/limpeza/src/components/ui/`)**:
   - Total de 55 componentes prontos, incluindo `input-otp.tsx` (com `InputOTP`, `InputOTPGroup`, `InputOTPSlot`), `card.tsx`, `dialog.tsx`, `drawer.tsx`, `sheet.tsx`, `tabs.tsx`, `radio-group.tsx`, `accordion.tsx`, `badge.tsx` e `button.tsx`.
   - `lucide-react`: Ícones `Refrigerator`, `Package`, `Plus`, `Minus`, `CheckCircle2`, `Copy`, `QrCode`, `CreditCard`, `AlertTriangle`, `Sparkles` e `Coffee` verificados e disponíveis.
4. **Build e Tipagem (`artifacts/limpeza/vite.config.ts` e `package.json`)**:
   - O comando `npm --prefix artifacts/limpeza run build` executa `vite build --config vite.config.ts` e compila com sucesso (código de saída `0`) em `30.61s`, gerando os bundles em `artifacts/limpeza/dist/public` (`index.html`, `assets/index.js`, `assets/index.css`).
   - O comando `npm --prefix artifacts/limpeza run typecheck` revelou que o repositório base possui erros de TypeScript pré-existentes em telas administrativas legadas (`property-settings.tsx`, `reception-tablet.tsx`, `settings.tsx`, `surveys.tsx`, `whatsapp-chat.tsx`), enquanto o build do Vite passa sem erros.

---

## 2. Logic Chain

1. A partir da **Observação 1**, constatou-se que sub-rotas com `:code` no Wouter devem vir antes de rotas de padrão pai para evitar que `/minha-reserva/:code` engula rotas filhas. Logo, as rotas `/minha-reserva/:code/frigobar` e `/minha-reserva/:code/minibar` devem ser inseridas acima de `/minha-reserva/:code`.
2. A partir da **Observação 1 e 2**, as rotas `/frigobar/flat/:flatNumber` e `/frigobar/:flatNumber` destinam-se a acessos anônimos via escaneamento do QR Code físico do flat. Para evitar vazamento de dados de hóspedes no quarto ou cobranças não autorizadas, a tela deve exibir um portão de segurança solicitando os 4 últimos dígitos do celular cadastrado na reserva, validado via API `POST /api/minibar/flat-context`.
3. Por outro lado, quando o acesso ocorre via `/minha-reserva/:code/frigobar`, o parâmetro `:code` já é uma credencial unívoca da reserva gerada pelo PMS. Logo, essa rota não deve pedir os 4 dígitos e deve exibir a saudação e o catálogo imediatamente.
4. A partir da **Observação 2 e 3**, o componente `input-otp.tsx` (OTPInput) encaixa-se perfeitamente para a entrada dos 4 dígitos no mobile, com 4 slots destacados e teclado numérico automático.
5. Para evitar divergências de conferência na vistoria da Anserve, a exibição de um selo visual não-editável `"Padrão no flat: X un."` no card de cada produto permite que o hóspede compare o que vê no frigobar físico com o padrão contratual e marque exatamente o que consumiu.
6. A necessidade corporativa de reembolso de diárias exige 3 opções de descrição na NF: *(a) Discriminar todos os itens*, *(b) Lançar como "Água"*, ou *(c) Lançar como "Consumo de Frigobar"*.
7. A partir da **Observação 4**, o build do Vite (`npm run build`) é o gate oficial de entrega em produção (conforme `AGENTS.md`), que gera o `dist/`. O implementador deve escrever código com tipagem limpa sem depender do typecheck global da raiz que contém pendências legadas.

---

## 3. Caveats

- **Ambiente de Teste do Mercado Pago**: A integração do Mercado Pago depende de credenciais de produção ou sandbox configuradas em variáveis de ambiente (`MP_ACCESS_TOKEN`). No caso de ausência no ambiente de desenvolvimento, o backend deve retornar um link mock ou de teste seguro sem travar o frontend.
- **Armazenamento de Sessão dos 4 Dígitos**: Para que o hóspede não seja obrigado a redigitar os 4 dígitos a cada atualização de tela (refresh F5), recomenda-se salvar a autorização efetuada em `sessionStorage` indexado pelo número do flat durante o ciclo da aba do navegador.
- **No Caveats adicionais**: Todo o restante dos fluxos, rotas e componentes foi verificado diretamente no código fonte e testado em compilação.

---

## 4. Conclusion

O frontend mobile do frigobar é plenamente viável sem impacto na operação existente. A arquitetura recomendada consiste em:
1. Criar uma nova página de autoatendimento mobile em `artifacts/limpeza/src/pages/guest-minibar.tsx` que suporte os modos QR Code (`flatNumber`) e Link Direto (`code`).
2. Adicionar as rotas públicas correspondentes em `artifacts/limpeza/src/App.tsx`.
3. Inserir o card dedicado de Frigobar e item de navegação rápida em `artifacts/limpeza/src/pages/guest-portal.tsx`.
4. Utilizar os componentes shadcn/ui existentes (`InputOTP`, `Card`, `Badge`, `Button`, `RadioGroup`, `Tabs`, `Accordion`) e ícones `lucide-react` (`Refrigerator`, etc.).
5. Validar a compilação final com `npm --prefix artifacts/limpeza run build` gerando `dist/public`.

O relatório detalhado com especificações de tela, fluxos e código de referência está registrado em `.agents/teamwork/explorer_survey_2/analysis.md`.

---

## 5. Verification Method

Para verificar de forma independente as observações e conclusões deste handoff:

1. **Inspeção de Rotas e Precedência**:
   - Inspecionar `artifacts/limpeza/src/App.tsx` nas linhas 287–342 com `view_file` e atestar a ordem de sub-rotas públicas.
2. **Inspeção de Componentes UI**:
   - Verificar a existência de `input-otp.tsx` em `artifacts/limpeza/src/components/ui/input-otp.tsx`.
   - Executar no terminal:
     `node -e "import('lucide-react').then(l => console.log('Refrigerator:', Boolean(l.Refrigerator)))"` na pasta `artifacts/limpeza`.
3. **Verificação de Compilação Vite**:
   - Executar no terminal:
     `npm --prefix artifacts/limpeza run build`
     e confirmar código de saída `0` e geração dos arquivos em `artifacts/limpeza/dist/public`.
4. **Condição de Invalidação**:
   - O handoff seria invalidado se o Wouter não suportasse subcaminhos parametrizados antes da rota base, ou se a biblioteca de ícones/componentes não possuísse suporte aos elementos mobile descritos, o que foi refutado pelas verificações práticas acima.

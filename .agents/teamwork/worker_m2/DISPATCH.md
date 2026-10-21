# DISPATCH — Worker M2 (Guest Mobile Interface & Checkout)

**Agent**: `worker_m2` (teamwork_preview_worker)  
**Parent**: Project Orchestrator (`d10c20e2-adfb-4695-835e-52dd3bebe9a9`)  
**Date**: 2026-10-21T20:47:00Z  
**Scope**: Milestone M2 (Features F11 a F18)  

## Missão:
Implementar a interface mobile do hóspede e o checkout desacoplado para consumo de frigobar nos 19 flats do CorpFlats:
1. `artifacts/limpeza/src/pages/guest-minibar.tsx`
2. `artifacts/limpeza/src/App.tsx` (rotas públicas `/frigobar/flat/:flatNumber`, `/frigobar/:flatNumber`, `/minha-reserva/:code/frigobar`)
3. `artifacts/limpeza/src/pages/guest-portal.tsx` (card de frigobar e link de navegação rápida)
4. Build de verificação com `npm --prefix artifacts/limpeza run build` gerando `dist/` com saída 0.

## 2026-10-21T20:47:15Z
[Message from d10c20e2-adfb-4695-835e-52dd3bebe9a9]:
Você é o subagente worker_m2 (teamwork_preview_worker).
Seu diretório de trabalho exclusivo é:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2

O diretório raiz do projeto é:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager

Seu parent é o Project Orchestrator (conversation ID: d10c20e2-adfb-4695-835e-52dd3bebe9a9).

Leia atentamente os seguintes arquivos antes de começar:
1. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (seção 2026-10-21T18:26:13Z)
2. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md
3. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_16\PROJECT.md (Milestone M2 e Features F11 a F18)
4. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_2\analysis.md (Mapeamento completo da UI Mobile do Hóspede)
5. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_2\handoff.md
6. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2\DISPATCH.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Arquivos de escrita exclusiva do Worker M2:
- artifacts/limpeza/src/pages/guest-minibar.tsx (Criar novo componente)
- artifacts/limpeza/src/App.tsx (Adicionar rotas públicas antes de /minha-reserva/:code)
- artifacts/limpeza/src/pages/guest-portal.tsx (Adicionar card de atalho e navegação para o frigobar)
- artifacts/limpeza/dist/ (Build compilado pelo Vite)

Missão do Worker M2 (Interface Mobile do Hóspede & Checkout — Features F11 a F18):
1. **Página Mobile do Hóspede (`artifacts/limpeza/src/pages/guest-minibar.tsx`)**:
   - **Fluxo Dual de Acesso**:
     a) **Acesso por QR Code Físico no Flat** (`/frigobar/flat/:flatNumber` e `/frigobar/:flatNumber`):
        * Exibe tela de recepção destacando o número do flat.
        * Portão de verificação de segurança: solicita os 4 últimos dígitos do celular ou documento cadastrado na reserva utilizando o componente `InputOTP` (`InputOTPGroup`, `InputOTPSlot`).
        * Faz chamada para `POST /api/minibar/flat-context` passando `{ flatNumber, last4Digits }`.
        * Em caso de sucesso: exibe saudação calorosa com o primeiro nome do hóspede, armazena a sessão autorizada em `sessionStorage` para não exigir redigitação em refresh da aba, e carrega o catálogo e gabarito. Em caso de erro (401), exibe mensagem clara e amigável.
     b) **Acesso por Link Direto da Reserva** (`/minha-reserva/:code/frigobar`):
        * Lê o `:code` da URL.
        * Faz chamada direta para `GET /api/minibar/reservation-context/:code`.
        * Carrega imediatamente os dados do hóspede, catálogo e itens já pagos sem solicitar os 4 dígitos.
   - **Catálogo de Produtos & Gabarito Informativo Não-Editável**:
     * Grid/lista mobile de produtos com fotos (ou placeholders elegantes), nome, categoria (Água, Refrigerante, Cerveja, Snack, Cortesia, Café) e preço formatado em R$ (BRL).
     * Selo/badge visual destacado e **não-editável** indicando o padrão nominal que havia no frigobar (ex: `Padrão no flat: 4 un.`).
     * Controle de seleção com botões `-` e `+` para o hóspede marcar apenas o que consumiu.
     * Subtotal dinâmico atualizado em tempo real.
     * Seção com itens já pagos na mesma reserva (se houver), evitando dúvida do hóspede.
     * Item de cortesia de boas-vindas: destaque visual (ex: 2 cápsulas Nespresso + amendoim/balas gratuitos 1x por estadia; se já consumido ou excedente, exibe o valor do café avulso R$ 5.00).
   - **Aviso Mandatório de Desacoplamento Financeiro**:
     * Banner/card em destaque: "Aviso importante: O consumo de frigobar é um serviço independente e não pode ser faturado junto com a diária de hospedagem."
   - **Etapa de Checkout & Dados Fiscais**:
     * Formulário de opções de emissão da Nota Fiscal (RadioGroup):
       1. "Discriminar todos os itens consumidos"
       2. "Lançar tudo como 'Água'"
       3. "Lançar tudo como 'Consumo de Frigobar'"
     * Campo de Documento (CPF ou CNPJ) com formatação/máscara.
     * Campo de E-mail para recebimento automático da NF (pré-preenchido se vier do contexto da reserva).
   - **Modal e Fluxo de Pagamento**:
     * Opção PIX:
       - Chama `POST /api/minibar/orders` com `paymentMethod: "pix"`.
       - Exibe o QR Code dinâmico renderizado e botão Copia e Cola com feedback de cópia.
       - Inicia polling automático a cada 2.500 ms consultando `GET /api/minibar/orders/:id/status`.
       - Ao detectar `status: "pago"`, exibe imediatamente tela de confirmação/sucesso com animação e recibo, com mensagem informando que a Anserve emitirá a NF em breve.
     * Opção Cartão de Crédito:
       - Chama `POST /api/minibar/orders` com `paymentMethod: "credit_card"`.
       - Redireciona ou abre o Checkout Pro do Mercado Pago (`initPoint`).
2. **Roteamento em `artifacts/limpeza/src/App.tsx`**:
   - Importar `GuestMinibar` de `./pages/guest-minibar`.
   - Adicionar as rotas públicas antes de `<Route path="/minha-reserva/:code" ... />`:
     * `<Route path="/frigobar/flat/:flatNumber" component={GuestMinibar} />`
     * `<Route path="/frigobar/:flatNumber" component={GuestMinibar} />`
     * `<Route path="/minha-reserva/:code/frigobar" component={GuestMinibar} />`
3. **Card de Atalho em `artifacts/limpeza/src/pages/guest-portal.tsx`**:
   - Inserir card de Frigobar no portal do hóspede com visual premium (ícone `Refrigerator`, título "Frigobar & Bebidas", descrição com padrão de abastecimento e cortesias de boas-vindas, e botão de ação "Acessar Frigobar" apontando para `/minha-reserva/${code}/frigobar`).
   - Adicionar atalho no menu dropdown rápido de navegação do hóspede.
4. **Build de Verificação Obrigatório (AGENTS.md)**:
   - Executar: `npm --prefix artifacts/limpeza run build`
   - O comando deve retornar código de saída 0 e gerar os arquivos em `artifacts/limpeza/dist/`.
5. **Git Commit & Push**:
   - Conforme `AGENTS.md`: "Ao alterar arquivos em artifacts/limpeza/src, rode o build e inclua os arquivos gerados em artifacts/limpeza/dist/ no commit quando aplicável para garantir o deploy contínuo em produção. Sempre fazer git push por padrão."
   - Executar `git add artifacts/limpeza/src artifacts/limpeza/dist`
   - Executar `git commit -m "feat(minibar): implement guest mobile interface, OTP authentication and checkout flow (M2)"`
   - Executar `git push origin main`

# Original User Request

## Initial Request — 2026-11-11T10:24:36Z

Substituição e padronização visual das fotos do cardápio do frigobar por marcas reais comerciais com aprovação prévia, inclusão dos itens de cortesia do kit de boas-vindas com conferência individual por unidade, segregação zerada no extrato do hóspede e apuração financeira do custo dos copos d'água da Anserve para repasse.

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

## Requirements

### R1. Padronização e substituição das fotos do cardápio por marcas reais
Substituir todas as imagens de produtos do catálogo de frigobar por fotos de produtos e marcas comerciais reais (como Coca-Cola, Kinder Bueno e os demais itens do frigobar). Todas as imagens devem seguir padrão visual idêntico: fundo branco puro, mesmas proporções, ângulo de visão, distância e iluminação padronizada.

### R2. Galeria para validação e aprovação prévia das fotos
Antes de atualizar os arquivos definitivos no sistema, a equipe deve disponibilizar uma galeria ou painel de pré-visualização apresentando lado a lado cada foto proposta, nome do produto e marca escolhida, aguardando aprovação explícita do usuário para eventuais trocas antes da implantação final.

### R3. Inclusão dos itens de cortesia (Kit de Boas-Vindas) no cardápio
Inserir no cardápio do frigobar os itens que compõem o kit de boas-vindas: até 2 copos d'água mineral e até 2 amendoins Mendorato. Na interface do cardápio acessada pelo hóspede, estes itens devem ser exibidos em uma seção de destaque no topo intitulada "Kit de Boas-Vindas (Cortesia da Casa)", com selo visual de cortesia e valor R$ 0,00, claramente segregados dos produtos pagos.

### R4. Contabilização individual pela repositora sem reposição de estoque
Adaptar o checklist e a interface de conferência da repositora (painel Anserve/reposição) para permitir registrar individualmente a quantidade exata consumida de cada item de cortesia (de 0 a 2 copos d'água e de 0 a 2 amendoins Mendorato). O consumo não gera ordem de reposição do frigobar para a repositora (a reposição do kit ocorre na virada de hóspede pela camareira).

### R5. Segregação e valor zerado no extrato do hóspede
No extrato de consumo da reserva (tanto na visão do hóspede quanto no painel operacional/PMS), os itens de cortesia consumidos devem constar discriminados individualmente por unidade consumida em seção destacada e separada dos consumos pagos, sem cobrança e com valor exibido de R$ 0,00.

### R6. Distinção de fornecimento e apuração de repasse de custo à Anserve
Diferenciar a origem dos itens de cortesia nas regras financeiras e relatórios:
- Amendoins Mendorato: fornecimento próprio pelo proprietário/hotel (sem vínculo financeiro ou repasse à Anserve).
- Copos d'água: originários do estoque da Anserve, com apuração do volume de copos consumidos em cortesias multiplicado pelo seu preço de custo unitário, gerando o relatório/totalizador de repasse devido à Anserve pelo hotel.

## Acceptance Criteria

### Padronização Visual e Galeria de Fotos
- [ ] Todas as imagens dos produtos de frigobar utilizam fotos de produtos reais e marcas comerciais reconhecidas sobre fundo branco padronizado com proporções e ângulos uniformes.
- [ ] A galeria/painel de pré-visualização exibe todas as imagens propostas para aprovação prévia do usuário antes da aplicação definitiva no catálogo de produção.

### Kit de Boas-Vindas no Cardápio
- [ ] O cardápio do hóspede (`/frigobar/:flatNumber`) apresenta a seção destacada "Kit de Boas-Vindas (Cortesia da Casa)" no topo, contendo copos d'água e amendoins Mendorato.
- [ ] Os itens de cortesia exibem distintivo/badge de gratuidade e valor de R$ 0,00, sem permitir cobrança indevida no fechamento.

### Operação da Repositora e Estoque
- [ ] O painel de conferência da repositora permite registrar individualmente a quantidade exata consumida de cada item (0, 1 ou 2 copos d'água; 0, 1 ou 2 amendoins Mendorato).
- [ ] O consumo dos itens de cortesia não dispara ordem de reposição nem afeta o fluxo de reabastecimento de produtos pagos no painel de reposição.

### Extrato do Hóspede e PMS
- [ ] No extrato de conta do hóspede e nos detalhes de reserva do PMS, apenas as quantidades consumidas de cada item de cortesia aparecem discriminadas em bloco separado com valor R$ 0,00.
- [ ] O valor total a pagar da reserva não é acrescido por nenhum item pertencente ao kit de boas-vindas.

### Fechamento Financeiro Anserve vs Hotel
- [ ] O sistema calcula e totaliza a quantidade de copos d'água consumidos como cortesia multiplicada pelo custo unitário para apuração do valor a ser repassado pelo hotel à Anserve.
- [ ] O amendoim Mendorato é identificado como fornecimento próprio, sem gerar débito de repasse ou cobrança com a Anserve.
- [ ] A verificação ponta a ponta é validada nos flats e reservas de teste do ambiente de desenvolvimento.
## Follow-up — 2026-11-11T13:16:19Z

Não estão carrgando 

[Imagem anexada pelo usuário: tela do navegador em corpflats.com.br/frigobar exibindo o modal "INSPEÇÃO DE PADRONIZAÇÃO VISUAL (1024x1024) - Refrigerante • Comparação Lado a Lado", onde a coluna da esquerda "Foto Legada (IA / Genérica)" exibe a imagem, porém a coluna da direita "Nova Foto Comercial (Marca Real)" exibe ícone de imagem quebrada com alt "Coca-Cola Original 350ml", e os cards de produtos ao fundo como "Toddynho Tradicional 200ml" também exibem ícone de imagem quebrada.]

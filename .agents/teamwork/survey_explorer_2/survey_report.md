# Relatório de Investigação Técnica — Survey Explorer 2
**Projeto**: CorpFlats Guest-Flow-Manager  
**Data**: 2026-10-11  
**Autor**: Survey Explorer 2 (Frontend & Guest Portal Architecture)  
**Solicitação Autoritativa**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (Seção 2026-10-11T12:53:32Z)

---

## 1. Visão Geral Executiva

O objetivo desta investigação é mapear e detalhar a arquitetura de frontend do **Portal do Hóspede** (`artifacts/limpeza/src/pages/guest-portal.tsx`), do fluxo de **Pré-Check-in e Assinatura Digital** (`artifacts/limpeza/src/pages/guest-pre-checkin.tsx`), bem como os painéis operacionais correlatos (**Tablet da Portaria/Recepção**, **Controle de Garagem** e **Governança/Housekeeping**), projetando o fluxo de modificação e extensão de reservas em duas etapas (Step 1: Preview e Disponibilidade; Step 2: Liquidação Financeira antes da efetivação) com re-assinatura obrigatória e sincronização em tempo real.

---

## 2. Diagnóstico da Arquitetura Atual de Frontend

### 2.1 Componentes e Rotas do Portal do Hóspede
- **Rotas Ativas** (`artifacts/limpeza/src/App.tsx`):
  - `/minha-reserva/:code`, `/portal-hospede/:code`, `/guest-portal/:code`
  - Rotas de atalho: `/pix/:code`, `/copiar-pix/:code`
  - Suporte a parâmetros na URL: `?whatsapp=`, `?phone=`, `?tel=`, `?code=`, `?reserva=`, `?q=`
- **Arquivo Principal**: `artifacts/limpeza/src/pages/guest-portal.tsx` (3.664 linhas)
- **Estrutura de Visualização do Hóspede**:
  1. **Cabeçalho Limpo**: Logotipo CorpFlats, período da estadia, código localizador, atalho para suporte via WhatsApp.
  2. **Banner de Status do Check-in & Fechadura**: Status da Ficha FNRH, código de acesso à porta, instruções de chegada antecipada (*Early Check-in*).
  3. **Card Principal da Reserva** (linhas 1.850 a 1.926): Detalhes do flat (número, fotos, comodidades), período de entrada/saída, quantidade de hóspedes, canal de reserva.
     - *Botão Primário de Modificação*: Linhas 1.914 a 1.922: `"Modificar Reserva"` (visível apenas para reservas diretas via site/WhatsApp).
  4. **Card Financeiro e Pagamentos** (linhas 1.928 a 2.315): Valor total, valor pago, saldo em aberto. Quando pendente, exibe abas:
     - `PIX Instantâneo`: QR Code dinâmico/estático, Copia e Cola, botão de cópia com feedback, polling a cada 6s para verificação no Banco Inter (`/api/pms/reservations/:code/payment-status`).
     - `Cartão de Crédito`: Link oficial de checkout do Mercado Pago (`mpInitPoint`).
  5. **Card de Hóspedes e Documentos** (linhas 1.680 a 1.840): Lista de hóspedes da reserva, status individual de check-in, vínculo de fotos de biometria e documentos.
  6. **Card de Veículo & Garagem** (linhas 1.550 a 1.680): Cadastro de placa, marca, modelo e cor para liberação da vaga no Soho Residence.
  7. **Card de Políticas & Cancelamento** (linhas 3.020 a 3.060):
     - *Botão Secundário de Modificação*: Linhas 3.034 a 3.044: `"Modificar Reserva"`.

### 2.2 Análise da Implementação Atual de Modificação de Reserva
- **Estados no Componente** (linhas 106 a 114):
  ```tsx
  const [modifyModalOpen, setModifyModalOpen] = useState(false)
  const [modCheckinDate, setModCheckinDate] = useState("")
  const [modCheckoutDate, setModCheckoutDate] = useState("")
  const [modGuestCount, setModGuestCount] = useState(1)
  const [modReason, setModReason] = useState("")
  const [modifying, setModifying] = useState(false)
  const [modifyError, setModifyError] = useState<string | null>(null)
  const [modifySuccess, setModifySuccess] = useState<string | null>(null)
  ```
- **Modal Atual** (linhas 3.117 a 3.323):
  - Formulário único contendo apenas inputs de datas e hóspedes.
  - O cálculo de acréscimo de diárias e regra das 24 horas é estimado localmente no cliente (`lines 3132-3155`).
  - **Vulnerabilidade Arquitetural Identificada**:
    Ao submeter o formulário (`handleConfirmModify`, linhas 324 a 358), o frontend efetua um `POST` direto para `/api/pms/guest-portal/:code/modify`. No backend (`scripts/demo-server.mjs`, linha 15.456), as novas datas são gravadas imediatamente no banco de dados (`r.checkinDate = newCheckinDate; r.checkoutDate = newCheckoutDate;`), **mesmo quando há valor adicional a pagar (`additionalAmountToPay > 0`)**. O hóspede obtém a extensão da reserva sem ter pago as diárias extras!
  - Além disso, o endpoint atual **não invalida a assinatura do check-in**, de modo que o hóspede permanece com o check-in antigo válido mesmo tendo alterado o período e o número de diárias.

---

## 3. Especificação do Fluxo Multi-Etapas (Step 1 e Step 2)

Para cumprir os requisitos R1 e R2 do `ORIGINAL_REQUEST.md`, o modal de modificação de reserva no Portal do Hóspede deve ser reestruturado como um fluxo guiado de 2 passos com proteção total contra commit prematuro:

```
[ Abertura do Modal ]
        │
        ▼
[ STEP 1: Seleção & Simulação ]
  • Seleção de Check-in, Check-out e Hóspedes
  • Chamada a /api/pms/guest-portal/:code/modify-preview
  • Exibição de Badge de Disponibilidade (Verde/Vermelho)
  • Exibição do Demonstrativo Financeiro (Diárias atuais, novas, diferença, R$ adicional)
  • Regra de 24h: aviso contratual se redução for solicitada com menos de 24h
        │
        ├── Se Conflito de Calendário ──► [ Bloqueia Avanço com Alerta Claro ]
        │
        ├── Se additionalAmountToPay == 0 ──► [ Botão: "Confirmar Alteração Gratuitamente" ]
        │                                         │
        │                                         ▼
        │                               [ Commit Direto + Re-assinatura ]
        │
        └── Se additionalAmountToPay > 0 ──► [ Botão: "Avançar para Pagamento (R$ XX,XX) →" ]
                                                  │
                                                  ▼
                                      [ STEP 2: Checkout Provisório ]
                                        • Cria Intenção de Modificação (/modify-intent)
                                        • Reserva Original permanece 100% INTACTA
                                        • Exibe Abas PIX e Cartão de Crédito
                                        • PIX: QR Code, Copia e Cola, Polling de Verificação
                                        • Cartão: Checkout Pro Mercado Pago
                                        • Botão "Voltar e Ajustar" ou "Cancelar" (Abortar sem risco)
                                                  │
                                                  ▼ (Pagamento Verificado com Sucesso)
                                      [ STEP 3: Confirmação & Alerta de Re-assinatura ]
                                        • Commit atômico das datas e pagamento na reserva
                                        • Invalidação da assinatura prévia (needsReSignature = true)
                                        • Disparo de WhatsApp/E-mail com link de re-assinatura
                                        • CTA em destaque: "Assinar Ficha Atualizada Agora →"
```

### 3.1 Detalhamento do Step 1 (Preview & Disponibilidade)
- **Endpoint Backend**: `POST /api/pms/guest-portal/:code/modify-preview`
  - *Payload*: `{ newCheckinDate, newCheckoutDate, newGuestCount, reason }`
  - *Processamento*:
    - Valida canal direto (site/WhatsApp).
    - Valida integridade das datas (`newCheckoutDate > newCheckinDate`).
    - Valida conflito de agenda no mesmo flat com outras reservas ativas (`status != 'cancelada'`).
    - Calcula diárias originais, novas diárias, diferença em dias e tarifa diária oficial.
    - Se aumento de diárias: calcula `additionalAmountToPay = extraNights * dailyRate`.
    - Se redução de diárias: verifica o corte de 24h antes das 14h do check-in original. Se dentro das 24h, `refundAmount = 0` (não reembolsável). Se antes das 24h, `refundAmount = reducedNights * dailyRate`.
  - *Resposta do Endpoint*:
    ```json
    {
      "available": true,
      "conflict": false,
      "oldNights": 2,
      "newNights": 4,
      "nightsDiff": 2,
      "dailyRate": 180.00,
      "oldTotalAmount": 360.00,
      "newTotalAmount": 720.00,
      "additionalAmountToPay": 360.00,
      "refundAmount": 0,
      "isUnder24h": false,
      "nonRefundableReduction": false,
      "policyNotice": "Acréscimo de 2 diárias (+R$ 360,00).",
      "requiresPayment": true
    }
    ```
- **Componentes de UI no Step 1**:
  - **Badge de Disponibilidade**:
    - *Disponível*: `<Badge className="bg-emerald-600 text-white gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Disponibilidade Confirmada para o Flat {flat}</Badge>`
    - *Indisponível*: `<Badge className="bg-rose-600 text-white gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Período Indisponível (Conflito de Agenda)</Badge>` com mensagem explicativa e botão desabilitado.
  - **Card de Demonstrativo de Custos** (*Cost Breakdown*):
    - Tabela visual com estilo Tailwind card:
      - Período Atual vs. Novo Período
      - Contagem de diárias (`2 diárias → 4 diárias (+2)`)
      - Valor da diária base
      - Linha destacada: **Valor Adicional a Liquidar: R$ 360,00**
  - **Botões de Ação**:
    - `"Fechar/Cancelar"`: Fecha o modal sem qualquer alteração.
    - `"Avançar para Pagamento"` (se > 0) ou `"Confirmar Alteração Gratuitamente"` (se == 0).

### 3.2 Detalhamento do Step 2 (Pagamento & Polling)
- **Endpoint de Criação da Intenção de Pagamento**:
  - `POST /api/pms/guest-portal/:code/modify-intent`
  - Cria um registro provisório em `db.reservationModificationIntents` com validade de 30 minutos.
  - Gera chave PIX Copia e Cola específica para o valor adicional (`additionalAmountToPay`) e preferência de pagamento Mercado Pago (`mpInitPoint`).
  - **Importante**: As datas originais da reserva (`checkinDate`, `checkoutDate`) permanecem intactas no banco de dados.
- **Componentes de UI no Step 2**:
  - **Seletor de Abas**: `PIX Instantâneo` (padrão) e `Cartão de Crédito`.
  - **Aba PIX**:
    - QR Code de 200x200 gerado dinamicamente.
    - Caixa com o código PIX Copia e Cola e botão estilizado com feedback instantâneo de cópia.
    - Indicador visual animado: `"Verificando pagamento em tempo real junto ao Banco Inter..."` com ping verde.
    - Polling com `setInterval` a cada 5 segundos no endpoint `/api/pms/guest-portal/:code/modify-intent/:intentId/status`.
    - Botão manual: `"Já fiz o PIX • Verificar Pagamento"`.
  - **Aba Cartão de Crédito**:
    - Botão de redirecionamento para o Mercado Pago Checkout Pro (`target="_blank"`).
    - Botão de verificação manual pós-retorno do checkout.
  - **Botão de Voltar**: Permite retornar ao Passo 1 para ajustar as datas caso o hóspede desista daquela extensão.
  - **Transição Pós-Pagamento**:
    - Assim que o polling detecta a compensação:
      - O backend efetiva as novas datas, grava a cobrança no histórico de pagamentos (`r.payments`), registra o log de auditoria e invalida a assinatura anterior (`needsReSignature = true`).
      - O frontend exibe a tela de sucesso com o link em destaque para a re-assinatura da Ficha de Hospedagem.

---

## 4. Re-assinatura Obrigatória & Fluxo do Pré-Check-in

### 4.1 Por que a re-assinatura é mandatória?
Conforme a legislação hoteleira brasileira (Decreto Federal nº 7.381/2010 e normas da Embratur/Ministério do Turismo), a Ficha Nacional de Registro de Hóspedes (FNRH) atesta formalmente o período de permanência e a unidade habitacional (flat) ocupada. Qualquer alteração de datas ou de acomodação invalida juridicamente o documento assinado anteriormente, pois o documento forense passa a divergir do período real de estadia. Além disso, as portarias do edifício Soho Residence utilizam a FNRH assinada para autorizar o acesso às chaves e ao prédio.

### 4.2 Impacto no Portal do Hóspede (`guest-portal.tsx`)
1. **Banner de Re-assinatura no Topo**:
   - Quando `reservation.needsReSignature || currentGuest?.needsReSignature` for verdadeiro:
   - Renderizar um banner fixo de alerta no topo do portal com alta visibilidade:
     ```tsx
     <div className="p-4 sm:p-5 bg-amber-50 border-2 border-amber-300 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
       <div className="flex items-start gap-3">
         <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
         <div>
           <strong className="text-amber-950 font-bold block text-sm">
             Acomodação ou Período Alterado • Re-assinatura Obrigatória
           </strong>
           <p className="text-xs text-amber-800">
             Suas datas ou acomodação foram atualizadas. Por exigência da portaria e conformidade jurídica, assine sua declaração com as novas informações.
           </p>
         </div>
       </div>
       <Button
         onClick={() => setLocation(`/pre-checkin/${code}?resign=1`)}
         className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 rounded-xl"
       >
         Reassinar Ficha de Check-in →
       </Button>
     </div>
     ```
2. **Atualização do Card de Status de Check-in**:
   - Ajustar o cálculo de `isPreCheckinDone` para que retorne `false` se `needsReSignature` for `true`.
   - Substituir o selo `"Check-in Concluído"` por `"Re-assinatura Pendente (Acomodação/Datas Alteradas)"`.
   - Exibir alerta ao lado da senha da fechadura/chave informando que o acesso na portaria depende da assinatura atualizada.

### 4.3 Experiência do Hóspede em `guest-pre-checkin.tsx`
- **Preservação de Dados Cadastrais**:
  - O sistema já preserva 100% dos dados preenchidos: Nome completo, CPF, telefone, e-mail, data de nascimento, endereço completo, foto de documento (frente/verso), biometria selfie e dados do veículo. O hóspede **não precisa digitar nada novamente nem tirar novas fotos**.
- **Aceleração via Parâmetro `?resign=1`**:
  - Quando a URL contém `?resign=1`, o fluxo do `guest-pre-checkin.tsx` avança automaticamente para o **Passo 3 (Assinatura Digital)**.
  - O componente exibe o banner existente na linha 2.067:
    `"Reserva Atualizada • Nova Assinatura Necessária: Sua acomodação ou período da estadia foi atualizado."`
  - O hóspede visualiza o resumo com o novo período e o flat atualizado, assina na tela sensível ao toque / canvas (`<canvas ref={canvasRef}>`), aceita os termos e clica em `"Confirmar e Assinar Nova Ficha"`.
- **Limpeza do Flag `needsReSignature` no Backend**:
  - Ao processar `POST /api/pms/pre-checkin`:
    - O backend deve limpar o flag:
      ```js
      delete targetGuest.needsReSignature;
      targetGuest.needsReSignature = false;
      if (r.guests.every(g => !g.needsReSignature)) {
        delete r.needsReSignature;
        r.needsReSignature = false;
        delete r.reSignatureReason;
      }
      ```
    - Compilar o novo PDF oficial com trilha forense e hash criptográfico SHA-256 (`generateFnrhPdf`).
    - Despachar o PDF assinado atualizado para o e-mail da recepção (`receptionEmail`) imediatamente.

---

## 5. Sincronização Operacional dos Painéis

### 5.1 Tablet da Portaria / Recepção (`pages/reception-tablet.tsx`)
- O terminal da portaria consome `/api/reception/today` a cada 15 segundos.
- O endpoint calcula `hasCompletedCheckin: Boolean(r.fnhrCompleted && !r.needsReSignature)`.
- Quando `needsReSignature` é verdadeiro:
  - O hóspede aparece na lista com status de pré-check-in pendente.
  - A portaria é instruída a solicitar a assinatura digital rápida no smartphone do hóspede antes da entrega das chaves.
- Assim que o hóspede assina:
  - O polling de 15 segundos atualiza instantaneamente para `hasCompletedCheckin = true`, liberando a autorização de entrada.

### 5.2 Painel de Garagem & Vagas (`pages/garage-dashboard.tsx`)
- Consome `/api/pms/garage/daily-sheet`.
- As placas vinculadas às reservas atualizam as datas de autorização da vaga rotativa automaticamente, sincronizando com a portaria do Soho Residence.

### 5.3 Governança & Café da Manhã
- Os pedidos de café da manhã fora da nova janela de estadia são cancelados automaticamente pelo backend com justificativa registrada, e pedidos dentro da janela são reativados.
- As solicitações de limpeza no mapa de tarefas de camareiras (`cleaningRequests`) sincronizam a data de faxina de check-in e check-out.

---

## 6. Auditoria do Sistema de Build e Tipagem

| Item | Status | Observações |
|---|---|---|
| **Vite Production Build** (`npm run build`) | **APROVADO (Exit Code 0)** | Compilado em 45.37 segundos com geração dos bundles em `dist/public/assets/` (`index.js` 3.296 kB, `index.css` 397 kB). |
| **Paridade dos Servidores Gêmeos** | **100% IDÊNTICO (SHA-256)** | `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` possuem hash idêntico: `4FDDE099E92A3036D49E7C1ED5E1E57CF3568719D0E7573D4AC6F6AB9B92CAEB`. |
| **Arquivos do Portal no Typecheck** | **APROVADO** | Nem `guest-portal.tsx` nem `guest-pre-checkin.tsx` possuem erros no `tsc`. |
| **Pre-existing Lints no Codebase** | Identificados | Avisos pontuais pré-existentes em páginas administrativas secundárias (`property-settings.tsx`, `settings.tsx`, `surveys.tsx`, `whatsapp-chat.tsx`), não afetando a compilação do Vite. |

---

## 7. Recomendações Técnicas para a Etapa de Implementação

1. **Backend Endpoints Necessários**:
   - `POST /api/pms/guest-portal/:code/modify-preview`: Simulação pura (sem alteração no banco), retornando disponibilidade, cálculo de diárias, valor a pagar e regras de 24h.
   - `POST /api/pms/guest-portal/:code/modify-intent`: Criação da intenção temporária de modificação e geração dos dados de pagamento PIX (QR Code e Copia e Cola) e Mercado Pago para o valor adicional.
   - `GET /api/pms/guest-portal/:code/modify-intent/:intentId/status`: Consulta do status do pagamento da modificação com efetivação atômica quando liquidado.
   - Ajustar o `POST /api/pms/guest-portal/:code/modify` para casos onde `additionalAmountToPay === 0` (gratuito) para invalidar a assinatura (`needsReSignature = true`) e notificar hóspede e portaria.
   - Ajustar `POST /api/pms/pre-checkin` para limpar `needsReSignature = false` ao concluir a assinatura.
2. **Frontend Guest Portal (`guest-portal.tsx`)**:
   - Refatorar o modal de modificação para máquina de estados em 3 passos: `step === 1` (Seleção & Preview), `step === 2` (Checkout PIX/Cartão), `step === 3` (Sucesso & Alerta de Re-assinatura).
   - Implementar o Banner de Re-assinatura no topo da página e ajustar `isPreCheckinDone` para respeitar `needsReSignature`.
3. **Frontend Pré-Check-in (`guest-pre-checkin.tsx`)**:
   - Garantir que `?resign=1` ou `res.needsReSignature` direcione o hóspede diretamente para o Passo 3 (Assinatura), mantendo os dados preservados.
4. **Deploy & Repositório**:
   - Executar `npm run build` na pasta `artifacts/limpeza` e versionar os arquivos gerados em `artifacts/limpeza/dist/`.
   - Manter a paridade byte-a-byte entre `artifacts/api-server/` e `scripts/`.
   - Realizar `git push` imediato ao concluir commits.

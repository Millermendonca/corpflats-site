# Relatório de Arquitetura Frontend — Chave Seletora de Check-in (FNRH/Gov.br vs Próprio) & Links Dinâmicos

**Data:** 2026-10-07  
**Autor:** `teamwork_preview_explorer` (Explorer Survey Frontend)  
**Ambiente de Frontend:** `artifacts/limpeza/` (React 18 + Vite + Tailwind CSS + TanStack Query + Radix UI)  
**Destino de Build:** `artifacts/limpeza/dist/public`  

---

## 1. Visão Geral e Arquitetura do Frontend

O frontend da CorpFlats (Guest-Flow-Manager) é uma Single Page Application construída com React 18, TypeScript, Tailwind CSS (v4 via `@tailwindcss/vite`), TanStack Query v5 e Wouter para roteamento leve.

O objetivo desta investigação é mapear com precisão cirúrgica como implementar:
1. **Chave seletora global e dinâmica (Toggle Switch)** no Painel Administrativo para alternar entre:
   - **Check-in Próprio (CorpFlats)**
   - **Check-in Gov.br (FNRH Digital - Ministério do Turismo / SERPRO)**
2. **Badges visuais de status** indicando o modo ativo e a integridade/saúde da conexão com a API do SERPRO FNRH.
3. **Botões e gatilhos de "Copiar Link de Check-in"** em todas as interfaces relevantes (Calendário PMS, Hover Card da reserva, Modal de detalhes da reserva, Modal de links úteis, Terminal da Portaria/Tablet, Chat e Automações WhatsApp).
4. **Fluxo de build do frontend** (`npm run build` em `artifacts/limpeza` gerando arquivos em `dist/public`).

---

## 2. Página de Configurações (`settings.tsx` vs `property-settings.tsx`)

### 2.1 Mapeamento das Páginas Administrativas Existentes

O sistema possui duas telas centrais de parametrização administrativa sob a rota `/configuracoes` e `/propriedade`:

1. **`artifacts/limpeza/src/pages/settings.tsx` (`/configuracoes`)**:
   - **Título na Interface:** *"Integrações Técnicas & Nuvem"*
   - **Componente:** `export default function SystemSettings()`
   - **Foco:** Credenciais de nuvem (Cloudflare R2), Sincronização Microsoft Graph (OneDrive), Conexão Z-API (WhatsApp), SMTP Zoho Mail, Google Gemini AI (Análise de Sentimentos), Gateways Financeiros (Banco Inter PIX e Mercado Pago), e Gestão de Usuários da Equipe.
   - **Estrutura:** Layout em cards modulares dispostos em grid responsivo com badges de status ("Configurado", "Pendente", "Ativo") e modais com formulários de credenciais.

2. **`artifacts/limpeza/src/pages/property-settings.tsx` (`/propriedade`)**:
   - **Título na Interface:** *"Gestão da Propriedade & Regras"*
   - **Componente:** `export default function PropertySettings()`
   - **Foco:** Cadastro de flats, horários oficiais de check-in (`checkinTime`) e check-out (`checkoutTime`), regras da casa, termos contratuais e política pet.

### 2.2 Ciclo de Vida: Como as Configurações São Consultadas e Atualizadas

As configurações globais do sistema utilizam o cliente tipado `@workspace/api-client-react` (`lib/api-client-react/src/generated/api.ts`):

- **Consulta da API:**
  ```tsx
  import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react"
  import { useQueryClient } from "@tanstack/react-query"
  
  const queryClient = useQueryClient()
  const { data: settings, isLoading } = useGetSettings()
  ```
  - Dispara `GET /api/settings`.
  - No backend (`demo-server.mjs`, linha 10042), o endpoint retorna todo o conteúdo de `db.settings`.
  - Cache Key: `getGetSettingsQueryKey()` retorna `['/api/settings']`.

- **Atualização da API (Sem Reload de Página):**
  ```tsx
  const updateSettings = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        // Invalida cache de configurações
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() })
        // Invalida cache de reservas para atualizar links gerados
        queryClient.invalidateQueries({ queryKey: ['/api/pms/reservations'] })
      }
    }
  })
  
  // Exemplo de mutação em tempo real:
  await updateSettings.mutateAsync({
    data: {
      checkinProvider: nextProvider // 'proprio' | 'gov_fnrh'
    } as any
  })
  ```
  - Dispara `PATCH /api/settings` enviando payload JSON.
  - No backend (`demo-server.mjs`, linha 10054), `app.patch("/api/settings")` extrai os campos de `req.body`, atualiza `db.settings` na memória e chama `saveDatabase()` gravando imediatamente em `data/database.json`.
  - Retorna `res.json({ ...db.settings })`.
  - Como o TanStack Query gerencia o estado da aplicação e `queryClient.invalidateQueries` é chamado, todos os componentes que consomem as configurações atualizam imediatamente seu estado visual **sem necessidade de restart do servidor ou recarregamento (F5) do navegador**.

---

## 3. Componentes de UI Disponíveis no Projeto

Todos os componentes necessários para a construção do seletor e badges já estão implementados na pasta `artifacts/limpeza/src/components/ui/`:

| Componente | Arquivo | Biblioteca Base | Descrição & Uso Recomendado |
|---|---|---|---|
| **Switch** | `src/components/ui/switch.tsx` | `@radix-ui/react-switch` | Componente nativo de alternância acessível com transição suave (`data-[state=checked]:bg-primary`). |
| **Badge** | `src/components/ui/badge.tsx` | `class-variance-authority` | Badges de status com variantes `default`, `secondary`, `destructive`, `outline` e classes utilitárias personalizadas. |
| **Card** | `src/components/ui/card.tsx` | Tailwind CSS | Containers padronizados (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`). |
| **Button** | `src/components/ui/button.tsx` | Tailwind CSS | Botões com suporte a variantes `default`, `outline`, `ghost`, `secondary` e tamanhos `sm`, `icon`, `default`. |
| **Dialog / Modal** | `src/components/ui/dialog.tsx` | `@radix-ui/react-dialog` | Modais acessíveis para testes manuais e parametrização de credenciais do SERPRO. |
| **Tabs** | `src/components/ui/tabs.tsx` | `@radix-ui/react-tabs` | Abas de navegação interna caso agrupadas por categoria. |
| **Ícones** | `lucide-react` | `lucide-react` | Ícones oficiais do design system: `ShieldCheck`, `Building2`, `ExternalLink`, `Copy`, `Check`, `CheckCircle2`, `AlertTriangle`, `AlertCircle`, `RefreshCw`, `Zap`, `Radio`. |

---

## 4. Design & Mockup do Componente da Chave Seletora

### 4.1 Localização Proposta no Painel Administrativo

**Localização Principal:** `artifacts/limpeza/src/pages/settings.tsx`
- Inserir um **Card Destaque (Hero Card)** no topo da página de configurações (logo abaixo do header principal e antes da *Seção 1: Nuvem e Sincronização*), garantindo máxima visibilidade aos administradores.
- **Card Título:** *"🏛️ Provedor Global de Check-in & FNRH Digital (Ministério do Turismo / SERPRO)"*
- **Card Descrição:** *"Defina se os hóspedes realizarão o pré-check-in pela plataforma interna CorpFlats ou diretamente pelo portal Gov.br com homologação oficial na API SERPRO."*

### 4.2 Estados da Chave e Badges

A interface deve apresentar visualmente dois blocos/cards selecionáveis ou um Toggle Switch de alta legibilidade:

1. **Opção A: Check-in Próprio (CorpFlats)**
   - **Ícone:** `<Building2 className="w-5 h-5 text-sky-600" />`
   - **Título:** Check-in Próprio (CorpFlats)
   - **Descrição:** Formulário interno de preenchimento, upload de fotos de documentos, assinatura na tela, validação forense SHA-256 e gravação em PDF no bucket R2.
   - **Badge Quando Ativo:** `<Badge className="bg-sky-600 text-white font-bold">✓ Modo Próprio Ativo</Badge>`

2. **Opção B: Check-in Gov.br (FNRH Digital - Ministério do Turismo / SERPRO)**
   - **Ícone:** `<ShieldCheck className="w-5 h-5 text-emerald-600" />`
   - **Título:** Check-in Gov.br (FNRH Digital Oficial)
   - **Descrição:** Registra a reserva via `POST /reservas` na API SERPRO v2.4.2 e gera o link oficial `https://fnrh.turismo.gov.br/precheckin/...` para preenchimento com login Gov.br.
   - **Badge Quando Ativo:** `<Badge className="bg-emerald-600 text-white font-bold">✓ Modo Gov.br Ativo</Badge>`

### 4.3 Monitoramento de Saúde da Conexão SERPRO (Health Status)

Para cumprir o requisito de saúde da conexão:
- **Endpoint do Backend:** `GET /api/fnrh-serpro/status` (ou `GET /api/settings/fnrh/health`)
  - Retorno JSON:
    ```json
    {
      "provider": "gov_fnrh",
      "healthy": true,
      "environment": "homologacao",
      "latencyMs": 145,
      "lastCheckedAt": "2026-10-07T15:30:00Z",
      "authValid": true,
      "error": null
    }
    ```
- **Consulta no Frontend via TanStack Query:**
  ```tsx
  const { data: serproStatus, isLoading: loadingSerpro, refetch: testSerpro } = useQuery({
    queryKey: ['serpro-health-status'],
    queryFn: async () => {
      const res = await fetch("/api/fnrh-serpro/status")
      if (!res.ok) throw new Error("Erro ao consultar status SERPRO")
      return res.json()
    },
    refetchInterval: 30000, // Polling de 30s
    staleTime: 15000
  })
  ```
- **Indicador Visual de Saúde (Badge Dinâmico):**
  - **Conexão Saudável:**
    ```tsx
    <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 gap-1.5 text-xs py-1">
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
      <span>SERPRO Conectado ({serproStatus?.latencyMs || 0}ms) • Homologação</span>
    </Badge>
    ```
  - **Conexão Instável / Falha / Fallback Automático Ativo:**
    ```tsx
    <Badge className="bg-rose-500/10 text-rose-600 border border-rose-500/30 gap-1.5 text-xs py-1 animate-pulse">
      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
      <span>SERPRO Indisponível • Fallback Automático Próprio Ativo</span>
    </Badge>
    ```

---

## 5. Mapeamento dos Botões "Copiar Link de Check-in" e Interfaces

Abaixo está o inventário de todos os locais onde o link de pré-check-in é manipulado no frontend e que devem utilizar a resolução centralizada de URL:

### 5.1 Calendário PMS & Hover Card de Reservas

1. **`artifacts/limpeza/src/components/reservation-hover-card.tsx`**:
   - **Linha 196:** Definição da URL:
     ```ts
     const preCheckinUrl = `${originUrl}/pre-checkin/${resItem.code || resItem.id}`
     ```
   - **Linhas 781–790:** Botão que abre a página de check-in:
     ```tsx
     <a
       href={preCheckinUrl}
       target="_blank"
       rel="noreferrer"
       className="h-7 px-2 rounded-xl border border-indigo-200 ... font-bold text-[11px] inline-flex items-center gap-1"
       title="Abrir Link de Pré-Check-in Digital"
     >
       <FileText className="w-3 h-3 text-indigo-600" />
       <span>Check-in</span>
     </a>
     ```
   - **Melhoria Necessária:** Transformar o botão em grupo (semelhante ao grupo do Portal nas linhas 742–765), oferecendo tanto a navegação direta quanto o botão com ícone de `Copy` para copiar a URL resolvida para o clipboard.

2. **`artifacts/limpeza/src/pages/pms-calendar.tsx`**:
   - **Linhas 7353–7361 (Modal "Links Úteis da Reserva"):**
     ```ts
     {
       id: "precheckin",
       title: "Pré Check-in Digital",
       url: `${origin}/pre-checkin/${resCode}`,
       desc: "Formulário para o hóspede preencher os dados dos acompanhantes, fotos de documentos e assinatura antecipada.",
       icon: FileText,
       ...
     }
     ```
     - O botão de cópia individual (`handleCopySingle`) copia `url`.
     - A função de cópia geral (`handleCopyAllFormatted`, linha 7417) formata o texto:
       ```ts
       `📝 *Pré Check-in Digital:*\n${origin}/pre-checkin/${resCode}\n\n`
       ```
     - A ação de disparo individual no WhatsApp (`handleSendWa`, linha 7433) envia esta mesma URL.
   - **Linhas 5664–5825 (Seção Disparar WhatsApp Z-API no Modal de Detalhes da Reserva):**
     - Exibe botões para disparar mensagens rápidas, incluindo `qm_summary_checkin` ("Enviar Resumo + Check-in").
     - O clique invoca `dispatchQuickMessage(qm, effectiveRes)`.

### 5.2 Hook Central de Mensagens Rápidas & Tags de Mensagem

**`artifacts/limpeza/src/hooks/use-quick-messages.ts`**:
- **Linha 368:** `const linkCheckin = `${origin}/pre-checkin/${resCode}``
- **Linha 409:** Mapeamento da tag:
  ```ts
  "{{link_checkin_digital}}": linkCheckin,
  ```
- **Linhas 163:** Botão padrão da mensagem rápida `qm_summary_checkin`:
  ```ts
  buttons: [
    { id: "btn_chk", type: "URL", label: "📝 Fazer Check-in Online", url: "{{link_checkin_digital}}" },
    ...
  ]
  ```
- **Linhas 452–468:** Resolução dinâmica das URLs dos botões no texto gerado (`buildFullWhatsAppTextMessage`).

### 5.3 Terminal da Portaria / Tablet

**`artifacts/limpeza/src/pages/reception-tablet.tsx`**:
- **Linhas 771–783:** Na lista de hóspedes pendentes de check-in:
  ```ts
  const preCheckinUrl = `${window.location.origin}/pre-checkin/${item.code || item.id}?guest=${g.index || gIdx + 1}`
  ```
  - Dispara mensagem via WhatsApp com o link.
  - Deve passar a utilizar a função utilitária `getCheckinUrl(item, g.index || gIdx + 1)`.
  - Recomenda-se adicionar um botão adjacente de "Copiar Link" para uso rápido pelos recepcionistas.

### 5.4 Outras Interfaces com Menções de Link de Check-in

1. **`artifacts/limpeza/src/pages/whatsapp-chat.tsx` (Linha 607):** Template rápido de envio no chat de WhatsApp Web.
2. **`artifacts/limpeza/src/pages/crm-guests.tsx` (Linhas 430 e 1001):** Disparo de boas-vindas ao hóspede e abertura de ficha no CRM.
3. **`artifacts/limpeza/src/pages/whatsapp-automation.tsx` (Linhas 259 e 1114):** Pré-visualização de réguas automatizadas com a tag `{{link_checkin_digital}}`.
4. **`artifacts/limpeza/src/pages/guest-portal.tsx` (Linhas 1287, 1363, 1612):** Botões no portal do hóspede para iniciar o pré-check-in.
5. **`artifacts/limpeza/src/components/booking-funnel-modal.tsx` (Linha 2013):** Modal de confirmação pós-reserva no motor direto.

---

## 6. Proposta de Implementação Técnica do Helper de URLs

Para garantir a coerência universal entre frontend e backend (em conformidade com o Requisito R3), deve ser criado um módulo utilitário no frontend:

**Caminho:** `artifacts/limpeza/src/lib/checkin-url.ts`

```ts
/**
 * Retorna a URL de pré-check-in apropriada de acordo com o provedor ativo e
 * a presença do link oficial SERPRO / Ministério do Turismo.
 *
 * @param reservation Objeto da reserva (contendo code, serproPrecheckinUrl, checkinUrl, etc.)
 * @param guestIndex Índice do hóspede (padrão: 1)
 * @param baseUrl URL base opcional (calculada a partir de window.location.origin se omitida)
 */
export function getCheckinUrl(
  reservation: any,
  guestIndex: number = 1,
  baseUrl?: string
): string {
  const origin = baseUrl || (typeof window !== "undefined" ? window.location.origin : "https://corpflats.onrender.com")

  // Se o backend já enviou a URL resolvida de ponta a ponta:
  if (reservation?.checkinUrl) {
    return reservation.checkinUrl
  }

  // Se a reserva já possui o link oficial SERPRO / Gov.br gerado:
  if (reservation?.serproPrecheckinUrl) {
    return reservation.serproPrecheckinUrl
  }

  // Fallback Inteligente / Modo Próprio:
  const code = reservation?.code || reservation?.reservationCode || String(reservation?.id || "")
  const guestQuery = guestIndex > 1 ? `?guest=${guestIndex}` : ""
  return `${origin}/pre-checkin/${code}${guestQuery}`
}
```

Dessa forma, qualquer componente no frontend pode importar `getCheckinUrl` e ter garantia imediata de resolução correta com fallback.

---

## 7. Fluxo de Build do Frontend e Diretrizes de Entrega

1. **Configuração de Build (`vite.config.ts`):**
   - Diretório de saída: `artifacts/limpeza/dist/public` (`outDir: path.resolve(import.meta.dirname, 'dist/public')`).
   - Opções de Rollup:
     - Entrada fixa: `assets/index.js`
     - CSS fixo: `assets/index.css`
     - Chunks com hash: `assets/[name]-[hash].js`
2. **Script de Execução:**
   ```bash
   cd artifacts/limpeza
   npm run build
   ```
3. **Regra de Versionamento (`AGENTS.md`):**
   - Toda alteração nos arquivos de `artifacts/limpeza/src/` requer a execução de `npm run build` na pasta `artifacts/limpeza`.
   - Os arquivos transpilados gerados em `artifacts/limpeza/dist/` devem ser adicionados ao git (`git add artifacts/limpeza/dist artifacts/limpeza/src`).
   - Realizar o commit e `git push origin main`.
4. **Restrição desta Fase:**
   - Como agente explorer em modo de investigação (read-only), nenhuma modificação foi realizada no código-fonte e nenhum comando de build foi executado nesta etapa.

---

## 8. Tabela Síntese de Arquivos & Pontos de Integração

| Componente / Arquivo | Linhas Chave | Ação Necessária na Implementação |
|---|---|---|
| `artifacts/limpeza/src/pages/settings.tsx` | ~560–600 | Adicionar Hero Card com o Toggle Switch (`Switch`), badge de status do modo ativo e indicador de saúde SERPRO. |
| `artifacts/limpeza/src/lib/checkin-url.ts` | Arquivo Novo | Criar função utilitária `getCheckinUrl(reservation, guestIndex, baseUrl)` com fallback fail-safe. |
| `artifacts/limpeza/src/components/reservation-hover-card.tsx` | 196, 781–790 | Adicionar botão de cópia de link de check-in ao lado do link direto, consumindo `getCheckinUrl`. |
| `artifacts/limpeza/src/pages/pms-calendar.tsx` | 5664–5825, 7353–7435 | Atualizar resolução da URL nos botões de cópia individual, cópia formatada, envio WhatsApp e disparos Z-API. |
| `artifacts/limpeza/src/hooks/use-quick-messages.ts` | 368, 409, 455 | Atualizar resolução de `linkCheckin` e botões rápidos (`{{link_checkin_digital}}`) usando `getCheckinUrl`. |
| `artifacts/limpeza/src/pages/reception-tablet.tsx` | 771–783 | Atualizar link de pré-check-in no tablet e adicionar botão "Copiar Link". |
| `artifacts/limpeza/src/pages/whatsapp-chat.tsx` | 607 | Atualizar modelo de mensagem para utilizar a URL resolvida. |
| `artifacts/limpeza/src/pages/crm-guests.tsx` | 430, 1001 | Atualizar links de disparo de boas-vindas e acesso à ficha. |

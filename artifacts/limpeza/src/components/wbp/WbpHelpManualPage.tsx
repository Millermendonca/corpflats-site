import React from "react";
import {
  BookOpen,
  CheckCircle2,
  KeyRound,
  Layers,
  Activity,
  Terminal,
  Lock,
  CreditCard,
  AlertTriangle,
  ShieldAlert,
  ExternalLink,
  RefreshCw,
  Zap,
  Globe,
  HelpCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const WbpHelpManualPage: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-8">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                Manual de Operação e Certificação — Channex.io (OTA Channel Manager)
              </h1>
              <p className="text-xs text-muted-foreground">
                Guia prático passo a passo para conectar Booking.com, Airbnb e Expedia aos 19 Flats do Soho Residence com segurança total
              </p>
            </div>
          </div>
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs">
            Channex REST API v1 • Certificação 14 Testes
          </Badge>
        </div>
      </div>

      {/* Section 1: Arquitetura & Segurança */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-indigo-600" />
          <h2 className="text-base font-bold text-foreground">
            1. Credenciais de Ambiente, Ambientes (Staging vs Produção) e Chave Geral
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          A integração utiliza a <strong>API REST v1 oficial da Channex.io</strong> autenticada via cabeçalho{" "}
          <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">user-api-key</code>. Por segurança, o sistema
          opera com uma <strong>Chave Geral de 3 Estágios</strong> que inicia em <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">off</code> por padrão:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1">
            <div className="font-bold text-foreground">1. Modo Desligado (off)</div>
            <p className="text-muted-foreground">
              Padrão inicial. Zero chamadas de saída para a Channex.io, zero timers ativos e webhooks respondem sem alterar reservas.
            </p>
          </div>
          <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-1">
            <div className="font-bold text-amber-800 dark:text-amber-300">2. Somente Observar (observe)</div>
            <p className="text-muted-foreground">
              Grava os payloads recebidos da Channex e simula qual dos 19 flats seria alocado via Fair-Share, sem criar reservas reais e sem disparar WhatsApp/e-mail.
            </p>
          </div>
          <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-1">
            <div className="font-bold text-emerald-800 dark:text-emerald-300">3. Automático (auto)</div>
            <p className="text-muted-foreground">
              Operação 100% ativa: cria/modifica/cancela reservas, aloca nos 19 flats, confirma ACK na revisão da Channex e atualiza ARI em tempo real.
            </p>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-muted/40 border border-border font-mono text-xs space-y-1">
          <div className="font-bold text-foreground mb-1">Variáveis de Ambiente (.env no Render):</div>
          <div>CHANNEX_ENVIRONMENT=staging &nbsp;# ou production</div>
          <div>CHANNEX_API_KEY=sua_user_api_key_channex</div>
          <div>CHANNEX_WEBHOOK_SECRET=seu_segredo_hmac_sha256</div>
          <div>CHANNEX_INTEGRATION_MODE=off &nbsp;# off | observe | auto</div>
        </div>
      </section>

      {/* Section 2: Auto-Setup 1-Clique e Mapeamento dos 19 Flats */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-sky-600" />
          <h2 className="text-base font-bold text-foreground">
            2. Auto-Setup em 1 Clique (Inventário CorpFlats Soho — 19 Flats) e White-Label IFrame
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          Na tela <a href="/caixa-entrada-ota" className="text-primary underline font-semibold">Caixa de Entrada OTA</a>, clique em{" "}
          <strong>"Auto-Setup 19 Flats"</strong>. O PMS criará ou vinculará automaticamente na Channex.io:
        </p>
        <ul className="list-disc pl-5 text-xs sm:text-sm text-muted-foreground space-y-1.5">
          <li>
            <strong>Property:</strong> <code className="px-1 py-0.5 rounded bg-muted font-mono">CorpFlats Soho Residence</code>{" "}
            (<code className="font-mono">BRL</code>, <code className="font-mono">America/Sao_Paulo</code>, <code className="font-mono">state_length: 500</code> dias).
          </li>
          <li>
            <strong>Room Type:</strong> <code className="px-1 py-0.5 rounded bg-muted font-mono">Flat</code> com{" "}
            <code className="font-mono">count_of_rooms: 19</code> (representando o pool compartilhado dos 19 flats físicos: 113 a 1304) e ocupação de até 3 adultos (<code className="font-mono">default_occupancy: 2</code>).
          </li>
          <li>
            <strong>Rate Plan 1 — Sem Café:</strong> <code className="font-mono">sell_mode: "per_person"</code>, tarifas para 1, 2 (primária) e 3 hóspedes calculadas pelo Motor SEBRAE.
          </li>
          <li>
            <strong>Rate Plan 2 — Com Café:</strong> <code className="font-mono">sell_mode: "per_person"</code>, adicionando o suplemento de café da manhã por hóspede/noite.
          </li>
        </ul>
        <div className="p-3.5 rounded-xl border border-sky-500/30 bg-sky-500/5 text-xs flex items-start gap-2.5">
          <ExternalLink className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
          <div>
            <strong>Conexão com Booking.com e Airbnb (IFrame White-Label):</strong> Clique no botão{" "}
            <strong>"Conectar Canais (IFrame)"</strong> no topo da Caixa de Entrada OTA. O sistema gera um{" "}
            <code className="font-mono">one_time_token</code> válido por 15 minutos e abre a tela oficial de canais da Channex em Português dentro do próprio PMS.
          </div>
        </div>
      </section>

      {/* Section 3: ARI Separado, 500 Dias em 2 Chamadas e Rate Limits */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-600" />
          <h2 className="text-base font-bold text-foreground">
            3. Sincronização de ARI (Disponibilidade Separada de Preços/Restrições) & Limite de 10 req/min
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          Diferente de sistemas legados, a Channex.io separa estritamente a disponibilidade por quarto dos preços/restrições por plano tarifário:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1">
            <div className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">POST /api/v1/availability</div>
            <p className="text-muted-foreground">
              Envia a quantidade de flats livres (<code className="font-mono">0 a 19</code>) para o Room Type <code className="font-mono">Flat</code> usando intervalos comprimidos (<code className="font-mono">date_from</code> / <code className="font-mono">date_to</code>).
            </p>
          </div>
          <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1">
            <div className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">POST /api/v1/restrictions</div>
            <p className="text-muted-foreground">
              Envia tarifas por ocupação (1, 2 e 3 pessoas) e restrições (<code className="font-mono">min_stay_arrival</code>, <code className="font-mono">max_stay</code>, <code className="font-mono">stop_sell</code>, <code className="font-mono">closed_to_arrival</code>, <code className="font-mono">closed_to_departure</code>) sem nenhum campo <code className="font-mono">null</code>.
            </p>
          </div>
        </div>
        <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-xs space-y-1">
          <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
            <Terminal className="w-4 h-4" />
            <span>Full Sync de 500 Dias em Exatamente 2 Chamadas (Requisito #1 da Certificação)</span>
          </div>
          <p className="text-muted-foreground">
            Ao clicar em <strong>"Full Sync 500d (2 Calls)"</strong>, o PMS comprime os 500 dias em intervalos contíguos e realiza exatamente 1 chamada para{" "}
            <code className="font-mono">/availability</code> e 1 chamada para <code className="font-mono">/restrictions</code>, exibindo os{" "}
            <strong>Task IDs</strong> na tabela do topo para você copiar e colar no formulário de certificação da Channex.
          </p>
        </div>
      </section>

      {/* Section 4: Recebimento de Reservas, Quarentena e Cartões Virtuais */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-rose-600" />
          <h2 className="text-base font-bold text-foreground">
            4. Feed de Revisões, ACK Obrigatório, Quarentena e Cartões Virtuais (VCC)
          </h2>
        </div>
        <ul className="list-disc pl-5 text-xs sm:text-sm text-muted-foreground space-y-2">
          <li>
            <strong>Webhook HMAC-SHA256 + Feed de Revisões:</strong> O endpoint{" "}
            <code className="px-1 py-0.5 rounded bg-muted font-mono">POST /api/callback/channex</code> valida a assinatura{" "}
            <code className="font-mono">x-hmac-signature-256</code> sobre os bytes brutos (suportando dupla assinatura durante rotação de chaves). O worker também consulta{" "}
            <code className="font-mono">GET /api/v1/booking_revisions/feed</code> (nunca <code className="font-mono">GET /bookings</code>).
          </li>
          <li>
            <strong>Confirmação ACK (<code className="font-mono">POST /booking_revisions/:id/ack</code>):</strong> O ACK só é enviado à Channex após o payload bruto ser gravado em disco e processado com sucesso no PMS.
          </li>
          <li>
            <strong>Reserva com Quarto ou Tarifa Não Mapeada (Teste #10):</strong> Caso a Channex envie <code className="font-mono">room_type_id: null</code> ou <code className="font-mono">rate_plan_id: null</code>, a reserva vai imediatamente para a <strong>Quarentena</strong> (<code className="font-mono">UNMAPPED_ROOM_OR_RATE</code>) e alerta o gestor no WhatsApp/e-mail.
          </li>
          <li>
            <strong>Proteção de Hóspede Hospedado (In-House):</strong> Cancelamentos de reservas cujo hóspede já realizou check-in são bloqueados e enviados para a Quarentena.
          </li>
          <li>
            <strong>Cofre PCI AES-256-GCM e Cartão Virtual (VCC):</strong> Qualquer CVV/CVC é descartado em memória imediatamente. O número do cartão é criptografado no cofre com reautenticação de senha (expiração de 5 min) e expurgo automático em D+10 após o check-out. Metadados de Cartão Virtual (<code className="font-mono">is_virtual</code>, saldo e data de ativação) ficam visíveis na reserva.
          </li>
        </ul>
      </section>
    </div>
  );
};

export default WbpHelpManualPage;

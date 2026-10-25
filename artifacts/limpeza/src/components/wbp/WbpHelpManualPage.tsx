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
            (<code className="font-mono">property_type: "apart_hotel"</code>, <code className="font-mono">BRL</code>, <code className="font-mono">America/Sao_Paulo</code>, <code className="font-mono">state_length: 500</code> dias).{" "}
            <em>Nota Comercial de Billing:</em> Classificar como <code className="font-mono">"apart_hotel"</code> (categoria Hotel/Apart-Hotel com múltiplos quartos) enquadra os 19 flats em cobrança por propriedade única na Channex, evitando cobrança por unidade individual de Vacation Rental (<code className="font-mono">apartment</code>).
          </li>
          <li>
            <strong>Room Type:</strong> <code className="px-1 py-0.5 rounded bg-muted font-mono">Flat</code> com{" "}
            <code className="font-mono">count_of_rooms: 19</code> (representando o pool compartilhado dos 19 flats físicos: 113, 114, 116, 211, 212, 215, 313, 408, 509, 511, 512, 605, 712, 715, 904, 905, 907, 1004 e 1304) e ocupação de até 3 adultos (<code className="font-mono">default_occupancy: 2</code>).
          </li>
          <li>
            <strong>Rate Plan 1 — Sem Café:</strong> <code className="font-mono">sell_mode: "per_person"</code>, <code className="font-mono">ui_read_only: true</code>, tarifas para 1, 2 (primária) e 3 hóspedes calculadas pelo Motor SEBRAE.
          </li>
          <li>
            <strong>Rate Plan 2 — Com Café:</strong> <code className="font-mono">sell_mode: "per_person"</code>, <code className="font-mono">ui_read_only: true</code>, adicionando o suplemento de café da manhã por hóspede/noite.
          </li>
        </ul>
        <div className="p-3.5 rounded-xl border border-sky-500/30 bg-sky-500/5 text-xs flex items-start gap-2.5">
          <ExternalLink className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div>
              <strong>Conexão com Booking.com e Airbnb (IFrame White-Label):</strong> Clique no botão{" "}
              <strong>"Conectar Canais (IFrame)"</strong> no topo da Caixa de Entrada OTA. O sistema gera um{" "}
              <code className="font-mono">one_time_token</code> válido por 15 minutos e abre a tela oficial de canais da Channex dentro do próprio PMS.
            </div>
            <div className="text-muted-foreground space-y-1">
              <div>
                <strong>Booking.com:</strong> Solicite <em>Channex.io (ID #3567)</em> na Extranet → mapeie o quarto <code className="font-mono">Flat</code> e os 2 planos tarifários (Read-Only para teste inicial; ative após validar). Tarifas derivadas na Booking.com (Não Reembolsável / Semanal) são identificadas automaticamente pelo PMS via <code className="font-mono">meta.parent_rate_plan_id</code> para preservar o status de café da manhã (<code className="font-mono">sem_cafe</code> vs <code className="font-mono">com_cafe</code>).
              </div>
              <div>
                <strong>Airbnb:</strong> Autorize via OAuth 1-clique dentro do IFrame; vincule o anúncio principal ao quarto <code className="font-mono">Flat</code>, <strong>remova quaisquer calendários iCal antigos</strong> para evitar bloqueios duplicados e configure <em>Availability Settings</em> como <em>Unavailable by Default</em> por segurança.
              </div>
            </div>
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
          A Channex.io separa estritamente a disponibilidade por quarto dos preços/restrições por plano tarifário e impõe limite de{" "}
          <strong>10 req/min por propriedade e endpoint</strong> (10 req/min em <code className="font-mono">/availability</code> e 10 req/min em <code className="font-mono">/restrictions</code>). Caso o limite seja atingido, o PMS agenda automaticamente uma nova tentativa após a janela de 60 segundos:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1">
            <div className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">POST /api/v1/availability</div>
            <p className="text-muted-foreground">
              Envia exclusivamente a quantidade de flats livres (<code className="font-mono">0 a 19</code>) para o Room Type <code className="font-mono">Flat</code> usando intervalos comprimidos (<code className="font-mono">date_from</code> / <code className="font-mono">date_to</code>). Disparado isoladamente quando há nova reserva, bloqueio ou manutenção (Testes #9 e #10).
            </p>
          </div>
          <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1">
            <div className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">POST /api/v1/restrictions</div>
            <p className="text-muted-foreground">
              Envia exclusivamente tarifas por ocupação (1, 2 e 3 pessoas) e restrições (<code className="font-mono">min_stay_arrival</code>, <code className="font-mono">max_stay</code>, <code className="font-mono">stop_sell</code>, <code className="font-mono">closed_to_arrival</code>, <code className="font-mono">closed_to_departure</code>) sem nenhum campo <code className="font-mono">null</code>. Disparado isoladamente em alterações de preço/restrição (Testes #2 a #8).
            </p>
          </div>
        </div>
        <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-xs space-y-1">
          <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
            <Terminal className="w-4 h-4" />
            <span>Full Sync de 500 Dias em Exatamente 2 Chamadas (Teste #1 da Certificação)</span>
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
            4. Feed de Revisões, 28 Eventos de Webhook, ACK Obrigatório, Quarentena e Cofre PCI (D+7)
          </h2>
        </div>
        <ul className="list-disc pl-5 text-xs sm:text-sm text-muted-foreground space-y-2">
          <li>
            <strong>Webhook HMAC-SHA256 + 28 Eventos Oficiais:</strong> O endpoint{" "}
            <code className="px-1 py-0.5 rounded bg-muted font-mono">POST /api/callback/channex</code> valida a assinatura{" "}
            <code className="font-mono">x-hmac-signature-256</code> sobre os bytes brutos exatos (<code className="font-mono">req.rawBodyBuffer</code>) e trata os 28 tipos de eventos da Channex (incluindo webhooks leves <code className="font-mono">send_data: false</code> e alertas operacionais como <code className="font-mono">sync_error</code> e <code className="font-mono">reservation_request</code> sem gerar falsos-positivos na quarentena). O worker também consulta{" "}
            <code className="font-mono">GET /api/v1/booking_revisions/feed</code> com paginação completa (nunca <code className="font-mono">GET /bookings</code>).
          </li>
          <li>
            <strong>Confirmação ACK (<code className="font-mono">POST /booking_revisions/:id/ack</code>):</strong> O ACK só é enviado à Channex após o payload bruto ser gravado em disco e processado com sucesso no PMS.
          </li>
          <li>
            <strong>Reserva com Quarto ou Tarifa Não Mapeada (Teste #11):</strong> Caso a Channex envie <code className="font-mono">room_type_id: null</code> ou <code className="font-mono">rate_plan_id: null</code> (e sem <code className="font-mono">meta.parent_rate_plan_id</code> mapeado), a reserva vai imediatamente para a <strong>Quarentena</strong> (<code className="font-mono">UNMAPPED_ROOM_OR_RATE</code>) e alerta o gestor.
          </li>
          <li>
            <strong>Modificações Multi-Quarto & Proteção In-House:</strong> Modificações que adicionam ou removem quartos do mesmo pedido ajustam automaticamente os flats alocados e atualizam a disponibilidade de todo o período antigo e novo. Cancelamentos de hóspedes já em check-in são bloqueados e enviados para a Quarentena.
          </li>
          <li>
            <strong>Cofre PCI AES-256-GCM e Cartão Virtual (VCC):</strong> Qualquer CVV/CVC é descartado em memória imediatamente. O número do cartão é criptografado no cofre com reautenticação de senha (expiração de 5 min) e expurgo automático em <strong>D+7 após o check-out</strong>. Metadados de Cartão Virtual (<code className="font-mono">is_virtual</code>, saldo, data de ativação, <code className="font-mono">deposits</code> e <code className="font-mono">collected_taxes</code>) ficam preservados na reserva.
          </li>
        </ul>
      </section>

      {/* Section 5: Roteiro Oficial dos 14 Testes de Certificação Channex */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <h2 className="text-base font-bold text-foreground">
            5. Roteiro Oficial dos 14 Testes de Certificação PMS da Channex.io
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">#</th>
                <th className="py-2 pr-3 font-semibold">Teste Oficial Channex (pms-certification-tests.md)</th>
                <th className="py-2 pr-3 font-semibold">Como Executar no PMS</th>
                <th className="py-2 font-semibold">Resultado / Task ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-muted-foreground">
              <tr>
                <td className="py-2 pr-3 font-mono font-bold text-foreground">#1</td>
                <td className="py-2 pr-3">Full Data Update (500 dias em 2 chamadas: 1 Availability + 1 Restrictions)</td>
                <td className="py-2 pr-3">Clique em <strong>Full Sync 500d (2 Calls)</strong></td>
                <td className="py-2 font-mono">1 POST /availability + 1 POST /restrictions</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-mono font-bold text-foreground">#2</td>
                <td className="py-2 pr-3">Single Date Update for Single Rate</td>
                <td className="py-2 pr-3">Altere a tarifa de 1 data e 1 plano em <code className="font-mono">/tarifas</code></td>
                <td className="py-2 font-mono">Apenas POST /restrictions</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-mono font-bold text-foreground">#3</td>
                <td className="py-2 pr-3">Single Date Update for Multiple Rates</td>
                <td className="py-2 pr-3">Altere a tarifa de 1 data para ambos os planos (Sem Café e Com Café)</td>
                <td className="py-2 font-mono">Apenas POST /restrictions</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-mono font-bold text-foreground">#4</td>
                <td className="py-2 pr-3">Multiple Date Update for Multiple Rates</td>
                <td className="py-2 pr-3">Altere tarifas de um intervalo de datas (<code className="font-mono">date_from</code>–<code className="font-mono">date_to</code>) nos 2 planos</td>
                <td className="py-2 font-mono">Apenas POST /restrictions</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-mono font-bold text-foreground">#5</td>
                <td className="py-2 pr-3">Min Stay Update</td>
                <td className="py-2 pr-3">Altere <code className="font-mono">min_stay_arrival</code> em um período sem campos <code className="font-mono">null</code></td>
                <td className="py-2 font-mono">Apenas POST /restrictions</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-mono font-bold text-foreground">#6</td>
                <td className="py-2 pr-3">Stop Sell Update</td>
                <td className="py-2 pr-3">Ative <code className="font-mono">stop_sell: true</code> para uma data ou período</td>
                <td className="py-2 font-mono">Apenas POST /restrictions</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-mono font-bold text-foreground">#7</td>
                <td className="py-2 pr-3">Multiple Restrictions Update</td>
                <td className="py-2 pr-3">Publique tarifa + <code className="font-mono">stop_sell</code> + <code className="font-mono">min_stay</code> + <code className="font-mono">cta/ctd</code> simultaneamente</td>
                <td className="py-2 font-mono">Apenas POST /restrictions</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-mono font-bold text-foreground">#8</td>
                <td className="py-2 pr-3">Half-year Update (6 meses com filtro de dias da semana)</td>
                <td className="py-2 pr-3">Publique regras de 6 meses (dias de semana vs fim de semana)</td>
                <td className="py-2 font-mono">Apenas POST /restrictions</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-mono font-bold text-foreground">#9</td>
                <td className="py-2 pr-3">Single Date Availability Update</td>
                <td className="py-2 pr-3">Crie reserva ou bloqueio de 1 noite no Mapa de Reservas</td>
                <td className="py-2 font-mono">Apenas POST /availability</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-mono font-bold text-foreground">#10</td>
                <td className="py-2 pr-3">Multiple Date Availability Update</td>
                <td className="py-2 pr-3">Crie reserva ou bloqueio de múltiplas diárias</td>
                <td className="py-2 font-mono">Apenas POST /availability</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-mono font-bold text-foreground">#11</td>
                <td className="py-2 pr-3">Booking Receiving (New, Multi-Room, Unmapped Room/Rate, Modify, Cancel + ACK)</td>
                <td className="py-2 pr-3">Clique em <strong>Consultar Feed</strong> ou receba via Webhook</td>
                <td className="py-2 font-mono">GET /booking_revisions/feed + ACK</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-mono font-bold text-foreground">#12</td>
                <td className="py-2 pr-3">Rate Limits (Máx. 10 req/min em /availability e 10 req/min em /restrictions)</td>
                <td className="py-2 pr-3">Controlado automaticamente pelo Outbox com fila de reenvio em 60s</td>
                <td className="py-2 font-mono">Sliding Window 60s + Retry 429</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-mono font-bold text-foreground">#13</td>
                <td className="py-2 pr-3">Update Logic (Deltas Enxutos vs Full Sync & Desacoplamento ARI)</td>
                <td className="py-2 pr-3">Debounce de 2s (máx 6s) separando ocupação de tarifas</td>
                <td className="py-2 font-mono">Deltas isolados por endpoint</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-mono font-bold text-foreground">#14</td>
                <td className="py-2 pr-3">Extra Notes (Pool de 19 Flats & Alocação Fair-Share)</td>
                <td className="py-2 pr-3">Documentado neste manual e no relatório de certificação</td>
                <td className="py-2 font-mono">apart_hotel (19 unidades)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default WbpHelpManualPage;


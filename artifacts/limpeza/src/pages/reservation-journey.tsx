import { useState, useEffect, useMemo } from "react"
import { useLocation } from "wouter"
import { useGetMe } from "@workspace/api-client-react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  GitFork, 
  Workflow, 
  Clock, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  User, 
  Mail, 
  MessageSquare, 
  Car, 
  Coffee, 
  Star, 
  FileText, 
  Smartphone, 
  Sparkles, 
  ShieldCheck, 
  Check, 
  ArrowRight, 
  ChevronRight, 
  ExternalLink, 
  Eye, 
  RefreshCw, 
  Play, 
  CheckCheck, 
  Key, 
  Building2, 
  Layers, 
  Info,
  DollarSign,
  Compass,
  Zap,
  Globe,
  HelpCircle,
  QrCode,
  Paperclip,
  Share2
} from "lucide-react"

// ── Tipos de Dados da Jornada ──────────────────────────────────────────────────

export interface JourneyNode {
  id: string
  stageNumber: number
  stageName: string
  title: string
  subtitle: string
  triggerEvent: string
  channelType: "whatsapp" | "email" | "both" | "internal"
  recipients: Array<"hospede" | "recepcao" | "garagem" | "camareira" | "solicitante">
  timingLabel: string
  condition?: string
  channelsAllowed: string[] // 'site', 'whatsapp', 'booking', 'airbnb', 'outros'
  description: string
  messagePreview: string
  buttons?: Array<{ label: string; type: string; url?: string }>
  hasAttachment?: boolean
  attachmentName?: string
  badgeVariant?: "default" | "secondary" | "outline" | "destructive"
  editUrl: string
  category: "reserva" | "pagamento" | "pre_estadia" | "checkin" | "estadia" | "checkout" | "pos_estadia" | "excecao"
}

// ── Base de Conhecimento: Todos os Nós da Jornada Cadastrados no Sistema ───────

export const JOURNEY_NODES: JourneyNode[] = [
  // ── ETAPA 1 & 2: CRIAÇÃO & PRÉ-RESERVA ─────────────────────────────────────
  {
    id: "node_pre_reserva",
    stageNumber: 1,
    stageName: "1. Criação de Reserva",
    title: "Pré-Reserva • PIX & Dados de Pagamento",
    subtitle: "Aguardando pagamento / Reserva criada sem quitação",
    triggerEvent: "pre_reservation_created",
    channelType: "whatsapp",
    recipients: ["hospede", "solicitante"],
    timingLabel: "Imediato ao registrar",
    condition: "Reserva sem pagamento ou com sinal pendente",
    channelsAllowed: ["site", "whatsapp", "booking", "airbnb", "outros"],
    description: "Disparado para reservas que entram como pré-reserva (não pagas). Envia dados completos da estadia, chave PIX oficial e link do portal para pagamento via cartão em até 12x.",
    messagePreview: `Olá, *{{nome_hospede}}*! ⏳
Recebemos o pedido de *Pré-Reserva* no *{{nome_hotel}}*!

📋 *Resumo da Estadia:*
• Código da Reserva: *{{numero_reserva}}*
• Acomodação: *Flat {{quarto}}*
• Entrada (Check-in): *{{data_checkin}} a partir das 14:00*
• Saída (Check-out): *{{data_checkout}} até às 12:00*

💰 *Situação Financeira:*
• Valor Total: *{{valor_total}}*
• Quanto Falta Pagar: *{{quanto_falta}}*

🔑 *Chave PIX (CNPJ):* 47.964.813/0001-65
• Favorecido: CorpFlats Hospedagem`,
    buttons: [
      { label: "💳 Ver Reserva & Pagar", type: "URL", url: "https://.../portal-hospede/RES-..." },
      { label: "📞 Falar com Atendimento", type: "CALL" }
    ],
    editUrl: "/whatsapp?tab=rules&tpl=tpl_pre_reserva",
    category: "pagamento"
  },
  {
    id: "node_payment_pending",
    stageNumber: 1,
    stageName: "1. Criação de Reserva",
    title: "Cobrança • Lembrete de Pagamento Pendente",
    subtitle: "Garante a vaga antes da expiração",
    triggerEvent: "payment_pending",
    channelType: "whatsapp",
    recipients: ["hospede"],
    timingLabel: "Imediato ou conforme expiração",
    condition: "Status 'Aguardando Pagamento'",
    channelsAllowed: ["site", "whatsapp"],
    description: "Envia reforço do link de pagamento seguro para o hóspede não perder as datas reservadas no motor direto.",
    messagePreview: `Olá, *{{nome_hospede}}*! ⏳
Sua pré-reserva no *{{nome_hotel}}* foi recebida e está *Aguardando Pagamento* para confirmação definitiva:

📋 *Detalhes da Estadia:*
• Código: *{{numero_reserva}}* • Flat: *{{quarto}}*
• Período: *{{data_checkin}} a {{data_checkout}}*
• Valor Pendente: *{{valor_total}}*

Para garantir sua acomodação, realize o pagamento via PIX ou em até 12x no cartão pelo portal:`,
    buttons: [
      { label: "💳 Pagar e Confirmar", type: "URL", url: "https://.../portal-hospede/RES-..." },
      { label: "🏨 Ver Minha Reserva", type: "URL", url: "https://.../portal-hospede/RES-..." }
    ],
    editUrl: "/whatsapp?tab=rules&tpl=tpl_payment_pending",
    category: "pagamento"
  },
  {
    id: "node_payment_confirmed",
    stageNumber: 2,
    stageName: "2. Confirmação & Pagamento",
    title: "Pagamento Confirmado • Reserva Garantida",
    subtitle: "Disparo ao identificar PIX ou Cartão",
    triggerEvent: "payment_confirmed",
    channelType: "whatsapp",
    recipients: ["hospede"],
    timingLabel: "Imediato após conciliação",
    condition: "PIX aprovado no Inter ou Cartão aprovado",
    channelsAllowed: ["site", "whatsapp", "booking", "airbnb", "outros"],
    description: "Confirma o recebimento financeiro, formaliza a reserva e convida o hóspede a realizar a ficha de pré-check-in digital.",
    messagePreview: `Olá, *{{primeiro_nome}}*! 💚🎉
Confirmamos o recebimento do seu pagamento de *{{valor_pago}}* via *{{forma_pagamento}}*!

Sua reserva no *{{nome_hotel}}* está *Garantida & Confirmada*!

📋 *Resumo da Estadia:*
• Código da Reserva: *{{numero_reserva}}*
• Acomodação: *Flat {{quarto}}*
• Entrada: *{{data_checkin}}* • Saída: *{{data_checkout}}*

Realize agora seu pré-checkin digital para liberação rápida na portaria!`,
    buttons: [
      { label: "📝 Fazer Check-in Online", type: "URL", url: "https://.../pre-checkin/RES-..." },
      { label: "🏨 Portal do Hóspede", type: "URL", url: "https://.../portal-hospede/RES-..." }
    ],
    editUrl: "/whatsapp?tab=rules&tpl=tpl_payment_confirmed",
    category: "pagamento"
  },
  {
    id: "node_res_created_direct",
    stageNumber: 2,
    stageName: "2. Confirmação & Pagamento",
    title: "Nova Reserva (Site / WhatsApp) • Early Check-in Cortesia",
    subtitle: "Boas-vindas para canais diretos de venda",
    triggerEvent: "reservation_created",
    channelType: "whatsapp",
    recipients: ["hospede", "solicitante"],
    timingLabel: "Imediato à confirmação",
    condition: "Origem: Site Oficial ou WhatsApp",
    channelsAllowed: ["site", "whatsapp"],
    description: "Gera fidelização imediata informando o número do flat e concedendo o benefício de Early Check-in sem custo conforme disponibilidade de limpeza.",
    messagePreview: `Olá, *{{nome_hospede}}*! 🌟✨
Sua reserva no *{{nome_hotel}}* está *Confirmada*!

📋 *Resumo da sua Estadia:*
• Código da Reserva: *{{numero_reserva}}*
• Acomodação: *Flat {{quarto}}*
• Entrada: *{{data_checkin}} a partir das 14:00*
• Saída: *{{data_checkout}} até às 12:00*

🎁 *Benefício Reserva Direta:* Como você reservou pelo nosso canal direto, tem direito a *Early Check-in gratuito* se o apartamento for liberado antes pelas camareiras!`,
    buttons: [
      { label: "📝 Fazer Check-in Online", type: "URL", url: "https://.../pre-checkin/RES-..." },
      { label: "🏨 Portal do Hóspede", type: "URL", url: "https://.../portal-hospede/RES-..." }
    ],
    editUrl: "/whatsapp?tab=rules&tpl=tpl_new_reservation_direct",
    category: "reserva"
  },
  {
    id: "node_res_created_ota",
    stageNumber: 2,
    stageName: "2. Confirmação & Pagamento",
    title: "Nova Reserva OTA (Booking / Airbnb) • Sem Revelar Flat",
    subtitle: "Atribuição no dia + Conversão para venda direta futura",
    triggerEvent: "reservation_created",
    channelType: "whatsapp",
    recipients: ["hospede"],
    timingLabel: "Imediato à confirmação",
    condition: "Origem: Booking.com ou Airbnb",
    channelsAllowed: ["booking", "airbnb"],
    description: "Enviado a hóspedes de OTAs. Não revela o número do flat antecipadamente (informa que será definido no dia às 12h ou 14h) e promove descontos de reserva direta futura.",
    messagePreview: `Olá, *{{nome_hospede}}*! 🌟
Sua reserva no *{{nome_hotel}}* está *Confirmada*!

📋 *Resumo da Estadia:*
• Código da Reserva: *{{numero_reserva}}*
• Entrada: *{{data_checkin}}* • Saída: *{{data_checkout}}*

🔑 *Sobre o seu apartamento:*
O número do seu flat será informado no dia do check-in, até as 14:00 (ou a partir das 12:00 se já estiver higienizado).

💡 *Dica:* Na próxima vez, reservando pelo nosso site ou WhatsApp você ganha Early Check-in cortesia e melhores tarifas sem taxas intermediárias!`,
    buttons: [
      { label: "📝 Fazer Check-in Online", type: "URL", url: "https://.../pre-checkin/RES-..." },
      { label: "🏨 Portal do Hóspede", type: "URL", url: "https://.../portal-hospede/RES-..." }
    ],
    editUrl: "/whatsapp?tab=rules&tpl=tpl_new_reservation_ota",
    category: "reserva"
  },

  // ── ETAPA 3: PRÉ-ESTADIA & PRÉ-CHECK-IN DIGITAL ────────────────────────────
  {
    id: "node_pre_checkin_reminder",
    stageNumber: 3,
    stageName: "3. Pré-Estadia (Véspera)",
    title: "Lembrete 24h • Preenchimento da Ficha FNRH Digital",
    subtitle: "Disparado 24 horas antes do horário de check-in",
    triggerEvent: "pre_checkin_reminder",
    channelType: "whatsapp",
    recipients: ["hospede"],
    timingLabel: "24 horas antes do check-in",
    condition: "Hóspede ainda não preencheu todos os dados",
    channelsAllowed: ["site", "whatsapp", "booking", "airbnb", "outros"],
    description: "Relembra o hóspede de adiantar o cadastro dos hóspedes titulares, acompanhantes e veículo. Isso garante entrada sem filas nem burocracia na portaria do condomínio Soho.",
    messagePreview: `Olá, *{{primeiro_nome}}*! Tudo bem? ⏳
Sua chegada ao *{{nome_hotel}}* está próxima (*{{data_checkin}}*)!

Para que a portaria do Edifício Soho libere sua entrada imediatamente na chegada, pedimos que adiante o cadastro dos hóspedes pelo link seguro abaixo:`,
    buttons: [
      { label: "📝 Preencher Ficha Digital", type: "URL", url: "https://.../pre-checkin/RES-..." }
    ],
    editUrl: "/whatsapp?tab=rules&tpl=tpl_pre_checkin_reminder",
    category: "pre_estadia"
  },
  {
    id: "node_portaria_checkin_email",
    stageNumber: 3,
    stageName: "3. Pré-Estadia (Véspera)",
    title: "E-mail de Ficha Cadastral à Recepção / Portaria",
    subtitle: "Envio automático com dados completos, documentos e carro",
    triggerEvent: "checkin_digital_completed",
    channelType: "email",
    recipients: ["recepcao"],
    timingLabel: "Assim que o hóspede preenche a FNRH",
    condition: "Formulário de Pré-checkin submetido pelo hóspede",
    channelsAllowed: ["site", "whatsapp", "booking", "airbnb", "outros"],
    description: "E-mail HTML corporativo enviado à portaria do edifício (millerpessanha@gmail.com / recepção) com número do Flat, nomes dos hóspedes, fotos/documentos, placa do veículo e horário de check-in.",
    messagePreview: `Assunto: [CHECK-IN CONFIRMADO] Flat {{quarto}} - {{nome_hospede}} ({{data_checkin}} a {{data_checkout}})

Olá, Equipe de Recepção / Portaria!
O hóspede concluiu o formulário de Check-in Digital (FNRH). Seguem todos os dados cadastrais e de acesso para a devida liberação na portaria:

🏢 Unidade: Flat {{quarto}} (Edifício Soho Residence Service)
📅 Entrada: {{data_checkin}} • Saída: {{data_checkout}}
👥 Hóspedes Autorizados: Titular + Acompanhantes
🚗 Veículo: Placa {{placa}} • {{modelo}}`,
    editUrl: "/emails",
    category: "pre_estadia"
  },
  {
    id: "node_garagem_autorizacao",
    stageNumber: 3,
    stageName: "3. Pré-Estadia (Véspera)",
    title: "Liberação de Vaga de Garagem • E-mail & WhatsApp",
    subtitle: "Envio automático para o estacionamento PFB e portaria",
    triggerEvent: "garage_authorized",
    channelType: "both",
    recipients: ["garagem", "recepcao"],
    timingLabel: "Imediato se o hóspede cadastrou veículo",
    condition: "Veículo informado com placa válida",
    channelsAllowed: ["site", "whatsapp", "booking", "airbnb", "outros"],
    description: "Dispara autorização formal de vaga rotativa gratuita para a administração do estacionamento (PFB) e portaria contendo placa, modelo, cor, apartamento e período da estadia.",
    messagePreview: `Assunto: [LIBERAÇÃO DE GARAGEM] Flat {{quarto}} - {{nome_hospede}} - Veículo: {{placa}}

Solicitamos a liberação de entrada e acesso à vaga rotativa para o veículo cadastrado:
🚗 Placa: {{placa}} | Modelo: {{modelo}} | Cor: {{cor}}
🏨 Flat: {{quarto}} • Período: {{data_checkin}} até {{data_checkout}}`,
    buttons: [
      { label: "🚗 Ver Controle de Garagem", type: "URL", url: "https://.../garagem" }
    ],
    editUrl: "/garagem",
    category: "pre_estadia"
  },

  // ── ETAPA 4: DIA DO CHECK-IN & ENTRADA ─────────────────────────────────────
  {
    id: "node_checkin_day_instructions",
    stageNumber: 4,
    stageName: "4. Dia do Check-in (Manhã)",
    title: "Instruções de Chegada • Senha Wi-Fi & Portaria (09:00)",
    subtitle: "Disparado pontualmente às 09:00 do dia da entrada",
    triggerEvent: "checkin_day_instructions",
    channelType: "whatsapp",
    recipients: ["hospede"],
    timingLabel: "Dia do Check-in às 09:00",
    condition: "Reserva confirmada com check-in hoje",
    channelsAllowed: ["site", "whatsapp", "booking", "airbnb", "outros"],
    description: "Orienta o hóspede no dia da viagem com endereço completo, link do Google Maps, instruções da portaria 24h e senhas de Wi-Fi para que a chegada seja perfeita.",
    messagePreview: `Bom dia, *{{primeiro_nome}}*! ☀️
Hoje é o dia da sua chegada ao *{{nome_hotel}}*!

🔑 *Seu Flat:* {{quarto}}
⏰ *Horário de Check-in:* A partir das 14:00
📍 *Endereço:* Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes

Ao chegar, dirija-se à portaria 24h e informe seu nome e o número do flat.

📶 *Wi-Fi do Flat:*
• Rede: *{{wifi_rede}}* • Senha: *{{wifi_senha}}*`,
    buttons: [
      { label: "📍 Abrir no Google Maps", type: "URL", url: "https://maps.google.com/..." },
      { label: "🏨 Portal do Hóspede", type: "URL", url: "https://.../portal-hospede/RES-..." }
    ],
    editUrl: "/whatsapp?tab=rules&tpl=tpl_checkin_day_instructions",
    category: "checkin"
  },
  {
    id: "node_room_ready_direct",
    stageNumber: 4,
    stageName: "4. Dia do Check-in (Manhã)",
    title: "Quarto Liberado • Early Check-in Disponível (Site / WhatsApp)",
    subtitle: "Disparo automático quando a camareira finaliza a limpeza",
    triggerEvent: "room_ready",
    channelType: "whatsapp",
    recipients: ["hospede"],
    timingLabel: "Imediato à conclusão da higienização",
    condition: "Reserva Direta (Site / WhatsApp) e quarto pronto antes das 14:00",
    channelsAllowed: ["site", "whatsapp"],
    description: "Avisa o hóspede direto que o flat já está pronto e liberado para entrada antecipada imediata, sem necessidade de aguardar o horário das 14:00.",
    messagePreview: `*{{primeiro_nome}}*, uma ótima notícia! 🎉🔑
Seu *Flat {{quarto}}* no *{{nome_hotel}}* já está *Limpo e Pronto* para receber você!

Como você reservou diretamente conosco, pode fazer o *Early Check-in agora mesmo*, sem precisar esperar as 14:00! 🚀

📍 Ao chegar, basta se identificar na portaria 24h com seu nome e o número *{{quarto}}*.
📶 Wi-Fi: *{{wifi_rede}}* | Senha: *{{wifi_senha}}*`,
    buttons: [
      { label: "📍 Abrir no Google Maps", type: "URL", url: "https://maps.google.com/..." },
      { label: "🏨 Portal do Hóspede", type: "URL", url: "https://.../portal-hospede/RES-..." }
    ],
    editUrl: "/whatsapp?tab=rules&tpl=tpl_room_ready_direct",
    category: "checkin"
  },
  {
    id: "node_room_ready_ota",
    stageNumber: 4,
    stageName: "4. Dia do Check-in (Manhã)",
    title: "Quarto Liberado • Atribuição de Flat (Booking / Airbnb)",
    subtitle: "Revela o número do apartamento e instruções",
    triggerEvent: "room_ready_ota",
    channelType: "whatsapp",
    recipients: ["hospede"],
    timingLabel: "Às 12:00 (se limpo) ou 14:00 (padrão)",
    condition: "Reserva OTA (Booking / Airbnb)",
    channelsAllowed: ["booking", "airbnb"],
    description: "Disparado para reservas do Booking e Airbnb revelando o número do flat e liberando a entrada.",
    messagePreview: `*{{primeiro_nome}}*, tudo pronto para sua chegada! 🔑🏡
Seu apartamento no *{{nome_hotel}}* já foi definido:

🏠 *Flat {{quarto}}*
⏰ Liberado para entrada a partir de *agora*!

📍 Ao chegar, vá à portaria 24h e informe seu nome e o número *{{quarto}}*.
📶 Wi-Fi: *{{wifi_rede}}* | Senha: *{{wifi_senha}}*`,
    buttons: [
      { label: "📍 Abrir no Google Maps", type: "URL", url: "https://maps.google.com/..." },
      { label: "🏨 Portal do Hóspede", type: "URL", url: "https://.../portal-hospede/RES-..." }
    ],
    editUrl: "/whatsapp?tab=rules&tpl=tpl_room_ready_ota",
    category: "checkin"
  },
  {
    id: "node_checkin_completed",
    stageNumber: 5,
    stageName: "5. Entrada Realizada (Check-in)",
    title: "Check-in Realizado • Boas-vindas + Manual em PDF",
    subtitle: "Disparado no momento em que a portaria/tablet libera a entrada",
    triggerEvent: "checkin_completed",
    channelType: "whatsapp",
    recipients: ["hospede"],
    timingLabel: "Imediato à entrada do hóspede",
    condition: "Check-in confirmado no tablet da portaria ou PMS",
    channelsAllowed: ["site", "whatsapp", "booking", "airbnb", "outros"],
    hasAttachment: true,
    attachmentName: "Manual_do_Hospede_CorpFlats.pdf",
    description: "Mensagem calorosa de acolhimento ao quarto com link da central digital do hóspede e anexo automático do PDF completo do Manual do Hóspede.",
    messagePreview: `Olá, *{{primeiro_nome}}*! Seja muito bem-vindo(a) ao *Flat {{quarto}}*! 🏡✨
Esperamos que encontre tudo limpo, fresco e perfeito para o seu conforto.

📱 *Central do Hóspede:*
No portal abaixo você confere senhas, instruções dos aparelhos e regras de convivência do condomínio.

📎 *Manual do Hóspede em PDF anexado!* Tenha uma estadia incrível!`,
    buttons: [
      { label: "🌐 Abrir Portal do Flat", type: "URL", url: "https://.../portal-hospede/RES-..." },
      { label: "📞 Ligar Administração", type: "CALL" }
    ],
    editUrl: "/whatsapp?tab=rules&tpl=tpl_checkin_completed",
    category: "estadia"
  },

  // ── ETAPA 6: DURANTE A ESTADIA & CAFÉ DA MANHÃ ──────────────────────────────
  {
    id: "node_breakfast_reminder",
    stageNumber: 6,
    stageName: "6. Durante a Estadia (Noite)",
    title: "Café da Manhã • Montagem da Bandeja Artesanal no Quarto (18:00)",
    subtitle: "Disparado às 18:00 da véspera para agendamento dos itens",
    triggerEvent: "breakfast_reminder",
    channelType: "whatsapp",
    recipients: ["hospede"],
    timingLabel: "Véspera às 18:00",
    condition: "Reserva possui Café da Manhã contratado",
    channelsAllowed: ["site", "whatsapp"],
    description: "Lembra o hóspede de escolher os pães, frutas, bebidas e horário de entrega da bandeja no flat para a manhã seguinte.",
    messagePreview: `Olá, *{{primeiro_nome}}*! ☕🥐
Está na hora de agendar a sua bandeja de café da manhã para amanhã no *Flat {{quarto}}*!

Preparamos tudo fresquinho e entregamos diretamente no seu flat (o serviço é exclusivo no quarto). Escolha seus itens favoritos clicando no botão abaixo:`,
    buttons: [
      { label: "🥐 Montar Café da Manhã", type: "URL", url: "https://.../cafe/RES-..." }
    ],
    editUrl: "/whatsapp?tab=rules&tpl=tpl_breakfast_reminder",
    category: "estadia"
  },

  // ── ETAPA 7 & 8: CHECK-OUT & LIBERAÇÃO DA GOVERNANÇA ────────────────────────
  {
    id: "node_checkout_reminder",
    stageNumber: 7,
    stageName: "7. Dia do Check-out (Manhã)",
    title: "Lembrete de Saída • Horário Limite 12:00 & Check-out Expresso (09:30)",
    subtitle: "Disparado pontualmente às 09:30 do dia do checkout",
    triggerEvent: "checkout_reminder",
    channelType: "whatsapp",
    recipients: ["hospede"],
    timingLabel: "Dia do Check-out às 09:30",
    condition: "Reserva com saída hoje",
    channelsAllowed: ["site", "whatsapp", "booking", "airbnb", "outros"],
    description: "Relembra o encerramento da diária às 12:00, orienta a desligar o ar-condicionado e fornece o link de Check-out Expresso pelo celular.",
    messagePreview: `Bom dia, *{{primeiro_nome}}*! ☀️
Lembramos que hoje é a data de encerramento da sua estadia no *Flat {{quarto}}*.

⏰ *Horário limite de saída:* Até às 12:00.
Ao sair, por favor certifique-se de desligar luzes e ar-condicionado e entregue o cartão na portaria. Para agilizar, use o check-out digital:`,
    buttons: [
      { label: "🚪 Check-out Expresso", type: "URL", url: "https://.../checkout/RES-..." }
    ],
    editUrl: "/whatsapp?tab=rules&tpl=tpl_checkout_reminder",
    category: "checkout"
  },
  {
    id: "node_checkout_completed",
    stageNumber: 8,
    stageName: "8. Saída Confirmada (Check-out)",
    title: "Check-out Confirmado • Agradecimento & Retorno",
    subtitle: "Disparo no momento em que a saída é confirmada",
    triggerEvent: "checkout_completed",
    channelType: "whatsapp",
    recipients: ["hospede"],
    timingLabel: "Imediato à saída",
    condition: "Check-out confirmado no sistema ou pelo hóspede",
    channelsAllowed: ["site", "whatsapp", "booking", "airbnb", "outros"],
    description: "Agradece a preferência e cuidado com o flat, convida a reservar novamente e dispara internamente o status de Quarto Sujo para a Governança.",
    messagePreview: `Olá, *{{primeiro_nome}}*! 🚪✨
Confirmamos o seu check-out no *Flat {{quarto}}* do *{{nome_hotel}}*.

Agradecemos imensamente pela sua estadia e por todo o cuidado com o nosso espaço! Desejamos um excelente retorno para casa e uma ótima viagem. Esperamos recebê-lo(a) novamente em breve! 💙`,
    buttons: [
      { label: "🏨 Ver Minha Reserva", type: "URL", url: "https://.../portal-hospede/RES-..." },
      { label: "🌐 Reservar Novamente", type: "URL", url: "https://.../reservar" }
    ],
    editUrl: "/whatsapp?tab=rules&tpl=tpl_checkout_completed",
    category: "checkout"
  },
  {
    id: "node_maid_cleaning_trigger",
    stageNumber: 8,
    stageName: "8. Saída Confirmada (Check-out)",
    title: "Governança • Quarto Liberado para Limpeza & Alertas",
    subtitle: "Notificação interna para a equipe de camareiras",
    triggerEvent: "maid_cleaning_queue",
    channelType: "internal",
    recipients: ["camareira"],
    timingLabel: "Imediato após o check-out",
    condition: "Quarto passa a status 'Sujo'",
    channelsAllowed: ["all"],
    description: "Coloca o apartamento na fila de higienização. Monitora o tempo de limpeza e dispara alerta via WhatsApp se ultrapassar 40 minutos.",
    messagePreview: `⚠️ *Lembrete de Limpeza CorpFlats* 🧹
Olá, *{{nome_camareira}}*!
Notamos que o *Flat {{quarto}}* já está em limpeza há *{{tempo_limpeza}} minutos*. Se já finalizou, lembre-se de concluir no sistema para liberar o apartamento!`,
    editUrl: "/automacoes-camareiras",
    category: "checkout"
  },

  // ── ETAPA 9: PÓS-CHECK-OUT & REPUTAÇÃO ──────────────────────────────────────
  {
    id: "node_post_checkout_review",
    stageNumber: 9,
    stageName: "9. Pós Check-out (Reputação)",
    title: "Avaliação Google Maps • Solicitação 5 Estrelas (+2 Horas)",
    subtitle: "A última mensagem disparada da jornada do hóspede",
    triggerEvent: "post_checkout_review",
    channelType: "whatsapp",
    recipients: ["hospede"],
    timingLabel: "2 horas após o check-out (14:00)",
    condition: "Hóspede realizou check-out com sucesso",
    channelsAllowed: ["site", "whatsapp", "booking", "airbnb", "outros"],
    description: "Convida o hóspede a deixar um review nota máxima no perfil oficial do Google Maps, impulsionando a pontuação e captação orgânica da CorpFlats.",
    messagePreview: `Olá, *{{primeiro_nome}}*! 💙
Foi um prazer imenso ter você conosco no *{{nome_hotel}}*!

Esperamos que sua hospedagem tenha sido nota 10. Você poderia nos dedicar 30 segundos deixando sua avaliação no Google?
Sua opinião ajuda outros hóspedes e motiva nossa equipe a evoluir sempre:`,
    buttons: [
      { label: "⭐ Avaliar no Google (5 Estrelas)", type: "URL", url: "https://maps.app.goo.gl/..." }
    ],
    editUrl: "/whatsapp?tab=rules&tpl=tpl_post_checkout_review",
    category: "pos_estadia"
  },

  // ── ETAPA 10: EVENTOS DE EXCEÇÃO & ATUALIZAÇÕES ─────────────────────────────
  {
    id: "node_reservation_updated",
    stageNumber: 10,
    stageName: "Exceções & Alterações",
    title: "Modificação de Reserva • Resumo De ➔ Para",
    subtitle: "Disparo automático quando datas, quarto ou valores mudam",
    triggerEvent: "reservation_updated",
    channelType: "both",
    recipients: ["hospede", "recepcao", "solicitante"],
    timingLabel: "Imediato à edição no PMS",
    condition: "Qualquer alteração em datas, quarto, valores ou hóspedes",
    channelsAllowed: ["site", "whatsapp", "booking", "airbnb", "outros"],
    description: "Informa com precisão cirúrgica apenas os campos alterados (ex: Quarto Flat 101 ➔ Flat 113, Entrada: 20/09 ➔ 22/09) para o hóspede e envia e-mail formal à portaria.",
    messagePreview: `Olá, *{{primeiro_nome}}*! 🔄
Sua reserva (*{{numero_reserva}}*) no *{{nome_hotel}}* foi alterada.

Confira o que foi atualizado:
{{resumo_alteracoes}}

Os demais dados permanecem inalterados. Você pode consultar todos os detalhes no seu portal!`,
    buttons: [
      { label: "🏨 Ver Detalhes da Reserva", type: "URL", url: "https://.../portal-hospede/RES-..." },
      { label: "📞 Falar com Atendimento", type: "CALL" }
    ],
    editUrl: "/whatsapp?tab=rules&tpl=tpl_reservation_updated",
    category: "excecao"
  },
  {
    id: "node_reservation_cancelled",
    stageNumber: 10,
    stageName: "Exceções & Alterações",
    title: "Cancelamento de Reserva • Notificação & Bloqueio Portaria",
    subtitle: "Disparo automático quando a reserva é cancelada",
    triggerEvent: "reservation_cancelled",
    channelType: "both",
    recipients: ["hospede", "recepcao", "solicitante"],
    timingLabel: "Imediato ao cancelamento",
    condition: "Status alterado para 'Cancelada'",
    channelsAllowed: ["site", "whatsapp", "booking", "airbnb", "outros"],
    description: "Confirma o cancelamento para o hóspede, convida para futuras estadias e envia alerta vermelho à portaria para não liberar acesso.",
    messagePreview: `Olá, *{{nome_hospede}}*.
Confirmamos o cancelamento da sua reserva *{{numero_reserva}}* no *{{nome_hotel}}*.

Lamentamos que não possa se hospedar conosco nesta ocasião e estaremos de braços abertos para recebê-lo em suas próximas viagens a Campos!`,
    buttons: [
      { label: "🌐 Reservar Novas Datas", type: "URL", url: "https://.../reservar" }
    ],
    editUrl: "/whatsapp?tab=rules&tpl=tpl_reservation_cancelled",
    category: "excecao"
  }
]

// ── Cenários Predefinidos para Simulação / Auditoria ──────────────────────────

interface Scenario {
  id: string
  title: string
  subtitle: string
  channel: "site" | "whatsapp" | "booking" | "airbnb"
  isPaid: boolean
  hasCar: boolean
  hasBreakfast: boolean
  currentStage: string
  activeNodeIds: string[]
  description: string
}

const SIMULATION_SCENARIOS: Scenario[] = [
  {
    id: "site_unpaid",
    title: "1. Reserva no Site • Aguardando PIX / Não Paga",
    subtitle: "Hóspede solicitou reserva direta no site, mas ainda não pagou",
    channel: "site",
    isPaid: false,
    hasCar: false,
    hasBreakfast: false,
    currentStage: "Pré-Reserva",
    activeNodeIds: ["node_pre_reserva", "node_payment_pending"],
    description: "O sistema coloca a reserva como 'Pré-Reserva' e dispara imediatamente mensagem no WhatsApp com chave PIX e link seguro de pagamento para conversão imediata."
  },
  {
    id: "site_paid",
    title: "2. Reserva no Site • Paga via PIX (Fluxo Padrão Completo)",
    subtitle: "Hóspede reservou no site oficial e pagou imediatamente via PIX",
    channel: "site",
    isPaid: true,
    hasCar: true,
    hasBreakfast: true,
    currentStage: "Confirmada",
    activeNodeIds: [
      "node_payment_confirmed",
      "node_res_created_direct",
      "node_pre_checkin_reminder",
      "node_portaria_checkin_email",
      "node_garagem_autorizacao",
      "node_checkin_day_instructions",
      "node_room_ready_direct",
      "node_checkin_completed",
      "node_breakfast_reminder",
      "node_checkout_reminder",
      "node_checkout_completed",
      "node_maid_cleaning_trigger",
      "node_post_checkout_review"
    ],
    description: "Jornada direta perfeita: Confirmação + Benefício de Early Check-in cortesia + Pré-checkin digital + Garagem autorizada + Boas-vindas + Café no quarto + Avaliação no Google."
  },
  {
    id: "booking_standard",
    title: "3. Reserva Booking.com / Airbnb (OTA)",
    subtitle: "Reserva externa vinda de OTA sem revelar número do flat",
    channel: "booking",
    isPaid: true,
    hasCar: true,
    hasBreakfast: false,
    currentStage: "Confirmada (OTA)",
    activeNodeIds: [
      "node_res_created_ota",
      "node_pre_checkin_reminder",
      "node_portaria_checkin_email",
      "node_garagem_autorizacao",
      "node_checkin_day_instructions",
      "node_room_ready_ota",
      "node_checkin_completed",
      "node_checkout_reminder",
      "node_checkout_completed",
      "node_maid_cleaning_trigger",
      "node_post_checkout_review"
    ],
    description: "Não revela o número do flat até a liberação no dia (às 12h se limpo ou 14h padrão) e promove benefícios exclusivos para o hóspede reservar direto na próxima viagem."
  },
  {
    id: "day_of_checkin",
    title: "4. Dia do Check-in • Quarto Liberado & Entrada",
    subtitle: "Momento exato da higienização concluída e chegada na portaria",
    channel: "site",
    isPaid: true,
    hasCar: true,
    hasBreakfast: false,
    currentStage: "Entrada Hoje",
    activeNodeIds: [
      "node_checkin_day_instructions",
      "node_room_ready_direct",
      "node_checkin_completed",
      "node_portaria_checkin_email",
      "node_garagem_autorizacao"
    ],
    description: "Camareira finaliza o quarto -> Sistema dispara WhatsApp de Quarto Liberado (Early Check-in) -> Portaria recebe FNRH digital -> Hóspede entra e recebe o Manual em PDF."
  },
  {
    id: "checkout_review",
    title: "5. Dia do Check-out • Saída & Avaliação Google",
    subtitle: "Etapa final de saída até a coleta de depoimento 5 estrelas",
    channel: "site",
    isPaid: true,
    hasCar: false,
    hasBreakfast: false,
    currentStage: "Finalizada",
    activeNodeIds: [
      "node_checkout_reminder",
      "node_checkout_completed",
      "node_maid_cleaning_trigger",
      "node_post_checkout_review"
    ],
    description: "Lembrete 09:30 -> Check-out confirmado -> Governança notificada para limpeza -> +2h pós-checkout: Solicitação automática de avaliação 5 estrelas no Google Maps."
  },
  {
    id: "exception_change",
    title: "6. Alteração de Datas ou Quarto (Exceção)",
    subtitle: "Reserva modificada manualmente no painel PMS",
    channel: "whatsapp",
    isPaid: true,
    hasCar: false,
    hasBreakfast: false,
    currentStage: "Modificada",
    activeNodeIds: ["node_reservation_updated", "node_portaria_checkin_email"],
    description: "Dispara aviso dinâmico informando estritamente os campos alterados (De -> Para) ao hóspede e atualiza a portaria."
  }
]

// ── Componente Principal ──────────────────────────────────────────────────────

export default function ReservationJourney() {
  const [, setLocation] = useLocation()
  const { data: user } = useGetMe()

  // Aba selecionada
  const [activeTab, setActiveTab] = useState<string>("timeline")

  // Filtro por destinatário
  const [recipientFilter, setRecipientFilter] = useState<string>("all")

  // Filtro por canal de envio
  const [channelFilter, setChannelFilter] = useState<string>("all")

  // Cenário selecionado no Simulador
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("site_paid")

  // Nó selecionado para o modal de prévia detalhada
  const [selectedNode, setSelectedNode] = useState<JourneyNode | null>(null)
  const [previewModalOpen, setPreviewModalOpen] = useState<boolean>(false)

  // Dados reais carregados do servidor
  const [systemTemplates, setSystemTemplates] = useState<any[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState<boolean>(false)
  const [zapiStatus, setZapiStatus] = useState<any>(null)
  const [smtpStatus, setSmtpStatus] = useState<any>(null)

  // Carrega templates reais para checar status (habilitado/desabilitado)
  useEffect(() => {
    fetchSystemStatus()
  }, [])

  const fetchSystemStatus = async () => {
    setLoadingTemplates(true)
    try {
      const [resTpl, resZapi, resSmtp] = await Promise.allSettled([
        fetch("/api/whatsapp/templates"),
        fetch("/api/whatsapp/status"),
        fetch("/api/emails/config")
      ])

      if (resTpl.status === "fulfilled" && resTpl.value.ok) {
        const d = await resTpl.value.json()
        setSystemTemplates(Array.isArray(d) ? d : [])
      }

      if (resZapi.status === "fulfilled" && resZapi.value.ok) {
        const d = await resZapi.value.json()
        setZapiStatus(d)
      }

      if (resSmtp.status === "fulfilled" && resSmtp.value.ok) {
        const d = await resSmtp.value.json()
        setSmtpStatus(d)
      }
    } catch (e) {
      console.warn("Erro ao buscar status do sistema:", e)
    } finally {
      setLoadingTemplates(false)
    }
  }

  // Verifica se um nó está habilitado no sistema real
  const isNodeEnabledInSystem = (node: JourneyNode): boolean => {
    if (node.channelType === "internal") return true
    if (node.channelType === "email") return smtpStatus?.enabled ?? true
    const found = systemTemplates.find(t => t.id === node.id.replace("node_", "tpl_") || t.triggerEvent === node.triggerEvent)
    if (found) return found.enabled !== false
    return true
  }

  // Cenário ativo no simulador
  const currentScenario = useMemo(() => {
    return SIMULATION_SCENARIOS.find(s => s.id === selectedScenarioId) || SIMULATION_SCENARIOS[0]
  }, [selectedScenarioId])

  // Nós filtrados na aba de Timeline
  const filteredTimelineNodes = useMemo(() => {
    return JOURNEY_NODES.filter(node => {
      if (recipientFilter !== "all" && !node.recipients.includes(recipientFilter as any)) {
        return false
      }
      if (channelFilter !== "all") {
        if (channelFilter === "whatsapp" && node.channelType !== "whatsapp" && node.channelType !== "both") return false
        if (channelFilter === "email" && node.channelType !== "email" && node.channelType !== "both") return false
        if (channelFilter === "internal" && node.channelType !== "internal") return false
      }
      return true
    })
  }, [recipientFilter, channelFilter])

  // Agrupa os nós por etapa cronológica
  const stagesGrouped = useMemo(() => {
    const groups: { [key: string]: JourneyNode[] } = {}
    filteredTimelineNodes.forEach(node => {
      if (!groups[node.stageName]) groups[node.stageName] = []
      groups[node.stageName].push(node)
    })
    return groups
  }, [filteredTimelineNodes])

  // Destinatários para visualização departamental
  const RECIPIENT_SECTORS = [
    {
      id: "hospede",
      name: "👤 Hóspede Titular & Solicitante",
      badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300",
      description: "Mensagens enviadas para o WhatsApp e E-mail do hóspede ou empresa contratante",
      nodes: JOURNEY_NODES.filter(n => n.recipients.includes("hospede") || n.recipients.includes("solicitante"))
    },
    {
      id: "recepcao",
      name: "🛎️ Portaria & Recepção 24h",
      badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300",
      description: "E-mails formais com dados de FNRH digital, lista de acompanhantes, alterações e cancelamentos",
      nodes: JOURNEY_NODES.filter(n => n.recipients.includes("recepcao"))
    },
    {
      id: "garagem",
      name: "🚗 Garagem & Estacionamento",
      badgeClass: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-300",
      description: "Liberação formal de vaga rotativa gratuita com placa, modelo, cor, apartamento e período",
      nodes: JOURNEY_NODES.filter(n => n.recipients.includes("garagem"))
    },
    {
      id: "camareira",
      name: "🧹 Governança & Camareiras",
      badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300",
      description: "Alertas de quartos sujos pós-checkout, quartos em limpeza prolongada (>40 min) e fechamentos",
      nodes: JOURNEY_NODES.filter(n => n.recipients.includes("camareira"))
    }
  ]

  // Canais de Venda para Comparativo
  const SALES_CHANNELS = [
    {
      id: "site",
      name: "🌐 Site Oficial (Direto)",
      icon: Globe,
      color: "border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20",
      summary: "Canal mais rentável. Permite pré-reserva com PIX automático ou confirmação com cartão em até 12x. Concede Early Check-in cortesia e acesso imediato ao portal.",
      earlyCheckinRule: "✅ Incluso gratuitamente se o flat for liberado antes pelas camareiras.",
      flatNumberRule: "✅ Revelado imediatamente na confirmação.",
      breakfastRule: "🥐 Notificação de montagem às 18:00 se contratado.",
      allowedNodeIds: [
        "node_pre_reserva",
        "node_payment_pending",
        "node_payment_confirmed",
        "node_res_created_direct",
        "node_pre_checkin_reminder",
        "node_portaria_checkin_email",
        "node_garagem_autorizacao",
        "node_checkin_day_instructions",
        "node_room_ready_direct",
        "node_checkin_completed",
        "node_breakfast_reminder",
        "node_checkout_reminder",
        "node_checkout_completed",
        "node_maid_cleaning_trigger",
        "node_post_checkout_review"
      ]
    },
    {
      id: "whatsapp",
      name: "💬 WhatsApp Direto / Balcão",
      icon: MessageSquare,
      color: "border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20",
      summary: "Fechado diretamente pelo atendente no WhatsApp ou presencialmente. Suporte a faturamento PJ para empresas e solicitantes com envio de PIX personalizado.",
      earlyCheckinRule: "✅ Incluso gratuitamente conforme disponibilidade.",
      flatNumberRule: "✅ Revelado imediatamente na confirmação.",
      breakfastRule: "🥐 Notificação de montagem às 18:00 se contratado.",
      allowedNodeIds: [
        "node_pre_reserva",
        "node_payment_pending",
        "node_payment_confirmed",
        "node_res_created_direct",
        "node_pre_checkin_reminder",
        "node_portaria_checkin_email",
        "node_garagem_autorizacao",
        "node_checkin_day_instructions",
        "node_room_ready_direct",
        "node_checkin_completed",
        "node_breakfast_reminder",
        "node_checkout_reminder",
        "node_checkout_completed",
        "node_maid_cleaning_trigger",
        "node_post_checkout_review"
      ]
    },
    {
      id: "ota",
      name: "🏨 Booking.com & Airbnb (OTAs)",
      icon: Building2,
      color: "border-sky-500 bg-sky-50/40 dark:bg-sky-950/20",
      summary: "Reservas importadas das OTAs. Estratégia inteligente de ocultar o número do apartamento até o dia da entrada e incentivar o hóspede a reservar direto da próxima vez.",
      earlyCheckinRule: "⏰ Entrada padrão às 14:00 (ou às 12:00 se liberado). Early check-in antes das 12h apenas sob consulta.",
      flatNumberRule: "🔒 Ocultado na confirmação; atribuído e revelado no dia do check-in às 12h ou 14h.",
      breakfastRule: "☕ Geralmente sem café incluso (ou adquirido à parte).",
      allowedNodeIds: [
        "node_res_created_ota",
        "node_pre_checkin_reminder",
        "node_portaria_checkin_email",
        "node_garagem_autorizacao",
        "node_checkin_day_instructions",
        "node_room_ready_ota",
        "node_checkin_completed",
        "node_checkout_reminder",
        "node_checkout_completed",
        "node_maid_cleaning_trigger",
        "node_post_checkout_review"
      ]
    }
  ]

  // Renderiza ícone do canal
  const renderChannelIcon = (type: JourneyNode["channelType"]) => {
    switch (type) {
      case "whatsapp":
        return <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-xs"><Smartphone className="w-3.5 h-3.5" /> WhatsApp</span>
      case "email":
        return <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold text-xs"><Mail className="w-3.5 h-3.5" /> E-mail</span>
      case "both":
        return <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold text-xs"><Share2 className="w-3.5 h-3.5" /> WhatsApp + E-mail</span>
      case "internal":
        return <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 font-semibold text-xs"><Layers className="w-3.5 h-3.5" /> Sistema Interno</span>
    }
  }

  // Renderiza badges dos destinatários
  const renderRecipientBadges = (recipients: JourneyNode["recipients"]) => {
    return (
      <div className="flex flex-wrap gap-1">
        {recipients.map(r => {
          switch (r) {
            case "hospede":
              return <Badge key={r} variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200">Hóspede</Badge>
            case "solicitante":
              return <Badge key={r} variant="outline" className="text-[10px] px-1.5 py-0 bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200">Solicitante</Badge>
            case "recepcao":
              return <Badge key={r} variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200">Portaria</Badge>
            case "garagem":
              return <Badge key={r} variant="outline" className="text-[10px] px-1.5 py-0 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200">Garagem</Badge>
            case "camareira":
              return <Badge key={r} variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200">Camareiras</Badge>
            default:
              return null
          }
        })}
      </div>
    )
  }

  // Abre modal de inspeção
  const openNodeDetails = (node: JourneyNode) => {
    setSelectedNode(node)
    setPreviewModalOpen(true)
  }

  return (
    <Shell>
      <div className="space-y-6 pb-16 max-w-7xl mx-auto">
        {/* ── Cabeçalho Principal ─────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6 rounded-2xl shadow-xl border border-slate-700/60">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
                Auditoria & Governança 360°
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Z-API & SMTP Integrados
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-3">
              <Workflow className="w-7 h-7 text-amber-400" />
              Mapa da Jornada de Comunicação das Reservas
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-3xl">
              Visualize, confira e audite todas as mensagens e e-mails disparados em cada etapa da estadia — abrangendo o Hóspede, a Recepção/Portaria, a Garagem e a Governança.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button 
              variant="outline" 
              size="sm" 
              className="bg-slate-800/80 border-slate-600 text-slate-200 hover:bg-slate-700 hover:text-white"
              onClick={fetchSystemStatus}
              disabled={loadingTemplates}
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loadingTemplates ? 'animate-spin' : ''}`} />
              Atualizar Status
            </Button>
            <Button 
              size="sm" 
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              onClick={() => setLocation("/whatsapp")}
            >
              <Smartphone className="w-3.5 h-3.5 mr-1.5" />
              Editar WhatsApp
            </Button>
            <Button 
              size="sm" 
              className="bg-amber-600 hover:bg-amber-500 text-white font-semibold"
              onClick={() => setLocation("/emails")}
            >
              <Mail className="w-3.5 h-3.5 mr-1.5" />
              Gerenciar E-mails
            </Button>
          </div>
        </div>

        {/* ── Cards de Status e Resumo ────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <Card className="border-slate-200 dark:border-slate-800">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">Gatilhos Mapeados</p>
                <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{JOURNEY_NODES.length}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                <Workflow className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">Destinatários</p>
                <p className="text-2xl font-black text-slate-800 dark:text-slate-100">4 Setores</p>
                <p className="text-[11px] text-muted-foreground">Hóspede, Portaria, Garagem, Camareiras</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                <Building2 className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">Motor WhatsApp</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-2 h-2 rounded-full ${zapiStatus?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {zapiStatus?.connected ? "Conectado" : "Instância Ativa"}
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground">Z-API WhatsApp Cloud</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                <Smartphone className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">Motor SMTP (E-mail)</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-2 h-2 rounded-full ${smtpStatus?.enabled !== false ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {smtpStatus?.enabled !== false ? "Operacional" : "Pausado"}
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground">Zoho Mail Corporativo</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                <Mail className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Navegação por Abas (Para não embolar) ────────────────────────── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-3">
            <TabsList className="bg-slate-100 dark:bg-slate-900 p-1 rounded-xl h-auto flex flex-wrap">
              <TabsTrigger value="timeline" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 font-semibold px-4 py-2 rounded-lg">
                <Clock className="w-4 h-4 mr-2 text-blue-500" />
                Linha do Tempo Cronológica
              </TabsTrigger>
              <TabsTrigger value="sectors" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 font-semibold px-4 py-2 rounded-lg">
                <Building2 className="w-4 h-4 mr-2 text-purple-500" />
                Por Destinatário (Setores)
              </TabsTrigger>
              <TabsTrigger value="channels" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 font-semibold px-4 py-2 rounded-lg">
                <Globe className="w-4 h-4 mr-2 text-emerald-500" />
                Comparativo por Canais
              </TabsTrigger>
              <TabsTrigger value="simulator" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 font-semibold px-4 py-2 rounded-lg text-amber-600 dark:text-amber-400">
                <Zap className="w-4 h-4 mr-2 text-amber-500" />
                Simulador & Auditor de Cenários
              </TabsTrigger>
            </TabsList>

            {/* Filtros Rápidos (quando estiver na timeline) */}
            {activeTab === "timeline" && (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={recipientFilter} onValueChange={setRecipientFilter}>
                  <SelectTrigger className="w-[170px] h-9 text-xs">
                    <SelectValue placeholder="Destinatário" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">👥 Todos Destinatários</SelectItem>
                    <SelectItem value="hospede">👤 Hóspede</SelectItem>
                    <SelectItem value="recepcao">🛎️ Portaria</SelectItem>
                    <SelectItem value="garagem">🚗 Garagem</SelectItem>
                    <SelectItem value="camareira">🧹 Camareiras</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={channelFilter} onValueChange={setChannelFilter}>
                  <SelectTrigger className="w-[150px] h-9 text-xs">
                    <SelectValue placeholder="Canal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">📡 Todos Canais</SelectItem>
                    <SelectItem value="whatsapp">💬 Apenas WhatsApp</SelectItem>
                    <SelectItem value="email">✉️ Apenas E-mails</SelectItem>
                    <SelectItem value="internal">⚙️ Interno</SelectItem>
                  </SelectContent>
                </Select>

                {(recipientFilter !== "all" || channelFilter !== "all") && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-9 px-2 text-xs text-muted-foreground"
                    onClick={() => { setRecipientFilter("all"); setChannelFilter("all") }}
                  >
                    Limpar
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* ═════════════════════════════════════════════════════════════════════
              ABA 1: LINHA DO TEMPO CRONOLÓGICA (FLUXOGRAMA VERTICAL)
          ═════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="timeline" className="space-y-6 m-0">
            <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-500 shrink-0" />
                <span>
                  Clique em qualquer cartão para ver a <strong>mensagem completa</strong> com botões, links de ação e anexo em PDF.
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Ativo no Hotel</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700"></span> Desativado</span>
              </div>
            </div>

            <div className="relative pl-6 sm:pl-8 border-l-2 border-slate-200 dark:border-slate-800 space-y-10 my-4">
              {Object.entries(stagesGrouped).map(([stageName, nodes], stageIdx) => (
                <div key={stageName} className="relative space-y-4">
                  {/* Marcador da Etapa na Linha do Tempo */}
                  <div className="absolute -left-[31px] sm:-left-[39px] top-0 flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-900 text-amber-400 font-bold text-xs shadow-md border-2 border-background">
                    {stageIdx + 1}
                  </div>

                  {/* Título da Etapa */}
                  <div className="pl-2">
                    <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      {stageName}
                      <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
                        {nodes.length} disparo(s)
                      </Badge>
                    </h2>
                  </div>

                  {/* Nós da Etapa */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {nodes.map(node => {
                      const enabled = isNodeEnabledInSystem(node)
                      return (
                        <Card 
                          key={node.id} 
                          onClick={() => openNodeDetails(node)}
                          className={`cursor-pointer transition-all hover:shadow-md hover:border-amber-400/80 group relative overflow-hidden ${
                            enabled 
                              ? 'border-slate-200 dark:border-slate-800 bg-card' 
                              : 'opacity-60 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30'
                          }`}
                        >
                          <div className={`h-1 w-full absolute top-0 left-0 ${
                            node.channelType === 'whatsapp' ? 'bg-emerald-500' :
                            node.channelType === 'email' ? 'bg-amber-500' :
                            node.channelType === 'both' ? 'bg-blue-500' : 'bg-purple-500'
                          }`} />

                          <CardHeader className="p-4 pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {renderChannelIcon(node.channelType)}
                                  <span className="text-slate-300 dark:text-slate-700">•</span>
                                  <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> {node.timingLabel}
                                  </span>
                                </div>
                                <CardTitle className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                                  {node.title}
                                </CardTitle>
                              </div>
                              <Badge 
                                variant={enabled ? "default" : "outline"} 
                                className={`shrink-0 text-[10px] ${enabled ? 'bg-emerald-600 hover:bg-emerald-600 text-white' : 'text-slate-400'}`}
                              >
                                {enabled ? "Ativo" : "Pausado"}
                              </Badge>
                            </div>
                            <CardDescription className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                              {node.description}
                            </CardDescription>
                          </CardHeader>

                          <CardContent className="p-4 pt-2 space-y-3">
                            {/* Destinatários e Gatilho */}
                            <div className="flex items-center justify-between gap-2 pt-2 border-t text-xs">
                              <div>
                                <span className="text-[10px] text-muted-foreground uppercase font-medium block mb-1">Destinatários:</span>
                                {renderRecipientBadges(node.recipients)}
                              </div>

                              <div className="text-right">
                                <span className="text-[10px] text-muted-foreground uppercase font-medium block mb-0.5">Evento:</span>
                                <code className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono text-slate-600 dark:text-slate-300">
                                  {node.triggerEvent}
                                </code>
                              </div>
                            </div>

                            {/* Detalhes extras (Anexo ou Botões) */}
                            {(node.hasAttachment || (node.buttons && node.buttons.length > 0)) && (
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-slate-50 dark:bg-slate-900/60 p-2 rounded-lg">
                                {node.hasAttachment && (
                                  <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                                    <Paperclip className="w-3 h-3" /> Anexo PDF
                                  </span>
                                )}
                                {node.buttons && node.buttons.length > 0 && (
                                  <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                                    <QrCode className="w-3 h-3" /> {node.buttons.length} Botão(ões) Interativo(s)
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Botão de abrir prévia */}
                            <div className="flex items-center justify-between text-xs font-semibold text-amber-600 dark:text-amber-400 pt-1 group-hover:underline">
                              <span>Visualizar mensagem completa</span>
                              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ═════════════════════════════════════════════════════════════════════
              ABA 2: POR DESTINATÁRIO (SETORES: HÓSPEDE, PORTARIA, GARAGEM, ETC)
          ═════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="sectors" className="space-y-8 m-0">
            <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-muted-foreground flex items-center gap-2">
              <Building2 className="w-4 h-4 text-purple-500 shrink-0" />
              <span>
                Visão departamental organizada: confira com precisão tudo o que cada setor ou participante recebe ao longo da estadia.
              </span>
            </div>

            <div className="space-y-8">
              {RECIPIENT_SECTORS.map(sector => (
                <Card key={sector.id} className="border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                  <CardHeader className="bg-slate-100/70 dark:bg-slate-900/70 p-4 sm:p-5 border-b">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          {sector.name}
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {sector.description}
                        </CardDescription>
                      </div>
                      <Badge className={sector.badgeClass}>
                        {sector.nodes.length} mensagem(ns) mapeada(s)
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 sm:p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {sector.nodes.map(node => (
                        <div 
                          key={node.id} 
                          onClick={() => openNodeDetails(node)}
                          className="cursor-pointer p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-amber-400 hover:shadow-sm transition-all bg-card space-y-2 group"
                        >
                          <div className="flex items-center justify-between gap-1 text-[11px]">
                            {renderChannelIcon(node.channelType)}
                            <span className="text-slate-400 text-[10px]">{node.timingLabel}</span>
                          </div>

                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-400">
                            {node.title}
                          </h4>

                          <p className="text-[11px] text-muted-foreground line-clamp-2">
                            {node.description}
                          </p>

                          <div className="pt-2 border-t flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>{node.stageName}</span>
                            <span className="font-semibold text-amber-600 dark:text-amber-400 group-hover:underline flex items-center gap-0.5">
                              Ver <ChevronRight className="w-3 h-3" />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ═════════════════════════════════════════════════════════════════════
              ABA 3: COMPARATIVO POR CANAIS DE VENDA
          ═════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="channels" className="space-y-6 m-0">
            <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-muted-foreground flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>
                Cada canal possui regras específicas para proteger o inventário e maximizar o faturamento direto. Compare abaixo as diretrizes de cada um.
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {SALES_CHANNELS.map(ch => {
                const IconComponent = ch.icon
                return (
                  <Card key={ch.id} className={`border-2 ${ch.color} shadow-sm space-y-4`}>
                    <CardHeader className="p-5 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center font-bold text-slate-800 dark:text-slate-100">
                          <IconComponent className="w-5 h-5 text-amber-500" />
                        </div>
                        <div>
                          <CardTitle className="text-base font-bold">{ch.name}</CardTitle>
                          <Badge variant="outline" className="text-[10px] mt-0.5">
                            {ch.allowedNodeIds.length} gatilhos ativos
                          </Badge>
                        </div>
                      </div>
                      <CardDescription className="text-xs text-slate-600 dark:text-slate-300 mt-2">
                        {ch.summary}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="p-5 pt-0 space-y-3.5 text-xs">
                      <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border space-y-2">
                        <div>
                          <span className="font-bold text-slate-700 dark:text-slate-200 block text-[11px]">Número do Quarto:</span>
                          <span className="text-slate-600 dark:text-slate-300 text-[11px]">{ch.flatNumberRule}</span>
                        </div>
                        <div className="pt-1.5 border-t">
                          <span className="font-bold text-slate-700 dark:text-slate-200 block text-[11px]">Early Check-in Cortesia:</span>
                          <span className="text-slate-600 dark:text-slate-300 text-[11px]">{ch.earlyCheckinRule}</span>
                        </div>
                        <div className="pt-1.5 border-t">
                          <span className="font-bold text-slate-700 dark:text-slate-200 block text-[11px]">Café da Manhã no Quarto:</span>
                          <span className="text-slate-600 dark:text-slate-300 text-[11px]">{ch.breakfastRule}</span>
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
                          Gatilhos Disparados neste Canal:
                        </p>
                        <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
                          {JOURNEY_NODES.filter(n => ch.allowedNodeIds.includes(n.id)).map(node => (
                            <div 
                              key={node.id} 
                              onClick={() => openNodeDetails(node)}
                              className="p-2 rounded-lg bg-white/60 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-900 border text-[11px] cursor-pointer flex items-center justify-between gap-2 transition-colors"
                            >
                              <div className="truncate font-medium text-slate-800 dark:text-slate-200">
                                {node.title}
                              </div>
                              <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </TabsContent>

          {/* ═════════════════════════════════════════════════════════════════════
              ABA 4: SIMULADOR & AUDITOR DE CENÁRIOS EM TEMPO REAL
          ═════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="simulator" className="space-y-6 m-0">
            <Card className="border-amber-300 dark:border-amber-800/60 bg-amber-50/20 dark:bg-amber-950/10">
              <CardHeader className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500 text-slate-950">
                        Ferramenta de Auditoria
                      </span>
                      <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-500" />
                        Simulador Interativo da Jornada da Reserva
                      </CardTitle>
                    </div>
                    <CardDescription className="text-xs text-muted-foreground mt-1">
                      Escolha um caso de uso abaixo para verificar e auditar instantaneamente o caminho percorrido, quais mensagens são disparadas e o texto renderizado.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-4 sm:p-5 pt-0 space-y-4">
                {/* Seletor de Cenários em Botões Rápidos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {SIMULATION_SCENARIOS.map(sc => {
                    const isSelected = sc.id === selectedScenarioId
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => setSelectedScenarioId(sc.id)}
                        className={`text-left p-3 rounded-xl border transition-all ${
                          isSelected 
                            ? 'border-amber-500 bg-amber-100/50 dark:bg-amber-950/40 shadow-sm' 
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-card'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{sc.title}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          {sc.subtitle}
                        </p>
                      </button>
                    )
                  })}
                </div>

                {/* Painel do Cenário Selecionado */}
                <div className="bg-card p-4 sm:p-5 rounded-xl border shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                        Resultado da Auditoria: {currentScenario.title}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {currentScenario.description}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs px-2.5 py-1 bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-300 shrink-0">
                      {currentScenario.activeNodeIds.length} Mensagens Disparadas
                    </Badge>
                  </div>

                  {/* Caminho dos Nós Ativados no Cenário */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Trilha de Disparos Ativada (Sequência Cronológica):
                    </p>

                    <div className="space-y-2.5">
                      {currentScenario.activeNodeIds.map((nodeId, idx) => {
                        const node = JOURNEY_NODES.find(n => n.id === nodeId)
                        if (!node) return null
                        const isEnabled = isNodeEnabledInSystem(node)

                        return (
                          <div 
                            key={node.id} 
                            onClick={() => openNodeDetails(node)}
                            className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border bg-slate-50/50 dark:bg-slate-900/30 hover:border-amber-400 hover:bg-card cursor-pointer transition-all gap-2 group"
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-6 h-6 rounded-full bg-slate-900 text-amber-400 font-bold text-xs flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-400">
                                    {node.title}
                                  </h4>
                                  <Badge variant={isEnabled ? "default" : "outline"} className={`text-[9px] px-1 py-0 ${isEnabled ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>
                                    {isEnabled ? "Ativo" : "Pausado"}
                                  </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                                  <span>{node.stageName}</span>
                                  <span>•</span>
                                  <span className="text-amber-600 dark:text-amber-400 font-medium">{node.timingLabel}</span>
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 self-end sm:self-center">
                              {renderChannelIcon(node.channelType)}
                              {renderRecipientBadges(node.recipients)}
                              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ── Modal: Prévia Completa da Mensagem & Ações ──────────────────── */}
        <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {selectedNode && (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-900 text-amber-400">
                      {selectedNode.stageName}
                    </span>
                    {renderChannelIcon(selectedNode.channelType)}
                  </div>
                  <DialogTitle className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                    {selectedNode.title}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Gatilho: <code className="font-mono text-slate-800 dark:text-slate-200 font-semibold">{selectedNode.triggerEvent}</code> • Disparo: {selectedNode.timingLabel}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 my-2 text-xs">
                  {/* Meta Informações */}
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border">
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Destinatários:</span>
                      {renderRecipientBadges(selectedNode.recipients)}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Canais Autorizados:</span>
                      <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                        {selectedNode.channelsAllowed.join(", ").toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Descrição de Funcionamento */}
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-slate-100 mb-1">Como Funciona este Disparo:</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {selectedNode.description}
                    </p>
                  </div>

                  {/* Prévia da Mensagem (Estilo Balão WhatsApp ou E-mail) */}
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-slate-100 mb-1 flex items-center justify-between">
                      <span>Conteúdo da Mensagem:</span>
                      <span className="text-[10px] text-muted-foreground font-normal">Variáveis substituídas em tempo de envio</span>
                    </h4>

                    <div className="bg-emerald-950/10 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800/60 p-4 rounded-2xl text-slate-800 dark:text-slate-100 font-sans text-xs leading-relaxed space-y-3 shadow-inner">
                      <div className="whitespace-pre-wrap font-sans">
                        {selectedNode.messagePreview}
                      </div>

                      {/* Anexo se houver */}
                      {selectedNode.hasAttachment && (
                        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border flex items-center gap-2.5 text-xs text-blue-600 dark:text-blue-400 font-medium">
                          <Paperclip className="w-4 h-4 shrink-0" />
                          <div className="truncate">
                            <span className="font-bold block text-slate-800 dark:text-slate-200">Arquivo PDF Anexo</span>
                            <span className="text-[11px] text-muted-foreground">{selectedNode.attachmentName || "Manual_do_Hospede_CorpFlats.pdf"}</span>
                          </div>
                        </div>
                      )}

                      {/* Botões Interativos se houver */}
                      {selectedNode.buttons && selectedNode.buttons.length > 0 && (
                        <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800/60 space-y-1.5">
                          <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase block">Botões Interativos no WhatsApp:</span>
                          {selectedNode.buttons.map((btn, bIdx) => (
                            <div key={bIdx} className="w-full text-center py-2 px-3 rounded-xl bg-white dark:bg-slate-800 shadow-sm border text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-1.5">
                              {btn.type === "URL" ? <ExternalLink className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
                              {btn.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <DialogFooter className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t">
                  <Button variant="outline" size="sm" onClick={() => setPreviewModalOpen(false)}>
                    Fechar
                  </Button>
                  <Button 
                    size="sm" 
                    className="bg-amber-600 hover:bg-amber-500 text-white font-semibold flex items-center gap-1.5"
                    onClick={() => {
                      setPreviewModalOpen(false)
                      setLocation(selectedNode.editUrl)
                    }}
                  >
                    <span>Editar este Modelo no Módulo</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  )
}

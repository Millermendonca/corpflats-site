export type LandingPageSlug =
  | "home"
  | "hospedagem-corporativa-campos"
  | "fim-de-semana-campos"
  | "flat-centro-campos-rj"
  | "estadia-longa-campos";

export const PUBLIC_SEO_SLUGS: LandingPageSlug[] = [
  "home",
  "hospedagem-corporativa-campos",
  "fim-de-semana-campos",
  "flat-centro-campos-rj",
  "estadia-longa-campos",
];

export interface SeoLandingPageSpec {
  slug: LandingPageSlug;
  path: string;
  canonicalUrl: string;
  title: string;
  metaDescription: string;
  breadcrumbLabel: string;
  badgeTop: string;
  h1: string;
  highlightText: string;
  subtitle: string;
  heroImageBase: string;
  heroImageUrl: string;
  heroImageAlt: string;
  ctaButtonText: string;
  defaultNights: number;
  defaultAdults: number;
  defaultRatePlan: "with_breakfast" | "room_only";
  forceWeekendDates?: boolean;
  forceWeekdayCorporateDates?: boolean;
  defaultIsWorkTrip?: boolean;
  showLongStayQuickPills?: boolean;
  preferredGalleryUrls: string[];
  prioritizedTestimonialNames: string[];
  sectionHeading: string;
  sectionSubtitle: string;
  valuePillars: Array<{ title: string; description: string; badge?: string }>;
  distanceGroups?: Array<{
    category: string;
    items: Array<{ place: string; distance: string; note: string }>;
  }>;
  faqs: Array<{ q: string; a: string }>;
  relatedLinks: Array<{
    slug: LandingPageSlug;
    path: string;
    label: string;
    desc: string;
  }>;
  primaryKeywords?: string[];
  secondaryKeywords?: string[];
  reviewsHeading?: string;
  faqHeading?: string;
}

export interface InitialBookingParams {
  checkin: string;
  checkout: string;
  adults: number;
  roomsCount: number;
  bedType: "queen" | "twin";
  ratePlan: "with_breakfast" | "room_only";
  isWorkTrip: boolean;
  bringingPet: boolean;
  fromUrlQuery: boolean;
}

export interface AggregateRatingSummary {
  ratingValue: number;
  ratingValueEn: string;
  ratingValuePtBr: string;
  reviewCount: number;
}

export const OFFICIAL_SITE_ORIGIN = "https://corpflats.com.br";

export const GOOGLE_BUSINESS_PROFILE_UTM_URL =
  "https://corpflats.com.br/?utm_source=google&utm_medium=organic&utm_campaign=gbp_perfil";

export const CHANNEX_GOOGLE_HOTELS_CUSTOM_URL =
  "https://corpflats.com.br/?checkin=(CHECKIN_DATE)&checkout=(CHECKOUT_DATE)&adults=(ADULTS)&utm_source=google_hotels&utm_medium=free_booking_links&utm_campaign=official_site";

/**
 * Calcula dinamicamente a nota média e o volume de avaliações a partir de `siteConfig.testimonials`
 * (e `siteConfig.gbpReviewCount` quando definido), garantindo 100% de coerência entre o texto visível
 * e o `AggregateRating` do Schema.org JSON-LD (zero risco de Structured Data Spam).
 */
export function computeDynamicRatingSummary(siteConfig?: any): AggregateRatingSummary {
  const rawList = Array.isArray(siteConfig?.testimonials) ? siteConfig.testimonials : [];
  const validRatings = rawList
    .map((item: any) => Number(item?.rating ?? 5))
    .filter((n: number) => Number.isFinite(n) && n >= 1 && n <= 5);

  const computedAvg =
    validRatings.length > 0
      ? validRatings.reduce((acc: number, cur: number) => acc + cur, 0) / validRatings.length
      : 5.0;

  const rounded = Math.round(computedAvg * 10) / 10;
  const ratingValueEn = rounded.toFixed(1);
  const ratingValuePtBr = ratingValueEn.replace(".", ",");
  const configuredTotal = Number(siteConfig?.gbpReviewCount || 0);
  const reviewCount =
    Number.isFinite(configuredTotal) && configuredTotal > validRatings.length
      ? Math.round(configuredTotal)
      : validRatings.length > 0
        ? validRatings.length
        : 6;

  return {
    ratingValue: rounded,
    ratingValueEn,
    ratingValuePtBr,
    reviewCount,
  };
}

/**
 * Normaliza qualquer URL de foto de `/photos/soho/...` removendo a extensão e sufixos responsivos
 * para uso seguro em `<picture>` (`${base}-640w.avif`, `${base}-1024w.avif`, `${base}-1600w.avif`).
 */
export function normalizeSohoPhotoBase(photoUrlOrBase: string): string {
  const trimmed = String(photoUrlOrBase || "").trim();
  if (!trimmed) return "/photos/soho/hero-jacuzzi-cobertura";
  const withoutQuery = trimmed.split("?")[0].split("#")[0];
  const stripped = withoutQuery
    .replace(/-(160|320|640|800|1024|1400|1600)w\.(avif|webp|jpe?g|png)$/i, "")
    .replace(/\.(avif|webp|jpe?g|png)$/i, "");
  if (stripped.startsWith("http://") || stripped.startsWith("https://") || stripped.startsWith("/")) {
    return stripped;
  }
  return `/photos/soho/${stripped}`;
}

export function getHeroResponsiveSrcSet(
  heroImageBaseOrUrl: string,
  format: "avif" | "webp"
): string {
  const base = normalizeSohoPhotoBase(heroImageBaseOrUrl);
  if (!base.startsWith("/photos/soho/")) return "";
  return `${base}-640w.${format} 640w, ${base}-1024w.${format} 1024w, ${base}-1600w.${format} 1600w`;
}

const HYPERLOCAL_DISTANCE_GROUPS: Array<{
  category: string;
  items: Array<{ place: string; distance: string; note: string }>;
}> = [
  {
    category: "Saúde & Hospitais",
    items: [
      {
        place: "Hospital Geral Dr. Beda",
        distance: "80 m • 1 min a pé",
        note: "Na mesma calçada (Rua Conselheiro Otaviano, nº 129)",
      },
      {
        place: "Hospital dos Plantadores de Cana",
        distance: "550 m • 6 min a pé",
        note: "Acesso rápido caminhando ou 2 min de carro",
      },
      {
        place: "Hospital Ferreira Machado (HFM)",
        distance: "1,6 km • 5 min",
        note: "Deslocamento direto pelo Centro",
      },
    ],
  },
  {
    category: "Universidades, Ensino & Concursos",
    items: [
      {
        place: "UFF Campos (Polo Universitário)",
        distance: "800 m • 9 min a pé",
        note: "Próximo à Rua José do Patrocínio",
      },
      {
        place: "Faculdade de Medicina de Campos (FMC)",
        distance: "1,1 km • 4 min",
        note: "Av. Alberto Torres — ideal para congressos, provas e visitas",
      },
      {
        place: "IFF Campus Centro & UENF",
        distance: "2,2 km / 5,5 km",
        note: "6 min até o IFF Centro e 15 min até a UENF (Av. Alberto Lamego)",
      },
    ],
  },
  {
    category: "Jurídico, Gastronomia & Logística Regional",
    items: [
      {
        place: "Rodoviária Roberto Silveira",
        distance: "600 m • 8 min a pé",
        note: "Chegada e saída prática no coração do Centro",
      },
      {
        place: "Fórum Maria Tereza Gusmão & Bancos",
        distance: "1,2 km • 5 min",
        note: "Centro jurídico, cartórios e Praça São Salvador",
      },
      {
        place: "Pelinca & Boulevard Shopping",
        distance: "1,8 a 3,2 km • 5–8 min",
        note: "Principal polo gastronômico, bares, clínicas e compras",
      },
      {
        place: "Aeroporto Bartolomeu Lysandro (CAW)",
        distance: "9,5 km • 18 min",
        note: "Conexão rápida para voos comerciais e offshore",
      },
      {
        place: "Porto do Açu (São João da Barra)",
        distance: "48 km • ~50 min",
        note: "Saída fluida via RJ-240 / BR-356 com estrutura completa na volta",
      },
    ],
  },
];

export const SEO_LANDING_PAGES: Record<LandingPageSlug, SeoLandingPageSpec> = {
  home: {
    slug: "home",
    path: "/",
    canonicalUrl: "https://corpflats.com.br/",
    title: "Flats em Campos dos Goytacazes Centro | CorpFlats Soho",
    metaDescription:
      "Flats completos no Edifício Soho (Centro de Campos/RJ): garagem inclusa, jacuzzi aquecida, Wi-Fi individual e recepção 24h. Menor preço + 5% OFF no PIX!",
    breadcrumbLabel: "Início",
    badgeTop:
      "⭐ Site Oficial CorpFlats: Menor Preço Garantido • +5% OFF no PIX • 1 Vaga Coberta Inclusa • NFS-e Automática",
    h1: "Seu flat completo no Centro de Campos dos Goytacazes",
    highlightText:
      "Jacuzzi aquecida na cobertura, garagem coberta inclusa, Wi-Fi individual e check-in digital 24h",
    subtitle:
      "19 apartamentos padronizados no Edifício Soho Residence Service (Rua Conselheiro Otaviano, 209): estrutura executiva de domingo a quinta e refúgio completo de lazer para casais e famílias no fim de semana — sempre mais barato que Booking e Airbnb.",
    heroImageBase: "/photos/soho/hero-jacuzzi-cobertura",
    heroImageUrl: "/photos/soho/hero-jacuzzi-cobertura.jpg",
    heroImageAlt:
      "Cobertura com jacuzzi aquecida e deck de madeira da CorpFlats no Edifício Soho Residence no Centro de Campos dos Goytacazes RJ",
    ctaButtonText: "Ver disponibilidade",
    defaultNights: 2,
    defaultAdults: 2,
    defaultRatePlan: "with_breakfast",
    preferredGalleryUrls: [
      "/photos/soho/01-quarto-bancada.jpg",
      "/photos/soho/02-flat-integrado.jpg",
      "/photos/soho/cafe-mesa-quarto.jpg",
      "/photos/soho/06-cobertura-jacuzzi.jpg",
      "/photos/soho/08-spa-saunas.jpg",
      "/photos/soho/04-cozinha-equipada.jpg",
      "/photos/soho/09-academia.jpg",
      "/photos/soho/12-fachada-garagem.jpg",
    ],
    prioritizedTestimonialNames: [
      "Giselia Correa",
      "Carlos Aprigio",
      "Paula Ladeira Vidal",
      "Hugo Alves",
      "GG Cordeiro",
      "Jean Sant'Anna",
    ],
    sectionHeading: "Soluções Sob Medida para Sua Viagem a Campos dos Goytacazes",
    sectionSubtitle:
      "Reserva direta sem taxas de intermediação, confirmação imediata e avaliação 5,0 ★ de hóspedes reais no Google.",
    valuePillars: [
      {
        title: "Menor Preço no Site Oficial + 5% OFF no PIX",
        description:
          "Economize até 15% em relação às plataformas (Booking e Airbnb) e ganhe +5% de desconto imediato pagando no PIX Banco Inter.",
        badge: "Garantia Oficial",
      },
      {
        title: "1 Vaga de Garagem Coberta Inclusa",
        description:
          "Estacionamento coberto rotativo dentro do Edifício Soho sem custo extra, liberado na portaria 24h pelo cadastro prévio da placa.",
        badge: "Incluso",
      },
      {
        title: "Café da Manhã Entregue no Flat (05h às 09h30)",
        description:
          "Nos planos com café, receba sua bandeja fresquinha na mesa do apartamento no horário exato escolhido por você — perfeito para quem sai cedo ou acorda sem pressa.",
        badge: "05:00–09:30",
      },
      {
        title: "Cobertura com Jacuzzi Aquecida, Saunas e Academia",
        description:
          "Hidromassagem aquecida no deck panorâmico, saunas seca e a vapor, academia climatizada e sala de jogos das 06:00 às 22:00 (não possuímos piscina tradicional).",
        badge: "Rooftop Soho",
      },
      {
        title: "Pronto para Trabalho & NFS-e Automática",
        description:
          "Bancada dedicada para notebook, Wi-Fi individual por unidade e emissão automática de Nota Fiscal de Serviço Eletrônica (NFS-e Nacional) para CNPJ ou CPF.",
        badge: "B2B & Lazer",
      },
      {
        title: "Pet Friendly & Cancelamento Grátis até 24h",
        description:
          "Aceitamos até 2 cachorros de pequeno porte (até 10 kg, R$ 40/cão/estadia) e garantimos 100% de reembolso cancelando até 24h antes das 14:00 do check-in.",
        badge: "Flexível",
      },
    ],
    distanceGroups: HYPERLOCAL_DISTANCE_GROUPS,
    faqs: [
      {
        q: "Por que reservar direto em corpflats.com.br é mais barato que no Booking ou Airbnb?",
        a: "No site oficial você não paga as comissões de ~15% cobradas pelas plataformas intermediárias, acumula mais 5% de desconto no PIX com confirmação automática em segundos e recebe suporte direto 24h + NFS-e automática.",
      },
      {
        q: "Como funcionam o check-in, o check-out e o acesso ao flat?",
        a: "O check-in inicia às 14:00 e o check-out vai até as 12:00. Antes da chegada, você conclui o check-in digital pelo celular e retira o cartão NFC diretamente na recepção 24 horas (não há senha na porta).",
      },
      {
        q: "O edifício possui piscina ou quais áreas de lazer estão disponíveis?",
        a: "Não temos piscina. A cobertura do Soho Residence conta com jacuzzi aquecida, terraço com vista panorâmica, saunas seca e a vapor, academia climatizada e sala de jogos — todos liberados para os hóspedes das 06:00 às 22:00.",
      },
      {
        q: "Quantas pessoas cabem no flat e como pedir 2 camas de solteiro?",
        a: "O padrão das unidades acomoda até 2 hóspedes. Você pode selecionar 2 camas de solteiro no momento da reserva (com taxa adicional de configuração de R$ 30 por estadia); para entradas no mesmo dia, o pedido precisa ser feito até as 12:00.",
      },
      {
        q: "Como funciona o café da manhã?",
        a: "Nos planos com café incluso, a bandeja é entregue diretamente no seu apartamento no horário agendado por você entre 05:00 e 09:30, com escolha prévia pelo Portal do Hóspede até a véspera.",
      },
      {
        q: "A vaga de garagem está inclusa?",
        a: "Sim. Cada reserva inclui gratuitamente 1 vaga de garagem coberta rotativa no edifício. Basta informar modelo, cor e placa do veículo no check-in digital para liberação na portaria.",
      },
      {
        q: "Vocês aceitam animais de estimação (pets)?",
        a: "Sim. Aceitamos exclusivamente cachorros de porte pequeno (até 10kg), no limite máximo de 2 cães por flat, mediante taxa de R$ 40,00 por cachorro por estadia.",
      },
      {
        q: "Qual é a política de cancelamento e reembolso?",
        a: "Cancelamento gratuito com 100% de reembolso até 24 horas antes das 14:00 do dia do check-in. Faltando menos de 24 horas para o check-in, é cobrado 100% do valor da reserva.",
      },
    ],
    relatedLinks: [
      {
        slug: "hospedagem-corporativa-campos",
        path: "/hospedagem-corporativa-campos",
        label: "Hospedagem Corporativa & Porto do Açu",
        desc: "Dom a Qui: NFS-e automática p/ CNPJ, café às 05:00, Wi-Fi individual e reserva multi-flats.",
      },
      {
        slug: "fim-de-semana-campos",
        path: "/fim-de-semana-campos",
        label: "Fim de Semana, Casais & Pet Friendly",
        desc: "Sex a Dom: jacuzzi aquecida na cobertura, saunas, café servido no flat e cães até 10 kg.",
      },
      {
        slug: "flat-centro-campos-rj",
        path: "/flat-centro-campos-rj",
        label: "Localização no Centro (Edifício Soho)",
        desc: "Rua Conselheiro Otaviano, 209: a 80m do Hosp. Dr. Beda e perto de Pelinca, FMC, UFF e Fórum.",
      },
      {
        slug: "estadia-longa-campos",
        path: "/estadia-longa-campos",
        label: "Estadia Longa: 7, 15 ou 30 Dias",
        desc: "Flat mobiliado com cozinha equipada, contas 100% inclusas e zero burocracia de fiador.",
      },
    ],
    primaryKeywords: [
      "flat em campos dos goytacazes",
      "hotel em campos dos goytacazes centro",
      "corpflats",
      "soho residence campos",
      "apart hotel campos dos goytacazes",
    ],
    secondaryKeywords: [
      "hospedagem em campos rj com garagem",
      "flat mobiliado campos dos goytacazes diaria",
      "onde ficar em campos dos goytacazes",
      "flat com jacuzzi campos rj",
    ],
    reviewsHeading: "Avaliações 5 Estrelas de Hóspedes Reais no Google (5,0 ★)",
    faqHeading: "Dúvidas Frequentes sobre Reserva Direta e Estadia",
  },

  "hospedagem-corporativa-campos": {
    slug: "hospedagem-corporativa-campos",
    path: "/hospedagem-corporativa-campos",
    canonicalUrl: "https://corpflats.com.br/hospedagem-corporativa-campos",
    title: "Hospedagem Corporativa em Campos RJ | NFS-e • CorpFlats",
    metaDescription:
      "Flats executivos no Centro de Campos/RJ (base Porto do Açu): NFS-e automática p/ CNPJ, café às 05h, Wi-Fi individual e garagem. Menor preço + 5% OFF PIX!",
    breadcrumbLabel: "Hospedagem Corporativa & Porto do Açu",
    badgeTop:
      "💼 Especialista Corporativo Dom–Qui • NFS-e Automática p/ CNPJ • Café às 05:00 • +5% OFF no PIX",
    h1: "Hospedagem Corporativa em Campos dos Goytacazes com NFS-e Automática",
    highlightText:
      "Base executiva no Centro de Campos para empresas, representantes, médicos e operações no Porto do Açu",
    subtitle:
      "Reserve online em 1 minuto sem depender de cotação por e-mail: tarifa direta corporativa já liberada no site, café entregue no flat a partir das 05:00, Wi-Fi exclusivo por unidade, bancada ergonômica e 1 vaga de garagem coberta inclusa.",
    heroImageBase: "/photos/soho/01-quarto-bancada",
    heroImageUrl: "/photos/soho/01-quarto-bancada.jpg",
    heroImageAlt:
      "Flat executivo climatizado com bancada de trabalho dedicada e Wi-Fi individual na CorpFlats Centro de Campos RJ",
    ctaButtonText: "Cotar tarifa corporativa agora",
    defaultNights: 2,
    defaultAdults: 1,
    defaultRatePlan: "with_breakfast",
    forceWeekdayCorporateDates: true,
    defaultIsWorkTrip: true,
    preferredGalleryUrls: [
      "/photos/soho/01-quarto-bancada.jpg",
      "/photos/soho/cafe-mesa-quarto.jpg",
      "/photos/soho/12-fachada-garagem.jpg",
      "/photos/soho/09-academia.jpg",
      "/photos/soho/02-flat-integrado.jpg",
      "/photos/soho/11-lobby-elevadores.jpg",
    ],
    prioritizedTestimonialNames: [
      "Hugo Alves",
      "Carlos Aprigio",
      "GG Cordeiro",
      "Paula Ladeira Vidal",
      "Giselia Correa",
      "Jean Sant'Anna",
    ],
    sectionHeading:
      "Por que Empresas do Porto do Açu, Macaé e Região Escolhem a CorpFlats de Domingo a Quinta?",
    sectionSubtitle:
      "Autosserviço corporativo imediato: de 1 a 19 flats no mesmo pedido, sem burocracia e com prestação de contas fiscal automática (avaliação 5,0 ★ no Google).",
    valuePillars: [
      {
        title: "NFS-e Nacional Emitida Automaticamente p/ CNPJ",
        description:
          "Informe os dados da empresa no checkout online: assim que o pagamento PIX (5% OFF) ou Cartão é confirmado, a Nota Fiscal de Serviço Eletrônica oficial é emitida e enviada para o e-mail do financeiro/RH.",
        badge: "Fiscal Automático",
      },
      {
        title: "Café no Flat a partir das 05:00 da Manhã",
        description:
          "Vai pegar estrada cedo para o Porto do Açu (São João da Barra), distrito industrial ou plantão médico? Entregamos a bandeja completa no seu flat às 05:00 em ponto.",
        badge: "Saída Cedo",
      },
      {
        title: "Wi-Fi Individual por Apartamento + Bancada",
        description:
          "Roteador exclusivo dentro de cada flat para videoconferências estáveis, mesa dedicada para notebook, ar-condicionado silencioso, cortina blecaute e ferro de passar.",
        badge: "Home Office",
      },
      {
        title: "1 Vaga Coberta Inclusa para Frota ou Locadora",
        description:
          "Guarde veículos de frota, caminhonetes ou carros alugados com segurança 24h na garagem coberta do Edifício Soho sem pagar diária extra de estacionamento.",
        badge: "Garagem Grátis",
      },
      {
        title: "Multi-Flats Self-Service (Casal ou 2 Solteiro)",
        description:
          "Reserve múltiplos flats para sua equipe numa única transação e escolha montagem de 2 camas de solteiro nas unidades compatíveis (solicitações no mesmo dia até as 12:00).",
        badge: "Equipes & RH",
      },
      {
        title: "Recepção 24h & Check-in Express NFC",
        description:
          "Voo atrasou ou viagem terminou tarde? Com o pré-check-in digital preenchido no celular, o colaborador retira o cartão magnético na portaria 24h em menos de 1 minuto.",
        badge: "Acesso 24h",
      },
    ],
    distanceGroups: [
      {
        category: "Rotas Corporativas, Offshore & Logística",
        items: [
          {
            place: "Complexo do Porto do Açu (São João da Barra)",
            distance: "48 km • ~50 min",
            note: "Acesso direto via RJ-240 / BR-356 pernoitando com estrutura completa no Centro de Campos",
          },
          {
            place: "Aeroporto Bartolomeu Lysandro (CAW)",
            distance: "9,5 km • 18 min",
            note: "Conexão rápida para executivos, aviação comercial e offshore",
          },
          {
            place: "Fórum, Bancos & Centro Empresarial",
            distance: "1,2 km • 5 min",
            note: "Deslocamento ágil para audiências, escritórios e visitas comerciais",
          },
          {
            place: "Hospitais Dr. Beda (80 m) & Plantadores (550 m)",
            distance: "1 a 6 min a pé",
            note: "Na mesma rua do Hospital Dr. Beda — estratégico para médicos e indústria médica",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Como funciona a emissão de Nota Fiscal (NFS-e) para CNPJ?",
        a: "No checkout online, basta marcar 'Viagem a Trabalho' e informar o CNPJ e Razão Social. Nosso sistema emite automaticamente a NFS-e Nacional oficial após a confirmação do pagamento (PIX com 5% OFF ou Cartão de Crédito) e envia para o e-mail cadastrado.",
      },
      {
        q: "Preciso sair antes das 06:00 para o Porto do Açu ou visita técnica. Consigo tomar café?",
        a: "Sim! Na tarifa Com Café da Manhã, entregamos a bandeja completa diretamente no seu flat a partir das 05:00 da manhã — você agenda o horário exato e escolhe os itens pelo celular na véspera.",
      },
      {
        q: "Qual a distância da CorpFlats até o Porto do Açu (São João da Barra)?",
        a: "Estamos a aproximadamente 48 km (~50 minutos de carro via RJ-240 / BR-356), unindo saída rápida para o complexo portuário com a comodidade de dormir no Centro de Campos cercado por restaurantes, farmácias, hospitais e academia.",
      },
      {
        q: "Posso reservar múltiplos flats de uma vez para minha equipe ou pedir 2 camas de solteiro?",
        a: "Sim. No card de reserva você pode adicionar quantos flats precisar na mesma compra e selecionar 2 camas de solteiro nas unidades compatíveis (taxa única de R$ 30 por estadia; para check-in no mesmo dia, solicitar até as 12:00).",
      },
      {
        q: "Preciso enviar e-mail pedindo proposta de acordo corporativo?",
        a: "Não há burocracia! Nossa menor tarifa corporativa já está liberada direto no site para qualquer CNPJ ou profissional (até 15% abaixo das OTAs + 5% OFF no PIX imediato), sem exigir volume mínimo de diárias.",
      },
      {
        q: "Como funciona se o colaborador chegar de madrugada?",
        a: "A recepção do Edifício Soho Residence funciona 24 horas por dia. Com o pré-check-in digital concluído no link enviado no WhatsApp, basta apresentar documento com foto e retirar o cartão NFC na portaria.",
      },
    ],
    relatedLinks: [
      {
        slug: "estadia-longa-campos",
        path: "/estadia-longa-campos",
        label: "Projetos de 7, 15 ou 30 Dias (Long Stay)",
        desc: "Vai alocar equipe ou consultoria por várias semanas? Veja os benefícios de estadia longa sem caução.",
      },
      {
        slug: "flat-centro-campos-rj",
        path: "/flat-centro-campos-rj",
        label: "Mapa Completo de Distâncias no Centro",
        desc: "Confira tempos reais até hospitais, Fórum, Pelinca, universidades e rodovias.",
      },
      {
        slug: "home",
        path: "/",
        label: "Visão Geral das 19 Unidades CorpFlats",
        desc: "Conheça todos os detalhes da cobertura, galeria completa e tarifas oficiais.",
      },
    ],
    primaryKeywords: [
      "hospedagem corporativa campos dos goytacazes",
      "hotel executivo campos dos goytacazes",
      "hotel perto do porto do acu",
      "hospedagem porto do acu campos rj",
    ],
    secondaryKeywords: [
      "hotel com nota fiscal nfse campos rj",
      "hospedagem para empresas campos dos goytacazes",
      "flat executivo com bancada e wifi campos rj",
      "hotel com cafe da manha as 5h campos",
    ],
    reviewsHeading: "O que Dizem Quem Viaja a Trabalho para Campos (5,0 ★ no Google)",
    faqHeading: "Perguntas Frequentes — Empresas, RH e Viajantes Corporativos",
  },

  "fim-de-semana-campos": {
    slug: "fim-de-semana-campos",
    path: "/fim-de-semana-campos",
    canonicalUrl: "https://corpflats.com.br/fim-de-semana-campos",
    title: "Fim de Semana em Campos RJ: Jacuzzi & Café | CorpFlats",
    metaDescription:
      "Seu refúgio de sexta a domingo em Campos/RJ: cobertura com jacuzzi aquecida, saunas, café servido no flat, garagem e Pet Friendly. Reserve c/ 5% OFF PIX!",
    breadcrumbLabel: "Fim de Semana, Casais & Lazer",
    badgeTop:
      "🥂 Escapada de Sexta a Domingo • Jacuzzi Aquecida & Saunas • Café no Flat • Pet Friendly",
    h1: "Seu Fim de Semana em Campos: Jacuzzi na Cobertura, Saunas e Café no Flat",
    highlightText:
      "De sexta a domingo com privacidade total para casais, visitas à família, eventos e viagens com seu pet",
    subtitle:
      "Desconecte-se na cobertura panorâmica do Edifício Soho Residence: hidromassagem aquecida, saunas seca e a vapor, café da manhã servido na mesa do seu apartamento, 1 vaga coberta inclusa e Menor Preço Garantido + 5% OFF no PIX.",
    heroImageBase: "/photos/soho/06-cobertura-jacuzzi",
    heroImageUrl: "/photos/soho/06-cobertura-jacuzzi.jpg",
    heroImageAlt:
      "Jacuzzi aquecida com deck de madeira na cobertura do Edifício Soho Residence para fim de semana em Campos dos Goytacazes",
    ctaButtonText: "Simular sexta a domingo",
    defaultNights: 2,
    defaultAdults: 2,
    defaultRatePlan: "with_breakfast",
    forceWeekendDates: true,
    preferredGalleryUrls: [
      "/photos/soho/06-cobertura-jacuzzi.jpg",
      "/photos/soho/cafe-mesa-quarto.jpg",
      "/photos/soho/08-spa-saunas.jpg",
      "/photos/soho/07-terraco-panoramico.jpg",
      "/photos/soho/03-mesa-jantar.jpg",
      "/photos/soho/02-flat-integrado.jpg",
      "/photos/soho/10-sala-de-jogos.jpg",
    ],
    prioritizedTestimonialNames: [
      "Giselia Correa",
      "Jean Sant'Anna",
      "Paula Ladeira Vidal",
      "Carlos Aprigio",
      "GG Cordeiro",
      "Hugo Alves",
    ],
    sectionHeading:
      "Experiência de Spa Urbano, Café na Porta e Liberdade de Sexta a Domingo",
    sectionSubtitle:
      "Ideal para casais da região, convidados de casamentos e formaturas ou quem vem matar a saudade da família em Campos mantendo o próprio espaço (5,0 ★ no Google).",
    valuePillars: [
      {
        title: "Cobertura com Jacuzzi Aquecida & Vista Panorâmica",
        description:
          "Aproveite a hidromassagem aquecida no deck de madeira e o terraço aberto no topo do Soho das 06:00 às 22:00, sem custo adicional (experiência de spa urbano aquecido; não há piscina tradicional).",
        badge: "06h às 22h",
      },
      {
        title: "Saunas Seca e a Vapor + Sala de Jogos & Academia",
        description:
          "Relaxe nas saunas integradas ao deck, mantenha o treino em dia com vista alta ou divirta-se na sala de jogos climatizada com sinuca e totó.",
        badge: "Lazer Incluso",
      },
      {
        title: "Café da Manhã Servido na Mesa do Seu Flat",
        description:
          "Sem enfrentar salão cheio cedo: escolha seus itens favoritos pelo celular na véspera e receba a bandeja fresquinha na porta do apartamento até as 09:30.",
        badge: "Privacidade Total",
      },
      {
        title: "Cozinha Equipada com Taças de Vinho e Saca-Rolhas",
        description:
          "Prepare um brinde ou jantar especial a dois com taças, saca-rolhas, louças, cooktop 2 bocas, frigobar abastecido, cafeteira e sanduicheira (não dispomos de micro-ondas).",
        badge: "Noite a Dois",
      },
      {
        title: "Liberdade em Casamentos, Formaturas & Visitas à Família",
        description:
          "A 5 minutos dos salões e restaurantes da Pelinca, com recepção 24h para chegar de festas em qualquer horário e 1 vaga de garagem coberta inclusa.",
        badge: "Eventos & Família",
      },
      {
        title: "Pet Friendly para Cães de Pequeno Porte",
        description:
          "Seu melhor amigo viaja junto! Aceitamos até 2 cachorros de até 10 kg por flat mediante taxa única de higienização de R$ 40 por cão na estadia.",
        badge: "Até 2 Cães ≤10kg",
      },
    ],
    distanceGroups: [
      {
        category: "Gastronomia, Passeios & Eventos a Poucos Minutos",
        items: [
          {
            place: "Polo Gastronômico da Pelinca (Bares & Restaurantes)",
            distance: "1,8 km • 5 min",
            note: "Principais bistrôs, pizzarias, cafeterias e vida noturna de Campos",
          },
          {
            place: "Boulevard Shopping Campos",
            distance: "3,2 km • 8 min",
            note: "Cinema, lojas e praça de alimentação",
          },
          {
            place: "Praça Alzira Vargas / Cidade da Criança",
            distance: "350 m • 4 min a pé",
            note: "Caminhada agradável a poucos passos do edifício",
          },
          {
            place: "Teatro Municipal Trianon & Centro Histórico",
            distance: "1,3 km • 5 min",
            note: "Espetáculos, formaturas e eventos culturais",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "A jacuzzi aquecida e as saunas da cobertura têm custo extra ou precisam de agendamento?",
        a: "O uso da cobertura (jacuzzi aquecida, saunas seca e a vapor, terraço panorâmico, academia e sala de jogos) é 100% gratuito para todos os hóspedes, funcionando diariamente das 06:00 às 22:00. Importante: não temos piscina fria tradicional, e sim hidromassagem aquecida no deck.",
      },
      {
        q: "Como funciona o café da manhã para casais no fim de semana?",
        a: "Na tarifa Com Café Incluso, você personaliza os itens pelo link do Portal do Hóspede até a véspera e recebe a bandeja fresquinha na mesa do seu flat com total privacidade no horário agendado (até as 09:30).",
      },
      {
        q: "Posso levar meu cachorro no fim de semana?",
        a: "Sim! Recebemos exclusivamente cachorros de pequeno porte (até 10 kg), até o limite de 2 cães por flat, com taxa única de higienização de R$ 40 por cachorro por estadia e transporte no colo/bolsa pelo elevador de serviço nas áreas comuns.",
      },
      {
        q: "O flat tem taças de vinho e itens para preparar um lanche ou jantar a dois?",
        a: "Sim! Todas as unidades possuem taças, saca-rolhas, pratos, talheres, copos, cooktop 2 bocas, frigobar, sanduicheira e cafeteira elétrica (não dispomos de micro-ondas).",
      },
      {
        q: "Qual a estadia mínima de sexta a domingo e o horário de saída?",
        a: "Para entradas na sexta-feira ou no sábado a estadia padrão no fim de semana é a partir de 2 diárias (sexta a domingo), com check-in a partir das 14:00 na recepção 24h e check-out tranquilo até as 12:00 de domingo.",
      },
      {
        q: "Posso cancelar gratuitamente se meus planos mudarem?",
        a: "Sim! Cancelando até 24 horas antes das 14:00 do dia do check-in, você recebe reembolso integral de 100%.",
      },
    ],
    relatedLinks: [
      {
        slug: "flat-centro-campos-rj",
        path: "/flat-centro-campos-rj",
        label: "Veja Onde Estamos no Centro (Soho Residence)",
        desc: "Distâncias exatas até a Pelinca, shoppings, universidades e hospitais.",
      },
      {
        slug: "estadia-longa-campos",
        path: "/estadia-longa-campos",
        label: "Vai Ficar 7 Dias ou Mais Visitando a Família?",
        desc: "Simule uma estadia semanal ou quinzenal com cozinha equipada e contas inclusas.",
      },
      {
        slug: "home",
        path: "/",
        label: "Página Principal & Todas as Comodidades",
        desc: "Explore a galeria completa das 19 unidades padronizadas da CorpFlats.",
      },
    ],
    primaryKeywords: [
      "hotel para casal em campos dos goytacazes",
      "onde passar fim de semana em campos rj",
      "flat com jacuzzi em campos dos goytacazes",
      "hotel pet friendly campos dos goytacazes",
    ],
    secondaryKeywords: [
      "hospedagem romantica campos dos goytacazes",
      "hotel com hidro e sauna campos rj",
      "onde ficar em campos para casamento formatura",
      "flat aceita cachorro campos dos goytacazes",
    ],
    reviewsHeading: "Avaliações 5★ de Casais e Famílias no Google (5,0 ★)",
    faqHeading: "Dúvidas Frequentes para o Fim de Semana e Pet Friendly",
  },

  "flat-centro-campos-rj": {
    slug: "flat-centro-campos-rj",
    path: "/flat-centro-campos-rj",
    canonicalUrl: "https://corpflats.com.br/flat-centro-campos-rj",
    title: "Flat no Centro de Campos RJ (Edifício Soho) | CorpFlats",
    metaDescription:
      "Hospede-se na R. Conselheiro Otaviano, 209 (Soho Residence): ao lado do Hosp. Dr. Beda, perto do Fórum, FMC e Pelinca. Vaga coberta inclusa + 5% OFF PIX!",
    breadcrumbLabel: "Flat no Centro — Edifício Soho",
    badgeTop:
      "📍 Rua Conselheiro Otaviano, 209 • Ao Lado do Hosp. Dr. Beda • Vaga Coberta Inclusa • +5% OFF PIX",
    h1: "Flat Completo no Centro de Campos dos Goytacazes — Edifício Soho Residence",
    highlightText:
      "A 80 metros do Hospital Dr. Beda e a poucos minutos da Pelinca, FMC, UFF, Fórum e Rodoviária",
    subtitle:
      "Fique no endereço mais estratégico de Campos dos Goytacazes (CEP 28010-140) com 1 vaga de garagem coberta gratuita, portaria 24h, silêncio de andar alto e reserva direta oficial até 15% mais barata que nas plataformas.",
    heroImageBase: "/photos/soho/02-flat-integrado",
    heroImageUrl: "/photos/soho/02-flat-integrado.jpg",
    heroImageAlt:
      "Flat integrado completo no Edifício Soho Residence na Rua Conselheiro Otaviano 209 Centro de Campos dos Goytacazes RJ",
    ctaButtonText: "Consultar datas no Soho Residence",
    defaultNights: 2,
    defaultAdults: 2,
    defaultRatePlan: "with_breakfast",
    preferredGalleryUrls: [
      "/photos/soho/02-flat-integrado.jpg",
      "/photos/soho/12-fachada-garagem.jpg",
      "/photos/soho/11-lobby-elevadores.jpg",
      "/photos/soho/01-quarto-bancada.jpg",
      "/photos/soho/06-cobertura-jacuzzi.jpg",
      "/photos/soho/05-banheiro.jpg",
    ],
    prioritizedTestimonialNames: [
      "Paula Ladeira Vidal",
      "Carlos Aprigio",
      "Giselia Correa",
      "Jean Sant'Anna",
      "Hugo Alves",
      "GG Cordeiro",
    ],
    sectionHeading:
      "Mapa de Distâncias Reais a Partir da Rua Conselheiro Otaviano, 209 — Centro",
    sectionSubtitle:
      "Mobilidade imediata a pé ou de carro para hospitais, universidades, Fórum e gastronomia, sem abrir mão de garagem coberta e silêncio absoluto (5,0 ★ no Google).",
    valuePillars: [
      {
        title: "A 80 Metros do Hospital Dr. Beda (Mesma Rua)",
        description:
          "Localizado no nº 209 da Rua Conselheiro Otaviano — a menos de 1 minuto a pé do Hospital Geral Dr. Beda (nº 129) e a 6 minutos do Hospital Plantadores de Cana.",
        badge: "Saúde & Médicos",
      },
      {
        title: "Vaga de Garagem Coberta Inclusa no Centro",
        description:
          "Esqueça estacionamentos rotativos pagos na rua: sua reserva já inclui 1 vaga coberta privativa dentro do condomínio Soho com controle de acesso 24h.",
        badge: "Estacionamento Grátis",
      },
      {
        title: "Pertinho da FMC, UFF, IFF, UENF & Fórum",
        description:
          "A 800 m da UFF Campos, 1,1 km da Faculdade de Medicina de Campos (FMC) e 1,2 km do Fórum — ponto favorito para congressos, bancas, residências e concursos.",
        badge: "Ensino & Jurídico",
      },
      {
        title: "Silêncio Elogiado em Andar Alto + Blecaute",
        description:
          "Unidades climatizadas com excelente isolamento, cortinas blecaute, cama confortável e enxoval hoteleiro higienizado para descanso profundo no coração da cidade.",
        badge: "Descanso Real",
      },
      {
        title: "Padrão Oficial CorpFlats nas 19 Unidades",
        description:
          "Diferente de locações avulsas sem suporte, operamos 19 flats padronizados com manutenção própria, café entregue no quarto (05h–09h30), Concierge 24h e NFS-e automática.",
        badge: "Gestão Própria",
      },
      {
        title: "Recepção Física 24h & Segurança Condominial",
        description:
          "Hall social monitorado 24 horas, dois elevadores e acesso exclusivo por cartão magnético NFC após pré-check-in digital rápido pelo celular.",
        badge: "Portaria 24h",
      },
    ],
    distanceGroups: HYPERLOCAL_DISTANCE_GROUPS,
    faqs: [
      {
        q: "Qual é o endereço exato e como funciona a entrada no Edifício Soho Residence Service?",
        a: "Ficamos na Rua Conselheiro Otaviano, 209 — Centro, Campos dos Goytacazes/RJ (CEP 28010-140). A recepção funciona 24h por dia; após preencher o pré-check-in online no celular, você retira seu cartão magnético NFC na portaria.",
      },
      {
        q: "Fica realmente na mesma rua do Hospital Dr. Beda?",
        a: "Sim! O Hospital Geral Dr. Beda fica no nº 129 da própria Rua Conselheiro Otaviano, a cerca de 80 metros (1 minuto caminhando na mesma calçada) — excelente para médicos, equipes cirúrgicas e familiares acompanhantes.",
      },
      {
        q: "É seguro estacionar? A vaga de garagem já está inclusa na diária?",
        a: "Sim. Toda reserva na CorpFlats inclui gratuitamente 1 vaga de garagem coberta rotativa dentro do próprio Edifício Soho Residence, liberada mediante cadastro da placa no pré-check-in.",
      },
      {
        q: "Por ficar no Centro de Campos, os flats são silenciosos para dormir?",
        a: "Sim! Os apartamentos contam com construção sólida, ar-condicionado moderno e cortinas blecaute — o silêncio e a tranquilidade estão entre os pontos mais elogiados nas avaliações 5 estrelas do Google.",
      },
      {
        q: "Qual a diferença de reservar aqui no site da CorpFlats em relação a outros anúncios no mesmo prédio?",
        a: "A CorpFlats administra diretamente 19 unidades padronizadas com enxoval profissional, equipe própria de governança e manutenção, café da manhã entregue no flat (05:00 às 09:30), emissão automática de NFS-e e Menor Preço Garantido + 5% OFF no PIX.",
      },
    ],
    relatedLinks: [
      {
        slug: "hospedagem-corporativa-campos",
        path: "/hospedagem-corporativa-campos",
        label: "Viajando a Trabalho ou Rumo ao Porto do Açu?",
        desc: "Veja os diferenciais corporativos de domingo a quinta com NFS-e automática e café às 05:00.",
      },
      {
        slug: "fim-de-semana-campos",
        path: "/fim-de-semana-campos",
        label: "Lazer de Sexta a Domingo no Soho Residence",
        desc: "Jacuzzi aquecida na cobertura, saunas, café no flat e hospedagem Pet Friendly.",
      },
      {
        slug: "estadia-longa-campos",
        path: "/estadia-longa-campos",
        label: "Vai Ficar 7, 15 ou 30 Dias em Tratamento ou Curso?",
        desc: "Cozinha equipada, contas 100% inclusas e reserva direta sem fiador.",
      },
    ],
    primaryKeywords: [
      "flat centro campos dos goytacazes",
      "edificio soho campos dos goytacazes",
      "hotel no centro de campos rj",
      "hospedagem perto do hospital dr beda campos",
    ],
    secondaryKeywords: [
      "hotel rua conselheiro otaviano campos",
      "onde ficar perto da fmc faculdade de medicina de campos",
      "hotel perto da rodoviaria roberto silveira campos",
      "hotel perto do forum campos dos goytacazes",
    ],
    reviewsHeading: "Avaliações Reais sobre Nossa Localização e Silêncio (5,0 ★ no Google)",
    faqHeading: "Perguntas Frequentes sobre Acesso, Garagem e Região Central",
  },

  "estadia-longa-campos": {
    slug: "estadia-longa-campos",
    path: "/estadia-longa-campos",
    canonicalUrl: "https://corpflats.com.br/estadia-longa-campos",
    title: "Estadia Longa e Flat Mensal em Campos RJ | CorpFlats",
    metaDescription:
      "Vai ficar 7, 15 ou 30 dias em Campos/RJ? Flat mobiliado c/ cozinha, Wi-Fi individual, academia, garagem inclusa e NFS-e sem fiador. Menor preço + 5% PIX!",
    breadcrumbLabel: "Estadia Longa (7, 15 e 30 Dias)",
    badgeTop:
      "🏡 Semanal, Quinzenal & 30 Dias • Cozinha Equipada • Contas Inclusas • Sem Fiador + 5% OFF PIX",
    h1: "Estadia Longa em Campos dos Goytacazes: 7, 15 ou 30 Dias Sem Burocracia",
    highlightText:
      "Mude-se hoje apenas com a mala: cozinha equipada, energia, Wi-Fi individual, academia e vaga coberta 100% inclusos",
    subtitle:
      "A solução inteligente entre o quarto de hotel apertado e a burocracia do aluguel tradicional: ideal para projetos no Porto do Açu, plantões médicos, pós-graduação, reformas residenciais ou mudanças em Campos/RJ.",
    heroImageBase: "/photos/soho/04-cozinha-equipada",
    heroImageUrl: "/photos/soho/04-cozinha-equipada.jpg",
    heroImageAlt:
      "Cozinha compacta equipada com cooktop 2 bocas, frigobar, cafeteira e sanduicheira nos flats para estadia longa da CorpFlats em Campos RJ",
    ctaButtonText: "Simular estadia de 7 a 30 noites",
    defaultNights: 7,
    defaultAdults: 1,
    defaultRatePlan: "with_breakfast",
    showLongStayQuickPills: true,
    preferredGalleryUrls: [
      "/photos/soho/04-cozinha-equipada.jpg",
      "/photos/soho/03-mesa-jantar.jpg",
      "/photos/soho/01-quarto-bancada.jpg",
      "/photos/soho/02-flat-integrado.jpg",
      "/photos/soho/09-academia.jpg",
      "/photos/soho/06-cobertura-jacuzzi.jpg",
    ],
    prioritizedTestimonialNames: [
      "Giselia Correa",
      "Hugo Alves",
      "Carlos Aprigio",
      "Paula Ladeira Vidal",
      "GG Cordeiro",
      "Jean Sant'Anna",
    ],
    sectionHeading:
      "Flat CorpFlats vs. Aluguel Tradicional vs. Quarto de Hotel Comum",
    sectionSubtitle:
      "Previsibilidade financeira total desde o primeiro dia, com estrutura completa de moradia e lazer no Centro de Campos (5,0 ★ no Google).",
    valuePillars: [
      {
        title: "Zero Fiador, Caução ou Contrato de 12 Meses",
        description:
          "Esqueça cartório, seguro-fiança e espera de aprovação cadastral: selecione de 7 a 30 noites online, pague com 5% OFF no PIX ou Cartão e entre hoje mesmo.",
        badge: "Sem Burocracia",
      },
      {
        title: "100% das Contas Inclusas (Luz, Água, Condomínio & Wi-Fi)",
        description:
          "Nenhuma conta surpresa no fim do mês: energia elétrica, ar-condicionado, água, condomínio, IPTU, internet dedicada da unidade e 1 vaga coberta já estão na diária.",
        badge: "Tudo Incluso",
      },
      {
        title: "Cozinha Pronta para Sua Rotina Semanal",
        description:
          "Equipada com cooktop 2 bocas, frigobar, cafeteira elétrica, sanduicheira, pratos, talheres, copos, taças e mesa de refeições (não dispomos de micro-ondas nem lavadora no flat).",
        badge: "Autonomia",
      },
      {
        title: "Escolha Com Café no Flat ou Apenas Hospedagem",
        description:
          "Quer praticidade máxima com café entregue às 05:00 ou prefere preparar o próprio café e economizar na tarifa Sem Café (onde a taxa única de limpeza dilui na estadia)? Você decide.",
        badge: "2 Planos",
      },
      {
        title: "Academia, Saunas & Jacuzzi para Manter a Saúde",
        description:
          "Quem passa semanas fora de casa precisa de qualidade de vida: treine na academia climatizada da cobertura e relaxe na jacuzzi e nas saunas das 06:00 às 22:00.",
        badge: "Bem-Estar Diário",
      },
      {
        title: "NFS-e Automática & Renovação Flexível",
        description:
          "Perfeito para consultorias, obras e projetos corporativos que exigem Nota Fiscal Eletrônica oficial para reembolso e flexibilidade para estender períodos.",
        badge: "PF & CNPJ",
      },
    ],
    distanceGroups: [
      {
        category: "Conveniências para Moradia Temporária no Entorno",
        items: [
          {
            place: "Supermercados, Padarias & Farmácias 24h",
            distance: "150 a 450 m • 2–5 min a pé",
            note: "Abasteça a cozinha do flat caminhando no Centro de Campos",
          },
          {
            place: "Lavanderias Expressas & Serviços no Centro",
            distance: "300 a 900 m",
            note: "Fácil apoio semanal para estadias quinzenais e mensais",
          },
          {
            place: "Hospitais (Dr. Beda 80 m) & Universidades (UFF / FMC / UENF)",
            distance: "1 min a 15 min",
            note: "Ideal para médicos residentes, pós-graduandos e acompanhantes",
          },
          {
            place: "Saída para o Porto do Açu & Polos Industriais",
            distance: "48 km • ~50 min",
            note: "Base fixa confortável para engenheiros e gestores em projetos prolongados",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Preciso de fiador, caução ou contrato de locação de 12 meses para ficar 15 ou 30 dias?",
        a: "Não! A reserva é 100% online e sem burocracia imobiliária. Basta selecionar de 7 a 30 noites no calendário, concluir via PIX (com 5% OFF) ou Cartão de Crédito e realizar o pré-check-in digital.",
      },
      {
        q: "Energia elétrica, condomínio, água, Wi-Fi e garagem estão inclusos no valor?",
        a: "Sim, 100% inclusos! Não há cobrança separada de luz, água, condomínio ou internet: você já tem Wi-Fi individual no flat, 1 vaga de garagem coberta e acesso livre à academia, saunas e jacuzzi.",
      },
      {
        q: "O que vem na cozinha para preparar minhas refeições durante a semana?",
        a: "Cada flat conta com fogão cooktop de 2 bocas, frigobar, cafeteira elétrica, sanduicheira, pratos, talheres, copos, taças, saca-rolhas e mesa com 2 lugares. Importante: não dispomos de micro-ondas nem máquina de lavar roupas dentro do apartamento.",
      },
      {
        q: "Como funciona a limpeza e troca de enxoval em estadias longas?",
        a: "Você recebe o apartamento impecável com enxoval completo de cama e banho higienizado, e pode solicitar limpezas extras ou trocas de enxoval a qualquer momento pelo Portal do Hóspede ou WhatsApp 24h.",
      },
      {
        q: "Preciso ficar mais de 30 dias (ex: 60 ou 90 dias em projeto no Porto do Açu). Como reservar?",
        a: "O calendário online permite blocos imediatos de até 30 noites por reserva com renovação simples, ou você pode clicar no botão da nossa Concierge 24h no WhatsApp para alinhar períodos consecutivos ou múltiplos flats para sua equipe.",
      },
    ],
    relatedLinks: [
      {
        slug: "hospedagem-corporativa-campos",
        path: "/hospedagem-corporativa-campos",
        label: "Hospedagem Corporativa de Domingo a Quinta",
        desc: "Viagens curtas de trabalho com café às 05:00 e NFS-e automática para CNPJ.",
      },
      {
        slug: "flat-centro-campos-rj",
        path: "/flat-centro-campos-rj",
        label: "Conheça a Localização na Rua Conselheiro Otaviano, 209",
        desc: "Veja distâncias exatas para hospitais, universidades, Fórum e Pelinca.",
      },
      {
        slug: "home",
        path: "/",
        label: "Visão Geral da CorpFlats & Galeria de Fotos",
        desc: "Confira todas as fotos reais do flat e da cobertura do Edifício Soho Residence.",
      },
    ],
    primaryKeywords: [
      "flat mensal campos dos goytacazes",
      "aluguel por temporada campos dos goytacazes centro",
      "hospedagem mensal campos rj",
      "estadia longa campos dos goytacazes",
    ],
    secondaryKeywords: [
      "flat mobiliado semanal campos rj",
      "moradia temporaria executivos porto do acu",
      "apartamento mobiliado por 15 ou 30 dias campos rj",
      "flat com cozinha equipada campos dos goytacazes",
    ],
    reviewsHeading: "Relatos de Quem Ficou Múltiplas Diárias Conosco (5,0 ★ no Google)",
    faqHeading: "Perguntas Frequentes sobre Estadias Semanais, Quinzenais e de 30 Dias",
  },
};

export function resolveLandingSlugFromPath(pathname: string): LandingPageSlug {
  const raw = String(pathname || "")
    .split("?")[0]
    .split("#")[0]
    .trim()
    .toLowerCase()
    .replace(/\/+$/, "");

  const normalized = raw.startsWith("/") ? raw.slice(1) : raw;

  if (normalized === "hospedagem-corporativa-campos") {
    return "hospedagem-corporativa-campos";
  }
  if (normalized === "fim-de-semana-campos") {
    return "fim-de-semana-campos";
  }
  if (normalized === "flat-centro-campos-rj") {
    return "flat-centro-campos-rj";
  }
  if (normalized === "estadia-longa-campos") {
    return "estadia-longa-campos";
  }
  return "home";
}

export function getLandingPageSpec(
  slugOrPath?: string,
  siteConfigOverride?: any
): SeoLandingPageSpec {
  const slug = resolveLandingSlugFromPath(slugOrPath || "/");
  const base = SEO_LANDING_PAGES[slug] || SEO_LANDING_PAGES.home;
  const rating = computeDynamicRatingSummary(siteConfigOverride);
  const dynamicRatingToken = `${rating.ratingValuePtBr} ★`;

  const applyDynamicRatingText = (text: string): string =>
    String(text || "").replace(/\b[45],[0-9]\s*★/g, dynamicRatingToken);

  const customSeoPage = siteConfigOverride?.seoPages?.[slug] || {};

  // Na Home, se o gestor editou FAQs em `siteConfig.faq`, preserva-as mantendo a pergunta comercial de venda direta
  let resolvedFaqs = base.faqs.map((item) => ({ ...item }));
  if (
    slug === "home" &&
    !Array.isArray(customSeoPage?.faqs) &&
    Array.isArray(siteConfigOverride?.faq) &&
    siteConfigOverride.faq.length > 0
  ) {
    const adminFaqs = siteConfigOverride.faq
      .filter((f: any) => f && String(f.q || "").trim() && String(f.a || "").trim())
      .map((f: any) => ({ q: String(f.q).trim(), a: String(f.a).trim() }));
    if (adminFaqs.length > 0) {
      const hasDirectPriceFaq = adminFaqs.some((f: { q: string }) =>
        /booking|airbnb|direto|mais barato/i.test(f.q)
      );
      resolvedFaqs = hasDirectPriceFaq ? adminFaqs : [base.faqs[0], ...adminFaqs];
    }
  }

  if (Array.isArray(customSeoPage?.faqs) && customSeoPage.faqs.length > 0) {
    const validCustomFaqs = customSeoPage.faqs
      .filter((f: any) => f && String(f.q || "").trim() && String(f.a || "").trim())
      .map((f: any) => ({ q: String(f.q).trim(), a: String(f.a).trim() }));
    if (validCustomFaqs.length > 0) {
      resolvedFaqs = validCustomFaqs;
    }
  }

  let resolvedPillars = base.valuePillars.map((p) => ({ ...p }));
  if (Array.isArray(customSeoPage?.valuePillars) && customSeoPage.valuePillars.length > 0) {
    const validPillars = customSeoPage.valuePillars
      .filter((p: any) => p && String(p.title || "").trim() && String(p.description || "").trim())
      .map((p: any) => ({
        title: String(p.title).trim(),
        description: String(p.description).trim(),
        ...(p.badge ? { badge: String(p.badge).trim() } : {}),
      }));
    if (validPillars.length > 0) {
      resolvedPillars = validPillars;
    }
  }

  const resolvedHeroImageUrl =
    String(customSeoPage?.heroImageUrl || "").trim() ||
    (slug === "home" && String(siteConfigOverride?.hero?.backgroundImage || "").trim()) ||
    base.heroImageUrl;

  const resolvedHeroImageBase = normalizeSohoPhotoBase(
    String(customSeoPage?.heroImageBase || "").trim() || resolvedHeroImageUrl || base.heroImageBase
  );

  return {
    ...base,
    title: String(customSeoPage?.title || "").trim() || base.title,
    metaDescription:
      String(customSeoPage?.metaDescription || "").trim() || base.metaDescription,
    badgeTop:
      String(customSeoPage?.badgeTop || "").trim() ||
      (slug === "home" && String(siteConfigOverride?.branding?.badgeTop || "").trim()) ||
      base.badgeTop,
    h1:
      String(customSeoPage?.h1 || "").trim() ||
      (slug === "home" && String(siteConfigOverride?.hero?.title || "").trim()) ||
      base.h1,
    highlightText:
      String(customSeoPage?.highlightText || "").trim() ||
      (slug === "home" && String(siteConfigOverride?.hero?.highlightText || "").trim()) ||
      base.highlightText,
    subtitle:
      String(customSeoPage?.subtitle || "").trim() ||
      (slug === "home" && String(siteConfigOverride?.hero?.description || "").trim()) ||
      base.subtitle,
    heroImageBase: resolvedHeroImageBase,
    heroImageUrl: resolvedHeroImageUrl,
    heroImageAlt: String(customSeoPage?.heroImageAlt || "").trim() || base.heroImageAlt,
    ctaButtonText:
      String(customSeoPage?.ctaButtonText || "").trim() ||
      (slug === "home" && String(siteConfigOverride?.hero?.buttonText || "").trim()) ||
      base.ctaButtonText,
    sectionHeading:
      String(customSeoPage?.sectionHeading || "").trim() || base.sectionHeading,
    sectionSubtitle: applyDynamicRatingText(
      String(customSeoPage?.sectionSubtitle || "").trim() || base.sectionSubtitle
    ),
    reviewsHeading: applyDynamicRatingText(
      String(customSeoPage?.reviewsHeading || "").trim() || base.reviewsHeading || ""
    ),
    faqHeading:
      String(customSeoPage?.faqHeading || "").trim() || base.faqHeading,
    valuePillars: resolvedPillars,
    distanceGroups: base.distanceGroups?.map((g) => ({
      category: g.category,
      items: g.items.map((it) => ({ ...it })),
    })),
    faqs: resolvedFaqs,
    relatedLinks: base.relatedLinks.map((link) => ({ ...link })),
    preferredGalleryUrls: [...base.preferredGalleryUrls],
    prioritizedTestimonialNames: [...base.prioritizedTestimonialNames],
  };
}

function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIsoDateLocal(iso: string): Date | null {
  const trimmed = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [yStr, mStr, dStr] = trimmed.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

function addDaysToIso(iso: string, days: number): string {
  const parsed = parseIsoDateLocal(iso);
  if (!parsed) return iso;
  const next = new Date(parsed.getTime());
  next.setDate(next.getDate() + days);
  return toLocalIsoDate(next);
}

function diffDaysIso(checkinIso: string, checkoutIso: string): number {
  const start = parseIsoDateLocal(checkinIso);
  const end = parseIsoDateLocal(checkoutIso);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function clampInt(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, Math.round(val)));
}

function computePresetDatesForSpec(spec: SeoLandingPageSpec, now = new Date()): {
  checkin: string;
  checkout: string;
} {
  const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  const dayOfWeek = todayNoon.getDay(); // 0 = Dom, 1 = Seg, ..., 5 = Sex, 6 = Sáb

  if (spec.forceWeekendDates) {
    // Próxima sexta-feira -> domingo (2 noites — compatível com min_los_weekend = 2)
    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    if (daysUntilFriday === 0 && now.getHours() >= 15) {
      daysUntilFriday = 7;
    }
    const checkinDate = new Date(todayNoon.getTime());
    checkinDate.setDate(checkinDate.getDate() + daysUntilFriday);
    const checkinIso = toLocalIsoDate(checkinDate);
    return {
      checkin: checkinIso,
      checkout: addDaysToIso(checkinIso, 2),
    };
  }

  if (spec.forceWeekdayCorporateDates) {
    // Dom (0), Seg (1), Ter (2) -> amanhã + 2 noites (100% dias úteis corporativos)
    // Qua (3), Qui (4), Sex (5), Sáb (6) -> próxima segunda-feira -> quinta-feira (3 noites)
    if (dayOfWeek >= 0 && dayOfWeek <= 2) {
      const tomorrow = new Date(todayNoon.getTime());
      tomorrow.setDate(tomorrow.getDate() + 1);
      const checkinIso = toLocalIsoDate(tomorrow);
      return {
        checkin: checkinIso,
        checkout: addDaysToIso(checkinIso, 2),
      };
    }
    const daysUntilMonday = (1 - dayOfWeek + 7) % 7 || 7;
    const nextMonday = new Date(todayNoon.getTime());
    nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
    const checkinIso = toLocalIsoDate(nextMonday);
    return {
      checkin: checkinIso,
      checkout: addDaysToIso(checkinIso, 3),
    };
  }

  const tomorrow = new Date(todayNoon.getTime());
  tomorrow.setDate(tomorrow.getDate() + 1);
  const checkinIso = toLocalIsoDate(tomorrow);
  const nights = clampInt(spec.defaultNights || 2, 1, 30);
  return {
    checkin: checkinIso,
    checkout: addDaysToIso(checkinIso, nights),
  };
}

/**
 * Resolve os parâmetros iniciais do motor de reservas respeitando a hierarquia:
 * 1) Query Params explícitos na URL (`?checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&adults=2...` — Google Hotel Free Booking Links & Google Ads)
 * 2) Rascunho salvo no `localStorage` (`savedDraft`), aplicável na Home (`/`) quando sem query params de reserva
 * 3) Preset inteligente da Landing Page (`SEO_LANDING_PAGES[slug]`) alinhado com `min_los_weekend = 2` e `max_los = 30`
 */
export function resolveInitialBookingParams(
  pathname: string,
  search: string,
  savedDraft?: any
): InitialBookingParams {
  const slug = resolveLandingSlugFromPath(pathname);
  const spec = SEO_LANDING_PAGES[slug] || SEO_LANDING_PAGES.home;
  const now = new Date();
  const todayIso = toLocalIsoDate(now);
  const presetDates = computePresetDatesForSpec(spec, now);

  const rawSearch = String(search || "").startsWith("?")
    ? String(search || "").slice(1)
    : String(search || "");
  const params = new URLSearchParams(rawSearch);

  const BOOKING_QUERY_KEYS = [
    "checkin",
    "check_in",
    "startDate",
    "checkout",
    "check_out",
    "endDate",
    "nights",
    "length",
    "adults",
    "guests",
    "rooms",
    "roomsCount",
    "bed",
    "bedType",
    "plan",
    "ratePlan",
    "rate_plan",
    "work",
    "corporate",
    "b2b",
    "pet",
    "pets",
  ];

  const hasExplicitBookingQuery = BOOKING_QUERY_KEYS.some((key) => {
    const v = params.get(key);
    return v !== null && v.trim() !== "";
  });

  if (hasExplicitBookingQuery) {
    const rawCheckin =
      params.get("checkin") || params.get("check_in") || params.get("startDate") || "";
    const rawCheckout =
      params.get("checkout") || params.get("check_out") || params.get("endDate") || "";
    const rawNights = params.get("nights") || params.get("length") || "";

    let resolvedCheckin = presetDates.checkin;
    if (parseIsoDateLocal(rawCheckin) && rawCheckin >= todayIso) {
      resolvedCheckin = rawCheckin.trim();
    }

    let resolvedCheckout = "";
    if (parseIsoDateLocal(rawCheckout) && rawCheckout > resolvedCheckin) {
      const span = diffDaysIso(resolvedCheckin, rawCheckout.trim());
      resolvedCheckout =
        span > 30 ? addDaysToIso(resolvedCheckin, 30) : rawCheckout.trim();
    } else if (rawNights && Number.isFinite(Number(rawNights)) && Number(rawNights) >= 1) {
      const clampedNights = clampInt(Number(rawNights), 1, 30);
      resolvedCheckout = addDaysToIso(resolvedCheckin, clampedNights);
    } else {
      const checkinDateObj = parseIsoDateLocal(resolvedCheckin);
      const isWeekendArrival =
        checkinDateObj !== null &&
        (checkinDateObj.getDay() === 5 || checkinDateObj.getDay() === 6);
      const fallbackNights = Math.max(isWeekendArrival ? 2 : 1, spec.defaultNights || 2);
      resolvedCheckout = addDaysToIso(resolvedCheckin, clampInt(fallbackNights, 1, 30));
    }

    const rawAdults = params.get("adults") || params.get("guests");
    const adults =
      rawAdults !== null && rawAdults.trim() !== ""
        ? clampInt(Number(rawAdults), 1, 3)
        : spec.defaultAdults;

    const rawRooms = params.get("rooms") || params.get("roomsCount");
    const roomsCount =
      rawRooms !== null && rawRooms.trim() !== ""
        ? clampInt(Number(rawRooms), 1, 19)
        : 1;

    const rawBed = (params.get("bed") || params.get("bedType") || "").trim().toLowerCase();
    const bedType: "queen" | "twin" =
      rawBed === "twin" || rawBed === "solteiro" || rawBed === "2" ? "twin" : "queen";

    const rawPlan = (
      params.get("plan") ||
      params.get("ratePlan") ||
      params.get("rate_plan") ||
      ""
    )
      .trim()
      .toLowerCase();
    const ratePlan: "with_breakfast" | "room_only" =
      rawPlan === "room_only" || rawPlan === "sem_cafe"
        ? "room_only"
        : rawPlan === "with_breakfast" || rawPlan === "com_cafe"
          ? "with_breakfast"
          : spec.defaultRatePlan;

    const rawWork = (
      params.get("work") ||
      params.get("corporate") ||
      params.get("b2b") ||
      ""
    )
      .trim()
      .toLowerCase();
    const isWorkTrip =
      rawWork === "1" || rawWork === "true" || rawWork === "yes"
        ? true
        : rawWork === "0" || rawWork === "false"
          ? false
          : Boolean(spec.defaultIsWorkTrip);

    const rawPet = (params.get("pet") || params.get("pets") || "").trim().toLowerCase();
    const bringingPet = rawPet === "1" || rawPet === "true" || rawPet === "yes";

    return {
      checkin: resolvedCheckin,
      checkout: resolvedCheckout,
      adults,
      roomsCount,
      bedType,
      ratePlan,
      isWorkTrip,
      bringingPet,
      fromUrlQuery: true,
    };
  }

  // Prioridade 2: Rascunho ativo (< 24h) salvo no navegador quando estiver na Home ("/")
  if (
    slug === "home" &&
    savedDraft &&
    typeof savedDraft === "object" &&
    typeof savedDraft.checkin === "string" &&
    parseIsoDateLocal(savedDraft.checkin) &&
    savedDraft.checkin >= todayIso
  ) {
    const draftCheckin = savedDraft.checkin.trim();
    let draftCheckout = addDaysToIso(draftCheckin, 2);
    if (
      typeof savedDraft.checkout === "string" &&
      parseIsoDateLocal(savedDraft.checkout) &&
      savedDraft.checkout > draftCheckin
    ) {
      const span = diffDaysIso(draftCheckin, savedDraft.checkout.trim());
      draftCheckout =
        span > 30 ? addDaysToIso(draftCheckin, 30) : savedDraft.checkout.trim();
    }

    const firstRoom =
      Array.isArray(savedDraft.rooms) && savedDraft.rooms.length > 0
        ? savedDraft.rooms[0]
        : null;
    const draftAdults = firstRoom?.adults
      ? clampInt(Number(firstRoom.adults), 1, 3)
      : savedDraft.adults
        ? clampInt(Number(savedDraft.adults), 1, 3)
        : spec.defaultAdults;
    const draftRoomsCount =
      Array.isArray(savedDraft.rooms) && savedDraft.rooms.length > 0
        ? clampInt(savedDraft.rooms.length, 1, 19)
        : 1;
    const draftBedType: "queen" | "twin" =
      firstRoom?.bedType === "twin" || savedDraft.bedType === "twin" ? "twin" : "queen";
    const draftRatePlan: "with_breakfast" | "room_only" =
      savedDraft.ratePlan === "room_only" ? "room_only" : "with_breakfast";

    return {
      checkin: draftCheckin,
      checkout: draftCheckout,
      adults: draftAdults,
      roomsCount: draftRoomsCount,
      bedType: draftBedType,
      ratePlan: draftRatePlan,
      isWorkTrip: Boolean(savedDraft.isWorkTrip ?? spec.defaultIsWorkTrip),
      bringingPet: Boolean(savedDraft.bringingPet),
      fromUrlQuery: false,
    };
  }

  // Prioridade 3: Preset estratégico da Landing Page atual
  return {
    checkin: presetDates.checkin,
    checkout: presetDates.checkout,
    adults: spec.defaultAdults,
    roomsCount: 1,
    bedType: "queen",
    ratePlan: spec.defaultRatePlan,
    isWorkTrip: Boolean(spec.defaultIsWorkTrip),
    bringingPet: false,
    fromUrlQuery: false,
  };
}

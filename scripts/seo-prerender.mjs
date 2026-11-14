// artifacts/api-server/seo-prerender.mjs
// Motor de SEO Técnico, Pré-Renderização Semântica (SSR Snapshot), JSON-LD Schema.org,
// Sitemap XML Dinâmico, Robots.txt e Política de Indexação da CorpFlats (corpflats.com.br).

export const OFFICIAL_ORIGIN = "https://corpflats.com.br";

export const HOTEL_OFFICIAL_IDENTITY = {
  brandName: "CorpFlats",
  fullName: "CorpFlats — Edifício Soho Residence Service",
  legalName: "CORPFLATS LTDA",
  cnpj: "47.964.813/0001-65",
  streetAddress: "Rua Conselheiro Otaviano, 209 - Edifício Soho Residence Service",
  neighborhood: "Centro",
  addressLocality: "Campos dos Goytacazes",
  addressRegion: "RJ",
  postalCode: "28010-140",
  addressCountry: "BR",
  fullAddressDisplay:
    "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ, CEP 28010-140 (Edifício Soho Residence Service)",
  latitude: -21.7584,
  longitude: -41.3262,
  telephoneE164: "+5522997124021",
  telephoneSchema: "+55-22-99712-4021",
  telephoneDisplay: "(22) 99712-4021",
  whatsappDigits: "5522997124021",
  email: "reservas@corpflats.com.br",
  instagramUrl: "https://instagram.com/corpflats",
  googleMapsUrl: "https://share.google/LHu3541d5lhkdvbL2",
  checkinTime: "14:00",
  checkoutTime: "12:00",
  numberOfRooms: 19,
};

export const PUBLIC_SEO_SLUGS = [
  "home",
  "hospedagem-corporativa-campos",
  "fim-de-semana-campos",
  "flat-centro-campos-rj",
  "estadia-longa-campos",
];

const DEFAULT_FALLBACK_TESTIMONIALS = [
  {
    id: 1,
    name: "Giselia Correa",
    city: "Avaliação 5★ no Google",
    rating: 5,
    comment:
      "Passamos 4 diárias no flat, fomos muito bem atendidos pelo sr Miller e sua esposa, eles são pessoas muito atenciosas, nos trataram com muito carinho. O café da manhã é bem servido e pontual, tudo fresquinho, o pão de queijo bem quentinho, tudo com excelência. Amamos super recomendo!!!!",
  },
  {
    id: 2,
    name: "Carlos Aprigio",
    city: "Avaliação 5★ no Google",
    rating: 5,
    comment:
      "Hospedagem maravilhosa, com quarto limpinho, cheiroso, com um lugar super calmo e silencioso, tratamento super bacana, estacionamento seguro, as pessoas trabalhando com muito carinho e atenção!! Resumindo!! Muito bom Recomendo!",
  },
  {
    id: 3,
    name: "GG Cordeiro",
    city: "Avaliação 5★ no Google",
    rating: 5,
    comment:
      "Tudo perfeito, clareza nas informações, ambiente muito agradável, acomodação impecável, parabéns a Corp Flats!",
  },
  {
    id: 4,
    name: "Paula Ladeira Vidal",
    city: "Avaliação 5★ no Google",
    rating: 5,
    comment:
      "O Flat estava limpo e bem equipado, também fica localizado perto de bares, restaurantes e farmácias, em área central de Campos. O estacionamento é gratuito. Recomendo!",
  },
  {
    id: 5,
    name: "Hugo Alves",
    city: "Avaliação 5★ no Google",
    rating: 5,
    comment:
      "Quando vou a Campos sempre fico nesse Flat, muito limpo e organizado, tem tudo que preciso num lugar só.",
  },
  {
    id: 6,
    name: "Jean Sant'Anna",
    city: "Avaliação 5★ no Google",
    rating: 5,
    comment:
      "Foi uma experiência bem legal. Ótimo café da manhã. Quarto limpo e aconchegante. Boa localização. Nada a reclamar!",
  },
];

export const HYPERLOCAL_DISTANCE_GROUPS = [
  {
    category: "Saúde & Hospitais",
    items: [
      {
        place: "Hospital Geral Dr. Beda (R. Conselheiro Otaviano, 129)",
        distance: "80 m",
        note: "1 min a pé na mesma calçada",
      },
      {
        place: "Hospital dos Plantadores de Cana",
        distance: "550 m",
        note: "6 min a pé",
      },
      {
        place: "Hospital Ferreira Machado",
        distance: "1,6 km",
        note: "5 min de carro",
      },
    ],
  },
  {
    category: "Universidades, Ensino & Pesquisa",
    items: [
      {
        place: "UFF Campos (Direito / Ciências Sociais)",
        distance: "800 m",
        note: "9 min a pé",
      },
      {
        place: "Faculdade de Medicina de Campos (FMC)",
        distance: "1,1 km",
        note: "4 min de carro / 13 min a pé",
      },
      {
        place: "IFF Campus Campos Centro",
        distance: "2,2 km",
        note: "6 min de carro",
      },
      {
        place: "UENF (Av. Alberto Lamego)",
        distance: "5,5 km",
        note: "15 min de carro",
      },
    ],
  },
  {
    category: "Jurídico, Negócios, Gastronomia & Logística",
    items: [
      {
        place: "Terminal Rodoviário Roberto Silveira",
        distance: "600 m",
        note: "8 min a pé",
      },
      {
        place: "Fórum Maria Tereza Gusmão Andrade & Praça São Salvador",
        distance: "1,2 km",
        note: "5 min de carro",
      },
      {
        place: "Pelinca (Polo Gastronômico) & Boulevard Shopping",
        distance: "1,8 a 3,2 km",
        note: "5 a 8 min de carro",
      },
      {
        place: "Aeroporto Bartolomeu Lysandro (CAW)",
        distance: "9,5 km",
        note: "18 min de carro",
      },
      {
        place: "Complexo Industrial e Portuário do Açu (São João da Barra)",
        distance: "48 km",
        note: "~50 min via RJ-240 / BR-356",
      },
    ],
  },
];

export const PUBLIC_SEO_PAGES_CATALOG = {
  home: {
    slug: "home",
    path: "/",
    canonicalUrl: `${OFFICIAL_ORIGIN}/`,
    title: "Flats em Campos dos Goytacazes Centro | CorpFlats Soho",
    metaDescription:
      "Flats completos no Edifício Soho (Centro de Campos/RJ): garagem inclusa, jacuzzi aquecida, Wi-Fi individual e recepção 24h. Menor preço + 5% OFF no PIX!",
    breadcrumbLabel: "CorpFlats Campos",
    badgeTop: "⭐ Menor Preço Garantido no Site Oficial • 5% OFF no PIX",
    h1: "Seu flat completo no Centro de Campos dos Goytacazes",
    highlightText: "Centro de Campos dos Goytacazes",
    subtitle:
      "Edifício Soho Residence Service • Menor Preço Garantido no Site Oficial, 5% OFF no PIX, 1 Vaga de Garagem Coberta Inclusa, Jacuzzi na Cobertura e Emissão Automática de NFS-e.",
    heroImageBase: "hero-jacuzzi-cobertura",
    heroImageUrl: "/photos/soho/hero-jacuzzi-cobertura.jpg",
    ogImageUrl: `${OFFICIAL_ORIGIN}/photos/soho/hero-jacuzzi-cobertura.jpg`,
    heroImageAlt:
      "Jacuzzi aquecida na cobertura do Edifício Soho Residence Service — CorpFlats Campos dos Goytacazes/RJ",
    sectionHeading: "O Flat: padrão único nas 19 unidades para trabalhar ou descansar",
    sectionSubtitle:
      "Reserve direto sem taxas de intermediários: até 15% mais econômico que Booking e Airbnb, com +5% OFF adicional no PIX imediato e cancelamento 100% grátis até 24h antes do check-in.",
    valuePillars: [
      {
        title: "Menor Preço no Site Oficial + 5% OFF no PIX",
        description:
          "Tarifa direta livre de comissões de plataformas de reserva, com 5% de desconto adicional no PIX Banco Inter e confirmação instantânea.",
      },
      {
        title: "1 Vaga de Garagem Coberta Inclusa + Recepção 24h",
        description:
          "Estacionamento privativo rotativo dentro do Edifício Soho sem custo extra e portaria 24 horas com acesso via cartão magnético NFC.",
      },
      {
        title: "Jacuzzi Aquecida, Saunas & Academia (06h às 22h)",
        description:
          "Cobertura panorâmica com hidromassagem aquecida no deck, saunas seca e a vapor, academia climatizada e sala de jogos (não dispomos de piscina tradicional).",
      },
      {
        title: "Cozinha Prática, Wi-Fi Individual & Café às 05:00",
        description:
          "Bancada dedicada com Wi-Fi exclusivo por flat, cooktop 2 bocas, frigobar, cafeteira, sanduicheira e louças (sem micro-ondas), além de café servido no flat das 05:00 às 09:30.",
      },
    ],
    faqs: [
      {
        q: "Por que reservar direto em corpflats.com.br é mais barato que no Booking ou Airbnb?",
        a: "Porque no site oficial você reserva direto com a administração da CorpFlats sem taxas de intermediação (~15% menores que nas OTAs), ganha mais 5% de desconto imediato no PIX, recebe confirmação na hora e conta com emissão automática de NFS-e.",
      },
      {
        q: "Como funcionam o check-in, o check-out e o acesso ao flat?",
        a: "O check-in inicia às 14:00 e o check-out vai até as 12:00. Antes da chegada, você conclui o pré-check-in digital pelo celular e retira o cartão NFC diretamente na recepção 24 horas do Edifício Soho (não há senha na porta).",
      },
      {
        q: "O edifício possui piscina ou quais áreas de lazer estão disponíveis?",
        a: "Não temos piscina tradicional. A cobertura do Soho Residence conta com jacuzzi aquecida no deck, terraço panorâmico, saunas seca e a vapor, academia climatizada e sala de jogos — todos liberados gratuitamente das 06:00 às 22:00.",
      },
      {
        q: "Quantas pessoas cabem no flat e como pedir 2 camas de solteiro?",
        a: "O padrão das 19 unidades acomoda até 2 hóspedes em cama de casal ou 2 camas de solteiro nas unidades compatíveis (taxa única de configuração de R$ 30,00; para check-in no mesmo dia, solicitar até as 12:00).",
      },
      {
        q: "Como funciona o café da manhã?",
        a: "Na tarifa Com Café da Manhã Incluso, a bandeja é preparada fresquinha e entregue diretamente no seu apartamento no horário agendado entre 05:00 e 09:30, com escolha prévia pelo Portal Minha Reserva.",
      },
      {
        q: "A vaga de garagem está inclusa?",
        a: "Sim. Cada reserva inclui gratuitamente 1 vaga de garagem coberta rotativa no próprio Edifício Soho. Basta informar modelo, cor e placa do veículo no pré-check-in digital.",
      },
      {
        q: "Vocês aceitam animais de estimação (pets)?",
        a: "Sim. Aceitamos exclusivamente cachorros de porte pequeno (até 10 kg), no limite máximo de 2 cães por flat, mediante taxa única de higienização de R$ 40,00 por cão por estadia.",
      },
      {
        q: "Qual é a política de cancelamento e reembolso?",
        a: "Cancelamento gratuito com 100% de reembolso até 24 horas antes das 14:00 do dia do check-in. Faltando menos de 24 horas para o check-in, é cobrado 100% do valor da reserva.",
      },
    ],
  },

  "hospedagem-corporativa-campos": {
    slug: "hospedagem-corporativa-campos",
    path: "/hospedagem-corporativa-campos",
    canonicalUrl: `${OFFICIAL_ORIGIN}/hospedagem-corporativa-campos`,
    title: "Hospedagem Corporativa em Campos RJ | NFS-e • CorpFlats",
    metaDescription:
      "Flats executivos no Centro de Campos/RJ (base Porto do Açu): NFS-e automática p/ CNPJ, café às 05h, Wi-Fi individual e garagem. Menor preço + 5% OFF PIX!",
    breadcrumbLabel: "Hospedagem Corporativa & Porto do Açu",
    badgeTop: "💼 Base Executiva em Campos/RJ • NFS-e Automática p/ CNPJ",
    h1: "Hospedagem Corporativa em Campos dos Goytacazes com NFS-e Automática",
    highlightText: "NFS-e Automática",
    subtitle:
      "Base executiva ideal de Domingo a Quinta para empresas, representantes e operações no Porto do Açu: café no flat às 05:00, Wi-Fi individual, garagem coberta inclusa e reserva online em 1 minuto (5% OFF no PIX).",
    heroImageBase: "01-quarto-bancada",
    heroImageUrl: "/photos/soho/01-quarto-bancada.jpg",
    ogImageUrl: `${OFFICIAL_ORIGIN}/photos/soho/01-quarto-bancada.jpg`,
    heroImageAlt:
      "Flat executivo com cama de casal e bancada de trabalho dedicada com Wi-Fi exclusivo — CorpFlats Soho Campos/RJ",
    sectionHeading:
      "Por que Empresas do Porto do Açu, Macaé e Região Escolhem a CorpFlats de Domingo a Quinta?",
    sectionSubtitle:
      "Cotação e reserva 100% online sem burocracia de e-mail: reserve de 1 a 19 flats no mesmo pedido, escolha cama de casal ou 2 de solteiro e receba a NFS-e Nacional automaticamente no CNPJ.",
    valuePillars: [
      {
        title: "NFS-e Nacional Emitida Automaticamente no CNPJ",
        description:
          "Basta marcar Viagem a Trabalho no checkout e informar o CNPJ: após o pagamento via PIX (5% OFF) ou Cartão Corporativo, a nota fiscal oficial segue para o financeiro/RH.",
      },
      {
        title: "Café da Manhã no Flat a Partir das 05:00",
        description:
          "Ideal para engenheiros, técnicos e executivos que saem cedo rumo ao Porto do Açu (BR-356 / RJ-240) ou visitas técnicas sem perder o café da manhã.",
      },
      {
        title: "Wi-Fi Exclusivo por Apartamento + Bancada Ergonômica",
        description:
          "Rede individual dedicada por flat para videoconferências estáveis, bancada de trabalho iluminada, ar-condicionado silencioso, blecaute e ferro de passar.",
      },
      {
        title: "Garagem Coberta p/ Frota + Recepção 24h",
        description:
          "1 vaga coberta inclusa por reserva para veículos de locadora ou frota corporativa e retirada expressa do cartão NFC em chegadas noturnas ou de madrugada.",
      },
    ],
    faqs: [
      {
        q: "Como funciona a emissão de Nota Fiscal (NFS-e) para CNPJ?",
        a: "No checkout online, basta marcar 'Viagem a Trabalho' e informar o CNPJ. O sistema emite automaticamente a NFS-e Nacional oficial após a confirmação do pagamento (PIX com 5% OFF ou Cartão) e disponibiliza PDF/XML para o e-mail financeiro ou RH.",
      },
      {
        q: "Preciso sair antes das 06:00 para o Porto do Açu ou visita técnica. Consigo tomar café?",
        a: "Sim! Na tarifa Com Café da Manhã, entregamos a bandeja completa direto no seu flat a partir das 05:00 da manhã, no horário exato agendado pelo celular na véspera.",
      },
      {
        q: "Qual a distância da CorpFlats até o Porto do Açu (São João da Barra)?",
        a: "Cerca de 48 km (~50 minutos via RJ-240 / BR-356), com a vantagem estratégica de pernoitar no Centro de Campos com estrutura completa de restaurantes, farmácias, hospitais, academia, saunas e silêncio absoluto.",
      },
      {
        q: "Posso reservar múltiplos flats de uma vez para minha equipe ou pedir 2 camas de solteiro?",
        a: "Sim! Nosso motor de reservas permite adicionar múltiplos flats no mesmo pedido para equipes e selecionar montagem de 2 camas de solteiro nas unidades compatíveis (taxa única de R$ 30,00 por estadia; para entrada no mesmo dia, solicitar até as 12:00).",
      },
      {
        q: "Preciso enviar e-mail pedindo proposta de acordo corporativo?",
        a: "Não! Nossa menor tarifa corporativa já está liberada direto no site para qualquer empresa (até 15% menor que Booking/Airbnb + 5% OFF extra no PIX imediato), sem exigir volume mínimo anual.",
      },
      {
        q: "Como funciona se o colaborador chegar de madrugada?",
        a: "A recepção do Edifício Soho funciona 24 horas. Com o pré-check-in digital preenchido no celular, a retirada do cartão magnético NFC leva menos de 1 minuto em qualquer horário.",
      },
    ],
  },

  "fim-de-semana-campos": {
    slug: "fim-de-semana-campos",
    path: "/fim-de-semana-campos",
    canonicalUrl: `${OFFICIAL_ORIGIN}/fim-de-semana-campos`,
    title: "Fim de Semana em Campos RJ: Jacuzzi & Café | CorpFlats",
    metaDescription:
      "Seu refúgio de sexta a domingo em Campos/RJ: cobertura com jacuzzi aquecida, saunas, café servido no flat, garagem e Pet Friendly. Reserve c/ 5% OFF PIX!",
    breadcrumbLabel: "Fim de Semana, Casais & Pet Friendly",
    badgeTop: "✨ Sexta a Domingo em Campos/RJ • Jacuzzi, Saunas & Café no Flat",
    h1: "Seu Fim de Semana em Campos: Jacuzzi na Cobertura, Saunas e Café no Flat",
    highlightText: "Jacuzzi na Cobertura, Saunas e Café no Flat",
    subtitle:
      "De sexta a domingo no Edifício Soho Residence: privacidade total para casais, visitas à família, formaturas e viagens com seu pet — com Menor Preço no Site Oficial + 5% OFF no PIX.",
    heroImageBase: "06-cobertura-jacuzzi",
    heroImageUrl: "/photos/soho/06-cobertura-jacuzzi.jpg",
    ogImageUrl: `${OFFICIAL_ORIGIN}/photos/soho/06-cobertura-jacuzzi.jpg`,
    heroImageAlt:
      "Deck com jacuzzi aquecida na cobertura do Edifício Soho Residence — Fim de semana em Campos dos Goytacazes",
    sectionHeading: "Cobertura Panorâmica Soho: Jacuzzi Aquecida, Saunas Seca/Vapor e Sala de Jogos",
    sectionSubtitle:
      "Experiência de spa urbano aquecido das 06:00 às 22:00 (não dispomos de piscina fria tradicional), café da manhã entregue na porta do flat e cozinha com taças de vinho e saca-rolhas.",
    valuePillars: [
      {
        title: "Cobertura com Jacuzzi Aquecida & Saunas (06h–22h)",
        description:
          "Acesso gratuito para hóspedes à hidromassagem aquecida no deck panorâmico, saunas seca e a vapor, academia climatizada e sala de jogos.",
      },
      {
        title: "Café da Manhã na Mesa do Seu Flat",
        description:
          "Acorde sem pressa: escolha seus itens favoritos pelo celular na véspera e receba a bandeja fresquinha na porta do apartamento até as 09:30.",
      },
      {
        title: "Cozinha Compacta com Taças de Vinho & Saca-Rolhas",
        description:
          "Prepare um lanche ou jantar a dois com cooktop 2 bocas, frigobar, cafeteira elétrica, sanduicheira, pratos, talheres e taças (não dispomos de micro-ondas).",
      },
      {
        title: "Pet Friendly & Perfeito p/ Casamentos e Visitas",
        description:
          "Aceitamos até 2 cães de pequeno porte (até 10 kg, taxa única de R$ 40/cão) e incluímos 1 vaga de garagem coberta a 5 min da Pelinca.",
      },
    ],
    faqs: [
      {
        q: "A jacuzzi aquecida e as saunas da cobertura têm custo extra ou precisam de agendamento?",
        a: "O acesso à cobertura (jacuzzi aquecida, saunas seca e a vapor, terraço panorâmico, academia e sala de jogos) é 100% gratuito para hóspedes das 06:00 às 22:00. Importante: não temos piscina tradicional, e sim hidromassagem aquecida no deck.",
      },
      {
        q: "Como funciona o café da manhã para casais no fim de semana?",
        a: "Na tarifa Com Café da Manhã, você escolhe os itens pelo celular até a véspera e recebe a bandeja fresquinha na mesa do seu flat com total privacidade no horário agendado até as 09:30.",
      },
      {
        q: "Posso levar meu cachorro no fim de semana?",
        a: "Sim! Recebemos até 2 cachorros de pequeno porte (até 10 kg) por flat, mediante taxa única de higienização de R$ 40,00 por cão por estadia e aceite das regras de convivência do condomínio no checkout.",
      },
      {
        q: "O flat tem taças de vinho e itens para preparar um lanche ou jantar a dois?",
        a: "Sim! Todos os flats contam com taças, saca-rolhas, copos, pratos, talheres, cooktop de 2 bocas, frigobar, sanduicheira e cafeteira elétrica (não dispomos de micro-ondas).",
      },
      {
        q: "Qual a estadia mínima de sexta a domingo e o horário de saída?",
        a: "Para entradas na sexta-feira ou sábado o padrão é a partir de 2 diárias, com check-in às 14:00 na recepção 24h e check-out tranquilo até as 12:00.",
      },
      {
        q: "E se surgir um imprevisto antes da viagem?",
        a: "Cancelando até 24 horas antes das 14:00 do dia do check-in, o reembolso é integral (100% gratuito).",
      },
    ],
  },

  "flat-centro-campos-rj": {
    slug: "flat-centro-campos-rj",
    path: "/flat-centro-campos-rj",
    canonicalUrl: `${OFFICIAL_ORIGIN}/flat-centro-campos-rj`,
    title: "Flat no Centro de Campos RJ (Edifício Soho) | CorpFlats",
    metaDescription:
      "Hospede-se na R. Conselheiro Otaviano, 209 (Soho Residence): ao lado do Hosp. Dr. Beda, perto do Fórum, FMC e Pelinca. Vaga coberta inclusa + 5% OFF PIX!",
    breadcrumbLabel: "Flat no Centro — Edifício Soho",
    badgeTop: "📍 Rua Conselheiro Otaviano, 209 • Centro de Campos/RJ",
    h1: "Flat Completo no Centro de Campos dos Goytacazes — Edifício Soho Residence",
    highlightText: "Edifício Soho Residence",
    subtitle:
      "Rua Conselheiro Otaviano, 209: a 80 metros do Hospital Dr. Beda e a poucos minutos da Pelinca, FMC, UFF e Fórum — com 1 vaga de garagem coberta inclusa e recepção 24h.",
    heroImageBase: "02-flat-integrado",
    heroImageUrl: "/photos/soho/02-flat-integrado.jpg",
    ogImageUrl: `${OFFICIAL_ORIGIN}/photos/soho/02-flat-integrado.jpg`,
    heroImageAlt:
      "Flat mobiliado completo no Edifício Soho Residence Service, Rua Conselheiro Otaviano 209, Centro de Campos/RJ",
    sectionHeading: "Mapa de Distâncias Reais a Partir da Rua Conselheiro Otaviano, 209",
    sectionSubtitle:
      "Mobilidade a pé e de carro para os principais hospitais, universidades, fórum, rodoviária e polo gastronômico da Pelinca, com estacionamento coberto incluso no prédio.",
    valuePillars: [
      {
        title: "A 80 Metros do Hospital Geral Dr. Beda (Mesma Calçada)",
        description:
          "Localização imbatível no nº 209 da Rua Conselheiro Otaviano (Dr. Beda fica no nº 129, a 1 minuto a pé) e a 550 m do Hospital dos Plantadores de Cana.",
      },
      {
        title: "Perto da FMC, UFF, Fórum & Rodoviária Roberto Silveira",
        description:
          "A 600 m da Rodoviária, 800 m da UFF, 1,1 km da Faculdade de Medicina de Campos (FMC), 1,2 km do Fórum e 5 min de carro da Pelinca.",
      },
      {
        title: "1 Vaga de Garagem Coberta Inclusa no Centro",
        description:
          "Esqueça estacionamentos rotativos pagos na rua: seu veículo fica protegido dentro do Edifício Soho com controle de acesso 24h.",
      },
      {
        title: "Silêncio Hoteleiro & Padrão CorpFlats nas 19 Unidades",
        description:
          "Andares com vedação acústica, cortina blecaute, ar-condicionado silencioso, enxoval higienizado, suporte 24h e Menor Preço + 5% OFF no PIX.",
      },
    ],
    faqs: [
      {
        q: "Qual é o endereço exato e como funciona a entrada no Edifício Soho Residence Service?",
        a: "Rua Conselheiro Otaviano, 209, Centro, Campos dos Goytacazes/RJ (CEP 28010-140). A recepção funciona 24 horas; após o pré-check-in online no celular, basta apresentar documento e retirar seu cartão magnético NFC.",
      },
      {
        q: "Fica realmente na mesma rua do Hospital Dr. Beda?",
        a: "Sim! O Hospital Geral Dr. Beda fica no nº 129 da Rua Conselheiro Otaviano, a cerca de 80 metros (1 minuto de caminhada na mesma calçada) — ideal para médicos, equipes cirúrgicas e familiares acompanhantes.",
      },
      {
        q: "É seguro estacionar? Carros grandes e caminhonetes entram na garagem?",
        a: "Sim. Cada reserva inclui gratuitamente 1 vaga de garagem coberta rotativa dentro do próprio Edifício Soho, com controle de portaria 24h mediante cadastro prévio da placa no pré-check-in.",
      },
      {
        q: "Por ficar no Centro, os apartamentos são silenciosos para dormir?",
        a: "Sim! O Edifício Soho possui construção sólida, janelas vedadas, cortinas blecaute e ar-condicionado silencioso — qualidade destacada nas avaliações 5 estrelas de hóspedes no Google.",
      },
      {
        q: "Qual a diferença de reservar aqui no site oficial da CorpFlats para outros anúncios no mesmo prédio?",
        a: "A CorpFlats opera 19 unidades próprias padronizadas com enxoval hoteleiro higienizado, manutenção dedicada, café entregue no flat (05h às 09h30), atendimento 24h, NFS-e automática e Menor Preço Garantido + 5% OFF no PIX.",
      },
    ],
  },

  "estadia-longa-campos": {
    slug: "estadia-longa-campos",
    path: "/estadia-longa-campos",
    canonicalUrl: `${OFFICIAL_ORIGIN}/estadia-longa-campos`,
    title: "Estadia Longa e Flat Mensal em Campos RJ | CorpFlats",
    metaDescription:
      "Vai ficar 7, 15 ou 30 dias em Campos/RJ? Flat mobiliado c/ cozinha, Wi-Fi individual, academia, garagem inclusa e NFS-e sem fiador. Menor preço + 5% PIX!",
    breadcrumbLabel: "Estadia Longa (7 a 30 Dias)",
    badgeTop: "🏠 Semanal, Quinzenal & 30 Dias • Zero Fiador & Contas Inclusas",
    h1: "Estadia Longa em Campos dos Goytacazes: 7, 15 ou 30 Dias Sem Burocracia",
    highlightText: "7, 15 ou 30 Dias Sem Burocracia",
    subtitle:
      "Mude-se hoje apenas com a mala: flat completo com cozinha, Wi-Fi individual, energia, condomínio, academia, jacuzzi e vaga coberta 100% inclusos — com NFS-e e 5% OFF no PIX.",
    heroImageBase: "04-cozinha-equipada",
    heroImageUrl: "/photos/soho/04-cozinha-equipada.jpg",
    ogImageUrl: `${OFFICIAL_ORIGIN}/photos/soho/04-cozinha-equipada.jpg`,
    heroImageAlt:
      "Cozinha compacta equipada com cooktop 2 bocas, frigobar, cafeteira e louças para estadias longas em Campos/RJ",
    sectionHeading: "Flat CorpFlats vs. Aluguel Tradicional vs. Quarto de Hotel Comum",
    sectionSubtitle:
      "Ideal para projetos no Porto do Açu, plantões médicos, pós-graduações na FMC/UENF/UFF ou reformas residenciais: descontos progressivos automáticos para 7+, 14+ e 28+ diárias.",
    valuePillars: [
      {
        title: "Zero Fiador, Zero Caução & Confirmação em 1 Minuto",
        description:
          "Esqueça contratos de 12 meses e vistorias cartoriais: selecione de 7 a 30 noites online, pague no PIX (5% OFF) ou Cartão e receba NFS-e imediata.",
      },
      {
        title: "Energia, Condomínio, Água, Wi-Fi & Garagem 100% Inclusos",
        description:
          "Previsibilidade financeira total sem nenhuma conta separada no fim do mês — incluindo internet exclusiva do flat e 1 vaga coberta.",
      },
      {
        title: "Cozinha Compacta Equipada para Sua Rotina",
        description:
          "Fogão cooktop 2 bocas, frigobar, cafeteira elétrica, sanduicheira, pratos, talheres, copos, taças e mesa de 2 lugares (não dispomos de micro-ondas).",
      },
      {
        title: "Qualidade de Vida: Academia, Saunas & Jacuzzi no Prédio",
        description:
          "Mantenha sua rotina de treinos e descanso das 06:00 às 22:00 na cobertura do Soho Residence, com enxoval hoteleiro e suporte 24h.",
      },
    ],
    faqs: [
      {
        q: "Preciso de fiador, caução ou contrato de locação de 12 meses?",
        a: "Zero burocracia. Você seleciona de 7 a 30 noites direto no motor de reservas, paga via PIX (com 5% OFF) ou Cartão de Crédito e já garante acesso imediato e emissão de NFS-e se viajar por empresa.",
      },
      {
        q: "Energia elétrica, condomínio, água, Wi-Fi e garagem estão inclusos no valor?",
        a: "100% inclusos! Não há nenhuma conta surpresa no fim do período — Wi-Fi individual do apartamento, 1 vaga de garagem coberta, uso da academia, saunas e jacuzzi já fazem parte da diária.",
      },
      {
        q: "O que vem na cozinha para preparar minhas refeições durante a semana?",
        a: "Fogão cooktop de 2 bocas, frigobar, cafeteira elétrica, sanduicheira, pratos, talheres, copos, taças, saca-rolhas e mesa de 2 lugares (importante: não dispomos de micro-ondas nem máquina de lavar roupas dentro do flat).",
      },
      {
        q: "Como funciona a limpeza e troca de enxoval em estadias longas?",
        a: "Você recebe o flat impecável com enxoval completo de cama e banho higienizado, e pode solicitar limpezas extras ou trocas de enxoval a qualquer momento pelo Portal Minha Reserva ou WhatsApp 24h.",
      },
      {
        q: "Preciso ficar mais de 30 dias (ex: 60 ou 90 dias em projeto no Porto do Açu). Como reservar?",
        a: "O calendário online libera blocos de até 30 noites por reserva com renovação simplificada, ou fale com nosso Concierge WhatsApp 24h para organizarmos estadias consecutivas ou múltiplos flats.",
      },
    ],
  },
};

export const DEFAULT_SEO_PAGES_CONFIG = Object.fromEntries(
  PUBLIC_SEO_SLUGS.map((slug) => {
    const p = PUBLIC_SEO_PAGES_CATALOG[slug];
    return [
      slug,
      {
        slug: p.slug,
        path: p.path,
        title: p.title,
        metaDescription: p.metaDescription,
        h1: p.h1,
        subtitle: p.subtitle,
        badgeTop: p.badgeTop,
        heroImageUrl: p.heroImageUrl,
        heroImageBase: p.heroImageBase,
        sectionHeading: p.sectionHeading,
        sectionSubtitle: p.sectionSubtitle,
      },
    ];
  })
);

function escapeHtml(val) {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizePathname(rawPath) {
  const str = String(rawPath || "/").split("?")[0].trim();
  if (!str || str === "/") return "/";
  return str.replace(/\/+$/, "") || "/";
}

export function isPublicIndexablePath(rawPath) {
  const clean = normalizePathname(rawPath).toLowerCase();
  if (clean === "/") return true;
  const slug = clean.slice(1);
  return slug !== "home" && PUBLIC_SEO_SLUGS.includes(slug);
}

export function getServerSeoPageSpec(slugOrPath, siteConfig = null) {
  const raw = String(slugOrPath || "home").trim().toLowerCase();
  let slug = "home";
  if (raw === "/" || raw === "home" || raw === "") {
    slug = "home";
  } else {
    const stripped = raw.replace(/^\/+|\/+$/g, "");
    if (PUBLIC_SEO_SLUGS.includes(stripped)) {
      slug = stripped;
    }
  }

  const base = PUBLIC_SEO_PAGES_CATALOG[slug] || PUBLIC_SEO_PAGES_CATALOG.home;
  const override =
    siteConfig?.seoPages && typeof siteConfig.seoPages === "object"
      ? siteConfig.seoPages[slug]
      : null;

  if (!override || typeof override !== "object") {
    return base;
  }

  const heroImageUrl = String(override.heroImageUrl || base.heroImageUrl).trim() || base.heroImageUrl;
  const derivedBaseMatch = heroImageUrl.match(/\/photos\/soho\/([a-z0-9_-]+)\.(?:jpg|jpeg|webp|avif)/i);
  const heroImageBase =
    String(override.heroImageBase || (derivedBaseMatch ? derivedBaseMatch[1] : base.heroImageBase)).trim() ||
    base.heroImageBase;

  return {
    ...base,
    title: String(override.title || base.title).trim() || base.title,
    metaDescription:
      String(override.metaDescription || base.metaDescription).trim() || base.metaDescription,
    h1: String(override.h1 || base.h1).trim() || base.h1,
    subtitle: String(override.subtitle || base.subtitle).trim() || base.subtitle,
    badgeTop: String(override.badgeTop || base.badgeTop).trim() || base.badgeTop,
    heroImageUrl,
    heroImageBase,
    ogImageUrl: heroImageUrl.startsWith("http")
      ? heroImageUrl
      : `${OFFICIAL_ORIGIN}${heroImageUrl.startsWith("/") ? "" : "/"}${heroImageUrl}`,
    sectionHeading:
      String(override.sectionHeading || base.sectionHeading).trim() || base.sectionHeading,
    sectionSubtitle:
      String(override.sectionSubtitle || base.sectionSubtitle).trim() || base.sectionSubtitle,
    faqs:
      Array.isArray(override.faqs) && override.faqs.length > 0
        ? override.faqs.filter((f) => f && f.q && f.a)
        : base.faqs,
  };
}

export function computeCoherentReviewStats(siteConfig = null) {
  const rawList =
    Array.isArray(siteConfig?.testimonials) && siteConfig.testimonials.length > 0
      ? siteConfig.testimonials
      : DEFAULT_FALLBACK_TESTIMONIALS;

  const validReviews = rawList.filter(
    (t) => t && String(t.name || "").trim() && String(t.comment || "").trim()
  );
  const effectiveReviews =
    validReviews.length > 0 ? validReviews : DEFAULT_FALLBACK_TESTIMONIALS;

  const numericRatings = effectiveReviews
    .map((t) => Number(t.rating ?? 5))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);

  const computedAvg =
    numericRatings.length > 0
      ? numericRatings.reduce((acc, v) => acc + v, 0) / numericRatings.length
      : 5;

  const configuredAvg = Number(
    siteConfig?.gbpRatingValue ?? siteConfig?.seo?.googleRatingValue
  );
  const finalAvg =
    Number.isFinite(configuredAvg) && configuredAvg >= 1 && configuredAvg <= 5
      ? configuredAvg
      : computedAvg;

  const configuredCount = Number(
    siteConfig?.gbpReviewCount ?? siteConfig?.seo?.googleTotalReviews
  );
  const reviewCount =
    Number.isFinite(configuredCount) && configuredCount >= effectiveReviews.length
      ? Math.round(configuredCount)
      : effectiveReviews.length;

  const ratingValueDot = finalAvg.toFixed(1);
  const ratingValueComma = ratingValueDot.replace(".", ",");

  return {
    ratingValue: ratingValueDot,
    ratingDisplayPtBr: ratingValueComma,
    reviewCount,
    reviews: effectiveReviews,
  };
}

const KNOWN_INTERNAL_EXACT_PATHS = new Set([
  "/login",
  "/portaria",
  "/tablet",
  "/recepcao",
  "/reception",
  "/painel-aovivo",
  "/live-ops",
  "/aovivo",
  "/avaliacoes-ia",
  "/reviews-ia",
  "/garagem",
  "/estacionamento",
  "/dashboard",
  "/lista-compras",
  "/compras",
  "/extrato",
  "/meu-extrato",
  "/fechamento",
  "/tasks",
  "/tarefas",
  "/achados",
  "/achados-perdidos",
  "/lost-and-found",
  "/observations",
  "/ocorrencias",
  "/avarias",
  "/reports",
  "/relatorios",
  "/relatorios-reservas",
  "/pms-reports",
  "/history",
  "/historico",
  "/equipe",
  "/usuarios",
  "/team",
  "/rh",
  "/colaboradores",
  "/funcionarios",
  "/recursos-humanos",
  "/gestao-rh",
  "/ponto",
  "/bater-ponto",
  "/terminal-ponto",
  "/registro-ponto",
  "/jornada",
  "/jornada-reservas",
  "/fluxo-reservas",
  "/mapa-jornada",
  "/emails",
  "/email-hub",
  "/gerenciador-emails",
  "/whatsapp",
  "/whatsapp-chat",
  "/chat-whatsapp",
  "/whatsapp-web",
  "/chat",
  "/whatsapp-automation",
  "/automacao-whatsapp",
  "/automacoes-camareiras",
  "/camareiras-whatsapp",
  "/governanca-whatsapp",
  "/disparo-inteligente",
  "/broadcast",
  "/campanhas-whatsapp",
  "/zapi",
  "/conexao-zapi",
  "/notificacoes",
  "/notifications",
  "/alertas",
  "/pedidos-cafe",
  "/historico-cafe",
  "/insights-cafe",
  "/reservas",
  "/pms-calendar",
  "/crm",
  "/guests",
  "/hospedes",
  "/pagamentos",
  "/payments",
  "/recebiveis",
  "/taxas",
  "/financeiro",
  "/financial",
  "/precificacao",
  "/precificacao-sebrae",
  "/finance",
  "/funil-vendas",
  "/trafego",
  "/marketing",
  "/ads",
  "/notas",
  "/nfse",
  "/invoices",
  "/surveys",
  "/vistorias",
  "/propriedade",
  "/hotel",
  "/regras",
  "/settings",
  "/configuracoes",
  "/configuracao",
  "/ajustes",
  "/editor-site",
  "/configurar-site",
  "/personalizar-site",
  "/site-editor",
  "/cms",
  "/tarifas",
  "/gestao-tarifas",
  "/tabela-tarifas",
  "/precos",
  "/logs",
  "/auditoria",
  "/system-logs",
  "/audit",
  "/ia-status",
  "/ai-status",
  "/status-ia",
  "/monitor-servidor",
  "/servidor",
  "/server-monitor",
  "/raio-x",
  "/raio-x-flats",
  "/diario-flats",
  "/hub-manutencao",
  "/prontuario-flats",
  "/servicos",
  "/service-orders",
  "/caixa-entrada-ota",
  "/ota-inbox",
  "/quarentena",
  "/ajuda-wbp",
  "/ajuda-channex",
  "/frigobar",
  "/frigobar-admin",
  "/frigobar-notas",
  "/notas-frigobar",
  "/frigobar-reposicao",
  "/frigobar-gestao",
  "/minibar-admin",
  "/anserve",
  "/minha-conta",
  "/minhaconta",
  "/perfil",
  "/my-account",
  "/minha-reserva",
  "/portal-hospede",
  "/guest-portal",
  "/portal",
  "/pre-checkin",
  "/checkin",
  "/credenciamento",
  "/credenciamento-hospede",
  "/identificar",
  "/identificar-reserva",
  "/cadastro-hospede",
  "/checkout",
  "/check-out",
  "/saida",
  "/cafe",
  "/cafe-da-manha",
  "/breakfast",
  "/avaliar",
  "/google-review",
]);

const KNOWN_INTERNAL_PREFIXES = [
  "/minha-reserva/",
  "/portal-hospede/",
  "/guest-portal/",
  "/portal/",
  "/pre-checkin/",
  "/checkin/",
  "/credenciamento/",
  "/credenciamento-hospede/",
  "/identificar/",
  "/identificar-reserva/",
  "/cadastro-hospede/",
  "/checkout/",
  "/check-out/",
  "/saida/",
  "/cafe/",
  "/cafe-da-manha/",
  "/breakfast/",
  "/frigobar/",
  "/minibar/",
  "/anserve/",
  "/verificar-ficha/",
  "/servico/",
  "/service/",
  "/manutencao/",
  "/faz-tudo/",
  "/preview/",
  "/admin/",
  "/sistema/",
  "/copiar-pix",
  "/pix/",
  "/copiar-boleto",
  "/boleto/",
  "/avaliar/",
  "/google-review/",
];

const GUEST_TRANSLATABLE_PORTAL_PREFIXES = [
  "/minha-reserva",
  "/portal-hospede",
  "/guest-portal",
  "/portal",
  "/pre-checkin",
  "/checkin",
  "/credenciamento",
  "/identificar",
  "/cadastro-hospede",
  "/checkout",
  "/check-out",
  "/saida",
  "/cafe",
  "/breakfast",
  "/frigobar/flat/",
  "/minibar/",
  "/minha-conta",
  "/minhaconta",
  "/perfil",
  "/my-account",
];

function isGuestTranslatablePortalPath(cleanLowerPath) {
  if (
    cleanLowerPath.startsWith("/frigobar-reposicao") ||
    cleanLowerPath.startsWith("/frigobar-admin") ||
    cleanLowerPath.startsWith("/frigobar-notas") ||
    cleanLowerPath.startsWith("/frigobar-gestao") ||
    cleanLowerPath === "/frigobar"
  ) {
    return false;
  }
  if (/^\/frigobar\/[a-z0-9_-]+$/i.test(cleanLowerPath)) {
    return true;
  }
  return GUEST_TRANSLATABLE_PORTAL_PREFIXES.some(
    (p) => cleanLowerPath === p || cleanLowerPath.startsWith(p.endsWith("/") ? p : `${p}/`)
  );
}

function isKnownOperationalSpaRoute(cleanLowerPath) {
  if (KNOWN_INTERNAL_EXACT_PATHS.has(cleanLowerPath)) return true;
  return KNOWN_INTERNAL_PREFIXES.some((prefix) => cleanLowerPath.startsWith(prefix));
}

export function resolveSpaSeoPolicy(req, db = {}, options = {}) {
  const rawOriginalUrl = String(req?.originalUrl || req?.url || req?.path || "/");
  const qIndex = rawOriginalUrl.indexOf("?");
  const rawPathname = qIndex >= 0 ? rawOriginalUrl.slice(0, qIndex) : rawOriginalUrl;
  const rawSearch = qIndex >= 0 ? rawOriginalUrl.slice(qIndex) : "";
  const cleanPath = normalizePathname(rawPathname);
  const cleanLowerPath = cleanPath.toLowerCase();
  const isEditMode = String(req?.query?.edit || "").toLowerCase() === "true";

  // 1. Canonicalização de Host em Produção (www.corpflats.com.br ou *.onrender.com -> https://corpflats.com.br)
  const hostname = String(req?.hostname || req?.headers?.host || "")
    .split(":")[0]
    .toLowerCase()
    .trim();
  if (
    process.env.NODE_ENV === "production" &&
    (hostname === "www.corpflats.com.br" || hostname.endsWith(".onrender.com"))
  ) {
    return {
      category: "REDIRECT_HOST",
      httpStatus: 301,
      httpRedirectUrl: `${OFFICIAL_ORIGIN}${rawPathname || "/"}${rawSearch}`,
      isIndexable: false,
    };
  }

  // 2. Categoria B: Legados /reservar e /booking
  // Preserva preview do CMS (?edit=true) como 200 noindex; demais casos fazem 301 para / preservando UTMs/gclid/fbclid/datas
  if (cleanLowerPath === "/reservar" || cleanLowerPath === "/booking") {
    if (isEditMode) {
      const homeSpec = getServerSeoPageSpec("home", db?.siteConfig);
      return {
        category: "C_CMS_PREVIEW",
        httpStatus: 200,
        httpRedirectUrl: null,
        isIndexable: false,
        robotsDirective: "noindex, nofollow, noarchive",
        canonicalUrl: homeSpec.canonicalUrl,
        allowClientTranslation: true,
        isPublicMarketingRoute: false,
        routeSpec: homeSpec,
      };
    }
    return {
      category: "B",
      httpStatus: 301,
      httpRedirectUrl: `/${rawSearch}`,
      isIndexable: false,
    };
  }

  // 3. Normalização de barra final (trailing slash) ou maiúsculas nas 4 LPs públicas
  if (cleanLowerPath !== "/" && isPublicIndexablePath(cleanLowerPath)) {
    if (rawPathname !== cleanLowerPath) {
      return {
        category: "REDIRECT_CANONICAL_PATH",
        httpStatus: 301,
        httpRedirectUrl: `${cleanLowerPath}${rawSearch}`,
        isIndexable: false,
      };
    }
  }

  // 4. Categoria A: As 5 Páginas Públicas Canônicas Indexáveis
  if (isPublicIndexablePath(cleanLowerPath)) {
    const spec = getServerSeoPageSpec(cleanLowerPath, db?.siteConfig);
    if (isEditMode) {
      return {
        category: "C_CMS_PREVIEW",
        httpStatus: 200,
        httpRedirectUrl: null,
        isIndexable: false,
        robotsDirective: "noindex, nofollow, noarchive",
        canonicalUrl: spec.canonicalUrl,
        allowClientTranslation: true,
        isPublicMarketingRoute: false,
        routeSpec: spec,
        title: spec.title,
        desc: spec.metaDescription,
        image: spec.ogImageUrl,
        imageAlt: spec.heroImageAlt,
        pageUrl: spec.canonicalUrl,
      };
    }

    return {
      category: "A",
      httpStatus: 200,
      httpRedirectUrl: null,
      isIndexable: true,
      robotsDirective:
        "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      canonicalUrl: spec.canonicalUrl,
      allowClientTranslation: true,
      isPublicMarketingRoute: true,
      routeSpec: spec,
      title: spec.title,
      desc: spec.metaDescription,
      image: spec.ogImageUrl,
      imageAlt: spec.heroImageAlt,
      pageUrl: spec.canonicalUrl,
    };
  }

  // 5. Categoria C: Rotas Operacionais, Portais de Token do Hóspede e Painéis Internos (200 + noindex)
  if (isKnownOperationalSpaRoute(cleanLowerPath)) {
    const foundRes = options?.foundReservation || null;
    const isPortalPath =
      cleanLowerPath.startsWith("/minha-reserva/") ||
      cleanLowerPath.startsWith("/portal-hospede/");
    const resChannel = String(foundRes?.channel || foundRes?.source || "")
      .toLowerCase()
      .trim();
    const isDirectPaidUntrackedPortal = Boolean(
      isPortalPath &&
        foundRes &&
        (resChannel === "site_direto" ||
          resChannel === "site" ||
          resChannel === "website" ||
          Boolean(foundRes.attribution?.purchaseEventId || foundRes.attribution?.gclid || foundRes.attribution?.fbclid)) &&
        (foundRes.paymentStatus === "pago_total" || foundRes.paymentStatus === "pago") &&
        !foundRes.clientPurchaseTrackedAt
    );

    return {
      category: "C",
      httpStatus: 200,
      httpRedirectUrl: null,
      isIndexable: false,
      robotsDirective: "noindex, nofollow, noarchive",
      canonicalUrl: null,
      allowClientTranslation: isGuestTranslatablePortalPath(cleanLowerPath),
      isPublicMarketingRoute: isDirectPaidUntrackedPortal,
      routeSpec: null,
    };
  }

  // 6. Categoria D: URL Desconhecida -> HTTP 404 Real + noindex (elimina Soft 404 no Search Console)
  return {
    category: "D",
    httpStatus: 404,
    httpRedirectUrl: null,
    isIndexable: false,
    robotsDirective: "noindex, nofollow",
    canonicalUrl: null,
    allowClientTranslation: false,
    isPublicMarketingRoute: false,
    routeSpec: null,
    title: "Página Não Encontrada (404) • CorpFlats",
    desc: "A página solicitada não existe. Acesse corpflats.com.br para consultar disponibilidade e reservar com Menor Preço Garantido + 5% OFF no PIX.",
  };
}

function resolveSeoPricingSummary(db = {}, explicitPricing = null) {
  if (explicitPricing && typeof explicitPricing === "object") {
    return explicitPricing;
  }
  const siteCfg = db?.siteConfig || {};
  const rawRoomOnly = Number(siteCfg?.ratePlans?.room_only?.dailyRate) || 216.49;
  const rawWithBf = Number(siteCfg?.ratePlans?.with_breakfast?.dailyRate) || 236.49;
  const pixDiscountPct = Number(siteCfg?.pricing?.pixDiscountPercent ?? 5) || 5;
  const roomOnlyPix = Math.round(rawRoomOnly * 100) / 100;
  const withBfPix = Math.round(rawWithBf * 100) / 100;
  const validUntilDate = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);

  return {
    roomOnlyPix,
    withBfPix,
    pixDiscountPct,
    priceValidUntil: validUntilDate,
    lowPrice: Math.min(roomOnlyPix, withBfPix),
    highPrice: Math.max(withBfPix, Math.round(withBfPix * 1.25)),
  };
}

export function buildPublicSeoJsonLdGraph(routeSpec, db = {}, explicitPricing = null) {
  const spec = routeSpec || PUBLIC_SEO_PAGES_CATALOG.home;
  const reviewStats = computeCoherentReviewStats(db?.siteConfig);
  const pricing = resolveSeoPricingSummary(db, explicitPricing);

  const galleryPhotos = [
    `${OFFICIAL_ORIGIN}/photos/soho/hero-jacuzzi-cobertura.jpg`,
    `${OFFICIAL_ORIGIN}/photos/soho/01-quarto-bancada.jpg`,
    `${OFFICIAL_ORIGIN}/photos/soho/02-flat-integrado.jpg`,
    `${OFFICIAL_ORIGIN}/photos/soho/04-cozinha-equipada.jpg`,
    `${OFFICIAL_ORIGIN}/photos/soho/06-cobertura-jacuzzi.jpg`,
    `${OFFICIAL_ORIGIN}/photos/soho/08-spa-saunas.jpg`,
    `${OFFICIAL_ORIGIN}/photos/soho/09-academia.jpg`,
    `${OFFICIAL_ORIGIN}/photos/soho/12-fachada-garagem.jpg`,
    `${OFFICIAL_ORIGIN}/photos/soho/cafe-mesa-quarto.jpg`,
  ];

  const breadcrumbItems = [
    {
      "@type": "ListItem",
      position: 1,
      name: "CorpFlats Campos",
      item: `${OFFICIAL_ORIGIN}/`,
    },
  ];
  if (spec.path !== "/") {
    breadcrumbItems.push({
      "@type": "ListItem",
      position: 2,
      name: spec.breadcrumbLabel,
      item: spec.canonicalUrl,
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${OFFICIAL_ORIGIN}/#website`,
        url: `${OFFICIAL_ORIGIN}/`,
        name: HOTEL_OFFICIAL_IDENTITY.brandName,
        alternateName: HOTEL_OFFICIAL_IDENTITY.fullName,
        inLanguage: "pt-BR",
      },
      {
        "@type": ["LodgingBusiness", "Hotel"],
        "@id": `${OFFICIAL_ORIGIN}/#lodging`,
        name: HOTEL_OFFICIAL_IDENTITY.fullName,
        alternateName: "CorpFlats Campos dos Goytacazes",
        legalName: HOTEL_OFFICIAL_IDENTITY.legalName,
        taxID: HOTEL_OFFICIAL_IDENTITY.cnpj,
        description: spec.metaDescription,
        url: `${OFFICIAL_ORIGIN}/`,
        telephone: HOTEL_OFFICIAL_IDENTITY.telephoneSchema,
        email: HOTEL_OFFICIAL_IDENTITY.email,
        priceRange: `R$ ${Math.floor(pricing.lowPrice)} - R$ ${Math.ceil(pricing.highPrice)}`,
        currenciesAccepted: "BRL",
        paymentAccepted: "PIX, Cartão de Crédito",
        checkinTime: "14:00:00",
        checkoutTime: "12:00:00",
        numberOfRooms: HOTEL_OFFICIAL_IDENTITY.numberOfRooms,
        petsAllowed: true,
        image: [spec.ogImageUrl, ...galleryPhotos.filter((u) => u !== spec.ogImageUrl)],
        logo: `${OFFICIAL_ORIGIN}/favicon.svg`,
        address: {
          "@type": "PostalAddress",
          streetAddress: HOTEL_OFFICIAL_IDENTITY.streetAddress,
          addressLocality: HOTEL_OFFICIAL_IDENTITY.addressLocality,
          addressRegion: HOTEL_OFFICIAL_IDENTITY.addressRegion,
          postalCode: HOTEL_OFFICIAL_IDENTITY.postalCode,
          addressCountry: HOTEL_OFFICIAL_IDENTITY.addressCountry,
        },
        geo: {
          "@type": "GeoCoordinates",
          latitude: HOTEL_OFFICIAL_IDENTITY.latitude,
          longitude: HOTEL_OFFICIAL_IDENTITY.longitude,
        },
        hasMap: HOTEL_OFFICIAL_IDENTITY.googleMapsUrl,
        sameAs: [
          HOTEL_OFFICIAL_IDENTITY.instagramUrl,
          HOTEL_OFFICIAL_IDENTITY.googleMapsUrl,
        ],
        amenityFeature: [
          { "@type": "LocationFeatureSpecification", name: "1 vaga de garagem coberta inclusa", value: true },
          { "@type": "LocationFeatureSpecification", name: "Recepção 24 horas com cartão NFC", value: true },
          { "@type": "LocationFeatureSpecification", name: "Jacuzzi aquecida na cobertura (06h às 22h)", value: true },
          { "@type": "LocationFeatureSpecification", name: "Saunas seca e a vapor", value: true },
          { "@type": "LocationFeatureSpecification", name: "Academia climatizada", value: true },
          { "@type": "LocationFeatureSpecification", name: "Wi-Fi individual dedicado por flat", value: true },
          { "@type": "LocationFeatureSpecification", name: "Bancada de trabalho para notebook", value: true },
          { "@type": "LocationFeatureSpecification", name: "Cozinha compacta com cooktop 2 bocas, frigobar, cafeteira e sanduicheira", value: true },
          { "@type": "LocationFeatureSpecification", name: "Café da manhã servido no apartamento (05:00 às 09:30)", value: true },
          { "@type": "LocationFeatureSpecification", name: "Emissão automática de Nota Fiscal NFS-e Nacional", value: true },
          { "@type": "LocationFeatureSpecification", name: "Pet Friendly (até 2 cães de pequeno porte até 10kg)", value: true },
          { "@type": "LocationFeatureSpecification", name: "Piscina tradicional", value: false },
          { "@type": "LocationFeatureSpecification", name: "Micro-ondas no quarto", value: false },
        ],
        containsPlace: {
          "@type": ["HotelRoom", "Suite"],
          name: "Flat Executivo Mobiliado — Padrão Soho Residence",
          description:
            "Apartamento completo climatizado com cama de casal (ou 2 de solteiro sob solicitação), bancada de trabalho, Wi-Fi exclusivo, Smart TV, cortina blecaute e cozinha equipada.",
          occupancy: {
            "@type": "QuantitativeValue",
            minValue: 1,
            maxValue: 2,
          },
          bed: [
            { "@type": "BedDetails", typeOfBed: "Cama de Casal", numberOfBeds: 1 },
            { "@type": "BedDetails", typeOfBed: "Camas de Solteiro (sob solicitação)", numberOfBeds: 2 },
          ],
        },
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: reviewStats.ratingValue,
          bestRating: "5",
          worstRating: "1",
          reviewCount: String(reviewStats.reviewCount),
        },
        review: reviewStats.reviews.slice(0, 6).map((t) => ({
          "@type": "Review",
          author: {
            "@type": "Person",
            name: String(t.name || "Hóspede Verificado"),
          },
          reviewRating: {
            "@type": "Rating",
            ratingValue: String(Number(t.rating ?? 5)),
            bestRating: "5",
          },
          reviewBody: String(t.comment || ""),
        })),
        makesOffer: [
          {
            "@type": "Offer",
            name: `Tarifa Oficial Direta (5% OFF no PIX) — Apenas Hospedagem`,
            description:
              "Menor Preço Garantido no Site Oficial + 5% OFF no PIX + 1 vaga de garagem coberta inclusa + cancelamento grátis até 24h antes do check-in + NFS-e automática.",
            priceCurrency: "BRL",
            price: pricing.roomOnlyPix.toFixed(2),
            priceValidUntil: pricing.priceValidUntil,
            availability: "https://schema.org/InStock",
            url: spec.canonicalUrl,
          },
          {
            "@type": "Offer",
            name: `Tarifa Oficial Direta (5% OFF no PIX) — Com Café da Manhã no Flat`,
            description:
              "Diária com café da manhã entregue no apartamento (05:00 às 09:30), isenção de taxa de limpeza, 1 vaga de garagem coberta inclusa, cancelamento grátis até 24h e NFS-e automática.",
            priceCurrency: "BRL",
            price: pricing.withBfPix.toFixed(2),
            priceValidUntil: pricing.priceValidUntil,
            availability: "https://schema.org/InStock",
            url: spec.canonicalUrl,
          },
        ],
        potentialAction: {
          "@type": "ReserveAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${spec.canonicalUrl}#reserva-rapida`,
            inLanguage: "pt-BR",
            actionPlatform: [
              "http://schema.org/DesktopWebPlatform",
              "http://schema.org/MobileWebPlatform",
            ],
          },
          result: {
            "@type": "LodgingReservation",
            name: "Reserva Direta Oficial CorpFlats",
          },
        },
      },
      {
        "@type": "WebPage",
        "@id": `${spec.canonicalUrl}#webpage`,
        url: spec.canonicalUrl,
        name: spec.title,
        description: spec.metaDescription,
        inLanguage: "pt-BR",
        isPartOf: { "@id": `${OFFICIAL_ORIGIN}/#website` },
        about: { "@id": `${OFFICIAL_ORIGIN}/#lodging` },
        breadcrumb: { "@id": `${spec.canonicalUrl}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${spec.canonicalUrl}#breadcrumb`,
        itemListElement: breadcrumbItems,
      },
      {
        "@type": "FAQPage",
        "@id": `${spec.canonicalUrl}#faq`,
        mainEntity: (spec.faqs || []).map((item) => ({
          "@type": "Question",
          name: String(item.q || ""),
          acceptedAnswer: {
            "@type": "Answer",
            text: String(item.a || ""),
          },
        })),
      },
    ],
  };
}

export function buildSsrSemanticSnapshotHtml(routeSpec, db = {}, explicitPricing = null) {
  const spec = routeSpec || PUBLIC_SEO_PAGES_CATALOG.home;
  const reviewStats = computeCoherentReviewStats(db?.siteConfig);
  const pricing = resolveSeoPricingSummary(db, explicitPricing);
  const heroBase = escapeHtml(spec.heroImageBase);

  const pillarsHtml = (spec.valuePillars || [])
    .map(
      (p) =>
        `<article style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;">` +
        `<h3 style="font-size:1rem;font-weight:600;color:#F8FAFC;margin:0 0 6px 0;">${escapeHtml(p.title)}</h3>` +
        `<p style="font-size:0.9rem;line-height:1.55;color:#CBD5E1;margin:0;">${escapeHtml(p.description)}</p>` +
        `</article>`
    )
    .join("");

  const distancesHtml = HYPERLOCAL_DISTANCE_GROUPS.map(
    (grp) =>
      `<div style="margin-bottom:14px;">` +
      `<h3 style="font-size:0.95rem;font-weight:600;color:#E2E8F0;margin:0 0 6px 0;">${escapeHtml(grp.category)}</h3>` +
      `<ul style="margin:0;padding-left:18px;color:#CBD5E1;font-size:0.88rem;line-height:1.6;">` +
      grp.items
        .map(
          (it) =>
            `<li><strong>${escapeHtml(it.place)}</strong>: ${escapeHtml(it.distance)} (${escapeHtml(it.note)})</li>`
        )
        .join("") +
      `</ul></div>`
  ).join("");

  const reviewsHtml = reviewStats.reviews
    .slice(0, 6)
    .map(
      (r) =>
        `<blockquote style="margin:0;padding:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;">` +
        `<p style="margin:0 0 8px 0;font-size:0.88rem;line-height:1.55;color:#E2E8F0;">“${escapeHtml(r.comment)}”</p>` +
        `<footer style="font-size:0.8rem;color:#94A3B8;">— <strong>${escapeHtml(r.name)}</strong> (${Number(r.rating ?? 5)}★ no Google)</footer>` +
        `</blockquote>`
    )
    .join("");

  const faqsHtml = (spec.faqs || [])
    .map(
      (f) =>
        `<details open style="margin-bottom:10px;padding:12px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;">` +
        `<summary style="font-weight:600;color:#F8FAFC;cursor:pointer;">${escapeHtml(f.q)}</summary>` +
        `<p style="margin:8px 0 0 0;font-size:0.88rem;line-height:1.6;color:#CBD5E1;">${escapeHtml(f.a)}</p>` +
        `</details>`
    )
    .join("");

  const internalNavLinksHtml = PUBLIC_SEO_SLUGS.map((slug) => {
    const item = PUBLIC_SEO_PAGES_CATALOG[slug];
    return `<li style="display:inline-block;margin:0 12px 6px 0;"><a href="${escapeHtml(item.path)}" style="color:#E2C275;text-decoration:underline;">${escapeHtml(item.breadcrumbLabel)}</a></li>`;
  }).join("");

  const breadcrumbHtml =
    spec.path !== "/"
      ? `<nav aria-label="Breadcrumb" style="font-size:0.82rem;color:#94A3B8;margin-bottom:12px;">` +
        `<a href="/" style="color:#E2C275;text-decoration:none;">CorpFlats Campos</a>` +
        ` <span aria-hidden="true">›</span> ` +
        `<span>${escapeHtml(spec.breadcrumbLabel)}</span>` +
        `</nav>`
      : "";

  return (
    `<main id="ssr-seo-snapshot" data-seo-route="${escapeHtml(spec.slug)}" style="min-height:100vh;background:#091E26;color:#F8FAFC;font-family:Inter,system-ui,-apple-system,sans-serif;">` +
    `<div style="max-width:1120px;margin:0 auto;padding:28px 20px 56px 20px;">` +
    breadcrumbHtml +
    `<header style="margin-bottom:28px;">` +
    `<p style="font-size:0.82rem;font-weight:600;color:#E2C275;margin:0 0 8px 0;">${escapeHtml(spec.badgeTop)}</p>` +
    `<h1 style="font-size:clamp(1.75rem,3.5vw,2.6rem);font-weight:700;line-height:1.18;margin:0 0 12px 0;color:#FFFFFF;">${escapeHtml(spec.h1)}</h1>` +
    `<p style="font-size:1rem;line-height:1.6;color:#CBD5E1;max-width:780px;margin:0 0 18px 0;">${escapeHtml(spec.subtitle)}</p>` +
    `<p style="font-size:0.92rem;color:#A7F3D0;margin:0 0 18px 0;">` +
    `<strong>Oferta Direta Oficial:</strong> diárias a partir de <span translate="no">R$ ${pricing.roomOnlyPix.toFixed(2).replace(".", ",")}</span> (Sem Café) ou <span translate="no">R$ ${pricing.withBfPix.toFixed(2).replace(".", ",")}</span> (Com Café no Flat) com <strong>5% OFF no PIX</strong>, 1 vaga de garagem coberta inclusa, cancelamento grátis até 24h e NFS-e Nacional automática.` +
    `</p>` +
    `<picture>` +
    `<source type="image/avif" srcset="/photos/soho/${heroBase}-640w.avif 640w, /photos/soho/${heroBase}-1024w.avif 1024w, /photos/soho/${heroBase}-1600w.avif 1600w" sizes="(max-width: 1023px) 100vw, 66vw" />` +
    `<source type="image/webp" srcset="/photos/soho/${heroBase}-640w.webp 640w, /photos/soho/${heroBase}-1024w.webp 1024w, /photos/soho/${heroBase}-1600w.webp 1600w" sizes="(max-width: 1023px) 100vw, 66vw" />` +
    `<img src="${escapeHtml(spec.heroImageUrl)}" alt="${escapeHtml(spec.heroImageAlt)}" width="1600" height="1066" fetchpriority="high" decoding="async" style="width:100%;max-height:460px;object-fit:cover;border-radius:16px;border:1px solid rgba(255,255,255,0.12);" />` +
    `</picture>` +
    `</header>` +
    `<section aria-labelledby="ssr-sec-pillars" style="margin-bottom:32px;">` +
    `<h2 id="ssr-sec-pillars" style="font-size:1.35rem;font-weight:700;margin:0 0 8px 0;color:#FFFFFF;">${escapeHtml(spec.sectionHeading)}</h2>` +
    `<p style="font-size:0.95rem;line-height:1.6;color:#CBD5E1;margin:0 0 16px 0;">${escapeHtml(spec.sectionSubtitle)}</p>` +
    `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;">${pillarsHtml}</div>` +
    `</section>` +
    `<section aria-labelledby="ssr-sec-location" style="margin-bottom:32px;">` +
    `<h2 id="ssr-sec-location" style="font-size:1.3rem;font-weight:700;margin:0 0 10px 0;color:#FFFFFF;">Localização Estratégica na Rua Conselheiro Otaviano, 209 — Centro de Campos/RJ</h2>` +
    `<p style="font-size:0.92rem;line-height:1.6;color:#CBD5E1;margin:0 0 14px 0;">As 19 unidades da CorpFlats ficam no Edifício Soho Residence Service (CEP 28010-140), combinando mobilidade imediata no Centro de Campos dos Goytacazes com 1 vaga de garagem coberta inclusa e recepção 24 horas.</p>` +
    distancesHtml +
    `</section>` +
    `<section id="avaliacoes" aria-labelledby="ssr-sec-reviews" style="margin-bottom:32px;">` +
    `<h2 id="ssr-sec-reviews" style="font-size:1.3rem;font-weight:700;margin:0 0 12px 0;color:#FFFFFF;">Avaliações Reais de Hóspedes no Google (${reviewStats.ratingDisplayPtBr} ★ em ${reviewStats.reviewCount} avaliações verificadas)</h2>` +
    `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">${reviewsHtml}</div>` +
    `</section>` +
    `<section aria-labelledby="ssr-sec-faq" style="margin-bottom:32px;">` +
    `<h2 id="ssr-sec-faq" style="font-size:1.3rem;font-weight:700;margin:0 0 12px 0;color:#FFFFFF;">Dúvidas Frequentes sobre Reserva Direta e Estadia</h2>` +
    faqsHtml +
    `</section>` +
    `<footer style="border-top:1px solid rgba(255,255,255,0.12);padding-top:20px;font-size:0.86rem;color:#94A3B8;line-height:1.6;">` +
    `<nav aria-label="Páginas Oficiais CorpFlats" style="margin-bottom:12px;"><ul style="list-style:none;padding:0;margin:0;">${internalNavLinksHtml}</ul></nav>` +
    `<address style="font-style:normal;">` +
    `<strong>${escapeHtml(HOTEL_OFFICIAL_IDENTITY.fullName)}</strong> • CNPJ <span translate="no">${escapeHtml(HOTEL_OFFICIAL_IDENTITY.cnpj)}</span><br/>` +
    `${escapeHtml(HOTEL_OFFICIAL_IDENTITY.fullAddressDisplay)}<br/>` +
    `Telefone / WhatsApp 24h: <a href="https://wa.me/${HOTEL_OFFICIAL_IDENTITY.whatsappDigits}" style="color:#E2C275;">${escapeHtml(HOTEL_OFFICIAL_IDENTITY.telephoneDisplay)}</a> • E-mail: <a href="mailto:${HOTEL_OFFICIAL_IDENTITY.email}" style="color:#E2C275;">${escapeHtml(HOTEL_OFFICIAL_IDENTITY.email)}</a> • <a href="${escapeHtml(HOTEL_OFFICIAL_IDENTITY.googleMapsUrl)}" style="color:#E2C275;">Ver no Google Maps</a>` +
    `</address>` +
    `</footer>` +
    `</div>` +
    `</main>`
  );
}

export function buildSeoHeadExtraHtml(seoPolicy, db = {}, options = {}) {
  const chunks = [];

  if (seoPolicy?.isIndexable && seoPolicy.routeSpec) {
    const heroBase = escapeHtml(seoPolicy.routeSpec.heroImageBase);
    chunks.push(
      `<link rel="preload" as="image" type="image/avif" imagesrcset="/photos/soho/${heroBase}-640w.avif 640w, /photos/soho/${heroBase}-1024w.avif 1024w, /photos/soho/${heroBase}-1600w.avif 1600w" imagesizes="(max-width: 1023px) 100vw, 66vw" fetchpriority="high" />`
    );

    const jsonLdGraph = buildPublicSeoJsonLdGraph(
      seoPolicy.routeSpec,
      db,
      options?.pricingSummary || null
    );
    const safeJsonLd = JSON.stringify(jsonLdGraph).replace(/</g, "\\u003c");
    chunks.push(`<script type="application/ld+json">${safeJsonLd}</script>`);
  }

  if (options?.trackingHeadStubHtml) {
    chunks.push(String(options.trackingHeadStubHtml).trim());
  }

  return chunks.filter(Boolean).join("\n    ");
}

const SITEMAP_SHARED_GALLERY_IMAGES = [
  {
    loc: `${OFFICIAL_ORIGIN}/photos/soho/hero-jacuzzi-cobertura.jpg`,
    title: "Jacuzzi aquecida na cobertura do Edifício Soho Residence — CorpFlats Campos/RJ",
  },
  {
    loc: `${OFFICIAL_ORIGIN}/photos/soho/01-quarto-bancada.jpg`,
    title: "Flat executivo com cama de casal e bancada de trabalho — CorpFlats Soho",
  },
  {
    loc: `${OFFICIAL_ORIGIN}/photos/soho/02-flat-integrado.jpg`,
    title: "Ambiente integrado climatizado dos flats CorpFlats no Centro de Campos/RJ",
  },
  {
    loc: `${OFFICIAL_ORIGIN}/photos/soho/04-cozinha-equipada.jpg`,
    title: "Cozinha equipada com cooktop 2 bocas, frigobar, cafeteira e sanduicheira",
  },
  {
    loc: `${OFFICIAL_ORIGIN}/photos/soho/06-cobertura-jacuzzi.jpg`,
    title: "Deck panorâmico com hidromassagem na cobertura do Soho Residence",
  },
  {
    loc: `${OFFICIAL_ORIGIN}/photos/soho/08-spa-saunas.jpg`,
    title: "Saunas seca e a vapor liberadas para hóspedes das 06h às 22h",
  },
  {
    loc: `${OFFICIAL_ORIGIN}/photos/soho/09-academia.jpg`,
    title: "Academia climatizada no Edifício Soho Residence Service",
  },
  {
    loc: `${OFFICIAL_ORIGIN}/photos/soho/12-fachada-garagem.jpg`,
    title: "Fachada e entrada da garagem coberta inclusa na Rua Conselheiro Otaviano, 209",
  },
  {
    loc: `${OFFICIAL_ORIGIN}/photos/soho/cafe-mesa-quarto.jpg`,
    title: "Café da manhã servido diretamente no flat das 05:00 às 09:30",
  },
];

export function buildDynamicSitemapXml(db = {}) {
  const lastModDate = String(
    db?.siteConfig?.updatedAt || new Date().toISOString()
  ).slice(0, 10);

  const urlBlocks = PUBLIC_SEO_SLUGS.map((slug) => {
    const spec = getServerSeoPageSpec(slug, db?.siteConfig);
    const isHome = slug === "home";
    const priority = isHome ? "1.0" : "0.9";
    const changefreq = isHome ? "daily" : "weekly";

    const imagesForPage = isHome
      ? SITEMAP_SHARED_GALLERY_IMAGES
      : [
          {
            loc: spec.ogImageUrl,
            title: spec.heroImageAlt,
          },
          SITEMAP_SHARED_GALLERY_IMAGES[8],
          SITEMAP_SHARED_GALLERY_IMAGES[7],
        ];

    const seenImg = new Set();
    const imageNodes = imagesForPage
      .filter((img) => {
        if (!img?.loc || seenImg.has(img.loc)) return false;
        seenImg.add(img.loc);
        return true;
      })
      .map(
        (img) =>
          `    <image:image>\n` +
          `      <image:loc>${escapeHtml(img.loc)}</image:loc>\n` +
          `      <image:title>${escapeHtml(img.title)}</image:title>\n` +
          `    </image:image>`
      )
      .join("\n");

    return (
      `  <url>\n` +
      `    <loc>${escapeHtml(spec.canonicalUrl)}</loc>\n` +
      `    <lastmod>${escapeHtml(lastModDate)}</lastmod>\n` +
      `    <changefreq>${changefreq}</changefreq>\n` +
      `    <priority>${priority}</priority>\n` +
      `${imageNodes}\n` +
      `  </url>`
    );
  }).join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
    `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
    `${urlBlocks}\n` +
    `</urlset>\n`
  );
}

export const CANONICAL_ROBOTS_TXT = `# robots.txt oficial — CorpFlats (corpflats.com.br)
User-agent: *
Allow: /$
Allow: /hospedagem-corporativa-campos$
Allow: /fim-de-semana-campos$
Allow: /flat-centro-campos-rj$
Allow: /estadia-longa-campos$
Allow: /assets/
Allow: /photos/
Allow: /previews/
Allow: /api/public/contact.vcf

# Bloqueio estrito de rotas internas do ERP, PMS, portaria, tokens e pagamentos
Disallow: /api/
Disallow: /login
Disallow: /portaria
Disallow: /tablet
Disallow: /recepcao
Disallow: /reception
Disallow: /minha-reserva
Disallow: /portal-hospede
Disallow: /guest-portal
Disallow: /portal
Disallow: /pre-checkin
Disallow: /checkin
Disallow: /credenciamento
Disallow: /identificar
Disallow: /cadastro-hospede
Disallow: /checkout
Disallow: /check-out
Disallow: /saida
Disallow: /cafe
Disallow: /breakfast
Disallow: /frigobar
Disallow: /minibar
Disallow: /anserve
Disallow: /notas-frigobar
Disallow: /minha-conta
Disallow: /minhaconta
Disallow: /perfil
Disallow: /my-account
Disallow: /verificar-ficha
Disallow: /copiar-pix
Disallow: /pix
Disallow: /copiar-boleto
Disallow: /boleto
Disallow: /servico/
Disallow: /service/
Disallow: /manutencao/
Disallow: /faz-tudo/
Disallow: /ponto
Disallow: /bater-ponto
Disallow: /terminal-ponto
Disallow: /registro-ponto
Disallow: /preview/
Disallow: /admin/
Disallow: /painel-aovivo
Disallow: /avaliacoes-ia
Disallow: /garagem
Disallow: /estacionamento
Disallow: /dashboard
Disallow: /lista-compras
Disallow: /compras
Disallow: /extrato
Disallow: /meu-extrato
Disallow: /fechamento
Disallow: /tasks
Disallow: /tarefas
Disallow: /achados
Disallow: /lost-and-found
Disallow: /observations
Disallow: /ocorrencias
Disallow: /avarias
Disallow: /reports
Disallow: /relatorios
Disallow: /history
Disallow: /historico
Disallow: /equipe
Disallow: /usuarios
Disallow: /rh
Disallow: /colaboradores
Disallow: /funcionarios
Disallow: /jornada
Disallow: /emails
Disallow: /whatsapp
Disallow: /chat
Disallow: /automacoes-camareiras
Disallow: /zapi
Disallow: /sistema/
Disallow: /notificacoes
Disallow: /pedidos-cafe
Disallow: /reservas
Disallow: /pms-calendar
Disallow: /pms-reports
Disallow: /crm
Disallow: /guests
Disallow: /hospedes
Disallow: /pagamentos
Disallow: /payments
Disallow: /financeiro
Disallow: /financial
Disallow: /precificacao
Disallow: /funil-vendas
Disallow: /trafego
Disallow: /marketing
Disallow: /notas
Disallow: /nfse
Disallow: /surveys
Disallow: /vistorias
Disallow: /propriedade
Disallow: /settings
Disallow: /configuracoes
Disallow: /editor-site
Disallow: /tarifas
Disallow: /logs
Disallow: /auditoria
Disallow: /ia-status
Disallow: /monitor-servidor
Disallow: /raio-x
Disallow: /servicos
Disallow: /caixa-entrada-ota
Disallow: /quarentena
Disallow: /ajuda-wbp
Disallow: /ajuda-channex
Disallow: /apresentacao-anserve.html
Disallow: /manual/
Disallow: /*?edit=true*
Disallow: /*?token=*
Disallow: /*?requester=*

# Permissão explícita das páginas públicas para motores de busca de IA (GEO / AEO)
User-agent: OAI-SearchBot
Allow: /
Disallow: /api/
Disallow: /minha-reserva
Disallow: /pre-checkin
Disallow: /copiar-pix
Disallow: /copiar-boleto

User-agent: ChatGPT-User
Allow: /
Disallow: /api/
Disallow: /minha-reserva
Disallow: /pre-checkin
Disallow: /copiar-pix
Disallow: /copiar-boleto

User-agent: GPTBot
Allow: /
Disallow: /api/
Disallow: /minha-reserva
Disallow: /pre-checkin
Disallow: /copiar-pix
Disallow: /copiar-boleto

User-agent: PerplexityBot
Allow: /
Disallow: /api/
Disallow: /minha-reserva
Disallow: /pre-checkin
Disallow: /copiar-pix
Disallow: /copiar-boleto

User-agent: ClaudeBot
Allow: /
Disallow: /api/
Disallow: /minha-reserva
Disallow: /pre-checkin
Disallow: /copiar-pix
Disallow: /copiar-boleto

User-agent: Google-Extended
Allow: /

Sitemap: https://corpflats.com.br/sitemap.xml
`;

export function buildOfficialHotelVcard(db = {}) {
  const phoneDigits = String(
    db?.settings?.adminWhatsApp || HOTEL_OFFICIAL_IDENTITY.whatsappDigits
  ).replace(/\D/g, "");
  const e164Phone = phoneDigits.startsWith("55") ? `+${phoneDigits}` : `+55${phoneDigits}`;
  const email = String(
    db?.siteConfig?.branding?.contactEmail || HOTEL_OFFICIAL_IDENTITY.email
  ).trim();

  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "FN:CorpFlats Soho Campos (Reservas 24h)",
    "N:CorpFlats;Soho Campos;;;",
    "ORG:CorpFlats — Edifício Soho Residence Service",
    "TITLE:Reservas Diretas com Menor Preço + 5% OFF no PIX",
    `TEL;TYPE=CELL,VOICE,WORK,PREF:${e164Phone}`,
    `EMAIL;TYPE=INTERNET,WORK:${email}`,
    "ADR;TYPE=WORK:;;Rua Conselheiro Otaviano\\, 209 - Edifício Soho Residence Service;Campos dos Goytacazes;RJ;28010-140;Brasil",
    `URL:${OFFICIAL_ORIGIN}/?utm_source=vcard&utm_medium=saved_contact&utm_campaign=direct_vip`,
    "NOTE:Reserve direto pelo site oficial corpflats.com.br com Menor Preço Garantido\\, 5% OFF no PIX\\, 1 vaga de garagem coberta inclusa e emissão automática de NFS-e.",
    "END:VCARD",
    "",
  ].join("\r\n");
}

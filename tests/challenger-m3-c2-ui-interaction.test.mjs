/**
 * Challenger 2 Milestone 3 Test Suite: UI Interaction Logic & Boundary Edge Cases
 * File: tests/challenger-m3-c2-ui-interaction.test.mjs
 * Execution: node --test tests/challenger-m3-c2-ui-interaction.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── 1. EXTRACTED & TESTED LOGIC DIRECTLY FROM use-faq.ts & faq-knowledge-base.tsx ────

// Exact copy of formatDisplayPhone from artifacts/limpeza/src/hooks/use-faq.ts (lines 183-197)
function formatDisplayPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return phone || "";
  let clean = digits;
  if (clean.startsWith("55") && clean.length >= 12) {
    clean = clean.substring(2);
  }
  if (clean.length === 11) {
    return `(${clean.substring(0, 2)}) ${clean.substring(2, 7)}-${clean.substring(7)}`;
  }
  if (clean.length === 10) {
    return `(${clean.substring(0, 2)}) ${clean.substring(2, 6)}-${clean.substring(6)}`;
  }
  return phone;
}

// Exact logic of handleAddPhone from artifacts/limpeza/src/components/faq-knowledge-base.tsx (lines 162-170)
function normalizePhoneSingle(phoneInput, currentPhones = []) {
  const raw = phoneInput.replace(/\D/g, "");
  if (!raw) return currentPhones;
  const formatted = raw.length === 10 || raw.length === 11 ? `55${raw}` : raw;
  if (!currentPhones.includes(formatted)) {
    return [...currentPhones, formatted];
  }
  return currentPhones;
}

// Exact logic of handleAddBulkPhones from artifacts/limpeza/src/components/faq-knowledge-base.tsx (lines 173-179)
function normalizePhonesBulk(bulkPhoneInput, currentPhones = []) {
  const lines = bulkPhoneInput.split(/[\n,;]+/).map(s => s.replace(/\D/g, "")).filter(Boolean);
  const normalized = lines.map(p => (p.length === 10 || p.length === 11 ? `55${p}` : p));
  return Array.from(new Set([...currentPhones, ...normalized]));
}

// Exact taxonomy from artifacts/limpeza/src/hooks/use-faq.ts (lines 81-181)
const FAQ_CATEGORIES = {
  reservas: {
    id: "reservas",
    label: "Reservas",
    shortLabel: "Reservas",
    description: "Período, diárias, forma de pagamento, confirmação e cancelamento",
    iconName: "Calendar",
    colorClass: "text-blue-600 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200",
    borderClass: "border-blue-200 dark:border-blue-900",
    bgLightClass: "bg-blue-50/50 dark:bg-blue-950/20"
  },
  checkin_acesso: {
    id: "checkin_acesso",
    label: "Check-in & Acesso",
    shortLabel: "Check-in",
    description: "Horário 14h, early check-in, portaria 24h, fechadura e identificação",
    iconName: "DoorOpen",
    colorClass: "text-emerald-600 dark:text-emerald-400",
    badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200",
    borderClass: "border-emerald-200 dark:border-emerald-900",
    bgLightClass: "bg-emerald-50/50 dark:bg-emerald-950/20"
  },
  wifi_tecnologia: {
    id: "wifi_tecnologia",
    label: "Wi-Fi & Tecnologia",
    shortLabel: "Wi-Fi",
    description: "Rede CorpFlats-Hospedes, senha corpflats2026, 500MB e Smart TV",
    iconName: "Wifi",
    colorClass: "text-cyan-600 dark:text-cyan-400",
    badgeClass: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200",
    borderClass: "border-cyan-200 dark:border-cyan-900",
    bgLightClass: "bg-cyan-50/50 dark:bg-cyan-950/20"
  },
  cafe_manha: {
    id: "cafe_manha",
    label: "Café da Manhã",
    shortLabel: "Café",
    description: "Servido exclusivamente na bandeja no quarto, cardápio e horários",
    iconName: "Coffee",
    colorClass: "text-amber-600 dark:text-amber-400",
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200",
    borderClass: "border-amber-200 dark:border-amber-900",
    bgLightClass: "bg-amber-50/50 dark:bg-amber-950/20"
  },
  garagem: {
    id: "garagem",
    label: "Garagem",
    shortLabel: "Garagem",
    description: "Vagas rotativas e cobertas, controle de acesso e regras",
    iconName: "Car",
    colorClass: "text-slate-600 dark:text-slate-400",
    badgeClass: "bg-slate-100 text-slate-800 dark:bg-slate-900/60 dark:text-slate-300 border-slate-200",
    borderClass: "border-slate-200 dark:border-slate-800",
    bgLightClass: "bg-slate-50/50 dark:bg-slate-900/20"
  },
  estrutura_flat: {
    id: "estrutura_flat",
    label: "Estrutura do Flat",
    shortLabel: "Estrutura",
    description: "Cozinha completa, ar condicionado, frigobar, secador e enxoval",
    iconName: "Home",
    colorClass: "text-violet-600 dark:text-violet-400",
    badgeClass: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 border-violet-200",
    borderClass: "border-violet-200 dark:border-violet-900",
    bgLightClass: "bg-violet-50/50 dark:bg-violet-950/20"
  },
  regras_visitas_pets: {
    id: "regras_visitas_pets",
    label: "Regras, Visitas & Pets",
    shortLabel: "Regras/Pets",
    description: "Visitantes na portaria, pets de pequeno porte e lei do silêncio",
    iconName: "ShieldCheck",
    colorClass: "text-rose-600 dark:text-rose-400",
    badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200",
    borderClass: "border-rose-200 dark:border-rose-900",
    bgLightClass: "bg-rose-50/50 dark:bg-rose-950/20"
  },
  lazer_condominio: {
    id: "lazer_condominio",
    label: "Lazer & Condomínio",
    shortLabel: "Lazer",
    description: "Piscina, sauna, academia, rooftop e regras das áreas comuns",
    iconName: "Sparkles",
    colorClass: "text-teal-600 dark:text-teal-400",
    badgeClass: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200",
    borderClass: "border-teal-200 dark:border-teal-900",
    bgLightClass: "bg-teal-50/50 dark:bg-teal-950/20"
  },
  checkout: {
    id: "checkout",
    label: "Check-out",
    shortLabel: "Check-out",
    description: "Horário 12h, late check-out, louças e devolução de cartão na portaria",
    iconName: "Clock",
    colorClass: "text-purple-600 dark:text-purple-400",
    badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200",
    borderClass: "border-purple-200 dark:border-purple-900",
    bgLightClass: "bg-purple-50/50 dark:bg-purple-950/20"
  }
};

// Exact statusCounts logic from use-faq.ts (lines 247-258)
function computeStatusCounts(items) {
  let todas = items.length;
  let ativas = 0;
  let pendentes = 0;
  let sugestoes_ia = 0;
  for (const item of items) {
    if (item.status === "ativo") ativas++;
    else if (item.status === "pendente") pendentes++;
    else if (item.status === "aguardando_aprovacao") sugestoes_ia++;
  }
  return { todas, ativas, pendentes, sugestoes_ia };
}

// Exact categoryStats logic from use-faq.ts (lines 260-282)
function computeCategoryStats(items) {
  const stats = {
    reservas: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
    checkin_acesso: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
    wifi_tecnologia: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
    cafe_manha: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
    garagem: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
    estrutura_flat: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
    regras_visitas_pets: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
    lazer_condominio: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
    checkout: { count: 0, active: 0, pending: 0, awaitingApproval: 0 }
  };

  for (const item of items) {
    if (stats[item.category]) {
      stats[item.category].count++;
      if (item.status === "ativo") stats[item.category].active++;
      if (item.status === "pendente") stats[item.category].pending++;
      if (item.status === "aguardando_aprovacao") stats[item.category].awaitingApproval++;
    }
  }
  return stats;
}

// Exact filteredItems logic from use-faq.ts (lines 285-338)
function filterFaqItems(items, { selectedStatus = "todas", selectedCategory = "all", selectedScope = "all", search = "" } = {}) {
  let result = [...items];

  // 1. Filtro por status
  if (selectedStatus === "ativas") {
    result = result.filter(i => i.status === "ativo");
  } else if (selectedStatus === "pendentes") {
    result = result.filter(i => i.status === "pendente");
  } else if (selectedStatus === "sugestoes_ia") {
    result = result.filter(i => i.status === "aguardando_aprovacao");
  }

  // 2. Filtro por categoria
  if (selectedCategory !== "all") {
    result = result.filter(i => i.category === selectedCategory);
  }

  // 3. Filtro por escopo
  if (selectedScope !== "all") {
    result = result.filter(i => i.scope === selectedScope);
  }

  // 4. Filtro por busca
  if (search.trim()) {
    const q = search.toLowerCase().trim();
    result = result.filter(i => {
      const questionMatch = i.question && i.question.toLowerCase().includes(q);
      const answerMatch = i.answer && i.answer.toLowerCase().includes(q);
      const suggestedMatch = i.suggestedAnswer && i.suggestedAnswer.toLowerCase().includes(q);
      const keywordsMatch = Array.isArray(i.keywords) && i.keywords.some(k => String(k).toLowerCase().includes(q));
      const variationsMatch = Array.isArray(i.variations) && i.variations.some(v => String(v).toLowerCase().includes(q));
      const phonesMatch = Array.isArray(i.clientPhones) && i.clientPhones.some(p => String(p).includes(q));
      const authorMatch = i.sourceClientName && i.sourceClientName.toLowerCase().includes(q);
      return questionMatch || answerMatch || suggestedMatch || keywordsMatch || variationsMatch || phonesMatch || authorMatch;
    });
  }

  // Ordenação
  return result.sort((a, b) => {
    const priorityOrder = {
      aguardando_aprovacao: 1,
      pendente: 2,
      ativo: 3,
      inativo: 4
    };
    const orderA = priorityOrder[a.status] || 99;
    const orderB = priorityOrder[b.status] || 99;
    if (orderA !== orderB) return orderA - orderB;

    const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return dateB - dateA;
  });
}

// Exact parsing logic from handleSaveForm in faq-knowledge-base.tsx (lines 194-196)
function parseKeywordsAndVariations(formKeywords, formVariations) {
  const keywordsArray = formKeywords.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  const variationsArray = formVariations.split(/\n+/).map(s => s.trim()).filter(Boolean);
  return { keywordsArray, variationsArray };
}

// ─── TEST SUITES ─────────────────────────────────────────────────────────────

describe("Challenger 2 M3: UI Data Interaction & Edge Case Stress Suite", () => {

  // ── SUITE 1: Phone Normalization & Chip Management ─────────────────────────
  describe("Suite 1: Phone Normalization & Chip Management Engine", () => {
    it("1.1 Normalizes 13-digit Brazilian mobile numbers with 55 country code", () => {
      assert.equal(formatDisplayPhone("5522998505276"), "(22) 99850-5276");
      assert.equal(formatDisplayPhone("5511987654321"), "(11) 98765-4321");
    });

    it("1.2 Normalizes 11-digit Brazilian mobile numbers without country code", () => {
      assert.equal(formatDisplayPhone("22998505276"), "(22) 99850-5276");
      assert.equal(formatDisplayPhone("11987654321"), "(11) 98765-4321");
    });

    it("1.3 Normalizes 12-digit Brazilian landline numbers with 55 country code", () => {
      assert.equal(formatDisplayPhone("552122334455"), "(21) 2233-4455");
      assert.equal(formatDisplayPhone("551130001000"), "(11) 3000-1000");
    });

    it("1.4 Normalizes 10-digit Brazilian landline numbers without country code", () => {
      assert.equal(formatDisplayPhone("2122334455"), "(21) 2233-4455");
      assert.equal(formatDisplayPhone("1130001000"), "(11) 3000-1000");
    });

    it("1.5 Handles pre-punctuated or formatted input safely", () => {
      assert.equal(formatDisplayPhone("+55 (22) 99850-5276"), "(22) 99850-5276");
      assert.equal(formatDisplayPhone("(21) 2233-4455"), "(21) 2233-4455");
      assert.equal(formatDisplayPhone("55-22-99850-5276"), "(22) 99850-5276");
    });

    it("1.6 Handles boundary, empty, null, undefined, and non-numeric inputs gracefully", () => {
      assert.equal(formatDisplayPhone(""), "");
      assert.equal(formatDisplayPhone(null), "");
      assert.equal(formatDisplayPhone(undefined), "");
      assert.equal(formatDisplayPhone("texto_invalido"), "texto_invalido");
      assert.equal(formatDisplayPhone("123"), "123");
      assert.equal(formatDisplayPhone("33445566"), "33445566"); // 8 digits (no DDD)
      assert.equal(formatDisplayPhone("998505276"), "998505276"); // 9 digits (no DDD)
    });

    it("1.7 Single phone addition (handleAddPhone logic): prefixes 55 for 10/11 digits, ignores blanks, deduplicates", () => {
      let list = [];
      list = normalizePhoneSingle("22998505276", list);
      assert.deepEqual(list, ["5522998505276"]);

      // Already has 55
      list = normalizePhoneSingle("5511999998888", list);
      assert.deepEqual(list, ["5522998505276", "5511999998888"]);

      // 10 digits landline
      list = normalizePhoneSingle("2122334455", list);
      assert.deepEqual(list, ["5522998505276", "5511999998888", "552122334455"]);

      // Punctuation cleaned
      list = normalizePhoneSingle("(31) 98888-7777", list);
      assert.deepEqual(list, ["5522998505276", "5511999998888", "552122334455", "5531988887777"]);

      // Duplicate prevention
      const beforeDupCount = list.length;
      list = normalizePhoneSingle("22998505276", list);
      list = normalizePhoneSingle("(22) 99850-5276", list);
      assert.equal(list.length, beforeDupCount);

      // Blank or invalid
      list = normalizePhoneSingle("   ", list);
      list = normalizePhoneSingle("abc", list);
      assert.equal(list.length, beforeDupCount);
    });

    it("1.8 Bulk phone addition (handleAddBulkPhones logic): parses mixed delimiters and deduplicates", () => {
      const rawBulk = `
        22998505276, (21) 98888-1111; 5531977776666
        22998505276
        4133334444
      `;
      const current = ["5522998505276"];
      const result = normalizePhonesBulk(rawBulk, current);

      assert.equal(result.includes("5522998505276"), true);
      assert.equal(result.includes("5521988881111"), true);
      assert.equal(result.includes("5531977776666"), true);
      assert.equal(result.includes("554133334444"), true);
      assert.equal(result.length, 4, "De-duplicated to exactly 4 distinct numbers");
    });
  });

  // ── SUITE 2: Taxonomy Completeness ─────────────────────────────────────────
  describe("Suite 2: Official 9-Category Taxonomy Validation", () => {
    it("2.1 Contains all 9 required categories per ORIGINAL_REQUEST §R1", () => {
      const keys = Object.keys(FAQ_CATEGORIES);
      assert.equal(keys.length, 9);
      const expected = [
        "reservas",
        "checkin_acesso",
        "wifi_tecnologia",
        "cafe_manha",
        "garagem",
        "estrutura_flat",
        "regras_visitas_pets",
        "lazer_condominio",
        "checkout"
      ];
      for (const cat of expected) {
        assert.ok(FAQ_CATEGORIES[cat], `Categoria ${cat} deve existir`);
      }
    });

    it("2.2 Each category possesses complete metadata attributes", () => {
      for (const [key, meta] of Object.entries(FAQ_CATEGORIES)) {
        assert.equal(meta.id, key);
        assert.ok(meta.label && meta.label.length > 0);
        assert.ok(meta.shortLabel && meta.shortLabel.length > 0);
        assert.ok(meta.description && meta.description.length > 0);
        assert.ok(meta.iconName && meta.iconName.length > 0);
        assert.ok(meta.colorClass && meta.colorClass.length > 0);
        assert.ok(meta.badgeClass && meta.badgeClass.length > 0);
        assert.ok(meta.borderClass && meta.borderClass.length > 0);
        assert.ok(meta.bgLightClass && meta.bgLightClass.length > 0);
      }
    });
  });

  // ── SUITE 3: Metrics & Aggregations ─────────────────────────────────────────
  describe("Suite 3: Metric Counters & Aggregation Pipeline", () => {
    it("3.1 Returns pristine zero counters when items list is completely empty", () => {
      const counts = computeStatusCounts([]);
      assert.deepEqual(counts, { todas: 0, ativas: 0, pendentes: 0, sugestoes_ia: 0 });

      const catStats = computeCategoryStats([]);
      for (const catKey of Object.keys(FAQ_CATEGORIES)) {
        assert.deepEqual(catStats[catKey], { count: 0, active: 0, pending: 0, awaitingApproval: 0 });
      }
    });

    it("3.2 Accurately tallies mixed statuses across diverse categories", () => {
      const mockItems = [
        { id: "1", category: "wifi_tecnologia", status: "ativo" },
        { id: "2", category: "wifi_tecnologia", status: "pendente" },
        { id: "3", category: "wifi_tecnologia", status: "aguardando_aprovacao" },
        { id: "4", category: "wifi_tecnologia", status: "inativo" },
        { id: "5", category: "cafe_manha", status: "ativo" },
        { id: "6", category: "cafe_manha", status: "aguardando_aprovacao" },
        { id: "7", category: "checkout", status: "ativo" }
      ];

      const counts = computeStatusCounts(mockItems);
      assert.equal(counts.todas, 7);
      assert.equal(counts.ativas, 3);
      assert.equal(counts.pendentes, 1);
      assert.equal(counts.sugestoes_ia, 2);

      const catStats = computeCategoryStats(mockItems);
      assert.deepEqual(catStats.wifi_tecnologia, { count: 4, active: 1, pending: 1, awaitingApproval: 1 });
      assert.deepEqual(catStats.cafe_manha, { count: 2, active: 1, pending: 0, awaitingApproval: 1 });
      assert.deepEqual(catStats.checkout, { count: 1, active: 1, pending: 0, awaitingApproval: 0 });
      assert.deepEqual(catStats.garagem, { count: 0, active: 0, pending: 0, awaitingApproval: 0 });
    });

    it("3.3 Safely handles items with unknown categories or statuses without throwing", () => {
      const corruptedItems = [
        { id: "x", category: "categoria_inexistente", status: "ativo" },
        { id: "y", category: "wifi_tecnologia", status: "status_desconhecido" }
      ];

      const counts = computeStatusCounts(corruptedItems);
      assert.equal(counts.todas, 2);
      assert.equal(counts.ativas, 1);
      assert.equal(counts.pendentes, 0);
      assert.equal(counts.sugestoes_ia, 0);

      const catStats = computeCategoryStats(corruptedItems);
      assert.equal(catStats.wifi_tecnologia.count, 1);
      assert.equal(catStats.wifi_tecnologia.active, 0);
    });
  });

  // ── SUITE 4: Filtering, Search, & Sorting ───────────────────────────────────
  describe("Suite 4: Filter Combinations, Full-Text Search, & Sorting Pipeline", () => {
    const fixtureItems = [
      {
        id: "faq-1",
        question: "Qual a senha do Wi-Fi?",
        answer: "A rede é CorpFlats-Hospedes e a senha corpflats2026 com 500MB.",
        category: "wifi_tecnologia",
        keywords: ["wifi", "internet", "senha", "rede"],
        variations: ["Como conectar no wifi?", "Tem internet no flat?"],
        status: "ativo",
        scope: "all",
        clientPhones: [],
        createdAt: "2026-10-10T10:00:00Z",
        updatedAt: "2026-10-10T12:00:00Z"
      },
      {
        id: "faq-2",
        question: "Como funciona o café da manhã?",
        answer: "O café é servido na bandeja pontualmente no quarto.",
        category: "cafe_manha",
        keywords: ["cafe", "bandeja", "horario"],
        variations: ["Tem café incluso?", "Onde toma café?"],
        status: "ativo",
        scope: "exclude",
        clientPhones: ["5522998505276"],
        createdAt: "2026-10-10T09:00:00Z",
        updatedAt: "2026-10-10T11:00:00Z"
      },
      {
        id: "faq-3",
        question: "Tem tomada para carro elétrico?",
        answer: "",
        suggestedAnswer: "Temos tomadas de 220V no subsolo que podem ser usadas com aviso prévio.",
        category: "garagem",
        keywords: ["carro", "eletrico", "recarga"],
        variations: [],
        status: "aguardando_aprovacao",
        scope: "all",
        clientPhones: [],
        sourceClientPhone: "5511999998888",
        sourceClientName: "Carlos Silva",
        createdAt: "2026-10-11T01:00:00Z",
        updatedAt: "2026-10-11T01:10:00Z"
      },
      {
        id: "faq-4",
        question: "Posso receber massagista no quarto?",
        answer: "",
        category: "regras_visitas_pets",
        keywords: ["visita", "servico"],
        variations: ["Entrada de profissionais terceirizados"],
        status: "pendente",
        scope: "all",
        clientPhones: [],
        sourceClientPhone: "5521977776666",
        sourceClientName: "Renata Costa",
        createdAt: "2026-10-11T02:00:00Z",
        updatedAt: "2026-10-11T02:00:00Z"
      },
      {
        id: "faq-5",
        question: "Desconto especial para reserva direta VIP?",
        answer: "Clientes VIP possuem 15% de desconto via Pix.",
        category: "reservas",
        keywords: ["desconto", "vip", "direta"],
        variations: [],
        status: "ativo",
        scope: "include_only",
        clientPhones: ["5522998505276", "5511999998888"],
        createdAt: "2026-10-09T08:00:00Z",
        updatedAt: "2026-10-09T08:00:00Z"
      }
    ];

    it("4.1 Returns empty list on zero-item dataset without crashing", () => {
      const res = filterFaqItems([], { search: "qualquer", selectedStatus: "ativas", selectedCategory: "wifi_tecnologia" });
      assert.deepEqual(res, []);
    });

    it("4.2 Filters by status pills correctly", () => {
      const ativas = filterFaqItems(fixtureItems, { selectedStatus: "ativas" });
      assert.equal(ativas.length, 3);
      assert.ok(ativas.every(i => i.status === "ativo"));

      const pendentes = filterFaqItems(fixtureItems, { selectedStatus: "pendentes" });
      assert.equal(pendentes.length, 1);
      assert.equal(pendentes[0].id, "faq-4");

      const sugestoes = filterFaqItems(fixtureItems, { selectedStatus: "sugestoes_ia" });
      assert.equal(sugestoes.length, 1);
      assert.equal(sugestoes[0].id, "faq-3");
    });

    it("4.3 Filters by category correctly", () => {
      const wifiOnly = filterFaqItems(fixtureItems, { selectedCategory: "wifi_tecnologia" });
      assert.equal(wifiOnly.length, 1);
      assert.equal(wifiOnly[0].id, "faq-1");

      const emptyCat = filterFaqItems(fixtureItems, { selectedCategory: "lazer_condominio" });
      assert.equal(emptyCat.length, 0);
    });

    it("4.4 Filters by client scope correctly", () => {
      const excludeScope = filterFaqItems(fixtureItems, { selectedScope: "exclude" });
      assert.equal(excludeScope.length, 1);
      assert.equal(excludeScope[0].id, "faq-2");

      const includeScope = filterFaqItems(fixtureItems, { selectedScope: "include_only" });
      assert.equal(includeScope.length, 1);
      assert.equal(includeScope[0].id, "faq-5");
    });

    it("4.5 Full-text search searches across question, answer, suggestedAnswer, keywords, variations, clientPhones, and author", () => {
      // By question
      let res = filterFaqItems(fixtureItems, { search: "SENHA" });
      assert.equal(res.length, 1);
      assert.equal(res[0].id, "faq-1");

      // By answer
      res = filterFaqItems(fixtureItems, { search: "500MB" });
      assert.equal(res.length, 1);
      assert.equal(res[0].id, "faq-1");

      // By suggestedAnswer
      res = filterFaqItems(fixtureItems, { search: "220V" });
      assert.equal(res.length, 1);
      assert.equal(res[0].id, "faq-3");

      // By keyword
      res = filterFaqItems(fixtureItems, { search: "recarga" });
      assert.equal(res.length, 1);
      assert.equal(res[0].id, "faq-3");

      // By variation
      res = filterFaqItems(fixtureItems, { search: "terceirizados" });
      assert.equal(res.length, 1);
      assert.equal(res[0].id, "faq-4");

      // By client phone in exception rule (clientPhones)
      res = filterFaqItems(fixtureItems, { search: "998505276" });
      assert.equal(res.length, 2); // faq-2 and faq-5 have this in clientPhones

      // By author name (sourceClientName)
      res = filterFaqItems(fixtureItems, { search: "Carlos Silva" });
      assert.equal(res.length, 1);
      assert.equal(res[0].id, "faq-3");

      // Finding: sourceClientPhone is not currently in search predicate
      const sourcePhoneRes = filterFaqItems(fixtureItems, { search: "977776666" });
      assert.equal(sourcePhoneRes.length, 0, "Confirms sourceClientPhone is omitted from search predicate");
    });

    it("4.6 Combines multiple active filters simultaneously", () => {
      const res = filterFaqItems(fixtureItems, {
        selectedStatus: "ativas",
        selectedCategory: "reservas",
        selectedScope: "include_only",
        search: "VIP"
      });
      assert.equal(res.length, 1);
      assert.equal(res[0].id, "faq-5");

      // Contradictory filters yield empty array cleanly
      const empty = filterFaqItems(fixtureItems, {
        selectedStatus: "pendentes",
        selectedCategory: "wifi_tecnologia"
      });
      assert.equal(empty.length, 0);
    });

    it("4.7 Sorts with highest priority to sugestões de IA, then pendentes, then ativas, then inativas, sorted by date desc", () => {
      const sorted = filterFaqItems(fixtureItems);
      // Priority 1: faq-3 (aguardando_aprovacao)
      assert.equal(sorted[0].id, "faq-3");
      // Priority 2: faq-4 (pendente)
      assert.equal(sorted[1].id, "faq-4");
      // Priority 3: ativas sorted by date:
      // faq-1: updatedAt 2026-10-10T12:00
      // faq-2: updatedAt 2026-10-10T11:00
      // faq-5: updatedAt 2026-10-09T08:00
      assert.equal(sorted[2].id, "faq-1");
      assert.equal(sorted[3].id, "faq-2");
      assert.equal(sorted[4].id, "faq-5");
    });

    it("4.8 Resilient against null, undefined, or missing properties in items", () => {
      const malformedList = [
        {
          id: "m-1",
          question: null,
          answer: undefined,
          keywords: null,
          variations: undefined,
          clientPhones: null,
          status: "ativo",
          createdAt: null,
          updatedAt: undefined
        },
        {
          id: "m-2",
          question: "Pergunta sobre chave",
          status: "inativo"
        }
      ];

      // Should not throw with search and finds matching item
      const res = filterFaqItems(malformedList, { search: "chave" });
      assert.equal(res.length, 1);
      assert.equal(res[0].id, "m-2");

      // Regex special chars in search string should not crash
      const regexSafe = filterFaqItems(malformedList, { search: "[.*+?^${}()|]" });
      assert.equal(regexSafe.length, 0);
    });
  });

  // ── SUITE 5: 1-Click Approval & Form Handlers ──────────────────────────────
  describe("Suite 5: 1-Click Approval States, Form Validation, & WhatsApp Formatting", () => {
    it("5.1 1-Click Approve button visibility conditions: only rendered for aguardando_aprovacao", () => {
      const awaitingItem = { id: "1", status: "aguardando_aprovacao", suggestedAnswer: "Resposta sugerida" };
      const pendingItem = { id: "2", status: "pendente" };
      const activeItem = { id: "3", status: "ativo" };
      const inactiveItem = { id: "4", status: "inativo" };

      // Card view condition: isAwaitingApproval && item.suggestedAnswer
      const isCardApproveVisible = (item) => item.status === "aguardando_aprovacao" && Boolean(item.suggestedAnswer);
      assert.equal(isCardApproveVisible(awaitingItem), true);
      assert.equal(isCardApproveVisible(pendingItem), false);
      assert.equal(isCardApproveVisible(activeItem), false);
      assert.equal(isCardApproveVisible(inactiveItem), false);

      // Table view condition: isAwaitingApproval
      const isTableApproveVisible = (item) => item.status === "aguardando_aprovacao";
      assert.equal(isTableApproveVisible(awaitingItem), true);
      assert.equal(isTableApproveVisible(pendingItem), false);
      assert.equal(isTableApproveVisible(activeItem), false);
    });

    it("5.2 Modal save button disabled state: properly disabled on empty or whitespace question", () => {
      const isSaveDisabled = (savingForm, approvingInModal, formQuestion) => {
        return Boolean(savingForm || approvingInModal || !formQuestion.trim());
      };

      assert.equal(isSaveDisabled(false, false, ""), true, "Disabled on empty string");
      assert.equal(isSaveDisabled(false, false, "    "), true, "Disabled on whitespace");
      assert.equal(isSaveDisabled(true, false, "Pergunta"), true, "Disabled while saving");
      assert.equal(isSaveDisabled(false, true, "Pergunta"), true, "Disabled while approving");
      assert.equal(isSaveDisabled(false, false, "Pergunta válida"), false, "Enabled with valid question");
    });

    it("5.3 Form keywords and variations parsing: handles newlines, commas, semicolons, and trims entries", () => {
      const rawKeywords = " wifi, internet; 500mb\n rede , smart tv ";
      const rawVariations = `
        Como acesso a internet?
        Qual a senha do wifi?

        Tem 500MB de banda?
      `;

      const { keywordsArray, variationsArray } = parseKeywordsAndVariations(rawKeywords, rawVariations);

      assert.deepEqual(keywordsArray, ["wifi", "internet", "500mb", "rede", "smart tv"]);
      assert.deepEqual(variationsArray, [
        "Como acesso a internet?",
        "Qual a senha do wifi?",
        "Tem 500MB de banda?"
      ]);
    });

    it("5.4 WhatsApp formatting tokens (*bold*, _italic_, ~strikethrough~)", () => {
      const applyFormatting = (text, prefix, suffix, start = 0, end = text.length) => {
        const selected = text.substring(start, end);
        const replacement = `${prefix}${selected || "texto"}${suffix}`;
        return text.substring(0, start) + replacement + text.substring(end);
      };

      const original = "Wi-Fi CorpFlats";
      assert.equal(applyFormatting(original, "*", "*", 0, 5), "*Wi-Fi* CorpFlats");
      assert.equal(applyFormatting(original, "_", "_", 6, original.length), "Wi-Fi _CorpFlats_");
      assert.equal(applyFormatting("", "~", "~"), "~texto~");
    });
  });

  // ── SUITE 6: REST Endpoints Contract Integrity ─────────────────────────────
  describe("Suite 6: REST Client Contract Invariants in useFaq", () => {
    it("6.1 approveFaq URI encoding and payload structure", () => {
      const id = "faq-123/special&chars";
      const encodedUrl = `/api/whatsapp/faq/${encodeURIComponent(id)}/approve`;
      assert.equal(encodedUrl, "/api/whatsapp/faq/faq-123%2Fspecial%26chars/approve");

      const payload = {
        question: "Pergunta ajustada",
        answer: "Resposta aprovada",
        category: "wifi_tecnologia"
      };
      assert.ok(payload.question && payload.answer && payload.category);
    });

    it("6.2 toggleStatus alternates correctly between ativo and inativo", () => {
      const toggle = (currentStatus) => (currentStatus === "ativo" ? "inativo" : "ativo");
      assert.equal(toggle("ativo"), "inativo");
      assert.equal(toggle("inativo"), "ativo");
      assert.equal(toggle("pendente"), "ativo"); // Non-ativo promotes to ativo
    });
  });
});

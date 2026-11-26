/**
 * Utilitário unificado de indexação e busca inteligente de hóspedes no CRM.
 *
 * Resolve:
 * 1. Insensibilidade total a acentos e cedilha ("fabrícia" <-> "FABRICIA", "gonçalves" <-> "goncalves").
 * 2. Nomes do meio não contíguos ("fabrícia rodrigues" encontra "Fabrícia da Silva Rodrigues").
 * 3. Indexação combinada de `fullName` + `name` (nunca perde sobrenome quando `g.name` foi salvo curto).
 * 4. Tolerância ortográfica brasileira segura como desempate secundário
 *    ("Rodrigues" <-> "Rodriguez", "Souza" <-> "Sousa", "Thiago" <-> "Tiago", "Fabrycia" <-> "Fabricia").
 * 5. Busca por CPF/documento, telefone principal/secundário/adicionais, e-mail e empresa,
 *    com ordenação por relevância antes de aplicar `limit`.
 */

export function normalizeCrmSearchText(val?: string | null): string {
  if (!val) return "";
  return String(val)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function foldBrazilianNameOrthography(normStr: string): string {
  if (!normStr) return "";
  return normStr
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/y/g, "i")
    .replace(/z/g, "s")
    .replace(/([bcdfghjklmnpqrstvwxs])\1+/g, "$1");
}

export function getBestCrmGuestDisplayName(g: any): string {
  const full = String(g?.fullName || "").trim();
  const short = String(g?.name || "").trim();
  if (!full && !short) return "";
  if (!full) return short;
  if (!short) return full;
  if (full === short) return full;
  const fullWords = full.split(/\s+/).filter(Boolean).length;
  const shortWords = short.split(/\s+/).filter(Boolean).length;
  if (fullWords !== shortWords) return fullWords > shortWords ? full : short;
  return full.length >= short.length ? full : short;
}

export interface IndexedCrmGuestItem<T = any> {
  raw: T;
  displayName: string;
  displayNameNorm: string;
  combinedNameNorm: string;
  nameWordsNorm: string[];
  foldedWords: string[];
  docDigits: string;
  phoneDigitsList: string[];
  emailNorm: string;
  cityNorm: string;
  compNorm: string;
}

export function buildIndexedCrmGuests<T = any>(crmGuests: T[]): IndexedCrmGuestItem<T>[] {
  if (!Array.isArray(crmGuests)) return [];
  return crmGuests.map((g: any) => {
    const displayName = getBestCrmGuestDisplayName(g);
    const displayNameNorm = normalizeCrmSearchText(displayName);
    const combinedRaw = `${g?.fullName || ""} ${g?.name || ""}`.trim();
    const combinedNameNorm = normalizeCrmSearchText(combinedRaw);
    const nameWordsNorm = combinedNameNorm ? combinedNameNorm.split(" ").filter(Boolean) : [];
    const foldedWords = nameWordsNorm.map(foldBrazilianNameOrthography);

    const docDigits = String(g?.documentNumber || g?.document || g?.cpf || "").replace(/\D/g, "");

    const rawPhones: string[] = [];
    if (g?.phone) rawPhones.push(String(g.phone));
    if (g?.phoneNumber) rawPhones.push(String(g.phoneNumber));
    if (g?.whatsapp) rawPhones.push(String(g.whatsapp));
    if (g?.secondaryPhone) rawPhones.push(String(g.secondaryPhone));
    if (Array.isArray(g?.additionalPhones)) {
      for (const ap of g.additionalPhones) {
        if (ap) rawPhones.push(String(ap));
      }
    }
    const phoneDigitsList = Array.from(
      new Set(rawPhones.map((p) => p.replace(/\D/g, "")).filter((d) => d.length >= 4))
    );

    const emailParts = [
      g?.email,
      g?.financialResponsible?.email,
      g?.financialResponsibleEmail,
    ]
      .filter(Boolean)
      .map((e) => String(e).trim().toLowerCase());
    const emailNorm = emailParts.join(" ");

    const cityNorm = normalizeCrmSearchText(g?.city || g?.cidade || "");
    const compNorm = normalizeCrmSearchText(
      `${g?.companyName || ""} ${g?.companyData?.companyName || ""}`
    );

    return {
      raw: g,
      displayName,
      displayNameNorm,
      combinedNameNorm,
      nameWordsNorm,
      foldedWords,
      docDigits,
      phoneDigitsList,
      emailNorm,
      cityNorm,
      compNorm,
    };
  });
}

export function scoreIndexedCrmGuest(
  item: IndexedCrmGuestItem<any>,
  normQ: string,
  qTokens: string[],
  foldedTokens: string[],
  cleanDigits: string,
  rawLower: string,
  includeCompany: boolean,
  includeCityAndEmail = true
): number {
  let bestScore = 0;

  // 1. Correspondência por nome (sem acentos, com suporte a nomes do meio e variações ortográficas)
  if (normQ && item.combinedNameNorm) {
    if (item.displayNameNorm === normQ) {
      bestScore = Math.max(bestScore, 100);
    } else if (item.displayNameNorm.startsWith(normQ)) {
      bestScore = Math.max(bestScore, 92);
    } else if (item.combinedNameNorm.includes(normQ)) {
      bestScore = Math.max(bestScore, 85);
    } else if (qTokens.length > 0) {
      const allWordPrefix = qTokens.every((tok) =>
        item.nameWordsNorm.some((w) => w.startsWith(tok))
      );
      if (allWordPrefix) {
        bestScore = Math.max(bestScore, 78);
      } else {
        const allSubstring = qTokens.every((tok) => item.combinedNameNorm.includes(tok));
        if (allSubstring) {
          bestScore = Math.max(bestScore, 70);
        } else if (
          foldedTokens.length > 0 &&
          foldedTokens.every((ft) => ft.length >= 2) &&
          qTokens.some((t) => t.length >= 3)
        ) {
          const allFoldedMatch = foldedTokens.every((ft) =>
            item.foldedWords.some((fw) => fw.startsWith(ft) || (ft.length >= 4 && fw.includes(ft)))
          );
          if (allFoldedMatch) {
            bestScore = Math.max(bestScore, 45);
          }
        }
      }
    }
  }

  // 2. Correspondência por CPF / Documento ou Telefone (principal e adicionais)
  if (cleanDigits.length >= 2) {
    if (item.docDigits && item.docDigits.includes(cleanDigits)) {
      bestScore = Math.max(bestScore, item.docDigits.startsWith(cleanDigits) ? 88 : 75);
    }
    if (item.phoneDigitsList.some((pd) => pd.includes(cleanDigits))) {
      bestScore = Math.max(bestScore, 74);
    }
  }

  // 3. Correspondência por E-mail / Cidade
  if (includeCityAndEmail && rawLower.length >= 2) {
    if (item.emailNorm && item.emailNorm.includes(rawLower)) {
      bestScore = Math.max(bestScore, 65);
    }
    if (normQ && item.cityNorm && item.cityNorm.includes(normQ)) {
      bestScore = Math.max(bestScore, 52);
    }
  }

  // 4. Correspondência por Empresa vinculada
  if (includeCompany && normQ && item.compNorm) {
    if (
      item.compNorm.includes(normQ) ||
      (qTokens.length > 1 && qTokens.every((tok) => item.compNorm.includes(tok)))
    ) {
      bestScore = Math.max(bestScore, 55);
    }
  }

  return bestScore;
}

export function searchIndexedCrmList<T = any>(
  indexedList: IndexedCrmGuestItem<T>[],
  rawQuery: string,
  includeCompany: boolean,
  limit?: number,
  includeCityAndEmail = true
): T[] {
  const rawTrimmed = String(rawQuery || "").trim();
  if (!rawTrimmed) return [];

  const rawLower = rawTrimmed.toLowerCase();
  const normQ = normalizeCrmSearchText(rawTrimmed);
  const qTokens = normQ ? normQ.split(" ").filter(Boolean) : [];
  const foldedTokens = qTokens.map(foldBrazilianNameOrthography);
  const cleanDigits = rawTrimmed.replace(/\D/g, "");

  if (!normQ && cleanDigits.length === 0) return [];

  const scored: { item: T; score: number; idx: number }[] = [];
  for (let i = 0; i < indexedList.length; i++) {
    const entry = indexedList[i];
    const score = scoreIndexedCrmGuest(
      entry,
      normQ,
      qTokens,
      foldedTokens,
      cleanDigits,
      rawLower,
      includeCompany,
      includeCityAndEmail
    );
    if (score > 0) {
      scored.push({ item: entry.raw, score, idx: i });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.idx - b.idx;
  });

  if (limit && limit > 0 && scored.length > limit) {
    return scored.slice(0, limit).map((s) => s.item);
  }
  return scored.map((s) => s.item);
}

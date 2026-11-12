import https from "https";

const PREPOSITIONS = new Set(["de", "da", "do", "dos", "das", "e", "em", "para", "com", "por"]);

/**
 * Converte string para Title Case respeitando preposições e siglas corporativas (LTDA, S/A, ME, EPP, etc.).
 */
export function toTitleCase(str = "") {
  if (!str) return "";
  const words = String(str).trim().toLowerCase().split(/\s+/);
  return words
    .map((word, index) => {
      if (!word) return "";
      const upper = word.toUpperCase();
      if (["LTDA", "ME", "EPP", "S/A", "SA", "EIRELI", "SS", "PJ", "PF", "RJ", "SP", "MG", "ES", "DF", "BA", "PR", "SC", "RS"].includes(upper)) {
        return upper;
      }
      if (index > 0 && PREPOSITIONS.has(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/**
 * Higieniza qualquer documento retornando apenas dígitos.
 */
export function onlyDigits(str = "") {
  return String(str || "").replace(/\D/g, "");
}

/**
 * Validação algorítmica de CPF (Módulo 11).
 */
export function isValidCpf(cpf = "") {
  const clean = onlyDigits(cpf);
  if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i), 10) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9), 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i), 10) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  return rev === parseInt(clean.charAt(10), 10);
}

/**
 * Validação algorítmica de CNPJ (Módulo 11).
 */
export function isValidCnpj(cnpj = "") {
  const clean = onlyDigits(cnpj);
  if (clean.length !== 14 || /^(\d)\1{13}$/.test(clean)) return false;
  let size = clean.length - 2;
  let numbers = clean.substring(0, size);
  const digits = clean.substring(size);
  let sum = 0;
  let pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0), 10)) return false;
  size = size + 1;
  numbers = clean.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return result === parseInt(digits.charAt(1), 10);
}

/**
 * Sanitiza telefone removendo DDI (+55 ou 55) e mantendo apenas DDD + Número (10 ou 11 dígitos).
 */
export function cleanPhone(phone = "") {
  let digits = onlyDigits(phone);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.substring(2);
  }
  return digits;
}

/**
 * Sanitiza CEP para 8 dígitos (retorna "" se vazio ou zerado).
 */
export function cleanCep(cep = "") {
  const digits = onlyDigits(cep);
  if (!digits || /^0+$/.test(digits)) return "";
  return digits.padEnd(8, "0").substring(0, 8);
}

/**
 * Formata CNPJ (14 dígitos) para exibição: 00.000.000/0000-00.
 */
export function formatCnpj(cnpj = "") {
  const d = onlyDigits(cnpj).padStart(14, "0").slice(-14);
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

/**
 * Formata CPF (11 dígitos) para exibição: 000.000.000-00.
 */
export function formatCpf(cpf = "") {
  const d = onlyDigits(cpf).padStart(11, "0").slice(-11);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

/**
 * Formata CEP (8 dígitos) para exibição: 00000-000.
 */
export function formatCep(cep = "") {
  const d = onlyDigits(cep).padStart(8, "0").slice(-8);
  return `${d.slice(0, 5)}-${d.slice(5, 8)}`;
}

function normalizeCityKey(str = "") {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const KNOWN_MUNICIPALITIES = [
  { key: "campos dos goytacazes", cidade: "Campos dos Goytacazes", uf: "RJ", ibge: "3301009", defaultCep: "28035000", ranges: [[28000000, 28199999]] },
  { key: "rio de janeiro", cidade: "Rio de Janeiro", uf: "RJ", ibge: "3304557", defaultCep: "20010000", ranges: [[20000000, 23799999]] },
  { key: "niteroi", cidade: "Niterói", uf: "RJ", ibge: "3303302", defaultCep: "24020000", ranges: [[24000000, 24399999]] },
  { key: "sao goncalo", cidade: "São Gonçalo", uf: "RJ", ibge: "3304904", defaultCep: "24440000", ranges: [[24400000, 24799999]] },
  { key: "duque de caxias", cidade: "Duque de Caxias", uf: "RJ", ibge: "3301702", defaultCep: "25070000", ranges: [[25000000, 25499999]] },
  { key: "nova iguacu", cidade: "Nova Iguaçu", uf: "RJ", ibge: "3303500", defaultCep: "26210000", ranges: [[26000000, 26399999]] },
  { key: "petropolis", cidade: "Petrópolis", uf: "RJ", ibge: "3303906", defaultCep: "25680000", ranges: [[25600000, 25799999]] },
  { key: "volta redonda", cidade: "Volta Redonda", uf: "RJ", ibge: "3306305", defaultCep: "27213000", ranges: [[27200000, 27299999]] },
  { key: "macae", cidade: "Macaé", uf: "RJ", ibge: "3302403", defaultCep: "27910000", ranges: [[27900000, 27999999]] },
  { key: "cabo frio", cidade: "Cabo Frio", uf: "RJ", ibge: "3300704", defaultCep: "28905000", ranges: [[28900000, 28929999]] },
  { key: "rio das ostras", cidade: "Rio das Ostras", uf: "RJ", ibge: "3304524", defaultCep: "28890000", ranges: [[28890000, 28899999]] },
  { key: "armacao dos buzios", cidade: "Armação dos Búzios", uf: "RJ", ibge: "3300233", defaultCep: "28950000", ranges: [[28950000, 28959999]] },
  { key: "sao joao da barra", cidade: "São João da Barra", uf: "RJ", ibge: "3305000", defaultCep: "28200000", ranges: [[28200000, 28249999]] },
  { key: "itaperuna", cidade: "Itaperuna", uf: "RJ", ibge: "3302205", defaultCep: "28300000", ranges: [[28300000, 28359999]] },
  { key: "resende", cidade: "Resende", uf: "RJ", ibge: "3304201", defaultCep: "27510000", ranges: [[27500000, 27549999]] },
  { key: "angra dos reis", cidade: "Angra dos Reis", uf: "RJ", ibge: "3300100", defaultCep: "23900000", ranges: [[23900000, 23999999]] },
  { key: "terezopolis", cidade: "Teresópolis", uf: "RJ", ibge: "3305802", defaultCep: "25950000", ranges: [[25950000, 25999999]] },
  { key: "teresopolis", cidade: "Teresópolis", uf: "RJ", ibge: "3305802", defaultCep: "25950000", ranges: [[25950000, 25999999]] },
  { key: "nova friburgo", cidade: "Nova Friburgo", uf: "RJ", ibge: "3303401", defaultCep: "28605000", ranges: [[28600000, 28639999]] },
  { key: "sao paulo", cidade: "São Paulo", uf: "SP", ibge: "3550308", defaultCep: "01310100", ranges: [[1000000, 5999999], [8000000, 8499999]] },
  { key: "campinas", cidade: "Campinas", uf: "SP", ibge: "3509502", defaultCep: "13010000", ranges: [[13000000, 13139999]] },
  { key: "santos", cidade: "Santos", uf: "SP", ibge: "3548500", defaultCep: "11010000", ranges: [[11000000, 11099999]] },
  { key: "guarulhos", cidade: "Guarulhos", uf: "SP", ibge: "3518800", defaultCep: "07010000", ranges: [[7000000, 7399999]] },
  { key: "sao bernardo do campo", cidade: "São Bernardo do Campo", uf: "SP", ibge: "3548708", defaultCep: "09710000", ranges: [[9700000, 9899999]] },
  { key: "santo andre", cidade: "Santo André", uf: "SP", ibge: "3547809", defaultCep: "09010000", ranges: [[9000000, 9299999]] },
  { key: "osasco", cidade: "Osasco", uf: "SP", ibge: "3534401", defaultCep: "06010000", ranges: [[6000000, 6299999]] },
  { key: "barueri", cidade: "Barueri", uf: "SP", ibge: "3505708", defaultCep: "06401000", ranges: [[6400000, 6499999]] },
  { key: "ribeirao preto", cidade: "Ribeirão Preto", uf: "SP", ibge: "3543402", defaultCep: "14010000", ranges: [[14000000, 14109999]] },
  { key: "sao jose dos campos", cidade: "São José dos Campos", uf: "SP", ibge: "3549904", defaultCep: "12210000", ranges: [[12200000, 12249999]] },
  { key: "sorocaba", cidade: "Sorocaba", uf: "SP", ibge: "3552205", defaultCep: "18010000", ranges: [[18000000, 18109999]] },
  { key: "belo horizonte", cidade: "Belo Horizonte", uf: "MG", ibge: "3106200", defaultCep: "30130000", ranges: [[30000000, 31999999]] },
  { key: "uberlandia", cidade: "Uberlândia", uf: "MG", ibge: "3170206", defaultCep: "38400000", ranges: [[38400000, 38439999]] },
  { key: "juiz de fora", cidade: "Juiz de Fora", uf: "MG", ibge: "3136702", defaultCep: "36010000", ranges: [[36000000, 36109999]] },
  { key: "contagem", cidade: "Contagem", uf: "MG", ibge: "3118601", defaultCep: "32010000", ranges: [[32000000, 32399999]] },
  { key: "vitoria", cidade: "Vitória", uf: "ES", ibge: "3205309", defaultCep: "29010000", ranges: [[29000000, 29099999]] },
  { key: "vila velha", cidade: "Vila Velha", uf: "ES", ibge: "3205200", defaultCep: "29100000", ranges: [[29100000, 29129999]] },
  { key: "serra", cidade: "Serra", uf: "ES", ibge: "3205002", defaultCep: "29160000", ranges: [[29160000, 29189999]] },
  { key: "cachoeiro de itapemirim", cidade: "Cachoeiro de Itapemirim", uf: "ES", ibge: "3201209", defaultCep: "29300000", ranges: [[29300000, 29329999]] },
  { key: "curitiba", cidade: "Curitiba", uf: "PR", ibge: "4106902", defaultCep: "80010000", ranges: [[80000000, 82999999]] },
  { key: "porto alegre", cidade: "Porto Alegre", uf: "RS", ibge: "4314902", defaultCep: "90010000", ranges: [[90000000, 91999999]] },
  { key: "florianopolis", cidade: "Florianópolis", uf: "SC", ibge: "4205407", defaultCep: "88010000", ranges: [[88000000, 88099999]] },
  { key: "joinville", cidade: "Joinville", uf: "SC", ibge: "4209102", defaultCep: "89201000", ranges: [[89200000, 89239999]] },
  { key: "brasilia", cidade: "Brasília", uf: "DF", ibge: "5300108", defaultCep: "70040010", ranges: [[70000000, 73699999]] },
  { key: "salvador", cidade: "Salvador", uf: "BA", ibge: "2927408", defaultCep: "40010000", ranges: [[40000000, 42599999]] },
  { key: "recife", cidade: "Recife", uf: "PE", ibge: "2611606", defaultCep: "50010000", ranges: [[50000000, 52999999]] },
  { key: "fortaleza", cidade: "Fortaleza", uf: "CE", ibge: "2304400", defaultCep: "60010000", ranges: [[60000000, 61599999]] },
  { key: "goiania", cidade: "Goiânia", uf: "GO", ibge: "5208707", defaultCep: "74000000", ranges: [[74000000, 74899999]] },
  { key: "manaus", cidade: "Manaus", uf: "AM", ibge: "1302603", defaultCep: "69005000", ranges: [[69000000, 69099999]] },
  { key: "belem", cidade: "Belém", uf: "PA", ibge: "1501402", defaultCep: "66010000", ranges: [[66000000, 66999999]] }
];

function cepFitsRanges(cepNum, ranges = []) {
  if (!cepNum || isNaN(cepNum)) return false;
  return ranges.some(([min, max]) => cepNum >= min && cepNum <= max);
}

/**
 * Infere deterministicamente a coerência entre CEP, Cidade, UF e Código IBGE (7 dígitos).
 * Corrige automaticamente casos em que o IBGE ficou preso no default "3301009" (Campos)
 * mas o CEP ou a Cidade pertencem ao Rio de Janeiro ("3304557"), São Paulo ("3550308"), etc.
 */
export function inferIbgeAndValidCep({ cep = "", cidade = "", uf = "", codigoMunicipio = "" } = {}) {
  const cleanC = cleanCep(cep);
  const cepNum = cleanC.length === 8 ? parseInt(cleanC, 10) : 0;
  const cityNorm = normalizeCityKey(cidade);
  const cleanIbge = onlyDigits(codigoMunicipio);

  const byCep = cepNum ? KNOWN_MUNICIPALITIES.find(m => cepFitsRanges(cepNum, m.ranges)) : null;
  const byCity = cityNorm ? KNOWN_MUNICIPALITIES.find(m => m.key === cityNorm) : null;
  const byIbge = cleanIbge.length === 7 ? KNOWN_MUNICIPALITIES.find(m => m.ibge === cleanIbge) : null;

  // Se o CEP pertence claramente a um município conhecido (ex: 22753-200 -> Rio de Janeiro 3304557),
  // e o IBGE estava vazio ou preso no fallback de Campos (3301009), prevalece o município do CEP/Cidade.
  if (byCep) {
    return {
      cep: cleanC,
      codigoMunicipio: byCep.ibge,
      ibge: byCep.ibge,
      ibgeCode: byCep.ibge,
      cidade: (byCity && byCity.ibge === byCep.ibge && cidade) ? cidade : byCep.cidade,
      uf: byCep.uf,
      defaultCep: byCep.defaultCep
    };
  }

  if (byCity) {
    const cepMatchesCity = cepNum && cepFitsRanges(cepNum, byCity.ranges);
    return {
      cep: cepMatchesCity ? cleanC : (cleanC || byCity.defaultCep),
      codigoMunicipio: byCity.ibge,
      ibge: byCity.ibge,
      ibgeCode: byCity.ibge,
      cidade: cidade || byCity.cidade,
      uf: byCity.uf,
      defaultCep: byCity.defaultCep
    };
  }

  if (byIbge) {
    const cepMatchesIbge = cepNum && cepFitsRanges(cepNum, byIbge.ranges);
    return {
      cep: cepMatchesIbge ? cleanC : (cleanC || byIbge.defaultCep),
      codigoMunicipio: byIbge.ibge,
      ibge: byIbge.ibge,
      ibgeCode: byIbge.ibge,
      cidade: cidade || byIbge.cidade,
      uf: uf || byIbge.uf,
      defaultCep: byIbge.defaultCep
    };
  }

  return {
    cep: cleanC || "28035000",
    codigoMunicipio: cleanIbge.length === 7 ? cleanIbge : "3301009",
    ibge: cleanIbge.length === 7 ? cleanIbge : "3301009",
    ibgeCode: cleanIbge.length === 7 ? cleanIbge : "3301009",
    cidade: cidade || "Campos dos Goytacazes",
    uf: (uf || "RJ").toUpperCase(),
    defaultCep: "28035000"
  };
}

function httpsGetJson(url, timeoutMs = 2800) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => {
      if (!done) {
        done = true;
        resolve(val);
      }
    };
    try {
      const req = https.get(url, { headers: { "User-Agent": "CorpFlats-NFSe/1.0", Accept: "application/json" } }, (res) => {
        let raw = "";
        res.on("data", (c) => { raw += c; });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) return finish(null);
          try {
            finish(JSON.parse(raw));
          } catch (_) {
            finish(null);
          }
        });
      });
      req.on("error", () => finish(null));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        finish(null);
      });
    } catch (_) {
      finish(null);
    }
  });
}

const cepResolutionCache = new Map();

/**
 * Valida e reconcilia CEP + Código IBGE junto ao ViaCEP/Correios:
 * 1. Se o CEP existir no ViaCEP, retorna o CEP e o código IBGE (7 dígitos) oficiais do Correios/IBGE.
 * 2. Se o CEP vindo do cartão CNPJ estiver extinto/desatualizado nos Correios (ex: 22641-000 no Itanhangá/RJ),
 *    consulta automaticamente o ViaCEP por UF + Cidade + Logradouro (ex: Av. São Josemaria Escrivá -> 22753-200 / 3304557)
 *    para recuperar o CEP atual válido e evitar a rejeição [E0240] na SEFIN Nacional.
 * 3. Caso o logradouro não seja localizado nominalmente, garante que o par <cMun> e <CEP> pertençam ao mesmo município.
 */
export async function resolveValidCepAndIbge({
  cep = "",
  logradouro = "",
  bairro = "",
  cidade = "",
  uf = "",
  codigoMunicipio = ""
} = {}) {
  const cleanC = cleanCep(cep);
  const inferred = inferIbgeAndValidCep({ cep: cleanC, cidade, uf, codigoMunicipio });
  const cacheKey = `${cleanC}|${normalizeCityKey(logradouro)}|${normalizeCityKey(cidade)}|${(uf || "").toUpperCase()}|${onlyDigits(codigoMunicipio)}`;

  if (cepResolutionCache.has(cacheKey)) {
    return { ...cepResolutionCache.get(cacheKey) };
  }

  if (process.env.NODE_ENV === "test" && !process.env.TEST_REAL_SEFIN) {
    const testResult = {
      cep: inferred.cep || "28035000",
      codigoMunicipio: inferred.codigoMunicipio,
      ibge: inferred.codigoMunicipio,
      ibgeCode: inferred.codigoMunicipio,
      cidade: inferred.cidade,
      uf: inferred.uf,
      logradouro: logradouro || "",
      bairro: bairro || "",
      healed: false
    };
    return testResult;
  }

  let cepRejectedByViaCep = false;

  // 1. Tenta validar o CEP diretamente no ViaCEP
  if (cleanC.length === 8) {
    const viaData = await httpsGetJson(`https://viacep.com.br/ws/${cleanC}/json/`, 2500);
    if (viaData && !viaData.erro && viaData.ibge) {
      const ibgeStr = String(onlyDigits(viaData.ibge)).padStart(7, "0").substring(0, 7);
      const validCep = cleanCep(viaData.cep || cleanC) || cleanC;
      const result = {
        cep: validCep,
        codigoMunicipio: ibgeStr,
        ibge: ibgeStr,
        ibgeCode: ibgeStr,
        cidade: viaData.localidade || inferred.cidade || cidade || "Campos dos Goytacazes",
        uf: (viaData.uf || inferred.uf || uf || "RJ").toUpperCase(),
        logradouro: logradouro || viaData.logradouro || "",
        bairro: bairro || viaData.bairro || "",
        healed: false
      };
      cepResolutionCache.set(cacheKey, result);
      return result;
    }
    if (viaData && viaData.erro) {
      cepRejectedByViaCep = true;
    }
  }

  // 2. Se o CEP não existe no ViaCEP (ou estava vazio), tenta buscar pelo endereço (UF + Cidade + Logradouro)
  const searchUf = (inferred.uf || uf || "RJ").trim().toUpperCase();
  const searchCity = (cidade && normalizeCityKey(cidade) !== "campos dos goytacazes" ? cidade : inferred.cidade).trim();
  const rawStreet = String(logradouro || "")
    .replace(/,\s*([^,]+)$/, "")
    .replace(/\b(S\/?N|SN|KM\s*\d+|LOTE\s*\d+|QUADRA\s*\w+)\b/gi, "")
    .trim();

  if (searchUf.length === 2 && searchCity.length >= 3 && rawStreet.length >= 3) {
    const streetCandidates = [rawStreet];
    const strippedPrefix = rawStreet
      .replace(/^(AVENIDA|AV\.?|RUA|R\.?|ESTRADA|EST\.?|RODOVIA|ROD\.?|TRAVESSA|TV\.?|PRACA|PCA\.?|ALAMEDA|AL\.?)\s+/i, "")
      .trim();
    if (strippedPrefix.length >= 3 && strippedPrefix.toLowerCase() !== rawStreet.toLowerCase()) {
      streetCandidates.push(strippedPrefix);
    }

    for (const stTerm of streetCandidates) {
      const url = `https://viacep.com.br/ws/${encodeURIComponent(searchUf)}/${encodeURIComponent(searchCity)}/${encodeURIComponent(stTerm)}/json/`;
      const list = await httpsGetJson(url, 2500);
      if (Array.isArray(list) && list.length > 0) {
        const bairroNorm = normalizeCityKey(bairro);
        const match = (bairroNorm
          ? list.find(item => item.cep && item.ibge && normalizeCityKey(item.bairro) === bairroNorm)
          : null) || list.find(item => item.cep && item.ibge) || list[0];

        if (match && match.cep && match.ibge) {
          const ibgeStr = String(onlyDigits(match.ibge)).padStart(7, "0").substring(0, 7);
          const healedCep = cleanCep(match.cep);
          const result = {
            cep: healedCep,
            codigoMunicipio: ibgeStr,
            ibge: ibgeStr,
            ibgeCode: ibgeStr,
            cidade: match.localidade || searchCity,
            uf: (match.uf || searchUf).toUpperCase(),
            logradouro: logradouro || match.logradouro || "",
            bairro: bairro || match.bairro || "",
            healed: true
          };
          cepResolutionCache.set(cacheKey, result);
          return result;
        }
      }
    }
  }

  // 3. Fallback determinístico: se o CEP foi explicitamente rejeitado pelo ViaCEP (erro: true),
  // usa o defaultCep ativo do município correspondente para jamais disparar [E0240] na SEFIN.
  const finalCep = cepRejectedByViaCep ? (inferred.defaultCep || "28035000") : (inferred.cep || inferred.defaultCep || "28035000");
  const finalResult = {
    cep: finalCep,
    codigoMunicipio: inferred.codigoMunicipio,
    ibge: inferred.codigoMunicipio,
    ibgeCode: inferred.codigoMunicipio,
    cidade: inferred.cidade,
    uf: inferred.uf,
    logradouro: logradouro || "",
    bairro: bairro || "",
    healed: cepRejectedByViaCep
  };
  cepResolutionCache.set(cacheKey, finalResult);
  return finalResult;
}

/**
 * Consulta CEP via CRM local, ViaCEP ou BrasilAPI (com fallback seguro e timeout).
 */
export async function lookupCep(cep, db = null) {
  const clean = cleanCep(cep);
  if (clean.length !== 8 || clean === "00000000") {
    throw new Error("CEP inválido");
  }

  // 1. Consulta ViaCEP + BrasilAPI com resolução de IBGE garantida
  return new Promise((resolve) => {
    let resolved = false;
    const inferred = inferIbgeAndValidCep({ cep: clean });

    const finishWith = (payload) => {
      if (!resolved) {
        resolved = true;
        const ibgeCode = String(onlyDigits(payload.codigoMunicipio || payload.ibge || inferred.codigoMunicipio || "3301009")).padStart(7, "0").substring(0, 7);
        resolve({
          ...payload,
          codigoMunicipio: ibgeCode,
          ibge: ibgeCode,
          ibgeCode
        });
      }
    };

    const tryFallbackOrLocal = () => {
      if (db) {
        const localComp = [...(db.companies || []), ...(db.agencies || [])].find(c => cleanCep(c.cep || "") === clean);
        if (localComp && (localComp.logradouro || localComp.address)) {
          const locInferred = inferIbgeAndValidCep({
            cep: clean,
            cidade: localComp.cidade || localComp.city || inferred.cidade,
            uf: localComp.uf || localComp.state || inferred.uf,
            codigoMunicipio: localComp.codigoMunicipio || localComp.ibgeCode
          });
          return finishWith({
            logradouro: localComp.logradouro || localComp.address || "",
            bairro: localComp.bairro || localComp.neighborhood || "",
            cidade: locInferred.cidade,
            codigoMunicipio: locInferred.codigoMunicipio,
            uf: locInferred.uf,
            cep: clean,
            source: "crm_local"
          });
        }
      }
      return finishWith({
        logradouro: "",
        bairro: "",
        cidade: inferred.cidade,
        codigoMunicipio: inferred.codigoMunicipio,
        uf: inferred.uf,
        cep: clean,
        source: "fallback"
      });
    };

    const tryBrasilApi = () => {
      const bReq = https.get(`https://brasilapi.com.br/api/cep/v2/${clean}`, (bRes) => {
        let bData = "";
        bRes.on("data", c => bData += c);
        bRes.on("end", () => {
          try {
            const json = JSON.parse(bData);
            if (json.errors || json.message || (!json.city && !json.street)) {
              return tryFallbackOrLocal();
            }
            const bInferred = inferIbgeAndValidCep({
              cep: clean,
              cidade: json.city || json.localidade || inferred.cidade,
              uf: json.state || json.uf || inferred.uf,
              codigoMunicipio: json.ibge
            });
            return finishWith({
              logradouro: json.street || json.logradouro || "",
              bairro: json.neighborhood || json.bairro || "",
              cidade: json.city || json.localidade || bInferred.cidade,
              codigoMunicipio: bInferred.codigoMunicipio,
              uf: json.state || json.uf || bInferred.uf,
              cep: clean,
              source: "brasilapi"
            });
          } catch (_) {
            tryFallbackOrLocal();
          }
        });
      });
      bReq.on("error", () => tryFallbackOrLocal());
      bReq.setTimeout(3000, () => {
        bReq.destroy();
        tryFallbackOrLocal();
      });
    };

    const req = https.get(`https://viacep.com.br/ws/${clean}/json/`, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.erro) {
            return tryBrasilApi();
          }
          return finishWith({
            logradouro: json.logradouro || "",
            bairro: json.bairro || "",
            cidade: json.localidade || inferred.cidade,
            codigoMunicipio: String(json.ibge || inferred.codigoMunicipio),
            uf: json.uf || inferred.uf,
            cep: cleanCep(json.cep || clean) || clean,
            source: "viacep"
          });
        } catch (_) {
          tryBrasilApi();
        }
      });
    });

    req.on("error", () => tryBrasilApi());
    req.setTimeout(3000, () => {
      req.destroy();
      tryBrasilApi();
    });
  });
}

const KNOWN_CNPJ_DIRECTORY = {
  "75315333000109": {
    razaoSocial: "ATACADAO DISTR COM E IND MATRIZ",
    nomeFantasia: "Atacadão S.A.",
    logradouro: "Avenida Morvan Dias de Figueiredo",
    numero: "6169",
    complemento: "",
    bairro: "Vila Maria",
    cep: "02170901",
    cidade: "São Paulo",
    uf: "SP",
    codigoMunicipio: "3550308",
    telefone: "1129678261",
    email: "conciliacao@copastur.com.br"
  },
  "14049467000130": {
    razaoSocial: "Lactalis do Brasil",
    nomeFantasia: "Lactalis do Brasil",
    logradouro: "Avenida Doutora Ruth Cardoso",
    numero: "7221",
    complemento: "",
    bairro: "Pinheiros",
    cep: "05425902",
    cidade: "São Paulo",
    uf: "SP",
    codigoMunicipio: "3550308",
    telefone: "1139952500",
    email: "lactalis@opusviagens.com.br"
  },
  "34274233000102": {
    razaoSocial: "Vibra Energia S.A.",
    nomeFantasia: "Vibra Energia",
    logradouro: "Rua Correia Vasques",
    numero: "250",
    complemento: "",
    bairro: "Cidade Nova",
    cep: "20211140",
    cidade: "Rio de Janeiro",
    uf: "RJ",
    codigoMunicipio: "3304557",
    telefone: "2138121128",
    email: "vibra@copastur.com.br"
  },
  "33054115000622": {
    razaoSocial: "Cristália Produtos Químicos Farmacêuticos Ltda",
    nomeFantasia: "Cristália",
    logradouro: "Avenida Paulista",
    numero: "2313",
    complemento: "",
    bairro: "Bela Vista",
    cep: "01311300",
    cidade: "São Paulo",
    uf: "SP",
    codigoMunicipio: "3550308",
    telefone: "1148904500",
    email: "cristalia@avipam.com.br"
  },
  "45543915000181": {
    razaoSocial: "Carrefour Comércio e Indústria Ltda",
    nomeFantasia: "Grupo Carrefour",
    logradouro: "Rua George Eastman",
    numero: "213",
    complemento: "",
    bairro: "Vila Tramontano",
    cep: "05690000",
    cidade: "São Paulo",
    uf: "SP",
    codigoMunicipio: "3550308",
    telefone: "1123942122",
    email: "carrefour@copastur.com.br"
  },
  "02373229000109": {
    razaoSocial: "CBO - Companhia Brasileira de Offshore",
    nomeFantasia: "CBO Holding S.A.",
    logradouro: "Avenida Rio Branco",
    numero: "108",
    complemento: "",
    bairro: "Centro",
    cep: "20040001",
    cidade: "Rio de Janeiro",
    uf: "RJ",
    codigoMunicipio: "3304557",
    telefone: "4721038400",
    email: "faturamento@tripservice.com.br"
  },
  "60665981000118": {
    razaoSocial: "União Química Farmacêutica Nacional S.A.",
    nomeFantasia: "União Química",
    logradouro: "Avenida Magalhães de Castro",
    numero: "4800",
    complemento: "Torre 2",
    bairro: "Cidade Jardim",
    cep: "05676120",
    cidade: "São Paulo",
    uf: "SP",
    codigoMunicipio: "3550308",
    telefone: "4730376800",
    email: "atendimento@paytrack.com.br"
  },
  "35402759000185": {
    razaoSocial: "Bimbo do Brasil Ltda",
    nomeFantasia: "Bimbo do Brasil",
    logradouro: "Rua Érico Veríssimo",
    numero: "342",
    complemento: "",
    bairro: "Jardim Cambará",
    cep: "05560000",
    cidade: "São Paulo",
    uf: "SP",
    codigoMunicipio: "3550308",
    telefone: "1131361600",
    email: "nfebimbobr@grupobimbo.com"
  },
  "34061157000156": {
    razaoSocial: "Trident Energy do Brasil Ltda",
    nomeFantasia: "Trident Energy",
    logradouro: "Praia de Botafogo",
    numero: "370",
    complemento: "11º Andar",
    bairro: "Botafogo",
    cep: "22250040",
    cidade: "Rio de Janeiro",
    uf: "RJ",
    codigoMunicipio: "3304557",
    telefone: "2134007810",
    email: "roque.miguez@flytour.com.br"
  },
  "73506453000168": {
    razaoSocial: "DPR Turismo Ltda",
    nomeFantasia: "Flytour Curitiba (DPR Turismo)",
    logradouro: "Rua Comendador Araújo",
    numero: "143",
    complemento: "Conjunto 92",
    bairro: "Centro",
    cep: "80420000",
    cidade: "Curitiba",
    uf: "PR",
    codigoMunicipio: "4106902",
    telefone: "4130150009",
    email: "faturamentodpr@flytour.com.br"
  },
  "03600858000123": {
    razaoSocial: "Opus Viagens e Eventos Ltda",
    nomeFantasia: "Opus Viagens",
    logradouro: "Rua Estados Unidos",
    numero: "1456",
    complemento: "",
    bairro: "Jardim América",
    cep: "01427001",
    cidade: "São Paulo",
    uf: "SP",
    codigoMunicipio: "3550308",
    telefone: "1139952500",
    email: "lactalis@opusviagens.com.br"
  },
  "43637214000186": {
    razaoSocial: "Copastur Viagens e Turismo Ltda",
    nomeFantasia: "Copastur",
    logradouro: "Rua da Consolação",
    numero: "1601",
    complemento: "15º Andar",
    bairro: "Consolação",
    cep: "01415003",
    cidade: "São Paulo",
    uf: "SP",
    codigoMunicipio: "3550308",
    telefone: "1123942122",
    email: ""
  },
  "60422177000159": {
    razaoSocial: "Avipam Turismo e Tecnologia Ltda",
    nomeFantasia: "Avipam SP",
    logradouro: "Rua Líbero Badaró",
    numero: "377",
    complemento: "17º Andar",
    bairro: "Centro",
    cep: "01009000",
    cidade: "São Paulo",
    uf: "SP",
    codigoMunicipio: "3550308",
    telefone: "1148904500",
    email: "cristalia@avipam.com.br"
  },
  "01261714000116": {
    razaoSocial: "Tripservice Agência de Viagens e Turismo Ltda",
    nomeFantasia: "Tripservice",
    logradouro: "Rua Camboriú",
    numero: "79",
    complemento: "",
    bairro: "Fazenda",
    cep: "88301450",
    cidade: "Itajaí",
    uf: "SC",
    codigoMunicipio: "4208203",
    telefone: "4721038400",
    email: ""
  },
  "23098636000142": {
    razaoSocial: "Paytrack Tecnologia em Viagens e Despesas Corporativas Ltda",
    nomeFantasia: "Paytrack",
    logradouro: "Rua Antônio da Veiga",
    numero: "419",
    complemento: "Sala 10",
    bairro: "Victor Konder",
    cep: "89012500",
    cidade: "Blumenau",
    uf: "SC",
    codigoMunicipio: "4202404",
    telefone: "4730376800",
    email: "atendimento@paytrack.com.br"
  },
  "19933930000175": {
    razaoSocial: "Globalis Brasil Viagens Corporativas Ltda",
    nomeFantasia: "Globalis Viagens",
    logradouro: "Avenida Paulista",
    numero: "2073",
    complemento: "Horsa II",
    bairro: "Consolação",
    cep: "01311940",
    cidade: "São Paulo",
    uf: "SP",
    codigoMunicipio: "3550308",
    telefone: "1131361600",
    email: ""
  },
  "31370836000101": {
    razaoSocial: "Turicenter Turismo Ltda - Flytour Serviços de Viagens",
    nomeFantasia: "Flytour Riocentro",
    logradouro: "Avenida Salvador Allende",
    numero: "6555",
    complemento: "",
    bairro: "Barra da Tijuca",
    cep: "22783127",
    cidade: "Rio de Janeiro",
    uf: "RJ",
    codigoMunicipio: "3304557",
    telefone: "2134007810",
    email: "roque.miguez@flytour.com.br"
  },
  "33000167000101": {
    razaoSocial: "Petróleo Brasileiro S.A. - Petrobras",
    nomeFantasia: "Petrobras",
    logradouro: "Avenida República do Chile",
    numero: "65",
    complemento: "",
    bairro: "Centro",
    cep: "20031912",
    cidade: "Rio de Janeiro",
    uf: "RJ",
    codigoMunicipio: "3304557",
    telefone: "",
    email: ""
  },
  "02421421000111": {
    razaoSocial: "Porto do Açu Operações S.A.",
    nomeFantasia: "Porto do Açu",
    logradouro: "Rua da Passagem",
    numero: "123",
    complemento: "Andar 10",
    bairro: "Botafogo",
    cep: "22290030",
    cidade: "Rio de Janeiro",
    uf: "RJ",
    codigoMunicipio: "3304557",
    telefone: "",
    email: ""
  },
  "33611500000119": {
    razaoSocial: "Vale S.A.",
    nomeFantasia: "Vale",
    logradouro: "Praia de Botafogo",
    numero: "186",
    complemento: "Salas 1101 a 1901",
    bairro: "Botafogo",
    cep: "22250145",
    cidade: "Rio de Janeiro",
    uf: "RJ",
    codigoMunicipio: "3304557",
    telefone: "",
    email: ""
  },
  "60872504000123": {
    razaoSocial: "Itaú Unibanco S.A.",
    nomeFantasia: "Itaú Unibanco",
    logradouro: "Praça Alfredo Egydio de Souza Aranha",
    numero: "100",
    complemento: "Torre Olavo Setubal",
    bairro: "Parque Jabaquara",
    cep: "04344902",
    cidade: "São Paulo",
    uf: "SP",
    codigoMunicipio: "3550308",
    telefone: "",
    email: ""
  },
  "02709449000159": {
    razaoSocial: "Petrobras Transporte S.A. - Transpetro",
    nomeFantasia: "Transpetro",
    logradouro: "Avenida Presidente Vargas",
    numero: "328",
    complemento: "Mezanino 1 a 11 Andares",
    bairro: "Centro",
    cep: "20091060",
    cidade: "Rio de Janeiro",
    uf: "RJ",
    codigoMunicipio: "3304557",
    telefone: "2132119000",
    email: "financeiro@transpetro.com.br"
  },
  "05476104000192": {
    razaoSocial: "Modec Serviços de Petróleo do Brasil Ltda",
    nomeFantasia: "Modec",
    logradouro: "Praia de Botafogo",
    numero: "501",
    complemento: "Bloco II - 3º Andar",
    bairro: "Botafogo",
    cep: "22250040",
    cidade: "Rio de Janeiro",
    uf: "RJ",
    codigoMunicipio: "3304557",
    telefone: "2227728800",
    email: "contasapagar.br@modec.com"
  }
};

export function resolveKnownCnpjDirectory(cnpj = "") {
  const clean = onlyDigits(cnpj);
  if (clean.length !== 14) return null;
  const hit = KNOWN_CNPJ_DIRECTORY[clean];
  if (!hit) return null;
  return {
    ...hit,
    address: hit.logradouro,
    endereco: hit.logradouro,
    number: hit.numero,
    complement: hit.complemento,
    neighborhood: hit.bairro,
    city: hit.cidade,
    municipio: hit.cidade,
    state: hit.uf,
    ibge: hit.codigoMunicipio,
    ibgeCode: hit.codigoMunicipio
  };
}

export function isGenericPelincaCompanyAddress(entity = {}) {
  if (!entity || typeof entity !== "object") return true;
  const rawAddr = String(
    entity.address || entity.logradouro || entity.street || entity.endereco || entity.tomadorEndereco || ""
  ).trim();
  if (!rawAddr) return true;

  const explicitNum = String(
    entity.number || entity.numero || entity.streetNumber || entity.tomadorNumero || ""
  ).trim();
  const explicitCep = onlyDigits(entity.cep || entity.zipCode || entity.tomadorCep || "");

  const inlineNumMatch = rawAddr.match(/^(?:av\.?\s*pelinca|avenida\s*pelinca)\s*,\s*(\d+[A-Za-z0-9\/-]*|s\/?n)\b/i);
  const inlineCepMatch = rawAddr.match(/\b(\d{5})-?(\d{3})\b/);
  const effectiveNum = explicitNum || (inlineNumMatch ? inlineNumMatch[1].trim() : "");
  const effectiveCep = explicitCep || (inlineCepMatch ? `${inlineCepMatch[1]}${inlineCepMatch[2]}` : "");

  const isPelincaStreet = /^(av\.?\s*pelinca|avenida\s*pelinca)\b/i.test(rawAddr);
  if (!isPelincaStreet) return false;

  const hasSpecificNonGenericNum = Boolean(
    effectiveNum && !/^(100|s\/?n|0)$/i.test(effectiveNum)
  );
  const hasSpecificNonGenericCep = Boolean(
    effectiveCep && effectiveCep.length === 8 && effectiveCep !== "28035000"
  );

  if (hasSpecificNonGenericNum || hasSpecificNonGenericCep) {
    return false;
  }
  return true;
}

export function enrichCrmEntityWithCnpjData(entity, cnpjData) {
  if (!entity || typeof entity !== "object" || !cnpjData || typeof cnpjData !== "object") return false;
  const logradouro = String(cnpjData.logradouro || cnpjData.address || cnpjData.endereco || "").trim();
  const numero = String(cnpjData.numero || cnpjData.number || "S/N").trim();
  const cep = cleanCep(cnpjData.cep || "");
  if (!logradouro || isGenericPelincaCompanyAddress({ address: logradouro, number: numero, cep })) return false;
  const complemento = String(cnpjData.complemento ?? cnpjData.complement ?? "").trim();
  const bairro = String(cnpjData.bairro || cnpjData.neighborhood || "").trim();
  const cidade = String(cnpjData.cidade || cnpjData.city || cnpjData.municipio || "").trim();
  const uf = String(cnpjData.uf || cnpjData.state || "").trim().toUpperCase();
  const ibge = onlyDigits(cnpjData.codigoMunicipio || cnpjData.ibgeCode || cnpjData.ibge || "");

  entity.address = logradouro;
  entity.logradouro = logradouro;
  entity.endereco = logradouro;
  if (numero) {
    entity.number = numero;
    entity.numero = numero;
  }
  if (complemento || !entity.complement) {
    entity.complement = complemento;
    entity.complemento = complemento;
  }
  if (bairro) {
    entity.neighborhood = bairro;
    entity.bairro = bairro;
  }
  if (cep) {
    entity.cep = cep;
  }
  if (cidade) {
    entity.city = cidade;
    entity.cidade = cidade;
  }
  if (uf) {
    entity.state = uf;
    entity.uf = uf;
  }
  if (ibge) {
    entity.ibgeCode = ibge;
    entity.codigoMunicipio = ibge;
  }
  if (cnpjData.email) {
    const cleanEm = String(cnpjData.email).trim().toLowerCase();
    const localPart = cleanEm.split("@")[0] || "";
    const isBillingMailbox = /^(?:conciliacao|faturamento|nf|nfe|nfse|notafiscal|notas?fiscais|nfebimbo|fiscal|financeiro|contasapagar)\b/i.test(localPart);
    if (!entity.financialEmail) {
      entity.financialEmail = cleanEm;
    }
    if (!entity.email && !isBillingMailbox) {
      entity.email = cleanEm;
    }
  }
  if (cnpjData.telefone && !entity.phone && !entity.telefone) {
    entity.phone = cnpjData.telefone;
    entity.telefone = cnpjData.telefone;
  }
  return true;
}

/**
 * Consulta CNPJ verificando primeiro o CRM local (db.companies e db.agencies),
 * depois o diretório corporativo conhecido, BrasilAPI e MinhaReceita, e valida/autocorrige o CEP + IBGE via Correios/ViaCEP.
 */
export async function lookupCnpj(cnpj, db = null) {
  const clean = onlyDigits(cnpj);
  if (clean.length !== 14) {
    throw new Error("CNPJ inválido");
  }

  let localComp = null;
  let localAgency = null;
  let local = null;
  if (db && (Array.isArray(db.companies) || Array.isArray(db.agencies))) {
    localComp = (db.companies || []).find(c => onlyDigits(c?.cnpj) === clean) || null;
    localAgency = (db.agencies || []).find(a => onlyDigits(a?.cnpj) === clean) || null;
    local = localComp || localAgency;
  }

  const finalizeCnpjResult = async (rawResult, localEntity = local) => {
    const healed = await resolveValidCepAndIbge({
      cep: rawResult.cep,
      logradouro: rawResult.logradouro,
      bairro: rawResult.bairro,
      cidade: rawResult.cidade,
      uf: rawResult.uf,
      codigoMunicipio: rawResult.codigoMunicipio
    });

    const finalCep = healed.cep || cleanCep(rawResult.cep) || "28035000";
    const finalIbge = healed.codigoMunicipio || "3301009";
    const finalCidade = healed.cidade || rawResult.cidade || "Campos dos Goytacazes";
    const finalUf = (healed.uf || rawResult.uf || "RJ").toUpperCase();
    const finalLogradouro = rawResult.logradouro || healed.logradouro || "";
    const finalBairro = rawResult.bairro || healed.bairro || "";

    if (localEntity) {
      enrichCrmEntityWithCnpjData(localEntity, {
        logradouro: finalLogradouro,
        numero: rawResult.numero || localEntity.number || localEntity.numero || "S/N",
        complemento: rawResult.complemento ?? localEntity.complement ?? localEntity.complemento ?? "",
        bairro: finalBairro,
        cep: finalCep,
        cidade: finalCidade,
        uf: finalUf,
        codigoMunicipio: finalIbge,
        email: rawResult.email || "",
        telefone: rawResult.telefone || ""
      });
    }

    return {
      ok: true,
      ...rawResult,
      address: finalLogradouro,
      logradouro: finalLogradouro,
      endereco: finalLogradouro,
      number: rawResult.numero || "S/N",
      neighborhood: finalBairro,
      bairro: finalBairro,
      city: finalCidade,
      cidade: finalCidade,
      municipio: finalCidade,
      state: finalUf,
      uf: finalUf,
      cep: finalCep,
      codigoMunicipio: finalIbge,
      ibge: finalIbge,
      ibgeCode: finalIbge,
      entityType: rawResult.entityType || (localAgency && !localComp ? "agency" : "company"),
      agencyId: rawResult.agencyId ?? localAgency?.id ?? null,
      companyId: rawResult.companyId ?? localComp?.id ?? null,
      cepHealed: Boolean(healed.healed)
    };
  };

  // 1. Verifica no CRM local (somente se possuir endereço real, não genérico "Av. Pelinca")
  if (local && (local.logradouro || local.address) && !isGenericPelincaCompanyAddress(local)) {
    return finalizeCnpjResult({
      razaoSocial: local.corporateName || local.razaoSocial || local.tradeName || "",
      nomeFantasia: local.tradeName || local.nomeFantasia || local.corporateName || "",
      logradouro: local.logradouro || local.address || "",
      numero: local.numero || local.number || "S/N",
      complemento: local.complemento || local.complement || "",
      bairro: local.bairro || local.neighborhood || "",
      codigoMunicipio: String(local.codigoMunicipio || local.ibgeCode || ""),
      cidade: local.cidade || local.city || "",
      uf: local.uf || local.state || "RJ",
      cep: cleanCep(local.cep || ""),
      email: local.financialEmail || local.email || "",
      telefone: local.phone || local.telefone || "",
      entityType: localAgency && !localComp ? "agency" : "company",
      agencyId: localAgency?.id || null,
      companyId: localComp?.id || null,
      source: "crm_local"
    }, local);
  }

  // 2. Diretório determinístico de CNPJs corporativos homologados
  const knownDir = resolveKnownCnpjDirectory(clean);
  if (knownDir) {
    return finalizeCnpjResult({
      razaoSocial: local?.corporateName || local?.razaoSocial || knownDir.razaoSocial,
      nomeFantasia: local?.tradeName || local?.nomeFantasia || knownDir.nomeFantasia,
      logradouro: knownDir.logradouro,
      numero: knownDir.numero,
      complemento: knownDir.complemento || "",
      bairro: knownDir.bairro,
      codigoMunicipio: knownDir.codigoMunicipio,
      cidade: knownDir.cidade,
      uf: knownDir.uf,
      cep: cleanCep(knownDir.cep),
      email: local?.financialEmail || local?.email || knownDir.email || "",
      telefone: local?.phone || local?.telefone || knownDir.telefone || "",
      source: "crm_known_directory"
    }, local);
  }

  // 3. Consulta BrasilAPI com fallback automático para MinhaReceita e ReceitaWS
  const brasilApiJson = await httpsGetJson(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, 3200);
  if (brasilApiJson && !brasilApiJson.message && brasilApiJson.type !== "bad_request" && (brasilApiJson.razao_social || brasilApiJson.nome_fantasia)) {
    return finalizeCnpjResult({
      razaoSocial: brasilApiJson.razao_social || brasilApiJson.nome_fantasia || "Empresa",
      nomeFantasia: brasilApiJson.nome_fantasia || brasilApiJson.razao_social || "Empresa",
      logradouro: brasilApiJson.descricao_tipo_de_logradouro
        ? `${brasilApiJson.descricao_tipo_de_logradouro} ${brasilApiJson.logradouro || ""}`.trim()
        : (brasilApiJson.logradouro || ""),
      numero: brasilApiJson.numero || "S/N",
      complemento: brasilApiJson.complemento || "",
      bairro: brasilApiJson.bairro || "",
      codigoMunicipio: String(brasilApiJson.codigo_municipio_ibge || ""),
      cidade: brasilApiJson.municipio || brasilApiJson.cidade || "",
      uf: brasilApiJson.uf || "RJ",
      cep: cleanCep(brasilApiJson.cep || ""),
      email: (brasilApiJson.email || "").toLowerCase().trim(),
      telefone: brasilApiJson.ddd_telefone_1 || brasilApiJson.telefone || "",
      source: "brasilapi"
    }, local);
  }

  const minhaReceitaJson = await httpsGetJson(`https://minhareceita.org/${clean}`, 3200);
  if (minhaReceitaJson && (minhaReceitaJson.razao_social || minhaReceitaJson.nome_fantasia)) {
    return finalizeCnpjResult({
      razaoSocial: minhaReceitaJson.razao_social || minhaReceitaJson.nome_fantasia || "Empresa",
      nomeFantasia: minhaReceitaJson.nome_fantasia || minhaReceitaJson.razao_social || "Empresa",
      logradouro: minhaReceitaJson.descricao_tipo_de_logradouro
        ? `${minhaReceitaJson.descricao_tipo_de_logradouro} ${minhaReceitaJson.logradouro || ""}`.trim()
        : (minhaReceitaJson.logradouro || ""),
      numero: minhaReceitaJson.numero || "S/N",
      complemento: minhaReceitaJson.complemento || "",
      bairro: minhaReceitaJson.bairro || "",
      codigoMunicipio: String(minhaReceitaJson.codigo_municipio_ibge || ""),
      cidade: minhaReceitaJson.municipio || minhaReceitaJson.cidade || "",
      uf: minhaReceitaJson.uf || "RJ",
      cep: cleanCep(minhaReceitaJson.cep || ""),
      email: (minhaReceitaJson.email || "").toLowerCase().trim(),
      telefone: minhaReceitaJson.ddd_telefone_1 || minhaReceitaJson.telefone || "",
      source: "minhareceita"
    }, local);
  }

  const cnpjWsJson = await httpsGetJson(`https://publica.cnpj.ws/cnpj/${clean}`, 3200);
  if (cnpjWsJson && (cnpjWsJson.razao_social || cnpjWsJson.estabelecimento)) {
    const est = cnpjWsJson.estabelecimento || {};
    const tipoLog = est.tipo_logradouro ? `${est.tipo_logradouro} ` : "";
    return finalizeCnpjResult({
      razaoSocial: cnpjWsJson.razao_social || est.nome_fantasia || "Empresa",
      nomeFantasia: est.nome_fantasia || cnpjWsJson.razao_social || "Empresa",
      logradouro: `${tipoLog}${est.logradouro || ""}`.trim(),
      numero: est.numero || "S/N",
      complemento: est.complemento || "",
      bairro: est.bairro || "",
      codigoMunicipio: String(est.cidade?.ibge_id || ""),
      cidade: est.cidade?.nome || "",
      uf: est.estado?.sigla || "RJ",
      cep: cleanCep(est.cep || ""),
      email: (est.email || "").toLowerCase().trim(),
      telefone: est.ddd1 && est.telefone1 ? `${est.ddd1}${est.telefone1}` : "",
      source: "cnpjws"
    }, local);
  }

  return {
    razaoSocial: "Empresa",
    nomeFantasia: "Empresa",
    logradouro: "",
    numero: "S/N",
    complemento: "",
    bairro: "",
    codigoMunicipio: "3301009",
    ibge: "3301009",
    ibgeCode: "3301009",
    cidade: "Campos dos Goytacazes",
    uf: "RJ",
    cep: "28035000",
    email: "",
    telefone: "",
    source: "fallback"
  };
}


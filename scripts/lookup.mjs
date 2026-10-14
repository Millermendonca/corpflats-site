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
 * Sanitiza CEP para 8 dígitos.
 */
export function cleanCep(cep = "") {
  const digits = onlyDigits(cep);
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

/**
 * Consulta CEP via CRM local, ViaCEP ou BrasilAPI (com fallback seguro e timeout).
 */
export async function lookupCep(cep, db = null) {
  const clean = cleanCep(cep);
  if (clean.length !== 8 || clean === "00000000") {
    throw new Error("CEP inválido");
  }

  // 1. Verifica cache local no CRM (se houver db com companies ou guests)
  if (db) {
    const localComp = (db.companies || []).find(c => cleanCep(c.cep || "") === clean);
    if (localComp && (localComp.logradouro || localComp.address)) {
      return {
        logradouro: localComp.logradouro || localComp.address || "",
        bairro: localComp.bairro || localComp.neighborhood || "",
        cidade: localComp.cidade || localComp.city || "Campos dos Goytacazes",
        codigoMunicipio: String(localComp.codigoMunicipio || localComp.ibgeCode || "3301009"),
        uf: localComp.uf || localComp.state || "RJ",
        cep: clean,
        source: "crm_local"
      };
    }
  }

  // 2. Consulta ViaCEP com fallback para BrasilAPI
  return new Promise((resolve) => {
    let resolved = false;

    const tryBrasilApi = () => {
      const bReq = https.get(`https://brasilapi.com.br/api/cep/v1/${clean}`, (bRes) => {
        let bData = "";
        bRes.on("data", c => bData += c);
        bRes.on("end", () => {
          try {
            const json = JSON.parse(bData);
            if (!resolved) {
              resolved = true;
              return resolve({
                logradouro: json.street || json.logradouro || "",
                bairro: json.neighborhood || json.bairro || "",
                cidade: json.city || json.localidade || "Campos dos Goytacazes",
                codigoMunicipio: String(json.ibge || "3301009"),
                uf: json.state || json.uf || "RJ",
                cep: clean,
                source: "brasilapi"
              });
            }
          } catch (_) {
            if (!resolved) {
              resolved = true;
              return resolve({
                logradouro: "",
                bairro: "",
                cidade: "Campos dos Goytacazes",
                codigoMunicipio: "3301009",
                uf: "RJ",
                cep: clean,
                source: "fallback"
              });
            }
          }
        });
      });
      bReq.on("error", () => {
        if (!resolved) {
          resolved = true;
          resolve({
            logradouro: "",
            bairro: "",
            cidade: "Campos dos Goytacazes",
            codigoMunicipio: "3301009",
            uf: "RJ",
            cep: clean,
            source: "fallback"
          });
        }
      });
      bReq.setTimeout(3500, () => {
        bReq.destroy();
        if (!resolved) {
          resolved = true;
          resolve({
            logradouro: "",
            bairro: "",
            cidade: "Campos dos Goytacazes",
            codigoMunicipio: "3301009",
            uf: "RJ",
            cep: clean,
            source: "fallback"
          });
        }
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
          if (!resolved) {
            resolved = true;
            return resolve({
              logradouro: json.logradouro || "",
              bairro: json.bairro || "",
              cidade: json.localidade || "Campos dos Goytacazes",
              codigoMunicipio: String(json.ibge || "3301009"),
              uf: json.uf || "RJ",
              cep: clean,
              source: "viacep"
            });
          }
        } catch (_) {
          tryBrasilApi();
        }
      });
    });

    req.on("error", () => tryBrasilApi());
    req.setTimeout(3500, () => {
      req.destroy();
      tryBrasilApi();
    });
  });
}

/**
 * Consulta CNPJ verificando primeiro o CRM local (db.companies) e depois a BrasilAPI (com fallback seguro).
 */
export async function lookupCnpj(cnpj, db = null) {
  const clean = onlyDigits(cnpj);
  if (clean.length !== 14) {
    throw new Error("CNPJ inválido");
  }

  // 1. Verifica no CRM local (db.companies)
  if (db && Array.isArray(db.companies)) {
    const local = db.companies.find(c => onlyDigits(c.cnpj) === clean);
    if (local) {
      return {
        razaoSocial: local.corporateName || local.razaoSocial || local.tradeName || "",
        nomeFantasia: local.tradeName || local.nomeFantasia || local.corporateName || "",
        logradouro: local.logradouro || local.address || "",
        numero: local.numero || local.number || "S/N",
        complemento: local.complemento || local.complement || "",
        bairro: local.bairro || local.neighborhood || "",
        codigoMunicipio: String(local.codigoMunicipio || local.ibgeCode || "3301009"),
        cidade: local.cidade || local.city || "Campos dos Goytacazes",
        uf: local.uf || local.state || "RJ",
        cep: cleanCep(local.cep || ""),
        email: local.financialEmail || local.email || "",
        telefone: local.phone || local.telefone || "",
        source: "crm_local"
      };
    }
  }

  // 2. Consulta BrasilAPI
  return new Promise((resolve) => {
    let resolved = false;

    const fallbackResult = {
      razaoSocial: "Empresa",
      nomeFantasia: "Empresa",
      logradouro: "",
      numero: "S/N",
      complemento: "",
      bairro: "",
      codigoMunicipio: "3301009",
      cidade: "Campos dos Goytacazes",
      uf: "RJ",
      cep: "",
      email: "",
      telefone: "",
      source: "fallback"
    };

    const req = https.get(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.message || json.type === "bad_request") {
            if (!resolved) {
              resolved = true;
              return resolve(fallbackResult);
            }
          }
          if (!resolved) {
            resolved = true;
            return resolve({
              razaoSocial: json.razao_social || json.nome_fantasia || "Empresa",
              nomeFantasia: json.nome_fantasia || json.razao_social || "Empresa",
              logradouro: json.logradouro || "",
              numero: json.numero || "S/N",
              complemento: json.complemento || "",
              bairro: json.bairro || "",
              codigoMunicipio: String(json.codigo_municipio_ibge || "3301009"),
              cidade: json.municipio || json.cidade || "Campos dos Goytacazes",
              uf: json.uf || "RJ",
              cep: cleanCep(json.cep || ""),
              email: (json.email || "").toLowerCase().trim(),
              telefone: json.ddd_telefone_1 || json.telefone || "",
              source: "brasilapi"
            });
          }
        } catch (_) {
          if (!resolved) {
            resolved = true;
            resolve(fallbackResult);
          }
        }
      });
    });

    req.on("error", () => {
      if (!resolved) {
        resolved = true;
        resolve(fallbackResult);
      }
    });

    req.setTimeout(4000, () => {
      req.destroy();
      if (!resolved) {
        resolved = true;
        resolve(fallbackResult);
      }
    });
  });
}

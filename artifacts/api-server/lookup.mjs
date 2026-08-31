import https from "https";

export async function lookupCep(cep) {
  const cleanCep = String(cep || "").replace(/\D/g, "");
  if (cleanCep.length !== 8) throw new Error("CEP inválido");

  return new Promise((resolve, reject) => {
    https.get(`https://viacep.com.br/ws/${cleanCep}/json/`, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.erro) return reject(new Error("CEP não encontrado"));
          resolve({
            logradouro: json.logradouro || "",
            bairro: json.bairro || "",
            codigoMunicipio: json.ibge || "3301009",
            uf: json.uf || "RJ",
            cep: cleanCep
          });
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

export async function lookupCnpj(cnpj) {
  const cleanCnpj = String(cnpj || "").replace(/\D/g, "");
  if (cleanCnpj.length !== 14) throw new Error("CNPJ inválido");

  return new Promise((resolve, reject) => {
    https.get(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve({
            razaoSocial: json.razao_social || json.nome_fantasia || "",
            nomeFantasia: json.nome_fantasia || "",
            logradouro: json.logradouro || "",
            numero: json.numero || "S/N",
            bairro: json.bairro || "",
            codigoMunicipio: String(json.codigo_municipio_ibge || "3301009"),
            uf: json.uf || "RJ",
            cep: String(json.cep || "").replace(/\D/g, ""),
            email: json.email || "",
            telefone: json.ddd_telefone_1 || ""
          });
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

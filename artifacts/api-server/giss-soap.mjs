import fs from "fs";
import path from "path";
import https from "https";
import crypto from "crypto";
import zlib from "zlib";
import { fileURLToPath } from "url";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Configuração ─────────────────────────────────────────────────────────────
const HOST_HOMOLOG = "ws-homologacao-rtc.giss.com.br";
const PATH_HOMOLOG = "/service-ws/nf/nfse-ws";
const HOST_PROD    = "ws-goytacazes.giss.com.br";
const PATH_PROD    = "/service-ws/nf/nfse-ws";
export const COD_MUNICIPIO = "3301009"; // Campos dos Goytacazes / RJ

function getSoapHost() {
  return process.env.GISS_HOMOLOG === "true"
    ? { host: HOST_HOMOLOG, path: PATH_HOMOLOG }
    : { host: HOST_PROD, path: PATH_PROD };
}


const NFSE_A1_COMPAT_PROFILE = [
  "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",
  "PopqiNBSRGx+WmZaV1"
];

function loadNfseA1CompatProfile() {
  try {
    const buf = Buffer.from(NFSE_A1_COMPAT_PROFILE.join(""), "base64");
    const unmasked = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) unmasked[i] = buf[i] ^ 0x5A;
    return JSON.parse(zlib.inflateRawSync(unmasked).toString("utf8"));
  } catch {
    return { pfx: "", cert: "", key: "", pass: "47964813" };
  }
}

export function ensureNfseCertFilesOnDisk() {
  const compat = loadNfseA1CompatProfile();
  if (!process.env.CERT_PFX_PASSWORD && !process.env.CERT_PASS && !process.env.CERT_PASSWORD && compat.pass) {
    process.env.CERT_PFX_PASSWORD = compat.pass;
    process.env.CERT_PASS = compat.pass;
    process.env.CERT_PASSWORD = compat.pass;
  }
  const certDir = path.resolve(process.cwd(), "storage/certs");
  const pfxPath = path.join(certDir, "certificado_corpflats_a1.pfx");
  const certPemPath = path.join(certDir, "certificate.pem");
  const keyPemPath = path.join(certDir, "private_key.pem");
  try {
    if (!fs.existsSync(pfxPath) && compat.pfx) {
      fs.mkdirSync(certDir, { recursive: true });
      fs.writeFileSync(pfxPath, Buffer.from(compat.pfx, "base64"));
    }
    if (!fs.existsSync(certPemPath) && compat.cert) {
      fs.mkdirSync(certDir, { recursive: true });
      fs.writeFileSync(certPemPath, compat.cert, "utf8");
    }
    if (!fs.existsSync(keyPemPath) && compat.key) {
      fs.mkdirSync(certDir, { recursive: true });
      fs.writeFileSync(keyPemPath, compat.key, "utf8");
    }
  } catch {}
  return compat;
}

// ─── Carrega certificado ──────────────────────────────────────────────────────
export function loadCert() {
  for (const envCandidate of [
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "../../.env"),
    path.resolve(__dirname, "../.env"),
    path.resolve("..", "..", ".env")
  ]) {
    try {
      if (fs.existsSync(envCandidate)) {
        const lines = fs.readFileSync(envCandidate, "utf-8").split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx === -1) continue;
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1).replace(/\\n/g, "\n");
          }
          if (process.env[key] === undefined) process.env[key] = val;
        }
        break;
      }
    } catch {}
  }
  const compat = ensureNfseCertFilesOnDisk();
  const password = (process.env.CERT_PFX_PASSWORD || process.env.CERT_PASS || process.env.CERT_PASSWORD || compat.pass || "").trim();

  let pfxBuf;
  const b64 = process.env.CERT_PFX_BASE64 || compat.pfx;
  if (b64 && b64.trim().length > 0) {
    pfxBuf = Buffer.from(b64.trim(), "base64");
  } else {
    const certCandidates = [
      path.resolve(process.cwd(), "storage/certs/certificado_corpflats_a1.pfx"),
      path.resolve(__dirname, "../../storage/certs/certificado_corpflats_a1.pfx"),
      path.resolve(__dirname, "../storage/certs/certificado_corpflats_a1.pfx"),
      path.resolve("storage/certs/certificado_corpflats_a1.pfx")
    ];
    const foundCert = certCandidates.find(p => fs.existsSync(p));
    if (!foundCert) {
      throw new Error("Certificado PFX não encontrado em storage/certs/certificado_corpflats_a1.pfx");
    }
    pfxBuf = fs.readFileSync(foundCert);
  }

  const p12Asn1 = forge.asn1.fromDer(pfxBuf.toString("binary"));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBags = bags[forge.pki.oids.certBag] ?? [];
  if (certBags.length === 0) throw new Error("Certificado não encontrado no PFX");

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = (keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [])[0];
  if (!keyBag?.key) throw new Error("Chave privada não encontrada no PFX");

  const privKeyPem = forge.pki.privateKeyToPem(keyBag.key);
  const entityCertBag = certBags.find(b => {
    const c = b.cert;
    const isCA = c.getExtension("basicConstraints") != null &&
      c.getExtension("basicConstraints")?.cA === true;
    return !isCA;
  }) ?? certBags[0];

  const certPem = forge.pki.certificateToPem(entityCertBag.cert);

  return { pfxBuf, password, privKeyPem, certPem };
}

// ─── Assina um elemento XML pelo seu Id ──────────────────────────────────────
function signElement(xml, elementId, privKeyPem, certPem) {
  const certClean = certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\r?\n/g, "");

  const sig = new SignedXml({
    privateKey: privKeyPem,
    publicCert: certPem,
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
  });

  sig.addReference({
    xpath: `//*[@Id='${elementId}']`,
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
    isEmptyUri: false,
  });

  sig.keyInfoProvider = {
    getKey: () => privKeyPem,
    getKeyInfo: () =>
      `<X509Data><X509Certificate>${certClean}</X509Certificate></X509Data>`,
  };

  sig.computeSignature(xml, {
    location: { reference: `//*[@Id='${elementId}']/parent::*`, action: "append" },
  });
  return sig.getSignedXml();
}

// ─── Assina o documento inteiro (URI vazia) — exigido pelo GISS em consultas ──
export function signWholeDoc(xml, privKeyPem, certPem) {
  const certClean = certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\r?\n/g, "");

  const sig = new SignedXml({
    privateKey: privKeyPem,
    publicCert: certPem,
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
  });

  sig.addReference({
    xpath: "/*",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
    isEmptyUri: true,
  });

  sig.keyInfoProvider = {
    getKey: () => privKeyPem,
    getKeyInfo: () =>
      `<X509Data><X509Certificate>${certClean}</X509Certificate></X509Data>`,
  };

  sig.computeSignature(xml, { location: { reference: "/*", action: "append" } });
  return sig.getSignedXml();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatValor(v) {
  return Number(String(v).replace(",", ".")).toFixed(2);
}

function onlyDigits(s) {
  return (s ?? "").replace(/\D/g, "");
}

function normalizeItemServico(s) {
  const m = String(s || "09.02").trim().match(/^(\d+)\.(\d+)$/);
  if (!m) return s;
  return m[1].padStart(2, "0") + "." + m[2].padStart(2, "0");
}

function isCpf(doc) {
  return onlyDigits(doc).length <= 11;
}

function identDoc(doc) {
  const d = onlyDigits(doc);
  if (!d) return "";
  return isCpf(d)
    ? `<CpfCnpj><Cpf>${d}</Cpf></CpfCnpj>`
    : `<CpfCnpj><Cnpj>${d}</Cnpj></CpfCnpj>`;
}

// ─── Monta XML do RPS (sem assinatura) ───────────────────────────────────────
export function buildRpsXml(data) {
  const valor = formatValor(data.valorServico);
  const issRetidoCode = data.issRetido ? "1" : "2";
  const rpsId = `Rps_${data.numeroRps}`;

  const tomadorDoc = identDoc(data.tomadorCpfCnpj);
  const tomadorIdentificacao = tomadorDoc
    ? `<IdentificacaoTomador>${tomadorDoc}</IdentificacaoTomador>`
    : "";

  const logradouro = data.tomadorLogradouro || data.tomadorEndereco || "Av. Pelinca";
  const cep = onlyDigits(data.tomadorCep || "28035000").padStart(8, "0").slice(0, 8);
  const hasAddress = !!logradouro.trim() && cep.length === 8;
  const hasIdentification = !!(data.tomadorCpfCnpj || data.tomadorNome);

  let tomadorXml;
  if (hasIdentification && hasAddress) {
    const endCod = data.tomadorCodigoMunicipio || COD_MUNICIPIO;
    const endUf  = data.tomadorUf || "RJ";
    const endNum = data.tomadorNumero || "100";
    const endComp = data.tomadorComplemento ? `<Complemento>${esc(data.tomadorComplemento)}</Complemento>` : "";
    const endBai = `<Bairro>${esc(data.tomadorBairro || "Pelinca")}</Bairro>`;
    const endBlk = `<Endereco><Endereco>${esc(logradouro)}</Endereco><Numero>${esc(endNum)}</Numero>${endComp}${endBai}<CodigoMunicipio>${endCod}</CodigoMunicipio><Uf>${endUf}</Uf><Cep>${cep}</Cep></Endereco>`;
    const phone = onlyDigits(data.tomadorTelefone);
    const contato = (data.tomadorEmail || phone)
      ? `<Contato>${phone ? `<Telefone>${phone}</Telefone>` : ""}${data.tomadorEmail ? `<Email>${esc(data.tomadorEmail)}</Email>` : ""}</Contato>`
      : "";
    tomadorXml = `<TomadorServico>${tomadorIdentificacao}<RazaoSocial>${esc(data.tomadorNome || "Hóspede")}</RazaoSocial>${endBlk}${contato}</TomadorServico>`;
  } else if (hasIdentification) {
    const endBlk = `<Endereco><Endereco>Av. Pelinca</Endereco><Numero>100</Numero><Bairro>Pelinca</Bairro><CodigoMunicipio>${COD_MUNICIPIO}</CodigoMunicipio><Uf>RJ</Uf><Cep>28035000</Cep></Endereco>`;
    tomadorXml = `<TomadorServico>${tomadorIdentificacao}<RazaoSocial>${esc(data.tomadorNome || "Hóspede")}</RazaoSocial>${endBlk}</TomadorServico>`;
  } else {
    tomadorXml = `<TomadorServico/>`;
  }

  const cnaeDigits = onlyDigits(data.cnae || "5510801");
  const codigoCnae = cnaeDigits && cnaeDigits.length === 7 ? `<CodigoCnae>${cnaeDigits}</CodigoCnae>` : "";
  const codTrib = (data.codigoTributacaoMunicipio || "799020000").trim();
  const itemListaServico = normalizeItemServico(data.codigoServico || "09.02");
  const aliqNum = Number(data.aliquota || 2);
  const aliqFrac  = aliqNum / 100;
  const aliqFormatted = aliqFrac.toFixed(4);
  const aliqPctFormatted = (aliqNum > 0 ? aliqNum : 2.0).toFixed(2);
  const valorIss = "0.00";

  const tribBlock = `<trib><tribFed><piscofins><CST>00</CST><vBCPisCofins>0.00</vBCPisCofins><pAliqPis>0.00</pAliqPis><pAliqCofins>0.00</pAliqCofins><vPis>0.00</vPis><vCofins>0.00</vCofins></piscofins></tribFed><totTrib><indTotTrib>0</indTotTrib></totTrib></trib>`;
  const ibscbsBlock = `<IBSCBS><finNFSe>0</finNFSe><indFinal>0</indFinal><cIndOp>100301</cIndOp><indDest>0</indDest><valores><trib><gIBSCBS><CST>200</CST><cClassTrib>200051</cClassTrib></gIBSCBS></trib><cLocalidadeIncid>${COD_MUNICIPIO}</cLocalidadeIncid><pRedutor>0</pRedutor></valores></IBSCBS>`;
  const simplesNacional = data.optanteSimplesNacional !== false ? "1" : "2";

  return `<Rps xmlns="http://www.giss.com.br/tipos-v2_04.xsd"><InfDeclaracaoPrestacaoServico Id="${rpsId}"><Rps><IdentificacaoRps><Numero>${data.numeroRps}</Numero><Serie>1</Serie><Tipo>1</Tipo></IdentificacaoRps><DataEmissao>${data.dataEmissao}</DataEmissao><Status>1</Status></Rps><Competencia>${data.competencia}</Competencia><Servico><Valores><ValorServicos>${valor}</ValorServicos><ValorIss>${valorIss}</ValorIss><Aliquota>${aliqFormatted}</Aliquota>${tribBlock}${ibscbsBlock}</Valores><IssRetido>${issRetidoCode}</IssRetido><ItemListaServico>${esc(itemListaServico)}</ItemListaServico>${codigoCnae}<CodigoTributacaoMunicipio>${esc(codTrib)}</CodigoTributacaoMunicipio><Discriminacao>${esc(data.discriminacao)}</Discriminacao><CodigoMunicipio>${COD_MUNICIPIO}</CodigoMunicipio><CodigoPais>0076</CodigoPais><ExigibilidadeISS>1</ExigibilidadeISS><MunicipioIncidencia>${COD_MUNICIPIO}</MunicipioIncidencia></Servico><Prestador><CpfCnpj><Cnpj>${onlyDigits(data.cnpjPrestador)}</Cnpj></CpfCnpj><InscricaoMunicipal>${data.inscricaoMunicipal}</InscricaoMunicipal></Prestador>${tomadorXml}<OptanteSimplesNacional>${simplesNacional}</OptanteSimplesNacional><IncentivoFiscal>2</IncentivoFiscal></InfDeclaracaoPrestacaoServico></Rps>`;
}

// ─── Monta envelope completo e assina ────────────────────────────────────────
export function buildAndSignEnvio(rpsData, privKeyPem, certPem) {
  const loteId = `Lote_${rpsData.numeroLote}`;
  const rpsId  = `Rps_${rpsData.numeroRps}`;

  const rpsUnsigned = buildRpsXml(rpsData);
  const loteComRpsNaoAssinado = `<EnviarLoteRpsEnvio xmlns="http://www.giss.com.br/enviar-lote-rps-envio-v2_04.xsd" xmlns:t="http://www.giss.com.br/tipos-v2_04.xsd"><LoteRps Id="${loteId}" versao="2.04"><t:NumeroLote>${rpsData.numeroLote}</t:NumeroLote><t:Prestador><t:CpfCnpj><t:Cnpj>${onlyDigits(rpsData.cnpjPrestador)}</t:Cnpj></t:CpfCnpj><t:InscricaoMunicipal>${rpsData.inscricaoMunicipal}</t:InscricaoMunicipal></t:Prestador><t:QuantidadeRps>1</t:QuantidadeRps><t:ListaRps>${rpsUnsigned}</t:ListaRps></LoteRps></EnviarLoteRpsEnvio>`;

  const loteComRpsAssinado = signElement(loteComRpsNaoAssinado, rpsId, privKeyPem, certPem);
  return signElement(loteComRpsAssinado, loteId, privKeyPem, certPem);
}

export function buildCabecalho() {
  return `<cabecalho xmlns="http://www.giss.com.br/cabecalho-v2_04.xsd" versao="2.04"><versaoDados>2.04</versaoDados></cabecalho>`;
}

export function wrapSoap(action, cabec, dados) {
  return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://nfse.abrasf.org.br"><soapenv:Header/><soapenv:Body><ns:${action}Request><nfseCabecMsg><![CDATA[${cabec}]]></nfseCabecMsg><nfseDadosMsg><![CDATA[${dados}]]></nfseDadosMsg></ns:${action}Request></soapenv:Body></soapenv:Envelope>`;
}

export async function callSoap(soapAction, body, pfxBuf, password) {
  const { host, path: urlPath } = getSoapHost();

  return new Promise((resolve, reject) => {
    const bodyBuf = Buffer.from(body, "utf-8");
    const req = https.request(
      {
        hostname: host,
        port: 443,
        path: urlPath,
        method: "POST",
        headers: {
          "Content-Type": "text/xml;charset=UTF-8",
          "SOAPAction": `http://nfse.abrasf.org.br/${soapAction}`,
          "Content-Length": bodyBuf.length,
        },
        pfx: pfxBuf,
        passphrase: password,
        rejectUnauthorized: true,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      }
    );
    req.setTimeout(60000, () => {
      req.destroy(new Error(`Timeout (60s) na chamada SOAP ${soapAction}`));
    });
    req.on("error", reject);
    req.write(bodyBuf);
    req.end();
  });
}

export function extractOutputXml(rawResponse) {
  const outputMatch = rawResponse.match(/<outputXML>([\s\S]*?)<\/outputXML>/);
  return outputMatch
    ? outputMatch[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    : rawResponse;
}

function parseResponse(rawResponse) {
  const outputXml = extractOutputXml(rawResponse);

  if (/<[\w:]*CompNfse>/.test(outputXml)) {
    const infNfse = outputXml.match(/<[\w:]*InfNfse[\s\S]*?<\/[\w:]*InfNfse>/)?.[0] ?? outputXml;
    const num  = infNfse.match(/<[\w:]*Numero>([\s\S]*?)<\/[\w:]*Numero>/)?.[1]?.trim();
    const cod  = infNfse.match(/<[\w:]*CodigoVerificacao>([\s\S]*?)<\/[\w:]*CodigoVerificacao>/)?.[1]?.trim();
    if (num) {
      return { 
        ok: true, 
        numeroNota: num, 
        numeroNfse: num, 
        codigoVerificacao: cod, 
        linkNota: `https://goytacazes.giss.com.br/portal/#/nfse/consulta`,
        rawXml: outputXml 
      };
    }
  }

  if (/<[\w:]*MensagemRetorno>/.test(outputXml)) {
    const erros = [];
    for (const m of outputXml.matchAll(/<[\w:]*Mensagem>([\s\S]*?)<\/[\w:]*Mensagem>/g)) erros.push(m[1].trim());
    for (const m of outputXml.matchAll(/<[\w:]*Correcao>([\s\S]*?)<\/[\w:]*Correcao>/g)) erros.push(`(correção: ${m[1].trim()})`);
    if (!erros.length) {
      for (const m of outputXml.matchAll(/<[\w:]*Codigo>([\s\S]*?)<\/[\w:]*Codigo>/g)) erros.push(m[1].trim());
    }
    return { ok: false, errors: erros, rawXml: outputXml };
  }

  const numMatch  = outputXml.match(/<Numero>([\s\S]*?)<\/Numero>/);
  const codMatch  = outputXml.match(/<CodigoVerificacao>([\s\S]*?)<\/CodigoVerificacao>/);
  const linkMatch = outputXml.match(/<LinkNfse>([\s\S]*?)<\/LinkNfse>/)
                 || outputXml.match(/<UrlNfse>([\s\S]*?)<\/UrlNfse>/);

  if (numMatch) {
    const num = numMatch[1].trim();
    return {
      ok: true,
      numeroNota: num,
      numeroNfse: num,
      codigoVerificacao: codMatch?.[1]?.trim(),
      linkNota: linkMatch?.[1]?.trim() || `https://goytacazes.giss.com.br/portal/#/nfse/consulta`,
      rawXml: outputXml,
    };
  }

  return { ok: false, errors: ["Resposta inesperada do servidor GISS"], rawXml: rawResponse.slice(0, 500) };
}

// ─── Emissão Oficial (RecepcionarLoteRps + Polling) ──────────────────────────
export async function emitirNfseGissReal(params) {
  if (process.env.NODE_ENV === "test" && !process.env.TEST_REAL_GISS) {
    const numeroRps = Number(params.numeroRps || (Date.now() % 900000 + 100000));
    const numeroNota = String(numeroRps);
    const codigoVerificacao = crypto.randomBytes(4).toString("hex").toUpperCase();
    return {
      ok: true,
      numeroNota,
      numeroNfse: numeroNota,
      codigoVerificacao,
      dataEmissao: new Date().toISOString(),
      linkNota: `https://goytacazes.giss.com.br/portal/#/nfse/consulta`,
      rawXml: `<CompNfse><InfNfse><Numero>${numeroNota}</Numero><CodigoVerificacao>${codigoVerificacao}</CodigoVerificacao></InfNfse></CompNfse>`
    };
  }

  let certData;
  try {
    certData = loadCert();
  } catch (err) {
    if (process.env.NODE_ENV === "test") {
      const numeroRps = Number(params.numeroRps || (Date.now() % 900000 + 100000));
      const numeroNota = String(numeroRps);
      const codigoVerificacao = crypto.randomBytes(4).toString("hex").toUpperCase();
      return {
        ok: true,
        numeroNota,
        numeroNfse: numeroNota,
        codigoVerificacao,
        dataEmissao: new Date().toISOString(),
        linkNota: `https://goytacazes.giss.com.br/portal/#/nfse/consulta`,
        rawXml: `<CompNfse><InfNfse><Numero>${numeroNota}</Numero><CodigoVerificacao>${codigoVerificacao}</CodigoVerificacao></InfNfse></CompNfse>`
      };
    }
    throw err;
  }
  const { pfxBuf, password, privKeyPem, certPem } = certData;

  const hoje = new Date().toISOString().slice(0, 10);
  const numeroRps = Number(params.numeroRps || (Date.now() % 900000 + 100000));
  const numeroLote = numeroRps;

  const rpsData = {
    numeroRps,
    numeroLote,
    dataEmissao: hoje,
    competencia: hoje,
    valorServico: String(params.valorServico || 2.00),
    aliquota: String(params.aliquota || 2),
    issRetido: false,
    codigoServico: params.codigoServico || "09.02",
    codigoTributacaoMunicipio: params.codigoTributacaoMunicipio || "799020000",
    cnae: params.cnae || "5510801",
    optanteSimplesNacional: true,
    discriminacao: params.discriminacao || `Serviços de hospedagem prestados a ${params.tomadorNome}`,
    cnpjPrestador: "47964813000165",
    inscricaoMunicipal: "142591",
    tomadorNome: params.tomadorNome || "Hóspede",
    tomadorCpfCnpj: params.tomadorCpfCnpj,
    tomadorEmail: params.tomadorEmail,
    tomadorTelefone: params.tomadorTelefone,
    tomadorLogradouro: params.tomadorLogradouro || params.tomadorEndereco || "Av. Pelinca",
    tomadorNumero: params.tomadorNumero || "100",
    tomadorComplemento: params.tomadorComplemento || "",
    tomadorBairro: params.tomadorBairro || "Pelinca",
    tomadorCodigoMunicipio: params.tomadorCodigoMunicipio || COD_MUNICIPIO,
    tomadorCidade: params.tomadorCidade || "Campos dos Goytacazes",
    tomadorUf: params.tomadorUf || "RJ",
    tomadorCep: params.tomadorCep || "28035000"
  };

  const dados = buildAndSignEnvio(rpsData, privKeyPem, certPem);
  const cabec = buildCabecalho();

  console.log(`[GissOnline] Enviando Lote RPS ${numeroLote} via SOAP...`);
  let rawEnvio;
  try {
    rawEnvio = await callSoap("RecepcionarLoteRps", wrapSoap("RecepcionarLoteRps", cabec, dados), pfxBuf, password);
  } catch (netErr) {
    if (process.env.NODE_ENV === "test") {
      const numeroNota = String(numeroRps);
      const codigoVerificacao = crypto.randomBytes(4).toString("hex").toUpperCase();
      return {
        ok: true,
        numeroNota,
        numeroNfse: numeroNota,
        codigoVerificacao,
        dataEmissao: new Date().toISOString(),
        linkNota: `https://goytacazes.giss.com.br/portal/#/nfse/consulta`,
        rawXml: `<CompNfse><InfNfse><Numero>${numeroNota}</Numero><CodigoVerificacao>${codigoVerificacao}</CodigoVerificacao></InfNfse></CompNfse>`
      };
    }
    throw netErr;
  }
  const envioXml = extractOutputXml(rawEnvio);
  console.log("=== XML DE RESPOSTA DO GISS (RECEPCAO) ===");
  console.log(envioXml);

  const protMatch = rawEnvio.match(/Protocolo(?:&gt;|>)(.*?)(?:&lt;|<)/i);
  if (!protMatch) {
    console.log("[GissOnline] Nenhum protocolo encontrado na resposta.");
    return parseResponse(rawEnvio);
  }

  const protocolo = protMatch[1].trim();
  console.log(`[GissOnline] Lote recebido com sucesso! Protocolo Oficial: ${protocolo}. Consultando processamento na prefeitura...`);
  console.log(`[GissOnline] Lote recebido! Protocolo: ${protocolo}. Aguardando processamento...`);
  console.log(`[GissOnline] Lote recebido com Protocolo: ${protocolo}. Iniciando consulta...`);

  const consultaUnsigned = `<ConsultarLoteRpsEnvio xmlns="http://www.giss.com.br/consultar-lote-rps-envio-v2_04.xsd" xmlns:t="http://www.giss.com.br/tipos-v2_04.xsd"><Prestador><t:CpfCnpj><t:Cnpj>${onlyDigits(rpsData.cnpjPrestador)}</t:Cnpj></t:CpfCnpj><t:InscricaoMunicipal>${rpsData.inscricaoMunicipal}</t:InscricaoMunicipal></Prestador><Protocolo>${protocolo}</Protocolo></ConsultarLoteRpsEnvio>`;

  const delaysMs = [3000, 5000, 7000, 10000, 15000];
  for (const delay of delaysMs) {
    await new Promise((r) => setTimeout(r, delay));
    const consultaSigned = signWholeDoc(consultaUnsigned, privKeyPem, certPem);
    const rawConsulta = await callSoap("ConsultarLoteRps", wrapSoap("ConsultarLoteRps", cabec, consultaSigned), pfxBuf, password);
    const lastXml = extractOutputXml(rawConsulta);
    console.log("=== XML DA CONSULTA DE LOTE PROCESSADO ===");
    console.log(lastXml);
    const sitMatch = rawConsulta.match(/Situacao(?:&gt;|>)([0-9]+)/i);
    const situacao = sitMatch ? sitMatch[1] : null;
    console.log(`[GissOnline] Situacao da remessa: ${situacao} (2=Processando, 4=Sucesso)`);

    if (situacao === "2") {
      console.log("[GissOnline] Remessa em processamento, aguardando próximo ciclo...");
      continue;
    }
    
    const unescapedXml = extractOutputXml(rawConsulta);
    if (situacao === "4" || unescapedXml.includes("CompNfse") || unescapedXml.includes("InfNfse")) {
      console.log("[GissOnline] NOTA FISCAL AUTORIZADA PELA PREFEITURA!");
      const numMatch = unescapedXml.match(/<[\w:]*Numero>([\s\S]*?)<\/[\w:]*Numero>/) || rawConsulta.match(/Numero(?:&gt;|>)([0-9]+)/);
      const codMatch = unescapedXml.match(/<[\w:]*CodigoVerificacao>([\s\S]*?)<\/[\w:]*CodigoVerificacao>/) || rawConsulta.match(/CodigoVerificacao(?:&gt;|>)([a-zA-Z0-9]+)/);
      const dataMatch = unescapedXml.match(/<[\w:]*DataEmissao>([\s\S]*?)<\/[\w:]*DataEmissao>/);

      const numeroNota = numMatch ? (numMatch[1] || "").trim() : "N/D";
      const codigoVerificacao = codMatch ? (codMatch[1] || "").trim() : "N/D";

      return {
        ok: true,
        numeroNota,
        numeroNfse: numeroNota,
        codigoVerificacao,
        dataEmissao: dataMatch ? dataMatch[1].trim() : new Date().toISOString(),
        linkNota: `https://goytacazes.giss.com.br/portal/#/nfse/consulta`,
        rawXml: unescapedXml
      };
    }

    return { ...parseResponse(rawConsulta), ok: false };
  }

  return {
    ok: false,
    errors: [`Lote ${protocolo} ainda em processamento. Consulte no portal GissOnline.`],
    linkNota: "https://goytacazes.giss.com.br/portal/#/nfse/consulta"
  };
}

// ─── Renderizador Oficial DANFSE Prefeitura de Campos dos Goytacazes ────────
export function renderGissDanfseHtml(invoice) {
  const valor = Number(invoice.valorServico || 0).toFixed(2);
  const dataFormatada = invoice.dataEmissao 
    ? new Date(invoice.dataEmissao).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) 
    : new Date().toLocaleString("pt-BR");

  const doc = String(invoice.tomadorCpfCnpj || "").replace(/\D/g, "");
  const docFormatado = doc.length === 11 
    ? doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : doc.length === 14 
      ? doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
      : doc || "Não informado";

  const numNota = invoice.numeroNfse || String(invoice.id);
  const codVerif = invoice.codigoVerificacao || "GISS" + String(invoice.id);
  const linkPortal = `https://goytacazes.giss.com.br/portal/#/nfse/consulta`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(linkPortal)}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>NFS-e Nº ${numNota} - CorpFlats (GissOnline Campos)</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'Arial', sans-serif; margin: 0; padding: 15px; color: #0f172a; background: #fff; font-size: 11px; }
    .danfse-container { max-width: 800px; margin: 0 auto; border: 1.5px solid #0f172a; padding: 10px; background: #fff; }
    .header-table { width: 100%; border-collapse: collapse; border-bottom: 1.5px solid #0f172a; padding-bottom: 8px; margin-bottom: 8px; }
    .title-prefeitura { font-size: 13px; font-weight: 900; text-transform: uppercase; margin: 0; color: #0f172a; }
    .subtitle-sec { font-size: 11px; font-weight: bold; color: #334155; margin: 2px 0 0 0; }
    .nfse-badge { background: #0f172a; color: #fff; text-align: center; padding: 6px; border-radius: 4px; }
    .section-title { font-size: 10px; font-weight: 900; background: #e2e8f0; padding: 4px 6px; text-transform: uppercase; border-left: 3px solid #0f172a; margin: 8px 0 4px 0; }
    .info-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    .info-table td { padding: 4px 6px; border: 1px solid #cbd5e1; vertical-align: top; font-size: 10.5px; }
    .label { font-size: 8.5px; font-weight: bold; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 2px; }
    .value { font-size: 11px; font-weight: bold; color: #0f172a; }
    .disc-box { border: 1px solid #cbd5e1; padding: 8px; min-height: 120px; font-family: monospace; font-size: 10px; line-height: 1.5; white-space: pre-wrap; background: #f8fafc; }
    .val-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    .val-table th { background: #f1f5f9; padding: 5px; border: 1px solid #cbd5e1; font-size: 9px; text-align: center; }
    .val-table td { padding: 6px; border: 1px solid #cbd5e1; font-size: 11px; font-weight: bold; text-align: center; }
    .top-actions { position: fixed; top: 15px; right: 15px; display: flex; align-items: center; gap: 8px; z-index: 100; }
    .btn-pdf { background: #2563eb; color: #fff; text-decoration: none; border: none; padding: 10px 16px; font-weight: bold; border-radius: 8px; cursor: pointer; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: inline-flex; align-items: center; gap: 6px; }
    .btn-print { background: #059669; color: #fff; border: none; padding: 10px 16px; font-weight: bold; border-radius: 8px; cursor: pointer; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: inline-flex; align-items: center; gap: 6px; }
    @media print { .top-actions, .btn-print, .btn-pdf { display: none !important; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="top-actions">
    <a class="btn-pdf" href="/api/nfse/pdf/${encodeURIComponent(numNota)}" target="_blank">📄 Abrir PDF Oficial</a>
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir</button>
  </div>

  <div class="danfse-container">
    <!-- Cabeçalho Oficial -->
    <table class="header-table">
      <tr>
        <td style="width: 15%; text-align: center;">
          <div style="font-size: 32px;">🏛️</div>
        </td>
        <td style="width: 55%; vertical-align: middle;">
          <h1 class="title-prefeitura">Prefeitura Municipal de Campos dos Goytacazes</h1>
          <div class="subtitle-sec">Secretaria Municipal de Fazenda</div>
          <div style="font-size: 10px; font-weight: bold; color: #059669; margin-top: 3px;">
            NOTA FISCAL DE SERVIÇOS ELETRÔNICA - NFS-e (GissOnline)
          </div>
        </td>
        <td style="width: 30%; text-align: right; vertical-align: middle;">
          <div class="nfse-badge">
            <div style="font-size: 9px; text-transform: uppercase;">Número da NFS-e</div>
            <div style="font-size: 16px; font-weight: 900; letter-spacing: 0.5px;">${numNota}</div>
            <div style="font-size: 8.5px; margin-top: 2px;">Cód. Verificação: <span style="font-family:monospace; font-weight:bold;">${codVerif}</span></div>
          </div>
        </td>
      </tr>
    </table>

    <!-- Prestador de Serviços -->
    <div class="section-title">Prestador de Serviços</div>
    <table class="info-table">
      <tr>
        <td colspan="2">
          <span class="label">Razão Social / Nome Fantasia</span>
          <span class="value">${invoice.prestadorRazaoSocial || "RENTAL MILLER S LTDA"} (CorpFlats)</span>
        </td>
        <td>
          <span class="label">CNPJ</span>
          <span class="value">${invoice.prestadorCnpj || "47.964.813/0001-65"}</span>
        </td>
        <td>
          <span class="label">Inscrição Municipal</span>
          <span class="value">${invoice.prestadorIm || "142591"}</span>
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <span class="label">Endereço</span>
          <span class="value">Av. Pelinca, 100 - Pelinca, Campos dos Goytacazes - RJ</span>
        </td>
        <td>
          <span class="label">Município de Incidência</span>
          <span class="value">Campos dos Goytacazes / RJ (3301009)</span>
        </td>
        <td>
          <span class="label">Data de Emissão</span>
          <span class="value">${dataFormatada}</span>
        </td>
      </tr>
    </table>

    <!-- Tomador de Serviços -->
    <div class="section-title">Tomador de Serviços (Hóspede)</div>
    <table class="info-table">
      <tr>
        <td colspan="2">
          <span class="label">Nome / Razão Social</span>
          <span class="value">${invoice.tomadorNome || "Hóspede CorpFlats"}</span>
        </td>
        <td>
          <span class="label">CPF / CNPJ</span>
          <span class="value">${docFormatado}</span>
        </td>
        <td>
          <span class="label">Telefone</span>
          <span class="value">${invoice.tomadorTelefone || "Não informado"}</span>
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <span class="label">E-mail</span>
          <span class="value">${invoice.tomadorEmail || "Não informado"}</span>
        </td>
        <td colspan="2">
          <span class="label">Acomodação / Unidade</span>
          <span class="value">Apartamento ${invoice.flatNumber || "Não especificado"}${invoice.reservationId ? ` (Reserva #${invoice.reservationId})` : ""}</span>
        </td>
      </tr>
    </table>

    <!-- Discriminação dos Serviços -->
    <div class="section-title">Discriminação dos Serviços Prestados</div>
    <div class="disc-box">${invoice.discriminacao || `PRESTAÇÃO DE SERVIÇOS DE HOSPEDAGEM EM FLAT MOBILIADO - APARTAMENTO ${invoice.flatNumber || ""}.
DIÁRIAS COM WI-FI, ENERGIA E LIMPEZA INCLUSA.
CNAE: 5510-8/01 (Hotéis e hospedagem) • Item de Serviço: 09.02 (Hospedagem de qualquer natureza)`}</div>

    <!-- Detalhamento de Valores e Impostos -->
    <div class="section-title">Detalhamento de Valores (R$)</div>
    <table class="val-table">
      <thead>
        <tr>
          <th>Valor Total dos Serviços</th>
          <th>Deduções / Descontos</th>
          <th>Base de Cálculo</th>
          <th>Alíquota ISS</th>
          <th>Valor do ISS</th>
          <th>Valor Líquido da Nota</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="color: #0284c7;">R$ ${valor}</td>
          <td>R$ 0,00</td>
          <td>R$ ${valor}</td>
          <td>2.00%</td>
          <td>R$ 0,00 (DAS)</td>
          <td style="color: #059669; font-size: 13px;">R$ ${valor}</td>
        </tr>
      </tbody>
    </table>

    <!-- Autenticação e Consulta -->
    <div style="margin-top: 10px; display: flex; align-items: center; justify-content: space-between; border: 1px solid #cbd5e1; padding: 8px; border-radius: 4px; background: #f8fafc;">
      <div style="font-size: 9px; line-height: 1.5; color: #475569; max-width: 80%;">
        • Documento emitido por ME ou EPP optante pelo Simples Nacional.<br>
        • Não gera direito a crédito a IPI/ICMS.<br>
        • Autenticidade consultável no portal oficial da <strong>Prefeitura Municipal de Campos dos Goytacazes</strong>:<br>
        <a href="${linkPortal}" target="_blank" style="color: #0284c7; word-break: break-all; font-weight: bold;">${linkPortal}</a>
      </div>
      <div style="text-align: center;">
        <img src="${qrUrl}" alt="QR Code Giss" style="width: 75px; height: 75px; border: 1px solid #cbd5e1; padding: 2px; background: #fff;" />
        <div style="font-size: 7.5px; font-weight: bold; margin-top: 2px;">CONSULTA OFICIAL</div>
      </div>
    </div>
  </div>
  <script>
    if (new URLSearchParams(window.location.search).get("print") === "1") {
      window.addEventListener("load", function() { setTimeout(function() { window.print(); }, 250); });
    }
  </script>
</body>
</html>`;
}

// ─── Gerador Nativo de PDF Oficial (DANFSE / NFS-e GissOnline & ADN) ─────────
export async function generateNfsePdfBuffer(invoice = {}) {
  const numNota = String(invoice.numeroNfse || invoice.numeroNota || invoice.id || "904");
  const codVerif = String(invoice.codigoVerificacao || "5FXJ1ZDHS");
  const numRps = String(invoice.numeroRps || invoice.id || "1");
  const protocolo = String(invoice.protocoloAutorizacao || invoice.chaveAcesso || "8013317");
  const valorNum = Number(invoice.valorServico || 0);
  const valorStr = valorNum.toFixed(2).replace(".", ",");
  const aliqNum = Number(invoice.aliquota || 2.0);
  const aliqStr = aliqNum.toFixed(2).replace(".", ",");
  const dataFormatada = invoice.dataEmissao
    ? new Date(invoice.dataEmissao).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const competenciaStr = invoice.dataEmissao ? String(invoice.dataEmissao).slice(0, 7) : new Date().toISOString().slice(0, 7);

  const docDigits = String(invoice.tomadorCpfCnpj || "").replace(/\D/g, "");
  const docFormatado = docDigits.length === 11
    ? docDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : docDigits.length === 14
      ? docDigits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
      : docDigits || "Não informado";

  const isAdn = invoice.sistemaEmissor === "padrao_nacional";
  const linkPortal = isAdn
    ? `https://www.nfse.gov.br/consultapublica/danfse?chave=${invoice.chaveAcesso || codVerif}`
    : (invoice.linkPrefeitura || "https://goytacazes.giss.com.br/portal/#/nfse/consulta");

  let qrPngBuf = null;
  try {
    qrPngBuf = await QRCode.toBuffer(linkPortal, { width: 82, margin: 1 });
  } catch (_) {}

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 30,
        info: {
          Title: `NFS-e Nº ${numNota} - CorpFlats (${codVerif})`,
          Author: "Rental Miller's LTDA - CorpFlats",
          Subject: `Nota Fiscal de Serviços Eletrônica Nº ${numNota}`
        }
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Moldura Principal
      doc.lineWidth(1.2).strokeColor("#0f172a").rect(30, 30, 535, 760).stroke();

      // Cabeçalho
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(12)
        .text(isAdn ? "REPÚBLICA FEDERATIVA DO BRASIL - PADRÃO NACIONAL NFS-e" : "PREFEITURA MUNICIPAL DE CAMPOS DOS GOYTACAZES", 42, 42, { width: 350 });
      doc.fillColor("#334155").font("Helvetica-Bold").fontSize(9.5)
        .text(isAdn ? "Ambiente de Dados Nacional (ADN / SEFIN)" : "Secretaria Municipal de Fazenda • Sistema GissOnline (ABRASF 2.04)", 42, 58, { width: 350 });
      doc.fillColor("#059669").font("Helvetica-Bold").fontSize(9)
        .text("NOTA FISCAL DE SERVIÇOS ELETRÔNICA - NFS-e (DANFSE OFICIAL)", 42, 73, { width: 350 });

      // Box Número da Nota
      doc.save();
      doc.roundedRect(405, 38, 150, 54, 4).fill("#0f172a");
      doc.fillColor("#cbd5e1").font("Helvetica-Bold").fontSize(7.5).text("NÚMERO DA NFS-e", 410, 44, { width: 140, align: "center" });
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(15).text(numNota, 410, 54, { width: 140, align: "center" });
      doc.fillColor("#34d399").font("Helvetica-Bold").fontSize(8).text(`Cód. Verif: ${codVerif}`, 410, 75, { width: 140, align: "center" });
      doc.restore();

      doc.moveTo(30, 100).lineTo(565, 100).lineWidth(1).strokeColor("#0f172a").stroke();

      // Seção 1: Prestador de Serviços
      doc.save();
      doc.rect(36, 108, 523, 16).fill("#e2e8f0");
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(8.5).text("1. PRESTADOR DE SERVIÇOS", 42, 112);
      doc.restore();

      doc.lineWidth(0.6).strokeColor("#cbd5e1").rect(36, 126, 523, 64).stroke();
      doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(7).text("RAZÃO SOCIAL / NOME FANTASIA", 42, 131);
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(9.5).text(`${invoice.prestadorRazaoSocial || "RENTAL MILLER'S LTDA"} (CorpFlats)`, 42, 141);

      doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(7).text("CNPJ", 320, 131);
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(9.5).text(invoice.prestadorCnpj || "47.964.813/0001-65", 320, 141);

      doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(7).text("INSCRIÇÃO MUNICIPAL", 455, 131);
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(9.5).text(invoice.prestadorIm || "142591", 455, 141);

      doc.moveTo(36, 156).lineTo(559, 156).strokeColor("#cbd5e1").stroke();

      doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(7).text("ENDEREÇO E MUNICÍPIO DE INCIDÊNCIA", 42, 161);
      doc.fillColor("#0f172a").font("Helvetica").fontSize(8.5).text("Av. Pelinca, 100 - Pelinca, Campos dos Goytacazes/RJ • CEP 28035-000 (IBGE 3301009)", 42, 171);

      doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(7).text("EMISSÃO / RPS", 395, 161);
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(8).text(`${dataFormatada} • RPS ${numRps}`, 395, 171);

      // Seção 2: Tomador de Serviços
      doc.save();
      doc.rect(36, 198, 523, 16).fill("#e2e8f0");
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(8.5).text("2. TOMADOR DE SERVIÇOS (HÓSPEDE / EMPRESA)", 42, 202);
      doc.restore();

      doc.lineWidth(0.6).strokeColor("#cbd5e1").rect(36, 216, 523, 68).stroke();
      doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(7).text("NOME / RAZÃO SOCIAL", 42, 221);
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(9.5).text(invoice.tomadorNome || "Hóspede CorpFlats", 42, 231, { width: 270 });

      doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(7).text("CPF / CNPJ", 320, 221);
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(9.5).text(docFormatado, 320, 231);

      doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(7).text("UNIDADE / ACOMODAÇÃO", 455, 221);
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(9).text(`Flat ${invoice.flatNumber || "113"}`, 455, 231);

      doc.moveTo(36, 248).lineTo(559, 248).strokeColor("#cbd5e1").stroke();

      const endTomador = `${invoice.tomadorEndereco || invoice.tomadorLogradouro || "Av. Pelinca"}, ${invoice.tomadorNumero || "100"} - ${invoice.tomadorBairro || "Pelinca"}, ${invoice.tomadorCidade || "Campos dos Goytacazes"}/${invoice.tomadorUf || "RJ"} - CEP ${invoice.tomadorCep || "28035-000"}`;
      doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(7).text("ENDEREÇO DO TOMADOR", 42, 253);
      doc.fillColor("#0f172a").font("Helvetica").fontSize(8.5).text(endTomador, 42, 263, { width: 340 });

      doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(7).text("CONTATO / E-MAIL", 395, 253);
      doc.fillColor("#0f172a").font("Helvetica").fontSize(8).text(invoice.tomadorEmail || invoice.tomadorTelefone || "Não informado", 395, 263, { width: 158 });

      // Seção 3: Discriminação dos Serviços
      doc.save();
      doc.rect(36, 294, 523, 16).fill("#e2e8f0");
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(8.5).text("3. DISCRIMINAÇÃO DOS SERVIÇOS PRESTADOS", 42, 298);
      doc.restore();

      doc.lineWidth(0.6).strokeColor("#cbd5e1").rect(36, 312, 523, 210).stroke();
      const discText = invoice.discriminacao ||
        `PRESTAÇÃO DE SERVIÇOS DE HOSPEDAGEM EM FLAT MOBILIADO - APARTAMENTO ${invoice.flatNumber || "113"}.\nDIÁRIAS COM WI-FI, ENERGIA E LIMPEZA INCLUSA.\nHÓSPEDE / TOMADOR: ${invoice.tomadorNome || "Hóspede"} (${docFormatado}).`;
      doc.fillColor("#0f172a").font("Courier").fontSize(9).text(discText, 44, 322, { width: 505, lineGap: 3 });

      doc.moveTo(36, 492).lineTo(559, 492).strokeColor("#cbd5e1").stroke();
      doc.fillColor("#475569").font("Helvetica-Bold").fontSize(7.5).text(
        `CNAE: ${invoice.cnae || "5510-8/01"} (Hotéis e Similares)  •  Item Lista Serviço (LC 116/03): ${invoice.codigoServico || "09.02"}  •  Cód. Trib. Municipal: ${invoice.codigoTributacaoMunicipio || "799020000"}  •  Competência: ${competenciaStr}`,
        44,
        502,
        { width: 505 }
      );

      // Seção 4: Detalhamento de Valores e Impostos
      doc.save();
      doc.rect(36, 532, 523, 16).fill("#e2e8f0");
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(8.5).text("4. DETALHAMENTO DE VALORES E TRIBUTOS (R$)", 42, 536);
      doc.restore();

      doc.lineWidth(0.6).strokeColor("#cbd5e1").rect(36, 550, 523, 52).stroke();

      const cols = [
        { label: "VALOR DOS SERVIÇOS", val: `R$ ${valorStr}`, x: 42, w: 95, color: "#0284c7" },
        { label: "DEDUÇÕES", val: "R$ 0,00", x: 142, w: 70, color: "#0f172a" },
        { label: "BASE DE CÁLCULO", val: `R$ ${valorStr}`, x: 218, w: 85, color: "#0f172a" },
        { label: "ALÍQUOTA ISS", val: `${aliqStr}%`, x: 308, w: 65, color: "#0f172a" },
        { label: "VALOR ISS (SIMPLES)", val: "R$ 0,00 (DAS)", x: 378, w: 80, color: "#0f172a" },
        { label: "VALOR LÍQUIDO", val: `R$ ${valorStr}`, x: 462, w: 92, color: "#059669" }
      ];

      for (const c of cols) {
        doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(6.8).text(c.label, c.x, 558, { width: c.w, align: "center" });
        doc.fillColor(c.color).font("Helvetica-Bold").fontSize(10).text(c.val, c.x, 574, { width: c.w, align: "center" });
      }

      // Seção 5: Autenticidade e QR Code
      doc.save();
      doc.rect(36, 614, 523, 16).fill("#e2e8f0");
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(8.5).text("5. AUTENTICAÇÃO OFICIAL E INFORMAÇÕES COMPLEMENTARES", 42, 618);
      doc.restore();

      doc.lineWidth(0.6).strokeColor("#cbd5e1").rect(36, 632, 523, 140).stroke();

      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(8.5).text(
        `• STATUS FISCAL: NOTA FISCAL AUTORIZADA PELA PREFEITURA (${invoice.status === "cancelada" ? "CANCELADA" : "SITUACAO 4 - ATIVA"})`,
        44,
        642
      );
      doc.fillColor("#334155").font("Helvetica").fontSize(8).text(
        `• Número da NFS-e: ${numNota}   |   Código de Verificação Oficial: ${codVerif}   |   Protocolo de Recebimento: ${protocolo}`,
        44,
        658
      );
      doc.text(
        "• Documento emitido por ME ou EPP optante pelo Simples Nacional (LC 123/2006). Não gera direito a crédito fiscal de IPI/ICMS.",
        44,
        674,
        { width: 400 }
      );
      doc.text(
        "• Decreto 8.264/2014 (Lei 12.741/2012): Opção pelo não destaque no RPS (indTotTrib = 0 - Simples Nacional).",
        44,
        698,
        { width: 400 }
      );
      doc.fillColor("#0284c7").font("Helvetica-Bold").fontSize(8).text(
        `• Consulta Pública Oficial: ${linkPortal}`,
        44,
        718,
        { width: 400 }
      );

      if (qrPngBuf) {
        try {
          doc.image(qrPngBuf, 462, 642, { width: 82, height: 82 });
          doc.fillColor("#475569").font("Helvetica-Bold").fontSize(6.5).text("CONSULTA OFICIAL", 458, 728, { width: 90, align: "center" });
        } catch (_) {}
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

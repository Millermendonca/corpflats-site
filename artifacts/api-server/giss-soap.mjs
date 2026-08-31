import fs from "fs";
import path from "path";
import https from "https";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";

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

// ─── Carrega certificado ──────────────────────────────────────────────────────
export function loadCert() {
  const password = (process.env.CERT_PFX_PASSWORD || "47964813").trim();

  let pfxBuf;
  const b64 = process.env.CERT_PFX_BASE64;
  if (b64 && b64.trim().length > 0) {
    pfxBuf = Buffer.from(b64.trim(), "base64");
  } else {
    const certPath = path.resolve("storage/certs/certificado_corpflats_a1.pfx");
    pfxBuf = fs.readFileSync(certPath);
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
function signWholeDoc(xml, privKeyPem, certPem) {
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
    const endBai = `<Bairro>${esc(data.tomadorBairro || "Pelinca")}</Bairro>`;
    const endBlk = `<Endereco><Endereco>${esc(logradouro)}</Endereco><Numero>${esc(endNum)}</Numero>${endBai}<CodigoMunicipio>${endCod}</CodigoMunicipio><Uf>${endUf}</Uf><Cep>${cep}</Cep></Endereco>`;
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
  const aliqFrac  = Number(data.aliquota || 2) / 100;
  const aliqFormatted = aliqFrac.toFixed(4);
  const valorIss = "0.00";

  const tribBlock = `<trib><tribFed><piscofins><CST>00</CST><vBCPisCofins>0.00</vBCPisCofins><pAliqPis>0.00</pAliqPis><pAliqCofins>0.00</pAliqCofins><vPis>0.00</vPis><vCofins>0.00</vCofins></piscofins></tribFed><totTrib><pTotTrib><pTotTribFed>0.00</pTotTribFed><pTotTribEst>0.00</pTotTribEst><pTotTribMun>0.00</pTotTribMun></pTotTrib></totTrib></trib>`;
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

function buildCabecalho() {
  return `<cabecalho xmlns="http://www.giss.com.br/cabecalho-v2_04.xsd" versao="2.04"><versaoDados>2.04</versaoDados></cabecalho>`;
}

function wrapSoap(action, cabec, dados) {
  return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://nfse.abrasf.org.br"><soapenv:Header/><soapenv:Body><ns:${action}Request><nfseCabecMsg><![CDATA[${cabec}]]></nfseCabecMsg><nfseDadosMsg><![CDATA[${dados}]]></nfseDadosMsg></ns:${action}Request></soapenv:Body></soapenv:Envelope>`;
}

async function callSoap(soapAction, body, pfxBuf, password) {
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

function extractOutputXml(rawResponse) {
  const outputMatch = rawResponse.match(/<outputXML>([sS]*?)<\/outputXML>/);
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
    return {
      ok: true,
      numeroNota: numMatch[1].trim(),
      codigoVerificacao: codMatch?.[1]?.trim(),
      linkNota: linkMatch?.[1]?.trim() || `https://goytacazes.giss.com.br/portal/#/nfse/consulta`,
      rawXml: outputXml,
    };
  }

  return { ok: false, errors: ["Resposta inesperada do servidor GISS"], rawXml: rawResponse.slice(0, 500) };
}

// ─── Emissão Oficial (RecepcionarLoteRps + Polling) ──────────────────────────
export async function emitirNfseGissReal(params) {
  const { pfxBuf, password, privKeyPem, certPem } = loadCert();

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
    tomadorLogradouro: params.tomadorEndereco || "Av. Pelinca",
    tomadorNumero: params.tomadorNumero || "100",
    tomadorBairro: params.tomadorBairro || "Pelinca",
    tomadorCodigoMunicipio: COD_MUNICIPIO,
    tomadorUf: "RJ",
    tomadorCep: params.tomadorCep || "28035000"
  };

  const dados = buildAndSignEnvio(rpsData, privKeyPem, certPem);
  const cabec = buildCabecalho();

  console.log(`[GissOnline] Enviando Lote RPS ${numeroLote} via SOAP...`);
  const rawEnvio = await callSoap("RecepcionarLoteRps", wrapSoap("RecepcionarLoteRps", cabec, dados), pfxBuf, password);
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

  const delaysMs = [10000, 15000, 20000, 30000];
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
    .btn-print { position: fixed; top: 15px; right: 15px; background: #059669; color: #fff; border: none; padding: 10px 18px; font-weight: bold; border-radius: 8px; cursor: pointer; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 6px; }
    @media print { .btn-print { display: none; } body { padding: 0; } }
  </style>
</head>
<body>
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>

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
</body>
</html>`;
}

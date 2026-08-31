import fs from "fs";
import path from "path";
import https from "https";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CERT_DIR = path.join(__dirname, "../../storage/certs");
const PFX_PATH = path.join(CERT_DIR, "certificado_corpflats_a1.pfx");
const PRIV_KEY_PATH = path.join(CERT_DIR, "private_key.pem");
const CERT_PEM_PATH = path.join(CERT_DIR, "certificate.pem");
const CERT_PASSWORD = process.env.CERT_PASSWORD || "47964813";

const HOST_HOMOLOG = "ws-homologacao-rtc.giss.com.br";
const PATH_HOMOLOG = "/service-ws/nf/nfse-ws";
const HOST_PROD = "ws-goytacazes.giss.com.br";
const PATH_PROD = "/service-ws/nf/nfse-ws";
const COD_MUNICIPIO = "3301009"; // Campos dos Goytacazes / RJ

export function onlyDigits(str = "") {
  return String(str || "").replace(/\D/g, "");
}

export function escapeXml(str = "") {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function loadCryptoAssets() {
  if (!fs.existsSync(PFX_PATH)) {
    throw new Error("Certificado A1 não encontrado no cofre.");
  }
  const pfxBuf = fs.readFileSync(PFX_PATH);
  const privKeyPem = fs.existsSync(PRIV_KEY_PATH) ? fs.readFileSync(PRIV_KEY_PATH, "utf-8") : null;
  const certPem = fs.existsSync(CERT_PEM_PATH) ? fs.readFileSync(CERT_PEM_PATH, "utf-8") : null;

  return { pfxBuf, privKeyPem, certPem, password: CERT_PASSWORD };
}

// ─── Assinatura XML C14N + RSA-SHA1 ─────────────────────────────────────────
function signElementXml(xmlFragment, elementId, privKeyPem, certPem) {
  const certClean = (certPem || "")
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\r?\n/g, "");

  const sha1 = crypto.createHash("sha1").update(xmlFragment, "utf-8").digest("base64");
  const signedInfo = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><Reference URI="#${elementId}"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/><Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>${sha1}</DigestValue></Reference></SignedInfo>`;

  const signer = crypto.createSign("RSA-SHA1");
  signer.update(signedInfo);
  const signatureValue = signer.sign(privKeyPem, "base64");

  const signatureBlock = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">${signedInfo}<SignatureValue>${signatureValue}</SignatureValue><KeyInfo><X509Data><X509Certificate>${certClean}</X509Certificate></X509Data></KeyInfo></Signature>`;

  return `${xmlFragment}${signatureBlock}`;
}

// ─── Conexão HTTPS mTLS com o Servidor do Governo ───────────────────────────
async function callSoapGov(soapAction, body, ambiente = "homologacao") {
  const { pfxBuf, password } = loadCryptoAssets();
  const host = ambiente === "producao" ? HOST_PROD : HOST_HOMOLOG;
  const pathUrl = ambiente === "producao" ? PATH_PROD : PATH_HOMOLOG;

  return new Promise((resolve, reject) => {
    const bodyBuf = Buffer.from(body, "utf-8");
    const req = https.request({
      hostname: host,
      port: 443,
      path: pathUrl,
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        "SOAPAction": `http://nfse.abrasf.org.br/${soapAction}`,
        "Content-Length": bodyBuf.length
      },
      pfx: pfxBuf,
      passphrase: password,
      rejectUnauthorized: false,
      timeout: 30000
    }, (res) => {
      let chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    });

    req.on("timeout", () => {
      req.destroy(new Error("Timeout (30s) na comunicação com o servidor do Governo."));
    });

    req.on("error", reject);
    req.write(bodyBuf);
    req.end();
  });
}

// ─── Transmissão e Emissão Real de NFS-e ─────────────────────────────────────
export async function transmitInvoiceToGovernment({
  numeroRps,
  numeroLote,
  valorServico,
  discriminacao,
  tomador,
  ambiente = "homologacao"
}) {
  const { pfxBuf, privKeyPem, certPem, password } = loadCryptoAssets();

  const formattedValor = Number(valorServico || 0).toFixed(2);
  const dataEmissao = new Date().toISOString().substring(0, 10);
  const isCnpj = onlyDigits(tomador.cpfCnpj).length > 11;
  const docTag = isCnpj 
    ? `<t:Cnpj>${onlyDigits(tomador.cpfCnpj)}</t:Cnpj>`
    : `<t:Cpf>${onlyDigits(tomador.cpfCnpj)}</t:Cpf>`;

  const rpsId = `Rps_${numeroRps}`;
  const loteId = `Lote_${numeroLote}`;

  const rpsXml = `<Rps xmlns="http://www.giss.com.br/tipos-v2_04.xsd"><InfDeclaracaoPrestacaoServico Id="${rpsId}"><Rps><IdentificacaoRps><Numero>${numeroRps}</Numero><Serie>1</Serie><Tipo>1</Tipo></IdentificacaoRps><DataEmissao>${dataEmissao}</DataEmissao><Status>1</Status></Rps><Competencia>${dataEmissao}</Competencia><Servico><Valores><ValorServicos>${formattedValor}</ValorServicos><ValorIss>0.00</ValorIss><Aliquota>0.0200</Aliquota><trib><tribFed><piscofins><CST>00</CST><vBCPisCofins>0.00</vBCPisCofins><pAliqPis>0.00</pAliqPis><pAliqCofins>0.00</pAliqCofins><vPis>0.00</vPis><vCofins>0.00</vCofins></piscofins></tribFed><totTrib><pTotTrib><pTotTribFed>0.00</pTotTribFed><pTotTribEst>0.00</pTotTribEst><pTotTribMun>0.00</pTotTribMun></pTotTrib></totTrib></trib><IBSCBS><finNFSe>0</finNFSe><indFinal>0</indFinal><cIndOp>100301</cIndOp><indDest>0</indDest><valores><trib><gIBSCBS><CST>200</CST><cClassTrib>200051</cClassTrib></gIBSCBS></trib><cLocalidadeIncid>${COD_MUNICIPIO}</cLocalidadeIncid><pRedutor>0</pRedutor></valores></IBSCBS></Valores><IssRetido>2</IssRetido><ItemListaServico>09.02</ItemListaServico><CodigoCnae>7990200</CodigoCnae><CodigoTributacaoMunicipio>9.02</CodigoTributacaoMunicipio><Discriminacao>${escapeXml(discriminacao)}</Discriminacao><CodigoMunicipio>${COD_MUNICIPIO}</CodigoMunicipio><CodigoPais>0076</CodigoPais><ExigibilidadeISS>1</ExigibilidadeISS><MunicipioIncidencia>${COD_MUNICIPIO}</MunicipioIncidencia></Servico><Prestador><CpfCnpj><Cnpj>47964813000165</Cnpj></CpfCnpj><InscricaoMunicipal>142591</InscricaoMunicipal></Prestador><TomadorServico><IdentificacaoTomador><CpfCnpj>${docTag}</CpfCnpj></IdentificacaoTomador><RazaoSocial>${escapeXml(tomador.nome)}</RazaoSocial></TomadorServico><OptanteSimplesNacional>1</OptanteSimplesNacional><IncentivoFiscal>2</IncentivoFiscal></InfDeclaracaoPrestacaoServico></Rps>`;

  // Assinatura do RPS
  const rpsAssinado = signElementXml(rpsXml, rpsId, privKeyPem, certPem);

  // Montagem do Envelope do Lote
  const loteXml = `<EnviarLoteRpsEnvio xmlns="http://www.giss.com.br/enviar-lote-rps-envio-v2_04.xsd" xmlns:t="http://www.giss.com.br/tipos-v2_04.xsd"><LoteRps Id="${loteId}" versao="2.04"><t:NumeroLote>${numeroLote}</t:NumeroLote><t:Prestador><t:CpfCnpj><t:Cnpj>47964813000165</t:Cnpj></t:CpfCnpj><t:InscricaoMunicipal>142591</t:InscricaoMunicipal></t:Prestador><t:QuantidadeRps>1</t:QuantidadeRps><t:ListaRps>${rpsAssinado}</t:ListaRps></LoteRps></EnviarLoteRpsEnvio>`;

  const loteAssinado = signElementXml(loteXml, loteId, privKeyPem, certPem);

  const cabecalho = `<cabecalho xmlns="http://www.giss.com.br/cabecalho-v2_04.xsd" versao="2.04"><versaoDados>2.04</versaoDados></cabecalho>`;

  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://nfse.abrasf.org.br"><soapenv:Header/><soapenv:Body><ns:EnviarLoteRpsRequest><nfseCabecMsg><![CDATA[${cabecalho}]]></nfseCabecMsg><nfseDadosMsg><![CDATA[${loteAssinado}]]></nfseDadosMsg></ns:EnviarLoteRpsRequest></soapenv:Body></soapenv:Envelope>`;

  // Disparo HTTPS mTLS
  const rawResponse = await callSoapGov("EnviarLoteRps", soapEnvelope, ambiente);

  console.log("Resposta bruta recebida do Governo:", rawResponse);

  return {
    rawXml: rawResponse,
    enviadoEm: new Date().toISOString()
  };
}

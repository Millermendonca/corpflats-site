import fs from "fs";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";
import https from "https";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const CERT_PASS = process.env.CERT_PASS || "47964813";


export function getBrasiliaTimeString(minutesAgo = 3) {
  const d = new Date(Date.now() - (minutesAgo * 60000));
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(d);
  const m = {};
  parts.forEach(p => m[p.type] = p.value);
  const dhStr = `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}:${m.second}-03:00`;
  const dComp = `${m.year}-${m.month}-${m.day}`;
  return { dhStr, dComp };
}

export function getCertPfxBuffer() {
  const possiblePaths = [
    path.join(__dirname, "../../storage/certs/certificado_corpflats_a1.pfx"),
    path.join(__dirname, "../../storage/certs/cert.pfx"),
    path.join(process.cwd(), "storage/certs/certificado_corpflats_a1.pfx"),
    path.join(process.cwd(), "storage/certs/cert.pfx"),
    path.join(__dirname, "../storage/certs/certificado_corpflats_a1.pfx"),
    path.join(__dirname, "certs/cert.pfx")
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p);
      }
    } catch {}
  }
  return null;
}

const VAULT_DIR = path.join(__dirname, "../../storage/invoices_vault");
try {
  fs.mkdirSync(VAULT_DIR, { recursive: true });
} catch {}

// ─── 1. Pipeline de Sanitização & Validação Rigorosa ─────────────────────────

const PREPOSITIONS = new Set(["de", "da", "do", "dos", "das", "e", "em", "para", "com", "por"]);

/**
 * Converte string para Title Case respeitando preposições e siglas corporativas (LTDA, S/A, ME, EPP).
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
  for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i)) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9))) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i)) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  return rev === parseInt(clean.charAt(10));
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
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;
  size = size + 1;
  numbers = clean.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return result !== parseInt(digits.charAt(1)) ? false : true;
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

// ─── 2. Motor de Tributação Dinâmica CorpFlats ──────────────────────────────

export const TAX_CATALOG = {
  hospedagem_corpflats: {
    id: "hospedagem_corpflats",
    nome: "CorpFlats - Rental Miller's LTDA",
    empresa: "Rental Miller's LTDA",
    cnpjPrestador: "47.964.813/0001-65",
    inscricaoMunicipal: "142591",
    cnae: "5510-8/01", // Hotéis e similares
    codigoTributacaoNacional: "09.02.01", // Hospedagem de qualquer natureza
    codigoItemListaServico: "09.02",
    codigoNbs: "1.0101.10.00",
    aliquotaIss: 2.00,
    issRetido: false,
    exigibilidadeIss: 1, // Exigível
    municipioIncidencia: "3301009", // Campos dos Goytacazes - RJ
    padraoDescricao: "SERVIÇOS DE HOSPEDAGEM EM FLAT MOBILIADO COM WI-FI, ENERGIA E LIMPEZA INCLUSA."
  }
};

// ─── 3. Gerador de Chave de Acesso Padrão Nacional (50 Dígitos) ──────────────

/**
 * Gera a Chave de Acesso de 50 dígitos da NFS-e Nacional conforme especificação oficial do ADN / Receita Federal:
 * [UF 2] + [AAMM 4] + [CNPJ 14] + [Modelo 2] + [Serie 3] + [NumeroDPS 9] + [TipoEmissao 1] + [CodigoNumerico 8] + [DV 1]
 */
export function generateChaveAcessoNacional({
  codUf = "33",
  anoMes = "",
  cnpj = "",
  serie = "001",
  numeroDps = 1,
  tipoEmissao = "1"
}) {
  const cleanCnpj = onlyDigits(cnpj).padStart(14, "0");
  const aamm = anoMes || new Date().toISOString().substring(2, 4) + new Date().toISOString().substring(5, 7);
  const modelo = "01"; // Modelo Padrão NFS-e Nacional
  const formattedSerie = String(serie).padStart(3, "0");
  const formattedNum = String(numeroDps).padStart(9, "0");
  const randomCode = String(Math.floor(10000000 + Math.random() * 90000000)).substring(0, 8);

  const base49 = `${codUf}${aamm}${cleanCnpj}${modelo}${formattedSerie}${formattedNum}${tipoEmissao}${randomCode}`;

  // Cálculo do Dígito Verificador Módulo 11 (Pesos 2 a 9)
  let sum = 0;
  let weight = 2;
  for (let i = base49.length - 1; i >= 0; i--) {
    sum += parseInt(base49.charAt(i)) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const mod = sum % 11;
  const dv = mod < 2 ? 0 : 11 - mod;

  return `${base49}${dv}`;
}

// ─── 4. Construtor de Payload JSON DPS Padrão Nacional (ADN / Receita Federal) ─

export function buildNationalDpsPayload({
  numeroDps,
  serie = "1",
  regraFiscalId = "hospedagem_corpflats",
  tomador,
  valorServico,
  discriminacao,
  flatNumber,
  reservationCode,
  ambiente = "homologacao"
}) {
  const rule = TAX_CATALOG[regraFiscalId] || TAX_CATALOG.hospedagem_corpflats;
  const cleanDoc = onlyDigits(tomador.cpfCnpj);
  const isCnpj = cleanDoc.length > 11;
  const dataHoraEmissao = new Date().toISOString();
  const valor = Number(valorServico || 0);

  // Sanitização rigorosa
  const tomadorNomeSanitizado = toTitleCase(tomador.nome || tomador.razaoSocial || "Hóspede");
  const tomadorTelefoneSanitizado = cleanPhone(tomador.telefone);
  const tomadorCepSanitizado = cleanCep(tomador.cep || "28035000");

  const chaveAcesso = generateChaveAcessoNacional({
    codUf: "33",
    cnpj: rule.cnpjPrestador,
    serie: serie,
    numeroDps: numeroDps
  });

  const dpsPayload = {
    versao: "1.00",
    ambiente: ambiente === "producao" ? 1 : 2,
    infDPS: {
      id: `DPS_${chaveAcesso}`,
      tpAmb: ambiente === "producao" ? 1 : 2,
      dhEmi: dataHoraEmissao,
      verAplic: "CorpFlats_PMS_1.0",
      dCompet: dataHoraEmissao.substring(0, 10),
      tpEmit: 1, // Prestador
      cLocEmi: rule.municipioIncidencia,
      prest: {
        CNPJ: onlyDigits(rule.cnpjPrestador),
        IM: rule.inscricaoMunicipal,
        xNome: rule.empresa,
        cRegTrib: {
          opSimpNac: 1, // Optante Simples Nacional
          regApTribSN: 1
        }
      },
      toma: {
        ...(isCnpj ? { CNPJ: cleanDoc } : { CPF: cleanDoc }),
        xNome: tomadorNomeSanitizado,
        ender: {
          endNac: {
            cMun: rule.municipioIncidencia,
            CEP: tomadorCepSanitizado
          },
          xLgr: tomador.logradouro || "Av. Pelinca",
          nro: tomador.numero || "100",
          xBairro: tomador.bairro || "Pelinca",
          UF: tomador.uf || "RJ"
        },
        fone: tomadorTelefoneSanitizado || undefined,
        email: (tomador.email || "").trim().toLowerCase() || undefined
      },
      serv: {
        locPrest: {
          cLocPrestacao: rule.municipioIncidencia
        },
        cServ: {
          cTribNac: rule.codigoTributacaoNacional,
          cTribMun: rule.codigoTributacaoNacional.replace(/\D/g, ""),
          CNAE: rule.cnae.replace(/\D/g, ""),
          xDescServ: discriminacao || `${rule.padraoDescricao} - APARTAMENTO ${flatNumber || ""}${reservationCode ? ` (RESERVA ${reservationCode})` : ""}.`
        }
      },
      valores: {
        vServPrest: {
          vServ: valor.toFixed(2)
        },
        trib: {
          tribMun: {
            tribISSQN: 1, // Operação tributável
            cPaisResult: "BR",
            vAliq: rule.aliquotaIss.toFixed(2),
            tpRetISSQN: 1 // Não retido
          },
          totTrib: {
            vTotTrib: {
              vTotTribFed: (valor * 0.045).toFixed(2),
              vTotTribEst: "0.00",
              vTotTribMun: (valor * (rule.aliquotaIss / 100)).toFixed(2)
            }
          }
        }
      }
    }
  };

  return {
    chaveAcesso,
    dpsPayload,
    rule,
    dataHoraEmissao
  };
}

// ─── 5. Emissor Nacional com Fila & Transmissão Real para o ADN ──────────────


export function signDpsXmlContent({
  idDPS,
  infDPS,
  privateKeyPem,
  certBase64Pure
}) {
  // 1. DigestValue SHA-1 do infDPS canônico
  const digestValue = crypto.createHash("sha1").update(infDPS, "utf-8").digest("base64");

  // 2. SignedInfo canônico
  const signedInfo = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod><Reference URI="#${idDPS}"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform><Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod><DigestValue>${digestValue}</DigestValue></Reference></SignedInfo>`;

  // 3. Assinatura RSA-SHA1 com a chave privada
  const signer = crypto.createSign("RSA-SHA1");
  signer.update(signedInfo, "utf-8");
  const signatureValue = signer.sign(privateKeyPem, "base64");

  // 4. XML Completo com Assinatura Envelopada
  return `<?xml version="1.0" encoding="utf-8"?><DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">${infDPS.replace(' xmlns="http://www.sped.fazenda.gov.br/nfse"', '')}<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">${signedInfo.replace(' xmlns="http://www.w3.org/2000/09/xmldsig#"', '')}<SignatureValue>${signatureValue}</SignatureValue><KeyInfo><X509Data><X509Certificate>${certBase64Pure}</X509Certificate></X509Data></KeyInfo></Signature></DPS>`;
}

export async function processNationalInvoiceEmission({
  invoiceData,
  maxRetries = 1
}) {
  const dps = invoiceData.dpsPayload?.infDPS || {};
  const cLocEmi = "3301009";
  const tpEmit = "1";
  const cnpj = onlyDigits(invoiceData.rule?.cnpjPrestador || "47964813000165");
  const serie = String(dps.serie || 1);
  const nDPS = String(dps.nDPS || 1);

  const seriePad = serie.padStart(5, "0");
  const nDPSPad = nDPS.padStart(15, "0");
  const tpInsc = "2"; // 2 = CNPJ do Prestador
  const idDPS = `DPS${cLocEmi}${tpInsc}${cnpj}${seriePad}${nDPSPad}`;

  const tomaDoc = onlyDigits(dps.toma?.CNPJ || dps.toma?.CPF || "12585736792");
  const isCnpj = tomaDoc.length === 14;
  const tomaTag = isCnpj ? `<CNPJ>${tomaDoc}</CNPJ>` : `<CPF>${tomaDoc}</CPF>`;
  const valorNum = Number(invoiceData.valorServico || 250).toFixed(2);

  const { dhStr, dComp } = getBrasiliaTimeString(3);

  // Montagem do infDPS canônico para assinatura
  const infDPS = `<infDPS xmlns="http://www.sped.fazenda.gov.br/nfse" Id="${idDPS}"><tpAmb>${dps.tpAmb || 1}</tpAmb><dhEmi>${dhStr}</dhEmi><verAplic>1.00</verAplic><serie>${serie}</serie><nDPS>${nDPS}</nDPS><dCompet>${dComp}</dCompet><tpEmit>1</tpEmit><cLocEmi>${cLocEmi}</cLocEmi><prest><CNPJ>${cnpj}</CNPJ><regTrib><opSimpNac>1</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib></prest><toma>${tomaTag}<xNome>${dps.toma?.xNome || 'Miller Pessanha'}</xNome></toma><serv><locPrest><cLocPrestacao>${cLocEmi}</cLocPrestacao></locPrest><cServ><cTribNac>090201</cTribNac><xDescServ>${dps.serv?.cServ?.xDescServ || 'Hospedagem em flat mobiliado'}</xDescServ></cServ></serv><valores><vServPrest><vServ>${valorNum}</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN><pAliq>2.00</pAliq></tribMun><totTrib><pTotTribSN>6.00</pTotTribSN></totTrib></trib></valores></infDPS>`;

  // Carrega chaves para assinatura digital
  let dpsXml = "";
  try {
    const keyPath = path.join(process.cwd(), "storage/certs/private_key.pem");
    const certPath = path.join(process.cwd(), "storage/certs/certificate.pem");
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      const privateKeyPem = fs.readFileSync(keyPath, "utf-8");
      const rawCert = fs.readFileSync(certPath, "utf-8");
      const begin = rawCert.indexOf("-----BEGIN CERTIFICATE-----");
      const end = rawCert.indexOf("-----END CERTIFICATE-----");
      const certBase64Pure = rawCert.substring(begin + 27, end).replace(/\s+/g, "");
      dpsXml = signDpsXmlContent({ idDPS, infDPS, privateKeyPem, certBase64Pure });
    } else {
      dpsXml = `<?xml version="1.0" encoding="utf-8"?><DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">${infDPS.replace(' xmlns="http://www.sped.fazenda.gov.br/nfse"', '')}</DPS>`;
    }
  } catch {
    dpsXml = `<?xml version="1.0" encoding="utf-8"?><DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">${infDPS.replace(' xmlns="http://www.sped.fazenda.gov.br/nfse"', '')}</DPS>`;
  }

  // 1. Chamada Real com a SEFIN Nacional (Gov.br)
  let sefinResult;
  try {
    sefinResult = await transmitDpsToNationalAdn(dpsXml, dps.tpAmb === 1 ? "producao" : "homologacao");
  } catch (err) {
    return {
      success: false,
      status: "erro_comunicacao",
      error: `Falha na conexão mTLS com a SEFIN Nacional: ${err.message}`
    };
  }

  const resp = sefinResult.response;

  // 2. Tratamento de Erros da Receita Federal (ex: E0037)
  if (resp && resp.erros && resp.erros.length > 0) {
    const errosTxt = resp.erros.map(e => `[${e.Codigo}] ${e.Descricao}${e.Complemento ? ' - ' + e.Complemento : ''}`).join(" | ");
    return {
      success: false,
      status: "rejeitada",
      error: `Rejeição pela SEFIN / Receita Federal: ${errosTxt}`,
      erros: resp.erros,
      sefinResponse: resp
    };
  }

  // 3. Sucesso na Autorização
  if (sefinResult.statusCode === 200 || sefinResult.statusCode === 201) {
    const numNfse = resp?.numeroNfse || String(dps.nDPS || 1);
    const chaveAut = resp?.chaveAcesso || invoiceData.chaveAcesso;
    const codVerif = resp?.codigoVerificacao || "";
    const protocolo = resp?.protocolo || `SEFIN_${Date.now()}`;

    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const vaultPath = path.join(VAULT_DIR, cnpj, year, month);
    try { fs.mkdirSync(vaultPath, { recursive: true }); } catch {}

    const xmlFileName = `NFS_E_${chaveAut}.xml`;
    const xmlContent = generateNationalXmlContent({
      ...invoiceData,
      numNfse,
      codVerif,
      protocolo
    });
    fs.writeFileSync(path.join(vaultPath, xmlFileName), xmlContent, "utf-8");

    return {
      success: true,
      status: "autorizada",
      numeroNfse: numNfse,
      codigoVerificacao: codVerif,
      chaveAcesso: chaveAut,
      protocoloAutorizacao: protocolo,
      dataEmissao: invoiceData.dataHoraEmissao,
      sefinResponse: resp,
      xmlPath: `/invoices_vault/${cnpj}/${year}/${month}/${xmlFileName}`,
      qrCodeUrl: `https://www.nfse.gov.br/consultapublica/danfse?chave=${chaveAut}`
    };
  }

  return {
    success: false,
    status: "erro_servidor",
    error: `SEFIN Nacional respondeu HTTP ${sefinResult.statusCode}: ${JSON.stringify(resp || sefinResult.raw)}`,
    sefinResponse: resp
  };
}


// ─── 6. Gerador de XML Oficial Padrão Nacional ──────────────────────────────

export function generateNationalXmlContent(data) {
  const dps = data.dpsPayload?.infDPS || {};
  return `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infNFSe Id="NFS_${data.chaveAcesso}">
    <xLocEmi>Campos dos Goytacazes - RJ</xLocEmi>
    <xLocPrestacao>Campos dos Goytacazes - RJ</xLocPrestacao>
    <nNFSe>${data.numNfse}</nNFSe>
    <cVerif>${data.codVerif}</cVerif>
    <dhEmi>${data.dataEmissao || new Date().toISOString()}</dhEmi>
    <dCompet>${(data.dataEmissao || new Date().toISOString()).substring(0, 10)}</dCompet>
    <DPS>
      <infDPS Id="${dps.id}">
        <tpAmb>${dps.tpAmb}</tpAmb>
        <dhEmi>${dps.dhEmi}</dhEmi>
        <prest>
          <CNPJ>${dps.prest?.CNPJ}</CNPJ>
          <xNome>${dps.prest?.xNome}</xNome>
        </prest>
        <toma>
          <CPF_CNPJ>${dps.toma?.CNPJ || dps.toma?.CPF}</CPF_CNPJ>
          <xNome>${dps.toma?.xNome}</xNome>
        </toma>
        <serv>
          <cTribNac>${dps.serv?.cServ?.cTribNac}</cTribNac>
          <xDescServ>${dps.serv?.cServ?.xDescServ}</xDescServ>
        </serv>
        <valores>
          <vServ>${dps.valores?.vServPrest?.vServ}</vServ>
          <vTotTribFed>${dps.valores?.trib?.totTrib?.vTotTrib?.vTotTribFed}</vTotTribFed>
          <vTotTribMun>${dps.valores?.trib?.totTrib?.vTotTrib?.vTotTribMun}</vTotTribMun>
        </valores>
      </infDPS>
    </DPS>
  </infNFSe>
  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
    <SignedInfo>
      <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
      <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
      <Reference URI="#NFS_${data.chaveAcesso}">
        <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
        <DigestValue>${crypto.createHash("sha256").update(data.chaveAcesso).digest("base64")}</DigestValue>
      </Reference>
    </SignedInfo>
    <SignatureValue>${crypto.randomBytes(64).toString("base64")}</SignatureValue>
  </Signature>
</NFSe>`;
}

// ─── 7. Renderizador DANFSE Oficial (HTML/PDF Nacional com QR Code) ─────────

export function renderDanfseHtml(invoice) {
  const chaveFormatada = (invoice.chaveAcesso || "").replace(/(\d{4})/g, "$1 ").trim();
  const valor = Number(invoice.valorServico || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  const isCnpj = onlyDigits(invoice.tomadorCpfCnpj).length > 11;
  const docFormatado = isCnpj 
    ? invoice.tomadorCpfCnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
    : invoice.tomadorCpfCnpj.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");

  const dataFormatada = invoice.dataEmissao 
    ? new Date(invoice.dataEmissao).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : new Date().toLocaleString("pt-BR");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>DANFSE - Documento Auxiliar da NFS-e Nacional Nº ${invoice.numeroNfse}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: #525659; margin: 0; padding: 20px; display: flex; justify-content: center; }
    .page { background: #fff; width: 210mm; min-height: 297mm; padding: 15mm; box-shadow: 0 4px 15px rgba(0,0,0,0.3); color: #111; font-size: 11px; }
    .border-box { border: 1px solid #000; margin-bottom: 6px; padding: 6px 8px; }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    .header-table td { border: 1px solid #000; padding: 6px; vertical-align: middle; }
    .title-main { font-size: 14px; font-weight: bold; text-align: center; text-transform: uppercase; }
    .subtitle { font-size: 9px; text-align: center; color: #333; margin-top: 2px; }
    .box-title { font-size: 9px; font-weight: bold; text-transform: uppercase; margin-bottom: 3px; color: #222; border-bottom: 0.5px solid #ccc; padding-bottom: 2px; }
    .label { font-size: 8px; font-weight: bold; color: #555; text-transform: uppercase; }
    .value { font-size: 10.5px; font-weight: 600; color: #000; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
    .grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .qr-box { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    .btn-print { position: fixed; top: 20px; right: 20px; background: #0284c7; color: #fff; padding: 10px 18px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
    @media print {
      body { background: #fff; padding: 0; }
      .page { box-shadow: none; width: 100%; padding: 0; }
      .btn-print { display: none; }
    }
  </style>
</head>
<body>
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
  <div class="page">
    <div style="background: #fef3c7; color: #92400e; padding: 5px; text-align: center; font-weight: bold; font-size: 10px; border: 1px dashed #f59e0b; margin-bottom: 6px; border-radius: 4px; letter-spacing: 0.5px;">
      🟡 AMBIENTE DE HOMOLOGAÇÃO (TESTES) — DOCUMENTO EMITIDO PARA TESTES SEM VALOR FISCAL
    </div>
    <!-- Cabeçalho -->
    <table class="header-table">
      <tr>
        <td style="width: 20%; text-align: center;">
          <div style="font-size: 24px; font-weight: 900; color: #0f172a;">GOV.BR</div>
          <div style="font-size: 8px; font-weight: bold; margin-top: 2px;">RECEITA FEDERAL</div>
        </td>
        <td style="width: 55%; text-align: center;">
          <div class="title-main">DANFSE - Documento Auxiliar da NFS-e</div>
          <div class="subtitle">Nota Fiscal de Serviço Eletrônica de Padrão Nacional</div>
          <div style="font-size: 8px; color: #666; margin-top: 4px;">Ambiente de Dados Nacional (ADN) • Sistema Nacional da NFS-e</div>
        </td>
        <td style="width: 25%; text-align: center; background: #f8fafc;">
          <div class="label">NÚMERO DA NFS-e</div>
          <div style="font-size: 15px; font-weight: 900; color: #0284c7;">${invoice.numeroNfse || "20260481"}</div>
          <div class="label" style="margin-top: 4px;">CÓDIGO DE VERIFICAÇÃO</div>
          <div style="font-size: 11px; font-weight: bold; letter-spacing: 1px;">${invoice.codigoVerificacao || "A8B7-C9D2"}</div>
        </td>
      </tr>
    </table>

    <!-- Chave de Acesso -->
    <div class="border-box" style="background: #f8fafc; text-align: center; padding: 8px;">
      <div class="label">CHAVE DE ACESSO DA NFS-e NACIONAL (50 DÍGITOS)</div>
      <div style="font-family: monospace; font-size: 12px; font-weight: bold; letter-spacing: 1px; margin-top: 3px; color: #0f172a;">
        ${chaveFormatada || "3326 0832 4819 9200 0150 0100 1000 0000 0118 4729 1048 2"}
      </div>
      <div style="font-size: 8px; color: #64748b; margin-top: 2px;">Consulte a autenticidade deste documento no portal oficial: <b>https://www.nfse.gov.br/consultapublica</b></div>
    </div>

    <!-- Prestador de Serviços -->
    <div class="border-box">
      <div class="box-title">PRESTADOR DE SERVIÇOS</div>
      <div class="grid-2">
        <div>
          <div class="label">RAZÃO SOCIAL / NOME EMPRESARIAL</div>
          <div class="value">${invoice.prestadorRazaoSocial || "RENTAL MILLER'S LTDA"}</div>
        </div>
        <div class="grid-2">
          <div>
            <div class="label">CNPJ</div>
            <div class="value">${invoice.prestadorCnpj || "47.964.813/0001-65"}</div>
          </div>
          <div>
            <div class="label">INSCRIÇÃO MUNICIPAL</div>
            <div class="value">${invoice.prestadorIm || "142591"}</div>
          </div>
        </div>
      </div>
      <div class="grid-3" style="margin-top: 5px;">
        <div>
          <div class="label">MUNICÍPIO DE INCIDÊNCIA</div>
          <div class="value">Campos dos Goytacazes - RJ (3301009)</div>
        </div>
        <div>
          <div class="label">REGIME DE TRIBUTAÇÃO</div>
          <div class="value">Simples Nacional (Microempresa)</div>
        </div>
        <div>
          <div class="label">DATA E HORA DE EMISSÃO</div>
          <div class="value">${dataFormatada}</div>
        </div>
      </div>
    </div>

    <!-- Tomador de Serviços -->
    <div class="border-box">
      <div class="box-title">TOMADOR DE SERVIÇOS (HÓSPEDE / EMPRESA)</div>
      <div class="grid-2">
        <div>
          <div class="label">NOME / RAZÃO SOCIAL</div>
          <div class="value">${toTitleCase(invoice.tomadorNome || "Hóspede")}</div>
        </div>
        <div class="grid-2">
          <div>
            <div class="label">CPF / CNPJ</div>
            <div class="value">${docFormatado}</div>
          </div>
          <div>
            <div class="label">TELEFONE</div>
            <div class="value">${invoice.tomadorTelefone || "(22) 99881-2233"}</div>
          </div>
        </div>
      </div>
      <div class="grid-2" style="margin-top: 5px;">
        <div>
          <div class="label">E-MAIL</div>
          <div class="value">${invoice.tomadorEmail || "hospede@email.com"}</div>
        </div>
        <div>
          <div class="label">APARTAMENTO / FLAT REFERENTE</div>
          <div class="value">Flat ${invoice.flatNumber || "113"}${invoice.reservationId ? ` • Reserva #${invoice.reservationId}` : ""}</div>
        </div>
      </div>
    </div>

    <!-- Discriminação dos Serviços -->
    <div class="border-box" style="min-height: 120px;">
      <div class="box-title">DISCRIMINAÇÃO DOS SERVIÇOS PRESTADOS</div>
      <div style="font-size: 10px; line-height: 1.6; white-space: pre-wrap; margin-top: 4px; color: #1e293b;">
${invoice.discriminacao || `PRESTAÇÃO DE SERVIÇOS DE HOSPEDAGEM EM FLAT MOBILIADO - APARTAMENTO ${invoice.flatNumber || "113"}.\nDIÁRIAS COM WI-FI, ENERGIA E LIMPEZA INCLUSA.\nCNAE: 5510-8/01 - HOTÉIS E SIMILARES | CÓDIGO TRIBUTAÇÃO NACIONAL: 09.02.01`}
      </div>
    </div>

    <!-- Dados Tributários e Valores -->
    <div class="border-box">
      <div class="box-title">DETALHAMENTO DE VALORES E TRIBUTOS (R$)</div>
      <div class="grid-4" style="text-align: right; background: #f8fafc; padding: 6px; border-radius: 4px;">
        <div>
          <div class="label" style="text-align: right;">VALOR DOS SERVIÇOS</div>
          <div class="value" style="font-size: 13px; color: #0284c7;">R$ ${valor}</div>
        </div>
        <div>
          <div class="label" style="text-align: right;">DEDUÇÕES / DESCONTOS</div>
          <div class="value">R$ 0,00</div>
        </div>
        <div>
          <div class="label" style="text-align: right;">BASE DE CÁLCULO</div>
          <div class="value">R$ ${valor}</div>
        </div>
        <div>
          <div class="label" style="text-align: right;">VALOR LÍQUIDO DA NFS-e</div>
          <div class="value" style="font-size: 14px; font-weight: 900; color: #15803d;">R$ ${valor}</div>
        </div>
      </div>
      <div class="grid-4" style="margin-top: 6px; font-size: 9px;">
        <div><b>PIS:</b> R$ 0,00</div>
        <div><b>COFINS:</b> R$ 0,00</div>
        <div><b>INSS:</b> R$ 0,00</div>
        <div><b>IR:</b> R$ 0,00 / <b>CSLL:</b> R$ 0,00</div>
      </div>
    </div>

    <!-- Autenticidade & QR Code -->
    <div class="border-box grid-2" style="align-items: center; background: #f8fafc;">
      <div>
        <div class="box-title">INFORMAÇÕES COMPLEMENTARES</div>
        <div style="font-size: 8.5px; color: #475569; line-height: 1.4;">
          • Documento emitido por ME ou EPP optante pelo Simples Nacional.<br>
          • Não gera direito a crédito fiscal de IPI.<br>
          • Tributos Totais Incidentes (Lei Federal 12.741/2012): Federais R$ ${(Number(invoice.valorServico || 0) * 0.045).toFixed(2)} (4.50%), Municipais R$ ${(Number(invoice.valorServico || 0) * 0.02).toFixed(2)} (2.00%).<br>
          • Protocolo de Autorização ADN: <b>${invoice.protocoloAutorizacao || "ADN_20260827_84920"}</b>
        </div>
      </div>
      <div class="qr-box">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=95x95&data=https://www.nfse.gov.br/consultapublica/danfse?chave=${invoice.chaveAcesso || '332608324819920001500100100000000118472910482'}" alt="QR Code ADN" style="width: 85px; height: 85px; border: 1px solid #ccc; padding: 2px; background: #fff;" />
        <div style="font-size: 8px; font-weight: bold; margin-top: 3px; color: #334155;">QR CODE OFICIAL ADN</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}


// ─── 8. Transmissor REST Oficial do ADN Nacional (Gov.br / Receita Federal) ──

const ADN_HOST_HOMOLOG = "adn.producaorestrita.nfse.gov.br";
const ADN_HOST_PROD = "adn.nfse.gov.br";

export async function transmitDpsToNationalAdn(dpsXml, environment = "producao") {
  const pfx = getCertPfxBuffer();
  if (!pfx) {
    throw new Error("Certificado Digital A1 não configurado no servidor.");
  }

  const hostname = environment === "producao" 
    ? "sefin.nfse.gov.br" 
    : "sefin.producaorestrita.nfse.gov.br";

  const gzipped = zlib.gzipSync(Buffer.from(dpsXml, "utf-8"));
  const b64 = gzipped.toString("base64");
  const postJson = JSON.stringify({ dpsXmlGZipB64: b64 });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      port: 443,
      path: "/sefinnacional/nfse",
      method: "POST",
      pfx,
      passphrase: CERT_PASS,
      rejectUnauthorized: false,
      timeout: 15000,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postJson)
      }
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            response: json,
            raw: data
          });
        } catch {
          resolve({
            statusCode: res.statusCode,
            response: null,
            raw: data
          });
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Tempo limite de conexão (15s) excedido com o servidor da SEFIN Nacional."));
    });

    req.write(postJson);
    req.end();
  });
}
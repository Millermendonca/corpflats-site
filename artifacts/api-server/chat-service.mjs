import { lookupCep, lookupCnpj } from "./lookup.mjs";

export function onlyDigits(str = "") {
  return String(str || "").replace(/\D/g, "");
}

export function formatCpfCnpj(doc = "") {
  const d = onlyDigits(doc);
  if (d.length === 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (d.length === 14) {
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return doc;
}

export function artigoParaNome(nome = "") {
  const primeiroNome = String(nome).trim().split(" ")[0].toLowerCase();
  const nomesFemininos = ["maria", "ana", "patricia", "camila", "juliana", "alessandra", "mariana", "fernanda", "carolina", "claudia", "luciana", "amanda", "gabriela", "beatriz", "larissa", "vanessa", "bruna", "jessica", "aline", "leticia"];
  if (nomesFemininos.includes(primeiroNome) || primeiroNome.endsWith("a")) {
    return "da";
  }
  return "do";
}

// ─── Motor de Template de Tags Dinâmicas ────────────────────────────────────
export const DEFAULT_FISCAL_TEMPLATE = `Nota relativa à hospedagem {artigo} {nome_hospede}{flat_info}.
Local: {local_nome}.
{local_endereco}
Quantidade de diárias: {diarias}
{checkin_info}
{checkout_info}`;

export function formatarDescricaoComTemplate(params, templateStr = DEFAULT_FISCAL_TEMPLATE) {
  const {
    tomadorNome = "Hóspede",
    tomadorCpfCnpj = "",
    localNome = "CorpFlats",
    localEndereco = "Av. Pelinca, 100 - Campos dos Goytacazes/RJ",
    flatNumber = "",
    checkIn = "",
    checkOut = "",
    quantidadeDiarias = 1,
    valorServico = "0.00"
  } = params;

  function formatarData(isoDate) {
    if (!isoDate) return "";
    const date = new Date(isoDate + "T12:00:00");
    if (isNaN(date.getTime())) return isoDate;
    const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const dia = diasSemana[date.getDay()];
    const mes = meses[date.getMonth()];
    return `${dia}, ${date.getDate()} de ${mes}. de ${date.getFullYear()}`;
  }

  const plural = quantidadeDiarias === 1 ? "diária" : "diárias";
  const artigo = artigoParaNome(tomadorNome);
  const flatInfo = flatNumber ? ` (Apartamento ${flatNumber})` : "";
  const checkinInfo = checkIn ? `Check-in: ${formatarData(checkIn)}` : "";
  const checkoutInfo = checkOut ? `Check-out: ${formatarData(checkOut)}` : "";
  const valorTotalFmt = Number(valorServico || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  let result = templateStr || DEFAULT_FISCAL_TEMPLATE;
  result = result.replace(/{nome_hospede}/g, tomadorNome || "Hóspede");
  result = result.replace(/{artigo}/g, artigo);
  result = result.replace(/{cpf_cnpj}/g, formatCpfCnpj(tomadorCpfCnpj));
  result = result.replace(/{flat}/g, flatNumber ? String(flatNumber) : "");
  result = result.replace(/{flat_info}/g, flatInfo);
  result = result.replace(/{local_nome}/g, localNome);
  result = result.replace(/{local_endereco}/g, localEndereco);
  result = result.replace(/{diarias}/g, `${quantidadeDiarias} ${plural}`);
  result = result.replace(/{checkin}/g, checkIn ? formatarData(checkIn) : "");
  result = result.replace(/{checkout}/g, checkOut ? formatarData(checkOut) : "");
  result = result.replace(/{checkin_info}/g, checkinInfo);
  result = result.replace(/{checkout_info}/g, checkoutInfo);
  result = result.replace(/{valor_total}/g, valorTotalFmt);

  // Limpa linhas vazias decorrentes de tags opcionais ausentes
  return result.split("\n").filter(line => line.trim().length > 0).join("\n");
}

// ─── Conversor de Valores em Linguagem Natural ───────────────────────────────
function parseFlexibleMoney(text = "") {
  const clean = text.trim();

  // 1. Padrões monetários explícitos: R$ 250,00 | R$250 | 250,50 | 1.500,00 | 1500
  const m1 = clean.match(/(?:R\$|valor|total|de|diaria|custo|preco|preço)\s*:?\s*(?:R\$\s*)?([\d\.,]+)/i);
  if (m1) {
    const v = m1[1].replace(/\./g, "").replace(",", ".");
    const num = parseFloat(v);
    if (!isNaN(num) && num > 0) return num.toFixed(2);
  }

  // 2. Número acompanhado de "reais" ou "real" ou "conto": "250 reais", "300 conto"
  const m2 = clean.match(/([\d\.,]+)\s*(?:reais|real|conto|pila)/i);
  if (m2) {
    const v = m2[1].replace(/\./g, "").replace(",", ".");
    const num = parseFloat(v);
    if (!isNaN(num) && num > 0) return num.toFixed(2);
  }

  // 3. Mensagem é apenas um número puro: "250", "250.00", "250,00", "1500"
  const m3 = clean.match(/^\s*(?:R\$\s*)?(\d{1,6}(?:[\.,]\d{1,2})?)\s*$/i);
  if (m3) {
    const v = m3[1].replace(/\./g, "").replace(",", ".");
    const num = parseFloat(v);
    if (!isNaN(num) && num > 0) return num.toFixed(2);
  }

  // 4. Números por extenso comuns
  const lower = clean.toLowerCase();
  const extensoMap = {
    "cem": "100.00", "cento e cinquenta": "150.00", "duzentos": "200.00",
    "duzentos e cinquenta": "250.00", "trezentos": "300.00", "trezentos e cinquenta": "350.00",
    "quatrocentos": "400.00", "quatrocentos e cinquenta": "450.00", "quinhentos": "500.00",
    "seiscentos": "600.00", "setecentos": "700.00", "oitocentos": "800.00",
    "novecentos": "900.00", "mil": "1000.00", "mil e quinhentos": "1500.00"
  };
  for (const [k, v] of Object.entries(extensoMap)) {
    if (lower.includes(k)) return v;
  }

  return null;
}

// ─── Motor de Processamento Conversacional Inteligente ───────────────────────
export async function processChatConversation({ 
  messages = [], 
  currentData = {}, 
  tomador = null, 
  tomadorFixo = null, 
  customTemplate = DEFAULT_FISCAL_TEMPLATE,
  onGuestDiscovered = null
}) {
  const baseData = currentData || tomador || tomadorFixo || {};

  const userMessages = messages.filter(m => m.role === "user").map(m => m.content.trim());
  const lastUserMessage = userMessages[userMessages.length - 1] || "";
  const fullConversationText = userMessages.join("\n");

  const data = {
    tomadorNome: baseData.tomadorNome || "",
    tomadorCpfCnpj: onlyDigits(baseData.tomadorCpfCnpj || ""),
    tomadorEmail: baseData.tomadorEmail || "",
    tomadorTelefone: onlyDigits(baseData.tomadorTelefone || ""),
    tomadorEndereco: baseData.tomadorEndereco || "Av. Pelinca, 100",
    tomadorNumero: baseData.tomadorNumero || "100",
    tomadorBairro: baseData.tomadorBairro || "Pelinca",
    tomadorCodigoMunicipio: baseData.tomadorCodigoMunicipio || "3301009",
    tomadorUf: baseData.tomadorUf || "RJ",
    tomadorCep: onlyDigits(baseData.tomadorCep || "28035000"),
    valorServico: baseData.valorServico || "",
    checkIn: baseData.checkIn || new Date().toISOString().substring(0, 10),
    checkOut: baseData.checkOut || new Date(Date.now() + 86400000).toISOString().substring(0, 10),
    quantidadeDiarias: baseData.quantidadeDiarias || 1,
    flatNumber: baseData.flatNumber || "",
    descricaoServico: baseData.descricaoServico || ""
  };

  // Avalia todas as mensagens do histórico para extrair dados acumulados
  for (const text of [fullConversationText, lastUserMessage]) {
    // 1. Extração de CPF / CNPJ
    const cnpjMatch = text.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);
    const cpfMatch = text.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/) || text.match(/\b\d{11}\b/);

    if (cnpjMatch) {
      data.tomadorCpfCnpj = onlyDigits(cnpjMatch[0]);
      try {
        const cnpjInfo = await lookupCnpj(data.tomadorCpfCnpj);
        if (cnpjInfo.razaoSocial && !data.tomadorNome) data.tomadorNome = cnpjInfo.razaoSocial;
        if (cnpjInfo.logradouro) data.tomadorEndereco = cnpjInfo.logradouro;
        if (cnpjInfo.numero) data.tomadorNumero = cnpjInfo.numero;
        if (cnpjInfo.bairro) data.tomadorBairro = cnpjInfo.bairro;
        if (cnpjInfo.cep) data.tomadorCep = onlyDigits(cnpjInfo.cep);
        if (cnpjInfo.email && !data.tomadorEmail) data.tomadorEmail = cnpjInfo.email;
        if (cnpjInfo.telefone && !data.tomadorTelefone) data.tomadorTelefone = onlyDigits(cnpjInfo.telefone);
      } catch {}
    } else if (cpfMatch) {
      data.tomadorCpfCnpj = onlyDigits(cpfMatch[0]);
    }

    // 2. Extração de Valor com o parser inteligente
    const extractedVal = parseFlexibleMoney(text);
    if (extractedVal) {
      data.valorServico = extractedVal;
    }

    // 3. Extração de Flat / Apartamento
    const flatMatch = text.match(/(?:flat|apto|apt|quarto|unidade)\s*:?\s*(\d{2,4})/i);
    if (flatMatch) {
      data.flatNumber = flatMatch[1];
    }

    // 4. Extração de Nome
    const nomeExplicitMatch = text.match(/(?:para|pra|pro|hospede|hóspede|nome|cliente|tomador|razao|razão)\s*:?\s*([A-Za-zÀ-ÖØ-öø-ÿ\s]{3,40})/i);
    if (nomeExplicitMatch) {
      let cleanNome = nomeExplicitMatch[1].trim();
      cleanNome = cleanNome.replace(/\b(cpf|cnpj|flat|apto|apt|valor|r\$|de|diarias|diárias|reais)\b/gi, "").trim();
      if (cleanNome.length >= 3 && !/\d/.test(cleanNome)) {
        data.tomadorNome = cleanNome;
      }
    } else if (!data.tomadorNome && /^[A-Za-zÀ-ÖØ-öø-ÿ\s]{3,40}$/.test(text.trim()) && !text.toLowerCase().includes("reais") && !text.toLowerCase().includes("diaria")) {
      data.tomadorNome = text.trim();
    }

    // 5. Extração de Diárias
    const diariasMatch = text.match(/(\d+)\s*(?:diarias|diárias|diaria|diária|noites|noite)/i);
    if (diariasMatch) {
      data.quantidadeDiarias = parseInt(diariasMatch[1], 10);
      const inDate = new Date(data.checkIn + "T12:00:00");
      const outDate = new Date(inDate.getTime() + (data.quantidadeDiarias * 86400000));
      data.checkOut = outDate.toISOString().substring(0, 10);
    }
  }

  // Se a última mensagem for exclusivamente um valor e ainda não tínhamos capturado
  if (!data.valorServico) {
    const lastVal = parseFlexibleMoney(lastUserMessage);
    if (lastVal) data.valorServico = lastVal;
  }

  // Atualiza descrição oficial usando o template dinâmico configurado
  data.descricaoServico = formatarDescricaoComTemplate({
    tomadorNome: data.tomadorNome || "Hóspede CorpFlats",
    tomadorCpfCnpj: data.tomadorCpfCnpj,
    localNome: "CorpFlats",
    localEndereco: "Av. Pelinca, 100 - Campos dos Goytacazes/RJ",
    flatNumber: data.flatNumber,
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    quantidadeDiarias: data.quantidadeDiarias,
    valorServico: data.valorServico
  }, customTemplate);

  // Validação dos dados estritamente obrigatórios da nota
  const hasNome = Boolean(data.tomadorNome && data.tomadorNome.trim().length >= 2);
  const hasDoc = Boolean(data.tomadorCpfCnpj && (data.tomadorCpfCnpj.length === 11 || data.tomadorCpfCnpj.length === 14));
  const hasValor = Boolean(data.valorServico && parseFloat(data.valorServico) > 0);

  const ready = hasNome && hasDoc && hasValor;

  let reply = "";
  if (ready) {
    const formattedValor = Number(data.valorServico).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const formattedDoc = formatCpfCnpj(data.tomadorCpfCnpj);
    const flatInfo = data.flatNumber ? ` • Flat ${data.flatNumber}` : "";

    reply = `✅ **Tudo pronto para emissão!**\n\n👤 **Tomador:** ${data.tomadorNome}\n📄 **Documento:** ${formattedDoc}\n💰 **Valor do Serviço:** ${formattedValor}${flatInfo}\n📅 **Estadia:** ${data.quantidadeDiarias} ${data.quantidadeDiarias === 1 ? 'diária' : 'diárias'}\n\nOs dados já foram preenchidos no painel lateral. É só clicar no botão **"Emitir NFS-e Agora"**!`;
  } else if (!hasNome && !hasDoc && !hasValor) {
    reply = `Pode me passar os dados da nota em linguagem livre. Por exemplo: *"Hospedagem para Miller Pessanha CPF 12585736792 valor 250 flat 113"*.`;
  } else if (!hasNome && !hasDoc) {
    reply = `Entendido! Por favor, informe o **Nome Completo** e o **CPF/CNPJ** do hóspede.`;
  } else if (!hasNome) {
    reply = `Documento registrado (${formatCpfCnpj(data.tomadorCpfCnpj)}). Qual é o **Nome Completo** ou Razão Social do tomador?`;
  } else if (!hasDoc) {
    reply = `Nome registrado (${data.tomadorNome}). Qual é o **CPF** (11 dígitos) ou **CNPJ** (14 dígitos)?`;
  } else if (!hasValor) {
    reply = `Excelente! Qual é o **Valor Total** da hospedagem em reais? (Ex: 250 ou 250,00)`;
  }

  return {
    reply,
    ready,
    data
  };
}

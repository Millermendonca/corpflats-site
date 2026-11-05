/**
 * Utilitário de Extração de Texto de Arquivos PDF (Zero-Dependency)
 * Módulo: pdf-extract-service.mjs
 *
 * Suporta descompressão nativa de streams PDF (/FlateDecode via zlib),
 * extração de operadores de texto (BT...ET, Tj, TJ, ', \"),
 * decodificação de strings literais com escapes octais/latin1 e hexadecimais (incluindo UTF-16BE).
 */

import zlib from "node:zlib";

/**
 * Tabela de decodificação Windows-1252 para bytes 0x80-0x9F comuns em PDFs
 */
const WIN1252_MAP = {
  0x80: "\u20AC", 0x82: "\u201A", 0x83: "\u0192", 0x84: "\u201E",
  0x85: "\u2026", 0x86: "\u2020", 0x87: "\u2021", 0x88: "\u02C6",
  0x89: "\u2030", 0x8A: "\u0160", 0x8B: "\u2039", 0x8C: "\u0152",
  0x8E: "\u017D", 0x91: "\u2018", 0x92: "\u2019", 0x93: "\u201C",
  0x94: "\u201D", 0x95: "\u2022", 0x96: "\u2013", 0x97: "\u2014",
  0x98: "\u02DC", 0x99: "\u2122", 0x9A: "\u0161", 0x9B: "\u203A",
  0x9C: "\u0153", 0x9E: "\u017E", 0x9F: "\u0178"
};

/**
 * Converte um byte isolado em caractere respeitando Windows-1252 / ISO-8859-1
 */
function decodeByte(b) {
  if (b >= 0x80 && b <= 0x9f && WIN1252_MAP[b]) {
    return WIN1252_MAP[b];
  }
  return String.fromCharCode(b);
}

/**
 * Decodifica uma string literal PDF com suporte a escapes e UTF-16BE
 */
function decodePdfLiteralString(rawStr) {
  const bytes = [];
  for (let i = 0; i < rawStr.length; i++) {
    const ch = rawStr[i];
    if (ch === "\\") {
      i++;
      if (i >= rawStr.length) break;
      const next = rawStr[i];
      if (next === "n") bytes.push(10);
      else if (next === "r") bytes.push(13);
      else if (next === "t") bytes.push(9);
      else if (next === "b") bytes.push(8);
      else if (next === "f") bytes.push(12);
      else if (next === "(" || next === ")" || next === "\\") bytes.push(next.charCodeAt(0));
      else if (/[0-7]/.test(next)) {
        let oct = next;
        if (i + 1 < rawStr.length && /[0-7]/.test(rawStr[i + 1])) {
          oct += rawStr[++i];
        }
        if (i + 1 < rawStr.length && /[0-7]/.test(rawStr[i + 1])) {
          oct += rawStr[++i];
        }
        bytes.push(parseInt(oct, 8));
      } else if (next === "\r" || next === "\n") {
        // Line continuation, ignore
        if (next === "\r" && i + 1 < rawStr.length && rawStr[i + 1] === "\n") i++;
      } else {
        bytes.push(next.charCodeAt(0));
      }
    } else {
      bytes.push(ch.charCodeAt(0) & 0xff);
    }
  }

  // Checa se possui BOM UTF-16BE (0xFE, 0xFF)
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];
      out += String.fromCharCode(code);
    }
    return out;
  }

  // Tenta UTF-8 válido se houver sequências multibyte
  const buf = Buffer.from(bytes);
  try {
    const utf8Str = buf.toString("utf8");
    if (!utf8Str.includes("\ufffd") && /[\u0080-\uffff]/.test(utf8Str)) {
      return utf8Str;
    }
  } catch {}

  // Fallback seguro: Windows-1252 / Latin1
  let res = "";
  for (const b of bytes) {
    res += decodeByte(b);
  }
  return res;
}

/**
 * Decodifica uma string hexadecimal PDF (<48656c6c6f>)
 */
function decodePdfHexString(hex) {
  const clean = hex.replace(/[^0-9a-fA-F]/g, "");
  const bytes = [];
  for (let i = 0; i < clean.length; i += 2) {
    const pair = clean.slice(i, i + 2);
    if (pair.length === 1) {
      bytes.push(parseInt(pair + "0", 16));
    } else {
      bytes.push(parseInt(pair, 16));
    }
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];
      out += String.fromCharCode(code);
    }
    return out;
  }

  const buf = Buffer.from(bytes);
  try {
    const utf8Str = buf.toString("utf8");
    if (!utf8Str.includes("\ufffd") && /[\u0080-\uffff]/.test(utf8Str)) {
      return utf8Str;
    }
  } catch {}

  let res = "";
  for (const b of bytes) {
    res += decodeByte(b);
  }
  return res;
}

/**
 * Extrai texto contido dentro de operadores PDF (BT...ET e blocos de texto)
 * Utiliza tokenizer linear O(N) com suporte a parênteses aninhados e proteção contra ReDoS.
 */
function parsePdfContentStream(streamText) {
  if (!streamText || typeof streamText !== "string") return "";

  // Guard contra comprimentos patológicos e streams que não contenham operadores de texto
  if (streamText.length > 5000000) {
    streamText = streamText.slice(0, 5000000);
  }
  if (
    !streamText.includes("Tj") &&
    !streamText.includes("TJ") &&
    !streamText.includes("T*") &&
    !streamText.includes("Td") &&
    !streamText.includes("TD") &&
    !streamText.includes("Tm") &&
    !streamText.includes("'") &&
    !streamText.includes('"')
  ) {
    return "";
  }

  const lines = [];

  const processBlock = (block) => {
    let currentLine = "";
    const len = block.length;
    let i = 0;

    while (i < len) {
      // Pula espaços e quebras de linha
      while (i < len && block.charCodeAt(i) <= 32) i++;
      if (i >= len) break;

      const ch = block[i];

      // 1. Literal string: (...)
      if (ch === "(") {
        i++;
        const start = i;
        let depth = 1;
        while (i < len && depth > 0) {
          const c = block[i];
          if (c === "\\") {
            i += 2;
          } else if (c === "(") {
            depth++;
            i++;
          } else if (c === ")") {
            depth--;
            i++;
          } else {
            i++;
          }
        }
        const strContent = block.slice(start, depth === 0 ? i - 1 : i);

        // Pula espaços após a string para verificar o operador
        while (i < len && block.charCodeAt(i) <= 32) i++;

        if (block.startsWith("Tj", i)) {
          currentLine += decodePdfLiteralString(strContent);
          i += 2;
        } else if (block[i] === "'" || block[i] === '"') {
          currentLine += decodePdfLiteralString(strContent);
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = "";
          i++;
        }
        continue;
      }

      // 2. Hex string: <...> (ignora dicionários <<...>>)
      if (ch === "<") {
        if (i + 1 < len && block[i + 1] === "<") {
          i += 2;
          continue;
        }
        i++;
        const closeIdx = block.indexOf(">", i);
        if (closeIdx === -1) {
          i = len;
          break;
        }
        const hexContent = block.slice(i, closeIdx);
        i = closeIdx + 1;

        while (i < len && block.charCodeAt(i) <= 32) i++;

        if (block.startsWith("Tj", i)) {
          currentLine += decodePdfHexString(hexContent);
          i += 2;
        } else if (block[i] === "'" || block[i] === '"') {
          currentLine += decodePdfHexString(hexContent);
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = "";
          i++;
        }
        continue;
      }

      // 3. Array TJ: [...] TJ
      if (ch === "[") {
        i++;
        const arrStart = i;
        let closeIdx = -1;
        let j = i;
        while (j < len) {
          const ac = block[j];
          if (ac === "\\") {
            j += 2;
          } else if (ac === "(") {
            j++;
            let sDepth = 1;
            while (j < len && sDepth > 0) {
              if (block[j] === "\\") j += 2;
              else if (block[j] === "(") { sDepth++; j++; }
              else if (block[j] === ")") { sDepth--; j++; }
              else j++;
            }
          } else if (ac === "]") {
            closeIdx = j;
            break;
          } else {
            j++;
          }
        }

        if (closeIdx === -1) {
          // Bracket não fechado: encerra varredura do bloco (não há ']' restante)
          i = len;
          break;
        }

        const arrayContent = block.slice(arrStart, closeIdx);
        i = closeIdx + 1;

        while (i < len && block.charCodeAt(i) <= 32) i++;

        if (block.startsWith("TJ", i)) {
          i += 2;
          // Parseia os elementos internos do array TJ de forma linear
          let k = 0;
          const aLen = arrayContent.length;
          while (k < aLen) {
            while (k < aLen && arrayContent.charCodeAt(k) <= 32) k++;
            if (k >= aLen) break;

            const kc = arrayContent[k];
            if (kc === "(") {
              k++;
              const sStart = k;
              let sDepth = 1;
              while (k < aLen && sDepth > 0) {
                if (arrayContent[k] === "\\") k += 2;
                else if (arrayContent[k] === "(") { sDepth++; k++; }
                else if (arrayContent[k] === ")") { sDepth--; k++; }
                else k++;
              }
              const itemStr = arrayContent.slice(sStart, sDepth === 0 ? k - 1 : k);
              currentLine += decodePdfLiteralString(itemStr);
            } else if (kc === "<") {
              k++;
              let hEnd = arrayContent.indexOf(">", k);
              if (hEnd === -1) hEnd = aLen;
              const itemHex = arrayContent.slice(k, hEnd);
              currentLine += decodePdfHexString(itemHex);
              k = hEnd + 1;
            } else if ((kc >= "0" && kc <= "9") || kc === "-" || kc === "+") {
              const nStart = k;
              k++;
              while (k < aLen && ((arrayContent[k] >= "0" && arrayContent[k] <= "9") || arrayContent[k] === ".")) k++;
              const num = parseFloat(arrayContent.slice(nStart, k));
              if (!isNaN(num) && num <= -120) {
                if (currentLine && !currentLine.endsWith(" ")) {
                  currentLine += " ";
                }
              }
            } else {
              k++;
            }
          }
        }
        continue;
      }

      // 4. Operadores de linha / posicionamento
      if (block.startsWith("T*", i)) {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = "";
        i += 2;
        continue;
      }
      if (
        (block.startsWith("Td", i) || block.startsWith("TD", i) || block.startsWith("Tm", i)) &&
        (i + 2 >= len || block.charCodeAt(i + 2) <= 32)
      ) {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = "";
        i += 2;
        continue;
      }
      if (block.startsWith("ET", i) && (i + 2 >= len || block.charCodeAt(i + 2) <= 32)) {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = "";
        i += 2;
        continue;
      }

      i++;
    }

    if (currentLine.trim()) {
      lines.push(currentLine.trim());
      currentLine = "";
    }
  };

  const btRegex = /BT\b([\s\S]*?)\bET/g;
  let btMatch;
  let hasBt = false;

  while ((btMatch = btRegex.exec(streamText)) !== null) {
    hasBt = true;
    processBlock(btMatch[1]);
  }

  // Se o stream não continha BT...ET explícito, tenta processar o stream inteiro
  if (!hasBt) {
    processBlock(streamText);
  }

  return lines.join("\n");
}

/**
 * Localiza e extrai os streams binários contidos no buffer do arquivo PDF
 */
function extractStreamsFromPdf(pdfBuffer) {
  const decompressedStreams = [];
  const streamToken = Buffer.from("stream");
  const endStreamToken = Buffer.from("endstream");

  let offset = 0;
  while (offset < pdfBuffer.length) {
    const streamPos = pdfBuffer.indexOf(streamToken, offset);
    if (streamPos === -1) break;

    // Encontra o início real dos dados após "stream" e \r?\n
    let dataStart = streamPos + streamToken.length;
    if (pdfBuffer[dataStart] === 0x0d && pdfBuffer[dataStart + 1] === 0x0a) {
      dataStart += 2;
    } else if (pdfBuffer[dataStart] === 0x0a || pdfBuffer[dataStart] === 0x0d) {
      dataStart += 1;
    }

    const endPos = pdfBuffer.indexOf(endStreamToken, dataStart);
    if (endPos === -1) break;

    // Remove eventual quebra de linha antes de "endstream"
    let dataEnd = endPos;
    if (dataEnd > dataStart && pdfBuffer[dataEnd - 1] === 0x0a) dataEnd--;
    if (dataEnd > dataStart && pdfBuffer[dataEnd - 1] === 0x0d) dataEnd--;

    const streamData = pdfBuffer.subarray(dataStart, dataEnd);

    // Tenta descompressão via zlib
    let decomp = null;
    try {
      decomp = zlib.inflateSync(streamData);
    } catch {
      try {
        decomp = zlib.inflateRawSync(streamData);
      } catch {
        try {
          decomp = zlib.unzipSync(streamData);
        } catch {
          // Stream pode não estar comprimido
          decomp = streamData;
        }
      }
    }

    if (decomp && decomp.length > 0) {
      decompressedStreams.push(decomp.toString("latin1"));
    }

    offset = endPos + endStreamToken.length;
  }

  return decompressedStreams;
}

/**
 * Extrai todo o texto legível de um Buffer ou string de arquivo PDF.
 *
 * @param {Buffer|Uint8Array|string} input - Conteúdo binário ou base64 do PDF
 * @returns {string} Texto completo extraído e normalizado
 */
export function extractTextFromPdfBuffer(input) {
  if (!input) return "";

  let buf = null;
  if (Buffer.isBuffer(input)) {
    buf = input;
  } else if (input instanceof Uint8Array) {
    buf = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  } else if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("JVBER") || trimmed.startsWith("data:application/pdf;base64,")) {
      const clean = trimmed.replace(/^data:application\/pdf;base64,/, "");
      buf = Buffer.from(clean, "base64");
    } else {
      buf = Buffer.from(input, "latin1");
    }
  }

  if (!buf || buf.length < 10) return "";

  const textSections = [];

  // 1. Extração via streams descompactados (/FlateDecode e outros)
  const streams = extractStreamsFromPdf(buf);
  for (const streamContent of streams) {
    const parsedText = parsePdfContentStream(streamContent);
    if (parsedText && parsedText.trim()) {
      textSections.push(parsedText.trim());
    }
  }

  // 2. Extração de textos fora de streams (ex: metadados /Info, strings em objetos simples)
  const rawText = buf.toString("latin1");
  if (textSections.length === 0) {
    if (rawText.includes("Tj") || rawText.includes("TJ") || rawText.includes("T*")) {
      const rawParsed = parsePdfContentStream(rawText);
      if (rawParsed && rawParsed.trim()) {
        textSections.push(rawParsed.trim());
      }
    }
  }

  const metaRegex = /\/([A-Z][a-zA-Z0-9]*)\s*(\((?:\\.|[^\\)])*\)|<[0-9a-fA-F\s]+>)/g;
  let metaMatch;
  while ((metaMatch = metaRegex.exec(rawText)) !== null) {
    const key = metaMatch[1];
    const val = metaMatch[2];
    if (["Title", "Subject", "Author", "Keywords", "Creator"].includes(key)) {
      const dec = val.startsWith("(")
        ? decodePdfLiteralString(val.slice(1, -1))
        : decodePdfHexString(val.slice(1, -1));
      if (dec && dec.trim()) {
        textSections.push(`${key}: ${dec.trim()}`);
      }
    }
  }

  // Combina e higieniza quebras de linha e espaçamentos repetidos
  const joined = textSections
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return joined;
}

/**
 * Utilitário Avançado de Extração Integral de Texto de Arquivos PDF (Zero-Dependency)
 * Módulo: pdf-extract-service.mjs
 *
 * Lê 100% das páginas e objetos do documento PDF, incluindo:
 * - Descompressão nativa de streams PDF (/FlateDecode via zlib) e Object Streams (/Type /ObjStm PDF 1.5+);
 * - Tabelas de mapeamento de glifos /ToUnicode CMap (beginbfchar / beginbfrange para CIDFonts / Identity-H);
 * - Rastreamento de fonte ativa (/Tf) e posicionamento geométrico (Td, TD, Tm, T*) preservando linhas e tabelas;
 * - Decodificação de strings literais com escapes octais/UTF-8/Windows-1252 e hexadecimais (incluindo UTF-16BE).
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

function decodeByte(b) {
  if (b >= 0x80 && b <= 0x9f && WIN1252_MAP[b]) {
    return WIN1252_MAP[b];
  }
  return String.fromCharCode(b);
}

/**
 * Converte hex Unicode de destino CMap (ex: "0041" ou "00660069" ou "D83DDE00") em string JS
 */
function hexToUnicodeString(hexStr) {
  const clean = String(hexStr || "").replace(/[^0-9a-fA-F]/g, "");
  if (!clean) return "";
  if (clean.length === 2) {
    return decodeByte(parseInt(clean, 16));
  }
  const padded = clean.length % 4 === 0 ? clean : clean.padStart(Math.ceil(clean.length / 4) * 4, "0");
  let out = "";
  for (let i = 0; i + 3 < padded.length; i += 4) {
    out += String.fromCharCode(parseInt(padded.slice(i, i + 4), 16));
  }
  return out;
}

/**
 * Extrai tabela CMap (/ToUnicode) de um stream contendo beginbfchar / beginbfrange
 */
function parseToUnicodeCMap(cmapStream) {
  if (!cmapStream || (!cmapStream.includes("beginbfchar") && !cmapStream.includes("beginbfrange"))) {
    return null;
  }

  const map = new Map();
  let codeBytesLen = 0;

  const codeSpaceMatch = cmapStream.match(/begincodespacerange[\s\S]*?<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>[\s\S]*?endcodespacerange/);
  if (codeSpaceMatch) {
    codeBytesLen = Math.max(1, Math.floor(codeSpaceMatch[1].length / 2));
  }

  const bfCharRegex = /beginbfchar([\s\S]*?)endbfchar/g;
  let m;
  while ((m = bfCharRegex.exec(cmapStream)) !== null) {
    const body = m[1];
    const pairRe = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let pm;
    while ((pm = pairRe.exec(body)) !== null) {
      const srcHex = pm[1].toUpperCase();
      if (!codeBytesLen) codeBytesLen = Math.max(1, Math.floor(srcHex.length / 2));
      const dstStr = hexToUnicodeString(pm[2]);
      if (dstStr) map.set(srcHex, dstStr);
    }
  }

  const bfRangeRegex = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = bfRangeRegex.exec(cmapStream)) !== null) {
    const body = m[1];
    const rangeRe = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([\s\S]*?)\])/g;
    let rm;
    while ((rm = rangeRe.exec(body)) !== null) {
      const startHex = rm[1].toUpperCase();
      const endHex = rm[2].toUpperCase();
      const hexWidth = startHex.length;
      if (!codeBytesLen) codeBytesLen = Math.max(1, Math.floor(hexWidth / 2));
      const startCode = parseInt(startHex, 16);
      const endCode = parseInt(endHex, 16);
      if (isNaN(startCode) || isNaN(endCode) || endCode < startCode || endCode - startCode > 4096) continue;

      if (rm[3] !== undefined) {
        const baseDstHex = rm[3];
        if (baseDstHex.length <= 4) {
          let dstCode = parseInt(baseDstHex, 16);
          for (let c = startCode; c <= endCode; c++, dstCode++) {
            const key = c.toString(16).toUpperCase().padStart(hexWidth, "0");
            map.set(key, String.fromCodePoint(dstCode));
          }
        } else {
          const prefix = hexToUnicodeString(baseDstHex.slice(0, -4));
          let lastCode = parseInt(baseDstHex.slice(-4), 16);
          for (let c = startCode; c <= endCode; c++, lastCode++) {
            const key = c.toString(16).toUpperCase().padStart(hexWidth, "0");
            map.set(key, prefix + String.fromCharCode(lastCode));
          }
        }
      } else if (rm[4] !== undefined) {
        const items = [];
        const itemRe = /<([0-9a-fA-F]+)>/g;
        let im;
        while ((im = itemRe.exec(rm[4])) !== null) {
          items.push(hexToUnicodeString(im[1]));
        }
        for (let idx = 0; idx < items.length && startCode + idx <= endCode; idx++) {
          const key = (startCode + idx).toString(16).toUpperCase().padStart(hexWidth, "0");
          if (items[idx]) map.set(key, items[idx]);
        }
      }
    }
  }

  if (map.size === 0) return null;
  return { map, codeBytesLen: codeBytesLen || 2 };
}

/**
 * Decodifica uma string literal PDF com suporte a escapes, CMap opcional, UTF-16BE, UTF-8 e Windows-1252
 */
function decodePdfLiteralString(rawStr, activeCMap = null) {
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
        if (next === "\r" && i + 1 < rawStr.length && rawStr[i + 1] === "\n") i++;
      } else {
        bytes.push(next.charCodeAt(0));
      }
    } else {
      bytes.push(ch.charCodeAt(0) & 0xff);
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

  if (activeCMap && activeCMap.map && activeCMap.map.size > 0) {
    const step = activeCMap.codeBytesLen === 2 && bytes.length % 2 === 0 ? 2 : 1;
    let cmapOut = "";
    let hits = 0;
    const totalGlyphs = Math.floor(bytes.length / step);
    for (let i = 0; i + step - 1 < bytes.length; i += step) {
      const hexKey = step === 2
        ? ((bytes[i] << 8) | bytes[i + 1]).toString(16).toUpperCase().padStart(4, "0")
        : bytes[i].toString(16).toUpperCase().padStart(2, "0");
      if (activeCMap.map.has(hexKey)) {
        cmapOut += activeCMap.map.get(hexKey);
        hits++;
      } else if (step === 1) {
        cmapOut += decodeByte(bytes[i]);
      }
    }
    if (totalGlyphs > 0 && hits / totalGlyphs >= 0.6) {
      return cmapOut;
    }
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
 * Decodifica uma string hexadecimal PDF (<48656c6c6f> ou CIDFont <00120034> via /ToUnicode CMap)
 */
function decodePdfHexString(hex, activeCMap = null, fallbackCMap = null) {
  const clean = hex.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (!clean) return "";

  const tryDecodeWithCMap = (cmapObj) => {
    if (!cmapObj || !cmapObj.map || cmapObj.map.size === 0) return null;
    const hexStep = cmapObj.codeBytesLen === 1 ? 2 : 4;
    if (clean.length < hexStep) return null;
    let out = "";
    let hits = 0;
    let count = 0;
    for (let i = 0; i < clean.length; i += hexStep) {
      const chunk = clean.slice(i, i + hexStep).padEnd(hexStep, "0");
      count++;
      if (cmapObj.map.has(chunk)) {
        out += cmapObj.map.get(chunk);
        hits++;
      } else if (hexStep === 4 && chunk === "0020") {
        out += " ";
        hits++;
      } else if (hexStep === 2) {
        out += decodeByte(parseInt(chunk, 16));
      }
    }
    if (count > 0 && hits / count >= 0.5) return out;
    return null;
  };

  const fromActive = tryDecodeWithCMap(activeCMap);
  if (fromActive !== null) return fromActive;

  const fromFallback = tryDecodeWithCMap(fallbackCMap);
  if (fromFallback !== null) return fromFallback;

  const bytes = [];
  for (let i = 0; i < clean.length; i += 2) {
    const pair = clean.slice(i, i + 2);
    bytes.push(parseInt(pair.length === 1 ? pair + "0" : pair, 16));
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];
      out += String.fromCharCode(code);
    }
    return out;
  }

  // CIDFont UTF-16BE sem BOM (ex: <00410042> -> "AB")
  if (bytes.length >= 2 && bytes.length % 2 === 0) {
    let zeroHighCount = 0;
    const pairs = bytes.length / 2;
    for (let i = 0; i < bytes.length; i += 2) {
      if (bytes[i] === 0x00 && bytes[i + 1] >= 0x20) zeroHighCount++;
    }
    if (zeroHighCount / pairs >= 0.6) {
      let out = "";
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        const code = (bytes[i] << 8) | bytes[i + 1];
        if (code >= 0x20 || code === 0x09 || code === 0x0a) {
          out += String.fromCharCode(code);
        }
      }
      return out;
    }
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
 * preservando alinhamento de linhas via coordenadas Y (Td / TD / Tm) e fontes (/Tf + CMap).
 */
function parsePdfContentStream(streamText, fontCMaps = new Map(), globalCMap = null) {
  if (!streamText || typeof streamText !== "string") return "";

  if (streamText.length > 25000000) {
    streamText = streamText.slice(0, 25000000);
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
    let activeFontName = null;
    let lastTmY = null;
    let numQueue = [];
    const len = block.length;
    let i = 0;

    const flushLine = () => {
      if (currentLine.trim()) {
        lines.push(currentLine.replace(/[ \t]+/g, " ").trim());
      }
      currentLine = "";
    };

    const ensureSpace = () => {
      if (currentLine && !currentLine.endsWith(" ")) {
        currentLine += " ";
      }
    };

    const getActiveCMap = () => (activeFontName && fontCMaps.get(activeFontName)) || null;

    while (i < len) {
      while (i < len && block.charCodeAt(i) <= 32) i++;
      if (i >= len) break;

      const ch = block[i];

      // 0. Nome PDF (ex: /F1 10 Tf)
      if (ch === "/") {
        i++;
        const nStart = i;
        while (
          i < len &&
          block.charCodeAt(i) > 32 &&
          !"()<>[]{}/%".includes(block[i])
        ) {
          i++;
        }
        const pdfName = block.slice(nStart, i);
        // Avança sobre tamanho da fonte para checar operador Tf
        let look = i;
        while (look < len && block.charCodeAt(look) <= 32) look++;
        const sStart = look;
        if (look < len && ("+-0123456789.".includes(block[look]))) {
          while (look < len && "+-0123456789.".includes(block[look])) look++;
          while (look < len && block.charCodeAt(look) <= 32) look++;
          if (block.startsWith("Tf", look) && (look + 2 >= len || block.charCodeAt(look + 2) <= 32 || "()<>[]{}/".includes(block[look + 2]))) {
            activeFontName = pdfName;
            numQueue = [];
            i = look + 2;
            continue;
          }
        }
        void sStart;
        continue;
      }

      // 0b. Números precedendo operadores Td / TD / Tm
      if (
        (ch >= "0" && ch <= "9") ||
        ((ch === "-" || ch === "+" || ch === ".") && i + 1 < len && ((block[i + 1] >= "0" && block[i + 1] <= "9") || block[i + 1] === "."))
      ) {
        const nStart = i;
        i++;
        while (i < len && ((block[i] >= "0" && block[i] <= "9") || block[i] === ".")) i++;
        const parsedNum = parseFloat(block.slice(nStart, i));
        if (!isNaN(parsedNum)) {
          numQueue.push(parsedNum);
          if (numQueue.length > 8) numQueue.shift();
        }
        continue;
      }

      // 1. Literal string: (...)
      if (ch === "(") {
        numQueue = [];
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

        while (i < len && block.charCodeAt(i) <= 32) i++;

        if (block.startsWith("Tj", i)) {
          currentLine += decodePdfLiteralString(strContent, getActiveCMap());
          i += 2;
        } else if (block[i] === "'" || block[i] === '"') {
          flushLine();
          currentLine += decodePdfLiteralString(strContent, getActiveCMap());
          flushLine();
          i++;
        }
        continue;
      }

      // 2. Hex string: <...> (ignora dicionários <<...>>)
      if (ch === "<") {
        numQueue = [];
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
          currentLine += decodePdfHexString(hexContent, getActiveCMap(), globalCMap);
          i += 2;
        } else if (block[i] === "'" || block[i] === '"') {
          flushLine();
          currentLine += decodePdfHexString(hexContent, getActiveCMap(), globalCMap);
          flushLine();
          i++;
        }
        continue;
      }

      // 3. Array TJ: [...] TJ
      if (ch === "[") {
        numQueue = [];
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
          i = len;
          break;
        }

        const arrayContent = block.slice(arrStart, closeIdx);
        i = closeIdx + 1;

        while (i < len && block.charCodeAt(i) <= 32) i++;

        if (block.startsWith("TJ", i)) {
          i += 2;
          const activeCMap = getActiveCMap();
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
              currentLine += decodePdfLiteralString(itemStr, activeCMap);
            } else if (kc === "<") {
              k++;
              let hEnd = arrayContent.indexOf(">", k);
              if (hEnd === -1) hEnd = aLen;
              const itemHex = arrayContent.slice(k, hEnd);
              currentLine += decodePdfHexString(itemHex, activeCMap, globalCMap);
              k = hEnd + 1;
            } else if ((kc >= "0" && kc <= "9") || kc === "-" || kc === "+") {
              const nStart = k;
              k++;
              while (k < aLen && ((arrayContent[k] >= "0" && arrayContent[k] <= "9") || arrayContent[k] === ".")) k++;
              const num = parseFloat(arrayContent.slice(nStart, k));
              if (!isNaN(num) && num <= -100) {
                ensureSpace();
              }
            } else {
              k++;
            }
          }
        }
        continue;
      }

      // 4. Operadores de linha / posicionamento geométrico
      const isDelimiterAfter2 = i + 2 >= len || block.charCodeAt(i + 2) <= 32 || "()<>[]{}/".includes(block[i + 2]);

      if (block.startsWith("T*", i) && isDelimiterAfter2) {
        flushLine();
        numQueue = [];
        i += 2;
        continue;
      }
      if ((block.startsWith("Td", i) || block.startsWith("TD", i)) && isDelimiterAfter2) {
        const dy = numQueue.length >= 2 ? numQueue[numQueue.length - 1] : null;
        const dx = numQueue.length >= 2 ? numQueue[numQueue.length - 2] : null;
        if (dy === null || Math.abs(dy) > 1.5) {
          flushLine();
          if (lastTmY !== null && dy !== null) lastTmY += dy;
        } else if (dx !== null && dx > 1.5) {
          ensureSpace();
        }
        numQueue = [];
        i += 2;
        continue;
      }
      if (block.startsWith("Tm", i) && isDelimiterAfter2) {
        const newY = numQueue.length >= 6 ? numQueue[numQueue.length - 1] : null;
        if (newY !== null) {
          if (lastTmY !== null && Math.abs(newY - lastTmY) <= 2.0) {
            ensureSpace();
          } else {
            flushLine();
          }
          lastTmY = newY;
        } else {
          flushLine();
        }
        numQueue = [];
        i += 2;
        continue;
      }
      if (block.startsWith("ET", i) && isDelimiterAfter2) {
        flushLine();
        numQueue = [];
        i += 2;
        continue;
      }

      // Outros operadores consomem a fila numérica
      if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z")) {
        while (i < len && ((block[i] >= "a" && block[i] <= "z") || (block[i] >= "A" && block[i] <= "Z") || block[i] === "*")) {
          i++;
        }
        numQueue = [];
        continue;
      }

      i++;
    }

    flushLine();
  };

  const btRegex = /BT\b([\s\S]*?)\bET/g;
  let btMatch;
  let hasBt = false;

  while ((btMatch = btRegex.exec(streamText)) !== null) {
    hasBt = true;
    processBlock(btMatch[1]);
  }

  if (!hasBt) {
    processBlock(streamText);
  }

  return lines.join("\n");
}

/**
 * Localiza e extrai todos os objetos e streams binários contidos no PDF (incluindo /ObjStm)
 */
function extractPdfObjectsAndStreams(pdfBuffer) {
  const decompressedStreams = [];
  const objById = new Map();
  const rawPdfLatin1 = pdfBuffer.toString("latin1");

  // Indexa cabeçalhos de objetos indiretos "N G obj" para resolver referências /ToUnicode
  const objRegex = /(?:^|[\r\n\s])(\d+)\s+\d+\s+obj\b/g;
  const objOffsets = [];
  let om;
  while ((om = objRegex.exec(rawPdfLatin1)) !== null) {
    objOffsets.push({ id: Number(om[1]), start: om.index });
  }

  const streamToken = Buffer.from("stream");
  const endStreamToken = Buffer.from("endstream");

  let offset = 0;
  while (offset < pdfBuffer.length) {
    const streamPos = pdfBuffer.indexOf(streamToken, offset);
    if (streamPos === -1) break;

    // Evita falso positivo dentro da palavra "endstream"
    if (streamPos >= 3 && pdfBuffer.subarray(streamPos - 3, streamPos).toString("latin1") === "end") {
      offset = streamPos + streamToken.length;
      continue;
    }

    // Descobre qual objeto indireto contém este stream e lê seu dicionário << ... >>
    let ownerId = null;
    let dictHeader = "";
    const dictSearchStart = Math.max(0, streamPos - 1024);
    const headerSlice = rawPdfLatin1.slice(dictSearchStart, streamPos);
    const lastObjInSlice = [...headerSlice.matchAll(/(\d+)\s+\d+\s+obj\b/g)].pop();
    if (lastObjInSlice) {
      ownerId = Number(lastObjInSlice[1]);
      dictHeader = headerSlice.slice(lastObjInSlice.index);
    } else {
      dictHeader = headerSlice;
    }

    let dataStart = streamPos + streamToken.length;
    if (pdfBuffer[dataStart] === 0x0d && pdfBuffer[dataStart + 1] === 0x0a) {
      dataStart += 2;
    } else if (pdfBuffer[dataStart] === 0x0a || pdfBuffer[dataStart] === 0x0d) {
      dataStart += 1;
    }

    const endPos = pdfBuffer.indexOf(endStreamToken, dataStart);
    if (endPos === -1) break;

    let dataEnd = endPos;
    if (dataEnd > dataStart && pdfBuffer[dataEnd - 1] === 0x0a) dataEnd--;
    if (dataEnd > dataStart && pdfBuffer[dataEnd - 1] === 0x0d) dataEnd--;

    const streamData = pdfBuffer.subarray(dataStart, dataEnd);

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
          decomp = streamData;
        }
      }
    }

    if (decomp && decomp.length > 0) {
      const contentStr = decomp.toString("latin1");
      decompressedStreams.push({ ownerId, dictHeader, contentStr });
      if (ownerId !== null) {
        objById.set(ownerId, { dict: dictHeader, stream: contentStr });
      }

      // Desempacota PDF 1.5+ Object Streams (/Type /ObjStm) para capturar dicionários de Fontes/Páginas
      if (/\/Type\s*\/ObjStm\b/.test(dictHeader)) {
        const nMatch = dictHeader.match(/\/N\s+(\d+)/);
        const firstMatch = dictHeader.match(/\/First\s+(\d+)/);
        if (nMatch && firstMatch) {
          const nObjs = parseInt(nMatch[1], 10);
          const firstOffset = parseInt(firstMatch[1], 10);
          if (nObjs > 0 && nObjs <= 5000 && firstOffset > 0 && firstOffset < contentStr.length) {
            const indexPart = contentStr.slice(0, firstOffset).trim().split(/\s+/);
            const bodyPart = contentStr.slice(firstOffset);
            const pairs = [];
            for (let p = 0; p + 1 < indexPart.length && pairs.length < nObjs; p += 2) {
              const oid = parseInt(indexPart[p], 10);
              const relOff = parseInt(indexPart[p + 1], 10);
              if (!isNaN(oid) && !isNaN(relOff)) pairs.push({ oid, relOff });
            }
            for (let idx = 0; idx < pairs.length; idx++) {
              const startOff = pairs[idx].relOff;
              const endOff = idx + 1 < pairs.length ? pairs[idx + 1].relOff : bodyPart.length;
              if (startOff >= 0 && startOff < bodyPart.length && endOff > startOff) {
                const subDict = bodyPart.slice(startOff, endOff);
                if (!objById.has(pairs[idx].oid)) {
                  objById.set(pairs[idx].oid, { dict: subDict, stream: "" });
                }
              }
            }
          }
        }
      }
    }

    offset = endPos + endStreamToken.length;
  }

  // Registra também objetos sem stream (dicionários de Fontes e Resources)
  for (let idx = 0; idx < objOffsets.length; idx++) {
    const cur = objOffsets[idx];
    if (objById.has(cur.id)) continue;
    const nextStart = idx + 1 < objOffsets.length ? objOffsets[idx + 1].start : Math.min(rawPdfLatin1.length, cur.start + 4096);
    const slice = rawPdfLatin1.slice(cur.start, Math.min(nextStart, cur.start + 8192));
    objById.set(cur.id, { dict: slice, stream: "" });
  }

  return { decompressedStreams, objById };
}

/**
 * Constrói o mapa de CMaps /ToUnicode por nome de fonte (/F1, /C2_0, etc.) e CMap global consolidado
 */
function buildFontCMapRegistry(decompressedStreams, objById) {
  const cmapByObjId = new Map();
  const mergedMap = new Map();
  let mergedBytesLen = 2;

  for (const s of decompressedStreams) {
    const parsedCMap = parseToUnicodeCMap(s.contentStr);
    if (parsedCMap) {
      if (s.ownerId !== null) {
        cmapByObjId.set(s.ownerId, parsedCMap);
      }
      mergedBytesLen = parsedCMap.codeBytesLen;
      for (const [k, v] of parsedCMap.map.entries()) {
        if (!mergedMap.has(k)) mergedMap.set(k, v);
      }
    }
  }

  // Vincula objeto de Fonte (que possui /ToUnicode X 0 R) -> CMap
  const fontObjToCMap = new Map();
  for (const [oid, objData] of objById.entries()) {
    const tuMatch = objData.dict.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
    if (tuMatch) {
      const cmapObjId = Number(tuMatch[1]);
      if (cmapByObjId.has(cmapObjId)) {
        fontObjToCMap.set(oid, cmapByObjId.get(cmapObjId));
      }
    }
  }

  // Vincula nome de recurso da fonte (/F1 X 0 R) -> CMap
  const fontCMaps = new Map();
  for (const [, objData] of objById.entries()) {
    if (!objData.dict.includes("/Font")) continue;
    const refRe = /\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+\d+\s+R/g;
    let rm;
    while ((rm = refRe.exec(objData.dict)) !== null) {
      const fontResName = rm[1];
      const targetOid = Number(rm[2]);
      if (fontObjToCMap.has(targetOid)) {
        fontCMaps.set(fontResName, fontObjToCMap.get(targetOid));
      }
    }
  }

  const globalCMap = mergedMap.size > 0 ? { map: mergedMap, codeBytesLen: mergedBytesLen } : null;
  return { fontCMaps, globalCMap };
}

/**
 * Extrai todo o texto legível de TODAS as páginas de um Buffer ou string de arquivo PDF.
 *
 * @param {Buffer|Uint8Array|string} input - Conteúdo binário ou base64 do PDF
 * @returns {string} Texto completo extraído e normalizado de todas as páginas
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
  const { decompressedStreams, objById } = extractPdfObjectsAndStreams(buf);
  const { fontCMaps, globalCMap } = buildFontCMapRegistry(decompressedStreams, objById);

  // 1. Extração completa de todos os streams de todas as páginas (ignora streams que são apenas CMaps/FontFiles)
  for (const s of decompressedStreams) {
    if (
      s.contentStr.includes("begincmap") ||
      /\/Subtype\s*\/(?:Image|Type1C|CIDFontType0C|OpenType)\b/.test(s.dictHeader) ||
      /\/Type\s*\/(?:XRef|ObjStm|Metadata)\b/.test(s.dictHeader)
    ) {
      continue;
    }
    const parsedText = parsePdfContentStream(s.contentStr, fontCMaps, globalCMap);
    if (parsedText && parsedText.trim()) {
      textSections.push(parsedText.trim());
    }
  }

  // 2. Fallback para textos fora de streams comprimidos
  const rawText = buf.toString("latin1");
  if (textSections.length === 0) {
    if (rawText.includes("Tj") || rawText.includes("TJ") || rawText.includes("T*")) {
      const rawParsed = parsePdfContentStream(rawText, fontCMaps, globalCMap);
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

  return textSections
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

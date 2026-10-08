import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Diretório Seguro para armazenamento das FNRHs
export const SECURE_FNRH_DIR = path.join(__dirname, "secure_uploads", "fnrh_documents");
export const LEGACY_FNRH_DIR = path.join(__dirname, "uploads", "fnrh_documents");

for (const dir of [SECURE_FNRH_DIR, LEGACY_FNRH_DIR]) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.error("[FNRH PDF] Erro ao criar diretório de FNRH:", err);
    }
  }
}

/**
 * Formata data ISO para Horário de Brasília legível
 */
export function formatToBrasiliaDateTime(isoDateString) {
  try {
    const d = isoDateString ? new Date(isoDateString) : new Date();
    return d.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }) + " (Horário de Brasília)";
  } catch {
    return new Date().toISOString();
  }
}

export const FNRH_HMAC_SECRET = process.env.SESSION_SECRET || "corpflats-fnrh-hmac-secret-2026";

export function generateSignedFnrhToken(documentUuid, expiresInMinutes = 60 * 24 * 30) {
  const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;
  const payload = `${documentUuid}:${expiresAt}`;
  const hmac = crypto.createHmac("sha256", FNRH_HMAC_SECRET).update(payload).digest("hex");
  return `${expiresAt}.${hmac}`;
}

export function verifySignedFnrhToken(documentUuid, token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  const [expiresAtStr, hmac] = token.split(".");
  const expiresAt = Number(expiresAtStr);
  if (isNaN(expiresAt) || Date.now() > expiresAt) return false;
  const payload = `${documentUuid}:${expiresAt}`;
  const expectedHmac = crypto.createHmac("sha256", FNRH_HMAC_SECRET).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(expectedHmac, "hex"));
  } catch {
    return hmac === expectedHmac;
  }
}

/**
 * Compila a Ficha Nacional de Registro de Hóspedes (FNRH) com Trilha Forense
 */
export async function generateFnrhPdf({
  reservation = {},
  guestData,
  guest,
  signatureBase64,
  signatureDataUrl,
  signerIp,
  ipAddress,
  signerUserAgent,
  userAgent,
  appOrigin,
  geolocation,
  clientTimezone,
  optInMarketing,
  whatsapp2faVerified,
  whatsappPhone,
  whatsappOtpVerifiedAt,
  baseUrl = "https://corpflats.onrender.com"
}) {
  const g = guestData || guest || {};
  const sig = signatureBase64 || signatureDataUrl || null;
  const ip = signerIp || ipAddress || "127.0.0.1";
  const ua = signerUserAgent || userAgent || "Navegador Web / Dispositivo Pessoal";
  const origin = appOrigin || baseUrl || "https://corpflats.onrender.com";

  const documentUuid = crypto.randomUUID();
  const signedAtIso = new Date().toISOString();
  const signedAtBrasilia = formatToBrasiliaDateTime(signedAtIso);

  const cleanCpf = (g.document || g.cpf || reservation.guestDocument || "00000000000").replace(/\D/g, "");
  const reservationId = reservation.id || reservation.code || "res";
  const timestamp = Date.now();
  const fileName = "fnrh_" + reservationId + "_" + cleanCpf + "_" + timestamp + ".pdf";
  const filePath = path.join(SECURE_FNRH_DIR, fileName);

  const verifyUrl = origin.replace(/\/$/, "") + "/verificar-ficha/" + documentUuid;

  // Gera o QR Code em buffer de alta resolução
  const qrCodeBuffer = await QRCode.toBuffer(verifyUrl, {
    width: 140,
    margin: 1,
    color: {
      dark: "#0f172a",
      light: "#ffffff"
    }
  });

  // Converte assinatura Base64 para Buffer
  let signatureBuffer = null;
  if (sig && typeof sig === "string" && sig.includes("base64,")) {
    try {
      const b64Data = sig.split("base64,")[1];
      signatureBuffer = Buffer.from(b64Data, "base64");
    } catch (sigErr) {
      console.warn("[FNRH PDF] Falha ao decodificar assinatura base64:", sigErr.message);
    }
  }

  // Criação do Documento PDFKit
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 26, bottom: 26, left: 32, right: 32 },
    info: {
      Title: "Ficha de Hospedagem - " + (g.fullName || g.name || "Hóspede"),
      Author: "CORP FLATS HOSPEDAGEM LTDA",
      Subject: "Ficha de Hospedagem (Check-in Digital) e Trilha de Auditoria Forense",
      Keywords: "Ficha de Hospedagem, Check-in Digital, Assinatura Eletrônica, CorpFlats, Cadastur",
      CreationDate: new Date()
    }
  });

  if (!fs.existsSync(SECURE_FNRH_DIR)) {
    try {
      fs.mkdirSync(SECURE_FNRH_DIR, { recursive: true });
    } catch {}
  }

  const writeStream = fs.createWriteStream(filePath);
  doc.pipe(writeStream);

  const boxWidth = 531;
  const leftX = 32;

  // 1. CABEÇALHO OFICIAL CORPFLATS & MINISTÉRIO DO TURISMO (CADASTUR)
  const topY = 26;

  // Barra decorativa superior
  doc.rect(leftX, topY, boxWidth, 3).fill("#0284c7");

  // Logo Badge Box
  doc.roundedRect(leftX, topY + 8, 44, 44, 6).fill("#0f172a");
  doc.fillColor("#ffffff").fontSize(18).font("Helvetica-Bold").text("CF", leftX + 9, topY + 20);

  // Identificação Empresarial e Cadastur
  doc.fillColor("#0f172a").fontSize(13).font("Helvetica-Bold").text("CORP FLATS HOSPEDAGEM LTDA", leftX + 52, topY + 8);
  doc.fontSize(7.5).font("Helvetica").fillColor("#334155");
  doc.text("CNPJ: 47.964.813/0001-65  |  Cadastur: 19.034.812/0001-90  |  Edifício Soho Residence Service", leftX + 52, topY + 23);
  doc.text("Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ, CEP 28010-140", leftX + 52, topY + 33);
  doc.text("Tel/WhatsApp: (22) 99712-4021  |  E-mail: reservas@corpflats.com.br", leftX + 52, topY + 43);

  // Título do Documento Oficial à Direita
  const badgeRightX = leftX + 355;
  doc.roundedRect(badgeRightX, topY + 7, 176, 46, 5).fill("#f1f5f9").stroke("#cbd5e1");
  doc.fillColor("#0284c7").fontSize(7).font("Helvetica-Bold").text("CHECK-IN DIGITAL REGISTRADO", badgeRightX + 8, topY + 12);
  doc.fillColor("#0f172a").fontSize(9.5).font("Helvetica-Bold").text("Ficha de Hospedagem", badgeRightX + 8, topY + 22);
  doc.fillColor("#64748b").fontSize(6.5).font("Helvetica").text("Check-in Digital • CorpFlats", badgeRightX + 8, topY + 34);
  doc.fillColor("#0369a1").fontSize(7).font("Helvetica-Bold").text("Reserva: " + (reservation.code || reservationId), badgeRightX + 8, topY + 43);

  let currentY = topY + 58;

  // 2. SEÇÃO 1: DADOS DA HOSPEDAGEM
  doc.rect(leftX, currentY, boxWidth, 14).fill("#0f172a");
  doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold").text("1. DADOS DA HOSPEDAGEM", leftX + 6, currentY + 3.5);

  currentY += 14;
  doc.rect(leftX, currentY, boxWidth, 38).fill("#f8fafc").stroke("#e2e8f0");

  const c1 = leftX + 8;
  const c2 = leftX + 135;
  const c3 = leftX + 265;
  const c4 = leftX + 395;

  // Linha 1
  doc.fillColor("#64748b").fontSize(7).font("Helvetica").text("Acomodação (Flat):", c1, currentY + 5);
  doc.fillColor("#0f172a").fontSize(9).font("Helvetica-Bold").text("Flat " + (reservation.flatNumber || reservation.flatId || "Standard"), c1, currentY + 14);

  doc.fillColor("#64748b").fontSize(7).font("Helvetica").text("Entrada (Check-in):", c2, currentY + 5);
  doc.fillColor("#0f172a").fontSize(8).font("Helvetica-Bold").text((reservation.checkinDate || "-") + " às " + (reservation.checkinTime || "14:00"), c2, currentY + 14);

  doc.fillColor("#64748b").fontSize(7).font("Helvetica").text("Saída Prevista (Check-out):", c3, currentY + 5);
  doc.fillColor("#0f172a").fontSize(8).font("Helvetica-Bold").text((reservation.checkoutDate || "-") + " às " + (reservation.checkoutTime || "12:00"), c3, currentY + 14);

  doc.fillColor("#64748b").fontSize(7).font("Helvetica").text("Hóspedes na Unidade:", c4, currentY + 5);
  doc.fillColor("#0f172a").fontSize(8).font("Helvetica-Bold").text((reservation.guestCount || reservation.adults || 1) + " pessoa(s)", c4, currentY + 14);

  // Linha 2
  const vehicleObj = g.vehicle || reservation.vehicle;
  const vehicleText = vehicleObj && vehicleObj.plate 
    ? vehicleObj.plate + "  -  " + [vehicleObj.brand, vehicleObj.model, vehicleObj.color].filter(Boolean).join(" / ")
    : "Não informado / Sem veículo";

  doc.fillColor("#64748b").fontSize(7).font("Helvetica").text("Veículo Registrado / Vaga de Garagem:", c1, currentY + 25);
  doc.fillColor("#334155").fontSize(7.5).font("Helvetica").text(vehicleText, c1 + 145, currentY + 25);

  currentY += 44;

  // 3. SEÇÃO 2: DADOS CADASTRAIS DO HÓSPEDE
  doc.rect(leftX, currentY, boxWidth, 14).fill("#0f172a");
  doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold").text("2. DADOS CADASTRAIS DO HÓSPEDE", leftX + 6, currentY + 3.5);

  currentY += 14;
  doc.rect(leftX, currentY, boxWidth, 54).fill("#f8fafc").stroke("#e2e8f0");

  const guestFullName = (g.fullName || g.name || reservation.guestName || "Hóspede").trim();
  const guestDoc = g.document || g.cpf || reservation.guestDocument || "-";
  const guestPhone = g.phone || reservation.guestPhone || "-";
  const guestEmail = g.email || reservation.guestEmail || "-";
  let guestBirth = g.birthDate || "-";
  if (guestBirth && typeof guestBirth === "string" && guestBirth.includes("-")) {
    const bp = guestBirth.substring(0, 10).split("-");
    if (bp.length === 3 && bp[0].length === 4) {
      guestBirth = `${bp[2]}/${bp[1]}/${bp[0]}`;
    }
  }
  const guestGender = g.gender ? (g.gender === "feminino" ? "Feminino" : (g.gender === "masculino" ? "Masculino" : (g.gender === "outro" ? "Outro" : g.gender))) : "Não informado";
  const guestCep = g.cep || reservation.guestCep || "";
  const guestAddress = [
    g.address || reservation.guestAddress || "",
    guestCep ? ("CEP: " + guestCep) : "",
    g.city || reservation.guestCity || "",
    g.state || reservation.guestState || "",
    g.country || "Brasil"
  ].filter(Boolean).join(" - ") || "Endereço não informado";

  // Linha 1
  doc.fillColor("#64748b").fontSize(7).font("Helvetica").text("Nome Completo:", c1, currentY + 5);
  doc.fillColor("#0f172a").fontSize(9).font("Helvetica-Bold").text(guestFullName, c1, currentY + 14);

  doc.fillColor("#64748b").fontSize(7).font("Helvetica").text("CPF / Passaporte / Doc:", c3, currentY + 5);
  doc.fillColor("#0f172a").fontSize(8.5).font("Helvetica-Bold").text(guestDoc, c3, currentY + 14);

  doc.fillColor("#64748b").fontSize(7).font("Helvetica").text("Nascimento / Gênero:", c4, currentY + 5);
  doc.fillColor("#0f172a").fontSize(8).font("Helvetica-Bold").text(guestBirth + " (" + guestGender + ")", c4, currentY + 14);

  // Linha 2
  doc.fillColor("#64748b").fontSize(7).font("Helvetica").text("Telefone / WhatsApp:", c1, currentY + 25);
  doc.fillColor("#0f172a").fontSize(8).font("Helvetica").text(guestPhone, c1, currentY + 34);

  doc.fillColor("#64748b").fontSize(7).font("Helvetica").text("E-mail:", c3, currentY + 25);
  doc.fillColor("#0f172a").fontSize(8).font("Helvetica").text(guestEmail, c3, currentY + 34);

  // Linha 3
  doc.fillColor("#64748b").fontSize(7).font("Helvetica").text("Endereço Residencial:", c1, currentY + 44);
  doc.fillColor("#334155").fontSize(7.5).font("Helvetica").text(guestAddress, c1 + 92, currentY + 44);

  currentY += 60;

  // 4. SEÇÃO 3: INFORMAÇÕES DA ESTADIA ATUAL (OBRIGATÓRIO MINISTÉRIO DO TURISMO)
  doc.rect(leftX, currentY, boxWidth, 14).fill("#0f172a");
  doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold").text("3. INFORMAÇÕES DA ESTADIA ATUAL (EXIGÊNCIA LEGAL MTUR - LEI 11.771/2008)", leftX + 6, currentY + 3.5);

  currentY += 14;
  doc.rect(leftX, currentY, boxWidth, 42).fill("#f8fafc").stroke("#e2e8f0");

  const travelReasonStr = g.travelReason || "Lazer / Férias";
  const transportMethodStr = g.transportMethod || "Carro próprio";
  const originStr = [g.originCity || "Não informada", g.originState || "", g.originCountry || "Brasil"].filter(Boolean).join(" / ");
  const destinationStr = [g.destinationCity || "Não informado", g.destinationState || "", g.destinationCountry || "Brasil"].filter(Boolean).join(" / ");

  // Linha 1
  doc.fillColor("#64748b").fontSize(7).font("Helvetica").text("Motivo Principal da Viagem:", c1, currentY + 5);
  doc.fillColor("#0284c7").fontSize(8).font("Helvetica-Bold").text(travelReasonStr, c1, currentY + 14);

  doc.fillColor("#64748b").fontSize(7).font("Helvetica").text("Meio de Transporte Utilizado:", c3, currentY + 5);
  doc.fillColor("#0284c7").fontSize(8).font("Helvetica-Bold").text(transportMethodStr, c3, currentY + 14);

  // Linha 2
  doc.fillColor("#64748b").fontSize(7).font("Helvetica").text("Última Procedência (Origem):", c1, currentY + 24);
  doc.fillColor("#0f172a").fontSize(8).font("Helvetica").text(originStr, c1, currentY + 32);

  doc.fillColor("#64748b").fontSize(7).font("Helvetica").text("Próximo Destino:", c3, currentY + 24);
  doc.fillColor("#0f172a").fontSize(8).font("Helvetica").text(destinationStr, c3, currentY + 32);

  currentY += 48;

  // 5. TERMOS LEGAIS E LGPD (LEI 13.709/2018)
  doc.roundedRect(leftX, currentY, boxWidth, 36, 4).fill("#f8fafc").stroke("#cbd5e1");

  // Checkbox 1 (Obrigatório)
  doc.rect(leftX + 8, currentY + 6, 10, 10).fill("#0284c7");
  doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold").text("✓", leftX + 9.5, currentY + 7);
  doc.fillColor("#0f172a").fontSize(7.5).font("Helvetica-Bold").text(
    "Declaro que as informações prestadas são verdadeiras e estou ciente do tratamento dos meus dados para fins de",
    leftX + 24,
    currentY + 6
  );
  doc.text(
    "cumprimento legal e execução da hospedagem (Art. 7º, II e V da LGPD).",
    leftX + 24,
    currentY + 15
  );

  // Checkbox 2 (Opt-in Marketing)
  const isMarketingAccepted = Boolean(optInMarketing || g.optInMarketing);
  doc.rect(leftX + 8, currentY + 24, 10, 10).stroke("#94a3b8");
  if (isMarketingAccepted) {
    doc.fillColor("#0284c7").rect(leftX + 8, currentY + 24, 10, 10).fill();
    doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold").text("✓", leftX + 9.5, currentY + 25);
  }
  doc.fillColor("#475569").fontSize(7).font("Helvetica").text(
    isMarketingAccepted 
      ? "Opt-in Autorizado: Aceito receber novidades, benefícios e comunicações sobre futuras estadias via WhatsApp ou E-mail."
      : "Comunicações de Marketing: Não optou por receber novidades ou benefícios promocionais adicionais.",
    leftX + 24,
    currentY + 25
  );

  currentY += 42;

  // 6. SEÇÃO 4: ASSINATURA ELETRÔNICA DO HÓSPEDE
  doc.rect(leftX, currentY, boxWidth, 14).fill("#0f172a");
  doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold").text("4. ASSINATURA ELETRÔNICA AVANÇADA DO HÓSPEDE", leftX + 6, currentY + 3.5);

  currentY += 14;
  doc.rect(leftX, currentY, boxWidth, 70).fill("#ffffff").stroke("#cbd5e1");

  if (signatureBuffer) {
    try {
      doc.image(signatureBuffer, leftX + 175, currentY + 4, {
        fit: [180, 42],
        align: "center",
        valign: "center"
      });
    } catch (imgErr) {
      console.warn("[FNRH PDF] Não foi possível desenhar a assinatura:", imgErr);
      doc.fillColor("#94a3b8").fontSize(9).font("Helvetica-Oblique").text("[Assinatura Eletrônica Registrada]", leftX + 185, currentY + 20);
    }
  } else {
    doc.fillColor("#94a3b8").fontSize(9).font("Helvetica-Oblique").text("[Assinatura Eletrônica Registrada]", leftX + 185, currentY + 20);
  }

  // Linha da assinatura
  doc.moveTo(leftX + 130, currentY + 50).lineTo(leftX + 400, currentY + 50).stroke("#94a3b8");
  doc.fillColor("#0f172a").fontSize(8.5).font("Helvetica-Bold").text(guestFullName, leftX, currentY + 52, { width: boxWidth, align: "center" });
  doc.fillColor("#0284c7").fontSize(7).font("Helvetica").text("Assinado eletronicamente em " + signedAtBrasilia, leftX, currentY + 61, { width: boxWidth, align: "center" });

  currentY += 76;

  // 7. CERTIFICADO DE CONFORMIDADE E TRILHA FORENSE (AUDIT TRAIL)
  doc.rect(leftX, currentY, boxWidth, 14).fill("#0284c7");
  doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold").text("5. CERTIFICADO DE CONFORMIDADE JURÍDICA E TRILHA FORENSE DE AUDITORIA", leftX + 6, currentY + 3.5);

  currentY += 14;
  const auditBoxHeight = 158;
  doc.roundedRect(leftX, currentY, boxWidth, auditBoxHeight, 4).fill("#f8fafc").stroke("#0284c7");

  // QR Code no canto direito
  doc.image(qrCodeBuffer, leftX + 420, currentY + 10, { width: 100, height: 100 });
  doc.fillColor("#0284c7").fontSize(6.5).font("Helvetica-Bold").text("Autenticidade Oficial", leftX + 420, currentY + 112, { width: 100, align: "center" });
  doc.fillColor("#64748b").fontSize(6).font("Helvetica").text("Aponte a câmera para verificar", leftX + 420, currentY + 120, { width: 100, align: "center" });

  // Metadados Forenses à Esquerda
  const aX = leftX + 8;
  let aY = currentY + 8;

  doc.fillColor("#0f172a").fontSize(7.5).font("Helvetica-Bold").text("Identificador Único do Documento (UUID v4):", aX, aY);
  doc.fillColor("#0369a1").fontSize(7.5).font("Courier-Bold").text(documentUuid, aX + 185, aY);

  aY += 13;
  doc.fillColor("#0f172a").fontSize(7.5).font("Helvetica-Bold").text("Data / Hora UTC (ISO 8601):", aX, aY);
  doc.fillColor("#334155").fontSize(7.5).font("Courier").text(signedAtIso, aX + 130, aY);

  aY += 13;
  doc.fillColor("#0f172a").fontSize(7.5).font("Helvetica-Bold").text("Horário Oficial de Brasília:", aX, aY);
  doc.fillColor("#334155").fontSize(7.5).font("Helvetica").text(signedAtBrasilia, aX + 115, aY);

  aY += 13;
  doc.fillColor("#0f172a").fontSize(7.5).font("Helvetica-Bold").text("Endereço IP do Signatário:", aX, aY);
  doc.fillColor("#334155").fontSize(7.5).font("Courier").text(ip, aX + 120, aY);

  aY += 13;
  // Geolocalização
  let geoText = "Não compartilhada pelo titular";
  if (geolocation && (geolocation.latitude || geolocation.status === "granted")) {
    geoText = "Lat: " + (geolocation.latitude?.toFixed(6) || "-") + ", Long: " + (geolocation.longitude?.toFixed(6) || "-") + " (Precisão: ~" + Math.round(geolocation.accuracy || 0) + "m)";
  } else if (geolocation && geolocation.status === "denied") {
    geoText = "Acesso recusado pelo usuário no navegador";
  }
  doc.fillColor("#0f172a").fontSize(7.5).font("Helvetica-Bold").text("Geolocalização Aproximada:", aX, aY);
  doc.fillColor("#334155").fontSize(7).font("Courier").text(geoText, aX + 125, aY);

  aY += 13;
  doc.fillColor("#0f172a").fontSize(7.5).font("Helvetica-Bold").text("User-Agent / Navegador:", aX, aY);
  const cleanUa = ua.substring(0, 85);
  doc.fillColor("#475569").fontSize(6.5).font("Courier").text(cleanUa, aX + 115, aY, { width: 295 });

  if (whatsapp2faVerified) {
    aY += 13;
    doc.fillColor("#0f172a").fontSize(7.5).font("Helvetica-Bold").text("Autenticação de Posse WhatsApp (2FA):", aX, aY);
    const wPhone = whatsappPhone || guestPhone || "";
    const masked = wPhone ? `Validado com sucesso via Z-API (${wPhone.slice(-4) ? '•••-' + wPhone.slice(-4) : wPhone})` : "Posse Comprovada via Token WhatsApp Z-API";
    doc.fillColor("#047857").fontSize(7.5).font("Helvetica-Bold").text(masked, aX + 165, aY);
  }

  aY += 16;
  // Disposição Jurídica Legal
  doc.roundedRect(aX, aY, 405, 24, 3).fill("#e0f2fe");
  doc.fillColor("#0369a1").fontSize(7).font("Helvetica-Bold").text("Disposição Legal de Validade Jurídica:", aX + 6, aY + 4);
  doc.fillColor("#0c4a6e").fontSize(6.5).font("Helvetica").text(
    '"Documento assinado eletronicamente nos termos do art. 10, § 2º da Medida Provisória nº 2.200-2/2001 e da Lei Federal nº 14.063/2020."',
    aX + 6,
    aY + 13,
    { width: 395 }
  );

  aY += 29;
  // Hash Criptográfico Canônico
  const canonicalSignaturePayload = JSON.stringify({
    documentUuid,
    reservationCode: reservation.code || reservationId,
    guestCpf: cleanCpf,
    guestName: guestFullName,
    travelReason: travelReasonStr,
    transportMethod: transportMethodStr,
    signedAt: signedAtIso,
    signerIp: ip,
    signerUserAgent: ua,
    whatsapp2faVerified: Boolean(whatsapp2faVerified)
  });
  const canonicalHash = crypto.createHash("sha256").update(canonicalSignaturePayload).digest("hex");

  doc.fillColor("#0f172a").fontSize(7).font("Helvetica-Bold").text("Hash Criptográfico de Integridade (SHA-256):", aX, aY);
  doc.fillColor("#047857").fontSize(7).font("Courier-Bold").text(canonicalHash, aX, aY + 9, { width: 405 });
  doc.fillColor("#64748b").fontSize(6).font("Helvetica").text(
    "O Hash SHA-256 garante matematicamente a integridade e o não-repúdio deste documento desde o instante da assinatura.",
    aX,
    aY + 19
  );

  // Rodapé da Página
  doc.fillColor("#94a3b8").fontSize(6.5).font("Helvetica").text(
    "CORP FLATS HOSPEDAGEM LTDA  •  CNPJ 47.964.813/0001-65  •  Cadastur 19.034.812/0001-90  •  Ficha ID: " + documentUuid + "  •  Página 1/1",
    leftX,
    814,
    { width: boxWidth, align: "center" }
  );

  doc.end();

  // Aguarda término da gravação do PDF no disco
  await new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });

  // Calcula o Hash SHA-256 do arquivo final gerado em disco
  const fileBuffer = fs.readFileSync(filePath);
  const finalFileSha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");

  // URLs seguras de visualização e download com token assinado
  const downloadToken = generateSignedFnrhToken(documentUuid, 60 * 24 * 30);
  const viewUrl = `/api/pms/fnrh/${documentUuid}/view?token=${downloadToken}`;
  const downloadUrl = `/api/pms/fnrh/${documentUuid}/download?token=${downloadToken}`;

  // Upload resiliente para Cloudflare R2 (preserva arquivo após reinício do servidor Render)
  let r2Url = null;
  try {
    const { uploadImageToStorage } = await import("./storage-service.mjs");
    const rPrefix = `fnrh_${(reservation.code || reservationId).toString().replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    r2Url = await uploadImageToStorage(fileBuffer, rPrefix, null, "fnrh_documents");
  } catch (r2Err) {
    console.warn("[FNRH PDF] Falha ao fazer upload R2 (usando disco local):", r2Err.message);
  }

  return {
    filePath,
    fileName,
    fileUrl: viewUrl,
    downloadUrl,
    r2Url,
    token: downloadToken,
    documentUuid,
    sha256Hash: finalFileSha256,
    canonicalHash,
    signedAt: signedAtIso,
    signedAtBrasilia,
    verifyUrl,
    auditTrail: {
      documentUuid,
      reservationId: reservation.id || reservationId,
      reservationCode: reservation.code || reservationId,
      guestName: guestFullName,
      guestCpf: cleanCpf,
      guestPhone,
      guestEmail,
      guestAddress,
      travelReason: travelReasonStr,
      transportMethod: transportMethodStr,
      originCity: g.originCity || "",
      originState: g.originState || "",
      originCountry: g.originCountry || "Brasil",
      destinationCity: g.destinationCity || "",
      destinationState: g.destinationState || "",
      destinationCountry: g.destinationCountry || "Brasil",
      optInMarketing: isMarketingAccepted,
      signerIp: ip,
      signerUserAgent: ua,
      geolocation: geolocation || null,
      whatsapp2faVerified: Boolean(whatsapp2faVerified),
      whatsappPhone: whatsappPhone || null,
      whatsappOtpVerifiedAt: whatsappOtpVerifiedAt || null,
      signedAt: signedAtIso,
      signedAtBrasilia,
      sha256Hash: finalFileSha256,
      canonicalHash,
      verifyUrl,
      fileName,
      fileUrl: viewUrl,
      downloadUrl,
      r2Url,
      token: downloadToken
    }
  };
}

/**
 * Recompila dinamicamente a Ficha de Hospedagem sob demanda (on-the-fly)
 * caso o arquivo físico em disco do Render tenha sido perdido após reinício do container.
 */
export async function rebuildFnrhPdfOnTheFly({
  reservation = {},
  guest = null,
  guestData = null,
  auditTrail = null,
  appOrigin = "https://corpflats.onrender.com",
  db = null
}) {
  const targetGuest = guestData || guest || (Array.isArray(reservation.guests) ? reservation.guests[0] : null) || {};
  const sig = targetGuest.signatureUrl || reservation.signatureUrl || auditTrail?.signatureUrl || null;

  return await generateFnrhPdf({
    reservation,
    guestData: {
      fullName: targetGuest.fullName || targetGuest.name || reservation.guestName || auditTrail?.guestName || "Hóspede",
      document: targetGuest.document || targetGuest.cpf || reservation.guestDocument || auditTrail?.guestCpf || "",
      phone: targetGuest.phone || reservation.guestPhone || auditTrail?.guestPhone || "",
      email: targetGuest.email || reservation.guestEmail || auditTrail?.guestEmail || "",
      birthDate: targetGuest.birthDate || auditTrail?.birthDate || "",
      gender: targetGuest.gender || auditTrail?.gender || "Não informado",
      cep: targetGuest.cep || reservation.guestCep || "",
      address: targetGuest.address || reservation.guestAddress || auditTrail?.guestAddress || "",
      city: targetGuest.city || reservation.guestCity || auditTrail?.originCity || "",
      state: targetGuest.state || reservation.guestState || auditTrail?.originState || "RJ",
      country: targetGuest.country || reservation.guestCountry || "Brasil",
      travelReason: targetGuest.travelReason || auditTrail?.travelReason || "Lazer / Férias",
      transportMethod: targetGuest.transportMethod || auditTrail?.transportMethod || "Carro próprio",
      originCity: targetGuest.originCity || auditTrail?.originCity || "",
      originState: targetGuest.originState || auditTrail?.originState || "",
      destinationCity: targetGuest.destinationCity || auditTrail?.destinationCity || "",
      destinationState: targetGuest.destinationState || auditTrail?.destinationState || ""
    },
    signatureBase64: sig,
    signerIp: auditTrail?.signerIp || "127.0.0.1",
    signerUserAgent: auditTrail?.signerUserAgent || "Navegador Web",
    appOrigin: appOrigin || "https://corpflats.onrender.com",
    geolocation: auditTrail?.geolocation || null,
    optInMarketing: Boolean(targetGuest.optInMarketing || auditTrail?.optInMarketing),
    whatsapp2faVerified: Boolean(targetGuest.whatsapp2faVerified || auditTrail?.whatsapp2faVerified),
    whatsappPhone: targetGuest.whatsappPhone || auditTrail?.whatsappPhone || null,
    whatsappOtpVerifiedAt: auditTrail?.whatsappOtpVerifiedAt || null
  });
}

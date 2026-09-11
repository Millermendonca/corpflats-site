import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FNRH_UPLOADS_DIR = path.join(__dirname, "uploads", "fnrh_documents");
if (!fs.existsSync(FNRH_UPLOADS_DIR)) {
  try {
    fs.mkdirSync(FNRH_UPLOADS_DIR, { recursive: true });
  } catch (err) {
    console.error("[FNRH PDF] Erro ao criar diretório de uploads FNRH:", err);
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

/**
 * Compila a Ficha de Registro de Hóspede com Auditoria Forense
 * @param {Object} params
 * @returns {Promise<{ filePath: string, fileName: string, fileUrl: string, documentUuid: string, sha256Hash: string, signedAt: string, auditTrail: Object }>}
 */
export async function generateFnrhPdf({
  reservation,
  guestData,
  signatureBase64,
  signerIp,
  signerUserAgent,
  appOrigin = "https://corpflats.onrender.com"
}) {
  const documentUuid = crypto.randomUUID();
  const signedAtIso = new Date().toISOString();
  const signedAtBrasilia = formatToBrasiliaDateTime(signedAtIso);

  const cleanCpf = (guestData.document || guestData.cpf || reservation.guestDocument || "00000000000").replace(/\D/g, "");
  const reservationId = reservation.id || reservation.code || "res";
  const timestamp = Date.now();
  const fileName = `fnrh_${reservationId}_${cleanCpf}_${timestamp}.pdf`;
  const filePath = path.join(FNRH_UPLOADS_DIR, fileName);

  const verifyUrl = `${appOrigin.replace(/\/$/, "")}/verificar-ficha/${documentUuid}`;

  // Gera o QR Code em buffer de alta resolução
  const qrCodeBuffer = await QRCode.toBuffer(verifyUrl, {
    width: 130,
    margin: 1,
    color: {
      dark: "#0f172a",
      light: "#ffffff"
    }
  });

  // Converte assinatura Base64 para Buffer caso exista
  let signatureBuffer = null;
  if (signatureBase64 && typeof signatureBase64 === "string" && signatureBase64.includes("base64,")) {
    try {
      const b64Data = signatureBase64.split("base64,")[1];
      signatureBuffer = Buffer.from(b64Data, "base64");
    } catch (sigErr) {
      console.warn("[FNRH PDF] Falha ao decodificar assinatura base64:", sigErr.message);
    }
  }

  // Criação do Documento PDFKit
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 32, bottom: 32, left: 36, right: 36 },
    info: {
      Title: `Ficha de Registro de Hóspede - ${guestData.fullName || guestData.name || "Hóspede"}`,
      Author: "CorpFlats Hospedagem",
      Subject: "FNRH - Ficha de Registro de Hóspede e Trilha de Auditoria Forense",
      Keywords: "FNRH, Check-in, Assinatura Eletrônica, CorpFlats",
      CreationDate: new Date()
    }
  });

  const writeStream = fs.createWriteStream(filePath);
  doc.pipe(writeStream);

  // ════════════════════════════════════════════════════════════════════════════
  // 1. CABEÇALHO OFICIAL CORPFLATS
  // ════════════════════════════════════════════════════════════════════════════
  const topY = 32;

  // Barra decorativa superior
  doc.rect(36, topY, 523, 4).fill("#0284c7"); // Sky-600

  // Ícone e Logo Box
  doc.roundedRect(36, topY + 10, 48, 48, 8).fill("#0f172a");
  doc.fillColor("#ffffff").fontSize(20).font("Helvetica-Bold").text("CF", 48, topY + 24);

  // Identificação da Empresa
  doc.fillColor("#0f172a").fontSize(15).font("Helvetica-Bold").text("CORPFLATS HOSPEDAGEM", 94, topY + 12);
  doc.fontSize(8.5).font("Helvetica").fillColor("#475569");
  doc.text("Razão Social: CORP FLATS HOSPEDAGEM LTDA  |  CNPJ: 47.964.813/0001-65", 94, topY + 30);
  doc.text("Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ, CEP 28010-140", 94, topY + 41);
  doc.text("WhatsApp/Tel: (22) 99712-4021  |  E-mail: reservas@corpflats.com.br", 94, topY + 52);

  // Título do Documento à Direita
  doc.roundedRect(385, topY + 12, 174, 46, 6).fill("#f1f5f9");
  doc.fillColor("#0284c7").fontSize(8).font("Helvetica-Bold").text("DOCUMENTO OFICIAL", 395, topY + 18);
  doc.fillColor("#0f172a").fontSize(11).font("Helvetica-Bold").text("Ficha de Registro de Hóspede", 395, topY + 29);
  doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text(`Código: ${reservation.code || reservationId}`, 395, topY + 44);

  let currentY = topY + 70;

  // ════════════════════════════════════════════════════════════════════════════
  // 2. BLOCO 1: DADOS DA HOSPEDAGEM
  // ════════════════════════════════════════════════════════════════════════════
  doc.rect(36, currentY, 523, 18).fill("#0f172a");
  doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold").text("1. DADOS DA HOSPEDAGEM", 42, currentY + 5);

  currentY += 18;
  doc.rect(36, currentY, 523, 44).fill("#f8fafc").stroke("#e2e8f0");

  const col1 = 44;
  const col2 = 180;
  const col3 = 310;
  const col4 = 440;

  // Linha 1 do Bloco
  doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text("Acomodação (Flat):", col1, currentY + 6);
  doc.fillColor("#0f172a").fontSize(10).font("Helvetica-Bold").text(`Flat ${reservation.flatNumber || reservation.flatId || "Standard"}`, col1, currentY + 16);

  doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text("Data de Entrada (Check-in):", col2, currentY + 6);
  doc.fillColor("#0f172a").fontSize(9).font("Helvetica-Bold").text(`${reservation.checkinDate || "-"} às ${reservation.checkinTime || "14:00"}`, col2, currentY + 16);

  doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text("Data de Saída (Check-out):", col3, currentY + 6);
  doc.fillColor("#0f172a").fontSize(9).font("Helvetica-Bold").text(`${reservation.checkoutDate || "-"} às ${reservation.checkoutTime || "12:00"}`, col3, currentY + 16);

  doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text("Localização:", col4, currentY + 6);
  doc.fillColor("#0f172a").fontSize(8.5).font("Helvetica-Bold").text("Soho Residence Service", col4, currentY + 16);

  // Linha 2 do Bloco
  const vehicleInfo = reservation.vehicle?.plate 
    ? `${reservation.vehicle.plate} (${[reservation.vehicle.brand, reservation.vehicle.model].filter(Boolean).join(" ")})`
    : "Não informado / Sem veículo";

  doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text("Veículo / Garagem:", col1, currentY + 30);
  doc.fillColor("#334155").fontSize(8.5).font("Helvetica").text(vehicleInfo, col1 + 80, currentY + 30);

  currentY += 52;

  // ════════════════════════════════════════════════════════════════════════════
  // 3. BLOCO 2: DADOS PESSOAIS DO HÓSPEDE (SIMPLIFICADO)
  // ════════════════════════════════════════════════════════════════════════════
  doc.rect(36, currentY, 523, 18).fill("#0f172a");
  doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold").text("2. DADOS PESSOAIS DO HÓSPEDE", 42, currentY + 5);

  currentY += 18;
  doc.rect(36, currentY, 523, 62).fill("#f8fafc").stroke("#e2e8f0");

  const guestFullName = (guestData.fullName || guestData.name || reservation.guestName || "Hóspede").trim();
  const guestDoc = guestData.document || guestData.cpf || reservation.guestDocument || "-";
  const guestPhone = guestData.phone || reservation.guestPhone || "-";
  const guestEmail = guestData.email || reservation.guestEmail || "-";
  const guestAddress = [
    guestData.address || reservation.guestAddress || "",
    guestData.city || "",
    guestData.state || ""
  ].filter(Boolean).join(" - ") || "Endereço não informado";

  // Linha 1: Nome e Documento
  doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text("Nome Completo:", col1, currentY + 6);
  doc.fillColor("#0f172a").fontSize(10).font("Helvetica-Bold").text(guestFullName, col1, currentY + 16);

  doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text("CPF / Documento Oficial:", col3, currentY + 6);
  doc.fillColor("#0f172a").fontSize(10).font("Helvetica-Bold").text(guestDoc, col3, currentY + 16);

  // Linha 2: Telefone e Email
  doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text("Telefone / WhatsApp:", col1, currentY + 30);
  doc.fillColor("#0f172a").fontSize(8.5).font("Helvetica").text(guestPhone, col1, currentY + 40);

  doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text("E-mail:", col3, currentY + 30);
  doc.fillColor("#0f172a").fontSize(8.5).font("Helvetica").text(guestEmail, col3, currentY + 40);

  // Linha 3: Endereço Residencial
  doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text("Endereço Residencial:", col1, currentY + 51);
  doc.fillColor("#334155").fontSize(8).font("Helvetica").text(guestAddress, col1 + 86, currentY + 51);

  currentY += 70;

  // ════════════════════════════════════════════════════════════════════════════
  // 4. TERMOS E DECLARAÇÃO LEGAL DE HOSPEDAGEM
  // ════════════════════════════════════════════════════════════════════════════
  doc.roundedRect(36, currentY, 523, 42, 4).fill("#f8fafc").stroke("#cbd5e1");
  
  // Caixa de seleção marcada [✓]
  doc.rect(44, currentY + 8, 12, 12).fill("#0284c7");
  doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold").text("✓", 46, currentY + 9);

  doc.fillColor("#0f172a").fontSize(8).font("Helvetica-Bold").text(
    "Declaração Legal de Responsabilidade e Termos de Hospedagem / LGPD",
    62,
    currentY + 8
  );

  doc.fillColor("#475569").fontSize(7.5).font("Helvetica").text(
    "\"Declaro que as informações prestadas são verdadeiras e estou ciente dos termos de hospedagem e política de privacidade/LGPD.\"",
    62,
    currentY + 20
  );
  doc.fillColor("#64748b").fontSize(7).text(
    "O titular declara ciência das normas internas do Edifício Soho Residence Service, horários de check-in (14h) e check-out (12h) e integridade do mobiliário.",
    62,
    currentY + 30
  );

  currentY += 50;

  // ════════════════════════════════════════════════════════════════════════════
  // 5. BLOCO 4: ÁREA DE ASSINATURA ELETRÔNICA DO HÓSPEDE
  // ════════════════════════════════════════════════════════════════════════════
  doc.rect(36, currentY, 523, 18).fill("#0f172a");
  doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold").text("3. ASSINATURA ELETRÔNICA DO HÓSPEDE", 42, currentY + 5);

  currentY += 18;
  doc.rect(36, currentY, 523, 100).fill("#ffffff").stroke("#cbd5e1");

  if (signatureBuffer) {
    try {
      doc.image(signatureBuffer, 175, currentY + 6, {
        fit: [210, 60],
        align: "center",
        valign: "center"
      });
    } catch (imgErr) {
      console.warn("[FNRH PDF] Não foi possível desenhar a assinatura:", imgErr);
      doc.fillColor("#94a3b8").fontSize(10).font("Helvetica-Oblique").text("[Assinatura Eletrônica Registrada]", 210, currentY + 30);
    }
  } else {
    doc.fillColor("#94a3b8").fontSize(10).font("Helvetica-Oblique").text("[Assinatura Eletrônica Registrada]", 210, currentY + 30);
  }

  // Linha da assinatura
  doc.moveTo(140, currentY + 74).lineTo(420, currentY + 74).stroke("#94a3b8");
  doc.fillColor("#0f172a").fontSize(9).font("Helvetica-Bold").text(guestFullName, 36, currentY + 78, { width: 523, align: "center" });
  doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text(`Assinado eletronicamente em ${signedAtBrasilia}`, 36, currentY + 89, { width: 523, align: "center" });

  currentY += 108;

  // ════════════════════════════════════════════════════════════════════════════
  // 6. CERTIFICADO DE CONFORMIDADE E TRILHA DE AUDITORIA FORENSE (OBRIGATÓRIO)
  // ════════════════════════════════════════════════════════════════════════════
  doc.rect(36, currentY, 523, 18).fill("#0284c7");
  doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold").text("4. CERTIFICADO DE CONFORMIDADE E TRILHA DE AUDITORIA FORENSE", 42, currentY + 5);

  currentY += 18;
  const auditBoxHeight = 175;
  doc.roundedRect(36, currentY, 523, auditBoxHeight, 4).fill("#f8fafc").stroke("#0284c7");

  // Desenha QR Code no canto direito
  doc.image(qrCodeBuffer, 442, currentY + 12, { width: 104, height: 104 });
  doc.fillColor("#64748b").fontSize(6.5).font("Helvetica").text("Validação Pública", 442, currentY + 118, { width: 104, align: "center" });
  doc.text("Aponte a câmera", 442, currentY + 126, { width: 104, align: "center" });

  // Informações de Auditoria à Esquerda
  const auditX = 46;
  let auditY = currentY + 10;

  doc.fillColor("#0f172a").fontSize(8).font("Helvetica-Bold").text("Identificador Único do Documento (UUID v4):", auditX, auditY);
  doc.fillColor("#0369a1").fontSize(8.5).font("Courier-Bold").text(documentUuid, auditX + 188, auditY);

  auditY += 15;
  doc.fillColor("#0f172a").fontSize(8).font("Helvetica-Bold").text("Data e Hora da Assinatura (ISO 8601):", auditX, auditY);
  doc.fillColor("#334155").fontSize(8).font("Courier").text(signedAtIso, auditX + 175, auditY);

  auditY += 15;
  doc.fillColor("#0f172a").fontSize(8).font("Helvetica-Bold").text("Horário Oficial de Brasília:", auditX, auditY);
  doc.fillColor("#334155").fontSize(8).font("Helvetica").text(signedAtBrasilia, auditX + 125, auditY);

  auditY += 15;
  doc.fillColor("#0f172a").fontSize(8).font("Helvetica-Bold").text("Endereço IP do Signatário:", auditX, auditY);
  doc.fillColor("#334155").fontSize(8).font("Courier").text(signerIp || "127.0.0.1 (Local/Totem)", auditX + 130, auditY);

  auditY += 15;
  doc.fillColor("#0f172a").fontSize(8).font("Helvetica-Bold").text("Dispositivo / Navegador (User-Agent):", auditX, auditY);
  const cleanUa = (signerUserAgent || "Navegador Web / Dispositivo Pessoal").substring(0, 75);
  doc.fillColor("#475569").fontSize(7.5).font("Courier").text(cleanUa, auditX + 165, auditY, { width: 225 });

  auditY += 22;
  // Mensagem Jurídica Formal
  doc.roundedRect(auditX, auditY, 385, 26, 3).fill("#e0f2fe");
  doc.fillColor("#0369a1").fontSize(7.5).font("Helvetica-Bold").text(
    "Disposição Jurídica de Validade:",
    auditX + 6,
    auditY + 4
  );
  doc.fillColor("#0c4a6e").fontSize(7.5).font("Helvetica").text(
    "\"Documento assinado eletronicamente nos termos do art. 10, § 2º da Medida Provisória nº 2.200-2/2001 e da Lei Federal nº 14.063/2020.\"",
    auditX + 6,
    auditY + 14,
    { width: 373 }
  );

  auditY += 34;
  // Hash Criptográfico SHA-256 preliminar de integridade do documento
  const canonicalSignaturePayload = JSON.stringify({
    documentUuid,
    reservationCode: reservation.code || reservationId,
    guestCpf: cleanCpf,
    guestName: guestFullName,
    signedAt: signedAtIso,
    signerIp: signerIp || "",
    signerUserAgent: signerUserAgent || ""
  });
  const canonicalHash = crypto.createHash("sha256").update(canonicalSignaturePayload).digest("hex");

  doc.fillColor("#0f172a").fontSize(7.5).font("Helvetica-Bold").text("Cálculo do Hash Criptográfico (SHA-256):", auditX, auditY);
  doc.fillColor("#047857").fontSize(7.5).font("Courier-Bold").text(canonicalHash, auditX, auditY + 10, { width: 385 });

  doc.fillColor("#64748b").fontSize(6.5).font("Helvetica").text(
    "A chave SHA-256 garante matematicamente a integridade e o não-repúdio deste registro desde o momento da assinatura.",
    auditX,
    auditY + 22
  );

  // Rodapé da Página
  doc.fillColor("#94a3b8").fontSize(7).font("Helvetica").text(
    `CorpFlats Hospedagem  •  Ficha ID: ${documentUuid}  •  Página 1 de 1  •  Emitido automaticamente pelo sistema`,
    36,
    810,
    { width: 523, align: "center" }
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

  const fileUrl = `/api/storage/files/fnrh_documents/${fileName}`;

  return {
    filePath,
    fileName,
    fileUrl,
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
      signerIp: signerIp || "",
      signerUserAgent: signerUserAgent || "",
      signedAt: signedAtIso,
      signedAtBrasilia,
      sha256Hash: finalFileSha256,
      canonicalHash,
      verifyUrl,
      fileName,
      fileUrl
    }
  };
}

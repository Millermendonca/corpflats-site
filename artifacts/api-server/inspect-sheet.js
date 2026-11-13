import * as XLSX from "xlsx";

const shareUrl = "https://1drv.ms/x/c/caba622def61cb38/IQAABAFTc9qBR7cpKTgR2Lo3AYHW4JrwOU2p8ekBEcgydyI?e=Ohs2xW";

function shareUrlToEncodedId(shareUrl) {
  const encoded = Buffer.from(shareUrl).toString("base64url");
  return `u!${encoded}`;
}

async function run() {
  console.log("1. Resolvendo link do OneDrive...");
  const encodedId = shareUrlToEncodedId(shareUrl);
  const metaUrl = `https://api.onedrive.com/v1.0/shares/${encodedId}/root?select=name,@content.downloadUrl`;

  let buffer;
  try {
    const metaRes = await fetch(metaUrl, { headers: { Accept: "application/json" } });
    if (metaRes.ok) {
      const meta = await metaRes.json();
      console.log("Nome do arquivo:", meta.name);
      console.log("Download URL obtido.");
      const fileRes = await fetch(meta["@content.downloadUrl"]);
      buffer = await fileRes.arrayBuffer();
    }
  } catch (err) {
    console.log("Meta API falhou, tentando download direto...", err.message);
  }

  if (!buffer) {
    // Direct fetch fallback
    console.log("Tentando download direto com redirecionamentos...");
    // OneDrive direct download URL hack
    const directUrl = shareUrl.replace("/x/", "/download?").replace("/c/", "/download?");
    const res = await fetch(shareUrl, {
      redirect: "follow",
      headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream" }
    });
    console.log("Status da resposta:", res.status);
    buffer = await res.arrayBuffer();
  }

  console.log("Tamanho do buffer baixado:", buffer.byteLength, "bytes");

  try {
    const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true, cellText: true });
    console.log("\n📑 Abas encontradas no arquivo Excel:", workbook.SheetNames);

    for (const sheetName of workbook.SheetNames) {
      console.log(`\n--- Inspecionando Aba: "${sheetName}" ---`);
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
      console.log(`Total de linhas na aba "${sheetName}":`, data.length);
      console.log("Primeiras 10 linhas da aba:");
      for (let i = 0; i < Math.min(10, data.length); i++) {
        console.log(`Linha ${i}:`, JSON.stringify(data[i]?.slice(0, 15)));
      }
    }
  } catch (e) {
    console.error("Erro ao fazer parse do Excel:", e);
    const text = new TextDecoder().decode(new Uint8Array(buffer.slice(0, 500)));
    console.log("Início do conteúdo recebido:", text);
  }
}

run();

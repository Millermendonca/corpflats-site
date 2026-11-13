import { fetchSpreadsheet, parseSpreadsheet, detectCheckouts, detectCheckins, validateOneDriveUrl } from "./src/lib/onedrive.ts";
import * as XLSX from "xlsx";
import fs from "fs";

const shareUrl = "https://1drv.ms/x/c/caba622def61cb38/IQAABAFTc9qBR7cpKTgR2Lo3AYHW4JrwOU2p8ekBEcgydyI?e=Ohs2xW";

async function main() {
  console.log("Tentando baixar a planilha do OneDrive...");
  console.log("URL:", shareUrl);

  try {
    const data = await fetchSpreadsheet(shareUrl);
    console.log("\n✅ Planilha baixada e processada com sucesso!");
    console.log("Total de colunas com datas:", data.columnDates.length);
    console.log("Primeiras 10 datas encontradas:", data.columnDates.slice(0, 10));
    console.log("Total de flats/linhas encontrados:", data.rows.length);
    console.log("Primeiros 10 flats encontrados:", data.rows.slice(0, 10).map(r => r.flatNumber));

    const checkouts = detectCheckouts(data);
    const checkins = detectCheckins(data);

    console.log("\n📊 Resumo da detecção:");
    console.log("Total de check-outs detectados:", checkouts.length);
    console.log("Exemplo de primeiros 10 checkouts detectados:");
    console.log(checkouts.slice(0, 10));

    console.log("\nTotal de check-ins detectados:", checkins.length);
    console.log("Exemplo de primeiros 10 checkins detectados:");
    console.log(checkins.slice(0, 10));

    // Sample row inspect
    if (data.rows.length > 0) {
      console.log("\nPrimeiro flat:", data.rows[0].flatNumber);
      for (let i = 0; i < Math.min(10, data.columnDates.length); i++) {
        console.log(`  Data ${data.columnDates[i]}: ${data.rows[0].cells[i]}`);
      }
    }
  } catch (err) {
    console.error("\n❌ Erro ao baixar ou processar a planilha:", err);
  }
}

main();

import * as XLSX from "xlsx";
import fs from "fs";

const filePath = "C:\\Users\\mille\\OneDrive\\Documentos\\Calendário de Reservas 23-11-2025.xlsx";
const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
const data = XLSX.utils.sheet_to_json(wb.Sheets["Agenda"], { header: 1 });

const header = data[0];
let col509 = -1;
for (let c = 0; c < header.length; c++) {
  if (String(header[c]).includes("509")) {
    col509 = c;
    console.log(`Coluna do Apt 509 encontrada no índice ${c}: "${header[c]}"`);
  }
}

console.log("\nValores na coluna do Apt 509 para agosto de 2026:");
for (let r = 1; r < Math.min(data.length, 2500); r++) {
  const d = data[r][1] || data[r][0];
  let dStr = "";
  if (d instanceof Date) dStr = d.toISOString().substring(0, 10);
  else if (typeof d === "string") dStr = d.trim();
  
  if (dStr.startsWith("2026-08-1")) {
    console.log(`Linha ${r} | Data: ${dStr} | Valor Apt 509: ${JSON.stringify(data[r][col509])}`);
  }
}

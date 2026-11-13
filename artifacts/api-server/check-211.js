import * as XLSX from "xlsx";
import fs from "fs";

const filePath = "C:\\Users\\mille\\OneDrive\\Documentos\\Calendário de Reservas 23-11-2025.xlsx";
const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
const data = XLSX.utils.sheet_to_json(wb.Sheets["Agenda"], { header: 1 });

const header = data[0];
let col211 = -1;
for (let c = 0; c < header.length; c++) {
  if (String(header[c]).includes("211")) {
    col211 = c;
    console.log(`Coluna do Apt 211 no índice ${c}: "${header[c]}"`);
  }
}

console.log("\nValores na coluna do Apt 211 para as datas de agosto:");
for (let r = 1; r < Math.min(data.length, 2500); r++) {
  const d = data[r][1] || data[r][0];
  let dStr = "";
  if (d instanceof Date) dStr = d.toISOString().substring(0, 10);
  else if (typeof d === "string") dStr = d.trim();
  
  if (dStr.startsWith("2026-08-1") || dStr.startsWith("2026-08-2")) {
    console.log(`Linha ${r.toString().padStart(4)} | Data: ${dStr} | Valor Apt 211: ${JSON.stringify(data[r][col211])}`);
  }
}

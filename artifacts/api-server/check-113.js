import * as XLSX from "xlsx";
import fs from "fs";

const filePath = "C:\\Users\\mille\\OneDrive\\Documentos\\Calendário de Reservas 23-11-2025.xlsx";
const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
const data = XLSX.utils.sheet_to_json(wb.Sheets["Agenda"], { header: 1 });

console.log("Valores para o Apt 113:");
for (let r = 1; r < Math.min(data.length, 2000); r++) {
  const d = data[r][1] || data[r][0];
  let dStr = "";
  if (d instanceof Date) dStr = d.toISOString().substring(0, 10);
  else if (typeof d === "string") dStr = d.trim();
  
  if (dStr === "2026-08-14" || dStr === "2026-08-15" || dStr === "2026-08-16") {
    console.log(`Data: ${dStr} -> Célula Col 2 (Apt 113): ${JSON.stringify(data[r][2])}`);
  }
}

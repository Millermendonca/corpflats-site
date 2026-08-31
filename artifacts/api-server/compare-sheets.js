import * as XLSX from "xlsx";
import fs from "fs";

const paths = [
  "C:\\Users\\mille\\OneDrive\\Documentos\\Calendário de Reservas 23-11-2025.xlsx",
  "C:\\Users\\mille\\OneDrive\\Hotel\\Calendário de Reservas 23-11-2025.xlsx",
];

for (const p of paths) {
  if (!fs.existsSync(p)) continue;
  const stat = fs.statSync(p);
  console.log(`\n========================================`);
  console.log(`Arquivo: ${p}`);
  console.log(`Modificado em: ${stat.mtime.toLocaleString("pt-BR")}`);
  console.log(`Tamanho: ${stat.size} bytes`);
  
  const buf = fs.readFileSync(p);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets["Agenda"] || wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  console.log("Total de linhas:", data.length);
  
  // Find the last 5 date rows
  const lastRows = [];
  for (let r = 1; r < data.length; r++) {
    const rawDate = data[r][1] || data[r][0];
    if (rawDate) {
      let d = rawDate instanceof Date ? rawDate.toISOString().substring(0, 10) : String(rawDate).trim();
      lastRows.push({ r, d, row: data[r] });
    }
  }
  console.log("Últimas 5 datas:");
  for (const item of lastRows.slice(-5)) {
    console.log(`  Linha ${item.r}: Data = ${item.d}`);
  }
}

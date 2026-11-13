import * as XLSX from "xlsx";
import fs from "fs";

const filePath = "C:\\Users\\mille\\OneDrive\\Hotel\\Calendário de Reservas 23-11-2025.xlsx";

function analyze() {
  console.log("Lendo arquivo local:", filePath);
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true, cellStyles: true });
  console.log("📑 Abas encontradas:", wb.SheetNames);

  for (const sheetName of wb.SheetNames) {
    console.log(`\n========================================`);
    console.log(`ABA: "${sheetName}"`);
    console.log(`========================================`);
    const sheet = wb.Sheets[sheetName];
    
    // Convert to JSON 2D array
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    console.log(`Total de linhas: ${data.length}`);

    // Print first 25 rows, first 15 columns
    for (let r = 0; r < Math.min(25, data.length); r++) {
      const row = data[r];
      if (!row || row.length === 0) continue;
      const preview = row.slice(0, 15).map(c => (c instanceof Date ? c.toISOString().substring(0, 10) : String(c).trim()));
      console.log(`L${r.toString().padStart(2, "0")}:`, JSON.stringify(preview));
    }
  }
}

analyze();

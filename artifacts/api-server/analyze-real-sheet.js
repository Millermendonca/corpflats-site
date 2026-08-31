import * as XLSX from "xlsx";
import fs from "fs";

const filePath = "C:\\Users\\mille\\OneDrive\\Hotel\\Calendário de Reservas 23-11-2025.xlsx";

function analyzeRealData() {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true, cellStyles: true });
  const sheet = wb.Sheets["Agenda"] || wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  const header = data[0] || [];
  console.log("Total de colunas:", header.length);

  // Extract flat columns: index >= 2
  const flats = [];
  for (let c = 2; c < header.length; c++) {
    const colName = String(header[c] || "").trim();
    if (!colName) continue;
    // Extract first number sequence as flatNumber
    const match = colName.match(/\b\d{2,4}\b/);
    const flatNumber = match ? match[0] : colName;
    flats.push({ colIndex: c, colName, flatNumber });
  }

  console.log("\n🏨 Flats mapeados na planilha (" + flats.length + " flats):");
  console.log(flats.map(f => `Col ${f.colIndex}: Apt ${f.flatNumber} (${f.colName})`).join("\n"));

  // Check date range
  const dateRows = [];
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;
    let rawDate = row[1] || row[0];
    let dateStr = "";
    if (rawDate instanceof Date) {
      dateStr = rawDate.toISOString().substring(0, 10);
    } else if (typeof rawDate === "string" && rawDate.trim()) {
      // Check if format is YYYY-MM-DD or DD/MM/YYYY
      const parts = rawDate.trim().split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        else if (parts[2].length === 4) dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    if (dateStr) {
      dateRows.push({ rowIndex: r, dateStr, row });
    }
  }

  console.log("\n📅 Total de linhas de datas válidas:", dateRows.length);
  if (dateRows.length > 0) {
    console.log("Primeira data:", dateRows[0].dateStr);
    console.log("Última data:", dateRows[dateRows.length - 1].dateStr);
    
    // Print the last 15 dates in the spreadsheet
    console.log("\nÚltimas 15 datas cadastradas:");
    for (const d of dateRows.slice(-15)) {
      console.log(`Linha ${d.rowIndex}: ${d.dateStr}`);
    }
  }
}

analyzeRealData();

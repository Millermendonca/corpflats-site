import * as XLSX from "xlsx";
import fs from "fs";

const filePath = "C:\\Users\\mille\\OneDrive\\Documentos\\Calendário de Reservas 23-11-2025.xlsx";

function checkToday() {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets["Agenda"] || wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  const header = data[0] || [];
  const flats = [];
  for (let c = 2; c < header.length; c++) {
    const colName = String(header[c] || "").trim();
    if (!colName) continue;
    const match = colName.match(/\b\d{2,4}\b/);
    const flatNumber = match ? match[0] : colName;
    flats.push({ colIndex: c, colName, flatNumber });
  }

  console.log(`Flats mapeados: ${flats.length}`);

  // Find rows for yesterday (2026-08-14), today (2026-08-15), tomorrow (2026-08-16)
  const rowsByDate = {};
  for (let r = 1; r < 2000; r++) {
    const row = data[r];
    if (!row) continue;
    let rawDate = row[1] || row[0];
    let dateStr = "";
    if (rawDate instanceof Date) {
      dateStr = rawDate.toISOString().substring(0, 10);
    } else if (typeof rawDate === "string" && rawDate.trim()) {
      const parts = rawDate.trim().split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        else if (parts[2].length === 4) dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    if (dateStr) {
      rowsByDate[dateStr] = { rowIndex: r, row };
    }
  }

  console.log("Linhas encontradas para agosto de 2026:");
  const dates = Object.keys(rowsByDate).sort();
  const augDates = dates.filter(d => d.startsWith("2026-08"));
  console.log("Datas de agosto:", augDates);

  const todayStr = "2026-08-15";
  const yesterdayStr = "2026-08-14";
  const tomorrowStr = "2026-08-16";

  const rowYesterday = rowsByDate[yesterdayStr]?.row;
  const rowToday = rowsByDate[todayStr]?.row;
  const rowTomorrow = rowsByDate[tomorrowStr]?.row;

  console.log(`\n========================================`);
  console.log(`MAPEAMENTO DE CHECK-OUTS E CHECK-INS PARA HOJE (${todayStr}):`);
  console.log(`========================================`);

  if (!rowToday) {
    console.log("AVISO: Linha de hoje não encontrada, buscando a data mais recente com dados...");
    return;
  }

  const checkouts = [];
  const checkins = [];
  const stayovers = [];
  const vacants = [];

  for (const f of flats) {
    const guestYesterday = String(rowYesterday ? rowYesterday[f.colIndex] || "" : "").trim();
    const guestToday = String(rowToday ? rowToday[f.colIndex] || "" : "").trim();

    // In a daily calendar:
    // rowYesterday = night of yesterday
    // rowToday = night of today
    // If guestYesterday had someone, and guestToday is EMPTY or a DIFFERENT guest -> CHECKOUT today morning!
    const isCheckout = guestYesterday && (guestYesterday !== guestToday);
    // If guestToday has someone, and (guestYesterday is EMPTY or DIFFERENT) -> CHECKIN today afternoon!
    const isCheckin = guestToday && (guestToday !== guestYesterday);
    // If guestYesterday === guestToday and guestToday !== "" -> Stayover (hóspede continua)
    const isStayover = guestYesterday && guestYesterday === guestToday;
    const isVacant = !guestYesterday && !guestToday;

    if (isCheckout) {
      checkouts.push({
        flatNumber: f.flatNumber,
        colName: f.colName,
        leavingGuest: guestYesterday,
        arrivingGuest: guestToday || "(Vago)",
        hasCheckinToday: Boolean(guestToday),
      });
    }

    if (isCheckin) {
      checkins.push({
        flatNumber: f.flatNumber,
        arrivingGuest: guestToday,
      });
    }

    if (isStayover) {
      stayovers.push({
        flatNumber: f.flatNumber,
        guest: guestToday,
      });
    }

    if (isVacant) {
      vacants.push(f.flatNumber);
    }
  }

  console.log(`\n🧹 CHECK-OUTS DETECTADOS PARA HOJE (${checkouts.length} flats a serem limpos):`);
  for (const c of checkouts) {
    console.log(`  - Apt ${c.flatNumber.padEnd(5)}: Saiu "${c.leavingGuest}" -> Entra "${c.arrivingGuest}" ${c.hasCheckinToday ? '🔥 (CHECK-IN HOJE)' : '(Fica Vago)'}`);
  }

  console.log(`\n🏨 CHECK-INS DETECTADOS PARA HOJE (${checkins.length} flats):`);
  for (const ci of checkins) {
    console.log(`  - Apt ${ci.flatNumber.padEnd(5)}: Entra "${ci.arrivingGuest}"`);
  }

  console.log(`\n🛌 HÓSPEDES QUE CONTINUAM (Stayover) (${stayovers.length} flats):`);
  for (const s of stayovers) {
    console.log(`  - Apt ${s.flatNumber.padEnd(5)}: "${s.guest}"`);
  }

  console.log(`\n🚪 VAGOS (${vacants.length} flats):`, vacants.join(", "));
}

checkToday();

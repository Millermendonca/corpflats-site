import fs from "fs";
import path from "path";
import crypto from "crypto";

const LOCAL_SPREADSHEET_PATHS = [
  "C:\\Users\\mille\\OneDrive\\Documentos\\Calendário de Reservas 23-11-2025.xlsx",
  "C:\\Users\\mille\\OneDrive\\Hotel\\Calendário de Reservas 23-11-2025.xlsx",
  "C:\\Users\\mille\\OneDrive\\Hotel\\Documentos hóspedes\\FLAT_CAMPOS.xlsx",
  "C:\\Users\\mille\\OneDrive\\Hotel\\Documentos hóspedes\\Calendário de Reservas 23-11-2025.xlsx",
  "C:\\Users\\mille\\OneDrive\\Documentos\\Hotel\\Calendário de reservas 2024.xlsx",
];

function getSpreadsheetPath() {
  for (const p of LOCAL_SPREADSHEET_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  const hotelDir = "C:\\Users\\mille\\OneDrive\\Hotel\\Documentos hóspedes";
  if (fs.existsSync(hotelDir)) {
    try {
      const files = fs.readdirSync(hotelDir);
      const xlsxFile = files.find(f => f.toLowerCase().endsWith(".xlsx") && !f.startsWith("~$"));
      if (xlsxFile) return path.join(hotelDir, xlsxFile);
    } catch {}
  }
  return null;
}

let lastHash = "";

async function pushToCloud(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    if (hash === lastHash) return;
    
    lastHash = hash;
    const base64 = buf.toString("base64");
    console.log(`[Excel Sync Watcher] Enviando atualizacao do Excel (${buf.length} bytes) para o Render em ${new Date().toLocaleTimeString()}...`);
    
    const res = await fetch("https://corpflats.onrender.com/api/sync/upload-sheet-json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64 })
    });
    
    if (res.ok) {
      const data = await res.json();
      console.log(`[Excel Sync Watcher] ✅ SUCESSO! Nuvem atualizada instantaneamente:`, data.message);
    }
  } catch (err) {
    console.warn(`[Excel Sync Watcher] Erro ao enviar para nuvem:`, err.message);
  }
}

console.log("[Excel Sync Watcher] Iniciando vigilancia continua do Excel do Hotel...");

function checkAndWatch() {
  const filePath = getSpreadsheetPath();
  if (filePath) {
    console.log(`[Excel Sync Watcher] Vigiando arquivo: ${filePath}`);
    pushToCloud(filePath);

    fs.watchFile(filePath, { interval: 500 }, (curr, prev) => {
      if (curr.mtimeMs !== prev.mtimeMs) {
        console.log("[Excel Sync Watcher] ⚡ CTRL+S detectado no Excel! Enviando...");
        pushToCloud(filePath);
      }
    });

    setInterval(() => {
      pushToCloud(filePath);
    }, 3000);
  } else {
    setTimeout(checkAndWatch, 10000);
  }
}

checkAndWatch();

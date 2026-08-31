import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const SPREADSHEET_PATH = "C:\\Users\\mille\\OneDrive\\Documentos\\Calendário de Reservas 23-11-2025.xlsx";
const CLOUD_URL = "https://corpflats.onrender.com/api/sync/upload-sheet-json";

let isSyncing = false;

async function syncToCloud() {
  if (isSyncing) return;
  if (!fs.existsSync(SPREADSHEET_PATH)) return;

  isSyncing = true;
  try {
    const buf = fs.readFileSync(SPREADSHEET_PATH);
    const base64 = buf.toString("base64");

    const res = await fetch(CLOUD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64 })
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`[${new Date().toLocaleTimeString()}] ✓ Planilha sincronizada com a nuvem no Render:`, data.message);
    } else {
      console.warn(`[${new Date().toLocaleTimeString()}] Falha na sincronização com o Render (HTTP ${res.status})`);
    }
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString()}] Erro ao enviar planilha para o Render:`, err.message);
  } finally {
    isSyncing = false;
  }
}

// Sincroniza imediatamente ao iniciar
syncToCloud();

// Observa alterações no arquivo a cada 500ms
if (fs.existsSync(SPREADSHEET_PATH)) {
  fs.watchFile(SPREADSHEET_PATH, { interval: 500 }, (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs) {
      console.log(`[${new Date().toLocaleTimeString()}] Alteração detectada no Excel! Sincronizando com o Render...`);
      syncToCloud();
    }
  });
  console.log(`[Sincronizador Nuvem Ativo] Observando: ${SPREADSHEET_PATH}`);
}

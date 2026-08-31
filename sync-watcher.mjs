// Auto-Sync Watcher: Envia alterações da planilha do seu computador diretamente para a nuvem no Render
import fs from "fs";
import path from "path";

const LOCAL_SPREADSHEET_PATHS = [
  "C:\\Users\\mille\\OneDrive\\Documentos\\Calendário de Reservas 23-11-2025.xlsx",
  "C:\\Users\\mille\\OneDrive\\Hotel\\Calendário de Reservas 23-11-2025.xlsx",
  "C:\\Users\\mille\\OneDrive\\Documentos\\Hotel\\Calendário de reservas 2024.xlsx",
];

function findFile() {
  for (const p of LOCAL_SPREADSHEET_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const targetFile = findFile();

if (!targetFile) {
  console.error("Arquivo da planilha Excel não encontrado nos caminhos padrões.");
  process.exit(1);
}

console.log(`[Auto-Sync Watcher] Monitorando planilha local: ${targetFile}`);

async function uploadToCloud() {
  try {
    console.log(`[Auto-Sync Watcher] Lendo planilha e enviando para o Render...`);
    const buf = fs.readFileSync(targetFile);
    const base64 = buf.toString("base64");
    const res = await fetch("https://corpflats.onrender.com/api/sync/upload-sheet-json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64 })
    });
    const data = await res.json();
    console.log(`[Auto-Sync Watcher] Sincronização com o Render realizada com sucesso:`, data.message || "OK");
  } catch (err) {
    console.error(`[Auto-Sync Watcher] Erro ao sincronizar com o Render:`, err.message);
  }
}

// Upload inicial
uploadToCloud();

// Watcher de 500ms
fs.watchFile(targetFile, { interval: 500 }, (curr, prev) => {
  if (curr.mtimeMs !== prev.mtimeMs) {
    console.log(`[Auto-Sync Watcher] Alteração detectada no Excel em ${new Date().toLocaleTimeString()}!`);
    uploadToCloud();
  }
});

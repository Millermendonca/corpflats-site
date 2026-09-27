/**
 * Sincronizador de planilha Excel DESCONTINUADO PERMANENTEMENTE.
 * Todas as reservas são criadas e gerenciadas diretamente no PMS Web.
 */
console.log("[Aviso] A sincronização via planilha Excel foi descontinuada permanentemente. Operação 100% via PMS Web.");
process.exit(0);


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

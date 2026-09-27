/**
 * Sincronizador de planilha Excel DESCONTINUADO PERMANENTEMENTE.
 * Todas as reservas são criadas e gerenciadas diretamente no PMS Web.
 */
console.log("[Aviso] A sincronização via planilha Excel foi descontinuada permanentemente. Operação 100% via PMS Web.");
process.exit(0);


function getFileHashSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buf).digest("hex");
  } catch (err) {
    // Excel pode estar no meio da gravação do AutoSave por alguns milissegundos
    return null;
  }
}

async function syncToCloud() {
  if (isSyncing) return;
  if (!fs.existsSync(LOCAL_EXCEL_PATH)) return;

  try {
    isSyncing = true;
    let buf = null;

    // Retry loop para garantir leitura mesmo durante gravação do AutoSave do Excel
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        buf = fs.readFileSync(LOCAL_EXCEL_PATH);
        break;
      } catch (e) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    if (!buf || buf.length < 5000) return;

    const currentHash = crypto.createHash("sha256").update(buf).digest("hex");
    if (currentHash === lastFileHash) {
      return; // Conteúdo idêntico, nada mudou
    }

    const nowStr = new Date().toLocaleTimeString();
    console.log(`\n[AutoSave Detectado ${nowStr}] Alteração identificada na planilha! Enviando para a nuvem (${buf.length} bytes)...`);

    const base64 = buf.toString("base64");
    const res = await fetch(CLOUD_SYNC_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64 })
    });

    const data = await res.json();
    if (res.ok) {
      lastFileHash = currentHash;
      console.log(`[Auto-Sync ${nowStr}] ✓ Nuvem Render atualizada com sucesso! (${data.message || 'OK'})`);
    } else {
      console.error(`[Auto-Sync ${nowStr}] ❌ Erro no servidor: ${data.error}`);
    }
  } catch (err) {
    console.error(`[Auto-Sync] Erro na sincronização: ${err.message}`);
  } finally {
    isSyncing = false;
  }
}

// 1. Sincronização inicial na abertura
syncToCloud();

// 2. Polling Ativo a cada 3 segundos (captura AutoSave do Excel mesmo sem Ctrl+S)
setInterval(async () => {
  const currentHash = getFileHashSafe(LOCAL_EXCEL_PATH);
  if (currentHash && currentHash !== lastFileHash) {
    await syncToCloud();
  }
}, POLLING_INTERVAL_MS);

// 3. Monitor de Eventos do Windows (disparo imediato no milissegundo de flush do disco)
try {
  fs.watch(LOCAL_EXCEL_PATH, (eventType) => {
    syncToCloud();
  });
} catch {}

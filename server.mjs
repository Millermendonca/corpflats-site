import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// Guardas de processo globais — previnem crash com Status 1 em exceções não tratadas
process.on("uncaughtException", (err, origin) => {
  console.error(`[Process Crash Guard] Exceção não capturada (origem: ${origin}):`, err?.stack || err?.message || err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Process Crash Guard] Rejeição de Promise não tratada:", reason?.stack || reason?.message || reason);
});

if (!crypto.hash) {
  crypto.hash = function (algorithm, data, outputEncoding) {
    const hash = crypto.createHash(algorithm).update(data);
    return outputEncoding ? hash.digest(outputEncoding) : hash.digest();
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega variáveis do Render (/etc/secrets) e de arquivos .env
function loadEnvFiles() {
  const potentialPaths = [
    "/etc/secrets/.env",
    "/etc/secrets/env",
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, ".env"),
    path.resolve(__dirname, "./artifacts/api-server/.env")
  ];

  if (fs.existsSync("/etc/secrets")) {
    try {
      const files = fs.readdirSync("/etc/secrets");
      for (const file of files) {
        const full = path.join("/etc/secrets", file);
        try {
          if (fs.statSync(full).isFile() && !potentialPaths.includes(full)) {
            potentialPaths.push(full);
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  for (const p of potentialPaths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf-8");
        let count = 0;
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const idx = trimmed.indexOf("=");
          if (idx > 0) {
            const key = trimmed.slice(0, idx).trim();
            let val = trimmed.slice(idx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key] || process.env[key] === "") {
              process.env[key] = val;
              count++;
            }
          }
        }
        if (count > 0) {
          console.log(`[EnvLoader] ${count} variáveis carregadas com sucesso de: ${p}`);
        }
      }
    } catch (_) {}
  }
}
loadEnvFiles();

// Import API and static server
const apiServerPath = path.resolve(__dirname, "./artifacts/api-server/demo-server.mjs");
await import(pathToFileURL(apiServerPath).href);


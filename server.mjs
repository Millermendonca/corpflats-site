import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import v8 from "node:v8";
import { spawn } from "node:child_process";

// Guardas de processo globais — previnem crash com Status 1 em exceções não tratadas
process.on("uncaughtException", (err, origin) => {
  console.error(`[Process Crash Guard] Exceção não capturada (origem: ${origin}):`, err?.stack || err?.message || err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Process Crash Guard] Rejeição de Promise não tratada:", reason?.stack || reason?.message || reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

// Render container (~2GB RAM total no plano contratado).
// Se o processo Node foi iniciado sem limite de heap explícito (ex: padrão > 1600MB em máquinas com muita RAM),
// respawna de forma transparente limitando o heap a 1536MB para margem de segurança de 512MB contra OOM.
const currentHeapLimitMB = Math.round(v8.getHeapStatistics().heap_size_limit / (1024 * 1024));
if (isDirectRun && !process.env.__CONTAINER_OPT__ && currentHeapLimitMB > 1600 && process.env.NODE_ENV !== "test") {
  const child = spawn(process.execPath, ["--max-old-space-size=1536", ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, __CONTAINER_OPT__: "1" }
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  process.on("SIGINT", () => child.kill("SIGINT"));
  await new Promise(() => {});
}

const memStats = process.memoryUsage();
console.log(`[Memory Guard] Heap limit: ${Math.round(v8.getHeapStatistics().heap_size_limit / (1024 * 1024))}MB | RSS inicial: ${Math.round(memStats.rss / (1024 * 1024))}MB`);

if (!crypto.hash) {
  crypto.hash = function (algorithm, data, outputEncoding) {
    const hash = crypto.createHash(algorithm).update(data);
    return outputEncoding ? hash.digest(outputEncoding) : hash.digest();
  };
}

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


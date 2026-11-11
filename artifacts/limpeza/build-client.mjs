import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import v8 from "node:v8";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Garante teto de heap V8 em 1536MB para proteger containers de 2GB RAM (Render 1c-2g) contra SIGKILL (OOM 137)
const currentHeapLimitMB = Math.round(v8.getHeapStatistics().heap_size_limit / (1024 * 1024));
if (!process.env.__LIMPEZA_HEAP_CAPPED__ && currentHeapLimitMB > 1600) {
  const child = spawn(
    process.execPath,
    ["--max-old-space-size=1536", ...process.argv.slice(1)],
    {
      stdio: "inherit",
      cwd: __dirname,
      env: { ...process.env, __LIMPEZA_HEAP_CAPPED__: "1" },
    }
  );
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
  await new Promise(() => {});
}

function hashFrontendSources(rootDir) {
  const hash = crypto.createHash("sha256");
  const walk = (targetPath) => {
    if (!fs.existsSync(targetPath)) return;
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(targetPath).sort();
      for (const entry of entries) {
        walk(path.join(targetPath, entry));
      }
    } else if (stat.isFile()) {
      hash.update(path.relative(rootDir, targetPath).replace(/\\/g, "/"));
      hash.update(fs.readFileSync(targetPath));
    }
  };

  walk(path.join(rootDir, "src"));
  walk(path.join(rootDir, "public"));
  walk(path.join(rootDir, "index.html"));
  walk(path.join(rootDir, "package.json"));
  walk(path.join(rootDir, "vite.config.ts"));
  return hash.digest("hex");
}

const forceRebuild = process.argv.includes("--force");
const stampPath = path.join(os.tmpdir(), "gfm-limpeza-build-stamp.json");
const outEntry = path.join(__dirname, "dist", "public", "assets", "index.js");
const outHtml = path.join(__dirname, "dist", "public", "index.html");
const sourceHash = hashFrontendSources(__dirname);

// Evita executar dois builds consecutivos idênticos (ex.: npm postinstall + npm run build no deploy)
if (!forceRebuild && fs.existsSync(outEntry) && fs.existsSync(outHtml) && fs.existsSync(stampPath)) {
  try {
    const stamp = JSON.parse(fs.readFileSync(stampPath, "utf-8"));
    const ageMs = Date.now() - Number(stamp?.builtAt || 0);
    if (stamp?.hash === sourceHash && ageMs >= 0 && ageMs < 180_000) {
      console.log(
        `[Limpeza Build] Build idêntico já concluído há ${(ageMs / 1000).toFixed(1)}s — pulando rebuild duplicado.`
      );
      process.exit(0);
    }
  } catch {
    // Segue para build completo se o carimbo estiver inválido
  }
}

process.env.NODE_ENV = "production";
console.log(`[Limpeza Build] Heap limit: ${currentHeapLimitMB}MB | Iniciando Vite build...`);

const { build } = await import("vite");
await build({
  configFile: path.resolve(__dirname, "vite.config.ts"),
  mode: "production",
});

try {
  fs.writeFileSync(
    stampPath,
    JSON.stringify({ hash: sourceHash, builtAt: Date.now() }),
    "utf-8"
  );
} catch {
  // Não bloqueia caso tmpdir esteja indisponível
}

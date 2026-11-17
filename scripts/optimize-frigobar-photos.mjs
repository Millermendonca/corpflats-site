#!/usr/bin/env node
/**
 * Pipeline estático de otimização das fotos do Cardápio Digital do Frigobar (AVIF + WebP + PNG otimizado).
 * Preserva 100% dos caminhos .png originais em /images/frigobar/ (compatibilidade total com banco,
 * catálogo de homologação e auditorias) e gera variantes leves para <picture> (160w, 512w, 1024w).
 */
import { spawnSync } from "child_process";
import fs from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const frigobarDir = path.join(projectRoot, "artifacts", "limpeza", "public", "images", "frigobar");

const require = createRequire(import.meta.url);

function tryResolveSharp() {
  try {
    return require("sharp");
  } catch {}

  const pathDirs = String(process.env.PATH || "").split(path.delimiter);
  for (const dir of pathDirs) {
    if (dir.includes("_npx")) {
      const candidate = path.resolve(dir, "..", "sharp");
      if (fs.existsSync(candidate)) {
        try {
          return require(candidate);
        } catch {}
      }
    }
  }

  const npxCacheRoot = path.join(
    process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local"),
    "npm-cache",
    "_npx"
  );
  if (fs.existsSync(npxCacheRoot)) {
    for (const hashDir of fs.readdirSync(npxCacheRoot)) {
      const candidate = path.join(npxCacheRoot, hashDir, "node_modules", "sharp");
      if (fs.existsSync(candidate)) {
        try {
          return require(candidate);
        } catch {}
      }
    }
  }
  return null;
}

let sharp = tryResolveSharp();
if (!sharp) {
  if (process.env.CF_SHARP_BOOTSTRAPPED === "1") {
    console.error("Falha ao carregar sharp para otimização das fotos do frigobar.");
    process.exit(1);
  }
  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const res = spawnSync(
    npxCmd,
    ["--yes", "--package=sharp@0.33.5", "node", __filename],
    {
      stdio: "inherit",
      env: { ...process.env, CF_SHARP_BOOTSTRAPPED: "1" },
      shell: process.platform === "win32",
    }
  );
  process.exit(res.status ?? 1);
}

const VARIANTS = [
  { width: 160, webpQuality: 78, avifQuality: 48 },
  { width: 512, webpQuality: 80, avifQuality: 50 },
  { width: 1024, webpQuality: 82, avifQuality: 52 },
];

async function run() {
  if (!fs.existsSync(frigobarDir)) {
    throw new Error(`Diretório não encontrado: ${frigobarDir}`);
  }

  const pngFiles = fs
    .readdirSync(frigobarDir)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort();

  let totalOrigPngBytes = 0;
  let totalOptPngBytes = 0;
  let totalThumb160AvifBytes = 0;
  let totalThumb160WebpBytes = 0;
  let generatedFiles = 0;

  for (const file of pngFiles) {
    const base = file.replace(/\.png$/i, "");
    const srcPath = path.join(frigobarDir, file);
    const srcBuf = fs.readFileSync(srcPath);
    totalOrigPngBytes += srcBuf.length;

    for (const { width, webpQuality, avifQuality } of VARIANTS) {
      const resizedPipeline = () =>
        sharp(srcBuf)
          .rotate()
          .resize({
            width,
            height: width,
            fit: "contain",
            background: { r: 255, g: 255, b: 255, alpha: 1 },
            withoutEnlargement: true,
          });

      const webpOut = path.join(frigobarDir, `${base}-${width}w.webp`);
      await resizedPipeline().webp({ quality: webpQuality, effort: 5 }).toFile(webpOut);
      generatedFiles++;
      if (width === 160) totalThumb160WebpBytes += fs.statSync(webpOut).size;

      const avifOut = path.join(frigobarDir, `${base}-${width}w.avif`);
      await resizedPipeline().avif({ quality: avifQuality, effort: 5 }).toFile(avifOut);
      generatedFiles++;
      if (width === 160) totalThumb160AvifBytes += fs.statSync(avifOut).size;
    }

    // Otimiza o fallback .png in-place apenas se ainda estiver pesado (> 480 KB), mantendo 1024x1024
    if (srcBuf.length > 480 * 1024) {
      const optPngBuf = await sharp(srcBuf)
        .png({ compressionLevel: 9, palette: true, quality: 92, effort: 8 })
        .toBuffer();
      if (optPngBuf.length < srcBuf.length) {
        fs.writeFileSync(srcPath, optPngBuf);
        totalOptPngBytes += optPngBuf.length;
      } else {
        totalOptPngBytes += srcBuf.length;
      }
    } else {
      totalOptPngBytes += srcBuf.length;
    }
  }

  console.log("======================================================================");
  console.log(`  Cardápio Frigobar: ${pngFiles.length} produtos otimizados (${generatedFiles} variantes AVIF/WebP)`);
  console.log(
    `  PNGs originais: ${(totalOrigPngBytes / 1024 / 1024).toFixed(2)} MB -> Fallback PNG otimizado: ${(
      totalOptPngBytes /
      1024 /
      1024
    ).toFixed(2)} MB`
  );
  console.log(
    `  40 Thumbs 160w totais: ${(totalThumb160AvifBytes / 1024).toFixed(1)} KB (AVIF) | ${(
      totalThumb160WebpBytes / 1024
    ).toFixed(1)} KB (WebP)`
  );
  console.log("======================================================================");
}

run().catch((err) => {
  console.error("Erro na otimização de fotos do frigobar:", err);
  process.exit(1);
});

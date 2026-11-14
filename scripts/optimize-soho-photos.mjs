#!/usr/bin/env node
/**
 * Pipeline estático de otimização de fotos do Edifício Soho Residence (AVIF + WebP).
 * Mantém 100% dos arquivos .jpg originais intactos (compatibilidade OpenGraph / WhatsApp / Meta Ads)
 * e gera variantes responsivas para <picture> + <link rel="preload"> sem peso em runtime no Render.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const sohoDir = path.join(projectRoot, "artifacts", "limpeza", "public", "photos", "soho");

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
    console.error("Falha ao carregar sharp para otimização de imagens.");
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

// 5 fotos Hero LCP das 5 páginas públicas (recebem AVIF + WebP em 640w, 1024w e 1600w)
const HERO_BASES = new Set([
  "hero-jacuzzi-cobertura",
  "01-quarto-bancada",
  "06-cobertura-jacuzzi",
  "02-flat-integrado",
  "04-cozinha-equipada",
]);

// Todas as 14 fotos principais (Hero + 13 da galeria) recebem WebP responsivo + thumb 320w
const GALLERY_AND_HERO_BASES = [
  "hero-jacuzzi-cobertura",
  "01-quarto-bancada",
  "02-flat-integrado",
  "03-mesa-jantar",
  "04-cozinha-equipada",
  "05-banheiro",
  "06-cobertura-jacuzzi",
  "07-terraco-panoramico",
  "08-spa-saunas",
  "09-academia",
  "10-sala-de-jogos",
  "11-lobby-elevadores",
  "12-fachada-garagem",
  "cafe-mesa-quarto",
];

const RESPONSIVE_WIDTHS = [640, 1024, 1600];

async function run() {
  if (!fs.existsSync(sohoDir)) {
    throw new Error(`Diretório não encontrado: ${sohoDir}`);
  }

  let generatedCount = 0;
  let totalGeneratedBytes = 0;

  for (const base of GALLERY_AND_HERO_BASES) {
    const srcPath = path.join(sohoDir, `${base}.jpg`);
    if (!fs.existsSync(srcPath)) {
      console.warn(`[WARN] Arquivo base ausente: ${srcPath}`);
      continue;
    }

    const srcBuf = fs.readFileSync(srcPath);
    const isHero = HERO_BASES.has(base);

    // Miniatura 320w em WebP para grade da galeria
    const thumbOut = path.join(sohoDir, `${base}-320w.webp`);
    await sharp(srcBuf)
      .rotate()
      .resize({ width: 320, withoutEnlargement: true })
      .webp({ quality: 74, effort: 5 })
      .toFile(thumbOut);
    generatedCount++;
    totalGeneratedBytes += fs.statSync(thumbOut).size;

    // Variantes responsivas 640w, 1024w, 1600w
    for (const width of RESPONSIVE_WIDTHS) {
      const webpOut = path.join(sohoDir, `${base}-${width}w.webp`);
      await sharp(srcBuf)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 76, effort: 5 })
        .toFile(webpOut);
      generatedCount++;
      totalGeneratedBytes += fs.statSync(webpOut).size;

      if (isHero) {
        const avifOut = path.join(sohoDir, `${base}-${width}w.avif`);
        await sharp(srcBuf)
          .rotate()
          .resize({ width, withoutEnlargement: true })
          .avif({ quality: 52, effort: 5 })
          .toFile(avifOut);
        generatedCount++;
        totalGeneratedBytes += fs.statSync(avifOut).size;
      }
    }
  }

  // Miniatura dedicada para o selo de Café da Manhã acima da dobra + preview ampliado
  const cafeCloseSrc = path.join(sohoDir, "cafe-mesa-close.jpg");
  if (fs.existsSync(cafeCloseSrc)) {
    const cafeBuf = fs.readFileSync(cafeCloseSrc);
    for (const [w, q] of [
      [160, 76],
      [640, 78],
    ]) {
      const outPath = path.join(sohoDir, `cafe-mesa-close-${w}w.webp`);
      await sharp(cafeBuf)
        .rotate()
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: q, effort: 5 })
        .toFile(outPath);
      generatedCount++;
      totalGeneratedBytes += fs.statSync(outPath).size;
    }
  }

  const heroOrigKb = (fs.statSync(path.join(sohoDir, "hero-jacuzzi-cobertura.jpg")).size / 1024).toFixed(1);
  const heroMobAvifKb = (fs.statSync(path.join(sohoDir, "hero-jacuzzi-cobertura-640w.avif")).size / 1024).toFixed(1);
  const heroDeskAvifKb = (fs.statSync(path.join(sohoDir, "hero-jacuzzi-cobertura-1600w.avif")).size / 1024).toFixed(1);
  const cafeOrigKb = (fs.statSync(cafeCloseSrc).size / 1024).toFixed(1);
  const cafeThumbKb = (fs.statSync(path.join(sohoDir, "cafe-mesa-close-160w.webp")).size / 1024).toFixed(1);

  console.log("=================================================================");
  console.log("  Otimização AVIF + WebP concluída (100% dos .jpg preservados)   ");
  console.log(`  Variantes geradas: ${generatedCount} arquivos (${(totalGeneratedBytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  Hero LCP: ${heroOrigKb} KB (.jpg) -> ${heroMobAvifKb} KB (640w.avif) | ${heroDeskAvifKb} KB (1600w.avif)`);
  console.log(`  Thumb Café: ${cafeOrigKb} KB (.jpg) -> ${cafeThumbKb} KB (160w.webp)`);
  console.log("=================================================================");
}

run().catch((err) => {
  console.error("Erro na otimização de fotos:", err);
  process.exit(1);
});

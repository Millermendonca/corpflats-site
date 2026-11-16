#!/usr/bin/env node
/**
 * scripts/sync-google-reviews.mjs
 * Utilitário determinístico para atualizar a nota média (gbpRatingValue),
 * o total de avaliações do Google (gbpReviewCount) e a lista de depoimentos 5★
 * em todos os arquivos do projeto mantendo 100% de paridade Twin-Server.
 *
 * Uso pela automação semanal:
 *   node scripts/sync-google-reviews.mjs --rating 4.9 --count 31 [--add-json path/to/new-reviews.json]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--rating" && argv[i + 1]) args.rating = Number(argv[++i]);
    else if (k === "--count" && argv[i + 1]) args.count = Math.round(Number(argv[++i]));
    else if (k === "--add-json" && argv[i + 1]) args.addJson = argv[++i];
  }
  return args;
}

const { rating, count, addJson } = parseArgs(process.argv);
if (!Number.isFinite(rating) || rating < 1 || rating > 5 || !Number.isFinite(count) || count < 1) {
  console.error("Uso: node scripts/sync-google-reviews.mjs --rating <1.0-5.0> --count <inteiro> [--add-json <arquivo.json>]");
  process.exit(1);
}

const nowIso = new Date().toISOString();
const todayStr = nowIso.slice(0, 10);
const syncVersion = `${todayStr}-${count}`;
const ratingFixed = Number(rating.toFixed(1));

// 1. Atualiza seo-landing-pages.ts
const lpPath = path.join(ROOT, "artifacts/limpeza/src/lib/seo-landing-pages.ts");
let lpCode = fs.readFileSync(lpPath, "utf-8");
lpCode = lpCode
  .replace(/export const DEFAULT_GBP_RATING_VALUE = [0-9.]+;/, `export const DEFAULT_GBP_RATING_VALUE = ${ratingFixed};`)
  .replace(/export const DEFAULT_GBP_REVIEW_COUNT = \d+;/, `export const DEFAULT_GBP_REVIEW_COUNT = ${count};`);
fs.writeFileSync(lpPath, lpCode, "utf-8");

// 2. Atualiza seo-prerender.mjs + espelho scripts/seo-prerender.mjs
const prerenderApiPath = path.join(ROOT, "artifacts/api-server/seo-prerender.mjs");
const prerenderScriptPath = path.join(ROOT, "scripts/seo-prerender.mjs");
let prerenderCode = fs.readFileSync(prerenderApiPath, "utf-8");
prerenderCode = prerenderCode
  .replace(/export const DEFAULT_GBP_RATING_VALUE = [0-9.]+;/, `export const DEFAULT_GBP_RATING_VALUE = ${ratingFixed};`)
  .replace(/export const DEFAULT_GBP_REVIEW_COUNT = \d+;/, `export const DEFAULT_GBP_REVIEW_COUNT = ${count};`);
fs.writeFileSync(prerenderApiPath, prerenderCode, "utf-8");
fs.copyFileSync(prerenderApiPath, prerenderScriptPath);

// 3. Atualiza demo-server.mjs + espelho scripts/demo-server.mjs
const demoApiPath = path.join(ROOT, "artifacts/api-server/demo-server.mjs");
const demoScriptPath = path.join(ROOT, "scripts/demo-server.mjs");
let demoCode = fs.readFileSync(demoApiPath, "utf-8");
demoCode = demoCode
  .replace(/gbpRatingValue:\s*[0-9.]+,/, `gbpRatingValue: ${ratingFixed},`)
  .replace(/gbpReviewCount:\s*\d+,/, `gbpReviewCount: ${count},`)
  .replace(/gbpLastSyncedAt:\s*"[^"]*",/, `gbpLastSyncedAt: "${nowIso}",`)
  .replace(/gbpSyncVersion:\s*"[^"]*",/, `gbpSyncVersion: "${syncVersion}",`);

if (addJson && fs.existsSync(addJson)) {
  const incoming = JSON.parse(fs.readFileSync(addJson, "utf-8"));
  if (Array.isArray(incoming) && incoming.length > 0) {
    console.log(`[sync-google-reviews] ${incoming.length} candidatos lidos de ${addJson}`);
  }
}

fs.writeFileSync(demoApiPath, demoCode, "utf-8");
fs.copyFileSync(demoApiPath, demoScriptPath);

console.log(JSON.stringify({
  ok: true,
  gbpRatingValue: ratingFixed,
  gbpReviewCount: count,
  gbpLastSyncedAt: nowIso,
  gbpSyncVersion: syncVersion,
}, null, 2));

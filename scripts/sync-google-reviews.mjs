#!/usr/bin/env node
/**
 * scripts/sync-google-reviews.mjs
 * Utilitário determinístico para consultar (--status) ou atualizar (--rating / --count / --add-json)
 * a nota média oficial do Google, o total de avaliações e novos depoimentos 5★ verificados,
 * mantendo 100% de paridade Twin-Server entre artifacts/api-server/ e scripts/.
 *
 * Exemplos:
 *   node scripts/sync-google-reviews.mjs --status
 *   node scripts/sync-google-reviews.mjs --rating 4.9 --count 31 --add-json path/to/new-reviews.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const lpPath = path.join(ROOT, "artifacts/limpeza/src/lib/seo-landing-pages.ts");
const prerenderApiPath = path.join(ROOT, "artifacts/api-server/seo-prerender.mjs");
const prerenderScriptPath = path.join(ROOT, "scripts/seo-prerender.mjs");
const demoApiPath = path.join(ROOT, "artifacts/api-server/demo-server.mjs");
const demoScriptPath = path.join(ROOT, "scripts/demo-server.mjs");
const bookingEnginePath = path.join(ROOT, "artifacts/limpeza/src/pages/booking-engine.tsx");

function parseArgs(argv) {
  const args = { status: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--status") args.status = true;
    else if (k === "--rating" && argv[i + 1]) args.rating = Number(argv[++i]);
    else if (k === "--count" && argv[i + 1]) args.count = Math.round(Number(argv[++i]));
    else if (k === "--add-json" && argv[i + 1]) args.addJson = argv[++i];
  }
  return args;
}

function readCurrentStatus() {
  const lpCode = fs.readFileSync(lpPath, "utf-8");
  const ratingMatch = lpCode.match(/export const DEFAULT_GBP_RATING_VALUE = ([0-9.]+);/);
  const countMatch = lpCode.match(/export const DEFAULT_GBP_REVIEW_COUNT = (\d+);/);

  const prerenderCode = fs.readFileSync(prerenderApiPath, "utf-8");
  const blockMatch = prerenderCode.match(/const DEFAULT_FALLBACK_TESTIMONIALS = \[([\s\S]*?)\n\];/);
  const existingAuthors = [];
  if (blockMatch) {
    const nameRegex = /name:\s*"([^"]+)"/g;
    let m;
    while ((m = nameRegex.exec(blockMatch[1])) !== null) {
      existingAuthors.push(m[1]);
    }
  }

  return {
    gbpRatingValue: ratingMatch ? Number(ratingMatch[1]) : null,
    gbpReviewCount: countMatch ? Number(countMatch[1]) : null,
    existingCount: existingAuthors.length,
    existingAuthors,
  };
}

const args = parseArgs(process.argv);

if (args.status) {
  console.log(JSON.stringify(readCurrentStatus(), null, 2));
  process.exit(0);
}

const { rating, count, addJson } = args;
if (!Number.isFinite(rating) || rating < 1 || rating > 5 || !Number.isFinite(count) || count < 1) {
  console.error("Uso: node scripts/sync-google-reviews.mjs --status | --rating <1.0-5.0> --count <inteiro> [--add-json <arquivo.json>]");
  process.exit(1);
}

const current = readCurrentStatus();
const existingLower = new Set(current.existingAuthors.map((n) => n.trim().toLowerCase()));

let newReviewsToAdd = [];
if (addJson && fs.existsSync(addJson)) {
  const raw = JSON.parse(fs.readFileSync(addJson, "utf-8"));
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const name = String(item?.name || "").trim();
      const comment = String(item?.comment || "").trim();
      const itemRating = Number(item?.rating ?? 5);
      if (
        name &&
        comment.length >= 12 &&
        itemRating === 5 &&
        !/^testando$/i.test(name) &&
        !existingLower.has(name.toLowerCase())
      ) {
        existingLower.add(name.toLowerCase());
        newReviewsToAdd.push({
          name,
          city: "Avaliação 5★ no Google",
          rating: 5,
          comment: comment.replace(/\s+/g, " "),
        });
      }
    }
  }
}

const nowIso = new Date().toISOString();
const todayStr = nowIso.slice(0, 10);
const syncVersion = `${todayStr}-${count}-${current.existingCount + newReviewsToAdd.length}`;
const ratingFixed = Number(rating.toFixed(1));

// 1. Atualiza seo-landing-pages.ts
let lpCode = fs.readFileSync(lpPath, "utf-8");
lpCode = lpCode
  .replace(/export const DEFAULT_GBP_RATING_VALUE = [0-9.]+;/, `export const DEFAULT_GBP_RATING_VALUE = ${ratingFixed};`)
  .replace(/export const DEFAULT_GBP_REVIEW_COUNT = \d+;/, `export const DEFAULT_GBP_REVIEW_COUNT = ${count};`);
fs.writeFileSync(lpPath, lpCode, "utf-8");

// 2. Atualiza seo-prerender.mjs + espelho scripts/seo-prerender.mjs
let prerenderCode = fs.readFileSync(prerenderApiPath, "utf-8");
prerenderCode = prerenderCode
  .replace(/export const DEFAULT_GBP_RATING_VALUE = [0-9.]+;/, `export const DEFAULT_GBP_RATING_VALUE = ${ratingFixed};`)
  .replace(/export const DEFAULT_GBP_REVIEW_COUNT = \d+;/, `export const DEFAULT_GBP_REVIEW_COUNT = ${count};`);

if (newReviewsToAdd.length > 0) {
  let nextId = current.existingCount + 1;
  const entriesStr = newReviewsToAdd
    .map(
      (r) => `  {\n    id: ${nextId++},\n    name: ${JSON.stringify(r.name)},\n    city: "Avaliação 5★ no Google",\n    rating: 5,\n    comment: ${JSON.stringify(r.comment)},\n  },`
    )
    .join("\n");
  prerenderCode = prerenderCode.replace(
    /(const DEFAULT_FALLBACK_TESTIMONIALS = \[[\s\S]*?)(\n\];)/,
    `$1\n${entriesStr}$2`
  );
}
fs.writeFileSync(prerenderApiPath, prerenderCode, "utf-8");
fs.copyFileSync(prerenderApiPath, prerenderScriptPath);

// 3. Atualiza demo-server.mjs + espelho scripts/demo-server.mjs
let demoCode = fs.readFileSync(demoApiPath, "utf-8");
demoCode = demoCode
  .replace(/gbpRatingValue:\s*[0-9.]+,/, `gbpRatingValue: ${ratingFixed},`)
  .replace(/gbpReviewCount:\s*\d+,/, `gbpReviewCount: ${count},`)
  .replace(/gbpLastSyncedAt:\s*"[^"]*",/, `gbpLastSyncedAt: "${nowIso}",`)
  .replace(/gbpSyncVersion:\s*"[^"]*",/, `gbpSyncVersion: "${syncVersion}",`);

if (newReviewsToAdd.length > 0) {
  let nextId = current.existingCount + 1;
  const demoEntries = newReviewsToAdd
    .map(
      (r) => `    {\n      id: ${nextId++},\n      name: ${JSON.stringify(r.name)},\n      city: "Avaliação 5★ no Google",\n      rating: 5,\n      comment: ${JSON.stringify(r.comment)},\n      avatar: ""\n    }`
    )
    .join(",\n");
  demoCode = demoCode.replace(
    /(gbpSyncVersion:\s*"[^"]*",\s*testimonials:\s*\[[\s\S]*?)(\n  \],)/,
    `$1,\n${demoEntries}$2`
  );
}
fs.writeFileSync(demoApiPath, demoCode, "utf-8");
fs.copyFileSync(demoApiPath, demoScriptPath);

// 4. Atualiza booking-engine.tsx se houver novos comentários
if (newReviewsToAdd.length > 0) {
  let beCode = fs.readFileSync(bookingEnginePath, "utf-8");
  let nextId = current.existingCount + 1;
  const beEntries = newReviewsToAdd
    .map(
      (r) => `    {\n      id: ${nextId++},\n      name: ${JSON.stringify(r.name)},\n      city: "Avaliação 5★ no Google",\n      rating: 5,\n      comment: ${JSON.stringify(r.comment)}\n    }`
    )
    .join(",\n");
  beCode = beCode.replace(
    /(const DEFAULT_GOOGLE_TESTIMONIALS = \[[\s\S]*?)(\n  \])/,
    `$1,\n${beEntries}$2`
  );
  fs.writeFileSync(bookingEnginePath, beCode, "utf-8");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      gbpRatingValue: ratingFixed,
      gbpReviewCount: count,
      addedTestimonialsCount: newReviewsToAdd.length,
      addedAuthors: newReviewsToAdd.map((r) => r.name),
      gbpLastSyncedAt: nowIso,
      gbpSyncVersion: syncVersion,
    },
    null,
    2
  )
);

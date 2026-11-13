import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

console.log("================================================================================");
console.log(" CHALLENGER 2: CATALOG & ROUTE CORRESPONDENCE AUDIT");
console.log("================================================================================");

const pagesDir = path.resolve(process.cwd(), "artifacts/limpeza/src/pages");
const pageFiles = fs.readdirSync(pagesDir).filter(f => f.endsWith(".tsx")).sort();

console.log(`[1] Total .tsx files found in artifacts/limpeza/src/pages: ${pageFiles.length}`);

// 1. Verify exact count
const functionalPages = pageFiles.filter(f => f !== "not-found.tsx");
console.log(`[2] Functional pages (excluding not-found.tsx): ${functionalPages.length}`);
assert.strictEqual(functionalPages.length, 45, "Expected exactly 45 functional pages in src/pages!");

// Parse SCREEN_CATALOG from e2e/suites/01-crawler-45-screens.spec.mjs safely
const crawlerSpecContent = fs.readFileSync(path.resolve(process.cwd(), "e2e/suites/01-crawler-45-screens.spec.mjs"), "utf8");

// Extract individual screen objects: { id: ..., name: ..., route: ..., persona: ..., ... }
const screenRegex = /\{\s*id:\s*(\d+),\s*name:\s*["']([^"']+)["'],\s*route:\s*["']([^"']+)["'],\s*persona:\s*["']([^"']+)["']/g;
const catalog = [];
let match;
while ((match = screenRegex.exec(crawlerSpecContent)) !== null) {
  catalog.push({
    id: parseInt(match[1], 10),
    name: match[2],
    route: match[3],
    persona: match[4]
  });
}

console.log(`[3] Total screens parsed from 01-crawler-45-screens.spec.mjs: ${catalog.length}`);
assert.strictEqual(catalog.length, 46, "Expected 46 entries (45 functional + 1 404) in SCREEN_CATALOG!");

// 2. Verify all screen IDs are unique and sequential from 1 to 46
const ids = catalog.map(s => s.id);
assert.strictEqual(new Set(ids).size, 46, "Duplicate screen IDs found in SCREEN_CATALOG!");
for (let i = 1; i <= 46; i++) {
  assert.ok(ids.includes(i), `Screen ID ${i} missing from SCREEN_CATALOG!`);
}

// 3. Verify App.tsx routing coverage
const appTsx = fs.readFileSync(path.resolve(process.cwd(), "artifacts/limpeza/src/App.tsx"), "utf8");

// Parse imports in App.tsx
const importRegex = /import\s+(\w+)\s+from\s+['"]@\/pages\/([^'"]+)['"]/g;
const imports = new Map();
while ((match = importRegex.exec(appTsx)) !== null) {
  imports.set(match[1], match[2] + ".tsx");
}

console.log(`[4] Total page imports found in App.tsx: ${imports.size}`);
for (const file of pageFiles) {
  const isImported = Array.from(imports.values()).includes(file);
  assert.ok(isImported, `Page file ${file} is NOT imported in App.tsx!`);
}

// 4. Verify each catalog route matches a defined route in App.tsx
console.log("\n[5] Auditing each catalog route against App.tsx route definitions:");
for (const screen of catalog) {
  const baseRoute = screen.route.split("/:")[0].split("/tok_")[0].split("/RES-")[0];
  const hasRouteInApp = appTsx.includes(`path="${baseRoute}`) || 
                        appTsx.includes(`path="${screen.route}`) ||
                        (screen.id === 46 && appTsx.includes("NotFound"));
  
  if (!hasRouteInApp) {
    console.error(`[-] Route mismatch for Screen ${screen.id}: ${screen.name} (${screen.route})`);
  }
  assert.ok(hasRouteInApp, `Route ${screen.route} for Screen ${screen.id} is not mapped in App.tsx!`);
  console.log(`  ✓ [Screen ${String(screen.id).padStart(2, "0")}] ${screen.name.padEnd(45)} -> ${screen.route} [${screen.persona}]`);
}

console.log("\n================================================================================");
console.log(" AUDIT PASSED: 100% 45-SCREEN CATALOG & ROUTING CORRESPONDENCE VERIFIED");
console.log("================================================================================");

#!/usr/bin/env node
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const ARTIFACTS_ROOT = path.join(projectRoot, "artifacts", "api-server");
const SCRIPTS_ROOT = path.join(projectRoot, "scripts");

/**
 * Diretórios que nunca devem ser escaneados como código de runtime.
 */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".replit-artifact",
  "certs",
  "uploads",
  "secure_uploads",
  "src",
  "dist"
]);

/**
 * Scripts avulsos em artifacts/api-server/ que são ferramentas de build ou dev local,
 * não integrados ao runtime do servidor.
 */
const EXCLUDED_NON_TWIN_FILES = new Set([
  "build.mjs",
  "inspect-sheet.mjs",
  "sync-watcher.mjs"
]);

function computeSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}

/**
 * Varre recursivamente o diretório de origem descobrindo dinamicamente todos
 * os arquivos .mjs pertencentes ao runtime do servidor.
 */
function discoverTwinFiles(dir, baseDir = dir) {
  let entries = [];
  if (!fs.existsSync(dir)) return entries;
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    if (item.isDirectory()) {
      if (IGNORED_DIRS.has(item.name)) continue;
      entries = entries.concat(discoverTwinFiles(path.join(dir, item.name), baseDir));
    } else if (item.isFile() && item.name.endsWith(".mjs")) {
      const rel = path.relative(baseDir, path.join(dir, item.name)).replace(/\\/g, "/");
      if (EXCLUDED_NON_TWIN_FILES.has(rel)) continue;
      entries.push(rel);
    }
  }
  return entries;
}

/**
 * Valida a integridade das importações estáticas locais de demo-server.mjs,
 * garantindo que nenhum módulo importado falte em artifacts/ ou scripts/.
 */
function validateStaticImports() {
  const issues = [];
  const entryPoints = [
    { art: "artifacts/api-server/demo-server.mjs", scr: "scripts/demo-server.mjs" }
  ];

  for (const ep of entryPoints) {
    const artFullPath = path.join(projectRoot, ep.art);
    if (!fs.existsSync(artFullPath)) continue;
    const content = fs.readFileSync(artFullPath, "utf8");
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/(?:from|import)\s+["'](\.[^"']+)["']/);
      if (match) {
        const importRel = match[1];
        const artTarget = path.normalize(path.join(path.dirname(artFullPath), importRel));
        const scrTarget = path.normalize(path.join(path.dirname(path.join(projectRoot, ep.scr)), importRel));

        if (!fs.existsSync(artTarget)) {
          issues.push({ entryPoint: ep.art, line: i + 1, importPath: importRel, missingIn: "artifacts", targetPath: artTarget });
        }
        if (!fs.existsSync(scrTarget)) {
          issues.push({ entryPoint: ep.scr, line: i + 1, importPath: importRel, missingIn: "scripts", targetPath: scrTarget });
        }
      }
    }
  }
  return issues;
}

/**
 * Executa a auditoria completa de paridade twin-server.
 */
export function checkTwinParity() {
  const relFiles = discoverTwinFiles(ARTIFACTS_ROOT).sort();
  const results = [];
  let allPass = true;

  for (const rel of relFiles) {
    const artPath = path.join(ARTIFACTS_ROOT, rel);
    const scrPath = path.join(SCRIPTS_ROOT, rel);

    const artRel = path.relative(projectRoot, artPath).replace(/\\/g, "/");
    const scrRel = path.relative(projectRoot, scrPath).replace(/\\/g, "/");

    if (!fs.existsSync(artPath)) {
      results.push({
        pair: [artRel, scrRel],
        file: rel,
        pass: false,
        error: `Origem não existe: artifacts/api-server/${rel}`
      });
      allPass = false;
      continue;
    }

    if (!fs.existsSync(scrPath)) {
      results.push({
        pair: [artRel, scrRel],
        file: rel,
        pass: false,
        error: `Destino ausente em scripts/: scripts/${rel}`
      });
      allPass = false;
      continue;
    }

    const hashArt = computeSha256(artPath);
    const hashScr = computeSha256(scrPath);
    const match = hashArt === hashScr;

    if (!match) allPass = false;

    results.push({
      pair: [artRel, scrRel],
      file: rel,
      pass: match,
      hashArt: hashArt.substring(0, 12),
      hashScr: hashScr.substring(0, 12),
      fullHashArt: hashArt,
      fullHashScr: hashScr
    });
  }

  // Checagem de integridade de imports
  const importIssues = validateStaticImports();
  if (importIssues.length > 0) {
    allPass = false;
  }

  const passCount = results.filter(r => r.pass).length;
  const missingCount = results.filter(r => r.error && r.error.includes("Destino ausente")).length;
  const mismatchCount = results.filter(r => !r.pass && !r.error).length;

  return {
    allPass,
    results,
    total: results.length,
    passCount,
    missingCount,
    mismatchCount,
    importIssues
  };
}

// Execução CLI direta
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  console.log("================================================================================");
  console.log("    CorpFlats Soho - Verificador Dinâmico de Paridade Twin-Server SHA-256       ");
  console.log("================================================================================");

  const { allPass, results, total, passCount, importIssues } = checkTwinParity();

  for (const r of results) {
    if (r.pass) {
      console.log(`[PASS] ${r.file.padEnd(50)} SHA: ${r.hashArt}...`);
    } else {
      console.error(`[FAIL] ${r.file.padEnd(50)} ${r.error || `Art: ${r.hashArt} != Scr: ${r.hashScr}`}`);
    }
  }

  if (importIssues && importIssues.length > 0) {
    console.log("--------------------------------------------------------------------------------");
    console.error("ERROS CRÍTICOS DE RESOLUÇÃO DE IMPORTS DETECTADOS:");
    for (const issue of importIssues) {
      console.error(` ❌ Linha ${issue.line} de ${issue.entryPoint}: import '${issue.importPath}' ausente em ${issue.missingIn} (${issue.targetPath})`);
    }
  }

  console.log("--------------------------------------------------------------------------------");
  console.log(`Resultado: ${passCount}/${total} arquivos de runtime auditados dinamicamente.`);
  console.log(allPass ? "STATUS: 100% PASS - Paridade perfeita restabelecida!" : "STATUS: FAIL - Discrepância ou dependência não resolvida!");
  console.log("================================================================================");

  process.exit(allPass ? 0 : 1);
}

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const pairs = [
  ['artifacts/api-server/demo-server.mjs', 'scripts/demo-server.mjs'],
  ['artifacts/api-server/wbp/client.mjs', 'scripts/wbp/client.mjs'],
  ['artifacts/api-server/wbp/storage.mjs', 'scripts/wbp/storage.mjs'],
  ['artifacts/api-server/wbp/config.mjs', 'scripts/wbp/config.mjs'],
  ['artifacts/api-server/wbp/availability.mjs', 'scripts/wbp/availability.mjs'],
  ['artifacts/api-server/wbp/pricing.mjs', 'scripts/wbp/pricing.mjs'],
  ['artifacts/api-server/wbp/ari-sync.mjs', 'scripts/wbp/ari-sync.mjs'],
  ['artifacts/api-server/wbp/inbox.mjs', 'scripts/wbp/inbox.mjs'],
  ['artifacts/api-server/wbp/callbacks.mjs', 'scripts/wbp/callbacks.mjs'],
  ['artifacts/api-server/wbp/reconciler.mjs', 'scripts/wbp/reconciler.mjs'],
  ['artifacts/api-server/wbp/alerts.mjs', 'scripts/wbp/alerts.mjs'],
  ['artifacts/api-server/wbp/vault.mjs', 'scripts/wbp/vault.mjs'],
  ['artifacts/api-server/wbp/provisional.mjs', 'scripts/wbp/provisional.mjs'],
];

console.log('Total twin pairs listed:', pairs.length);
let allMatch = true;
pairs.forEach(([f1, f2], idx) => {
  const e1 = fs.existsSync(f1);
  const e2 = fs.existsSync(f2);
  if (!e1 || !e2) {
    console.error(`MISSING: Pair ${idx + 1}: ${f1} (exists=${e1}) vs ${f2} (exists=${e2})`);
    allMatch = false;
    return;
  }
  const h1 = sha256(f1);
  const h2 = sha256(f2);
  const match = (h1 === h2);
  console.log(`Pair ${idx + 1}: ${path.basename(f1)} -> ${match ? 'MATCH' : 'MISMATCH'} [${h1}]`);
  if (!match) {
    console.error(`  ${f1}: ${h1}`);
    console.error(`  ${f2}: ${h2}`);
    allMatch = false;
  }
});

console.log('FINAL VERDICT TWIN PARITY:', allMatch ? 'PASS (100% IDENTICAL)' : 'FAIL');
process.exit(allMatch ? 0 : 1);

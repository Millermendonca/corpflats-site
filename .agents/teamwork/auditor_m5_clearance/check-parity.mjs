import fs from 'node:fs';
import crypto from 'node:crypto';

const files = [
  'demo-server.mjs',
  'wbp/alerts.mjs',
  'wbp/ari-sync.mjs',
  'wbp/availability.mjs',
  'wbp/callbacks.mjs',
  'wbp/client.mjs',
  'wbp/config.mjs',
  'wbp/inbox.mjs',
  'wbp/pricing.mjs',
  'wbp/provisional.mjs',
  'wbp/reconciler.mjs',
  'wbp/storage.mjs',
  'wbp/vault.mjs'
];

let allMatch = true;
console.log('=== TWIN PARITY VERIFICATION (13 PAIRS) ===');
for (const rel of files) {
  const p1 = 'artifacts/api-server/' + rel;
  const p2 = 'scripts/' + rel;
  if (!fs.existsSync(p1)) {
    console.error('MISSING:', p1);
    allMatch = false;
    continue;
  }
  if (!fs.existsSync(p2)) {
    console.error('MISSING:', p2);
    allMatch = false;
    continue;
  }
  const buf1 = fs.readFileSync(p1);
  const buf2 = fs.readFileSync(p2);
  const h1 = crypto.createHash('sha256').update(buf1).digest('hex');
  const h2 = crypto.createHash('sha256').update(buf2).digest('hex');
  const match = h1 === h2 && buf1.equals(buf2);
  if (!match) allMatch = false;
  console.log(rel + ': ' + (match ? 'MATCH' : 'MISMATCH') + ' [SHA-256: ' + h1 + ']');
}
console.log('OVERALL 13/13 TWIN PARITY RESULT:', allMatch ? '100% IDENTICAL' : 'PARITY VIOLATION');
if (!allMatch) process.exit(1);

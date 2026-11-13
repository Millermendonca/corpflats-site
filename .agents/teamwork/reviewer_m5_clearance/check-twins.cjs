const fs = require('fs');
const crypto = require('crypto');

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

let allMatched = true;
files.forEach((f, idx) => {
  const p1 = 'artifacts/api-server/' + f;
  const p2 = 'scripts/' + f;
  if (!fs.existsSync(p1) || !fs.existsSync(p2)) {
    console.error('File missing:', f);
    allMatched = false;
    return;
  }
  const h1 = crypto.createHash('sha256').update(fs.readFileSync(p1)).digest('hex');
  const h2 = crypto.createHash('sha256').update(fs.readFileSync(p2)).digest('hex');
  const match = h1 === h2;
  if (!match) {
    allMatched = false;
    console.error(`MISMATCH: ${f}\n  artifacts: ${h1}\n  scripts:   ${h2}`);
  } else {
    console.log(`[${idx + 1}/13] ${f}: MATCH (${h1})`);
  }
});

if (!allMatched) {
  console.error('FAIL: Twin parity check failed!');
  process.exit(1);
} else {
  console.log('SUCCESS: All 13 twin pairs match 100% byte-for-byte.');
}

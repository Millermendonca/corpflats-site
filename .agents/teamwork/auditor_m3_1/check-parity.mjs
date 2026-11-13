import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function sha256(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

const dirArtifacts = path.resolve('artifacts/api-server');
const dirScripts = path.resolve('scripts');

// Key backend services that are mirrored
const keyMirrors = [
  'demo-server.mjs',
  'whatsapp-ai-service.mjs',
  'zapi-service.mjs',
  'fnrh-pdf-service.mjs',
  'fnrh-serpro-service.mjs',
  'mail-service.mjs',
  'storage-service.mjs'
];

console.log('=== KEY MIRRORED BACKEND SERVICES PARITY ===');
let allKeyMatch = true;
const results = [];

for (const file of keyMirrors) {
  const p1 = path.join(dirArtifacts, file);
  const p2 = path.join(dirScripts, file);
  const exists1 = fs.existsSync(p1);
  const exists2 = fs.existsSync(p2);
  
  if (!exists1 || !exists2) {
    results.push({ file, match: false, existsArtifacts: exists1, existsScripts: exists2 });
    allKeyMatch = false;
    continue;
  }
  
  const h1 = sha256(p1);
  const h2 = sha256(p2);
  const match = (h1 === h2);
  if (!match) allKeyMatch = false;
  
  results.push({
    file,
    match,
    sha256: h1
  });
}

console.table(results);
console.log('ALL KEY MIRRORS IDENTICAL:', allKeyMatch);
process.exit(allKeyMatch ? 0 : 1);

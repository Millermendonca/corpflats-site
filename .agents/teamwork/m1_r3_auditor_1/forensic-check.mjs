import fs from 'fs';
import path from 'path';

const projectRoot = 'c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager';
const targetFiles = [
  'artifacts/api-server/zapi-service.mjs',
  'scripts/zapi-service.mjs',
  'artifacts/api-server/whatsapp-ai-service.mjs',
  'scripts/whatsapp-ai-service.mjs',
  'artifacts/api-server/demo-server.mjs',
  'scripts/demo-server.mjs'
];

console.log('=== FORENSIC CODE INSPECTION ===');

for (const relPath of targetFiles) {
  const fullPath = path.join(projectRoot, relPath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');

  console.log(`\nInspecting ${relPath} (${lines.length} lines)...`);

  // Check for test bypasses or mock branches
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (/NODE_ENV\s*===?\s*['"]test['"]/i.test(line)) {
      console.log(`  [FLAG] NODE_ENV test check at line ${lineNum}: ${line.trim()}`);
    }
    if (/if\s*\(.*(mock|fake|bypass|dummy|test_mode).*\)/i.test(line)) {
      console.log(`  [FLAG] Potential mock branch at line ${lineNum}: ${line.trim()}`);
    }
    if (/return\s+(true|false|'ok'|"ok");?\s*\/\/\s*hack/i.test(line)) {
      console.log(`  [FLAG] Hardcoded return hack at line ${lineNum}: ${line.trim()}`);
    }
  });
}

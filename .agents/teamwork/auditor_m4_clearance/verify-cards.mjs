import fs from 'fs';
import path from 'path';

function checkCardPatterns(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false };
  const content = fs.readFileSync(filePath, 'utf8');
  
  // PAN regex: 13 to 19 consecutive digits that look like card numbers
  const panMatches = content.match(/\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|2[2-7][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g) || [];
  
  // Check for explicit cvv, cvc, security_code with 3-4 digits
  const cvvMatches = content.match(/"?(?:cvv|cvc|card_cvv|security_code)"?\s*[:=]\s*"?[0-9]{3,4}"?/gi) || [];
  
  // Check for CardNumber / cardNumber / pan properties with unmasked values (>4 digits)
  const explicitPanMatches = content.match(/"?(?:cardNumber|card_number|CardNumber|pan)"?\s*[:=]\s*"[0-9]{12,19}"/gi) || [];

  return {
    exists: true,
    size: content.length,
    panCount: panMatches.length,
    panSamples: panMatches.slice(0, 3),
    cvvCount: cvvMatches.length,
    cvvSamples: cvvMatches.slice(0, 3),
    explicitPanCount: explicitPanMatches.length,
    explicitPanSamples: explicitPanMatches.slice(0, 3)
  };
}

console.log('--- data/database.json ---');
console.log(JSON.stringify(checkCardPatterns('data/database.json'), null, 2));

console.log('--- artifacts/api-server/audit_logs.jsonl ---');
console.log(JSON.stringify(checkCardPatterns('artifacts/api-server/audit_logs.jsonl'), null, 2));

// Search for any other storage / state files
function findStateFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === 'node_modules' || item.name === '.git') continue;
      findStateFiles(fullPath, fileList);
    } else if (item.name.endsWith('.json') || item.name.endsWith('.jsonl') || item.name.endsWith('.log')) {
      if (item.name.includes('storage') || item.name.includes('wbp') || item.name.includes('state')) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

const stateFiles = findStateFiles('.');
console.log('--- State / Storage files found ---', stateFiles);
for (const sf of stateFiles) {
  console.log(`--- ${sf} ---`);
  console.log(JSON.stringify(checkCardPatterns(sf), null, 2));
}

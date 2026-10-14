import fs from 'node:fs';
import path from 'node:path';

function luhnCheck(numStr) {
  const s = numStr.replace(/\D/g, '');
  if (s.length < 13 || s.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let digit = parseInt(s.charAt(i), 10);
    if (shouldDouble) {
      if ((digit *= 2) > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

const panRegex = /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/g;
const cvvRegex = /"(?:card_cvv|cvv|cvc|security_code)"\s*:\s*"?[0-9]{3,4}"?/i;

function scanFile(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false };
  const content = fs.readFileSync(filePath, 'utf8');
  const panMatches = content.match(panRegex) || [];
  const validLuhn = panMatches.filter(luhnCheck);
  const cvvMatch = content.match(cvvRegex);

  return {
    exists: true,
    size: content.length,
    rawPanMatchesCount: panMatches.length,
    validLuhnMatches: validLuhn,
    hasCvvMatch: !!cvvMatch,
    cvvSnippet: cvvMatch ? cvvMatch[0] : null
  };
}

console.log('=== PCI & CARD FORENSICS SCAN ===');

const filesToScan = [
  'data/database.json',
  'artifacts/api-server/audit_logs.jsonl'
];

if (fs.existsSync('data')) {
  const dataFiles = fs.readdirSync('data').map(f => path.join('data', f));
  for (const f of dataFiles) {
    if (!filesToScan.includes(f) && (f.endsWith('.json') || f.endsWith('.jsonl') || f.endsWith('.log'))) {
      filesToScan.push(f);
    }
  }
}

if (fs.existsSync('storage')) {
  const walk = (dir) => {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (full.endsWith('.json') || full.endsWith('.jsonl') || full.endsWith('.log')) filesToScan.push(full);
    }
  };
  walk('storage');
}

let anyViolation = false;
for (const f of filesToScan) {
  const result = scanFile(f);
  console.log(`FILE: ${f}`);
  console.log(`  Exists: ${result.exists}, Size: ${result.size}`);
  console.log(`  Valid Luhn PANs: ${JSON.stringify(result.validLuhnMatches)}`);
  console.log(`  CVV Pattern Match: ${result.hasCvvMatch} ${result.cvvSnippet || ''}`);

  if (result.validLuhnMatches.length > 0 || result.hasCvvMatch) {
    anyViolation = true;
  }
}

console.log('--- SUMMARY ---');
console.log(`TOTAL FILES SCANNED: ${filesToScan.length}`);
console.log(`ANY VIOLATIONS FOUND: ${anyViolation}`);

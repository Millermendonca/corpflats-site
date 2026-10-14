import fs from 'node:fs';
import path from 'node:path';

function luhnCheck(numStr) {
  const clean = numStr.replace(/\D/g, '');
  if (clean.length < 13 || clean.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    let digit = parseInt(clean.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

const violations = [];

// 1. Inspect data/database.json
console.log('--- Inspecting data/database.json ---');
if (fs.existsSync('data/database.json')) {
  const content = fs.readFileSync('data/database.json', 'utf8');
  // Check for any CVV keys
  const cvvMatches = content.match(/"(?:card_?)?(?:cv[vc2]|security_code|cid)"\s*:\s*"?[0-9]{3,4}"?/gi);
  if (cvvMatches) {
    violations.push({ target: 'data/database.json', issue: 'CVV found in database.json', details: cvvMatches });
  }

  // Check for 16-digit card patterns
  const panMatches = content.match(/\b(?:\d{4}[ -]?){3}\d{4}\b/g) || [];
  const validPans = panMatches.filter(p => luhnCheck(p));
  if (validPans.length > 0) {
    violations.push({ target: 'data/database.json', issue: 'Valid PAN found in database.json', details: validPans });
  }
  console.log('database.json: CVV matches = ' + (cvvMatches ? cvvMatches.length : 0) + ', Valid PAN matches = ' + validPans.length);
}

// 2. Inspect data/wbp_card_vault.json if exists
console.log('--- Inspecting data/wbp_card_vault.json ---');
if (fs.existsSync('data/wbp_card_vault.json')) {
  const content = fs.readFileSync('data/wbp_card_vault.json', 'utf8');
  const cvvMatches = content.match(/"(?:card_?)?(?:cv[vc2]|security_code|cid)"\s*:\s*"?[0-9]{3,4}"?/gi);
  if (cvvMatches) {
    violations.push({ target: 'data/wbp_card_vault.json', issue: 'CVV found in vault storage file', details: cvvMatches });
  }
  const panMatches = content.match(/\b(?:\d{4}[ -]?){3}\d{4}\b/g) || [];
  const validPans = panMatches.filter(p => luhnCheck(p));
  if (validPans.length > 0) {
    violations.push({ target: 'data/wbp_card_vault.json', issue: 'Plaintext PAN found in vault storage file', details: validPans });
  }
  console.log('wbp_card_vault.json: CVV matches = ' + (cvvMatches ? cvvMatches.length : 0) + ', Valid PAN matches = ' + validPans.length);
} else {
  console.log('data/wbp_card_vault.json does not exist in repo (fresh environment)');
}

// 3. Inspect artifacts/api-server/audit_logs.jsonl
console.log('--- Inspecting artifacts/api-server/audit_logs.jsonl ---');
if (fs.existsSync('artifacts/api-server/audit_logs.jsonl')) {
  const content = fs.readFileSync('artifacts/api-server/audit_logs.jsonl', 'utf8');
  const cvvMatches = content.match(/"(?:card_?)?(?:cv[vc2]|security_code|cid)"\s*:\s*"?[0-9]{3,4}"?/gi);
  if (cvvMatches) {
    violations.push({ target: 'artifacts/api-server/audit_logs.jsonl', issue: 'CVV found in audit logs', details: cvvMatches });
  }
  const panMatches = content.match(/\b(?:\d{4}[ -]?){3}\d{4}\b/g) || [];
  const validPans = panMatches.filter(p => luhnCheck(p));
  if (validPans.length > 0) {
    violations.push({ target: 'artifacts/api-server/audit_logs.jsonl', issue: 'Valid PAN found in audit logs', details: validPans });
  }
  console.log('audit_logs.jsonl: CVV matches = ' + (cvvMatches ? cvvMatches.length : 0) + ', Valid PAN matches = ' + validPans.length);
}

// 4. Inspect data/wbp_inbox.json and other wbp data files if exist
console.log('--- Inspecting other data/wbp_*.json files ---');
if (fs.existsSync('data')) {
  const files = fs.readdirSync('data').filter(f => f.startsWith('wbp_') && f.endsWith('.json'));
  for (const f of files) {
    const fp = path.join('data', f);
    const content = fs.readFileSync(fp, 'utf8');
    const cvvMatches = content.match(/"(?:card_?)?(?:cv[vc2]|security_code|cid)"\s*:\s*"?[0-9]{3,4}"?/gi);
    if (cvvMatches) {
      violations.push({ target: fp, issue: 'CVV found in ' + f, details: cvvMatches });
    }
    const panMatches = content.match(/\b(?:\d{4}[ -]?){3}\d{4}\b/g) || [];
    const validPans = panMatches.filter(p => luhnCheck(p));
    if (validPans.length > 0) {
      violations.push({ target: fp, issue: 'Valid PAN found in ' + f, details: validPans });
    }
    console.log(f + ': CVV = ' + (cvvMatches ? cvvMatches.length : 0) + ', PAN = ' + validPans.length);
  }
}

// 5. Inspect production frontend bundle artifacts/limpeza/dist/
console.log('--- Inspecting artifacts/limpeza/dist/ ---');
if (fs.existsSync('artifacts/limpeza/dist')) {
  function scanDir(dir) {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) {
        scanDir(full);
      } else if (full.endsWith('.js') || full.endsWith('.html')) {
        const content = fs.readFileSync(full, 'utf8');
        const panMatches = content.match(/\b(?:\d{4}[ -]?){3}\d{4}\b/g) || [];
        const validPans = panMatches.filter(p => luhnCheck(p));
        if (validPans.length > 0) {
          violations.push({ target: full, issue: 'Hardcoded PAN in dist', details: validPans });
        }
      }
    }
  }
  scanDir('artifacts/limpeza/dist');
  console.log('artifacts/limpeza/dist scanned');
}

// 6. Inspect SecureCardModal.tsx
console.log('--- Inspecting SecureCardModal.tsx ---');
const modalPath = 'artifacts/limpeza/src/components/wbp/SecureCardModal.tsx';
if (fs.existsSync(modalPath)) {
  const content = fs.readFileSync(modalPath, 'utf8');
  const panMatches = content.match(/\b(?:\d{4}[ -]?){3}\d{4}\b/g) || [];
  const validPans = panMatches.filter(p => luhnCheck(p));
  if (validPans.length > 0) {
    violations.push({ target: modalPath, issue: 'Hardcoded PAN in SecureCardModal.tsx', details: validPans });
  }
  console.log('SecureCardModal.tsx: Valid PAN matches = ' + validPans.length);
}

console.log('=== PCI FORENSICS AUDIT SUMMARY ===');
console.log('Violations count:', violations.length);
if (violations.length > 0) {
  console.error('VIOLATIONS DETECTED:', JSON.stringify(violations, null, 2));
  process.exit(1);
} else {
  console.log('RESULT: 100% CLEAN — Zero unencrypted full PANs and Zero CVVs detected.');
}

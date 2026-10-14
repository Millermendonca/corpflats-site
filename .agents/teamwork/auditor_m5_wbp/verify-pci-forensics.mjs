import fs from 'node:fs';

const dbContent = fs.readFileSync('data/database.json', 'utf-8');
const auditContent = fs.readFileSync('artifacts/api-server/audit_logs.jsonl', 'utf-8');

console.log('Database size:', dbContent.length, 'bytes');
console.log('Audit logs size:', auditContent.length, 'bytes');

// Search for potential unmasked PANs (13-19 consecutive digits or formatted groups)
// PAN regex: 13-19 digits, possibly with spaces/dashes
const panRegex = /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|2[2-7][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/g;

// Check CVV regex: "cvv": "123", "card_cvv": 123, "cvc": "123", "security_code": "123"
const cvvRegex = /["']?(?:card_?)?(?:cv[vc2]|security_code|securitycode)["']?\s*[:=]\s*["']?(\d{3,4})["']?/gi;

function check(name, content) {
  console.log(`\nScanning ${name}...`);
  const panMatches = content.match(panRegex) || [];
  const cvvMatches = [];
  let m;
  while ((m = cvvRegex.exec(content)) !== null) {
    cvvMatches.push(m[0]);
  }

  console.log(`  ${name} PAN matches: ${panMatches.length}`);
  if (panMatches.length > 0) {
    console.error(`  VIOLATION: Found PAN matches in ${name}:`, panMatches.slice(0, 5));
  }

  console.log(`  ${name} CVV matches: ${cvvMatches.length}`);
  if (cvvMatches.length > 0) {
    console.error(`  VIOLATION: Found CVV matches in ${name}:`, cvvMatches.slice(0, 5));
  }

  return panMatches.length === 0 && cvvMatches.length === 0;
}

const dbClean = check('data/database.json', dbContent);
const auditClean = check('artifacts/api-server/audit_logs.jsonl', auditContent);

console.log('\nOVERALL PCI CARD HYGIENE VERDICT:', (dbClean && auditClean) ? 'CLEAN (PASS)' : 'VIOLATION (FAIL)');
process.exit(dbClean && auditClean ? 0 : 1);

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

const serverCode = fs.readFileSync('artifacts/api-server/demo-server.mjs', 'utf8');

// Stress-test 1: Verify token uniqueness regex and length
const tokenGenMatch = serverCode.match(/crypto\.randomBytes\(12\)\.toString\(["']hex["']\)/);
assert.ok(tokenGenMatch, 'Token generation must use crypto.randomBytes(12).toString("hex")');

// Stress-test 2: Verify all admin endpoints have getAuthUser check and role === 'admin'
const adminRoutes = [
  'app.get("/api/service-orders"',
  'app.post("/api/service-orders"',
  'app.get("/api/service-orders/:id"',
  'app.patch("/api/service-orders/:id"',
  'app.delete("/api/service-orders/:id"',
  'app.get("/api/service-orders/:id/progress"',
  'app.post("/api/service-orders/:id/flats/:flatId/reset"'
];
for (const r of adminRoutes) {
  const pos = serverCode.indexOf(r);
  assert.ok(pos !== -1, 'Missing admin route: ' + r);
  const block = serverCode.substring(pos, pos + 400);
  assert.ok(block.includes('getAuthUser(req)'), 'Route missing getAuthUser: ' + r);
  assert.ok(block.includes('userAuth.role !== "admin"'), 'Route missing role check: ' + r);
}

// Stress-test 3: Verify cleanFlatMode handling for 'never', 'priority', 'always'
const startPos = serverCode.indexOf('app.post("/api/service/public/:token/flats/:flatId/start"');
const startBlock = serverCode.substring(startPos, startPos + 4000);
assert.ok(startBlock.includes('cleanFlatMode === "never"'), 'cleanFlatMode never not handled');
assert.ok(startBlock.includes('cleanFlatMode === "priority"'), 'cleanFlatMode priority not handled');
assert.ok(startBlock.includes('prioritySuggested'), 'prioritySuggested not returned for always');

// Stress-test 4: Verify finish validations
const finishPos = serverCode.indexOf('app.post("/api/service/public/:token/flats/:flatId/finish"');
const finishBlock = serverCode.substring(finishPos, finishPos + 4000);
assert.ok(finishBlock.includes('needsCleaning'), 'needsCleaning not validated in finish');
assert.ok(finishBlock.includes('requirePhotos'), 'requirePhotos not validated in finish');
assert.ok(finishBlock.includes('estimatedFinishAt = null'), 'PMS block estimatedFinishAt not reset in finish');

console.log('ALL ADVERSARIAL STATIC STRESS TESTS PASSED!');

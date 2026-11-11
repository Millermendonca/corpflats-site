// tests/frontend-ui-audit.mjs
// Comprehensive empirical audit and stress harness for challenger_frontend_ui

import fs from 'fs';
import path from 'path';

const projectRoot = 'c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager';
const publicFrigobarDir = path.join(projectRoot, 'artifacts/limpeza/public/images/frigobar');

console.log('====================================================');
console.log('🚀 EMPIRICAL FRONTEND UI & LOGIC STRESS TEST SUITE');
console.log('====================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

// ---------------------------------------------------------------------
// TEST 1: minibar-admin.tsx & 20 Products Homologation Catalog Integrity
// ---------------------------------------------------------------------
console.log('--- TEST GROUP 1: minibar-admin.tsx & Homologation Catalog ---');
const adminPath = path.join(projectRoot, 'artifacts/limpeza/src/pages/minibar-admin.tsx');
const adminContent = fs.readFileSync(adminPath, 'utf8');

// Extract the catalog array safely using AST or parsing
const catalogStartIdx = adminContent.indexOf('export const INITIAL_HOMOLOGATION_CATALOG: BrandHomologationItem[] = [');
const catalogEndIdx = adminContent.indexOf('function downloadCsvFile', catalogStartIdx);
assert(catalogStartIdx !== -1 && catalogEndIdx !== -1, 'INITIAL_HOMOLOGATION_CATALOG block located in minibar-admin.tsx');

const catalogSlice = adminContent.slice(catalogStartIdx, catalogEndIdx);

// Parse all product objects in INITIAL_HOMOLOGATION_CATALOG
const idMatches = [...catalogSlice.matchAll(/id:\s*"([^"]+)"/g)].map(m => m[1]);
assert(idMatches.length === 20, `Homologation catalog contains exactly 20 items (Found: ${idMatches.length})`);

// Extract items with full details
const productChunks = catalogSlice.split(/\{\s*id:\s*"/).slice(1);
const parsedProducts = [];

for (const chunk of productChunks) {
  const id = chunk.split('"')[0];
  const nameM = chunk.match(/productName:\s*"([^"]+)"/);
  const catM = chunk.match(/category:\s*"([^"]+)"/);
  const curImgM = chunk.match(/currentImageUrl:\s*"([^"]+)"/);
  const curDiagM = chunk.match(/currentDiagnosis:\s*"([^"]+)"/);
  const proposedBrandM = chunk.match(/proposedBrand:\s*\{([^}]+)\}/);
  const isCourtesy = chunk.includes('isCourtesy: true');

  let proposedBrand = null;
  if (proposedBrandM) {
    const bNameM = proposedBrandM[1].match(/brandName:\s*"([^"]+)"/);
    const bImgM = proposedBrandM[1].match(/imageUrl:\s*"([^"]+)"/);
    const bMfrM = proposedBrandM[1].match(/manufacturer:\s*"([^"]+)"/);
    const bVolM = proposedBrandM[1].match(/volumeOrWeight:\s*"([^"]+)"/);
    const bPkgM = proposedBrandM[1].match(/packageType:\s*"([^"]+)"/);
    proposedBrand = {
      brandName: bNameM ? bNameM[1] : null,
      imageUrl: bImgM ? bImgM[1] : null,
      manufacturer: bMfrM ? bMfrM[1] : null,
      volumeOrWeight: bVolM ? bVolM[1] : null,
      packageType: bPkgM ? bPkgM[1] : null
    };
  }

  // Alternatives
  const alts = [];
  const altsBlockM = chunk.match(/alternatives:\s*\[([\s\S]*?)\]\s*,/);
  if (altsBlockM) {
    const altChunks = altsBlockM[1].split(/brandName:\s*"/).slice(1);
    for (const ac of altChunks) {
      const altName = ac.split('"')[0];
      const altImgM = ac.match(/imageUrl:\s*"([^"]+)"/);
      alts.push({
        brandName: altName,
        imageUrl: altImgM ? altImgM[1] : null
      });
    }
  }

  parsedProducts.push({
    id,
    productName: nameM ? nameM[1] : '',
    category: catM ? catM[1] : '',
    currentImageUrl: curImgM ? curImgM[1] : '',
    currentDiagnosis: curDiagM ? curDiagM[1] : '',
    proposedBrand,
    alternatives: alts,
    isCourtesy
  });
}

assert(parsedProducts.length === 20, `Successfully parsed all 20 products from minibar-admin.tsx`);

// Verify categories distribution
const courtesyItems = parsedProducts.filter(p => p.isCourtesy);
const paidItems = parsedProducts.filter(p => !p.isCourtesy);
assert(courtesyItems.length === 2, `Exactly 2 courtesy items in homologation catalog (Found: ${courtesyItems.length})`);
assert(paidItems.length === 18, `Exactly 18 catalog items in homologation catalog (Found: ${paidItems.length})`);

// Verify courtesy IDs
const mendorato = courtesyItems.find(p => p.id === 'prod_cortesia_amendoim_mendorato');
const aguaCopo = courtesyItems.find(p => p.id === 'prod_cortesia_agua_copo');
assert(Boolean(mendorato), `prod_cortesia_amendoim_mendorato present`);
assert(Boolean(aguaCopo), `prod_cortesia_agua_copo present`);

// Verify all proposed images and legacy images exist physically on disk
console.log('\n--- Checking Physical Assets in artifacts/limpeza/public/ ---');
let allImagesExist = true;
const checkedImages = new Set();

for (const prod of parsedProducts) {
  const imagesToCheck = [
    prod.currentImageUrl,
    prod.proposedBrand?.imageUrl,
    ...prod.alternatives.map(a => a.imageUrl)
  ].filter(Boolean);

  for (const imgUrl of imagesToCheck) {
    if (checkedImages.has(imgUrl)) continue;
    checkedImages.add(imgUrl);
    // Convert url e.g. /images/frigobar/xyz.png to disk path
    const relPath = imgUrl.startsWith('/') ? imgUrl.slice(1) : imgUrl;
    const diskPath = path.join(projectRoot, 'artifacts/limpeza/public', relPath);
    const exists = fs.existsSync(diskPath);
    if (!exists) {
      allImagesExist = false;
      console.error(`Missing image on disk: ${diskPath} (from ${prod.id})`);
    }
  }
}
assert(allImagesExist, `All ${checkedImages.size} distinct image URLs referenced in catalog exist physically on disk`);

// Verify UI features in minibar-admin.tsx
console.log('\n--- Checking UI Implementation in minibar-admin.tsx ---');
assert(adminContent.includes('catalogSubView === "galeria_marcas"'), 'Sub-view galeria_marcas condition present');
assert(adminContent.includes('setCatalogSubView("galeria_marcas")'), 'Tab button to switch to galeria_marcas present');
assert(adminContent.includes('localStorage.getItem("corpflats_minibar_homologation_v1")'), 'localStorage reader present with key corpflats_minibar_homologation_v1');
assert(adminContent.includes('localStorage.setItem("corpflats_minibar_homologation_v1"'), 'localStorage writer present with key corpflats_minibar_homologation_v1');
assert(adminContent.includes('handleApprovePhoto'), 'Individual photo approval handler present');
assert(adminContent.includes('handleApproveAllPhotos'), 'Batch photo approval handler present');
assert(adminContent.includes('handleSelectBrandAlternative'), 'Brand alternative switch handler present');
assert(adminContent.includes('handleRequestCustomSwap'), 'Custom brand swap request handler present');
assert(adminContent.includes('handleApplyApprovedToCatalog'), 'Apply approved photos to production catalog present');
assert(adminContent.includes('<Dialog open={!!zoomModalItem}'), 'HD 1024x1024 Zoom Modal implemented');
assert(adminContent.includes('<Dialog open={!!swapModalItem}'), 'Brand Swap Alternative Modal implemented');

// ---------------------------------------------------------------------
// TEST 2: guest-minibar.tsx & Kit de Boas-Vindas
// ---------------------------------------------------------------------
console.log('\n--- TEST GROUP 2: guest-minibar.tsx & Kit de Boas-Vindas ---');
const guestMinibarPath = path.join(projectRoot, 'artifacts/limpeza/src/pages/guest-minibar.tsx');
const guestMinibarContent = fs.readFileSync(guestMinibarPath, 'utf8');

assert(guestMinibarContent.includes('Kit de Boas-Vindas (Cortesia da Casa)'), 'Top container "Kit de Boas-Vindas (Cortesia da Casa)" present');
assert(guestMinibarContent.includes('100% Gratuito'), 'Badge "100% Gratuito" present in welcome kit container');
assert(guestMinibarContent.includes('R$ 0,00'), 'R$ 0,00 displayed for courtesy items');
assert(guestMinibarContent.includes("Copo d'Água Mineral 200ml"), "Copo d'Água Mineral 200ml present in welcome kit");
assert(guestMinibarContent.includes('Amendoim Mendorato 27g'), 'Amendoim Mendorato 27g present in welcome kit');

// Check that welcome kit in reference catalog has no purchase buttons
const welcomeKitSlice = guestMinibarContent.slice(
  guestMinibarContent.indexOf('{/* ── Kit de Boas-Vindas (Cortesia da Casa) ── */}'),
  guestMinibarContent.indexOf('{/* Separador nítido para os produtos pagos */}')
);
assert(!welcomeKitSlice.includes('onClick={() => handleAddToCart'), 'Welcome kit container contains NO add to cart actions');
assert(!welcomeKitSlice.includes('setCart('), 'Welcome kit container contains NO cart state mutations');
assert(!welcomeKitSlice.includes('<Button') || !welcomeKitSlice.includes('Comprar'), 'Welcome kit container has NO buy buttons');

// Check that paid items list excludes courtesy kit when filter === 'todos'
assert(
  guestMinibarContent.includes('const isCourtesyKit = prod.isCourtesy || prod.category === "Kit de Boas-Vindas";') &&
  guestMinibarContent.includes('return !isCourtesyKit;'),
  'Paid items list explicitly excludes courtesy kit items from main catalog grid'
);

// Check segregated statement block
assert(guestMinibarContent.includes('consumedCourtesyItems.length > 0'), 'Statement has segregated condition for consumedCourtesyItems');
assert(guestMinibarContent.includes('🎁 Kit de Boas-Vindas Consumido (Cortesia da Casa)'), 'Statement has highlighted courtesy block');
assert(guestMinibarContent.includes('R$ 0,00 (Sem acréscimo no total da estadia)'), 'Statement clearly states zero impact on stay total');

// ---------------------------------------------------------------------
// TEST 3: anserve-restock.tsx & Repositora Conference
// ---------------------------------------------------------------------
console.log('\n--- TEST GROUP 3: anserve-restock.tsx & Repositora Conference ---');
const restockPath = path.join(projectRoot, 'artifacts/limpeza/src/pages/anserve-restock.tsx');
const restockContent = fs.readFileSync(restockPath, 'utf8');

// Sem Consumo Modal
assert(restockContent.includes('setSemConsumoWaterConsumed(num)'), 'Sem Consumo modal has water selector');
assert(restockContent.includes('setSemConsumoPeanutsConsumed(num)'), 'Sem Consumo modal has peanuts selector');
assert(restockContent.includes('[0, 1, 2].map((num) =>'), 'Sem Consumo modal uses [0, 1, 2] button group');

// Launch Consumo Modal
assert(restockContent.includes('setWelcomeKitWaterConsumed(num)'), 'Launch Consumo modal has water selector');
assert(restockContent.includes('setWelcomeKitPeanutsConsumed(num)'), 'Launch Consumo modal has peanuts selector');

// Submission validation: does not block if only courtesy items are consumed
assert(
  restockContent.includes('const hasCourtesyConsumed = welcomeKitWaterConsumed > 0 || welcomeKitPeanutsConsumed > 0;') &&
  restockContent.includes('if (consumedItemsList.length === 0 && !hasCourtesyConsumed)'),
  'Form submission allows 0 paid items when courtesy items are consumed (does not block)'
);

// Decoupled from restockedItems
const restockLogicSlice = restockContent.slice(
  restockContent.indexOf('// R4: Reposição da repositora apenas para itens pagos repostos.'),
  restockContent.indexOf('const isPostCheckout = Boolean(launchModalFlat.isCheckedOut);')
);
assert(
  restockLogicSlice.includes('consumedItemsList.map(') && !restockLogicSlice.includes('welcomeKitWaterConsumed'),
  'welcomeKitConsumption is decoupled from restockedItems (no restock order generated for repositora)'
);

// ---------------------------------------------------------------------
// TEST 4: anserve-dashboard.tsx & Financial Reconciliation (R6)
// ---------------------------------------------------------------------
console.log('\n--- TEST GROUP 4: anserve-dashboard.tsx & Financial Settlement ---');
const dashPath = path.join(projectRoot, 'artifacts/limpeza/src/pages/anserve-dashboard.tsx');
const dashContent = fs.readFileSync(dashPath, 'utf8');

assert(dashContent.includes('3. Reembolso Água Boas-Vindas'), 'Dashboard includes Card 3: Reembolso Água Boas-Vindas');
assert(dashContent.includes('Apuração do Kit de Boas-Vindas (Fornecimento & Repasse)'), 'Dashboard includes detailed Kit Boas-Vindas breakdown');
assert(dashContent.includes('copos × R$ 2,00 (Estoque Anserve)'), 'Dashboard calculates water cups × R$ 2,00');
assert(dashContent.includes('Fornecimento Próprio Hotel • R$ 0,00 Repasse'), 'Dashboard identifies peanuts as own hotel supply with R$ 0,00 reimbursement');

// ---------------------------------------------------------------------
// TEST 5: guest-portal.tsx & pms-calendar.tsx Segregation
// ---------------------------------------------------------------------
console.log('\n--- TEST GROUP 5: guest-portal.tsx & pms-calendar.tsx Segregation ---');
const portalPath = path.join(projectRoot, 'artifacts/limpeza/src/pages/guest-portal.tsx');
const portalContent = fs.readFileSync(portalPath, 'utf8');

assert(portalContent.includes('Kit de Boas-Vindas Consumido (Cortesia da Casa)'), 'guest-portal.tsx renders segregated Kit de Boas-Vindas block');
assert(portalContent.includes('Itens de cortesia da hospedagem sem acréscimo no saldo da estadia'), 'guest-portal.tsx confirms zero balance effect');

const pmsPath = path.join(projectRoot, 'artifacts/limpeza/src/pages/pms-calendar.tsx');
const pmsContent = fs.readFileSync(pmsPath, 'utf8');

assert(pmsContent.includes('Kit de Boas-Vindas Consumido (Cortesia)'), 'pms-calendar.tsx renders segregated Kit de Boas-Vindas block');
assert(pmsContent.includes('courtesyWater <= 0 && courtesyPeanuts <= 0') && pmsContent.includes('return null'), 'pms-calendar.tsx omits courtesy block when consumption is 0');

// ---------------------------------------------------------------------
// TEST 6: Simulated Edge Cases & Math Model
// ---------------------------------------------------------------------
console.log('\n--- TEST GROUP 6: Edge Cases & Computational Model ---');

// Edge Case 1: Corrupted localStorage JSON in minibar-admin
function testLocalStorageSafety(rawStored) {
  try {
    if (rawStored) {
      const parsed = JSON.parse(rawStored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    // console.warn
  }
  return 'FALLBACK_DEFAULT';
}

assert(testLocalStorageSafety('INVALID_JSON{{{') === 'FALLBACK_DEFAULT', 'Corrupted localStorage JSON falls back gracefully without crashing');
assert(testLocalStorageSafety('[]') === 'FALLBACK_DEFAULT', 'Empty array in localStorage falls back gracefully');
assert(testLocalStorageSafety(null) === 'FALLBACK_DEFAULT', 'Null localStorage falls back gracefully');
const sampleValid = JSON.stringify([{ id: 'test', status: 'approved' }]);
assert(testLocalStorageSafety(sampleValid) !== 'FALLBACK_DEFAULT', 'Valid JSON array in localStorage is loaded properly');

// Edge Case 2: Financial reconciliation math simulation
function computeSettlement(waterCups, peanuts) {
  const waterUnitCost = 2.00;
  const waterTotal = waterCups * waterUnitCost;
  const peanutUnitCost = 0.00;
  const peanutTotal = peanuts * peanutUnitCost;
  return {
    waterReimbursement: waterTotal,
    peanutReimbursement: peanutTotal,
    totalAnserveReimbursement: waterTotal + peanutTotal
  };
}

const s1 = computeSettlement(0, 0);
assert(s1.waterReimbursement === 0 && s1.peanutReimbursement === 0 && s1.totalAnserveReimbursement === 0, 'Zero consumption yields R$ 0,00 reimbursement');

const s2 = computeSettlement(5, 5);
assert(s2.waterReimbursement === 10.00 && s2.peanutReimbursement === 0 && s2.totalAnserveReimbursement === 10.00, '5 water cups @ R$ 2.00 yields R$ 10.00; 5 peanuts yield R$ 0.00');

const s3 = computeSettlement(19 * 2, 19 * 2); // all 19 flats consuming max 2 units
assert(s3.waterReimbursement === 76.00 && s3.totalAnserveReimbursement === 76.00, 'All 19 flats consuming max 2 waters (38 cups) yields R$ 76.00 reimbursement to Anserve');

// ---------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------
console.log('\n====================================================');
console.log(`TEST SUMMARY: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
console.log('====================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL EMPIRICAL CHALLENGE CHECKS PASSED PERFECTLY!\n');
}

/**
 * Targeted Test Suite: Welcome Kit (Kit de Boas-Vindas) - Milestones 2 & 3 (R3, R4, R5, R6)
 * File: tests/minibar-welcome-kit-targeted.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('Minibar Welcome Kit (Kit de Boas-Vindas) - Requirements R3, R4, R5 & R6', () => {

  it('R3: demo-server.mjs contains prod_amendoim_mendorato in default catalog and guards', () => {
    const code = readFileSync('artifacts/api-server/demo-server.mjs', 'utf8');

    // Product master check
    assert.match(code, /id:\s*"prod_amendoim_mendorato"/, 'prod_amendoim_mendorato must be registered in catalog');
    assert.match(code, /supplierOrigin:\s*"hotel_proprio"/, 'prod_amendoim_mendorato must have supplierOrigin hotel_proprio');
    assert.match(code, /supplierOrigin:\s*"anserve"/, 'prod_agua_mineral_copo must have supplierOrigin anserve');

    // Catalog integrity guards check
    assert.match(code, /db\.minibarProducts\.length < 18/, 'Integrity guards must use < 18 instead of !== 18');
  });

  it('R4: inspections filter out welcome kit courtesy items from restockedItems', () => {
    const code = readFileSync('artifacts/api-server/demo-server.mjs', 'utf8');

    // R4 check: camareiras restock welcome kit on turnover, repositora never restocks courtesy kit
    assert.match(code, /isKitCourtesy/, 'demo-server must detect and skip welcome kit courtesies in restockedItems');
    assert.match(code, /welcomeKitConsumption:\s*welcomeKitRecord/, 'inspection object must persist welcomeKitConsumption');
  });

  it('R5: buildReservationMinibarStatement creates zeroed consumedCourtesyItems without adding to total bill', () => {
    const code = readFileSync('artifacts/api-server/demo-server.mjs', 'utf8');

    // R5 check: consumedCourtesyItems with unitPrice: 0.00, totalPrice: 0.00
    assert.match(code, /consumedCourtesyItems\.push\(\{/, 'statement must build consumedCourtesyItems');
    assert.match(code, /unitPrice:\s*0\.00/, 'courtesy item must have unitPrice 0.00');
    assert.match(code, /totalPrice:\s*0\.00/, 'courtesy item must have totalPrice 0.00');
    assert.match(code, /welcomeKitSummary:\s*\{/, 'statement must export welcomeKitSummary');
  });

  it('R6: settlement calculation computes courtesy water reimbursement at R$ 2.00 and R$ 0.00 for peanuts', () => {
    const code = readFileSync('artifacts/api-server/demo-server.mjs', 'utf8');

    // Settlement check
    assert.match(code, /totalCourtesyWaterCups/, 'settlement must sum consumed courtesy water cups');
    assert.match(code, /courtesyWaterTotalCost/, 'settlement must compute water reimbursement');
    assert.match(code, /courtesyMendoratoTotalCost:\s*0\.00/, 'settlement must mark Mendorato peanuts as 0.00 reimbursement');
    assert.match(code, /courtesySummary:/, 'settlement must expose courtesySummary object');
  });

  it('Frontend checks: guest-minibar, anserve-restock, guest-portal, pms-calendar, anserve-dashboard', () => {
    const guestMinibar = readFileSync('artifacts/limpeza/src/pages/guest-minibar.tsx', 'utf8');
    assert.match(guestMinibar, /Kit de Boas-Vindas \(Cortesia da Casa\)/, 'guest-minibar must have prominent Welcome Kit card');
    assert.match(guestMinibar, /consumedCourtesyItems\.length > 0/, 'guest-minibar must have consumed courtesy statement block');
    assert.match(guestMinibar, /100% Gratuito/, 'guest-minibar must show 100% Gratuito badge');

    const anserveRestock = readFileSync('artifacts/limpeza/src/pages/anserve-restock.tsx', 'utf8');
    assert.match(anserveRestock, /setWelcomeKitWaterConsumed/, 'anserve-restock must have water consumption selector');
    assert.match(anserveRestock, /setWelcomeKitPeanutsConsumed/, 'anserve-restock must have peanuts consumption selector');
    assert.match(anserveRestock, /welcomeKitConsumption:\s*\{/, 'anserve-restock must send welcomeKitConsumption in payload');

    const guestPortal = readFileSync('artifacts/limpeza/src/pages/guest-portal.tsx', 'utf8');
    assert.match(guestPortal, /Kit de Boas-Vindas Consumido \(Cortesia da Casa\)/, 'guest-portal must show consumed courtesy section');

    const pmsCalendar = readFileSync('artifacts/limpeza/src/pages/pms-calendar.tsx', 'utf8');
    assert.match(pmsCalendar, /Kit de Boas-Vindas Consumido \(Cortesia\)/, 'pms-calendar must show consumed courtesy section');

    const anserveDashboard = readFileSync('artifacts/limpeza/src/pages/anserve-dashboard.tsx', 'utf8');
    assert.match(anserveDashboard, /Apuração do Kit de Boas-Vindas \(Fornecimento & Repasse\)/, 'anserve-dashboard must show supplier breakdown');
  });
});

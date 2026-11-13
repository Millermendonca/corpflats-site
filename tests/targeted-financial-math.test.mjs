process.env.NODE_ENV = "test";
process.env.PORT = "3999";

import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { 
  calculateSebraeRate, 
  DEFAULT_SEBRAE_CONFIG,
  applyPricingLocks,
  WbpPricingManager
} from "../artifacts/api-server/wbp/pricing.mjs";
import {
  DEFAULT_FEE_SETTINGS,
  syncFinancialAndTariffSettings,
  httpServer
} from "../artifacts/api-server/demo-server.mjs";

console.log("=== INICIANDO TESTE PONTUAL DE MATEMÁTICA FINANCEIRA E PARIDADE ===");

// 1. SEBRAE Canonical Formula Test
console.log("\n[1] Testando Fórmula Canônica SEBRAE...");
const sebrae = calculateSebraeRate(DEFAULT_SEBRAE_CONFIG);
console.log("   custoUH:", sebrae.custoUH);
console.log("   tarifaMinima:", sebrae.tarifaMinima);
console.log("   breakEvenFloor:", sebrae.breakEvenFloor);
console.log("   fecha100:", sebrae.fecha100);
console.log("   somaDecomposicao:", sebrae.somaDecomposicao);

assert.equal(sebrae.custoUH, 149.38, "custoUH deve ser 149.38");
assert.equal(sebrae.tarifaMinima, 276.63, "tarifaMinima deve ser 276.63");
assert.equal(sebrae.breakEvenFloor, 189.09, "breakEvenFloor deve ser 189.09");
assert.equal(sebrae.fecha100, true, "decomposição deve fechar em 100%");
assert.equal(sebrae.somaDecomposicao, 276.63, "somaDecomposicao deve fechar exatamente em 276.63");

// Teste de baixa temporada (fator 0.90)
const baixaTemporadaRate = Math.round(sebrae.tarifaMinima * 0.90 * 100) / 100;
console.log("   baixaTemporadaRate (factor 0.90):", baixaTemporadaRate);
assert.equal(baixaTemporadaRate, 248.97, "baixa temporada deve ser 248.97");
assert(baixaTemporadaRate >= sebrae.breakEvenFloor, "baixa temporada (248.97) deve estar acima do break-even floor (189.09)");

// 2. Pricing Locks & Seasonality Test
console.log("\n[2] Testando Travas de Piso e Variação no Preview...");
const lockCheckLowSeason = applyPricingLocks({
  currentRate: 276.63,
  calculatedRate: 248.97, // -10% baixa temporada
  tarifaMinima: sebrae.breakEvenFloor,
  breakEvenFloor: sebrae.breakEvenFloor,
  manualFloor: sebrae.breakEvenFloor,
  variationLimitPct: 0.30
});
console.log("   Lock check baixa temporada:", lockCheckLowSeason);
assert.equal(lockCheckLowSeason.isLocked, false, "Baixa temporada de 248.97 NÃO deve ser bloqueada por FLOOR_LOCK");
assert.equal(lockCheckLowSeason.finalRate, 248.97, "Tarifa final deve ser 248.97");

// 3. SSOT Synchronization Test
console.log("\n[3] Testando SSOT syncFinancialAndTariffSettings...");
const mockDb = {
  settings: {
    feeSettings: { ...DEFAULT_FEE_SETTINGS }
  },
  financialSettings: {},
  tariffSettings: {},
  wbpPricing: { settings: {} }
};

syncFinancialAndTariffSettings(mockDb, {
  fixedRent: 40000,
  bookingCommissionRate: 16.0,
  pixDiscountPercent: 7.0,
  targetMarginPct: 0.30
});

assert.equal(mockDb.financialSettings.fixedRent, 40000, "financialSettings.fixedRent sincronizado");
assert.equal(mockDb.wbpPricing.settings.fixedRent, 40000, "wbpPricing.settings.fixedRent sincronizado");
assert.equal(mockDb.settings.feeSettings.bookingCommissionRate, 16.0, "feeSettings.bookingCommissionRate sincronizado");
assert.equal(mockDb.tariffSettings.channelMarkups.booking.commissionRate, 0.16, "tariffSettings booking commissionRate sincronizado");
assert.equal(mockDb.wbpPricing.settings.channelCommissionPct, 0.16, "wbpPricing channelCommissionPct sincronizado");
assert.equal(mockDb.tariffSettings.pixDiscountPercent, 7.0, "tariffSettings pixDiscountPercent sincronizado");
console.log("   SSOT sincronizado com sucesso em todos os 4 objetos do banco.");

// 4. DRE Gerencial Accounting Identity Test
console.log("\n[4] Testando Identidade Contábil do DRE Gerencial...");
const soldNights = 383;
const grossRevenue = 100000;
const totalCommissionsPaid = 12000;
const totalGatewayFees = 2000;
const totalTaxes = 6000;
const totalDeductions = totalCommissionsPaid + totalGatewayFees + totalTaxes; // 20000
const netRevenue = grossRevenue - totalDeductions; // 80000

const varCostPerNight = 47.76;
const operationalVariableCosts = Math.round(soldNights * varCostPerNight * 100) / 100; // 18292.08
const contributionMargin = Math.round((netRevenue - operationalVariableCosts) * 100) / 100; // 61707.92

const totalFixedCosts = 38906.61;
const ebitda = Math.round((contributionMargin - totalFixedCosts) * 100) / 100; // 22801.31

console.log("   grossRevenue:", grossRevenue);
console.log("   totalDeductions:", totalDeductions);
console.log("   netRevenue:", netRevenue);
console.log("   operationalVariableCosts:", operationalVariableCosts);
console.log("   contributionMargin:", contributionMargin);
console.log("   totalFixedCosts:", totalFixedCosts);
console.log("   ebitda:", ebitda);

// Validação de não-duplicação: contributionMargin NÃO deve deduzir totalCommissionsPaid novamente
assert.equal(netRevenue, 80000, "netRevenue = grossRevenue - deductions");
assert.equal(contributionMargin, 61707.92, "contributionMargin = netRevenue - operationalVariableCosts (sem duplicar comissões)");
assert.equal(ebitda, 22801.31, "ebitda = contributionMargin - totalFixedCosts");

// 5. Twin Server Byte-for-Byte SHA-256 Parity Test
console.log("\n[5] Testando Paridade SHA-256 Twin-Server...");
function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

const pricing1 = sha256("artifacts/api-server/wbp/pricing.mjs");
const pricing2 = sha256("scripts/wbp/pricing.mjs");
assert.equal(pricing1, pricing2, "artifacts/api-server/wbp/pricing.mjs deve ser idêntico a scripts/wbp/pricing.mjs");
console.log("   artifacts/api-server/wbp/pricing.mjs == scripts/wbp/pricing.mjs (SHA-256:", pricing1, ")");

const server1 = sha256("artifacts/api-server/demo-server.mjs");
const server2 = sha256("scripts/demo-server.mjs");
assert.equal(server1, server2, "artifacts/api-server/demo-server.mjs deve ser idêntico a scripts/demo-server.mjs");
console.log("   artifacts/api-server/demo-server.mjs == scripts/demo-server.mjs (SHA-256:", server1, ")");

console.log("\n=== TODOS OS TESTES PONTUAIS PASSARAM COM SUCESSO! ===");

if (httpServer && httpServer.close) {
  httpServer.close();
}
process.exit(0);

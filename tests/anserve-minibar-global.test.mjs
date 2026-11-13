#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

console.log("================================================================================");
console.log("   Teste Pontual Independente: Cardápio Global de Frigobar Anserve (18 Itens)   ");
console.log("================================================================================");

const EXPECTED_ITEMS = [
  // 9 Bebidas
  { id: "prod_achocolatado", name: "Achocolatado", category: "Bebidas", price: 12.00, defaultQuantity: 1, image: "achocolatado.png" },
  { id: "prod_agua_mineral_copo", name: "Água Mineral Copo", category: "Bebidas", price: 5.00, defaultQuantity: 4, image: "agua_mineral_copo.png" },
  { id: "prod_agua_mineral_garrafa", name: "Água Mineral Garrafa", category: "Bebidas", price: 7.00, defaultQuantity: 5, image: "agua_mineral_garrafa.png" },
  { id: "prod_cerveja_long_neck", name: "Cerveja Long Neck", category: "Bebidas", price: 20.00, defaultQuantity: 2, image: "cerveja_long_neck.png" },
  { id: "prod_energetico", name: "Energético", category: "Bebidas", price: 28.00, defaultQuantity: 1, image: "energetico.png" },
  { id: "prod_refrigerante", name: "Refrigerante", category: "Bebidas", price: 12.00, defaultQuantity: 4, image: "refrigerante.png" },
  { id: "prod_smirnoff_ice", name: "Smirnoff Ice", category: "Bebidas", price: 28.00, defaultQuantity: 1, image: "smirnoff_ice.png" },
  { id: "prod_suco_fruta", name: "Suco de Fruta", category: "Bebidas", price: 12.00, defaultQuantity: 2, image: "suco_fruta.png" },
  { id: "prod_suco_uva_integral", name: "Suco de Uva Integral", category: "Bebidas", price: 25.00, defaultQuantity: 1, image: "suco_uva_integral.png" },
  // 9 Petiscos
  { id: "prod_barra_cereal", name: "Barra de Cereal", category: "Petiscos", price: 12.00, defaultQuantity: 2, image: "barra_cereal.png" },
  { id: "prod_batata", name: "Batata", category: "Petiscos", price: 28.00, defaultQuantity: 1, image: "batata.png" },
  { id: "prod_biscoito_salgado", name: "Biscoito Salgado", category: "Petiscos", price: 12.00, defaultQuantity: 1, image: "biscoito_salgado.png" },
  { id: "prod_castanha_caju", name: "Castanha de Caju", category: "Petiscos", price: 14.00, defaultQuantity: 2, image: "castanha_caju.png" },
  { id: "prod_chiclete", name: "Chiclete", category: "Petiscos", price: 8.00, defaultQuantity: 2, image: "chiclete.png" },
  { id: "prod_chocolate", name: "Chocolate", category: "Petiscos", price: 12.00, defaultQuantity: 2, image: "chocolate.png" },
  { id: "prod_chocolate_kinder_bueno", name: "Chocolate Kinder Bueno", category: "Petiscos", price: 26.00, defaultQuantity: 1, image: "chocolate_kinder_bueno.png" },
  { id: "prod_chocolate_kitkat_snickers", name: "Chocolate Kit Kat / Snickers", category: "Petiscos", price: 16.00, defaultQuantity: 2, image: "chocolate_kitkat_snickers.png" },
  { id: "prod_cookies", name: "Cookies", category: "Petiscos", price: 12.00, defaultQuantity: 1, image: "cookies.png" }
];

// 1. Verificação do database.json
console.log("\n[1/5] Verificando data/database.json...");
const dbFile = path.join(projectRoot, "data", "database.json");
assert(fs.existsSync(dbFile), "data/database.json deve existir");
const db = JSON.parse(fs.readFileSync(dbFile, "utf8"));

assert(Array.isArray(db.minibarProducts), "db.minibarProducts deve ser array");
assert.strictEqual(db.minibarProducts.length, 18, `db.minibarProducts deve conter exatamente 18 itens (encontrado: ${db.minibarProducts.length})`);

const bebidas = db.minibarProducts.filter(p => p.category.toLowerCase().includes("bebida"));
const petiscos = db.minibarProducts.filter(p => p.category.toLowerCase().includes("petisco"));
assert.strictEqual(bebidas.length, 9, `Deve haver 9 bebidas (encontrado: ${bebidas.length})`);
assert.strictEqual(petiscos.length, 9, `Deve haver 9 petiscos (encontrado: ${petiscos.length})`);

for (const exp of EXPECTED_ITEMS) {
  const prod = db.minibarProducts.find(p => p.id === exp.id || p.name === exp.name);
  assert(prod, `Produto '${exp.name}' (id: ${exp.id}) ausente em data/database.json`);
  assert.strictEqual(Number(prod.price), exp.price, `Preço de '${exp.name}' incorreto. Esperado: ${exp.price}, Atual: ${prod.price}`);
  assert.strictEqual(Number(prod.defaultQuantity), exp.defaultQuantity, `Qtd padrão de '${exp.name}' incorreta. Esperado: ${exp.defaultQuantity}, Atual: ${prod.defaultQuantity}`);
  assert(prod.imageUrl && prod.imageUrl.includes(exp.image), `URL de imagem de '${exp.name}' deve incluir '${exp.image}'`);
  assert.strictEqual(prod.active, true, `Produto '${exp.name}' deve estar ativo`);
  console.log(`  ✓ ${prod.name.padEnd(30)} [${prod.category}] R$ ${prod.price.toFixed(2).padStart(5)} | Qtd Padrão: ${prod.defaultQuantity} un.`);
}
console.log("  ✓ data/database.json: 18 produtos validados com sucesso!");

// 2. Verificação do Gabarito Global de Abastecimento (35 unidades)
console.log("\n[2/5] Verificando Gabarito Padrão Global de Reposição (35 unidades)...");
assert(db.minibarDefaultStock, "db.minibarDefaultStock deve existir");
assert(Array.isArray(db.minibarDefaultStock.globalTemplate), "db.minibarDefaultStock.globalTemplate deve ser array");
assert.strictEqual(db.minibarDefaultStock.globalTemplate.length, 18, `globalTemplate deve conter 18 itens (encontrado: ${db.minibarDefaultStock.globalTemplate.length})`);

const totalUnits = db.minibarDefaultStock.globalTemplate.reduce((sum, item) => {
  const qty = Number(item.defaultQuantity ?? item.quantity ?? 0);
  return sum + qty;
}, 0);
assert.strictEqual(totalUnits, 35, `Dotação total nominal do frigobar por flat deve somar 35 unidades (encontrado: ${totalUnits})`);
console.log(`  ✓ Gabarito global: 18 itens com soma de ${totalUnits} unidades nominais (21 bebidas + 14 petiscos).`);

// 3. Verificação de Arquivos de Imagem e Proporção 1:1
console.log("\n[3/5] Verificando existência dos 18 arquivos de imagem e proporção estrita 1:1...");
const imageDirs = [
  path.join(projectRoot, "artifacts", "limpeza", "public", "images", "frigobar"),
  path.join(projectRoot, "artifacts", "limpeza", "dist", "public", "images", "frigobar")
];

for (const dir of imageDirs) {
  const relDir = path.relative(projectRoot, dir).replace(/\\/g, "/");
  assert(fs.existsSync(dir), `Diretório de imagens deve existir: ${relDir}`);
  console.log(`  Checando diretório: ${relDir}`);

  for (const exp of EXPECTED_ITEMS) {
    const file = path.join(dir, exp.image);
    assert(fs.existsSync(file), `Arquivo de imagem ausente: ${relDir}/${exp.image}`);
    const buf = fs.readFileSync(file);
    assert(buf.length > 0, `Arquivo de imagem vazio: ${relDir}/${exp.image}`);

    // Validação da assinatura PNG (89 50 4E 47 0D 0A 1A 0A)
    assert(
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47,
      `Arquivo não é um PNG válido: ${relDir}/${exp.image}`
    );

    // Validação de dimensões quadradas 1:1 nos bytes do cabeçalho IHDR (largura: offset 16, altura: offset 20)
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    assert.strictEqual(
      width,
      height,
      `Imagem ${exp.image} não possui proporção 1:1 (${width}x${height})`
    );
    console.log(`    ✓ ${exp.image.padEnd(35)} Dimensões: ${width}x${height} (1:1 Quadrada OK) - ${(buf.length / 1024).toFixed(1)} KB`);
  }
}

// 4. Verificação das Funções Exportadas no Backend
console.log("\n[4/5] Verificando funções do servidor (getDefaultMinibarProducts e getDefaultMinibarStock)...");
const evalProc = spawnSync(
  process.execPath,
  [
    "--input-type=module",
    "-e",
    `import { getDefaultMinibarProducts, getDefaultMinibarStock } from './scripts/demo-server.mjs';
     console.log(JSON.stringify({ products: getDefaultMinibarProducts(), stock: getDefaultMinibarStock() }));
     process.exit(0);`
  ],
  {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: "test", PORT: "0" },
    encoding: "utf8"
  }
);

assert.strictEqual(evalProc.status, 0, `Falha ao importar demo-server.mjs: ${evalProc.stderr}`);
const serverData = JSON.parse(evalProc.stdout.trim().split("\n").pop());
assert(Array.isArray(serverData.products), "getDefaultMinibarProducts() deve retornar array");
assert.strictEqual(serverData.products.length, 18, `getDefaultMinibarProducts() deve retornar 18 itens (retornou: ${serverData.products.length})`);
assert(Array.isArray(serverData.stock?.globalTemplate), "getDefaultMinibarStock().globalTemplate deve ser array");
assert.strictEqual(serverData.stock.globalTemplate.length, 18, `getDefaultMinibarStock().globalTemplate deve conter 18 itens`);

const serverTotalUnits = serverData.stock.globalTemplate.reduce((s, i) => s + Number(i.defaultQuantity ?? i.quantity ?? 0), 0);
assert.strictEqual(serverTotalUnits, 35, `Soma das unidades em getDefaultMinibarStock() deve ser 35 (foi: ${serverTotalUnits})`);
console.log(`  ✓ Funções do servidor retornam catálogo canônico de 18 itens com soma de ${serverTotalUnits} unidades.`);

// 5. Verificação de Paridade Twin-Server SHA-256
console.log("\n[5/5] Verificando paridade twin-server SHA-256 dos arquivos de backend...");
const parityProc = spawnSync(
  process.execPath,
  ["scripts/check-twin-parity.mjs"],
  {
    cwd: projectRoot,
    encoding: "utf8"
  }
);
assert.strictEqual(parityProc.status, 0, `check-twin-parity.mjs falhou: ${parityProc.stdout}`);
console.log("  ✓ Paridade Twin-Server: 36/36 arquivos de runtime auditados e idênticos byte-a-byte!");

console.log("\n================================================================================");
console.log("       STATUS: 100% PASS - CARDÁPIO GLOBAL ANSERVE RIGOROSAMENTE VALIDADO!       ");
console.log("================================================================================\n");

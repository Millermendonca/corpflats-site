#!/usr/bin/env node
/**
 * tests/wbp-integration/e2e-runner.mjs
 *
 * Master Targeted E2E Test Runner for WebBookingPro Integration.
 * 
 * COMPLIANCE MANDATE (AGENTS.md):
 * - Strictly prohibits global test sweeps, wildcards (*), or batch folder scans.
 * - Only executes the explicitly targeted single test file specified by the user or agent.
 * - Ensures isolated test execution with NODE_ENV=test and clean exit codes.
 *
 * Usage:
 *   node tests/wbp-integration/e2e-runner.mjs <target-test-file.test.mjs>
 *
 * Example:
 *   node tests/wbp-integration/e2e-runner.mjs tests/wbp-integration/smoke-harness.test.mjs
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function printBanner(title) {
  console.log("================================================================================");
  console.log(` ${title}`);
  console.log("================================================================================");
}

async function run() {
  const args = process.argv.slice(2);

  // 1. Validate argument presence
  if (args.length === 0) {
    printBanner("WBP E2E TARGETED TEST RUNNER — ERRO DE ESCOPO");
    console.error("[AGENTS.md VIOLATION GUARD]");
    console.error("Nenhum arquivo de teste foi especificado.");
    console.error("\nRegra do projeto (AGENTS.md):");
    console.error("  'NUNCA executar testes globais, varreduras ou em lote: É terminantemente");
    console.error("   PROIBIDO rodar tests/*.test.mjs, scripts que varrem a pasta tests/,");
    console.error("   ou suítes completas do projeto.'");
    console.error("\nUso correto:");
    console.error("  node tests/wbp-integration/e2e-runner.mjs <caminho/do/arquivo-pontual.test.mjs>");
    console.error("\nExemplo:");
    console.error("  node tests/wbp-integration/e2e-runner.mjs tests/wbp-integration/smoke-harness.test.mjs");
    process.exit(1);
  }

  // 2. Prohibit wildcards and bulk glob patterns
  const targetArg = args[0];
  if (targetArg.includes("*") || targetArg.includes("?") || targetArg.endsWith("/")) {
    printBanner("WBP E2E TARGETED TEST RUNNER — BLOQUEIO DE SEGURANÇA");
    console.error("[AGENTS.md VIOLATION GUARD]");
    console.error(`Padrão em lote detectado: "${targetArg}"`);
    console.error("Varreduras e globs são estritamente proibidos pelas diretrizes do projeto.");
    console.error("Especifique um único arquivo de teste pontual diretamente associado à alteração.");
    process.exit(1);
  }

  // 3. Resolve target file path
  const targetFile = path.resolve(process.cwd(), targetArg);
  if (!fs.existsSync(targetFile)) {
    printBanner("WBP E2E TARGETED TEST RUNNER — ARQUIVO NÃO ENCONTRADO");
    console.error(`O arquivo de teste alvo não existe: ${targetFile}`);
    process.exit(1);
  }

  printBanner(`EXECUÇÃO PONTUAL: ${path.relative(process.cwd(), targetFile)}`);
  console.log(`[runner] Executando teste pontual com isolamento de ambiente...`);
  console.log(`[runner] DATABASE_URL: (removida / isolada)`);
  console.log(`[runner] NODE_ENV: test`);

  // 4. Spawn targeted node --test process
  const nodeArgs = ["--test", targetFile, ...args.slice(1)];
  const testExitCode = await new Promise((resolve) => {
    const child = spawn(process.execPath, nodeArgs, {
      cwd: process.cwd(),
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: "",
        NODE_ENV: "test"
      }
    });

    child.on("exit", (code) => {
      resolve(code ?? 1);
    });

    child.on("error", (err) => {
      console.error("[runner] Falha ao iniciar processo de teste:", err);
      resolve(1);
    });
  });

  printBanner(`TEST EXECUTION CONCLUÍDA — CÓDIGO DE SAÍDA: ${testExitCode}`);
  process.exit(testExitCode);
}

run().catch((err) => {
  console.error("[runner] Erro fatal:", err);
  process.exit(1);
});

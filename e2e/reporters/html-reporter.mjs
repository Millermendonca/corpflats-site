/**
 * e2e/reporters/html-reporter.mjs
 * 
 * Standalone Consolidated HTML Report Generator for CorpFlats E2E Testing.
 * Generates `e2e/reports/index.html` with pass/fail metrics, duration,
 * persona breakdown, viewport status, and direct artifact linking.
 */

import fs from "node:fs";
import path from "node:path";

export default class ConsolidatedHtmlReporter {
  constructor(options = {}) {
    this.outputFile = path.resolve(process.cwd(), options.outputFile || "e2e/reports/index.html");
    this.results = [];
    this.startTime = Date.now();
  }

  onBegin(config, suite) {
    this.totalTests = suite.allTests().length;
    this.startTime = Date.now();
  }

  onTestEnd(test, result) {
    const project = test.parent?.project()?.name || "Default";
    const title = test.title;
    
    // Extract persona from test title [persona]
    const personaMatch = title.match(/\[([a-zA-Z0-9_\-]+)\]$/);
    const persona = personaMatch ? personaMatch[1] : "unknown";

    this.results.push({
      title,
      project,
      persona,
      status: result.status,
      duration: result.duration,
      errors: (result.errors || []).map(e => e.message || String(e)),
      attachments: (result.attachments || []).map(a => ({
        name: a.name,
        contentType: a.contentType,
        path: a.path ? path.relative(path.dirname(this.outputFile), a.path).replace(/\\/g, "/") : null
      }))
    });
  }

  async onEnd(result) {
    const totalDuration = Date.now() - this.startTime;
    const passedCount = this.results.filter(r => r.status === "passed").length;
    const failedCount = this.results.filter(r => r.status === "failed" || r.status === "timedOut").length;
    const skippedCount = this.results.filter(r => r.status === "skipped").length;
    const totalCount = this.results.length;
    const passRate = totalCount > 0 ? ((passedCount / totalCount) * 100).toFixed(1) : "0.0";

    // Project breakdown
    const projects = {};
    for (const r of this.results) {
      if (!projects[r.project]) {
        projects[r.project] = { passed: 0, failed: 0, total: 0 };
      }
      projects[r.project].total++;
      if (r.status === "passed") projects[r.project].passed++;
      else projects[r.project].failed++;
    }

    // Persona breakdown
    const personas = {};
    for (const r of this.results) {
      if (!personas[r.persona]) {
        personas[r.persona] = { passed: 0, failed: 0, total: 0 };
      }
      personas[r.persona].total++;
      if (r.status === "passed") personas[r.persona].passed++;
      else personas[r.persona].failed++;
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CorpFlats E2E Synthetic Test Report</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --pass: #10b981;
      --fail: #ef4444;
      --warn: #f59e0b;
      --accent: #3b82f6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 2rem;
      line-height: 1.5;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
      margin-bottom: 2rem;
    }
    .title h1 { font-size: 1.8rem; font-weight: 700; color: #38bdf8; }
    .title p { color: var(--text-muted); font-size: 0.9rem; }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 0.85rem;
    }
    .badge-pass { background: rgba(16, 185, 129, 0.2); color: var(--pass); border: 1px solid var(--pass); }
    .badge-fail { background: rgba(239, 68, 68, 0.2); color: var(--fail); border: 1px solid var(--fail); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 1.25rem;
    }
    .card-label { font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 0.5rem; }
    .card-value { font-size: 2rem; font-weight: 700; }
    .card-value.pass { color: var(--pass); }
    .card-value.fail { color: var(--fail); }
    .table-container {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      overflow: hidden;
      margin-bottom: 2rem;
    }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; text-align: left; }
    th { background: #111827; padding: 0.75rem 1rem; color: var(--text-muted); font-weight: 600; }
    td { padding: 0.75rem 1rem; border-top: 1px solid var(--border); }
    tr:hover { background: rgba(255, 255, 255, 0.02); }
    .status-pill {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-passed { background: rgba(16, 185, 129, 0.15); color: var(--pass); }
    .status-failed { background: rgba(239, 68, 68, 0.15); color: var(--fail); }
    .search-bar {
      margin-bottom: 1rem;
      padding: 0.6rem 1rem;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      color: var(--text);
      width: 100%;
      font-size: 0.9rem;
    }
    .error-box {
      margin-top: 0.5rem;
      background: #450a0a;
      border: 1px solid var(--fail);
      border-radius: 0.35rem;
      padding: 0.5rem 0.75rem;
      font-family: monospace;
      font-size: 0.75rem;
      color: #fca5a5;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">
      <h1>CorpFlats Guest-Flow-Manager E2E Report</h1>
      <p>Varredura Universal de Telas & Sanidade • Multi-Viewport & Multi-Persona</p>
    </div>
    <div>
      <span class="badge ${failedCount === 0 ? 'badge-pass' : 'badge-fail'}">
        ${failedCount === 0 ? 'ALL CHECKS PASSED' : failedCount + ' TESTS FAILED'}
      </span>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-label">Taxa de Sucesso</div>
      <div class="card-value ${Number(passRate) >= 100 ? 'pass' : 'fail'}">${passRate}%</div>
    </div>
    <div class="card">
      <div class="card-label">Testes Aprovados</div>
      <div class="card-value pass">${passedCount} <span style="font-size: 1rem; color: var(--text-muted);">/ ${totalCount}</span></div>
    </div>
    <div class="card">
      <div class="card-label">Falhas Críticas</div>
      <div class="card-value ${failedCount === 0 ? 'pass' : 'fail'}">${failedCount}</div>
    </div>
    <div class="card">
      <div class="card-label">Duração Total</div>
      <div class="card-value" style="color: #60a5fa;">${(totalDuration / 1000).toFixed(1)}s</div>
    </div>
  </div>

  <div class="grid" style="grid-template-columns: 1fr 1fr;">
    <div class="card">
      <div class="card-label">Viewports Auditados</div>
      <div style="margin-top: 0.5rem;">
        ${Object.entries(projects).map(([proj, stats]) => `
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.4rem; font-size: 0.85rem;">
            <span><strong>${proj}</strong></span>
            <span><span style="color: var(--pass); font-weight: 600;">${stats.passed}</span> / ${stats.total} (${((stats.passed/stats.total)*100).toFixed(0)}%)</span>
          </div>
        `).join("")}
      </div>
    </div>
    <div class="card">
      <div class="card-label">Personas Verificadas</div>
      <div style="margin-top: 0.5rem;">
        ${Object.entries(personas).map(([persona, stats]) => `
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.4rem; font-size: 0.85rem;">
            <span><strong>${persona}</strong></span>
            <span><span style="color: var(--pass); font-weight: 600;">${stats.passed}</span> / ${stats.total} (${((stats.passed/stats.total)*100).toFixed(0)}%)</span>
          </div>
        `).join("")}
      </div>
    </div>
  </div>

  <input type="text" class="search-bar" id="searchInput" placeholder="Filtrar por nome de tela, persona ou viewport..." onkeyup="filterTable()">

  <div class="table-container">
    <table id="resultsTable">
      <thead>
        <tr>
          <th>Status</th>
          <th>Viewport</th>
          <th>Persona</th>
          <th>Tela / Teste</th>
          <th>Duração</th>
        </tr>
      </thead>
      <tbody>
        ${this.results.map(r => `
          <tr class="test-row">
            <td><span class="status-pill status-${r.status}">${r.status}</span></td>
            <td><strong>${r.project}</strong></td>
            <td><code>${r.persona}</code></td>
            <td>
              <div>${r.title}</div>
              ${r.errors.length > 0 ? `<div class="error-box">${r.errors.join("\n")}</div>` : ""}
            </td>
            <td>${r.duration}ms</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </div>

  <script>
    function filterTable() {
      const q = document.getElementById('searchInput').value.toLowerCase();
      const rows = document.querySelectorAll('.test-row');
      rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(q) ? '' : 'none';
      });
    }
  </script>
</body>
</html>`;

    // Ensure output directory exists
    const dir = path.dirname(this.outputFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.outputFile, html, "utf-8");
    console.log(`[ConsolidatedHtmlReporter] HTML report saved to ${this.outputFile}`);
  }
}

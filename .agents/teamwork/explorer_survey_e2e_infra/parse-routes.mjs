import fs from 'node:fs';
import path from 'node:path';

const appPath = 'c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/artifacts/limpeza/src/App.tsx';
const content = fs.readFileSync(appPath, 'utf8');

// Match Route, AdminRoute, ReceptionRoute, StaffRoute
const regex = /<(Route|AdminRoute|ReceptionRoute|StaffRoute)\s+path=["']([^"']+)["']\s+component=\{([^}]+)\}/g;
let match;
const routes = [];
while ((match = regex.exec(content)) !== null) {
  routes.push({
    guard: match[1],
    path: match[2],
    component: match[3].trim()
  });
}

console.log(`Total mapped route entries: ${routes.length}`);

// Group by component
const byComponent = {};
for (const r of routes) {
  if (!byComponent[r.component]) {
    byComponent[r.component] = { guards: new Set(), paths: [] };
  }
  byComponent[r.component].guards.add(r.guard);
  byComponent[r.component].paths.push(r.path);
}

const distinctComponents = Object.keys(byComponent);
console.log(`Distinct Page Components: ${distinctComponents.length}`);

console.log('\n--- DETAILED CATALOG ---');
distinctComponents.sort().forEach((comp, idx) => {
  const info = byComponent[comp];
  const guards = Array.from(info.guards).join(', ');
  console.log(`${idx + 1}. [${comp}] (${guards}) -> primary path: ${info.paths[0]} (aliases: ${info.paths.slice(1).join(', ') || 'none'})`);
});

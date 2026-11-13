import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (!crypto.hash) {
  crypto.hash = function (algorithm, data, outputEncoding) {
    const hash = crypto.createHash(algorithm).update(data);
    return outputEncoding ? hash.digest(outputEncoding) : hash.digest();
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import API server backend correctly with file:// URL on Windows
const apiServerPath = path.resolve(__dirname, "../api-server/demo-server.mjs");
await import(pathToFileURL(apiServerPath).href);

import { createServer } from "vite";

const server = await createServer({
  configFile: "./vite.config.ts",
  server: {
    port: 5173,
    host: "0.0.0.0",
  },
});

await server.listen();
console.log("\n🚀 Painel Web do Hotel (Frontend + API) rodando perfeitamente!");
server.printUrls();

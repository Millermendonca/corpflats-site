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

// Import API and static server
const apiServerPath = path.resolve(__dirname, "./artifacts/api-server/demo-server.mjs");
await import(pathToFileURL(apiServerPath).href);

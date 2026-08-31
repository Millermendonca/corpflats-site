import fs from "fs";
import path from "path";
import https from "https";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure local uploads directory exists
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch {}
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = crypto.createHmac("sha256", "AWS4" + key).update(dateStamp).digest();
  const kRegion = crypto.createHmac("sha256", kDate).update(regionName).digest();
  const kService = crypto.createHmac("sha256", kRegion).update(serviceName).digest();
  const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest();
  return kSigning;
}

function uploadToCloudflareR2Direct(buffer, mimeType, key, r2Config) {
  return new Promise((resolve, reject) => {
    const host = `${r2Config.accountId}.r2.cloudflarestorage.com`;
    const region = "auto";
    const service = "s3";

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.substring(0, 8);

    const canonicalUri = `/${r2Config.bucketName}/${key}`;
    const canonicalQuerystring = "";

    const payloadHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const canonicalHeaders = `content-type:${mimeType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";

    const canonicalRequest = `PUT\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    const algorithm = "AWS4-HMAC-SHA256";
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${crypto.createHash("sha256").update(canonicalRequest).digest("hex")}`;

    const signingKey = getSignatureKey(r2Config.secretAccessKey, dateStamp, region, service);
    const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

    const authorizationHeader = `${algorithm} Credential=${r2Config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const options = {
      hostname: host,
      port: 443,
      path: `/${r2Config.bucketName}/${key}`,
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
        "Content-Length": buffer.length,
        "x-amz-date": amzDate,
        "x-amz-content-sha256": payloadHash,
        "Authorization": authorizationHeader
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => { responseBody += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const publicBase = r2Config.publicUrl || `https://${r2Config.bucketName}.${r2Config.accountId}.r2.cloudflarestorage.com`;
          const finalUrl = `${publicBase.replace(/\/$/, '')}/${key}`;
          resolve(finalUrl);
        } else {
          reject(new Error(`Cloudflare R2 HTTP ${res.statusCode}: ${responseBody}`));
        }
      });
    });

    req.on("error", (e) => reject(e));
    req.write(buffer);
    req.end();
  });
}

/**
 * Storage Service for CorpFlats
 * Supports Cloudflare R2 with Native SigV4 and Optimized Local Storage Fallback
 */
export async function uploadImageToStorage(base64Data, filenamePrefix = "doc", db) {
  if (!base64Data || typeof base64Data !== "string") return null;

  // Extract mime type and raw buffer
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  const mimeType = matches ? matches[1] : "image/webp";
  const rawBase64 = matches ? matches[2] : base64Data;
  const buffer = Buffer.from(rawBase64, "base64");

  const ext = mimeType.includes("png") ? "png" : mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : "webp";
  const uniqueName = `${filenamePrefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
  const key = `guests/${uniqueName}`;

  // 1. Check if Cloudflare R2 credentials are configured
  const r2Config = db?.storageConfig?.r2 || {
    accountId: process.env.R2_ACCOUNT_ID || "00752c8763b093da1493e435b7d239ac",
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "cfbbcb2bc82c33e4dfbc4c8761d64083",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "3202f4293c1aa46b994c100f1121597813e8fa9992bddb1808734c93d69e29ba",
    bucketName: process.env.R2_BUCKET_NAME || "corpflats-docs",
    publicUrl: process.env.R2_PUBLIC_URL || "https://pub-b6324a98d1d943eda4e7285b5d23a963.r2.dev"
  };

  if (r2Config.accessKeyId && r2Config.secretAccessKey && r2Config.accountId) {
    try {
      const cloudUrl = await uploadToCloudflareR2Direct(buffer, mimeType, key, r2Config);
      return cloudUrl;
    } catch (err) {
      console.warn("⚠️ Cloudflare R2 Upload falhou, usando armazenamento local:", err.message);
    }
  }

  // 2. Fallback: Save to optimized local disk uploads
  try {
    const localFilePath = path.join(UPLOADS_DIR, uniqueName);
    fs.writeFileSync(localFilePath, buffer);
    return `/api/storage/files/${uniqueName}`;
  } catch {
    // If disk write fails, keep compressed base64
    return base64Data;
  }
}

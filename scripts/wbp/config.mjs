/**
 * Channel Manager Integration Configuration & General Switch (Channex.io v1 & WBP).
 *
 * Operational General Switch:
 * - 'off': 100% inert. 0 outbound requests, 0 active polling timers.
 *          Callbacks return HTTP 200 { ErrorCode: 1031, Error: "Integration disabled" }
 *          without saving bookings or modifying PMS state.
 * - 'observe': Inbound webhooks and outbound read calls are active.
 *              Raw payloads are recorded into durable storage for observation,
 *              but NO actual PMS reservations are created and NO automations fire.
 * - 'auto': Full automatic synchronization.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let _wbpEnvLoaded = false;

/**
 * Loads .env variables once if not already present in process.env (skipped in test environments for strict isolation).
 */
export function loadWbpEnvFiles(force = false) {
  if (
    process.env.NODE_ENV === "test" ||
    process.execArgv.includes("--test") ||
    process.argv.includes("--test")
  ) {
    return;
  }
  if (_wbpEnvLoaded && !force) {
    return;
  }
  _wbpEnvLoaded = true;
  const potentialPaths = [
    "/etc/secrets/.env",
    "/etc/secrets/env",
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "../../../.env"),
    path.resolve(__dirname, "../../.env"),
    path.resolve(__dirname, "../.env")
  ];
  for (const p of potentialPaths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const idx = trimmed.indexOf("=");
          if (idx > 0) {
            const key = trimmed.slice(0, idx).trim();
            let val = trimmed.slice(idx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key] || process.env[key] === "") {
              process.env[key] = val;
            }
          }
        }
      }
    } catch (_) {}
  }
}

export const WBP_MODES = {
  OFF: "off",
  OBSERVE: "observe",
  AUTO: "auto"
};

export const CHANNEX_ENVIRONMENTS = {
  STAGING: "staging",
  PRODUCTION: "production"
};

/**
 * Default non-secret Channex Staging configuration for CorpFlats Soho Residence (19 flats).
 * Secrets (apiKey, webhookSecret) are strictly loaded from environment variables (.env).
 */
export const DEFAULT_CHANNEX_CONFIG = {
  provider: "channex",
  environment: CHANNEX_ENVIRONMENTS.STAGING,
  baseUrl: "https://staging.channex.io/api/v1",
  appOrigin: "https://staging.channex.io",
  propertyId: "0f29f1e1-b970-456c-9950-6f11f7a535b8",
  groupId: "d565df25-5a14-405b-89e0-85315b087f19",
  roomTypeId: "888b5a90-09cd-40e9-81fb-087127663233",
  ratePlanSemCafeId: "4269b8b7-d443-4522-a8ed-0c9f0153ae51",
  ratePlanComCafeId: "2c43ec3b-0cdc-45ed-8dde-210af7d6aa26",
  ratePlanSemCafeOptionIds: [
    "b8903d19-a83a-483c-a059-56ffbf9bef28",
    "4269b8b7-d443-4522-a8ed-0c9f0153ae51",
    "e2125b21-3a24-40f7-a9a5-2c708b8dd055"
  ],
  ratePlanComCafeOptionIds: [
    "983e62d5-b4ec-45b7-b228-8503fed545fd",
    "2c43ec3b-0cdc-45ed-8dde-210af7d6aa26",
    "173b49a8-ea9a-41b5-990b-44e3e1ccf6ce"
  ],
  currency: "BRL",
  timezone: "America/Sao_Paulo",
  stateLengthDays: 500
};

/**
 * Retrieves the current integration mode.
 * Priority: process.env.CHANNEX_INTEGRATION_MODE -> process.env.WBP_INTEGRATION_MODE -> db.settings.wbp_integration_mode -> 'off'.
 *
 * @param {object} [db] - PMS in-memory database reference
 * @returns {"off" | "observe" | "auto"}
 */
export function getIntegrationMode(db = null) {
  const chxEnvMode = process.env.CHANNEX_INTEGRATION_MODE;
  if (chxEnvMode && Object.values(WBP_MODES).includes(chxEnvMode)) {
    return chxEnvMode;
  }
  const envMode = process.env.WBP_INTEGRATION_MODE;
  if (envMode && Object.values(WBP_MODES).includes(envMode)) {
    return envMode;
  }
  const dbMode = db?.settings?.wbp_integration_mode;
  if (dbMode && Object.values(WBP_MODES).includes(dbMode)) {
    return dbMode;
  }
  return WBP_MODES.OFF;
}

/**
 * Updates the integration mode in the database settings.
 *
 * @param {"off" | "observe" | "auto"} mode
 * @param {object} db
 */
export function setIntegrationMode(mode, db) {
  if (!Object.values(WBP_MODES).includes(mode)) {
    throw new Error(`Modo de integração WBP inválido: '${mode}'. Valores válidos: 'off', 'observe', 'auto'.`);
  }
  if (db) {
    if (!db.settings) db.settings = {};
    db.settings.wbp_integration_mode = mode;
  }
  return mode;
}

/**
 * Checks whether the integration is active (either 'observe' or 'auto').
 *
 * @param {object} [db]
 * @returns {boolean}
 */
export function isWbpEnabled(db = null) {
  return getIntegrationMode(db) !== WBP_MODES.OFF;
}

/**
 * Checks whether the integration is in automatic mutation mode.
 *
 * @param {object} [db]
 * @returns {boolean}
 */
export function isWbpAutoMode(db = null) {
  return getIntegrationMode(db) === WBP_MODES.AUTO;
}

/**
 * Retrieves Channex.io REST API v1 connection and mapping configuration.
 * API Keys and HMAC secrets are read from environment variables first, with optional runtime override in memory.
 *
 * @param {object} [db]
 * @returns {object}
 */
export function getChannexConfig(db = null) {
  loadWbpEnvFiles();
  const saved = db?.settings?.channex_config || {};
  const environment = saved.environment || process.env.CHANNEX_ENVIRONMENT || DEFAULT_CHANNEX_CONFIG.environment;
  const isProduction = environment === CHANNEX_ENVIRONMENTS.PRODUCTION;
  const defaultBaseUrl = isProduction
    ? "https://app.channex.io/api/v1"
    : DEFAULT_CHANNEX_CONFIG.baseUrl;
  const defaultAppOrigin = isProduction
    ? "https://app.channex.io"
    : DEFAULT_CHANNEX_CONFIG.appOrigin;

  return {
    provider: process.env.OTA_PROVIDER || saved.provider || DEFAULT_CHANNEX_CONFIG.provider,
    mode: getIntegrationMode(db),
    environment,
    baseUrl: process.env.CHANNEX_BASE_URL || saved.baseUrl || defaultBaseUrl,
    appOrigin: process.env.CHANNEX_APP_ORIGIN || saved.appOrigin || defaultAppOrigin,
    apiKey: process.env.CHANNEX_API_KEY || saved.apiKey || "",
    webhookSecret: process.env.CHANNEX_WEBHOOK_SECRET || process.env.WBP_SHARED_SECRET || saved.webhookSecret || "",
    propertyId: saved.propertyId || process.env.CHANNEX_PROPERTY_ID || (isProduction ? "" : DEFAULT_CHANNEX_CONFIG.propertyId),
    groupId: saved.groupId || process.env.CHANNEX_GROUP_ID || (isProduction ? "" : DEFAULT_CHANNEX_CONFIG.groupId),
    roomTypeId: saved.roomTypeId || process.env.CHANNEX_ROOM_TYPE_ID || (isProduction ? "" : DEFAULT_CHANNEX_CONFIG.roomTypeId),
    ratePlanSemCafeId: saved.ratePlanSemCafeId || process.env.CHANNEX_RATE_PLAN_SEM_CAFE_ID || (isProduction ? "" : DEFAULT_CHANNEX_CONFIG.ratePlanSemCafeId),
    ratePlanComCafeId: saved.ratePlanComCafeId || process.env.CHANNEX_RATE_PLAN_COM_CAFE_ID || (isProduction ? "" : DEFAULT_CHANNEX_CONFIG.ratePlanComCafeId),
    currency: process.env.CHANNEX_CURRENCY || saved.currency || DEFAULT_CHANNEX_CONFIG.currency,
    timezone: process.env.CHANNEX_TIMEZONE || saved.timezone || DEFAULT_CHANNEX_CONFIG.timezone,
    stateLengthDays: parseInt(process.env.CHANNEX_STATE_LENGTH_DAYS || String(saved.stateLengthDays || DEFAULT_CHANNEX_CONFIG.stateLengthDays), 10),
    availabilityRateLimitPerMin: parseInt(process.env.CHANNEX_AVAIL_LIMIT_PER_MIN || "10", 10),
    restrictionsRateLimitPerMin: parseInt(process.env.CHANNEX_RESTRICTIONS_LIMIT_PER_MIN || "10", 10),
    rateLimitPauseMs: parseInt(process.env.CHANNEX_RATE_LIMIT_PAUSE_MS || "60000", 10),
    pollingIntervalMinutes: parseInt(process.env.CHANNEX_POLLING_INTERVAL_MINUTES || process.env.WBP_POLLING_INTERVAL_MINUTES || "15", 10),
    timeoutMs: parseInt(process.env.CHANNEX_TIMEOUT_MS || process.env.WBP_TIMEOUT_MS || "15000", 10),
    maxRetries: parseInt(process.env.CHANNEX_MAX_RETRIES || process.env.WBP_MAX_RETRIES || "3", 10)
  };
}

/**
 * Resolves the active Channel Manager provider ("channex" or "wbp").
 *
 * @param {object} [db]
 * @returns {"channex" | "wbp"}
 */
export function getActiveProvider(db = null) {
  const envProv = process.env.OTA_PROVIDER;
  if (envProv === "wbp" || envProv === "channex") {
    return envProv;
  }
  const savedProv = db?.settings?.channex_config?.provider || db?.settings?.ota_provider;
  if (savedProv === "wbp" || savedProv === "channex") {
    return savedProv;
  }
  return "channex";
}

/**
 * Updates non-destructive Channex mapping and environment settings in db.settings.channex_config.
 *
 * @param {object} partial
 * @param {object} db
 * @returns {object}
 */
export function updateChannexConfig(partial = {}, db = null) {
  if (db) {
    if (!db.settings) db.settings = {};
    if (!db.settings.channex_config) db.settings.channex_config = {};
    const target = db.settings.channex_config;

    const allowedFields = [
      "provider",
      "environment",
      "baseUrl",
      "appOrigin",
      "propertyId",
      "groupId",
      "roomTypeId",
      "ratePlanSemCafeId",
      "ratePlanComCafeId",
      "currency",
      "timezone",
      "stateLengthDays"
    ];
    for (const k of allowedFields) {
      if (partial[k] !== undefined) {
        target[k] = partial[k];
      }
    }
    // Sync into db.wbpMapping if roomTypeId / ratePlanIds are updated
    if (db.wbpMapping) {
      if (partial.roomTypeId && db.wbpMapping.room) {
        db.wbpMapping.room.channex_room_type_id = partial.roomTypeId;
      }
      if (Array.isArray(db.wbpMapping.ratePlans)) {
        for (const rp of db.wbpMapping.ratePlans) {
          if (rp.pms_plan_id === "sem_cafe" && partial.ratePlanSemCafeId) {
            rp.channex_rate_plan_id = partial.ratePlanSemCafeId;
          }
          if (rp.pms_plan_id === "com_cafe" && partial.ratePlanComCafeId) {
            rp.channex_rate_plan_id = partial.ratePlanComCafeId;
          }
        }
      }
    }
  }
  return getChannexConfig(db);
}

/**
 * Retrieves WBP connection and credential configuration (preserved for backwards compatibility).
 * Secrets are strictly read from environment variables to prevent storage in database blobs.
 *
 * @param {object} [db]
 * @returns {object}
 */
export function getWbpConfig(db = null) {
  return {
    mode: getIntegrationMode(db),
    baseUrl: process.env.WBP_BASE_URL || "https://secure.webbookingpro.com/api/cloudpms",
    pmsCid: process.env.WBP_PMS_CID || "gfm1",
    sharedSecret: process.env.WBP_SHARED_SECRET || "",
    wbpPropertyId: process.env.WBP_PROPERTY_ID || "111",
    wbpPropertyPassword: process.env.WBP_PROPERTY_PASSWORD || "",
    pmsPropertyId: process.env.WBP_PMS_PROPERTY_ID || "soho-19",
    currency: process.env.WBP_CURRENCY || "BRL",
    pollingIntervalMinutes: parseInt(process.env.WBP_POLLING_INTERVAL_MINUTES || "30", 10),
    timeoutMs: parseInt(process.env.WBP_TIMEOUT_MS || "15000", 10),
    maxRetries: parseInt(process.env.WBP_MAX_RETRIES || "3", 10)
  };
}

/**
 * Checks if provisional messages feature is enabled.
 * Default is FALSE per Requirement R7.
 *
 * @param {object} [db]
 * @returns {boolean}
 */
export function isProvisionalMessagesEnabled(db = null) {
  if (process.env.WBP_PROVISIONAL_MESSAGES_ENABLED === "true") return true;
  return db?.settings?.wbp_provisional_messages_enabled === true;
}

/**
 * Checks if provisional reviews feature is enabled.
 * Default is FALSE per Requirement R7.
 *
 * @param {object} [db]
 * @returns {boolean}
 */
export function isProvisionalReviewsEnabled(db = null) {
  if (process.env.WBP_PROVISIONAL_REVIEWS_ENABLED === "true") return true;
  return db?.settings?.wbp_provisional_reviews_enabled === true;
}

/**
 * Toggles provisional messages feature in database settings.
 *
 * @param {boolean} enabled
 * @param {object} db
 * @returns {boolean}
 */
export function setProvisionalMessagesEnabled(enabled, db) {
  if (db) {
    if (!db.settings) db.settings = {};
    db.settings.wbp_provisional_messages_enabled = Boolean(enabled);
  }
  return Boolean(enabled);
}

/**
 * Toggles provisional reviews feature in database settings.
 *
 * @param {boolean} enabled
 * @param {object} db
 * @returns {boolean}
 */
export function setProvisionalReviewsEnabled(enabled, db) {
  if (db) {
    if (!db.settings) db.settings = {};
    db.settings.wbp_provisional_reviews_enabled = Boolean(enabled);
  }
  return Boolean(enabled);
}

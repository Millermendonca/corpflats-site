/**
 * WebBookingPro (WBP) Integration Configuration & General Switch.
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

export const WBP_MODES = {
  OFF: "off",
  OBSERVE: "observe",
  AUTO: "auto"
};

/**
 * Retrieves the current WBP integration mode.
 * Priority: process.env.WBP_INTEGRATION_MODE -> db.settings.wbp_integration_mode -> 'off'.
 *
 * @param {object} [db] - PMS in-memory database reference
 * @returns {"off" | "observe" | "auto"}
 */
export function getIntegrationMode(db = null) {
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
 * Checks whether the WBP integration is active (either 'observe' or 'auto').
 *
 * @param {object} [db]
 * @returns {boolean}
 */
export function isWbpEnabled(db = null) {
  return getIntegrationMode(db) !== WBP_MODES.OFF;
}

/**
 * Checks whether the WBP integration is in automatic mutation mode.
 *
 * @param {object} [db]
 * @returns {boolean}
 */
export function isWbpAutoMode(db = null) {
  return getIntegrationMode(db) === WBP_MODES.AUTO;
}

/**
 * Retrieves WBP connection and credential configuration.
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


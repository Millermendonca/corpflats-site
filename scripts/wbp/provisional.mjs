import {
  getIntegrationMode,
  isWbpEnabled,
  WBP_MODES,
  isProvisionalMessagesEnabled,
  isProvisionalReviewsEnabled,
  setProvisionalMessagesEnabled,
  setProvisionalReviewsEnabled
} from "./config.mjs";

/**
 * Re-export configuration helpers for external callers.
 */
export {
  isProvisionalMessagesEnabled,
  isProvisionalReviewsEnabled,
  setProvisionalMessagesEnabled,
  setProvisionalReviewsEnabled
};

/**
 * WbpProvisionalAdapter
 *
 * Implements Feature 27 (Provisional Messages & Reviews Adapters — Requirement R7).
 * Strictly isolated behind this adapter, disabled by default, and marked as provisional / experimental.
 */
export class WbpProvisionalAdapter {
  /**
   * @param {object} [client] - Instance of WBPClient
   * @param {object} [db] - PMS in-memory database reference
   */
  constructor(client = null, db = null) {
    this.client = client;
    this.db = db;
  }

  /**
   * Sets or updates client instance.
   * @param {object} client
   */
  setClient(client) {
    this.client = client;
  }

  /**
   * Sets or updates database reference.
   * @param {object} db
   */
  setDb(db) {
    this.db = db;
  }

  /**
   * Fetches incoming guest messages from WebBookingPro / OTAs.
   * Returns empty array when disabled or general switch is off.
   *
   * @param {object} [options]
   * @param {string} [options.propertyId]
   * @param {object} [options.db]
   * @param {number} [options.limit=50]
   * @param {boolean} [options.bypassSwitch=false]
   * @returns {Promise<object>}
   */
  async getMessages({ propertyId = null, db = null, limit = 50, bypassSwitch = false } = {}) {
    const targetDb = db || this.db;

    // 1. General switch check
    if (!bypassSwitch && !isWbpEnabled(targetDb)) {
      return {
        success: true,
        enabled: false,
        provisional: true,
        experimental: true,
        messages: [],
        reason: "Integration disabled (mode = 'off')."
      };
    }

    // 2. Provisional messages toggle check (Default: FALSE)
    if (!bypassSwitch && !isProvisionalMessagesEnabled(targetDb)) {
      return {
        success: true,
        enabled: false,
        provisional: true,
        experimental: true,
        messages: [],
        notice: "Provisional messages feature is disabled by default (Requirement R7)."
      };
    }

    if (!this.client) {
      throw new Error("WBPClient não configurado no adaptador provisório.");
    }

    const propId = propertyId || this.client.wbpPropertyId || "111";
    const res = await this.client.request(
      "GetMessages",
      { wbp_property_id: propId },
      { bypassSwitch }
    );

    const rawList = res?.Messages || res?.messages || [];
    const normalized = rawList.map((m, idx) => {
      const isFromGuest = m.sender === "guest" || m.sender === "customer";
      return {
        id: `wbp_msg_${m.wbp_Message_id || m.id || idx}`,
        wbpMessageId: m.wbp_Message_id || m.id || null,
        orderId: m.order_id || m.OrderId || null,
        fromMe: !isFromGuest,
        sender: isFromGuest ? "guest" : "operator",
        senderName: m.senderName || (isFromGuest ? "Hóspede OTA" : "CorpFlats"),
        text: m.message || m.text || m.body || "",
        timestamp: m.timestamp || m.date || new Date().toISOString(),
        channel: m.channel || "wbp",
        status: "delivered",
        provisional: true
      };
    });

    return {
      success: true,
      enabled: true,
      provisional: true,
      experimental: true,
      count: normalized.length,
      messages: normalized,
      notice: "Provisional messages adapter: official WebBookingPro schema is unconfirmed."
    };
  }

  /**
   * Sends an outbound reply or message to an OTA guest via WebBookingPro.
   *
   * @param {object} params
   * @param {string} [params.propertyId]
   * @param {string|number} [params.messageId]
   * @param {string} [params.recipient]
   * @param {string} params.text
   * @param {string} [params.channel="wbp"]
   * @param {object} [params.db]
   * @param {boolean} [params.bypassSwitch=false]
   * @returns {Promise<object>}
   */
  async sendMessage({
    propertyId = null,
    messageId = 111,
    recipient = null,
    text,
    channel = "wbp",
    db = null,
    bypassSwitch = false
  } = {}) {
    const targetDb = db || this.db;

    if (!bypassSwitch && !isProvisionalMessagesEnabled(targetDb)) {
      return {
        success: false,
        enabled: false,
        provisional: true,
        experimental: true,
        error: "Provisional messages feature is disabled by default (Requirement R7)."
      };
    }

    if (!text || typeof text !== "string" || !text.trim()) {
      throw new Error("Campo 'text' é obrigatório para envio de mensagem provisória.");
    }

    if (!this.client) {
      throw new Error("WBPClient não configurado no adaptador provisório.");
    }

    const propId = propertyId || this.client.wbpPropertyId || "111";
    const res = await this.client.request(
      "SendMessage",
      {
        wbp_property_id: propId,
        wbp_Message_id: messageId || 111,
        message: text.trim()
      },
      { bypassSwitch }
    );

    return {
      success: true,
      provisional: true,
      experimental: true,
      messageId: res?.wbp_Message_id || messageId || 111,
      text: text.trim(),
      sentAt: new Date().toISOString()
    };
  }

  /**
   * Fetches guest reviews from WebBookingPro / OTAs.
   * Returns empty array when disabled or general switch is off.
   *
   * @param {object} [options]
   * @param {string} [options.propertyId]
   * @param {object} [options.db]
   * @param {number} [options.limit=50]
   * @param {boolean} [options.bypassSwitch=false]
   * @returns {Promise<object>}
   */
  async getReviews({ propertyId = null, db = null, limit = 50, bypassSwitch = false } = {}) {
    const targetDb = db || this.db;

    // 1. General switch check
    if (!bypassSwitch && !isWbpEnabled(targetDb)) {
      return {
        success: true,
        enabled: false,
        provisional: true,
        experimental: true,
        reviews: [],
        reason: "Integration disabled (mode = 'off')."
      };
    }

    // 2. Provisional reviews toggle check (Default: FALSE)
    if (!bypassSwitch && !isProvisionalReviewsEnabled(targetDb)) {
      return {
        success: true,
        enabled: false,
        provisional: true,
        experimental: true,
        reviews: [],
        notice: "Provisional reviews feature is disabled by default (Requirement R7)."
      };
    }

    if (!this.client) {
      throw new Error("WBPClient não configurado no adaptador provisório.");
    }

    const propId = propertyId || this.client.wbpPropertyId || "111";
    const res = await this.client.request(
      "GetReviews",
      { wbp_property_id: propId },
      { bypassSwitch }
    );

    const rawList = res?.Reviews || res?.reviews || [];
    const normalized = rawList.map((r, idx) => {
      const rawRating = Number(r.rating || r.score || 5);
      const starRating =
        rawRating > 5
          ? Math.max(1, Math.min(5, Math.round(rawRating / 2)))
          : Math.max(1, Math.min(5, Math.round(rawRating)));

      const tone =
        rawRating >= 8 || starRating >= 4
          ? "positive"
          : rawRating <= 4 || starRating <= 2
          ? "negative"
          : "neutral";

      return {
        id: `wbp_rev_${r.wbp_review_id || r.id || idx}`,
        wbpReviewId: r.wbp_review_id || r.id || null,
        orderId: r.order_id || r.OrderId || null,
        author: r.guest_name || r.customer_name || r.author || "Hóspede OTA",
        rating: starRating,
        rawRating,
        channel: r.channel || "wbp",
        flatMentioned: r.flatNumber || r.room || "",
        comment: r.comment || r.text || r.review || "",
        date: r.review_date || r.date || new Date().toISOString().slice(0, 10),
        tone,
        status: r.response ? "answered" : "pending",
        response: r.response || null,
        provisional: true
      };
    });

    return {
      success: true,
      enabled: true,
      provisional: true,
      experimental: true,
      count: normalized.length,
      reviews: normalized,
      notice: "Provisional reviews adapter: official WebBookingPro schema is unconfirmed."
    };
  }

  /**
   * Responds to an OTA guest review.
   *
   * @param {object} params
   * @param {string} [params.propertyId]
   * @param {string|number} params.reviewId
   * @param {string} params.responseText
   * @param {object} [params.db]
   * @param {boolean} [params.bypassSwitch=false]
   * @returns {Promise<object>}
   */
  async respondReview({
    propertyId = null,
    reviewId,
    responseText,
    db = null,
    bypassSwitch = false
  } = {}) {
    const targetDb = db || this.db;

    if (!bypassSwitch && !isProvisionalReviewsEnabled(targetDb)) {
      return {
        success: false,
        enabled: false,
        provisional: true,
        experimental: true,
        error: "Provisional reviews feature is disabled by default (Requirement R7)."
      };
    }

    if (!reviewId) {
      throw new Error("Campo 'reviewId' é obrigatório para responder à avaliação.");
    }

    if (!responseText || typeof responseText !== "string" || !responseText.trim()) {
      throw new Error("Campo 'responseText' é obrigatório para responder à avaliação.");
    }

    if (!this.client) {
      throw new Error("WBPClient não configurado no adaptador provisório.");
    }

    const propId = propertyId || this.client.wbpPropertyId || "111";
    const res = await this.client.request(
      "RespondReview",
      {
        wbp_property_id: propId,
        wbp_review_id: reviewId,
        response: responseText.trim()
      },
      { bypassSwitch }
    );

    return {
      success: true,
      provisional: true,
      experimental: true,
      reviewId,
      response: responseText.trim(),
      respondedAt: new Date().toISOString()
    };
  }
}

// Global Singleton Instance
let defaultProvisionalAdapter = null;

/**
 * Returns or initializes the shared WbpProvisionalAdapter singleton.
 *
 * @param {object} [client]
 * @param {object} [db]
 * @returns {WbpProvisionalAdapter}
 */
export function getProvisionalAdapter(client = null, db = null) {
  if (!defaultProvisionalAdapter) {
    defaultProvisionalAdapter = new WbpProvisionalAdapter(client, db);
  } else {
    if (client) defaultProvisionalAdapter.setClient(client);
    if (db) defaultProvisionalAdapter.setDb(db);
  }
  return defaultProvisionalAdapter;
}

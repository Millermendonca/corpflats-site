import crypto from "node:crypto";

const MOCK_META_PIXEL_IDS = new Set([
  "7489123891023",
  "000000000000000",
  "123456789012345",
  "111111111111111",
]);

const MOCK_GOOGLE_ADS_IDS = new Set([
  "AW-9481923",
  "9481923",
  "AW-000000000",
  "AW-123456789",
]);

const MOCK_CAPI_TOKENS = new Set([
  "EAABwz...",
  "EAABwz",
  "SEU_TOKEN_AQUI",
  "YOUR_ACCESS_TOKEN",
]);

const OTA_RELAY_EMAIL_REGEX =
  /(@guest\.booking\.com|@airbnb\.com|@m\.expediapartnercentral\.com|@expediapartnercentral\.com|@anonymized\.|no-?reply@)/i;

const PLACEHOLDER_GUEST_NAME_REGEX =
  /^(h[óo]spede(\s+\d+)?|\d+[º°a]?\s*h[óo]spede|a\s*definir|bloqueio|teste|sem\s*nome|nao\s*informado|não\s*informado|guest)$/i;

const GENERIC_INVALID_ZIPS = new Set(["28035000", "00000000", "99999999"]);

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function stripAccentsLower(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeNameTokenForMeta(value) {
  return stripAccentsLower(value).replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
}

function normalizeCityForMeta(value) {
  return stripAccentsLower(value).replace(/[^a-z]/g, "");
}

function normalizeBrPhoneDigits(rawPhone) {
  let digits = digitsOnly(rawPhone);
  if (!digits) return "";
  digits = digits.replace(/^0+/, "");
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return digits;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }
  return "";
}

function normalizeZipBr(rawZip) {
  const digits = digitsOnly(rawZip);
  if (!digits || digits.length < 5 || GENERIC_INVALID_ZIPS.has(digits)) {
    return "";
  }
  return digits.slice(0, 8);
}

function splitGuestName(rawName) {
  const cleaned = String(rawName || "").replace(/\s+/g, " ").trim();
  if (!cleaned || PLACEHOLDER_GUEST_NAME_REGEX.test(cleaned)) {
    return { firstName: "", lastName: "" };
  }
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function sanitizeEmailForAds(rawEmail) {
  const email = String(rawEmail || "").trim().toLowerCase();
  if (!email || OTA_RELAY_EMAIL_REGEX.test(email)) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "";
  return email;
}

function escapeHtmlAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeCsvCell(value) {
  const str = value == null ? "" : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function parseGoogleSiteVerification(raw) {
  let text = String(raw || "").trim();
  if (!text) return "";
  const metaMatch = text.match(/content\s*=\s*["']([^"']+)["']/i);
  if (metaMatch && metaMatch[1]) {
    text = metaMatch[1].trim();
  }
  text = text.replace(/^google-site-verification\s*=\s*/i, "").trim();
  text = text.replace(/[<>"'&\s]/g, "");
  if (!/^[A-Za-z0-9_.-]{8,128}$/.test(text)) return "";
  return text;
}

function parseGa4MeasurementId(raw) {
  const text = String(raw || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b(G-[A-Z0-9]{4,24})\b/);
  const candidate = match ? match[1] : text;
  if (!/^G-[A-Z0-9]{4,24}$/.test(candidate)) return "";
  if (candidate === "G-XXXXXXXXXX" || candidate === "G-0000000000") return "";
  return candidate;
}

function parseGoogleAdsIdAndLabel(rawAdsId, rawLabel) {
  let adsText = String(rawAdsId || "").trim();
  let labelText = String(rawLabel || "").trim();

  if (adsText.includes("/")) {
    const [left, right] = adsText.split("/", 2);
    adsText = left.trim();
    if (!labelText && right) {
      labelText = right.trim();
    }
  }

  if (labelText.includes("/")) {
    const parts = labelText.split("/");
    const leftCandidate = parts[0].trim();
    const rightCandidate = parts.slice(1).join("/").trim();
    if (!adsText && /^AW-\d{6,16}$/i.test(leftCandidate)) {
      adsText = leftCandidate;
    }
    labelText = rightCandidate;
  }

  if (/^\d{8,16}$/.test(adsText) && !MOCK_GOOGLE_ADS_IDS.has(adsText)) {
    adsText = `AW-${adsText}`;
  } else {
    adsText = adsText.replace(/^aw-/i, "AW-");
  }

  if (MOCK_GOOGLE_ADS_IDS.has(adsText) || !/^AW-\d{6,16}$/.test(adsText)) {
    adsText = "";
  }

  labelText = labelText.replace(/[^A-Za-z0-9_-]/g, "");
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(labelText)) {
    labelText = "";
  }

  return { googleAdsId: adsText, googleAdsConversionLabel: labelText };
}

function parseMetaPixelId(rawPixelId) {
  const text = String(rawPixelId || "").trim();
  if (!text || MOCK_META_PIXEL_IDS.has(text)) return "";
  const digits = digitsOnly(text);
  if (!digits || MOCK_META_PIXEL_IDS.has(digits)) return "";
  if (!/^\d{10,20}$/.test(digits)) return "";
  return digits;
}

function isMockCapiToken(rawToken) {
  const token = String(rawToken || "").trim();
  if (!token) return true;
  if (MOCK_CAPI_TOKENS.has(token)) return true;
  if (/^EAABwz\.+$/i.test(token)) return true;
  if (token.length < 20) return true;
  return false;
}

function parseMetaCapiToken(target) {
  const hasExplicitCapiKey = Object.prototype.hasOwnProperty.call(target, "metaCapiToken");
  const rawPrimary = hasExplicitCapiKey ? target.metaCapiToken : target.metaApiToken;
  const rawFallback = target.metaApiToken;

  let candidate = String(rawPrimary ?? "").trim();
  if (!candidate && !hasExplicitCapiKey && rawFallback) {
    candidate = String(rawFallback).trim();
  }
  if (!candidate && hasExplicitCapiKey && target.metaCapiToken == null && rawFallback) {
    candidate = String(rawFallback).trim();
  }

  candidate = candidate.replace(/[\r\n\t"'<>]/g, "").trim();
  if (isMockCapiToken(candidate)) return "";
  return candidate;
}

export function sanitizeTrackingSettings(adSettings = {}) {
  const target =
    adSettings && typeof adSettings === "object" && !Array.isArray(adSettings)
      ? adSettings
      : {};

  const ga4MeasurementId = parseGa4MeasurementId(target.ga4MeasurementId);
  const { googleAdsId, googleAdsConversionLabel } = parseGoogleAdsIdAndLabel(
    target.googleAdsId,
    target.googleAdsConversionLabel
  );
  const googleSiteVerification = parseGoogleSiteVerification(target.googleSiteVerification);
  const metaPixelId = parseMetaPixelId(target.metaPixelId);
  const metaCapiToken = parseMetaCapiToken(target);
  const rawTestCode = String(target.metaTestEventCode || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "");
  const metaTestEventCode = /^[A-Za-z0-9_-]{3,40}$/.test(rawTestCode) ? rawTestCode : "";

  target.ga4MeasurementId = ga4MeasurementId;
  target.googleAdsId = googleAdsId;
  target.googleAdsConversionLabel = googleAdsConversionLabel;
  target.googleSiteVerification = googleSiteVerification;
  target.metaPixelId = metaPixelId;
  target.metaCapiToken = metaCapiToken;
  target.metaApiToken = metaCapiToken;
  target.metaTestEventCode = metaTestEventCode;

  if (target.autoPilotEnabled === undefined) {
    target.autoPilotEnabled = true;
  } else {
    target.autoPilotEnabled = Boolean(target.autoPilotEnabled);
  }
  if (target.lowOccupancyThresholdPct !== undefined) {
    target.lowOccupancyThresholdPct = Number(target.lowOccupancyThresholdPct) || 60;
  }
  if (target.highOccupancyPausePct !== undefined) {
    target.highOccupancyPausePct = Number(target.highOccupancyPausePct) || 85;
  }
  if (target.dailyBudgetLimit !== undefined || target.defaultDailyBudget !== undefined) {
    const budget = Number(target.dailyBudgetLimit ?? target.defaultDailyBudget) || 50;
    target.dailyBudgetLimit = budget;
    target.defaultDailyBudget = budget;
  }

  return target;
}

export function getPublicTrackingConfig(adSettings = {}) {
  const rawSource =
    adSettings &&
    typeof adSettings === "object" &&
    adSettings.adSettings &&
    typeof adSettings.adSettings === "object"
      ? adSettings.adSettings
      : adSettings || {};

  const clean = sanitizeTrackingSettings({ ...rawSource });

  return {
    ga4MeasurementId: clean.ga4MeasurementId || "",
    googleAdsId: clean.googleAdsId || "",
    googleAdsConversionLabel: clean.googleAdsConversionLabel || "",
    googleSiteVerification: clean.googleSiteVerification || "",
    metaPixelId: clean.metaPixelId || "",
    hasMetaCapiConfigured: Boolean(clean.metaPixelId && clean.metaCapiToken),
  };
}

export function buildPublicTrackingHeadStub(adSettings = {}, options = {}) {
  const cfg = getPublicTrackingConfig(adSettings);
  const parts = [];

  if (cfg.googleSiteVerification && options.includeVerificationMeta !== false) {
    parts.push(
      `<meta name="google-site-verification" content="${escapeHtmlAttr(cfg.googleSiteVerification)}" />`
    );
  }

  const publicJson = JSON.stringify({
    ga4MeasurementId: cfg.ga4MeasurementId,
    googleAdsId: cfg.googleAdsId,
    googleAdsConversionLabel: cfg.googleAdsConversionLabel,
    metaPixelId: cfg.metaPixelId,
  }).replace(/</g, "\\u003c");

  const primaryGoogleTagId = cfg.ga4MeasurementId || cfg.googleAdsId || "";
  const hasAnyTag = Boolean(primaryGoogleTagId || cfg.metaPixelId);

  if (!hasAnyTag) {
    parts.push(
      `<script id="cf-tracking-config">window.__CORPFLATS_TRACKING__=${publicJson};</script>`
    );
    return parts.join("\n    ");
  }

  const inlineBootstrap = [
    `(function(w,d){`,
    `w.__CORPFLATS_TRACKING__=${publicJson};`,
    `w.__CF_TRACKING_BOOTSTRAPPED__=true;`,
  ];

  if (primaryGoogleTagId) {
    inlineBootstrap.push(
      `w.dataLayer=w.dataLayer||[];`,
      `w.gtag=w.gtag||function(){w.dataLayer.push(arguments);};`,
      `w.gtag("js",new Date());`
    );
    if (cfg.ga4MeasurementId) {
      inlineBootstrap.push(
        `w.gtag("config",${JSON.stringify(cfg.ga4MeasurementId)},{send_page_view:true,transport_type:"beacon"});`
      );
    }
    if (cfg.googleAdsId) {
      inlineBootstrap.push(`w.gtag("config",${JSON.stringify(cfg.googleAdsId)});`);
    }
  }

  if (cfg.metaPixelId) {
    inlineBootstrap.push(
      `if(!w.fbq){var n=w.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};`,
      `if(!w._fbq)w._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];}`,
      `w.fbq("init",${JSON.stringify(cfg.metaPixelId)});`,
      `w.fbq("track","PageView");`
    );
  }

  inlineBootstrap.push(
    `var loaded=false;`,
    `function loadVendorTags(){`,
    `if(loaded)return;loaded=true;`
  );

  if (primaryGoogleTagId) {
    inlineBootstrap.push(
      `var gs=d.createElement("script");gs.async=true;`,
      `gs.src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(primaryGoogleTagId)}";`,
      `d.head.appendChild(gs);`
    );
  }

  if (cfg.metaPixelId) {
    inlineBootstrap.push(
      `var fs=d.createElement("script");fs.async=true;`,
      `fs.src="https://connect.facebook.net/en_US/fbevents.js";`,
      `d.head.appendChild(fs);`
    );
  }

  inlineBootstrap.push(
    `}`,
    `var schedule=function(){if(w.requestIdleCallback){w.requestIdleCallback(loadVendorTags,{timeout:2500});}else{setTimeout(loadVendorTags,1800);}};`,
    `if(d.readyState==="complete"){schedule();}else{w.addEventListener("load",schedule,{once:true});}`,
    `["pointerdown","keydown","touchstart","scroll"].forEach(function(ev){w.addEventListener(ev,loadVendorTags,{once:true,passive:true});});`,
    `})(window,document);`
  );

  parts.push(`<script id="cf-tracking-bootstrap">${inlineBootstrap.join("")}</script>`);
  return parts.join("\n    ");
}

function isDirectWebsiteReservation(reservation) {
  const channel = String(reservation?.channel || reservation?.source || "")
    .toLowerCase()
    .trim();
  if (/booking|airbnb|expedia|decolar|channex|ota|vrbo|hoteis/i.test(channel)) {
    return false;
  }
  if (
    channel === "site_direto" ||
    channel === "site" ||
    channel === "website" ||
    channel === "motor_reservas"
  ) {
    return true;
  }
  const attr = reservation?.attribution;
  if (
    attr &&
    typeof attr === "object" &&
    (attr.sessionId || attr.gclid || attr.fbclid || attr.utm_source || attr.purchaseEventId)
  ) {
    return true;
  }
  return false;
}

function buildMetaFbc(attr = {}, fallbackTimestampMs = Date.now()) {
  if (attr.fbc && String(attr.fbc).startsWith("fb.")) {
    return String(attr.fbc).trim();
  }
  if (attr.fbclid) {
    const cleanFbclid = String(attr.fbclid).trim();
    if (cleanFbclid) {
      return `fb.1.${fallbackTimestampMs}.${cleanFbclid}`;
    }
  }
  return "";
}

export async function dispatchServerSidePurchaseConversion(db, reservation, options = {}) {
  if (!db || typeof db !== "object" || !reservation || typeof reservation !== "object") {
    return { skipped: true, reason: "missing_context" };
  }

  if (!isDirectWebsiteReservation(reservation)) {
    return {
      skipped: true,
      reason: "non_direct_channel",
      channel: reservation.channel || reservation.source || "",
    };
  }

  if (reservation.marketingConversionRecordedAt) {
    return {
      skipped: true,
      reason: "already_recorded",
      recordedAt: reservation.marketingConversionRecordedAt,
      eventId: reservation.marketingConversionEventId || "",
    };
  }

  const nowIso = new Date().toISOString();
  const resCode = String(reservation.code || reservation.id || `RES-${Date.now()}`);
  const attr =
    reservation.attribution && typeof reservation.attribution === "object"
      ? reservation.attribution
      : {};
  const eventId = String(options.eventId || attr.purchaseEventId || `pur_${resCode}`);

  reservation.marketingConversionRecordedAt = nowIso;
  reservation.marketingConversionEventId = eventId;

  const value = Math.max(
    0,
    Number(reservation.totalAmount ?? reservation.paidAmount ?? options.value ?? 0) || 0
  );

  // 1. Reconcile matching funnel / abandoned cart session to "concluido"
  if (Array.isArray(db.abandonedCarts)) {
    const resPhoneDigits = digitsOnly(reservation.guestPhone);
    for (const cart of db.abandonedCarts) {
      if (!cart || typeof cart !== "object") continue;
      const matchesCode = cart.reservationCode && cart.reservationCode === resCode;
      const matchesSession = attr.sessionId && cart.sessionId && cart.sessionId === attr.sessionId;
      const matchesPhoneAndDate =
        resPhoneDigits &&
        digitsOnly(cart.guestPhone) === resPhoneDigits &&
        cart.checkinDate === reservation.checkinDate &&
        cart.status !== "concluido";

      if (matchesCode || matchesSession || matchesPhoneAndDate) {
        cart.status = "concluido";
        cart.currentStep = 5;
        cart.currentStepName = "Pagamento Confirmado";
        cart.completedAt = nowIso;
        cart.reservationCode = resCode;
        if (value > 0) cart.totalAmount = value;
      }
    }
  }

  // 2. Record verified conversion for ROAS & Google Offline Conversions export
  if (!Array.isArray(db.marketingConversions)) {
    db.marketingConversions = [];
  }

  const conversionEntry = {
    id: `mconv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    eventId,
    reservationId: reservation.id ?? null,
    reservationCode: resCode,
    guestName: String(reservation.guestName || ""),
    guestEmail: sanitizeEmailForAds(reservation.guestEmail),
    guestPhone: String(reservation.guestPhone || ""),
    value: Number(value.toFixed(2)),
    currency: "BRL",
    paymentMethod: String(options.paymentMethod || reservation.paymentMethod || "pix"),
    triggerSource: String(options.source || options.trigger || "webhook_payment_confirmed"),
    checkinDate: String(reservation.checkinDate || ""),
    checkoutDate: String(reservation.checkoutDate || ""),
    nights: Math.max(1, Number(reservation.nights || 1)),
    utm_source: String(attr.utm_source || ""),
    utm_medium: String(attr.utm_medium || ""),
    utm_campaign: String(attr.utm_campaign || ""),
    utm_content: String(attr.utm_content || ""),
    utm_term: String(attr.utm_term || ""),
    gclid: String(attr.gclid || ""),
    gbraid: String(attr.gbraid || ""),
    wbraid: String(attr.wbraid || ""),
    fbclid: String(attr.fbclid || ""),
    fbp: String(attr.fbp || ""),
    fbc: buildMetaFbc(attr),
    landingPage: String(attr.landingPage || "/"),
    createdAt: nowIso,
    capiDispatched: false,
    capiStatus: "not_configured",
  };

  db.marketingConversions.unshift(conversionEntry);
  if (db.marketingConversions.length > 2000) {
    db.marketingConversions.length = 2000;
  }

  // 3. Attribute revenue to matching internal campaign if utm_campaign matches
  if (Array.isArray(db.adCampaigns) && conversionEntry.utm_campaign) {
    const normUtmCamp = stripAccentsLower(conversionEntry.utm_campaign).replace(/[^a-z0-9]/g, "");
    if (normUtmCamp) {
      const matchedCamp = db.adCampaigns.find((c) => {
        const normName = stripAccentsLower(c?.name || "").replace(/[^a-z0-9]/g, "");
        return normName && (normName === normUtmCamp || normName.includes(normUtmCamp));
      });
      if (matchedCamp) {
        matchedCamp.conversions = Number(matchedCamp.conversions || 0) + 1;
        matchedCamp.revenue = Number((Number(matchedCamp.revenue || 0) + value).toFixed(2));
        if (Number(matchedCamp.spent || 0) > 0) {
          matchedCamp.roas = Number((matchedCamp.revenue / Number(matchedCamp.spent)).toFixed(1));
        }
      }
    }
  }

  // 4. Server-Side Meta Conversions API (CAPI v20.0)
  const cleanSettings = sanitizeTrackingSettings(db.adSettings || {});
  if (!cleanSettings.metaPixelId || !cleanSettings.metaCapiToken) {
    return {
      ok: true,
      eventId,
      capiDispatched: false,
      capiStatus: "not_configured",
      conversion: conversionEntry,
    };
  }

  try {
    const cleanEmail = sanitizeEmailForAds(reservation.guestEmail);
    const cleanPhone = normalizeBrPhoneDigits(reservation.guestPhone);
    const { firstName, lastName } = splitGuestName(reservation.guestName);
    const normFn = normalizeNameTokenForMeta(firstName);
    const normLn = normalizeNameTokenForMeta(lastName);
    const normCity = normalizeCityForMeta(reservation.guestCity || "camposdosgoytacazes");
    const normState = stripAccentsLower(reservation.guestState || "rj").slice(0, 2);
    const cleanZip = normalizeZipBr(reservation.guestZipCode || reservation.guestCep);
    const externalKey = String(
      reservation.guestId || digitsOnly(reservation.guestCpf) || resCode
    )
      .trim()
      .toLowerCase();

    const userData = {
      country: [sha256Hex("br")],
    };
    if (cleanEmail) userData.em = [sha256Hex(cleanEmail)];
    if (cleanPhone) userData.ph = [sha256Hex(cleanPhone)];
    if (normFn) userData.fn = [sha256Hex(normFn)];
    if (normLn) userData.ln = [sha256Hex(normLn)];
    if (normCity) userData.ct = [sha256Hex(normCity)];
    if (normState) userData.st = [sha256Hex(normState)];
    if (cleanZip) userData.zp = [sha256Hex(cleanZip)];
    if (externalKey) userData.external_id = [sha256Hex(externalKey)];

    const clientIp = String(attr.clientIp || options.clientIp || "").trim();
    const clientUa = String(attr.clientUserAgent || options.clientUserAgent || "").trim();
    if (clientIp) userData.client_ip_address = clientIp;
    if (clientUa) userData.client_user_agent = clientUa;
    if (conversionEntry.fbp) userData.fbp = conversionEntry.fbp;
    if (conversionEntry.fbc) userData.fbc = conversionEntry.fbc;

    const landingUrl = conversionEntry.landingPage.startsWith("http")
      ? conversionEntry.landingPage
      : `https://corpflats.com.br${conversionEntry.landingPage.startsWith("/") ? "" : "/"}${conversionEntry.landingPage}`;

    const payload = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: "website",
          event_source_url: landingUrl,
          user_data: userData,
          custom_data: {
            currency: "BRL",
            value: Number(value.toFixed(2)),
            order_id: resCode,
            content_type: "product",
            content_ids: [String(reservation.flatNumber || reservation.category || "corpflats_suite")],
            num_items: Math.max(1, Number(reservation.nights || 1)),
          },
        },
      ],
      access_token: cleanSettings.metaCapiToken,
    };

    if (options.testEventCode) {
      payload.test_event_code = String(options.testEventCode).trim();
    }

    const endpoint = `https://graph.facebook.com/v20.0/${encodeURIComponent(cleanSettings.metaPixelId)}/events`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    const respJson = await response.json().catch(() => ({}));
    conversionEntry.capiDispatched = response.ok;
    conversionEntry.capiStatus = response.ok ? "sent" : `http_${response.status}`;
    conversionEntry.capiEventsReceived = respJson?.events_received ?? 0;
    conversionEntry.capiFbtraceId = respJson?.fbtrace_id || "";

    reservation.marketingCapiResult = {
      dispatchedAt: new Date().toISOString(),
      ok: response.ok,
      status: response.status,
      eventsReceived: respJson?.events_received ?? 0,
      fbtraceId: respJson?.fbtrace_id || "",
      error: respJson?.error?.message || undefined,
    };

    return {
      ok: true,
      eventId,
      capiDispatched: response.ok,
      capiStatus: conversionEntry.capiStatus,
      eventsReceived: respJson?.events_received ?? 0,
      fbtraceId: respJson?.fbtrace_id || "",
      conversion: conversionEntry,
    };
  } catch (err) {
    conversionEntry.capiDispatched = false;
    conversionEntry.capiStatus = "network_error";
    reservation.marketingCapiResult = {
      dispatchedAt: new Date().toISOString(),
      ok: false,
      error: err?.message || "Erro de rede ao contatar Meta CAPI",
    };
    return {
      ok: true,
      eventId,
      capiDispatched: false,
      capiStatus: "network_error",
      error: err?.message || "Erro de rede ao contatar Meta CAPI",
      conversion: conversionEntry,
    };
  }
}

export async function sendTestMetaCapiEvent(adSettings = {}, reqMeta = {}) {
  const merged = sanitizeTrackingSettings({
    ...(adSettings || {}),
    ...(reqMeta?.metaPixelId !== undefined ? { metaPixelId: reqMeta.metaPixelId } : {}),
    ...(reqMeta?.metaCapiToken !== undefined ? { metaCapiToken: reqMeta.metaCapiToken } : {}),
    ...(reqMeta?.metaApiToken !== undefined && reqMeta?.metaCapiToken === undefined
      ? { metaCapiToken: reqMeta.metaApiToken }
      : {}),
    ...(reqMeta?.testEventCode !== undefined
      ? { metaTestEventCode: reqMeta.testEventCode }
      : {}),
  });

  if (!merged.metaPixelId) {
    return {
      ok: false,
      success: false,
      status: "missing_pixel_id",
      message:
        "Informe um Meta Pixel ID numérico válido (15 ou 16 dígitos) antes de testar o disparo.",
    };
  }

  if (!merged.metaCapiToken) {
    return {
      ok: false,
      success: false,
      status: "missing_capi_token",
      message:
        "Informe o Token de Acesso real da API de Conversões (gerado no Gerenciador de Eventos da Meta) antes de testar.",
    };
  }

  const eventId = `test_capi_${Date.now()}`;
  const userData = {
    em: [sha256Hex("teste-capi@corpflats.com.br")],
    ct: [sha256Hex("camposdosgoytacazes")],
    st: [sha256Hex("rj")],
    country: [sha256Hex("br")],
  };

  if (reqMeta?.ip || reqMeta?.clientIp) {
    userData.client_ip_address = String(reqMeta.ip || reqMeta.clientIp).trim();
  }
  if (reqMeta?.userAgent || reqMeta?.clientUserAgent) {
    userData.client_user_agent = String(reqMeta.userAgent || reqMeta.clientUserAgent).trim();
  }

  const payload = {
    data: [
      {
        event_name: "PageView",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: "https://corpflats.com.br/",
        user_data: userData,
      },
    ],
    access_token: merged.metaCapiToken,
  };

  const testCode = String(reqMeta?.testEventCode || merged.metaTestEventCode || "").trim();
  if (testCode) {
    payload.test_event_code = testCode;
  }

  try {
    const endpoint = `https://graph.facebook.com/v20.0/${encodeURIComponent(merged.metaPixelId)}/events`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    const respJson = await response.json().catch(() => ({}));
    if (!response.ok) {
      const metaErrMsg =
        respJson?.error?.error_user_msg ||
        respJson?.error?.message ||
        `HTTP ${response.status}`;
      return {
        ok: false,
        success: false,
        status: "meta_rejected",
        httpStatus: response.status,
        message: `A Meta recusou o disparo: ${metaErrMsg}`,
        metaError: respJson?.error || null,
      };
    }

    return {
      ok: true,
      success: true,
      status: "sent",
      eventId,
      eventsReceived: respJson?.events_received ?? 1,
      fbtraceId: respJson?.fbtrace_id || "",
      testEventCodeUsed: testCode || null,
      message: testCode
        ? `Disparo recebido pela Meta (${respJson?.events_received ?? 1} evento, código ${testCode})! Confira a aba "Eventos de Teste" no Gerenciador de Eventos.`
        : `Conexão CAPI validada com sucesso (${respJson?.events_received ?? 1} evento recebido pela Meta, trace ${respJson?.fbtrace_id || "OK"})!`,
    };
  } catch (err) {
    return {
      ok: false,
      success: false,
      status: "network_error",
      message: `Falha de conexão ao contatar graph.facebook.com: ${err?.message || "timeout"}`,
    };
  }
}

function classifyReservationChannelBucket(rawChannel) {
  const ch = String(rawChannel || "").toLowerCase().trim();
  if (/booking|airbnb|expedia|decolar|hotels\.com|vrbo|hoteis|channex|ota/.test(ch)) {
    return "ota";
  }
  if (/site|direto|whatsapp|balcao|recepcao|walkin|telefone|motor_reservas/.test(ch)) {
    return "direct";
  }
  return ch ? "other" : "unknown";
}

function isWeekendCheckin(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return false;
  const parsed = new Date(`${dateStr.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const dow = parsed.getUTCDay(); // 5 = Fri, 6 = Sat
  return dow === 5 || dow === 6;
}

function isSunToThuCheckin(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return false;
  const parsed = new Date(`${dateStr.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const dow = parsed.getUTCDay(); // 0..4 = Sun..Thu
  return dow >= 0 && dow <= 4;
}

function aggregateGuestsForAudienceExport(db) {
  const guests = Array.isArray(db?.guests) ? db.guests : [];
  const reservations = Array.isArray(db?.reservations) ? db.reservations : [];

  const profileMap = new Map();
  const cpfIndex = new Map();
  const phoneIndex = new Map();
  const emailIndex = new Map();
  const guestIdIndex = new Map();

  const findExistingProfileKey = ({ guestId, cpf, phone, email }) => {
    if (guestId && guestIdIndex.has(String(guestId))) return guestIdIndex.get(String(guestId));
    if (cpf && cpfIndex.has(cpf)) return cpfIndex.get(cpf);
    if (phone && phoneIndex.has(phone)) return phoneIndex.get(phone);
    if (email && emailIndex.has(email)) return emailIndex.get(email);
    return null;
  };

  const registerIndexes = (key, profile) => {
    if (profile.guestId) guestIdIndex.set(String(profile.guestId), key);
    if (profile.cpf) cpfIndex.set(profile.cpf, key);
    if (profile.phone) phoneIndex.set(profile.phone, key);
    if (profile.email) emailIndex.set(profile.email, key);
  };

  for (const g of guests) {
    if (!g || typeof g !== "object") continue;
    const cpf = digitsOnly(g.cpf || g.document);
    const phone = normalizeBrPhoneDigits(g.phone || g.whatsapp || g.mobile);
    const email = sanitizeEmailForAds(g.email);
    const guestId = g.id != null ? String(g.id) : "";

    let key = findExistingProfileKey({ guestId, cpf, phone, email });
    if (!key) {
      key = `g_${guestId || cpf || phone || email || Math.random().toString(36).slice(2)}`;
      profileMap.set(key, {
        guestId,
        name: String(g.name || g.fullName || ""),
        email,
        phone,
        cpf,
        city: String(g.city || g.addressCity || ""),
        state: String(g.state || g.uf || g.addressState || ""),
        zip: normalizeZipBr(g.zipCode || g.cep || g.postalCode),
        hasCompany: Boolean(
          g.companyId ||
            g.companyName ||
            g.companyData?.cnpj ||
            (Array.isArray(g.tags) && g.tags.some((t) => /corporativo|empresa|b2b/i.test(String(t))))
        ),
        hasPet: Boolean(g.hasPet || g.petFriendly),
        otaCount: 0,
        directCount: 0,
        weekdayStays: 0,
        weekendStays: 0,
        workTripCount: 0,
        totalSpent: Math.max(0, Number(g.totalSpent || 0)),
        totalStays: Math.max(0, Number(g.totalStays || g.staysCount || 0)),
        reservationSpendSum: 0,
        reservationCount: 0,
      });
    }

    const prof = profileMap.get(key);
    if (!prof.name || PLACEHOLDER_GUEST_NAME_REGEX.test(prof.name)) {
      if (g.name && !PLACEHOLDER_GUEST_NAME_REGEX.test(String(g.name).trim())) {
        prof.name = String(g.name).trim();
      }
    }
    if (!prof.email && email) prof.email = email;
    if (!prof.phone && phone) prof.phone = phone;
    if (!prof.cpf && cpf) prof.cpf = cpf;
    if (!prof.city && g.city) prof.city = String(g.city);
    if (!prof.state && (g.state || g.uf)) prof.state = String(g.state || g.uf);
    if (!prof.zip) prof.zip = normalizeZipBr(g.zipCode || g.cep);

    if (Array.isArray(g.channelsUsed)) {
      for (const ch of g.channelsUsed) {
        const bucket = classifyReservationChannelBucket(ch);
        if (bucket === "ota") prof.otaCount += 1;
        if (bucket === "direct") prof.directCount += 1;
      }
    }

    registerIndexes(key, prof);
  };

  for (const r of reservations) {
    if (!r || typeof r !== "object") continue;
    const status = String(r.status || "").toLowerCase();
    if (status === "cancelled" || status === "cancelada" || status === "bloqueio") continue;

    const cpf = digitsOnly(r.guestCpf || r.cpf);
    const phone = normalizeBrPhoneDigits(r.guestPhone || r.phone);
    const email = sanitizeEmailForAds(r.guestEmail || r.email);
    const guestId = r.guestId != null ? String(r.guestId) : "";

    let key = findExistingProfileKey({ guestId, cpf, phone, email });
    if (!key) {
      if (!email && !phone) continue;
      key = `r_${guestId || cpf || phone || email}`;
      profileMap.set(key, {
        guestId,
        name: String(r.guestName || ""),
        email,
        phone,
        cpf,
        city: String(r.guestCity || ""),
        state: String(r.guestState || ""),
        zip: normalizeZipBr(r.guestZipCode || r.guestCep),
        hasCompany: false,
        hasPet: false,
        otaCount: 0,
        directCount: 0,
        weekdayStays: 0,
        weekendStays: 0,
        workTripCount: 0,
        totalSpent: 0,
        totalStays: 0,
        reservationSpendSum: 0,
        reservationCount: 0,
      });
    }

    const prof = profileMap.get(key);
    if ((!prof.name || PLACEHOLDER_GUEST_NAME_REGEX.test(prof.name)) && r.guestName) {
      if (!PLACEHOLDER_GUEST_NAME_REGEX.test(String(r.guestName).trim())) {
        prof.name = String(r.guestName).trim();
      }
    }
    if (!prof.email && email) prof.email = email;
    if (!prof.phone && phone) prof.phone = phone;
    if (!prof.cpf && cpf) prof.cpf = cpf;
    if (!prof.city && r.guestCity) prof.city = String(r.guestCity);
    if (!prof.state && r.guestState) prof.state = String(r.guestState);
    if (!prof.zip) prof.zip = normalizeZipBr(r.guestZipCode || r.guestCep);

    const bucket = classifyReservationChannelBucket(r.channel || r.source);
    if (bucket === "ota") prof.otaCount += 1;
    if (bucket === "direct") prof.directCount += 1;

    if (r.companyId || r.companyName || r.companyCnpj || r.isB2b) {
      prof.hasCompany = true;
    }
    if (r.isWorkTrip) {
      prof.workTripCount += 1;
    }
    if (r.bringingPet || r.hasPet) {
      prof.hasPet = true;
    }
    if (isWeekendCheckin(r.checkinDate)) {
      prof.weekendStays += 1;
    } else if (isSunToThuCheckin(r.checkinDate)) {
      prof.weekdayStays += 1;
    }

    prof.reservationCount += 1;
    prof.reservationSpendSum += Math.max(0, Number(r.totalAmount || 0));
    registerIndexes(key, prof);
  }

  const results = [];
  for (const prof of profileMap.values()) {
    if (!prof.email && !prof.phone) continue;
    const effectiveTotalSpent = Math.max(prof.totalSpent, prof.reservationSpendSum);
    const effectiveStays = Math.max(prof.totalStays, prof.reservationCount);
    const isCorporate = Boolean(
      prof.hasCompany ||
        prof.workTripCount > 0 ||
        (prof.weekdayStays > 0 && prof.weekendStays === 0)
    );
    const isWeekendLeisure = Boolean(
      !prof.hasCompany &&
        prof.workTripCount === 0 &&
        (prof.weekendStays > 0 || prof.hasPet)
    );
    const isOtaOnly = prof.otaCount >= 1 && prof.directCount === 0;
    const isVipLtv = effectiveTotalSpent >= 1500 || effectiveStays >= 2;

    results.push({
      ...prof,
      totalSpent: effectiveTotalSpent,
      totalStays: effectiveStays,
      isCorporate,
      isWeekendLeisure,
      isOtaOnly,
      isVipLtv,
    });
  }

  return results;
}

export function buildCustomerMatchCsv(
  db,
  { platform = "meta", segment = "ota_only", hashed = false } = {}
) {
  const normPlatform = String(platform || "meta").toLowerCase().trim();
  const normSegment = String(segment || "ota_only").toLowerCase().trim();
  const shouldHash =
    hashed === true ||
    hashed === 1 ||
    String(hashed).toLowerCase() === "true" ||
    String(hashed) === "1";

  const allProfiles = aggregateGuestsForAudienceExport(db);
  const filtered = allProfiles.filter((p) => {
    switch (normSegment) {
      case "ota_only":
        return p.isOtaOnly;
      case "corporate":
      case "corporativo":
        return p.isCorporate;
      case "weekend_leisure":
      case "weekend":
      case "lazer":
        return p.isWeekendLeisure;
      case "vip_ltv":
      case "vip":
        return p.isVipLtv;
      case "all":
      default:
        return true;
    }
  });

  if (normPlatform === "google") {
    const lines = ["Email,Phone,First Name,Last Name,Country,Zip"];
    for (const p of filtered) {
      const { firstName, lastName } = splitGuestName(p.name);
      const emailOut = p.email
        ? shouldHash
          ? sha256Hex(p.email.trim().toLowerCase())
          : p.email.trim().toLowerCase()
        : "";
      const e164Phone = p.phone ? `+${p.phone}` : "";
      const phoneOut = e164Phone
        ? shouldHash
          ? sha256Hex(e164Phone)
          : e164Phone
        : "";
      const fnOut = firstName
        ? shouldHash
          ? sha256Hex(firstName.trim().toLowerCase())
          : firstName.trim()
        : "";
      const lnOut = lastName
        ? shouldHash
          ? sha256Hex(lastName.trim().toLowerCase())
          : lastName.trim()
        : "";
      // Google Ads Customer Match spec: Country and Zip are NEVER hashed
      const countryOut = "BR";
      const zipOut = p.zip || "";

      lines.push(
        [emailOut, phoneOut, fnOut, lnOut, countryOut, zipOut]
          .map(escapeCsvCell)
          .join(",")
      );
    }
    return lines.join("\n");
  }

  // Default: Meta Ads Custom Audience + LTV Value
  const lines = ["email,phone,fn,ln,ct,st,zip,country,value"];
  for (const p of filtered) {
    const { firstName, lastName } = splitGuestName(p.name);
    const normFn = normalizeNameTokenForMeta(firstName);
    const normLn = normalizeNameTokenForMeta(lastName);
    const normCity = normalizeCityForMeta(p.city);
    const normState = stripAccentsLower(p.state).replace(/[^a-z]/g, "").slice(0, 2);
    const cleanZip = p.zip || "";
    const normCountry = "br";
    const ltvValue = Math.max(0, Number(p.totalSpent || 0)).toFixed(2);

    const emailOut = p.email ? (shouldHash ? sha256Hex(p.email) : p.email) : "";
    const phoneOut = p.phone ? (shouldHash ? sha256Hex(p.phone) : p.phone) : "";
    const fnOut = normFn ? (shouldHash ? sha256Hex(normFn) : normFn) : "";
    const lnOut = normLn ? (shouldHash ? sha256Hex(normLn) : normLn) : "";
    const ctOut = normCity ? (shouldHash ? sha256Hex(normCity) : normCity) : "";
    const stOut = normState ? (shouldHash ? sha256Hex(normState) : normState) : "";
    const zipOut = cleanZip ? (shouldHash ? sha256Hex(cleanZip) : cleanZip) : "";
    const countryOut = shouldHash ? sha256Hex(normCountry) : normCountry;
    // Meta Custom Audience LTV spec: value column is NEVER hashed
    const valueOut = ltvValue;

    lines.push(
      [emailOut, phoneOut, fnOut, lnOut, ctOut, stOut, zipOut, countryOut, valueOut]
        .map(escapeCsvCell)
        .join(",")
    );
  }
  return lines.join("\n");
}

function formatGoogleConversionTime(isoString) {
  const date = isoString ? new Date(isoString) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  // Convert to America/Sao_Paulo (-03:00) formatted as yyyy-MM-dd HH:mm:ss-03:00
  const brtMs = date.getTime() - 3 * 60 * 60 * 1000;
  const brt = new Date(brtMs);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${brt.getUTCFullYear()}-${pad(brt.getUTCMonth() + 1)}-${pad(brt.getUTCDate())} ` +
    `${pad(brt.getUTCHours())}:${pad(brt.getUTCMinutes())}:${pad(brt.getUTCSeconds())}-03:00`
  );
}

export function buildGoogleOfflineConversionsCsv(
  db,
  { conversionName = "Compra Site Oficial CorpFlats" } = {}
) {
  const seenKeys = new Set();
  const rows = [];

  const conversions = Array.isArray(db?.marketingConversions) ? db.marketingConversions : [];
  for (const conv of conversions) {
    if (!conv || !conv.gclid) continue;
    const dedupKey = conv.reservationCode || conv.eventId || conv.id;
    if (dedupKey && seenKeys.has(dedupKey)) continue;
    if (dedupKey) seenKeys.add(dedupKey);

    rows.push({
      gclid: String(conv.gclid).trim(),
      conversionName,
      conversionTime: formatGoogleConversionTime(conv.createdAt),
      conversionValue: Math.max(0, Number(conv.value || 0)).toFixed(2),
      currency: "BRL",
    });
  }

  const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
  for (const r of reservations) {
    if (!r || !r.attribution?.gclid) continue;
    const status = String(r.status || "").toLowerCase();
    const paymentStatus = String(r.paymentStatus || "").toLowerCase();
    const isPaidOrConfirmed =
      status === "confirmed" ||
      status === "checked_in" ||
      status === "checked_out" ||
      paymentStatus === "paid" ||
      paymentStatus === "approved" ||
      Boolean(r.paidAt || r.marketingConversionRecordedAt);
    if (!isPaidOrConfirmed) continue;

    const dedupKey = r.code || String(r.id || "");
    if (dedupKey && seenKeys.has(dedupKey)) continue;
    if (dedupKey) seenKeys.add(dedupKey);

    rows.push({
      gclid: String(r.attribution.gclid).trim(),
      conversionName,
      conversionTime: formatGoogleConversionTime(
        r.paidAt || r.marketingConversionRecordedAt || r.createdAt
      ),
      conversionValue: Math.max(0, Number(r.totalAmount || 0)).toFixed(2),
      currency: "BRL",
    });
  }

  const lines = [
    "Parameters:TimeZone=America/Sao_Paulo",
    "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency",
  ];

  for (const row of rows) {
    lines.push(
      [
        row.gclid,
        row.conversionName,
        row.conversionTime,
        row.conversionValue,
        row.currency,
      ]
        .map(escapeCsvCell)
        .join(",")
    );
  }

  return lines.join("\n");
}

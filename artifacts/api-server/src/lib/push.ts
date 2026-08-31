/**
 * Expo Push Notifications helper.
 * Uses the Expo push HTTP API — no SDK required on the server.
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */

interface ExpoPushMessage {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Sends Expo push notifications. Accepts one or many tokens.
 * Silently ignores empty token lists or network failures.
 */
export async function sendPushNotifications(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const validTokens = tokens.filter(
    (t) => t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken["),
  );
  if (validTokens.length === 0) return;

  const messages: ExpoPushMessage[] = validTokens.map((token) => ({
    to: token,
    title,
    body,
    data,
    sound: "default",
  }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      console.error("[push] Expo push API error:", res.status, await res.text());
      return;
    }

    const result = await res.json() as { data: ExpoPushTicket[] };
    for (const ticket of result.data ?? []) {
      if (ticket.status === "error") {
        console.error("[push] Ticket error:", ticket.message, ticket.details);
      }
    }
  } catch (err) {
    // Network failures must never crash the main request handler.
    console.error("[push] Failed to send push notification:", err);
  }
}

/**
 * e2e/fixtures/auth-fixtures.mjs
 * 
 * Deterministic Authentication Fixtures for CorpFlats E2E Testing.
 * Injects session cookie `gfm_session_v2` = base64 `{ v: 2, id: <userId> }`.
 * 
 * Personas:
 * - Admin: id: 1
 * - Camareira (Cris): id: 2
 * - Portaria / Recepção (Soho): id: 4
 * - Public / Guest / Service Worker: no session cookie
 */

export const AUTH_COOKIE_NAME = "gfm_session_v2";

export const PERSONAS = {
  admin: { id: 1, username: "admin", role: "admin", name: "Administrador" },
  maid: { id: 2, username: "Cris", role: "camareira", name: "Cris" },
  reception: { id: 4, username: "Soho@promenade.com.br", role: "recepcao", name: "Recepção Soho" },
  guest: null,
  public: null,
  serviceWorker: null
};

/**
 * Creates the raw cookie object for Playwright BrowserContext.addCookies.
 * @param {string|number|object} roleOrUser - 'admin' | 'maid' | 'reception' | userId | user object
 * @param {string} [domain='127.0.0.1'] - Cookie domain
 * @returns {object|null}
 */
export function buildAuthCookie(roleOrUser, domain = "127.0.0.1") {
  let userId = null;

  if (typeof roleOrUser === "number") {
    userId = roleOrUser;
  } else if (typeof roleOrUser === "string") {
    const key = roleOrUser.toLowerCase();
    if (key === "admin") userId = 1;
    else if (key === "camareira" || key === "maid" || key === "cris") userId = 2;
    else if (key === "recepcao" || key === "reception" || key === "portaria") userId = 4;
    else if (key === "grazi") userId = 3;
    else if (key === "guest" || key === "public") return null;
  } else if (roleOrUser && typeof roleOrUser === "object") {
    userId = roleOrUser.id;
  }

  if (!userId) return null;

  const payload = JSON.stringify({ v: 2, id: userId });
  const token = Buffer.from(payload, "utf-8").toString("base64");

  return {
    name: AUTH_COOKIE_NAME,
    value: token,
    domain,
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax"
  };
}

/**
 * Injects session cookie into a Playwright BrowserContext or Browser.
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string|number|object} roleOrUser
 * @param {string} [domain='127.0.0.1']
 */
export async function injectAuthSession(context, roleOrUser, domain = "127.0.0.1") {
  await context.clearCookies();
  const cookie = buildAuthCookie(roleOrUser, domain);
  if (cookie) {
    await context.addCookies([cookie]);
  }
}

/**
 * Attaches auth session to a page's context.
 * @param {import('@playwright/test').Page} page
 * @param {string|number|object} roleOrUser
 */
export async function authenticatePage(page, roleOrUser) {
  const context = page.context();
  await injectAuthSession(context, roleOrUser);
}

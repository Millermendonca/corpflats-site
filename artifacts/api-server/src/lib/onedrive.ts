import * as XLSX from "xlsx";

export interface SpreadsheetData {
  columnDates: string[]; // ISO date strings for each column
  rows: { flatNumber: string; cells: (string | null)[] }[];
}

// ── SSRF guard ────────────────────────────────────────────────────────────────
// Approved domains for OneDrive/SharePoint share links and their CDN download
// URLs. Only HTTPS is permitted. Private, loopback, link-local, and non-approved
// hostnames are rejected at every fetch site.
const APPROVED_HOSTNAME_SUFFIXES = [
  ".onedrive.live.com",
  ".onedrive.com",
  ".sharepoint.com",
  ".1drv.ms",
  ".microsoft.com",
  ".msecnd.net",
  ".storage.live.com",
  ".blob.core.windows.net", // Azure Blob CDN used by Microsoft for file downloads
];
const APPROVED_EXACT_HOSTNAMES = new Set([
  "onedrive.live.com",
  "api.onedrive.com",
  "1drv.ms",
]);

/**
 * Validate that a URL is a safe, publicly-addressable HTTPS endpoint on an
 * approved Microsoft / OneDrive domain.
 *
 * Throws with a user-visible Portuguese message on rejection.
 */
export function validateOneDriveUrl(rawUrl: string): URL {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error("URL inválida. Verifique o link do OneDrive e tente novamente.");
  }

  // Protocol must be HTTPS.
  if (u.protocol !== "https:") {
    throw new Error("Apenas links HTTPS são aceitos.");
  }

  const hostname = u.hostname.toLowerCase();

  // Block numeric IPs (IPv4 and IPv6) — avoids bypasses like http://169.254.169.254
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.startsWith("[")) {
    throw new Error("Endereços IP não são permitidos. Use um link do OneDrive.");
  }

  // Block private/loopback/link-local hostnames.
  const privatePatterns = [
    /^localhost$/i,
    /\.local$/i,
    /\.internal$/i,
    /\.corp$/i,
  ];
  if (privatePatterns.some((p) => p.test(hostname))) {
    throw new Error("Endereço de rede interna não é permitido.");
  }

  // Must match an approved domain.
  const isApproved =
    APPROVED_EXACT_HOSTNAMES.has(hostname) ||
    APPROVED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix));

  if (!isApproved) {
    throw new Error(
      "O link deve ser um URL válido do OneDrive ou SharePoint. " +
      "Domínios externos não são permitidos por segurança."
    );
  }

  return u;
}

/**
 * Convert a OneDrive share URL to a base64url-encoded share ID for the
 * Microsoft legacy OneDrive API, which supports anonymous access for
 * public "Anyone with the link can view" shares.
 */
function shareUrlToEncodedId(shareUrl: string): string {
  const encoded = Buffer.from(shareUrl).toString("base64url");
  return `u!${encoded}`;
}

/**
 * Fetch the Excel spreadsheet from a public OneDrive sharing URL.
 *
 * Strategy:
 *  1. Use the legacy OneDrive API (api.onedrive.com v1.0) to resolve the
 *     sharing link and obtain a direct download URL — this endpoint supports
 *     anonymous access for public links, unlike the Graph API workbook endpoints
 *     which require a Bearer token.
 *  2. Download the XLSX binary.
 *  3. Parse the workbook with the xlsx library.
 *
 * The share URL must be an "Anyone with the link can view" OneDrive link.
 */
const MAX_REDIRECTS = 5;

/**
 * Fetch a URL with manual redirect handling, validating every Location header
 * against the SSRF allowlist before following the next hop.
 *
 * Using `redirect: "manual"` prevents Node's built-in fetch from silently
 * following a redirect to an internal/private address that was not in the
 * original approved URL.
 */
async function safeFetch(
  url: string,
  init: RequestInit = {},
  hopsRemaining = MAX_REDIRECTS,
): Promise<Response> {
  // Validate the URL we are about to request.
  validateOneDriveUrl(url);

  const res = await fetch(url, { ...init, redirect: "manual" });

  // 3xx → follow the Location header after re-validating it.
  if (res.status >= 300 && res.status < 400) {
    if (hopsRemaining <= 0) {
      throw new Error("Muitos redirecionamentos — verifique o link do OneDrive.");
    }
    const location = res.headers.get("Location");
    if (!location) {
      throw new Error("Redirecionamento sem cabeçalho Location.");
    }
    // Resolve relative redirects against the current URL.
    const next = new URL(location, url).toString();
    return safeFetch(next, init, hopsRemaining - 1);
  }

  return res;
}

export async function fetchSpreadsheet(shareUrl: string, sheetName?: string): Promise<SpreadsheetData> {
  // Validate the share URL before any network call (SSRF guard — entry point #1).
  // validateOneDriveUrl is called again inside safeFetch for each hop.
  validateOneDriveUrl(shareUrl);

  const encodedId = shareUrlToEncodedId(shareUrl);

  // Step 1: Resolve the sharing link to a download URL via legacy API.
  // The meta URL is constructed server-side (not user-controlled), but we
  // still route through safeFetch so any redirect chain is validated.
  const metaUrl = `https://api.onedrive.com/v1.0/shares/${encodedId}/root?select=name,@content.downloadUrl`;
  let downloadUrl: string | null = null;

  try {
    const metaRes = await safeFetch(metaUrl, { headers: { Accept: "application/json" } });
    if (metaRes.ok) {
      const meta = await metaRes.json() as { "@content.downloadUrl"?: string };
      downloadUrl = meta["@content.downloadUrl"] ?? null;
    }
  } catch {
    // Meta fetch failed — will fall through to the direct fallback below.
  }

  if (!downloadUrl) {
    // Fallback: try resolving the share URL directly by following redirects.
    // Every redirect hop is validated by safeFetch before being followed.
    const directRes = await safeFetch(shareUrl, {
      headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    });

    if (!directRes.ok) {
      throw new Error(
        `Não foi possível acessar o arquivo OneDrive. Verifique se o link está configurado como ` +
        `"Qualquer pessoa com o link pode visualizar" e tente novamente. ` +
        `(Status: ${directRes.status})`
      );
    }

    const buffer = await directRes.arrayBuffer();
    return parseWorkbook(buffer, sheetName);
  }

  // Step 2: Download the XLSX binary. The download URL was returned by the
  // OneDrive API and is validated + redirect-guarded through safeFetch.
  const fileRes = await safeFetch(downloadUrl);
  if (!fileRes.ok) {
    throw new Error(`Falha ao baixar o arquivo: ${fileRes.status} ${fileRes.statusText}`);
  }

  const buffer = await fileRes.arrayBuffer();
  return parseWorkbook(buffer, sheetName);
}

function parseWorkbook(buffer: ArrayBuffer, sheetName?: string): SpreadsheetData {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellText: true, cellDates: true });

  let sheet = sheetName
    ? workbook.Sheets[sheetName]
    : workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet) {
    sheet = workbook.Sheets[workbook.SheetNames[0]];
  }

  if (!sheet) {
    return { columnDates: [], rows: [] };
  }

  const values: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: null,
  });

  return parseSpreadsheet(values);
}

/**
 * Parse the raw 2D array from the XLSX sheet into structured data.
 * Expected structure:
 *   Row 0: headers — first cell ignored, rest are dates (e.g. "01/01", "02/01" etc.)
 *   Row 1+: flat rows — first cell is flat number, rest are guest info per date (null = empty/unoccupied)
 */
export function parseSpreadsheet(values: (string | number | null)[][]): SpreadsheetData {
  if (!values || values.length < 2) {
    return { columnDates: [], rows: [] };
  }

  const headerRow = values[0];
  const today = new Date();
  const year = today.getFullYear();

  // Parse column headers as dates
  const columnDates: string[] = [];
  for (let col = 1; col < headerRow.length; col++) {
    const cell = headerRow[col];
    if (!cell) {
      columnDates.push("");
      continue;
    }

    const str = String(cell).trim();
    let date: Date | null = null;

    // Excel serial number
    const num = Number(str);
    if (!isNaN(num) && num > 40000) {
      const excelEpoch = new Date(1899, 11, 30);
      date = new Date(excelEpoch.getTime() + num * 86400000);
    } else if (/^\d{1,2}\/\d{1,2}/.test(str)) {
      // "DD/MM" or "DD/MM/YYYY"
      const parts = str.split("/");
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parts[2] ? parseInt(parts[2], 10) : year;
      date = new Date(y, m, d);
    } else if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      date = new Date(str);
    }

    if (date && !isNaN(date.getTime())) {
      columnDates.push(date.toISOString().substring(0, 10));
    } else {
      columnDates.push(str);
    }
  }

  const rows: SpreadsheetData["rows"] = [];
  for (let row = 1; row < values.length; row++) {
    const flatCell = values[row][0];
    if (!flatCell) continue;
    const flatNumber = String(flatCell).trim();
    if (!flatNumber) continue;

    const cells: (string | null)[] = [];
    for (let col = 1; col < headerRow.length; col++) {
      const cell = values[row][col];
      const value = cell != null && String(cell).trim() !== "" ? String(cell).trim() : null;
      cells.push(value);
    }
    rows.push({ flatNumber, cells });
  }

  return { columnDates, rows };
}

/**
 * Detect checkouts from parsed spreadsheet data.
 * A checkout on date D means: cell for date D is occupied (non-null),
 * and cell for D+1 is empty or a different guest.
 */
export function detectCheckouts(data: SpreadsheetData): { flatNumber: string; checkoutDate: string }[] {
  const checkouts: { flatNumber: string; checkoutDate: string }[] = [];

  for (const row of data.rows) {
    for (let i = 0; i < data.columnDates.length; i++) {
      const date = data.columnDates[i];
      if (!date) continue;
      const current = row.cells[i];
      if (!current) continue; // not occupied on this day

      const next = i + 1 < row.cells.length ? row.cells[i + 1] : null;
      // Checkout if next day is empty OR has a different guest
      if (!next || next !== current) {
        checkouts.push({ flatNumber: row.flatNumber, checkoutDate: date });
      }
    }
  }

  return checkouts;
}

/**
 * Detect check-ins from parsed spreadsheet data.
 * A check-in on date D means: cell for D is occupied, and cell for D-1
 * is empty or a different guest (start of a new stay).
 */
export function detectCheckins(data: SpreadsheetData): { flatNumber: string; checkinDate: string }[] {
  const checkins: { flatNumber: string; checkinDate: string }[] = [];

  for (const row of data.rows) {
    for (let i = 0; i < data.columnDates.length; i++) {
      const date = data.columnDates[i];
      if (!date) continue;
      const current = row.cells[i];
      if (!current) continue; // not occupied on this day

      const prev = i > 0 ? row.cells[i - 1] : null;
      if (!prev || prev !== current) {
        checkins.push({ flatNumber: row.flatNumber, checkinDate: date });
      }
    }
  }

  return checkins;
}

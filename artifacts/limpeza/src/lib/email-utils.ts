/**
 * Shared utilities for parsing, validating, formatting, and isolating
 * semicolon- (`;`) or comma-separated email lists across PMS, CRM, NFS-e, and Boleto flows.
 */

export interface EmailListValidationResult {
  valid: boolean;
  emails: string[];
  invalidTokens: string[];
}

const EMAIL_TOKEN_REGEX =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function tokenizeRawEmailInput(raw: string | string[] | null | undefined): string[] {
  if (raw === null || raw === undefined) return [];
  const rawSegments: string[] = [];
  const items = Array.isArray(raw) ? raw : [raw];

  for (const item of items) {
    if (item === null || item === undefined) continue;
    const str = String(item).trim();
    if (!str) continue;
    for (const seg of str.split(/[;,\r\n]+/)) {
      const trimmedSeg = seg.trim();
      if (!trimmedSeg) continue;
      const angleMatch = /^[^<>]*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(trimmedSeg);
      if (angleMatch) {
        rawSegments.push(angleMatch[1].trim());
      } else {
        for (const wsPart of trimmedSeg.split(/\s+/)) {
          const tok = wsPart.trim();
          if (tok) rawSegments.push(tok);
        }
      }
    }
  }

  return rawSegments;
}

/**
 * Validates one or more emails separated by `;`, `,`, or whitespace.
 * Empty input returns `{ valid: true, emails: [], invalidTokens: [] }`.
 */
export function validateEmailList(
  raw: string | string[] | null | undefined
): EmailListValidationResult {
  const tokens = tokenizeRawEmailInput(raw);
  if (tokens.length === 0) {
    return { valid: true, emails: [], invalidTokens: [] };
  }

  const emails: string[] = [];
  const invalidTokens: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const normalized = token.toLowerCase();
    if (EMAIL_TOKEN_REGEX.test(normalized)) {
      if (!seen.has(normalized)) {
        seen.add(normalized);
        emails.push(normalized);
      }
    } else {
      invalidTokens.push(token);
    }
  }

  return {
    valid: invalidTokens.length === 0,
    emails,
    invalidTokens,
  };
}

/**
 * Extracts all valid, trimmed, lowercased, deduplicated emails from a `;` / `,`-separated list.
 */
export function parseEmailList(raw: string | string[] | null | undefined): string[] {
  return validateEmailList(raw).emails;
}

/**
 * Formats valid emails into the canonical `"; "`-separated string.
 */
export function formatEmailList(raw: string | string[] | null | undefined): string {
  return parseEmailList(raw).join("; ");
}

/**
 * Isolates strictly the primary (`[0]`) valid email address for external single-email schemas
 * (e.g. Gov.br SEFIN DPS XML `<email>`, Banco Inter `pagador.email`, MercadoPago).
 */
export function getPrimaryEmail(raw: string | string[] | null | undefined): string {
  return parseEmailList(raw)[0] || "";
}

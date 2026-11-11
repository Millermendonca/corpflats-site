/**
 * Smart phone / WhatsApp and CPF / Passport input formatters.
 *
 * Phone rules:
 * - Preserves international numbers starting with `+` when NOT `+55`
 *   (e.g. `+1 305 555-0199`, `+351 912 345 678`, `+54 9 11 1234-5678`),
 *   capping total E.164 digits at 15.
 * - Strips Brazilian DDI `55` on `+55...` or 12/13-digit `55...` strings
 *   (e.g. mobile autofill `+55 22 99850-5276` or `"5522998505276"` -> `(22) 99850-5276`),
 *   while protecting already-masked DDD-55 numbers `(55) 9XXXX-XXXX`.
 * - Never wraps 1–2 digits in `(` so `Backspace` never gets trapped.
 */

function formatBrazilLocalDigits(rawDigits: string): string {
  const br = rawDigits.replace(/\D/g, "").slice(0, 11);
  if (br.length === 0) return "";
  if (br.length <= 2) return br;
  if (br.length <= 6) return `(${br.slice(0, 2)}) ${br.slice(2)}`;
  if (br.length <= 10) return `(${br.slice(0, 2)}) ${br.slice(2, 6)}-${br.slice(6)}`;
  return `(${br.slice(0, 2)}) ${br.slice(2, 7)}-${br.slice(7, 11)}`;
}

export function formatSmartPhone(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = String(value).trimStart();
  if (!trimmed) return "";

  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    if (digits.length === 0) return "+";
    if (digits === "5") return "+5";

    if (digits.startsWith("55")) {
      const local = digits.slice(2).slice(0, 11);
      if (local.length === 0) return "+55";
      return formatBrazilLocalDigits(local);
    }

    // International non-Brazil number (+1, +351, +54, +44, etc.)
    let out = "+";
    let digitCount = 0;
    for (const ch of trimmed.slice(1)) {
      if (/\d/.test(ch)) {
        if (digitCount >= 15) break;
        digitCount++;
        out += ch;
      } else if (ch === " " || ch === "-" || ch === "(" || ch === ")") {
        if (ch === " " && out.endsWith(" ")) continue;
        out += ch;
      }
    }
    return out;
  }

  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  // Strip leading Brazilian DDI 55 on 12- or 13-digit autofill / saved values,
  // unless user is editing an already-formatted DDD (55) landline or mobile number.
  if (
    (digits.length === 12 || digits.length === 13) &&
    digits.startsWith("55") &&
    !trimmed.startsWith("(55)")
  ) {
    digits = digits.slice(2);
  }

  return formatBrazilLocalDigits(digits);
}

/**
 * Formats a phone string for `/api/whatsapp/phone-exists/:phone` queries:
 * - Preserves leading `+` on non-Brazil international numbers (`+56...`, `+351...`, `+1...`)
 *   so backend `cleanWhatsAppPhone` never misclassifies foreign 10/11-digit numbers as Brazilian DDDs.
 * - Normalizes Brazilian numbers (stripping DDI `55` if present) to 10–11 local digits.
 * - Returns `""` when incomplete (< 8 international digits or < 10 Brazilian digits).
 */
export function formatPhoneForWhatsAppCheck(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";

  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  if (trimmed.startsWith("+") && !digits.startsWith("55")) {
    return digits.length >= 8 ? `+${digits.slice(0, 15)}` : "";
  }

  if (
    (digits.length === 12 || digits.length === 13) &&
    digits.startsWith("55") &&
    !trimmed.startsWith("(55)")
  ) {
    digits = digits.slice(2);
  }

  return digits.length >= 10 ? digits.slice(0, 11) : "";
}

export function formatPassport(value: string | null | undefined): string {
  if (!value) return "";
  return String(value)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 20);
}

/**
 * Formats purely numeric input (up to 11 digits) as Brazilian CPF `000.000.000-00`,
 * while immediately switching to uppercase alphanumeric Passport (`[A-Z0-9-]`, up to 20 chars)
 * whenever any letter is present — never blocking letters or corrupting saved passports.
 */
export function formatCpfOrPassport(value: string | null | undefined): string {
  if (!value) return "";
  const raw = String(value);
  if (/[a-zA-Z]/.test(raw)) {
    return formatPassport(raw);
  }
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Accepts either an 11-digit CPF or a foreign Passport (alphanumeric >= 5 chars,
 * or numeric foreign passport 6–9 digits).
 */
export function isPlausibleCpfOrPassport(value: string | null | undefined): boolean {
  if (!value) return false;
  const raw = String(value).trim();
  if (!raw) return false;
  if (/[a-zA-Z]/.test(raw)) {
    return raw.replace(/[^a-zA-Z0-9]/g, "").length >= 5;
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) {
    return !/^(\d)\1{10}$/.test(digits);
  }
  return digits.length >= 6 && digits.length <= 9;
}

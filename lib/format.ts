import { format, parse, isValid } from "date-fns";
import { enUS, ptBR } from "date-fns/locale";

/**
 * Parses a Brazilian-formatted number string (thousand sep `.`, decimal sep `,`).
 * `"4.244.000,00"` -> `4244000`
 */
export function parseBRNumber(s: string): number {
  if (typeof s !== "string") return Number(s);
  const cleaned = s.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Parses a Brazilian-formatted date string (`dd/MM/yyyy`).
 * `"13/01/2023"` -> `Date`
 */
export function parseBRDate(s: string): Date {
  return parse(s, "dd/MM/yyyy", new Date(), { locale: ptBR });
}

/**
 * Formats a number as Brazilian Real currency.
 * `1234.56` -> `"R$ 1.234,56"`
 */
export function formatBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

/**
 * Formats a Date as `dd/MM/yyyy`.
 */
export function formatBRDate(d: Date): string {
  return format(d, "dd/MM/yyyy", { locale: ptBR });
}

/**
 * Strips everything that is not a digit.
 * `"77.941.490/0005-89"` -> `"77941490000589"`
 */
export function parseCNPJ(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * Formats a CNPJ string (digits only or already-formatted) as `XX.XXX.XXX/XXXX-XX`.
 */
export function formatCNPJ(s: string): string {
  const digits = parseCNPJ(s).padStart(14, "0").slice(-14);
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}

// ----------------------------------------------------------------------------
// Import helpers — used by prisma/seed.ts and scripts/*. Lenient by design:
// they return `null` for empty/unparseable input rather than throwing, so a
// single bad row in a large dump doesn't abort the whole import.
// ----------------------------------------------------------------------------

const BR_MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

/** Returns 1..12 for a Portuguese month name (case/accent insensitive), or null. */
export function mesPtToNumber(s: string | null | undefined): number | null {
  if (!s) return null;
  const key = s.trim().toLowerCase();
  return BR_MONTHS[key] ?? null;
}

/** Maps a 3-letter Portuguese month abbreviation (JAN..DEZ) to 1..12. */
const PT_MONTH_ABBR: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

export function mesAbbrPtToNumber(s: string): number | null {
  return PT_MONTH_ABBR[s.toUpperCase()] ?? null;
}

/**
 * Parses Zoho-ish date strings used in the JSON dumps. Accepts:
 *   - "11/01/2017" (BR — dd/MM/yyyy)
 *   - "14-Nov-2024" (Zoho — dd-MMM-yyyy, English month abbrev)
 *   - "" / null / undefined → null
 * Returns null on failure rather than throwing.
 */
export function parseLooseDate(input: unknown): Date | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;

  // dd/MM/yyyy
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const d = parse(s, "dd/MM/yyyy", new Date(), { locale: ptBR });
    return isValid(d) ? d : null;
  }
  // dd-MMM-yyyy (Zoho, English abbrev)
  if (/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(s)) {
    const d = parse(s, "dd-MMM-yyyy", new Date(), { locale: enUS });
    return isValid(d) ? d : null;
  }
  // ISO-ish fallback
  const d = new Date(s);
  return isValid(d) ? d : null;
}

/**
 * Lenient numeric parser. Handles BR (`"4.244.000,00"`) and US (`"100.00"`) formats,
 * and pure integer strings. Returns null for empty / unparseable input.
 */
export function parseLooseNumber(input: unknown): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const s = String(input).trim();
  if (!s) return null;

  // Decide separator: if both `.` and `,` exist, the rightmost is the decimal.
  // If only `,` exists, treat as decimal (BR). If only `.` exists, ambiguous —
  // treat as US (decimal) when there's at most one `.` and ≤3 digits to its
  // right are NOT followed by another segment; otherwise treat `.` as thousands.
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  let cleaned: string;
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // BR: thousands `.`, decimal `,`
      cleaned = s.replace(/\./g, "").replace(",", ".");
    } else {
      // US: thousands `,`, decimal `.`
      cleaned = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    cleaned = s.replace(/\./g, "").replace(",", ".");
  } else if (hasDot) {
    // Heuristic: if exactly one `.` and the right side has 1-2 digits,
    // it's a decimal point (US). Otherwise (multiple dots, or right side ≥4
    // digits), treat all dots as thousands separators.
    const parts = s.split(".");
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = s; // decimal
    } else if (parts.length === 2 && parts[1].length === 4) {
      // Zoho-style "3020687753.0000" — treat the `.0000` suffix as decimal noise
      cleaned = s;
    } else {
      cleaned = s.replace(/\./g, "");
    }
  } else {
    cleaned = s;
  }

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Strict integer parser built on top of parseLooseNumber. */
export function parseLooseInt(input: unknown): number | null {
  const n = parseLooseNumber(input);
  if (n == null) return null;
  return Math.trunc(n);
}

/** Empty-string-aware string getter; trims and returns null if empty. */
export function nullIfEmpty(s: unknown): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}

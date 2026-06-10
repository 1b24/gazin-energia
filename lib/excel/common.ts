/**
 * Helpers de parsing/formatação numérica compartilhados pelos mappers Excel.
 * Extraídos de consumo-mapper/injecao-mapper (cópias idênticas) — o próximo
 * mapper (Geração, Usinas...) importa daqui em vez de duplicar.
 *
 * Nota: filial-mapper tem variantes próprias de PERCENTUAL
 * (`parseDecimalPercent`/`formatDecimalPointPercent`) com contrato diferente
 * (ponto decimal no export) — não confundir com estas.
 */

/** Número → string com 2 casas (ponto decimal) pro Excel; null se inválido. */
export function formatDecimal(v: unknown): string | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

/**
 * Parse tolerante de decimal vindo de célula Excel — aceita number nativo,
 * "1.234,56" (BR), "1,234.56" (US), prefixo "R$" e espaços. NaN se inválido.
 */
export function parseDecimalFlexible(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null) return Number.NaN;

  const raw = String(v).trim().replace(/\s/g, "").replace(/R\$/i, "");
  if (raw === "") return Number.NaN;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized = raw;

  if (hasComma && hasDot) {
    // Último separador é o decimal (BR: 1.234,56 | US: 1,234.56)
    const commaIsDecimal = raw.lastIndexOf(",") > raw.lastIndexOf(".");
    normalized = commaIsDecimal
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  } else if (hasComma) {
    normalized = raw.replace(",", ".");
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";

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

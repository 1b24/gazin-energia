/**
 * Máscaras de input pra formatos brasileiros — usadas pelos campos do
 * `<EntityForm />`.
 *
 * Cada máscara recebe a string do `<input>` e devolve a versão formatada.
 * As funções `parse*` no caller (lib/format.ts) convertem de volta pra valor
 * numérico/Date antes de gravar.
 */

/**
 * Máscara de moeda BR com precisão configurável (default 2 decimais).
 *   maskCurrencyBR("1234")          → "12,34"
 *   maskCurrencyBR("12345")         → "123,45"
 *   maskCurrencyBR("530520", 4)     → "53,0520"
 *   maskCurrencyBR("5305", 4)       → "0,5305"
 *
 * Para tarifas de kWh (precisão de frações de centavo), use decimals=4.
 */
export function maskCurrencyBR(raw: string, decimals = 2): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const padded = digits.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, -decimals).replace(/^0+(?=\d)/, "") || "0";
  const decPart = padded.slice(-decimals);
  // Insere separador de milhar na parte inteira
  const intWithSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${intWithSep},${decPart}`;
}

/** "12345678" → "12/34/5678" */
export function maskDateBR(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "77941490000589" → "77.941.490/0005-89" */
export function maskCNPJ(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 14);
  let out = d;
  if (d.length > 2) out = `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length > 5) out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length > 8)
    out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  if (d.length > 12)
    out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return out;
}

/** Inverso da maskCurrencyBR — retorna número puro. "12,34" → 12.34 */
export function unmaskCurrencyBR(masked: string): number | null {
  if (!masked) return null;
  const cleaned = masked.replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

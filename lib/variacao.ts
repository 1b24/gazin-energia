/**
 * Helpers de variação período-a-período (atual vs anterior).
 *
 * `prevPeriod` mora em `lib/period.ts` desde o Step 4 do refactor
 * 2026-05-foundations — re-exportado aqui pra preservar a API existente
 * (`import { prevPeriod, variacao } from "@/lib/variacao"` continua
 * funcionando). Novos imports devem preferir `@/lib/period`.
 */
export { prevPeriod, type PeriodKey } from "@/lib/period";

export interface Variacao {
  /** Diferença absoluta (atual - anterior). null se faltar dado dos lados. */
  abs: number | null;
  /** Variação percentual sobre o |anterior|. null se anterior == 0 ou faltante. */
  pct: number | null;
}

export function variacao(
  atual: number | null | undefined,
  anterior: number | null | undefined,
): Variacao {
  if (atual == null || anterior == null) return { abs: null, pct: null };
  const abs = atual - anterior;
  const pct = anterior !== 0 ? (abs / Math.abs(anterior)) * 100 : null;
  return { abs, pct };
}

/**
 * Helpers de variação período-a-período (mês corrente vs mês anterior).
 *
 * Convenção de mês: pt-BR ("Janeiro".."Dezembro"), igual a `MESES_PT` em
 * `lib/dashboard.ts`. Janeiro retrocede para Dezembro do ano anterior.
 */
import { MESES_PT } from "./dashboard";

export interface PeriodKey {
  ano: number;
  mes: string;
}

export function prevPeriod(p: PeriodKey): PeriodKey | null {
  const idx = (MESES_PT as readonly string[]).indexOf(p.mes);
  if (idx < 0) return null;
  if (idx === 0) return { ano: p.ano - 1, mes: MESES_PT[11] };
  return { ano: p.ano, mes: MESES_PT[idx - 1] };
}

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

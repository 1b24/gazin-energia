/**
 * Helpers de período (mês/ano pt-BR) — source of truth.
 *
 * Antes deste módulo, `MESES_PT`, `mesIndex`, `periodKey`, `periodoLabel`,
 * `prevPeriod`, `getCurrentPeriod` etc. viviam replicados em 7+ arquivos
 * (dashboard.ts, variacao.ts, schemas/{consumo,injecao,orcamento}.ts,
 * (dashboard)/{consumo,geracao,injecao}-table.tsx) — com variantes Title Case
 * vs lowercase, periodKey "2026-01" vs "2026-00", etc. Consolidar aqui evita
 * regressão silenciosa.
 *
 * Convenção: meses sempre em Title Case pt-BR ("Janeiro".."Dezembro"). Para
 * comparar contra inputs lowercase ou com espaços, use `mesIndex` (que faz
 * trim + lowercase internamente) ou `normalizeMes`.
 */

export const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export type MesPt = (typeof MESES_PT)[number];

/** Chave mínima de período usada por agregações temporais. */
export interface PeriodKey {
  ano: number;
  /** "Janeiro".."Dezembro" — Title Case canônico. */
  mes: string;
}

/** Período corrente expandido com todas as representações usadas no app. */
export interface CurrentPeriod {
  ano: number;
  /** Índice 0..11. */
  mesIdx: number;
  /** "Janeiro".."Dezembro". */
  mesPt: MesPt;
  /** "01".."12" — zero-padded. */
  mesNum: string;
}

// ---------------------------------------------------------------------------
// Construtores de período
// ---------------------------------------------------------------------------

export function getCurrentPeriod(): CurrentPeriod {
  const d = new Date();
  return makePeriod(d.getFullYear(), d.getMonth());
}

/** Garante mesIdx em [0, 11]. */
export function makePeriod(ano: number, mesIdx: number): CurrentPeriod {
  const safeIdx = Math.max(0, Math.min(11, mesIdx));
  return {
    ano,
    mesIdx: safeIdx,
    mesPt: MESES_PT[safeIdx],
    mesNum: String(safeIdx + 1).padStart(2, "0"),
  };
}

/** Resolve `?ano=&mes=` dos searchParams, com fallback pro mês corrente. */
export function periodFromQuery(query: {
  ano?: string;
  mes?: string;
}): CurrentPeriod {
  const ano = Number(query.ano);
  const mes = Number(query.mes);
  if (
    !Number.isFinite(ano) ||
    !Number.isFinite(mes) ||
    ano < 2000 ||
    mes < 1 ||
    mes > 12
  ) {
    return getCurrentPeriod();
  }
  return makePeriod(ano, mes - 1);
}

/**
 * Retorna a janela de 12 meses TERMINANDO no `period` informado (mais antigo
 * → mais recente). Ex: period=2026-05 → jun/2025 ... mai/2026.
 */
export function last12MonthsEndingAt(
  period: CurrentPeriod = getCurrentPeriod(),
): { ano: number; mesIdx: number }[] {
  const out: { ano: number; mesIdx: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(period.ano, period.mesIdx - i, 1);
    out.push({ ano: d.getFullYear(), mesIdx: d.getMonth() });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Normalização e indexação
// ---------------------------------------------------------------------------

/**
 * Retorna 0..11 para o mês pt-BR, ou -1 quando inválido. Tolera diferenças
 * de case e espaços ("Janeiro", "janeiro", " JANEIRO  " → 0).
 */
export function mesIndex(mes: string | null | undefined): number {
  if (!mes) return -1;
  const normalized = mes.trim().toLowerCase();
  return MESES_PT.findIndex((m) => m.toLowerCase() === normalized);
}

/**
 * Converte input em mês canônico Title Case, ou null quando inválido. Útil
 * para gravar/comparar sempre na mesma forma.
 */
export function normalizeMes(mes: string | null | undefined): MesPt | null {
  const idx = mesIndex(mes);
  return idx >= 0 ? MESES_PT[idx] : null;
}

// ---------------------------------------------------------------------------
// Representações de uma linha "ano + mes"
// ---------------------------------------------------------------------------

interface RowWithPeriod {
  ano?: number | null;
  mes?: string | null;
}

/**
 * Chave estável "YYYY-MM" para agrupar linhas por período. Retorna "" quando
 * `ano` ou `mes` estão ausentes/inválidos — caller deve tratar.
 */
export function periodKey(row: RowWithPeriod): string {
  const ano = row.ano ?? 0;
  const idx = mesIndex(row.mes);
  if (ano <= 0 || idx < 0) return "";
  return `${ano}-${String(idx + 1).padStart(2, "0")}`;
}

/**
 * Label humano "Mês/Ano". "Sem período" quando inválido — evita render
 * "undefined/undefined".
 */
export function periodoLabel(row: RowWithPeriod): string {
  return row.mes && row.ano ? `${row.mes}/${row.ano}` : "Sem período";
}

// ---------------------------------------------------------------------------
// Aritmética temporal
// ---------------------------------------------------------------------------

/**
 * Período anterior. Janeiro retrocede para Dezembro do ano anterior.
 * Retorna null se o `mes` informado não for um mês pt-BR válido.
 */
export function prevPeriod(p: PeriodKey): PeriodKey | null {
  const idx = mesIndex(p.mes);
  if (idx < 0) return null;
  if (idx === 0) return { ano: p.ano - 1, mes: MESES_PT[11] };
  return { ano: p.ano, mes: MESES_PT[idx - 1] };
}

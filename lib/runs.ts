/**
 * Agrupamento de inteiros em runs contíguos — compartilhado entre o
 * calendário de seleção de dias (formatSelectedDays) e o destaque de faixas
 * no gráfico de geração diária (ReferenceArea por run).
 */

export interface Run {
  from: number;
  to: number;
}

/** {1,2,3,8,9} → [{from:1,to:3},{from:8,to:9}]. Aceita qualquer iterável. */
export function groupRuns(nums: Iterable<number>): Run[] {
  const sorted = [...nums].sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const runs: Run[] = [];
  let from = sorted[0];
  let to = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === to + 1) {
      to = sorted[i];
    } else if (sorted[i] !== to) {
      // (!== to ignora duplicatas)
      runs.push({ from, to });
      from = sorted[i];
      to = sorted[i];
    }
  }
  runs.push({ from, to });
  return runs;
}

/**
 * Formata em string compacta com en-dash:
 *   {1,2,3,8,9} → "1–3, 8–9" · {5,7,9} → "5, 7, 9" · {} → ""
 */
export function formatRuns(nums: Iterable<number>): string {
  return groupRuns(nums)
    .map((r) => (r.from === r.to ? `${r.from}` : `${r.from}–${r.to}`))
    .join(", ");
}

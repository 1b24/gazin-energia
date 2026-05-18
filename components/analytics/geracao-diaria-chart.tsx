"use client";

/**
 * Gráfico de geração diária — overlay de múltiplos períodos.
 *
 * Estado da seleção de dias é EXTERNO (controlled) — vive no parent
 * `GeracaoAnalytics` pra ser aplicado globalmente nas demais métricas.
 * Este componente só:
 *   1. Renderiza as linhas (1 por série).
 *   2. Destaca dias selecionados como `ReferenceArea` (faixa azul).
 *   3. Mostra totais por série respeitando a seleção (sum só dos dias
 *      selecionados; se vazio, sum do período inteiro).
 *
 * Cap de 5 séries pra legibilidade do overlay.
 */
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface DailySeries {
  /** Chave estável pra React key (ex: "2026-01"). */
  key: string;
  /** Label humano exibido na legenda e tooltip (ex: "Janeiro/2026"). */
  label: string;
  /** kWh por dia, índice 0 = dia 1, índice 30 = dia 31. `null` = sem dado. */
  dias: (number | null)[];
}

interface Props {
  series: DailySeries[];
  /** Dias selecionados globalmente — vem do parent. Set vazio = sem filtro. */
  selectedDays: Set<number>;
  /** Default 5 — protege a legibilidade contra "selecionei tudo". */
  maxSeriesVisible?: number;
}

// Palette com contraste alto entre adjacentes.
const SERIES_COLORS = [
  "#10b981", // emerald-500
  "#3b82f6", // blue-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#a855f7", // purple-500
];

const fmtKwh = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export function GeracaoDiariaChart({
  series,
  selectedDays,
  maxSeriesVisible = 5,
}: Props) {
  if (series.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
        Nenhum período selecionado.
      </div>
    );
  }

  if (series.length > maxSeriesVisible) {
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
        <span>
          {series.length} períodos selecionados — máximo {maxSeriesVisible} pra
          comparativo legível.
        </span>
        <span className="text-xs">Refine o filtro de Período acima.</span>
      </div>
    );
  }

  // Monta dataset recharts: [{ dia: 1, "Janeiro/2026": 1234, ... }, ...]
  const data = Array.from({ length: 31 }, (_, i) => {
    const dia = i + 1;
    const point: Record<string, number | string | null> = { dia };
    for (const s of series) {
      point[s.label] = s.dias[i];
    }
    return point;
  });

  // Totais por série respeitando seleção. Sem seleção: período inteiro.
  const totals = series.map((s) => {
    let total = 0;
    if (selectedDays.size === 0) {
      for (const v of s.dias) total += v ?? 0;
    } else {
      for (const d of selectedDays) {
        const v = s.dias[d - 1];
        if (v != null) total += v;
      }
    }
    return { key: s.key, label: s.label, total };
  });

  // Agrupa dias selecionados em runs contíguos pra renderizar menos
  // ReferenceAreas — visualmente uma única faixa pra "dias 8-12".
  const daysSorted = [...selectedDays].sort((a, b) => a - b);
  const selectedRuns: Array<{ from: number; to: number }> = [];
  if (daysSorted.length > 0) {
    let runStart = daysSorted[0];
    let runEnd = daysSorted[0];
    for (let i = 1; i < daysSorted.length; i++) {
      if (daysSorted[i] === runEnd + 1) {
        runEnd = daysSorted[i];
      } else {
        selectedRuns.push({ from: runStart, to: runEnd });
        runStart = daysSorted[i];
        runEnd = daysSorted[i];
      }
    }
    selectedRuns.push({ from: runStart, to: runEnd });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="dia"
              type="number"
              domain={[1, 31]}
              ticks={Array.from({ length: 31 }, (_, i) => i + 1)}
              tick={{ fontSize: 11 }}
              label={{
                value: "Dia do mês",
                position: "insideBottom",
                offset: -2,
                style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
              }}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => fmtKwh(Number(v))}
              width={70}
            />
            <Tooltip
              formatter={(v) => [`${fmtKwh(Number(v))} kWh`, ""]}
              labelFormatter={(label) => `Dia ${label}`}
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                borderColor: "hsl(var(--border))",
                borderRadius: 8,
                color: "hsl(var(--foreground))",
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="line" />
            {selectedRuns.map((r) => (
              <ReferenceArea
                key={`run-${r.from}-${r.to}`}
                x1={r.from - 0.4}
                x2={r.to + 0.4}
                fill="hsl(var(--primary))"
                fillOpacity={0.08}
                stroke="none"
              />
            ))}
            {series.map((s, idx) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.label}
                stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Totais por período — respeitam a seleção global */}
      <div className="rounded-md border bg-muted/20 p-3 text-xs">
        <div className="mb-2 text-muted-foreground">
          {selectedDays.size > 0
            ? `Somatório dos dias selecionados por período:`
            : `Somatório do período inteiro:`}
        </div>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {totals.map((t, i) => (
            <div
              key={t.key}
              className="flex items-center justify-between gap-2"
            >
              <span
                className="inline-flex items-center gap-1.5 font-medium"
                style={{ color: SERIES_COLORS[i % SERIES_COLORS.length] }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    backgroundColor:
                      SERIES_COLORS[i % SERIES_COLORS.length],
                  }}
                />
                {t.label}
              </span>
              <span className="font-mono">{fmtKwh(t.total)} kWh</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

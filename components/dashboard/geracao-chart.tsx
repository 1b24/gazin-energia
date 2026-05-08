"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Point {
  label: string;
  realizadoKwh: number;
  metaKwh: number;
}

const fmtKwh = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export function GeracaoChart({ data }: { data: Point[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => fmtKwh(Number(v))}
            width={70}
          />
          <Tooltip
            formatter={(v) => [`${fmtKwh(Number(v))} kWh`, ""]}
            labelStyle={{ fontSize: 12 }}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="realizadoKwh"
            name="Realizado"
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary) / 0.18)"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="metaKwh"
            name="Meta"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

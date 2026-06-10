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

import { fmtCompact } from "@/lib/format";

export function GeracaoChart({ data }: { data: Point[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => fmtCompact(Number(v))}
            width={70}
          />
          <Tooltip
            formatter={(v) => [`${fmtCompact(Number(v))} kWh`, ""]}
            labelStyle={{ color: "hsl(var(--foreground))", fontSize: 12 }}
            itemStyle={{ color: "hsl(var(--foreground))", fontSize: 12 }}
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              borderColor: "hsl(var(--border))",
              borderRadius: 8,
              color: "hsl(var(--foreground))",
              fontSize: 12,
            }}
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

"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { fmtBRLCompact } from "@/lib/format";

interface Point {
  mes: string;
  orcadoReais: number;
  realizadoReais: number;
}

export function OrcadoRealizadoChart({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Sem orçamento registrado.
      </p>
    );
  }
  return (
    <div className="dashboard-orcado-chart h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
        >
          <CartesianGrid
            stroke="var(--dashboard-chart-grid)"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="mes"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={{ stroke: "var(--border)" }}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={(v) => fmtBRLCompact(Number(v))}
            tickLine={{ stroke: "var(--border)" }}
            axisLine={{ stroke: "var(--border)" }}
            width={90}
          />
          <Tooltip
            cursor={{ fill: "var(--dashboard-chart-hover)" }}
            formatter={(v) => [fmtBRLCompact(Number(v)), ""]}
            labelStyle={{
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
            itemStyle={{
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
            contentStyle={{
              backgroundColor: "var(--popover)",
              borderColor: "var(--border)",
              borderRadius: 8,
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
          />
          <Legend
            wrapperStyle={{ color: "var(--muted-foreground)", fontSize: 12 }}
          />
          <Bar
            dataKey="orcadoReais"
            name="Orçado"
            fill="var(--dashboard-chart-orcado)"
            radius={[3, 3, 0, 0]}
          />
          <Bar
            dataKey="realizadoReais"
            name="Realizado"
            fill="var(--dashboard-chart-realizado)"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

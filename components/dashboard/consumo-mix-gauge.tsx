"use client";

/**
 * Medidores de composição do consumo — dois gauges semicirculares:
 *   - Geração própria   (verde)  = Σ geração das usinas / consumo total
 *   - Geração contratada (azul)   = Σ injeção de terceiros / consumo total
 *
 * O arco é clampado em 100% (uma fatia pode gerar mais do que consome), mas
 * o número exibido é o percentual real. Rodapé mostra consumo total e a
 * parcela atendida pela distribuidora (cativo).
 *
 * Dados já vêm como `number` de `getConsumoMix` (Decimal convertido no server),
 * então não atravessam Decimal — nada a serializar aqui.
 */
import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts";

import { fmtCompact, fmtPct } from "@/lib/format";

const PROPRIA = "#10b981"; // emerald-500
const CONTRATADA = "#3b82f6"; // blue-500

interface GaugeProps {
  label: string;
  kwh: number;
  pct: number | null;
  color: string;
}

function Gauge({ label, kwh, pct, color }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, pct ?? 0));
  const data = [{ name: label, value: clamped, fill: color }];
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-28 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            data={data}
            startAngle={180}
            endAngle={0}
            innerRadius="70%"
            outerRadius="100%"
            cy="100%"
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <RadialBar
              dataKey="value"
              cornerRadius={6}
              background={{ fill: "hsl(var(--muted))" }}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        {/* % real sobreposto no centro do semicírculo */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
          <span
            className="text-2xl font-semibold tracking-tight"
            style={{ color }}
          >
            {fmtPct(pct)}
          </span>
        </div>
      </div>
      <span className="mt-1 text-sm font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{fmtCompact(kwh)} kWh</span>
    </div>
  );
}

interface Props {
  consumoTotalKwh: number;
  geracaoPropriaKwh: number;
  geracaoContratadaKwh: number;
  distribuidoraKwh: number;
  pctPropria: number | null;
  pctContratada: number | null;
  pctDistribuidora: number | null;
}

export function ConsumoMixGauge({
  consumoTotalKwh,
  geracaoPropriaKwh,
  geracaoContratadaKwh,
  distribuidoraKwh,
  pctPropria,
  pctContratada,
  pctDistribuidora,
}: Props) {
  if (consumoTotalKwh <= 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Sem consumo registrado no período.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Gauge
          label="Geração própria"
          kwh={geracaoPropriaKwh}
          pct={pctPropria}
          color={PROPRIA}
        />
        <Gauge
          label="Geração contratada"
          kwh={geracaoContratadaKwh}
          pct={pctContratada}
          color={CONTRATADA}
        />
      </div>

      <div className="rounded-md border bg-muted/20 p-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Consumo total (base)</span>
          <span className="font-mono font-medium">
            {fmtCompact(consumoTotalKwh)} kWh
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" />
            Distribuidora (cativo)
          </span>
          <span className="font-mono">
            {fmtCompact(distribuidoraKwh)} kWh · {fmtPct(pctDistribuidora)}
          </span>
        </div>
      </div>
    </div>
  );
}

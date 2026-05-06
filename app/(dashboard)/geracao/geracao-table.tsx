"use client";

/**
 * Client wrapper para Geração.
 *
 * Geração é a primeira entidade com tabela-filha (`GeracaoDia`). Mostra:
 *  - na coluna "Total kWh", soma de todos os dias da geração;
 *  - aba "Dias" no drawer com grade 1..31 + total + média.
 */
import type { ColumnDef } from "@tanstack/react-table";
import type { Geracao, GeracaoDia, Usina } from "@prisma/client";

import {
  DetailField,
  type EntityRelation,
} from "@/components/data-table/entity-drawer";
import { EntityPage } from "@/components/data-table/entity-page";
import { Badge } from "@/components/ui/badge";
import {
  buildGeracaoFormFields,
  geracaoSchema,
  type UsinaOption,
} from "@/lib/schemas/geracao";
import type { Serialized } from "@/lib/serialize";

import * as actions from "./actions";

export type GeracaoRow = Serialized<Geracao> & {
  usina: Pick<Usina, "id" | "nome"> | null;
  dias: Serialized<GeracaoDia>[];
};

function formatKwh(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function totalKwh(dias: GeracaoRow["dias"]): number {
  return dias.reduce((acc, d) => acc + (d.kwh ?? 0), 0);
}

function diasComDado(dias: GeracaoRow["dias"]): number {
  return dias.filter((d) => d.kwh != null && d.kwh > 0).length;
}

const columns: ColumnDef<GeracaoRow, unknown>[] = [
  {
    id: "usina",
    header: "Usina",
    cell: ({ row }) =>
      row.original.usina?.nome ?? (
        <span className="text-xs text-muted-foreground">
          {row.original.nomeUsinaRaw ?? "—"}
        </span>
      ),
  },
  {
    accessorKey: "ano",
    header: "Ano",
    cell: ({ row }) => row.original.ano ?? "—",
  },
  {
    accessorKey: "mes",
    header: "Mês",
    cell: ({ row }) =>
      row.original.mes ? <Badge variant="secondary">{row.original.mes}</Badge> : "—",
  },
  {
    id: "totalKwh",
    header: "Total kWh",
    cell: ({ row }) => formatKwh(totalKwh(row.original.dias)),
  },
  {
    id: "metaMensal",
    header: "Meta mensal",
    cell: ({ row }) => formatKwh(row.original.metaMensal),
  },
  {
    id: "atingido",
    header: "% atingido",
    cell: ({ row }) => {
      const total = totalKwh(row.original.dias);
      const meta = row.original.metaMensal;
      if (!meta || meta === 0) return "—";
      const pct = (total / meta) * 100;
      return (
        <Badge
          variant={
            pct >= 100 ? "default" : pct >= 80 ? "secondary" : "destructive"
          }
        >
          {pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
        </Badge>
      );
    },
  },
  {
    id: "diasAtivos",
    header: "Dias com dado",
    cell: ({ row }) => `${diasComDado(row.original.dias)} / 31`,
  },
];

function renderDetails(g: GeracaoRow) {
  const total = totalKwh(g.dias);
  const ativos = diasComDado(g.dias);
  const media = ativos > 0 ? total / ativos : 0;
  return (
    <dl>
      <DetailField label="Usina" value={g.usina?.nome ?? g.nomeUsinaRaw} />
      <DetailField label="Ano" value={g.ano} />
      <DetailField label="Mês" value={g.mes} />
      <DetailField
        label="Meta mensal"
        value={g.metaMensal != null ? `${formatKwh(g.metaMensal)} kWh` : null}
      />
      <DetailField
        label="Meta de geração"
        value={g.metaGeracao != null ? `${formatKwh(g.metaGeracao)} kWh` : null}
      />
      <DetailField label="Total no mês" value={`${formatKwh(total)} kWh`} />
      <DetailField label="Dias com dado" value={`${ativos} / 31`} />
      <DetailField
        label="Média diária"
        value={ativos > 0 ? `${formatKwh(media)} kWh/dia` : null}
      />
    </dl>
  );
}

/** Aba "Dias" do drawer — grade compacta com os 31 valores diários. */
const diasRelation: EntityRelation<GeracaoRow> = {
  label: "Dias",
  render: (g) => {
    const total = totalKwh(g.dias);
    const ativos = diasComDado(g.dias);
    const media = ativos > 0 ? total / ativos : 0;
    const max = g.dias.reduce((m, d) => Math.max(m, d.kwh ?? 0), 0);
    const min = g.dias.reduce(
      (m, d) => (d.kwh != null && d.kwh > 0 ? Math.min(m, d.kwh) : m),
      max || Infinity,
    );

    const byDia = new Map<number, number | null>();
    for (const d of g.dias) byDia.set(d.dia, d.kwh ?? null);

    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Total" value={`${formatKwh(total)} kWh`} />
          <Stat label="Média" value={`${formatKwh(media)} kWh`} />
          <Stat label="Máx" value={`${formatKwh(max)} kWh`} />
          <Stat
            label="Mín"
            value={
              ativos > 0 ? `${formatKwh(Number.isFinite(min) ? min : 0)} kWh` : "—"
            }
          />
        </div>

        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left">Dia</th>
                <th className="px-3 py-1.5 text-right">kWh</th>
                <th className="px-3 py-1.5 text-right">% da meta</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((dia) => {
                const kwh = byDia.get(dia);
                const metaDiaria =
                  g.metaMensal != null ? g.metaMensal / 31 : null;
                const pct =
                  kwh != null && metaDiaria && metaDiaria > 0
                    ? (kwh / metaDiaria) * 100
                    : null;
                return (
                  <tr key={dia} className="border-t">
                    <td className="px-3 py-1 font-mono text-xs">
                      {String(dia).padStart(2, "0")}
                    </td>
                    <td className="px-3 py-1 text-right">
                      {kwh != null ? formatKwh(kwh) : "—"}
                    </td>
                    <td className="px-3 py-1 text-right text-xs text-muted-foreground">
                      {pct != null
                        ? `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  },
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

interface Props {
  rows: GeracaoRow[];
  usinaOptions: UsinaOption[];
}

export function GeracaoTable({ rows, usinaOptions }: Props) {
  const fields = buildGeracaoFormFields(usinaOptions);
  return (
    <EntityPage<GeracaoRow, typeof geracaoSchema>
      title="Geração"
      prismaModel="Geracao"
      rawFileName="geracao.json"
      schema={geracaoSchema}
      fields={fields}
      rows={rows}
      columns={columns}
      actions={actions}
      details={renderDetails}
      relations={[diasRelation]}
    />
  );
}

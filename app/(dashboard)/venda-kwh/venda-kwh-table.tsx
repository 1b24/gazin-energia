"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Usina, VendaKwh } from "@prisma/client";

import { DetailField } from "@/components/data-table/entity-drawer";
import { EntityPage } from "@/components/data-table/entity-page";
import { Badge } from "@/components/ui/badge";
import type { UsinaOption } from "@/lib/schemas/geracao";
import {
  MES_OPTIONS,
  buildVendaKwhFormFields,
  vendaKwhSchema,
} from "@/lib/schemas/venda-kwh";
import type { Serialized } from "@/lib/serialize";

import * as actions from "./actions";

export type VendaKwhRow = Serialized<VendaKwh> & {
  usina: Pick<Usina, "id" | "nome"> | null;
};

const MES_LABEL: Record<string, string> = Object.fromEntries(
  MES_OPTIONS.map((o) => [o.value, o.label]),
);

const fmtKwh = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const fmtBRL = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

const columns: ColumnDef<VendaKwhRow, unknown>[] = [
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
    cell: ({ row }) => row.original.ano,
  },
  {
    accessorKey: "mes",
    header: "Mês",
    cell: ({ row }) => (
      <Badge variant="secondary">
        {MES_LABEL[row.original.mes] ?? row.original.mes}
      </Badge>
    ),
  },
  {
    accessorKey: "kwhVendidos",
    header: "KWh vendidos",
    cell: ({ row }) => fmtKwh(row.original.kwhVendidos),
  },
  {
    accessorKey: "valorReais",
    header: "Valor",
    cell: ({ row }) => (
      <span className="font-medium">{fmtBRL(row.original.valorReais)}</span>
    ),
  },
  {
    id: "precoMedio",
    header: "R$/kWh",
    cell: ({ row }) => {
      const v = row.original.valorReais;
      const k = row.original.kwhVendidos;
      if (v == null || k == null || k === 0) return "—";
      return fmtBRL(v / k).replace("R$", "R$ ").replace("R$  ", "R$ ");
    },
  },
  {
    accessorKey: "notaFiscalUrl",
    header: "NF",
    cell: ({ row }) =>
      row.original.notaFiscalUrl ? (
        <span className="text-xs text-muted-foreground" title={row.original.notaFiscalUrl}>
          {row.original.notaFiscalUrl.length > 32
            ? `${row.original.notaFiscalUrl.slice(0, 30)}…`
            : row.original.notaFiscalUrl}
        </span>
      ) : (
        "—"
      ),
  },
];

function renderDetails(v: VendaKwhRow) {
  const precoMedio =
    v.valorReais != null && v.kwhVendidos != null && v.kwhVendidos !== 0
      ? v.valorReais / v.kwhVendidos
      : null;
  return (
    <dl>
      <DetailField label="Usina" value={v.usina?.nome ?? v.nomeUsinaRaw} />
      <DetailField label="Ano" value={v.ano} />
      <DetailField
        label="Mês"
        value={MES_LABEL[v.mes] ?? v.mes}
      />
      <DetailField
        label="KWh vendidos"
        value={v.kwhVendidos != null ? `${fmtKwh(v.kwhVendidos)} kWh` : null}
      />
      <DetailField label="Valor total" value={fmtBRL(v.valorReais)} />
      <DetailField
        label="Preço médio (R$/kWh)"
        value={precoMedio != null ? fmtBRL(precoMedio) : null}
      />
      <DetailField label="Nota fiscal" value={v.notaFiscalUrl} />
    </dl>
  );
}

interface Props {
  rows: VendaKwhRow[];
  usinaOptions: UsinaOption[];
}

export function VendaKwhTable({ rows, usinaOptions }: Props) {
  const fields = buildVendaKwhFormFields(usinaOptions);
  return (
    <EntityPage<VendaKwhRow, typeof vendaKwhSchema>
      title="Venda de KWh"
      prismaModel="VendaKwh"
      rawFileName="venda_kwh.json"
      schema={vendaKwhSchema}
      fields={fields}
      rows={rows}
      columns={columns}
      actions={actions}
      details={renderDetails}
    />
  );
}

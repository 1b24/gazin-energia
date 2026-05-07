"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Filial, Fornecedor, Injecao } from "@prisma/client";
import { Paperclip } from "lucide-react";

import { DetailField } from "@/components/data-table/entity-drawer";
import { EntityPage } from "@/components/data-table/entity-page";
import { Badge } from "@/components/ui/badge";
import {
  buildInjecaoFormFields,
  injecaoSchema,
  type FilialPickerOption,
  type FornecedorPickerOption,
} from "@/lib/schemas/injecao";
import type { Serialized } from "@/lib/serialize";

import * as actions from "./actions";

export type InjecaoRow = Serialized<Injecao> & {
  filial: Pick<Filial, "id" | "codigo" | "mercadoLivre"> | null;
  fornecedor: Pick<Fornecedor, "id" | "nome"> | null;
};

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

function FileLink({ url }: { url: string | null | undefined }) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  if (url.startsWith("/uploads/") || /^https?:\/\//.test(url)) {
    const filename = url.split("/").pop() ?? url;
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <Paperclip className="h-3 w-3" />
        {filename.length > 24 ? `${filename.slice(0, 22)}…` : filename}
      </a>
    );
  }
  return (
    <span className="text-xs text-muted-foreground" title={url}>
      {url.length > 24 ? `${url.slice(0, 22)}…` : url}
    </span>
  );
}

const columns: ColumnDef<InjecaoRow, unknown>[] = [
  {
    id: "filial",
    header: "Filial",
    cell: ({ row }) => {
      const f = row.original.filial;
      if (f) {
        return (
          <span className="text-xs">
            {f.codigo ?? "—"}
            {f.mercadoLivre ? ` · ${f.mercadoLivre}` : ""}
          </span>
        );
      }
      const raw = row.original.filialCodigoRaw;
      return raw ? (
        <span className="text-xs text-muted-foreground" title="Sem vínculo">
          {raw}
        </span>
      ) : (
        "—"
      );
    },
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
      row.original.mes ? (
        <Badge variant="secondary">{row.original.mes}</Badge>
      ) : (
        "—"
      ),
  },
  {
    accessorKey: "uc",
    header: "UC",
    cell: ({ row }) =>
      row.original.uc ? (
        <span className="font-mono text-xs">{row.original.uc}</span>
      ) : (
        "—"
      ),
  },
  {
    id: "fornecedor",
    header: "Fornecedor",
    cell: ({ row }) => {
      const f = row.original.fornecedor;
      if (f) return f.nome ?? "—";
      return row.original.fornecedorRaw ? (
        <span className="text-xs text-muted-foreground" title="Sem vínculo">
          {row.original.fornecedorRaw}
        </span>
      ) : (
        "—"
      );
    },
  },
  {
    accessorKey: "consumoKwhP",
    header: "Consumo P (kWh)",
    cell: ({ row }) => fmtKwh(row.original.consumoKwhP),
  },
  {
    accessorKey: "consumoKwhP1",
    header: "Consumo P1 (kWh)",
    cell: ({ row }) => fmtKwh(row.original.consumoKwhP1),
  },
  {
    accessorKey: "consumoTotalKwh",
    header: "Total (kWh)",
    cell: ({ row }) => fmtKwh(row.original.consumoTotalKwh),
  },
  {
    accessorKey: "valor",
    header: "Valor",
    cell: ({ row }) => (
      <span className="font-medium">{fmtBRL(row.original.valor)}</span>
    ),
  },
  {
    accessorKey: "valor1",
    header: "Valor 1",
    cell: ({ row }) => fmtBRL(row.original.valor1),
  },
  {
    accessorKey: "valor2",
    header: "Valor 2",
    cell: ({ row }) => fmtBRL(row.original.valor2),
  },
  {
    accessorKey: "municipio",
    header: "Município",
    cell: ({ row }) => row.original.municipio ?? "—",
  },
  {
    id: "anexo",
    header: "Anexo",
    enableSorting: false,
    cell: ({ row }) => <FileLink url={row.original.anexoFechamento} />,
  },
];

const HIDDEN_BY_DEFAULT = {
  consumoKwhP: false,
  consumoKwhP1: false,
  valor1: false,
  valor2: false,
};

function renderDetails(i: InjecaoRow) {
  return (
    <dl>
      <DetailField
        label="Filial"
        value={
          i.filial
            ? `${i.filial.codigo ?? "—"} · ${i.filial.mercadoLivre ?? ""}`.trim()
            : i.filialCodigoRaw
              ? `${i.filialCodigoRaw} (sem vínculo)`
              : null
        }
      />
      <DetailField label="Ano" value={i.ano} />
      <DetailField label="Mês" value={i.mes} />
      <DetailField label="UC" value={i.uc} />
      <DetailField label="Município" value={i.municipio} />
      <DetailField
        label="Fornecedor"
        value={
          i.fornecedor?.nome ??
          (i.fornecedorRaw ? `${i.fornecedorRaw} (sem vínculo)` : null)
        }
      />
      <DetailField
        label="Consumo P"
        value={i.consumoKwhP != null ? `${fmtKwh(i.consumoKwhP)} kWh` : null}
      />
      <DetailField
        label="Consumo P1"
        value={i.consumoKwhP1 != null ? `${fmtKwh(i.consumoKwhP1)} kWh` : null}
      />
      <DetailField
        label="Consumo total"
        value={
          i.consumoTotalKwh != null ? `${fmtKwh(i.consumoTotalKwh)} kWh` : null
        }
      />
      <DetailField label="Valor" value={fmtBRL(i.valor)} />
      <DetailField label="Valor 1" value={fmtBRL(i.valor1)} />
      <DetailField label="Valor 2" value={fmtBRL(i.valor2)} />
      <DetailField
        label="Anexo de fechamento"
        value={i.anexoFechamento ? <FileLink url={i.anexoFechamento} /> : null}
      />
    </dl>
  );
}

interface Props {
  rows: InjecaoRow[];
  filialOptions: FilialPickerOption[];
  fornecedorOptions: FornecedorPickerOption[];
}

export function InjecaoTable({
  rows,
  filialOptions,
  fornecedorOptions,
}: Props) {
  const fields = buildInjecaoFormFields(filialOptions, fornecedorOptions);
  return (
    <EntityPage<InjecaoRow, typeof injecaoSchema>
      title="Controle de Injeção"
      prismaModel="Injecao"
      rawFileName="injecao.json"
      schema={injecaoSchema}
      fields={fields}
      rows={rows}
      columns={columns}
      initialColumnVisibility={HIDDEN_BY_DEFAULT}
      actions={actions}
      details={renderDetails}
    />
  );
}

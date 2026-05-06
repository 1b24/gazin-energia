"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Consumo, Filial } from "@prisma/client";
import { Paperclip } from "lucide-react";

import { DetailField } from "@/components/data-table/entity-drawer";
import { EntityPage } from "@/components/data-table/entity-page";
import { Badge } from "@/components/ui/badge";
import { buildConsumoFormFields, consumoSchema } from "@/lib/schemas/consumo";
import type { FilialOption } from "@/lib/schemas/usina";
import type { Serialized } from "@/lib/serialize";

import * as actions from "./actions";

export type ConsumoRow = Serialized<Consumo> & {
  filial: Pick<Filial, "id" | "codigo" | "mercadoLivre"> | null;
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

const columns: ColumnDef<ConsumoRow, unknown>[] = [
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
      row.original.mes ? <Badge variant="secondary">{row.original.mes}</Badge> : "—",
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
    accessorKey: "consumoTotal",
    header: "Consumo (kWh)",
    cell: ({ row }) => fmtKwh(row.original.consumoTotal),
  },
  {
    accessorKey: "injecaoRecebida",
    header: "Injeção (kWh)",
    cell: ({ row }) => fmtKwh(row.original.injecaoRecebida),
  },
  {
    accessorKey: "valorTotalFatura",
    header: "Total fatura",
    cell: ({ row }) => (
      <span className="font-medium">{fmtBRL(row.original.valorTotalFatura)}</span>
    ),
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
    cell: ({ row }) => <FileLink url={row.original.arquivoFatura} />,
  },
];

function renderDetails(c: ConsumoRow) {
  return (
    <dl>
      <DetailField
        label="Filial"
        value={
          c.filial
            ? `${c.filial.codigo ?? "—"} · ${c.filial.mercadoLivre ?? ""}`.trim()
            : c.filialCodigoRaw
              ? `${c.filialCodigoRaw} (sem vínculo)`
              : null
        }
      />
      <DetailField label="Ano" value={c.ano} />
      <DetailField label="Mês" value={c.mes} />
      <DetailField label="UC" value={c.uc} />
      <DetailField label="Município" value={c.municipio} />

      <DetailField
        label="Consumo P"
        value={c.consumoKwhP != null ? `${fmtKwh(c.consumoKwhP)} kWh` : null}
      />
      <DetailField
        label="Consumo FP"
        value={c.consumoKwhFp != null ? `${fmtKwh(c.consumoKwhFp)} kWh` : null}
      />
      <DetailField
        label="Consumo total"
        value={c.consumoTotal != null ? `${fmtKwh(c.consumoTotal)} kWh` : null}
      />
      <DetailField
        label="Injeção recebida"
        value={
          c.injecaoRecebida != null ? `${fmtKwh(c.injecaoRecebida)} kWh` : null
        }
      />

      <DetailField label="Valor" value={fmtBRL(c.valor)} />
      <DetailField label="Valor 1" value={fmtBRL(c.valor1)} />
      <DetailField label="Valor 2" value={fmtBRL(c.valor2)} />
      <DetailField label="Valor 3" value={fmtBRL(c.valor3)} />
      <DetailField
        label="Valor total da fatura"
        value={fmtBRL(c.valorTotalFatura)}
      />

      <DetailField
        label="Multas / juros / atraso"
        value={fmtBRL(c.multasJurosAtraso)}
      />
      <DetailField label="Outras multas" value={fmtBRL(c.outrasMultas)} />

      <DetailField label="Status do anexo" value={c.statusAnexo} />
      <DetailField
        label="Arquivo da fatura"
        value={
          c.arquivoFatura ? <FileLink url={c.arquivoFatura} /> : null
        }
      />
    </dl>
  );
}

interface Props {
  rows: ConsumoRow[];
  filialOptions: FilialOption[];
}

export function ConsumoTable({ rows, filialOptions }: Props) {
  const fields = buildConsumoFormFields(filialOptions);
  return (
    <EntityPage<ConsumoRow, typeof consumoSchema>
      title="Consumo"
      prismaModel="Consumo"
      rawFileName="consumo.json"
      schema={consumoSchema}
      fields={fields}
      rows={rows}
      columns={columns}
      actions={actions}
      details={renderDetails}
    />
  );
}

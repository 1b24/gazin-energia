"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { ProcessoJuridico } from "@prisma/client";

import { DetailField } from "@/components/data-table/entity-drawer";
import { EntityPage } from "@/components/data-table/entity-page";
import { Badge } from "@/components/ui/badge";
import {
  TIPO_PROCESSO_LABEL,
  processoJuridicoFormFields,
  processoJuridicoSchema,
} from "@/lib/schemas/processo-juridico";
import type { Serialized } from "@/lib/serialize";

import * as actions from "./actions";

export type ProcessoRow = Serialized<ProcessoJuridico>;

const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("pt-BR");
};

const columns: ColumnDef<ProcessoRow, unknown>[] = [
  {
    accessorKey: "nomeUsinasRaw",
    header: "Usina(s)",
    cell: ({ row }) => row.original.nomeUsinasRaw ?? "—",
  },
  {
    accessorKey: "tipo",
    header: "Tipo",
    cell: ({ row }) =>
      row.original.tipo ? (
        <Badge
          variant={row.original.tipo === "judicial" ? "default" : "secondary"}
        >
          {TIPO_PROCESSO_LABEL[row.original.tipo]}
        </Badge>
      ) : (
        "—"
      ),
  },
  {
    accessorKey: "parteAdversa",
    header: "Parte adversa",
    cell: ({ row }) => row.original.parteAdversa ?? "—",
  },
  {
    accessorKey: "pleito",
    header: "Pleito",
    cell: ({ row }) => row.original.pleito ?? "—",
  },
  {
    accessorKey: "dataProtocolo",
    header: "Protocolo",
    cell: ({ row }) => fmtDate(row.original.dataProtocolo),
  },
  {
    accessorKey: "fornecedor",
    header: "Fornecedor",
    cell: ({ row }) => row.original.fornecedor ?? "—",
  },
];

function renderDetails(p: ProcessoRow) {
  return (
    <dl>
      <DetailField label="Usina(s) envolvida(s)" value={p.nomeUsinasRaw} />
      <DetailField
        label="Tipo"
        value={p.tipo ? TIPO_PROCESSO_LABEL[p.tipo] : null}
      />
      <DetailField label="Parte adversa" value={p.parteAdversa} />
      <DetailField label="Pleito" value={p.pleito} />
      <DetailField label="Data do protocolo" value={fmtDate(p.dataProtocolo)} />
      <DetailField label="Fornecedor" value={p.fornecedor} />
      <DetailField label="Evolução (Janeiro)" value={p.evolucaoJaneiro} />
    </dl>
  );
}

export function ProcessosTable({ rows }: { rows: ProcessoRow[] }) {
  return (
    <EntityPage<ProcessoRow, typeof processoJuridicoSchema>
      title="Processos Adm. e Judiciais"
      prismaModel="ProcessoJuridico"
      rawFileName="juridico_processos.json"
      schema={processoJuridicoSchema}
      fields={processoJuridicoFormFields}
      rows={rows}
      columns={columns}
      actions={actions}
      details={renderDetails}
    />
  );
}

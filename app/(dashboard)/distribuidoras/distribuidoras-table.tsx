"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Distribuidora } from "@prisma/client";

import { DetailField } from "@/components/data-table/entity-drawer";
import { EntityPage } from "@/components/data-table/entity-page";
import { Badge } from "@/components/ui/badge";
import {
  distribuidoraFormFields,
  distribuidoraSchema,
} from "@/lib/schemas/distribuidora";
import type { Serialized } from "@/lib/serialize";

import * as actions from "./actions";

export type DistribuidoraRow = Serialized<Distribuidora>;

const columns: ColumnDef<DistribuidoraRow, unknown>[] = [
  {
    accessorKey: "nome",
    header: "Nome",
    cell: ({ row }) => row.original.nome,
  },
  {
    accessorKey: "sigla",
    header: "Sigla",
    cell: ({ row }) =>
      row.original.sigla ? (
        <Badge variant="secondary">{row.original.sigla}</Badge>
      ) : (
        "—"
      ),
  },
  {
    accessorKey: "uf",
    header: "UF",
    cell: ({ row }) =>
      row.original.uf ? (
        <Badge variant="outline">{row.original.uf}</Badge>
      ) : (
        "—"
      ),
  },
  {
    accessorKey: "codigoAneel",
    header: "Código ANEEL",
    cell: ({ row }) =>
      row.original.codigoAneel ? (
        <span className="font-mono text-xs">{row.original.codigoAneel}</span>
      ) : (
        "—"
      ),
  },
];

function renderDetails(d: DistribuidoraRow) {
  return (
    <dl>
      <DetailField label="Nome" value={d.nome} />
      <DetailField label="Sigla" value={d.sigla} />
      <DetailField label="UF" value={d.uf} />
      <DetailField label="Código ANEEL" value={d.codigoAneel} />
    </dl>
  );
}

export function DistribuidorasTable({
  rows,
}: {
  rows: DistribuidoraRow[];
}) {
  return (
    <EntityPage<DistribuidoraRow, typeof distribuidoraSchema>
      title="Distribuidoras"
      prismaModel="Distribuidora"
      rawFileName="distribuidoras.json"
      schema={distribuidoraSchema}
      fields={distribuidoraFormFields}
      rows={rows}
      columns={columns}
      actions={actions}
      details={renderDetails}
    />
  );
}

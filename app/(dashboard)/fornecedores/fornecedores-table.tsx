"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Filial, Fornecedor } from "@prisma/client";

import { DetailField } from "@/components/data-table/entity-drawer";
import { EntityPage } from "@/components/data-table/entity-page";
import { Badge } from "@/components/ui/badge";
import { formatCNPJ } from "@/lib/format";
import {
  buildFornecedorFormFields,
  fornecedorSchema,
} from "@/lib/schemas/fornecedor";
import type { FilialOption } from "@/lib/schemas/usina";
import type { Serialized } from "@/lib/serialize";

import * as actions from "./actions";

export type FornecedorRow = Serialized<Fornecedor> & {
  abrangenciaFilial: Pick<Filial, "id" | "codigo" | "mercadoLivre"> | null;
};

const columns: ColumnDef<FornecedorRow, unknown>[] = [
  {
    accessorKey: "nome",
    header: "Nome",
    cell: ({ row }) =>
      row.original.nome ? (
        <span className="font-medium">{row.original.nome}</span>
      ) : (
        <span className="text-xs italic text-muted-foreground">
          (sem nome no source)
        </span>
      ),
  },
  {
    accessorKey: "cnpj",
    header: "CNPJ",
    cell: ({ row }) =>
      row.original.cnpj ? (
        <span className="font-mono text-xs">
          {formatCNPJ(row.original.cnpj)}
        </span>
      ) : (
        "—"
      ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge
        variant={row.original.status === "ativo" ? "default" : "secondary"}
      >
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: "escopoServico",
    header: "Escopo",
    cell: ({ row }) => row.original.escopoServico ?? "—",
  },
  {
    id: "abrangenciaFilial",
    header: "Filial (vínculo)",
    cell: ({ row }) => {
      const f = row.original.abrangenciaFilial;
      if (f) {
        return (
          <span className="text-xs">
            {f.codigo ?? "—"}
            {f.mercadoLivre ? ` · ${f.mercadoLivre}` : ""}
          </span>
        );
      }
      const raw = row.original.abrangenciaFilialRaw;
      if (raw) {
        return (
          <span className="text-xs text-muted-foreground" title="Sem vínculo formal">
            {raw}
          </span>
        );
      }
      return "—";
    },
  },
  {
    accessorKey: "inicioPrestacao",
    header: "Início",
    cell: ({ row }) =>
      row.original.inicioPrestacao
        ? new Date(row.original.inicioPrestacao).toLocaleDateString("pt-BR")
        : "—",
  },
  {
    accessorKey: "terminoPrestacao",
    header: "Término",
    cell: ({ row }) =>
      row.original.terminoPrestacao
        ? new Date(row.original.terminoPrestacao).toLocaleDateString("pt-BR")
        : "—",
  },
];

function renderDetails(f: FornecedorRow) {
  return (
    <dl>
      <DetailField label="Nome" value={f.nome} />
      <DetailField label="CNPJ" value={f.cnpj ? formatCNPJ(f.cnpj) : null} />
      <DetailField label="Status" value={f.status} />
      <DetailField label="Escopo de serviço" value={f.escopoServico} />
      <DetailField
        label="Filial de abrangência"
        value={
          f.abrangenciaFilial
            ? `${f.abrangenciaFilial.codigo ?? "—"} · ${f.abrangenciaFilial.mercadoLivre ?? ""}`.trim()
            : f.abrangenciaFilialRaw
              ? `${f.abrangenciaFilialRaw} (sem vínculo formal)`
              : null
        }
      />
      <DetailField label="Abrangência das usinas" value={f.abrangenciaUsinas} />
      <DetailField
        label="Início da prestação"
        value={
          f.inicioPrestacao
            ? new Date(f.inicioPrestacao).toLocaleDateString("pt-BR")
            : null
        }
      />
      <DetailField
        label="Término da prestação"
        value={
          f.terminoPrestacao
            ? new Date(f.terminoPrestacao).toLocaleDateString("pt-BR")
            : null
        }
      />
      <DetailField label="ID do contrato (Zoho)" value={f.idContratoZoho} />
      <DetailField label="Anexo do contrato" value={f.anexoContrato} />
    </dl>
  );
}

interface Props {
  rows: FornecedorRow[];
  filialOptions: FilialOption[];
}

export function FornecedoresTable({ rows, filialOptions }: Props) {
  const fields = buildFornecedorFormFields(filialOptions);
  return (
    <EntityPage<FornecedorRow, typeof fornecedorSchema>
      title="Fornecedores"
      prismaModel="Fornecedor"
      rawFileName="fornecedores.json"
      schema={fornecedorSchema}
      fields={fields}
      rows={rows}
      columns={columns}
      actions={actions}
      details={renderDetails}
    />
  );
}

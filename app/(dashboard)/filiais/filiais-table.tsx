"use client";

/**
 * Client wrapper para a página de Filiais.
 *
 * O page.tsx (server) busca dados via Prisma e passa pra cá. Definir colunas /
 * renderers / actions aqui é necessário porque RSC não serializa funções entre
 * server e client.
 */
import type { ColumnDef } from "@tanstack/react-table";
import type { Filial } from "@prisma/client";

import type { Serialized } from "@/lib/serialize";
import { DetailField } from "@/components/data-table/entity-drawer";
import { EntityPage } from "@/components/data-table/entity-page";
import { Badge } from "@/components/ui/badge";
import { formatCNPJ } from "@/lib/format";
import { filialFormFields, filialSchema } from "@/lib/schemas/filial";

import * as actions from "./actions";

// `Serialized<Filial>` reflete a passagem por `serializePrisma()` em page.tsx
// (Decimal → number, demais tipos preservados).
export type FilialRow = Serialized<Filial> & {
  _count: { usinas: number; consumos: number; fornecedoresAbrangencia: number };
};

const columns: ColumnDef<FilialRow, unknown>[] = [
  {
    accessorKey: "codigo",
    header: "Código",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.codigo ?? "—"}</span>
    ),
  },
  {
    accessorKey: "mercadoLivre",
    header: "Mercado Livre",
    cell: ({ row }) => row.original.mercadoLivre ?? "—",
  },
  {
    accessorKey: "uc",
    header: "UC principal",
    cell: ({ row }) =>
      row.original.uc ? (
        <span className="font-mono text-xs">{row.original.uc}</span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "uc2",
    header: "UC #2",
    cell: ({ row }) =>
      row.original.uc2 ? (
        <span className="font-mono text-xs">{row.original.uc2}</span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "uc3",
    header: "UC #3",
    cell: ({ row }) =>
      row.original.uc3 ? (
        <span className="font-mono text-xs">{row.original.uc3}</span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "municipio",
    header: "Município",
    cell: ({ row }) => row.original.municipio ?? "—",
  },
  {
    accessorKey: "uf",
    header: "UF",
    cell: ({ row }) =>
      row.original.uf ? (
        <Badge variant="secondary">{row.original.uf}</Badge>
      ) : (
        "—"
      ),
  },
  {
    accessorKey: "distribuidora",
    header: "Distribuidora",
    cell: ({ row }) => row.original.distribuidora ?? "—",
  },
  {
    accessorKey: "grupo",
    header: "Grupo",
    cell: ({ row }) => row.original.grupo ?? "—",
  },
  {
    accessorKey: "classeTensao",
    header: "Classe tensão",
    cell: ({ row }) =>
      row.original.classeTensao ? (
        <Badge variant="secondary">{row.original.classeTensao}</Badge>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
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
    id: "_count",
    header: "Vínculos",
    enableSorting: false,
    cell: ({ row }) => {
      const c = row.original._count;
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{c.usinas} usina(s)</span>
          <span>·</span>
          <span>{c.consumos} consumo(s)</span>
        </div>
      );
    },
  },
];

function renderDetails(f: FilialRow) {
  return (
    <dl>
      <DetailField label="Código" value={f.codigo} />
      <DetailField label="Mercado Livre" value={f.mercadoLivre} />
      <DetailField label="CD" value={f.cd} />
      <DetailField label="Município" value={f.municipio} />
      <DetailField label="UF" value={f.uf} />
      <DetailField label="Grupo Tarifário" value={f.grupo} />
      <DetailField label="Distribuidora" value={f.distribuidora} />
      <DetailField label="Classe de tensão" value={f.classeTensao} />
      <DetailField
        label="CNPJ"
        value={f.cnpj ? formatCNPJ(f.cnpj) : null}
      />
      <DetailField label="UC principal" value={f.uc} />
      <DetailField label="UC #2" value={f.uc2} />
      <DetailField label="UC #3" value={f.uc3} />
      <DetailField
        label="% Absorção USP"
        value={
          f.percentualAbsorcaoUsp != null
            ? `${f.percentualAbsorcaoUsp.toString()}%`
            : null
        }
      />
      <DetailField label="Climatizada" value={f.filialClimatizada} />
      <DetailField
        label="Climatização planejada"
        value={
          f.dataClimatizacaoPlanejada
            ? new Date(f.dataClimatizacaoPlanejada).toLocaleDateString("pt-BR")
            : null
        }
      />
      <DetailField label="Usuário" value={f.usuario} />
      <DetailField
        label="Vínculos"
        value={`${f._count.usinas} usina(s) · ${f._count.consumos} consumo(s) · ${f._count.fornecedoresAbrangencia} fornecedor(es)`}
      />
    </dl>
  );
}

// UC #2 e #3 escondidas por default — usuário libera no dropdown
// "Colunas" se precisar visualizar. Mantém a tabela enxuta.
const HIDDEN_BY_DEFAULT = {
  uc2: false,
  uc3: false,
};

export function FiliaisTable({ rows }: { rows: FilialRow[] }) {
  return (
    <EntityPage<FilialRow, typeof filialSchema>
      title="Filiais"
      prismaModel="Filial"
      rawFileName="filiais.json"
      schema={filialSchema}
      fields={filialFormFields}
      rows={rows}
      columns={columns}
      initialColumnVisibility={HIDDEN_BY_DEFAULT}
      actions={actions}
      details={renderDetails}
    />
  );
}

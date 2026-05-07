"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Orcamento, Usina } from "@prisma/client";
import { Paperclip } from "lucide-react";

import { DetailField } from "@/components/data-table/entity-drawer";
import { EntityPage } from "@/components/data-table/entity-page";
import { Badge } from "@/components/ui/badge";
import type { UsinaOption } from "@/lib/schemas/geracao";
import {
  ORCAMENTO_TIPO_LABEL,
  buildOrcamentoFormFields,
  orcamentoSchema,
} from "@/lib/schemas/orcamento";
import type { Serialized } from "@/lib/serialize";

import * as actions from "./actions";

export type OrcamentoRow = Serialized<Orcamento> & {
  usina: Pick<Usina, "id" | "nome"> | null;
};

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

const columns: ColumnDef<OrcamentoRow, unknown>[] = [
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
    accessorKey: "tipo",
    header: "Tipo",
    cell: ({ row }) =>
      row.original.tipo ? (
        <Badge>{ORCAMENTO_TIPO_LABEL[row.original.tipo]}</Badge>
      ) : (
        "—"
      ),
  },
  {
    accessorKey: "naturezaGasto",
    header: "Natureza do gasto",
    cell: ({ row }) => row.original.naturezaGasto ?? "—",
  },
  {
    accessorKey: "usoConsumo",
    header: "Uso e consumo",
    cell: ({ row }) => fmtBRL(row.original.usoConsumo),
  },
  {
    accessorKey: "realUsoConsumo",
    header: "Real uso/consumo",
    cell: ({ row }) => fmtBRL(row.original.realUsoConsumo),
  },
  {
    accessorKey: "realEquipamentos",
    header: "Real equipamentos",
    cell: ({ row }) => fmtBRL(row.original.realEquipamentos),
  },
  {
    accessorKey: "realViagensEstadias",
    header: "Real viagens",
    cell: ({ row }) => fmtBRL(row.original.realViagensEstadias),
  },
  {
    id: "anexo",
    header: "Anexo",
    enableSorting: false,
    cell: ({ row }) => <FileLink url={row.original.anexosDetalhamento} />,
  },
];

const HIDDEN_BY_DEFAULT = {
  realEquipamentos: false,
  realViagensEstadias: false,
};

function renderDetails(o: OrcamentoRow) {
  return (
    <dl>
      <DetailField label="Usina" value={o.usina?.nome ?? o.nomeUsinaRaw} />
      <DetailField label="Mês" value={o.mes} />
      <DetailField
        label="Tipo"
        value={o.tipo ? ORCAMENTO_TIPO_LABEL[o.tipo] : null}
      />
      <DetailField label="Natureza do gasto" value={o.naturezaGasto} />
      <DetailField label="Detalhamento" value={o.detalhamento} />
      <DetailField label="Equipamentos" value={o.equipamentos} />
      <DetailField label="Uso e consumo" value={fmtBRL(o.usoConsumo)} />
      <DetailField
        label="Real uso e consumo"
        value={fmtBRL(o.realUsoConsumo)}
      />
      <DetailField
        label="Real equipamentos"
        value={fmtBRL(o.realEquipamentos)}
      />
      <DetailField
        label="Real viagens e estadias"
        value={fmtBRL(o.realViagensEstadias)}
      />
      <DetailField
        label="Anexos do detalhamento"
        value={
          o.anexosDetalhamento ? <FileLink url={o.anexosDetalhamento} /> : null
        }
      />
    </dl>
  );
}

interface Props {
  rows: OrcamentoRow[];
  usinaOptions: UsinaOption[];
}

export function OrcamentoTable({ rows, usinaOptions }: Props) {
  const fields = buildOrcamentoFormFields(usinaOptions);
  return (
    <EntityPage<OrcamentoRow, typeof orcamentoSchema>
      title="Cadastro Orçamentário"
      prismaModel="Orcamento"
      rawFileName="orcamentario.json"
      schema={orcamentoSchema}
      fields={fields}
      rows={rows}
      columns={columns}
      initialColumnVisibility={HIDDEN_BY_DEFAULT}
      actions={actions}
      details={renderDetails}
    />
  );
}

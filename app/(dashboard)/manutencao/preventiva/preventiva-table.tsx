"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { ManutencaoPreventiva, StatusManutencao, Usina } from "@prisma/client";
import { Paperclip } from "lucide-react";

import { DetailField } from "@/components/data-table/entity-drawer";
import { EntityPage } from "@/components/data-table/entity-page";
import { Badge } from "@/components/ui/badge";
import { STATUS_MANUTENCAO_LABEL } from "@/lib/schemas/cronograma-limpeza";
import type { UsinaOption } from "@/lib/schemas/geracao";
import {
  buildManutencaoPreventivaFormFields,
  manutencaoPreventivaSchema,
} from "@/lib/schemas/manutencao-preventiva";
import type { Serialized } from "@/lib/serialize";

import * as actions from "./actions";

export type PreventivaRow = Serialized<ManutencaoPreventiva> & {
  usina: Pick<Usina, "id" | "nome"> | null;
};

const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleDateString("pt-BR");
};

function statusBadgeVariant(s: StatusManutencao | null | undefined) {
  if (!s) return "outline" as const;
  if (s === "concluida") return "default" as const;
  if (s === "em_andamento") return "secondary" as const;
  return "outline" as const;
}

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

const columns: ColumnDef<PreventivaRow, unknown>[] = [
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
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={statusBadgeVariant(row.original.status)}>
        {STATUS_MANUTENCAO_LABEL[row.original.status]}
      </Badge>
    ),
  },
  {
    accessorKey: "dataExecucao",
    header: "Execução",
    cell: ({ row }) => fmtDate(row.original.dataExecucao),
  },
  {
    accessorKey: "dataConclusao",
    header: "Conclusão",
    cell: ({ row }) => fmtDate(row.original.dataConclusao),
  },
  {
    id: "laudoTecnico",
    header: "Laudo técnico",
    enableSorting: false,
    cell: ({ row }) => <FileLink url={row.original.laudoTecnico} />,
  },
  {
    id: "fotosUsina",
    header: "Fotos",
    enableSorting: false,
    cell: ({ row }) => <FileLink url={row.original.fotosUsina} />,
  },
];

function renderDetails(p: PreventivaRow) {
  return (
    <dl>
      <DetailField label="Usina" value={p.usina?.nome ?? p.nomeUsinaRaw} />
      <DetailField
        label="Status"
        value={STATUS_MANUTENCAO_LABEL[p.status]}
      />
      <DetailField label="Data de execução" value={fmtDate(p.dataExecucao)} />
      <DetailField label="Data de conclusão" value={fmtDate(p.dataConclusao)} />
      <DetailField
        label="Laudo técnico"
        value={p.laudoTecnico ? <FileLink url={p.laudoTecnico} /> : null}
      />
      <DetailField
        label="Fotos da usina"
        value={p.fotosUsina ? <FileLink url={p.fotosUsina} /> : null}
      />
      <DetailField
        label="Checklist de verificação"
        value={p.checklistVerificacao}
      />
    </dl>
  );
}

interface Props {
  rows: PreventivaRow[];
  usinaOptions: UsinaOption[];
}

export function PreventivaTable({ rows, usinaOptions }: Props) {
  const fields = buildManutencaoPreventivaFormFields(usinaOptions);
  return (
    <EntityPage<PreventivaRow, typeof manutencaoPreventivaSchema>
      title="Manutenção Preventiva"
      prismaModel="ManutencaoPreventiva"
      rawFileName="manutencao_preventiva.json"
      schema={manutencaoPreventivaSchema}
      fields={fields}
      rows={rows}
      columns={columns}
      actions={actions}
      details={renderDetails}
    />
  );
}

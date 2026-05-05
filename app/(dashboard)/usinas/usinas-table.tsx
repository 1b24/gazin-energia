"use client";

/**
 * Client wrapper para Usinas.
 *
 * `filialOptions` chega do server component (page.tsx) — usado para popular o
 * select de Filial no form de criar/editar.
 */
import type { ColumnDef } from "@tanstack/react-table";
import type { Filial, Usina } from "@prisma/client";

import { DetailField } from "@/components/data-table/entity-drawer";
import { EntityPage } from "@/components/data-table/entity-page";
import { Badge } from "@/components/ui/badge";
import { formatCNPJ } from "@/lib/format";
import {
  buildUsinaFormFields,
  usinaSchema,
  type FilialOption,
} from "@/lib/schemas/usina";
import type { Serialized } from "@/lib/serialize";

import * as actions from "./actions";

export type UsinaRow = Serialized<Usina> & {
  filial: Pick<Filial, "id" | "codigo" | "mercadoLivre"> | null;
  _count: {
    geracoes: number;
    vendasKwh: number;
    orcamentos: number;
    cronogramasLimpeza: number;
    manutencoesPrev: number;
  };
};

const columns: ColumnDef<UsinaRow, unknown>[] = [
  {
    accessorKey: "nome",
    header: "Nome",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.nome}</span>
    ),
  },
  {
    accessorKey: "ccUsinas",
    header: "CC",
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.ccUsinas ?? "—"}
      </span>
    ),
  },
  {
    id: "filial",
    header: "Filial",
    cell: ({ row }) => {
      const f = row.original.filial;
      if (!f) {
        const raw = row.original.filialCodigoRaw;
        return raw ? (
          <span className="text-xs text-muted-foreground">{raw} (sem vínculo)</span>
        ) : (
          "—"
        );
      }
      return (
        <span className="text-xs">
          {f.codigo ?? "—"}
          {f.mercadoLivre ? ` · ${f.mercadoLivre}` : ""}
        </span>
      );
    },
  },
  {
    accessorKey: "tipoGd",
    header: "GD",
    cell: ({ row }) =>
      row.original.tipoGd ? (
        <Badge variant="secondary">{row.original.tipoGd}</Badge>
      ) : (
        "—"
      ),
  },
  {
    accessorKey: "potenciaInstaladaKw",
    header: "Potência (kW)",
    cell: ({ row }) =>
      row.original.potenciaInstaladaKw != null
        ? row.original.potenciaInstaladaKw.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : "—",
  },
  {
    accessorKey: "metaKwhMes",
    header: "Meta (kWh/mês)",
    cell: ({ row }) =>
      row.original.metaKwhMes != null
        ? row.original.metaKwhMes.toLocaleString("pt-BR")
        : "—",
  },
  {
    accessorKey: "municipio",
    header: "Município",
    cell: ({ row }) =>
      [row.original.municipio, row.original.uf].filter(Boolean).join(" / ") ||
      "—",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge
        variant={
          row.original.status === "operacional"
            ? "default"
            : row.original.status === "desativada"
              ? "destructive"
              : "secondary"
        }
      >
        {row.original.status.replace(/_/g, " ")}
      </Badge>
    ),
  },
  {
    accessorKey: "inicioOperacao",
    header: "Operação desde",
    cell: ({ row }) =>
      row.original.inicioOperacao
        ? new Date(row.original.inicioOperacao).toLocaleDateString("pt-BR")
        : "—",
  },
];

function renderDetails(u: UsinaRow) {
  const fmtNumber = (n: number | null | undefined, digits = 2) =>
    n != null
      ? n.toLocaleString("pt-BR", {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        })
      : null;
  return (
    <dl>
      <DetailField label="Nome" value={u.nome} />
      <DetailField label="CC Usina" value={u.ccUsinas} />
      <DetailField
        label="Filial"
        value={
          u.filial
            ? `${u.filial.codigo ?? "—"} · ${u.filial.mercadoLivre ?? ""}`.trim()
            : u.filialCodigoRaw
              ? `${u.filialCodigoRaw} (sem vínculo)`
              : null
        }
      />
      <DetailField label="CNPJ" value={u.cnpj ? formatCNPJ(u.cnpj) : null} />
      <DetailField label="UC" value={u.uc} />
      <DetailField label="Município" value={u.municipio} />
      <DetailField label="UF" value={u.uf} />
      <DetailField label="Tipo de instalação" value={u.localInstalacao} />
      <DetailField label="Tipo de GD" value={u.tipoGd} />
      <DetailField
        label="Potência instalada"
        value={fmtNumber(u.potenciaInstaladaKw) ? `${fmtNumber(u.potenciaInstaladaKw)} kW` : null}
      />
      <DetailField
        label="Potência projetada"
        value={fmtNumber(u.potenciaProjetadaKw) ? `${fmtNumber(u.potenciaProjetadaKw)} kW` : null}
      />
      <DetailField
        label="Meta mensal"
        value={
          u.metaKwhMes != null
            ? `${u.metaKwhMes.toLocaleString("pt-BR")} kWh`
            : null
        }
      />
      <DetailField
        label="Investimento total"
        value={
          u.investimentoTotal != null
            ? u.investimentoTotal.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })
            : null
        }
      />
      <DetailField
        label="Início de operação"
        value={
          u.inicioOperacao
            ? new Date(u.inicioOperacao).toLocaleDateString("pt-BR")
            : null
        }
      />
      <DetailField
        label="Auto-produtora"
        value={u.autoProdutora == null ? null : u.autoProdutora ? "Sim" : "Não"}
      />
      <DetailField label="Quantas filiais atende" value={u.quantasFlAtende} />
      <DetailField label="Status" value={u.status.replace(/_/g, " ")} />
      <DetailField label="Documentos do projeto" value={u.documentosProjeto} />
      <DetailField
        label="Vínculos"
        value={
          `${u._count.geracoes} geração(ões) · ${u._count.vendasKwh} venda(s) · ` +
          `${u._count.orcamentos} orçamento(s) · ${u._count.manutencoesPrev} preventiva(s) · ` +
          `${u._count.cronogramasLimpeza} cronograma(s) de limpeza`
        }
      />
    </dl>
  );
}

interface Props {
  rows: UsinaRow[];
  filialOptions: FilialOption[];
}

export function UsinasTable({ rows, filialOptions }: Props) {
  const fields = buildUsinaFormFields(filialOptions);
  return (
    <EntityPage<UsinaRow, typeof usinaSchema>
      title="Usinas"
      prismaModel="Usina"
      rawFileName="usinas.json"
      schema={usinaSchema}
      fields={fields}
      rows={rows}
      columns={columns}
      actions={actions}
      details={renderDetails}
    />
  );
}

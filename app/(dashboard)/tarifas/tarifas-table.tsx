"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type {
  Distribuidora,
  Fornecedor,
  OrigemTarifa,
  TarifaEnergia,
} from "@prisma/client";

import { DetailField } from "@/components/data-table/entity-drawer";
import { EntityPage } from "@/components/data-table/entity-page";
import { Badge } from "@/components/ui/badge";
import type { DistribuidoraPickerOption } from "@/lib/schemas/distribuidora";
import type { FornecedorPickerOption } from "@/lib/schemas/injecao";
import {
  buildTarifaEnergiaFormFields,
  tarifaEnergiaSchema,
} from "@/lib/schemas/tarifa-energia";
import type { Serialized } from "@/lib/serialize";

import * as actions from "./actions";

export type TarifaRow = Serialized<TarifaEnergia> & {
  fornecedor: Pick<Fornecedor, "id" | "nome"> | null;
  distribuidora: Pick<Distribuidora, "id" | "nome" | "sigla"> | null;
};

const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("pt-BR");
};

/** Formata um Decimal/number com 6 casas decimais (R$/kWh). */
function fmtRateValue(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });
}

function origemBadge(o: OrigemTarifa | null | undefined) {
  if (o === "fornecedor") {
    return <Badge variant="secondary">Fornecedor</Badge>;
  }
  if (o === "distribuidora") {
    return <Badge variant="default">Distribuidora</Badge>;
  }
  return <Badge variant="outline">—</Badge>;
}

function counterpartLabel(row: TarifaRow): string {
  if (row.origem === "fornecedor") {
    return row.fornecedor?.nome ?? "—";
  }
  if (row.origem === "distribuidora") {
    const d = row.distribuidora;
    if (!d) return "—";
    return [d.nome, d.sigla].filter(Boolean).join(" — ") || d.nome;
  }
  return "—";
}

function vigenciaLabel(row: TarifaRow): string {
  const ini = fmtDate(row.vigenciaInicio);
  if (!row.vigenciaFim) return `${ini} → vigente`;
  return `${ini} → ${fmtDate(row.vigenciaFim)}`;
}

const columns: ColumnDef<TarifaRow, unknown>[] = [
  {
    accessorKey: "origem",
    header: "Origem",
    cell: ({ row }) => origemBadge(row.original.origem),
  },
  {
    id: "counterpart",
    header: "Empresa",
    accessorFn: (row) => counterpartLabel(row),
    cell: ({ row }) => (
      <span className="text-xs font-medium">
        {counterpartLabel(row.original)}
      </span>
    ),
  },
  {
    accessorKey: "valorPonta",
    header: "Ponta (R$/kWh)",
    cell: ({ row }) => fmtRateValue(row.original.valorPonta),
  },
  {
    accessorKey: "valorForaPonta",
    header: "Fora ponta (R$/kWh)",
    cell: ({ row }) => fmtRateValue(row.original.valorForaPonta),
  },
  {
    accessorKey: "vigenciaInicio",
    header: "Vigência",
    cell: ({ row }) => (
      <span className="text-xs">{vigenciaLabel(row.original)}</span>
    ),
  },
  {
    accessorKey: "classeTensao",
    header: "Classe",
    cell: ({ row }) =>
      row.original.classeTensao ? (
        <Badge variant="secondary">{row.original.classeTensao}</Badge>
      ) : (
        <span className="text-xs text-muted-foreground">genérica</span>
      ),
  },
  {
    accessorKey: "modalidade",
    header: "Modalidade",
    cell: ({ row }) =>
      row.original.modalidade ? (
        <Badge variant="outline">{row.original.modalidade}</Badge>
      ) : (
        "—"
      ),
  },
];

function renderDetails(t: TarifaRow) {
  return (
    <dl>
      <DetailField
        label="Origem"
        value={
          t.origem === "fornecedor"
            ? "Fornecedor (mercado livre)"
            : "Distribuidora (cativo)"
        }
      />
      <DetailField label="Empresa" value={counterpartLabel(t)} />
      <DetailField
        label="Valor Ponta (R$/kWh)"
        value={t.valorPonta != null ? fmtRateValue(t.valorPonta) : null}
      />
      <DetailField
        label="Valor Fora Ponta (R$/kWh)"
        value={
          t.valorForaPonta != null ? fmtRateValue(t.valorForaPonta) : null
        }
      />
      <DetailField label="Vigência início" value={fmtDate(t.vigenciaInicio)} />
      <DetailField
        label="Vigência fim"
        value={t.vigenciaFim ? fmtDate(t.vigenciaFim) : "vigente"}
      />
      <DetailField
        label="Classe de tensão"
        value={t.classeTensao ?? "genérica (aceita qualquer classe)"}
      />
      <DetailField label="Modalidade" value={t.modalidade} />
      <DetailField label="Observação" value={t.observacao} />
    </dl>
  );
}

interface Props {
  rows: TarifaRow[];
  fornecedorOptions: FornecedorPickerOption[];
  distribuidoraOptions: DistribuidoraPickerOption[];
}

export function TarifasTable({
  rows,
  fornecedorOptions,
  distribuidoraOptions,
}: Props) {
  const fields = buildTarifaEnergiaFormFields(
    fornecedorOptions,
    distribuidoraOptions,
  );

  // Comparativo simples: tarifa vigente Ponta/Fora Ponta por origem.
  // Pega só vigência aberta (vigenciaFim == null) e calcula média se houver
  // múltiplas. Dá uma noção rápida sem virar página separada.
  const vigentes = rows.filter((r) => !r.vigenciaFim);
  const avg = (key: "valorPonta" | "valorForaPonta", origem: OrigemTarifa) => {
    const vals = vigentes
      .filter((r) => r.origem === origem && r[key] != null)
      .map((r) => Number(r[key]));
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  const avgForncP = avg("valorPonta", "fornecedor");
  const avgForncFp = avg("valorForaPonta", "fornecedor");
  const avgDistP = avg("valorPonta", "distribuidora");
  const avgDistFp = avg("valorForaPonta", "distribuidora");
  // Mostra comparativo só se houver pelo menos uma tarifa em cada lado.
  const hasComparison =
    (avgForncP != null || avgForncFp != null) &&
    (avgDistP != null || avgDistFp != null);

  return (
    <div className="flex flex-col gap-4">
      {hasComparison && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-4">
          <ComparisonCell
            label="Ponta — Fornecedor"
            value={fmtRateValue(avgForncP)}
            tone="fornecedor"
          />
          <ComparisonCell
            label="Ponta — Distribuidora"
            value={fmtRateValue(avgDistP)}
            tone="distribuidora"
          />
          <ComparisonCell
            label="Fora ponta — Fornecedor"
            value={fmtRateValue(avgForncFp)}
            tone="fornecedor"
          />
          <ComparisonCell
            label="Fora ponta — Distribuidora"
            value={fmtRateValue(avgDistFp)}
            tone="distribuidora"
          />
        </div>
      )}

      <EntityPage<TarifaRow, typeof tarifaEnergiaSchema>
        title="Tarifas de Energia (R$/kWh)"
        prismaModel="TarifaEnergia"
        rawFileName="tarifas.json"
        schema={tarifaEnergiaSchema}
        fields={fields}
        rows={rows}
        columns={columns}
        actions={actions}
        details={renderDetails}
      />
    </div>
  );
}

function ComparisonCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "fornecedor" | "distribuidora";
}) {
  const toneClass =
    tone === "fornecedor" ? "text-emerald-600" : "text-blue-600";
  return (
    <div>
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">média das vigentes</div>
    </div>
  );
}


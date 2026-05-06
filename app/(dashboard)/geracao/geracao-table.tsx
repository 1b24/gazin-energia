"use client";

/**
 * Client wrapper para Geração.
 *
 * Geração é a primeira entidade com tabela-filha (`GeracaoDia`). Mostra:
 *  - na coluna "Total kWh", soma de todos os dias da geração;
 *  - aba "Dias" no drawer com grade 1..31 editável (Pencil → input).
 */
import type { ColumnDef } from "@tanstack/react-table";
import type { Geracao, GeracaoDia, Usina } from "@prisma/client";
import { Pencil, Save, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import {
  DetailField,
  type EntityRelation,
} from "@/components/data-table/entity-drawer";
import { EntityPage } from "@/components/data-table/entity-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildGeracaoFormFields,
  geracaoSchema,
  type UsinaOption,
} from "@/lib/schemas/geracao";
import type { Serialized } from "@/lib/serialize";

import * as actions from "./actions";

export type GeracaoRow = Serialized<Geracao> & {
  usina: Pick<Usina, "id" | "nome"> | null;
  dias: Serialized<GeracaoDia>[];
};

function formatKwh(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function totalKwh(dias: GeracaoRow["dias"]): number {
  return dias.reduce((acc, d) => acc + (d.kwh ?? 0), 0);
}

function diasComDado(dias: GeracaoRow["dias"]): number {
  return dias.filter((d) => d.kwh != null && d.kwh > 0).length;
}

const columns: ColumnDef<GeracaoRow, unknown>[] = [
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
    id: "totalKwh",
    header: "Total kWh",
    cell: ({ row }) => formatKwh(totalKwh(row.original.dias)),
  },
  {
    id: "metaMensal",
    header: "Meta mensal",
    cell: ({ row }) => formatKwh(row.original.metaMensal),
  },
  {
    id: "atingido",
    header: "% atingido",
    cell: ({ row }) => {
      const total = totalKwh(row.original.dias);
      const meta = row.original.metaMensal;
      if (!meta || meta === 0) return "—";
      const pct = (total / meta) * 100;
      return (
        <Badge
          variant={
            pct >= 100 ? "default" : pct >= 80 ? "secondary" : "destructive"
          }
        >
          {pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
        </Badge>
      );
    },
  },
  {
    id: "diasAtivos",
    header: "Dias com dado",
    cell: ({ row }) => `${diasComDado(row.original.dias)} / 31`,
  },
];

function renderDetails(g: GeracaoRow) {
  const total = totalKwh(g.dias);
  const ativos = diasComDado(g.dias);
  const media = ativos > 0 ? total / ativos : 0;
  return (
    <dl>
      <DetailField label="Usina" value={g.usina?.nome ?? g.nomeUsinaRaw} />
      <DetailField label="Ano" value={g.ano} />
      <DetailField label="Mês" value={g.mes} />
      <DetailField
        label="Meta mensal"
        value={g.metaMensal != null ? `${formatKwh(g.metaMensal)} kWh` : null}
      />
      <DetailField
        label="Meta de geração"
        value={g.metaGeracao != null ? `${formatKwh(g.metaGeracao)} kWh` : null}
      />
      <DetailField label="Total no mês" value={`${formatKwh(total)} kWh`} />
      <DetailField label="Dias com dado" value={`${ativos} / 31`} />
      <DetailField
        label="Média diária"
        value={ativos > 0 ? `${formatKwh(media)} kWh/dia` : null}
      />
    </dl>
  );
}

/** Aba "Dias" — read-only por padrão, edição inline via toggle. */
function DiasPanel({ geracao }: { geracao: GeracaoRow }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  // String que aparece no <input> (formato BR). null = sem valor.
  const initialValues = useMemo(() => {
    const m = new Map<number, string>();
    for (const d of geracao.dias) {
      m.set(
        d.dia,
        d.kwh != null
          ? d.kwh.toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : "",
      );
    }
    return m;
  }, [geracao.dias]);

  // Reset entre entidades é via `key={g.id}` na relation — DiasPanel
  // remonta e a state é re-inicializada do zero.
  const [values, setValues] = useState<Map<number, string>>(initialValues);

  const dirtyDias = useMemo(() => {
    const out: { dia: number; kwh: string }[] = [];
    for (let dia = 1; dia <= 31; dia++) {
      const original = initialValues.get(dia) ?? "";
      const current = values.get(dia) ?? "";
      if (original.trim() !== current.trim()) {
        out.push({ dia, kwh: current });
      }
    }
    return out;
  }, [values, initialValues]);

  const cancelEdit = () => {
    setValues(initialValues);
    setEditing(false);
  };

  const saveEdit = () => {
    if (dirtyDias.length === 0) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      await actions.updateDias(geracao.id, dirtyDias);
      setEditing(false);
    });
  };

  // Stats — recomputados em tempo real durante a edição.
  const numericValues = useMemo(() => {
    const m = new Map<number, number | null>();
    for (let dia = 1; dia <= 31; dia++) {
      const raw = values.get(dia)?.trim() ?? "";
      if (!raw) {
        m.set(dia, null);
      } else {
        const n = Number(raw.replace(/\./g, "").replace(",", "."));
        m.set(dia, Number.isFinite(n) ? n : null);
      }
    }
    return m;
  }, [values]);

  const total = Array.from(numericValues.values()).reduce<number>(
    (a, n) => a + (n ?? 0),
    0,
  );
  const ativos = Array.from(numericValues.values()).filter(
    (n) => n != null && n > 0,
  ).length;
  const media = ativos > 0 ? total / ativos : 0;
  const positivos = Array.from(numericValues.values()).filter(
    (n): n is number => n != null && n > 0,
  );
  const max = positivos.length ? Math.max(...positivos) : 0;
  const min = positivos.length ? Math.min(...positivos) : 0;

  const metaDiaria =
    geracao.metaMensal != null ? geracao.metaMensal / 31 : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="grid flex-1 grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Stat label="Total" value={`${formatKwh(total)} kWh`} />
          <Stat label="Média" value={`${formatKwh(media)} kWh`} />
          <Stat label="Máx" value={`${formatKwh(max)} kWh`} />
          <Stat label="Mín" value={ativos > 0 ? `${formatKwh(min)} kWh` : "—"} />
        </div>
        <div className="ml-3 shrink-0">
          {editing ? (
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={cancelEdit}
                disabled={pending}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={saveEdit}
                disabled={pending || dirtyDias.length === 0}
              >
                <Save className="mr-1 h-3.5 w-3.5" />
                {pending
                  ? "Salvando..."
                  : `Salvar${dirtyDias.length ? ` (${dirtyDias.length})` : ""}`}
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Editar dias
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 text-left">Dia</th>
              <th className="px-3 py-1.5 text-right">kWh</th>
              <th className="px-3 py-1.5 text-right">% da meta</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((dia) => {
              const kwh = numericValues.get(dia);
              const pct =
                kwh != null && metaDiaria && metaDiaria > 0
                  ? (kwh / metaDiaria) * 100
                  : null;
              return (
                <tr key={dia} className="border-t">
                  <td className="px-3 py-1 font-mono text-xs">
                    {String(dia).padStart(2, "0")}
                  </td>
                  <td className="px-3 py-1 text-right">
                    {editing ? (
                      <Input
                        value={values.get(dia) ?? ""}
                        onChange={(e) => {
                          const next = new Map(values);
                          next.set(dia, e.target.value);
                          setValues(next);
                        }}
                        placeholder="—"
                        inputMode="decimal"
                        className="ml-auto h-7 w-28 text-right text-sm"
                      />
                    ) : kwh != null ? (
                      formatKwh(kwh)
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-1 text-right text-xs text-muted-foreground">
                    {pct != null
                      ? `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const diasRelation: EntityRelation<GeracaoRow> = {
  label: "Dias",
  render: (g) => <DiasPanel key={g.id} geracao={g} />,
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

interface Props {
  rows: GeracaoRow[];
  usinaOptions: UsinaOption[];
}

export function GeracaoTable({ rows, usinaOptions }: Props) {
  const fields = buildGeracaoFormFields(usinaOptions);
  return (
    <EntityPage<GeracaoRow, typeof geracaoSchema>
      title="Geração"
      prismaModel="Geracao"
      rawFileName="geracao.json"
      schema={geracaoSchema}
      fields={fields}
      rows={rows}
      columns={columns}
      actions={actions}
      details={renderDetails}
      relations={[diasRelation]}
    />
  );
}

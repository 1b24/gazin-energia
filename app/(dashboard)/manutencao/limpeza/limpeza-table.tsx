"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type {
  CronogramaLimpeza,
  LimpezaItem,
  StatusManutencao,
  Usina,
} from "@prisma/client";
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
  STATUS_MANUTENCAO_LABEL,
  buildCronogramaLimpezaFormFields,
  cronogramaLimpezaSchema,
} from "@/lib/schemas/cronograma-limpeza";
import type { UsinaOption } from "@/lib/schemas/geracao";
import type { Serialized } from "@/lib/serialize";

import * as actions from "./actions";

export type LimpezaRow = Serialized<CronogramaLimpeza> & {
  usina: Pick<Usina, "id" | "nome"> | null;
  itens: Serialized<LimpezaItem>[];
};

const fmtDate = (d: Date | string | null | undefined): string => {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
};

function statusBadgeVariant(s: StatusManutencao | null | undefined) {
  if (!s) return "outline" as const;
  if (s === "concluida") return "default" as const;
  if (s === "em_andamento") return "secondary" as const;
  return "outline" as const;
}

const columns: ColumnDef<LimpezaRow, unknown>[] = [
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
    accessorKey: "statusGeral",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={statusBadgeVariant(row.original.statusGeral)}>
        {STATUS_MANUTENCAO_LABEL[row.original.statusGeral]}
      </Badge>
    ),
  },
  {
    accessorKey: "realizado",
    header: "Realizado",
    cell: ({ row }) => row.original.realizado ?? "—",
  },
  {
    id: "itensCount",
    accessorFn: (row) =>
      row.itens.filter((item) => item.status === "concluida").length,
    header: "Limpezas",
    cell: ({ row }) => {
      const itens = row.original.itens;
      const total = itens.length;
      const concluidas = itens.filter((i) => i.status === "concluida").length;
      return (
        <span className="text-xs text-muted-foreground">
          {concluidas}/{total} concluídas
        </span>
      );
    },
  },
  {
    id: "proxima",
    accessorFn: (row) => {
      const today = new Date();
      const future = row.itens
        .filter(
          (i) =>
            i.dataPlanejada &&
            new Date(i.dataPlanejada) >= today &&
            i.status !== "concluida",
        )
        .sort(
          (a, b) =>
            new Date(a.dataPlanejada!).getTime() -
            new Date(b.dataPlanejada!).getTime(),
        )[0];
      return future?.dataPlanejada
        ? new Date(future.dataPlanejada).getTime()
        : null;
    },
    header: "Próxima planejada",
    cell: ({ row }) => {
      const today = new Date();
      const future = row.original.itens
        .filter(
          (i) =>
            i.dataPlanejada &&
            new Date(i.dataPlanejada) >= today &&
            i.status !== "concluida",
        )
        .sort(
          (a, b) =>
            new Date(a.dataPlanejada!).getTime() -
            new Date(b.dataPlanejada!).getTime(),
        )[0];
      return future ? fmtDate(future.dataPlanejada) : "—";
    },
  },
];

function renderDetails(c: LimpezaRow) {
  return (
    <dl>
      <DetailField label="Usina" value={c.usina?.nome ?? c.nomeUsinaRaw} />
      <DetailField
        label="Status geral"
        value={STATUS_MANUTENCAO_LABEL[c.statusGeral]}
      />
      <DetailField label="Realizado" value={c.realizado} />
      <DetailField label="Total de limpezas" value={c.itens.length} />
      <DetailField
        label="Concluídas"
        value={c.itens.filter((i) => i.status === "concluida").length}
      />
    </dl>
  );
}

// ----------------------------------------------------------------------------
// Aba "Itens" — edição inline dos 6 LimpezaItem.
// ----------------------------------------------------------------------------

interface ItemDraft {
  dataPlanejada: string;
  dataConclusao: string;
  status: StatusManutencao | "";
  fotoUrl: string;
}

function maskDateBR(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

function ItensPanel({ cronograma }: { cronograma: LimpezaRow }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const initial = useMemo(() => {
    const m = new Map<number, ItemDraft>();
    for (let ordem = 1; ordem <= 6; ordem++) {
      const found = cronograma.itens.find((i) => i.ordem === ordem);
      m.set(ordem, {
        dataPlanejada: fmtDate(found?.dataPlanejada),
        dataConclusao: fmtDate(found?.dataConclusao),
        status: (found?.status ?? "") as StatusManutencao | "",
        fotoUrl: found?.fotoUrl ?? "",
      });
    }
    return m;
  }, [cronograma.itens]);

  const [drafts, setDrafts] = useState<Map<number, ItemDraft>>(initial);

  const updateField = <K extends keyof ItemDraft>(
    ordem: number,
    field: K,
    value: ItemDraft[K],
  ) => {
    const next = new Map(drafts);
    const cur = next.get(ordem) ?? {
      dataPlanejada: "",
      dataConclusao: "",
      status: "" as ItemDraft["status"],
      fotoUrl: "",
    };
    next.set(ordem, { ...cur, [field]: value });
    setDrafts(next);
  };

  const isDirty = useMemo(() => {
    for (let ordem = 1; ordem <= 6; ordem++) {
      const a = initial.get(ordem)!;
      const b = drafts.get(ordem)!;
      if (
        a.dataPlanejada !== b.dataPlanejada ||
        a.dataConclusao !== b.dataConclusao ||
        a.status !== b.status ||
        a.fotoUrl !== b.fotoUrl
      ) {
        return true;
      }
    }
    return false;
  }, [drafts, initial]);

  const saveEdit = () => {
    const itens = Array.from({ length: 6 }, (_, i) => i + 1).map((ordem) => {
      const d = drafts.get(ordem)!;
      return {
        ordem,
        dataPlanejada: d.dataPlanejada || null,
        dataConclusao: d.dataConclusao || null,
        status: d.status || null,
        fotoUrl: d.fotoUrl || null,
      };
    });
    startTransition(async () => {
      await actions.updateItens(cronograma.id, itens);
      setEditing(false);
    });
  };

  const cancelEdit = () => {
    setDrafts(initial);
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Cronograma anual com até 6 limpezas. Datas em <code>dd/mm/aaaa</code>.
        </p>
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
            <Button size="sm" onClick={saveEdit} disabled={pending || !isDirty}>
              <Save className="mr-1 h-3.5 w-3.5" />
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 h-3.5 w-3.5" />
            Editar itens
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 text-left">#</th>
              <th className="px-3 py-1.5 text-left">Planejada</th>
              <th className="px-3 py-1.5 text-left">Conclusão</th>
              <th className="px-3 py-1.5 text-left">Status</th>
              <th className="px-3 py-1.5 text-left">Foto</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }, (_, i) => i + 1).map((ordem) => {
              const d = drafts.get(ordem)!;
              return (
                <tr key={ordem} className="border-t align-top">
                  <td className="px-3 py-1.5 font-mono text-xs">
                    {String(ordem).padStart(2, "0")}
                  </td>
                  <td className="px-3 py-1.5">
                    {editing ? (
                      <Input
                        value={d.dataPlanejada}
                        onChange={(e) =>
                          updateField(
                            ordem,
                            "dataPlanejada",
                            maskDateBR(e.target.value),
                          )
                        }
                        placeholder="dd/mm/aaaa"
                        inputMode="numeric"
                        className="h-7 w-32 text-sm"
                      />
                    ) : (
                      d.dataPlanejada || "—"
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {editing ? (
                      <Input
                        value={d.dataConclusao}
                        onChange={(e) =>
                          updateField(
                            ordem,
                            "dataConclusao",
                            maskDateBR(e.target.value),
                          )
                        }
                        placeholder="dd/mm/aaaa"
                        inputMode="numeric"
                        className="h-7 w-32 text-sm"
                      />
                    ) : (
                      d.dataConclusao || "—"
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {editing ? (
                      <select
                        value={d.status}
                        onChange={(e) =>
                          updateField(
                            ordem,
                            "status",
                            e.target.value as ItemDraft["status"],
                          )
                        }
                        className="h-7 rounded-md border bg-background px-2 text-sm"
                      >
                        <option value="">—</option>
                        <option value="pendente">Pendente</option>
                        <option value="em_andamento">Em andamento</option>
                        <option value="concluida">Concluída</option>
                      </select>
                    ) : d.status ? (
                      <Badge
                        variant={statusBadgeVariant(
                          d.status as StatusManutencao,
                        )}
                      >
                        {STATUS_MANUTENCAO_LABEL[d.status as StatusManutencao]}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {editing ? (
                      <Input
                        value={d.fotoUrl}
                        onChange={(e) =>
                          updateField(ordem, "fotoUrl", e.target.value)
                        }
                        placeholder="URL da foto"
                        className="h-7 text-sm"
                      />
                    ) : d.fotoUrl ? (
                      <a
                        href={d.fotoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        {d.fotoUrl.length > 30
                          ? `${d.fotoUrl.slice(0, 28)}…`
                          : d.fotoUrl}
                      </a>
                    ) : (
                      "—"
                    )}
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

const itensRelation: EntityRelation<LimpezaRow> = {
  label: "Itens",
  render: (c) => <ItensPanel key={c.id} cronograma={c} />,
};

interface Props {
  rows: LimpezaRow[];
  usinaOptions: UsinaOption[];
}

export function LimpezaTable({ rows, usinaOptions }: Props) {
  const fields = buildCronogramaLimpezaFormFields(usinaOptions);
  return (
    <EntityPage<LimpezaRow, typeof cronogramaLimpezaSchema>
      title="Cronograma de Limpeza"
      prismaModel="CronogramaLimpeza"
      rawFileName="manutencao_limpeza.json"
      schema={cronogramaLimpezaSchema}
      fields={fields}
      rows={rows}
      columns={columns}
      actions={actions}
      details={renderDetails}
      relations={[itensRelation]}
    />
  );
}

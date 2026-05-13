"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type {
  ManutencaoPreventiva,
  StatusManutencao,
  Usina,
} from "@prisma/client";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Paperclip,
  Timer,
  Wrench,
} from "lucide-react";
import { useMemo } from "react";

import { Bar } from "@/components/analytics/bar";
import { EmptyAnalytics } from "@/components/analytics/empty-state";
import { MetricCard } from "@/components/analytics/metric-card";
import { DetailField } from "@/components/data-table/entity-drawer";
import { EntityPage } from "@/components/data-table/entity-page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MultiSelect } from "@/components/ui/multi-select";
import { fmtCompact, fmtPct } from "@/lib/format";
import { useAnalyticsFilters } from "@/lib/hooks/use-analytics-filters";
import { STATUS_MANUTENCAO_LABEL } from "@/lib/schemas/cronograma-limpeza";
import type { UsinaOption } from "@/lib/schemas/geracao";
import {
  buildManutencaoPreventivaFormFields,
  manutencaoPreventivaSchema,
} from "@/lib/schemas/manutencao-preventiva";
import type { Serialized } from "@/lib/serialize";

import * as actions from "./actions";

export type PreventivaRow = Serialized<ManutencaoPreventiva> & {
  usina: Pick<Usina, "id" | "nome" | "uf"> | null;
};

const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("pt-BR");
};

function statusBadgeVariant(s: StatusManutencao | null | undefined) {
  if (!s) return "outline" as const;
  if (s === "concluida") return "default" as const;
  if (s === "em_andamento") return "secondary" as const;
  return "outline" as const;
}

function FileLink({ url }: { url: string | null | undefined }) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  if (
    url.startsWith("/api/files/") ||
    url.startsWith("/uploads/") ||
    /^https?:\/\//.test(url)
  ) {
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

// ---------------------------------------------------------------------------
// Analytics — visão de O.S. (abertas / em andamento / finalizadas)
// ---------------------------------------------------------------------------

function usinaLabel(row: PreventivaRow): string {
  return row.usina?.nome?.trim() || row.nomeUsinaRaw?.trim() || "Sem usina";
}

function ufOf(row: PreventivaRow): string | null {
  return row.usina?.uf?.trim() || null;
}

/**
 * Marca uma OS como "atrasada" quando tem `dataExecucao` no passado e ainda
 * não foi concluída. Heurística simples — se quiser SLA por dias, vira
 * input do usuário depois.
 */
function isAtrasada(row: PreventivaRow): boolean {
  if (row.status === "concluida") return false;
  if (!row.dataExecucao) return false;
  const dt = new Date(row.dataExecucao);
  if (Number.isNaN(dt.getTime())) return false;
  return dt.getTime() < Date.now();
}

function PreventivaAnalytics({ rows }: { rows: PreventivaRow[] }) {
  // `useAnalyticsFilters` espera `ano/mes` para período; aqui usamos só UF
  // (filtragem por período viria de dataExecucao — feature futura).
  // Workaround: passamos rows como se não tivessem período (extractors só
  // de UF) e ignoramos os filtros de período.
  const rowsAsPeriodic = rows as unknown as Array<
    PreventivaRow & { ano?: number | null; mes?: string | null }
  >;
  const {
    ufOptions,
    selectedUfs,
    setSelectedUfs,
    filteredRows: scopedRows,
  } = useAnalyticsFilters(rowsAsPeriodic, {
    uf: ufOf as (row: PreventivaRow & { ano?: number | null; mes?: string | null }) => string | null,
  });

  const data = useMemo(() => {
    const activeRows = (scopedRows as PreventivaRow[]).filter(
      (r) => !r.deletedAt,
    );

    const total = activeRows.length;
    const abertas = activeRows.filter((r) => r.status === "pendente").length;
    const emAndamento = activeRows.filter((r) => r.status === "em_andamento").length;
    const finalizadas = activeRows.filter((r) => r.status === "concluida").length;
    const ativas = abertas + emAndamento;

    // Top usinas por O.S. ativas (pendente + em_andamento).
    const porUsina = new Map<string, { label: string; ativas: number; concluidas: number }>();
    for (const r of activeRows) {
      const label = usinaLabel(r);
      const cur = porUsina.get(label) ?? { label, ativas: 0, concluidas: 0 };
      if (r.status === "concluida") cur.concluidas++;
      else cur.ativas++;
      porUsina.set(label, cur);
    }
    const topUsinas = Array.from(porUsina.values())
      .filter((u) => u.ativas > 0)
      .sort((a, b) => b.ativas - a.ativas)
      .slice(0, 10);

    // Indicadores de atenção.
    const atrasadas = activeRows.filter(isAtrasada).length;
    const semLaudo = activeRows.filter(
      (r) => r.status === "concluida" && !r.laudoTecnico,
    ).length;
    const semFotos = activeRows.filter(
      (r) => r.status === "concluida" && !r.fotosUsina,
    ).length;
    const semUsina = activeRows.filter((r) => !r.usina && !r.nomeUsinaRaw).length;

    return {
      total,
      abertas,
      emAndamento,
      finalizadas,
      ativas,
      topUsinas,
      maxUsinaAtivas: topUsinas[0]?.ativas ?? 0,
      atrasadas,
      semLaudo,
      semFotos,
      semUsina,
    };
  }, [scopedRows]);

  if (rows.length === 0)
    return (
      <EmptyAnalytics message="Sem ordens de serviço para analisar." />
    );

  const pctAbertas = data.total > 0 ? (data.abertas / data.total) * 100 : 0;
  const pctEmAndamento =
    data.total > 0 ? (data.emAndamento / data.total) * 100 : 0;
  const pctFinalizadas =
    data.total > 0 ? (data.finalizadas / data.total) * 100 : 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Visão de O.S.</h2>
          <div className="text-sm text-muted-foreground">
            {data.total} ordem(ns) ativa(s){" "}
            {selectedUfs.length > 0
              ? `· ${selectedUfs.length === 1 ? `UF ${selectedUfs[0]}` : `${selectedUfs.length} UFs`}`
              : "· todas as UFs"}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <MultiSelect
            label="UF"
            options={ufOptions}
            value={selectedUfs}
            onChange={setSelectedUfs}
            placeholderAll="Todos os estados"
            searchPlaceholder="Buscar UF..."
            width="w-44"
            disabled={ufOptions.length === 0}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total de O.S."
          value={fmtCompact(data.total)}
          description={`${data.ativas} ativas · ${data.finalizadas} finalizadas`}
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <MetricCard
          title="Abertas"
          value={fmtCompact(data.abertas)}
          description={
            <>
              <span className="block">{fmtPct(pctAbertas)} do total</span>
              <span className="block text-amber-600">
                Aguardando execução
              </span>
            </>
          }
          icon={<CircleDashed className="h-4 w-4" />}
        />
        <MetricCard
          title="Em andamento"
          value={fmtCompact(data.emAndamento)}
          description={
            <>
              <span className="block">{fmtPct(pctEmAndamento)} do total</span>
              <span className="block text-blue-600">Equipe trabalhando</span>
            </>
          }
          icon={<Wrench className="h-4 w-4" />}
        />
        <MetricCard
          title="Finalizadas"
          value={fmtCompact(data.finalizadas)}
          description={
            <>
              <span className="block">{fmtPct(pctFinalizadas)} do total</span>
              <span className="block text-emerald-600">Concluídas</span>
            </>
          }
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Distribuição por status</CardTitle>
              <Timer className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusRow
              label="Abertas"
              count={data.abertas}
              max={data.total}
              barClass="bg-amber-500"
            />
            <StatusRow
              label="Em andamento"
              count={data.emAndamento}
              max={data.total}
              barClass="bg-blue-500"
            />
            <StatusRow
              label="Finalizadas"
              count={data.finalizadas}
              max={data.total}
              barClass="bg-emerald-500"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Top 10 usinas — O.S. ativas</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topUsinas.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma O.S. ativa.
              </p>
            ) : (
              data.topUsinas.map((u, index) => (
                <div key={u.label} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate">
                      {index + 1}. {u.label}
                    </span>
                    <span className="font-medium">{u.ativas} ativa(s)</span>
                  </div>
                  <Bar
                    value={u.ativas}
                    max={data.maxUsinaAtivas}
                    className="bg-amber-500"
                  />
                  {u.concluidas > 0 && (
                    <div className="text-[11px] text-muted-foreground">
                      {u.concluidas} já finalizada(s)
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Pontos de atenção</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AttentionTile
            label="Atrasadas"
            value={data.atrasadas}
            hint="execução planejada no passado, ainda não concluída"
            tone="destructive"
          />
          <AttentionTile
            label="Concluídas sem laudo"
            value={data.semLaudo}
            hint="documentação técnica faltando"
            tone="amber"
          />
          <AttentionTile
            label="Concluídas sem fotos"
            value={data.semFotos}
            hint="evidência visual faltando"
            tone="amber"
          />
          <AttentionTile
            label="Sem usina vinculada"
            value={data.semUsina}
            hint="O.S. sem usina conhecida"
            tone="muted"
          />
        </CardContent>
      </Card>
    </section>
  );
}

function StatusRow({
  label,
  count,
  max,
  barClass,
}: {
  label: string;
  count: number;
  max: number;
  barClass: string;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span>{label}</span>
        <span className="font-medium">
          {count} <span className="text-muted-foreground">({fmtPct(pct)})</span>
        </span>
      </div>
      <Bar value={count} max={max} className={barClass} />
    </div>
  );
}

function AttentionTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone: "destructive" | "amber" | "muted";
}) {
  const toneClass =
    tone === "destructive"
      ? "text-destructive"
      : tone === "amber"
        ? "text-amber-600"
        : "text-muted-foreground";
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${value > 0 ? toneClass : ""}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabela
// ---------------------------------------------------------------------------

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
      <DetailField
        label="Data de conclusão"
        value={fmtDate(p.dataConclusao)}
      />
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
    <div className="flex flex-col gap-6">
      <PreventivaAnalytics rows={rows} />
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
    </div>
  );
}

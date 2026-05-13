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
import {
  AlertTriangle,
  BarChart3,
  PiggyBank,
  Gauge,
  Pencil,
  Save,
  Target,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { Bar } from "@/components/analytics/bar";
import { EmptyAnalytics } from "@/components/analytics/empty-state";
import { MetricCard } from "@/components/analytics/metric-card";
import {
  DetailField,
  type EntityRelation,
} from "@/components/data-table/entity-drawer";
import { EntityPage } from "@/components/data-table/entity-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { fmtBRL, fmtCompact, fmtPct } from "@/lib/format";
import { useAnalyticsFilters } from "@/lib/hooks/use-analytics-filters";
import { mesIndex, periodKey, periodoLabel } from "@/lib/period";
import {
  calcValorDistribuidora,
  findTarifaPorData,
  refDateFromAnoMes,
  type TarifaSnapshot,
} from "@/lib/tarifa-lookup";
import {
  buildGeracaoFormFields,
  geracaoSchema,
  type UsinaOption,
} from "@/lib/schemas/geracao";
import type { Serialized } from "@/lib/serialize";

import * as actions from "./actions";

export type GeracaoRow = Serialized<Geracao> & {
  usina: Pick<Usina, "id" | "nome" | "uf"> | null;
  dias: Serialized<GeracaoDia>[];
};

function formatKwh(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// `fmtCompact`, `fmtPct` movidos para `lib/format.ts` no Step 5 do refactor
// 2026-05-foundations.

function totalKwh(dias: GeracaoRow["dias"]): number {
  return dias.reduce((acc, d) => acc + (d.kwh ?? 0), 0);
}

function diasComDado(dias: GeracaoRow["dias"]): number {
  return dias.filter((d) => d.kwh != null && d.kwh > 0).length;
}

// MESES_PT, mesIndex, periodKey movidos pra `lib/period.ts` (Step 4 do
// refactor 2026-05-foundations). `diasNoMes` continua local — específico do
// domínio de Geração (calcula meta diária × dias do mês).
function diasNoMes(
  ano: number | null | undefined,
  mes: string | null | undefined,
) {
  const mesIdx = mesIndex(mes);
  if (ano == null || mesIdx < 0) return 31;
  return new Date(ano, mesIdx + 1, 0).getDate();
}

function periodSort(
  a: { ano: number; mesIdx: number },
  b: { ano: number; mesIdx: number },
) {
  return a.ano - b.ano || a.mesIdx - b.mesIdx;
}

function metaMensalCalculada(g: GeracaoRow): number | null {
  if (g.metaMensal == null) return null;
  return g.metaMensal * diasNoMes(g.ano, g.mes);
}

function estimativaMensal(g: GeracaoRow): number {
  const total = totalKwh(g.dias);
  const ativos = diasComDado(g.dias);
  if (ativos === 0) return 0;
  return (total / ativos) * diasNoMes(g.ano, g.mes);
}

function usinaLabel(g: GeracaoRow) {
  return g.usina?.nome?.trim() || g.nomeUsinaRaw?.trim() || "Sem usina";
}

// MetricCard movido para `components/analytics/metric-card.tsx` (Step 5).

// Bar movido para `components/analytics/bar.tsx` (Step 5).

function progressPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function metaBarClass(value: number | null | undefined) {
  if (value == null) return "bg-muted-foreground/40";
  if (value >= 100) return "bg-emerald-500";
  if (value >= 80) return "bg-amber-500";
  return "bg-destructive";
}

// EmptyAnalytics movido para `components/analytics/empty-state.tsx` (Step 5).

/** Tarifa serializada vinda da page (Date como string ISO). */
export interface TarifaDistribuidoraSerialized {
  uf: string;
  valorPonta: number | null;
  valorForaPonta: number | null;
  vigenciaInicio: string;
  vigenciaFim: string | null;
}

/** Motivo pelo qual uma linha não entrou no cálculo de receita evitada. */
type SkipReason =
  | "sem_uf"
  | "sem_periodo"
  | "sem_tarifa_uf"
  | "vigencia_fora"
  | "tarifa_vazia"
  | "sem_geracao";

interface SkippedComparison {
  rowId: string;
  label: string;
  reason: SkipReason;
  detail: string;
}

const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  sem_uf: "Sem UF na usina",
  sem_periodo: "Período inválido",
  sem_tarifa_uf: "Sem tarifa pra UF",
  vigencia_fora: "Vigência não cobre data",
  tarifa_vazia: "Tarifa sem valores",
  sem_geracao: "Nenhum kWh gerado",
};

function GeracaoAnalytics({
  rows,
  tarifasDistribuidoras,
}: {
  rows: GeracaoRow[];
  tarifasDistribuidoras: TarifaDistribuidoraSerialized[];
}) {
  // Filtros multi-select (período + UF) com filtragem AND. UF vem de
  // `usina.uf`. Hook em `lib/hooks/use-analytics-filters.ts`.
  const {
    ufOptions,
    selectedPeriods,
    setSelectedPeriods,
    selectedUfs,
    setSelectedUfs,
    filteredRows: selectedRows,
    filterSummary,
    periodMultiOptions,
  } = useAnalyticsFilters(rows, {
    uf: (row) => row.usina?.uf?.trim() || null,
  });

  const tarifas = useMemo<TarifaSnapshot[]>(
    () =>
      tarifasDistribuidoras.map((t) => ({
        uf: t.uf,
        valorPonta: t.valorPonta,
        valorForaPonta: t.valorForaPonta,
        vigenciaInicio: new Date(t.vigenciaInicio),
        vigenciaFim: t.vigenciaFim ? new Date(t.vigenciaFim) : null,
      })),
    [tarifasDistribuidoras],
  );

  const data = useMemo(() => {
    const totalRealizado = selectedRows.reduce(
      (acc, row) => acc + totalKwh(row.dias),
      0,
    );

    // Receita evitada — kWh gerado × tarifa de distribuidora vigente na
    // data do registro. Não há split Ponta/FP no Geracao (só total diário),
    // então tratamos tudo como Fora Ponta (conservador: maioria das horas
    // de geração solar cai fora do horário de ponta).
    let receitaEvitadaTotal = 0;
    const skipped: SkippedComparison[] = [];
    const receitaPorUsina = new Map<string, number>();
    for (const row of selectedRows) {
      const uf = row.usina?.uf?.trim() || null;
      const refDate = refDateFromAnoMes(row.ano, row.mes);
      const rowLabel = `${usinaLabel(row)} · ${row.mes ?? "?"}/${row.ano ?? "?"}`;

      if (!uf) {
        skipped.push({
          rowId: row.id,
          label: rowLabel,
          reason: "sem_uf",
          detail: "Usina sem UF cadastrada",
        });
        continue;
      }
      if (!refDate) {
        skipped.push({
          rowId: row.id,
          label: rowLabel,
          reason: "sem_periodo",
          detail: "Ano ou mês inválido no registro",
        });
        continue;
      }
      const tarifasUF = tarifas.filter((t) => t.uf === uf);
      if (tarifasUF.length === 0) {
        skipped.push({
          rowId: row.id,
          label: rowLabel,
          reason: "sem_tarifa_uf",
          detail: `Nenhuma tarifa cadastrada para UF ${uf}`,
        });
        continue;
      }
      const tarifa = findTarifaPorData(tarifasUF, uf, refDate);
      if (!tarifa) {
        skipped.push({
          rowId: row.id,
          label: rowLabel,
          reason: "vigencia_fora",
          detail: `Tarifa ${uf} cadastrada mas vigência não cobre ${row.mes}/${row.ano}`,
        });
        continue;
      }
      const kwhGerado = totalKwh(row.dias);
      if (kwhGerado <= 0) {
        skipped.push({
          rowId: row.id,
          label: rowLabel,
          reason: "sem_geracao",
          detail: "Nenhum kWh gerado no período",
        });
        continue;
      }
      const receita = calcValorDistribuidora(0, kwhGerado, tarifa);
      if (receita == null) {
        skipped.push({
          rowId: row.id,
          label: rowLabel,
          reason: "tarifa_vazia",
          detail: "Tarifa sem valor Ponta nem Fora Ponta preenchido",
        });
        continue;
      }
      receitaEvitadaTotal += receita;
      const label = usinaLabel(row);
      receitaPorUsina.set(
        label,
        (receitaPorUsina.get(label) ?? 0) + receita,
      );
    }
    const rowsComTarifa = selectedRows.length - skipped.length;
    const totalEstimado = selectedRows.reduce(
      (acc, row) => acc + estimativaMensal(row),
      0,
    );
    const totalMeta = selectedRows.reduce(
      (acc, row) => acc + (metaMensalCalculada(row) ?? 0),
      0,
    );
    const usinas = new Set(selectedRows.map((row) => usinaLabel(row)));
    const diasInformados = selectedRows.reduce(
      (acc, row) => acc + diasComDado(row.dias),
      0,
    );

    const usinasRank = new Map<
      string,
      {
        label: string;
        registros: number;
        realizado: number;
        estimado: number;
        meta: number;
      }
    >();
    const periodos = new Map<
      string,
      {
        label: string;
        ano: number;
        mesIdx: number;
        realizado: number;
        estimado: number;
        meta: number;
      }
    >();

    for (const row of selectedRows) {
      const label = usinaLabel(row);
      const realizado = totalKwh(row.dias);
      const estimado = estimativaMensal(row);
      const meta = metaMensalCalculada(row) ?? 0;

      const currentUsina = usinasRank.get(label) ?? {
        label,
        registros: 0,
        realizado: 0,
        estimado: 0,
        meta: 0,
      };
      currentUsina.registros += 1;
      currentUsina.realizado += realizado;
      currentUsina.estimado += estimado;
      currentUsina.meta += meta;
      usinasRank.set(label, currentUsina);

      const mesIdx = mesIndex(row.mes);
      const ano = row.ano ?? 0;
      const key = periodKey(row);
      const currentPeriod = periodos.get(key) ?? {
        label: periodoLabel(row),
        ano,
        mesIdx,
        realizado: 0,
        estimado: 0,
        meta: 0,
      };
      currentPeriod.realizado += realizado;
      currentPeriod.estimado += estimado;
      currentPeriod.meta += meta;
      periodos.set(key, currentPeriod);
    }

    const usinasOrdenadas = [...usinasRank.values()]
      .map((item) => ({
        ...item,
        diferenca: item.estimado - item.meta,
        pctMeta: item.meta > 0 ? (item.realizado / item.meta) * 100 : null,
        receitaEvitada: receitaPorUsina.get(item.label) ?? null,
      }))
      .sort((a, b) => b.realizado - a.realizado);

    const abaixoMeta = [...usinasOrdenadas]
      .filter((item) => item.meta > 0 && item.estimado < item.meta)
      .sort((a, b) => a.diferenca - b.diferenca);

    const periodosRank = [...periodos.values()].sort(periodSort);

    return {
      totalRealizado,
      totalEstimado,
      totalMeta,
      diferenca: totalEstimado - totalMeta,
      pctMeta: totalMeta > 0 ? (totalEstimado / totalMeta) * 100 : null,
      usinasCount: usinas.size,
      diasInformados,
      receitaEvitadaTotal,
      rowsComTarifa,
      skipped,
      usinasOrdenadas,
      abaixoMeta,
      periodosRank,
    };
  }, [selectedRows, tarifas]);

  if (rows.length === 0)
    return <EmptyAnalytics message="Sem dados de geração para analisar." />;

  const maxPeriodo = Math.max(
    ...data.periodosRank.map((item) => item.realizado),
    0,
  );
  const diffIsPositive = data.diferenca >= 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-medium">Indicadores de geração</div>
          <div className="text-xs text-muted-foreground">
            Filtros: {filterSummary}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <MultiSelect
            label="Período"
            options={periodMultiOptions}
            value={selectedPeriods}
            onChange={setSelectedPeriods}
            placeholderAll="Todos os períodos"
            searchPlaceholder="Buscar período..."
            width="w-56"
          />
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
          title="Geração realizada"
          value={`${fmtCompact(data.totalRealizado)} kWh`}
          description={`${data.usinasCount} usina(s) · ${data.diasInformados} dia(s) com dado`}
          icon={<Zap className="h-4 w-4" />}
        />
        <MetricCard
          title="Geração estimada"
          value={`${fmtCompact(data.totalEstimado)} kWh`}
          description="média dos dias informados x dias do mês"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <MetricCard
          title="Diferença vs meta"
          value={`${diffIsPositive ? "+" : ""}${fmtCompact(data.diferenca)} kWh`}
          description={`${fmtPct(data.pctMeta)} da meta com fator climático`}
          icon={<Target className="h-4 w-4" />}
        />
        <MetricCard
          title="Receita evitada"
          value={
            <span
              className={
                data.rowsComTarifa === 0
                  ? "text-muted-foreground"
                  : "text-emerald-600"
              }
            >
              {fmtBRL(data.receitaEvitadaTotal)}
            </span>
          }
          description={
            data.skipped.length === 0
              ? `${data.rowsComTarifa} registro(s) comparados`
              : `${data.rowsComTarifa} comparados · ${data.skipped.length} sem comparação (ver abaixo)`
          }
          icon={<PiggyBank className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Ranking de geração por usina</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.usinasOrdenadas.slice(0, 8).map((item) => (
              <div key={item.label} className="space-y-1.5">
                <div className="flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.label}</div>
                    <div className="text-muted-foreground">
                      {item.registros} registro(s) · estimado{" "}
                      {fmtCompact(item.estimado)} kWh
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-medium">
                      {fmtCompact(item.realizado)} kWh
                    </div>
                    <div className="text-muted-foreground">
                      {fmtPct(item.pctMeta)} da meta climática
                    </div>
                    {item.receitaEvitada != null && (
                      <div className="text-[11px] text-emerald-600">
                        Evitou {fmtBRL(item.receitaEvitada)}
                      </div>
                    )}
                  </div>
                </div>
                <Bar
                  value={progressPct(item.pctMeta)}
                  max={100}
                  className={metaBarClass(item.pctMeta)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Atenção de geração</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.abaixoMeta.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma usina abaixo da meta pelo cálculo estimado.
              </p>
            ) : (
              data.abaixoMeta.slice(0, 6).map((item) => (
                <div
                  key={item.label}
                  className="flex items-start justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.label}</div>
                    <div className="text-muted-foreground">
                      estimado {fmtCompact(item.estimado)} kWh
                    </div>
                  </div>
                  <Badge variant="destructive">
                    {fmtCompact(item.diferenca)} kWh
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Evolução por período</CardTitle>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.periodosRank.map((item) => (
            <div key={`${item.ano}-${item.mesIdx}`} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium">{item.label}</span>
                <span className="text-muted-foreground">
                  {fmtCompact(item.realizado)} kWh
                </span>
              </div>
              <Bar
                value={item.realizado}
                max={maxPeriodo}
                className="bg-emerald-500"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {data.skipped.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>
                Registros sem comparação ({data.skipped.length})
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
            <p className="text-xs text-muted-foreground">
              Não entraram no cálculo de receita evitada. Resumo por motivo
              abaixo, seguido dos primeiros 20 detalhes.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {Object.entries(
                data.skipped.reduce<Record<SkipReason, number>>(
                  (acc, s) => {
                    acc[s.reason] = (acc[s.reason] ?? 0) + 1;
                    return acc;
                  },
                  {} as Record<SkipReason, number>,
                ),
              ).map(([reason, count]) => (
                <Badge key={reason} variant="outline">
                  {SKIP_REASON_LABEL[reason as SkipReason]}: {count}
                </Badge>
              ))}
            </div>

            <div className="space-y-1.5 text-xs">
              {data.skipped.slice(0, 20).map((s) => (
                <div
                  key={s.rowId}
                  className="flex items-start justify-between gap-3 border-b border-dashed pb-1.5"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.label}</div>
                    <div className="text-muted-foreground">{s.detail}</div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {SKIP_REASON_LABEL[s.reason]}
                  </Badge>
                </div>
              ))}
              {data.skipped.length > 20 && (
                <p className="pt-2 text-muted-foreground">
                  ... e mais {data.skipped.length - 20} registro(s).
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
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
      row.original.mes ? (
        <Badge variant="secondary">{row.original.mes}</Badge>
      ) : (
        "—"
      ),
  },
  {
    id: "totalKwh",
    accessorFn: (row) => totalKwh(row.dias),
    header: "Total kWh",
    cell: ({ row }) => formatKwh(totalKwh(row.original.dias)),
  },
  {
    id: "metaMensal",
    accessorFn: (row) => metaMensalCalculada(row),
    header: "Meta mensal",
    cell: ({ row }) => formatKwh(metaMensalCalculada(row.original)),
  },
  {
    id: "atingido",
    accessorFn: (row) => {
      const total = totalKwh(row.dias);
      const meta = metaMensalCalculada(row);
      return meta && meta > 0 ? (total / meta) * 100 : null;
    },
    header: "% atingido",
    cell: ({ row }) => {
      const total = totalKwh(row.original.dias);
      const meta = metaMensalCalculada(row.original);
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
    accessorFn: (row) => diasComDado(row.dias),
    header: "Dias com dado",
    cell: ({ row }) => `${diasComDado(row.original.dias)} / 31`,
  },
];

function renderDetails(g: GeracaoRow) {
  const total = totalKwh(g.dias);
  const ativos = diasComDado(g.dias);
  const media = ativos > 0 ? total / ativos : 0;
  const metaMensal = metaMensalCalculada(g);
  return (
    <dl>
      <DetailField label="Usina" value={g.usina?.nome ?? g.nomeUsinaRaw} />
      <DetailField label="Ano" value={g.ano} />
      <DetailField label="Mês" value={g.mes} />
      <DetailField
        label="Meta mensal"
        value={metaMensal != null ? `${formatKwh(metaMensal)} kWh` : null}
      />
      <DetailField
        label="Meta diária"
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

  const metaDiaria = geracao.metaMensal;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="grid flex-1 grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Stat label="Total" value={`${formatKwh(total)} kWh`} />
          <Stat label="Média" value={`${formatKwh(media)} kWh`} />
          <Stat label="Máx" value={`${formatKwh(max)} kWh`} />
          <Stat
            label="Mín"
            value={ativos > 0 ? `${formatKwh(min)} kWh` : "—"}
          />
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
  tarifasDistribuidoras: TarifaDistribuidoraSerialized[];
}

export function GeracaoTable({
  rows,
  usinaOptions,
  tarifasDistribuidoras,
}: Props) {
  const fields = buildGeracaoFormFields(usinaOptions);
  const activeRows = useMemo(() => rows.filter((row) => !row.deletedAt), [rows]);

  return (
    <div className="flex flex-col gap-4">
      <GeracaoAnalytics
        rows={activeRows}
        tarifasDistribuidoras={tarifasDistribuidoras}
      />
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
    </div>
  );
}

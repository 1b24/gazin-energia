"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Filial, Fornecedor, Injecao } from "@prisma/client";
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Building2,
  DatabaseZap,
  Paperclip,
  PiggyBank,
  PlugZap,
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
import {
  fmtBRL,
  fmtCompact,
  fmtKwh,
  fmtPct,
  fmtRate,
} from "@/lib/format";
import { useAnalyticsFilters } from "@/lib/hooks/use-analytics-filters";
import { mesIndex } from "@/lib/period";
import {
  calcValorDistribuidora,
  findTarifaPorData,
  refDateFromAnoMes,
  type TarifaSnapshot,
} from "@/lib/tarifa-lookup";
import {
  buildInjecaoFormFields,
  injecaoSchema,
  type FilialPickerOption,
  type FornecedorPickerOption,
} from "@/lib/schemas/injecao";
import type { Serialized } from "@/lib/serialize";

import * as actions from "./actions";

export type InjecaoRow = Serialized<Injecao> & {
  filial: Pick<Filial, "id" | "codigo" | "mercadoLivre" | "uf"> | null;
  fornecedor: Pick<Fornecedor, "id" | "nome"> | null;
};

// Formatters movidos para `lib/format.ts` no Step 5 do refactor
// 2026-05-foundations. Bug pré-existente: `fmtRate` local tinha "â€”" (mojibake
// do "—") em vez do em-dash correto. Corrigido na consolidação.

// MESES_PT + mesIndex importados de `lib/period.ts` (Step 4 do refactor
// 2026-05-foundations). Bug pré-existente: o array local tinha "MarÃ§o"
// (encoding corrupto), fazendo `mesIndex("Março")` retornar 99 — o que
// silenciosamente afetava agregação por período em Março. Resolvido.

function fornecedorLabel(row: InjecaoRow) {
  return (
    row.fornecedor?.nome?.trim() ||
    row.fornecedorRaw?.trim() ||
    "Sem fornecedor"
  );
}

function filialLabel(row: InjecaoRow) {
  if (row.filial?.codigo) return row.filial.codigo;
  if (row.filialCodigoRaw) return row.filialCodigoRaw;
  return "Sem filial";
}

function rowKwh(row: InjecaoRow) {
  return row.consumoTotalKwh ?? 0;
}

function rowValor(row: InjecaoRow) {
  return row.valor ?? 0;
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

// MetricCard, Bar, EmptyAnalytics movidos para `components/analytics/*` no
// Step 5. Mudança visual no MetricCard: estilo unificado usa `text-xl` +
// `overflow-wrap:anywhere` em vez de `text-2xl` + `truncate` — valores longos
// quebram linha em vez de serem cortados.

/** Tarifa serializada vinda da page (Date como string ISO). */
export interface TarifaDistribuidoraSerialized {
  uf: string;
  valorPonta: number | null;
  valorForaPonta: number | null;
  vigenciaInicio: string;
  vigenciaFim: string | null;
}

function InjecaoAnalytics({
  rows,
  tarifasDistribuidoras,
}: {
  rows: InjecaoRow[];
  tarifasDistribuidoras: TarifaDistribuidoraSerialized[];
}) {
  // Filtros multi-select (período + UF) com filtragem AND. UF vem de
  // `filial.uf`. Hook em `lib/hooks/use-analytics-filters.ts`.
  const {
    ufOptions,
    selectedPeriods,
    setSelectedPeriods,
    selectedUfs,
    setSelectedUfs,
    filteredRows: scopedRows,
    filterSummary,
    periodMultiOptions,
  } = useAnalyticsFilters(rows, {
    uf: (row) => row.filial?.uf?.trim() || null,
  });

  // Tarifas com Date reidratada — string ISO → Date uma vez só.
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
    const totalKwh = scopedRows.reduce((acc, row) => acc + rowKwh(row), 0);
    const totalValor = scopedRows.reduce((acc, row) => acc + rowValor(row), 0);
    const totalValor1 = scopedRows.reduce(
      (acc, row) => acc + (row.valor1 ?? 0),
      0,
    );
    const totalValor2 = scopedRows.reduce(
      (acc, row) => acc + (row.valor2 ?? 0),
      0,
    );
    const ucs = new Set(
      scopedRows.map((row) => row.uc?.trim()).filter(Boolean),
    );

    // Economia vs distribuidora — calcula linha por linha usando tarifa
    // histórica que cobria a data do registro.
    let economiaTotal = 0;
    let rowsComTarifa = 0;
    let rowsSemTarifa = 0;
    const economiaPorFornecedor = new Map<string, number>();
    for (const row of scopedRows) {
      const uf = row.filial?.uf?.trim() || null;
      const refDate = refDateFromAnoMes(row.ano, row.mes);
      if (!uf || !refDate) {
        rowsSemTarifa += 1;
        continue;
      }
      const tarifa = findTarifaPorData(tarifas, uf, refDate);
      if (!tarifa) {
        rowsSemTarifa += 1;
        continue;
      }
      const kwhPonta = row.consumoKwhP ?? 0;
      const kwhTotal = row.consumoTotalKwh ?? 0;
      const kwhForaPonta = Math.max(0, kwhTotal - kwhPonta);
      const valorDist = calcValorDistribuidora(kwhPonta, kwhForaPonta, tarifa);
      if (valorDist == null) {
        rowsSemTarifa += 1;
        continue;
      }
      const economia = valorDist - rowValor(row);
      economiaTotal += economia;
      rowsComTarifa += 1;
      const fornecedorKey = fornecedorLabel(row);
      economiaPorFornecedor.set(
        fornecedorKey,
        (economiaPorFornecedor.get(fornecedorKey) ?? 0) + economia,
      );
    }

    const fornecedores = new Map<
      string,
      {
        label: string;
        registros: number;
        kwh: number;
        valor: number;
        ucs: Set<string>;
      }
    >();
    const periodos = new Map<
      string,
      { label: string; ano: number; mesIdx: number; kwh: number; valor: number }
    >();

    for (const row of scopedRows) {
      const fornecedor = fornecedorLabel(row);
      const currentFornecedor = fornecedores.get(fornecedor) ?? {
        label: fornecedor,
        registros: 0,
        kwh: 0,
        valor: 0,
        ucs: new Set(),
      };
      currentFornecedor.registros += 1;
      currentFornecedor.kwh += rowKwh(row);
      currentFornecedor.valor += rowValor(row);
      if (row.uc) currentFornecedor.ucs.add(row.uc);
      fornecedores.set(fornecedor, currentFornecedor);

      const mesIdx = mesIndex(row.mes);
      const ano = row.ano ?? 0;
      const periodK = `${ano}-${String(mesIdx).padStart(2, "0")}`;
      const periodLabel =
        row.mes && row.ano ? `${row.mes}/${row.ano}` : "Sem período";
      const currentPeriod = periodos.get(periodK) ?? {
        label: periodLabel,
        ano,
        mesIdx,
        kwh: 0,
        valor: 0,
      };
      currentPeriod.kwh += rowKwh(row);
      currentPeriod.valor += rowValor(row);
      periodos.set(periodK, currentPeriod);
    }

    const fornecedoresRank = [...fornecedores.values()]
      .map((item) => ({
        ...item,
        ucsCount: item.ucs.size,
        valorPorKwh: item.kwh > 0 ? item.valor / item.kwh : null,
        economia: economiaPorFornecedor.get(item.label) ?? null,
      }))
      .sort((a, b) => b.kwh - a.kwh);

    const periodosRank = [...periodos.values()].sort(
      (a, b) => a.ano - b.ano || a.mesIdx - b.mesIdx,
    );

    const topKwh = [...scopedRows]
      .sort((a, b) => rowKwh(b) - rowKwh(a))
      .slice(0, 5);
    const topValor = [...scopedRows]
      .sort((a, b) => rowValor(b) - rowValor(a))
      .slice(0, 5);

    const semFornecedor = scopedRows.filter(
      (row) => !row.fornecedor?.nome && !row.fornecedorRaw,
    ).length;
    const fornecedorSemVinculo = scopedRows.filter(
      (row) => row.fornecedorRaw && !row.fornecedor,
    ).length;
    const filialSemVinculo = scopedRows.filter(
      (row) => row.filialCodigoRaw && !row.filial,
    ).length;
    const semAnexo = scopedRows.filter((row) => !row.anexoFechamento).length;
    const kwhZerado = scopedRows.filter((row) => rowKwh(row) <= 0).length;
    const valorZerado = scopedRows.filter((row) => rowValor(row) <= 0).length;

    return {
      totalKwh,
      totalValor,
      totalValor1,
      totalValor2,
      ucsCount: ucs.size,
      economiaTotal,
      rowsComTarifa,
      rowsSemTarifa,
      fornecedoresRank,
      periodosRank,
      topKwh,
      topValor,
      quality: [
        { label: "Sem fornecedor", value: semFornecedor },
        { label: "Fornecedor sem vínculo", value: fornecedorSemVinculo },
        { label: "Filial sem vínculo", value: filialSemVinculo },
        { label: "Sem anexo", value: semAnexo },
        { label: "kWh zerado", value: kwhZerado },
        { label: "Valor zerado", value: valorZerado },
      ],
    };
  }, [scopedRows, tarifas]);

  if (rows.length === 0)
    return <EmptyAnalytics message="Sem dados de injeção para analisar." />;

  const leader = data.fornecedoresRank[0];
  const maxFornecedorKwh = Math.max(
    ...data.fornecedoresRank.map((item) => item.kwh),
    0,
  );
  const maxPeriodoKwh = Math.max(
    ...data.periodosRank.map((item) => item.kwh),
    0,
  );
  const maxQuality = Math.max(...data.quality.map((item) => item.value), 0);
  const leaderShare =
    leader && data.totalKwh > 0 ? (leader.kwh / data.totalKwh) * 100 : 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Visão de injeção</h2>
          <div className="text-sm text-muted-foreground">
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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          title="Injeção total"
          value={`${fmtCompact(data.totalKwh)} kWh`}
          description={`${data.ucsCount} UC(s) em ${scopedRows.length} registro(s)`}
          icon={<PlugZap className="h-4 w-4" />}
        />
        <MetricCard
          title="Valor principal"
          value={fmtBRL(data.totalValor)}
          description={`Valor 1: ${fmtBRL(data.totalValor1)} · Valor 2: ${fmtBRL(data.totalValor2)}`}
          icon={<Banknote className="h-4 w-4" />}
        />
        <MetricCard
          title="Economia vs distribuidora"
          value={
            data.rowsComTarifa === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span
                className={
                  data.economiaTotal >= 0 ? "text-emerald-600" : "text-destructive"
                }
              >
                {fmtBRL(data.economiaTotal)}
              </span>
            )
          }
          description={
            data.rowsComTarifa === 0
              ? "Cadastre tarifa de distribuidora em /tarifas pra comparar"
              : `${data.rowsComTarifa} comparáveis · ${data.rowsSemTarifa} sem tarifa cobrindo a data`
          }
          icon={<PiggyBank className="h-4 w-4" />}
        />
        <MetricCard
          title="Fornecedor líder"
          value={leader?.label ?? "—"}
          description={
            leader
              ? `${fmtCompact(leader.kwh)} kWh · ${fmtPct(leaderShare)}`
              : "Sem fornecedor"
          }
          icon={<Building2 className="h-4 w-4" />}
        />
        <MetricCard
          title="Pontos de atenção"
          value={fmtCompact(
            data.quality.reduce((acc, item) => acc + item.value, 0),
          )}
          description="cadastro, anexo, vínculo ou valores zerados"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Injeção por fornecedor</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.fornecedoresRank.slice(0, 8).map((item) => (
              <div key={item.label} className="space-y-1.5">
                <div className="flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.label}</div>
                    <div className="text-muted-foreground">
                      {item.ucsCount} UC(s) · {item.registros} registro(s)
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-medium">
                      {fmtCompact(item.kwh)} kWh
                    </div>
                    <div className="text-muted-foreground">
                      {fmtBRL(item.valor)} · {fmtRate(item.valorPorKwh)}
                    </div>
                    {item.economia != null && (
                      <div
                        className={`text-[11px] ${
                          item.economia >= 0
                            ? "text-emerald-600"
                            : "text-destructive"
                        }`}
                      >
                        Economia: {fmtBRL(item.economia)}
                      </div>
                    )}
                  </div>
                </div>
                <Bar value={item.kwh} max={maxFornecedorKwh} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Qualidade dos dados</CardTitle>
              <DatabaseZap className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.quality.map((item) => (
              <div key={item.label} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">{item.label}</span>
                  <Badge variant={item.value > 0 ? "outline" : "secondary"}>
                    {item.value}
                  </Badge>
                </div>
                <Bar
                  value={item.value}
                  max={maxQuality}
                  className={item.value > 0 ? "bg-amber-500" : "bg-primary"}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Evolução por período</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.periodosRank.map((item) => (
              <div key={`${item.ano}-${item.mesIdx}`} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium">{item.label}</span>
                  <span className="text-muted-foreground">
                    {fmtCompact(item.kwh)} kWh
                  </span>
                </div>
                <Bar
                  value={item.kwh}
                  max={maxPeriodoKwh}
                  className="bg-emerald-500"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Maiores injeções</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topKwh.map((row) => (
              <div
                key={row.id}
                className="flex items-start justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {filialLabel(row)} · UC {row.uc ?? "—"}
                  </div>
                  <div className="truncate text-muted-foreground">
                    {fornecedorLabel(row)} · {row.mes ?? "—"}/{row.ano ?? "—"}
                  </div>
                </div>
                <div className="shrink-0 text-right font-medium">
                  {fmtCompact(rowKwh(row))} kWh
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Maiores valores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topValor.map((row) => (
              <div
                key={row.id}
                className="flex items-start justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {filialLabel(row)} · UC {row.uc ?? "—"}
                  </div>
                  <div className="truncate text-muted-foreground">
                    {fornecedorLabel(row)} · {fmtCompact(rowKwh(row))} kWh
                  </div>
                </div>
                <div className="shrink-0 text-right font-medium">
                  {fmtBRL(rowValor(row))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

const columns: ColumnDef<InjecaoRow, unknown>[] = [
  {
    id: "filial",
    header: "Filial",
    cell: ({ row }) => {
      const f = row.original.filial;
      if (f) {
        return (
          <span className="text-xs">
            {f.codigo ?? "—"}
            {f.mercadoLivre ? ` · ${f.mercadoLivre}` : ""}
          </span>
        );
      }
      const raw = row.original.filialCodigoRaw;
      return raw ? (
        <span className="text-xs text-muted-foreground" title="Sem vínculo">
          {raw}
        </span>
      ) : (
        "—"
      );
    },
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
    accessorKey: "uc",
    header: "UC",
    cell: ({ row }) =>
      row.original.uc ? (
        <span className="font-mono text-xs">{row.original.uc}</span>
      ) : (
        "—"
      ),
  },
  {
    id: "fornecedor",
    header: "Fornecedor",
    cell: ({ row }) => {
      const f = row.original.fornecedor;
      if (f) return f.nome ?? "—";
      return row.original.fornecedorRaw ? (
        <span className="text-xs text-muted-foreground" title="Sem vínculo">
          {row.original.fornecedorRaw}
        </span>
      ) : (
        "—"
      );
    },
  },
  {
    accessorKey: "consumoKwhP",
    header: "Consumo P (kWh)",
    cell: ({ row }) => fmtKwh(row.original.consumoKwhP),
  },
  {
    accessorKey: "consumoKwhP1",
    header: "Consumo P1 (kWh)",
    cell: ({ row }) => fmtKwh(row.original.consumoKwhP1),
  },
  {
    accessorKey: "consumoTotalKwh",
    header: "Total (kWh)",
    cell: ({ row }) => fmtKwh(row.original.consumoTotalKwh),
  },
  {
    accessorKey: "valor",
    header: "Valor",
    cell: ({ row }) => (
      <span className="font-medium">{fmtBRL(row.original.valor)}</span>
    ),
  },
  {
    accessorKey: "valor1",
    header: "Valor 1",
    cell: ({ row }) => fmtBRL(row.original.valor1),
  },
  {
    accessorKey: "valor2",
    header: "Valor 2",
    cell: ({ row }) => fmtBRL(row.original.valor2),
  },
  {
    accessorKey: "municipio",
    header: "Município",
    cell: ({ row }) => row.original.municipio ?? "—",
  },
  {
    id: "anexo",
    header: "Anexo",
    enableSorting: false,
    cell: ({ row }) => <FileLink url={row.original.anexoFechamento} />,
  },
];

const HIDDEN_BY_DEFAULT = {
  consumoKwhP: false,
  consumoKwhP1: false,
  valor1: false,
  valor2: false,
};

function renderDetails(i: InjecaoRow) {
  return (
    <dl>
      <DetailField
        label="Filial"
        value={
          i.filial
            ? `${i.filial.codigo ?? "—"} · ${i.filial.mercadoLivre ?? ""}`.trim()
            : i.filialCodigoRaw
              ? `${i.filialCodigoRaw} (sem vínculo)`
              : null
        }
      />
      <DetailField label="Ano" value={i.ano} />
      <DetailField label="Mês" value={i.mes} />
      <DetailField label="UC" value={i.uc} />
      <DetailField label="Município" value={i.municipio} />
      <DetailField
        label="Fornecedor"
        value={
          i.fornecedor?.nome ??
          (i.fornecedorRaw ? `${i.fornecedorRaw} (sem vínculo)` : null)
        }
      />
      <DetailField
        label="Consumo P"
        value={i.consumoKwhP != null ? `${fmtKwh(i.consumoKwhP)} kWh` : null}
      />
      <DetailField
        label="Consumo P1"
        value={i.consumoKwhP1 != null ? `${fmtKwh(i.consumoKwhP1)} kWh` : null}
      />
      <DetailField
        label="Consumo total"
        value={
          i.consumoTotalKwh != null ? `${fmtKwh(i.consumoTotalKwh)} kWh` : null
        }
      />
      <DetailField label="Valor" value={fmtBRL(i.valor)} />
      <DetailField label="Valor 1" value={fmtBRL(i.valor1)} />
      <DetailField label="Valor 2" value={fmtBRL(i.valor2)} />
      <DetailField
        label="Anexo de fechamento"
        value={i.anexoFechamento ? <FileLink url={i.anexoFechamento} /> : null}
      />
    </dl>
  );
}

interface Props {
  rows: InjecaoRow[];
  filialOptions: FilialPickerOption[];
  fornecedorOptions: FornecedorPickerOption[];
  tarifasDistribuidoras: TarifaDistribuidoraSerialized[];
}

export function InjecaoTable({
  rows,
  filialOptions,
  fornecedorOptions,
  tarifasDistribuidoras,
}: Props) {
  const fields = buildInjecaoFormFields(filialOptions, fornecedorOptions);
  const activeRows = useMemo(() => rows.filter((row) => !row.deletedAt), [rows]);

  return (
    <div className="flex flex-col gap-4">
      <InjecaoAnalytics
        rows={activeRows}
        tarifasDistribuidoras={tarifasDistribuidoras}
      />
      <EntityPage<InjecaoRow, typeof injecaoSchema>
        title="Controle de Injeção"
        prismaModel="Injecao"
        rawFileName="injecao.json"
        schema={injecaoSchema}
        fields={fields}
        rows={rows}
        columns={columns}
        initialColumnVisibility={HIDDEN_BY_DEFAULT}
        actions={actions}
        details={renderDetails}
      />
    </div>
  );
}

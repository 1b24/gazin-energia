"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Consumo, Filial } from "@prisma/client";
import {
  AlertTriangle,
  BarChart3,
  Banknote,
  Bolt,
  Building2,
  DatabaseZap,
  FileSpreadsheet,
  Gauge,
  Paperclip,
  Receipt,
  Upload,
  Zap,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { ConsumoImportDialog } from "./import-dialog";

import { Bar } from "@/components/analytics/bar";
import { EmptyAnalytics } from "@/components/analytics/empty-state";
import { MetricCard } from "@/components/analytics/metric-card";
import { DetailField } from "@/components/data-table/entity-drawer";
import { EntityPage } from "@/components/data-table/entity-page";
import {
  VariacaoCell,
  variacaoSortingFn,
} from "@/components/data-table/variacao-cell";
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
import { mesIndex, periodKey, periodoLabel } from "@/lib/period";
import { buildConsumoFormFields, consumoSchema } from "@/lib/schemas/consumo";
import type { FilialPickerOption } from "@/lib/schemas/consumo";
import type { Serialized } from "@/lib/serialize";

import * as actions from "./actions";

export type ConsumoRow = Serialized<Consumo> & {
  filial: Pick<Filial, "id" | "codigo" | "mercadoLivre" | "uf"> | null;
  /** Δ vs mesmo UC no mês anterior — calculado no server. */
  variacaoConsumoAbs?: number | null;
  variacaoConsumoPct?: number | null;
  variacaoFaturaAbs?: number | null;
  variacaoFaturaPct?: number | null;
};

// Formatters (`fmtKwh`, `fmtBRL`, `fmtCompact`, `fmtPct`, `fmtRate`) movidos
// para `lib/format.ts` no Step 5 do refactor 2026-05-foundations. `fmtPct`
// agora espera percentual (0-100), não fração (0-1) — call-sites locais que
// passavam `ponta/total` foram ajustados para `(ponta/total) * 100`.

// MESES_PT, mesIndex, periodKey, periodoLabel migraram para `lib/period.ts`
// no Step 4 do refactor 2026-05-foundations.

function filialLabel(row: ConsumoRow) {
  if (row.filial) {
    return [row.filial.codigo, row.filial.mercadoLivre]
      .filter(Boolean)
      .join(" · ");
  }
  return row.filialCodigoRaw?.trim() || "Sem filial";
}

function ufOf(row: ConsumoRow): string | null {
  return row.filial?.uf?.trim() || null;
}

function consumoP(row: ConsumoRow) {
  return row.consumoKwhP ?? 0;
}

function consumoFp(row: ConsumoRow) {
  return row.consumoKwhFp ?? 0;
}

function consumoTotal(row: ConsumoRow) {
  return row.consumoTotal ?? consumoP(row) + consumoFp(row);
}

function valorTotal(row: ConsumoRow) {
  return row.valorTotalFatura ?? row.valor ?? 0;
}

function valorKwhP(row: ConsumoRow) {
  return row.valor ?? 0;
}

function valorKwhFp(row: ConsumoRow) {
  return row.valor1 ?? 0;
}

// MetricCard, Bar, EmptyAnalytics movidos para `components/analytics/*`
// no Step 5 do refactor 2026-05-foundations.

function ConsumoAnalytics({ rows }: { rows: ConsumoRow[] }) {
  // Filtros multi-select (período + UF) com filtragem AND. Default: último
  // período selecionado. Hook em `lib/hooks/use-analytics-filters.ts` para
  // não duplicar lógica entre Consumo, Geração e Injeção.
  const {
    ufOptions,
    selectedPeriods,
    setSelectedPeriods,
    selectedUfs,
    setSelectedUfs,
    filteredRows: selectedRows,
    filterSummary,
    periodMultiOptions,
  } = useAnalyticsFilters(rows, { uf: ufOf });

  const data = useMemo(() => {
    const total = selectedRows.reduce((acc, row) => acc + consumoTotal(row), 0);
    const ponta = selectedRows.reduce((acc, row) => acc + consumoP(row), 0);
    const foraPonta = selectedRows.reduce(
      (acc, row) => acc + consumoFp(row),
      0,
    );
    const valorPonta = selectedRows.reduce(
      (acc, row) => acc + valorKwhP(row),
      0,
    );
    const valorForaPonta = selectedRows.reduce(
      (acc, row) => acc + valorKwhFp(row),
      0,
    );
    const valor = selectedRows.reduce((acc, row) => acc + valorTotal(row), 0);
    const ucs = new Set<string>();
    const filiais = new Map<
      string,
      {
        label: string;
        total: number;
        ponta: number;
        foraPonta: number;
        valor: number;
        ucs: Set<string>;
      }
    >();
    const periods = new Map<
      string,
      {
        key: string;
        label: string;
        ano: number;
        mesIdx: number;
        total: number;
        ponta: number;
        foraPonta: number;
        valor: number;
      }
    >();

    let semFilial = 0;
    let semUc = 0;
    let consumoZerado = 0;
    let valorZerado = 0;
    let semAnexo = 0;
    let totalInconsistente = 0;
    let multas = 0;

    for (const row of selectedRows) {
      const totalRow = consumoTotal(row);
      const pontaRow = consumoP(row);
      const fpRow = consumoFp(row);
      const valorRow = valorTotal(row);
      const label = filialLabel(row);
      const filial = filiais.get(label) ?? {
        label,
        total: 0,
        ponta: 0,
        foraPonta: 0,
        valor: 0,
        ucs: new Set<string>(),
      };

      filial.total += totalRow;
      filial.ponta += pontaRow;
      filial.foraPonta += fpRow;
      filial.valor += valorRow;
      if (row.uc) {
        filial.ucs.add(row.uc);
        ucs.add(row.uc);
      }
      filiais.set(label, filial);

      const mesIdx = mesIndex(row.mes);
      const ano = row.ano ?? 0;
      if (ano > 0 && mesIdx >= 0) {
        const key = periodKey(row);
        const period = periods.get(key) ?? {
          key,
          label: periodoLabel(row),
          ano,
          mesIdx,
          total: 0,
          ponta: 0,
          foraPonta: 0,
          valor: 0,
        };
        period.total += totalRow;
        period.ponta += pontaRow;
        period.foraPonta += fpRow;
        period.valor += valorRow;
        periods.set(key, period);
      }

      if (row.filialCodigoRaw && !row.filial) semFilial += 1;
      if (!row.uc) semUc += 1;
      if (totalRow <= 0) consumoZerado += 1;
      if (valorRow <= 0) valorZerado += 1;
      if (!row.arquivoFatura) semAnexo += 1;
      if (
        row.consumoTotal != null &&
        (row.consumoKwhP != null || row.consumoKwhFp != null) &&
        Math.abs(row.consumoTotal - (pontaRow + fpRow)) > 1
      ) {
        totalInconsistente += 1;
      }
      if ((row.multasJurosAtraso ?? 0) > 0 || (row.outrasMultas ?? 0) > 0) {
        multas += 1;
      }
    }

    const filialRows = Array.from(filiais.values()).map((item) => ({
      label: item.label,
      total: item.total,
      ponta: item.ponta,
      foraPonta: item.foraPonta,
      valor: item.valor,
      ucsCount: item.ucs.size,
      rate: item.total > 0 ? item.valor / item.total : null,
    }));

    const quality = [
      { label: "Sem filial vinculada", value: semFilial },
      { label: "Sem UC", value: semUc },
      { label: "Consumo zerado", value: consumoZerado },
      { label: "Valor zerado", value: valorZerado },
      { label: "Sem anexo", value: semAnexo },
      { label: "Total inconsistente", value: totalInconsistente },
      { label: "Com multas", value: multas },
    ];

    return {
      total,
      ponta,
      foraPonta,
      valorPonta,
      valorForaPonta,
      valor,
      ucsCount: ucs.size,
      filiaisCount: filiais.size,
      avgRate: total > 0 ? valor / total : null,
      avgUnitValue: ucs.size > 0 ? valor / ucs.size : null,
      topTotal: filialRows.sort((a, b) => b.total - a.total).slice(0, 10),
      topPonta: [...filialRows].sort((a, b) => b.ponta - a.ponta).slice(0, 10),
      topForaPonta: [...filialRows]
        .sort((a, b) => b.foraPonta - a.foraPonta)
        .slice(0, 10),
      topValor: [...filialRows].sort((a, b) => b.valor - a.valor).slice(0, 10),
      periods: Array.from(periods.values()).sort(
        (a, b) => a.ano - b.ano || a.mesIdx - b.mesIdx,
      ),
      quality,
      qualityTotal: quality.reduce((acc, item) => acc + item.value, 0),
    };
  }, [selectedRows]);

  if (rows.length === 0) return <EmptyAnalytics message="Sem dados de consumo para analisar." />;

  // `filterSummary` e `periodMultiOptions` vêm do hook `useAnalyticsFilters`.

  const maxTotal = Math.max(...data.topTotal.map((item) => item.total), 0);
  const maxPonta = Math.max(...data.topPonta.map((item) => item.ponta), 0);
  const maxForaPonta = Math.max(
    ...data.topForaPonta.map((item) => item.foraPonta),
    0,
  );
  const maxValor = Math.max(...data.topValor.map((item) => item.valor), 0);
  const maxPeriod = Math.max(...data.periods.map((item) => item.total), 0);
  const qualityMax = Math.max(...data.quality.map((item) => item.value), 0);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Visão de consumo</h2>
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
          title="Consumo total"
          value={`${fmtCompact(data.total)} kWh`}
          description={`${data.filiaisCount} filial(is) · ${data.ucsCount} UC(s)`}
          icon={<Zap className="h-4 w-4" />}
        />
        <MetricCard
          title="Ponta"
          value={`${fmtCompact(data.ponta)} kWh`}
          description={
            <>
              <span className="block">
                {fmtPct(data.total > 0 ? (data.ponta / data.total) * 100 : null)} do
                consumo
              </span>
              <span className="block">
                Valor agregado: {fmtBRL(data.valorPonta)}
              </span>
            </>
          }
          icon={<Bolt className="h-4 w-4" />}
        />
        <MetricCard
          title="Fora ponta"
          value={`${fmtCompact(data.foraPonta)} kWh`}
          description={
            <>
              <span className="block">
                {fmtPct(data.total > 0 ? (data.foraPonta / data.total) * 100 : null)} do
                consumo
              </span>
              <span className="block">
                Valor agregado: {fmtBRL(data.valorForaPonta)}
              </span>
            </>
          }
          icon={<Gauge className="h-4 w-4" />}
        />
        <MetricCard
          title="Valor total"
          value={fmtBRL(data.valor)}
          description={`Média por UC: ${fmtBRL(data.avgUnitValue)}`}
          icon={<Banknote className="h-4 w-4" />}
        />
        <MetricCard
          title="R$/kWh médio"
          value={fmtRate(data.avgRate)}
          description={`${data.qualityTotal} ponto(s) de qualidade`}
          icon={<DatabaseZap className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Top 10 filiais por consumo</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topTotal.map((item, index) => (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate">
                    {index + 1}. {item.label}
                  </span>
                  <span className="font-medium">
                    {fmtCompact(item.total)} kWh
                  </span>
                </div>
                <Bar value={item.total} max={maxTotal} />
                <div className="text-[11px] text-muted-foreground">
                  {item.ucsCount} UC(s) · {fmtRate(item.rate)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Consumo por mês</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.periods.map((item) => (
              <div key={item.key} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span>{item.label}</span>
                  <span className="font-medium">
                    {fmtCompact(item.total)} kWh
                  </span>
                </div>
                <Bar
                  value={item.total}
                  max={maxPeriod}
                  className="bg-cyan-500"
                />
                <div className="text-[11px] text-muted-foreground">
                  P: {fmtCompact(item.ponta)} kWh · FP:{" "}
                  {fmtCompact(item.foraPonta)} kWh · {fmtBRL(item.valor)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Top 10 ponta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topPonta.map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate">{item.label}</span>
                  <span className="font-medium">
                    {fmtCompact(item.ponta)} kWh
                  </span>
                </div>
                <Bar
                  value={item.ponta}
                  max={maxPonta}
                  className="bg-amber-500"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Top 10 fora ponta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topForaPonta.map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate">{item.label}</span>
                  <span className="font-medium">
                    {fmtCompact(item.foraPonta)} kWh
                  </span>
                </div>
                <Bar
                  value={item.foraPonta}
                  max={maxForaPonta}
                  className="bg-emerald-500"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Top 10 valor de fatura</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topValor.map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate">{item.label}</span>
                  <span className="font-medium">{fmtBRL(item.valor)}</span>
                </div>
                <Bar
                  value={item.valor}
                  max={maxValor}
                  className="bg-violet-500"
                />
                <div className="text-[11px] text-muted-foreground">
                  {fmtRate(item.rate)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Qualidade dos dados</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {data.quality.map((item) => (
            <div key={item.label} className="space-y-1 rounded-md border p-3">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-medium">{item.value}</span>
              </div>
              <Bar
                value={item.value}
                max={qualityMax}
                className={item.value > 0 ? "bg-destructive" : "bg-emerald-500"}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
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

const columns: ColumnDef<ConsumoRow, unknown>[] = [
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
  // --- Consumo (kWh) ---
  {
    accessorKey: "consumoKwhP",
    header: "Consumo P (kWh)",
    cell: ({ row }) => fmtKwh(row.original.consumoKwhP),
  },
  {
    accessorKey: "consumoKwhFp",
    header: "Consumo FP (kWh)",
    cell: ({ row }) => fmtKwh(row.original.consumoKwhFp),
  },
  {
    accessorKey: "consumoTotal",
    header: "Consumo total (kWh)",
    cell: ({ row }) => fmtKwh(row.original.consumoTotal),
  },
  {
    accessorKey: "variacaoConsumoPct",
    header: "Δ Consumo",
    sortingFn: variacaoSortingFn,
    sortDescFirst: true,
    cell: ({ row }) => (
      <VariacaoCell
        pct={row.original.variacaoConsumoPct ?? null}
        abs={row.original.variacaoConsumoAbs ?? null}
        unidade="kWh"
      />
    ),
  },
  {
    accessorKey: "injecaoRecebida",
    header: "Injeção (kWh)",
    cell: ({ row }) => fmtKwh(row.original.injecaoRecebida),
  },
  // --- Valores (R$) ---
  {
    accessorKey: "valor",
    header: "Valor P",
    cell: ({ row }) => fmtBRL(row.original.valor),
  },
  {
    accessorKey: "valor1",
    header: "Valor FP",
    cell: ({ row }) => fmtBRL(row.original.valor1),
  },
  {
    accessorKey: "valor2",
    header: "Valor consumo total",
    cell: ({ row }) => fmtBRL(row.original.valor2),
  },
  {
    accessorKey: "valor3",
    header: "Valor injeção recebida",
    cell: ({ row }) => fmtBRL(row.original.valor3),
  },
  {
    accessorKey: "valorTotalFatura",
    header: "Total fatura",
    cell: ({ row }) => (
      <span className="font-medium">
        {fmtBRL(row.original.valorTotalFatura)}
      </span>
    ),
  },
  {
    accessorKey: "variacaoFaturaPct",
    header: "Δ Fatura",
    sortingFn: variacaoSortingFn,
    sortDescFirst: true,
    cell: ({ row }) => (
      <VariacaoCell
        pct={row.original.variacaoFaturaPct ?? null}
        abs={row.original.variacaoFaturaAbs ?? null}
        unidade="R$"
      />
    ),
  },
  // --- Multas ---
  {
    accessorKey: "multasJurosAtraso",
    header: "Multas / juros",
    cell: ({ row }) => fmtBRL(row.original.multasJurosAtraso),
  },
  {
    accessorKey: "outrasMultas",
    header: "Outras multas",
    cell: ({ row }) => fmtBRL(row.original.outrasMultas),
  },
  // --- Outros ---
  {
    accessorKey: "municipio",
    header: "Município",
    cell: ({ row }) => row.original.municipio ?? "—",
  },
  {
    accessorKey: "statusAnexo",
    header: "Status anexo",
    cell: ({ row }) => row.original.statusAnexo ?? "—",
  },
  {
    id: "anexo",
    header: "Anexo",
    enableSorting: false,
    cell: ({ row }) => <FileLink url={row.original.arquivoFatura} />,
  },
];

// Colunas escondidas por padrão — usuário pode liberar via dropdown "Colunas".
// Visíveis no boot: filial, ano, mes, uc, consumoTotal, injecaoRecebida,
// valorTotalFatura, municipio, anexo.
const HIDDEN_BY_DEFAULT = {
  consumoKwhP: false,
  consumoKwhFp: false,
  valor: false,
  valor1: false,
  valor2: false,
  valor3: false,
  multasJurosAtraso: false,
  outrasMultas: false,
  statusAnexo: false,
};

function renderDetails(c: ConsumoRow) {
  return (
    <dl>
      <DetailField
        label="Filial"
        value={
          c.filial
            ? `${c.filial.codigo ?? "—"} · ${c.filial.mercadoLivre ?? ""}`.trim()
            : c.filialCodigoRaw
              ? `${c.filialCodigoRaw} (sem vínculo)`
              : null
        }
      />
      <DetailField label="Ano" value={c.ano} />
      <DetailField label="Mês" value={c.mes} />
      <DetailField label="UC" value={c.uc} />
      <DetailField label="Município" value={c.municipio} />

      <DetailField
        label="Consumo P"
        value={c.consumoKwhP != null ? `${fmtKwh(c.consumoKwhP)} kWh` : null}
      />
      <DetailField
        label="Consumo FP"
        value={c.consumoKwhFp != null ? `${fmtKwh(c.consumoKwhFp)} kWh` : null}
      />
      <DetailField
        label="Consumo total"
        value={c.consumoTotal != null ? `${fmtKwh(c.consumoTotal)} kWh` : null}
      />
      <DetailField
        label="Injeção recebida"
        value={
          c.injecaoRecebida != null ? `${fmtKwh(c.injecaoRecebida)} kWh` : null
        }
      />

      <DetailField label="Valor P" value={fmtBRL(c.valor)} />
      <DetailField label="Valor FP" value={fmtBRL(c.valor1)} />
      <DetailField label="Valor consumo total" value={fmtBRL(c.valor2)} />
      <DetailField label="Valor injeção recebida" value={fmtBRL(c.valor3)} />
      <DetailField
        label="Valor total da fatura"
        value={fmtBRL(c.valorTotalFatura)}
      />

      <DetailField
        label="Multas / juros / atraso"
        value={fmtBRL(c.multasJurosAtraso)}
      />
      <DetailField label="Outras multas" value={fmtBRL(c.outrasMultas)} />

      <DetailField label="Status do anexo" value={c.statusAnexo} />
      <DetailField
        label="Arquivo da fatura"
        value={c.arquivoFatura ? <FileLink url={c.arquivoFatura} /> : null}
      />
    </dl>
  );
}

interface Props {
  rows: ConsumoRow[];
  filialOptions: FilialPickerOption[];
}

export function ConsumoTable({ rows, filialOptions }: Props) {
  const fields = buildConsumoFormFields(filialOptions);
  const activeRows = useMemo(() => rows.filter((row) => !row.deletedAt), [rows]);
  const [importOpen, setImportOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Download do modelo oficial (XLSX em PT-BR com colunas ID/Filial ID ocultas).
  function handleDownloadModel() {
    startTransition(async () => {
      const payload = await actions.exportConsumoModel();
      const blob = new Blob([payload.buffer], { type: payload.mimetype });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = payload.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ConsumoAnalytics rows={activeRows} />
      <EntityPage<ConsumoRow, typeof consumoSchema>
        title="Consumo"
        prismaModel="Consumo"
        rawFileName="consumo.json"
        schema={consumoSchema}
        fields={fields}
        rows={rows}
        columns={columns}
        initialColumnVisibility={HIDDEN_BY_DEFAULT}
        actions={actions}
        details={renderDetails}
        toolbarExtras={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadModel}
              disabled={pending}
              title="Baixa um Excel preenchido com os consumos atuais — use como modelo pra editar e reimportar."
            >
              <FileSpreadsheet className="mr-1 h-4 w-4" />
              Baixar modelo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              disabled={pending}
            >
              <Upload className="mr-1 h-4 w-4" />
              Importar Excel
            </Button>
          </>
        }
      />
      <ConsumoImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

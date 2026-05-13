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
  Gauge,
  Paperclip,
  Receipt,
  Zap,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { DetailField } from "@/components/data-table/entity-drawer";
import { EntityPage } from "@/components/data-table/entity-page";
import {
  VariacaoCell,
  variacaoSortingFn,
} from "@/components/data-table/variacao-cell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MultiSelect } from "@/components/ui/multi-select";
import { buildConsumoFormFields, consumoSchema } from "@/lib/schemas/consumo";
import type { FilialOption } from "@/lib/schemas/usina";
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

const fmtKwh = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const fmtBRL = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

const fmtCompact = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n.toLocaleString("pt-BR", {
        maximumFractionDigits: 1,
      });

const fmtPct = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("pt-BR", {
        style: "percent",
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });

const fmtRate = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `${fmtBRL(n)}/kWh`;

const MESES_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function mesIndex(mes: string | null | undefined) {
  if (!mes) return -1;
  const normalized = mes.trim().toLowerCase();
  return MESES_PT.findIndex((m) => m === normalized);
}

function periodKey(row: ConsumoRow) {
  const ano = row.ano ?? 0;
  const mesIdx = mesIndex(row.mes);
  return `${ano}-${String(mesIdx + 1).padStart(2, "0")}`;
}

function periodoLabel(row: ConsumoRow) {
  return row.mes && row.ano ? `${row.mes}/${row.ano}` : "Sem período";
}

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

function MetricCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: ReactNode;
  description?: ReactNode;
  icon: ReactNode;
}) {
  return (
    <Card size="sm" className="min-h-28">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <div className="text-muted-foreground">{icon}</div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-end gap-1">
        <div className="text-xl font-semibold leading-tight [overflow-wrap:anywhere]">
          {value}
        </div>
        {description ? (
          <div className="text-xs text-muted-foreground">{description}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Bar({
  value,
  max,
  className = "bg-primary",
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const width =
    max > 0 && value > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-2 rounded-full bg-muted">
      <div
        className={`h-full rounded-full ${className}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function EmptyAnalytics() {
  return (
    <Card>
      <CardContent className="py-6 text-sm text-muted-foreground">
        Sem dados de consumo para analisar.
      </CardContent>
    </Card>
  );
}

function ConsumoAnalytics({ rows }: { rows: ConsumoRow[] }) {
  // Opções de período (ordenado cronologicamente).
  const periodOptions = useMemo(() => {
    const periods = new Map<
      string,
      { key: string; label: string; ano: number; mesIdx: number }
    >();
    for (const row of rows) {
      const ano = row.ano ?? 0;
      const mesIdx = mesIndex(row.mes);
      if (ano <= 0 || mesIdx < 0) continue;
      periods.set(periodKey(row), {
        key: periodKey(row),
        label: periodoLabel(row),
        ano,
        mesIdx,
      });
    }
    return Array.from(periods.values()).sort(
      (a, b) => a.ano - b.ano || a.mesIdx - b.mesIdx,
    );
  }, [rows]);

  // Opções de UF (apenas as que aparecem nos dados, com contagem).
  const ufOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const uf = ufOf(row);
      if (!uf) continue;
      counts.set(uf, (counts.get(uf) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
      .map(([value, count]) => ({
        value,
        label: value,
        hint: String(count),
      }));
  }, [rows]);

  // Multi-seleção: array vazio = sem filtro (mostra tudo).
  // Default do período = mais recente, preservando comportamento anterior:
  // analytics abrem focados no último mês com dados, sem somar histórico.
  // Usuário pode marcar mais períodos ou limpar pra ver tudo.
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(() => {
    const latest = periodOptions.at(-1)?.key;
    return latest ? [latest] : [];
  });
  const [selectedUfs, setSelectedUfs] = useState<string[]>([]);

  const selectedRows = useMemo(() => {
    if (selectedPeriods.length === 0 && selectedUfs.length === 0) return rows;
    const periodSet = new Set(selectedPeriods);
    const ufSet = new Set(selectedUfs);
    return rows.filter((row) => {
      if (periodSet.size > 0 && !periodSet.has(periodKey(row))) return false;
      if (ufSet.size > 0) {
        const uf = ufOf(row);
        if (!uf || !ufSet.has(uf)) return false;
      }
      return true;
    });
  }, [rows, selectedPeriods, selectedUfs]);

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

  if (rows.length === 0) return <EmptyAnalytics />;

  const filterSummary = (() => {
    const parts: string[] = [];
    if (selectedPeriods.length === 0) parts.push("todos os períodos");
    else if (selectedPeriods.length === 1) {
      parts.push(
        periodOptions.find((p) => p.key === selectedPeriods[0])?.label ??
          selectedPeriods[0],
      );
    } else parts.push(`${selectedPeriods.length} períodos`);
    if (selectedUfs.length > 0) {
      parts.push(
        selectedUfs.length === 1
          ? `UF ${selectedUfs[0]}`
          : `${selectedUfs.length} UFs`,
      );
    }
    return parts.join(" · ");
  })();

  const periodMultiOptions = periodOptions.map((option) => ({
    value: option.key,
    label: option.label,
  }));
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
                {fmtPct(data.total > 0 ? data.ponta / data.total : null)} do
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
                {fmtPct(data.total > 0 ? data.foraPonta / data.total : null)} do
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
  filialOptions: FilialOption[];
}

export function ConsumoTable({ rows, filialOptions }: Props) {
  const fields = buildConsumoFormFields(filialOptions);
  const activeRows = useMemo(() => rows.filter((row) => !row.deletedAt), [rows]);

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
      />
    </div>
  );
}

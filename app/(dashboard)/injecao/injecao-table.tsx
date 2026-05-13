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
  PlugZap,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { DetailField } from "@/components/data-table/entity-drawer";
import { EntityPage } from "@/components/data-table/entity-page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildInjecaoFormFields,
  injecaoSchema,
  type FilialPickerOption,
  type FornecedorPickerOption,
} from "@/lib/schemas/injecao";
import type { Serialized } from "@/lib/serialize";

import * as actions from "./actions";

export type InjecaoRow = Serialized<Injecao> & {
  filial: Pick<Filial, "id" | "codigo" | "mercadoLivre"> | null;
  fornecedor: Pick<Fornecedor, "id" | "nome"> | null;
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

const fmtCompact = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const fmtRate = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "â€”"
    : n.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const fmtPct = (n: number) =>
  `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "MarÃ§o",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function mesIndex(mes: string | null | undefined) {
  if (!mes) return 99;
  const normalized = mes.trim().toLowerCase();
  const idx = MESES_PT.findIndex((m) => m.toLowerCase() === normalized);
  return idx >= 0 ? idx : 99;
}

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
        <div className="truncate text-2xl font-semibold tracking-tight">
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
  const width = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
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
        Sem dados de injeção para analisar.
      </CardContent>
    </Card>
  );
}

function InjecaoAnalytics({ rows }: { rows: InjecaoRow[] }) {
  const data = useMemo(() => {
    const totalKwh = rows.reduce((acc, row) => acc + rowKwh(row), 0);
    const totalValor = rows.reduce((acc, row) => acc + rowValor(row), 0);
    const totalValor1 = rows.reduce((acc, row) => acc + (row.valor1 ?? 0), 0);
    const totalValor2 = rows.reduce((acc, row) => acc + (row.valor2 ?? 0), 0);
    const ucs = new Set(rows.map((row) => row.uc?.trim()).filter(Boolean));

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

    for (const row of rows) {
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
      const periodKey = `${ano}-${String(mesIdx).padStart(2, "0")}`;
      const periodLabel =
        row.mes && row.ano ? `${row.mes}/${row.ano}` : "Sem período";
      const currentPeriod = periodos.get(periodKey) ?? {
        label: periodLabel,
        ano,
        mesIdx,
        kwh: 0,
        valor: 0,
      };
      currentPeriod.kwh += rowKwh(row);
      currentPeriod.valor += rowValor(row);
      periodos.set(periodKey, currentPeriod);
    }

    const fornecedoresRank = [...fornecedores.values()]
      .map((item) => ({
        ...item,
        ucsCount: item.ucs.size,
        valorPorKwh: item.kwh > 0 ? item.valor / item.kwh : null,
      }))
      .sort((a, b) => b.kwh - a.kwh);

    const periodosRank = [...periodos.values()].sort(
      (a, b) => a.ano - b.ano || a.mesIdx - b.mesIdx,
    );

    const topKwh = [...rows].sort((a, b) => rowKwh(b) - rowKwh(a)).slice(0, 5);
    const topValor = [...rows]
      .sort((a, b) => rowValor(b) - rowValor(a))
      .slice(0, 5);

    const semFornecedor = rows.filter(
      (row) => !row.fornecedor?.nome && !row.fornecedorRaw,
    ).length;
    const fornecedorSemVinculo = rows.filter(
      (row) => row.fornecedorRaw && !row.fornecedor,
    ).length;
    const filialSemVinculo = rows.filter(
      (row) => row.filialCodigoRaw && !row.filial,
    ).length;
    const semAnexo = rows.filter((row) => !row.anexoFechamento).length;
    const kwhZerado = rows.filter((row) => rowKwh(row) <= 0).length;
    const valorZerado = rows.filter((row) => rowValor(row) <= 0).length;

    return {
      totalKwh,
      totalValor,
      totalValor1,
      totalValor2,
      ucsCount: ucs.size,
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
  }, [rows]);

  if (rows.length === 0) return <EmptyAnalytics />;

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
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Injeção total"
          value={`${fmtCompact(data.totalKwh)} kWh`}
          description={`${data.ucsCount} UC(s) em ${rows.length} registro(s)`}
          icon={<PlugZap className="h-4 w-4" />}
        />
        <MetricCard
          title="Valor principal"
          value={fmtBRL(data.totalValor)}
          description={`Valor 1: ${fmtBRL(data.totalValor1)} · Valor 2: ${fmtBRL(data.totalValor2)}`}
          icon={<Banknote className="h-4 w-4" />}
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
                      {fmtBRL(item.valor)} · R$/kWh {fmtRate(item.valorPorKwh)}
                    </div>
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
}

export function InjecaoTable({
  rows,
  filialOptions,
  fornecedorOptions,
}: Props) {
  const fields = buildInjecaoFormFields(filialOptions, fornecedorOptions);
  const activeRows = useMemo(() => rows.filter((row) => !row.deletedAt), [rows]);

  return (
    <div className="flex flex-col gap-4">
      <InjecaoAnalytics rows={activeRows} />
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

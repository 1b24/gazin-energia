/**
 * Dashboard home — Tarefa 7 do BRIEF.
 *
 * Server component. Agrega métricas via `lib/dashboard.ts` (todas as
 * agregações usam scopedPrisma — gestor_filial/operacional vê apenas a
 * própria fatia). Admin pode escolher filial via `?filial=<id>`.
 */
import {
  AlertTriangle,
  FileText,
  Gauge,
  MapPin,
  Plug,
  Sun,
  TrendingUp,
  Wrench,
} from "lucide-react";
import Link from "next/link";

import { FilialFilter } from "@/components/dashboard/filial-filter";
import { GeracaoChart } from "@/components/dashboard/geracao-chart";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { OrcadoRealizadoChart } from "@/components/dashboard/orcado-realizado-chart";
import { PeriodFilter } from "@/components/dashboard/period-filter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import {
  getAlerts,
  getAtencao,
  getFilialOptions,
  getGeracaoSerie,
  getKpis,
  getOrcadoVsRealizado,
  getUsinasPorUF,
  getYearOptions,
  periodFromQuery,
} from "@/lib/dashboard";
import { serializePrisma } from "@/lib/serialize";

const fmtKwh = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (n: number | null) =>
  n == null
    ? "—"
    : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Promise<{ filial?: string; ano?: string; mes?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const sp = await searchParams;
  const filialFilter =
    session.user.role === "admin"
      ? sp.filial?.trim() || undefined
      : undefined;

  const period = periodFromQuery({ ano: sp.ano, mes: sp.mes });

  const [
    kpis,
    alerts,
    serieRaw,
    atencaoRaw,
    orcadoRealizadoRaw,
    ufsRaw,
    filialOptions,
    yearOptions,
  ] = await Promise.all([
    getKpis(filialFilter, period),
    getAlerts(filialFilter),
    getGeracaoSerie(filialFilter, period),
    getAtencao(filialFilter, period),
    getOrcadoVsRealizado(filialFilter),
    getUsinasPorUF(filialFilter),
    getFilialOptions(),
    getYearOptions(filialFilter),
  ]);

  const serie = serializePrisma(serieRaw) as typeof serieRaw;
  const orcadoRealizado = serializePrisma(
    orcadoRealizadoRaw,
  ) as typeof orcadoRealizadoRaw;
  const atencao = serializePrisma(atencaoRaw) as typeof atencaoRaw;
  const ufs = serializePrisma(ufsRaw) as typeof ufsRaw;

  const variant: "success" | "warning" | "destructive" | "default" =
    kpis.geracaoPctAtingido == null
      ? "default"
      : kpis.geracaoPctAtingido >= 100
        ? "success"
        : kpis.geracaoPctAtingido >= 80
          ? "default"
          : "destructive";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            Período: {period.mesPt}/{period.ano}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter
            ano={period.ano}
            mes={period.mesIdx + 1}
            yearOptions={yearOptions}
          />
          {session.user.role === "admin" && filialOptions.length > 0 && (
            <FilialFilter options={filialOptions} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Geração realizada"
          value={`${fmtKwh(kpis.geracaoRealizadaKwh)} kWh`}
          subtitle={
            <span>
              Meta: {fmtKwh(kpis.geracaoMetaKwh)} kWh ·{" "}
              <strong>{fmtPct(kpis.geracaoPctAtingido)}</strong>
            </span>
          }
          icon={<Sun className="h-4 w-4" />}
          variant={variant}
        />
        <KpiCard
          label="Faturamento venda KWh"
          value={fmtBRL(kpis.faturamentoVendaReais)}
          subtitle={`No mês de ${period.mesPt}`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          label="Consumo total"
          value={`${fmtKwh(kpis.consumoTotalKwh)} kWh`}
          subtitle={`No mês de ${period.mesPt}`}
          icon={<Plug className="h-4 w-4" />}
        />
        <KpiCard
          label="Usinas operacionais"
          value={kpis.usinasOperacionais}
          subtitle="Status = operacional"
          icon={<Gauge className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <AlertCard
          title="Licenças vencendo"
          icon={<FileText className="h-4 w-4" />}
          count={alerts.licencasVencendo}
          href="/juridico/licencas"
          empty="Nenhuma — módulo Licenças aguarda JSON."
          subtitle="≤ 30 dias (proxy: total ativas)"
        />
        <AlertCard
          title="Manutenções abertas"
          icon={<Wrench className="h-4 w-4" />}
          count={alerts.manutencoesAbertas}
          href="/manutencao/preventiva"
          empty="Nenhuma manutenção em aberto."
          subtitle="Corretivas + Preventivas pendentes/em andamento"
        />
        <AlertCard
          title="Processos jurídicos"
          icon={<AlertTriangle className="h-4 w-4" />}
          count={alerts.processosAtencao}
          href="/juridico/processos"
          empty={
            filialFilter
              ? "Sem vínculo de processo com filial específica."
              : "Nenhum processo judicial ativo."
          }
          subtitle="Tipo = judicial, ativos"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Geração — últimos 12 meses
          </CardTitle>
        </CardHeader>
        <CardContent>
          <GeracaoChart data={serie} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Atenção — usinas abaixo de 80% da meta
            </CardTitle>
          </CardHeader>
          <CardContent>
            {atencao.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">
                Nenhuma usina abaixo da meta no mês corrente.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 text-left">Usina</th>
                      <th className="px-3 py-1.5 text-right">Realizado</th>
                      <th className="px-3 py-1.5 text-right">Meta</th>
                      <th className="px-3 py-1.5 text-right">% atingido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {atencao.map((r, i) => (
                      <tr
                        key={`${r.usinaId ?? "-"}-${i}`}
                        className="border-t"
                      >
                        <td className="px-3 py-1.5">{r.usinaNome}</td>
                        <td className="px-3 py-1.5 text-right">
                          {fmtKwh(r.realizadoKwh)}
                        </td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">
                          {fmtKwh(r.metaKwh)}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <Badge
                            variant={
                              r.pctAtingido >= 50
                                ? "secondary"
                                : "destructive"
                            }
                          >
                            {fmtPct(r.pctAtingido)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Orçado vs Realizado (R$ por mês)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OrcadoRealizadoChart data={orcadoRealizado} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" /> Usinas por UF
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Substituto da renderização de mapa Brasil — distribuição por estado e
            status.
          </p>
        </CardHeader>
        <CardContent>
          {ufs.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              Sem usinas no escopo atual.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {ufs.map((u) => (
                <div
                  key={u.uf}
                  className="rounded-md border bg-muted/20 px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{u.uf}</span>
                    <span className="text-xs text-muted-foreground">
                      {u.total}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
                    {u.operacionais > 0 && (
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-600">
                        op {u.operacionais}
                      </span>
                    )}
                    {u.manutencao > 0 && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-600">
                        manut {u.manutencao}
                      </span>
                    )}
                    {u.emImplantacao > 0 && (
                      <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-blue-600">
                        impl {u.emImplantacao}
                      </span>
                    )}
                    {u.desativadas > 0 && (
                      <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-destructive">
                        desat {u.desativadas}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AlertCard({
  title,
  icon,
  count,
  href,
  empty,
  subtitle,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  href: string;
  empty: string;
  subtitle?: string;
}) {
  const accent =
    count === 0
      ? "text-muted-foreground"
      : count > 5
        ? "text-destructive"
        : "text-amber-600";
  return (
    <Card>
      <CardContent className="flex flex-col gap-1.5 py-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            {title}
          </p>
          <div className="text-muted-foreground">{icon}</div>
        </div>
        <Link
          href={href}
          className={`text-2xl font-semibold tracking-tight hover:underline ${accent}`}
        >
          {count}
        </Link>
        <p className="text-xs text-muted-foreground">
          {count === 0 ? empty : subtitle}
        </p>
      </CardContent>
    </Card>
  );
}

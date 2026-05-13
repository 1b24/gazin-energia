/**
 * Agregações relacionadas a Geração:
 *  - `getGeracaoSerie` — janela de 12 meses para gráfico de linha.
 *  - `getAtencao` — usinas com geração < 80% da meta no mês corrente.
 */
import { retryClosedConnection } from "@/lib/db";
import {
  MESES_PT,
  getCurrentPeriod,
  last12MonthsEndingAt,
  type CurrentPeriod,
} from "@/lib/period";

import {
  concessionariaNome,
  getDb,
  metaMensalGeracao,
  scopeWhere,
  sumDias,
} from "./scope";

// ----------------------------------------------------------------------------
// Série de geração — últimos 12 meses
// ----------------------------------------------------------------------------

export interface GeracaoSeriePoint {
  /** "MM/YY" ex: "05/26" */
  label: string;
  ano: number;
  mes: string; // "Janeiro".."Dezembro"
  realizadoKwh: number;
  metaKwh: number;
}

export async function getGeracaoSerie(
  filialFilter?: string,
  period?: CurrentPeriod,
  ufFilter?: string,
): Promise<GeracaoSeriePoint[]> {
  const { db } = await getDb(filialFilter);
  const window = last12MonthsEndingAt(period);

  const anos = Array.from(new Set(window.map((w) => w.ano)));
  const geracoes = await retryClosedConnection(() =>
    db.geracao.findMany({
      where: {
        ano: { in: anos },
        deletedAt: null,
        ...scopeWhere("usina", filialFilter, ufFilter),
      },
      select: {
        ano: true,
        mes: true,
        metaMensal: true,
        dias: { select: { kwh: true } },
      },
    }),
  );

  // Indexa por (ano, mesIdx) → soma realizado, soma meta.
  const map = new Map<string, { real: number; meta: number }>();
  for (const g of geracoes) {
    const mesIdx = (MESES_PT as readonly string[]).indexOf(g.mes ?? "");
    if (mesIdx < 0 || g.ano == null) continue;
    const key = `${g.ano}-${mesIdx}`;
    const cur = map.get(key) ?? { real: 0, meta: 0 };
    cur.real += sumDias(g.dias);
    cur.meta += metaMensalGeracao(g.metaMensal, g.ano, g.mes);
    map.set(key, cur);
  }

  return window.map(({ ano, mesIdx }) => {
    const v = map.get(`${ano}-${mesIdx}`) ?? { real: 0, meta: 0 };
    return {
      label: `${String(mesIdx + 1).padStart(2, "0")}/${String(ano).slice(-2)}`,
      ano,
      mes: MESES_PT[mesIdx],
      realizadoKwh: v.real,
      metaKwh: v.meta,
    };
  });
}

// ----------------------------------------------------------------------------
// Tabela Atenção — usinas com geração < 80% da meta no mês corrente
// ----------------------------------------------------------------------------

export interface AtencaoRow {
  usinaId: string | null;
  usinaNome: string;
  realizadoKwh: number;
  metaKwh: number;
  pctAtingido: number;
}

export async function getAtencao(
  filialFilter?: string,
  period?: CurrentPeriod,
  ufFilter?: string,
  concessionariaFilter?: string,
): Promise<AtencaoRow[]> {
  const { db } = await getDb(filialFilter);
  const p = period ?? getCurrentPeriod();

  // Quando filtra por concessionária, restringe às filiais que recebem
  // injeção dessa concessionária no período.
  let concessionariaFilialIds: string[] | undefined;
  if (concessionariaFilter) {
    const injecoes = await db.injecao.findMany({
      where: {
        ano: p.ano,
        mes: p.mesPt,
        deletedAt: null,
        ...scopeWhere("filial", filialFilter, ufFilter),
      },
      select: {
        filialId: true,
        fornecedor: { select: { nome: true } },
        fornecedorRaw: true,
      },
    });

    concessionariaFilialIds = Array.from(
      new Set(
        injecoes
          .filter((i) => concessionariaNome(i) === concessionariaFilter)
          .map((i) => i.filialId)
          .filter((id): id is string => !!id),
      ),
    );

    if (concessionariaFilialIds.length === 0) return [];
  }

  const geracoes = await retryClosedConnection(() =>
    db.geracao.findMany({
      where: {
        ano: p.ano,
        mes: p.mesPt,
        deletedAt: null,
        metaMensal: { not: null, gt: 0 },
        AND: [
          scopeWhere("usina", filialFilter, ufFilter),
          ...(concessionariaFilialIds
            ? [{ usina: { filialId: { in: concessionariaFilialIds } } }]
            : []),
        ],
      },
      select: {
        ano: true,
        mes: true,
        usinaId: true,
        metaMensal: true,
        usina: { select: { nome: true } },
        nomeUsinaRaw: true,
        dias: { select: { kwh: true } },
      },
    }),
  );

  const rows: AtencaoRow[] = geracoes.map((g) => {
    const real = sumDias(g.dias);
    const meta = metaMensalGeracao(g.metaMensal, g.ano, g.mes);
    const pct = meta > 0 ? (real / meta) * 100 : 0;
    return {
      usinaId: g.usinaId,
      usinaNome: g.usina?.nome ?? g.nomeUsinaRaw ?? "—",
      realizadoKwh: real,
      metaKwh: meta,
      pctAtingido: pct,
    };
  });

  return rows
    .filter((r) => r.pctAtingido < 80)
    .sort((a, b) => a.pctAtingido - b.pctAtingido);
}

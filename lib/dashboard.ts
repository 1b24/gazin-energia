/**
 * Agregações server-side do dashboard. Cada função aplica `scopedPrisma` —
 * gestor_filial / operacional só vê números do próprio escopo; admin vê tudo
 * a menos que `filialId` venha como filtro explícito.
 *
 * Convenções de mês:
 *   - Geracao.mes = "Janeiro".."Dezembro"   (label pt-BR)
 *   - Consumo.mes = "Janeiro".."Dezembro"   (label pt-BR)
 *   - VendaKwh.mes = "01".."12"              (zero-padded)
 *   - Orcamento.mes = "Janeiro".."Dezembro"  (label pt-BR)
 *
 * "Mês corrente" usa `new Date()` em runtime — dados da fonte legada são
 * todos de 2026, então em 2026 funciona naturalmente; em outros anos os
 * cards podem ficar vazios. Não inventamos dados.
 */
import { auth } from "@/lib/auth";
import { retryClosedConnection, scopedPrisma } from "@/lib/db";
import {
  MESES_PT,
  getCurrentPeriod,
  last12MonthsEndingAt,
  makePeriod,
  periodFromQuery,
  type CurrentPeriod,
} from "@/lib/period";

// Re-export para preservar a API pública atual (vários consumidores fazem
// `import { MESES_PT, periodFromQuery, ... } from "@/lib/dashboard"`).
// Tipos e funções moraram aqui historicamente; agora vivem em `lib/period.ts`.
export {
  MESES_PT,
  getCurrentPeriod,
  last12MonthsEndingAt,
  makePeriod,
  periodFromQuery,
};
export type { CurrentPeriod };

async function getDb(filialFilter?: string) {
  const session = await auth();
  const db = scopedPrisma(session?.user);
  return { db, session, filialFilter };
}

/**
 * Helper: monta a parte do `where` que aplica filtros de Filial e UF de
 * acordo com a ligação da entidade ao mundo real.
 *  - 'self'   → entidade tem `filialId` E `uf` próprios (Filial, Usina).
 *  - 'usina'  → entidade liga via `usina.filialId / usina.uf` (Geracao,
 *               VendaKwh, Orcamento, CronogramaLimpeza, ManutencaoPreventiva).
 *  - 'filial' → entidade liga via `filial.filialId / filial.uf` (Consumo,
 *               Injecao, Fornecedor com abrangencia).
 */
function scopeWhere(
  via: "self" | "usina" | "filial",
  filialFilter?: string,
  ufFilter?: string,
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (via === "self") {
    if (filialFilter) where.filialId = filialFilter;
    if (ufFilter) where.uf = ufFilter;
  } else if (via === "usina") {
    const usina: Record<string, unknown> = {};
    if (filialFilter) usina.filialId = filialFilter;
    if (ufFilter) usina.uf = ufFilter;
    if (Object.keys(usina).length) where.usina = usina;
  } else if (via === "filial") {
    if (filialFilter) where.filialId = filialFilter;
    if (ufFilter) where.filial = { uf: ufFilter };
  }
  return where;
}

// ----------------------------------------------------------------------------
// KPIs
// ----------------------------------------------------------------------------

export interface DashboardKpis {
  geracaoRealizadaKwh: number;
  geracaoMetaKwh: number;
  geracaoPctAtingido: number | null;
  faturamentoVendaReais: number;
  consumoTotalKwh: number;
  consumoPontaKwh: number;
  consumoForaPontaKwh: number;
  usinasOperacionais: number;
}

function sumDias(
  dias: { kwh: { toNumber(): number } | number | null }[],
): number {
  return dias.reduce((a, d) => {
    if (d.kwh == null) return a;
    const n = typeof d.kwh === "number" ? d.kwh : d.kwh.toNumber();
    return a + n;
  }, 0);
}

function decimalToNumber(
  v: { toNumber(): number } | number | null | undefined,
): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : v.toNumber();
}

function diasNoMes(
  ano: number | null | undefined,
  mes: string | null | undefined,
) {
  const mesIdx = (MESES_PT as readonly string[]).indexOf(mes ?? "");
  if (ano == null || mesIdx < 0) return 31;
  return new Date(ano, mesIdx + 1, 0).getDate();
}

function metaMensalGeracao(
  metaDiaria: { toNumber(): number } | number | null | undefined,
  ano: number | null | undefined,
  mes: string | null | undefined,
): number {
  return decimalToNumber(metaDiaria) * diasNoMes(ano, mes);
}

function concessionariaNome(row: {
  fornecedor?: { nome: string | null } | null;
  fornecedorRaw?: string | null;
}) {
  return row.fornecedor?.nome?.trim() || row.fornecedorRaw?.trim() || "";
}

// `retryClosedConnection` agora vive em `lib/db.ts` (DB concern, não dashboard).

export async function getKpis(
  filialFilter?: string,
  period?: CurrentPeriod,
  ufFilter?: string,
): Promise<DashboardKpis> {
  const { db } = await getDb(filialFilter);
  const p = period ?? getCurrentPeriod();

  // Geração: filtra por mes pt-BR, agrega kWh dos dias, soma metas.
  const geracoes = await retryClosedConnection(() =>
    db.geracao.findMany({
      where: {
        ano: p.ano,
        mes: p.mesPt,
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
  const geracaoRealizadaKwh = geracoes.reduce(
    (acc, g) => acc + sumDias(g.dias),
    0,
  );
  const geracaoMetaKwh = geracoes.reduce(
    (acc, g) => acc + metaMensalGeracao(g.metaMensal, g.ano, g.mes),
    0,
  );
  const geracaoPctAtingido =
    geracaoMetaKwh > 0 ? (geracaoRealizadaKwh / geracaoMetaKwh) * 100 : null;

  // Faturamento de venda — VendaKwh usa "01".."12".
  const vendas = await db.vendaKwh.findMany({
    where: {
      ano: p.ano,
      mes: p.mesNum,
      deletedAt: null,
      ...scopeWhere("usina", filialFilter, ufFilter),
    },
    select: { valorReais: true },
  });
  const faturamentoVendaReais = vendas.reduce(
    (acc, v) => acc + decimalToNumber(v.valorReais),
    0,
  );

  // Consumo total do mês.
  const consumos = await db.consumo.findMany({
    where: {
      ano: p.ano,
      mes: p.mesPt,
      deletedAt: null,
      ...scopeWhere("filial", filialFilter, ufFilter),
    },
    select: { consumoTotal: true, consumoKwhP: true, consumoKwhFp: true },
  });
  const consumoTotalKwh = consumos.reduce(
    (acc, c) => acc + decimalToNumber(c.consumoTotal),
    0,
  );
  const consumoPontaKwh = consumos.reduce(
    (acc, c) => acc + decimalToNumber(c.consumoKwhP),
    0,
  );
  const consumoForaPontaKwh = consumos.reduce(
    (acc, c) => acc + decimalToNumber(c.consumoKwhFp),
    0,
  );

  // Usinas operacionais — não-deletadas, status = "operacional".
  const usinasOperacionais = await db.usina.count({
    where: {
      status: "operacional",
      deletedAt: null,
      ...scopeWhere("self", filialFilter, ufFilter),
    },
  });

  return {
    geracaoRealizadaKwh,
    geracaoMetaKwh,
    geracaoPctAtingido,
    faturamentoVendaReais,
    consumoTotalKwh,
    consumoPontaKwh,
    consumoForaPontaKwh,
    usinasOperacionais,
  };
}

// ----------------------------------------------------------------------------
// Alertas
// ----------------------------------------------------------------------------

export interface DashboardAlerts {
  /** Licenças com vencimento ≤ 30 dias (stub: model existe mas vazio). */
  licencasVencendo: number;
  /**
   * Manutenções "em aberto" — corretivas (stub) + preventivas pendentes ou em
   * andamento. Conta proxy enquanto Corretiva não tem JSON.
   */
  manutencoesAbertas: number;
  /**
   * Processos com "atenção" — Judicial em aberto (não soft-deleted). Sem
   * campo de prazo no schema atual; uso `dataProtocolo` como referência.
   */
  processosAtencao: number;
}

export async function getAlerts(
  filialFilter?: string,
  ufFilter?: string,
): Promise<DashboardAlerts> {
  const { db } = await getDb(filialFilter);

  // Licenças (stub) — count atual será 0 até JSON chegar.
  const licencasVencendo = await db.licenca.count({
    where: {
      deletedAt: null,
      ...scopeWhere("usina", filialFilter, ufFilter),
    },
  });

  const corretivas = await db.manutencaoCorretiva.count({
    where: {
      deletedAt: null,
      ...scopeWhere("usina", filialFilter, ufFilter),
    },
  });
  const preventivasAbertas = await db.manutencaoPreventiva.count({
    where: {
      status: { in: ["pendente", "em_andamento"] },
      deletedAt: null,
      ...scopeWhere("usina", filialFilter, ufFilter),
    },
  });
  const manutencoesAbertas = corretivas + preventivasAbertas;

  // Processos: ProcessoJuridico não tem FK de filial nem UF — só agrega
  // quando não há filtro de escopo. Para qualquer filtro (filial ou UF),
  // mostramos 0 já que não há vínculo formal.
  const processosAtencao =
    filialFilter || ufFilter
      ? 0
      : await db.processoJuridico.count({
          where: { tipo: "judicial", deletedAt: null },
        });

  return { licencasVencendo, manutencoesAbertas, processosAtencao };
}

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

// ----------------------------------------------------------------------------
// Orçado vs Realizado (últimos 6 meses)
// ----------------------------------------------------------------------------

export interface OrcadoRealizadoPoint {
  mes: string; // "Janeiro"..
  orcadoReais: number;
  realizadoReais: number;
}

export async function getOrcadoVsRealizado(
  filialFilter?: string,
  ufFilter?: string,
): Promise<OrcadoRealizadoPoint[]> {
  const { db } = await getDb(filialFilter);
  const orcamentos = await db.orcamento.findMany({
    where: {
      deletedAt: null,
      ...scopeWhere("usina", filialFilter, ufFilter),
    },
    select: {
      mes: true,
      usoConsumo: true,
      realUsoConsumo: true,
      realEquipamentos: true,
      realViagensEstadias: true,
    },
  });

  const map = new Map<string, { orc: number; real: number }>();
  for (const o of orcamentos) {
    if (!o.mes) continue;
    const cur = map.get(o.mes) ?? { orc: 0, real: 0 };
    cur.orc += decimalToNumber(o.usoConsumo);
    cur.real +=
      decimalToNumber(o.realUsoConsumo) +
      decimalToNumber(o.realEquipamentos) +
      decimalToNumber(o.realViagensEstadias);
    map.set(o.mes, cur);
  }

  // Ordena por índice do mês.
  return Array.from(map.entries())
    .map(([mes, v]) => ({ mes, orcadoReais: v.orc, realizadoReais: v.real }))
    .sort(
      (a, b) =>
        (MESES_PT as readonly string[]).indexOf(a.mes) -
        (MESES_PT as readonly string[]).indexOf(b.mes),
    );
}

// ----------------------------------------------------------------------------
// Usinas por UF — substituto do mapa Brasil
// ----------------------------------------------------------------------------

export interface UfBucket {
  uf: string;
  total: number;
  operacionais: number;
  manutencao: number;
  desativadas: number;
  emImplantacao: number;
}

export async function getUsinasPorUF(
  filialFilter?: string,
  ufFilter?: string,
): Promise<UfBucket[]> {
  const { db } = await getDb(filialFilter);
  const usinas = await db.usina.findMany({
    where: {
      deletedAt: null,
      uf: ufFilter ? (ufFilter as never) : { not: null },
      ...(filialFilter ? { filialId: filialFilter } : {}),
    },
    select: { uf: true, status: true },
  });

  const buckets = new Map<string, UfBucket>();
  for (const u of usinas) {
    if (!u.uf) continue;
    const cur =
      buckets.get(u.uf) ??
      ({
        uf: u.uf,
        total: 0,
        operacionais: 0,
        manutencao: 0,
        desativadas: 0,
        emImplantacao: 0,
      } as UfBucket);
    cur.total++;
    if (u.status === "operacional") cur.operacionais++;
    else if (u.status === "manutencao") cur.manutencao++;
    else if (u.status === "desativada") cur.desativadas++;
    else if (u.status === "em_implantacao") cur.emImplantacao++;
    buckets.set(u.uf, cur);
  }

  return Array.from(buckets.values()).sort((a, b) => b.total - a.total);
}

// ----------------------------------------------------------------------------
// Injeção por Concessionária (Fornecedor) — mês corrente
// ----------------------------------------------------------------------------

export interface ConcessionariaRow {
  /** Nome canônico do fornecedor; "Não informada" quando ausente. */
  nome: string;
  ucs: number;
  injetadoKwh: number;
  valorReais: number;
  consumoKwh: number;
}

/**
 * Agrega Injeção (kWh injetado, R$) e Consumo associado pela mesma janela
 * (ano/mês), agrupando por concessionária — usa `fornecedor.nome` quando
 * disponível, caindo em `fornecedorRaw`. Consumo não tem FK de fornecedor;
 * cruzamos via `filialId + ano + mes` das UCs presentes em Injeção.
 */
export async function getInjecaoPorConcessionaria(
  filialFilter?: string,
  period?: CurrentPeriod,
  ufFilter?: string,
  concessionariaFilter?: string,
): Promise<ConcessionariaRow[]> {
  const { db } = await getDb(filialFilter);
  const p = period ?? getCurrentPeriod();

  const injecoes = await db.injecao.findMany({
    where: {
      ano: p.ano,
      mes: p.mesPt,
      deletedAt: null,
      ...scopeWhere("filial", filialFilter, ufFilter),
    },
    select: {
      uc: true,
      consumoTotalKwh: true,
      valor: true,
      filialId: true,
      fornecedor: { select: { nome: true } },
      fornecedorRaw: true,
    },
  });

  const filialIds = Array.from(
    new Set(injecoes.map((i) => i.filialId).filter((v): v is string => !!v)),
  );

  const consumos =
    filialIds.length > 0
      ? await db.consumo.findMany({
          where: {
            ano: p.ano,
            mes: p.mesPt,
            deletedAt: null,
            filialId: { in: filialIds },
            ...scopeWhere("filial", filialFilter, ufFilter),
          },
          select: { uc: true, filialId: true, consumoTotal: true },
        })
      : [];

  // Chave composta `uc|filialId` — UC sozinha pode repetir entre filiais e o
  // ano/mês já estão fixos no `where` acima. Sem `filialId` o mesmo consumo
  // era atribuído a múltiplas concessionárias quando UCs colidiam.
  const consumoByKey = new Map<string, number>();
  for (const c of consumos) {
    if (!c.uc || !c.filialId) continue;
    const key = `${c.uc}|${c.filialId}`;
    consumoByKey.set(
      key,
      (consumoByKey.get(key) ?? 0) + decimalToNumber(c.consumoTotal),
    );
  }

  const buckets = new Map<string, ConcessionariaRow>();
  for (const i of injecoes) {
    const nome =
      i.fornecedor?.nome?.trim() || i.fornecedorRaw?.trim() || "Não informada";
    if (concessionariaFilter && nome !== concessionariaFilter) continue;

    const cur =
      buckets.get(nome) ??
      ({
        nome,
        ucs: 0,
        injetadoKwh: 0,
        valorReais: 0,
        consumoKwh: 0,
      } as ConcessionariaRow);
    cur.ucs += 1;
    cur.injetadoKwh += decimalToNumber(i.consumoTotalKwh);
    cur.valorReais += decimalToNumber(i.valor);
    if (i.uc && i.filialId) {
      cur.consumoKwh += consumoByKey.get(`${i.uc}|${i.filialId}`) ?? 0;
    }
    buckets.set(nome, cur);
  }

  return Array.from(buckets.values()).sort(
    (a, b) => b.injetadoKwh - a.injetadoKwh,
  );
}

/**
 * Concessionárias distintas com Injeção no escopo do usuário — alimenta o
 * dropdown de filtro.
 */
export async function getConcessionariaOptions(
  filialFilter?: string,
): Promise<string[]> {
  const { db } = await getDb(filialFilter);
  const rows = await db.injecao.findMany({
    where: {
      deletedAt: null,
      ...(filialFilter ? { filialId: filialFilter } : {}),
    },
    select: {
      fornecedor: { select: { nome: true } },
      fornecedorRaw: true,
    },
  });
  const set = new Set<string>();
  for (const r of rows) {
    const nome = r.fornecedor?.nome?.trim() || r.fornecedorRaw?.trim() || "";
    if (nome) set.add(nome);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// ----------------------------------------------------------------------------
// Filiais disponíveis (pra dropdown do admin)
// ----------------------------------------------------------------------------

export interface FilialOption {
  id: string;
  label: string;
}

/**
 * UFs distintas com dados (Usina ou Filial) no escopo do usuário —
 * alimenta o dropdown de UF.
 */
export async function getUfOptions(filialFilter?: string): Promise<string[]> {
  const { db } = await getDb(filialFilter);
  const u = await retryClosedConnection(() =>
    db.usina.findMany({
      where: {
        deletedAt: null,
        uf: { not: null },
        ...(filialFilter ? { filialId: filialFilter } : {}),
      },
      select: { uf: true },
      distinct: ["uf"],
    }),
  );
  const f = await retryClosedConnection(() =>
    db.filial.findMany({
      where: {
        deletedAt: null,
        uf: { not: null },
        ...(filialFilter ? { id: filialFilter } : {}),
      },
      select: { uf: true },
      distinct: ["uf"],
    }),
  );
  const set = new Set<string>();
  for (const r of u) if (r.uf) set.add(r.uf);
  for (const r of f) if (r.uf) set.add(r.uf);
  return Array.from(set).sort();
}

/**
 * Anos com dados de Geração ou Consumo no escopo atual — alimenta o
 * dropdown de período. Sempre inclui o ano corrente como fallback.
 */
export async function getYearOptions(filialFilter?: string): Promise<number[]> {
  const { db } = await getDb(filialFilter);
  const g = await retryClosedConnection(() =>
    db.geracao.findMany({
      where: {
        ano: { not: null },
        deletedAt: null,
        ...(filialFilter ? { usina: { filialId: filialFilter } } : {}),
      },
      select: { ano: true },
      distinct: ["ano"],
    }),
  );
  const c = await db.consumo.findMany({
    where: {
      ano: { not: null },
      deletedAt: null,
      ...(filialFilter ? { filialId: filialFilter } : {}),
    },
    select: { ano: true },
    distinct: ["ano"],
  });
  const set = new Set<number>([new Date().getFullYear()]);
  for (const r of g) if (r.ano != null) set.add(r.ano);
  for (const r of c) if (r.ano != null) set.add(r.ano);
  return Array.from(set).sort((a, b) => b - a);
}

export async function getFilialOptions(): Promise<FilialOption[]> {
  const session = await auth();
  if (session?.user?.role !== "admin") return [];
  const filiais = await scopedPrisma(session.user).filial.findMany({
    where: {
      deletedAt: null,
      // Só filiais com pelo menos 1 usina — reduz ruído no dropdown.
      usinas: { some: {} },
    },
    select: { id: true, codigo: true, mercadoLivre: true },
    orderBy: [{ codigo: "asc" }, { mercadoLivre: "asc" }],
  });
  return filiais.map((f) => ({
    id: f.id,
    label:
      [f.codigo, f.mercadoLivre].filter(Boolean).join(" — ") ||
      `Filial ${f.id.slice(0, 6)}`,
  }));
}

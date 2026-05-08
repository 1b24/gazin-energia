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
import { scopedPrisma } from "@/lib/db";

export const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export interface CurrentPeriod {
  ano: number;
  /** índice 0..11 */
  mesIdx: number;
  /** "Janeiro".."Dezembro" */
  mesPt: string;
  /** "01".."12" */
  mesNum: string;
}

export function getCurrentPeriod(): CurrentPeriod {
  const d = new Date();
  const mesIdx = d.getMonth();
  return {
    ano: d.getFullYear(),
    mesIdx,
    mesPt: MESES_PT[mesIdx],
    mesNum: String(mesIdx + 1).padStart(2, "0"),
  };
}

/** Retorna a janela de últimos 12 meses (mais antigo → mais recente). */
export function last12Months(): { ano: number; mesIdx: number }[] {
  const now = new Date();
  const out: { ano: number; mesIdx: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ ano: d.getFullYear(), mesIdx: d.getMonth() });
  }
  return out;
}

async function getDb(filialFilter?: string) {
  const session = await auth();
  const db = scopedPrisma(session?.user);
  return { db, session, filialFilter };
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
  usinasOperacionais: number;
}

function sumDias(dias: { kwh: { toNumber(): number } | number | null }[]): number {
  return dias.reduce((a, d) => {
    if (d.kwh == null) return a;
    const n = typeof d.kwh === "number" ? d.kwh : d.kwh.toNumber();
    return a + n;
  }, 0);
}

function decimalToNumber(v: { toNumber(): number } | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : v.toNumber();
}

export async function getKpis(filialFilter?: string): Promise<DashboardKpis> {
  const { db } = await getDb(filialFilter);
  const p = getCurrentPeriod();

  // Geração: filtra por mes pt-BR, agrega kWh dos dias, soma metas.
  const geracoes = await db.geracao.findMany({
    where: {
      ano: p.ano,
      mes: p.mesPt,
      deletedAt: null,
      ...(filialFilter ? { usina: { filialId: filialFilter } } : {}),
    },
    select: {
      metaMensal: true,
      dias: { select: { kwh: true } },
    },
  });
  const geracaoRealizadaKwh = geracoes.reduce(
    (acc, g) => acc + sumDias(g.dias),
    0,
  );
  const geracaoMetaKwh = geracoes.reduce(
    (acc, g) => acc + decimalToNumber(g.metaMensal),
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
      ...(filialFilter ? { usina: { filialId: filialFilter } } : {}),
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
      ...(filialFilter ? { filialId: filialFilter } : {}),
    },
    select: { consumoTotal: true },
  });
  const consumoTotalKwh = consumos.reduce(
    (acc, c) => acc + decimalToNumber(c.consumoTotal),
    0,
  );

  // Usinas operacionais — não-deletadas, status = "operacional".
  const usinasOperacionais = await db.usina.count({
    where: {
      status: "operacional",
      deletedAt: null,
      ...(filialFilter ? { filialId: filialFilter } : {}),
    },
  });

  return {
    geracaoRealizadaKwh,
    geracaoMetaKwh,
    geracaoPctAtingido,
    faturamentoVendaReais,
    consumoTotalKwh,
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

export async function getAlerts(filialFilter?: string): Promise<DashboardAlerts> {
  const { db } = await getDb(filialFilter);

  // Licenças (stub) — count atual será 0 até JSON chegar.
  const licencasVencendo = await db.licenca.count({
    where: {
      deletedAt: null,
      ...(filialFilter ? { usina: { filialId: filialFilter } } : {}),
    },
  });

  const corretivas = await db.manutencaoCorretiva.count({
    where: {
      deletedAt: null,
      ...(filialFilter ? { usina: { filialId: filialFilter } } : {}),
    },
  });
  const preventivasAbertas = await db.manutencaoPreventiva.count({
    where: {
      status: { in: ["pendente", "em_andamento"] },
      deletedAt: null,
      ...(filialFilter ? { usina: { filialId: filialFilter } } : {}),
    },
  });
  const manutencoesAbertas = corretivas + preventivasAbertas;

  // Processos: ProcessoJuridico não tem FK de filial — count global ou
  // skip pra não-admin? Sem filial-link, mostramos só para admin (sem
  // filialFilter). Pra gestor_filial mostramos 0 (já que não há vínculo).
  const processosAtencao = filialFilter
    ? 0
    : await db.processoJuridico.count({
        where: {
          tipo: "judicial",
          deletedAt: null,
        },
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
): Promise<GeracaoSeriePoint[]> {
  const { db } = await getDb(filialFilter);
  const window = last12Months();

  // Coleta as geracoes que caem na janela (geracao.ano = qualquer da janela).
  const anos = Array.from(new Set(window.map((w) => w.ano)));
  const geracoes = await db.geracao.findMany({
    where: {
      ano: { in: anos },
      deletedAt: null,
      ...(filialFilter ? { usina: { filialId: filialFilter } } : {}),
    },
    select: {
      ano: true,
      mes: true,
      metaMensal: true,
      dias: { select: { kwh: true } },
    },
  });

  // Indexa por (ano, mesIdx) → soma realizado, soma meta.
  const map = new Map<string, { real: number; meta: number }>();
  for (const g of geracoes) {
    const mesIdx = (MESES_PT as readonly string[]).indexOf(g.mes ?? "");
    if (mesIdx < 0 || g.ano == null) continue;
    const key = `${g.ano}-${mesIdx}`;
    const cur = map.get(key) ?? { real: 0, meta: 0 };
    cur.real += sumDias(g.dias);
    cur.meta += decimalToNumber(g.metaMensal);
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

export async function getAtencao(filialFilter?: string): Promise<AtencaoRow[]> {
  const { db } = await getDb(filialFilter);
  const p = getCurrentPeriod();

  const geracoes = await db.geracao.findMany({
    where: {
      ano: p.ano,
      mes: p.mesPt,
      deletedAt: null,
      metaMensal: { not: null, gt: 0 },
      ...(filialFilter ? { usina: { filialId: filialFilter } } : {}),
    },
    select: {
      usinaId: true,
      metaMensal: true,
      usina: { select: { nome: true } },
      nomeUsinaRaw: true,
      dias: { select: { kwh: true } },
    },
  });

  const rows: AtencaoRow[] = geracoes.map((g) => {
    const real = sumDias(g.dias);
    const meta = decimalToNumber(g.metaMensal);
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
): Promise<OrcadoRealizadoPoint[]> {
  const { db } = await getDb(filialFilter);
  // Source só tem 2026; agrega tudo no ano.
  const orcamentos = await db.orcamento.findMany({
    where: {
      deletedAt: null,
      ...(filialFilter ? { usina: { filialId: filialFilter } } : {}),
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
      (a, b) => (MESES_PT as readonly string[]).indexOf(a.mes) - (MESES_PT as readonly string[]).indexOf(b.mes),
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
): Promise<UfBucket[]> {
  const { db } = await getDb(filialFilter);
  const usinas = await db.usina.findMany({
    where: {
      deletedAt: null,
      uf: { not: null },
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
// Filiais disponíveis (pra dropdown do admin)
// ----------------------------------------------------------------------------

export interface FilialOption {
  id: string;
  label: string;
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

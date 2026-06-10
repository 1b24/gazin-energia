/**
 * KPIs principais do dashboard — geração, faturamento, consumo, usinas
 * operacionais. Filtros: filial, período, UF.
 */
import { retryClosedConnection } from "@/lib/db";
import { getCurrentPeriod, type CurrentPeriod } from "@/lib/period";

import {
  decimalToNumber,
  getDb,
  metaMensalGeracao,
  scopeWhere,
  sumDias,
} from "./scope";

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

export async function getKpis(
  filialFilter?: string,
  period?: CurrentPeriod,
  ufFilter?: string,
): Promise<DashboardKpis> {
  const { db } = await getDb(filialFilter);
  const p = period ?? getCurrentPeriod();

  // Geração: filtra por mes pt-BR, agrega kWh dos dias, soma metas.
  // NÃO converter pra `db.geracaoDia.aggregate`: GeracaoDia está fora do
  // MODEL_SCOPE (lib/db.ts) — agregar pelo filho burlaria o escopo de
  // gestor_filial. A query precisa entrar pelo model escopado (Geracao).
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

  // Faturamento de venda — VendaKwh usa "01".."12". Soma no banco
  // (`aggregate`) em vez de puxar as rows: o extension de escopo cobre
  // aggregate (lib/db.ts), então RBAC segue aplicado.
  const vendasAgg = await retryClosedConnection(() =>
    db.vendaKwh.aggregate({
      where: {
        ano: p.ano,
        mes: p.mesNum,
        deletedAt: null,
        ...scopeWhere("usina", filialFilter, ufFilter),
      },
      _sum: { valorReais: true },
    }),
  );
  const faturamentoVendaReais = decimalToNumber(vendasAgg._sum.valorReais);

  // Consumo total do mês — 3 somas em uma só ida ao banco.
  const consumoAgg = await retryClosedConnection(() =>
    db.consumo.aggregate({
      where: {
        ano: p.ano,
        mes: p.mesPt,
        deletedAt: null,
        ...scopeWhere("filial", filialFilter, ufFilter),
      },
      _sum: { consumoTotal: true, consumoKwhP: true, consumoKwhFp: true },
    }),
  );
  const consumoTotalKwh = decimalToNumber(consumoAgg._sum.consumoTotal);
  const consumoPontaKwh = decimalToNumber(consumoAgg._sum.consumoKwhP);
  const consumoForaPontaKwh = decimalToNumber(consumoAgg._sum.consumoKwhFp);

  // Usinas operacionais — não-deletadas, status = "operacional".
  const usinasOperacionais = await retryClosedConnection(() =>
    db.usina.count({
      where: {
        status: "operacional",
        deletedAt: null,
        ...scopeWhere("self", filialFilter, ufFilter),
      },
    }),
  );

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

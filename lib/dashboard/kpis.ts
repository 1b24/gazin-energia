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

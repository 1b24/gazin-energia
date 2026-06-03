/**
 * Composição do consumo — geração própria (usinas) × geração contratada
 * (injeção de terceiros), cada uma como % do consumo total das filiais.
 *
 * Definições (confirmadas com o usuário, 2026-06):
 *  - Consumo total  = Σ `Consumo.consumoTotal` — fonte da verdade do consumo
 *    absoluto; é o denominador dos dois percentuais.
 *  - Geração própria = Σ `GeracaoDia.kwh` das usinas Gazin — proxy de "quanto
 *    abate do consumo".
 *  - Geração contratada = Σ `Injecao.consumoTotalKwh` — injeção de fornecedores
 *    terceiros (GR ENERGY, BOM FUTURO, SERENA, COTESA).
 *  - % de cada fonte = fonte / consumoTotal. O restante vem da distribuidora
 *    (mercado cativo, regulado).
 *
 * Decisão de domínio (usuário, 2026-06): geração própria = Σ `GeracaoDia.kwh`
 * das usinas — a geração REAL, sem proxy. Limitação conhecida e ACEITA: a
 * geração das usinas e o consumo podem cair em meses diferentes (nos dados
 * atuais geração = Abr/Mai, consumo = Jan/Fev/Mar), e nesses meses o gauge
 * "própria" fica 0% — isso é COMPORTAMENTO ESPERADO, não bug. Mostrará valor
 * quando geração e consumo existirem no mesmo mês.
 *
 * NÃO trocar por `Consumo.injecaoRecebida` sem nova decisão: essa alternativa
 * (própria = injeção recebida da fatura, com/sem subtrair terceiros) foi
 * avaliada e rejeitada por não distinguir a injeção das usinas próprias da
 * injeção de terceiros/distribuidora.
 */
import { retryClosedConnection } from "@/lib/db";
import { getCurrentPeriod, type CurrentPeriod } from "@/lib/period";

import { decimalToNumber, getDb, scopeWhere, sumDias } from "./scope";

export interface ConsumoMix {
  consumoTotalKwh: number;
  geracaoPropriaKwh: number;
  geracaoContratadaKwh: number;
  /** Σ própria + contratada — energia coberta por geração (não-distribuidora). */
  cobertoKwh: number;
  /** Consumo não coberto por geração própria nem contratada (cativo). */
  distribuidoraKwh: number;
  pctPropria: number | null;
  pctContratada: number | null;
  pctDistribuidora: number | null;
}

export async function getConsumoMix(
  filialFilter?: string,
  period?: CurrentPeriod,
  ufFilter?: string,
): Promise<ConsumoMix> {
  const { db } = await getDb(filialFilter);
  const p = period ?? getCurrentPeriod();

  // Consumo total (denominador) — Consumo liga via filial.
  const consumos = await retryClosedConnection(() =>
    db.consumo.findMany({
      where: {
        ano: p.ano,
        mes: p.mesPt,
        deletedAt: null,
        ...scopeWhere("filial", filialFilter, ufFilter),
      },
      select: { consumoTotal: true },
    }),
  );
  const consumoTotalKwh = consumos.reduce(
    (acc, c) => acc + decimalToNumber(c.consumoTotal),
    0,
  );

  // Geração própria — usinas Gazin; Geracao liga via usina.
  const geracoes = await retryClosedConnection(() =>
    db.geracao.findMany({
      where: {
        ano: p.ano,
        mes: p.mesPt,
        deletedAt: null,
        ...scopeWhere("usina", filialFilter, ufFilter),
      },
      select: { dias: { select: { kwh: true } } },
    }),
  );
  const geracaoPropriaKwh = geracoes.reduce(
    (acc, g) => acc + sumDias(g.dias),
    0,
  );

  // Geração contratada — injeção de terceiros; Injecao liga via filial.
  const injecoes = await retryClosedConnection(() =>
    db.injecao.findMany({
      where: {
        ano: p.ano,
        mes: p.mesPt,
        deletedAt: null,
        ...scopeWhere("filial", filialFilter, ufFilter),
      },
      select: { consumoTotalKwh: true },
    }),
  );
  const geracaoContratadaKwh = injecoes.reduce(
    (acc, i) => acc + decimalToNumber(i.consumoTotalKwh),
    0,
  );

  const cobertoKwh = geracaoPropriaKwh + geracaoContratadaKwh;
  // Clamp em 0: geração pode exceder consumo numa fatia (UC supridora).
  const distribuidoraKwh = Math.max(0, consumoTotalKwh - cobertoKwh);

  const pct = (n: number) =>
    consumoTotalKwh > 0 ? (n / consumoTotalKwh) * 100 : null;

  return {
    consumoTotalKwh,
    geracaoPropriaKwh,
    geracaoContratadaKwh,
    cobertoKwh,
    distribuidoraKwh,
    pctPropria: pct(geracaoPropriaKwh),
    pctContratada: pct(geracaoContratadaKwh),
    pctDistribuidora: pct(distribuidoraKwh),
  };
}

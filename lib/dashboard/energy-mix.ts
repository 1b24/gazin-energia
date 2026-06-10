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
 *
 * Arquitetura: consumo total e geração própria são EXATAMENTE os agregados
 * que `getKpis` já computa (mesmos where/escopo) — repetir as queries aqui
 * duplicava 2 idas ao banco por render do dashboard. Por isso o mix é
 * composto em duas partes:
 *  - `getGeracaoContratadaKwh` — a única query que o mix tem de exclusivo.
 *  - `computeConsumoMix` — função PURA que monta o mix a partir dos números
 *    do `getKpis` + contratada. Testável sem banco.
 */
import { retryClosedConnection } from "@/lib/db";
import { getCurrentPeriod, type CurrentPeriod } from "@/lib/period";

import { decimalToNumber, getDb, scopeWhere } from "./scope";

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

/**
 * Σ `Injecao.consumoTotalKwh` do período — injeção contratada de terceiros.
 * Soma no banco; `Injecao` está no MODEL_SCOPE e o extension cobre
 * `aggregate`, então RBAC segue aplicado.
 */
export async function getGeracaoContratadaKwh(
  filialFilter?: string,
  period?: CurrentPeriod,
  ufFilter?: string,
): Promise<number> {
  const { db } = await getDb(filialFilter);
  const p = period ?? getCurrentPeriod();

  const agg = await retryClosedConnection(() =>
    db.injecao.aggregate({
      where: {
        ano: p.ano,
        mes: p.mesPt,
        deletedAt: null,
        ...scopeWhere("filial", filialFilter, ufFilter),
      },
      _sum: { consumoTotalKwh: true },
    }),
  );
  return decimalToNumber(agg._sum.consumoTotalKwh);
}

/**
 * Compõe o mix a partir de agregados já computados — `consumoTotalKwh` e
 * `geracaoPropriaKwh` vêm do `getKpis` (`consumoTotalKwh` /
 * `geracaoRealizadaKwh`); `geracaoContratadaKwh` de `getGeracaoContratadaKwh`.
 */
export function computeConsumoMix(input: {
  consumoTotalKwh: number;
  geracaoPropriaKwh: number;
  geracaoContratadaKwh: number;
}): ConsumoMix {
  const { consumoTotalKwh, geracaoPropriaKwh, geracaoContratadaKwh } = input;

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

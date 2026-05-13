/**
 * Lookup de tarifa de distribuidora vigente em uma data específica,
 * cruzando por UF. Usado pelos analytics de Injeção e Geração pra
 * calcular economia estimada vs. distribuidora.
 *
 * Histórico: cada registro Injeção/Geração é avaliado contra a tarifa que
 * estava em vigor na data do registro — não contra a tarifa vigente atual.
 * Importante quando a tarifa é reajustada e você reanalisa períodos
 * antigos.
 */

import { mesIndex } from "@/lib/period";

export interface TarifaSnapshot {
  /** UF onde a tarifa se aplica. */
  uf: string;
  valorPonta: number | null;
  valorForaPonta: number | null;
  vigenciaInicio: Date;
  /** null = tarifa ainda vigente. */
  vigenciaFim: Date | null;
}

/**
 * Acha a tarifa de uma UF que cobria `refDate`. Quando há mais de uma
 * candidata (sobreposição de vigências), retorna a com `vigenciaInicio`
 * mais recente — assume que reajustes mais novos prevalecem.
 *
 * Retorna `null` quando não há tarifa cadastrada na UF, ou nenhuma cobre
 * a data informada (cadastro de tarifa anterior à vigência registrada).
 */
export function findTarifaPorData(
  tarifas: TarifaSnapshot[],
  uf: string | null | undefined,
  refDate: Date,
): TarifaSnapshot | null {
  if (!uf) return null;
  const refMs = refDate.getTime();
  const candidates = tarifas.filter(
    (t) =>
      t.uf === uf &&
      t.vigenciaInicio.getTime() <= refMs &&
      (t.vigenciaFim == null || t.vigenciaFim.getTime() >= refMs),
  );
  if (candidates.length === 0) return null;
  // Mais recente primeiro (reajuste novo prevalece).
  candidates.sort(
    (a, b) => b.vigenciaInicio.getTime() - a.vigenciaInicio.getTime(),
  );
  return candidates[0];
}

/**
 * Constrói a data de referência (último dia do mês) a partir de `ano + mes`
 * em pt-BR. Usa o fim do mês como referência da fatura — uma tarifa
 * reajustada no dia 15 já vale pra fatura do mês inteiro.
 *
 * Retorna `null` quando ano/mes inválidos.
 */
export function refDateFromAnoMes(
  ano: number | null | undefined,
  mes: string | null | undefined,
): Date | null {
  if (ano == null || ano <= 0) return null;
  const idx = mesIndex(mes);
  if (idx < 0) return null;
  // new Date(ano, idx + 1, 0) = último dia do mês `idx`.
  return new Date(ano, idx + 1, 0);
}

/**
 * Calcula o valor que seria cobrado por uma distribuidora dado:
 *   kWh ponta, kWh fora ponta e snapshot de tarifa.
 *
 * Regras:
 *   - Se a tarifa não tem valorPonta nem valorForaPonta cadastrados → null
 *     (não é comparável).
 *   - Se a tarifa só tem `valorForaPonta` (sem ponta), usa fora ponta pra
 *     tudo (kWh ponta + kWh fora ponta) — conservador.
 *   - Se a tarifa só tem `valorPonta` (sem fora ponta), idem ao contrário.
 *   - Se ambos preenchidos, multiplica cada parcela pela tarifa respectiva.
 */
export function calcValorDistribuidora(
  kwhPonta: number,
  kwhForaPonta: number,
  tarifa: TarifaSnapshot,
): number | null {
  const tP = tarifa.valorPonta;
  const tFP = tarifa.valorForaPonta;
  if (tP == null && tFP == null) return null;
  const total = kwhPonta + kwhForaPonta;
  if (tP == null) return total * (tFP ?? 0);
  if (tFP == null) return total * (tP ?? 0);
  return kwhPonta * tP + kwhForaPonta * tFP;
}

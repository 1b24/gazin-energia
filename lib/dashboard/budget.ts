/**
 * Orçado vs Realizado por mês — agrega `Orcamento.usoConsumo` (orçado) contra
 * a soma de `realUsoConsumo + realEquipamentos + realViagensEstadias`.
 */
import { MESES_PT } from "@/lib/period";

import { decimalToNumber, getDb, scopeWhere } from "./scope";

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

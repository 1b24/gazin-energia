/**
 * Distribuição de usinas por UF — substituto do mapa do Brasil no dashboard,
 * agrupando por estado e status operacional.
 */
import { getDb } from "./scope";

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

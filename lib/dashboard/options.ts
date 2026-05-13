/**
 * Opções para os dropdowns de filtro do dashboard:
 *  - `getFilialOptions` — só admin recebe lista (gestor já está no escopo).
 *  - `getYearOptions`   — anos com dados em Geração ou Consumo.
 *  - `getUfOptions`     — UFs distintas com Usina ou Filial no escopo.
 */
import { auth } from "@/lib/auth";
import { retryClosedConnection, scopedPrisma } from "@/lib/db";

import { getDb } from "./scope";

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
export async function getYearOptions(
  filialFilter?: string,
): Promise<number[]> {
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

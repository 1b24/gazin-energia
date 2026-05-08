import { auth } from "@/lib/auth";
import { scopedPrisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";
import { prevPeriod, variacao } from "@/lib/variacao";

import { ConsumoTable, type ConsumoRow } from "./consumo-table";

export default async function ConsumoPage() {
  const session = await auth();
  const db = scopedPrisma(session?.user);

  const [rows, filialOptions] = await Promise.all([
    db.consumo.findMany({
      include: {
        filial: { select: { id: true, codigo: true, mercadoLivre: true } },
      },
      orderBy: [{ ano: "desc" }, { mes: "desc" }, { filialId: "asc" }],
    }),
    db.filial.findMany({
      where: { deletedAt: null },
      select: { id: true, codigo: true, mercadoLivre: true },
      orderBy: { codigo: "asc" },
    }),
  ]);

  // Indexa por (uc, ano, mes) pra calcular Δ vs mês anterior da MESMA UC.
  const serialized = serializePrisma(rows) as ConsumoRow[];
  const byKey = new Map<string, ConsumoRow>();
  for (const r of serialized) {
    if (r.uc && r.ano != null && r.mes) {
      byKey.set(`${r.uc}|${r.ano}|${r.mes}`, r);
    }
  }

  const enriched: ConsumoRow[] = serialized.map((r) => {
    if (!r.uc || r.ano == null || !r.mes) return r;
    const prev = prevPeriod({ ano: r.ano, mes: r.mes });
    if (!prev) return r;
    const ref = byKey.get(`${r.uc}|${prev.ano}|${prev.mes}`);
    if (!ref) return r;
    const vConsumo = variacao(r.consumoTotal, ref.consumoTotal);
    const vFatura = variacao(r.valorTotalFatura, ref.valorTotalFatura);
    return {
      ...r,
      variacaoConsumoAbs: vConsumo.abs,
      variacaoConsumoPct: vConsumo.pct,
      variacaoFaturaAbs: vFatura.abs,
      variacaoFaturaPct: vFatura.pct,
    };
  });

  return (
    <ConsumoTable rows={enriched} filialOptions={filialOptions} />
  );
}

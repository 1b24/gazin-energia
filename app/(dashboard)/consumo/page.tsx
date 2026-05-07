import { auth } from "@/lib/auth";
import { scopedPrisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

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

  return (
    <ConsumoTable
      rows={serializePrisma(rows) as ConsumoRow[]}
      filialOptions={filialOptions}
    />
  );
}

import { auth } from "@/lib/auth";
import { retryClosedConnection, scopedPrisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { GeracaoTable, type GeracaoRow } from "./geracao-table";

export default async function GeracaoPage() {
  const session = await auth();
  const db = scopedPrisma(session?.user);

  const [rows, usinaOptions] = await Promise.all([
    retryClosedConnection(() =>
      db.geracao.findMany({
        include: {
          usina: { select: { id: true, nome: true, uf: true } },
          dias: { orderBy: { dia: "asc" } },
        },
        orderBy: [{ ano: "desc" }, { usinaId: "asc" }],
      }),
    ),
    retryClosedConnection(() =>
      db.usina.findMany({
        where: { deletedAt: null },
        select: { id: true, nome: true },
        orderBy: { nome: "asc" },
      }),
    ),
  ]);

  return (
    <GeracaoTable
      rows={serializePrisma(rows) as GeracaoRow[]}
      usinaOptions={usinaOptions}
    />
  );
}

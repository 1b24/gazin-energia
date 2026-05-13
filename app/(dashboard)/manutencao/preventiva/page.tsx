import { auth } from "@/lib/auth";
import { retryClosedConnection, scopedPrisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { PreventivaTable, type PreventivaRow } from "./preventiva-table";

export default async function PreventivaPage() {
  const session = await auth();
  const db = scopedPrisma(session?.user);

  const [rows, usinaOptions] = await Promise.all([
    retryClosedConnection(() =>
      db.manutencaoPreventiva.findMany({
        // `uf` da usina vem pra alimentar o filtro de UF no analytics.
        include: { usina: { select: { id: true, nome: true, uf: true } } },
        orderBy: [{ status: "asc" }, { dataExecucao: "desc" }],
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
    <PreventivaTable
      rows={serializePrisma(rows) as PreventivaRow[]}
      usinaOptions={usinaOptions}
    />
  );
}

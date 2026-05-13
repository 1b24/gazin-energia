import { auth } from "@/lib/auth";
import { retryClosedConnection, scopedPrisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { OrcamentoTable, type OrcamentoRow } from "./orcamento-table";

export default async function OrcamentarioPage() {
  const session = await auth();
  const db = scopedPrisma(session?.user);

  const [rows, usinaOptions] = await Promise.all([
    retryClosedConnection(() =>
      db.orcamento.findMany({
        include: { usina: { select: { id: true, nome: true } } },
        orderBy: [{ mes: "asc" }, { usinaId: "asc" }],
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
    <OrcamentoTable
      rows={serializePrisma(rows) as OrcamentoRow[]}
      usinaOptions={usinaOptions}
    />
  );
}

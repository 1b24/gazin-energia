import { auth } from "@/lib/auth";
import { retryClosedConnection, scopedPrisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { DistribuidorasTable, type DistribuidoraRow } from "./distribuidoras-table";

export default async function DistribuidorasPage() {
  const session = await auth();
  const db = scopedPrisma(session?.user);

  // Entidade global — todos os usuários autenticados veem. Pouco volume
  // (~10 registros típicos), sem paginação.
  const rows = await retryClosedConnection(() =>
    db.distribuidora.findMany({
      orderBy: { nome: "asc" },
    }),
  );

  return (
    <DistribuidorasTable
      rows={serializePrisma(rows) as DistribuidoraRow[]}
    />
  );
}

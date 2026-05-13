import { auth } from "@/lib/auth";
import { retryClosedConnection, scopedPrisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { ProcessosTable, type ProcessoRow } from "./processos-table";

export default async function ProcessosPage() {
  const session = await auth();
  const db = scopedPrisma(session?.user);

  const rows = await retryClosedConnection(() =>
    db.processoJuridico.findMany({
      orderBy: [{ dataProtocolo: "desc" }, { tipo: "asc" }],
    }),
  );

  return <ProcessosTable rows={serializePrisma(rows) as ProcessoRow[]} />;
}

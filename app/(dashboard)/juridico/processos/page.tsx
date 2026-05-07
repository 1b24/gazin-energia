import { prisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { ProcessosTable, type ProcessoRow } from "./processos-table";

export default async function ProcessosPage() {
  const rows = await prisma.processoJuridico.findMany({
    orderBy: [{ dataProtocolo: "desc" }, { tipo: "asc" }],
  });

  return <ProcessosTable rows={serializePrisma(rows) as ProcessoRow[]} />;
}

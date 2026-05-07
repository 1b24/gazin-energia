import { prisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { InjecaoTable, type InjecaoRow } from "./injecao-table";

export default async function InjecaoPage() {
  const rows = await prisma.injecao.findMany({
    orderBy: [{ ano: "desc" }, { mes: "desc" }, { filialDescricao: "asc" }],
  });

  return <InjecaoTable rows={serializePrisma(rows) as InjecaoRow[]} />;
}

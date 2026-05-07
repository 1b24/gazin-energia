import { prisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { PreventivaTable, type PreventivaRow } from "./preventiva-table";

export default async function PreventivaPage() {
  const [rows, usinaOptions] = await Promise.all([
    prisma.manutencaoPreventiva.findMany({
      include: { usina: { select: { id: true, nome: true } } },
      orderBy: [{ status: "asc" }, { dataExecucao: "desc" }],
    }),
    prisma.usina.findMany({
      where: { deletedAt: null },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <PreventivaTable
      rows={serializePrisma(rows) as PreventivaRow[]}
      usinaOptions={usinaOptions}
    />
  );
}

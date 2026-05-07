import { prisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { OrcamentoTable, type OrcamentoRow } from "./orcamento-table";

export default async function OrcamentarioPage() {
  const [rows, usinaOptions] = await Promise.all([
    prisma.orcamento.findMany({
      include: { usina: { select: { id: true, nome: true } } },
      orderBy: [{ mes: "asc" }, { usinaId: "asc" }],
    }),
    prisma.usina.findMany({
      where: { deletedAt: null },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <OrcamentoTable
      rows={serializePrisma(rows) as OrcamentoRow[]}
      usinaOptions={usinaOptions}
    />
  );
}

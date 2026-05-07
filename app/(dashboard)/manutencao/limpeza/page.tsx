import { prisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { LimpezaTable, type LimpezaRow } from "./limpeza-table";

export default async function LimpezaPage() {
  const [rows, usinaOptions] = await Promise.all([
    prisma.cronogramaLimpeza.findMany({
      include: {
        usina: { select: { id: true, nome: true } },
        itens: { orderBy: { ordem: "asc" } },
      },
      orderBy: { usinaId: "asc" },
    }),
    prisma.usina.findMany({
      where: { deletedAt: null },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <LimpezaTable
      rows={serializePrisma(rows) as LimpezaRow[]}
      usinaOptions={usinaOptions}
    />
  );
}

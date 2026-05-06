import { prisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { VendaKwhTable, type VendaKwhRow } from "./venda-kwh-table";

export default async function VendaKwhPage() {
  const [rows, usinaOptions] = await Promise.all([
    prisma.vendaKwh.findMany({
      include: { usina: { select: { id: true, nome: true } } },
      orderBy: [{ ano: "desc" }, { mes: "desc" }],
    }),
    prisma.usina.findMany({
      where: { deletedAt: null },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <VendaKwhTable
      rows={serializePrisma(rows) as VendaKwhRow[]}
      usinaOptions={usinaOptions}
    />
  );
}

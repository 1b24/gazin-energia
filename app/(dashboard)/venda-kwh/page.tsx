import { auth } from "@/lib/auth";
import { retryClosedConnection, scopedPrisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { VendaKwhTable, type VendaKwhRow } from "./venda-kwh-table";

export default async function VendaKwhPage() {
  const session = await auth();
  const db = scopedPrisma(session?.user);

  const [rows, usinaOptions] = await Promise.all([
    retryClosedConnection(() =>
      db.vendaKwh.findMany({
        include: { usina: { select: { id: true, nome: true } } },
        orderBy: [{ ano: "desc" }, { mes: "desc" }],
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
    <VendaKwhTable
      rows={serializePrisma(rows) as VendaKwhRow[]}
      usinaOptions={usinaOptions}
    />
  );
}

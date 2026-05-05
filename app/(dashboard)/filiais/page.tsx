import { prisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { FiliaisTable, type FilialRow } from "./filiais-table";

export default async function FiliaisPage() {
  const rows = await prisma.filial.findMany({
    include: {
      _count: {
        select: {
          usinas: true,
          consumos: true,
          fornecedoresAbrangencia: true,
        },
      },
    },
    orderBy: [{ codigo: "asc" }, { mercadoLivre: "asc" }],
  });

  // Decimal/BigInt não atravessam a borda RSC→Client. Converte em number.
  return <FiliaisTable rows={serializePrisma(rows) as FilialRow[]} />;
}

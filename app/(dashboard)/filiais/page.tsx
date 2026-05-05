import { prisma } from "@/lib/db";

import { FiliaisTable } from "./filiais-table";

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

  return <FiliaisTable rows={rows} />;
}

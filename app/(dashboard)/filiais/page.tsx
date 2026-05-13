import { auth } from "@/lib/auth";
import { retryClosedConnection, scopedPrisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { FiliaisTable, type FilialRow } from "./filiais-table";

export default async function FiliaisPage() {
  const session = await auth();
  const db = scopedPrisma(session?.user);

  // `select` explícito — Filial.senha NUNCA deve trafegar até o client.
  // Edição da senha deve ser feita em fluxo dedicado de admin (TODO).
  const rows = await retryClosedConnection(() =>
    db.filial.findMany({
      select: {
        id: true,
        zohoId: true,
        codigo: true,
        cd: true,
        mercadoLivre: true,
        percentualAbsorcaoUsp: true,
        uc: true,
        uc2: true,
        uc3: true,
        municipio: true,
        uf: true,
        usuario: true,
        grupo: true,
        distribuidora: true,
        cnpj: true,
        filialClimatizada: true,
        dataClimatizacaoPlanejada: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        _count: {
          select: {
            usinas: true,
            consumos: true,
            fornecedoresAbrangencia: true,
          },
        },
      },
      orderBy: [{ codigo: "asc" }, { mercadoLivre: "asc" }],
    }),
  );

  // Decimal/BigInt não atravessam a borda RSC→Client. Converte em number.
  return <FiliaisTable rows={serializePrisma(rows) as FilialRow[]} />;
}

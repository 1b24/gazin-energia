import { auth } from "@/lib/auth";
import { retryClosedConnection, scopedPrisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { FornecedoresTable, type FornecedorRow } from "./fornecedores-table";

export default async function FornecedoresPage() {
  const session = await auth();
  const db = scopedPrisma(session?.user);

  const [rows, filialOptions] = await Promise.all([
    retryClosedConnection(() =>
      db.fornecedor.findMany({
        include: {
          abrangenciaFilial: {
            select: { id: true, codigo: true, mercadoLivre: true },
          },
        },
        orderBy: [{ status: "asc" }, { nome: "asc" }],
      }),
    ),
    retryClosedConnection(() =>
      db.filial.findMany({
        where: { deletedAt: null },
        select: { id: true, codigo: true, mercadoLivre: true },
        orderBy: { codigo: "asc" },
      }),
    ),
  ]);

  return (
    <FornecedoresTable
      rows={serializePrisma(rows) as FornecedorRow[]}
      filialOptions={filialOptions}
    />
  );
}

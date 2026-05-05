import { prisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { FornecedoresTable, type FornecedorRow } from "./fornecedores-table";

export default async function FornecedoresPage() {
  const [rows, filialOptions] = await Promise.all([
    prisma.fornecedor.findMany({
      include: {
        abrangenciaFilial: {
          select: { id: true, codigo: true, mercadoLivre: true },
        },
      },
      orderBy: [{ status: "asc" }, { nome: "asc" }],
    }),
    prisma.filial.findMany({
      where: { deletedAt: null },
      select: { id: true, codigo: true, mercadoLivre: true },
      orderBy: { codigo: "asc" },
    }),
  ]);

  return (
    <FornecedoresTable
      rows={serializePrisma(rows) as FornecedorRow[]}
      filialOptions={filialOptions}
    />
  );
}

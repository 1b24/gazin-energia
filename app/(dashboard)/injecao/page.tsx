import { prisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { InjecaoTable, type InjecaoRow } from "./injecao-table";

export default async function InjecaoPage() {
  const [rows, filialOptions, fornecedorOptions] = await Promise.all([
    prisma.injecao.findMany({
      include: {
        filial: { select: { id: true, codigo: true, mercadoLivre: true } },
        fornecedor: { select: { id: true, nome: true } },
      },
      orderBy: [{ ano: "desc" }, { mes: "desc" }],
    }),
    prisma.filial.findMany({
      where: { deletedAt: null },
      // `uc` e `municipio` precisam vir pra alimentar o linksTo do form.
      select: {
        id: true,
        codigo: true,
        mercadoLivre: true,
        uc: true,
        municipio: true,
      },
      orderBy: { codigo: "asc" },
    }),
    prisma.fornecedor.findMany({
      where: { deletedAt: null, nome: { not: null } },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <InjecaoTable
      rows={serializePrisma(rows) as InjecaoRow[]}
      filialOptions={filialOptions}
      fornecedorOptions={fornecedorOptions}
    />
  );
}

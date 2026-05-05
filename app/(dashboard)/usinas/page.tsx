import { prisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { UsinasTable, type UsinaRow } from "./usinas-table";

export default async function UsinasPage() {
  const [rows, filialOptions] = await Promise.all([
    prisma.usina.findMany({
      include: {
        filial: { select: { id: true, codigo: true, mercadoLivre: true } },
        _count: {
          select: {
            geracoes: true,
            vendasKwh: true,
            orcamentos: true,
            cronogramasLimpeza: true,
            manutencoesPrev: true,
          },
        },
      },
      orderBy: { nome: "asc" },
    }),
    prisma.filial.findMany({
      where: { deletedAt: null },
      select: { id: true, codigo: true, mercadoLivre: true },
      orderBy: { codigo: "asc" },
    }),
  ]);

  return (
    <UsinasTable
      rows={serializePrisma(rows) as UsinaRow[]}
      filialOptions={filialOptions}
    />
  );
}

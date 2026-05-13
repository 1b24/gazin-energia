/**
 * Injeção por Concessionária (Fornecedor) — agrega kWh e R$ injetados,
 * cruzando com Consumo da mesma filial/período para mostrar share da
 * concessionária no consumo do cliente.
 */
import { getCurrentPeriod, type CurrentPeriod } from "@/lib/period";

import { decimalToNumber, getDb, scopeWhere } from "./scope";

export interface ConcessionariaRow {
  /** Nome canônico do fornecedor; "Não informada" quando ausente. */
  nome: string;
  ucs: number;
  injetadoKwh: number;
  valorReais: number;
  consumoKwh: number;
}

/**
 * Agrega Injeção (kWh injetado, R$) e Consumo associado pela mesma janela
 * (ano/mês), agrupando por concessionária — usa `fornecedor.nome` quando
 * disponível, caindo em `fornecedorRaw`. Consumo não tem FK de fornecedor;
 * cruzamos via `uc + filialId` (chave composta, ano/mês já fixos no where).
 */
export async function getInjecaoPorConcessionaria(
  filialFilter?: string,
  period?: CurrentPeriod,
  ufFilter?: string,
  concessionariaFilter?: string,
): Promise<ConcessionariaRow[]> {
  const { db } = await getDb(filialFilter);
  const p = period ?? getCurrentPeriod();

  const injecoes = await db.injecao.findMany({
    where: {
      ano: p.ano,
      mes: p.mesPt,
      deletedAt: null,
      ...scopeWhere("filial", filialFilter, ufFilter),
    },
    select: {
      uc: true,
      consumoTotalKwh: true,
      valor: true,
      filialId: true,
      fornecedor: { select: { nome: true } },
      fornecedorRaw: true,
    },
  });

  const filialIds = Array.from(
    new Set(injecoes.map((i) => i.filialId).filter((v): v is string => !!v)),
  );

  const consumos =
    filialIds.length > 0
      ? await db.consumo.findMany({
          where: {
            ano: p.ano,
            mes: p.mesPt,
            deletedAt: null,
            filialId: { in: filialIds },
            ...scopeWhere("filial", filialFilter, ufFilter),
          },
          select: { uc: true, filialId: true, consumoTotal: true },
        })
      : [];

  // Chave composta `uc|filialId` — UC sozinha pode repetir entre filiais e o
  // ano/mês já estão fixos no `where` acima. Sem `filialId` o mesmo consumo
  // era atribuído a múltiplas concessionárias quando UCs colidiam.
  const consumoByKey = new Map<string, number>();
  for (const c of consumos) {
    if (!c.uc || !c.filialId) continue;
    const key = `${c.uc}|${c.filialId}`;
    consumoByKey.set(
      key,
      (consumoByKey.get(key) ?? 0) + decimalToNumber(c.consumoTotal),
    );
  }

  const buckets = new Map<string, ConcessionariaRow>();
  for (const i of injecoes) {
    const nome =
      i.fornecedor?.nome?.trim() || i.fornecedorRaw?.trim() || "Não informada";
    if (concessionariaFilter && nome !== concessionariaFilter) continue;

    const cur =
      buckets.get(nome) ??
      ({
        nome,
        ucs: 0,
        injetadoKwh: 0,
        valorReais: 0,
        consumoKwh: 0,
      } as ConcessionariaRow);
    cur.ucs += 1;
    cur.injetadoKwh += decimalToNumber(i.consumoTotalKwh);
    cur.valorReais += decimalToNumber(i.valor);
    if (i.uc && i.filialId) {
      cur.consumoKwh += consumoByKey.get(`${i.uc}|${i.filialId}`) ?? 0;
    }
    buckets.set(nome, cur);
  }

  return Array.from(buckets.values()).sort(
    (a, b) => b.injetadoKwh - a.injetadoKwh,
  );
}

/**
 * Concessionárias distintas com Injeção no escopo do usuário — alimenta o
 * dropdown de filtro.
 */
export async function getConcessionariaOptions(
  filialFilter?: string,
): Promise<string[]> {
  const { db } = await getDb(filialFilter);
  const rows = await db.injecao.findMany({
    where: {
      deletedAt: null,
      ...(filialFilter ? { filialId: filialFilter } : {}),
    },
    select: {
      fornecedor: { select: { nome: true } },
      fornecedorRaw: true,
    },
  });
  const set = new Set<string>();
  for (const r of rows) {
    const nome = r.fornecedor?.nome?.trim() || r.fornecedorRaw?.trim() || "";
    if (nome) set.add(nome);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

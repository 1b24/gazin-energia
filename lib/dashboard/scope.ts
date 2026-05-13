/**
 * Helpers compartilhados pelas agregações do dashboard.
 *
 * Privados ao módulo `lib/dashboard/*` — não re-exportados via `index.ts`.
 * Se um helper aqui virar útil fora do dashboard, mova para `lib/db.ts` ou
 * `lib/format.ts` conforme o caso.
 *
 * Convenções de mês usadas pelas funções acima:
 *   - Geracao.mes  = "Janeiro".."Dezembro"   (label pt-BR)
 *   - Consumo.mes  = "Janeiro".."Dezembro"   (label pt-BR)
 *   - VendaKwh.mes = "01".."12"               (zero-padded)
 *   - Orcamento.mes= "Janeiro".."Dezembro"    (label pt-BR)
 */
import { auth } from "@/lib/auth";
import { scopedPrisma } from "@/lib/db";
import { MESES_PT } from "@/lib/period";

export async function getDb(filialFilter?: string) {
  const session = await auth();
  const db = scopedPrisma(session?.user);
  return { db, session, filialFilter };
}

/**
 * Monta a parte do `where` que aplica filtros de Filial e UF de acordo com
 * a ligação da entidade ao mundo real.
 *  - 'self'   → entidade tem `filialId` E `uf` próprios (Filial, Usina).
 *  - 'usina'  → entidade liga via `usina.filialId / usina.uf` (Geracao,
 *               VendaKwh, Orcamento, CronogramaLimpeza, ManutencaoPreventiva).
 *  - 'filial' → entidade liga via `filial.filialId / filial.uf` (Consumo,
 *               Injecao, Fornecedor com abrangencia).
 */
export function scopeWhere(
  via: "self" | "usina" | "filial",
  filialFilter?: string,
  ufFilter?: string,
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (via === "self") {
    if (filialFilter) where.filialId = filialFilter;
    if (ufFilter) where.uf = ufFilter;
  } else if (via === "usina") {
    const usina: Record<string, unknown> = {};
    if (filialFilter) usina.filialId = filialFilter;
    if (ufFilter) usina.uf = ufFilter;
    if (Object.keys(usina).length) where.usina = usina;
  } else if (via === "filial") {
    if (filialFilter) where.filialId = filialFilter;
    if (ufFilter) where.filial = { uf: ufFilter };
  }
  return where;
}

export function sumDias(
  dias: { kwh: { toNumber(): number } | number | null }[],
): number {
  return dias.reduce((a, d) => {
    if (d.kwh == null) return a;
    const n = typeof d.kwh === "number" ? d.kwh : d.kwh.toNumber();
    return a + n;
  }, 0);
}

export function decimalToNumber(
  v: { toNumber(): number } | number | null | undefined,
): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : v.toNumber();
}

export function diasNoMes(
  ano: number | null | undefined,
  mes: string | null | undefined,
) {
  const mesIdx = (MESES_PT as readonly string[]).indexOf(mes ?? "");
  if (ano == null || mesIdx < 0) return 31;
  return new Date(ano, mesIdx + 1, 0).getDate();
}

export function metaMensalGeracao(
  metaDiaria: { toNumber(): number } | number | null | undefined,
  ano: number | null | undefined,
  mes: string | null | undefined,
): number {
  return decimalToNumber(metaDiaria) * diasNoMes(ano, mes);
}

export function concessionariaNome(row: {
  fornecedor?: { nome: string | null } | null;
  fornecedorRaw?: string | null;
}) {
  return row.fornecedor?.nome?.trim() || row.fornecedorRaw?.trim() || "";
}

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

// Helpers puros de kWh/período moveram pra `lib/kwh.ts` (módulo sem auth —
// reusável por client components e testável sem mock). Re-export preserva
// os imports existentes das agregações.
export {
  decimalToNumber,
  diasNoMes,
  metaMensalGeracao,
  sumDias,
} from "@/lib/kwh";

export function concessionariaNome(row: {
  fornecedor?: { nome: string | null } | null;
  fornecedorRaw?: string | null;
}) {
  return row.fornecedor?.nome?.trim() || row.fornecedorRaw?.trim() || "";
}

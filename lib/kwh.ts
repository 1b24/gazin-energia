/**
 * Helpers PUROS de energia/período — sem dependência de auth, banco ou
 * sessão. Extraídos de `lib/dashboard/scope.ts` (que importa `auth` e por
 * isso não podia ser consumido por client components nem testado sem mock).
 *
 * Server (agregações do dashboard) e client (tabelas/charts) podem importar
 * daqui livremente.
 */
import { MESES_PT } from "@/lib/period";

/** Duck-type do Prisma Decimal — basta expor `toNumber()`. */
export interface DecimalLike {
  toNumber(): number;
}

export function decimalToNumber(
  v: DecimalLike | number | null | undefined,
): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : v.toNumber();
}

/** Soma kWh de uma lista de dias, ignorando dias sem dado. */
export function sumDias(
  dias: { kwh: DecimalLike | number | null }[],
): number {
  return dias.reduce((a, d) => {
    if (d.kwh == null) return a;
    const n = typeof d.kwh === "number" ? d.kwh : d.kwh.toNumber();
    return a + n;
  }, 0);
}

/** Dias no mês (mes em pt-BR "Janeiro".."Dezembro"). Fallback: 31. */
export function diasNoMes(
  ano: number | null | undefined,
  mes: string | null | undefined,
) {
  const mesIdx = (MESES_PT as readonly string[]).indexOf(mes ?? "");
  if (ano == null || mesIdx < 0) return 31;
  return new Date(ano, mesIdx + 1, 0).getDate();
}

/** Meta mensal = meta diária × dias do mês de referência. */
export function metaMensalGeracao(
  metaDiaria: DecimalLike | number | null | undefined,
  ano: number | null | undefined,
  mes: string | null | undefined,
): number {
  return decimalToNumber(metaDiaria) * diasNoMes(ano, mes);
}

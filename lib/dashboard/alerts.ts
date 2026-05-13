/**
 * Alertas operacionais para o dashboard — licenças (stub), manutenções e
 * processos jurídicos com atenção.
 */
import { getDb, scopeWhere } from "./scope";

export interface DashboardAlerts {
  /** Licenças com vencimento ≤ 30 dias (stub: model existe mas vazio). */
  licencasVencendo: number;
  /**
   * Manutenções "em aberto" — corretivas (stub) + preventivas pendentes ou em
   * andamento. Conta proxy enquanto Corretiva não tem JSON.
   */
  manutencoesAbertas: number;
  /**
   * Processos com "atenção" — Judicial em aberto (não soft-deleted). Sem
   * campo de prazo no schema atual; uso `dataProtocolo` como referência.
   */
  processosAtencao: number;
}

export async function getAlerts(
  filialFilter?: string,
  ufFilter?: string,
): Promise<DashboardAlerts> {
  const { db } = await getDb(filialFilter);

  // Licenças (stub) — count atual será 0 até JSON chegar.
  const licencasVencendo = await db.licenca.count({
    where: {
      deletedAt: null,
      ...scopeWhere("usina", filialFilter, ufFilter),
    },
  });

  const corretivas = await db.manutencaoCorretiva.count({
    where: {
      deletedAt: null,
      ...scopeWhere("usina", filialFilter, ufFilter),
    },
  });
  const preventivasAbertas = await db.manutencaoPreventiva.count({
    where: {
      status: { in: ["pendente", "em_andamento"] },
      deletedAt: null,
      ...scopeWhere("usina", filialFilter, ufFilter),
    },
  });
  const manutencoesAbertas = corretivas + preventivasAbertas;

  // Processos: ProcessoJuridico não tem FK de filial nem UF — só agrega
  // quando não há filtro de escopo. Para qualquer filtro (filial ou UF),
  // mostramos 0 já que não há vínculo formal.
  const processosAtencao =
    filialFilter || ufFilter
      ? 0
      : await db.processoJuridico.count({
          where: { tipo: "judicial", deletedAt: null },
        });

  return { licencasVencendo, manutencoesAbertas, processosAtencao };
}

/**
 * Agregações server-side do dashboard — entry point.
 *
 * Cada agregação aplica `scopedPrisma` indiretamente via `getDb` em
 * `./scope.ts` — gestor_filial / operacional só vê números do próprio escopo;
 * admin vê tudo a menos que `filialId` venha como filtro explícito.
 *
 * Esta API substituiu o monólito `lib/dashboard.ts` no Step 8 do refactor
 * 2026-05-foundations. Os exports estão preservados — `from "@/lib/dashboard"`
 * continua resolvendo aqui (Next/TS resolve `dashboard/index.ts`
 * automaticamente).
 *
 * Convenções de mês das fontes legadas:
 *   - Geracao.mes  = "Janeiro".."Dezembro"
 *   - Consumo.mes  = "Janeiro".."Dezembro"
 *   - VendaKwh.mes = "01".."12"
 *   - Orcamento.mes= "Janeiro".."Dezembro"
 *
 * "Mês corrente" usa `new Date()` em runtime — dados da fonte legada são
 * todos de 2026, então em 2026 funciona naturalmente; em outros anos os
 * cards podem ficar vazios. Não inventamos dados.
 */

// KPIs principais
export { getKpis, type DashboardKpis } from "./kpis";

// Alertas operacionais
export { getAlerts, type DashboardAlerts } from "./alerts";

// Geração — série de 12 meses, tabela de atenção
export {
  getAtencao,
  getGeracaoSerie,
  type AtencaoRow,
  type GeracaoSeriePoint,
} from "./generation";

// Orçado vs realizado
export {
  getOrcadoVsRealizado,
  type OrcadoRealizadoPoint,
} from "./budget";

// Distribuição de usinas por UF
export { getUsinasPorUF, type UfBucket } from "./uf-breakdown";

// Injeção por concessionária
export {
  getConcessionariaOptions,
  getInjecaoPorConcessionaria,
  type ConcessionariaRow,
} from "./injection";

// Opções dos dropdowns de filtro
export {
  getFilialOptions,
  getUfOptions,
  getYearOptions,
  type FilialOption,
} from "./options";

// Re-export dos helpers de período — mantém compat com `import { MESES_PT,
// periodFromQuery, ... } from "@/lib/dashboard"` que ainda aparece em vários
// arquivos. Novos imports devem preferir `@/lib/period` direto.
export {
  MESES_PT,
  getCurrentPeriod,
  last12MonthsEndingAt,
  makePeriod,
  periodFromQuery,
  type CurrentPeriod,
} from "@/lib/period";

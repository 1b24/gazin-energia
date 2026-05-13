/**
 * Status de cada entidade do sistema. `<EntityPage />` (Tarefa 3) lê este
 * mapa para decidir se renderiza a tabela completa ou um EmptyState informando
 * que o módulo aguarda dados.
 *
 * Quando o JSON real de uma entidade `stub` chegar:
 *   1. Coloca em `data/raw/<arquivo_canônico>.json`
 *   2. Muda `ENTITY_STATUS[<Model>] = "active"` aqui
 *   3. Expande o model em `prisma/schema.prisma` (opcional)
 *   4. `npm run db:migrate && npm run db:seed`
 */

export type EntityStatus = "active" | "stub";

export const ENTITY_STATUS: Record<string, EntityStatus> = {
  // --- ATIVOS — populados via data/raw/ ---
  Filial: "active",
  Usina: "active",
  Fornecedor: "active",
  ProcessoJuridico: "active",
  Geracao: "active",
  VendaKwh: "active",
  Consumo: "active",
  Injecao: "active",
  Orcamento: "active",
  CronogramaLimpeza: "active",
  ManutencaoPreventiva: "active",
  Distribuidora: "active",
  TarifaEnergia: "active",

  // --- STUBS — aguardando JSON do sistema antigo ---
  Licenca: "stub",
  ValidacaoFatura: "stub",
  ItemEstoque: "stub",
  ConsertoEquipamento: "stub",
  ManutencaoCorretiva: "stub",
  Documento: "stub",
};

export function getEntityStatus(model: string): EntityStatus {
  return ENTITY_STATUS[model] ?? "stub";
}

export function isStub(model: string): boolean {
  return getEntityStatus(model) === "stub";
}

/** Lista de models por status, útil pra logs e relatórios de validação. */
export function listByStatus(status: EntityStatus): string[] {
  return Object.entries(ENTITY_STATUS)
    .filter(([, s]) => s === status)
    .map(([model]) => model);
}

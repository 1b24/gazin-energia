/**
 * Controle de Estoque — entidade STUB (sem JSON em data/raw/ ainda).
 *
 * O <EntityPage /> detecta isStub('ItemEstoque') e renderiza o EmptyState
 * orientando a colocar `estoque.json` em data/raw/. Nenhuma tabela / form /
 * fetch acontece até o JSON real chegar.
 */
import { EntityPage } from "@/components/data-table/entity-page";

export default function EstoquePage() {
  return (
    <EntityPage
      title="Controle de Estoque"
      prismaModel="ItemEstoque"
      rawFileName="estoque.json"
      rows={[]}
      columns={[]}
    />
  );
}

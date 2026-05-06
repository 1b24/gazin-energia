/**
 * Validação Relatório Fatura — entidade STUB (sem JSON em data/raw/ ainda).
 *
 * O <EntityPage /> detecta isStub('ValidacaoFatura') e renderiza o EmptyState
 * orientando a colocar `consumo_validacao_fatura.json` em data/raw/. Nenhuma
 * tabela / form / fetch acontece até o JSON real chegar.
 */
import { EntityPage } from "@/components/data-table/entity-page";

export default function ValidacaoFaturaPage() {
  return (
    <EntityPage
      title="Validação Relatório Fatura"
      prismaModel="ValidacaoFatura"
      rawFileName="consumo_validacao_fatura.json"
      rows={[]}
      columns={[]}
    />
  );
}

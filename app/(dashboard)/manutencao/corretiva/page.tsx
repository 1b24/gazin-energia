/**
 * Manutenção Corretiva — entidade STUB (sem JSON em data/raw/ ainda).
 *
 * O <EntityPage /> detecta isStub('ManutencaoCorretiva') e renderiza o
 * EmptyState orientando a colocar `manutencao_corretiva.json` em data/raw/.
 */
import { EntityPage } from "@/components/data-table/entity-page";

export default function CorretivaPage() {
  return (
    <EntityPage
      title="Manutenção Corretiva"
      prismaModel="ManutencaoCorretiva"
      rawFileName="manutencao_corretiva.json"
      rows={[]}
      columns={[]}
    />
  );
}

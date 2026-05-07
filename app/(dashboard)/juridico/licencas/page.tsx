/**
 * Controle de Licenças — entidade STUB (sem JSON em data/raw/ ainda).
 *
 * O <EntityPage /> detecta isStub('Licenca') e renderiza o EmptyState
 * orientando a colocar `juridico_licencas.json` em data/raw/.
 */
import { EntityPage } from "@/components/data-table/entity-page";

export default function LicencasPage() {
  return (
    <EntityPage
      title="Controle de Licenças"
      prismaModel="Licenca"
      rawFileName="juridico_licencas.json"
      rows={[]}
      columns={[]}
    />
  );
}

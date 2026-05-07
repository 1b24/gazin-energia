/**
 * Documentos Internos — entidade STUB (sem JSON em data/raw/ ainda).
 *
 * O <EntityPage /> detecta isStub('Documento') e renderiza o EmptyState
 * orientando a colocar `documentos.json` em data/raw/.
 */
import { EntityPage } from "@/components/data-table/entity-page";

export default function DocumentosPage() {
  return (
    <EntityPage
      title="Documentos Internos"
      prismaModel="Documento"
      rawFileName="documentos.json"
      rows={[]}
      columns={[]}
    />
  );
}

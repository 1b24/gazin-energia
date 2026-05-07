/**
 * Conserto de Equipamentos — entidade STUB (sem JSON em data/raw/ ainda).
 *
 * O <EntityPage /> detecta isStub('ConsertoEquipamento') e renderiza o
 * EmptyState orientando a colocar `manutencao_consertos.json` em data/raw/.
 */
import { EntityPage } from "@/components/data-table/entity-page";

export default function ConsertosPage() {
  return (
    <EntityPage
      title="Conserto de Equipamentos"
      prismaModel="ConsertoEquipamento"
      rawFileName="manutencao_consertos.json"
      rows={[]}
      columns={[]}
    />
  );
}

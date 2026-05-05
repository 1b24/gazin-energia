import { Info } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export interface EntityEmptyStateProps {
  fileName: string; // ex: "manutencao_corretiva.json"
}

/**
 * Renderizado pelo `<EntityPage />` quando `ENTITY_STATUS[prismaModel] === "stub"`.
 * Comunica ao usuário que o módulo aguarda o JSON do sistema antigo.
 */
export function EntityEmptyState({ fileName }: EntityEmptyStateProps) {
  return (
    <Card className="max-w-2xl">
      <CardContent className="flex items-start gap-3 py-6">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="flex flex-col gap-1.5 text-sm">
          <p className="font-medium">Módulo aguardando dados</p>
          <p className="text-muted-foreground">
            Esta entidade ainda não foi populada. Exporte o JSON do sistema
            antigo para{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              data/raw/{fileName}
            </code>{" "}
            e rode{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              npm run db:seed
            </code>
            .
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

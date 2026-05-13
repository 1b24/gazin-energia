/**
 * Card de KPI usado nas telas analíticas (Consumo, Geração, Injeção).
 *
 * Antes do Step 5 do refactor 2026-05-foundations, este componente vivia
 * copiado em 3 `*-table.tsx`. As 3 cópias eram quase idênticas — exceto
 * Injeção, que usava `truncate text-2xl` em vez de `text-xl
 * [overflow-wrap:anywhere]`. O `truncate` cortava valores longos como
 * "R$ 1.234.567,89"; padronizamos para overflow-wrap, que quebra a linha
 * sem perder caracteres.
 */
import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  title: string;
  value: ReactNode;
  description?: ReactNode;
  icon: ReactNode;
}

export function MetricCard({ title, value, description, icon }: Props) {
  return (
    <Card size="sm" className="min-h-28">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <div className="text-muted-foreground">{icon}</div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-end gap-1">
        <div className="text-xl font-semibold leading-tight [overflow-wrap:anywhere]">
          {value}
        </div>
        {description ? (
          <div className="text-xs text-muted-foreground">{description}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

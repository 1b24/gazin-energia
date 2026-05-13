"use client";

/**
 * Card colapsável de "registros não comparáveis" — usado em analytics que
 * comparam contra tarifa de distribuidora (Injeção, Geração) para listar
 * por que cada row foi pulada no cálculo.
 *
 * Default: aberto (transparência). Usuário pode fechar.
 */
import { AlertTriangle, ChevronDown } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export interface SkippedItem {
  rowId: string;
  /** Identificação humana — ex: "GR ENERGY · Auto Posto 04900 · Março/2026". */
  label: string;
  /** Categoria curta — vira badge. */
  reasonLabel: string;
  /** Frase explicando o motivo no contexto da row. */
  detail: string;
}

interface Props {
  skipped: SkippedItem[];
  /** Contexto do cálculo, vai no subtítulo. Ex: "cálculo de economia". */
  contextLabel: string;
  /** Quantos itens detalhar antes do "...e mais N". Default 20. */
  detailLimit?: number;
}

export function SkippedSection({
  skipped,
  contextLabel,
  detailLimit = 20,
}: Props) {
  const [open, setOpen] = useState(true);
  if (skipped.length === 0) return null;

  const summary = skipped.reduce<Record<string, number>>((acc, s) => {
    acc[s.reasonLabel] = (acc[s.reasonLabel] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          className="w-full text-left"
          aria-label={open ? "Recolher seção" : "Expandir seção"}
        >
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>
                Registros sem comparação ({skipped.length})
              </CardTitle>
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${
                    open ? "rotate-180" : ""
                  }`}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Não entraram no {contextLabel}. Clique no cabeçalho para
              recolher.
            </p>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3">
            {/* Resumo por motivo */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(summary).map(([reasonLabel, count]) => (
                <Badge key={reasonLabel} variant="outline">
                  {reasonLabel}: {count}
                </Badge>
              ))}
            </div>

            {/* Detalhes */}
            <div className="space-y-1.5 text-xs">
              {skipped.slice(0, detailLimit).map((s) => (
                <div
                  key={s.rowId}
                  className="flex items-start justify-between gap-3 border-b border-dashed pb-1.5"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.label}</div>
                    <div className="text-muted-foreground">{s.detail}</div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {s.reasonLabel}
                  </Badge>
                </div>
              ))}
              {skipped.length > detailLimit && (
                <p className="pt-2 text-muted-foreground">
                  ... e mais {skipped.length - detailLimit} registro(s).
                </p>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

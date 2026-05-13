/**
 * EmptyState para painéis analíticos quando não há dados no escopo atual.
 * Genérico — a mensagem específica vem do caller via prop `message`.
 */
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  /** Mensagem exibida. Default genérico. */
  message?: string;
}

export function EmptyAnalytics({
  message = "Sem dados para analisar.",
}: Props = {}) {
  return (
    <Card>
      <CardContent className="py-6 text-sm text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  );
}

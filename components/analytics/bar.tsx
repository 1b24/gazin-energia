/**
 * Barra de progresso simples usada em rankings de analytics (top filiais,
 * top usinas, top concessionárias). Width em % do max informado.
 *
 * Bug pré-existente em Injeção: o cálculo aceitava `value = 0` e ainda
 * mostrava 2% de largura por causa do `Math.max(2, ...)`. Padronizado para
 * só renderizar quando value > 0 — barra invisível quando não há contribuição.
 */
interface Props {
  value: number;
  max: number;
  /** Tailwind classes para a barra preenchida. Default `bg-primary`. */
  className?: string;
}

export function Bar({ value, max, className = "bg-primary" }: Props) {
  const width =
    max > 0 && value > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-2 rounded-full bg-muted">
      <div
        className={`h-full rounded-full ${className}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

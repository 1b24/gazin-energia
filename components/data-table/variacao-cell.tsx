"use client";

/**
 * Célula que mostra Δ% colorido + Δ absoluto pequeno embaixo. Usada nas
 * tabelas de entidades para evidenciar maior variação período-a-período.
 *
 * Para ORDENAR por magnitude da variação (|%|) — independentemente do sinal —
 * defina `sortingFn: variacaoSortingFn` na coluna do tanstack table.
 */
import type { Row } from "@tanstack/react-table";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

const fmtPct = (n: number | null) =>
  n == null
    ? "—"
    : `${n >= 0 ? "+" : ""}${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const fmtAbs = (n: number | null, unidade: string) =>
  n == null
    ? ""
    : `${n >= 0 ? "+" : ""}${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} ${unidade}`;

interface Props {
  pct: number | null;
  abs: number | null;
  unidade?: string;
  /** % a partir do qual marca como "alta variação" (default 25). */
  threshold?: number;
}

export function VariacaoCell({
  pct,
  abs,
  unidade = "",
  threshold = 25,
}: Props) {
  if (pct == null && abs == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const direction = pct == null ? 0 : pct > 0 ? 1 : pct < 0 ? -1 : 0;
  const big = pct != null && Math.abs(pct) >= threshold;

  const color =
    direction === 0
      ? "text-muted-foreground"
      : big
        ? direction > 0
          ? "text-destructive"
          : "text-emerald-600"
        : direction > 0
          ? "text-amber-600"
          : "text-emerald-700/80";

  const Icon = direction > 0 ? TrendingUp : direction < 0 ? TrendingDown : Minus;

  return (
    <div className={`flex flex-col items-end leading-tight ${color}`}>
      <span className="inline-flex items-center gap-1 text-xs font-semibold">
        <Icon className="h-3 w-3" />
        {fmtPct(pct)}
      </span>
      {abs != null && (
        <span className="text-[10px] text-muted-foreground">
          {fmtAbs(abs, unidade)}
        </span>
      )}
    </div>
  );
}

/**
 * sortingFn do tanstack table que ordena por |valor| do campo numérico
 * lido via `accessorKey`. Nulls vão pro final em ambas as direções.
 */
export function variacaoSortingFn<T>(
  rowA: Row<T>,
  rowB: Row<T>,
  columnId: string,
): number {
  const a = rowA.getValue(columnId) as number | null | undefined;
  const b = rowB.getValue(columnId) as number | null | undefined;
  const aNull = a == null;
  const bNull = b == null;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  return Math.abs(a) - Math.abs(b);
}

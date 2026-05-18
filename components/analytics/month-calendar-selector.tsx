"use client";

/**
 * Calendário mensal pra seleção de dias — colapsável.
 *
 * Comportamento:
 *  - Renderiza grade Seg-Dom com o mês de `reference` posicionado pelo
 *    calendário REAL (offset do dia da semana). Sem semanas fixas 1-7.
 *  - Cada dia é um botão togglável; seleção é estado externo (controlled).
 *  - Quando múltiplos períodos no filtro, esse calendário serve como
 *    REFERÊNCIA visual — a seleção de números (1..31) é aplicada em todos
 *    os períodos pelo parent.
 *  - Atalhos: "Mês inteiro", "Dias com dados", "Limpar".
 *  - Date nativo, zero dependência nova.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/** Brasil: semana começa segunda. */
const WEEKDAYS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export interface ReferencePeriod {
  ano: number;
  /** 0=Janeiro, 11=Dezembro — mesmo padrão do `Date` nativo. */
  mesIdx: number;
}

interface Props {
  reference: ReferencePeriod | null;
  /** Se true, mostra "(referência — seleção aplica em todos os períodos)". */
  isMultiPeriod?: boolean;
  selectedDays: Set<number>;
  onChange: (next: Set<number>) => void;
  /** Dias do mês com kWh > 0 no(s) período(s) de referência. Destaca na UI. */
  daysWithData?: Set<number>;
  defaultOpen?: boolean;
}

export function MonthCalendarSelector({
  reference,
  isMultiPeriod = false,
  selectedDays,
  onChange,
  daysWithData,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  if (!reference) return null;

  const { ano, mesIdx } = reference;
  // JS `getDay()`: 0=Dom..6=Sáb. Brasil: semana Seg-Dom, então:
  //   Dom(0) -> 6 espaços vazios antes do dia 1; Seg(1) -> 0; Ter(2) -> 1; ...
  const firstWeekday = new Date(ano, mesIdx, 1).getDay();
  const offset = (firstWeekday + 6) % 7;
  const daysInMonth = new Date(ano, mesIdx + 1, 0).getDate();

  const cells: Array<{ day: number | null; key: string }> = [];
  for (let i = 0; i < offset; i++) cells.push({ day: null, key: `b-${i}` });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, key: `d-${d}` });
  // Padding final pra fechar a última semana — mantém grid retangular.
  while (cells.length % 7 !== 0)
    cells.push({ day: null, key: `a-${cells.length}` });

  function toggle(d: number) {
    const next = new Set(selectedDays);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    onChange(next);
  }

  function selectAll() {
    const all = new Set<number>();
    for (let d = 1; d <= daysInMonth; d++) all.add(d);
    onChange(all);
  }

  function selectWithData() {
    if (!daysWithData || daysWithData.size === 0) return;
    onChange(new Set(daysWithData));
  }

  function clear() {
    onChange(new Set());
  }

  const summary =
    selectedDays.size === 0
      ? "nenhum dia selecionado · usando mês inteiro"
      : `${selectedDays.size} dia(s): ${formatSelectedDays(selectedDays)}`;

  return (
    <div className="rounded-md border bg-muted/10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-muted/30"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Selecionar dias
        </span>
        <span className="font-normal text-muted-foreground">{summary}</span>
      </button>

      {open && (
        <div className="space-y-2 border-t p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium">
              {MONTH_LABELS[mesIdx]} / {ano}
              {isMultiPeriod && (
                <span className="ml-2 text-muted-foreground">
                  (referência — seleção aplica em todos os períodos)
                </span>
              )}
            </span>
            <div className="flex flex-wrap gap-1 text-xs">
              <button
                type="button"
                onClick={selectAll}
                className="rounded border px-2 py-0.5 hover:bg-muted"
              >
                Mês inteiro
              </button>
              {daysWithData && daysWithData.size > 0 && (
                <button
                  type="button"
                  onClick={selectWithData}
                  className="rounded border px-2 py-0.5 hover:bg-muted"
                >
                  Dias com dados
                </button>
              )}
              {selectedDays.size > 0 && (
                <button
                  type="button"
                  onClick={clear}
                  className="rounded border px-2 py-0.5 text-muted-foreground hover:bg-muted"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS_PT.map((w) => (
              <div
                key={w}
                className="py-1 text-center text-[10px] font-medium text-muted-foreground"
              >
                {w}
              </div>
            ))}
            {cells.map((c) => {
              if (c.day == null) return <div key={c.key} />;
              const d = c.day;
              const active = selectedDays.has(d);
              const hasData = daysWithData?.has(d) ?? false;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggle(d)}
                  className={cn(
                    "h-8 rounded text-xs font-mono transition-colors",
                    active
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : hasData
                        ? "bg-emerald-500/10 text-foreground hover:bg-emerald-500/20"
                        : "bg-muted/30 text-muted-foreground hover:bg-muted",
                  )}
                  aria-pressed={active}
                  aria-label={`Dia ${d}${active ? " (selecionado)" : ""}${hasData ? " — tem dados" : ""}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Formata um Set de dias em string compacta com runs contíguos.
 *   {1,2,3,8,9}    -> "1–3, 8–9"
 *   {5,7,9}        -> "5, 7, 9"
 *   {8,9,10,11}    -> "8–11"
 *   {}             -> ""
 */
export function formatSelectedDays(set: Set<number>): string {
  if (set.size === 0) return "";
  const sorted = [...set].sort((a, b) => a - b);
  const runs: string[] = [];
  let runStart = sorted[0];
  let runEnd = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === runEnd + 1) {
      runEnd = sorted[i];
    } else {
      runs.push(runStart === runEnd ? `${runStart}` : `${runStart}–${runEnd}`);
      runStart = sorted[i];
      runEnd = sorted[i];
    }
  }
  runs.push(runStart === runEnd ? `${runStart}` : `${runStart}–${runEnd}`);
  return runs.join(", ");
}

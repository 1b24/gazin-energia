"use client";

/**
 * MultiSelect — dropdown com checkboxes, busca, atalhos "Todos/Nenhum".
 *
 * Semântica de estado (paralela ao filtro por coluna do data-table):
 *   - `value` vazio ([])         → SEM filtro (mostra tudo).
 *   - `value` com strings        → filtra para os valores listados.
 *
 * Para semântica de "limpar/selecionar tudo" o componente NÃO usa sentinela —
 * basta o chamador interpretar `[]` como "tudo". Isso evita confusão com o
 * sentinela `__none__` usado no data-table (que tem comportamento de
 * "intersecção com nada" porque mora dentro do tanstack).
 */
import { Check, ChevronDown, ListFilter, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Sufixo opcional renderizado em texto pequeno (ex: contagem). */
  hint?: string;
}

interface Props {
  label: string;
  options: MultiSelectOption[];
  /** Vazio = sem filtro (tudo selecionado por padrão visual). */
  value: string[];
  onChange: (next: string[]) => void;
  /** Placeholder do botão quando `value` está vazio. */
  placeholderAll?: string;
  searchPlaceholder?: string;
  /** Largura do dropdown. */
  width?: string;
  /** Renderização compacta (apenas ícone), sem label/placeholder textual. */
  compact?: boolean;
  /** Desabilita o controle. */
  disabled?: boolean;
}

export function MultiSelect({
  label,
  options,
  value,
  onChange,
  placeholderAll,
  searchPlaceholder = "Buscar...",
  width = "w-64",
  compact = false,
  disabled = false,
}: Props) {
  const [search, setSearch] = useState("");
  const selected = useMemo(() => new Set(value), [value]);
  const allSelected = value.length === 0;
  const active = !allSelected;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(term) ||
      o.value.toLowerCase().includes(term),
    );
  }, [options, search]);

  const toggle = (val: string, checked: boolean) => {
    // Estado "tudo" (vazio) → primeiro toggle materializa a seleção atual
    // como TODOS e remove/inclui o item conforme o usuário pediu.
    if (allSelected) {
      if (checked) {
        // Já estava "tudo selecionado" e o usuário marcou de novo — no-op.
        onChange([]);
      } else {
        // Desmarcar um item enquanto está "tudo" = selecionar todos menos
        // este. Materializa.
        onChange(options.filter((o) => o.value !== val).map((o) => o.value));
      }
      return;
    }
    const next = new Set(selected);
    if (checked) next.add(val);
    else next.delete(val);
    // Se acabou ficando com TODOS marcados, volta pro estado vazio (idempotente).
    if (next.size === options.length) {
      onChange([]);
      return;
    }
    onChange(Array.from(next));
  };

  const selectAll = () => onChange([]);
  const selectNone = () => {
    // Marca uma "seleção vazia explícita" — preserva o conceito de
    // "filtrar para nada" como zero strings reais, distinguindo via flag não
    // possível aqui. Convenção: vazio == tudo. Para "nenhum", marcamos um
    // valor inexistente. Mais simples: usuário desmarca tudo manualmente.
    // Como o pedido aqui é filtro de dashboard, "nenhum" tem pouco uso prático —
    // omitir o botão "Nenhum" mantém a semântica clara.
    void selected;
  };
  void selectNone;

  const triggerLabel = (() => {
    if (allSelected) return placeholderAll ?? `Todos (${label.toLowerCase()})`;
    if (value.length === 1) {
      const opt = options.find((o) => o.value === value[0]);
      return opt?.label ?? value[0];
    }
    return `${value.length} selecionado${value.length > 1 ? "s" : ""}`;
  })();

  return (
    <div className="flex flex-col gap-1">
      {!compact && (
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          className={cn(
            buttonVariants({
              variant: active ? "secondary" : "outline",
              size: "sm",
            }),
            "h-8 justify-between gap-2 text-xs",
            width,
            disabled && "opacity-50",
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <ListFilter
              className={cn("h-3.5 w-3.5", active && "text-primary")}
            />
            <span className="truncate">{triggerLabel}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>{label}</span>
              {active && (
                <button
                  type="button"
                  onClick={selectAll}
                  className="inline-flex items-center gap-1 text-[11px] font-normal text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" /> limpar
                </button>
              )}
            </DropdownMenuLabel>
            <div className="px-1 pb-1">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder={searchPlaceholder}
                className="h-7 text-xs"
              />
            </div>
            <div className="flex items-center gap-1 px-1 pb-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  selectAll();
                }}
              >
                <Check className="mr-1 h-3 w-3" />
                Todos
              </Button>
            </div>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                Nenhuma opção
              </div>
            ) : (
              filtered.map((opt) => {
                const isChecked = allSelected || selected.has(opt.value);
                return (
                  <DropdownMenuCheckboxItem
                    key={opt.value}
                    checked={isChecked}
                    onCheckedChange={(checked) =>
                      toggle(opt.value, Boolean(checked))
                    }
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="truncate">{opt.label}</span>
                    {opt.hint && (
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {opt.hint}
                      </span>
                    )}
                  </DropdownMenuCheckboxItem>
                );
              })
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

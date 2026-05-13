"use client";

/**
 * Hook compartilhado de filtros para painéis analíticos (Consumo, Geração,
 * Injeção). Centraliza:
 *   - opções de período (a partir de `ano + mes` de cada row),
 *   - opções de UF (com contagem),
 *   - estado multi-select para ambos,
 *   - filtragem AND (período E UF) com fast-path quando ambos vazios,
 *   - label resumo dos filtros aplicados (para subtítulo do painel).
 *
 * Semântica:
 *   - `selectedPeriods = []`  → sem filtro de período (mostra todos).
 *   - `selectedUfs = []`      → sem filtro de UF.
 *   - default opcional: mais recente período selecionado, preservando o
 *     comportamento anterior em Consumo (não somar histórico ao abrir).
 *
 * Antes do Step 6 do refactor 2026-05-foundations, Consumo tinha essa lógica
 * inline (~55 linhas); Geração e Injeção tinham só filtro de período single.
 */
import { useMemo, useState } from "react";

import { mesIndex, periodKey, periodoLabel } from "@/lib/period";

interface RowWithPeriod {
  ano?: number | null;
  mes?: string | null;
}

export interface AnalyticsExtractors<T extends RowWithPeriod> {
  /** Extrai a UF associada à row (filial.uf, usina.uf, etc). Null = sem UF. */
  uf?: (row: T) => string | null;
}

export interface PeriodOption {
  key: string;
  label: string;
  ano: number;
  mesIdx: number;
}

export interface UfOption {
  value: string;
  label: string;
  /** Contagem de registros nessa UF (exibida como sufixo no MultiSelect). */
  hint: string;
}

export interface AnalyticsFiltersResult<T> {
  periodOptions: PeriodOption[];
  ufOptions: UfOption[];
  selectedPeriods: string[];
  setSelectedPeriods: (next: string[]) => void;
  selectedUfs: string[];
  setSelectedUfs: (next: string[]) => void;
  /** Rows após aplicar AND(período, UF). */
  filteredRows: T[];
  /** Subtítulo legível: "abril/2026 · 2 UFs", "todos os períodos", etc. */
  filterSummary: string;
  /**
   * Mesmo formato de `MultiSelect.options`: derivado de `periodOptions`,
   * pronto para passar como prop.
   */
  periodMultiOptions: { value: string; label: string }[];
}

export interface UseAnalyticsFiltersOptions {
  /** Default = mais recente período selecionado. Quando `false`, abre vazio. */
  selectLatestPeriodByDefault?: boolean;
}

export function useAnalyticsFilters<T extends RowWithPeriod>(
  rows: T[],
  extractors: AnalyticsExtractors<T> = {},
  opts: UseAnalyticsFiltersOptions = {},
): AnalyticsFiltersResult<T> {
  const { selectLatestPeriodByDefault = true } = opts;
  const ufExtractor = extractors.uf;

  // ----- Opções de período (cronológico) -----
  const periodOptions = useMemo<PeriodOption[]>(() => {
    const periods = new Map<string, PeriodOption>();
    for (const row of rows) {
      const ano = row.ano ?? 0;
      const idx = mesIndex(row.mes);
      if (ano <= 0 || idx < 0) continue;
      const key = periodKey(row);
      if (!key) continue;
      periods.set(key, {
        key,
        label: periodoLabel(row),
        ano,
        mesIdx: idx,
      });
    }
    return Array.from(periods.values()).sort(
      (a, b) => a.ano - b.ano || a.mesIdx - b.mesIdx,
    );
  }, [rows]);

  // ----- Opções de UF com contagem -----
  const ufOptions = useMemo<UfOption[]>(() => {
    if (!ufExtractor) return [];
    const counts = new Map<string, number>();
    for (const row of rows) {
      const uf = ufExtractor(row);
      if (!uf) continue;
      counts.set(uf, (counts.get(uf) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
      .map(([value, count]) => ({
        value,
        label: value,
        hint: String(count),
      }));
  }, [rows, ufExtractor]);

  // ----- Estado multi-select -----
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(() => {
    if (!selectLatestPeriodByDefault) return [];
    const latest = periodOptions.at(-1)?.key;
    return latest ? [latest] : [];
  });
  const [selectedUfs, setSelectedUfs] = useState<string[]>([]);

  // ----- Aplicação dos filtros -----
  const filteredRows = useMemo(() => {
    if (selectedPeriods.length === 0 && selectedUfs.length === 0) return rows;
    const periodSet = new Set(selectedPeriods);
    const ufSet = new Set(selectedUfs);
    return rows.filter((row) => {
      if (periodSet.size > 0 && !periodSet.has(periodKey(row))) return false;
      if (ufSet.size > 0) {
        if (!ufExtractor) return false;
        const uf = ufExtractor(row);
        if (!uf || !ufSet.has(uf)) return false;
      }
      return true;
    });
  }, [rows, selectedPeriods, selectedUfs, ufExtractor]);

  // ----- Resumo legível -----
  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (selectedPeriods.length === 0) {
      parts.push("todos os períodos");
    } else if (selectedPeriods.length === 1) {
      parts.push(
        periodOptions.find((p) => p.key === selectedPeriods[0])?.label ??
          selectedPeriods[0],
      );
    } else {
      parts.push(`${selectedPeriods.length} períodos`);
    }
    if (selectedUfs.length > 0) {
      parts.push(
        selectedUfs.length === 1
          ? `UF ${selectedUfs[0]}`
          : `${selectedUfs.length} UFs`,
      );
    }
    return parts.join(" · ");
  }, [selectedPeriods, selectedUfs, periodOptions]);

  const periodMultiOptions = useMemo(
    () =>
      periodOptions.map((option) => ({
        value: option.key,
        label: option.label,
      })),
    [periodOptions],
  );

  return {
    periodOptions,
    ufOptions,
    selectedPeriods,
    setSelectedPeriods,
    selectedUfs,
    setSelectedUfs,
    filteredRows,
    filterSummary,
    periodMultiOptions,
  };
}

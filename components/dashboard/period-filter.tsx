"use client";

/**
 * Filtro de período (mês + ano) para o dashboard. Atualiza search params
 * `?ano=&mes=` preservando outros (ex: ?filial=). Sem params = mês corrente.
 */
import { useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const MESES = [
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

export function PeriodFilter({
  ano,
  mes,
  yearOptions,
}: {
  /** Ano atual selecionado (1..2099) */
  ano: number;
  /** Mês atual (1..12) */
  mes: number;
  /** Anos sugeridos no dropdown — geralmente os anos com dados. */
  yearOptions: number[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  // Garante que o ano vigente está nas opções (caso seja além do dataset).
  const years = Array.from(new Set([ano, ...yearOptions])).sort((a, b) => b - a);
  const yearItems = years.map((y) => ({ value: String(y), label: String(y) }));

  function update(next: { ano?: number; mes?: number }) {
    const sp = new URLSearchParams(params);
    if (next.ano != null) sp.set("ano", String(next.ano));
    if (next.mes != null) sp.set("mes", String(next.mes));
    router.push(`/?${sp.toString()}`);
  }

  function reset() {
    const sp = new URLSearchParams(params);
    sp.delete("ano");
    sp.delete("mes");
    const qs = sp.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  const isCustom = params.has("ano") || params.has("mes");

  return (
    <div className="flex items-center gap-1.5">
      <Select
        items={MESES}
        value={String(mes)}
        onValueChange={(v) => update({ mes: Number(v) })}
      >
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue placeholder="Mês" />
        </SelectTrigger>
        <SelectContent>
          {MESES.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={yearItems}
        value={String(ano)}
        onValueChange={(v) => update({ ano: Number(v) })}
      >
        <SelectTrigger className="h-8 w-24 text-xs">
          <SelectValue placeholder="Ano" />
        </SelectTrigger>
        <SelectContent>
          {yearItems.map((y) => (
            <SelectItem key={y.value} value={y.value}>
              {y.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isCustom && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={reset}
          className="h-8 text-xs"
        >
          Atual
        </Button>
      )}
    </div>
  );
}

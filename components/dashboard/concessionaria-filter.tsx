"use client";

/**
 * Filtro por Concessionária (fornecedor de injeção). URL param `?conc=<nome>`.
 * Vazio = todas. Afeta o card "Injeção por Concessionária" do dashboard.
 */
import { useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ConcessionariaFilter({ options }: { options: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("conc") ?? "";

  if (options.length === 0) return null;

  const items = [
    { value: "", label: "Todas as concessionárias" },
    ...options.map((o) => ({ value: o, label: o })),
  ];

  return (
    <Select
      items={items}
      value={current}
      onValueChange={(v) => {
        const sp = new URLSearchParams(params);
        if (v) sp.set("conc", v);
        else sp.delete("conc");
        const qs = sp.toString();
        router.push(qs ? `/?${qs}` : "/");
        router.refresh();
      }}
    >
      <SelectTrigger className="h-8 w-56 text-xs">
        <SelectValue placeholder="Todas as concessionárias" />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value || "__all"} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

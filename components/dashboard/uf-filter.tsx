"use client";

/**
 * Filtro por UF (estado). URL param `?uf=SP`. Vazio = todas. Visível pra
 * todos os roles, mas opções limitam-se ao escopo do usuário.
 */
import { useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function UfFilter({ options }: { options: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("uf") ?? "";

  if (options.length === 0) return null;

  const items = [
    { value: "", label: "Todos os estados" },
    ...options.map((u) => ({ value: u, label: u })),
  ];

  return (
    <Select
      items={items}
      value={current}
      onValueChange={(v) => {
        const sp = new URLSearchParams(params);
        if (v) sp.set("uf", v);
        else sp.delete("uf");
        const qs = sp.toString();
        router.push(qs ? `/?${qs}` : "/");
        router.refresh();
      }}
    >
      <SelectTrigger className="h-8 w-40 text-xs">
        <SelectValue placeholder="Todos os estados" />
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

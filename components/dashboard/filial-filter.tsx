"use client";

/**
 * Dropdown server-driven via search-param `?filial=<id>`. Apenas admin vê;
 * gestor_filial/operacional já está limitado pelo scopedPrisma.
 */
import { useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Option {
  id: string;
  label: string;
}

export function FilialFilter({ options }: { options: Option[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("filial") ?? "";

  const items = [{ value: "", label: "Todas as filiais" }, ...options.map((o) => ({ value: o.id, label: o.label }))];

  return (
    <Select
      items={items}
      value={current}
      onValueChange={(v) => {
        const sp = new URLSearchParams(params);
        if (v) sp.set("filial", v);
        else sp.delete("filial");
        router.push(`/?${sp.toString()}`);
      }}
    >
      <SelectTrigger className="h-8 w-64 text-xs">
        <SelectValue placeholder="Todas as filiais" />
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

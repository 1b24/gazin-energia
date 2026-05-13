/**
 * Invariantes do registry de módulos da sidebar.
 *
 * Bug recorrente que esse teste blinda: quando um módulo tem `submodules`,
 * a sidebar colapsada usa `basePath` como href. Sem `page.tsx` em
 * `app/(dashboard)<basePath>/page.tsx`, o usuário toma 404. Já aconteceu
 * com `/juridico` (resolvido com redirect) e `/manutencao` (idem).
 *
 * Este teste falha o CI se alguém adicionar novo módulo com submodules e
 * esquecer do fallback.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MODULES } from "./registry";

describe("MODULES registry — invariantes", () => {
  it("todo módulo com submodules tem page.tsx no basePath (ou um submodule aponta para o próprio basePath)", () => {
    const root = process.cwd();
    const missing: string[] = [];

    for (const mod of MODULES) {
      if (!mod.submodules || mod.submodules.length === 0) continue;

      // Caso especial OK: um dos submodules aponta exatamente para o
      // basePath. Ex: /consumo tem submodule { path: "/consumo" } que
      // resolve pra mesma página real.
      const hasMatchingSub = mod.submodules.some(
        (s) => s.path === mod.basePath,
      );
      if (hasMatchingSub) continue;

      // Senão, precisa de page.tsx (geralmente um redirect).
      const segments = mod.basePath.split("/").filter(Boolean);
      const pageFile = path.join(
        root,
        "app",
        "(dashboard)",
        ...segments,
        "page.tsx",
      );

      if (!existsSync(pageFile)) {
        missing.push(
          `${mod.id} (basePath: ${mod.basePath}) — faltando page.tsx em ${pageFile}`,
        );
      }
    }

    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("todo basePath e submodule.path começam com '/'", () => {
    for (const mod of MODULES) {
      expect(
        mod.basePath.startsWith("/"),
        `${mod.id}.basePath não começa com '/'`,
      ).toBe(true);
      for (const sub of mod.submodules ?? []) {
        expect(
          sub.path.startsWith("/"),
          `${mod.id}.${sub.id}.path não começa com '/'`,
        ).toBe(true);
      }
    }
  });

  it("ids de módulos são únicos", () => {
    const ids = MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

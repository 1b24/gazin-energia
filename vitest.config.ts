/**
 * Vitest — rede de segurança para funções puras críticas (period, variação,
 * serialize, helpers de export). NÃO cobre server actions, RSC, ou React
 * components ainda — esses exigem `jsdom` e mocks de auth/prisma, ficam para
 * step posterior do refactor.
 */
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.ts"],
    // Garante que `lib/generated/prisma` (output do Prisma generate) não entra
    // no scan se algum dia houver `.test.ts` lá por engano.
    exclude: ["lib/generated/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});

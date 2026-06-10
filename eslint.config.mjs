import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Formatters pt-BR são centralizados em lib/format.ts — redefinir um const
  // local com o mesmo nome reintroduz a deriva que o refactor 2026-05 Step 5
  // (e a limpeza 2026-06) removeram. Variantes com semântica própria devem
  // ganhar OUTRO nome (ex: fmtSignedPct em variacao-cell).
  {
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "VariableDeclarator[id.name=/^fmt(Kwh|BRL|BRLCompact|Pct|Int|Compact|Rate)$/]",
          message:
            "Importe o formatter de @/lib/format em vez de redefinir localmente. Semântica diferente? Use outro nome.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

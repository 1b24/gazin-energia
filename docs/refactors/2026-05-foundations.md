# Refactor 2026-05 — Foundations

Brief de refactor sequencial. Source of truth para qualquer sessão (Claude ou
humano) que retome o trabalho. Releia este arquivo **antes** de mexer em código
tocado por um step ativo.

Convenção: cada step é independente e termina com **um commit dedicado**.
Não junte commits de steps diferentes.

---

## Status atual

- [x] **Step 1a** — Apagar artefatos locais seguros (logs + .pglite-* extras) — *fechado em 12/05/2026, sessão da tarde*
- [ ] **Step 1b** — Separar commits por tema da worktree atual *(conduzido pelo Heitor — Claude não dirige, só apoia se solicitado)*
- [x] **Step 2** — A1: `retryClosedConnection` em todas as páginas de leitura *(fechado em 12/05/2026, sessão da noite)*
- [x] **Step 3** — C2 mínimo: Vitest + testes para funções puras críticas *(fechado em 12/05/2026; 36 testes / 3 arquivos / 1.4s)*
- [x] **Step 4** — A3: extrair `lib/period.ts` *(fechado em 12/05/2026; 58 testes passando, bug "MarÃ§o" no injecao-table corrigido de quebra)*
- [x] **Step 5** — A2: extrair analytics helpers + centralizar formatters *(fechado em 12/05/2026; ~200 linhas duplicadas removidas, 69 testes passando, 3 bugs colaterais corrigidos)*
- [x] **Step 6** — B2: hook `useAnalyticsFilters` e replicar multi-select em Injeção/Geração *(fechado em 12/05/2026; Geração e Injeção ganharam filtro de UF que não existia; Consumo migrou pro hook removendo ~55 linhas; 69 testes passando)*
- [ ] **Step 7** — B3: autorização fina de `/api/files/...`
- [ ] **Step 8** — B1: quebrar `lib/dashboard.ts` por feature

---

## Princípios invioláveis (não tocar nessas regiões durante este refactor)

1. **RBAC**: `lib/db.ts` (`scopedPrisma`, `userCanAccessId`, `applyCreateScope`,
   `MODEL_SCOPE`). Refactor pode **adicionar** funções aqui (ex: B3 vai), mas
   não alterar comportamento existente.
2. **Audit obrigatório**: toda mutation grava `AuditLog` na mesma transação. Não
   envolver mutations em `retryClosedConnection` (re-executar duplicaria audit).
3. **Soft delete + idempotência de seed**: `deletedAt`, `zohoId` único, lógica de
   preservação de edição manual em `scripts/import-raw.ts`. Fora de escopo.
4. **Schema Prisma**: nenhum step desta lista altera `prisma/schema.prisma` nem
   gera migration. Se aparecer necessidade, vira step separado fora deste brief.
5. **Pendência de senha de Filial** (resolvida em 12/05): `senha` permanece no
   schema mas **nunca** no payload client. Não reverter.

---

## Step 1b — Separar commits por tema da worktree atual

**Quem conduz:** Heitor (humano). Claude apenas inspeciona/sugere se pedido.

**Razão:** worktree tem 29 arquivos modificados misturando dashboard, data-table,
import, audit, layout, sidebar, dark mode, multi-select, retry, segurança. Fazer
qualquer refactor sobre essa base gera diffs ilegíveis.

**Temas sugeridos para separar (ordem de commit recomendada):**

1. `chore: gitignore for runtime/dev artifacts`
   - `.gitignore`
2. `feat(theme): dark mode + theme toggle`
   - `app/globals.css`
   - `app/layout.tsx` (script de tema)
   - `app/(dashboard)/layout.tsx`
   - `components/layout/theme-toggle.tsx` (novo)
3. `feat(layout): collapsible sidebar`
   - `components/layout/sidebar.tsx`
4. `feat(data-table): excel-style column filters + sticky modes + resize fix`
   - `components/data-table/data-table.tsx`
5. `feat(data-table): debounced global search`
   - `components/data-table/data-table.tsx` (delta posterior; se acumulou no mesmo arquivo, separar com `git add -p`)
6. `feat(dashboard): replace licenças card with concessionária analytics + filter`
   - `app/(dashboard)/page.tsx`
   - `lib/dashboard.ts` (apenas seções de concessionária + filtros)
   - `components/dashboard/concessionaria-filter.tsx` (novo)
   - `components/dashboard/geracao-chart.tsx` (cores dark mode)
   - `components/dashboard/orcado-realizado-chart.tsx` (cores dark mode)
7. `feat(consumo): analytics panel above table`
   - `app/(dashboard)/consumo/consumo-table.tsx`
   - `app/(dashboard)/consumo/page.tsx`
8. `feat(geracao): analytics panel + meta mensal fix`
   - `app/(dashboard)/geracao/geracao-table.tsx`
   - `app/(dashboard)/geracao/actions.ts`
   - `lib/schemas/geracao.ts`
9. `feat(injecao): analytics panel + show archived toggle`
   - `app/(dashboard)/injecao/injecao-table.tsx`
   - `app/(dashboard)/injecao/page.tsx`
10. `feat(juridico): redirect index to /juridico/processos`
    - `app/(dashboard)/juridico/page.tsx` (novo)
11. `fix(audit): fallback by email when session userId is stale`
    - `lib/audit.ts`
    - `lib/actions/crud.ts` (apenas as partes de audit/serialize)
    - `app/(dashboard)/geracao/actions.ts`
    - `app/(dashboard)/manutencao/limpeza/actions.ts`
12. `feat(crud-export): include relations, strip sensitive fields, flatten for xlsx`
    - `lib/actions/crud.ts` (partes de bulkExport)
13. `fix(import): preserve manual edits + normalize filial .10 → .1`
    - `scripts/import-raw.ts`
    - `scripts/validate-migration.ts`
14. `chore(scripts): npm run lint → eslint .`
    - `package.json`
15. `refactor(consumo): rename valor labels to semantic (P/FP/Total/Injeção)`
    - `lib/schemas/consumo.ts`
16. `fix(consumo): consumo total ignores archived in analytics`
    - `app/(dashboard)/consumo/consumo-table.tsx` (parte de analytics)
17. `feat(consumo): variation columns + multi-select filter + UF filter`
    - `app/(dashboard)/consumo/consumo-table.tsx` (parte de Δ + MultiSelect)
    - `app/(dashboard)/consumo/page.tsx` (variacao + uf select)
    - `lib/variacao.ts` (novo)
    - `components/data-table/variacao-cell.tsx` (novo)
    - `components/ui/multi-select.tsx` (novo)
18. `feat(db): export retryClosedConnection from lib/db`
    - `lib/db.ts` (apenas o bloco novo)
    - `lib/dashboard.ts` (remoção da cópia local + import)
    - `app/(dashboard)/consumo/page.tsx` (aplicação)
19. `fix(security): explicit select on filiais without senha + form drop + sensitive-field denylist in export`
    - `app/(dashboard)/filiais/page.tsx`
    - `lib/schemas/filial.ts`
    - `lib/actions/crud.ts` (SENSITIVE_FIELD_PATTERN, isSensitiveKey)
20. `fix(security): SVG upload allowlist + attachment headers`
    - `lib/actions/upload.ts`
    - `app/api/files/[...path]/route.ts`
21. `fix(dashboard): consumoByKey uses uc|filialId composite`
    - `lib/dashboard.ts` (parte de getInjecaoPorConcessionaria)
22. `docs: codex change report + this refactor brief`
    - `RELATORIO_MUDANCAS_CODEX.md`
    - `relatorio_mudancas_codex.md`
    - `docs/refactors/2026-05-foundations.md`
    - `BRIEF.md` (Tarefa 8)
    - `tsconfig.json` (se houve mudança relevante)
    - `lib/format.ts` (se houve mudança relevante)

**Notas:**
- Não bater de cabeça com `git add -p` se virar pesadelo. Alternativa: criar
  branches `wip/<tema>` e fazer cherry-pick parcial.
- Se um arquivo ficou tocado por vários temas, comitar primeiro o tema mais
  isolável e amend depois pode ser mais simples que separar hunks.
- Audit log de quem comitou o quê **não interessa neste contexto** — o que
  interessa é git history legível.

**Done when:** worktree limpa (`git status` mostra só untracked esperados ou nada).

**Validação:**
- [ ] `npx tsc --noEmit` passa após cada commit
- [ ] `npx eslint .` passa após cada commit
- [ ] `npm run check:rbac` passa após cada commit

**Rollback:** cada commit é reversível individualmente via `git revert <sha>`.

---

## Step 2 — A1: `retryClosedConnection` em páginas de leitura

**Objetivo:** envolver toda query de leitura nas páginas `app/(dashboard)/*/page.tsx`
com `retryClosedConnection` (exportado de `lib/db.ts`), eliminando 500s
transitórios do PGLite em dev.

**Arquivos no escopo:**
- `app/(dashboard)/injecao/page.tsx`
- `app/(dashboard)/geracao/page.tsx`
- `app/(dashboard)/filiais/page.tsx`
- `app/(dashboard)/fornecedores/page.tsx`
- `app/(dashboard)/usinas/page.tsx`
- `app/(dashboard)/orcamento/page.tsx`
- `app/(dashboard)/venda-kwh/page.tsx`
- `app/(dashboard)/manutencao/preventiva/page.tsx`
- `app/(dashboard)/manutencao/limpeza/page.tsx`
- `app/(dashboard)/juridico/processos/page.tsx`
- `app/(dashboard)/juridico/licencas/page.tsx`

**Já feito (não retocar):**
- `app/(dashboard)/consumo/page.tsx` — fechado em 12/05.
- `lib/dashboard.ts` — já usa o helper internamente.

**Padrão de transformação:**

```ts
// antes
const rows = await db.x.findMany({ where, include });

// depois
import { retryClosedConnection, scopedPrisma } from "@/lib/db";
const rows = await retryClosedConnection(() =>
  db.x.findMany({ where, include }),
);
```

Em `Promise.all`, envolver **cada** query independentemente, não o `Promise.all`:

```ts
// CORRETO
const [a, b] = await Promise.all([
  retryClosedConnection(() => db.a.findMany(...)),
  retryClosedConnection(() => db.b.findMany(...)),
]);

// ERRADO (retry refaz ambas as queries)
const [a, b] = await retryClosedConnection(() => Promise.all([
  db.a.findMany(...),
  db.b.findMany(...),
]));
```

**O que NÃO mexer:**
- `*/actions.ts` (server actions — mutations dentro de transação).
- Código dentro de `prisma.$transaction(...)`.
- `scripts/import-raw.ts`, `prisma/seed.ts`.
- `app/api/**` (rotas de API com seu próprio padrão de erro).

**Done when:** todas as páginas listadas envolvem as queries de leitura.

**Validação:**
- [ ] `npx tsc --noEmit` passa
- [ ] `npx eslint .` passa
- [ ] `npm run check:rbac` passa
- [ ] Smoke manual: derrubar PGLite, abrir 3 páginas (espera 500 da `lib/dashboard.ts` já tratado), religar PGLite, navegar de novo (esperar sucesso após retry transparente)

**Rollback:** `git revert` do commit. Sem efeito colateral.

**Commit message:** `refactor(db): wrap read queries with retryClosedConnection`

---

## Step 3 — C2 mínimo: Vitest + testes para funções puras críticas

**Objetivo:** rede de segurança antes dos próximos refactors. Cobrir apenas
funções **puras** (sem efeito colateral, sem DB, sem auth) que já causaram bugs
ou são base dos próximos steps.

**Setup:**
1. `npm i -D vitest @vitest/ui`
2. Criar `vitest.config.ts`:
   ```ts
   import { defineConfig } from "vitest/config";
   import path from "node:path";
   export default defineConfig({
     test: { environment: "node", include: ["lib/**/*.test.ts"] },
     resolve: { alias: { "@": path.resolve(__dirname) } },
   });
   ```
3. Adicionar ao `package.json`:
   ```json
   "test": "vitest run",
   "test:watch": "vitest"
   ```

**Cobertura mínima (criar um `.test.ts` por arquivo):**

- `lib/serialize.test.ts`
  - Decimal → number
  - Date preservada
  - Arrays e objetos aninhados
  - null/undefined pass-through
  - BigInt (se existir no fluxo)

- `lib/variacao.test.ts`
  - `prevPeriod`: jan/2026 → dez/2025; fev → jan; junho → maio
  - `prevPeriod`: mes inválido retorna null
  - `variacao`: anterior=0 retorna pct=null
  - `variacao`: null em qualquer lado retorna {abs:null, pct:null}
  - `variacao`: queda (atual < anterior) retorna pct negativo

- `lib/period.test.ts` *(arquivo nasce no Step 4 — preparar o teste agora,
  rodar no Step 4)*
  - `mesIndex`: case-insensitive ("Março", "março", "MARÇO")
  - `normalizeMes`: trim + Title Case
  - `periodKey`: formato `YYYY-MM`

- `lib/actions/crud.test.ts` (apenas as funções helper, não as actions)
  - `isSensitiveKey`: "senha", "userSenha", "passwordHash" → true
  - `isSensitiveKey`: "usuario", "valorTotal" → false
  - `flattenRelations`: objeto com filial → `filial_codigo` etc.
  - `flattenRelations`: pula campos sensíveis em qualquer nível
  - `flattenRelations`: arrays viram `<key>_count`

**O que NÃO testar agora:**
- Server actions (precisam mock de auth/prisma).
- Componentes React (precisam `jsdom`).
- Rotas de API.

**Done when:**
- `npm run test` passa.
- Mínimo 4 arquivos de teste criados.
- Cada função listada tem pelo menos 3 casos.

**Validação:**
- [ ] `npm run test` passa
- [ ] `npx tsc --noEmit` passa (tests não devem quebrar build)
- [ ] CI mental: tests rodam em < 5s

**Rollback:** apagar `vitest.config.ts` + `lib/**/*.test.ts`. Devolve `package.json`.

**Commit message:** `test: vitest setup + pure function coverage (serialize, variacao, period, crud helpers)`

---

## Step 4 — A3: extrair `lib/period.ts`

**Objetivo:** consolidar tudo relacionado a período (meses pt-BR, conversão,
chave, label) em um lugar. Hoje `MESES_PT` aparece em `lib/dashboard.ts` e em
`app/(dashboard)/consumo/consumo-table.tsx` com variantes (Title Case vs
lowercase). `prevPeriod` está em `lib/variacao.ts`.

**Criar `lib/period.ts`** com:

```ts
export const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

export type MesPt = (typeof MESES_PT)[number];

export interface PeriodKey { ano: number; mes: string; }

export interface CurrentPeriod {
  ano: number;
  mesIdx: number;      // 0..11
  mesPt: MesPt;        // "Janeiro".."Dezembro"
  mesNum: string;      // "01".."12"
}

export function getCurrentPeriod(): CurrentPeriod;
export function makePeriod(ano: number, mesIdx: number): CurrentPeriod;
export function periodFromQuery(q: { ano?: string; mes?: string }): CurrentPeriod;
export function last12MonthsEndingAt(p?: CurrentPeriod): { ano: number; mesIdx: number }[];
export function mesIndex(mes: string | null | undefined): number;
export function normalizeMes(mes: string): MesPt | null;
export function periodKey(row: { ano?: number | null; mes?: string | null }): string;
export function periodoLabel(row: { ano?: number | null; mes?: string | null }): string;
export function prevPeriod(p: PeriodKey): PeriodKey | null;
```

**Mover para cá** (e deletar das origens):
- `MESES_PT` de `lib/dashboard.ts`
- `getCurrentPeriod`, `makePeriod`, `periodFromQuery`, `last12MonthsEndingAt`
  de `lib/dashboard.ts`
- `prevPeriod` de `lib/variacao.ts` (mantém `variacao` lá)
- `mesIndex`, `periodKey`, `periodoLabel`, `MESES_PT` (lowercase) de
  `app/(dashboard)/consumo/consumo-table.tsx`
- (idem em `geracao-table.tsx` e `injecao-table.tsx` se houver cópias)

**Updates de import:**
- `lib/dashboard.ts` importa de `@/lib/period`
- `lib/variacao.ts` importa `prevPeriod` (mas se a definição mudou de
  arquivo, ajustar)
- `app/(dashboard)/consumo/consumo-table.tsx` importa tudo de `@/lib/period`
- analytics de Geração/Injeção idem (quando passarmos por eles)

**Done when:**
- `lib/period.ts` existe.
- Não há mais `MESES_PT` definido fora de `lib/period.ts`.
- Não há mais `mesIndex` redefinido em `*-table.tsx`.

**Validação:**
- [ ] `npx tsc --noEmit` passa
- [ ] `npx eslint .` passa
- [ ] `npm run test` passa (tests de `period.test.ts` ficam verdes)
- [ ] Smoke: abrir `/`, `/consumo`, `/geracao`, `/injecao` — KPIs e labels de mês
  iguais ao baseline.

**Rollback:** `git revert`. Único risco real é alguém ter ficado com import
quebrado — `tsc` pega.

**Commit message:** `refactor(period): centralize month/period helpers in lib/period`

---

## Step 5 — A2: extrair analytics helpers + centralizar formatters

**Objetivo:** acabar com a duplicação física entre
`consumo-table.tsx`, `geracao-table.tsx`, `injecao-table.tsx`.

**Criar:**

1. `lib/format.ts` (já existe — consolidar):
   ```ts
   export const fmtKwh = (n: number | null | undefined) => ...;
   export const fmtBRL = (n: number | null | undefined) => ...;
   export const fmtPct = (n: number | null | undefined) => ...;
   export const fmtRate = (n: number | null | undefined) => ...; // R$/kWh
   export const fmtCompact = (n: number | null | undefined) => ...;
   export const fmtInt = (n: number | null | undefined) => ...;
   ```
   Cada `*-table.tsx` redefine essas 5 funções localmente. Centralizar.

2. `components/analytics/metric-card.tsx`:
   ```tsx
   interface Props {
     title: string;
     value: ReactNode;
     description?: ReactNode;
     icon: ReactNode;
   }
   export function MetricCard({ title, value, description, icon }: Props): JSX.Element;
   ```

3. `components/analytics/bar.tsx`:
   ```tsx
   interface Props { value: number; max: number; className?: string; }
   export function Bar({ value, max, className }: Props): JSX.Element;
   ```

4. `components/analytics/empty-state.tsx`:
   ```tsx
   export function EmptyAnalytics({ message }: { message?: string }): JSX.Element;
   ```

**Migrar** os 3 `*-table.tsx`:
- Remover definições locais de `MetricCard`, `Bar`, `EmptyAnalytics`, `fmt*`.
- Importar de `@/components/analytics/*` e `@/lib/format`.
- Manter helpers de domínio local (consumoP, consumoFp, valorTotal — eles são
  específicos da entidade).

**Done when:**
- Os 3 `*-table.tsx` não definem `MetricCard`, `Bar`, `EmptyAnalytics` nem `fmt*`.
- `lib/format.ts` é único source of truth para formatters.
- Visual continua idêntico ao baseline.

**Validação:**
- [ ] `npx tsc --noEmit` passa
- [ ] `npx eslint .` passa
- [ ] Visual diff: abrir `/consumo`, `/geracao`, `/injecao` — KPIs e gráficos
  iguais ao baseline (printar antes vs depois ajuda).

**Rollback:** `git revert`. Componentes novos isolados — sem mudança em
comportamento.

**Commit message:** `refactor(analytics): extract MetricCard/Bar/EmptyAnalytics + centralize formatters`

---

## Step 6 — B2: `useAnalyticsFilters` + replicar multi-select

**Objetivo:** hook compartilhado para filtros de analytics (período + UF +
extensível). Replicar em Injeção/Geração o que Consumo já tem.

**Criar `lib/hooks/use-analytics-filters.ts`:**

```ts
export interface AnalyticsExtractors<T> {
  period: (row: T) => string | null;
  uf?: (row: T) => string | null;
}

export interface AnalyticsFiltersResult<T> {
  periodOptions: Array<{ value: string; label: string }>;
  ufOptions: Array<{ value: string; label: string; hint?: string }>;
  selectedPeriods: string[];
  setSelectedPeriods: (v: string[]) => void;
  selectedUfs: string[];
  setSelectedUfs: (v: string[]) => void;
  filteredRows: T[];
  filterSummary: string;
}

export function useAnalyticsFilters<T>(
  rows: T[],
  extractors: AnalyticsExtractors<T>,
  opts?: { selectLatestPeriodByDefault?: boolean },
): AnalyticsFiltersResult<T>;
```

**Migrar:**
- `consumo-table.tsx`: trocar o bloco atual de filtros pelo hook.
- `injecao-table.tsx`: aplicar o mesmo (período + UF). Verificar se Injecao tem
  UF acessível via filial — pode exigir `select: { uf: true }` no page.
- `geracao-table.tsx`: aplicar período + UF (UF vem de `usina.uf`).

**Cuidados:**
- Manter default = "último período selecionado" (comportamento atual de Consumo).
- Hook não deve assumir tipo concreto — usar generics `<T>`.
- Empty `selectedPeriods` = todos (semântica consistente com `MultiSelect`).

**Done when:**
- `useAnalyticsFilters` existe.
- 3 telas analytics usam o hook.
- Cada uma tem MultiSelect de período + MultiSelect de UF.

**Validação:**
- [ ] `npx tsc --noEmit` passa
- [ ] `npx eslint .` passa
- [ ] Smoke: marcar 2 UFs em Consumo, KPIs respondem. Idem Injeção e Geração.

**Rollback:** `git revert`. Visual + comportamento volta ao baseline pré-step.

**Commit message:** `feat(analytics): shared filters hook + multi-select on injecao and geracao`

---

## Step 7 — B3: autorização fina de `/api/files/...`

**Objetivo:** fechar vulnerabilidade crítica #2 do relatório Codex. Hoje
qualquer usuário autenticado acessa qualquer arquivo. Implementar lookup do
"dono" da URL e checar `userCanAccessId`.

**Criar `lib/file-auth.ts`:**

```ts
import type { ScopedUser } from "@/lib/db";

interface FileOwnership {
  entityModel: "Consumo" | "VendaKwh" | "Injecao" | "Orcamento" | "ManutencaoPreventiva";
  entityId: string;
}

/**
 * Procura qual entidade do domínio aponta para esta URL de arquivo.
 * Retorna null se nenhum registro ativo tem essa URL — arquivo órfão é
 * negado por padrão (defense in depth).
 */
export async function resolveFileOwnership(
  bucket: string,
  key: string,
): Promise<FileOwnership | null>;

/**
 * True se o usuário pode acessar o arquivo. Admin sempre pode. Demais
 * roles precisam que `userCanAccessId(user, entityModel, entityId)` retorne
 * true.
 */
export async function userCanAccessFile(
  user: ScopedUser,
  bucket: string,
  key: string,
): Promise<boolean>;
```

**Modificar `app/api/files/[...path]/route.ts`:**

```ts
const session = await auth();
if (!session?.user) return new NextResponse("Não autenticado.", { status: 401 });

const [bucket, ...keyParts] = path;
const key = keyParts.join("/");

const allowed = await userCanAccessFile(session.user, bucket, key);
if (!allowed) return new NextResponse("Não autorizado.", { status: 403 });
```

**Campos a procurar** (varrer no schema antes de implementar):
- `Consumo.arquivoFatura`
- `Injecao.anexoFechamento`
- `VendaKwh.<?>` (verificar nome)
- `Orcamento.<?>`
- `ManutencaoPreventiva.<?>`
- `Fornecedor.anexoContrato`

**Implementação do resolveFileOwnership:** sequência de `findFirst` em cada
modelo procurando pela URL `/api/files/${bucket}/${key}`. Não é o mais
performático, mas é correto e cacheável depois.

**Cuidados críticos:**
- Admin: sempre permite.
- Arquivo órfão (nenhum registro ativo aponta): nega (mais seguro que liberar).
- Audit: NÃO logar acesso a arquivo aqui (fora do escopo do audit de mutation).
  Se quiser audit de leitura, é step separado.

**Done when:**
- `lib/file-auth.ts` existe e é chamado na rota.
- Smoke test manual passa nos 4 cenários abaixo.

**Validação:**
- [ ] `npx tsc --noEmit` passa
- [ ] `npx eslint .` passa
- [ ] `npm run check:rbac` passa
- [ ] Smoke admin: acessa arquivo de qualquer filial → 200
- [ ] Smoke gestor_filial X: acessa arquivo de Consumo da filial X → 200
- [ ] Smoke gestor_filial X: acessa arquivo de Consumo da filial Y → 403
- [ ] Smoke: acessa URL de arquivo que não existe na DB → 403 (não 404)

**Rollback:** `git revert`. Sem efeito em dados — só em path de auth.

**Commit message:** `fix(security): scope file access to entity ownership via userCanAccessId`

---

## Step 8 — B1: quebrar `lib/dashboard.ts` por feature

**Objetivo:** `lib/dashboard.ts` tem 825+ linhas com 12 funções. Quebrar por
feature para reduzir contenção em PRs e melhorar leitura.

**Estrutura final:**

```
lib/dashboard/
  ├─ index.ts          (re-exports — mantém compat de imports atuais)
  ├─ scope.ts          (scopeWhere, decimalToNumber, sumDias, getDb)
  ├─ kpis.ts           (getKpis, DashboardKpis)
  ├─ alerts.ts         (getAlerts, DashboardAlerts)
  ├─ generation.ts     (getGeracaoSerie, getAtencao, GeracaoSeriePoint, AtencaoRow)
  ├─ budget.ts         (getOrcadoVsRealizado, OrcadoRealizadoPoint)
  ├─ injection.ts      (getInjecaoPorConcessionaria, getConcessionariaOptions, ConcessionariaRow)
  ├─ uf-breakdown.ts   (getUsinasPorUF, UfBucket)
  └─ options.ts        (getFilialOptions, getYearOptions, getUfOptions)
```

**Regras:**
- `lib/dashboard.ts` (arquivo único) **deixa de existir**. Substituído por
  `lib/dashboard/index.ts` que re-exporta tudo.
- Imports em `app/**` e outros lugares **não precisam mudar** se eles
  importam de `@/lib/dashboard` — o `index.ts` cobre. Migrar imports é step
  cosmético posterior se quiser.
- Funções utilitárias (`MESES_PT`, `getCurrentPeriod` etc.) **já saíram**
  no Step 4. Não duplicar aqui.
- Tipos exportados ficam no arquivo da função que os usa, re-exportados pelo
  index.

**Cuidados:**
- Não alterar comportamento. Apenas relocação + imports internos.
- Verificar `retryClosedConnection` continua sendo importado corretamente em
  cada arquivo novo.

**Done when:**
- `lib/dashboard.ts` não existe mais.
- `lib/dashboard/` tem os arquivos acima.
- Todos os imports antigos continuam funcionando.

**Validação:**
- [ ] `npx tsc --noEmit` passa
- [ ] `npx eslint .` passa
- [ ] `npm run test` passa (caso testes de A3 dependam de path antigo, fix)
- [ ] Smoke `/` (dashboard principal): KPIs, gráficos, ranking iguais.

**Rollback:** `git revert`. Reorganização pura.

**Commit message:** `refactor(dashboard): split lib/dashboard into per-feature files`

---

## Notas operacionais

### Atualização deste arquivo

Ao final de cada step:
1. Marcar `[x]` no Status atual no topo.
2. Se o step descobrir bloqueador, **anotar no próprio step** (sub-seção
   "Bloqueadores descobertos") em vez de reescrever o plano.
3. Se um step for skipped ou postergado, escrever no Status atual:
   `[~] Step N — postponed, reason: ...`

### Quando NÃO usar este brief

- Bug crítico em produção → resolver antes, fora do brief.
- Pedido pontual do usuário não relacionado → fora do brief, sessão separada.
- Refactor de outra área (ex: forms, importação) → criar
  `docs/refactors/2026-XX-<tema>.md`.

### Após o último step

Mover este arquivo para `docs/refactors/done/2026-05-foundations.md` e
abrir o próximo brief com baseline atualizado.

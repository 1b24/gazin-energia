# Refactor 2026-06 — Paginação server-side nas páginas de entidade

Brief de refactor sequencial. Source of truth para qualquer sessão (Claude ou
humano) que retome o trabalho. Releia este arquivo **antes** de mexer em código
tocado por um step ativo.

Convenção: cada step é independente e termina com **um commit dedicado**.

**Status geral: PLANEJADO — nenhum step iniciado.** Criado em 03/06/2026 a
partir do diagnóstico de payload (Consumo: ~1.2k linhas + relação por visita,
crescendo ~400/mês via import mensal do Zoho).

---

## Motivação

Toda página de entidade (`app/(dashboard)/*/page.tsx`) faz `findMany` **sem
`take`** e serializa o dataset inteiro no payload RSC. O client (`EntityPage` →
`DataTable`) pagina, filtra e busca **em memória**. Funciona hoje, mas:

1. Consumo já carrega ~1.2k linhas + relação `filial` a cada visita; com
   ~400 linhas/mês, em 12 meses o payload passa de alguns MB por navegação.
2. O cálculo de variação (Δ vs mês anterior) em `consumo/page.tsx` indexa o
   dataset inteiro em `Map` no server a cada request — O(n) crescente.
3. `getFilialOptions`-likes são leves, mas o `findMany` cru das entidades
   grandes (Consumo, Injeção, Geração) domina o tempo de
   `application-code` das pages.

## Por que NÃO é mudança trivial (ler antes de codar)

Três features do `DataTable` **assumem dataset completo no client** e quebram
com paginação server ingênua:

| Feature | Hoje | Com server pagination |
|---|---|---|
| Filtro por coluna estilo Excel | valores distintos derivados das rows carregadas | precisa de endpoint/server fn de valores distintos (`groupBy`) por coluna |
| Busca global (substring) | filtra rows em memória | precisa virar `where OR contains` no server (e decidir semântica p/ campos relacionais achatados) |
| Δ vs mês anterior (Consumo) | `Map` do dataset completo | precisa de lookup dedicado (query por `(uc, ano, mes)` anterior) ou SQL window |

Além disso: seleção múltipla/bulk actions e export "respeita filtros" passam a
precisar de uma representação serializável dos filtros ativos (URL via nuqs)
que o server entenda.

## Decisões de design (propostas — validar com Heitor no Step 0)

1. **nuqs como fonte da verdade**: page, pageSize, sort, busca e filtros por
   coluna na URL. O server component lê os mesmos params e monta o `where`.
2. **TanStack em modo `manualPagination/manualSorting/manualFiltering`** — o
   `DataTable` ganha um modo "server" atrás de prop, preservando o modo
   client atual para entidades pequenas (Usinas: 18 rows; Fornecedores: 33).
3. **Migrar apenas entidades grandes**: Consumo → Injeção → Geração. As demais
   continuam client-side (payload irrelevante, evita risco).
4. **Valores de filtro por coluna**: server fn `getDistinct(entity, column)`
   com `groupBy` + cap (550 p/ filial, 200 demais — paridade com o cap atual).
5. **Δ variação**: query adicional por página exibida (buscar os pares
   `(uc, anoPrev, mesPrev)` só das rows da página corrente) — O(pageSize),
   não O(dataset).
6. **Export**: continua exportando o resultado filtrado completo (sem
   paginação) — reusa o `where` construído dos params.

## Steps

- [ ] **Step 0** — Validar decisões de design acima com Heitor; medir payload
      atual (baseline: bytes RSC de /consumo, tempo application-code).
- [ ] **Step 1** — `lib/table-query.ts`: parser nuqs↔where tipado por entidade
      (Zod) + testes puros. Sem UI ainda.
- [ ] **Step 2** — `DataTable` modo server (manual*), atrás de prop opt-in.
      Nenhuma página migrada ainda; modo client intacto (zero regressão).
- [ ] **Step 3** — Migrar **Consumo** (a maior): page server lê params, where,
      `take/skip`, count; valores distintos p/ filtros; Δ por página.
- [ ] **Step 4** — Smoke + medição (comparar baseline Step 0); ajustar índices
      Prisma se o `where` dos filtros revelar gap (ex.: `municipio`).
- [ ] **Step 5** — Migrar Injeção.
- [ ] **Step 6** — Migrar Geração (atenção: analytics da tela consomem o
      dataset pro gráfico diário — ver "Regiões sensíveis").
- [ ] **Step 7** — Mover brief para `done/` e atualizar AGENTS.md §4.

## Regiões invioláveis durante este refactor

1. **RBAC**: `scopedPrisma`/`MODEL_SCOPE` continuam aplicados em toda query
   nova. O `where` construído de URL params NUNCA substitui o escopo — soma.
2. **Audit/mutations**: fora de escopo. Nenhuma server action de CRUD muda.
3. **Schema Prisma**: só `@@index` novos (Step 4), nada de coluna/migração.
4. **Analytics em geracao-table** (`GeracaoAnalytics`, calendário de dias,
   estimativas): dependem do dataset do período selecionado — a migração da
   Geração (Step 6) deve buscar o dataset analítico separado da tabela
   paginada, não acoplar os dois.
5. **Export sanitizer** (`SENSITIVE_FIELD_PATTERN`): export continua passando
   por ele, independente de como o `where` é montado.

## Riscos conhecidos

- Busca global server-side muda semântica (hoje busca em campos achatados de
  relações; `contains` no Prisma exigirá `OR` explícito por campo — decidir
  lista de campos por entidade e documentar a diferença).
- PGLite: paginação adiciona `count()` por request — barato, mas medir.
- UX: filtros Excel com >cap valores passam a depender de busca digitada
  (paridade com hoje, mas conferir).

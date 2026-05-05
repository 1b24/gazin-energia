# Sistema Gazin Gestão Energética — Migração e Construção

## Contexto

Migrando sistema interno de gestão de usinas solares de uma plataforma no-code (que apenas armazena dados, sem dashboard, sem análise) para stack moderna. Os dados do sistema antigo estão em `data/raw/` em JSON, **um arquivo por entidade** — submódulos são entidades separadas, não campos dentro do módulo pai.

A navegação, sidebar, breadcrumbs e permissões já são governadas por `lib/modules/registry.ts`, criado no scaffold inicial. Esse registry é a **fonte única de verdade**. Toda nova entidade entra ali.

---

## Política de dados ausentes

Nem todos os módulos têm JSON exportado ainda. **Não bloqueia nada.** A regra:

- **Com JSON**: schema inferido dos dados, seed roda, página funcional.
- **Sem JSON**: schema *stub* mínimo (id + FKs prováveis + timestamps + soft delete), página criada com EmptyState explicando que aguarda dados, seed pula silenciosamente.

A arquitetura inteira (registry, sidebar, permissões, audit, navegação) trata stubs como cidadãos de primeira classe — não há "página não encontrada" em lugar nenhum. Quando o JSON chegar, basta dropar em `data/raw/`, ajustar status para `active`, expandir o model se quiser e rodar seed.

---

## Stack já instalada

Next.js 15 (App Router) + TypeScript strict + Prisma + PostgreSQL + NextAuth v5 + shadcn/ui + TanStack Table + React Hook Form + Zod + nuqs + Recharts + decimal.js + date-fns (ptBR) + lucide-react. Detalhes no `README.md`.

---

## Entidades esperadas (18 ao total, distribuídas em 12 módulos)

| Arquivo JSON esperado | Prisma Model | Módulo |
|---|---|---|
| `usinas.json` | `Usina` | Cadastro de Usinas |
| `filiais.json` | `Filial` | Cadastro de Filiais |
| `fornecedores.json` | `Fornecedor` | Cadastro de Fornecedores |
| `juridico_processos.json` | `ProcessoJuridico` | Jurídico → Processos |
| `juridico_licencas.json` | `Licenca` | Jurídico → Licenças |
| `geracao.json` | `Geracao` | Geração |
| `venda_kwh.json` | `VendaKwh` | Venda de KWh |
| `consumo.json` | `Consumo` | Consumo → Consumo |
| `consumo_validacao_fatura.json` | `ValidacaoFatura` | Consumo → Validação Fatura |
| `estoque.json` | `ItemEstoque` | Controle de Estoque |
| `injecao.json` | `Injecao` | Controle de Injeção |
| `orcamentario.json` | `Orcamento` | Cadastro Orçamentário |
| `manutencao_consertos.json` | `ConsertoEquipamento` | Manutenção → Consertos |
| `manutencao_limpeza.json` | `CronogramaLimpeza` | Manutenção → Limpeza |
| `manutencao_preventiva.json` | `ManutencaoPreventiva` | Manutenção → Preventiva |
| `manutencao_corretiva.json` | `ManutencaoCorretiva` | Manutenção → Corretiva |
| `documentos.json` | `Documento` | Documentos Internos |

Se algum arquivo presente em `data/raw/` não bater com nenhum nome esperado, **pergunte antes de assumir** — não tente adivinhar mapeamento.

---

## Tarefa 1 — Inventário, schema e stubs

### 1.1 Inventário

Antes de qualquer coisa, liste **o que existe em `data/raw/`** vs. **o que o registry espera**.

Saída esperada:

```
ENCONTRADOS (vão ser migrados):
  ✓ usinas.json → Usina
  ✓ filiais.json → Filial
  ✓ ...

AUSENTES (stub apenas — model + página, sem seed):
  ⊘ manutencao_corretiva.json → ManutencaoCorretiva
  ⊘ ...

INESPERADOS (presentes em data/raw/ mas não mapeados — me avise):
  ? algum_arquivo.json
```

**Pare e me mostre esse inventário antes de seguir.** Aguarde meu OK.

### 1.2 Schema Prisma — duas categorias

Para cada entidade no registry, gere o model em `prisma/schema.prisma`:

**Entidades COM JSON (encontrados):**
- Infira tipos, nullability, enums e relacionamentos a partir dos dados reais.
- Aplique todas as regras de domínio (Decimal, datas, CNPJ, soft delete, audit-friendly).

**Entidades SEM JSON (ausentes):**
- Crie um model **mínimo viável** com apenas:
  - `id` (cuid)
  - FKs prováveis baseadas no contexto do módulo (ex: `ManutencaoCorretiva` provavelmente tem `usinaId` e possivelmente `fornecedorId` — deduza do nome e contexto)
  - `createdAt`, `updatedAt`, `deletedAt`
  - `observacao String?` como placeholder
- Adicione comentário `// STUB — schema preliminar, expandir quando JSON real for fornecido` no topo do model.
- **Não invente campos de negócio sem evidência.** Mínimo viável.

### 1.3 Regras de schema aplicáveis a TODOS os models

- FKs explícitas, `onDelete: Restrict` em entidades de negócio (nunca `Cascade`).
- **Enums** para campos com poucos valores: `UF`, `TipoGD` (GD1/GD2/GD3), `LocalInstalacao` (Telhado/Solo), `StatusUsina` (em_implantacao/operacional/manutencao/desativada). Descubra outros enums nos dados (status de processos, tipos de manutenção, etc).
- **`Decimal(15,2)`** para dinheiro; **`Decimal(10,2)`** para potência. Nunca `Float`.
- **`DateTime`** para datas (parse pt-BR no seed).
- **`createdAt` / `updatedAt`** em tudo (Prisma auto).
- **`deletedAt DateTime?`** em todas as tabelas de negócio (soft delete).
- **`@@index`** em FKs e colunas filtráveis (status, datas, CNPJ).
- CNPJ como `String` armazenando só dígitos (14 chars).

### 1.4 Validação cruzada

Antes de gravar:
- Toda entidade do `lib/modules/registry.ts` tem um model correspondente? (Sim — mesmo as ausentes viram stubs.)
- FKs entre entidades reais batem com os dados?

**Pare e me mostre o schema completo antes de gravar.** Marque visualmente os stubs com `// STUB` no topo. Aguarde meu OK.

---

## Tarefa 2 — Seed, validação e indicador de status

### 2.1 Seed

`prisma/seed.ts`:
- Lê **apenas** os JSONs presentes em `data/raw/`. Pula silenciosamente os ausentes (com aviso no log).
- Helpers: `parseBRNumber`, `parseBRDate`, `parseCNPJ` de `lib/format.ts`.
- Trata `"R$ "`, `"4.244.000,00"`, `"dd/mm/yyyy"`.
- `upsert` (idempotente — pode rodar quantas vezes quiser).
- Ordem de dependência: filiais → usinas/fornecedores → resto.
- Log estruturado:

```
[seed] Iniciando...
✓ filiais: 12 registros
✓ usinas: 18 registros
⊘ manutencao_corretiva: arquivo ausente, pulando (entidade stub)
✓ geracao: 432 registros
[seed] Concluído. 12 entidades populadas, 6 stubs aguardando dados.
```

### 2.2 Validação

`scripts/validate-migration.ts`:
- Para entidades com JSON: conta JSON vs banco, integridade referencial, lista nulls em campos suspeitos de obrigatórios.
- Para entidades stub: apenas confirma que a tabela existe e está vazia. Não trata como erro.
- Diff colorido. Resumo final separando "migradas" de "stubs aguardando dados".

### 2.3 Indicador visual de stub

Crie `lib/modules/status.ts`:

```ts
export type EntityStatus = "active" | "stub";

export const ENTITY_STATUS: Record<string, EntityStatus> = {
  Usina: "active",
  Filial: "active",
  // ...preencher com base no inventário da Tarefa 1
  ManutencaoCorretiva: "stub",
  // ...
};
```

`<EntityPage />` (criado na Tarefa 3) lê esse status e renderiza um **EmptyState** padrão quando `stub`:

```
┌─────────────────────────────────────────────┐
│ ⓘ  Módulo aguardando dados                  │
│    Esta entidade ainda não foi populada.    │
│    Exporte o JSON do sistema antigo para    │
│    data/raw/<arquivo>.json e rode           │
│    npm run db:seed.                         │
└─────────────────────────────────────────────┘
```

Quando o JSON chegar no futuro:
1. Coloca em `data/raw/`
2. Muda `ENTITY_STATUS[Model] = "active"`
3. Expande o model no `schema.prisma` se quiser
4. Roda `db:migrate` + `db:seed`

EmptyState some sozinho.

**Pare e aguarde OK antes de seguir.**

---

## Tarefa 3 — Componentes genéricos (entity-agnostic)

A meta: cada página de entidade deve ter ~30-50 linhas — não um CRUD inteiro escrito à mão. Crie em `components/data-table/` e `components/forms/` componentes que recebem schema Zod + config e renderizam a página inteira.

### `<EntityPage />`

Recebe:
- `entity`: nome (ex: `"usinas"`)
- `prismaModel`: nome do model (ex: `"Usina"`) — usado pra checar `ENTITY_STATUS`
- `schema`: Zod schema da entidade
- `columns`: definição TanStack Table
- `formFields`: config de campos do form (gerada a partir do Zod)
- `relations`: arrays de relações pra mostrar no drawer (ex: usina mostra geração histórica)
- `serverActions`: `{ create, update, softDelete, restore, bulkDelete }` — server actions tipadas

Renderiza:
- Header com título + botão "Novo"
- Se `ENTITY_STATUS[prismaModel] === "stub"` → EmptyState (descrito na 2.3)
- Senão: tabela com filtros/sort/busca/paginação na URL via nuqs
- Bulk actions: exportar (XLSX/CSV/JSON), soft-delete em massa, restore em massa
- Toggle "Mostrar arquivados"
- Drawer de detalhes com abas
- Dialog de criar/editar

### `<DataTable />`

TanStack genérica: virtualização, column pinning, resize, ordenação multi-coluna, filtro por coluna, busca global, paginação server-side, seleção múltipla, persistência de preferências (colunas visíveis, ordenação) por usuário em `localStorage`.

### `<EntityForm />`

React Hook Form gerado do schema Zod. Tratamento BR pra moeda/data/CNPJ com máscaras. Validação inline. Suporta modo `create` e `edit`.

### `<EntityDrawer />`

shadcn `Sheet` lateral com abas:
- **Detalhes**: todos os campos formatados
- **Relacionados**: uma aba por relação configurada (ex: "Geração", "Vendas", "Manutenções")
- **Histórico**: audit log dessa entidade (Tarefa 6)

### Server actions genéricas

`lib/actions/crud.ts` — factory que recebe `prismaModel` + schema Zod + opções e devolve:

```ts
createCrudActions("Usina", usinaSchema, { /* opts */ })
// → { create, update, softDelete, restore, bulkDelete, bulkExport }
```

Cada página instancia essa factory. Toda mutação loga no audit (Tarefa 6) automaticamente.

### Exportações

Suportar `xlsx`, `csv`, `json` via bulk action. Exportação respeita filtros aplicados na URL. XLSX usa `exceljs` ou `xlsx`. CSV/JSON nativo.

**Pare e aguarde OK.**

---

## Tarefa 4 — Páginas das entidades

Cada entidade vira uma página de ~30-50 linhas: importa schema Zod, define columns, instancia `<EntityPage />`. Faça **uma de cada vez**, na ordem:

1. `Filial` (base — outras dependem)
2. `Usina` (base — quase tudo depende)
3. `Fornecedor` (base — manutenções dependem)
4. `Geracao`
5. `VendaKwh`
6. `Consumo`
7. `ValidacaoFatura`
8. `Injecao`
9. `ItemEstoque`
10. `Orcamento`
11. `ProcessoJuridico`
12. `Licenca`
13. `ConsertoEquipamento`
14. `CronogramaLimpeza`
15. `ManutencaoPreventiva`
16. `ManutencaoCorretiva`
17. `Documento`

Aguarde OK entre cada uma — vou validar UX antes de seguir.

Para entidades stub, a página é criada normalmente, mas o `<EntityPage />` automaticamente mostra EmptyState (não preciso fazer nada diferente).

Para submódulos (Jurídico, Consumo, Manutenção): cada submódulo é uma página independente em sua sub-rota. O agrupamento só existe na sidebar (já lida do registry).

---

## Tarefa 5 — Auth + RBAC

NextAuth v5 com Credentials provider (email + senha hash com `bcrypt`).

Tabela `User`:
```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  password  String   // hash
  role      Role     @default(operacional)
  filialId  String?
  filial    Filial?  @relation(fields: [filialId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
}

enum Role {
  admin
  gestor_filial
  operacional
}
```

Middleware (`middleware.ts`) verifica permissão por path lendo do registry. Adicione `permissions` opcional em `ModuleDefinition`:

```ts
permissions?: {
  view?: Role[];
  create?: Role[];
  edit?: Role[];
  delete?: Role[];
}
```

Defaults sensatos quando não especificado (todos os roles podem ver, só admin pode deletar).

`gestor_filial` tem `filialId` setado e queries do Prisma filtram automaticamente via Prisma extension. `admin` vê tudo. `operacional` vê tudo da sua filial mas não pode deletar.

Página de login simples em `/login`. Logout via dropdown no header.

Seed cria um admin inicial: `admin@gazin.local` / senha lida de `.env` (`SEED_ADMIN_PASSWORD`).

**Pare e aguarde OK.**

---

## Tarefa 6 — Audit log

Tabela:

```prisma
model AuditLog {
  id         String   @id @default(cuid())
  entityType String
  entityId   String
  action     AuditAction
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  before     Json?
  after      Json?
  createdAt  DateTime @default(now())

  @@index([entityType, entityId])
  @@index([userId])
  @@index([createdAt])
}

enum AuditAction {
  create
  update
  soft_delete
  restore
  hard_delete
}
```

Implementado via Prisma client extension — toda mutação loga sem precisar lembrar manualmente. Logo capta `userId` do contexto da request (NextAuth).

Mostrado na aba "Histórico" do `<EntityDrawer />` com diff legível (campo X mudou de `A` → `B`).

**Pare e aguarde OK.**

---

## Tarefa 7 — Dashboard (`/`)

Server Components agregando dados via Prisma. Ignora entidades stub (não quebra se tabela vazia).

Componentes:

- **KPIs do mês corrente** (4 cards):
  - Geração realizada vs. meta (% atingido)
  - Faturamento de venda KWh
  - Consumo total
  - Nº usinas operacionais
- **Card de alertas**: licenças vencendo em ≤30 dias + manutenções corretivas abertas + processos com prazo próximo. Cada item linka para a entidade.
- **Gráfico de geração mensal** (12 meses, Recharts `AreaChart`), filtro por filial.
- **Mapa do Brasil** com usinas plotadas por UF, cor por status (`react-simple-maps`).
- **Tabela "Atenção"**: usinas com geração no mês < 80% da meta, ordenado por gap.
- **Comparativo orçado vs. realizado** (bar chart agrupado).

RBAC respeitado: `gestor_filial` vê apenas dados da própria filial.

Layout responsivo (grid 12 cols desktop, 1 col mobile).

**Pare e aguarde OK.**

---

## Regras de domínio CRÍTICAS

1. **Potência da usina é `kW`, não `kWh`.** kWh é energia acumulada. O sistema antigo confunde. Renomeie:
   - `Potência (kWh) instalada` → `potenciaInstaladaKw`
   - `Potência (kWh) P` → `potenciaProjetadaKw`
   - `Meta kwh mês` continua kWh (energia mensal) → `metaKwhMes`
2. **Dinheiro `Decimal(15,2)`. Nunca `Float`.**
3. **Potência `Decimal(10,2)`.**
4. **CNPJ só dígitos no banco; formate na view.**
5. **Audit log obrigatório desde o dia 1.**
6. **Soft delete em tudo.**

---

## Padrões de código

- Server Components por padrão; `"use client"` só onde precisar de interatividade.
- Schemas Zod em `lib/schemas/<entidade>.ts`, reutilizados por form, server action e validação de seed.
- Server actions em `app/<rota>/actions.ts`, validação Zod no topo.
- Helpers de formatação BR em `lib/format.ts` (já existem do scaffold).
- Sem `any`. TypeScript strict.
- Commits semânticos (`feat:`, `fix:`, `chore:`, `refactor:`).

---

## Como adicionar um módulo novo no futuro

Fluxo (já documentado no `README.md`, garantir que continua válido):

1. Adicionar entrada em `lib/modules/registry.ts`.
2. Criar model em `prisma/schema.prisma` + `npm run db:migrate`.
3. Criar schema Zod em `lib/schemas/`.
4. Criar `page.tsx` na rota correspondente reusando `<EntityPage />`.
5. Adicionar entrada em `lib/modules/status.ts` (`active` ou `stub`).

Sidebar, breadcrumbs, permissões, audit e exportações pegam tudo automaticamente.

---

## Ordem de execução

Pare ao final de cada tarefa e aguarde meu OK:

1. **Inventário + schema + stubs** → OK
2. **Seed + validação + status helper** → OK
3. **Componentes genéricos** → OK
4. **Páginas das entidades** (uma por vez, base primeiro) → OK por entidade
5. **Auth + RBAC** → OK
6. **Audit log** → OK
7. **Dashboard** → OK

Em qualquer dúvida, ambiguidade ou decisão fora do que está aqui, **pergunte antes de assumir**. Prefiro pausar a refazer.

Comece pela Tarefa 1.
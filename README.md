# Gazin Energia — Sistema de Gestão Energética

Plataforma interna para cadastro e gestão de usinas, filiais, fornecedores, geração,
consumo, manutenção, jurídico, estoque e documentos.

## Stack

- **Next.js 16** (App Router, TypeScript strict, Tailwind, ESLint)
- **Prisma** + `@prisma/client`
- **NextAuth.js v5** (`next-auth@beta`)
- **shadcn/ui** (tema neutro)
- **TanStack Table**, **React Hook Form**, **Zod**, **nuqs**
- **Recharts**, **decimal.js**, **date-fns** (locale `ptBR`), **lucide-react**
- Scripts: **tsx** • Dev: **prettier**, **prettier-plugin-tailwindcss**

> Nota: o brief original pediu Next.js 15, mas `create-next-app@latest` instalou
> Next.js 16 (e Prisma 7). O scaffold roda nessas versões.

## Como rodar

```bash
git clone <repo>
cd gazin-energia
npm install
cp .env.example .env.local   # preencha DATABASE_URL etc.
npm run db:push              # aplica o schema
npm run dev
```

Abra <http://localhost:3000>.

## Estrutura de pastas

```
app/
  (auth)/login/              login (placeholder)
  (dashboard)/               shell autenticado — sidebar lê do registry
    layout.tsx               sidebar + breadcrumbs + main
    page.tsx                 home (placeholder)
    <modulos>/page.tsx       uma página por módulo/submódulo
  api/auth/[...nextauth]/    rota NextAuth (stub)
  layout.tsx                 root layout
  globals.css

components/
  ui/                        shadcn primitives
  layout/                    sidebar, breadcrumbs
  data-table/                criados na Tarefa 3 do BRIEF
  forms/                     criados depois
  charts/                    criados depois

lib/
  modules/registry.ts        FONTE ÚNICA DE VERDADE da navegação
  modules/types.ts
  schemas/                   schemas Zod por módulo (criados depois)
  auth.ts                    stub NextAuth
  db.ts                      Prisma singleton
  format.ts                  helpers BR (parse/format de número, data, CNPJ)
  utils.ts                   cn() do shadcn

prisma/
  schema.prisma              datasource + generator (sem models ainda)
  seed.ts                    stub

scripts/
  validate-migration.ts      stub

data/
  raw/                       JSONs exportados do sistema antigo (gitignored)
  xlsx-backup/               backup XLSX (gitignored)

types/                       tipos compartilhados
```

## Como adicionar um novo módulo

A arquitetura é **registry-driven**: navegação, rotas e tabelas leem de
`lib/modules/registry.ts`. Adicionar um módulo novo deve mexer em poucos lugares.

1. **Adicionar entrada em `lib/modules/registry.ts`** com `id`, `label`, `icon`
   (nome do `lucide-react`), `basePath`, `prismaModel`, e `submodules` se houver.
2. **Criar o model em `prisma/schema.prisma`** e rodar `npm run db:migrate`.
3. **Criar schema Zod em `lib/schemas/<modulo>.ts`** para validação de form/API.
4. **Criar `app/(dashboard)/<modulo>/page.tsx`** reusando `<EntityPage />`
   (componente genérico criado na Tarefa 3 do BRIEF).
5. **Adicionar entrada em `lib/modules/status.ts`** (criado na Tarefa 2 do BRIEF)
   para tracking de progresso de implementação.

A sidebar e os breadcrumbs já passam a refletir o módulo automaticamente — não
edite componentes de layout para adicionar entradas.

## Dados legados

`data/raw/` recebe os JSONs exportados do sistema antigo. Não comitar esses
arquivos — o `.gitignore` já cobre. Os scripts em `scripts/` consomem esses JSONs
para migração e validação.

## Scripts

- `npm run dev` / `build` / `start` / `lint` / `format`
- `npm run db:push` / `db:migrate` / `db:studio` / `db:seed` / `db:validate`

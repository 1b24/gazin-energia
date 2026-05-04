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

### Opção A — Postgres local sem instalar nada (recomendado p/ dev)

Prisma 7 tem um Postgres embutido. Não precisa Docker nem instalar PG.

```bash
git clone <repo>
cd gazin-energia
npm install

# 1. Sobe o servidor Postgres local em background
npx prisma dev --detach -n gazin

# 2. Decodifica a URL TCP do servidor (o `prisma+postgres://` HTTP não é
#    suportado pelo cliente 7.8 atual; precisa do TCP por dentro do api_key)
node -e "const url=require('child_process').execSync('npx prisma dev ls').toString();const m=/api_key=([A-Za-z0-9_-]+)/.exec(url);const d=JSON.parse(Buffer.from(m[1],'base64url').toString());console.log('DATABASE_URL=\"'+d.databaseUrl+'\"')" > .env

# 3. Schema + dados
npm run db:push
npm run db:seed
npm run db:validate

# 4. App
npm run dev
```

Abra <http://localhost:3000>. Pra parar o PG depois: `npx prisma dev stop -n gazin`.

### Opção B — Postgres próprio (Docker, Supabase, RDS, etc.)

Coloque a connection string em `.env` (formato `postgres://user:pass@host:port/db`)
e siga do passo 3.

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

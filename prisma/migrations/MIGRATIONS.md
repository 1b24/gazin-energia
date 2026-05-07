# Migrations

## Filosofia

- **Dev local**: `npm run db:push` continua funcionando pra prototipar mudanças
  rápidas no schema. Não cria histórico — útil só pra teste imediato.
- **Quando uma mudança estabilizar**: gere uma migration versionada com
  `npm run db:migrate -- --name <descricao_curta>` (ex:
  `--name add_audit_log`). Cria pasta `prisma/migrations/<timestamp>_<nome>/`.
- **Deploy em produção**: roda `npm run db:migrate:deploy`. Aplica todas as
  migrations pendentes em ordem.

## Baseline (`0001_baseline`)

A primeira migration é a baseline gerada via:

```bash
npx prisma migrate diff \
  --from-empty \
  --to-schema prisma/schema.prisma \
  --script > prisma/migrations/0001_baseline/migration.sql
```

Em um banco vazio, `db:migrate:deploy` aplica a baseline + cria todas as
tabelas, enums e índices em uma transação.

## Banco de dev existente (estado atual)

O DB local foi populado via `db push` antes do baseline existir. Como o
Prisma migrate tem limitações com o driver adapter atual, o **status local não
está marcado como "baseline aplicada"**. Isso significa:

- **Continuar usando `db push`** para mudanças locais funciona normalmente.
- Se você quiser migrar o ambiente local pra usar migrations, drope o DB e
  rode `db:migrate:deploy` + `db:seed` (perde dados; reseed traz tudo de volta
  a partir de `data/raw/`).

Para **ambiente novo** (Vercel + Neon, por exemplo):

```bash
# Variáveis: DATABASE_URL, NEXTAUTH_SECRET, SEED_ADMIN_PASSWORD,
#            STORAGE_S3_*, KV_REST_API_*
npm run db:migrate:deploy   # aplica todas as migrations
npm run db:seed             # importa dados + cria admin
```

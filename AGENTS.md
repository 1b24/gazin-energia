<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Modus Operandi

Este documento é o contrato de operação para qualquer agente trabalhando neste
repositório. Leia até o fim antes de tocar em qualquer arquivo.

## 0. Onboarding obrigatório (sempre, antes da primeira edição)

Em toda sessão nova, **antes** de propor ou aplicar mudanças, leia:

1. Este `AGENTS.md` inteiro.
2. `docs/refactors/*.md` na raiz (não em `done/`) — refactor ativo define
   regiões invioláveis.
3. `prisma/schema.prisma` — fonte da verdade do domínio.
4. O(s) arquivo(s) que você vai tocar, **inteiros**, não apenas o trecho
   citado pelo usuário. Convenções locais quase sempre existem.

Se algum desses passos for pulado por economia de tokens, declare
explicitamente no início da resposta. Não há "pequena mudança segura" sem
contexto.

## 1. Invariantes do projeto (regras numeradas)

1. **RBAC + audit em toda mutation.** Usar `createCrudActions`
   (`lib/actions/crud.ts`). Audit log roda na mesma transação da mutation.
   Nunca chamar `prisma.X.create/update/delete` direto em uma action sem
   passar por esse helper, exceto em scripts de seed/migração explícitos.
2. **Sempre `scopedPrisma(session?.user)`** em pages server / actions. Nunca
   importar `prisma` cru de `lib/db.ts` em código que serve usuário final.
3. **Borda RSC→Client serializa via `serializePrisma()`.** Decimal e BigInt
   não atravessam. Tipar payload do client com `Serialized<T>`.
4. **Senhas / credenciais de portal NUNCA vão pro client.** `Filial.senha` é
   o exemplo canônico — não incluir em `select` de listagem.
5. **Export respeita `SENSITIVE_FIELD_PATTERN`** (`lib/actions/export-helpers.ts`).
   Novo campo sensível → adicionar ao denylist.
6. **Schema Zod é fonte única de validação.** Form (`zodResolver`) e server
   action (`schema.parse`) consomem o mesmo schema.
7. **`.refine()` + `.partial()` são incompatíveis.** Padrão: exportar
   `XBaseSchema` (sem refines), `XSchema` (com refines, usado no create) e
   `XPartialSchema` (base parcial, passado como `updateSchema` ao
   `createCrudActions`).
8. **`retryClosedConnection` em toda query Prisma de page server / action.**
   PGLite reseta socket esporadicamente.
9. **Soft-delete (`deletedAt`) é respeitado pelos analytics.** Filtrar
   `deletedAt: null` em queries de relatórios e KPIs.
10. **Arquivos uploads passam por `userCanAccessFile`** (`lib/file-auth.ts`)
    antes de servir.

## 2. Mapa rápido do projeto

| Concern                    | Path                                                |
| -------------------------- | --------------------------------------------------- |
| Schema do domínio          | `prisma/schema.prisma`                              |
| Prisma scoped + retry      | `lib/db.ts`                                         |
| CRUD genérico (RBAC+audit) | `lib/actions/crud.ts`                               |
| Serialização RSC→Client    | `lib/serialize.ts`                                  |
| Tarifa lookup (UF+classe)  | `lib/tarifa-lookup.ts`                              |
| Schemas Zod + form config  | `lib/schemas/*.ts`                                  |
| Form genérico              | `components/forms/entity-form.tsx`                  |
| Página de entidade genérica| `components/data-table/entity-page.tsx`             |
| Auth (NextAuth credentials)| `lib/auth.ts`                                       |
| Export sanitizer           | `lib/actions/export-helpers.ts`                     |
| File auth                  | `lib/file-auth.ts`                                  |
| Períodos / vigência        | `lib/period.ts`                                     |
| Refactor ativo             | `docs/refactors/*.md` (raiz, não `done/`)           |

## 3. Schema changes (Prisma + PGLite)

Depois de qualquer mudança em `prisma/schema.prisma` que rode `prisma generate`
(mesmo via `prisma db push`), o Next dev server **precisa ser reiniciado**.
HMR não recarrega `node_modules/@prisma/client` — o cliente antigo continua
na memória até a próxima inicialização, e qualquer model novo aparece como
`undefined` (`Cannot read properties of undefined (reading 'findMany')`).

Sequência segura:
1. Editar `schema.prisma`.
2. `npx prisma db push` — PGLite não tem shadow DB, `migrate dev` falha.
3. `npx prisma generate` (db push já roda, double-check).
4. **Reiniciar `npm run dev`** — sem isso, models novos quebram.

Se persistir erro após restart: matar Next, `rm -rf .next`, reiniciar.

## 4. Refactors em andamento

Antes de modificar qualquer arquivo, verifique se ele está sob escopo de um
refactor em `docs/refactors/*.md` (raiz, não `done/`). Leia o brief antes —
ele define o que pode ser tocado, em que ordem, e quais regiões são
invioláveis durante o ciclo.

Histórico de refactors concluídos vive em `docs/refactors/done/`.

Atual: _nenhum refactor ativo_.

## 5. Convenções técnicas

- **Decimal do Prisma**: nunca passar direto pro client. `serializePrisma()`
  converte em `number`. No client, tipar com `Serialized<T>`.
- **Currency input**: usa máscara com `decimals` configurável. Tarifas R$/kWh
  usam `decimals=6`. Percentuais usam comportamento padrão.
- **`findTarifaPorData(tarifas, uf, refDate, classeTensao?)`**: prefere tarifa
  com classe exata sobre genérica; aceita match quando ambos são null.
- **Form fields condicionais**: usar `showWhen` em `FormFieldConfig`. Selects
  vazios devem ter `emptyMessage`.
- **Skip diagnostics em analytics**: usar `<SkippedSection />` para listar
  registros pulados por motivo (`classe_nao_bate`, `sem_tarifa`, etc.).
  Máximo 20 detalhes por seção, default aberto.
- **Multi-select filters em dashboards**: padrão via `useAnalyticsFilters`.
- **Índices**: nova coluna filtrável/sortável recorrente → adicionar
  `@@index` no schema Prisma.
- **Select explícito > include**: paga só campos usados, melhor pro payload RSC.
- **`unstable_cache`**: considerar quando a query é cara e raramente muda.

## 6. Sobre o Graphify

Há um snapshot em knowledge graph, mas ele pode estar **desatualizado** em
relação a entidades novas (ex.: `Distribuidora`, `TarifaEnergia`,
`lib/period.ts`). Use como mapa inicial; valide com `grep`/`read` antes de
agir. Não confiar cegamente nos nós/arestas.

Para buscas pontuais de símbolo/string, Grep ganha. Para "onde isso é usado
no fluxo X", o graph pode dar atalho — se atualizado.

## 7. Preferências de implementação

Prefira a solução **escalável** quando o esforço for baixo (≤30 min, sem
regressão, sem dependência nova, sem refactor lateral). Exemplos:

- Query nova em page server: `select` explícito em vez de `include`.
- Agregação dashboard: `prisma.groupBy` ou SQL quando trivial; envolver em
  `retryClosedConnection`; considerar `unstable_cache`.
- Coluna filtrável: garantir índice.
- Mutation: passar por `createCrudActions`.
- Lista grande: agregar/paginar no server.
- Testes: priorizar funções puras em `lib/` (5min cada); componentes/actions
  ficam para iniciativa dedicada.

Quando escalável custa >30 min ou exige mudança lateral, faça a versão
simples agora e abra TODO no commit ou em `docs/refactors/<novo>.md`. Não
esconder débito.

## 8. Estilo de resposta ao usuário

- Conciso. Sem preâmbulos ("Vou fazer X..."), sem recap desnecessário.
- Português, exceto identifiers técnicos.
- Quando aplicar mudança, mostrar o diff conceitual e o porquê — não
  apenas "feito".
- Em discordância: ser honesto, não bajulador. Se a sugestão do usuário tem
  problema, dizer; se a minha tem, admitir.

## 9. Commits

- Apenas quando o usuário pedir.
- Mensagens em pt-BR, imperativo, escopo no prefixo (`feat(filiais):`,
  `fix(tarifas):`, `docs(agents):`, `chore(db):`).
- Sem `Co-Authored-By: Claude` salvo quando o usuário pedir.
- `git add` seletivo, nunca `-A`/`.`.
- Nunca `--no-verify`, nunca force-push em main.

## 10. Testes

- Vitest. Funções puras em `lib/` primeiro.
- Antes de declarar pronto: `npm run test` deve passar. Se quebrar algo
  pré-existente, reportar — não silenciar.

## 11. Anti-padrões observados (não repetir)

1. Chamar `prisma.X.update` direto em action, fugindo do CRUD genérico.
2. Passar Decimal cru pro client.
3. Fazer `.partial()` em schema com `.refine()`.
4. Esquecer de reiniciar o dev após `prisma generate`.
5. `include` quando `select` resolve.
6. Adicionar campo sensível e não atualizar `SENSITIVE_FIELD_PATTERN`.
7. Servir arquivo sem `userCanAccessFile`.
8. Filtrar analytics esquecendo `deletedAt: null`.
9. Página server sem `retryClosedConnection`.
10. Mostrar "—" em vez do dado parcial quando há informação útil disponível.
11. Drawer/dialog sem botão de fechar quando entrada não-comparativa.
12. Criar refactor em paralelo a outro ativo sem registrar em
    `docs/refactors/`.

## 12. Quando parar e perguntar

- Mudança em `prisma/schema.prisma` que afete >1 entidade.
- Mudança que toca RBAC, audit, auth, ou file access.
- Deletar dado existente (mesmo em dev).
- Refactor que cruza fronteira de feature.
- Quando a instrução do usuário contradiz um invariante listado acima.

Em todos esses casos: descrever o impacto, propor alternativas, esperar
confirmação.

## 13. Dev environment

- PGLite local na porta 51218, bind `0.0.0.0` quando exposto pra LAN.
- `NEXTAUTH_URL` deve refletir o host real (IP da LAN, não `localhost`,
  quando outros usuários conectam).
- Firewall: regras com `-Profile Domain,Private -RemoteAddress 172.17.10.0/24`.
- `allowedDevOrigins` em `next.config.ts` precisa do IP da LAN pro HMR.

---

_Última atualização: 2026-05-14._

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Refactors

Antes de modificar qualquer arquivo, verifique se ele está sob escopo de um
refactor em andamento em `docs/refactors/*.md` (raiz, não `done/`). Leia o
brief correspondente antes — ele define o que pode ser tocado, em que ordem,
e quais regiões são invioláveis durante o ciclo.

Histórico de refactors concluídos vive em `docs/refactors/done/`.

Atual: _nenhum refactor ativo_.

# Preferências de implementação

Ao tomar uma ação solicitada, prefira a solução **escalável** sempre que o
esforço for baixo e o resultado equivalente para o caso atual. "Baixo
esforço" significa: até 30 min extras, sem regressão, sem dependência nova,
sem refactor lateral. Exemplos:

- Nova query em página server: usar `select` explícito em vez de `include`
  (paga só os campos que a tela usa, melhor pra cache e pra payload RSC).
- Nova agregação no dashboard: agrupar via `prisma.groupBy` ou `SQL` quando
  trivial; envolver em `retryClosedConnection` (lib/db); considerar
  `unstable_cache` se a query é cara e não muda a cada request.
- Nova coluna filtrável/sortável: garantir índice no schema Prisma se vai
  ser usada em `where`/`orderBy` recorrente.
- Nova mutation: usar `createCrudActions` (lib/actions/crud) — já entrega
  audit, RBAC pre-check e cache bust por convenção.
- Novo componente "lista grande": preferir agregar/paginar no server em vez
  de mandar tudo pro client. Hoje volumes são pequenos; convenção firmada
  agora evita reescrita depois.
- Novo arquivo de teste: testar funções **puras** primeiro (vivem em `lib/`
  e custam 5min cada); deixar componentes React/server actions pra
  iniciativa separada.

Quando a versão escalável custar mais de 30 min OU exigir mudança em
camadas vizinhas, faça a versão simples agora e abra um TODO no commit
message ou em `docs/refactors/<novo>.md` para iteração futura. Não
esconder o débito.

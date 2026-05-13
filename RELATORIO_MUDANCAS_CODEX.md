# Relatório de mudanças conduzidas pelo Codex

Data de consolidação: 2026-05-12

Este documento consolida as mudanças feitas ou conduzidas neste ciclo de trabalho do Codex no projeto Gazin Energia. Ele foi escrito a partir do estado atual do worktree, dos diffs locais e do histórico operacional desta conversa.

Não contém senhas, tokens ou segredos. Credenciais informadas durante validações locais foram usadas apenas para smoke tests e não foram gravadas aqui.

## 1. Escopo do relatório

O projeto já havia passado pelas tarefas iniciais do BRIEF antes deste relatório:

- Tarefa 1: inventário, schema e stubs.
- Tarefa 2: seed, validação e status helper.
- Tarefa 3: componentes genéricos.
- Tarefa 4: páginas das entidades.
- Tarefa 5: Auth, RBAC e NextAuth.
- Sprint production-readiness.
- Tarefa 6: audit log obrigatório.
- Tarefa 7: dashboard.
- Commit e push para GitHub.

Este relatório foca no conjunto de alterações posteriores feitas durante esta conversa, incluindo correções, melhorias de UX, dashboards analíticos por entidade, ajustes de importação e preservação de dados editados.

## 2. Arquivos e áreas alteradas

Arquivos modificados no worktree no momento da consolidação:

- `.gitignore`
- `BRIEF.md`
- `app/(dashboard)/consumo/consumo-table.tsx`
- `app/(dashboard)/geracao/actions.ts`
- `app/(dashboard)/geracao/geracao-table.tsx`
- `app/(dashboard)/injecao/injecao-table.tsx`
- `app/(dashboard)/injecao/page.tsx`
- `app/(dashboard)/layout.tsx`
- `app/(dashboard)/manutencao/limpeza/actions.ts`
- `app/(dashboard)/manutencao/limpeza/limpeza-table.tsx`
- `app/(dashboard)/page.tsx`
- `app/(dashboard)/venda-kwh/venda-kwh-table.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `components/dashboard/geracao-chart.tsx`
- `components/dashboard/orcado-realizado-chart.tsx`
- `components/data-table/data-table.tsx`
- `components/forms/entity-form.tsx`
- `components/layout/sidebar.tsx`
- `lib/actions/crud.ts`
- `lib/audit.ts`
- `lib/dashboard.ts`
- `lib/format.ts`
- `lib/schemas/geracao.ts`
- `scripts/import-raw.ts`
- `scripts/validate-migration.ts`
- `tsconfig.json`

Arquivos novos relevantes:

- `app/(dashboard)/juridico/page.tsx`
- `components/layout/theme-toggle.tsx`
- `RELATORIO_MUDANCAS_CODEX.md`

Também existem artefatos locais de execução e banco em desenvolvimento, como diretórios `.pglite-*`, logs `.next-*`, `.db-live.*`, `.local-start.*` e outros arquivos temporários. Eles não são parte funcional do app e devem ser tratados como lixo operacional local, não como implementação.

## 3. BRIEF e planejamento

### 3.1 Tarefa 8 adicionada ao BRIEF

Foi adicionada ao `BRIEF.md` uma tarefa hipotética/planejada para visões analíticas por entidade.

Objetivo documentado:

- Criar camadas analíticas individuais acima das tabelas operacionais.
- Manter as tabelas como fonte de consulta, edição, exportação e auditoria.
- Usar a tela de Controle de Injeção como referência visual, sem virar template rígido.
- Implementar por subtarefa, uma entidade por vez.

Subtarefas documentadas:

- Consumo analítico.
- Geração analítica.
- Orçamento analítico.
- Vendas de kWh analítico.
- Qualidade cadastral para cadastros quando fizer sentido.

Regras reforçadas no BRIEF:

- Não mexer em RBAC, audit log, uploads protegidos, migrations, registry, stubs ou soft delete.
- Não inventar dados para completar visual.
- Não implementar visão analítica em entidade sem dados populados.
- Reindexar Graphify em alterações estruturais relevantes.

## 4. Dashboard principal

### 4.1 Substituição de card sem uso

No dashboard principal, o card de licenças foi substituído por uma leitura mais útil relacionada a injeção.

Implementações envolvidas:

- Agregação de injeção por concessionária/fornecedor.
- Exibição de consumo/injeção onde antes havia um card menos relevante.
- Inclusão de filtros no dashboard para período e escopo.

Arquivos envolvidos:

- `app/(dashboard)/page.tsx`
- `lib/dashboard.ts`

### 4.2 Filtros do dashboard

O dashboard passou a responder melhor a filtros de mês, ano e recortes usados na tela.

Correções associadas:

- Ajustes para alertas de geração respeitarem filtros.
- Ajustes em rankings e séries para não misturar períodos indevidamente.
- Tratamento de conexão fechada em consultas do dashboard com `retryClosedConnection`.

Risco observado:

- Houve erro de `Connection terminated unexpectedly` quando o PGLite/Next estava instável. Isso foi tratado parcialmente com retry, mas a causa operacional continua sendo a necessidade de subir banco e app corretamente.

### 4.3 Gráficos no modo escuro

Foram corrigidas cores/contrastes em gráficos do dashboard.

Pontos mexidos:

- Hover do gráfico de geração dos últimos 12 meses.
- Hover do gráfico "Orçado vs realizado".
- Cores mais legíveis tanto em modo claro quanto escuro.

Arquivos envolvidos:

- `components/dashboard/geracao-chart.tsx`
- `components/dashboard/orcado-realizado-chart.tsx`
- `app/globals.css`

## 5. Modo escuro

Foi adicionado suporte a modo claro/escuro no app.

Implementações:

- Variáveis CSS para tema claro/escuro.
- Classe `.dark` no `html`.
- Persistência via `localStorage` usando a chave `gazin-theme`.
- Respeito inicial à preferência do sistema quando não há escolha salva.
- Botão de alternância no topo do layout autenticado.

Arquivos envolvidos:

- `app/globals.css`
- `app/layout.tsx`
- `app/(dashboard)/layout.tsx`
- `components/layout/theme-toggle.tsx`

Observação técnica:

- O script de tema fica em `app/layout.tsx` via `next/script`.
- Em versões anteriores durante a conversa houve alerta do Next/Turbopack sobre script renderizado no client. O comportamento atual mantém o script para preservar o tema, mas se o alerta persistir, precisa ser revisado com cuidado para não remover a inicialização de tema.

## 6. Sidebar e layout

### 6.1 Sidebar colapsável

A sidebar foi ajustada para poder ser recolhida/expandida.

Implementações:

- Estado persistido em `localStorage`.
- Evento interno para sincronizar estado.
- Larguras distintas para estado aberto e colapsado.
- Ícones e labels ajustados para não quebrar o layout.
- Comportamento sticky para acompanhar rolagem.

Arquivos envolvidos:

- `components/layout/sidebar.tsx`
- `app/(dashboard)/layout.tsx`

### 6.2 Tabelas e rolagem

Foi adicionado comportamento de acompanhamento em tabelas:

- Modo solto.
- Modo apenas colunas/cabeçalho.
- Modo bloco.

Objetivo:

- Melhorar uso de telas com muitas colunas e rolagem horizontal/vertical.

Arquivo envolvido:

- `components/data-table/data-table.tsx`

## 7. Tabela genérica

O componente genérico de tabela recebeu várias melhorias.

### 7.1 Filtro por coluna estilo Excel

Foi implementado filtro por coluna com multi-seleção.

Recursos:

- Botão de filtro ao lado do título da coluna.
- Busca dentro dos valores da coluna.
- Seleção de múltiplos valores.
- Ações "Todos" e "Nenhum".
- Indicador de filtro ativo.
- Botão global "Limpar filtros".

Correções feitas depois:

- `DropdownMenuLabel` foi colocado dentro de `DropdownMenuGroup` para corrigir erro do Base UI:
  - `MenuGroupRootContext is missing`.
- Primeira coluna passou a ter filtro quando há valor acessível para filtrar.
- Foi corrigido o bug em que selecionar "Nenhum" e depois uma opção marcava todos os registros.
- Limite de opções:
  - `filial`: até 550 registros exibidos.
  - demais colunas: até 200 registros exibidos.

Arquivo envolvido:

- `components/data-table/data-table.tsx`

### 7.2 Redimensionamento de colunas

Foi corrigido bug de interação no resize:

- Antes, ao arrastar a borda da coluna e soltar sobre texto de cabeçalho, a tabela podia disparar ordenação.
- Foi adicionado controle para suprimir clique de sort logo após iniciar resize.

Arquivo envolvido:

- `components/data-table/data-table.tsx`

### 7.3 Ordenação

As classificações foram revisadas porque algumas colunas deixaram de responder corretamente.

Ponto importante:

- Houve ajuste para restaurar ordenações em colunas com `accessor`.
- O comportamento do ranking de geração sofreu regressões durante esse ajuste e precisou ser reavaliado depois.

Arquivo envolvido:

- `components/data-table/data-table.tsx`

### 7.4 Busca global

A busca global foi investigada por falso positivo em consumo:

- Pesquisa por `10153` retornava também `10336.1`, porque o valor aparecia dentro de outro campo numérico, como UC.
- Foi implementado temporariamente um comportamento tokenizado para números.
- Depois, por solicitação do usuário, esse comportamento foi revertido.

Estado atual:

- A busca global voltou a ser substring simples.
- Risco atual: falsos positivos numéricos continuam possíveis quando o termo aparece dentro de outro número maior.

Arquivo envolvido:

- `components/data-table/data-table.tsx`

## 8. Controle de Injeção

Foi criada uma camada analítica para injeção.

Objetivos:

- Visualizar quanto foi injetado/consumido.
- Quebrar por concessionária/fornecedor.
- Dar leitura de ranking e indicadores sem substituir a tabela.

Implementações:

- `InjecaoAnalytics` acima da tabela operacional.
- Filtro por período.
- Agregação por fornecedor/concessionária.
- KPIs e rankings de injeção/consumo/valor.
- Ajustes de busca para incluir fornecedor corretamente.

Bug corrigido:

- Pesquisa por fornecedor como `GR ENERGY` não retornava corretamente em controle de injeção.
- A causa estava no filtro global e na forma como dados relacionados/objetos eram achatados para busca.

Arquivos envolvidos:

- `app/(dashboard)/injecao/injecao-table.tsx`
- `app/(dashboard)/injecao/page.tsx`
- `components/data-table/data-table.tsx`

## 9. Geração

Foi criada e ajustada uma camada analítica para geração.

### 9.1 KPIs de geração

Implementações:

- Indicadores semelhantes aos do controle de injeção, mas específicos de geração.
- Realizado.
- Meta mensal/diária.
- Diferença contra meta.
- Estimado.
- Economia/indicadores financeiros quando disponíveis.
- Ranking por usina.
- Qualidade/completude de dados.

Arquivo envolvido:

- `app/(dashboard)/geracao/geracao-table.tsx`

### 9.2 Meta mensal

Bug corrigido:

- Campo "meta mensal" estava usando o valor da meta diária.
- Correção aplicada para meta mensal considerar meta diária multiplicada pela quantidade de dias do mês.

Arquivos envolvidos:

- `app/(dashboard)/geracao/geracao-table.tsx`
- `lib/schemas/geracao.ts`

### 9.3 Ranking por usina

Problemas investigados:

- Ranking somava múltiplos meses quando o usuário esperava filtro por mês.
- Barras apareciam cheias mesmo com percentual abaixo de 100%.
- Em maio, valores pareciam agregados indevidamente.
- Estimado usava valor com fator climático em momento em que o usuário esperava o valor sem considerar fator.

Status:

- Foram feitos ajustes em cálculo/filtro/ranking.
- Houve regressão percebida pelo usuário em um momento, então essa área deve continuar sendo tratada com cautela.

Arquivos envolvidos:

- `app/(dashboard)/geracao/geracao-table.tsx`
- `lib/dashboard.ts`

### 9.4 Edição de dias de geração

Foi revisada a action de edição de geração para manter audit obrigatório.

Implementação relevante:

- Mutação e audit log dentro da mesma transação.
- Se o audit falhar, a mutação falha.

Arquivo envolvido:

- `app/(dashboard)/geracao/actions.ts`

## 10. Consumo

Foi criada uma camada analítica para consumo.

### 10.1 Dashboard de consumo

Implementações:

- Visão analítica acima da tabela.
- Filtro por período.
- KPIs:
  - Consumo total.
  - Ponta.
  - Fora ponta.
  - Valor total.
  - R$/kWh médio.
- Top 10 filiais por consumo.
- Consumo por mês.
- Top 10 ponta.
- Top 10 fora ponta.
- Top 10 valor de fatura.
- Indicadores de qualidade de dados.

Arquivo envolvido:

- `app/(dashboard)/consumo/consumo-table.tsx`

### 10.2 Ponta e fora ponta nos cards

Foi adicionada subinformação nos cards de Ponta e Fora ponta.

Estado atual após correção de ambiguidade:

- `valor` representa `kWh P R$`.
- `valor1` representa `kWh FP R$`.
- `valor2` representa `Consumo total kWh R$`.
- `valor3` representa `injeção recebida kWh R$`.

Correção aplicada:

- Card Ponta usa `valor`.
- Card Fora ponta usa `valor1`.
- Foi removido o rateio proporcional que havia sido implementado antes dessa explicação.

Risco restante:

- Outros pontos da UI ainda exibem os campos como `Valor`, `Valor 1`, `Valor 2`, `Valor 3`.
- Pode valer uma próxima correção para renomear labels de tabela, drawer, formulário e exportações usando a semântica correta acima.

### 10.3 Variações

Foi pedido recurso para visualizar maiores variações.

Implementações relacionadas:

- `VariacaoCell`.
- Ordenação por variação.
- Campos de variação de consumo e fatura calculados no server.

Arquivos envolvidos:

- `app/(dashboard)/consumo/consumo-table.tsx`
- `components/data-table/variacao-cell.tsx`

## 11. Venda de kWh e arquivos

Foi tratado problema em módulos com upload/anexo, especialmente Venda de kWh.

Problema:

- Arquivo aparecia apenas como substituível/removível, sem acesso para inspeção.
- Em um momento o acesso retornava 404.

Implementações:

- Exibição de link com ícone de anexo.
- Suporte a URLs protegidas como `/api/files/...`.
- Suporte a caminhos de upload e URLs externas quando presentes.

Arquivos envolvidos:

- `app/(dashboard)/venda-kwh/venda-kwh-table.tsx`
- `components/forms/entity-form.tsx`

Risco:

- Upload deve continuar passando por rota protegida ou signed URL.
- Não deve virar link público direto fora do controle de autorização.

## 12. Jurídico

Foi corrigido 404 em `/juridico`.

Implementação:

- Criada rota `app/(dashboard)/juridico/page.tsx`.
- A rota redireciona para o submódulo correto, como `/juridico/processos`.

Validação feita:

- Smoke sem autenticação indicou redirect para login.

Arquivo novo:

- `app/(dashboard)/juridico/page.tsx`

## 13. Audit log

### 13.1 Correção de FK em audit

Problema:

- Ao arquivar registro, houve erro:
  - `Foreign key constraint violated on the constraint: AuditLog_userId_fkey`.

Causa provável:

- Sessão/JWT apontava para um `userId` que não existia mais no banco atual, especialmente após seed ou troca de banco PGLite.

Correção:

- Audit passou a resolver o ator com fallback por e-mail quando o `userId` da sessão está stale.
- Se não houver usuário válido, a mutação continua falhando.
- Isso preserva a regra crítica: audit é obrigatório.

Arquivos envolvidos:

- `lib/audit.ts`
- `lib/actions/crud.ts`
- `app/(dashboard)/geracao/actions.ts`
- `app/(dashboard)/manutencao/limpeza/actions.ts`

### 13.2 Audit em actions customizadas

Actions customizadas de geração e limpeza/manutenção foram revisadas para manter audit dentro da transação.

Regra preservada:

- Nenhuma mutação relevante deve persistir sem audit.

## 14. Importação, seed e preservação de edições manuais

### 14.1 Pasta para novos JSONs

Foi criada/organizada área para receber novos JSONs:

- `data/raw/`

O `.gitignore` mantém dumps locais fora do versionamento, preservando `.gitkeep`.

### 14.2 Backup e substituição de JSONs

Foi feita rotina operacional de backup/substituição dos JSONs brutos quando o usuário colocou novos arquivos.

Risco operacional percebido:

- Atualizar JSON não atualiza site sozinho.
- É necessário rodar seed/import para popular banco.
- Se o banco usado pelo Next for outro PGLite, a UI não reflete a alteração esperada.

### 14.3 Normalização de filial `.10` para `.1`

Problema:

- Filiais vindas como `1917.10` ou `240042.10` deveriam representar `.1`.

Implementação paliativa:

- Normalização de código de filial no import:
  - `.10` é tratado como `.1` para vínculo.

Arquivos envolvidos:

- `scripts/import-raw.ts`

Observação:

- O usuário indicou que a correção definitiva virá na base Zoho em exportações futuras.
- A normalização atual é uma medida paliativa para não perder vínculo no banco.

### 14.4 Preservação de edições manuais

Problema:

- Edições feitas no sistema poderiam ser perdidas em novo `db seed`.
- Exemplo discutido: registro de consumo editado e registro de março arquivado.

Implementação:

- Importador passou a consultar audit logs para detectar registros alterados manualmente.
- Registros com alteração manual são preservados durante import/seed.
- Soft deletes manuais não são restaurados automaticamente pelo JSON.

Modelos cobertos:

- `Filial`
- `Usina`
- `Fornecedor`
- `Geracao`
- `VendaKwh`
- `Consumo`
- `Injecao`
- `Orcamento`
- `CronogramaLimpeza`
- `ManutencaoPreventiva`
- `ProcessoJuridico`

Regras específicas:

- `VendaKwh` usa chave composta lógica `zohoId:ano:mes`.
- `Geracao` e `CronogramaLimpeza` evitam reimportar filhos quando o pai foi alterado manualmente.
- `syncSoftDeletes` respeita registros com alteração manual e não restaura arquivados manualmente.

Arquivos envolvidos:

- `scripts/import-raw.ts`
- `lib/audit.ts`
- `lib/actions/crud.ts`

### 14.5 Geração - mapeamento de dias

Foi investigado problema de dias que não entravam corretamente, como dias 16 e 21.

Correção aplicada no import:

- Ajuste de mapeamento de campos de dias da Zoho para geração.
- Dia 16 e campos finais passaram a ser considerados conforme estrutura exportada.
- Dia 31 é tratado como ausente quando não há dado.

Arquivo envolvido:

- `scripts/import-raw.ts`

## 15. Banco local, PGLite e localhost

Durante a conversa houve várias tentativas de subir o ambiente local.

Comando que funcionou para o banco PGLite:

```powershell
node.exe node_modules\@electric-sql\pglite-socket\dist\scripts\server.js --db .pglite-full-20260512080515 --host 127.0.0.1 --port 51218 --max-connections 10
```

Comando que funcionou para o Next local:

```powershell
$env:DATABASE_URL="postgres://postgres:postgres@127.0.0.1:51218/template1?sslmode=disable&connection_limit=10&connect_timeout=0&max_idle_connection_lifetime=0&pool_timeout=0&socket_timeout=0"
npm.cmd run dev -- -H 127.0.0.1 -p 3000
```

Pontos importantes:

- O app foi mantido em `127.0.0.1`, não aberto para rede externa.
- Para banco novo ou PGLite recém-criado, seed precisa ser rodado.
- Sessão ativa no navegador não garante que o usuário exista no banco atual.
- Isso explicou erros de login e audit FK em alguns momentos.

Risco operacional:

- Há muitos diretórios/logs locais gerados por tentativas de subir banco/app.
- Eles devem ser limpos manualmente depois, com cuidado para não apagar o banco PGLite ativo.

## 16. Validações e smoke tests realizados

Validações padrão executadas em várias etapas:

- `npx.cmd tsc --noEmit`
- `npx.cmd eslint .`
- `npm.cmd run check:rbac`

Resultado recorrente:

- TypeScript passou.
- RBAC passou.
- ESLint passou com warning conhecido do TanStack Table:
  - `react-hooks/incompatible-library` em `useReactTable`.

Smoke tests feitos:

- `/consumo` autenticado retornou `200`.
- `/consumo` renderizou `Visão de consumo`.
- `/consumo` renderizou `Valor agregado`.
- `/juridico` sem autenticação redirecionou para login.
- Dashboard foi acessado em vários filtros de mês.

Observação:

- O warning do TanStack Table não bloquea build/lint, mas deve ser acompanhado se o React Compiler passar a tratar isso de forma mais rígida.

## 17. Bugs corrigidos

Lista consolidada de bugs tratados:

- `Decimal objects are not supported` ao passar dados Prisma para Client Components.
- Busca em injeção não encontrava fornecedor como `GR ENERGY`.
- Exportações de consumo não traziam valores relevantes.
- Valores `valor1`, `valor2`, `valor3` não estavam todos considerados em exportação/visualização.
- Base UI `MenuGroupRootContext is missing` no filtro por coluna.
- Primeira coluna sem opção de filtragem.
- Espaçamento visual no filtro de consumo onde "selecionar todos" ficava engolido.
- "Selecionar nenhum" seguido de uma opção marcava todos.
- Limite de filtro de filial insuficiente.
- Códigos `.1` interpretados como `.10`.
- Arquivos/anexos não acessíveis para inspeção.
- `/juridico` retornando 404.
- Dashboard quebrando por conexão de banco encerrada.
- Hover ilegível em gráficos no modo escuro.
- Card de meta mensal em geração usando valor diário.
- Resize de coluna disparando sort ao soltar mouse sobre cabeçalho.
- Audit FK quebrando ao arquivar após seed/troca de banco.
- Seed sobrescrevendo edições manuais.

## 18. Vulnerabilidades e riscos tratados

### 18.1 Audit obrigatório

Risco:

- Mutação persistir sem audit log.

Tratamento:

- Mutação e audit em transação.
- Falha no audit falha a mutação.
- Fallback por e-mail evita FK quebrada por sessão stale, mas não ignora ausência de usuário.

### 18.2 Upload protegido

Risco:

- Expor arquivos por caminho público direto.

Tratamento:

- UI passou a privilegiar links que podem passar por `/api/files/...`.
- Relatório reforça que upload não deve virar link público sem proteção.

### 18.3 Seed destrutivo sobre edição manual

Risco:

- Correções feitas no sistema serem perdidas ao reimportar JSON.

Tratamento:

- Importador preserva registros com audit manual.
- Soft delete manual não é restaurado sem intenção.

### 18.4 Banco local e sessão stale

Risco:

- Trocar banco local mantendo sessão antiga pode quebrar auth/audit.

Tratamento:

- Audit resolve usuário com fallback.
- Recomendação operacional: após trocar banco/seed, relogar.

## 19. Regressões e decisões revertidas

### 19.1 Busca numérica tokenizada

Foi implementada uma busca numérica mais rígida para impedir falso positivo.

Depois foi revertida a pedido do usuário.

Estado atual:

- Busca global usa substring simples.
- Isso mantém comportamento antigo e flexível, mas permite falsos positivos numéricos.

### 19.2 Valor agregado em Ponta/Fora ponta

Foi implementado primeiro por rateio proporcional da fatura total.

Depois foi corrigido quando o usuário esclareceu a semântica:

- `valor` = valor de kWh P.
- `valor1` = valor de kWh FP.

Estado atual:

- Cards usam campos reais, não rateio.

## 20. Pendências recomendadas

Prioridade alta:

- Revisar labels de `valor`, `valor1`, `valor2`, `valor3` em consumo para refletir a semântica correta.
- Validar exportações depois dessa semântica:
  - `valor` como Ponta R$.
  - `valor1` como Fora ponta R$.
  - `valor2` como Consumo total R$.
  - `valor3` como Injeção recebida R$.
- Revisar definitivamente a busca global para equilibrar precisão numérica e flexibilidade.
- Limpar estratégia operacional de PGLite para reduzir erro humano ao subir localhost.

Prioridade média:

- Revisar geração analítica com casos reais de março/abril/maio para garantir que filtros de mês, meta e estimado estejam corretos.
- Criar teste automatizado ou script de verificação para preservação de edição manual no seed.
- Ajustar `.gitignore` para cobrir logs/diretórios temporários locais ainda não ignorados, se forem recorrentes.

Prioridade baixa:

- Revisar copy visual de alguns cards.
- Criar documentação curta de "como subir local" no README ou arquivo próprio.
- Avaliar se o warning do TanStack Table merece comentário ou configuração explícita.

## 21. Estado de commit

As alterações estão em worktree sujo.

Durante a conversa houve tentativa/possibilidade de commit, mas foi evitado quando havia muitas alterações acumuladas e não relacionadas no mesmo worktree. Também foi observado anteriormente erro de permissão com `.git/index.lock` em tentativas de commit.

Recomendação:

- Separar commits por tema:
  - Tema/dark mode/sidebar.
  - DataTable/filtros/sticky.
  - Dashboard principal.
  - Injeção analítica.
  - Geração analítica.
  - Consumo analítico.
  - Audit/preservação de seed.
  - Importador/normalização Zoho.
  - Docs/BRIEF.

## 22. Graphify

Graphify foi usado conceitualmente como índice de navegação conforme regra do projeto, mas os arquivos reais sempre foram abertos antes de edição.

Como este relatório cria um arquivo novo, o índice Graphify deve ser atualizado depois da criação.

Tentativa realizada nesta consolidação:

- `graphify . --update`
- Resultado: falhou antes de iniciar com `uv trampoline failed to canonicalize script path`.
- Tentativa alternativa com cache local via `UV_CACHE_DIR=.uv-cache`: mesma falha.
- Tentativa alternativa com `uvx --from graphifyy graphify . --update`: falhou por acesso negado ao diretório Python gerenciado do `uv`.

Se o reindex não for executado na mesma etapa, considerar pendente:

```powershell
/graphify . --update
```

ou o comando equivalente local configurado para o projeto.

## 23. Resumo executivo

As maiores mudanças deste ciclo foram:

- Transformar telas de planilha em telas com leitura analítica.
- Melhorar ergonomia de tabelas grandes.
- Adicionar modo escuro e sidebar colapsável.
- Corrigir audit para não quebrar com sessão stale após seed.
- Proteger edições manuais contra sobrescrita por reimportação.
- Ajustar importação de dados problemáticos vindos da Zoho.
- Corrigir bugs visuais e funcionais surgidos durante uso real.

O principal risco restante é operacional: banco local, seed, sessão e arquivos temporários ainda exigem disciplina para não criar leituras inconsistentes no ambiente de desenvolvimento.

# Lapada Bot — contexto para AI

Bot Discord em TypeScript que rastreia atividade (voz, mensagens, reações) e distribui cargos automaticamente aos membros mais engajados.

## Stack

- **Runtime:** Node.js + TypeScript, pnpm
- **Discord:** discord.js v14, slash commands
- **DB:** PostgreSQL via Prisma ORM (`prisma/schema.prisma`)
- **Cache:** Redis via ioredis
- **Scheduler:** node-cron
- **Charts:** chartjs-node-canvas + canvas
- **AI:** Groq SDK (resumos e insights nos relatórios)
- **Testes:** Vitest (`pnpm test`)

## Estrutura de src/

```
bot.ts                    # entrypoint: carrega eventos/comandos dinamicamente, agenda tasks
client.ts                 # cria o Client discord.js com Map<commands>
deploy-commands.ts        # registra slash commands no Discord (roda separado)

commands/
  stats.ts                # /lapada-stats — métricas do usuário
  leaderboard.ts          # /lapada-leaderboard — ranking
  comparar.ts             # /lapada-comparar — comparação entre períodos
  grafico.ts              # /lapada-grafico — gráfico de atividade de voz
  info.ts                 # /lapada-info — configurações do servidor
  help.ts / lapada-help.ts
  lapada-ai.ts            # /lapada-ai — insights gerados por AI
  admin/
    config.ts             # /lapada-config — só a definição do SlashCommandBuilder
    configHandlers.ts     # lógica do execute de /lapada-config (extraída de config.ts)
    report.ts             # /lapada-report — forçar relatórios/agregação

events/
  voiceStateUpdate.ts     # abre/fecha VoiceSession e StreamSession no Redis/DB
  messageCreate.ts        # registra MessageActivity
  messageReactionAdd.ts   # registra ReactionActivity
  guildMemberAdd.ts       # upsert de User ao entrar no servidor

services/
  metricsService.ts       # queries de DB: leaderboard, stats, aggregateDaily
                          # re-exporta símbolos de dateUtils para backward compat
  reportService.ts        # envia embed de relatório no canal configurado
  rewardsService.ts       # atribui/remove cargos (top N, inatividade, challenge)
                          # helper privado applyRoleChange para chamadas Discord API
  chartService.ts         # gera imagens de gráfico com chartjs-node-canvas
  aiService.ts            # resumos e insights via Groq
  ai/
    factory.ts            # factory de providers de AI
    providers/            # implementações (Groq etc.)
    types.ts

tasks/
  weeklyReport.ts         # cron: relatório semanal + atribuição de cargos
  monthlyReport.ts        # cron: relatório mensal + agregação diária
  dailyLeaderboard.ts     # cron: ranking diário no canal configurado
  reconcileSessions.ts    # ao iniciar: fecha sessões de voz que ficaram abertas

database/
  prisma.ts               # instância do PrismaClient + checkDbConnection

utils/
  dateUtils.ts            # toLocalNow, getPeriodStart, getPeriodLabel,
                          # getLocalDayBoundaries, resolveHistoricalRange, HistoricalRange
  scoring.ts              # calculateScore (função pura)
  embeds.ts               # buildStatsEmbed, buildLeaderboardEmbed, buildReportEmbed
  guildConfig.ts          # getCachedGuildConfig, invalidateGuildConfig
  redis.ts                # getCached, getRedis
  logger.ts               # logger + registerProcessHandlers (SIGINT/SIGTERM)

__tests__/
  utils/scoring.test.ts
  utils/dateUtils.test.ts
  utils/embeds.test.ts
  services/metricsService.test.ts
  commands/stats.test.ts
  commands/leaderboard.test.ts
```

## Modelos do banco (schema.prisma)

| Modelo | Descrição |
|---|---|
| `User` | Membro do Discord (id = Discord user ID) |
| `MessageActivity` | Cada mensagem enviada |
| `VoiceSession` | Entrada/saída de canal de voz (durationMs calculado ao sair) |
| `StreamSession` | Início/fim de stream (durationMs calculado ao parar) |
| `ReactionActivity` | Reação recebida (targetUserId = quem recebeu) |
| `DailyAggregate` | Agregado diário por usuário (score, minutos, mensagens, reações) |
| `RoleAssignment` | Histórico de atribuição/remoção de cargos |
| `GuildConfig` | Configurações por servidor (canal, cargos, multiplicadores, horários) |

## Cálculo de score

```
score = (mensagens × 1.0) + (voiceMinutes × voiceMultiplier) + (streamMinutes × streamMultiplier) + (reações × 1.5)
score final = score × (1 + diasConsecutivos × 0.05)   // bônus de streak
```

Padrões: voiceMultiplier=2.0, streamMultiplier=1.5 (stream desabilitado por padrão).
Voz e stream só pontuam com ≥2 pessoas no canal.
Implementação: `utils/scoring.ts → calculateScore`.

## Convenções

- Comandos: arquivo exporta `{ data: SlashCommandBuilder, execute(interaction) }`
- Eventos: exporta `{ name, once?, execute(...args) }`
- `bot.ts` escaneia apenas `commands/` e `commands/admin/` (não subdirs) — arquivos sem `data+execute` são ignorados automaticamente
- Datas internas são UTC midnight; `dateUtils.fmtDate` formata com `timeZone: "UTC"`
- `toLocalNow(tz)` retorna Date cujos campos UTC representam a hora local no timezone — permite que `getPeriodStart` (que usa getUTC*) opere em tempo local
- Redis armazena sessões de voz/stream ativas em tempo real; Prisma persiste ao fechar sessão
- `manualPoints` no `DailyAggregate` permite ajuste manual por admin (positivo = bônus, negativo = penalidade)
- `participantRoleIds` — se preenchido, só membros com um desses cargos entram nas métricas
- `comparar.ts` tem seu próprio `fmtDate` local (com `timeZone: "UTC"`) — não consolidar com `dateUtils.fmtDate`
- Testes usam `vi.mock("../../database/prisma")` para isolar Prisma; `vi.mock("../../services/metricsService")` para isolar comandos

## Comandos úteis

```bash
pnpm dev               # hot reload (tsx watch)
pnpm test              # roda todos os testes (vitest run)
pnpm test:watch        # modo watch
pnpm deploy:commands   # registra slash commands (usa GUILD_ID do .env para dev)
pnpm db:push           # sync schema → banco
pnpm db:studio         # Prisma Studio
pnpm docker:up/down    # PostgreSQL + Redis locais
```

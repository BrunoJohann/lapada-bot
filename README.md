# 🏆 Lapada Bot

> Bot de atividade para Discord que reconhece e recompensa os membros mais presentes do servidor.

Ele monitora quem está ativo — tempo em canais de voz, mensagens enviadas e reações recebidas — e distribui cargos especiais automaticamente para os mais engajados, como o famoso **"Melhores de nós"**.

---

## ✨ O que ele faz

- 🎙️ **Rastreia tempo em canal de voz** em tempo real
- 💬 **Conta mensagens** enviadas nos canais
- ⭐ **Registra reações** recebidas nas mensagens
- 🏅 **Atribui cargos automaticamente** aos top N membros da semana ou do mês
- 📊 **Relatórios periódicos** com ranking enviados no canal configurado
- ⚙️ **Totalmente configurável** direto pelo Discord, sem precisar editar código

---

## 🚀 Como rodar localmente

### Pré-requisitos

- [Node.js 18+](https://nodejs.org)
- [pnpm](https://pnpm.io/installation)
- [Docker](https://www.docker.com) (para PostgreSQL e Redis)
- Uma aplicação criada no [Discord Developer Portal](https://discord.com/developers/applications)

### 1. Clone o repositório

```bash
git clone https://github.com/BrunoJohann/lapada-bot.git
cd lapada-bot
```

### 2. Instale as dependências

```bash
pnpm install
```

### 3. Configure o `.env`

Copie o arquivo de exemplo e preencha com seus dados:

```bash
cp .env.example .env
```

```env
# Discord — obtido no Discord Developer Portal
DISCORD_TOKEN=seu_token_aqui
DISCORD_CLIENT_ID=seu_client_id_aqui

# PostgreSQL (Docker local)
DATABASE_URL="postgresql://discord_bot:discord_bot_pass@localhost:5432/discord_bot?schema=public"

# Redis (Docker local)
REDIS_URL=redis://localhost:6379

# Config
NODE_ENV=development
TIMEZONE=America/Sao_Paulo

# Deploy de comandos — ID do servidor para registro instantâneo (recomendado em dev)
# Se vazio, registra globalmente (pode demorar até 1h)
GUILD_ID=
```

> **Onde encontrar o token e client ID?**
> No [Discord Developer Portal](https://discord.com/developers/applications) → seu app → **Bot** (token) e **General Information** (Application ID).
>
> Na aba **Bot**, ative também: **Server Members Intent** e **Message Content Intent**.

### 4. Suba o banco de dados

```bash
pnpm docker:up
```

### 5. Sincronize o banco com o schema

```bash
pnpm db:push
```

### 6. Adicione o bot ao seu servidor

No [Discord Developer Portal](https://discord.com/developers/applications) → **OAuth2 → URL Generator**:

- Scopes: `bot` + `applications.commands`
- Permissões: `Send Messages`, `Embed Links`, `Read Message History`, `View Channels`, `Manage Roles`

Abra a URL gerada no navegador e adicione o bot ao servidor.

### 7. Registre os comandos slash

```bash
pnpm deploy:commands
```

> Com `GUILD_ID` definido no `.env`, os comandos aparecem **na hora**. Sem ele, pode demorar até 1h.

### 8. Inicie o bot

```bash
pnpm dev
```

---

## ⚙️ Configurando no Discord

Após adicionar o bot ao servidor, use os comandos abaixo para configurá-lo.
Todos os comandos de configuração exigem permissão de **Administrador**.

### Passo a passo

**1. Crie o cargo de recompensa no Discord**

Vá em Configurações do servidor → Cargos → crie um cargo (ex: `Melhores de nós`).
Arraste o **cargo do bot para acima** do cargo que ele vai atribuir.

**2. Configure o bot com os slash commands**

```
/lapada-config canal                  #seu-canal       → onde os relatórios serão enviados
/lapada-config cargo-semanal          @Melhores de nós → cargo para o top semanal
/lapada-config cargo-mensal           @Melhores de nós → cargo para o top mensal
/lapada-config top-n-semanal          3                → quantos membros recebem o cargo semanal
/lapada-config top-n-mensal           3                → quantos membros recebem o cargo mensal
/lapada-config duracao-cargo-semanal  7                → dias que o cargo semanal é mantido
/lapada-config duracao-cargo-mensal   30               → dias que o cargo mensal é mantido
/lapada-config inatividade            30               → dias sem atividade para perder o cargo
/lapada-config horario-report         23               → hora(s) do ranking diário (ex: 9,21 para dois horários)
/lapada-config horario-semanal        Segunda 8        → dia e hora do relatório semanal
/lapada-config horario-mensal         1 8              → dia do mês e hora do relatório mensal
```

**3. Veja as configurações salvas**

```
/lapada-info
```

**4. Teste imediatamente**

```
/lapada-report agregar    → força a agregação das métricas de hoje
/lapada-report semanal    → gera o relatório semanal agora
```

---

## 📋 Todos os comandos

### 👥 Para todos os membros

| Comando | Descrição |
|---|---|
| `/lapada-stats` | Veja suas métricas da semana ou do mês |
| `/lapada-stats usuario:@Alguém` | Veja as métricas de outro membro |
| `/lapada-leaderboard` | Ranking semanal do servidor |
| `/lapada-leaderboard periodo:Mês atual` | Ranking mensal |
| `/lapada-report semanal` | Gera o relatório semanal agora |
| `/lapada-report mensal` | Gera o relatório mensal agora |
| `/lapada-report agregar` | Força atualização das métricas |
| `/help` ou `/lapada-help` | Ajuda e tutorial de configuração |

### 🔧 Para administradores

| Comando | Descrição |
|---|---|
| `/lapada-info` | Mostra todas as configurações do servidor |
| `/lapada-config canal #canal` | Canal para relatórios automáticos |
| `/lapada-config cargo-semanal @Cargo` | Cargo do top semanal |
| `/lapada-config cargo-mensal @Cargo` | Cargo do top mensal |
| `/lapada-config top-n-semanal 3` | Quantos membros recebem o cargo semanal |
| `/lapada-config top-n-mensal 3` | Quantos membros recebem o cargo mensal |
| `/lapada-config duracao-cargo-semanal 7` | Dias que o cargo semanal é mantido |
| `/lapada-config duracao-cargo-mensal 30` | Dias que o cargo mensal é mantido |
| `/lapada-config inatividade 30` | Dias sem atividade para perder o cargo |
| `/lapada-config horario-report 23` | Hora(s) do ranking diário (ex: `9,21` para dois horários) |
| `/lapada-config horario-semanal Segunda 8` | Dia da semana e hora do relatório semanal |
| `/lapada-config horario-mensal 1 8` | Dia do mês e hora do relatório mensal |
| `/lapada-config voz 2.0` | Multiplicador de pontos por minuto de voz |
| `/lapada-config streamer true` | Habilita/desabilita rastreamento de stream |
| `/lapada-config streamer true multiplicador:1.5` | Habilita stream com multiplicador customizado |
| `/lapada-config cargo-participante-adicionar @Cargo` | Só este cargo participa das métricas |
| `/lapada-config cargo-participante-remover @Cargo` | Remove cargo da lista de participantes |

---

## 📊 Como o score é calculado

O score combina três tipos de atividade no período:

```
score = (mensagens × 1.0) + (minutos em voz × voiceMultiplier) + (minutos de stream × streamMultiplier) + (reações recebidas × 1.5)
```

> Multiplicadores padrão: voz = **2.0**, stream = **1.5** (stream desabilitado por padrão). Configure com `/lapada-config voz` e `/lapada-config streamer`.
> **Regra:** voz e stream só pontuam se houver **≥2 pessoas** no canal.

**Bônus de streak:** membros ativos em dias consecutivos recebem um multiplicador:
```
score final = score × (1 + dias_consecutivos × 5%)
```

---

## 🔄 Quando os cargos são atribuídos e removidos

| Evento | Quando |
|---|---|
| **Relatório semanal** | Configurável via `/lapada-config horario-semanal` (padrão: segunda às 08:00) |
| **Relatório mensal** | Configurável via `/lapada-config horario-mensal` (padrão: dia 1 às 08:00) |
| **Cargo atribuído** | Top N membros com maior score recebem o cargo |
| **Cargo removido por prazo** | Após `duracao-cargo-semanal` ou `duracao-cargo-mensal` dias desde a atribuição |
| **Cargo removido por inatividade** | Após `inatividade` dias sem nenhuma atividade |

---

## ☁️ Deploy em produção (grátis)

Stack recomendada: **Railway** (bot) + **Supabase** (PostgreSQL) + **Upstash** (Redis)

| Serviço | Uso | Limite grátis |
|---|---|---|
| [Supabase](https://supabase.com) | PostgreSQL | 500 MB |
| [Upstash](https://upstash.com) | Redis | 10.000 req/dia |
| [Railway](https://railway.app) | Bot Node.js | ~$5 crédito/mês |

### Passo a passo

**1. PostgreSQL no Supabase**
1. Crie um projeto em [supabase.com](https://supabase.com)
2. Vá em **Settings → Database** e copie a *Connection string* (URI)
3. Acrescente `?schema=public` no final

**2. Redis no Upstash**
1. Crie um banco em [upstash.com](https://upstash.com)
2. Copie a URL no formato `rediss://default:PASSWORD@ENDPOINT.upstash.io:6379`

**3. Bot no Railway**
1. Crie um projeto em [railway.app](https://railway.app)
2. Conecte o repositório `BrunoJohann/lapada-bot`
3. Em **Variables**, adicione todas as variáveis do `.env.example` com valores reais
4. Railway detecta o `railway.toml` e faz o build via Docker automaticamente

**4. Configure o banco de produção (rode uma vez localmente)**

```bash
DATABASE_URL="sua-url-supabase" pnpm db:push
DATABASE_URL="sua-url-supabase" pnpm deploy:commands
```

---

## 🐳 Scripts disponíveis

```bash
pnpm dev              # Inicia em modo desenvolvimento (hot reload)
pnpm build            # Compila o TypeScript
pnpm start            # Inicia a versão compilada
pnpm deploy:commands  # Registra os slash commands no Discord
pnpm db:push          # Sincroniza o schema com o banco
pnpm db:studio        # Abre o Prisma Studio (visualizar dados)
pnpm docker:up        # Sobe PostgreSQL e Redis via Docker
pnpm docker:down      # Para os containers
```

---

## 🛠️ Stack

| Camada | Tecnologia |
|---|---|
| Bot | [discord.js v14](https://discord.js.org) |
| Linguagem | TypeScript |
| Banco de dados | PostgreSQL + [Prisma ORM](https://prisma.io) |
| Cache | Redis ([ioredis](https://github.com/redis/ioredis)) |
| Scheduler | [node-cron](https://github.com/node-cron/node-cron) |
| Package manager | pnpm |

---

## 📄 Licença

MIT — sinta-se livre para usar, modificar e distribuir.

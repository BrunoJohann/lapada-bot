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
/lapada-config canal          #seu-canal      → onde os relatórios serão enviados
/lapada-config cargo-semanal  @Melhores de nós → cargo para o top semanal
/lapada-config top-n          3                → quantos membros recebem o cargo
/lapada-config duracao-cargo  30               → dias que o cargo é mantido
/lapada-config inatividade    30               → dias sem atividade para perder o cargo
```

**3. Veja as configurações salvas**

```
/lapada-config ver
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
| `/help` ou `/lapada-help` | Ajuda e tutorial de configuração |

### 🔧 Para administradores

| Comando | Descrição |
|---|---|
| `/lapada-config ver` | Mostra todas as configurações |
| `/lapada-config canal #canal` | Canal para relatórios automáticos |
| `/lapada-config cargo-semanal @Cargo` | Cargo do top semanal |
| `/lapada-config cargo-mensal @Cargo` | Cargo do top mensal |
| `/lapada-config top-n 3` | Quantos membros recebem o cargo |
| `/lapada-config duracao-cargo 30` | Dias que o cargo é mantido após atribuição |
| `/lapada-config inatividade 30` | Dias sem atividade para perder o cargo |
| `/lapada-config cargo-participante-adicionar @Cargo` | Só este cargo participa das métricas |
| `/lapada-config cargo-participante-remover @Cargo` | Remove cargo da lista de participantes |
| `/lapada-report semanal` | Gera o relatório semanal agora |
| `/lapada-report mensal` | Gera o relatório mensal agora |
| `/lapada-report agregar` | Força atualização das métricas |

---

## 📊 Como o score é calculado

O score combina três tipos de atividade no período:

```
score = (mensagens × 1.0) + (minutos em voz × 2.0) + (reações recebidas × 1.5)
```

**Bônus de streak:** membros ativos em dias consecutivos recebem um multiplicador:
```
score final = score × (1 + dias_consecutivos × 5%)
```

---

## 🔄 Quando os cargos são atribuídos e removidos

| Evento | Quando |
|---|---|
| **Relatório semanal** | Toda segunda-feira às 08:00 (Brasília) |
| **Relatório mensal** | Todo dia 1 do mês às 08:00 (Brasília) |
| **Cargo atribuído** | Top N membros com maior score recebem o cargo |
| **Cargo removido por prazo** | Após `duracao-cargo` dias desde a atribuição |
| **Cargo removido por inatividade** | Após `inatividade` dias sem nenhuma atividade |

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

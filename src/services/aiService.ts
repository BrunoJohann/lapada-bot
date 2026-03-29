import { Guild } from "discord.js";
import { getLeaderboard, getUserStats, getPeriodLabel } from "./metricsService";
import { prisma } from "../database/prisma";
import { createAiProvider } from "./ai/factory";
import { AiTool } from "./ai/types";

const SYSTEM_PROMPT = `Você é o assistente de consulta do Lapada Bot, um bot de rastreamento de atividade para servidores Discord.

Você pode APENAS consultar dados e informações. Nunca execute modificações, configurações ou atualizações.

Se o usuário pedir para modificar, configurar, criar, remover ou alterar qualquer coisa, responda EXATAMENTE com:
"⚠️ Ações de modificação não são permitidas por este comando. Utilizar o /lapada-ai para tentar executar comandos administrativos é passível de **penalidade**. Use os comandos administrativos adequados."

Comandos públicos disponíveis que você pode referenciar:
- /lapada-leaderboard — ranking de atividade (semanal ou mensal)
- /lapada-stats — estatísticas de um usuário específico
- /lapada-info — configurações atuais do bot no servidor
- /lapada-help — ajuda geral

Ao responder, seja direto e objetivo. Use as ferramentas disponíveis para buscar dados reais antes de responder.`;

const AI_TOOLS: AiTool[] = [
  {
    name: "get_leaderboard",
    description: "Busca o ranking de atividade do servidor para um período",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["weekly", "monthly"],
          description: "Período: 'weekly' para semana atual, 'monthly' para mês atual",
        },
      },
      required: ["period"],
    },
  },
  {
    name: "get_user_stats",
    description: "Busca as estatísticas de atividade de um usuário específico pelo nome ou ID",
    parameters: {
      type: "object",
      properties: {
        user_query: {
          type: "string",
          description: "Nome de usuário, apelido ou ID Discord do usuário",
        },
        period: {
          type: "string",
          enum: ["weekly", "monthly"],
          description: "Período: 'weekly' para semana atual, 'monthly' para mês atual",
        },
      },
      required: ["user_query", "period"],
    },
  },
  {
    name: "get_server_info",
    description: "Busca as configurações e informações atuais do bot no servidor",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

async function toolGetLeaderboard(guildId: string, period: "weekly" | "monthly"): Promise<string> {
  const entries = await getLeaderboard(guildId, period, 10);
  const label = getPeriodLabel(new Date(), period);

  if (entries.length === 0) return `Nenhum dado de atividade encontrado para o período ${label}.`;

  const lines = entries.map(
    (e) => `#${e.rank} ${e.displayName ?? e.username} — ${e.score.toFixed(1)} pts (${e.messageCount} msgs, ${e.voiceMinutes} min voz)`
  );

  return `Ranking ${period === "weekly" ? "semanal" : "mensal"} (${label}):\n${lines.join("\n")}`;
}

async function toolGetUserStats(guildId: string, guild: Guild, userQuery: string, period: "weekly" | "monthly"): Promise<string> {
  await guild.members.fetch().catch(() => null);

  const member =
    guild.members.cache.find(
      (m) =>
        m.user.id === userQuery ||
        m.displayName.toLowerCase() === userQuery.toLowerCase() ||
        m.user.username.toLowerCase() === userQuery.toLowerCase()
    ) ??
    guild.members.cache.find(
      (m) =>
        m.displayName.toLowerCase().includes(userQuery.toLowerCase()) ||
        m.user.username.toLowerCase().includes(userQuery.toLowerCase())
    );

  const userId = member?.user.id ?? (await prisma.user.findFirst({
    where: {
      guildId,
      OR: [
        { username: { contains: userQuery, mode: "insensitive" } },
        { displayName: { contains: userQuery, mode: "insensitive" } },
      ],
    },
  }))?.id;

  if (!userId) return `Usuário "${userQuery}" não encontrado no servidor.`;

  const stats = await getUserStats(userId, guildId, period);
  const label = getPeriodLabel(new Date(), period);

  if (!stats) return `Nenhuma atividade registrada para "${userQuery}" em ${label}.`;

  const name = member?.displayName ?? stats.displayName ?? stats.username;
  return (
    `Stats de ${name} (${label}):\n` +
    `Posição: #${stats.rank} | Score: ${stats.score.toFixed(1)} pts\n` +
    `Mensagens: ${stats.messageCount} | Voz: ${stats.voiceMinutes} min | Stream: ${stats.streamMinutes} min | Reações recebidas: ${stats.reactionsCount}`
  );
}

async function toolGetServerInfo(guildId: string, guild: Guild): Promise<string> {
  const config = await prisma.guildConfig.findUnique({ where: { guildId } });

  if (!config) return "Configuração do bot não encontrada para este servidor.";

  const participantRoles = config.participantRoleIds.length
    ? config.participantRoleIds.map((id) => guild.roles.cache.get(id)?.name ?? id).join(", ")
    : "todos os membros";

  return [
    `Configurações do Lapada Bot em ${guild.name}:`,
    `Canal de relatórios: ${config.reportChannelId ? `#${guild.channels.cache.get(config.reportChannelId)?.name ?? config.reportChannelId}` : "não configurado"}`,
    `Cargo semanal: ${config.weeklyRoleId ? (guild.roles.cache.get(config.weeklyRoleId)?.name ?? config.weeklyRoleId) : "não configurado"}`,
    `Cargo mensal: ${config.monthlyRoleId ? (guild.roles.cache.get(config.monthlyRoleId)?.name ?? config.monthlyRoleId) : "não configurado"}`,
    `Top N semanal: ${config.weeklyTopN} usuários | Top N mensal: ${config.monthlyTopN} usuários`,
    `Multiplicador de voz: ${config.voiceMultiplier}x | Stream: ${config.streamEnabled ? `${config.streamMultiplier}x` : "desabilitado"}`,
    `Participam das métricas: ${participantRoles}`,
  ].join("\n");
}

export function isAiAvailable(): boolean {
  return !!process.env.AI_PROVIDER && !!process.env.GROQ_API_KEY;
}

export async function processAiQuery(
  question: string,
  guildId: string,
  guild: Guild
): Promise<string> {
  const provider = createAiProvider();

  return provider.processQuery({
    question,
    systemPrompt: SYSTEM_PROMPT,
    tools: AI_TOOLS,
    executeTool: async (name, args) => {
      const period = (args.period as "weekly" | "monthly") ?? "weekly";

      switch (name) {
        case "get_leaderboard":
          return toolGetLeaderboard(guildId, period);
        case "get_user_stats":
          return toolGetUserStats(guildId, guild, args.user_query as string, period);
        case "get_server_info":
          return toolGetServerInfo(guildId, guild);
        default:
          return "Ferramenta desconhecida.";
      }
    },
  });
}

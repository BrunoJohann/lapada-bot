import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { COLORS } from "../utils/embeds";
import { Command } from "../client";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Como o bot funciona e como configurá-lo")
  .addStringOption((opt) =>
    opt
      .setName("topico")
      .setDescription("Tópico específico de ajuda")
      .addChoices(
        { name: "Configuração inicial", value: "setup" },
        { name: "Como são calculadas as métricas", value: "metricas" },
        { name: "Sistema de recompensas", value: "recompensas" },
        { name: "Todos os comandos", value: "comandos" }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const topico = interaction.options.getString("topico") ?? "geral";

  const embed = buildHelpEmbed(topico);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

function buildHelpEmbed(topico: string): EmbedBuilder {
  switch (topico) {
    case "setup":
      return new EmbedBuilder()
        .setTitle("⚙️ Configuração Inicial")
        .setColor(COLORS.primary)
        .setDescription("Siga os passos abaixo para configurar o bot no seu servidor.")
        .addFields(
          {
            name: "1️⃣ Defina o canal de relatórios",
            value: "`/lapada-config canal #seu-canal`\nOnde o bot vai enviar os relatórios automáticos semanais e mensais.",
          },
          {
            name: "2️⃣ Crie os cargos de recompensa",
            value: "Crie os cargos manualmente no Discord (ex: **Melhores de nós**) e certifique-se que o cargo do **bot está acima deles** na lista de cargos.",
          },
          {
            name: "3️⃣ Vincule os cargos",
            value: "`/lapada-config cargo-semanal @Cargo`\n`/lapada-config cargo-mensal @Cargo`\nDefine qual cargo será atribuído aos mais ativos de cada período.",
          },
          {
            name: "4️⃣ Ajuste o número de premiados",
            value: "`/lapada-config top-n 3`\nQuantos usuários recebem o cargo. Padrão: **5**.",
          },
          {
            name: "5️⃣ Defina a duração do cargo",
            value: "`/lapada-config duracao-cargo 30`\nPor quantos dias o cargo é mantido após ser atribuído. Padrão: **7 dias**.\nEx: `30` faz o cargo durar um mês mesmo que o usuário saia do top.",
          },
          {
            name: "6️⃣ Defina o critério de inatividade",
            value: "`/lapada-config inatividade 30`\nUsuários sem atividade por este número de dias perdem o cargo. Padrão: **14 dias**.",
          },
          {
            name: "✅ Pronto!",
            value: "O bot já está monitorando. Relatórios são enviados automaticamente toda **segunda-feira** (semanal) e todo **dia 1** do mês (mensal).\n\nPara testar agora: `/lapada-report semanal`",
          }
        )
        .setFooter({ text: "Use /help topico:Todos os comandos para ver todos os comandos" });

    case "metricas":
      return new EmbedBuilder()
        .setTitle("📊 Como as Métricas Funcionam")
        .setColor(COLORS.primary)
        .setDescription("O bot rastreia 3 tipos de atividade e combina em um **score**.")
        .addFields(
          {
            name: "💬 Mensagens",
            value: "Cada mensagem enviada em qualquer canal vale **1 ponto**.",
            inline: true,
          },
          {
            name: "🎙️ Tempo de Voz",
            value: "Cada minuto em canal de voz vale **2 pontos**.",
            inline: true,
          },
          {
            name: "⭐ Reações Recebidas",
            value: "Cada reação que você recebe nas suas mensagens vale **1.5 pontos**.",
            inline: true,
          },
          {
            name: "🔥 Bônus de Streak",
            value: "Se você tiver atividade em dias consecutivos dentro do período, seu score recebe um multiplicador:\n`score × (1 + dias_consecutivos × 5%)`",
          },
          {
            name: "📅 Períodos",
            value: "**Semanal:** segunda a domingo\n**Mensal:** do dia 1 ao último dia do mês",
          },
          {
            name: "📌 Observações",
            value: "• Mensagens de bots não são contadas\n• Auto-reações não são contadas\n• O score é recalculado diariamente à meia-noite",
          }
        );

    case "recompensas":
      return new EmbedBuilder()
        .setTitle("🏆 Sistema de Recompensas")
        .setColor(COLORS.gold)
        .setDescription("Os cargos são atribuídos e removidos automaticamente com base no ranking.")
        .addFields(
          {
            name: "✅ Quando o cargo é atribuído",
            value: "Ao final de cada período (semanal/mensal), os **top N** usuários com maior score recebem o cargo configurado.",
          },
          {
            name: "🔴 Quando o cargo é removido",
            value: "O cargo é removido em dois casos:\n• O usuário **saiu do top N** no novo período\n• O usuário ficou **inativo** por mais dias que o limite configurado",
          },
          {
            name: "⏰ Quando acontece",
            value: "**Semanal:** toda segunda-feira às 08:00\n**Mensal:** todo dia 1 do mês às 08:00\n*(horário de Brasília)*",
          },
          {
            name: "🛠️ Forçar manualmente",
            value: "Administradores podem acionar a qualquer momento:\n`/report semanal` ou `/report mensal`",
          }
        );

    case "comandos":
      return new EmbedBuilder()
        .setTitle("📋 Todos os Comandos")
        .setColor(COLORS.primary)
        .addFields(
          {
            name: "👥 Comandos para todos",
            value: [
              "`/lapada-stats` — Veja suas métricas (ou de outro usuário)",
              "`/lapada-stats usuario:@Alguém` — Stats de outro membro",
              "`/lapada-stats periodo:Mês atual` — Stats do mês",
              "`/lapada-leaderboard` — Ranking semanal do servidor",
              "`/lapada-leaderboard periodo:Mês atual` — Ranking mensal",
              "`/help` ou `/lapada-help` — Esta mensagem de ajuda",
            ].join("\n"),
          },
          {
            name: "🔧 Comandos de administrador",
            value: [
              "`/lapada-config ver` — Veja as configurações atuais",
              "`/lapada-config canal #canal` — Canal dos relatórios",
              "`/lapada-config cargo-semanal @Cargo` — Cargo do top semanal",
              "`/lapada-config cargo-mensal @Cargo` — Cargo do top mensal",
              "`/lapada-config top-n 3` — Quantos usuários são premiados",
              "`/lapada-config duracao-cargo 30` — Dias que o cargo é mantido",
              "`/lapada-config inatividade 30` — Dias para perder o cargo",
              "`/lapada-config cargo-participante-adicionar @Cargo` — Cargo que participa das métricas",
              "`/lapada-config cargo-participante-remover @Cargo` — Remove cargo da lista",
              "`/lapada-report semanal` — Gera relatório semanal agora",
              "`/lapada-report mensal` — Gera relatório mensal agora",
              "`/lapada-report agregar` — Força agregação de métricas",
            ].join("\n"),
          }
        )
        .setFooter({ text: "Comandos admin exigem permissão de Administrador" });

    default: // geral
      return new EmbedBuilder()
        .setTitle("🤖 Discord Activity Bot")
        .setColor(COLORS.primary)
        .setDescription("Monitoro a atividade dos membros e distribuo cargos de recompensa automaticamente para os mais ativos!")
        .addFields(
          {
            name: "🚀 Primeira vez aqui?",
            value: "Use `/help topico:Configuração inicial` para um passo a passo de como me configurar.",
          },
          {
            name: "📊 O que eu monitoro",
            value: "Mensagens, tempo em canais de voz e reações recebidas — tudo combinado em um **score** de atividade.",
          },
          {
            name: "🏆 Recompensas automáticas",
            value: "Os membros com maior score recebem cargos especiais toda semana e todo mês.",
          },
          {
            name: "📚 Saiba mais",
            value: [
              "`/help topico:Configuração inicial` — Como configurar",
              "`/help topico:Como são calculadas as métricas` — Entender o score",
              "`/help topico:Sistema de recompensas` — Como funcionam os cargos",
              "`/help topico:Todos os comandos` — Lista completa de comandos",
            ].join("\n"),
          }
        )
        .setFooter({ text: "Discord Activity Bot • Apenas você vê esta mensagem" });
  }
}

export default { data, execute } satisfies Command;

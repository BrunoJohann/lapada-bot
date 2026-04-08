import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../../client";
import { executeConfigCommand } from "./configHandlers";

const CURRENT_YEAR = new Date().getFullYear();

export const data = new SlashCommandBuilder()
  .setName("lapada-config")
  .setDescription("Configurações do bot de atividade")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName("cargo-semanal")
      .setDescription("Define o cargo para o top semanal")
      .addRoleOption((opt) =>
        opt.setName("cargo").setDescription("Cargo a ser atribuído").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("cargo-mensal")
      .setDescription("Define o cargo para o top mensal")
      .addRoleOption((opt) =>
        opt.setName("cargo").setDescription("Cargo a ser atribuído").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("canal")
      .setDescription("Define o canal para envio dos relatórios automáticos")
      .addChannelOption((opt) =>
        opt.setName("canal").setDescription("Canal de texto para relatórios").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("top-n-semanal")
      .setDescription("Define quantos usuários recebem o cargo semanal")
      .addIntegerOption((opt) =>
        opt
          .setName("quantidade")
          .setDescription("Número de usuários (1–20)")
          .setMinValue(1)
          .setMaxValue(20)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("top-n-mensal")
      .setDescription("Define quantos usuários recebem o cargo mensal")
      .addIntegerOption((opt) =>
        opt
          .setName("quantidade")
          .setDescription("Número de usuários (1–20)")
          .setMinValue(1)
          .setMaxValue(20)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("inatividade")
      .setDescription("Define dias sem atividade para remover o cargo")
      .addIntegerOption((opt) =>
        opt
          .setName("dias")
          .setDescription("Dias sem atividade (1–90)")
          .setMinValue(1)
          .setMaxValue(90)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("cargo-participante-adicionar")
      .setDescription("Adiciona um cargo à lista de participantes das métricas")
      .addRoleOption((opt) =>
        opt.setName("cargo").setDescription("Cargo que vai participar das métricas").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("cargo-participante-remover")
      .setDescription("Remove um cargo da lista de participantes das métricas")
      .addRoleOption((opt) =>
        opt.setName("cargo").setDescription("Cargo a remover da lista").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("duracao-cargo-semanal")
      .setDescription("Define por quantos dias o cargo semanal é mantido após ser atribuído")
      .addIntegerOption((opt) =>
        opt
          .setName("dias")
          .setDescription("Dias que o cargo fica (1–90). Padrão: 7")
          .setMinValue(1)
          .setMaxValue(90)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("duracao-cargo-mensal")
      .setDescription("Define por quantos dias o cargo mensal é mantido após ser atribuído")
      .addIntegerOption((opt) =>
        opt
          .setName("dias")
          .setDescription("Dias que o cargo fica (1–90). Padrão: 30")
          .setMinValue(1)
          .setMaxValue(90)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("horario-report")
      .setDescription("Define os horários do ranking diário (suporta múltiplos)")
      .addStringOption((opt) =>
        opt
          .setName("horas")
          .setDescription("Hora(s) de 0–23 separadas por vírgula. Ex: 9 ou 9,21")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("horario-semanal")
      .setDescription("Define o dia e hora do relatório semanal automático")
      .addIntegerOption((opt) =>
        opt
          .setName("dia")
          .setDescription("Dia da semana")
          .setRequired(true)
          .addChoices(
            { name: "Domingo",       value: 0 },
            { name: "Segunda-feira", value: 1 },
            { name: "Terça-feira",   value: 2 },
            { name: "Quarta-feira",  value: 3 },
            { name: "Quinta-feira",  value: 4 },
            { name: "Sexta-feira",   value: 5 },
            { name: "Sábado",        value: 6 },
          )
      )
      .addIntegerOption((opt) =>
        opt
          .setName("hora")
          .setDescription("Hora do dia (0–23)")
          .setMinValue(0)
          .setMaxValue(23)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("horario-mensal")
      .setDescription("Define o dia e hora do relatório mensal automático")
      .addIntegerOption((opt) =>
        opt
          .setName("dia")
          .setDescription("Dia do mês (1–28)")
          .setMinValue(1)
          .setMaxValue(28)
          .setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt
          .setName("hora")
          .setDescription("Hora do dia (0–23)")
          .setMinValue(0)
          .setMaxValue(23)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("voz")
      .setDescription("Define o multiplicador de pontos por minuto em canal de voz")
      .addNumberOption((opt) =>
        opt
          .setName("multiplicador")
          .setDescription("Pontos por minuto de voz (padrão: 2.0)")
          .setMinValue(0.1)
          .setMaxValue(10.0)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("streamer")
      .setDescription("Configura o rastreamento de streams (tela compartilhada)")
      .addBooleanOption((opt) =>
        opt
          .setName("habilitado")
          .setDescription("Habilitar ou desabilitar rastreamento de streams")
          .setRequired(true)
      )
      .addNumberOption((opt) =>
        opt
          .setName("multiplicador")
          .setDescription("Pontos por minuto de stream (padrão: 1.5). Deve ser menor que voz (2.0)")
          .setMinValue(0.1)
          .setMaxValue(5.0)
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("mensagem")
      .setDescription("Envia uma mensagem pública no canal como se fosse uma confirmação do bot")
      .addStringOption((opt) =>
        opt
          .setName("texto")
          .setDescription("Texto da mensagem")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("atribuir-cargos")
      .setDescription("Força a atribuição de cargos de recompensa, com opção de período histórico")
      .addStringOption((opt) =>
        opt
          .setName("periodo")
          .setDescription("Qual período processar")
          .setRequired(true)
          .addChoices(
            { name: "Semanal",            value: "weekly" },
            { name: "Mensal",             value: "monthly" },
            { name: "Desafio",            value: "challenge" },
            { name: "Semanal + Mensal",   value: "both" },
            { name: "Todos",              value: "all" },
          )
      )
      .addIntegerOption((opt) =>
        opt.setName("mes").setDescription("Mês histórico (1–12)").setMinValue(1).setMaxValue(12)
      )
      .addIntegerOption((opt) =>
        opt.setName("ano").setDescription(`Ano histórico (padrão: ${CURRENT_YEAR})`).setMinValue(2024).setMaxValue(2030)
      )
      .addIntegerOption((opt) =>
        opt.setName("semana").setDescription("Semana do mês (1–5) — requer 'mes'").setMinValue(1).setMaxValue(5)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("adicionar-pontos")
      .setDescription("Adiciona pontos manualmente a um usuário (em um período específico ou hoje)")
      .addUserOption((opt) =>
        opt.setName("usuario").setDescription("Usuário que receberá os pontos").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("pontos").setDescription("Pontos a adicionar — use ponto ou vírgula (ex: 50, 509.5, 12,5)").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("motivo").setDescription("Motivo do ajuste (opcional)").setRequired(false)
      )
      .addIntegerOption((opt) =>
        opt.setName("mes").setDescription("Mês do ajuste (1–12, padrão: mês atual)").setMinValue(1).setMaxValue(12)
      )
      .addIntegerOption((opt) =>
        opt.setName("ano").setDescription(`Ano do ajuste (padrão: ${CURRENT_YEAR})`).setMinValue(2024).setMaxValue(2030)
      )
      .addIntegerOption((opt) =>
        opt.setName("semana").setDescription("Semana do mês (1–5) — aplica no 1º dia da semana").setMinValue(1).setMaxValue(5)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("cargo-desafio")
      .setDescription("Define o cargo atribuído a qualquer usuário que bata o mínimo de pontos semanal")
      .addRoleOption((opt) =>
        opt.setName("cargo").setDescription("Cargo a ser atribuído ao vencedor do desafio").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("pontos-minimos")
      .setDescription("Define o mínimo de pontos semanais para ganhar o cargo de desafio")
      .addNumberOption((opt) =>
        opt
          .setName("pontos")
          .setDescription("Mínimo de pontos na semana (ex: 500). Use 0 para desabilitar.")
          .setMinValue(0)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("duracao-cargo-desafio")
      .setDescription("Define por quantos dias o cargo de desafio é mantido após ser atribuído")
      .addIntegerOption((opt) =>
        opt
          .setName("dias")
          .setDescription("Dias que o cargo fica (1–90). Padrão: 7")
          .setMinValue(1)
          .setMaxValue(90)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("remover-pontos")
      .setDescription("Remove pontos manualmente de um usuário (em um período específico ou hoje)")
      .addUserOption((opt) =>
        opt.setName("usuario").setDescription("Usuário que perderá os pontos").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("pontos").setDescription("Pontos a remover — use ponto ou vírgula (ex: 50, 509.5, 12,5)").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("motivo").setDescription("Motivo do ajuste (opcional)").setRequired(false)
      )
      .addIntegerOption((opt) =>
        opt.setName("mes").setDescription("Mês do ajuste (1–12, padrão: mês atual)").setMinValue(1).setMaxValue(12)
      )
      .addIntegerOption((opt) =>
        opt.setName("ano").setDescription(`Ano do ajuste (padrão: ${CURRENT_YEAR})`).setMinValue(2024).setMaxValue(2030)
      )
      .addIntegerOption((opt) =>
        opt.setName("semana").setDescription("Semana do mês (1–5) — aplica no 1º dia da semana").setMinValue(1).setMaxValue(5)
      )
  )
;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  return executeConfigCommand(interaction);
}

export default { data, execute } satisfies Command;

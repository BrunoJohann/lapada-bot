import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { execute as helpExecute } from "./help";
import { Command } from "../client";

export const data = new SlashCommandBuilder()
  .setName("lapada-help")
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
  return helpExecute(interaction);
}

export default { data, execute } satisfies Command;

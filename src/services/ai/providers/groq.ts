import Groq from "groq-sdk";
import { IAiProvider, AiQueryContext } from "../types";
import { logger } from "../../../utils/logger";

export class GroqProvider implements IAiProvider {
  private readonly client: Groq;

  constructor(apiKey: string) {
    this.client = new Groq({ apiKey });
  }

  async processQuery(context: AiQueryContext): Promise<string> {
    const { question, systemPrompt, tools, executeTool } = context;

    const groqTools: Groq.Chat.Completions.ChatCompletionTool[] = tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
    ];

    for (let i = 0; i < 3; i++) {
      const response = await this.client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        tools: groqTools,
        tool_choice: "auto",
        max_tokens: 1024,
      });

      const message = response.choices[0].message;
      messages.push(message);

      if (!message.tool_calls || message.tool_calls.length === 0) {
        return message.content ?? "Não foi possível gerar uma resposta.";
      }

      for (const toolCall of message.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        let result: string;

        try {
          result = await executeTool(toolCall.function.name, args);
        } catch (error) {
          logger.error(`[AI:Groq] Erro ao executar tool "${toolCall.function.name}":`, error);
          result = "Erro ao buscar dados.";
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }
    }

    return "Não foi possível processar sua solicitação no momento.";
  }
}

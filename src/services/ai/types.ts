export interface AiTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface AiQueryContext {
  question: string;
  systemPrompt: string;
  tools: AiTool[];
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>;
}

export interface IAiProvider {
  processQuery(context: AiQueryContext): Promise<string>;
}

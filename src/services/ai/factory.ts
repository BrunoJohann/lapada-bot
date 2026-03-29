import { IAiProvider } from "./types";
import { GroqProvider } from "./providers/groq";

const SUPPORTED_PROVIDERS = ["groq"] as const;
type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

function isSupportedProvider(value: string): value is SupportedProvider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
}

export function createAiProvider(): IAiProvider {
  const providerName = process.env.AI_PROVIDER ?? "groq";

  if (!isSupportedProvider(providerName)) {
    throw new Error(
      `AI provider "${providerName}" não suportado. Opções: ${SUPPORTED_PROVIDERS.join(", ")}`
    );
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(`Variável de ambiente GROQ_API_KEY não configurada para o provider "${providerName}"`);
  }

  switch (providerName) {
    case "groq":
      return new GroqProvider(apiKey);
  }
}

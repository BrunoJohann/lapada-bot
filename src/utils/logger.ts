type LogLevel = "info" | "warn" | "error" | "debug";

function formatMessage(level: LogLevel, message: string): string {
  const timestamp = new Date().toISOString();
  const levelTag = level.toUpperCase().padEnd(5);
  return `[${timestamp}] ${levelTag} ${message}`;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    const e = error as unknown as Record<string, unknown>;
    if (e["code"] && e["clientVersion"]) {
      // PrismaClientKnownRequestError
      const target = (e["meta"] as Record<string, unknown> | undefined)?.["target"];
      return `PrismaError ${e["code"]}${target ? ` (target: ${target})` : ""}: ${error.message}`;
    }
    if (e["errorCode"] === "P1000" || error.constructor?.name === "PrismaClientInitializationError") {
      return `PrismaConnectionError: ${error.message}`;
    }
    if (e["status"] && e["requestBody"] !== undefined) {
      // DiscordAPIError
      return `DiscordAPIError ${e["status"]} — ${error.message}`;
    }
    return error.message;
  }
  return String(error);
}

export const logger = {
  info: (message: string) => console.log(formatMessage("info", message)),
  warn: (message: string) => console.warn(formatMessage("warn", message)),
  error: (message: string, error?: unknown) => {
    const formatted = error !== undefined ? ` | ${formatError(error)}` : "";
    console.error(formatMessage("error", `${message}${formatted}`));
    if (error instanceof Error && error.stack && process.env.NODE_ENV === "development") {
      console.error(error.stack);
    }
  },
  debug: (message: string) => {
    if (process.env.NODE_ENV === "development") {
      console.log(formatMessage("debug", message));
    }
  },
};

export function registerProcessHandlers(): void {
  process.on("uncaughtException", (error) => {
    logger.error("[Process] Exceção não tratada — bot pode estar instável", error);
  });
  process.on("unhandledRejection", (reason) => {
    logger.error("[Process] Promise rejeitada sem handler", reason);
  });
  process.on("SIGTERM", () => {
    logger.warn("[Process] SIGTERM recebido — container encerrando");
    process.exit(0);
  });
  process.on("SIGINT", () => {
    logger.warn("[Process] SIGINT recebido — encerrando");
    process.exit(0);
  });
}

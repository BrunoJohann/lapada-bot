type LogLevel = "info" | "warn" | "error" | "debug";

function formatMessage(level: LogLevel, message: string): string {
  const timestamp = new Date().toISOString();
  const levelTag = level.toUpperCase().padEnd(5);
  return `[${timestamp}] ${levelTag} ${message}`;
}

export const logger = {
  info: (message: string) => console.log(formatMessage("info", message)),
  warn: (message: string) => console.warn(formatMessage("warn", message)),
  error: (message: string, error?: unknown) => {
    console.error(formatMessage("error", message));
    if (error) console.error(error);
  },
  debug: (message: string) => {
    if (process.env.NODE_ENV === "development") {
      console.log(formatMessage("debug", message));
    }
  },
};

import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const logLevels = process.env.NODE_ENV === "development"
  ? [
      { emit: "event" as const, level: "query" as const },
      { emit: "event" as const, level: "error" as const },
      { emit: "event" as const, level: "warn" as const },
    ]
  : [
      { emit: "event" as const, level: "error" as const },
      { emit: "event" as const, level: "warn" as const },
    ];

const client = new PrismaClient({ log: logLevels });

client.$on("error", (e) => logger.error(`[Prisma] ${e.message}`));
client.$on("warn",  (e) => logger.warn(`[Prisma] ${e.message}`));
if (process.env.NODE_ENV === "development") {
  client.$on("query", (e) => logger.debug(`[Prisma] ${e.query} (${e.duration}ms)`));
}

export const prisma = globalForPrisma.prisma ?? client;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function checkDbConnection(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info("[DB] Conexão com PostgreSQL OK");
  } catch (error) {
    logger.error("[DB] Falha ao conectar com PostgreSQL", error);
    throw error;
  }
}

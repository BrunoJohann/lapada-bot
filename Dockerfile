# ── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Install fonts (required for canvas)
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-liberation \
    fontconfig \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files and prisma schema
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies)
RUN pnpm install --frozen-lockfile

# Ensure canvas native binary is built/downloaded
RUN pnpm rebuild canvas

# Generate Prisma client
RUN pnpm prisma generate

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src ./src/
RUN pnpm build

# ── Stage 2: production ───────────────────────────────────────────────────────
FROM node:22-slim AS production

WORKDIR /app

# Install fonts (required for canvas text rendering at runtime)
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-liberation \
    fontconfig \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files and prisma schema
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Ensure canvas native binary is built/downloaded
RUN pnpm rebuild canvas

# Copy generated Prisma client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy compiled output and entrypoint from builder
COPY --from=builder /app/dist ./dist

COPY start.sh ./
RUN chmod +x start.sh

CMD ["sh", "start.sh"]

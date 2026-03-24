FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Install all deps (including dev) for build
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm prisma generate

# Copy source and build
COPY tsconfig.json ./
COPY src ./src/
RUN pnpm build

# ---- Production image ----
FROM node:22-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Install production deps only
RUN pnpm install --frozen-lockfile --prod

# Copy generated Prisma client from builder (prisma CLI not available in prod)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy compiled output
COPY --from=builder /app/dist ./dist

CMD ["node", "dist/bot.js"]

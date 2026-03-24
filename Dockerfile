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

# Copy node_modules from builder (includes Prisma client already generated)
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled output and required files
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma/
COPY package.json ./

CMD ["node", "dist/bot.js"]

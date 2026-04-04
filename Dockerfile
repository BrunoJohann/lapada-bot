FROM node:22-slim

WORKDIR /app

# Install fonts (required for canvas text rendering)
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-liberation \
    fontconfig \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Ensure canvas native binary is built/downloaded
RUN pnpm rebuild canvas

# Generate Prisma client
RUN pnpm prisma generate

# Copy source and build
COPY tsconfig.json ./
COPY src ./src/
RUN pnpm build

COPY start.sh ./
RUN chmod +x start.sh

CMD ["sh", "start.sh"]

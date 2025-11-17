# Build stage
FROM node:24-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm --activate

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy Prisma schema first for generation
COPY prisma ./prisma/

# Generate Prisma client
RUN pnpm exec prisma generate

# Copy TypeScript config and source code
COPY tsconfig.json ./
COPY src ./src/
COPY lib ./lib/

# Build TypeScript
RUN pnpm build

# Production stage
FROM node:24-alpine AS production

# Install OpenSSL for Prisma runtime
RUN apk add --no-cache openssl

# Install pnpm
RUN corepack enable && corepack prepare pnpm --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Copy Prisma schema first (needed for generate)
COPY prisma ./prisma/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy generated Prisma client from builder stage
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma/
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma/

# Copy lib directory
COPY --from=builder /app/lib ./lib/

# Copy built application
COPY --from=builder /app/dist ./dist/

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start command - run migrations then start server
CMD ["sh", "-c", "pnpm prisma:migrate && pnpm start"]

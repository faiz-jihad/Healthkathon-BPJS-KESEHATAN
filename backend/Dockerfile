# Production Dockerfile for AURA-JKN Next.js Backend
FROM node:20-alpine AS builder

WORKDIR /app

# Install openssl for Prisma schema engine on Alpine
RUN apk add --no-cache openssl libc6-compat

# Install build dependencies
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Copy schema and generate Prisma client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code and build
COPY . .
RUN mkdir -p /app/public
RUN npm run build

# Production runtime stage
FROM node:20-alpine AS runner
WORKDIR /app

# Install openssl for Prisma runtime on Alpine
RUN apk add --no-cache openssl libc6-compat

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_URL="postgresql://aura_user:aura_password@postgres:5432/aura_jkn_db?schema=public"
ENV AI_SERVICE_URL="http://ai-service:8000"
ENV AUTH_SECRET="aura-jkn-secure-hmac-secret-healthkathon-2026-bpjs"

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.env.example ./.env
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/public ./public

EXPOSE 3001

CMD ["npm", "start"]

# Production Dockerfile for AURA-JKN Next.js Backend
FROM node:20-alpine AS builder

WORKDIR /app

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

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public

EXPOSE 3001

CMD ["npm", "start"]

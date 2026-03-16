# 1. BUILD STAGE: compile TS
FROM node:23-slim AS builder
WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci             # installs dev + prod deps

COPY . .
RUN npm run dist      # outputs to dist/

# 2. DEPENDENCIES STAGE: install prod modules
FROM node:22-slim AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev # only prod

# 3. RUNTIME STAGE: copy compiled code + prod-deps
FROM node:22-slim
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./
COPY package.json ./


ENV NODE_ENV=production
EXPOSE 3001

# Note: fastify-cli isn't needed at runtime if not explicitly used
CMD ["node", "index.js"]

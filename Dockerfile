# ==========================================
# STAGE 1: COMPILATION BUILD LAYER
# ==========================================
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx tsc

# ==========================================
# STAGE 2: LEAN PRODUCTION RUNTIME ENVIRONMENT
# ==========================================
FROM node:18-alpine AS runtime
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY --from=builder /app/dist ./dist

# Target A: The HTTP API Gateway Service
FROM runtime AS api_service
EXPOSE 3000
CMD ["node", "dist/entrypoints/api.js"]

# Target B: The Transactional Outbox Relay
FROM runtime AS outbox_service
CMD ["node", "dist/entrypoints/outbox.js"]

# Target C: The Event Consumers / Saga Workers
FROM runtime AS worker_service
CMD ["node", "dist/entrypoints/workers.js"]
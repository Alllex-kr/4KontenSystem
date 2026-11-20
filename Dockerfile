# FinanzKlee als Docker-Image
# Bauen:  docker build -t finanzklee .
# Auf dem Server startet compose.yml das Image zusammen mit PostgreSQL und Caddy.

ARG NODE_VERSION=24
ARG PRISMA_VERSION=6.16.2

# --- 1. Abhängigkeiten installieren ---------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# --- 2. App bauen ----------------------------------------------------------
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# --- 3. Schlankes Laufzeit-Image -------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runner
# Verknüpft das Image in der GitHub Container Registry mit dem Repository
LABEL org.opencontainers.image.source="https://github.com/Alllex-kr/4KontenSystem"
ARG PRISMA_VERSION
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
  # Prisma-CLI nur für "migrate deploy" beim Start
  && npm install -g prisma@${PRISMA_VERSION} && npm cache clean --force

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Der Standalone-Build enthält server.js und nur die Pakete, die die App wirklich braucht
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node docker-entrypoint.sh ./

# Nicht als root laufen
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["sh", "./docker-entrypoint.sh"]

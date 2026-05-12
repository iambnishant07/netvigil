FROM node:20-slim AS builder
WORKDIR /app

RUN corepack enable

# Copy workspace manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/web/package.json packages/web/
COPY packages/mock-api/package.json packages/mock-api/

RUN pnpm install --frozen-lockfile

COPY packages/shared-types packages/shared-types
COPY packages/mock-api packages/mock-api
COPY packages/web packages/web

# Railway passes service env vars as build args; default to same-origin proxy path
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}

RUN pnpm --filter @aankhanet/web build:prod

FROM caddy:2-alpine
EXPOSE 80
COPY --from=builder /app/packages/web/dist /app/packages/web/dist
COPY Caddyfile /etc/caddy/Caddyfile

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

RUN pnpm --filter @netvigil/web build:prod

FROM caddy:2-alpine
COPY --from=builder /app/packages/web/dist /app/packages/web/dist
COPY Caddyfile /etc/caddy/Caddyfile

# Shell wrapper sets a safe default for API_PRIVATE_HOST so Caddy always starts.
# Railway will override this with the real value via the API_PRIVATE_HOST env var.
CMD ["sh", "-c", "export API_PRIVATE_HOST=${API_PRIVATE_HOST:-localhost:8000} && caddy run --config /etc/caddy/Caddyfile --adapter caddyfile"]

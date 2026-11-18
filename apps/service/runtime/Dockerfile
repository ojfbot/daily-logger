FROM node:24.22.3-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0 AS base
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/frontend/package.json ./packages/frontend/package.json
COPY apps/service/package.json ./apps/service/package.json
RUN pnpm --filter @ojfbot/daily-logger-service... install --frozen-lockfile
COPY apps/service/src ./apps/service/src
COPY apps/service/migrations ./apps/service/migrations
RUN pnpm --filter @ojfbot/daily-logger-service deploy --prod /production/service

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/service
COPY --from=build --chown=1000:1000 /production/service ./
COPY --chown=1000:1000 docs/agent-service/editorial-api-responses.schema.json /app/docs/agent-service/editorial-api-responses.schema.json
COPY --chown=1000:1000 fixture-git /app/.git
COPY --chown=1000:1000 runtime-context.json /app/runtime-context.json
RUN ln -s apps/service/node_modules /app/node_modules \
    && chown -R 1000:1000 /app \
    && chmod -R a-w /app \
    && mkdir -p /var/lib/dailylogger/fixtures \
    && chown 1000:1000 /var/lib/dailylogger/fixtures \
    && chmod 700 /var/lib/dailylogger/fixtures
USER 1000:1000
ENTRYPOINT ["node", "--import", "tsx"]
CMD ["src/http-cli.ts", "serve"]

FROM oven/bun:1.3.14-alpine AS checks

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json version.json ./
COPY src ./src
COPY evals ./evals
RUN bun run typecheck && bun test

FROM oven/bun:1.3.14-alpine AS runtime

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=checks /app/tsconfig.json /app/version.json ./
COPY --from=checks /app/src ./src

USER bun
EXPOSE 8080
CMD ["bun", "run", "src/index.ts"]

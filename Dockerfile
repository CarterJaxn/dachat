FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

###############################################################################
# Stage 1: install all deps and build
###############################################################################
FROM base AS builder
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
COPY packages/api/ ./packages/api/
RUN pnpm --filter @dachat/shared build
RUN pnpm --filter @dachat/api build

###############################################################################
# Stage 2: production image (no dev deps, no TypeScript source)
###############################################################################
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist/
COPY --from=builder /app/packages/api/dist ./packages/api/dist/

EXPOSE 3000
CMD ["node", "packages/api/dist/index.js"]

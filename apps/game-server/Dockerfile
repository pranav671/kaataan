FROM node:24-alpine

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/game-engine/package.json packages/game-engine/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY apps/game-server/package.json apps/game-server/package.json
RUN pnpm install --frozen-lockfile --prod

COPY packages/game-engine packages/game-engine
COPY packages/protocol packages/protocol
COPY apps/game-server apps/game-server

ENV NODE_ENV=production \
    KAATAAN_SERVER_HOST=0.0.0.0 \
    KAATAAN_SERVER_PORT=4180 \
    KAATAAN_DATA_FILE=/data/rooms.json

VOLUME ["/data"]
EXPOSE 4180
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=4 CMD wget -q -O - http://127.0.0.1:4180/health || exit 1

CMD ["node", "--experimental-strip-types", "apps/game-server/src/index.ts"]

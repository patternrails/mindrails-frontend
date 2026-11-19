FROM node:24.18.1-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@11.23.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN npm run build

FROM node:24.18.1-bookworm-slim
LABEL org.opencontainers.image.title="MindRails Frontend" \
      org.opencontainers.image.source="https://github.com/patternrails/mindrails-frontend"
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/config/backend.json ./config/backend.json
USER node
EXPOSE 3000
CMD ["node", "server.js"]

FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm_config_build_from_source=true npm ci --omit=dev

FROM node:22-bookworm-slim

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./

COPY app.js database.js ./
COPY views ./views
RUN mkdir -p /app/data /app/uploads
RUN chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/app/data

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3001/health', response => process.exit(response.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

USER node
CMD ["npm", "start"]

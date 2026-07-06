# syntax=docker/dockerfile:1

# Build context is the backend/ directory (see docker-compose.yml and, on
# Railway, the service Root Directory set to "backend").

# ---- builder: install production deps (incl. native sqlite3 addon) ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# sqlite3 is a native module; give it a toolchain in case no prebuilt binary
# matches this platform. These build tools stay out of the runtime image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime ----
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000
WORKDIR /app

# Run as the non-root "node" user that ships with the base image.
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

USER node
EXPOSE 4000
CMD ["node", "src/server.js"]

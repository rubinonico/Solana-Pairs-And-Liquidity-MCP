# ---- Base ----
FROM node:18-slim AS base
WORKDIR /app

# ---- Dependencies ----
FROM base AS dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# ---- Build ----
FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Release ----
FROM base AS release
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json .

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

CMD [ "npm", "start" ]

dockerfile




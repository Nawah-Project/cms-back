FROM node:24-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
RUN npm run prisma:generate
COPY . .
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

FROM base AS production-dependencies
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN npm run prisma:generate

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 CV_STORAGE_DIR=/app/private-storage/cvs
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /app/package.json ./package.json
COPY --from=production-dependencies --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/dist ./dist
RUN mkdir -p /app/private-storage/cvs && chown -R node:node /app/private-storage
USER node
EXPOSE 3000
CMD ["sh", "-c", "npm run prisma:migrate:deploy && exec node dist/main.js"]

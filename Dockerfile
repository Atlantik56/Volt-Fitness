FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci
FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/app/data PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S volt && adduser -S volt -G volt && mkdir -p /app/data && chown volt:volt /app/data
COPY --from=build --chown=volt:volt /app/.next/standalone ./
COPY --from=build --chown=volt:volt /app/.next/static ./.next/static
COPY --from=build --chown=volt:volt /app/public ./public
USER volt
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node","server.js"]

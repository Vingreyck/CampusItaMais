# ---------- build ----------
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --include=optional

COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- runtime ----------
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/drizzle ./server/drizzle
COPY --from=build /app/web/dist ./web/dist

EXPOSE 3000
CMD ["node", "--enable-source-maps", "server/dist/index.js"]

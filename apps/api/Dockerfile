FROM node:22-alpine AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json

RUN npm ci

FROM dependencies AS builder

COPY apps/api apps/api
RUN npm run build -w apps/api

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV API_PORT=4000

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json

RUN npm ci --omit=dev

COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/apps/api/database/seed apps/api/database/seed

EXPOSE 4000

CMD ["npm", "run", "start", "-w", "apps/api"]
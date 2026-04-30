FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN if [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile; \
    elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci --legacy-peer-deps; \
    else npm install; fi

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:8000/api
ARG NEXT_PUBLIC_USE_MOCK=false
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_USE_MOCK=$NEXT_PUBLIC_USE_MOCK
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:8000/api
ARG NEXT_PUBLIC_USE_MOCK=false
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_USE_MOCK=$NEXT_PUBLIC_USE_MOCK
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]

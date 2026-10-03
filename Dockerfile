# Campus OS API.
#
# One image for any institute. On start it applies pending migrations,
# prepares an empty database (scripts/seed-if-empty.mjs) and serves on :4000.
# Configuration is environment only — see backend/.env.example.
FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production

# openssl for Prisma; ca-certificates for outbound HTTPS (mail, Razorpay, Claude).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Dev dependencies stay: start-up runs `prisma migrate deploy` and the seeder via tsx.
RUN npm ci --include=dev --ignore-scripts && npm cache clean --force

COPY . .
RUN npx prisma generate && npx tsc -p tsconfig.json

USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start.mjs"]

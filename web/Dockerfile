# Campus OS web app, built once and served by nginx.
#
# nginx also proxies /api to the backend, so the browser talks to one origin:
# the session cookie stays first-party and no CORS setup is needed. To call a
# separately hosted API instead, build with --build-arg VITE_API_URL=https://api.example.edu
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Empty means "same origin" (see src/lib/api.ts).
ARG VITE_API_URL=""
ARG VITE_TURNSTILE_SITE_KEY=""
ENV VITE_API_URL=$VITE_API_URL VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
RUN npx vite build

FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

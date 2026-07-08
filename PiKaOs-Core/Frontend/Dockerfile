# PiKaOs frontend — multi-stage, one source, two targets:
#   target: dev   → Vite dev server (hot reload; docker-compose uses this for local dev)
#   target: prod  → static bundle served by nginx (deploy; tiny, separable to its own server/CDN)

# --- shared deps layer ---
FROM node:26-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Fix-DEP-01: reproducible install straight from the committed lockfile (was `npm install`, which can
# drift the lock). `npm ci` requires package-lock.json to be present and in sync.
RUN npm ci

# --- dev: Vite dev server. Source + node_modules arrive as volumes at runtime (deploy/docker-compose.frontend.dev.yml):
#     the bind mount gives hot reload; a named volume keeps node_modules off the Windows host. ---
FROM deps AS dev
EXPOSE 5173
CMD ["npm", "run", "dev"]

# --- build: compile the static bundle (node_modules come from the deps layer; .dockerignore keeps
#     the COPY from clobbering them) ---
FROM deps AS build
COPY . .
RUN npm run build          # → /app/dist

# --- prod: serve the static bundle via nginx; proxy /api + /ws to ${BACKEND_URL} (same-origin, so
#     no CORS). BACKEND_URL is substituted at container start (nginx:alpine runs envsubst on the
#     template); only that var is filtered so nginx's own $host/$uri survive. ---
FROM nginx:1.27-alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV BACKEND_URL=http://backend:8000
ENV RESOLVER=127.0.0.11
ENV NGINX_ENVSUBST_FILTER=BACKEND_URL|RESOLVER
EXPOSE 80

# Liveness probe (release-and-rollback.md §2): nginx is healthy once it serves the SPA entrypoint.
# wget ships in nginx:alpine (busybox) — no extra package. Local-only, so the upstream API being
# down doesn't fail the frontend's own health. Probe 127.0.0.1, NOT localhost: /etc/hosts maps
# localhost to ::1 first and busybox wget tries IPv6, but nginx binds IPv4-only (`listen 80;`) —
# a localhost probe is connection-refused forever and marks a perfectly healthy container unhealthy.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO /dev/null http://127.0.0.1:80/ || exit 1

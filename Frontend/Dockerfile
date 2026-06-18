# PiKaOs frontend — multi-stage, one source, two targets:
#   target: dev   → Vite dev server (hot reload; docker-compose uses this for local dev)
#   target: prod  → static bundle served by nginx (deploy; tiny, separable to its own server/CDN)

# --- shared deps layer ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

# --- dev: Vite dev server. Source + node_modules arrive as volumes at runtime (docker-compose.yml):
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

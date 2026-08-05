# ============================================================
#  Cómo se arma la miniplataforma de video para publicarla.
#  Dokploy lee este archivo, construye todo en el servidor y lo
#  deja andando. Vos no tenés que correr nada de esto en tu compu.
# ============================================================

# ---------- Etapa 1: construir ----------
FROM node:24-alpine AS build
WORKDIR /app

# Primero SOLO los manifiestos. Si no cambiaron, Docker reusa la capa de
# dependencias ya instaladas y el deploy tarda segundos en vez de minutos.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- Etapa 2: servir ----------
FROM node:24-alpine AS runtime

# ffmpeg es lo que convierte los videos. Sin esto la subida funciona pero la
# conversión falla con "no se encontró ffmpeg". Viene en los repositorios de
# Alpine, así que es una línea y no hay que compilar nada.
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

# HOST=0.0.0.0 es OBLIGATORIO. Por defecto el servidor escucharía solo en
# 127.0.0.1, que adentro de un contenedor significa "solo yo mismo": el
# contenedor arrancaría perfecto y Traefik daría 502 sin explicar por qué.
ENV HOST=0.0.0.0
ENV PORT=4321
ENV NODE_ENV=production

# La carpeta donde van los videos y la base. En Dokploy se monta acá el volumen
# persistente. Si el volumen NO está montado, la plataforma funciona igual pero
# guarda adentro del contenedor y se pierde todo en el próximo redeploy: por eso
# el panel muestra abajo la fecha de primer uso, para poder darse cuenta.
ENV CARPETA_DATOS=/datos
RUN mkdir -p /datos

EXPOSE 4321

# Sin HEALTHCHECK a propósito, por la misma razón que en la web principal: el
# chequeo de BusyBox se queda en "unhealthy" para siempre, Docker Swarm nunca
# mete el contenedor en el ruteo y Traefik devuelve 502. Dokploy vigila la
# salud por su cuenta.
CMD ["node", "./dist/server/entry.mjs"]

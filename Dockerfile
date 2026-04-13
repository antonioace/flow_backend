# 1. USAMOS LA IMAGEN QUE SÍ TIENE COMPILADORES (No uses Alpine)
FROM node:20-bookworm AS build

WORKDIR /usr/src/app

# 2. Copiamos los archivos
COPY package.json package-lock.json ./

# 3. Instalamos y OBLIGAMOS a que nos muestre el error si falla
RUN npm install > install_log.txt 2>&1 || (cat install_log.txt && exit 1)

# 4. Copiamos el resto
COPY . .
RUN npm run build

# --- ETAPA DE PRODUCCIÓN ---
FROM node:20-bookworm-slim

WORKDIR /usr/src/app

COPY --from=build /usr/src/app/package*.json ./
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/node_modules ./node_modules

EXPOSE 3001

CMD ["npm", "run", "start:prod"]
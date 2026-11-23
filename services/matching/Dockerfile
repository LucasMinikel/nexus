# Build a partir da raiz do repositório: docker build -f services/matching/Dockerfile .
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src/lib src/lib
COPY services/matching services/matching
RUN npx esbuild services/matching/server.ts --bundle --platform=node --format=esm --target=node24 --outfile=dist/server.mjs

FROM gcr.io/distroless/nodejs24-debian12
WORKDIR /app
COPY --from=build /app/dist/server.mjs .
COPY public/maps maps
ENV NODE_ENV=production MAPS_DIR=maps
USER nonroot
CMD ["server.mjs"]

# The desk in a container, for the machine in the shop that nobody wants to
# install node on. Records live on a mounted volume, never in the image.
FROM node:22.13.1-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22.13.1-bookworm-slim

LABEL org.opencontainers.image.title="broodhaul"
LABEL org.opencontainers.image.description="pollination desk for a migratory beekeeping operation"
LABEL org.opencontainers.image.licenses="UNLICENSED"

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY bin ./bin
COPY src ./src

# The records are the operator's, not the image's. Mount a host directory here
# and every command writes into it.
VOLUME /records
ENV BROODHAUL_ROOT=/records

RUN useradd --create-home --shell /usr/sbin/nologin desk \
  && mkdir -p /records \
  && chown -R desk:desk /records /app
USER desk

ENTRYPOINT ["node", "/app/bin/broodhaul.js"]
CMD ["--help"]

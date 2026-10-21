FROM rust:1-slim-bookworm AS cli

WORKDIR /build
COPY cert ./cert
COPY cli ./cli
RUN cargo build --release --manifest-path cli/Cargo.toml

FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PROVENANCE_BIN=/usr/local/bin/provenance

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
COPY --from=cli /build/cli/target/release/provenance /usr/local/bin/provenance

ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]

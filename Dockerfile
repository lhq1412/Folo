FROM node:22-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV="development"

WORKDIR /app

# Native dependency builds may need Python and a compiler toolchain.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Enable the repository-pinned pnpm version.
RUN corepack enable && corepack prepare pnpm@10.17.0 --activate

# API via Cloudflare snippet proxy (see cloudflare/snippet.js). Deploy snippet on this host for CORS.
ENV VITE_WEB_URL="http://localhost:2233"
ENV VITE_API_URL="https://folo-api.1094712.xyz"

# Copy the whole repo so workspace scripts can resolve all packages.
COPY . .

# Dependencies are installed on first container start (see .devcontainer/postCreateCommand)
# to avoid brittle network failures during docker build.

EXPOSE 2233 2234

# Runs the main web environment: desktop web Vite + SSR server.
CMD ["pnpm", "dev:web"]

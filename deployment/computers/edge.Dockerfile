# Explicit opt-in target implementation. Building is not target-host qualification.
FROM node:24.18.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.computer.json ./
COPY src/shared/computer-types.ts src/shared/computer-edge-protocol.ts ./src/shared/
COPY src/computer ./src/computer
COPY src/browser/security.ts ./src/browser/security.ts
RUN ./node_modules/.bin/tsc -p tsconfig.computer.json

FROM node:24.18.1-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && \
    npx --no-install playwright install --with-deps chromium && \
    apt-get update && apt-get install -y --no-install-recommends bubblewrap && \
    rm -rf /var/lib/apt/lists/* /root/.npm
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright
# The installed browser is moved out of root's private HOME for the non-root driver.
RUN mv /root/.cache/ms-playwright /ms-playwright && \
    groupadd -g 10001 computer && useradd -u 10001 -g 10001 -m computer && \
    mkdir -p /workspace /profiles && chown computer:computer /workspace /profiles && chmod -R a+rX /ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=build /app/dist/computer ./dist/computer
USER 10001:10001
ENV WORKSPACE_DIR=/workspace PROFILES_DIR=/profiles PORT=4100
EXPOSE 4100
HEALTHCHECK --interval=10s --timeout=3s CMD node -e "fetch('http://127.0.0.1:4100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/computer/computer/index.js"]

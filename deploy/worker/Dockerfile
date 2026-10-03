# Worker da apuração oficial (TSE) — processo contínuo, independente da aplicação web.
# Build:  docker build -f deploy/worker/Dockerfile -t monitora-worker .
# Run:    docker run --env-file worker.env monitora-worker
# Variáveis (worker.env, NUNCA no git): DATABASE_URL_PRODUCTION, IDENTITY_HASH_KEY, MONITORA_ENV=production
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production MONITORA_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
COPY data ./data
USER node
# SIGTERM ⇒ parada graciosa (fim da passada atual); checkpoints tornam o reinício seguro.
CMD ["node", "scripts/ingest.mjs", "--env", "production", "--apuracao", "--confirm-production", "--interval", "60", "--proporcionais-a-cada", "5", "--concorrencia", "8"]

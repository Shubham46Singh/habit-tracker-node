FROM node:20.18.0-alpine3.20

ENV NODE_ENV=production
WORKDIR /app

# 1. Dependencies first: this layer is only rebuilt when package*.json changes.
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
 && npm cache clean --force

# 2. Source second.
COPY --chown=node:node . .

# 3. Never run as root.
USER node

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]

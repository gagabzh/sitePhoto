FROM node:20-alpine
WORKDIR /app
COPY worker/package*.json ./
RUN npm ci --omit=dev
COPY worker/src ./src
# Replace the local re-export stub with the shared implementation from the repo root.
COPY src/storage.js ./src/storage.js
COPY src/nextcloudWebdav.js ./src/nextcloudWebdav.js
CMD ["node", "src/worker.js"]

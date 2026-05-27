---
name: project-v4-plan
description: V4 implementation plan — OVH Public Cloud bi-instance architecture adapted for Express.js/plain JS (not NestJS)
metadata:
  type: project
---

# V4 — Plan ajusté (Express.js, pas NestJS)

## Statut global : ✅ Fusionné dans main (PR #44 — 2026-05-22)

**Phases code complètes :** 0, 3, 4, 5, 6, 7, 8, 9, 10
**Phase suivante :** Phase 1 — Infra OVH (Terraform dans `infra/` en cours)

---

## Écarts entre le document V4 et le projet réel

| Aspect | Document V4 | Projet réel | Ajustement |
|---|---|---|---|
| Framework | NestJS + TypeScript | Express.js + JavaScript | Garder Express |
| Structure repo | Nx monorepo (`create-nx-workspace`) | Repo Express simple à la racine | `worker/` subdirectory dans le repo existant |
| DTOs partagés | Libs Nx TypeScript | Modules CommonJS copiés | Copie simple dans `worker/src/` |
| Modules | `@Module`, `@Injectable` | `module.exports` | Réécrire en CommonJS |
| AI engine | face-api.js / InsightFace | Ollama (llava) | Worker utilise aussi Ollama sur Instance-2 |
| Stockage photos | Déjà S3 (hypothèse) | Disque local `uploads/` + multer diskStorage | Migration diskStorage → memoryStorage + S3 |
| Queue | BullMQ (déjà en place) | Aucune queue — Ollama synchrone aujourd'hui | Ajouter BullMQ |
| WebSocket | NestJS Gateway | socket.io sur le serveur HTTP Express existant | `socket.io` attaché au serveur Express |

---

## Structure cible du repo

```
sitephoto/                    # racine existante — inchangée
  src/
    storage.js               # NOUVEAU — wrapper S3 (CommonJS)
    queue/
      producer.js            # NOUVEAU — BullMQ producer
    routes/
      internal.js            # NOUVEAU — POST /internal/identification-result
    notifications.js         # NOUVEAU — socket.io gateway
    uploadHelpers.js         # MODIFIÉ — memoryStorage + S3 + enqueue
  worker/                    # NOUVEAU — app Node.js séparée
    package.json
    src/
      worker.js              # BullMQ processor principal
      storage.js             # Copie de src/storage.js
      ai.js                  # Client Ollama (adapté de src/ollama.js)
      instance1-api.js       # HTTP vers Instance-1 /internal
    .env.example
    Dockerfile
  docker-compose.yml         # MODIFIÉ — +Redis, +MinIO, +worker
  docker-compose.prod.yml    # NOUVEAU — prod (Redis seul sur Instance-1)
  .env.local.example         # NOUVEAU
  Dockerfile                 # MODIFIÉ — retire COPY uploads
```

---

## Phase 0 — Structure du repo

### 0.1 Créer le répertoire worker
```bash
mkdir -p worker/src
```

### 0.2 Initialiser le package worker
```json
// worker/package.json
{
  "name": "sitephoto-worker",
  "version": "1.0.0",
  "main": "src/worker.js",
  "dependencies": {
    "bullmq": "^5.x",
    "@aws-sdk/client-s3": "^3.x",
    "@aws-sdk/lib-storage": "^3.x",
    "uuid": "^9.x"
  }
}
```

### 0.3 Dockerfile worker
```dockerfile
# worker/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
CMD ["node", "src/worker.js"]
```

---

## Phase 1 — Infrastructure OVH Public Cloud

> Identique au document V4 original (phases 1.1 à 1.7).
> Voir `docs/v4-plan-infra-public-cloud-ovh.md` pour les détails OVH.

Points clés :
- Instance-1 : site Express + PostgreSQL + Redis (toujours allumée)
- Instance-2 : worker Node.js + Ollama (à la demande ou permanente)
- vRack privé `10.0.0.0/24`
- Bucket OVH Object Storage `photo-storage` (région GRA)

---

## Phase 2 — Redis sur Instance-1

> Identique au document V4 (phase 2).
> Redis exposé sur IP privée vRack uniquement, jamais sur 0.0.0.0.

---

## Phase 3 — Module Storage S3 (Express/CommonJS)

### 3.1 Installer le SDK S3
```bash
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage
```

### 3.2 Créer `src/storage.js`
```js
'use strict';
const { S3Client, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  forcePathStyle: true,  // requis OVH Object Storage et MinIO
});
const BUCKET = process.env.S3_BUCKET;

async function uploadPhoto(key, buffer, mimeType) {
  await new Upload({
    client,
    params: { Bucket: BUCKET, Key: key, Body: buffer, ContentType: mimeType },
  }).done();
  return key;
}

async function downloadPhoto(key) {
  const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return Buffer.from(await res.Body.transformToByteArray());
}

async function deletePhoto(key) {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

module.exports = { uploadPhoto, downloadPhoto, deletePhoto };
```

Convention de nommage des clés : `photos/{userId}/{uuid}/{originalname}`

---

## Phase 4 — Queue BullMQ — Producer (Instance-1)

### 4.1 Installer BullMQ sur l'app principale
```bash
npm install bullmq
```

### 4.2 Créer `src/queue/producer.js`
```js
'use strict';
const { Queue } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
};

const identificationQueue = new Queue('identification', { connection });

async function addIdentificationJob(payload) {
  // payload: { photoId, userId, photoS3Key, socketId }
  return identificationQueue.add('identify-photo', payload, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
}

module.exports = { addIdentificationJob };
```

### 4.3 Modifier `src/uploadHelpers.js`
- Passer de `multer.diskStorage` à `multer.memoryStorage`
- `uploadPhoto()` : upload buffer vers S3, puis `addIdentificationJob()`
- `deletePhotos()` : remplacer `fs.promises.unlink` par `deletePhoto(s3Key)`
- DB : les photos ont un champ `s3_key` (migration nécessaire, voir Phase 4.4)

```js
// Extrait upload.service modifié
const storage = multer.memoryStorage();
// ...
async function handlePhotoUpload(file, userId, socketId) {
  const photoId = uuidv4();
  const s3Key = `photos/${userId}/${photoId}/${file.originalname}`;
  await storageService.uploadPhoto(s3Key, file.buffer, file.mimetype);
  const photo = await insertPhoto({ s3Key, userId, /* ... */ });
  await addIdentificationJob({ photoId: photo.id, userId, photoS3Key: s3Key, socketId });
  return photo;
}
```

### 4.4 Migration BDD
```sql
-- Ajouter la colonne s3_key
ALTER TABLE photos ADD COLUMN s3_key TEXT;
-- Après migration des fichiers existants vers S3, mettre à jour les lignes
-- puis renommer / supprimer filename si souhaité
```

> **Migration des fichiers existants** : script one-shot qui lit chaque `filename` depuis
> `uploads/`, l'uploade vers S3 avec la clé `photos/{userId}/{uuid}/{filename}`, et met
> à jour la colonne `s3_key`.

---

## Phase 5 — WebSocket socket.io (Instance-1)

### 5.1 Installer socket.io
```bash
npm install socket.io
```

### 5.2 Créer `src/notifications.js`
```js
'use strict';
const { Server } = require('socket.io');

let io;

function initSocketIO(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.SITE_ORIGIN || '*' },
  });
  io.on('connection', (socket) => {
    // Le client envoie son socketId via l'upload form
  });
  return io;
}

function notifyUser(socketId, payload) {
  if (socketId && io) {
    io.to(socketId).emit('identification-complete', payload);
  }
}

module.exports = { initSocketIO, notifyUser };
```

### 5.3 Attacher socket.io au serveur Express dans `src/server.js`
```js
const http = require('http');
const { initSocketIO } = require('./notifications');
// ...
const httpServer = http.createServer(app);
initSocketIO(httpServer);
httpServer.listen(PORT);
```

### 5.4 Côté frontend
- Établir connexion socket.io avant l'upload
- Inclure `socket.id` dans le form upload (hidden field ou header)
- Écouter `identification-complete` → afficher les tags

---

## Phase 6 — Worker consumer (Instance-2)

### 6.1 Créer `worker/src/storage.js`
Copie identique de `src/storage.js` (même code, mêmes variables d'env).

### 6.2 Créer `worker/src/ai.js`
```js
'use strict';
// Ollama tourne en local sur Instance-2
const http = require('http');
const HOST  = process.env.OLLAMA_HOST || '127.0.0.1';
const PORT  = parseInt(process.env.OLLAMA_PORT || '11434', 10);
const MODEL = process.env.OLLAMA_MODEL || 'llava';
// ... même implémentation que src/ollama.js actuel
module.exports = { generate };
```

### 6.3 Créer `worker/src/instance1-api.js`
```js
'use strict';
async function postIdentificationResult(result) {
  const res = await fetch(`${process.env.INSTANCE1_API_URL}/internal/identification-result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-secret': process.env.WORKER_API_SECRET,
    },
    body: JSON.stringify(result),
  });
  if (!res.ok) throw new Error(`Instance1 API error: ${res.status}`);
}
module.exports = { postIdentificationResult };
```

### 6.4 Créer `worker/src/worker.js`
```js
'use strict';
const { Worker } = require('bullmq');
const { downloadPhoto } = require('./storage');
const { generate } = require('./ai');
const { postIdentificationResult } = require('./instance1-api');

const connection = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
};

const worker = new Worker('identification', async (job) => {
  const { photoId, userId, photoS3Key, socketId } = job.data;

  // 1. Télécharger depuis S3 (pas besoin de passer par Instance-1)
  const photoBuffer = await downloadPhoto(photoS3Key);
  const base64 = photoBuffer.toString('base64');

  // 2. Lancer l'identification via Ollama local
  const result = await generate({
    model: process.env.OLLAMA_MODEL || 'llava',
    prompt: process.env.IDENTIFICATION_PROMPT || 'Identifie les personnes sur cette photo. Retourne une liste JSON.',
    images: [base64],
  });

  // 3. Envoyer les résultats à Instance-1
  await postIdentificationResult({ photoId, userId, socketId, tags: result.response });
}, { connection });

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});
```

---

## Phase 7 — Endpoint interne (Instance-1)

### 7.1 Créer `src/routes/internal.js`
```js
'use strict';
const router = require('express').Router();
const { wrapAsync } = require('../middleware');
const { notifyUser } = require('../notifications');
// + importer le service qui applique les résultats en BDD

function requireWorkerSecret(req, res, next) {
  if (req.headers['x-worker-secret'] !== process.env.WORKER_API_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

router.post('/identification-result', requireWorkerSecret, wrapAsync(async (req, res) => {
  const { photoId, userId, socketId, tags } = req.body;
  // 1. Mettre à jour la BDD (statut + tags)
  await applyIdentificationResult(photoId, tags);
  // 2. Notifier le client via WebSocket
  notifyUser(socketId, { event: 'identification-complete', photoId, tags });
  res.json({ ok: true });
}));

module.exports = router;
```

### 7.2 Monter la route dans `src/app.js`
```js
app.use('/internal', require('./routes/internal'));
```

> L'endpoint `/internal` doit écouter uniquement sur le port `INTERNAL_API_PORT` (3001),
> différent du port public (3000), ou être filtré par IP (source = réseau vRack uniquement).

---

## Phase 8 — Docker Compose dev local

Remplacer/augmenter le `docker-compose.yml` existant :

```yaml
services:
  db:
    # ... identique à l'actuel

  app:
    build: .
    ports:
      - "3000:3000"
      - "3001:3001"   # port interne (worker → app)
    environment:
      # ... existant +
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD:-devpassword}
      S3_ENDPOINT: http://minio:9000
      S3_REGION: us-east-1
      S3_BUCKET: photo-storage
      S3_ACCESS_KEY: minioadmin
      S3_SECRET_KEY: minioadmin
      WORKER_API_SECRET: ${WORKER_API_SECRET:-dev-secret}
      INTERNAL_API_PORT: 3001
    depends_on:
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
      db:
        condition: service_healthy

  worker:
    build: ./worker
    environment:
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD:-devpassword}
      INSTANCE1_API_URL: http://app:3001
      WORKER_API_SECRET: ${WORKER_API_SECRET:-dev-secret}
      S3_ENDPOINT: http://minio:9000
      S3_REGION: us-east-1
      S3_BUCKET: photo-storage
      S3_ACCESS_KEY: minioadmin
      S3_SECRET_KEY: minioadmin
      OLLAMA_HOST: host-gateway
      OLLAMA_PORT: 11434
    extra_hosts:
      - "host-gateway:host-gateway"
    depends_on:
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --requirepass ${REDIS_PASSWORD:-devpassword}
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD:-devpassword}", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 5s
      timeout: 3s
      retries: 5

  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
        mc alias set local http://minio:9000 minioadmin minioadmin &&
        mc mb --ignore-existing local/photo-storage &&
        echo 'Bucket ready'
      "

  caddy:
    # ... identique à l'actuel

volumes:
  postgres_data:
  minio_data:
  caddy_data:
  caddy_config:
```

---

## Phase 9 — Déploiement OVH

> Voir sections prod du document original.
> Différences : pas de `nx build`, juste `docker build` + `docker compose up`.

```bash
# Instance-1
docker build -t sitephoto-site .
docker compose -f docker-compose.prod.yml up app db redis caddy -d

# Instance-2
cd worker && docker build -t sitephoto-worker .
docker run -d --env-file .env.prod sitephoto-worker
```

---

## Phase 10 — CI/CD GitHub Actions

```yaml
# .github/workflows/deploy-site.yml
on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'public/**'
      - 'Dockerfile'
      - 'package*.json'

# .github/workflows/deploy-worker.yml
on:
  push:
    branches: [main]
    paths:
      - 'worker/**'
```

---

## Phase 11 — Cycle de vie Instance-2 (optionnel)

Même approche que le document original, adapté en CommonJS :
```js
// src/instance-lifecycle.js
const OvhClient = require('ovh');
// ... start/stop via API OVH Public Cloud
```

---

## Ordre d'implémentation

1. ✅ Analyse des écarts (cette phase)
2. 🔲 Phase 0 — Créer `worker/` + structure
3. 🔲 Phase 8 — Docker Compose dev local (MinIO + Redis + worker)
4. 🔲 Phase 3 — `src/storage.js` + tests contre MinIO
5. 🔲 Phase 4 — BullMQ producer + migration `uploadHelpers.js` + migration DB
6. 🔲 Phase 5 — socket.io
7. 🔲 Phase 6 — Worker consumer (Ollama + storage + API client)
8. 🔲 Phase 7 — Endpoint `/internal`
9. 🔲 Tests end-to-end locaux (docker compose up, upload photo, vérifier flux)
10. 🔲 Migration photos existantes vers S3 (script one-shot)
11. 🔲 Phase 1 — Infra OVH
12. 🔲 Phase 9 — Déploiement prod
13. 🔲 Phase 10 — CI/CD
14. 🔲 Phase 11 — Cycle de vie (optionnel)

---

## Points de vigilance spécifiques au projet Express

- **multer memoryStorage** : les fichiers seront en RAM pendant l'upload → limiter la taille (déjà 10MB en place, OK)
- **Migration filename → s3_key** : le code référence `p.filename` dans plusieurs endroits (routes photos, pagination API). Mettre à jour toutes les références.
- **Ollama sur Instance-2** : Ollama doit être installé sur l'instance worker. Le model llava pèse ~4GB. Choisir une instance avec ≥8GB RAM.
- **Port séparé pour /internal** : soit port 3001 séparé, soit middleware IP whitelist (source = réseau vRack).
- **socket.io CORS** : restreindre à `SITE_ORIGIN` en prod.
- **Photos existantes** : script de migration nécessaire avant de décommissionner `uploads/`.

**Why:** Plan document was written for NestJS but project is Express/JS — all NestJS constructs replaced with CommonJS equivalents.
**How to apply:** All V4 code should be plain JS modules (require/module.exports), no decorators, no classes unless needed.

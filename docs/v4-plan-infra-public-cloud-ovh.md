# Plan d'implémentation — Architecture bi-instances Public Cloud OVH avec queue IA

> Site de gestion de photos NestJS — Identification de personnes asynchrone
> Rédigé le 21/05/2026 — Mis à jour le 21/05/2026 (migration VPS → Public Cloud OVH + Object Storage + monorepo Nx + dev local)

---

## Contexte

Architecture cible : deux instances OVH Public Cloud + un bucket Object Storage S3, communiquant via une queue BullMQ/Redis sur un réseau privé vRack.

- **Instance-1** (site principal) : NestJS + PostgreSQL + Redis — toujours allumée, sans stockage fichier local
- **Instance-2** (worker IA) : NestJS Worker + modèle de reconnaissance — allumée en permanence ou démarrée à la demande via l'API Public Cloud OVH
- **OVH Object Storage** (bucket S3) : stockage de toutes les photos — accessible par les deux instances via l'API S3, sans transit par le réseau privé

Les deux apps NestJS vivent dans un **monorepo Nx** : un seul dépôt GitHub, des DTOs et services partagés entre `site` et `worker`, un seul Docker Compose pour le développement local.

Les deux instances sont reliées par un **réseau privé vRack OVH** : Redis n'est jamais exposé sur internet, toute communication inter-instances transite sur le réseau L2 privé.

L'utilisateur uploade une photo → Instance-1 la stocke dans S3 et enqueue un job → reçoit un retour immédiat → Instance-2 lit la photo depuis S3, lance l'identification → les tags arrivent en temps réel via WebSocket.

```
Utilisateur
    │  upload HTTP
    ▼
[Instance-1 — NestJS]  ──── S3 API ────►  [OVH Object Storage]
    │  job BullMQ                                   │ S3 API
    ▼                                               │
[Redis — vRack privé]                              ▼
    │  consume job                        [Instance-2 — Worker IA]
    ▼                                       lit la photo depuis S3
[Instance-2]  ──── HTTP vRack ────►  [Instance-1 /internal]
                résultat identification        │
                                               ▼
                                    WebSocket → Utilisateur
```

> **Pourquoi Public Cloud et non VPS ?** Le vRack (réseau privé OVH) n'est pas disponible sur les offres VPS. Il est natif sur le Public Cloud, ce qui permet d'isoler Redis et les communications inter-instances sans exposition publique ni tunnel VPN à maintenir.

> **Pourquoi Object Storage ?** Les photos ne sont plus sur le disque local d'Instance-1 : les deux instances accèdent au même bucket S3 sans partage NFS ni URL signée maison. Le trafic sortant OVH Object Storage est gratuit depuis janvier 2026. Le disque local d'Instance-1 peut être réduit, donc l'instance elle-même moins chère.

---

## Phase 0 — Structure du monorepo Nx (un seul dépôt GitHub)

### 0.1 Scaffolding initial

```bash
npx create-nx-workspace@latest photo-app --preset=ts
cd photo-app

# Générer les deux applications NestJS
nx g @nx/nest:app site
nx g @nx/nest:app worker

# Générer les librairies partagées
nx g @nx/nest:lib storage          # StorageService S3
nx g @nx/nest:lib identification-queue  # DTOs + Producer partagés
nx g @nx/nest:lib shared-types     # Interfaces communes (SuggestedTag, etc.)
```

### 0.2 Structure cible du monorepo

```
photo-app/                          # racine du repo GitHub
  apps/
    site/                           # Instance-1 — NestJS site principal
      src/
        upload/
        internal/
        notifications/
        instance-lifecycle/         # optionnel
      Dockerfile
      .env.example
    worker/                         # Instance-2 — NestJS worker IA
      src/
        identification-worker/
      Dockerfile
      .env.example
  libs/
    storage/                        # StorageService S3 — partagé
      src/
        storage.module.ts
        storage.service.ts
    identification-queue/           # DTOs + Producer — partagés
      src/
        identification-queue.module.ts
        identification-queue.producer.ts
        identification-queue.dto.ts
    shared-types/                   # Interfaces communes
      src/
        suggested-tag.interface.ts
        identification-result.dto.ts
  docker-compose.yml                # Dev local (MinIO, Redis, site, worker)
  docker-compose.prod.yml           # Prod (Redis seulement — instances OVH séparées)
  nx.json
  README.md
  .env.local.example
  .github/
    workflows/
      deploy-site.yml               # CI/CD Instance-1
      deploy-worker.yml             # CI/CD Instance-2
```

### 0.3 Dockerfiles par app

Chaque app a son propre Dockerfile qui ne construit que son app depuis le monorepo :

```dockerfile
# apps/site/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci
RUN npx nx build site --prod

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist/apps/site .
RUN npm ci --omit=dev
CMD ["node", "main.js"]
```

```dockerfile
# apps/worker/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci
RUN npx nx build worker --prod

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist/apps/worker .
RUN npm ci --omit=dev
CMD ["node", "main.js"]
```

### 0.4 GitHub Actions — CI/CD séparé par app

```yaml
# .github/workflows/deploy-site.yml
name: Deploy Site
on:
  push:
    branches: [main]
    paths:
      - 'apps/site/**'
      - 'libs/**'           # un changement de lib redéploie les deux apps

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx nx build site --prod
      - name: Deploy to Instance-1 via SSH
        # rsync ou docker push vers OVH
```

> Le même pattern s'applique pour `deploy-worker.yml` en ciblant `apps/worker/**`.

---

## Phase 1 — Préparation de l'infrastructure OVH Public Cloud

### 1.1 Créer un projet Public Cloud OVH

Dans le Control Panel OVH (https://www.ovh.com/manager) :
- Aller dans **Public Cloud** → créer un nouveau projet
- Activer la facturation à l'heure (pay-as-you-go) pour pouvoir éteindre Instance-2 à la demande

### 1.2 Créer le réseau privé vRack

Dans le projet Public Cloud → **Réseau** → **Réseau privé** :
- Créer un réseau privé (ex: `photo-private-network`)
- Choisir un sous-réseau privé : `10.0.0.0/24`
- Activer le DHCP sur ce réseau
- Mémoriser le nom du réseau — il sera sélectionné à la création des instances

> Ce réseau est géré par le vRack OVH. Toute communication entre Instance-1 et Instance-2 sur cette interface est privée, non routée vers internet, et sans surcoût de bande passante.

### 1.3 Créer le bucket Object Storage S3

Dans le projet Public Cloud → **Storage** → **Object Storage** :
- Créer un nouveau bucket (ex: `photo-storage`)
- Région : choisir la même que tes instances (ex: `GRA` — Gravelines) pour minimiser la latence et éviter tout frais de bande passante inter-région
- Classe de stockage : **Standard** (HDD, 0,0119 €/Go/mois)
- Visibilité : **Privé** (aucun accès public direct)

Créer ensuite les credentials S3 :
- Dans le projet Public Cloud → **Users & Roles** → créer un utilisateur avec le rôle **ObjectStore operator**
- Générer les clés S3 (`Access Key` + `Secret Key`) depuis cet utilisateur
- Stocker ces clés dans les variables d'environnement des **deux instances**

> Le trafic sortant OVH Object Storage est gratuit depuis janvier 2026. Le trafic entrant (uploads) a toujours été gratuit. Les appels API sont inclus. Il n'y a donc aucun surcoût caché lié aux accès fréquents du worker IA.

### 1.4 Provisionner les deux instances

**Instance-1 — Site principal (toujours allumée)**
- Gamme : **General Purpose** (ex: `b3-8` — 4 vCores, 8 Go RAM) ~15-20€/mois
- Disque local réduit possible (plus de stockage photos) : `b3-8` avec disque système suffit
- OS : Ubuntu 24.04 LTS
- Ajouter l'interface réseau privé : `photo-private-network`
- IP publique : oui (pour servir le site)

**Instance-2 — Worker IA (à la demande)**
- Gamme : **CPU Optimised** (ex: `c3-8` ou `c3-16` selon le modèle IA) ~20-40€/mois à l'heure
- OS : Ubuntu 24.04 LTS
- Ajouter l'interface réseau privé : `photo-private-network`
- IP publique : non (aucune exposition publique nécessaire)

> L'IP privée de chaque instance sur le réseau vRack est attribuée par DHCP. Pour la stabilité, **réserver une IP privée fixe** pour Instance-1 depuis le Control Panel, ou configurer une IP statique dans `/etc/netplan/` après le premier démarrage.

### 1.5 Configurer les Security Groups (firewall OVH)

Dans **Réseau** → **Security Groups** du projet Public Cloud :

**Security Group pour Instance-1 :**
| Direction | Port | Source | Raison |
|---|---|---|---|
| Entrée | 80, 443 | 0.0.0.0/0 | Site web public |
| Entrée | 6379 | 10.0.0.0/24 | Redis — réseau privé uniquement |
| Entrée | 3001 | 10.0.0.0/24 | API interne — réseau privé uniquement |
| Sortie | tout | 0.0.0.0/0 | Sorties libres (dont API S3 OVH) |

**Security Group pour Instance-2 :**
| Direction | Port | Source | Raison |
|---|---|---|---|
| Entrée | aucun | — | Aucun port public |
| Sortie | tout | 0.0.0.0/0 | Sorties libres (API S3 + appels vers Instance-1) |

### 1.6 Sécuriser la communication applicative inter-instances

Même sur réseau privé, les appels HTTP entre Instance-2 → Instance-1 sont authentifiés :
- Générer un token partagé (`WORKER_API_SECRET`) — secret fort, 64 caractères minimum
- Stocker dans les variables d'environnement des deux instances (jamais en dur dans le code)

### 1.7 Installer Docker sur les deux instances

```bash
apt update && apt install -y docker.io docker-compose-plugin
systemctl enable docker
```

---

## Phase 2 — Mise en place de Redis (Instance-1)

### 2.1 Ajouter Redis au docker-compose d'Instance-1

```yaml
# docker-compose.yml (Instance-1)
services:
  redis:
    image: redis:7-alpine
    restart: always
    ports:
      - "10.0.0.1:6379:6379"  # IP privée vRack uniquement — jamais 0.0.0.0
    volumes:
      - redis_data:/data
    command: redis-server --requirepass ${REDIS_PASSWORD} --bind 127.0.0.1 10.0.0.1

volumes:
  redis_data:
```

> Remplacer `10.0.0.1` par l'IP privée réelle d'Instance-1 sur le réseau vRack. Vérifiable avec `ip addr show` sur l'interface réseau privée (souvent `eth1` ou `ens4`).

### 2.2 Variables d'environnement Instance-1

```env
# Redis (vRack privé)
REDIS_HOST=10.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=<mot_de_passe_fort>

# Sécurité inter-instances
WORKER_API_SECRET=<secret_partagé_64_chars>
INTERNAL_API_PORT=3001

# Object Storage OVH (S3 compatible)
S3_ENDPOINT=https://s3.gra.cloud.ovh.net   # adapter selon ta région OVH
S3_REGION=gra
S3_BUCKET=photo-storage
S3_ACCESS_KEY=<access_key_utilisateur_ovh>
S3_SECRET_KEY=<secret_key_utilisateur_ovh>
```

### 2.3 Variables d'environnement Instance-2

```env
# Redis (vRack privé)
REDIS_HOST=10.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=<mot_de_passe_fort>

# Sécurité inter-instances
INSTANCE1_API_URL=http://10.0.0.1:3001
WORKER_API_SECRET=<secret_partagé_64_chars>

# Object Storage OVH (S3 compatible — mêmes credentials que Instance-1)
S3_ENDPOINT=https://s3.gra.cloud.ovh.net
S3_REGION=gra
S3_BUCKET=photo-storage
S3_ACCESS_KEY=<access_key_utilisateur_ovh>
S3_SECRET_KEY=<secret_key_utilisateur_ovh>
```

> Instance-2 utilise les **mêmes credentials S3** qu'Instance-1 pour lire les photos. Si tu veux durcir la sécurité plus tard, tu peux créer un second utilisateur OVH avec des droits en lecture seule sur le bucket pour Instance-2.

---

## Phase 3 — Module Storage S3 (partagé entre les deux instances)

> Ce module est identique sur Instance-1 et Instance-2. Il encapsule tous les accès à OVH Object Storage via le SDK AWS S3 (compatible API S3).

### 3.1 Installer le SDK S3

```bash
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage
```

### 3.2 Créer le module `StorageModule`

**Fichiers à créer (sur les deux instances) :**

```
src/
  storage/
    storage.module.ts
    storage.service.ts
```

**StorageService :**

```typescript
// storage.service.ts
@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET;
    this.client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY,
      },
      forcePathStyle: true,  // requis pour OVH Object Storage
    });
  }

  // Upload d'une photo (utilisé par Instance-1)
  async uploadPhoto(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    await new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      },
    }).done();
    return key;
  }

  // Téléchargement d'une photo (utilisé par Instance-2)
  async downloadPhoto(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return Buffer.from(await response.Body.transformToByteArray());
  }

  // Suppression d'une photo
  async deletePhoto(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
```

**Convention de nommage des clés S3 :**

```
photos/{userId}/{photoId}/{filename}
thumbnails/{userId}/{photoId}/thumb_{filename}
```

---

## Phase 4 — Module Queue sur Instance-1 (Producer)

### 4.1 Installer BullMQ

```bash
npm install @nestjs/bullmq bullmq
```

### 4.2 Créer le module `IdentificationQueue`

**Fichiers à créer :**

```
src/
  identification-queue/
    identification-queue.module.ts   # déclare la queue BullMQ
    identification-queue.producer.ts # injecte les jobs dans la queue
    identification-queue.dto.ts      # typage du payload du job
```

**Contenu attendu du producer :**

```typescript
// identification-queue.producer.ts
@Injectable()
export class IdentificationQueueProducer {
  constructor(@InjectQueue('identification') private queue: Queue) {}

  async addJob(payload: IdentificationJobDto): Promise<Job> {
    return this.queue.add('identify-photo', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }
}
```

**Payload du job (DTO) :**

```typescript
// identification-queue.dto.ts
export interface IdentificationJobDto {
  photoId: string;
  userId: string;
  photoS3Key: string;   // clé S3 OVH — ex: "photos/user-123/photo-456/img.jpg"
  socketId?: string;    // pour notifier le bon client WebSocket
}
```

> `photoS3Key` remplace l'ancien `photoPath`. Instance-2 utilise cette clé pour télécharger directement la photo depuis S3 via le `StorageService`, sans dépendre d'Instance-1.

### 4.3 Modifier le service d'upload existant

Dans le service qui gère l'upload actuel, remplacer la sauvegarde sur disque par un upload S3 :

```typescript
// upload.service.ts (modifications)
async handleUpload(file: Express.Multer.File, userId: string): Promise<Photo> {
  const photoId = uuidv4();
  const s3Key = `photos/${userId}/${photoId}/${file.originalname}`;

  // 1. Uploader dans S3 (remplace l'écriture disque)
  await this.storageService.uploadPhoto(s3Key, file.buffer, file.mimetype);

  // 2. Sauvegarder les métadonnées en BDD (sans chemin local)
  const photo = await this.photoService.create({ photoId, userId, s3Key });

  // 3. Mettre le statut à PENDING_IDENTIFICATION
  await this.photoService.updateStatus(photoId, 'PENDING_IDENTIFICATION');

  // 4. Envoyer le job dans la queue
  await this.identificationQueueProducer.addJob({
    photoId,
    userId,
    photoS3Key: s3Key,
    socketId: file.socketId,  // passé depuis le frontend
  });

  // 5. Réponse immédiate
  return photo;
}
```

> **Migration BDD** : si tu as un champ `filePath` en base pointant vers le disque local, le renommer en `s3Key` et adapter les requêtes existantes.

---

## Phase 5 — Module Worker sur Instance-2 (Consumer)

### 5.1 Créer un projet NestJS dédié (ou un workspace Nx/monorepo)

> Option recommandée : **monorepo NestJS** avec deux apps (`site` et `worker`) partageant les DTOs et le `StorageModule`. Permet de versionner les contrats d'interface ensemble.

```bash
nest new photo-worker
npm install @nestjs/bullmq bullmq @aws-sdk/client-s3 @aws-sdk/lib-storage
```

### 5.2 Créer le module `IdentificationWorker`

**Fichiers à créer :**

```
src/
  storage/
    storage.module.ts              # identique à Instance-1
    storage.service.ts             # identique à Instance-1
  identification-worker/
    identification-worker.module.ts
    identification-worker.processor.ts  # consumer BullMQ
    identification.service.ts            # logique IA
    instance1-api.service.ts             # client HTTP vers Instance-1
```

**Processor (consumer) :**

```typescript
// identification-worker.processor.ts
@Processor('identification')
export class IdentificationWorkerProcessor {
  constructor(
    private readonly storageService: StorageService,
    private readonly identificationService: IdentificationService,
    private readonly instance1ApiService: Instance1ApiService,
  ) {}

  @Process('identify-photo')
  async handleJob(job: Job<IdentificationJobDto>): Promise<void> {
    const { photoId, userId, photoS3Key, socketId } = job.data;

    // 1. Télécharger la photo depuis S3 directement (sans passer par Instance-1)
    const photoBuffer = await this.storageService.downloadPhoto(photoS3Key);

    // 2. Lancer l'identification
    const suggestedTags = await this.identificationService.identify(photoBuffer);

    // 3. Envoyer les résultats à Instance-1 via API sécurisée (réseau privé vRack)
    await this.instance1ApiService.postIdentificationResult({
      photoId,
      userId,
      socketId,
      tags: suggestedTags,
    });
  }
}
```

### 5.3 Service d'identification IA

```typescript
// identification.service.ts
@Injectable()
export class IdentificationService {
  // Modèle chargé une seule fois au démarrage
  async onModuleInit(): Promise<void> {
    await this.loadModel();
  }

  async identify(photoBuffer: Buffer): Promise<SuggestedTag[]> {
    // Décoder l'image depuis le buffer (plus de lecture disque)
    // Lancer la détection de visages (face-api.js, ONNX, InsightFace, etc.)
    // Comparer avec les descripteurs des personnes référencées
    // Retourner une liste de { tagId, personName, confidence }
  }
}
```

### 5.4 Client HTTP vers Instance-1

```typescript
// instance1-api.service.ts
@Injectable()
export class Instance1ApiService {
  async postIdentificationResult(result: IdentificationResultDto): Promise<void> {
    // Appel via réseau privé vRack — HTTP suffit sur réseau interne OVH
    await fetch(`${process.env.INSTANCE1_API_URL}/internal/identification-result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': process.env.WORKER_API_SECRET,
      },
      body: JSON.stringify(result),
    });
  }
}
```

---

## Phase 6 — Endpoint interne sur Instance-1 (réception des résultats)

### 6.1 Créer le controller `InternalController`

```
src/
  internal/
    internal.module.ts
    internal.controller.ts   # POST /internal/identification-result
    internal.guard.ts        # vérifie le x-worker-secret
```

**Guard de sécurité :**

```typescript
// internal.guard.ts
@Injectable()
export class WorkerSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    return request.headers['x-worker-secret'] === process.env.WORKER_API_SECRET;
  }
}
```

**Controller :**

```typescript
// internal.controller.ts
@Controller('internal')
@UseGuards(WorkerSecretGuard)
export class InternalController {
  constructor(
    private readonly photoService: PhotoService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  @Post('identification-result')
  async receiveResult(@Body() result: IdentificationResultDto): Promise<void> {
    // 1. Mettre à jour la BDD (statut + tags suggérés)
    await this.photoService.applyIdentificationResult(result);

    // 2. Notifier le client WebSocket concerné
    this.notificationGateway.notifyUser(result.socketId, {
      event: 'identification-complete',
      photoId: result.photoId,
      tags: result.tags,
    });
  }
}
```

---

## Phase 7 — Notification temps réel (WebSocket)

### 7.1 Créer le Gateway NestJS

```bash
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
```

```
src/
  notifications/
    notifications.module.ts
    notifications.gateway.ts
```

**Gateway :**

```typescript
// notifications.gateway.ts
@WebSocketGateway({ cors: { origin: '*' } })
export class NotificationGateway {
  @WebSocketServer()
  server: Server;

  notifyUser(socketId: string, payload: object): void {
    if (socketId) {
      this.server.to(socketId).emit('identification-complete', payload);
    }
  }
}
```

### 7.2 Côté frontend

Au moment de l'upload, le frontend :
1. Envoie l'upload HTTP normalement
2. Inclut son `socket.id` dans le corps de la requête (ou en header)
3. Écoute l'événement `identification-complete` sur sa connexion Socket.io
4. Affiche un badge "Identification en cours…" jusqu'à réception de l'événement

---

## Phase 8 — Gestion du cycle de vie d'Instance-2 (optionnel — économie de coûts)

> Si tu veux éteindre Instance-2 quand il n'y a rien à traiter. Sur le Public Cloud OVH, tu es facturé à l'heure uniquement quand l'instance est allumée.

### 7.1 Créer les credentials API OVH

Sur https://api.ovh.com/createToken/ :
- Générer un token avec les droits : `POST /cloud/project/{projectId}/instance/{instanceId}/start` et `POST /cloud/project/{projectId}/instance/{instanceId}/stop`
- Stocker dans les variables d'environnement d'Instance-1 :

```env
OVH_APPLICATION_KEY=<ak>
OVH_APPLICATION_SECRET=<as>
OVH_CONSUMER_KEY=<ck>
OVH_PROJECT_ID=<id_projet_public_cloud>
OVH_WORKER_INSTANCE_ID=<id_instance_2>
```

### 7.2 Installer le SDK OVH

```bash
npm install @ovh-api/me ovh
```

### 7.3 Approche recommandée : contrôleur de cycle de vie sur Instance-1

Créer un service `InstanceLifecycleService` sur Instance-1 qui :
- Utilise l'API Public Cloud OVH pour démarrer/arrêter Instance-2
- Démarre Instance-2 quand un job est ajouté à la queue (hook `queue.on('waiting')`)
- Arrête Instance-2 après N minutes d'inactivité (`queue.on('drained')` + timer)

```typescript
// instance-lifecycle.service.ts (sur Instance-1)
@Injectable()
export class InstanceLifecycleService {
  private inactivityTimer: NodeJS.Timeout | null = null;
  private readonly ovhClient = new OvhClient({
    appKey: process.env.OVH_APPLICATION_KEY,
    appSecret: process.env.OVH_APPLICATION_SECRET,
    consumerKey: process.env.OVH_CONSUMER_KEY,
  });

  async startWorkerInstance(): Promise<void> {
    await this.ovhClient.requestPromised(
      'POST',
      `/cloud/project/${process.env.OVH_PROJECT_ID}/instance/${process.env.OVH_WORKER_INSTANCE_ID}/start`,
    );
  }

  async scheduleStop(delayMinutes = 10): Promise<void> {
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(
      () => this.stopWorkerInstance(),
      delayMinutes * 60_000,
    );
  }

  private async stopWorkerInstance(): Promise<void> {
    await this.ovhClient.requestPromised(
      'POST',
      `/cloud/project/${process.env.OVH_PROJECT_ID}/instance/${process.env.OVH_WORKER_INSTANCE_ID}/stop`,
    );
  }
}
```

> **Note :** Instance-2 met ~60-90s à démarrer. Pendant ce temps, les jobs restent en queue BullMQ et seront consommés dès que le worker est prêt. L'utilisateur voit toujours "En cours…" — aucun impact visible.

---

## Phase 9 — Docker Compose de développement local

> En local, MinIO remplace OVH Object Storage et le réseau Docker remplace le vRack. Ton code ne change pas — seules les variables d'environnement diffèrent.

### 9.1 Fichier `docker-compose.yml` (racine du monorepo)

```yaml
# docker-compose.yml — développement local uniquement
services:

  site:
    build:
      context: .
      dockerfile: apps/site/Dockerfile
    ports:
      - "3000:3000"   # site public
      - "3001:3001"   # API interne (accessible worker dans le réseau Docker)
    env_file: .env.local
    environment:
      REDIS_HOST: redis
      S3_ENDPOINT: http://minio:9000
      INSTANCE1_API_URL: http://site:3001
    depends_on:
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
    volumes:
      - ./apps/site/src:/app/src   # hot-reload en développement
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
    env_file: .env.local
    environment:
      REDIS_HOST: redis
      S3_ENDPOINT: http://minio:9000
      INSTANCE1_API_URL: http://site:3001
    depends_on:
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
      site:
        condition: service_started
    volumes:
      - ./apps/worker/src:/app/src   # hot-reload en développement
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"   # exposé localement pour debug (redis-cli, bull-board)
    command: redis-server --requirepass ${REDIS_PASSWORD}
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"   # API S3
      - "9001:9001"   # Console web MinIO → http://localhost:9001
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

  # Initialisation automatique du bucket MinIO au démarrage
  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
        mc alias set local http://minio:9000 minioadmin minioadmin &&
        mc mb --ignore-existing local/photo-storage &&
        echo 'Bucket photo-storage prêt'
      "

volumes:
  minio_data:
```

### 9.2 Fichier `.env.local.example` (à copier en `.env.local`)

```env
# Redis
REDIS_PASSWORD=devpassword
REDIS_PORT=6379

# Sécurité inter-services
WORKER_API_SECRET=dev-secret-change-in-prod
INTERNAL_API_PORT=3001

# Object Storage — MinIO en local, OVH en prod
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1          # MinIO ignore la région, mais le SDK l'exige
S3_BUCKET=photo-storage
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin

# OVH cycle de vie Instance-2 — non utilisé en local
# OVH_APPLICATION_KEY=
# OVH_APPLICATION_SECRET=
# OVH_CONSUMER_KEY=
# OVH_PROJECT_ID=
# OVH_WORKER_INSTANCE_ID=
```

> Ajouter `.env.local` au `.gitignore`. Committer uniquement `.env.local.example`.

### 9.3 Commandes de développement

```bash
# Démarrer l'environnement complet
docker compose up --build

# Démarrer uniquement les services d'infrastructure (sans rebuild des apps)
docker compose up redis minio minio-init

# Relancer uniquement le worker après un changement
docker compose up worker --build

# Voir les logs du worker en temps réel
docker compose logs -f worker

# Accès directs utiles en local
# → Site :          http://localhost:3000
# → Console MinIO : http://localhost:9001  (minioadmin / minioadmin)
# → Redis CLI :     redis-cli -p 6379 -a devpassword
```

### 9.4 Différences entre local et prod

| Aspect | Local (Docker Compose) | Prod (OVH Public Cloud) |
|---|---|---|
| Réseau inter-services | Réseau Docker interne | vRack OVH privé |
| Object Storage | MinIO (`http://minio:9000`) | OVH S3 (`https://s3.gra.cloud.ovh.net`) |
| Redis | Exposé sur `localhost:6379` | Exposé sur IP privée vRack uniquement |
| Worker | Toujours démarré | À la demande (optionnel) |
| `forcePathStyle` S3 | `true` (MinIO) | `true` (OVH aussi) |
| Cycle de vie Instance-2 | Non applicable | API OVH Public Cloud |

> Le `StorageService` fonctionne identiquement dans les deux environnements — seul `S3_ENDPOINT` change via les variables d'environnement.

---

## Phase 10 — README de déploiement

Créer un `README.md` à la racine du monorepo avec les sections suivantes :

````markdown
# Photo App — Monorepo Nx

Site de gestion de photos avec identification IA asynchrone.

## Architecture

- `apps/site` — NestJS, Instance-1 OVH Public Cloud
- `apps/worker` — NestJS Worker IA, Instance-2 OVH Public Cloud (à la demande)
- `libs/storage` — Wrapper S3 partagé (OVH Object Storage / MinIO)
- `libs/identification-queue` — DTOs et Producer BullMQ partagés
- Infrastructure : vRack OVH (réseau privé), Redis (queue), OVH Object Storage (photos)

## Développement local

### Pré-requis
- Docker Desktop
- Node.js 20+
- `npm install -g nx`

### Démarrage

```bash
cp .env.local.example .env.local
npm install
docker compose up --build
```

- Site : http://localhost:3000
- Console MinIO (photos) : http://localhost:9001
- Credentials MinIO : `minioadmin` / `minioadmin`

### Commandes Nx utiles

```bash
nx build site          # build de l'app site
nx build worker        # build de l'app worker
nx test site           # tests unitaires site
nx test worker         # tests unitaires worker
nx affected:build      # build uniquement les apps modifiées
nx graph               # visualiser les dépendances entre apps et libs
```

## Déploiement en production (OVH Public Cloud)

### Pré-requis infra
1. Projet OVH Public Cloud créé
2. Réseau privé vRack configuré (`photo-private-network`, `10.0.0.0/24`)
3. Bucket Object Storage créé (`photo-storage`, région GRA)
4. Instance-1 et Instance-2 provisionnées avec Docker installé
5. Security Groups configurés (voir plan d'implémentation)

### Variables d'environnement de production

Copier `.env.local.example` vers `.env.prod` sur chaque instance et renseigner :
- `S3_ENDPOINT` → `https://s3.gra.cloud.ovh.net`
- `S3_ACCESS_KEY` / `S3_SECRET_KEY` → credentials OVH Public Cloud
- `REDIS_HOST` → IP privée vRack d'Instance-1
- `WORKER_API_SECRET` → secret fort (64 caractères minimum)
- `OVH_*` → credentials API OVH pour le cycle de vie d'Instance-2 (optionnel)

### Déploiement Instance-1 (site)

```bash
# Depuis la racine du repo, sur Instance-1
nx build site --prod
docker compose -f docker-compose.prod.yml up site redis --build -d
```

### Déploiement Instance-2 (worker)

```bash
# Depuis la racine du repo, sur Instance-2
nx build worker --prod
docker compose -f docker-compose.prod.yml up worker --build -d
```

### CI/CD automatique

Le déploiement est automatisé via GitHub Actions :
- Push sur `main` avec changements dans `apps/site/**` ou `libs/**` → déploie Instance-1
- Push sur `main` avec changements dans `apps/worker/**` ou `libs/**` → déploie Instance-2

## Structure du projet

```
photo-app/
  apps/site/          → Application principale NestJS
  apps/worker/        → Worker IA NestJS
  libs/storage/       → StorageService S3 (partagé)
  libs/identification-queue/  → DTOs + Producer BullMQ (partagé)
  libs/shared-types/  → Interfaces TypeScript communes
  docker-compose.yml          → Dev local
  docker-compose.prod.yml     → Prod (Redis uniquement)
```
````

---

## Récapitulatif des fichiers à créer/modifier

### Racine du monorepo

| Fichier | Action |
|---|---|
| `nx.json` | Généré par Nx au scaffolding |
| `docker-compose.yml` | Créer — dev local (site, worker, Redis, MinIO) |
| `docker-compose.prod.yml` | Créer — prod (Redis uniquement) |
| `.env.local.example` | Créer — template variables dev |
| `.gitignore` | Modifier — ajouter `.env.local` |
| `README.md` | Créer — guide développement et déploiement |
| `.github/workflows/deploy-site.yml` | Créer — CI/CD Instance-1 |
| `.github/workflows/deploy-worker.yml` | Créer — CI/CD Instance-2 |

### `libs/storage/`

| Fichier | Action |
|---|---|
| `src/storage.module.ts` | Créer |
| `src/storage.service.ts` | Créer — wrapper S3 OVH / MinIO |

### `libs/identification-queue/`

| Fichier | Action |
|---|---|
| `src/identification-queue.module.ts` | Créer |
| `src/identification-queue.producer.ts` | Créer |
| `src/identification-queue.dto.ts` | Créer — champ `photoS3Key` |

### `libs/shared-types/`

| Fichier | Action |
|---|---|
| `src/suggested-tag.interface.ts` | Créer |
| `src/identification-result.dto.ts` | Créer |

### `apps/site/` (Instance-1)

| Fichier | Action |
|---|---|
| `Dockerfile` | Créer |
| `src/upload/upload.service.ts` | Modifier — écriture S3, enqueue |
| `src/internal/internal.module.ts` | Créer |
| `src/internal/internal.controller.ts` | Créer |
| `src/internal/internal.guard.ts` | Créer |
| `src/notifications/notifications.module.ts` | Créer |
| `src/notifications/notifications.gateway.ts` | Créer |
| `src/photos/photo.service.ts` | Modifier — `applyIdentificationResult()`, champ `s3Key` |
| `src/instance-lifecycle/instance-lifecycle.service.ts` | Créer (optionnel) |
| `.env.example` | Créer — variables prod Instance-1 |

### `apps/worker/` (Instance-2)

| Fichier | Action |
|---|---|
| `Dockerfile` | Créer |
| `src/identification-worker/identification-worker.module.ts` | Créer |
| `src/identification-worker/identification-worker.processor.ts` | Créer |
| `src/identification-worker/identification.service.ts` | Créer |
| `src/identification-worker/instance1-api.service.ts` | Créer |
| `.env.example` | Créer — variables prod Instance-2 |

---

## Ordre d'implémentation recommandé

1. **Monorepo** — Scaffolding Nx, créer les apps `site` et `worker`, créer les libs partagées (`storage`, `identification-queue`, `shared-types`)
2. **Dev local** — Écrire `docker-compose.yml`, `.env.local.example`, vérifier que `docker compose up` démarre sans erreur (site, worker, Redis, MinIO)
3. **StorageService** — Implémenter dans `libs/storage`, tester upload/download contre MinIO local
4. **Queue producer** — Implémenter dans `libs/identification-queue`, modifier `upload.service.ts` pour écrire dans S3 et enqueuer
5. **WebSocket gateway** — Implémenter la notification dans `apps/site`
6. **Worker consumer** — Implémenter le processor et le service IA dans `apps/worker`
7. **Endpoint interne** — Implémenter le controller de réception des résultats dans `apps/site`
8. **Tests end-to-end locaux** — `docker compose up --build`, uploader une photo, vérifier le flux complet via MinIO et les logs
9. **README** — Rédiger le guide de déploiement (Phase 10)
10. **Infra OVH** — Créer le projet Public Cloud, le bucket Object Storage, le réseau vRack, provisionner les instances, configurer les Security Groups
11. **Déploiement prod** — Déployer Instance-1 puis Instance-2, vérifier la connectivité vRack et l'accès S3
12. **CI/CD** — Configurer les GitHub Actions `deploy-site.yml` et `deploy-worker.yml`
13. **Cycle de vie Instance-2** — Implémenter le démarrage/arrêt automatique via API OVH (optionnel)

---

## Tests unitaires

### Tests à écrire — Monorepo (libs partagées)

```typescript
// libs/storage/src/storage.service.spec.ts
describe('StorageService', () => {
  // Tourne contre MinIO local via testcontainers ou mock SDK
  it('devrait uploader un fichier avec la bonne clé S3', async () => { ... });
  it('devrait retourner la clé S3 après upload', async () => { ... });
  it('devrait télécharger un fichier et retourner un Buffer', async () => { ... });
  it('devrait supprimer un fichier depuis S3', async () => { ... });
  it('devrait lever une erreur si le bucket est inaccessible', async () => { ... });
  it('devrait lever une erreur si la clé S3 n\'existe pas', async () => { ... });
});
```

### Tests à écrire — `apps/site` (Instance-1)

```typescript
// identification-queue.producer.spec.ts
describe('IdentificationQueueProducer', () => {
  it('devrait ajouter un job avec le bon photoS3Key', async () => { ... });
  it('devrait configurer 3 tentatives avec backoff exponentiel', async () => { ... });
});

// upload.service.spec.ts (modifications)
describe('UploadService', () => {
  it('devrait uploader la photo dans S3 avant d\'enqueuer le job', async () => { ... });
  it('devrait stocker la clé S3 en BDD (pas un chemin local)', async () => { ... });
  it('devrait retourner immédiatement sans attendre l\'identification', async () => { ... });
});

// internal.guard.spec.ts
describe('WorkerSecretGuard', () => {
  it('devrait autoriser la requête avec le bon secret', () => { ... });
  it('devrait rejeter la requête sans secret', () => { ... });
  it('devrait rejeter la requête avec un mauvais secret', () => { ... });
});

// internal.controller.spec.ts
describe('InternalController', () => {
  it('devrait appeler applyIdentificationResult avec les bons paramètres', async () => { ... });
  it('devrait notifier le bon socketId', async () => { ... });
});

// notifications.gateway.spec.ts
describe('NotificationGateway', () => {
  it('devrait émettre l\'événement au bon socket', () => { ... });
  it('ne devrait pas planter si socketId est undefined', () => { ... });
});

// instance-lifecycle.service.spec.ts (optionnel)
describe('InstanceLifecycleService', () => {
  it('devrait appeler l\'API OVH pour démarrer Instance-2', async () => { ... });
  it('devrait annuler le timer d\'arrêt si un nouveau job arrive', async () => { ... });
});
```

### Tests à écrire — Instance-2

### Tests à écrire — `apps/worker` (Instance-2)

```typescript
// identification-worker.processor.spec.ts
describe('IdentificationWorkerProcessor', () => {
  it('devrait télécharger la photo depuis S3 avec le bon photoS3Key', async () => { ... });
  it('devrait appeler identificationService.identify avec le buffer téléchargé', async () => { ... });
  it('devrait appeler instance1ApiService.postIdentificationResult après identification', async () => { ... });
  it('devrait gérer les erreurs S3 sans planter le worker', async () => { ... });
  it('devrait gérer les erreurs IA sans planter le worker', async () => { ... });
});

// instance1-api.service.spec.ts
describe('Instance1ApiService', () => {
  it('devrait envoyer le header x-worker-secret', async () => { ... });
  it('devrait faire un POST sur le bon endpoint (IP privée vRack)', async () => { ... });
});
```

---

## Plan de test manuel (humain)

### Environnement local (Docker Compose)

**Pré-requis :**
- Docker Desktop démarré
- `.env.local` créé depuis `.env.local.example`
- `docker compose up --build` sans erreur

**Scénario L1 — Vérification de l'environnement local**

1. Ouvrir la console MinIO : http://localhost:9001 (`minioadmin` / `minioadmin`)
2. **Vérifier :** le bucket `photo-storage` existe (créé automatiquement par `minio-init`)
3. Uploader une photo via le site : http://localhost:3000
4. **Vérifier :** la photo apparaît dans le bucket MinIO (console web)
5. **Vérifier :** un badge "Identification en cours…" apparaît
6. **Vérifier :** dans `docker compose logs worker`, le job est consommé
7. **Vérifier :** les tags apparaissent sans rechargement de page

**Scénario L2 — Résilience worker en local**

1. `docker compose stop worker`
2. Uploader une photo
3. **Vérifier :** l'upload est immédiat, la photo est dans MinIO
4. `docker compose start worker`
5. **Vérifier :** le job est consommé et les tags arrivent

### Environnement de production (OVH Public Cloud)

**Pré-requis :**
- Les deux instances Public Cloud OVH sont démarrées
- Le réseau privé vRack est configuré (`ping 10.0.0.x` entre les instances)
- Redis accessible depuis Instance-2 : `redis-cli -h 10.0.0.1 -a <password> ping` → `PONG`
- Bucket S3 OVH créé, credentials configurés sur les deux instances

**Scénario P1 — Vérification du stockage S3**

1. Depuis Instance-1, uploader un fichier test dans le bucket :
   ```bash
   aws s3 cp /tmp/test.jpg s3://photo-storage/test/test.jpg --endpoint-url https://s3.gra.cloud.ovh.net
   ```
2. **Vérifier :** le fichier apparaît dans le Control Panel OVH → Object Storage
3. Depuis Instance-2, télécharger le même fichier :
   ```bash
   aws s3 cp s3://photo-storage/test/test.jpg /tmp/downloaded.jpg --endpoint-url https://s3.gra.cloud.ovh.net
   ```
4. **Vérifier :** le fichier téléchargé est identique à l'original (`md5sum`)
5. Supprimer le fichier test depuis Instance-1

**Scénario P2 — Flux nominal complet**

1. Ouvrir le site et se connecter
2. Ouvrir la console développeur du navigateur (onglet Réseau + Console)
3. Uploader une photo contenant un visage reconnu
4. **Vérifier :** la réponse HTTP de l'upload est immédiate (< 500ms)
5. **Vérifier :** la photo apparaît dans le bucket S3 OVH (Control Panel → Object Storage)
6. **Vérifier :** un badge "Identification en cours…" apparaît sur la photo
7. **Vérifier :** dans les logs Instance-1, un job a bien été ajouté à la queue BullMQ
8. **Vérifier :** dans les logs Instance-2, le job est consommé, la photo est téléchargée depuis S3, l'identification démarre
9. **Vérifier :** le badge se transforme en tags de personnes sans rechargement de page
10. **Vérifier :** les tags sont bien enregistrés en BDD
11. **Vérifier :** la BDD contient bien une clé `s3Key` et non un chemin local pour la photo

**Scénario P3 — Résilience worker hors ligne**

1. Éteindre Instance-2 (via le Control Panel OVH ou l'API)
2. Uploader une photo
3. **Vérifier :** l'upload répond toujours immédiatement
4. **Vérifier :** la photo est bien dans S3 (Control Panel OVH)
5. **Vérifier :** la photo affiche "Identification en cours…"
6. Rallumer Instance-2
7. **Vérifier :** le job est consommé, la photo lue depuis S3, les tags arrivent

**Scénario P4 — Sécurité de l'endpoint interne**

1. Envoyer un POST manuel sur `http://10.0.0.1:3001/internal/identification-result` sans header `x-worker-secret`
2. **Vérifier :** réponse 403 Forbidden
3. Envoyer avec un mauvais secret
4. **Vérifier :** réponse 403 Forbidden
5. Envoyer avec le bon secret
6. **Vérifier :** réponse 200 OK
7. **Vérifier :** l'endpoint n'est pas accessible depuis l'internet public (tester depuis une machine externe)

**Scénario P5 — Montée en charge (optionnel)**

1. Uploader 10 photos simultanément
2. **Vérifier :** tous les jobs sont bien en queue (visible dans bull-board)
3. **Vérifier :** les 10 photos apparaissent dans S3
4. **Vérifier :** chaque utilisateur reçoit la notification sur son propre socket uniquement

**Scénario P6 — Cycle de vie automatique (si Phase 8 implémentée)**

1. S'assurer qu'Instance-2 est éteinte
2. Uploader une photo
3. **Vérifier :** Instance-2 démarre automatiquement (visible dans le Control Panel OVH)
4. Attendre le délai d'inactivité configuré (ex: 10 minutes sans upload)
5. **Vérifier :** Instance-2 s'éteint automatiquement

---

## Points de vigilance

- **MinIO en local vs OVH en prod** : seul `S3_ENDPOINT` change entre les environnements. `forcePathStyle: true` est requis dans les deux cas. Ne jamais committer `.env.local` — seulement `.env.local.example`.
- **IP privée vRack** : vérifier l'interface réseau privée au démarrage des instances (`ip addr show eth1`). L'IP peut changer si l'instance est recréée — préférer une IP fixe réservée dans le Control Panel.
- **S3 endpoint OVH** : utiliser `forcePathStyle: true` dans le SDK AWS S3, requis pour OVH Object Storage. L'endpoint varie selon la région : `https://s3.gra.cloud.ovh.net` pour Gravelines.
- **Clés S3 en BDD** : lors de la migration, renommer le champ `filePath` existant en `s3Key` et migrer les chemins locaux existants vers S3 avant de décommissionner le disque local.
- **Mémoire du modèle IA** : charger le modèle une seule fois au démarrage du worker (`onModuleInit`), pas à chaque job.
- **Reconnexion WebSocket** : gérer le cas où l'utilisateur se déconnecte avant la fin de l'identification (stocker le résultat en BDD, le frontend récupère l'état au rechargement).
- **CORS sur le Gateway WebSocket** : restreindre l'origine au domaine de production.
- **Monitoring** : ajouter un dashboard BullMQ (ex: `bull-board`) sur Instance-1 pour visualiser la queue en développement.
- **Facturation Public Cloud** : Instance-2 est facturée à l'heure même à l'arrêt si elle est en état "stopped". Pour ne payer que quand elle tourne, utiliser l'état **"shelve"** (suspend + libère les ressources) via l'API OVH plutôt que "stop".
- **Coût S3** : surveiller le volume de stockage via le Control Panel OVH. Penser à implémenter une politique de suppression des photos orphelines (photos supprimées en BDD mais clé S3 non supprimée).

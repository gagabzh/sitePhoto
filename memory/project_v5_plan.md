---
name: project-v5-plan
description: V5 implementation plan — 4 tracks: Instance-1 downsize, Nextcloud import, AI learning, user page redesign
metadata:
  type: project
---

# V5 — Plan

## Statut global : 🔲 En cours de planification (2026-05-25)

---

## Tracks

| Track | Sujet | Complexité |
|---|---|---|
| INF-1 | Downsize Instance-1 (b3-8 → b3-4) | Moyenne |
| NC-1 | Import depuis dossier Nextcloud partagé | Haute |
| AI-1 | Apprentissage par tags manuels | Haute |
| FE-1 | Page compte utilisateur (design handoff) | Moyenne |

---

## Track INF-1 — Downsize Instance-1

### Contexte

Instance-1 tourne sur `b3-8` (4 vCPU, 8 GB RAM). La charge réelle (Express + PostgreSQL + Redis + Caddy) tient largement dans `b3-4` (2 vCPU, 4 GB RAM).

Terraform ne supporte pas le resize in-place de `openstack_compute_instance_v2` — un `terraform apply` avec un flavor différent **destroy et recrée** l'instance. Il faut donc migrer les données avant.

### Plan de migration

**INF-1.1 — Backup**
```bash
# Sur Instance-1 (ssh)
pg_dump -U postgres sitephoto > /home/ubuntu/sitephoto_backup_$(date +%Y%m%d).sql
# Copier en local
scp ubuntu@<ip>:/home/ubuntu/sitephoto_backup_*.sql .
```

**INF-1.2 — Snapshot OVH**
Depuis OVH Control Panel ou CLI :
```bash
openstack server image create --name sitephoto-instance1-snapshot instance1
```
Garder le snapshot en backup de secours (supprimable après validation).

**INF-1.3 — Changer le flavor dans Terraform**
```hcl
# infra/terraform.tfvars
instance1_flavor = "b3-4"   # 2 vCPU, 4 GB — à la place de b3-8
```

**INF-1.4 — Apply Terraform**
```bash
cd infra
terraform plan   # vérifier que seul Instance-1 est recréé
terraform apply
```
Terraform recrée Instance-1 avec la nouvelle IP publique.

**INF-1.5 — Restaurer PostgreSQL sur la nouvelle instance**
```bash
# cloud-init a déjà installé Docker + démarré les services
# Copier le backup sur la nouvelle instance
scp sitephoto_backup_*.sql ubuntu@<new_ip>:/home/ubuntu/
# Restaurer dans le conteneur PostgreSQL
docker exec -i sitephoto-db-1 psql -U postgres sitephoto < /home/ubuntu/sitephoto_backup_*.sql
```

**INF-1.6 — Vérifier les variables d'env**
Checklist des variables qui référencent l'IP publique d'Instance-1 :
- `INSTANCE1_API_URL` dans `.env` du worker (Instance-2) → à mettre à jour
- GitHub Actions secrets `INSTANCE1_HOST` → à mettre à jour
- Caddy : HTTPS auto — se réinitialise automatiquement si le domaine DNS est mis à jour

**INF-1.7 — Mise à jour DNS**
Pointer le domaine vers la nouvelle IP publique d'Instance-1.

**INF-1.8 — Déployer les conteneurs**
Le cloud-init redéploie automatiquement depuis GitHub. Sinon :
```bash
ssh ubuntu@<new_ip>
cd /home/ubuntu/sitephoto
git pull origin main
docker compose -f docker-compose.prod.yml up -d
```

**INF-1.9 — Valider et nettoyer**
- Tester le site, l'upload, la file BullMQ, les WebSockets
- Supprimer le snapshot OVH une fois validé

---

## Track NC-1 — Import depuis Nextcloud

### Fonctionnement

L'utilisateur fournit un lien de partage public Nextcloud (ex. `https://nc.example.com/s/AbCdEfGh`).

L'API WebDAV publique de Nextcloud est accessible sans auth sur :
`PROPFIND https://nc.example.com/public.php/webdav/`
Header requis : `Authorization: Basic <token>:` (token = partie après `/s/`, password vide)

### DB — Migration V10

```sql
-- v10.sql
ALTER TABLE photos ADD COLUMN IF NOT EXISTS nextcloud_share_url TEXT;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS nextcloud_share_url TEXT;
```

### Structure de la feature

```
src/
  routes/
    nextcloudImport.js     # POST /photos/import/nextcloud (route Express)
  nextcloudClient.js       # WebDAV PROPFIND + GET (pas de dépendance externe)
  queue/
    producer.js            # addNextcloudImportJob() en plus de l'existant
worker/
  src/
    nextcloud-worker.js    # BullMQ processor 'nextcloud-import'
```

### NC-1.1 — Client WebDAV minimal (`src/nextcloudClient.js`)

```js
'use strict';
// Parse le token depuis l'URL de partage Nextcloud
function parseShareToken(shareUrl) {
  const m = shareUrl.match(/\/s\/([A-Za-z0-9]+)/);
  if (!m) throw new Error('URL de partage Nextcloud invalide');
  return m[1];
}

// PROPFIND → liste les fichiers image du dossier partagé
async function listPhotos(shareUrl) {
  const token = parseShareToken(shareUrl);
  const baseUrl = new URL(shareUrl).origin;
  const webdavUrl = `${baseUrl}/public.php/webdav/`;
  const authHeader = 'Basic ' + Buffer.from(`${token}:`).toString('base64');
  const res = await fetch(webdavUrl, {
    method: 'PROPFIND',
    headers: { Authorization: authHeader, Depth: '1', 'Content-Type': 'application/xml' },
    body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontenttype/><d:getcontentlength/><d:displayname/></d:prop></d:propfind>`,
  });
  if (!res.ok) throw new Error(`WebDAV error: ${res.status}`);
  const xml = await res.text();
  // Parser XML minimal — extraire les href des fichiers image
  const entries = [...xml.matchAll(/<d:href>([^<]+)<\/d:href>/g)].map(m => m[1]);
  const images = entries.filter(href =>
    /\.(jpe?g|png|webp|heic|tiff?)$/i.test(href)
  );
  return { token, baseUrl, webdavUrl, images };
}

// Télécharger un fichier
async function downloadFile(baseUrl, token, href) {
  const url = `${baseUrl}${href}`;
  const authHeader = 'Basic ' + Buffer.from(`${token}:`).toString('base64');
  const res = await fetch(url, { headers: { Authorization: authHeader } });
  if (!res.ok) throw new Error(`Download error: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  return { buffer, contentType };
}

module.exports = { listPhotos, downloadFile };
```

### NC-1.2 — Route (`src/routes/nextcloudImport.js`)

```js
'use strict';
const router = require('express').Router();
const { wrapAsync } = require('../middleware');
const { requireAuth } = require('../permissions');
const { listPhotos } = require('../nextcloudClient');
const { addNextcloudImportJob } = require('../queue/producer');
const { page } = require('../layout');

// Formulaire
router.get('/photos/import/nextcloud', requireAuth, (req, res) => {
  res.send(page('Import Nextcloud', /* HTML form */, req.session));
});

// Lancement de l'import
router.post('/photos/import/nextcloud', requireAuth, wrapAsync(async (req, res) => {
  const { shareUrl, albumName, commonTags, makeAlbum } = req.body;
  const { images, token, baseUrl } = await listPhotos(shareUrl);
  if (images.length === 0) return res.redirect('/photos/import/nextcloud?error=empty');

  await addNextcloudImportJob({
    userId: req.session.userId,
    socketId: req.body.socketId,
    shareUrl,
    token,
    baseUrl,
    imageHrefs: images,
    albumName: makeAlbum ? albumName : null,
    commonTags: commonTags ? commonTags.split(',').map(t => t.trim()) : [],
  });

  res.redirect('/photos?import=pending');
}));

module.exports = router;
```

### NC-1.3 — Job BullMQ (`worker/src/nextcloud-worker.js`)

Processor de la queue `nextcloud-import` :
1. Créer l'album (si demandé), stocker `nextcloud_share_url`
2. Pour chaque image :
   - Télécharger via WebDAV
   - Upload vers S3 (`photos/{userId}/{uuid}/{filename}`)
   - Insérer en DB avec `nextcloud_share_url`
   - Enqueuer un job `identification` standard
3. Notifier l'utilisateur via `postIdentificationResult` (ou un event socket dédié)

### NC-1.4 — UI form

Champs :
- Lien de partage Nextcloud (URL input)
- Tags communs à appliquer à toutes les photos (tag input)
- Lieu commun (optionnel)
- Créer un album ? (checkbox)
- Nom de l'album (si checkbox cochée)

---

## Track AI-1 — Apprentissage par tags manuels

### Principe

Quand un utilisateur identifie manuellement une personne sur une photo (ex. "cette personne c'est Marie") :
1. Sauvegarder le crop du visage (région de la photo) → S3
2. Stocker (nom, s3_key_du_crop, photo source)
3. Lors de futures identifications : injecter les crops connus comme exemples few-shot dans le prompt Ollama

Fine-tuning réel (LLaVA) = phase ultérieure (nécessite dataset ~50+ exemples/personne + GPU).

### DB — Migration V11

```sql
-- v11.sql
CREATE TABLE IF NOT EXISTS person_faces (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_name TEXT    NOT NULL,
  photo_id    INTEGER REFERENCES photos(id) ON DELETE SET NULL,
  bbox        JSONB,          -- { x, y, width, height } en % de l'image
  crop_s3_key TEXT    NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON person_faces(user_id, person_name);
```

### AI-1.1 — Route de tag manuel (`src/routes/photos.js`)

```
POST /photos/:id/tag-person
Body: { personName, bbox: { x, y, width, height } }
```

Backend :
1. Télécharger la photo depuis S3
2. Extraire le crop avec `sharp` (bbox en pixels calculée depuis %)
3. Upload du crop vers S3 (`faces/{userId}/{uuid}.jpg`)
4. Insérer dans `person_faces`

### AI-1.2 — Injection few-shot dans le worker

Dans `worker/src/worker.js`, avant d'appeler Ollama :
```js
// Charger les exemples de visages connus pour cet utilisateur
const knownFaces = await fetchKnownFaces(userId); // GET /internal/known-faces/:userId
// knownFaces = [{ personName, cropBase64 }]
const prompt = buildPromptWithExamples(knownFaces);
```

Endpoint interne `GET /internal/known-faces/:userId` → retourne les crops (base64) des personnes connues de l'utilisateur.

### AI-1.3 — Prompt enrichi

```
Voici des personnes connues :
- Marie : [image_base64]
- Jean : [image_base64]

Identifie les personnes sur cette photo. Si tu reconnais quelqu'un, utilise son prénom.
Retourne une liste JSON : [{ "name": "...", "confidence": 0.0-1.0 }]
```

Limiter à 5 exemples max (contexte Ollama).

### AI-1.4 — UI : interface de tag manuel

Sur la page photo (vue détaillée) :
- Bouton "Tag une personne" → mode sélection de zone (rectangle draggable sur l'image)
- Input texte pour le nom
- Sauvegarde via POST /photos/:id/tag-person
- Liste des personnes déjà taguées sur cette photo

---

## Track FE-1 — Page compte utilisateur

### Référence design

`sitephoto-design/design_handoff_user_personal_page/` — 3 artboards (admin, editor, viewer).
Voir le README pour les specs complètes.

### État actuel

`/account` → route minimale dans `src/routes/account.js` : "Hello X" + lien change-password + lien manage-users.

### Ce qu'il faut construire

**FE-1.1 — Sessions persistantes (prérequis)**

Passer de l'express-session in-memory à `connect-pg-simple` pour stocker les sessions en DB et pouvoir les lister/révoquer.

```bash
npm install connect-pg-simple
```

```sql
-- v10.sql (ou v12.sql selon ordre)
-- Table requise par connect-pg-simple
CREATE TABLE IF NOT EXISTS session (
  sid    TEXT NOT NULL PRIMARY KEY,
  sess   JSONB NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expire_idx ON session(expire);
```

```js
// src/session.js
const pgSession = require('connect-pg-simple')(session);
const db = require('./db');
module.exports = session({
  store: new pgSession({ pool: db.pool, createTableIfMissing: false }),
  // ... reste inchangé
});
```

Ajouter `user_id` dans le session store pour pouvoir filtrer les sessions d'un utilisateur.

**FE-1.2 — Endpoints API `/account`**

```
GET  /api/me/stats           → { uploads, albumsMade, favourites, comments, recipes }
GET  /api/me/sessions        → liste des sessions actives { sid, browser, device, lastSeenAt, isCurrent }
DELETE /api/me/sessions/:sid → révoquer une session
DELETE /api/me/sessions      → révoquer toutes les autres sessions

PATCH /account               → { displayName, email, language, theme, notifications }
POST  /account/avatar        → multipart, image → redimensionner (sharp) + sauver S3

GET  /api/me/uploads         → dernières 6 photos uploadées
GET  /api/me/favourites      → dernières 8 photos favorites (viewer)
GET  /api/me/activity        → 14 derniers jours d'actions (viewer)
GET  /api/me/albums          → albums de l'utilisateur
GET  /api/me/recipes         → recettes de tags de l'utilisateur
```

**FE-1.3 — Route principale `GET /account`**

Une seule route, collecte toutes les données en parallèle (Promise.all), rend le template conditionnel par rôle.

```js
router.get('/', requireAuth, wrapAsync(async (req, res) => {
  const role = req.session.role;
  const [stats, sessions, details, ...roleData] = await Promise.all([
    getStats(req.session.userId),
    getSessions(req.session.userId, req.sessionID),
    getUserDetails(req.session.userId),
    ...(role !== 'viewer'
      ? [getRecentUploads(req.session.userId), getAlbums(req.session.userId), getRecipes(req.session.userId)]
      : [getFavourites(req.session.userId), getActivity(req.session.userId), getRecipes(req.session.userId)]
    ),
  ]);
  res.send(renderAccountPage({ role, stats, sessions, details, ...parseRoleData(role, roleData) }, req.session));
}));
```

**FE-1.4 — Template HTML**

Reproduire le design handoff en HTML/CSS server-rendered (pas de JS framework) :
- Un seul template `src/layout/account.js` (ou inline dans la route)
- Cards conditionnelles par rôle
- Tokens CSS déjà présents dans le stylesheet existant
- Ajout des composants manquants : `.d1-head`, `.d1-avatar`, `.d1-stats`, `.perm-strip`, `.role-badge`, `.tool-tile`, `.recipe-row`, `.field-row`

**FE-1.5 — Inline editing**

JS côté client léger (vanilla) : click sur une `.field-row` → remplace le `.v` par un `<input>`, PATCH vers `/account` au blur/enter.

**FE-1.6 — Danger zone**

Modal de confirmation (2 étapes) pour :
- Supprimer son compte (DELETE /account)
- Déconnexion totale (DELETE /api/me/sessions)

---

## Ordre d'implémentation recommandé

1. 🔲 **INF-1** — Downsize Instance-1 (faire en premier, avant tout nouveau dev)
2. 🔲 **FE-1.1** — Sessions persistantes (prérequis pour FE-1)
3. 🔲 **FE-1.2 + FE-1.3 + FE-1.4** — Page compte (visible tôt, valeur immédiate)
4. 🔲 **FE-1.5 + FE-1.6** — Inline editing + danger zone
5. 🔲 **NC-1** — Import Nextcloud (feature standalone)
6. 🔲 **AI-1.1 + AI-1.2** — Tag manuel + injection few-shot
7. 🔲 **AI-1.3 + AI-1.4** — UI tag manuel

---

## Migrations DB V5

| Version | Contenu |
|---|---|
| v10.sql | `nextcloud_share_url` sur photos + albums ; table `session` pour connect-pg-simple |
| v11.sql | Table `person_faces` |

---

## Points de vigilance

- **INF-1** : Terraform détruit et recrée Instance-1 → **backup DB obligatoire avant `terraform apply`**. L'IP publique change → mettre à jour DNS + GitHub secrets + `.env` worker.
- **NC-1** : Le PROPFIND Nextcloud retourne aussi le dossier racine lui-même (premier `href`) — le filtrer. Limiter le nombre de photos par import (ex. max 200) pour éviter les timeouts.
- **AI-1** : Les crops de visages peuvent contenir des données biométriques sensibles — ne pas les exposer publiquement via S3 (bucket privé, accès signé seulement).
- **FE-1** : `connect-pg-simple` requiert que `sess` contienne `user_id` pour filtrer par utilisateur — ajouter `req.session.userId` dans la session dès la connexion (déjà fait ?) et créer un index DB.

**Why:** V5 plan — 4 tracks identifiés lors de la session de planification du 2026-05-25.
**How to apply:** Implémenter dans l'ordre recommandé, un track à la fois, chacun sur sa branche feature.

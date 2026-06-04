# SitePhoto API Documentation

This document describes the REST API endpoints for SitePhoto.

## Base URL

- Production: `https://your-domain.com`
- Local development: `http://localhost:3000`

## Authentication

All API endpoints that require authentication use session-based cookies. Routes that require specific roles use the following middleware:

- `requireAuth`: Any logged-in user (viewer, editor, admin)
- `requireEditor`: Editor or admin only
- `requireAdmin`: Admin only

### Session Management

- **Login**: `POST /login` (form: email, password)
- **Logout**: `POST /logout`
- **Session cookie**: `connect.sid` (httpOnly, secure, sameSite=lax)

## Error Responses

All endpoints return JSON error responses in the format:

```json
{
  "error": "Error message"
}
```

Common HTTP status codes:
- `400` Bad Request - Invalid input
- `401` Unauthorized - Not logged in
- `403` Forbidden - Insufficient permissions
- `404` Not Found - Resource doesn't exist
- `409` Conflict - Resource already exists
- `500` Internal Server Error

---

## Public Routes

### GET /health

Health check endpoint.

**Response**: `200 OK`

```json
{ "status": "ok" }
```

---

## Authentication Routes

### POST /login

Authenticate and create a session.

**Request**:
```json
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

**Response**: `302 Redirect` to `/` (or previous page)

**Headers**: Sets `connect.sid` cookie

---

### POST /logout

Destroy the current session.

**Response**: `302 Redirect` to `/login`

**Headers**: Clears `connect.sid` cookie

---

## User Routes

### GET /api/me

Get current user information.

**Auth**: requireAuth

**Response**: `200 OK`

```json
{
  "id": 1,
  "email": "user@example.com",
  "displayName": "User Name",
  "role": "editor",
  "avatarUrl": "/uploads/avatar-uuid.jpg",
  "notifEnabled": true,
  "theme": "light",
  "language": "en"
}
```

---

### PATCH /account

Update current user profile.

**Auth**: requireAuth

**Request**:
```json
{
  "displayName": "New Name",
  "email": "new@email.com",
  "theme": "dark",
  "language": "fr",
  "notifEnabled": false
}
```

**Response**: `200 OK`

```json
{ "ok": true }
```

**Notes**:
- Email must be unique (409 Conflict if taken)
- Display name: 1-100 characters
- Name validation error: "Name must be 1–100 characters"

---

### POST /account/avatar

Upload a new avatar image.

**Auth**: requireAuth

**Content-Type**: `multipart/form-data`

**Request**:
```
avatar: <image file>
```

**Response**: `200 OK`

```json
{
  "ok": true,
  "avatarUrl": "/uploads/avatar-uuid.jpg"
}
```

**Processing**:
- Image resized with sharp
- Stored in S3
- Old avatar automatically deleted

---

### DELETE /account/avatar

Remove current avatar.

**Auth**: requireAuth

**Response**: `200 OK`

```json
{ "ok": true }
```

---

## Session Management Routes

### GET /api/me/sessions

List all active sessions for the current user.

**Auth**: requireAuth

**Response**: `200 OK`

```json
{
  "sessions": [
    {
      "sid": "session-id-1",
      "browser": "Chrome",
      "device": "MacBook Pro",
      "lastSeenAt": "2026-06-04T10:00:00Z",
      "isCurrent": true,
      "ip": "192.168.1.1"
    },
    {
      "sid": "session-id-2",
      "browser": "Safari",
      "device": "iPhone",
      "lastSeenAt": "2026-06-03T08:00:00Z",
      "isCurrent": false,
      "ip": "192.168.1.2"
    }
  ]
}
```

---

### DELETE /api/me/sessions/:sid

Revoke a specific session.

**Auth**: requireAuth

**URL Parameters**:
- `sid`: Session ID to revoke

**Response**: `200 OK`

```json
{ "ok": true, "revoked": "session-id-1" }
```

**Notes**:
- Cannot revoke current session (returns 400)
- If revoking current session: redirects to `/login`

---

### DELETE /api/me/sessions

Revoke all other sessions (except current).

**Auth**: requireAuth

**Response**: `200 OK`

```json
{ "ok": true, "revokedCount": 2 }
```

---

## Stats Routes

### GET /api/me/stats

Get user statistics.

**Auth**: requireAuth

**Response**: `200 OK`

```json
{
  "uploads": 150,
  "albumsMade": 12,
  "favourites": 45,
  "comments": 23,
  "recipes": 8
}
```

---

### GET /api/me/uploads

Get recent uploads by current user.

**Auth**: requireAuth

**Response**: `200 OK`

```json
{
  "photos": [
    {
      "id": 1,
      "filename": "photo-uuid.jpg",
      "originalFilename": "My Photo.jpg",
      "uploadedAt": "2026-06-04T10:00:00Z",
      "tags": ["vacation", "beach"]
    }
  ]
}
```

---

## Photo Routes

### GET /api/photos

List photos (with filtering).

**Auth**: requireAuth

**Query Parameters**:
- `albumId`: Filter by album ID
- `tag`: Filter by tag name
- `limit`: Number of results (default: 50)
- `offset`: Pagination offset (default: 0)

**Response**: `200 OK`

```json
{
  "photos": [
    {
      "id": 1,
      "filename": "photo-uuid.jpg",
      "thumbnailUrl": "/uploads/photo-uuid.thumb.jpg",
      "width": 1920,
      "height": 1080,
      "tags": ["vacation", "beach"],
      "dateTaken": "2026-06-04T10:00:00Z",
      "location": { "lat": 48.8566, "lon": 2.3522 }
    }
  ],
  "total": 150
}
```

---

### POST /photos

Upload a new photo.

**Auth**: requireEditor

**Content-Type**: `multipart/form-data`

**Request**:
```
photo: <image file>
tags: "vacation,beach" (optional)
albumId: 123 (optional)
```

**Response**: `201 Created`

```json
{
  "ok": true,
  "photo": {
    "id": 1,
    "filename": "photo-uuid.jpg",
    "thumbnailUrl": "/uploads/photo-uuid.thumb.jpg"
  },
  "message": "Photo uploaded. Identification in progress..."
}
```

**Notes**:
- Returns immediately
- AI identification runs asynchronously via BullMQ
- Client receives real-time notification via Socket.io when complete

---

### GET /photos/:id

Get photo details.

**Auth**: requireAuth (viewer can view if they have access)

**URL Parameters**:
- `id`: Photo ID

**Response**: `200 OK`

```json
{
  "id": 1,
  "filename": "photo-uuid.jpg",
  "originalFilename": "My Photo.jpg",
  "uploadedAt": "2026-06-04T10:00:00Z",
  "dateTaken": "2026-06-04T10:00:00Z",
  "width": 1920,
  "height": 1080,
  "size": 1234567,
  "mimeType": "image/jpeg",
  "tags": ["vacation", "beach"],
  "location": { "lat": 48.8566, "lon": 2.3522 },
  "albums": [
    { "id": 1, "name": "Summer 2026" },
    { "id": 2, "name": "Beach Trip" }
  ],
  "suggestedTags": ["person", "ocean"],
  "identificationStatus": "completed",
  "url": "/uploads/photo-uuid.jpg"
}
```

---

### PATCH /photos/:id

Update photo metadata.

**Auth**: requireEditor (or photo owner)

**URL Parameters**:
- `id`: Photo ID

**Request**:
```json
{
  "tags": ["vacation", "beach", "summer"],
  "dateTaken": "2026-06-04T10:00:00Z",
  "location": { "lat": 48.8566, "lon": 2.3522 },
  "title": "My Beach Photo"
}
```

**Response**: `200 OK`

```json
{ "ok": true }
```

---

### DELETE /photos/:id

Delete a photo.

**Auth**: requireEditor (or photo owner)

**URL Parameters**:
- `id`: Photo ID

**Response**: `200 OK`

```json
{ "ok": true }
```

**Notes**:
- Also deletes from S3
- Also deletes from all albums
- Rolls back on error (transactional)

---

### POST /photos/:id/tag-person

Manually tag a person in a photo.

**Auth**: requireAuth

**URL Parameters**:
- `id`: Photo ID

**Request**:
```json
{
  "personName": "Marie",
  "bbox": { "x": 0.25, "y": 0.3, "width": 0.2, "height": 0.3 }
}
```

**Response**: `200 OK`

```json
{ "ok": true }
```

**Notes**:
- Extracts face crop using sharp
- Uploads crop to S3 (`faces/{userId}/{uuid}.jpg`)
- Stores in `person_faces` table
- Used for few-shot learning in AI identification

---

## Album Routes

### GET /api/albums

List albums accessible to current user.

**Auth**: requireAuth

**Response**: `200 OK`

```json
{
  "albums": [
    {
      "id": 1,
      "name": "Summer 2026",
      "description": "Photos from summer vacation",
      "createdAt": "2026-06-01T10:00:00Z",
      "photoCount": 45,
      "isOwner": true,
      "accessLevel": "admin"
    }
  ]
}
```

---

### POST /albums

Create a new album.

**Auth**: requireEditor

**Request**:
```json
{
  "name": "Summer 2026",
  "description": "Photos from summer vacation"
}
```

**Response**: `201 Created`

```json
{
  "ok": true,
  "album": {
    "id": 1,
    "name": "Summer 2026",
    "slug": "summer-2026"
  }
}
```

---

### POST /albums/from-recipe

Create a snapshot album from a tag recipe.

**Auth**: requireEditor

**Request**:
```json
{
  "recipeId": 1,
  "albumName": "Recipe Results"
}
```

**Response**: `201 Created`

```json
{
  "ok": true,
  "album": {
    "id": 1,
    "name": "Recipe Results",
    "photoCount": 23
  }
}
```

---

### GET /albums/:id

Get album details and photos.

**Auth**: requireAuth (viewer must have access)

**URL Parameters**:
- `id`: Album ID

**Response**: `200 OK`

```json
{
  "id": 1,
  "name": "Summer 2026",
  "description": "Photos from summer vacation",
  "createdAt": "2026-06-01T10:00:00Z",
  "isOwner": true,
  "photos": [
    {
      "id": 1,
      "filename": "photo-uuid.jpg",
      "thumbnailUrl": "/uploads/photo-uuid.thumb.jpg"
    }
  ],
  "viewers": [
    { "id": 2, "email": "viewer@example.com", "displayName": "Viewer" }
  ]
}
```

---

### PATCH /albums/:id

Update album metadata.

**Auth**: requireEditor (album owner)

**URL Parameters**:
- `id`: Album ID

**Request**:
```json
{
  "name": "Summer 2026 - Updated",
  "description": "Updated description"
}
```

**Response**: `200 OK`

```json
{ "ok": true }
```

---

### DELETE /albums/:id

Delete an album.

**Auth**: requireEditor (album owner)

**URL Parameters**:
- `id`: Album ID

**Response**: `200 OK`

```json
{ "ok": true }
```

---

## Tag Routes

### GET /api/tags

List all tags.

**Auth**: requireAuth

**Response**: `200 OK`

```json
{
  "tags": [
    { "name": "vacation", "photoCount": 45, "albumCount": 5 },
    { "name": "beach", "photoCount": 32, "albumCount": 3 }
  ]
}
```

---

### GET /tags/autocomplete

Get tag suggestions for autocomplete.

**Auth**: requireAuth

**Query Parameters**:
- `q`: Search query
- `limit`: Max results (default: 10)

**Response**: `200 OK`

```json
{
  "tags": [
    { "name": "vacation" },
    { "name": "beach" },
    { "name": "summer" }
  ]
}
```

---

## Internal API Routes

These routes are used for inter-service communication and are authenticated with a shared secret.

### POST /internal/identification-result

Worker posts identification results back to main app.

**Auth**: Worker secret (`x-worker-secret` header)

**Request**:
```json
{
  "photoId": 1,
  "userId": 1,
  "tags": ["person", "beach"]
}
```

**Response**: `200 OK`

```json
{ "ok": true }
```

---

### POST /internal/describe-person-result

Worker posts person description results.

**Auth**: Worker secret (`x-worker-secret` header)

**Request**:
```json
{
  "tagId": 1,
  "userId": 1,
  "description": "Person at the beach",
  "error": null
}
```

**Response**: `200 OK`

```json
{ "ok": true }
```

---

### GET /internal/known-faces/:userId

Get known face crops for a user (for few-shot learning).

**Auth**: Worker secret (`x-worker-secret` header)

**URL Parameters**:
- `userId`: User ID

**Response**: `200 OK`

```json
{
  "faces": [
    {
      "personName": "Marie",
      "cropBase64": "base64-encoded-image-data"
    },
    {
      "personName": "Jean",
      "cropBase64": "base64-encoded-image-data"
    }
  ]
}
```

**Notes**:
- Returns up to 5 faces (Ollama context limit)
- Used for few-shot injection in AI prompts

---

## Admin Routes

### GET /api/admin/stats

Get global statistics (admin only).

**Auth**: requireAdmin

**Response**: `200 OK`

```json
{
  "totalUsers": 5,
  "totalPhotos": 500,
  "totalAlbums": 25,
  "totalTags": 150,
  "storageUsedGB": 2.5
}
```

---

### GET /api/admin/users

List all users (admin only).

**Auth**: requireAdmin

**Response**: `200 OK`

```json
{
  "users": [
    {
      "id": 1,
      "email": "admin@example.com",
      "displayName": "Admin",
      "role": "admin",
      "createdAt": "2026-01-01T10:00:00Z"
    }
  ]
}
```

---

## Nextcloud Routes

### POST /photos/import/nextcloud

Import photos from a Nextcloud shared folder.

**Auth**: requireAuth

**Request**:
```json
{
  "shareUrl": "https://nextcloud.example.com/s/AbCdEfGh",
  "albumName": "Nextcloud Import",
  "commonTags": "import,nextcloud",
  "makeAlbum": true
}
```

**Response**: `302 Redirect` to `/photos?import=pending`

**Notes**:
- Creates a BullMQ job for async import
- Progress tracked via Socket.io
- Max 200 photos per import (prevents timeouts)

---

### GET /photos/import/nextcloud

Show Nextcloud import form.

**Auth**: requireAuth

**Response**: HTML page with import form

---

## Travel Routes

### GET /api/travels

List all travels.

**Auth**: requireAuth

**Response**: `200 OK`

```json
{
  "travels": [
    {
      "id": 1,
      "slug": "summer-2026",
      "name": "Summer Road Trip",
      "description": "Driving through France",
      "linkedPhotos": 45,
      "linkedAlbums": 5
    }
  ]
}
```

---

### POST /travels

Create a new travel.

**Auth**: requireEditor

**Request**:
```json
{
  "name": "Summer Road Trip",
  "description": "Driving through France",
  "slug": "summer-2026"
}
```

**Response**: `201 Created`

```json
{
  "ok": true,
  "travel": {
    "id": 1,
    "slug": "summer-2026"
  }
}
```

---

## WebSocket Events

SitePhoto uses Socket.io for real-time notifications.

### Connection

```javascript
const socket = io();
```

### Events

#### `identification-complete`

Fired when AI identification completes for a photo.

**Payload**:
```json
{
  "photoId": 1,
  "tags": ["person", "beach"]
}
```

#### `describe-person-complete`

Fired when person description completes.

**Payload**:
```json
{
  "tagId": 1,
  "description": "Person at the beach",
  "error": null
}
```

#### `nextcloud-import-progress`

Fired during Nextcloud import with progress updates.

**Payload**:
```json
{
  "progress": 45,
  "total": 200,
  "currentFile": "photo5.jpg"
}
```

---

## Rate Limiting

The following rate limits are in place:

- **Global**: 300 requests/minute per IP
- **Auth (login)**: 10 requests/15 minutes per IP
- **Auth success**: Not counted (skipSuccessfulRequests: true)
- **Uploads**: 200 requests/minute per IP

---

## Versioning

The current API version is **v1**. All routes are prefixed with their functional area (no version prefix in URL).

Backward compatibility is maintained where possible. Breaking changes will be documented in CHANGELOG.md.

# BUG-8 Clarification — Nextcloud Import EXIF Metadata

**Status:** Clarification for Planner & Developer  
**Related:** BUG-8 (Nextcloud import photos missing EXIF metadata)  
**Date:** 2026-06-11  

---

## Context

BUG-8 identifies that photos imported via Nextcloud (US-NC4) do not have EXIF metadata extracted and stored. Direct uploads (IMP-1) correctly extract and store EXIF data. This document clarifies the planner's assumptions and confirms their validity against the current codebase.

---

## Assumptions Analysis

### Assumption 1: EXIF Fields to Extract

**Assumption:** `date_taken, exposure_time, focal_length, latitude, longitude`

**✅ CONFIRMED**

- Database schema (`init-db.sql` lines 38-42) contains all five fields:
  - `taken_at DATE` (note: actual column name is `taken_at`, not `date_taken`)
  - `exposure_time TEXT`
  - `focal_length NUMERIC(8,2)`
  - `latitude NUMERIC(10,7)`
  - `longitude NUMERIC(10,7)`
- `src/extractMetadata.js` already extracts all five fields from EXIF data using the `exifr` library
- Direct uploads (IMP-1) store these fields correctly via `insertPhoto()` in `src/repositories/photos.js`

**Action:** Use existing column names. The code uses `taken_at` (snake_case), not `date_taken`.

---

### Assumption 2: Error Handling Strategy

**Assumption:** If EXIF extraction fails for a single file, continue import and log error (don't fail entire batch)

**⚠️ REQUIRES IMPLEMENTATION WORK**

**Current State:**
- `extractMetadata()` in `src/extractMetadata.js` (lines 28-29): Catches errors and returns `{}`, preventing crashes
- Nextcloud import worker (`worker/src/worker.js` lines 165-192): Wraps ENTIRE job in try-catch; any error fails the job
- Identification worker (lines 38-42): Shows correct pattern for graceful failure:
  ```javascript
  try {
    knownFaces = await fetchKnownFaces(userId);
  } catch (err) {
    console.warn('[worker] known-faces fetch failed, proceeding without:', err.message);
  }
  ```

**Gap:** EXIF extraction in Nextcloud import is not individually error-handled. A single corrupt file would fail the entire batch.

**Required:** Wrap EXIF extraction in its own try-catch block to continue on failure:
```javascript
let exif = {};
try {
  exif = await extractMetadata(buffer);
} catch (err) {
  console.warn(`[worker] EXIF extraction failed for ${fileName}, continuing without:`, err.message);
}
```

---

### Assumption 3: Library Availability

**Assumption:** Use existing `exifr` library (already in package.json)

**✅ CONFIRMED**

- `package.json` includes: `"exifr": "^7.1.3"`
- `src/extractMetadata.js` successfully uses `exifr` for all direct uploads
- Library is already available to the worker (Instance-2 has access to node_modules)

**Action:** Worker can either:
- **Option A (Recommended):** Import and reuse the existing `extractMetadata` function
- **Option B:** Call `exifr.parse()` and `exifr.gps()` directly

---

### Assumption 4: Processing Location

**Assumption:** Worker (Instance-2) already processes photos — EXIF extraction happens there

**❌ INCORRECT** (but should)

**Current Reality:**
- **Instance-1 (Direct uploads):** EXIF extraction happens in `src/routes/photos.js` line 147: `extractMetadata(req.file.buffer)`
- **Instance-2 (Nextcloud import):** Worker downloads file (line 167 in `worker/src/worker.js`) but does NOT extract EXIF
- The buffer is available but EXIF extraction is never called

**Root Cause:** The Nextcloud import flow skips the EXIF extraction step entirely. The worker:
1. Downloads file from Nextcloud → buffer available ✅
2. Uploads to S3 ✅
3. Calls `insertImportedPhoto()` ❌ (no EXIF data passed)

**Required Change:** Add EXIF extraction in the worker after downloading the file buffer, before uploading to S3 or calling `insertImportedPhoto()`.

---

## Implementation Requirements

### Files to Modify

| File | Change | Effort |
|------|--------|--------|
| `worker/src/worker.js` | Add EXIF extraction with error handling in Nextcloud import worker | M |
| `worker/src/instance1-api.js` | Update `insertImportedPhoto()` to accept EXIF fields | S |
| `src/routes/internal.js` | Update `/internal/nextcloud-photo` endpoint to accept and store EXIF fields | S |
| `src/repositories/photos.js` | Ensure `insertPhoto` or new function handles EXIF for Nextcloud imports | S |

### Code Changes

#### 1. Worker — Extract EXIF (worker/src/worker.js)

```javascript
// NC-4: nextcloud-import queue
const ncWorker = new Worker('nextcloud-import', async (job) => {
  const { shareUrl, fileName, mimeType, userId, tags, latitude, longitude, albumId, importId } = job.data;
  
  let succeeded = false;
  try {
    // Step a: download from Nextcloud
    const buffer = await downloadNextcloudFile(shareUrl, fileName);

    // Step b NEW: extract EXIF metadata
    const { extractMetadata } = require('../src/extractMetadata');  // or require('exifr') directly
    let exif = {};
    try {
      exif = await extractMetadata(buffer);
    } catch (err) {
      console.warn(`[worker] EXIF extraction failed for ${fileName}, continuing without:`, err.message);
    }

    // Step c: generate S3 key
    const ext = EXT_MAP[mimeType] || '.jpg';
    const s3Key = `${uuidv4()}${ext}`;

    // Step d: upload to S3
    await uploadPhoto(s3Key, buffer, mimeType);

    // Step e: insert photo with EXIF data
    const { photoId } = await insertImportedPhoto({
      userId, s3Key, fileName, mimeType, shareUrl,
      // NEW: EXIF fields
      takenAt: exif.takenAt?.toISOString().split('T')[0] || null,
      exposureTime: exif.exposureTime || null,
      focalLength: exif.focalLength || null,
      latitude: exif.latitude ?? latitude,  // Use EXIF GPS if available, else fallback to user-provided
      longitude: exif.longitude ?? longitude,
      albumId, tags, importId,
    });

    // ... rest of existing code
    succeeded = true;
  } catch (err) {
    console.error(`[worker] nc-import job ${job.id} file "${fileName}" failed:`, err.message);
    succeeded = false;
  }
  
  await postNextcloudImportProgress({ userId, importId, succeeded });
}, { connection });
```

#### 2. Internal API — Accept EXIF Fields (src/routes/internal.js)

```javascript
// POST /internal/nextcloud-photo
router.post('/nextcloud-photo', requireWorkerSecret, wrapAsync(async (req, res) => {
  const { userId, s3Key, fileName, mimeType, shareUrl, 
          latitude, longitude, takenAt, exposureTime, focalLength, 
          albumId, tags } = req.body;
  
  if (!userId || !s3Key) {
    return res.status(400).json({ error: 'Missing userId or s3Key' });
  }

  // Use EXIF GPS if provided, else fallback to user-provided
  const lat = Number.isFinite(Number(latitude)) ? Number(latitude) : null;
  const lon = Number.isFinite(Number(longitude)) ? Number(longitude) : null;
  const resolvedLat = (exifLatitude != null && Number.isFinite(exifLatitude)) ? exifLatitude : lat;
  const resolvedLon = (exifLongitude != null && Number.isFinite(exifLongitude)) ? exifLongitude : lon;

  const displayName = fileName || s3Key;
  const ncUrl = shareUrl ? String(shareUrl) : null;
  
  const { rows: [photo] } = await db.query(
    `INSERT INTO photos (user_id, filename, original_filename, s3_key, title, mime_type, size, 
                         nextcloud_url, taken_at, exposure_time, focal_length, latitude, longitude, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, $10, $11, $12, NOW())
     RETURNING id`,
    [userId, s3Key, displayName, s3Key, displayName, mimeType || 'image/jpeg', 
     ncUrl, takenAt, exposureTime, focalLength, resolvedLat, resolvedLon],
  );
  
  // ... rest of existing code (album membership, tags)
  res.json({ photoId });
}));
```

---

## Testing Strategy

### Test Scenarios

1. **Happy Path:** Photo with complete EXIF metadata imports successfully, all fields stored
2. **Partial EXIF:** Photo with only some EXIF fields (e.g., date but no GPS) — missing fields should be NULL
3. **No EXIF:** Photo with no EXIF metadata — should import successfully with NULL metadata fields
4. **Corrupt EXIF:** Photo with corrupt/malformed EXIF data — should log warning, import with NULL metadata, NOT fail entire batch
5. **GPS Priority:** Photo with both EXIF GPS and user-provided lat/long — EXIF should take priority
6. **Batch Test:** Import multiple photos where some have EXIF and some don't — all should import successfully

### Test Data Needed

- Photo with full EXIF (DateTimeOriginal, ExposureTime, FocalLength, GPS)
- Photo with partial EXIF (some fields missing)
- Photo with no EXIF metadata
- Photo with corrupt EXIF header
- Multiple photos for batch testing

---

## Blockers & Dependencies

| Blocker | Status | Owner |
|--------|--------|-------|
| EXIF extraction not in worker | ❌ Open | Developer |
| Internal API doesn't accept EXIF fields | ❌ Open | Developer |
| Database INSERT doesn't include EXIF for Nextcloud | ❌ Open | Developer |
| Test coverage for new paths | ⚠️ Pending | QA |

**Dependencies:** None — this is a self-contained fix. The `exifr` library is already available.

---

## Success Criteria

- [ ] Nextcloud-imported photos have `taken_at`, `exposure_time`, `focal_length` populated when EXIF data exists
- [ ] GPS coordinates from EXIF are stored in `latitude` and `longitude` columns
- [ ] Single file EXIF extraction failure does not stop batch import
- [ ] All errors are logged with file name for debugging
- [ ] Existing direct upload EXIF extraction continues to work
- [ ] Test coverage added for new code paths

---

## Related Items

- **BUG-8:** Nextcloud import photos missing EXIF metadata (Backlog)
- **US-NC4:** Import a Nextcloud shared folder (Done)
- **US-NC5:** Import progress feedback (Done)
- **IMP-1:** Date taken from EXIF (Done) — reference implementation
- **extractMetadata.js:** Existing EXIF extraction utility

---

## Questions for PO

1. Should EXIF GPS coordinates override user-provided latitude/longitude for Nextcloud imports? (Recommended: Yes, EXIF takes priority)
2. Should the import progress banner show EXIF extraction progress separately? (Recommended: No, it's fast enough to be included in existing progress)
3. Should there be a user-facing notification when EXIF extraction fails for a file? (Recommended: No, log only — too noisy for users)

---

## Next Steps

1. **Planner:** Confirm assumptions and priorities with PO
2. **Developer:** Implement EXIF extraction in worker with error handling
3. **Developer:** Update internal API to accept and store EXIF fields
4. **QA:** Create test cases for EXIF extraction in Nextcloud import
5. **Developer:** Add unit tests for new error handling paths

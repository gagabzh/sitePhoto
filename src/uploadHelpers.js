'use strict';

const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const db = require('./db');
const { uploadPhoto, deletePhoto } = require('./storage');
const { optimizeBuffer } = require('./imageOptimizer');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

// Extension derived from MIME type — prevents stored XSS via .html uploads
const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };

// Memory storage: file lands in req.file.buffer, never touches disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, Object.hasOwn(MIME_EXT, file.mimetype)),
});

// Accepts decimal degrees or DMS ("48°51′21″N")
function parseCoord(raw, min, max) {
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw).trim();
  const dms = s.match(/^(\d+)[°d]\s*(\d+)['′]\s*([\d.]+)["″]?\s*([NSEWnsew])$/);
  if (dms) {
    const deg = parseFloat(dms[1]);
    const min_ = parseFloat(dms[2]);
    const sec = parseFloat(dms[3]);
    const dir = dms[4].toUpperCase();
    const val = (deg + min_ / 60 + sec / 3600) * (/[SW]/.test(dir) ? -1 : 1);
    if (isNaN(val) || val < min || val > max) return null;
    return Math.round(val * 1e7) / 1e7;
  }
  const val = parseFloat(s);
  if (isNaN(val) || val < min || val > max) return null;
  return val;
}

function sanitizeNextcloudUrl(raw) {
  if (!raw) return null;
  if (typeof raw !== 'string') return null;
  
  try {
    const u = new URL(raw);
    
    // Step 1: Must be HTTPS
    if (u.protocol !== 'https:') return null;
    
    // Step 2: Must contain valid Nextcloud share token pattern
    // Pattern: /s/{token} where token is at least 1 non-slash character
    const shareTokenRegex = /\/s\/[^/]+/;
    if (!shareTokenRegex.test(u.pathname)) return null;
    
    // Step 3: Return the sanitized URL
    return raw;
  } catch { return null; }
}

// US-NC7: Transform Nextcloud share URL to folder URL
// For folder shares: https://cloud.example.com/s/token/ -> https://cloud.example.com/s/token
// For file shares: https://cloud.example.com/s/token/file.jpg -> https://cloud.example.com/s/token
// Returns the base share URL (folder view) or null if invalid
function nextcloudFolderUrl(shareUrl) {
  if (!shareUrl) return null;
  
  // First validate the URL
  const sanitized = sanitizeNextcloudUrl(shareUrl);
  if (!sanitized) return null;
  
  try {
    const url = new URL(sanitized);
    const pathname = url.pathname;
    
    // Extract the base path up to and including the share token
    // Pattern: /s/{token} or /s/{token}/... or /s/{token}/file.ext
    const match = pathname.match(/(\/s\/[^/]+)/);
    if (!match) return null;
    
    // Return the URL with just the base share path
    return `${url.protocol}//${url.host}${match[1]}`;
  } catch {
    return null;
  }
}

async function setTags(photoId, rawTags) {
  await db.query('DELETE FROM photo_tags WHERE photo_id = $1', [photoId]);
  const names = String(rawTags).split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  if (!names.length) return;
  const { rows: tagRows } = await db.query(
    'INSERT INTO tags (name) SELECT unnest($1::text[]) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
    [names]
  );
  await db.query(
    'INSERT INTO photo_tags (photo_id, tag_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING',
    [photoId, tagRows.map(r => r.id)]
  );
}

// Shared GPS + Nextcloud fields for single-photo upload forms
function singleUploadFields() {
  return `
    <label>Location <small>(optional — EXIF GPS from the photo takes priority if present)</small>
      <div class="tag-ac-wrap loc-search-wrap">
        <input type="text" class="loc-search-input" placeholder="Search a place…" autocomplete="off">
        <button type="button" class="loc-clear-btn" style="display:none">× clear</button>
      </div>
      <input type="hidden" name="latitude">
      <input type="hidden" name="longitude">
    </label>
    <label>Nextcloud link <small>(optional — https:// share link for original download)</small>
      <input type="url" name="nextcloud_url" placeholder="https://cloud.example/s/…">
    </label>`;
}

// Shared Tags + GPS fields for batch upload forms
function batchUploadFields() {
  return `
    <label>Tags for all <small>(optional, comma-separated — e.g. Paris, 2024)</small>
      <input type="text" name="tags" placeholder="Paris, 2024">
    </label>
    <label>Location for all <small>(optional — applied to photos without EXIF GPS)</small>
      <div class="tag-ac-wrap loc-search-wrap">
        <input type="text" class="loc-search-input" placeholder="Search a place…" autocomplete="off">
        <button type="button" class="loc-clear-btn" style="display:none">× clear</button>
      </div>
      <input type="hidden" name="latitude">
      <input type="hidden" name="longitude">
    </label>`;
}

// Optimise a multer memory-storage file and upload it to S3.
// Returns { filename, size } where filename is also the S3 key.
async function processAndUpload(file) {
  const ext = MIME_EXT[file.mimetype] || '.bin';
  const filename = uuidv4() + ext;
  const optimized = await optimizeBuffer(file.buffer, file.mimetype);
  await uploadPhoto(filename, optimized, file.mimetype);
  return { filename, size: optimized.length };
}

// Delete photos from DB and remove their files.
// s3_key IS NOT NULL  → V4 upload stored in S3
// s3_key IS NULL      → legacy upload stored on local disk
async function deletePhotos(ids) {
  if (!ids.length) return;
  const { rows } = await db.query(
    'SELECT filename, s3_key FROM photos WHERE id = ANY($1::int[])',
    [ids]
  );
  await db.query('DELETE FROM photos WHERE id = ANY($1::int[])', [ids]);
  for (const p of rows) {
    if (p.s3_key) {
      deletePhoto(p.s3_key).catch(err => {
        console.warn(`deletePhotos: S3 delete failed for ${p.s3_key}: ${err.message}`);
      });
    } else {
      fs.promises.unlink(path.join(UPLOAD_DIR, p.filename)).catch(err => {
        console.warn(`deletePhotos: disk delete failed for ${p.filename}: ${err.code || err.message}`);
      });
    }
  }
}

module.exports = {
  UPLOAD_DIR, upload, parseCoord, sanitizeNextcloudUrl, nextcloudFolderUrl,
  setTags, singleUploadFields, batchUploadFields,
  processAndUpload, deletePhotos,
};

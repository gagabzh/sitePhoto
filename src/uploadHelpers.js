'use strict';

const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const db = require('./db');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

// Extension derived from MIME type — prevents stored XSS via .html uploads
const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + (MIME_EXT[file.mimetype] || '.bin')),
});

const upload = multer({
  storage,
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
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' ? raw : null;
  } catch { return null; }
}

async function setTags(photoId, rawTags) {
  await db.query('DELETE FROM photo_tags WHERE photo_id = $1', [photoId]);
  const names = String(rawTags).split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  for (const name of names) {
    const { rows } = await db.query(
      'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
      [name]
    );
    await db.query(
      'INSERT INTO photo_tags (photo_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [photoId, rows[0].id]
    );
  }
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

// Delete photos from DB and remove their files from disk
async function deletePhotos(ids) {
  if (!ids.length) return;
  const { rows } = await db.query(
    'SELECT filename FROM photos WHERE id = ANY($1::int[])',
    [ids]
  );
  await db.query('DELETE FROM photos WHERE id = ANY($1::int[])', [ids]);
  for (const p of rows) {
    fs.promises.unlink(path.join(UPLOAD_DIR, p.filename)).catch(() => {});
  }
}

module.exports = { UPLOAD_DIR, upload, parseCoord, sanitizeNextcloudUrl, setTags, singleUploadFields, batchUploadFields, deletePhotos };

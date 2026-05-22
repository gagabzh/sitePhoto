'use strict';

const router = require('express').Router();
const { wrapAsync } = require('../middleware');
const { notifyUser } = require('../notifications');
const db = require('../db');

function requireWorkerSecret(req, res, next) {
  const secret = process.env.WORKER_API_SECRET;
  if (!secret || req.headers['x-worker-secret'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

router.post('/identification-result', requireWorkerSecret, wrapAsync(async (req, res) => {
  const { photoId, userId, tags } = req.body;
  if (!photoId || !userId) return res.status(400).json({ error: 'Missing photoId or userId' });

  // Ollama returns a plain string; normalise to a tag list
  const names = String(tags || '')
    .split(/[,\n]+/)
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);

  if (names.length) {
    const { rows: tagRows } = await db.query(
      'INSERT INTO tags (name) SELECT unnest($1::text[]) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
      [names]
    );
    await db.query(
      'INSERT INTO photo_tags (photo_id, tag_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING',
      [photoId, tagRows.map(r => r.id)]
    );
  }

  notifyUser(userId, { photoId, tags: names });
  res.json({ ok: true });
}));

module.exports = router;

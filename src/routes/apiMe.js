const router = require('express').Router();
const db = require('../db');
const { wrapAsync } = require('../middleware');

// ── GET /api/me/stats ─────────────────────────────────────────────────────────
// Returns upload count, album count, and recipe count for the current user.
// Viewers see only counts of photos/albums shared with them.

router.get('/stats', wrapAsync(async (req, res) => {
  const { userId, role } = req.session;
  const isViewer = role === 'viewer';

  const [uploadsResult, albumsResult, recipesResult] = await Promise.all([
    // uploads: viewers count photos accessible via album_access; others count own uploads
    isViewer
      ? db.query(`
          SELECT COUNT(DISTINCT p.id)::int AS n
          FROM photos p
          JOIN album_photos ap ON ap.photo_id = p.id
          JOIN album_access aa ON aa.album_id = ap.album_id
          WHERE aa.viewer_id = $1
        `, [userId])
      : db.query(
          'SELECT COUNT(*)::int AS n FROM photos WHERE user_id = $1',
          [userId]
        ),
    // albums: viewers count albums shared with them; others count own albums
    isViewer
      ? db.query(
          'SELECT COUNT(*)::int AS n FROM album_access WHERE viewer_id = $1',
          [userId]
        )
      : db.query(
          'SELECT COUNT(*)::int AS n FROM albums WHERE user_id = $1',
          [userId]
        ),
    // recipes: count recipes owned by this user (table always exists from v3.sql)
    db.query(
      'SELECT COUNT(*)::int AS n FROM tag_recipes WHERE user_id = $1',
      [userId]
    ),
  ]);

  res.json({
    uploads: uploadsResult.rows[0].n,
    albums:  albumsResult.rows[0].n,
    recipes: recipesResult.rows[0].n,
  });
}));

// ── GET /api/me/sessions ──────────────────────────────────────────────────────
// Returns all active sessions for the current user, flagging the current one.

router.get('/sessions', wrapAsync(async (req, res) => {
  const { rows } = await db.query(
    `SELECT sid, expire FROM session WHERE (sess->>'userId')::int = $1 ORDER BY expire DESC`,
    [req.session.userId]
  );
  const result = rows.map(r => ({
    sid:       r.sid,
    expire:    r.expire,
    isCurrent: r.sid === req.sessionID,
  }));
  res.json(result);
}));

// ── GET /api/me/uploads ───────────────────────────────────────────────────────
// Returns the last 10 photos uploaded by this user.
// Viewers always get an empty array (they cannot upload).

router.get('/uploads', wrapAsync(async (req, res) => {
  if (req.session.role === 'viewer') return res.json([]);

  const { rows } = await db.query(
    `SELECT id, title, s3_key, taken_at, created_at
     FROM photos
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [req.session.userId]
  );
  res.json(rows);
}));

// ── GET /api/me/albums ────────────────────────────────────────────────────────
// Returns albums owned by the user (editor/admin) or shared with them (viewer).

router.get('/albums', wrapAsync(async (req, res) => {
  const { userId, role } = req.session;
  const isViewer = role === 'viewer';

  const { rows } = isViewer
    ? await db.query(
        `SELECT a.id, a.title
         FROM albums a
         JOIN album_access aa ON aa.album_id = a.id
         WHERE aa.viewer_id = $1
         ORDER BY a.created_at DESC`,
        [userId]
      )
    : await db.query(
        'SELECT id, title FROM albums WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );

  res.json(rows);
}));

module.exports = router;

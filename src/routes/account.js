const router = require('express').Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { page, esc } = require('../layout');
const { wrapAsync } = require('../middleware');
const { deletePhoto, uploadPhoto, streamPhoto } = require('../storage');

// ── ACC-4: Rate limiter for session revoke endpoints ──────────────────────────

const sessionRevokeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests — try again later.' });
  },
});

// ── HRD-7: Rate limiter for PATCH /account (10 req/min) ──────────────────────

const profilePatchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Skip in test env — in-memory store would accumulate across test cases
  skip: () => process.env.NODE_ENV === 'test',
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests — try again later.' });
  },
});

router.get('/', (req, res) => {
  const isAdmin = req.session.role === 'admin';
  res.send(page('Home', `
    <h1>Hello ${esc(req.session.name)}</h1>
    <p>You are logged in as <strong>${esc(req.session.role)}</strong>.</p>
    <div style="display:flex;gap:1rem;flex-wrap:wrap">
      <a class="btn" href="/account/password">Change my password</a>
      ${isAdmin ? '<a class="btn btn-secondary" href="/admin/users">Manage users</a>' : ''}
    </div>
  `, req.session));
});

// ── FE-1.3 / ACC-4: Account dashboard ────────────────────────────────────────

router.get('/account', wrapAsync(async (req, res) => {
  const { userId, role } = req.session;
  const isViewer = role === 'viewer';

  // Promise.all slot index reference — update this block when adding/removing slots:
  // [0] stats: upload count (role-aware)
  // [1] stats: album count (role-aware)
  // [2] stats: recipes count
  // [3] sessions (ACC-4: full sess blob for UA/IP/last-seen)
  // [4] recent uploads — Promise.resolve for viewer (no db.query consumed)
  // [5] albums list (role-aware)
  // [6] profile + prefs
  // [7] favourites count — TODO: DS-ACC-2 photo_likes table not yet implemented
  // [8] comments count  — TODO: DS-ACC-2 comments table not yet implemented
  // [9] tag recipes for left-column card (LIMIT 3 for admin, 2 for editor, 0 for viewer)
  // [10] albums for grid card (admin/editor: own albums with photo count LIMIT 4; viewer: accessible LIMIT 4)
  // [11] admin tool counts (4 subquery values) — db.query for admin, Promise.resolve for others
  // [12] shared-with list (editor only) — db.query for editor, Promise.resolve for others
  // [13] admin name+email for viewer limits card (viewer only) — db.query for viewer, Promise.resolve for others
  const [
    statsUploads, statsAlbums, statsRecipes,
    sessionsResult, recentUploads, albumsResult,
    profileResult, favouritesResult, commentsResult,
    recipesResult,
    albumsGridResult, adminToolsResult, sharedWithResult, adminLookupResult,
  ] = await Promise.all([
    // [0] stats: upload count (role-aware)
    isViewer
      ? db.query(`
          SELECT COUNT(DISTINCT p.id)::int AS n
          FROM photos p
          JOIN album_photos ap ON ap.photo_id = p.id
          JOIN album_access aa ON aa.album_id = ap.album_id
          WHERE aa.viewer_id = $1
        `, [userId])
      : db.query('SELECT COUNT(*)::int AS n FROM photos WHERE user_id = $1', [userId]),
    // [1] stats: album count (role-aware)
    isViewer
      ? db.query('SELECT COUNT(*)::int AS n FROM album_access WHERE viewer_id = $1', [userId])
      : db.query('SELECT COUNT(*)::int AS n FROM albums WHERE user_id = $1', [userId]),
    // [2] stats: recipes count
    db.query('SELECT COUNT(*)::int AS n FROM tag_recipes WHERE user_id = $1', [userId]),
    // [3] active sessions for this user — ACC-4: fetch full sess blob for UA/IP/last-seen
    db.query(
      `SELECT sid, sess, expire
       FROM session
       WHERE sess->>'userId' = $1
         AND expire > NOW()
       ORDER BY expire DESC`,
      [String(userId)]
    ),
    // [4] recent uploads (viewers have no uploads)
    isViewer
      ? Promise.resolve({ rows: [] })
      : db.query(
          `SELECT id, title, s3_key, taken_at, created_at FROM photos WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
          [userId]
        ),
    // [5] albums
    isViewer
      ? db.query(
          `SELECT a.id, a.title FROM albums a JOIN album_access aa ON aa.album_id = a.id WHERE aa.viewer_id = $1 ORDER BY a.created_at DESC`,
          [userId]
        )
      : db.query('SELECT id, title FROM albums WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
    // [6] Profile: name, email, avatar_s3_key + prefs via LEFT JOIN
    db.query(
      `SELECT u.name, u.email, u.avatar_s3_key,
              COALESCE(p.language,      'en')   AS language,
              COALESCE(p.theme,         'light') AS theme,
              COALESCE(p.notif_enabled,  TRUE)  AS notif_enabled
       FROM users u
       LEFT JOIN user_prefs p ON p.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    ),
    // [7] favourites count — TODO: DS-ACC-2 photo_likes table not yet implemented
    Promise.resolve({ rows: [{ n: 0 }] }),
    // [8] comments count — TODO: DS-ACC-2 comments table not yet implemented
    Promise.resolve({ rows: [{ n: 0 }] }),
    // [9] tag recipes for left-column card (LIMIT 3 for admin, 2 for editor, 0 for viewer)
    role === 'viewer'
      ? Promise.resolve({ rows: [] })
      : db.query(
          `SELECT id, name FROM tag_recipes WHERE user_id = $1 ORDER BY created_at DESC LIMIT ${role === 'admin' ? 3 : 2}`,
          [userId]
        ),
    // [10] albums for grid card (admin/editor: own albums with photo count LIMIT 4; viewer: accessible LIMIT 4)
    role === 'viewer'
      ? db.query(
          `SELECT a.id, a.title, a.created_at, COUNT(ap.photo_id)::int AS photo_count
           FROM albums a
           JOIN album_access aa ON aa.album_id = a.id AND aa.viewer_id = $1
           LEFT JOIN album_photos ap ON ap.album_id = a.id
           GROUP BY a.id ORDER BY a.created_at DESC LIMIT 4`,
          [userId]
        )
      : db.query(
          `SELECT a.id, a.title, a.created_at, COUNT(ap.photo_id)::int AS photo_count
           FROM albums a
           LEFT JOIN album_photos ap ON ap.album_id = a.id
           WHERE a.user_id = $1
           GROUP BY a.id ORDER BY a.created_at DESC LIMIT 4`,
          [userId]
        ),
    // [11] admin tool counts (4 values in one query via subqueries — only for admin)
    role === 'admin'
      ? db.query(`SELECT
          (SELECT COUNT(*)::int FROM users)        AS user_count,
          (SELECT COUNT(*)::int FROM tags)         AS tag_count,
          (SELECT COUNT(*)::int FROM albums)       AS album_count,
          (SELECT COUNT(*)::int FROM tag_recipes)  AS recipe_count`)
      : Promise.resolve({ rows: [{ user_count: 0, tag_count: 0, album_count: 0, recipe_count: 0 }] }),
    // [12] shared-with list (editor only)
    role === 'editor'
      ? db.query(
          `SELECT DISTINCT u.id, u.name, COUNT(DISTINCT aa.album_id)::int AS album_count
           FROM album_access aa
           JOIN albums a ON a.id = aa.album_id AND a.user_id = $1
           JOIN users u ON u.id = aa.viewer_id
           GROUP BY u.id ORDER BY u.name ASC`,
          [userId]
        )
      : Promise.resolve({ rows: [] }),
    // [13] admin name+email for viewer limits card (viewer only)
    role === 'viewer'
      ? db.query(`SELECT name, email FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1`)
      : Promise.resolve({ rows: [] }),
  ]);

  const stats = {
    uploads:    statsUploads.rows[0].n,
    albums:     statsAlbums.rows[0].n,
    recipes:    statsRecipes.rows[0].n,
    favourites: favouritesResult.rows[0].n,
    comments:   commentsResult.rows[0].n,
  };

  // ACC-4: enrich each session row with parsed UA, IP, last-seen
  const sessions = sessionsResult.rows.map(r => {
    const sess = r.sess || {};
    const userAgent = sess.userAgent || null;
    const loginIp   = sess.loginIp   || null;
    // Last seen = expire minus rolling TTL (7 days)
    const lastSeen  = r.expire ? new Date(r.expire.getTime() - 7 * 24 * 60 * 60 * 1000) : null;
    return {
      sid:       r.sid,
      expire:    r.expire,
      userAgent,
      loginIp,
      lastSeen,
      uaLabel:   parseUserAgent(userAgent),
      isCurrent: r.sid === req.sessionID,
    };
  });

  const profile = profileResult.rows[0];

  res.send(renderAccountPage({
    stats,
    sessions,
    recentUploads: recentUploads.rows,
    albums: albumsResult.rows,
    profile,
    recipes: recipesResult.rows,
    albumsGrid: albumsGridResult.rows,
    adminTools: adminToolsResult.rows[0] || {},
    sharedWith: sharedWithResult.rows,
    adminContact: adminLookupResult.rows[0] || null,
  }, req.session));
}));

// ── ACC-2: Inline profile editing ─────────────────────────────────────────────

router.patch('/account', profilePatchLimiter, wrapAsync(async (req, res) => {
  const { userId } = req.session;
  const { name, email, language, theme, notif_enabled } = req.body;

  const hasUserField  = name !== undefined || email !== undefined;
  const hasPrefField  = language !== undefined || theme !== undefined || notif_enabled !== undefined;
  if (!hasUserField && !hasPrefField) {
    return res.status(422).json({ error: 'No valid fields in request body' });
  }

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) {
      return res.status(422).json({ error: 'Name is required' });
    }
    if (trimmed.length > 100) {
      return res.status(422).json({ error: 'Name must be 1–100 characters' });
    }
  }

  if (email !== undefined) {
    const trimmedEmail = String(email).trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
    if (!emailOk) {
      return res.status(422).json({ error: 'Invalid email address' });
    }
    const { rows: conflict } = await db.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [trimmedEmail, userId]
    );
    if (conflict.length > 0) {
      return res.status(409).json({ error: 'Email already in use' });
    }
  }

  if (language !== undefined && !['en', 'fr'].includes(language)) {
    return res.status(422).json({ error: 'Invalid language' });
  }
  if (theme !== undefined && !['light', 'dark'].includes(theme)) {
    return res.status(422).json({ error: 'Invalid theme' });
  }

  if (hasUserField) {
    const setClauses = [];
    const params     = [];
    if (name !== undefined) {
      setClauses.push(`name = $${params.length + 1}`);
      params.push(String(name).trim());
    }
    if (email !== undefined) {
      setClauses.push(`email = $${params.length + 1}`);
      params.push(String(email).trim());
    }
    params.push(userId);
    await db.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${params.length}`,
      params
    );
    if (name !== undefined) req.session.name  = String(name).trim();
    if (email !== undefined) req.session.email = String(email).trim();
  }

  if (hasPrefField) {
    const prefCols    = [];
    const prefVals    = [];
    const prefUpdates = [];

    if (language !== undefined) {
      prefCols.push('language');
      prefVals.push(language);
      prefUpdates.push(`language = EXCLUDED.language`);
    }
    if (theme !== undefined) {
      prefCols.push('theme');
      prefVals.push(theme);
      prefUpdates.push(`theme = EXCLUDED.theme`);
    }
    if (notif_enabled !== undefined) {
      if (typeof notif_enabled !== 'boolean') {
        return res.status(422).json({ error: 'notif_enabled must be a boolean' });
      }
      prefCols.push('notif_enabled');
      prefVals.push(notif_enabled);
      prefUpdates.push(`notif_enabled = EXCLUDED.notif_enabled`);
    }

    const colList         = ['user_id', ...prefCols].join(', ');
    const valPlaceholders = ['$1', ...prefCols.map((_, i) => `$${i + 2}`)].join(', ');
    await db.query(
      `INSERT INTO user_prefs (${colList}) VALUES (${valPlaceholders})
       ON CONFLICT (user_id) DO UPDATE SET ${prefUpdates.join(', ')}`,
      [userId, ...prefVals]
    );
  }

  res.json({ ok: true });
}));

// ── ACC-3: Avatar upload ───────────────────────────────────────────────────────

// Limit is 5 MB + 1 byte so that exactly 5 MiB files are accepted;
// busboy fires the limit event at strict equality, so we need the
// boundary to sit 1 byte above the advertised maximum (ACC-3).
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES + 1 },
});

const AVATAR_MIME_ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

router.post('/account/avatar', (req, res, next) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum 5 MB.' });
    }
    if (err) return next(err);
    next();
  });
}, wrapAsync(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided.' });
  }
  if (!AVATAR_MIME_ALLOWED.has(req.file.mimetype)) {
    return res.status(415).json({ error: 'Unsupported file type. Use JPEG, PNG, or WebP.' });
  }

  let processed;
  try {
    processed = await sharp(req.file.buffer)
      .resize(256, 256, { fit: 'cover' })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch (err) {
    console.error('[account/avatar] sharp failed:', err.message);
    return res.status(500).json({ error: 'Upload failed — please try again.' });
  }

  const newKey = `${uuidv4()}.jpg`;

  try {
    await uploadPhoto(newKey, processed, 'image/jpeg');
  } catch (err) {
    console.error('[account/avatar] S3 upload failed:', err.message);
    return res.status(500).json({ error: 'Upload failed — please try again.' });
  }

  const { rows } = await db.query(
    'SELECT avatar_s3_key FROM users WHERE id = $1',
    [req.session.userId]
  );
  const oldKey = rows[0]?.avatar_s3_key || null;

  await db.query(
    'UPDATE users SET avatar_s3_key = $1 WHERE id = $2',
    [newKey, req.session.userId]
  );

  req.session.avatarS3Key = newKey;

  if (oldKey) {
    deletePhoto(oldKey).catch(err =>
      console.warn('[account/avatar] old S3 cleanup failed for', oldKey, err.message)
    );
  }

  res.json({ ok: true });
}));

// ── ACC-3: Avatar removal ──────────────────────────────────────────────────────

router.delete('/account/avatar', wrapAsync(async (req, res) => {
  const { rows } = await db.query(
    'SELECT avatar_s3_key FROM users WHERE id = $1',
    [req.session.userId]
  );
  const oldKey = rows[0]?.avatar_s3_key || null;

  await db.query(
    'UPDATE users SET avatar_s3_key = NULL WHERE id = $1',
    [req.session.userId]
  );

  req.session.avatarS3Key = null;

  if (oldKey) {
    deletePhoto(oldKey).catch(err =>
      console.warn('[account/avatar] S3 delete on removal failed for', oldKey, err.message)
    );
  }

  res.json({ ok: true });
}));

// ── ACC-3: Serve avatar (proxy from S3) ───────────────────────────────────────

router.get('/account/avatar', wrapAsync(async (req, res) => {
  const { rows } = await db.query(
    'SELECT avatar_s3_key FROM users WHERE id = $1',
    [req.session.userId]
  );
  const key = rows[0]?.avatar_s3_key;
  if (!key) return res.status(404).end();

  const { stream, contentType } = await streamPhoto(key);
  res.setHeader('Content-Type', contentType || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  stream.pipe(res);
}));

// ── ACC-4: DELETE /account/sessions/:sid — individual revoke ──────────────────
// requireAuth is applied globally in app.js, but we return 401 JSON here
// because this is a JSON API endpoint (not a page redirect).

router.delete('/account/sessions/:sid', sessionRevokeLimiter, wrapAsync(async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  const { sid } = req.params;

  // Reject attempts to revoke the caller's own current session
  if (sid === req.sessionID) {
    return res.status(403).json({ error: 'Cannot revoke your current session.' });
  }

  const result = await db.query(
    `DELETE FROM session
     WHERE sid = $1
       AND sess->>'userId' = $2
       AND sid != $3`,
    [sid, String(req.session.userId), req.sessionID]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Session not found.' });
  }

  res.json({ ok: true });
}));

// ── ACC-4: DELETE /account/sessions — bulk revoke all other sessions ──────────

router.delete('/account/sessions', sessionRevokeLimiter, wrapAsync(async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  const result = await db.query(
    `DELETE FROM session
     WHERE sess->>'userId' = $1
       AND sid != $2`,
    [String(req.session.userId), req.sessionID]
  );

  res.json({ revoked: result.rowCount });
}));

// ── Legacy form-based revoke endpoints (kept for backward compat, no-op guard) ─
// These are superseded by the DELETE endpoints above but remain to avoid
// breaking any bookmarked forms from before ACC-4.

router.post('/account/sessions/:sid/revoke', wrapAsync(async (req, res) => {
  await db.query(
    `DELETE FROM session WHERE sid = $1 AND (sess->>'userId')::int = $2`,
    [req.params.sid, req.session.userId]
  );
  res.redirect('/account');
}));

router.post('/account/sessions/revoke-others', wrapAsync(async (req, res) => {
  await db.query(
    `DELETE FROM session WHERE (sess->>'userId')::int = $1 AND sid != $2`,
    [req.session.userId, req.sessionID]
  );
  res.redirect('/account');
}));

// US-6: Change own password
router.get('/account/password', (req, res) => {
  const error = req.query.error ? '<p class="msg-error">Current password is incorrect.</p>' : '';
  const success = req.query.done ? '<p class="msg-success">Password updated successfully.</p>' : '';
  res.send(page('Change password', `
    <h1>Change my password</h1>
    <div class="card">
      ${error}${success}
      <form class="form-col" method="POST" action="/account/password">
        <label>Current password <input type="password" name="current" required></label>
        <label>New password <input type="password" name="password" required minlength="8"></label>
        <div class="row">
          <button class="btn" type="submit">Update</button>
          <a class="btn btn-secondary" href="/">Cancel</a>
        </div>
      </form>
    </div>
  `, req.session));
});

router.post('/account/password', wrapAsync(async (req, res) => {
  const { current, password } = req.body;
  if (!password || password.length < 8) return res.status(400).send('Password must be at least 8 characters');
  const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);
  const valid = await bcrypt.compare(current, rows[0].password_hash);
  if (!valid) return res.redirect('/account/password?error=1');
  const hash = await bcrypt.hash(password, 10);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.session.userId]);
  res.redirect('/account/password?done=1');
}));

// ── ACC-5: Danger zone — delete own account ───────────────────────────────────

router.get('/account/delete', (req, res) => {
  const { name } = req.session;
  const errorMsg = req.query.error === 'last_admin'
    ? '<p class="msg-error">You are the only admin — assign another admin before deleting your account.</p>'
    : req.query.error
      ? '<p class="msg-error">Username did not match — please try again.</p>'
      : '';
  const error = errorMsg;
  res.send(page('Delete my account', `
    <div class="acc-wrap">
      <div class="acc-section acc-dz">
        <div class="acc-section-h">danger zone</div>
        <div class="acc-section-b">
          ${error}
          <p class="acc-dz-label">
            This will permanently delete your account, all your photos, and all your albums.
            <strong>This cannot be undone.</strong>
          </p>
          <p class="acc-dz-label">Type <strong>${esc(name)}</strong> to confirm:</p>
          <form class="acc-dz-form" method="POST" action="/account/delete">
            <input type="text" name="confirm_name" required autocomplete="off" placeholder="${esc(name)}">
            <div class="row">
              <button class="btn btn-danger" type="submit">permanently delete my account</button>
              <a class="btn btn-secondary" href="/account">Cancel</a>
            </div>
          </form>
        </div>
      </div>
    </div>
  `, req.session));
});

router.post('/account/delete', wrapAsync(async (req, res) => {
  const { confirm_name } = req.body;
  if (confirm_name.trim() !== req.session.name.trim()) {
    return res.redirect('/account/delete?error=1');
  }

  // Last-admin guard
  if (req.session.role === 'admin') {
    const { rows } = await db.query(
      'SELECT COUNT(*)::int AS n FROM users WHERE role = $1', ['admin']
    );
    if (rows[0].n <= 1) {
      return res.redirect('/account/delete?error=last_admin');
    }
  }

  // Atomic DB deletion
  const client = await db.connect();
  let s3Keys = [];
  try {
    await client.query('BEGIN');
    const { rows: photoRows } = await client.query(
      'SELECT s3_key FROM photos WHERE user_id = $1', [req.session.userId]
    );
    s3Keys = photoRows.map(r => r.s3_key).filter(Boolean);
    await client.query('DELETE FROM photos WHERE user_id = $1', [req.session.userId]);
    await client.query('DELETE FROM users WHERE id = $1', [req.session.userId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // S3 cleanup fire-and-forget after commit
  for (const key of s3Keys) {
    deletePhoto(key).catch(err =>
      console.warn('[account/delete] S3 cleanup failed for', key, err.message)
    );
  }

  req.session.destroy(() => res.redirect('/login'));
}));

// ── FE-1.4 / ACC-4: Account page HTML template ───────────────────────────────

function renderAccountPage({ stats, sessions, recentUploads, albums: _albums, profile, recipes,
  albumsGrid, adminTools, sharedWith, adminContact }, session) {
  const { role } = session;

  // DS-ACC-1: two-column layout with header + perms strip + body
  const headerHtml  = buildHeader(stats, session);
  const permsStrip  = buildPermsStrip(role);
  const leftCol     = buildLeftColumn(role, { profile, recentUploads, recipes, stats });
  const rightCol    = buildRightColumn(sessions, role, {
    albums: albumsGrid,
    adminTools,
    sharedWith,
    adminContact,
    stats,
    recipes,
  });

  const accountScript = buildAccountScript();

  const body = `
    <div class="acc-page-bg">
      <div class="acc-header">${headerHtml}</div>
      ${permsStrip}
      <div class="acc-body">
        <div class="acc-col-left">${leftCol}</div>
        <div class="acc-col-right">${rightCol}</div>
      </div>
      ${accountScript}
    </div>`;

  return page('My Account', body, session);
}

// ── DS-ACC-2: Header block — avatar + identity + stats strip ─────────────────

function buildHeader(stats, session) {
  const { role, name, avatarS3Key } = session;
  const initial = esc((name || '?')[0].toUpperCase());

  // Column 1: Avatar
  const avatarInner = avatarS3Key
    ? `<img src="/account/avatar" class="acc-avatar-img" alt="">`
    : `<span class="acc-avatar-initial">${initial}</span>`;

  const avatarCol = `
    <div class="acc-avatar-wrap" style="position:relative">
      <div class="acc-avatar-hero">
        ${avatarInner}
      </div>
      <button id="js-avatar-change" class="acc-avatar-tab" type="button">↻ change</button>
    </div>
    <input type="file" id="js-avatar-input" accept="image/jpeg,image/png,image/webp"
           style="display:none" aria-hidden="true">
    <div class="acc-avatar-error" id="js-avatar-err" style="display:none"></div>
    ${avatarS3Key ? `<button class="acc-avatar-remove btn-icon" aria-label="Remove avatar" type="button" id="js-avatar-remove"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>` : ''}`;

  // Column 2: Identity
  const roleGlyph = role === 'admin' ? '★ ADMIN' : role === 'editor' ? '✎ EDITOR' : '◎ VIEWER';
  const roleBadgeClass = `acc-role-badge acc-role-badge--${esc(role)}`;
  const identityCol = `
    <div class="acc-identity">
      <h2 class="acc-greeting-name" style="font-family:'Caveat',cursive;font-size:32px;font-weight:700;margin:0 0 6px">Hello, ${esc(name)}</h2>
      <span class="${roleBadgeClass}">${esc(roleGlyph)}</span>
      <p style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink-faint);margin:6px 0 0">${esc(session.email || '')}</p>
    </div>`;

  // Column 3: Stats strip
  const isViewer = role === 'viewer';
  const uploadsNum   = isViewer ? '&mdash;' : String(stats.uploads);
  const albumsNum    = isViewer ? '&mdash;' : String(stats.albums);
  const uploadsClass = isViewer ? 'acc-stat-tile acc-stat-tile--muted' : 'acc-stat-tile';
  const albumsClass  = isViewer ? 'acc-stat-tile acc-stat-tile--muted' : 'acc-stat-tile';

  const statsCol = `
    <div class="acc-stats-strip" style="display:flex;align-items:flex-start">
      <div class="${uploadsClass}">
        <span class="acc-stat-num">${uploadsNum}</span>
        <span class="acc-stat-label">uploads</span>
      </div>
      <div class="${albumsClass}">
        <span class="acc-stat-num">${albumsNum}</span>
        <span class="acc-stat-label">albums</span>
      </div>
      <div class="acc-stat-tile">
        <span class="acc-stat-num">${stats.favourites}</span>
        <span class="acc-stat-label">favourites</span>
      </div>
      <div class="acc-stat-tile">
        <span class="acc-stat-num">${stats.comments}</span>
        <span class="acc-stat-label">comments</span>
      </div>
      <div class="acc-stat-tile">
        <span class="acc-stat-num">${stats.recipes}</span>
        <span class="acc-stat-label">recipes</span>
      </div>
    </div>`;

  return `${avatarCol}${identityCol}${statsCol}`;
}

// ── DS-ACC-3: Permission strip ────────────────────────────────────────────────

function buildPermsStrip(role) {
  let canLabels  = [];
  let cantLabels = [];

  if (role === 'admin') {
    canLabels = [
      'view photos', 'upload photos', 'manage own albums', 'share albums',
      'tag photos', 'make tag recipes', 'manage all tags', 'manage users', 'access AI tools',
    ];
    cantLabels = [];
  } else if (role === 'editor') {
    canLabels = [
      'view photos', 'upload photos', 'manage own albums', 'share albums',
      'tag photos', 'make tag recipes',
    ];
    cantLabels = ['manage all tags', 'manage users', 'access AI tools'];
  } else if (role === 'viewer') {
    canLabels = [
      'view photos', 'favourite photos', 'comment on photos', 'tag photos', 'make tag recipes',
    ];
    cantLabels = ['upload photos', 'create albums', 'share albums', 'manage users'];
  } else {
    console.warn('[buildPermsStrip] unknown role:', role);
    cantLabels = ['unknown role'];
  }

  const canPills  = canLabels.map(l  => `<span class="acc-pill-can">&#10003; ${esc(l)}</span>`).join('');
  const cantPills = cantLabels.map(l => `<span class="acc-pill-cant">&#10007; ${esc(l)}</span>`).join('');

  return `
    <div class="acc-perms-strip d1-tape acc-card-block" style="display:flex;align-items:flex-start;gap:16px;position:relative;overflow:visible;margin:0 32px 16px">
      <span class="acc-perms-kicker" style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-faint);white-space:nowrap;padding-top:2px">YOUR RIGHTS &middot; ${esc(role.toUpperCase())} &middot;</span>
      <div class="acc-perms-pills" style="display:flex;flex-wrap:wrap;gap:6px;flex:1">
        ${canPills}${cantPills}
      </div>
    </div>`;
}

// ── DS-ACC-1: Left column — profile details card ──────────────────────────────

function buildLeftColumn(role, data) {
  const { profile, recentUploads = [], recipes = [], stats } = data;
  let html = '';

  // --- Card 1: Your details ---
  html += profile ? `
    <div class="acc-card-block d1-tape">
      <h3 class="acc-card-title">Profile</h3>
      <div class="acc-section-b" style="padding:0">
        <div class="acc-field-row">
          <span class="acc-field-label">Name</span>
          <span class="acc-field-val" data-field="name" data-current="${esc(profile.name)}">${esc(profile.name)}</span>
        </div>
        <div class="acc-field-row">
          <span class="acc-field-label">Email</span>
          <span class="acc-field-val" data-field="email" data-current="${esc(profile.email || '')}">${esc(profile.email || '')}</span>
        </div>
        <div class="acc-field-row">
          <span class="acc-field-label">Language</span>
          <span class="acc-field-val" data-field="language" data-type="select"
                data-options='[{"value":"en","label":"English"},{"value":"fr","label":"French"}]'
                data-current="${esc(profile.language)}">${profile.language === 'fr' ? 'French' : 'English'}</span>
        </div>
        <div class="acc-field-row">
          <span class="acc-field-label">Theme</span>
          <span class="acc-field-val" data-field="theme" data-type="select"
                data-options='[{"value":"light","label":"Light"},{"value":"dark","label":"Dark"}]'
                data-current="${esc(profile.theme)}">${profile.theme === 'dark' ? 'Dark' : 'Light'}</span>
        </div>
        <div class="acc-field-row">
          <span class="acc-field-label">Notifications</span>
          <span class="acc-field-val" data-field="notif_enabled" data-type="toggle"
                data-current="${esc(profile.notif_enabled)}">${profile.notif_enabled ? 'On' : 'Off'}</span>
        </div>
      </div>
      <div style="margin-top:12px">
        <a href="/account/password" class="acc-details-pw-link" style="font-family:'Caveat',cursive;font-size:14px;color:var(--accent)">change password &#8594;</a>
      </div>
    </div>` : '';

  if (role === 'admin' || role === 'editor') {
    // --- Card 2: Recent uploads mosaic ---
    html += buildUploadsCard(role, recentUploads, stats);
    // --- Card 3: Tag recipes ---
    html += buildRecipesCard(role, recipes);
  } else {
    // --- Card 2 (viewer): Favourites grid placeholder ---
    html += buildFavouritesCard();
    // --- Card 3 (viewer): Activity log placeholder ---
    html += buildActivityCard();
  }

  return html;
}

function buildUploadsCard(role, recentUploads, stats) {
  const totalCount = stats ? String(stats.uploads) : '0';
  const mosaicCells = recentUploads.map((photo, i) => {
    const isFeatured = i === 0 && recentUploads.length >= 3;
    const featuredClass = isFeatured ? ' acc-mosaic-cell--featured' : '';
    return `<a href="/photos/${esc(String(photo.id))}" class="acc-mosaic-cell${featuredClass}">
        <img src="/uploads/${esc(photo.s3_key)}" alt="" onerror="this.parentElement.style.background='var(--paper-2)'">
      </a>`;
  }).join('');

  const mosaicOrEmpty = recentUploads.length > 0
    ? `<div class="acc-uploads-mosaic">${mosaicCells}</div>`
    : `<p class="acc-mosaic-empty">no uploads yet</p>`;

  const hint = role === 'editor'
    ? `<p class="acc-uploads-hint" style="font-family:'Kalam',cursive;font-size:11px;color:var(--ink-faint);margin:6px 0 0">you're free to delete or re-tag any of yours</p>`
    : '';

  return `
    <div class="acc-card-block acc-uploads-card d1-tape">
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:12px">
        <h3 class="acc-card-title" style="margin:0">your recent uploads</h3>
        <span class="acc-card-count" style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink-faint)">${esc(totalCount)}</span>
      </div>
      ${mosaicOrEmpty}
      ${hint}
    </div>`;
}

function buildRecipesCard(role, recipes) {
  const tapeClass = role === 'admin' ? 'd1-tape--cool' : 'd1-tape--green';
  const count = String(recipes.length);

  const recipeRows = recipes.map((recipe, i) => {
    const isLast = i === recipes.length - 1;
    const borderStyle = isLast ? 'none' : '1px dashed var(--ink-faint)';
    return `<a href="/tags/recipes/${esc(String(recipe.id))}" class="acc-recipe-row" style="display:grid;grid-template-columns:1fr auto;gap:8px;padding:6px 0;border-bottom:${borderStyle};text-decoration:none;color:inherit">
        <span style="font-family:'Caveat',cursive;font-size:20px;font-weight:700">${esc(recipe.name)}</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink-faint)">&#8212;</span>
      </a>`;
  }).join('');

  const content = recipes.length > 0
    ? recipeRows
    : `<p style="font-family:'Kalam',cursive;font-size:13px;color:var(--ink-faint);margin:0">no recipes yet &#8212; <a href="/tags/recipes/new">create one</a></p>`;

  return `
    <div class="acc-card-block acc-recipes-card ${tapeClass}">
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:12px">
        <h3 class="acc-card-title" style="margin:0">your tag recipes</h3>
        <span class="acc-card-count" style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink-faint)">${esc(count)}</span>
        <a href="/tags/recipes/new" class="acc-card-more">new +</a>
      </div>
      ${content}
    </div>`;
}

function buildFavouritesCard() {
  return `
    <div class="acc-card-block acc-favourites-card d1-tape--green">
      <h3 class="acc-card-title">your favourites</h3>
      <p class="acc-fav-empty" style="font-family:'Kalam',cursive;font-size:13px;color:var(--ink-faint)">nothing starred yet</p>
      <!-- TODO: DS-ACC-4 — photo_likes table not yet implemented -->
    </div>`;
}

function buildActivityCard() {
  return `
    <div class="acc-card-block acc-activity-card">
      <h3 class="acc-card-title">your activity <span style="font-family:'Kalam',cursive;font-size:11px;color:var(--ink-faint)">last 14 days</span></h3>
      <p class="acc-activity-empty" style="font-family:'Kalam',cursive;font-size:13px;color:var(--ink-faint)">no activity recorded yet</p>
      <!-- TODO: DS-ACC-4 — activity_log table not yet implemented -->
    </div>`;
}

// ── DS-ACC-5: Right column — role-specific cards + sessions + danger zone ────

function buildRightColumn(sessions, role, data = {}) {
  const { albums = [], adminTools = {}, sharedWith = [], adminContact = null, stats = {}, recipes = [] } = data;
  let html = '';

  // Role-specific cards (above sessions)
  if (role === 'admin' || role === 'editor') {
    html += buildAlbumsGridCard(role, albums, stats);
  }
  if (role === 'admin') {
    html += buildAdminToolsCard(adminTools);
  }
  if (role === 'editor') {
    html += buildSharedWithCard(sharedWith);
  }
  if (role === 'viewer') {
    html += buildViewerRecipesCard(recipes);
    html += buildViewerLimitsCard(adminContact);
  }

  // Always last: sessions + danger zone
  html += buildSessionsSection(sessions);
  html += buildDangerZoneCard();

  return html;
}

function buildAlbumsGridCard(role, albums, stats) {
  const tapeClass = role === 'admin' ? 'd1-tape' : 'd1-tape--cool';
  const totalCount = stats && stats.albums != null ? String(stats.albums) : '0';
  const countNum = parseInt(totalCount, 10) || 0;
  const moreLink = countNum > 4
    ? `<a href="/albums" class="acc-card-more">${countNum - 4} more &#8594;</a>`
    : '';

  const tiles = albums.map(a => `
    <a href="/albums/${esc(String(a.id))}" class="acc-album-tile">
      <div style="font-family:'Caveat',cursive;font-size:20px;font-weight:700">${esc(a.title)}</div>
      <div style="font-family:'Kalam',cursive;font-size:11px;color:var(--ink-faint)">${esc(String(a.photo_count || 0))} photos</div>
    </a>`).join('');

  const gridOrEmpty = albums.length > 0
    ? `<div class="acc-albums-grid">${tiles}</div>`
    : `<p class="acc-albums-empty" style="font-family:'Kalam',cursive;font-size:13px;color:var(--ink-faint);margin:0">no albums yet &#8212; <a href="/albums/new">create one</a></p>`;

  return `
    <div class="acc-card-block acc-albums-card ${tapeClass}">
      <div style="display:flex;align-items:baseline;margin-bottom:12px">
        <h3 class="acc-card-title" style="margin:0">your albums</h3>
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink-faint);margin-left:8px">${esc(totalCount)}</span>
        ${moreLink}
      </div>
      ${gridOrEmpty}
    </div>`;
}

function buildAdminToolsCard(adminTools) {
  const userCount    = esc(String(adminTools.user_count   || 0));
  const tagCount     = esc(String(adminTools.tag_count    || 0));
  const albumCount   = esc(String(adminTools.album_count  || 0));
  const recipeCount  = esc(String(adminTools.recipe_count || 0));
  const countStyle   = 'font-family:\'JetBrains Mono\',monospace;font-size:12px;color:var(--accent);float:right';

  return `
    <div class="acc-card-block acc-admin-tools-card d1-tape--red" style="position:relative;overflow:visible">
      <div style="display:flex;align-items:center;margin-bottom:12px">
        <h3 class="acc-card-title" style="margin:0">admin tools</h3>
        <span style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1.5px;color:oklch(55% 0.20 25);border:1px solid oklch(55% 0.20 25);padding:2px 6px;margin-left:auto">ADMIN ONLY</span>
      </div>
      <div class="acc-tools-grid">
        <a href="/admin/users" class="acc-tool-tile">
          <div style="font-family:'Caveat',cursive;font-size:20px;font-weight:700">users <span style="${countStyle}">${userCount}</span></div>
        </a>
        <a href="/tags/manage" class="acc-tool-tile">
          <div style="font-family:'Caveat',cursive;font-size:20px;font-weight:700">manage tags <span style="${countStyle}">${tagCount}</span></div>
        </a>
        <a href="/albums?scope=all" class="acc-tool-tile">
          <div style="font-family:'Caveat',cursive;font-size:20px;font-weight:700">all albums <span style="${countStyle}">${albumCount}</span></div>
        </a>
        <a href="/tags/recipes?scope=all" class="acc-tool-tile">
          <div style="font-family:'Caveat',cursive;font-size:20px;font-weight:700">all recipes <span style="${countStyle}">${recipeCount}</span></div>
        </a>
        <a href="#" class="acc-tool-tile full">
          <div style="font-family:'Caveat',cursive;font-size:20px;font-weight:700">storage <span style="${countStyle}">&#8211;%</span></div>
          <!-- TODO: DS-ACC-5 storage tile — endpoint not yet implemented -->
        </a>
      </div>
    </div>`;
}

function buildSharedWithCard(sharedWith) {
  const rows = sharedWith.map((u, i) => {
    const isLast = i === sharedWith.length - 1;
    const borderStyle = isLast ? 'none' : '1px dashed var(--ink-faint)';
    const initial = esc((u.name || '?')[0].toUpperCase());
    return `
      <div class="acc-shared-row" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:${borderStyle}">
        <div style="width:24px;height:24px;border-radius:50%;background:var(--paper-2);border:1px solid var(--ink);display:flex;align-items:center;justify-content:center;font-family:'Caveat',cursive;font-size:14px;flex-shrink:0">${initial}</div>
        <span style="font-family:'Kalam',cursive;font-size:14px;flex:1">${esc(u.name)}</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink-faint)">${esc(String(u.album_count || 0))} albums</span>
        <button class="btn btn-sm btn-secondary" disabled>revoke</button>
        <!-- TODO: DS-ACC-5 revoke endpoint — check DELETE /albums/access in src/routes/albums.js -->
      </div>`;
  }).join('');

  const content = sharedWith.length > 0
    ? rows
    : `<p class="acc-shared-empty" style="font-family:'Kalam',cursive;font-size:13px;color:var(--ink-faint);margin:0">not sharing with anyone yet</p>`;

  return `
    <div class="acc-card-block acc-shared-card d1-tape--cool">
      <h3 class="acc-card-title">shared with</h3>
      ${content}
    </div>`;
}

function buildViewerRecipesCard(recipes) {
  const displayed = recipes.slice(0, 4);
  const recipeRows = displayed.map((recipe, i) => {
    const isLast = i === displayed.length - 1;
    const borderStyle = isLast ? 'none' : '1px dashed var(--ink-faint)';
    return `<a href="/tags/recipes/${esc(String(recipe.id))}" class="acc-recipe-row" style="display:grid;grid-template-columns:1fr auto;gap:8px;padding:6px 0;border-bottom:${borderStyle};text-decoration:none;color:inherit">
        <span style="font-family:'Caveat',cursive;font-size:20px;font-weight:700">${esc(recipe.name)}</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink-faint)">&#8212;</span>
      </a>`;
  }).join('');

  const content = recipes.length > 0
    ? recipeRows
    : `<p style="font-family:'Kalam',cursive;font-size:13px;color:var(--ink-faint);margin:0">no recipes yet &#8212; <a href="/tags/recipes/new">create one</a></p>`;

  return `
    <div class="acc-card-block acc-viewer-recipes-card d1-tape--green">
      <div style="display:flex;align-items:center;margin-bottom:12px">
        <h3 class="acc-card-title" style="margin:0">your tag recipes</h3>
        <span style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1.5px;background:oklch(96% 0.02 140);border:1.5px solid var(--accent-3);color:var(--accent-3);padding:2px 8px;border-radius:999px;margin-left:8px">YOUR THING</span>
      </div>
      ${content}
      <div style="display:flex;gap:8px;margin-top:8px">
        <a href="/tags/recipes/new" class="acc-pill-can">+ new recipe</a>
      </div>
    </div>`;
}

function buildViewerLimitsCard(adminContact) {
  const cta = adminContact
    ? `<p class="acc-limits-cta" style="font-family:'Kalam',cursive;font-size:13px;margin:0">&#8594; ask <a href="mailto:${esc(adminContact.email)}">${esc(adminContact.name)}</a> for editor rights</p>`
    : `<p class="acc-limits-cta" style="font-family:'Kalam',cursive;font-size:13px;margin:0">&#8594; contact the site owner for editor rights</p>`;

  return `
    <div class="acc-card-block acc-viewer-limits-card" style="background:oklch(97% 0.02 140);border:1.5px solid var(--accent-3)">
      <h3 class="acc-card-title" style="color:var(--accent-3)">what you can't do here</h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
        <span class="acc-pill-cant">upload photos</span>
        <span class="acc-pill-cant">create albums</span>
        <span class="acc-pill-cant">share albums</span>
        <span class="acc-pill-cant">manage users</span>
      </div>
      ${cta}
    </div>`;
}

function buildDangerZoneCard() {
  return `
    <div class="acc-card-block acc-dz" style="border-color:var(--danger)">
      <h3 class="acc-card-title" style="color:var(--danger)">danger zone</h3>
      <div style="padding:0">
        <div class="acc-links" style="display:flex;flex-wrap:wrap;gap:0.75rem">
          <a class="btn btn-secondary btn-danger-outline" href="/account/delete">Delete account</a>
        </div>
      </div>
    </div>`;
}

function buildAccountScript() {
  return `<script>(function(){
  function activateField(span) {
    var field   = span.dataset.field;
    var type    = span.dataset.type || 'text';
    var current = span.dataset.current;
    var row     = span.parentNode;

    if (row.querySelector('.acc-field-editing')) return;

    span.style.display = 'none';

    var wrap = document.createElement('div');
    wrap.className = 'acc-field-editing';

    var input;
    if (type === 'select') {
      var options = JSON.parse(span.dataset.options || '[]');
      input = document.createElement('select');
      options.forEach(function(o) {
        var opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        if (o.value === current) opt.selected = true;
        input.appendChild(opt);
      });
    } else if (type === 'toggle') {
      var label = document.createElement('label');
      label.className = 'acc-toggle';
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = (current === 'true' || current === true);
      label.appendChild(input);
      var lbl = document.createElement('span');
      lbl.textContent = input.checked ? 'On' : 'Off';
      label.appendChild(lbl);
      input.addEventListener('change', function() { lbl.textContent = input.checked ? 'On' : 'Off'; });
      wrap.appendChild(label);
      input._isToggle = true;
      input._label = lbl;
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.maxLength = field === 'name' ? 100 : 200;
    }

    if (!input._isToggle) wrap.appendChild(input);

    var err = document.createElement('div');
    err.className = 'acc-field-error';
    err.style.display = 'none';

    var saveBtn = document.createElement('button');
    saveBtn.className = 'btn-save btn btn-sm';
    saveBtn.type = 'button';
    saveBtn.setAttribute('aria-label', 'Save');
    saveBtn.textContent = '✓';

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel btn btn-sm btn-secondary';
    cancelBtn.type = 'button';
    cancelBtn.setAttribute('aria-label', 'Cancel');
    cancelBtn.textContent = '✗';

    wrap.appendChild(saveBtn);
    wrap.appendChild(cancelBtn);
    row.appendChild(wrap);
    row.appendChild(err);

    if (!input._isToggle) {
      input.focus();
      if (input.select) input.select();
    }

    function cancel() {
      wrap.remove();
      err.remove();
      span.style.display = '';
    }

    function save() {
      var value;
      if (input._isToggle) {
        value = input.checked;
      } else {
        value = input.value;
      }

      err.style.display = 'none';
      saveBtn.disabled = true;
      cancelBtn.disabled = true;

      var body = {};
      body[field] = value;

      fetch('/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      .then(function(r) {
        return r.json().then(function(data) { return { ok: r.ok, status: r.status, data: data }; });
      })
      .then(function(res) {
        if (!res.ok) {
          var msg = (res.data && res.data.error) || 'Could not save — try again';
          err.textContent = msg;
          err.style.display = 'block';
          saveBtn.disabled = false;
          cancelBtn.disabled = false;
          return;
        }
        if (type === 'select') {
          var opts = JSON.parse(span.dataset.options || '[]');
          var matched = opts.find(function(o) { return o.value === value; });
          span.textContent = matched ? matched.label : value;
        } else if (type === 'toggle') {
          span.textContent = value ? 'On' : 'Off';
        } else {
          span.textContent = value;
        }
        span.dataset.current = value;
        if (field === 'name') {
          var nameEl = document.querySelector('.acc-greeting-name');
          if (nameEl) nameEl.textContent = 'Hello, ' + value;
        }
        cancel();
      })
      .catch(function() {
        err.textContent = 'Could not reach server — try again';
        err.style.display = 'block';
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
      });
    }

    saveBtn.addEventListener('click', save);
    cancelBtn.addEventListener('click', cancel);

    if (!input._isToggle) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter')  { e.preventDefault(); save(); }
        if (e.key === 'Escape') { cancel(); }
      });
    }
  }

  document.querySelectorAll('.acc-field-val').forEach(function(span) {
    span.setAttribute('tabindex', '0');
    span.setAttribute('role', 'button');
    span.addEventListener('click',   function() { activateField(span); });
    span.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateField(span); }
    });
  });

  var avatarInput   = document.getElementById('js-avatar-input');
  var avatarChange  = document.getElementById('js-avatar-change');
  var avatarRemove  = document.getElementById('js-avatar-remove');
  var avatarErr     = document.getElementById('js-avatar-err');
  var avatarWrap    = document.querySelector('.acc-avatar-wrap');

  if (avatarChange && avatarInput) {
    avatarChange.addEventListener('click', function() { avatarInput.click(); });
    avatarInput.addEventListener('change', function() {
      var file = avatarInput.files[0];
      if (!file) return;

      avatarErr.style.display = 'none';

      if (file.size > 5 * 1024 * 1024) {
        avatarErr.textContent = 'File too large. Maximum 5 MB.';
        avatarErr.style.display = 'block';
        avatarInput.value = '';
        return;
      }

      var fd = new FormData();
      fd.append('avatar', file);

      fetch('/account/avatar', { method: 'POST', body: fd })
        .then(function(r) {
          return r.json().then(function(data) { return { ok: r.ok, status: r.status, data: data }; });
        })
        .then(function(res) {
          avatarInput.value = '';
          if (!res.ok) {
            avatarErr.textContent = (res.data && res.data.error) || 'Upload failed — try again.';
            avatarErr.style.display = 'block';
            return;
          }
          var heroWrap = avatarWrap.querySelector('.acc-avatar-hero');
          var oldEl = heroWrap ? heroWrap.querySelector('.acc-avatar-initial, .acc-avatar-img') : avatarWrap.querySelector('.acc-avatar-initial, .acc-avatar-img');
          var img = document.createElement('img');
          img.src = '/account/avatar?_=' + Date.now();
          img.className = 'acc-avatar-img';
          img.alt = '';
          if (oldEl) oldEl.replaceWith(img);
          else if (heroWrap) heroWrap.appendChild(img);

          if (!document.getElementById('js-avatar-remove')) {
            var rmBtn = document.createElement('button');
            rmBtn.id = 'js-avatar-remove';
            rmBtn.className = 'acc-avatar-remove btn-icon';
            rmBtn.setAttribute('aria-label', 'Remove avatar');
            rmBtn.type = 'button';
            rmBtn.innerHTML = '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
            rmBtn.addEventListener('click', doRemove);
            avatarWrap.appendChild(rmBtn);
          }
        })
        .catch(function() {
          avatarInput.value = '';
          avatarErr.textContent = 'Could not reach server — try again.';
          avatarErr.style.display = 'block';
        });
    });
  }

  function doRemove() {
    avatarErr.style.display = 'none';
    fetch('/account/avatar', { method: 'DELETE' })
      .then(function(r) {
        return r.json().then(function(data) { return { ok: r.ok, data: data }; });
      })
      .then(function(res) {
        if (!res.ok) {
          avatarErr.textContent = 'Could not remove avatar — try again.';
          avatarErr.style.display = 'block';
          return;
        }
        var greetEl = document.querySelector('.acc-greeting-name');
        var nameText = greetEl ? greetEl.textContent.replace(/^Hello,\s*/, '') : '?';
        var heroWrap = avatarWrap ? avatarWrap.querySelector('.acc-avatar-hero') : null;
        var span = document.createElement('span');
        span.className = 'acc-avatar-initial';
        span.textContent = nameText[0].toUpperCase();
        var oldImg = heroWrap ? heroWrap.querySelector('.acc-avatar-img, .acc-avatar-initial') : null;
        if (oldImg) oldImg.replaceWith(span);
        else if (heroWrap) heroWrap.appendChild(span);

        var rmBtn = document.getElementById('js-avatar-remove');
        if (rmBtn) rmBtn.remove();
      })
      .catch(function() {
        avatarErr.textContent = 'Could not reach server — try again.';
        avatarErr.style.display = 'block';
      });
  }

  if (avatarRemove) {
    avatarRemove.addEventListener('click', doRemove);
  }

})();</script>`;
}

// ── ACC-4: Inline user-agent parser — no new npm packages ────────────────────
// Returns a short human-readable label ("Chrome on macOS", "Safari on iPhone", etc.)

function parseUserAgent(ua) {
  if (!ua) return 'Unknown device';

  // Mobile OS detection
  const isIPhone  = /iPhone/i.test(ua);
  const isIPad    = /iPad/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isMobile  = isIPhone || isIPad || isAndroid;

  let os;
  if (isIPhone)       os = 'iPhone';
  else if (isIPad)    os = 'iPad';
  else if (isAndroid) os = 'Android';
  else if (/Windows/i.test(ua))  os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua))    os = 'Linux';
  else                           os = null;

  // Browser detection — order matters: Edge before Chrome, Mobile Safari before Safari
  let browser;
  if (/Edg\//i.test(ua))                         browser = 'Edge';
  else if (/Firefox\//i.test(ua))                 browser = 'Firefox';
  else if (isMobile && /Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Mobile Safari';
  else if (/Chrome\//i.test(ua))                  browser = 'Chrome';
  else if (/Safari\//i.test(ua))                  browser = 'Safari';
  else                                             browser = null;

  if (browser && os)  return `${browser} on ${os}`;
  if (browser)        return browser;
  if (os)             return `Unknown browser on ${os}`;
  // Final fallback: truncate raw UA to 60 chars
  return ua.length > 60 ? ua.slice(0, 60) + '…' : ua;
}

// ── ACC-4: Relative time helper ───────────────────────────────────────────────

function relativeTime(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return null;
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec  = Math.floor(diffMs / 1000);
  const diffMin  = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay  = Math.floor(diffHour / 24);

  if (diffSec < 60)   return 'just now';
  if (diffMin < 60)   return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  if (diffHour < 24)  return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
  if (diffDay < 30)   return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth} month${diffMonth !== 1 ? 's' : ''} ago`;
  const diffYear = Math.floor(diffDay / 365);
  return `${diffYear} year${diffYear !== 1 ? 's' : ''} ago`;
}

// ── ACC-4: Sessions section HTML ──────────────────────────────────────────────

function buildSessionsSection(sessions) {
  const hasOthers = sessions.some(s => !s.isCurrent);

  const rows = sessions.map(s => {
    const uaLabel   = esc(s.uaLabel || 'Unknown device');
    const ipLabel   = s.loginIp ? esc(s.loginIp) : 'Unknown location';
    const lastSeenLabel = s.lastSeen
      ? (relativeTime(s.lastSeen) || esc(s.lastSeen.toISOString().slice(0, 16).replace('T', ' ')))
      : (s.expire ? esc(new Date(s.expire).toISOString().slice(0, 16).replace('T', ' ')) : '—');

    if (s.isCurrent) {
      return `
        <div class="acc-session-row" data-sid="${esc(s.sid)}">
          <div class="acc-session-info">
            <span class="acc-session-ua">${uaLabel}</span>
            <span class="acc-session-meta">${ipLabel} &middot; ${lastSeenLabel}</span>
          </div>
          <span class="role-badge">current session</span>
        </div>`;
    }
    return `
      <div class="acc-session-row" id="session-row-${esc(s.sid)}" data-sid="${esc(s.sid)}">
        <div class="acc-session-info">
          <span class="acc-session-ua">${uaLabel}</span>
          <span class="acc-session-meta">${ipLabel} &middot; ${lastSeenLabel}</span>
        </div>
        <button class="btn acc-session-revoke-btn"
                data-sid="${esc(s.sid)}"
                type="button"
                aria-label="Revoke session for ${uaLabel}">Revoke</button>
        <p class="acc-session-err" id="session-err-${esc(s.sid)}" style="display:none;color:var(--acc,red);font-size:0.8rem;margin:0"></p>
      </div>`;
  }).join('');

  const bulkDisabled = !hasOthers ? ' disabled' : '';
  const bulkLabel = !hasOthers ? 'No other active sessions' : 'Sign out all other devices';

  return `
    <div class="acc-card-block d1-tape" id="acc-sessions-section">
      <h3 class="acc-card-title">Active sessions</h3>
      <div class="acc-section-b" style="padding:0">
        <div id="acc-sessions-list">
          ${rows}
        </div>
        <p id="acc-sessions-bulk-err" style="display:none;color:var(--acc,red);font-size:0.8rem;margin:0.5rem 0 0"></p>
        <div style="margin-top:1rem">
          <button class="btn" type="button" id="acc-sessions-revoke-all"${bulkDisabled}>${bulkLabel}</button>
        </div>
      </div>
    </div>
    <script>
    (function () {
      var csrf = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';

      function removeRow(sid) {
        var row = document.getElementById('session-row-' + sid);
        if (row) row.remove();
        // If no non-current rows remain, disable the bulk button
        var remaining = document.querySelectorAll('#acc-sessions-list .acc-session-revoke-btn');
        var bulkBtn = document.getElementById('acc-sessions-revoke-all');
        if (bulkBtn && remaining.length === 0) {
          bulkBtn.disabled = true;
          bulkBtn.textContent = 'No other active sessions';
        }
      }

      // Individual revoke
      document.querySelectorAll('.acc-session-revoke-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var sid = btn.getAttribute('data-sid');
          var errEl = document.getElementById('session-err-' + sid);
          btn.disabled = true;
          fetch('/account/sessions/' + encodeURIComponent(sid), {
            method: 'DELETE',
            headers: { 'X-CSRF-Token': csrf },
          })
            .then(function (r) {
              if (r.ok || r.status === 404) {
                // 404 = already gone — remove silently
                removeRow(sid);
              } else {
                btn.disabled = false;
                if (errEl) { errEl.textContent = 'Could not revoke session — try again.'; errEl.style.display = ''; }
                if (r.status === 429 && errEl) { errEl.textContent = 'Too many requests — wait a moment.'; }
              }
            })
            .catch(function () {
              btn.disabled = false;
              if (errEl) { errEl.textContent = 'Could not revoke session — try again.'; errEl.style.display = ''; }
            });
        });
      });

      // Bulk revoke
      var bulkBtn = document.getElementById('acc-sessions-revoke-all');
      var bulkErr = document.getElementById('acc-sessions-bulk-err');
      if (bulkBtn) {
        bulkBtn.addEventListener('click', function () {
          bulkBtn.disabled = true;
          fetch('/account/sessions', {
            method: 'DELETE',
            headers: { 'X-CSRF-Token': csrf },
          })
            .then(function (r) {
              if (r.ok) {
                document.querySelectorAll('.acc-session-revoke-btn').forEach(function (b) {
                  removeRow(b.getAttribute('data-sid'));
                });
                bulkBtn.textContent = 'No other active sessions';
              } else {
                bulkBtn.disabled = false;
                if (bulkErr) {
                  bulkErr.textContent = r.status === 429
                    ? 'Too many requests — wait a moment.'
                    : 'Could not sign out other devices — try again.';
                  bulkErr.style.display = '';
                }
              }
            })
            .catch(function () {
              bulkBtn.disabled = false;
              if (bulkErr) { bulkErr.textContent = 'Could not sign out other devices — try again.'; bulkErr.style.display = ''; }
            });
        });
      }
    })();
    </script>`;
}


module.exports = router;

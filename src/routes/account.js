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

  const [
    statsUploads, statsAlbums, statsRecipes,
    sessionsResult, recentUploads, albumsResult,
    profileResult,
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
    // active sessions for this user — ACC-4: fetch full sess blob for UA/IP/last-seen
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
  ]);

  const stats = {
    uploads: statsUploads.rows[0].n,
    albums:  statsAlbums.rows[0].n,
    recipes: statsRecipes.rows[0].n,
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
  }, req.session));
}));

// ── ACC-2: Inline profile editing ─────────────────────────────────────────────

router.patch('/account', wrapAsync(async (req, res) => {
  const { userId } = req.session;
  const { name, email, language, theme, notif_enabled } = req.body;

  const hasUserField  = name !== undefined || email !== undefined;
  const hasPrefField  = language !== undefined || theme !== undefined || notif_enabled !== undefined;
  if (!hasUserField && !hasPrefField) {
    return res.status(422).json({ error: 'No valid fields in request body' });
  }

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed || trimmed.length > 100) {
      return res.status(422).json({ error: 'Name is required' });
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
      prefCols.push('notif_enabled');
      prefVals.push(Boolean(notif_enabled));
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

  res.json({ ok: true, key: newKey });
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

function renderAccountPage({ stats, sessions, recentUploads: _recentUploads, albums: _albums, profile }, session) {
  const { role, name } = session;
  const initial = esc((name || '?')[0].toUpperCase());

  // Role badge
  const roleBadgeClass = role === 'admin' ? 'role-badge admin' : 'role-badge';
  const roleLabel = esc(role);

  // Stats strip
  const statsHtml = `
    <div class="acc-stats">
      <div class="acc-stat">
        <div class="acc-stat-n">${stats.uploads}</div>
        <div class="acc-stat-l">uploads</div>
      </div>
      <div class="acc-stat">
        <div class="acc-stat-n">${stats.albums}</div>
        <div class="acc-stat-l">albums</div>
      </div>
      <div class="acc-stat">
        <div class="acc-stat-n">${stats.recipes}</div>
        <div class="acc-stat-l">recipes</div>
      </div>
    </div>`;

  // Avatar block
  const avatarHtml = session.avatarS3Key
    ? `<div class="acc-avatar-wrap">
         <img src="/account/avatar" class="acc-avatar acc-avatar-img" alt="Your avatar">
         <button class="acc-avatar-change btn-icon" aria-label="Change avatar" type="button" id="js-avatar-change">
           <svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
         </button>
         <button class="acc-avatar-remove btn-icon" aria-label="Remove avatar" type="button" id="js-avatar-remove">
           <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
         </button>
       </div>
       <input type="file" id="js-avatar-input" accept="image/jpeg,image/png,image/webp"
              style="display:none" aria-hidden="true">
       <div class="acc-avatar-error" id="js-avatar-err" style="display:none"></div>`
    : `<div class="acc-avatar-wrap">
         <div class="acc-avatar" id="js-avatar-initial">${initial}</div>
         <button class="acc-avatar-change btn-icon" aria-label="Change avatar" type="button" id="js-avatar-change">
           <svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
         </button>
       </div>
       <input type="file" id="js-avatar-input" accept="image/jpeg,image/png,image/webp"
              style="display:none" aria-hidden="true">
       <div class="acc-avatar-error" id="js-avatar-err" style="display:none"></div>`;

  // Identity card
  const identityCard = `
    <div class="acc-card">
      ${avatarHtml}
      <div>
        <div class="acc-name">${esc(name)}</div>
        <span class="${roleBadgeClass}">${roleLabel}</span>
        ${statsHtml}
      </div>
    </div>`;

  // Profile section (editable fields)
  const profileSection = profile ? `
    <div class="acc-section">
      <div class="acc-section-h">Profile</div>
      <div class="acc-section-b">
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
                data-current="${profile.notif_enabled}">${profile.notif_enabled ? 'On' : 'Off'}</span>
        </div>
      </div>
    </div>` : '';

  // Permissions strip
  const perms = buildPermsPills(role);
  const permsSection = `
    <div class="acc-section">
      <div class="acc-section-h">Permissions</div>
      <div class="acc-section-b">
        <div class="acc-perms">${perms}</div>
      </div>
    </div>`;

  // Sessions section — ACC-4: always shown (even with just 1 session)
  const sessionsSection = buildSessionsSection(sessions);

  // Quick links
  const linksSection = buildQuickLinks(role);

  const accountScript = `<script>(function(){
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
    cancelBtn.textContent = '✕';

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
          var nameEl = document.querySelector('.acc-name');
          if (nameEl) nameEl.textContent = value;
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
          var oldEl = avatarWrap.querySelector('.acc-avatar, .acc-avatar-img');
          var img = document.createElement('img');
          img.src = '/account/avatar?_=' + Date.now();
          img.className = 'acc-avatar acc-avatar-img';
          img.alt = '';
          if (oldEl) avatarWrap.replaceChild(img, oldEl);

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
        var initial = (document.querySelector('.acc-name') || {}).textContent || '?';
        var div = document.createElement('div');
        div.className = 'acc-avatar';
        div.id = 'js-avatar-initial';
        div.textContent = initial[0].toUpperCase();
        var oldImg = avatarWrap.querySelector('.acc-avatar-img, .acc-avatar');
        if (oldImg) avatarWrap.replaceChild(div, oldImg);

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

  const body = `
    <div class="acc-wrap">
      ${identityCard}
      ${profileSection}
      ${permsSection}
      ${sessionsSection}
      ${linksSection}
      ${accountScript}
    </div>`;

  return page('My Account', body, session);
}

function buildPermsPills(role) {
  const perms = [
    { label: 'view photos',    yes: true },
    { label: 'upload photos',  yes: role === 'admin' || role === 'editor' },
    { label: 'manage albums',  yes: role === 'admin' || role === 'editor' },
    { label: 'manage tags',    yes: role === 'admin' },
    { label: 'manage users',   yes: role === 'admin' },
    { label: 'access AI tools', yes: role === 'admin' },
  ];
  return perms.map(p => `<span class="acc-perm${p.yes ? ' yes' : ''}">${p.yes ? '✓' : '⊘'} ${esc(p.label)}</span>`).join('');
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
    <div class="acc-section" id="acc-sessions-section">
      <div class="acc-section-h">Active sessions</div>
      <div class="acc-section-b">
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

function buildQuickLinks(role) {
  const links = [
    `<a class="btn btn-secondary" href="/account/password">Change password</a>`,
  ];
  if (role === 'editor' || role === 'admin') {
    links.push(`<a class="btn btn-secondary" href="/photos">My uploads</a>`);
    links.push(`<a class="btn btn-secondary" href="/albums">My albums</a>`);
  }
  if (role === 'admin') {
    links.push(`<a class="btn btn-secondary" href="/admin/users">Manage users</a>`);
    links.push(`<a class="btn btn-secondary" href="/admin/ai">AI tools</a>`);
  }
  links.push(`<a class="btn btn-secondary btn-danger-outline" href="/account/delete">Delete account</a>`);
  return `
    <div class="acc-section">
      <div class="acc-section-h">Quick links</div>
      <div class="acc-section-b">
        <div class="acc-links">
          ${links.join('\n          ')}
        </div>
      </div>
    </div>`;
}

module.exports = router;

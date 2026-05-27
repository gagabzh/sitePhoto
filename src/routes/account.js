const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { page, esc } = require('../layout');
const { wrapAsync } = require('../middleware');
const { deletePhoto } = require('../storage');

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

// ── FE-1.3: Account dashboard ─────────────────────────────────────────────────

router.get('/account', wrapAsync(async (req, res) => {
  const { userId, role } = req.session;
  const isViewer = role === 'viewer';

  const [statsUploads, statsAlbums, statsRecipes, sessionsResult, recentUploads, albumsResult] = await Promise.all([
    // stats: upload count (role-aware)
    isViewer
      ? db.query(`
          SELECT COUNT(DISTINCT p.id)::int AS n
          FROM photos p
          JOIN album_photos ap ON ap.photo_id = p.id
          JOIN album_access aa ON aa.album_id = ap.album_id
          WHERE aa.viewer_id = $1
        `, [userId])
      : db.query('SELECT COUNT(*)::int AS n FROM photos WHERE user_id = $1', [userId]),
    // stats: album count (role-aware)
    isViewer
      ? db.query('SELECT COUNT(*)::int AS n FROM album_access WHERE viewer_id = $1', [userId])
      : db.query('SELECT COUNT(*)::int AS n FROM albums WHERE user_id = $1', [userId]),
    // stats: recipes count
    db.query('SELECT COUNT(*)::int AS n FROM tag_recipes WHERE user_id = $1', [userId]),
    // active sessions for this user
    db.query(
      `SELECT sid, expire FROM session WHERE (sess->>'userId')::int = $1 ORDER BY expire DESC`,
      [userId]
    ),
    // recent uploads (viewers have no uploads)
    isViewer
      ? Promise.resolve({ rows: [] })
      : db.query(
          `SELECT id, title, s3_key, taken_at, created_at FROM photos WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
          [userId]
        ),
    // albums
    isViewer
      ? db.query(
          `SELECT a.id, a.title FROM albums a JOIN album_access aa ON aa.album_id = a.id WHERE aa.viewer_id = $1 ORDER BY a.created_at DESC`,
          [userId]
        )
      : db.query('SELECT id, title FROM albums WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
  ]);

  const stats = {
    uploads: statsUploads.rows[0].n,
    albums:  statsAlbums.rows[0].n,
    recipes: statsRecipes.rows[0].n,
  };
  const sessions = sessionsResult.rows.map(r => ({
    sid:       r.sid,
    expire:    r.expire,
    isCurrent: r.sid === req.sessionID,
  }));

  res.send(renderAccountPage({
    stats,
    sessions,
    recentUploads: recentUploads.rows,
    albums: albumsResult.rows,
  }, req.session));
}));

// ── FE-1.3: Revoke a single session ──────────────────────────────────────────

router.post('/account/sessions/:sid/revoke', wrapAsync(async (req, res) => {
  await db.query(
    `DELETE FROM session WHERE sid = $1 AND (sess->>'userId')::int = $2`,
    [req.params.sid, req.session.userId]
  );
  res.redirect('/account');
}));

// ── FE-1.3: Revoke all other sessions ────────────────────────────────────────

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

// ── FE-1.4: Account page HTML template ───────────────────────────────────────

function renderAccountPage({ stats, sessions, recentUploads: _recentUploads, albums: _albums }, session) {
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

  // Identity card
  const identityCard = `
    <div class="acc-card">
      <div class="acc-avatar">${initial}</div>
      <div>
        <div class="acc-name">${esc(name)}</div>
        <span class="${roleBadgeClass}">${roleLabel}</span>
        ${statsHtml}
      </div>
    </div>`;

  // Permissions strip
  const perms = buildPermsPills(role);
  const permsSection = `
    <div class="acc-section">
      <div class="acc-section-h">Permissions</div>
      <div class="acc-section-b">
        <div class="acc-perms">${perms}</div>
      </div>
    </div>`;

  // Sessions section — only shown when there is more than one active session
  const sessionsSection = sessions.length > 1 ? buildSessionsSection(sessions) : '';

  // Quick links
  const linksSection = buildQuickLinks(role);

  const body = `
    <div class="acc-wrap">
      ${identityCard}
      ${permsSection}
      ${sessionsSection}
      ${linksSection}
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

function buildSessionsSection(sessions) {
  const rows = sessions.map(s => {
    const expireStr = esc(new Date(s.expire).toISOString().replace('T', ' ').slice(0, 16));
    if (s.isCurrent) {
      return `
        <div class="acc-session-row">
          <span class="acc-session-exp">${expireStr}</span>
          <span class="role-badge">current</span>
        </div>`;
    }
    return `
      <div class="acc-session-row">
        <span class="acc-session-exp">${expireStr}</span>
        <form method="POST" action="/account/sessions/${esc(s.sid)}/revoke">
          <button class="btn" type="submit" style="font-size:0.72rem;padding:2px 8px">Revoke</button>
        </form>
      </div>`;
  }).join('');

  return `
    <div class="acc-section">
      <div class="acc-section-h">Active sessions</div>
      <div class="acc-section-b">
        ${rows}
        <div style="margin-top:1rem">
          <form method="POST" action="/account/sessions/revoke-others">
            <button class="btn" type="submit">Sign out all other devices</button>
          </form>
        </div>
      </div>
    </div>`;
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

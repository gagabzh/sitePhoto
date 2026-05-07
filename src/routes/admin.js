const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { page, esc } = require('../layout');
const { UPLOAD_DIR } = require('../uploadHelpers');


function roleOptions(selected) {
  return ['admin', 'editor', 'viewer'].map(r =>
    `<option value="${r}" ${selected === r ? 'selected' : ''}>${r.charAt(0).toUpperCase() + r.slice(1)}</option>`
  ).join('');
}

// US-1: List users
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, name, email, role, created_at FROM users ORDER BY created_at'
  );

  const tbody = rows.map(u => {
    const initial = esc((u.name || '?')[0].toUpperCase());
    const isSelf = u.id === req.session.userId;
    const joined = new Date(u.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return `
      <tr>
        <td>
          <div class="ul-name-cell">
            <span class="ul-av">${initial}</span>
            <div>
              <div class="ul-nm">${esc(u.name)}${isSelf ? '<span class="ul-you">← you</span>' : ''}</div>
              <div class="ul-email">${esc(u.email)}</div>
            </div>
          </div>
        </td>
        <td><span class="ul-chip ul-chip-${esc(u.role)}">${esc(u.role.toUpperCase())}</span></td>
        <td class="ul-since">${joined}</td>
        <td>
          <div class="ul-acts">
            <a class="ul-pill" href="/admin/users/${u.id}/edit">edit</a>
            <a class="ul-pill" href="/admin/users/${u.id}/password">password</a>
            ${!isSelf ? `
              <form class="inline" method="POST" action="/admin/users/${u.id}/delete"
                onsubmit="return confirm('Delete this user?')">
                <button class="ul-pill ul-pill-danger" type="submit">delete</button>
              </form>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');

  res.send(page('Users', `
    <div class="ul-page-h">
      <div>
        <h1>the <em>ledger</em>.</h1>
        <p class="ul-sub">${rows.length} people · who they are, what role they play.</p>
      </div>
      <div>
        <a class="btn" href="/admin/users/new">+ New user</a>
      </div>
    </div>
    <table class="ul-table">
      <thead>
        <tr>
          <th>NAME</th>
          <th>ROLE</th>
          <th>JOINED</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${tbody}</tbody>
    </table>
    <div class="ul-foot">// ${rows.length} of ${rows.length} · sorted by join date</div>
  `, req.session));
});

// US-2: Create user
router.get('/new', (req, res) => {
  const error = req.query.error ? '<p class="msg-error">This email is already in use.</p>' : '';
  res.send(page('New user', `
    <h1>New user</h1>
    <div class="card">
      ${error}
      <form class="form-col" method="POST" action="/admin/users">
        <label>Name <input type="text" name="name" required></label>
        <label>Email <input type="email" name="email" required></label>
        <label>Password <input type="password" name="password" required minlength="8"></label>
        <label>Role <select name="role">${roleOptions('viewer')}</select></label>
        <div class="row">
          <button class="btn" type="submit">Create</button>
          <a class="btn btn-secondary" href="/admin/users">Cancel</a>
        </div>
      </form>
    </div>
  `, req.session));
});

router.post('/', async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [name, email, hash, role]
    );
    res.redirect('/admin/users');
  } catch (err) {
    if (err.code === '23505') return res.redirect('/admin/users/new?error=1');
    throw err;
  }
});

// US-3: Edit user
router.get('/:id/edit', async (req, res) => {
  const { rows } = await db.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.params.id]);
  const u = rows[0];
  if (!u) return res.status(404).send('User not found');
  const isSelf = u.id === req.session.userId;
  const error = req.query.error ? '<p class="msg-error">This email is already in use.</p>' : '';

  res.send(page(`Edit — ${u.name}`, `
    <h1>Edit user</h1>
    <div class="card">
      ${error}
      <form class="form-col" method="POST" action="/admin/users/${u.id}">
        <label>Name <input type="text" name="name" value="${esc(u.name)}" required></label>
        <label>Email <input type="email" name="email" value="${esc(u.email)}" required></label>
        <label>Role
          <select name="role" ${isSelf ? 'disabled' : ''}>${roleOptions(u.role)}</select>
          ${isSelf ? `<input type="hidden" name="role" value="${esc(u.role)}"><small>You cannot change your own role.</small>` : ''}
        </label>
        <div class="row">
          <button class="btn" type="submit">Save</button>
          <a class="btn btn-secondary" href="/admin/users">Cancel</a>
        </div>
      </form>
    </div>
  `, req.session));
});

router.post('/:id', async (req, res) => {
  const { name, email, role } = req.body;
  try {
    await db.query(
      'UPDATE users SET name = $1, email = $2, role = $3 WHERE id = $4',
      [name, email, role, req.params.id]
    );
    res.redirect('/admin/users');
  } catch (err) {
    if (err.code === '23505') return res.redirect(`/admin/users/${req.params.id}/edit?error=1`);
    throw err;
  }
});

// US-4: Delete user
router.post('/:id/delete', async (req, res) => {
  if (parseInt(req.params.id) === req.session.userId) return res.redirect('/admin/users');
  const { rows: photos } = await db.query('SELECT filename FROM photos WHERE user_id = $1', [req.params.id]);
  await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  for (const p of photos) {
    fs.promises.unlink(path.join(UPLOAD_DIR, p.filename)).catch(() => {});
  }
  res.redirect('/admin/users');
});

// US-5: Admin resets a user's password
router.get('/:id/password', async (req, res) => {
  const { rows } = await db.query('SELECT id, name FROM users WHERE id = $1', [req.params.id]);
  const u = rows[0];
  if (!u) return res.status(404).send('User not found');
  const success = req.query.done ? '<p class="msg-success">Password updated successfully.</p>' : '';

  res.send(page(`Reset password — ${esc(u.name)}`, `
    <h1>Reset password</h1>
    <p>Setting a new password for <strong>${esc(u.name)}</strong>.</p>
    <div class="card">
      ${success}
      <form class="form-col" method="POST" action="/admin/users/${u.id}/password">
        <label>New password <input type="password" name="password" required minlength="8"></label>
        <div class="row">
          <button class="btn" type="submit">Reset</button>
          <a class="btn btn-secondary" href="/admin/users">Cancel</a>
        </div>
      </form>
    </div>
  `, req.session));
});

router.post('/:id/password', async (req, res) => {
  const hash = await bcrypt.hash(req.body.password, 10);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
  res.redirect(`/admin/users/${req.params.id}/password?done=1`);
});

module.exports = router;

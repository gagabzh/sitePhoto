const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { page, esc } = require('../layout');

function roleBadge(role) {
  return `<span class="badge badge-${esc(role)}">${esc(role)}</span>`;
}

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
  const tbody = rows.map(u => `
    <tr>
      <td>${esc(u.name)}</td>
      <td>${esc(u.email)}</td>
      <td>${roleBadge(u.role)}</td>
      <td>${new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
      <td>
        <div class="actions">
          <a class="btn btn-sm btn-secondary" href="/admin/users/${u.id}/edit">Edit</a>
          <a class="btn btn-sm" href="/admin/users/${u.id}/password">Password</a>
          ${u.id !== req.session.userId ? `
            <form class="inline" method="POST" action="/admin/users/${u.id}/delete"
              onsubmit="return confirm('Delete ${esc(u.name)}?')">
              <button class="btn btn-sm btn-danger">Delete</button>
            </form>` : ''}
        </div>
      </td>
    </tr>`).join('');

  res.send(page('Users', `
    <div class="top-bar">
      <h1>Users</h1>
      <a class="btn" href="/admin/users/new">+ New user</a>
    </div>
    <table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Created</th><th>Actions</th></tr></thead>
      <tbody>${tbody}</tbody>
    </table>
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
  await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
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

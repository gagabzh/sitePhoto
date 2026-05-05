const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { page, esc } = require('../layout');

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

router.post('/account/password', async (req, res) => {
  const { current, password } = req.body;
  const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);
  const valid = await bcrypt.compare(current, rows[0].password_hash);
  if (!valid) return res.redirect('/account/password?error=1');
  const hash = await bcrypt.hash(password, 10);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.session.userId]);
  res.redirect('/account/password?done=1');
});

module.exports = router;

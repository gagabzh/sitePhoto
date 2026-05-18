const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { page } = require('../layout');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  const error = req.query.error ? '<p class="msg-error">Invalid email or password.</p>' : '';
  res.send(page('Login', `
    <div class="card" style="max-width:360px;margin:4rem auto">
      <h2 style="margin-top:0">Sign in</h2>
      ${error}
      <form class="form-col" method="POST" action="/login">
        <label>Email <input type="email" name="email" required autofocus></label>
        <label>Password <input type="password" name="password" required></label>
        <button class="btn" type="submit">Login</button>
      </form>
    </div>
  `));
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await db.query(
    'SELECT id, name, password_hash, role FROM users WHERE email = $1',
    [email]
  );
  const user = rows[0];
  if (user && await bcrypt.compare(password, user.password_hash)) {
    const returnTo = req.session.returnTo;
    req.session.userId = user.id;
    req.session.name = user.name;
    req.session.role = user.role;
    delete req.session.returnTo;
    res.redirect(returnTo || (user.role === 'viewer' ? '/albums' : '/photos'));
  } else {
    res.redirect('/login?error=1');
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;

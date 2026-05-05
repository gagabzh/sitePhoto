const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
}));

async function seedAdmin() {
  const user = process.env.SEED_USER || 'saev';
  const pass = process.env.SEED_PASS || 'changeme';
  const existing = await db.query('SELECT id FROM users WHERE username = $1', [user]);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(pass, 10);
    await db.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [user, hash]);
    console.log(`Created user "${user}"`);
  }
}

function requireAuth(req, res, next) {
  if (req.session.userId) return next();
  res.redirect('/login');
}

app.get('/login', (req, res) => {
  const error = req.query.error ? '<p style="color:red">Invalid credentials</p>' : '';
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Login</title>
  <style>
    body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f0f0; }
    form { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); display: flex; flex-direction: column; gap: 1rem; min-width: 280px; }
    input { padding: 0.5rem; font-size: 1rem; border: 1px solid #ccc; border-radius: 4px; }
    button { padding: 0.6rem; font-size: 1rem; background: #333; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #555; }
  </style>
</head>
<body>
  <form method="POST" action="/login">
    <h2 style="margin:0">Sign in</h2>
    ${error}
    <input type="text" name="username" placeholder="Username" required autofocus>
    <input type="password" name="password" placeholder="Password" required>
    <button type="submit">Login</button>
  </form>
</body>
</html>`);
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await db.query('SELECT id, password_hash FROM users WHERE username = $1', [username]);
  const user = result.rows[0];
  if (user && await bcrypt.compare(password, user.password_hash)) {
    req.session.userId = user.id;
    req.session.username = username;
    res.redirect('/');
  } else {
    res.redirect('/login?error=1');
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/', requireAuth, (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>sitephoto</title>
  <style>
    body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
  </style>
</head>
<body>
  <h1>Hello ${req.session.username}</h1>
  <form method="POST" action="/logout">
    <button type="submit">Logout</button>
  </form>
</body>
</html>`);
});

db.query('SELECT 1')
  .then(() => seedAdmin())
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  });

const http    = require('http');
const bcrypt  = require('bcryptjs');
const db      = require('./db');
const app     = require('./app');
const migrate = require('./migrate');
const { initSocketIO } = require('./notifications');
const { startQueueEvents } = require('./queue/events');

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'production') {
  const missing = ['SEED_EMAIL', 'SEED_PASS'].filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`FATAL: ${missing.join(', ')} must be set via environment variables in production.`);
    process.exit(1);
  }
} else if (!process.env.SEED_EMAIL || !process.env.SEED_PASS) {
  console.warn('WARNING: SEED_EMAIL/SEED_PASS not set — using insecure defaults. Set them before deploying.');
}

async function seedAdmin() {
  const name  = process.env.SEED_NAME  || 'Saev';
  const email = process.env.SEED_EMAIL || 'saev.bzh@pm.me';
  const pass  = process.env.SEED_PASS  || 'changeme';
  const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (rows.length === 0) {
    const hash = await bcrypt.hash(pass, 10);
    await db.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [name, email, hash, 'admin']
    );
    console.log(`Created admin "${email}"`);
  }
}

db.query('SELECT 1')
  .then(() => migrate())
  .then(() => seedAdmin())
  .then(() => {
    const server = http.createServer(app);
    initSocketIO(server);
    startQueueEvents();
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  });

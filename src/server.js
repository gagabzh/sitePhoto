const bcrypt = require('bcryptjs');
const db = require('./db');
const app = require('./app');

const PORT = process.env.PORT || 3000;

async function seedAdmin() {
  const name = process.env.SEED_NAME || 'Saev';
  const email = process.env.SEED_EMAIL || 'saev.bzh@pm.me';
  const pass = process.env.SEED_PASS || 'changeme';
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

const fs   = require('fs');
const path = require('path');
const db   = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const { rows } = await db.query('SELECT version FROM schema_migrations');
  const applied  = new Set(rows.map(r => r.version));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await db.query(sql);
    await db.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
    console.log(`Migration applied: ${file}`);
  }
}

module.exports = migrate;

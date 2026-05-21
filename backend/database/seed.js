#!/usr/bin/env node
/**
 * @file backend/database/seed.js
 * @description Seed runner — applies the `.sql` files in
 *   `database/seeds/` in filename order against the configured
 *   database. Idempotent seeds (INSERT … ON DUPLICATE KEY / INSERT
 *   IGNORE) can be re-run safely.
 * @author Dev A
 *
 * Usage:
 *   node database/seed.js      (or `npm run seed`)
 *
 * Reuses the app's DB_* env vars. No-ops cleanly when the seeds
 * directory is empty, so the `seed` npm script is always safe to call.
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SEEDS_DIR = path.join(__dirname, 'seeds');

const main = async () => {
  if (!fs.existsSync(SEEDS_DIR)) {
    console.log(`[seed] no seeds directory (${SEEDS_DIR}) — nothing to do`);
    process.exit(0);
  }

  const files = fs
    .readdirSync(SEEDS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('[seed] seeds directory is empty — nothing to do');
    process.exit(0);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    multipleStatements: true, // seed files may contain multiple INSERTs
  });

  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(SEEDS_DIR, file), 'utf8').trim();
      if (!sql) continue;
      // eslint-disable-next-line no-await-in-loop
      await conn.query(sql);
      console.log(`[seed] ✓ applied ${file}`);
    }
    console.log(`[seed] done (${files.length} file(s))`);
  } catch (err) {
    console.error(`[seed] ✗ ${err.message}`);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
};

if (require.main === module) {
  main();
}

module.exports = { main };

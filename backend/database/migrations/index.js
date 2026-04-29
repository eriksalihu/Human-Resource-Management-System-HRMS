/**
 * @file backend/database/migrations/index.js
 * @description Migration runner — executes numbered SQL files in order, tracks state in a `_migrations` table, supports basic rollback
 * @author Dev A
 *
 * Conventions:
 *   - Each migration is a `NNN_description.sql` file in this directory.
 *     The leading three-digit number determines execution order.
 *   - Optional rollback: a sibling file ending in `.rollback.sql` will be
 *     executed by `--down=NNN_description.sql`.
 *   - Executed migrations are recorded in `_migrations` (filename + ts).
 *
 * Usage:
 *   node backend/database/migrations/index.js               # apply pending
 *   node backend/database/migrations/index.js --status      # list state
 *   node backend/database/migrations/index.js --dry-run     # plan only
 *   node backend/database/migrations/index.js --down=014_create_trainings_table.sql
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({
  path: path.join(__dirname, '../../.env'),
});

/** Directory holding migration .sql files. */
const MIGRATIONS_DIR = __dirname;

/** Tracking table for applied migrations. */
const TRACKING_TABLE = '_migrations';

/**
 * Parse command-line flags.
 *
 * @param {string[]} argv
 * @returns {{
 *   status: boolean,
 *   dryRun: boolean,
 *   down: string|null,
 *   help: boolean,
 * }}
 */
const parseArgs = (argv) => {
  const out = { status: false, dryRun: false, down: null, help: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--status') out.status = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--down=')) out.down = arg.slice('--down='.length);
  }
  return out;
};

/** Print usage. */
const printHelp = () => {
  console.log(`Usage: node backend/database/migrations/index.js [options]

Options:
  --status                Show applied + pending migrations and exit
  --dry-run               Print the plan without executing
  --down=<filename.sql>   Roll back the named migration (requires
                          a sibling <filename>.rollback.sql)
  --help, -h              Show this message

Migrations live in: ${MIGRATIONS_DIR}
`);
};

/**
 * List all migration files in numbered order. Anything not matching the
 * `NNN_*.sql` pattern (or rollback files) is filtered out.
 *
 * @returns {string[]} Filenames sorted by numeric prefix
 */
const listMigrationFiles = () =>
  fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(
      (f) =>
        /^\d{3,}_.+\.sql$/.test(f) &&
        !f.endsWith('.rollback.sql')
    )
    .sort((a, b) => {
      const an = parseInt(a.slice(0, 3), 10);
      const bn = parseInt(b.slice(0, 3), 10);
      return an - bn;
    });

/**
 * Open a connection that supports executing multi-statement SQL, which is
 * essential for migration files containing CREATE TABLE plus indexes/FKs.
 */
const openConnection = async () =>
  mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

/**
 * Ensure the tracking table exists. Idempotent — first run creates it;
 * subsequent runs no-op.
 */
const ensureTrackingTable = async (connection) => {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      id INT PRIMARY KEY AUTO_INCREMENT,
      filename VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

/**
 * Fetch the set of filenames that have already been applied.
 *
 * @param {Connection} connection
 * @returns {Promise<Set<string>>}
 */
const getAppliedSet = async (connection) => {
  const [rows] = await connection.query(
    `SELECT filename FROM ${TRACKING_TABLE}`
  );
  return new Set(rows.map((r) => r.filename));
};

/**
 * Apply a single migration. The SQL file is loaded, executed inside a
 * transaction (so partial failure rolls back), and on success its
 * filename is recorded in the tracking table.
 *
 * @param {Connection} connection
 * @param {string} filename
 */
const applyMigration = async (connection, filename) => {
  const fullPath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(fullPath, 'utf8').trim();

  if (!sql) {
    console.log(`  - ${filename}: empty file, skipping`);
    await connection.query(
      `INSERT INTO ${TRACKING_TABLE} (filename) VALUES (?)`,
      [filename]
    );
    return;
  }

  await connection.beginTransaction();
  try {
    await connection.query(sql);
    await connection.query(
      `INSERT INTO ${TRACKING_TABLE} (filename) VALUES (?)`,
      [filename]
    );
    await connection.commit();
    console.log(`  ✓ ${filename}`);
  } catch (err) {
    await connection.rollback();
    throw new Error(
      `Migration ${filename} failed: ${err.message}\n` +
        `(transaction rolled back)`
    );
  }
};

/**
 * Roll back a single migration by executing its sibling
 * `<filename>.rollback.sql` and removing the tracking row.
 *
 * @param {Connection} connection
 * @param {string} filename - The original migration filename (e.g. "014_*.sql")
 */
const rollbackMigration = async (connection, filename) => {
  const original = path.join(MIGRATIONS_DIR, filename);
  if (!fs.existsSync(original)) {
    throw new Error(`No such migration: ${filename}`);
  }

  const rollbackName = filename.replace(/\.sql$/, '.rollback.sql');
  const rollbackPath = path.join(MIGRATIONS_DIR, rollbackName);

  if (!fs.existsSync(rollbackPath)) {
    throw new Error(
      `No rollback file found at ${rollbackName}. ` +
        `Create it next to the original migration to enable rollback.`
    );
  }

  const sql = fs.readFileSync(rollbackPath, 'utf8').trim();
  if (!sql) {
    throw new Error(`Rollback file ${rollbackName} is empty`);
  }

  await connection.beginTransaction();
  try {
    await connection.query(sql);
    await connection.query(
      `DELETE FROM ${TRACKING_TABLE} WHERE filename = ?`,
      [filename]
    );
    await connection.commit();
    console.log(`  ✓ Rolled back: ${filename}`);
  } catch (err) {
    await connection.rollback();
    throw new Error(
      `Rollback of ${filename} failed: ${err.message}\n` +
        `(transaction rolled back)`
    );
  }
};

/**
 * Print the current migration state (applied vs pending) and exit.
 *
 * @param {Connection} connection
 */
const printStatus = async (connection) => {
  const allFiles = listMigrationFiles();
  const applied = await getAppliedSet(connection);

  console.log(`\nMigrations directory: ${MIGRATIONS_DIR}`);
  console.log(`Total: ${allFiles.length} files\n`);

  for (const file of allFiles) {
    const mark = applied.has(file) ? '✓ applied ' : '· pending ';
    console.log(`  ${mark} ${file}`);
  }

  const pending = allFiles.filter((f) => !applied.has(f));
  console.log(
    `\nSummary: ${applied.size} applied, ${pending.length} pending.`
  );
};

/**
 * Apply every pending migration in order. Stops at the first failure
 * (the failed migration is rolled back inside its own transaction; later
 * migrations are not attempted).
 */
const migrateUp = async () => {
  const argv = parseArgs(process.argv.slice(2));

  if (argv.help) {
    printHelp();
    return;
  }

  let connection;
  try {
    connection = await openConnection();
    await ensureTrackingTable(connection);

    if (argv.status) {
      await printStatus(connection);
      return;
    }

    if (argv.down) {
      console.log(`Rolling back: ${argv.down}`);
      await rollbackMigration(connection, argv.down);
      return;
    }

    const allFiles = listMigrationFiles();
    const applied = await getAppliedSet(connection);
    const pending = allFiles.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('Nothing to migrate — database is up to date.');
      return;
    }

    console.log(`Pending migrations (${pending.length}):`);
    pending.forEach((f, idx) => console.log(`  ${idx + 1}. ${f}`));

    if (argv.dryRun) {
      console.log('\n[dry-run] No migrations were executed.');
      return;
    }

    console.log('\nApplying...');
    const startedAt = Date.now();
    for (const filename of pending) {
      await applyMigration(connection, filename);
    }
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `\n✓ ${pending.length} migration(s) applied in ${elapsed}s.`
    );
  } catch (err) {
    console.error(`\n✗ Migration runner failed: ${err.message}`);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};

// Run if invoked directly. Skipping when required keeps the module
// importable from test code.
if (require.main === module) {
  migrateUp();
}

module.exports = {
  TRACKING_TABLE,
  listMigrationFiles,
  applyMigration,
  rollbackMigration,
  ensureTrackingTable,
  getAppliedSet,
  parseArgs,
  migrateUp,
};

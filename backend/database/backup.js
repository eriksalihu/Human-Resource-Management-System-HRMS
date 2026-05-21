#!/usr/bin/env node
/**
 * @file backend/database/backup.js
 * @description Database backup script (commit 300). Dumps the MySQL
 *   schema + data via `mysqldump`, writes a timestamped, gzip-compressed
 *   file to a configurable output directory, and prunes backups older
 *   than a retention window.
 * @author Dev A
 *
 * Usage:
 *   node database/backup.js
 *   npm run backup                       # via the package.json script
 *
 * Environment (reuses the app's DB_* vars; all backup knobs optional):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME   — connection
 *   BACKUP_DIR        — output directory (default ./backups)
 *   BACKUP_RETENTION_DAYS — delete .sql.gz older than this (default 14)
 *
 * Notes:
 *   - The password is passed to mysqldump via the MYSQL_PWD env var, not
 *     a `-p` flag, so it never shows up in the process list / `ps`.
 *   - Output is streamed straight through gzip, so even a large DB never
 *     buffers the whole dump in Node memory.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');

const {
  DB_HOST = 'localhost',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASS = '',
  DB_NAME,
  BACKUP_DIR = path.resolve(__dirname, '../backups'),
  BACKUP_RETENTION_DAYS = '14',
} = process.env;

/** YYYY-MM-DD_HH-MM-SS stamp for the filename (filesystem-safe). */
const timestamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
  );
};

/**
 * Delete `*.sql.gz` backups older than the retention window so the
 * directory doesn't grow without bound.
 *
 * @param {string} dir
 * @param {number} retentionDays
 * @returns {number} Count of files deleted
 */
const pruneOldBackups = (dir, retentionDays) => {
  if (!fs.existsSync(dir)) return 0;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.sql.gz')) continue;
    const full = path.join(dir, file);
    try {
      if (fs.statSync(full).mtimeMs < cutoff) {
        fs.unlinkSync(full);
        removed += 1;
      }
    } catch {
      /* race / permission — skip this file */
    }
  }
  return removed;
};

/**
 * Run the backup. Resolves with the output path on success.
 *
 * @returns {Promise<string>}
 */
const runBackup = () =>
  new Promise((resolve, reject) => {
    if (!DB_NAME) {
      reject(new Error('DB_NAME is not set — cannot back up an unnamed database'));
      return;
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const outPath = path.join(
      BACKUP_DIR,
      `${DB_NAME}_${timestamp()}.sql.gz`
    );

    // --single-transaction → consistent snapshot without locking InnoDB
    //   tables; --quick streams rows instead of buffering; --routines /
    //   --triggers / --events capture the full schema.
    const args = [
      `--host=${DB_HOST}`,
      `--port=${DB_PORT}`,
      `--user=${DB_USER}`,
      '--single-transaction',
      '--quick',
      '--routines',
      '--triggers',
      '--events',
      DB_NAME,
    ];

    // Password via env (MYSQL_PWD) so it's not visible in `ps`.
    const dump = spawn('mysqldump', args, {
      env: { ...process.env, MYSQL_PWD: DB_PASS },
    });
    const gzip = zlib.createGzip();
    const out = fs.createWriteStream(outPath);

    let stderr = '';
    dump.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    dump.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            'mysqldump not found on PATH — install the MySQL client tools.'
          )
        );
      } else {
        reject(err);
      }
    });

    dump.on('close', (code) => {
      if (code !== 0) {
        // Clean up the partial file on failure.
        out.destroy();
        fs.rm(outPath, { force: true }, () => {});
        reject(
          new Error(`mysqldump exited with code ${code}: ${stderr.trim()}`)
        );
      }
    });

    out.on('finish', () => resolve(outPath));
    out.on('error', reject);

    // dump → gzip → file
    dump.stdout.pipe(gzip).pipe(out);
  });

/** CLI entry point. */
const main = async () => {
  const start = Date.now();
  console.log(`[backup] starting dump of "${DB_NAME}" → ${BACKUP_DIR}`);
  try {
    const outPath = await runBackup();
    const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
    const secs = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[backup] ✓ ${path.basename(outPath)} (${sizeMB} MB, ${secs}s)`);

    const pruned = pruneOldBackups(
      BACKUP_DIR,
      parseInt(BACKUP_RETENTION_DAYS, 10) || 14
    );
    if (pruned > 0) {
      console.log(`[backup] pruned ${pruned} backup(s) older than ${BACKUP_RETENTION_DAYS} days`);
    }
    process.exit(0);
  } catch (err) {
    console.error(`[backup] ✗ ${err.message}`);
    process.exit(1);
  }
};

// Run only when invoked directly (`node database/backup.js`), so the
// functions stay importable/testable.
if (require.main === module) {
  main();
}

module.exports = { runBackup, pruneOldBackups };

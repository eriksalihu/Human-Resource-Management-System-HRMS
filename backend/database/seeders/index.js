/**
 * @file backend/database/seeders/index.js
 * @description Master seeder runner — executes individual seeders in dependency order
 * @author Dev A
 *
 * Each individual seeder file is its own self-contained Node script that
 * opens its own DB connection (so they remain runnable in isolation
 * during development). This master runner spawns them sequentially as
 * child processes, enforces dependency order, and bails on the first
 * non-zero exit code.
 *
 * Why subprocesses instead of `require()`-ing each seeder?
 *   - Each seeder file calls its `seedX()` function at module load time.
 *     A `require()` would run the seed immediately, before the runner
 *     could orchestrate ordering and capture its exit code cleanly.
 *   - Subprocesses also give us a hard isolation boundary so a stray
 *     `process.exit(1)` from a seeder doesn't tear down the whole runner.
 *
 * Usage:
 *   node backend/database/seeders/index.js          # run all
 *   node backend/database/seeders/index.js --only=roles,users   # subset
 *   node backend/database/seeders/index.js --dry-run            # show plan
 */

const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

/**
 * Ordered list of seeders. Order matters — later seeders FK to earlier
 * tables, so any reordering would break referential integrity.
 *
 * Each entry maps a logical name to the seeder file inside this dir.
 */
const SEEDERS = [
  { name: 'roles',       file: 'roles.seed.js' },
  { name: 'users',       file: 'users.seed.js' },
  { name: 'departments', file: 'departments.seed.js' },
  { name: 'positions',   file: 'positions.seed.js' },
  { name: 'employees',   file: 'employees.seed.js' },
];

/**
 * Parse `--key=value` and `--flag` style arguments from `argv`.
 *
 * @param {string[]} argv - typically process.argv.slice(2)
 * @returns {{ only: string[]|null, dryRun: boolean, help: boolean }}
 */
const parseArgs = (argv) => {
  const out = { only: null, dryRun: false, help: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      out.help = true;
    } else if (arg === '--dry-run') {
      out.dryRun = true;
    } else if (arg.startsWith('--only=')) {
      out.only = arg
        .slice('--only='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return out;
};

/** Print usage. */
const printHelp = () => {
  console.log(`Usage: node backend/database/seeders/index.js [options]

Options:
  --only=a,b,c    Run only the named seeders (comma-separated)
  --dry-run       Print the execution plan without running anything
  --help, -h      Show this message

Available seeders (in execution order):
${SEEDERS.map((s) => `  - ${s.name}`).join('\n')}
`);
};

/**
 * Spawn a single seeder file as a child process and resolve when it exits.
 * Stdio is inherited so the seeder's progress logs stream straight to
 * the user's terminal.
 *
 * @param {{ name: string, file: string }} seeder
 * @returns {Promise<void>} Rejects with an Error on non-zero exit
 */
const runSeeder = (seeder) =>
  new Promise((resolve, reject) => {
    const fullPath = path.join(__dirname, seeder.file);

    if (!fs.existsSync(fullPath)) {
      return reject(
        new Error(`Seeder file not found: ${fullPath}`)
      );
    }

    console.log(`\n──── ${seeder.name} (${seeder.file}) ────`);

    const child = spawn(process.execPath, [fullPath], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('error', (err) => reject(err));
    child.on('exit', (code, signal) => {
      if (signal) {
        return reject(
          new Error(
            `Seeder "${seeder.name}" terminated by signal ${signal}`
          )
        );
      }
      if (code !== 0) {
        return reject(
          new Error(`Seeder "${seeder.name}" exited with code ${code}`)
        );
      }
      resolve();
    });
  });

/**
 * Run all (or a subset of) seeders sequentially, preserving order.
 */
const runAll = async () => {
  const argv = parseArgs(process.argv.slice(2));

  if (argv.help) {
    printHelp();
    return;
  }

  // Filter by --only if supplied. Unknown names are surfaced loudly.
  let plan = SEEDERS;
  if (argv.only) {
    const known = new Set(SEEDERS.map((s) => s.name));
    const unknown = argv.only.filter((n) => !known.has(n));
    if (unknown.length > 0) {
      console.error(
        `Unknown seeder name(s): ${unknown.join(', ')}.\n` +
          `Available: ${SEEDERS.map((s) => s.name).join(', ')}`
      );
      process.exit(1);
    }
    const requested = new Set(argv.only);
    plan = SEEDERS.filter((s) => requested.has(s.name));
  }

  console.log('Seeder execution plan:');
  plan.forEach((s, idx) => {
    console.log(`  ${idx + 1}. ${s.name} (${s.file})`);
  });

  if (argv.dryRun) {
    console.log('\n[dry-run] No seeders were executed.');
    return;
  }

  const startedAt = Date.now();
  for (const seeder of plan) {
    try {
      await runSeeder(seeder);
    } catch (err) {
      console.error(`\n✗ Seeding aborted: ${err.message}`);
      process.exit(1);
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `\n✓ All seeders completed successfully in ${elapsed}s ` +
      `(${plan.length} of ${SEEDERS.length}).`
  );
};

// Run if invoked directly (e.g. `node backend/database/seeders/index.js`).
// Skipping when required as a module keeps it import-friendly for tests.
if (require.main === module) {
  runAll();
}

module.exports = {
  SEEDERS,
  runAll,
  runSeeder,
  parseArgs,
};

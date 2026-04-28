/**
 * @file backend/database/seeders/positions.seed.js
 * @description Seed script to populate Positions with hierarchical roles (Junior/Senior/Lead/Manager) per department
 * @author Dev A
 *
 * Idempotent: skip rows whose (department_id, emertimi) pair already exists.
 * Safe to re-run during local development.
 */

const mysql = require('mysql2/promise');
require('dotenv').config({
  path: require('path').join(__dirname, '../../.env'),
});

/**
 * Per-department role labels. The "{title}" placeholder is filled in below
 * so each department gets sensibly-named positions (e.g. IT → "Junior
 * Software Engineer", HR → "Junior HR Specialist").
 */
const ROLE_LEVELS = [
  { niveli: 'Junior',  paga_min:  600.0,  paga_max:  900.0  },
  { niveli: 'Senior',  paga_min:  900.0,  paga_max: 1500.0  },
  { niveli: 'Lead',    paga_min: 1500.0,  paga_max: 2200.0  },
  { niveli: 'Manager', paga_min: 2200.0,  paga_max: 3500.0  },
];

/**
 * Department → role title to substitute for "{title}". Keeps the matrix
 * compact while still producing realistic position names.
 */
const DEPARTMENT_TITLES = {
  IT: 'Software Engineer',
  HR: 'HR Specialist',
  Finance: 'Finance Analyst',
  Marketing: 'Marketing Specialist',
  Operations: 'Operations Specialist',
};

/**
 * Build the cross-product of departments × levels into the position rows
 * we want to insert.
 *
 * @param {Array<{ id: number, emertimi: string }>} departments
 * @returns {Array<Object>}
 */
const buildPositions = (departments) => {
  const positions = [];

  for (const dept of departments) {
    const baseTitle = DEPARTMENT_TITLES[dept.emertimi] || dept.emertimi;

    for (const level of ROLE_LEVELS) {
      // Manager level uses "<Department> Manager" naming so the org chart
      // reads naturally ("HR Manager", "IT Manager", etc.).
      const emertimi =
        level.niveli === 'Manager'
          ? `${dept.emertimi} Manager`
          : `${level.niveli} ${baseTitle}`;

      positions.push({
        department_id: dept.id,
        emertimi,
        pershkrimi: `${level.niveli}-level ${baseTitle.toLowerCase()} in the ${dept.emertimi} department.`,
        niveli: level.niveli,
        paga_min: level.paga_min,
        paga_max: level.paga_max,
      });
    }
  }

  return positions;
};

/**
 * Insert one position per (department, level) pair, skipping any combo
 * that already exists.
 */
const seedPositions = async () => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
    });

    console.log('Connected to database. Seeding positions...');

    // Pull every department first — the seeder runs after departments.seed.js
    // so this set should be non-empty.
    const [departments] = await connection.execute(
      'SELECT id, emertimi FROM Departments'
    );

    if (departments.length === 0) {
      console.error(
        '  ✗ No departments found. Run departments.seed.js first.'
      );
      process.exit(1);
    }

    const positions = buildPositions(departments);

    let created = 0;
    let skipped = 0;

    for (const pos of positions) {
      const [existing] = await connection.execute(
        `SELECT id FROM Positions
         WHERE department_id = ? AND emertimi = ?
         LIMIT 1`,
        [pos.department_id, pos.emertimi]
      );

      if (existing.length > 0) {
        console.log(`  - Position already exists: ${pos.emertimi}`);
        skipped += 1;
        continue;
      }

      await connection.execute(
        `INSERT INTO Positions
           (department_id, emertimi, pershkrimi, niveli, paga_min, paga_max)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          pos.department_id,
          pos.emertimi,
          pos.pershkrimi,
          pos.niveli,
          pos.paga_min,
          pos.paga_max,
        ]
      );
      console.log(`  ✓ Position created: ${pos.emertimi}`);
      created += 1;
    }

    console.log(
      `Positions seeding completed: ${created} created, ${skipped} skipped.`
    );
  } catch (error) {
    console.error('Error seeding positions:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};

// Run seeder if executed directly
seedPositions();

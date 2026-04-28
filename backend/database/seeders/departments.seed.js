/**
 * @file backend/database/seeders/departments.seed.js
 * @description Seed script to populate Departments with five sample units (IT, HR, Finance, Marketing, Operations)
 * @author Dev A
 *
 * Idempotent: each row is keyed on `emertimi` (department name) and skipped
 * if already present. Safe to re-run during local development.
 */

const mysql = require('mysql2/promise');
require('dotenv').config({
  path: require('path').join(__dirname, '../../.env'),
});

/**
 * Sample departments for development and demo purposes.
 *
 * `buxheti` is in the same currency the rest of the schema uses (EUR per
 * the salary controller). Numbers are deliberately rough so the seeded
 * payroll dashboard has interesting data without being unrealistic.
 */
const sampleDepartments = [
  {
    emertimi: 'IT',
    pershkrimi:
      'Software engineering, infrastructure, and internal tooling. Owns the HRMS itself.',
    lokacioni: 'Prishtina HQ — Floor 3',
    buxheti: 480000.0,
  },
  {
    emertimi: 'HR',
    pershkrimi:
      'People operations: recruiting, onboarding, performance management, and policy.',
    lokacioni: 'Prishtina HQ — Floor 2',
    buxheti: 220000.0,
  },
  {
    emertimi: 'Finance',
    pershkrimi:
      'Accounting, payroll execution, treasury, and financial reporting.',
    lokacioni: 'Prishtina HQ — Floor 2',
    buxheti: 310000.0,
  },
  {
    emertimi: 'Marketing',
    pershkrimi:
      'Brand, demand generation, content, and external communications.',
    lokacioni: 'Prishtina HQ — Floor 4',
    buxheti: 265000.0,
  },
  {
    emertimi: 'Operations',
    pershkrimi:
      'Procurement, facilities, vendor management, and day-to-day office running.',
    lokacioni: 'Prizren Office',
    buxheti: 195000.0,
  },
];

/**
 * Insert sample departments, skipping any whose `emertimi` is already
 * present so the script stays re-runnable.
 */
const seedDepartments = async () => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
    });

    console.log('Connected to database. Seeding departments...');

    let created = 0;
    let skipped = 0;

    for (const dept of sampleDepartments) {
      const [existing] = await connection.execute(
        'SELECT id FROM Departments WHERE emertimi = ? LIMIT 1',
        [dept.emertimi]
      );

      if (existing.length > 0) {
        console.log(`  - Department already exists: ${dept.emertimi}`);
        skipped += 1;
        continue;
      }

      await connection.execute(
        `INSERT INTO Departments (emertimi, pershkrimi, lokacioni, buxheti)
         VALUES (?, ?, ?, ?)`,
        [dept.emertimi, dept.pershkrimi, dept.lokacioni, dept.buxheti]
      );
      console.log(`  ✓ Department created: ${dept.emertimi}`);
      created += 1;
    }

    console.log(
      `Departments seeding completed: ${created} created, ${skipped} skipped.`
    );
  } catch (error) {
    console.error('Error seeding departments:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};

// Run seeder if executed directly
seedDepartments();

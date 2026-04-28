/**
 * @file backend/database/seeders/employees.seed.js
 * @description Seed 20 sample employees across all five departments with varied contract types, statuses, hire dates, and manager relationships
 * @author Dev A
 *
 * Idempotent: rows are keyed on email (Users) and `numri_punonjesit`
 * (Employees). Re-running the seeder skips anyone already present and
 * still wires up manager pointers for the existing rows.
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({
  path: require('path').join(__dirname, '../../.env'),
});

/** Default password for every seeded user. Reset on first login. */
const DEFAULT_PASSWORD = process.env.SEED_EMPLOYEE_PASSWORD || 'Employee@1234';

/** Number of bcrypt rounds — same as the auth service uses in prod. */
const BCRYPT_ROUNDS = 12;

/**
 * 20 sample employees. The order matters: each department's Manager is
 * listed first so that subsequent reports in the same department can
 * point to it via `manager_dept`.
 *
 * Fields:
 * - dept / level: matched against Positions seeded by positions.seed.js
 * - manager_dept: department whose Manager is this person's boss
 *   (null for the 5 Managers themselves and the Admin row, if any)
 */
const sampleEmployees = [
  // ── IT ──────────────────────────────────────────────────────────────
  {
    email: 'it.manager@hrms.local',
    first_name: 'Arben',
    last_name: 'Krasniqi',
    phone: '+383 44 100 001',
    dept: 'IT',
    level: 'Manager',
    contract: 'full-time',
    status: 'active',
    hire_date: '2022-01-15',
    manager_dept: null,
  },
  {
    email: 'it.lead@hrms.local',
    first_name: 'Drilon',
    last_name: 'Hoxha',
    phone: '+383 44 100 002',
    dept: 'IT',
    level: 'Lead',
    contract: 'full-time',
    status: 'active',
    hire_date: '2022-03-10',
    manager_dept: 'IT',
  },
  {
    email: 'it.senior@hrms.local',
    first_name: 'Blerta',
    last_name: 'Berisha',
    phone: '+383 44 100 003',
    dept: 'IT',
    level: 'Senior',
    contract: 'full-time',
    status: 'active',
    hire_date: '2023-06-01',
    manager_dept: 'IT',
  },
  {
    email: 'it.junior@hrms.local',
    first_name: 'Edon',
    last_name: 'Gashi',
    phone: '+383 44 100 004',
    dept: 'IT',
    level: 'Junior',
    contract: 'full-time',
    status: 'active',
    hire_date: '2024-09-02',
    manager_dept: 'IT',
  },
  {
    email: 'it.intern@hrms.local',
    first_name: 'Lirie',
    last_name: 'Shala',
    phone: '+383 44 100 005',
    dept: 'IT',
    level: 'Junior',
    contract: 'intern',
    status: 'active',
    hire_date: '2025-10-01',
    manager_dept: 'IT',
  },

  // ── HR ──────────────────────────────────────────────────────────────
  {
    email: 'hr.manager@hrms.local',
    first_name: 'Valbona',
    last_name: 'Rexhaj',
    phone: '+383 44 200 001',
    dept: 'HR',
    level: 'Manager',
    contract: 'full-time',
    status: 'active',
    hire_date: '2021-11-20',
    manager_dept: null,
  },
  {
    email: 'hr.senior@hrms.local',
    first_name: 'Burim',
    last_name: 'Kelmendi',
    phone: '+383 44 200 002',
    dept: 'HR',
    level: 'Senior',
    contract: 'full-time',
    status: 'active',
    hire_date: '2023-02-14',
    manager_dept: 'HR',
  },
  {
    email: 'hr.junior@hrms.local',
    first_name: 'Albulena',
    last_name: 'Vata',
    phone: '+383 44 200 003',
    dept: 'HR',
    level: 'Junior',
    contract: 'part-time',
    status: 'active',
    hire_date: '2024-04-03',
    manager_dept: 'HR',
  },

  // ── Finance ─────────────────────────────────────────────────────────
  {
    email: 'finance.manager@hrms.local',
    first_name: 'Genti',
    last_name: 'Mustafa',
    phone: '+383 44 300 001',
    dept: 'Finance',
    level: 'Manager',
    contract: 'full-time',
    status: 'active',
    hire_date: '2020-08-05',
    manager_dept: null,
  },
  {
    email: 'finance.lead@hrms.local',
    first_name: 'Fjolla',
    last_name: 'Llapashtica',
    phone: '+383 44 300 002',
    dept: 'Finance',
    level: 'Lead',
    contract: 'full-time',
    status: 'active',
    hire_date: '2022-05-18',
    manager_dept: 'Finance',
  },
  {
    email: 'finance.senior@hrms.local',
    first_name: 'Driton',
    last_name: 'Bajrami',
    phone: '+383 44 300 003',
    dept: 'Finance',
    level: 'Senior',
    contract: 'full-time',
    status: 'inactive',
    hire_date: '2023-01-09',
    manager_dept: 'Finance',
  },
  {
    email: 'finance.junior@hrms.local',
    first_name: 'Endrita',
    last_name: 'Maliqi',
    phone: '+383 44 300 004',
    dept: 'Finance',
    level: 'Junior',
    contract: 'full-time',
    status: 'active',
    hire_date: '2024-11-11',
    manager_dept: 'Finance',
  },

  // ── Marketing ───────────────────────────────────────────────────────
  {
    email: 'marketing.manager@hrms.local',
    first_name: 'Liridon',
    last_name: 'Avdiu',
    phone: '+383 44 400 001',
    dept: 'Marketing',
    level: 'Manager',
    contract: 'full-time',
    status: 'active',
    hire_date: '2021-06-22',
    manager_dept: null,
  },
  {
    email: 'marketing.senior@hrms.local',
    first_name: 'Dafina',
    last_name: 'Krasniqi',
    phone: '+383 44 400 002',
    dept: 'Marketing',
    level: 'Senior',
    contract: 'full-time',
    status: 'active',
    hire_date: '2023-04-04',
    manager_dept: 'Marketing',
  },
  {
    email: 'marketing.junior@hrms.local',
    first_name: 'Arta',
    last_name: 'Ramadani',
    phone: '+383 44 400 003',
    dept: 'Marketing',
    level: 'Junior',
    contract: 'contract',
    status: 'active',
    hire_date: '2025-01-15',
    manager_dept: 'Marketing',
  },
  {
    email: 'marketing.alumna@hrms.local',
    first_name: 'Petrit',
    last_name: 'Zogu',
    phone: null,
    dept: 'Marketing',
    level: 'Junior',
    contract: 'full-time',
    status: 'terminated',
    hire_date: '2022-09-12',
    manager_dept: 'Marketing',
  },

  // ── Operations ──────────────────────────────────────────────────────
  {
    email: 'ops.manager@hrms.local',
    first_name: 'Shpend',
    last_name: 'Halili',
    phone: '+383 44 500 001',
    dept: 'Operations',
    level: 'Manager',
    contract: 'full-time',
    status: 'active',
    hire_date: '2021-03-08',
    manager_dept: null,
  },
  {
    email: 'ops.lead@hrms.local',
    first_name: 'Mihrije',
    last_name: 'Rexhepi',
    phone: '+383 44 500 002',
    dept: 'Operations',
    level: 'Lead',
    contract: 'full-time',
    status: 'active',
    hire_date: '2022-12-01',
    manager_dept: 'Operations',
  },
  {
    email: 'ops.senior@hrms.local',
    first_name: 'Florent',
    last_name: 'Tahiri',
    phone: '+383 44 500 003',
    dept: 'Operations',
    level: 'Senior',
    contract: 'part-time',
    status: 'suspended',
    hire_date: '2023-07-19',
    manager_dept: 'Operations',
  },
  {
    email: 'ops.junior@hrms.local',
    first_name: 'Adea',
    last_name: 'Selmani',
    phone: '+383 44 500 004',
    dept: 'Operations',
    level: 'Junior',
    contract: 'full-time',
    status: 'active',
    hire_date: '2024-08-26',
    manager_dept: 'Operations',
  },
];

/**
 * Pad a numeric ID into the EMP-00001 format used elsewhere in the app.
 *
 * @param {number} n
 * @returns {string}
 */
const formatEmployeeNumber = (n) =>
  `EMP-${String(n).padStart(5, '0')}`;

/**
 * Look up the position id for a given (department, level) tuple.
 *
 * For Manager level we match on the department-name convention used in
 * positions.seed.js ("HR Manager", "IT Manager", etc.) rather than the
 * `niveli` column, because every dept's Manager row uses that bespoke
 * `emertimi`. For everything else we match on `niveli`.
 */
const findPositionId = (positions, departmentId, deptName, level) => {
  if (level === 'Manager') {
    const match = positions.find(
      (p) =>
        p.department_id === departmentId &&
        p.emertimi === `${deptName} Manager`
    );
    return match?.id || null;
  }

  const match = positions.find(
    (p) => p.department_id === departmentId && p.niveli === level
  );
  return match?.id || null;
};

/**
 * Seed sample employees in two phases:
 *   1. Insert User + Employee rows (with `menaxheri_id` left NULL).
 *   2. Update each non-manager row to point to their department's Manager.
 *
 * The two-phase shape avoids forward-reference issues since a department's
 * manager might not exist yet on the first insert pass.
 */
const seedEmployees = async () => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
    });

    console.log('Connected to database. Seeding employees...');

    // ── Pre-flight lookups ────────────────────────────────────────────
    const [employeeRoleRows] = await connection.execute(
      'SELECT id FROM Roles WHERE name = ? LIMIT 1',
      ['Employee']
    );
    if (employeeRoleRows.length === 0) {
      console.error('  ✗ Employee role not found. Run roles.seed.js first.');
      process.exit(1);
    }
    const employeeRoleId = employeeRoleRows[0].id;

    const [departments] = await connection.execute(
      'SELECT id, emertimi FROM Departments'
    );
    if (departments.length === 0) {
      console.error('  ✗ No departments found. Run departments.seed.js first.');
      process.exit(1);
    }
    const deptByName = new Map(departments.map((d) => [d.emertimi, d]));

    const [positions] = await connection.execute(
      'SELECT id, department_id, emertimi, niveli FROM Positions'
    );
    if (positions.length === 0) {
      console.error('  ✗ No positions found. Run positions.seed.js first.');
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

    // ── Phase 1: insert users + employees (no manager pointer yet) ────
    let createdUsers = 0;
    let createdEmployees = 0;
    let skipped = 0;

    /** Map of department name → manager Employee.id (filled as we go). */
    const managerByDept = new Map();
    /** Map of email → Employee.id (used in phase 2). */
    const employeeIdByEmail = new Map();

    for (const sample of sampleEmployees) {
      const dept = deptByName.get(sample.dept);
      if (!dept) {
        console.warn(
          `  - Skipping ${sample.email}: department "${sample.dept}" not seeded`
        );
        continue;
      }

      const positionId = findPositionId(
        positions,
        dept.id,
        sample.dept,
        sample.level
      );
      if (!positionId) {
        console.warn(
          `  - Skipping ${sample.email}: position "${sample.level}" not found for ${sample.dept}`
        );
        continue;
      }

      // 1a. Insert / fetch User
      let userId;
      const [existingUser] = await connection.execute(
        'SELECT id FROM Users WHERE email = ? LIMIT 1',
        [sample.email]
      );

      if (existingUser.length > 0) {
        userId = existingUser[0].id;
      } else {
        const [userInsert] = await connection.execute(
          `INSERT INTO Users
             (email, password_hash, first_name, last_name, phone, is_active, email_verified)
           VALUES (?, ?, ?, ?, ?, TRUE, TRUE)`,
          [
            sample.email,
            passwordHash,
            sample.first_name,
            sample.last_name,
            sample.phone,
          ]
        );
        userId = userInsert.insertId;
        createdUsers += 1;

        await connection.execute(
          'INSERT IGNORE INTO UserRoles (user_id, role_id) VALUES (?, ?)',
          [userId, employeeRoleId]
        );
      }

      // 1b. Insert / fetch Employee
      const [existingEmployee] = await connection.execute(
        'SELECT id FROM Employees WHERE user_id = ? LIMIT 1',
        [userId]
      );

      let employeeId;
      if (existingEmployee.length > 0) {
        employeeId = existingEmployee[0].id;
        skipped += 1;
        console.log(
          `  - Employee already exists: ${sample.first_name} ${sample.last_name}`
        );
      } else {
        // Generate a sequential employee number based on the current MAX id.
        const [seqRows] = await connection.execute(
          'SELECT COALESCE(MAX(id), 0) AS last_id FROM Employees'
        );
        const nextNumber = formatEmployeeNumber(
          (seqRows[0].last_id || 0) + 1
        );

        const [empInsert] = await connection.execute(
          `INSERT INTO Employees
             (user_id, position_id, department_id, numri_punonjesit,
              data_punesimit, lloji_kontrates, statusi, menaxheri_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
          [
            userId,
            positionId,
            dept.id,
            nextNumber,
            sample.hire_date,
            sample.contract,
            sample.status,
          ]
        );
        employeeId = empInsert.insertId;
        createdEmployees += 1;
        console.log(
          `  ✓ Employee created: ${sample.first_name} ${sample.last_name} (${nextNumber}, ${sample.dept} / ${sample.level})`
        );
      }

      employeeIdByEmail.set(sample.email, employeeId);

      // Track managers so we can wire reports to them in phase 2.
      if (sample.level === 'Manager') {
        managerByDept.set(sample.dept, employeeId);
      }
    }

    // ── Phase 2: wire up manager pointers ─────────────────────────────
    let managerLinks = 0;
    for (const sample of sampleEmployees) {
      if (!sample.manager_dept) continue; // Managers themselves
      const employeeId = employeeIdByEmail.get(sample.email);
      const managerId = managerByDept.get(sample.manager_dept);
      if (!employeeId || !managerId || employeeId === managerId) continue;

      await connection.execute(
        'UPDATE Employees SET menaxheri_id = ? WHERE id = ?',
        [managerId, employeeId]
      );
      managerLinks += 1;
    }

    // Also pin each Department's `menaxheri_id` to the seeded manager so
    // org-chart queries match without a separate update later.
    for (const [deptName, managerEmployeeId] of managerByDept.entries()) {
      const dept = deptByName.get(deptName);
      if (!dept) continue;
      await connection.execute(
        'UPDATE Departments SET menaxheri_id = ? WHERE id = ?',
        [managerEmployeeId, dept.id]
      );
    }

    console.log(
      `Employees seeding completed: ${createdUsers} users + ${createdEmployees} employees created, ${skipped} skipped, ${managerLinks} manager links wired up.`
    );
    if (createdUsers > 0) {
      console.log(`    Default seeded password: ${DEFAULT_PASSWORD}`);
      console.log('    ⚠  Change passwords on first login!');
    }
  } catch (error) {
    console.error('Error seeding employees:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};

// Run seeder if executed directly
seedEmployees();

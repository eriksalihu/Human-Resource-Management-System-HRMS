/**
 * @file backend/database/seeders/roles.seed.js
 * @description Seed script to populate Roles table with default roles
 * @author Dev A
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

/**
 * Default roles for the HRMS application.
 * These roles map to the authorization middleware and route guards.
 */
const defaultRoles = [
  { name: 'Admin', description: 'Full system access with all permissions' },
  { name: 'HR Manager', description: 'Manage employees, salaries, leave requests, and reports' },
  { name: 'Department Manager', description: 'Manage department employees, approve leave requests, and view reports' },
  { name: 'Employee', description: 'View own profile, submit leave requests, and view attendance' },
];

/**
 * Seed the Roles table with default roles.
 * Uses INSERT IGNORE to avoid duplicates on re-run.
 */
const seedRoles = async () => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
    });

    console.log('Connected to database. Seeding roles...');

    for (const role of defaultRoles) {
      const [result] = await connection.execute(
        'INSERT IGNORE INTO Roles (name, description) VALUES (?, ?)',
        [role.name, role.description]
      );

      if (result.affectedRows > 0) {
        console.log(`  ✓ Role created: ${role.name}`);
      } else {
        console.log(`  - Role already exists: ${role.name}`);
      }
    }

    console.log('Role seeding completed successfully.');
  } catch (error) {
    console.error('Error seeding roles:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};

// Run seeder if executed directly
seedRoles();

/**
 * @file backend/database/seeders/users.seed.js
 * @description Seed script to insert a default admin user with Admin role
 * @author Dev A
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

/**
 * Default admin credentials.
 * The plaintext password should be changed on first login in production.
 * Override via env vars: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD.
 */
const defaultAdmin = {
  email: process.env.SEED_ADMIN_EMAIL || 'admin@hrms.local',
  password: process.env.SEED_ADMIN_PASSWORD || 'Admin@1234',
  first_name: 'System',
  last_name: 'Administrator',
  phone: null,
};

/**
 * Insert (or skip) the default admin user and assign the Admin role.
 *
 * Behaviour:
 * - If the user already exists, skips insertion but still ensures the Admin
 *   role is assigned (idempotent).
 * - Hashes the password with bcrypt (12 rounds) before inserting.
 */
const seedAdminUser = async () => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
    });

    console.log('Connected to database. Seeding admin user...');

    // 1. Look up the Admin role
    const [roleRows] = await connection.execute(
      'SELECT id FROM Roles WHERE name = ? LIMIT 1',
      ['Admin']
    );

    if (roleRows.length === 0) {
      console.error('  ✗ Admin role not found. Run roles.seed.js first.');
      process.exit(1);
    }
    const adminRoleId = roleRows[0].id;

    // 2. Check if admin user already exists
    const [existing] = await connection.execute(
      'SELECT id FROM Users WHERE email = ? LIMIT 1',
      [defaultAdmin.email]
    );

    let adminUserId;
    if (existing.length > 0) {
      adminUserId = existing[0].id;
      console.log(`  - Admin user already exists: ${defaultAdmin.email}`);
    } else {
      // 3. Hash password and create user
      const password_hash = await bcrypt.hash(defaultAdmin.password, 12);

      const [insertResult] = await connection.execute(
        `INSERT INTO Users (email, password_hash, first_name, last_name, phone, is_active, email_verified)
         VALUES (?, ?, ?, ?, ?, TRUE, TRUE)`,
        [
          defaultAdmin.email,
          password_hash,
          defaultAdmin.first_name,
          defaultAdmin.last_name,
          defaultAdmin.phone,
        ]
      );
      adminUserId = insertResult.insertId;
      console.log(`  ✓ Admin user created: ${defaultAdmin.email}`);
      console.log(`    Default password: ${defaultAdmin.password}`);
      console.log('    ⚠  Change this password on first login!');
    }

    // 4. Assign Admin role (idempotent via INSERT IGNORE)
    await connection.execute(
      'INSERT IGNORE INTO UserRoles (user_id, role_id) VALUES (?, ?)',
      [adminUserId, adminRoleId]
    );
    console.log('  ✓ Admin role assigned');

    console.log('Admin user seeding completed successfully.');
  } catch (error) {
    console.error('Error seeding admin user:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};

// Run seeder if executed directly
seedAdminUser();

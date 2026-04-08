/**
 * @file backend/src/server.js
 * @description Server entry point — connects to database and starts Express
 * @author Dev A
 */

require('dotenv').config();
const app = require('./app');
const { testConnection } = require('./config/db');

const PORT = process.env.PORT || 5000;

/**
 * Start the server after verifying database connectivity.
 */
const startServer = async () => {
  try {
    // Verify database connection
    const isConnected = await testConnection();
    if (!isConnected) {
      console.error('Failed to connect to database. Server will start without DB connection.');
    }

    // Start Express server
    app.listen(PORT, () => {
      console.log(`\n========================================`);
      console.log(`  HRMS Server running on port ${PORT}`);
      console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`  API: http://localhost:${PORT}/api`);
      console.log(`========================================\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();

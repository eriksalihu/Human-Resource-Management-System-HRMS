/**
 * @file backend/src/config/cors.js
 * @description CORS middleware configuration with whitelisted origins
 * @author Dev A
 */

const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true, // allows cookies (refresh token)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

module.exports = corsOptions;

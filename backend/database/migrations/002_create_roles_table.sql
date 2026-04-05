-- ============================================================================
-- Migration: 002_create_roles_table.sql
-- Description: Create Roles table for role-based access control
-- Author: Dev A
-- ============================================================================

CREATE TABLE IF NOT EXISTS Roles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) UNIQUE NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

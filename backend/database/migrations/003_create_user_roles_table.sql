-- ============================================================================
-- Migration: 003_create_user_roles_table.sql
-- Description: Create UserRoles junction table for many-to-many user-role mapping
-- Author: Dev A
-- ============================================================================

CREATE TABLE IF NOT EXISTS UserRoles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES Roles(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_role (user_id, role_id)
);

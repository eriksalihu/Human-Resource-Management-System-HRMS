-- ============================================================================
-- Migration: 005_create_user_tokens_table.sql
-- Description: Create UserTokens table for external login provider token storage
-- Author: Dev A
-- ============================================================================

CREATE TABLE IF NOT EXISTS UserTokens (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  login_provider VARCHAR(100) NOT NULL,
  token_name VARCHAR(100) NOT NULL,
  token_value TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

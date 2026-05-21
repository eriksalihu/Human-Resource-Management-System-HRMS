-- ============================================================================
-- Migration: 021_create_password_reset_tokens_table.sql
-- Description: Create PasswordResetTokens table backing the forgot/reset
--   password flow (commit 292). Stores a SHA-256 HASH of each reset
--   token (never the raw token) so a database leak cannot be used to
--   reset accounts. Tokens are single-use (used_at) and time-limited
--   (expires_at).
-- Author: Dev A
-- ============================================================================

CREATE TABLE IF NOT EXISTS PasswordResetTokens (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  -- SHA-256 hex digest of the raw token handed to the user by email.
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  -- NULL while pending; stamped once the token is consumed.
  used_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  -- Lookups are by hash; index it. Unique because two raw tokens
  -- colliding on SHA-256 is not a thing we plan for.
  UNIQUE KEY uq_password_reset_token_hash (token_hash),
  KEY idx_password_reset_user (user_id)
);

-- ============================================================================
-- Migration: 006_create_refresh_tokens_table.sql
-- Description: Create RefreshTokens table with token rotation and revocation support
-- Author: Dev A
-- ============================================================================

CREATE TABLE IF NOT EXISTS RefreshTokens (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  token VARCHAR(500) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME,
  replaced_by_token VARCHAR(500),
  created_by_ip VARCHAR(45),
  revoked_by_ip VARCHAR(45),
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  INDEX idx_token (token),
  INDEX idx_user_expires (user_id, expires_at)
);

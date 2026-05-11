-- ============================================================================
-- Migration: 020_add_login_tracking_columns.sql
-- Description: Add login tracking + account lockout columns to Users table.
--   Backs the User model methods added in commit 205 (isLocked,
--   incrementFailedAttempts, recordSuccessfulLogin, resetFailedAttempts,
--   unlockAccount) and the auth controller lockout flow in commit 204.
-- Author: Dev A
-- ============================================================================

ALTER TABLE Users
  ADD COLUMN failed_login_attempts INT DEFAULT 0,
  ADD COLUMN locked_until DATETIME NULL,
  ADD COLUMN last_login_at DATETIME NULL,
  ADD COLUMN last_login_ip VARCHAR(45) NULL;

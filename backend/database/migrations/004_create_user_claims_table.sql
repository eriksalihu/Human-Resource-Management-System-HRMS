-- ============================================================================
-- Migration: 004_create_user_claims_table.sql
-- Description: Create UserClaims table for claims-based authorization
-- Author: Dev A
-- ============================================================================

CREATE TABLE IF NOT EXISTS UserClaims (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  claim_type VARCHAR(255) NOT NULL,
  claim_value VARCHAR(255) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

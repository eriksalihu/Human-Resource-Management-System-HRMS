-- ============================================================================
-- Migration: 007_create_departments_table.sql
-- Description: Create Departments table with manager reference placeholder
-- Note: menaxheri_id FK added via ALTER TABLE after Employees table exists
-- Author: Dev A
-- ============================================================================

CREATE TABLE IF NOT EXISTS Departments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  emertimi VARCHAR(100) NOT NULL,
  pershkrimi TEXT,
  menaxheri_id INT,
  lokacioni VARCHAR(255),
  buxheti DECIMAL(15,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_menaxheri (menaxheri_id)
);

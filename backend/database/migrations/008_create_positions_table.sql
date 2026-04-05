-- ============================================================================
-- Migration: 008_create_positions_table.sql
-- Description: Create Positions table with department foreign key and salary range
-- Author: Dev A
-- ============================================================================

CREATE TABLE IF NOT EXISTS Positions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  department_id INT NOT NULL,
  emertimi VARCHAR(100) NOT NULL,
  pershkrimi TEXT,
  niveli VARCHAR(50),
  paga_min DECIMAL(10,2),
  paga_max DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES Departments(id) ON DELETE CASCADE,
  INDEX idx_department (department_id)
);

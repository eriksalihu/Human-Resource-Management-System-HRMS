-- ============================================================================
-- Migration: 012_create_attendances_table.sql
-- Description: Create Attendances table with unique employee+date constraint
-- Author: Dev A
-- ============================================================================

CREATE TABLE IF NOT EXISTS Attendances (
  id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  data DATE NOT NULL,
  ora_hyrjes TIME,
  ora_daljes TIME,
  statusi ENUM('present', 'absent', 'late', 'half-day', 'remote') DEFAULT 'present',
  shenimet TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES Employees(id) ON DELETE CASCADE,
  INDEX idx_employee_date (employee_id, data),
  UNIQUE KEY unique_attendance (employee_id, data)
);

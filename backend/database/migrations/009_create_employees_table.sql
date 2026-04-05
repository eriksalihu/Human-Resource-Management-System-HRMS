-- ============================================================================
-- Migration: 009_create_employees_table.sql
-- Description: Create Employees table with all foreign keys, enums, and indexes
-- Author: Dev A
-- ============================================================================

CREATE TABLE IF NOT EXISTS Employees (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  position_id INT NOT NULL,
  department_id INT NOT NULL,
  numri_punonjesit VARCHAR(20) UNIQUE NOT NULL,
  data_punesimit DATE NOT NULL,
  lloji_kontrates ENUM('full-time', 'part-time', 'contract', 'intern') NOT NULL,
  statusi ENUM('active', 'inactive', 'suspended', 'terminated') DEFAULT 'active',
  menaxheri_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  FOREIGN KEY (position_id) REFERENCES Positions(id) ON DELETE RESTRICT,
  FOREIGN KEY (department_id) REFERENCES Departments(id) ON DELETE RESTRICT,
  FOREIGN KEY (menaxheri_id) REFERENCES Employees(id) ON DELETE SET NULL,
  INDEX idx_user (user_id),
  INDEX idx_department (department_id),
  INDEX idx_position (position_id),
  INDEX idx_status (statusi)
);

-- Resolve circular FK: Departments.menaxheri_id → Employees
ALTER TABLE Departments
  ADD CONSTRAINT fk_dept_menaxheri FOREIGN KEY (menaxheri_id) REFERENCES Employees(id) ON DELETE SET NULL;

-- ============================================================================
-- Migration: 011_create_leave_requests_table.sql
-- Description: Create LeaveRequests table with leave type enum and approval workflow
-- Author: Dev A
-- ============================================================================

CREATE TABLE IF NOT EXISTS LeaveRequests (
  id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  lloji ENUM('annual', 'sick', 'personal', 'maternity', 'paternity', 'unpaid') NOT NULL,
  data_fillimit DATE NOT NULL,
  data_perfundimit DATE NOT NULL,
  arsyeja TEXT,
  statusi ENUM('pending', 'approved', 'rejected', 'cancelled') DEFAULT 'pending',
  aprovuar_nga INT,
  data_kerkeses TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES Employees(id) ON DELETE CASCADE,
  FOREIGN KEY (aprovuar_nga) REFERENCES Employees(id) ON DELETE SET NULL,
  INDEX idx_employee (employee_id),
  INDEX idx_status (statusi),
  INDEX idx_dates (data_fillimit, data_perfundimit)
);

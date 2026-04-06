-- ============================================================================
-- Migration: 013_create_performance_reviews_table.sql
-- Description: Create PerformanceReviews table with rating CHECK constraint
-- Author: Dev A
-- ============================================================================

CREATE TABLE IF NOT EXISTS PerformanceReviews (
  id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  vleresues_id INT,
  periudha VARCHAR(50) NOT NULL,
  nota DECIMAL(3,1) CHECK (nota BETWEEN 1.0 AND 5.0),
  pikat_forta TEXT,
  pikat_dobta TEXT,
  objektivat TEXT,
  data_vleresimit DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES Employees(id) ON DELETE CASCADE,
  FOREIGN KEY (vleresues_id) REFERENCES Employees(id) ON DELETE SET NULL,
  INDEX idx_employee (employee_id),
  INDEX idx_reviewer (vleresues_id)
);

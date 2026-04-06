-- ============================================================================
-- Migration: 016_create_documents_table.sql
-- Description: Create Documents table with document type classification and file storage
-- Author: Dev A
-- ============================================================================

CREATE TABLE IF NOT EXISTS Documents (
  id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  lloji ENUM('contract', 'id-card', 'certificate', 'resume', 'other') NOT NULL,
  emertimi VARCHAR(200) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  data_ngarkimit TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data_skadimit DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES Employees(id) ON DELETE CASCADE,
  INDEX idx_employee (employee_id),
  INDEX idx_type (lloji)
);

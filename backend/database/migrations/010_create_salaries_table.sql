-- ============================================================================
-- Migration: 010_create_salaries_table.sql
-- Description: Create Salaries table with unique constraint per employee per period
-- Author: Dev A
-- ============================================================================

CREATE TABLE IF NOT EXISTS Salaries (
  id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  paga_baze DECIMAL(10,2) NOT NULL,
  bonuse DECIMAL(10,2) DEFAULT 0,
  zbritje DECIMAL(10,2) DEFAULT 0,
  paga_neto DECIMAL(10,2) NOT NULL,
  muaji INT NOT NULL CHECK (muaji BETWEEN 1 AND 12),
  viti INT NOT NULL,
  data_pageses DATE,
  statusi ENUM('pending', 'processed', 'paid', 'cancelled') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES Employees(id) ON DELETE CASCADE,
  INDEX idx_employee (employee_id),
  INDEX idx_period (viti, muaji),
  UNIQUE KEY unique_salary_period (employee_id, muaji, viti)
);

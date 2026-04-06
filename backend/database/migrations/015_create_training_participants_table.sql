-- ============================================================================
-- Migration: 015_create_training_participants_table.sql
-- Description: Create TrainingParticipants junction table with enrollment status
-- Author: Dev A
-- ============================================================================

CREATE TABLE IF NOT EXISTS TrainingParticipants (
  id INT PRIMARY KEY AUTO_INCREMENT,
  training_id INT NOT NULL,
  employee_id INT NOT NULL,
  statusi ENUM('enrolled', 'completed', 'dropped', 'no-show') DEFAULT 'enrolled',
  vleresimi DECIMAL(3,1) CHECK (vleresimi BETWEEN 1.0 AND 5.0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (training_id) REFERENCES Trainings(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES Employees(id) ON DELETE CASCADE,
  UNIQUE KEY unique_participation (training_id, employee_id)
);

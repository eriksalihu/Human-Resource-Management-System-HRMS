-- ============================================================================
-- Migration: 014_create_trainings_table.sql
-- Description: Create Trainings table with capacity and status tracking
-- Author: Dev A
-- ============================================================================

CREATE TABLE IF NOT EXISTS Trainings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  titulli VARCHAR(200) NOT NULL,
  pershkrimi TEXT,
  trajner VARCHAR(100),
  data_fillimit DATE NOT NULL,
  data_perfundimit DATE NOT NULL,
  lokacioni VARCHAR(255),
  kapaciteti INT DEFAULT 20,
  statusi ENUM('upcoming', 'ongoing', 'completed', 'cancelled') DEFAULT 'upcoming',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_dates (data_fillimit, data_perfundimit)
);

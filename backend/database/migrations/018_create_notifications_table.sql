-- ============================================================================
-- Migration: 018_create_notifications_table.sql
-- Description: Create Notifications table with read status and type classification
-- Author: Dev A
-- ============================================================================

CREATE TABLE IF NOT EXISTS Notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('info', 'warning', 'success', 'error') DEFAULT 'info',
  is_read BOOLEAN DEFAULT FALSE,
  link VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  INDEX idx_user_read (user_id, is_read)
);

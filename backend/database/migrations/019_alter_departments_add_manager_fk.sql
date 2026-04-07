-- ============================================================================
-- Migration: 019_alter_departments_add_manager_fk.sql
-- Description: Add deferred FK linking Departments.menaxheri_id to Employees
-- Note: Resolves circular dependency between Departments and Employees tables
-- Author: Dev A
-- ============================================================================

ALTER TABLE Departments
  ADD CONSTRAINT fk_dept_menaxheri FOREIGN KEY (menaxheri_id) REFERENCES Employees(id) ON DELETE SET NULL;

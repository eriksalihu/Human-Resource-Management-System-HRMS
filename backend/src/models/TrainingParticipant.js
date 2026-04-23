/**
 * @file backend/src/models/TrainingParticipant.js
 * @description TrainingParticipant model — enrollment, withdrawal, roster, history, status updates, and post-training rating
 * @author Dev A
 */

const db = require('../config/db');

/** Valid enrollment statuses. */
const VALID_STATUSES = ['enrolled', 'completed', 'dropped', 'no-show'];

/**
 * BASE_SELECT joins participants to employees (+ users) and trainings so
 * both sides of the junction can render rich rows without extra round-trips.
 */
const BASE_SELECT = `
  SELECT
    tp.id,
    tp.training_id,
    tp.employee_id,
    tp.statusi,
    tp.vleresimi,
    tp.created_at,
    t.titulli        AS training_titulli,
    t.data_fillimit  AS training_data_fillimit,
    t.data_perfundimit AS training_data_perfundimit,
    t.statusi        AS training_statusi,
    e.numri_punonjesit,
    e.department_id,
    u.first_name,
    u.last_name,
    u.email,
    d.emertimi AS department_emertimi,
    p.emertimi AS position_emertimi
  FROM TrainingParticipants tp
  LEFT JOIN Trainings   t ON tp.training_id = t.id
  LEFT JOIN Employees   e ON tp.employee_id = e.id
  LEFT JOIN Users       u ON e.user_id = u.id
  LEFT JOIN Departments d ON e.department_id = d.id
  LEFT JOIN Positions   p ON e.position_id = p.id
`;

/**
 * Enroll an employee in a training. Relies on the
 * (training_id, employee_id) unique key — returns
 * `{ alreadyEnrolled: true }` on duplicate instead of throwing.
 *
 * @param {Object} data
 * @param {number} data.training_id
 * @param {number} data.employee_id
 * @param {string} [data.statusi='enrolled']
 * @returns {Promise<{ id: number|null, alreadyEnrolled: boolean }>}
 */
const enroll = async ({ training_id, employee_id, statusi = 'enrolled' }) => {
  try {
    const [result] = await db.query(
      `INSERT INTO TrainingParticipants (training_id, employee_id, statusi)
       VALUES (?, ?, ?)`,
      [training_id, employee_id, statusi]
    );
    return { id: result.insertId, alreadyEnrolled: false };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return { id: null, alreadyEnrolled: true };
    }
    throw err;
  }
};

/**
 * Withdraw an employee from a training by flipping their row to 'dropped'.
 *
 * @param {number} training_id
 * @param {number} employee_id
 * @returns {Promise<boolean>}
 */
const withdraw = async (training_id, employee_id) => {
  const [result] = await db.query(
    `UPDATE TrainingParticipants
     SET statusi = 'dropped'
     WHERE training_id = ? AND employee_id = ?`,
    [training_id, employee_id]
  );
  return result.affectedRows > 0;
};

/**
 * Look up a single participant row by composite key.
 *
 * @param {number} training_id
 * @param {number} employee_id
 * @returns {Promise<Object|null>}
 */
const findByTrainingAndEmployee = async (training_id, employee_id) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE tp.training_id = ? AND tp.employee_id = ?`,
    [training_id, employee_id]
  );
  return rows[0] || null;
};

/**
 * Find a participant row by its primary key.
 *
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
const findById = async (id) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE tp.id = ?`,
    [id]
  );
  return rows[0] || null;
};

/**
 * Roster for a given training, optionally filtered by participant status.
 *
 * @param {number} training_id
 * @param {Object} [opts]
 * @param {string} [opts.statusi] - 'enrolled' | 'completed' | 'dropped' | 'no-show'
 * @returns {Promise<Object[]>}
 */
const getByTraining = async (training_id, { statusi } = {}) => {
  const conditions = ['tp.training_id = ?'];
  const params = [training_id];

  if (statusi) {
    conditions.push('tp.statusi = ?');
    params.push(statusi);
  }

  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE ${conditions.join(' AND ')}
     ORDER BY u.last_name ASC, u.first_name ASC`,
    params
  );
  return rows;
};

/**
 * Training history for a given employee (newest-first).
 *
 * @param {number} employee_id
 * @param {Object} [opts]
 * @param {string} [opts.statusi]
 * @returns {Promise<Object[]>}
 */
const getByEmployee = async (employee_id, { statusi } = {}) => {
  const conditions = ['tp.employee_id = ?'];
  const params = [employee_id];

  if (statusi) {
    conditions.push('tp.statusi = ?');
    params.push(statusi);
  }

  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.data_fillimit DESC`,
    params
  );
  return rows;
};

/**
 * Update the enrollment status for a participant row.
 *
 * @param {number} id
 * @param {string} statusi - Must be in VALID_STATUSES
 * @returns {Promise<boolean>}
 */
const updateStatus = async (id, statusi) => {
  const [result] = await db.query(
    `UPDATE TrainingParticipants SET statusi = ? WHERE id = ?`,
    [statusi, id]
  );
  return result.affectedRows > 0;
};

/**
 * Submit a post-training rating (1.0–5.0). Storing it also marks the row
 * 'completed' if it was still 'enrolled' — a rating is evidence of completion.
 *
 * @param {number} id
 * @param {number} rating
 * @returns {Promise<boolean>}
 */
const addRating = async (id, rating) => {
  const [result] = await db.query(
    `UPDATE TrainingParticipants
     SET vleresimi = ?,
         statusi   = CASE WHEN statusi = 'enrolled' THEN 'completed' ELSE statusi END
     WHERE id = ?`,
    [rating, id]
  );
  return result.affectedRows > 0;
};

/**
 * Hard-delete a participant row (used by admin cleanup only — normal
 * "cancellation" is a status change via withdraw()).
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
const remove = async (id) => {
  const [result] = await db.query(
    `DELETE FROM TrainingParticipants WHERE id = ?`,
    [id]
  );
  return result.affectedRows > 0;
};

module.exports = {
  VALID_STATUSES,
  enroll,
  withdraw,
  findById,
  findByTrainingAndEmployee,
  getByTraining,
  getByEmployee,
  updateStatus,
  addRating,
  remove,
};

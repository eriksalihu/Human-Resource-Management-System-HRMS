/**
 * @file backend/src/models/Training.js
 * @description Training model with CRUD, upcoming/ongoing queries, capacity checks, and participant counts
 * @author Dev A
 */

const db = require('../config/db');
const { buildPaginationQuery } = require('../utils/helpers');

/** Whitelist of sortable columns to prevent SQL injection. */
const ALLOWED_SORT_COLUMNS = [
  'id',
  'titulli',
  'data_fillimit',
  'data_perfundimit',
  'kapaciteti',
  'statusi',
  'created_at',
];

/** Valid values for the Trainings.statusi enum column. */
const VALID_STATUSES = ['upcoming', 'ongoing', 'completed', 'cancelled'];

/**
 * Base SELECT with a live participant-count subquery so callers always know
 * how full a training is without a separate join per row.
 */
const BASE_SELECT = `
  SELECT
    t.id,
    t.titulli,
    t.pershkrimi,
    t.trajner,
    t.data_fillimit,
    t.data_perfundimit,
    t.lokacioni,
    t.kapaciteti,
    t.statusi,
    t.created_at,
    t.updated_at,
    (
      SELECT COUNT(*)
      FROM TrainingParticipants tp
      WHERE tp.training_id = t.id
        AND tp.statusi IN ('enrolled', 'completed')
    ) AS participant_count
  FROM Trainings t
`;

/**
 * Create a new training.
 *
 * @param {Object} data
 * @param {string} data.titulli
 * @param {string} [data.pershkrimi]
 * @param {string} [data.trajner]
 * @param {string} data.data_fillimit - YYYY-MM-DD
 * @param {string} data.data_perfundimit - YYYY-MM-DD
 * @param {string} [data.lokacioni]
 * @param {number} [data.kapaciteti=20]
 * @param {string} [data.statusi='upcoming']
 * @returns {Promise<number>} Inserted training ID
 */
const create = async (data) => {
  const [result] = await db.query(
    `INSERT INTO Trainings
       (titulli, pershkrimi, trajner, data_fillimit, data_perfundimit, lokacioni, kapaciteti, statusi)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.titulli,
      data.pershkrimi || null,
      data.trajner || null,
      data.data_fillimit,
      data.data_perfundimit,
      data.lokacioni || null,
      data.kapaciteti != null ? data.kapaciteti : 20,
      data.statusi || 'upcoming',
    ]
  );
  return result.insertId;
};

/**
 * List trainings with pagination and filters.
 *
 * @param {Object} [opts]
 * @param {number} [opts.page=1]
 * @param {number} [opts.limit=10]
 * @param {string} [opts.statusi]
 * @param {string} [opts.trajner] - Partial match
 * @param {string} [opts.from_date] - data_fillimit >= from_date
 * @param {string} [opts.to_date] - data_fillimit <= to_date
 * @param {string} [opts.search] - LIKE over titulli / pershkrimi / lokacioni
 * @param {string} [opts.sortBy='data_fillimit']
 * @param {string} [opts.sortOrder='DESC']
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
const findAll = async ({
  page = 1,
  limit = 10,
  statusi,
  trajner,
  from_date,
  to_date,
  search,
  sortBy = 'data_fillimit',
  sortOrder = 'DESC',
} = {}) => {
  const conditions = [];
  const params = [];

  if (statusi) {
    conditions.push('t.statusi = ?');
    params.push(statusi);
  }
  if (trajner) {
    conditions.push('t.trajner LIKE ?');
    params.push(`%${trajner}%`);
  }
  if (from_date) {
    conditions.push('t.data_fillimit >= ?');
    params.push(from_date);
  }
  if (to_date) {
    conditions.push('t.data_fillimit <= ?');
    params.push(to_date);
  }
  if (search) {
    conditions.push('(t.titulli LIKE ? OR t.pershkrimi LIKE ? OR t.lokacioni LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total FROM Trainings t ${where}`,
    params
  );
  const total = countRows[0].total;

  const { limit: perPage, offset, pagination } = buildPaginationQuery({ page, limit, total });

  const safeSortBy = ALLOWED_SORT_COLUMNS.includes(sortBy) ? sortBy : 'data_fillimit';
  const safeSortOrder = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const [rows] = await db.query(
    `${BASE_SELECT}
     ${where}
     ORDER BY t.${safeSortBy} ${safeSortOrder}
     LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );

  return { data: rows, pagination };
};

/**
 * Find a single training by ID (with live participant_count).
 *
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
const findById = async (id) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE t.id = ?`,
    [id]
  );
  return rows[0] || null;
};

/**
 * Get upcoming trainings — start date in the future, status still 'upcoming'.
 *
 * @param {Object} [opts]
 * @param {number} [opts.limit=50]
 * @returns {Promise<Object[]>}
 */
const getUpcoming = async ({ limit = 50 } = {}) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE t.statusi = 'upcoming'
       AND t.data_fillimit >= CURDATE()
     ORDER BY t.data_fillimit ASC
     LIMIT ?`,
    [limit]
  );
  return rows;
};

/**
 * Get ongoing trainings — either status='ongoing' or date window covers today.
 *
 * @returns {Promise<Object[]>}
 */
const getOngoing = async () => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE t.statusi = 'ongoing'
        OR (t.statusi IN ('upcoming', 'ongoing')
            AND CURDATE() BETWEEN t.data_fillimit AND t.data_perfundimit)
     ORDER BY t.data_fillimit ASC`
  );
  return rows;
};

/**
 * Count active participants (enrolled + completed) for a training.
 *
 * @param {number} trainingId
 * @returns {Promise<number>}
 */
const getParticipantCount = async (trainingId) => {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM TrainingParticipants
     WHERE training_id = ?
       AND statusi IN ('enrolled', 'completed')`,
    [trainingId]
  );
  return Number(rows[0]?.total || 0);
};

/**
 * Check whether a training still has open seats.
 *
 * @param {number} trainingId
 * @returns {Promise<{ available: boolean, capacity: number, taken: number }>}
 */
const isCapacityAvailable = async (trainingId) => {
  const training = await findById(trainingId);
  if (!training) {
    return { available: false, capacity: 0, taken: 0 };
  }
  const taken = Number(training.participant_count || 0);
  const capacity = Number(training.kapaciteti || 0);
  return {
    available: taken < capacity,
    capacity,
    taken,
  };
};

/**
 * Generic update — any of titulli, pershkrimi, trajner, data_fillimit,
 * data_perfundimit, lokacioni, kapaciteti, statusi.
 *
 * @param {number} id
 * @param {Object} data
 * @returns {Promise<boolean>}
 */
const update = async (id, data) => {
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }

  if (fields.length === 0) return false;

  values.push(id);
  const [result] = await db.query(
    `UPDATE Trainings SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  return result.affectedRows > 0;
};

/**
 * Hard-delete a training (participants cascade via FK).
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
const remove = async (id) => {
  const [result] = await db.query('DELETE FROM Trainings WHERE id = ?', [id]);
  return result.affectedRows > 0;
};

module.exports = {
  VALID_STATUSES,
  create,
  findAll,
  findById,
  getUpcoming,
  getOngoing,
  getParticipantCount,
  isCapacityAvailable,
  update,
  remove,
};

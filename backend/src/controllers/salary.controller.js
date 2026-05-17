/**
 * @file backend/src/controllers/salary.controller.js
 * @description Salary controller with CRUD, auto net-salary calculation, payroll summary, and bulk processing
 * @author Dev A
 */

const Salary = require('../models/Salary');
const Employee = require('../models/Employee');
const db = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { calculateNetSalary } = require('../utils/helpers');

/** Valid salary status values — must match the ENUM in the Salaries table. */
const VALID_STATUSES = ['pending', 'processed', 'paid', 'cancelled'];

/**
 * Compute net pay from base + bonuses − deductions using the standard
 * pension / health / tax formula, then add back any discretionary deductions.
 *
 * Returns a number rounded to 2 decimals.
 *
 * @param {number} paga_baze
 * @param {number} bonuse
 * @param {number} zbritje
 * @returns {number}
 */
const computeNetPay = (paga_baze, bonuse = 0, zbritje = 0) => {
  const gross = (parseFloat(paga_baze) || 0) + (parseFloat(bonuse) || 0);
  const { netSalary } = calculateNetSalary(gross);
  const net = netSalary - (parseFloat(zbritje) || 0);
  return +net.toFixed(2);
};

/**
 * GET /api/salaries
 * List salaries with filters (employee_id, muaji, viti, statusi, department_id).
 */
const getAll = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      employee_id,
      muaji,
      viti,
      statusi,
      department_id,
      sortBy = 'created_at',
      sortOrder = 'DESC',
    } = req.query;

    const result = await Salary.findAll({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      employee_id: employee_id ? parseInt(employee_id, 10) : undefined,
      muaji: muaji ? parseInt(muaji, 10) : undefined,
      viti: viti ? parseInt(viti, 10) : undefined,
      statusi,
      department_id: department_id ? parseInt(department_id, 10) : undefined,
      sortBy,
      sortOrder,
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/salaries/:id
 * Fetch a single salary record with employee / position / department info.
 */
const getById = async (req, res, next) => {
  try {
    const salary = await Salary.findById(req.params.id);
    if (!salary) {
      throw new AppError('Salary record not found', 404);
    }

    res.json({
      success: true,
      data: { salary },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/salaries/employee/:employeeId
 * List the full salary history for one employee.
 */
const getEmployeeHistory = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { year } = req.query;

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      throw new AppError('Employee not found', 404);
    }

    const history = await Salary.getSalaryHistory(
      employeeId,
      year ? parseInt(year, 10) : undefined
    );

    res.json({
      success: true,
      data: { employee_id: Number(employeeId), history },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/salaries/payroll/summary?muaji=X&viti=Y[&department_id=Z]
 * Return aggregate payroll totals for a given period.
 */
const getPayrollSummary = async (req, res, next) => {
  try {
    const { muaji, viti, department_id } = req.query;

    if (!muaji || !viti) {
      throw new AppError('muaji and viti query params are required', 400);
    }

    const summary = await Salary.calculatePayroll(
      parseInt(muaji, 10),
      parseInt(viti, 10),
      department_id ? parseInt(department_id, 10) : undefined
    );

    res.json({
      success: true,
      data: {
        muaji: Number(muaji),
        viti: Number(viti),
        department_id: department_id ? Number(department_id) : null,
        summary,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/salaries
 * Create a salary record. Auto-computes net pay if the client didn't send one.
 * Prevents duplicate (employee_id, muaji, viti) triples.
 */
const create = async (req, res, next) => {
  try {
    const {
      employee_id,
      paga_baze,
      bonuse = 0,
      zbritje = 0,
      paga_neto,
      muaji,
      viti,
      data_pageses,
      statusi,
    } = req.body;

    if (!employee_id || paga_baze == null || !muaji || !viti) {
      throw new AppError(
        'employee_id, paga_baze, muaji and viti are required',
        400
      );
    }

    const monthNum = parseInt(muaji, 10);
    if (monthNum < 1 || monthNum > 12) {
      throw new AppError('muaji must be between 1 and 12', 400);
    }

    if (statusi && !VALID_STATUSES.includes(statusi)) {
      throw new AppError(
        `Invalid statusi. Must be one of: ${VALID_STATUSES.join(', ')}`,
        400
      );
    }

    // Verify employee exists
    const employee = await Employee.findById(employee_id);
    if (!employee) {
      throw new AppError('Specified employee does not exist', 404);
    }

    // Reject duplicate period
    const existing = await Salary.findByEmployeePeriod(employee_id, monthNum, viti);
    if (existing) {
      throw new AppError(
        `Salary record already exists for this employee in ${monthNum}/${viti}`,
        409
      );
    }

    // Auto-compute net pay if not supplied
    const net = paga_neto != null
      ? parseFloat(paga_neto)
      : computeNetPay(paga_baze, bonuse, zbritje);

    const salaryId = await Salary.create({
      employee_id,
      paga_baze,
      bonuse,
      zbritje,
      paga_neto: net,
      muaji: monthNum,
      viti,
      data_pageses,
      statusi,
    });

    const salary = await Salary.findById(salaryId);

    res.status(201).json({
      success: true,
      message: 'Salary record created successfully',
      data: { salary },
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new AppError('Salary record for this period already exists', 409));
    }
    next(err);
  }
};

/**
 * PUT /api/salaries/:id
 * Update a salary record. Re-computes net pay when base/bonus/deductions change
 * and the caller did not explicitly pass paga_neto.
 */
const update = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await Salary.findById(id);
    if (!existing) {
      throw new AppError('Salary record not found', 404);
    }

    res.locals.auditOldValues = { ...existing };

    const {
      paga_baze,
      bonuse,
      zbritje,
      paga_neto,
      data_pageses,
      statusi,
    } = req.body;

    const updates = {};

    if (paga_baze !== undefined) updates.paga_baze = paga_baze;
    if (bonuse !== undefined) updates.bonuse = bonuse;
    if (zbritje !== undefined) updates.zbritje = zbritje;
    if (data_pageses !== undefined) updates.data_pageses = data_pageses;
    if (statusi !== undefined) {
      if (!VALID_STATUSES.includes(statusi)) {
        throw new AppError(
          `Invalid statusi. Must be one of: ${VALID_STATUSES.join(', ')}`,
          400
        );
      }
      updates.statusi = statusi;
    }

    // Re-compute net if any pay component changed and no explicit paga_neto
    const payComponentChanged =
      paga_baze !== undefined || bonuse !== undefined || zbritje !== undefined;

    if (paga_neto !== undefined) {
      updates.paga_neto = paga_neto;
    } else if (payComponentChanged) {
      updates.paga_neto = computeNetPay(
        paga_baze ?? existing.paga_baze,
        bonuse ?? existing.bonuse,
        zbritje ?? existing.zbritje
      );
    }

    if (Object.keys(updates).length === 0) {
      throw new AppError('No fields to update', 400);
    }

    await Salary.update(id, updates);
    const salary = await Salary.findById(id);

    res.json({
      success: true,
      message: 'Salary record updated successfully',
      data: { salary },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/salaries/:id
 * Delete a salary record.
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await Salary.findById(id);
    if (!existing) {
      throw new AppError('Salary record not found', 404);
    }

    res.locals.auditOldValues = { ...existing };

    await Salary.remove(id);

    res.json({
      success: true,
      message: 'Salary record deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/salaries/bulk
 * Bulk create salaries for month-end processing.
 * Body:
 *   {
 *     muaji, viti,
 *     records: [{ employee_id, paga_baze, bonuse?, zbritje?, statusi? }]
 *   }
 * Skips any (employee, period) triple that already has a record.
 */
const bulkCreate = async (req, res, next) => {
  try {
    const { muaji, viti, records } = req.body;

    if (!muaji || !viti || !Array.isArray(records) || records.length === 0) {
      throw new AppError('muaji, viti and non-empty records[] are required', 400);
    }

    const monthNum = parseInt(muaji, 10);
    if (monthNum < 1 || monthNum > 12) {
      throw new AppError('muaji must be between 1 and 12', 400);
    }

    const created = [];
    const skipped = [];

    for (const rec of records) {
      if (!rec.employee_id || rec.paga_baze == null) {
        skipped.push({ record: rec, reason: 'missing employee_id or paga_baze' });
        continue;
      }

      const dup = await Salary.findByEmployeePeriod(rec.employee_id, monthNum, viti);
      if (dup) {
        skipped.push({ employee_id: rec.employee_id, reason: 'duplicate period' });
        continue;
      }

      const net = computeNetPay(rec.paga_baze, rec.bonuse, rec.zbritje);
      const salaryId = await Salary.create({
        employee_id: rec.employee_id,
        paga_baze: rec.paga_baze,
        bonuse: rec.bonuse || 0,
        zbritje: rec.zbritje || 0,
        paga_neto: net,
        muaji: monthNum,
        viti,
        statusi: rec.statusi || 'pending',
      });

      created.push({ id: salaryId, employee_id: rec.employee_id, paga_neto: net });
    }

    res.status(201).json({
      success: true,
      message: `Bulk salary processing complete — ${created.length} created, ${skipped.length} skipped`,
      data: { muaji: monthNum, viti: Number(viti), created, skipped },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/salaries/generate
 *
 * Generate monthly payroll for every active employee in one shot. Used at
 * month-end to seed the Salaries table without an HR manager having to
 * type each base pay individually.
 *
 * Base-pay strategy (per employee):
 *   - Default: midpoint of the employee's position's salary band
 *     ((paga_min + paga_max) / 2). Falls back to paga_min, then 0 if the
 *     position has no band set.
 *   - `baseStrategy: 'min'` uses paga_min instead (handy for new-hires
 *     month).
 *   - `baseStrategy: 'max'` uses paga_max (rare but useful for back-pay).
 *
 * Optional `default_bonuse` and `default_zbritje` apply uniformly to
 * every generated row. `dryRun: true` returns the preview without
 * inserting anything — the SalaryList "Generate payroll" dialog uses this
 * to show "X employees, Y already have salaries for this month" before
 * the HR manager confirms.
 *
 * @body {number}  muaji
 * @body {number}  viti
 * @body {string}  [department_id] - Scope generation to a single dept
 * @body {string}  [baseStrategy='mid'] - 'min' | 'mid' | 'max'
 * @body {number}  [default_bonuse=0]
 * @body {number}  [default_zbritje=0]
 * @body {string}  [statusi='pending']
 * @body {boolean} [dryRun=false]
 */
const generateMonthlyPayroll = async (req, res, next) => {
  try {
    const {
      muaji,
      viti,
      department_id,
      baseStrategy = 'mid',
      default_bonuse = 0,
      default_zbritje = 0,
      statusi = 'pending',
      dryRun = false,
    } = req.body;

    if (!muaji || !viti) {
      throw new AppError('muaji and viti are required', 400);
    }
    const monthNum = parseInt(muaji, 10);
    const yearNum = parseInt(viti, 10);
    if (monthNum < 1 || monthNum > 12) {
      throw new AppError('muaji must be between 1 and 12', 400);
    }
    if (!Number.isFinite(yearNum) || yearNum < 2000 || yearNum > 2100) {
      throw new AppError('viti must be a sensible four-digit year', 400);
    }
    if (statusi && !VALID_STATUSES.includes(statusi)) {
      throw new AppError(
        `Invalid statusi. Must be one of: ${VALID_STATUSES.join(', ')}`,
        400
      );
    }
    if (!['min', 'mid', 'max'].includes(baseStrategy)) {
      throw new AppError(
        "baseStrategy must be 'min', 'mid', or 'max'",
        400
      );
    }

    const bonus = Number(default_bonuse) || 0;
    const discretionary = Number(default_zbritje) || 0;

    /**
     * Pull every active employee + their position's salary band in one
     * query. Department scope is optional.
     */
    const db = require('../config/db');
    const conditions = ["e.statusi = 'active'"];
    const params = [];
    if (department_id) {
      conditions.push('e.department_id = ?');
      params.push(parseInt(department_id, 10));
    }

    const [employees] = await db.query(
      `SELECT
         e.id AS employee_id,
         e.numri_punonjesit,
         u.first_name, u.last_name,
         e.department_id,
         e.position_id,
         p.emertimi  AS position_emertimi,
         p.paga_min,
         p.paga_max,
         d.emertimi  AS department_emertimi
       FROM Employees e
       LEFT JOIN Users u        ON e.user_id = u.id
       LEFT JOIN Positions p    ON e.position_id = p.id
       LEFT JOIN Departments d  ON e.department_id = d.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.emertimi, u.last_name, u.first_name`,
      params
    );

    /** Pull existing salary rows for the period in one query, indexed by employee_id. */
    const [existingRows] = await db.query(
      `SELECT employee_id
       FROM Salaries
       WHERE muaji = ? AND viti = ?`,
      [monthNum, yearNum]
    );
    const existingEmployeeIds = new Set(existingRows.map((r) => r.employee_id));

    /** Pick base pay from the position's band given the chosen strategy. */
    const pickBase = (pMin, pMax) => {
      const min = Number(pMin) || 0;
      const max = Number(pMax) || 0;
      if (baseStrategy === 'min') return min;
      if (baseStrategy === 'max') return max || min;
      // 'mid'
      if (max > 0 && min > 0) return +((min + max) / 2).toFixed(2);
      return min || max || 0;
    };

    /** Build the per-employee plan. */
    const plan = [];
    const skipped = [];

    for (const emp of employees) {
      if (existingEmployeeIds.has(emp.employee_id)) {
        skipped.push({
          employee_id: emp.employee_id,
          name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
          reason: 'salary already exists for this period',
        });
        continue;
      }

      const base = pickBase(emp.paga_min, emp.paga_max);
      if (base <= 0) {
        skipped.push({
          employee_id: emp.employee_id,
          name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
          reason: 'position has no salary band',
        });
        continue;
      }

      const net = computeNetPay(base, bonus, discretionary);

      plan.push({
        employee_id: emp.employee_id,
        numri_punonjesit: emp.numri_punonjesit,
        name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
        department: emp.department_emertimi || null,
        position: emp.position_emertimi || null,
        paga_baze: base,
        bonuse: bonus,
        zbritje: discretionary,
        paga_neto: net,
      });
    }

    // Dry-run path — preview only, no inserts.
    if (dryRun) {
      return res.json({
        success: true,
        message: `Preview: ${plan.length} would be created, ${skipped.length} skipped`,
        data: {
          muaji: monthNum,
          viti: yearNum,
          baseStrategy,
          dryRun: true,
          plan,
          skipped,
        },
      });
    }

    // Insert each planned row. We do these sequentially so a partial
    // failure leaves a clear "stopped at row N" trail in the response.
    const created = [];
    for (const row of plan) {
      try {
        const salaryId = await Salary.create({
          employee_id: row.employee_id,
          paga_baze: row.paga_baze,
          bonuse: row.bonuse,
          zbritje: row.zbritje,
          paga_neto: row.paga_neto,
          muaji: monthNum,
          viti: yearNum,
          statusi,
        });
        created.push({
          id: salaryId,
          employee_id: row.employee_id,
          name: row.name,
          paga_neto: row.paga_neto,
        });
      } catch (err) {
        // Most likely a duplicate-key race; surface and continue.
        skipped.push({
          employee_id: row.employee_id,
          name: row.name,
          reason: err.code === 'ER_DUP_ENTRY' ? 'duplicate period' : err.message,
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `Payroll generation complete — ${created.length} created, ${skipped.length} skipped`,
      data: {
        muaji: monthNum,
        viti: yearNum,
        baseStrategy,
        dryRun: false,
        created,
        skipped,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/salaries/payroll/report?muaji=X&viti=Y
 * Rich payroll report for one month:
 *   - company-wide totals (headcount, base, bonuses, deductions, net)
 *   - per-department breakdown
 *   - year-over-year comparison vs. the same month last year, with
 *     absolute + percentage deltas on the company net total
 *
 * Distinct from `getPayrollSummary` (which is a single aggregate row):
 * this is the management-report shape the frontend renders as a table
 * with a comparison banner.
 *
 * @query {number} muaji - Month 1–12 (required)
 * @query {number} viti  - Year (required)
 */
const getPayrollReport = async (req, res, next) => {
  try {
    const { muaji, viti } = req.query;

    const month = parseInt(muaji, 10);
    const year = parseInt(viti, 10);
    if (!month || month < 1 || month > 12 || !year) {
      throw new AppError(
        'muaji (1-12) and viti are required query params',
        400
      );
    }

    /**
     * One pass over the period's salary rows, grouped by department.
     * COALESCE so a salary row whose employee has no department still
     * lands in an "Unassigned" bucket rather than vanishing.
     */
    const [deptRows] = await db.query(
      `SELECT
         COALESCE(d.id, 0)              AS department_id,
         COALESCE(d.emertimi, 'Unassigned') AS department,
         COUNT(*)                       AS headcount,
         SUM(s.paga_baze)               AS total_base,
         SUM(s.bonuse)                  AS total_bonuses,
         SUM(s.zbritje)                 AS total_deductions,
         SUM(s.paga_neto)               AS total_net
       FROM Salaries s
       LEFT JOIN Employees   e ON s.employee_id = e.id
       LEFT JOIN Departments d ON e.department_id = d.id
       WHERE s.muaji = ? AND s.viti = ?
       GROUP BY COALESCE(d.id, 0), COALESCE(d.emertimi, 'Unassigned')
       ORDER BY total_net DESC`,
      [month, year]
    );

    const num = (v) => Number(v) || 0;
    const departments = deptRows.map((r) => ({
      department_id: r.department_id || null,
      department: r.department,
      headcount: num(r.headcount),
      total_base: +num(r.total_base).toFixed(2),
      total_bonuses: +num(r.total_bonuses).toFixed(2),
      total_deductions: +num(r.total_deductions).toFixed(2),
      total_net: +num(r.total_net).toFixed(2),
    }));

    /** Company-wide totals = sum of the department buckets. */
    const company = departments.reduce(
      (acc, d) => ({
        headcount: acc.headcount + d.headcount,
        total_base: acc.total_base + d.total_base,
        total_bonuses: acc.total_bonuses + d.total_bonuses,
        total_deductions: acc.total_deductions + d.total_deductions,
        total_net: acc.total_net + d.total_net,
      }),
      {
        headcount: 0,
        total_base: 0,
        total_bonuses: 0,
        total_deductions: 0,
        total_net: 0,
      }
    );
    // Round once at the end to avoid float-accumulation drift.
    Object.keys(company).forEach((k) => {
      company[k] = +company[k].toFixed(2);
    });

    /** Same month, previous year — single aggregate row. */
    const [[prior]] = await db.query(
      `SELECT
         COUNT(*)         AS headcount,
         SUM(s.paga_neto) AS total_net
       FROM Salaries s
       WHERE s.muaji = ? AND s.viti = ?`,
      [month, year - 1]
    );

    const priorNet = +num(prior?.total_net).toFixed(2);
    const netChange = +(company.total_net - priorNet).toFixed(2);
    const netChangePct =
      priorNet > 0 ? +((netChange / priorNet) * 100).toFixed(1) : null;

    res.json({
      success: true,
      data: {
        period: { muaji: month, viti: year },
        company,
        departments,
        year_over_year: {
          compared_to: { muaji: month, viti: year - 1 },
          prior_headcount: num(prior?.headcount),
          prior_total_net: priorNet,
          net_change: netChange,
          // null when there's no prior-year data to divide by
          net_change_pct: netChangePct,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAll,
  getById,
  getEmployeeHistory,
  getPayrollSummary,
  getPayrollReport,
  create,
  update,
  remove,
  bulkCreate,
  generateMonthlyPayroll,
};

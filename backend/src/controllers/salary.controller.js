/**
 * @file backend/src/controllers/salary.controller.js
 * @description Salary controller with CRUD, auto net-salary calculation, payroll summary, and bulk processing
 * @author Dev A
 */

const Salary = require('../models/Salary');
const Employee = require('../models/Employee');
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

module.exports = {
  getAll,
  getById,
  getEmployeeHistory,
  getPayrollSummary,
  create,
  update,
  remove,
  bulkCreate,
};

const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

/**
 * GET /api/employees
 * Query parameters:
 *  - department: filter by department (e.g. 'Production', 'Compounding', 'QC', 'Logistics', etc.)
 *  - status: filter by status (default: 'active')
 *  - search: search by employee name or employee ID
 */
router.get('/', authenticateToken, (req, res) => {
    try {
        const { department, status = 'active', search } = req.query;

        let query = 'SELECT id, employee_id, name, department, status, barcode_number FROM employees WHERE 1=1';
        const params = [];

        if (status && status !== 'all') {
            query += ' AND LOWER(status) = LOWER(?)';
            params.push(status);
        }

        if (department) {
            // Support multiple comma-separated departments, e.g. "Production,Compounding"
            const depts = department.split(',').map(d => d.trim()).filter(Boolean);
            if (depts.length === 1) {
                query += ' AND LOWER(department) LIKE LOWER(?)';
                params.push(`%${depts[0]}%`);
            } else if (depts.length > 1) {
                const placeholders = depts.map(() => 'LOWER(department) LIKE LOWER(?)').join(' OR ');
                query += ` AND (${placeholders})`;
                depts.forEach(d => params.push(`%${d}%`));
            }
        }

        if (search) {
            query += ' AND (name LIKE ? OR employee_id LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term);
        }

        query += ' ORDER BY name ASC';
        const employees = db.prepare(query).all(...params);

        return res.json({ success: true, count: employees.length, data: employees });
    } catch (error) {
        console.error('Error fetching employees:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch employees roster.' });
    }
});

/**
 * GET /api/employees/departments
 * Returns list of distinct active departments with employee counts
 */
router.get('/departments', authenticateToken, (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT department, COUNT(*) as count
            FROM employees
            WHERE LOWER(status) = 'active'
            GROUP BY department
            ORDER BY count DESC
        `).all();

        return res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching employee departments:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch employee departments.' });
    }
});

module.exports = router;

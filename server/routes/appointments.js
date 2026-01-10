import express from 'express';
import { authenticate, isDispatcher, isDriver } from '../middleware/auth.js';

const router = express.Router();

// Get all appointments
router.get('/', authenticate, async (req, res) => {
    const db = req.app.locals.db;
    const { date, status, assigned_to } = req.query;

    let sql = `
        SELECT ap.*,
               c.name as customer_name,
               c.phone as customer_phone,
               a.street, a.city, a.state, a.zip, a.lat, a.lng,
               s.name as service_name,
               u.name as assigned_to_name
        FROM appointments ap
        JOIN customers c ON c.id = ap.customer_id
        JOIN addresses a ON a.id = ap.address_id
        LEFT JOIN services s ON s.id = ap.service_id
        LEFT JOIN users u ON u.id = ap.assigned_to
        WHERE 1=1
    `;
    const params = [];

    if (date) {
        sql += ' AND ap.scheduled_date = ?';
        params.push(date);
    }
    if (status) {
        sql += ' AND ap.status = ?';
        params.push(status);
    }
    if (assigned_to) {
        sql += ' AND ap.assigned_to = ?';
        params.push(assigned_to);
    }

    sql += ' ORDER BY ap.scheduled_date, ap.scheduled_time';

    try {
        const appointments = await db.prepare(sql).all(...params);
        res.json(appointments);
    } catch (error) {
        console.error('Error fetching appointments:', error);
        res.status(500).json({ error: 'Failed to fetch appointments' });
    }
});

// Get appointments for date range (calendar view)
router.get('/range', authenticate, async (req, res) => {
    const db = req.app.locals.db;
    const { start, end } = req.query;

    if (!start || !end) {
        return res.status(400).json({ error: 'Start and end dates are required' });
    }

    try {
        const appointments = await db.prepare(`
            SELECT ap.*,
                   c.name as customer_name,
                   a.street, a.city,
                   s.name as service_name
            FROM appointments ap
            JOIN customers c ON c.id = ap.customer_id
            JOIN addresses a ON a.id = ap.address_id
            LEFT JOIN services s ON s.id = ap.service_id
            WHERE ap.scheduled_date BETWEEN ? AND ?
            ORDER BY ap.scheduled_date, ap.scheduled_time
        `).all(start, end);
        res.json(appointments);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch appointments' });
    }
});

// Get single appointment
router.get('/:id', authenticate, async (req, res) => {
    const db = req.app.locals.db;
    try {
        const appointment = await db.prepare(`
            SELECT ap.*,
                   c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
                   a.street, a.city, a.state, a.zip, a.lat, a.lng,
                   s.name as service_name, s.price as service_price,
                   u.name as assigned_to_name
            FROM appointments ap
            JOIN customers c ON c.id = ap.customer_id
            JOIN addresses a ON a.id = ap.address_id
            LEFT JOIN services s ON s.id = ap.service_id
            LEFT JOIN users u ON u.id = ap.assigned_to
            WHERE ap.id = ?
        `).get(req.params.id);

        if (!appointment) {
            return res.status(404).json({ error: 'Appointment not found' });
        }
        res.json(appointment);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch appointment' });
    }
});

// Create appointment
router.post('/', authenticate, isDispatcher, async (req, res) => {
    const {
        customer_id, address_id, service_id, assigned_to,
        scheduled_date, scheduled_time, is_recurring, recurrence_pattern, notes
    } = req.body;
    const db = req.app.locals.db;

    if (!customer_id || !address_id || !scheduled_date) {
        return res.status(400).json({ error: 'Customer, address, and date are required' });
    }

    try {
        const result = await db.prepare(`
            INSERT INTO appointments (customer_id, address_id, service_id, assigned_to, scheduled_date, scheduled_time, is_recurring, recurrence_pattern, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(customer_id, address_id, service_id || null, assigned_to || null, scheduled_date, scheduled_time || null, is_recurring ? 1 : 0, recurrence_pattern || null, notes || null);

        await db.prepare(
            'INSERT INTO activity_log (entity_type, entity_id, action, user_id) VALUES (?, ?, ?, ?)'
        ).run('appointment', result.lastInsertRowid, 'created', req.user.id);

        res.status(201).json({
            id: result.lastInsertRowid,
            customer_id, address_id, service_id, assigned_to,
            scheduled_date, scheduled_time, is_recurring, recurrence_pattern, notes,
            status: 'scheduled'
        });
    } catch (error) {
        console.error('Error creating appointment:', error);
        res.status(500).json({ error: 'Failed to create appointment' });
    }
});

// Update appointment
router.put('/:id', authenticate, isDispatcher, async (req, res) => {
    const {
        customer_id, address_id, service_id, assigned_to,
        scheduled_date, scheduled_time, status, is_recurring, recurrence_pattern, notes
    } = req.body;
    const db = req.app.locals.db;

    try {
        const result = await db.prepare(`
            UPDATE appointments SET
                customer_id = ?, address_id = ?, service_id = ?, assigned_to = ?,
                scheduled_date = ?, scheduled_time = ?, status = ?,
                is_recurring = ?, recurrence_pattern = ?, notes = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(customer_id, address_id, service_id, assigned_to, scheduled_date, scheduled_time, status, is_recurring ? 1 : 0, recurrence_pattern, notes, req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Appointment not found' });
        }

        res.json({ id: parseInt(req.params.id), customer_id, address_id, service_id, assigned_to, scheduled_date, scheduled_time, status, is_recurring, recurrence_pattern, notes });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update appointment' });
    }
});

// Update appointment status (drivers can do this)
router.patch('/:id/status', authenticate, isDriver, async (req, res) => {
    const { status } = req.body;
    const db = req.app.locals.db;

    const validStatuses = ['scheduled', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const result = await db.prepare(
            'UPDATE appointments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(status, req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Appointment not found' });
        }

        await db.prepare(
            'INSERT INTO activity_log (entity_type, entity_id, action, details, user_id) VALUES (?, ?, ?, ?, ?)'
        ).run('appointment', req.params.id, 'status_changed', status, req.user.id);

        res.json({ id: parseInt(req.params.id), status });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// Delete appointment
router.delete('/:id', authenticate, isDispatcher, async (req, res) => {
    const db = req.app.locals.db;

    try {
        const result = await db.prepare('DELETE FROM appointments WHERE id = ?').run(req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Appointment not found' });
        }
        res.json({ message: 'Appointment deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete appointment' });
    }
});

export default router;

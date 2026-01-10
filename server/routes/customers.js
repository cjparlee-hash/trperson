import express from 'express';
import { authenticate, isDispatcher } from '../middleware/auth.js';

const router = express.Router();

// Get all customers
router.get('/', authenticate, async (req, res) => {
    const db = req.app.locals.db;
    try {
        const customers = await db.prepare(`
            SELECT c.*,
                   COUNT(DISTINCT a.id) as address_count,
                   COUNT(DISTINCT ap.id) as appointment_count
            FROM customers c
            LEFT JOIN addresses a ON a.customer_id = c.id
            LEFT JOIN appointments ap ON ap.customer_id = c.id
            GROUP BY c.id
            ORDER BY c.name
        `).all();
        res.json(customers);
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});

// Get single customer with addresses
router.get('/:id', authenticate, async (req, res) => {
    const db = req.app.locals.db;
    try {
        const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const addresses = await db.prepare('SELECT * FROM addresses WHERE customer_id = ?').all(req.params.id);
        const appointments = await db.prepare(`
            SELECT ap.*, s.name as service_name
            FROM appointments ap
            LEFT JOIN services s ON s.id = ap.service_id
            WHERE ap.customer_id = ?
            ORDER BY ap.scheduled_date DESC
            LIMIT 10
        `).all(req.params.id);

        res.json({ ...customer, addresses, appointments });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch customer' });
    }
});

// Create customer
router.post('/', authenticate, isDispatcher, async (req, res) => {
    const { name, email, phone, notes, status = 'active' } = req.body;
    const db = req.app.locals.db;

    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }

    try {
        const result = await db.prepare(
            'INSERT INTO customers (name, email, phone, notes, status) VALUES (?, ?, ?, ?, ?)'
        ).run(name, email || null, phone || null, notes || null, status);

        // Log activity
        await db.prepare(
            'INSERT INTO activity_log (entity_type, entity_id, action, user_id) VALUES (?, ?, ?, ?)'
        ).run('customer', result.lastInsertRowid, 'created', req.user.id);

        res.status(201).json({ id: result.lastInsertRowid, name, email, phone, notes, status });
    } catch (error) {
        console.error('Error creating customer:', error);
        res.status(500).json({ error: 'Failed to create customer' });
    }
});

// Update customer
router.put('/:id', authenticate, isDispatcher, async (req, res) => {
    const { name, email, phone, notes, status } = req.body;
    const db = req.app.locals.db;

    try {
        const result = await db.prepare(`
            UPDATE customers SET name = ?, email = ?, phone = ?, notes = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(name, email, phone, notes, status, req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        await db.prepare(
            'INSERT INTO activity_log (entity_type, entity_id, action, user_id) VALUES (?, ?, ?, ?)'
        ).run('customer', req.params.id, 'updated', req.user.id);

        res.json({ id: parseInt(req.params.id), name, email, phone, notes, status });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update customer' });
    }
});

// Delete customer
router.delete('/:id', authenticate, isDispatcher, async (req, res) => {
    const db = req.app.locals.db;

    try {
        const result = await db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        res.json({ message: 'Customer deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete customer' });
    }
});

// Add address to customer
router.post('/:id/addresses', authenticate, isDispatcher, async (req, res) => {
    const { street, city, state, zip, lat, lng, is_primary, notes } = req.body;
    const db = req.app.locals.db;

    if (!street || !city || !state || !zip) {
        return res.status(400).json({ error: 'Street, city, state, and zip are required' });
    }

    try {
        // If this is primary, unset other primaries
        if (is_primary) {
            await db.prepare('UPDATE addresses SET is_primary = 0 WHERE customer_id = ?').run(req.params.id);
        }

        const result = await db.prepare(`
            INSERT INTO addresses (customer_id, street, city, state, zip, lat, lng, is_primary, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(req.params.id, street, city, state, zip, lat, lng, is_primary ? 1 : 0, notes);

        res.status(201).json({
            id: result.lastInsertRowid,
            customer_id: parseInt(req.params.id),
            street, city, state, zip, lat, lng, is_primary, notes
        });
    } catch (error) {
        console.error('Error adding address:', error);
        res.status(500).json({ error: 'Failed to add address' });
    }
});

export default router;

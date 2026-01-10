import express from 'express';
import { authenticate, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Get all services
router.get('/', authenticate, async (req, res) => {
    const db = req.app.locals.db;
    try {
        const services = await db.prepare('SELECT * FROM services ORDER BY name').all();
        res.json(services);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch services' });
    }
});

// Get single service
router.get('/:id', authenticate, async (req, res) => {
    const db = req.app.locals.db;
    try {
        const service = await db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
        if (!service) {
            return res.status(404).json({ error: 'Service not found' });
        }
        res.json(service);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch service' });
    }
});

// Create service (admin only)
router.post('/', authenticate, isAdmin, async (req, res) => {
    const { name, description, price, is_recurring } = req.body;
    const db = req.app.locals.db;

    if (!name || price === undefined) {
        return res.status(400).json({ error: 'Name and price are required' });
    }

    try {
        const result = await db.prepare(
            'INSERT INTO services (name, description, price, is_recurring) VALUES (?, ?, ?, ?)'
        ).run(name, description || null, price, is_recurring ? 1 : 0);

        res.status(201).json({
            id: result.lastInsertRowid,
            name,
            description,
            price,
            is_recurring
        });
    } catch (error) {
        console.error('Error creating service:', error);
        res.status(500).json({ error: 'Failed to create service' });
    }
});

// Update service (admin only)
router.put('/:id', authenticate, isAdmin, async (req, res) => {
    const { name, description, price, is_recurring } = req.body;
    const db = req.app.locals.db;

    try {
        const result = await db.prepare(`
            UPDATE services SET name = ?, description = ?, price = ?, is_recurring = ?
            WHERE id = ?
        `).run(name, description, price, is_recurring ? 1 : 0, req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Service not found' });
        }

        res.json({ id: parseInt(req.params.id), name, description, price, is_recurring });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update service' });
    }
});

// Delete service (admin only)
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
    const db = req.app.locals.db;

    try {
        const result = await db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Service not found' });
        }
        res.json({ message: 'Service deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete service' });
    }
});

export default router;

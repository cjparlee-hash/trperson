import express from 'express';
import { authenticate, isDispatcher } from '../middleware/auth.js';

const router = express.Router();

// Get all leads
router.get('/', authenticate, (req, res) => {
    const db = req.app.locals.db;
    try {
        const leads = db.prepare(`
            SELECT l.*, u.name as assigned_to_name
            FROM leads l
            LEFT JOIN users u ON u.id = l.assigned_to
            ORDER BY l.created_at DESC
        `).all();
        res.json(leads);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch leads' });
    }
});

// Get leads by stage
router.get('/stage/:stage', authenticate, (req, res) => {
    const db = req.app.locals.db;
    try {
        const leads = db.prepare(`
            SELECT l.*, u.name as assigned_to_name
            FROM leads l
            LEFT JOIN users u ON u.id = l.assigned_to
            WHERE l.stage = ?
            ORDER BY l.created_at DESC
        `).all(req.params.stage);
        res.json(leads);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch leads' });
    }
});

// Get single lead
router.get('/:id', authenticate, (req, res) => {
    const db = req.app.locals.db;
    try {
        const lead = db.prepare(`
            SELECT l.*, u.name as assigned_to_name
            FROM leads l
            LEFT JOIN users u ON u.id = l.assigned_to
            WHERE l.id = ?
        `).get(req.params.id);

        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }
        res.json(lead);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch lead' });
    }
});

// Create lead
router.post('/', authenticate, isDispatcher, (req, res) => {
    const { name, email, phone, address, source, stage = 'new', notes, follow_up_date, assigned_to } = req.body;
    const db = req.app.locals.db;

    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }

    try {
        const result = db.prepare(`
            INSERT INTO leads (name, email, phone, address, source, stage, notes, follow_up_date, assigned_to)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(name, email, phone, address, source, stage, notes, follow_up_date, assigned_to);

        db.prepare(
            'INSERT INTO activity_log (entity_type, entity_id, action, user_id) VALUES (?, ?, ?, ?)'
        ).run('lead', result.lastInsertRowid, 'created', req.user.id);

        res.status(201).json({
            id: result.lastInsertRowid,
            name, email, phone, address, source, stage, notes, follow_up_date, assigned_to
        });
    } catch (error) {
        console.error('Error creating lead:', error);
        res.status(500).json({ error: 'Failed to create lead' });
    }
});

// Update lead
router.put('/:id', authenticate, isDispatcher, (req, res) => {
    const { name, email, phone, address, source, stage, notes, follow_up_date, assigned_to } = req.body;
    const db = req.app.locals.db;

    try {
        const result = db.prepare(`
            UPDATE leads SET
                name = ?, email = ?, phone = ?, address = ?, source = ?,
                stage = ?, notes = ?, follow_up_date = ?, assigned_to = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(name, email, phone, address, source, stage, notes, follow_up_date, assigned_to, req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        db.prepare(
            'INSERT INTO activity_log (entity_type, entity_id, action, details, user_id) VALUES (?, ?, ?, ?, ?)'
        ).run('lead', req.params.id, 'updated', `Stage: ${stage}`, req.user.id);

        res.json({ id: parseInt(req.params.id), name, email, phone, address, source, stage, notes, follow_up_date, assigned_to });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update lead' });
    }
});

// Convert lead to customer
router.post('/:id/convert', authenticate, isDispatcher, (req, res) => {
    const db = req.app.locals.db;

    try {
        const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        // Create customer from lead
        const result = db.prepare(
            'INSERT INTO customers (name, email, phone, notes) VALUES (?, ?, ?, ?)'
        ).run(lead.name, lead.email, lead.phone, lead.notes);

        // Update lead status
        db.prepare("UPDATE leads SET stage = 'won', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);

        // Log activity
        db.prepare(
            'INSERT INTO activity_log (entity_type, entity_id, action, details, user_id) VALUES (?, ?, ?, ?, ?)'
        ).run('lead', req.params.id, 'converted', `Customer ID: ${result.lastInsertRowid}`, req.user.id);

        res.json({
            message: 'Lead converted to customer',
            customer_id: result.lastInsertRowid
        });
    } catch (error) {
        console.error('Error converting lead:', error);
        res.status(500).json({ error: 'Failed to convert lead' });
    }
});

// Delete lead
router.delete('/:id', authenticate, isDispatcher, (req, res) => {
    const db = req.app.locals.db;

    try {
        const result = db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Lead not found' });
        }
        res.json({ message: 'Lead deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete lead' });
    }
});

export default router;

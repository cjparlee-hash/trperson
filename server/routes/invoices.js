import express from 'express';
import { authenticate, isDispatcher } from '../middleware/auth.js';

const router = express.Router();

// Generate invoice number
const generateInvoiceNumber = (db) => {
    const year = new Date().getFullYear();
    const count = db.prepare(
        "SELECT COUNT(*) as count FROM invoices WHERE invoice_number LIKE ?"
    ).get(`INV-${year}-%`);
    return `INV-${year}-${String(count.count + 1).padStart(4, '0')}`;
};

// Get all invoices
router.get('/', authenticate, (req, res) => {
    const db = req.app.locals.db;
    const { status, customer_id } = req.query;

    let sql = `
        SELECT i.*, c.name as customer_name, c.email as customer_email
        FROM invoices i
        JOIN customers c ON c.id = i.customer_id
        WHERE 1=1
    `;
    const params = [];

    if (status) {
        sql += ' AND i.status = ?';
        params.push(status);
    }
    if (customer_id) {
        sql += ' AND i.customer_id = ?';
        params.push(customer_id);
    }

    sql += ' ORDER BY i.created_at DESC';

    try {
        const invoices = db.prepare(sql).all(...params);
        res.json(invoices);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

// Get single invoice with items
router.get('/:id', authenticate, (req, res) => {
    const db = req.app.locals.db;
    try {
        const invoice = db.prepare(`
            SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
            FROM invoices i
            JOIN customers c ON c.id = i.customer_id
            WHERE i.id = ?
        `).get(req.params.id);

        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const items = db.prepare(`
            SELECT ii.*, s.name as service_name
            FROM invoice_items ii
            LEFT JOIN services s ON s.id = ii.service_id
            WHERE ii.invoice_id = ?
        `).all(req.params.id);

        const payments = db.prepare(
            'SELECT * FROM payments WHERE invoice_id = ? ORDER BY created_at DESC'
        ).all(req.params.id);

        res.json({ ...invoice, items, payments });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch invoice' });
    }
});

// Create invoice
router.post('/', authenticate, isDispatcher, (req, res) => {
    let { customer_id, customer_name, items, tax = 0, due_date, notes } = req.body;
    const db = req.app.locals.db;

    if ((!customer_id && !customer_name) || !items || items.length === 0) {
        return res.status(400).json({ error: 'Customer and at least one item are required' });
    }

    try {
        // If no customer_id but customer_name provided, create new customer
        if (!customer_id && customer_name) {
            const result = db.prepare(
                'INSERT INTO customers (name, status) VALUES (?, ?)'
            ).run(customer_name.trim(), 'active');
            customer_id = result.lastInsertRowid;
        }
        const invoice_number = generateInvoiceNumber(db);
        const amount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
        const total = amount + (amount * tax / 100);

        const result = db.prepare(`
            INSERT INTO invoices (invoice_number, customer_id, amount, tax, total, due_date, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(invoice_number, customer_id, amount, tax, total, due_date, notes);

        // Insert items
        const insertItem = db.prepare(`
            INSERT INTO invoice_items (invoice_id, service_id, description, quantity, unit_price, total)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const item of items) {
            insertItem.run(
                result.lastInsertRowid,
                item.service_id || null,
                item.description,
                item.quantity,
                item.unit_price,
                item.quantity * item.unit_price
            );
        }

        db.prepare(
            'INSERT INTO activity_log (entity_type, entity_id, action, user_id) VALUES (?, ?, ?, ?)'
        ).run('invoice', result.lastInsertRowid, 'created', req.user.id);

        res.status(201).json({
            id: result.lastInsertRowid,
            invoice_number,
            customer_id,
            amount,
            tax,
            total,
            status: 'draft',
            due_date,
            notes
        });
    } catch (error) {
        console.error('Error creating invoice:', error);
        res.status(500).json({ error: 'Failed to create invoice', details: error.message });
    }
});

// Update invoice status
router.patch('/:id/status', authenticate, isDispatcher, (req, res) => {
    const { status } = req.body;
    const db = req.app.locals.db;

    const validStatuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const updates = { status };
        if (status === 'paid') {
            updates.paid_date = new Date().toISOString().split('T')[0];
        }

        const result = db.prepare(`
            UPDATE invoices SET status = ?, paid_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(status, updates.paid_date || null, req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        res.json({ id: parseInt(req.params.id), status, paid_date: updates.paid_date });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update invoice status' });
    }
});

// Record payment
router.post('/:id/payments', authenticate, isDispatcher, (req, res) => {
    const { amount, stripe_payment_id, payment_method } = req.body;
    const db = req.app.locals.db;

    try {
        const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const result = db.prepare(`
            INSERT INTO payments (invoice_id, stripe_payment_id, amount, status, payment_method)
            VALUES (?, ?, ?, 'succeeded', ?)
        `).run(req.params.id, stripe_payment_id, amount, payment_method);

        // Check if fully paid
        const totalPaid = db.prepare(
            "SELECT SUM(amount) as total FROM payments WHERE invoice_id = ? AND status = 'succeeded'"
        ).get(req.params.id);

        if (totalPaid.total >= invoice.total) {
            db.prepare(
                "UPDATE invoices SET status = 'paid', paid_date = CURRENT_TIMESTAMP WHERE id = ?"
            ).run(req.params.id);
        }

        res.status(201).json({
            id: result.lastInsertRowid,
            invoice_id: parseInt(req.params.id),
            amount,
            status: 'succeeded'
        });
    } catch (error) {
        console.error('Error recording payment:', error);
        res.status(500).json({ error: 'Failed to record payment' });
    }
});

// Delete invoice (only drafts)
router.delete('/:id', authenticate, isDispatcher, (req, res) => {
    const db = req.app.locals.db;

    try {
        const invoice = db.prepare('SELECT status FROM invoices WHERE id = ?').get(req.params.id);
        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        if (invoice.status !== 'draft') {
            return res.status(400).json({ error: 'Only draft invoices can be deleted' });
        }

        db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
        res.json({ message: 'Invoice deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete invoice' });
    }
});

export default router;

import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
    const { email, password, name, role = 'admin' } = req.body;
    const db = req.app.locals.db;

    if (!email || !password || !name) {
        return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    try {
        // Check if user exists
        const existing = await db.prepare('SELECT id FROM users WHERE email = $1').get(email);
        if (existing) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Hash password
        const hashedPassword = bcrypt.hashSync(password, 10);

        // Insert user
        const result = await db.prepare(
            'INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4) RETURNING id'
        ).run(email, hashedPassword, name, role);

        const userId = result.lastInsertRowid;

        // Generate token
        const token = jwt.sign(
            { id: userId, email, name, role },
            process.env.JWT_SECRET || 'dev-secret',
            { expiresIn: '7d' }
        );

        res.status(201).json({
            user: { id: userId, email, name, role },
            token
        });
    } catch (error) {
        console.error('Registration error:', error.message, error.stack);
        res.status(500).json({ error: 'Registration failed', details: error.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const db = req.app.locals.db;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const user = await db.prepare('SELECT * FROM users WHERE email = $1').get(email);

        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, name: user.name, role: user.role },
            process.env.JWT_SECRET || 'dev-secret',
            { expiresIn: '7d' }
        );

        res.json({
            user: { id: user.id, email: user.email, name: user.name, role: user.role },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
    const db = req.app.locals.db;

    try {
        const user = await db.prepare('SELECT id, email, name, role FROM users WHERE id = $1').get(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

export default router;

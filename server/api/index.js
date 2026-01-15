import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Routes
import authRoutes from '../routes/auth.js';
import customerRoutes from '../routes/customers.js';
import leadRoutes from '../routes/leads.js';
import appointmentRoutes from '../routes/appointments.js';
import invoiceRoutes from '../routes/invoices.js';
import routeRoutes from '../routes/routes.js';
import serviceRoutes from '../routes/services.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Async database wrapper for PostgreSQL
class AsyncDatabaseWrapper {
    constructor(pool) {
        this.pool = pool;
    }

    prepare(sql) {
        const pool = this.pool;
        let paramIndex = 0;
        const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);

        const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
        const finalSql = isInsert && !pgSql.toUpperCase().includes('RETURNING')
            ? pgSql + ' RETURNING id'
            : pgSql;

        return {
            run: async (...params) => {
                const result = await pool.query(finalSql, params);
                return {
                    changes: result.rowCount,
                    lastInsertRowid: result.rows[0]?.id || 0
                };
            },
            get: async (...params) => {
                const result = await pool.query(finalSql, params);
                return result.rows[0] || undefined;
            },
            all: async (...params) => {
                const result = await pool.query(finalSql, params);
                return result.rows;
            }
        };
    }
}

// Database connection (cached for serverless)
let pool = null;
let dbInitialized = false;

async function getDb() {
    if (!pool) {
        pool = new pg.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });
    }

    if (!dbInitialized) {
        // Run schema once
        const schemaPath = join(__dirname, '..', 'schema-postgres.sql');
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            try {
                await pool.query(schema);
            } catch (err) {
                // Schema might already exist
            }
        }
        dbInitialized = true;
    }

    return new AsyncDatabaseWrapper(pool);
}

// Middleware to attach db to request
app.use(async (req, res, next) => {
    try {
        req.app.locals.db = await getDb();
        req.app.locals.pool = pool;
        next();
    } catch (err) {
        res.status(500).json({ error: 'Database connection failed', details: err.message });
    }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/services', serviceRoutes);

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const db = await getDb();
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            database: 'postgresql'
        });
    } catch (e) {
        res.json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: e.message
        });
    }
});

// Root route
app.get('/', (req, res) => {
    res.json({ message: 'TrashPerson API', status: 'running' });
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!', details: err.message });
});

export default app;

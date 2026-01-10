import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Routes
import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customers.js';
import leadRoutes from './routes/leads.js';
import appointmentRoutes from './routes/appointments.js';
import invoiceRoutes from './routes/invoices.js';
import routeRoutes from './routes/routes.js';
import serviceRoutes from './routes/services.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database wrapper to provide better-sqlite3-like API for PostgreSQL
class DatabaseWrapper {
    constructor(pool) {
        this.pool = pool;
    }

    prepare(sql) {
        const pool = this.pool;
        // Convert ? placeholders to $1, $2, etc. for PostgreSQL
        let paramIndex = 0;
        const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);

        return {
            async run(...params) {
                const result = await pool.query(pgSql, params);
                return {
                    changes: result.rowCount,
                    lastInsertRowid: result.rows[0]?.id || 0
                };
            },
            async get(...params) {
                const result = await pool.query(pgSql, params);
                return result.rows[0] || undefined;
            },
            async all(...params) {
                const result = await pool.query(pgSql, params);
                return result.rows;
            }
        };
    }
}

// Async database wrapper for PostgreSQL
class AsyncDatabaseWrapper {
    constructor(pool) {
        this.pool = pool;
    }

    prepare(sql) {
        const pool = this.pool;
        // Convert ? placeholders to $1, $2, etc. for PostgreSQL
        let paramIndex = 0;
        const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);

        // For INSERT statements, add RETURNING id to get lastInsertRowid
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

// Initialize database and start server
async function start() {
    // Create PostgreSQL connection pool
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    // Test connection
    try {
        await pool.query('SELECT NOW()');
        console.log('Connected to PostgreSQL database');
    } catch (err) {
        console.error('Failed to connect to database:', err.message);
        process.exit(1);
    }

    // Run schema
    const devSchemaPath = join(__dirname, '..', 'database', 'schema-postgres.sql');
    const prodSchemaPath = join(__dirname, 'schema-postgres.sql');
    const schemaPath = fs.existsSync(devSchemaPath) ? devSchemaPath : prodSchemaPath;

    if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        try {
            await pool.query(schema);
            console.log('Database schema initialized');
        } catch (err) {
            // Schema might already exist, that's ok
            console.log('Schema initialization:', err.message.includes('already exists') ? 'Tables exist' : err.message);
        }
    }

    // Make db available to routes - using async wrapper
    app.locals.db = new AsyncDatabaseWrapper(pool);
    app.locals.pool = pool;  // Also expose pool directly for complex queries

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
            const result = await pool.query("SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'");
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                tables: parseInt(result.rows[0].count),
                env: process.env.NODE_ENV || 'not set',
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

    // Error handling middleware
    app.use((err, req, res, next) => {
        console.error(err.stack);
        res.status(500).json({ error: 'Something went wrong!', details: err.message });
    });

    app.listen(PORT, () => {
        console.log(`TrashPerson API running on http://localhost:${PORT}`);
    });
}

start().catch(console.error);

export default app;

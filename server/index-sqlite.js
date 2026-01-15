import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import initSqlJs from 'sql.js';
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

// SQLite database wrapper (matches PostgreSQL wrapper API)
class SQLiteWrapper {
    constructor(db, dbPath) {
        this.db = db;
        this.dbPath = dbPath;
    }

    save() {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(this.dbPath, buffer);
    }

    prepare(sql) {
        const db = this.db;
        const wrapper = this;

        return {
            run: async (...params) => {
                try {
                    db.run(sql, params);
                    wrapper.save();
                    const lastId = db.exec("SELECT last_insert_rowid() as id")[0]?.values[0][0] || 0;
                    return {
                        changes: db.getRowsModified(),
                        lastInsertRowid: lastId
                    };
                } catch (e) {
                    throw e;
                }
            },
            get: async (...params) => {
                try {
                    const stmt = db.prepare(sql);
                    stmt.bind(params);
                    if (stmt.step()) {
                        const row = stmt.getAsObject();
                        stmt.free();
                        return row;
                    }
                    stmt.free();
                    return undefined;
                } catch (e) {
                    throw e;
                }
            },
            all: async (...params) => {
                try {
                    const stmt = db.prepare(sql);
                    stmt.bind(params);
                    const rows = [];
                    while (stmt.step()) {
                        rows.push(stmt.getAsObject());
                    }
                    stmt.free();
                    return rows;
                } catch (e) {
                    throw e;
                }
            }
        };
    }
}

// Initialize database and start server
async function start() {
    const SQL = await initSqlJs();

    const dbPath = join(__dirname, '..', 'database', 'trashperson.db');
    let db;

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
        console.log('Loaded existing SQLite database');
    } else {
        db = new SQL.Database();
        console.log('Created new SQLite database');
    }

    // Run schema
    const schemaPath = join(__dirname, '..', 'database', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        try {
            db.run(schema);
            // Save after schema
            const data = db.export();
            fs.writeFileSync(dbPath, Buffer.from(data));
            console.log('Database schema initialized');
        } catch (err) {
            console.log('Schema initialization:', err.message);
        }
    }

    // Make db available to routes
    app.locals.db = new SQLiteWrapper(db, dbPath);

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
            const result = db.exec("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'");
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                tables: result[0]?.values[0][0] || 0,
                env: process.env.NODE_ENV || 'not set',
                database: 'sqlite'
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
        console.log(`TrashPerson API (SQLite) running on http://localhost:${PORT}`);
    });
}

start().catch(console.error);

export default app;

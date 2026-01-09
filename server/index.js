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

// Database wrapper to provide better-sqlite3-like API
class DatabaseWrapper {
    constructor(sqlDb, dbPath) {
        this.db = sqlDb;
        this.dbPath = dbPath;
    }

    prepare(sql) {
        const db = this.db;
        const dbPath = this.dbPath;
        return {
            run(...params) {
                db.run(sql, params);
                const result = { changes: db.getRowsModified(), lastInsertRowid: 0 };
                // Get last insert id
                const lastId = db.exec("SELECT last_insert_rowid() as id");
                if (lastId.length > 0 && lastId[0].values.length > 0) {
                    result.lastInsertRowid = lastId[0].values[0][0];
                }
                // Save to file
                const data = db.export();
                fs.writeFileSync(dbPath, Buffer.from(data));
                return result;
            },
            get(...params) {
                const stmt = db.prepare(sql);
                stmt.bind(params);
                if (stmt.step()) {
                    const row = stmt.getAsObject();
                    stmt.free();
                    return row;
                }
                stmt.free();
                return undefined;
            },
            all(...params) {
                const results = [];
                const stmt = db.prepare(sql);
                stmt.bind(params);
                while (stmt.step()) {
                    results.push(stmt.getAsObject());
                }
                stmt.free();
                return results;
            }
        };
    }

    exec(sql) {
        this.db.run(sql);
        const data = this.db.export();
        fs.writeFileSync(this.dbPath, Buffer.from(data));
    }
}

// Initialize database and start server
async function start() {
    const SQL = await initSqlJs();

    // Use local data folder in production, ../database in development
    const devDbPath = join(__dirname, '..', 'database', 'trashperson.db');
    const prodDbPath = join(__dirname, 'data', 'trashperson.db');
    const isProduction = process.env.NODE_ENV === 'production';

    // Ensure data directory exists in production
    if (isProduction && !fs.existsSync(join(__dirname, 'data'))) {
        fs.mkdirSync(join(__dirname, 'data'), { recursive: true });
    }

    const dbPath = isProduction ? prodDbPath : (fs.existsSync(devDbPath) ? devDbPath : prodDbPath);
    let db;

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    const dbWrapper = new DatabaseWrapper(db, dbPath);

    // Run schema - check both locations
    const devSchemaPath = join(__dirname, '..', 'database', 'schema.sql');
    const prodSchemaPath = join(__dirname, 'schema.sql');
    const schemaPath = fs.existsSync(devSchemaPath) ? devSchemaPath : prodSchemaPath;

    if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        db.exec(schema);  // exec() handles multiple statements, run() does not
        const data = db.export();
        fs.writeFileSync(dbPath, Buffer.from(data));
    }

    // Make db available to routes
    app.locals.db = dbWrapper;

    // Routes
    app.use('/api/auth', authRoutes);
    app.use('/api/customers', customerRoutes);
    app.use('/api/leads', leadRoutes);
    app.use('/api/appointments', appointmentRoutes);
    app.use('/api/invoices', invoiceRoutes);
    app.use('/api/routes', routeRoutes);
    app.use('/api/services', serviceRoutes);

    // Health check
    app.get('/api/health', (req, res) => {
        const db = req.app.locals.db;
        let tableCount = 0;
        try {
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
            tableCount = tables.length;
        } catch (e) {
            tableCount = -1;
        }
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            tables: tableCount,
            env: process.env.NODE_ENV || 'not set'
        });
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

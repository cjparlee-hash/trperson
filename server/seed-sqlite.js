import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function seed() {
    const SQL = await initSqlJs();

    const dbPath = join(__dirname, '..', 'database', 'trashperson.db');
    let db;

    // Load or create database
    if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
        console.log('Loaded existing database');
    } else {
        db = new SQL.Database();
        console.log('Created new database');
    }

    // Run schema first
    const schemaPath = join(__dirname, '..', 'database', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        try {
            db.run(schema);
            console.log('Schema initialized');
        } catch (err) {
            console.log('Schema:', err.message);
        }
    }

    const today = new Date().toISOString().split('T')[0];
    console.log(`\nSeeding test data for: ${today}`);

    // Hash password for test user
    const hashedPassword = await bcrypt.hash('test123', 10);

    // Insert test admin user
    try {
        db.run(`INSERT OR IGNORE INTO users (email, password, name, role) VALUES (?, ?, ?, ?)`,
            ['admin@test.com', hashedPassword, 'Test Admin', 'admin']);
        console.log('Created/verified test admin user');
    } catch (e) {
        console.log('User:', e.message);
    }

    // Insert service
    try {
        db.run(`INSERT OR IGNORE INTO services (name, description, price, is_recurring) VALUES (?, ?, ?, ?)`,
            ['Weekly Trash Pickup', 'Standard weekly residential trash collection', 25.00, 1]);
        console.log('Created/verified test service');
    } catch (e) {
        console.log('Service:', e.message);
    }

    // Get service ID
    const serviceResult = db.exec("SELECT id FROM services WHERE name = 'Weekly Trash Pickup'");
    const serviceId = serviceResult[0]?.values[0][0] || 1;

    // Customer data with Austin, TX coordinates
    const customers = [
        { name: 'Johnson Family', email: 'johnson@email.com', phone: '512-555-0101', street: '100 Congress Ave', lat: 30.2672, lng: -97.7431 },
        { name: 'Smith Residence', email: 'smith@email.com', phone: '512-555-0102', street: '2000 S Lamar Blvd', lat: 30.2465, lng: -97.7729 },
        { name: 'Garcia Home', email: 'garcia@email.com', phone: '512-555-0103', street: '500 E 7th St', lat: 30.2687, lng: -97.7384 },
        { name: 'Williams House', email: 'williams@email.com', phone: '512-555-0104', street: '1800 N Congress Ave', lat: 30.2847, lng: -97.7404 },
        { name: 'Brown Property', email: 'brown@email.com', phone: '512-555-0105', street: '3500 Guadalupe St', lat: 30.2951, lng: -97.7385 },
        { name: 'Davis Estate', email: 'davis@email.com', phone: '512-555-0106', street: '1200 Barton Springs Rd', lat: 30.2614, lng: -97.7612 },
        { name: 'Miller Place', email: 'miller@email.com', phone: '512-555-0107', street: '4500 S Congress Ave', lat: 30.2198, lng: -97.7631 },
        { name: 'Wilson Manor', email: 'wilson@email.com', phone: '512-555-0108', street: '800 W 6th St', lat: 30.2702, lng: -97.7524 }
    ];

    const times = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30'];
    const appointmentIds = [];

    for (let i = 0; i < customers.length; i++) {
        const c = customers[i];

        // Check if customer exists
        let customerResult = db.exec(`SELECT id FROM customers WHERE email = '${c.email}'`);
        let customerId;

        if (customerResult.length === 0 || customerResult[0].values.length === 0) {
            // Insert customer
            db.run(`INSERT INTO customers (name, email, phone, status) VALUES (?, ?, ?, 'active')`,
                [c.name, c.email, c.phone]);
            customerResult = db.exec("SELECT last_insert_rowid() as id");
            customerId = customerResult[0].values[0][0];

            // Insert address with coordinates
            db.run(`INSERT INTO addresses (customer_id, street, city, state, zip, lat, lng, is_primary) VALUES (?, ?, 'Austin', 'TX', '78701', ?, ?, 1)`,
                [customerId, c.street, c.lat, c.lng]);

            console.log(`Created customer: ${c.name}`);
        } else {
            customerId = customerResult[0].values[0][0];
            console.log(`Customer exists: ${c.name}`);
        }

        // Get address ID
        const addressResult = db.exec(`SELECT id FROM addresses WHERE customer_id = ${customerId} LIMIT 1`);
        const addressId = addressResult[0]?.values[0][0];

        // Check if appointment exists for today
        const existingAppt = db.exec(`SELECT id FROM appointments WHERE customer_id = ${customerId} AND scheduled_date = '${today}'`);

        let appointmentId;
        if (existingAppt.length === 0 || existingAppt[0].values.length === 0) {
            // Insert appointment
            db.run(`INSERT INTO appointments (customer_id, address_id, service_id, scheduled_date, scheduled_time, status) VALUES (?, ?, ?, ?, ?, 'scheduled')`,
                [customerId, addressId, serviceId, today, times[i]]);
            const apptResult = db.exec("SELECT last_insert_rowid() as id");
            appointmentId = apptResult[0].values[0][0];
        } else {
            appointmentId = existingAppt[0].values[0][0];
        }

        appointmentIds.push(appointmentId);
    }

    console.log(`\nCreated/found ${appointmentIds.length} appointments for ${today}`);

    // Check if route exists
    const existingRoute = db.exec(`SELECT id FROM routes WHERE name = 'Austin Test Route' AND date = '${today}'`);

    let routeId;
    if (existingRoute.length === 0 || existingRoute[0].values.length === 0) {
        // Create route
        db.run(`INSERT INTO routes (name, date, status) VALUES ('Austin Test Route', ?, 'planned')`, [today]);
        const routeResult = db.exec("SELECT last_insert_rowid() as id");
        routeId = routeResult[0].values[0][0];

        // Add stops in NON-OPTIMAL order (zigzagging across the city)
        const nonOptimalOrder = [0, 6, 2, 4, 1, 7, 3, 5];

        for (let i = 0; i < nonOptimalOrder.length; i++) {
            db.run(`INSERT INTO route_stops (route_id, appointment_id, stop_order, status) VALUES (?, ?, ?, 'pending')`,
                [routeId, appointmentIds[nonOptimalOrder[i]], i + 1]);
        }

        console.log('Created test route with 8 stops in NON-OPTIMAL order');
    } else {
        routeId = existingRoute[0].values[0][0];
        console.log('Test route already exists');
    }

    // Save database
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    console.log('\nDatabase saved!');

    console.log('\n========================================');
    console.log('         TEST DATA READY');
    console.log('========================================');
    console.log(`Date: ${today}`);
    console.log(`Route: "Austin Test Route"`);
    console.log(`Stops: 8 (in non-optimal zigzag order)`);
    console.log('');
    console.log('To test:');
    console.log('1. Start server: cd server && node index-sqlite.js');
    console.log('2. Start client: cd client && npm run dev');
    console.log('3. Login: admin@test.com / test123');
    console.log('4. Go to Route Planner');
    console.log('5. Click "Austin Test Route"');
    console.log('6. Click "Optimize Route" button');
    console.log('');
    console.log('You should see distance savings when optimized!');
    console.log('========================================\n');

    db.close();
}

seed().catch(console.error);

import pg from 'pg';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.argv[2] || process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('Please provide DATABASE_URL as argument or environment variable');
    process.exit(1);
}

async function seed() {
    const pool = new pg.Pool({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await pool.query('SELECT NOW()');
        console.log('Connected to PostgreSQL database');
    } catch (err) {
        console.error('Failed to connect:', err.message);
        process.exit(1);
    }

    const today = new Date().toISOString().split('T')[0];
    console.log(`\nSeeding test data for: ${today}`);

    // Hash password for test user
    const hashedPassword = await bcrypt.hash('test123', 10);

    // Insert test admin user
    try {
        await pool.query(
            `INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4)
             ON CONFLICT (email) DO NOTHING`,
            ['admin@test.com', hashedPassword, 'Test Admin', 'admin']
        );
        console.log('Created/verified test admin user');
    } catch (e) {
        console.log('User:', e.message);
    }

    // Insert service
    try {
        const existingService = await pool.query("SELECT id FROM services WHERE name = 'Weekly Trash Pickup'");
        if (existingService.rows.length === 0) {
            await pool.query(
                `INSERT INTO services (name, description, price, is_recurring) VALUES ($1, $2, $3, $4)`,
                ['Weekly Trash Pickup', 'Standard weekly residential trash collection', 25.00, 1]
            );
        }
        console.log('Created/verified test service');
    } catch (e) {
        console.log('Service:', e.message);
    }

    // Get service ID
    const serviceResult = await pool.query("SELECT id FROM services WHERE name = 'Weekly Trash Pickup'");
    const serviceId = serviceResult.rows[0]?.id || 1;

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
        let customerResult = await pool.query('SELECT id FROM customers WHERE email = $1', [c.email]);
        let customerId;

        if (customerResult.rows.length === 0) {
            // Insert customer
            const insertResult = await pool.query(
                `INSERT INTO customers (name, email, phone, status) VALUES ($1, $2, $3, 'active') RETURNING id`,
                [c.name, c.email, c.phone]
            );
            customerId = insertResult.rows[0].id;

            // Insert address with coordinates
            await pool.query(
                `INSERT INTO addresses (customer_id, street, city, state, zip, lat, lng, is_primary) VALUES ($1, $2, 'Austin', 'TX', '78701', $3, $4, 1)`,
                [customerId, c.street, c.lat, c.lng]
            );

            console.log(`Created customer: ${c.name}`);
        } else {
            customerId = customerResult.rows[0].id;
            console.log(`Customer exists: ${c.name}`);
        }

        // Get address ID
        const addressResult = await pool.query('SELECT id FROM addresses WHERE customer_id = $1 LIMIT 1', [customerId]);
        const addressId = addressResult.rows[0]?.id;

        // Check if appointment exists for today
        const existingAppt = await pool.query(
            'SELECT id FROM appointments WHERE customer_id = $1 AND scheduled_date = $2',
            [customerId, today]
        );

        let appointmentId;
        if (existingAppt.rows.length === 0) {
            // Insert appointment
            const apptResult = await pool.query(
                `INSERT INTO appointments (customer_id, address_id, service_id, scheduled_date, scheduled_time, status)
                 VALUES ($1, $2, $3, $4, $5, 'scheduled') RETURNING id`,
                [customerId, addressId, serviceId, today, times[i]]
            );
            appointmentId = apptResult.rows[0].id;
        } else {
            appointmentId = existingAppt.rows[0].id;
        }

        appointmentIds.push(appointmentId);
    }

    console.log(`\nCreated/found ${appointmentIds.length} appointments for ${today}`);

    // Check if route exists
    const existingRoute = await pool.query(
        "SELECT id FROM routes WHERE name = 'Austin Test Route' AND date = $1",
        [today]
    );

    let routeId;
    if (existingRoute.rows.length === 0) {
        // Create route
        const routeResult = await pool.query(
            `INSERT INTO routes (name, date, status) VALUES ('Austin Test Route', $1, 'planned') RETURNING id`,
            [today]
        );
        routeId = routeResult.rows[0].id;

        // Add stops in NON-OPTIMAL order (zigzagging across the city)
        const nonOptimalOrder = [0, 6, 2, 4, 1, 7, 3, 5];

        for (let i = 0; i < nonOptimalOrder.length; i++) {
            await pool.query(
                `INSERT INTO route_stops (route_id, appointment_id, stop_order, status) VALUES ($1, $2, $3, 'pending')`,
                [routeId, appointmentIds[nonOptimalOrder[i]], i + 1]
            );
        }

        console.log('Created test route with 8 stops in NON-OPTIMAL order');
    } else {
        routeId = existingRoute.rows[0].id;
        console.log('Test route already exists');
    }

    console.log('\n========================================');
    console.log('         TEST DATA READY');
    console.log('========================================');
    console.log(`Date: ${today}`);
    console.log(`Route: "Austin Test Route"`);
    console.log(`Stops: 8 (in non-optimal zigzag order)`);
    console.log('');
    console.log('Login credentials:');
    console.log('  Email: admin@test.com');
    console.log('  Password: test123');
    console.log('========================================\n');

    await pool.end();
}

seed().catch(console.error);

import express from 'express';
import { authenticate, isDispatcher, isDriver } from '../middleware/auth.js';

const router = express.Router();

// Haversine formula - calculates distance between two lat/lng points in miles
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Calculate total distance for a sequence of stops
function calculateTotalDistance(stops) {
    let total = 0;
    for (let i = 0; i < stops.length - 1; i++) {
        total += haversineDistance(
            stops[i].lat, stops[i].lng,
            stops[i + 1].lat, stops[i + 1].lng
        );
    }
    return total;
}

// Nearest neighbor TSP algorithm
function nearestNeighborTSP(stops) {
    if (stops.length <= 1) return stops;

    const result = [];
    const remaining = [...stops];

    // Start with the first stop
    result.push(remaining.shift());

    while (remaining.length > 0) {
        const current = result[result.length - 1];
        let nearestIdx = 0;
        let nearestDist = Infinity;

        // Find nearest unvisited stop
        for (let i = 0; i < remaining.length; i++) {
            const dist = haversineDistance(
                current.lat, current.lng,
                remaining[i].lat, remaining[i].lng
            );
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestIdx = i;
            }
        }

        result.push(remaining.splice(nearestIdx, 1)[0]);
    }

    return result;
}



// Get all routes
router.get('/', authenticate, async (req, res) => {
    const db = req.app.locals.db;
    const { date, assigned_to, status } = req.query;

    let sql = `
        SELECT r.*, u.name as assigned_to_name,
               COUNT(rs.id) as stop_count,
               SUM(CASE WHEN rs.status = 'completed' THEN 1 ELSE 0 END) as completed_count
        FROM routes r
        LEFT JOIN users u ON u.id = r.assigned_to
        LEFT JOIN route_stops rs ON rs.route_id = r.id
        WHERE 1=1
    `;
    const params = [];

    if (date) {
        sql += ' AND r.date = ?';
        params.push(date);
    }
    if (assigned_to) {
        sql += ' AND r.assigned_to = ?';
        params.push(assigned_to);
    }
    if (status) {
        sql += ' AND r.status = ?';
        params.push(status);
    }

    sql += ' GROUP BY r.id, r.name, r.date, r.assigned_to, r.status, r.created_at, u.name ORDER BY r.date DESC, r.name';

    try {
        const routes = await db.prepare(sql).all(...params);
        res.json(routes);
    } catch (error) {
        console.error('Error fetching routes:', error);
        res.status(500).json({ error: 'Failed to fetch routes' });
    }
});

// Get single route with stops
router.get('/:id', authenticate, async (req, res) => {
    const db = req.app.locals.db;
    try {
        const route = await db.prepare(`
            SELECT r.*, u.name as assigned_to_name
            FROM routes r
            LEFT JOIN users u ON u.id = r.assigned_to
            WHERE r.id = ?
        `).get(req.params.id);

        if (!route) {
            return res.status(404).json({ error: 'Route not found' });
        }

        const stops = await db.prepare(`
            SELECT rs.*,
                   ap.scheduled_time,
                   c.name as customer_name, c.phone as customer_phone,
                   a.street, a.city, a.state, a.zip, a.lat, a.lng,
                   s.name as service_name
            FROM route_stops rs
            JOIN appointments ap ON ap.id = rs.appointment_id
            JOIN customers c ON c.id = ap.customer_id
            JOIN addresses a ON a.id = ap.address_id
            LEFT JOIN services s ON s.id = ap.service_id
            WHERE rs.route_id = ?
            ORDER BY rs.stop_order
        `).all(req.params.id);

        // Calculate total distance if stops have coordinates
        const stopsWithCoords = stops.filter(s => s.lat && s.lng);
        const totalDistance = stopsWithCoords.length > 1
            ? calculateTotalDistance(stopsWithCoords)
            : 0;

        res.json({ ...route, stops, totalDistance: Math.round(totalDistance * 10) / 10 });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch route' });
    }
});

// Optimize route stops
router.post('/:id/optimize', authenticate, isDispatcher, async (req, res) => {
    const db = req.app.locals.db;
    const routeId = req.params.id;

    try {
        // Fetch all stops with coordinates
        const stops = await db.prepare(`
            SELECT rs.*,
                   ap.scheduled_time,
                   c.name as customer_name, c.phone as customer_phone,
                   a.street, a.city, a.state, a.zip, a.lat, a.lng,
                   s.name as service_name
            FROM route_stops rs
            JOIN appointments ap ON ap.id = rs.appointment_id
            JOIN customers c ON c.id = ap.customer_id
            JOIN addresses a ON a.id = ap.address_id
            LEFT JOIN services s ON s.id = ap.service_id
            WHERE rs.route_id = ?
            ORDER BY rs.stop_order
        `).all(routeId);

        if (stops.length === 0) {
            return res.status(400).json({ error: 'No stops to optimize' });
        }

        // Separate stops with and without coordinates
        const stopsWithCoords = stops.filter(s => s.lat && s.lng);
        const stopsWithoutCoords = stops.filter(s => !s.lat || !s.lng);

        if (stopsWithCoords.length < 2) {
            return res.status(400).json({
                error: 'Need at least 2 stops with coordinates to optimize',
                stopsWithoutCoords: stopsWithoutCoords.length
            });
        }

        // Calculate distance before optimization
        const distanceBefore = calculateTotalDistance(stopsWithCoords);

        // Run nearest neighbor optimization
        const optimizedStops = nearestNeighborTSP(stopsWithCoords);

        // Calculate distance after optimization
        const distanceAfter = calculateTotalDistance(optimizedStops);

        // Update stop order in database
        for (let i = 0; i < optimizedStops.length; i++) {
            await db.prepare(
                'UPDATE route_stops SET stop_order = ? WHERE id = ?'
            ).run(i + 1, optimizedStops[i].id);
        }

        // Put stops without coordinates at the end
        for (let i = 0; i < stopsWithoutCoords.length; i++) {
            await db.prepare(
                'UPDATE route_stops SET stop_order = ? WHERE id = ?'
            ).run(optimizedStops.length + i + 1, stopsWithoutCoords[i].id);
        }

        // Fetch updated stops
        const updatedStops = await db.prepare(`
            SELECT rs.*,
                   ap.scheduled_time,
                   c.name as customer_name, c.phone as customer_phone,
                   a.street, a.city, a.state, a.zip, a.lat, a.lng,
                   s.name as service_name
            FROM route_stops rs
            JOIN appointments ap ON ap.id = rs.appointment_id
            JOIN customers c ON c.id = ap.customer_id
            JOIN addresses a ON a.id = ap.address_id
            LEFT JOIN services s ON s.id = ap.service_id
            WHERE rs.route_id = ?
            ORDER BY rs.stop_order
        `).all(routeId);

        res.json({
            message: 'Route optimized',
            stops: updatedStops,
            distanceBefore: Math.round(distanceBefore * 10) / 10,
            distanceAfter: Math.round(distanceAfter * 10) / 10,
            distanceSaved: Math.round((distanceBefore - distanceAfter) * 10) / 10,
            distanceUnit: 'miles',
            stopsWithoutCoords: stopsWithoutCoords.length
        });
    } catch (error) {
        console.error('Error optimizing route:', error);
        res.status(500).json({ error: 'Failed to optimize route' });
    }
});


// Create route
router.post('/', authenticate, isDispatcher, async (req, res) => {
    const { name, date, assigned_to, appointment_ids } = req.body;
    const db = req.app.locals.db;

    if (!name || !date) {
        return res.status(400).json({ error: 'Name and date are required' });
    }

    try {
        const result = await db.prepare(
            'INSERT INTO routes (name, date, assigned_to) VALUES (?, ?, ?)'
        ).run(name, date, assigned_to || null);

        // Add stops if appointment IDs provided
        if (appointment_ids && appointment_ids.length > 0) {
            for (let i = 0; i < appointment_ids.length; i++) {
                await db.prepare(
                    'INSERT INTO route_stops (route_id, appointment_id, stop_order) VALUES (?, ?, ?)'
                ).run(result.lastInsertRowid, appointment_ids[i], i + 1);
            }
        }

        res.status(201).json({
            id: result.lastInsertRowid,
            name,
            date,
            assigned_to,
            status: 'planned'
        });
    } catch (error) {
        console.error('Error creating route:', error);
        res.status(500).json({ error: 'Failed to create route' });
    }
});

// Add stops to route
router.post('/:id/stops', authenticate, isDispatcher, async (req, res) => {
    const { appointment_ids } = req.body;
    const db = req.app.locals.db;

    if (!appointment_ids || appointment_ids.length === 0) {
        return res.status(400).json({ error: 'Appointment IDs are required' });
    }

    try {
        // Get current max order
        const maxOrder = await db.prepare(
            'SELECT MAX(stop_order) as max FROM route_stops WHERE route_id = ?'
        ).get(req.params.id);
        let order = (maxOrder.max || 0) + 1;

        const inserted = [];
        for (const apptId of appointment_ids) {
            const result = await db.prepare(
                'INSERT INTO route_stops (route_id, appointment_id, stop_order) VALUES (?, ?, ?)'
            ).run(req.params.id, apptId, order++);
            inserted.push({ id: result.lastInsertRowid, appointment_id: apptId });
        }

        res.status(201).json(inserted);
    } catch (error) {
        console.error('Error adding stops:', error);
        res.status(500).json({ error: 'Failed to add stops' });
    }
});

// Reorder stops
router.put('/:id/stops/reorder', authenticate, isDispatcher, async (req, res) => {
    const { stop_order } = req.body; // Array of { stop_id, order }
    const db = req.app.locals.db;

    try {
        for (const item of stop_order) {
            await db.prepare(
                'UPDATE route_stops SET stop_order = ? WHERE id = ? AND route_id = ?'
            ).run(item.order, item.stop_id, req.params.id);
        }

        res.json({ message: 'Stops reordered' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reorder stops' });
    }
});

// Update stop status (drivers can do this)
router.patch('/:routeId/stops/:stopId', authenticate, isDriver, async (req, res) => {
    const { status, notes } = req.body;
    const db = req.app.locals.db;

    const validStatuses = ['pending', 'completed', 'skipped'];
    if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const updates = [];
        const params = [];

        if (status) {
            updates.push('status = ?');
            params.push(status);
            if (status === 'completed') {
                updates.push('completed_at = CURRENT_TIMESTAMP');
            }
        }
        if (notes !== undefined) {
            updates.push('notes = ?');
            params.push(notes);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No updates provided' });
        }

        params.push(req.params.stopId, req.params.routeId);

        const result = await db.prepare(`
            UPDATE route_stops SET ${updates.join(', ')}
            WHERE id = ? AND route_id = ?
        `).run(...params);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Stop not found' });
        }

        // Also update the appointment status if stop is completed
        if (status === 'completed') {
            const stop = await db.prepare('SELECT appointment_id FROM route_stops WHERE id = ?').get(req.params.stopId);
            if (stop) {
                await db.prepare("UPDATE appointments SET status = 'completed' WHERE id = ?").run(stop.appointment_id);
            }
        }

        res.json({ id: parseInt(req.params.stopId), status, notes });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update stop' });
    }
});

// Update route status
router.patch('/:id/status', authenticate, isDriver, async (req, res) => {
    const { status } = req.body;
    const db = req.app.locals.db;

    const validStatuses = ['planned', 'in_progress', 'completed'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const result = await db.prepare('UPDATE routes SET status = ? WHERE id = ?').run(status, req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Route not found' });
        }
        res.json({ id: parseInt(req.params.id), status });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update route status' });
    }
});

// Delete route
router.delete('/:id', authenticate, isDispatcher, async (req, res) => {
    const db = req.app.locals.db;

    try {
        const result = await db.prepare('DELETE FROM routes WHERE id = ?').run(req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Route not found' });
        }
        res.json({ message: 'Route deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete route' });
    }
});

export default router;

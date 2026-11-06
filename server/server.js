require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db'); 

const app = express();
app.use(cors());
app.use(express.json());

// 1. Directions dropdown
app.get('/api/directions', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM directions ORDER BY direction_id');
    console.log('Directions:', rows.length);
    res.json(rows);
  } catch (err) {
    console.error('Directions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. Buses by direction
app.get('/api/directions/:directionId/buses', async (req, res) => {
  try {
    const directionId = Number(req.params.directionId);
    const [rows] = await pool.query(`
      SELECT b.bus_id, b.bus_name, r.route_name, b.is_active, b.route_id,
             bl.status, bl.speed_kmh, bl.recorded_at AS last_update
      FROM buses b
      JOIN routes r ON r.route_id = b.route_id
      LEFT JOIN bus_location bl ON bl.bus_id = b.bus_id 
        AND bl.location_id = (
          SELECT MAX(location_id) FROM bus_location WHERE bus_id = b.bus_id
        )
      WHERE b.direction_id = ? AND b.is_active = 1
      ORDER BY b.bus_name
    `, [directionId]);
    console.log(`Direction ${directionId} buses:`, rows.length);
    res.json(rows);
  } catch (err) {
    console.error('Buses error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 3. ✅ FIXED: Route stops endpoint (SINGLE VERSION)
app.get('/api/routes/:routeId/stops', async (req, res) => {
  try {
    const routeId = req.params.routeId;
    console.log(`🔍 Route ${routeId} stops requested`);
    
    const [rows] = await pool.query(
      `SELECT stop_order, stop_name, lat, lng 
       FROM route_stops 
       WHERE route_id = ?
       ORDER BY stop_order ASC`,
      [routeId]
    );
    
    console.log(`✅ Route ${routeId}: ${rows.length} stops found`);
    res.json(rows);
  } catch (err) {
    console.error('❌ Route stops error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 4. Live info for selected bus
app.get('/api/buses/:busId', async (req, res) => {
  try {
    const busId = Number(req.params.busId);
    
    // Bus details
    const [busRows] = await pool.execute(`
      SELECT b.bus_id, b.bus_name, r.route_name, r.route_id, d.direction_name
      FROM buses b
      JOIN routes r ON r.route_id = b.route_id
      JOIN directions d ON d.direction_id = b.direction_id
      WHERE b.bus_id = ?
    `, [busId]);
    
    if (!busRows.length) return res.status(404).json({ error: 'Bus not found' });
    
    // Live GPS
    const [locationRows] = await pool.execute(`
      SELECT lat, lng, status, speed_kmh, recorded_at AS last_update
      FROM bus_location 
      WHERE bus_id = ? ORDER BY recorded_at DESC LIMIT 1
    `, [busId]);
    
    // Simple ETA
    const etaMinutes = locationRows.length ? Math.floor(Math.random() * 15) + 5 : null;
    
    res.json({
      bus: busRows[0],
      location: locationRows[0] || null,
      eta_minutes: etaMinutes,
      next_stop: 'Technical Faculty' // Static for now
    });
  } catch (err) {
    console.error('Bus info error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 5. All buses status
app.get('/api/buses/status', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.bus_id, b.bus_name, r.route_name, d.direction_name,
             bl.status, bl.speed_kmh, bl.recorded_at AS last_update,
             bl.lat, bl.lng
      FROM buses b
      JOIN routes r ON r.route_id = b.route_id
      JOIN directions d ON d.direction_id = b.direction_id
      LEFT JOIN bus_location bl ON bl.bus_id = b.bus_id 
        AND bl.location_id = (
          SELECT MAX(location_id) FROM bus_location WHERE bus_id = b.bus_id
        )
      WHERE b.is_active = 1
      ORDER BY d.direction_id, b.bus_name
    `);
    res.json(rows);
  } catch (err) {
    console.error('Status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 6. GPS update (Driver phone)
app.post('/api/buses/:busId/location', async (req, res) => {
  try {
    const busId = Number(req.params.busId);
    const { lat, lng, status, speed_kmh } = req.body;
    
    await pool.execute(
      `INSERT INTO bus_location (bus_id, lat, lng, status, speed_kmh)
       VALUES (?, ?, ?, ?, ?)`,
      [busId, lat, lng, status || 'Running', speed_kmh || null]
    );
    res.json({ message: 'GPS updated' });
  } catch (err) {
    console.error('GPS error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Test connection
(async () => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ping');
    console.log('✅ MySQL connected:', rows);
  } catch (err) {
    console.error('❌ DB connection failed:', err.message);
  }
})();


// ADD this endpoint after other routes, before app.listen
app.get('/api/notifications', async (req, res) => {
  try {
    // Simulate LIVE notifications (replace with real DB table later)
    const notifications = [
      {
        id: 1,
        title: "🛑 Mirpur14 - 15min delay", 
        message: "Traffic at Technical. Expected arrival: 6:00 AM",
        time: "5:33 AM",
        type: "delay",
        read: false  // ← UNREAD
      },
      {
        id: 2,
        title: "🔄 Kilgaon route changed",
        message: "Now via Shahjadpur due to roadwork (ETA +10min)",
        time: "5:28 AM", 
        type: "route_change",
        read: false  // ← UNREAD
      },
      {
        id: 3,
        title: "✅ Airport bus early",
        message: "Arrived JU Gate 10min ahead of schedule",
        time: "5:20 AM",
        type: "early",
        read: true   // ← READ
      }
    ];
    
    const unreadCount = notifications.filter(n => !n.read).length;
    
    res.json({
      notifications,
      unreadCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark notification as read
app.post('/api/notifications/:notifId/read', async (req, res) => {
  try {
    const notifId = Number(req.params.notifId);
    // Simulate marking as read (real DB UPDATE later)
    console.log(`✅ Notification ${notifId} marked as read`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ADD after GET /api/notifications
app.post('/api/notifications', async (req, res) => {
  try {
    const { title, message, type } = req.body;
    
    // TODO: Add admin auth check here
    console.log(`📢 ADMIN: New notification "${title}"`);
    
    // In real app: INSERT INTO notifications (title, message, type, is_read=0)
    res.json({ success: true, message: 'Notification sent!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




app.listen(process.env.PORT || 3000, () => {
  console.log(`🚍 API running on http://localhost:${process.env.PORT || 3000}`);
  console.log('📱 Test endpoints:');
  console.log('  → http://localhost:3000/api/directions');
  console.log('  → http://localhost:3000/api/routes/1/stops');
});

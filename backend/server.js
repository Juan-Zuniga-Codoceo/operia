// backend/server.js
// 🚀 SERVIDOR UNIFICADO OPERIA (PostgreSQL + Multi-tenant)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Database & Services
const pool = require('./db-postgres');
const { initializeWebSocket } = require('./services/websocket.service');
const { initScheduledJobs } = require('./jobs/in-app-jobs');

// Middleware
const { extractTenant } = require('./middleware/tenant.middleware');

// Routes
const authRoutes = require('./routes/auth.routes-postgres');
const clientsRoutes = require('./routes/clients.routes-postgres');
const labelsRoutes = require('./routes/labels.routes-postgres');
const categoriesRoutes = require('./routes/categories.routes-postgres');
const usersRoutes = require('./routes/users.routes-postgres');
const sheetsRoutes = require('./routes/sheets.routes-postgres');
const tasksRoutesPart1 = require('./routes/tasks.routes-postgres-PART1');
const tasksRoutesPart2 = require('./routes/tasks.routes-postgres-PART2');
const onboardingRoutes = require('./routes/onboarding.routes-postgres');
const adminRoutes = require('./routes/admin.routes-postgres');
const senderRoutes = require('./routes/sender.routes-postgres');
const senderRoutes = require('./routes/sender.routes-postgres');
const paymentsRoutes = require('./routes/payments.routes-postgres');
const tenantsRoutes = require('./routes/tenants.routes');

// App Initialization
const app = express();
const PORT = process.env.PORT || 4000; // PRODUCTION PORT
const HOST = process.env.HOST || '0.0.0.0';

// ======================================================
// ===               GLOBAL MIDDLEWARE                ===
// ======================================================

app.use(cors({
  origin: '*', // Allow all for now, tighten in future specific production check
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request Logger
app.use('/api/*', (req, res, next) => {
  const subdomain = req.get('host')?.split('.')[0] || 'no-subdomain';
  console.log(`📡 [${new Date().toISOString()}] [${subdomain}] ${req.method} ${req.originalUrl}`);
  next();
});

// ======================================================
// ===          STATIC FILES & FRONTEND              ===
// ======================================================

// Serve static assets
app.use('/css', express.static(path.join(__dirname, '..', 'frontend/css')));
app.use('/js', express.static(path.join(__dirname, '..', 'frontend/js')));
app.use('/assets', express.static(path.join(__dirname, '..', 'frontend/assets')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ======================================================
// ===             API ROUTE MOUNTING                ===
// ======================================================

// 1. Public Auth Routes (No Tenant Required) from auth.routes-postgres
//    Handles /login, /signup-tenant, /check-subdomain
app.use('/api/auth', authRoutes);

// 2. Tenant-Protected API Routes
//    All routes below /api (except auth) will require x-tenant-id or subdomain extraction
app.use('/api', extractTenant);

// 3. Mount Business Logic Routes
app.use('/api/clients', clientsRoutes);
app.use('/api/labels', labelsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/sender-config', senderRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/tenants', tenantsRoutes);

// 4. Users & Notifications (usersRoutes)
//    Mounds logic at /api/users, /api/notifications, etc.
//    Ensure 'usersRoutes' defines router.get('/users'...) etc.
app.use('/api', usersRoutes);

// 5. Tasks (Split into Parts 1 & 2)
//    Mounts logic at /api/tasks, /api/tasks/:id/comments, etc.
app.use('/api', tasksRoutesPart1);
app.use('/api', tasksRoutesPart2);


// ======================================================
// ===          FRONTEND HTML ROUTES (SPA)           ===
// ======================================================

const sendHtml = (file) => (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', file));

// Public
app.get('/', (req, res) => {
  const host = req.get('host') || '';
  const subdomain = host.split('.')[0];
  const reserved = ['www', 'app', 'api', 'admin', 'localhost', '127'];

  // If reserved or IP or no subdomain -> Landing Page
  if (!subdomain || reserved.includes(subdomain) || !host.includes('.')) {
    return res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
  }
  // Otherwise -> Login Page (Tenant Access)
  return res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html'));
});

app.get('/signup', sendHtml('signup.html'));
app.get('/pricing', sendHtml('pricing.html'));
app.get('/onboarding', sendHtml('onboarding.html'));
app.get('/accept-invitation', sendHtml('accept-invitation.html'));
app.get('/payment-result', sendHtml('payment-result.html'));

// App Pages (Require Auth via JS)
app.get('/login', sendHtml('login.html'));
app.get('/tablero', sendHtml('tablero.html'));
app.get('/perfil', sendHtml('perfil.html'));
app.get('/archivadas', sendHtml('archivadas.html'));
app.get('/registro', sendHtml('registro.html')); // User registration inside tenant
app.get('/admin', sendHtml('admin.html'));
app.get('/fichas', sendHtml('fichas.html'));

// ======================================================
// ===             ERROR HANDLING                    ===
// ======================================================

// 404
app.use((req, res) => {
  if (req.accepts('json')) {
    res.status(404).json({ error: 'Ruta no encontrada' });
  } else {
    res.status(404).send('404 Not Found');
  }
});

// 500
app.use((err, req, res, next) => {
  console.error(`❌ [SERVER ERROR] ${err.stack}`);
  res.status(500).json({ error: 'Error interno del servidor', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
});

// ======================================================
// ===            START SERVER                       ===
// ======================================================

const server = app.listen(PORT, HOST, async () => {
  console.log('\n==================================================');
  console.log(`🚀 OPERIA SERVER RUNNING (Unified)`);
  console.log(`🌐 URL: http://${HOST}:${PORT}`);
  console.log(`📊 DB:  PostgreSQL`);
  console.log('==================================================\n');

  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ DB Connected:', result.rows[0].now);
  } catch (err) {
    console.error('❌ DB Connection Failed:', err.message);
  }

  // Init Services
  initializeWebSocket(server);
  initScheduledJobs();
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM signal received: closing HTTP server');
  server.close(() => {
    pool.end(() => {
      console.log('✅ Server and DB poll closed');
    });
  });
});

module.exports = app;
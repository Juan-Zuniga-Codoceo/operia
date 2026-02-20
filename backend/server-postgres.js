// backend/server-postgres.js
// PostgreSQL Multi-tenant version of Operia
const path = require('path');
const dotenv = require('dotenv');

// Cargar variables de entorno según NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
dotenv.config({ path: path.join(__dirname, '..', envFile) });
// Fallback para cargar .env si faltan variables (ej: credenciales locales)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const fs = require('fs');

// PostgreSQL database initialization
const pool = require('./db-postgres');

// WebSocket service
const { initializeWebSocket } = require('./services/websocket.service');

// Middleware
const { extractTenant, optionalTenant } = require('./middleware/tenant.middleware');

// --- PostgreSQL Routes ---
const authRoutes = require('./routes/auth.routes-postgres');
const clientsRoutes = require('./routes/clients.routes-postgres');
const labelsRoutes = require('./routes/labels.routes-postgres');
const categoriesRoutes = require('./routes/categories.routes-postgres');
const usersRoutes = require('./routes/users.routes-postgres');
const sheetsRoutes = require('./routes/sheets.routes-postgres');

// Tasks - Part 1 (CRUD) and Part 2 (Comments & Attachments)
const tasksRoutesPart1 = require('./routes/tasks.routes-postgres-PART1');
const tasksRoutesPart2 = require('./routes/tasks.routes-postgres-PART2');

// Onboarding wizard
const onboardingRoutes = require('./routes/onboarding.routes-postgres');

// Admin and sender routes (PostgreSQL)
const adminRoutes = require('./routes/admin.routes-postgres');
const senderRoutes = require('./routes/sender.routes-postgres');

// Scheduled jobs
const { initScheduledJobs } = require('./jobs/in-app-jobs');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ======================================================
// ===               GLOBAL MIDDLEWARE                ===
// ======================================================

app.use(cors({
    origin: '*', // For development. In production, restrict to your domains
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use('/api/*', (req, res, next) => {
    const subdomain = req.get('host')?.split('.')[0] || 'no-subdomain';
    console.log(`📦 [${subdomain}] ${req.method} ${req.originalUrl}`);
    next();
});

// ======================================================
// ===          STATIC FILES & FRONTEND              ===
// ======================================================

// Serve static files
app.use('/css', express.static(path.join(__dirname, '..', 'frontend/css')));
app.use('/js', express.static(path.join(__dirname, '..', 'frontend/js')));
app.use('/assets', express.static(path.join(__dirname, '..', 'frontend/assets')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ======================================================
// ===          PUBLIC ROUTES (NO TENANT)            ===
// ======================================================

// Public auth routes (signup, check-subdomain) don't require tenant
// Mount BEFORE the global extractTenant middleware
app.use('/api/auth', authRoutes);  // This will handle /signup-tenant and /check-subdomain

// Public landing page
app.get('/', (req, res) => {
    // Check if subdomain exists
    const host = req.get('host') || '';
    const subdomain = host.split('.')[0];

    // Reserved subdomains go to landing page
    const reserved = ['www', 'app', 'api', 'admin', 'localhost'];

    if (!subdomain || reserved.includes(subdomain) || !host.includes('.')) {
        // Show landing page for non-tenant domains
        return res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
    }

    // Tenant subdomains go to login
    return res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html'));
});

// Explicit signup route
app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'signup.html'));
});

// Accept invitation route
app.get('/accept-invitation', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'accept-invitation.html'));
});

// Onboarding wizard route
app.get('/onboarding', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'onboarding.html'));
});

// Pricing page route
app.get('/pricing', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'pricing.html'));
});

// Payment result page route
app.get('/payment-result', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'payment-result.html'));
});

// ======================================================
// ===      TENANT-REQUIRED ROUTES (ALL API)         ===
// ======================================================

// Apply tenant extraction middleware to ALL other /api routes (except those already mounted)
app.use('/api', extractTenant);

// Mount remaining routes (tenant-aware) - authRoutes already mounted above for public routes
app.use('/api/clients', clientsRoutes); // Client management
app.use('/api/labels', labelsRoutes);   // Task labels
app.use('/api/categories', categoriesRoutes); // Categories for sheets
app.use('/api', usersRoutes);          // Users, profile, notifications
app.use('/api/sheets', sheetsRoutes);  // Technical sheets (PDFs)
app.use('/api', tasksRoutesPart1);     // Tasks CRUD
app.use('/api', tasksRoutesPart2);     // Tasks comments & attachments
app.use('/api', onboardingRoutes);     // Onboarding wizard

// Mount admin and sender routes (PostgreSQL with tenant isolation)
app.use('/api/admin', adminRoutes);
app.use('/api/sender-config', senderRoutes);

// Payment routes (Flow integration)
const paymentsRoutes = require('./routes/payments.routes-postgres');
app.use('/api/payments', paymentsRoutes);

// ======================================================
// ===          FRONTEND HTML ROUTES                 ===
// ======================================================

// These require authentication via frontend JS, tenant is in subdomain
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html')));
app.get('/tablero', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'tablero.html')));
app.get('/perfil', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'perfil.html')));
app.get('/archivadas', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'archivadas.html')));
app.get('/registro', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'registro.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'admin.html')));

// ======================================================
// ===             ERROR HANDLING                    ===
// ======================================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('❌ Error no controlado:', err.stack);

    // Handle multer errors
    if (err.message && err.message.includes('archivo')) {
        return res.status(400).json({ error: err.message });
    }

    res.status(500).json({ error: 'Error interno del servidor' });
});

// ======================================================
// ===            START SERVER                       ===
// ======================================================

const server = app.listen(PORT, HOST, async () => {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║                                                      ║');
    console.log('║           🚀 OPERIA SaaS - PostgreSQL Mode           ║');
    console.log('║                                                      ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`🌐 Server:        http://${HOST}:${PORT}`);
    console.log(`🏢 Signup:        http://localhost:${PORT}/signup`);
    console.log(`📊 Database:      PostgreSQL (${process.env.DATABASE_URL?.split('@')[1] || 'configured'})`);
    console.log(`🔐 JWT Secret:    ${process.env.JWT_SECRET ? '✓ Set' : '✗ MISSING'}`);
    console.log(`🌍 App Domain:    ${process.env.APP_DOMAIN || 'localhost'}`);
    console.log('');
    console.log('📁 Converted Routes (PostgreSQL + Tenant Isolation):');
    console.log('   ✅ /api/auth              - Authentication & Signup');
    console.log('   ✅ /api/clients           - Client Management');
    console.log('   ✅ /api/labels            - Task Labels');
    console.log('   ✅ /api/categories        - Sheet Categories');
    console.log('   ✅ /api/users             - User Management');
    console.log('   ✅ /api/notifications     - Notifications');
    console.log('   ✅ /api/sheets            - Technical Sheets (PDF)');
    console.log('   ✅ /api/tasks             - Tasks (CRUD, comments, attachments)');
    console.log('   ✅ /api/onboarding        - Onboarding Wizard');
    console.log('   ✅ /api/admin             - Admin Panel (User Management)');
    console.log('   ✅ /api/sender-config     - Sender Configuration');
    console.log('   ✅ /api/payments          - Payment Gateway (Flow)');
    console.log('');
    console.log('🎉 ALL ROUTES CONVERTED TO POSTGRESQL! (11/11 - 100%)');
    console.log('');
    console.log('🧪 Testing Instructions:');
    console.log('   1. Add to /etc/hosts:');
    console.log('      127.0.0.1  demo.localhost');
    console.log('      127.0.0.1  testcorp.localhost');
    console.log('   2. Navigate to: http://localhost:3000/signup');
    console.log('   3. Create tenant with subdomain "demo"');
    console.log('   4. Access: http://demo.localhost:3000');
    console.log('');

    // Test database connection
    try {
        const result = await pool.query('SELECT NOW()');
        console.log('✅ PostgreSQL Connected:', result.rows[0].now);
    } catch (err) {
        console.error('❌ PostgreSQL Connection Failed:', err.message);
        console.error('   Check your DATABASE_URL in .env file');
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    // Initialize WebSocket
    initializeWebSocket(server);

    // Initialize scheduled jobs
    initScheduledJobs();
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, closing server gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        pool.end(() => {
            console.log('✅ PostgreSQL pool closed');
            process.exit(0);
        });
    });
});

module.exports = app; // For testing

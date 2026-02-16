// backend/server.js (Versión refactorizada)
require('dotenv').config();

// --- INICIO DEL CÓDIGO DE DIAGNÓSTICO (ELIMINADO) ---


const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// <-- NUEVO: Importamos nuestro servicio de WebSocket
const { initializeWebSocket } = require('./services/websocket.service');

// --- Importar Routers ---
const authRoutes = require('./routes/auth.routes');
const tasksRoutes = require('./routes/tasks.routes');
const usersRoutes = require('./routes/users.routes');
const { initScheduledJobs } = require('./jobs/in-app-jobs');
const adminRoutes = require('./routes/admin.routes.js');
const categoriesRoutes = require('./routes/categories.routes-postgres.js');
const sheetsRoutes = require('./routes/sheets.routes-postgres.js');
const clientsRoutes = require('./routes/clients.routes-postgres.js');
const senderRoutes = require('./routes/sender.routes.js');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Middlewares y configuración de rutas
app.use(cors());
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use('/api/*', (req, res, next) => {
  console.log(`📦 API Request: ${req.method} ${req.originalUrl}`);
  next();
});
// Servir archivos estáticos de forma explícita para evitar conflictos
app.use('/css', express.static(path.join(__dirname, '..', 'frontend/css')));
app.use('/js', express.static(path.join(__dirname, '..', 'frontend/js')));
app.use('/assets', express.static(path.join(__dirname, '..', 'frontend/assets')));
// Esta línea es un fallback para archivos en la raíz como manifest.json o el favicon
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/api', authRoutes);
app.use('/api', tasksRoutes);
app.use('/api', usersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/sender-config', senderRoutes);
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html')));

// Rutas amigables para servir los archivos HTML principales
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html')));
app.get('/tablero', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'tablero.html')));
app.get('/perfil', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'perfil.html')));
app.get('/archivadas', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'archivadas.html')));
app.get('/registro', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'registro.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'admin.html')));


app.use((err, req, res, next) => {
  console.error('Error no controlado:', err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// === INICIAR SERVIDOR ===
const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Operia corriendo en http://${HOST}:${PORT}`);

  // Inicia el WebSocket Server
  initializeWebSocket(server);

  // Inicia nuestras tareas programadas internas
  initScheduledJobs(); // 
});
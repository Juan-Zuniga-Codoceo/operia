// start-server.js - Script de inicio optimizado para producción
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Se usa la variable de entorno de Render si existe, si no, se usa la carpeta local 'backend'.
// Esto asegura que la verificación se haga en el disco persistente en producción.
const dataDir = process.env.RENDER_DISK_MOUNT_PATH || path.join(__dirname, 'backend');
const dbPath = path.join(dataDir, 'database.sqlite');

// Verificar que la base de datos existe en la ubicación correcta
if (!fs.existsSync(dbPath)) {
  console.log(`⚠️  Base de datos no encontrada en ${dbPath}. Creando base de datos inicial...`);
  // Ejecutar el script de inicialización de la base de datos
  require('./backend/db.js');
}

// Configurar variables de entorno para producción
process.env.NODE_ENV = 'production';
process.env.HOST = '0.0.0.0';
process.env.PORT = process.env.PORT || 3000;

console.log('🚀 Iniciando Operia en modo producción...');
console.log(`📂 Directorio de trabajo: ${__dirname}`);
console.log(`💾 Directorio de datos: ${dataDir}`);
console.log(`🌐 Host: ${process.env.HOST}`);
console.log(`🔄 Puerto: ${process.env.PORT}`);

// Iniciar el servidor
const server = spawn('node', ['backend/server.js'], {
  stdio: 'inherit',
  cwd: __dirname
});

server.on('error', (err) => {
  console.error('❌ Error al iniciar el servidor:', err);
  process.exit(1);
});

server.on('close', (code) => {
  console.log(`🔴 Servidor cerrado con código: ${code}`);
});
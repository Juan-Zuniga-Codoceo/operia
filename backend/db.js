const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

const dbDir = process.env.RENDER_DISK_MOUNT_PATH || __dirname;
const dbPath = path.join(dbDir, 'database.sqlite');

let db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error al conectar con la base de datos:', err.message);
    process.exit(1);
  } else {
    console.log(`✅ Conexión a la base de datos establecida en: ${dbPath}`);
  }
});

db.configure('busyTimeout', 5000);
db.run("PRAGMA foreign_keys = ON", (err) => {
  if (err) console.error('❌ Error al activar foreign keys:', err.message);
  else console.log('✅ Foreign keys activadas');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    office TEXT,
    role TEXT DEFAULT 'user',
    avatar_url TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    reset_token TEXT,
    reset_token_expires INTEGER,
    email_notifications INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1
  )`, (err) => {
    if (err) console.error('❌ Error al crear tabla users:', err.message);
    else {
      db.run("ALTER TABLE users ADD COLUMN email_notifications INTEGER DEFAULT 1", () => { });
      db.run("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1", () => { });
      console.log('✅ Tabla users lista');
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS sequences (
    prefix TEXT PRIMARY KEY,
    last_number INTEGER DEFAULT 0
  )`, (err) => {
    if (err) console.error('❌ Error al crear tabla sequences:', err.message);
    else console.log('✅ Tabla sequences lista');
  });

  db.run(`CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rut TEXT UNIQUE,
    name TEXT,
    email TEXT,
    phone TEXT,
    address_street TEXT,
    commune TEXT,
    region TEXT,
    reference TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`, (err) => {
    if (err) console.error('❌ Error al crear tabla clients:', err.message);
    else {
      db.run("ALTER TABLE clients ADD COLUMN reference TEXT", () => { });
      console.log('✅ Tabla clients lista');
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    priority TEXT DEFAULT 'media',
    status TEXT DEFAULT 'pendiente',
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    completed_at TEXT,
    is_archived INTEGER DEFAULT 0,
    responsible_user_id INTEGER,
    human_id TEXT,
    origin TEXT,
    shipping_type TEXT,
    payment_status TEXT,
    client_snapshot TEXT,
    client_reference TEXT,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL
  )`, (err) => {
    if (err) console.error('❌ Error al crear tabla tasks:', err.message);
    else {
      const columnsToAdd = [
        "ALTER TABLE tasks ADD COLUMN is_archived INTEGER DEFAULT 0",
        "ALTER TABLE tasks ADD COLUMN responsible_user_id INTEGER",
        "ALTER TABLE tasks ADD COLUMN human_id TEXT",
        "ALTER TABLE tasks ADD COLUMN origin TEXT",
        "ALTER TABLE tasks ADD COLUMN shipping_type TEXT",
        "ALTER TABLE tasks ADD COLUMN payment_status TEXT",
        "ALTER TABLE tasks ADD COLUMN client_snapshot TEXT",
        "ALTER TABLE tasks ADD COLUMN client_reference TEXT",
        "ALTER TABLE tasks ADD COLUMN observer_user_id INTEGER" // Added observer_user_id here
      ];

      columnsToAdd.forEach(sql => {
        db.run(sql, (err) => {
          // Ignorar error si la columna ya existe
          if (err && !err.message.includes("duplicate column name")) {
            console.error(`❌ Error al ejecutar: ${sql}`, err.message);
          }
        });
      });

      console.log('✅ Tabla tasks lista y actualizada');
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#006837',
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`, (err) => {
    if (err) console.error('❌ Error al crear tabla labels:', err.message);
    else console.log('✅ Tabla labels lista');
  });

  db.run(`CREATE TABLE IF NOT EXISTS task_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    user_id INTEGER,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(task_id, user_id)
  )`, (err) => {
    if (err) console.error('❌ Error al crear tabla task_assignments:', err.message);
    else console.log('✅ Tabla task_assignments lista');
  });

  db.run(`CREATE TABLE IF NOT EXISTS task_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    label_id INTEGER,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (label_id) REFERENCES labels(id),
    UNIQUE(task_id, label_id)
  )`, (err) => {
    if (err) console.error('❌ Error al crear tabla task_labels:', err.message);
    else console.log('✅ Tabla task_labels lista');
  });

  db.run(`CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    comment_id INTEGER,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER DEFAULT 0,
    uploaded_by INTEGER,
    uploaded_at TEXT DEFAULT (datetime('now', 'localtime')),
    attachment_type TEXT DEFAULT 'general',
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
  )`, (err) => {
    if (err) console.error('❌ Error al crear tabla attachments:', err.message);
    else {
      db.run("ALTER TABLE attachments ADD COLUMN attachment_type TEXT DEFAULT 'general'", () => { });
      console.log('✅ Tabla attachments lista');
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    contenido TEXT NOT NULL,
    autor_id INTEGER,
    fecha_creacion TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (autor_id) REFERENCES users(id)
  )`, (err) => {
    if (err) console.error('❌ Error al crear tabla comments:', err.message);
    else console.log('✅ Tabla comments lista');
  });

  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    mensaje TEXT NOT NULL,
    leida INTEGER DEFAULT 0,
    tipo TEXT DEFAULT 'info',
    task_id INTEGER,
    fecha_creacion TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (usuario_id) REFERENCES users(id)
  )`, (err) => {
    if (err) console.error('❌ Error al crear tabla notifications:', err.message);
    else {
      db.run("ALTER TABLE notifications ADD COLUMN task_id INTEGER", () => { });
      console.log('✅ Tabla notifications lista');
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  )`, (err) => {
    if (err) console.error('❌ Error al crear tabla categories:', err.message);
    else console.log('✅ Tabla categories lista');
  });

  db.run(`CREATE TABLE IF NOT EXISTS technical_sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT NOT NULL,
    model TEXT,
    sku TEXT, -- <-- AÑADIR ESTA LÍNEA
    category_id INTEGER,
    tags TEXT,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    uploaded_by INTEGER,
    uploaded_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
  )`, (err) => {
    if (err) console.error('❌ Error al crear tabla technical_sheets:', err.message);
    else {
      db.run("ALTER TABLE technical_sheets ADD COLUMN sku TEXT", () => { });
      console.log('✅ Tabla technical_sheets lista');
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS sender_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    rut TEXT,
    address TEXT,
    commune TEXT,
    region TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    contact_person TEXT,
    contact_rut TEXT,
    thank_you_message TEXT,
    logo_path TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`, (err) => {
    if (err) console.error('❌ Error al crear tabla sender_config:', err.message);
    else console.log('✅ Tabla sender_config lista');
  });

  const defaultPassword = bcrypt.hashSync('1234', 10);
  db.run(
    `INSERT OR IGNORE INTO users (name, email, password, office, role) VALUES (?, ?, ?, ?, ?)`,
    ['Admin', 'admin@operia.cl', defaultPassword, 'Valparaíso', 'admin'],
    function (err) {
      if (err) console.error('❌ Error al insertar usuario admin:', err.message);
      else if (this.changes > 0) console.log('✅ Usuario admin creado: admin@operia.cl / contraseña: 1234');
      else console.log('ℹ️  El usuario admin ya existe');
    }
  );

  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_attachments_task_id ON attachments(task_id)`);
  console.log('✅ Índices creados para mejor rendimiento');
});

module.exports = db;

